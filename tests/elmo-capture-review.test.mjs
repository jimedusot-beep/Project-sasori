import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { reviewElmoCapture } from '../scripts/elmo-capture-review.mjs';
import { createSession, portableRecord, backup } from '../site/lib/records.js';
import { decodePacket } from '../site/lib/protocol.js';
import { ELMO_SERVICE, ELMO_NOTIFY } from '../site/lib/profiles.js';

const corpus = JSON.parse(
  readFileSync(new URL('../experiments/001-elmo-l2l/fixtures/historical-v4.json', import.meta.url)),
);
// Every session envelope in this file is synthetic; only corpus bytes are historical reports.
function session(hexes = corpus.samples.map((sample) => sample.hex)) {
  const record = createSession('simulated');
  record.packets = hexes.map((hex) => decodePacket(Buffer.from(hex, 'hex'), ELMO_NOTIFY));
  record.payloadsIncluded = true;
  record.stats = {
    packets: record.packets.length,
    bytes: record.packets.reduce((sum, packet) => sum + packet.length, 0),
    malformed: 0,
    truncated: 0,
  };
  return record;
}
const review = (record) => reviewElmoCapture(JSON.stringify(record));

test('offline review counts exact historical bytes without upgrading synthetic provenance', () => {
  const result = review(session());
  assert.equal(result.offlineOnly, true);
  assert.equal(result.protocolVerdict, 'inconclusive');
  const [record] = result.records;
  assert.equal(record.sourceClaim, 'simulated');
  assert.equal(record.independentlyVerified, false);
  assert.equal(record.completeRawPackets, 3);
  assert.deepEqual(record.exactHistoricalMatches, {
    'v4-mode-text': 1,
    'v4-sleep-text': 1,
    'v4-empty-text': 1,
  });
  assert.deepEqual(record.patterns, { mode: 1, sleep: 1, unknown: 1 });
});

test('metadata-only records never interpret cached kind, text, or hidden hex', () => {
  const input = session();
  input.payloadsIncluded = false;
  const [record] = review(input).records;
  assert.equal(record.completeRawPackets, 0);
  assert.equal(record.omittedPackets, 3);
  assert.deepEqual(record.patterns, { mode: 0, sleep: 0, unknown: 0 });
  assert.equal(
    Object.values(record.exactHistoricalMatches).reduce((a, b) => a + b, 0),
    0,
  );
  const [portable] = review(portableRecord(input)).records;
  assert.equal(portable.omittedPackets, 3);
});

test('fragments, concatenation, and synthetic auth-like bytes cannot establish authentication', () => {
  const input = session([
    corpus.samples[0].hex.slice(0, 8),
    corpus.samples[0].hex.slice(8),
    corpus.samples[0].hex + corpus.samples[1].hex,
    '01',
    '4001',
    '4101',
    'ff',
  ]);
  // Stored descriptions and outcome are untrusted claims, never decoded as protocol evidence.
  input.outcome = 'authenticated';
  for (const packet of input.packets) packet.kind = 'mode-observation';
  const result = review(input);
  assert.equal(result.protocolVerdict, 'inconclusive');
  assert.deepEqual(result.records[0].patterns, { mode: 0, sleep: 0, unknown: 7 });
  assert.equal(
    Object.values(result.records[0].exactHistoricalMatches).reduce((a, b) => a + b, 0),
    0,
  );
});

test('partial retention and contradictory packet lengths are counted as incomplete', () => {
  const input = session();
  input.packets[0].truncated = true;
  input.packets[1].length += 1;
  input.packets[2].hex = '';
  const [record] = review(input).records;
  assert.equal(record.completeRawPackets, 0);
  assert.equal(record.incompletePackets, 2);
  assert.equal(record.omittedPackets, 1);
  assert.equal(record.statsConsistent, false);
  assert.deepEqual(record.patterns, { mode: 0, sleep: 0, unknown: 0 });
});

