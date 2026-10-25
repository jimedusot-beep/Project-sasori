import { cleanSurvey } from './privacy-notebook.js';
export class PrivacySurvey {
  constructor({ plugin = globalThis.SasoriNativeSurvey, emit = () => {} } = {}) {
    Object.assign(this, { plugin, emit });
    this.state = 'idle';
    this.generation = 0;
    this.timer = null;
    this.deadline = null;
    this.report = null;
    this.sessionId = '';
  }
  async start() {
    if (['starting', 'scanning'].includes(this.state)) throw new Error('survey-already-active');
    if (!this.plugin) throw new Error('native-survey-unavailable');
    const generation = ++this.generation,
      sessionId = crypto.randomUUID();
    this.sessionId = sessionId;
    this.report = null;
    this.state = 'starting';
    this.emit(this.state, null);
    this.deadline = setTimeout(() => this.stop(), 35000);
    try {
      const result = await this.plugin.startSurvey({ sessionId });
      if (generation !== this.generation) return;
      this.accept(result, sessionId);
      const poll = async () => {
        if (generation !== this.generation || !['starting', 'scanning'].includes(this.state))
          return;
        try {
          const next = await this.plugin.getSurvey({ sessionId });
          if (generation !== this.generation) return;
          this.accept(next, sessionId);
          if (['starting', 'scanning'].includes(this.state)) this.timer = setTimeout(poll, 500);
        } catch {
          if (generation === this.generation) this.stop('survey-unavailable');
        }
      };
      if (['starting', 'scanning'].includes(this.state)) this.timer = setTimeout(poll, 500);
    } catch {
      if (generation !== this.generation) return;
      this.stop('survey-unavailable');
      throw new Error('survey-unavailable');
    }
  }
  accept(result, sessionId) {
    if (
      result.sessionId !== sessionId ||
      !['starting', 'scanning', 'stopped'].includes(result.state)
    )
      throw new Error('invalid-survey-session');
    this.report = cleanSurvey(result);
    this.report.devices.forEach((device, index) => {
      const incoming = result.devices[index];
      device.name =
        typeof incoming.name === 'string'
          ? Array.from(incoming.name)
              .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
              .join('')
              .slice(0, 60)
          : '';
      device.services = Array.isArray(incoming.services)
        ? incoming.services
            .filter(
              (s) =>
                typeof s === 'string' &&
                /^(?:[a-f0-9]{4}|[a-f0-9]{8}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.test(
                  s,
                ),
            )
            .slice(0, 12)
        : [];
    });
    this.state = result.state;
    this.reason = [
      'user',
      'deadline',
      'page-hidden',
      'bluetooth-unavailable',
      'observation-limit',
    ].includes(result.reason)
      ? result.reason
      : '';
    if (this.state === 'stopped') {
      clearTimeout(this.deadline);
      this.deadline = null;
    }
    this.emit(this.state, this.report, this.reason);
  }
  stop(reason = 'user') {
    ++this.generation;
    clearTimeout(this.timer);
    clearTimeout(this.deadline);
    this.timer = null;
    this.deadline = null;
    const sessionId = this.sessionId;
    if (sessionId && this.plugin)
      Promise.resolve(this.plugin.stopSurvey({ sessionId })).catch(() => {});
    this.state = 'stopped';
    this.emit(this.state, this.report, reason);
  }
}
