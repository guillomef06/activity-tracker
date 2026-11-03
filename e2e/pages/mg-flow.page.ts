import { expect, type Locator, type Page } from '@playwright/test';
import { DEMO_SERVER_NAME } from '../helpers/env';
import { HomePage } from './home.page';

/** Home page "Mightiest Gov." tab, as a player sees it. */
export class MgPlayerPage {
  readonly eventCard: Locator;
  readonly registerButton: Locator;
  readonly unregisterButton: Locator;
  readonly registeredBadge: Locator;
  readonly waitingMessage: Locator;
  readonly selectionTitle: Locator;
  readonly ffaInfo: Locator;

  constructor(private readonly page: Page) {
    this.eventCard = page.locator('app-mg-event-card');
    this.registerButton = this.eventCard.getByRole('button', { name: 'Register', exact: true });
    this.unregisterButton = this.eventCard.getByRole('button', { name: 'Unregister' });
    this.registeredBadge = this.eventCard.locator('.badge-registered');
    this.waitingMessage = this.eventCard.getByText('The selection list will be published soon.');
    this.selectionTitle = page.getByText('Selected players', { exact: true });
    this.ffaInfo = page.locator('app-mightiest-governor .ffa-row');
  }

  async open(): Promise<void> {
    const home = new HomePage(this.page);
    await home.open();
    await home.selectTab('Mightiest Gov.');
  }

  /** Registers with the first desired position offered and no comment. */
  async register(): Promise<void> {
    // Keyboard open: on a 375px screen the field's required-marker overlay intercepts the pointer click.
    const position = this.eventCard.getByRole('combobox', { name: 'Desired position' });
    await position.focus();
    await this.page.keyboard.press('Enter');
    await this.page.getByRole('option').first().click();
    await this.registerButton.click();
    await expect(this.page.getByText('Registration confirmed.')).toBeVisible();
  }

  async unregister(): Promise<void> {
    await this.unregisterButton.click();
    await expect(this.page.getByText('You have been unregistered.')).toBeVisible();
  }

  /** Names shown in the published table, in rank order. */
  publishedPlayers(): Locator {
    return this.page.locator('app-mightiest-governor .mg-player-name');
  }
}

/** Server settings > "MG Event" tab: current event, registrations and the selection draft. */
export class MgEventAdminPage {
  readonly statusChip: Locator;
  readonly registrations: Locator;
  readonly selection: Locator;
  readonly generate: Locator;
  readonly save: Locator;
  readonly publish: Locator;

  constructor(private readonly page: Page) {
    this.statusChip = page.locator('.status-chip');
    this.registrations = page.locator('mat-card').filter({ has: page.getByText(/^Registrations \(\d+\)$/) });
    // The correction panel of the last finished event shares the component; this is the current event's.
    this.selection = page.locator('app-mg-selection-panel').filter({ hasNotText: 'Correct the last event' });
    this.generate = this.selection.getByRole('button', { name: 'Generate auto selection' });
    this.save = this.selection.getByRole('button', { name: 'Save changes' });
    this.publish = this.selection.getByRole('button', { name: 'Publish selection' });
  }

  /** Opens the tab and refuses to continue unless the active server is ERA008-DEMO. */
  async open(): Promise<void> {
    await this.page.goto('/app/server-settings');
    await expect(this.page.getByText(DEMO_SERVER_NAME, { exact: true }).first()).toBeVisible();
    await this.page.getByRole('tab', { name: 'MG Event' }).click();
    await expect(this.statusChip).toBeVisible();
  }

  registrationRow(name: string): Locator {
    return this.registrations.locator('.registration-row').filter({ hasText: name });
  }

  draftPlayers(): Locator {
    return this.selection.locator('ol .draft-row .player-name');
  }
}
