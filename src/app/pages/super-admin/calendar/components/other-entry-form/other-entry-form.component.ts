import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { form, FormField, maxLength, required, validate } from '@angular/forms/signals';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { TranslateModule } from '@ngx-translate/core';

import type { CalendarEntryType, OtherEntryInput } from '@shared/models';
import {
  convertUtcInputKind,
  endInputToIso,
  isoToEndInput,
  isoToUtcInput,
  utcInputToIso,
} from '@shared/utils/calendar-datetime.util';
import { getFieldErrorKey } from '@shared/utils/form-validation.utils';

export const OTHER_ENTRY_TITLE_MAX_LENGTH = 100;
const END_AFTER_START_ERROR_KIND = 'endsAfterStart';
const ERROR_KEYS: Record<string, string> = {
  [END_AFTER_START_ERROR_KIND]: 'superAdmin.calendar.errors.endsAfterStart',
};

type OtherEntryType = Exclude<CalendarEntryType, 'mg'>;

/** Form model: `startsAt` / `endsAt` hold UTC input strings (date or datetime-local). */
export interface OtherEntryFormValue {
  type: OtherEntryType;
  title: string;
  allDay: boolean;
  startsAt: string;
  endsAt: string;
}

const EMPTY_FORM_VALUE: OtherEntryFormValue = {
  type: 'pvp',
  title: '',
  allDay: false,
  startsAt: '',
  endsAt: '',
};

/** Pure: form value (UTC inputs) to payload (all-day end input = last included day); `null` when a date is missing or unparsable. */
export function toOtherEntryInput(value: OtherEntryFormValue): OtherEntryInput | null {
  const startsAt = utcInputToIso(value.startsAt, value.allDay);
  const endsAt = endInputToIso(value.endsAt, value.allDay);
  if (startsAt === null || endsAt === null) {
    return null;
  }
  return { type: value.type, title: value.title.trim(), starts_at: startsAt, ends_at: endsAt, all_day: value.allDay };
}

/** Pure: stored entry to form value, dates shown in UTC. */
export function toOtherEntryFormValue(input: OtherEntryInput | null): OtherEntryFormValue {
  if (input === null) {
    return EMPTY_FORM_VALUE;
  }
  return {
    type: input.type,
    title: input.title,
    allDay: input.all_day,
    startsAt: isoToUtcInput(input.starts_at, input.all_day),
    endsAt: isoToEndInput(input.ends_at, input.all_day),
  };
}

/** Dumb form for non-MG calendar entries (Signal Forms); dates are entered and stored in UTC. */
@Component({
  selector: 'app-other-entry-form',
  imports: [
    FormField,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    TranslateModule,
  ],
  templateUrl: './other-entry-form.component.html',
  styleUrl: './other-entry-form.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OtherEntryFormComponent {
  readonly initial = input<OtherEntryInput | null>(null);
  readonly busy = input(false);

  readonly saved = output<OtherEntryInput>();
  readonly cancelled = output<void>();

  protected readonly titleMaxLength = OTHER_ENTRY_TITLE_MAX_LENGTH;

  private readonly model = signal<OtherEntryFormValue>(EMPTY_FORM_VALUE);

  protected readonly entryForm = form(this.model, path => {
    required(path.title);
    maxLength(path.title, OTHER_ENTRY_TITLE_MAX_LENGTH);
    validate(path.title, ({ value }) => (value().trim() === '' ? { kind: 'required' } : null));
    required(path.startsAt);
    required(path.endsAt);
    validate(path.endsAt, ({ value, valueOf }) => {
      const allDay = valueOf(path.allDay);
      const start = utcInputToIso(valueOf(path.startsAt), allDay);
      const end = endInputToIso(value(), allDay);
      return start !== null && end !== null && Date.parse(end) <= Date.parse(start)
        ? { kind: END_AFTER_START_ERROR_KIND }
        : null;
    });
  });

  protected readonly isAllDay = computed(() => this.model().allDay);
  protected readonly titleErrorKey = computed(() => getFieldErrorKey(this.entryForm.title().errors(), ERROR_KEYS));
  protected readonly startsAtErrorKey = computed(() =>
    getFieldErrorKey(this.entryForm.startsAt().errors(), ERROR_KEYS)
  );
  protected readonly endsAtErrorKey = computed(() => getFieldErrorKey(this.entryForm.endsAt().errors(), ERROR_KEYS));

  constructor() {
    effect(() => {
      const initial = this.initial();
      untracked(() => this.model.set(toOtherEntryFormValue(initial)));
    });
  }

  /** Keeps the entered UTC day when the toggle flips, so the inputs never show an invalid value. */
  protected onAllDayChange(checked: boolean): void {
    this.model.update(value => ({
      ...value,
      allDay: checked,
      startsAt: convertUtcInputKind(value.startsAt, checked),
      endsAt: convertUtcInputKind(value.endsAt, checked),
    }));
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.busy()) {
      return;
    }
    const payload = this.entryForm().invalid() ? null : toOtherEntryInput(this.model());
    if (payload === null) {
      this.entryForm().markAsTouched();
      return;
    }
    this.saved.emit(payload);
  }
}
