import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import {
  trialFromAction,
  trialSummary,
  observeActionTrial,
  portableTrials,
  parseTrials,
  validateActionTrial,
} from '../site/lib/action-trials.js';
import { ResearchStore } from '../site/lib/storage.js';
import {
  rememberControlDevice,
  emptyControlSetups,
  portableControlSetups,
  parseControlSetups,
} from '../site/lib/control-setups.js';
const row = (i, changes = {}) =>
  validateActionTrial({
    format: 'sasori.action-trial',
    schemaVersion: 1,
    id: 'trial-' + i,
    targetId: 'control-mip',
    sessionId: 'connection-' + i,
    adapterId: 'wowwee-mip/v1',
    source: 'live',
    intent: 'check',
    label: 'My toy',
    model: 'Original MiP',
    firmware: 'revision 7',
    startedAt: new Date(100000 + i * 1000).toISOString(),
    endedAt: new Date(100100 + i * 1000).toISOString(),
    durationMs: 100,
    outcome: 'effect-clear-queued',
    cleanup: 'cleared',
    observed: 'yes',
    recovered: 'yes',
    notes: '',
    error: '',
    stages: ['identify: matched-reply', 'status: matched-reply', 'alert: effect-clear-queued'],
    ...changes,
  });
test('ten fresh local owner-observed sessions form a review target and never certify hardware or authentication', () => {
  const rows = Array.from({ length: 10 }, (_, i) => row(i));
  const summary = trialSummary(rows, 'control-mip');
  assert.equal(summary.consecutive, 10);
  assert.equal(summary.readyForReview, true);
  assert.equal(summary.hardwareVerified, false);
  assert.equal(summary.authenticationVerified, false);
  assert.equal(
    validateActionTrial({ ...rows[0], physicalEffectVerified: true }).physicalEffectVerified,
    false,
  );
});
test('failed, cancelled, untested, unknown-identity and changed-firmware checks restart the count', () => {
  const start = [row(0), row(1)];
  for (const change of [
    { outcome: 'failed' },
    { outcome: 'cancelled' },
    { observed: 'not-tested' },
    { recovered: 'no' },
    { model: ' UNKNOWN ' },
    { firmware: 'Unknown' },
    { cleanup: 'pending' },
  ]) {
    assert.equal(trialSummary([...start, row(2, change), row(3)], 'control-mip').consecutive, 1);
  }
  assert.equal(
    trialSummary([...start, row(2, { firmware: 'revision 8' })], 'control-mip').consecutive,
    1,
  );
  const duplicate = [
    row(0),
    row(1, { sessionId: 'connection-0' }),
    row(2, { outcome: 'failed' }),
    row(3, { sessionId: 'connection-0' }),
  ];
  assert.equal(trialSummary(duplicate, 'control-mip').consecutive, 0);
  assert.equal(
    trialSummary([row(0), row(1, { sessionId: 'connection-0' })], 'control-mip').consecutive,
    1,
  );
});
test('synthetic and imported trials cannot qualify, and mixed malformed backups are refused before saving', () => {
  const rows = [row(0, { source: 'synthetic' }), row(1, { source: 'imported' })];
  assert.equal(trialSummary(rows, 'control-mip').consecutive, 0);
  const backup = portableTrials([row(2, { notes: 'password=private-value' })]);
  assert.equal(JSON.stringify(backup).includes('private-value'), false);
  const imported = parseTrials(JSON.stringify(backup));
  assert.equal(imported[0].source, 'imported');
  assert.notEqual(imported[0].id, backup.trials[0].id);
  assert.equal(trialSummary(imported, 'control-mip').consecutive, 0);
  assert.throws(
    () => parseTrials(JSON.stringify({ ...backup, trials: [...backup.trials, { invalid: true }] })),
    /Invalid/,
  );
});
test('new automated receipts begin untested and observations cannot introduce executable or verification fields', () => {
  const action = { ...row(0), id: 'action-example' };
  const trial = trialFromAction(action, { id: 'control-mip', label: 'Toy' });
  assert.equal(trial.observed, 'not-tested');
  assert.equal(trial.recovered, 'not-tested');
  const observed = observeActionTrial(trial, {
    observed: 'yes',
    recovered: 'yes',
    notes: 'Light occurred and stopped.',
    authenticationVerified: true,
    command: 'ff',
  });
  assert.equal(observed.authenticationVerified, false);
  assert.equal(observed.command, undefined);
});
test('trials store atomically beside v4 settings, preserve concurrent updates, survive reopen and support deletion', async () => {
  const name = 'trials-' + crypto.randomUUID();
  let store = new ResearchStore({ indexedDB, name });
  await store.open();
  await store.setSettings({ profile: '001' });
  await Promise.all([store.saveActionTrials([row(0)]), store.saveActionTrials([row(1)])]);
  assert.equal((await store.getActionTrials()).length, 2);
  await store.saveActionTrials([observeActionTrial(row(0), { observed: 'no', recovered: 'no' })]);
  const overflow = Array.from({ length: 199 }, (_, i) => row(i + 2));
  await assert.rejects(store.saveActionTrials(overflow), /limit/);
  assert.equal((await store.getActionTrials()).length, 2);
  await store.removeActionTrial('trial-1');
  store.db.close();
  store = new ResearchStore({ indexedDB, name });
  await store.open();
  assert.equal(store.db.version, 4);
  assert.equal((await store.getSettings()).profile, '001');
  assert.equal((await store.getActionTrials())[0].observed, 'no');
  assert.equal((await store.getActionTrials()).length, 1);
  store.db.close();
});
test('saved device binding includes its family; portable setups keep the family without private radio IDs', () => {
  const device = { id: 'private-device', name: 'MiP' };
  let data = rememberControlDevice(emptyControlSetups(), device);
  data = rememberControlDevice(data, device, { adapterId: 'wowwee-mip/v1' });
  assert.equal(data.targets.length, 2);
  const clean = parseControlSetups(JSON.stringify(portableControlSetups(data)));
  assert.equal(clean.targets[1].adapterId, 'wowwee-mip/v1');
  assert.equal(JSON.stringify(clean).includes('private-device'), false);
});
