export class PrivacyCamera {
  constructor({
    mediaDevices = globalThis.navigator?.mediaDevices,
    emit = () => {},
    budgetMs = 120000,
  } = {}) {
    if (!Number.isFinite(budgetMs) || budgetMs <= 0 || budgetMs > 120000)
      throw new Error('invalid-camera-budget');
    Object.assign(this, { mediaDevices, emit, budgetMs });
    this.state = 'idle';
    this.generation = 0;
    this.stream = null;
    this.timer = null;
  }
  async start() {
    if (['starting', 'live'].includes(this.state)) throw new Error('camera-already-active');
    if (!this.mediaDevices?.getUserMedia) throw new Error('camera-unavailable');
    const generation = ++this.generation;
    this.state = 'starting';
    this.emit(this.state);
    this.timer = setTimeout(() => this.stop(), this.budgetMs);
    try {
      const stream = await this.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (generation !== this.generation) {
        for (const track of stream.getTracks()) track.stop();
        return null;
      }
      this.stream = stream;
      for (const track of stream.getTracks())
        track.addEventListener(
          'ended',
          () => {
            if (generation === this.generation) this.stop();
          },
          { once: true },
        );
      this.state = 'live';
      this.emit(this.state);
      return stream;
    } catch {
      if (generation !== this.generation) return null;
      this.stop();
      throw new Error('camera-unavailable');
    }
  }
  stop() {
    ++this.generation;
    clearTimeout(this.timer);
    this.timer = null;
    for (const track of this.stream?.getTracks() || []) track.stop();
    this.stream = null;
    this.state = 'stopped';
    this.emit(this.state);
  }
}
