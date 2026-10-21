import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { AuthExperiment } from '../site/lib/auth.js';
import { SimulationTransport } from '../site/lib/simulation.js';
test('authentication fixtures refuse live mode and missing explicit consent', () => {
  const auth = new AuthExperiment();
  assert.throws(() => auth.start(), /synthetic/);
  assert.throws(() => auth.start({ simulation: true }), /explicitly/);
});
for (const scenario of ['success', 'rejected', 'inconclusive', 'timeout'])
  test('synthetic auth outcome: ' + scenario, async () => {
    const events = [],
      auth = new AuthExperiment((e) => events.push(e));
    auth.start({ simulation: true, consent: true, scenario, delayMs: 1, timeoutMs: 12 });
    await wait(20);
    assert.equal(auth.state, scenario);
    assert.ok(events.every((e) => e.synthetic && !e.hardwareTraffic));
  });
test('auth refuses duplicate runs, invalid scenarios and excessive budgets', () => {
  const auth = new AuthExperiment();
  for (const options of [
    { timeoutMs: 6000 },
    { maxPackets: 5 },
    { maxPackets: 1.5 },
    { scenario: 'invented' },
    { delayMs: -1 },
  ])
    assert.throws(() => auth.start({ simulation: true, consent: true, ...options }));
  auth.start({ simulation: true, consent: true });
  assert.throws(() => auth.start({ simulation: true, consent: true }), /already/);
  auth.cancel();
});
test('packet budget yields inconclusive and cancellation cannot become success later', async () => {
  const auth = new AuthExperiment();
  auth.start({ simulation: true, consent: true, maxPackets: 1, delayMs: 1, timeoutMs: 20 });
  await wait(5);
  assert.equal(auth.state, 'inconclusive');
  auth.start({ simulation: true, consent: true, delayMs: 4, timeoutMs: 20 });
  auth.cancel();
  await wait(10);
  assert.equal(auth.state, 'cancelled');
});
test('simulation is explicitly labeled, cancellable and never requests Bluetooth', async () => {
  const events = [],
    sim = new SimulationTransport((e) => events.push(e));
  sim.connect();
  sim.disconnect('user');
  await wait(170);
  assert.ok(events.every((e) => e.synthetic));
  assert.equal(events.filter((e) => e.type === 'packet').length, 0);
});
