import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { indexedDB } from 'fake-indexeddb';
import {
  POCKET_IR_UUIDS as U,
  PocketIRSession,
  validatePocketConfig,
  parsePocketStatus,
  createPocketDemo,
} from '../site/lib/pocket-ir.js';
import { POCKET_PROFILES } from '../site/lib/pocket-ir-profiles.js';
import {
  emptyPocketData,
  importPocketProfile,
  validatePocketData,
  validatePocketProfile,
} from '../site/lib/pocket-ir-setups.js';
import { ResearchStore } from '../site/lib/storage.js';
const config = POCKET_PROFILES[0].buttons[0];
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
function fixture(options = {}) {
  const writes = [],
    status = new EventTarget();
  const notify = (message) => {
    status.value = new DataView(new TextEncoder().encode(message).buffer);
    status.dispatchEvent(new Event('characteristicvaluechanged'));
  };
  status.properties = { notify: true };
  status.startNotifications = async () => status;
  const writer = (type) => ({
    properties: { write: true },
    writeValueWithResponse: async (bytes) => {
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      writes.push({ type, ...payload });
      if (options.write) return options.write(type, payload, notify);
      notify(type + ':' + payload.slot);
    },
  });
  const configChar = writer('saved'),
    triggerChar = writer('sent');
  const device = new EventTarget();
  device.id = 'private-device-id';
  device.gatt = {
    connected: false,
    connect: async () => {
      device.gatt.connected = true;
      return device.gatt;
    },
    disconnect: () => {
      device.gatt.connected = false;
      device.dispatchEvent(new Event('gattserverdisconnected'));
    },
    getPrimaryService: async () => ({
      getCharacteristic: async (uuid) =>
        ({ [U.config]: configChar, [U.trigger]: triggerChar, [U.status]: status })[uuid],
    }),
  };
  const bluetooth = {
    requestDevice: async (opts) => {
      assert.deepEqual(opts.filters, [{ services: [U.service] }]);
      return device;
    },
  };
  const events = [],
    states = [];
  const session = new PocketIRSession({
    bluetooth,
    timeoutMs: 50,
    chooserMs: 50,
    gapMs: 0,
    onStatus: (value) => events.push(value),
    onState: (value) => states.push(value),
  });
  return {
    session,
    device,
    bluetooth,
    writes,
    notify,
    status,
    configChar,
    triggerChar,
    events,
    states,
  };
}
test('reviewed starter frames follow NEC and Samsung byte encodings, with named actions', () => {
  const reverse = (value) =>
    Number.parseInt(value.toString(2).padStart(8, '0').split('').reverse().join(''), 2);
  const frame = (a, b, c, d) =>
    '0x' +
    [a, b, c, d]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  assert.equal(frame(reverse(7), reverse(7), reverse(2), reverse(2) ^ 255), config.code);
  assert.equal(
    frame(reverse(4), reverse(4) ^ 255, reverse(8), reverse(8) ^ 255),
    POCKET_PROFILES[1].buttons[0].code,
  );
  for (const p of POCKET_PROFILES) {
    assert.equal(validatePocketProfile(p).buttons.length, 5);
    assert.ok(p.buttons.every((b) => b.label.length));
  }
  assert.ok(POCKET_PROFILES.every((p) => !p.buttons.some((b) => b.proto === 'SONY')));
});
test('config rejects unsupported protocols, ambiguous widths, overflow and invalid slots', () => {
  for (const change of [
    { slot: 0 },
    { slot: 6 },
    { proto: 'RAW' },
    { bits: 31 },
    { code: '0x100000000' },
    { code: '0x12<script>' },
    { bits: Infinity },
    { code: '0x' },
  ])
    assert.throws(() => validatePocketConfig({ ...config, ...change }));
  assert.equal(
    validatePocketConfig({ ...config, proto: 'SONY', code: '0xA90', bits: 12 }).code,
    '0xA90',
  );
  assert.throws(() => validatePocketConfig({ ...config, proto: 'SONY', code: '0xFFFF', bits: 12 }));
});
test('status parser bounds input, handles invalid UTF8, and never echoes backend secrets', () => {
  for (const value of [
    null,
    {},
    'saved:6',
    'ready\n',
    'x'.repeat(121),
    new Uint8Array([255]),
    new Uint8Array(121),
  ])
    assert.equal(parsePocketStatus(value).type, 'unrecognized');
  const detached = new Uint8Array([1]);
  structuredClone(detached.buffer, { transfer: [detached.buffer] });
  assert.doesNotThrow(() => parsePocketStatus(detached));
  assert.equal(parsePocketStatus('saved:2').slot, 2);
  assert.doesNotMatch(parsePocketStatus('err:password-secret').message, /password-secret/);
});
test('connection reads interface only: no writes and unsolicited saved cannot enable sending', async () => {
  const f = fixture();
  await f.session.connect();
  assert.equal(f.writes.length, 0);
  f.notify('saved:1');
  await assert.rejects(f.session.transmit(1), /Prepare/);
  f.session.disconnect();
  assert.equal(f.device.gatt.connected, false);
});
test('notifications arriving before write completion still require the write response', async () => {
  const done = deferred();
  const f = fixture({
    write: (_type, p, notify) => {
      notify('saved:' + p.slot);
      return done.promise;
    },
  });
  await f.session.connect();
  const task = f.session.configure(config);
  await tick();
  assert.equal(f.session.prepared.size, 0);
  assert.equal(f.session.busy, true);
  done.resolve();
  await task;
  assert.equal(f.session.prepared.has(1), true);
  f.session.disconnect();
});
test('write response without current matching ack expires and invalidates connection', async () => {
  const f = fixture({ write: () => {} });
  await f.session.connect();
  f.notify('saved:1');
  const task = f.session.configure(config);
  await tick();
  f.notify('saved:2');
  f.notify('sent:1');
  await assert.rejects(task, /timed out/);
  assert.equal(f.session.connected, false);
  assert.equal(f.session.prepared.size, 0);
});
test('prepare then send makes exactly one trigger and waits for matching sent', async () => {
  const f = fixture();
  await f.session.connect();
  await f.session.configure(config);
  await f.session.transmit(1);
  assert.deepEqual(
    f.writes.map((x) => x.type),
    ['saved', 'sent'],
  );
  assert.equal(f.writes[1].slot, 1);
  f.session.disconnect();
  await assert.rejects(f.session.transmit(1), /Connect/);
});
test('rapid callers are rejected while busy, and manual sends are paced', async () => {
  const f = fixture();
  f.session.gapMs = 1000;
  await f.session.connect();
  await f.session.configure(config);
  const first = f.session.transmit(1);
  await assert.rejects(f.session.transmit(1), /Wait/);
  await first;
  await assert.rejects(f.session.transmit(1), /moment/);
  assert.equal(f.writes.filter((x) => x.type === 'sent').length, 1);
  f.session.disconnect();
});
test('stop interrupts a hung write promptly and late ack cannot restore prepared slots', async () => {
  const done = deferred();
  const f = fixture({ write: () => done.promise });
  await f.session.connect();
  const task = f.session.configure(config);
  await tick();
  f.session.disconnect();
  await assert.rejects(task, /cancelled/);
  done.resolve();
  f.notify('saved:1');
  await tick();
  assert.equal(f.session.prepared.size, 0);
  assert.equal(f.session.busy, false);
});
test('cancelled chooser is bounded; a late selection is disconnected without writes', async () => {
  const f = fixture(),
    choice = deferred();
  f.session.bluetooth = { requestDevice: () => choice.promise };
  const task = f.session.connect();
  f.session.disconnect();
  await assert.rejects(task, /cancelled/);
  f.device.gatt.connected = true;
  choice.resolve(f.device);
  await tick();
  assert.equal(f.device.gatt.connected, false);
  assert.equal(f.writes.length, 0);
});
test('chooser timeout unlocks UI even if user never chooses a device', async () => {
  const s = new PocketIRSession({
    bluetooth: { requestDevice: () => new Promise(() => {}) },
    chooserMs: 10,
  });
  await assert.rejects(s.connect(), /timed out/);
  assert.equal(s.busy, false);
  assert.equal(s.connected, false);
});
test('late GATT completion cannot overwrite a replacement connection', async () => {
  const old = fixture(),
    next = fixture(),
    connection = deferred(),
    s = old.session;
  old.device.gatt.connect = () => connection.promise;
  const task = s.connect();
  await tick();
  s.disconnect();
  await assert.rejects(task, /cancelled/);
  s.bluetooth = next.bluetooth;
  await s.connect();
  old.device.gatt.connected = true;
  connection.resolve(old.device.gatt);
  await tick();
  assert.equal(s.device, next.device);
  assert.equal(s.connected, true);
  assert.equal(old.device.gatt.connected, false);
  s.disconnect();
});
test('unmatched characteristic properties fail closed with no writes', async () => {
  const f = fixture();
  f.configChar.properties.write = false;
  await assert.rejects(f.session.connect(), /characteristics/);
  assert.equal(f.writes.length, 0);
});
test('raw write failures and bridge errors produce fixed diagnostics', async () => {
  const f = fixture({
    write: () => {
      throw new Error('private-device-id credential-secret');
    },
  });
  await f.session.connect();
  await assert.rejects(
    f.session.configure(config),
    (error) => !/private|secret/.test(error.message),
  );
  assert.doesNotMatch(
    JSON.stringify(f.events) + JSON.stringify(f.states),
    /private-device|credential/,
  );
});
test('disconnect notification clears preparation and stale notifications stay inert', async () => {
  const f = fixture();
  await f.session.connect();
  await f.session.configure(config);
  f.device.gatt.disconnect();
  f.notify('saved:1');
  assert.equal(f.session.prepared.size, 0);
  assert.equal(f.session.connected, false);
});
test('profile change invalidation requires manual programming again', async () => {
  const f = fixture();
  await f.session.connect();
  await f.session.configure(config);
  f.session.clearPrepared();
  await assert.rejects(f.session.transmit(1), /Prepare/);
  assert.equal(f.writes.length, 1);
  f.session.disconnect();
});
test('offline bridge proves full prepare and named-action workflow without a radio', async () => {
  const s = new PocketIRSession({ bluetooth: createPocketDemo(), gapMs: 0 });
  await s.connect();
  for (const button of POCKET_PROFILES[0].buttons) await s.configure(button);
  await s.transmit(1);
  assert.equal(s.prepared.size, 5);
  s.disconnect();
});
test('profile imports are inert, atomic, strict, bounded, and cannot replace starter profiles', () => {
  const data = emptyPocketData(),
    profile = { ...POCKET_PROFILES[0], id: 'custom-tv' };
  const next = importPocketProfile(JSON.stringify(profile), data);
  assert.equal(data.profiles.length, 0);
  assert.equal(next.selected, 'custom-tv');
  for (const raw of [
    '{',
    'x'.repeat(12001),
    JSON.stringify(POCKET_PROFILES[0]),
    JSON.stringify({ ...profile, bluetoothId: 'secret' }),
    JSON.stringify({ ...profile, buttons: [...profile.buttons, config] }),
    JSON.stringify({ ...profile, name: '<script>' }),
  ])
    assert.throws(() => importPocketProfile(raw, data));
  assert.throws(() =>
    validatePocketProfile({ ...profile, buttons: [profile.buttons[0], profile.buttons[0]] }),
  );
  assert.throws(() => validatePocketData({ ...data, revision: Number.MAX_SAFE_INTEGER }));
  assert.equal(data.profiles.length, 0);
});
test('persistent setups survive reload and revision conflicts preserve saved data', async () => {
  const name = 'pocket-' + crypto.randomUUID(),
    a = await new ResearchStore({ indexedDB, name }).open(),
    b = await new ResearchStore({ indexedDB, name }).open();
  const clean = await a.getPocketData(),
    candidate = importPocketProfile(
      JSON.stringify({ ...POCKET_PROFILES[0], id: 'custom-tv' }),
      clean,
    );
  await a.setPocketData(candidate);
  await assert.rejects(b.setPocketData(clean), /another tab/);
  assert.equal((await b.getPocketData()).selected, 'custom-tv');
  a.db?.close();
  b.db?.close();
  const c = await new ResearchStore({ indexedDB, name }).open();
  assert.equal((await c.getPocketData()).profiles.length, 1);
  c.db?.close();
});
test('memory-only setup storage warns and still enforces revision conflicts', async () => {
  const s = await new ResearchStore({ indexedDB: null }).open(),
    data = await s.getPocketData();
  assert.equal(s.persistent, false);
  assert.match(s.warning, /Temporary/);
  await s.setPocketData(data);
  await assert.rejects(s.setPocketData(data), /another tab/);
  s.db?.close();
});
test('corrupt stored profiles do not silently overwrite original values', async () => {
  const s = await new ResearchStore({
    indexedDB,
    name: 'pocket-corrupt-' + crypto.randomUUID(),
  }).open();
  const tx = s.db.transaction('settings', 'readwrite');
  tx.objectStore('settings').put({ revision: 3, password: 'private' }, 'pocket-ir');
  await new Promise((resolve) => {
    tx.oncomplete = resolve;
  });
  await assert.rejects(s.getPocketData());
  await assert.rejects(s.setPocketData(emptyPocketData()), /another tab/);
  s.db?.close();
});
test('vendored source starts fresh without seeded actions and preserves MIT attribution', async () => {
  const source = await readFile('hardware/pocket-ir/remote_ble/remote_ble.ino', 'utf8');
  assert.doesNotMatch(source, /saveSlot\(1,\s*"SAMSUNG"/);
  assert.match(source, /pendingSlot = 0;\s*\/\/ discard/);
  assert.match(
    await readFile('hardware/pocket-ir/LICENSE-MIT-Koontzie.txt', 'utf8'),
    /Copyright \(c\) 2026 Tyler Koontz/,
  );
});
