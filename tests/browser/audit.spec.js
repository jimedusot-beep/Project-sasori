import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createSession, reviseNotes } from '../../site/lib/records.js';
import { ELMO_SERVICE, ELMO_NOTIFY } from '../../site/lib/profiles.js';

async function nativeCapture(page) {
  await page.addInitScript(
    ({ service, notify }) => {
      const listeners = {};
      window.emitSyntheticNotifications = (count) => {
        for (let i = 0; i < count; i++)
          listeners.notification?.({ id: 'audit-fixture', uuid: notify, hex: '0102' });
      };
      window.SasoriNativeBluetooth = {
        addListener: async (name, callback) => {
          listeners[name] = callback;
          return { remove: async () => delete listeners[name] };
        },
        requestDevice: async () => ({ id: 'audit-fixture', name: 'Synthetic audit device' }),
        connect: async () => {},
        getService: async () => ({ uuid: service }),
        getCharacteristics: async () => ({
          characteristics: [{ uuid: notify, properties: ['notify'] }],
        }),
        startNotifications: async () => {},
        disconnect: async () => {},
      };
    },
    { service: ELMO_SERVICE, notify: ELMO_NOTIFY },
  );
  await page.goto('/');
  await page.locator('#consent').check();
  await page.locator('#connect').click();
  await expect(page.locator('#state')).toHaveText('Inspecting');
  await page.getByRole('button', { name: 'Research records', exact: true }).click();
  await expect(page.locator('.record-row')).toHaveCount(1);
  await page.locator('.record-row').click();
}

async function savedRecords(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const opening = indexedDB.open('sasori-laboratory', 4);
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction('records', 'readonly');
          const request = tx.objectStore('records').getAll();
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
          tx.oncomplete = () => db.close();
        };
      }),
  );
}

test('notifications arriving during a research-note save cannot overwrite the edit', async ({
  page,
}) => {
  await nativeCapture(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    let injected = false;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (!injected && this.name === 'records' && args[0].notes === 'Keep this observation') {
        injected = true;
        // Reproduce an autosave before the note transaction completes.
        queueMicrotask(() => window.emitSyntheticNotifications(10));
      }
      return request;
    };
  });
  await page.locator('#record-notes').fill('Keep this observation');
  await page.locator('#update-record').click();
  await expect
    .poll(async () => {
      const [record] = await savedRecords(page);
      return { notes: record.notes, packets: record.stats.packets };
    })
    .toEqual({ notes: 'Keep this observation', packets: 10 });
  await page.locator('#global-stop').click();
  await page.reload();
  await page.locator('.record-row').click();
  await expect(page.locator('#record-notes')).toHaveValue('Keep this observation');
});

test('the active capture must stop before its research record can be deleted', async ({ page }) => {
  await nativeCapture(page);
  await expect(page.locator('#delete-record')).toBeDisabled();
  await page.evaluate(() => window.emitSyntheticNotifications(10));
  await expect.poll(async () => (await savedRecords(page))[0].stats.packets).toBe(10);
  await page.locator('#global-stop').click();
  await expect(page.locator('#delete-record')).toBeEnabled();
  await page.locator('#delete-record').click();
  await page.locator('#delete-record').click();
  await expect(page.locator('.record-row')).toHaveCount(0);
  expect(await savedRecords(page)).toHaveLength(0);
});

test('successive edits to a standalone note preserve the preceding revision', async ({ page }) => {
  await page.goto('/#sessions');
  await expect(page.locator('#storage-summary')).toContainText('IndexedDB');
  await page.locator('#new-note').click();
  await page.locator('#record-notes').fill('First standalone observation');
  await page.locator('#update-record').click();
  await page.locator('#record-notes').fill('Second standalone observation');
  await page.locator('#update-record').click();
  await expect(page.locator('#record-history')).toContainText('First standalone observation');
  await page.reload();
  await page.locator('.record-row').click();
  await expect(page.locator('#record-notes')).toHaveValue('Second standalone observation');
  await expect(page.locator('#record-history')).toContainText('First standalone observation');
});

test('a complete notebook backup larger than 2 MB can be restored', async ({ page }) => {
  const records = Array.from({ length: 20 }, (_, index) => {
    let record = createSession('imported', '001', 'Synthetic backup ' + index);
    record.endedAt = record.startedAt;
    record.outcome = 'note';
    for (let revision = 0; revision < 6; revision++)
      record = reviseNotes(record, 'Revision ' + revision, 'x'.repeat(19998) + revision);
    return record;
  });
  await page.goto('/#sessions');
  await expect(page.locator('#storage-summary')).toContainText('IndexedDB');
  await page.evaluate(
    (rows) =>
      new Promise((resolve, reject) => {
        const opening = indexedDB.open('sasori-laboratory', 4);
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction('records', 'readwrite');
          for (const record of rows) tx.objectStore('records').put(record);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onabort = () => reject(tx.error);
        };
      }),
    records,
  );
  await page.reload();
  await expect(page.locator('.record-row')).toHaveCount(20);
  const downloading = page.waitForEvent('download');
  await page.locator('#backup').click();
  const text = await readFile(await (await downloading).path(), 'utf8');
  expect(Buffer.byteLength(text)).toBeGreaterThan(2 * 1024 * 1024);
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const opening = indexedDB.open('sasori-laboratory', 4);
        opening.onsuccess = () => {
          const db = opening.result;
          const tx = db.transaction('records', 'readwrite');
          tx.objectStore('records').clear();
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
  );
  await page.reload();
  await expect(page.locator('.record-row')).toHaveCount(0);
  await page.locator('#import-file').setInputFiles({
    name: 'sasori-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(page.locator('.record-row')).toHaveCount(20);
  const restored = await savedRecords(page);
  expect(restored.every((r) => r.noteHistory.length === 5 && r.importedAt)).toBe(true);
});
