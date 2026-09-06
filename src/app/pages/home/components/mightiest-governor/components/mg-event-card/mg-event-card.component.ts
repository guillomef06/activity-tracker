import { Component, ChangeDetectionStrategy, input, output, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { form, required, maxLength, validate, FormField } from '@angular/forms/signals';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TranslateModule } from '@ngx-translate/core';
import { MG_SLOT_DEFAULTS } from '@shared/constants/mg-slots.constant';
import { getFieldErrorKey } from '@shared/utils/form-validation.utils';
import type { MgEvent, MgRegistration, MgSelectionWithUser, RegisterMgPlayerPayload } from '@shared/models';

/** Max length of the optional free-text comment a player can attach to their registration. */
const COMMENT_MAX_LENGTH = 200;

interface RegistrationFormModel {
  desired_slot_order: number | null;
  comment: string;
}

const DEFAULT_REGISTRATION_FORM_MODEL: RegistrationFormModel = {
  desired_slot_order: null,
  comment: '',
};

@Component({
  selector: 'app-mg-event-card',
  imports: [
    DatePipe,
    FormField,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    TranslateModule,
  ],
  templateUrl: './mg-event-card.component.html',
  styleUrl: './mg-event-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MgEventCardComponent {
  readonly mgEvent = input.required<MgEvent>();
  readonly registration = input<MgRegistration | null>(null);
  readonly selection = input<MgSelectionWithUser[]>([]);
  readonly currentUserId = input.required<string>();
  readonly isRegistering = input(false);

  readonly register = output<RegisterMgPlayerPayload>();
  readonly unregister = output<void>();

  protected readonly commentMaxLength = COMMENT_MAX_LENGTH;
  protected readonly slotOptions = MG_SLOT_DEFAULTS;

  protected readonly registrationModel = signal<RegistrationFormModel>(DEFAULT_REGISTRATION_FORM_MODEL);

  protected readonly registrationForm = form(this.registrationModel, path => {
    required(path.desired_slot_order);
    validate(path.desired_slot_order, ({ value }) => {
      const slotOrder = value();
      if (slotOrder === null) return null;
      return MG_SLOT_DEFAULTS.some(slot => slot.slotOrder === slotOrder) ? null : { kind: 'positionInvalid' };
    });
    maxLength(path.comment, COMMENT_MAX_LENGTH);
  });

  protected readonly positionError = computed(() =>
    this.registrationForm.desired_slot_order().touched()
      ? getFieldErrorKey(this.registrationForm.desired_slot_order().errors(), {
          positionInvalid: 'mg.registration.positionInvalid',
        })
      : ''
  );

  protected readonly commentError = computed(() =>
    this.registrationForm.comment().touched() ? getFieldErrorKey(this.registrationForm.comment().errors()) : ''
  );

  readonly isRegistered = computed(() => this.registration() !== null);

  readonly isSelected = computed(() => {
    const uid = this.currentUserId();
    return this.selection().some(s => s.user_id === uid && s.selection_type === 'selected');
  });

  readonly selectedPlayers = computed(() => this.selection().filter(s => s.selection_type === 'selected'));

  readonly ffaCount = computed(() => this.selection().filter(s => s.selection_type === 'ffa').length);

  readonly showRegistrationActions = computed(() => this.mgEvent().status === 'registration_open');

  readonly showWaiting = computed(() => this.mgEvent().status === 'registration_closed');

  readonly showSelection = computed(() => {
    const s = this.mgEvent().status;
    return s === 'selection_published' || s === 'ongoing' || s === 'finished';
  });

  readonly isFullFfa = computed(
    () => this.showSelection() && this.mgEvent().selection_published_at !== null && this.selection().length === 0
  );

  onRegister(): void {
    if (this.registrationForm().invalid()) {
      this.registrationForm().markAsTouched();
      return;
    }

    const { desired_slot_order, comment } = this.registrationModel();
    if (desired_slot_order === null) return;

    this.register.emit({ desired_slot_order, comment: comment.trim() === '' ? null : comment.trim() });
  }

  onUnregister(): void {
    this.unregister.emit();
  }
}
