import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import {
  ActivityPointRule,
  CreatePointRuleRequest,
  UpdatePointRuleRequest,
  PointCalculationResult
} from '../../shared/models';
import { getActivityTypePoints } from '../../shared/constants/constants';

@Injectable({
  providedIn: 'root'
})
export class PointRulesService {
  private supabase = inject(SupabaseService);
  private authService = inject(AuthService);

  // Cache des règles
  private rulesSignal = signal<ActivityPointRule[]>([]);
  readonly rules = this.rulesSignal.asReadonly();

  /**
   * Charger toutes les règles de l'alliance courante
   */
  async loadRules(): Promise<{ error: Error | null }> {
    const profile = this.authService.userProfile();
    if (!profile?.alliance_id) {
      return { error: new Error('No alliance ID') };
    }

    const { data, error } = await this.supabase
      .from('activity_point_rules')
      .select('*')
      .eq('alliance_id', profile.alliance_id)
      .order('activity_type', { ascending: true })
      .order('position_min', { ascending: true });

    if (error) {
      return { error: new Error(error.message) };
    }

    this.rulesSignal.set(data || []);
    return { error: null };
  }

  /**
   * Créer une nouvelle règle (admin seulement)
   */
  async createRule(rule: CreatePointRuleRequest): Promise<{ error: Error | null }> {
    const profile = this.authService.userProfile();
    if (!profile?.alliance_id) {
      return { error: new Error('No alliance ID') };
    }

    // Validation chevauchement
    const validation = this.validateNoOverlap(rule, this.rulesSignal());
    if (!validation.valid) {
      const conflict = validation.conflictingRule;
      return {
        error: new Error(
          `Chevauchement avec règle existante: ${conflict?.activity_type} positions ${conflict?.position_min}-${conflict?.position_max}`
        )
      };
    }

    const { error } = await this.supabase
      .from('activity_point_rules')
      .insert({
        alliance_id: profile.alliance_id,
        ...rule
      });

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadRules(); // Recharger les règles
    return { error: null };
  }

  /**
   * Mettre à jour une règle existante
   */
  async updateRule(id: string, updates: UpdatePointRuleRequest): Promise<{ error: Error | null }> {
    const { error } = await this.supabase
      .from('activity_point_rules')
      .update(updates)
      .eq('id', id);

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadRules();
    return { error: null };
  }

  /**
   * Supprimer une règle
   */
  async deleteRule(id: string): Promise<{ error: Error | null }> {
    const { error } = await this.supabase
      .from('activity_point_rules')
      .delete()
      .eq('id', id);

    if (error) {
      return { error: new Error(error.message) };
    }

    await this.loadRules();
    return { error: null };
  }

  /**
   * Calculer les points pour une activité selon la position
   */
  calculatePoints(activityType: string, position: number): PointCalculationResult {
    // Chercher une règle qui match
    const matchedRule = this.rulesSignal().find(
      rule =>
        rule.activity_type === activityType &&
        position >= rule.position_min &&
        position <= rule.position_max
    );

    if (matchedRule) {
      return {
        points: matchedRule.points,
        matchedRule,
        usedFallback: false
      };
    }

    // Fallback: utiliser les points fixes de constants.ts
    const fallbackPoints = getActivityTypePoints(activityType);
    return {
      points: fallbackPoints,
      usedFallback: true
    };
  }

  /**
   * Valider qu'il n'y a pas de chevauchement de règles
   */
  validateNoOverlap(
    newRule: CreatePointRuleRequest,
    existingRules: ActivityPointRule[]
  ): { valid: boolean; conflictingRule?: ActivityPointRule } {
    const conflictingRule = existingRules.find(
      rule =>
        rule.activity_type === newRule.activity_type &&
        !(
          newRule.position_max < rule.position_min ||
          newRule.position_min > rule.position_max
        )
    );

    return {
      valid: !conflictingRule,
      conflictingRule
    };
  }

  /**
   * Obtenir toutes les règles pour un type d'activité spécifique
   */
  getRulesForActivityType(activityType: string): ActivityPointRule[] {
    return this.rulesSignal().filter(rule => rule.activity_type === activityType);
  }

  /**
   * Initialiser le service (à appeler après login)
   */
  async initialize(): Promise<void> {
    const profile = this.authService.userProfile();
    if (profile?.alliance_id) {
      await this.loadRules();
    }
  }

  /**
   * Réinitialiser le service (à appeler après logout)
   */
  reset(): void {
    this.rulesSignal.set([]);
  }
}
