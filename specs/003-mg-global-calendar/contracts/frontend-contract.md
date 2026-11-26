# Contract: Angular services, utilities, components, i18n

**Spec**: FR-022, FR-040 to FR-074, FR-080 | **Research**: D-13 to D-15 | Angular 22.2, Signals, Signal Forms (`@angular/forms/signals`), Vitest

Shapes below are signatures to code against, not final code. Project rules apply everywhere: standalone, OnPush, `inject()`, `@if`/`@for`, separate TS/HTML/SCSS/spec files, `templateUrl`/`styleUrl`, no function call in templates, no `::ng-deep`, Material components, 44px touch targets, mobile-first from 320px.

## 1. `CalendarService` (`src/app/core/services/calendar.service.ts`, providedIn root)

Promise-based, as the other services (`resource()` is the consumer; no genuine event stream, so no `rxResource`, to be said in a one-line comment). **Loaders throw on error** (so a `resource()` exposes `error()`); mutations return a result object (the repo convention, `{ error }`).

```ts
export type McgCalErrorCode =
  | 'MG_CAL_FORBIDDEN' | 'MG_CAL_INVALID_INPUT' | 'MG_CAL_NOT_FOUND' | 'MG_CAL_NOT_MONDAY'
  | 'MG_CAL_OPENING_PASSED' | 'MG_CAL_ALREADY_EXISTS' | 'MG_CAL_TOO_CLOSE'
  | 'MG_CAL_NOT_SHIFTABLE' | 'MG_CAL_NOT_CANCELLABLE';

export interface CalendarOperationError { code: McgCalErrorCode | 'MG_CAL_UNKNOWN'; details: Record<string, unknown> | null; }

export type CreateOutcome = 'created' | 'already_exists' | 'rejected_not_monday'
  | 'rejected_opening_passed' | 'rejected_too_close';
export interface CreateEntryResult { opening_monday: string; mg_start: string; outcome: CreateOutcome; entry_id: string | null; }
export interface ShiftedEntry { entry_id: string; old_start: string; new_start: string; events_updated: number; }

class CalendarService {
  loadEntries(): Promise<CalendarEntry[]>;                         // plain select, order starts_at asc; throws
  loadEntriesWithImpact(): Promise<CalendarEntryWithImpact[]>;     // embedded events + registration counts (super admin); throws
  createMgEntries(openingMondays: string[]): Promise<{ results: CreateEntryResult[]; error: CalendarOperationError | null }>;
  shiftMgEntry(entryId: string, newOpeningMonday: string): Promise<{ moved: ShiftedEntry[]; error: CalendarOperationError | null }>;
  cancelMgEntry(entryId: string): Promise<{ outcome: 'deleted' | 'cancelled' | null; error: CalendarOperationError | null }>;
  createOtherEntry(input: OtherEntryInput): Promise<{ error: unknown }>;   // direct insert, type <> 'mg'
  updateOtherEntry(id: string, input: OtherEntryInput): Promise<{ error: unknown }>;
  deleteOtherEntry(id: string): Promise<{ error: unknown }>;
}

export const MG_CAL_ERROR_KEYS: Record<McgCalErrorCode | 'MG_CAL_UNKNOWN', string>;  // literal i18n key strings (see 5)
export function toCalendarOperationError(error: { message?: string; details?: string | null }): CalendarOperationError;
```

RPC calls go through `SupabaseService.rpc` / `client.rpc`; `toCalendarOperationError` takes `error.message` when it starts with `MG_CAL_`, parses `details` as JSON when possible, otherwise `MG_CAL_UNKNOWN` (logged with `console.error`).

## 2. `MgEventService` changes (`mg-event.service.ts`, spec updated)

| Method | Change |
|---|---|
| `loadCurrentEvent(serverId)` | `.in('status', MG_ACTIVE_STATUSES)` (existing labels only, research D-13), `order('start_date', { ascending: true })`, `limit(1)`; still returns `null` on error (log). Shares one private query with the strict variant. |
| `loadCurrentEventStrict(serverId)` (new) | Same query; **throws** on error. Used only by the banner `resource()` loaders. |
| `loadSpends(serverId, sinceDate)` | add `.in('mg_events.status', MG_NON_CANCELLED_STATUSES)`; rest unchanged. |
| `loadRecentCancelledEvent(serverId)` (new, FR-074) | `eq('status','cancelled')`, `gte('end_date', todayUtc)` (ISO date of today in UTC), `order('start_date', { ascending: false })`, `limit(1)`, `maybeSingle()`; `null` on error (notice hidden). |
| `loadLastFinishedEvent`, `publishSelection`, others | unchanged. |

