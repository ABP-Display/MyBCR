import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4173/MiniBCR/',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run build && node scripts/serve-test.mjs',
    url: 'http://127.0.0.1:4173/MiniBCR/',
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
