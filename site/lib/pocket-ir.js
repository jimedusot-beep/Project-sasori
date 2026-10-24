// Original Sasori client. Contract: Koontzie/ir-remote at 34c848831abd6bf9e49e50ea3eed971fb245c729.
// Notifications identify slots, not transactions or physical appliance outcomes.
export const POCKET_IR_UUIDS = Object.freeze({
  service: 'b457c32b-22b1-425f-8a88-4d6dc37ba4eb',
  config: 'd997012d-7d2b-47de-ae87-bae14df446ef',
  trigger: '58397514-04a3-4265-9590-9d910c4e99d2',
  status: 'b8ddfe01-519f-430d-bd4e-aba0dd852e2c',
});

export function validatePocketSlot(slot) {
  if (!Number.isInteger(slot) || slot < 1 || slot > 5)
    throw new Error('Choose a slot from 1 to 5.');
  return slot;
}

export function validatePocketConfig(candidate) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate))
    throw new Error('Choose a named IR button.');
  const { proto, code, bits } = candidate;
  const slot = validatePocketSlot(candidate.slot);
  if (!['NEC', 'SAMSUNG', 'SONY'].includes(proto))
    throw new Error('The bridge supports NEC, SAMSUNG, or SONY.');
  if (!Number.isInteger(bits) || !(proto === 'SONY' ? [12, 15, 20].includes(bits) : bits === 32))
    throw new Error('Use 32 bits for NEC/Samsung or 12, 15, or 20 bits for Sony.');
  if (typeof code !== 'string' || !/^(?:0x)?[0-9a-fA-F]{1,8}$/.test(code))
    throw new Error('Enter a hexadecimal code of at most eight digits.');
  const value = BigInt(code.startsWith('0x') ? code : '0x' + code);
  if (value >= 1n << BigInt(bits)) throw new Error('IR code exceeds its bit length.');
  return { slot, proto, code: '0x' + value.toString(16).toUpperCase(), bits };
}

export function parsePocketStatus(value) {
  const unknown = { type: 'unrecognized', message: 'Unrecognized bridge status.' };
  try {
    if (typeof value !== 'string') {
      if (!ArrayBuffer.isView(value) || value.byteLength > 120) return unknown;
      value = new TextDecoder('utf-8', { fatal: true }).decode(value);
    }
    if (
      value.length > 120 ||
      [...value].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)
    )
      return unknown;
    if (value === 'ready') return { type: 'ready', message: 'Bridge reports ready.' };
    const match = /^(saved|sent|pressed):([1-5])$/.exec(value);
    if (match) {
      const names = {
        saved: 'Stored',
        sent: 'Transmit attempted',
        pressed: 'Physical button pressed',
      };
      return {
        type: match[1],
        slot: Number(match[2]),
        message: names[match[1]] + ' · slot ' + match[2] + '.',
      };
    }
    if (value.startsWith('err:'))
      return {
        type: 'error',
        message: 'Bridge rejected the request. Check firmware and button configuration.',
      };
  } catch {
    /* Malformed or detached buffers are untrusted input. */
  }
  return unknown;
}

export class PocketIRSession {
  constructor({
    bluetooth,
    onStatus = () => {},
    onState = () => {},
    timeoutMs = 8000,
    chooserMs = 30000,
    gapMs = 250,
  } = {}) {
    Object.assign(this, { bluetooth, onStatus, onState, timeoutMs, chooserMs, gapMs });
    this.epoch = 0;
    this.connected = false;
    this.busy = false;
    this.prepared = new Set();
    this.lastSend = 0;
  }

  _check(epoch) {
    if (epoch !== this.epoch || this.controller?.signal.aborted)
      throw new Error('Connection cancelled.');
  }

