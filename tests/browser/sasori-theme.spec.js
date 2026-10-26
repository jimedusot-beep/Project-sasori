import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const allPages = [
  'hub.html',
  'explore.html',
  'projects.html',
  'index.html',
  'elmo.html',
  'signal-atlas.html',
  'privacy.html',
  'pocket-ir.html',
  'keyfob-lab.html',
  'companion.html',
];

test('all existing workspaces use shared theme assets without requesting Bluetooth', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.unexpectedBluetooth = 0;
    Object.defineProperty(navigator, 'bluetooth', {
      configurable: true,
      value: {
        requestDevice() {
          window.unexpectedBluetooth += 1;
          throw new Error('Theme must not request Bluetooth');
        },
      },
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const url of allPages) {
    await page.goto('/' + url);
    const theme = await page.evaluate(() => ({
      background: getComputedStyle(document.body).backgroundColor,
      accent: getComputedStyle(document.documentElement).getPropertyValue('--accent-action').trim(),
      nav: document.querySelector('.sasori-primary-nav') !== null,
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      bluetooth: window.unexpectedBluetooth,
      hasTheme: [...document.styleSheets].some((s) => s.href?.includes('sasori-theme.css')),
    }));
    expect(theme.background, url).toBe('rgb(13, 10, 10)');
    expect(theme.accent, url).toBe('#b62937');
    expect(theme.nav, url).toBe(true);
    expect(theme.overflow, url).toBe(false);
    expect(theme.bluetooth, url).toBe(0);
    expect(theme.hasTheme, url).toBe(true);
  }
});

test('first-time Hub actions have distinct readable demo, selection and Stop treatments', async ({
  page,
}) => {
  await page.goto('/hub.html');
  const family = page.locator('.family-button[aria-pressed="true"]');
  await expect(family).toHaveCount(1);
  expect(await family.evaluate((node) => getComputedStyle(node).borderTopColor)).toBe(
    'rgb(241, 126, 135)',
  );
  const fill = await page.locator('#hub-connect').evaluate((node) => ({
    bg: getComputedStyle(node).backgroundColor,
    color: getComputedStyle(node).color,
  }));
  expect(fill.bg).toBe('rgb(182, 41, 55)');
  expect(fill.color).toBe('rgb(255, 245, 241)');
  await page.locator('#hub-demo').click();
  await expect(page.locator('#sticky-state')).toContainText('DEMO');
  await expect(page.locator('#quick-stop')).toBeVisible();
  await page.locator('#quick-stop').click();
  await expect(page.locator('#sticky-session')).toBeHidden();
});

test('visual review: before-and-after targets in phone and desktop sizes', async ({
  page,
}, info) => {
  for (const viewport of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'desktop', width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [pageName, route] of [
      ['hub', 'hub.html'],
      ['explore', 'explore.html'],
      ['saved', 'projects.html'],
    ]) {
      await page.goto('/' + route);
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true);
      const result = await new AxeBuilder({ page }).analyze();
      expect(result.violations, route).toEqual([]);
      await page.screenshot({
        path: info.outputPath('crimson-' + pageName + '-' + viewport.name + '.png'),
        fullPage: true,
      });
    }
  }
});

test('respect reduced motion and preserve keyboard focus visibility', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/explore.html');
  await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Explore' })
    .focus();
  const style = await page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByRole('link', { name: 'Explore' })
    .evaluate((node) => ({
      outlineStyle: getComputedStyle(node).outlineStyle,
      outlineWidth: getComputedStyle(node).outlineWidth,
    }));
  expect(style.outlineStyle).not.toBe('none');
  expect(style.outlineWidth).toBe('3px');
});
