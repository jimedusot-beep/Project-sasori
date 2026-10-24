import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { FURBY_SERVICE, FURBY_RX, FURBY_TX } from '../../site/lib/furby-codec.js';

async function radio(page, mode = 'match') {
  await page.addInitScript(
    ({ service, rxId, txId, mode }) => {
      window.furbyCalls = [];
      window.furbyMode = mode;
      const device = new EventTarget(),
        rx = new EventTarget();
      Object.assign(rx, {
        uuid: rxId,
        properties: { notify: true },
        startNotifications: async () => {
          window.furbyCalls.push(['subscribe']);
          return rx;
        },
      });
      const tx = {
        uuid: txId,
        properties: { writeWithoutResponse: true },
        async writeValueWithoutResponse(bytes) {
          window.furbyCalls.push(['write', [...bytes]]);
          const reply =
            bytes[0] === 0xfe ? [0xfe, 4] : bytes[0] === 0x20 ? [0x22, ...Array(18).fill(0)] : null;
          if (reply) {
            rx.value = new DataView(Uint8Array.from(reply).buffer);
            rx.dispatchEvent(new Event('characteristicvaluechanged'));
          }
        },
      };
      device.name = 'Furby Connect';
      device.id = 'private-furby-test-id';
      device.gatt = {
        connected: false,
        async connect() {
          window.furbyCalls.push(['connect']);
          this.connected = true;
          return this;
        },
        disconnect() {
          window.furbyCalls.push(['disconnect']);
          this.connected = false;
          device.dispatchEvent(new Event('gattserverdisconnected'));
        },
        async getPrimaryService(uuid) {
          window.furbyCalls.push(['service', uuid]);
          if (window.furbyMode === 'hang')
            return new Promise((resolve) => {
              window.releaseFurbyService = resolve;
            });
          if (window.furbyMode === 'unknown' || uuid !== service)
            throw new DOMException('Absent.', 'NotFoundError');
          return { uuid, getCharacteristics: async () => [rx, tx] };
        },
      };
      Object.defineProperty(navigator, 'bluetooth', {
        value: {
          requestDevice: async () => {
            window.furbyCalls.push(['choose']);
            return device;
          },
          getDevices: async () => [],
        },
      });
    },
    { service: FURBY_SERVICE, rxId: FURBY_RX, txId: FURBY_TX, mode },
  );
}
const family = (page) => page.locator('[data-family="furby-connect/v1"]');

test('Furby demo exposes firmware, undecoded presence, bounded light and reusable routines on phones', async ({
  page,
}, testInfo) => {
  await page.goto('/hub.html');
  await family(page).click();
  await page.locator('#hub-demo').click();
  await expect(page.locator('#connection-state')).toHaveText('Demo · ready');
  await expect(page.locator('#elmo-options')).toBeHidden();
  await page.locator('#hub-identify').click();
  await expect(page.locator('#device-state')).toContainText('GeneralPlus version byte 0x04');
  await page.locator('#hub-status').click();
  await expect(page.locator('#device-state')).toContainText('fields remain undecoded');
  await expect(page.locator('#hub-alert')).toHaveText('Blue antenna light');
  await page.locator('#hub-alert').click();
  await expect(page.locator('#hub-alert')).toBeEnabled();
  await page.locator('#routine-builder summary').click();
  await page.locator('#starter-routine').click();
  await page.locator('#save-routine').click();
  await page.locator('#run-routine').click();
  await expect(page.locator('#routine-progress')).toContainText('Routine completed: 2 steps');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('furby-hub.png'), fullPage: true });
  await page.locator('#hub-stop').click();
});

test('identification disconnects without writes and a separate adapter selection reuses the chooser grant', async ({
  page,
}) => {
  await radio(page);
  await page.goto('/hub.html');
  await page.locator('#hub-detect').click();
  await expect(page.locator('#recognition-status')).toContainText('Disconnected. Choose');
  expect(
    await page.evaluate(() =>
      window.furbyCalls.filter(([k]) => ['write', 'subscribe'].includes(k)),
    ),
  ).toEqual([]);
  expect(
    await page.evaluate(() => window.furbyCalls.filter(([k]) => k === 'disconnect').length),
  ).toBe(1);
  await page.getByRole('button', { name: 'Use Furby Connect', exact: true }).click();
  await expect(family(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#hub-connect')).toHaveText('Reconnect device →');
  expect(await page.evaluate(() => window.furbyCalls.filter(([k]) => k === 'connect').length)).toBe(
    1,
  );
  await page.locator('#hub-connect').click();
  await expect(page.locator('#connection-state')).toHaveText('Connected');
  expect(await page.evaluate(() => window.furbyCalls.filter(([k]) => k === 'choose').length)).toBe(
    1,
  );
  await page.locator('#hub-identify').click();
  await expect(page.locator('#device-state')).toContainText('0x04');
  expect(await page.evaluate(() => window.furbyCalls.filter(([k]) => k === 'write'))).toEqual([
    ['write', [0xfe]],
  ]);
  await page.locator('#hub-stop').click();
  await page.reload();
  await expect(family(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#saved-setup option:checked')).toContainText('Furby Connect');
});

test('a toy name alone cannot select an adapter or initiate commands', async ({ page }) => {
  await radio(page, 'unknown');
  await page.goto('/hub.html');
  await page.locator('#hub-detect').click();
  await expect(page.locator('#recognition-status')).toContainText(
    'No supported service/channel combination',
  );
  await expect(page.locator('#recognition-matches button')).toHaveCount(0);
  await expect(family(page)).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.furbyCalls.some(([k]) => k === 'write'))).toBe(false);
});

test('cancelled metadata discovery cannot resurrect results and can be retried', async ({
  page,
}) => {
  await radio(page, 'hang');
  await page.goto('/hub.html');
  await page.locator('#hub-detect').click();
  await expect.poll(() => page.evaluate(() => typeof window.releaseFurbyService)).toBe('function');
  await expect(family(page)).toBeDisabled();
  await page.locator('#cancel-detect').click();
  await page.evaluate(() => {
    window.furbyMode = 'match';
    window.releaseFurbyService({
      uuid: 'dab91435-b5a1-e29c-b041-bcd562613bde',
      getCharacteristics: async () => [],
    });
  });
  await expect(page.locator('#recognition-status')).toContainText('cancelled');
  await expect(page.locator('#recognition-matches button')).toHaveCount(0);
  await page.locator('#hub-detect').click();
  await expect(page.getByRole('button', { name: 'Use Furby Connect', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.furbyCalls.some(([k]) => k === 'write'))).toBe(false);
});

test('Universal controls offers the same Furby demo and explains the adapter scope', async ({
  page,
}) => {
  await page.goto('/#universal');
  await page.locator('#u-family').selectOption('furby-connect/v1');
  await expect(page.locator('#u-family-help')).toContainText('Furby Connect (2016) only');
  await page.locator('#u-demo').click();
  await page.locator('#u-identify').click();
  await expect(page.locator('#u-values')).toContainText('GeneralPlus version byte 0x04');
  await page.locator('#u-status').click();
  await expect(page.locator('#u-battery')).toContainText('fields remain undecoded');
  await expect(page.locator('#u-sources a')).toHaveCount(2);
  await page.locator('#u-stop').click();
});
