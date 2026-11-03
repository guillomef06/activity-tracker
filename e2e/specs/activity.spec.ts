import { expect, test } from '@playwright/test';
import { ActivitySeeder } from '../helpers/activity-seed';
import { ActivityFormPage, HomePage, LeaderboardPage } from '../pages/home.page';

const DISPLAY_NAME = process.env['E2E_DISPLAY_NAME'] ?? 'E2E Admin';
const LEGION_LABEL = 'Battle of Dawn / Wonders';

/**
 * Activity entry on ERA008-DEMO. The only row ever written is the e2e_admin legion entry of the
 * current week (the app upserts on user + type + week, so it can never be appended twice); it is
 * deleted before and after every test through the regular authenticated API.
 */
test.describe('Activity entry and leaderboard', () => {
  let seeder: ActivitySeeder;

  test.beforeAll(async () => {
    seeder = await ActivitySeeder.open();
  });

  test.afterAll(async () => {
    await seeder.cleanup();
    await seeder.close();
  });

  test.beforeEach(async () => {
    await seeder.cleanup();
  });

  test.afterEach(async () => {
    await seeder.cleanup();
  });

  test('should record the points in the database and on the leaderboard when an activity is submitted', async ({
    page,
  }) => {
    // Given a free legion position and the points the server awards for it
    const [position] = await seeder.freeLegionPositions(1);
    const points = await seeder.expectedLegionPoints(position);
    const home = new HomePage(page);
    const form = new ActivityFormPage(page);
    await home.open();

    // When the player fills the form for the current week
    await form.fill(LEGION_LABEL, position);

    // Then the live preview shows the points that will be awarded
    await expect(form.pointsPreview).toContainText(`${points} points`);

    // When they submit
    await form.send();

    // Then exactly one entry is stored with those points
    expect(await seeder.loadEntries()).toEqual([{ position, points }]);

    // And the rolling leaderboard totals them for the player
    await home.selectTab('Leaderboard');
    const leaderboard = new LeaderboardPage(page);
    await expect(leaderboard.total(DISPLAY_NAME)).toContainText(new RegExp(`^\\s*${points}\\b`));

    // And the current-week breakdown lists the activity with its rank and points
    await leaderboard.expand(DISPLAY_NAME);
    const week = await leaderboard.openCurrentWeek(DISPLAY_NAME);
    await expect(week).toContainText(LEGION_LABEL);
    await expect(week).toContainText(`rank: ${position}`);
    await expect(week).toContainText(`${points} pts`);
  });

  test('should update the existing entry instead of adding a second one when the same activity is resubmitted', async ({
    page,
  }) => {
    // Given an activity already submitted at a first position
    const [first, second] = await seeder.freeLegionPositions(2);
    const home = new HomePage(page);
    const form = new ActivityFormPage(page);
    await home.open();
    await form.fill(LEGION_LABEL, first);
    await form.send();
    expect(await seeder.countEntries()).toBe(1);

    // When the same activity is submitted again for the same week with another position
    await form.fill(LEGION_LABEL, second);
    await form.send();

    // Then the single entry now holds the new position (no duplicate row)
    // (polled: the first submission's success snackbar may still be on screen)
    await expect.poll(async () => (await seeder.loadEntries()).map(e => e.position)).toEqual([second]);
    const entries = await seeder.loadEntries();

    // And the leaderboard counts the activity once
    await home.selectTab('Leaderboard');
    const leaderboard = new LeaderboardPage(page);
    await expect(leaderboard.total(DISPLAY_NAME)).toContainText(new RegExp(`^\\s*${entries[0].points}\\b`));
  });
});
