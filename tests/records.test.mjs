import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSession,
  recordId,
  validateRecord,
  portableRecord,
  backup,
  parseImport,
  compareSessions,
  sessionText,
} from '../site/lib/records.js';
import { decodePacket } from '../site/lib/protocol.js';
import { Diagnostics, sanitize, sanitizeText, explainError } from '../site/lib/diagnostics.js';
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
test('invalid backup is rejected as a whole before writing any record', () => {
  assert.throws(() =>
    parseImport('{"format":"sasori.backup","schemaVersion":2,"records":[{}]}', 'backup.json'),
  );
  assert.throws(() => parseImport('{bad', 'invalid.json'), /not valid/);
  assert.throws(() => parseImport('x'.repeat(2 * 1024 * 1024 + 1), 'big.txt'), /2 MB/);
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
