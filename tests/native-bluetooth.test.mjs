import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNativeBluetooth } from '../site/lib/native-bluetooth.js';
import { BluetoothTransport } from '../site/lib/bluetooth.js';
import { ELMO_SERVICE, ELMO_NOTIFY } from '../site/lib/profiles.js';
function fixture() {
  const listeners = new Map(),
    calls = [];
  const plugin = {
    listeners,
    calls,
    addListener: async (name, callback) => {
      listeners.set(name, callback);
      return { remove: async () => listeners.delete(name) };
    },
    requestDevice: async (options) => {
      calls.push(['choose', options]);
      return { id: 'synthetic-native-id', name: 'Synthetic native toy' };
    },
    connect: async () => calls.push(['connect']),
    getService: async () => ({ uuid: ELMO_SERVICE }),
    getCharacteristics: async () => ({
      characteristics: [{ uuid: ELMO_NOTIFY, properties: ['read', 'notify'] }],
    }),
    startNotifications: async () => calls.push(['subscribe']),
    disconnect: async () => calls.push(['disconnect']),
  };
  const events = [];
  const api = createNativeBluetooth(plugin);
  const transport = new BluetoothTransport({
    bluetooth: api,
    emit: (event) => events.push(event),
    chooserMs: 100,
    operationMs: 100,
  });
  return { plugin, api, transport, events };
}
const options = {
  service: ELMO_SERVICE,
  notify: ELMO_NOTIFY,
  durationMs: 1000,
  namePrefix: 'Elmo',
};
test('native facade reuses the inspection lifecycle and never initiates hardware at construction', async () => {
  const f = fixture();
  assert.equal(f.plugin.calls.length, 0);
  assert.equal(f.plugin.listeners.size, 0);
  await f.transport.connect(options);
  assert.equal(f.transport.state, 'inspecting');
  assert.deepEqual(f.plugin.calls[0][1], {
    service: ELMO_SERVICE,
    namePrefix: 'Elmo',
    showAllDevices: false,
  });
  f.plugin.listeners.get('notification')({
    id: 'synthetic-native-id',
    uuid: ELMO_NOTIFY,
    hex: '0001ff',
  });
  assert.equal(f.events.filter((e) => e.type === 'packet').length, 1);
  assert.equal(f.events.find((e) => e.type === 'packet').packet.length, 3);
  f.transport.disconnect('user');
  assert.equal(f.transport.state, 'disconnected');
  assert.equal(f.plugin.listeners.size, 0);
  assert.ok(f.events.at(-1).gattDurationMs >= 0);
  assert.equal(f.api.writeValue, undefined);
});
test('native background disconnect preserves its reason and removes all listeners', async () => {
  const f = fixture();
  await f.transport.connect(options);
  f.plugin.listeners.get('disconnected')({ id: 'synthetic-native-id', reason: 'page-hidden' });
  assert.equal(f.transport.state, 'disconnected');
  assert.equal(f.events.at(-1).reason, 'page-hidden');
  assert.equal(
    f.events.some((e) => e.type === 'warning'),
    false,
  );
  assert.equal(f.plugin.listeners.size, 0);
});
test('foreign, stale, or invalid native notifications cannot become capture data', async () => {
  const f = fixture();
  await f.transport.connect(options);
  const callback = f.plugin.listeners.get('notification');
  callback({ id: 'other-device', uuid: ELMO_NOTIFY, hex: 'aabb' });
  callback({ id: 'synthetic-native-id', uuid: ELMO_NOTIFY, hex: 'xyz' });
  assert.equal(f.events.filter((e) => e.type === 'packet').length, 0);
  assert.equal(f.transport.state, 'disconnected');
  callback({ id: 'synthetic-native-id', uuid: ELMO_NOTIFY, hex: '00' });
  assert.equal(f.events.filter((e) => e.type === 'packet').length, 0);
});
test('a cancelled native chooser cannot connect after a late selection', async () => {
  const f = fixture();
  let resolveChoice;
  f.plugin.requestDevice = () =>
    new Promise((resolve) => {
      resolveChoice = resolve;
    });
  const connecting = f.transport.connect(options);
  await new Promise((resolve) => setTimeout(resolve, 1));
  f.transport.disconnect('user');
  resolveChoice({ id: 'late', name: 'Late fixture' });
  await connecting;
  assert.equal(f.transport.state, 'disconnected');
  assert.equal(f.plugin.calls.filter((c) => c[0] === 'connect').length, 0);
  assert.equal(f.plugin.listeners.size, 0);
});
test('partial listener-registration failure is cleaned up before device access', async () => {
  const f = fixture(),
    register = f.plugin.addListener;
  f.plugin.addListener = (name, callback) =>
    name === 'notification'
      ? Promise.reject(new Error('Synthetic failure'))
      : register(name, callback);
  await f.transport.connect(options);
  assert.equal(f.plugin.listeners.size, 0);
  assert.equal(f.plugin.calls.filter((c) => c[0] === 'choose').length, 0);
  assert.equal(f.transport.state, 'disconnected');
});
test('Capacitor rejection codes preserve actionable native error categories', async () => {
  for (const [method, name] of [
    ['requestDevice', 'NotFoundError'],
    ['requestDevice', 'AbortError'],
    ['connect', 'TimeoutError'],
    ['connect', 'InvalidStateError'],
    ['getService', 'SecurityError'],
    ['startNotifications', 'NotSupportedError'],
  ]) {
    const f = fixture();
    f.plugin[method] = async () => {
      throw Object.assign(new Error('Synthetic native failure'), { code: name });
    };
    await f.transport.connect(options);
    assert.equal(f.events.find((e) => e.type === 'error').error.name, name);
    assert.equal(f.transport.state, 'disconnected');
    assert.equal(f.plugin.listeners.size, 0);
    if (method === 'requestDevice') assert.equal(f.events.at(-1).reason, 'selection-cancelled');
  }
});
test('a native disconnect retains its failure cause before a pending operation rejects', async () => {
  const f = fixture();
  let rejectService, serviceStarted;
  const waiting = new Promise((resolve) => {
    serviceStarted = resolve;
  });
  f.plugin.getService = () =>
    new Promise((_, reject) => {
      rejectService = reject;
      serviceStarted();
    });
  const connecting = f.transport.connect(options);
  await waiting;
  f.plugin.listeners.get('disconnected')({
    id: 'synthetic-native-id',
    reason: 'service-not-found',
    errorCode: 'NotFoundError',
  });
  rejectService(Object.assign(new Error('Synthetic service failure'), { code: 'NotFoundError' }));
  await connecting;
  assert.equal(f.events.at(-1).reason, 'service-not-found');
  assert.equal(f.events.find((e) => e.type === 'error').error.name, 'NotFoundError');
  assert.equal(f.plugin.listeners.size, 0);
  assert.equal(
    f.events.some((e) => e.type === 'warning'),
    false,
  );
});
