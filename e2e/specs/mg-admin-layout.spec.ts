import { expect, test, type Page } from '@playwright/test';
import { FLOW_EVENT_START, MgSeeder, SEED_EVENT_START, type SettingsSnapshot } from '../helpers/mg-seed';
import { MgAdminPage } from '../pages/mg-admin.page';
import { MgEventAdminPage } from '../pages/mg-flow.page';

const REGISTRANTS = ['Demo Player 1', 'Demo Player 2'] as const;
const HOST = 'app-mg-admin-tab';

/** Vertical position of an element on the page, to assert the visual order of the sections. */
async function top(page: Page, selector: string): Promise<number> {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error(`${selector} has no box`);
  return box.y;
}

/** Expands the settings panel, sets capacity 50 and the first slot cost to 151 (nothing is saved). */
async function editSettings(page: Page): Promise<void> {
  const settings = page.locator(`${HOST} .settings-panel`);
  const header = settings.locator('mat-expansion-panel-header');
  await header.click();
  await expect(header).toHaveAttribute('aria-expanded', 'true');
  await settings.getByRole('combobox', { name: 'Capacity' }).click();
  await page.getByRole('option', { name: '50', exact: true }).click();
  const firstCost = settings.getByLabel('Cost').first();
  await expect(firstCost).toHaveValue('150');
  await firstCost.fill('151');
}

/**
 * Layout of the admin "MG Event" tab on ERA008-DEMO: one current-event card, then the correction
 * panel, then the (collapsed) settings. Runs on desktop and mobile-375. Events are seeded per test
 * on the two reserved dates and removed afterwards; the settings tests snapshot and restore the
 * server's MG config and slot config.
 */
