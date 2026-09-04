/**
 * Discord Scheduled Message Models
 */

export type DiscordScheduleFrequency = 'daily' | 'weekly' | 'monthly';

export interface DiscordScheduledMessage {
  id: string;
  server_id: string;
  webhook_id: string;
  message: string;
  frequency: DiscordScheduleFrequency;
  days_of_week: number[] | null;
  day_of_month: number | null;
  hour_utc: number;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CreateDiscordScheduledMessageRequest {
  webhook_id: string;
  message: string;
  frequency: DiscordScheduleFrequency;
  days_of_week?: number[] | null;
  day_of_month?: number | null;
  hour_utc: number;
}