test('an imported live claim and candidate endpoint properties remain claims', () => {
  const input = session();
  input.source = 'live';
  input.importedAt = input.startedAt;
  input.services = [
    {
      uuid: ELMO_SERVICE.toUpperCase(),
      evidence: 'observed-this-session',
      characteristics: [{ uuid: ELMO_NOTIFY.toUpperCase(), properties: ['read', 'notify'] }],
    },
  ];
  const [record] = review(input).records;
  assert.equal(record.sourceClaim, 'live');
  assert.equal(record.previouslyImported, true);
  assert.equal(record.independentlyVerified, false);
  assert.equal(record.candidateServiceClaimed, true);
  assert.deepEqual(record.candidateDataNotifyProperties, ['notify', 'read']);
  input.services[0].uuid = 'another-service';
  const [unrelated] = review(input).records;
  assert.equal(unrelated.candidateServiceClaimed, false);
  assert.deepEqual(unrelated.candidateDataNotifyProperties, []);
});

test('metadata backups and empty captures disclose absence of raw evidence', () => {
  const [record] = review(backup([session()])).records;
  assert.equal(record.omittedPackets, 3);
  assert.equal(record.completeRawPackets, 0);
  const [empty] = review(session([])).records;
  assert.equal(empty.packetRecords, 0);
  assert.equal(empty.statsConsistent, true);
  assert.equal(empty.independentlyVerified, false);
});

test('reports whitelist counts and fixed labels without private free text or packet bytes', () => {
  const input = session(['414243']);
  const hidden = 'synthetic-private-free-text';
  input.id = 'private-record-id';
  input.title = hidden;
  input.notes = hidden;
  input.outcome = hidden;
  input.profileId = hidden;
  input.packets[0].text = hidden;
  input.packets[0].characteristic = hidden;
  input.services = [{ uuid: hidden, characteristics: [] }];
  input.events = [{ timestamp: input.startedAt, level: 'info', message: hidden }];
  const before = JSON.stringify(input);
  const result = review(input);
  const output = JSON.stringify(result);
  assert.doesNotMatch(output, /synthetic-private|private-record|414243|41 42 43/);
  assert.equal(result.records[0].patterns.unknown, 1);
  assert.equal(JSON.stringify(input), before);
});

test('invalid JSON, unsupported envelopes, invalid metadata and oversized inputs are refused', () => {
  assert.throws(() => reviewElmoCapture('{bad'));
  assert.throws(() => reviewElmoCapture('{}'));
  assert.throws(() => reviewElmoCapture('x'.repeat(2 * 1024 * 1024 + 1)));
  const input = session();
  input.packets[0].hex = 'not hex';
  assert.throws(() => review(input));
});

for (const flag of ['truncated', 'malformed']) {
  test(`offline reviewer refuses non-boolean ${flag} before deriving raw or metadata counts`, () => {
    for (const payloadsIncluded of [true, false]) {
      for (const value of ['false', 'true', 0, 1, null, [], {}]) {
        const input = session();
        input.payloadsIncluded = payloadsIncluded;
        input.packets[0][flag] = value;
        assert.throws(() => review(input), /Invalid packet flags/);
      }
    }
  });
}

test('CLI reads a local export and emits only the allowlisted report', () => {
  const directory = mkdtempSync(join(tmpdir(), 'sasori-offline-'));
  try {
    const path = join(directory, 'private-local-capture.json');
    writeFileSync(path, JSON.stringify(session()));
    const child = spawnSync(process.execPath, ['scripts/elmo-capture-review.mjs', path], {
      encoding: 'utf8',
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(JSON.parse(child.stdout).protocolVerdict, 'inconclusive');
    assert.doesNotMatch(child.stdout, /private-local-capture|604e6577/);
    const invalid = spawnSync(
      process.execPath,
      ['scripts/elmo-capture-review.mjs', path + '.missing'],
      { encoding: 'utf8' },
    );
    assert.equal(invalid.status, 1);
    assert.equal(invalid.stdout, '');
    assert.doesNotMatch(invalid.stderr, /private-local-capture|ENOENT/);
    const usage = spawnSync(process.execPath, ['scripts/elmo-capture-review.mjs'], {
      encoding: 'utf8',
    });
    assert.equal(usage.status, 1);
    assert.match(usage.stderr, /Usage:/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
