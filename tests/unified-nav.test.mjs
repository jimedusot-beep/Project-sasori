import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  currentPrimaryDestination,
  PRIMARY_DESTINATIONS,
} from '../site/unified-nav.js';

test('primary destinations are always the four beginner destinations', () => {
  assert.deepEqual(PRIMARY_DESTINATIONS.map((item) => item.label), [
    'Devices',
    'Routines',
    'Explore',
    'Saved',
  ]);
});

test('legacy tool URLs resolve to one primary destination without changing the URL', () => {
  for (const page of ['hub.html', 'elmo.html', 'pocket-ir.html', 'companion.html']) {
    assert.equal(currentPrimaryDestination('/Project-sasori/' + page), 'devices');
  }
  assert.equal(currentPrimaryDestination('/Project-sasori/hub.html', '#automations'), 'routines');
  for (const page of ['index.html', 'signal-atlas.html', 'privacy.html', 'keyfob-lab.html', 'explore.html']) {
    assert.equal(currentPrimaryDestination('/Project-sasori/' + page), 'explore');
  }
  assert.equal(currentPrimaryDestination('/Project-sasori/projects.html'), 'saved');
});
