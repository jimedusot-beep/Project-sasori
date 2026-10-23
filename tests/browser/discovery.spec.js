import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { syntheticWav } from '../helpers/audio.mjs';

async function open(page) {
  await page.goto('/#discovery');
  await expect(page.locator('#d-storage')).toContainText('Saved on this browser');
  await page.locator('#d-device').fill('Synthetic model / revision 1');
  await page.locator('#d-label').fill('Synthetic baseline');
  await page.locator('#d-source').fill('Software fixture. No physical observation.');
}
async function analyze(page, values) {
  await page.locator('#d-values').fill(values);
  await page.locator('#d-analyze').click();
  await expect(page.locator('#d-save')).toBeEnabled();
}
async function chooseFile(page, id, file) {
  const choosing = page.waitForEvent('filechooser');
  await page.locator(id).click();
  await (await choosing).setFiles(file);
}
test('byte comparison, private retention, metadata backup, and imported copies survive reload', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  await analyze(page, '00 10 ff');
  await page.locator('#d-use-first').click();
  await page.locator('#d-keep-values').check();
  await page.locator('#d-save').click();
  await expect(page.locator('.discovery-record')).toHaveCount(1);
  await expect(page.locator('#d-keep-values')).not.toBeChecked();
  await page.locator('#d-label').fill('Synthetic changed action');
  await analyze(page, '00 11 ff 20');
  await page.locator('#d-use-second').click();
  await page.locator('#d-compare').click();
  await expect(page.locator('#d-comparison')).toContainText('2 differences');
  await expect(page.locator('.diff-table tbody tr')).toHaveCount(2);
  await page.locator('#d-save').click();
  await expect(page.locator('.discovery-record')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.discovery-record')).toHaveCount(2);
  const privateCard = page
    .locator('.discovery-record')
    .filter({ hasText: 'Raw values saved locally' });
  await expect(privateCard.getByRole('button', { name: 'Use as A', exact: true })).toBeEnabled();
  const metadataCard = page.locator('.discovery-record').filter({ hasText: 'Metadata only;' });
  await expect(metadataCard.getByRole('button', { name: 'Use as A', exact: true })).toBeDisabled();
  const downloading = page.waitForEvent('download');
  await page.locator('#d-export').click();
  const text = await readFile(await (await downloading).path(), 'utf8');
  const backup = JSON.parse(text);
  expect(backup.records.every((r) => r.values === null && !r.payloadsIncluded)).toBe(true);
  await chooseFile(page, '#d-import', {
    name: 'metadata.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(page.locator('.discovery-record')).toHaveCount(4);
  await expect(
    page.locator('.discovery-record').filter({ hasText: 'IMPORTED CLAIM / SYNTHETIC' }),
  ).toHaveCount(2);
  await page
    .locator('.discovery-record')
    .filter({ hasText: 'IMPORTED CLAIM' })
    .first()
    .getByRole('button', { name: 'Delete capture', exact: true })
    .click();
  await page.getByRole('button', { name: 'Confirm capture deletion', exact: true }).click();
  await expect(page.locator('.discovery-record')).toHaveCount(3);
  expect(errors).toEqual([]);
});
test('pulse comparisons respect tolerance and reject cross-model inference', async ({ page }) => {
  await open(page);
  await page.locator('#d-method').selectOption('infrared');
  await page.locator('#d-kind').selectOption('pulses');
  await analyze(page, '9000 4500 560');
  await page.locator('#d-use-first').click();
  await analyze(page, '9100 4601 560');
  await page.locator('#d-use-second').click();
  await page.locator('#d-compare').click();
  await expect(page.locator('#d-comparison')).toContainText('1 differences');
  await page.locator('#d-tolerance').fill('0');
  await expect(page.locator('#d-comparison')).toBeEmpty();
  await page.locator('#d-compare').click();
  await expect(page.locator('#d-comparison')).toContainText('2 differences');
  await page.locator('#d-device').fill('Different toy');
  await page.locator('#d-analyze').click();
  await page.locator('#d-use-second').click();
  await page.locator('#d-compare').click();
  await expect(page.locator('#discovery-status')).toContainText('same exact device model');
});
test('local WAV inspection plots synthetic audio and saves only a summary', async ({ page }) => {
  await open(page);
  await page.locator('#d-method').selectOption('sound');
  await chooseFile(page, '#d-wav', {
    name: 'synthetic-sine.wav',
    mimeType: 'audio/wav',
    buffer: Buffer.from(syntheticWav()),
  });
  await page.locator('#d-inspect-wav').click();
  await expect(page.locator('#d-audio-result')).toContainText('1000.0 Hz');
  await expect(page.locator('#d-waveform')).toBeVisible();
  await expect(page.locator('#d-spectrum')).toBeVisible();
  await page.locator('#d-save-audio').click();
  await expect(page.locator('.discovery-record')).toHaveCount(1);
  await expect(page.locator('.discovery-record')).toContainText('Metadata only');
  await page.reload();
  await expect(page.locator('.discovery-record')).toContainText('1000.0 Hz');
  await expect(page.locator('#d-waveform')).toBeHidden();
  await page
    .locator('#d-wav')
    .setInputFiles({ name: 'bad.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid') });
  await page.locator('#d-method').selectOption('sound');
  await page.locator('#d-inspect-wav').click();
  await expect(page.locator('#discovery-status')).toContainText('PCM16 WAV file');
  await expect(page.locator('#d-save-audio')).toBeDisabled();
});
test('analysis never starts hardware, and malformed imports and markup remain inert', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.discoveryBluetoothCalls = 0;
    Object.defineProperty(navigator, 'bluetooth', {
      value: {
        requestDevice() {
          window.discoveryBluetoothCalls++;
          throw new Error('Unexpected hardware request');
        },
      },
    });
  });
  await open(page);
  await page.locator('#d-label').fill('<img src=x onerror="window.discoveryInjected=true">');
  await analyze(page, '00 ff');
  await page.locator('#d-save').click();
  await expect(page.locator('.discovery-record h3')).toContainText('<img');
  await expect(page.locator('.discovery-record img')).toHaveCount(0);
  const downloading = page.waitForEvent('download');
  await page.locator('#d-export').click();
  const backup = JSON.parse(await readFile(await (await downloading).path(), 'utf8'));
  backup.records.push({ ...backup.records[0], values: [1], payloadsIncluded: false });
  await page.locator('#d-import').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator('#discovery-status')).toContainText('payload policy');
  await expect(page.locator('.discovery-record')).toHaveCount(1);
  expect(await page.evaluate(() => window.discoveryBluetoothCalls)).toBe(0);
  expect(await page.evaluate(() => window.discoveryInjected)).toBeUndefined();
  await page.reload();
  await expect(page.locator('.discovery-record')).toHaveCount(1);
});
