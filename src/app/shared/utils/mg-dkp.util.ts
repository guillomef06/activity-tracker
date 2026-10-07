/**
 * DKP (Mightiest Governor slot cost) FIFO consumption.
 *
 * Points earned each week expire out of a rolling N-week window. When a player
 * "spends" points on an MG slot, we consume the OLDEST still-available points
 * first (FIFO): those are the ones about to expire anyway, so spending them
 * costs the player the least future balance. The deduction a player sees is
 * therefore only the consumed points whose earning-week is still inside the
 * current window — as the oldest consumed weeks roll out, the deduction shrinks
 * and the balance recovers on its own. This also means the balance can never be
 * driven negative, unlike a flat lump-sum deduction.
 */

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** A single DKP spend: a slot cost charged against the week its MG event started. */
export interface FifoSpend {
  userId: string;
  /** Monday 00:00 UTC (ms) of the week the spend's MG event started. */
  eventWeekStartMs: number;
  cost: number;
}

/** Points a user earned in one week (Monday 00:00 UTC, ms). */
export interface FifoEarningWeek {
  weekStartMs: number;
  points: number;
}

/**
 * Resolve, per user, how many of their points are currently deducted once FIFO
 * consumption and rolling-window expiry are both accounted for.
 *
 * Pure function — no clock or DB access. `currentWeekStartMs` (Monday 00:00 UTC
 * of the current week) is supplied by the caller so this stays deterministic
 * and unit-testable.
 *
 * @param earningsByUser each user's weekly earnings; must cover at least
 *   `2 * windowWeeks` of history so a spend's full lookback is visible.
 * @param spends every spend whose event week has already ended (a spend never
 *   deducts until its own week is over).
 * @param windowWeeks the rolling window width (e.g. 12).
 * @param currentWeekStartMs Monday 00:00 UTC of the current week, in ms.
 * @returns userId → points still deducted this window (omitted when 0).
 */
export function computeFifoDeductions(
  earningsByUser: ReadonlyMap<string, readonly FifoEarningWeek[]>,
  spends: readonly FifoSpend[],
  windowWeeks: number,
  currentWeekStartMs: number
): Map<string, number> {
  const windowStartMs = currentWeekStartMs - (windowWeeks - 1) * MS_PER_WEEK;
  const deductions = new Map<string, number>();

  for (const [userId, userSpends] of groupByUser(spends)) {
    // Weeks sorted oldest-first; `remaining[i]` is decremented as spends consume it.
    const weeks = [...(earningsByUser.get(userId) ?? [])].sort((a, b) => a.weekStartMs - b.weekStartMs);
    const remaining = weeks.map(w => w.points);

    // Oldest spend first so earlier spends claim the oldest points (true FIFO across spends).
    const orderedSpends = [...userSpends].sort((a, b) => a.eventWeekStartMs - b.eventWeekStartMs);
    for (const spend of orderedSpends) {
      consumeOldestFirst(spend, weeks, remaining, windowWeeks);
    }

    const deduction = deductionStillInWindow(weeks, remaining, windowStartMs, currentWeekStartMs);
    if (deduction > 0) deductions.set(userId, deduction);
  }

  return deductions;
}

function groupByUser(spends: readonly FifoSpend[]): Map<string, FifoSpend[]> {
  const byUser = new Map<string, FifoSpend[]>();
  for (const spend of spends) {
    const list = byUser.get(spend.userId) ?? [];
    list.push(spend);
    byUser.set(spend.userId, list);
  }
  return byUser;
}

/**
 * Consumes `spend.cost` from the oldest eligible weeks, mutating `remaining`.
 * A spend may only consume points that existed when it happened: no older than
 * its own N-week lookback, and not from a week after its event week. Any
 * leftover cost (spent more than was available) is dropped — it could only hit
 * weeks that have since expired, which no longer deduct anyway.
 */
function consumeOldestFirst(
  spend: FifoSpend,
  weeks: readonly FifoEarningWeek[],
  remaining: number[],
  windowWeeks: number
): void {
  const lookbackStartMs = spend.eventWeekStartMs - (windowWeeks - 1) * MS_PER_WEEK;
  let toConsume = spend.cost;
  for (let i = 0; i < weeks.length && toConsume > 0; i++) {
    if (weeks[i].weekStartMs < lookbackStartMs || weeks[i].weekStartMs > spend.eventWeekStartMs) continue;
    const take = Math.min(remaining[i], toConsume);
    remaining[i] -= take;
    toConsume -= take;
  }
}

/** Sum of consumed points (earned − remaining) whose week is still in the current window. */
function deductionStillInWindow(
  weeks: readonly FifoEarningWeek[],
  remaining: readonly number[],
  windowStartMs: number,
  currentWeekStartMs: number
): number {
  let deduction = 0;
  for (let i = 0; i < weeks.length; i++) {
    if (weeks[i].weekStartMs < windowStartMs || weeks[i].weekStartMs > currentWeekStartMs) continue;
    deduction += weeks[i].points - remaining[i];
  }
  return deduction;
}
