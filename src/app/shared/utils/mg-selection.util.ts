import type { MgSlotRow } from './mg-slot.util';
import {
  indexApprovedPlayers,
  isOffListPlayer,
  resolveApprovedBaseline,
  resolvePlayerCost,
  slotCostForRank,
} from './mg-pricing.util';
import type { MgSelection, MgSelectedBy, MgSelectionPayload } from '@shared/models';

/** Prefix marking an entry in the order array as an empty placeholder slot rather than a userId. */
export const EMPTY_SLOT_PREFIX = 'empty:';

export const isEmptySlotId = (entry: string): boolean => entry.startsWith(EMPTY_SLOT_PREFIX);

/** Default label shown for a freshly-added empty slot (admin can edit it). */
export const DEFAULT_EMPTY_LABEL = 'Empty';

/** Sentinel id of the n-th (by rank) empty slot loaded from a saved selection. */
export const savedEmptySlotId = (index: number): string => `${EMPTY_SLOT_PREFIX}saved-${index}`;

/** Labels of the saved empty slots, keyed by the sentinel id `savedEmptySlotId` gives them. */
export function buildSavedEmptyLabels(selection: readonly MgSelection[]): Map<string, string> {
  const labels = new Map<string, string>();
  selection
    .filter(row => row.selection_type === 'empty')
    .sort((a, b) => a.rank - b.rank)
    .forEach((row, index) => labels.set(savedEmptySlotId(index), row.label ?? DEFAULT_EMPTY_LABEL));
  return labels;
}

export interface BuildSelectionPayloadOptions {
  /**
   * Correcting an already-saved selection: supplies the previous rows so a
   * player's approved snapshot (approved_rank/approved_cost) and already-charged
   * cost carry forward. Empty otherwise.
   */
  previous?: readonly MgSelection[];
  /**
   * UserIds whose rank change is forgiven: billed at their approved_cost (the
   * cost of the slot they were approved for on the published list) instead of
   * the dearer final-rank cost. For an off-list player it waives the cost to 0.
   */
  forgiven?: ReadonlySet<string>;
  /** Label for each empty-slot entry (EMPTY_SLOT_PREFIX id → name). */
  emptyLabels?: ReadonlyMap<string, string>;
}

interface PayloadContext {
  readonly mgEventId: string;
  readonly selectedBy: MgSelectedBy;
  readonly slotRows: readonly MgSlotRow[];
  /** The approved list, by userId. Empty for a fresh draft. */
  readonly approved: ReadonlyMap<string, MgSelection>;
  readonly forgiven: ReadonlySet<string> | undefined;
  readonly emptyLabels: ReadonlyMap<string, string> | undefined;
}

function buildEmptyPayload(entry: string, rank: number, ctx: PayloadContext): MgSelectionPayload {
  return {
    mg_event_id: ctx.mgEventId,
    user_id: null,
    rank,
    selection_type: 'empty',
    selected_by: ctx.selectedBy,
    cost: slotCostForRank(rank, ctx.slotRows),
    label: ctx.emptyLabels?.get(entry)?.trim() || DEFAULT_EMPTY_LABEL,
    approved_rank: null,
    approved_cost: null,
  };
}

function buildPlayerPayload(userId: string, rank: number, ctx: PayloadContext): MgSelectionPayload {
  const saved = ctx.approved.get(userId);
  // The baseline is stamped on every save, making it durable for the next correction.
  const baseline = saved ? resolveApprovedBaseline(saved) : undefined;

  return {
    mg_event_id: ctx.mgEventId,
    user_id: userId,
    rank,
    selection_type: 'selected',
    selected_by: ctx.selectedBy,
    cost: resolvePlayerCost({
      rank,
      finalRankCost: slotCostForRank(rank, ctx.slotRows),
      saved,
      offList: isOffListPlayer(userId, ctx.approved),
      forgiven: ctx.forgiven?.has(userId) ?? false,
    }),
    label: null,
    approved_rank: baseline?.rank ?? null,
    approved_cost: baseline?.cost ?? null,
  };
}

/** Free-for-all filler rows: they pad the selection up to the event capacity and cost nothing. */
function buildFfaPayloads(ctx: PayloadContext, placedCount: number, capacity: number): MgSelectionPayload[] {
  const ffaCount = Math.max(0, capacity - placedCount);
  return Array.from({ length: ffaCount }, (_, index) => ({
    mg_event_id: ctx.mgEventId,
    user_id: null,
    rank: placedCount + index + 1,
    selection_type: 'ffa' as const,
    selected_by: ctx.selectedBy,
    cost: 0,
    label: null,
    approved_rank: null,
    approved_cost: null,
  }));
}

/**
 * Builds the full list of selection rows to persist for an MG event: the
 * ordered entries (rank = position + 1, truncated to `capacity`), then FFA
 * rows filling the remaining capacity.
 *
 * An entry is either a real userId or an empty-slot sentinel (`EMPTY_SLOT_PREFIX`).
 * Empty slots occupy a rank (shifting later players down) and show the slot cost
 * for accounting, but carry `user_id: null` so they never bill anyone (loadSpends
 * filters user_id IS NULL).
 *
 * `cost` is snapshotted from `slotRows` at build time; when `previous` is given
 * (correcting a published selection) the rules in `resolvePlayerCost` apply, and a
 * player's `approved_rank`/`approved_cost` carry forward unchanged.
 */
export function buildSelectionPayload(
  mgEventId: string,
  orderedEntries: readonly string[],
  capacity: number,
  slotRows: readonly MgSlotRow[],
  selectedBy: MgSelectedBy,
  options: BuildSelectionPayloadOptions = {}
): MgSelectionPayload[] {
  const { previous = [], forgiven, emptyLabels } = options;
  const ctx: PayloadContext = {
    mgEventId,
    selectedBy,
    slotRows,
    approved: indexApprovedPlayers(previous),
    forgiven,
    emptyLabels,
  };

  const placed = orderedEntries
    .slice(0, capacity)
    .map((entry, index) =>
      isEmptySlotId(entry) ? buildEmptyPayload(entry, index + 1, ctx) : buildPlayerPayload(entry, index + 1, ctx)
    );

  return [...placed, ...buildFfaPayloads(ctx, placed.length, capacity)];
}
