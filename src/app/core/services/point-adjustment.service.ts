import { Injectable, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { PointAdjustmentWithUser, PointAdjustmentResponse, CreatePointAdjustmentPayload } from '@shared/models';

/**
 * CRUD for admin-created manual point adjustments (see point-adjustment.model).
 * Mirrors MgEventService: reads return [] on error (logged), writes return
 * { error } for the caller to surface via snackbar.
 */
@Injectable({
  providedIn: 'root',
})
export class PointAdjustmentService {
  private readonly supabase = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  /** All adjustments for a server, newest first, with the target player's display name. */
  async loadAdjustments(serverId: string): Promise<PointAdjustmentWithUser[]> {
    const { data, error } = await this.supabase
      .from('point_adjustments')
      .select('*, user_profiles(display_name)')
      .eq('server_id', serverId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error loading point adjustments:', error);
      return [];
    }

    return (data ?? []).map((row: PointAdjustmentResponse) => ({
      id: row.id,
      userId: row.user_id,
      delta: row.delta,
      reason: row.reason,
      date: new Date(row.created_at),
      createdBy: row.created_by,
      displayName: row.user_profiles?.display_name ?? 'Unknown',
    }));
  }

  async createAdjustment(serverId: string, payload: CreatePointAdjustmentPayload): Promise<{ error: unknown }> {
    const { error } = await this.supabase.from('point_adjustments').insert({
      server_id: serverId,
      user_id: payload.userId,
      delta: payload.delta,
      reason: payload.reason,
      created_by: this.authService.getUserId(),
    });
    return { error };
  }

  async deleteAdjustment(id: string): Promise<{ error: unknown }> {
    const { error } = await this.supabase.from('point_adjustments').delete().eq('id', id);
    return { error };
  }
}
