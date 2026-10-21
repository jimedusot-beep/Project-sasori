import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { BluetoothTransport, withTimeout } from '../site/lib/bluetooth.js';
import { ELMO_SERVICE as service, ELMO_NOTIFY as notify } from '../site/lib/profiles.js';
import { fakeBluetooth, deferred } from './helpers/bluetooth.mjs';
function setup(overrides = {}) {
  const fake = fakeBluetooth(service, notify, overrides),
    events = [];
  const transport = new BluetoothTransport({
    bluetooth: fake.bluetooth,
    emit: (e) => events.push(e),
    operationMs: 20,
    chooserMs: 20,
  });
  return { ...fake, transport, events };
}
test('no connection is requested at construction', () => {
  const { bluetooth } = setup();
  assert.equal(bluetooth.requests.length, 0);
});
test('show-all fallback is explicit and still grants only the selected service', async () => {
  const f = setup();
  await f.transport.connect({ service, notify, showAllDevices: true });
  assert.deepEqual(f.bluetooth.requests[0], {
    acceptAllDevices: true,
    optionalServices: [service],
  });
  f.transport.disconnect();
});
test('chooser is called synchronously and requests only the chosen service', async () => {
  const f = setup();
  const connection = f.transport.connect({ service, notify });
  assert.equal(f.bluetooth.requests.length, 1);
  assert.deepEqual(f.bluetooth.requests[0], {
    filters: [{ namePrefix: 'Elmo' }],
    optionalServices: [service],
  });
  await connection;
  assert.equal(f.transport.state, 'inspecting');
  f.transport.disconnect();
});
test('successful inspection captures service properties, notification offset and clean shutdown', async () => {
  const f = setup();
  await f.transport.connect({ service, notify });
  const backing = new TextEncoder().encode('xxNewModeIdx:12zz');
  f.characteristic.notify(backing.subarray(2, backing.length - 2));
  assert.equal(f.events.find((e) => e.type === 'packet').packet.text, 'NewModeIdx:12');
  assert.equal(f.transport.services[0].characteristics[0].evidence, 'observed-this-session');
  f.transport.disconnect('user');
  assert.equal(f.characteristic.listeners.size, 0);
  assert.equal(f.gatt.connected, false);
  assert.equal(f.events.at(-1).reason, 'user');
});
test('discovery without a notify UUID performs metadata inspection only', async () => {
  const f = setup();
  await f.transport.connect({ service });
  assert.equal(f.characteristic.subscribed, 0);
  f.transport.disconnect();
});
test('duplicate connects are rejected before a second chooser', async () => {
  const f = setup();
  const first = f.transport.connect({ service, notify });
  await assert.rejects(f.transport.connect({ service, notify }), /already active/);
  await first;
  assert.equal(f.bluetooth.requests.length, 1);
  f.transport.disconnect();
});
test('manual stop while chooser pending never connects a late selection', async () => {
  const f = setup(),
    pending = deferred();
  f.bluetooth.requestDevice = () => pending.promise;
  const first = f.transport.connect({ service, notify });
  f.transport.disconnect('user');
  pending.resolve(f.device);
  await first;
  assert.equal(f.gatt.connectCount, 0);
  assert.equal(f.transport.state, 'disconnected');
});
test('late GATT connection after cancellation is closed', async () => {
  const f = setup(),
    pending = deferred();
  f.gatt.connect = () => pending.promise;
  const first = f.transport.connect({ service, notify });
  await wait(1);
  f.transport.disconnect('user');
  f.gatt.connected = true;
  pending.resolve(f.gatt);
  await first;
  assert.equal(f.gatt.connected, false);
  assert.ok(f.gatt.disconnectCount > 0);
});
test('connect timeout closes a later connection and reports the timeout', async () => {
  const f = setup(),
    pending = deferred();
  f.gatt.connect = () => pending.promise;
  await f.transport.connect({ service, notify });
  assert.equal(f.events.find((e) => e.type === 'error').error.name, 'TimeoutError');
  f.gatt.connected = true;
  pending.resolve(f.gatt);
  await wait(1);
  assert.equal(f.gatt.connected, false);
});
test('chooser timeout does not leave the connection manager busy', async () => {
  const f = setup();
  f.bluetooth.requestDevice = () => new Promise(() => {});
  await f.transport.connect({ service, notify });
  assert.equal(f.transport.busy, false);
  assert.equal(f.transport.state, 'disconnected');
});
test('notification-subscription failure removes listeners and disconnects', async () => {
  const f = setup();
  f.characteristic.startNotifications = async () => {
    throw new DOMException('Unsupported', 'NotSupportedError');
  };
  await f.transport.connect({ service, notify });
  assert.equal(f.characteristic.listeners.size, 0);
  assert.equal(f.gatt.connected, false);
});
test('notification-subscription timeout is bounded', async () => {
  const f = setup();
  f.characteristic.startNotifications = () => new Promise(() => {});
  await f.transport.connect({ service, notify });
  assert.equal(f.events.find((e) => e.type === 'error').error.name, 'TimeoutError');
  assert.equal(f.gatt.connected, false);
});
test('missing characteristic and unsupported properties are inconclusive, never auth success', async () => {
  for (const config of [
    { notify: service },
    { notify, properties: { writeWithoutResponse: true } },
  ]) {
    const f = setup(config);
    await f.transport.connect({ service, notify: config.notify });
    assert.ok(f.events.some((e) => e.type === 'error'));
    assert.equal(f.transport.state, 'disconnected');
    assert.equal(f.characteristic.subscribed, 0);
  }
});
test('unexpected disconnect is distinguished and does not reconnect', async () => {
  const f = setup();
  await f.transport.connect({ service, notify });
  f.gatt.connected = false;
  f.device.dispatchEvent(new Event('gattserverdisconnected'));
  assert.equal(f.events.at(-1).reason, 'unexpected');
  assert.equal(f.bluetooth.requests.length, 1);
});
test('inspection deadline disconnects even if discovery is hanging', async () => {
  const f = setup();
  f.transport.operationMs = 300;
  f.primary.getCharacteristics = () => new Promise(() => {});
  await f.transport.connect({ service, notify, durationMs: 100 });
  assert.equal(f.events.filter((e) => e.type === 'state').at(-1).reason, 'inspection-complete');
  assert.equal(f.gatt.connected, false);
});
test('notification budget terminates a noisy device after 500 packets', async () => {
  const f = setup();
  await f.transport.connect({ service, notify });
  for (let i = 0; i < 510; i++) f.characteristic.notify(new Uint8Array([65]));
  assert.equal(f.events.filter((e) => e.type === 'packet').length, 500);
  assert.equal(f.events.at(-1).reason, 'packet-limit');
});
test('reconnect is possible after a manual stop without duplicate notifications', async () => {
  const f = setup();
  await f.transport.connect({ service, notify });
  f.transport.disconnect();
  await f.transport.connect({ service, notify });
  f.characteristic.notify(new Uint8Array([65]));
  assert.equal(f.events.filter((e) => e.type === 'packet').length, 1);
  f.transport.disconnect();
});
test('invalid UUID, excessive duration, firmware services and absent API are rejected', async () => {
  const f = setup();
  await assert.rejects(f.transport.connect({ service: 'guess', notify }), /128-bit/);
  await assert.rejects(f.transport.connect({ service, durationMs: 30001 }), /duration/);
  await assert.rejects(
    f.transport.connect({ service: '00001540-1212-efde-1523-785feabcd123' }),
    /Firmware/,
  );
  const unsupported = new BluetoothTransport({ bluetooth: {} });
  await assert.rejects(unsupported.connect({ service }), /unavailable/);
  assert.equal(f.bluetooth.requests.length, 0);
});
test('withTimeout forwards success, failure and named timeout', async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 10), 7);
  await assert.rejects(withTimeout(Promise.reject(new Error('failed')), 10), /failed/);
  await assert.rejects(withTimeout(new Promise(() => {}), 5), { name: 'TimeoutError' });
});

