import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { createToy, validateToy, parseToys, exportToys } from '../site/lib/toys.js';
import { ELMO_SERVICE, ELMO_NOTIFY } from '../site/lib/profiles.js';
import { createSession } from '../site/lib/records.js';
import { ResearchStore } from '../site/lib/storage.js';
const fixture = (patch = {}) =>
  createToy({
    label: 'Synthetic robot',
    namePrefix: 'Robo',
    service: ELMO_SERVICE,
    notify: '',
    sourceNote: 'Synthetic test fixture, not a device claim',
    ...patch,
  });

test('toy profiles normalize sourced UUIDs and never carry command or credential fields', () => {
  const toy = fixture({
    service: ELMO_SERVICE.toUpperCase(),
    notify: ELMO_NOTIFY,
    token: 'synthetic',
    commands: ['synthetic'],
  });
  assert.equal(toy.service, ELMO_SERVICE);
  assert.equal(toy.token, undefined);
  assert.equal(toy.commands, undefined);
  assert.ok(toy.id.length <= 40);
  assert.equal(validateToy(toy).notify, ELMO_NOTIFY);
});
test('malformed profiles, absent sources and firmware UUIDs are rejected', () => {
  for (const patch of [
    { label: '' },
    { label: 'x'.repeat(81) },
    { service: 'invented' },
    { sourceNote: '' },
    { namePrefix: 'x'.repeat(61) },
    { notify: 'bad' },
    { service: '00001530-1212-efde-1523-785feabcd123' },
  ])
    assert.throws(() => fixture(patch));
  assert.throws(() => validateToy({ ...fixture(), id: '001' }));
  assert.throws(() => validateToy({ ...fixture(), schemaVersion: 2 }));
});
test('profile backups round trip and malformed batches fail as a whole', () => {
  const toy = fixture();
  assert.deepEqual(parseToys(JSON.stringify(exportToys([toy]))), [toy]);
  assert.throws(() => parseToys('{bad'));
  assert.throws(() =>
    parseToys(JSON.stringify({ format: 'sasori.toys', schemaVersion: 1, profiles: [toy, {}] })),
  );
  assert.throws(() => parseToys('x'.repeat(128001)), /128 KB/);
  assert.throws(() => parseToys(JSON.stringify(exportToys([]))));
});
test('export sanitization keeps profiles importable at text limits', () => {
  const toy = fixture({
    label: 'password=x '.repeat(7).slice(0, 80),
    sourceNote: 'person@example.org '.repeat(52),
  });
  const exported = exportToys([toy]);
  assert.doesNotMatch(JSON.stringify(exported), /person@example.org|password=x/);
  assert.equal(parseToys(JSON.stringify(exported)).length, 1);
});
test('a full set of maximum-length Unicode profiles fits the profile backup limit', () => {
  const toys = Array.from({ length: 20 }, () =>
    fixture({ label: '機'.repeat(80), namePrefix: '機'.repeat(60), sourceNote: '機'.repeat(1000) }),
  );
  assert.equal(parseToys(JSON.stringify(exportToys(toys))).length, 20);
});
test('profiles persist independently from sessions and have safe temporary fallback', async () => {
  for (const indexedDB of [null, new IDBFactory()]) {
    const store = await new ResearchStore({ indexedDB, name: 'toy-crud' }).open();
    const toy = fixture();
    const session = createSession('simulated', toy.id);
    await store.saveToys([toy]);
    await store.save(session);
    assert.equal((await store.listToys())[0].label, toy.label);
    await store.saveToys([{ ...toy, label: 'Renamed robot' }]);
    assert.equal((await store.listToys()).length, 1);
    if (indexedDB) {
      const other = await new ResearchStore({ indexedDB, name: 'toy-crud' }).open();
      assert.equal((await other.listToys())[0].label, 'Renamed robot');
      other.db.close();
    }
    await store.removeToy(toy.id);
    assert.equal((await store.listToys()).length, 0);
    assert.equal((await store.list()).length, 1);
    store.db?.close();
  }
});
test('profile import validation and capacity are atomic across tabs', async () => {
  const indexedDB = new IDBFactory();
  const store = await new ResearchStore({ indexedDB, name: 'toy-capacity' }).open();
  const other = await new ResearchStore({ indexedDB, name: 'toy-capacity' }).open();
  assert.throws(() => store.saveToys([fixture(), {}]));
  assert.equal((await store.listToys()).length, 0);
  await store.saveToys(Array.from({ length: 19 }, () => fixture()));
  const outcomes = await Promise.allSettled([
    store.saveToys([fixture()]),
    other.saveToys([fixture()]),
  ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await store.listToys()).length, 20);
  store.db.close();
  other.db.close();
});
test('v2 upgrade preserves edited records instead of replaying old v1 sessions', async () => {
  const indexedDB = new IDBFactory();
  const record = createSession('simulated');
  await new Promise((resolve, reject) => {
    const req = indexedDB.open('toy-upgrade', 2);
    req.onupgradeneeded = () => {
      req.result
        .createObjectStore('records', { keyPath: 'id' })
        .put({ ...record, notes: 'Latest edited notes' });
      req.result
        .createObjectStore('sessions', { keyPath: 'id' })
        .put({ ...record, notes: 'Stale migration source' });
      req.result.createObjectStore('settings').put({ engineering: true }, 'preferences');
    };
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = reject;
  });
  const store = await new ResearchStore({ indexedDB, name: 'toy-upgrade' }).open();
  assert.equal((await store.list())[0].notes, 'Latest edited notes');
  assert.equal((await store.getSettings()).engineering, true);
  await store.saveToys([fixture()]);
  assert.equal((await store.listToys()).length, 1);
  store.db.close();
});
