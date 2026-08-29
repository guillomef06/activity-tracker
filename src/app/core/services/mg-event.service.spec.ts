import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { MgRegistration, MgLeaderboardEntry, MgSelectionPayload, ServerMgSlotConfig } from '@shared/models';
import { MgEventService } from './mg-event.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { buildMgSlotRows, resolveSlotForRank, type MgSlotRow } from '@shared/utils/mg-slot.util';

function generateAutoSelectionPayload(
  mgEventId: string,
  registrations: MgRegistration[],
  scores: MgLeaderboardEntry[],
  capacity: number,
  slotRows: MgSlotRow[]
): MgSelectionPayload[] {
  const scoreByUserId = new Map(scores.map(s => [s.user_id, s.total_points]));
  const sorted = [...registrations].sort(
    (a, b) => (scoreByUserId.get(b.user_id) ?? 0) - (scoreByUserId.get(a.user_id) ?? 0)
  );
  const selected = sorted.slice(0, capacity);
  const ffaCount = Math.max(0, capacity - selected.length);
  const payloads: MgSelectionPayload[] = selected.map((reg, i) => ({
    mg_event_id: mgEventId,
    user_id: reg.user_id,
    rank: i + 1,
    selection_type: 'selected' as const,
    selected_by: 'automatic' as const,
    cost: resolveSlotForRank(i + 1, slotRows)?.cost ?? 0,
  }));
  for (let i = 0; i < ffaCount; i++) {
    payloads.push({
      mg_event_id: mgEventId,
      user_id: null,
      rank: selected.length + i + 1,
      selection_type: 'ffa' as const,
      selected_by: 'automatic' as const,
      cost: 0,
    });
  }
  return payloads;
}

const makeReg = (userId: string): MgRegistration => ({
  id: userId + '-reg',
  mg_event_id: 'event-1',
  user_id: userId,
  registered_at: new Date().toISOString(),
});

const makeScore = (userId: string, total: number): MgLeaderboardEntry => ({
  user_id: userId,
  display_name: userId,
  total_points: total,
});

const defaultSlotRows = buildMgSlotRows([]);

