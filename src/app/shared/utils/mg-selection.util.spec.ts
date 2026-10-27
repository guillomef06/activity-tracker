import { describe, it, expect } from 'vitest';
import { buildSelectionPayload, EMPTY_SLOT_PREFIX, DEFAULT_EMPTY_LABEL } from './mg-selection.util';
import { buildMgSlotRows } from './mg-slot.util';
import type { MgSelection } from '@shared/models';

const slotRows = buildMgSlotRows([]);

const makePrevious = (
  userId: string | null,
  rank: number,
  cost: number,
  approved?: { rank: number; cost: number }
): MgSelection => ({
  id: `sel-${rank}`,
  mg_event_id: 'event-1',
  user_id: userId,
  rank,
  selection_type: userId ? 'selected' : 'ffa',
  selected_by: 'automatic',
  cost,
  label: null,
  approved_rank: approved?.rank ?? null,
  approved_cost: approved?.cost ?? null,
});

describe('buildSelectionPayload', () => {
  it('should rank players by their position and price each rank from the slot rows', () => {
    // Arrange
    const ordered = ['a', 'b', 'c'];

    // Act
    const result = buildSelectionPayload('event-1', ordered, 10, slotRows, 'manual');

    // Assert
    expect(result.slice(0, 3).map(p => [p.user_id, p.rank, p.cost])).toEqual([
      ['a', 1, 150],
      ['b', 2, 140],
      ['c', 3, 130],
    ]);
    expect(result.slice(0, 3).every(p => p.selection_type === 'selected' && p.selected_by === 'manual')).toBe(true);
  });

  it('should fill the remaining capacity with free-for-all rows that cost nothing', () => {
    // Arrange
    const ordered = ['a', 'b'];

    // Act
    const result = buildSelectionPayload('event-1', ordered, 5, slotRows, 'manual');

    // Assert
    const ffa = result.filter(p => p.selection_type === 'ffa');
    expect(result).toHaveLength(5);
    expect(ffa.map(p => p.rank)).toEqual([3, 4, 5]);
    expect(ffa.every(p => p.user_id === null && p.cost === 0)).toBe(true);
  });

  it('should truncate the ordered players to the capacity', () => {
    // Arrange
    const ordered = ['a', 'b', 'c', 'd'];

    // Act
    const result = buildSelectionPayload('event-1', ordered, 2, slotRows, 'automatic');

    // Assert
    expect(result.map(p => p.user_id)).toEqual(['a', 'b']);
  });

  it('should return only free-for-all rows when nobody is selected', () => {
    // Arrange / Act
    const result = buildSelectionPayload('event-1', [], 3, slotRows, 'manual');

    // Assert
    expect(result.map(p => p.selection_type)).toEqual(['ffa', 'ffa', 'ffa']);
  });

  it('should use a cost of 0 for a rank outside every slot row', () => {
    // Arrange
    const ordered = Array.from({ length: 51 }, (_, i) => `u${i}`);

    // Act
    const result = buildSelectionPayload('event-1', ordered, 51, slotRows, 'manual');

    // Assert
    expect(result[50].cost).toBe(0);
  });

  describe('when correcting a previous selection', () => {
    it('should keep the already-charged cost for a player who keeps the same rank', () => {
      // Arrange — the server slot config changed since: rank 1 used to cost 999
      const previous = [makePrevious('a', 1, 999)];

      // Act
      const result = buildSelectionPayload('event-1', ['a'], 1, slotRows, 'manual', { previous });

      // Assert
      expect(result[0].cost).toBe(999);
    });

    it('should re-price a player whose rank changed', () => {
      // Arrange
      const previous = [makePrevious('a', 1, 999), makePrevious('b', 2, 888)];

      // Act — a and b swap places
      const result = buildSelectionPayload('event-1', ['b', 'a'], 2, slotRows, 'manual', { previous });

      // Assert
      expect(result.map(p => [p.user_id, p.cost])).toEqual([
        ['b', 150],
        ['a', 140],
      ]);
    });

    it('should bill a newly added (FFA) player their final slot by default', () => {
      // Arrange — list of 1 approved player; z added was never approved.
      const previous = [makePrevious('a', 1, 999)];

      // Act
      const result = buildSelectionPayload('event-1', ['a', 'z'], 2, slotRows, 'manual', { previous });

      // Assert — FFA player billed their rank (2 = 140) by default; waived only via "No penalty"
      expect(result[1]).toMatchObject({ user_id: 'z', cost: 140 });
    });

    it('should ignore previous free-for-all rows', () => {
      // Arrange
      const previous = [makePrevious(null, 1, 500)];

      // Act
      const result = buildSelectionPayload('event-1', ['a'], 1, slotRows, 'manual', { previous });

      // Assert
      expect(result[0].cost).toBe(150);
    });

    it('should carry forward the approved snapshot unchanged across a correction', () => {
      // Arrange — 'a' approved for rank 7 (cost 160), now moved to rank 3.
      const previous = [makePrevious('a', 7, 160, { rank: 7, cost: 160 })];

      // Act
      const result = buildSelectionPayload('event-1', ['a'], 7, slotRows, 'manual', { previous });

      // Assert — approved snapshot preserved
      expect(result[0]).toMatchObject({ approved_rank: 7, approved_cost: 160 });
    });
  });

  describe('forgiveness (no penalty for an approved move)', () => {
    it('should bill a forgiven player their approved cost, not the dearer final rank', () => {
      // Arrange — approved for rank 7 (160); ends at rank 3 (which would cost 130... use a
      // config where moving UP is dearer: rank 3 default is 130, rank 7 is 90).
      // Use the real defaults: rank 3 = 130, rank 7 = 90. Forgiving a move from 7→3 bills 90.
      const previous = [
        makePrevious('a', 7, 90, { rank: 7, cost: 90 }),
        makePrevious('b', 3, 130, { rank: 3, cost: 130 }),
      ];

      // Act — a moves up to rank 1, forgiven
      const result = buildSelectionPayload('event-1', ['a', 'b'], 2, slotRows, 'manual', {
        previous,
        forgiven: new Set(['a']),
      });

      // Assert — a billed approved 90 (not rank-1's 150); b re-priced to final rank 2 (140)
      expect(result.find(p => p.user_id === 'a')?.cost).toBe(90);
      expect(result.find(p => p.user_id === 'b')?.cost).toBe(140);
    });

    it('should use the saved rank/cost as the approved baseline for a legacy event (no snapshot columns)', () => {
      // Arrange — event published BEFORE migration 46: approved_* are null, but the
      // player's saved row (rank 7, cost 90) is the approved list. Forgiving an upward
      // move to rank 1 should bill that fallback baseline (90), not rank 1's 150.
      const previous = [makePrevious('a', 7, 90)];

      // Act
      const result = buildSelectionPayload('event-1', ['a'], 1, slotRows, 'manual', {
        previous,
        forgiven: new Set(['a']),
      });

      // Assert — min(fallback-approved 90, final 150) = 90
      expect(result[0].cost).toBe(90);
    });

    it('should bill a brand-new (FFA) player their final slot by default', () => {
      // Arrange — 'z' was never approved; the list had 1 approved player (a).
      const previous = [makePrevious('a', 1, 150, { rank: 1, cost: 150 })];

      // Act — z added at rank 2, not forgiven
      const result = buildSelectionPayload('event-1', ['a', 'z'], 2, slotRows, 'manual', { previous });

      // Assert — an FFA player is punished by default (rank 2 = 140); admins waive via "No penalty"
      expect(result.find(p => p.user_id === 'z')?.cost).toBe(140);
    });

    it('should bill the cheaper final slot for a DOWN-move by default (no forgiveness needed)', () => {
      // Arrange — 'a' approved for rank 3 (130) but ended at rank 7 (90), a lower/cheaper slot.
      const previous = [makePrevious('a', 3, 130, { rank: 3, cost: 130 })];

      // Act — placed at rank 7, NOT forgiven
      const result = buildSelectionPayload(
        'event-1',
        Array.from({ length: 7 }, (_, i) => (i === 6 ? 'a' : `x${i}`)),
        7,
        slotRows,
        'manual',
        {
          previous,
        }
      );

      // Assert — a billed the cheaper final slot (90), not the approved 130
      expect(result.find(p => p.user_id === 'a')?.cost).toBe(90);
    });

    it('should never bill more than the cheaper of approved/final when a down-mover is forgiven', () => {
      // Arrange — approved rank 3 (130), ended at rank 7 (90). Even if an admin ticks
      // "no penalty", min() keeps it at the cheaper 90 (forgiveness can't raise a cost).
      const previous = [makePrevious('a', 3, 130, { rank: 3, cost: 130 })];

      // Act
      const result = buildSelectionPayload(
        'event-1',
        Array.from({ length: 7 }, (_, i) => (i === 6 ? 'a' : `x${i}`)),
        7,
        slotRows,
        'manual',
        {
          previous,
          forgiven: new Set(['a']),
        }
      );

      // Assert
      expect(result.find(p => p.user_id === 'a')?.cost).toBe(90);
    });
  });

  describe('FFA players added during a correction (not on the original list)', () => {
    // Original published list: 2 approved players (a, b).
    const approvedTwo = () => [
      makePrevious('a', 1, 150, { rank: 1, cost: 150 }),
      makePrevious('b', 2, 140, { rank: 2, cost: 140 }),
    ];

    it('should bill an FFA player their final slot by default, even below the original list', () => {
      // Arrange — list of 2; 'z' (never approved) lands at rank 3, below both. A
      // rule-breaker who snuck in must still be punished unless an admin forgives them.
      const result = buildSelectionPayload('event-1', ['a', 'b', 'z'], 3, slotRows, 'manual', {
        previous: approvedTwo(),
      });

      // Assert — z billed rank 3 (130)
      expect(result.find(p => p.user_id === 'z')?.cost).toBe(130);
    });

    it('should bill an FFA player who displaces the approved order', () => {
      // Arrange — 'z' jumps to rank 1, pushing a and b down.
      const result = buildSelectionPayload('event-1', ['z', 'a', 'b'], 3, slotRows, 'manual', {
        previous: approvedTwo(),
      });

      // Assert — z billed the slot they displaced into (rank 1 = 150)
      expect(result.find(p => p.user_id === 'z')?.cost).toBe(150);
    });

    it('should waive an FFA player to 0 only when explicitly forgiven', () => {
      // Arrange — z at rank 3 (would be billed 130), forgiven
      const result = buildSelectionPayload('event-1', ['a', 'b', 'z'], 3, slotRows, 'manual', {
        previous: approvedTwo(),
        forgiven: new Set(['z']),
      });

      // Assert — forgiven FFA player pays nothing (no approved slot to fall back to)
      expect(result.find(p => p.user_id === 'z')?.cost).toBe(0);
    });
  });

  describe('empty placeholder slots', () => {
    it('should emit an empty row (null user, slot cost shown, label) that occupies its rank', () => {
      // Act — empty slot at rank 2 between two players
      const result = buildSelectionPayload('event-1', ['a', `${EMPTY_SLOT_PREFIX}1`, 'b'], 3, slotRows, 'manual', {
        emptyLabels: new Map([[`${EMPTY_SLOT_PREFIX}1`, 'Ghost']]),
      });

      // Assert
      expect(result.map(p => [p.user_id, p.rank, p.selection_type, p.cost])).toEqual([
        ['a', 1, 'selected', 150],
        [null, 2, 'empty', 140],
        ['b', 3, 'selected', 130],
      ]);
      expect(result[1].label).toBe('Ghost');
    });

    it('should default an empty slot label when none is provided', () => {
      const result = buildSelectionPayload('event-1', [`${EMPTY_SLOT_PREFIX}1`], 1, slotRows, 'manual');
      expect(result[0]).toMatchObject({ selection_type: 'empty', label: DEFAULT_EMPTY_LABEL, user_id: null });
    });
  });
});
