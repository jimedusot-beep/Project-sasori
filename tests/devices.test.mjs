import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession, validateRecord, portableRecord, reviseNotes } from '../site/lib/records.js';
import {
  bluetoothSupport,
  makeInspection,
  validateInspection,
  identityOf,
  inspectionEvidence,
  packetTimeline,
  INSPECTION_ADAPTER,
} from '../site/lib/devices.js';
import { ELMO_SERVICE, ELMO_NOTIFY, PROFILES } from '../site/lib/profiles.js';
import { createToy, exportToys, parseToys } from '../site/lib/toys.js';
const profile = PROFILES[0];
function live(patch = {}) {
  const r = createSession('live', profile.id);
  r.endedAt = new Date().toISOString();
  r.outcome = 'inspection-complete';
  r.inspection = { ...makeInspection(profile, ELMO_SERVICE, ELMO_NOTIFY), gattDurationMs: 15000 };
  r.services = [
    {
      uuid: ELMO_SERVICE,
      evidence: 'observed-this-session',
      characteristics: [
        { uuid: ELMO_NOTIFY, evidence: 'observed-this-session', properties: ['notify'] },
      ],
    },
  ];
  return { ...r, ...patch };
}
test('Bluetooth support is detected without requesting devices or asserting hardware compatibility', () => {
  let calls = 0;
  const bluetooth = {
    requestDevice() {
      calls++;
    },
  };
  assert.equal(bluetoothSupport({ bluetooth }).available, true);
  assert.equal(bluetoothSupport({ bluetooth, secure: false }).available, false);
  assert.match(bluetoothSupport().detail, /Bluefy/);
  assert.match(bluetoothSupport({ bluetooth, native: true }).title, /Native/);
  assert.equal(calls, 0);
  assert.equal(INSPECTION_ADAPTER.authenticationVerified, false);
  assert.equal(INSPECTION_ADAPTER.physicalActionsVerified, false);
});
test('inspection snapshots preserve exact identity and allow only bounded inspection adapters', () => {
  assert.equal(identityOf(profile).firmware, 'unknown');
  const context = makeInspection(profile, ELMO_SERVICE, '');
  assert.equal(validateRecord({ ...live(), inspection: context }).inspection.notify, '');
  assert.equal(validateInspection({ ...context, write: 'ignored' }).write, undefined);
  for (const patch of [
    { adapterId: 'untrusted' },
    { transport: 'arbitrary' },
    { gattDurationMs: -1 },
    { requestedDurationMs: 60000 },
    { firmware: 'x'.repeat(61) },
    { model: undefined },
    { model: 1 },
    { revision: '' },
    { revision: 0 },
    { firmware: undefined },
    { service: 'bad' },
    { notify: null },
  ])
    assert.throws(() => validateInspection({ ...context, ...patch }));
});
test('inspection transport must match live or simulated session provenance', () => {
  const r = live();
  assert.throws(() => validateRecord({ ...r, source: 'simulated' }), /provenance/);
  assert.throws(
    () => validateRecord({ ...r, inspection: { ...r.inspection, transport: 'simulation' } }),
    /provenance/,
  );
  assert.equal(
    validateRecord({
      ...r,
      source: 'simulated',
      inspection: { ...r.inspection, transport: 'simulation' },
    }).source,
    'simulated',
  );
  assert.equal(validateRecord({ ...r, source: 'imported' }).source, 'imported');
});
test('capture checklist counts unique non-imported live observations of this exact identity only', () => {
  const good = live();
  const rows = [
    good,
    good,
    live({ source: 'simulated' }),
    live({ importedAt: new Date().toISOString() }),
    live({ inspection: { ...good.inspection, firmware: 'another firmware' } }),
    live({ inspection: { ...good.inspection, gattDurationMs: 1000 } }),
    live({ inspection: { ...good.inspection, transport: 'simulation' } }),
    live({ services: [] }),
  ];
  const result = inspectionEvidence(rows, profile);
  assert.equal(result.complete, 1);
  assert.equal(result.notificationProperties, true);
  assert.equal(result.manualStop, false);
  assert.equal(result.backgroundStop, false);
  assert.equal(result.hardwareVerified, false);
  const stops = inspectionEvidence(
    [live({ outcome: 'user' }), live({ outcome: 'page-hidden' })],
    profile,
  );
  assert.equal(stops.manualStop, true);
  assert.equal(stops.backgroundStop, true);
  assert.equal(
    inspectionEvidence(
      Array.from({ length: 5 }, () => live()),
      profile,
    ).complete,
    5,
  );
});
test('packet timeline preserves observed timing and omits bytes and free text', () => {
  const r = live();
  r.startedAt = '2026-10-22T12:00:00.000Z';
  r.packets = [0, 125, 400].map((time) => ({
    timestamp: new Date(Date.parse(r.startedAt) + time).toISOString(),
    characteristic: ELMO_NOTIFY,
    length: 3,
    kind: 'unknown',
    hex: 'ab cd ef',
    text: 'private',
  }));
  const rows = packetTimeline(r);
  assert.deepEqual(
    rows.map((row) => row.offsetMs),
    [0, 125, 400],
  );
  assert.deepEqual(
    rows.map((row) => row.gapMs),
    [null, 125, 275],
  );
  assert.doesNotMatch(JSON.stringify(rows), /ab cd ef|private/);
});
test('note revisions are bounded, survive metadata export, and redact recognized secrets', () => {
  let r = live();
  const unchanged = reviseNotes(r, r.title, r.notes);
  assert.equal(unchanged.noteHistory, undefined);
  for (let i = 0; i < 7; i++)
    r = reviseNotes(r, 'Revision ' + i, 'token=synthetic-private-value ' + i);
  assert.equal(r.noteHistory.length, 5);
  assert.equal(r.noteHistory[0].title, 'Revision 1');
  const exported = portableRecord(r);
  assert.equal(exported.noteHistory.length, 5);
  assert.doesNotMatch(JSON.stringify(exported), /synthetic-private-value/);
  assert.throws(() => validateRecord({ ...r, noteHistory: [...r.noteHistory, {}] }));
  assert.throws(() =>
    validateRecord({ ...r, noteHistory: [{ savedAt: 'bad', title: 'bad', notes: '' }] }),
  );
});
test('legacy toy profiles gain explicit unknown revisions and exact identities round trip', () => {
  const toy = createToy({
    label: 'Fixture',
    service: ELMO_SERVICE,
    namePrefix: 'Fixture',
    notify: '',
    sourceNote: 'Synthetic',
  });
  assert.equal(toy.model, 'Fixture');
  assert.equal(toy.revision, 'unknown');
  assert.equal(toy.firmware, 'unknown');
  const updated = { ...toy, model: 'Fixture model 2', revision: 'B', firmware: '1.0' };
  assert.deepEqual(parseToys(JSON.stringify(exportToys([updated])))[0], updated);
});
