import type { SupabaseClient } from '@supabase/supabase-js';
import { openDemoSession } from './demo-session';

/** Activity under test. 'legion' is the one type the DB treats as scheduled in every week of every season. */
export const LEGION = 'legion';
/** Same as the app built-in default for legion when no point rule matches (constants.ts). */
const LEGION_DEFAULT_POINTS = 8;

export interface ActivityRow {
  position: number | null;
  points: number;
}

/** Monday 00:00 UTC of the current week: the only date the DB trigger accepts for "this week". */
export function currentWeekStartIso(now: Date = new Date()): string {
  const monday = new Date(now);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString();
}

/**
 * Reads / removes the e2e_admin own legion entry for the current week on ERA008-DEMO.
 * The entry is naturally identifiable: it is the single row keyed (e2e_admin, legion, this Monday),
 * the same key the app upserts on, so a rerun can never accumulate rows. Deletion uses the
 * regular "users can delete their own activities" RLS policy; nothing else is ever touched.
 */
export class ActivitySeeder {
  private constructor(
    private readonly client: SupabaseClient,
    private readonly serverId: string,
    private readonly userId: string
  ) {}

  static async open(): Promise<ActivitySeeder> {
    const { client, serverId, userId } = await openDemoSession();
    return new ActivitySeeder(client, serverId, userId);
  }

  async close(): Promise<void> {
    await this.client.auth.signOut();
  }

  /** Deletes the e2e_admin legion entry of this week (idempotent) and checks it is really gone. */
  async cleanup(): Promise<void> {
    const { error } = await this.client
      .from('activities')
      .delete()
      .eq('user_id', this.userId)
      .eq('activity_type', LEGION)
      .eq('date', currentWeekStartIso());
    if (error) throw new Error(`activity cleanup failed: ${error.message}`);
    if ((await this.countEntries()) !== 0) throw new Error('activity cleanup left a row behind');
  }

  async countEntries(): Promise<number> {
    const { count, error } = await this.client
      .from('activities')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', this.userId)
      .eq('activity_type', LEGION)
      .eq('date', currentWeekStartIso());
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async loadEntries(): Promise<ActivityRow[]> {
    const { data, error } = await this.client
      .from('activities')
      .select('position, points')
      .eq('user_id', this.userId)
      .eq('activity_type', LEGION)
      .eq('date', currentWeekStartIso());
    if (error) throw new Error(error.message);
    return (data ?? []) as ActivityRow[];
  }

  /**
   * Positions nobody else claimed for legion this week, so the app "same position" conflict
   * screen (which replaces the form) cannot interfere. Starts high to stay clear of real ranks.
   */
  async freeLegionPositions(count: number): Promise<number[]> {
    const { data, error } = await this.client
      .from('activities')
      .select('position')
      .eq('activity_type', LEGION)
      .eq('date', currentWeekStartIso());
    if (error) throw new Error(error.message);
    const taken = new Set((data ?? []).map(row => row.position as number | null));
    const free: number[] = [];
    for (let position = 40; free.length < count; position++) {
      if (!taken.has(position)) free.push(position);
    }
    return free;
  }

  /** Points the app awards to a legion entry at `position`: the server rule, else the built-in default. */
  async expectedLegionPoints(position: number): Promise<number> {
    const { data, error } = await this.client
      .from('activity_point_rules')
      .select('points')
      .eq('server_id', this.serverId)
      .eq('activity_type', LEGION)
      .lte('position_min', position)
      .gte('position_max', position)
      .limit(1);
    if (error) throw new Error(error.message);
    return (data?.[0]?.points as number | undefined) ?? LEGION_DEFAULT_POINTS;
  }
}
