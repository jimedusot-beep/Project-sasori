import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { ELMO_SERVICE, ELMO_RX, ELMO_TX } from '../../site/lib/elmo-codec.js';

async function downloaded(page, button) {
  const pending = page.waitForEvent('download');
  await page.locator(button).click();
  return JSON.parse(await readFile(await (await pending).path(), 'utf8'));
}
async function starter(page) {
  await page.locator('#routine-builder summary').click();
  await page.locator('#starter-routine').click();
  await page.locator('#save-routine').click();
  await expect(page.locator('#saved-routine')).not.toHaveValue('');
}
async function radio(page) {
  await page.addInitScript(
    ({ service, rxId, txId }) => {
      window.hubCalls = [];
      const rx = new EventTarget(),
        device = new EventTarget();
      let volume = 5;
      const notify = (bytes) => {
        rx.value = new DataView(Uint8Array.from(bytes).buffer);
        rx.dispatchEvent(new Event('characteristicvaluechanged'));
      };
      Object.assign(rx, {
        uuid: rxId,
        properties: { notify: true },
        startNotifications: async () => {
          notify([0x41, 0x10, 0x20, 0x30, 0x40]);
          return rx;
        },
      });
      const tx = {
        uuid: txId,
        properties: { writeWithoutResponse: true },
        async writeValueWithoutResponse(value) {
          const bytes = [...value];
          window.hubCalls.push(['write', bytes]);
          if (bytes[0] === 0x41) notify([0x40, bytes.join(',') === '65,10,142,18,236' ? 1 : 2]);
          if (bytes[0] === 0x23) volume = bytes[1];
          if (bytes[0] === 0x22) notify([0x22, volume]);
          if (bytes[0] === 0x20) notify([0x20, 0]);
        },
      };
      device.name = 'Synthetic radio Elmo';
      device.id = 'private-hub-fixture-id';
      device.gatt = {
        connected: false,
        async connect() {
          window.hubCalls.push(['connect']);
          this.connected = true;
          return this;
        },
        async getPrimaryService() {
          return { uuid: service, getCharacteristics: async () => [rx, tx] };
        },
        disconnect() {
          this.connected = false;
          window.hubCalls.push(['disconnect']);
        },
      };
      Object.defineProperty(navigator, 'bluetooth', {
        value: {
          async getDevices() {
            window.hubCalls.push(['grants']);
            return [device];
          },
          async requestDevice() {
            window.hubCalls.push(['choose']);
            return device;
          },
        },
      });
    },
    { service: ELMO_SERVICE, rxId: ELMO_RX, txId: ELMO_TX },
  );
}
async function localCompanion(page, file = 'hub.html') {
  await page.route('**/' + file, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      body: (await response.text()).replace('content="hosted"', 'content="local-helper"'),
    });
  });
  const calls = [];
  let rejectKey = false;
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    calls.push({ path, headers: request.headers(), data: request.postDataJSON() });
    const state = {
      keys: ['select', 'volume-down'],
      information: { label: 'Fixture TV', model: 'Fixture', state: 'on' },
      physicalEffectVerified: true,
    };
    let body = {},
      status = 200;
    if (path === '/api/pair') body = { paired: true };
    if (path === '/api/bootstrap')
      body = { paired: true, csrf: 'a'.repeat(64), canConfigure: true };
    if (path === '/api/tv/connect') body = { ...state, lease: 'b'.repeat(64) };
    if (path === '/api/tv/status') body = state;
    if (path === '/api/tv/key' && rejectKey) {
      status = 401;
      body = { code: 'pairing-required', message: 'private-backend-error' };
    }
    if (path === '/api/ha/configure') body = { remembered: false };
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  return {
    calls,
    rejectKeys: () => {
      rejectKey = true;
    },
  };
}

test('Elmo hub demo clears credentials, exposes bounded sound and volume controls and remains accessible on phones', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'bluetooth', { value: undefined }),
  );
  await page.goto('/hub.html');
  await expect(page.locator('#hub-connect')).toBeDisabled();
  await page.locator('#hub-password').fill('Synthetic-hub-value');
  await page.locator('#hub-demo').click();
  await expect(page.locator('#connection-state')).toHaveText('Demo · ready');
  await expect(page.locator('#hub-password')).toHaveValue('');
  await page.locator('#volume-choice').fill('3');
  await page.locator('#hub-volume').click();
  await expect(page.locator('#volume-note')).toContainText(
    'Reported volume: 3 / 15. Last requested: 3 / 15.',
  );
  await page.locator('#sound-choice').selectOption('444');
  await page.locator('#hub-sound').click();
  await expect(page.locator('#hub-sound')).toBeDisabled();
  await expect(page.locator('#connection-message')).toContainText('Sound request sent');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  for (const id of ['hub-demo', 'hub-stop', 'hub-sound', 'hub-volume'])
    expect(
      await page.locator('#' + id).evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath('device-hub.png'), fullPage: true });
  await page.locator('#hub-stop').click();
  const report = await downloaded(page, '#hub-result');
  expect(report.source).toBe('synthetic');
  expect(report.physicalEffectVerified).toBe(false);
  expect(JSON.stringify(report)).not.toContain('Synthetic-hub-value');
});

