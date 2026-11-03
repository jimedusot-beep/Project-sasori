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
    await expect(nav.getByRole('link', { name: current })).toHaveAttribute('aria-current', 'page');
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
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Routines' })
    .click();
  await expect(page).toHaveURL(/hub\.html#automations$/);
  await expect(
    page
      .getByRole('navigation', { name: 'Main navigation' })
      .getByRole('link', { name: 'Routines' }),
  ).toHaveAttribute('aria-current', 'page');
});

test('Explore and Saved fit narrow phones, support keyboard focus and remain screen-reader friendly', async ({
  page,
}, info) => {
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    for (const route of ['explore.html', 'projects.html']) {
      await page.goto('/' + route);
      if (route === 'projects.html') {
        await expect(page.locator('#project-refresh')).toBeEnabled();
        await expect(page.locator('#project-summary')).toContainText('sections available');
      }
      const firstLink = page.locator('#workspace a').first();
      await firstLink.focus();
      await expect(firstLink).toBeFocused();
      await page.keyboard.press('Tab');
      expect(
        await page.evaluate(() =>
          ['A', 'BUTTON', 'INPUT', 'SUMMARY'].includes(document.activeElement?.tagName),
        ),
      ).toBe(true);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
      await page.screenshot({
        path: info.outputPath(route + '-' + width + '-after.png'),
        fullPage: true,
      });
    }
  }
});
