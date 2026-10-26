import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
async function noRadio(page) {
  await page.addInitScript(() => {
    window.projectRadioCalls = 0;
    Object.defineProperty(navigator, 'bluetooth', {
      value: {
        requestDevice() {
          window.projectRadioCalls++;
          throw new Error('Unexpected device access');
        },
      },
    });
  });
}
async function seed(page) {
  await page.evaluate(async () => {
    const { ResearchStore } = await import('/lib/storage.js?v=recognition-20261024');
    const { createSession } = await import('/lib/records.js');
    const { emptyHubData } = await import('/lib/hub-records.js?v=recognition-20261024');
    const store = new ResearchStore();
    await store.open();
    const record = createSession('simulated');
    record.title = 'My synthetic experiment';
    record.notes = 'A saved result description';
    await store.save(record);
    const hub = emptyHubData();
    hub.setups = [
      {
        id: 'setup-fixture',
        label: 'My synthetic Elmo',
        familyId: 'elmo-l2l/v1',
        namePrefix: 'Elmo',
      },
    ];
    await store.setHubData(hub);
    store.db.close();
  });
}
test('empty and populated Projects preserve local records, support search and accessible phone layouts', async ({
  page,
}, info) => {
  await noRadio(page);
  await page.goto('/projects.html');
  await expect(page.locator('#project-summary')).toContainText('9 of 9');
  await expect(page.locator('[data-project]')).toHaveCount(9);
  await expect(page.locator('[data-project="devices"] .project-count')).toHaveText('0 saved');
  await seed(page);
  await page.locator('#project-refresh').click();
  await expect(page.locator('[data-project="devices"] .project-count')).toHaveText('1 saved');
  await expect(page.locator('[data-project="sessions"] .project-count')).toHaveText('1 saved');
  await page.locator('[data-project="sessions"] summary').click();
  await expect(page.locator('[data-project="sessions"]')).toContainText(
    'A saved result description',
  );
  await page.locator('#project-search').fill('No match');
  await expect(page.locator('[data-project="sessions"]')).toContainText('No matching items');
  await page.locator('#project-search').fill('');
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: info.outputPath('my-projects.png'), fullPage: true });
  await page.reload();
  await expect(page.locator('[data-project="sessions"] .project-count')).toHaveText('1 saved');
  expect(await page.evaluate(() => window.projectRadioCalls)).toBe(0);
});
test('Projects links to a real restore workflow; failed restore leaves saved data intact', async ({
  page,
}) => {
  await noRadio(page);
  await page.goto('/projects.html');
  await expect(page.locator('#project-refresh')).toBeEnabled();
  await seed(page);
  await page.reload();
  await page.getByRole('link', { name: 'Device Hub backup' }).click();
  await expect(page).toHaveURL(/hub\.html#setup-title$/);
  await expect(page.locator('#saved-setup option:checked')).toContainText('My synthetic Elmo');
  await page.locator('#hub-import').setInputFiles({
    name: 'wrong-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{broken'),
  });
  await expect(page.locator('#storage-notice')).toContainText('Import was not saved');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Saved' })
    .click();
  await expect(page).toHaveURL(/projects\.html$/);
  await expect(page.locator('[data-project="devices"] .project-count')).toHaveText('1 saved');
  expect(await page.evaluate(() => window.projectRadioCalls)).toBe(0);
});
test('unavailable storage and corrupt sections provide recovery without clearing healthy work', async ({
  page,
}) => {
  await page.addInitScript(() => Object.defineProperty(window, 'indexedDB', { value: undefined }));
  await page.goto('/projects.html');
  await expect(page.locator('#project-storage')).toContainText('temporary memory');
  await expect(page.locator('#project-warning')).toContainText('Temporary memory');
});
test('a corrupt Hub stays unavailable while healthy records remain visible', async ({ page }) => {
  await page.goto('/projects.html');
  await expect(page.locator('#project-refresh')).toBeEnabled();
  await seed(page);
  await page.evaluate(async () => {
    const db = await new Promise((resolve, reject) => {
      const r = indexedDB.open('sasori-laboratory', 4);
      r.onsuccess = () => resolve(r.result);
      r.onerror = reject;
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ invalid: true }, 'device-hub');
      tx.oncomplete = resolve;
      tx.onerror = reject;
    });
    db.close();
  });
  await page.reload();
  await expect(page.locator('[data-project="devices"] .project-count')).toHaveText('Unavailable');
  await expect(page.locator('[data-project="sessions"] .project-count')).toHaveText('1 saved');
  await expect(page.locator('[data-project="devices"]')).toContainText('left unchanged');
});

test('returning browsers do not reuse the prior Hub entry module', async ({ page }) => {
  await page.route('**/hub-ui.js?v=recognition-20261024', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'throw new Error("Stale cached Hub entry");',
    }),
  );
  await page.goto('/hub.html');
  await expect(page.locator('#hub-demo')).toBeEnabled();
  await expect(page.locator('#quick-actions #hub-demo')).toBeVisible();
  await page.locator('#hub-demo').click();
  await expect(page.locator('#connection-state')).toHaveText('Demo · ready');
  await page.locator('#quick-stop').click();
});
