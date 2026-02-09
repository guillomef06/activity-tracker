import { TranslateService } from '@ngx-translate/core';

/**
 * Format a date to a short localized string (e.g., "Jan 15")
 */
export function formatShortDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric'
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
 * Get the start of a week (Sunday) for a given date
 */
export function getWeekStart(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() - day;
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Get the end of a week (Saturday) for a given date
 */
export function getWeekEnd(date: Date): Date {
  const result = new Date(date);
  const day = result.getDay();
  const diff = result.getDate() + (6 - day);
  result.setDate(diff);
  result.setHours(23, 59, 59, 999);
  return result;
}

/**
 * Reference date for the 6-week cycle (Sunday of a week 1)
 * Current setting: January 25, 2026 = Start of Week 1
 * This means February 9, 2026 is in Week 3 of the cycle
 */
const CYCLE_REFERENCE_DATE = new Date('2026-01-25T00:00:00');

/**
 * Get the current week number in the repeating 6-week cycle
 * The cycle repeats indefinitely: 1 → 2 → 3 → 4 → 5 → 6 → 1 → 2 → ...
 * 
 * Used to filter which activities are available for submission:
 * - Golden Expedition: weeks 1, 3
 * - KvK Prep: weeks 2, 4
 * - KvK Cross Border: weeks 2, 4
 * - Legion: weeks 1-6 (all weeks)
 * - Desolate Desert: week 5
 * 
 * @returns number between 1 and 6 representing the current week in the cycle
 */
export function getCurrentWeekNumber(): number {
  const currentWeekStart = getWeekStart(new Date());
  const referenceWeekStart = getWeekStart(CYCLE_REFERENCE_DATE);
  
  const diffInMs = currentWeekStart.getTime() - referenceWeekStart.getTime();
  const weeksElapsed = Math.floor(diffInMs / (7 * 24 * 60 * 60 * 1000));
  
  const cyclePosition = (weeksElapsed % 6) + 1;
  
  return cyclePosition;
}

/**
 * Get the cycle week number for a specific number of weeks in the past
 * @param weeksAgo - 0 = current week, 1 = last week, 2 = 2 weeks ago, etc.
 * @returns number between 1 and 6 representing the cycle week at that time
 */
export function getWeekNumberForWeeksAgo(weeksAgo: number): number {
  const currentWeekStart = getWeekStart(new Date());
  const targetWeekStart = new Date(currentWeekStart);
  targetWeekStart.setDate(currentWeekStart.getDate() - (weeksAgo * 7));
  
  const referenceWeekStart = getWeekStart(CYCLE_REFERENCE_DATE);
  const diffInMs = targetWeekStart.getTime() - referenceWeekStart.getTime();
  const weeksElapsed = Math.floor(diffInMs / (7 * 24 * 60 * 60 * 1000));
  
  const cyclePosition = (weeksElapsed % 6) + 1;
  
  return cyclePosition;
}

/**
 * Get a date representing a specific number of weeks in the past
 * Returns the Sunday (start) of that week
 * @param weeksAgo - 0 = current week, 1 = last week, 2 = 2 weeks ago, etc.
 * @returns Date object for the start of that week
 */
export function getDateForWeeksAgo(weeksAgo: number): Date {
  const currentWeekStart = getWeekStart(new Date());
  const targetDate = new Date(currentWeekStart);
  targetDate.setDate(currentWeekStart.getDate() - (weeksAgo * 7));
  return targetDate;
}

/**
 * Get date range for a specific week number (1-6)
 * @param weekNumber - Week number (1 = 5 weeks ago, 6 = current week)
 * @returns Object with start and end dates for the week
 */
export function getWeekDateRange(weekNumber: number): { start: Date; end: Date } {
  if (weekNumber < 1 || weekNumber > 6) {
    throw new Error('Week number must be between 1 and 6');
  }
  
  const currentWeekStart = getWeekStart(new Date());
  const weeksAgo = 6 - weekNumber;
  
  const weekStart = new Date(currentWeekStart);
  weekStart.setDate(currentWeekStart.getDate() - (weeksAgo * 7));
  
  const weekEnd = getWeekEnd(weekStart);
  
  return { start: weekStart, end: weekEnd };
}