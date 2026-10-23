import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { CAPABILITIES, validateCommand, virtualPosition } from '../site/lib/safety.js';
import { normalizeUUID, ELMO_SERVICE } from '../site/lib/profiles.js';
test('every current physical capability is blocked regardless of consent', () => {
  for (const capability of CAPABILITIES) {
    assert.equal(capability.verified, false);
    assert.throws(() => validateCommand(capability.id, { consent: true }), /unavailable/);
    assert.throws(() => validateCommand(capability.id, { simulation: true }), /explicit/);
    assert.equal(
      validateCommand(capability.id, { simulation: true, consent: true }).hardwareTraffic,
      false,
    );
  }
  assert.throws(() => validateCommand('firmware', { simulation: true, consent: true }), /Unknown/);
});
test('virtual positions reject non-finite values and cannot define hardware limits', () => {
  for (const value of [-2, 2, NaN, Infinity]) assert.throws(() => virtualPosition(value));
  assert.equal(virtualPosition(-1), -1);
  assert.equal(virtualPosition(1), 1);
});
test('UUID validation requires a concrete full identifier and excludes Nordic DFU', () => {
  assert.equal(normalizeUUID(' ' + ELMO_SERVICE.toUpperCase() + ' '), ELMO_SERVICE);
  assert.throws(() => normalizeUUID('180A'));
  assert.throws(() => normalizeUUID('00001532-1212-efde-1523-785feabcd123'));
});
test('all shipped scripts lack characteristic write APIs, credential input and remote senders', async () => {
  const paths = [
    'site/app.js',
    'site/discovery-ui.js',
    'site/elmo-packets.mjs',
    ...(await readdir('site/lib')).filter((x) => x.endsWith('.js')).map((x) => 'site/lib/' + x),
  ];
  const js = (await Promise.all(paths.map((p) => readFile(p, 'utf8')))).join('\n');
  assert.doesNotMatch(js, /\.writeValue(?:WithoutResponse|WithResponse)?\s*\(/);
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|\.innerHTML\s*=/);
  const html = await readFile('site/index.html', 'utf8');
  assert.doesNotMatch(html, /type="password"/);
  assert.match(html, /connect-src 'none'/);
});
