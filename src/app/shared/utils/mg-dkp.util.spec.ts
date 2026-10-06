import { describe, it, expect } from 'vitest';
import { computeFifoDeductions, type FifoEarningWeek, type FifoSpend } from './mg-dkp.util';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/**
 * Anchor "current week" at a fixed Monday 00:00 UTC so the suite is clock-independent.
 * weekMs(0) = current week, weekMs(-1) = last week, weekMs(-11) = 11 weeks ago, etc.
 */
const CURRENT_WEEK_MS = Date.UTC(2026, 0, 5); // Mon 5 Jan 2026 00:00 UTC
const weekMs = (offsetWeeks: number) => CURRENT_WEEK_MS + offsetWeeks * MS_PER_WEEK;

/** Build an earnings map for a single user who earns `points` every week in [fromOffset, toOffset]. */
function steadyEarnings(
  userId: string,
  points: number,
  fromOffset: number,
  toOffset: number
): Map<string, FifoEarningWeek[]> {
  const weeks: FifoEarningWeek[] = [];
  for (let o = fromOffset; o <= toOffset; o++) {
    weeks.push({ weekStartMs: weekMs(o), points });
  }
  return new Map([[userId, weeks]]);
}

describe('computeFifoDeductions', () => {
  const WINDOW = 12;

  it('consumes the oldest points first so a spend overlaps points about to expire', () => {
    // Earned 10/wk for the 12 weeks ending this week (offsets -11..0 = 120 pts in window).
    const earnings = steadyEarnings('u', 10, -11, 0);
    // Spent 50 for an event whose week was last week (-1), already ended.
    const spends: FifoSpend[] = [{ userId: 'u', eventWeekStartMs: weekMs(-1), cost: 50 }];

    const result = computeFifoDeductions(earnings, spends, WINDOW, CURRENT_WEEK_MS);

    // The spend's lookback is offsets -12..-1, but earnings only start at -11, so FIFO
    // consumes the 5 oldest available weeks: -11,-10,-9,-8,-7 (50 pts). All are still in
    // the current window (-11..0), so right after the spend the full 50 is deducted.
    expect(result.get('u')).toBe(50);
  });

  it('fades as the oldest consumed weeks roll out of the window (higher totals over time)', () => {
    // A spend of 50 at week -1, viewed 5 weeks later: the oldest consumed weeks have expired.
    // Model "5 weeks later" by shifting all offsets back 5 relative to the same current week.
    const earnings = steadyEarnings('u', 10, -16, -5); // the same 12 earning weeks, now 5 wks older
    const spends: FifoSpend[] = [{ userId: 'u', eventWeekStartMs: weekMs(-6), cost: 50 }];

    const result = computeFifoDeductions(earnings, spends, WINDOW, CURRENT_WEEK_MS);

    // The spend consumed weeks -17..-13 (its 5 oldest lookback weeks). All are now outside
    // the current window (-11..0), so none of the consumed points still deduct → fully faded.
    expect(result.get('u') ?? 0).toBe(0);
  });

  it('never deducts more than the points still in the window', () => {
    // Only 30 pts total in window, but a 100-cost spend.
    const earnings = steadyEarnings('u', 10, -2, 0); // 3 weeks × 10 = 30
    const spends: FifoSpend[] = [{ userId: 'u', eventWeekStartMs: weekMs(-1), cost: 100 }];

    const result = computeFifoDeductions(earnings, spends, WINDOW, CURRENT_WEEK_MS);

    // Can only consume the 20 pts in its lookback that are also still in-window (weeks -2,-1).
    expect(result.get('u')).toBeLessThanOrEqual(30);
    expect(result.get('u')).toBe(20);
  });

  it('attributes earlier spends to the oldest points first across multiple spends', () => {
    // 10/wk for offsets -11..0 (120 in window). Two spends of 50 each at weeks -2 and -1.
    const earnings = steadyEarnings('u', 10, -11, 0);
    const spends: FifoSpend[] = [
      { userId: 'u', eventWeekStartMs: weekMs(-1), cost: 50 },
      { userId: 'u', eventWeekStartMs: weekMs(-2), cost: 50 },
    ];

    const result = computeFifoDeductions(earnings, spends, WINDOW, CURRENT_WEEK_MS);

    // Combined 100 consumed oldest-first from weeks -11..-2 (all in window) → 100 deducted now.
    expect(result.get('u')).toBe(100);
  });

  it('does not let a spend consume points newer than its own event week', () => {
    // Earnings only AFTER the spend's event week: nothing for the spend to consume.
    const earnings = steadyEarnings('u', 10, -1, 0); // weeks -1 and 0
    const spends: FifoSpend[] = [{ userId: 'u', eventWeekStartMs: weekMs(-2), cost: 50 }];

    const result = computeFifoDeductions(earnings, spends, WINDOW, CURRENT_WEEK_MS);

    // Both earning weeks are newer than the event week (-2), so none are consumable.
    expect(result.get('u') ?? 0).toBe(0);
  });

  it('omits users with no spends and users whose deduction nets to zero', () => {
    const earnings = new Map<string, FifoEarningWeek[]>([
      ['spender', [{ weekStartMs: weekMs(-1), points: 10 }]],
      ['bystander', [{ weekStartMs: weekMs(-1), points: 10 }]],
    ]);
    const spends: FifoSpend[] = [{ userId: 'spender', eventWeekStartMs: weekMs(-1), cost: 10 }];

    const result = computeFifoDeductions(earnings, spends, WINDOW, CURRENT_WEEK_MS);

    expect(result.get('spender')).toBe(10);
    expect(result.has('bystander')).toBe(false);
  });

  it('returns an empty map when there are no spends', () => {
    const earnings = steadyEarnings('u', 10, -11, 0);
    expect(computeFifoDeductions(earnings, [], WINDOW, CURRENT_WEEK_MS).size).toBe(0);
  });

  it('handles a spender with no earnings at all', () => {
    const spends: FifoSpend[] = [{ userId: 'ghost', eventWeekStartMs: weekMs(-1), cost: 50 }];
    const result = computeFifoDeductions(new Map(), spends, WINDOW, CURRENT_WEEK_MS);
    expect(result.get('ghost') ?? 0).toBe(0);
  });
});
