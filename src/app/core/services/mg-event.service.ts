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
} from '@shared/models';

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

  async registerPlayer(mgEventId: string, userId: string): Promise<{ error: unknown }> {
    const { error } = await this.supabase.from('mg_registrations').insert({ mg_event_id: mgEventId, user_id: userId });
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

  async saveSelection(mgEventId: string, payloads: MgSelectionPayload[]): Promise<{ error: unknown }> {
    const { error: deleteError } = await this.supabase.from('mg_selections').delete().eq('mg_event_id', mgEventId);

    if (deleteError) return { error: deleteError };

    if (payloads.length === 0) return { error: null };

    const { error } = await this.supabase.from('mg_selections').insert(payloads);
    return { error };
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
    capacity: number
  ): MgSelectionPayload[] {
    const scoreByUserId = new Map(scores.map(s => [s.user_id, s.total_points]));
    const sorted = [...registrations].sort(
      (a, b) => (scoreByUserId.get(b.user_id) ?? 0) - (scoreByUserId.get(a.user_id) ?? 0)
    );

    const selected = sorted.slice(0, capacity);
    const ffaCount = Math.max(0, capacity - selected.length);

    const payloads: MgSelectionPayload[] = selected.map((reg, i) => ({
      mg_event_id: mgEventId,
      user_id: reg.user_id,
      rank: i + 1,
      selection_type: 'selected',
      selected_by: 'automatic',
    }));

    for (let i = 0; i < ffaCount; i++) {
      payloads.push({
        mg_event_id: mgEventId,
        user_id: null,
        rank: selected.length + i + 1,
        selection_type: 'ffa',
        selected_by: 'automatic',
      });
    }

    return payloads;
  }

  buildManualSelectionPayload(mgEventId: string, orderedUserIds: string[]): MgSelectionPayload[] {
    return orderedUserIds.map((userId, i) => ({
      mg_event_id: mgEventId,
      user_id: userId,
      rank: i + 1,
      selection_type: 'selected',
      selected_by: 'manual',
    }));
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
