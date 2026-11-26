# Implementation Plan: Simplify the Admin "MG Event" Tab

**Branch**: `feature/mg-admin-tab-simplify` (experimental) | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

## Summary

Re-compose the admin MG tab without changing its business logic:

1. Order: Settings (collapsed), Current event, Correct the last event.
2. One "Current event" `mat-card` (title, dates, status chip, "N registered" chip) containing the existing selection panel; Event info and Registrations cards deleted. A collapsed "Registrations (N)" expansion is kept only for locked selections (the draft pool already is the list).
3. `app-mg-selection-panel` loses its own `mat-card` shell and header (the host provides them); everything else in it is untouched.
4. "Correct the last event" becomes a collapsed `mat-expansion-panel` with dates and a "Correction available" indicator, content rendered eagerly.
5. Config + slot config merge into one collapsed "Settings" `mat-expansion-panel` with a saved-values summary, an "Unsaved changes" indicator and one Save button that persists the dirty parts through the unchanged `saveServerConfig` / `saveSlotConfig`, with explicit partial-failure handling.

See [research.md](research.md) for the decisions and the rejected alternatives.

## Technical Context

**Language/Version**: TypeScript, Angular 22.2 standalone, Angular Material 22.2 (`mat-card`, `mat-expansion-panel`, `mat-chip`)
**Forms**: Signal Forms (`@angular/forms/signals`), the two existing `form()`s stay
**Storage**: none changed (Supabase tables, RLS and `MgEventService` untouched)
**Testing**: Vitest via `ng test` (component specs), Playwright (`npm run e2e`, projects desktop and mobile-375; `npm run e2e:screens` for screenshots and layout metrics)
**Target Platform**: mobile-first PWA, 320px and up
**Project Type**: web-app, frontend only
**Constraints**: no `::ng-deep`, no function calls in templates, OnPush, separate TS/HTML/SCSS/spec files, 44px touch targets, 14 locale files in sync, data safety on ERA008-DEMO only
**Scale/Scope**: 2 components changed (8 files), 14 i18n files, 4 e2e files changed + 1 new e2e spec, screens script already added, docs

## Constitution Check

`.specify/memory/constitution.md` is the unfilled template; binding rules are in `CLAUDE.md`. Gate: PASS (Material first, standalone + OnPush + signals, no new component, specs and `DEVELOPMENT_STATUS.md` updated, lint green required). Re-checked after design: PASS.

## Project Structure

```text
specs/003-mg-admin-tab-simplify/
├── spec.md  plan.md  research.md  tasks.md  quickstart.md  RESULTS.md
├── checklists/requirements.md
└── screens/{before,after}/*.png + metrics-{desktop,mobile}.json
```

### Source Code

```text
src/app/pages/server-settings/components/mg-admin-tab/
├── mg-admin-tab.component.{ts,html,scss,spec.ts}                       # re-composed (sections, settings save, dirty)
└── components/mg-selection-panel/mg-selection-panel.component.{ts,html,scss,spec.ts}  # shell removed (card + header)
src/assets/i18n/*.json (14)                                              # keys added / removed (see below)
e2e/pages/{mg-flow,mg-admin}.page.ts                                     # locators follow the new structure
e2e/specs/{mg-flow,mg-correction}.spec.ts                                # updated assertions
e2e/specs/mg-admin-layout.spec.ts                                        # new: layout behaviour
e2e/screens/mg-admin-tab.screens.ts, playwright.screens.config.ts        # added in phase B (before/after capture)
e2e/helpers/mg-seed.ts                                                   # published-event seeder (phase B)
package.json                                                             # script e2e:screens only
DEVELOPMENT_STATUS.md
```

**Structure Decision**: no new component. The "too many components" feeling comes from the number of visual blocks, so the plan removes blocks (two settings cards, event card, registrations card, panel shell) instead of splitting. Each section is a few lines of template in `mg-admin-tab`; extracting `mg-settings-panel` would be justified only if the tab grew again.

## Design

### Template skeleton (`mg-admin-tab.component.html`)

