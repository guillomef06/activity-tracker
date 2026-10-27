import {
  Component,
  ChangeDetectionStrategy,
  inject,
  input,
  output,
  signal,
  computed,
  linkedSignal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import { DragDropModule, moveItemInArray, type CdkDragDrop } from '@angular/cdk/drag-drop';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MgEventService } from '@app/core/services/mg-event.service';
import { SnackbarService } from '@app/core/services';
import {
  buildSelectionPayload,
  EMPTY_SLOT_PREFIX,
  isEmptySlotId,
  DEFAULT_EMPTY_LABEL,
} from '@shared/utils/mg-selection.util';
import { resolveSlotForRank, type MgSlotRow } from '@shared/utils/mg-slot.util';
import { MG_SLOT_DEFAULTS } from '@shared/constants/mg-slots.constant';
import type {
  MgAssignmentMode,
  MgEvent,
  MgLeaderboardEntry,
  MgRegistrationWithUser,
  MgSelectedBy,
  MgSelectionWithUser,
} from '@shared/models';

/**
 * - `draft`: selection not published yet, freely editable, then published.
 * - `correction`: event finished, selection can still be reordered after the fact
 *   (players sometimes don't follow the planned order); costs are recalculated.
 * - `locked`: published or in progress, read-only.
 */
export type MgSelectionPanelKind = 'draft' | 'correction' | 'locked';

interface DraftRow {
  /** Real userId, or an EMPTY_SLOT_PREFIX sentinel for a placeholder slot. */
  id: string;
  isEmpty: boolean;
  userId: string | null;
  rank: number;
  displayName: string;
  totalScore: number;
  slotLabel: string | null;
  cost: number;
  /** Approved slot label (e.g. "6-7") for a real player with a published baseline. */
  approvedSlotLabel: string | null;
  /** True when this player's current rank differs from their approved rank (move happened). */
  canForgive: boolean;
  /** Whether this player's move is currently forgiven (billed at approved cost). */
  forgiven: boolean;
  /** For an empty slot: true when the typed label matches an existing player's name
   * (they should be added from the pool instead of typed as a placeholder). */
  nameCollision: boolean;
  isFirst: boolean;
  isLast: boolean;
}

/** A server member who can be placed in a corrected selection even without having registered. */
export interface MgMemberOption {
  userId: string;
  displayName: string;
}

interface AvailableRow {
  userId: string;
  displayName: string;
  totalScore: number;
  isRegistered: boolean;
  positionLabel: string | null;
  comment: string | null;
}

interface LockedRow {
  id: string;
  rank: number;
  displayName: string;
}

