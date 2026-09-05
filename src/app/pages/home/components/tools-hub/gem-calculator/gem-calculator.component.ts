import { Component, ChangeDetectionStrategy, input, output, signal, computed, Signal } from '@angular/core';
import { TitleCasePipe, DecimalPipe } from '@angular/common';
import { form, required, min, max, FormField } from '@angular/forms/signals';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule } from '@ngx-translate/core';

// ---------------------------------------------------------------------------
// Troop stats
// ---------------------------------------------------------------------------
interface TroopStats {
  attack: number;
  defense: number;
  health: number;
}

const TROOP_STATS: Record<string, Record<number, TroopStats>> = {
  swordsmen: {
    6: { attack: 121, defense: 149, health: 112 },
    7: { attack: 146, defense: 194, health: 146 },
    8: { attack: 196, defense: 262, health: 196 },
    9: { attack: 275, defense: 367, health: 275 },
  },
  archers: {
    6: { attack: 168, defense: 93, health: 112 },
    7: { attack: 219, defense: 121, health: 146 },
    8: { attack: 295, defense: 164, health: 196 },
    9: { attack: 413, defense: 229, health: 275 },
  },
  pikemen: {
    6: { attack: 131, defense: 131, health: 112 },
    7: { attack: 170, defense: 170, health: 146 },
    8: { attack: 229, defense: 229, health: 196 },
    9: { attack: 321, defense: 321, health: 275 },
  },
  cavalry: {
    6: { attack: 149, defense: 112, health: 112 },
    7: { attack: 194, defense: 135, health: 146 },
    8: { attack: 262, defense: 196, health: 196 },
    9: { attack: 367, defense: 275, health: 275 },
  },
};

const DEFAULT_TROOP_TYPE: TroopType = 'swordsmen';
const DEFAULT_TROOP_TIER = 7;
const MIN_LEGION_SIZE = 1;
const MAX_LEGION_SIZE = 500_000;
const MIN_BONUS = 0;

// ---------------------------------------------------------------------------
// Gem bonus tables
// ---------------------------------------------------------------------------
const GEM_HEALTH_BONUS: Record<number, number> = {
  1: 0.2,
  2: 0.3,
  3: 0.45,
  4: 0.68,
  5: 1.0,
  6: 1.53,
  7: 2.3,
  8: 3.5,
  9: 5.25,
  10: 8.0,
};

const GEM_CAPACITY_BONUS: Record<number, number> = {
  1: 100,
  2: 150,
  3: 230,
  4: 340,
  5: 500,
  6: 760,
  7: 1150,
  8: 1750,
  9: 2630,
  10: 4000,
};

export const GEM_RARITIES = [
  { tier: 1, label: 'Common', color: '#9e9e9e' },
  { tier: 2, label: 'Advanced', color: '#4caf50' },
  { tier: 3, label: 'Rare', color: '#2196f3' },
  { tier: 4, label: 'Epic', color: '#9c27b0' },
  { tier: 5, label: 'Legendary', color: '#ffc107' },
  { tier: 6, label: 'Mythic', color: '#f44336' },
  { tier: 7, label: 'Mythic +1', color: '#f44336' },
  { tier: 8, label: 'Mythic +2', color: '#f44336' },
  { tier: 9, label: 'Mythic +3', color: '#f44336' },
  { tier: 10, label: 'Mythic +4', color: '#f44336' },
];

export const TROOP_TYPES = ['swordsmen', 'archers', 'pikemen', 'cavalry'] as const;
export const TROOP_TIERS = [6, 7, 8, 9] as const;

export type TroopType = (typeof TROOP_TYPES)[number];
export type GemType = 'health' | 'capacity';

export interface GemResult {
  gemType: GemType;
  gemTier: number;
  rawValue: number;
  delta: number;
  scoreBefore: number;
  scoreAfter: number;
  // Verbose — all types
  legionSize: number;
  perUnitScoreBefore: number;
  // Verbose — health gem only
  healthBonus?: number;
  newHealthBonusPct?: number;
  perUnitScoreAfter?: number;
}

interface GemCalculatorFormValue {
  troopType: TroopType;
  troopTier: number;
  legionSize: number | null;
  healthBonus: number;
  mightAttack: number;
  mightDefense: number;
  gemType: GemType | '';
  gemTier: number | null;
  verbose: boolean;
}

const INITIAL_FORM_VALUE: GemCalculatorFormValue = {
  troopType: DEFAULT_TROOP_TYPE,
  troopTier: DEFAULT_TROOP_TIER,
  legionSize: null,
  healthBonus: MIN_BONUS,
  mightAttack: MIN_BONUS,
  mightDefense: MIN_BONUS,
  gemType: '',
  gemTier: null,
  verbose: false,
};

