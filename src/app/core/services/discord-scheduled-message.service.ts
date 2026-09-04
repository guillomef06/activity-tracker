import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { DiscordScheduledMessage, CreateDiscordScheduledMessageRequest } from '@shared/models';

const ADMIN_ONLY_ERROR_MESSAGE = 'Only admins can manage scheduled messages';

/**
 * Discord Scheduled Message Service
 * Manages recurring Discord message schedules for an server.
 * Dispatch itself is handled server-side by a Supabase pg_cron job — this
 * service only owns CRUD for the schedule configuration.
 */
@Injectable({
  providedIn: 'root',
})
export class DiscordScheduledMessageService {
  private readonly supabase = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  private readonly schedulesSignal = signal<DiscordScheduledMessage[]>([]);
  readonly schedules = this.schedulesSignal.asReadonly();

  /**
   * Load all Discord scheduled messages for the current server
   */
  async loadSchedules(): Promise<{ error: Error | null }> {
    const serverId = this.authService.getServerId();
    if (!serverId) {
      this.schedulesSignal.set([]);
      return { error: null };
    }

    const { data, error } = await this.supabase
      .from('discord_scheduled_messages')
      .select('*')
      .eq('server_id', serverId)
      .order('created_at', { ascending: true });

    if (error) {
      return { error: new Error(error.message) };
    }

    this.schedulesSignal.set(data || []);
    return { error: null };
  }

  /**
   * Create a new Discord scheduled message (admin only)
   */
  async createSchedule(request: CreateDiscordScheduledMessageRequest): Promise<{ error: Error | null }> {
    const serverId = this.authService.getServerId();
    if (!serverId) {
      return { error: new Error('No server ID') };
    }

    const userId = this.authService.getUserId();
    if (!userId) {
      return { error: new Error('No user ID') };
    }

    if (!this.authService.isAdmin()) {
      return { error: new Error(ADMIN_ONLY_ERROR_MESSAGE) };
    }

    const { error } = await this.supabase.from('discord_scheduled_messages').insert({
      server_id: serverId,
      webhook_id: request.webhook_id,
      message: request.message,
      frequency: request.frequency,
      days_of_week: request.days_of_week ?? null,
      day_of_month: request.day_of_month ?? null,
      hour_utc: request.hour_utc,
      created_by: userId,
    });

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadSchedules();
    return { error: null };
  }

  /**
   * Update an existing Discord scheduled message (admin only)
   */
  async updateSchedule(
    id: string,
    updates: Partial<CreateDiscordScheduledMessageRequest>
  ): Promise<{ error: Error | null }> {
    if (!this.authService.isAdmin()) {
      return { error: new Error(ADMIN_ONLY_ERROR_MESSAGE) };
    }

    const { error } = await this.supabase.from('discord_scheduled_messages').update(updates).eq('id', id);

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadSchedules();
    return { error: null };
  }

  /**
   * Pause or resume a Discord scheduled message without deleting it (admin only)
   */
  async toggleActive(id: string, isActive: boolean): Promise<{ error: Error | null }> {
    if (!this.authService.isAdmin()) {
      return { error: new Error(ADMIN_ONLY_ERROR_MESSAGE) };
    }

    const { error } = await this.supabase
      .from('discord_scheduled_messages')
      .update({ is_active: isActive })
      .eq('id', id);

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadSchedules();
    return { error: null };
  }

  /**
   * Delete a Discord scheduled message (admin only)
   */
  async deleteSchedule(id: string): Promise<{ error: Error | null }> {
    if (!this.authService.isAdmin()) {
      return { error: new Error(ADMIN_ONLY_ERROR_MESSAGE) };
    }

    const { error } = await this.supabase.from('discord_scheduled_messages').delete().eq('id', id);

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadSchedules();
    return { error: null };
  }
}
