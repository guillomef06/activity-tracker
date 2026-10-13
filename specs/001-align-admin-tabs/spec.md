# Feature Specification: Align Admin Tabs

**Feature Branch**: `001-align-admin-tabs` (spec directory only; no git branch created, work stays on `dev`)

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "Aligner les différents onglets de la partie admin, ils ne font pas la même largeur (à vérifier via Playwright), avec un SDD."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Equal-width tabs on the server settings page (Priority: P1)

An administrator opens the server settings page, which exposes six tabs (overview, activity settings, retroactive activities, Excel import, Discord, MG). Today each tab is as wide as its icon plus label, so the tab bar looks ragged. The administrator expects all six tabs to share the same width.

**Why this priority**: This is the primary admin screen and the one the request is about.

**Independent Test**: Open the server settings page at desktop width (~1280px) and at phone width (320px and 375px), measure the width of every tab header, and verify they are identical.

**Acceptance Scenarios**:

1. **Given** an admin on the server settings page at desktop width, **When** the tab bar is displayed, **Then** all six tabs have the same width (tolerance 1px).
2. **Given** the same page at 320px and 375px width, **When** the tab bar is displayed, **Then** all six tabs have the same width and every tab remains reachable (by scrolling the tab bar if needed), with no horizontal scrolling of the page itself.
3. **Given** any tab, **When** the user taps it on a touch device, **Then** its touch target is at least 44px high.

---

### User Story 2 - Equal-width tabs on the super-admin guides data page (Priority: P2)

A super administrator opens the guides data page (six tabs: champions, skills, temperaments, adornments, gems, rings). The same alignment rule applies so both admin screens look consistent.

**Why this priority**: Same defect, secondary screen; it shares the same visual language as the server settings page.

**Independent Test**: Open the guides data page at the same widths and verify tab header widths are identical.

**Acceptance Scenarios**:

1. **Given** a super admin on the guides data page at desktop width, **When** the tab bar is displayed, **Then** all tabs have the same width (tolerance 1px).
2. **Given** the same page at 320px and 375px width, **When** the tab bar is displayed, **Then** all tabs have the same width, remain reachable, and the page has no horizontal overflow.

---

### Edge Cases

- A translated label is longer than the others (French, English, etc.): the tab keeps the common width and the label is truncated or wrapped without changing tab width.
- Viewport too narrow for N equal tabs at a usable width: the tab bar scrolls horizontally inside its own container while tabs stay equal-width; the page body never scrolls horizontally.
- Tabs with and without an icon in the same group: equal width must still hold.
- Active tab indicator and keyboard navigation (arrow keys) keep working unchanged.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All tab headers inside one admin tab group MUST have the same width at every viewport width from 320px to 1920px.
- **FR-002**: The rule MUST apply to the server settings tab group and the super-admin guides data tab group.
- **FR-003**: On narrow viewports, tab headers MUST keep a touch target of at least 44px in height and remain reachable through the tab bar's own scrolling.
- **FR-004**: The page MUST NOT gain horizontal overflow at any supported viewport width.
- **FR-005**: The change MUST NOT alter other tab groups (home, guides hub, account dialog) unless they are explicitly listed in the spec.
- **FR-006**: The fix MUST preserve existing behavior: tab switching, swipe between tabs, keyboard navigation, and accessible names.
- **FR-007**: The fix MUST be verified by automated tests where layout-independent (class/attribute wiring) and by a documented manual or Playwright width measurement for layout.

### Key Entities

Not applicable (presentation-only change, no data involved).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On both admin pages, the difference between the widest and narrowest tab header is 1px or less at 320px, 375px and 1280px viewport widths.
- **SC-002**: No tab header is shorter than 44px on viewports up to 768px wide.
- **SC-003**: Zero horizontal page overflow at 320px width on both admin pages.
- **SC-004**: Existing test suite and lint still pass with no regression.

## Assumptions

- "Partie admin" means the two admin tab groups present in the app: server settings (admin role) and guides data (super-admin role). The home, guides hub and account dialog tabs are out of scope.
- The suspected root cause is that the existing global rule `.settings-tabs .mat-mdc-tab-label { min-width }` in `src/styles.scss` targets a class that no longer exists in the installed Angular Material version, so tab width falls back to content width. To be confirmed in the plan phase against the Material docs for the installed version.
- Verification by browser measurement requires an authenticated admin session. The app uses a real Supabase backend with no dev mock; the measurements were taken with the `e2e_admin` account from `.env.e2e` (see quickstart.md, "Measurements"). The super-admin tab group was not measured (no super-admin test account).
- The fix should rely on Material's own stretch/alignment features and global styles, never on `::ng-deep`.
