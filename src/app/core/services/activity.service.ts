import { Injectable, signal, inject } from '@angular/core';
import { Activity, ActivityRequest, ActivityWithUser, UserScore, WeeklyScore } from '../../shared/models';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { AllianceService } from './alliance.service';
import { APP_CONSTANTS } from '../../shared/constants/constants';

@Injectable({
  providedIn: 'root',
})
export class ActivityService {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);
  private allianceService = inject(AllianceService);

  private activitiesSignal = signal<Activity[]>([]);
  private isInitialized = false;

  readonly activities = this.activitiesSignal.asReadonly();

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await this.allianceService.loadRules();
    await this.loadFromSupabase();
    this.isInitialized = true;
  }

  private static mapToActivity(db: ActivityWithUser): Activity {
    return {
      id: db.id,
      userId: db.user_id,
      userName: db.user_profiles.display_name,
      activityType: db.activity_type,
      position: db.position,
      points: db.points,
      date: new Date(db.date),
      timestamp: new Date(db.date).getTime(),
    };
  }

  private async loadFromSupabase(): Promise<void> {
    try {
      const allianceId = this.authService.getAllianceId();
      if (!allianceId) {
        this.activitiesSignal.set([]);
        return;
      }

      const { data, error } = await this.supabase
        .from('activities')
        .select('id, user_id, activity_type, position, points, date, user_profiles(display_name)')
        .order('date', { ascending: false });

      if (error) throw error;

      const activities = (data as unknown as ActivityWithUser[]).map(ActivityService.mapToActivity);

      this.activitiesSignal.set(activities);
    } catch (error) {
      console.error('Error loading activities from Supabase:', error);
      this.activitiesSignal.set([]);
    }
  }

  async addActivity(request: ActivityRequest): Promise<{ error: Error | null }> {
    try {
      return await this.addActivityToSupabase(request);
    } catch (error) {
      console.error('Error adding activity:', error);
      return { error: error as Error };
    }
  }

  /**
   * Admin-only method to add activity for another alliance member
   * @param userId - The ID of the member for whom the activity is being added
   * @param request - The activity details
   */
  async addActivityForMember(userId: string, request: ActivityRequest): Promise<{ error: Error | null }> {
    try {
      const currentProfile = this.authService.userProfile();
      if (!currentProfile || (currentProfile.role !== 'admin' && currentProfile.role !== 'super_admin')) {
        return {
          error: new Error('Unauthorized: Only admins can add activities for other members'),
        };
      }
      return await this.addActivityForMemberToSupabase(userId, request);
    } catch (error) {
      console.error('Error adding activity for member:', error);
      return { error: error as Error };
    }
  }

  private async addActivityToSupabase(request: ActivityRequest): Promise<{ error: Error | null }> {
    const userId = this.authService.getUserId();
    if (!userId) {
      return { error: new Error('User not authenticated') };
    }

    // Use pre-calculated points (participation mode) or calculate from position
    const points =
      request.points ?? this.allianceService.calculatePoints(request.activityType, request.position).points;

    try {
      const { data, error } = await this.supabase
        .from('activities')
        .upsert(
          [
            {
              user_id: userId,
              activity_type: request.activityType,
              position: request.position,
              points,
              date: request.date.toISOString(),
            },
          ],
          { onConflict: 'user_id,activity_type,date' }
        )
        .select('id, user_id, activity_type, position, points, date, user_profiles(display_name)')
        .single();

      if (error) throw error;

      const newActivity = ActivityService.mapToActivity(data as unknown as ActivityWithUser);

      this.activitiesSignal.update(current => {
        const filtered = current.filter(
          a =>
            !(
              a.userId === newActivity.userId &&
              a.activityType === newActivity.activityType &&
              a.date.toISOString() === newActivity.date.toISOString()
            )
        );
        return [newActivity, ...filtered];
      });
      return { error: null };
    } catch (error) {
      console.error('Error upserting activity to Supabase:', error);
      return { error: error as Error };
    }
  }

  private async addActivityForMemberToSupabase(
    userId: string,
    request: ActivityRequest
  ): Promise<{ error: Error | null }> {
    // Use pre-calculated points (participation mode) or calculate from position
    const points =
      request.points ?? this.allianceService.calculatePoints(request.activityType, request.position).points;

    try {
      const { data, error } = await this.supabase
        .from('activities')
        .upsert(
          [
            {
              user_id: userId,
              activity_type: request.activityType,
              position: request.position,
              points,
              date: request.date.toISOString(),
            },
          ],
          { onConflict: 'user_id,activity_type,date' }
        )
        .select('id, user_id, activity_type, position, points, date, user_profiles(display_name)')
        .single();

      if (error) throw error;

      const newActivity = ActivityService.mapToActivity(data as unknown as ActivityWithUser);

      this.activitiesSignal.update(current => {
        const filtered = current.filter(
          a =>
            !(
              a.userId === newActivity.userId &&
              a.activityType === newActivity.activityType &&
              a.date.toISOString() === newActivity.date.toISOString()
            )
        );
        return [newActivity, ...filtered];
      });
      return { error: null };
    } catch (error) {
      console.error('Error upserting activity for member to Supabase:', error);
      return { error: error as Error };
    }
  }

  getUserScores(): UserScore[] {
    const activities = this.activitiesSignal();
    const sixWeeksAgo = new Date();
    sixWeeksAgo.setDate(sixWeeksAgo.getDate() - APP_CONSTANTS.SCORING.TOTAL_DAYS);

    const recentActivities = activities.filter(activity => new Date(activity.date) >= sixWeeksAgo);

    const userMap = new Map<string, Activity[]>();
    recentActivities.forEach(activity => {
      const userActivities = userMap.get(activity.userId) || [];
      userActivities.push(activity);
      userMap.set(activity.userId, userActivities);
    });

    const userScores: UserScore[] = [];
    userMap.forEach((activities, userId) => {
      const userName = activities[0]?.userName || 'Unknown';
      const weeklyScores = this.calculateWeeklyScores(activities);
      const sixWeekTotal = weeklyScores.reduce((sum, week) => sum + week.totalPoints, 0);

      userScores.push({
        userId,
        userName,
        weeklyScores,
        sixWeekTotal,
      });
    });

    // Détection des conflits de position entre utilisateurs (même activité, même semaine, même position)
    const weeksCount = userScores[0]?.weeklyScores.length ?? 0;
    for (let weekIdx = 0; weekIdx < weeksCount; weekIdx++) {
      const positionMap = new Map<string, Set<string>>();
      for (const userScore of userScores) {
        const week = userScore.weeklyScores[weekIdx];
        if (!week) continue;
        for (const act of week.activities) {
          if (act.position === null) continue; // participation mode, pas de conflit
          const key = act.activityType + '|' + act.position;
          if (!positionMap.has(key)) positionMap.set(key, new Set());
          positionMap.get(key)!.add(act.userId);
        }
      }
      const conflicts = new Set<string>();
      for (const [key, userIds] of positionMap.entries()) {
        if (userIds.size > 1) conflicts.add(key);
      }
      for (const userScore of userScores) {
        if (userScore.weeklyScores[weekIdx]) {
          userScore.weeklyScores[weekIdx].conflictingPositions = conflicts;
        }
      }
    }

    return userScores.sort((a, b) => b.sixWeekTotal - a.sixWeekTotal);
  }

  private calculateWeeklyScores(activities: Activity[]): WeeklyScore[] {
    const weeks: WeeklyScore[] = [];
    const today = new Date();

    for (let i = 0; i < APP_CONSTANTS.SCORING.WEEKS_TO_TRACK; i++) {
      const weekEnd = new Date(today);
      weekEnd.setDate(today.getDate() - i * APP_CONSTANTS.SCORING.DAYS_PER_WEEK);
      weekEnd.setHours(23, 59, 59, 999);

      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - (APP_CONSTANTS.SCORING.DAYS_PER_WEEK - 1));
      weekStart.setHours(0, 0, 0, 0);

      const weekActivities = activities.filter(activity => {
        const activityDate = new Date(activity.date);
        return activityDate >= weekStart && activityDate <= weekEnd;
      });

      const totalPoints = weekActivities.reduce((sum, activity) => sum + activity.points, 0);

      weeks.push({
        weekStart,
        weekEnd,
        totalPoints,
        activities: weekActivities,
        conflictingPositions: undefined,
      });
    }

    return weeks;
  }
}