@Component({
  selector: 'app-gem-calculator',
  imports: [
    TitleCasePipe,
    DecimalPipe,
    FormField,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatDividerModule,
    TranslateModule,
  ],
  templateUrl: './gem-calculator.component.html',
  styleUrl: './gem-calculator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GemCalculatorComponent {
  readonly showBack = input<boolean>(false);
  readonly showTitle = input<boolean>(false);
  readonly back = output<void>();

  protected readonly gemRarities = GEM_RARITIES;
  protected readonly troopTypes = TROOP_TYPES;
  protected readonly troopTiers = TROOP_TIERS;

  protected readonly result = signal<GemResult | null>(null);

  protected readonly formModel = signal<GemCalculatorFormValue>({ ...INITIAL_FORM_VALUE });

  protected readonly gemForm = form(this.formModel, schemaPath => {
    required(schemaPath.troopType);
    required(schemaPath.troopTier);

    required(schemaPath.legionSize);
    min(schemaPath.legionSize, MIN_LEGION_SIZE);
    max(schemaPath.legionSize, MAX_LEGION_SIZE);

    required(schemaPath.healthBonus);
    min(schemaPath.healthBonus, MIN_BONUS);

    required(schemaPath.mightAttack);
    min(schemaPath.mightAttack, MIN_BONUS);

    required(schemaPath.mightDefense);
    min(schemaPath.mightDefense, MIN_BONUS);

    required(schemaPath.gemType);
    required(schemaPath.gemTier);
  });

  protected readonly isVerbose: Signal<boolean> = computed(() => this.formModel().verbose);

  protected onAnalyzeSubmit(event: Event): void {
    event.preventDefault();
    this.analyze();
  }

  protected analyze(): void {
    if (this.gemForm().invalid()) {
      this.gemForm().markAsTouched();
      return;
    }

    const v = this.formModel();
    const gemType = v.gemType as GemType;
    const gemTier = v.gemTier as number;
    const legionSize = v.legionSize as number;
    const troopStats = TROOP_STATS[v.troopType][v.troopTier] ?? TROOP_STATS[DEFAULT_TROOP_TYPE][DEFAULT_TROOP_TIER];

    const perUnitScoreBefore = this.computePerUnitScore(troopStats, v.mightAttack, v.mightDefense, v.healthBonus);
    const scoreBefore = legionSize * perUnitScoreBefore;

    this.result.set(
      gemType === 'health'
        ? this.computeHealthGemResult(troopStats, v, gemTier, legionSize, perUnitScoreBefore, scoreBefore)
        : this.computeCapacityGemResult(gemTier, legionSize, perUnitScoreBefore, scoreBefore)
    );
  }

  private computePerUnitScore(
    troopStats: TroopStats,
    mightAttack: number,
    mightDefense: number,
    healthBonusPct: number
  ): number {
    const PERCENT_DIVISOR = 100;
    return (
      troopStats.attack * (1 + mightAttack / PERCENT_DIVISOR) +
      troopStats.defense * (1 + mightDefense / PERCENT_DIVISOR) +
      troopStats.health * (1 + healthBonusPct / PERCENT_DIVISOR)
    );
  }

  private computeHealthGemResult(
    troopStats: TroopStats,
    v: GemCalculatorFormValue,
    gemTier: number,
    legionSize: number,
    perUnitScoreBefore: number,
    scoreBefore: number
  ): GemResult {
    const rawValue = GEM_HEALTH_BONUS[gemTier] ?? 0;
    const newHealthBonusPct = v.healthBonus + rawValue;
    const perUnitScoreAfter = this.computePerUnitScore(troopStats, v.mightAttack, v.mightDefense, newHealthBonusPct);
    const scoreAfter = legionSize * perUnitScoreAfter;

    return {
      gemType: 'health',
      gemTier,
      rawValue,
      delta: scoreAfter - scoreBefore,
      scoreBefore,
      scoreAfter,
      legionSize,
      perUnitScoreBefore,
      healthBonus: v.healthBonus,
      newHealthBonusPct,
      perUnitScoreAfter,
    };
  }

  private computeCapacityGemResult(
    gemTier: number,
    legionSize: number,
    perUnitScoreBefore: number,
    scoreBefore: number
  ): GemResult {
    const rawValue = GEM_CAPACITY_BONUS[gemTier] ?? 0;
    const scoreAfter = (legionSize + rawValue) * perUnitScoreBefore;

    return {
      gemType: 'capacity',
      gemTier,
      rawValue,
      delta: rawValue * perUnitScoreBefore,
      scoreBefore,
      scoreAfter,
      legionSize,
      perUnitScoreBefore,
    };
  }

  protected getRarityLabel(tier: number): string {
    return GEM_RARITIES.find(r => r.tier === tier)?.label ?? `T${tier}`;
  }

  protected getRarityColor(tier: number): string {
    return GEM_RARITIES.find(r => r.tier === tier)?.color ?? '#9e9e9e';
  }
}
