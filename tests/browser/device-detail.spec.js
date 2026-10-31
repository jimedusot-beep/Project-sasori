import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Hub reuses the selected adapter and explains demo results without Bluetooth', async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    window.unexpectedRadio = 0;
    Object.defineProperty(navigator, 'bluetooth', {
      value: {
        requestDevice() {
          window.unexpectedRadio++;
          throw new Error('Unexpected Bluetooth request');
        },
      },
    });
  });
  await page.goto('/hub.html');
  const detail = page.getByRole('region', { name: 'Device details' });
  await expect(detail.locator('[data-detail-field="lastAction"]')).toHaveText('No action recorded');
  await page.locator('#hub-demo').click();
  await expect(detail.locator('[data-detail-field="progress"]')).toHaveText('Demo ready');
  await expect(detail.locator('[data-detail-field="physical"]')).toHaveText(
    'Not independently verified',
  );
  await page.locator('#hub-sound').click();
  await expect(detail.locator('[data-detail-field="outcome"]')).toHaveText(
    'Demo only · no physical command sent',
  );
  await expect(detail.locator('[data-detail-guidance]')).toContainText(
    'without sending a device command',
  );
  await expect(page.locator('#quick-stop')).toBeVisible();
  await page.screenshot({ path: info.outputPath('device-detail-hub-phone.png'), fullPage: true });
  await page.locator('#quick-stop').click();
  await expect(page.locator('#sticky-session')).toBeHidden();
  expect(await page.evaluate(() => window.unexpectedRadio)).toBe(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('Elmo legacy remote shares device details and keeps Stop reachable in demo', async ({
  page,
}, info) => {
  await page.goto('/elmo.html');
  const detail = page.getByRole('region', { name: 'Device details' });
  await expect(detail.locator('[data-detail-field="progress"]')).toHaveText('Not connected');
  await page.locator('#elmo-demo').click();
  await expect(detail.locator('[data-detail-field="progress"]')).toHaveText('Demo ready');
  await expect(page.locator('#elmo-connect')).toHaveText('Demo ready');
  await expect(page.locator('#elmo-sticky-session')).toBeVisible();
  await page.locator('#elmo-greet').click();
  await expect(detail.locator('[data-detail-field="lastAction"]')).toHaveText('Greeting request');
  await expect(detail.locator('[data-detail-field="outcome"]')).toContainText(
    'no physical command sent',
  );
  await page.screenshot({ path: info.outputPath('device-detail-elmo-phone.png'), fullPage: true });
  await page.locator('#elmo-sticky-stop').click();
  await expect(page.locator('#elmo-sticky-session')).toBeHidden();
  await expect(page.locator('#elmo-greet')).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
