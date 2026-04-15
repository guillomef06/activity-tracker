import { Component, inject, signal, computed, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

import { GuideAdminService } from '@app/core/services/guide-admin.service';
import { SnackbarService } from '@app/core/services';
import { ProgressBarService } from '@app/core/services/progress-bar.service';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import type { Champion, Skill, HorseTemperament, Adornment, Gem, GemType, Ring } from '@app/shared/models/guide.model';

const GEM_TYPES: GemType[] = ['strategy', 'hero', 'tactics'];

@Component({
  selector: 'app-guides-data',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatTabsModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatChipsModule,
    MatProgressSpinnerModule,
    MatAutocompleteModule,
    MatTooltipModule,
    MatDialogModule,
    TranslateModule,
  ],
  templateUrl: './guides-data.page.html',
  styleUrl: './guides-data.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuidesDataPage implements OnInit {
  private readonly guideAdminService = inject(GuideAdminService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly progressBarService = inject(ProgressBarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);

  protected readonly progressBar = this.progressBarService;

  // ─── State ────────────────────────────────────────────────────────────────

  protected readonly champions = signal<Champion[]>([]);
  protected readonly skills = signal<Skill[]>([]);
  protected readonly temperaments = signal<HorseTemperament[]>([]);
  protected readonly adornments = signal<Adornment[]>([]);
  protected readonly gems = signal<Gem[]>([]);
  protected readonly rings = signal<Ring[]>([]);

  // Champion skill assignment panel
  protected readonly expandedChampionId = signal<string | null>(null);
  protected readonly championSkills = signal<Skill[]>([]);
  protected readonly isLoadingChampionSkills = signal(false);

  // Inline editing
  protected readonly editingChampionId = signal<string | null>(null);
  protected readonly editingSkillId = signal<string | null>(null);
  protected readonly editingTemperamentId = signal<string | null>(null);
  protected readonly editingAdornmentId = signal<string | null>(null);
  protected readonly editingGemId = signal<string | null>(null);
  protected readonly editingRingId = signal<string | null>(null);

  // Add-row visibility
  protected readonly showAddChampion = signal(false);
  protected readonly showAddSkill = signal(false);
  protected readonly showAddTemperament = signal(false);
  protected readonly showAddAdornment = signal(false);
  protected readonly showAddGem = signal(false);
  protected readonly showAddRing = signal(false);

  // Gem filter
  protected readonly gemTypeFilter = signal<GemType | ''>('');

  // Filtered gems
  protected readonly filteredGems = computed(() => {
    const filter = this.gemTypeFilter();
    const all = this.gems();
    return filter ? all.filter(g => g.type === filter) : all;
  });

  // Autocomplete skills for champion assignment
  protected readonly skillSearchControl = this.fb.control('');
  protected readonly filteredSkillsForAssign = computed(() => {
    const search = (
      typeof this.skillSearchControl.value === 'string' ? this.skillSearchControl.value : ''
    ).toLowerCase();
    const assignedIds = new Set(this.championSkills().map(s => s.id));
    return this.skills().filter(s => !assignedIds.has(s.id) && s.name.toLowerCase().includes(search));
  });

  // ─── Table columns ────────────────────────────────────────────────────────

  protected readonly championColumns = ['image', 'name', 'active', 'order', 'actions', 'skills'];
  protected readonly skillColumns = ['icon', 'name', 'description', 'active', 'order', 'actions'];
  protected readonly temperamentColumns = ['name', 'description', 'order', 'actions'];
  protected readonly adornmentColumns = ['image', 'name', 'active', 'order', 'actions'];
  protected readonly gemColumns = ['icon', 'name', 'type', 'active', 'actions'];
  protected readonly ringColumns = ['icon', 'name', 'description', 'active', 'order', 'actions'];

  // ─── Constants ─────────────────────────────────────────────────────────────

  protected readonly gemTypes = GEM_TYPES;

  // ─── Forms ─────────────────────────────────────────────────────────────────

  protected readonly championForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly skillForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(500)],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly temperamentForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(500)],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly adornmentForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly gemForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    type: ['strategy' as GemType, Validators.required],
  });

  // Edit forms (reuse same structure, populated on edit)
  protected readonly editChampionForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly editSkillForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(500)],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly editTemperamentForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(500)],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly editAdornmentForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly editGemForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    type: ['strategy' as GemType, Validators.required],
  });

  protected readonly ringForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(500)],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  protected readonly editRingForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(500)],
    sort_order: [0, [Validators.required, Validators.min(0)]],
  });

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    await this.loadAll();
  }

  private async loadAll(): Promise<void> {
    await this.progressBarService.withProgress(async () => {
      const [champions, skills, temperaments, adornments, gems, rings] = await Promise.all([
        this.guideAdminService.getChampions(),
        this.guideAdminService.getSkills(),
        this.guideAdminService.getHorseTemperaments(),
        this.guideAdminService.getAdornments(),
        this.guideAdminService.getGems(),
        this.guideAdminService.getRings(),
      ]);
      this.champions.set(champions);
      this.skills.set(skills);
      this.temperaments.set(temperaments);
      this.adornments.set(adornments);
      this.gems.set(gems);
      this.rings.set(rings);
    });
  }

  // ─── Champion CRUD ─────────────────────────────────────────────────────────

  protected startEditChampion(champion: Champion): void {
    this.editingChampionId.set(champion.id);
    this.editChampionForm.patchValue({ name: champion.name, sort_order: champion.sort_order });
  }

  protected cancelEditChampion(): void {
    this.editingChampionId.set(null);
    this.editChampionForm.reset();
  }

  protected async saveChampion(champion: Champion): Promise<void> {
    if (this.editChampionForm.invalid) return;
    const { name, sort_order } = this.editChampionForm.value as { name: string; sort_order: number };
    const { error } = await this.guideAdminService.updateChampion(champion.id, { name, sort_order });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.editingChampionId.set(null);
      this.champions.update(list => list.map(c => (c.id === champion.id ? { ...c, name, sort_order } : c)));
    }
  }

  protected async toggleChampionActive(champion: Champion): Promise<void> {
    const newValue = !champion.is_active;
    const { error } = await this.guideAdminService.updateChampion(champion.id, { is_active: newValue });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.champions.update(list => list.map(c => (c.id === champion.id ? { ...c, is_active: newValue } : c)));
    }
  }

  protected async deleteChampion(champion: Champion): Promise<void> {
    const confirmed = await this.openConfirmDelete(champion.name);
    if (!confirmed) return;
    const { error } = await this.guideAdminService.deleteChampion(champion.id);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.deleted'));
      this.champions.update(list => list.filter(c => c.id !== champion.id));
      if (this.expandedChampionId() === champion.id) {
        this.expandedChampionId.set(null);
      }
    }
  }

  protected async addChampion(): Promise<void> {
    if (this.championForm.invalid) return;
    const { name, sort_order } = this.championForm.value as { name: string; sort_order: number };
    const { champion, error } = await this.guideAdminService.createChampion({
      name,
      sort_order,
      is_active: true,
      image_url: null,
    });
    if (error || !champion) {
      this.snackbarService.error(error ?? 'Error creating champion');
    } else {
      this.snackbarService.success(this.translate.instant('common.created'));
      this.champions.update(list => [...list, champion]);
      this.championForm.reset({ sort_order: 0 });
      this.showAddChampion.set(false);
    }
  }

  protected async uploadChampionImage(champion: Champion, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const { url, error } = await this.guideAdminService.uploadChampionImage(champion.id, file);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.champions.update(list => list.map(c => (c.id === champion.id ? { ...c, image_url: url } : c)));
    }
    input.value = '';
  }

  protected async uploadSkillImage(skill: Skill, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const { url, error } = await this.guideAdminService.uploadSkillImage(skill.id, file);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.skills.update(list => list.map(s => (s.id === skill.id ? { ...s, icon_url: url } : s)));
    }
    input.value = '';
  }

  protected async uploadGemImage(gem: Gem, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const { url, error } = await this.guideAdminService.uploadGemImage(gem.id, file);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.gems.update(list => list.map(g => (g.id === gem.id ? { ...g, icon_url: url } : g)));
    }
    input.value = '';
  }

  protected async uploadRingImage(ring: Ring, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const { url, error } = await this.guideAdminService.uploadRingImage(ring.id, file);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.rings.update(list => list.map(r => (r.id === ring.id ? { ...r, icon_url: url } : r)));
    }
    input.value = '';
  }

  // ─── Champion skills panel ─────────────────────────────────────────────────

  protected async toggleChampionPanel(champion: Champion): Promise<void> {
    if (this.expandedChampionId() === champion.id) {
      this.expandedChampionId.set(null);
      return;
    }
    this.expandedChampionId.set(champion.id);
    this.isLoadingChampionSkills.set(true);
    const skills = await this.guideAdminService.getChampionSkills(champion.id);
    this.championSkills.set(skills);
    this.isLoadingChampionSkills.set(false);
    this.skillSearchControl.setValue('');
  }

  protected async assignSkillToChampion(skill: Skill): Promise<void> {
    const championId = this.expandedChampionId();
    if (!championId) return;
    const { error } = await this.guideAdminService.assignSkillToChampion(championId, skill.id);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.championSkills.update(list => [...list, skill]);
      this.skillSearchControl.setValue('');
    }
  }

  protected async removeSkillFromChampion(skill: Skill): Promise<void> {
    const championId = this.expandedChampionId();
    if (!championId) return;
    const { error } = await this.guideAdminService.removeSkillFromChampion(championId, skill.id);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.championSkills.update(list => list.filter(s => s.id !== skill.id));
    }
  }

  protected displaySkillName(skill: Skill | null): string {
    return skill?.name ?? '';
  }

  // ─── Skill CRUD ────────────────────────────────────────────────────────────

  protected startEditSkill(skill: Skill): void {
    this.editingSkillId.set(skill.id);
    this.editSkillForm.patchValue({ name: skill.name, description: skill.description, sort_order: skill.sort_order });
  }

  protected cancelEditSkill(): void {
    this.editingSkillId.set(null);
    this.editSkillForm.reset();
  }

  protected async saveSkill(skill: Skill): Promise<void> {
    if (this.editSkillForm.invalid) return;
    const { name, description, sort_order } = this.editSkillForm.value as {
      name: string;
      description: string;
      sort_order: number;
    };
    const { error } = await this.guideAdminService.updateSkill(skill.id, { name, description, sort_order });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.editingSkillId.set(null);
      this.skills.update(list => list.map(s => (s.id === skill.id ? { ...s, name, description, sort_order } : s)));
    }
  }

  protected async toggleSkillActive(skill: Skill): Promise<void> {
    const newValue = !skill.is_active;
    const { error } = await this.guideAdminService.updateSkill(skill.id, { is_active: newValue });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.skills.update(list => list.map(s => (s.id === skill.id ? { ...s, is_active: newValue } : s)));
    }
  }

  protected async deleteSkill(skill: Skill): Promise<void> {
    const confirmed = await this.openConfirmDelete(skill.name);
    if (!confirmed) return;
    const { error } = await this.guideAdminService.deleteSkill(skill.id);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.deleted'));
      this.skills.update(list => list.filter(s => s.id !== skill.id));
    }
  }

  protected async addSkill(): Promise<void> {
    if (this.skillForm.invalid) return;
    const { name, description, sort_order } = this.skillForm.value as {
      name: string;
      description: string;
      sort_order: number;
    };
    const { skill, error } = await this.guideAdminService.createSkill({
      name,
      description: description || null,
      sort_order,
      is_active: true,
      icon_url: null,
    });
    if (error || !skill) {
      this.snackbarService.error(error ?? 'Error creating skill');
    } else {
      this.snackbarService.success(this.translate.instant('common.created'));
      this.skills.update(list => [...list, skill]);
      this.skillForm.reset({ sort_order: 0 });
      this.showAddSkill.set(false);
    }
  }

  // ─── Temperament CRUD ──────────────────────────────────────────────────────

  protected startEditTemperament(temperament: HorseTemperament): void {
    this.editingTemperamentId.set(temperament.id);
    this.editTemperamentForm.patchValue({
      name: temperament.name,
      description: temperament.description,
      sort_order: temperament.sort_order,
    });
  }

  protected cancelEditTemperament(): void {
    this.editingTemperamentId.set(null);
    this.editTemperamentForm.reset();
  }

  protected async saveTemperament(temperament: HorseTemperament): Promise<void> {
    if (this.editTemperamentForm.invalid) return;
    const { name, description, sort_order } = this.editTemperamentForm.value as {
      name: string;
      description: string;
      sort_order: number;
    };
    const { error } = await this.guideAdminService.updateHorseTemperament(temperament.id, {
      name,
      description,
      sort_order,
    });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.editingTemperamentId.set(null);
      this.temperaments.update(list =>
        list.map(t => (t.id === temperament.id ? { ...t, name, description, sort_order } : t))
      );
    }
  }

  protected async deleteTemperament(temperament: HorseTemperament): Promise<void> {
    const confirmed = await this.openConfirmDelete(temperament.name);
    if (!confirmed) return;
    const { error } = await this.guideAdminService.deleteHorseTemperament(temperament.id);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.deleted'));
      this.temperaments.update(list => list.filter(t => t.id !== temperament.id));
    }
  }

  protected async addTemperament(): Promise<void> {
    if (this.temperamentForm.invalid) return;
    const { name, description, sort_order } = this.temperamentForm.value as {
      name: string;
      description: string;
      sort_order: number;
    };
    const { temperament, error } = await this.guideAdminService.createHorseTemperament({
      name,
      description: description || null,
      sort_order,
    });
    if (error || !temperament) {
      this.snackbarService.error(error ?? 'Error creating temperament');
    } else {
      this.snackbarService.success(this.translate.instant('common.created'));
      this.temperaments.update(list => [...list, temperament]);
      this.temperamentForm.reset({ sort_order: 0 });
      this.showAddTemperament.set(false);
    }
  }

  // ─── Adornment CRUD ─────────────────────────────────────────────────────────

  protected startEditAdornment(adornment: Adornment): void {
    this.editingAdornmentId.set(adornment.id);
    this.editAdornmentForm.patchValue({ name: adornment.name, sort_order: adornment.sort_order });
  }

  protected cancelEditAdornment(): void {
    this.editingAdornmentId.set(null);
    this.editAdornmentForm.reset();
  }

  protected async saveAdornment(adornment: Adornment): Promise<void> {
    if (this.editAdornmentForm.invalid) return;
    const { name, sort_order } = this.editAdornmentForm.value as { name: string; sort_order: number };
    const { error } = await this.guideAdminService.updateAdornment(adornment.id, { name, sort_order });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.editingAdornmentId.set(null);
      this.adornments.update(list => list.map(o => (o.id === adornment.id ? { ...o, name, sort_order } : o)));
    }
  }

  protected async toggleAdornmentActive(adornment: Adornment): Promise<void> {
    const newValue = !adornment.is_active;
    const { error } = await this.guideAdminService.updateAdornment(adornment.id, { is_active: newValue });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.adornments.update(list => list.map(o => (o.id === adornment.id ? { ...o, is_active: newValue } : o)));
    }
  }

  protected async deleteAdornment(adornment: Adornment): Promise<void> {
    const confirmed = await this.openConfirmDelete(adornment.name);
    if (!confirmed) return;
    const { error } = await this.guideAdminService.deleteAdornment(adornment.id);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.deleted'));
      this.adornments.update(list => list.filter(o => o.id !== adornment.id));
    }
  }

  protected async addAdornment(): Promise<void> {
    if (this.adornmentForm.invalid) return;
    const { name, sort_order } = this.adornmentForm.value as { name: string; sort_order: number };
    const { adornment, error } = await this.guideAdminService.createAdornment({
      name,
      sort_order,
      is_active: true,
      image_url: null,
    });
    if (error || !adornment) {
      this.snackbarService.error(error ?? 'Error creating adornment');
    } else {
      this.snackbarService.success(this.translate.instant('common.created'));
      this.adornments.update(list => [...list, adornment]);
      this.adornmentForm.reset({ sort_order: 0 });
      this.showAddAdornment.set(false);
    }
  }

  // ─── Gem CRUD ──────────────────────────────────────────────────────────────

  protected startEditGem(gem: Gem): void {
    this.editingGemId.set(gem.id);
    this.editGemForm.patchValue({ name: gem.name, type: gem.type });
  }

  protected cancelEditGem(): void {
    this.editingGemId.set(null);
    this.editGemForm.reset();
  }

  protected async saveGem(gem: Gem): Promise<void> {
    if (this.editGemForm.invalid) return;
    const { name, type } = this.editGemForm.value as { name: string; type: GemType };
    const { error } = await this.guideAdminService.updateGem(gem.id, { name, type });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.editingGemId.set(null);
      this.gems.update(list => list.map(g => (g.id === gem.id ? { ...g, name, type } : g)));
    }
  }

  protected async toggleGemActive(gem: Gem): Promise<void> {
    const newValue = !gem.is_active;
    const { error } = await this.guideAdminService.updateGem(gem.id, { is_active: newValue });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.gems.update(list => list.map(g => (g.id === gem.id ? { ...g, is_active: newValue } : g)));
    }
  }

  protected async deleteGem(gem: Gem): Promise<void> {
    const confirmed = await this.openConfirmDelete(gem.name);
    if (!confirmed) return;
    const { error } = await this.guideAdminService.deleteGem(gem.id);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.deleted'));
      this.gems.update(list => list.filter(g => g.id !== gem.id));
    }
  }

  protected async addGem(): Promise<void> {
    if (this.gemForm.invalid) return;
    const { name, type } = this.gemForm.value as { name: string; type: GemType };
    const { gem, error } = await this.guideAdminService.createGem({
      name,
      type,
      is_active: true,
      icon_url: null,
    });
    if (error || !gem) {
      this.snackbarService.error(error ?? 'Error creating gem');
    } else {
      this.snackbarService.success(this.translate.instant('common.created'));
      this.gems.update(list => [...list, gem]);
      this.gemForm.reset({ type: 'strategy' });
      this.showAddGem.set(false);
    }
  }

  // ─── Helpers ───────────────────────────────────────────────────────────────

  protected isEditingChampion(id: string): boolean {
    return this.editingChampionId() === id;
  }

  protected isEditingSkill(id: string): boolean {
    return this.editingSkillId() === id;
  }

  protected isEditingTemperament(id: string): boolean {
    return this.editingTemperamentId() === id;
  }

  protected isEditingAdornment(id: string): boolean {
    return this.editingAdornmentId() === id;
  }

  protected isEditingGem(id: string): boolean {
    return this.editingGemId() === id;
  }

  protected isEditingRing(id: string): boolean {
    return this.editingRingId() === id;
  }

  protected isChampionExpanded(id: string): boolean {
    return this.expandedChampionId() === id;
  }

  protected gemTypeLabel(type: GemType): string {
    return `superAdmin.gemType.${type}`;
  }

  // ─── Ring CRUD ─────────────────────────────────────────────────────────────

  protected startEditRing(ring: Ring): void {
    this.editingRingId.set(ring.id);
    this.editRingForm.patchValue({ name: ring.name, description: ring.description, sort_order: ring.sort_order });
  }

  protected cancelEditRing(): void {
    this.editingRingId.set(null);
    this.editRingForm.reset();
  }

  protected async saveRing(ring: Ring): Promise<void> {
    if (this.editRingForm.invalid) return;
    const { name, description, sort_order } = this.editRingForm.value as {
      name: string;
      description: string;
      sort_order: number;
    };
    const { error } = await this.guideAdminService.updateRing(ring.id, { name, description, sort_order });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.saved'));
      this.editingRingId.set(null);
      this.rings.update(list => list.map(r => (r.id === ring.id ? { ...r, name, description, sort_order } : r)));
    }
  }

  protected async toggleRingActive(ring: Ring): Promise<void> {
    const newValue = !ring.is_active;
    const { error } = await this.guideAdminService.updateRing(ring.id, { is_active: newValue });
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.rings.update(list => list.map(r => (r.id === ring.id ? { ...r, is_active: newValue } : r)));
    }
  }

  protected async deleteRing(ring: Ring): Promise<void> {
    const confirmed = await this.openConfirmDelete(ring.name);
    if (!confirmed) return;
    const { error } = await this.guideAdminService.deleteRing(ring.id);
    if (error) {
      this.snackbarService.error(error);
    } else {
      this.snackbarService.success(this.translate.instant('common.deleted'));
      this.rings.update(list => list.filter(r => r.id !== ring.id));
    }
  }

  protected async addRing(): Promise<void> {
    if (this.ringForm.invalid) return;
    const { name, description, sort_order } = this.ringForm.value as {
      name: string;
      description: string;
      sort_order: number;
    };
    const { ring, error } = await this.guideAdminService.createRing({
      name,
      description: description || null,
      sort_order,
      is_active: true,
      icon_url: null,
    });
    if (error || !ring) {
      this.snackbarService.error(error ?? 'Error creating ring');
    } else {
      this.snackbarService.success(this.translate.instant('common.created'));
      this.rings.update(list => [...list, ring]);
      this.ringForm.reset({ sort_order: 0 });
      this.showAddRing.set(false);
    }
  }

  private async openConfirmDelete(name: string): Promise<boolean> {
    return firstValueFrom(
      this.dialog
        .open(ConfirmDialogComponent, {
          data: { message: this.translate.instant('common.deleteConfirm', { name }) },
        })
        .afterClosed()
    );
  }
}
