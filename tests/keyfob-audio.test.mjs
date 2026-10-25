import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONDITIONS, sampleLevel, calibrateNoise, detectionThreshold,
  recordTrial, summarizeTrials, csvForTrials,
} from '../site/lib/keyfob-audio.js';

test('silence, waveforms and calibration are bounded and deterministic', () => {
  assert.equal(sampleLevel(new Uint8Array(16).fill(128)), 0);
  assert.ok(sampleLevel(new Uint8Array([128, 255, 128, 0])) > 0.6);
  assert.equal(sampleLevel([]), 0);
  assert.throws(() => calibrateNoise(Array(11).fill(0.01)), /Not enough/);
  assert.equal(calibrateNoise([0.01, 0.02, 0.03, 0.02, 0.01, 0.02, 0.06, 0.03, 0.02, 0.02, 0.01, 0.01]), 0.03);
});
test('sensitivity order and inputs are checked', () => {
  assert.ok(detectionThreshold(0.02, 'sensitive') < detectionThreshold(0.02, 'normal'));
  assert.ok(detectionThreshold(0.02, 'normal') < detectionThreshold(0.02, 'strict'));
  assert.throws(() => detectionThreshold(-1), /valid/);
  assert.throws(() => detectionThreshold(0, 'unknown'), /Unknown/);
  assert.ok(detectionThreshold(50) <= 1);
});
function trial(condition, detected) {
  return recordTrial({
    condition, events: detected ? [250] : [], peak: detected ? 0.08 : 0.005,
    threshold: 0.03, noise: 0.004, at: '2026-10-25T18:00:00.000Z',
  });
}
test('trials reject invalid conditions, timestamps and levels', () => {
  assert.equal(CONDITIONS.length, 5);
  assert.deepEqual(trial('lock', false).eventMs, []);
  assert.throws(() => trial('bad', true), /Unknown/);
  assert.throws(() => recordTrial({
    condition: 'lock', events: [2001], peak: 0.1, threshold: 0.02, noise: 0.01,
    at: '2026-10-25T18:00:00.000Z',
  }), /timings/);
});
test('targets alone never generate an unjustified pass', () => {
  const onlyTargets = [...Array(5).fill(null).map(() => trial('lock', true)),
    ...Array(5).fill(null).map(() => trial('unlock', true))];
  const result = summarizeTrials(onlyTargets);
  assert.equal(result.ready, false);
  assert.match(result.verdict, /Not enough evidence/);
});
test('five each of target and controls are required; detected unrelated taps fail specificity', () => {
  const good = [
    ...Array.from({ length: 5 }, (_, i) => trial('lock', i < 4)),
    ...Array.from({ length: 5 }, (_, i) => trial('unlock', i < 4)),
    ...Array.from({ length: 5 }, (_, i) => trial('quiet', i === 0)),
    ...Array.from({ length: 5 }, (_, i) => trial('tap', i === 0)),
  ];
  const measured = summarizeTrials(good);
  assert.equal(measured.ready, true);
  assert.match(measured.verdict, /Promising acoustic button trigger/);
  assert.equal(measured.groups.lock.rate, 0.8);
  const bad = good.map((row) => row.condition === 'tap' ? trial('tap', true) : row);
  assert.match(summarizeTrials(bad).verdict, /NOT fob-specific/);
  const unreliable = good.map((row) => row.condition === 'lock' ? trial('lock', false) : row);
  assert.match(summarizeTrials(unreliable).verdict, /Unreliable/);
});
test('CSV uses only measured rows, quoted fields and no audio', () => {
  const csv = csvForTrials([trial('unlock', true)]);
  assert.match(csv, /^condition,detected,eventCount,eventMs,peak,threshold,background,at\n/);
  assert.match(csv, /"unlock","true","1","250"/);
  assert.ok(!csv.includes('radio payload'));
});
