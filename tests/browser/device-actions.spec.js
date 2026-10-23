import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
const family = 'wowwee-mip/v1';

async function webMiP(page) {
  await page.addInitScript(() => {
    window.mipCalls = [];
    let devicePromise;
    const get = () =>
      (devicePromise ||= import('/lib/mip-controls.js').then(async (module) => {
        const device = await module.createMiPDemo().requestDevice();
        const tx = (
          await (await device.gatt.getPrimaryService(module.MIP_TX_SERVICE)).getCharacteristics()
        )[0];
        const write = tx.writeValueWithoutResponse;
        tx.writeValueWithoutResponse = async (bytes) => {
          window.mipCalls.push(['write', [...bytes]]);
          return write(bytes);
        };
        return device;
      }));
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        getDevices: async () => [await get()],
        requestDevice: async (options) => {
          window.mipCalls.push(['choose', options]);
          return get();
        },
      },
    });
  });
}

test('MiP offline recipe records synthetic trials, preserves observations, and exports/imports claims', async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'bluetooth', { value: undefined }),
  );
  await page.goto('/#universal');
  await page.locator('#u-family').selectOption(family);
  await page.locator('#u-demo').click();
  await expect(page.locator('#u-alert')).toHaveText('Blue light (1.5 s)');
  await page.locator('#u-check').click();
  const trial = page.locator('#u-trial-list button').first();
  await expect(trial).toContainText('check · effect-clear-queued · synthetic');
  await expect(page.locator('#u-trial-detail')).toContainText('cleared');
  await page.locator('#u-observed').selectOption('yes');
  await page.locator('#u-recovered').selectOption('yes');
  await page.locator('#u-trial-notes').fill('Synthetic interface check only.');
  await page.locator('#u-observation-save').click();
  await expect(page.locator('#u-message')).toContainText('Owner observation saved');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.locator('#u-trials-title').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('mip-trial-workspace.png') });
  const downloading = page.waitForEvent('download');
  await page.locator('#u-trials-export').click();
  const text = await readFile(await (await downloading).path(), 'utf8');
  expect(JSON.parse(text).trials[0].source).toBe('synthetic');
  expect(JSON.parse(text).trials[0].physicalEffectVerified).toBe(false);
  await page.locator('#u-stop').click();
  await page.reload();
  await expect(page.locator('#u-trial-list button')).toHaveCount(1);
  await page.locator('#u-trial-list button').first().click();
  await expect(page.locator('#u-trial-notes')).toHaveValue('Synthetic interface check only.');
  await page.locator('#u-trials-import').setInputFiles({
    name: 'trials.json',
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await expect(page.locator('#u-trial-list button')).toHaveCount(2);
  await expect(page.locator('#u-trial-summary')).toContainText(
    'demo and imported claims never count',
  );
  await page.locator('#u-trial-list button').first().click();
  await page.locator('#u-trial-remove').click();
  await expect(page.locator('#u-trial-list button')).toHaveCount(1);
});

test('selected MiP family persists with its saved binding and fresh owner-observed checks count once per session', async ({
  page,
}) => {
  await webMiP(page);
  await page.goto('/#universal');
  await page.locator('#u-family').selectOption(family);
  await page.locator('#u-connect').click();
  await expect(page.locator('#u-state')).toHaveText('connected');
  await expect(page.locator('#u-storage')).toContainText('1 / 20');
  expect(await page.evaluate(() => window.mipCalls.filter(([kind]) => kind === 'write'))).toEqual(
    [],
  );
  await page.locator('#u-check').click();
  await expect(page.locator('#u-trial-list button')).toHaveCount(1);
  await expect(page.locator('#u-trial-summary')).toContainText('0 / 10');
  expect(
    await page.evaluate(() => window.mipCalls.filter(([k]) => k === 'write').map((r) => r[1])),
  ).toEqual([[20], [121], [132, 0, 0, 32], [132, 0, 0, 0]]);
  await page.locator('#u-observed').selectOption('yes');
  await page.locator('#u-recovered').selectOption('yes');
  await page.locator('#u-observation-save').click();
  await expect(page.locator('#u-trial-summary')).toContainText('1 / 10');
  await page.locator('#u-stop').click();
  await page.reload();
  await expect(page.locator('#u-family')).toHaveValue(family);
  await expect(page.locator('#u-connect')).toHaveText('Reconnect saved device');
  await page.locator('#u-connect').click();
  await expect(page.locator('#u-state')).toHaveText('connected');
  expect(await page.evaluate(() => window.mipCalls.filter(([k]) => k === 'choose'))).toEqual([]);
  await page.locator('#u-check').click();
  await expect(page.locator('#u-trial-list button')).toHaveCount(2);
  await page.locator('#u-observed').selectOption('yes');
  await page.locator('#u-recovered').selectOption('yes');
  await page.locator('#u-observation-save').click();
  await expect(page.locator('#u-trial-summary')).toContainText('2 / 10');
  await page.locator('#u-stop').click();
});

test('native MiP family uses fixed semantic commands and receives ASCII replies through native notifications', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.mipCalls = [];
    const listeners = {};
    const uuid = (short) => '0000' + short + '-0000-1000-8000-00805f9b34fb';
    window.SasoriNativeBluetooth = {
      addListener: async (name, fn) => {
        listeners[name] = fn;
        return {
          remove: async () => {
            delete listeners[name];
          },
        };
      },
      requestDevice: async (options) => {
        window.mipCalls.push(['choose', options]);
        return { id: 'native-mip-fixture', name: 'MiP fixture' };
      },
      connect: async () => {},
      getService: async ({ uuid }) => ({ uuid }),
      getCharacteristics: async ({ service }) => ({
        characteristics: [
          {
            uuid: service === uuid('ffe0') ? uuid('ffe4') : uuid('ffe9'),
            properties: service === uuid('ffe0') ? ['notify'] : ['writeWithoutResponse'],
          },
        ],
      }),
      startNotifications: async () => {},
      mipCommand: async ({ command }) => {
        window.mipCalls.push(['command', command]);
        const reply = command === 'identify' ? '140E021B07' : command === 'status' ? '796402' : '';
        if (reply)
          listeners.notification({
            id: 'native-mip-fixture',
            uuid: uuid('ffe4'),
            hex: [...reply].map((c) => c.charCodeAt(0).toString(16)).join(''),
          });
        return { queued: true, acknowledged: false };
      },
      disconnect: async () => {},
    };
  });
  await page.goto('/#universal');
  await page.locator('#u-family').selectOption(family);
  await page.locator('#u-connect').click();
  await expect(page.locator('#u-state')).toHaveText('connected');
  expect(await page.evaluate(() => window.mipCalls[0][1].mipControls)).toBe(true);
  await page.locator('#u-check').click();
  await expect(page.locator('#u-trial-list button')).toHaveCount(1);
  expect(
    await page.evaluate(() => window.mipCalls.filter(([k]) => k === 'command').map((r) => r[1])),
  ).toEqual(['identify', 'status', 'alert', 'clear']);
  await expect(page.locator('#u-trial-detail')).toContainText('cleared');
  await page.locator('#u-stop').click();
});
