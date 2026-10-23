import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MiPControls,
  MIP_ADAPTER,
  MIP_SERVICES,
  MIP_RX_SERVICE,
  MIP_TX_SERVICE,
  MIP_RX,
  MIP_TX,
  mipCommand,
  decodeMiPReply,
  createMiPDemo,
} from '../site/lib/mip-controls.js';
import { DeviceControls } from '../site/lib/device-controls.js';
import { createNativeBluetooth } from '../site/lib/native-bluetooth.js';
const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const view = (ascii) => {
  const bytes = new TextEncoder().encode('xx' + ascii + 'yy');
  return new DataView(bytes.buffer, 2, bytes.length - 4);
};
async function fixture(options = {}) {
  const device = await createMiPDemo().requestDevice(),
    calls = [];
  const get = device.gatt.getPrimaryService;
  const rx = (await (await get(MIP_RX_SERVICE)).getCharacteristics())[0];
  const tx = (await (await get(MIP_TX_SERVICE)).getCharacteristics())[0];
  const write = tx.writeValueWithoutResponse;
  tx.writeValueWithoutResponse = async (bytes) => {
    calls.push(['write', [...bytes]]);
    return write(bytes);
  };
  device.gatt.getPrimaryService = async (uuid) => {
    calls.push(['service', uuid]);
    return get(uuid);
  };
  const bluetooth = {
    requestDevice: (o) => {
      calls.push(['choose', o]);
      return Promise.resolve(device);
    },
  };
  const runner = new MiPControls({
    bluetooth,
    operationMs: 40,
    chooserMs: 80,
    sessionMs: 1000,
    alertMs: 8,
    ...options,
  });
  return { device, rx, tx, bluetooth, runner, calls };
}
test('MiP wire codec uses exact fixed command bytes and strict ASCII-hex notification framing', () => {
  assert.deepEqual([...mipCommand('identify')], [0x14]);
  assert.deepEqual([...mipCommand('status')], [0x79]);
  assert.deepEqual([...mipCommand('alert')], [0x84, 0, 0, 32]);
  assert.deepEqual([...mipCommand('clear')], [0x84, 0, 0, 0]);
  for (const action of ['move', 'sound', 'firmware', 'constructor', '__proto__'])
    assert.throws(() => mipCommand(action), /Unsupported/);
  assert.equal(
    decodeMiPReply(view('140e021b07')).information.firmware,
    'year 14, month 2, day 27, revision 7',
  );
  assert.match(decodeMiPReply(view('796402')).statusText, /0x64.*upright/);
  for (const malformed of [
    '14',
    '140e001b07',
    '140e0d1b07',
    '140e020007',
    '79640300',
    '794c00',
    '797d00',
    '796407',
    '79640z',
    '79 64 02',
    '79640',
  ])
    assert.equal(decodeMiPReply(view(malformed)), null, malformed);
  assert.equal(decodeMiPReply(new DataView(Uint8Array.of(0x79, 0x64, 2).buffer)), null);
});
test('MiP connection discovers only the selected family channels and performs no application writes', async () => {
  const f = await fixture();
  const promise = f.runner.connect({ namePrefix: 'MiP', rememberedId: 'private' });
  assert.deepEqual(f.calls[0][1].optionalServices, MIP_SERVICES);
  assert.equal(f.calls[0][1].sasoriControlAdapter, MIP_ADAPTER.id);
  await promise;
  assert.equal(f.calls.filter(([kind]) => kind === 'write').length, 0);
  assert.deepEqual(f.runner.snapshot().capabilities, {
    identify: true,
    status: true,
    alert: true,
    stop: true,
  });
  await assert.rejects(f.runner.dispatch('move'), /Unsupported/);
  f.runner.stop();
  assert.equal(f.runner.snapshot().capabilities.alert, false);
});
test('missing MiP TX or notification properties prevents all commands', async () => {
  for (const missing of ['tx', 'notify']) {
    const f = await fixture();
    if (missing === 'tx') f.tx.properties.writeWithoutResponse = false;
    else f.rx.properties.notify = false;
    await assert.rejects(f.runner.connect(), /lacks MiP/);
    assert.equal(f.device.gatt.connected, false);
    assert.equal(f.calls.filter(([kind]) => kind === 'write').length, 0);
  }
});
test('MiP queries require the expected opcode and do not accept unsolicited or raw-binary replies', async () => {
  const f = await fixture();
  await f.runner.connect();
  f.rx.value = view('140E021B07');
  f.rx.dispatchEvent(new Event('characteristicvaluechanged'));
  assert.deepEqual(f.runner.information, {});
  f.tx.writeValueWithoutResponse = async () => {
    for (const value of [view('796402'), new DataView(Uint8Array.of(0x14, 14, 2, 27, 7).buffer)]) {
      f.rx.value = value;
      f.rx.dispatchEvent(new Event('characteristicvaluechanged'));
    }
  };
  await assert.rejects(f.runner.dispatch('identify'), { name: 'TimeoutError' });
  assert.deepEqual(f.runner.information, {});
  assert.equal(f.runner.state, 'disconnected');
  assert.equal(f.runner.pending.size, 0);
});
test('MiP version and status replies remain protocol matches without authentication claims', async () => {
  const f = await fixture();
  await f.runner.connect();
  await f.runner.dispatch('identify');
  await f.runner.dispatch('status');
  assert.match(f.runner.information.firmware, /revision 7/);
  assert.match(f.runner.statusText, /vendor scale/);
  assert.equal(f.runner.snapshot().lastProtocolReply.authenticationVerified, false);
  assert.deepEqual(
    f.calls.filter(([kind]) => kind === 'write').map((r) => r[1]),
    [[20], [121]],
  );
  f.runner.stop();
});
test('MiP LED queues dim blue then off; failed cleanup disconnects and never becomes a cleared effect', async () => {
  const f = await fixture();
  await f.runner.connect();
  await f.runner.dispatch('alert');
  await delay(25);
  assert.deepEqual(
    f.calls.filter(([kind]) => kind === 'write').map((r) => r[1]),
    [
      [0x84, 0, 0, 32],
      [0x84, 0, 0, 0],
    ],
  );
  assert.equal(f.runner.effect, 'cleared');
  f.tx.writeValueWithoutResponse = async (bytes) => {
    if (bytes[3] === 0) throw new Error('Synthetic queue failure');
  };
  await f.runner.dispatch('alert');
  await delay(25);
  assert.equal(f.runner.state, 'disconnected');
  assert.equal(f.runner.effect, 'failed');
});
test('MiP Stop cancels a pending response and stale completion cannot clear the next connection reply', async () => {
  const f = await fixture();
  await f.runner.connect();
  f.tx.writeValueWithoutResponse = async () => {};
  const old = f.runner.dispatch('identify');
  f.runner.stop();
  const cancelled = assert.rejects(old, { name: 'AbortError' });
  await f.runner.connect();
  const current = f.runner.dispatch('status');
  await cancelled;
  f.rx.value = view('796402');
  f.rx.dispatchEvent(new Event('characteristicvaluechanged'));
  await current;
  assert.match(f.runner.statusText, /upright/);
  assert.deepEqual(f.runner.information, {});
  f.runner.stop();
});
test('shared recipe waits for clear and records distinct fresh connections without physical verification', async () => {
  const runner = new DeviceControls({
    adapterId: MIP_ADAPTER.id,
    synthetic: true,
    alertMs: 8,
    sessionMs: 1000,
  });
  await runner.connect();
  const first = runner.connectionId;
  await runner.runCheck();
  assert.equal(runner.lastAction.intent, 'check');
  assert.equal(runner.lastAction.outcome, 'effect-clear-queued');
  assert.equal(runner.lastAction.cleanup, 'cleared');
  assert.equal(runner.lastAction.source, 'synthetic');
  assert.equal(runner.lastAction.authenticationVerified, false);
  assert.equal(runner.lastAction.physicalEffectVerified, false);
  assert.equal(runner.lastAction.stages.length, 3);
  runner.stop();
  await runner.connect();
  assert.notEqual(runner.connectionId, first);
  runner.stop();
});
test('Stop interrupts the shared recipe and stale receipts cannot overwrite a fresh session', async () => {
  const f = await fixture();
  const runner = new DeviceControls({
    adapterId: MIP_ADAPTER.id,
    bluetooth: f.bluetooth,
    alertMs: 8,
    operationMs: 50,
  });
  await runner.connect();
  f.tx.writeValueWithoutResponse = () => new Promise(() => {});
  const checking = runner.runCheck();
  const rejected = assert.rejects(checking, { name: 'AbortError' });
  runner.stop();
  await runner.connect();
  await rejected;
  assert.equal(runner.lastAction, null);
  assert.equal(runner.state, 'connected');
  runner.stop();
});
test('shared effect receipt distinguishes a failed off write from owner cancellation', async () => {
  const f = await fixture();
  const runner = new DeviceControls({
    adapterId: MIP_ADAPTER.id,
    bluetooth: f.bluetooth,
    alertMs: 8,
    operationMs: 50,
  });
  await runner.connect();
  f.tx.writeValueWithoutResponse = async (bytes) => {
    if (bytes[0] === 0x84 && bytes[3] === 0) throw new Error('Synthetic off queue failure');
  };
  await assert.rejects(runner.dispatch('alert'), { name: 'NetworkError' });
  assert.equal(runner.lastAction.outcome, 'failed');
  assert.equal(runner.lastAction.cleanup, 'failed');
  assert.equal(f.device.gatt.connected, false);
});
test('native MiP mode accepts semantic fixed commands and rejects arbitrary byte writes', async () => {
  const listeners = new Map(),
    calls = [];
  const plugin = {
    addListener: async (name, cb) => {
      listeners.set(name, cb);
      return {
        remove: async () => listeners.delete(name),
      };
    },
    requestDevice: async (o) => {
      calls.push(['choose', o]);
      return { id: 'private-native', name: 'MiP' };
    },
    connect: async () => {},
    getService: async ({ uuid }) => ({ uuid }),
    getCharacteristics: async ({ service }) => ({
      characteristics: [
        {
          uuid: service === MIP_RX_SERVICE ? MIP_RX : MIP_TX,
          properties: service === MIP_RX_SERVICE ? ['notify'] : ['writeWithoutResponse'],
        },
      ],
    }),
    startNotifications: async () => {},
    mipCommand: async (o) => {
      calls.push(['command', o]);
      if (o.command === 'identify')
        listeners.get('notification')({
          id: 'private-native',
          uuid: MIP_RX,
          hex: Buffer.from('140E021B07').toString('hex'),
        });
    },
    disconnect: async () => {},
  };
  const runner = new MiPControls({ bluetooth: createNativeBluetooth(plugin), alertMs: 8 });
  await runner.connect({ rememberedId: 'private-native' });
  assert.equal(calls[0][1].mipControls, true);
  assert.equal(calls[0][1].rememberedId, 'private-native');
  await runner.dispatch('identify');
  await runner.dispatch('alert');
  await delay(25);
  assert.deepEqual(
    calls.filter(([k]) => k === 'command').map((r) => r[1]),
    ['identify', 'alert', 'clear'].map((command) => ({ id: 'private-native', command })),
  );
  for (const bytes of [[0x84, 255, 255, 255], [0x71, 1, 1], [0x06]])
    await assert.rejects(
      runner.tx.writeValueWithoutResponse(Uint8Array.from(bytes)),
      /reviewed query/,
    );
  runner.stop();
  await delay();
  assert.equal(listeners.size, 0);
});
