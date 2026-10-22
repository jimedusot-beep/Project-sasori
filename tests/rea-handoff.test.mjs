import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { reviewForRea, privateTraceForRea } from '../scripts/rea-handoff.mjs';

function session(source = 'simulated') {
  return {
    format: 'sasori.session', schemaVersion: 2, source, importedAt: null,
    payloadsIncluded: true,
    id: 'private-id', notes: 'do-not-print',
    packets: [{timestamp:'2026-10-22T00:00:00.000Z',characteristic:'private-uuid',
      kind:'unknown', length: 3, hex: 'a1 b2 c3', text: 'do-not-print',
      truncated: false, malformed: false}],
    stats: {packets:1, bytes:3, malformed:0, truncated:0},
  };
}

test('metadata preview reveals no identifiers, hex or free text', () => {
  const report = JSON.stringify(reviewForRea(JSON.stringify(session())));
  assert.doesNotMatch(report, /private-id|private-uuid|a1 b2 c3|a1b2c3|do-not-print/);
  assert.equal(JSON.parse(report).sessions[0].sourceClaim, 'simulated');
});
test('synthetic and previously imported records cannot generate raw traces', () => {
  assert.throws(() => privateTraceForRea(JSON.stringify(session())));
  const imported = session('live'); imported.importedAt = '2026-10-22T00:00:00Z';
  assert.throws(() => privateTraceForRea(JSON.stringify(imported)));
});
test('complete claimed-live raw notifications map into REA JSONL', () => {
  const out = privateTraceForRea(JSON.stringify(session('live')));
  assert.deepEqual(JSON.parse(out.trim()), {transport:'ble', direction:'rx', hex:'a1b2c3'});
});
test('missing bytes, malformed and incorrect lengths cannot export raw traces', () => {
  for (const patch of [{hex:''}, {truncated:true}, {malformed:true}, {length:2}, {hex:'00GG'}]) {
    const s=session('live'); Object.assign(s.packets[0],patch);
    assert.throws(() => privateTraceForRea(JSON.stringify(s)));
  }
});
test('CLI fails closed; private file generated outside repository, never overwritten', () => {
  const folder = mkdtempSync(join(tmpdir(), 'sasori-rea-'));
  const input = join(folder,'session.json'); const output=join(folder,'private-trace.jsonl');
  try {
    writeFileSync(input, JSON.stringify(session('live')));
    const bad = spawnSync(process.execPath, ['scripts/rea-handoff.mjs',input,'--trace',output], {encoding:'utf8'});
    assert.equal(bad.status,1);
    assert.equal(bad.stdout,'');
    const good = spawnSync(process.execPath, ['scripts/rea-handoff.mjs',input,'--trace',output,'--acknowledge-sensitive'], {encoding:'utf8'});
    assert.equal(good.status,0,good.stderr);
    assert.equal(JSON.parse(readFileSync(output,'utf8').trim()).hex,'a1b2c3');
    const second = spawnSync(process.execPath, ['scripts/rea-handoff.mjs',input,'--trace',output,'--acknowledge-sensitive'], {encoding:'utf8'});
    assert.equal(second.status,1);
  } finally {rmSync(folder,{recursive:true,force:true});}
});
