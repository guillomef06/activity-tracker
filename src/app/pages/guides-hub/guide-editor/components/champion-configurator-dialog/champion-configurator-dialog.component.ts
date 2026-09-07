import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { form, required, FormField } from '@angular/forms/signals';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule } from '@ngx-translate/core';
import type {
  Champion,
  Skill,
  Gem,
  HorseTemperament,
  Adornment,
  Ring,
  ChampionSlotConfig,
  ChampionPosition,
} from '@shared/models';

const MIN_TRAIT_COUNT = 1;
const MAX_TRAIT_COUNT = 3;

interface ChampionConfiguratorFormValue {
  champion_id: string;
  skill1_id: string | null;
  skill2_id: string | null;
  gem_strategy_id: string | null;
  gem_hero_id: string | null;
  gem_tactics_id: string | null;
  trait1_id: string | null;
  trait2_id: string | null;
  trait3_id: string | null;
  ornament_id: string | null;
  ring_id: string | null;
}

const INITIAL_FORM_VALUE: ChampionConfiguratorFormValue = {
  champion_id: '',
  skill1_id: null,
  skill2_id: null,
  gem_strategy_id: null,
  gem_hero_id: null,
  gem_tactics_id: null,
  trait1_id: null,
  trait2_id: null,
  trait3_id: null,
  ornament_id: null,
  ring_id: null,
};

type TraitSlot = 1 | 2 | 3;

export interface ChampionConfiguratorDialogData {
  position: ChampionPosition;
  existing: ChampionSlotConfig | null;
  champions: Champion[];
  skills: Skill[];
  gems: Gem[];
  temperaments: HorseTemperament[];
  adornments: Adornment[];
  rings: Ring[];
  /** Ring IDs already assigned to other champion slots — excluded from selection */
  usedRingIds: string[];
  /** Skills assigned to each champion: championId → Skill[] */
  championSkillsMap: Map<string, Skill[]>;
}

