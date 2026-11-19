---

description: "Task list for Simplify the Admin MG Event Tab"
---

# Tasks: Simplify the Admin "MG Event" Tab

**Input**: `/specs/003-mg-admin-tab-simplify/` (plan.md, spec.md, research.md, quickstart.md)

Tests included: the project Definition of Done requires specs for every new or modified file. No task touches `shared/utils/mg-*.util.ts`, services, models or SQL.

## Phase 1: Setup and BEFORE capture (done before any UI change)

- [X] T001 Baseline: run `npm run test:ci` and `npm run lint`, record counts (no file change): 74 files, 1177 tests green, lint 0 errors and 2 warnings
- [X] T002 Add `e2e/screens/mg-admin-tab.screens.ts`, `playwright.screens.config.ts`, npm script `e2e:screens` (excluded from `npm run e2e`), extend `e2e/helpers/mg-seed.ts` (`seedPublishedFlowEvent`, registration details); output folder from `SCREENS_OUT=before|after`
- [X] T003 Capture BEFORE screenshots (states a to d, 1280px and 375px) and metrics into `specs/003-mg-admin-tab-simplify/screens/before/`; cleanup proof (0 events on 2031-01-06 and 2031-03-03)

## Phase 2: i18n (blocking for the UI)

- [X] T004 [P] Add `mg.admin.registrations.count`, `mg.admin.settings.{title,save,saved,unsaved,dkpOn}`, `mg.admin.correction.badge` to the 14 files in `src/assets/i18n/*.json`; remove `mg.admin.config.save`, `mg.admin.slotConfig.save`, `mg.admin.configSaved`, `mg.admin.slotConfigSaved` and (if unused after T005) `mg.admin.selection.title`; `npm run i18n:check` green at the end of Phase 3

## Phase 3: US1 + US2 + US3 + US4 (UI)

- [X] T005 [US1] `mg-selection-panel.component.{html,scss,ts}`: remove the `mat-card` shell and header (root `div.selection-panel`, content and `div.panel-actions`), drop header-only computeds and the `MatCardModule` / `DatePipe` imports if unused; no logic change
- [X] T006 [US1] `mg-selection-panel.component.spec.ts`: update the assertions that referenced the card, title or avatar; behaviour tests untouched
- [X] T007 [US1] `mg-admin-tab.component.{html,ts,scss}`: Current event card (header with dates, `.status-chip`, count chip; empty message without event) containing the selection panel; delete the Event info and Registrations cards; reorder sections
- [X] T008 [US2] Registrations: `showRegistrationsList` (locked kind and N > 0) rendered as a collapsed `mat-expansion-panel` "Registrations (N)" inside the Current event card; none in draft
- [X] T009 [US4] Correction as collapsed `mat-expansion-panel` (title, date range description, "Correction available" chip, eager content), placed after Current event (last section, Settings moved back to the top after review), same render condition as today
- [X] T010 [US3] Settings: one collapsed `mat-expansion-panel` (summary of saved values, "Unsaved changes" indicator, config form, slot form, single Save); `configDirty` / `slotDirty` / `settingsDirty` / `canSaveSettings`, `saveSettings()` with partial-failure handling; remove `saveConfig`, `saveSlotConfig`, `isSavingConfig`, `isSavingSlotConfig`
- [X] T011 Clean `mg-admin-tab.component.scss` (dead preview/list rules, new section styles, mobile-first, no `::ng-deep`); chips wrap at 320px
- [X] T012 `mg-admin-tab.component.spec.ts`: section order and titles, count chip, registrations list present only when locked and N > 0, correction section present/absent and collapsed by default, settings collapsed by default and summary, dirty detection, single Save calls only the dirty services, partial failure keeps the failed form and shows the right snackbar, both fail, invalid disables Save, no event state

## Phase 4: E2E

- [X] T013 Update `e2e/pages/mg-flow.page.ts` and `e2e/pages/mg-admin.page.ts` (locators for the Current event card, the correction expansion that must be opened, the count chip, pool rows, settings panel)
- [X] T014 Update `e2e/specs/mg-flow.spec.ts` and `e2e/specs/mg-correction.spec.ts` to the new structure (registrations asserted through the header count and the pool; correction panel expanded before use)
- [X] T015 Add `e2e/specs/mg-admin-layout.spec.ts` (desktop and mobile-375): section order and headers; settings collapsed by default; single Save persists capacity and a slot cost together and restores the original values (ERA008-DEMO only, `finally`); correction reachable (expand) while a `registration_open` event exists (coexistence); registrant names appear once in draft; the Registrations expansion appears after publication. Add the settings snapshot/restore helper to `e2e/helpers/mg-seed.ts` (restores config values, deletes slot-config rows if none existed)

## Phase 5: AFTER capture and results

- [X] T016 `SCREENS_OUT=after npm run e2e:screens` into `screens/after/`; verify the PNGs
- [X] T017 Write `RESULTS.md` (before vs after table from the metrics JSON, relative links to the PNGs, click counts, deviations and open questions)

## Phase 6: Polish and Definition of Done

- [X] T018 `npx prettier --check` on touched files, `npm run lint` (0 errors), `npm run test:ci`, `npm run build:prod`, `npm run i18n:check`, `npm run e2e` (full suite green); `git diff --stat` shows no change in the forbidden files
- [X] T019 Update `DEVELOPMENT_STATUS.md` (prototype on `feature/mg-admin-tab-simplify`, new/changed files, known limitations)
- [X] T020 Cleanup proof: 0 events at 2031-01-06 and 2031-03-03 and no leftover slot config or changed server config on ERA008-DEMO; stop only the process listening on port 4200

## Dependencies

T001 to T003 first (done). T004 can run in parallel with T005; T005 before T007; T007 to T011 sequential on the same files; T012 after T010. T013 to T015 after the UI tasks. T016 after T015 (suite green); T017 after T016. T018 to T020 last.
