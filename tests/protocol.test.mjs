import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePacket, summarizePackets, MAX_PACKET_BYTES } from '../site/lib/protocol.js';
const encode = (text) => new TextEncoder().encode(text);
test('known historical strings are descriptions, not authentication proof', () => {
  const mode = decodePacket(encode('NewModeIdx:12')),
    sleep = decodePacket(encode('Start:LowPowerSleep'));
  assert.equal(mode.kind, 'mode-observation');
  assert.match(mode.description, /unverified/);
  assert.equal(sleep.kind, 'sleep-observation');
  assert.match(sleep.description, /no authentication/);
});
test('partial and joined messages remain unknown; no guessed framing', () => {
  for (const message of ['NewMode', 'Idx:12', 'NewModeIdx:12Start:LowPowerSleep', 'NewModeIdx:abc'])
    assert.equal(decodePacket(encode(message)).kind, 'unknown');
});
test('hex preserves bytes while display scrubs control characters', () => {
  const p = decodePacket(new Uint8Array([0, 65, 10]));
  assert.equal(p.hex, '00 41 0a');
  assert.equal(p.text, '·A\n');
});
test('binary, empty and malformed notification values cannot crash decoding', () => {
  for (const value of [null, {}, undefined, 'bad', new Uint8Array([255, 254])])
    assert.equal(decodePacket(value).malformed, true);
  assert.equal(decodePacket(new ArrayBuffer(0)).length, 0);
});
test('oversized packets report full length but cap retained bytes', () => {
  const p = decodePacket(new Uint8Array(5000));
  assert.equal(p.length, 5000);
  assert.equal(p.truncated, true);
  assert.equal(p.hex.split(' ').length, MAX_PACKET_BYTES);
});
test('subarray and DataView offsets are respected', () => {
  const buf = new Uint8Array([9, 65, 66, 8]);
  assert.equal(decodePacket(new DataView(buf.buffer, 1, 2)).text, 'AB');
});
test('UTF-8 is decoded without silently accepting invalid sequences', () => {
  assert.equal(decodePacket(encode('你好')).text, '你好');
  assert.equal(decodePacket(new Uint8Array([195])).malformed, true);
});
test('packet summary counts observed bytes and recognized patterns', () => {
  assert.deepEqual(
    summarizePackets([decodePacket(encode('NewModeIdx:12')), decodePacket(new Uint8Array([255]))]),
    { packets: 2, bytes: 14, known: 1 },
  );
});

test('historical raw V4 notifications recognize text with unknown prefix', () => {
  const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));
  assert.equal(decodePacket(fromHex('604e65774d6f64654964783a313200')).kind, 'mode-observation');
  assert.equal(
    decodePacket(fromHex('6153746172743a4c6f77506f776572536c656570')).kind,
    'sleep-observation',
  );
  assert.equal(decodePacket(fromHex('6100')).kind, 'unknown');
});
