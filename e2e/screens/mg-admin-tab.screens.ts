/**
 * Screenshot + layout-metrics capture of the admin "MG Event" tab (Server settings).
 *
 * Usage (SCREENS_OUT is mandatory and must be `before` or `after`):
 *   bash:        SCREENS_OUT=before npm run e2e:screens
 *   PowerShell:  $env:SCREENS_OUT='before'; npm run e2e:screens
 *
 * Output: specs/003-mg-admin-tab-simplify/screens/<SCREENS_OUT>/
 *   <state>-<desktop|mobile>.png, d-coexistence-expanded-<project>.png (only if the tab has
 *   expansion panels) and metrics-<project>.json (keyed by state a|b|c|d).
 *
 * Only ERA008-DEMO is written (guarded e2e_admin session), only on the two reserved e2e dates,
 * and everything is removed afterwards. The tab is located by visible text/role; the only
 * structural hooks are `app-mg-admin-tab` and `.status-chip`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { FLOW_EVENT_START, MgSeeder, SEED_EVENT_START } from '../helpers/mg-seed';
import { MgEventAdminPage } from '../pages/mg-flow.page';

const SCREENS_OUT = process.env['SCREENS_OUT'];
if (SCREENS_OUT !== 'before' && SCREENS_OUT !== 'after') {
  throw new Error('SCREENS_OUT must be set to exactly "before" or "after".');
}
const OUT_DIR = resolve(__dirname, '../../specs/003-mg-admin-tab-simplify/screens', SCREENS_OUT);
mkdirSync(OUT_DIR, { recursive: true });

const REGISTRANTS = ['Demo Player 1', 'Demo Player 2'] as const;
const REGISTRATION_DETAILS = {
  'Demo Player 2': { desiredSlotOrder: 3, comment: 'Available all week, prefers a late slot' },
};
const HOST = 'app-mg-admin-tab';

interface Metrics {
  topLevelBlocks: number;
  matCards: number;
  expansionPanels: number;
  saveButtonsInDom: number;
  saveButtonsVisible: number;
  contentHeight: number;
  registrantOffset: number | null;
  publishOffset: number | null;
  correctionOffset: number | null;
  settingsOffset: number | null;
}

/** Runs in the browser; same code for before/after. */
function measureInPage(): Metrics {
  const host = document.querySelector('app-mg-admin-tab') as HTMLElement;
  const root = host.firstElementChild as HTMLElement;
  const isVisible = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.checkVisibility({ visibilityProperty: true, opacityProperty: false });
  };
  const rootTop = root.getBoundingClientRect().top;
  const all = Array.from(host.querySelectorAll('*'));
  const labelOf = (el: Element): string => {
    const clone = el.cloneNode(true) as Element;
    clone.querySelectorAll('mat-icon, .mat-icon').forEach(i => i.remove());
    return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
  };
  const offsetOfExact = (texts: string[]): number | null => {
    const el = all.find(e => texts.includes(labelOf(e)) && e.children.length <= 1 && isVisible(e));
    return el ? Math.round((el.getBoundingClientRect().top - rootTop) * 10) / 10 : null;
  };
  const buttons = Array.from(host.querySelectorAll('button')).filter(b => /^save/i.test(labelOf(b)));
  const publish = Array.from(host.querySelectorAll('button')).find(
    b => /^publish selection$/i.test(labelOf(b)) && isVisible(b)
  );
  const blocks = Array.from(root.children).filter(
    c => c.tagName !== 'MAT-SPINNER' && !c.classList.contains('loading-center') && c.getBoundingClientRect().height > 0
  );
  return {
    topLevelBlocks: blocks.length,
    matCards: host.querySelectorAll('mat-card').length,
    expansionPanels: host.querySelectorAll('mat-expansion-panel').length,
    saveButtonsInDom: buttons.length,
    saveButtonsVisible: buttons.filter(isVisible).length,
    contentHeight: root.offsetHeight,
    registrantOffset: offsetOfExact(['Demo Player 1']),
    publishOffset: publish ? Math.round((publish.getBoundingClientRect().top - rootTop) * 10) / 10 : null,
    correctionOffset: offsetOfExact(['Correct the last event']),
    settingsOffset: offsetOfExact(['Settings', 'Server Configuration']),
  };
}

async function settle(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
}

async function waitForTabReady(page: Page): Promise<void> {
  await expect(page.locator('.status-chip')).toBeVisible();
  await expect(page.locator(`${HOST} mat-spinner`)).toHaveCount(0);
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await settle(page);
  // Toasts are overlays outside the tab: make sure none is left in the shot.
  await expect(page.locator('.mat-mdc-snack-bar-container')).toHaveCount(0, { timeout: 15_000 });
}

