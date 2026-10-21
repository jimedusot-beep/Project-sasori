export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export class FakeCharacteristic extends EventTarget {
  constructor(uuid, properties = { notify: true, read: true }) {
    super();
    this.uuid = uuid;
    this.properties = properties;
    this.subscribed = 0;
    this.listeners = new Set();
  }
  addEventListener(type, handler, options) {
    if (type === 'characteristicvaluechanged') this.listeners.add(handler);
    super.addEventListener(type, handler, options);
  }
  removeEventListener(type, handler, options) {
    this.listeners.delete(handler);
    super.removeEventListener(type, handler, options);
  }
  async startNotifications() {
    this.subscribed++;
    return this;
  }
  notify(bytes) {
    this.value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.dispatchEvent(new Event('characteristicvaluechanged'));
  }
}
export function fakeBluetooth(service, notify, overrides = {}) {
  const characteristic = new FakeCharacteristic(notify, overrides.properties);
  const primary = { uuid: service, getCharacteristics: async () => [characteristic] };
  const device = new EventTarget();
  const gatt = {
    connected: false,
    connectCount: 0,
    disconnectCount: 0,
    async connect() {
      this.connectCount++;
      this.connected = true;
      return this;
    },
    getPrimaryService: async (uuid) => {
      if (uuid !== service) throw new DOMException('Service absent', 'NotFoundError');
      return primary;
    },
    disconnect() {
      this.disconnectCount++;
      this.connected = false;
      device.dispatchEvent(new Event('gattserverdisconnected'));
    },
  };
  device.gatt = gatt;
  device.name = 'Elmo L2L';
  const bluetooth = {
    requests: [],
    requestDevice(options) {
      this.requests.push(options);
      return Promise.resolve(device);
    },
  };
  return { bluetooth, device, gatt, characteristic, primary };
}
