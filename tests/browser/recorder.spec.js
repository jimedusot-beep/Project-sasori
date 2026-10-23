import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
const fixture = JSON.parse(
  await readFile(
    new URL(
      '../../experiments/protocol-traces/mip-software-version.synthetic.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
async function noRadio(page) {
  await page.addInitScript(() => {
    window.radioCalls = 0;
    Object.defineProperty(navigator, 'bluetooth', {
      value: {
        requestDevice: () => {
          window.radioCalls++;
          throw new Error('Unexpected radio access');
        },
      },
    });
  });
}
test('source-linked recorder decodes the documented fixture, marks observations, measures and compares offline', async ({
  page,
}, testInfo) => {
  await noRadio(page);
  await page.goto('/#recorder');
  await page.locator('#r-example').click();
  await expect(page.locator('#r-inspirations article')).toHaveCount(8);
  await expect(page.locator('#r-summary')).toContainText('1 TX / 1 RX');
  await expect(page.locator('#r-timeline')).toContainText('year 14, month 2, day 27, revision 7');
  await page.locator('#r-plan').click();
  await expect(page.locator('#r-plan-output')).toContainText('offline-only');
  await page.locator('#r-marker-label').fill('Normal play button pressed');
  await page.locator('#r-add-marker').click();
  await expect(page.locator('#r-markers')).toContainText('Normal play button pressed');
  await page.locator('#r-interval').click();
  await expect(page.locator('#r-interval-output')).toContainText('85 ms');
  await expect(page.locator('#r-interval-output')).toContainText('not a verified acknowledgment');
  await page.locator('#r-use-a').click();
  const next = structuredClone(fixture);
  next.label = 'Synthetic second run';
  next.frames[1].hex = '31 34 30 45 30 33 31 42 30 37';
  next.frames[1].tMs = 95;
  await page.locator('#r-input').fill(JSON.stringify(next));
  await page.locator('#r-import').click();
  await page.locator('#r-use-b').click();
  await page.locator('#r-compare').click();
  await expect(page.locator('#r-comparison')).toContainText('changed offsets [5]');
  await expect(page.locator('#r-comparison')).toContainText('not sequence alignment');
  expect(await page.evaluate(() => window.radioCalls)).toBe(0);
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  const timeline = page.locator('#r-timeline');
  await expect(timeline).toHaveAttribute('tabindex', '0');
  expect(
    await timeline.locator('table').evaluate((el) => el.getBoundingClientRect().width),
  ).toBeGreaterThanOrEqual(680);
  await page.locator('#r-timeline-title').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('protocol-recorder.png') });
});
test('raw trace retention is explicit; reload and notebook backups preserve metadata policy', async ({
  page,
}) => {
  await noRadio(page);
  await page.goto('/#recorder');
  await page.locator('#r-example').click();
  let pending = page.waitForEvent('download');
  await page.locator('#r-export').click();
  let data = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(data.frames[0]).not.toHaveProperty('hex');
  expect(data.payloadsIncluded).toBe(false);
  await page.locator('#r-keep-raw').check();
  await page.locator('#r-save').click();
  await expect(page.locator('#r-saved button')).toHaveCount(1);
  await page.reload();
  await page.locator('#r-saved button').click();
  await expect(page.locator('#r-keep-raw')).not.toBeChecked();
  await expect(page.locator('#r-timeline')).toContainText('Documented software version query');
  await page.getByRole('button', { name: /^Research records/ }).click();
  pending = page.waitForEvent('download');
  await page.locator('#backup').click();
  data = JSON.parse(await readFile(await (await pending).path(), 'utf8'));
  expect(data.records[0].protocolTrace.frames[1]).not.toHaveProperty('hex');
  expect(data.records[0].protocolTrace.frames[1].length).toBe(10);
  await page.getByRole('button', { name: 'Protocol recorder', exact: true }).click();
  await page.locator('#r-adapter').selectOption('elmo-l2l');
  await expect(page.locator('#r-plan')).toBeDisabled();
  await expect(page.locator('#r-readiness')).toContainText('Authentication construction');
  expect(await page.evaluate(() => window.radioCalls)).toBe(0);
});
test('invalid and inert imports cannot overwrite a loaded trace or enable hardware', async ({
  page,
}) => {
  await noRadio(page);
  await page.goto('/#recorder');
  await page.locator('#r-example').click();
  await page.locator('#r-file').setInputFiles({
    name: 'capture.pcap',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from('binary pcap unsupported'),
  });
  await expect(page.locator('#r-status')).toContainText('Binary btsnoop/PCAP');
  await expect(page.locator('#r-summary')).toContainText('1 TX / 1 RX');
  const next = structuredClone(fixture);
  next.label = '<img src=x onerror="window.executed=true">';
  next.hardwareVerified = true;
  await page.locator('#r-input').fill(JSON.stringify(next));
  await page.locator('#r-import').click();
  await page.locator('#r-save').click();
  await expect(page.locator('#r-saved')).toContainText('<img src=x');
  expect(await page.evaluate(() => window.executed)).toBeUndefined();
  expect(await page.evaluate(() => window.radioCalls)).toBe(0);
});
test('current Sasori session handoff preserves RX-only and synthetic evidence', async ({
  page,
}) => {
  await noRadio(page);
  await page.goto('/');
  await page.locator('#simulation').check();
  await page.locator('#connect').click();
  await expect(page.locator('#state')).toHaveText('Disconnected');
  await page.getByRole('button', { name: 'Protocol recorder', exact: true }).click();
  await page.locator('#r-current-session').click();
  await expect(page.locator('#r-summary')).toContainText('0 TX / 3 RX');
  await expect(page.locator('#r-summary')).toContainText('SYNTHETIC');
  await expect(page.locator('#r-interval')).toBeDisabled();
  expect(await page.evaluate(() => window.radioCalls)).toBe(0);
});
