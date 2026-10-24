import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchSupportedDevices, SUPPORTED_BLE_SERVICES } from '../site/lib/supported-devices.js';
import { KnownDeviceProbe } from '../site/lib/known-device-probe.js';
import { FURBY_SERVICE, FURBY_RX, FURBY_TX } from '../site/lib/furby-codec.js';
import { ELMO_SERVICE, ELMO_NOTIFY } from '../site/lib/profiles.js';
import { MIP_SERVICES, MIP_RX, MIP_TX } from '../site/lib/mip-controls.js';
import { BATTERY_SERVICE, BATTERY_LEVEL } from '../site/lib/standard-controls.js';
const service = (uuid, entries) => ({
  uuid,
  characteristics: entries.map(([uuid, ...properties]) => ({ uuid, properties })),
});
const furby = () =>
  service(FURBY_SERVICE, [
    [FURBY_RX, 'notify'],
    [FURBY_TX, 'writeWithoutResponse'],
  ]);
const families = (services) => matchSupportedDevices(services).map((m) => m.familyId);
function radio() {
  const device = new EventTarget(),
    calls = [];
  device.name = 'An untrusted name';
  device.gatt = {
    connected: false,
    async connect() {
      calls.push('connect');
      this.connected = true;
      return this;
    },
    disconnect() {
      calls.push('disconnect');
      this.connected = false;
      device.dispatchEvent(new Event('gattserverdisconnected'));
    },
    async getPrimaryService(uuid) {
      calls.push(uuid);
      if (uuid !== FURBY_SERVICE) throw new DOMException('Absent.', 'NotFoundError');
      return {
        uuid,
        getCharacteristics: async () =>
          furby().characteristics.map((c) => ({
            uuid: c.uuid,
            properties: Object.fromEntries(c.properties.map((p) => [p, true])),
            readValue() {
              assert.fail('Recognition must not read values.');
            },
            writeValueWithoutResponse() {
              assert.fail('Recognition must not write.');
            },
            startNotifications() {
              assert.fail('Recognition must not subscribe.');
            },
          })),
      };
    },
  };
  const bluetooth = {
    requestDevice(options) {
      calls.push(options);
      return Promise.resolve(device);
    },
  };
  return { device, calls, bluetooth };
}
test('recognition separates the nearly identical Elmo/Furby services and requires usable channels', () => {
  assert.deepEqual(families([furby()]), ['furby-connect/v1']);
  const elmo = service(ELMO_SERVICE, [
    [ELMO_NOTIFY, 'notify'],
    ['dab91383-b5a1-e29c-b041-bcd562613bdf', 'writeWithoutResponse'],
  ]);
  assert.deepEqual(families([elmo]), ['elmo-l2l/v1']);
  const mixed = furby();
  mixed.uuid = ELMO_SERVICE;
  assert.deepEqual(families([mixed]), []);
  mixed.uuid = FURBY_SERVICE;
  mixed.characteristics[0].properties = ['read'];
  assert.deepEqual(families([mixed]), []);
  assert.deepEqual(families([service(FURBY_SERVICE, [])]), []);
});
test('MiP needs both services; standard fallback needs an actual standard channel', () => {
  const rx = service(MIP_SERVICES[0], [[MIP_RX, 'notify']]);
  const tx = service(MIP_SERVICES[1], [[MIP_TX, 'writeWithoutResponse']]);
  assert.deepEqual(families([rx]), []);
  assert.deepEqual(families([rx, tx]), ['wowwee-mip/v1']);
  assert.deepEqual(families([service(BATTERY_SERVICE, [])]), []);
  assert.deepEqual(families([service(BATTERY_SERVICE, [[BATTERY_LEVEL, 'read']])]), [
    'ble-standard/v1',
  ]);
  assert.deepEqual(families([rx, tx, furby()]), ['furby-connect/v1', 'wowwee-mip/v1']);
  assert.equal(matchSupportedDevices([furby()])[0].hardwareVerified, false);
});
test('names, claimed families, malformed inventories and firmware services cannot create a match', () => {
  for (const input of [
    null,
    {},
    'Furby Connect',
    [{ name: 'Elmo', familyId: 'elmo-l2l/v1' }],
    Array(17).fill(furby()),
    [{ uuid: FURBY_SERVICE, characteristics: [null] }],
  ])
    assert.deepEqual(matchSupportedDevices(input), []);
  const uppercase = furby();
  uppercase.uuid = uppercase.uuid.toUpperCase();
  assert.deepEqual(families([uppercase]), ['furby-connect/v1']);
  assert.equal(
    SUPPORTED_BLE_SERVICES.some((id) => id.includes('1212-efde')),
    false,
  );
});
test('recognition is metadata-only, finite and disconnected before an adapter is suggested', async () => {
  const f = radio(),
    probe = new KnownDeviceProbe({ bluetooth: f.bluetooth, operationMs: 40 });
  const pending = probe.inspect();
  assert.equal(f.calls[0].acceptAllDevices, true);
  assert.deepEqual(f.calls[0].optionalServices, SUPPORTED_BLE_SERVICES);
  const result = await pending;
  assert.deepEqual(
    result.matches.map((m) => m.familyId),
    ['furby-connect/v1'],
  );
  assert.equal(f.device.gatt.connected, false);
  assert.equal(probe.state, 'disconnected');
  assert.equal(probe.pending.size, 0);
  assert.equal(result.device, f.device);
});
test('cancelled chooser completion is discarded and disconnected', async () => {
  const f = radio();
  let choose;
  const probe = new KnownDeviceProbe({
    bluetooth: {
      requestDevice: () =>
        new Promise((resolve) => {
          choose = resolve;
        }),
    },
  });
  const pending = probe.inspect(),
    rejected = assert.rejects(pending, { name: 'AbortError' });
  probe.stop();
  choose(f.device);
  await rejected;
  await Promise.resolve();
  assert.equal(f.calls.includes('connect'), false);
  assert.equal(f.calls.includes('disconnect'), true);
});
test('hung discovery and the overall recognition deadline release the session', async () => {
  for (const options of [{ operationMs: 15 }, { operationMs: 1000, probeMs: 15 }]) {
    const f = radio();
    f.device.gatt.getPrimaryService = () => new Promise(() => {});
    const probe = new KnownDeviceProbe({ bluetooth: f.bluetooth, ...options });
    await assert.rejects(probe.inspect(), (e) => ['TimeoutError', 'AbortError'].includes(e.name));
    assert.equal(f.device.gatt.connected, false);
    assert.equal(probe.pending.size, 0);
  }
});
test('oversized or mismatched GATT inventories abort without yielding a candidate', async () => {
  for (const wrong of ['uuid', 'size']) {
    const f = radio();
    f.device.gatt.getPrimaryService = async (uuid) => ({
      uuid: wrong === 'uuid' ? FURBY_SERVICE : uuid,
      getCharacteristics: async () => Array(129).fill({}),
    });
    const probe = new KnownDeviceProbe({ bluetooth: f.bluetooth });
    await assert.rejects(probe.inspect(), /Unexpected|Invalid/);
    assert.equal(f.device.gatt.connected, false);
  }
});

test('recognition closes a GATT connection that completes after Stop', async () => {
  const f = radio();
  let release, entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  f.device.gatt.connect = () => {
    entered();
    return new Promise((resolve) => {
      release = () => {
        f.device.gatt.connected = true;
        resolve(f.device.gatt);
      };
    });
  };
  const probe = new KnownDeviceProbe({ bluetooth: f.bluetooth });
  const pending = probe.inspect();
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  await started;
  probe.stop();
  release();
  await rejected;
  await Promise.resolve();
  assert.equal(f.device.gatt.connected, false);
  assert.equal(probe.pending.size, 0);
});
