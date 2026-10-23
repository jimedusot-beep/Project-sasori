import { recordId } from './records.js';
import { sanitizeText } from './diagnostics.js';

export const MAX_DISCOVERIES = 50;
export const MAX_DISCOVERY_BYTES = 2 * 1024 * 1024;
export const MAX_DISCOVERY_FILE_BYTES = 1024 * 1024;
export const MAX_WAV_BYTES = 10 * 1024 * 1024;
export const METHODS = [
  {
    id: 'sound',
    label: 'Sound & acoustic channels',
    question: 'Does normal toy or app audio carry repeatable information?',
    capture:
      'Compare a quiet baseline with one labeled normal interaction. Keep microphone, sample rate, distance, and exact device revision in your source note.',
    limit:
      'Inspect a local PCM WAV file. A spectral peak alone is not a decoded command; frequencies above half the sample rate cannot be observed.',
  },
  {
    id: 'infrared',
    label: 'Infrared timing',
    question: 'Do received mark/space timings change with the same action?',
    capture:
      'Import positive integer microseconds, alternating mark then space. Record receiver, action, state, and carrier measurement separately.',
    limit:
      'Timing comparison does not recover carrier frequency, establish meaning, or replay a signal.',
  },
  {
    id: 'accessory',
    label: 'Accessory & connector interfaces',
    question: 'Which documented accessories change observable behavior?',
    capture:
      'Label connector photos, accessory model, normal interaction, and the corresponding passive capture.',
    limit:
      'Unknown pinouts and electrical levels remain unknown. No accessory outputs or power connections are generated here.',
  },
  {
    id: 'ble',
    label: 'BLE & content channels',
    question: 'Which notification fields vary during a repeatable observation?',
    capture:
      'Use Protocol explorer for a manual inspection. Preserve characteristic, timestamps, toy model, firmware if known, and whether payloads were retained.',
    limit:
      'Matching bytes do not establish authentication, content upload, or compatibility with another toy.',
  },
  {
    id: 'internal',
    label: 'Internal UART / SPI / I²C',
    question: 'Which independently identified internal bus carries a normal event?',
    capture:
      'Keep chip markings, datasheet references, verified signal levels, analyzer settings, and a labeled receive-only trace.',
    limit:
      'No guessed pinouts, bus injection, or physical adapter is supplied. Imported bytes are an offline observation.',
  },
  {
    id: 'app',
    label: 'Companion app observations',
    question: 'Which authorized app action correlates with an observed message?',
    capture:
      'Record legally held app version, exact device, before/after state, event timing, and provenance without credentials.',
    limit:
      'Correlation and source claims do not establish a live protocol or permission to execute captured traffic.',
  },
  {
    id: 'rf',
    label: 'Other radio channels',
    question: 'Is there a documented radio interface beyond BLE?',
    capture:
      'Record exact radio/chip identity, measured band, receiver settings, and a receive-only capture from your owned device.',
    limit: 'No radio transmitter, band guessing, or cross-device command transplant is included.',
  },
  {
    id: 'rehosting',
    label: 'Offline firmware models',
    question: 'Can a synthetic model reproduce one documented input/output relationship?',
    capture:
      'Describe public specifications and synthetic fixtures separately from real hardware observations.',
    limit:
      'No firmware extraction, flashing, executable import, or authentication claim. Model output stays synthetic.',
  },
  {
    id: 'peripheral',
    label: 'Peripheral & sensor discovery',
    question: 'Which input or peripheral correlates with a repeatable event?',
    capture:
      'Inventory exact parts and documented interfaces, change one normal input at a time, and preserve a baseline.',
    limit:
      'Sensor semantics and physical limits need independent evidence before any control adapter.',
  },
];

