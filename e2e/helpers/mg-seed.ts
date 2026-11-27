import type { SupabaseClient } from '@supabase/supabase-js';
import { DEMO_SERVER_NAME } from './env';
import { openDemoSession } from './demo-session';

/**
 * Far-future Monday used for the throw-away finished event. It is later than any real
 * event (so the app treats it as "the last finished event" and shows the correction
 * panel) and its week never ends, so it can never deduct anything from a real leaderboard.
 */
export const SEED_EVENT_START = '2031-01-06';

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
 * Monday used by the registration -> selection -> publication flow, distinct from
 * SEED_EVENT_START so the two specs can never touch each other's event. The event is left
 * non-finished, so while it exists `MgEventService.queryCurrentEvent()` (which orders
 * `start_date ASCENDING` and takes the first active-status row) must treat it as "the"
 * current event. Deliberately in the PAST, not the future: migration 47's global calendar
 * now creates real, active MG events on ERA008-DEMO (it is one of the opted-in servers), and
 * those always sort before any far-future test date in that ascending query. A date far in
 * the past sorts before every real event instead, past or future, for as long as this app
 * exists — the third reserved date migration 48 (e2e_mg_assert_reserved_date) already
 * provisioned for exactly this, previously unused by this file.
 */
export const FLOW_EVENT_START = '2020-03-02';

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
  /** Optional per-player registration details (keyed by display name), e.g. to make screenshots richer. */
  registrationDetails?: Readonly<Record<string, { desiredSlotOrder?: number; comment?: string }>>;
}

export interface SavedSelectionRow {
  rank: number;
  selection_type: string;
  label: string | null;
  cost: number;
  approved_cost: number | null;
  display_name: string | null;
}

export interface ConfigSnapshotRow {
  capacity: number;
  assignment_mode: string;
  dkp_enabled: boolean;
}

export interface SlotSnapshotRow {
  slot_order: number;
  cost: number;
  target_min: number;
  target_max: number;
}

/** What ERA008-DEMO's MG settings looked like: `config` is null when the row did not exist. */
export interface SettingsSnapshot {
  config: ConfigSnapshotRow | null;
  slots: SlotSnapshotRow[];
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

  /**
   * Removes the seeded event (cascade deletes its selections/registrations). Idempotent.
   * Migration 47 (global MG calendar) removed client INSERT/DELETE on mg_events, so this
   * goes through the e2e_mg_delete_event() RPC (migration 48) instead of a direct delete —
   * it resolves ERA008-DEMO server-side from the caller's own admin profile and only ever
   * accepts the reserved e2e dates (assertSeedDate below is a client-side mirror of the
   * same guard, so a wrong date fails fast with a clearer message).
   */
  async cleanup(startDate: string = SEED_EVENT_START): Promise<void> {
    assertSeedDate(startDate);
    const { error } = await this.client.rpc('e2e_mg_delete_event', { p_start_date: startDate });
    if (error) throw new Error(`cleanup failed: ${error.message}`);
  }

