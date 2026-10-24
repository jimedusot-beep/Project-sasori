import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
const fileHeader = 'Filetype: IR signals file\nVersion: 1\n';
const signal = (name) =>
  `name: ${name}\ntype: parsed\nprotocol: NEC\naddress: 04 00 00 00\ncommand: 08 00 00 00\n#\n`;
async function radioGuard(page) {
  await page.addInitScript(() => {
    window.irRadioCalls = 0;
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice() {
          window.irRadioCalls++;
          throw new Error('Import must not open Bluetooth');
        },
      },
    });
  });
}
async function open(page) {
  await page.goto('/pocket-ir.html');
  await expect(page.locator('#profile option')).toHaveCount(2);
}
async function example(page) {
  await page.locator('#ir-example').click();
  await expect(page.locator('#ir-status')).toContainText('5 convertible, 1 unsupported');
}
async function saveExample(page) {
  await example(page);
  await page.locator('#ir-save').click();
  await expect(page.locator('#ir-status')).toContainText('Saved 5 named buttons');
}
test('community file import becomes a saved named remote and survives reload without Bluetooth or IR', async ({
  page,
}) => {
  await radioGuard(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page);
  await saveExample(page);
  await expect(page.locator('#profile option:checked')).toHaveText('Sony Bravia example');
  await expect(page.getByRole('button', { name: 'Power', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.irRadioCalls)).toBe(0);
  const download = page.waitForEvent('download');
  await page.locator('#export').click();
  const profile = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(profile.buttons[0]).toMatchObject({ proto: 'SONY', bits: 12, code: '0xA90' });
  expect(profile.buttons.map((b) => b.label)).toEqual([
    'Power',
    'Vol up',
    'Vol dn',
    'Input',
    'Mute',
  ]);
  expect(profile.source).toContain('unverified');
  expect(JSON.stringify(profile)).not.toMatch(/duty_cycle|8958|bluetoothId|password/);
  await page.reload();
  await expect(page.locator('#profile option:checked')).toHaveText('Sony Bravia example');
  await expect(page.locator('#ir-status')).toContainText('No file loaded');
  await page.locator('#demo').click();
  await page.locator('#prepare').click();
  await expect(page.locator('#connection')).toContainText('Demo remote ready');
  await page.getByRole('button', { name: 'Power', exact: true }).click();
  await expect(page.locator('#attempts')).toHaveText('1');
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.irRadioCalls)).toBe(0);
});
test('local .ir upload parses the pinned full community file and leaves unsupported RAW unavailable', async ({
  page,
}) => {
  await radioGuard(page);
  await open(page);
  await page.locator('#ir-file').setInputFiles('tests/fixtures/sony-bravia.ir');
  await expect(page.locator('#ir-status')).toContainText('11 convertible, 2 unsupported');
  await expect(page.locator('#ir-signals input')).toHaveCount(13);
  await expect(page.locator('#ir-signals input:disabled')).toHaveCount(2);
  await expect(page.locator('#ir-count')).toHaveText('5 / 5 buttons selected');
  const available = page.locator('#ir-signals input:not(:disabled)');
  await available.nth(5).check();
  await expect(page.locator('#ir-count')).toHaveText('6 / 5 buttons selected');
  await expect(page.locator('#ir-save')).toBeDisabled();
  await available.nth(0).uncheck();
  await expect(page.locator('#ir-save')).toBeEnabled();
  await page.locator('#ir-name').fill('Sony exact model trial');
  await page.locator('#ir-save').click();
  await expect(page.locator('#profile option:checked')).toHaveText('Sony exact model trial');
  expect(await page.evaluate(() => window.irRadioCalls)).toBe(0);
});
test('malformed, oversized, or non-UTF8 files cannot replace saved setups or enable an earlier draft', async ({
  page,
}) => {
  await radioGuard(page);
  await open(page);
  await saveExample(page);
  await example(page);
  for (const buffer of [
    Buffer.from(fileHeader + signal('Power') + 'command: 00 00 00 00'),
    Buffer.alloc(128 * 1024 + 1, 65),
    Buffer.from([255, 254, 255]),
  ]) {
    await page
      .locator('#ir-file')
      .setInputFiles({ name: 'invalid.ir', mimeType: 'text/plain', buffer });
    await expect(page.locator('#ir-save')).toBeDisabled();
    await expect(page.locator('#ir-signals input')).toHaveCount(0);
    await expect(page.locator('#profile option')).toHaveCount(3);
    await expect(page.locator('#profile option:checked')).toHaveText('Sony Bravia example');
  }
  expect(await page.evaluate(() => window.irRadioCalls)).toBe(0);
});
test('paste import treats names as text and clear/background discard drafts without erasing saved profiles', async ({
  page,
}) => {
  await radioGuard(page);
  await open(page);
  await saveExample(page);
  await page.locator('#ir-paste-toggle').click();
  await page.locator('#ir-text').fill(fileHeader + signal('<img src=x>'));
  await expect(page.locator('#ir-save')).toBeDisabled();
  await expect(page.locator('#ir-status')).toContainText('Text changed');
  await page.locator('#ir-preview').click();
  await expect(page.locator('#ir-signals')).toContainText('<img src=x>');
  await expect(page.locator('#ir-signals img')).toHaveCount(0);
  await page.locator('#ir-clear').click();
  await expect(page.locator('#ir-signals input')).toHaveCount(0);
  await example(page);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#ir-save')).toBeDisabled();
  await expect(page.locator('#ir-status')).toContainText('No file loaded');
  await expect(page.locator('#profile option')).toHaveCount(3);
});
test('late file read after clear cannot replace a newer preview', async ({ page }) => {
  await page.addInitScript(() => {
    window.FileReader = class {
      readAsArrayBuffer() {
        window.finishOldIRRead = () => {
          this.result = new TextEncoder().encode('Filetype: wrong\n').buffer;
          this.onload?.();
        };
      }
      abort() {
        this.onabort?.();
      }
    };
  });
  await open(page);
  await page.locator('#ir-file').setInputFiles({
    name: 'slow.ir',
    mimeType: 'text/plain',
    buffer: Buffer.from(fileHeader + signal('Old')),
  });
  await expect(page.locator('#ir-status')).toContainText('Reading local file');
  await page.locator('#ir-clear').click();
  await example(page);
  await page.evaluate(() => window.finishOldIRRead());
  await expect(page.locator('#ir-status')).toContainText('5 convertible, 1 unsupported');
  await expect(page.locator('#ir-save')).toBeEnabled();
});
test('preview and saving during a live-interface fixture do not write; only explicit Prepare programs imported slots', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.irWrites = [];
    const status = new EventTarget();
    status.properties = { notify: true };
    status.startNotifications = async () => status;
    const writer = (type) => ({
      properties: { write: true },
      writeValueWithResponse: async (bytes) => {
        const value = JSON.parse(new TextDecoder().decode(bytes));
        window.irWrites.push({ type, ...value });
        status.value = new DataView(new TextEncoder().encode(type + ':' + value.slot).buffer);
        status.dispatchEvent(new Event('characteristicvaluechanged'));
      },
    });
    const config = writer('saved'),
      trigger = writer('sent'),
      device = new EventTarget();
    device.gatt = {
      connected: false,
      connect: async () => {
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
  });
  await open(page);
  await page.locator('#owner-check').check();
  await page.locator('#connect').click();
  await expect(page.locator('#connection')).toContainText('Connected');
  await page.locator('#prepare').click();
  await expect(page.getByRole('button', { name: 'Power', exact: true })).toBeEnabled();
  await example(page);
  await expect(page.getByRole('button', { name: 'Power', exact: true })).toBeEnabled();
  expect(await page.evaluate(() => window.irWrites.length)).toBe(5);
  await page.locator('#ir-save').click();
  await expect(page.locator('#ir-status')).toContainText('Saved 5');
  await expect(page.getByRole('button', { name: 'Power', exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.irWrites.length)).toBe(5);
  await page.locator('#prepare').click();
  await expect(page.getByRole('button', { name: 'Power', exact: true })).toBeEnabled();
  expect(
    await page.evaluate(() => window.irWrites.slice(5).map((v) => [v.proto, v.code, v.bits])),
  ).toEqual([
    ['SONY', '0xA90', 12],
    ['SONY', '0x490', 12],
    ['SONY', '0xC90', 12],
    ['SONY', '0xA50', 12],
    ['SONY', '0x290', 12],
  ]);
  expect(await page.evaluate(() => window.irWrites.filter((v) => v.type === 'sent').length)).toBe(
    0,
  );
});
test('expanded import preview fits a phone and meets keyboard/contrast/label checks', async ({
  page,
}) => {
  await open(page);
  await example(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await expect(page.locator('#ir-signals')).toHaveAttribute('tabindex', '0');
});
