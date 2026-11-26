import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { form, FormField, hidden, max, min, required, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerInputEvent, MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatStepperModule } from '@angular/material/stepper';
import { TranslateModule } from '@ngx-translate/core';

import { MG_CALENDAR_MAX_SERIES_WEEKS, MG_CALENDAR_MIN_SERIES_WEEKS } from '@shared/constants/mg-calendar.constant';
import type {
  CreateEntryResult,
  CreateOutcome,
  IsoDate,
  MgDerivedDates,
  MgEntryLike,
} from '@shared/models/calendar-entry.model';
import { FieldValidationError, getFieldErrorKey } from '@shared/utils/form-validation.utils';
import {
  buildMgSeries,
  classifyMgDates,
  isLocalMonday,
  reanchorToUtcMidnight,
  toIsoDate,
  validateSeriesWeeks,
} from '@shared/utils/mg-calendar.util';

const DEFAULT_SERIES_WEEKS = 4;
const STEP_DATES = 0;
const STEP_PREVIEW = 1;
const STEP_RESULT = 2;

const WEEKS_ERROR_KEYS: Record<string, string> = {
  evenWeeks: 'superAdmin.calendar.errors.weeksEven',
  min: 'superAdmin.calendar.errors.weeksRange',
  max: 'superAdmin.calendar.errors.weeksRange',
};
const OPENING_ERROR_KEYS: Record<string, string> = {
  notMonday: 'superAdmin.calendar.errors.notMonday',
};

type OutcomeTone = 'success' | 'neutral' | 'error';

interface OutcomeView {
  readonly labelKey: string;
  readonly tone: OutcomeTone;
  readonly icon: string;
}

/** Literal keys (not built dynamically) so the i18n check finds every one of them. */
const OUTCOME_VIEWS: Readonly<Record<CreateOutcome, OutcomeView>> = {
  created: { labelKey: 'superAdmin.calendar.wizard.outcome.created', tone: 'success', icon: 'check_circle' },
  already_exists: {
    labelKey: 'superAdmin.calendar.wizard.outcome.alreadyExists',
    tone: 'neutral',
    icon: 'info',
  },
  rejected_not_monday: {
    labelKey: 'superAdmin.calendar.wizard.outcome.rejectedNotMonday',
    tone: 'error',
    icon: 'block',
  },
  rejected_opening_passed: {
    labelKey: 'superAdmin.calendar.wizard.outcome.rejectedOpeningPassed',
    tone: 'error',
    icon: 'block',
  },
  rejected_too_close: {
    labelKey: 'superAdmin.calendar.wizard.outcome.rejectedTooClose',
    tone: 'error',
    icon: 'block',
  },
};

interface WizardFormValue {
  openingMonday: Date | null;
  duplicate: boolean;
  weeks: number;
}

interface PreviewRow {
  readonly dates: MgDerivedDates;
  readonly isCreated: boolean;
  readonly outcome: OutcomeView;
}

interface ResultRow {
  readonly key: string;
  readonly opening: IsoDate;
  readonly start: IsoDate;
  readonly outcome: OutcomeView;
}

interface FieldStateLike {
  touched(): boolean;
  invalid(): boolean;
  errors(): readonly FieldValidationError[];
}

/** Error key of a field once the user has interacted with it, '' otherwise. */
function visibleErrorKey(state: FieldStateLike, customKeys: Record<string, string>): string {
  return state.touched() && state.invalid() ? getFieldErrorKey(state.errors(), customKeys) : '';
}

/**
 * Dumb assistant to create / duplicate MG entries: dates, preview, result. It never writes:
 * the smart page calls the service with `submitted` and feeds `results` back.
 */
