import {
  DEVICE_INFORMATION_SERVICE,
  DEVICE_INFORMATION_FIELDS,
  decodeInformationString,
} from './device-information.js';

const sig = (id) => '0000' + id + '-0000-1000-8000-00805f9b34fb';
export const BATTERY_SERVICE = sig('180f');
export const BATTERY_LEVEL = sig('2a19');
export const ALERT_SERVICE = sig('1802');
export const ALERT_LEVEL = sig('2a06');
export const STANDARD_SERVICES = Object.freeze([
  DEVICE_INFORMATION_SERVICE,
  BATTERY_SERVICE,
  ALERT_SERVICE,
]);
export const CONTROL_ADAPTER = Object.freeze({
  id: 'ble-standard/v1',
  name: 'Standard Bluetooth controls',
  intents: Object.freeze(['identify', 'status', 'alert', 'stop']),
  services: STANDARD_SERVICES,
  sources: Object.freeze([
    'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/DIS_v1.2/out/en/index-en.html',
    'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/BAS_v1.1/out/en/index-en.html',
    'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/IAS_v1.0/out/en/index-en.html',
    'https://www.bluetooth.com/wp-content/uploads/Files/Specification/HTML/Assigned_Numbers/out/en/index-en.html',
    'https://community.silabs.com/s/article/find-me-profile-fmp-example-code-and-demo-setup',
  ]),
});
const aborted = () =>
  new DOMException('This connection has ended. Connect again to continue.', 'AbortError');
const notSupported = (message) => new DOMException(message, 'NotSupportedError');
const cleanLabel = (name) =>
  typeof name === 'string'
    ? name.replace(/[\u202a-\u202e\u2066-\u2069]/g, '').slice(0, 80)
    : 'Bluetooth device';

