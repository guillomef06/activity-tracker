import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal, provideZonelessChangeDetection } from '@angular/core';
import { ImportExcelTabComponent } from './import-excel-tab.component';
import { ActivityService, SnackbarService } from '@app/core/services';
import { ServerService } from '@app/core/services/server.service';
import { SeasonService } from '@app/core/services/season.service';
import { APP_CONSTANTS } from '@app/shared/constants/constants';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import type { UserProfile, SeasonWithWeeks } from '@app/shared/models';

// Local interface mirroring the private ImportRow in the component
interface MockRow {
  rowIndex: number;
  rawPlayerName: string;
  activityType: string;
  activityLabelKey: string | null;
  rawPosition: string;
  rawEventDate: string;
  matchedMember: UserProfile | null;
  eventDate: Date | null;
  weekStart: Date | null;
  weeksAgo: number | null;
  position: number | null;
  points: number;
  isExisting: boolean;
  includeUpdate: boolean;
  validationError: string | null;
  status: 'ready' | 'willUpdate' | 'unmatched' | 'invalid';
}

const MEMBERS: UserProfile[] = [
  {
    id: 'user1',
    display_name: 'Alice',
    username: 'alice',
    role: 'member',
    server_id: 'a1',
    invitation_token_id: null,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'user2',
    display_name: 'Bob',
    username: 'bob',
    role: 'member',
    server_id: 'a1',
    invitation_token_id: null,
    created_at: '',
    updated_at: '',
  },
];

// Use UTC dates to match getWeekStart() which operates in UTC
// Feb 25, 2026 (Wednesday) → weekStart = Feb 23, 2026 (Monday)
const TEST_ACTIVITY_DATE = new Date(Date.UTC(2026, 1, 25)); // UTC Wednesday
const TEST_WEEK_START = new Date(Date.UTC(2026, 1, 23)); // UTC Monday

function makeRow(activityType: string, status: MockRow['status'] = 'ready', overrides: Partial<MockRow> = {}): MockRow {
  return {
    rowIndex: 0,
    rawPlayerName: 'TestPlayer',
    activityType,
    activityLabelKey: 'activities.types.' + activityType,
    rawPosition: '1',
    rawEventDate: '2026-03-03',
    matchedMember: MEMBERS[0],
    eventDate: TEST_ACTIVITY_DATE,
    weekStart: TEST_WEEK_START,
    weeksAgo: 0,
    position: 1,
    points: 10,
    isExisting: status === 'willUpdate',
    includeUpdate: false,
    validationError: status === 'invalid' ? 'invalid_activity' : null,
    status,
    ...overrides,
  };
}