```text
.mg-admin-container
├─ mat-card.current-event-card                 (always)
│   ├─ mat-card-header: icon, title (mg.admin.eventTitle), subtitle dates
│   └─ mat-card-content
│       ├─ chips: .status-chip + count chip      (only with an event)
│       ├─ empty message                         (no event)
│       ├─ mat-expansion-panel Registrations (N) (locked kind and N > 0, collapsed)
│       └─ app-mg-selection-panel                (kind draft | locked)
├─ mat-expansion-panel.correction-panel          (finished event with a saved selection, collapsed)
│   ├─ header: mat-panel-title, mat-panel-description (dates), indicator chip
│   └─ app-mg-selection-panel kind=correction
└─ mat-expansion-panel.settings-panel            (always, collapsed)
    ├─ header: title, saved-values summary, "Unsaved changes" indicator
    └─ body: config form, slot rows form, ONE Save button
```

### Component state (`mg-admin-tab.component.ts`)

- Remove `isSavingConfig` / `isSavingSlotConfig`; add `isSavingSettings`.
- `configDirty`, `slotDirty`, `settingsDirty` computed: compare `configModel()` to `serverConfig()` (defaults when no row) and the slot rows to `buildMgSlotRows(slotConfig())`.
- `canSaveSettings = settingsDirty && both forms valid && !isSavingSettings`.
- `saveSettings()`: marks touched on invalid forms; runs the dirty part(s) in parallel; for each fulfilled call reloads the corresponding saved signal (`serverConfig` / `slotConfig`) WITHOUT rebuilding its form; for a rejected call keeps the form; snackbar: all OK = `mg.admin.settings.saved`, otherwise the error key(s) of the failed part(s).
- `showRegistrationsList` computed: `currentPanelKind() === 'locked' && registrations().length > 0`.
- `registrationCount` = `registrations().length`; `settingsSummary` data derived from saved signals (capacity, mode, dkp) and rendered with translate pipes.
- `hasCorrection` = finished event present and `lastFinishedSelection().length > 0` (unchanged condition).
- Panel expansion state is the expansion panel's own (`expanded` false); no persistence.

### Selection panel (`mg-selection-panel.component.*`)

Root `mat-card` removed: root becomes a `div.selection-panel`; `mat-card-header` removed (title and avatar icon move to the host sections; the `titleKey` / `isCorrection` subtitle logic that only fed the header is deleted if unused); `mat-card-content` becomes a plain `div`; `mat-card-actions` becomes `div.panel-actions` (flex, wrap, end-aligned, same buttons, 44px targets). `MatCardModule` import dropped if unused. No logic change in `.ts` besides removing header-only computeds.

### i18n (all 14 locales)

| Key | Action |
|---|---|
| `mg.admin.registrations.count` ("{{count}} registered") | add |
| `mg.admin.settings.title` ("Settings"), `.save` ("Save settings"), `.saved` ("Settings saved."), `.unsaved` ("Unsaved changes"), `.dkpOn` ("DKP on") | add |
| `mg.admin.correction.badge` ("Correction available") | add |
| `mg.admin.config.save`, `mg.admin.slotConfig.save`, `mg.admin.configSaved`, `mg.admin.slotConfigSaved` | remove (replaced by `settings.*`) |
| `mg.admin.selection.title` | remove if the panel header is gone (unused) |
| `mg.admin.config.title`, `mg.admin.slotConfig.title`, `mg.admin.configSaveError`, `mg.admin.slotConfigSaveError`, `mg.admin.registrations.title`, `mg.admin.correction.title`, `mg.admin.eventTitle` | keep (used as subheadings, partial-failure messages and section titles) |

The implementer verifies every removal with `npm run i18n:check` and grep (a key used by player-facing code must not be removed).

### E2E

- `MgEventAdminPage` / `MgAdminPage`: the selection panel locator no longer filters on the "Correct the last event" text of a card title; the current-event panel is `.current-event-card app-mg-selection-panel`, the correction panel is `.correction-panel` (expanded by the page object before use). Registration assertions use the header count and the pool rows.
- New `mg-admin-layout.spec.ts` (desktop and mobile-375): settings collapsed by default and the single Save persists capacity and a slot cost together (restores the original values in `finally`, ERA008-DEMO only; the settings write is a write to `server_mg_config` and `server_mg_slot_config` of ERA008-DEMO: values captured and restored, and the slot-config rows deleted if none existed before, because `seedFinishedEvent` refuses custom slot costs); correction reachable while the current event is open (coexistence seed); registrants not duplicated; section headers order.

## Complexity Tracking

No violations. One deliberate deviation from "no behaviour change": the Settings Save is disabled when nothing is dirty (before it was always enabled); documented in research.md D6.
