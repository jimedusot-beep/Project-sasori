import { validateRecord, recordId, MAX_RECORDS, MAX_TOTAL_BYTES } from './records.js';
const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Storage request failed.'));
  });
const completed = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = tx.onerror = () => reject(tx.error || new Error('Storage transaction failed.'));
  });
export class ResearchStore {
  constructor({ indexedDB = globalThis.indexedDB, name = 'sasori-laboratory' } = {}) {
    this.factory = indexedDB;
    this.name = name;
    this.db = null;
    this.memory = new Map();
    this.settings = {};
    this.persistent = false;
    this.warning = '';
    this.corrupt = [];
    this.writeQueue = Promise.resolve();
    this.closed = false;
  }
  async open() {
    if (!this.factory) {
      this.warning = 'IndexedDB unavailable. Temporary memory only; export before closing.';
      return this;
    }
    try {
      this.db = await new Promise((resolve, reject) => {
        const req = this.factory.open(this.name, 2);
        let expired = false;
        const timer = setTimeout(() => {
          expired = true;
          reject(new Error('Storage is blocked by another tab.'));
        }, 4000);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains('records'))
            db.createObjectStore('records', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
          // v1 used a sessions store. Copy through the versioned session validator.
          if (db.objectStoreNames.contains('sessions')) {
            const cursor = req.transaction.objectStore('sessions').openCursor();
            cursor.onsuccess = () => {
              const item = cursor.result;
              if (!item) return;
              try {
                req.transaction.objectStore('records').put(validateRecord(item.value));
              } catch {
                /* Keep original v1 data intact for recovery. */
              }
              item.continue();
            };
          }
        };
        req.onerror = () => {
          clearTimeout(timer);
          reject(req.error);
        };
        req.onblocked = () => {
          expired = true;
          clearTimeout(timer);
          reject(new Error('Close other Sasori tabs to upgrade storage.'));
        };
        // Mark a request abandoned after rejection; a late success must not leave a DB open.
        req.onsuccess = () => {
          clearTimeout(timer);
          if (expired) req.result.close();
          else resolve(req.result);
        };
      });
      this.persistent = true;
      this.db.onversionchange = () => {
        this.db.close();
        this.db = null;
        this.closed = true;
        this.warning = 'Storage changed in another tab. Reload before editing saved records.';
      };
    } catch (error) {
      this.warning =
        'Storage could not open: ' +
        error.message +
        ' Temporary memory only; export before closing.';
    }
    return this;
  }
  async rawRecords() {
    if (this.closed) throw new Error(this.warning);
    if (!this.persistent) return [...this.memory.values()];
    const tx = this.db.transaction('records', 'readonly');
    return request(tx.objectStore('records').getAll());
  }
  async list() {
    const rows = await this.rawRecords();
    this.corrupt = [];
    return rows
      .flatMap((r) => {
        try {
          return [validateRecord(r)];
        } catch (error) {
          this.corrupt.push({ id: r?.id, error: error.message });
          return [];
        }
      })
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  saveMany(records) {
    const clean = records.map(validateRecord);
    this.writeQueue = this.writeQueue.catch(() => {}).then(() => this.commitRecords(clean));
    return this.writeQueue;
  }
  async commitRecords(records) {
    const clean = records.map(validateRecord);
    if (this.closed) throw new Error(this.warning);
    function merge(current) {
      const merged = new Map(current.map((r) => [r.id, r]));
      for (const r of clean) merged.set(r.id, r);
      if (merged.size > MAX_RECORDS)
        throw new Error(
          '50-record limit reached. Export a backup, then delete records you no longer need.',
        );
      if (
        new TextEncoder().encode(JSON.stringify([...merged.values()])).byteLength > MAX_TOTAL_BYTES
      )
        throw new Error(
          '8 MB storage budget reached. Export a backup before deleting old records.',
        );
      return merged;
    }
    if (!this.persistent) {
      this.memory = merge([...this.memory.values()]);
      return;
    }
    // Capacity check and writes share one transaction, including concurrent tabs.
    const tx = this.db.transaction('records', 'readwrite');
    const done = completed(tx);
    try {
      merge(await request(tx.objectStore('records').getAll()));
      for (const r of clean) tx.objectStore('records').put(r);
    } catch (error) {
      tx.abort();
      await done.catch(() => {});
      throw error;
    }
    await done;
  }
  save(record) {
    return this.saveMany([record]);
  }
  async importCopies(records) {
    // Imported copies receive fresh IDs; an import can never silently replace an existing experiment.
    return this.saveMany(
      records.map((r) => ({
        ...r,
        id: recordId(),
        importedAt: new Date().toISOString(),
        title: ('Imported · ' + r.title).slice(0, 180),
      })),
    );
  }
  async remove(id) {
    if (!this.persistent) {
      this.memory.delete(id);
      return;
    }
    const tx = this.db.transaction('records', 'readwrite');
    const done = completed(tx);
    tx.objectStore('records').delete(id);
    await done;
  }
  async getSettings() {
    if (!this.persistent) return this.settings;
    return (
      (await request(
        this.db.transaction('settings', 'readonly').objectStore('settings').get('preferences'),
      )) || {}
    );
  }
  async setSettings(value) {
    if (!this.persistent) {
      this.settings = structuredClone(value);
      return;
    }
    const tx = this.db.transaction('settings', 'readwrite');
    const done = completed(tx);
    tx.objectStore('settings').put(value, 'preferences');
    await done;
  }
}
