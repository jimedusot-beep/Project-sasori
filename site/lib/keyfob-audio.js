// Phone-only acoustic testing. This is not a 433 MHz RF decoder.
export const CONDITIONS = Object.freeze([
  { id: 'unlock', label: 'Unlock button', kind: 'target' },
  { id: 'lock', label: 'Lock button', kind: 'target' },
  { id: 'quiet', label: 'No press (silence)', kind: 'control' },
  { id: 'tap', label: 'Tap nearby surface', kind: 'control' },
  { id: 'muffled', label: 'Press through cloth', kind: 'exploratory' },
]);

const SENSITIVITY = Object.freeze({
  sensitive: { floor: 0.012, multiple: 2.4 },
  normal: { floor: 0.022, multiple: 3.6 },
  strict: { floor: 0.04, multiple: 5 },
});

export function sampleLevel(samples) {
  if (!samples?.length) return 0;
  let sum = 0;
  for (const sample of samples) {
    const amplitude = (sample - 128) / 128;
    sum += amplitude * amplitude;
  }
  return Math.sqrt(sum / samples.length);
}

export function calibrateNoise(levels) {
  const sorted = [...levels].filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < 12) throw new Error('Not enough microphone samples to calibrate.');
  return sorted[Math.floor((sorted.length - 1) * 0.8)];
}

export function detectionThreshold(noiseLevel, sensitivity = 'normal') {
  if (!Number.isFinite(noiseLevel) || noiseLevel < 0)
    throw new Error('A valid background level is required.');
  const config = SENSITIVITY[sensitivity];
  if (!config) throw new Error('Unknown sensitivity.');
  return Math.min(1, Math.max(config.floor, noiseLevel * config.multiple));
}

export function recordTrial({ condition, events, peak, threshold, noise, at }) {
  if (!CONDITIONS.some((item) => item.id === condition))
    throw new Error('Unknown trial condition.');
  if (
    !Array.isArray(events) ||
    !events.every((time) => Number.isFinite(time) && time >= 0 && time <= 2000)
  )
    throw new Error('Invalid event timings.');
  if (
    ![peak, threshold, noise].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
  )
    throw new Error('Invalid sound levels.');
  return {
    condition,
    detected: events.length > 0,
    eventCount: events.length,
    eventMs: [...events],
    peak: Number(peak.toFixed(4)),
    threshold: Number(threshold.toFixed(4)),
    background: Number(noise.toFixed(4)),
    at,
  };
}

export function summarizeTrials(trials) {
  const groups = Object.fromEntries(
    CONDITIONS.map((condition) => [
      condition.id,
      { label: condition.label, total: 0, detected: 0 },
    ]),
  );
  for (const trial of trials) {
    const group = groups[trial.condition];
    if (!group) continue;
    group.total++;
    if (trial.detected) group.detected++;
  }
  for (const group of Object.values(groups)) {
    group.rate = group.total ? group.detected / group.total : null;
  }
  const ready = ['unlock', 'lock', 'quiet', 'tap'].every((id) => groups[id].total >= 5);
  let verdict =
    'Not enough evidence: run at least 5 trials each of unlock, lock, silence, and unrelated taps.';
  if (ready) {
    if (
      groups.unlock.rate >= 0.8 &&
      groups.lock.rate >= 0.8 &&
      groups.quiet.rate <= 0.2 &&
      groups.tap.rate <= 0.2
    ) {
      verdict =
        'Promising acoustic button trigger. Repeat in a different room. This is not RF decoding or proof of lock/unlock identification.';
    } else if (groups.tap.rate > 0.2) {
      verdict =
        'The phone also hears unrelated taps: this detector is NOT fob-specific. Do not treat it as a reliable Sasori command yet.';
    } else {
      verdict =
        'Unreliable at the present distance/sensitivity. Recalibrate and repeat; no fob control is established.';
    }
  }
  return { groups, ready, verdict };
}

export function csvForTrials(trials) {
  const header = 'condition,detected,eventCount,eventMs,peak,threshold,background,at';
  const rows = trials.map((trial) =>
    [
      trial.condition,
      trial.detected,
      trial.eventCount,
      trial.eventMs.join(';'),
      trial.peak,
      trial.threshold,
      trial.background,
      trial.at,
    ]
      .map((item) => '"' + String(item).replaceAll('"', '""') + '"')
      .join(','),
  );
  return [header, ...rows].join('\n') + '\n';
}
