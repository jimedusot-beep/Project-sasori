import { STANDARD_SERVICES, ALERT_SERVICE, ALERT_LEVEL } from './standard-controls.js';
import { MIP_ADAPTER, MIP_SERVICES, MIP_TX, MIP_TX_SERVICE, mipCommand } from './mip-controls.js';
// Inspection facade plus a separate, fixed SIG standard-control mode.
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
    generation = 0,
    requestPending = false;
  const characteristics = new Map();
  const cleanup = () => {
    for (const handle of listeners) Promise.resolve(handle.remove()).catch(() => {});
    listeners = [];
    characteristics.clear();
  };
  const unavailable = () => new DOMException('Native inspection cancelled', 'AbortError');
  function close(reason = 'unexpected', error = null) {
    // Retire the connection before notifying consumers: their Stop handler must
    // not disconnect a newly selected device or revive an old GATT request.
    const ended = device;
    ++generation;
    device = null;
    cleanup();
    if (ended) {
      ended.gatt.connected = false;
      const event = new Event('gattserverdisconnected');
      event.reason = reason;
      if (error) event.error = error;
      ended.dispatchEvent(event);
    }
  }
  return {
    cancelRequest() {
      ++generation;
      requestPending = false;
      const ended = device;
      device = null;
      if (ended) ended.gatt.connected = false;
      Promise.resolve(plugin.disconnect()).catch(() => {});
      cleanup();
    },
    async requestDevice(options) {
      // Do not invalidate the active generation for a rejected second request.
      // A selected device is reserved even while its GATT connect is pending.
      if (device || requestPending)
        throw new DOMException(
          'Stop the current native Bluetooth session first.',
          'InvalidStateError',
        );
      const standard = options.sasoriStandardControls === true;
      const mip = options.sasoriControlAdapter === MIP_ADAPTER.id;
      if (options.sasoriControlAdapter && !mip)
        throw new DOMException(
          'This adapter requires a Web Bluetooth browser; native controls are unavailable.',
          'NotSupportedError',
        );
      if (standard && mip) throw new Error('Choose one control adapter.');
      if (
        mip &&
        (!Array.isArray(options.optionalServices) ||
          options.optionalServices.length !== MIP_SERVICES.length ||
          !MIP_SERVICES.every((uuid) => options.optionalServices.includes(uuid)))
      )
        throw new Error('MiP controls require the fixed service allowlist.');
      if (
        standard &&
        (!Array.isArray(options.optionalServices) ||
          options.optionalServices.length !== STANDARD_SERVICES.length ||
          !STANDARD_SERVICES.every((uuid) => options.optionalServices.includes(uuid)))
      )
        throw new Error('Standard controls require the fixed service allowlist.');
      requestPending = true;
      const run = ++generation;
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
        if (run === generation) requestPending = false;
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
          ...(standard
            ? { standardControls: true, rememberedId: options.sasoriRememberedId || '' }
            : mip
              ? { mipControls: true, rememberedId: options.sasoriRememberedId || '' }
              : {}),
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
                  characteristic.readValue = async () => {
                    guard();
                    const result = await invoke(standard ? 'readStandard' : 'readInformation', {
                      id: current.id,
                      uuid: item.uuid,
                      ...(standard ? { service: service.uuid } : {}),
                    });
                    guard();
                    if (
                      typeof result.hex !== 'string' ||
                      result.hex.length > 1024 ||
                      !/^(?:[a-f0-9]{2})*$/i.test(result.hex)
                    )
                      throw new Error('Invalid native device information.');
                    const bytes = Uint8Array.from(result.hex.match(/../g) || [], (pair) =>
                      parseInt(pair, 16),
                    );
                    return new DataView(bytes.buffer);
                  };
                  if (standard && service.uuid === ALERT_SERVICE && item.uuid === ALERT_LEVEL) {
                    characteristic.writeValueWithoutResponse = async (value) => {
                      guard();
                      if (
                        !(value instanceof Uint8Array) ||
                        value.length !== 1 ||
                        ![0, 1].includes(value[0])
                      )
                        throw new Error(
                          'Only the standard no-alert / mild-alert levels are available.',
                        );
                      await invoke('alertStandard', { id: current.id, level: value[0] });
                      guard();
                    };
                  }
                  if (mip && service.uuid === MIP_TX_SERVICE && item.uuid === MIP_TX) {
                    characteristic.writeValueWithoutResponse = async (value) => {
                      guard();
                      if (!(value instanceof Uint8Array)) throw new Error('Invalid MiP command.');
                      const action = ['identify', 'status', 'alert', 'clear'].find((intent) => {
                        const expected = mipCommand(intent);
                        return (
                          value.length === expected.length &&
                          expected.every((byte, index) => value[index] === byte)
                        );
                      });
                      if (!action)
                        throw new Error(
                          'MiP native controls accept only the reviewed query and LED commands.',
                        );
                      await invoke('mipCommand', { id: current.id, command: action });
                      guard();
                    };
                  }
                  characteristics.set(item.uuid, characteristic);
                  return characteristic;
                });
              },
            };
          },
          disconnect() {
            // Late native/Web Bluetooth completions can retain an old GATT
            // object. An obsolete object must never tear down the next session.
            const currentSession = run === generation && device === current;
            this.connected = false;
            if (!currentSession) return;
            Promise.resolve(plugin.disconnect()).catch(() => {});
            close('user');
          },
        };
        device = current;
        return current;
      } catch (error) {
        // A cancelled old chooser may reject after a fresh one starts.
        // Never remove the fresh session's listeners from the old catch.
        if (run === generation) cleanup();
        throw error;
      } finally {
        if (run === generation) requestPending = false;
      }
    },
  };
}
