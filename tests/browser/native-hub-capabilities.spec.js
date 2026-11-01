import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('native iPhone Hub exposes only bridge-backed live families, with Demo fallback', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.nativeCalls = [];
    window.SasoriNativeBluetooth = {
      addListener: async (name) => {
        window.nativeCalls.push('listen:' + name);
        return { remove: async () => {} };
      },
      requestDevice: async () => {
        window.nativeCalls.push('request');
        throw new Error('Do not request a device in this test.');
      },
      disconnect: async () => {
        window.nativeCalls.push('disconnect');
      },
    };
    Object.defineProperty(navigator, 'bluetooth', { configurable: true, value: undefined });
  });
  await page.goto('/hub.html');
  await expect(page.locator('#hub-connect')).toBeDisabled();
  await expect(page.locator('#platform-support')).toContainText('Native Elmo');
  await expect(page.locator('#hub-detect')).toBeDisabled();
  await page.locator('[data-family="furby-connect/v1"]').click();
  await expect(page.locator('#hub-connect')).toBeDisabled();
  await expect(page.locator('#platform-support')).toContainText('unavailable');
  await page.locator('[data-family="ble-standard/v1"]').click();
  await expect(page.locator('#hub-connect')).toBeEnabled();
  await expect(page.locator('#platform-support')).toContainText('Native iPhone');
  await page.locator('[data-family="wowwee-mip/v1"]').click();
  await expect(page.locator('#hub-connect')).toBeEnabled();
  await page.locator('[data-family="elmo-l2l/v1"]').click();
  await expect(page.locator('#hub-connect')).toBeDisabled();
  await expect(page.locator('#hub-demo')).toBeEnabled();
  await page.locator('#hub-demo').click();
  await expect(page.locator('#connection-state')).toContainText('Demo');
  await page.locator('#quick-stop').click();
  expect(await page.evaluate(() => window.nativeCalls)).toEqual([]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('hosted Hub never implies native bridge or requests Bluetooth merely by loading', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.webRequests = 0;
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice: async () => {
          window.webRequests++;
          throw new Error('not used');
        },
      },
    });
  });
  await page.goto('/hub.html');
  await expect(page.locator('#platform-support')).toContainText('Compatible Bluetooth browser');
  await expect(page.locator('#hub-connect')).toBeEnabled();
  await page.locator('[data-family="furby-connect/v1"]').click();
  await expect(page.locator('#hub-connect')).toBeEnabled();
  expect(await page.evaluate(() => window.webRequests)).toBe(0);
});
