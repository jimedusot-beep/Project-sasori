import { StandardControls } from './standard-controls.js';
import { MIP_RX, MIP_TX } from './adapters.js';
const sig = (s) => '0000' + s + '-0000-1000-8000-00805f9b34fb';
export { MIP_RX, MIP_TX };
export const MIP_RX_SERVICE = sig('ffe0');
export const MIP_TX_SERVICE = sig('ffe5');
export const MIP_SERVICES = Object.freeze([MIP_RX_SERVICE, MIP_TX_SERVICE]);
export const MIP_ADAPTER = Object.freeze({
  id: 'wowwee-mip/v1',
  name: 'WowWee MiP · original BLE protocol',
  models: Object.freeze(['Original WowWee MiP (2014 protocol)']),
  intents: Object.freeze(['identify', 'status', 'alert', 'stop']),
  services: MIP_SERVICES,
  sources: Object.freeze([
    'https://github.com/WowWeeLabs/MiP-BLE-Protocol/blob/6123d0250f9b0bb6513d31eb6fbdc8213b5268a4/README.md',
    'https://github.com/WowWeeLabs/MiP-BLE-Protocol/blob/6123d0250f9b0bb6513d31eb6fbdc8213b5268a4/MiP-Protocol.md',
  ]),
  hardwareVerified: false,
});
const COMMANDS = Object.freeze({
  identify: [0x14],
  status: [0x79],
  alert: [0x84, 0, 0, 32],
  clear: [0x84, 0, 0, 0],
});
export function mipCommand(intent) {
  if (!Object.hasOwn(COMMANDS, intent)) throw new Error('Unsupported MiP action.');
  return Uint8Array.from(COMMANDS[intent]);
}
export function decodeMiPReply(value) {
  if (!(value instanceof DataView) || value.byteLength < 2 || value.byteLength > 64) return null;
  const raw = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const ascii = String.fromCharCode(...raw);
  if (!/^(?:[a-f0-9]{2})+$/i.test(ascii)) return null;
  const bytes = ascii.match(/../g).map((s) => parseInt(s, 16));
  if (
    bytes[0] === 0x14 &&
    bytes.length === 5 &&
    bytes[2] >= 1 &&
    bytes[2] <= 12 &&
    bytes[3] >= 1 &&
    bytes[3] <= 31
  )
    return {
      opcode: 0x14,
      information: {
        model: MIP_ADAPTER.models[0],
        firmware: `year ${bytes[1]}, month ${bytes[2]}, day ${bytes[3]}, revision ${bytes[4]}`,
      },
    };
  if (
    bytes[0] === 0x79 &&
    bytes.length === 3 &&
    bytes[1] >= 0x4d &&
    bytes[1] <= 0x7c &&
    bytes[2] <= 6
  ) {
    const posture = [
      'on back',
      'face down',
      'upright',
      'picked up',
      'hand stand',
      'face down on tray',
      'on back with kickstand',
    ][bytes[2]];
    return {
      opcode: 0x79,
      statusText: `MiP battery code 0x${bytes[1].toString(16)} (vendor scale 0x4d–0x7c) · ${posture}`,
    };
  }
  return null;
}

