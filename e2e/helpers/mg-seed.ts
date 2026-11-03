import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_SERVER_NAME } from './env';
import { openDemoSession } from './demo-session';

/**
 * Far-future Monday used for the throw-away finished event. It is later than any real
 * event (so the app treats it as "the last finished event" and shows the correction
 * panel) and its week never ends, so it can never deduct anything from a real leaderboard.
 */
export const SEED_EVENT_START = '2031-01-06';
const SEED_EVENT_END = '2031-01-12';

/** Players 1..6 ranked 1..6 on the "published" list; slots 7..10 are FFA. Costs = default slot costs. */
export const SEEDED_PLAYERS = [
  { name: 'Demo Player 1', rank: 1, cost: 150 },
  { name: 'Demo Player 2', rank: 2, cost: 140 },
  { name: 'Demo Player 3', rank: 3, cost: 130 },
  { name: 'Demo Player 4', rank: 4, cost: 120 },
  { name: 'Demo Player 5', rank: 5, cost: 100 },
  { name: 'Demo Player 6', rank: 6, cost: 90 },
] as const;
const CAPACITY = 10;

/**
 * Far-future Monday used by the registration -> selection -> publication flow. Distinct from
 * SEED_EVENT_START so the two specs can never touch each other's event. The event is left
 * non-finished, so while it exists it is the app's "current event" (latest start_date).
 */
export const FLOW_EVENT_START = '2031-03-03';
const FLOW_EVENT_END = '2031-03-09';

/** Writes are only allowed on the two dates reserved for e2e events, never on a real event. */
const RESERVED_SEED_DATES: readonly string[] = [SEED_EVENT_START, FLOW_EVENT_START];
function assertSeedDate(startDate: string): void {
  if (!RESERVED_SEED_DATES.includes(startDate)) {
    throw new Error(`E2E safety guard: ${startDate} is not a reserved e2e event date.`);
  }
}

export type FlowEventStatus = 'registration_open' | 'registration_closed';

export interface FlowEventOptions {
  /** Members of ERA008-DEMO registered by the seeder (by display name), as if they signed up. */
  registeredPlayers?: readonly string[];
}

export interface SavedSelectionRow {
  rank: number;
  selection_type: string;
  label: string | null;
  cost: number;
  approved_cost: number | null;
  display_name: string | null;
}

/**
 * Seeds / reads / removes MG data as the e2e_admin user, through the regular authenticated
 * API (RLS applies: an admin can only touch their own server). Every write is scoped to
 * the ERA008-DEMO server id resolved and verified in `open()`.
 */
export class MgSeeder {
  private constructor(
    private readonly client: SupabaseClient,
    private readonly serverId: string
  ) {}

  static async open(): Promise<MgSeeder> {
    const { client, serverId } = await openDemoSession();
    return new MgSeeder(client, serverId);
  }

  async close(): Promise<void> {
    await this.client.auth.signOut();
  }

  /** Removes the seeded event (cascade deletes its selections/registrations). Idempotent. */
  async cleanup(startDate: string = SEED_EVENT_START): Promise<void> {
    assertSeedDate(startDate);
    const { error } = await this.client
      .from('mg_events')
      .delete()
      .eq('server_id', this.serverId)
      .eq('start_date', startDate);
    if (error) throw new Error(`cleanup failed: ${error.message}`);
  }

