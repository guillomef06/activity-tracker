import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type {
  MgEvent,
  ServerMgConfig,
  MgRegistration,
  MgRegistrationWithUser,
  MgSelectionWithUser,
  MgSelectionPayload,
  MgLeaderboardEntry,
  UpsertServerMgConfigRequest,
  ServerMgSlotConfig,
  UpsertMgSlotConfigRow,
  RegisterMgPlayerPayload,
} from '@shared/models';
import type { MgSlotRow } from '@shared/utils/mg-slot.util';
import { buildSelectionPayload } from '@shared/utils/mg-selection.util';
import { getWeekStart, getWeekEnd } from '@shared/utils/date.util';
import type { FifoSpend } from '@shared/utils/mg-dkp.util';

@Injectable({
  providedIn: 'root',
})
export class MgEventService {
  private readonly supabase = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  async loadCurrentEvent(serverId: string): Promise<MgEvent | null> {
    const { data, error } = await this.supabase
      .from('mg_events')
      .select('*')
      .eq('server_id', serverId)
      .not('status', 'eq', 'finished')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error loading MG event:', error);
      return null;
    }
    return data as MgEvent | null;
  }

  /**
   * Most recent finished event, used by admins to correct its selection after
   * the fact (loadCurrentEvent excludes finished events).
   */
  async loadLastFinishedEvent(serverId: string): Promise<MgEvent | null> {
    const { data, error } = await this.supabase
      .from('mg_events')
      .select('*')
      .eq('server_id', serverId)
      .eq('status', 'finished')
      .order('start_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error loading last finished MG event:', error);
      return null;
    }
    return data as MgEvent | null;
  }

  async loadServerConfig(serverId: string): Promise<ServerMgConfig | null> {
    const { data, error } = await this.supabase
      .from('server_mg_config')
      .select('*')
      .eq('server_id', serverId)
      .maybeSingle();

    if (error) {
      console.error('Error loading server MG config:', error);
      return null;
    }
    return data as ServerMgConfig | null;
  }

  async saveServerConfig(serverId: string, config: UpsertServerMgConfigRequest): Promise<{ error: unknown }> {
    const { error } = await this.supabase.from('server_mg_config').upsert(
      {
        server_id: serverId,
        capacity: config.capacity,
        assignment_mode: config.assignment_mode,
        dkp_enabled: config.dkp_enabled,
      },
      { onConflict: 'server_id' }
    );
    return { error };
  }

  async loadSlotConfig(serverId: string): Promise<ServerMgSlotConfig[]> {
    const { data, error } = await this.supabase
      .from('server_mg_slot_config')
      .select('*')
      .eq('server_id', serverId)
      .order('slot_order', { ascending: true });

    if (error) {
      console.error('Error loading MG slot config:', error);
      return [];
    }
    return (data ?? []) as ServerMgSlotConfig[];
  }

  async saveSlotConfig(serverId: string, rows: UpsertMgSlotConfigRow[]): Promise<{ error: unknown }> {
    const payload = rows.map(r => ({ server_id: serverId, ...r }));
    const { error } = await this.supabase
      .from('server_mg_slot_config')
      .upsert(payload, { onConflict: 'server_id,slot_order' });
    return { error };
  }

  async loadRegistrations(mgEventId: string): Promise<MgRegistrationWithUser[]> {
    const { data, error } = await this.supabase
      .from('mg_registrations')
      .select('*, user_profiles(display_name, username)')
      .eq('mg_event_id', mgEventId)
      .order('registered_at', { ascending: true });

    if (error) {
      console.error('Error loading registrations:', error);
      return [];
    }
    return (data ?? []) as MgRegistrationWithUser[];
  }

  async registerPlayer(
    mgEventId: string,
    userId: string,
    payload: RegisterMgPlayerPayload
  ): Promise<{ error: unknown }> {
    const { error } = await this.supabase.from('mg_registrations').insert({
      mg_event_id: mgEventId,
      user_id: userId,
      desired_slot_order: payload.desired_slot_order,
      comment: payload.comment,
    });
    return { error };
  }

  async unregisterPlayer(mgEventId: string, userId: string): Promise<{ error: unknown }> {
    const { error } = await this.supabase
      .from('mg_registrations')
      .delete()
      .eq('mg_event_id', mgEventId)
      .eq('user_id', userId);
    return { error };
  }

  async loadSelection(mgEventId: string): Promise<MgSelectionWithUser[]> {
    const { data, error } = await this.supabase
      .from('mg_selections')
      .select('*, user_profiles(display_name, username)')
      .eq('mg_event_id', mgEventId)
      .order('rank', { ascending: true });

    if (error) {
      console.error('Error loading selection:', error);
      return [];
    }
    return (data ?? []) as MgSelectionWithUser[];
  }

  /**
   * Replaces an event's selection. New rows are inserted BEFORE the old ones are
   * removed, so a failure part-way leaves the previous selection intact instead
   * of an empty one (this also runs on already-published events, where losing
   * the rows would silently drop DKP costs already charged to players).
   */
  async saveSelection(mgEventId: string, payloads: MgSelectionPayload[]): Promise<{ error: unknown }> {
    const { data: existing, error: loadError } = await this.supabase
      .from('mg_selections')
      .select('id')
      .eq('mg_event_id', mgEventId);
    if (loadError) return { error: loadError };

    const previousIds = (existing ?? []).map((row: { id: string }) => row.id);

    let insertedIds: string[] = [];
    if (payloads.length > 0) {
      const { data: inserted, error: insertError } = await this.supabase
        .from('mg_selections')
        .insert(payloads)
        .select('id');
      if (insertError) return { error: insertError };
      insertedIds = (inserted ?? []).map((row: { id: string }) => row.id);
    }

    if (previousIds.length === 0) return { error: null };

    const { error: deleteError } = await this.supabase.from('mg_selections').delete().in('id', previousIds);
    if (deleteError) {
      // Best-effort rollback so the event never ends up with both selections.
      if (insertedIds.length > 0) await this.supabase.from('mg_selections').delete().in('id', insertedIds);
      return { error: deleteError };
    }
    return { error: null };
  }

  async publishSelection(mgEventId: string): Promise<{ error: unknown }> {
    const { error } = await this.supabase
      .from('mg_events')
      .update({ status: 'selection_published', selection_published_at: new Date().toISOString() })
      .eq('id', mgEventId);
    return { error };
  }

  generateAutoSelectionPayload(
    mgEventId: string,
    registrations: MgRegistration[],
    scores: MgLeaderboardEntry[],
    capacity: number,
    slotRows: MgSlotRow[]
  ): MgSelectionPayload[] {
    const scoreByUserId = new Map(scores.map(s => [s.user_id, s.total_points]));
    const rankedUserIds = [...registrations]
      .sort((a, b) => (scoreByUserId.get(b.user_id) ?? 0) - (scoreByUserId.get(a.user_id) ?? 0))
      .map(reg => reg.user_id);

    return buildSelectionPayload(mgEventId, rankedUserIds, capacity, slotRows, 'automatic');
  }

  /**
   * Loads DKP spends (mg_selections.cost) per user for the given server, as raw
   * per-spend rows for FIFO attribution against earning weeks (the sum + expiry
   * is resolved downstream by computeFifoDeductions, not here).
   *
   * `sinceDate` bounds the scan to events whose week could still touch the
   * current rolling window. Each spend is stamped with the Monday 00:00 UTC of
   * its MG event's week (`eventWeekStartMs`) — the week its cost is charged
   * against.
   *
   * A spend only counts once the calendar week containing its event's
   * start_date has fully ended — mirrors how activities "expire" out of the
   * rolling total, so a deduction never appears mid-event.
   *
   * Requires `selection_published_at` to be set: mg_selections RLS already
   * hides unpublished rows from regular members, but admins bypass that via
   * their "manage" policy, so this filter is applied explicitly rather than
   * relying on RLS alone.
   */
  async loadSpends(serverId: string, sinceDate: Date): Promise<FifoSpend[]> {
    const { data, error } = await this.supabase
      .from('mg_selections')
      .select('user_id, cost, mg_events!inner(start_date, server_id, selection_published_at)')
      .eq('mg_events.server_id', serverId)
      .not('user_id', 'is', null)
      .not('mg_events.selection_published_at', 'is', null)
      .gte('mg_events.start_date', sinceDate.toISOString().slice(0, 10));

    if (error) {
      console.error('Error loading MG spends:', error);
      return [];
    }

    const rows = (data ?? []) as unknown as {
      user_id: string;
      cost: number;
      mg_events: { start_date: string };
    }[];

    const now = new Date();
    const spends: FifoSpend[] = [];
    for (const row of rows) {
      const eventWeekStart = getWeekStart(new Date(row.mg_events.start_date));
      const eventWeekEnd = getWeekEnd(eventWeekStart);
      if (eventWeekEnd >= now) continue;

      spends.push({
        userId: row.user_id,
        eventWeekStartMs: eventWeekStart.getTime(),
        cost: row.cost,
      });
    }

    return spends;
  }

  async loadUserRegistration(mgEventId: string, userId: string): Promise<MgRegistration | null> {
    const { data, error } = await this.supabase
      .from('mg_registrations')
      .select('*')
      .eq('mg_event_id', mgEventId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('Error loading user registration:', error);
      return null;
    }
    return data as MgRegistration | null;
  }
}