test('successful live capture traces each Bluetooth stage without any application writes', async () => {
  const f = setup();
  await f.transport.connect({ service, notify });
  const stages = f.events.filter((e) => e.type === 'stage');
  assert.deepEqual(
    stages.map((e) => e.stage),
    [
      'device-chooser',
      'gatt-connection',
      'service-discovery',
      'characteristic-discovery',
      'notification-subscription',
      'inspection-ready',
    ],
  );
  assert.ok(stages.every((e) => Number.isInteger(e.elapsedMs) && e.elapsedMs >= 0));
  assert.equal(f.characteristic.subscribed, 1);
  f.transport.disconnect();
  assert.equal(f.events.filter((e) => e.type === 'stage').at(-1).stage, 'teardown');
});
test('a service failure records the exact failed stage and elapsed time', async () => {
  const f = setup();
  f.gatt.getPrimaryService = async () => {
    throw new DOMException('Unavailable', 'NotFoundError');
  };
  await f.transport.connect({ service, notify });
  const error = f.events.find((e) => e.type === 'error');
  assert.equal(error.error.name, 'NotFoundError');
  assert.equal(error.error.stage, 'service-discovery');
  assert.ok(Number.isInteger(error.error.elapsedMs) && error.error.elapsedMs >= 0);
  assert.equal(f.transport.state, 'disconnected');
});
test('metadata-only inspection omits notification stage and subscription', async () => {
  const f = setup();
  await f.transport.connect({ service, notify: '' });
  const stages = f.events.filter((e) => e.type === 'stage').map((e) => e.stage);
  assert.ok(!stages.includes('notification-subscription'));
  assert.ok(stages.includes('inspection-ready'));
  assert.equal(f.characteristic.subscribed, 0);
  f.transport.disconnect();
});
