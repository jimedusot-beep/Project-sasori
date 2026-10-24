import {
  ELMO_SERVICE,
  ELMO_RX,
  ELMO_TX,
  elmoPasswordDigest,
  elmoPasswordSetup,
  elmoResponse,
  elmoCommand,
  elmoSoundCommand,
  elmoVolumeCommand,
  decodeElmo,
} from './elmo-codec.js';

export class ElmoRemoteError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ElmoRemoteError';
    this.code = code;
  }
}
const failure = (error) =>
  error instanceof ElmoRemoteError ? error : new ElmoRemoteError('bluetooth-error');
const activeStates = ['choosing', 'connecting', 'authenticating', 'ready'];

// A finite, original Web Bluetooth client for the same subset as desktop/sasori_elmo.py.
// Authentication bytes remain private fields and never enter a snapshot or result.
export class ElmoRemote {
  #digest = null;
  #challenge = null;
  #phase = '';
  #rx = null;
  #tx = null;
  #notification = null;
  #disconnected = null;
  #pending = new Set();
  #signals = new Set();
  #waiters = new Map();
  #query = null;
  #timer = null;
  #authDeadline = 0;
  #allowPasswordSetup = false;
  #passwordSetupSent = false;
  #challengeResponded = false;
  #run = 0;
  constructor({
    bluetooth,
    emit = () => {},
    synthetic = false,
    operationMs = 6000,
    chooserMs = 40000,
    authMs = 10000,
    queryMs = 2000,
    sessionMs = 30000,
  } = {}) {
    if (
      ![operationMs, chooserMs, authMs, queryMs, sessionMs].every(
        (n) => Number.isFinite(n) && n > 0,
      ) ||
      operationMs > 10000 ||
      chooserMs > 60000 ||
      authMs > 15000 ||
      queryMs > 5000 ||
      sessionMs > 30000
    )
      throw new ElmoRemoteError('invalid-budget');
    Object.assign(this, {
      bluetooth,
      emit,
      synthetic: synthetic === true,
      operationMs,
      chooserMs,
      authMs,
      queryMs,
      sessionMs,
    });
    this.state = 'idle';
    this.busy = false;
    this.device = null;
    this.report = null;
    this.deadlineAt = null;
  }
  get active() {
    return activeStates.includes(this.state);
  }
  snapshot() {
    return {
      state: this.state,
      busy: this.busy,
      synthetic: this.synthetic,
      deadlineAt: this.deadlineAt,
      deviceName:
        typeof this.device?.name === 'string'
          ? [...this.device.name]
              .filter((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)
              .join('')
              .replace(/[\u202a-\u202e\u2066-\u2069]/g, '')
              .slice(0, 80)
          : 'Elmo',
      report: this.result(),
    };
  }
  result() {
    return this.report ? structuredClone(this.report) : null;
  }
  #publish() {
    this.emit(this.snapshot());
  }
  #guard(run) {
    if (run !== this.#run || !this.active) throw new ElmoRemoteError('cancelled');
  }
  #step(start, run, milliseconds = this.operationMs, code = 'operation-timeout', fatal = true) {
    this.#guard(run);
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#pending.delete(cancel);
        if (error) reject(error);
        else resolve(result);
      };
      const cancel = () => finish(new ElmoRemoteError('cancelled'));
      const timer = setTimeout(
        () => {
          finish(new ElmoRemoteError(code));
          if (fatal && run === this.#run) this.stop(code);
        },
        Math.max(0, milliseconds),
      );
      this.#pending.add(cancel);
      try {
        Promise.resolve(start()).then(
          (value) => (run === this.#run ? finish(null, value) : cancel()),
          (error) => finish(failure(error)),
        );
      } catch (error) {
        finish(failure(error));
      }
    });
  }
  #signal(name) {
    const waiting = this.#waiters.get(name);
    if (waiting) {
      this.#waiters.delete(name);
      waiting();
    } else this.#signals.add(name);
  }
  async #wait(name, run, milliseconds, code, fatal = true) {
    this.#guard(run);
    if (this.#signals.delete(name)) return;
    try {
      await this.#step(
        () => new Promise((resolve) => this.#waiters.set(name, resolve)),
        run,
        milliseconds,
        code,
        fatal,
      );
    } finally {
      this.#waiters.delete(name);
    }
  }
  #receive(run) {
    if (run !== this.#run || !this.active) return;
    if (this.#phase !== 'accepted' && performance.now() > this.#authDeadline) {
      this.stop('authentication-timeout');
      return;
    }
    const value = this.#rx.value;
    if (!(value instanceof DataView) || !value.byteLength || value.byteLength > 20) {
      this.stop('unsupported-notification');
      return;
    }
    if (this.report.notifications >= 500) {
      this.stop('notification-limit');
      return;
    }
    this.report.notifications++;
    const packet = decodeElmo(value);
    if (!packet) {
      this.report.ignoredNotifications++;
      if ([0x40, 0x41].includes(value.getUint8(0))) this.stop('malformed-authentication');
      return;
    }
    if (packet.kind === 'challenge') {
      if (
        this.#phase !== 'waiting-challenge' &&
        !(
          ['setup-pending', 'waiting-setup-acceptance'].includes(this.#phase) &&
          !this.#challengeResponded
        )
      ) {
        packet.value.fill(0);
        this.stop('changed-challenge');
        return;
      }
      this.#challenge = packet.value;
      this.#phase = 'challenge-received';
      this.#signal('authentication');
    } else if (packet.kind === 'password') {
      if (packet.value === 0) {
        this.report.authenticationOutcome = 'password-not-set';
        if (
          this.#allowPasswordSetup &&
          !this.#passwordSetupSent &&
          ['waiting-challenge', 'response-pending', 'waiting-acceptance'].includes(this.#phase)
        ) {
          this.report.passwordSetupOutcome = 'unset-reported';
          this.#phase = 'setup-needed';
          this.#signal('authentication');
        } else
          this.stop(this.#passwordSetupSent ? 'password-setup-not-confirmed' : 'password-not-set');
      } else if (packet.value === 2) {
        this.report.authenticationOutcome = 'rejected';
        if (this.#passwordSetupSent) this.report.passwordSetupOutcome = 'rejected';
        this.stop('password-rejected');
      } else if (
        [
          'response-pending',
          'waiting-acceptance',
          'setup-pending',
          'waiting-setup-acceptance',
        ].includes(this.#phase)
      ) {
        this.report.authenticationOutcome = 'toy-reported-acceptance';
        if (this.#passwordSetupSent) this.report.passwordSetupOutcome = 'toy-reported-acceptance';
        this.#phase = 'accepted';
        this.#signal('authentication');
      } else if (this.#phase !== 'accepted') this.stop('unsolicited-acceptance');
    } else if (this.#phase === 'accepted') {
      if (packet.kind === 'inputs') {
        this.report.inputs = packet.value;
        this.report.inputSequence++;
      }
      if (packet.kind === 'volume' && this.#query === 'volume') this.report.volume = packet.value;
      if (packet.kind === this.#query) this.#signal(this.#query);
    }
    this.#publish();
  }
  async connect({ password, device = null, showAll = false, allowPasswordSetup = false } = {}) {
    if (this.active) throw new ElmoRemoteError('already-connected');
    if (!this.bluetooth?.requestDevice) throw new ElmoRemoteError('browser-unavailable');
    let digest;
    try {
      digest = elmoPasswordDigest(password);
    } catch {
      throw new ElmoRemoteError('password-required');
    }
    const run = ++this.#run;
    this.#digest = digest;
    this.#allowPasswordSetup = allowPasswordSetup === true;
    this.#passwordSetupSent = false;
    this.#challengeResponded = false;
    this.device = null;
    this.busy = true;
    this.state = 'choosing';
    this.deadlineAt = null;
    this.report = {
      format: 'sasori.elmo-check',
      schemaVersion: 1,
      platform: 'browser',
      source: this.synthetic ? 'synthetic' : 'live',
      adapterId: this.#allowPasswordSetup
        ? 'elmo-password-setup/experimental-v1'
        : 'elmo-known-password/experimental-v1',
      modelSelection: 'Love2Learn Elmo B6572 protocol family',
      modelObserved: 'unknown',
      firmwareObserved: 'unknown',
      startedAt: new Date().toISOString(),
      endedAt: null,
      outcome: 'active',
      reason: '',
      cleanup: 'pending',
      authenticationOutcome: 'not-tested',
      passwordSetupEnabled: this.#allowPasswordSetup,
      passwordSetupOutcome: 'not-attempted',
      helloRequested: false,
      helloQueued: false,
      soundRequestedId: null,
      soundQueued: false,
      volumeRequested: null,
      volumeChanges: 0,
      inputSequence: 0,
      volume: null,
      inputs: null,
      queries: {},
      notifications: 0,
      ignoredNotifications: 0,
      hardwareVerified: false,
      authenticationVerified: false,
      physicalEffectVerified: false,
      observedEffect: 'not-tested',
      recoveryObserved: 'not-tested',
    };
    this.#publish();
    try {
      // The chooser must be invoked synchronously in the button's user activation.
      const choice =
        device ||
        this.bluetooth.requestDevice({
          ...(showAll ? { acceptAllDevices: true } : { filters: [{ namePrefix: 'Elmo' }] }),
          optionalServices: [ELMO_SERVICE],
        });
      Promise.resolve(choice)
        .then(
          (late) => {
            if (run !== this.#run && (!this.active || this.device !== late))
              late?.gatt?.disconnect();
          },
          () => {},
        )
        .catch(() => {});
      const candidate = await this.#step(
        () =>
          Promise.resolve(choice).catch((error) => {
            throw error?.name === 'NotFoundError'
              ? new ElmoRemoteError('selection-cancelled')
              : failure(error);
          }),
        run,
        this.chooserMs,
      );
      this.#guard(run);
      if (!candidate?.gatt || typeof candidate.addEventListener !== 'function')
        throw new ElmoRemoteError('unsupported-device');
      this.device = candidate;
      this.state = 'connecting';
      this.deadlineAt = Date.now() + this.sessionMs;
      this.#timer = setTimeout(() => this.stop('session-timeout'), this.sessionMs);
      this.#disconnected = () => {
        if (run === this.#run) this.stop('connection-lost');
      };
      candidate.addEventListener('gattserverdisconnected', this.#disconnected);
      this.#publish();
      const connecting = candidate.gatt.connect();
      Promise.resolve(connecting)
        .then(
          () => {
            if (run !== this.#run && (!this.active || this.device !== candidate))
              candidate.gatt.disconnect();
          },
          () => {},
        )
        .catch(() => {});
      await this.#step(() => connecting, run);
      const service = await this.#step(() => candidate.gatt.getPrimaryService(ELMO_SERVICE), run);
      if (service.uuid?.toLowerCase() !== ELMO_SERVICE)
        throw new ElmoRemoteError('unsupported-device');
      const channels = await this.#step(() => service.getCharacteristics(), run);
      if (!Array.isArray(channels) || channels.length > 128)
        throw new ElmoRemoteError('unsupported-device');
      const rx = channels.filter(
        (c) =>
          c.uuid?.toLowerCase() === ELMO_RX &&
          c.properties?.notify &&
          typeof c.startNotifications === 'function',
      );
      const tx = channels.filter(
        (c) =>
          c.uuid?.toLowerCase() === ELMO_TX &&
          c.properties?.writeWithoutResponse &&
          typeof c.writeValueWithoutResponse === 'function',
      );
      if (rx.length !== 1 || tx.length !== 1) throw new ElmoRemoteError('unsupported-device');
      [this.#rx] = rx;
      [this.#tx] = tx;
      this.state = 'authenticating';
      this.#phase = 'waiting-challenge';
      const authDeadline = performance.now() + this.authMs;
      this.#authDeadline = authDeadline;
      this.#notification = () => this.#receive(run);
      this.#rx.addEventListener('characteristicvaluechanged', this.#notification);
      this.#publish();
      await this.#step(() => this.#rx.startNotifications(), run);
      await this.#authenticate(run, authDeadline);
      this.#digest.fill(0);
      this.#digest = null;
      this.#guard(run);
      this.state = 'ready';
      this.#publish();
      await this.#read(run);
      this.#guard(run);
      this.busy = false;
      this.#publish();
      return this.snapshot();
    } catch (error) {
      const safe = failure(error);
      if (run === this.#run) this.stop(safe.code);
      throw safe;
    }
  }
  async #authenticate(run, authDeadline) {
    while (this.#phase !== 'accepted') {
      await this.#wait(
        'authentication',
        run,
        authDeadline - performance.now(),
        'authentication-timeout',
      );
      this.#guard(run);
      if (this.#phase === 'accepted') break;
      let packet, pending, waiting;
      if (this.#phase === 'challenge-received') {
        packet = elmoResponse(this.#digest, this.#challenge);
        this.#challenge.fill(0);
        this.#challenge = null;
        this.#challengeResponded = true;
        pending = 'response-pending';
        waiting = 'waiting-acceptance';
      } else if (
        this.#phase === 'setup-needed' &&
        this.#allowPasswordSetup &&
        !this.#passwordSetupSent
      ) {
        // This persistent write requires an explicit user choice and the toy's exact unset status.
        packet = elmoPasswordSetup(this.#digest);
        this.#passwordSetupSent = true;
        this.report.passwordSetupOutcome = 'write-requested';
        pending = 'setup-pending';
        waiting = 'waiting-setup-acceptance';
      } else throw new ElmoRemoteError('malformed-authentication');
      this.#publish();
      try {
        await this.#step(() => {
          this.#phase = pending;
          return this.#tx.writeValueWithoutResponse(packet);
        }, run);
      } finally {
        packet.fill(0);
      }
      if (this.#phase === pending) this.#phase = waiting;
    }
  }
  async #read(run, intents = ['volume', 'inputs']) {
    for (const intent of intents) {
      this.#guard(run);
      this.#query = intent;
      this.#signals.delete(intent);
      await this.#step(() => this.#tx.writeValueWithoutResponse(elmoCommand(intent)), run);
      try {
        await this.#wait(intent, run, this.queryMs, 'no-matching-reply', false);
        this.report.queries[intent] = 'matching-frame';
      } catch (error) {
        if (error.code !== 'no-matching-reply') throw error;
        this.report.queries[intent] = 'no-matching-reply';
      } finally {
        this.#query = null;
      }
    }
  }
  async readStatus() {
    if (this.state !== 'ready' || this.busy) throw new ElmoRemoteError('not-ready');
    const run = this.#run;
    this.busy = true;
    this.#publish();
    try {
      await this.#read(run);
      this.#guard(run);
    } catch (error) {
      if (run === this.#run) this.stop(failure(error).code);
      throw failure(error);
    } finally {
      if (run === this.#run) {
        this.busy = false;
        this.#publish();
      }
    }
  }
  async greet() {
    if (this.state !== 'ready' || this.busy || this.report.helloRequested)
      throw new ElmoRemoteError('not-ready');
    return this.playSound(9);
  }
  async playSound(id) {
    let packet;
    try {
      packet = elmoSoundCommand(id);
    } catch {
      throw new ElmoRemoteError('unsupported-sound');
    }
    if (this.state !== 'ready' || this.busy) throw new ElmoRemoteError('not-ready');
    if (this.report.soundRequestedId !== null) throw new ElmoRemoteError('sound-limit');
    const run = this.#run;
    this.busy = true;
    this.report.soundRequestedId = id;
    if (id === 9) this.report.helloRequested = true;
    this.#publish();
    try {
      await this.#step(() => this.#tx.writeValueWithoutResponse(packet), run);
      this.#guard(run);
      this.report.soundQueued = true;
      if (id === 9) this.report.helloQueued = true;
    } catch (error) {
      if (run === this.#run) this.stop(failure(error).code);
      throw failure(error);
    } finally {
      if (run === this.#run) {
        this.busy = false;
        this.#publish();
      }
    }
  }
  async setVolume(level) {
    let packet;
    try {
      packet = elmoVolumeCommand(level);
    } catch {
      throw new ElmoRemoteError('invalid-volume');
    }
    if (this.state !== 'ready' || this.busy) throw new ElmoRemoteError('not-ready');
    if (this.report.volumeChanges >= 4) throw new ElmoRemoteError('volume-limit');
    const run = this.#run;
    this.busy = true;
    this.report.volumeRequested = level;
    this.report.volumeChanges++;
    this.#publish();
    try {
      await this.#step(() => this.#tx.writeValueWithoutResponse(packet), run);
      this.#guard(run);
      // A later query is an observation, not an acknowledgment of the setting write.
      await this.#read(run, ['volume']);
      this.#guard(run);
    } catch (error) {
      if (run === this.#run) this.stop(failure(error).code);
      throw failure(error);
    } finally {
      if (run === this.#run) {
        this.busy = false;
        this.#publish();
      }
    }
  }
  stop(reason = 'user-stop') {
    if (!this.active) return;
    const wasReady = this.state === 'ready';
    ++this.#run;
    clearTimeout(this.#timer);
    this.#timer = null;
    this.#rx?.removeEventListener('characteristicvaluechanged', this.#notification);
    this.device?.removeEventListener('gattserverdisconnected', this.#disconnected);
    for (const cancel of [...this.#pending]) cancel();
    this.#pending.clear();
    this.#waiters.clear();
    this.#signals.clear();
    this.#digest?.fill(0);
    this.#challenge?.fill(0);
    this.#digest = this.#challenge = this.#rx = this.#tx = null;
    this.#notification = this.#disconnected = null;
    this.#phase = '';
    this.#authDeadline = 0;
    this.#allowPasswordSetup = false;
    this.#passwordSetupSent = false;
    this.#challengeResponded = false;
    this.#query = null;
    this.state = 'disconnected';
    this.busy = false;
    this.deadlineAt = null;
    this.report.reason = reason;
    if (this.report.passwordSetupOutcome === 'write-requested')
      this.report.passwordSetupOutcome = 'not-confirmed';
    this.report.endedAt = new Date().toISOString();
    this.report.outcome =
      reason === 'user-stop' && wasReady
        ? 'completed'
        : ['user-stop', 'page-hidden', 'selection-cancelled'].includes(reason)
          ? 'cancelled'
          : reason.includes('timeout')
            ? 'timeout'
            : 'failed';
    try {
      this.device?.gatt?.disconnect();
      this.report.cleanup = this.device?.gatt?.connected
        ? 'disconnect-not-confirmed'
        : 'disconnected';
    } catch {
      this.report.cleanup = 'disconnect-not-confirmed';
    }
    this.#publish();
  }
}

export function createElmoDemo() {
  const rx = new EventTarget(),
    tx = { uuid: ELMO_TX, properties: { writeWithoutResponse: true } };
  rx.uuid = ELMO_RX;
  rx.properties = { notify: true };
  let volume = 5,
    inputs = 0x41;
  const notify = (bytes) => {
    rx.value = new DataView(Uint8Array.from(bytes).buffer);
    rx.dispatchEvent(new Event('characteristicvaluechanged'));
  };
  rx.startNotifications = async () => {
    notify([0x41, 0x10, 0x20, 0x30, 0x40]);
    return rx;
  };
  tx.writeValueWithoutResponse = async (value) => {
    const bytes = Array.from(value);
    if (bytes[0] === 0x41) notify(bytes.join(',') === '65,10,142,18,236' ? [0x40, 1] : [0x40, 2]);
    if (bytes[0] === 0x23 && bytes.length === 2) volume = bytes[1];
    if (bytes.join(',') === '34') notify([0x22, volume]);
    if (bytes.join(',') === '32') notify([0x20, inputs]);
  };
  const device = new EventTarget();
  device.name = 'Demo Elmo';
  device.gatt = {
    connected: false,
    async connect() {
      this.connected = true;
      return this;
    },
    async getPrimaryService() {
      return { uuid: ELMO_SERVICE, getCharacteristics: async () => [rx, tx] };
    },
    disconnect() {
      this.connected = false;
    },
  };
  return {
    requestDevice: async () => device,
    simulateInput(mask) {
      inputs = mask;
      notify([0x20, inputs]);
    },
  };
}
