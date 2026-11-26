import {
  MG_CALENDAR_MAX_SERIES_WEEKS,
  MG_CALENDAR_MIN_FUTURE_ENTRIES,
  MG_CALENDAR_MIN_GAP_DAYS,
  MG_CALENDAR_MIN_SERIES_WEEKS,
} from '@shared/constants/mg-calendar.constant';
import type {
  CalendarEntryState,
  CreateOutcome,
  IsoDate,
  MgBannerState,
  MgCalErrorCode,
  MgDerivedDates,
  MgEntryLike,
} from '@shared/models/calendar-entry.model';
import type { MgEvent } from '@shared/models/mg-event.model';

/**
 * Pure, UTC-only date rules of the global MG calendar. `now` / `today` are always
 * injected so every rule is testable and no function reads the clock. The SQL
 * functions of migration 47 stay the authority: this module mirrors their rules
 * for the assistant preview, the shift preview and the banners.
 */

const MS_PER_DAY = 86_400_000;
const MONDAY_UTC_DAY = 1;
const ISO_DATE_LENGTH = 10;
/** Calendar weeks between the opening Monday and the MG start. */
const OPENING_TO_START_DAYS = 7;
/** Opening Monday to closing Thursday. */
const OPENING_TO_CLOSING_DAYS = 3;
/** MG start to its last day (Sunday). */
const START_TO_END_DAYS = 6;
/** One MG per series step: one every 14 days, i.e. 2 weeks of the "n weeks" input. */
const WEEKS_PER_SERIES_STEP = 2;
/** Creation stops when the close cron fires, Thursday 23:59 UTC (research D-09). */
const CLOSING_CUTOFF_MS = (23 * 60 + 59) * 60_000;

export type SeriesWeeksValidation = 'ok' | 'not_even' | 'out_of_range';

export interface MgCalClassification {
  dates: MgDerivedDates;
  outcome: CreateOutcome;
}

export interface MovedEntry {
  id: string;
  oldStart: IsoDate;
  newStart: IsoDate;
}

export type ShiftPreview =
  { ok: true; moved: MovedEntry[] } | { ok: false; reason: MgCalErrorCode; details?: Record<string, unknown> };

// ─── date primitives ──────────────────────────────────────────────────────

