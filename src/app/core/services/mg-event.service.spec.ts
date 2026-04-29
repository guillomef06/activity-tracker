import { describe, it, expect } from 'vitest';
import type { MgRegistration, MgLeaderboardEntry, MgSelectionPayload } from '@shared/models';

function generateAutoSelectionPayload(
  mgEventId: string,
  registrations: MgRegistration[],
  scores: MgLeaderboardEntry[],
  capacity: number
): MgSelectionPayload[] {
  const scoreByUserId = new Map(scores.map(s => [s.user_id, s.total_points]));
  const sorted = [...registrations].sort(
    (a, b) => (scoreByUserId.get(b.user_id) ?? 0) - (scoreByUserId.get(a.user_id) ?? 0)
  );
  const selected = sorted.slice(0, capacity);
  const ffaCount = Math.max(0, capacity - selected.length);
  const payloads: MgSelectionPayload[] = selected.map((reg, i) => ({
    mg_event_id: mgEventId,
    user_id: reg.user_id,
    rank: i + 1,
    selection_type: 'selected' as const,
    selected_by: 'automatic' as const,
  }));
  for (let i = 0; i < ffaCount; i++) {
    payloads.push({
      mg_event_id: mgEventId,
      user_id: null,
      rank: selected.length + i + 1,
      selection_type: 'ffa' as const,
      selected_by: 'automatic' as const,
    });
  }
  return payloads;
}

const makeReg = (userId: string): MgRegistration => ({
  id: userId + '-reg',
  mg_event_id: 'event-1',
  user_id: userId,
  registered_at: new Date().toISOString(),
});

const makeScore = (userId: string, total: number): MgLeaderboardEntry => ({
  user_id: userId,
  display_name: userId,
  total_points: total,
});

describe('generateAutoSelectionPayload', () => {
  it('should select top N by score', () => {
    const regs = [makeReg('a'), makeReg('b'), makeReg('c')];
    const scores = [makeScore('a', 10), makeScore('b', 30), makeScore('c', 20)];
    const result = generateAutoSelectionPayload('event-1', regs, scores, 2);
    expect(result).toHaveLength(2);
    expect(result[0].user_id).toBe('b');
    expect(result[0].rank).toBe(1);
    expect(result[1].user_id).toBe('c');
    expect(result[1].rank).toBe(2);
    expect(result.every(r => r.selection_type === 'selected')).toBe(true);
  });

  it('should fill FFA slots when fewer registrations than capacity', () => {
    const regs = [makeReg('a'), makeReg('b')];
    const scores = [makeScore('a', 10), makeScore('b', 5)];
    const result = generateAutoSelectionPayload('event-1', regs, scores, 5);
    expect(result).toHaveLength(5);
    const selected = result.filter(r => r.selection_type === 'selected');
    const ffa = result.filter(r => r.selection_type === 'ffa');
    expect(selected).toHaveLength(2);
    expect(ffa).toHaveLength(3);
    expect(ffa.every(r => r.user_id === null)).toBe(true);
  });

  it('should produce 100% FFA when no registrations', () => {
    const result = generateAutoSelectionPayload('event-1', [], [], 10);
    expect(result).toHaveLength(10);
    expect(result.every(r => r.selection_type === 'ffa')).toBe(true);
    expect(result.every(r => r.user_id === null)).toBe(true);
  });

  it('should have ranks 1-based and contiguous', () => {
    const regs = [makeReg('a'), makeReg('b'), makeReg('c')];
    const scores = [makeScore('a', 1), makeScore('b', 2), makeScore('c', 3)];
    const result = generateAutoSelectionPayload('event-1', regs, scores, 5);
    expect(result.map(r => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should handle players with no score (defaults to 0)', () => {
    const regs = [makeReg('a'), makeReg('unknown')];
    const scores = [makeScore('a', 10)];
    const result = generateAutoSelectionPayload('event-1', regs, scores, 2);
    expect(result[0].user_id).toBe('a');
    expect(result[1].user_id).toBe('unknown');
  });
});
