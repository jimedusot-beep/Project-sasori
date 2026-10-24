// Original implementation of protocol facts recorded in recovered-source.md.
// MD5 arithmetic follows RFC 1321; no upstream implementation or app code is bundled.
export const ELMO_SERVICE = 'dab91435-b5a1-e29c-b041-bcd562613bdf';
export const ELMO_RX = 'dab91382-b5a1-e29c-b041-bcd562613bdf';
export const ELMO_TX = 'dab91383-b5a1-e29c-b041-bcd562613bdf';
export const ELMO_INPUTS = Object.freeze([
  'left_hand',
  'right_hand',
  'belly',
  'clap',
  'left_hand_belly',
  'right_hand_belly',
  'nose',
]);
const shifts = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
const constants = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32),
);

export function md5Bytes(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 1024)
    throw new Error('MD5 input exceeds the codec budget.');
  const padded = new Uint8Array((Math.floor((bytes.length + 8) / 64) + 1) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bytes.length * 8, true);
  const state = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let offset = 0; offset < padded.length; offset += 64) {
    let [a, b, c, d] = state;
    for (let i = 0; i < 64; i++) {
      const round = i >> 4;
      const f =
        round === 0
          ? (b & c) | (~b & d)
          : round === 1
            ? (b & d) | (c & ~d)
            : round === 2
              ? b ^ c ^ d
              : c ^ (b | ~d);
      const word =
        round === 0
          ? i
          : round === 1
            ? (5 * i + 1) % 16
            : round === 2
              ? (3 * i + 5) % 16
              : (7 * i) % 16;
      const sum = (a + f + constants[i] + view.getUint32(offset + word * 4, true)) | 0;
      const shift = shifts[round * 4 + (i % 4)];
      const next = (b + ((sum << shift) | (sum >>> (32 - shift)))) | 0;
      a = d;
      d = c;
      c = b;
      b = next;
    }
    for (const [index, value] of [a, b, c, d].entries()) state[index] = (state[index] + value) | 0;
  }
  const digest = new Uint8Array(16),
    output = new DataView(digest.buffer);
  state.forEach((value, i) => output.setUint32(i * 4, value >>> 0, true));
  padded.fill(0);
  state.fill(0);
  return digest;
}

export function elmoPasswordDigest(password) {
  if (typeof password !== 'string' || password.length < 4 || password.length > 128)
    throw new Error('Enter the existing Elmo password (4–128 characters).');
  // The app uses the low byte of every UTF-16 code unit, including surrogate pairs.
  const bytes = Uint8Array.from(
    { length: password.length },
    (_, i) => password.charCodeAt(i) & 255,
  );
  try {
    return md5Bytes(bytes);
  } finally {
    bytes.fill(0);
  }
}

export function elmoFletcher32(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.length > 1024 || bytes.length % 2)
    throw new Error('Complete little-endian words are required.');
  let first = 0xffff,
    second = 0xffff;
  const words = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let start = 0; start < bytes.length; start += 718) {
    for (let i = start; i < Math.min(start + 718, bytes.length); i += 2) {
      first += words.getUint16(i, true);
      second += first;
    }
    first = (first & 0xffff) + (first >>> 16);
    second = (second & 0xffff) + (second >>> 16);
  }
  first = (first & 0xffff) + (first >>> 16);
  second = (second & 0xffff) + (second >>> 16);
  return ((second << 16) | first) >>> 0;
}

export function elmoResponse(digest, challenge) {
  if (
    !(digest instanceof Uint8Array) ||
    digest.length !== 16 ||
    !(challenge instanceof Uint8Array) ||
    challenge.length < 2 ||
    challenge.length > 18 ||
    challenge.length % 2
  )
    throw new Error('Unsupported Elmo challenge.');
  const joined = new Uint8Array(16 + challenge.length);
  joined.set(digest);
  joined.set(challenge, 16);
  const response = new Uint8Array(5);
  response[0] = 0x41;
  new DataView(response.buffer).setUint32(1, elmoFletcher32(joined), true);
  joined.fill(0);
  return response;
}

export function elmoPasswordSetup(digest) {
  if (!(digest instanceof Uint8Array) || digest.length !== 16)
    throw new Error('An Elmo password digest is required.');
  const packet = new Uint8Array(17);
  packet[0] = 0x40;
  packet.set(digest, 1);
  return packet;
}

export function elmoCommand(intent) {
  const commands = { volume: [0x22], inputs: [0x20], hello: [0x10, 9, 0] };
  if (!Object.hasOwn(commands, intent)) throw new Error('Unsupported Elmo action.');
  return Uint8Array.from(commands[intent]);
}

export function decodeElmo(value) {
  if (!(value instanceof DataView) || !value.byteLength || value.byteLength > 20) return null;
  const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (bytes[0] === 0x41 && bytes.length >= 3 && bytes.length <= 19 && bytes.length % 2 === 1)
    return { kind: 'challenge', value: bytes.slice(1) };
  if (bytes[0] === 0x40 && bytes.length === 2 && bytes[1] <= 2)
    return { kind: 'password', value: bytes[1] };
  if (bytes[0] === 0x22 && bytes.length === 2 && bytes[1] >= 1 && bytes[1] <= 15)
    return { kind: 'volume', value: bytes[1] };
  if (bytes[0] === 0x20 && bytes.length === 2)
    return {
      kind: 'inputs',
      value: Object.fromEntries(ELMO_INPUTS.map((name, i) => [name, !!(bytes[1] & (1 << i))])),
    };
  return null;
}
