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