/**
 * Application-wide constants
 * Single source of truth for all magic numbers and configuration values
 */

export interface ActivityType {
  value: string;
  labelKey: string;
  points: number;
}

export const APP_CONSTANTS = {
  SCORING: {
    WEEKS_TO_TRACK: 6,
    DAYS_PER_WEEK: 7,
    TOTAL_DAYS: 42, // 6 weeks * 7 days
  },

  ACTIVITY_TYPES: [
    {
      value: 'kvk prep',
      labelKey: 'activities.types.kvk-prep',
      points: 15,
    },
    {
      value: 'kvk cross border',
      labelKey: 'activities.types.kvk-cross-border',
      points: 10,
    },
    {
      value: 'legion',
      labelKey: 'activities.types.legion',
      points: 8,
    },
    {
      value: 'desolate desert',
      labelKey: 'activities.types.desolate-desert',
      points: 8,
    },
    {
      value: 'golden expedition',
      labelKey: 'activities.types.golden-expedition',
      points: 5,
    },
    {
      value: 'primordial conflict',
      labelKey: 'activities.types.primordial-conflict',
      points: 5,
    },
    {
      value: 'stellar dynasty',
      labelKey: 'activities.types.stellar-dynasty',
      points: 5,
    },
    {
      value: 'me overall',
      labelKey: 'activities.types.me-overall',
      points: 8,
    },
    {
      value: 'behemoth conquest',
      labelKey: 'activities.types.behemoth-conquest',
      points: 8,
    },
  ] as ActivityType[],
} as const;

/**
 * Type-safe helper to get activity type points
 */
export function getActivityTypePoints(activityType: string): number {
  const type = APP_CONSTANTS.ACTIVITY_TYPES.find(t => t.value === activityType);
  return type?.points ?? 0;
}