@Component({
  selector: 'app-mg-selection-panel',
  imports: [
    DatePipe,
    DragDropModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatTooltipModule,
    TranslateModule,
  ],
  templateUrl: './mg-selection-panel.component.html',
  styleUrl: './mg-selection-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MgSelectionPanelComponent {
  private readonly mgEventService = inject(MgEventService);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translate = inject(TranslateService);

  readonly event = input.required<MgEvent>();
  readonly kind = input.required<MgSelectionPanelKind>();
  readonly registrations = input.required<readonly MgRegistrationWithUser[]>();
  /**
   * Every server member. Only offered in `correction`: a player who slipped into the ranking
   * without registering (and so broke the rules) still has to be recorded and charged.
   */
  readonly members = input<readonly MgMemberOption[]>([]);
  readonly selection = input.required<readonly MgSelectionWithUser[]>();
  readonly capacity = input.required<number>();
  readonly assignmentMode = input.required<MgAssignmentMode>();
  readonly slotRows = input.required<readonly MgSlotRow[]>();
  readonly dkpEnabled = input(false);
  /** userId -> current leaderboard total, shown as a hint when picking players. */
  readonly totalScores = input<ReadonlyMap<string, number>>(new Map());

  /** The saved selection changed: the parent must reload it. */
  readonly selectionSaved = output<void>();
  /** The selection was published: the parent must reload the event. */
  readonly published = output<void>();

  protected readonly isSaving = signal(false);
  protected readonly isPublishing = signal(false);

  // The placed order interleaves real players and empty placeholder slots by rank.
  // Empty rows become EMPTY_SLOT_PREFIX sentinels keyed the same way emptyLabels is,
  // so a saved empty slot round-trips with its name.
  private readonly savedOrder = computed<string[]>(() => {
    let emptyIndex = 0;
    return this.selection()
      .filter(row => row.selection_type === 'selected' || row.selection_type === 'empty')
      .sort((a, b) => a.rank - b.rank)
      .flatMap(row => {
        if (row.selection_type === 'empty') return [EMPTY_SLOT_PREFIX + 'saved-' + emptyIndex++];
        return row.user_id ? [row.user_id] : [];
      });
  });

  /** Working copy of the ordered players; resets whenever the saved selection input changes. */
  protected readonly draftOrder = linkedSignal<string[]>(() => this.savedOrder());

  /** Who made the draft: flipped to 'manual' by any edit, back to 'automatic' on generate. */
  private readonly draftSource = linkedSignal<MgSelectedBy>(
    () => this.selection()[0]?.selected_by ?? this.assignmentMode()
  );

  /** Labels for empty placeholder slots (EMPTY_SLOT_PREFIX id → name). Resets with the selection. */
  private readonly emptyLabels = linkedSignal<Map<string, string>>(() => {
    const map = new Map<string, string>();
    this.selection()
      .filter(row => row.selection_type === 'empty')
      .sort((a, b) => a.rank - b.rank)
      .forEach((row, index) => map.set(EMPTY_SLOT_PREFIX + 'saved-' + index, row.label ?? DEFAULT_EMPTY_LABEL));
    return map;
  });

  /** UserIds whose rank change is forgiven (billed at approved cost). Derived from the
   * saved selection: a row already charged at its approved cost (and whose current rank
   * differs from approved) is treated as forgiven so reloading preserves the decision. */
  private readonly forgiven = linkedSignal<Set<string>>(() => {
    const set = new Set<string>();
    for (const row of this.selection()) {
      if (
        row.user_id &&
        row.selection_type === 'selected' &&
        row.approved_cost !== null &&
        row.approved_rank !== null &&
        row.rank !== row.approved_rank &&
        row.cost === row.approved_cost
      ) {
        set.add(row.user_id);
      }
    }
    return set;
  });

  /** Monotonic counter so each freshly-added empty slot gets a unique sentinel id. */
  private readonly nextEmptyId = signal(0);

  // Approved baseline per userId. For events published after migration 46 it's the
  // stamped snapshot; for a legacy event (columns null) we fall back to the player's
  // current saved rank/cost, which on a not-yet-corrected published selection IS the
  // approved list — so forgiveness works on old events too, not just post-migration ones.
  private readonly approvedRankByUserId = computed<Map<string, number>>(() => {
    const map = new Map<string, number>();
    if (!this.isCorrection()) return map; // forgiveness only applies to a finished event's correction
    for (const row of this.selection()) {
      if (!row.user_id || row.selection_type !== 'selected') continue;
      const approved = row.approved_rank ?? row.rank;
      if (approved !== null) map.set(row.user_id, approved);
    }
    return map;
  });

  private readonly approvedCostByUserId = computed<Map<string, number>>(() => {
    const map = new Map<string, number>();
    if (!this.isCorrection()) return map;
    for (const row of this.selection()) {
      if (!row.user_id || row.selection_type !== 'selected') continue;
      const approved = row.approved_cost ?? row.cost;
      if (approved !== null) map.set(row.user_id, approved);
    }
    return map;
  });

  /** UserIds on the original published list. A placed player NOT in this set is an
   * "FFA player" (added during the correction, never approved for a slot). */
  private readonly approvedUserIds = computed<Set<string>>(() => {
    const set = new Set<string>();
    if (!this.isCorrection()) return set;
    for (const row of this.selection()) {
      if (row.user_id && row.selection_type === 'selected') set.add(row.user_id);
    }
    return set;
  });

  protected readonly isEditable = computed(() => this.kind() !== 'locked');
  protected readonly isCorrection = computed(() => this.kind() === 'correction');
  protected readonly showGenerate = computed(() => this.kind() === 'draft' && this.assignmentMode() === 'automatic');

  /** A corrected selection keeps its original size even if the server capacity changed since. */
  protected readonly effectiveCapacity = computed(() =>
    this.isCorrection() && this.selection().length > 0 ? this.selection().length : this.capacity()
  );

  protected readonly titleKey = computed(() =>
    this.isCorrection() ? 'mg.admin.correction.title' : 'mg.admin.selection.title'
  );

  protected readonly lockedMessageKey = computed(() =>
    this.event().status === 'ongoing' ? 'mg.admin.selectionLocked' : 'mg.admin.selectionPublishedLocked'
  );

  private readonly displayNameByUserId = computed<Map<string, string>>(() => {
    const names = new Map<string, string>();
    for (const row of this.selection()) {
      if (row.user_id && row.user_profiles) names.set(row.user_id, row.user_profiles.display_name);
    }
    for (const member of this.members()) names.set(member.userId, member.displayName);
    for (const reg of this.registrations()) names.set(reg.user_id, reg.user_profiles.display_name);
    return names;
  });

  /** Lower-cased known player names (members + registrations), to flag an empty-slot
   * label that collides with a real player — who should be added from the pool instead. */
  private readonly knownPlayerNames = computed<Set<string>>(() => {
    const set = new Set<string>();
    for (const member of this.members()) set.add(member.displayName.trim().toLowerCase());
    for (const reg of this.registrations()) set.add(reg.user_profiles.display_name.trim().toLowerCase());
    return set;
  });

  private readonly draftPayloads = computed(() =>
    buildSelectionPayload(
      this.event().id,
      this.draftOrder(),
      this.effectiveCapacity(),
      this.slotRows(),
      this.draftSource(),
      {
        previous: this.isCorrection() ? this.selection() : [],
        forgiven: this.forgiven(),
        emptyLabels: this.emptyLabels(),
      }
    )
  );

  protected readonly draftRows = computed<DraftRow[]>(() => {
    const order = this.draftOrder();
    // Cost per placed entry, indexed by position (handles empties + duplicate nulls).
    const payloadByRank = new Map(this.draftPayloads().map(p => [p.rank, p]));
    const approvedRanks = this.approvedRankByUserId();
    const approvedCosts = this.approvedCostByUserId();
    const approvedIds = this.approvedUserIds();
    const approvedCount = approvedIds.size;
    const forgiven = this.forgiven();

    return order.map((entry, index) => {
      const rank = index + 1;
      const empty = isEmptySlotId(entry);
      const approvedRank = empty ? null : (approvedRanks.get(entry) ?? null);
      const approvedCost = empty ? null : (approvedCosts.get(entry) ?? null);
      const finalRankCost = resolveSlotForRank(rank, this.slotRows())?.cost ?? 0;
      // An FFA player (not on the original published list) is billed only when they
      // sit above the approved cutoff (rank <= original list size); there, "No penalty"
      // can waive it to 0. A below-cutoff FFA player is free automatically, no toggle.
      const isFfaPlayer = !empty && this.isCorrection() && approvedCount > 0 && !approvedIds.has(entry);
      const canForgive = isFfaPlayer ? rank <= approvedCount : approvedCost !== null && finalRankCost > approvedCost;
      const emptyLabel = empty ? (this.emptyLabels().get(entry) ?? DEFAULT_EMPTY_LABEL) : '';
      return {
        id: entry,
        isEmpty: empty,
        userId: empty ? null : entry,
        rank,
        displayName: empty ? emptyLabel : (this.displayNameByUserId().get(entry) ?? entry),
        totalScore: empty ? 0 : (this.totalScores().get(entry) ?? 0),
        slotLabel: resolveSlotForRank(rank, this.slotRows())?.rankLabel ?? null,
        cost: payloadByRank.get(rank)?.cost ?? 0,
        approvedSlotLabel:
          approvedRank !== null ? (resolveSlotForRank(approvedRank, this.slotRows())?.rankLabel ?? null) : null,
        canForgive,
        forgiven: !empty && forgiven.has(entry),
        nameCollision: empty && this.knownPlayerNames().has(emptyLabel.trim().toLowerCase()),
        isFirst: index === 0,
        isLast: index === order.length - 1,
      };
    });
  });

  protected readonly availableRows = computed<AvailableRow[]>(() => {
    const inDraft = new Set(this.draftOrder());
    const registered: AvailableRow[] = this.registrations()
      .filter(reg => !inDraft.has(reg.user_id))
      .map(reg => ({
        userId: reg.user_id,
        displayName: reg.user_profiles.display_name,
        totalScore: this.totalScores().get(reg.user_id) ?? 0,
        isRegistered: true,
        positionLabel: MG_SLOT_DEFAULTS.find(slot => slot.slotOrder === reg.desired_slot_order)?.rankLabel ?? null,
        comment: reg.comment,
      }));

    return [...registered, ...this.unregisteredRows(inDraft)].sort(
      (a, b) =>
        Number(b.isRegistered) - Number(a.isRegistered) ||
        b.totalScore - a.totalScore ||
        a.displayName.localeCompare(b.displayName)
    );
  });

  /** Free-text filter over the unplaced pool (the pool can be long on big servers). */
  protected readonly poolSearch = signal('');

  protected readonly filteredAvailableRows = computed<AvailableRow[]>(() => {
    const search = this.poolSearch().toLowerCase().trim();
    const rows = this.availableRows();
    if (!search) return rows;
    return rows.filter(row => row.displayName.toLowerCase().includes(search));
  });

  protected readonly availableLabelKey = computed(() =>
    this.isCorrection() ? 'mg.admin.correction.available' : 'mg.admin.selection.available'
  );

  protected readonly noneAvailableKey = computed(() =>
    this.isCorrection() ? 'mg.admin.correction.noneAvailable' : 'mg.admin.selection.noneAvailable'
  );

  protected readonly lockedRows = computed<LockedRow[]>(() =>
    this.selection()
      .filter(row => row.selection_type === 'selected')
      .map(row => ({ id: row.id, rank: row.rank, displayName: row.user_profiles?.display_name ?? '' }))
  );

  protected readonly ffaCount = computed(() => Math.max(0, this.effectiveCapacity() - this.draftOrder().length));
  protected readonly lockedFfaCount = computed(
    () => this.selection().filter(row => row.selection_type === 'ffa').length
  );
  protected readonly isFull = computed(() => this.draftOrder().length >= this.effectiveCapacity());
  protected readonly isOverCapacity = computed(() => this.draftOrder().length > this.effectiveCapacity());

  /** Canonical per-rank signature (user, name, cost) — captures reorders, forgiveness
   * (which changes cost) and empty-label edits in one comparison. */
  private static signature(
    rows: readonly { rank: number; user_id: string | null; label?: string | null; cost: number }[]
  ): string {
    return [...rows]
      .filter(r => r.user_id !== null || (r.label ?? null) !== null)
      .sort((a, b) => a.rank - b.rank)
      .map(r => `${r.rank}:${r.user_id ?? ''}:${r.label ?? ''}:${r.cost}`)
      .join('|');
  }

  protected readonly isDirty = computed(
    () =>
      MgSelectionPanelComponent.signature(this.draftPayloads()) !==
      MgSelectionPanelComponent.signature(this.selection())
  );

  protected readonly canSave = computed(() => this.isDirty() && !this.isOverCapacity() && !this.isSaving());

  protected readonly canPublish = computed(
    () =>
      this.kind() === 'draft' &&
      this.event().status === 'registration_closed' &&
      this.selection().length > 0 &&
      !this.isDirty()
  );

  private unregisteredRows(inDraft: ReadonlySet<string>): AvailableRow[] {
    if (!this.isCorrection()) return [];
    const registeredIds = new Set(this.registrations().map(reg => reg.user_id));
    return this.members()
      .filter(member => !inDraft.has(member.userId) && !registeredIds.has(member.userId))
      .map(member => ({
        userId: member.userId,
        displayName: member.displayName,
        totalScore: this.totalScores().get(member.userId) ?? 0,
        isRegistered: false,
        positionLabel: null,
        comment: null,
      }));
  }

  protected generate(): void {
    const registrations = this.registrations();
    const scores: MgLeaderboardEntry[] = registrations.map(reg => ({
      user_id: reg.user_id,
      display_name: reg.user_profiles.display_name,
      total_points: this.totalScores().get(reg.user_id) ?? 0,
    }));

    const payloads = this.mgEventService.generateAutoSelectionPayload(
      this.event().id,
      registrations.map(reg => ({
        id: reg.id,
        mg_event_id: reg.mg_event_id,
        user_id: reg.user_id,
        registered_at: reg.registered_at,
        desired_slot_order: reg.desired_slot_order,
        comment: reg.comment,
      })),
      scores,
      this.effectiveCapacity(),
      [...this.slotRows()]
    );

    this.draftOrder.set(payloads.flatMap(p => (p.selection_type === 'selected' && p.user_id ? [p.user_id] : [])));
    this.draftSource.set('automatic');
  }

  protected add(userId: string): void {
    if (this.isFull() || this.draftOrder().includes(userId)) return;
    this.draftOrder.update(order => [...order, userId]);
    this.draftSource.set('manual');
  }

  /** Drag & drop reorder. The ↑/↓ buttons stay for keyboard and screen-reader users. */
  protected drop(event: CdkDragDrop<string[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const order = [...this.draftOrder()];
    moveItemInArray(order, event.previousIndex, event.currentIndex);
    this.draftOrder.set(order);
    this.draftSource.set('manual');
  }

  protected remove(entry: string): void {
    this.draftOrder.update(order => order.filter(id => id !== entry));
    if (isEmptySlotId(entry)) {
      this.emptyLabels.update(labels => {
        const next = new Map(labels);
        next.delete(entry);
        return next;
      });
    } else {
      this.forgiven.update(set => {
        const next = new Set(set);
        next.delete(entry);
        return next;
      });
    }
    this.draftSource.set('manual');
  }

  protected move(entry: string, delta: -1 | 1): void {
    const order = [...this.draftOrder()];
    const from = order.indexOf(entry);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    this.draftOrder.set(order);
    this.draftSource.set('manual');
  }

  /** Append a new empty placeholder slot (default name "Empty"). */
  protected addEmpty(): void {
    if (this.isFull()) return;
    const id = EMPTY_SLOT_PREFIX + 'new-' + this.nextEmptyId();
    this.nextEmptyId.update(n => n + 1);
    this.emptyLabels.update(labels => new Map(labels).set(id, DEFAULT_EMPTY_LABEL));
    this.draftOrder.update(order => [...order, id]);
    this.draftSource.set('manual');
  }

  protected setEmptyLabel(id: string, label: string): void {
    this.emptyLabels.update(labels => new Map(labels).set(id, label));
    this.draftSource.set('manual');
  }

  /** Toggle whether a moved player's slot change is forgiven (billed at approved cost). */
  protected toggleForgive(userId: string): void {
    this.forgiven.update(set => {
      const next = new Set(set);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
    this.draftSource.set('manual');
  }

  protected onPoolSearch(value: string): void {
    this.poolSearch.set(value);
  }

  protected reset(): void {
    // Re-derive every working signal from the saved selection (they're linkedSignals,
    // but an explicit edit overrides them until the source input changes).
    const labels = new Map<string, string>();
    this.selection()
      .filter(row => row.selection_type === 'empty')
      .sort((a, b) => a.rank - b.rank)
      .forEach((row, index) => labels.set(EMPTY_SLOT_PREFIX + 'saved-' + index, row.label ?? DEFAULT_EMPTY_LABEL));
    this.emptyLabels.set(labels);

    const forgivenSet = new Set<string>();
    for (const row of this.selection()) {
      if (
        row.user_id &&
        row.selection_type === 'selected' &&
        row.approved_cost !== null &&
        row.approved_rank !== null &&
        row.rank !== row.approved_rank &&
        row.cost === row.approved_cost
      ) {
        forgivenSet.add(row.user_id);
      }
    }
    this.forgiven.set(forgivenSet);

    this.draftOrder.set(this.savedOrder());
    this.draftSource.set(this.selection()[0]?.selected_by ?? this.assignmentMode());
  }

  protected async save(): Promise<void> {
    if (!this.canSave()) return;

    this.isSaving.set(true);
    try {
      const { error } = await this.mgEventService.saveSelection(this.event().id, this.draftPayloads());
      if (error) throw error;
      this.snackbarService.success(this.translate.instant('mg.admin.selectionSaved'));
      this.selectionSaved.emit();
    } catch (error) {
      console.error('Error saving MG selection:', error);
      this.snackbarService.error(this.translate.instant('mg.admin.selectionSaveError'));
    } finally {
      this.isSaving.set(false);
    }
  }

  protected async publish(): Promise<void> {
    if (!this.canPublish()) return;

    this.isPublishing.set(true);
    try {
      const { error } = await this.mgEventService.publishSelection(this.event().id);
      if (error) throw error;
      this.snackbarService.success(this.translate.instant('mg.admin.selectionPublished'));
      this.published.emit();
    } catch (error) {
      console.error('Error publishing MG selection:', error);
      this.snackbarService.error(this.translate.instant('mg.admin.publishError'));
    } finally {
      this.isPublishing.set(false);
    }
  }
}
