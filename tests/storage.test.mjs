import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IDBFactory } from 'fake-indexeddb';
import { ResearchStore } from '../site/lib/storage.js';
import { createSession } from '../site/lib/records.js';
const open = async () => new ResearchStore({ indexedDB: new IDBFactory(), name: 'test' }).open();
test('IndexedDB saves, reloads and deletes sessions', async () => {
  const store = await open(),
    r = createSession('live');
  assert.equal(store.persistent, true);
  await store.save(r);
  const other = await new ResearchStore({ indexedDB: store.factory, name: 'test' }).open();
  assert.equal((await other.list())[0].id, r.id);
  await other.remove(r.id);
  assert.equal((await store.list()).length, 0);
  store.db.close();
  other.db.close();
});
test('unavailable IndexedDB is visibly temporary and remains functional', async () => {
  const store = await new ResearchStore({ indexedDB: null }).open();
  assert.equal(store.persistent, false);
  assert.match(store.warning, /Temporary/);
  await store.save(createSession('simulated'));
  assert.equal((await store.list()).length, 1);
});
test('malformed records are skipped with a recovery warning', async () => {
  const store = await open();
  await store.save(createSession('live'));
  await new Promise((resolve, reject) => {
    const tx = store.db.transaction('records', 'readwrite');
    tx.objectStore('records').put({ id: 'corrupt' });
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
  assert.equal((await store.list()).length, 1);
  assert.equal(store.corrupt[0].id, 'corrupt');
  await store.remove('corrupt');
  await store.list();
  assert.equal(store.corrupt.length, 0);
  store.db.close();
});
test('capacity does not silently evict old experiments', async () => {
  const store = await open();
  await store.saveMany(Array.from({ length: 50 }, () => createSession('imported')));
  await assert.rejects(store.save(createSession('live')), /50-record/);
  assert.equal((await store.list()).length, 50);
  store.db.close();
});
test('concurrent saves preserve both experiments', async () => {
  const store = await open();
  await Promise.all([store.save(createSession('live')), store.save(createSession('simulated'))]);
  assert.equal((await store.list()).length, 2);
  store.db.close();
});
test('deletion waits for pending saves so a deleted record cannot reappear', async () => {
  for (const indexedDB of [null, new IDBFactory()]) {
    const store = await new ResearchStore({ indexedDB, name: 'delete-race' }).open();
    const record = createSession('simulated');
    await store.save(record);
    record.notes = 'A queued edit';
    const save = store.save(record);
    const remove = store.remove(record.id);
    await Promise.all([save, remove]);
    assert.equal((await store.list()).length, 0);
    store.db?.close();
  }
});
test('two browser tabs cannot race past the storage capacity', async () => {
  const store = await open();
  const other = await new ResearchStore({ indexedDB: store.factory, name: 'test' }).open();
  await store.saveMany(Array.from({ length: 49 }, () => createSession('imported')));
  const outcomes = await Promise.allSettled([
    store.save(createSession('live')),
    other.save(createSession('live')),
  ]);
  assert.equal(outcomes.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal((await store.list()).length, 50);
  store.db.close();
  other.db.close();
});
test('invalid import batch performs no partial writes', async () => {
  const store = await open();
  assert.throws(() => store.saveMany([createSession('live'), {}]));
  assert.equal((await store.list()).length, 0);
  store.db.close();
});
test('restored records get new IDs and cannot overwrite an experiment', async () => {
  const store = await open(),
    r = createSession('live');
  await store.save(r);
  await store.importCopies([r]);
  const records = await store.list();
  assert.equal(records.length, 2);
  assert.ok(records.some((x) => x.title.startsWith('Imported')));
  store.db.close();
});
test('settings persist without authorization or credentials', async () => {
  const store = await open();
  await store.setSettings({ service: 'fixture', engineering: true });
  assert.deepEqual(await store.getSettings(), { service: 'fixture', engineering: true });
  store.db.close();
});
test('database v1 migration copies sessions and preserves old store', async () => {
  const factory = new IDBFactory(),
    r = createSession('live');
  r.schemaVersion = 1;
  delete r.stats;
  await new Promise((resolve, reject) => {
    const req = factory.open('legacy', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('sessions', { keyPath: 'id' }).put(r);
    req.onsuccess = () => {
      req.result.close();
      resolve();
    };
    req.onerror = reject;
  });
  const store = await new ResearchStore({ indexedDB: factory, name: 'legacy' }).open();
  assert.equal((await store.list())[0].schemaVersion, 2);
  assert.ok(store.db.objectStoreNames.contains('sessions'));
  store.db.close();
});