@Component({
  selector: 'app-champion-configurator-dialog',
  imports: [
    FormField,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
    MatDividerModule,
    TranslateModule,
  ],
  templateUrl: './champion-configurator-dialog.component.html',
  styleUrl: './champion-configurator-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChampionConfiguratorDialogComponent {
  private readonly dialogRef = inject(MatDialogRef<ChampionConfiguratorDialogComponent>);
  readonly data: ChampionConfiguratorDialogData = inject(MAT_DIALOG_DATA);

  protected readonly formModel = signal<ChampionConfiguratorFormValue>(this.buildInitialFormValue());

  protected readonly championForm = form(this.formModel, schemaPath => {
    required(schemaPath.champion_id);
  });

  protected readonly maxTraitCount = MAX_TRAIT_COUNT;

  protected readonly traitCount = signal<number>(this.countFilledTraits());

  protected readonly selectedChampionId = computed(() => this.formModel().champion_id);

  /** All skills available for the selected champion */
  private readonly allAvailableSkills = computed(() => {
    const id = this.selectedChampionId();
    if (!id) return [];
    return this.data.championSkillsMap.get(id) ?? [];
  });

  // ─── Filtered skills (each slot excludes the other slot's selection) ────────

  protected readonly availableSkillsSlot1 = computed(() => {
    const used = this.formModel().skill2_id;
    return this.allAvailableSkills().filter(s => s.id !== used);
  });

  protected readonly availableSkillsSlot2 = computed(() => {
    const used = this.formModel().skill1_id;
    return this.allAvailableSkills().filter(s => s.id !== used);
  });

  // ─── Gems filtered by type (one slot per type) ──────────────────────────────

  protected readonly strategyGems = computed(() => this.data.gems.filter(g => g.type === 'strategy'));
  protected readonly heroGems = computed(() => this.data.gems.filter(g => g.type === 'hero'));
  protected readonly tacticsGems = computed(() => this.data.gems.filter(g => g.type === 'tactics'));

  // ─── Filtered traits (each slot excludes the other slots' selections) ───────

  protected readonly availableTraitsPerSlot = computed(() => {
    const v = this.formModel();
    const selected = [v.trait1_id, v.trait2_id, v.trait3_id];
    return [0, 1, 2].map(i => {
      const usedByOthers = new Set(selected.filter((id, j) => j !== i && id !== null));
      return this.data.temperaments.filter(t => !usedByOthers.has(t.id));
    });
  });

  // ─── Filtered rings (excludes rings used by other champion slots) ────────────

  protected readonly availableRings = computed(() => {
    const usedByOthers = new Set(this.data.usedRingIds);
    return this.data.rings.filter(r => !usedByOthers.has(r.id));
  });

  private buildInitialFormValue(): ChampionConfiguratorFormValue {
    const existing = this.data.existing;
    if (!existing) {
      return { ...INITIAL_FORM_VALUE };
    }

    const gemByType = (type: string): string | null => existing.gems.find(g => g?.type === type)?.id ?? null;

    return {
      champion_id: existing.champion.id,
      skill1_id: existing.skills[0]?.id ?? null,
      skill2_id: existing.skills[1]?.id ?? null,
      gem_strategy_id: gemByType('strategy'),
      gem_hero_id: gemByType('hero'),
      gem_tactics_id: gemByType('tactics'),
      trait1_id: existing.traits[0]?.id ?? null,
      trait2_id: existing.traits[1]?.id ?? null,
      trait3_id: existing.traits[2]?.id ?? null,
      ornament_id: existing.adornment?.id ?? null,
      ring_id: existing.ring?.id ?? null,
    };
  }

  private countFilledTraits(): number {
    const filledTraits = this.data.existing?.traits.filter(t => t !== null).length ?? 0;
    return Math.max(MIN_TRAIT_COUNT, filledTraits);
  }

  // ─── Champion selection ──────────────────────────────────────────────────────

  protected onChampionChange(championId: string): void {
    this.formModel.update(current => ({ ...current, champion_id: championId, skill1_id: null, skill2_id: null }));
  }

  // ─── Trait slot management ──────────────────────────────────────────────────

  protected addTrait(): void {
    if (this.traitCount() < MAX_TRAIT_COUNT) {
      this.traitCount.update(n => n + 1);
    }
  }

  protected removeTrait(slot: TraitSlot): void {
    const key = `trait${slot}_id` as 'trait1_id' | 'trait2_id' | 'trait3_id';
    this.formModel.update(current => ({ ...current, [key]: null }));
    this.traitCount.update(n => Math.max(MIN_TRAIT_COUNT, n - 1));
  }

  // ─── Confirm ────────────────────────────────────────────────────────────────

  protected confirm(): void {
    if (this.championForm().invalid()) return;

    const v = this.formModel();

    const champion = this.data.champions.find(c => c.id === v.champion_id);
    if (!champion) return;

    const findSkill = (id: string | null) => (id ? (this.allAvailableSkills().find(s => s.id === id) ?? null) : null);
    const findGem = (id: string | null) => (id ? (this.data.gems.find(g => g.id === id) ?? null) : null);
    const findTrait = (id: string | null) => (id ? (this.data.temperaments.find(t => t.id === id) ?? null) : null);
    const findAdornment = (id: string | null) => (id ? (this.data.adornments.find(o => o.id === id) ?? null) : null);
    const findRing = (id: string | null) => (id ? (this.data.rings.find(r => r.id === id) ?? null) : null);

    const result: ChampionSlotConfig = {
      position: this.data.position,
      champion,
      skills: [findSkill(v.skill1_id), findSkill(v.skill2_id)],
      // slot1=strategy, slot2=hero, slot3=tactics
      gems: [findGem(v.gem_strategy_id), findGem(v.gem_hero_id), findGem(v.gem_tactics_id)],
      traits: [findTrait(v.trait1_id), findTrait(v.trait2_id), findTrait(v.trait3_id)],
      adornment: findAdornment(v.ornament_id),
      ring: findRing(v.ring_id),
    };

    this.dialogRef.close(result);
  }

  protected cancel(): void {
    this.dialogRef.close(null);
  }
}
