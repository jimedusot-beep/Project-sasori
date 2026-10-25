import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('first-use Simple Mode exposes Connect, Demo and Research with a short device-first flow', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.unexpectedRadio = 0;
    Object.defineProperty(navigator, 'bluetooth', {
      value: {
        requestDevice() {
          window.unexpectedRadio++;
          throw new Error('Unexpected Bluetooth');
        },
      },
    });
  });
  await page.goto('/hub.html');
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link'),
  ).toHaveCount(4);
  await expect(page.locator('#quick-actions #hub-connect')).toBeVisible();
  await expect(page.locator('#quick-actions #hub-demo')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Research Lab' })).toHaveAttribute(
    'href',
    'index.html',
  );
  await expect(page.locator('#quick-credentials #hub-password')).toBeVisible();
  expect(
    await page.locator('#hub-connect').evaluate((el) => el.getBoundingClientRect().top),
  ).toBeLessThan(
    await page.locator('#saved-setup').evaluate((el) => el.getBoundingClientRect().top),
  );
  await expect(page.locator('#connection-advanced')).not.toHaveAttribute('open', '');
  await page.locator('#hub-demo').click();
  await expect(page.locator('#connection-state')).toHaveText('Demo · ready');
  await expect(page.locator('#sticky-session')).toBeVisible();
  await expect(page.locator('#sticky-state')).toContainText('DEMO');
  await expect(page.locator('#hub-control-view')).toBeInViewport();
  await expect(page.locator('#hub-sound')).toBeEnabled();
  await page.locator('#hub-sound').click();
  await expect(page.locator('#connection-message')).toContainText('Sound request sent');
  await page.locator('#quick-stop').click();
  await expect(page.locator('#sticky-session')).toBeHidden();
  await expect(page.locator('#connection-state')).toHaveText('Not connected');
  expect(await page.evaluate(() => window.unexpectedRadio)).toBe(0);
});

test('advanced setup remains accessible but optional; browser failure offers a working demo', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, 'bluetooth', { value: undefined }),
  );
  await page.goto('/hub.html');
  await expect(page.locator('#hub-connect')).toBeDisabled();
  await expect(page.locator('#quick-guidance')).toContainText('Bluefy');
  await page.locator('#connection-advanced summary').click();
  await expect(page.locator('#elmo-mode')).toBeVisible();
  await expect(page.locator('#device-prefix')).toBeVisible();
  await page.locator('#elmo-mode').selectOption('check');
  await page.locator('#hub-demo').click();
  await expect(page.locator('#connection-state')).toHaveText('Demo · ready');
  await page.locator('#quick-stop').click();
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Discovery' })
    .click();
  await expect(page).toHaveURL(/signal-atlas\.html$/);
});

test('phone has clear primary navigation, visible Stop and no sideways scrolling', async ({
  page,
}) => {
  await page.goto('/hub.html');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  for (const id of ['hub-connect', 'hub-demo']) {
    expect(
      await page.locator('#' + id).evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#hub-demo').click();
  await expect(page.locator('#sticky-session')).toBeVisible();
  const report = await new AxeBuilder({ page }).analyze();
  expect(report.violations).toEqual([]);
});

test('full Research Lab remains directly accessible to advanced users', async ({ page }) => {
  await page.goto('/index.html#protocol');
  await expect(page.locator('#page-protocol')).toBeVisible();
  await page.goto('/hub.html');
  await page.getByRole('link', { name: 'Open Research Lab' }).click();
  await expect(page).toHaveURL(/index\.html$/);
  await expect(page.locator('#page-overview')).toBeVisible();
});
