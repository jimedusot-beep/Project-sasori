// Offline observation helpers. These functions NEVER write to Bluetooth.
// Packet header meanings are unknown; message classifications refer only to observed text.
/** @param {string} input */
export function parseHex(input) {
  if (typeof input !== 'string') throw new TypeError('Expected a hex string');
  const hex = input.replace(/0x/gi, '').replace(/[\s,:-]/g, '');
  if (!hex || hex.length % 2 || hex.length > 8192 || !/^[0-9a-f]+$/i.test(hex)) {
    throw new Error('Enter valid, even-length hex (up to 4096 bytes)');
  }
  return Uint8Array.from(hex.match(/.{2}/g) || [], (pair) => parseInt(pair, 16));
}
/** @param {Iterable<number>} bytes */
export function hexOf(bytes) {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}
/** @param {string | ArrayLike<number>} input */
export function analyzeElmoNotification(input) {
  const bytes = typeof input === 'string' ? parseHex(input) : Uint8Array.from(input);
  if (!bytes.length) throw new Error('Empty notification');
  if (bytes.length > 4096)
    throw new Error('Notification exceeds the 4096-byte offline analysis limit');
  // Offset 1 is a candidate view for the observed 0x60/0x61 examples, not general framing.
  const textOffset = [0x60, 0x61].includes(bytes[0]) ? 1 : 0;
  let malformed = false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(textOffset));
  } catch {
    malformed = true;
  }
  const body = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.slice(textOffset))
    .replace(/\0+$/, '');
  let observation = 'Unclassified notification; header byte semantics unknown';
  let extracted = null;
  const mode = /^NewModeIdx:(\d{1,5})$/.exec(body);
  const started = /^Start:([A-Za-z0-9_-]{1,60})$/.exec(body);
  if (mode && !malformed) {
    observation = 'Matches observed NewModeIdx textual pattern (meaning unverified)';
    extracted = { label: 'NewModeIdx', textValue: mode[1] };
  } else if (started && !malformed) {
    observation = 'Matches observed Start textual pattern (meaning unverified)';
    extracted = { label: 'Start', textValue: started[1] };
  }
  return {
    hex: hexOf(bytes),
    bytes: bytes.length,
    firstByte: '0x' + bytes[0].toString(16).padStart(2, '0'),
    textOffset,
    malformed,
    bodyText: body,
    observation,
    extracted,
    verifiedCommand: false,
  };
}
