import { StandardControls } from './standard-controls.js';
import { SUPPORTED_BLE_SERVICES, matchSupportedDevices } from './supported-devices.js';

// Metadata only: no characteristic reads, application writes, or notification subscriptions.
export class KnownDeviceProbe extends StandardControls {
  constructor({ probeMs = 20000, ...options } = {}) {
    super(options);
    if (!Number.isFinite(probeMs) || probeMs <= 0 || probeMs > 20000)
      throw new Error('Invalid device recognition deadline.');
    this.probeMs = probeMs;
  }
  async inspect() {
    if (this.state === 'connecting') throw new Error('Device recognition is already running.');
    if (!this.bluetooth?.requestDevice)
      throw new DOMException(
        'Use a Web Bluetooth browser to identify a device.',
        'NotSupportedError',
      );
    const run = ++this.generation;
    this.device = null;
    this.state = 'connecting';
    this.busy = true;
    this.publish('Choose a device. Only known service metadata will be inspected.');
    try {
      // Preserve the button's browser user activation.
      const choice = this.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [...SUPPORTED_BLE_SERVICES],
      });
      Promise.resolve(choice).then(
        (late) => {
          if (run !== this.generation && this.device !== late) late?.gatt?.disconnect();
        },
        () => {},
      );
      const device = await this.step(choice, run, this.chooserMs);
      if (!device?.gatt || typeof device.addEventListener !== 'function')
        throw new Error('Invalid Bluetooth device.');
      this.device = device;
      this.disconnected = () => {
        if (run === this.generation) this.stop('Device disconnected during recognition.');
      };
      device.addEventListener('gattserverdisconnected', this.disconnected);
      this.sessionTimer = setTimeout(
        () => this.stop('Device recognition deadline reached.'),
        this.probeMs,
      );
      const connecting = device.gatt.connect();
      Promise.resolve(connecting).then(
        () => {
          if (run !== this.generation && this.device !== device) device.gatt.disconnect();
        },
        () => {},
      );
      await this.step(connecting, run);
      this.guard(run);
      const services = [];
      for (const uuid of SUPPORTED_BLE_SERVICES) {
        try {
          const service = await this.step(device.gatt.getPrimaryService(uuid), run);
          this.guard(run);
          if (service?.uuid?.toLowerCase() !== uuid)
            throw new Error('Unexpected service metadata.');
          const chars = await this.step(service.getCharacteristics(), run);
          this.guard(run);
          if (!Array.isArray(chars) || chars.length > 128)
            throw new Error('Invalid characteristic inventory.');
          services.push({
            uuid,
            characteristics: chars.map((c) => {
              if (typeof c?.uuid !== 'string' || c.uuid.length > 128)
                throw new Error('Invalid characteristic UUID.');
              return {
                uuid: c.uuid.toLowerCase(),
                properties: ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].filter(
                  (p) => c.properties?.[p] === true,
                ),
              };
            }),
          });
        } catch (error) {
          this.guard(run);
          if (!['NotFoundError', 'NotSupportedError', 'SecurityError'].includes(error.name))
            throw error;
        }
      }
      this.guard(run);
      return { device, services, matches: matchSupportedDevices(services) };
    } finally {
      if (run === this.generation) this.stop('Recognition finished. Choose an adapter to connect.');
    }
  }
}
