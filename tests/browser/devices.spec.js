import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ELMO_SERVICE, ELMO_NOTIFY } from '../../site/lib/profiles.js';
import { createSession } from '../../site/lib/records.js';
import { makeInspection } from '../../site/lib/devices.js';

test('unsupported browsers get an integrated setup guide; simulation transfers directly to Discovery', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'bluetooth', { value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async (text) => {
          window.copiedSasoriLink = text;
        },
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('#hub-browser-title')).toContainText('cannot connect');
  await expect(page.locator('#hub-browser-help')).toHaveAttribute('open', '');
  await expect(page.locator('#connect')).toBeDisabled();
  await page.locator('#hub-copy-url').click();
  expect(await page.evaluate(() => window.copiedSasoriLink)).toBe(
    'https://jimedusot-beep.github.io/Project-sasori/#overview',
  );
  await page.locator('#simulation').check();
  await expect(page.locator('#hub-browser-help')).toBeHidden();
  await page.locator('#connect').click();
  await expect(page.locator('#state')).toHaveText('Disconnected');
  await expect(page.locator('#hub-evidence-count')).toContainText('0 / 5');
  await page.locator('#hub-analyze-last').click();
  await expect(page.locator('#page-discovery')).toBeVisible();
  await expect(page.locator('#d-evidence')).toHaveValue('synthetic');
  await expect(page.locator('#d-result')).toContainText('SYNTHETIC');
  await expect(page.locator('#d-source')).toHaveValue(/Local Sasori session/);
});

test('native bridge connection, live status, timing, and stop reuse the Sasori workspace', async ({
  page,
}) => {
  await page.addInitScript(
    ({ service, notify }) => {
      window.nativeCalls = [];
      window.nativeListeners = {};
      window.SasoriNativeBluetooth = {
        addListener: async (name, callback) => {
          window.nativeListeners[name] = callback;
          return {
            remove: async () => {
              delete window.nativeListeners[name];
            },
          };
        },
        requestDevice: async (options) => {
          window.nativeCalls.push(['choose', options]);
          return { id: 'synthetic-native-id', name: 'Synthetic native device' };
        },
        connect: async () => {
          window.nativeCalls.push(['connect']);
        },
        getService: async () => ({ uuid: service }),
        getCharacteristics: async () => ({
          characteristics: [{ uuid: notify, properties: ['notify'] }],
        }),
        startNotifications: async () => {
          window.nativeCalls.push(['subscribe']);
        },
        disconnect: async () => {
          window.nativeCalls.push(['disconnect']);
        },
        shareFile: async (file) => {
          window.nativeExport = file;
        },
      };
    },
    { service: ELMO_SERVICE, notify: ELMO_NOTIFY },
  );
  await page.goto('/');
  await expect(page.locator('#hub-browser-title')).toContainText('Native iPhone Bluetooth ready');
  expect(await page.evaluate(() => window.nativeCalls.length)).toBe(0);
  await page.locator('#connection-task').selectOption('capture');
  await page.locator('#consent').check();
  await page.locator('#connect').click();
  await expect(page.locator('#state')).toHaveText('Inspecting');
  await expect(page.locator('#hub-current-title')).toHaveText('Synthetic native device');
  await page.evaluate(
    (uuid) =>
      window.nativeListeners.notification({ id: 'synthetic-native-id', uuid, hex: '0102ff' }),
    ELMO_NOTIFY,
  );
  await page.getByRole('button', { name: 'Protocol explorer', exact: true }).click();
  await expect(page.locator('#hub-timeline tbody tr')).toHaveCount(1);
  await page.locator('#global-stop').click();
  await expect(page.locator('#state')).toHaveText('Disconnected');
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.locator('#hub-current-title')).toHaveText('No active connection');
  await page.locator('#export-json').click();
  const exported = await page.evaluate(() => JSON.parse(window.nativeExport.text));
  expect(exported.inspection.transport).toBe('core-bluetooth');
  expect(exported.inspection.gattDurationMs).toBeGreaterThanOrEqual(0);
  expect(exported.payloadsIncluded).toBe(false);
  expect(exported.packets[0].hex).toBeUndefined();
  expect(await page.evaluate(() => Object.keys(window.nativeListeners).length)).toBe(0);
});

test('device identities persist and research note revisions survive reload and export', async ({
  page,
}) => {
  await page.goto('/#toys');
  await expect(page.locator('#toy-save')).toBeEnabled();
  await page.locator('#toy-name').fill('Synthetic test device');
  await page.locator('#toy-model').fill('Synthetic model');
  await page.locator('#toy-revision').fill('B');
  await page.locator('#toy-firmware').fill('1.2');
  await page.locator('#toy-prefix').fill('Fixture');
  await page.locator('#toy-service').fill(ELMO_SERVICE);
  await page.locator('#toy-source-note').fill('Synthetic source for software tests.');
  await page.locator('#toy-save').click();
  await expect(page.locator('.toy-profile')).toContainText(
    'Synthetic model · board B · firmware 1.2',
  );
  await expect(page.locator('[data-device-state]')).toHaveText('Not connected');
  await page.getByRole('button', { name: 'Load for inspection', exact: true }).click();
  await page.locator('#simulation').check();
  await page.locator('#connect').click();
  await expect(page.locator('#state')).toHaveText('Disconnected');
  await page.getByRole('button', { name: 'Research records' }).click();
  await page.locator('.record-row').click();
  await page.locator('#record-notes').fill('First observation');
  await page.locator('#update-record').click();
  await page.locator('#record-notes').fill('Revised observation');
  await page.locator('#update-record').click();
  await page.reload();
  await expect(page.locator('.record-row')).toHaveCount(1);
  await page.locator('.record-row').click();
  await expect(page.locator('#record-history')).toContainText('First observation');
  const downloading = page.waitForEvent('download');
  await page.locator('#export-record').click();
  const record = JSON.parse(await readFile(await (await downloading).path(), 'utf8'));
  expect(record.inspection.model).toBe('Synthetic model');
  expect(record.inspection.revision).toBe('B');
  expect(record.noteHistory.some((r) => r.notes === 'First observation')).toBe(true);
});

test('imported claims cannot complete the physical inspection checklist', async ({ page }) => {
  const record = createSession('live', '001', 'Synthetic test of an imported live claim');
  record.endedAt = record.startedAt;
  record.outcome = 'inspection-complete';
  record.inspection = {
    ...makeInspection({ label: 'Love2Learn Elmo · B6572' }, ELMO_SERVICE, ELMO_NOTIFY),
    gattDurationMs: 15000,
  };
  record.services = [
    {
      uuid: ELMO_SERVICE,
      evidence: 'observed-this-session',
      characteristics: [
        { uuid: ELMO_NOTIFY, evidence: 'observed-this-session', properties: ['notify'] },
      ],
    },
  ];
  await page.goto('/#sessions');
  await page.locator('#import-file').setInputFiles({
    name: 'claimed-live.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(record)),
  });
  await expect(page.locator('.record-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.locator('#hub-evidence-count')).toContainText('0 / 5');
});
