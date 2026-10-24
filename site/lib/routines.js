import { hubFamily, hubAction, ELMO_INPUTS } from './hub-catalog.js';

export const MAX_ROUTINE_STEPS = 32;
export const MAX_ROUTINE_MS = 120000;
export function validateRoutine(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    typeof input.id !== 'string' ||
    !/^routine-[a-zA-Z0-9_-]{1,40}$/.test(input.id) ||
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.length > 80 ||
    !Array.isArray(input.steps) ||
    !input.steps.length ||
    input.steps.length > MAX_ROUTINE_STEPS
  )
    throw new Error('A routine needs a name and 1–32 supported steps.');
  hubFamily(input.familyId);
  let soundCount = 0,
    volumeCount = 0,
    touchCount = 0,
    waitBudget = 0;
  const steps = input.steps.map((step) => {
    if (step?.kind === 'action') {
      const action = hubAction(input.familyId, step.intent, step.args);
      if (action.intent === 'sound') soundCount++;
      if (action.intent === 'volume') volumeCount++;
      return { kind: 'action', ...action };
    }
    if (
      step?.kind === 'wait' &&
      Number.isSafeInteger(step.ms) &&
      step.ms >= 50 &&
      step.ms <= 30000
    ) {
      waitBudget += step.ms;
      return { kind: 'wait', ms: step.ms };
    }
    if (
      step?.kind === 'touch' &&
      input.familyId === 'elmo-l2l/v1' &&
      ELMO_INPUTS.includes(step.input) &&
      Number.isSafeInteger(step.timeoutMs) &&
      step.timeoutMs >= 1000 &&
      step.timeoutMs <= 10000
    ) {
      touchCount++;
      waitBudget += step.timeoutMs;
      return { kind: 'touch', input: step.input, timeoutMs: step.timeoutMs };
    }
    throw new Error('Unsupported routine step.');
  });
  if (soundCount > 12 || volumeCount > 12 || touchCount > 4 || waitBudget > 90000)
    throw new Error(
      'Use at most twelve sounds, twelve volume changes, four touch triggers and 90 seconds of waits.',
    );
  return { id: input.id, name: input.name.trim(), familyId: input.familyId, steps };
}
const cancelled = () => new DOMException('Routine cancelled.', 'AbortError');
export class RoutineRunner {
  constructor({ emit = () => {}, budgetMs = MAX_ROUTINE_MS } = {}) {
    if (!Number.isFinite(budgetMs) || budgetMs <= 0 || budgetMs > MAX_ROUTINE_MS)
      throw new Error('Invalid routine time limit.');
    this.emit = emit;
    this.budgetMs = budgetMs;
    this.active = false;
    this.controller = null;
    this.session = null;
    this.report = null;
  }
  snapshot() {
    return this.report ? structuredClone(this.report) : null;
  }
  publish() {
    this.emit(this.snapshot());
  }
  stopSession() {
    if (this.session?.connectionId === this.connectionId) this.session.stop();
  }
  cancel() {
    if (!this.active) return;
    this.controller.abort();
    this.stopSession();
  }
  async bounded(start, milliseconds, timeoutCode = 'routine-timeout') {
    const signal = this.controller.signal;
    if (signal.aborted) throw cancelled();
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = (error, value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        if (error) reject(error);
        else resolve(value);
      };
      const abort = () => finish(cancelled());
      const timer = setTimeout(() => finish(new Error(timeoutCode)), Math.max(0, milliseconds));
      signal.addEventListener('abort', abort, { once: true });
      try {
        Promise.resolve(start(signal)).then(
          (value) => finish(null, value),
          (error) => finish(error),
        );
      } catch (error) {
        finish(error);
      }
    });
  }
  async touch(step, remaining) {
    const first = this.session.snapshot();
    let sequence = first.inputSequence || 0;
    let released = first.inputs?.[step.input] === false;
    let unsubscribe = () => {};
    try {
      await this.bounded(
        (signal) =>
          new Promise((resolve, reject) => {
            const clean = () => unsubscribe();
            signal.addEventListener('abort', clean, { once: true });
            unsubscribe = this.session.subscribe((snapshot) => {
              if (snapshot.connectionId !== this.connectionId || snapshot.state !== 'connected') {
                reject(cancelled());
                return;
              }
              if ((snapshot.inputSequence || 0) <= sequence) return;
              sequence = snapshot.inputSequence;
              const value = snapshot.inputs?.[step.input];
              if (value === false) released = true;
              else if (value === true && released) resolve();
            });
          }),
        Math.min(remaining, step.timeoutMs),
        'touch-timeout',
      );
    } finally {
      unsubscribe();
    }
  }
  async run(input, session) {
    if (this.active) throw new Error('A routine is already running.');
    const routine = validateRoutine(input),
      initial = session.snapshot();
    if (
      initial.state !== 'connected' ||
      initial.busy ||
      initial.familyId !== routine.familyId ||
      typeof session.connectionId !== 'string' ||
      !session.connectionId
    )
      throw new Error('Connect a matching device and wait until it is ready.');
    this.active = true;
    this.session = session;
    this.connectionId = session.connectionId;
    this.controller = new AbortController();
    const unsubscribe = session.subscribe((s) => {
      if (s.connectionId !== this.connectionId || s.state !== 'connected') this.controller.abort();
    });
    const start = performance.now();
    this.report = {
      format: 'sasori.routine-result',
      schemaVersion: 1,
      familyId: routine.familyId,
      source: initial.synthetic ? 'synthetic' : 'live',
      startedAt: new Date().toISOString(),
      endedAt: null,
      outcome: 'running',
      reason: '',
      currentStep: 0,
      completedSteps: 0,
      totalSteps: routine.steps.length,
      durationMs: 0,
      hardwareVerified: false,
      authenticationVerified: false,
      physicalEffectVerified: false,
    };
    this.publish();
    try {
      for (const [index, step] of routine.steps.entries()) {
        if (
          this.controller.signal.aborted ||
          session.connectionId !== this.connectionId ||
          session.snapshot().state !== 'connected'
        )
          throw cancelled();
        const remaining = this.budgetMs - (performance.now() - start);
        if (remaining <= 0) throw new Error('routine-timeout');
        this.report.currentStep = index + 1;
        this.publish();
        if (step.kind === 'wait') {
          await this.bounded(
            (signal) =>
              new Promise((resolve) => {
                const timer = setTimeout(resolve, step.ms);
                signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
              }),
            remaining,
          );
        } else if (step.kind === 'touch') await this.touch(step, remaining);
        else {
          const gap = session.readyIn?.(step.intent) || 0;
          if (Number.isFinite(gap) && gap > 0) {
            await this.bounded(
              (signal) =>
                new Promise((resolve) => {
                  const timer = setTimeout(resolve, gap);
                  signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
                }),
              remaining,
            );
          }
          if (!session.can(step.intent, step.args)) throw new Error('action-unavailable');
          const actionRemaining = this.budgetMs - (performance.now() - start);
          if (actionRemaining <= 0) throw new Error('routine-timeout');
          await this.bounded(() => session.dispatch(step.intent, step.args), actionRemaining);
        }
        if (this.controller.signal.aborted || session.connectionId !== this.connectionId)
          throw cancelled();
        this.report.completedSteps++;
        this.publish();
      }
      this.report.outcome = 'completed';
    } catch (error) {
      this.report.outcome = error.name === 'AbortError' ? 'cancelled' : 'failed';
      this.report.reason =
        error.name === 'AbortError'
          ? 'cancelled'
          : ['routine-timeout', 'touch-timeout', 'action-unavailable'].includes(error.message)
            ? error.message
            : 'action-failed';
      this.controller.abort();
      this.stopSession();
    } finally {
      unsubscribe();
      this.controller.abort();
      this.active = false;
      this.report.endedAt = new Date().toISOString();
      this.report.durationMs = Math.max(0, Math.round(performance.now() - start));
      this.publish();
    }
    return this.snapshot();
  }
}
