import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHex, hexOf, analyzeElmoNotification } from '../site/elmo-packets.mjs';
test('hex parser accepts spaced case-insensitive bytes', () =>
  assert.equal(hexOf(parseHex('0x60 0x4E 00')), '604e00'));
test('rejects malformed, odd-length and empty values', () => {
  for (const s of ['', 'a', 'zz', '0x', '12 3']) assert.throws(() => parseHex(s));
});
test('rejects oversized input', () => assert.throws(() => parseHex('aa'.repeat(4097))));
test('mode message is classified only as observed pattern', () => {
  const result = analyzeElmoNotification('604e65774d6f64654964783a313200');
  assert.equal(result.firstByte, '0x60');
  assert.equal(result.bodyText, 'NewModeIdx:12');
  assert.equal(result.extracted.textValue, '12');
  assert.equal(result.verifiedCommand, false);
});
test('low power text is not mislabeled as a validated mode', () => {
  const result = analyzeElmoNotification('6153746172743a4c6f77506f776572536c656570');
  assert.equal(result.bodyText, 'Start:LowPowerSleep');
  assert.match(result.observation, /meaning unverified/);
});
test('unknown short message remains unclassified', () => {
  const result = analyzeElmoNotification('6100');
  assert.equal(result.bodyText, '');
  assert.equal(result.extracted, null);
});
test('does not interpret input as an authenticated command', () => {
  const result = analyzeElmoNotification('414243');
  assert.equal(result.verifiedCommand, false);
});
