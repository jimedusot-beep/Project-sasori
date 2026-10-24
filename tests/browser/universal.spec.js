import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import {
  STANDARD_SERVICES,
  BATTERY_SERVICE,
  BATTERY_LEVEL,
  ALERT_SERVICE,
  ALERT_LEVEL,
} from '../../site/lib/standard-controls.js';
import {
  DEVICE_INFORMATION_SERVICE,
  DEVICE_INFORMATION_FIELDS,
} from '../../site/lib/device-information.js';
async function fixture(page, native = false) {
  await page.addInitScript(
    ({ services, battery, batteryField, alert, alertField, information, fields, native }) => {
      window.controlCalls = [];
      window.controlListeners = {};
      const channels = (service) =>
        (service === alert
          ? [alertField]
          : service === battery
            ? [batteryField]
            : fields.map((f) => f.uuid)
        ).map((uuid) => ({
          uuid,
          properties: uuid === alertField ? { writeWithoutResponse: true } : { read: true },
          readValue: async () => {
            window.controlCalls.push(['read', uuid]);
            const bytes =
              uuid === batteryField
                ? Uint8Array.of(64)
                : new TextEncoder().encode('Fixture gadget');
            return new DataView(bytes.buffer);
          },
          writeValueWithoutResponse: async (value) =>
            window.controlCalls.push(['write', service, uuid, [...value]]),
        }));
      const device = new EventTarget();
      device.id = 'private-control-device';
      device.name = 'Desk fixture';
      device.gatt = {
        connected: false,
        async connect() {
          window.controlCalls.push(['connect']);
          this.connected = true;
          return this;
        },
        disconnect() {
          window.controlCalls.push(['disconnect']);
          this.connected = false;
          device.dispatchEvent(new Event('gattserverdisconnected'));
        },
        async getPrimaryService(uuid) {
          window.controlCalls.push(['service', uuid]);
          return { uuid, getCharacteristics: async () => channels(uuid) };
        },
      };
      Object.defineProperty(navigator, 'bluetooth', {
        configurable: true,
        value: {
          getDevices: async () => [device],
          requestDevice: async (o) => {
            window.controlCalls.push(['choose', o]);
            if (window.failControlChoice)
              throw new DOMException('No device selected', 'NotFoundError');
            return device;
          },
        },
      });
      if (native)
        window.SasoriNativeBluetooth = {
          addListener: async (n, cb) => {
            window.controlListeners[n] = cb;
            return {
              remove: async () => {
                delete window.controlListeners[n];
              },
            };
          },
          requestDevice: async (o) => {
            window.controlCalls.push(['native-choose', o]);
            return { id: device.id, name: device.name };
          },
          connect: async () => {
            window.controlCalls.push(['native-connect']);
          },
          getService: async ({ uuid }) => ({ uuid }),
          getCharacteristics: async ({ service }) => ({
            characteristics: channels(service).map((c) => ({
              uuid: c.uuid,
              properties: Object.keys(c.properties),
            })),
          }),
          readStandard: async ({ uuid }) => {
            window.controlCalls.push(['native-read', uuid]);
            return { hex: uuid === batteryField ? '40' : '46697874757265' };
          },
          alertStandard: async ({ level }) => {
            window.controlCalls.push(['native-alert', level]);
            return { queued: true, acknowledged: false };
          },
          disconnect: async () => {
            window.controlCalls.push(['native-disconnect']);
          },
        };
      window.expectedControlServices = services;
      window.informationService = information;
    },
    {
      services: STANDARD_SERVICES,
      battery: BATTERY_SERVICE,
      batteryField: BATTERY_LEVEL,
      alert: ALERT_SERVICE,
      alertField: ALERT_LEVEL,
      information: DEVICE_INFORMATION_SERVICE,
      fields: DEVICE_INFORMATION_FIELDS,
      native,
    },
  );
}
test('shared controls connect once, discover standard capabilities, read and bound alert without arbitrary commands', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/#universal');
  await expect(page.locator('#u-connect')).toBeEnabled();
  expect(await page.evaluate(() => window.controlCalls.length)).toBe(0);
  await page.locator('#u-connect').click();
  await expect(page.locator('#u-state')).toHaveText('connected');
  expect(
    await page.evaluate(
      () => window.controlCalls.find(([k]) => k === 'choose')[1].optionalServices,
    ),
  ).toEqual(STANDARD_SERVICES);
  expect(
    await page.evaluate(() => window.controlCalls.some(([k]) => ['read', 'write'].includes(k))),
  ).toBe(false);
  await page.locator('#u-identify').click();
  await expect(page.locator('#u-values')).toContainText('Fixture gadget');
  await page.locator('#u-status').click();
  await expect(page.locator('#u-battery')).toHaveText('Battery: 64%');
  await page.locator('#u-alert').click();
  await expect
    .poll(() =>
      page.evaluate(() => window.controlCalls.filter(([k]) => k === 'write').map((c) => c[3])),
    )
    .toEqual([[1], [0]]);
  await page.locator('#global-stop').click();
  await expect(page.locator('#u-state')).toHaveText('disconnected');
  await expect(page.locator('#u-status')).toBeDisabled();
  await expect(page.locator('#u-storage')).toContainText('1 / 20');
});
test('saved connections survive reload, reconnect without the chooser, export privately and import atomically', async ({
  page,
}) => {
  await fixture(page);
  await page.goto('/#universal');
  await page.locator('#u-connect').click();
  await expect(page.locator('#u-state')).toHaveText('connected');
  await expect(page.locator('#u-storage')).toContainText('1 / 20');
  await page.locator('#u-stop').click();
  await page.reload();
  await expect(page.locator('#u-connect')).toHaveText('Reconnect saved device');
  await expect(page.locator('#u-binding')).toContainText('reference available');
  expect(await page.evaluate(() => window.controlCalls.length)).toBe(0);
  await page.locator('#u-connect').click();
  await expect(page.locator('#u-state')).toHaveText('connected');
  expect(
    await page.evaluate(() => window.controlCalls.filter(([k]) => k === 'choose').length),
  ).toBe(0);
  await page.locator('#u-stop').click();
  const pending = page.waitForEvent('download');
  await page.locator('#u-export').click();
  const text = await readFile(await (await pending).path(), 'utf8');
  expect(text).not.toContain('private-control-device');
  const bad = JSON.parse(text);
  bad.targets.push({ ...bad.targets[0], id: 'control-bad', adapterId: 'executable' });
  await page.locator('#u-import').setInputFiles({
    name: 'bad.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(bad)),
  });
  await expect(page.locator('#u-message')).toContainText('Invalid saved');
  await expect(page.locator('#u-storage')).toContainText('1 / 20');
  await page.locator('#u-import').setInputFiles({
    name: 'setups.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(page.locator('#u-storage')).toContainText('2 / 20');
  await page.evaluate(() => {
    window.failControlChoice = true;
  });
  await page.locator('#u-choose').click();
  await expect(page.locator('#u-state')).toHaveText('disconnected');
  await expect(page.locator('#u-storage')).toContainText('2 / 20');
});
test('offline demo works without Bluetooth and has accessible responsive controls', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'bluetooth', { value: undefined }),
  );
  await page.goto('/#universal');
  await expect(page.locator('#u-connect')).toBeDisabled();
  await page.locator('#u-demo').click();
  await expect(page.locator('#u-state')).toHaveText('DEMO · connected');
  await page.locator('#u-identify').click();
  await page.locator('#u-status').click();
  await expect(page.locator('#u-values')).toContainText('Synthetic desk gadget');
  await expect(page.locator('#u-storage')).toContainText('0 / 20');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.locator('#u-actions-title').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('universal-controls.png') });
  await page.locator('#u-stop').click();
});
test('native shared controls route through the fixed read and alert APIs and prevent concurrent inspection', async ({
  page,
}) => {
  await fixture(page, true);
  await page.goto('/#universal');
  await page.locator('#u-connect').click();
  await expect(page.locator('#u-state')).toHaveText('connected');
  expect(
    await page.evaluate(
      () => window.controlCalls.find(([k]) => k === 'native-choose')[1].standardControls,
    ),
  ).toBe(true);
  await page.locator('#u-status').click();
  await expect(page.locator('#u-battery')).toHaveText('Battery: 64%');
  await page.locator('#u-alert').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.controlCalls.filter(([k]) => k === 'native-alert').map((c) => c[1]),
      ),
    )
    .toEqual([1, 0]);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.locator('#connect')).toBeDisabled();
  await page.locator('#global-stop').click();
  await page.getByRole('button', { name: 'Universal controls', exact: true }).first().click();
  await expect(page.locator('#u-state')).toHaveText('disconnected');
  expect(await page.evaluate(() => Object.keys(window.controlListeners).length)).toBe(0);
});
