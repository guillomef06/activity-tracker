import type { CalendarEntryState, CalendarEntryWithImpact, IsoDate } from '@shared/models';
import { addDays, deriveEntryState, deriveMgDates, toIsoDate } from '@shared/utils/mg-calendar.util';
import type { CalendarRowVm } from './calendar-page.models';

/** MG start (Monday) to its last display day (Sunday). */
const MG_LAST_DAY_OFFSET = 6;
/** Registration opens one week before the MG start. */
const MG_OPENING_OFFSET = 7;
const LOCKED_MG_STATES: readonly CalendarEntryState[] = ['ongoing', 'finished'];
const UPCOMING_STATES: readonly CalendarEntryState[] = ['planned', 'registration_open', 'awaiting_start', 'ongoing'];

export interface CalendarSections {
  readonly upcoming: readonly CalendarRowVm[];
  readonly history: readonly CalendarRowVm[];
}

/** `ends_at` is exclusive for an all-day entry (midnight UTC after its last day), inclusive otherwise. */
function lastDisplayDay(entry: CalendarEntryWithImpact): IsoDate {
  const endsAtDay = toIsoDate(new Date(entry.ends_at));
  return entry.all_day ? addDays(endsAtDay, -1) : endsAtDay;
}

function deriveOtherState(
  entry: CalendarEntryWithImpact,
  startDay: IsoDate,
  endDay: IsoDate,
  today: IsoDate
): CalendarEntryState {
  if (entry.cancelled_at !== null) return 'cancelled';
  if (today < startDay) return 'planned';
  return today <= endDay ? 'ongoing' : 'finished';
}

function countImpact(entry: CalendarEntryWithImpact): { servers: number; registrations: number } {
  if (entry.type !== 'mg' || entry.cancelled_at !== null) return { servers: 0, registrations: 0 };
  const events = entry.mg_events.filter(event => event.status !== 'cancelled');
  const registrations = events.reduce((sum, event) => sum + (event.mg_registrations[0]?.count ?? 0), 0);
  return { servers: events.length, registrations };
}

function toRow(entry: CalendarEntryWithImpact, today: IsoDate): CalendarRowVm {
  const isMg = entry.type === 'mg';
  const startDay = toIsoDate(new Date(entry.starts_at));
  const endDay = isMg ? addDays(startDay, MG_LAST_DAY_OFFSET) : lastDisplayDay(entry);
  const state = isMg ? deriveEntryState(entry, today) : deriveOtherState(entry, startDay, endDay, today);
  const mgDates = isMg ? deriveMgDates(addDays(startDay, -MG_OPENING_OFFSET)) : null;
  const canActOnMg = isMg && entry.cancelled_at === null && !LOCKED_MG_STATES.includes(state);
  return {
    id: entry.id,
    type: entry.type,
    title: isMg ? null : entry.title,
    startsAt: entry.starts_at,
    endsAt: entry.ends_at,
    startDay,
    endDay,
    isAllDay: entry.all_day,
    state,
    openingDay: mgDates?.opening ?? null,
    closingDay: mgDates?.closing ?? null,
    ...countImpact(entry),
    canShift: canActOnMg,
    canCancel: canActOnMg,
    canEdit: !isMg,
    canDelete: !isMg,
  };
}

/** Upcoming rows by ascending start, then history rows by descending start. */
export function buildCalendarSections(entries: readonly CalendarEntryWithImpact[], today: IsoDate): CalendarSections {
  const rows = entries.map(entry => toRow(entry, today));
  const byStart = (a: CalendarRowVm, b: CalendarRowVm): number =>
    a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id);
  return {
    upcoming: rows.filter(row => UPCOMING_STATES.includes(row.state)).sort(byStart),
    history: rows.filter(row => !UPCOMING_STATES.includes(row.state)).sort((a, b) => byStart(b, a)),
  };
}
