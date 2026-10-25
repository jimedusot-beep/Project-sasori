import test from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { ResearchStore } from '../site/lib/storage.js';
import { createSession } from '../site/lib/records.js';
import { emptyHubData } from '../site/lib/hub-records.js';
import { readProjects, matchingProjectItems } from '../site/lib/projects.js';

test('empty Projects reads existing stores without changing schema or adding records', async () => {
  const store = new ResearchStore({ indexedDB: new IDBFactory() });
  await store.open();
  const before = await store.getHubData();
  const result = await readProjects(store);
  assert.equal(result.sections.length, 9);
  assert.equal(result.persistent, true);
  assert.ok(result.sections.every((s) => s.count === 0 && !s.unavailable));
  assert.deepEqual(await store.getHubData(), before);
  assert.equal(store.db.version, 4);
  assert.deepEqual(await store.list(), []);
  store.db.close();
});
test('populated Projects exposes only metadata, preserves dates and omits authority and raw payloads', async () => {
  const store = new ResearchStore({ indexedDB: new IDBFactory() });
  await store.open();
  const record = createSession('simulated');
  record.notes = 'Synthetic experiment description';
  await store.save(record);
  const hub = emptyHubData();
  hub.setups = [
    {
      id: 'setup-one',
      label: 'My demo',
      familyId: 'elmo-l2l/v1',
      namePrefix: 'Elmo',
      deviceId: 'private-device-identity',
    },
  ];
  await store.setHubData(hub);
  const result = await readProjects(store);
  const sessions = result.sections.find((s) => s.id === 'sessions'),
    devices = result.sections.find((s) => s.id === 'devices');
  assert.equal(sessions.count, 1);
  assert.equal(sessions.items[0].at, record.startedAt);
  assert.ok(sessions.items[0].detail.includes(record.notes));
  assert.equal(devices.items[0].at, null);
  assert.equal(devices.count, 1);
  assert.ok(!JSON.stringify(result).includes('private-device-identity'));
  assert.deepEqual((await store.getHubData()).setups, hub.setups);
  store.db.close();
});
test('one corrupt workspace cannot hide healthy sections or overwrite original data', async () => {
  const store = new ResearchStore({ indexedDB: new IDBFactory() });
  await store.open();
  const record = createSession('simulated');
  await store.save(record);
  store.getHubData = async () => {
    throw new Error('Synthetic corrupt hub');
  };
  const result = await readProjects(store);
  assert.equal(result.sections.find((s) => s.id === 'devices').count, null);
  assert.equal(result.sections.find((s) => s.id === 'routines').unavailable, true);
  assert.equal(result.sections.find((s) => s.id === 'sessions').count, 1);
  assert.equal((await store.list()).length, 1);
  store.db.close();
});
test('unavailable storage is explicitly temporary and searching does not mutate sections', async () => {
  const store = new ResearchStore({ indexedDB: null });
  await store.open();
  const result = await readProjects(store);
  assert.equal(result.persistent, false);
  assert.ok(result.warning.includes('Temporary'));
  const section = {
    title: 'Saved routines',
    items: [
      { title: 'Clap', detail: 'Elmo' },
      { title: 'Status', detail: 'MiP' },
    ],
  };
  assert.equal(matchingProjectItems(section, ' elmo ').length, 1);
  assert.equal(matchingProjectItems(section, 'ROUTINES').length, 2);
  assert.equal(section.items.length, 2);
});
