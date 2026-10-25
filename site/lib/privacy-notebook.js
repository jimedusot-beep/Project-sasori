const MAX_BYTES = 5 * 1024 * 1024;
const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
export function cleanSurvey(value = {}) {
  if (
    !Array.isArray(value.devices) ||
    value.devices.length > 60 ||
    !Number.isFinite(value.durationMs) ||
    value.durationMs < 0 ||
    value.durationMs > 35000
  )
    throw new Error('invalid-survey');
  const aliases = new Set();
  let samples = 0;
  return {
    durationMs: Math.round(value.durationMs),
    devices: value.devices.map((d) => {
      if (
        !/^signal-[1-9][0-9]?$/.test(d.alias) ||
        aliases.has(d.alias) ||
        !integer(d.samples, 1, 2000) ||
        !integer(d.rssi, -127, 0) ||
        !integer(d.minRssi, -127, 0) ||
        !integer(d.maxRssi, -127, 0) ||
        d.minRssi > d.rssi ||
        d.maxRssi < d.rssi
      )
        throw new Error('invalid-survey-device');
      aliases.add(d.alias);
      samples += d.samples;
      if (
        samples > 2000 ||
        (d.history !== undefined && (!Array.isArray(d.history) || d.history.length > 12))
      )
        throw new Error('invalid-survey-history');
      const history = (d.history || []).slice(-12).map((h) => {
        if (!integer(h.rssi, -127, 0) || !integer(h.elapsedMs, 0, 35000))
          throw new Error('invalid-survey-history');
        return { elapsedMs: h.elapsedMs, rssi: h.rssi };
      });
      return {
        alias: d.alias,
        samples: d.samples,
        rssi: d.rssi,
        minRssi: d.minRssi,
        maxRssi: d.maxRssi,
        history,
      };
    }),
  };
}
function clean(input, { keepPhoto = false } = {}) {
  if (
    !input ||
    typeof input.label !== 'string' ||
    !input.label.trim() ||
    input.label.length > 80 ||
    typeof (input.note ?? '') !== 'string' ||
    (input.note || '').length > 2000 ||
    !['live', 'synthetic'].includes(input.source) ||
    !['note', 'optics', 'survey'].includes(input.kind)
  )
    throw new Error('invalid-observation');
  const result = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    label: input.label.trim(),
    note: input.note || '',
    source: input.source,
    kind: input.kind,
    hardwareVerified: false,
  };
  if (input.kind === 'survey') result.measurements = cleanSurvey(input.measurements);
  if (input.kind === 'optics') {
    const m = input.measurements;
    if (
      !m ||
      !integer(m.changedCells, 0, 192) ||
      !integer(m.brightIncreases, 0, 192) ||
      !Number.isFinite(m.meanAbsoluteChange) ||
      m.meanAbsoluteChange < 0 ||
      m.meanAbsoluteChange > 255
    )
      throw new Error('invalid-optics');
    result.measurements = {
      changedCells: m.changedCells,
      brightIncreases: m.brightIncreases,
      meanAbsoluteChange: m.meanAbsoluteChange,
    };
  }
  if (keepPhoto && input.photo) {
    if (
      typeof input.photo !== 'string' ||
      input.photo.length > 200000 ||
      !/^data:image\/jpeg;base64,[a-zA-Z0-9+/]+={0,2}$/.test(input.photo)
    )
      throw new Error('invalid-photo');
    result.photo = input.photo;
  }
  return result;
}
export function portableObservation(input, { includePhoto = false } = {}) {
  const result = clean(input, { keepPhoto: includePhoto });
  result.createdAt = input.createdAt;
  delete result.id;
  return result;
}
export class PrivacyNotebook {
  constructor({ indexedDB = globalThis.indexedDB } = {}) {
    this.factory = indexedDB;
    this.opening = null;
  }
  open() {
    if (this.opening) return this.opening;
    this.opening = new Promise((resolve, reject) => {
      if (!this.factory) {
        reject(new Error('notebook-unavailable'));
        return;
      }
      const request = this.factory.open('sasori-privacy-lab', 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore('observations', { keyPath: 'id' });
      request.onerror = () => reject(new Error('notebook-unavailable'));
      request.onblocked = () => reject(new Error('notebook-blocked'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.opening = null;
        };
        resolve(db);
      };
    }).catch((error) => {
      this.opening = null;
      throw error;
    });
    return this.opening;
  }
  async list() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('observations', 'readonly'),
        request = tx.objectStore('observations').getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(new Error('notebook-read-failed'));
    });
  }
  async save(input, options) {
    const record = clean(input, options),
      db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('observations', 'readwrite'),
        store = tx.objectStore('observations'),
        request = store.getAll();
      let reason = 'notebook-save-failed';
      request.onsuccess = () => {
        const records = request.result;
        if (
          records.length >= 30 ||
          new TextEncoder().encode(JSON.stringify([...records, record])).length > MAX_BYTES
        ) {
          reason = 'notebook-full';
          tx.abort();
          return;
        }
        store.add(record);
      };
      tx.oncomplete = () => resolve(record);
      tx.onabort = tx.onerror = () => reject(new Error(reason));
    });
  }
  async remove(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('observations', 'readwrite');
      tx.objectStore('observations').delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(new Error('notebook-delete-failed'));
    });
  }
}
