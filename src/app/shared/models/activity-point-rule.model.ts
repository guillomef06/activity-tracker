/**
 * Activity Point Rule Models
 * Règles de calcul des points basées sur la position
 */

export interface ActivityPointRule {
  id: string;
  alliance_id: string;
  activity_type: string;
  position_min: number;
  position_max: number;
  points: number;
  created_at: string;
  updated_at: string;
}

export interface CreatePointRuleRequest {
  activity_type: string;
  position_min: number;
  position_max: number;
  points: number;
}

export interface UpdatePointRuleRequest {
  position_min?: number;
  position_max?: number;
  points?: number;
}

export interface PointCalculationResult {
  points: number;
  matchedRule?: ActivityPointRule;
  usedFallback: boolean; // true si on utilise les points par défaut
}