test('saved radio grants restore before a manual reconnect, without restoring passwords or opening a chooser', async ({
  page,
}) => {
  await radio(page);
  await page.goto('/hub.html');
  await page.locator('#device-label').fill('My fixture Elmo');
  await page.locator('#hub-password').fill('Lab-Only-42');
  await page.locator('#hub-connect').click();
  await expect(page.locator('#connection-state')).toHaveText('Toy reported acceptance');
  await expect(page.locator('#saved-setup option:checked')).toContainText('My fixture Elmo');
  expect(await page.evaluate(() => window.hubCalls.filter((c) => c[0] === 'choose').length)).toBe(
    1,
  );
  await page.locator('#hub-stop').click();
  await page.reload();
  await expect(page.locator('#hub-connect')).toHaveText('Reconnect device →');
  await expect(page.locator('#hub-password')).toHaveValue('');
  expect(await page.evaluate(() => window.hubCalls)).toEqual([['grants']]);
  await page.locator('#hub-password').fill('Lab-Only-42');
  await page.locator('#hub-connect').click();
  await expect(page.locator('#connection-state')).toHaveText('Toy reported acceptance');
  expect(await page.evaluate(() => window.hubCalls.some((c) => c[0] === 'choose'))).toBe(false);
  await page.locator('#hub-stop').click();
  const report = await downloaded(page, '#hub-result');
  const backup = await downloaded(page, '#hub-export');
  expect(backup.setups[0].label).toBe('My fixture Elmo');
  for (const value of ['private-hub-fixture-id', 'Lab-Only-42']) {
    expect(JSON.stringify(backup)).not.toContain(value);
    expect(JSON.stringify(report)).not.toContain(value);
  }
  expect(report.physicalEffectVerified).toBe(false);
});

test('a saved nose greeting routine needs a new press and exports synthetic results', async ({
  page,
}) => {
  await page.goto('/hub.html');
  await starter(page);
  await page.reload();
  await page.locator('#saved-routine').selectOption({ label: 'Nose → hello' });
  await expect(page.locator('#run-routine')).toBeDisabled();
  await page.locator('#hub-demo').click();
  await page.locator('#run-routine').click();
  await expect(page.locator('#routine-progress')).toContainText('Step 1 / 2');
  await page.locator('#simulate-touch').click();
  await expect(page.locator('#routine-progress')).toContainText('Routine completed: 2 steps');
  await expect(page.locator('#hub-sound')).toBeDisabled();
  const report = await downloaded(page, '#routine-result');
  expect(report.source).toBe('synthetic');
  expect(report.physicalEffectVerified).toBe(false);
  expect(report.outcome).toBe('completed');
});

test('Cancel prevents a later sound and page hiding disconnects a new session', async ({
  page,
}) => {
  await page.goto('/hub.html');
  await page.locator('#routine-builder summary').click();
  await page.locator('#routine-step').selectOption('wait');
  await page.locator('#step-wait').fill('5000');
  await page.locator('#add-step').click();
  await page.locator('#routine-step').selectOption('sound');
  await page.locator('#add-step').click();
  await page.locator('#save-routine').click();
  await expect(page.locator('#saved-routine')).not.toHaveValue('');
  await page.locator('#hub-demo').click();
  await page.locator('#run-routine').click();
  await expect(page.locator('#routine-progress')).toContainText('Step 1 / 2');
  await page.locator('#cancel-routine').click();
  await expect(page.locator('#routine-progress')).toContainText('cancelled');
  await expect(page.locator('#connection-state')).toHaveText('Not connected');
  expect((await downloaded(page, '#hub-result')).soundQueued).toBe(false);
  await page.locator('#hub-demo').click();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('#connection-state')).toHaveText('Not connected');
});

