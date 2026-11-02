import { test, expect } from '@playwright/test';

test('the Hub only labels a genuinely connected session LIVE', async ({ page }) => {
  await page.goto('/hub.html');
  await expect(page.locator('#source')).toHaveText('OFFLINE');
  await expect(page.locator('#connection-state')).toHaveText('Not connected');

  await page.locator('#hub-demo').click();
  await expect(page.locator('#source')).toHaveText('DEMO');
  await expect(page.locator('#connection-state')).toHaveText('Demo · ready');

  await page.locator('#hub-stop').click();
  await expect(page.locator('#source')).toHaveText('OFFLINE');
  await expect(page.locator('#connection-state')).toHaveText('Not connected');

  await page.reload();
  await expect(page.locator('#source')).toHaveText('OFFLINE');
});
