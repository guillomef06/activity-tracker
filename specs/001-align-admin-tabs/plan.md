# Implementation Plan: Align Admin Tabs

**Branch**: `001-align-admin-tabs` (spec dir only, work on `dev`) | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

## Summary

Make all tab headers of the two admin `mat-tab-group`s equally wide. Root cause: the only existing width rule targets `.mat-mdc-tab-label`, a class that no longer exists in Angular Material 22.1.5, so tabs size to their content. Fix with one shared global class `admin-tabs` (equal flex-basis and min-width, equal grow, ellipsis on label), applied to both groups. See [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript, Angular 22.1.x standalone, Angular Material 22.1.5
**Primary Dependencies**: `@angular/material/tabs`
**Storage**: N/A
**Testing**: Vitest via `ng test` (no layout engine: class wiring only); layout verified per [quickstart.md](quickstart.md)
**Target Platform**: Mobile-first PWA (320px and up), GitHub Pages
**Project Type**: web-app (frontend only)
**Performance Goals**: N/A
**Constraints**: no `::ng-deep`, no functions in templates, separate TS/HTML/SCSS, touch target >= 44px
**Scale/Scope**: 2 templates, 1 global stylesheet

## Constitution Check

`.specify/memory/constitution.md` is still the unfilled template; the binding project rules are in `CLAUDE.md` (Definition of Done, prohibitions, Material first, mobile-first). Gate result: PASS. No `::ng-deep`, no template functions, Material component kept, tests and `DEVELOPMENT_STATUS.md` updated. Re-checked after design: PASS.

## Project Structure

### Documentation

```text
specs/001-align-admin-tabs/
├── spec.md
├── plan.md
├── research.md
├── quickstart.md
├── checklists/requirements.md
└── tasks.md   (/speckit-tasks)
```

data-model.md and contracts/ are intentionally omitted: no data and no external interface.

### Source Code

```text
src/styles.scss                                              # replace dead .settings-tabs rules by .admin-tabs
src/app/pages/server-settings/server-settings.page.html      # add admin-tabs class
src/app/pages/server-settings/server-settings.page.spec.ts   # assert class
src/app/pages/super-admin/guides-data/guides-data.page.html  # add admin-tabs class
src/app/pages/super-admin/guides-data/guides-data.page.spec.ts
DEVELOPMENT_STATUS.md
```

**Structure Decision**: single shared global class next to existing Material overrides in `src/styles.scss`.

## Complexity Tracking

No violations.
