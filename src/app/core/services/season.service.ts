import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { SeasonWeekActivity, SeasonWithWeeks, CreateSeasonRequest, UpdateSeasonStructureRequest } from '@shared/models';
import { APP_CONSTANTS, ActivityType } from '@shared/constants/constants';
import { getWeekIndexInRange, getWeekStart, getWeekEnd } from '@shared/utils/date.util';

const LEGION_ACTIVITY_TYPE = 'legion';
const MAX_WEEK_COUNT = 52;
const MIN_WEEK_COUNT = 1;
const MONDAY_ISODOW = 1;

/** Raw row shape returned by Supabase for `season_activities`. */
interface SeasonActivityRow {
  id: string;
  season_id: string;
  week_index: number;
  activity_type: string;
}

/** Raw row shape returned by Supabase for `activity_seasons` joined with `season_activities`. */
interface SeasonRow {
  id: string;
  name: string;
  start_date: string;
  week_count: number;
  end_date: string;
  created_at: string;
  updated_at: string;
  season_activities: SeasonActivityRow[];
}

@Injectable({
  providedIn: 'root',
})
export class SeasonService {
  private readonly supabase = inject(SupabaseService);

  private readonly seasonsSignal = signal<SeasonWithWeeks[]>([]);

  readonly seasons = this.seasonsSignal.asReadonly();

  // ============================================
  // Mapping helpers
  // ============================================

  private static mapWeekActivity(row: SeasonActivityRow): SeasonWeekActivity {
    return {
      id: row.id,
      seasonId: row.season_id,
      weekIndex: row.week_index,
      activityType: row.activity_type,
    };
  }

  private static mapSeason(row: SeasonRow): SeasonWithWeeks {
    return {
      id: row.id,
      name: row.name,
      startDate: new Date(row.start_date),
      weekCount: row.week_count,
      endDate: new Date(row.end_date),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      weekActivities: (row.season_activities ?? []).map(SeasonService.mapWeekActivity),
    };
  }

  private static sortByStartDate(seasons: SeasonWithWeeks[]): SeasonWithWeeks[] {
    return [...seasons].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }

  private static toDateOnlyString(date: Date): string {
    return getWeekStart(date).toISOString().slice(0, 10);
  }

  // ============================================
  // Load
  // ============================================

  async loadSeasons(): Promise<void> {
    try {
      const { data, error } = await this.supabase.from('activity_seasons').select('*, season_activities(*)');

      if (error) throw error;

      const seasons = ((data ?? []) as unknown as SeasonRow[]).map(SeasonService.mapSeason);
      this.seasonsSignal.set(SeasonService.sortByStartDate(seasons));
    } catch (error) {
      console.error('SeasonService.loadSeasons error:', error);
      this.seasonsSignal.set([]);
    }
  }

  // ============================================
  // Pure lookups (no I/O)
  // ============================================

  getSeasonForDate(date: Date): SeasonWithWeeks | null {
    const target = date.getTime();
    return (
      this.seasonsSignal().find(
        season => season.startDate.getTime() <= target && target < SeasonService.endOfDayExclusive(season.endDate)
      ) ?? null
    );
  }

