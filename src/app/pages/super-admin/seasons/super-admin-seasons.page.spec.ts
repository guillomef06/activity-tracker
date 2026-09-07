import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal, provideZonelessChangeDetection } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import type { MatDatepickerInputEvent } from '@angular/material/datepicker';
import { TranslateModule } from '@ngx-translate/core';
import { of } from 'rxjs';

import { SuperAdminSeasonsPage } from './super-admin-seasons.page';
import { SeasonService } from '@app/core/services/season.service';
import { SnackbarService } from '@app/core/services';
import type {
  CreateSeasonRequest,
  SeasonWithWeeks,
  UpdateSeasonStructureRequest,
} from '@app/shared/models/season.model';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

const makeSeason = (overrides: Partial<SeasonWithWeeks> = {}): SeasonWithWeeks => ({
  id: 'season-1',
  name: 'Season One',
  startDate: new Date(Date.now() - 3 * DAY_MS),
  weekCount: 2,
  endDate: new Date(Date.now() + 10 * DAY_MS),
  createdAt: new Date(),
  updatedAt: new Date(),
  weekActivities: [
    { id: 'w1', seasonId: 'season-1', weekIndex: 1, activityType: 'kvk prep' },
    { id: 'w2', seasonId: 'season-1', weekIndex: 2, activityType: 'me overall' },
  ],
  ...overrides,
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SuperAdminSeasonsPage', () => {
  let fixture: ComponentFixture<SuperAdminSeasonsPage>;
  let component: SuperAdminSeasonsPage;
  let seasonsSignal: ReturnType<typeof signal<SeasonWithWeeks[]>>;
  let seasonServiceMock: {
    seasons: ReturnType<typeof signal<SeasonWithWeeks[]>>;
    loadSeasons: ReturnType<typeof vi.fn>;
    suggestNextSeasonStartDate: ReturnType<typeof vi.fn>;
    checkSeasonLocked: ReturnType<typeof vi.fn>;
    createSeason: ReturnType<typeof vi.fn>;
    updateSeasonName: ReturnType<typeof vi.fn>;
    updateSeasonStructure: ReturnType<typeof vi.fn>;
    deleteSeason: ReturnType<typeof vi.fn>;
  };
  let snackbarMock: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let dialogMock: { open: ReturnType<typeof vi.fn> };

  const suggestedStart = new Date(Date.now() + 20 * DAY_MS);

  beforeEach(async () => {
    seasonsSignal = signal<SeasonWithWeeks[]>([makeSeason()]);

    seasonServiceMock = {
      seasons: seasonsSignal,
      loadSeasons: vi.fn().mockResolvedValue(undefined),
      suggestNextSeasonStartDate: vi.fn().mockReturnValue(suggestedStart),
      checkSeasonLocked: vi.fn().mockResolvedValue(false),
      createSeason: vi.fn().mockResolvedValue({ season: makeSeason({ id: 'season-2' }), error: null }),
      updateSeasonName: vi.fn().mockResolvedValue({ error: null }),
      updateSeasonStructure: vi.fn().mockResolvedValue({ error: null }),
      deleteSeason: vi.fn().mockResolvedValue({ error: null }),
    };

    snackbarMock = { success: vi.fn(), error: vi.fn() };

    dialogMock = {
      open: vi.fn().mockReturnValue({ afterClosed: () => of(true) }),
    };

    await TestBed.configureTestingModule({
      imports: [SuperAdminSeasonsPage, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: SeasonService, useValue: seasonServiceMock },
        { provide: SnackbarService, useValue: snackbarMock },
        { provide: MatDialog, useValue: dialogMock },
      ],
    })
      .overrideComponent(SuperAdminSeasonsPage, { remove: { imports: [MatDialogModule] } })
      .compileComponents();

    fixture = TestBed.createComponent(SuperAdminSeasonsPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  it('should load seasons via the seasons resource on init', () => {
    expect(seasonServiceMock.loadSeasons).toHaveBeenCalledOnce();
    expect(component['seasons']()).toEqual(seasonsSignal());
  });

  it('should surface a load error through the seasons resource', async () => {
    seasonServiceMock.loadSeasons.mockRejectedValueOnce(new Error('network down'));

    component['seasonsResource'].reload();
    await fixture.whenStable();

    expect(component['seasonsResource'].error()).toBeDefined();
  });

  describe('Season status derivation', () => {
    it('should classify a season as current when today falls within its range', () => {
      const season = makeSeason({
        startDate: new Date(Date.now() - 3 * DAY_MS),
        endDate: new Date(Date.now() + 3 * DAY_MS),
      });
      expect(component['seasonStatus'](season)).toBe('current');
    });

    it('should classify a season as past when its end date has already passed', () => {
      const season = makeSeason({
        startDate: new Date(Date.now() - 20 * DAY_MS),
        endDate: new Date(Date.now() - 5 * DAY_MS),
      });
      expect(component['seasonStatus'](season)).toBe('past');
    });

    it('should classify a season as future when its start date has not yet arrived', () => {
      const season = makeSeason({
        startDate: new Date(Date.now() + 5 * DAY_MS),
        endDate: new Date(Date.now() + 20 * DAY_MS),
      });
      expect(component['seasonStatus'](season)).toBe('future');
    });
  });

  describe('Create flow', () => {
    it('should pre-fill a disabled start date suggested by the service', () => {
      component['openCreateWizard']();
      expect(seasonServiceMock.suggestNextSeasonStartDate).toHaveBeenCalled();
      expect(component['suggestedStartDate']()).toEqual(suggestedStart);
    });

    it('should be invalid until the name is filled in', () => {
      component['openCreateWizard']();

      expect(component['createForm']().valid()).toBe(false);

      component['createModel'].update(model => ({ ...model, name: 'New Season' }));

      expect(component['createForm']().valid()).toBe(true);
    });

    it('should call createSeason with a correctly-shaped payload on happy path', async () => {
      component['openCreateWizard']();
      component['createModel'].set({ name: 'New Season', weekCount: 2 });
      component['setCreateWeekActivityTypes'](0, ['kvk prep']);
      component['setCreateWeekActivityTypes'](1, ['me overall', 'stellar dynasty']);

      await component['submitCreateSeason']();

      const expectedRequest: CreateSeasonRequest = {
        name: 'New Season',
        startDate: suggestedStart,
        weekCount: 2,
        weekActivities: [
          { weekIndex: 1, activityType: 'kvk prep' },
          { weekIndex: 2, activityType: 'me overall' },
          { weekIndex: 2, activityType: 'stellar dynasty' },
        ],
      };
      expect(seasonServiceMock.createSeason).toHaveBeenCalledWith(expectedRequest);
      expect(snackbarMock.success).toHaveBeenCalled();
      expect(component['showCreateWizard']()).toBe(false);
    });

    it('should show a snackbar error and keep the wizard open with data intact on failure', async () => {
      seasonServiceMock.createSeason.mockResolvedValue({ season: null, error: 'Overlapping season' });
      component['openCreateWizard']();
      component['createModel'].set({ name: 'Broken Season', weekCount: 1 });

      await component['submitCreateSeason']();

      expect(snackbarMock.error).toHaveBeenCalledWith('Overlapping season');
      expect(component['showCreateWizard']()).toBe(true);
      expect(component['createModel']().name).toBe('Broken Season');
    });
  });

  describe('Start date picker', () => {
    it('should keep the start date fixed when a season already exists', () => {
      expect(component['canPickStartDate']()).toBe(false);
    });

    it('should allow picking any start date when no season exists yet', async () => {
      seasonsSignal.set([]);
      component['seasonsResource'].reload();
      await fixture.whenStable();

      expect(component['canPickStartDate']()).toBe(true);
    });

    it('should accept Mondays through the datepicker filter', () => {
      const monday = new Date('2026-08-17T00:00:00');

      expect(component['mondayFilter'](monday)).toBe(true);
    });

    it('should reject non-Monday dates and null through the datepicker filter', () => {
      const tuesday = new Date('2026-08-18T00:00:00');

      expect(component['mondayFilter'](tuesday)).toBe(false);
      expect(component['mondayFilter'](null)).toBe(false);
    });

    it('should update the suggested start date when the user picks a date', () => {
      const picked = new Date('2026-09-07T00:00:00');

      component['onStartDateChange']({ value: picked } as MatDatepickerInputEvent<Date>);

      const result = component['suggestedStartDate']();
      expect(result?.getUTCFullYear()).toBe(2026);
      expect(result?.getUTCMonth()).toBe(8);
      expect(result?.getUTCDate()).toBe(7);
    });

    it('should re-anchor the picked calendar day to UTC midnight so it always reads as the clicked weekday', () => {
      // mat-datepicker builds the picked date at *local* midnight (the app's
      // local Date constructor, not UTC) — in any positive-UTC-offset
      // timezone, that instant is still the previous day in UTC, which used
      // to make getUTCDay() read Sunday for a Monday the user actually clicked.
      const localMidnightMonday = new Date(2026, 8, 7); // September 7 2026, local midnight (a Monday)

      component['onStartDateChange']({ value: localMidnightMonday } as MatDatepickerInputEvent<Date>);

      expect(component['suggestedStartDate']()?.getUTCDay()).toBe(1);
    });

    it('should ignore a datepicker change event with no value', () => {
      component['openCreateWizard']();
      const before = component['suggestedStartDate']();

      component['onStartDateChange']({ value: null } as MatDatepickerInputEvent<Date>);

      expect(component['suggestedStartDate']()).toEqual(before);
    });
  });

  describe('Edit flow — locked season', () => {
    it('should disable structural fields and only allow name edits', async () => {
      seasonServiceMock.checkSeasonLocked.mockResolvedValue(true);
      const season = seasonsSignal()[0];

      await component['toggleExpand'](season);
      component['startEdit'](season);

      expect(component['isLocked'](season.id)).toBe(true);
      expect(component['editForm'].weekCount().disabled()).toBe(true);

      component['editModel'].update(model => ({ ...model, name: 'Renamed Season' }));
      await component['saveEdit'](season);

      expect(seasonServiceMock.updateSeasonName).toHaveBeenCalledWith(season.id, 'Renamed Season');
      expect(seasonServiceMock.updateSeasonStructure).not.toHaveBeenCalled();
    });
  });

  describe('Edit flow — unlocked season', () => {
    it('should call updateSeasonStructure with the expected payload', async () => {
      seasonServiceMock.checkSeasonLocked.mockResolvedValue(false);
      const season = seasonsSignal()[0];

      await component['toggleExpand'](season);
      component['startEdit'](season);

      expect(component['editForm'].weekCount().disabled()).toBe(false);

      component['setEditWeekActivityTypes'](0, ['golden expedition']);
      await component['saveEdit'](season);

      const expectedRequest: UpdateSeasonStructureRequest = {
        seasonId: season.id,
        weekCount: 2,
        weekActivities: [
          { weekIndex: 1, activityType: 'golden expedition' },
          { weekIndex: 2, activityType: 'me overall' },
        ],
      };
      expect(seasonServiceMock.updateSeasonStructure).toHaveBeenCalledWith(expectedRequest);
      expect(snackbarMock.success).toHaveBeenCalled();
    });
  });

  describe('Delete flow', () => {
    it('should be blocked without opening the dialog when the season is locked', async () => {
      const season = seasonsSignal()[0];
      component['lockedSeasons'].set({ [season.id]: true });

      await component['deleteSeason'](season);

      expect(dialogMock.open).not.toHaveBeenCalled();
      expect(seasonServiceMock.deleteSeason).not.toHaveBeenCalled();
    });

    it('should call deleteSeason after confirmation when unlocked', async () => {
      const season = seasonsSignal()[0];
      component['lockedSeasons'].set({ [season.id]: false });
      dialogMock.open.mockReturnValue({ afterClosed: () => of(true) });

      await component['deleteSeason'](season);

      expect(dialogMock.open).toHaveBeenCalled();
      expect(seasonServiceMock.deleteSeason).toHaveBeenCalledWith(season.id);
      expect(snackbarMock.success).toHaveBeenCalled();
    });

    it('should not call deleteSeason when the confirm dialog is dismissed', async () => {
      const season = seasonsSignal()[0];
      component['lockedSeasons'].set({ [season.id]: false });
      dialogMock.open.mockReturnValue({ afterClosed: () => of(false) });

      await component['deleteSeason'](season);

      expect(seasonServiceMock.deleteSeason).not.toHaveBeenCalled();
    });
  });
});
