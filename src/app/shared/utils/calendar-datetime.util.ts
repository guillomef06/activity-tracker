/**
 * Pure UTC date/time helpers for the global calendar (spec 003-mg-global-calendar, FR-040).
 *
 * `<input type="date">` and `<input type="datetime-local">` carry no time zone: the super admin
 * enters UTC values, so every conversion here is string based and never touches the local zone.
 */

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME_LOCAL_PATTERN = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;
const MIDNIGHT_UTC_SUFFIX = 'T00:00:00.000Z';
const DATE_INPUT_LENGTH = 'YYYY-MM-DD'.length;
const DATETIME_LOCAL_INPUT_LENGTH = 'YYYY-MM-DDTHH:mm'.length;
const MILLISECOND_DIGITS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toValidIso(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== iso) {
    return null;
  }
  return iso;
}

function dateInputToIso(value: string): string | null {
  return DATE_PATTERN.test(value) ? toValidIso(`${value}${MIDNIGHT_UTC_SUFFIX}`) : null;
}

function dateTimeInputToIso(value: string): string | null {
  const match = DATETIME_LOCAL_PATTERN.exec(value);
  if (!match) {
    return null;
  }
  const [, day, hours, minutes, seconds = '00', fraction = ''] = match;
  const milliseconds = fraction.padEnd(MILLISECOND_DIGITS, '0');
  return toValidIso(`${day}T${hours}:${minutes}:${seconds}.${milliseconds}Z`);
}

/**
 * Converts a UTC form value to an ISO timestamp ending in `Z`.
 * A date alone gives midnight UTC; a date-time gets its seconds normalized. Invalid input gives `null`.
 */
export function utcInputToIso(value: string, allDay: boolean): string | null {
  return allDay ? dateInputToIso(value) : dateTimeInputToIso(value);
}

/** Inverse of `utcInputToIso`, used to pre-fill the form from a stored timestamp. */
export function isoToUtcInput(iso: string, allDay: boolean): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const utcIso = parsed.toISOString();
  return utcIso.slice(0, allDay ? DATE_INPUT_LENGTH : DATETIME_LOCAL_INPUT_LENGTH);
}

/**
 * End of an entry from its form value. An all-day end is the LAST INCLUDED day (same convention as
 * MG entries, whose `ends_at` is exclusive), so it is stored as midnight UTC of the next day.
 * A timestamped end is stored as entered.
 */
export function endInputToIso(value: string, allDay: boolean): string | null {
  const iso = utcInputToIso(value, allDay);
  if (iso === null || !allDay) {
    return iso;
  }
  return new Date(Date.parse(iso) + MS_PER_DAY).toISOString();
}

/** Inverse of `endInputToIso`: an all-day `ends_at` shows the day before it (last included day). */
export function isoToEndInput(iso: string, allDay: boolean): string {
  if (!allDay) {
    return isoToUtcInput(iso, false);
  }
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? '' : isoToUtcInput(new Date(parsed - MS_PER_DAY).toISOString(), true);
}

/**
 * Re-expresses an input value when the all-day toggle flips, keeping the same UTC day.
 * A date becomes that day at 00:00; a date-time keeps only its day.
 */
export function convertUtcInputKind(value: string, toAllDay: boolean): string {
  if (value === '') {
    return '';
  }
  if (toAllDay) {
    return value.slice(0, DATE_INPUT_LENGTH);
  }
  return DATE_PATTERN.test(value) ? `${value}T00:00` : value;
}

/**
 * Formats a UTC calendar day (`YYYY-MM-DD`) as a medium date in the given locale, never shifted
 * by the viewer's time zone (FR-040: MG and all-day entries are whole UTC days).
 */
export function formatUtcDay(day: string, locale: string): string {
  const parsed = new Date(`${day}${MIDNIGHT_UTC_SUFFIX}`);
  if (!DATE_PATTERN.test(day) || Number.isNaN(parsed.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed);
}

/**
 * Formats a stored instant in the viewer's time zone, with the zone abbreviation next to the time
 * (FR-040, e.g. "Jan 5, 2027, 8:00 PM CET"). `timeZone` defaults to the viewer's zone; it is a
 * parameter only so tests can pin it.
 */
export function formatTimestampWithZone(iso: string, locale: string, timeZone?: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(parsed);
}
