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

/** Server settings > "MG Event" tab: current event card (status, registrations, selection draft). */
export class MgEventAdminPage {
  readonly statusChip: Locator;
  readonly countChip: Locator;
  readonly registrationsPanel: Locator;
  readonly selection: Locator;
  readonly generate: Locator;
  readonly save: Locator;
  readonly publish: Locator;

  constructor(private readonly page: Page) {
    this.statusChip = page.locator('.status-chip');
    this.countChip = page.locator('.count-chip');
    // Only present once the selection is locked (published / in progress); in draft the pool is the list.
    this.registrationsPanel = page.locator('.registrations-panel');
    // The correction panel of the last finished event is a separate panel outside the current event card.
    this.selection = page.locator('.current-event-card app-mg-selection-panel');
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

  /** In draft states the "registered, not yet placed" pool is the registrations list. */
  poolRow(name: string): Locator {
    return this.selection.locator('ul .draft-row').filter({ has: this.page.getByText(name, { exact: true }) });
  }

  /** Locked states only: expands the "Registrations (N)" panel (idempotent). */
  async expandRegistrations(): Promise<void> {
    const header = this.registrationsPanel.locator('mat-expansion-panel-header');
    if ((await header.getAttribute('aria-expanded')) !== 'true') await header.click();
    await expect(header).toHaveAttribute('aria-expanded', 'true');
  }

  registrationRow(name: string): Locator {
    return this.registrationsPanel.locator('.registration-row').filter({ hasText: name });
  }

  draftPlayers(): Locator {
    return this.selection.locator('ol .draft-row .player-name');
  }
}
