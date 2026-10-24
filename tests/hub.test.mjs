import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { ELMO_SOUNDS, elmoSoundCommand, elmoVolumeCommand } from '../site/lib/elmo-codec.js';
import { ElmoRemote, createElmoDemo } from '../site/lib/elmo-remote.js';
import { HubSession } from '../site/lib/hub-session.js';
import { RoutineRunner, validateRoutine } from '../site/lib/routines.js';
import { TVRemote } from '../site/lib/tv-remote.js';
import {
  emptyHubData,
  validateHubData,
  portableHubData,
  parseHubBackup,
  localCompanionURL,
  hubFailure,
} from '../site/lib/hub-records.js';
import { ResearchStore } from '../site/lib/storage.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const recipe = (steps, familyId = 'elmo-l2l/v1') => ({
  id: 'routine-fixture',
  name: 'Synthetic routine',
  familyId,
  steps,
});
const action = (intent, args = {}) => ({ kind: 'action', intent, args });
class SessionFixture {
  constructor(familyId = 'elmo-l2l/v1') {
    this.familyId = familyId;
    this.connectionId = 'connection-one';
    this.state = 'connected';
    this.listeners = new Set();
    this.calls = [];
    this.inputs = {};
    this.sequence = 0;
  }
  snapshot() {
    return {
      familyId: this.familyId,
      connectionId: this.connectionId,
      state: this.state,
      synthetic: true,
      busy: false,
      inputs: this.inputs,
      inputSequence: this.sequence,
    };
  }
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  notify(value) {
    this.inputs = { nose: value };
    this.sequence++;
    this.publish();
  }
  publish() {
    for (const fn of [...this.listeners]) fn(this.snapshot());
  }
  can() {
    return this.state === 'connected';
  }
  async dispatch(intent, args) {
    this.calls.push({ intent, args });
  }
  stop() {
    this.state = 'disconnected';
    this.publish();
  }
}

