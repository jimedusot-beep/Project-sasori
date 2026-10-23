import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import {
  DEVICE_INFORMATION_SERVICE,
  DEVICE_INFORMATION_FIELDS,
} from '../../site/lib/device-information.js';
import { ELMO_SERVICE, ELMO_NOTIFY } from '../../site/lib/profiles.js';

async function installDevice(page, native = false) {
  await page.addInitScript(
    ({ service, fields, elmoNotify, native }) => {
      window.quickCalls = [];
      const values = {
        manufacturer: 'Synthetic Toys',
        model: 'Fixture 100',
        hardware: 'B',
        firmware: '1.2',
        software: '2.0',
      };
      const characteristics = (uuid) =>
        uuid === service
          ? [
              ...fields.map((f) => ({ uuid: f.uuid, properties: ['read'] })),
              { uuid: '00002a25-0000-1000-8000-00805f9b34fb', properties: ['read'] },
            ]
          : [{ uuid: elmoNotify, properties: ['notify'] }];
      const read = (uuid) => {
        window.quickCalls.push(['read', uuid]);
        const field = fields.find((f) => f.uuid === uuid);
        if (!field) throw new Error('Unexpected identity read');
        return new TextEncoder().encode(values[field.key]);
      };
      if (native) {
        window.SasoriNativeBluetooth = {
          addListener: async () => ({ remove: async () => {} }),
          requestDevice: async (options) => {
            window.quickCalls.push(['choose', options]);
            return { id: 'synthetic', name: 'Fixture' };
          },
          connect: async () => {},
          getService: async ({ uuid }) => ({ uuid }),
          getCharacteristics: async ({ service: uuid }) => ({
            characteristics: characteristics(uuid),
          }),
          readInformation: async ({ uuid }) => ({
            hex: [...read(uuid)].map((b) => b.toString(16).padStart(2, '0')).join(''),
          }),
          startNotifications: async () => window.quickCalls.push(['subscribe']),
          disconnect: async () => window.quickCalls.push(['disconnect']),
        };
      } else {
        const device = new EventTarget();
        device.name = 'Fixture';
        device.gatt = {
          connected: false,
          async connect() {
            this.connected = true;
            return this;
          },
          getPrimaryService: async (uuid) => ({
            uuid,
            getCharacteristics: async () =>
              characteristics(uuid).map((item) => {
                const characteristic = new EventTarget();
                characteristic.uuid = item.uuid;
                characteristic.properties = Object.fromEntries(
                  item.properties.map((p) => [p, true]),
                );
                characteristic.readValue = async () => {
                  const bytes = read(item.uuid);
                  return new DataView(bytes.buffer);
                };
                characteristic.startNotifications = async () => {
                  window.quickCalls.push(['subscribe']);
                  return characteristic;
                };
                return characteristic;
              }),
          }),
          disconnect() {
            this.connected = false;
            window.quickCalls.push(['disconnect']);
            device.dispatchEvent(new Event('gattserverdisconnected'));
          },
        };
        Object.defineProperty(navigator, 'bluetooth', {
          value: {
            requestDevice: async (options) => {
              window.quickCalls.push(['choose', options]);
              return device;
            },
          },
        });
      }
    },
    {
      service: DEVICE_INFORMATION_SERVICE,
      fields: DEVICE_INFORMATION_FIELDS,
      elmoService: ELMO_SERVICE,
      elmoNotify: ELMO_NOTIFY,
      native,
    },
  );
}

