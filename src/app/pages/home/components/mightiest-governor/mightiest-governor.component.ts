import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MgEventService } from '@app/core/services/mg-event.service';
import { AuthService } from '@app/core/services/auth.service';
import { SnackbarService } from '@app/core/services';
import { MgEventCardComponent } from './components/mg-event-card/mg-event-card.component';
import type {
  MgEvent,
  MgRegistration,
  MgSelectionWithUser,
  RegisterMgPlayerPayload,
  ServerMgSlotConfig,
} from '@shared/models';
import { buildMgSlotRows, resolveSlotForRank, type MgSlotRow } from '@shared/utils/mg-slot.util';

/**
 * One row of the unified MG table. Before a selection is published the rows are
 * the slot-cost ranges (one per range, no player); once published they are the
 * assigned players (one per rank) with the range columns populated only on the
 * first row of each range (`isGroupStart`) so each range reads as one block.
 */
interface GovernorRow {
  key: string;
  isGroupStart: boolean;
  rankLabel: string | null;
  playerName: string | null;
  isCurrentUser: boolean;
  medal: number | null;
  cost: number | null;
  targetLabel: string | null;
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

  /** Fully-resolved slot rows (defaults merged with server overrides), shared by the
   * config table here and the selection list in the child event card. */
  readonly slotRows = computed<MgSlotRow[]>(() => buildMgSlotRows(this.slotConfig()));

  protected readonly mgEvent = signal<MgEvent | null>(null);
  protected readonly registration = signal<MgRegistration | null>(null);
  protected readonly selection = signal<MgSelectionWithUser[]>([]);
  protected readonly isRegistering = signal(false);

  protected readonly currentUserId = computed(() => this.authService.getUserId() ?? '');

  // The bottom event card now only carries the sign-up form (registration_open) and a
  // brief "closed, awaiting selection" notice (registration_closed). Once a selection is
  // published / the event is ongoing or finished, the main table says everything, so the
  // card is hidden.
  protected readonly showEventCard = computed(() => {
    const status = this.mgEvent()?.status;
    return status === 'registration_open' || status === 'registration_closed';
  });

  /** Selected (named) players for the current event, sorted by rank. */
  private readonly selectedPlayers = computed(() =>
    this.selection()
      .filter(s => s.selection_type === 'selected')
      .sort((a, b) => a.rank - b.rank)
  );

  /** Everything that occupies a ranked row — real players plus empty placeholder
   * slots (from a correction) — sorted by rank, so the displayed ranks read
   * correctly even when a vacant slot sits between players. */
  private readonly placedRows = computed(() =>
    this.selection()
      .filter(s => s.selection_type === 'selected' || s.selection_type === 'empty')
      .sort((a, b) => a.rank - b.rank)
  );

  /** A published player list exists once at least one player is assigned a slot. */
  readonly isPublished = computed(() => this.selectedPlayers().length > 0);

  /**
   * Full-FFA: admins never published a list and the failsafe started the event
   * anyway, so it's a free-for-all for everyone. Per migration 28 the data shape
   * is "selection published, but no selection rows" — a published timestamp with
   * an empty selection. Distinct from off-week/awaiting, which have no timestamp.
   */
  readonly isFullFfa = computed(() => this.mgEvent()?.selection_published_at != null && this.selection().length === 0);

  /**
   * Rows of the single MG table. Unpublished: the slot-cost ranges (reference
   * table, as before). Published: the assigned players, with range columns shown
   * only on the first row of each range so each range reads as one block.
   */
  readonly rows = computed<GovernorRow[]>(() => (this.isPublished() ? this.buildPlayerRows() : this.buildSlotRows()));

  private buildSlotRows(): GovernorRow[] {
    return this.slotRows().map(row => ({
      key: row.rankLabel,
      isGroupStart: true,
      rankLabel: row.rankLabel,
      playerName: null,
      isCurrentUser: false,
      medal: row.medal,
      cost: row.cost,
      targetLabel: this.formatTarget(row),
    }));
  }

  private buildPlayerRows(): GovernorRow[] {
    const rows = this.slotRows();
    let previousLabel: string | null = null;

    return this.placedRows().map(row => {
      const slot = resolveSlotForRank(row.rank, rows);
      const rankLabel = slot?.rankLabel ?? String(row.rank);
      const isGroupStart = rankLabel !== previousLabel;
      previousLabel = rankLabel;

      // Empty placeholder slots show their label (default "Empty") and are never
      // flagged as the current user.
      const isEmpty = row.selection_type === 'empty';
      return {
        key: 'p-' + row.rank,
        isGroupStart,
        rankLabel: isGroupStart ? rankLabel : null,
        playerName: isEmpty ? (row.label ?? null) : (row.user_profiles?.display_name ?? null),
        isCurrentUser: !isEmpty && row.user_id === this.currentUserId(),
        medal: isGroupStart ? (slot?.medal ?? null) : null,
        cost: isGroupStart ? (slot?.cost ?? null) : null,
        targetLabel: isGroupStart ? this.formatTarget(slot) : null,
      };
    });
  }

  /** Number of unassigned (FFA) slots: capacity minus assigned players. */
  readonly ffaCount = computed(() => this.selection().filter(s => s.selection_type === 'ffa').length);

  /**
   * The score an FFA player must not exceed. To keep a buffer below the lowest
   * assigned slot, we take the targetMax of the range one step BELOW the first
   * open slot (rank = assignedCount + 1). E.g. 15 assigned → first open is rank
   * 16 (range 16-25) → the range below is 26-50 → cap 15M. Null when there is no
   * lower range (every rank filled) or no slot config.
   */
  readonly ffaTargetCap = computed<number | null>(() => {
    const rows = this.slotRows();
    const firstOpen = resolveSlotForRank(this.selectedPlayers().length + 1, rows);
    if (!firstOpen) return null;
    const belowIndex = rows.findIndex(r => r.slotOrder === firstOpen.slotOrder) + 1;
    const buffered = rows[belowIndex] ?? firstOpen; // no lower range → fall back to the open slot itself
    return buffered.targetMax;
  });

  /** The medal/cost toggle only exists once a list is published; unpublished the
   * columns are the whole point of the table and are always shown. */
  readonly canToggleMedalCost = computed(() => this.isPublished());

  /** User's manual override, honoured only while the toggle exists (published). */
  private readonly medalCostUserToggled = signal<boolean | null>(null);

  // Unpublished: always shown (no toggle). Published: user choice, defaulting to hidden.
  readonly showMedalCost = computed(() => (this.canToggleMedalCost() ? (this.medalCostUserToggled() ?? false) : true));

  toggleMedalCost(): void {
    const current = this.showMedalCost();
    this.medalCostUserToggled.set(!current);
  }

  private formatTarget(slot: MgSlotRow | undefined): string | null {
    if (!slot) return null;
    return slot.targetMin === slot.targetMax ? `${slot.targetMin}M` : `${slot.targetMin}M-${slot.targetMax}M`;
  }

  trackByRow(_: number, row: GovernorRow): string {
    return row.key;
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

  protected async onRegister(payload: RegisterMgPlayerPayload): Promise<void> {
    const event = this.mgEvent();
    const userId = this.authService.getUserId();
    if (!event || !userId) return;

    // Registration is only accepted while the window is actually open. The form is
    // already hidden otherwise, but guard the action too so a stale view, a double
    // submit, or a programmatic call can't slip a sign-up past a closed window.
    if (event.status !== 'registration_open') return;

    this.isRegistering.set(true);
    try {
      const { error } = await this.mgEventService.registerPlayer(event.id, userId, payload);
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
