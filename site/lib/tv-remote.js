import { TV_KEYS } from './hub-catalog.js';

const fail = (code) => Object.assign(new Error(code), { code });
const API_PATHS = new Set([
  '/api/ha/configure',
  '/api/pair',
  '/api/bootstrap',
  '/api/tv/entities',
  '/api/tv/connect',
  '/api/tv/status',
  '/api/tv/key',
  '/api/tv/learn',
]);
export class TVRemote {
  #csrf = '';
  #lease = '';
  #run = 0;
  #pending = new Set();
  constructor({
    synthetic = false,
    companion = false,
    fetcher = globalThis.fetch,
    emit = () => {},
  } = {}) {
    Object.assign(this, { synthetic, companion, fetcher, emit });
    this.state = 'idle';
    this.busy = false;
    this.keys = [];
    this.information = {};
    this.lastAction = '';
    this.driver = '';
    this.reason = '';
    this.learnAvailable = false;
    this.timer = null;
    this.deadlineAt = null;
  }
  snapshot() {
    return {
      state: this.state,
      busy: this.busy,
      keys: [...this.keys],
      information: { ...this.information },
      lastAction: this.lastAction,
      reason: this.reason,
      learnAvailable: this.learnAvailable,
      synthetic: this.synthetic,
      deadlineAt: this.deadlineAt,
      physicalEffectVerified: false,
    };
  }
  publish() {
    this.emit(this.snapshot());
  }
  async request(path, data = null, timeoutMs = 6000) {
    if (!this.companion || !this.fetcher) throw fail('helper-required');
    if (!API_PATHS.has(path)) throw fail('action-unavailable');
    const run = this.#run,
      controller = new AbortController();
    this.#pending.add(controller);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await this.fetcher(path, {
        method: data === null ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'X-Sasori-Client': 'hub-v1',
          ...(this.#csrf ? { 'X-Sasori-CSRF': this.#csrf } : {}),
        },
        ...(data === null ? {} : { body: JSON.stringify(data) }),
      });
      const text = await response.text();
      if (text.length > 65536) throw fail('network-error');
      let body;
      try {
        body = JSON.parse(text);
      } catch {
        throw fail('network-error');
      }
      if (run !== this.#run) throw new DOMException('Cancelled.', 'AbortError');
      if (!response.ok)
        throw fail(
          [
            'pairing-required',
            'pairing-rejected',
            'tv-unreachable',
            'tv-control-disabled',
            'tv-unsupported',
            'ha-unavailable',
            'ha-unauthorized',
            'action-unavailable',
            'busy',
            'local-network-required',
          ].includes(body.code)
            ? body.code
            : 'network-error',
        );
      return body;
    } catch (error) {
      if (run !== this.#run) throw new DOMException('Cancelled.', 'AbortError');
      throw error.code ? error : fail('network-error');
    } finally {
      clearTimeout(timer);
      this.#pending.delete(controller);
    }
  }
  async authorize(pin = '') {
    if (this.synthetic) return;
    if (pin) await this.request('/api/pair', { pin });
    const data = await this.request('/api/bootstrap');
    if (!data.paired || typeof data.csrf !== 'string' || !/^[a-f0-9]{32,128}$/.test(data.csrf))
      throw fail('pairing-required');
    this.#csrf = data.csrf;
  }
  async entities(pin = '') {
    await this.authorize(pin);
    const data = await this.request('/api/tv/entities');
    if (!Array.isArray(data.entities) || data.entities.length > 100) throw fail('network-error');
    return data.entities
      .filter(
        (e) =>
          e &&
          typeof e.id === 'string' &&
          /^(media_player|remote)\.[a-z0-9_]+$/.test(e.id) &&
          typeof e.name === 'string' &&
          e.name.length <= 100,
      )
      .map(({ id, name }) => ({ id, name }));
  }
  async configureHomeAssistant(url, token, remember = false) {
    return this.request('/api/ha/configure', { url, token, remember: remember === true });
  }
  apply(data) {
    if (
      !data ||
      !Array.isArray(data.keys) ||
      data.keys.length > Object.keys(TV_KEYS).length ||
      data.keys.some((key) => !Object.hasOwn(TV_KEYS, key))
    )
      throw fail('network-error');
    this.keys = [...new Set(data.keys)];
    const info = data.information || {};
    this.information = {};
    for (const key of ['model', 'firmware', 'state', 'label'])
      if (typeof info[key] === 'string')
        this.information[key] = [...info[key]]
          .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
          .join('')
          .slice(0, 160);
    this.learnAvailable = data.learnAvailable === true;
  }
  async connect({ driver = 'roku', target = '', device = 'sasori-tv', pin = '' } = {}) {
    if (['connecting', 'connected'].includes(this.state)) throw fail('busy');
    ++this.#run;
    this.state = 'connecting';
    this.busy = true;
    this.reason = '';
    this.driver = driver;
    this.publish();
    const run = this.#run;
    try {
      if (this.synthetic) {
        this.keys = Object.keys(TV_KEYS);
        this.information = {
          label: 'Demo TV',
          model: 'Synthetic media device',
          firmware: 'demo',
          state: 'on',
        };
      } else {
        await this.authorize(pin);
        const data = await this.request('/api/tv/connect', { driver, target, device });
        if (typeof data.lease !== 'string' || !/^[a-f0-9]{32,128}$/.test(data.lease))
          throw fail('network-error');
        this.apply(data);
        this.#lease = data.lease;
      }
      if (run !== this.#run) throw new DOMException('Cancelled.', 'AbortError');
      this.state = 'connected';
      this.busy = false;
      this.deadlineAt = Date.now() + 300000;
      this.timer = setTimeout(() => this.stop('session-timeout'), 300000);
      this.publish();
    } catch (error) {
      if (run === this.#run) this.stop(error.code || 'network-error');
      throw error;
    }
    return this.snapshot();
  }
  async dispatch(intent, args = {}) {
    if (this.state !== 'connected' || this.busy) throw fail('not-ready');
    if (intent !== 'status' && (intent !== 'key' || !this.keys.includes(args.key)))
      throw fail('action-unavailable');
    this.busy = true;
    this.publish();
    const run = this.#run;
    try {
      if (!this.synthetic) {
        const data = await this.request(intent === 'status' ? '/api/tv/status' : '/api/tv/key', {
          lease: this.#lease,
          ...(intent === 'key' ? { key: args.key } : {}),
        });
        if (intent === 'status') this.apply(data);
      }
      if (run !== this.#run) throw new DOMException('Cancelled.', 'AbortError');
      this.lastAction = intent === 'status' ? 'status-read' : args.key + '-requested';
    } catch (error) {
      if (
        run === this.#run &&
        ['pairing-required', 'action-unavailable', 'network-error', 'tv-unreachable'].includes(
          error.code,
        )
      )
        this.stop(error.code);
      throw error;
    } finally {
      if (run === this.#run) {
        this.busy = false;
        this.publish();
      }
    }
    return this.snapshot();
  }
  async learn(key) {
    if (
      !this.learnAvailable ||
      this.state !== 'connected' ||
      this.busy ||
      !Object.hasOwn(TV_KEYS, key)
    )
      throw fail('action-unavailable');
    this.busy = true;
    this.publish();
    const run = this.#run;
    try {
      await this.request('/api/tv/learn', { lease: this.#lease, key }, 35000);
      if (run === this.#run) this.lastAction = 'ir-learning-requested';
    } finally {
      if (run === this.#run) {
        this.busy = false;
        this.publish();
      }
    }
  }
  stop(reason = 'user-stop') {
    const lease = this.#lease,
      csrf = this.#csrf;
    ++this.#run;
    clearTimeout(this.timer);
    this.timer = null;
    this.deadlineAt = null;
    for (const pending of this.#pending) pending.abort();
    this.#pending.clear();
    this.#lease = '';
    this.state = 'disconnected';
    this.busy = false;
    this.keys = [];
    this.reason = reason;
    this.publish();
    if (lease && !this.synthetic && this.companion) {
      const controller = new AbortController(),
        timer = setTimeout(() => controller.abort(), 3000);
      try {
        Promise.resolve(
          this.fetcher('/api/tv/disconnect', {
            method: 'POST',
            credentials: 'same-origin',
            signal: controller.signal,
            headers: {
              'Content-Type': 'application/json',
              'X-Sasori-Client': 'hub-v1',
              'X-Sasori-CSRF': csrf,
            },
            body: JSON.stringify({ lease }),
          }),
        )
          .catch(() => {})
          .finally(() => clearTimeout(timer));
      } catch {
        clearTimeout(timer);
      }
    }
  }
}
