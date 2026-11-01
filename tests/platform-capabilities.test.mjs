import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NATIVE_CONTROL_FAMILIES,
  hostSupport,
  hostCanRecognize,
} from '../site/lib/platform-capabilities.js';

const families = [
  'elmo-l2l/v1', 'ble-standard/v1', 'wowwee-mip/v1',
  'furby-connect/v1', 'tv-local/v1',
];

test('native iPhone permits exactly reviewed standard and MiP family controls', () => {
  assert.deepEqual(NATIVE_CONTROL_FAMILIES, ['ble-standard/v1', 'wowwee-mip/v1']);
  const actual = families.filter((id) =>
    hostSupport(id, { native: true, webBluetooth: true }).live);
  assert.deepEqual(actual, NATIVE_CONTROL_FAMILIES);
  for (const id of ['elmo-l2l/v1', 'furby-connect/v1']) {
    assert.equal(hostSupport(id, { native: true, webBluetooth: true }).live, false);
    assert.match(hostSupport(id, { native: true }).explanation, /Demo/);
  }
});

test('native control allowlist overrides even a mocked Web Bluetooth API', () => {
  assert.equal(hostCanRecognize({ native: true, webBluetooth: true }), false);
  assert.equal(hostCanRecognize({ native: false, webBluetooth: true }), true);
  assert.equal(hostCanRecognize({ native: false, webBluetooth: false }), false);
  assert.equal(hostSupport('elmo-l2l/v1', { webBluetooth: true }).live, true);
  assert.equal(hostSupport('elmo-l2l/v1', { webBluetooth: false }).live, false);
  assert.equal(hostSupport('tv-local/v1', { native: true, companion: false }).live, false);
  assert.equal(hostSupport('tv-local/v1', { native: true, companion: true }).live, true);
});
