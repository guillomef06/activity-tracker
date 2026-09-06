import { Component, inject, signal, computed, effect, OnInit, ChangeDetectionStrategy, resource } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DestroyRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { form, required, maxLength, FormField } from '@angular/forms/signals';
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
import { getFieldErrorKey } from '@shared/utils/form-validation.utils';
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
  GuideWithDetails,
} from '@shared/models';

const GUIDE_CATEGORIES: { value: GuideCategory; labelKey: string }[] = [
  { value: 'formation', labelKey: 'guides.categories.formation' },
  { value: 'evenement', labelKey: 'guides.categories.evenement' },
  { value: 'general', labelKey: 'guides.categories.general' },
];

const TITLE_MAX_LENGTH = 100;
const DESCRIPTION_MAX_LENGTH = 2000;
const DEFAULT_CATEGORY: GuideCategory = 'general';
const CHAMPION_SLOT_COUNT = 3;

interface GuideEditorFormValue {
  basic: { title: string; category: GuideCategory };
  content: { description: string };
  review: { notes: string; is_published: boolean };
}

function buildInitialFormValue(): GuideEditorFormValue {
  return {
    basic: { title: '', category: DEFAULT_CATEGORY },
    content: { description: '' },
    review: { notes: '', is_published: false },
  };
}

interface GuideReferenceData {
  champions: Champion[];
  skills: Skill[];
  gems: Gem[];
  temperaments: HorseTemperament[];
  adornments: Adornment[];
  rings: Ring[];
  championSkillsMap: Map<string, Skill[]>;
}