function parseIso(date: IsoDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function toIsoDate(utcDate: Date): IsoDate {
  return utcDate.toISOString().slice(0, ISO_DATE_LENGTH);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return toIsoDate(new Date(parseIso(date) + days * MS_PER_DAY));
}

export function isMonday(date: IsoDate): boolean {
  return new Date(parseIso(date)).getUTCDay() === MONDAY_UTC_DAY;
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((parseIso(to) - parseIso(from)) / MS_PER_DAY);
}

/**
 * Date pickers return local midnight; reading its UTC fields would give the previous
 * day east of Greenwich. Rebuilds midnight UTC of the same calendar day (FR-041).
 */
export function reanchorToUtcMidnight(picked: Date): Date {
  return new Date(Date.UTC(picked.getFullYear(), picked.getMonth(), picked.getDate()));
}

/** Filter for the date picker, which works in local time. */
export function isLocalMonday(date: Date | null): boolean {
  return date !== null && date.getDay() === MONDAY_UTC_DAY;
}

// ─── derivation and series ────────────────────────────────────────────────

export function deriveMgDates(openingMonday: IsoDate): MgDerivedDates {
  const start = addDays(openingMonday, OPENING_TO_START_DAYS);
  return {
    opening: openingMonday,
    closing: addDays(openingMonday, OPENING_TO_CLOSING_DAYS),
    start,
    end: addDays(start, START_TO_END_DAYS),
  };
}

export function validateSeriesWeeks(weeks: number): SeriesWeeksValidation {
  if (!Number.isInteger(weeks) || weeks % WEEKS_PER_SERIES_STEP !== 0) return 'not_even';
  if (weeks < MG_CALENDAR_MIN_SERIES_WEEKS || weeks > MG_CALENDAR_MAX_SERIES_WEEKS) return 'out_of_range';
  return 'ok';
}

/** `weeks === null` is a single MG; an invalid `weeks` yields no candidate at all. */
export function buildMgSeries(openingMonday: IsoDate, weeks: number | null): MgDerivedDates[] {
  if (weeks === null) return [deriveMgDates(openingMonday)];
  if (validateSeriesWeeks(weeks) !== 'ok') return [];
  const count = weeks / WEEKS_PER_SERIES_STEP;
  return Array.from({ length: count }, (_, step) =>
    deriveMgDates(addDays(openingMonday, step * MG_CALENDAR_MIN_GAP_DAYS))
  );
}

// ─── entry helpers ────────────────────────────────────────────────────────

function mgEntries(entries: readonly MgEntryLike[]): MgEntryLike[] {
  return entries.filter(entry => entry.type === 'mg');
}

function startOf(entry: MgEntryLike): IsoDate {
  return toIsoDate(new Date(entry.starts_at));
}

function isActive(entry: MgEntryLike): boolean {
  return entry.cancelled_at === null;
}

function byStartAscending(a: MgEntryLike, b: MgEntryLike): number {
  return startOf(a).localeCompare(startOf(b));
}

function isTooClose(start: IsoDate, otherStarts: readonly IsoDate[]): boolean {
  return otherStarts.some(other => Math.abs(daysBetween(other, start)) < MG_CALENDAR_MIN_GAP_DAYS);
}

// ─── classification (assistant preview) ───────────────────────────────────

/**
 * Mirrors create_mg_calendar_entries: precedence not_monday > already_exists >
 * opening_passed > too_close > created, candidates by ascending date, a candidate that
 * would be created counts for the following too_close. Cancelled entries kept in the
 * table still block their date (already_exists) but not the spacing rule.
 */
export function classifyMgDates(
  candidates: readonly MgDerivedDates[],
  existing: readonly MgEntryLike[],
  today: IsoDate
): MgCalClassification[] {
  const mg = mgEntries(existing);
  const takenStarts = new Set(mg.map(startOf));
  const activeStarts = mg.filter(isActive).map(startOf);
  const sorted = [...candidates].sort((a, b) => a.opening.localeCompare(b.opening));

  return sorted.map(dates => {
    const outcome = classifyOne(dates, takenStarts, activeStarts, today);
    if (outcome === 'created') activeStarts.push(dates.start);
    return { dates, outcome };
  });
}

function classifyOne(
  dates: MgDerivedDates,
  takenStarts: ReadonlySet<IsoDate>,
  activeStarts: readonly IsoDate[],
  today: IsoDate
): CreateOutcome {
  if (!isMonday(dates.opening)) return 'rejected_not_monday';
  if (takenStarts.has(dates.start)) return 'already_exists';
  if (dates.opening <= today) return 'rejected_opening_passed';
  if (isTooClose(dates.start, activeStarts)) return 'rejected_too_close';
  return 'created';
}

// ─── state machine ────────────────────────────────────────────────────────

/** `today` is the UTC date; each state covers whole days (data-model section 4). */
export function deriveEntryState(entry: MgEntryLike, today: IsoDate): CalendarEntryState {
  if (!isActive(entry)) return 'cancelled';
  const { opening, closing, start, end } = deriveMgDates(addDays(startOf(entry), -OPENING_TO_START_DAYS));
  if (today < opening) return 'planned';
  if (today <= closing) return 'registration_open';
  if (today < start) return 'awaiting_start';
  return today <= end ? 'ongoing' : 'finished';
}

// ─── shift preview ────────────────────────────────────────────────────────

function fail(reason: MgCalErrorCode, details?: Record<string, unknown>): ShiftPreview {
  return details ? { ok: false, reason, details } : { ok: false, reason };
}

/**
 * Mirrors shift_mg_calendar_entry in the SQL order of checks. Event statuses are not
 * known here, so the `event_not_open` and `event_date_conflict` refusals are left to
 * the function: the preview never claims more than the entries can prove.
 */
export function computeShiftPreview(
  entries: readonly MgEntryLike[],
  selectedId: string,
  newOpeningMonday: IsoDate,
  today: IsoDate
): ShiftPreview {
  const mg = mgEntries(entries);
  const selected = mg.find(entry => entry.id === selectedId);
  if (!selected) return fail('MG_CAL_NOT_FOUND', { entry_id: selectedId });
  if (!isActive(selected)) return fail('MG_CAL_NOT_SHIFTABLE', { reason: 'cancelled' });
  if (!isMonday(newOpeningMonday)) return fail('MG_CAL_NOT_MONDAY', { date: newOpeningMonday });

  const selectedStart = startOf(selected);
  const offset = daysBetween(selectedStart, addDays(newOpeningMonday, OPENING_TO_START_DAYS));
  if (offset === 0) return fail('MG_CAL_INVALID_INPUT', { reason: 'zero_offset' });
  if (selectedStart <= today) return fail('MG_CAL_NOT_SHIFTABLE', { reason: 'read_only' });

  const opened = addDays(selectedStart, -OPENING_TO_START_DAYS) <= today;
  if (opened && offset < 0) return fail('MG_CAL_NOT_SHIFTABLE', { reason: 'must_move_later' });

  const moved = mg
    .filter(entry => isActive(entry) && startOf(entry) >= selectedStart)
    .sort(byStartAscending)
    .map(entry => ({ id: entry.id, oldStart: startOf(entry), newStart: addDays(startOf(entry), offset) }));
  return checkMovedSet(moved, mg, opened, today) ?? { ok: true, moved };
}

/** Opening rules first, then final positions against the entries that stay put. */
function checkMovedSet(
  moved: readonly MovedEntry[],
  mg: readonly MgEntryLike[],
  selectedOpened: boolean,
  today: IsoDate
): ShiftPreview | null {
  const openingFailure = checkOpeningRules(moved, selectedOpened, today);
  if (openingFailure) return openingFailure;

  const movedIds = new Set(moved.map(entry => entry.id));
  const stationary = mg.filter(entry => !movedIds.has(entry.id));
  for (const entry of moved) {
    const failure = checkAgainstStationary(entry, stationary);
    if (failure) return failure;
  }
  return null;
}

function checkOpeningRules(moved: readonly MovedEntry[], selectedOpened: boolean, today: IsoDate): ShiftPreview | null {
  for (const [position, entry] of moved.entries()) {
    const isFollower = position > 0;
    if (isFollower && addDays(entry.oldStart, -OPENING_TO_START_DAYS) <= today) {
      return fail('MG_CAL_NOT_SHIFTABLE', { reason: 'following_entry_opened' });
    }
    const newOpening = addDays(entry.newStart, -OPENING_TO_START_DAYS);
    if ((isFollower || !selectedOpened) && newOpening <= today) {
      return fail('MG_CAL_OPENING_PASSED', { entry_id: entry.id, opening: newOpening });
    }
  }
  return null;
}

function checkAgainstStationary(entry: MovedEntry, stationary: readonly MgEntryLike[]): ShiftPreview | null {
  if (stationary.some(other => startOf(other) === entry.newStart)) {
    return fail('MG_CAL_ALREADY_EXISTS', { entry_id: entry.id, date: entry.newStart });
  }
  const tooCloseTo = stationary
    .filter(isActive)
    .find(other => Math.abs(daysBetween(startOf(other), entry.newStart)) < MG_CALENDAR_MIN_GAP_DAYS);
  if (tooCloseTo) {
    return fail('MG_CAL_TOO_CLOSE', {
      entry_id: entry.id,
      date: entry.newStart,
      other_entry_id: tooCloseTo.id,
      other_date: startOf(tooCloseTo),
    });
  }
  return null;
}

// ─── creation window ──────────────────────────────────────────────────────

/**
 * True from the opening Monday until strictly before Thursday 23:59:00 UTC (the close
 * cron instant), so a late run can never create an event nothing would close. Same
 * bound as mg_create_events_from_calendar.
 */
export function isCreationWindowOpen(entry: MgEntryLike, now: Date): boolean {
  const opening = addDays(startOf(entry), -OPENING_TO_START_DAYS);
  const closing = addDays(startOf(entry), -OPENING_TO_START_DAYS + OPENING_TO_CLOSING_DAYS);
  return opening <= toIsoDate(now) && now.getTime() < parseIso(closing) + CLOSING_CUTOFF_MS;
}

// ─── banners ──────────────────────────────────────────────────────────────

/** Future entry for banners (a) and (b): non-cancelled, MG start strictly after `now`. */
function countFutureEntries(entries: readonly MgEntryLike[], now: Date): number {
  return mgEntries(entries).filter(entry => isActive(entry) && new Date(entry.starts_at).getTime() > now.getTime())
    .length;
}

export function resolveSuperAdminBanner(entries: readonly MgEntryLike[], now: Date): MgBannerState {
  const futureCount = countFutureEntries(entries, now);
  return futureCount < MG_CALENDAR_MIN_FUTURE_ENTRIES ? { kind: 'superAdminLow', futureCount } : { kind: 'none' };
}

export function resolveServerAdminBanner(input: {
  hasConfig: boolean;
  hasCurrentEvent: boolean;
  entries: readonly MgEntryLike[];
  now: Date;
}): MgBannerState {
  const needsBanner = input.hasConfig && !input.hasCurrentEvent && countFutureEntries(input.entries, input.now) === 0;
  return needsBanner ? { kind: 'serverAdminNone' } : { kind: 'none' };
}

/** Banner (c): nearest non-cancelled entry whose registrations are not open yet. */
export function resolvePlayerBanner(input: {
  hasConfig: boolean;
  entries: readonly MgEntryLike[];
  now: Date;
}): MgBannerState {
  if (!input.hasConfig) return { kind: 'none' };
  const today = toIsoDate(input.now);
  const next = mgEntries(input.entries)
    .filter(entry => isActive(entry) && addDays(startOf(entry), -OPENING_TO_START_DAYS) > today)
    .sort(byStartAscending)[0];
  if (!next) return { kind: 'playerNotAnnounced' };
  const mgStart = startOf(next);
  return { kind: 'playerNext', mgStart, openingDate: addDays(mgStart, -OPENING_TO_START_DAYS) };
}

/** Shown until the end of the cancelled event's planned week, `end_date` included. */
export function resolveCancellationNotice(input: {
  hasConfig: boolean;
  cancelledEvent: MgEvent | null;
  today: IsoDate;
}): MgBannerState {
  const { cancelledEvent } = input;
  if (!input.hasConfig || cancelledEvent === null || cancelledEvent.end_date < input.today) {
    return { kind: 'none' };
  }
  return { kind: 'cancelled', mgStart: cancelledEvent.start_date };
}
