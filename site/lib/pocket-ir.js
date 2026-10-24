// Original Sasori adapter for a deliberately selected, owner-built Koontzie BLE IR bridge.
// Protocol reference: https://github.com/Koontzie/ir-remote/tree/34c848831abd6bf9e49e50ea3eed971fb245c729
export const POCKET_IR_UUIDS = Object.freeze({
  service: 'b457c32b-22b1-425f-8a88-4d6dc37ba4eb',
  config: 'd997012d-7d2b-47de-ae87-bae14df446ef',
  trigger: '58397514-04a3-4265-9590-9d910c4e99d2',
  status: 'b8ddfe01-519f-430d-bd4e-aba0dd852e2c',
});

const TYPES = new Set(['NEC', 'SAMSUNG', 'SONY']);

export function validatePocketConfig(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
    throw new Error('Choose one named IR slot and protocol.');
  const { slot, proto, code, bits } = candidate;
  if (!Number.isInteger(slot) || slot < 1 || slot > 5)
    throw new Error('Slot must be an integer from 1 through 5.');
  if (typeof proto !== 'string' || !TYPES.has(proto))
    throw new Error('The bridge only supports NEC, SAMSUNG, or SONY.');
  if (typeof code !== 'string' || !/^(?:0x)?[0-9a-fA-F]{1,16}$/.test(code))
    throw new Error('Enter a hexadecimal IR code of at most 16 digits.');
  if (!Number.isInteger(bits) || bits < 1 || bits > 64)
    throw new Error('Bit length must be an integer from 1 through 64.');
  const value = BigInt(code.toLowerCase().startsWith('0x') ? code : '0x' + code);
  if (value > (1n << BigInt(bits)) - 1n)
    throw new Error('IR code is too large for the selected bit length.');
  return { slot, proto, code: '0x' + value.toString(16).toUpperCase(), bits };
}

export function validatePocketSlot(slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 5)
    throw new Error('Choose a slot from 1 to 5.');
  return slot;
}

export function parsePocketStatus(value) {
  if (typeof value !== 'string') {
    if (!value || !value.buffer || !Number.isInteger(value.byteLength))
      return { type: 'unrecognized', message: 'Malformed bridge status.' };
    if (value.byteLength > 120)
      return { type: 'unrecognized', message: 'Oversized bridge status omitted.' };
    value = new TextDecoder('utf-8', { fatal: true }).decode(
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength),
    );
  }
  if (value.length > 120 || [...value].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127))
    return { type: 'unrecognized', message: 'Unrecognized bridge status.' };
  if (value === 'ready') return { type: 'ready', message: 'Bridge reports ready.' };
  const match = /^(saved|sent|pressed):([1-5])$/.exec(value);
  if (match) {
    const names = { saved: 'Stored', sent: 'Transmit attempted', pressed: 'Button pressed' };
    return {
      type: match[1],
      slot: Number(match[2]),
      message: names[match[1]] + ' · slot ' + match[2] +
        (match[1] === 'sent' ? ' (not proof that an appliance responded).' : '.'),
    };
  }
  if (/^err:[\w ()|:-]{1,80}$/.test(value))
    return { type: 'error', message: 'Bridge error: ' + value.slice(4) };
  return { type: 'unrecognized', message: 'Unrecognized bridge status.' };
}

export class PocketIRSession {
  constructor({ bluetooth, onStatus = () => {}, onState = () => {} } = {}) {
    this.bluetooth = bluetooth;
    this.onStatus = onStatus;
    this.onState = onState;
    this.epoch = 0;
    this.device = null;
    this.configChar = null;
    this.triggerChar = null;
    this.statusChar = null;
    this.connected = false;
    this.busy = false;
    this.onNotification = null;
    this.onDisconnected = null;
  }

  ensureReady() {
    if (!this.connected || !this.device?.gatt?.connected)
      throw new Error('Connect your selected IR bridge first.');
    if (this.busy) throw new Error('Finish the current action first.');
  }

