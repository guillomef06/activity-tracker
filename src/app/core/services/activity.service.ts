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
import type { SeasonWithWeeks } from '@shared/models';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ServerService } from './server.service';
import { APP_CONSTANTS } from '@shared/constants/constants';
import { getDateForWeeksAgo, getWeekEnd, getWeekStart } from '@shared/utils/date.util';
import { computeFifoDeductions, type FifoEarningWeek, type FifoSpend } from '@shared/utils/mg-dkp.util';

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
        .select('id, user_id, activity_type, position, points, date, user_profiles!inner(display_name, server_id)')
        .eq('user_profiles.server_id', serverId)
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

  async deleteActivity(id: string): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.from('activities').delete().eq('id', id);
      if (error) throw error;
      this.activitiesSignal.update(activities => activities.filter(a => a.id !== id));
      return { error: null };
    } catch (error) {
      console.error('Error deleting activity:', error);
      return { error: error as Error };
    }
  }

  async deleteActivitiesByType(activityType: string): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase.from('activities').delete().eq('activity_type', activityType);
      if (error) throw error;
      this.activitiesSignal.update(activities => activities.filter(a => a.activityType !== activityType));
      return { error: null };
    } catch (error) {
      console.error('Error deleting activities by type:', error);
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
    const userScores = this.buildUserScores(recentActivities, tiebreaker, scoringWeeks);

    this.annotatePositionConflicts(userScores);

    return userScores.sort((a, b) => this.compareByScoreDesc(a, b));
  }

  /**
   * Sums every point each user earned across the full `season` date range,
   * independent of the rolling scoring window and of DKP spending — the
   * "historical season total" shown alongside the current (net) leaderboard
   * total.
   *
   * Runs its OWN query rather than reusing the loaded activities signal: a
   * season can be longer than the rolling window, so the signal doesn't hold
   * the season's earliest weeks. Excludes the tiebreaker activity type to match
   * how getUserScores() computes the current total (same kind of points on both
   * numbers). Server scoping is applied explicitly (same reason as
   * loadActivities): a super_admin session bypasses the RLS server scope.
   *
   * @returns userId → total season points (users with no season activity are absent)
   */
  async loadSeasonTotals(season: SeasonWithWeeks): Promise<Map<string, number>> {
    const serverId = this.authService.getServerId();
    if (!serverId) return new Map();

    const tiebreaker = this.serverService.server()?.tiebreaker_activity_type ?? null;

    const { data, error } = await this.supabase
      .from('activities')
      .select('user_id, activity_type, points, user_profiles!inner(server_id)')
      .eq('user_profiles.server_id', serverId)
      .gte('date', season.startDate.toISOString())
      .lte('date', getWeekEnd(season.endDate).toISOString());

    if (error) {
      console.error('Error loading season totals:', error);
      return new Map();
    }

    const rows = (data ?? []) as unknown as { user_id: string; activity_type: string; points: number }[];

    const totals = new Map<string, number>();
    for (const row of rows) {
      if (tiebreaker && row.activity_type === tiebreaker) continue;
      totals.set(row.user_id, (totals.get(row.user_id) ?? 0) + row.points);
    }
    return totals;
  }

  /**
   * Returns a copy of `scores` with each user's `seasonTotal` populated from
   * `totals` (0 when absent). Pure/no I/O — ordering is unchanged; the leaderboard
   * component owns which key it sorts by.
   */
  applySeasonTotals(scores: UserScore[], totals: Map<string, number>): UserScore[] {
    return scores.map(s => ({ ...s, seasonTotal: totals.get(s.userId) ?? 0 }));
  }

  private buildUserScores(recentActivities: Activity[], tiebreaker: string | null, scoringWeeks: number): UserScore[] {
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
      const totalScore = weeklyScores.reduce((sum, week) => sum + week.totalPoints, 0);

      userScores.push({
        userId,
        displayName,
        weeklyScores,
        totalScore,
      });
    });

    return userScores;
  }

  /**
   * Détection des conflits de position entre utilisateurs (même activité, même semaine, même position).
   * Annote WeeklyScore.conflictingPositions en mutant userScores en place.
   */
  private annotatePositionConflicts(userScores: UserScore[]): void {
    const weeksCount = userScores[0]?.weeklyScores.length ?? 0;
    for (let weekIdx = 0; weekIdx < weeksCount; weekIdx++) {
      const conflicts = this.findConflictingPositions(userScores, weekIdx);
      for (const userScore of userScores) {
        if (userScore.weeklyScores[weekIdx]) {
          userScore.weeklyScores[weekIdx].conflictingPositions = conflicts;
        }
      }
    }
  }

  private findConflictingPositions(userScores: UserScore[], weekIdx: number): Set<string> {
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
    return conflicts;
  }

  /**
   * Applies per-user DKP deductions (MG event selection cost) on top of
   * getUserScores() output, then re-sorts since a deduction can change the
   * ranking. Kept here rather than in MgEventService so ActivityService
   * stays the single owner of "how the leaderboard total/ranking is
   * computed" (it already owns compareByScoreDesc's tiebreak rule).
   */
  applyMgDeductions(scores: UserScore[], deductions: Map<string, number>): UserScore[] {
    return scores
      .map(s => {
        // FIFO deductions (computeFifoDeductions) already never exceed the points still
        // in the window, but clamp the applied amount to the available total as a floor
        // so the displayed balance can never go negative regardless of the map's source.
        const mgDeduction = Math.min(deductions.get(s.userId) ?? 0, Math.max(0, s.totalScore));
        return { ...s, mgDeduction, totalScore: s.totalScore - mgDeduction };
      })
      .sort((a, b) => this.compareByScoreDesc(a, b));
  }

  /**
   * Resolves FIFO DKP deductions per user: each spend consumes the oldest
   * still-available points first, and only consumed points whose week is still
   * in the current rolling window are deducted (see mg-dkp.util).
   *
   * This runs its OWN earnings query rather than reusing the loaded activities
   * signal: FIFO needs up to 2× the window of history (a spend inside the
   * current window may have consumed weeks a full window older than itself),
   * while the signal only holds the current window. Keeping it separate leaves
   * the leaderboard/conflict load path untouched.
   *
   * Earnings exclude the tiebreaker activity type, mirroring getUserScores()
   * so the consumable base matches the displayed total.
   *
   * @param spends published spends whose event week has ended (MgEventService.loadSpends)
   */
  async loadFifoDeductions(spends: FifoSpend[]): Promise<Map<string, number>> {
    if (spends.length === 0) return new Map();

    const serverId = this.authService.getServerId();
    if (!serverId) return new Map();

    const scoringWeeks = this.serverService.scoringWeeks();
    const tiebreaker = this.serverService.server()?.tiebreaker_activity_type ?? null;
    const currentWeekStart = getWeekStart(new Date());
    // 2× the window (minus the current week) covers any spend still in-window plus
    // the oldest earning week it could have consumed.
    const earningsCutoff = getDateForWeeksAgo(2 * scoringWeeks - 1);

    const earningsByUser = await this.loadEarningsByUser(serverId, earningsCutoff, tiebreaker);

    return computeFifoDeductions(earningsByUser, spends, scoringWeeks, currentWeekStart.getTime());
  }

  /**
   * Loads per-user, per-week earned points since `cutoff` for FIFO attribution.
   * Points are bucketed by the Monday 00:00 UTC of each activity's week and
   * summed; the tiebreaker type is excluded to match the leaderboard total.
   */
  private async loadEarningsByUser(
    serverId: string,
    cutoff: Date,
    tiebreaker: string | null
  ): Promise<Map<string, FifoEarningWeek[]>> {
    const { data, error } = await this.supabase
      .from('activities')
      .select('user_id, activity_type, points, date, user_profiles!inner(server_id)')
      .eq('user_profiles.server_id', serverId)
      .gte('date', cutoff.toISOString());

    if (error) {
      console.error('Error loading earnings for FIFO deductions:', error);
      return new Map();
    }

    const rows = (data ?? []) as unknown as {
      user_id: string;
      activity_type: string;
      points: number;
      date: string;
    }[];

    // userId → (weekStartMs → points)
    const byUser = new Map<string, Map<number, number>>();
    for (const row of rows) {
      if (tiebreaker && row.activity_type === tiebreaker) continue;
      const weekStartMs = getWeekStart(new Date(row.date)).getTime();
      const weeks = byUser.get(row.user_id) ?? new Map<number, number>();
      weeks.set(weekStartMs, (weeks.get(weekStartMs) ?? 0) + row.points);
      byUser.set(row.user_id, weeks);
    }

    const result = new Map<string, FifoEarningWeek[]>();
    for (const [userId, weeks] of byUser) {
      result.set(
        userId,
        [...weeks.entries()].map(([weekStartMs, points]) => ({ weekStartMs, points }))
      );
    }
    return result;
  }

  private compareByScoreDesc(a: UserScore, b: UserScore): number {
    const diff = b.totalScore - a.totalScore;
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
