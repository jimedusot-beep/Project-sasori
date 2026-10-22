import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ELMO_SERVICE, ELMO_NOTIFY } from '../../site/lib/profiles.js';
import { createToy, exportToys } from '../../site/lib/toys.js';

async function addToy(page) {
  await page.getByRole('button', { name: 'My toys', exact: true }).click();
  await page.locator('#toy-name').fill('Synthetic dancing robot');
  await page.locator('#toy-prefix').fill('Robo');
  await page.locator('#toy-service').fill(ELMO_SERVICE);
  await page.locator('#toy-source-note').fill('Synthetic fixture for software tests only');
  await page.locator('#toy-save').click();
  await expect(page.locator('.toy-profile')).toHaveCount(1);
}
test('toy profiles persist, load, export, import as copies, and keep sessions after deletion', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#storage-summary')).toContainText('IndexedDB', { visible: false });
  await addToy(page);
  await page.getByRole('button', { name: 'Load for inspection', exact: true }).click();
  await expect(page.locator('#name-prefix')).toHaveValue('Robo');
  await expect(page.locator('#notify')).toHaveValue('');
  await expect(page.locator('#elmo-probe-settings')).toBeHidden();
  await expect(page.locator('#state')).toHaveText('Idle');
  await page.locator('#simulation').check();
  await page.locator('#connect').click();
  await expect(page.locator('#state')).toHaveText('Disconnected');
  await expect(page.locator('#session-title')).toHaveValue(
    'Synthetic dancing robot · simulated inspection',
  );
  await page.getByRole('button', { name: 'My toys', exact: true }).click();
  const downloading = page.waitForEvent('download');
  await page.locator('#toy-export').click();
  const text = await readFile(await (await downloading).path(), 'utf8');
  await page.reload();
  await expect(page.locator('.toy-profile')).toHaveCount(1);
  await page
    .locator('#toy-import')
    .setInputFiles({ name: 'toys.json', mimeType: 'application/json', buffer: Buffer.from(text) });
  await expect(page.locator('.toy-profile')).toHaveCount(2);
  const ids = await page
    .locator('#profile option')
    .evaluateAll((nodes) => nodes.filter((n) => n.value.startsWith('toy-')).map((n) => n.value));
  expect(new Set(ids).size).toBe(2);
  await page
    .locator('.toy-profile')
    .first()
    .getByRole('button', { name: 'Delete profile', exact: true })
    .click();
  await page
    .locator('.toy-profile')
    .first()
    .getByRole('button', { name: 'Confirm profile deletion', exact: true })
    .click();
  await expect(page.locator('.toy-profile')).toHaveCount(1);
  await page.getByRole('button', { name: 'Research records' }).click();
  await expect(page.locator('.record-row')).toHaveCount(1);
});
test('malformed toy backup is atomic and firmware profiles cannot load', async ({ page }) => {
  const toy = createToy({
    label: 'Fixture',
    namePrefix: 'Robo',
    service: ELMO_SERVICE,
    notify: '',
    sourceNote: 'Synthetic fixture',
  });
  const data = exportToys([toy]);
  data.profiles.push({ ...toy, service: '00001530-1212-efde-1523-785feabcd123' });
  await page.goto('/#toys');
  await expect(page.locator('#toy-save')).toBeEnabled();
  await page.locator('#toy-import').setInputFiles({
    name: 'bad-toys.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(data)),
  });
  await expect(page.locator('#notice')).toContainText('Firmware update');
  await expect(page.locator('.toy-profile')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('#toy-save')).toBeEnabled();
  await expect(page.locator('.toy-profile')).toHaveCount(0);
});
test('observed notify endpoints prepare a new manual inspection without automatic traffic', async ({
  page,
}) => {
  await page.addInitScript(
    ({ service, notify }) => {
      window.fixtureRequests = [];
      window.fixtureSubscriptions = 0;
      const characteristic = new EventTarget();
      characteristic.uuid = notify;
      characteristic.properties = { read: true, notify: true };
      characteristic.startNotifications = async () => {
        window.fixtureSubscriptions++;
        return characteristic;
      };
      const device = new EventTarget();
      const gatt = {
        connected: false,
        async connect() {
          this.connected = true;
          return this;
        },
        async getPrimaryService() {
          return { uuid: service, getCharacteristics: async () => [characteristic] };
        },
        disconnect() {
          this.connected = false;
          device.dispatchEvent(new Event('gattserverdisconnected'));
        },
      };
      device.gatt = gatt;
      Object.defineProperty(navigator, 'bluetooth', {
        value: {
          requestDevice: async (options) => {
            window.fixtureRequests.push(options);
            return device;
          },
        },
      });
    },
    { service: ELMO_SERVICE, notify: ELMO_NOTIFY },
  );
  await page.goto('/');
  await expect(page.locator('#toy-save')).toBeEnabled();
  await addToy(page);
  await page.getByRole('button', { name: 'Load for inspection', exact: true }).click();
  await page.locator('#consent').check();
  await page.locator('#connect').click();
  await expect(page.locator('#state')).toHaveText('Inspecting');
  expect(await page.evaluate(() => window.fixtureRequests[0].filters)).toEqual([
    { namePrefix: 'Robo' },
  ]);
  expect(await page.evaluate(() => window.fixtureSubscriptions)).toBe(0);
  await page.getByRole('button', { name: 'Protocol explorer', exact: true }).click();
  const choose = page.getByRole('button', { name: 'Use for next inspection', exact: true });
  await expect(choose).toBeDisabled();
  await page.locator('#global-stop').click();
  await expect(choose).toBeEnabled();
  await choose.click();
  await expect(page.locator('#notify')).toHaveValue(ELMO_NOTIFY);
  await expect(page.locator('#consent')).not.toBeChecked();
  expect(await page.evaluate(() => window.fixtureRequests.length)).toBe(1);
  expect(await page.evaluate(() => window.fixtureSubscriptions)).toBe(0);
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.locator('#consent').check();
  await page.locator('#connect').click();
  await expect(page.locator('#state')).toHaveText('Inspecting');
  expect(await page.evaluate(() => window.fixtureSubscriptions)).toBe(1);
  await page.locator('#global-stop').click();
});
test('synthetic service maps never offer a live notification endpoint selector', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.locator('#toy-save')).toBeEnabled();
  await page.locator('#simulation').check();
  await page.locator('#connect').click();
  await expect(page.locator('#state')).toHaveText('Disconnected');
  await page.getByRole('button', { name: 'Protocol explorer', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Use for next inspection', exact: true }),
  ).toHaveCount(0);
});
