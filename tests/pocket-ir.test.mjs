import test from 'node:test';
import assert from 'node:assert/strict';
import {
  POCKET_IR_UUIDS,
  PocketIRSession,
  parsePocketStatus,
  validatePocketConfig,
  validatePocketSlot,
} from '../site/lib/pocket-ir.js';

const asView = (text) => {
  const bytes = new TextEncoder().encode(text);
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
};

test('the IR adapter accepts only bounded slots, protocol, hex codes and bit lengths', () => {
  assert.deepEqual(
    validatePocketConfig({
      slot: 5,
      proto: 'SAMSUNG',
      code: 'e0e040bf',
      bits: 32,
    }),
    { slot: 5, proto: 'SAMSUNG', code: '0xE0E040BF', bits: 32 },
  );
  assert.equal(validatePocketSlot(1), 1);
  for (const slot of [0, 6, 1.5, '1', NaN]) assert.throws(() => validatePocketSlot(slot));
  for (const candidate of [
    { slot: 1, proto: 'UNKNOWN', code: '12', bits: 8 },
    { slot: 1, proto: 'NEC', code: 'GG', bits: 32 },
    { slot: 1, proto: 'NEC', code: '0x100', bits: 8 },
    { slot: 1, proto: 'NEC', code: '0xFF', bits: 0 },
    { slot: 1, proto: 'NEC', code: '0xFFFFFFFFFFFFFFFFF', bits: 64 },
    { slot: 1, proto: 'NEC', code: '0xFF', bits: 65 },
    { slot: '1', proto: 'NEC', code: '0xFF', bits: 8 },
    null,
  ])
    assert.throws(() => validatePocketConfig(candidate));
});

test('status parser distinguishes attempted send from real-world outcome', () => {
  assert.deepEqual(parsePocketStatus(asView('saved:3')), {
    type: 'saved',
    slot: 3,
    message: 'Stored · slot 3.',
  });
  assert.match(parsePocketStatus(asView('sent:2')).message, /not proof/);
  assert.equal(parsePocketStatus(asView('pressed:1')).type, 'pressed');
  assert.equal(parsePocketStatus(asView('ready')).type, 'ready');
  assert.equal(parsePocketStatus(asView('err:slot 1 empty')).type, 'error');
  assert.equal(parsePocketStatus(asView('sent:19')).type, 'unrecognized');
  assert.equal(parsePocketStatus(asView('\u0000secret')).type, 'unrecognized');
  assert.equal(parsePocketStatus(asView('a'.repeat(121))).type, 'unrecognized');
});

function fixture() {
  const chars = new Map();
  const makeChar = (uuid) => {
    const observers = new Map();
    const c = {
      writes: [],
      addEventListener: (key, fn) => observers.set(key, fn),
      removeEventListener: (key, fn) => {
        if (observers.get(key) === fn) observers.delete(key);
      },
      startNotifications: async () => {},
      readValue: async () => asView('ready'),
      writeValueWithResponse: async (bytes) => {
        c.writes.push(new TextDecoder().decode(bytes));
      },
      emit: (text) =>
        observers.get('characteristicvaluechanged')?.({
          target: { value: asView(text) },
        }),
    };
    chars.set(uuid, c);
    return c;
  };
  for (const uuid of Object.values(POCKET_IR_UUIDS).slice(1)) makeChar(uuid);
  const listeners = new Map();
  const gatt = {
    connected: false,
    connect: async () => {
      gatt.connected = true;
      return {
        getPrimaryService: async (uuid) => {
          assert.equal(uuid, POCKET_IR_UUIDS.service);
          return { getCharacteristic: async (id) => chars.get(id) };
        },
      };
    },
    disconnect: () => {
      gatt.connected = false;
    },
  };
  const device = {
    id: 'fake-device',
    gatt,
    addEventListener: (type, cb) => listeners.set(type, cb),
    removeEventListener: (type) => listeners.delete(type),
  };
  const requests = [];
  const bluetooth = {
    requestDevice: async (options) => {
      requests.push(options);
      return device;
    },
  };
  return { bluetooth, chars, device, requests, listeners };
}

test('explicit pairing, write-only named config, then one single-slot trigger', async () => {
  const f = fixture();
  const statuses = [];
  const s = new PocketIRSession({
    bluetooth: f.bluetooth,
    onStatus: (status) => statuses.push(status),
  });
  await assert.rejects(s.transmit(1), /Connect/);
  await s.connect();
  assert.equal(s.connected, true);
  assert.equal(statuses[0].type, 'ready');
  assert.deepEqual(f.requests[0], {
    filters: [{ services: [POCKET_IR_UUIDS.service] }],
    optionalServices: [POCKET_IR_UUIDS.service],
  });
  assert.equal(f.chars.get(POCKET_IR_UUIDS.trigger).writes.length, 0);
  assert.equal(f.chars.get(POCKET_IR_UUIDS.config).writes.length, 0);
  await s.configure({ slot: 2, proto: 'SONY', code: '0xA90', bits: 12 });
  assert.deepEqual(JSON.parse(f.chars.get(POCKET_IR_UUIDS.config).writes[0]), {
    slot: 2,
    proto: 'SONY',
    code: '0xA90',
    bits: 12,
  });
  f.chars.get(POCKET_IR_UUIDS.status).emit('saved:2');
  assert.equal(statuses.at(-1).type, 'saved');
  await s.transmit(2);
  assert.deepEqual(f.chars.get(POCKET_IR_UUIDS.trigger).writes, ['{"slot":2}']);
  s.disconnect();
  assert.equal(f.device.gatt.connected, false);
  assert.equal(s.connected, false);
  const count = statuses.length;
  f.chars.get(POCKET_IR_UUIDS.status).emit('sent:2');
  assert.equal(statuses.length, count, 'disconnected notifications must be ignored');
});

test('stale Bluetooth chooser is discarded if user leaves before selection', async () => {
  const f = fixture();
  let release;
  const bluetooth = {
    requestDevice: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  };
  const s = new PocketIRSession({ bluetooth });
  const task = s.connect();
  s.disconnect('Page hidden.');
  release(f.device);
  await task;
  assert.equal(s.connected, false);
  assert.equal(f.device.gatt.connected, false);
});
