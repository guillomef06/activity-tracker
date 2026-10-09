import { resolveSlotForRank, type MgSlotRow } from './mg-slot.util';
import type { MgSelection, MgSelectedBy, MgSelectionPayload } from '@shared/models';

/**
 * Builds the full list of selection rows to persist for an MG event: the
 * ordered players (rank = position + 1, truncated to `capacity`), then FFA
 * rows filling the remaining capacity.
 *
 * `cost` is snapshotted from `slotRows` at build time. When `previous` is
 * given (correcting an already-published selection), a player who keeps the
 * exact same rank keeps the cost already charged to them — so a later change
 * to the server's slot config never rewrites a cost that was already applied,
 * and only players whose rank actually changed are re-priced.
 */
export function buildSelectionPayload(
  mgEventId: string,
  orderedUserIds: readonly string[],
  capacity: number,
  slotRows: readonly MgSlotRow[],
  selectedBy: MgSelectedBy,
  previous: readonly MgSelection[] = []
): MgSelectionPayload[] {
  const previousByUserId = new Map<string, MgSelection>();
  for (const row of previous) {
    if (row.user_id !== null && row.selection_type === 'selected') previousByUserId.set(row.user_id, row);
  }

  const selected = orderedUserIds.slice(0, capacity).map<MgSelectionPayload>((userId, index) => {
    const rank = index + 1;
    const snapshot = previousByUserId.get(userId);
    return {
      mg_event_id: mgEventId,
      user_id: userId,
      rank,
      selection_type: 'selected',
      selected_by: selectedBy,
      cost: snapshot?.rank === rank ? snapshot.cost : (resolveSlotForRank(rank, slotRows)?.cost ?? 0),
    };
  });

  const ffaCount = Math.max(0, capacity - selected.length);
  const ffa = Array.from({ length: ffaCount }, (_, index) => ({
    mg_event_id: mgEventId,
    user_id: null,
    rank: selected.length + index + 1,
    selection_type: 'ffa' as const,
    selected_by: selectedBy,
    cost: 0,
  }));

  return [...selected, ...ffa];
}
