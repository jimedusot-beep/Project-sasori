import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { compareFrames } from '../site/lib/privacy-optics.js';
import { PrivacyCamera } from '../site/lib/privacy-camera.js';
import { PrivacyNotebook, portableObservation, cleanSurvey } from '../site/lib/privacy-notebook.js';
import { PrivacySurvey } from '../site/lib/privacy-survey.js';

function frame(value = 0) {
  const data = new Uint8ClampedArray(16 * 12 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([value, value, value, 255], i);
  return { width: 16, height: 12, data };
}
function stream() {
  const track = new EventTarget();
  track.stopped = false;
  track.stop = () => {
    track.stopped = true;
  };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}
test('frame comparison measures a known changed region without classifying a camera', () => {
  const a = frame(),
    b = frame();
  b.data.set([255, 255, 255, 255], 0);
  const result = compareFrames(a, b);
  assert.equal(result.changedCells, 1);
  assert.equal(result.brightIncreases, 1);
  assert.equal(result.meanAbsoluteChange, 1.33);
  assert.deepEqual(result.cells[0], { x: 0, y: 0, delta: 255, bright: true });
  assert.equal(result.cells.length, 192);
  assert.equal(result.cameraDetected, undefined);
  assert.equal(compareFrames(frame(100), frame(100)).changedCells, 0);
});
test('frame comparison rejects missing, oversized, mismatched and malformed frames', () => {
  for (const bad of [
    null,
    { ...frame(), width: 321 },
    { ...frame(), data: [1] },
    { ...frame(), height: 1.5 },
  ])
    assert.throws(() => compareFrames(frame(), bad));
  assert.throws(() =>
    compareFrames(frame(), { width: 32, height: 12, data: new Uint8ClampedArray(32 * 12 * 4) }),
  );
});
test('Stop closes a late camera stream and cannot resume a cancelled permission request', async () => {
  let grant;
  const video = stream();
  const camera = new PrivacyCamera({
    mediaDevices: {
      getUserMedia: () =>
        new Promise((resolve) => {
          grant = resolve;
        }),
    },
  });
  const pending = camera.start();
  camera.stop();
  grant(video);
  assert.equal(await pending, null);
  assert.equal(video.track.stopped, true);
  assert.equal(camera.state, 'stopped');
});
test('camera requests no audio, ends on track termination and has a finite deadline', async () => {
  const video = stream();
  let constraints;
  const camera = new PrivacyCamera({
    budgetMs: 30,
    mediaDevices: {
      getUserMedia: async (c) => {
        constraints = c;
        return video;
      },
    },
  });
  await camera.start();
  assert.equal(constraints.audio, false);
  video.track.dispatchEvent(new Event('ended'));
  assert.equal(camera.state, 'stopped');
  assert.equal(video.track.stopped, true);
  const next = stream();
  camera.mediaDevices.getUserMedia = async () => next;
  await camera.start();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(camera.state, 'stopped');
  assert.equal(next.track.stopped, true);
});
test('permission errors release busy state and a second camera start cannot replace a live stream', async () => {
  const camera = new PrivacyCamera({
    mediaDevices: {
      getUserMedia: async () => {
        throw new Error('private backend detail');
      },
    },
  });
  await assert.rejects(camera.start(), /camera-unavailable/);
  const video = stream();
  camera.mediaDevices.getUserMedia = async () => video;
  await camera.start();
  await assert.rejects(camera.start(), /already-active/);
  camera.stop();
  camera.stop();
  assert.equal(video.track.stopped, true);
});
test('notebook persists, preserves synthetic provenance and strips unsupported evidence claims', async () => {
  const factory = new IDBFactory();
  const book = new PrivacyNotebook({ indexedDB: factory });
  const record = await book.save({
    label: 'Test',
    note: '<img src=x onerror=alert(1)>',
    source: 'synthetic',
    kind: 'note',
    hardwareVerified: true,
    password: 'never retain',
  });
  const reopened = new PrivacyNotebook({ indexedDB: factory });
  assert.equal((await reopened.list()).length, 1);
  assert.equal(record.source, 'synthetic');
  assert.equal(record.hardwareVerified, false);
  assert.equal(record.password, undefined);
  assert.match(record.note, /<img/);
  await reopened.remove(record.id);
  assert.deepEqual(await book.list(), []);
});
test('notebook concurrent saves enforce capacity without losing earlier records', async () => {
  const book = new PrivacyNotebook({ indexedDB: new IDBFactory() });
  const input = { label: 'Check', source: 'live', kind: 'note' };
  const results = await Promise.allSettled(Array.from({ length: 31 }, () => book.save(input)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 30);
  assert.equal((await book.list()).length, 30);
});
test('photos require explicit retention and default exports omit photos and radio identifiers', async () => {
  const book = new PrivacyNotebook({ indexedDB: new IDBFactory() });
  const photo = 'data:image/jpeg;base64,/9j/';
  const input = {
    label: 'Photo',
    source: 'live',
    kind: 'survey',
    photo,
    measurements: {
      durationMs: 200,
      devices: [
        {
          alias: 'signal-1',
          samples: 2,
          rssi: -50,
          minRssi: -60,
          maxRssi: -50,
          name: 'private name',
          id: 'private-id',
          services: ['secret'],
        },
      ],
    },
  };
  const metadata = await book.save(input);
  assert.equal(metadata.photo, undefined);
  const retained = await book.save(input, { keepPhoto: true });
  assert.equal(retained.photo, photo);
  const portable = portableObservation(retained);
  assert.equal(portable.photo, undefined);
  assert.equal(JSON.stringify(portable).includes('private'), false);
  assert.equal(portableObservation(retained, { includePhoto: true }).photo, photo);
  await assert.rejects(
    book.save({ ...input, photo: 'data:text/html;base64,PHNjcmlwdD4=' }, { keepPhoto: true }),
  );
  await assert.rejects(book.save({ ...input, note: 'x'.repeat(2001) }));
});
test('native survey never starts automatically, stops stale results and rejects overlapping runs', async () => {
  let starts = 0,
    stopped = 0,
    grant;
  const plugin = {
    startSurvey: () => {
      starts++;
      return new Promise((resolve) => {
        grant = resolve;
      });
    },
    stopSurvey: async () => {
      stopped++;
    },
    getSurvey: async () => ({ state: 'scanning', sessionId: 'one', devices: [] }),
  };
  const survey = new PrivacySurvey({ plugin });
  assert.equal(starts, 0);
  const pending = survey.start();
  await assert.rejects(survey.start(), /already-active/);
  survey.stop();
  grant({ sessionId: 'one', state: 'scanning', devices: [] });
  await pending;
  assert.equal(survey.state, 'stopped');
  assert.ok(stopped >= 1);
});
test('native survey reports unavailable without substituting a Bluetooth chooser', async () => {
  const survey = new PrivacySurvey();
  await assert.rejects(survey.start(), /native-survey-unavailable/);
});
test('survey validation rejects aggregate overflow and malformed history', () => {
  const device = { alias: 'signal-1', rssi: -50, minRssi: -60, maxRssi: -40, samples: 1500 };
  assert.throws(() =>
    cleanSurvey({ durationMs: 1000, devices: [device, { ...device, alias: 'signal-2' }] }),
  );
  assert.throws(() =>
    cleanSurvey({ durationMs: 1000, devices: [{ ...device, history: 'not an array' }] }),
  );
});
test('native advertisements expose bounded metadata only locally and cannot leak into portable records', async () => {
  let token;
  const plugin = {
    startSurvey: async (options) => {
      token = options.sessionId;
      return {
        sessionId: token,
        state: 'stopped',
        durationMs: 100,
        devices: [
          {
            alias: 'signal-1',
            rssi: -50,
            minRssi: -50,
            maxRssi: -50,
            samples: 1,
            name: 'Local fixture',
            services: ['180f', 'invalid-uuid'],
            id: 'never-expose',
          },
        ],
      };
    },
    stopSurvey: async () => {},
  };
  const survey = new PrivacySurvey({ plugin });
  await survey.start();
  assert.equal(survey.report.devices[0].name, 'Local fixture');
  assert.deepEqual(survey.report.devices[0].services, ['180f']);
  assert.equal(survey.report.devices[0].id, undefined);
  const result = portableObservation({
    label: 'Check',
    kind: 'survey',
    source: 'live',
    measurements: survey.report,
  });
  assert.equal(JSON.stringify(result).includes('Local fixture'), false);
});
test('notebook byte limit rejects a large photo save atomically before record count is reached', async () => {
  const book = new PrivacyNotebook({ indexedDB: new IDBFactory() });
  const input = {
    label: 'Large image',
    source: 'live',
    kind: 'note',
    photo: 'data:image/jpeg;base64,' + 'A'.repeat(199976),
  };
  for (let i = 0; i < 26; i++) await book.save(input, { keepPhoto: true });
  await assert.rejects(book.save(input, { keepPhoto: true }), /notebook-full/);
  assert.equal((await book.list()).length, 26);
});
