import { describe, it, expect } from 'vitest';
import {
  canForgiveMove,
  deriveForgivenUserIds,
  indexApprovedPlayers,
  isOffListPlayer,
  resolveApprovedBaseline,
  resolvePlayerCost,
  slotCostForRank,
} from './mg-pricing.util';
import { buildMgSlotRows } from './mg-slot.util';
import type { MgSelection } from '@shared/models';

const slotRows = buildMgSlotRows([]);

const makeRow = (overrides: Partial<MgSelection> = {}): MgSelection => ({
  id: 'sel-1',
  mg_event_id: 'event-1',
  user_id: 'a',
  rank: 1,
  selection_type: 'selected',
  selected_by: 'automatic',
  cost: 150,
  label: null,
  approved_rank: null,
  approved_cost: null,
  ...overrides,
});

describe('slotCostForRank', () => {
  it('should return the cost of the slot the rank falls into', () => {
    // Act / Assert
    expect(slotCostForRank(1, slotRows)).toBe(150);
    expect(slotCostForRank(7, slotRows)).toBe(90);
  });

  it('should return 0 when the rank is outside every slot row', () => {
    // Act / Assert
    expect(slotCostForRank(999, slotRows)).toBe(0);
  });
});

describe('indexApprovedPlayers', () => {
  it('should keep only real selected players, keyed by userId', () => {
    // Arrange
    const selection = [
      makeRow({ user_id: 'a' }),
      makeRow({ id: 'sel-2', user_id: null, selection_type: 'ffa', rank: 2 }),
      makeRow({ id: 'sel-3', user_id: null, selection_type: 'empty', rank: 3, label: 'Ghost' }),
    ];

    // Act
    const result = indexApprovedPlayers(selection);

    // Assert
    expect([...result.keys()]).toEqual(['a']);
  });
});

describe('resolveApprovedBaseline', () => {
  it('should use the stamped snapshot when the row has one', () => {
    // Arrange
    const row = makeRow({ rank: 3, cost: 130, approved_rank: 7, approved_cost: 90 });

    // Act / Assert
    expect(resolveApprovedBaseline(row)).toEqual({ rank: 7, cost: 90 });
  });

  it('should fall back to the row rank and cost when the event predates the snapshot columns', () => {
    // Arrange
    const row = makeRow({ rank: 7, cost: 90 });

    // Act / Assert
    expect(resolveApprovedBaseline(row)).toEqual({ rank: 7, cost: 90 });
  });
});

describe('isOffListPlayer', () => {
  it('should be true when an approved list exists and the player is not on it', () => {
    // Arrange
    const approved = indexApprovedPlayers([makeRow({ user_id: 'a' })]);

    // Act / Assert
    expect(isOffListPlayer('z', approved)).toBe(true);
  });

  it('should be false when the player is on the approved list', () => {
    // Arrange
    const approved = indexApprovedPlayers([makeRow({ user_id: 'a' })]);

    // Act / Assert
    expect(isOffListPlayer('a', approved)).toBe(false);
  });

  it('should be false when there is no approved list yet (fresh draft)', () => {
    // Act / Assert
    expect(isOffListPlayer('z', new Map())).toBe(false);
  });
});

