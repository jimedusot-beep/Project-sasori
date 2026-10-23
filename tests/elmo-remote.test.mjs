import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  ELMO_SERVICE,
  ELMO_RX,
  ELMO_TX,
  md5Bytes,
  elmoPasswordDigest,
  elmoFletcher32,
  elmoResponse,
  elmoCommand,
  decodeElmo,
} from '../site/lib/elmo-codec.js';
import { ElmoRemote, createElmoDemo } from '../site/lib/elmo-remote.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const password = 'Lab-Only-42';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function fixture(mode = 'ok') {
  const calls = [],
    rx = new EventTarget(),
    device = new EventTarget();
  rx.uuid = ELMO_RX;
  rx.properties = { notify: true };
  const state = { mode, calls, rx, device, options: null, listeners: [] };
  const add = rx.addEventListener.bind(rx);
  rx.addEventListener = (name, fn) => {
    state.listeners.push(fn);
    add(name, fn);
  };
  state.notify = (bytes) => {
    const raw = Uint8Array.from([0xff, ...bytes, 0xee]);
    rx.value = new DataView(raw.buffer, 1, bytes.length);
    rx.dispatchEvent(new Event('characteristicvaluechanged'));
  };
  rx.startNotifications = async () => {
    calls.push(['subscribe']);
    const frame = {
      silent: null,
      early: [0x40, 1],
      unset: [0x40, 0],
      unknown: [0x40, 3],
      odd: [0x41, 1, 2, 3],
      bare: [0x40],
      oversize: [0x41, ...Array(20).fill(0)],
    }[state.mode];
    if (frame !== null) state.notify(frame || [0x41, 0x10, 0x20, 0x30, 0x40]);
    return rx;
  };
  const tx = {
    uuid: ELMO_TX,
    properties: { writeWithoutResponse: true },
    async writeValueWithoutResponse(value) {
      const bytes = Array.from(value);
      calls.push(['write', bytes]);
      if (state.mode === 'driver-error')
        throw new Error('private-address password raw-secret-packet');
      if (bytes[0] === 0x41) {
        const frame =
          state.mode === 'reject'
            ? [0x40, 2]
            : state.mode === 'changed'
              ? [0x41, 0x50, 0x60]
              : state.mode === 'unknown-after-response'
                ? [0x40, 255]
                : [0x40, 1];
        if (state.mode !== 'no-acceptance') state.notify(frame);
      } else if (bytes[0] === 0x22) {
        state.notify(state.mode === 'wrong-query' ? [0x22, 255] : [0x22, 5]);
        if (state.mode === 'wrong-query') state.notify([0x20, 0x40]);
        if (state.mode === 'disconnect') {
          device.gatt.connected = false;
          device.dispatchEvent(new Event('gattserverdisconnected'));
        }
      } else if (bytes[0] === 0x20) state.notify([0x20, 0x41]);
    },
  };
  state.tx = tx;
  device.name = 'Private Elmo';
  device.id = 'private-radio-id';
  device.gatt = {
    connected: false,
    async connect() {
      calls.push(['connect']);
      this.connected = true;
      return this;
    },
    async getPrimaryService(uuid) {
      calls.push(['service', uuid]);
      return {
        uuid: state.mode === 'wrong-service' ? 'wrong' : ELMO_SERVICE,
        getCharacteristics: async () => (state.mode === 'duplicate' ? [rx, tx, tx] : [rx, tx]),
      };
    },
    disconnect() {
      calls.push(['disconnect']);
      this.connected = false;
    },
  };
  state.bluetooth = {
    requestDevice(options) {
      calls.push(['choose']);
      state.options = options;
      return Promise.resolve(device);
    },
  };
  return state;
}
function remote(f = fixture(), options = {}) {
  const runner = new ElmoRemote({
    bluetooth: f.bluetooth,
    operationMs: 70,
    chooserMs: 100,
    authMs: 120,
    queryMs: 20,
    sessionMs: 1000,
    ...options,
  });
  return [runner, f];
}
async function subscribed(f) {
  for (let i = 0; i < 30 && !f.calls.some((c) => c[0] === 'subscribe'); i++) await pause(1);
}