`MgEventStatus` gains `'cancelled'`; `MgEvent` gains `calendar_entry_id: string | null`.

## 3. `mg-calendar.util.ts` (`src/app/shared/utils/`, pure, UTC, `now`/`today` always injected)

`IsoDate` = `string` formatted `YYYY-MM-DD` (UTC calendar day).

```ts
export interface MgDerivedDates { opening: IsoDate; closing: IsoDate; start: IsoDate; end: IsoDate; }

addDays(date: IsoDate, days: number): IsoDate;
isMonday(date: IsoDate): boolean;
toIsoDate(utcDate: Date): IsoDate;
reanchorToUtcMidnight(picked: Date): Date;           // Date.UTC(y, m, d) from the local calendar fields (FR-041)
isLocalMonday(date: Date | null): boolean;            // matDatepickerFilter

deriveMgDates(openingMonday: IsoDate): MgDerivedDates;                               // opening, +3, +7, +13
buildMgSeries(openingMonday: IsoDate, weeks: number | null): MgDerivedDates[];       // null => 1 MG; weeks even 2..26 => weeks/2 MG, step 14
validateSeriesWeeks(weeks: number): 'ok' | 'not_even' | 'out_of_range';

type PreviewOutcome = CreateOutcome;
classifyMgDates(candidates: MgDerivedDates[], existing: MgEntryLike[], today: IsoDate): { dates: MgDerivedDates; outcome: PreviewOutcome }[];
// precedence = SQL: not_monday > already_exists > opening_passed > too_close > created; candidates ascending, a 'created' candidate counts for later too_close

deriveEntryState(entry: MgEntryLike, today: IsoDate): 'cancelled'|'planned'|'registration_open'|'awaiting_start'|'ongoing'|'finished';
computeShiftPreview(entries: MgEntryLike[], selectedId: string, newOpeningMonday: IsoDate, today: IsoDate):
  | { ok: true; moved: { id: string; oldStart: IsoDate; newStart: IsoDate }[] }
  | { ok: false; reason: McgCalErrorCode; details?: Record<string, unknown> };
isCreationWindowOpen(entry: MgEntryLike, now: Date): boolean;   // opening <= today && now < closing 23:59 UTC (research D-09)

// banner states (see 4)
resolveSuperAdminBanner(entries: MgEntryLike[], now: Date): MgBannerState;
resolveServerAdminBanner(input: { hasConfig: boolean; hasCurrentEvent: boolean; entries: MgEntryLike[]; now: Date }): MgBannerState;
resolvePlayerBanner(input: { hasConfig: boolean; entries: MgEntryLike[]; now: Date }): MgBannerState;
resolveCancellationNotice(input: { hasConfig: boolean; cancelledEvent: MgEvent | null; today: IsoDate }): MgBannerState;
```

`MgEntryLike` = `{ id, type, starts_at, cancelled_at }` (only `type === 'mg'` entries are considered). Threshold `MG_CALENDAR_MIN_FUTURE_ENTRIES` (N = 2) and the 26-week/13-batch caps come from `mg-calendar.constant.ts`, never inlined.

Rules implemented: banner (a) future = non-cancelled `mg` entry whose **MG start is after `now`** (an ongoing entry does not count), shown when `count < N`; banner (b) shown when `hasConfig && !hasCurrentEvent && no future entry`; banner (c) nearest non-cancelled `mg` entry whose **opening date is after today** -> `playerNext`, none -> `playerNotAnnounced`, hidden without `hasConfig`; cancellation notice shown when `hasConfig && cancelledEvent && cancelledEvent.end_date >= today`.

## 4. Banner component (`src/app/shared/components/mg-calendar-banner/`)

```ts
export type MgBannerState =
  | { kind: 'none' }
  | { kind: 'superAdminLow'; futureCount: number }
  | { kind: 'serverAdminNone' }
  | { kind: 'playerNext'; mgStart: IsoDate; openingDate: IsoDate }
  | { kind: 'playerNotAnnounced' }
  | { kind: 'cancelled'; mgStart: IsoDate };

class MgCalendarBannerComponent { readonly state = input.required<MgBannerState>(); readonly actionLink = input<string | null>(null); }
```

Dumb, OnPush, `@switch (state().kind)`, `role="status"`, `mat-icon` + text, a `routerLink` button only for `superAdminLow` (link target `/app/super-admin/calendar`, translated accessible name), dates through the `date` pipe on date-only strings (viewer locale). Nothing rendered for `none`. Layout holds at 320px (wrapping text, action below on narrow widths, 44px target).

