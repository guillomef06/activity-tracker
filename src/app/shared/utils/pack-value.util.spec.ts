import { PACK_ITEM_CATALOG } from '@shared/constants/pack-item-catalog.constant';
import { calculatePackValue } from '@shared/utils/pack-value.util';

describe('calculatePackValue', () => {
  it('should return excellent tier when valueRatio >= 1.5', () => {
    // Arrange
    const entries = [{ itemId: 'legendary-gem', quantity: 10 }]; // 1800 AC
    const price = 1000; // ratio = 1.8

    // Act
    const result = calculatePackValue(entries, price, PACK_ITEM_CATALOG);

    // Assert
    expect(result.tier).toBe('excellent');
    expect(result.totalApexCoins).toBe(1800);
    expect(result.valueRatio).toBeCloseTo(1.8, 1);
  });

  it('should return good tier when valueRatio is between 1.0 and 1.49', () => {
    // Arrange
    const entries = [{ itemId: 'speed-up', quantity: 40 }]; // 100 AC
    const price = 99; // ratio ≈ 1.01

    // Act
    const result = calculatePackValue(entries, price, PACK_ITEM_CATALOG);

    // Assert
    expect(result.tier).toBe('good');
    expect(result.valueRatio).toBeCloseTo(1.01, 2);
  });

  it('should return average tier when valueRatio is between 0.7 and 0.99', () => {
    // Arrange
    const entries = [{ itemId: 'silver-sand', quantity: 2 }]; // 50 AC
    const price = 60; // ratio ≈ 0.83

    // Act
    const result = calculatePackValue(entries, price, PACK_ITEM_CATALOG);

    // Assert
    expect(result.tier).toBe('average');
    expect(result.valueRatio).toBeCloseTo(0.83, 2);
  });

  it('should return terrible tier when valueRatio < 0.7', () => {
    // Arrange
    const entries = [{ itemId: 'insight-point', quantity: 10 }]; // 4 AC
    const price = 100; // ratio = 0.04

    // Act
    const result = calculatePackValue(entries, price, PACK_ITEM_CATALOG);

    // Assert
    expect(result.tier).toBe('terrible');
    expect(result.valueRatio).toBeLessThan(0.7);
  });

  it('should calculate speed-up using apexCoinsPerUnit (2.5 AC per hour)', () => {
    // Arrange
    const entries = [{ itemId: 'speed-up', quantity: 100 }]; // 100h * 2.5 = 250 AC
    const price = 100;

    // Act
    const result = calculatePackValue(entries, price, PACK_ITEM_CATALOG);

    // Assert
    expect(result.totalApexCoins).toBe(250);
    expect(result.breakdown[0].apexCoinsPerUnit).toBe(2.5);
  });

  it('should sum multiple entries correctly', () => {
    // Arrange
    const entries = [
      { itemId: 'fine-gold', quantity: 2 }, // 2 * 50 = 100 AC
      { itemId: 'silver-sand', quantity: 4 }, // 4 * 25 = 100 AC
    ];
    const price = 200;

    // Act
    const result = calculatePackValue(entries, price, PACK_ITEM_CATALOG);

    // Assert
    expect(result.totalApexCoins).toBe(200);
    expect(result.valueRatio).toBe(1);
    expect(result.breakdown).toHaveLength(2);
  });

  it('should skip unknown item ids silently', () => {
    // Arrange
    const entries = [
      { itemId: 'unknown-item', quantity: 5 },
      { itemId: 'fine-gold', quantity: 1 }, // 50 AC
    ];
    const price = 25;

    // Act
    const result = calculatePackValue(entries, price, PACK_ITEM_CATALOG);

    // Assert
    expect(result.totalApexCoins).toBe(50);
    expect(result.breakdown).toHaveLength(1);
  });

  it('should include breakdown with nameKey, apexCoinsPerUnit, and quantity for each entry', () => {
    // Arrange
    const entries = [{ itemId: 'golden-key', quantity: 3 }]; // 3 * 10 = 30 AC
    const price = 10;

    // Act
    const result = calculatePackValue(entries, price, PACK_ITEM_CATALOG);

    // Assert
    expect(result.breakdown[0].nameKey).toBe('packValue.items.goldenKey');
    expect(result.breakdown[0].apexCoinsPerUnit).toBe(10);
    expect(result.breakdown[0].quantity).toBe(3);
  });

  it('should set priceAC to the provided price', () => {
    // Arrange
    const entries = [{ itemId: 'raw-iron', quantity: 1 }];
    const price = 10;

    // Act
    const result = calculatePackValue(entries, price, PACK_ITEM_CATALOG);

    // Assert
    expect(result.priceAC).toBe(10);
  });

  it('should return 0 valueRatio when price is 0', () => {
    // Arrange
    const entries = [{ itemId: 'fine-gold', quantity: 1 }];
    const price = 0;

    // Act
    const result = calculatePackValue(entries, price, PACK_ITEM_CATALOG);

    // Assert
    expect(result.valueRatio).toBe(0);
  });
});
