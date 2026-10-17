# Feature Specification: Align Super-Admin Pages and Add Back Button

**Feature Branch**: `002-align-superadmin-back-button` (spec directory only; no git branch created, work stays on `dev`)

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "Pareil, est-ce qu'on peut aligner les onglets dans la partie super admin ? et si possible rajouter un bouton retour une fois qu'on atterrit sur une des pages ?"

## Analysis of "onglets" (audit result)

The super-admin area (`/app/super-admin/{dashboard,servers,users,guides-data,seasons}`) has no navigation tab bar between its pages: they are reached from the header menu, then from the four "Quick Actions" cards of the dashboard. The only real tab group is the six-tab group of the guides data page, already equalised by feature 001 (labels are text-only, so no icon/no-icon mismatch). The audit of the five pages found one objective misalignment, described in User Story 1. The Quick Actions cards and stat cards are grid items with equal column widths and stretched heights and are not misaligned.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Servers page uses the same page frame as its siblings (Priority: P2)

A super administrator moves between the users, servers, guides data and seasons pages. The servers page is the only one whose content touches the screen edges and is not width-limited and centred, because its page-frame style does not apply (the stylesheet targets a class name that the template does not carry).

**Why this priority**: Small, objective visual defect; cheap to fix and part of the "align" request.

**Independent Test**: Open the servers and users pages at 375px and 1280px; the outer spacing of the page content is identical.

**Acceptance Scenarios**:

1. **Given** the servers page, **When** displayed, **Then** it has the same outer padding (1rem) and maximum content width (1400px, centred) as the users and guides data pages.
2. **Given** the mobile layout (below the medium breakpoint), **When** displayed, **Then** the same padding applies.

---

### User Story 2 - Back to the dashboard from a super-admin page (Priority: P1)

After landing on servers, users, guides data or seasons, the super administrator wants a visible way to return to the super-admin dashboard without opening the header menu.

**Why this priority**: The only new behaviour the user asked for.

**Independent Test**: Open each of the four sub-pages and activate the back button; the dashboard opens. Open the dashboard; no back button is present.

**Acceptance Scenarios**:

1. **Given** the servers, users, guides data or seasons page, **When** displayed, **Then** a back button with an arrow icon is shown at the start of the page header.
2. **Given** such a page, **When** the user activates the back button, **Then** the app navigates to `/app/super-admin/dashboard` regardless of how the user arrived (no dependence on browser history).
3. **Given** the dashboard page, **When** displayed, **Then** no back button is shown.
4. **Given** any sub-page, **When** inspected by a screen reader or keyboard, **Then** the button has a translated accessible name ("Back to dashboard"), is focusable and activatable with the keyboard, and its touch target is at least 44px.
5. **Given** a 320px viewport, **When** the header is displayed, **Then** the back button does not cause horizontal page overflow and the page title stays readable (it may wrap).

### Edge Cases

- Seasons page header wraps its content on small screens; the back button stays at the start of the first line.
- Language change: the accessible name follows the active language, falling back to English.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The servers page MUST receive the same page-frame spacing and width limit as the users page (fix the mismatched stylesheet selector).
- **FR-002**: A reusable presentational back-button component MUST exist and be placed at the start of the page header of the servers, users, guides data and seasons pages.
- **FR-003**: The button MUST navigate to `/app/super-admin/dashboard` through a router link (not browser history).
- **FR-004**: The button MUST NOT appear on the dashboard or on the setup page.
- **FR-005**: The accessible name MUST be translated; the key MUST exist in all shipped languages.
- **FR-006**: The touch target MUST be at least 44px; no `::ng-deep`, no functions in templates, separate TS/HTML/SCSS/spec files.
- **FR-007**: Other tab groups, the server settings page and the dashboard layout MUST NOT change.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From each of the four sub-pages, the dashboard is reachable in one action.
- **SC-002**: The servers page outer padding and max width equal those of the users page at 375px and 1280px.
- **SC-003**: Automated tests cover button rendering, destination, accessible name and its absence on the dashboard; the full test suite and lint pass with no regression.

## Assumptions

- Reaching the super-admin pages in a browser requires a `super_admin` profile role (`superAdminGuard`). No super-admin test account is available, and the available e2e account is a server admin; visual verification of these pages is therefore not possible and layout claims rely on the stylesheet audit.
- The refresh/new-season button at the end of the header is unchanged.
- Header icon colour and title size differences between pages (dashboard is the landing page with a larger header) are deliberate hierarchy, not defects, and are left as is.
- The seasons page keeps its narrower 1000px content width (wizard and form-oriented content).
