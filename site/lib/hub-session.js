import { ElmoRemote, createElmoDemo } from './elmo-remote.js';
import { DeviceControls } from './device-controls.js?v=recognition-20261024';
import { TVRemote } from './tv-remote.js';
import { hubFamily, hubAction, ELMO_INPUTS } from './hub-catalog.js?v=recognition-20261024';
import { hubFailure } from './hub-records.js?v=recognition-20261024';
import { recordId } from './records.js';

export class HubSession {
  constructor({
    familyId,
    synthetic = false,
    bluetooth = globalThis.navigator?.bluetooth,
    companion = false,
    fetcher,
    emit = () => {},
    ...budgets
  } = {}) {
    this.family = hubFamily(familyId);
    this.familyId = familyId;
    this.synthetic = synthetic === true;
    this.emit = emit;
    this.listeners = new Set();
    this.connectionId = '';
    this.failure = null;
    this.lastAction = '';
    this.demoBluetooth = this.synthetic && familyId === 'elmo-l2l/v1' ? createElmoDemo() : null;
    const receive = () => this.publish();
    this.backend =
      familyId === 'elmo-l2l/v1'
        ? new ElmoRemote({
            ...budgets,
            bluetooth: this.demoBluetooth || bluetooth,
            synthetic: this.synthetic,
            emit: receive,
          })
        : familyId === 'tv-local/v1'
          ? new TVRemote({ synthetic: this.synthetic, companion, fetcher, emit: receive })
          : new DeviceControls({
              ...budgets,
              adapterId: familyId,
              synthetic: this.synthetic,
              bluetooth,
              emit: receive,
            });
  }
  get device() {
    return this.backend.device || null;
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  snapshot() {
    const raw = this.backend?.snapshot() || {},
      elmo = this.familyId === 'elmo-l2l/v1';
    return {
      familyId: this.familyId,
      connectionId: this.connectionId,
      synthetic: this.synthetic,
      state: elmo
        ? raw.state === 'ready'
          ? 'connected'
          : ['choosing', 'connecting', 'authenticating'].includes(raw.state)
            ? 'connecting'
            : raw.state
        : raw.state,
      busy: !!raw.busy || !!raw.alerting,
      deviceName: raw.deviceName || raw.label || raw.information?.label || this.family.name,
      information: { ...(raw.information || {}) },
      battery: raw.battery ?? null,
      statusText: raw.statusText || '',
      deadlineAt: raw.deadlineAt || null,
      volume: raw.report?.volume ?? null,
      volumeRequested: raw.report?.volumeRequested ?? null,
      inputs: raw.report?.inputs || null,
      inputSequence: raw.report?.inputSequence || 0,
      soundRequestedId: raw.report?.soundRequestedId ?? null,
      soundQueued: raw.report?.soundQueued || false,
      soundRequests: raw.report?.soundRequests || 0,
      soundWrites: raw.report?.soundWrites || 0,
      soundReadyIn: raw.soundReadyIn || 0,
      soundLimit: raw.soundLimit || 1,
      volumeLimit: raw.volumeLimit || 4,
      sessionMode: raw.report?.sessionMode || 'check',
      volumeChanges: raw.report?.volumeChanges || 0,
      passwordSetupOutcome: raw.report?.passwordSetupOutcome || 'not-attempted',
      reason: raw.report?.reason || raw.reason || '',
      failure: this.failure,
      lastAction:
        this.lastAction ||
        (this.familyId === 'tv-local/v1' && typeof raw.lastAction === 'string'
          ? raw.lastAction
          : ''),
      keys: raw.keys || [],
      capabilities: raw.capabilities || {},
      learnAvailable: raw.learnAvailable === true,
      authenticationOutcome: raw.report?.authenticationOutcome || 'not-tested',
      physicalEffectVerified: false,
      hardwareVerified: false,
    };
  }
  publish() {
    const snapshot = this.snapshot();
    this.emit(snapshot);
    for (const listener of [...this.listeners]) listener(snapshot);
  }
  can(intent, args = {}) {
    try {
      hubAction(this.familyId, intent, args);
    } catch {
      return false;
    }
    const s = this.snapshot();
    if (s.state !== 'connected' || s.busy) return false;
    if (this.familyId === 'elmo-l2l/v1')
      return (
        intent === 'status' ||
        (intent === 'sound' && s.soundRequests < s.soundLimit && this.readyIn('sound') === 0) ||
        (intent === 'volume' && s.volumeChanges < s.volumeLimit)
      );
    if (this.familyId === 'tv-local/v1')
      return intent === 'status' || (intent === 'key' && s.keys.includes(args.key));
    return s.capabilities[intent] === true;
  }
  readyIn(intent) {
    return this.familyId === 'elmo-l2l/v1' ? this.backend.readyIn(intent) : 0;
  }
  async connect(options = {}) {
    if (['connected', 'connecting'].includes(this.snapshot().state))
      throw Object.assign(new Error('Already connected.'), { code: 'busy' });
    this.connectionId = 'hub-' + recordId();
    this.failure = null;
    this.lastAction = '';
    try {
      await this.backend.connect({
        ...options,
        ...(this.synthetic && this.familyId === 'elmo-l2l/v1' ? { password: 'Lab-Only-42' } : {}),
      });
    } catch (error) {
      const code = this.backend.result?.()?.reason;
      this.failure = hubFailure(code ? { code } : error);
      this.publish();
      throw error;
    }
    return this.snapshot();
  }
  async dispatch(intent, args = {}) {
    const action = hubAction(this.familyId, intent, args);
    if (!this.can(action.intent, action.args))
      throw Object.assign(new Error('Action unavailable.'), { code: 'action-unavailable' });
    try {
      if (this.familyId === 'elmo-l2l/v1') {
        if (intent === 'sound') await this.backend.playSound(action.args.id);
        else if (intent === 'volume') await this.backend.setVolume(action.args.level);
        else await this.backend.readStatus();
      } else if (this.familyId === 'tv-local/v1')
        await this.backend.dispatch(action.intent, action.args);
      else await this.backend.dispatch(intent);
      this.lastAction =
        intent === 'sound'
          ? 'sound-requested'
          : intent === 'volume'
            ? 'volume-requested'
            : intent === 'alert'
              ? 'effect-requested'
              : intent === 'key'
                ? action.args.key + '-requested'
                : 'state-read';
      this.publish();
      return this.snapshot();
    } catch (error) {
      this.failure = hubFailure(error);
      this.publish();
      throw error;
    }
  }
  stop(reason = 'user-stop') {
    this.backend.stop(reason);
  }
  simulateTouch(input = 'nose') {
    if (!this.synthetic || !this.demoBluetooth)
      throw new Error('A simulated Elmo connection is required.');
    const index = ELMO_INPUTS.indexOf(input);
    if (index < 0) throw new Error('Choose a known input.');
    this.demoBluetooth.simulateInput(0);
    this.demoBluetooth.simulateInput(1 << index);
  }
  result(ownerObservation = 'not-tested') {
    const s = this.snapshot();
    return {
      format: 'sasori.hub-result',
      schemaVersion: 1,
      familyId: this.familyId,
      source: this.synthetic ? 'synthetic' : 'live',
      savedAt: new Date().toISOString(),
      state: s.state,
      reason: hubFailure({ code: s.failure?.code || s.reason || 'user-stop' }).code,
      authenticationOutcome: s.authenticationOutcome,
      passwordSetupOutcome: s.passwordSetupOutcome,
      soundRequestedId: s.soundRequestedId,
      soundQueued: s.soundQueued,
      soundRequests: s.soundRequests,
      soundWrites: s.soundWrites,
      sessionMode: s.sessionMode,
      volumeReported: s.volume,
      volumeRequested: s.volumeRequested,
      volumeChanges: s.volumeChanges,
      lastAction: s.lastAction,
      ownerObservation: ['heard-or-saw-effect', 'no-effect', 'not-tested'].includes(
        ownerObservation,
      )
        ? ownerObservation
        : 'not-tested',
      hardwareVerified: false,
      authenticationVerified: false,
      physicalEffectVerified: false,
    };
  }
}
