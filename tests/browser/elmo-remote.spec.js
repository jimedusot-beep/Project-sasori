import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ELMO_SERVICE, ELMO_RX, ELMO_TX } from '../../site/lib/elmo-codec.js';

async function toy(page, mode = 'ok') {
  await page.addInitScript(
    ({ service, rxId, txId, mode, setupBytes }) => {
      window.elmoCalls = [];
      window.elmoMode = mode;
      const rx = new EventTarget(),
        device = new EventTarget();
      let passwordSet = false;
      const notify = (bytes) => {
        rx.value = new DataView(Uint8Array.from(bytes).buffer);
        rx.dispatchEvent(new Event('characteristicvaluechanged'));
      };
      Object.assign(rx, {
        uuid: rxId,
        properties: { notify: true },
        startNotifications: async () => {
          notify(
            window.elmoMode === 'unset' && !passwordSet
              ? [0x40, 0]
              : [0x41, 0x10, 0x20, 0x30, 0x40],
          );
          return rx;
        },
      });
      const tx = {
        uuid: txId,
        properties: { writeWithoutResponse: true },
        async writeValueWithoutResponse(value) {
          const bytes = Array.from(value);
          window.elmoCalls.push(['write', bytes]);
          if (bytes[0] === 0x41)
            notify(
              window.elmoMode === 'reject' || bytes.join(',') !== '65,10,142,18,236'
                ? [0x40, 2]
                : [0x40, 1],
            );
          if (bytes[0] === 0x40 && window.elmoMode === 'unset') {
            passwordSet = bytes.join(',') === setupBytes.join(',');
            notify([0x40, passwordSet ? 1 : 2]);
          }
          if (bytes[0] === 0x22) notify([0x22, 5]);
          if (bytes[0] === 0x20) notify([0x20, 0x41]);
        },
      };
      device.name = 'Fixture Elmo';
      device.id = 'private-fixture-radio-id';
      device.gatt = {
        connected: false,
        async connect() {
          window.elmoCalls.push(['connect']);
          this.connected = true;
          return this;
        },
        async getPrimaryService() {
          return { uuid: service, getCharacteristics: async () => [rx, tx] };
        },
        disconnect() {
          window.elmoCalls.push(['disconnect']);
          this.connected = false;
        },
      };
      Object.defineProperty(navigator, 'bluetooth', {
        value: {
          requestDevice(options) {
            window.elmoCalls.push(['choose', options]);
            if (window.elmoMode === 'pending')
              return new Promise((resolve) => {
                window.finishElmoChoice = () => resolve(device);
              });
            return Promise.resolve(device);
          },
        },
      });
    },
    {
      service: ELMO_SERVICE,
      rxId: ELMO_RX,
      txId: ELMO_TX,
      mode,
      setupBytes: [0x40, ...createHash('md5').update('Lab-Only-42').digest()],
    },
  );
}

