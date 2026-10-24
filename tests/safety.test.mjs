import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { CAPABILITIES, validateCommand, virtualPosition } from '../site/lib/safety.js';
import { normalizeUUID, ELMO_SERVICE } from '../site/lib/profiles.js';
test('custom toy and Elmo physical capabilities remain blocked regardless of consent', () => {
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
test('inspection scripts have no write API and shipped scripts use no raw remote sender or HTML injection', async () => {
  const paths = [
    'site/app.js',
    'site/discovery-ui.js',
    'site/device-hub.js',
    'site/controls-ui.js',
    'site/recorder-ui.js',
    'site/elmo-ui.js',
    'site/hub-ui.js',
    'site/pocket-ir-ui.js',
    'site/pocket-ir-import-ui.js',
    'site/companion-ui.js',
    'site/elmo-packets.mjs',
    ...(await readdir('site/lib')).filter((x) => x.endsWith('.js')).map((x) => 'site/lib/' + x),
  ];
  const js = (await Promise.all(paths.map((p) => readFile(p, 'utf8')))).join('\n');
  for (const path of paths.filter(
    (p) =>
      ![
        'site/lib/standard-controls.js',
        'site/lib/mip-controls.js',
        'site/lib/elmo-remote.js',
        'site/lib/pocket-ir.js', // audited fixed-protocol consumer IR sender
      ].includes(p),
  ))
    assert.doesNotMatch(
      await readFile(path, 'utf8'),
      /\.writeValue(?:WithoutResponse|WithResponse)?\s*\(/,
      path,
    );
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|\.innerHTML\s*=/);
  const html = await readFile('site/index.html', 'utf8');
  assert.doesNotMatch(html, /type="password"/);
  assert.match(html, /connect-src 'none'/);
  const remote = await readFile('site/elmo.html', 'utf8');
  assert.match(remote, /connect-src 'none'/);
  assert.match(remote, /form-action 'none'/);
  assert.match(remote, /autocomplete="off"/);
  for (const path of ['site/hub.html', 'site/companion.html']) {
    const html = await readFile(path, 'utf8');
    assert.match(html, /connect-src 'self'/);
    assert.match(html, /form-action 'none'/);
    assert.doesNotMatch(html, /connect-src[^;]*https?:/);
  }
  const pilot = await readFile('site/lib/pocket-ir.js', 'utf8');
  assert.match(pilot, /filters: \[\{ services: \[POCKET_IR_UUIDS\.service\] \}\]/);
  assert.doesNotMatch(pilot, /acceptAllDevices\s*:/);
  assert.doesNotMatch(pilot, /\.writeValueWithoutResponse\s*\(/);
  assert.match(pilot, /validatePocketConfig\(candidate\)/);
  const pilotHtml = await readFile('site/pocket-ir.html', 'utf8');
  assert.match(pilotHtml, /connect-src 'none'/);
  assert.match(pilotHtml, /form-action 'none'/);
  assert.doesNotMatch(pilotHtml, /<script[^>]*src="https?:/);
  const tv = await readFile('site/lib/tv-remote.js', 'utf8');
  assert.match(tv, /if \(!API_PATHS\.has\(path\)\)/);
  assert.match(tv, /this\.fetcher\('\/api\/tv\/disconnect'/);
  assert.doesNotMatch(tv, /https?:\/\//);
});
