import { test, expect } from '@playwright/test';

// These are software browser checks, not real VoiceOver or physical hardware evidence.
// Every demo must stay offline, expose a keyboard-operable Stop, and fit small screens.
// Emulated landscape coverage is not evidence of real iPhone rotation or VoiceOver.
const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 800 },
  { width: 844, height: 390 },
];
const surfaces = [
  {
    name: 'Hub',
    route: '/hub.html',
    demo: '#hub-demo',
    stop: '#quick-stop',
  },
  {
    name: 'Elmo Remote',
    route: '/elmo.html',
    demo: '#elmo-demo',
    stop: '#elmo-sticky-stop',
  },
  {
    name: 'Pocket IR',
    route: '/pocket-ir.html',
    demo: '#demo',
    stop: '#disconnect',
    prepare: '#prepare',
  },
];

for (const surface of surfaces) {
  test(`${surface.name}: portrait and landscape demo/Stop work with keyboard and no radio`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.unexpectedDeviceRequests = 0;
      Object.defineProperty(navigator, 'bluetooth', {
        configurable: true,
        value: {
          requestDevice() {
            window.unexpectedDeviceRequests++;
            throw new Error('Offline demo tried to request real Bluetooth');
          },
        },
      });
    });

    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      // Exercise both native keyboard activation keys, not just Enter.
      const activateKey = viewport.width === 390 ? 'Space' : 'Enter';
      await page.goto(surface.route);
      const detail = page.getByRole('region', { name: 'Device details' });
      await expect(detail).toBeVisible();
      await expect(detail.locator('[data-detail-field="progress"]')).toHaveText('Not connected');
      await expect(detail.locator('[data-detail-field="physical"]')).toHaveText(
        'Not independently verified',
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);

      const demo = page.locator(surface.demo);
      await expect(demo).toBeEnabled();
      await demo.focus();
      await expect(demo).toBeFocused();
      await page.keyboard.press(activateKey);
      if (surface.prepare) {
        const prepare = page.locator(surface.prepare);
        await expect(prepare).toBeEnabled();
        await prepare.focus();
        await page.keyboard.press(activateKey);
      }
      await expect(detail.locator('[data-detail-field="progress"]')).toHaveText('Demo ready');

      const stop = page.locator(surface.stop);
      await expect(stop).toBeVisible();
      await expect(stop).toBeEnabled();
      await stop.focus();
      await expect(stop).toBeFocused();
      await page.keyboard.press(activateKey);
      await expect(detail.locator('[data-detail-field="progress"]')).not.toHaveText('Demo ready');
      await expect(detail.locator('[data-detail-field="physical"]')).toHaveText(
        'Not independently verified',
      );
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
      ).toBe(true);
      expect(await page.evaluate(() => window.unexpectedDeviceRequests)).toBe(0);
    }
  });
}

test('hosted companion settings stay unavailable and fit portrait/landscape', async ({ page }) => {
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.goto('/companion.html');
    await expect(page.locator('#setup-message')).toContainText(/127\.0\.0\.1|localhost/);
    await expect(page.locator('#setup-message')).toContainText(
      'Credentials cannot be entered on the hosted site',
    );
    for (const selector of ['#setup-pin', '#ha-url', '#ha-token', '#ha-remember', '#save-ha']) {
      await expect(page.locator(selector)).toBeDisabled();
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
  }
});
