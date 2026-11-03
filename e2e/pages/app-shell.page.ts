import { expect, type Locator, type Page } from '@playwright/test';

/** The authenticated layout: header with the user menu. */
export class AppShellPage {
  readonly header: Locator;

  constructor(private readonly page: Page) {
    this.header = page.locator('app-header');
  }

  /** The menu button only has an aria-hidden icon (no accessible name), so it is found by its popup role. */
  async openUserMenu(): Promise<void> {
    await this.header.locator('button[aria-haspopup="menu"]').click();
  }

  async expectSignedInAs(displayName: string): Promise<void> {
    await this.openUserMenu();
    await expect(this.page.getByRole('menu')).toContainText(displayName);
    await this.page.keyboard.press('Escape');
    await expect(this.page.getByRole('menu')).toBeHidden();
  }

  async logout(): Promise<void> {
    await this.openUserMenu();
    await this.page.getByRole('menuitem', { name: 'Logout' }).click();
  }
}
