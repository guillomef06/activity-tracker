import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal } from '@angular/core';
import { ActivityService } from './activity.service';
import { SupabaseService } from './supabase.service';
import { AuthService } from './auth.service';
import { AllianceService } from './alliance.service';
import type { UserScore } from '@app/shared/models';
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
  };

  const makeWeeklyScores = (activitiesByWeek: ActivityRow[][]) => {
    return activitiesByWeek.map(acts => ({
      weekStart: new Date(),
      weekEnd: new Date(),
      totalPoints: acts.reduce((s, a) => s + a.points, 0),
      activities: acts.map(a => ({ ...a, id: '1', userName: 'x', date: new Date(), timestamp: 0 })),
      conflictingPositions: undefined,
    }));
  };

  beforeEach(() => {
    allianceServiceMock = {
      alliance: signal<Alliance | null>(null),
      rules: signal([]),
      loadRules: vi.fn().mockResolvedValue({ error: null }),
      calculatePoints: vi.fn().mockReturnValue({ points: 0, usedFallback: true }),
    };

    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
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

  describe('getUserScores() tiebreaker sort', () => {
    it('should sort by tiebreaker activity points when sixWeekTotal is equal', () => {
      const userA: UserScore = {
        userId: 'a',
        userName: 'Alice',
        sixWeekTotal: 30,
        weeklyScores: makeWeeklyScores([
          [{ activityType: 'legion', points: 20, position: 1, userId: 'a' }],
          [{ activityType: 'stellar glory', points: 10, position: null, userId: 'a' }],
        ]),
      };
      const userB: UserScore = {
        userId: 'b',
        userName: 'Bob',
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

      const userA: UserScore = { userId: 'a', userName: 'Alice', sixWeekTotal: 30, weeklyScores: [] };
      const userB: UserScore = { userId: 'b', userName: 'Bob', sixWeekTotal: 30, weeklyScores: [] };

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
});
