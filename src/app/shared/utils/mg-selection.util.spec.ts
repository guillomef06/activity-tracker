import { describe, it, expect } from 'vitest';
import { buildSelectionPayload } from './mg-selection.util';
import { buildMgSlotRows } from './mg-slot.util';
import type { MgSelection } from '@shared/models';

const slotRows = buildMgSlotRows([]);

const makePrevious = (userId: string | null, rank: number, cost: number): MgSelection => ({
  id: `sel-${rank}`,
  mg_event_id: 'event-1',
  user_id: userId,
  rank,
  selection_type: userId ? 'selected' : 'ffa',
  selected_by: 'automatic',
  cost,
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
      const result = buildSelectionPayload('event-1', ['a'], 1, slotRows, 'manual', previous);

      // Assert
      expect(result[0].cost).toBe(999);
    });

    it('should re-price a player whose rank changed', () => {
      // Arrange
      const previous = [makePrevious('a', 1, 999), makePrevious('b', 2, 888)];

      // Act — a and b swap places
      const result = buildSelectionPayload('event-1', ['b', 'a'], 2, slotRows, 'manual', previous);

      // Assert
      expect(result.map(p => [p.user_id, p.cost])).toEqual([
        ['b', 150],
        ['a', 140],
      ]);
    });

    it('should price a newly added player from the slot rows', () => {
      // Arrange
      const previous = [makePrevious('a', 1, 999)];

      // Act
      const result = buildSelectionPayload('event-1', ['a', 'z'], 2, slotRows, 'manual', previous);

      // Assert
      expect(result[1]).toMatchObject({ user_id: 'z', cost: 140 });
    });

    it('should ignore previous free-for-all rows', () => {
      // Arrange
      const previous = [makePrevious(null, 1, 500)];

      // Act
      const result = buildSelectionPayload('event-1', ['a'], 1, slotRows, 'manual', previous);

      // Assert
      expect(result[0].cost).toBe(150);
    });
  });
});
