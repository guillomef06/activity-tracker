export interface Activity {
  id: string;
  userId: string;
  userName: string;
  activityType: string;
  points: number;
  date: Date;
  timestamp: number;
}

export interface User {
  id: string;
  name: string;
  email?: string;
}

export interface WeeklyScore {
  weekStart: Date;
  weekEnd: Date;
  totalPoints: number;
  activities: Activity[];
}

export interface UserScore {
  userId: string;
  userName: string;
  weeklyScores: WeeklyScore[];
  sixWeekTotal: number;
  averageWeekly: number;
}
