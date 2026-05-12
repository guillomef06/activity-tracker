import { Injectable, signal, inject } from '@angular/core';
import {
  Activity,
  ActivityRequest,
  ActivityWithUser,
  BatchImportEntry,
  PositionConflict,
  UserScore,
  WeeklyScore,
} from '@shared/models';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ServerService } from './server.service';
import { APP_CONSTANTS } from '@shared/constants/constants';
import { getDateForWeeksAgo, getWeekEnd } from '@shared/utils/date.util';

@Injectable({
  providedIn: 'root',
})
export class ActivityService {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);
  private serverService = inject(ServerService);

  private activitiesSignal = signal<Activity[]>([]);
  private isInitialized = false;

  readonly activities = this.activitiesSignal.asReadonly();

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    await Promise.all([this.serverService.loadServer(), this.serverService.loadRules()]);
    await this.loadActivities();
    this.isInitialized = true;
  }

  private static mapToActivity(db: ActivityWithUser): Activity {
    return {
      id: db.id,
      userId: db.user_id,
      displayName: db.user_profiles.display_name,
      activityType: db.activity_type,
      position: db.position,
      points: db.points,
      date: new Date(db.date),
      timestamp: new Date(db.date).getTime(),
    };
  }

  private async loadActivities(): Promise<void> {
    try {
      const serverId = this.authService.getServerId();
      if (!serverId) {
        this.activitiesSignal.set([]);
        return;
      }

      const scoringWeeks = this.serverService.scoringWeeks();
      const cutoffDate = getDateForWeeksAgo(scoringWeeks - 1);

      const { data, error } = await this.supabase
        .from('activities')
        .select('id, user_id, activity_type, position, points, date, user_profiles(display_name)')
        .gte('date', cutoffDate.toISOString())
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
   * Admin-only method to add activity for another server member
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
    const points = request.points ?? this.serverService.calculatePoints(request.activityType, request.position).points;

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
    const points = request.points ?? this.serverService.calculatePoints(request.activityType, request.position).points;

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

  /**
   * Batch-import activities for multiple members (admin only).
   * Uses a single Supabase upsert for efficiency, then reloads the local signal.
   */
  async batchImportActivities(entries: BatchImportEntry[]): Promise<{ error: Error | null }> {
    const profile = this.authService.userProfile();
    if (!profile || (profile.role !== 'admin' && profile.role !== 'super_admin')) {
      return { error: new Error('Unauthorized: Only admins can batch import activities') };
    }

    const records = entries.map(e => ({
      user_id: e.userId,
      activity_type: e.activityType,
      position: e.position,
      points: e.points,
      date: e.date.toISOString(),
    }));

    try {
      const { error } = await this.supabase
        .from('activities')
        .upsert(records, { onConflict: 'user_id,activity_type,date' });

      if (error) throw error;

      await this.loadActivities();
      return { error: null };
    } catch (error) {
      console.error('Error batch-importing activities:', error);
      return { error: error as Error };
    }
  }

  async deleteAllActivities(): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.from('activities').delete().not('id', 'is', null);
      if (error) throw error;
      this.activitiesSignal.set([]);
      return { error: null };
    } catch (error) {
      console.error('Error deleting all activities:', error);
      return { error: error as Error };
    }
  }

  /**
   * Returns all position conflicts for the current user derived from the loaded activities signal.
   * A conflict exists when another user has recorded the same activityType + position on the same date.
   * Participation-mode activities (position === null) are excluded.
   * No network call — derived purely from the existing activitiesSignal.
   */
  getConflictsForCurrentUser(): PositionConflict[] {
    const currentUserId = this.authService.getUserId();
    if (!currentUserId) return [];

    const allActivities = this.activitiesSignal();
    const myActivities = allActivities.filter(a => a.userId === currentUserId && a.position !== null);

    const conflicts: PositionConflict[] = [];

    for (const mine of myActivities) {
      const myDate = mine.date.toISOString().slice(0, 10);

      const rival = allActivities.find(
        other =>
          other.userId !== currentUserId &&
          other.activityType === mine.activityType &&
          other.position === mine.position &&
          other.date.toISOString().slice(0, 10) === myDate
      );

      if (rival) {
        conflicts.push({
          activityId: mine.id,
          activityType: mine.activityType,
          position: mine.position as number,
          date: mine.date,
          conflictingDisplayName: rival.displayName,
        });
      }
    }

    return conflicts;
  }

  getUserScores(): UserScore[] {
    const activities = this.activitiesSignal();
    const tiebreaker = this.serverService.server()?.tiebreaker_activity_type ?? null;
    const scoringWeeks = this.serverService.scoringWeeks();
    const oldestWeekStart = getDateForWeeksAgo(scoringWeeks - 1);

    const recentActivities = activities.filter(activity => new Date(activity.date) >= oldestWeekStart);

    const userMap = new Map<string, Activity[]>();
    recentActivities.forEach(activity => {
      const userActivities = userMap.get(activity.userId) || [];
      userActivities.push(activity);
      userMap.set(activity.userId, userActivities);
    });

    const userScores: UserScore[] = [];
    userMap.forEach((activities, userId) => {
      const displayName = activities[0]?.displayName || 'Unknown';
      const weeklyScores = this.calculateWeeklyScores(activities, tiebreaker, scoringWeeks);
      const sixWeekTotal = weeklyScores.reduce((sum, week) => sum + week.totalPoints, 0);

      userScores.push({
        userId,
        displayName,
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

    return userScores.sort((a, b) => {
      const diff = b.sixWeekTotal - a.sixWeekTotal;
      if (diff !== 0) return diff;

      const tiebreaker = this.serverService.server()?.tiebreaker_activity_type;
      if (!tiebreaker) return 0;

      const tiebreakerScore = (u: UserScore) =>
        u.weeklyScores.reduce(
          (total, week) =>
            total +
            week.activities.filter(act => act.activityType === tiebreaker).reduce((sum, act) => sum + act.points, 0),
          0
        );

      return tiebreakerScore(b) - tiebreakerScore(a);
    });
  }

  private calculateWeeklyScores(
    activities: Activity[],
    tiebreakerType: string | null = null,
    weeksCount: number = APP_CONSTANTS.SCORING.WEEKS_TO_TRACK
  ): WeeklyScore[] {
    const weeks: WeeklyScore[] = [];

    for (let i = 0; i < weeksCount; i++) {
      const weekStart = getDateForWeeksAgo(i);
      const weekEnd = getWeekEnd(weekStart);

      const weekActivities = activities.filter(activity => {
        const activityDate = new Date(activity.date);
        return activityDate >= weekStart && activityDate <= weekEnd;
      });

      const scoringActivities = tiebreakerType
        ? weekActivities.filter(a => a.activityType !== tiebreakerType)
        : weekActivities;
      const totalPoints = scoringActivities.reduce((sum, activity) => sum + activity.points, 0);

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
