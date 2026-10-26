import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const pages = [
  ['hub.html', 'Devices'],
  ['elmo.html', 'Devices'],
  ['pocket-ir.html', 'Devices'],
  ['companion.html', 'Devices'],
  ['explore.html', 'Explore'],
  ['signal-atlas.html', 'Explore'],
  ['privacy.html', 'Explore'],
  ['keyfob-lab.html', 'Explore'],
  ['index.html', 'Explore'],
  ['projects.html', 'Saved'],
];

test('the same four accessible destinations appear across every existing workspace', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.unexpectedBluetooth = 0;
    Object.defineProperty(navigator, 'bluetooth', {
      value: {
        requestDevice() {
          window.unexpectedBluetooth += 1;
          throw new Error('Unexpected permission request');
        },
      },
    });
  });
  for (const [pathname, current] of pages) {
    await page.goto('/' + pathname);
    const nav = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(nav.getByRole('link')).toHaveText(['Devices', 'Routines', 'Explore', 'Saved']);
    await expect(nav.getByRole('link', { name: current })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(await page.evaluate(() => window.unexpectedBluetooth)).toBe(0);
  }
});

test('Explore keeps legacy research routes reachable without starting hardware', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explore.html');
  for (const href of [
    'signal-atlas.html',
    'index.html#overview',
    'index.html#protocol',
    'index.html#discovery',
    'index.html#sessions',
    'privacy.html',
    'keyfob-lab.html',
    'pocket-ir.html',
  ]) {
    await expect(page.locator(`main a[href="${href}"]`)).toHaveCount(1);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: info.outputPath('unified-explore-phone.png'), fullPage: true });
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Routines' }).click();
  await expect(page).toHaveURL(/hub\.html#automations$/);
  await expect(
    page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Routines' }),
  ).toHaveAttribute('aria-current', 'page');
});
