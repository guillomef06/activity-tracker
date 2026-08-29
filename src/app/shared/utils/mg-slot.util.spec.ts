import { describe, it, expect } from 'vitest';
import { buildMgSlotRows } from '@shared/utils/mg-slot.util';
import { MG_SLOT_DEFAULTS } from '@shared/constants/mg-slots.constant';

describe('buildMgSlotRows', () => {
  it('should return all 10 defaults when config is empty', () => {
    // Arrange
    const config: { slot_order: number; cost: number; target_min: number; target_max: number }[] = [];

    // Act
    const result = buildMgSlotRows(config);

    // Assert
    expect(result).toHaveLength(10);
    result.forEach((row, i) => {
      const expected = MG_SLOT_DEFAULTS[i];
      expect(row).toEqual({
        rankLabel: expected.rankLabel,
        medal: expected.medal,
        slotOrder: expected.slotOrder,
        cost: expected.cost,
        targetMin: expected.targetMin,
        targetMax: expected.targetMax,
      });
    });
  });

  it('should override only the matching slot_orders and keep others at default', () => {
    // Arrange
    const config = [
      { slot_order: 1, cost: 999, target_min: 40, target_max: 45 },
      { slot_order: 6, cost: 111, target_min: 5, target_max: 6 },
    ];

    // Act
    const result = buildMgSlotRows(config);

    // Assert — overridden rows
    const slot1 = result.find(r => r.slotOrder === 1);
    expect(slot1).toEqual({
      rankLabel: '1',
      medal: 100,
      slotOrder: 1,
      cost: 999,
      targetMin: 40,
      targetMax: 45,
    });

    const slot6 = result.find(r => r.slotOrder === 6);
    expect(slot6).toEqual({
      rankLabel: '6-7',
      medal: 20,
      slotOrder: 6,
      cost: 111,
      targetMin: 5,
      targetMax: 6,
    });

    // Assert — untouched rows stay at default
    const slot2 = result.find(r => r.slotOrder === 2);
    expect(slot2).toEqual({
      rankLabel: '2',
      medal: 80,
      slotOrder: 2,
      cost: 140,
      targetMin: 29,
      targetMax: 29,
    });
  });

  it('should override every row when config provides all 10 slot_orders', () => {
    // Arrange
    const config = MG_SLOT_DEFAULTS.map(d => ({
      slot_order: d.slotOrder,
      cost: d.cost + 1,
      target_min: d.targetMin + 1,
      target_max: d.targetMax + 2,
    }));

    // Act
    const result = buildMgSlotRows(config);

    // Assert
    expect(result).toHaveLength(10);
    result.forEach((row, i) => {
      const expected = MG_SLOT_DEFAULTS[i];
      expect(row).toEqual({
        rankLabel: expected.rankLabel,
        medal: expected.medal,
        slotOrder: expected.slotOrder,
        cost: expected.cost + 1,
        targetMin: expected.targetMin + 1,
        targetMax: expected.targetMax + 2,
      });
    });
  });
});