### Parents (smart) and data loading

| Parent | Loader (`resource()`) | State |
|---|---|---|
| `SuperAdminDashboardPage` | `CalendarService.loadEntries()` | `computed`: resource error / no value => `none`; else `resolveSuperAdminBanner` |
| `MgAdminTabComponent` | `Promise.all([loadEntries(), loadCurrentEventStrict(serverId)])` plus the already loaded `serverConfig` signal (`hasConfig = serverConfig() !== null`) | error/no value => `none`; else `resolveServerAdminBanner` |
| `MightiestGovernorComponent` | `loadEntries()` for the "next MG" banner; `loadRecentCancelledEvent(serverId)` for the notice; `hasConfig` from `loadServerConfig` | each independently `none` on failure; notice rendered above the next/not-announced banner (two `<app-mg-calendar-banner>` instances) |

`hasConfig` is derived from a `loadServerConfig` result that is `null` on both "no row" and "error": in both cases the banner is hidden, which is the required behaviour. Every failure also `console.error`s once.

## 5. Page and components (`src/app/pages/super-admin/calendar/`)

```text
super-admin-calendar.page.{ts,html,scss,spec.ts}      smart: resource(loadEntriesWithImpact), dialogs, mutations, snackbars
components/
  calendar-entry-list/calendar-entry-list.component.{ts,html,scss,spec.ts}       dumb: rows input, outputs shift/cancel/edit/delete
  mg-entry-wizard/mg-entry-wizard.component.{ts,html,scss,spec.ts}              dumb: inputs existing entries, today, results; output submitted(IsoDate[])
  other-entry-form/other-entry-form.component.{ts,html,scss,spec.ts}            dumb: Signal Forms; output saved(OtherEntryInput)
  calendar-confirm-dialog/calendar-confirm-dialog.component.{ts,html,scss,spec.ts}   MAT_DIALOG_DATA: variant 'shift' | 'cancel' | 'delete'
  mg-shift-dialog/mg-shift-dialog.component.{ts,html,scss,spec.ts}               picker + live preview (computeShiftPreview) + confirm
```

Route (inside the `super-admin` children, so under `superAdminGuard`): `{ path: 'calendar', loadComponent: () => import('./pages/super-admin/calendar/super-admin-calendar.page').then(m => m.SuperAdminCalendarPage) }`. The page header carries `<app-back-to-dashboard-button />`. The dashboard gets a quick-action card (`routerLink="/app/super-admin/calendar"`, icon `event_note`) and the alert banner.

Row view model (built in a `computed()` in the page, never calculated in the template): `{ id, type, titleOrDefault, startDay, endDay (display days), isAllDay, timeLabelParts, stateKey, servers, registrations, canShift, canCancel, canEdit, canDelete }`. Future first, then history (`starts_at` descending for the history block).

Assistant (US2): Signal Forms model `{ openingMonday: Date | null; duplicate: boolean; weeks: number }`; validators `required(openingMonday)`, `weeks` required + `min(2)` + `max(26)` + custom `evenWeeks`; preview table of `classifyMgDates` (opening, closing, start, end, outcome chip); the confirm button creates only entries classified `created`; after the call the per-date result list is displayed from `CreateEntryResult[]`. Closing the stepper writes nothing.

Non-MG form: `type` (select, `pvp` only for now), `title` (required, max 100), `allDay` toggle, `startsAt`/`endsAt` (`type="date"` when all-day, `type="datetime-local"` otherwise, **entered and stored as UTC**, labelled "(UTC)", parsed by a util that appends `Z`), validator `endsAfterStart`.

## 6. Error mapping

`MG_CAL_ERROR_KEYS` (literal map in `calendar.service.ts`, so the i18n script finds the keys):

| Code | Key |
|---|---|
| `MG_CAL_FORBIDDEN` | `superAdmin.calendar.errors.forbidden` |
| `MG_CAL_INVALID_INPUT` | `superAdmin.calendar.errors.invalidInput` |
| `MG_CAL_NOT_FOUND` | `superAdmin.calendar.errors.notFound` |
| `MG_CAL_NOT_MONDAY` | `superAdmin.calendar.errors.notMonday` |
| `MG_CAL_OPENING_PASSED` | `superAdmin.calendar.errors.openingPassed` |
| `MG_CAL_ALREADY_EXISTS` | `superAdmin.calendar.errors.alreadyExists` |
| `MG_CAL_TOO_CLOSE` | `superAdmin.calendar.errors.tooClose` |
| `MG_CAL_NOT_SHIFTABLE` | `superAdmin.calendar.errors.notShiftable` |
| `MG_CAL_NOT_CANCELLABLE` | `superAdmin.calendar.errors.notCancellable` |
| `MG_CAL_UNKNOWN` | `superAdmin.calendar.errors.unknown` |

