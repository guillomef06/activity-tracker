import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule, MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { firstValueFrom } from 'rxjs';

import { SeasonService } from '@app/core/services/season.service';
import { SnackbarService } from '@app/core/services';
import { ProgressBarService } from '@app/core/services/progress-bar.service';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { ActivityLabelPipe } from '@app/shared/pipes/activity-label.pipe';
import { APP_CONSTANTS } from '@app/shared/constants/constants';
import type {
  CreateSeasonRequest,
  SeasonWithWeeks,
  UpdateSeasonStructureRequest,
  WeekActivityAssignment,
} from '@app/shared/models/season.model';

const SEASON_NAME_MAX_LENGTH = 100;
const MIN_WEEK_COUNT = 1;
const MAX_WEEK_COUNT = 52;
const DEFAULT_WEEK_COUNT = APP_CONSTANTS.SCORING.WEEKS_TO_TRACK;
const LEGION_ACTIVITY_TYPE = 'legion';

type SeasonStatus = 'past' | 'current' | 'future';
type WeekActivitiesFormArray = FormArray<FormControl<string[]>>;

interface SeasonWeekView {
  weekIndex: number;
  activityTypes: string[];
}

@Component({
  selector: 'app-super-admin-seasons',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatStepperModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    TranslateModule,
    ActivityLabelPipe,
  ],
  templateUrl: './super-admin-seasons.page.html',
  styleUrl: './super-admin-seasons.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminSeasonsPage implements OnInit {
  private readonly seasonService = inject(SeasonService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly progressBarService = inject(ProgressBarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly progressBar = this.progressBarService;
  protected readonly seasons = this.seasonService.seasons;
  protected readonly nonLegionActivityTypes = APP_CONSTANTS.ACTIVITY_TYPES.filter(
    type => type.value !== LEGION_ACTIVITY_TYPE
  );
  protected readonly legionActivityType = LEGION_ACTIVITY_TYPE;
  protected readonly minWeekCount = MIN_WEEK_COUNT;
  protected readonly maxWeekCount = MAX_WEEK_COUNT;
  protected readonly nameMaxLength = SEASON_NAME_MAX_LENGTH;

  // ─── Read-only per-season week breakdown (avoids method calls in templates) ─
  protected readonly seasonWeekViews = computed<Record<string, SeasonWeekView[]>>(() => {
    const map: Record<string, SeasonWeekView[]> = {};
    for (const season of this.seasons()) {
      map[season.id] = this.buildWeekViews(season);
    }
    return map;
  });

  // ─── Lock state cache ────────────────────────────────────────────────────
  protected readonly lockedSeasons = signal<Record<string, boolean>>({});
  protected readonly checkingLockId = signal<string | null>(null);

  // ─── Row expand / edit state ────────────────────────────────────────────
  protected readonly expandedSeasonId = signal<string | null>(null);
  protected readonly editingSeasonId = signal<string | null>(null);

  // ─── Create wizard state ─────────────────────────────────────────────────
  protected readonly showCreateWizard = signal(false);
  protected readonly suggestedStartDate = signal<Date | null>(null);
  // Once a season exists, every subsequent start_date is derived to keep
  // seasons contiguous (enforced by the DB trigger) — only the very first
  // season's start_date is a free choice, so only then is the picker editable.
  protected readonly canPickStartDate = computed(() => this.seasons().length === 0);
  protected readonly mondayFilter = (date: Date | null): boolean => !!date && date.getDay() === 1;

  protected readonly createForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(SEASON_NAME_MAX_LENGTH)]],
    weekCount: [
      DEFAULT_WEEK_COUNT,
      [Validators.required, Validators.min(MIN_WEEK_COUNT), Validators.max(MAX_WEEK_COUNT)],
    ],
  });

  protected readonly createWeekActivities: WeekActivitiesFormArray = this.fb.array<FormControl<string[]>>([]);

  // ─── Edit form ───────────────────────────────────────────────────────────
  protected readonly editForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.maxLength(SEASON_NAME_MAX_LENGTH)]],
    weekCount: [
      DEFAULT_WEEK_COUNT,
      [Validators.required, Validators.min(MIN_WEEK_COUNT), Validators.max(MAX_WEEK_COUNT)],
    ],
  });

  protected readonly editWeekActivities: WeekActivitiesFormArray = this.fb.array<FormControl<string[]>>([]);

  constructor() {
    this.createForm
      .get('weekCount')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((weekCount: number) => {
        this.rebuildWeekArray(this.createWeekActivities, weekCount, this.currentAssignments(this.createWeekActivities));
      });

    this.editForm
      .get('weekCount')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((weekCount: number) => {
        if (this.isEditLocked()) return;
        this.rebuildWeekArray(this.editWeekActivities, weekCount, this.currentAssignments(this.editWeekActivities));
      });
  }

  async ngOnInit(): Promise<void> {
    await this.loadSeasons();
  }

  private async loadSeasons(): Promise<void> {
    await this.progressBarService.withProgress(async () => {
      await this.seasonService.loadSeasons();
    });
  }

  // ─── Status / read-only helpers ──────────────────────────────────────────

  protected seasonStatus(season: SeasonWithWeeks): SeasonStatus {
    const today = this.startOfDay(new Date());
    const start = this.startOfDay(season.startDate);
    const end = this.startOfDay(season.endDate);
    if (today.getTime() < start.getTime()) return 'future';
    if (today.getTime() > end.getTime()) return 'past';
    return 'current';
  }

  private startOfDay(date: Date): Date {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    return result;
  }

  private buildWeekViews(season: SeasonWithWeeks): SeasonWeekView[] {
    const grouped = new Map<number, string[]>();
    for (const week of season.weekActivities) {
      grouped.set(week.weekIndex, [...(grouped.get(week.weekIndex) ?? []), week.activityType]);
    }
    const views: SeasonWeekView[] = [];
    for (let weekIndex = 1; weekIndex <= season.weekCount; weekIndex++) {
      views.push({ weekIndex, activityTypes: grouped.get(weekIndex) ?? [] });
    }
    return views;
  }

  // ─── Row expand + lock lookup ────────────────────────────────────────────

  protected isExpanded(seasonId: string): boolean {
    return this.expandedSeasonId() === seasonId;
  }

  protected async toggleExpand(season: SeasonWithWeeks): Promise<void> {
    if (this.expandedSeasonId() === season.id) {
      this.expandedSeasonId.set(null);
      this.cancelEdit();
      return;
    }
    this.expandedSeasonId.set(season.id);
    await this.checkLock(season);
  }

  private async checkLock(season: SeasonWithWeeks): Promise<boolean> {
    const cached = this.lockedSeasons()[season.id];
    if (cached !== undefined) return cached;
    this.checkingLockId.set(season.id);
    try {
      const locked = await this.seasonService.checkSeasonLocked(season.id);
      this.lockedSeasons.update(map => ({ ...map, [season.id]: locked }));
      return locked;
    } finally {
      this.checkingLockId.set(null);
    }
  }

  protected isLockKnown(seasonId: string): boolean {
    return this.lockedSeasons()[seasonId] !== undefined;
  }

  protected isLocked(seasonId: string): boolean {
    return this.lockedSeasons()[seasonId] === true;
  }

  // ─── Create wizard ────────────────────────────────────────────────────────

  protected openCreateWizard(): void {
    const start = this.seasonService.suggestNextSeasonStartDate();
    this.suggestedStartDate.set(start);
    this.createForm.reset({ name: '', weekCount: DEFAULT_WEEK_COUNT });
    this.rebuildWeekArray(this.createWeekActivities, DEFAULT_WEEK_COUNT, []);
    this.showCreateWizard.set(true);
  }

  protected closeCreateWizard(): void {
    this.showCreateWizard.set(false);
  }

  protected onStartDateChange(event: MatDatepickerInputEvent<Date>): void {
    if (!event.value) return;
    // mat-datepicker builds the picked date at *local* midnight, but the
    // rest of the app (SeasonService, DB) treats start_date as a UTC-normalized
    // calendar day. In any positive-UTC-offset timezone, local midnight is
    // still the previous day in UTC, so getUTCDay() would read the wrong
    // weekday — re-anchor to UTC midnight using the picked day's calendar
    // components (not the instant) to keep the calendar day the user clicked.
    const picked = event.value;
    this.suggestedStartDate.set(new Date(Date.UTC(picked.getFullYear(), picked.getMonth(), picked.getDate())));
  }

  protected async submitCreateSeason(): Promise<void> {
    if (this.createForm.invalid) return;
    const startDate = this.suggestedStartDate();
    if (!startDate) return;

    const { name, weekCount } = this.createForm.getRawValue() as { name: string; weekCount: number };
    const request: CreateSeasonRequest = {
      name: name.trim(),
      startDate,
      weekCount,
      weekActivities: this.currentAssignments(this.createWeekActivities),
    };

    const { season, error } = await this.seasonService.createSeason(request);
    if (error || !season) {
      this.snackbarService.error(error ?? this.translate.instant('superAdmin.seasons.createFailed'));
      return;
    }

    this.snackbarService.success(this.translate.instant('common.created'));
    await this.loadSeasons();
    this.closeCreateWizard();
  }

  // ─── Edit flow ────────────────────────────────────────────────────────────

  protected isEditingThisSeason(seasonId: string): boolean {
    return this.editingSeasonId() === seasonId;
  }

  protected isEditLocked(): boolean {
    const id = this.editingSeasonId();
    return id ? this.isLocked(id) : false;
  }

  protected startEdit(season: SeasonWithWeeks): void {
    const locked = this.isLocked(season.id);
    this.editingSeasonId.set(season.id);
    this.editForm.reset({ name: season.name, weekCount: season.weekCount });
    this.rebuildWeekArray(this.editWeekActivities, season.weekCount, season.weekActivities);

    const weekCountControl = this.editForm.get('weekCount');
    if (locked) {
      weekCountControl?.disable({ emitEvent: false });
    } else {
      weekCountControl?.enable({ emitEvent: false });
    }
  }

  protected cancelEdit(): void {
    this.editingSeasonId.set(null);
  }

  protected async saveEdit(season: SeasonWithWeeks): Promise<void> {
    if (this.editForm.invalid) return;
    const { name, weekCount } = this.editForm.getRawValue() as { name: string; weekCount: number };
    const trimmedName = name.trim();

    if (this.isEditLocked()) {
      await this.saveNameOnly(season, trimmedName);
      return;
    }

    await this.saveStructure(season, trimmedName, weekCount);
  }

  private async saveNameOnly(season: SeasonWithWeeks, name: string): Promise<void> {
    if (name === season.name) {
      this.cancelEdit();
      return;
    }
    const { error } = await this.seasonService.updateSeasonName(season.id, name);
    if (error) {
      this.snackbarService.error(error);
      return;
    }
    this.snackbarService.success(this.translate.instant('common.saved'));
    await this.loadSeasons();
    this.cancelEdit();
  }

  private async saveStructure(season: SeasonWithWeeks, name: string, weekCount: number): Promise<void> {
    if (name !== season.name) {
      const { error: nameError } = await this.seasonService.updateSeasonName(season.id, name);
      if (nameError) {
        this.snackbarService.error(nameError);
        return;
      }
    }

    const request: UpdateSeasonStructureRequest = {
      seasonId: season.id,
      weekCount,
      weekActivities: this.currentAssignments(this.editWeekActivities),
    };
    const { error } = await this.seasonService.updateSeasonStructure(request);
    if (error) {
      this.snackbarService.error(error);
      return;
    }

    this.snackbarService.success(this.translate.instant('common.saved'));
    await this.loadSeasons();
    this.cancelEdit();
  }

  // ─── Delete flow ──────────────────────────────────────────────────────────

  protected async deleteSeason(season: SeasonWithWeeks): Promise<void> {
    if (this.isLocked(season.id)) return;
    const confirmed = await this.openConfirmDelete(season.name);
    if (!confirmed) return;

    const { error } = await this.seasonService.deleteSeason(season.id);
    if (error) {
      this.snackbarService.error(error);
      return;
    }
    this.snackbarService.success(this.translate.instant('common.deleted'));
    await this.loadSeasons();
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

  // ─── Week-array helpers (shared by create + edit) ────────────────────────

  private currentAssignments(array: WeekActivitiesFormArray): WeekActivityAssignment[] {
    return array.controls.flatMap((control, index) =>
      control.value.map(activityType => ({ weekIndex: index + 1, activityType }))
    );
  }

  private rebuildWeekArray(
    array: WeekActivitiesFormArray,
    weekCount: number,
    existing: WeekActivityAssignment[]
  ): void {
    if (!Number.isFinite(weekCount) || weekCount < MIN_WEEK_COUNT) return;
    const grouped = new Map<number, string[]>();
    for (const assignment of existing) {
      grouped.set(assignment.weekIndex, [...(grouped.get(assignment.weekIndex) ?? []), assignment.activityType]);
    }
    array.clear();
    for (let weekIndex = 1; weekIndex <= weekCount; weekIndex++) {
      array.push(this.fb.control<string[]>(grouped.get(weekIndex) ?? [], { nonNullable: true }));
    }
  }
}
