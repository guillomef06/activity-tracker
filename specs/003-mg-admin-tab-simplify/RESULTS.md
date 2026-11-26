# Results: Simplify the Admin "MG Event" Tab (prototype)

Measured with the same script before and after (`SCREENS_OUT=before|after npm run e2e:screens`), as `e2e_admin` on ERA008-DEMO, Chromium, en-US. Raw numbers: [before desktop](screens/before/metrics-desktop.json), [before mobile](screens/before/metrics-mobile.json), [after desktop](screens/after/metrics-desktop.json), [after mobile](screens/after/metrics-mobile.json).

States: **a** registration open (2 registrants), **b** registration closed with a saved draft, **c** selection published (locked), **d** current event (registration open) AND last finished event with a published selection, together.

Offsets are CSS px from the top of the tab content to the element (scroll independent). Values are before -> after.

Layout order (revised after review): **Settings (collapsed) first**, then Current event, then Correction. Keeping the collapsed Settings row on top costs about 84 px (mobile) of extra offset on every weekly element compared with the first iteration (Settings last); all criteria stay met.

## Success criteria

| Criterion | Target | 375px (mobile) a / b / c / d | 1280px (desktop) a / b / c / d | Status |
|---|---|---|---|---|
| SC-001 top-level blocks | <= 3 | 5 -> 2 / 5 -> 2 / 5 -> 2 / 6 -> 3 | 5 -> 2 / 5 -> 2 / 5 -> 2 / 6 -> 3 | met |
| SC-001 `mat-card` count | 1 | 5 -> 1 / 5 -> 1 / 5 -> 1 / 6 -> 1 | same | met |
| SC-002 first registrant | <= 812 (mobile), <= 600 (desktop) | 2423 -> 554 / 2423 -> 320 / 2423 -> 435 / 2423 -> 554 | 1370 -> 521 / 1370 -> 328 / 1370 -> 400 / 1370 -> 521 | met (a, b) |
| SC-003 Publish button (b) | <= 1000 (mobile), <= 800 (desktop) | 3139 -> 701 (a: 3227 -> 789) | 1932 -> 615 (a: 2021 -> 704) | met |
| SC-004 Save buttons visible at first render | <= 1 | 3 -> 1 / 3 -> 1 / 2 -> 0 / 4 -> 1 | same | met |
| SC-004 Save buttons in the DOM | settings: 1 (was 2) | 3 -> 2 / 3 -> 2 / 2 -> 1 / 4 -> 3 | same | met |
| SC-005 correction header (d) | <= 50% of before | 3307 -> 873 (26%) | 2101 -> 788 (38%) | met |
| SC-006 weekly admin clicks (generate, save, publish) | unchanged | 3 -> 3 | 3 -> 3 | met |
| SC-007 registrants shown once (a, b) | once | e2e `mg-admin-layout.spec.ts` (b) | same | met |
| Tab height | n/a | 3291 -> 865 / 3203 -> 777 / 2944 -> 560 / 5311 -> 985 | 2093 -> 788 / 2004 -> 699 / 1792 -> 533 / 3877 -> 880 | |

(Panels counted by the script: `expansionPanels` 0 -> 1 in a/b (Settings) and 0 -> 2 in c/d (Settings plus Registrations or Correction). They are collapsed rows, not cards.) The "Save buttons visible" in state c drops to 0: nothing to save in a locked selection, settings are collapsed.

SC-008 (quality gate) is in the section "Verification" below.

## Click count, weekly admin flow (open tab, generate, save, publish)

| Action | Before | After |
|---|---|---|
| Generate, Save, Publish | 3 clicks | 3 clicks |
| See the registrants | scroll 2423 px (mobile) | visible in the first screen, 0 clicks |
| Read or edit settings | scroll, 0 clicks | +1 (expand Settings) |
| Open the correction | scroll to the bottom, 0 clicks | +1 (expand) |
| See registrants after publish | scroll | +1 (expand "Registrations (N)") |

## Screenshots

| State | Before desktop | After desktop | Before mobile | After mobile |
|---|---|---|---|---|
| a registration open | [png](screens/before/a-registration-open-desktop.png) | [png](screens/after/a-registration-open-desktop.png) | [png](screens/before/a-registration-open-mobile.png) | [png](screens/after/a-registration-open-mobile.png) |
| b closed, draft saved | [png](screens/before/b-registration-closed-draft-desktop.png) | [png](screens/after/b-registration-closed-draft-desktop.png) | [png](screens/before/b-registration-closed-draft-mobile.png) | [png](screens/after/b-registration-closed-draft-mobile.png) |
| c published | [png](screens/before/c-selection-published-desktop.png) | [png](screens/after/c-selection-published-desktop.png) | [png](screens/before/c-selection-published-mobile.png) | [png](screens/after/c-selection-published-mobile.png) |
| d coexistence | [png](screens/before/d-coexistence-desktop.png) | [png](screens/after/d-coexistence-desktop.png) | [png](screens/before/d-coexistence-mobile.png) | [png](screens/after/d-coexistence-mobile.png) |
| d, all panels opened | n/a (no panels) | [png](screens/after/d-coexistence-expanded-desktop.png) | n/a | [png](screens/after/d-coexistence-expanded-mobile.png) |

## Deviations from the proposed direction

- The draft selection panel is no longer a card of its own and has no title: it lives inside the "Current event" card (research D4). No new component was added.
- In draft there is no registrations list at all (not even collapsed): the pool is the list (research D3). A collapsed "Registrations (N)" list exists only for locked selections.
- The Settings Save is disabled when nothing changed (dirty detection) and only persists the dirty part (research D6).
- The i18n key `mg.admin.registrations.empty` became dead (list rendered only when N > 0) and was removed from the 14 locales, together with `config.save`, `slotConfig.save`, `configSaved`, `slotConfigSaved` and `selection.title`.

## Known limitations and open questions

- In draft, a registrant already placed in the ordered list shows score and rank but not their desired position or comment (the pool, which shows them, only lists unplaced players). Open question: show the wish on placed rows (a small change in the selection panel)?
- Unsaved edits of a collapsed correction panel are kept (eager content) but not flagged in the collapsed header (would need an output on the panel). Settings do show an "Unsaved changes" chip.
- Mobile draft rows truncate long names ("De...") because of the panel's row layout; this predates the change (visible in the before shots) and was left alone.
- The 1280px layout renders the tab as a centred column of about 650px, so desktop gains come from the removed blocks, not from width.
- No sticky action bar for Save/Publish (candidate for a later iteration).
- Measurements come from seeded data (2 registrants). With 50 registrants the pool is longer, the Publish offset grows accordingly (pool is above the actions), which was already the case before.

## Verification

See the "Verification" section appended below by the final run.

### Final run (2026-11-06)

| Check | Result |
|---|---|
| `npm run test:ci` | 74 files, 1197 tests green (baseline 1177: +20) |
| `npm run lint` | 0 errors, 2 pre-existing warnings (unchanged files) |
| `npm run build:prod` | OK (pre-existing budget warning on `landing.page.scss`, unrelated) |
| `npm run i18n:check` | 14 locales, parity OK, 0 unused keys |
| `npx prettier --check` | clean on all touched files and the 14 locale files |
| `npm run e2e` | 43 passed (1 setup + 21 tests x desktop and mobile-375); before: 33 |
| `git diff` on `shared/`, `core/`, `supabase/` | empty (no business logic, service, model or SQL change) |
| Data left on ERA008-DEMO | events at 2031-01-06: 0, at 2031-03-03: 0, `server_mg_slot_config` rows: 0, `server_mg_config` back to capacity 10 / automatic / DKP on (initial values) |
