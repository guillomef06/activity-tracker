# Research: Simplify the Admin "MG Event" Tab

## Audit of the current tab

| Item | Finding | Action |
|---|---|---|
| Order | Settings (2 cards) come first; the weekly work starts 1370 px (desktop) / 2423 px (mobile) down | Settings stay first but collapsed (one summary row); weekly work right after |
| Event info card | Dates + status chip only | Merge into the Current event header |
| Registrations card vs selection pool | Pool rows show name, score, desired position, comment, i.e. the same four data points as the Registrations card; the card is a strict superset only for players already placed | Remove the list in draft, keep it (collapsed) when locked (see D3) |
| Save buttons | Config, slots, selection (and correction): independent dirty states, one in the middle of the page and one at the bottom | One Save for settings; selection and correction Save stay (different event, different data) |
| Correction | Rendered last, only when the last finished event has a selection; no signal that it exists | Named collapsed section with an indicator, right after the current event |
| Current vs last finished event | `loadCurrentEvent` (latest non-finished) and `loadLastFinishedEvent` are different events, both normally present | Both stay reachable at the same time (see D7) |
| Dead CSS | `.selection-list`, `.preview-list`, `.preview-label`, `.preview-actions`, `mat-chip.selected/.ffa`, `.ffa-row`, `.rank` rules in `mg-admin-tab.component.scss` are left over from the pre-panel preview UI | Remove while the stylesheet is edited |
| Status chip | `.status-chip` classes per status | Keep (e2e and screens script rely on it) |

## Decisions

### D1 - Order and naming

Settings (collapsed), Current event, Correct the last event. Review decision: the owner wants Settings to stay at the top, so they remain first but collapsed (one summary row of about 84 px on mobile), then the weekly work, then the correction, an occasional post-event task that must stay close and visible. Section titles reuse existing keys (`mg.admin.eventTitle` = "Current event", `mg.admin.correction.title` = "Correct the last event"), so the user-visible names are real words instead of anonymous cards.

### D2 - One Current event card

One `mat-card`: header (icon, "Current event", date range as subtitle), a chip row (status chip + "N registered"), then the selection panel. Rejected: keeping a card per concern (what the user dislikes); a stepper per status (hides parts of the flow, slows it down); tabs inside the tab (adds a click and a level of navigation).

### D3 - What is redundant, per status

| Status | Draft/locked | Pool shows | Registrations list | Decision |
|---|---|---|---|---|
| `registration_open` | draft | all registrants (nobody placed yet) | would be identical to the pool | Remove; count in header |
| `registration_closed` | draft | registrants not yet placed (all, until the admin places some) | placed registrants lose wish and comment in the ordered list | Remove; pool is the list; count in header |
| `selection_published`, `ongoing` | locked | none (panel shows only the placed order) | only place showing who registered, with wish and comment, including registrants not selected | Keep as a collapsed expansion inside the Current event card |
| no registrations, locked | locked | n/a | empty | Not rendered |

Why not keep the list collapsed in draft as well: it would be a second copy of the pool while the pool is non-empty, which is the duplication the user wants gone; and when the pool is empty (everyone placed) the information is partially lost anyway. The cost is accepted and written down: in draft, a placed registrant's wish and comment are not visible until the player is removed from the list. Showing the wish on placed rows would be a small presentational change in the panel; deferred to the user (open question) to keep the panel untouched.

### D4 - The panel loses its card shell instead of adding an `embedded` mode or a new component

The panel is used twice and both uses now sit inside a host section that supplies the title. A conditional shell (`ngTemplateOutlet` twice) would keep a card nobody uses. Nested `mat-card`s are visually noisy and not Material-recommended. Removing the shell is the smallest change; its inputs, outputs and logic are untouched. Rejected: a new `mg-section` wrapper component (more components, the opposite of the goal).

### D5 - Expansion panels for Correction and Settings, collapsed, eager content

`mat-expansion-panel` is the project precedent (used for the activity rules table). Collapsed by default as requested. Content is rendered eagerly (no `matExpansionPanelContent`) so unsaved edits of the correction panel and the settings forms survive collapse; a lazy template would be cheaper to render but would force the user to think about losing work. The panels are independent (no `mat-accordion`), so opening Settings does not close the Correction. Header height of an expansion panel (48px collapsed, 64px with description) is above the 44px touch target.