  _wait(task, epoch, ms = this.timeoutMs) {
    this._check(epoch);
    const signal = this.controller.signal;
    return new Promise((resolve, reject) => {
      const finish = (error, result) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
        error ? reject(error) : resolve(result);
      };
      const cancel = () => finish(new Error('Connection cancelled.'));
      const timer = setTimeout(
        () => finish(new Error('Bridge timed out. Reconnect and prepare again.')),
        ms,
      );
      signal.addEventListener('abort', cancel, { once: true });
      Promise.resolve(task).then(
        (value) => {
          try {
            this._check(epoch);
            finish(null, value);
          } catch (error) {
            finish(error);
          }
        },
        () => finish(new Error('Bluetooth operation failed. Reconnect your powered bridge.')),
      );
    });
  }

  async connect() {
    if (this.busy || this.connected) throw new Error('Disconnect the current connection first.');
    if (typeof this.bluetooth?.requestDevice !== 'function')
      throw new Error(
        'Use Bluefy on iPhone or a browser with Web Bluetooth. The offline demo works here.',
      );
    const epoch = ++this.epoch;
    this.controller = new AbortController();
    this.busy = true;
    const overall = setTimeout(
      () => this.disconnect('Connection deadline reached. Try again.'),
      this.chooserMs + this.timeoutMs * 2,
    );
    let device;
    try {
      const chooser = this.bluetooth.requestDevice({
        filters: [{ services: [POCKET_IR_UUIDS.service] }],
        optionalServices: [POCKET_IR_UUIDS.service],
      });
      // The browser chooser cannot be programmatically closed. Clean up a late choice.
      Promise.resolve(chooser).then(
        (late) => {
          if (epoch !== this.epoch && late !== this.device) late?.gatt?.disconnect();
        },
        () => {},
      );
      device = await this._wait(chooser, epoch, this.chooserMs);
      this._check(epoch);
      if (!device?.gatt) throw new Error('The selected device has no Bluetooth GATT server.');
      this.device = device;
      this.onDisconnected = () => {
        if (epoch === this.epoch)
          this.disconnect('Bridge disconnected. Reconnect and prepare again.');
      };
      device.addEventListener('gattserverdisconnected', this.onDisconnected);
      const connection = device.gatt.connect();
      Promise.resolve(connection).then(
        () => {
          if (epoch !== this.epoch && device !== this.device) device.gatt.disconnect();
        },
        () => {},
      );
      const server = await this._wait(connection, epoch);
      const service = await this._wait(server.getPrimaryService(POCKET_IR_UUIDS.service), epoch);
      const config = await this._wait(service.getCharacteristic(POCKET_IR_UUIDS.config), epoch);
      const trigger = await this._wait(service.getCharacteristic(POCKET_IR_UUIDS.trigger), epoch);
      const status = await this._wait(service.getCharacteristic(POCKET_IR_UUIDS.status), epoch);
      if (
        ![config, trigger].every(
          (c) => c.properties?.write && typeof c.writeValueWithResponse === 'function',
        ) ||
        !status.properties?.notify ||
        typeof status.startNotifications !== 'function'
      )
        throw new Error(
          'Bridge characteristics do not match the documented writable/notify interface.',
        );
      Object.assign(this, { configChar: config, triggerChar: trigger, statusChar: status });
      this.onNotification = (event) => {
        if (epoch !== this.epoch || !this.connected) return;
        const receipt = parsePocketStatus(event.target.value);
        const pending = this.pending;
        if (pending?.epoch === epoch && receipt.type === 'error')
          pending.reject(new Error(receipt.message));
        if (
          pending?.epoch === epoch &&
          pending.type === receipt.type &&
          pending.slot === receipt.slot
        )
          pending.resolve(receipt);
        this.onStatus(receipt);
      };
      status.addEventListener('characteristicvaluechanged', this.onNotification);
      await this._wait(status.startNotifications(), epoch);
      this._check(epoch);
      this.connected = true;
      this.onState('Connected. Prepare the remote before sending.');
    } catch (error) {
      if (epoch === this.epoch)
        this.disconnect('Connection failed. Check bridge power, firmware, and browser permission.');
      throw error;
    } finally {
      clearTimeout(overall);
      if (epoch === this.epoch) this.busy = false;
    }
  }

  ensureReady() {
    if (!this.connected || !this.device?.gatt?.connected)
      throw new Error('Connect your bridge first.');
    if (this.busy) throw new Error('Wait for the current request to finish.');
  }

  clearPrepared() {
    this.prepared.clear();
  }

  async _command(characteristic, payload, type) {
    this.ensureReady();
    const epoch = this.epoch;
    this.busy = true;
    const ack = new Promise((resolve, reject) => {
      this.pending = { epoch, slot: payload.slot, type, resolve, reject };
    });
    try {
      // Install the waiter before writing: notifications can precede the write response.
      await this._wait(
        Promise.all([
          Promise.resolve().then(() => {
            this._check(epoch);
            return characteristic.writeValueWithResponse(
              new TextEncoder().encode(JSON.stringify(payload)),
            );
          }),
          ack,
        ]),
        epoch,
      );
      this._check(epoch);
    } catch (error) {
      if (epoch === this.epoch)
        this.disconnect('Request interrupted. Reconnect and prepare again.');
      throw error;
    } finally {
      if (epoch === this.epoch) {
        this.pending = null;
        this.busy = false;
      }
    }
  }

  async configure(candidate) {
    const config = validatePocketConfig(candidate);
    this.ensureReady();
    const epoch = this.epoch;
    this.prepared.delete(config.slot);
    await this._command(this.configChar, config, 'saved');
    this._check(epoch);
    this.prepared.add(config.slot);
    this.onState('Button stored on bridge. No IR emitted.');
  }

  async transmit(slot) {
    slot = validatePocketSlot(slot);
    this.ensureReady();
    const epoch = this.epoch;
    if (!this.prepared.has(slot))
      throw new Error('Prepare this button in the current connection first.');
    if (Date.now() - this.lastSend < this.gapMs)
      throw new Error('Give the bridge a moment before the next press.');
    await this._command(this.triggerChar, { slot }, 'sent');
    this._check(epoch);
    this.lastSend = Date.now();
    this.onState(
      'Bridge reports a transmit attempt. Observe your appliance to confirm the effect.',
    );
  }

  disconnect(reason = 'Disconnected. Reconnect and prepare to use the remote.') {
    ++this.epoch;
    this.controller?.abort();
    this.pending?.reject(new Error('Connection cancelled.'));
    this.pending = null;
    if (this.statusChar && this.onNotification)
      this.statusChar.removeEventListener('characteristicvaluechanged', this.onNotification);
    const device = this.device;
    if (device && this.onDisconnected)
      device.removeEventListener('gattserverdisconnected', this.onDisconnected);
    this.connected = false;
    this.busy = false;
    this.prepared.clear();
    this.device = this.configChar = this.triggerChar = this.statusChar = null;
    this.onNotification = this.onDisconnected = null;
    if (device?.gatt?.connected) device.gatt.disconnect();
    this.onState(reason);
  }
}

// A complete in-memory bridge for the offline demo; no radio or network API.
export function createPocketDemo() {
  const status = new EventTarget();
  status.properties = { notify: true };
  status.startNotifications = async () => status;
  const emit = (message) => {
    status.value = new DataView(new TextEncoder().encode(message).buffer);
    status.dispatchEvent(new Event('characteristicvaluechanged'));
  };
  const slots = new Set();
  const writer = (type) => ({
    properties: { write: true },
    writeValueWithResponse: async (bytes) => {
      const command = JSON.parse(new TextDecoder().decode(bytes));
      await new Promise((resolve) => setTimeout(resolve, 35));
      if (type === 'saved') slots.add(command.slot);
      emit(type === 'sent' && !slots.has(command.slot) ? 'err:empty' : type + ':' + command.slot);
    },
  });
  const config = writer('saved'),
    trigger = writer('sent');
  const device = new EventTarget();
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
        ({
          [POCKET_IR_UUIDS.config]: config,
          [POCKET_IR_UUIDS.trigger]: trigger,
          [POCKET_IR_UUIDS.status]: status,
        })[uuid],
    }),
  };
  return { requestDevice: async () => device };
}
