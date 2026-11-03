import { expect, type Locator, type Page } from '@playwright/test';
import { DEMO_SERVER_NAME } from '../helpers/env';

/** A row of the ordered selection list in the MG correction panel. */
export class DraftRow {
  constructor(readonly root: Locator) {}

  get rank(): Locator {
    return this.root.locator('.rank');
  }

  get noPenalty(): Locator {
    return this.root.getByRole('checkbox', { name: 'No penalty' });
  }

  get collisionWarning(): Locator {
    return this.root.getByRole('alert');
  }

  get slotNameInput(): Locator {
    return this.root.getByLabel('Slot name');
  }

  async expectCost(cost: number): Promise<void> {
    await expect(this.root).toContainText(new RegExp(`Cost: ${cost}(?!\\d)`));
  }
}

/** Server settings > "MG Event" tab, correction panel of the last finished event. */
export class MgAdminPage {
  readonly panel: Locator;

  constructor(private readonly page: Page) {
    this.panel = page.locator('app-mg-selection-panel').filter({ hasText: 'Correct the last event' });
  }

  /** Opens the tab and refuses to continue unless the active server is ERA008-DEMO. */
  async open(): Promise<void> {
    await this.page.goto('/app/server-settings');
    await expect(this.page.getByText(DEMO_SERVER_NAME, { exact: true }).first()).toBeVisible();
    await this.page.getByRole('tab', { name: 'MG Event' }).click();
    await expect(this.panel).toBeVisible();
  }

  private get orderedList(): Locator {
    return this.panel.locator('ol');
  }

  player(name: string): DraftRow {
    const row = this.orderedList.getByRole('listitem').filter({ has: this.page.getByText(name, { exact: true }) });
    return new DraftRow(row);
  }

  emptySlot(): DraftRow {
    const row = this.orderedList.getByRole('listitem').filter({ has: this.page.getByLabel('Slot name') });
    return new DraftRow(row);
  }

  async addEmptySlot(): Promise<void> {
    await this.panel.getByRole('button', { name: 'Add empty slot' }).click();
  }

  async addFromPool(name: string): Promise<void> {
    await this.panel.getByRole('button', { name: `Add ${name}`, exact: true }).click();
  }

  async moveUp(name: string, times = 1): Promise<void> {
    for (let i = 0; i < times; i++) {
      await this.panel.getByRole('button', { name: `Move ${name} up`, exact: true }).click();
    }
  }

  async moveDown(name: string): Promise<void> {
    await this.panel.getByRole('button', { name: `Move ${name} down`, exact: true }).click();
  }

  async save(): Promise<void> {
    await this.panel.getByRole('button', { name: 'Save changes' }).click();
    await expect(this.page.getByText('Selection saved.')).toBeVisible();
  }
}
