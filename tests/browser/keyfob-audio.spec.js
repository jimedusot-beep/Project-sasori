import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('key-fob lab shows limits, waits for permission, measures negative trial and exports evidence', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    window.micCalls = 0;
    window.fakeMicrophoneEnergy = 0;
    window.micStopped = 0;
    window.audioContextConstructed = false;
    window.createdBeforePermission = false;
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          window.micCalls++;
          window.createdBeforePermission = window.audioContextConstructed;
          return {
            getTracks: () => [
              {
                stop: () => {
                  window.micStopped++;
                },
              },
            ],
          };
        },
      },
    });
    class FakeAudioContext {
      constructor() {
        window.audioContextConstructed = true;
      }
      state = 'running';
      resume() {
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
      createMediaStreamSource() {
        return { connect() {} };
      }
      createBiquadFilter() {
        return { type: '', frequency: { value: 0 }, connect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 2048,
          get frequencyBinCount() {
            return this.fftSize / 2;
          },
          smoothingTimeConstant: 0,
          getByteFrequencyData: (array) => array.fill(window.fakeMicrophoneEnergy),
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
  expect(await page.evaluate(() => window.createdBeforePermission)).toBe(true);
  await expect(page.locator('#mic-diagnostics')).toContainText('Permission: granted');
  await expect(page.locator('#mic-diagnostics')).toContainText('Audio engine: running');
  await expect(page.locator('#mic-status')).toContainText('Audio engine running');
  // Confirm real-time detection without running any timed trial.
  await page.evaluate(() => {
    window.fakeMicrophoneEnergy = 170;
  });
  await expect(page.locator('#live-events')).toContainText(/Live clicks detected: [1-9][0-9]*/);
  await expect(page.locator('#live-energy')).toContainText('170');
  await page.evaluate(() => {
    window.fakeMicrophoneEnergy = 0;
  });
  await expect(page.locator('#live-energy')).toContainText('0');
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

test('suspended iPhone audio engine can be resumed from explicit tap', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => ({
          getTracks: () => [{ readyState: 'live', enabled: true, stop() {} }],
        }),
      },
    });
    class SuspendedAudioContext {
      state = 'suspended';
      resume() {
        return Promise.resolve();
      } // Model a WebKit resume that leaves state suspended.
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
      createMediaStreamSource() {
        return { connect() {} };
      }
      createAnalyser() {
        return {
          fftSize: 512,
          smoothingTimeConstant: 0,
          get frequencyBinCount() {
            return this.fftSize / 2;
          },
          getByteFrequencyData: (array) => array.fill(0),
        };
      }
    }
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      value: SuspendedAudioContext,
    });
  });
  await page.goto('/keyfob-lab.html');
  await page.locator('#mic-start').click();
  await expect(page.locator('#mic-status')).toContainText('audio engine is suspended');
  await expect(page.locator('#mic-diagnostics')).toContainText('Audio engine: suspended');
  await expect(page.locator('#mic-resume')).toBeEnabled();
  await page.locator('#mic-resume').click();
  await expect(page.locator('#mic-status')).toContainText('still suspended');
  await page.locator('#mic-stop').click();
  await expect(page.locator('#mic-diagnostics')).toContainText('Audio engine: off');
});
