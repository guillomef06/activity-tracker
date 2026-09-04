import { TestBed } from '@angular/core/testing';
import { vi, Mocked } from 'vitest';
import { DiscordScheduledMessageService } from './discord-scheduled-message.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { CreateDiscordScheduledMessageRequest, DiscordScheduledMessage } from '@shared/models';

const mockSchedule: DiscordScheduledMessage = {
  id: 's1',
  server_id: 'a1',
  webhook_id: 'w1',
  message: 'Reminder!',
  frequency: 'daily',
  days_of_week: null,
  day_of_month: null,
  hour_utc: 19,
  is_active: true,
  created_by: 'u1',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockRequest: CreateDiscordScheduledMessageRequest = {
  webhook_id: 'w1',
  message: 'Reminder!',
  frequency: 'daily',
  hour_utc: 19,
};

describe('DiscordScheduledMessageService', () => {
  let service: DiscordScheduledMessageService;
  let supabaseService: Mocked<SupabaseService>;
  let authService: Mocked<AuthService>;

  beforeEach(() => {
    const supabaseSpy = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };

    const authSpy = {
      getServerId: vi.fn().mockReturnValue('a1'),
      getUserId: vi.fn().mockReturnValue('u1'),
      isAdmin: vi.fn().mockReturnValue(true),
    };

    TestBed.configureTestingModule({
      providers: [
        DiscordScheduledMessageService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: AuthService, useValue: authSpy },
      ],
    });

    service = TestBed.inject(DiscordScheduledMessageService);
    supabaseService = TestBed.inject(SupabaseService) as unknown as Mocked<SupabaseService>;
    authService = TestBed.inject(AuthService) as unknown as Mocked<AuthService>;
  });

  it('should create', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with empty schedules', () => {
    expect(service.schedules()).toEqual([]);
  });

  describe('loadSchedules', () => {
    it('should return empty and set no schedules when no server ID', async () => {
      authService.getServerId.mockReturnValue(null);
      const result = await service.loadSchedules();
      expect(result.error).toBeNull();
      expect(service.schedules()).toEqual([]);
    });

    it('should load schedules from supabase', async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: [mockSchedule], error: null }),
      };
      supabaseService.from.mockReturnValue(builder as never);

      const result = await service.loadSchedules();
      expect(result.error).toBeNull();
      expect(service.schedules()).toEqual([mockSchedule]);
    });

    it('should return error when supabase fails', async () => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
      };
      supabaseService.from.mockReturnValue(builder as never);

      const result = await service.loadSchedules();
      expect(result.error).toBeInstanceOf(Error);
      expect(service.schedules()).toEqual([]);
    });
  });

  describe('createSchedule', () => {
    it('should return error when no server ID', async () => {
      authService.getServerId.mockReturnValue(null);
      const result = await service.createSchedule(mockRequest);
      expect(result.error).toBeInstanceOf(Error);
      expect(supabaseService.from).not.toHaveBeenCalled();
    });

    it('should return error when not admin', async () => {
      authService.isAdmin.mockReturnValue(false);
      const result = await service.createSchedule(mockRequest);
      expect(result.error).toBeInstanceOf(Error);
      expect(supabaseService.from).not.toHaveBeenCalled();
    });

    it('should return error when no user ID', async () => {
      authService.getUserId.mockReturnValue(null);
      const result = await service.createSchedule(mockRequest);
      expect(result.error).toBeInstanceOf(Error);
      expect(supabaseService.from).not.toHaveBeenCalled();
    });

    it('should insert schedule with server ID and reload on success', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: null });
      const orderMock = vi.fn().mockResolvedValue({ data: [mockSchedule], error: null });
      const eqForLoad = vi.fn().mockReturnValue({ order: orderMock });
      const selectForLoad = vi.fn().mockReturnValue({ eq: eqForLoad });

      let callCount = 0;
      supabaseService.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { insert: insertMock } as never;
        return { select: selectForLoad } as never;
      });

      const result = await service.createSchedule(mockRequest);

      expect(result.error).toBeNull();
      expect(insertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          server_id: 'a1',
          webhook_id: 'w1',
          message: 'Reminder!',
          frequency: 'daily',
          days_of_week: null,
          day_of_month: null,
          hour_utc: 19,
          created_by: 'u1',
        })
      );
      expect(service.schedules()).toEqual([mockSchedule]);
    });

    it('should return error when supabase insert fails and not update signal', async () => {
      const insertMock = vi.fn().mockResolvedValue({ error: { message: 'insert failed' } });
      supabaseService.from.mockReturnValue({ insert: insertMock } as never);

      const result = await service.createSchedule(mockRequest);

      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('insert failed');
      expect(service.schedules()).toEqual([]);
    });
  });

  describe('updateSchedule', () => {
    it('should return error when not admin', async () => {
      authService.isAdmin.mockReturnValue(false);
      const result = await service.updateSchedule('s1', { message: 'updated' });
      expect(result.error).toBeInstanceOf(Error);
      expect(supabaseService.from).not.toHaveBeenCalled();
    });

    it('should update the schedule and reload on success', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      const orderMock = vi.fn().mockResolvedValue({ data: [mockSchedule], error: null });
      const eqForLoad = vi.fn().mockReturnValue({ order: orderMock });
      const selectForLoad = vi.fn().mockReturnValue({ eq: eqForLoad });

      let callCount = 0;
      supabaseService.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { update: updateMock } as never;
        return { select: selectForLoad } as never;
      });

      const result = await service.updateSchedule('s1', { message: 'updated' });

      expect(result.error).toBeNull();
      expect(updateMock).toHaveBeenCalledWith({ message: 'updated' });
      expect(eqMock).toHaveBeenCalledWith('id', 's1');
      expect(service.schedules()).toEqual([mockSchedule]);
    });

    it('should return error when supabase update fails and not update signal', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: { message: 'update failed' } });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabaseService.from.mockReturnValue({ update: updateMock } as never);

      const result = await service.updateSchedule('s1', { message: 'updated' });

      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('update failed');
      expect(service.schedules()).toEqual([]);
    });
  });

  describe('toggleActive', () => {
    it('should return error when not admin', async () => {
      authService.isAdmin.mockReturnValue(false);
      const result = await service.toggleActive('s1', false);
      expect(result.error).toBeInstanceOf(Error);
      expect(supabaseService.from).not.toHaveBeenCalled();
    });

    it('should update is_active and reload on success', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      const orderMock = vi.fn().mockResolvedValue({ data: [mockSchedule], error: null });
      const eqForLoad = vi.fn().mockReturnValue({ order: orderMock });
      const selectForLoad = vi.fn().mockReturnValue({ eq: eqForLoad });

      let callCount = 0;
      supabaseService.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { update: updateMock } as never;
        return { select: selectForLoad } as never;
      });

      const result = await service.toggleActive('s1', false);

      expect(result.error).toBeNull();
      expect(updateMock).toHaveBeenCalledWith({ is_active: false });
      expect(eqMock).toHaveBeenCalledWith('id', 's1');
    });

    it('should return error when supabase update fails', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: { message: 'toggle failed' } });
      const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabaseService.from.mockReturnValue({ update: updateMock } as never);

      const result = await service.toggleActive('s1', true);

      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('toggle failed');
    });
  });

  describe('deleteSchedule', () => {
    it('should return error when not admin', async () => {
      authService.isAdmin.mockReturnValue(false);
      const result = await service.deleteSchedule('s1');
      expect(result.error).toBeInstanceOf(Error);
      expect(supabaseService.from).not.toHaveBeenCalled();
    });

    it('should delete the schedule and reload on success', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: null });
      const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
      const orderMock = vi.fn().mockResolvedValue({ data: [], error: null });
      const eqForLoad = vi.fn().mockReturnValue({ order: orderMock });
      const selectForLoad = vi.fn().mockReturnValue({ eq: eqForLoad });

      let callCount = 0;
      supabaseService.from.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return { delete: deleteMock } as never;
        return { select: selectForLoad } as never;
      });

      const result = await service.deleteSchedule('s1');

      expect(result.error).toBeNull();
      expect(deleteMock).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith('id', 's1');
    });

    it('should return error when supabase delete fails', async () => {
      const eqMock = vi.fn().mockResolvedValue({ error: { message: 'delete failed' } });
      const deleteMock = vi.fn().mockReturnValue({ eq: eqMock });
      supabaseService.from.mockReturnValue({ delete: deleteMock } as never);

      const result = await service.deleteSchedule('s1');

      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toBe('delete failed');
    });
  });
});
