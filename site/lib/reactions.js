import { ELMO_INPUTS, ELMO_SOUNDS } from './elmo-codec.js';

export function validateReactions(value) {
  if (!Array.isArray(value) || value.length > ELMO_INPUTS.length)
    throw new Error('Choose up to seven touch mappings.');
  const inputs = new Set();
  return value.map((rule) => {
    if (
      !rule ||
      !ELMO_INPUTS.includes(rule.input) ||
      inputs.has(rule.input) ||
      !ELMO_SOUNDS.some((s) => s.id === rule.soundId)
    )
      throw new Error('Choose one catalog sound per known input.');
    inputs.add(rule.input);
    return { input: rule.input, soundId: rule.soundId };
  });
}

// Foreground, explicitly armed input reactions. Busy/cooldown events are dropped,
// never queued to play unexpectedly after another action or connection.
export class TouchReactions {
  constructor({ emit = () => {}, durationMs = 600000, maxTriggers = 60 } = {}) {
    if (
      !Number.isFinite(durationMs) ||
      durationMs <= 0 ||
      durationMs > 600000 ||
      !Number.isSafeInteger(maxTriggers) ||
      maxTriggers < 1 ||
      maxTriggers > 60
    )
      throw new Error('Invalid reaction limits.');
    Object.assign(this, { emit, durationMs, maxTriggers });
    this.active = false;
    this.report = null;
    this.unsubscribe = null;
    this.timer = null;
    this.busy = false;
    this.generation = 0;
  }
  snapshot() {
    return this.report ? structuredClone(this.report) : null;
  }
  publish() {
    this.emit(this.snapshot());
  }
  arm(session, value) {
    const rules = validateReactions(value),
      initial = session.snapshot();
    if (
      this.active ||
      !rules.length ||
      initial.familyId !== 'elmo-l2l/v1' ||
      initial.state !== 'connected' ||
      initial.busy ||
      !session.connectionId
    )
      throw new Error('Connect Elmo and choose at least one mapping.');
    this.session = session;
    this.connectionId = session.connectionId;
    const generation = ++this.generation;
    this.active = true;
    this.busy = false;
    let sequence = initial.inputSequence || 0;
    const released = new Map(rules.map((r) => [r.input, initial.inputs?.[r.input] === false]));
    this.report = {
      format: 'sasori.reaction-result',
      schemaVersion: 1,
      source: initial.synthetic ? 'synthetic' : 'live',
      startedAt: new Date().toISOString(),
      endedAt: null,
      outcome: 'armed',
      reason: '',
      mappedInputs: rules.length,
      triggered: 0,
      sent: 0,
      skipped: 0,
      failures: 0,
      hardwareVerified: false,
      authenticationVerified: false,
      physicalEffectVerified: false,
    };
    const duration = Math.min(
      this.durationMs,
      initial.deadlineAt ? Math.max(1, initial.deadlineAt - Date.now()) : this.durationMs,
    );
    this.timer = setTimeout(() => this.disarm('time-limit'), duration);
    this.unsubscribe = session.subscribe((s) => {
      if (!this.active || generation !== this.generation) return;
      if (s.connectionId !== this.connectionId || s.state !== 'connected') {
        this.disarm('connection-ended');
        return;
      }
      if ((s.inputSequence || 0) <= sequence) return;
      sequence = s.inputSequence;
      for (const rule of rules) {
        const value = s.inputs?.[rule.input];
        if (value === false) released.set(rule.input, true);
        else if (value === true && released.get(rule.input)) {
          released.set(rule.input, false);
          if (this.busy || s.busy || !session.can('sound', { id: rule.soundId })) {
            this.report.skipped++;
            this.publish();
            continue;
          }
          this.fire(rule, generation);
        }
      }
    });
    this.publish();
    return this.snapshot();
  }
  async fire(rule, generation) {
    this.busy = true;
    this.report.triggered++;
    this.publish();
    try {
      await this.session.dispatch('sound', { id: rule.soundId });
      if (generation === this.generation) this.report.sent++;
    } catch {
      if (generation === this.generation) this.report.failures++;
    } finally {
      if (generation === this.generation) {
        this.busy = false;
        if (this.active && this.report.triggered >= this.maxTriggers) this.disarm('trigger-limit');
        else if (this.active && this.report.failures) this.disarm('action-failed');
        else this.publish();
      }
    }
  }
  disarm(reason = 'user-stop') {
    if (!this.active) return;
    this.active = false;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.report.outcome = 'disarmed';
    this.report.reason = [
      'user-stop',
      'time-limit',
      'connection-ended',
      'trigger-limit',
      'action-failed',
      'page-hidden',
    ].includes(reason)
      ? reason
      : 'user-stop';
    this.report.endedAt = new Date().toISOString();
    this.publish();
  }
}