test('remote demo needs no Bluetooth, stays synthetic, clears typed values and has accessible responsive controls', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'bluetooth', { value: undefined }),
  );
  await page.goto('/elmo.html');
  await expect(page.locator('#elmo-connect')).toBeDisabled();
  await expect(page.locator('#browser-links')).toBeVisible();
  await page.locator('#elmo-password').fill('Synthetic-only-ui-value');
  await page.locator('#elmo-demo').click();
  await expect(page.locator('#elmo-state')).toHaveText('Demo · ready');
  await expect(page.locator('#demo-note')).toBeVisible();
  await expect(page.locator('#elmo-password')).toHaveValue('');
  await expect(page.locator('#elmo-volume')).toHaveText('5 / 15');
  await page.locator('#elmo-greet').click();
  await expect(page.locator('#elmo-greet')).toBeDisabled();
  await page.locator('#elmo-status').click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  for (const id of ['elmo-connect', 'elmo-greet', 'elmo-status', 'elmo-disconnect'])
    expect(
      await page.locator('#' + id).evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath('elmo-remote.png'), fullPage: true });
  await page.locator('#elmo-disconnect').click();
  const pending = page.waitForEvent('download');
  await page.locator('#elmo-save').click();
  const text = await readFile(await (await pending).path(), 'utf8'),
    report = JSON.parse(text);
  expect(report.source).toBe('synthetic');
  expect(report.physicalEffectVerified).toBe(false);
  expect(text).not.toContain('Synthetic-only-ui-value');
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('buttons perform a scoped live handshake and one greeting while receipts omit all authentication material', async ({
  page,
}) => {
  await toy(page);
  const outgoing = [];
  page.on('request', (req) => outgoing.push(req.url()));
  await page.goto('/elmo.html');
  expect(await page.evaluate(() => window.elmoCalls)).toEqual([]);
  await page.locator('#elmo-password').fill('Lab-Only-42');
  await page.locator('#elmo-connect').click();
  await expect(page.locator('#elmo-state')).toHaveText('Toy reported acceptance');
  await expect(page.locator('#elmo-greet')).toBeEnabled();
  await expect(page.locator('#elmo-password')).toHaveValue('');
  expect(
    await page.evaluate(() => window.elmoCalls.find((c) => c[0] === 'choose')[1].optionalServices),
  ).toEqual([ELMO_SERVICE]);
  expect(
    await page.evaluate(() => window.elmoCalls.filter((c) => c[0] === 'write').map((c) => c[1])),
  ).toEqual([[65, 10, 142, 18, 236], [34], [32]]);
  await page.locator('#elmo-greet').click();
  await expect(page.locator('#elmo-message')).toContainText('Listen to your toy');
  await expect(page.locator('#playback-note')).toBeVisible();
  expect(
    await page.evaluate(
      () => window.elmoCalls.filter((c) => c[0] === 'write' && c[1][0] === 16).length,
    ),
  ).toBe(1);
  await page.locator('#elmo-disconnect').click();
  await expect(page.locator('#elmo-greet')).toBeDisabled();
  const pending = page.waitForEvent('download');
  await page.locator('#elmo-save').click();
  const text = await readFile(await (await pending).path(), 'utf8'),
    report = JSON.parse(text);
  expect(report.source).toBe('live');
  expect(report.helloQueued).toBe(true);
  expect(report.authenticationVerified).toBe(false);
  for (const secret of ['Lab-Only-42', 'private-fixture-radio-id', '410a8e12ec', '10203040'])
    expect(text).not.toContain(secret);
  expect(outgoing.some((url) => url.includes('Lab-Only-42'))).toBe(false);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test('rejection disables all actions and gives a useful result without retrying', async ({
  page,
}) => {
  await toy(page, 'reject');
  await page.goto('/elmo.html');
  await page.locator('#elmo-password').fill('Lab-Only-42');
  await page.locator('#elmo-connect').click();
  await expect(page.locator('#elmo-message')).toContainText('Elmo rejected that password');
  await expect(page.locator('#elmo-greet')).toBeDisabled();
  await expect(page.locator('#elmo-status')).toBeDisabled();
  expect(await page.evaluate(() => window.elmoCalls.filter((c) => c[0] === 'write').length)).toBe(
    1,
  );
  expect(await page.evaluate(() => window.elmoCalls.filter((c) => c[0] === 'choose').length)).toBe(
    1,
  );
});

test('an unset toy requires explicit setup selection before a new password is sent and can reconnect afterward', async ({
  page,
}) => {
  await toy(page, 'unset');
  await page.goto('/elmo.html');
  await expect(page.locator('#allow-password-setup')).not.toBeChecked();
  await page.locator('#elmo-password').fill('Lab-Only-42');
  await page.locator('#elmo-connect').click();
  await expect(page.locator('#elmo-message')).toContainText('Elmo reports no password is set');
  await expect(page.locator('#elmo-greet')).toBeDisabled();
  expect(await page.evaluate(() => window.elmoCalls.some((c) => c[0] === 'write'))).toBe(false);
  await page.locator('#allow-password-setup').check();
  await page.locator('#elmo-password').fill('Lab-Only-42');
  await page.locator('#elmo-connect').click();
  await expect(page.locator('#elmo-greet')).toBeEnabled();
  await expect(page.locator('#elmo-message')).toContainText('new-password acceptance');
  await expect(page.locator('#elmo-password')).toHaveValue('');
  await expect(page.locator('#allow-password-setup')).toBeDisabled();
  expect(
    await page.evaluate(() => window.elmoCalls.filter((c) => c[0] === 'write').map((c) => c[1])),
  ).toEqual([[0x40, ...createHash('md5').update('Lab-Only-42').digest()], [0x22], [0x20]]);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.locator('#elmo-disconnect').click();
  const pending = page.waitForEvent('download');
  await page.locator('#elmo-save').click();
  const text = await readFile(await (await pending).path(), 'utf8'),
    report = JSON.parse(text);
  expect(report.passwordSetupOutcome).toBe('toy-reported-acceptance');
  expect(report.authenticationVerified).toBe(false);
  expect(text).not.toContain('Lab-Only-42');
  expect(text).not.toContain(createHash('md5').update('Lab-Only-42').digest('hex'));
  await page.locator('#allow-password-setup').uncheck();
  await page.locator('#elmo-password').fill('Lab-Only-42');
  await page.locator('#elmo-connect').click();
  await expect(page.locator('#elmo-greet')).toBeEnabled();
  expect(
    await page.evaluate(
      () => window.elmoCalls.filter((c) => c[0] === 'write' && c[1][0] === 0x40).length,
    ),
  ).toBe(1);
});

test('setup opt-in cannot overwrite a rejected existing password and recovery explains the physical reset', async ({
  page,
}) => {
  await toy(page, 'reject');
  await page.goto('/elmo.html');
  await page.getByText('I don’t know Elmo’s password', { exact: true }).click();
  await expect(
    page.getByText('Forgotten-password recovery erases the toy’s saved personalization.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Hasbro’s factory-reset instructions' }),
  ).toHaveAttribute('href', /a_id\/366/);
  await expect(page.getByRole('link', { name: 'Hasbro’s password-display guide' })).toHaveAttribute(
    'href',
    /a_id\/353/,
  );
  await page.locator('#allow-password-setup').check();
  await page.locator('#elmo-password').fill('Lab-Only-42');
  await page.locator('#elmo-connect').click();
  await expect(page.locator('#elmo-message')).toContainText('Elmo rejected that password');
  await expect(page.locator('#elmo-greet')).toBeDisabled();
  expect(
    await page.evaluate(() => window.elmoCalls.filter((c) => c[0] === 'write').map((c) => c[1][0])),
  ).toEqual([0x41]);
});

test('reconnect reuses only an already chosen device while a reload never restores a password or starts Bluetooth', async ({
  page,
}) => {
  await toy(page);
  await page.goto('/elmo.html');
  await page.locator('#elmo-password').fill('Lab-Only-42');
  await page.locator('#elmo-connect').click();
  await expect(page.locator('#elmo-greet')).toBeEnabled();
  await page.locator('#elmo-disconnect').click();
  await page.locator('#elmo-password').fill('Lab-Only-42');
  await page.locator('#elmo-connect').click();
  await expect(page.locator('#elmo-greet')).toBeEnabled();
  expect(await page.evaluate(() => window.elmoCalls.filter((c) => c[0] === 'choose').length)).toBe(
    1,
  );
  await page.reload();
  await expect(page.locator('#elmo-password')).toHaveValue('');
  await expect(page.locator('#elmo-greet')).toBeDisabled();
  expect(await page.evaluate(() => window.elmoCalls)).toEqual([]);
});

test('disconnect cancels a pending chooser and closes a late selection without any GATT connect', async ({
  page,
}) => {
  await toy(page, 'pending');
  await page.goto('/elmo.html');
  await page.locator('#show-all').check();
  await page.locator('#elmo-password').fill('Lab-Only-42');
  await page.locator('#elmo-connect').click();
  await expect(page.locator('#elmo-disconnect')).toBeEnabled();
  await page.locator('#elmo-disconnect').click();
  await page.evaluate(() => window.finishElmoChoice());
  await expect(page.locator('#elmo-greet')).toBeDisabled();
  expect(await page.evaluate(() => window.elmoCalls.some((c) => c[0] === 'connect'))).toBe(false);
  expect(
    await page.evaluate(() => window.elmoCalls.find((c) => c[0] === 'choose')[1].acceptAllDevices),
  ).toBe(true);
});

test('leaving the page stops the active connection and the main app exposes the direct remote link', async ({
  page,
}) => {
  await toy(page);
  await page.goto('/elmo.html');
  await page.locator('#elmo-password').fill('Lab-Only-42');
  await page.locator('#elmo-connect').click();
  await expect(page.locator('#elmo-greet')).toBeEnabled();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('#elmo-message')).toContainText('page was hidden');
  await expect(page.locator('#elmo-greet')).toBeDisabled();
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Elmo remote.*Connect/ })).toHaveAttribute(
    'href',
    'elmo.html',
  );
});
