# Quickstart: validating 003

## Automated

```bash
npx prettier --check <touched files>
npm run lint
npm run test:ci
npm run build:prod
npm run i18n:check
npm run e2e            # full suite, projects desktop and mobile-375 (needs .env.e2e, ERA008-DEMO only)
```

New or changed coverage: `mg-admin-tab.component.spec.ts`, `mg-selection-panel.component.spec.ts`, `e2e/specs/mg-admin-layout.spec.ts`, updated `mg-flow.spec.ts` and `mg-correction.spec.ts`.

## Screenshots and layout metrics (same script before and after)

```bash
SCREENS_OUT=before npm run e2e:screens      # PowerShell: $env:SCREENS_OUT='before'; npm run e2e:screens
SCREENS_OUT=after  npm run e2e:screens
```

Output: `specs/003-mg-admin-tab-simplify/screens/<before|after>/{a-registration-open,b-registration-closed-draft,c-selection-published,d-coexistence}-{desktop,mobile}.png`, plus `d-coexistence-expanded-*.png` (after only, panels opened) and `metrics-{desktop,mobile}.json`. The script is not part of `npm run e2e` (`*.screens.ts` is outside its `testMatch`). It seeds and removes events dated 2031-01-06 and 2031-03-03 on ERA008-DEMO only.

## Manual check (as `e2e_admin` on ERA008-DEMO, or any admin)

1. `npm start`, log in, Server settings, tab "MG Event", at 375px then 1280px.
2. First block is "Current event" with dates, status chip and "N registered"; no settings above it.
3. In an open registration, the registrants are listed once (pool), no "Registrations" card.
4. Publish a selection: a collapsed "Registrations (N)" appears inside the Current event card; expanding it shows score, desired position and comment.
5. With a finished event that has a published selection: "Correct the last event" is collapsed, right after the current event, with its dates and "Correction available"; expanding it shows the unchanged correction panel; collapse/expand keeps unsaved edits.
6. "Settings" is collapsed with a summary (capacity, mode, DKP). Change the capacity and one slot cost: "Unsaved changes" appears in the collapsed header; one Save persists both (reload to check).
7. Keyboard: Tab to each expansion header, Enter/Space toggles it. At 320px: no horizontal scroll.

## Measurements

See [RESULTS.md](RESULTS.md) (before vs after, from the metrics JSON files).