  /**
   * Creates the mg_events row at `startDate` through e2e_mg_seed_event() (the only path left
   * since migration 47), which also deletes any pre-existing row at that date first. Returns
   * the new event id. The RPC derives end_date/registration_open_at/registration_close_at the
   * same way the real calendar does (start+6 / start-7 / start-4), matching the values this
   * seeder used to hardcode.
   */
  private async seedEventViaRpc(
    startDate: string,
    status: 'registration_open' | 'registration_closed' | 'finished',
    published: boolean
  ): Promise<string> {
    assertSeedDate(startDate);
    const { data, error } = await this.client.rpc('e2e_mg_seed_event', {
      p_start_date: startDate,
      p_status: status,
      p_published: published,
    });
    if (error || !data) throw new Error(`seed event failed: ${error?.message}`);
    return data as string;
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
    await this.assertDefaultSlotCosts();

    const idByName = await this.memberIdsByName();
    const eventId = await this.seedEventViaRpc(SEED_EVENT_START, 'finished', true);

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

  /** Inserts mg_registrations rows for the named players (unaffected by migration 47: only
   * mg_events' own INSERT/DELETE/UPDATE were restricted, registrations/selections are
   * untouched). Admin-branch policy, so the event's current status never gates this insert. */
  private async registerPlayers(eventId: string, options: FlowEventOptions): Promise<void> {
    const names = options.registeredPlayers ?? [];
    if (names.length === 0) return;
    const idByName = await this.memberIdsByName();
    const rows = names.map(name => {
      const userId = idByName.get(name);
      if (!userId) throw new Error(`Seed player "${name}" not found on ${DEMO_SERVER_NAME}`);
      const detail = options.registrationDetails?.[name];
      return {
        mg_event_id: eventId,
        user_id: userId,
        desired_slot_order: detail?.desiredSlotOrder ?? 1,
        comment: detail?.comment ?? null,
      };
    });
    const { error } = await this.client.from('mg_registrations').insert(rows);
    if (error) throw new Error(`seed registrations failed: ${error.message}`);
  }

  /**
   * Creates a registration_open event at FLOW_EVENT_START on ERA008-DEMO, optionally with
   * some demo members already registered. Returns the event id.
   */
  async seedFlowEvent(options: FlowEventOptions = {}): Promise<string> {
    const eventId = await this.seedEventViaRpc(FLOW_EVENT_START, 'registration_open', false);
    try {
      await this.registerPlayers(eventId, options);
    } catch (e) {
      await this.cleanup(FLOW_EVENT_START);
      throw e;
    }
    return eventId;
  }

  /**
   * Flow event (FLOW_EVENT_START only) already published: the registrants are the selected
   * players (rank order, default slot costs), the remaining slots up to capacity are FFA.
   * Seeded directly at `registration_closed` (not via seedFlowEvent) because the final publish
   * step below is the ONE client write migration 47 still allows on mg_events — the guard
   * trigger only accepts the exact registration_closed -> selection_published transition.
   */
  async seedPublishedFlowEvent(options: FlowEventOptions = {}): Promise<string> {
    await this.assertDefaultSlotCosts();
    const eventId = await this.seedEventViaRpc(FLOW_EVENT_START, 'registration_closed', false);
    try {
      await this.registerPlayers(eventId, options);
      const names = options.registeredPlayers ?? [];
      const idByName = await this.memberIdsByName();
      const selected = names.map((name, i) => {
        const defaults = SEEDED_PLAYERS[i];
        const userId = idByName.get(name);
        if (!defaults || !userId) throw new Error(`Cannot select "${name}" for the published flow event`);
        return {
          mg_event_id: eventId,
          user_id: userId,
          rank: defaults.rank,
          selection_type: 'selected',
          selected_by: 'automatic',
          cost: defaults.cost,
          approved_rank: defaults.rank,
          approved_cost: defaults.cost,
        };
      });
      const ffa = Array.from({ length: CAPACITY - names.length }, (_, i) => ({
        mg_event_id: eventId,
        user_id: null,
        rank: names.length + i + 1,
        selection_type: 'ffa',
        selected_by: 'automatic',
        cost: 0,
      }));
      const { error: selError } = await this.client.from('mg_selections').insert([...selected, ...ffa]);
      if (selError) throw new Error(`seed published selection failed: ${selError.message}`);
      const { error: updError } = await this.client
        .from('mg_events')
        .update({ status: 'selection_published', selection_published_at: new Date().toISOString() })
        .eq('id', eventId)
        .eq('start_date', FLOW_EVENT_START);
      if (updError) throw new Error(`publish flow event failed: ${updError.message}`);
    } catch (e) {
      await this.cleanup(FLOW_EVENT_START);
      throw e;
    }
    return eventId;
  }

  /**
   * What the Thursday cron does: registration_open -> registration_closed. Migration 47's guard
   * trigger does not allow this client UPDATE any more (only registration_closed ->
   * selection_published is left), so this goes through e2e_mg_set_status() (migration 48),
   * which only ever accepts this one transition — same restriction, enforced server-side.
   * `eventId` is kept for API compatibility (both call sites already have it); the RPC itself
   * only needs the reserved start date, since it resolves ERA008-DEMO from the caller.
   */
  async closeRegistration(_eventId: string): Promise<void> {
    const { error } = await this.client.rpc('e2e_mg_set_status', {
      p_start_date: FLOW_EVENT_START,
      p_status: 'registration_closed',
    });
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

  /** Captures server_mg_config (row or absence) and server_mg_slot_config of the demo server. */
  async snapshotSettings(): Promise<SettingsSnapshot> {
    const { data: config, error: configError } = await this.client
      .from('server_mg_config')
      .select('capacity, assignment_mode, dkp_enabled')
      .eq('server_id', this.serverId)
      .maybeSingle();
    if (configError) throw new Error(`snapshot config failed: ${configError.message}`);
    const { data: slots, error: slotsError } = await this.client
      .from('server_mg_slot_config')
      .select('slot_order, cost, target_min, target_max')
      .eq('server_id', this.serverId)
      .order('slot_order');
    if (slotsError) throw new Error(`snapshot slots failed: ${slotsError.message}`);
    return { config: (config as ConfigSnapshotRow | null) ?? null, slots: (slots ?? []) as SlotSnapshotRow[] };
  }

  /**
   * Puts the MG settings of the demo server back to `snapshot` and re-reads them: throws if the
   * restored state is not strictly equal, so a test can never leave a customised DEMO config behind.
   */
  async restoreSettings(snapshot: SettingsSnapshot): Promise<void> {
    if (snapshot.config) {
      const { error } = await this.client
        .from('server_mg_config')
        .upsert({ server_id: this.serverId, ...snapshot.config }, { onConflict: 'server_id' });
      if (error) throw new Error(`restore config failed: ${error.message}`);
    } else {
      const { error } = await this.client.from('server_mg_config').delete().eq('server_id', this.serverId);
      if (error) throw new Error(`restore config (delete) failed: ${error.message}`);
    }
    const { error: deleteError } = await this.client
      .from('server_mg_slot_config')
      .delete()
      .eq('server_id', this.serverId);
    if (deleteError) throw new Error(`restore slots (delete) failed: ${deleteError.message}`);
    if (snapshot.slots.length > 0) {
      const { error } = await this.client
        .from('server_mg_slot_config')
        .insert(snapshot.slots.map(s => ({ server_id: this.serverId, ...s })));
      if (error) throw new Error(`restore slots failed: ${error.message}`);
    }
    const after = await this.snapshotSettings();
    if (JSON.stringify(after) !== JSON.stringify(snapshot)) {
      throw new Error(`E2E settings restore NOT verified on ${DEMO_SERVER_NAME}: manual check required.`);
    }
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
