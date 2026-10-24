import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';

test('synthetic Atlas compares positions without touching Bluetooth or local storage', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.atlasRadioCalls = 0;
    Object.defineProperty(navigator, 'bluetooth', {
      value: {
        requestDevice() {
          window.atlasRadioCalls++;
          throw new Error('Atlas must not call Bluetooth.');
        },
      },
    });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/signal-atlas.html');
  await expect(page.locator('#status')).toContainText('Discovery captures available');
  await page.locator('#demo').click();
  await expect(page.locator('#status')).toContainText('Synthetic demonstration only');
  await expect(page.locator('.cell')).toHaveCount(6);
  await expect(page.locator('.cell.variable')).toHaveCount(1);
  await expect(page.locator('.cell.partial')).toHaveCount(1);
  await page.locator('#compare').click();
  await expect(page.locator('#pair-results')).toContainText('2 differences');
  expect(await page.evaluate(() => window.atlasRadioCalls)).toBe(0);
  await page.locator('#refresh').click();
  await expect(page.locator('#status')).toContainText('0 Discovery captures');
  await expect(page.locator('.cell')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('manual captures persist in existing Discovery, retention opt-in, and aggregate export omits identifiers', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/signal-atlas.html');
  await page.locator('#label').fill('<img src=x onerror="window.atlasInjected=true">');
  await page.locator('#model').fill('Private Model SN123');
  await page.locator('#source').fill('Private bench notes.');
  await page.locator('#values').fill('10 20 30 40');
  await page.locator('#retain').check();
  await page.locator('#save').click();
  await expect(page.locator('#status')).toContainText('Raw values are retained');
  await expect(page.locator('#retain')).not.toBeChecked();
  await page.locator('#label').fill('Another trial');
  await page.locator('#values').fill('10 20 FF 40');
  await page.locator('#retain').check();
  await page.locator('#save').click();
  await expect(page.locator('.cell.variable')).toHaveCount(1);
  await page.reload();
  await expect(page.locator('.cell.variable')).toHaveCount(1);
  await page.locator('#compare').click();
  await expect(page.locator('#pair-results')).toContainText('1 differences');
  const pending = page.waitForEvent('download');
  await page.locator('#export').click();
  const report = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(report.format).toBe('sasori.signal-atlas-summary');
  expect(report.groups[0].counts.retained).toBe(2);
  for (const forbidden of [
    'Private Model',
    'Private bench notes',
    'SN123',
    '<img',
    'values',
    '10 20',
  ]) {
    expect(JSON.stringify(report)).not.toContain(forbidden);
  }
  expect(await page.evaluate(() => window.atlasInjected)).toBeUndefined();
  await page.goto('/#discovery');
  await expect(page.locator('.discovery-record')).toHaveCount(2);
  expect(errors).toEqual([]);
});

test('metadata-only records cannot be compared, malformed import does not mutate notebook', async ({
  page,
}) => {
  await page.goto('/signal-atlas.html');
  await page.locator('#label').fill('Metadata fixture');
  await page.locator('#model').fill('Simulated receiver rev 2');
  await page.locator('#source').fill('No physical testing.');
  await page.locator('#values').fill('FF 00');
  await page.locator('#save').click();
  await expect(page.locator('#status')).toContainText('Only metadata');
  await expect(page.locator('#compare')).toBeDisabled();
  const backup = {
    format: 'sasori.discoveries',
    schemaVersion: 1,
    payloadPolicy: 'metadata-only',
    records: [
      {
        format: 'sasori.discovery',
        schemaVersion: 1,
        id: 'discovery-example1',
        label: 'Broken import',
        deviceModel: 'Receiver rev 2',
        sourceNote: 'Synthetic fake',
        kind: 'bytes',
        method: 'ble',
        evidence: 'synthetic',
        createdAt: new Date().toISOString(),
        importedAt: null,
        payloadsIncluded: false,
        values: [255],
        summary: { count: 1, unique: 1 },
      },
    ],
  };
  await page.locator('#backup').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.locator('#import').click();
  await expect(page.locator('#status')).toContainText('payload policy');
  await page.locator('#refresh').click();
  await expect(page.locator('#stats')).toContainText('1');
  await expect(page.locator('#compare')).toBeDisabled();
});

test('mobile Signal Atlas has no overflow and passes automated accessibility audit', async ({
  page,
}) => {
  await page.goto('/signal-atlas.html');
  await expect(page.locator('#save')).toBeEnabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  for (const id of ['demo', 'refresh', 'save', 'compare']) {
    expect(
      await page.locator('#' + id).evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
  }
  const report = await new AxeBuilder({ page }).analyze();
  expect(report.violations).toEqual([]);
});