test('extended Elmo codecs permit only catalog IDs and exact 1–15 integer volume bytes', () => {
  assert.deepEqual(
    ELMO_SOUNDS.map((s) => s.id),
    [9, 94, 444, 445, 448],
  );
  assert.deepEqual([...elmoSoundCommand(444)], [0x10, 0xbc, 1]);
  assert.deepEqual([...elmoVolumeCommand(3)], [0x23, 3]);
  for (const value of [0, 1, -1, 65535, '9', NaN]) assert.throws(() => elmoSoundCommand(value));
  for (const value of [0, 16, 1.1, '3', NaN, Infinity])
    assert.throws(() => elmoVolumeCommand(value));
});
test('Elmo volume requests read back separately, sound is explicit and bounded, and all effects remain unverified', async () => {
  const r = new ElmoRemote({ bluetooth: createElmoDemo(), synthetic: true });
  await r.connect({ password: 'Lab-Only-42' });
  await r.setVolume(3);
  assert.equal(r.result().volumeRequested, 3);
  assert.equal(r.result().volume, 3);
  for (const value of [4, 5, 6]) await r.setVolume(value);
  await assert.rejects(r.setVolume(7), { code: 'volume-limit' });
  await r.playSound(444);
  await assert.rejects(r.playSound(9), { code: 'sound-limit' });
  assert.equal(r.result().soundRequestedId, 444);
  assert.equal(r.result().helloQueued, false);
  assert.equal(r.result().physicalEffectVerified, false);
  r.stop();
});
test('one shared hub runs every demo without real Bluetooth or TV network access', async () => {
  for (const familyId of ['elmo-l2l/v1', 'ble-standard/v1', 'wowwee-mip/v1', 'tv-local/v1']) {
    const h = new HubSession({
      familyId,
      synthetic: true,
      bluetooth: {
        requestDevice() {
          throw new Error('real radio');
        },
      },
      fetcher() {
        throw new Error('real network');
      },
    });
    await h.connect();
    assert.equal(h.snapshot().state, 'connected');
    await h.dispatch('status');
    const output = h.result('heard-or-saw-effect');
    assert.equal(output.source, 'synthetic');
    assert.equal(output.physicalEffectVerified, false);
    h.stop();
  }
});
test('hub actions cannot cross families, unsupported actions cannot write and reports omit all bindings', async () => {
  const h = new HubSession({ familyId: 'elmo-l2l/v1', synthetic: true });
  await h.connect();
  const id = h.connectionId;
  await assert.rejects(h.connect(), { code: 'busy' });
  assert.equal(h.connectionId, id);
  assert.equal(h.can('key', { key: 'home' }), false);
  await assert.rejects(h.dispatch('key', { key: 'home' }));
  await h.dispatch('sound', { id: 9 });
  h.stop();
  const text = JSON.stringify(h.result());
  for (const secret of ['Lab-Only-42', 'deviceId', 'csrf', 'lease', '10203040', '410a8e12ec'])
    assert.ok(!text.includes(secret));
});
test('hub receipt never copies a backend diagnostic object or raw driver text', async () => {
  const h = new HubSession({ familyId: 'ble-standard/v1', synthetic: true });
  await h.connect();
  h.backend.backend.dispatch = async () => {
    throw new Error('private-driver-secret');
  };
  await assert.rejects(h.dispatch('status'));
  assert.ok(!JSON.stringify(h.result()).includes('private-driver-secret'));
  h.stop();
});
test('routine validation drops unknown fields and rejects raw commands, cross-family actions and excessive plans', () => {
  const good = validateRoutine({
    ...recipe([action('sound', { id: 9, password: 'never-kept' })]),
    password: 'never-kept',
  });
  assert.ok(!JSON.stringify(good).includes('never-kept'));
  for (const steps of [
    [action('raw', { hex: 'ff' })],
    [action('sound', { id: 9 }), action('sound', { id: 444 })],
    Array(9).fill(action('status')),
    [{ kind: 'wait', ms: 999999 }],
    [{ kind: 'touch', input: 'motor', timeoutMs: 1000 }],
  ])
    assert.throws(() => validateRoutine(recipe(steps)));
  assert.throws(() =>
    validateRoutine(recipe([{ kind: 'touch', input: 'nose', timeoutMs: 1000 }], 'tv-local/v1')),
  );
});
test('routines start explicitly, run in order and never claim physical success', async () => {
  const s = new SessionFixture(),
    r = new RoutineRunner();
  assert.deepEqual(s.calls, []);
  const result = await r.run(
    recipe([action('volume', { level: 3 }), { kind: 'wait', ms: 50 }, action('sound', { id: 9 })]),
    s,
  );
  assert.deepEqual(
    s.calls.map((c) => c.intent),
    ['volume', 'sound'],
  );
  assert.equal(result.outcome, 'completed');
  assert.equal(result.completedSteps, 3);
  assert.equal(result.physicalEffectVerified, false);
  assert.equal(s.listeners.size, 0);
});
test('cancellation during a wait prevents the next action and disconnects immediately', async () => {
  const s = new SessionFixture(),
    r = new RoutineRunner();
  const pending = r.run(recipe([{ kind: 'wait', ms: 500 }, action('sound', { id: 9 })]), s);
  r.cancel();
  assert.equal(s.state, 'disconnected');
  assert.equal((await pending).outcome, 'cancelled');
  assert.deepEqual(s.calls, []);
  assert.equal(s.listeners.size, 0);
});
test('hung operations hit the routine deadline and cannot cause a following action', async () => {
  const s = new SessionFixture();
  let finish;
  s.dispatch = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const r = new RoutineRunner({ budgetMs: 12 });
  const result = await r.run(recipe([action('status'), action('sound', { id: 9 })]), s);
  assert.equal(result.reason, 'routine-timeout');
  assert.equal(s.state, 'disconnected');
  finish();
  await wait(1);
  assert.equal(result.completedSteps, 0);
});
test('touch triggers ignore preexisting active inputs and duplicate sequence numbers, then fire only once', async () => {
  const s = new SessionFixture();
  s.notify(true);
  const r = new RoutineRunner();
  const pending = r.run(
    recipe([{ kind: 'touch', input: 'nose', timeoutMs: 1000 }, action('sound', { id: 9 })]),
    s,
  );
  s.publish();
  s.notify(true);
  await wait(1);
  assert.equal(s.calls.length, 0);
  s.notify(false);
  s.notify(true);
  s.notify(true);
  assert.equal((await pending).outcome, 'completed');
  assert.equal(s.calls.length, 1);
  assert.equal(s.listeners.size, 0);
});
test('disconnect or a new connection aborts a waiting routine without stopping the new connection', async () => {
  const s = new SessionFixture(),
    r = new RoutineRunner();
  const pending = r.run(recipe([{ kind: 'wait', ms: 500 }, action('sound', { id: 9 })]), s);
  s.connectionId = 'connection-two';
  s.publish();
  assert.equal((await pending).outcome, 'cancelled');
  assert.equal(s.state, 'connected');
  assert.equal(s.calls.length, 0);
});
test('a missing runtime capability fails before an action and family mismatches never start', async () => {
  const s = new SessionFixture(),
    r = new RoutineRunner();
  s.can = () => false;
  assert.equal((await r.run(recipe([action('status')]), s)).reason, 'action-unavailable');
  assert.equal(s.calls.length, 0);
  await assert.rejects(
    new RoutineRunner().run(recipe([action('status')], 'tv-local/v1'), new SessionFixture()),
  );
});
test('portable hub backups omit private bindings, LAN addresses, entity IDs and connection history', () => {
  const data = validateHubData({
    ...emptyHubData(),
    setups: [
      {
        id: 'setup-one',
        familyId: 'tv-local/v1',
        label: 'My TV',
        namePrefix: '',
        companionURL: 'http://192.168.1.20:8765',
        tv: { driver: 'ha-media', target: 'media_player.private_room', device: 'private-label' },
        deviceId: 'private-radio',
        lastResult: { outcome: 'connected', at: '2026-10-23T20:00:00Z', code: '' },
      },
    ],
    routines: [recipe([action('status')])],
  });
  const text = JSON.stringify(portableHubData(data));
  for (const secret of ['192.168', 'private-radio', 'private_room', 'private-label', 'lastResult'])
    assert.ok(!text.includes(secret));
  const restored = parseHubBackup(text);
  assert.notEqual(restored.setups[0].id, data.setups[0].id);
  assert.notEqual(restored.routines[0].id, data.routines[0].id);
  assert.ok(!restored.setups[0].tv);
});
test('malformed and oversized hub imports are atomic and local links cannot embed credentials or public hosts', () => {
  assert.equal(localCompanionURL('http://192.168.1.20:8765'), 'http://192.168.1.20:8765/hub.html');
  for (const value of [
    'https://example.com',
    'http://169.254.169.254',
    'http://user:pass@localhost:8765',
    'http://localhost:8765/?token=private',
    'javascript:alert(1)',
  ])
    assert.throws(() => localCompanionURL(value));
  assert.throws(() => parseHubBackup('x'.repeat(64001)));
  assert.throws(() =>
    validateHubData({
      ...emptyHubData(),
      setups: [{ id: 'setup-x', label: 'Bad', familyId: 'raw', namePrefix: '' }],
    }),
  );
  assert.equal(hubFailure(new Error('private-driver-data')).code, 'connection-failed');
});
test('hub data shares IndexedDB v4, survives reopen, preserves older preferences and rejects concurrent overwrites', async () => {
  const factory = new IDBFactory(),
    a = await new ResearchStore({ indexedDB: factory, name: 'hub-fixture' }).open();
  const b = await new ResearchStore({ indexedDB: factory, name: 'hub-fixture' }).open();
  await a.setSettings({ oldPreference: 'kept' });
  const first = await a.getHubData(),
    second = await b.getHubData();
  first.routines.push(recipe([action('status')]));
  await a.setHubData(first);
  await assert.rejects(b.setHubData(second), /another window/);
  assert.equal((await b.getHubData()).routines.length, 1);
  assert.deepEqual(await b.getSettings(), { oldPreference: 'kept' });
  assert.equal(a.db.version, 4);
  a.db.close();
  b.db.close();
});
test('TV requests are restricted to fixed relative companion endpoints, and hosted mode sends nothing', async () => {
  let calls = 0;
  const hosted = new TVRemote({
    fetcher: () => {
      calls++;
    },
  });
  await assert.rejects(hosted.connect({ target: '192.168.1.30' }), { code: 'helper-required' });
  const local = new TVRemote({
    companion: true,
    fetcher: () => {
      calls++;
    },
  });
  await assert.rejects(local.request('https://example.com'), { code: 'action-unavailable' });
  assert.equal(calls, 0);
});
test('TV pairing, leases and CSRF stay out of snapshots and remote actions require reported support', async () => {
  const requests = [],
    csrf = 'a'.repeat(64),
    lease = 'b'.repeat(64);
  const tv = new TVRemote({
    companion: true,
    fetcher: async (path, options) => {
      requests.push({ path, options });
      const body =
        path === '/api/bootstrap'
          ? { paired: true, csrf }
          : path === '/api/tv/connect'
            ? {
                lease,
                keys: ['home'],
                information: { model: 'Fixture TV' },
                physicalEffectVerified: true,
              }
            : { requestQueued: true };
      return { ok: true, text: async () => JSON.stringify(body) };
    },
  });
  await tv.connect({ driver: 'roku', target: '192.168.1.30', pin: '000000' });
  await assert.rejects(tv.dispatch('key', { key: 'volume-up' }), { code: 'action-unavailable' });
  await tv.dispatch('key', { key: 'home' });
  assert.equal(JSON.stringify(tv.snapshot()).includes(lease), false);
  assert.equal(JSON.stringify(tv.snapshot()).includes(csrf), false);
  assert.equal(tv.snapshot().physicalEffectVerified, false);
  assert.equal(
    requests.find((r) => r.path === '/api/tv/key').options.headers['X-Sasori-CSRF'],
    csrf,
  );
  tv.stop();
  await wait(1);
});
