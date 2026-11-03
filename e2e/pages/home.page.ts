import { expect, type Locator, type Page } from '@playwright/test';

/** /app: the member home page, a tab group (submit activity, leaderboard, MG, tools). */
export class HomePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/app');
    await expect(this.tab('Submit Activity')).toBeVisible();
  }

  tab(name: string): Locator {
    return this.page.getByRole('tab', { name });
  }

  async selectTab(name: string): Promise<void> {
    await this.tab(name).click();
    await expect(this.tab(name)).toHaveAttribute('aria-selected', 'true');
  }
}

/** "Submit Activity" tab. */
export class ActivityFormPage {
  readonly typeSelect: Locator;
  readonly position: Locator;
  readonly pointsPreview: Locator;
  readonly submit: Locator;

  constructor(private readonly page: Page) {
    this.typeSelect = page.getByRole('combobox', { name: 'Activity Type' });
    this.position = page.getByLabel('Position/Rank');
    this.pointsPreview = page.locator('.points-preview');
    this.submit = page.getByRole('button', { name: 'Submit Activity' });
  }

  async fill(activityLabel: string, position: number): Promise<void> {
    const option = this.page.getByRole('option', { name: activityLabel });
    // Opened before the season/settings finished loading, the panel stays empty: close and reopen until it lists options.
    await expect(async () => {
      await this.page.keyboard.press('Escape');
      await this.typeSelect.click();
      await expect(option).toBeVisible({ timeout: 1_500 });
    }).toPass({ timeout: 20_000 });
    await option.click();
    await this.position.fill(String(position));
  }

  async send(): Promise<void> {
    await this.submit.click();
    await expect(this.page.getByText('Activity submitted successfully!')).toBeVisible();
  }
}

/** "Leaderboard" tab: one expandable card per player. */
export class LeaderboardPage {
  constructor(private readonly page: Page) {}

  player(displayName: string): Locator {
    return this.page
      .locator('mat-card.score-card')
      .filter({ has: this.page.locator('.user-name', { hasText: displayName }) });
  }

  total(displayName: string): Locator {
    return this.player(displayName).locator('.score-chip').first();
  }

  async expand(displayName: string): Promise<void> {
    await this.player(displayName).locator('.score-header').click();
  }

  /** Opens the first week panel (current week) of an expanded player card. */
  async openCurrentWeek(displayName: string): Promise<Locator> {
    const panel = this.player(displayName).locator('mat-expansion-panel').first();
    await panel.locator('mat-expansion-panel-header').click();
    return panel;
  }
}
