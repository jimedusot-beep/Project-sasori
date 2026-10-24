import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createDiscovery, parseCapture, summarizeCapture } from '../site/lib/discovery.js';
import { ResearchStore } from '../site/lib/storage.js';
import {
  MAX_ATLAS_COLUMNS,
  atlasKey,
  buildSignalAtlas,
  compareAtlasPair,
  atlasMetadataExport,
} from '../site/lib/signal-atlas.js';

function fixture(valuesText, changes = {}) {
  const kind = changes.kind || 'bytes';
  const values = parseCapture(valuesText, kind);
  return createDiscovery({
    label: 'Synthetic sample',
    deviceModel: 'Demo board / revision 1',
    sourceNote: 'Synthetic experiment with no physical evidence.',
    method: kind === 'pulses' ? 'infrared' : 'ble',
    evidence: 'synthetic',
    kind,
    payloadsIncluded: true,
    values,
    summary: summarizeCapture(values, kind),
    ...changes,
  });
}

test('Signal Atlas groups by exact model/method/format, not labels or loose device family', () => {
  const a = fixture('00 ff 10');
  const b = fixture('00 aa 10', { deviceModel: '  DEMO   BOARD / revision 1 ' });
  const c = fixture('00 ff', { deviceModel: 'Different board / revision 1' });
  const d = fixture('00 ff', { method: 'internal' });
  const e = fixture('9000 4500', {
    kind: 'pulses',
    method: 'infrared',
    values: [9000, 4500],
    summary: { count: 2, totalUs: 13500, minUs: 4500, maxUs: 9000 },
  });
  const groups = buildSignalAtlas([a, b, c, d, e]);
  assert.equal(groups.length, 4);
  const pair = groups.find((g) => g.counts.total === 2);
  assert.ok(pair);
  assert.equal(atlasKey(a), atlasKey(b));
  assert.equal(pair.counts.retained, 2);
  assert.deepEqual(
    pair.positions.map((p) => p.status),
    ['stable', 'variable', 'stable'],
  );
  assert.equal(pair.evidenceLabel.includes('not hardware verification'), true);
});

test('IR tolerance is inclusive and missing offsets never masquerade as stable', () => {
  const a = fixture('9000 4500 560', { kind: 'pulses', method: 'infrared' });
  const b = fixture('9100 4601', { kind: 'pulses', method: 'infrared' });
  const c = fixture('9000 4600 560', { kind: 'pulses', method: 'infrared' });
  const [group] = buildSignalAtlas([a, b, c], { toleranceUs: 100 });
  assert.deepEqual(
    group.positions.map((p) => p.status),
    ['stable', 'variable', 'partial'],
  );
  assert.equal(group.positions[2].coverage, 2);
  assert.equal(compareAtlasPair(a, b, 100).changed, 1);
  assert.equal(compareAtlasPair(a, b, 100).removed, 1);
});

test('compares byte changes and exports only nonidentifying aggregates', () => {
  const a = fixture('00 a0 02', {
    label: 'Private-toy-serial',
    sourceNote: 'secret=private-secret-value',
  });
  const b = fixture('00 ff 02 03');
  const report = compareAtlasPair(a, b);
  assert.deepEqual(report.differences, [
    { offset: 1, status: 'changed' },
    { offset: 3, status: 'added' },
  ]);
  assert.equal(report.total, 2);
  assert.equal(report.differences[0].first, undefined);
  const publicReport = atlasMetadataExport(buildSignalAtlas([a, b]));
  const text = JSON.stringify(publicReport);
  assert.equal(publicReport.format, 'sasori.signal-atlas-summary');
  assert.equal(publicReport.payloadPolicy, 'aggregate-only-no-identity-or-raw');
  for (const secret of [
    'Private-toy-serial',
    'private-secret-value',
    'Demo board',
    a.id,
    'a0',
    'ff',
    'deviceModel',
    'sourceNote',
    'values',
    'label',
  ])
    assert.doesNotMatch(text, new RegExp(secret));
});

test('imported, synthetic and metadata-only rows remain explicit non-verifications', () => {
  const a = fixture('11 22');
  const b = fixture('11 33', { importedAt: new Date().toISOString(), evidence: 'owner-observed' });
  const meta = fixture('11 33', { payloadsIncluded: false, values: null });
  const [group] = buildSignalAtlas([a, b, meta]);
  assert.deepEqual(group.counts, {
    total: 3,
    retained: 2,
    metadataOnly: 1,
    imported: 1,
    synthetic: 2,
    ownerLabeled: 0,
    community: 0,
  });
  assert.equal(group.comparable, true);
  assert.equal(group.positions[1].status, 'variable');
  assert.match(group.evidenceLabel, /not hardware verification/);
  const [metadataGroup] = buildSignalAtlas([meta]);
  assert.equal(metadataGroup.positions.length, 0);
  assert.equal(metadataGroup.comparable, false);
});

test('limits, mixed identities, source data and malformed capture fail closed', () => {
  const a = fixture('00');
  assert.throws(() => buildSignalAtlas(Array(51).fill(a)), /50/);
  assert.throws(() => buildSignalAtlas([a], { toleranceUs: NaN }));
  assert.throws(() => buildSignalAtlas([a], { toleranceUs: 1000001 }));
  assert.throws(() => buildSignalAtlas([{ ...a, summary: { count: 100, unique: 1 } }]));
  assert.throws(() => compareAtlasPair(a, fixture('ff', { deviceModel: 'different' })));
  assert.throws(() => compareAtlasPair(a, { ...a, payloadsIncluded: false, values: null }));
  const longer = fixture('00 '.repeat(100).trim());
  const [group] = buildSignalAtlas([a, longer]);
  assert.equal(group.positions.length, MAX_ATLAS_COLUMNS);
  assert.equal(group.truncated, true);
});

test('reads the existing Discovery notebook without changing or upgrading captures', async () => {
  const indexedDB = new IDBFactory();
  const name = 'signal-atlas-fixture';
  const writer = await new ResearchStore({ indexedDB, name }).open();
  const a = fixture('aa bb');
  const b = fixture('aa cc', { evidence: 'owner-observed' });
  await writer.saveDiscoveries([a, b]);
  const reader = await new ResearchStore({ indexedDB, name }).open();
  const rows = await reader.listDiscoveries();
  assert.equal(rows.length, 2);
  assert.equal(buildSignalAtlas(rows)[0].counts.total, 2);
  assert.ok(rows.every((r) => r.values.length === 2));
  assert.equal(rows.find((r) => r.id === a.id).evidence, 'synthetic');
});
