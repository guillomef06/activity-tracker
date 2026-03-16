import { Injectable, signal, inject } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { DiscordWebhook, CreateDiscordWebhookRequest } from '../../shared/models';

/**
 * Discord Service
 * Manages Discord webhook configurations and message sending for an alliance.
 * Messages are sent directly to Discord's webhook API from the client.
 */
@Injectable({
  providedIn: 'root',
})
export class DiscordService {
  private readonly supabase = inject(SupabaseService);
  private readonly authService = inject(AuthService);

  private readonly webhooksSignal = signal<DiscordWebhook[]>([]);
  readonly webhooks = this.webhooksSignal.asReadonly();

  /**
   * Load all Discord webhooks for the current alliance
   */
  async loadWebhooks(): Promise<{ error: Error | null }> {
    const allianceId = this.authService.getAllianceId();
    if (!allianceId) {
      this.webhooksSignal.set([]);
      return { error: null };
    }

    const { data, error } = await this.supabase
      .from('discord_webhooks')
      .select('*')
      .eq('alliance_id', allianceId)
      .order('created_at', { ascending: true });

    if (error) {
      return { error: new Error(error.message) };
    }

    this.webhooksSignal.set(data || []);
    return { error: null };
  }

  /**
   * Create a new Discord webhook (admin only)
   */
  async createWebhook(request: CreateDiscordWebhookRequest): Promise<{ error: Error | null }> {
    const allianceId = this.authService.getAllianceId();
    if (!allianceId) {
      return { error: new Error('No alliance ID') };
    }

    if (!this.authService.isAdmin()) {
      return { error: new Error('Only admins can manage webhooks') };
    }

    const { error } = await this.supabase.from('discord_webhooks').insert({
      alliance_id: allianceId,
      channel_name: request.channel_name,
      webhook_url: request.webhook_url,
      default_message: request.default_message ?? null,
    });

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadWebhooks();
    return { error: null };
  }

  /**
   * Update a Discord webhook's channel name and default message (admin only)
   */
  async updateWebhook(
    webhookId: string,
    updates: { channel_name: string; default_message: string | null }
  ): Promise<{ error: Error | null }> {
    if (!this.authService.isAdmin()) {
      return { error: new Error('Only admins can manage webhooks') };
    }

    const { error } = await this.supabase
      .from('discord_webhooks')
      .update({ channel_name: updates.channel_name, default_message: updates.default_message })
      .eq('id', webhookId);

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadWebhooks();
    return { error: null };
  }

  /**
   * Delete a Discord webhook (admin only)
   */
  async deleteWebhook(webhookId: string): Promise<{ error: Error | null }> {
    if (!this.authService.isAdmin()) {
      return { error: new Error('Only admins can manage webhooks') };
    }

    const { error } = await this.supabase.from('discord_webhooks').delete().eq('id', webhookId);

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadWebhooks();
    return { error: null };
  }

  /**
   * Send a message to a Discord webhook URL.
   * Uses the Discord webhook API directly from the client.
   */
  async sendMessage(webhookUrl: string, content: string): Promise<{ error: Error | null }> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });

      if (!response.ok) {
        return { error: new Error(`Discord API error: ${response.status} ${response.statusText}`) };
      }

      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Network error') };
    }
  }
}