`details.reason` of `NOT_SHIFTABLE` / `NOT_CANCELLABLE` selects an optional more specific message `superAdmin.calendar.errors.reason.<reason>` (dynamic prefix, covered by the script).

## 7. i18n key catalogue (14 locales: `ar de el en es fr hi id it ko ku pt tr zh`; `en` and `fr` translated, the others English placeholders as for earlier MG keys; one owner edits the files)

| Namespace | Keys |
|---|---|
| `mg.event.cancelled` | status label (rendered by `'mg.event.' + status`) |
| `mg.calendar.banner` | `superAdminLow` (`{{ count }}`), `superAdminLowAction`, `serverAdminNone`, `playerNext` (`{{ start }}`, `{{ opening }}`), `playerNotAnnounced`, `cancelledNotice` (`{{ start }}`) |
| `superAdmin.dashboard` | `manageCalendar`, `manageCalendarDesc` |
| `superAdmin.calendar` | `title`, `subtitle`, `newMg`, `newOther`, `futureSection`, `historySection`, `empty`, `loadFailed` |
| `superAdmin.calendar.type` | `mg`, `pvp` |
| `superAdmin.calendar.state` | `planned`, `registrationOpen`, `awaitingStart`, `ongoing`, `finished`, `cancelled` |
| `superAdmin.calendar.list` | `columnType`, `columnDates`, `columnState`, `columnServers`, `columnRegistrations`, `shift`, `cancel`, `edit`, `delete`, `registrationOpenOn`, `closesOn` |
| `superAdmin.calendar.wizard` | `title`, `stepDates`, `stepPreview`, `stepResult`, `openingMonday`, `duplicate`, `weeks`, `weeksHint`, `previewOpening`, `previewClosing`, `previewStart`, `previewEnd`, `confirm`, `resultTitle`, `outcome.created`, `outcome.alreadyExists`, `outcome.rejectedNotMonday`, `outcome.rejectedOpeningPassed`, `outcome.rejectedTooClose` |
| `superAdmin.calendar.dialog` | `shiftTitle`, `shiftNewOpening`, `shiftMovedList`, `shiftNotice`, `cancelTitle`, `cancelNoEvent`, `cancelWithEvents` (`{{ servers }}`, `{{ registrations }}`), `cancelNobodyNotified`, `deleteTitle`, `deleteBody`, `confirm`, `back` |
| `superAdmin.calendar.form` | `type`, `title`, `allDay`, `startsAt`, `endsAt`, `utcHint`, `save` |
| `superAdmin.calendar.errors` | the ten keys of section 6, plus `weeksEven`, `weeksRange`, `endsAfterStart`, and `reason.*` |
| `superAdmin.calendar.saved`, `.cancelled`, `.deleted`, `.shifted` | snackbar messages |

## 8. Spec files (FR-080), minimum cases

- `mg-calendar.util.spec.ts`: derivation (spec examples 2027-05-31/06-07/06-13), series 2/4/12/26 weeks, odd/zero/over-cap, classification precedence incl. `too_close` chains, state machine boundaries (day before/after each date, Sunday 23:59 vs Monday), shift preview (cascade, collision with a kept cancelled entry, too close, opening passed), banner resolvers for every combination of (config, event, entries 0/1/2, cancelled/ongoing entries, failure), picker re-anchor under a simulated UTC-8 / UTC+10 offset (build the `Date` from local fields).
- `calendar.service.spec.ts`: select/order, RPC arguments, error code mapping (known, unknown, malformed details), loaders throw, direct writes only for non-MG.
- `mg-event.service.spec.ts` (updated): ascending order, inclusion lists contain no `cancelled`, strict variant throws, spends exclusion, recent-cancelled query params and `null` on error.
- Component specs: list (rows, disabled actions per flag), wizard (validation messages, preview, only `created` rows submitted, nothing emitted on close), form (UTC wording, validators), dialogs (lists, counts, "nobody is notified"), banner (every kind, `role="status"`, `none` renders nothing), page (loading/error/retry, mutation reload), dashboard / `mg-admin-tab` / `mightiest-governor` (banner wiring, hidden on failure and without config, notice above next-MG), `app.routes` lazy route guarded.
