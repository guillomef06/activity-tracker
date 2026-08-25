/**
 * Season Models
 * Super-admin-configurable "seasons" that replace the hardcoded, eternally-
 * repeating 6-week activity cycle. A season is a contiguous, non-overlapping
 * date range split into N weeks; each week declares which activity types
 * (besides 'legion', which is implicit every week of every season) are
 * selectable that week.
 */

export interface ActivitySeason {
  id: string;
  name: string;
  startDate: Date;
  weekCount: number;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface SeasonWeekActivity {
  id: string;
  seasonId: string;
  weekIndex: number; // 1-based
  activityType: string; // never 'legion'
}

export interface SeasonWithWeeks extends ActivitySeason {
  weekActivities: SeasonWeekActivity[];
}

export interface WeekActivityAssignment {
  weekIndex: number;
  activityType: string;
}

export interface CreateSeasonRequest {
  name: string;
  startDate: Date;
  weekCount: number;
  weekActivities: WeekActivityAssignment[]; // 0..N entries per week; legion excluded, never included
}

export interface UpdateSeasonStructureRequest {
  seasonId: string;
  weekCount: number;
  weekActivities: WeekActivityAssignment[];
}
