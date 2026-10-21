export const MAX_PACKET_BYTES = 1024;
/** Decode one notification. Notification boundaries are NOT assumed to be protocol frames.
 * @param {unknown} value
 * @param {string} [characteristic]
 * @param {string} [timestamp]
 * @returns {import('./types.js').Packet}
 */
export function decodePacket(
  value,
  characteristic = 'unknown',
  timestamp = new Date().toISOString(),
) {
  let bytes;
  let malformed = false;
  try {
    if (value instanceof ArrayBuffer) bytes = new Uint8Array(value);
    else if (ArrayBuffer.isView(value))
      bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    else throw new Error('Invalid notification value');
  } catch {
    bytes = new Uint8Array();
    malformed = true;
  }
  const length = bytes.byteLength;
  const limited = bytes.slice(0, MAX_PACKET_BYTES);
  const truncated = length > MAX_PACKET_BYTES;
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(limited);
  } catch {
    malformed = true;
    text = '[non-UTF-8 data]';
  }
  // Control bytes are intentionally scrubbed from the display, while hex remains unchanged.
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '·');
  let kind = 'unknown';
  let description = 'Unknown payload; framing and semantics are not established.';
  const observedText = text.replace(/^[\u0060\u0061](?=(?:NewModeIdx:|Start:))/, '');
  if (!malformed && !truncated && /^NewModeIdx:\d{1,5}\s*$/.test(observedText)) {
    kind = 'mode-observation';
    description = 'Mode index text seen in historical V4 evidence; index meaning unverified.';
  } else if (!malformed && !truncated && /^Start:LowPowerSleep\s*$/.test(observedText)) {
    kind = 'sleep-observation';
    description =
      'Sleep-related text seen in historical V4 evidence; no authentication implication.';
  }
  return {
    timestamp,
    characteristic,
    length,
    hex: Array.from(limited, (b) => b.toString(16).padStart(2, '0')).join(' '),
    text,
    kind,
    description,
    truncated,
    malformed,
  };
}
/** @param {Array<{kind: string, length: number}>} packets */
export function summarizePackets(packets) {
  return {
    packets: packets.length,
    bytes: packets.reduce((sum, p) => sum + p.length, 0),
    known: packets.filter((p) => p.kind !== 'unknown').length,
  };
}
