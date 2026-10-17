# Research: Align Admin Tabs

Material version installed: `@angular/material` 22.1.5 (read from `node_modules/@angular/material/fesm2022/tabs.mjs`, the source of truth for the shipped CSS).

## Findings

- Tab header buttons carry the classes `mdc-tab mat-mdc-tab mat-focus-indicator`. The class `.mat-mdc-tab-label` does NOT exist in this version.
- The global rule in `src/styles.scss` (`.settings-tabs .mat-mdc-tab-label { min-width: 160px }` and its mobile variant) therefore matches nothing: it is dead code, which is the reason tabs keep their content width.
- Shipped base CSS: `.mdc-tab { min-width: 90px; padding: 0 24px; flex: 1 0 auto; white-space: nowrap }`. The flex-basis is `auto` (content size).
- `mat-tab-group` stretches tabs by default (`.mat-mdc-tab-group-stretch-tabs .mat-mdc-tab { flex-grow: 1 }`). Growing from a content-based basis keeps the widths unequal: a longer label stays wider. `mat-stretch-tabs` alone cannot fix the problem.
- Height is `var(--mat-tab-container-height, 48px)`, already above the 44px touch minimum.

## Decision

Add one reusable global class `admin-tabs` (in `src/styles.scss`, where tab overrides already live; no `::ng-deep`, no view-encapsulation issue because tab header DOM is created inside Material components) that gives every `.mat-mdc-tab` the same flex-basis and `min-width` (CSS custom property `--admin-tab-width`: 10rem desktop, 7.5rem under the `$bp-md` breakpoint), `flex-grow: 1` so equal tabs share extra space equally, and `text-overflow: ellipsis` on the label so long translations cannot widen one tab. The dead `.settings-tabs .mat-mdc-tab-label` rules are removed.

Apply `class="admin-tabs"` to the two `mat-tab-group`s: server settings (`settings-tabs` kept) and guides data.

## Alternatives considered

| Option | Rejected because |
|--------|------------------|
| `mat-stretch-tabs` only | Already default; widths still depend on content (basis auto). |
| `mat-tab-nav-bar` rewrite | Large change, routing semantics differ, out of scope for a visual fix. |
| `::ng-deep` in component SCSS | Forbidden by project rules. |
| Material token override (`--mat-tab-*`) | No token controls tab width in 22.1.5. |
| Per-page SCSS with `encapsulation: None` | Heavier than one shared global class. |
