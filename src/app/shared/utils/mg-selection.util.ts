import { resolveSlotForRank, type MgSlotRow } from './mg-slot.util';
import type { MgSelection, MgSelectedBy, MgSelectionPayload } from '@shared/models';

/** Prefix marking an entry in the order array as an empty placeholder slot rather than a userId. */
export const EMPTY_SLOT_PREFIX = 'empty:';

export const isEmptySlotId = (entry: string): boolean => entry.startsWith(EMPTY_SLOT_PREFIX);

/** Default label shown for a freshly-added empty slot (admin can edit it). */
export const DEFAULT_EMPTY_LABEL = 'Empty';

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
   * the dearer final-rank cost. Ignored for a player with no approved snapshot.
   */
  forgiven?: ReadonlySet<string>;
  /** Label for each empty-slot entry (EMPTY_SLOT_PREFIX id → name). */
  emptyLabels?: ReadonlyMap<string, string>;
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
 * `cost` is snapshotted from `slotRows` at build time. When `previous` is given
 * (correcting a published selection):
 *  - a player's `approved_rank`/`approved_cost` carry forward unchanged;
 *  - a forgiven player is billed their `approved_cost` (the approved slot),
 *    so a legitimate upward move isn't penalised;
 *  - otherwise a player who keeps the exact same rank keeps the cost already
 *    charged, and only a player whose rank actually changed is re-priced to the
 *    final rank — unchanged from the original behaviour.
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

  const previousByUserId = new Map<string, MgSelection>();
  for (const row of previous) {
    if (row.user_id !== null && row.selection_type === 'selected') previousByUserId.set(row.user_id, row);
  }

  const placed = orderedEntries.slice(0, capacity).map<MgSelectionPayload>((entry, index) => {
    const rank = index + 1;

    if (isEmptySlotId(entry)) {
      return {
        mg_event_id: mgEventId,
        user_id: null,
        rank,
        selection_type: 'empty',
        selected_by: selectedBy,
        cost: resolveSlotForRank(rank, slotRows)?.cost ?? 0,
        label: emptyLabels?.get(entry)?.trim() || DEFAULT_EMPTY_LABEL,
        approved_rank: null,
        approved_cost: null,
      };
    }

    const snapshot = previousByUserId.get(entry);
    const approvedRank = snapshot?.approved_rank ?? null;
    const approvedCost = snapshot?.approved_cost ?? null;
    const finalRankCost = resolveSlotForRank(rank, slotRows)?.cost ?? 0;

    let cost: number;
    if (forgiven?.has(entry) && approvedCost !== null) {
      cost = approvedCost;
    } else if (snapshot?.rank === rank) {
      cost = snapshot.cost;
    } else {
      cost = finalRankCost;
    }

    return {
      mg_event_id: mgEventId,
      user_id: entry,
      rank,
      selection_type: 'selected',
      selected_by: selectedBy,
      cost,
      label: null,
      approved_rank: approvedRank,
      approved_cost: approvedCost,
    };
  });

  const ffaCount = Math.max(0, capacity - placed.length);
  const ffa = Array.from({ length: ffaCount }, (_, index) => ({
    mg_event_id: mgEventId,
    user_id: null,
    rank: placed.length + index + 1,
    selection_type: 'ffa' as const,
    selected_by: selectedBy,
    cost: 0,
    label: null,
    approved_rank: null,
    approved_cost: null,
  }));

  return [...placed, ...ffa];
}
