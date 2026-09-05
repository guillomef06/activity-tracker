import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal, provideZonelessChangeDetection } from '@angular/core';
import { GuideService } from './guide.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import type { Guide, GuideWithDetails } from '@shared/models';

// Minimal guide fixture
const makeGuide = (overrides: Partial<Guide> = {}): Guide => ({
  id: 'guide-1',
  author_id: 'user-1',
  title: 'Test Guide',
  category: 'formation',
  description: null,
  slug: 'test-guide-abcd',
  is_published: true,
  upvotes_count: 0,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('GuideService', () => {
  let service: GuideService;
  let fromMock: ReturnType<typeof vi.fn>;
  let authMock: {
    isAuthenticated: ReturnType<typeof signal<boolean>>;
    getUserId: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    fromMock = vi.fn();

    authMock = {
      isAuthenticated: signal(true),
      getUserId: vi.fn().mockReturnValue('user-1'),
    };

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        GuideService,
        { provide: SupabaseService, useValue: { from: fromMock } },
        { provide: AuthService, useValue: authMock },
      ],
    });

    service = TestBed.inject(GuideService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ============================================
  describe('getPublishedGuides', () => {
    it('should return paginated guides and hasMore=false when fewer than pageSize results', async () => {
      // Arrange
      const guides: GuideWithDetails[] = [makeGuide({ id: 'g1' }), makeGuide({ id: 'g2' })];
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      ['eq', 'order', 'range'].forEach(m => {
        chain[m] = vi.fn().mockReturnThis();
      });
      chain['select'] = vi.fn().mockReturnThis();
      Object.defineProperty(chain, 'then', {
        value: (resolve: (v: unknown) => unknown) => resolve({ data: guides, error: null }),
      });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.getPublishedGuides(0, 10);

      // Assert
      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(false);
    });

    it('should set hasMore=true when result count exceeds pageSize', async () => {
      // Arrange — return 11 guides when pageSize is 10 → one extra
      const guides = Array.from({ length: 11 }, (_, i) => makeGuide({ id: `g${i}` }));
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      ['eq', 'order', 'range'].forEach(m => {
        chain[m] = vi.fn().mockReturnThis();
      });
      chain['select'] = vi.fn().mockReturnThis();
      Object.defineProperty(chain, 'then', {
        value: (resolve: (v: unknown) => unknown) => resolve({ data: guides, error: null }),
      });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.getPublishedGuides(0, 10);

      // Assert
      expect(result.hasMore).toBe(true);
      expect(result.data).toHaveLength(10);
    });

    it('should return empty array and hasMore=false on DB error', async () => {
      // Arrange
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      ['eq', 'order', 'range'].forEach(m => {
        chain[m] = vi.fn().mockReturnThis();
      });
      chain['select'] = vi.fn().mockReturnThis();
      Object.defineProperty(chain, 'then', {
        value: (resolve: (v: unknown) => unknown) => resolve({ data: null, error: { message: 'DB error' } }),
      });
      fromMock.mockReturnValue(chain);

      // Act
      const result = await service.getPublishedGuides(0, 10);

      // Assert
      expect(result.data).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });

  // ============================================
  describe('createGuide — limit enforcement', () => {
    it('should return limitReached error when user has 10 guides', async () => {
      // Arrange — getUserGuidesCount: .select().eq() resolves with count=10
      const countChain: Record<string, ReturnType<typeof vi.fn>> = {};
      countChain['select'] = vi.fn().mockReturnThis();
      countChain['eq'] = vi.fn().mockResolvedValue({ count: 10, error: null });
      fromMock.mockReturnValue(countChain);

      // Act
      const result = await service.createGuide({
        title: 'New Guide',
        category: 'general',
        slug: 'new-guide-1234',
      });

      // Assert
      expect(result.guide).toBeNull();
      expect(result.error).toBe('guides.errors.limitReached');
    });

    it('should return unauthorized error when user is not authenticated', async () => {
      // Arrange
      authMock.isAuthenticated.set(false);

      // Act
      const result = await service.createGuide({
        title: 'New Guide',
        category: 'general',
        slug: 'new-guide-abcd',
      });

      // Assert
      expect(result.guide).toBeNull();
      expect(result.error).toBe('guides.errors.unauthorized');
    });
  });

  // ============================================
  describe('createGuide — slug duplicate', () => {
    it('should return slugDuplicate error on Postgres unique_violation (23505)', async () => {
      // Arrange — count returns 0 (under limit), insert returns 23505
      let callCount = 0;
      fromMock.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // getUserGuidesCount: .select().eq() resolves
          const countChain: Record<string, ReturnType<typeof vi.fn>> = {};
          countChain['select'] = vi.fn().mockReturnThis();
          countChain['eq'] = vi.fn().mockResolvedValue({ count: 0, error: null });
          return countChain;
        }
        // insert: .insert().select().single() resolves
        const insertChain: Record<string, ReturnType<typeof vi.fn>> = {};
        insertChain['insert'] = vi.fn().mockReturnThis();
        insertChain['select'] = vi.fn().mockReturnThis();
        insertChain['single'] = vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'unique' } });
        return insertChain;
      });

      // Act
      const result = await service.createGuide({
        title: 'My Guide',
        category: 'formation',
        slug: 'my-guide-abcd',
      });

      // Assert
      expect(result.guide).toBeNull();
      expect(result.error).toBe('guides.errors.slugDuplicate');
    });
  });

  // ============================================
  describe('hasUserUpvoted', () => {
    // hasUserUpvoted calls: .select(col, {count,head}).eq(guideId).eq(voterToken)
    // The second .eq() is the terminal that resolves the promise.
    const makeUpvoteChain = (resolvedValue: unknown) => {
      const chain: Record<string, ReturnType<typeof vi.fn>> = {};
      chain['select'] = vi.fn().mockReturnThis();
      // First .eq() returns chain; second .eq() resolves
      let eqCallCount = 0;
      chain['eq'] = vi.fn().mockImplementation(() => {
        eqCallCount++;
        if (eqCallCount === 1) return chain;
        return Promise.resolve(resolvedValue);
      });
      return chain;
    };

    it('should return true when an upvote exists', async () => {
      // Arrange
      fromMock.mockReturnValue(makeUpvoteChain({ count: 1, error: null }));

      // Act
      const result = await service.hasUserUpvoted('guide-1', 'voter-token-abc');

      // Assert
      expect(result).toBe(true);
    });

    it('should return false when no upvote exists', async () => {
      // Arrange
      fromMock.mockReturnValue(makeUpvoteChain({ count: 0, error: null }));

      // Act
      const result = await service.hasUserUpvoted('guide-1', 'voter-token-abc');

      // Assert
      expect(result).toBe(false);
    });

    it('should return false on DB error', async () => {
      // Arrange
      fromMock.mockReturnValue(makeUpvoteChain({ count: null, error: { message: 'error' } }));

      // Act
      const result = await service.hasUserUpvoted('guide-1', 'voter-token-abc');

      // Assert
      expect(result).toBe(false);
    });
  });
});
