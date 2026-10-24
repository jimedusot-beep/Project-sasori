import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FurbyControls, createFurbyDemo } from '../site/lib/furby-controls.js';
import {
  FURBY_SERVICE,
  FURBY_RX,
  FURBY_TX,
  furbyCommand,
  decodeFurbyReply,
} from '../site/lib/furby-codec.js';
import { DeviceControls } from '../site/lib/device-controls.js';
import { HubSession } from '../site/lib/hub-session.js';
import { RoutineRunner } from '../site/lib/routines.js';
import { createNativeBluetooth } from '../site/lib/native-bluetooth.js';
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const view = (bytes) => new DataView(Uint8Array.from([99, ...bytes, 99]).buffer, 1, bytes.length);
async function fixture(options = {}) {
  const device = await createFurbyDemo().requestDevice();
  const [rx, tx] = await (await device.gatt.getPrimaryService(FURBY_SERVICE)).getCharacteristics();
  const calls = [],
    original = tx.writeValueWithoutResponse;
  tx.writeValueWithoutResponse = async (bytes) => {
    calls.push([...bytes]);
    return original(bytes);
  };
  const bluetooth = { requestDevice: () => Promise.resolve(device) };
  const runner = new FurbyControls({
    bluetooth,
    operationMs: 50,
    sessionMs: 2000,
    alertMs: 8,
    ...options,
  });
  const notify = (bytes) => {
    rx.value = view(bytes);
    rx.dispatchEvent(new Event('characteristicvaluechanged'));
  };
  return { device, rx, tx, runner, calls, notify };
}
test('Furby binary framing is distinct from Elmo and rejects action/firmware writes', () => {
  assert.equal(FURBY_SERVICE, 'dab91435-b5a1-e29c-b041-bcd562613bde');
  assert.equal(FURBY_RX, 'dab91382-b5a1-e29c-b041-bcd562613bde');
  assert.equal(FURBY_TX, 'dab91383-b5a1-e29c-b041-bcd562613bde');
  assert.deepEqual([...furbyCommand('identify')], [0xfe]);
  assert.deepEqual([...furbyCommand('status')], [0x20, 6]);
  assert.deepEqual([...furbyCommand('alert')], [0x14, 0, 0, 32]);
  assert.deepEqual([...furbyCommand('clear')], [0x14, 0, 0, 0]);
  for (const intent of ['move', 'sound', 'flash', 'mood', 'name', 'constructor', '__proto__'])
    assert.throws(() => furbyCommand(intent), /Unsupported/);
  assert.match(decodeFurbyReply(view([0xfe, 4])).information.firmware, /0x04/);
  assert.match(decodeFurbyReply(view([0x22, ...Array(18).fill(0)])).statusText, /undecoded/);
  for (const bytes of [
    [],
    [0xfe],
    [0xfe, 4, 0],
    [0x22],
    [0x22, ...Array(19).fill(0)],
    [0x20, 6],
    [102, 101, 48, 52],
  ])
    assert.equal(decodeFurbyReply(view(bytes)), null);
});
test('Furby connection sends no application command and requires exact channels', async () => {
  const f = await fixture();
  await f.runner.connect();
  assert.equal(f.calls.length, 0);
  assert.equal(f.runner.snapshot().capabilities.alert, true);
  f.runner.stop();
  for (const missing of ['notify', 'write', 'uuid']) {
    const g = await fixture();
    if (missing === 'notify') g.rx.properties.notify = false;
    if (missing === 'write') g.tx.properties.writeWithoutResponse = false;
    if (missing === 'uuid') g.tx.uuid = 'dab91383-b5a1-e29c-b041-bcd562613bdf';
    await assert.rejects(g.runner.connect(), /lacks Furby/);
    assert.equal(g.device.gatt.connected, false);
    assert.equal(g.calls.length, 0);
  }
});
test('advertised write-with-response works without relying on deprecated generic writes', async () => {
  const f = await fixture();
  f.tx.properties = { write: true };
  f.tx.writeValueWithResponse = f.tx.writeValueWithoutResponse;
  delete f.tx.writeValueWithoutResponse;
  await f.runner.connect();
  await f.runner.dispatch('identify');
  assert.match(f.runner.information.firmware, /0x04/);
  f.runner.stop();
});
test('firmware/presence replies are strict protocol matches without battery or authentication claims', async () => {
  const f = await fixture();
  await f.runner.connect();
  f.notify([0xfe, 99]);
  assert.deepEqual(f.runner.information, {});
  await f.runner.dispatch('identify');
  await f.runner.dispatch('status');
  assert.deepEqual(f.calls, [[0xfe], [0x20, 6]]);
  assert.equal(f.runner.battery, null);
  assert.equal(f.runner.lastProtocolReply.authenticationVerified, false);
  assert.match(f.runner.statusText, /18 data bytes/);
  f.runner.stop();
});
test('unrelated, wrong-sized and absent replies time out and clear pending work', async () => {
  const f = await fixture();
  f.tx.writeValueWithoutResponse = async () => {
    f.notify([0x20, 6]);
    f.notify([0x22, ...Array(18).fill(0)]);
    f.notify([0xfe, 4, 0]);
  };
  await f.runner.connect();
  await assert.rejects(f.runner.dispatch('identify'), { name: 'TimeoutError' });
  assert.equal(f.runner.state, 'disconnected');
  assert.equal(f.runner.pending.size, 0);
  assert.deepEqual(f.runner.information, {});
});
test('light action waits for off; cleanup failure disconnects without reporting cleared', async () => {
  const f = await fixture();
  const controls = new DeviceControls({
    adapterId: 'furby-connect/v1',
    bluetooth: { requestDevice: async () => f.device },
    alertMs: 8,
  });
  await controls.connect();
  await controls.dispatch('alert');
  assert.deepEqual(f.calls, [
    [0x14, 0, 0, 32],
    [0x14, 0, 0, 0],
  ]);
  assert.equal(controls.lastAction.outcome, 'effect-clear-queued');
  assert.equal(controls.lastAction.physicalEffectVerified, false);
  f.tx.writeValueWithoutResponse = async (bytes) => {
    if (bytes[3] === 0) throw new Error('Synthetic off failure');
  };
  await assert.rejects(controls.dispatch('alert'));
  assert.equal(controls.state, 'disconnected');
  assert.equal(controls.snapshot().effect, 'failed');
});
test('Stop cancels a pending query and an old completion cannot update a replacement connection', async () => {
  const f = await fixture();
  f.tx.writeValueWithoutResponse = async () => {};
  await f.runner.connect();
  const old = f.runner.dispatch('identify');
  const rejected = assert.rejects(old, { name: 'AbortError' });
  f.runner.stop();
  await f.runner.connect();
  const fresh = f.runner.dispatch('status');
  await rejected;
  f.notify([0xfe, 9]);
  assert.deepEqual(f.runner.information, {});
  f.notify([0x22, ...Array(18).fill(0)]);
  await fresh;
  assert.match(f.runner.statusText, /presence/);
  f.runner.stop();
});
test('Furby routines use shared intents and preserve synthetic provenance', async (t) => {
  const session = new HubSession({
    familyId: 'furby-connect/v1',
    synthetic: true,
    alertMs: 8,
    sessionMs: 2000,
  });
  t.after(() => session.stop());
  await session.connect();
  const light = session.dispatch('alert');
  assert.equal(session.can('status'), false);
  await light;
  assert.equal(session.can('status'), true);
  const report = await new RoutineRunner().run(
    {
      id: 'routine-furby-check',
      name: 'Furby check',
      familyId: 'furby-connect/v1',
      steps: [
        { kind: 'action', intent: 'identify', args: {} },
        { kind: 'action', intent: 'status', args: {} },
        { kind: 'action', intent: 'alert', args: {} },
      ],
    },
    session,
  );
  assert.equal(report.outcome, 'completed');
  session.stop();
  assert.equal(session.result().source, 'synthetic');
  assert.equal(session.result().hardwareVerified, false);
});
test('native bridge refuses Furby control before touching the native plugin', async () => {
  const bluetooth = createNativeBluetooth({});
  await assert.rejects(
    bluetooth.requestDevice({
      sasoriControlAdapter: 'furby-connect/v1',
      optionalServices: [FURBY_SERVICE],
    }),
    { name: 'NotSupportedError' },
  );
});
test('session deadline and Stop during a light request perform only best-effort cleanup', async () => {
  const f = await fixture({ sessionMs: 25 });
  await f.runner.connect();
  await delay(45);
  assert.equal(f.runner.state, 'disconnected');
  await f.runner.connect();
  await f.runner.dispatch('alert');
  f.runner.stop();
  assert.equal(f.runner.snapshot().effect, 'disconnected');
  assert.deepEqual(f.calls, [
    [0x14, 0, 0, 32],
    [0x14, 0, 0, 0],
  ]);
});
