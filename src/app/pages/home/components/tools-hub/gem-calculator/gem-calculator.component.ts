import { Component, ChangeDetectionStrategy, input, output, signal, inject } from '@angular/core';
import { TitleCasePipe, DecimalPipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
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

@Component({
  selector: 'app-gem-calculator',
  imports: [
    TitleCasePipe,
    DecimalPipe,
    ReactiveFormsModule,
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

  private readonly fb = inject(FormBuilder);

  protected readonly gemRarities = GEM_RARITIES;
  protected readonly troopTypes = TROOP_TYPES;
  protected readonly troopTiers = TROOP_TIERS;

  protected readonly result = signal<GemResult | null>(null);

  protected readonly form = this.fb.group({
    troopType: ['swordsmen' as TroopType, Validators.required],
    troopTier: [7, Validators.required],
    legionSize: [null as number | null, [Validators.required, Validators.min(1), Validators.max(500_000)]],
    healthBonus: [0, [Validators.required, Validators.min(0)]],
    mightAttack: [0, [Validators.required, Validators.min(0)]],
    mightDefense: [0, [Validators.required, Validators.min(0)]],
    gemType: ['' as GemType | '', Validators.required],
    gemTier: [null as number | null, Validators.required],
    verbose: [false],
  });

  protected analyze(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    const gemType = v.gemType as GemType;
    const gemTier = v.gemTier!;
    const legionSize = v.legionSize!;
    const healthBonus = v.healthBonus ?? 0;
    const mightAttack = v.mightAttack ?? 0;
    const mightDefense = v.mightDefense ?? 0;
    const troopStats = TROOP_STATS[v.troopType!]?.[v.troopTier!] ?? TROOP_STATS['swordsmen'][7];

    const perUnitScoreBefore =
      troopStats.attack * (1 + mightAttack / 100) +
      troopStats.defense * (1 + mightDefense / 100) +
      troopStats.health * (1 + healthBonus / 100);
    const scoreBefore = legionSize * perUnitScoreBefore;

    if (gemType === 'health') {
      const rawValue = GEM_HEALTH_BONUS[gemTier] ?? 0;
      const newHealthBonusPct = healthBonus + rawValue;
      const perUnitScoreAfter =
        troopStats.attack * (1 + mightAttack / 100) +
        troopStats.defense * (1 + mightDefense / 100) +
        troopStats.health * (1 + newHealthBonusPct / 100);
      const scoreAfter = legionSize * perUnitScoreAfter;

      this.result.set({
        gemType,
        gemTier,
        rawValue,
        delta: scoreAfter - scoreBefore,
        scoreBefore,
        scoreAfter,
        legionSize,
        perUnitScoreBefore,
        healthBonus,
        newHealthBonusPct,
        perUnitScoreAfter,
      });
    } else {
      const rawValue = GEM_CAPACITY_BONUS[gemTier] ?? 0;
      const scoreAfter = (legionSize + rawValue) * perUnitScoreBefore;

      this.result.set({
        gemType,
        gemTier,
        rawValue,
        delta: rawValue * perUnitScoreBefore,
        scoreBefore,
        scoreAfter,
        legionSize,
        perUnitScoreBefore,
      });
    }
  }

  protected getRarityLabel(tier: number): string {
    return GEM_RARITIES.find(r => r.tier === tier)?.label ?? `T${tier}`;
  }

  protected getRarityColor(tier: number): string {
    return GEM_RARITIES.find(r => r.tier === tier)?.color ?? '#9e9e9e';
  }

  protected isVerbose(): boolean {
    return this.form.get('verbose')?.value === true;
  }
}
