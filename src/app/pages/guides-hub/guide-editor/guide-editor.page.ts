import { Component, inject, signal, computed, OnInit, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatStepperModule } from '@angular/material/stepper';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { TextFieldModule } from '@angular/cdk/text-field';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { SlicePipe } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { GuideService } from '@app/core/services/guide.service';
import { GuideAdminService } from '@app/core/services/guide-admin.service';
import { AuthService, SnackbarService } from '@app/core/services';
import { ProgressBarService } from '@app/core/services/progress-bar.service';
import { ChampionSlotComponent } from './components/champion-slot/champion-slot.component';
import {
  ChampionConfiguratorDialogComponent,
  ChampionConfiguratorDialogData,
} from './components/champion-configurator-dialog/champion-configurator-dialog.component';
import type {
  GuideCategory,
  Champion,
  Skill,
  Gem,
  HorseTemperament,
  Adornment,
  Ring,
  ChampionSlotConfig,
  ChampionPosition,
  GuideChampion,
} from '@shared/models';

const GUIDE_CATEGORIES: { value: GuideCategory; labelKey: string }[] = [
  { value: 'formation', labelKey: 'guides.categories.formation' },
  { value: 'evenement', labelKey: 'guides.categories.evenement' },
  { value: 'general', labelKey: 'guides.categories.general' },
];

