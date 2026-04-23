/**
 * Discord Webhook Models
 */

export interface DiscordWebhook {
  id: string;
  server_id: string;
  channel_name: string;
  webhook_url: string;
  default_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateDiscordWebhookRequest {
  channel_name: string;
  webhook_url: string;
  default_message?: string | null;
}