### D6 - Settings: one Save, dirty detection, partial failure

- The two forms and the two service calls stay. One button persists the dirty parts only (no pointless upsert of 10 slot rows when only the DKP toggle changed).
- Disabled when nothing is dirty (small deliberate change: before it was always enabled), which also removes the "did I save?" doubt and feeds the "Unsaved changes" indicator in the collapsed header.
- Partial failure: both calls are independent (different tables), so they run in parallel with `Promise.allSettled`-like handling. A fulfilled call reloads its saved signal only (the form already holds the saved values). A rejected call leaves its form untouched and dirty, so the retry sends only the failed part and no edit is lost. Messages: all OK `mg.admin.settings.saved`; one failure: that part's existing error key; both failures: both texts in one snackbar (the snackbar service replaces the previous message, so two consecutive calls would hide the first).
- The selection panels keep reading the SAVED config, so a half-failed save never changes what the panels use unless the reload succeeded.
- Rejected: a transactional RPC (backend change, out of scope); disabling Save while invalid only (kept, plus dirty).

### D7 - Not a "one section per status" layout

The current event (latest non-finished) and the last finished event are different events and normally coexist from the moment the cron creates next week's event until the correction is done. A status-driven switch would hide the correction exactly when it is needed. Both sections are always available simultaneously; only the default expansion differs (current event always open, correction collapsed).

### D8 - Correction indicator

The section exists only when there is something to correct (finished event with a saved selection, as today), so its mere presence is a signal; the header adds the event's date range and a "Correction available" chip with an edit icon so it is visible while collapsed. Unsaved corrections cannot be flagged in the collapsed header without a new output on the panel (out of scope, listed as a limitation).

### D9 - Click count (weekly admin flow)

| Step | Before | After |
|---|---|---|
| Open the tab | 1 (tab) | 1 (tab) |
| See who registered | 0 clicks, 2423 px of scroll on mobile | 0 clicks, visible in the first viewport (pool) |
| Generate | 1 | 1 |
| Save | 1 | 1 |
| Publish | 1 | 1 |
| Read settings | 0 clicks (scroll) | 1 (expand) |
| Open the correction | 0 clicks (scroll to the bottom) | 1 (expand) |
| After publish: see registrants | 0 clicks (scroll) | 1 (expand "Registrations") |

Weekly flow: 3 admin clicks both before and after. The extra clicks only concern reference or occasional actions, and each replaces a long scroll.

### D10 - Rejected ideas

- Sticky bottom action bar for Save/Publish: useful on mobile but a new interaction pattern; candidate for a later iteration.
- Moving settings to a dialog or another tab: adds navigation, breaks the "all MG on one tab" model.
- Sorting or paginating the pool: new feature.
- `mat-accordion multi`: unnecessary; independent panels already give the same behaviour with simpler markup.

### D11 - Measurement approach

`npm run e2e:screens` (Playwright, same script before and after, `SCREENS_OUT=before|after`) seeds four states on ERA008-DEMO, takes full-content screenshots at 1280px and 375px and writes layout metrics (`topLevelBlocks`, `matCards`, `expansionPanels`, save buttons, offsets of the first registrant, Publish button, correction header, settings header, tab height). Offsets are `getBoundingClientRect` differences from the tab container, independent of scroll. The 1280px desktop layout renders the tab as a centred column of about 700px max width, so desktop gains are smaller than mobile gains.

### D12 - Dependency on existing e2e behaviours

`seedFinishedEvent` refuses to run when ERA008-DEMO has custom slot costs. The new settings e2e must therefore restore the slot-config rows (delete them if none existed before) and the config row values in a `finally`, otherwise it would break the correction specs.

## Findings from the BEFORE capture

- Publish selection is rendered (disabled) already in `registration_open`.
- The Registrations card is above the selection panel in the DOM; in every state the registrants start after the settings (1370 px desktop, 2423 px mobile).