// One session and intent vocabulary for every device exposing the SIG services.
// Arbitrary UUIDs, bytes, credentials, or executable adapter imports are not accepted.
export class StandardControls {
  constructor({
    bluetooth,
    emit = () => {},
    operationMs = 8000,
    chooserMs = 40000,
    sessionMs = 300000,
    alertMs = 1500,
  } = {}) {
    if (
      ![operationMs, chooserMs, sessionMs, alertMs].every((n) => Number.isFinite(n) && n > 0) ||
      sessionMs > 300000 ||
      alertMs > 2000
    )
      throw new Error('Invalid standard control time budget.');
    this.bluetooth = bluetooth;
    this.emit = emit;
    this.operationMs = operationMs;
    this.chooserMs = chooserMs;
    this.sessionMs = sessionMs;
    this.alertMs = alertMs;
    this.generation = 0;
    this.state = 'idle';
    this.busy = false;
    this.device = null;
    this.channels = new Map();
    this.information = {};
    this.battery = null;
    this.lastReadAt = null;
    this.unavailable = [];
    this.pending = new Set();
    this.alerting = false;
    this.effect = 'idle';
    this.alertTimer = null;
    this.sessionTimer = null;
    this.disconnected = null;
  }
  snapshot() {
    const connected = this.state === 'connected' && this.device?.gatt?.connected === true;
    return {
      state: this.state,
      busy: this.busy,
      label: cleanLabel(this.device?.name) || 'Bluetooth device',
      adapterId: CONTROL_ADAPTER.id,
      information: { ...this.information },
      battery: this.battery,
      lastReadAt: this.lastReadAt,
      unavailable: [...this.unavailable],
      alerting: this.alerting,
      effect: this.effect,
      capabilities: {
        identify: connected && DEVICE_INFORMATION_FIELDS.some((f) => this.channels.has(f.uuid)),
        status: connected && this.channels.has(BATTERY_LEVEL),
        alert: connected && this.channels.has(ALERT_LEVEL),
        stop: this.state === 'connecting' || connected,
      },
    };
  }
  publish(message = '') {
    this.emit({ ...this.snapshot(), message });
  }
  guard(run) {
    if (run !== this.generation || !this.device?.gatt?.connected) throw aborted();
  }
  step(value, run, timeoutMs = this.operationMs) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.pending.delete(cancel);
        if (error) reject(error);
        else resolve(result);
      };
      const cancel = () => finish(aborted());
      const timer = setTimeout(() => {
        finish(
          new DOMException('Bluetooth operation timed out. Reconnect to retry.', 'TimeoutError'),
        );
        if (run === this.generation) this.stop('Operation timed out. Your saved setup is kept.');
      }, timeoutMs);
      this.pending.add(cancel);
      Promise.resolve(value).then(
        (result) => {
          if (run !== this.generation) finish(aborted());
          else finish(null, result);
        },
        (error) => finish(error),
      );
    });
  }
  async connect({ device = null, namePrefix = '', rememberedId = '' } = {}) {
    if (this.state === 'connecting' || this.state === 'connected')
      throw new Error('Stop the current connection first.');
    if (!this.bluetooth?.requestDevice)
      throw notSupported('Use the native iPhone app or a browser with Web Bluetooth.');
    if (
      typeof namePrefix !== 'string' ||
      namePrefix.length > 60 ||
      typeof rememberedId !== 'string' ||
      rememberedId.length > 256
    )
      throw new Error('Invalid saved connection setup.');
    const run = ++this.generation;
    this.channels.clear();
    this.information = {};
    this.battery = null;
    this.lastReadAt = null;
    this.unavailable = [];
    this.effect = 'idle';
    this.state = 'connecting';
    this.busy = true;
    this.device = null;
    this.publish('Choose your device. Sasori checks standard features without entering UUIDs.');
    let candidate;
    try {
      // Call the chooser before the first await so the user gesture is preserved.
      const choice =
        device ||
        this.bluetooth.requestDevice({
          ...(namePrefix.trim()
            ? { filters: [{ namePrefix: namePrefix.trim() }] }
            : { acceptAllDevices: true }),
          optionalServices: [...STANDARD_SERVICES],
          sasoriStandardControls: true,
          sasoriRememberedId: rememberedId,
        });
      Promise.resolve(choice).then(
        (late) => {
          if (run !== this.generation && this.device !== late) late?.gatt?.disconnect();
        },
        () => {},
      );
      candidate = await this.step(choice, run, this.chooserMs);
      if (run !== this.generation) throw aborted();
      if (!candidate?.gatt || typeof candidate.addEventListener !== 'function')
        throw new Error('Invalid Bluetooth device.');
      this.device = candidate;
      this.disconnected = () => {
        if (run === this.generation) this.stop('Connection lost. Reconnect uses your saved setup.');
      };
      candidate.addEventListener('gattserverdisconnected', this.disconnected);
      const connection = candidate.gatt.connect();
      Promise.resolve(connection).then(
        () => {
          if (
            run !== this.generation &&
            (this.device !== candidate || this.state === 'disconnected')
          )
            candidate.gatt.disconnect();
        },
        () => {},
      );
      await this.step(connection, run);
      this.guard(run);
      this.sessionTimer = setTimeout(
        () => this.stop('Five-minute session ended. Reconnect to continue.'),
        this.sessionMs,
      );
      for (const uuid of STANDARD_SERVICES) {
        try {
          const service = await this.step(candidate.gatt.getPrimaryService(uuid), run);
          this.guard(run);
          if (service.uuid.toLowerCase() !== uuid) throw new Error('Unexpected Bluetooth service.');
          const characteristics = await this.step(service.getCharacteristics(), run);
          this.guard(run);
          if (!Array.isArray(characteristics) || characteristics.length > 128)
            throw new Error('Invalid characteristic inventory.');
          for (const characteristic of characteristics) {
            const id = characteristic.uuid.toLowerCase();
            if (
              ((uuid === DEVICE_INFORMATION_SERVICE &&
                DEVICE_INFORMATION_FIELDS.some((f) => f.uuid === id)) ||
                (uuid === BATTERY_SERVICE && id === BATTERY_LEVEL)) &&
              characteristic.properties?.read &&
              typeof characteristic.readValue === 'function'
            )
              this.channels.set(id, characteristic);
            if (
              uuid === ALERT_SERVICE &&
              id === ALERT_LEVEL &&
              characteristic.properties?.writeWithoutResponse &&
              typeof characteristic.writeValueWithoutResponse === 'function'
            )
              this.channels.set(id, characteristic);
          }
        } catch (error) {
          this.guard(run);
          if (!['NotFoundError', 'NotSupportedError', 'SecurityError'].includes(error.name))
            throw error;
          this.unavailable.push(
            uuid === DEVICE_INFORMATION_SERVICE
              ? 'Model information'
              : uuid === BATTERY_SERVICE
                ? 'Battery status'
                : 'Find / alert',
          );
        }
      }
      this.state = 'connected';
      this.busy = false;
      this.publish(
        'Connected. Available controls come from this device’s observed standard services.',
      );
      return this.snapshot();
    } catch (error) {
      if (run === this.generation)
        this.stop(
          error.name === 'NotFoundError'
            ? 'No device selected. Your saved setup is kept.'
            : error.message,
        );
      throw error;
    }
  }
  async dispatch(intent) {
    if (!CONTROL_ADAPTER.intents.includes(intent))
      throw notSupported('This action needs a device-specific adapter. No command was sent.');
    if (intent === 'stop') {
      this.stop('Stopped and disconnected. Your saved setup is kept.');
      return this.snapshot();
    }
    if (this.state !== 'connected' || !this.device?.gatt.connected) throw aborted();
    if (this.busy || this.alerting) throw new Error('Wait for the current action, or press Stop.');
    if (!this.snapshot().capabilities[intent])
      throw notSupported('This device does not expose that standard control.');
    const run = this.generation;
    this.busy = true;
    this.publish('Running ' + intent + '…');
    try {
      if (intent === 'identify') {
        this.information = {};
        const failures = [];
        for (const field of DEVICE_INFORMATION_FIELDS) {
          const channel = this.channels.get(field.uuid);
          if (!channel) continue;
          try {
            const data = await this.step(channel.readValue(), run);
            this.guard(run);
            const value = decodeInformationString(data);
            if (value) this.information[field.key] = value;
          } catch (error) {
            this.guard(run);
            if (['TimeoutError', 'NetworkError', 'AbortError'].includes(error.name)) throw error;
            failures.push(field.label);
          }
        }
        this.lastReadAt = new Date().toISOString();
        this.publish(
          failures.length
            ? 'Some identity fields could not be read: ' + failures.join(', ')
            : 'Available model information read.',
        );
      } else if (intent === 'status') {
        this.battery = null;
        const data = await this.step(this.channels.get(BATTERY_LEVEL).readValue(), run);
        this.guard(run);
        if (!(data instanceof DataView) || data.byteLength !== 1 || data.getUint8(0) > 100)
          throw new Error('Invalid standard battery value. Expected one byte from 0 to 100.');
        this.battery = data.getUint8(0);
        this.lastReadAt = new Date().toISOString();
        this.publish('Battery status read: ' + this.battery + '%.');
      } else if (intent === 'alert') {
        // SIG Immediate Alert mild level only. Never map unknown toy bytes to this intent.
        this.alerting = true;
        this.effect = 'pending';
        this.alertTimer = setTimeout(() => this.clearAlert(run), this.alertMs);
        await this.step(
          this.channels.get(ALERT_LEVEL).writeValueWithoutResponse(Uint8Array.of(1)),
          run,
        );
        this.guard(run);
        this.publish(
          'Mild alert requested for up to 1.5 seconds. Effect varies by device; no acknowledgment is provided.',
        );
      }
      return this.snapshot();
    } catch (error) {
      if (run === this.generation) {
        if (intent === 'alert' || ['NetworkError', 'TimeoutError'].includes(error.name))
          this.stop('Action failed. Reconnect with your saved setup.');
        else this.publish(error.message);
      }
      throw error;
    } finally {
      if (run === this.generation) {
        this.busy = false;
        this.publish();
      }
    }
  }
  async clearAlert(run) {
    if (run !== this.generation || !this.alerting) return;
    try {
      this.guard(run);
      await this.step(
        this.channels.get(ALERT_LEVEL).writeValueWithoutResponse(Uint8Array.of(0)),
        run,
      );
      this.guard(run);
      this.alerting = false;
      this.effect = 'cleared';
      this.alertTimer = null;
      this.publish('No-alert request sent. The device provides no acknowledgment.');
    } catch {
      if (run === this.generation) {
        this.effect = 'failed';
        this.stop('Alert clear failed. Disconnected; check the device.');
      }
    }
  }
  stop(message = 'Stopped. Your saved setup is kept.') {
    const device = this.device;
    ++this.generation;
    clearTimeout(this.sessionTimer);
    clearTimeout(this.alertTimer);
    this.sessionTimer = null;
    this.alertTimer = null;
    for (const cancel of [...this.pending]) cancel();
    if (this.disconnected) device?.removeEventListener('gattserverdisconnected', this.disconnected);
    // Stop must not wait on a hung operation. A compliant IAS device stops at link loss.
    try {
      device?.gatt?.disconnect();
    } catch {
      /* Already gone. */
    }
    if (this.state === 'connecting' && !device) this.bluetooth?.cancelRequest?.();
    this.channels.clear();
    if (this.alerting && this.effect !== 'failed') this.effect = 'disconnected';
    this.alerting = false;
    this.busy = false;
    this.state = 'disconnected';
    this.publish(message);
  }
}

