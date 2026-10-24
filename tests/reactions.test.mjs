import test from 'node:test';
import assert from 'node:assert/strict';
import { ElmoRemote, createElmoDemo } from '../site/lib/elmo-remote.js';
import { HubSession } from '../site/lib/hub-session.js';
import { TouchReactions, validateReactions } from '../site/lib/reactions.js';
import { RoutineRunner, validateRoutine } from '../site/lib/routines.js';
import {
  emptyHubData,
  validateHubData,
  portableHubData,
  parseHubBackup,
} from '../site/lib/hub-records.js';
const tick = () => new Promise((resolve) => setImmediate(resolve));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mapping = [{ input: 'nose', soundId: 448 }];
const performance = (steps) => ({
  id: 'routine-performance',
  familyId: 'elmo-l2l/v1',
  name: 'Synthetic show',
  steps,
});

test('control sessions repeat reviewed sounds, pace writes and retain finite limits', async () => {
  let now = 100;
  const remote = new ElmoRemote({ bluetooth: createElmoDemo(), mode: 'control', now: () => now });
  await remote.connect({ password: 'Lab-Only-42' });
  await remote.playSound(9);
  await assert.rejects(remote.playSound(448), { code: 'sound-cooldown' });
  assert.equal(remote.result().soundRequests, 1);
  for (let i = 1; i < 60; i++) {
    now += 4000;
    await remote.playSound(448);
  }
  now += 4000;
  await assert.rejects(remote.playSound(9), { code: 'sound-limit' });
  assert.equal(remote.result().soundRequests, 60);
  assert.equal(remote.result().soundWrites, 60);
  assert.equal(remote.result().physicalEffectVerified, false);
  remote.stop();
  for (const options of [
    { mode: 'unknown' },
    { sessionMs: 30001 },
    { mode: 'control', sessionMs: 600001 },
  ])
    assert.throws(() => new ElmoRemote(options));
});
test('control sessions support volume changes beyond the legacy four-change limit', async () => {
  const remote = new ElmoRemote({ bluetooth: createElmoDemo(), mode: 'control' });
  await remote.connect({ password: 'Lab-Only-42' });
  for (let i = 0; i < 6; i++) await remote.setVolume(i + 1);
  assert.equal(remote.result().volume, 6);
  assert.equal(remote.result().volumeChanges, 6);
  remote.stop();
});
test('reactions repeat on new edges and drop cooldown events without delayed playback', async () => {
  let now = 0;
  const session = new HubSession({
    familyId: 'elmo-l2l/v1',
    mode: 'control',
    synthetic: true,
    now: () => now,
  });
  await session.connect();
  const reactions = new TouchReactions();
  reactions.arm(session, mapping);
  assert.equal(session.snapshot().soundRequests, 0);
  session.simulateTouch();
  await tick();
  assert.equal(reactions.snapshot().sent, 1);
  session.simulateTouch();
  await tick();
  assert.equal(reactions.snapshot().sent, 1);
  assert.equal(reactions.snapshot().skipped, 1);
  now += 4000;
  await tick();
  assert.equal(reactions.snapshot().sent, 1);
  session.simulateTouch();
  await tick();
  assert.equal(reactions.snapshot().sent, 2);
  reactions.disarm();
  now += 4000;
  session.simulateTouch();
  await tick();
  assert.equal(reactions.snapshot().sent, 2);
  assert.equal(reactions.snapshot().source, 'synthetic');
  session.stop();
});
test('disconnect disarms reactions and a replacement connection cannot inherit them', async () => {
  const session = new HubSession({ familyId: 'elmo-l2l/v1', mode: 'control', synthetic: true });
  await session.connect();
  const reactions = new TouchReactions();
  reactions.arm(session, mapping);
  session.stop();
  assert.equal(reactions.active, false);
  await session.connect();
  session.simulateTouch();
  await tick();
  assert.equal(session.snapshot().soundRequests, 0);
  assert.equal(reactions.snapshot().reason, 'connection-ended');
  session.stop();
});
test('reaction expiry and trigger limits stop new actions without auto-rearming', async () => {
  const session = new HubSession({ familyId: 'elmo-l2l/v1', mode: 'control', synthetic: true });
  await session.connect();
  const limited = new TouchReactions({ maxTriggers: 1 });
  limited.arm(session, mapping);
  session.simulateTouch();
  await tick();
  assert.equal(limited.active, false);
  assert.equal(limited.snapshot().reason, 'trigger-limit');
  const expired = new TouchReactions({ durationMs: 15 });
  expired.arm(session, mapping);
  await sleep(25);
  assert.equal(expired.active, false);
  assert.equal(expired.snapshot().reason, 'time-limit');
  session.stop();
});
test('reaction mappings survive portable import as inert settings without private bindings', () => {
  assert.deepEqual(validateReactions([{ ...mapping[0], password: 'private-fixture' }]), mapping);
  for (const rules of [
    [...mapping, ...mapping],
    [{ input: 'motor', soundId: 9 }],
    [{ input: 'nose', soundId: 65535 }],
  ])
    assert.throws(() => validateReactions(rules));
  const data = validateHubData({
    ...emptyHubData(),
    setups: [
      {
        id: 'setup-elmo',
        label: 'Fixture',
        familyId: 'elmo-l2l/v1',
        namePrefix: '',
        deviceId: 'private-fixture',
        elmoMode: 'control',
        reactions: mapping,
      },
    ],
  });
  const text = JSON.stringify(portableHubData(data));
  assert.ok(!text.includes('private-fixture'));
  const imported = parseHubBackup(text);
  assert.deepEqual(imported.setups[0].reactions, mapping);
  assert.equal(imported.setups[0].elmoMode, 'control');
  assert.ok(!Object.hasOwn(imported.setups[0], 'armed'));
  assert.throws(() =>
    validateHubData({ ...data, setups: [{ ...data.setups[0], familyId: 'tv-local/v1' }] }),
  );
});
test('performances accept twelve catalog actions and reject raw operations and excessive plans', () => {
  const actions = Array.from({ length: 12 }, () => ({
    kind: 'action',
    intent: 'sound',
    args: { id: 448 },
  }));
  assert.equal(validateRoutine(performance(actions)).steps.length, 12);
  for (const steps of [
    [...actions, actions[0]],
    Array(33).fill({ kind: 'wait', ms: 50 }),
    [{ kind: 'action', intent: 'raw-write', args: {} }],
  ])
    assert.throws(() => validateRoutine(performance(steps)));
});
test('performances wait for sound pacing; cancelling that wait sends no late command', async () => {
  let calls = 0,
    gap = 20;
  const session = {
    connectionId: 'fixture',
    snapshot: () => ({ familyId: 'elmo-l2l/v1', state: 'connected', synthetic: true }),
    subscribe: () => () => {},
    readyIn: () => gap,
    can: () => true,
    dispatch: async () => {
      calls++;
      gap = 0;
    },
    stop: () => {},
  };
  const runner = new RoutineRunner();
  const promise = runner.run(
    performance([{ kind: 'action', intent: 'sound', args: { id: 9 } }]),
    session,
  );
  assert.equal(calls, 0);
  runner.cancel();
  await promise;
  await sleep(25);
  assert.equal(calls, 0);
  assert.equal(runner.snapshot().outcome, 'cancelled');
  gap = 10;
  const result = await runner.run(
    performance([{ kind: 'action', intent: 'sound', args: { id: 9 } }]),
    session,
  );
  assert.equal(calls, 1);
  assert.equal(result.outcome, 'completed');
});