@Component({
  selector: 'app-guide-editor',
  imports: [
    FormField,
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
  private readonly guideService = inject(GuideService);
  private readonly guideAdminService = inject(GuideAdminService);
  private readonly authService = inject(AuthService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  protected readonly categories = GUIDE_CATEGORIES;

  // ─── Mode ──────────────────────────────────────────────────────────────────

  protected readonly isEditMode = signal(false);
  protected readonly guideId = signal<string | null>(null);
  protected readonly isSaving = signal(false);

  // ─── Reference data & guide-for-edit — Resource API ─────────────────────────

  private readonly referenceDataResource = resource({
    loader: () => this.loadReferenceData(),
  });

  private readonly guideResource = resource({
    params: () => {
      const id = this.guideId();
      return id ? { id } : undefined;
    },
    loader: ({ params }) => this.guideService.getGuideById(params.id),
  });

  protected readonly isLoading = computed(
    () => this.referenceDataResource.isLoading() || this.guideResource.isLoading()
  );

  private readonly champions = computed(() => this.referenceDataResource.value()?.champions ?? []);
  private readonly skills = computed(() => this.referenceDataResource.value()?.skills ?? []);
  private readonly gems = computed(() => this.referenceDataResource.value()?.gems ?? []);
  private readonly temperaments = computed(() => this.referenceDataResource.value()?.temperaments ?? []);
  private readonly adornments = computed(() => this.referenceDataResource.value()?.adornments ?? []);
  private readonly rings = computed(() => this.referenceDataResource.value()?.rings ?? []);
  private readonly championSkillsMap = computed(
    () => this.referenceDataResource.value()?.championSkillsMap ?? new Map<string, Skill[]>()
  );

  // ─── Form ──────────────────────────────────────────────────────────────────

  protected readonly formModel = signal<GuideEditorFormValue>(buildInitialFormValue());

  protected readonly guideForm = form(this.formModel, schemaPath => {
    required(schemaPath.basic.title);
    maxLength(schemaPath.basic.title, TITLE_MAX_LENGTH);
    required(schemaPath.basic.category);
    maxLength(schemaPath.content.description, DESCRIPTION_MAX_LENGTH);
    maxLength(schemaPath.review.notes, DESCRIPTION_MAX_LENGTH);
  });

  protected readonly titleErrorKey = computed(() => getFieldErrorKey(this.guideForm.basic.title().errors()));

  protected readonly selectedCategory = computed(() => this.formModel().basic.category);

  // ─── Computed template helpers ─────────────────────────────────────────────

  protected readonly isFormationCategory = computed(() => this.selectedCategory() === 'formation');
  protected readonly hasAtLeastOneChampion = computed(() => this.championSlots().some(s => s !== null));
  protected readonly filledSlotsCount = computed(() => this.championSlots().filter(s => s !== null).length);
  protected readonly guidePreview = computed(() => ({
    title: this.formModel().basic.title,
    category: this.selectedCategory(),
    description: this.formModel().content.description,
  }));

  // ─── Champion slots (formation only) ───────────────────────────────────────

  protected readonly championSlots = signal<(ChampionSlotConfig | null)[]>(
    new Array<null>(CHAMPION_SLOT_COUNT).fill(null)
  );

  constructor() {
    effect(() => {
      const guide = this.guideResource.value();
      if (this.guideResource.status() !== 'resolved' || guide === undefined) {
        return;
      }
      this.handleGuideLoaded(guide);
    });
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.isEditMode.set(!!id);
    this.guideId.set(id);
  }

  private async loadReferenceData(): Promise<GuideReferenceData> {
    const [champions, skills, gems, temperaments, adornments, rings] = await Promise.all([
      this.guideAdminService.getChampions(),
      this.guideAdminService.getSkills(),
      this.guideAdminService.getGems(),
      this.guideAdminService.getHorseTemperaments(),
      this.guideAdminService.getAdornments(),
      this.guideAdminService.getRings(),
    ]);

    const activeChampions = champions.filter(c => c.is_active);
    const championSkillsMap = await this.buildChampionSkillsMap(activeChampions);

    return {
      champions: activeChampions,
      skills: skills.filter(s => s.is_active),
      gems: gems.filter(g => g.is_active),
      temperaments,
      adornments: adornments.filter(o => o.is_active),
      rings: rings.filter(r => r.is_active),
      championSkillsMap,
    };
  }

  private async buildChampionSkillsMap(champions: Champion[]): Promise<Map<string, Skill[]>> {
    const map = new Map<string, Skill[]>();
    await Promise.all(
      champions.map(async c => {
        const championSkills = await this.guideAdminService.getChampionSkills(c.id);
        map.set(c.id, championSkills);
      })
    );
    return map;
  }

  private handleGuideLoaded(guide: GuideWithDetails | null): void {
    if (guide === null) {
      this.snackbarService.error(this.translate.instant('guides.errors.notFound'));
      void this.router.navigate(['/app/guides']);
      return;
    }

    if (guide.author_id !== this.authService.getUserId()) {
      this.snackbarService.error(this.translate.instant('guides.errors.unauthorized'));
      void this.router.navigate(['/app/guides']);
      return;
    }

    this.populateFormFromGuide(guide);
  }

  private populateFormFromGuide(guide: GuideWithDetails): void {
    this.formModel.set({
      basic: { title: guide.title, category: guide.category },
      content: { description: guide.description ?? '' },
      review: { notes: guide.description ?? '', is_published: guide.is_published },
    });

    if (guide.category === 'formation' && guide.guide_champions) {
      const slots: (ChampionSlotConfig | null)[] = new Array<null>(CHAMPION_SLOT_COUNT).fill(null);
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
      champion: gc.champions as Champion,
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
      .map(s => s?.ring?.id)
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
    if (this.guideForm.basic().invalid() || this.isSaving()) return;

    this.isSaving.set(true);
    try {
      await this.persistGuide();
    } finally {
      this.isSaving.set(false);
    }
  }

  private async persistGuide(): Promise<void> {
    const { basic, content, review } = this.formModel();
    const description = basic.category !== 'formation' ? content.description || null : null;
    const finalDescription = review.notes || description;

    const guideId = this.isEditMode()
      ? await this.updateExistingGuide(basic.title, finalDescription, review.is_published)
      : await this.createNewGuide(basic.title, basic.category, finalDescription);

    if (guideId === null) return;

    if (basic.category === 'formation' && !(await this.saveFormationChampions(guideId))) return;

    this.snackbarService.success(this.translate.instant('common.saved'));
    void this.router.navigate(['/app/guides']);
  }

  private async updateExistingGuide(
    title: string,
    description: string | null,
    isPublished: boolean
  ): Promise<string | null> {
    const guideId = this.guideId();
    if (guideId === null) {
      this.snackbarService.error(this.translate.instant('guides.errors.unknown'));
      return null;
    }

    const { error } = await this.guideService.updateGuide(guideId, {
      title,
      description,
      is_published: isPublished,
    });
    if (error) {
      this.snackbarService.error(this.translate.instant(error));
      return null;
    }
    return guideId;
  }

  private async createNewGuide(
    title: string,
    category: GuideCategory,
    description: string | null
  ): Promise<string | null> {
    const { guide, error } = await this.guideService.createGuide({ title, category, description });
    if (error || !guide) {
      this.snackbarService.error(this.translate.instant(error ?? 'guides.errors.unauthorized'));
      return null;
    }
    return guide.id;
  }

  private async saveFormationChampions(guideId: string): Promise<boolean> {
    const filledSlots = this.championSlots().filter((s): s is ChampionSlotConfig => s !== null);
    if (filledSlots.length === 0) return true;

    const { error } = await this.guideService.saveGuideChampions(guideId, filledSlots);
    if (error) {
      this.snackbarService.error(this.translate.instant(error));
      return false;
    }
    return true;
  }

  protected cancel(): void {
    void this.router.navigate(['/app/guides']);
  }
}