test('browser MD5 matches independent standard implementation through padding and multi-block cases', () => {
  for (const length of [0, 1, 3, 55, 56, 63, 64, 65, 128, 1024]) {
    const bytes = Uint8Array.from({ length }, (_, i) => (i * 71 + 13) & 255);
    assert.equal(hex(md5Bytes(bytes)), createHash('md5').update(bytes).digest('hex'));
  }
});
test('browser codec matches every source-derived desktop vector, including UTF-16 and whitespace', async () => {
  const corpus = JSON.parse(
    await readFile(
      new URL(
        '../experiments/001-elmo-l2l/fixtures/source-derived-auth.synthetic.json',
        import.meta.url,
      ),
    ),
  );
  for (const vector of corpus.vectors) {
    const digest = elmoPasswordDigest(vector.password);
    assert.equal(hex(digest), vector.md5Hex);
    assert.equal(
      hex(elmoResponse(digest, Uint8Array.from(Buffer.from(vector.challengeHex, 'hex')))),
      vector.responseHex,
    );
  }
  assert.notEqual(hex(elmoPasswordDigest('Spaces Stay  ')), hex(elmoPasswordDigest('Spaces Stay')));
  for (const invalid of ['', '123', 'a'.repeat(129), null])
    assert.throws(() => elmoPasswordDigest(invalid));
});
test('checksum negative zero, complete challenges, strict replies and fixed actions preserve the source subset', () => {
  assert.equal(elmoFletcher32(new Uint8Array()), 0xffffffff);
  assert.equal(elmoFletcher32(new Uint8Array(20)), 0xffffffff);
  assert.throws(() => elmoFletcher32(Uint8Array.of(1)));
  for (const size of [0, 1, 3, 20])
    assert.throws(() => elmoResponse(new Uint8Array(16), new Uint8Array(size)));
  for (const bytes of [[0x40], [0x40, 3], [0x40, 1, 0], [0x22, 0], [0x22, 16]])
    assert.equal(decodeElmo(new DataView(Uint8Array.from(bytes).buffer)), null);
  for (const intent of ['password', 'raw', 'reset', 'motor', 'firmware'])
    assert.throws(() => elmoCommand(intent));
});
test('connect preserves the user gesture, scopes services and waits for current-response acceptance before queries', async () => {
  const [r, f] = remote();
  assert.equal(f.calls.length, 0);
  const connecting = r.connect({ password });
  assert.equal(f.calls[0][0], 'choose');
  await connecting;
  assert.deepEqual(f.options, {
    filters: [{ namePrefix: 'Elmo' }],
    optionalServices: [ELMO_SERVICE],
  });
  assert.deepEqual(
    f.calls.filter((c) => c[0] === 'write').map((c) => c[1]),
    [[0x41, 10, 142, 18, 236], [0x22], [0x20]],
  );
  assert.equal(r.state, 'ready');
  assert.equal(r.result().volume, 5);
  assert.equal(r.result().inputs.nose, true);
  r.stop();
  const output = JSON.stringify(r.result());
  for (const secret of [
    password,
    'private-radio-id',
    'private-address',
    '04b4068e',
    '410a8e12ec',
    '10203040',
  ])
    assert.ok(!output.includes(secret));
  assert.equal(r.result().hardwareVerified, false);
  assert.equal(r.result().authenticationVerified, false);
});
test('greeting is explicit, one fixed action per accepted session, and never becomes a verified physical effect', async () => {
  const [r, f] = remote();
  await assert.rejects(r.greet(), { code: 'not-ready' });
  await r.connect({ password });
  await r.greet();
  await assert.rejects(r.greet(), { code: 'not-ready' });
  assert.equal(f.calls.filter((c) => c[0] === 'write' && c[1][0] === 0x10).length, 1);
  assert.deepEqual(f.calls.find((c) => c[0] === 'write' && c[1][0] === 0x10)[1], [0x10, 9, 0]);
  assert.equal(r.result().helloQueued, true);
  assert.equal(r.result().observedEffect, 'not-tested');
  r.stop();
});
test('missing and ambiguous channels stop before any authentication write', async () => {
  for (const mode of ['wrong-service', 'duplicate', 'wrong-properties']) {
    const [r, f] = remote(fixture(mode));
    if (mode === 'wrong-properties') f.tx.properties = { write: true };
    await assert.rejects(r.connect({ password }));
    assert.equal(f.calls.filter((c) => c[0] === 'write').length, 0);
    assert.equal(r.state, 'disconnected');
  }
});
test('unset, malformed, changed, early and unknown authentication never enable control or enrollment', async () => {
  for (const mode of [
    'unset',
    'early',
    'unknown',
    'odd',
    'bare',
    'oversize',
    'changed',
    'unknown-after-response',
    'reject',
  ]) {
    const [r, f] = remote(fixture(mode));
    await assert.rejects(r.connect({ password }));
    assert.notEqual(r.state, 'ready', mode);
    assert.ok(f.calls.filter((c) => c[0] === 'write').every((c) => c[1][0] === 0x41));
    assert.equal(f.device.gatt.connected, false);
  }
});
test('silent and unaccepted handshakes time out without a retry or action', async () => {
  for (const mode of ['silent', 'no-acceptance']) {
    const [r, f] = remote(fixture(mode), { authMs: 18 });
    await assert.rejects(r.connect({ password }));
    assert.equal(r.result().outcome, 'timeout');
    assert.ok(f.calls.filter((c) => c[0] === 'write').length <= 1);
  }
});
test('malformed query reply stays unknown and touch pushes do not acknowledge volume', async () => {
  const [r] = remote(fixture('wrong-query'));
  await r.connect({ password });
  assert.equal(r.result().volume, null);
  assert.equal(r.result().queries.volume, 'no-matching-reply');
  assert.equal(r.result().inputs.nose, true);
  r.stop();
});
test('cancelling a chooser disconnects a late selection without connecting it', async () => {
  const f = fixture();
  let select;
  f.bluetooth.requestDevice = () =>
    new Promise((resolve) => {
      select = resolve;
    });
  const [r] = remote(f);
  const checking = r.connect({ password });
  r.stop();
  await assert.rejects(checking);
  select(f.device);
  await pause(2);
  assert.ok(!f.calls.some((c) => c[0] === 'connect'));
  assert.ok(f.calls.some((c) => c[0] === 'disconnect'));
});
test('a connection finishing after cancellation is disconnected again', async () => {
  const f = fixture();
  let complete;
  f.device.gatt.connect = () =>
    new Promise((resolve) => {
      complete = () => {
        f.device.gatt.connected = true;
        resolve(f.device.gatt);
      };
    });
  const [r] = remote(f);
  const checking = r.connect({ password });
  await pause(1);
  r.stop();
  await assert.rejects(checking);
  complete();
  await pause(2);
  assert.equal(f.device.gatt.connected, false);
});
test('cancelled listeners cannot authenticate a new connection or mutate a finished report', async () => {
  const f = fixture('silent'),
    [r] = remote(f);
  const first = r.connect({ password });
  await subscribed(f);
  const stale = f.listeners[0];
  r.stop();
  await assert.rejects(first);
  f.mode = 'no-acceptance';
  const second = r.connect({ password });
  await pause(2);
  f.rx.value = new DataView(Uint8Array.of(0x40, 1).buffer);
  stale();
  assert.equal(r.state, 'authenticating');
  f.notify([0x40, 1]);
  await second;
  r.stop();
  const ended = JSON.stringify(r.result());
  f.notify([0x40, 2]);
  assert.equal(JSON.stringify(r.result()), ended);
});
test('disconnects and driver errors emit fixed private diagnostics', async () => {
  for (const mode of ['disconnect', 'driver-error']) {
    const [r] = remote(fixture(mode));
    await assert.rejects(r.connect({ password }));
    assert.equal(r.state, 'disconnected');
    assert.ok(!JSON.stringify(r.result()).includes('raw-secret-packet'));
  }
});
test('finite session and notification budgets tear down without silently reconnecting', async () => {
  const [r, f] = remote(fixture(), { sessionMs: 40 });
  await r.connect({ password });
  await pause(50);
  assert.equal(r.result().reason, 'session-timeout');
  assert.equal(f.calls.filter((c) => c[0] === 'choose').length, 1);
  const [noisy, g] = remote();
  await noisy.connect({ password });
  for (let i = 0; i < 510; i++) g.notify([0x20, 0]);
  assert.equal(noisy.result().notifications, 500);
  assert.equal(noisy.result().reason, 'notification-limit');
});
test('demo has no dependency on real Bluetooth and remains explicitly synthetic', async () => {
  const r = new ElmoRemote({ bluetooth: createElmoDemo(), synthetic: true });
  await r.connect({ password });
  await r.greet();
  r.stop();
  assert.equal(r.result().source, 'synthetic');
  assert.equal(r.result().physicalEffectVerified, false);
  const unavailable = new ElmoRemote();
  await assert.rejects(unavailable.connect({ password }), { code: 'browser-unavailable' });
});

