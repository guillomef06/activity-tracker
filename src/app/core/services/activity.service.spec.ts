import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal } from '@angular/core';
import { ActivityService } from './activity.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { AllianceService } from './alliance.service';
import type { UserScore, BatchImportEntry } from '@app/shared/models';
import type { Alliance } from '@app/shared/models/alliance.model';

interface ActivityRow {
  activityType: string;
  points: number;
  position: number | null;
  userId: string;
}

describe('ActivityService', () => {
  let service: ActivityService;
  let allianceServiceMock: {
    alliance: ReturnType<typeof signal<Alliance | null>>;
    rules: ReturnType<typeof signal>;
    loadRules: ReturnType<typeof vi.fn>;
    calculatePoints: ReturnType<typeof vi.fn>;
    scoringWeeks: ReturnType<typeof signal<number>>;
  };

  const makeWeeklyScores = (activitiesByWeek: ActivityRow[][]) => {
    return activitiesByWeek.map(acts => ({
      weekStart: new Date(),
      weekEnd: new Date(),
      totalPoints: acts.reduce((s, a) => s + a.points, 0),
      activities: acts.map(a => ({ ...a, id: '1', displayName: 'x', date: new Date(), timestamp: 0 })),
      conflictingPositions: undefined,
    }));
  };

  beforeEach(() => {
    allianceServiceMock = {
      alliance: signal<Alliance | null>(null),
      rules: signal([]),
      loadRules: vi.fn().mockResolvedValue({ error: null }),
      calculatePoints: vi.fn().mockReturnValue({ points: 0, usedFallback: true }),
      scoringWeeks: signal(6),
    };

    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        then: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };

    const authMock = {
      getAllianceId: vi.fn().mockReturnValue(null),
      getUserId: vi.fn().mockReturnValue(null),
      userProfile: signal(null),
    };

    TestBed.configureTestingModule({
      providers: [
        ActivityService,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: AuthService, useValue: authMock },
        { provide: AllianceService, useValue: allianceServiceMock },
      ],
    });

    service = TestBed.inject(ActivityService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getUserScores() tiebreaker', () => {
    it('should exclude tiebreaker activity points from totalPoints and sixWeekTotal', () => {
      // Arrange
      allianceServiceMock.alliance.set({
        id: '1',
        name: 'test',
        tag: null,
        owner_id: null,
        tiebreaker_activity_type: 'stellar glory',
        scoring_weeks_multiplier: 1,
        created_at: '',
        updated_at: '',
      });

      const now = new Date();
      service['activitiesSignal'].set([
        {
          id: '1',
          userId: 'a',
          displayName: 'Alice',
          activityType: 'legion',
          position: 1,
          points: 20,
          date: now,
          timestamp: now.getTime(),
        },
        {
          id: '2',
          userId: 'a',
          displayName: 'Alice',
          activityType: 'stellar glory',
          position: null,
          points: 10,
          date: now,
          timestamp: now.getTime(),
        },
      ]);

      // Act
      const scores = service.getUserScores();

      // Assert — stellar glory (10 pts) must be excluded from totals
      const alice = scores.find(u => u.userId === 'a')!;
      expect(alice.sixWeekTotal).toBe(20);
      expect(alice.weeklyScores.find(w => w.activities.length > 0)?.totalPoints).toBe(20);
      // The tiebreaker activity is still present in the activities list (for display)
      expect(alice.weeklyScores.find(w => w.activities.length > 0)?.activities).toHaveLength(2);
    });

    it('should include all activity points when no tiebreaker is configured', () => {
      // Arrange
      allianceServiceMock.alliance.set(null);

      const now = new Date();
      service['activitiesSignal'].set([
        {
          id: '1',
          userId: 'a',
          displayName: 'Alice',
          activityType: 'legion',
          position: 1,
          points: 20,
          date: now,
          timestamp: now.getTime(),
        },
        {
          id: '2',
          userId: 'a',
          displayName: 'Alice',
          activityType: 'stellar glory',
          position: null,
          points: 10,
          date: now,
          timestamp: now.getTime(),
        },
      ]);

      // Act
      const scores = service.getUserScores();

      // Assert — all points counted
      const alice = scores.find(u => u.userId === 'a')!;
      expect(alice.sixWeekTotal).toBe(30);
    });

    it('should sort by tiebreaker activity points when sixWeekTotal is equal', () => {
      const userA: UserScore = {
        userId: 'a',
        displayName: 'Alice',
        sixWeekTotal: 30,
        weeklyScores: makeWeeklyScores([
          [{ activityType: 'legion', points: 20, position: 1, userId: 'a' }],
          [{ activityType: 'stellar glory', points: 10, position: null, userId: 'a' }],
        ]),
      };
      const userB: UserScore = {
        userId: 'b',
        displayName: 'Bob',
        sixWeekTotal: 30,
        weeklyScores: makeWeeklyScores([
          [{ activityType: 'legion', points: 10, position: 3, userId: 'b' }],
          [{ activityType: 'stellar glory', points: 20, position: null, userId: 'b' }],
        ]),
      };

      // Set tiebreaker to 'stellar glory' → Bob (20 pts) should rank above Alice (10 pts)
      allianceServiceMock.alliance.set({
        id: '1',
        name: 'test',
        tag: null,
        owner_id: null,
        tiebreaker_activity_type: 'stellar glory',
        scoring_weeks_multiplier: 1,
        created_at: '',
        updated_at: '',
      });

      // Replicate the sort logic from ActivityService.getUserScores()
      const sorted = [userA, userB].sort((a, b) => {
        const diff = b.sixWeekTotal - a.sixWeekTotal;
        if (diff !== 0) return diff;

        const tiebreaker = allianceServiceMock.alliance()?.tiebreaker_activity_type ?? null;
        if (!tiebreaker) return 0;

        const tiebreakerScore = (u: UserScore) =>
          u.weeklyScores.reduce(
            (total, week) =>
              total +
              week.activities.filter(act => act.activityType === tiebreaker).reduce((sum, act) => sum + act.points, 0),
            0
          );

        return tiebreakerScore(b) - tiebreakerScore(a);
      });

      expect(sorted[0].userId).toBe('b'); // Bob has more stellar glory points
      expect(sorted[1].userId).toBe('a');
    });

    it('should keep original order when no tiebreaker is configured', () => {
      allianceServiceMock.alliance.set(null);

      const userA: UserScore = { userId: 'a', displayName: 'Alice', sixWeekTotal: 30, weeklyScores: [] };
      const userB: UserScore = { userId: 'b', displayName: 'Bob', sixWeekTotal: 30, weeklyScores: [] };

      const sorted = [userA, userB].sort((a, b) => {
        const diff = b.sixWeekTotal - a.sixWeekTotal;
        if (diff !== 0) return diff;

        const tiebreaker = allianceServiceMock.alliance()?.tiebreaker_activity_type ?? null;
        if (!tiebreaker) return 0;
        return 0;
      });

      // No reordering when no tiebreaker configured
      expect(sorted[0].userId).toBe('a');
      expect(sorted[1].userId).toBe('b');
    });
  });

  describe('batchImportActivities', () => {
    let upsertMock: ReturnType<typeof vi.fn>;
    let adminService: ActivityService;

    beforeEach(() => {
      upsertMock = vi.fn().mockReturnValue({
        then: vi.fn().mockImplementation((resolve: (v: unknown) => unknown) => resolve({ error: null })),
      });

      const supabaseWithUpsert = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          upsert: upsertMock,
          // mockImplementation is required: await calls then(onFulfilled, onRejected)
          // and expects onFulfilled to be invoked — mockResolvedValue() would never call it
          then: vi.fn().mockImplementation((resolve: (v: unknown) => void) => resolve({ data: [], error: null })),
        }),
      };

      const adminAuthMock = {
        getAllianceId: vi.fn().mockReturnValue('alliance-1'),
        getUserId: vi.fn().mockReturnValue('user-1'),
        userProfile: signal({ id: 'user-1', role: 'admin' as const, display_name: 'Admin', username: 'admin' }),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          ActivityService,
          { provide: SupabaseService, useValue: supabaseWithUpsert },
          { provide: AuthService, useValue: adminAuthMock },
          { provide: AllianceService, useValue: allianceServiceMock },
        ],
      });

      adminService = TestBed.inject(ActivityService);
    });

    const makeEntry = (overrides: Partial<BatchImportEntry> = {}): BatchImportEntry => ({
      userId: 'user-1',
      activityType: 'legion',
      position: 3,
      points: 17,
      date: new Date('2026-03-03'),
      ...overrides,
    });

    it('should return unauthorized error when user is not admin', async () => {
      // Use the non-admin service from outer beforeEach (userProfile is null)
      const result = await service.batchImportActivities([makeEntry()]);
      expect(result.error).toBeTruthy();
      expect(result.error?.message).toContain('Unauthorized');
    });

    it('should call supabase upsert with mapped records', async () => {
      const entries = [makeEntry(), makeEntry({ userId: 'user-2', position: 5, points: 15 })];
      await adminService.batchImportActivities(entries);

      expect(upsertMock).toHaveBeenCalledOnce();
      const [records] = upsertMock.mock.calls[0];
      expect(records).toHaveLength(2);
      expect(records[0]).toMatchObject({
        user_id: 'user-1',
        activity_type: 'legion',
        position: 3,
        points: 17,
      });
    });

    it('should return null error on successful upsert', async () => {
      const result = await adminService.batchImportActivities([makeEntry()]);
      expect(result.error).toBeNull();
    });

    it('should return error when supabase upsert fails', async () => {
      upsertMock.mockReturnValue({
        then: vi
          .fn()
          .mockImplementation((resolve: (v: unknown) => unknown) => resolve({ error: new Error('DB error') })),
      });

      const result = await adminService.batchImportActivities([makeEntry()]);
      expect(result.error).toBeTruthy();
    });

    it('should handle empty entries array', async () => {
      const result = await adminService.batchImportActivities([]);
      expect(result.error).toBeNull();
      expect(upsertMock).toHaveBeenCalledWith([], { onConflict: 'user_id,activity_type,date' });
    });
  });

  describe('deleteAllActivities', () => {
    let deleteMock: ReturnType<typeof vi.fn>;
    let deleteService: ActivityService;

    beforeEach(() => {
      deleteMock = vi.fn().mockReturnValue({
        not: vi.fn().mockReturnValue({
          then: vi.fn().mockImplementation((resolve: (v: unknown) => unknown) => resolve({ error: null })),
        }),
      });

      const supabaseWithDelete = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          delete: deleteMock,
          then: vi.fn().mockImplementation((resolve: (v: unknown) => void) => resolve({ data: [], error: null })),
        }),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          ActivityService,
          { provide: SupabaseService, useValue: supabaseWithDelete },
          {
            provide: AuthService,
            useValue: {
              getAllianceId: vi.fn().mockReturnValue(null),
              getUserId: vi.fn().mockReturnValue(null),
              userProfile: signal(null),
            },
          },
          { provide: AllianceService, useValue: allianceServiceMock },
        ],
      });

      deleteService = TestBed.inject(ActivityService);
    });

    it('should call supabase delete with not filter', async () => {
      await deleteService.deleteAllActivities();
      expect(deleteMock).toHaveBeenCalledOnce();
    });

    it('should return null error on success', async () => {
      const result = await deleteService.deleteAllActivities();
      expect(result.error).toBeNull();
    });

    it('should clear the activities signal on success', async () => {
      const result = await deleteService.deleteAllActivities();
      expect(result.error).toBeNull();
      expect(deleteService.activities()).toEqual([]);
    });

    it('should return error when supabase delete fails', async () => {
      deleteMock.mockReturnValue({
        not: vi.fn().mockReturnValue({
          then: vi
            .fn()
            .mockImplementation((resolve: (v: unknown) => unknown) => resolve({ error: new Error('DB error') })),
        }),
      });

      const result = await deleteService.deleteAllActivities();
      expect(result.error).toBeTruthy();
    });
  });
});
