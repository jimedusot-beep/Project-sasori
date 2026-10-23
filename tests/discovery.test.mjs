import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import {
  METHODS,
  parseCapture,
  summarizeCapture,
  createDiscovery,
  validateDiscovery,
  compareCaptures,
  discoveryBackup,
  parseDiscoveries,
  inspectWav,
} from '../site/lib/discovery.js';
import { ResearchStore } from '../site/lib/storage.js';
import { createSession } from '../site/lib/records.js';
import { createToy } from '../site/lib/toys.js';
import { ELMO_SERVICE } from '../site/lib/profiles.js';
import { syntheticWav } from './helpers/audio.mjs';

const sample = (text = '00 10 ff', kind = 'bytes', overrides = {}) => {
  const values = parseCapture(text, kind);
  return createDiscovery({
    label: 'Synthetic baseline',
    deviceModel: 'Synthetic model A / revision 1',
    sourceNote: 'Generated fixture, no hardware evidence.',
    method: kind === 'pulses' ? 'infrared' : 'ble',
    kind,
    evidence: 'synthetic',
    payloadsIncluded: true,
    values,
    summary: summarizeCapture(values, kind),
    ...overrides,
  });
};
test('nine discovery methods preserve separate research boundaries', () => {
  assert.equal(METHODS.length, 9);
  assert.equal(new Set(METHODS.map((m) => m.id)).size, 9);
  for (const method of METHODS) assert.ok(method.question && method.capture && method.limit);
});
test('byte and pulse parsers accept documented representations and enforce bounds', () => {
  assert.deepEqual(parseCapture('0x00:0XAf-10, FF', 'bytes'), [0, 175, 16, 255]);
  assert.deepEqual(parseCapture('9000, 4500\n560 560', 'pulses'), [9000, 4500, 560, 560]);
  for (const bad of ['', 'a', 'a b', '0a b0 1', '-01', '0g', '0x', '<script>', '00'.repeat(4097)])
    assert.throws(() => parseCapture(bad, 'bytes'));
  for (const bad of ['', '-1', '0', '1.5', '1e3', '10000001', '10,'.repeat(2049)])
    assert.throws(() => parseCapture(bad, 'pulses'));
  assert.throws(() => parseCapture('a'.repeat(32769), 'bytes'));
  assert.throws(() => parseCapture('10', 'audio'));
});
test('byte comparison reports exact zero-based changes and unequal tails', () => {
  const result = compareCaptures(sample('00 10 ff'), sample('00 11 ff 20'));
  assert.equal(result.changed, 1);
  assert.equal(result.added, 1);
  assert.equal(result.removed, 0);
  assert.deepEqual(result.differences, [
    { offset: 1, first: 16, second: 17, status: 'changed' },
    { offset: 3, first: null, second: 32, status: 'added' },
  ]);
  assert.equal(compareCaptures(sample('00 10 ff'), sample('00')).removed, 2);
  assert.equal(compareCaptures(sample('00'), sample('00')).total, 0);
  const many = compareCaptures(sample('00'.repeat(100)), sample('ff'.repeat(100)));
  assert.equal(many.total, 100);
  assert.equal(many.differences.length, 64);
});
test('pulse tolerance is inclusive; missing pulses remain differences', () => {
  const a = sample('9000 4500 560', 'pulses'),
    b = sample('9100 4601', 'pulses');
  const result = compareCaptures(a, b, 100);
  assert.equal(result.changed, 1);
  assert.equal(result.removed, 1);
  for (const value of [-1, 1.5, NaN, Infinity, 1000001])
    assert.throws(() => compareCaptures(a, b, value));
});
test('comparisons refuse missing raw data, cross-model and cross-method assumptions', () => {
  const a = sample();
  for (const b of [
    sample('00', 'bytes', { deviceModel: 'Another model' }),
    sample('00', 'bytes', { method: 'app' }),
    sample('100', 'pulses'),
    { ...a, payloadsIncluded: false, values: null },
  ])
    assert.throws(() => compareCaptures(a, b));
  assert.equal(
    compareCaptures(a, { ...a, deviceModel: '  Synthetic MODEL A / revision 1  ' }).total,
    0,
  );
});
test('discovery validation rejects contradictory retention, forged summaries and malformed flags', () => {
  const a = sample();
  for (const changes of [
    { payloadsIncluded: 'false' },
    { payloadsIncluded: false },
    { values: [NaN] },
    { summary: { count: 3, unique: 2 } },
    { method: 'unknown' },
    { importedAt: 'invalid' },
    { createdAt: 5 },
    { deviceModel: '' },
  ])
    assert.throws(() => validateDiscovery({ ...a, ...changes }));
  const clean = validateDiscovery({
    ...a,
    injected: 'ignored',
    summary: { ...a.summary, hidden: 'ignored' },
  });
  assert.equal(clean.injected, undefined);
  assert.equal(clean.summary.hidden, undefined);
});
test('metadata exports omit all values and nested extras; imports never overwrite or upgrade evidence', () => {
  const a = sample('ab cd ef', 'bytes', { sourceNote: 'Fixture token=synthetic-secret-value' });
  const backup = discoveryBackup([{ ...a, nestedRaw: 'private fixture' }]);
  assert.equal(backup.records[0].values, null);
  assert.equal(backup.records[0].payloadsIncluded, false);
  assert.equal(backup.records[0].nestedRaw, undefined);
  assert.doesNotMatch(JSON.stringify(backup), /synthetic-secret-value/);
  const imported = parseDiscoveries(JSON.stringify(backup));
  assert.notEqual(imported[0].id, a.id);
  assert.ok(imported[0].importedAt);
  assert.equal(imported[0].evidence, 'synthetic');
  const reexported = discoveryBackup(imported);
  assert.ok(reexported.records[0].importedAt);
});
test('one malformed item rejects an entire discovery import', () => {
  const backup = discoveryBackup([sample()]);
  backup.records.push({ ...backup.records[0], summary: { count: -1, unique: 1 } });
  assert.throws(() => parseDiscoveries(JSON.stringify(backup)));
  for (const value of ['{', '{}', 'x'.repeat(1024 * 1024 + 1)])
    assert.throws(() => parseDiscoveries(value));
});
test('synthetic sine WAV analysis identifies its spectral peak, duration, amplitude, and stereo layout', () => {
  for (const channels of [1, 2]) {
    const result = inspectWav(syntheticWav({ channels }));
    assert.equal(result.summary.sampleRate, 16000);
    assert.equal(result.summary.duration, 0.25);
    assert.equal(result.summary.channels, channels);
    assert.ok(Math.abs(result.summary.rms - 0.5 / Math.sqrt(2)) < 0.001);
    assert.ok(Math.abs(result.summary.peak - 0.5) < 0.001);
    assert.ok(Math.abs(result.summary.dominantHz - 1000) <= result.summary.binHz);
    assert.equal(result.summary.clipped, 0);
    assert.equal(result.waveform.length, 256);
    assert.equal(result.spectrum.length, 1025);
    assert.ok(result.spectrum.every((v) => Number.isFinite(v) && v >= -80 && v <= 0));
  }
});
test('silence, short files, and PCM16 clipping remain finite and interpretable', () => {
  const silent = inspectWav(syntheticWav({ amplitude: 0, seconds: 0.001 }));
  assert.equal(silent.summary.dominantHz, 0);
  assert.equal(silent.summary.rms, 0);
  const buffer = syntheticWav({ seconds: 0.001 });
  const view = new DataView(buffer);
  view.setInt16(44, -32768, true);
  view.setInt16(46, 32767, true);
  const result = inspectWav(buffer);
  assert.equal(result.summary.clipped, 2);
  assert.equal(result.summary.peak, 1);
});
test('WAV chunk padding and first-channel analysis do not confuse metadata or stereo channels', () => {
  const stereo = syntheticWav({ channels: 2 });
  const view = new DataView(stereo);
  for (let i = 0; i < (stereo.byteLength - 44) / 4; i++)
    view.setInt16(46 + i * 4, Math.round(Math.sin((2 * Math.PI * 3000 * i) / 16000) * 32767), true);
  assert.equal(inspectWav(stereo).summary.dominantHz, 1000);
  const padded = new ArrayBuffer(stereo.byteLength + 10);
  const bytes = new Uint8Array(padded);
  bytes.set(new Uint8Array(stereo, 0, 12));
  bytes.set([74, 85, 78, 75, 1, 0, 0, 0, 65, 0], 12); // JUNK / 1 byte / pad
  bytes.set(new Uint8Array(stereo, 12), 22);
  new DataView(padded).setUint32(4, padded.byteLength - 8, true);
  assert.equal(inspectWav(padded).summary.dominantHz, 1000);
  const duplicate = new ArrayBuffer(stereo.byteLength + 24);
  const copy = new Uint8Array(duplicate);
  copy.set(new Uint8Array(stereo, 0, 36));
  copy.set(new Uint8Array(stereo, 12, 24), 36);
  copy.set(new Uint8Array(stereo, 36), 60);
  new DataView(duplicate).setUint32(4, duplicate.byteLength - 8, true);
  assert.throws(() => inspectWav(duplicate), /duplicate/);
});
test('WAV parser rejects malformed containers, unsupported encodings, sizes, and electrical-irrelevant payloads', () => {
  const modifications = [
    (v) => v.setUint32(4, 0, true),
    (v) => v.setUint32(40, 9999999, true),
    (v) => v.setUint16(20, 3, true),
    (v) => v.setUint16(22, 3, true),
    (v) => v.setUint16(34, 24, true),
    (v) => v.setUint16(32, 0, true),
    (v) => v.setUint32(28, 1, true),
    (v) => v.setUint32(24, 1000000, true),
    (v) => v.setUint32(40, 3, true),
  ];
  for (const modify of modifications) {
    const buffer = syntheticWav();
    modify(new DataView(buffer));
    assert.throws(() => inspectWav(buffer));
  }
  assert.throws(() => inspectWav(new ArrayBuffer(40)));
  assert.throws(() => inspectWav(new ArrayBuffer(10 * 1024 * 1024 + 1)));
  assert.throws(() => inspectWav(syntheticWav({ sampleRate: 8000, seconds: 31 })));
});
test('audio summaries cannot claim raw data and preserve no waveform or spectrum', () => {
  const summary = inspectWav(syntheticWav()).summary;
  const a = createDiscovery({
    label: 'Synthetic audio',
    deviceModel: 'Fixture',
    sourceNote: 'Synthetic sine',
    method: 'sound',
    evidence: 'synthetic',
    kind: 'audio',
    payloadsIncluded: false,
    values: null,
    summary,
  });
  assert.equal(
    validateDiscovery({ ...a, summary: { ...summary, raw: 'ignored' } }).summary.raw,
    undefined,
  );
  assert.throws(() => validateDiscovery({ ...a, payloadsIncluded: true, values: [1] }));
  assert.throws(() => validateDiscovery({ ...a, summary: { ...summary, dominantHz: 9000 } }));
  assert.throws(() => validateDiscovery({ ...a, summary: { ...summary, duration: 15 } }));
});
test('discovery saves survive reload in IndexedDB and in-memory saves are isolated snapshots', async () => {
  for (const indexedDB of [new IDBFactory(), null]) {
    const store = await new ResearchStore({ indexedDB, name: 'discovery' }).open();
    const a = sample();
    await store.saveDiscoveries([a]);
    a.values[0] = 255;
    assert.equal((await store.listDiscoveries())[0].values[0], 0);
    if (indexedDB) {
      const other = await new ResearchStore({ indexedDB, name: 'discovery' }).open();
      assert.equal((await other.listDiscoveries()).length, 1);
      other.db.close();
    }
    const id = (await store.listDiscoveries())[0].id;
    await Promise.all([
      store.saveDiscoveries(await store.listDiscoveries()),
      store.removeDiscovery(id),
    ]);
    assert.equal((await store.listDiscoveries()).length, 0);
    store.db?.close();
  }
});
test('v3 storage upgrade preserves session, settings, and toy data', async () => {
  const factory = new IDBFactory(),
    session = createSession('simulated');
  const toy = createToy({
    label: 'Synthetic toy',
    namePrefix: 'Toy',
    service: ELMO_SERVICE,
    notify: '',
    sourceNote: 'Fixture',
  });
  await new Promise((resolve, reject) => {
    const req = factory.open('upgrade-discovery', 3);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('records', { keyPath: 'id' }).put(session);
      req.result.createObjectStore('toys', { keyPath: 'id' }).put(toy);
      req.result.createObjectStore('settings').put({ profile: toy.id }, 'preferences');
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = reject;
  });
  const store = await new ResearchStore({ indexedDB: factory, name: 'upgrade-discovery' }).open();
  assert.equal(store.db.version, 4);
  assert.equal((await store.list())[0].id, session.id);
  assert.equal((await store.listToys())[0].id, toy.id);
  assert.equal((await store.getSettings()).profile, toy.id);
  await store.saveDiscoveries([sample()]);
  assert.equal((await store.listDiscoveries()).length, 1);
  store.db.close();
});
test('discovery imports are atomic and concurrent tabs cannot overfill storage', async () => {
  const factory = new IDBFactory();
  const a = await new ResearchStore({ indexedDB: factory, name: 'capacity' }).open();
  const b = await new ResearchStore({ indexedDB: factory, name: 'capacity' }).open();
  assert.throws(() => a.saveDiscoveries([sample(), {}]));
  assert.equal((await a.listDiscoveries()).length, 0);
  await a.saveDiscoveries(Array.from({ length: 49 }, () => sample()));
  const result = await Promise.allSettled([
    a.saveDiscoveries([sample()]),
    b.saveDiscoveries([sample()]),
  ]);
  assert.equal(result.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await a.listDiscoveries()).length, 50);
  a.db.close();
  b.db.close();
});
