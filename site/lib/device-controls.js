import { recordId } from './records.js';
import { StandardControls, CONTROL_ADAPTER, createControlDemo } from './standard-controls.js';
import { MiPControls, MIP_ADAPTER, createMiPDemo } from './mip-controls.js';
export const CONTROL_FAMILIES = Object.freeze([CONTROL_ADAPTER, MIP_ADAPTER]);
export function controlFamily(id = CONTROL_ADAPTER.id) {
  const family = CONTROL_FAMILIES.find((f) => f.id === id);
  if (!family) throw new Error('Unsupported control adapter family.');
  return family;
}
export class DeviceControls {
  constructor({
    adapterId = CONTROL_ADAPTER.id,
    synthetic = false,
    emit = () => {},
    ...options
  } = {}) {
    this.family = controlFamily(adapterId);
    this.synthetic = synthetic;
    this.emit = emit;
    this.connectionId = '';
    this.lastAction = null;
    this.effectWaiter = null;
    this.sequence = 0;
    const Backend = adapterId === MIP_ADAPTER.id ? MiPControls : StandardControls;
    this.backend = new Backend({
      ...options,
      bluetooth: synthetic
        ? adapterId === MIP_ADAPTER.id
          ? createMiPDemo()
          : createControlDemo()
        : options.bluetooth,
      emit: (event) => {
        if (this.effectWaiter && (!event.alerting || event.state !== 'connected')) {
          const waiter = this.effectWaiter;
          this.effectWaiter = null;
          if (event.state === 'connected' && event.effect === 'cleared') waiter.resolve();
          else
            waiter.reject(
              new DOMException('Effect ended by disconnection or failed cleanup.', 'AbortError'),
            );
        }
        this.emit({
          ...event,
          adapterId: this.family.id,
          connectionId: this.connectionId,
          lastAction: this.lastAction,
        });
      },
    });
  }
  get device() {
    return this.backend.device;
  }
  get state() {
    return this.backend.state;
  }
  snapshot() {
    return {
      ...this.backend.snapshot(),
      adapterId: this.family.id,
      connectionId: this.connectionId,
      lastAction: this.lastAction,
    };
  }
  publish() {
    this.emit(this.snapshot());
  }
  receipt(intent, startedAt, start, outcome, error = '') {
    const state = this.backend.snapshot();
    return {
      id: 'action-' + recordId(),
      sessionId: this.connectionId,
      adapterId: this.family.id,
      source: this.synthetic ? 'synthetic' : 'live',
      intent,
      startedAt,
      endedAt: new Date().toISOString(),
      durationMs: Math.max(0, Math.round(performance.now() - start)),
      outcome,
      cleanup: state.effect || 'idle',
      model: state.information.model || 'unknown',
      firmware: state.information.firmware || 'unknown',
      error: error.slice(0, 240),
      authenticationVerified: false,
      physicalEffectVerified: false,
    };
  }
  async connect(options = {}) {
    if (['connecting', 'connected'].includes(this.state))
      throw new Error('Stop the current connection first.');
    this.connectionId = 'connection-' + recordId();
    const connectionId = this.connectionId;
    this.lastAction = null;
    ++this.sequence;
    const at = new Date().toISOString(),
      start = performance.now();
    try {
      return await this.backend.connect(options);
    } catch (error) {
      if (connectionId === this.connectionId) {
        this.lastAction = this.receipt(
          'connect',
          at,
          start,
          error.name === 'AbortError' ? 'cancelled' : 'failed',
          error.message,
        );
        this.publish();
      }
      throw error;
    }
  }
  async dispatch(intent) {
    if (intent === 'stop') {
      this.stop();
      return this.snapshot();
    }
    const at = new Date().toISOString(),
      start = performance.now(),
      connectionId = this.connectionId,
      sequence = this.sequence;
    try {
      await this.backend.dispatch(intent);
      if (intent === 'alert' && this.backend.snapshot().alerting)
        await new Promise((resolve, reject) => {
          this.effectWaiter = { resolve, reject };
        });
      if (connectionId !== this.connectionId || sequence !== this.sequence)
        throw new DOMException('Action cancelled.', 'AbortError');
      const outcome =
        intent === 'alert'
          ? 'effect-clear-queued'
          : this.backend.snapshot().lastProtocolReply
            ? 'matched-reply'
            : 'read-complete';
      this.lastAction = this.receipt(intent, at, start, outcome);
      this.publish();
      return this.snapshot();
    } catch (error) {
      if (connectionId === this.connectionId) {
        this.lastAction = this.receipt(
          intent,
          at,
          start,
          error.name === 'AbortError' ? 'cancelled' : 'failed',
          error.message,
        );
        this.publish();
      }
      throw error;
    }
  }
  async runCheck() {
    if (
      this.state !== 'connected' ||
      !['identify', 'status', 'alert'].some((intent) => this.snapshot().capabilities[intent])
    )
      throw new DOMException(
        'Connect a device with an available action first.',
        'InvalidStateError',
      );
    const sequence = this.sequence,
      connectionId = this.connectionId,
      at = new Date().toISOString(),
      start = performance.now();
    const stages = [];
    try {
      for (const intent of ['identify', 'status', 'alert']) {
        if (sequence !== this.sequence) throw new DOMException('Check cancelled.', 'AbortError');
        if (!this.snapshot().capabilities[intent]) {
          stages.push(intent + ': unavailable');
          continue;
        }
        await this.dispatch(intent);
        stages.push(intent + ': ' + this.lastAction.outcome);
      }
      if (sequence !== this.sequence) throw new DOMException('Check cancelled.', 'AbortError');
      const physical = this.snapshot().capabilities.alert && this.snapshot().effect === 'cleared';
      this.lastAction = {
        ...this.receipt('check', at, start, physical ? 'effect-clear-queued' : 'read-complete'),
        stages,
      };
      this.publish();
      return this.snapshot();
    } catch (error) {
      if (connectionId === this.connectionId) {
        this.lastAction = {
          ...this.receipt(
            'check',
            at,
            start,
            error.name === 'AbortError' ? 'cancelled' : 'failed',
            error.message,
          ),
          stages,
        };
        this.publish();
      }
      throw error;
    }
  }
  stop(message = 'Stopped. Your saved setup is kept.') {
    ++this.sequence;
    this.backend.stop(message);
  }
}
