import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 30000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.SASORI_TEST_URL || 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  webServer: process.env.SASORI_TEST_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
      },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'iphone-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
