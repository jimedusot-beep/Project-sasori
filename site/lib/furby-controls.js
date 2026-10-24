import { StandardControls } from './standard-controls.js';
import {
  FURBY_SERVICE,
  FURBY_RX,
  FURBY_TX,
  FURBY_ADAPTER,
  furbyCommand,
  decodeFurbyReply,
} from './furby-codec.js';
export { FURBY_ADAPTER };

// Original source-cited adapter. Only firmware/presence queries and one bounded antenna LED action.
// Movement, speech, mood, naming, file transfer and firmware writes are not accepted.
export class FurbyControls extends StandardControls {
  constructor(options = {}) {
    super(options);
    this.reply = null;
    this.notification = null;
    this.rx = null;
    this.tx = null;
    this.effect = 'idle';
    this.statusText = '';
    this.lastProtocolReply = null;
  }
  snapshot() {
    const base = super.snapshot(),
      connected =
        this.state === 'connected' &&
        this.device?.gatt?.connected === true &&
        !!this.tx &&
        !!this.rx;
    return {
      ...base,
      adapterId: FURBY_ADAPTER.id,
      effect: this.effect,
      statusText: this.statusText,
      lastProtocolReply: this.lastProtocolReply,
      capabilities: {
        identify: connected,
        status: connected,
        alert: connected,
        stop: this.state === 'connecting' || connected,
      },
    };
  }
  async connect({ device = null, namePrefix = '', rememberedId = '' } = {}) {
    if (['connecting', 'connected'].includes(this.state))
      throw new Error('Stop the current connection first.');
    if (!this.bluetooth?.requestDevice)
      throw new DOMException('Bluetooth is unavailable.', 'NotSupportedError');
    if (
      typeof namePrefix !== 'string' ||
      namePrefix.length > 60 ||
      typeof rememberedId !== 'string' ||
      rememberedId.length > 256
    )
      throw new Error('Invalid saved Furby Connect setup.');
    const run = ++this.generation;
    this.state = 'connecting';
    this.busy = true;
    this.device = null;
    this.information = {};
    this.battery = null;
    this.lastReadAt = null;
    this.statusText = '';
    this.lastProtocolReply = null;
    this.effect = 'idle';
    this.tx = null;
    this.rx = null;
    this.publish(
      'Choose your 2016 Furby Connect. This adapter is not for other toys sharing similar UUIDs.',
    );
    let candidate;
    try {
      const choice =
        device ||
        this.bluetooth.requestDevice({
          ...(namePrefix.trim()
            ? { filters: [{ namePrefix: namePrefix.trim() }] }
            : { acceptAllDevices: true }),
          optionalServices: [...FURBY_ADAPTER.services],
          sasoriControlAdapter: FURBY_ADAPTER.id,
          sasoriRememberedId: rememberedId,
        });
      Promise.resolve(choice).then(
        (late) => {
          if (run !== this.generation && this.device !== late) late?.gatt?.disconnect();
        },
        () => {},
      );
      candidate = await this.step(choice, run, this.chooserMs);
      if (run !== this.generation) throw new DOMException('Connection cancelled.', 'AbortError');
      if (!candidate?.gatt || typeof candidate.addEventListener !== 'function')
        throw new Error('Invalid Bluetooth device.');
      this.device = candidate;
      this.disconnected = () => {
        if (run === this.generation)
          this.stop('Furby Connect disconnected. Its saved setup is kept.');
      };
      candidate.addEventListener('gattserverdisconnected', this.disconnected);
      const connecting = candidate.gatt.connect();
      Promise.resolve(connecting).then(
        () => {
          if (run !== this.generation && this.device !== candidate) candidate.gatt.disconnect();
        },
        () => {},
      );
      await this.step(connecting, run);
      this.guard(run);
      this.sessionTimer = setTimeout(
        () => this.stop('Five-minute Furby Connect session ended.'),
        this.sessionMs,
      );
      const service = await this.step(candidate.gatt.getPrimaryService(FURBY_SERVICE), run);
      this.guard(run);
      if (service.uuid.toLowerCase() !== FURBY_SERVICE)
        throw new Error('Unexpected Furby Connect service.');
      const chars = await this.step(service.getCharacteristics(), run);
      this.guard(run);
      if (!Array.isArray(chars) || chars.length > 128)
        throw new Error('Invalid Furby Connect characteristic inventory.');
      this.rx = chars.find(
        (c) =>
          c.uuid.toLowerCase() === FURBY_RX &&
          c.properties?.notify &&
          typeof c.startNotifications === 'function',
      );
      this.tx = chars.find(
        (c) =>
          c.uuid.toLowerCase() === FURBY_TX &&
          ((c.properties?.writeWithoutResponse &&
            typeof c.writeValueWithoutResponse === 'function') ||
            (c.properties?.write && typeof c.writeValueWithResponse === 'function')),
      );
      if (!this.rx || !this.tx)
        throw new DOMException(
          'The device lacks Furby Connect’s documented notify/write channels.',
          'NotSupportedError',
        );
      this.notification = () => {
        if (run !== this.generation || !this.reply?.armed || !this.device.gatt.connected) return;
        const parsed = decodeFurbyReply(this.rx.value);
        if (parsed?.opcode === this.reply.opcode) this.reply.resolve(parsed);
      };
      this.rx.addEventListener('characteristicvaluechanged', this.notification);
      await this.step(this.rx.startNotifications(), run);
      this.guard(run);
      this.state = 'connected';
      this.busy = false;
      this.publish(
        'Furby Connect channels ready. No application query or LED action has been sent. A matching service is not authentication or physical verification.',
      );
      return this.snapshot();
    } catch (error) {
      if (run === this.generation) this.stop(error.message);
      throw error;
    }
  }
  write(bytes) {
    return this.tx.properties.writeWithoutResponse &&
      typeof this.tx.writeValueWithoutResponse === 'function'
      ? this.tx.writeValueWithoutResponse(bytes)
      : this.tx.writeValueWithResponse(bytes);
  }
  async dispatch(intent) {
    if (intent === 'stop') {
      this.stop('Stopped and disconnected. Check that the Furby Connect antenna light is off.');
      return this.snapshot();
    }
    if (!['identify', 'status', 'alert'].includes(intent))
      throw new DOMException('Unsupported Furby Connect action.', 'NotSupportedError');
    if (!this.snapshot().capabilities[intent])
      throw new DOMException('Connect the matching Furby Connect first.', 'InvalidStateError');
    if (this.busy || this.alerting) throw new Error('Wait for the current action, or press Stop.');
    const run = this.generation;
    this.busy = true;
    this.lastProtocolReply = null;
    this.publish('Running Furby Connect ' + intent + '…');
    try {
      if (intent === 'alert') {
        this.effect = 'pending';
        this.alerting = true;
        await this.step(this.write(furbyCommand('alert')), run);
        this.guard(run);
        this.alertTimer = setTimeout(() => this.clearAlert(run), this.alertMs);
        this.publish(
          'Dim blue antenna light requested briefly, followed by LED off. No physical acknowledgment is supplied.',
        );
      } else {
        const waiting = this.step(
          new Promise((resolve) => {
            this.reply = { opcode: intent === 'identify' ? 0xfe : 0x22, resolve, armed: false };
          }),
          run,
        );
        waiting.catch(() => {});
        this.reply.armed = true;
        await this.step(this.write(furbyCommand(intent)), run);
        this.guard(run);
        const result = await waiting;
        this.guard(run);
        this.reply = null;
        if (result.information) this.information = result.information;
        if (result.statusText) this.statusText = result.statusText;
        this.lastReadAt = new Date().toISOString();
        this.lastProtocolReply = {
          opcode: result.opcode,
          matchedInThisConnection: true,
          authenticationVerified: false,
        };
        this.publish(
          'Matching Furby Connect reply received. It has no transaction nonce; this is protocol matching, not authentication or proof of a physical effect.',
        );
      }
      return this.snapshot();
    } catch (error) {
      if (run === this.generation) this.stop('Furby Connect action failed: ' + error.message);
      throw error;
    } finally {
      if (run === this.generation) {
        this.reply = null;
        this.busy = false;
        this.publish();
      }
    }
  }
  async clearAlert(run) {
    if (run !== this.generation || !this.alerting) return;
    try {
      this.guard(run);
      await this.step(this.write(furbyCommand('clear')), run);
      this.guard(run);
      this.alerting = false;
      this.effect = 'cleared';
      this.alertTimer = null;
      this.publish('LED-off write queued. Confirm the physical result on your Furby Connect.');
    } catch {
      if (run === this.generation) {
        this.effect = 'failed';
        this.stop('LED-off write failed. Disconnected; check the Furby Connect.');
      }
    }
  }
  stop(message = 'Furby Connect stopped. Setup retained.') {
    if (this.notification && this.rx)
      this.rx.removeEventListener('characteristicvaluechanged', this.notification);
    if (this.alerting && this.tx && this.device?.gatt?.connected) {
      try {
        Promise.resolve(this.write(furbyCommand('clear'))).catch(() => {});
      } catch {
        /* Best effort, never an acknowledgment. */
      }
      if (this.effect !== 'failed') this.effect = 'disconnected';
    }
    this.reply = null;
    this.notification = null;
    this.rx = null;
    this.tx = null;
    super.stop(message);
  }
}

