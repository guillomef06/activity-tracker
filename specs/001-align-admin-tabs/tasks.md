---

description: "Task list for Align Admin Tabs"
---

# Tasks: Align Admin Tabs

**Input**: Design documents from `/specs/001-align-admin-tabs/`
**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

Tests are included because the project Definition of Done (CLAUDE.md) requires specs to be updated for every modified file.

## Phase 1: Setup

- [X] T001 Confirm the baseline: run `npx ng test --watch=false` and `npx ng lint` and record the pass/fail counts as the no-regression reference (no file change)

## Phase 2: Foundational (blocks both stories)

- [X] T002 In `src/styles.scss`, remove the dead rules `.settings-tabs .mat-mdc-tab-label` (desktop `min-width: 160px` and the `tokens.$bp-md` variant) and add a `.admin-tabs .mat-mdc-tab` rule: `--admin-tab-width: 10rem` (7.5rem under `tokens.$bp-md`), `flex: 1 0 var(--admin-tab-width)`, `min-width: var(--admin-tab-width)`; ellipsis on `.admin-tabs .mdc-tab__text-label` (`overflow: hidden; text-overflow: ellipsis; white-space: nowrap`). No `::ng-deep`. Comment the "why" (Material 22 tab base is `flex: 1 0 auto`, so widths follow content).

## Phase 3: User Story 1 - Server settings tabs (Priority: P1)

**Goal**: six equal-width tabs on the server settings page.
**Independent Test**: class wiring spec passes; width measurement per quickstart.md.

- [X] T003 [US1] Add the `admin-tabs` class to the `mat-tab-group` (keep `settings-tabs`) in `src/app/pages/server-settings/server-settings.page.html`
- [X] T004 [US1] Add a spec in `src/app/pages/server-settings/server-settings.page.spec.ts` asserting the rendered `mat-tab-group` has the `admin-tabs` class and still renders six tabs

## Phase 4: User Story 2 - Guides data tabs (Priority: P2)

**Goal**: six equal-width tabs on the super-admin guides data page.
**Independent Test**: class wiring spec passes; width measurement per quickstart.md.

- [X] T005 [P] [US2] Add `class="admin-tabs"` to the `mat-tab-group` in `src/app/pages/super-admin/guides-data/guides-data.page.html`
- [X] T006 [P] [US2] Add a spec in `src/app/pages/super-admin/guides-data/guides-data.page.spec.ts` asserting the `mat-tab-group` has the `admin-tabs` class

## Phase 5: Polish and Definition of Done

- [X] T007 Run `npx ng test --watch=false` and `npx ng lint`; compare with T001; fix regressions
- [X] T008 Update `DEVELOPMENT_STATUS.md` (feature complete, files touched, known limitation: Playwright before/after width measurement requires an authenticated admin session)
- [X] T009 Run the quickstart.md layout measurement if an authenticated session is available and record the numbers in quickstart.md (done 13 Oct 2026 on server settings; super-admin group not measured)

## Dependencies

T001 then T002, then US1 (T003, T004) and US2 (T005, T006) in parallel, then T007 to T009. T002 is the single functional change; the stories only opt their tab groups in.

## Implementation strategy

MVP is Phase 2 plus US1; US2 is the same one-line opt-in on the second page.
