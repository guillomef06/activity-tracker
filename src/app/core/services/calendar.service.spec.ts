import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { OtherEntryInput } from '@shared/models';
import { CalendarService, MG_CAL_ERROR_KEYS, toCalendarOperationError } from './calendar.service';
import { SupabaseService } from './supabase.service';

type Chain = Record<string, ReturnType<typeof vi.fn>>;

const OTHER_ENTRY: OtherEntryInput = {
  type: 'pvp',
  title: 'Arena',
  starts_at: '2027-06-01T00:00:00Z',
  ends_at: '2027-06-02T00:00:00Z',
  all_day: true,
};

describe('toCalendarOperationError', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('should keep a known code and parse its JSON details', () => {
    // Act
    const result = toCalendarOperationError({ message: 'MG_CAL_NOT_SHIFTABLE', details: '{"reason":"read_only"}' });

    // Assert
    expect(result).toEqual({ code: 'MG_CAL_NOT_SHIFTABLE', details: { reason: 'read_only' } });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should return null details when details is malformed JSON', () => {
    // Act
    const result = toCalendarOperationError({ message: 'MG_CAL_TOO_CLOSE', details: '{not json' });

    // Assert
    expect(result).toEqual({ code: 'MG_CAL_TOO_CLOSE', details: null });
  });

  it('should return null details when details is not an object', () => {
    // Act
    const result = toCalendarOperationError({ message: 'MG_CAL_NOT_FOUND', details: '[1,2]' });

    // Assert
    expect(result.details).toBeNull();
  });

  it.each([{ message: 'permission denied' }, { message: 'MG_CAL_SOMETHING_NEW' }, {}])(
    'should map %o to MG_CAL_UNKNOWN and log it',
    error => {
      // Act
      const result = toCalendarOperationError(error);

      // Assert
      expect(result).toEqual({ code: 'MG_CAL_UNKNOWN', details: null });
      expect(errorSpy).toHaveBeenCalledTimes(1);
    }
  );

  it('should expose a literal i18n key for every code', () => {
    // Assert
    expect(Object.keys(MG_CAL_ERROR_KEYS)).toHaveLength(10);
    expect(MG_CAL_ERROR_KEYS.MG_CAL_UNKNOWN).toBe('superAdmin.calendar.errors.unknown');
  });
});