export function createFurbyDemo() {
  const device = new EventTarget(),
    rx = new EventTarget();
  device.id = 'sasori-synthetic-furby';
  device.name = 'Demo Furby Connect';
  rx.uuid = FURBY_RX;
  rx.properties = { notify: true };
  rx.startNotifications = async () => rx;
  const tx = {
    uuid: FURBY_TX,
    properties: { writeWithoutResponse: true },
    async writeValueWithoutResponse(value) {
      const reply =
        value[0] === 0xfe
          ? [0xfe, 4]
          : value[0] === 0x20 && value[1] === 6
            ? [0x22, ...Array(18).fill(0)]
            : null;
      if (reply)
        queueMicrotask(() => {
          rx.value = new DataView(Uint8Array.from(reply).buffer);
          rx.dispatchEvent(new Event('characteristicvaluechanged'));
        });
    },
  };
  device.gatt = {
    connected: false,
    async connect() {
      this.connected = true;
      return this;
    },
    disconnect() {
      this.connected = false;
      device.dispatchEvent(new Event('gattserverdisconnected'));
    },
    async getPrimaryService(uuid) {
      if (uuid !== FURBY_SERVICE) throw new DOMException('Service unavailable.', 'NotFoundError');
      return { uuid, getCharacteristics: async () => [rx, tx] };
    },
  };
  return { requestDevice: () => Promise.resolve(device) };
}
