// Web-Bluetooth-shaped inspection facade. No command-write surface.
export function createNativeBluetooth(plugin) {
  const errorNames = new Set([
    'AbortError',
    'InvalidStateError',
    'NetworkError',
    'NotFoundError',
    'NotSupportedError',
    'SecurityError',
    'TimeoutError',
  ]);
  async function invoke(method, options) {
    try {
      return await plugin[method](options);
    } catch (error) {
      // Capacitor uses error.code for the Swift rejection code; Error.name stays "Error".
      if (errorNames.has(error?.code))
        throw new DOMException(error.message || 'Native Bluetooth operation failed.', error.code);
      throw error;
    }
  }
  let device = null,
    listeners = [],
    generation = 0;
  const characteristics = new Map();
  const cleanup = () => {
    for (const handle of listeners) Promise.resolve(handle.remove()).catch(() => {});
    listeners = [];
    characteristics.clear();
  };
  const unavailable = () => new DOMException('Native inspection cancelled', 'AbortError');
  function close(reason = 'unexpected', error = null) {
    if (device) {
      device.gatt.connected = false;
      const event = new Event('gattserverdisconnected');
      event.reason = reason;
      if (error) event.error = error;
      device.dispatchEvent(event);
    }
    cleanup();
  }
  return {
    cancelRequest() {
      ++generation;
      Promise.resolve(plugin.disconnect()).catch(() => {});
      cleanup();
    },
    async requestDevice(options) {
      const run = ++generation;
      if (device?.gatt.connected) throw new Error('A native inspection is already active.');
      cleanup();
      const registered = await Promise.allSettled([
        plugin.addListener('disconnected', (event) => {
          if (run !== generation || device?.id !== event.id) return;
          const expectedStop = ['user', 'page-hidden', 'native-deadline', 'packet-limit'].includes(
            event.reason,
          );
          const error =
            !expectedStop && errorNames.has(event.errorCode)
              ? new DOMException(
                  'Native Bluetooth inspection ended: ' + event.reason + '.',
                  event.errorCode,
                )
              : null;
          close(event.reason || 'unexpected', error);
        }),
        plugin.addListener('notification', (event) => {
          if (run !== generation || !device?.gatt.connected || device.id !== event.id) return;
          const characteristic = characteristics.get(event.uuid);
          if (!characteristic) return;
          if (
            typeof event.hex !== 'string' ||
            event.hex.length > 8192 ||
            !/^(?:[a-f0-9]{2})*$/i.test(event.hex)
          ) {
            Promise.resolve(plugin.disconnect()).catch(() => {});
            close('invalid-notification');
            return;
          }
          const bytes = Uint8Array.from(event.hex.match(/../g) || [], (pair) => parseInt(pair, 16));
          characteristic.value = new DataView(bytes.buffer);
          characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
        }),
      ]);
      const handles = registered.filter((r) => r.status === 'fulfilled').map((r) => r.value);
      const failure = registered.find((r) => r.status === 'rejected');
      if (failure) {
        for (const handle of handles) await handle.remove();
        throw failure.reason;
      }
      if (run !== generation) {
        for (const handle of handles) await handle.remove();
        throw unavailable();
      }
      listeners = handles;
      try {
        const selected = await invoke('requestDevice', {
          service: options.optionalServices[0],
          namePrefix: options.filters?.[0]?.namePrefix || '',
          showAllDevices: options.acceptAllDevices === true,
        });
        if (run !== generation) throw unavailable();
        const current = new EventTarget();
        current.id = selected.id;
        current.name = selected.name;
        const guard = () => {
          if (run !== generation || device !== current) throw unavailable();
        };
        current.gatt = {
          connected: false,
          async connect() {
            guard();
            await invoke('connect', { id: current.id });
            guard();
            this.connected = true;
            return this;
          },
          async getPrimaryService(uuid) {
            guard();
            const service = await invoke('getService', { id: current.id, uuid });
            guard();
            return {
              uuid: service.uuid,
              async getCharacteristics() {
                guard();
                const response = await invoke('getCharacteristics', {
                  id: current.id,
                  service: service.uuid,
                });
                guard();
                if (
                  !Array.isArray(response.characteristics) ||
                  response.characteristics.length > 128
                )
                  throw new Error('Invalid native characteristic metadata.');
                return response.characteristics.map((item) => {
                  const characteristic = new EventTarget();
                  characteristic.uuid = item.uuid;
                  characteristic.properties = Object.fromEntries(
                    item.properties.map((p) => [p, true]),
                  );
                  characteristic.startNotifications = async () => {
                    guard();
                    await invoke('startNotifications', { id: current.id, uuid: item.uuid });
                    guard();
                    return characteristic;
                  };
                  characteristics.set(item.uuid, characteristic);
                  return characteristic;
                });
              },
            };
          },
          disconnect() {
            this.connected = false;
            Promise.resolve(plugin.disconnect()).catch(() => {});
            close('user');
          },
        };
        device = current;
        return current;
      } catch (error) {
        cleanup();
        throw error;
      }
    },
  };
}
