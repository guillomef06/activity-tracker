# Feature Specification: Simplify the Admin "MG Event" Tab

**Feature Branch**: `feature/mg-admin-tab-simplify` (experimental prototype, created from `dev`; spec directory `003-mg-admin-tab-simplify`)

**Created**: 2026-11-06

**Status**: Draft (prototype to evaluate; not meant to be merged as is)

**Input**: "Simplify the UI/UX of the admin MG tab (`mg-admin-tab` and its child `mg-selection-panel`): too many components and cards, the weekly work is buried under rarely-changed settings, the registrations are shown twice, there are four Save buttons, and the correction of the last event is at the very bottom."

## Analysis of the current tab (audit result, verified in the code and measured in a browser)

`mg-admin-tab.component.html` stacks, in one scroll, up to six anonymous `mat-card`s:

1. Server configuration (capacity, assignment mode, DKP toggle) with its own Save button.
2. Slot cost and target configuration (10 rows x 3 inputs) with its own Save button.
3. Event info: two dates and a status chip, nothing else.
4. Registrations: name, total score, desired position, comment.
5. `app-mg-selection-panel` for the CURRENT event (`loadCurrentEvent` = latest non-finished event), kind `draft` or `locked`, with its own Save / Publish buttons. Its pool of "registered players not yet placed" lists the same four data points as card 4.
6. A second `app-mg-selection-panel` (`kind="correction"`) for the LAST FINISHED event (`loadLastFinishedEvent`), rendered only when that event has a saved selection.

