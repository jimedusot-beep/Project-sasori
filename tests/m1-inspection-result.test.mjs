import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionResult } from '../site/lib/connection-result.js';

function record(outcome) {
  return {
    source: 'live',
    outcome,
    services: [],
    stats: { packets: 0 },
  };
}

test('a deadline before discovery is ready never counts as a completed inspection', () => {
  const result = connectionResult(record('inspection-deadline-before-ready'));
  assert.match(result.title, /deadline reached before ready/i);
  assert.match(result.next, /not a completed inspection/i);
  assert.deepEqual(result.channels, []);
});

test('a failed Stop reports uncertain disconnect rather than confirmed safety', () => {
  const result = connectionResult(record('disconnect-failed'));
  assert.match(result.title, /disconnect not confirmed/i);
  assert.match(result.detail, /incomplete/);
  assert.match(result.next, /Power off/);
  assert.match(result.next, /Reload Sasori/);
  assert.deepEqual(result.channels, []);
});
