import { MG_SLOT_DEFAULTS } from '@shared/constants/mg-slots.constant';

/**
 * A fully-resolved MG slot row: fixed rankLabel/medal plus cost/target
 * thresholds, either overridden by the server's saved config or falling
 * back to MG_SLOT_DEFAULTS.
 */
export interface MgSlotRow {
  rankLabel: string;
  medal: number;
  slotOrder: number;
  cost: number;
  targetMin: number;
  targetMax: number;
}

/**
 * Merges a server's saved server_mg_slot_config rows on top of
 * MG_SLOT_DEFAULTS, keyed by slot_order. A slot_order absent from `config`
 * falls back to its hardcoded default. Single source of truth for this
 * merge — consumed by both the player-facing table and the admin form.
 */
export function buildMgSlotRows(
  config: readonly { slot_order: number; cost: number; target_min: number; target_max: number }[]
): MgSlotRow[] {
  const bySlotOrder = new Map(config.map(c => [c.slot_order, c]));
  return MG_SLOT_DEFAULTS.map(d => {
    const override = bySlotOrder.get(d.slotOrder);
    return {
      rankLabel: d.rankLabel,
      medal: d.medal,
      slotOrder: d.slotOrder,
      cost: override?.cost ?? d.cost,
      targetMin: override?.target_min ?? d.targetMin,
      targetMax: override?.target_max ?? d.targetMax,
    };
  });
}