describe('ImportExcelTabComponent', () => {
  let component: ImportExcelTabComponent;
  let fixture: ComponentFixture<ImportExcelTabComponent>;

  const activitiesSignal = signal<
    { userId: string; activityType: string; date: Date; points: number; position: number | null }[]
  >([]);

  const activityServiceSpy = {
    activities: activitiesSignal.asReadonly(),
    batchImportActivities: vi.fn().mockResolvedValue({ error: null }),
  };

  const serverServiceSpy = {
    isActivityEnabled: vi.fn().mockReturnValue(true),
    isParticipationMode: vi.fn().mockReturnValue(false),
    getParticipationPoints: vi.fn().mockReturnValue(5),
  };

  const snackbarServiceSpy = {
    error: vi.fn(),
    success: vi.fn(),
  };

  const seasonServiceSpy = {
    seasons: signal([]),
    loadSeasons: vi.fn().mockResolvedValue(undefined),
    getSeasonForDate: vi.fn().mockReturnValue(null),
    getAvailableActivityTypesForDate: vi.fn().mockReturnValue(APP_CONSTANTS.ACTIVITY_TYPES),
    getEarliestAllowedDate: vi.fn().mockReturnValue(new Date('2000-01-01T00:00:00Z')),
    suggestNextSeasonStartDate: vi.fn().mockReturnValue(new Date()),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    activitiesSignal.set([]);
    // Restore any stubs from previous tests before re-configuring TestBed
    vi.restoreAllMocks();
    // Re-apply default implementations cleared by restoreAllMocks
    activityServiceSpy.batchImportActivities = vi.fn().mockResolvedValue({ error: null });
    seasonServiceSpy.getSeasonForDate = vi.fn().mockReturnValue(null);
    seasonServiceSpy.getAvailableActivityTypesForDate = vi.fn().mockReturnValue(APP_CONSTANTS.ACTIVITY_TYPES);

    await TestBed.configureTestingModule({
      imports: [ImportExcelTabComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [
        { provide: ActivityService, useValue: activityServiceSpy },
        { provide: ServerService, useValue: serverServiceSpy },
        { provide: SeasonService, useValue: seasonServiceSpy },
        { provide: SnackbarService, useValue: snackbarServiceSpy },
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ImportExcelTabComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('members', MEMBERS);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start in upload step', () => {
    expect(component['step']()).toBe('upload');
  });

  // ─── filteredRows ────────────────────────────────────────────────────────────

  describe('filteredRows', () => {
    it('should return all rows when filter is "all"', () => {
      component['rows'].set([makeRow('legion'), makeRow('kvk-prep')]);
      component['activityFilter'].set('all');
      expect(component['filteredRows']()).toHaveLength(2);
    });

    it('should filter rows by activityType when filter is set', () => {
      component['rows'].set([makeRow('legion'), makeRow('kvk-prep')]);
      component['activityFilter'].set('legion');
      const filtered = component['filteredRows']();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].activityType).toBe('legion');
    });
  });

  // ─── rowsToInsert / rowsToUpdate / skippedRows ───────────────────────────────

  describe('rowsToInsert / rowsToUpdate / skippedRows', () => {
    it('should count ready rows as rowsToInsert', () => {
      component['rows'].set([makeRow('legion', 'ready')]);
      expect(component['rowsToInsert']()).toHaveLength(1);
      expect(component['rowsToUpdate']()).toHaveLength(0);
      expect(component['skippedRows']()).toHaveLength(0);
    });

    it('should count willUpdate rows with includeUpdate=true as rowsToUpdate', () => {
      component['rows'].set([makeRow('legion', 'willUpdate', { includeUpdate: true })]);
      expect(component['rowsToUpdate']()).toHaveLength(1);
      expect(component['rowsToInsert']()).toHaveLength(0);
    });

    it('should count willUpdate rows with includeUpdate=false as skipped', () => {
      component['rows'].set([makeRow('legion', 'willUpdate', { includeUpdate: false })]);
      expect(component['skippedRows']()).toHaveLength(1);
      expect(component['rowsToUpdate']()).toHaveLength(0);
    });

    it('should count unmatched and invalid rows as skipped', () => {
      component['rows'].set([makeRow('legion', 'unmatched'), makeRow('kvk-prep', 'invalid')]);
      expect(component['skippedRows']()).toHaveLength(2);
    });
  });

  // ─── hasExistingRows / canImport ─────────────────────────────────────────────

  describe('hasExistingRows', () => {
    it('should be true when at least one row is existing and matched without validation error', () => {
      component['rows'].set([makeRow('legion', 'willUpdate')]);
      expect(component['hasExistingRows']()).toBe(true);
    });

    it('should be false when no existing rows', () => {
      component['rows'].set([makeRow('legion', 'ready')]);
      expect(component['hasExistingRows']()).toBe(false);
    });
  });

  describe('canImport', () => {
    it('should be true when there are rows to insert', () => {
      component['rows'].set([makeRow('legion', 'ready')]);
      expect(component['canImport']()).toBe(true);
    });

    it('should be false when only skipped rows', () => {
      component['rows'].set([makeRow('legion', 'invalid')]);
      expect(component['canImport']()).toBe(false);
    });
  });

  // ─── toggleUpdateAll ─────────────────────────────────────────────────────────

  describe('toggleUpdateAll', () => {
    it('should set includeUpdate=true on all valid existing rows', () => {
      component['rows'].set([makeRow('legion', 'willUpdate', { isExisting: true }), makeRow('kvk-prep', 'ready')]);
      component['toggleUpdateAll'](true);
      expect(component['rows']()[0].includeUpdate).toBe(true);
      expect(component['rows']()[1].includeUpdate).toBe(false); // not existing, no change
    });

    it('should set includeUpdate=false on all valid existing rows', () => {
      component['rows'].set([makeRow('legion', 'willUpdate', { isExisting: true, includeUpdate: true })]);
      component['toggleUpdateAll'](false);
      expect(component['rows']()[0].includeUpdate).toBe(false);
    });

    it('should not change rows with validation errors', () => {
      component['rows'].set([makeRow('legion', 'invalid', { isExisting: true })]);
      component['toggleUpdateAll'](true);
      expect(component['rows']()[0].includeUpdate).toBe(false);
    });
  });

  // ─── toggleRowUpdate ─────────────────────────────────────────────────────────

  describe('toggleRowUpdate', () => {
    it('should update includeUpdate for the specified row', () => {
      const row = makeRow('legion', 'willUpdate');
      component['rows'].set([row]);
      component['toggleRowUpdate'](row, true);
      expect(component['rows']()[0].includeUpdate).toBe(true);
    });
  });

  // ─── assignMember ────────────────────────────────────────────────────────────

  describe('assignMember', () => {
    it('should assign a member and set status to ready when no existing entry', () => {
      activitiesSignal.set([]);
      const row = makeRow('legion', 'unmatched', { matchedMember: null });
      component['rows'].set([row]);

      component['assignMember'](row, MEMBERS[0] as never);

      const updated = component['rows']()[0];
      expect(updated.matchedMember?.id).toBe('user1');
      expect(updated.status).toBe('ready');
    });

    it('should assign a member and set status to willUpdate when existing entry exists', () => {
      // Use UTC dates to match getWeekStart() which operates in UTC
      // Feb 25, 2026 (Wed) → weekStart = Feb 23, 2026 (Mon)
      const weekStart = new Date(Date.UTC(2026, 1, 23)); // UTC Monday
      activitiesSignal.set([
        {
          userId: 'user1',
          activityType: 'legion',
          date: new Date(Date.UTC(2026, 1, 25)), // UTC Wednesday
          points: 10,
          position: 1,
        },
      ]);

      const row = makeRow('legion', 'unmatched', {
        matchedMember: null,
        weekStart,
        activityType: 'legion',
      });
      component['rows'].set([row]);

      component['assignMember'](row, MEMBERS[0] as never);

      const updated = component['rows']()[0];
      expect(updated.isExisting).toBe(true);
      expect(updated.status).toBe('willUpdate');
    });
  });

  // ─── confirmImport ───────────────────────────────────────────────────────────

  describe('confirmImport', () => {
    it('should call batchImportActivities and transition to done step', async () => {
      component['rows'].set([makeRow('legion', 'ready')]);

      await component['confirmImport']();

      expect(activityServiceSpy.batchImportActivities).toHaveBeenCalledOnce();
      expect(component['step']()).toBe('done');
    });

    it('should include both inserts and updates in the payload', async () => {
      component['rows'].set([makeRow('legion', 'ready'), makeRow('kvk-prep', 'willUpdate', { includeUpdate: true })]);

      await component['confirmImport']();

      const call = activityServiceSpy.batchImportActivities.mock.calls[0][0];
      expect(call).toHaveLength(2);
    });

    it('should not call batchImportActivities when there is nothing to import', async () => {
      component['rows'].set([makeRow('legion', 'invalid')]);

      await component['confirmImport']();

      expect(activityServiceSpy.batchImportActivities).not.toHaveBeenCalled();
    });

    it('should show error snackbar and stay on preview when import fails', async () => {
      activityServiceSpy.batchImportActivities.mockResolvedValue({ error: new Error('fail') });
      // Must be in preview step for the assertion to be meaningful
      component['step'].set('preview');
      component['rows'].set([makeRow('legion', 'ready')]);

      await component['confirmImport']();

      expect(snackbarServiceSpy.error).toHaveBeenCalled();
      expect(component['step']()).toBe('preview'); // stayed in preview, did not transition to done
    });

    it('should set importResult with correct counts', async () => {
      component['rows'].set([
        makeRow('legion', 'ready'),
        makeRow('kvk-prep', 'willUpdate', { includeUpdate: true }),
        makeRow('desolate-desert', 'invalid'),
      ]);

      await component['confirmImport']();

      const result = component['importResult']();
      expect(result?.inserted).toBe(1);
      expect(result?.updated).toBe(1);
      expect(result?.skipped).toBe(1);
    });
  });

  // ─── buildSeasonReferenceRows (Reference sheet, season-scoped) ───────────────

  describe('buildSeasonReferenceRows', () => {
    it('should generate a single explanatory row without throwing when there is no active season for today', () => {
      seasonServiceSpy.getSeasonForDate.mockReturnValue(null);

      const rows = component['buildSeasonReferenceRows']();

      expect(rows).toHaveLength(1);
      expect(rows[0][0]).toBe('server.import.noActiveSeasonReference');
    });

    it('should scope each non-legion activity type to the season weeks it is assigned to, and give legion every week', () => {
      // 3-week season: Mon Mar 2 2026 -> Sun Mar 22 2026 (UTC)
      const mockSeason = {
        id: 'season-1',
        startDate: new Date(Date.UTC(2026, 2, 2)),
        endDate: new Date(Date.UTC(2026, 2, 22)),
        weekCount: 3,
      } as unknown as SeasonWithWeeks;
      seasonServiceSpy.getSeasonForDate.mockReturnValue(mockSeason);

      const legion = APP_CONSTANTS.ACTIVITY_TYPES.find(t => t.value === 'legion')!;
      const kvkPrep = APP_CONSTANTS.ACTIVITY_TYPES.find(t => t.value === 'kvk prep')!;

      // kvk prep only assigned on week 2 (Mar 9); legion assigned every week
      seasonServiceSpy.getAvailableActivityTypesForDate.mockImplementation((date: Date) => {
        const isWeek2 = date.getTime() === Date.UTC(2026, 2, 9);
        return isWeek2 ? [legion, kvkPrep] : [legion];
      });

      const rows = component['buildSeasonReferenceRows']();

      const legionRow = rows.find(r => r[0] === 'legion')!;
      const kvkPrepRow = rows.find(r => r[0] === 'kvk prep')!;

      expect(legionRow[2]).toBe('1, 2, 3');
      expect(kvkPrepRow[2]).toBe('2');
    });
  });

  // ─── reset ───────────────────────────────────────────────────────────────────

  describe('reset', () => {
    it('should reset to upload step and clear rows and result', () => {
      component['step'].set('done');
      component['rows'].set([makeRow('legion', 'ready')]);
      component['activityFilter'].set('legion');
      component['importResult'].set({ inserted: 1, updated: 0, skipped: 0 });

      component['reset']();

      expect(component['step']()).toBe('upload');
      expect(component['rows']()).toHaveLength(0);
      expect(component['activityFilter']()).toBe('all');
      expect(component['importResult']()).toBeNull();
    });
  });
});