@Component({
  selector: 'app-mg-entry-wizard',
  imports: [
    DatePipe,
    FormField,
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatStepperModule,
    TranslateModule,
  ],
  templateUrl: './mg-entry-wizard.component.html',
  styleUrl: './mg-entry-wizard.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MgEntryWizardComponent {
  readonly existing = input.required<readonly MgEntryLike[]>();
  readonly today = input.required<IsoDate>();
  readonly results = input<readonly CreateEntryResult[] | null>(null);
  readonly busy = input(false);

  /** Opening Mondays of the entries classified `created`, the only ones worth sending. */
  readonly submitted = output<IsoDate[]>();
  readonly closed = output<void>();

  protected readonly minWeeks = MG_CALENDAR_MIN_SERIES_WEEKS;
  protected readonly maxWeeks = MG_CALENDAR_MAX_SERIES_WEEKS;
  protected readonly stepIndex = signal(STEP_DATES);
  protected readonly mondayFilter = isLocalMonday;

  protected readonly wizardModel = signal<WizardFormValue>({
    openingMonday: null,
    duplicate: false,
    weeks: DEFAULT_SERIES_WEEKS,
  });

  protected readonly wizardForm = form(this.wizardModel, path => {
    required(path.openingMonday);
    validate(path.openingMonday, ({ value }) =>
      value() === null || isLocalMonday(value()) ? null : { kind: 'notMonday' }
    );

    hidden(path.weeks, ({ valueOf }) => !valueOf(path.duplicate));
    required(path.weeks);
    min(path.weeks, MG_CALENDAR_MIN_SERIES_WEEKS);
    max(path.weeks, MG_CALENDAR_MAX_SERIES_WEEKS);
    validate(path.weeks, ({ value }) => {
      const current = value();
      const isNumber = typeof current === 'number' && Number.isFinite(current);
      return isNumber && validateSeriesWeeks(current) === 'not_even' ? { kind: 'evenWeeks' } : null;
    });
  });

  protected readonly isDuplicate = computed(() => this.wizardModel().duplicate);
  protected readonly openingErrorKey = computed(() =>
    visibleErrorKey(this.wizardForm.openingMonday(), OPENING_ERROR_KEYS)
  );
  protected readonly weeksErrorKey = computed(() => visibleErrorKey(this.wizardForm.weeks(), WEEKS_ERROR_KEYS));

  /** UTC calendar day of the picked Monday, re-anchored whatever the browser time zone (FR-041). */
  private readonly openingIso = computed<IsoDate | null>(() => {
    const picked = this.wizardModel().openingMonday;
    return picked === null ? null : toIsoDate(reanchorToUtcMidnight(picked));
  });

  protected readonly previewRows = computed<PreviewRow[]>(() => {
    const opening = this.openingIso();
    if (opening === null || this.wizardForm().invalid()) return [];
    const { duplicate, weeks } = this.wizardModel();
    const series = buildMgSeries(opening, duplicate ? weeks : null);
    return classifyMgDates(series, this.existing(), this.today()).map(({ dates, outcome }) => ({
      dates,
      isCreated: outcome === 'created',
      outcome: OUTCOME_VIEWS[outcome],
    }));
  });

  private readonly createdOpenings = computed<IsoDate[]>(() =>
    this.previewRows()
      .filter(row => row.isCreated)
      .map(row => row.dates.opening)
  );

  protected readonly canConfirm = computed(() => this.createdOpenings().length > 0 && !this.busy());

  protected readonly resultRows = computed<ResultRow[]>(() =>
    (this.results() ?? []).map(result => ({
      key: result.opening_monday,
      opening: result.opening_monday,
      start: result.mg_start,
      outcome: OUTCOME_VIEWS[result.outcome],
    }))
  );

  constructor() {
    effect(() => {
      if (this.results() !== null) this.stepIndex.set(STEP_RESULT);
    });
  }

  /**
   * The datepicker input is bound by value, not `[formField]`: its `Date | null` typing is
   * not accepted by the Signal Forms directive. The field still owns validation and state.
   */
  protected onOpeningMondayChange(event: MatDatepickerInputEvent<Date>): void {
    this.wizardModel.update(model => ({ ...model, openingMonday: event.value }));
    this.wizardForm.openingMonday().markAsTouched();
  }

  protected goToPreview(): void {
    if (this.wizardForm().invalid()) {
      this.wizardForm().markAsTouched();
      return;
    }
    this.stepIndex.set(STEP_PREVIEW);
  }

  protected goToDates(): void {
    this.stepIndex.set(STEP_DATES);
  }

  protected confirm(): void {
    if (!this.canConfirm()) return;
    this.submitted.emit(this.createdOpenings());
  }

  protected close(): void {
    this.closed.emit();
  }
}
