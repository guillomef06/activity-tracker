import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MgEventService } from '@app/core/services/mg-event.service';
import { AuthService } from '@app/core/services/auth.service';
import { SnackbarService } from '@app/core/services';
import { MgEventCardComponent } from './components/mg-event-card/mg-event-card.component';
import type { MgEvent, MgRegistration, MgSelectionWithUser } from '@shared/models';

interface GovernorSlot {
  rankLabel: string;
  medal: number;
  cost: number;
  targetLabel: string;
}

// [rankLabel, medal, cost, targetMin, targetMax] — scores in millions
const SLOTS_DATA: [string, number, number, number, number][] = [
  ['1', 100, 150, 30, 30],
  ['2', 80, 140, 29, 29],
  ['3', 60, 130, 28, 28],
  ['4', 40, 120, 27, 27],
  ['5', 30, 100, 26, 26],
  ['6-7', 20, 90, 24, 26],
  ['8-10', 15, 80, 22, 24],
  ['11-15', 12, 75, 20, 22],
  ['16-25', 10, 70, 15, 20],
  ['26-50', 5, 60, 10, 15],
];

@Component({
  selector: 'app-mightiest-governor',
  imports: [MatCardModule, MatIconModule, MatDividerModule, TranslateModule, MgEventCardComponent],
  templateUrl: './mightiest-governor.component.html',
  styleUrl: './mightiest-governor.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MightiestGovernorComponent implements OnInit {
  private readonly mgEventService = inject(MgEventService);
  private readonly authService = inject(AuthService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translate = inject(TranslateService);

  readonly slots: GovernorSlot[] = SLOTS_DATA.map(([rankLabel, medal, cost, targetMin, targetMax]) => ({
    rankLabel,
    medal,
    cost,
    targetLabel: targetMin === targetMax ? `${targetMin}M` : `${targetMin}M-${targetMax}M`,
  }));

  protected readonly mgEvent = signal<MgEvent | null>(null);
  protected readonly registration = signal<MgRegistration | null>(null);
  protected readonly selection = signal<MgSelectionWithUser[]>([]);
  protected readonly isRegistering = signal(false);

  protected readonly currentUserId = computed(() => this.authService.getUserId() ?? '');

  protected readonly showEventCard = computed(() => {
    const ev = this.mgEvent();
    return ev !== null && ev.status !== 'upcoming';
  });

  trackByRank(_: number, slot: GovernorSlot): string {
    return slot.rankLabel;
  }

  async ngOnInit(): Promise<void> {
    const serverId = this.authService.getServerId();
    if (!serverId) return;

    const event = await this.mgEventService.loadCurrentEvent(serverId);
    this.mgEvent.set(event);

    if (!event) return;

    const userId = this.authService.getUserId();
    if (userId) {
      const reg = await this.mgEventService.loadUserRegistration(event.id, userId);
      this.registration.set(reg);
    }

    const showStatuses: MgEvent['status'][] = ['selection_published', 'ongoing', 'finished'];
    if (showStatuses.includes(event.status)) {
      const sel = await this.mgEventService.loadSelection(event.id);
      this.selection.set(sel);
    }
  }

  protected async onRegister(): Promise<void> {
    const event = this.mgEvent();
    const userId = this.authService.getUserId();
    if (!event || !userId) return;

    this.isRegistering.set(true);
    try {
      const { error } = await this.mgEventService.registerPlayer(event.id, userId);
      if (error) throw error;
      const reg = await this.mgEventService.loadUserRegistration(event.id, userId);
      this.registration.set(reg);
      this.snackbarService.success(this.translate.instant('mg.registration.registerSuccess'));
    } catch {
      this.snackbarService.error(this.translate.instant('mg.registration.registerError'));
    } finally {
      this.isRegistering.set(false);
    }
  }

  protected async onUnregister(): Promise<void> {
    const event = this.mgEvent();
    const userId = this.authService.getUserId();
    if (!event || !userId) return;

    this.isRegistering.set(true);
    try {
      const { error } = await this.mgEventService.unregisterPlayer(event.id, userId);
      if (error) throw error;
      this.registration.set(null);
      this.snackbarService.success(this.translate.instant('mg.registration.unregisterSuccess'));
    } catch {
      this.snackbarService.error(this.translate.instant('mg.registration.unregisterError'));
    } finally {
      this.isRegistering.set(false);
    }
  }
}