const formats = ['bytes', 'pulses', 'audio'];
const evidence = ['synthetic', 'owner-observed', 'community-reported'];
function bounded(value, max, label, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw new Error(label + ' is missing or too long.');
  return value.trim();
}
function valuesOK(values, format) {
  const max = format === 'bytes' ? 4096 : 2048;
  if (
    !Array.isArray(values) ||
    !values.length ||
    values.length > max ||
    values.some(
      (v) =>
        !Number.isSafeInteger(v) ||
        v < (format === 'bytes' ? 0 : 1) ||
        v > (format === 'bytes' ? 255 : 10000000),
    )
  )
    throw new Error('Invalid ' + format + ' values or capture limit exceeded.');
  return [...values];
}
export function parseCapture(text, format) {
  if (typeof text !== 'string' || text.length > 32768)
    throw new Error('Capture text limit is 32,768 characters.');
  if (format === 'bytes') {
    const groups = text
      .trim()
      .split(/[\s,:-]+/)
      .map((group) => group.replace(/^0x/i, ''));
    if (groups.some((group) => !/^(?:[0-9a-f]{2})+$/i.test(group)))
      throw new Error(
        'Enter complete hex byte pairs, separated by spaces, commas, colons, or dashes.',
      );
    const compact = groups.join('');
    return valuesOK(
      compact.match(/../g).map((pair) => parseInt(pair, 16)),
      format,
    );
  }
  if (format === 'pulses') {
    const tokens = text.trim().split(/[\s,]+/);
    if (tokens.some((t) => !/^\d+$/.test(t)))
      throw new Error('Pulse timings must be positive integer microseconds.');
    return valuesOK(tokens.map(Number), format);
  }
  throw new Error('Choose bytes or pulse timings.');
}
export function summarizeCapture(values, format) {
  const clean = valuesOK(values, format);
  return format === 'bytes'
    ? { count: clean.length, unique: new Set(clean).size }
    : {
        count: clean.length,
        totalUs: clean.reduce((sum, v) => sum + v, 0),
        minUs: Math.min(...clean),
        maxUs: Math.max(...clean),
      };
}
function audioSummary(input) {
  const keys = [
    'sampleRate',
    'channels',
    'frames',
    'duration',
    'rms',
    'peak',
    'clipped',
    'dominantHz',
    'binHz',
  ];
  if (!input || keys.some((k) => !Number.isFinite(input[k])))
    throw new Error('Invalid audio summary.');
  const s = Object.fromEntries(keys.map((k) => [k, input[k]]));
  if (
    !Number.isInteger(s.sampleRate) ||
    s.sampleRate < 8000 ||
    s.sampleRate > 192000 ||
    ![1, 2].includes(s.channels) ||
    !Number.isInteger(s.frames) ||
    s.frames < 1 ||
    s.duration <= 0 ||
    s.duration > 30 ||
    Math.abs(s.duration - s.frames / s.sampleRate) > 1e-9 ||
    s.rms < 0 ||
    s.rms > 1 ||
    s.peak < s.rms ||
    s.peak > 1 ||
    !Number.isInteger(s.clipped) ||
    s.clipped < 0 ||
    s.clipped > s.frames ||
    s.dominantHz < 0 ||
    s.dominantHz > s.sampleRate / 2 ||
    s.binHz <= 0 ||
    s.binHz > s.sampleRate
  )
    throw new Error('Audio summary exceeds supported bounds.');
  return s;
}
function captureSummary(input, format) {
  const keys = format === 'bytes' ? ['count', 'unique'] : ['count', 'totalUs', 'minUs', 'maxUs'];
  if (!input || keys.some((k) => !Number.isSafeInteger(input[k]) || input[k] < 1))
    throw new Error('Invalid capture summary.');
  const s = Object.fromEntries(keys.map((k) => [k, input[k]]));
  if (
    s.count > (format === 'bytes' ? 4096 : 2048) ||
    (format === 'bytes' && (s.unique > 256 || s.unique > s.count)) ||
    (format === 'pulses' &&
      (s.minUs > s.maxUs ||
        s.maxUs > 10000000 ||
        s.totalUs < s.minUs * s.count ||
        s.totalUs > s.maxUs * s.count))
  )
    throw new Error('Capture summary exceeds supported bounds.');
  return s;
}
export function validateDiscovery(input) {
  if (!input || input.format !== 'sasori.discovery' || input.schemaVersion !== 1)
    throw new Error('Unsupported discovery format/version.');
  if (typeof input.id !== 'string' || !/^discovery-[a-zA-Z0-9_-]{1,36}$/.test(input.id))
    throw new Error('Invalid discovery identifier.');
  if (
    !METHODS.some((m) => m.id === input.method) ||
    !formats.includes(input.kind) ||
    !evidence.includes(input.evidence)
  )
    throw new Error('Missing discovery method, capture kind, or evidence class.');
  if (
    typeof input.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(input.createdAt)) ||
    (input.importedAt !== null &&
      (typeof input.importedAt !== 'string' || !Number.isFinite(Date.parse(input.importedAt))))
  )
    throw new Error('Invalid discovery dates.');
  if (
    typeof input.payloadsIncluded !== 'boolean' ||
    (input.kind === 'audio' && input.payloadsIncluded) ||
    (!input.payloadsIncluded && input.values !== null)
  )
    throw new Error('Invalid discovery payload policy.');
  const values = input.payloadsIncluded ? valuesOK(input.values, input.kind) : null;
  const summary =
    input.kind === 'audio'
      ? audioSummary(input.summary)
      : captureSummary(input.summary, input.kind);
  if (values && JSON.stringify(summary) !== JSON.stringify(summarizeCapture(values, input.kind)))
    throw new Error('Capture summary does not match its values.');
  return {
    format: 'sasori.discovery',
    schemaVersion: 1,
    id: input.id,
    label: bounded(input.label, 120, 'Capture label'),
    deviceModel: bounded(input.deviceModel, 160, 'Exact device model / revision'),
    sourceNote: bounded(input.sourceNote, 2000, 'Source note'),
    method: input.method,
    kind: input.kind,
    evidence: input.evidence,
    createdAt: input.createdAt,
    importedAt: input.importedAt,
    payloadsIncluded: input.payloadsIncluded,
    values,
    summary,
  };
}
export function createDiscovery(fields) {
  return validateDiscovery({
    ...fields,
    format: 'sasori.discovery',
    schemaVersion: 1,
    id: 'discovery-' + recordId(),
    createdAt: new Date().toISOString(),
    importedAt: null,
  });
}
export function discoveryBackup(records) {
  return {
    format: 'sasori.discoveries',
    schemaVersion: 1,
    payloadPolicy: 'metadata-only',
    records: records.map((record) => {
      const r = validateDiscovery(record);
      return {
        ...r,
        label: sanitizeText(r.label).slice(0, 120),
        deviceModel: sanitizeText(r.deviceModel).slice(0, 160),
        sourceNote: sanitizeText(r.sourceNote).slice(0, 2000),
        payloadsIncluded: false,
        values: null,
      };
    }),
  };
}
export function parseDiscoveries(text) {
  if (new TextEncoder().encode(text).byteLength > MAX_DISCOVERY_FILE_BYTES)
    throw new Error('Discovery import limit is 1 MB.');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Discovery JSON is not valid.');
  }
  if (
    data?.format !== 'sasori.discoveries' ||
    data.schemaVersion !== 1 ||
    !Array.isArray(data.records) ||
    data.records.length < 1 ||
    data.records.length > MAX_DISCOVERIES
  )
    throw new Error('Choose a discovery backup with 1–50 captures.');
  return data.records.map((record) => ({
    ...validateDiscovery(record),
    id: 'discovery-' + recordId(),
    importedAt: new Date().toISOString(),
  }));
}
export function compareCaptures(first, second, toleranceUs = 100) {
  const a = validateDiscovery(first),
    b = validateDiscovery(second);
  if (!a.values || !b.values || a.kind === 'audio' || b.kind === 'audio')
    throw new Error('Comparison needs retained byte or pulse values in both captures.');
  if (
    a.kind !== b.kind ||
    a.method !== b.method ||
    a.deviceModel.toLowerCase().replace(/\s+/g, ' ') !==
      b.deviceModel.toLowerCase().replace(/\s+/g, ' ')
  )
    throw new Error('Compare the same exact device model, method, and capture kind.');
  if (!Number.isSafeInteger(toleranceUs) || toleranceUs < 0 || toleranceUs > 1000000)
    throw new Error('Pulse tolerance must be 0–1,000,000 integer microseconds.');
  const differences = [];
  let changed = 0,
    added = 0,
    removed = 0;
  for (let i = 0; i < Math.max(a.values.length, b.values.length); i++) {
    const av = a.values[i],
      bv = b.values[i];
    const status =
      av === undefined
        ? 'added'
        : bv === undefined
          ? 'removed'
          : Math.abs(av - bv) > (a.kind === 'pulses' ? toleranceUs : 0)
            ? 'changed'
            : null;
    if (!status) continue;
    if (status === 'added') added++;
    else if (status === 'removed') removed++;
    else changed++;
    if (differences.length < 64)
      differences.push({ offset: i, first: av ?? null, second: bv ?? null, status });
  }
  return { kind: a.kind, changed, added, removed, total: changed + added + removed, differences };
}

