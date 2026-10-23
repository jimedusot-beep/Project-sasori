import {
  validateRecord,
  recordId,
  recordDataBytes,
  MAX_RECORDS,
  MAX_TOTAL_BYTES,
} from './records.js';
import { validateToy, MAX_TOYS } from './toys.js';
import { emptyControlSetups, validateControlSetups } from './control-setups.js';
import { validateTrials } from './action-trials.js';
import { validateDiscovery, MAX_DISCOVERIES, MAX_DISCOVERY_BYTES } from './discovery.js';
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
    this.toys = new Map();
    this.discoveries = new Map();
    this.settings = {};
    this.controlSetups = emptyControlSetups();
    this.actionTrials = [];
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
        const req = this.factory.open(this.name, 4);
        let expired = false;
        const timer = setTimeout(() => {
          expired = true;
          reject(new Error('Storage is blocked by another tab.'));
        }, 4000);
        req.onupgradeneeded = (event) => {
          const db = req.result;
          if (!db.objectStoreNames.contains('records'))
            db.createObjectStore('records', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
          if (!db.objectStoreNames.contains('toys'))
            db.createObjectStore('toys', { keyPath: 'id' });
          if (!db.objectStoreNames.contains('discoveries'))
            db.createObjectStore('discoveries', { keyPath: 'id' });
          // v1 used a sessions store. Copy through the versioned session validator.
          if (event.oldVersion < 2 && db.objectStoreNames.contains('sessions')) {
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
      const dataBytes = [...merged.values()].reduce(
        (bytes, record) => bytes + recordDataBytes(record),
        merged.size + 1, // Array brackets and separators.
      );
      if (dataBytes > MAX_TOTAL_BYTES)
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
      })),
    );
  }
  remove(id) {
    // Preserve invocation order with queued saves; otherwise an older save can resurrect a deletion.
    this.writeQueue = this.writeQueue.catch(() => {}).then(() => this.deleteRecord(id));
    return this.writeQueue;
  }
  async deleteRecord(id) {
    if (this.closed) throw new Error(this.warning);
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
  async getControlSetups() {
    if (this.closed) throw new Error(this.warning);
    if (!this.persistent) return structuredClone(this.controlSetups);
    const value = await request(
      this.db.transaction('settings', 'readonly').objectStore('settings').get('standard-controls'),
    );
    return value ? validateControlSetups(value) : emptyControlSetups();
  }
  async setControlSetups(value) {
    if (this.closed) throw new Error(this.warning);
    const clean = validateControlSetups(value);
    const next = { ...clean, revision: clean.revision + 1 };
    if (!this.persistent) {
      if (this.controlSetups.revision !== clean.revision)
        throw new Error('Saved controls changed in another window. Reload before saving.');
      this.controlSetups = structuredClone(next);
      return next;
    }
    const tx = this.db.transaction('settings', 'readwrite');
    const done = completed(tx);
    // Attach the rejection handler before a revision conflict can abort this transaction.
    done.catch(() => {});
    const target = tx.objectStore('settings');
    const existing = await request(target.get('standard-controls'));
    if ((existing?.revision ?? 0) !== clean.revision) {
      tx.abort();
      await done.catch(() => {});
      throw new Error('Saved controls changed in another window. Reload before saving.');
    }
    target.put(next, 'standard-controls');
    await done;
    return next;
  }
  async getActionTrials() {
    if (this.closed) throw new Error(this.warning);
    if (!this.persistent) return structuredClone(this.actionTrials);
    const rows = await request(
      this.db.transaction('settings', 'readonly').objectStore('settings').get('action-trials'),
    );
    return validateTrials(rows || []);
  }
  async removeActionTrial(id) {
    if (!/^trial-[\w-]{1,36}$/.test(id)) throw new Error('Invalid action trial ID.');
    return this.saveActionTrials([], { removeId: id });
  }
  async saveActionTrials(rows, { removeId = '' } = {}) {
    if (removeId && !/^trial-[\w-]{1,36}$/.test(removeId))
      throw new Error('Invalid action trial ID.');
    const clean = validateTrials(rows);
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        if (this.closed) throw new Error(this.warning);
        if (!this.persistent) {
          const merged = new Map(this.actionTrials.map((r) => [r.id, r]));
          merged.delete(removeId);
          for (const row of clean) merged.set(row.id, row);
          this.actionTrials = validateTrials([...merged.values()]);
          return;
        }
        const tx = this.db.transaction('settings', 'readwrite'),
          done = completed(tx);
        done.catch(() => {});
        try {
          const target = tx.objectStore('settings');
          const rows = await request(target.get('action-trials'));
          const merged = new Map(validateTrials(rows || []).map((r) => [r.id, r]));
          merged.delete(removeId);
          for (const row of clean) merged.set(row.id, row);
          target.put(validateTrials([...merged.values()]), 'action-trials');
          await done;
        } catch (error) {
          try {
            tx.abort();
          } catch {
            /* Already aborted. */
          }
          await done.catch(() => {});
          throw error;
        }
      });
    return this.writeQueue;
  }
  async listToys() {
    if (this.closed) throw new Error(this.warning);
    const rows = this.persistent
      ? await request(this.db.transaction('toys', 'readonly').objectStore('toys').getAll())
      : [...this.toys.values()];
    return rows.flatMap((row) => {
      try {
        return [validateToy(row)];
      } catch {
        return [];
      }
    });
  }
  saveToys(toys) {
    const clean = toys.map(validateToy);
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        if (this.closed) throw new Error(this.warning);
        const merge = (rows) => {
          const merged = new Map(rows.map((row) => [row.id, row]));
          for (const row of clean) merged.set(row.id, row);
          if (merged.size > MAX_TOYS)
            throw new Error('20-toy limit reached. Export profiles before removing old ones.');
          return merged;
        };
        if (!this.persistent) {
          this.toys = merge([...this.toys.values()]);
          return;
        }
        const tx = this.db.transaction('toys', 'readwrite');
        const done = completed(tx);
        try {
          merge(await request(tx.objectStore('toys').getAll()));
          for (const toy of clean) tx.objectStore('toys').put(toy);
        } catch (error) {
          tx.abort();
          await done.catch(() => {});
          throw error;
        }
        await done;
      });
    return this.writeQueue;
  }
  removeToy(id) {
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        if (this.closed) throw new Error(this.warning);
        if (!this.persistent) {
          this.toys.delete(id);
          return;
        }
        const tx = this.db.transaction('toys', 'readwrite');
        const done = completed(tx);
        tx.objectStore('toys').delete(id);
        await done;
      });
    return this.writeQueue;
  }
  async listDiscoveries() {
    if (this.closed) throw new Error(this.warning);
    const rows = this.persistent
      ? await request(
          this.db.transaction('discoveries', 'readonly').objectStore('discoveries').getAll(),
        )
      : [...this.discoveries.values()];
    // Report invalid data instead of silently losing its recovery path.
    return rows.map(validateDiscovery).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  saveDiscoveries(records) {
    const clean = records.map(validateDiscovery);
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        if (this.closed) throw new Error(this.warning);
        const merge = (rows) => {
          const merged = new Map(rows.map((r) => [r.id, r]));
          for (const row of clean) merged.set(row.id, row);
          if (merged.size > MAX_DISCOVERIES)
            throw new Error(
              '50-capture limit reached. Export discovery metadata before deleting captures.',
            );
          if (
            new TextEncoder().encode(JSON.stringify([...merged.values()])).byteLength >
            MAX_DISCOVERY_BYTES
          )
            throw new Error(
              '2 MB discovery budget reached. Export metadata before deleting captures.',
            );
          return merged;
        };
        if (!this.persistent) {
          this.discoveries = merge([...this.discoveries.values()]);
          return;
        }
        const tx = this.db.transaction('discoveries', 'readwrite'),
          done = completed(tx);
        try {
          merge(await request(tx.objectStore('discoveries').getAll()));
          for (const row of clean) tx.objectStore('discoveries').put(row);
        } catch (error) {
          tx.abort();
          await done.catch(() => {});
          throw error;
        }
        await done;
      });
    return this.writeQueue;
  }
  removeDiscovery(id) {
    this.writeQueue = this.writeQueue
      .catch(() => {})
      .then(async () => {
        if (this.closed) throw new Error(this.warning);
        if (!this.persistent) {
          this.discoveries.delete(id);
          return;
        }
        const tx = this.db.transaction('discoveries', 'readwrite'),
          done = completed(tx);
        tx.objectStore('discoveries').delete(id);
        await done;
      });
    return this.writeQueue;
  }
}