describe('CalendarService', () => {
  let service: CalendarService;
  let fromMock: ReturnType<typeof vi.fn>;
  let rpcMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fromMock = vi.fn();
    rpcMock = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        CalendarService,
        { provide: SupabaseService, useValue: { from: fromMock, rpc: rpcMock } },
      ],
    });
    service = TestBed.inject(CalendarService);
  });

  const selectChain = (result: { data: unknown; error: unknown }): Chain => {
    const chain: Chain = {};
    chain['select'] = vi.fn().mockReturnThis();
    chain['order'] = vi.fn().mockResolvedValue(result);
    return chain;
  };

  describe('loadEntries', () => {
    it('should select all entries ordered by starts_at ascending', async () => {
      // Arrange
      const rows = [{ id: 'a' }];
      const chain = selectChain({ data: rows, error: null });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.loadEntries();

      // Assert
      expect(result).toEqual(rows);
      expect(fromMock).toHaveBeenCalledWith('calendar_entries');
      expect(chain['select']).toHaveBeenCalledWith('*');
      expect(chain['order']).toHaveBeenCalledWith('starts_at', { ascending: true });
    });

    it('should return an empty array when data is null', async () => {
      // Arrange
      fromMock.mockReturnValue(selectChain({ data: null, error: null }));

      // Act / Assert
      await expect(service.loadEntries()).resolves.toEqual([]);
    });

    it('should throw on Supabase error', async () => {
      // Arrange
      const error = { message: 'DB error' };
      fromMock.mockReturnValue(selectChain({ data: null, error }));

      // Act / Assert
      await expect(service.loadEntries()).rejects.toBe(error);
    });
  });

  describe('loadEntriesWithImpact', () => {
    it('should embed events and registration counts', async () => {
      // Arrange
      const chain = selectChain({ data: [{ id: 'a', mg_events: [] }], error: null });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.loadEntriesWithImpact();

      // Assert
      expect(result).toHaveLength(1);
      const selectArg = chain['select'].mock.calls[0][0] as string;
      expect(selectArg).toContain('mg_events(id, server_id, status, mg_registrations(count))');
      expect(chain['order']).toHaveBeenCalledWith('starts_at', { ascending: true });
    });

    it('should throw on Supabase error', async () => {
      // Arrange
      const error = { message: 'DB error' };
      fromMock.mockReturnValue(selectChain({ data: null, error }));

      // Act / Assert
      await expect(service.loadEntriesWithImpact()).rejects.toBe(error);
    });
  });

  describe('createMgEntries', () => {
    it('should call the RPC with the opening mondays and return the rows', async () => {
      // Arrange
      const rows = [{ opening_monday: '2027-05-31', mg_start: '2027-06-07', outcome: 'created', entry_id: 'e1' }];
      rpcMock.mockResolvedValue({ data: rows, error: null });

      // Act
      const result = await service.createMgEntries(['2027-05-31']);

      // Assert
      expect(rpcMock).toHaveBeenCalledWith('create_mg_calendar_entries', { p_opening_mondays: ['2027-05-31'] });
      expect(result).toEqual({ results: rows, error: null });
    });

    it('should map a known error to a typed error', async () => {
      // Arrange
      rpcMock.mockResolvedValue({
        data: null,
        error: { message: 'MG_CAL_INVALID_INPUT', details: '{"reason":"too_many"}' },
      });

      // Act
      const result = await service.createMgEntries([]);

      // Assert
      expect(result.results).toEqual([]);
      expect(result.error).toEqual({ code: 'MG_CAL_INVALID_INPUT', details: { reason: 'too_many' } });
    });

    it('should map an unknown error to MG_CAL_UNKNOWN', async () => {
      // Arrange
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

      // Act
      const result = await service.createMgEntries(['2027-05-31']);

      // Assert
      expect(result.error?.code).toBe('MG_CAL_UNKNOWN');
    });
  });

  describe('shiftMgEntry', () => {
    it('should call the RPC with entry id and new opening monday', async () => {
      // Arrange
      const moved = [{ entry_id: 'e1', old_start: '2027-06-07', new_start: '2027-06-14', events_updated: 0 }];
      rpcMock.mockResolvedValue({ data: moved, error: null });

      // Act
      const result = await service.shiftMgEntry('e1', '2027-06-07');

      // Assert
      expect(rpcMock).toHaveBeenCalledWith('shift_mg_calendar_entry', {
        p_entry_id: 'e1',
        p_new_opening_monday: '2027-06-07',
      });
      expect(result).toEqual({ moved, error: null });
    });

    it('should map an error with details', async () => {
      // Arrange
      rpcMock.mockResolvedValue({
        data: null,
        error: { message: 'MG_CAL_NOT_SHIFTABLE', details: '{"reason":"must_move_later"}' },
      });

      // Act
      const result = await service.shiftMgEntry('e1', '2027-06-07');

      // Assert
      expect(result.moved).toEqual([]);
      expect(result.error).toEqual({ code: 'MG_CAL_NOT_SHIFTABLE', details: { reason: 'must_move_later' } });
    });
  });

  describe('cancelMgEntry', () => {
    it.each(['deleted', 'cancelled'] as const)('should return the %s outcome', async outcome => {
      // Arrange
      rpcMock.mockResolvedValue({ data: outcome, error: null });

      // Act
      const result = await service.cancelMgEntry('e1');

      // Assert
      expect(rpcMock).toHaveBeenCalledWith('cancel_mg_calendar_entry', { p_entry_id: 'e1' });
      expect(result).toEqual({ outcome, error: null });
    });

    it('should map an error and return a null outcome', async () => {
      // Arrange
      rpcMock.mockResolvedValue({
        data: null,
        error: { message: 'MG_CAL_NOT_CANCELLABLE', details: '{"reason":"read_only"}' },
      });

      // Act
      const result = await service.cancelMgEntry('e1');

      // Assert
      expect(result.outcome).toBeNull();
      expect(result.error?.code).toBe('MG_CAL_NOT_CANCELLABLE');
    });
  });

  describe('non-MG direct writes', () => {
    it('should insert a non-MG entry', async () => {
      // Arrange
      const insert = vi.fn().mockResolvedValue({ error: null });
      fromMock.mockReturnValue({ insert });

      // Act
      const result = await service.createOtherEntry(OTHER_ENTRY);

      // Assert
      expect(fromMock).toHaveBeenCalledWith('calendar_entries');
      expect(insert).toHaveBeenCalledWith(OTHER_ENTRY);
      expect(result).toEqual({ error: null });
    });

    it('should update only non-MG rows', async () => {
      // Arrange
      const chain: Chain = {};
      chain['update'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockReturnThis();
      chain['neq'] = vi.fn().mockResolvedValue({ error: null });
      fromMock.mockReturnValue(chain);

      // Act
      await service.updateOtherEntry('e1', OTHER_ENTRY);

      // Assert
      expect(chain['update']).toHaveBeenCalledWith(OTHER_ENTRY);
      expect(chain['eq']).toHaveBeenCalledWith('id', 'e1');
      expect(chain['neq']).toHaveBeenCalledWith('type', 'mg');
    });

    it('should delete only non-MG rows and surface the error', async () => {
      // Arrange
      const error = { message: 'denied' };
      const chain: Chain = {};
      chain['delete'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockReturnThis();
      chain['neq'] = vi.fn().mockResolvedValue({ error });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.deleteOtherEntry('e1');

      // Assert
      expect(chain['neq']).toHaveBeenCalledWith('type', 'mg');
      expect(result).toEqual({ error });
    });

    it('should never use the MG RPCs for direct writes', async () => {
      // Arrange
      fromMock.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) });

      // Act
      await service.createOtherEntry(OTHER_ENTRY);

      // Assert
      expect(rpcMock).not.toHaveBeenCalled();
    });
  });
});