/** Enlarges the viewport until no ancestor of the tab scrolls, so a plain screenshot shows everything. */
async function shootWholeTab(page: Page, file: string): Promise<void> {
  const original = page.viewportSize()!;
  try {
    for (let i = 0; i < 3; i++) {
      const extra = await page.evaluate(() => {
        let max = 0;
        for (let el = document.querySelector('app-mg-admin-tab') as HTMLElement | null; el; el = el.parentElement) {
          max = Math.max(max, el.scrollHeight - el.clientHeight);
        }
        return max;
      });
      if (extra <= 1) break;
      const current = page.viewportSize()!;
      await page.setViewportSize({ width: current.width, height: current.height + extra + 8 });
      await settle(page);
    }
    await page.screenshot({ path: resolve(OUT_DIR, file), fullPage: true });
  } finally {
    await page.setViewportSize(original);
    await settle(page);
  }
}

test.describe.serial('MG admin tab screens', () => {
  let seeder: MgSeeder;
  let key: 'desktop' | 'mobile';
  const metrics: Record<string, Metrics> = {};
  const metricsFile = (): string => resolve(OUT_DIR, `metrics-${key}.json`);

  test.beforeAll(async ({}, testInfo) => {
    key = testInfo.project.name === 'desktop' ? 'desktop' : 'mobile';
    seeder = await MgSeeder.open();
    await seeder.cleanup(SEED_EVENT_START);
    await seeder.cleanup(FLOW_EVENT_START);
  });

  test.afterAll(async () => {
    try {
      await seeder.cleanup(SEED_EVENT_START);
      await seeder.cleanup(FLOW_EVENT_START);
    } finally {
      await seeder.close();
    }
  });

  test.afterEach(async () => {
    await seeder.cleanup(SEED_EVENT_START);
    await seeder.cleanup(FLOW_EVENT_START);
  });

  async function capture(
    page: Page,
    state: 'a' | 'b' | 'c' | 'd',
    name: string,
    expectedStatus: string
  ): Promise<void> {
    const admin = new MgEventAdminPage(page);
    await admin.open();
    await waitForTabReady(page);
    await expect(admin.statusChip).toHaveText(expectedStatus);
    metrics[state] = await page.evaluate(measureInPage);
    writeFileSync(metricsFile(), JSON.stringify(metrics, null, 2));
    await shootWholeTab(page, `${name}-${key}.png`);
  }

  test('a - registration open', async ({ page }) => {
    await seeder.seedFlowEvent({ registeredPlayers: REGISTRANTS, registrationDetails: REGISTRATION_DETAILS });
    await capture(page, 'a', 'a-registration-open', 'Registration open');
  });

  test('b - registration closed, draft saved, not published', async ({ page }) => {
    const eventId = await seeder.seedFlowEvent({
      registeredPlayers: REGISTRANTS,
      registrationDetails: REGISTRATION_DETAILS,
    });
    await seeder.closeRegistration(eventId);
    await new MgEventAdminPage(page).open();
    const host = page.locator(HOST);
    await host.getByRole('button', { name: 'Generate auto selection' }).click();
    const saveSelection = host.getByRole('button', { name: 'Save changes' }).first();
    await expect(saveSelection).toBeEnabled();
    await saveSelection.click();
    await expect(page.getByText('Selection saved.')).toBeVisible();
    await expect(host.getByRole('button', { name: 'Publish selection' })).toBeEnabled();
    await capture(page, 'b', 'b-registration-closed-draft', 'Registration closed');
  });

  test('c - selection published', async ({ page }) => {
    await seeder.seedPublishedFlowEvent({ registeredPlayers: REGISTRANTS, registrationDetails: REGISTRATION_DETAILS });
    await capture(page, 'c', 'c-selection-published', 'Selection published');
  });

  test('d - current event and last finished event together', async ({ page }) => {
    await seeder.seedFinishedEvent();
    await seeder.seedFlowEvent({ registeredPlayers: REGISTRANTS, registrationDetails: REGISTRATION_DETAILS });
    await capture(page, 'd', 'd-coexistence', 'Registration open');
    await expect(page.locator(HOST).getByText('Correct the last event').first()).toBeAttached();

    const collapsed = page.locator(`${HOST} mat-expansion-panel-header[aria-expanded="false"]`);
    const count = await collapsed.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await collapsed.first().click();
        await settle(page);
      }
      await page.waitForFunction(
        () => document.querySelectorAll('app-mg-admin-tab .mat-expansion-panel-animating').length === 0
      );
      await shootWholeTab(page, `d-coexistence-expanded-${key}.png`);
    }
  });
});
