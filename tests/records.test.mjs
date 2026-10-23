import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession,
  recordId,
  validateRecord,
  portableRecord,
  backup,
  serializeBackup,
  parseImport,
  reviseNotes,
  MAX_FILE_BYTES,
  compareSessions,
  sessionText,
} from '../site/lib/records.js';
import { decodePacket } from '../site/lib/protocol.js';
import { Diagnostics, sanitize, sanitizeText, explainError } from '../site/lib/diagnostics.js';
import { ResearchStore } from '../site/lib/storage.js';
function capture() {
  const r = createSession('live');
  r.packets.push(decodePacket(new TextEncoder().encode('password=private-synthetic-value')));
  r.stats = { packets: 1, bytes: 32, malformed: 0, truncated: 0 };
  return r;
}
test('record IDs work without secure-context randomUUID', () => {
  assert.match(recordId({ getRandomValues: (bytes) => bytes.fill(5) }), /^[a-f0-9]{32}$/);
  assert.notEqual(recordId(null), recordId(null));
});
test('sessions preserve version and live/simulated/imported source', () => {
  for (const source of ['live', 'simulated', 'imported']) {
    const r = createSession(source);
    assert.equal(validateRecord(r).source, source);
    assert.equal(r.schemaVersion, 2);
  }
});
test('default persistence omits unknown raw payload bytes and text', () => {
  const r = portableRecord(capture());
  assert.equal(r.payloadsIncluded, false);
  assert.equal(r.packets[0].hex, undefined);
  assert.equal(r.packets[0].text, undefined);
});
test('explicit raw export retains hex but redacts recognized secrets in text', () => {
  const r = portableRecord(capture(), true);
  assert.ok(r.packets[0].hex.length > 0);
  assert.doesNotMatch(r.packets[0].text, /private-synthetic-value/);
});
test('backups and text reports omit payloads even from a raw capture', () => {
  const r = portableRecord(capture(), true),
    envelope = backup([r]);
  assert.equal(envelope.payloadPolicy, 'metadata-only');
  assert.equal(envelope.records[0].packets[0].hex, undefined);
  assert.doesNotMatch(sessionText(r), /private-synthetic-value/);
});
test('metadata backups exclude nested raw data and arbitrary imported fields', () => {
  const r = capture();
  const hidden = 'synthetic-raw-capture-that-must-not-leave';
  r.events = [
    {
      timestamp: r.startedAt,
      level: 'info',
      message: 'Observed',
      details: { raw: hidden },
      extra: hidden,
    },
  ];
  r.services = [
    {
      uuid: 'service',
      evidence: 'synthetic',
      raw: hidden,
      characteristics: [
        { uuid: 'notify', properties: ['notify'], evidence: 'synthetic', raw: hidden },
      ],
    },
  ];
  r.stats.extra = hidden;
  r.packets[0].extra = hidden;
  const exported = backup([r]);
  assert.doesNotMatch(JSON.stringify(exported), new RegExp(hidden));
  assert.equal(exported.records[0].services[0].characteristics[0].evidence, 'synthetic');
  assert.equal(exported.records[0].stats.packets, 1);
  assert.equal(exported.records[0].events[0].message, 'Observed');
});
test('large in-memory captures still save as bounded metadata without changing the capture', () => {
  const r = createSession('simulated');
  r.packets = Array.from({ length: 100 }, () => decodePacket(new Uint8Array(1024)));
  r.stats = { packets: 100, bytes: 102400, malformed: 0, truncated: 0 };
  assert.throws(() => validateRecord(r), /too large/);
  const saved = portableRecord(r);
  assert.equal(saved.packets.length, 100);
  assert.equal(saved.packets[0].hex, undefined);
  assert.equal(r.packets[0].hex.length, 3071);
  assert.equal(backup([r]).records[0].stats.bytes, 102400);
});
test('v1 records migrate without inventing data', () => {
  const old = createSession('live');
  old.schemaVersion = 1;
  delete old.stats;
  delete old.payloadsIncluded;
  delete old.services;
  const r = validateRecord(old);
  assert.equal(r.schemaVersion, 2);
  assert.equal(r.payloadsIncluded, false);
  assert.deepEqual(r.services, []);
});
test('malformed, oversized, future and foreign records are rejected', () => {
  for (const patch of [
    { schemaVersion: 99 },
    { source: 'verified' },
    { id: '../../bad' },
    { startedAt: 'no' },
    { importedAt: '2026-10-23T00:00:00Z' + ' '.repeat(70) },
    { notes: 'a'.repeat(20001) },
    { stats: { packets: -1 } },
    { packets: Array(501).fill({}) },
    { services: [{ uuid: 'x', characteristics: [{ uuid: 'x', properties: ['execute'] }] }] },
  ])
    assert.throws(() => validateRecord({ ...createSession('live'), ...patch }));
  assert.throws(() => validateRecord(null));
  assert.throws(() => validateRecord([]));
});
test('bad packet hex, date, text and negative length are rejected', () => {
  for (const patch of [
    { hex: 'execute()' },
    { timestamp: 'bad' },
    { length: -1 },
    { text: 'x'.repeat(4097) },
  ]) {
    const r = capture();
    Object.assign(r.packets[0], patch);
    assert.throws(() => validateRecord(r));
  }
});
for (const flag of ['truncated', 'malformed']) {
  test(`packet ${flag} flag rejects non-boolean values during validation and JSON import`, () => {
    for (const value of ['false', 'true', 0, 1, null, [], {}]) {
      const r = capture();
      r.packets[0][flag] = value;
      assert.throws(() => validateRecord(r), /Invalid packet flags/);
      assert.throws(() => parseImport(JSON.stringify(r), 'capture.json'), /Invalid packet flags/);
    }
  });
}
test('optional packet flags preserve booleans and remain optional in v1 and v2 imports', () => {
  for (const schemaVersion of [1, 2]) {
    for (const value of [true, false, undefined]) {
      const r = capture();
      r.schemaVersion = schemaVersion;
      for (const flag of ['truncated', 'malformed']) {
        if (value === undefined) delete r.packets[0][flag];
        else r.packets[0][flag] = value;
      }
      const [imported] = parseImport(JSON.stringify(r), 'capture.json');
      assert.equal(imported.schemaVersion, 2);
      assert.equal(imported.packets[0].truncated, value);
      assert.equal(imported.packets[0].malformed, value);
    }
  }
});
test('one invalid packet flag rejects a mixed backup before records can be imported', () => {
  const invalid = capture();
  invalid.packets[0].malformed = 'false';
  const envelope = {
    format: 'sasori.backup',
    schemaVersion: 2,
    records: [capture(), invalid],
  };
  assert.throws(() => parseImport(JSON.stringify(envelope), 'backup.json'), /Invalid packet flags/);
});
test('unknown top-level imported keys are dropped', () => {
  const r = validateRecord({
    ...createSession('imported'),
    untrustedScript: '<script>bad()</script>',
  });
  assert.equal(r.untrustedScript, undefined);
});
test('JSON session and metadata backup imports round trip', () => {
  const r = portableRecord(capture());
  assert.equal(parseImport(JSON.stringify(r), 'capture.json')[0].id, r.id);
  assert.equal(parseImport(JSON.stringify(backup([r])), 'backup.json').length, 1);
});
test('complete ASCII and Unicode notebooks restore with every note revision', async () => {
  for (const [count, value, versions] of [
    [50, 'x'.repeat(19999), 6],
    [32, '界'.repeat(20000), 4],
  ]) {
    const store = await new ResearchStore({ indexedDB: null }).open();
    const records = Array.from({ length: count }, (_, index) => {
      let record = createSession('imported', '001', 'Synthetic notebook ' + index);
      record.endedAt = record.startedAt;
      for (let revision = 0; revision < versions; revision++)
        record = reviseNotes(record, 'Revision ' + revision, value);
      return record;
    });
    await store.saveMany(records);
    const text = serializeBackup(await store.list());
    assert.ok(Buffer.byteLength(text) > 2 * 1024 * 1024);
    assert.ok(Buffer.byteLength(text) < MAX_FILE_BYTES);
    const restored = parseImport(text, 'sasori-backup.json');
    assert.deepEqual(
      restored.map((r) => [r.id, r.notes, r.noteHistory]),
      (await store.list()).map((r) => [r.id, r.notes, r.noteHistory]),
    );
  }
  assert.throws(() => serializeBackup([]), /1–50/);
});
test('invalid backup is rejected as a whole before writing any record', () => {
  assert.throws(() =>
    parseImport('{"format":"sasori.backup","schemaVersion":2,"records":[{}]}', 'backup.json'),
  );
  assert.throws(() => parseImport('{bad', 'invalid.json'), /not valid/);
  assert.throws(() => parseImport('x'.repeat(MAX_FILE_BYTES + 1), 'big.txt'), /13 MB/);
});
test('TXT and CSV import are inert notes, preserving source text', () => {
  for (const filename of ['notes.txt', 'measurements.csv']) {
    const text = '=CMD("not executed"),<img src=x onerror=bad()>';
    const r = parseImport(text, filename)[0];
    assert.equal(r.notes, text);
    assert.equal(r.source, 'imported');
    assert.equal(r.packets.length, 0);
  }
  assert.throws(() => parseImport('data', 'code.js'), /JSON, TXT, or CSV/);
});
test('comparison counts notification patterns without relabeling evidence', () => {
  const a = capture(),
    b = createSession('simulated');
  b.packets = [{ ...a.packets[0], kind: 'mode-observation' }];
  assert.deepEqual(compareSessions(a, b), [
    { kind: 'unknown', first: 1, second: 0 },
    { kind: 'mode-observation', first: 0, second: 1 },
  ]);
});
test('diagnostics sanitize known sensitive fields and enforce a ring buffer', () => {
  const log = new Diagnostics(2);
  log.add('info', 'first');
  log.add('info', 'password=synthetic-value');
  log.add('info', 'third', { token: 'fixture', safe: 'fine' });
  assert.equal(log.events.length, 2);
  assert.equal(log.dropped, 1);
  assert.doesNotMatch(log.text(), /synthetic-value/);
  assert.equal(log.events[1].details.token, '[redacted]');
});
test('nested export sanitization redacts secrets, email and addresses', () => {
  assert.deepEqual(sanitize({ nested: { password: 'fixture', useful: 'observation' } }), {
    nested: { password: '[redacted]', useful: 'observation' },
  });
  assert.doesNotMatch(sanitizeText('person@example.org aa:bb:cc:dd:ee:ff'), /@|aa:bb/);
});
test('errors offer actionable steps without exposing their original details', () => {
  const e = explainError(new DOMException('token=synthetic-value', 'NetworkError'));
  assert.match(e.nextStep, /retry manually/);
  assert.doesNotMatch(e.message, /synthetic-value/);
});