  /** Number of events left on ERA008-DEMO at a given start date (used to prove cleanup). */
  async countEventsAt(startDate: string): Promise<number> {
    const { count, error } = await this.client
      .from('mg_events')
      .select('*', { count: 'exact', head: true })
      .eq('server_id', this.serverId)
      .eq('start_date', startDate);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  /** Creates a finished event with a published selection (players 1-6 + 4 FFA). Returns the event id. */
  async seedFinishedEvent(): Promise<string> {
    await this.cleanup();
    await this.assertDefaultSlotCosts();

    const idByName = await this.memberIdsByName();

    const { data: event, error: eventError } = await this.client
      .from('mg_events')
      .insert({
        server_id: this.serverId,
        start_date: SEED_EVENT_START,
        end_date: SEED_EVENT_END,
        registration_open_at: '2030-12-30',
        registration_close_at: '2031-01-02',
        status: 'finished',
        selection_published_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (eventError || !event) throw new Error(`seed event failed: ${eventError?.message}`);
    const eventId = event.id as string;

    const selected = SEEDED_PLAYERS.map(p => {
      const userId = idByName.get(p.name);
      if (!userId) throw new Error(`Seed player "${p.name}" not found on ${DEMO_SERVER_NAME}`);
      return {
        mg_event_id: eventId,
        user_id: userId,
        rank: p.rank,
        selection_type: 'selected',
        selected_by: 'automatic',
        cost: p.cost,
        approved_rank: p.rank,
        approved_cost: p.cost,
      };
    });
    const ffa = Array.from({ length: CAPACITY - SEEDED_PLAYERS.length }, (_, i) => ({
      mg_event_id: eventId,
      user_id: null,
      rank: SEEDED_PLAYERS.length + i + 1,
      selection_type: 'ffa',
      selected_by: 'automatic',
      cost: 0,
    }));
    const { error: selError } = await this.client.from('mg_selections').insert([...selected, ...ffa]);
    if (selError) {
      await this.cleanup();
      throw new Error(`seed selection failed: ${selError.message}`);
    }
    return eventId;
  }

  /**
   * Creates a registration_open event at FLOW_EVENT_START on ERA008-DEMO, optionally with
   * some demo members already registered. Returns the event id.
   */
  async seedFlowEvent(options: FlowEventOptions = {}): Promise<string> {
    await this.cleanup(FLOW_EVENT_START);
    const { data: event, error } = await this.client
      .from('mg_events')
      .insert({
        server_id: this.serverId,
        start_date: FLOW_EVENT_START,
        end_date: FLOW_EVENT_END,
        registration_open_at: '2031-02-24',
        registration_close_at: '2031-02-27',
        status: 'registration_open',
      })
      .select('id')
      .single();
    if (error || !event) throw new Error(`seed flow event failed: ${error?.message}`);
    const eventId = event.id as string;

    try {
      const names = options.registeredPlayers ?? [];
      if (names.length > 0) {
        const idByName = await this.memberIdsByName();
        const rows = names.map(name => {
          const userId = idByName.get(name);
          if (!userId) throw new Error(`Seed player "${name}" not found on ${DEMO_SERVER_NAME}`);
          return { mg_event_id: eventId, user_id: userId, desired_slot_order: 1, comment: null };
        });
        const { error: regError } = await this.client.from('mg_registrations').insert(rows);
        if (regError) throw new Error(`seed registrations failed: ${regError.message}`);
      }
    } catch (e) {
      await this.cleanup(FLOW_EVENT_START);
      throw e;
    }
    return eventId;
  }

  /** What the Thursday cron does: registration_open -> registration_closed. */
  async closeRegistration(eventId: string): Promise<void> {
    const { error } = await this.client
      .from('mg_events')
      .update({ status: 'registration_closed' })
      .eq('id', eventId)
      .eq('start_date', FLOW_EVENT_START);
    if (error) throw new Error(`close registration failed: ${error.message}`);
  }

  async eventStatus(eventId: string): Promise<string> {
    const { data, error } = await this.client.from('mg_events').select('status').eq('id', eventId).single();
    if (error || !data) throw new Error(`load event failed: ${error?.message}`);
    return data.status as string;
  }

  async countRegistrations(eventId: string): Promise<number> {
    const { count, error } = await this.client
      .from('mg_registrations')
      .select('*', { count: 'exact', head: true })
      .eq('mg_event_id', eventId);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  private async memberIdsByName(): Promise<Map<string, string>> {
    const { data, error } = await this.client
      .from('user_profiles')
      .select('id, display_name')
      .eq('server_id', this.serverId);
    if (error) throw new Error(error.message);
    return new Map((data ?? []).map(m => [m.display_name as string, m.id as string]));
  }

  async loadSelection(eventId: string): Promise<SavedSelectionRow[]> {
    const { data, error } = await this.client
      .from('mg_selections')
      .select('rank, selection_type, label, cost, approved_cost, user_profiles(display_name)')
      .eq('mg_event_id', eventId)
      .order('rank');
    if (error) throw new Error(error.message);
    return (data ?? []).map(row => ({
      rank: row.rank as number,
      selection_type: row.selection_type as string,
      label: row.label as string | null,
      cost: row.cost as number,
      approved_cost: row.approved_cost as number | null,
      display_name: (row.user_profiles as unknown as { display_name: string } | null)?.display_name ?? null,
    }));
  }

  /** The tests assume the built-in slot costs; a customised DEMO config would silently skew them. */
  private async assertDefaultSlotCosts(): Promise<void> {
    const { count, error } = await this.client
      .from('server_mg_slot_config')
      .select('*', { count: 'exact', head: true })
      .eq('server_id', this.serverId);
    if (error) throw new Error(error.message);
    if ((count ?? 0) > 0) {
      throw new Error(`${DEMO_SERVER_NAME} has custom MG slot costs; e2e specs assume the defaults.`);
    }
  }
}