describe('resolvePlayerCost', () => {
  const base = { rank: 2, finalRankCost: 140, forgiven: false, offList: false };

  it('should bill an off-list player their final slot when not forgiven', () => {
    // Act
    const cost = resolvePlayerCost({ ...base, saved: undefined, offList: true });

    // Assert
    expect(cost).toBe(140);
  });

  it('should waive an off-list player to 0 when forgiven', () => {
    // Act
    const cost = resolvePlayerCost({ ...base, saved: undefined, offList: true, forgiven: true });

    // Assert
    expect(cost).toBe(0);
  });

  it('should bill the final slot when there is no saved row and no approved list', () => {
    // Act
    const cost = resolvePlayerCost({ ...base, saved: undefined, forgiven: true });

    // Assert
    expect(cost).toBe(140);
  });

  it('should keep the already-charged cost when the rank did not change', () => {
    // Arrange
    const saved = makeRow({ rank: 2, cost: 999 });

    // Act
    const cost = resolvePlayerCost({ ...base, saved });

    // Assert
    expect(cost).toBe(999);
  });

  it('should re-price to the final slot when the rank changed', () => {
    // Arrange
    const saved = makeRow({ rank: 5, cost: 999 });

    // Act
    const cost = resolvePlayerCost({ ...base, saved });

    // Assert
    expect(cost).toBe(140);
  });

  it('should bill the cheaper approved cost when an up-move is forgiven', () => {
    // Arrange
    const saved = makeRow({ rank: 7, cost: 90, approved_rank: 7, approved_cost: 90 });

    // Act
    const cost = resolvePlayerCost({ ...base, rank: 1, finalRankCost: 150, saved, forgiven: true });

    // Assert
    expect(cost).toBe(90);
  });

  it('should never raise the cost above the final slot when a down-move is forgiven', () => {
    // Arrange
    const saved = makeRow({ rank: 3, cost: 130, approved_rank: 3, approved_cost: 130 });

    // Act
    const cost = resolvePlayerCost({ ...base, rank: 7, finalRankCost: 90, saved, forgiven: true });

    // Assert
    expect(cost).toBe(90);
  });
});

describe('canForgiveMove', () => {
  it('should offer forgiveness to an off-list player whatever the slot', () => {
    // Act / Assert
    expect(canForgiveMove({ offList: true, approved: undefined, finalRankCost: 0 })).toBe(true);
  });

  it('should offer forgiveness to a ranked player who moved up to a dearer slot', () => {
    // Act / Assert
    expect(canForgiveMove({ offList: false, approved: { rank: 7, cost: 90 }, finalRankCost: 150 })).toBe(true);
  });

  it('should not offer forgiveness to a ranked player who moved down or stayed', () => {
    // Act / Assert
    expect(canForgiveMove({ offList: false, approved: { rank: 3, cost: 130 }, finalRankCost: 90 })).toBe(false);
    expect(canForgiveMove({ offList: false, approved: { rank: 3, cost: 130 }, finalRankCost: 130 })).toBe(false);
  });

  it('should not offer forgiveness when the player has no approved baseline', () => {
    // Act / Assert
    expect(canForgiveMove({ offList: false, approved: undefined, finalRankCost: 150 })).toBe(false);
  });
});

describe('deriveForgivenUserIds', () => {
  it('should flag a moved player charged exactly their approved cost', () => {
    // Arrange
    const selection = [makeRow({ user_id: 'a', rank: 1, cost: 90, approved_rank: 7, approved_cost: 90 })];

    // Act / Assert
    expect([...deriveForgivenUserIds(selection)]).toEqual(['a']);
  });

  it('should not flag a player who kept their approved rank', () => {
    // Arrange
    const selection = [makeRow({ user_id: 'a', rank: 7, cost: 90, approved_rank: 7, approved_cost: 90 })];

    // Act / Assert
    expect(deriveForgivenUserIds(selection).size).toBe(0);
  });

  it('should not flag a moved player charged something other than their approved cost', () => {
    // Arrange
    const selection = [makeRow({ user_id: 'a', rank: 1, cost: 150, approved_rank: 7, approved_cost: 90 })];

    // Act / Assert
    expect(deriveForgivenUserIds(selection).size).toBe(0);
  });

  it('should ignore rows without a snapshot and rows that are not real players', () => {
    // Arrange
    const selection = [
      makeRow({ user_id: 'a', rank: 1, cost: 90 }),
      makeRow({
        id: 'sel-2',
        user_id: null,
        selection_type: 'empty',
        rank: 2,
        cost: 90,
        approved_rank: 7,
        approved_cost: 90,
      }),
    ];

    // Act / Assert
    expect(deriveForgivenUserIds(selection).size).toBe(0);
  });
});
