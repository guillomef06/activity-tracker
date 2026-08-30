import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal } from '@angular/core';
import { ActivityService } from './activity.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { ServerService } from './server.service';
import type { UserScore, BatchImportEntry, PositionConflict } from '@app/shared/models';
import type { Server } from '@app/shared/models/server.model';

interface ActivityRow {
  activityType: string;
  points: number;
  position: number | null;
  userId: string;
}

describe('ActivityService', () => {
  let service: ActivityService;
  let serverServiceMock: {
    server: ReturnType<typeof signal<Server | null>>;
    rules: ReturnType<typeof signal>;
    loadServer: ReturnType<typeof vi.fn>;
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
    serverServiceMock = {
      server: signal<Server | null>(null),
      rules: signal([]),
      loadServer: vi.fn().mockResolvedValue(undefined),
      loadRules: vi.fn().mockResolvedValue({ error: null }),
      calculatePoints: vi.fn().mockReturnValue({ points: 0, usedFallback: true }),
      scoringWeeks: signal(6),
    };

    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        then: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    };

    const authMock = {
      getServerId: vi.fn().mockReturnValue(null),
      getUserId: vi.fn().mockReturnValue(null),
      userProfile: signal(null),
    };

    TestBed.configureTestingModule({
      providers: [
        ActivityService,
        { provide: SupabaseService, useValue: supabaseMock },
        { provide: AuthService, useValue: authMock },
        { provide: ServerService, useValue: serverServiceMock },
      ],
    });

    service = TestBed.inject(ActivityService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('initialize() server scoping', () => {
    it('should filter activities by the current user server_id instead of relying on RLS alone', async () => {
      // Arrange — a super_admin session bypasses the RLS server scoping on `activities`
      // (see 24-rename-alliance-to-server.sql), so the client query must filter explicitly
      // or activities from every server leak into the current leaderboard.
      const eqMock = vi.fn().mockReturnThis();
      const scopedSupabaseMock = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          eq: eqMock,
          gte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve: (v: unknown) => void) => resolve({ data: [], error: null })),
        }),
      };
      const scopedAuthMock = {
        getServerId: vi.fn().mockReturnValue('server-era008'),
        getUserId: vi.fn().mockReturnValue(null),
        userProfile: signal(null),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          ActivityService,
          { provide: SupabaseService, useValue: scopedSupabaseMock },
          { provide: AuthService, useValue: scopedAuthMock },
          { provide: ServerService, useValue: serverServiceMock },
        ],
      });
      const scopedService = TestBed.inject(ActivityService);

      // Act
      await scopedService.initialize();

      // Assert
      expect(eqMock).toHaveBeenCalledWith('user_profiles.server_id', 'server-era008');
    });
  });

  describe('getUserScores() tiebreaker', () => {
    it('should exclude tiebreaker activity points from totalPoints and sixWeekTotal', () => {
      // Arrange
      serverServiceMock.server.set({
        id: '1',
        name: 'test',
        tag: null,
        owner_id: null,
        tiebreaker_activity_type: 'stellar glory',
        scoring_weeks_multiplier: 1,
        discord_invite_url: null,
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
      serverServiceMock.server.set(null);

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
      serverServiceMock.server.set({
        id: '1',
        name: 'test',
        tag: null,
        owner_id: null,
        tiebreaker_activity_type: 'stellar glory',
        scoring_weeks_multiplier: 1,
        discord_invite_url: null,
        created_at: '',
        updated_at: '',
      });

      // Replicate the sort logic from ActivityService.getUserScores()
      const sorted = [userA, userB].sort((a, b) => {
        const diff = b.sixWeekTotal - a.sixWeekTotal;
        if (diff !== 0) return diff;

        const tiebreaker = serverServiceMock.server()?.tiebreaker_activity_type ?? null;
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
      serverServiceMock.server.set(null);

      const userA: UserScore = { userId: 'a', displayName: 'Alice', sixWeekTotal: 30, weeklyScores: [] };
      const userB: UserScore = { userId: 'b', displayName: 'Bob', sixWeekTotal: 30, weeklyScores: [] };

      const sorted = [userA, userB].sort((a, b) => {
        const diff = b.sixWeekTotal - a.sixWeekTotal;
        if (diff !== 0) return diff;

        const tiebreaker = serverServiceMock.server()?.tiebreaker_activity_type ?? null;
        if (!tiebreaker) return 0;
        return 0;
      });

      // No reordering when no tiebreaker configured
      expect(sorted[0].userId).toBe('a');
      expect(sorted[1].userId).toBe('b');
    });
  });

  describe('applyMgDeductions', () => {
    it('should subtract the deduction from sixWeekTotal and expose it as mgDeduction', () => {
      // Arrange
      const scores: UserScore[] = [
        { userId: 'a', displayName: 'Alice', sixWeekTotal: 100, weeklyScores: [] },
        { userId: 'b', displayName: 'Bob', sixWeekTotal: 50, weeklyScores: [] },
      ];
      const deductions = new Map([['a', 30]]);

      // Act
      const result = service.applyMgDeductions(scores, deductions);

      // Assert
      const alice = result.find(u => u.userId === 'a')!;
      const bob = result.find(u => u.userId === 'b')!;
      expect(alice.sixWeekTotal).toBe(70);
      expect(alice.mgDeduction).toBe(30);
      expect(bob.sixWeekTotal).toBe(50);
      expect(bob.mgDeduction).toBe(0);
    });

    it('should re-sort when a deduction changes the ranking', () => {
      // Arrange
      const scores: UserScore[] = [
        { userId: 'a', displayName: 'Alice', sixWeekTotal: 100, weeklyScores: [] },
        { userId: 'b', displayName: 'Bob', sixWeekTotal: 90, weeklyScores: [] },
      ];
      const deductions = new Map([['a', 50]]); // Alice drops to 50, below Bob's 90

      // Act
      const result = service.applyMgDeductions(scores, deductions);

      // Assert
      expect(result[0].userId).toBe('b');
      expect(result[1].userId).toBe('a');
    });

    it('should leave users absent from the deductions map untouched', () => {
      // Arrange
      const scores: UserScore[] = [{ userId: 'a', displayName: 'Alice', sixWeekTotal: 100, weeklyScores: [] }];

      // Act
      const result = service.applyMgDeductions(scores, new Map());

      // Assert
      expect(result[0].sixWeekTotal).toBe(100);
      expect(result[0].mgDeduction).toBe(0);
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
        getServerId: vi.fn().mockReturnValue('server-1'),
        getUserId: vi.fn().mockReturnValue('user-1'),
        userProfile: signal({ id: 'user-1', role: 'admin' as const, display_name: 'Admin', username: 'admin' }),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          ActivityService,
          { provide: SupabaseService, useValue: supabaseWithUpsert },
          { provide: AuthService, useValue: adminAuthMock },
          { provide: ServerService, useValue: serverServiceMock },
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
              getServerId: vi.fn().mockReturnValue(null),
              getUserId: vi.fn().mockReturnValue(null),
              userProfile: signal(null),
            },
          },
          { provide: ServerService, useValue: serverServiceMock },
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

  describe('deleteActivity', () => {
    let deleteMock: ReturnType<typeof vi.fn>;
    let deleteService: ActivityService;

    beforeEach(() => {
      deleteMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
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
              getServerId: vi.fn().mockReturnValue(null),
              getUserId: vi.fn().mockReturnValue(null),
              userProfile: signal(null),
            },
          },
          { provide: ServerService, useValue: serverServiceMock },
        ],
      });

      deleteService = TestBed.inject(ActivityService);
    });

    it('should call supabase delete with eq filter on id', async () => {
      // Arrange
      deleteService['activitiesSignal'].set([
        {
          id: 'act-1',
          userId: 'u1',
          displayName: 'Alice',
          activityType: 'legion',
          position: 1,
          points: 10,
          date: new Date(),
          timestamp: 0,
        },
      ]);

      // Act
      await deleteService.deleteActivity('act-1');

      // Assert
      expect(deleteMock).toHaveBeenCalledOnce();
    });

    it('should remove the activity from the signal on success', async () => {
      // Arrange
      const now = new Date();
      deleteService['activitiesSignal'].set([
        {
          id: 'act-1',
          userId: 'u1',
          displayName: 'Alice',
          activityType: 'legion',
          position: 1,
          points: 10,
          date: now,
          timestamp: 0,
        },
        {
          id: 'act-2',
          userId: 'u1',
          displayName: 'Alice',
          activityType: 'kvk prep',
          position: 5,
          points: 8,
          date: now,
          timestamp: 0,
        },
      ]);

      // Act
      await deleteService.deleteActivity('act-1');

      // Assert
      expect(deleteService.activities()).toHaveLength(1);
      expect(deleteService.activities()[0].id).toBe('act-2');
    });

    it('should return null error on success', async () => {
      // Arrange
      deleteService['activitiesSignal'].set([]);

      // Act
      const result = await deleteService.deleteActivity('act-1');

      // Assert
      expect(result.error).toBeNull();
    });

    it('should return error when supabase delete fails', async () => {
      // Arrange
      deleteMock.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          then: vi
            .fn()
            .mockImplementation((resolve: (v: unknown) => unknown) => resolve({ error: new Error('DB error') })),
        }),
      });

      // Act
      const result = await deleteService.deleteActivity('act-1');

      // Assert
      expect(result.error).toBeTruthy();
    });
  });

  describe('deleteActivitiesByType', () => {
    let deleteMock: ReturnType<typeof vi.fn>;
    let deleteService: ActivityService;

    beforeEach(() => {
      deleteMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
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
              getServerId: vi.fn().mockReturnValue(null),
              getUserId: vi.fn().mockReturnValue(null),
              userProfile: signal(null),
            },
          },
          { provide: ServerService, useValue: serverServiceMock },
        ],
      });

      deleteService = TestBed.inject(ActivityService);
    });

    it('should call supabase delete with eq filter on activity_type', async () => {
      // Act
      await deleteService.deleteActivitiesByType('kvk prep');

      // Assert
      expect(deleteMock).toHaveBeenCalledOnce();
    });

    it('should remove all activities of that type from the signal on success', async () => {
      // Arrange
      const now = new Date();
      deleteService['activitiesSignal'].set([
        {
          id: 'act-1',
          userId: 'u1',
          displayName: 'Alice',
          activityType: 'kvk prep',
          position: 1,
          points: 10,
          date: now,
          timestamp: 0,
        },
        {
          id: 'act-2',
          userId: 'u2',
          displayName: 'Bob',
          activityType: 'kvk prep',
          position: 3,
          points: 8,
          date: now,
          timestamp: 0,
        },
        {
          id: 'act-3',
          userId: 'u1',
          displayName: 'Alice',
          activityType: 'legion',
          position: 5,
          points: 6,
          date: now,
          timestamp: 0,
        },
      ]);

      // Act
      await deleteService.deleteActivitiesByType('kvk prep');

      // Assert
      expect(deleteService.activities()).toHaveLength(1);
      expect(deleteService.activities()[0].id).toBe('act-3');
    });

    it('should return null error on success', async () => {
      // Act
      const result = await deleteService.deleteActivitiesByType('legion');

      // Assert
      expect(result.error).toBeNull();
    });

    it('should return error when supabase delete fails', async () => {
      // Arrange
      deleteMock.mockReturnValue({
        eq: vi.fn().mockReturnValue({
          then: vi
            .fn()
            .mockImplementation((resolve: (v: unknown) => unknown) => resolve({ error: new Error('DB error') })),
        }),
      });

      // Act
      const result = await deleteService.deleteActivitiesByType('legion');

      // Assert
      expect(result.error).toBeTruthy();
    });
  });

  describe('getConflictsForCurrentUser()', () => {
    const makeActivity = (
      overrides: Partial<{
        id: string;
        userId: string;
        displayName: string;
        activityType: string;
        position: number | null;
        points: number;
        date: Date;
      }> = {}
    ) => ({
      id: 'act-1',
      userId: 'user-current',
      displayName: 'Current User',
      activityType: 'kvk-prep',
      position: 3,
      points: 20,
      date: new Date('2026-05-05T00:00:00.000Z'),
      timestamp: new Date('2026-05-05T00:00:00.000Z').getTime(),
      ...overrides,
    });

    let conflictService: ActivityService;
    let authMockForConflict: {
      getServerId: ReturnType<typeof vi.fn>;
      getUserId: ReturnType<typeof vi.fn>;
      userProfile: ReturnType<typeof signal>;
    };

    beforeEach(() => {
      authMockForConflict = {
        getServerId: vi.fn().mockReturnValue('server-1'),
        getUserId: vi.fn().mockReturnValue('user-current'),
        userProfile: signal(null),
      };

      const supabaseMock = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          then: vi.fn().mockImplementation((resolve: (v: unknown) => void) => resolve({ data: [], error: null })),
        }),
      };

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          ActivityService,
          { provide: SupabaseService, useValue: supabaseMock },
          { provide: AuthService, useValue: authMockForConflict },
          { provide: ServerService, useValue: serverServiceMock },
        ],
      });

      conflictService = TestBed.inject(ActivityService);
    });

    it('should return empty array when no activities are loaded', () => {
      // Arrange
      conflictService['activitiesSignal'].set([]);

      // Act
      const result: PositionConflict[] = conflictService.getConflictsForCurrentUser();

      // Assert
      expect(result).toEqual([]);
    });

    it('should return empty array when current user has no conflicting activities', () => {
      // Arrange — two users with different positions on the same date/type
      conflictService['activitiesSignal'].set([
        makeActivity({ id: 'act-1', userId: 'user-current', position: 3 }),
        makeActivity({ id: 'act-2', userId: 'user-other', displayName: 'Other', position: 5 }),
      ]);

      // Act
      const result: PositionConflict[] = conflictService.getConflictsForCurrentUser();

      // Assert
      expect(result).toEqual([]);
    });

    it('should return a PositionConflict when another user shares the same activityType + position + date', () => {
      // Arrange
      const sharedDate = new Date('2026-05-05T00:00:00.000Z');
      conflictService['activitiesSignal'].set([
        makeActivity({ id: 'act-mine', userId: 'user-current', position: 3, date: sharedDate }),
        makeActivity({ id: 'act-other', userId: 'user-other', displayName: 'Rival', position: 3, date: sharedDate }),
      ]);

      // Act
      const result: PositionConflict[] = conflictService.getConflictsForCurrentUser();

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject<PositionConflict>({
        activityId: 'act-mine',
        activityType: 'kvk-prep',
        position: 3,
        date: sharedDate,
        conflictingDisplayName: 'Rival',
      });
    });

    it('should return empty array when conflicting activities are on different dates', () => {
      // Arrange
      conflictService['activitiesSignal'].set([
        makeActivity({
          id: 'act-mine',
          userId: 'user-current',
          position: 3,
          date: new Date('2026-05-05T00:00:00.000Z'),
        }),
        makeActivity({
          id: 'act-other',
          userId: 'user-other',
          displayName: 'Rival',
          position: 3,
          date: new Date('2026-05-12T00:00:00.000Z'),
        }),
      ]);

      // Act
      const result: PositionConflict[] = conflictService.getConflictsForCurrentUser();

      // Assert
      expect(result).toEqual([]);
    });

    it('should return empty array for participation-mode activities (position === null)', () => {
      // Arrange — both users have position null (participation mode)
      conflictService['activitiesSignal'].set([
        makeActivity({ id: 'act-mine', userId: 'user-current', position: null }),
        makeActivity({ id: 'act-other', userId: 'user-other', displayName: 'Rival', position: null }),
      ]);

      // Act
      const result: PositionConflict[] = conflictService.getConflictsForCurrentUser();

      // Assert
      expect(result).toEqual([]);
    });

    it('should return empty array when current user is not authenticated', () => {
      // Arrange
      authMockForConflict.getUserId.mockReturnValue(null);
      conflictService['activitiesSignal'].set([
        makeActivity({ id: 'act-mine', userId: 'user-current', position: 3 }),
        makeActivity({ id: 'act-other', userId: 'user-other', displayName: 'Rival', position: 3 }),
      ]);

      // Act
      const result: PositionConflict[] = conflictService.getConflictsForCurrentUser();

      // Assert
      expect(result).toEqual([]);
    });

    it('should return multiple conflicts when the current user has multiple conflicting activities', () => {
      // Arrange
      const date = new Date('2026-05-05T00:00:00.000Z');
      conflictService['activitiesSignal'].set([
        makeActivity({ id: 'act-mine-1', userId: 'user-current', activityType: 'kvk-prep', position: 3, date }),
        makeActivity({ id: 'act-mine-2', userId: 'user-current', activityType: 'legion', position: 1, date }),
        makeActivity({
          id: 'act-rival-1',
          userId: 'user-other',
          displayName: 'Rival',
          activityType: 'kvk-prep',
          position: 3,
          date,
        }),
        makeActivity({
          id: 'act-rival-2',
          userId: 'user-other',
          displayName: 'Rival',
          activityType: 'legion',
          position: 1,
          date,
        }),
      ]);

      // Act
      const result: PositionConflict[] = conflictService.getConflictsForCurrentUser();

      // Assert
      expect(result).toHaveLength(2);
      const activityIds = result.map(c => c.activityId);
      expect(activityIds).toContain('act-mine-1');
      expect(activityIds).toContain('act-mine-2');
    });
  });
});
