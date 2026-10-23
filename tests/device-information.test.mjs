import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BluetoothTransport } from '../site/lib/bluetooth.js';
import {
  DEVICE_INFORMATION_SERVICE as service,
  DEVICE_INFORMATION_FIELDS as fields,
  decodeInformationString,
  validateDeviceInformation,
} from '../site/lib/device-information.js';
import { fakeBluetooth, deferred } from './helpers/bluetooth.mjs';
import { createSession } from '../site/lib/records.js';
import { makeInspection } from '../site/lib/devices.js';
import { portableRecord, parseImport } from '../site/lib/records.js';
import { connectionResult } from '../site/lib/connection-result.js';

const view = (text) => {
  const bytes = new TextEncoder().encode(text);
  return new DataView(bytes.buffer);
};
function fixture() {
  const f = fakeBluetooth(service, fields[0].uuid),
    events = [],
    reads = [];
  const chars = fields.map((field) => ({
    uuid: field.uuid,
    properties: { read: true },
    readValue: async () => {
      reads.push(field.key);
      return view('Synthetic ' + field.key);
    },
  }));
  // A serial-number characteristic must never be read, even when exposed.
  chars.push({
    uuid: '00002a25-0000-1000-8000-00805f9b34fb',
    properties: { read: true },
    readValue: () => {
      throw new Error('Serial number was read');
    },
  });
  f.primary.getCharacteristics = async () => chars;
  const transport = new BluetoothTransport({
    bluetooth: f.bluetooth,
    emit: (e) => events.push(e),
    operationMs: 80,
  });
  return { ...f, chars, events, reads, transport };
}
const options = { service, namePrefix: 'Fixture', durationMs: 1000 };
test('identify reads only the five model/revision fields and immediately disconnects', async () => {
  const f = fixture();
  await f.transport.connect(options);
  assert.equal(f.transport.state, 'disconnected');
  assert.equal(f.events.at(-1).reason, 'identification-complete');
  assert.deepEqual(f.reads, ['manufacturer', 'model', 'hardware', 'firmware', 'software']);
  assert.deepEqual(f.bluetooth.requests[0].optionalServices, [service]);
  assert.equal(
    f.events.findLast((e) => e.type === 'device-information').information.model,
    'Synthetic model',
  );
  assert.equal(f.characteristic.subscribed, 0);
  assert.equal(f.gatt.connected, false);
});
test('unreadable, absent, and malformed fields yield partial information without guessing', async () => {
  const f = fixture();
  f.chars[0].readValue = async () => {
    throw new DOMException('Denied', 'SecurityError');
  };
  f.chars[2].properties.read = false;
  f.chars[3].readValue = async () => new DataView(Uint8Array.of(0xff).buffer);
  await f.transport.connect(options);
  assert.deepEqual(f.events.findLast((e) => e.type === 'device-information').information, {
    model: 'Synthetic model',
    software: 'Synthetic software',
  });
  assert.equal(
    f.events.some((e) => e.type === 'error'),
    false,
  );
});
test('cancelled and timed-out identity reads never publish late information or queue another read', async () => {
  for (const cancel of [true, false]) {
    const f = fixture(),
      pending = deferred(),
      started = deferred();
    f.chars[1].readValue = () => {
      started.resolve();
      return pending.promise;
    };
    const connecting = f.transport.connect(options);
    await started.promise;
    if (cancel) f.transport.disconnect('user');
    if (!cancel) await connecting;
    const before = f.events.filter((e) => e.type === 'device-information').length;
    pending.resolve(view('Late fixture model'));
    await connecting;
    assert.equal(f.events.filter((e) => e.type === 'device-information').length, before);
    assert.equal(f.reads.includes('hardware'), false);
    assert.equal(f.gatt.connected, false);
    if (!cancel) assert.equal(f.events.find((e) => e.type === 'error').error.name, 'TimeoutError');
  }
});
test('device strings are bounded, correctly sliced from DataViews, and stripped of display controls', () => {
  const bytes = new TextEncoder().encode('xx\u0000M\u202eodel\n yy');
  assert.equal(decodeInformationString(new DataView(bytes.buffer, 2, bytes.length - 5)), 'Model');
  assert.throws(() => decodeInformationString(new DataView(new ArrayBuffer(513))));
  assert.throws(() => decodeInformationString(view('a'.repeat(161))));
  assert.throws(() => decodeInformationString(new DataView(Uint8Array.of(0xff).buffer)));
  assert.deepEqual(
    validateDeviceInformation({ model: 'Fixture', serial: 'excluded', command: 'excluded' }),
    { model: 'Fixture' },
  );
  for (const bad of [null, [], { model: 1 }, { model: '' }, { model: 'a'.repeat(161) }])
    assert.throws(() => validateDeviceInformation(bad));
});
test('device-reported fields survive metadata exports and imports without enabling control', () => {
  const record = createSession('live', 'identify');
  record.inspection = makeInspection({ label: 'Fixture' }, service, '');
  record.deviceInformation = { model: 'Fixture', firmware: '1.0', serial: 'excluded' };
  record.endedAt = record.startedAt;
  record.outcome = 'identification-complete';
  record.services = [{ uuid: service, evidence: 'observed-this-session', characteristics: [] }];
  const exported = portableRecord(record);
  assert.equal(exported.deviceInformation.model, 'Fixture');
  assert.equal(exported.deviceInformation.serial, undefined);
  const [imported] = parseImport(JSON.stringify(exported), 'fixture.json');
  imported.importedAt = record.startedAt;
  assert.match(connectionResult(imported).title, /IMPORTED/);
  assert.deepEqual(connectionResult(imported).channels, []);
  assert.throws(() => portableRecord({ ...record, inspection: undefined }), /requires/);
});