test.describe('MG admin tab layout', () => {
  let seeder: MgSeeder;
  let initialSettings: SettingsSnapshot;

  test.beforeAll(async () => {
    seeder = await MgSeeder.open();
    initialSettings = await seeder.snapshotSettings();
  });

  test.afterAll(async () => {
    try {
      await seeder.cleanup(SEED_EVENT_START);
      await seeder.cleanup(FLOW_EVENT_START);
      // seedFinishedEvent refuses custom slot costs: the spec must never leave any behind.
      const final = await seeder.snapshotSettings();
      expect(final.slots).toEqual(initialSettings.slots);
      expect(final.config).toEqual(initialSettings.config);
    } finally {
      await seeder.close();
    }
  });

  test.beforeEach(async () => {
    await seeder.cleanup(SEED_EVENT_START);
    await seeder.cleanup(FLOW_EVENT_START);
  });

  test.afterEach(async () => {
    await seeder.cleanup(SEED_EVENT_START);
    await seeder.cleanup(FLOW_EVENT_START);
  });

  test('should order settings, Current event and correction, with settings and correction collapsed, when a finished and a current event coexist', async ({
    page,
  }) => {
    // Given a registration_open event and the seeded finished event
    await seeder.seedFinishedEvent();
    await seeder.seedFlowEvent({ registeredPlayers: REGISTRANTS });
    const admin = new MgEventAdminPage(page);

    // When the admin opens the tab
    await admin.open();
    const host = page.locator(HOST);

    // Then the three sections are present, in this visual order
    await expect(host.locator('.current-event-card')).toContainText('Current event');
    const correction = host.locator('.correction-panel');
    const settings = host.locator('.settings-panel');
    await expect(correction.locator('mat-expansion-panel-header')).toContainText('Correct the last event');
    await expect(settings.locator('mat-expansion-panel-header')).toContainText('Settings');
    const card = await top(page, `${HOST} .current-event-card`);
    const corr = await top(page, `${HOST} .correction-panel`);
    const sett = await top(page, `${HOST} .settings-panel`);
    expect(sett).toBeLessThan(card);
    expect(card).toBeLessThan(corr);

    // And correction and settings are collapsed, the correction header advertising its availability
    await expect(correction.locator('mat-expansion-panel-header')).toHaveAttribute('aria-expanded', 'false');
    await expect(settings.locator('mat-expansion-panel-header')).toHaveAttribute('aria-expanded', 'false');
    await expect(correction.locator('mat-expansion-panel-header')).toBeVisible();
    await expect(correction.getByText('Correction available')).toBeVisible();

    // When the correction panel is expanded
    await new MgAdminPage(page).expand();

    // Then its list shows while the current event's draft panel is still there
    await expect(correction.getByText('Selected players (6/10)')).toBeVisible();
    await expect(admin.selection.getByText('Registered players not yet placed')).toBeVisible();
  });

  test('should show each registrant once, with the count in the header, when registration is open', async ({
    page,
  }) => {
    // Given an open registration with two registrants
    await seeder.seedFlowEvent({ registeredPlayers: REGISTRANTS });
    const admin = new MgEventAdminPage(page);

    // When the admin opens the tab
    await admin.open();

    // Then the header counts them, each name appears once (the pool) and there is no separate list
    await expect(admin.countChip).toHaveText('2 registered');
    const host = page.locator(HOST);
    await expect(host.getByText('Demo Player 1', { exact: true })).toHaveCount(1);
    await expect(host.getByText('Demo Player 2', { exact: true })).toHaveCount(1);
    await expect(host.getByText(/Registrations \(/)).toHaveCount(0);
  });

  test('should offer the registrations in a collapsed panel and lock the selection once published', async ({
    page,
  }) => {
    // Given a published selection of two registrants
    await seeder.seedPublishedFlowEvent({
      registeredPlayers: REGISTRANTS,
      registrationDetails: { 'Demo Player 2': { desiredSlotOrder: 3 } },
    });
    const admin = new MgEventAdminPage(page);

    // When the admin opens the tab
    await admin.open();

    // Then the registrations panel exists, collapsed, and the selection is locked
    await expect(admin.statusChip).toHaveText('Selection published');
    await expect(admin.registrationsPanel).toContainText('Registrations (2)');
    const header = admin.registrationsPanel.locator('mat-expansion-panel-header');
    await expect(header).toHaveAttribute('aria-expanded', 'false');
    await expect(admin.selection).toContainText('The selection is published and locked');
    await expect(admin.save).toHaveCount(0);

    // When the panel is expanded
    await admin.expandRegistrations();

    // Then both registrants are listed with their score and desired position
    for (const name of REGISTRANTS) {
      await expect(admin.registrationRow(name)).toBeVisible();
      await expect(admin.registrationRow(name)).toContainText(/Score/i);
      await expect(admin.registrationRow(name)).toContainText(/Desired position/i);
    }
  });

  test('should persist capacity and a slot cost with a single Save, and restore the settings afterwards', async ({
    page,
  }) => {
    const admin = new MgEventAdminPage(page);
    try {
      // Given a current event (so the tab is fully rendered) and untouched settings
      await seeder.seedFlowEvent();
      await admin.open();
      const settings = page.locator(`${HOST} .settings-panel`);
      const header = settings.locator('mat-expansion-panel-header');
      const save = settings.getByRole('button', { name: 'Save settings' });

      // Then the panel is collapsed with a summary of the saved values
      await expect(header).toHaveAttribute('aria-expanded', 'false');
      await expect(header).toContainText('Capacity: 10');

      // When the admin expands it, Save is disabled while nothing changed
      await header.click();
      await expect(header).toHaveAttribute('aria-expanded', 'true');
      await expect(save).toBeDisabled();
      await header.click();
      await expect(header).toHaveAttribute('aria-expanded', 'false');

      // And edits the capacity and the cost of rank 1
      await editSettings(page);
      await expect(save).toBeEnabled();

      // Then collapsing the panel keeps an "Unsaved changes" indicator in the header
      await header.click();
      await expect(header).toHaveAttribute('aria-expanded', 'false');
      await expect(header.getByText('Unsaved changes')).toBeVisible();
      await header.click();
      await expect(header).toHaveAttribute('aria-expanded', 'true');

      // When saving once
      await save.click();

      // Then a success message shows and the indicator disappears
      await expect(page.getByText('Settings saved.')).toBeVisible();
      await expect(header.getByText('Unsaved changes')).toHaveCount(0);
      await expect(save).toBeDisabled();

      // And both values survive a reload
      await page.reload();
      await admin.open();
      await expect(header).toContainText('Capacity: 50');
      await header.click();
      await expect(settings.getByLabel('Cost').first()).toHaveValue('151');
    } finally {
      await seeder.restoreSettings(initialSettings);
    }
  });

  test('should keep the failed slot edit in the form and report it when only the slot request fails', async ({
    page,
  }) => {
    const admin = new MgEventAdminPage(page);
    try {
      // Given the slot-config write is blocked (the request never reaches the database)
      await page.route('**/rest/v1/server_mg_slot_config*', route =>
        route.request().method() === 'GET' ? route.continue() : route.abort('failed')
      );
      await seeder.seedFlowEvent();
      await admin.open();
      const settings = page.locator(`${HOST} .settings-panel`);
      const save = settings.getByRole('button', { name: 'Save settings' });

      // When the admin changes capacity and a slot cost and saves
      await editSettings(page);
      await save.click();

      // Then the slot error is reported and the capacity is saved
      await expect(page.getByText('Failed to save slot configuration.')).toBeVisible();
      await expect(settings.locator('mat-expansion-panel-header')).toContainText('Capacity: 50');
      expect((await seeder.snapshotSettings()).config?.capacity).toBe(50);

      // And the slot edit is still in the form, still saveable
      await expect(settings.getByLabel('Cost').first()).toHaveValue('151');
      await expect(save).toBeEnabled();
      expect((await seeder.snapshotSettings()).slots).toEqual(initialSettings.slots);
    } finally {
      await seeder.restoreSettings(initialSettings);
    }
  });
});
