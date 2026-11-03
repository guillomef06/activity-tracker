import { expect, type Locator, type Page } from '@playwright/test';

/** The /login page (guest-only). */
export class LoginPage {
  readonly username: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly errorMessage: Locator;

  constructor(private readonly page: Page) {
    this.username = page.getByLabel('Username');
    this.password = page.getByLabel('Password', { exact: true });
    this.submit = page.getByRole('button', { name: 'Sign In', exact: true });
    this.errorMessage = page.locator('.error-message');
  }

  async open(): Promise<void> {
    await this.page.goto('/login');
    await expect(this.submit).toBeVisible();
  }

  async signIn(username: string, password: string): Promise<void> {
    await this.username.fill(username);
    await this.password.fill(password);
    await this.submit.click();
  }
}
