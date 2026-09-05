import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  resource,
  signal,
  untracked,
  WritableSignal,
} from '@angular/core';
import { form, FormField, required, maxLength, min, max, disabled } from '@angular/forms/signals';
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
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { ActivityLabelPipe } from '@app/shared/pipes/activity-label.pipe';
import { APP_CONSTANTS } from '@app/shared/constants/constants';
import { getFieldErrorKey } from '@app/shared/utils/form-validation.utils';
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

interface SeasonWeekView {
  weekIndex: number;
  activityTypes: string[];
}

interface SeasonFormValue {
  name: string;
  weekCount: number;
}

@Component({
  selector: 'app-super-admin-seasons',
  imports: [
    FormField,
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
export class SuperAdminSeasonsPage {
  private readonly seasonService = inject(SeasonService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  // ─── Season list (Resource API) ──────────────────────────────────────────
  protected readonly seasonsResource = resource({
    loader: async () => {
      await this.seasonService.loadSeasons();
      return this.seasonService.seasons();
    },
  });
  protected readonly seasons = computed<SeasonWithWeeks[]>(() =>
    this.seasonsResource.hasValue() ? this.seasonsResource.value() : []
  );

  protected readonly nonLegionActivityTypes = APP_CONSTANTS.ACTIVITY_TYPES.filter(
    type => type.value !== LEGION_ACTIVITY_TYPE
  );
  protected readonly legionActivityType = LEGION_ACTIVITY_TYPE;

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

  protected readonly createModel = signal<SeasonFormValue>({ name: '', weekCount: DEFAULT_WEEK_COUNT });
  protected readonly createForm = form(this.createModel, path => {
    required(path.name);
    maxLength(path.name, SEASON_NAME_MAX_LENGTH);
    required(path.weekCount);
    min(path.weekCount, MIN_WEEK_COUNT);
    max(path.weekCount, MAX_WEEK_COUNT);
  });

  // Kept as a plain signal (not part of the Signal Forms schema) since it carries no
  // validation of its own — mirrors the existing signal + valueChange idiom used
  // elsewhere in this codebase (e.g. the gems-tab type filter) rather than forcing a
  // nested string[][] field tree through Signal Forms for no validation benefit.
  protected readonly createWeekActivities = signal<string[][]>(this.rebuildWeekArray(DEFAULT_WEEK_COUNT, []));

  // ─── Edit form ───────────────────────────────────────────────────────────
  protected readonly editModel = signal<SeasonFormValue>({ name: '', weekCount: DEFAULT_WEEK_COUNT });
  protected readonly editForm = form(this.editModel, path => {
    required(path.name);
    maxLength(path.name, SEASON_NAME_MAX_LENGTH);
    required(path.weekCount);
    min(path.weekCount, MIN_WEEK_COUNT);
    max(path.weekCount, MAX_WEEK_COUNT);
    disabled(path.weekCount, { when: () => this.isEditLocked() });
  });

  protected readonly editWeekActivities = signal<string[][]>([]);

  protected readonly getFieldErrorKey = getFieldErrorKey;

  constructor() {
    // Live-resizes each week array whenever the user edits weekCount interactively,
    // preserving already-assigned activities for weeks that still exist.
    effect(() => {
      const weekCount = this.createModel().weekCount;
      this.syncWeekArrayLength(this.createWeekActivities, weekCount);
    });
    effect(() => {
      if (this.isEditLocked()) return;
      const weekCount = this.editModel().weekCount;
      this.syncWeekArrayLength(this.editWeekActivities, weekCount);
    });
  }

  protected setCreateWeekActivityTypes(weekIndex: number, activityTypes: string[]): void {
    this.createWeekActivities.update(weeks => this.replaceWeekAt(weeks, weekIndex, activityTypes));
  }

  protected setEditWeekActivityTypes(weekIndex: number, activityTypes: string[]): void {
    this.editWeekActivities.update(weeks => this.replaceWeekAt(weeks, weekIndex, activityTypes));
  }

  private replaceWeekAt(weeks: string[][], weekIndex: number, activityTypes: string[]): string[][] {
    return weeks.map((week, index) => (index === weekIndex ? activityTypes : week));
  }

  private syncWeekArrayLength(arraySignal: WritableSignal<string[][]>, weekCount: number): void {
    if (!Number.isFinite(weekCount) || weekCount < MIN_WEEK_COUNT) return;
    const current = untracked(arraySignal);
    if (current.length === weekCount) return;

    const existing = this.currentAssignments(current);
    arraySignal.set(this.rebuildWeekArray(weekCount, existing));
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
    this.createModel.set({ name: '', weekCount: DEFAULT_WEEK_COUNT });
    this.createWeekActivities.set(this.rebuildWeekArray(DEFAULT_WEEK_COUNT, []));
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
    if (this.createForm().invalid()) return;
    const startDate = this.suggestedStartDate();
    if (!startDate) return;

    const { name, weekCount } = this.createModel();
    const request: CreateSeasonRequest = {
      name: name.trim(),
      startDate,
      weekCount,
      weekActivities: this.currentAssignments(this.createWeekActivities()),
    };

    const { season, error } = await this.seasonService.createSeason(request);
    if (error || !season) {
      this.snackbarService.error(error ?? this.translate.instant('superAdmin.seasons.createFailed'));
      return;
    }

    this.snackbarService.success(this.translate.instant('common.created'));
    this.seasonsResource.reload();
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
    this.editingSeasonId.set(season.id);
    this.editModel.set({ name: season.name, weekCount: season.weekCount });
    this.editWeekActivities.set(this.rebuildWeekArray(season.weekCount, season.weekActivities));
  }

  protected cancelEdit(): void {
    this.editingSeasonId.set(null);
  }

  protected async saveEdit(season: SeasonWithWeeks): Promise<void> {
    if (this.editForm().invalid()) return;
    const { name, weekCount } = this.editModel();
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
    this.seasonsResource.reload();
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
      weekActivities: this.currentAssignments(this.editWeekActivities()),
    };
    const { error } = await this.seasonService.updateSeasonStructure(request);
    if (error) {
      this.snackbarService.error(error);
      return;
    }

    this.snackbarService.success(this.translate.instant('common.saved'));
    this.seasonsResource.reload();
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
    this.seasonsResource.reload();
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

  private currentAssignments(weekActivities: string[][]): WeekActivityAssignment[] {
    return weekActivities.flatMap((activityTypes, index) =>
      activityTypes.map(activityType => ({ weekIndex: index + 1, activityType }))
    );
  }

  private rebuildWeekArray(weekCount: number, existing: WeekActivityAssignment[]): string[][] {
    if (!Number.isFinite(weekCount) || weekCount < MIN_WEEK_COUNT) return [];
    const grouped = new Map<number, string[]>();
    for (const assignment of existing) {
      grouped.set(assignment.weekIndex, [...(grouped.get(assignment.weekIndex) ?? []), assignment.activityType]);
    }
    const result: string[][] = [];
    for (let weekIndex = 1; weekIndex <= weekCount; weekIndex++) {
      result.push(grouped.get(weekIndex) ?? []);
    }
    return result;
  }
}
