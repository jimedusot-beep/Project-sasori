import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTrace,
  validateTrace,
  portableTrace,
  markTrace,
  traceSummary,
  compareTraces,
  selectedInterval,
} from '../site/lib/traces.js';
import {
  ADAPTERS,
  getAdapter,
  validateAdapterManifest,
  offlineCommand,
  decodeAdapterFrame,
  adapterReadiness,
  MIP_TX,
  MIP_RX,
} from '../site/lib/adapters.js';
import { INSPIRATIONS } from '../site/lib/inspirations.js';
import {
  createSession,
  portableRecord,
  parseImport,
  serializeBackup,
  validateRecord,
} from '../site/lib/records.js';
import { ResearchStore } from '../site/lib/storage.js';
import { IDBFactory } from 'fake-indexeddb';

const example = () => ({
  format: 'sasori.trace',
  schemaVersion: 1,
  label: 'Synthetic example',
  model: 'WowWee MiP',
  firmware: 'unknown',
  transport: 'ble',
  evidence: 'synthetic',
  sourceNote: 'Synthetic times; manufacturer example bytes. No hardware test.',
  payloadsIncluded: true,
  frames: [
    { tMs: 0, direction: 'tx', endpoint: MIP_TX, hex: '14' },
    { tMs: 85, direction: 'rx', endpoint: MIP_RX, hex: '31 34 30 45 30 32 31 42 30 37' },
  ],
  markers: [],
});
test('CSV ingestion keeps exact direction, endpoint, timing and raw bytes including quoted cells', () => {
  const trace = parseTrace(
    'time_ms,direction,endpoint,hex\r\n0,tx,"handle:0x0012","14"\r\n85.5,rx,handle:0x0015,"31 34"\r\n',
    example(),
  );
  assert.deepEqual(traceSummary(trace), {
    frames: 2,
    tx: 1,
    rx: 1,
    bytes: 3,
    durationMs: 85.5,
    endpoints: ['handle:0x0012', 'handle:0x0015'],
    retainedBytes: 3,
  });
  assert.equal(parseTrace(JSON.stringify(trace)).frames[1].hex, '31 34');
});
test('malformed, oversized, unsorted, and misleading trace data is rejected atomically', () => {
  for (const patch of [
    { frames: [] },
    { frames: Array.from({ length: 257 }, () => example().frames[0]) },
    { payloadsIncluded: false },
    { frames: [{ ...example().frames[0], length: 2 }] },
    { frames: [{ ...example().frames[0], tMs: NaN }] },
    { frames: [{ ...example().frames[0], hex: 'f' }] },
    { frames: [{ ...example().frames[0], endpoint: '<script>' }] },
    { frames: example().frames.toReversed() },
    { frames: [{ ...example().frames[0], hex: 'ab '.repeat(1025) }] },
    { markers: [{ tMs: -1, label: 'x' }] },
    { evidence: 'verified' },
  ])
    assert.throws(() => validateTrace({ ...example(), ...patch }));
  assert.throws(() => parseTrace('x'.repeat(524289)), /512/);
  assert.throws(
    () => parseTrace('time_ms,direction,endpoint,hex\n0,tx,"unterminated,14', example()),
    /quote/,
  );
  assert.throws(
    () => parseTrace('time_ms,direction,endpoint,hex\n0,tx,"x"oops,14', example()),
    /quoted/,
  );
  assert.throws(() => parseTrace('time_ms,direction,endpoint,hex\n=1,tx,a,14', example()), /CSV/);
  assert.throws(
    () =>
      validateTrace({
        ...example(),
        frames: Array.from({ length: 41 }, (_, i) => ({
          tMs: i,
          direction: 'rx',
          endpoint: 'a',
          hex: 'ab '.repeat(1024).trim(),
        })),
      }),
    /40 KiB/,
  );
});
test('markers remain sorted, bounded and independent of immutable original observations', () => {
  const a = validateTrace(example()),
    b = markTrace(a, 85, 'Normal button pressed'),
    c = markTrace(b, 0, 'Baseline');
  assert.equal(a.markers.length, 0);
  assert.equal(c.markers[0].label, 'Baseline');
  assert.equal(selectedInterval(c, 0, 1).elapsedMs, 85);
  assert.match(selectedInterval(c, 0, 1).verdict, /not a verified acknowledgment/);
  assert.throws(() => selectedInterval(c, 1, 0));
  assert.throws(() =>
    markTrace(
      { ...a, markers: Array.from({ length: 100 }, () => ({ tMs: 0, label: 'test' })) },
      0,
      'extra',
    ),
  );
});
test('comparisons show byte offsets, route and timing changes without aligning unrelated frames', () => {
  const a = example(),
    b = example();
  b.frames[1].hex = '31 34 30 45 30 33 31 42 30 37';
  b.frames[1].tMs = 95;
  const rows = compareTraces(a, b);
  assert.equal(rows[0].kind, 'same');
  assert.deepEqual(rows[1].changedByteOffsets, [5]);
  assert.equal(rows[1].timeDeltaMs, 10);
  b.frames[0].endpoint = 'different';
  assert.equal(compareTraces(a, b)[0].routeChanged, true);
  assert.equal(compareTraces(a, { ...a, frames: [a.frames[0]] })[1].kind, 'removed');
  assert.throws(() => compareTraces(a, { ...b, firmware: 'another' }), /same declared/);
  assert.throws(() => compareTraces(a, portableTrace(b)), /retained/);
});
test('metadata exports and notebook backups omit every trace hex field while preserving markers', () => {
  const r = createSession('imported', 'trace-mip');
  r.protocolTrace = markTrace(example(), 85, 'Observed action');
  r.payloadsIncluded = true;
  r.endedAt = r.startedAt;
  const metadata = portableRecord(r);
  assert.equal(metadata.protocolTrace.frames[0].hex, undefined);
  assert.equal(metadata.protocolTrace.frames[0].length, 1);
  assert.equal(metadata.protocolTrace.markers.length, 1);
  assert.equal(metadata.protocolTrace.payloadsIncluded, false);
  const raw = portableRecord(r, true);
  assert.equal(raw.protocolTrace.frames[0].hex, '14');
  const backup = JSON.parse(serializeBackup([raw]));
  assert.equal(backup.records[0].protocolTrace.frames[1].hex, undefined);
  assert.equal(parseImport(JSON.stringify(raw), 'trace.json')[0].protocolTrace.frames[0].hex, '14');
  assert.throws(() => validateRecord({ ...r, source: 'live' }), /Offline traces/);
  assert.throws(() => validateRecord({ ...r, payloadsIncluded: false }), /payload policy/);
});
test('traces use the existing v4 record store and survive raw/metadata save and import-copy restoration', async () => {
  const store = await new ResearchStore({
    indexedDB: new IDBFactory(),
    name: 'trace-fixture',
  }).open();
  const old = createSession('imported');
  old.endedAt = old.startedAt;
  await store.save(old);
  const r = createSession('imported', 'trace-mip');
  r.protocolTrace = example();
  r.payloadsIncluded = true;
  r.endedAt = r.startedAt;
  await store.save(portableRecord(r, true));
  await store.importCopies([portableRecord(r)]);
  const rows = await store.list();
  assert.equal(rows.length, 3);
  assert.equal(store.db.version, 4);
  const copied = rows.find((x) => x.protocolTrace && x.importedAt);
  assert.equal(copied.protocolTrace.frames[0].hex, undefined);
  assert.equal(rows.find((x) => x.id === r.id).protocolTrace.frames[0].hex, '14');
  store.db.close();
});
test('MiP source example decodes ASCII-hex replies separately from raw request bytes', () => {
  const a = example();
  assert.equal(offlineCommand('mip-documented', 'software-version').hex, '14');
  assert.equal(decodeAdapterFrame('mip-documented', a.frames[0]).kind, 'mip-version-request');
  const result = decodeAdapterFrame('mip-documented', a.frames[1]);
  assert.deepEqual(result.fields, { year: 14, month: 2, day: 27, revision: 7 });
  assert.equal(result.hardwareVerified, false);
  assert.equal(
    decodeAdapterFrame('mip-documented', { ...a.frames[1], hex: '14 0e 02 1b 07' }).kind,
    'unknown',
  );
  assert.equal(
    decodeAdapterFrame('mip-documented', { ...a.frames[1], endpoint: MIP_TX }).kind,
    'unknown',
  );
  assert.equal(
    decodeAdapterFrame('mip-documented', { ...a.frames[1], hex: undefined }).kind,
    'metadata-only',
  );
  assert.throws(() => offlineCommand('elmo-l2l', 'status'), /missing/);
  assert.throws(() => offlineCommand('mip-documented', 'move'));
});
test('catalog provenance and readiness cannot turn observations or imported flags into physical authority', () => {
  assert.equal(INSPIRATIONS.length, 9);
  assert.ok(getAdapter('elmo-l2l').sources.includes('elmo-pyelmo'));
  for (const source of INSPIRATIONS) {
    assert.match(source.revision, /^[a-f0-9]{40}$/);
    assert.match(source.reference, /^https:\/\/github.com\//);
    assert.ok(source.aspect && source.reuse && source.licenseReference);
  }
  for (const adapter of ADAPTERS) {
    assert.equal(adapter.hardwareVerified, false);
    assert.equal(adapter.authenticationVerified, false);
    assert.ok(Object.isFrozen(adapter));
  }
  assert.throws(() =>
    validateAdapterManifest({ ...getAdapter('elmo-l2l'), hardwareVerified: true }),
  );
  assert.throws(() =>
    validateAdapterManifest({ ...getAdapter('elmo-l2l'), liveCapabilities: ['write-anything'] }),
  );
  assert.throws(() => getAdapter('untrusted'));
  const readiness = adapterReadiness('mip-documented', { ...example(), firmware: '1.0' });
  assert.equal(readiness.checks[0].done, true);
  assert.equal(readiness.checks[2].done, true);
  assert.equal(readiness.checks[3].done, false);
  assert.equal(readiness.checks[4].done, false);
  assert.equal(readiness.hardwareVerified, false);
});
