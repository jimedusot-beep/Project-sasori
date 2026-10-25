import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('key-fob lab shows limits, waits for permission, measures negative trial and exports evidence', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    window.micCalls = 0;
    window.micStopped = 0;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          window.micCalls++;
          return { getTracks: () => [{ stop: () => { window.micStopped++; } }] };
        },
      },
    });
    class FakeAudioContext {
      state = 'running';
      resume() { return Promise.resolve(); }
      close() { this.state = 'closed'; return Promise.resolve(); }
      createMediaStreamSource() { return { connect() {} }; }
      createBiquadFilter() { return { type: '', frequency: { value: 0 }, connect() {} }; }
      createAnalyser() {
        return {
          fftSize: 2048, smoothingTimeConstant: 0,
          getByteTimeDomainData: (array) => array.fill(128),
        };
      }
    }
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });
  });
  await page.goto('/keyfob-lab.html');
  await expect(page.getByRole('heading', { name: /Does the phone hear/i })).toBeVisible();
  await expect(page.locator('#trial-start')).toBeDisabled();
  expect(await page.evaluate(() => window.micCalls)).toBe(0);
  await page.locator('#mic-start').click();
  await expect(page.locator('#trial-start')).toBeEnabled({ timeout: 7000 });
  expect(await page.evaluate(() => window.micCalls)).toBe(1);
  await page.locator('#condition').selectOption('quiet');
  await page.locator('#trial-start').click();
  await expect(page.locator('#trial-status')).toHaveText('No sound detected', { timeout: 9000 });
  await expect(page.locator('#trial-summary')).toContainText('0/1');
  await expect(page.locator('#verdict')).toContainText('Not enough evidence');
  const downloadPromise = page.waitForEvent('download');
  await page.locator('#export-json').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('sasori-keyfob-acoustic-trials.json');
  await page.locator('#mic-stop').click();
  await expect(page.locator('#mic-status')).toContainText('Microphone stopped');
  expect(await page.evaluate(() => window.micStopped)).toBe(1);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('keyfob-audio-lab.png'), fullPage: true });
});

test('microphone errors do not claim fob radio access', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });
  await page.goto('/keyfob-lab.html');
  await page.locator('#mic-start').click();
  await expect(page.locator('#mic-status')).toContainText('Microphone unavailable');
  await expect(page.locator('#trial-start')).toBeDisabled();
  await expect(page.locator('#mic-start')).toBeEnabled();
});
