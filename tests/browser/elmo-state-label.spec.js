import { test, expect } from '@playwright/test';

test('Elmo Remote never advertises a live device before actual connection', async ({ page }) => {
  await page.goto('/elmo.html');
  await expect(page.locator('#mode')).toHaveText('OFFLINE');

  await page.locator('#elmo-demo').click();
  await expect(page.locator('#mode')).toHaveText('DEMO');
  await page.locator('#elmo-greet').click();

  const detail = page.getByRole('region', { name: 'Device details' });
  await expect(detail.locator('[data-detail-field="outcome"]')).toContainText(
    'no physical command sent',
  );

  await page.locator('#elmo-sticky-stop').click();
  await expect(page.locator('#mode')).toHaveText('OFFLINE');
  await expect(detail.locator('[data-detail-field="physical"]')).toHaveText(
    'Not independently verified',
  );

  await page.reload();
  await expect(page.locator('#mode')).toHaveText('OFFLINE');
});