// Original source-cited adapter. Only two queries and one bounded low-brightness LED action.
// Motor, audio, mode, volume, IR and firmware opcodes are not accepted.
export class MiPControls extends StandardControls {
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
      adapterId: MIP_ADAPTER.id,
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
      throw new Error('Invalid saved MiP setup.');
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
      'Choose your original WowWee MiP. This adapter is not for other toys sharing similar UUIDs.',
    );
    let candidate;
    try {
      const choice =
        device ||
        this.bluetooth.requestDevice({
          ...(namePrefix.trim()
            ? { filters: [{ namePrefix: namePrefix.trim() }] }
            : { acceptAllDevices: true }),
          optionalServices: [...MIP_SERVICES],
          sasoriControlAdapter: MIP_ADAPTER.id,
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
        if (run === this.generation) this.stop('MiP disconnected. Its saved setup is kept.');
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
        () => this.stop('Five-minute MiP session ended.'),
        this.sessionMs,
      );
      for (const uuid of MIP_SERVICES) {
        const service = await this.step(candidate.gatt.getPrimaryService(uuid), run);
        this.guard(run);
        if (service.uuid.toLowerCase() !== uuid) throw new Error('Unexpected MiP service.');
        const chars = await this.step(service.getCharacteristics(), run);
        this.guard(run);
        if (!Array.isArray(chars) || chars.length > 128)
          throw new Error('Invalid MiP characteristic inventory.');
        if (uuid === MIP_RX_SERVICE)
          this.rx = chars.find(
            (c) =>
              c.uuid.toLowerCase() === MIP_RX &&
              c.properties?.notify &&
              typeof c.startNotifications === 'function',
          );
        if (uuid === MIP_TX_SERVICE)
          this.tx = chars.find(
            (c) =>
              c.uuid.toLowerCase() === MIP_TX &&
              c.properties?.writeWithoutResponse &&
              typeof c.writeValueWithoutResponse === 'function',
          );
      }
      if (!this.rx || !this.tx)
        throw new DOMException(
          'The selected device lacks MiP’s documented notify/write-without-response channels.',
          'NotSupportedError',
        );
      this.notification = () => {
        if (run !== this.generation || !this.reply?.armed || !this.device.gatt.connected) return;
        const parsed = decodeMiPReply(this.rx.value);
        if (parsed?.opcode === this.reply.opcode) this.reply.resolve(parsed);
      };
      this.rx.addEventListener('characteristicvaluechanged', this.notification);
      await this.step(this.rx.startNotifications(), run);
      this.guard(run);
      this.state = 'connected';
      this.busy = false;
      this.publish(
        'MiP channels ready. No application query or LED action has been sent. Model selection is your declaration, not automatic authentication.',
      );
      return this.snapshot();
    } catch (error) {
      if (run === this.generation) this.stop(error.message);
      throw error;
    }
  }
  async dispatch(intent) {
    if (intent === 'stop') {
      this.stop('Stopped and disconnected. Check that the MiP light is off.');
      return this.snapshot();
    }
    if (!['identify', 'status', 'alert'].includes(intent))
      throw new DOMException('Unsupported MiP action.', 'NotSupportedError');
    if (!this.snapshot().capabilities[intent])
      throw new DOMException('Connect the matching MiP first.', 'InvalidStateError');
    if (this.busy || this.alerting) throw new Error('Wait for the current action, or press Stop.');
    const run = this.generation;
    this.busy = true;
    this.lastProtocolReply = null;
    this.publish('Running MiP ' + intent + '…');
    try {
      if (intent === 'alert') {
        this.effect = 'pending';
        this.alerting = true;
        this.alertTimer = setTimeout(() => this.clearAlert(run), this.alertMs);
        await this.step(this.tx.writeValueWithoutResponse(mipCommand('alert')), run);
        this.guard(run);
        this.publish(
          'Blue chest light requested briefly, followed by LED off. No physical acknowledgment is supplied.',
        );
      } else {
        const waiting = this.step(
          new Promise((resolve) => {
            this.reply = { opcode: COMMANDS[intent][0], resolve, armed: false };
          }),
          run,
        );
        waiting.catch(() => {});
        this.reply.armed = true;
        await this.step(this.tx.writeValueWithoutResponse(mipCommand(intent)), run);
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
          'Matching MiP reply received. It has no transaction nonce; this is protocol matching, not authentication or proof of a physical effect.',
        );
      }
      return this.snapshot();
    } catch (error) {
      if (run === this.generation) this.stop('MiP action failed: ' + error.message);
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
      await this.step(this.tx.writeValueWithoutResponse(mipCommand('clear')), run);
      this.guard(run);
      this.alerting = false;
      this.effect = 'cleared';
      this.alertTimer = null;
      this.publish('LED-off write queued. Confirm the physical result on your MiP.');
    } catch {
      if (run === this.generation) {
        this.effect = 'failed';
        this.stop('LED-off write failed. Disconnected; check the MiP.');
      }
    }
  }
  stop(message = 'MiP stopped. Setup retained.') {
    if (this.notification && this.rx)
      this.rx.removeEventListener('characteristicvaluechanged', this.notification);
    if (this.alerting && this.tx && this.device?.gatt?.connected) {
      try {
        Promise.resolve(this.tx.writeValueWithoutResponse(mipCommand('clear'))).catch(() => {});
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

export function createMiPDemo() {
  const device = new EventTarget(),
    rx = new EventTarget();
  device.id = 'sasori-synthetic-mip';
  device.name = 'Demo MiP protocol';
  rx.uuid = MIP_RX;
  rx.properties = { notify: true };
  rx.startNotifications = async () => rx;
  const tx = {
    uuid: MIP_TX,
    properties: { writeWithoutResponse: true },
    writeValueWithoutResponse: async (value) => {
      const text = value[0] === 0x14 ? '140E021B07' : value[0] === 0x79 ? '796402' : null;
      if (text)
        queueMicrotask(() => {
          const bytes = new TextEncoder().encode(text);
          rx.value = new DataView(bytes.buffer);
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
      return { uuid, getCharacteristics: async () => (uuid === MIP_RX_SERVICE ? [rx] : [tx]) };
    },
  };
  return { requestDevice: () => Promise.resolve(device) };
}
