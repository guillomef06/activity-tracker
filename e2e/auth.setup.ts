import { expect, test as setup } from '@playwright/test';
import { assertDemoServerConfigured, DEMO_SERVER_NAME, requireEnv } from './helpers/env';

setup('login as e2e_admin on ERA008-DEMO', async ({ page }) => {
  assertDemoServerConfigured();

  await page.goto('/login');
  await page.getByLabel('Username').fill(requireEnv('E2E_USERNAME'));
  await page.getByLabel('Password', { exact: true }).fill(requireEnv('E2E_PASSWORD'));
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(/\/app/);

  // Second guard, on what the user actually sees: the active server must be ERA008-DEMO.
  await page.goto('/app/server-settings');
  await expect(page.getByText(DEMO_SERVER_NAME, { exact: true }).first()).toBeVisible();

  // The "What's New" dialog blocks every click until acknowledged; the "seen" flag lives in
  // localStorage, so acknowledging it once here carries over via storageState.
  const markAsRead = page.getByRole('button', { name: 'Mark as read' });
  const dialogShown = await markAsRead.waitFor({ state: 'visible', timeout: 8_000 }).then(
    () => true,
    () => false
  );
  if (dialogShown) {
    await markAsRead.click();
    await expect(markAsRead).toBeHidden();
  }

  await page.context().storageState({ path: 'e2e/.auth/admin.json' });
});
