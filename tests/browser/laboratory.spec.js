import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { createSession } from '../../site/lib/records.js';
test('simulation saves a labeled session that survives reload', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#storage-summary')).toContainText('IndexedDB', { visible: false });
  await page.locator('#simulation').check();
  await page.locator('#connect').click();
  await expect(page.locator('#session-source')).toHaveText('SIMULATED SESSION');
  await expect(page.locator('#state')).toHaveText('Disconnected');
  await expect(page.locator('#packet-count')).toContainText('3');
  await expect(page.locator('#autosave-status')).toContainText('Saved on this browser');
  await page.getByRole('button', { name: 'Research records' }).click();
  await expect(page.locator('.record-row')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.record-row')).toHaveCount(1);
  await page.locator('.record-row').click();
  await expect(page.locator('#record-meta')).toContainText('SIMULATED');
  expect(errors).toEqual([]);
});
test('research notes, search and backup/import form a working local workflow', async ({ page }) => {
  await page.goto('/#sessions');
  await page.locator('#new-note').click();
  await page.locator('#record-title').fill('Bench observation');
  await page.locator('#record-notes').fill('No motor control established.');
  await page.locator('#update-record').click();
  await page.locator('#record-search').fill('motor');
  await expect(page.locator('.record-row')).toHaveCount(1);
  const download = page.waitForEvent('download');
  await page.locator('#backup').click();
  expect((await download).suggestedFilename()).toBe('sasori-backup.json');
  await page.locator('#import-file').setInputFiles({
    name: 'research.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('time,observation\n1,quiet'),
  });
  await page.locator('#record-search').fill('');
  await expect(page.locator('.record-row')).toHaveCount(2);
});
test('imported diagnostic details cannot leak through a metadata-only backup', async ({ page }) => {
  const record = createSession('imported');
  const hidden = 'synthetic-private-byte-capture';
  record.events = [
    {
      timestamp: record.startedAt,
      level: 'info',
      message: 'Capture summary',
      details: { raw: hidden },
    },
  ];
  record.stats.extra = hidden;
  await page.goto('/#sessions');
  await page.locator('#import-file').setInputFiles({
    name: 'session.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(record)),
  });
  await expect(page.locator('.record-row')).toHaveCount(1);
  const downloading = page.waitForEvent('download');
  await page.locator('#backup').click();
  const path = await (await downloading).path();
  expect(path).toBeTruthy();
  const text = await readFile(path, 'utf8');
  expect(text).not.toContain(hidden);
  const exported = JSON.parse(text);
  expect(exported.payloadPolicy).toBe('metadata-only');
  expect(exported.records[0].events[0].message).toBe('Capture summary');
  expect(exported.records[0].importedAt).toBeTruthy();
});
test('imported markup stays inert and malformed JSON does not partially import', async ({
  page,
}) => {
  await page.goto('/#sessions');
  await page.locator('#import-file').setInputFiles({
    name: 'unsafe.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('<img src=x onerror="window.sasoriInjected=true">'),
  });
  await expect(page.locator('.record-row')).toHaveCount(1);
  await page.locator('.record-row').click();
  expect(await page.evaluate(() => window.sasoriInjected)).toBeUndefined();
  await page.locator('#import-file').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await expect(page.locator('#notice')).toContainText('not valid');
  await expect(page.locator('.record-row')).toHaveCount(1);
});
test('synthetic authentication and virtual controls cannot start Bluetooth', async ({ page }) => {
  await page.goto('/#protocol');
  await page.locator('#auth-run').click();
  await expect(page.locator('#auth-state')).toContainText('SYNTHETIC · success');
  await page.getByRole('button', { name: 'Control laboratory' }).click();
  await page.locator('#play-sequence').click();
  await expect(page.locator('#virtual-status')).toContainText('SIMULATED');
  await page.locator('#stop-sequence').click();
  await expect(page.locator('#virtual-status')).toContainText('stopped');
  await expect(page.locator('#state')).toHaveText('Idle');
});
test('invalid packet flags reject a whole backup without saving partial records', async ({
  page,
}) => {
  const valid = createSession('simulated');
  const invalid = createSession('simulated');
  invalid.packets = [
    {
      timestamp: invalid.startedAt,
      characteristic: 'unknown',
      length: 2,
      kind: 'unknown',
      truncated: 'false',
      malformed: false,
    },
  ];
  await page.goto('/#sessions');
  await expect(page.locator('#storage-summary')).toContainText('IndexedDB', { visible: false });
  await page.locator('#import-file').setInputFiles({
    name: 'synthetic-invalid-flags.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        format: 'sasori.backup',
        schemaVersion: 2,
        records: [valid, invalid],
      }),
    ),
  });
  await expect(page.locator('#notice')).toContainText('Invalid packet flags');
  await expect(page.locator('.record-row')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#storage-summary')).toContainText('IndexedDB', { visible: false });
  await expect(page.locator('.record-row')).toHaveCount(0);
});
test('all primary screens meet axe accessibility checks and fit the viewport', async ({ page }) => {
  for (const section of ['overview', 'protocol', 'toys', 'sessions', 'controls', 'research']) {
    await page.goto('/#' + section);
    await expect(page.locator('#storage-summary')).toContainText('IndexedDB', { visible: false });
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(result.violations).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.screenshot({
      path: 'test-results/' + test.info().project.name + '-' + section + '.png',
      fullPage: true,
    });
  }
});
test('preserved offline analysis labels historical bytes without authentication claims', async ({
  page,
}) => {
  await page.goto('/#protocol');
  await page.locator('#packet-sample').click();
  await expect(page.locator('#packet-result')).toContainText('NewModeIdx:12');
  await expect(page.locator('#packet-result')).toContainText('"verifiedCommand": false');
  await page.locator('#packet-hex').fill('not-hex');
  await page.locator('#packet-decode').click();
  await expect(page.locator('#packet-result')).toContainText('Cannot decode');
});

test('manual Elmo probes change only the selected candidate UUID; never start hardware', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#load-profile').click();
  await expect(page.locator('#notify-preset')).toHaveValue('data');
  await page.locator('#notify-preset').selectOption('control');
  await expect(page.locator('#notify')).toHaveValue('dab90756-b5a1-e29c-b041-bcd562613bdf');
  await page.locator('#notify-preset').selectOption('p2p');
  await expect(page.locator('#notify')).toHaveValue('dab91440-b5a1-e29c-b041-bcd562613bdf');
  await page.locator('#notify-preset').selectOption('metadata');
  await expect(page.locator('#notify')).toHaveValue('');
  await page.locator('#uuid-settings summary').click();
  await page.locator('#notify').fill('dab91382-b5a1-e29c-b041-bcd562613bdf');
  await expect(page.locator('#notify-preset')).toHaveValue('data');
  await expect(page.locator('#state')).toHaveText('Idle');
  await expect(page.locator('#inspection-stage')).toContainText('No inspection started');
});
