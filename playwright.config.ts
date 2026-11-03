import { defineConfig, devices } from '@playwright/test';
import { loadE2eEnv } from './e2e/helpers/env';

loadE2eEnv();

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:4200';
const storageState = 'e2e/.auth/admin.json';

export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.(spec|setup)\.ts/,
  // One shared Supabase project: specs seed/clean the same ERA008-DEMO event, so no parallelism.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e/.report' }]],
  outputDir: 'e2e/.results',
  use: {
    baseURL,
    locale: 'en-US',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
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
      testMatch: /.*\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState },
    },
    {
      name: 'mobile-375',
      testMatch: /.*\.spec\.ts/,
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
