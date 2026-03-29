import { PACK_VALUE_TIERS } from '@shared/constants/pack-item-catalog.constant';
import { PackItem, PackItemEntry, PackValueResult } from '@shared/models/pack-value.model';

export function calculatePackValue(
  entries: PackItemEntry[],
  price: number,
  catalog: readonly PackItem[]
): PackValueResult {
  const breakdown = entries
    .map(entry => {
      const item = catalog.find(c => c.id === entry.itemId);
      if (!item) return null;

      return { nameKey: item.nameKey, apexCoinsPerUnit: item.apexCoinsPerUnit, quantity: entry.quantity };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);

  const totalApexCoins = breakdown.reduce((sum, b) => sum + b.apexCoinsPerUnit * b.quantity, 0);
  const valueRatio = price > 0 ? totalApexCoins / price : 0;

  const matchingTier = PACK_VALUE_TIERS.find(t => valueRatio >= t.minValueRatio);
  const tier = matchingTier?.tier ?? 'terrible';

  return { totalApexCoins, priceAC: price, valueRatio, tier, breakdown };
}