The current event and the last finished event are two different events and are normally on screen at the same time (the cron creates next week's event while the previous one can still be corrected). Any "show one section depending on the status" layout is therefore wrong; both must stay reachable simultaneously.

Measured BEFORE (Playwright, `e2e_admin` on ERA008-DEMO, screenshots in `screens/before/`, metrics in `screens/before/metrics-*.json`, 375px mobile unless noted):

| Metric | State a (registration open) | State b (closed, draft saved) | State c (published) | State d (current + finished) |
|---|---|---|---|---|
| Top-level cards | 5 | 5 | 5 | 6 |
| Save buttons in the DOM (all visible) | 3 | 3 | 2 | 4 |
| Distance from the top of the tab to the first registrant | 2423 px (1370 px at 1280) | 2423 px | 2423 px | 2423 px |
| Distance to the Publish button | 3227 px (2021 px) | 3139 px (1932 px) | n/a | 3227 px |
| Distance to the correction section | n/a | n/a | n/a | 3307 px (2101 px) |
| Tab height | 3291 px | 3203 px | 2944 px | 5311 px |

The first registrant is only reached after about three phone screens (812px viewport) of rarely-changed settings. The two settings cards alone take 1370 px on desktop and 2423 px on mobile.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The weekly work comes first, in one named block (Priority: P1)

The admin opens the MG tab to run this week's event (check who registered, close, generate, publish). Today the first thing on screen is server configuration. After the change the first block is "Current event": dates, status chip, number of registrants, then the selection work, with no settings above it.

**Why this priority**: it is the main pain point and the core of the request; US2 to US4 build on the new block structure.

**Independent Test**: open the tab with an event in `registration_open`; at 375px the first registrant (or the Generate button) is within the first viewport (812px) instead of 2423px down; the header of the block reads "Current event" with dates, status and "N registered".

**Acceptance Scenarios**:

1. **Given** a current event exists, **When** the tab loads, **Then** the first block is a card titled "Current event" showing the date range, the status chip and the registration count, followed by the selection work of that event.
2. **Given** no current event, **When** the tab loads, **Then** the "Current event" block shows the existing empty message ("No upcoming MG event for this server.") and nothing else, and the other sections still render.
3. **Given** the weekly flow (generate, save, publish) on an editable draft, **When** performed, **Then** the number of clicks is identical to today (Generate, Save, Publish: 3) and no extra expand/collapse is needed.
4. **Given** the event status changes (publish), **When** the event is reloaded, **Then** the status chip and the count in the block header update, and the selection becomes locked as today.

---

### User Story 2 - Registrants are shown once (Priority: P1)

Today the Registrations card and the draft pool both show name, total score, desired position and comment. After the change the data is shown once per status.

**Why this priority**: removes a whole card and the "which list is the real one" confusion.

**Independent Test**: seed 2 registrants in `registration_open`; their names appear exactly once in the tab (in the pool), and the header shows "2 registered". Publish: a collapsed "Registrations (2)" list is available inside the Current event block and shows desired position and comment.

**Acceptance Scenarios**:

1. **Given** an editable draft (`registration_open`, `registration_closed`), **When** displayed, **Then** there is no separate registrations list: the pool "Registered players not yet placed" is the list (it shows name, score, desired position, comment) and the count lives in the block header.
2. **Given** a locked selection (`selection_published`, `ongoing`), **When** displayed, **Then** a collapsed "Registrations (N)" expansion panel inside the Current event block lists every registrant with score, desired position and comment (this information is not shown anywhere else once the selection is locked, and includes registrants who were not selected).
3. **Given** a locked selection and zero registrations, **When** displayed, **Then** the Registrations expansion is not rendered (nothing to show); the header says "0 registered".
4. **Given** the count, **When** a player registers or withdraws and the tab is reloaded, **Then** the header count matches the number of registrations.

---

### User Story 3 - Settings in one collapsed panel with a single Save (Priority: P2)

Capacity, assignment mode, DKP toggle and the 10 slot rows are rarely changed. They move to one "Settings" expansion panel, kept at the top of the tab but collapsed by default, with one Save button.

**Why this priority**: removes two cards and two Save buttons, but it is not the weekly flow.

**Independent Test**: open the tab: "Settings" is collapsed and its header summarises capacity, mode and DKP state; expand, change the capacity and a slot cost, press the single Save: both are persisted (reload the page and read them back).

**Acceptance Scenarios**:

1. **Given** the tab just loaded, **When** displayed, **Then** the Settings panel is collapsed and its header shows a one-line summary of the SAVED values (capacity, assignment mode, DKP on/off).
2. **Given** edits in the config part and/or the slot part, **When** the admin presses Save, **Then** only the part(s) that changed are persisted (`saveServerConfig` and/or `saveSlotConfig`, unchanged service calls), and a single success snackbar "Settings saved." is shown when everything succeeded.
3. **Given** unsaved edits, **When** the panel is collapsed, **Then** the header shows an "Unsaved changes" indicator and the edits are kept (the content is not destroyed).
4. **Given** nothing changed or a form is invalid, **When** displayed, **Then** the Save button is disabled; invalid slot rows show the existing field errors.
5. **Given** the config save succeeds and the slot save fails (or the reverse), **When** the admin presses Save, **Then** the failed part's error snackbar is shown, the failed part's edits are kept untouched and still dirty (Save stays enabled to retry only that part), the succeeded part is reloaded as saved and no longer dirty. If both fail, both error messages are shown in one snackbar.
6. **Given** a selection panel is displayed, **When** the settings are saved, **Then** the panel keeps using the SAVED configuration only (unchanged rule: unsaved form state never leaks into the selection).

---

### User Story 4 - A named, collapsed "Correct the last event" section with an indicator (Priority: P2)

The correction of the last finished event stays reachable at the same time as the current event, but it is a named section placed right after the current event, collapsed by default, with a visible indicator that a correction is available.

**Why this priority**: fixes "correction at the very bottom with no signal", keeps the coexistence requirement.

**Independent Test**: seed a registration-open event AND a finished event with a published selection: the section "Correct the last event" is visible without scrolling past an expanded Settings, collapsed, shows the event dates and a "Correction available" indicator; expanding it shows the existing correction panel, fully functional.

**Acceptance Scenarios**:

1. **Given** a finished event with a saved selection, **When** the tab loads, **Then** a collapsed expansion panel titled "Correct the last event" appears directly after the Current event block (last section), with the finished event's date range and a "Correction available" indicator in its header.
2. **Given** the same, **When** the admin expands it, **Then** the existing correction panel (kind `correction`, same behaviour: empty slots, off-list players, "No penalty", pool search, Save) is shown inside, unchanged internally.
3. **Given** unsaved correction edits, **When** the section is collapsed and re-expanded, **Then** the edits are still there (content kept, not lazily destroyed).
4. **Given** no finished event, or a finished event without a saved selection, **When** displayed, **Then** the section is not rendered (unchanged from today) and the layout has two blocks (Current event, Settings).
5. **Given** the current event is open and editable, **When** the correction section is expanded, **Then** both panels work independently (saving one does not reset the other).

---

### Edge Cases

- **No current event**: block "Current event" with the empty message; correction (if any) and settings still present.
- **No finished event / finished event without selection**: correction section absent.
- **Finished event with a selection but the current event also finished-less**: both blocks shown.
- **DKP disabled**: the selection panels hide costs as today; the Settings summary omits the "DKP on" tag.
- **Capacity 50**: pool and list are long; the layout must not overflow horizontally; the summary shows 50.
- **Long display names / comments**: wrap without horizontal overflow at 320px (existing row behaviour preserved; the header chips wrap).
- **Zero registrations in a draft**: header says "0 registered"; the pool shows its existing empty text.
- **Settings form invalid** (a target max lower than target min): Save disabled; the field error shows once the panel is expanded and the field touched.
- **Collapsed panels and keyboard / screen readers**: headers are buttons with `aria-expanded`, activatable with Enter/Space.
- **Language switch**: all new labels are translated in the 14 locales.
- **Event reload after publish**: the Current event block stays in place; the Registrations expansion appears (locked state) collapsed.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The tab MUST render its sections in this order: Settings (collapsed), Current event, Correct the last event (when applicable).
- **FR-002**: The "Current event" block MUST be one `mat-card` whose header shows the title (`mg.admin.eventTitle`), the date range, the status chip (class `status-chip` kept) and the registration count ("N registered"), and whose body holds the selection panel of the current event.
- **FR-003**: The separate Event info card and the separate Registrations card MUST be removed.
- **FR-004**: For an editable draft (`registration_open`, `registration_closed`) no registrations list MUST be rendered (the pool is the list). For a locked selection (`selection_published`, `ongoing`) a collapsed "Registrations (N)" `mat-expansion-panel` MUST be rendered inside the Current event block when N > 0.
- **FR-005**: `app-mg-selection-panel` MUST no longer render its own `mat-card` shell and header; the host component supplies the surrounding section and title. Its internal behaviour (draft/locked/correction, generate, save, publish, pricing, forgiveness, pool search, drag and drop) MUST NOT change. Its Save/Reset/Publish actions stay at the end of the panel.
- **FR-006**: The correction section MUST be a `mat-expansion-panel`, collapsed by default, titled with `mg.admin.correction.title`, whose header shows the finished event's date range and a "Correction available" indicator; its content MUST be rendered eagerly (not lazily) so edits survive collapse.
- **FR-007**: Configuration and slot configuration MUST live in one `mat-expansion-panel` titled "Settings", collapsed by default, whose header shows a summary of the saved capacity, assignment mode and DKP state, and an "Unsaved changes" indicator when either form is dirty.
- **FR-008**: The Settings panel MUST have exactly one Save button. It persists only the dirty parts by calling the unchanged `saveServerConfig` and/or `saveSlotConfig`, handles partial failure as in US3-5 and never discards the edits of a failed part.
- **FR-009**: The Save button MUST be disabled when nothing is dirty, when any form is invalid, or while saving.
- **FR-010**: No change to `mg-pricing.util.ts`, `mg-selection.util.ts`, `mg-slot.util.ts`, `MgEventService`, models, SQL or RLS. No new component (the net count of components is unchanged; the net count of visual blocks goes down).
- **FR-011**: Project rules: standalone, OnPush, signals, Material components (`mat-card`, `mat-expansion-panel`, `mat-chip`), separate ts/html/scss/spec files, no `::ng-deep`, no function calls in templates, touch targets >= 44px, mobile-first from 320px, WCAG AA.
- **FR-012**: New and changed i18n keys MUST exist in the 14 locale files; removed keys MUST be removed from all 14 (`npm run i18n:check` passes: parity and no unused keys).
- **FR-013**: Unit specs of every changed component and the e2e specs and page objects that locate the old structure MUST be updated; new e2e assertions cover the new behaviour (US1 to US4).

### Key Entities

No data change. Existing entities consumed: `MgEvent` (current and last finished), `MgRegistrationWithUser`, `MgSelectionWithUser`, `ServerMgConfig`, `ServerMgSlotConfig`.

## Success Criteria *(mandatory)*

### Measurable Outcomes

Measured with the same script before and after (`npm run e2e:screens`, `SCREENS_OUT=before|after`), on ERA008-DEMO, 375px and 1280px, states a to d. Targets at 375px unless noted; actual values go in `RESULTS.md`.

- **SC-001**: Top-level visual blocks (children of the tab root): states a, b, c = 3 or fewer (before 5); state d = 3 or fewer (before 6). `mat-card` count inside the tab: 1 (before 5 to 6).
- **SC-002**: Distance from the tab top to the first registrant in states a and b: 812 px or less at 375px (before 2423 px) and 600 px or less at 1280px (before 1370 px).
- **SC-003**: Distance to the Publish button in state b: 1000 px or less at 375px (before 3139 px), 800 px or less at 1280px (before 1932 px).
- **SC-004**: Visible Save buttons at first render: 1 or fewer (before 3 to 4); Save buttons for the settings: 1 (before 2).
- **SC-005**: Distance to the correction section header in state d: 50% or less of the before value at both widths (before 3307 px and 2101 px).
- **SC-006**: Clicks for the weekly admin flow once the tab is open (generate, save, publish): 3 before and 3 after. Extra clicks only for reading settings or opening the correction: +1 each (before: scroll only).
- **SC-007**: Registrant names appear once in the tab in states a and b (e2e assertion), never in two lists.
- **SC-008**: Quality gate: `npm run test:ci`, `npm run lint` (0 errors), `npm run build:prod`, `npm run i18n:check`, `npx prettier --check` on touched files, and the full `npm run e2e` suite (desktop and mobile-375) are green; `git diff` shows no change under `shared/utils/mg-*.util.ts`, services or SQL.

## Assumptions

- The weekly flow is: players register (player tab), the cron closes registration, the admin generates, saves and publishes. Only the admin part is in scope; "register" and "close" cost the admin zero clicks.
- Draft statuses are `registration_open` and `registration_closed` (the `upcoming` label exists but the panel treats every non-published, non-ongoing status as draft, unchanged).
- Content of expansion panels is rendered eagerly so unsaved edits (selection draft, correction, settings) are never lost on collapse; the cost is a heavier first render of the correction pool on large servers, accepted for a prototype.
- In an editable draft, once a registrant is placed in the ordered list the panel shows score and rank but not their desired position and comment (unchanged panel behaviour). With the separate list removed that information is visible only in the pool, or by removing the player from the list. Accepted trade-off, flagged as an open question; showing the wish on placed rows would be a panel change and is out of scope.
- Dates keep the existing `dd/MM/yyyy` pipe format.
- The Settings summary is computed from the SAVED config, not from the form.
- The prototype does not add a sticky action bar, a stepper, nested tabs or any new feature.
- Translations: en and fr are written carefully; the 12 other locales get short translations of the same strings (no placeholder English required, but accepted if unsure, consistent with the precedent in `DEVELOPMENT_STATUS.md`).
- Existing e2e seeding helpers are reused; no new reserved test dates are needed (`2031-01-06` and `2031-03-03`).

## Risks and rollback

- **Risk: hidden unsaved edits** when a panel is collapsed (correction, settings). Mitigation: eager content; "Unsaved changes" indicator on Settings; the correction panel keeps its own dirty hint inside (not shown while collapsed: known limitation, not solved to avoid an API change on the panel).
- **Risk: removing `mat-card` from the selection panel** changes its look (borders, padding). Mitigation: it is rendered inside the Current event card and the correction panel; screenshots compared before and after.
- **Risk: e2e selectors** locate cards by title and structure (`mg-flow.page.ts`, `mg-admin.page.ts`). Mitigation: page objects updated in the same change, suite run in full.
- **Risk: loss of the registrants' wish/comment on placed rows in draft** (see Assumptions).
- **Rollback**: pure frontend change on an experimental branch; no migration, no data, no service change. Discard or revert the branch (`git branch -D feature/mg-admin-tab-simplify`, or revert the merge) to restore the previous UI; nothing needs migrating back.
