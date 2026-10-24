import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

async function radioGuard(page) {
  await page.addInitScript(() => {
    window.pocketRadioCalls = 0;
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice() {
          window.pocketRadioCalls++;
          throw new Error('Demo called real Bluetooth');
        },
      },
    });
  });
}
async function open(page) {
  await page.goto('/pocket-ir.html');
  await expect(page.locator('#profile option')).toHaveCount(2);
}
async function demoReady(page) {
  await page.locator('#demo').click();
  await expect(page.locator('#connection')).toContainText('Connected');
  await page.locator('#prepare').click();
  await expect(page.locator('#connection')).toContainText('Demo remote ready');
}
test('offline phone remote prepares named buttons and sends without radio, network, or page errors', async ({
  page,
}) => {
  await radioGuard(page);
  const errors = [],
    external = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (req) => {
    if (
      /^https?:/.test(req.url()) &&
      !req.url().includes('127.0.0.1') &&
      !req.url().includes('localhost')
    )
      external.push(req.url());
  });
  await open(page);
  await expect(page.getByRole('button', { name: 'Power', exact: true })).toBeDisabled();
  await demoReady(page);
  await page.getByRole('button', { name: 'Power', exact: true }).click();
  await expect(page.locator('#attempts')).toHaveText('1');
  await expect(page.locator('#mode')).toContainText('OFFLINE DEMO');
  expect(await page.evaluate(() => window.pocketRadioCalls)).toBe(0);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
});
test('saved setup reload is inert; profile changes and reconnect require preparation', async ({
  page,
}) => {
  await radioGuard(page);
  await open(page);
  await demoReady(page);
  await page.locator('#setup-name').fill('Living room TV');
  await page.locator('#save').click();
  await expect(page.locator('#profile option:checked')).toHaveText('Living room TV');
  await expect(page.getByRole('button', { name: 'Power', exact: true })).toBeDisabled();
  await page.reload();
  await expect(page.locator('#profile option:checked')).toHaveText('Living room TV');
  await expect(page.getByRole('button', { name: 'Power', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.pocketRadioCalls)).toBe(0);
  await demoReady(page);
  await page.locator('#profile').selectOption('lg-tv');
  await expect(page.getByRole('button', { name: 'Channel +', exact: true })).toBeDisabled();
  await page.locator('#prepare').click();
  await expect(page.locator('#connection')).toContainText('Demo remote ready');
  await page.locator('#disconnect').click();
  await expect(page.getByRole('button', { name: 'Power', exact: true })).toBeDisabled();
  await page.locator('#demo').click();
  await expect(page.locator('#prepare')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Power', exact: true })).toBeDisabled();
});
test('profile export and validated import preserve named codes but never transmit', async ({
  page,
}) => {
  await radioGuard(page);
  await open(page);
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  const profile = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(profile.id).toBe('custom-samsung-tv');
  expect(profile.buttons).toHaveLength(5);
  expect(JSON.stringify(profile)).not.toMatch(/bluetoothId|password|deviceId/);
  await page.locator('summary').click();
  await page.locator('#profile-json').fill(JSON.stringify({ ...profile, name: 'My remote' }));
  await page.locator('#import').click();
  await expect(page.locator('#profile option:checked')).toHaveText('My remote');
  await page.locator('#profile-json').fill('{broken');
  await page.locator('#import').click();
  await expect(page.locator('#connection')).toContainText('Invalid remote setup');
  await expect(page.locator('#profile option')).toHaveCount(3);
  await expect(page.locator('#profile option:checked')).toHaveText('My remote');
  expect(await page.evaluate(() => window.pocketRadioCalls)).toBe(0);
  await expect(page.locator('#attempts')).toHaveText('0');
});
test('page backgrounding cancels demo and clears all ready buttons', async ({ page }) => {
  await open(page);
  await demoReady(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#connection')).toContainText('Page hidden');
  await expect(page.getByRole('button', { name: 'Power', exact: true })).toBeDisabled();
});
async function fakeBridge(page, hang = false) {
  await page.addInitScript(
    ({ hang }) => {
      window.pocketWrites = [];
      window.pocketNotify = null;
      const status = new EventTarget();
      status.properties = { notify: true };
      status.startNotifications = async () => status;
      const notify = (text) => {
        status.value = new DataView(new TextEncoder().encode(text).buffer);
        status.dispatchEvent(new Event('characteristicvaluechanged'));
      };
      window.pocketNotify = notify;
      const writer = (type) => ({
        properties: { write: true },
        writeValueWithResponse: async (bytes) => {
          const value = JSON.parse(new TextDecoder().decode(bytes));
          window.pocketWrites.push({ type, ...value });
          notify(type + ':' + value.slot);
        },
      });
      const config = writer('saved'),
        trigger = writer('sent');
      const device = new EventTarget();
      device.gatt = {
        connected: false,
        connect: async () => {
          if (hang) return new Promise(() => {});
          device.gatt.connected = true;
          return device.gatt;
        },
        disconnect: () => {
          device.gatt.connected = false;
          device.dispatchEvent(new Event('gattserverdisconnected'));
        },
        getPrimaryService: async () => ({
          getCharacteristic: async (uuid) =>
            uuid.startsWith('d997') ? config : uuid.startsWith('5839') ? trigger : status,
        }),
      };
      Object.defineProperty(navigator, 'bluetooth', {
        configurable: true,
        value: { requestDevice: async () => device },
      });
    },
    { hang },
  );
}
test('selected real-interface fixture requires current preparation, rejects unsolicited saved, and unchecking disconnects', async ({
  page,
}) => {
  await fakeBridge(page);
  await open(page);
  await page.locator('#owner-check').check();
  await page.locator('#connect').click();
  await expect(page.locator('#connection')).toContainText('Connected');
  await page.evaluate(() => window.pocketNotify('saved:1'));
  await expect(page.getByRole('button', { name: 'Power', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.pocketWrites.length)).toBe(0);
  await page.locator('#prepare').click();
  await expect(page.locator('#connection')).toContainText('Remote ready');
  expect(await page.evaluate(() => window.pocketWrites.length)).toBe(5);
  await page.getByRole('button', { name: 'Mute', exact: true }).click();
  await expect(page.locator('#attempts')).toHaveText('1');
  expect(
    await page.evaluate(() => window.pocketWrites.filter((w) => w.type === 'sent').length),
  ).toBe(1);
  await page.locator('#owner-check').uncheck();
  await expect(page.locator('#connection')).toContainText('Permission unchecked');
  await expect(page.getByRole('button', { name: 'Mute', exact: true })).toBeDisabled();
});
test('Stop releases an interrupted native connection without waiting for its promise', async ({
  page,
}) => {
  await fakeBridge(page, true);
  await open(page);
  await page.locator('#owner-check').check();
  await page.locator('#connect').click();
  await page.locator('#disconnect').click();
  await expect(page.locator('#connect')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Power', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.pocketWrites.length)).toBe(0);
});
test('remote has accessible contrast, labels, mobile fit, and large buttons', async ({ page }) => {
  await open(page);
  await demoReady(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  for (const box of await page.locator('button:visible').evaluateAll((nodes) =>
    nodes.map((n) => ({
      w: n.getBoundingClientRect().width,
      h: n.getBoundingClientRect().height,
    })),
  )) {
    expect(box.w).toBeGreaterThanOrEqual(44);
    expect(box.h).toBeGreaterThanOrEqual(44);
  }
});
