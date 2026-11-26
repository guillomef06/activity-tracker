import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SuperAdminDashboardPage } from './super-admin-dashboard.page';
import { SupabaseService } from '@app/core/services/supabase.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { provideZonelessChangeDetection } from '@angular/core';
import { CalendarService } from '@app/core/services/calendar.service';
import { MG_CALENDAR_ROUTE } from '@shared/constants/mg-calendar.constant';
import type { CalendarEntry } from '@shared/models/calendar-entry.model';

const TRANSLATIONS = {
  superAdmin: { dashboard: { manageCalendar: 'Calendar', manageCalendarDesc: 'Plan the MGs' } },
  mg: {
    calendar: {
      banner: { superAdminLow: 'Only {{ count }} MG planned', superAdminLowAction: 'Plan MGs' },
    },
  },
};

const NOW = new Date(2026, 5, 15);
const entry = (overrides: Partial<CalendarEntry>): CalendarEntry => ({
  id: 'e',
  type: 'mg',
  title: null,
  starts_at: '2026-07-20',
  ends_at: '2026-07-26',
  all_day: true,
  cancelled_at: null,
  cancelled_by: null,
  created_at: '2026-01-01T00:00:00Z',
  created_by: null,
  updated_at: '2026-01-01T00:00:00Z',
  updated_by: null,
  ...overrides,
});

describe('SuperAdminDashboardPage', () => {
  let component: SuperAdminDashboardPage;
  let fixture: ComponentFixture<SuperAdminDashboardPage>;

  let loadEntries: ReturnType<typeof vi.fn>;

  const create = async (): Promise<void> => {
    fixture = TestBed.createComponent(SuperAdminDashboardPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const html = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    loadEntries = vi.fn().mockResolvedValue([]);
    // Create a chainable mock for Supabase client
    interface MockQueryBuilder {
      select: ReturnType<typeof vi.fn>;
      is: ReturnType<typeof vi.fn>;
      gt: ReturnType<typeof vi.fn>;
      then: (resolve: (value: { data: null; count: number; error: null }) => void) => void;
    }

    const mockQueryBuilder = {} as MockQueryBuilder;
    mockQueryBuilder.select = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.is = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.gt = vi.fn().mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.then = resolve => {
      resolve({ data: null, count: 0, error: null });
    };

    const supabaseServiceSpy = {
      client: {
        from: vi.fn().mockReturnValue(mockQueryBuilder),
      },
    };

    await TestBed.configureTestingModule({
      imports: [SuperAdminDashboardPage, TranslateModule.forRoot()],
      providers: [
        { provide: SupabaseService, useValue: supabaseServiceSpy },
        { provide: CalendarService, useValue: { loadEntries } },
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', TRANSLATIONS);
    translate.use('en');
    await create();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should not render a back button (the dashboard is the landing page)', () => {
    expect((fixture.nativeElement as HTMLElement).querySelector('app-back-to-dashboard-button')).toBeNull();
  });

  it('should have statistics signals', () => {
    expect(component['stats']).toBeDefined();
  });

  describe('calendar banner', () => {
    const bannerText = (): string => html().querySelector('app-mg-calendar-banner')?.textContent ?? '';

    const recreateWith = async (setup: () => void): Promise<void> => {
      fixture.destroy();
      setup();
      await create();
    };

    it('should show the banner when no future entry exists', () => {
      expect(bannerText()).toContain('Only 0 MG planned');
    });

    it('should show the banner with a single future entry', async () => {
      await recreateWith(() => loadEntries.mockResolvedValue([entry({ id: 'a' })]));
      expect(bannerText()).toContain('Only 1 MG planned');
    });

    it('should hide the banner with two future entries', async () => {
      await recreateWith(() =>
        loadEntries.mockResolvedValue([entry({ id: 'a' }), entry({ id: 'b', starts_at: '2026-08-31' })])
      );
      expect(bannerText().trim()).toBe('');
    });

    it('should ignore cancelled entries', async () => {
      await recreateWith(() =>
        loadEntries.mockResolvedValue([
          entry({ id: 'a' }),
          entry({ id: 'b', starts_at: '2026-08-31', cancelled_at: '2026-06-01T00:00:00Z' }),
        ])
      );
      expect(bannerText()).toContain('Only 1 MG planned');
    });

    it('should hide the banner and log once when loading fails', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      await recreateWith(() => loadEntries.mockRejectedValue(new Error('boom')));
      expect(bannerText().trim()).toBe('');
      expect(errorSpy).toHaveBeenCalledTimes(1);
    });

    it('should link the banner action to the calendar page', () => {
      const link = html().querySelector<HTMLAnchorElement>('app-mg-calendar-banner a');
      expect(link?.getAttribute('href')).toBe(MG_CALENDAR_ROUTE);
    });
  });

  describe('calendar quick action', () => {
    it('should render a calendar card pointing to the calendar page', () => {
      const cards = Array.from(html().querySelectorAll<HTMLElement>('.action-card'));
      const card = cards.find(c => c.textContent?.includes('Plan the MGs'));
      expect(card).toBeTruthy();
      expect(card?.getAttribute('routerLink') ?? card?.getAttribute('ng-reflect-router-link')).toBe(
        '/app/super-admin/calendar'
      );
      expect(card?.querySelector('mat-icon')?.textContent?.trim()).toBe('event_note');
      expect(card?.querySelector('h3')?.textContent?.trim()).toBe('Calendar');
    });
  });
});
