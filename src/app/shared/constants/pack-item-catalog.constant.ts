import { PackItem, TierDefinition } from '@shared/models/pack-value.model';

const QTY = 'packValue.units.qty';
const HOURS = 'packValue.units.hours';

export const PACK_ITEM_CATALOG: readonly PackItem[] = [
  { id: 'speed-up', nameKey: 'packValue.items.speedUp', apexCoinsPerUnit: 2.5, unitKey: HOURS },
  {
    id: 'legendary-lightning-crystal',
    nameKey: 'packValue.items.legendaryLightningCrystal',
    apexCoinsPerUnit: 15,
    unitKey: QTY,
  },
  {
    id: 'legendary-magma-crystal',
    nameKey: 'packValue.items.legendaryMagmaCrystal',
    apexCoinsPerUnit: 10,
    unitKey: QTY,
  },
  { id: 'fine-gold', nameKey: 'packValue.items.fineGold', apexCoinsPerUnit: 50, unitKey: QTY },
  { id: 'silver-sand', nameKey: 'packValue.items.silverSand', apexCoinsPerUnit: 25, unitKey: QTY },
  { id: 'copper-sand', nameKey: 'packValue.items.copperSand', apexCoinsPerUnit: 12, unitKey: QTY },
  {
    id: 'universal-legendary-hero-medal',
    nameKey: 'packValue.items.universalLegendaryHeroMedal',
    apexCoinsPerUnit: 100,
    unitKey: QTY,
  },
  { id: 'forging-kit', nameKey: 'packValue.items.forgingKit', apexCoinsPerUnit: 10, unitKey: QTY },
  { id: 'planishing-hammer', nameKey: 'packValue.items.planishingHammer', apexCoinsPerUnit: 50, unitKey: QTY },
  { id: 'legendary-skill-scroll', nameKey: 'packValue.items.legendarySkillScroll', apexCoinsPerUnit: 15, unitKey: QTY },
  { id: 'technique-point', nameKey: 'packValue.items.techniquePoint', apexCoinsPerUnit: 4, unitKey: QTY },
  { id: 'epic-gem', nameKey: 'packValue.items.epicGem', apexCoinsPerUnit: 60, unitKey: QTY },
  { id: 'legendary-gem', nameKey: 'packValue.items.legendaryGem', apexCoinsPerUnit: 180, unitKey: QTY },
  { id: 'raw-iron', nameKey: 'packValue.items.rawIron', apexCoinsPerUnit: 2, unitKey: QTY },
  { id: 'insight-point', nameKey: 'packValue.items.insightPoint', apexCoinsPerUnit: 0.4, unitKey: QTY },
  { id: 'mount-whistle', nameKey: 'packValue.items.mountWhistle', apexCoinsPerUnit: 40, unitKey: QTY },
  { id: 'meteorite-steel', nameKey: 'packValue.items.meteoriteSteel', apexCoinsPerUnit: 100, unitKey: QTY },
  { id: 'refined-iron', nameKey: 'packValue.items.refinedIron', apexCoinsPerUnit: 20, unitKey: QTY },
  { id: 'golden-key', nameKey: 'packValue.items.goldenKey', apexCoinsPerUnit: 10, unitKey: QTY },
  { id: 'torch-of-enlightenment', nameKey: 'packValue.items.torchOfEnlightenment', apexCoinsPerUnit: 10, unitKey: QTY },
  { id: 'meteor-steel', nameKey: 'packValue.items.meteorSteel', apexCoinsPerUnit: 1000, unitKey: QTY },
  { id: 'crimson-meteorite', nameKey: 'packValue.items.crimsonMeteorite', apexCoinsPerUnit: 30, unitKey: QTY },
] as const;

export const PACK_VALUE_TIERS: readonly TierDefinition[] = [
  { tier: 'excellent', minValueRatio: 1.5, colorClass: 'tier-excellent', icon: 'star' },
  { tier: 'good', minValueRatio: 1.0, colorClass: 'tier-good', icon: 'sentiment_satisfied' },
  { tier: 'average', minValueRatio: 0.7, colorClass: 'tier-average', icon: 'sentiment_neutral' },
  { tier: 'terrible', minValueRatio: 0, colorClass: 'tier-terrible', icon: 'sentiment_very_dissatisfied' },
] as const;
