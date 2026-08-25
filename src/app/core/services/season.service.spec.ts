import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SeasonService } from './season.service';
import { SupabaseService } from './supabase.service';

interface SeasonRow {
  id: string;
  name: string;
  start_date: string;
  week_count: number;
  end_date: string;
  created_at: string;
  updated_at: string;
  season_activities: { id: string; season_id: string; week_index: number; activity_type: string }[];
}

const makeSeasonRow = (overrides: Partial<SeasonRow> = {}): SeasonRow => ({
  id: 'season-1',
  name: 'Season 1',
  start_date: '2026-05-11',
  week_count: 6,
  end_date: '2026-06-21',
  created_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
  season_activities: [{ id: 'sa-1', season_id: 'season-1', week_index: 3, activity_type: 'primordial conflict' }],
  ...overrides,
});

describe('SeasonService', () => {
  let service: SeasonService;
  let fromMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fromMock = vi.fn();

    TestBed.configureTestingModule({
      providers: [SeasonService, { provide: SupabaseService, useValue: { from: fromMock } }],
    });

    service = TestBed.inject(SeasonService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ============================================
  describe('loadSeasons', () => {
    it('should populate seasons sorted by startDate ascending on success', async () => {
      // Arrange
      const rows = [
        makeSeasonRow({ id: 's-2', start_date: '2026-06-22', end_date: '2026-08-02' }),
        makeSeasonRow({ id: 's-1', start_date: '2026-05-11', end_date: '2026-06-21' }),
      ];
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockResolvedValue({ data: rows, error: null });
      fromMock.mockReturnValue(chain);

      // Act
      await service.loadSeasons();

      // Assert
      const seasons = service.seasons();
      expect(seasons).toHaveLength(2);
      expect(seasons[0].id).toBe('s-1');
      expect(seasons[1].id).toBe('s-2');
    });

    it('should set an empty array on DB error', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
      fromMock.mockReturnValue(chain);

      // Act
      await service.loadSeasons();

      // Assert
      expect(service.seasons()).toEqual([]);
    });
  });

  // ============================================
  describe('getSeasonForDate', () => {
    const seedOneSeason = async (): Promise<void> => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockResolvedValue({ data: [makeSeasonRow()], error: null });
      fromMock.mockReturnValue(chain);
      await service.loadSeasons();
    };

    it('should return the season when date is exactly on start_date', async () => {
      // Arrange
      await seedOneSeason();

      // Act
      const result = service.getSeasonForDate(new Date('2026-05-11T00:00:00Z'));

      // Assert
      expect(result?.id).toBe('season-1');
    });

    it('should return the season when date is exactly on end_date', async () => {
      // Arrange
      await seedOneSeason();

      // Act
      const result = service.getSeasonForDate(new Date('2026-06-21T23:59:59Z'));

      // Assert
      expect(result?.id).toBe('season-1');
    });

    it('should return null when date is outside all seasons', async () => {
      // Arrange
      await seedOneSeason();

      // Act
      const result = service.getSeasonForDate(new Date('2026-01-01T00:00:00Z'));

      // Assert
      expect(result).toBeNull();
    });
  });

  // ============================================
  describe('getAvailableActivityTypesForDate', () => {
    it('should return an empty array when no season covers the date', async () => {
      // Arrange — no seasons loaded

      // Act
      const result = service.getAvailableActivityTypesForDate(new Date('2026-05-13T00:00:00Z'));

      // Assert
      expect(result).toEqual([]);
    });

    it('should always include legion plus scheduled types for the resolved week', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockResolvedValue({ data: [makeSeasonRow()], error: null });
      fromMock.mockReturnValue(chain);
      await service.loadSeasons();

      // Act — week 3 (May 25-31) has 'primordial conflict' scheduled
      const result = service.getAvailableActivityTypesForDate(new Date('2026-05-27T00:00:00Z'));

      // Assert
      const values = result.map(t => t.value);
      expect(values).toContain('legion');
      expect(values).toContain('primordial conflict');
      expect(values).not.toContain('kvk prep');
    });
  });

  // ============================================
  describe('getEarliestAllowedDate', () => {
    it('should return null when no seasons exist', () => {
      // Act
      const result = service.getEarliestAllowedDate();

      // Assert
      expect(result).toBeNull();
    });

    it('should return the minimum startDate across multiple seasons', async () => {
      // Arrange
      const rows = [
        makeSeasonRow({ id: 's-2', start_date: '2026-06-22', end_date: '2026-08-02' }),
        makeSeasonRow({ id: 's-1', start_date: '2026-05-11', end_date: '2026-06-21' }),
      ];
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockResolvedValue({ data: rows, error: null });
      fromMock.mockReturnValue(chain);
      await service.loadSeasons();

      // Act
      const result = service.getEarliestAllowedDate();

      // Assert
      expect(result?.toISOString().slice(0, 10)).toBe('2026-05-11');
    });
  });

  // ============================================
  describe('suggestNextSeasonStartDate', () => {
    it('should return the Monday of the current week when no seasons exist', () => {
      // Act
      const result = service.suggestNextSeasonStartDate();

      // Assert
      expect(result.getUTCDay()).toBe(1);
    });

    it('should return the Monday after the latest endDate across multiple seasons', async () => {
      // Arrange
      const rows = [
        makeSeasonRow({ id: 's-1', start_date: '2026-05-11', end_date: '2026-06-21' }),
        makeSeasonRow({ id: 's-2', start_date: '2026-06-22', end_date: '2026-08-02' }),
      ];
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockResolvedValue({ data: rows, error: null });
      fromMock.mockReturnValue(chain);
      await service.loadSeasons();

      // Act
      const result = service.suggestNextSeasonStartDate();

      // Assert — day after 2026-08-02 (Sunday) is 2026-08-03 (Monday)
      expect(result.toISOString().slice(0, 10)).toBe('2026-08-03');
    });
  });

  // ============================================
  describe('createSeason', () => {
    const validRequest = {
      name: 'Season 2',
      startDate: new Date('2026-05-11T00:00:00Z'),
      weekCount: 6,
      weekActivities: [{ weekIndex: 3, activityType: 'primordial conflict' }],
    };

    it('should insert the season and week rows, then return the created season', async () => {
      // Arrange
      const insertChain: Record<string, ReturnType<typeof vi.fn>> = {};
      insertChain['insert'] = vi.fn().mockReturnThis();
      insertChain['select'] = vi.fn().mockReturnThis();
      insertChain['single'] = vi.fn().mockResolvedValue({ data: { id: 'season-1' }, error: null });

      const weekInsertChain: Record<string, ReturnType<typeof vi.fn>> = {};
      weekInsertChain['insert'] = vi.fn().mockResolvedValue({ error: null });

      const listChain: Record<string, ReturnType<typeof vi.fn>> = {};
      listChain['select'] = vi.fn().mockResolvedValue({ data: [makeSeasonRow()], error: null });

      fromMock.mockReturnValueOnce(insertChain).mockReturnValueOnce(weekInsertChain).mockReturnValueOnce(listChain);

      // Act
      const result = await service.createSeason(validRequest);

      // Assert
      expect(result.error).toBeNull();
      expect(result.season?.id).toBe('season-1');
    });

    it('should return a validation error and skip the DB call when start_date is not a Monday', async () => {
      // Act
      const result = await service.createSeason({ ...validRequest, startDate: new Date('2026-05-12T00:00:00Z') });

      // Assert
      expect(result.error).toBe('season.errors.startDateMustBeMonday');
      expect(fromMock).not.toHaveBeenCalled();
    });

    it('should surface the Supabase error and not attempt cleanup when the season insert itself fails', async () => {
      // Arrange
      const insertChain: Record<string, ReturnType<typeof vi.fn>> = {};
      insertChain['insert'] = vi.fn().mockReturnThis();
      insertChain['select'] = vi.fn().mockReturnThis();
      insertChain['single'] = vi.fn().mockResolvedValue({ data: null, error: { message: 'contiguity violation' } });
      fromMock.mockReturnValue(insertChain);

      // Act
      const result = await service.createSeason(validRequest);

      // Assert
      expect(result.season).toBeNull();
      expect(result.error).toBe('contiguity violation');
    });

    it('should best-effort delete the orphaned season when the week-activities insert fails', async () => {
      // Arrange
      const insertChain: Record<string, ReturnType<typeof vi.fn>> = {};
      insertChain['insert'] = vi.fn().mockReturnThis();
      insertChain['select'] = vi.fn().mockReturnThis();
      insertChain['single'] = vi.fn().mockResolvedValue({ data: { id: 'season-1' }, error: null });

      const weekInsertChain: Record<string, ReturnType<typeof vi.fn>> = {};
      weekInsertChain['insert'] = vi.fn().mockResolvedValue({ error: { message: 'week insert failed' } });

      const deleteChain: Record<string, ReturnType<typeof vi.fn>> = {};
      deleteChain['delete'] = vi.fn().mockReturnThis();
      deleteChain['eq'] = vi.fn().mockResolvedValue({ error: null });

      fromMock.mockReturnValueOnce(insertChain).mockReturnValueOnce(weekInsertChain).mockReturnValueOnce(deleteChain);

      // Act
      const result = await service.createSeason(validRequest);

      // Assert
      expect(result.season).toBeNull();
      expect(result.error).toBe('week insert failed');
      expect(deleteChain['delete']).toHaveBeenCalled();
    });
  });

  // ============================================
  describe('updateSeasonStructure', () => {
    it('should update week_count, replace week rows, and reload on success', async () => {
      // Arrange
      const updateChain: Record<string, ReturnType<typeof vi.fn>> = {};
      updateChain['update'] = vi.fn().mockReturnThis();
      updateChain['eq'] = vi.fn().mockResolvedValue({ error: null });

      const deleteChain: Record<string, ReturnType<typeof vi.fn>> = {};
      deleteChain['delete'] = vi.fn().mockReturnThis();
      deleteChain['eq'] = vi.fn().mockResolvedValue({ error: null });

      const weekInsertChain: Record<string, ReturnType<typeof vi.fn>> = {};
      weekInsertChain['insert'] = vi.fn().mockResolvedValue({ error: null });

      const listChain: Record<string, ReturnType<typeof vi.fn>> = {};
      listChain['select'] = vi.fn().mockResolvedValue({ data: [makeSeasonRow()], error: null });

      fromMock
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(deleteChain)
        .mockReturnValueOnce(weekInsertChain)
        .mockReturnValueOnce(listChain);

      // Act
      const result = await service.updateSeasonStructure({
        seasonId: 'season-1',
        weekCount: 8,
        weekActivities: [{ weekIndex: 3, activityType: 'primordial conflict' }],
      });

      // Assert
      expect(result.error).toBeNull();
    });

    it('should surface the DB lock-trigger error when the season already has logged activities', async () => {
      // Arrange
      const updateChain: Record<string, ReturnType<typeof vi.fn>> = {};
      updateChain['update'] = vi.fn().mockReturnThis();
      updateChain['eq'] = vi.fn().mockResolvedValue({ error: { message: 'season is locked' } });
      fromMock.mockReturnValue(updateChain);

      // Act
      const result = await service.updateSeasonStructure({
        seasonId: 'season-1',
        weekCount: 8,
        weekActivities: [],
      });

      // Assert
      expect(result.error).toBe('season is locked');
    });
  });

  // ============================================
  describe('deleteSeason', () => {
    it('should delete the season and reload on success', async () => {
      // Arrange
      const deleteChain: Record<string, ReturnType<typeof vi.fn>> = {};
      deleteChain['delete'] = vi.fn().mockReturnThis();
      deleteChain['eq'] = vi.fn().mockResolvedValue({ error: null });

      const listChain: Record<string, ReturnType<typeof vi.fn>> = {};
      listChain['select'] = vi.fn().mockResolvedValue({ data: [], error: null });

      fromMock.mockReturnValueOnce(deleteChain).mockReturnValueOnce(listChain);

      // Act
      const result = await service.deleteSeason('season-1');

      // Assert
      expect(result.error).toBeNull();
    });

    it('should surface the DB lock-trigger error when the season has logged activities', async () => {
      // Arrange
      const deleteChain: Record<string, ReturnType<typeof vi.fn>> = {};
      deleteChain['delete'] = vi.fn().mockReturnThis();
      deleteChain['eq'] = vi.fn().mockResolvedValue({ error: { message: 'cannot delete locked season' } });
      fromMock.mockReturnValue(deleteChain);

      // Act
      const result = await service.deleteSeason('season-1');

      // Assert
      expect(result.error).toBe('cannot delete locked season');
    });
  });

  // ============================================
  describe('checkSeasonLocked', () => {
    it('should return false when the season is not in the local cache', async () => {
      // Act
      const result = await service.checkSeasonLocked('unknown-season');

      // Assert
      expect(result).toBe(false);
      expect(fromMock).not.toHaveBeenCalled();
    });

    it('should return true when the activities count is greater than zero', async () => {
      // Arrange
      const listChain: Record<string, ReturnType<typeof vi.fn>> = {};
      listChain['select'] = vi.fn().mockResolvedValue({ data: [makeSeasonRow()], error: null });
      fromMock.mockReturnValue(listChain);
      await service.loadSeasons();

      const countChain: Record<string, ReturnType<typeof vi.fn>> = {};
      countChain['select'] = vi.fn().mockReturnThis();
      countChain['gte'] = vi.fn().mockReturnThis();
      countChain['lte'] = vi.fn().mockResolvedValue({ count: 3, error: null });
      fromMock.mockReturnValue(countChain);

      // Act
      const result = await service.checkSeasonLocked('season-1');

      // Assert
      expect(result).toBe(true);
    });
  });
});
