import { defineConfig, devices } from '@playwright/test';
import { loadE2eEnv } from './e2e/helpers/env';

loadE2eEnv();

/**
 * Config of the screenshot/metrics capture (`npm run e2e:screens`). It is deliberately separate
 * from playwright.config.ts: `*.screens.ts` files are never picked up by `npm run e2e`.
 */
const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';
const storageState = 'e2e/.auth/admin.json';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.(screens|setup)\.ts/,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  outputDir: 'e2e/.results',
  use: {
    baseURL,
    locale: 'en-US',
  },
  webServer: {
    command: 'npm start',
    url: baseURL,
    reuseExistingServer: true,
    timeout: 240_000,
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      testMatch: /.*\.screens\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 }, storageState },
    },
    {
      name: 'mobile-375',
      testMatch: /.*\.screens\.ts/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 375, height: 812 },
        hasTouch: true,
        isMobile: true,
        storageState,
      },
    },
  ],
});
