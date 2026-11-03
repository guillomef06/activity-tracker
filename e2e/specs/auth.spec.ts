import { expect, test } from '@playwright/test';
import { requireEnv } from '../helpers/env';
import { acknowledgeReleaseNotes } from '../helpers/release-notes';
import { AppShellPage } from '../pages/app-shell.page';
import { LoginPage } from '../pages/login.page';

/** Every test starts from a brand-new browser context with no session (no storageState). */
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('Authentication and route guards', () => {
  test.beforeEach(async ({ page }) => {
    await acknowledgeReleaseNotes(page);
  });

  test('should land on /app and show the user when valid credentials are submitted', async ({ page }) => {
    // Given a guest on the login page
    const login = new LoginPage(page);
    await login.open();

    // When they submit valid credentials
    await login.signIn(requireEnv('E2E_USERNAME'), requireEnv('E2E_PASSWORD'));

    // Then they land on the app and their identity is shown in the header menu
    await expect(page).toHaveURL(/\/app$/);
    await new AppShellPage(page).expectSignedInAs(process.env['E2E_DISPLAY_NAME'] ?? 'E2E Admin');
  });

  test('should show an error and stay on /login when the password is wrong', async ({ page }) => {
    // Given a guest on the login page
    const login = new LoginPage(page);
    await login.open();

    // When they submit a wrong password
    await login.signIn(requireEnv('E2E_USERNAME'), 'Definitely-Wrong-Password-1');

    // Then an error is displayed and they are not let in
    await expect(login.errorMessage).toContainText('Invalid username or password');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('should return to the login page and lock /app when the user logs out', async ({ page }) => {
    // Given a signed-in user
    const login = new LoginPage(page);
    await login.open();
    await login.signIn(requireEnv('E2E_USERNAME'), requireEnv('E2E_PASSWORD'));
    await expect(page).toHaveURL(/\/app$/);

    // When they log out
    await new AppShellPage(page).logout();

    // Then they are sent back to the login page
    await expect(page).toHaveURL(/\/login$/);
    await expect(login.submit).toBeVisible();

    // And /app is no longer reachable
    await page.goto('/app');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fapp$/);
  });

  for (const path of ['/app', '/app/server-settings']) {
    test(`should redirect to /login with a return URL when ${path} is opened without a session`, async ({ page }) => {
      // When a guest opens a protected route directly
      await page.goto(path);

      // Then the guard redirects to the login page, remembering where they wanted to go
      await expect(page).toHaveURL(`/login?returnUrl=${encodeURIComponent(path)}`);
      await expect(new LoginPage(page).submit).toBeVisible();
    });
  }

  test('should redirect a non super-admin to /app when /app/super-admin is opened', async ({ page }) => {
    // Given a server admin who is not a super admin
    const login = new LoginPage(page);
    await login.open();
    await login.signIn(requireEnv('E2E_USERNAME'), requireEnv('E2E_PASSWORD'));
    await expect(page).toHaveURL(/\/app$/);

    // When they open the super-admin area
    await page.goto('/app/super-admin');

    // Then the guard sends them back to the app home
    await expect(page).toHaveURL(/\/app$/);
  });
});