@Component({
  selector: 'app-guide-editor',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatStepperModule,
    MatSlideToggleModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatChipsModule,
    TextFieldModule,
    DragDropModule,
    TranslateModule,
    SlicePipe,
    ChampionSlotComponent,
  ],
  templateUrl: './guide-editor.page.html',
  styleUrl: './guide-editor.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GuideEditorPage implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly fb = inject(FormBuilder);
  private readonly guideService = inject(GuideService);
  private readonly guideAdminService = inject(GuideAdminService);
  private readonly authService = inject(AuthService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly progressBarService = inject(ProgressBarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  protected readonly categories = GUIDE_CATEGORIES;

  // ─── Mode ──────────────────────────────────────────────────────────────────

  protected readonly isEditMode = signal(false);
  protected readonly guideId = signal<string | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly isSaving = signal(false);

  // ─── Forms ─────────────────────────────────────────────────────────────────

  protected readonly basicForm: FormGroup = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(100)]],
    category: ['general' as GuideCategory, Validators.required],
  });

  protected readonly contentForm: FormGroup = this.fb.group({
    description: ['', Validators.maxLength(2000)],
  });

  protected readonly reviewForm: FormGroup = this.fb.group({
    notes: ['', Validators.maxLength(2000)],
    is_published: [false],
  });

  protected readonly selectedCategory = signal<GuideCategory>('general');

  // ─── Form value signals (for computed derivations) ─────────────────────────

  private readonly basicFormValue = toSignal(this.basicForm.valueChanges, {
    initialValue: this.basicForm.value as { title: string; category: GuideCategory },
  });
  private readonly contentFormValue = toSignal(this.contentForm.valueChanges, {
    initialValue: this.contentForm.value as { description: string },
  });

  // ─── Computed template helpers ─────────────────────────────────────────────

  protected readonly isFormationCategory = computed(() => this.selectedCategory() === 'formation');
  protected readonly hasAtLeastOneChampion = computed(() => this.championSlots().some(s => s !== null));
  protected readonly filledSlotsCount = computed(() => this.championSlots().filter(s => s !== null).length);
  protected readonly guidePreview = computed(() => ({
    title: (this.basicFormValue().title as string) ?? '',
    category: this.selectedCategory(),
    description: (this.contentFormValue().description as string) ?? '',
  }));

  // ─── Champion slots (formation only) ───────────────────────────────────────

  protected readonly championSlots = signal<(ChampionSlotConfig | null)[]>([null, null, null]);

  // ─── Reference data ────────────────────────────────────────────────────────

  private readonly champions = signal<Champion[]>([]);
  private readonly skills = signal<Skill[]>([]);
  private readonly gems = signal<Gem[]>([]);
  private readonly temperaments = signal<HorseTemperament[]>([]);
  private readonly adornments = signal<Adornment[]>([]);
  private readonly rings = signal<Ring[]>([]);

  /** Skills indexed by champion ID — built once reference data is loaded */
  private readonly championSkillsMap = signal<Map<string, Skill[]>>(new Map());

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEditMode.set(!!id);
    this.guideId.set(id);

    this.basicForm
      .get('category')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(val => this.selectedCategory.set(val as GuideCategory));

    this.isLoading.set(true);
    try {
      await this.loadReferenceData();
      if (id) {
        await this.loadGuideForEdit(id);
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  private async loadReferenceData(): Promise<void> {
    const [champions, skills, gems, temperaments, adornments, rings] = await Promise.all([
      this.guideAdminService.getChampions(),
      this.guideAdminService.getSkills(),
      this.guideAdminService.getGems(),
      this.guideAdminService.getHorseTemperaments(),
      this.guideAdminService.getAdornments(),
      this.guideAdminService.getRings(),
    ]);

    this.champions.set(champions.filter(c => c.is_active));
    this.skills.set(skills.filter(s => s.is_active));
    this.gems.set(gems.filter(g => g.is_active));
    this.temperaments.set(temperaments);
    this.adornments.set(adornments.filter(o => o.is_active));
    this.rings.set(rings.filter(r => r.is_active));

    // Build champion → skills map
    const map = new Map<string, Skill[]>();
    await Promise.all(
      champions.map(async c => {
        const championSkills = await this.guideAdminService.getChampionSkills(c.id);
        map.set(c.id, championSkills);
      })
    );
    this.championSkillsMap.set(map);
  }

  private async loadGuideForEdit(id: string): Promise<void> {
    const guide = await this.guideService.getGuideById(id);
    if (!guide) {
      this.snackbarService.error(this.translate.instant('guides.errors.notFound'));
      void this.router.navigate(['/app/guides']);
      return;
    }

    if (guide.author_id !== this.authService.getUserId()) {
      this.snackbarService.error(this.translate.instant('guides.errors.unauthorized'));
      void this.router.navigate(['/app/guides']);
      return;
    }

    this.basicForm.patchValue({ title: guide.title, category: guide.category });
    this.selectedCategory.set(guide.category);
    this.contentForm.patchValue({ description: guide.description ?? '' });
    this.reviewForm.patchValue({ notes: guide.description ?? '', is_published: guide.is_published });

    if (guide.category === 'formation' && guide.guide_champions) {
      const slots: (ChampionSlotConfig | null)[] = [null, null, null];
      for (const gc of guide.guide_champions) {
        if (gc.champions) {
          slots[gc.position] = this.mapGuideChampionToSlotConfig(gc);
        }
      }
      this.championSlots.set(slots);
    }
  }

  private mapGuideChampionToSlotConfig(gc: GuideChampion): ChampionSlotConfig {
    const skills: [Skill | null, Skill | null] = [null, null];
    gc.guide_champion_skills?.forEach(s => {
      if (s.slot === 1) skills[0] = s.skills ?? null;
      if (s.slot === 2) skills[1] = s.skills ?? null;
    });

    const gems: [Gem | null, Gem | null, Gem | null] = [null, null, null];
    gc.guide_champion_gems?.forEach(g => {
      if (g.slot >= 1 && g.slot <= 3) gems[g.slot - 1] = g.gems ?? null;
    });

    const traits: [HorseTemperament | null, HorseTemperament | null, HorseTemperament | null] = [null, null, null];
    gc.guide_champion_horse_traits?.forEach(t => {
      if (t.slot >= 1 && t.slot <= 3) traits[t.slot - 1] = t.horse_temperaments ?? null;
    });

    return {
      position: gc.position,
      champion: gc.champions!,
      skills,
      gems,
      traits,
      adornment: gc.adornments ?? null,
      ring: gc.rings ?? null,
    };
  }

  // ─── Champion slot management ───────────────────────────────────────────────

  protected openChampionDialog(position: number): void {
    const existing = this.championSlots()[position] ?? null;

    const usedRingIds = this.championSlots()
      .filter((s, i) => s !== null && i !== position)
      .map(s => s!.ring?.id)
      .filter((id): id is string => !!id);

    const dialogData: ChampionConfiguratorDialogData = {
      position: position as ChampionPosition,
      existing,
      champions: this.champions(),
      skills: this.skills(),
      gems: this.gems(),
      temperaments: this.temperaments(),
      adornments: this.adornments(),
      rings: this.rings(),
      usedRingIds,
      championSkillsMap: this.championSkillsMap(),
    };

    const ref = this.dialog.open(ChampionConfiguratorDialogComponent, {
      data: dialogData,
      width: '520px',
      maxWidth: '95vw',
      maxHeight: '90vh',
    });

    ref
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: ChampionSlotConfig | null) => {
        if (result) {
          this.championSlots.update(slots => {
            const updated = [...slots];
            updated[position] = { ...result, position: position as ChampionPosition };
            return updated;
          });
        }
      });
  }

  protected clearChampionSlot(position: number): void {
    this.championSlots.update(slots => {
      const updated = [...slots];
      updated[position] = null;
      return updated;
    });
  }

  protected onSlotDrop(event: CdkDragDrop<(ChampionSlotConfig | null)[]>): void {
    const updated = [...this.championSlots()];
    moveItemInArray(updated, event.previousIndex, event.currentIndex);
    this.championSlots.set(updated.map((slot, i) => (slot ? { ...slot, position: i as ChampionPosition } : null)));
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  protected async save(): Promise<void> {
    if (this.basicForm.invalid || this.isSaving()) return;

    this.isSaving.set(true);
    try {
      const { title, category } = this.basicForm.value as { title: string; category: GuideCategory };
      const description =
        category !== 'formation' ? (this.contentForm.value as { description: string }).description || null : null;
      const { notes, is_published } = this.reviewForm.value as {
        notes: string;
        is_published: boolean;
      };

      // Notes (step 3) take priority over description (step 2).
      // For formation guides, description is forced to null; notes serve as the final description for all categories.
      const finalDescription = notes || description;

      let guideId = this.guideId();

      if (this.isEditMode() && guideId) {
        const { error } = await this.guideService.updateGuide(guideId, {
          title,
          description: finalDescription,
          is_published,
        });
        if (error) {
          this.snackbarService.error(this.translate.instant(error));
          return;
        }
      } else {
        const { guide, error } = await this.guideService.createGuide({
          title,
          category,
          description: finalDescription,
        });
        if (error || !guide) {
          this.snackbarService.error(this.translate.instant(error ?? 'guides.errors.unauthorized'));
          return;
        }
        guideId = guide.id;
      }

      // Save champion slots for formation guides
      if (category === 'formation') {
        const filledSlots = this.championSlots().filter((s): s is ChampionSlotConfig => s !== null);
        if (filledSlots.length > 0) {
          const { error } = await this.guideService.saveGuideChampions(guideId!, filledSlots);
          if (error) {
            this.snackbarService.error(this.translate.instant(error));
            return;
          }
        }
      }

      this.snackbarService.success(this.translate.instant('common.saved'));
      void this.router.navigate(['/app/guides']);
    } finally {
      this.isSaving.set(false);
    }
  }

  protected cancel(): void {
    void this.router.navigate(['/app/guides']);
  }
}
