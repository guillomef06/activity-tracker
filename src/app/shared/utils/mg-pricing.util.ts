import { resolveSlotForRank, type MgSlotRow } from './mg-slot.util';
import type { MgSelection } from '@shared/models';

/**
 * Pricing rules for a corrected MG selection, shared by the payload builder and
 * the selection panel so the cost shown in the UI can never drift from the cost
 * that gets saved.
 *
 * Vocabulary: the "approved list" is the originally published selection. An
 * "off-list player" is someone placed during a correction who was never on it.
 * (Not to be confused with the `ffa` filler rows that pad a selection up to
 * its capacity.)
 */

/** Rank and cost a player was approved for on the published list. */
export interface ApprovedBaseline {
  readonly rank: number;
  readonly cost: number;
}

/** Cost of the slot a rank falls into; 0 for a rank outside every slot row. */
export function slotCostForRank(rank: number, slotRows: readonly MgSlotRow[]): number {
  return resolveSlotForRank(rank, slotRows)?.cost ?? 0;
}

/** Indexes the approved list: the saved real players, by userId. */
export function indexApprovedPlayers<T extends MgSelection>(selection: readonly T[]): Map<string, T> {
  const byUserId = new Map<string, T>();
  for (const row of selection) {
    if (row.user_id !== null && row.selection_type === 'selected') byUserId.set(row.user_id, row);
  }
  return byUserId;
}

/**
 * Approved baseline of a saved row. For events published after migration 46 it is
 * the stamped snapshot; for a legacy event (columns null) the row's own current
 * rank/cost is the baseline, since a not-yet-corrected published selection IS the
 * approved list.
 */
export function resolveApprovedBaseline(saved: MgSelection): ApprovedBaseline {
  return { rank: saved.approved_rank ?? saved.rank, cost: saved.approved_cost ?? saved.cost };
}

/** Whether a player was added during a correction without being on the approved list. */
export function isOffListPlayer(userId: string, approved: ReadonlyMap<string, unknown>): boolean {
  // A fresh draft has no approved list to compare against: everyone is priced by rank.
  return approved.size > 0 && !approved.has(userId);
}

export interface PlayerCostInput {
  readonly rank: number;
  readonly finalRankCost: number;
  /** The player's row on the approved list, if any. */
  readonly saved: MgSelection | undefined;
  readonly offList: boolean;
  /** Admin ticked "No penalty" for this player. */
  readonly forgiven: boolean;
}

/**
 * Cost billed to a placed player.
 *  - off-list: their final slot by default (so a rule-breaker is punished), 0 when waived;
 *  - forgiven: min(approved, final), so forgiveness never raises a cost in either direction;
 *  - same rank as saved: the already-charged cost is kept (slot config may have changed since);
 *  - otherwise: the final slot.
 */
export function resolvePlayerCost({ rank, finalRankCost, saved, offList, forgiven }: PlayerCostInput): number {
  if (offList) return forgiven ? 0 : finalRankCost;
  if (!saved) return finalRankCost;
  if (forgiven) return Math.min(resolveApprovedBaseline(saved).cost, finalRankCost);
  return saved.rank === rank ? saved.cost : finalRankCost;
}

export interface ForgiveInput {
  readonly offList: boolean;
  readonly approved: ApprovedBaseline | undefined;
  readonly finalRankCost: number;
}

/** "No penalty" is offered to off-list players, and to ranked players who moved UP to a dearer slot. */
export function canForgiveMove({ offList, approved, finalRankCost }: ForgiveInput): boolean {
  if (offList) return true;
  return approved !== undefined && finalRankCost > approved.cost;
}

/**
 * UserIds whose move is currently forgiven, read back from a saved selection: a row
 * charged exactly its approved cost although its rank differs from the approved one.
 * Lets a reload preserve the admin's decision.
 */
export function deriveForgivenUserIds(selection: readonly MgSelection[]): Set<string> {
  const forgiven = new Set<string>();
  for (const row of selection) {
    const moved = row.approved_rank !== null && row.rank !== row.approved_rank;
    const chargedApproved = row.approved_cost !== null && row.cost === row.approved_cost;
    if (row.user_id && row.selection_type === 'selected' && moved && chargedApproved) forgiven.add(row.user_id);
  }
  return forgiven;
}
