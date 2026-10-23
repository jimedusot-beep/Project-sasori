import { sanitizeText } from './diagnostics.js';

export const MAX_TRACE_FILE_BYTES = 512 * 1024;
export const MAX_TRACE_RAW_BYTES = 40 * 1024;
export const MAX_TRACE_FRAMES = 256;
export const MAX_TRACE_MARKERS = 100;
const transports = ['ble', 'serial', 'audio', 'infrared', 'other'];
const evidence = ['synthetic', 'owner-observed', 'community-reported'];
const text = (value, max, name) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new Error('Invalid trace ' + name + '.');
  return value.trim();
};
const time = (value) => {
  if (!Number.isFinite(value) || value < 0 || value > 86400000)
    throw new Error('Trace time must be 0–86,400,000 milliseconds.');
  return value;
};
export function normalizeTraceHex(value) {
  if (typeof value === 'string') value = value.trim();
  if (typeof value !== 'string' || value.length > 3072 || !/^(?:[a-f0-9]{2}\s*)*$/i.test(value))
    throw new Error('Trace hex must contain complete byte pairs.');
  const bytes = value.replace(/\s/g, '').toLowerCase().match(/../g) || [];
  if (bytes.length > 1024) throw new Error('Trace frame limit is 1,024 bytes.');
  return bytes.join(' ');
}
export function validateTrace(input) {
  if (!input || input.format !== 'sasori.trace' || input.schemaVersion !== 1)
    throw new Error('Choose a Sasori trace v1 or normalized CSV file.');
  if (!transports.includes(input.transport) || !evidence.includes(input.evidence))
    throw new Error('Invalid trace transport or evidence class.');
  if (typeof input.payloadsIncluded !== 'boolean') throw new Error('Missing trace payload policy.');
  if (
    !Array.isArray(input.frames) ||
    !input.frames.length ||
    input.frames.length > MAX_TRACE_FRAMES
  )
    throw new Error('A trace needs 1–256 frames.');
  let rawBytes = 0,
    previous = -1;
  const frames = input.frames.map((frame) => {
    if (!frame || !['tx', 'rx'].includes(frame.direction))
      throw new Error('Invalid frame direction.');
    const tMs = time(frame.tMs);
    if (tMs < previous) throw new Error('Trace frames must be in time order.');
    previous = tMs;
    const endpoint = text(frame.endpoint, 128, 'endpoint');
    if (!/^[a-zA-Z0-9_.:-]+$/.test(endpoint))
      throw new Error('Use a UUID, handle:0x0012, or simple endpoint name.');
    let hex;
    if (frame.hex !== undefined) {
      if (!input.payloadsIncluded)
        throw new Error('Raw frames require an explicit payload policy.');
      hex = normalizeTraceHex(frame.hex);
      rawBytes += hex ? hex.split(' ').length : 0;
    }
    const length =
      frame.length ?? (hex === undefined ? undefined : hex ? hex.split(' ').length : 0);
    if (
      !Number.isSafeInteger(length) ||
      length < 0 ||
      length > 1024 ||
      (hex !== undefined && length !== (hex ? hex.split(' ').length : 0))
    )
      throw new Error('Frame length does not match its retained bytes.');
    return {
      tMs,
      direction: frame.direction,
      endpoint,
      length,
      ...(hex === undefined ? {} : { hex }),
    };
  });
  if (rawBytes > MAX_TRACE_RAW_BYTES)
    throw new Error('Trace raw-byte budget is 40 KiB. Split the capture.');
  if (!Array.isArray(input.markers) || input.markers.length > MAX_TRACE_MARKERS)
    throw new Error('Trace marker limit is 100.');
  const markers = input.markers
    .map((m) => ({ tMs: time(m?.tMs), label: text(m?.label, 120, 'marker') }))
    .sort((a, b) => a.tMs - b.tMs);
  return {
    format: 'sasori.trace',
    schemaVersion: 1,
    label: text(input.label, 120, 'label'),
    model: text(input.model, 160, 'model'),
    firmware: text(input.firmware, 60, 'firmware'),
    sourceNote: text(input.sourceNote, 2000, 'source note'),
    transport: input.transport,
    evidence: input.evidence,
    payloadsIncluded: input.payloadsIncluded,
    frames,
    markers,
  };
}
// Small RFC4180 reader: quoting, escaped quotes, CRLF, and commas inside quoted fields.
// No CSV value is interpreted as an expression or sent to a device.
function csvRows(input) {
  const rows = [],
    row = [];
  let field = '',
    quoted = false,
    closed = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quoted) {
      if (c === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
        closed = true;
      } else field += c;
    } else if (c === '"') {
      if (field || closed) throw new Error('Invalid CSV quoting.');
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field);
      field = '';
      closed = false;
      if (c !== ',') {
        if (c === '\r' && input[i + 1] === '\n') i++;
        rows.push([...row]);
        row.length = 0;
        if (rows.length > MAX_TRACE_FRAMES + 1) throw new Error('CSV frame limit is 256.');
      }
    } else {
      if (closed) throw new Error('Unexpected text after a quoted CSV field.');
      field += c;
    }
  }
  if (quoted) throw new Error('Unterminated CSV quote.');
  if (field || row.length || closed) {
    row.push(field);
    rows.push([...row]);
  }
  return rows;
}
export function parseTrace(input, fields = {}) {
  if (
    typeof input !== 'string' ||
    new TextEncoder().encode(input).byteLength > MAX_TRACE_FILE_BYTES
  )
    throw new Error('Trace import limit is 512 KiB.');
  const value = input.replace(/^\uFEFF/, '').trim();
  if (value.startsWith('{')) {
    let data;
    try {
      data = JSON.parse(value);
    } catch {
      throw new Error('Invalid trace JSON.');
    }
    return validateTrace(data.format === 'sasori.session' ? data.protocolTrace : data);
  }
  const [header, ...rows] = csvRows(value);
  if (!header || header.join(',') !== 'time_ms,direction,endpoint,hex')
    throw new Error(
      'CSV header must be time_ms,direction,endpoint,hex. Binary btsnoop/PCAP files need offline ATT extraction first.',
    );
  const frames = rows.map((r) => {
    if (r.length !== 4 || !/^\d+(?:\.\d+)?$/.test(r[0])) throw new Error('Invalid CSV frame.');
    return { tMs: Number(r[0]), direction: r[1].toLowerCase(), endpoint: r[2], hex: r[3] };
  });
  return validateTrace({
    ...fields,
    format: 'sasori.trace',
    schemaVersion: 1,
    payloadsIncluded: true,
    frames,
    markers: [],
  });
}
export function portableTrace(input, includePayloads = false) {
  const trace = validateTrace(input);
  return validateTrace({
    ...trace,
    label: sanitizeText(trace.label).slice(0, 120),
    model: sanitizeText(trace.model).slice(0, 160),
    firmware: sanitizeText(trace.firmware).slice(0, 60),
    sourceNote: sanitizeText(trace.sourceNote).slice(0, 2000),
    payloadsIncluded: !!includePayloads,
    frames: trace.frames.map(({ hex, ...frame }) =>
      includePayloads && hex !== undefined ? { ...frame, hex } : frame,
    ),
    markers: trace.markers.map((m) => ({ ...m, label: sanitizeText(m.label).slice(0, 120) })),
  });
}
export function markTrace(input, tMs, label) {
  const trace = validateTrace(input);
  return validateTrace({ ...trace, markers: [...trace.markers, { tMs, label }] });
}
export function traceSummary(input) {
  const trace = validateTrace(input);
  return {
    frames: trace.frames.length,
    tx: trace.frames.filter((f) => f.direction === 'tx').length,
    rx: trace.frames.filter((f) => f.direction === 'rx').length,
    bytes: trace.frames.reduce((n, f) => n + f.length, 0),
    durationMs: trace.frames.at(-1).tMs - trace.frames[0].tMs,
    endpoints: [...new Set(trace.frames.map((f) => f.endpoint))],
    retainedBytes: trace.frames.reduce((n, f) => n + (f.hex === undefined ? 0 : f.length), 0),
  };
}
export function compareTraces(first, second) {
  const a = validateTrace(first),
    b = validateTrace(second);
  if (a.model !== b.model || a.firmware !== b.firmware || a.transport !== b.transport)
    throw new Error('Compare the same declared model, firmware, and transport.');
  if ([...a.frames, ...b.frames].some((f) => f.hex === undefined))
    throw new Error('Byte comparison needs retained payloads in both traces.');
  return Array.from({ length: Math.max(a.frames.length, b.frames.length) }, (_, i) => {
    const x = a.frames[i],
      y = b.frames[i];
    if (!x || !y) return { index: i, kind: x ? 'removed' : 'added' };
    const xx = x.hex ? x.hex.split(' ') : [],
      yy = y.hex ? y.hex.split(' ') : [];
    const changed = Array.from({ length: Math.max(xx.length, yy.length) }, (_, j) => j).filter(
      (j) => xx[j] !== yy[j],
    );
    return {
      index: i,
      kind:
        changed.length || x.direction !== y.direction || x.endpoint !== y.endpoint
          ? 'changed'
          : 'same',
      timeDeltaMs: y.tMs - x.tMs,
      changedByteOffsets: changed,
      routeChanged: x.direction !== y.direction || x.endpoint !== y.endpoint,
    };
  });
}
export function selectedInterval(input, txIndex, rxIndex) {
  const trace = validateTrace(input),
    tx = trace.frames[txIndex],
    rx = trace.frames[rxIndex];
  if (!tx || !rx || tx.direction !== 'tx' || rx.direction !== 'rx' || rx.tMs < tx.tMs)
    throw new Error('Choose a TX frame followed by an RX frame.');
  return {
    elapsedMs: rx.tMs - tx.tMs,
    verdict: 'User-selected interval; not a verified acknowledgment.',
  };
}
