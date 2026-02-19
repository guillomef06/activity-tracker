export interface AllianceActivitySettings {
  id: string;
  alliance_id: string;
  activity_type: string;
  participation_mode: boolean;
  participation_points: number;
}

export interface UpsertActivitySettingsRequest {
  activity_type: string;
  participation_mode: boolean;
  participation_points: number;
}
