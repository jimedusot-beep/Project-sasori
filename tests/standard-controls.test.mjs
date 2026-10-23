import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import {
  StandardControls,
  STANDARD_SERVICES,
  CONTROL_ADAPTER,
  BATTERY_SERVICE,
  BATTERY_LEVEL,
  ALERT_SERVICE,
  ALERT_LEVEL,
  createControlDemo,
} from '../site/lib/standard-controls.js';
import {
  DEVICE_INFORMATION_SERVICE,
  DEVICE_INFORMATION_FIELDS,
} from '../site/lib/device-information.js';
import {
  emptyControlSetups,
  validateControlSetups,
  rememberControlDevice,
  portableControlSetups,
  parseControlSetups,
  mergeControlSetups,
} from '../site/lib/control-setups.js';
import { ResearchStore } from '../site/lib/storage.js';
import { createNativeBluetooth } from '../site/lib/native-bluetooth.js';
const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const notFound = () => new DOMException('Absent standard service', 'NotFoundError');
async function fixture(options = {}) {
  const base = createControlDemo(),
    device = await base.requestDevice(),
    calls = [],
    events = [];
  const service = device.gatt.getPrimaryService;
  device.gatt.getPrimaryService = async (uuid) => {
    calls.push(['service', uuid]);
    const result = await service(uuid),
      get = result.getCharacteristics;
    result.getCharacteristics = async () =>
      (await get()).map((c) => {
        const read = c.readValue;
        c.readValue = async () => {
          calls.push(['read', uuid, c.uuid]);
          return read();
        };
        c.writeValueWithoutResponse = async (value) =>
          calls.push(['write', uuid, c.uuid, [...value]]);
        return c;
      });
    return result;
  };
  const bluetooth = {
    requestDevice: (o) => {
      calls.push(['choose', o]);
      return Promise.resolve(device);
    },
  };
  const runner = new StandardControls({
    bluetooth,
    emit: (e) => events.push(e),
    operationMs: 80,
    chooserMs: 80,
    sessionMs: 1000,
    alertMs: 8,
    ...options,
  });
  return { runner, device, bluetooth, calls, events };
}
test('standard controls negotiate one fixed service set and reuse a selected reference without another chooser', async () => {
  const f = await fixture();
  assert.equal(f.calls.length, 0);
  assert.equal(f.runner.snapshot().capabilities.alert, false);
  const connecting = f.runner.connect({ namePrefix: 'Desk' });
  assert.equal(f.calls[0][0], 'choose');
  assert.deepEqual(f.calls[0][1].optionalServices, STANDARD_SERVICES);
  assert.deepEqual(f.calls[0][1].filters, [{ namePrefix: 'Desk' }]);
  await connecting;
  assert.deepEqual(f.runner.snapshot().capabilities, {
    identify: true,
    status: true,
    alert: true,
    stop: true,
  });
  assert.equal(
    f.calls.some(([kind]) => ['read', 'write'].includes(kind)),
    false,
  );
  f.runner.stop();
  assert.equal(f.runner.snapshot().capabilities.status, false);
  await f.runner.connect({ device: f.device });
  assert.equal(f.calls.filter(([kind]) => kind === 'choose').length, 1);
  f.runner.stop();
});
test('shared status / identity read only the observed standard allowlist and malformed battery never becomes status', async () => {
  const f = await fixture();
  await f.runner.connect();
  await f.runner.dispatch('identify');
  await f.runner.dispatch('status');
  assert.equal(f.runner.snapshot().information.model, 'Synthetic desk gadget');
  assert.equal(f.runner.snapshot().battery, 76);
  assert.deepEqual(
    f.calls.filter(([k]) => k === 'read').map((c) => c[2]),
    [...DEVICE_INFORMATION_FIELDS.map((x) => x.uuid), BATTERY_LEVEL],
  );
  f.runner.channels.get(BATTERY_LEVEL).readValue = async () =>
    new DataView(Uint8Array.of(255).buffer);
  await assert.rejects(f.runner.dispatch('status'), /Invalid standard battery/);
  assert.equal(f.runner.snapshot().battery, null);
  assert.equal(f.runner.state, 'connected');
  await assert.rejects(f.runner.dispatch('power'), /device-specific adapter/);
  assert.equal(
    f.calls.some(([k]) => k === 'write'),
    false,
  );
  f.runner.stop();
});
test('missing and nonmatching services do not enable commands; notification properties alone grant no control', async () => {
  const f = await fixture();
  f.device.gatt.getPrimaryService = async (uuid) => {
    if (uuid !== BATTERY_SERVICE) throw notFound();
    return {
      uuid,
      getCharacteristics: async () => [
        {
          uuid: ALERT_LEVEL,
          properties: { read: true, writeWithoutResponse: true },
          readValue() {},
          writeValueWithoutResponse() {},
        },
      ],
    };
  };
  await f.runner.connect();
  assert.deepEqual(f.runner.snapshot().capabilities, {
    identify: false,
    status: false,
    alert: false,
    stop: true,
  });
  for (const intent of ['status', 'alert', 'identify'])
    await assert.rejects(f.runner.dispatch(intent), /does not expose/);
  assert.equal(f.runner.unavailable.length, 2);
  f.runner.stop();
});
test('mild alert writes 01 then 00 exclusively to Immediate Alert and never reports physical acknowledgment', async () => {
  const f = await fixture();
  await f.runner.connect();
  await f.runner.dispatch('alert');
  assert.equal(f.runner.snapshot().alerting, true);
  await assert.rejects(f.runner.dispatch('alert'), /current action/);
  await delay(25);
  assert.deepEqual(
    f.calls.filter(([k]) => k === 'write'),
    [
      ['write', ALERT_SERVICE, ALERT_LEVEL, [1]],
      ['write', ALERT_SERVICE, ALERT_LEVEL, [0]],
    ],
  );
  assert.equal(f.runner.snapshot().alerting, false);
  assert.ok(f.events.some((e) => /no acknowledgment/i.test(e.message)));
  f.runner.stop();
});
test('Stop cancels an outstanding read, removes capabilities and ignores its late result', async () => {
  const f = await fixture();
  await f.runner.connect();
  let finish;
  f.runner.channels.get(BATTERY_LEVEL).readValue = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const reading = f.runner.dispatch('status');
  await f.runner.dispatch('stop');
  await assert.rejects(reading, { name: 'AbortError' });
  finish(new DataView(Uint8Array.of(99).buffer));
  await delay();
  assert.equal(f.runner.snapshot().battery, null);
  assert.equal(f.runner.state, 'disconnected');
  assert.equal(f.device.gatt.connected, false);
  assert.equal(f.runner.pending.size, 0);
});
test('cancelled chooser, connection failure and deadlines leave no running control or automatic retry', async () => {
  const f = await fixture({ operationMs: 10, sessionMs: 60 });
  let finishChoice;
  f.bluetooth.requestDevice = () =>
    new Promise((resolve) => {
      finishChoice = resolve;
    });
  const choosing = f.runner.connect();
  f.runner.stop();
  await assert.rejects(choosing, { name: 'AbortError' });
  finishChoice(f.device);
  await delay();
  assert.equal(f.device.gatt.connected, false);
  f.bluetooth.requestDevice = async () => f.device;
  await f.runner.connect();
  f.runner.channels.get(BATTERY_LEVEL).readValue = () => new Promise(() => {});
  await assert.rejects(f.runner.dispatch('status'), { name: 'TimeoutError' });
  assert.equal(f.runner.state, 'disconnected');
  await f.runner.connect();
  await delay(80);
  assert.equal(f.runner.state, 'disconnected');
  assert.equal(f.runner.channels.size, 0);
});
test('a failed alert-clear disconnects and invalid control budgets are refused', async () => {
  const f = await fixture();
  await f.runner.connect();
  f.runner.channels.get(ALERT_LEVEL).writeValueWithoutResponse = async ([value]) => {
    if (value === 0) throw new Error('Synthetic queue failure');
  };
  await f.runner.dispatch('alert');
  await delay(25);
  assert.equal(f.runner.state, 'disconnected');
  assert.equal(f.device.gatt.connected, false);
  for (const options of [{ alertMs: 2001 }, { sessionMs: Infinity }, { operationMs: 0 }])
    assert.throws(() => new StandardControls(options), /budget/);
});
test('saved controls retain one binding per device and imported backups restore settings without identities or authority', () => {
  let data = rememberControlDevice(emptyControlSetups(), { id: 'private-device', name: 'Desk' });
  const id = data.selectedId;
  data = rememberControlDevice(
    data,
    { id: 'private-device', name: 'Desk' },
    { label: 'My desk', namePrefix: 'Desk' },
  );
  assert.equal(data.targets.length, 1);
  assert.equal(data.selectedId, id);
  const shared = portableControlSetups(data);
  assert.equal(JSON.stringify(shared).includes('private-device'), false);
  const incoming = parseControlSetups(
    JSON.stringify({
      ...data,
      targets: [{ ...data.targets[0], write: 'ff', authenticated: true }],
    }),
  );
  assert.notEqual(incoming.targets[0].id, id);
  assert.equal(incoming.targets[0].deviceId, undefined);
  assert.equal(incoming.targets[0].write, undefined);
  const merged = mergeControlSetups(data, incoming);
  assert.equal(merged.targets.length, 2);
  const rebound = rememberControlDevice(
    incoming,
    { id: 'other-private', name: 'Desk' },
    { targetId: incoming.targets[0].id },
  );
  assert.equal(rebound.targets.length, 1);
  assert.equal(rebound.targets[0].id, incoming.targets[0].id);
  assert.equal(validateControlSetups({ ...data, selectedId: '' }).selectedId, '');
  assert.throws(() => mergeControlSetups(data, data), /Invalid/);
  assert.throws(
    () =>
      validateControlSetups({ ...data, targets: [{ ...data.targets[0], adapterId: 'arbitrary' }] }),
    /Invalid/,
  );
});
test('control setups share IndexedDB v4 without replacing inspection preferences and survive reopen', async () => {
  const name = 'controls-' + crypto.randomUUID();
  let store = new ResearchStore({ indexedDB, name });
  await store.open();
  const data = rememberControlDevice(emptyControlSetups(), {
    id: 'private-reference',
    name: 'Desk',
  });
  await store.setSettings({ profile: '001', service: DEVICE_INFORMATION_SERVICE });
  const saved = await store.setControlSetups(data);
  await assert.rejects(store.setControlSetups(data), /another window/);
  assert.equal(store.db.version, 4);
  store.db.close();
  store = new ResearchStore({ indexedDB, name });
  await store.open();
  assert.deepEqual(await store.getControlSetups(), saved);
  assert.equal((await store.getSettings()).profile, '001');
  store.db.close();
});
test('native standard mode shares capability negotiation but offers only the fixed alert write', async () => {
  const calls = [],
    listeners = new Map();
  const plugin = {
    addListener: async (n, cb) => {
      listeners.set(n, cb);
      return { remove: async () => listeners.delete(n) };
    },
    requestDevice: async (o) => {
      calls.push(['choose', o]);
      return { id: 'native-private', name: 'Native fixture' };
    },
    connect: async () => {},
    getService: async ({ uuid }) => ({ uuid }),
    getCharacteristics: async ({ service }) => ({
      characteristics: (service === ALERT_SERVICE
        ? [ALERT_LEVEL]
        : service === BATTERY_SERVICE
          ? [BATTERY_LEVEL]
          : DEVICE_INFORMATION_FIELDS.map((f) => f.uuid)
      ).map((uuid) => ({
        uuid,
        properties: [uuid === ALERT_LEVEL ? 'writeWithoutResponse' : 'read'],
      })),
    }),
    readStandard: async (o) => {
      calls.push(['read', o]);
      return { hex: o.uuid === BATTERY_LEVEL ? '4c' : '4465736b' };
    },
    alertStandard: async (o) => {
      calls.push(['alert', o]);
      return { queued: true, acknowledged: false };
    },
    disconnect: async () => {},
  };
  const api = createNativeBluetooth(plugin),
    runner = new StandardControls({ bluetooth: api, alertMs: 8 });
  await runner.connect({ rememberedId: 'native-private' });
  assert.equal(calls[0][1].standardControls, true);
  assert.equal(calls[0][1].rememberedId, 'native-private');
  await runner.dispatch('status');
  assert.equal(runner.battery, 76);
  await runner.dispatch('alert');
  await delay(25);
  assert.deepEqual(
    calls.filter(([kind]) => kind === 'alert').map((c) => c[1].level),
    [1, 0],
  );
  await assert.rejects(
    runner.channels.get(ALERT_LEVEL).writeValueWithoutResponse(Uint8Array.of(2)),
    /no-alert \/ mild-alert/,
  );
  assert.equal(CONTROL_ADAPTER.id, 'ble-standard/v1');
  runner.stop();
  await delay();
  assert.equal(listeners.size, 0);
});
