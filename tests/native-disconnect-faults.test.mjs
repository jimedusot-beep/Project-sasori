import test from 'node:test';
import assert from 'node:assert/strict';
import { BluetoothTransport } from '../site/lib/bluetooth.js';
import { createNativeBluetooth } from '../site/lib/native-bluetooth.js';
import { hubFailure } from '../site/lib/hub-records.js';
import { ELMO_SERVICE, ELMO_NOTIFY } from '../site/lib/profiles.js';

function fixture() {
  const listeners = new Map();
  const plugin = {
    addListener: async (name, callback) => {
      listeners.set(name, callback);
      return { remove: async () => listeners.delete(name) };
    },
    requestDevice: async () => ({ id: 'fixture-device', name: 'Test peripheral' }),
    connect: async () => {},
    getService: async () => ({ uuid: ELMO_SERVICE }),
    getCharacteristics: async () => ({
      characteristics: [{ uuid: ELMO_NOTIFY, properties: ['notify'] }],
    }),
    startNotifications: async () => {},
    disconnect: async () => {},
  };
  const events = [];
  const bluetooth = createNativeBluetooth(plugin);
  const transport = new BluetoothTransport({
    bluetooth,
    emit: (event) => events.push(event),
  });
  return { transport, events, listeners };
}

async function inspect(f) {
  await f.transport.connect({
    service: ELMO_SERVICE,
    notify: ELMO_NOTIFY,
    namePrefix: 'Elmo',
    durationMs: 1000,
  });
  assert.equal(f.transport.state, 'inspecting');
}

for (const [reason, nativeCode, expectedName, beginnerCode] of [
  ['native-deadline', 'TimeoutError', 'TimeoutError', 'operation-timeout'],
  ['packet-limit', 'QuotaExceededError', 'QuotaExceededError', 'packet-limit'],
  ['packet-limit', 'AbortError', 'QuotaExceededError', 'packet-limit'],
]) {
  test('native failure: ' + reason + ' retains an actionable error', async () => {
    const f = fixture();
    await inspect(f);
    f.listeners.get('disconnected')({
      id: 'fixture-device',
      reason,
      errorCode: nativeCode,
    });
    const error = f.events.find((event) => event.type === 'error');
    assert.equal(error?.error.name, expectedName);
    assert.equal(hubFailure({ name: expectedName }).code, beginnerCode);
    assert.equal(f.events.at(-1).reason, reason);
    assert.equal(f.transport.state, 'disconnected');
    assert.equal(f.listeners.size, 0);
  });
}

test('user Stop is not reported as a Bluetooth failure', async () => {
  const f = fixture();
  await inspect(f);
  f.listeners.get('disconnected')({
    id: 'fixture-device',
    reason: 'user',
    errorCode: 'AbortError',
  });
  assert.equal(
    f.events.some((event) => event.type === 'error'),
    false,
  );
  assert.equal(f.transport.state, 'disconnected');
  assert.equal(f.listeners.size, 0);
});

test('malformed native notification produces a typed failure', async () => {
  const f = fixture();
  await inspect(f);
  f.listeners.get('notification')({
    id: 'fixture-device',
    uuid: ELMO_NOTIFY,
    hex: 'not-hex',
  });
  const error = f.events.find((event) => event.type === 'error');
  assert.equal(error?.error.name, 'NotSupportedError');
  assert.equal(f.transport.state, 'disconnected');
  assert.equal(f.listeners.size, 0);
});

test('untrusted error names cannot select inherited object properties', () => {
  assert.equal(hubFailure({ name: 'constructor' }).code, 'connection-failed');
  assert.equal(hubFailure({ name: '__proto__' }).code, 'connection-failed');
});
