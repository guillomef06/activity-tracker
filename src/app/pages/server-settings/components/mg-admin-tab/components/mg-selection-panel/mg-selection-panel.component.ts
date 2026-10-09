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
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { MgEventService } from '@app/core/services/mg-event.service';
import { SnackbarService } from '@app/core/services';
import { buildSelectionPayload } from '@shared/utils/mg-selection.util';
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
  userId: string;
  rank: number;
  displayName: string;
  totalScore: number;
  slotLabel: string | null;
  cost: number;
  isFirst: boolean;
  isLast: boolean;
}

interface AvailableRow {
  userId: string;
  displayName: string;
  totalScore: number;
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
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressSpinnerModule,
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

  private readonly savedOrder = computed<string[]>(() =>
    this.selection()
      .filter(row => row.selection_type === 'selected')
      .sort((a, b) => a.rank - b.rank)
      .flatMap(row => (row.user_id ? [row.user_id] : []))
  );

  /** Working copy of the ordered players; resets whenever the saved selection input changes. */
  protected readonly draftOrder = linkedSignal<string[]>(() => this.savedOrder());

  /** Who made the draft: flipped to 'manual' by any edit, back to 'automatic' on generate. */
  private readonly draftSource = linkedSignal<MgSelectedBy>(
    () => this.selection()[0]?.selected_by ?? this.assignmentMode()
  );

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
    for (const reg of this.registrations()) names.set(reg.user_id, reg.user_profiles.display_name);
    return names;
  });

  private readonly draftPayloads = computed(() =>
    buildSelectionPayload(
      this.event().id,
      this.draftOrder(),
      this.effectiveCapacity(),
      this.slotRows(),
      this.draftSource(),
      this.isCorrection() ? this.selection() : []
    )
  );

  protected readonly draftRows = computed<DraftRow[]>(() => {
    const order = this.draftOrder();
    const costByUserId = new Map(this.draftPayloads().map(p => [p.user_id, p.cost]));
    return order.map((userId, index) => ({
      userId,
      rank: index + 1,
      displayName: this.displayNameByUserId().get(userId) ?? userId,
      totalScore: this.totalScores().get(userId) ?? 0,
      slotLabel: resolveSlotForRank(index + 1, this.slotRows())?.rankLabel ?? null,
      cost: costByUserId.get(userId) ?? 0,
      isFirst: index === 0,
      isLast: index === order.length - 1,
    }));
  });

  protected readonly availableRows = computed<AvailableRow[]>(() => {
    const inDraft = new Set(this.draftOrder());
    return this.registrations()
      .filter(reg => !inDraft.has(reg.user_id))
      .map(reg => ({
        userId: reg.user_id,
        displayName: reg.user_profiles.display_name,
        totalScore: this.totalScores().get(reg.user_id) ?? 0,
        positionLabel: MG_SLOT_DEFAULTS.find(slot => slot.slotOrder === reg.desired_slot_order)?.rankLabel ?? null,
        comment: reg.comment,
      }))
      .sort((a, b) => b.totalScore - a.totalScore || a.displayName.localeCompare(b.displayName));
  });

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

  protected readonly isDirty = computed(() => {
    const draft = this.draftOrder();
    const saved = this.savedOrder();
    return draft.length !== saved.length || draft.some((userId, index) => userId !== saved[index]);
  });

  protected readonly canSave = computed(() => this.isDirty() && !this.isOverCapacity() && !this.isSaving());

  protected readonly canPublish = computed(
    () =>
      this.kind() === 'draft' &&
      this.event().status === 'registration_closed' &&
      this.selection().length > 0 &&
      !this.isDirty()
  );

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

  protected remove(userId: string): void {
    this.draftOrder.update(order => order.filter(id => id !== userId));
    this.draftSource.set('manual');
  }

  protected move(userId: string, delta: -1 | 1): void {
    const order = [...this.draftOrder()];
    const from = order.indexOf(userId);
    const to = from + delta;
    if (from === -1 || to < 0 || to >= order.length) return;
    [order[from], order[to]] = [order[to], order[from]];
    this.draftOrder.set(order);
    this.draftSource.set('manual');
  }

  protected reset(): void {
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