  /**
   * `endDate` is a DATE column (no time component) mapped to UTC midnight —
   * comparisons against it must therefore be exclusive of the *next* day's
   * midnight, not the raw timestamp, so that any time-of-day on the last
   * calendar day of the season is still included.
   */
  private static endOfDayExclusive(endDate: Date): number {
    const nextDay = new Date(endDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return nextDay.getTime();
  }

  getAvailableActivityTypesForDate(date: Date): ActivityType[] {
    const season = this.getSeasonForDate(date);
    if (!season) return [];

    const weekIndex = getWeekIndexInRange(date, season.startDate);
    const scheduledTypes = new Set(
      season.weekActivities.filter(week => week.weekIndex === weekIndex).map(week => week.activityType)
    );

    return APP_CONSTANTS.ACTIVITY_TYPES.filter(
      type => type.value === LEGION_ACTIVITY_TYPE || scheduledTypes.has(type.value)
    );
  }

  getEarliestAllowedDate(): Date | null {
    const seasons = this.seasonsSignal();
    if (seasons.length === 0) return null;

    return seasons.reduce(
      (earliest, season) => (season.startDate < earliest ? season.startDate : earliest),
      seasons[0].startDate
    );
  }

  suggestNextSeasonStartDate(): Date {
    const seasons = this.seasonsSignal();
    if (seasons.length === 0) return getWeekStart(new Date());

    const latestEndDate = seasons.reduce(
      (latest, season) => (season.endDate > latest ? season.endDate : latest),
      seasons[0].endDate
    );

    const nextDay = new Date(latestEndDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return getWeekStart(nextDay);
  }

  // ============================================
  // Targeted DB check (never relies on the local cache)
  // ============================================

  async checkSeasonLocked(seasonId: string): Promise<boolean> {
    const season = this.seasonsSignal().find(s => s.id === seasonId);
    if (!season) return false;

    try {
      const { count, error } = await this.supabase
        .from('activities')
        .select('id', { count: 'exact', head: true })
        .gte('date', season.startDate.toISOString())
        .lte('date', getWeekEnd(season.endDate).toISOString());

      if (error) throw error;
      return (count ?? 0) > 0;
    } catch (error) {
      console.error('SeasonService.checkSeasonLocked error:', error);
      return false;
    }
  }

  // ============================================
  // Client-side pre-validation (fast-fail UX only — DB constraints are authoritative)
  // ============================================

  /** Shared shape validation: applies to both creating a season and restructuring an existing one. */
  private static validateWeekStructure(
    weekCount: number,
    weekActivities: { weekIndex: number; activityType: string }[]
  ): string | null {
    if (weekCount < MIN_WEEK_COUNT || weekCount > MAX_WEEK_COUNT) {
      return 'season.errors.weekCountOutOfRange';
    }
    const invalidWeekIndex = weekActivities.some(w => w.weekIndex < 1 || w.weekIndex > weekCount);
    if (invalidWeekIndex) {
      return 'season.errors.weekIndexOutOfRange';
    }
    const containsLegion = weekActivities.some(w => w.activityType === LEGION_ACTIVITY_TYPE);
    if (containsLegion) {
      return 'season.errors.legionNotAllowed';
    }
    return null;
  }

  /** Create-only validation: start_date is immutable once set, so this only applies at creation time. */
  private static validateNewSeasonShape(
    startDate: Date,
    weekCount: number,
    weekActivities: { weekIndex: number; activityType: string }[]
  ): string | null {
    if (startDate.getUTCDay() !== MONDAY_ISODOW) {
      return 'season.errors.startDateMustBeMonday';
    }
    return SeasonService.validateWeekStructure(weekCount, weekActivities);
  }

  // ============================================
  // Mutations
  // ============================================

  /**
   * Creates a season and its week assignments.
   *
   * supabase-js does not expose multi-statement client-side transactions,
   * so this is done as: insert season row → batch-insert week rows → on
   * failure, best-effort delete the orphaned season row so we never leave
   * a season with no week assignments dangling. The DB triggers/constraints
   * remain the source of truth regardless of this compensating cleanup.
   */
  async createSeason(req: CreateSeasonRequest): Promise<{ season: SeasonWithWeeks | null; error: string | null }> {
    const validationError = SeasonService.validateNewSeasonShape(req.startDate, req.weekCount, req.weekActivities);
    if (validationError) {
      return { season: null, error: validationError };
    }

    try {
      const { data: seasonRow, error: seasonError } = await this.supabase
        .from('activity_seasons')
        .insert({
          name: req.name,
          start_date: SeasonService.toDateOnlyString(req.startDate),
          week_count: req.weekCount,
        })
        .select()
        .single();

      if (seasonError) throw seasonError;

      const seasonId = (seasonRow as { id: string }).id;
      const insertError = await this.insertWeekActivities(seasonId, req.weekActivities);

      if (insertError) {
        await this.supabase.from('activity_seasons').delete().eq('id', seasonId);
        return { season: null, error: insertError };
      }

      await this.loadSeasons();
      const created = this.seasonsSignal().find(s => s.id === seasonId) ?? null;
      return { season: created, error: null };
    } catch (error) {
      console.error('SeasonService.createSeason error:', error);
      return { season: null, error: (error as Error).message };
    }
  }

  private async insertWeekActivities(
    seasonId: string,
    weekActivities: { weekIndex: number; activityType: string }[]
  ): Promise<string | null> {
    if (weekActivities.length === 0) return null;

    const rows = weekActivities.map(w => ({
      season_id: seasonId,
      week_index: w.weekIndex,
      activity_type: w.activityType,
    }));

    const { error } = await this.supabase.from('season_activities').insert(rows);
    return error ? error.message : null;
  }

  async updateSeasonName(seasonId: string, name: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('activity_seasons').update({ name }).eq('id', seasonId);
      if (error) throw error;

      await this.loadSeasons();
      return { error: null };
    } catch (error) {
      console.error('SeasonService.updateSeasonName error:', error);
      return { error: (error as Error).message };
    }
  }

  /**
   * Updates week_count and replaces all week assignments for a season.
   * Expected to fail via the DB lock trigger if the season already has
   * logged activities — that error string is surfaced as-is.
   */
  async updateSeasonStructure(req: UpdateSeasonStructureRequest): Promise<{ error: string | null }> {
    const validationError = SeasonService.validateWeekStructure(req.weekCount, req.weekActivities);
    if (validationError) {
      return { error: validationError };
    }

    try {
      const { error: updateError } = await this.supabase
        .from('activity_seasons')
        .update({ week_count: req.weekCount })
        .eq('id', req.seasonId);

      if (updateError) throw updateError;

      const { error: deleteError } = await this.supabase
        .from('season_activities')
        .delete()
        .eq('season_id', req.seasonId);

      if (deleteError) throw deleteError;

      const insertError = await this.insertWeekActivities(req.seasonId, req.weekActivities);
      if (insertError) throw new Error(insertError);

      await this.loadSeasons();
      return { error: null };
    } catch (error) {
      console.error('SeasonService.updateSeasonStructure error:', error);
      return { error: (error as Error).message };
    }
  }

  async deleteSeason(seasonId: string): Promise<{ error: string | null }> {
    try {
      const { error } = await this.supabase.from('activity_seasons').delete().eq('id', seasonId);
      if (error) throw error;

      await this.loadSeasons();
      return { error: null };
    } catch (error) {
      console.error('SeasonService.deleteSeason error:', error);
      return { error: (error as Error).message };
    }
  }
}
