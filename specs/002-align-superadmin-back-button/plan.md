# Implementation Plan: Align Super-Admin Pages and Add Back Button

**Branch**: `002-align-superadmin-back-button` (spec dir only, work on `dev`) | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

## Summary

1. Fix the servers page frame: its stylesheet targets `.super-admin-servers-page` while the template root is `.super-admin-servers`, so padding and max-width never applied. Rename the selector (two occurrences).
2. Add a small presentational component `app-back-to-dashboard-button` (an `a[mat-icon-button]` with `routerLink` and a translated `aria-label`) as the first child of the `mat-card-header` of the servers, users, guides data and seasons pages. See [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript, Angular 22.1.x standalone, Angular Material 22.1.5
**Primary Dependencies**: `@angular/material/button`, `@angular/material/icon`, `@angular/router`, `@ngx-translate/core`
**Storage**: N/A
**Testing**: Vitest via `ng test`; component spec for the button; page specs assert the button is present on the four sub-pages and absent on the dashboard
**Target Platform**: Mobile-first PWA (320px and up)
**Project Type**: web-app (frontend only)
**Constraints**: no `::ng-deep`, no functions in templates, OnPush, separate TS/HTML/SCSS/spec, touch target >= 44px
**Scale/Scope**: 1 new component (4 files), 5 page edits (4 templates + 1 stylesheet) and their specs, 14 i18n JSON files

## Constitution Check

`.specify/memory/constitution.md` is still the unfilled template; binding rules are in `CLAUDE.md`. Gate: PASS (Material first, standalone + OnPush, tests and `DEVELOPMENT_STATUS.md` updated). Re-checked after design: PASS.

## Project Structure

```text
specs/002-align-superadmin-back-button/
├── spec.md  plan.md  research.md  quickstart.md  tasks.md
└── checklists/requirements.md
```

data-model.md and contracts/ omitted: no data, no external interface.

### Source Code

```text
src/app/pages/super-admin/components/back-to-dashboard-button/
├── back-to-dashboard-button.component.{ts,html,scss,spec.ts}   # new
src/app/pages/super-admin/servers/super-admin-servers.page.scss  # selector fix
src/app/pages/super-admin/{servers,users,guides-data,seasons}/*.page.{html,ts,spec.ts}  # use the button
src/assets/i18n/*.json (14)                                       # superAdmin.backToDashboard
DEVELOPMENT_STATUS.md
```

**Structure Decision**: component lives next to the pages that use it (`pages/super-admin/components/`), because it hard-wires the super-admin dashboard route. No inputs, so no misuse possible and no repeated link/label wiring in four templates.

## Complexity Tracking

No violations.