test('hub imports reject an invalid action atomically and never execute routines', async ({
  page,
}) => {
  await page.goto('/hub.html');
  const backup = {
    format: 'sasori.hub',
    schemaVersion: 1,
    revision: 0,
    setups: [
      { id: 'setup-import', label: 'Must not be saved', familyId: 'elmo-l2l/v1', namePrefix: '' },
    ],
    routines: [
      {
        id: 'routine-import',
        name: 'Invalid transmitter',
        familyId: 'elmo-l2l/v1',
        steps: [{ kind: 'action', intent: 'raw-write', args: { bytes: [1] } }],
      },
    ],
  };
  await page.locator('#hub-import').setInputFiles({
    name: 'invalid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await expect(page.locator('#storage-notice')).toContainText('Import was not saved');
  await page.reload();
  expect(await page.locator('#saved-setup option').count()).toBe(1);
  await expect(page.locator('#connection-state')).toHaveText('Not connected');
});

test('hosted TV guidance explains IR hardware and the demo remote and routine never contact a companion', async ({
  page,
}) => {
  const api = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/api/')) api.push(r.url());
  });
  await page.goto('/hub.html');
  await page.locator('[data-family="tv-local/v1"]').click();
  await expect(page.locator('#hub-connect')).toBeDisabled();
  await expect(page.locator('#tv-hosted')).toContainText('An IR hub is needed');
  await page.locator('#hub-demo').click();
  await expect(page.locator('#connection-state')).toHaveText('Demo · ready');
  await page.locator('[data-tv-key="select"]').click();
  await expect(page.locator('#connection-message')).toContainText('Remote button request sent');
  await starter(page);
  await page.locator('#run-routine').click();
  await expect(page.locator('#routine-progress')).toContainText('Routine completed: 3 steps');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  expect(api).toEqual([]);
});

test('paired TV controls enable only the companion capabilities and expire on an authorization error', async ({
  page,
}) => {
  const backend = await localCompanion(page);
  await page.goto('/hub.html');
  await page.locator('[data-family="tv-local/v1"]').click();
  await page.locator('#tv-target').fill('192.168.1.40');
  await page.locator('#companion-pin').fill('123456');
  await page.locator('#hub-connect').click();
  await expect(page.locator('#connection-state')).toHaveText('Connected');
  await expect(page.locator('#companion-pin')).toHaveValue('');
  expect(backend.calls.find((c) => c.path === '/api/tv/connect').data).toEqual({
    driver: 'roku',
    target: '192.168.1.40',
    device: 'sasori-tv',
  });
  await expect(page.locator('[data-tv-key="select"]')).toBeEnabled();
  await expect(page.locator('[data-tv-key="power-on"]')).toBeDisabled();
  await page.locator('[data-tv-key="select"]').click();
  await expect(page.locator('#connection-message')).toContainText('Remote button request sent');
  const key = backend.calls.find((c) => c.path === '/api/tv/key');
  expect(key.data).toEqual({ lease: 'b'.repeat(64), key: 'select' });
  expect(key.headers['x-sasori-csrf']).toBe('a'.repeat(64));
  backend.rejectKeys();
  await page.locator('[data-tv-key="select"]').click();
  await expect(page.locator('#connection-state')).toHaveText('Not connected');
  await expect(page.locator('#failure-help')).toContainText('Pair this browser');
  await expect(page.locator('#failure-help')).not.toContainText('private-backend-error');
  const report = await downloaded(page, '#hub-result');
  expect(report.physicalEffectVerified).toBe(false);
  for (const value of ['123456', '192.168.1.40', 'b'.repeat(64)])
    expect(JSON.stringify(report)).not.toContain(value);
});

