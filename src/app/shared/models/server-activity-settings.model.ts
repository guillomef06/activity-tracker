export interface ServerActivitySettings {
  id: string;
  server_id: string;
  activity_type: string;
  enabled: boolean;
  participation_mode: boolean;
  participation_points: number;
}

export interface UpsertActivitySettingsRequest {
  activity_type: string;
  enabled: boolean;
  participation_mode: boolean;
  participation_points: number;
}
