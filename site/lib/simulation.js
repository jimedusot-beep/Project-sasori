import { decodePacket } from './protocol.js';
export const SYNTHETIC_SERVICE = '00000000-0000-4000-8000-000000000001';
export const SYNTHETIC_NOTIFY = '00000000-0000-4000-8000-000000000002';
export class SimulationTransport {
  constructor(emit = () => {}) {
    this.emit = emit;
    this.active = false;
    this.timers = [];
  }
  connect({ scenario = 'normal' } = {}) {
    if (this.active) throw new Error('Simulation already active.');
    this.active = true;
    this.emit({ type: 'state', state: 'inspecting', synthetic: true });
    this.emit({
      type: 'services',
      synthetic: true,
      services: [
        {
          uuid: SYNTHETIC_SERVICE,
          evidence: 'synthetic',
          characteristics: [
            { uuid: SYNTHETIC_NOTIFY, properties: ['notify'], evidence: 'synthetic' },
          ],
        },
      ],
    });
    const fixtures =
      scenario === 'malformed'
        ? [new Uint8Array([255, 254]), new Uint8Array(1200)]
        : ['NewModeIdx:12', 'unrecognized:synthetic', 'Start:LowPowerSleep'].map((v) =>
            new TextEncoder().encode(v),
          );
    fixtures.forEach((bytes, i) =>
      this.timers.push(
        setTimeout(
          () => {
            if (this.active)
              this.emit({
                type: 'packet',
                packet: decodePacket(bytes, SYNTHETIC_NOTIFY),
                synthetic: true,
              });
          },
          150 + i * 300,
        ),
      ),
    );
    this.timers.push(
      setTimeout(
        () =>
          this.disconnect(
            scenario === 'disconnect' ? 'unexpected-synthetic' : 'simulation-complete',
          ),
        1600,
      ),
    );
  }
  disconnect(reason = 'user') {
    if (!this.active) return;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.active = false;
    this.emit({ type: 'state', state: 'disconnected', reason, synthetic: true });
  }
}
