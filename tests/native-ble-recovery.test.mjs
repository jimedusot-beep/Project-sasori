import test from 'node:test';
import assert from 'node:assert/strict';
import { HubSession } from '../site/lib/hub-session.js';
import { createNativeBluetooth } from '../site/lib/native-bluetooth.js';
import { hubFailure } from '../site/lib/hub-records.js';
import { STANDARD_SERVICES } from '../site/lib/standard-controls.js';

// Self-contained failure simulator influenced by the testing approach of
// Nordic CoreBluetoothMock, not imported or copied from that project.
function makeNativeFixture() {
  const registrations = new Map(),
    calls = [];
  let failure = null;
  const plugin = {
    addListener: async (name, callback) => {
      registrations.set(name, callback);
      return { remove: async () => registrations.delete(name) };
    },
    requestDevice: async () => {
      calls.push('choose');
      if (failure) throw Object.assign(new Error('Synthetic Bluetooth failure'), { code: failure });
      return { id: 'synthetic-private-id', name: 'Mock Standard Peripheral' };
    },
    connect: async () => {
      calls.push('connect');
    },
    getService: async ({ uuid }) => ({ uuid }),
    getCharacteristics: async () => ({ characteristics: [] }),
    disconnect: async () => {
      calls.push('disconnect');
    },
  };
  return {
    plugin,
    calls,
    registrations,
    rejectWith(code) {
      failure = code;
    },
    allowSelection() {
      failure = null;
    },
  };
}

for (const [nativeCode, expected] of [
  ['NotFoundError', 'selection-cancelled'],
  ['AbortError', 'user-stop'],
  ['SecurityError', 'permission-denied'],
  ['NotSupportedError', 'platform-unsupported'],
  ['TimeoutError', 'operation-timeout'],
  ['NetworkError', 'connection-lost'],
  ['InvalidStateError', 'not-ready'],
]) {
  test('native BLE error ' + nativeCode + ' yields a beginner-facing recovery result', async () => {
    const f = makeNativeFixture();
    f.rejectWith(nativeCode);
    const session = new HubSession({
      familyId: 'ble-standard/v1',
      bluetooth: createNativeBluetooth(f.plugin),
      chooserMs: 800,
      operationMs: 800,
    });
    await assert.rejects(session.connect(), { name: nativeCode });
    const result = session.snapshot();
    assert.equal(result.failure.code, expected);
    assert.ok(result.failure.title.length > 0);
    assert.ok(result.failure.hint.length > 10);
    assert.equal(result.physicalEffectVerified, false);
    assert.equal(f.calls.includes('connect'), false);
    assert.equal(f.registrations.size, 0);
    session.stop();
  });
}

test('timeout can be retried without ghost listeners or fabricated hardware success', async () => {
  const f = makeNativeFixture();
  const session = new HubSession({
    familyId: 'ble-standard/v1',
    bluetooth: createNativeBluetooth(f.plugin),
    chooserMs: 800,
    operationMs: 800,
  });
  f.rejectWith('TimeoutError');
  await assert.rejects(session.connect(), { name: 'TimeoutError' });
  assert.equal(f.registrations.size, 0);
  f.allowSelection();
  const ready = await session.connect();
  assert.equal(ready.state, 'connected');
  assert.equal(ready.capabilities.alert, false);
  assert.equal(session.can('alert'), false);
  assert.equal(ready.hardwareVerified, false);
  session.stop();
  assert.equal(session.snapshot().state, 'disconnected');
  assert.equal(f.registrations.size, 0);
  assert.equal(f.calls.filter((v) => v === 'choose').length, 2);
  assert.equal(f.calls.filter((v) => v === 'connect').length, 1);
});

test('hub generic error does not leak messages or misclassify unsupported platforms', () => {
  assert.equal(hubFailure(new Error('private arbitrary detail')).code, 'connection-failed');
  assert.equal(
    hubFailure({ code: 'password-rejected', name: 'NotSupportedError' }).code,
    'password-rejected',
  );
  assert.equal(hubFailure({ name: 'NotSupportedError' }).code, 'platform-unsupported');
  assert.ok(
    !JSON.stringify(hubFailure(new Error('private arbitrary detail'))).includes(
      'private arbitrary',
    ),
  );
});

const nativeStandardOptions = {
  acceptAllDevices: true,
  optionalServices: [...STANDARD_SERVICES],
  sasoriStandardControls: true,
};

test('unexpected native disconnect revokes an in-flight connection and permits retry', async () => {
  const f = makeNativeFixture();
  const bluetooth = createNativeBluetooth(f.plugin);
  let completeConnect;
  f.plugin.connect = () =>
    new Promise((resolve) => {
      f.calls.push('connect');
      completeConnect = resolve;
    });
  const previous = await bluetooth.requestDevice(nativeStandardOptions);
  const inFlight = previous.gatt.connect();
  const oldCallback = f.registrations.get('disconnected');
  oldCallback({
    id: 'synthetic-private-id',
    reason: 'unexpected',
    errorCode: 'NetworkError',
  });
  completeConnect();
  await assert.rejects(inFlight, { name: 'AbortError' });
  assert.equal(previous.gatt.connected, false);
  assert.equal(f.registrations.size, 0);

  f.plugin.connect = async () => {
    f.calls.push('connect');
  };
  const current = await bluetooth.requestDevice(nativeStandardOptions);
  await current.gatt.connect();
  const disconnectsBefore = f.calls.filter((call) => call === 'disconnect').length;
  oldCallback({
    id: 'synthetic-private-id',
    reason: 'unexpected',
    errorCode: 'NetworkError',
  });
  previous.gatt.disconnect();
  assert.equal(current.gatt.connected, true);
  assert.equal(f.calls.filter((call) => call === 'disconnect').length, disconnectsBefore);
  current.gatt.disconnect();
  assert.equal(current.gatt.connected, false);
  assert.equal(f.registrations.size, 0);
});

test('cancelled native session drops its GATT authority before the next chooser', async () => {
  const f = makeNativeFixture();
  const bluetooth = createNativeBluetooth(f.plugin);
  const previous = await bluetooth.requestDevice(nativeStandardOptions);
  await previous.gatt.connect();
  bluetooth.cancelRequest();
  assert.equal(previous.gatt.connected, false);
  assert.equal(f.registrations.size, 0);

  const current = await bluetooth.requestDevice(nativeStandardOptions);
  await current.gatt.connect();
  const disconnectsBefore = f.calls.filter((call) => call === 'disconnect').length;
  previous.gatt.disconnect();
  assert.equal(current.gatt.connected, true);
  assert.equal(f.calls.filter((call) => call === 'disconnect').length, disconnectsBefore);
  current.gatt.disconnect();
  assert.equal(current.gatt.connected, false);
  assert.equal(f.registrations.size, 0);
});