test('hosted companion configuration disables credential entry', async ({ page }) => {
  await page.goto('/companion.html');
  await expect(page.locator('#setup-message')).toContainText(
    'Credentials cannot be entered on the hosted site',
  );
  for (const id of ['setup-pin', 'ha-token', 'ha-url', 'save-ha'])
    await expect(page.locator('#' + id)).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('local Home Assistant setup clears test secrets and never saves them in browser storage', async ({
  page,
}) => {
  const backend = await localCompanion(page, 'companion.html');
  await page.goto('/companion.html');
  await expect(page.locator('#save-ha')).toBeEnabled();
  await page.locator('#setup-pin').fill('123456');
  await page.locator('#ha-url').fill('http://192.168.1.10:8123');
  await page.locator('#ha-token').fill('SyntheticTestTokenOnly');
  await page.locator('#save-ha').click();
  await expect(page.locator('#setup-message')).toContainText(
    'Connection checked for this companion session',
  );
  await expect(page.locator('#setup-pin')).toHaveValue('');
  await expect(page.locator('#ha-token')).toHaveValue('');
  expect(backend.calls.find((c) => c.path === '/api/ha/configure').data).toEqual({
    url: 'http://192.168.1.10:8123',
    token: 'SyntheticTestTokenOnly',
    remember: false,
  });
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await page.reload();
  await expect(page.locator('#ha-token')).toHaveValue('');
});

test('Control session survives the old 30-second boundary and the soundboard can send another catalog request', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/hub.html');
  expect(await page.locator('#sound-choice option').count()).toBe(20);
  await page.locator('#hub-demo').click();
  await page.locator('[data-sound-id="9"]').click();
  await expect(page.locator('#sound-count')).toContainText('1 / 60');
  await expect(page.locator('[data-sound-id="448"]')).toBeDisabled();
  await page.clock.fastForward(4001);
  await expect(page.locator('[data-sound-id="448"]')).toBeEnabled();
  await page.locator('[data-sound-id="448"]').click();
  await expect(page.locator('#sound-count')).toContainText('2 / 60');
  await page.clock.fastForward(31000);
  await expect(page.locator('#connection-state')).toHaveText('Demo · ready');
  await page.locator('#hub-stop').click();
  const report = await downloaded(page, '#hub-result');
  expect(report.soundWrites).toBe(2);
  expect(report.sessionMode).toBe('control');
  expect(report.physicalEffectVerified).toBe(false);
});

test('Quick check remains a single-sound session', async ({ page }) => {
  await page.clock.install();
  await page.goto('/hub.html');
  await page.locator('#elmo-mode').selectOption('check');
  await page.locator('#hub-demo').click();
  await page.locator('#hub-sound').click();
  await page.clock.fastForward(5000);
  await expect(page.locator('#hub-sound')).toBeDisabled();
  await expect(page.locator('#sound-count')).toContainText('session limit reached');
  await page.locator('#hub-stop').click();
  expect((await downloaded(page, '#hub-result')).sessionMode).toBe('check');
});

test('saved touch mappings require manual arming and repeat only on new accepted presses', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/hub.html');
  await page.locator('#reactions-panel summary').click();
  await page.locator('#reaction-starter').click();
  await page.locator('#save-reactions').click();
  await expect(page.locator('#storage-notice')).toContainText('Touch mappings saved');
  await page.reload();
  await page.locator('#reactions-panel summary').click();
  await expect(page.locator('#reaction-mappings')).toContainText('Nose → Giggle');
  await expect(page.locator('#reaction-status')).toContainText('disarmed');
  await page.locator('#hub-demo').click();
  await page.locator('#arm-reactions').click();
  await expect(page.locator('#reaction-status')).toContainText('Armed · 0 requests');
  await page.locator('#simulate-touch').click();
  await expect(page.locator('#reaction-status')).toContainText('1 requests sent');
  await page.locator('#simulate-touch').click();
  await expect(page.locator('#reaction-status')).toContainText('1 busy/cooldown presses skipped');
  await page.clock.fastForward(4001);
  await page.locator('#simulate-touch').click();
  await expect(page.locator('#reaction-status')).toContainText('2 requests sent');
  await page.locator('#disarm-reactions').click();
  await page.clock.fastForward(4001);
  await page.locator('#simulate-touch').click();
  const report = await downloaded(page, '#reaction-result');
  expect(report.sent).toBe(2);
  expect(report.source).toBe('synthetic');
  expect(report.physicalEffectVerified).toBe(false);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('a ready-made performance sends several paced sound requests and can be cancelled between them', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/hub.html');
  await page.locator('#routine-builder summary').click();
  await page.locator('#performance-preset').selectOption('comedy');
  await page.locator('#starter-routine').click();
  await page.locator('#save-routine').click();
  await expect(page.locator('#saved-routine')).not.toHaveValue('');
  await page.locator('#hub-demo').click();
  await page.locator('#run-routine').click();
  await expect(page.locator('#sound-count')).toContainText('1 / 60');
  await page.clock.fastForward(5500);
  await expect(page.locator('#sound-count')).toContainText('2 / 60');
  await page.clock.fastForward(5500);
  await expect(page.locator('#routine-progress')).toContainText('Routine completed: 5 steps');
  expect((await downloaded(page, '#routine-result')).completedSteps).toBe(5);
  await page.locator('#hub-stop').click();
  await page.locator('#hub-demo').click();
  await page.locator('#run-routine').click();
  await expect(page.locator('#sound-count')).toContainText('1 / 60');
  await page.locator('#cancel-routine').click();
  await page.clock.fastForward(15000);
  expect((await downloaded(page, '#hub-result')).soundRequests).toBe(1);
});

test('backgrounding an armed reaction session disarms it and stops the connection', async ({
  page,
}) => {
  await page.goto('/hub.html');
  await page.locator('#hub-demo').click();
  await page.locator('#reactions-panel summary').click();
  await page.locator('#reaction-starter').click();
  await page.locator('#arm-reactions').click();
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  await expect(page.locator('#connection-state')).toHaveText('Not connected');
  await expect(page.locator('#reaction-status')).toContainText('Disarmed');
  expect((await downloaded(page, '#reaction-result')).reason).toBe('page-hidden');
});
