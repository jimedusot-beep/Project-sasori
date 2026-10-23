import { normalizeUUID } from './profiles.js';
import { decodePacket } from './protocol.js';
import { explainError } from './diagnostics.js';
import {
  DEVICE_INFORMATION_SERVICE,
  DEVICE_INFORMATION_FIELDS,
  decodeInformationString,
} from './device-information.js';

const ACTIVE = new Set(['selecting', 'connecting', 'discovering', 'inspecting']);
const transitions = {
  idle: ['selecting'],
  selecting: ['connecting', 'error', 'disconnecting'],
  connecting: ['discovering', 'error', 'disconnecting'],
  discovering: ['inspecting', 'error', 'disconnecting'],
  inspecting: ['error', 'disconnecting'],
  error: ['selecting', 'disconnecting'],
  disconnecting: ['disconnected'],
  disconnected: ['selecting'],
};
export function withTimeout(promise, ms, label = 'Bluetooth operation') {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new DOMException(label + ' timed out', 'TimeoutError')), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}
export class BluetoothTransport {
  constructor({
    bluetooth = globalThis.navigator?.bluetooth,
    emit = () => {},
    operationMs = 6000,
    chooserMs = 45000,
  } = {}) {
    this.bluetooth = bluetooth;
    this.emit = emit;
    this.operationMs = operationMs;
    this.chooserMs = chooserMs;
    this.state = 'idle';
    this.generation = 0;
    this.device = null;
    this.server = null;
    this.subscriptions = [];
    this.services = [];
    this.timer = null;
    this.packetCount = 0;
    this.onDisconnect = null;
    this.busy = false;
    this.startedAt = 0;
    this.currentStage = null;
    this.connectedAt = null;
  }
  markStage(stage) {
    this.currentStage = stage;
    this.emit({
      type: 'stage',
      stage,
      elapsedMs: Math.max(0, Date.now() - this.startedAt),
    });
  }
  setState(next, details = {}) {
    if (!transitions[this.state]?.includes(next))
      throw new Error('Invalid transport transition: ' + this.state + ' → ' + next);
    this.state = next;
    this.emit({ type: 'state', state: next, ...details });
  }
  check(run) {
    if (run !== this.generation || !ACTIVE.has(this.state))
      throw new DOMException('Cancelled inspection', 'AbortError');
  }
  async connect({
    service,
    notify = '',
    namePrefix = 'Elmo',
    showAllDevices = false,
    durationMs = 15000,
  }) {
    if (this.busy || ACTIVE.has(this.state) || this.state === 'disconnecting')
      throw new Error('An inspection is already active.');
    service = normalizeUUID(service);
    if (notify) notify = normalizeUUID(notify);
    if (
      typeof namePrefix !== 'string' ||
      namePrefix.length > 60 ||
      (!showAllDevices && !namePrefix.trim())
    )
      throw new Error(
        'Enter a Bluetooth name prefix or explicitly choose Show all Bluetooth devices.',
      );
    if (!this.bluetooth?.requestDevice)
      throw new DOMException('Web Bluetooth unavailable', 'NotSupportedError');
    if (!Number.isFinite(durationMs) || durationMs < 100 || durationMs > 30000)
      throw new Error('Inspection duration must be 0.1–30 seconds.');
    this.busy = true;
    this.services = [];
    this.packetCount = 0;
    this.connectedAt = null;
    const run = ++this.generation;
    this.startedAt = Date.now();
    this.setState('selecting');
    this.markStage('device-chooser');
    // Invoke the chooser synchronously in the user's click call stack (no preceding await).
    try {
      const chooser = Promise.resolve(
        this.bluetooth.requestDevice({
          ...(showAllDevices
            ? { acceptAllDevices: true }
            : { filters: [{ namePrefix: namePrefix.trim() }] }),
          optionalServices: [service],
        }),
      );
      const selected = await withTimeout(chooser, this.chooserMs, 'Device selection');
      this.check(run);
      this.device = selected;
      this.emit({ type: 'device', label: selected.name || namePrefix || 'Selected BLE device' });
      this.onDisconnect = (event) => {
        if (
          run !== this.generation ||
          this.state === 'disconnecting' ||
          this.state === 'disconnected'
        )
          return;
        const reason = [
          'page-hidden',
          'native-deadline',
          'packet-limit',
          'services-changed',
          'bluetooth-unavailable',
          'invalid-notification',
          'operation-timeout',
          'connection-failed',
          'service-not-found',
          'characteristic-discovery-failed',
          'subscription-failed',
        ].includes(event.reason)
          ? event.reason
          : 'unexpected';
        if (event.error)
          this.emit({
            type: 'error',
            error: {
              ...explainError(event.error),
              stage: this.currentStage,
              elapsedMs: Math.max(0, Date.now() - this.startedAt),
            },
          });
        this.emit({
          type: reason === 'unexpected' ? 'warning' : 'info',
          message:
            reason === 'unexpected'
              ? 'Unexpected Bluetooth disconnect. No automatic reconnect will occur.'
              : 'Bluetooth inspection ended: ' + reason + '. No automatic reconnect will occur.',
        });
        this.disconnect(reason);
      };
      selected.addEventListener('gattserverdisconnected', this.onDisconnect);
      this.setState('connecting');
      this.markStage('gatt-connection');
      const attempt = Promise.resolve(selected.gatt.connect());
      // Web Bluetooth promises cannot be aborted. Close a late connection after cancellation/timeout.
      attempt.then(
        (server) => {
          if (run !== this.generation) server.disconnect();
        },
        () => {},
      );
      this.server = await withTimeout(attempt, this.operationMs, 'GATT connection');
      this.check(run);
      this.connectedAt = performance.now();
      this.timer = setTimeout(() => this.disconnect('inspection-complete'), durationMs);
      this.setState('discovering');
      this.markStage('service-discovery');
      const primary = await withTimeout(
        this.server.getPrimaryService(service),
        this.operationMs,
        'Service discovery',
      );
      this.check(run);
      this.markStage('characteristic-discovery');
      const chars = await withTimeout(
        primary.getCharacteristics(),
        this.operationMs,
        'Characteristic discovery',
      );
      this.check(run);
      this.services = [
        {
          uuid: primary.uuid,
          evidence: 'observed-this-session',
          characteristics: chars.map((c) => ({
            uuid: c.uuid,
            properties: ['read', 'write', 'writeWithoutResponse', 'notify', 'indicate'].filter(
              (p) => c.properties[p],
            ),
            evidence: 'observed-this-session',
          })),
        },
      ];
      this.emit({ type: 'services', services: this.services });
      if (service === DEVICE_INFORMATION_SERVICE) {
        this.markStage('device-information');
        const information = {};
        for (const field of DEVICE_INFORMATION_FIELDS) {
          this.check(run);
          const characteristic = chars.find((c) => c.uuid.toLowerCase() === field.uuid);
          if (!characteristic?.properties.read) continue;
          try {
            const value = await withTimeout(
              characteristic.readValue(),
              this.operationMs,
              'Read ' + field.label,
            );
            this.check(run);
            const text = decodeInformationString(value);
            if (text) information[field.key] = text;
          } catch (error) {
            this.check(run);
            // A timed-out read may still hold the GATT operation queue. Tear down
            // rather than starting concurrent reads; never accept its late result.
            if (error?.name === 'TimeoutError' || !this.server?.connected) throw error;
            this.emit({ type: 'info', message: field.label + ' was unavailable; continuing.' });
          }
          this.emit({ type: 'device-information', information: { ...information } });
        }
        this.emit({ type: 'device-information', information });
      }
      if (notify) {
        const characteristic = chars.find((c) => c.uuid.toLowerCase() === notify);
        if (!characteristic)
          throw new DOMException(
            'Configured notification characteristic not found',
            'NotFoundError',
          );
        if (!characteristic.properties.notify && !characteristic.properties.indicate)
          throw new DOMException(
            'Configured characteristic cannot notify or indicate',
            'NotSupportedError',
          );
        this.markStage('notification-subscription');
        const handler = (event) => {
          if (run !== this.generation) return;
          if (++this.packetCount > 500) {
            this.emit({ type: 'warning', message: '500-notification budget reached.' });
            this.disconnect('packet-limit');
            return;
          }
          const packet = decodePacket(event.target?.value, characteristic.uuid);
          this.emit({ type: 'packet', packet });
        };
        this.subscriptions.push({ characteristic, handler });
        characteristic.addEventListener('characteristicvaluechanged', handler);
        const subscription = Promise.resolve(characteristic.startNotifications());
        subscription.then(
          () => {
            if (run !== this.generation && selected.gatt?.connected) selected.gatt.disconnect();
          },
          () => {},
        );
        await withTimeout(subscription, this.operationMs, 'Notification subscription');
        this.check(run);
        this.emit({
          type: 'info',
          message: 'Notification subscription enabled. No application commands sent.',
        });
      }
      this.markStage('inspection-ready');
      this.setState('inspecting');
      if (service === DEVICE_INFORMATION_SERVICE && !notify)
        this.disconnect('identification-complete');
    } catch (error) {
      if (run !== this.generation) return;
      this.emit({
        type: 'error',
        error: {
          ...explainError(error),
          stage: this.currentStage,
          elapsedMs: Math.max(0, Date.now() - this.startedAt),
        },
      });
      this.setState('error');
      this.disconnect(
        ['NotFoundError', 'AbortError'].includes(error?.name) && !this.device
          ? 'selection-cancelled'
          : 'operation-error',
      );
    } finally {
      if (run === this.generation) this.busy = false;
    }
  }
  disconnect(reason = 'user') {
    if (!ACTIVE.has(this.state) && this.state !== 'error') return;
    ++this.generation;
    this.bluetooth?.cancelRequest?.();
    clearTimeout(this.timer);
    this.timer = null;
    this.markStage('teardown');
    this.setState('disconnecting', { reason });
    for (const { characteristic, handler } of this.subscriptions)
      characteristic.removeEventListener('characteristicvaluechanged', handler);
    this.subscriptions = [];
    if (this.device && this.onDisconnect)
      this.device.removeEventListener('gattserverdisconnected', this.onDisconnect);
    // Disconnect rather than scheduling GATT writes/stopNotifications against a closing link.
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
    this.server = null;
    this.device = null;
    this.onDisconnect = null;
    this.busy = false;
    this.setState('disconnected', {
      reason,
      gattDurationMs:
        this.connectedAt === null
          ? 0
          : Math.max(0, Math.round(performance.now() - this.connectedAt)),
    });
    this.connectedAt = null;
  }
}
