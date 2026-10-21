// Synthetic lifecycle fixtures ONLY. There is no live Elmo authentication adapter or credential input.
export class AuthExperiment {
  constructor(emit = () => {}) {
    this.emit = emit;
    this.state = 'idle';
    this.timer = null;
    this.deadline = null;
    this.run = 0;
  }
  start({
    simulation = false,
    consent = false,
    scenario = 'success',
    timeoutMs = 2000,
    delayMs = 450,
    maxPackets = 4,
  } = {}) {
    if (!simulation || !consent)
      throw new Error('Only explicitly requested synthetic authentication is available.');
    if (this.state === 'awaiting') throw new Error('An authentication fixture is already running.');
    if (!['success', 'rejected', 'timeout', 'inconclusive'].includes(scenario))
      throw new Error('Unknown synthetic scenario.');
    if (
      !Number.isFinite(timeoutMs) ||
      timeoutMs < 10 ||
      timeoutMs > 5000 ||
      !Number.isInteger(maxPackets) ||
      maxPackets < 1 ||
      maxPackets > 4
    )
      throw new Error('Invalid experiment budget.');
    if (!Number.isFinite(delayMs) || delayMs < 0 || delayMs > 5000)
      throw new Error('Invalid fixture delay.');
    const run = ++this.run;
    this.set('awaiting', { packets: 1, synthetic: true });
    this.deadline = setTimeout(() => {
      if (run === this.run) this.finish('timeout');
    }, timeoutMs);
    if (scenario !== 'timeout')
      this.timer = setTimeout(() => {
        if (run === this.run) this.finish(maxPackets < 2 ? 'inconclusive' : scenario);
      }, delayMs);
  }
  set(state, details = {}) {
    this.state = state;
    this.emit({ state, synthetic: true, hardwareTraffic: false, ...details });
  }
  finish(result) {
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    ++this.run;
    this.set(result);
  }
  cancel() {
    if (this.state === 'awaiting') this.finish('cancelled');
  }
}
