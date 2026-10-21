import { sanitize } from './diagnostics.js';
export const FORMAT = 'sasori.session';
export const SCHEMA_VERSION = 2;
export const MAX_RECORDS = 50;
export const MAX_TOTAL_BYTES = 8 * 1024 * 1024;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_RECORD_BYTES = 250000;
const dateOK = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const bounded = (value, max) => typeof value === 'string' && value.length <= max;
// Record IDs identify local notes, never credentials. Insecure preview origins may lack randomUUID.
export function recordId(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') cryptoApi.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
export function createSession(source, profileId = '001', title = '') {
  return {
    format: FORMAT,
    schemaVersion: SCHEMA_VERSION,
    id: recordId(),
    source,
    profileId,
    importedAt: null,
    title: title || (source === 'simulated' ? 'Simulated inspection' : 'Elmo inspection'),
    startedAt: new Date().toISOString(),
    endedAt: null,
    outcome: 'active',
    notes: '',
    packets: [],
    events: [],
    services: [],
    stats: { packets: 0, bytes: 0, malformed: 0, truncated: 0 },
    payloadsIncluded: false,
  };
}
export function migrateRecord(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Record must be an object.');
  if (input.schemaVersion === 1 && input.format === FORMAT) {
    return {
      ...input,
      schemaVersion: 2,
      payloadsIncluded: false,
      importedAt: null,
      services: input.services || [],
      stats: input.stats || {
        packets: input.packets?.length || 0,
        bytes: 0,
        malformed: 0,
        truncated: 0,
      },
      endedAt: input.endedAt || null,
      outcome: input.outcome || 'imported',
      notes: input.notes || '',
    };
  }
  return input;
}
export function validateRecord(input) {
  const r = migrateRecord(input);
  if (r.format !== FORMAT || r.schemaVersion !== 2)
    throw new Error('Unsupported session format/version.');
  if (!bounded(r.id, 100) || !/^[a-zA-Z0-9_-]{1,100}$/.test(r.id))
    throw new Error('Invalid record identifier.');
  if (!['live', 'simulated', 'imported'].includes(r.source))
    throw new Error('Missing session provenance.');
  if (
    !bounded(r.profileId, 40) ||
    !bounded(r.title, 180) ||
    !bounded(r.notes, 20000) ||
    !bounded(r.outcome, 100)
  )
    throw new Error('Record text exceeds the supported size.');
  if (!dateOK(r.startedAt) || (r.endedAt !== null && !dateOK(r.endedAt)))
    throw new Error('Invalid session dates.');
  if (r.importedAt != null && !dateOK(r.importedAt)) throw new Error('Invalid import provenance.');
  if (typeof r.payloadsIncluded !== 'boolean') throw new Error('Missing payload policy.');
  if (
    !Array.isArray(r.packets) ||
    r.packets.length > 500 ||
    !Array.isArray(r.events) ||
    r.events.length > 400 ||
    !Array.isArray(r.services) ||
    r.services.length > 16
  )
    throw new Error('Record item limits exceeded.');
  for (const p of r.packets) {
    if (
      !p ||
      !dateOK(p.timestamp) ||
      !Number.isSafeInteger(p.length) ||
      p.length < 0 ||
      !bounded(p.characteristic, 128) ||
      !bounded(p.kind, 100)
    )
      throw new Error('Invalid packet metadata.');
    if (p.hex !== undefined && (!bounded(p.hex, 3072) || !/^(?:[a-f0-9]{2}(?: |$))*$/i.test(p.hex)))
      throw new Error('Invalid packet hex.');
    if (p.text !== undefined && !bounded(p.text, 4096)) throw new Error('Invalid packet text.');
  }
  for (const e of r.events)
    if (!e || !dateOK(e.timestamp) || !bounded(e.level, 30) || !bounded(e.message, 4000))
      throw new Error('Invalid log event.');
  for (const s of r.services) {
    if (
      !s ||
      !bounded(s.uuid, 128) ||
      !Array.isArray(s.characteristics) ||
      s.characteristics.length > 128
    )
      throw new Error('Invalid service metadata.');
    for (const c of s.characteristics)
      if (
        !c ||
        !bounded(c.uuid, 128) ||
        !Array.isArray(c.properties) ||
        c.properties.some(
          (p) => !['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].includes(p),
        )
      )
        throw new Error('Invalid characteristic metadata.');
  }
  if (
    !r.stats ||
    ['packets', 'bytes', 'malformed', 'truncated'].some(
      (k) => !Number.isSafeInteger(r.stats[k]) || r.stats[k] < 0,
    )
  )
    throw new Error('Invalid session statistics.');
  if (new TextEncoder().encode(JSON.stringify(r)).byteLength > MAX_RECORD_BYTES)
    throw new Error('Record is too large. Export fewer payloads.');
  // Whitelist the schema so arbitrary imported object keys never enter the app.
  return structuredClone(
    Object.fromEntries(
      [
        'format',
        'schemaVersion',
        'id',
        'source',
        'profileId',
        'title',
        'startedAt',
        'endedAt',
        'importedAt',
        'outcome',
        'notes',
        'packets',
        'events',
        'services',
        'stats',
        'payloadsIncluded',
      ].map((k) => [k, r[k]]),
    ),
  );
}
export function portableRecord(record, includePayloads = false) {
  const clean = sanitize(structuredClone(record));
  clean.packets = clean.packets.map((p) => {
    const metadata = {
      timestamp: p.timestamp,
      characteristic: p.characteristic,
      length: p.length,
      kind: p.kind,
      truncated: !!p.truncated,
      malformed: !!p.malformed,
    };
    return includePayloads ? { ...metadata, hex: p.hex || '', text: p.text || '' } : metadata;
  });
  clean.payloadsIncluded = !!includePayloads;
  return validateRecord(clean);
}
export function backup(records) {
  return {
    format: 'sasori.backup',
    schemaVersion: 2,
    exportedAt: new Date().toISOString(),
    payloadPolicy: 'metadata-only',
    records: records.map((r) => portableRecord(r)),
  };
}
export function parseImport(text, filename = 'import.txt') {
  if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES)
    throw new Error('Import limit is 2 MB.');
  const extension = filename.split('.').pop().toLowerCase();
  if (extension === 'json') {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('The JSON file is not valid. Nothing was imported.');
    }
    const records =
      data?.format === 'sasori.backup' && data.schemaVersion === 2 ? data.records : [data];
    if (!Array.isArray(records) || records.length > MAX_RECORDS || records.length === 0)
      throw new Error('Invalid backup size.');
    return records.map(validateRecord);
  }
  if (!['txt', 'csv'].includes(extension))
    throw new Error('Choose a JSON, TXT, or CSV research file.');
  if (text.length > 20000)
    throw new Error('Text/CSV notes are limited to 20,000 characters; split the file first.');
  const record = createSession('imported', '001', 'Imported · ' + filename.slice(0, 140));
  record.notes = text;
  record.outcome = 'imported-notes';
  record.endedAt = record.startedAt;
  // CSV is retained verbatim as research notes; no spreadsheet formulas or commands are executed.
  return [validateRecord(record)];
}
export function compareSessions(a, b) {
  const kinds = new Set([...a.packets, ...b.packets].map((p) => p.kind));
  return [...kinds].map((kind) => ({
    kind,
    first: a.packets.filter((p) => p.kind === kind).length,
    second: b.packets.filter((p) => p.kind === kind).length,
  }));
}
export function sessionText(r) {
  const safe = portableRecord(r);
  return [
    'PROJECT SASORI · ' + safe.title,
    'Source: ' + (safe.importedAt ? 'IMPORTED CLAIM / ' : '') + safe.source.toUpperCase(),
    'Started: ' + safe.startedAt,
    'Outcome: ' + safe.outcome,
    'Notifications: ' + safe.stats.packets + ' · Bytes: ' + safe.stats.bytes,
    'Payloads omitted. No authentication inference.',
    '',
    'NOTES',
    safe.notes,
    '',
    'EVENTS',
    ...safe.events.map((e) => e.timestamp + ' ' + e.level + ' ' + e.message),
  ].join('\n');
}
