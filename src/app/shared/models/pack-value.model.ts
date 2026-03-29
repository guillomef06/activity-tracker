export interface PackItem {
  readonly id: string;
  readonly nameKey: string;
  readonly apexCoinsPerUnit: number;
  readonly unitKey: string;
}

export interface PackItemEntry {
  itemId: string;
  quantity: number;
}

export interface PackItemBreakdown {
  nameKey: string;
  apexCoinsPerUnit: number;
  quantity: number;
}

export interface PackValueResult {
  totalApexCoins: number;
  priceAC: number;
  valueRatio: number;
  tier: PackValueTier;
  breakdown: PackItemBreakdown[];
}

export type PackValueTier = 'terrible' | 'average' | 'good' | 'excellent';

export interface TierDefinition {
  tier: PackValueTier;
  minValueRatio: number;
  colorClass: string;
  icon: string;
}