// Local RIFF/WAVE PCM16 inspection only. No audio playback or browser permissions.
export function inspectWav(buffer) {
  if (
    !(buffer instanceof ArrayBuffer) ||
    buffer.byteLength < 44 ||
    buffer.byteLength > MAX_WAV_BYTES
  )
    throw new Error('Choose a PCM16 WAV file between 44 bytes and 10 MB.');
  const view = new DataView(buffer);
  const tag = (offset) => String.fromCharCode(...new Uint8Array(buffer, offset, 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || view.getUint32(4, true) + 8 !== buffer.byteLength)
    throw new Error('Invalid or truncated RIFF/WAVE container.');
  let format = null,
    data = null;
  for (let offset = 12; offset + 8 <= buffer.byteLength;) {
    const name = tag(offset),
      size = view.getUint32(offset + 4, true),
      start = offset + 8;
    if (start + size > buffer.byteLength) throw new Error('Truncated WAV chunk.');
    if (name === 'fmt ') {
      if (format || size < 16) throw new Error('Invalid or duplicate WAV format.');
      format = {
        encoding: view.getUint16(start, true),
        channels: view.getUint16(start + 2, true),
        sampleRate: view.getUint32(start + 4, true),
        byteRate: view.getUint32(start + 8, true),
        align: view.getUint16(start + 12, true),
        bits: view.getUint16(start + 14, true),
      };
    } else if (name === 'data') {
      if (data) throw new Error('Multiple WAV data chunks are unsupported.');
      data = { start, size };
    }
    offset = start + size + (size % 2);
    if (offset > buffer.byteLength) throw new Error('Missing WAV chunk padding.');
    if (offset < buffer.byteLength && offset + 8 > buffer.byteLength)
      throw new Error('Invalid trailing WAV bytes.');
  }
  if (
    !format ||
    !data ||
    format.encoding !== 1 ||
    format.bits !== 16 ||
    ![1, 2].includes(format.channels) ||
    format.sampleRate < 8000 ||
    format.sampleRate > 192000 ||
    format.align !== format.channels * 2 ||
    format.byteRate !== format.sampleRate * format.align ||
    !data.size ||
    data.size % format.align
  )
    throw new Error('Only uncompressed PCM16 mono/stereo WAV at 8–192 kHz is supported.');
  const frames = data.size / format.align,
    duration = frames / format.sampleRate;
  if (duration > 30) throw new Error('WAV inspection is limited to 30 seconds.');
  const samples = new Float32Array(frames);
  let squares = 0,
    peak = 0,
    clipped = 0;
  for (let i = 0; i < frames; i++) {
    const value = view.getInt16(data.start + i * format.align, true);
    samples[i] = value / 32768;
    squares += samples[i] * samples[i];
    peak = Math.max(peak, Math.abs(samples[i]));
    if (value === -32768 || value === 32767) clipped++;
  }
  const waveform = Array.from({ length: Math.min(256, frames) }, (_, bin) => {
    const start = Math.floor((bin * frames) / Math.min(256, frames));
    const end = Math.floor(((bin + 1) * frames) / Math.min(256, frames));
    let min = 1,
      max = -1;
    for (let i = start; i < end; i++) {
      min = Math.min(min, samples[i]);
      max = Math.max(max, samples[i]);
    }
    return { min, max };
  });
  const size = 2048,
    spectrum = new Float64Array(size / 2 + 1);
  // Average up to eight Hann-windowed FFT power spectra across the entire file.
  const windows = Math.min(8, Math.max(1, Math.ceil(frames / size)));
  for (let window = 0; window < windows; window++) {
    const real = new Float64Array(size),
      imaginary = new Float64Array(size);
    const start =
      windows === 1 ? 0 : Math.floor((window * Math.max(0, frames - size)) / (windows - 1));
    for (let i = 0; i < size; i++)
      real[i] = (samples[start + i] || 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1)));
    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) [real[i], real[j]] = [real[j], real[i]];
    }
    for (let length = 2; length <= size; length *= 2) {
      for (let start = 0; start < size; start += length) {
        for (let k = 0; k < length / 2; k++) {
          const angle = (-2 * Math.PI * k) / length,
            a = start + k,
            b = a + length / 2;
          const re = real[b] * Math.cos(angle) - imaginary[b] * Math.sin(angle);
          const im = real[b] * Math.sin(angle) + imaginary[b] * Math.cos(angle);
          real[b] = real[a] - re;
          imaginary[b] = imaginary[a] - im;
          real[a] += re;
          imaginary[a] += im;
        }
      }
    }
    for (let i = 1; i < spectrum.length; i++)
      spectrum[i] += (real[i] ** 2 + imaginary[i] ** 2) / windows;
  }
  let strongest = 1;
  for (let i = 2; i < spectrum.length; i++) if (spectrum[i] > spectrum[strongest]) strongest = i;
  const rms = Math.sqrt(squares / frames);
  const summary = audioSummary({
    sampleRate: format.sampleRate,
    channels: format.channels,
    frames,
    duration,
    rms,
    peak,
    clipped,
    dominantHz: spectrum[strongest] > 1e-10 ? (strongest * format.sampleRate) / size : 0,
    binHz: format.sampleRate / size,
  });
  const maxPower = Math.max(...spectrum, 1e-20);
  return {
    summary,
    waveform,
    spectrum: Array.from(spectrum, (power) =>
      Math.max(-80, 10 * Math.log10(Math.max(power, 1e-28) / maxPower)),
    ),
  };
}
