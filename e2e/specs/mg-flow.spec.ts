import { expect, test } from '@playwright/test';
import { FLOW_EVENT_START, MgSeeder } from '../helpers/mg-seed';
import { MgEventAdminPage, MgPlayerPage } from '../pages/mg-flow.page';

const ADMIN_NAME = process.env['E2E_DISPLAY_NAME'] ?? 'E2E Admin';

/**
 * MG lifecycle on ERA008-DEMO: registration -> automatic selection -> publication -> player view.
 * Each test seeds its own event (far-future Monday, distinct from the correction spec) as
 * e2e_admin and deletes it afterwards, registrations and selections included (cascade).
 */
test.describe('MG registration, selection and publication', () => {
  let seeder: MgSeeder;

  test.beforeAll(async () => {
    seeder = await MgSeeder.open();
  });

  test.afterAll(async () => {
    await seeder.cleanup(FLOW_EVENT_START);
    await seeder.close();
  });

  test.beforeEach(async () => {
    await seeder.cleanup(FLOW_EVENT_START);
  });

  test.afterEach(async () => {
    await seeder.cleanup(FLOW_EVENT_START);
  });

  test('should let a player register and withdraw, and show the registration to admins, when registration is open', async ({
    page,
  }) => {
    // Given an event whose registration is open
    const eventId = await seeder.seedFlowEvent();
    const player = new MgPlayerPage(page);
    await player.open();
    await expect(player.registerButton).toBeVisible();

    // When the player registers
    await player.register();

    // Then they see they are registered and can withdraw
    await expect(player.registeredBadge).toBeVisible();
    await expect(player.unregisterButton).toBeVisible();
    expect(await seeder.countRegistrations(eventId)).toBe(1);

    // And admins see the registration
    const admin = new MgEventAdminPage(page);
    await admin.open();
    await expect(admin.statusChip).toHaveText('Registration open');
    await expect(admin.registrations).toContainText('Registrations (1)');
    await expect(admin.registrationRow(ADMIN_NAME)).toBeVisible();

    // When the player withdraws
    await player.open();
    await player.unregister();

    // Then the registration is gone and they can register again
    await expect(player.registerButton).toBeVisible();
    expect(await seeder.countRegistrations(eventId)).toBe(0);
  });

  test('should show a waiting message to players and block publication when registration is closed but no selection exists', async ({
    page,
  }) => {
    // Given an event whose registration has closed with one registrant
    const eventId = await seeder.seedFlowEvent({ registeredPlayers: ['Demo Player 1'] });
    await seeder.closeRegistration(eventId);

    // Then players only see the waiting message, with no way to register
    const player = new MgPlayerPage(page);
    await player.open();
    await expect(player.waitingMessage).toBeVisible();
    await expect(player.registerButton).toHaveCount(0);
    await expect(player.selectionTitle).toHaveCount(0);

    // And admins cannot publish before a selection is saved
    const admin = new MgEventAdminPage(page);
    await admin.open();
    await expect(admin.statusChip).toHaveText('Registration closed');
    await expect(admin.publish).toBeDisabled();
  });

  test('should show the selected players and the FFA slots to players when an admin publishes the generated selection', async ({
    page,
  }) => {
    // Given a closed registration with two registrants and an automatic, 10-slot server
    const eventId = await seeder.seedFlowEvent({ registeredPlayers: ['Demo Player 1', 'Demo Player 2'] });
    await seeder.closeRegistration(eventId);
    const admin = new MgEventAdminPage(page);
    await admin.open();
    await expect(admin.registrations).toContainText('Registrations (2)');

    // When the admin generates the selection, saves it and publishes it
    await admin.generate.click();

    // Then the draft holds both registrants (top N by leaderboard score, N >= registrants)
    await expect(admin.selection).toContainText('Selected players (2/10)');
    await expect(admin.draftPlayers()).toHaveCount(2);
    expect((await admin.draftPlayers().allTextContents()).map(n => n.trim()).sort()).toEqual([
      'Demo Player 1',
      'Demo Player 2',
    ]);
    await admin.save.click();
    await expect(page.getByText('Selection saved.')).toBeVisible();
    await expect(admin.publish).toBeEnabled();
    await admin.publish.click();
    await expect(page.getByText('Selection published successfully.')).toBeVisible();

    // Then the event is published and its selection is locked for admins
    await expect(admin.statusChip).toHaveText('Selection published');
    await expect(admin.selection).toContainText('The selection is published and locked');
    expect(await seeder.eventStatus(eventId)).toBe('selection_published');

    // And players see the published list with the remaining FFA slots
    const player = new MgPlayerPage(page);
    await player.open();
    await expect(player.selectionTitle).toBeVisible();
    await expect(player.publishedPlayers()).toHaveCount(2);
    expect((await player.publishedPlayers().allTextContents()).map(n => n.trim()).sort()).toEqual([
      'Demo Player 1',
      'Demo Player 2',
    ]);
    await expect(player.ffaInfo).toContainText('8 FFA slot(s) available');
    await expect(player.registerButton).toHaveCount(0);
  });
});