export function createControlDemo() {
  const device = new EventTarget();
  device.id = 'sasori-synthetic-control';
  device.name = 'Demo desk gadget';
  const values = new Map([
    [BATTERY_LEVEL, Uint8Array.of(76)],
    ...DEVICE_INFORMATION_FIELDS.map((f) => [
      f.uuid,
      new TextEncoder().encode(
        f.key === 'model'
          ? 'Synthetic desk gadget'
          : f.key === 'manufacturer'
            ? 'Sasori demo'
            : 'demo-1',
      ),
    ]),
  ]);
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
      return {
        uuid,
        getCharacteristics: async () =>
          (uuid === ALERT_SERVICE
            ? [ALERT_LEVEL]
            : uuid === BATTERY_SERVICE
              ? [BATTERY_LEVEL]
              : DEVICE_INFORMATION_FIELDS.map((f) => f.uuid)
          ).map((id) => ({
            uuid: id,
            properties: { read: id !== ALERT_LEVEL, writeWithoutResponse: id === ALERT_LEVEL },
            readValue: async () => {
              const value = values.get(id);
              return new DataView(value.buffer, value.byteOffset, value.byteLength);
            },
            writeValueWithoutResponse: async () => {},
          })),
      };
    },
  };
  return { requestDevice: () => Promise.resolve(device) };
}
