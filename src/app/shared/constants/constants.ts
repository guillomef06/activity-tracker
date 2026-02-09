/**
 * Application-wide constants
 * Single source of truth for all magic numbers and configuration values
 */

export interface ActivityType {
  value: string;
  labelKey: string;
  points: number;
  availableWeeks: number[];
}

export const APP_CONSTANTS = {
  SCORING: {
    WEEKS_TO_TRACK: 6,
    DAYS_PER_WEEK: 7,
    TOTAL_DAYS: 42  // 6 weeks * 7 days
  },
  
  STORAGE_KEYS: {
    ACTIVITIES: 'activities',
    USER_NAME: 'userName'
  },
  
  ACTIVITY_TYPES: [
    { value: 'kvk prep', labelKey: 'activities.types.kvk-prep', points: 15, availableWeeks: [2, 4] },
    { value: 'kvk cross border', labelKey: 'activities.types.kvk-cross-border', points: 10, availableWeeks: [2, 4] },
    { value: 'legion', labelKey: 'activities.types.legion', points: 8, availableWeeks: [1, 2, 3, 4, 5, 6] },
    { value: 'desolate desert', labelKey: 'activities.types.desolate-desert', points: 8, availableWeeks: [5] },
    { value: 'golden expedition', labelKey: 'activities.types.golden-expedition', points: 5, availableWeeks: [1, 3] }
  ] as ActivityType[],
  
  CHART_COLORS: [
    { border: 'rgb(75, 192, 192)', background: 'rgba(75, 192, 192, 0.2)' },   // Turquoise
    { border: 'rgb(255, 99, 132)', background: 'rgba(255, 99, 132, 0.2)' },   // Red
    { border: 'rgb(54, 162, 235)', background: 'rgba(54, 162, 235, 0.2)' },   // Blue
    { border: 'rgb(255, 206, 86)', background: 'rgba(255, 206, 86, 0.2)' },   // Yellow
    { border: 'rgb(153, 102, 255)', background: 'rgba(153, 102, 255, 0.2)' }  // Purple
  ] as const
} as const;

/**
 * Type-safe helper to get activity type points
 */
export function getActivityTypePoints(activityType: string): number {
  const type = APP_CONSTANTS.ACTIVITY_TYPES.find(t => t.value === activityType);
  return type?.points ?? 0;
}