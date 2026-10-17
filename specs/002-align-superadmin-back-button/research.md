# Research: Align Super-Admin Pages and Add Back Button

## Audit of the five super-admin pages

| Item | Finding | Action |
|---|---|---|
| Page frame | servers SCSS root `.super-admin-servers-page`, template root `.super-admin-servers`: padding and max-width dead. Other pages match (`super-admin-users`, `guides-data-page`, `super-admin-seasons-page`, `super-admin-dashboard`). | Fix selector |
| Tabs | Only `guides-data` has `mat-tab-group`; already `admin-tabs` (feature 001); labels are text-only, no icon mismatch | None |
| Dashboard cards | CSS grid with `repeat(auto-fit, minmax(...))`, default stretch: equal widths and heights per row | None |
| Header icon colour / title size / header margin | Dashboard uses error colour, 2rem title, 2rem margin; servers uses primary; others secondary | Left: landing page hierarchy and colour coding, subjective; reported |
| Seasons max-width 1000px vs 1400px | Content is a form/wizard list | Left, reported |
| Refresh icon buttons have no `aria-label`; dashboard action cards are click-only `mat-card` with `routerLink` (not keyboard focusable) | Accessibility gaps, out of scope | Reported |

## Existing back-button pattern

`guides-hub.page.html` and `tools-hub.component.html` use a plain `mat-icon-button` with `arrow_back` and `[attr.aria-label]`; `guide-view` uses `goBack()` (history). There is no shared back component in `src/app/shared` or `src/app/core`. A component is justified here because the same button is repeated in four pages with identical destination and label.

## Decisions

- **Element**: `<a mat-icon-button [routerLink]>` rather than `<button (click)>`: a link is the correct semantics for navigation, is deterministic and needs no `Router` injection or click handler. `RouterLink` is already used by the project.
- **Destination**: constant `/app/super-admin/dashboard`, not `history.back()` (spec FR-003).
- **Label key**: new `superAdmin.backToDashboard` (more informative than the generic `common.back`), added to all 14 language files that already share an identical key structure (fallback language is `en`).
- **Touch target**: Material's icon button is 40px with a 48px touch target; the component stylesheet also sets `min-width/min-height: 2.75rem` (44px) on the host for certainty. No `::ng-deep`.
- **Placement**: first child of `mat-card-header`, same position as the existing back button of the guides hub.
- **Tests**: jsdom has no layout engine, so tests assert rendering, `href`, `aria-label` and presence/absence; layout is covered by the quickstart.
