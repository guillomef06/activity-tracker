---

description: "Task list for Align Super-Admin Pages and Add Back Button"
---

# Tasks: Align Super-Admin Pages and Add Back Button

**Input**: `/specs/002-align-superadmin-back-button/` (plan.md, spec.md, research.md, quickstart.md)

Tests included: the project Definition of Done requires specs for every new or modified file.

## Phase 1: Setup

- [X] T001 Baseline: run `npx ng test --watch=false` and `npx ng lint`, record counts (no file change)

## Phase 2: US1 - Servers page frame (P2)

- [X] T002 [US1] In `src/app/pages/super-admin/servers/super-admin-servers.page.scss` rename both `.super-admin-servers-page` selectors to `.super-admin-servers`
- [X] T003 [US1] In `super-admin-servers.page.spec.ts` assert the template root carries `super-admin-servers` (guards the wiring)

## Phase 3: US2 - Back button (P1)

- [X] T004 [P] [US2] Add `superAdmin.backToDashboard` to the 14 files in `src/assets/i18n/*.json` (inside the `superAdmin` object)
- [X] T005 [US2] Create `src/app/pages/super-admin/components/back-to-dashboard-button/back-to-dashboard-button.component.{ts,html,scss}` (standalone, OnPush, `a[mat-icon-button]`, `routerLink="/app/super-admin/dashboard"`, `arrow_back`, translated `aria-label`, 44px min target)
- [X] T006 [US2] Create `back-to-dashboard-button.component.spec.ts`: renders an anchor, `href` ends with `/app/super-admin/dashboard`, `aria-label` is the translation key/value, contains `arrow_back` icon
- [X] T007 [P] [US2] Use the component as first child of `mat-card-header` in the servers, users, guides-data and seasons page templates and import it in the four page `.ts` files
- [X] T008 [US2] Add to the four page specs an assertion that `app-back-to-dashboard-button` is rendered; add to the dashboard spec an assertion that it is not

## Phase 4: Polish and Definition of Done

- [X] T009 Run `npx ng test --watch=false` and `npx ng lint`; compare with T001; fix regressions (build if quick)
- [X] T010 Update `DEVELOPMENT_STATUS.md` (feature complete, files, known limitations: no visual verification of super-admin pages)
- [X] T011 Browser check: attempt the e2e login and open `/app/super-admin/dashboard`; record that the guard redirects (no super-admin account) and fabricate no measurement

## Dependencies

T001 first; T002-T003 independent of T004-T008; T005 before T006 and T007; T004 before T007 is not required but before T011. Then T009-T011.