for (const native of [false, true])
  test(`${native ? 'native' : 'browser'} quick identification exports, remembers, and prepares a device without UUID entry`, async ({
    page,
  }, testInfo) => {
    await installDevice(page, native);
    await page.goto('/');
    await page.locator('#quick-identify').click();
    await expect(page.locator('#connection-task')).toHaveValue('identify');
    expect(await page.evaluate(() => window.quickCalls)).toEqual([]);
    await page.locator('#name-prefix').fill('Fixture');
    await page.locator('#consent').check();
    await page.locator('#connect').click();
    await expect(page.locator('#connection-result-title')).toHaveText('Device information read');
    await expect(page.locator('#device-information')).toContainText('Fixture 100');
    await expect(page.locator('#device-information')).toContainText('1.2');
    await expect(page.locator('#state')).toHaveText('Disconnected');
    expect(
      await page.evaluate(() => window.quickCalls.filter((c) => c[0] === 'read').map((c) => c[1])),
    ).toEqual(DEVICE_INFORMATION_FIELDS.map((f) => f.uuid));
    expect(await page.evaluate(() => window.quickCalls.some((c) => c[0] === 'subscribe'))).toBe(
      false,
    );
    await page.screenshot({ path: testInfo.outputPath('quick-identify.png'), fullPage: true });
    if (!native) {
      const downloading = page.waitForEvent('download');
      await page.locator('#result-export').click();
      const record = JSON.parse(await readFile(await (await downloading).path(), 'utf8'));
      expect(record.deviceInformation).toEqual({
        manufacturer: 'Synthetic Toys',
        model: 'Fixture 100',
        hardware: 'B',
        firmware: '1.2',
        software: '2.0',
      });
      expect(record.inspection.service).toBe(DEVICE_INFORMATION_SERVICE);
      expect(record.payloadsIncluded).toBe(false);
      expect(record).not.toHaveProperty('serial');
    }
    await page.reload();
    await expect(page.locator('#connection-result-title')).toHaveText('Device information read');
    await expect(page.locator('#consent')).not.toBeChecked();
    expect(await page.evaluate(() => window.quickCalls)).toEqual([]);
    await page.locator('#result-save-device').click();
    await expect(page.locator('#page-toys')).toBeVisible();
    await expect(page.locator('#toy-model')).toHaveValue('Fixture 100');
    await expect(page.locator('#toy-firmware')).toHaveValue('1.2');
    await expect(page.locator('#toy-source-note')).toHaveValue(/Observed in Sasori session/);
    await page.locator('#toy-name').fill('My fixture toy');
    await page.locator('#toy-save').click();
    await expect(page.locator('.toy-profile')).toHaveCount(1);
  });

test('Elmo quick setup starts with metadata and prepares an observed channel with no automatic subscription', async ({
  page,
}) => {
  await installDevice(page);
  await page.goto('/');
  await page.locator('#quick-elmo').click();
  await expect(page.locator('#notify')).toHaveValue('');
  await expect(page.locator('#connection-task')).toHaveValue('metadata');
  await page.locator('#consent').check();
  await page.locator('#connect').click();
  await expect(page.locator('#state')).toHaveText('Inspecting');
  await expect(page.locator('#quick-identify')).toBeDisabled();
  await page.locator('#global-stop').click();
  await expect(page.locator('#connection-result-title')).toHaveText('Connection details captured');
  const capture = page.getByRole('button', {
    name: 'Capture from Data notifications',
    exact: true,
  });
  await capture.click();
  await expect(page.locator('#connection-task')).toHaveValue('capture');
  await expect(page.locator('#notify')).toHaveValue(ELMO_NOTIFY);
  await expect(page.locator('#consent')).not.toBeChecked();
  expect(await page.evaluate(() => window.quickCalls.filter((c) => c[0] === 'choose').length)).toBe(
    1,
  );
  expect(await page.evaluate(() => window.quickCalls.some((c) => c[0] === 'subscribe'))).toBe(
    false,
  );
  await page.locator('#consent').check();
  await page.locator('#connect').click();
  await expect(page.locator('#state')).toHaveText('Inspecting');
  expect(
    await page.evaluate(() => window.quickCalls.filter((c) => c[0] === 'subscribe').length),
  ).toBe(1);
  await page.locator('#global-stop').click();
});