  async connect() {
    if (this.busy || this.connected) throw new Error('Disconnect the current attempt first.');
    if (typeof this.bluetooth?.requestDevice !== 'function')
      throw new Error('Web Bluetooth unavailable. Use Bluefy or a compatible Bluetooth browser.');
    this.busy = true;
    const epoch = ++this.epoch;
    let device;
    try {
      device = await this.bluetooth.requestDevice({
        filters: [{ services: [POCKET_IR_UUIDS.service] }],
        optionalServices: [POCKET_IR_UUIDS.service],
      });
      if (epoch !== this.epoch) {
        device.gatt?.disconnect();
        return;
      }
      this.device = device;
      this.onDisconnected = () => {
        if (epoch === this.epoch) this.disconnect('Bridge disconnected.');
      };
      device.addEventListener('gattserverdisconnected', this.onDisconnected);
      const server = await device.gatt.connect();
      if (epoch !== this.epoch) return;
      const service = await server.getPrimaryService(POCKET_IR_UUIDS.service);
      this.configChar = await service.getCharacteristic(POCKET_IR_UUIDS.config);
      this.triggerChar = await service.getCharacteristic(POCKET_IR_UUIDS.trigger);
      this.statusChar = await service.getCharacteristic(POCKET_IR_UUIDS.status);
      if (epoch !== this.epoch) return;
      if (typeof this.configChar.writeValueWithResponse !== 'function' ||
          typeof this.triggerChar.writeValueWithResponse !== 'function')
        throw new Error('This bridge does not expose the required write-with-response controls.');
      this.onNotification = (event) => {
        if (epoch === this.epoch && this.connected)
          this.onStatus(parsePocketStatus(event.target.value));
      };
      this.statusChar.addEventListener('characteristicvaluechanged', this.onNotification);
      await this.statusChar.startNotifications();
      if (epoch !== this.epoch) return;
      this.connected = true;
      this.onState('Connected to selected bridge. No IR has been transmitted.');
      if (typeof this.statusChar.readValue === 'function')
        this.onStatus(parsePocketStatus(await this.statusChar.readValue()));
    } catch (error) {
      if (epoch === this.epoch) this.disconnect('Connection failed.');
      throw error;
    } finally {
      if (epoch === this.epoch) this.busy = false;
      if (epoch !== this.epoch && device?.gatt?.connected) device.gatt.disconnect();
    }
  }

  async configure(candidate) {
    const config = validatePocketConfig(candidate);
    this.ensureReady();
    this.busy = true;
    try {
      await this.configChar.writeValueWithResponse(
        new TextEncoder().encode(JSON.stringify(config)),
      );
      this.onState('Configuration request written for slot ' + config.slot +
        '. Check for saved status before sending.');
    } finally {
      this.busy = false;
    }
  }

  async transmit(slot) {
    slot = validatePocketSlot(slot);
    this.ensureReady();
    this.busy = true;
    try {
      await this.triggerChar.writeValueWithResponse(
        new TextEncoder().encode(JSON.stringify({ slot })),
      );
      this.onState('Trigger request written for slot ' + slot +
        '. Observe the appliance; a sent status is not an effect confirmation.');
    } finally {
      this.busy = false;
    }
  }

  disconnect(reason = 'Disconnected by user.') {
    ++this.epoch;
    const device = this.device;
    if (this.statusChar && this.onNotification)
      this.statusChar.removeEventListener('characteristicvaluechanged', this.onNotification);
    if (device && this.onDisconnected)
      device.removeEventListener('gattserverdisconnected', this.onDisconnected);
    this.connected = false;
    this.device = null;
    this.configChar = null;
    this.triggerChar = null;
    this.statusChar = null;
    this.onNotification = null;
    this.onDisconnected = null;
    this.busy = false;
    if (device?.gatt?.connected) device.gatt.disconnect();
    this.onState(reason);
  }
}
