import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

async function download(page, selector) {
  const pending = page.waitForEvent('download');
  await page.locator(selector).click();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}
test('privacy demo is explicit, persists evidence, renders notes as text and exports metadata by default', async ({
  page,
}) => {
  await page.goto('/privacy.html');
  await expect(page.locator('#ble-start')).toBeDisabled();
  await page.locator('#optics-demo').click();
  await expect(page.locator('#optics-result')).toContainText('SYNTHETIC');
  await page.locator('#observation-label').fill('<img src=x onerror=alert(1)>');
  await page.locator('#observation-note').fill('Known demo, not a physical detection.');
  await page.locator('#keep-photo').check();
  await page.locator('#save-observation').click();
  await expect(page.locator('#notebook-list li')).toHaveCount(1);
  await expect(page.locator('#notebook-list img')).toHaveCount(0);
  const metadata = await download(page, '#export-notes');
  expect(metadata.observations[0].source).toBe('synthetic');
  expect(metadata.observations[0].hardwareVerified).toBe(false);
  expect(metadata.observations[0].photo).toBeUndefined();
  const photos = await download(page, '#export-photos');
  expect(photos.observations[0].photo).toMatch(/^data:image\/jpeg;base64,/);
  await page.reload();
  await expect(page.locator('#notebook-list li')).toHaveCount(1);
  await expect(page.locator('#notebook-list')).toContainText('<img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: 'Delete observation' }).click();
  await page.getByRole('button', { name: 'Confirm delete' }).click();
  await expect(page.locator('#notebook-list li')).toHaveCount(0);
});
test('camera is never requested on load and denied permission produces recovery instructions', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.cameraRequests = 0;
    Object.defineProperty(navigator, 'mediaDevices', {
      value: {
        getUserMedia: async () => {
          window.cameraRequests++;
          throw new DOMException('denied', 'NotAllowedError');
        },
      },
      configurable: true,
    });
  });
  await page.goto('/privacy.html');
  expect(await page.evaluate(() => window.cameraRequests)).toBe(0);
  await page.locator('#camera-start').click();
  await expect(page.locator('#camera-status')).toContainText('permission');
  expect(await page.evaluate(() => window.cameraRequests)).toBe(1);
  await expect(page.locator('#camera-start')).toBeEnabled();
});
test('native survey starts only on request and strips private backend fields from notebook exports', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.surveyStarts = 0;
    window.surveyStops = 0;
    let sessionId = '';
    const result = () => ({
      sessionId,
      state: 'scanning',
      durationMs: 500,
      devices: [
        {
          alias: 'signal-1',
          rssi: -50,
          minRssi: -60,
          maxRssi: -50,
          samples: 2,
          name: 'private-name',
          id: 'private-id',
          services: ['private-service'],
        },
      ],
    });
    window.SasoriNativeSurvey = {
      startSurvey: async (options) => {
        window.surveyStarts++;
        sessionId = options.sessionId;
        return result();
      },
      getSurvey: async () => result(),
      stopSurvey: async () => {
        window.surveyStops++;
      },
    };
  });
  await page.goto('/privacy.html');
  expect(await page.evaluate(() => window.surveyStarts)).toBe(0);
  await page.locator('#ble-start').click();
  await expect(page.locator('#ble-results')).toContainText('-50');
  await page.locator('#ble-stop').click();
  await expect(page.locator('#ble-start')).toBeEnabled();
  await page.locator('#save-survey').click();
  await expect(page.locator('#notebook-list li')).toHaveCount(1);
  const report = await download(page, '#export-notes');
  expect(JSON.stringify(report)).not.toContain('private-');
  expect(report.observations[0].hardwareVerified).toBe(false);
  expect(await page.evaluate(() => window.surveyStops)).toBeGreaterThan(0);
});
test('privacy workspace is accessible and fits the current viewport', async ({
  page,
}, testInfo) => {
  await page.goto('/privacy.html');
  await page.locator('#optics-demo').click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('privacy-lab.png'), fullPage: true });
});
