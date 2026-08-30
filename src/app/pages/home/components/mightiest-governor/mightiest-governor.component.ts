import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MgEventService } from '@app/core/services/mg-event.service';
import { AuthService } from '@app/core/services/auth.service';
import { SnackbarService } from '@app/core/services';
import { MgEventCardComponent } from './components/mg-event-card/mg-event-card.component';
import type { MgEvent, MgRegistration, MgSelectionWithUser, ServerMgSlotConfig } from '@shared/models';
import { buildMgSlotRows } from '@shared/utils/mg-slot.util';

interface GovernorSlot {
  rankLabel: string;
  medal: number;
  cost: number;
  targetLabel: string;
}

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

  protected readonly slotConfig = signal<ServerMgSlotConfig[]>([]);

  readonly slots = computed<GovernorSlot[]>(() =>
    buildMgSlotRows(this.slotConfig()).map(row => ({
      rankLabel: row.rankLabel,
      medal: row.medal,
      cost: row.cost,
      targetLabel: row.targetMin === row.targetMax ? `${row.targetMin}M` : `${row.targetMin}M-${row.targetMax}M`,
    }))
  );

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

    const [event, slotConfig] = await Promise.all([
      this.mgEventService.loadCurrentEvent(serverId),
      this.mgEventService.loadSlotConfig(serverId),
    ]);
    this.mgEvent.set(event);
    this.slotConfig.set(slotConfig);

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