test('an acceptance arriving after the authentication deadline cannot enable actions behind a slow write', async () => {
  const f = fixture();
  f.tx.writeValueWithoutResponse = async (value) => {
    f.calls.push(['write', Array.from(value)]);
    await pause(25);
    f.notify([0x40, 1]);
    await pause(5);
  };
  const [r] = remote(f, { authMs: 12 });
  await assert.rejects(r.connect({ password }));
  assert.equal(r.result().reason, 'authentication-timeout');
  assert.notEqual(r.result().authenticationOutcome, 'toy-reported-acceptance');
  assert.equal(f.calls.filter((c) => c[0] === 'write').length, 1);
});

test('late cleanup errors are consumed and service absence is not misreported as chooser cancellation', async () => {
  const f = fixture();
  let select;
  f.bluetooth.requestDevice = () =>
    new Promise((resolve) => {
      select = resolve;
    });
  f.device.gatt.disconnect = () => {
    throw new Error('private-late-cleanup');
  };
  const [r] = remote(f);
  const pending = r.connect({ password });
  r.stop();
  await assert.rejects(pending);
  select(f.device);
  await pause(2);
  const g = fixture();
  g.device.gatt.getPrimaryService = async () => {
    throw new DOMException('private-service-id', 'NotFoundError');
  };
  const [missing] = remote(g);
  await assert.rejects(missing.connect({ password }), { code: 'bluetooth-error' });
  assert.equal(missing.result().reason, 'bluetooth-error');
  assert.ok(!JSON.stringify(missing.result()).includes('private-service-id'));
});
