import { TranslateService } from '@ngx-translate/core';

/**
 * Format a date to a short localized string (e.g., "Jan 15")
 */
export function formatShortDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Get a localized week label based on the week index
 */
export function getWeekLabel(weekIndex: number, translate: TranslateService): string {
  if (weekIndex === 0) {
    return translate.instant('dashboard.currentWeek');
  } else if (weekIndex === 1) {
    return translate.instant('dashboard.lastWeek');
  } else {
    return `${weekIndex} ${translate.instant('dashboard.weeksAgo')}`;
  }
}

/**
 * Get the start of a week (Monday) for a given date.
 * All calculations are done in UTC to avoid timezone-dependent results —
 * a user in UTC+3 and a user in UTC-5 will get the same Monday midnight UTC.
 */
export function getWeekStart(date: Date): Date {
  const result = new Date(date);
  const day = result.getUTCDay(); // Sunday = 0, Monday = 1, ..., Saturday = 6
  const diff = result.getUTCDate() - ((day + 6) % 7); // Adjust so Monday = 0 offset
  result.setUTCDate(diff);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

/**
 * Get the end of a week (Sunday) for a given date.
 * All calculations are done in UTC.
 */
export function getWeekEnd(date: Date): Date {
  const result = new Date(date);
  const day = result.getUTCDay(); // Sunday = 0, Monday = 1, ..., Saturday = 6
  const daysUntilSunday = (7 - day) % 7; // 0 for Sunday, 6 for Monday, ..., 1 for Saturday
  result.setUTCDate(result.getUTCDate() + daysUntilSunday);
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

/**
 * Get a date representing a specific number of weeks in the past
 * Returns the Monday (start) of that week
 * @param weeksAgo - 0 = current week, 1 = last week, 2 = 2 weeks ago, etc.
 * @returns Date object for the start of that week
 */
export function getDateForWeeksAgo(weeksAgo: number): Date {
  const currentWeekStart = getWeekStart(new Date());
  const targetDate = new Date(currentWeekStart);
  targetDate.setUTCDate(currentWeekStart.getUTCDate() - weeksAgo * 7);
  return targetDate;
}

/**
 * Get the 1-based week index of `date` relative to `rangeStart`.
 * Both dates are Monday-aligned internally (via getWeekStart) before the
 * arithmetic, so a non-Monday `date` or `rangeStart` still resolves
 * correctly.
 *
 * Pure arithmetic — no DB/service access. Used by SeasonService to
 * resolve which week of a season a given date falls in.
 *
 * @param date - the date to locate within the range
 * @param rangeStart - the first day of the range (e.g. a season's start_date)
 * @returns 1-based week index (1 = the week containing rangeStart)
 */
export function getWeekIndexInRange(date: Date, rangeStart: Date): number {
  const alignedDate = getWeekStart(date);
  const alignedRangeStart = getWeekStart(rangeStart);

  const diffInMs = alignedDate.getTime() - alignedRangeStart.getTime();
  const weeksElapsed = Math.floor(diffInMs / (7 * 24 * 60 * 60 * 1000));

  return weeksElapsed + 1;
}
