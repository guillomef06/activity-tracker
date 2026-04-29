import { Component, ChangeDetectionStrategy, input, output, computed } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule } from '@ngx-translate/core';
import type { MgEvent, MgRegistration, MgSelectionWithUser } from '@shared/models';

@Component({
  selector: 'app-mg-event-card',
  imports: [DatePipe, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule, MatDividerModule, TranslateModule],
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

  readonly register = output<void>();
  readonly unregister = output<void>();

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
    this.register.emit();
  }

  onUnregister(): void {
    this.unregister.emit();
  }
}
