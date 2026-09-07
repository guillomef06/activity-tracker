import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { GuideAdminService } from './guide-admin.service';
import { SupabaseService } from './supabase.service';
import type { Champion, Ring } from '@shared/models';

const makeRing = (overrides: Partial<Ring> = {}): Ring => ({
  id: 'ring-1',
  name: 'Iron Ring',
  description: null,
  icon_url: null,
  is_active: true,
  sort_order: 0,
  ...overrides,
});

const makeChampion = (overrides: Partial<Champion> = {}): Champion => ({
  id: 'champ-1',
  name: 'Warrior',
  image_url: null,
  sort_order: 0,
  is_active: true,
  ...overrides,
});

describe('GuideAdminService', () => {
  let service: GuideAdminService;
  let fromMock: ReturnType<typeof vi.fn>;
  let storageMock: {
    from: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    fromMock = vi.fn();
    storageMock = {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: 'https://cdn.example.com/img.png' } }),
      }),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        GuideAdminService,
        {
          provide: SupabaseService,
          useValue: {
            from: fromMock,
            client: { storage: storageMock },
          },
        },
      ],
    });

    service = TestBed.inject(GuideAdminService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ============================================
  describe('getChampions', () => {
    it('should return an array of champions on success', async () => {
      // Arrange
      const champions = [makeChampion({ id: 'c1' }), makeChampion({ id: 'c2' })];
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockReturnThis();
      chain['order'] = vi.fn().mockResolvedValue({ data: champions, error: null });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.getChampions();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('c1');
    });

    it('should return an empty array on DB error', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockReturnThis();
      chain['order'] = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.getChampions();

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ============================================
  describe('createChampion', () => {
    it('should return the created champion on success', async () => {
      // Arrange
      const champion = makeChampion();
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['insert'] = vi.fn().mockReturnThis();
      chain['select'] = vi.fn().mockReturnThis();
      chain['single'] = vi.fn().mockResolvedValue({ data: champion, error: null });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.createChampion({
        name: 'Warrior',
        image_url: null,
        sort_order: 0,
        is_active: true,
      });

      // Assert
      expect(result.champion).toMatchObject({ id: 'champ-1', name: 'Warrior' });
      expect(result.error).toBeNull();
    });

    it('should return null champion and an error message on DB failure', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['insert'] = vi.fn().mockReturnThis();
      chain['select'] = vi.fn().mockReturnThis();
      chain['single'] = vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.createChampion({
        name: 'Warrior',
        image_url: null,
        sort_order: 0,
        is_active: true,
      });

      // Assert
      expect(result.champion).toBeNull();
      expect(result.error).toBe('insert failed');
    });
  });

  // ============================================
  describe('uploadChampionImage', () => {
    it('should call storage upload and return the public URL', async () => {
      // Arrange — updateChampion (called after upload) needs a from mock too
      const updateChain: Record<string, ReturnType<typeof vi.fn>> = {};
      updateChain['update'] = vi.fn().mockReturnThis();
      updateChain['eq'] = vi.fn().mockResolvedValue({ error: null });
      fromMock.mockReturnValue(updateChain);

      const file = new File(['img'], 'avatar.png', { type: 'image/png' });

      // Act
      const result = await service.uploadChampionImage('champ-1', file);

      // Assert
      expect(storageMock.from).toHaveBeenCalledWith('guides-assets');
      expect(result.url).toBe('https://cdn.example.com/img.png');
      expect(result.error).toBeNull();
    });

    it('should return null url and error message when storage upload fails', async () => {
      // Arrange
      storageMock.from.mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: new Error('upload failed') }),
        getPublicUrl: vi.fn(),
      });

      const file = new File(['img'], 'avatar.png', { type: 'image/png' });

      // Act
      const result = await service.uploadChampionImage('champ-1', file);

      // Assert
      expect(result.url).toBeNull();
      expect(result.error).toBe('upload failed');
    });
  });

  // ============================================
  describe('getRings', () => {
    it('should return an array of rings on success', async () => {
      // Arrange
      const rings = [makeRing({ id: 'r1' }), makeRing({ id: 'r2' })];
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockReturnThis();
      chain['order'] = vi.fn().mockResolvedValue({ data: rings, error: null });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.getRings();

      // Assert
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('r1');
    });

    it('should return an empty array on DB error', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockReturnThis();
      chain['order'] = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.getRings();

      // Assert
      expect(result).toEqual([]);
    });
  });

  // ============================================
  describe('createRing', () => {
    it('should return the created ring on success', async () => {
      // Arrange
      const ring = makeRing();
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['insert'] = vi.fn().mockReturnThis();
      chain['select'] = vi.fn().mockReturnThis();
      chain['single'] = vi.fn().mockResolvedValue({ data: ring, error: null });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.createRing({
        name: 'Iron Ring',
        description: null,
        icon_url: null,
        sort_order: 0,
        is_active: true,
      });

      // Assert
      expect(result.ring).toMatchObject({ id: 'ring-1', name: 'Iron Ring' });
      expect(result.error).toBeNull();
    });

    it('should return null ring and error message on DB failure', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['insert'] = vi.fn().mockReturnThis();
      chain['select'] = vi.fn().mockReturnThis();
      chain['single'] = vi.fn().mockResolvedValue({ data: null, error: { message: 'insert failed' } });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.createRing({
        name: 'Iron Ring',
        description: null,
        icon_url: null,
        sort_order: 0,
        is_active: true,
      });

      // Assert
      expect(result.ring).toBeNull();
      expect(result.error).toBe('insert failed');
    });
  });

  // ============================================
  describe('deleteRing', () => {
    it('should return null error on successful delete', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['delete'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockResolvedValue({ error: null });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.deleteRing('ring-1');

      // Assert
      expect(result.error).toBeNull();
    });

    it('should return error message on DB failure', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['delete'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockResolvedValue({ error: { message: 'FK constraint' } });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.deleteRing('ring-1');

      // Assert
      expect(result.error).toBe('FK constraint');
    });
  });

  // ============================================
  describe('deleteChampion', () => {
    it('should return null error on successful delete', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['delete'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockResolvedValue({ error: null });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.deleteChampion('champ-1');

      // Assert
      expect(result.error).toBeNull();
    });

    it('should return error message on DB failure', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['delete'] = vi.fn().mockReturnThis();
      chain['eq'] = vi.fn().mockResolvedValue({ error: { message: 'FK constraint' } });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.deleteChampion('champ-1');

      // Assert
      expect(result.error).toBe('FK constraint');
    });
  });
});
