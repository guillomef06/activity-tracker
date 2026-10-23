import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PointAdjustmentService } from './point-adjustment.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';

describe('PointAdjustmentService', () => {
  let service: PointAdjustmentService;
  let fromMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fromMock = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        PointAdjustmentService,
        { provide: SupabaseService, useValue: { from: fromMock } },
        { provide: AuthService, useValue: { getUserId: vi.fn().mockReturnValue('admin-1') } },
      ],
    });

    service = TestBed.inject(PointAdjustmentService);
  });

  describe('loadAdjustments', () => {
    it('should map DB rows to app shape (joined display name, created_at → Date), newest first', async () => {
      // Arrange
      const rows = [
        {
          id: 'adj-1',
          server_id: 'server-1',
          user_id: 'user-1',
          delta: -80,
          reason: 'Rule violation',
          created_by: 'admin-1',
          created_at: '2026-10-12T00:00:00Z',
          user_profiles: { display_name: 'TommyTorpedo' },
        },
      ];
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockReturnThis();
      chain['order'] = vi.fn().mockResolvedValue({ data: rows, error: null });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.loadAdjustments('server-1');

      // Assert
      expect(fromMock).toHaveBeenCalledWith('point_adjustments');
      expect(chain['eq']).toHaveBeenCalledWith('server_id', 'server-1');
      expect(chain['order']).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(result).toEqual([
        {
          id: 'adj-1',
          userId: 'user-1',
          delta: -80,
          reason: 'Rule violation',
          date: new Date('2026-10-12T00:00:00Z'),
          createdBy: 'admin-1',
          displayName: 'TommyTorpedo',
        },
      ]);
    });

    it('should fall back to "Unknown" when the joined profile is null', async () => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockReturnThis();
      chain['order'] = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'adj-2',
            server_id: 'server-1',
            user_id: 'user-2',
            delta: 50,
            reason: 'Bonus',
            created_by: null,
            created_at: '2026-10-11T00:00:00Z',
            user_profiles: null,
          },
        ],
        error: null,
      });
      fromMock.mockReturnValue(chain);

      const result = await service.loadAdjustments('server-1');

      expect(result[0].displayName).toBe('Unknown');
      expect(result[0].createdBy).toBeNull();
    });

    it('should return an empty array on Supabase error', async () => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockReturnThis();
      chain['order'] = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
      fromMock.mockReturnValue(chain);

      const result = await service.loadAdjustments('server-1');

      expect(result).toEqual([]);
    });
  });

  describe('createAdjustment', () => {
    it('should insert the adjustment with server_id and the current admin as created_by', async () => {
      // Arrange
      const insert = vi.fn().mockResolvedValue({ error: null });
      fromMock.mockReturnValue({ insert });

      // Act
      const result = await service.createAdjustment('server-1', {
        userId: 'user-1',
        delta: -80,
        reason: 'Rule violation',
      });

      // Assert
      expect(result.error).toBeNull();
      expect(fromMock).toHaveBeenCalledWith('point_adjustments');
      expect(insert).toHaveBeenCalledWith({
        server_id: 'server-1',
        user_id: 'user-1',
        delta: -80,
        reason: 'Rule violation',
        created_by: 'admin-1',
      });
    });

    it('should pass through the Supabase error on failure', async () => {
      const insert = vi.fn().mockResolvedValue({ error: { message: 'DB error' } });
      fromMock.mockReturnValue({ insert });

      const result = await service.createAdjustment('server-1', { userId: 'user-1', delta: 10, reason: 'x' });

      expect(result.error).toEqual({ message: 'DB error' });
    });
  });

  describe('deleteAdjustment', () => {
    it('should delete by id and return no error on success', async () => {
      // Arrange
      const eq = vi.fn().mockResolvedValue({ error: null });
      const del = vi.fn().mockReturnValue({ eq });
      fromMock.mockReturnValue({ delete: del });

      // Act
      const result = await service.deleteAdjustment('adj-1');

      // Assert
      expect(result.error).toBeNull();
      expect(fromMock).toHaveBeenCalledWith('point_adjustments');
      expect(eq).toHaveBeenCalledWith('id', 'adj-1');
    });

    it('should pass through the Supabase error on failure', async () => {
      const eq = vi.fn().mockResolvedValue({ error: { message: 'DB error' } });
      const del = vi.fn().mockReturnValue({ eq });
      fromMock.mockReturnValue({ delete: del });

      const result = await service.deleteAdjustment('adj-1');

      expect(result.error).toEqual({ message: 'DB error' });
    });
  });
});
