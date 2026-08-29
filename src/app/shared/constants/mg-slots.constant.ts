/**
 * Mightiest Governor (MG) per-rank slot defaults.
 *
 * Rank labels and medal counts are fixed/universal and not configurable.
 * cost/targetMin/targetMax are the fallback defaults used until a server
 * saves its own server_mg_slot_config rows (see 33-mg-slot-config.sql and
 * buildMgSlotRows() in mg-slot.util.ts, which merges per-server overrides
 * on top of these defaults).
 */
export interface MgSlotDefault {
  rankLabel: string;
  medal: number;
  slotOrder: number;
  cost: number;
  targetMin: number;
  targetMax: number;
}

export const MG_SLOT_DEFAULTS: readonly MgSlotDefault[] = [
  { rankLabel: '1', medal: 100, slotOrder: 1, cost: 150, targetMin: 30, targetMax: 30 },
  { rankLabel: '2', medal: 80, slotOrder: 2, cost: 140, targetMin: 29, targetMax: 29 },
  { rankLabel: '3', medal: 60, slotOrder: 3, cost: 130, targetMin: 28, targetMax: 28 },
  { rankLabel: '4', medal: 40, slotOrder: 4, cost: 120, targetMin: 27, targetMax: 27 },
  { rankLabel: '5', medal: 30, slotOrder: 5, cost: 100, targetMin: 26, targetMax: 26 },
  { rankLabel: '6-7', medal: 20, slotOrder: 6, cost: 90, targetMin: 24, targetMax: 26 },
  { rankLabel: '8-10', medal: 15, slotOrder: 7, cost: 80, targetMin: 22, targetMax: 24 },
  { rankLabel: '11-15', medal: 12, slotOrder: 8, cost: 75, targetMin: 20, targetMax: 22 },
  { rankLabel: '16-25', medal: 10, slotOrder: 9, cost: 70, targetMin: 15, targetMax: 20 },
  { rankLabel: '26-50', medal: 5, slotOrder: 10, cost: 60, targetMin: 10, targetMax: 15 },
];
