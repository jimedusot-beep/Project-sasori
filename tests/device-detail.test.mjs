import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionSourceLabel, deviceDetailModel } from '../site/lib/device-detail.js';

test('demo never implies a hardware command or verification', () => {
  const model = deviceDetailModel({
    deviceName: 'My Elmo',
    state: 'connected',
    synthetic: true,
    canConnect: true,
    lastAction: 'sound-requested',
  });
  assert.equal(model.name, 'My Elmo');
  assert.equal(model.progress, 'Demo ready');
  assert.match(model.outcome, /Demo only · no physical command sent/);
  assert.match(model.physical, /Not independently verified/);
});

test('successful physical adapter request remains an unverified command receipt', () => {
  const model = deviceDetailModel({
    familyName: 'Original WowWee MiP',
    state: 'connected',
    canConnect: true,
    lastAction: 'effect-requested',
  });
  assert.match(model.outcome, /Command sent · physical effect not confirmed/);
  assert.match(model.next, /not proof of an effect/);
  assert.match(model.compatibility, /Experimental/);
});

test('native unsupported state never advertises live compatibility', () => {
  const model = deviceDetailModel({
    state: 'idle',
    nativeUnsupported: true,
    canConnect: false,
  });
  assert.match(model.compatibility, /Not supported by this native adapter/);
  assert.match(model.next, /Research Lab/);
});

test('failure and cancellation remain recoverable', () => {
  const failed = deviceDetailModel({ state: 'disconnected', failure: true });
  assert.match(failed.happened, /did not finish/);
  assert.match(failed.next, /recovery message/);
  const stopped = deviceDetailModel({ state: 'disconnected', canConnect: true });
  assert.equal(stopped.progress, 'Disconnected');
  assert.match(stopped.next, /Connect or Try Demo/);
});

test('unknown action does not create a speculative command label', () => {
  const model = deviceDetailModel({ lastAction: 'secret-motor-write', state: 'connected' });
  assert.equal(model.lastAction, 'No action recorded');
  assert.equal(model.outcome, 'No action yet');
});

test('source label requires an actual connected state before claiming LIVE or DEMO', () => {
  for (const state of [
    'idle',
    'choosing',
    'connecting',
    'authenticating',
    'disconnected',
    'error',
  ]) {
    assert.equal(connectionSourceLabel({ state }), 'OFFLINE');
    assert.equal(connectionSourceLabel({ state, synthetic: true }), 'OFFLINE');
  }
  assert.equal(connectionSourceLabel({ state: 'ready' }), 'LIVE');
  assert.equal(connectionSourceLabel({ state: 'connected' }), 'LIVE');
  assert.equal(connectionSourceLabel({ state: 'ready', synthetic: true }), 'DEMO');
  assert.equal(connectionSourceLabel({ state: 'connected', synthetic: true }), 'DEMO');
});

test('failed sessions never imply a completed command or independent verification', () => {
  const failed = deviceDetailModel({
    state: 'disconnected',
    failure: true,
    lastAction: 'greeting-requested',
  });
  assert.match(failed.outcome, /Outcome unconfirmed/);
  assert.match(failed.next, /recovery/);
  assert.equal(failed.physical, 'Not independently verified');

  const error = deviceDetailModel({ state: 'error', lastAction: 'effect-requested' });
  assert.match(error.happened, /did not finish/);
  assert.match(error.outcome, /Outcome unconfirmed/);

  const demo = deviceDetailModel({
    state: 'disconnected',
    synthetic: true,
    failure: true,
    lastAction: 'sound-requested',
  });
  assert.match(demo.outcome, /no physical command sent/);
});
