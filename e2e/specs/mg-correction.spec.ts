import { expect, test } from '@playwright/test';
import { MgSeeder } from '../helpers/mg-seed';
import { MgAdminPage } from '../pages/mg-admin.page';

/**
 * MG "correction" panel on ERA008-DEMO. Each test gets its own throw-away finished event
 * (players 1-6 ranked 1-6 at default slot costs 150/140/130/120/100/90, 4 FFA slots),
 * created as e2e_admin through the regular API and deleted afterwards.
 */
test.describe('MG correction panel', () => {
  let seeder: MgSeeder;
  let eventId: string;
  let mg: MgAdminPage;

  test.beforeAll(async () => {
    seeder = await MgSeeder.open();
  });

  test.afterAll(async () => {
    await seeder.cleanup();
    await seeder.close();
  });

  test.beforeEach(async ({ page }) => {
    eventId = await seeder.seedFinishedEvent();
    mg = new MgAdminPage(page);
    await mg.open();
  });

  test.afterEach(async () => {
    await seeder.cleanup();
  });

  test('empty slot takes a rank, shifts players down and warns on a name collision', async () => {
    // Given the published list of 6 players
    await expect(mg.panel.getByText('Selected players (6/10)')).toBeVisible();

    // When the admin adds an empty slot
    await mg.addEmptySlot();
    const empty = mg.emptySlot();

    // Then it takes the next rank with the default name
    await expect(empty.rank).toHaveText('7');
    await expect(empty.slotNameInput).toHaveValue('Empty');
    await expect(mg.panel.getByText('Selected players (7/10)')).toBeVisible();

    // When the name matches an existing player, a warning is shown
    await empty.slotNameInput.fill('Demo Player 9');
    await expect(empty.collisionWarning).toContainText('A player with this name exists');

    // When the name does not match anyone, there is no warning
    await empty.slotNameInput.fill('Unknown Governor');
    await expect(empty.collisionWarning).toHaveCount(0);

    // When the empty slot is moved to the top, everyone below shifts down by one
    await mg.moveUp('Unknown Governor', 6);
    await expect(empty.rank).toHaveText('1');
    await expect(mg.player('Demo Player 1').rank).toHaveText('2');
    await expect(mg.player('Demo Player 6').rank).toHaveText('7');
  });

  test('a player added from the pool who was not on the published list is billed by default', async () => {
    // When Demo Player 9 (not on the published list) is added from the pool
    await mg.addFromPool('Demo Player 9');
    const ffaPlayer = mg.player('Demo Player 9');

    // Then they land on rank 7 (slot 6-7) and are billed that slot's cost
    await expect(ffaPlayer.rank).toHaveText('7');
    await ffaPlayer.expectCost(90);

    // And "No penalty" waives the cost, and toggling back bills it again
    await ffaPlayer.noPenalty.check();
    await ffaPlayer.expectCost(0);
    await ffaPlayer.noPenalty.uncheck();
    await ffaPlayer.expectCost(90);

    // Players of the published list who did not move have nothing to forgive
    await expect(mg.player('Demo Player 3').noPenalty).toHaveCount(0);
  });

  test('a ranked player moved up can be forgiven, one moved down cannot', async () => {
    // When Demo Player 6 (approved slot 6-7, cost 90) moves up to rank 5 (cost 100)
    await mg.moveUp('Demo Player 6');
    const movedUp = mg.player('Demo Player 6');
    const displaced = mg.player('Demo Player 5');

    // Then they are re-priced at the dearer slot and can be forgiven
    await expect(movedUp.rank).toHaveText('5');
    await movedUp.expectCost(100);
    await movedUp.noPenalty.check();
    // And forgiveness bills the approved (cheaper) cost
    await movedUp.expectCost(90);

    // And the player pushed down to rank 6 is not forgivable
    await expect(displaced.rank).toHaveText('6');
    await expect(displaced.noPenalty).toHaveCount(0);

    // When Demo Player 1 moves down, there is nothing to forgive either
    await mg.moveDown('Demo Player 1');
    await expect(mg.player('Demo Player 1').rank).toHaveText('2');
    await expect(mg.player('Demo Player 1').noPenalty).toHaveCount(0);
  });

  test('saving persists empty-slot names and forgiven state across a reload', async ({ page }) => {
    // Given an empty slot, a forgiven up-move and an FFA player added from the pool
    await mg.moveUp('Demo Player 6');
    await mg.player('Demo Player 6').noPenalty.check();
    await mg.addEmptySlot();
    await mg.emptySlot().slotNameInput.fill('E2E Persisted Slot');
    await mg.addFromPool('Demo Player 9');

    // When the admin saves
    await mg.save();

    // Then the database holds exactly what the admin decided
    const saved = await seeder.loadSelection(eventId);
    expect(saved.find(r => r.rank === 5)).toMatchObject({ display_name: 'Demo Player 6', cost: 90, approved_cost: 90 });
    expect(saved.find(r => r.rank === 7)).toMatchObject({ selection_type: 'empty', label: 'E2E Persisted Slot' });
    expect(saved.find(r => r.rank === 8)).toMatchObject({ display_name: 'Demo Player 9', cost: 80 });

    // And after a reload the panel shows the same state
    await page.reload();
    await mg.open();
    await expect(mg.emptySlot().slotNameInput).toHaveValue('E2E Persisted Slot');
    await expect(mg.emptySlot().rank).toHaveText('7');
    await expect(mg.player('Demo Player 6').rank).toHaveText('5');
    await expect(mg.player('Demo Player 6').noPenalty).toBeChecked();
    await mg.player('Demo Player 6').expectCost(90);
    await mg.player('Demo Player 9').expectCost(80);
  });

  test('a waived off-list player stays waived after a save and reload', async ({ page }) => {
    // Given a player added from the pool and waived with "No penalty"
    await mg.addFromPool('Demo Player 9');
    await mg.player('Demo Player 9').noPenalty.check();
    await mg.player('Demo Player 9').expectCost(0);

    // When the admin saves and reloads
    await mg.save();
    await page.reload();
    await mg.open();

    // Then the waiver is still there
    await mg.player('Demo Player 9').expectCost(0);
  });
});