describe('generateAutoSelectionPayload', () => {
  it('should select top N by score', () => {
    const regs = [makeReg('a'), makeReg('b'), makeReg('c')];
    const scores = [makeScore('a', 10), makeScore('b', 30), makeScore('c', 20)];
    const result = generateAutoSelectionPayload('event-1', regs, scores, 2, defaultSlotRows);
    expect(result).toHaveLength(2);
    expect(result[0].user_id).toBe('b');
    expect(result[0].rank).toBe(1);
    expect(result[1].user_id).toBe('c');
    expect(result[1].rank).toBe(2);
    expect(result.every(r => r.selection_type === 'selected')).toBe(true);
  });

  it('should fill FFA slots when fewer registrations than capacity', () => {
    const regs = [makeReg('a'), makeReg('b')];
    const scores = [makeScore('a', 10), makeScore('b', 5)];
    const result = generateAutoSelectionPayload('event-1', regs, scores, 5, defaultSlotRows);
    expect(result).toHaveLength(5);
    const selected = result.filter(r => r.selection_type === 'selected');
    const ffa = result.filter(r => r.selection_type === 'ffa');
    expect(selected).toHaveLength(2);
    expect(ffa).toHaveLength(3);
    expect(ffa.every(r => r.user_id === null)).toBe(true);
  });

  it('should produce 100% FFA when no registrations', () => {
    const result = generateAutoSelectionPayload('event-1', [], [], 10, defaultSlotRows);
    expect(result).toHaveLength(10);
    expect(result.every(r => r.selection_type === 'ffa')).toBe(true);
    expect(result.every(r => r.user_id === null)).toBe(true);
  });

  it('should have ranks 1-based and contiguous', () => {
    const regs = [makeReg('a'), makeReg('b'), makeReg('c')];
    const scores = [makeScore('a', 1), makeScore('b', 2), makeScore('c', 3)];
    const result = generateAutoSelectionPayload('event-1', regs, scores, 5, defaultSlotRows);
    expect(result.map(r => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });

  it('should handle players with no score (defaults to 0)', () => {
    const regs = [makeReg('a'), makeReg('unknown')];
    const scores = [makeScore('a', 10)];
    const result = generateAutoSelectionPayload('event-1', regs, scores, 2, defaultSlotRows);
    expect(result[0].user_id).toBe('a');
    expect(result[1].user_id).toBe('unknown');
  });

  it('should assign each selected slot the cost resolved from its rank', () => {
    const regs = [makeReg('a'), makeReg('b'), makeReg('c')];
    const scores = [makeScore('a', 30), makeScore('b', 20), makeScore('c', 10)];
    const result = generateAutoSelectionPayload('event-1', regs, scores, 3, defaultSlotRows);
    expect(result[0].cost).toBe(150); // rank 1
    expect(result[1].cost).toBe(140); // rank 2
    expect(result[2].cost).toBe(130); // rank 3
  });

  it('should assign cost 0 to FFA slots', () => {
    const result = generateAutoSelectionPayload('event-1', [], [], 2, defaultSlotRows);
    expect(result.every(r => r.cost === 0)).toBe(true);
  });
});

const makeSlotConfigRow = (overrides: Partial<ServerMgSlotConfig> = {}): ServerMgSlotConfig => ({
  id: 'slot-1',
  server_id: 'server-1',
  slot_order: 1,
  cost: 150,
  target_min: 30,
  target_max: 30,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  ...overrides,
});

describe('MgEventService', () => {
  let service: MgEventService;
  let fromMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fromMock = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        MgEventService,
        { provide: SupabaseService, useValue: { from: fromMock } },
        {
          provide: AuthService,
          useValue: { getServerId: vi.fn().mockReturnValue(null), getUserId: vi.fn().mockReturnValue(null) },
        },
      ],
    });

    service = TestBed.inject(MgEventService);
  });

  // ============================================
  describe('loadSlotConfig', () => {
    it('should return the slot config rows ordered by slot_order on success', async () => {
      // Arrange
      const rows = [
        makeSlotConfigRow({ id: 'slot-1', slot_order: 1 }),
        makeSlotConfigRow({ id: 'slot-2', slot_order: 2 }),
      ];
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockReturnThis();
      chain['order'] = vi.fn().mockResolvedValue({ data: rows, error: null });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.loadSlotConfig('server-1');

      // Assert
      expect(result).toEqual(rows);
      expect(chain['eq']).toHaveBeenCalledWith('server_id', 'server-1');
      expect(chain['order']).toHaveBeenCalledWith('slot_order', { ascending: true });
    });

    it('should return an empty array on Supabase error', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockReturnThis();
      chain['order'] = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.loadSlotConfig('server-1');

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ============================================
  describe('saveSlotConfig', () => {
    it('should upsert the rows with server_id attached and return no error on success', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['upsert'] = vi.fn().mockResolvedValue({ error: null });
      fromMock.mockReturnValue(chain);
      const rows = [{ slot_order: 1, cost: 150, target_min: 30, target_max: 30 }];

      // Act
      const result = await service.saveSlotConfig('server-1', rows);

      // Assert
      expect(result.error).toBeNull();
      expect(chain['upsert']).toHaveBeenCalledWith(
        [{ server_id: 'server-1', slot_order: 1, cost: 150, target_min: 30, target_max: 30 }],
        { onConflict: 'server_id,slot_order' }
      );
    });

    it('should pass through the Supabase error on failure', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['upsert'] = vi.fn().mockResolvedValue({ error: { message: 'constraint violation' } });
      fromMock.mockReturnValue(chain);
      const rows = [{ slot_order: 1, cost: 150, target_min: 30, target_max: 30 }];

      // Act
      const result = await service.saveSlotConfig('server-1', rows);

      // Assert
      expect(result.error).toEqual({ message: 'constraint violation' });
    });
  });

  // ============================================
  describe('loadCostDeductions', () => {
    const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);
    const pastWeekStart = (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return toIsoDate(d);
    })();
    const futureWeekStart = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      return toIsoDate(d);
    })();

    it('should sum cost per user for events whose week has already ended', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockReturnThis();
      chain['not'] = vi.fn().mockReturnThis();
      chain['gte'] = vi.fn().mockResolvedValue({
        data: [
          { user_id: 'a', cost: 150, mg_events: { start_date: pastWeekStart } },
          { user_id: 'a', cost: 90, mg_events: { start_date: pastWeekStart } },
          { user_id: 'b', cost: 100, mg_events: { start_date: pastWeekStart } },
        ],
        error: null,
      });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.loadCostDeductions('server-1', new Date(0));

      // Assert
      expect(result.get('a')).toBe(240);
      expect(result.get('b')).toBe(100);
    });

    it('should exclude events whose week has not ended yet', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockReturnThis();
      chain['not'] = vi.fn().mockReturnThis();
      chain['gte'] = vi.fn().mockResolvedValue({
        data: [{ user_id: 'a', cost: 150, mg_events: { start_date: futureWeekStart } }],
        error: null,
      });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.loadCostDeductions('server-1', new Date(0));

      // Assert
      expect(result.size).toBe(0);
    });

    it('should return an empty Map on Supabase error', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockReturnThis();
      chain['not'] = vi.fn().mockReturnThis();
      chain['gte'] = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.loadCostDeductions('server-1', new Date(0));

      // Assert
      expect(result.size).toBe(0);
    });
  });
});
