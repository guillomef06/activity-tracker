import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { MG_CALENDAR_ROUTE } from '@shared/constants/mg-calendar.constant';
import type { MgBannerState } from '@shared/models/calendar-entry.model';
import { MgCalendarBannerComponent } from './mg-calendar-banner.component';

const TRANSLATIONS = {
  mg: {
    calendar: {
      banner: {
        superAdminLow: 'Only {{ count }} MG planned',
        superAdminLowAction: 'Plan MGs',
        serverAdminNone: 'No MG planned',
        playerNext: 'MG {{ start }}, opening {{ opening }}',
        playerFollowing: 'Following MG {{ start }}, opening {{ opening }}',
        playerNotAnnounced: 'Not announced',
        cancelledNotice: 'MG of {{ start }} cancelled',
      },
    },
  },
};

describe('MgCalendarBannerComponent', () => {
  let fixture: ComponentFixture<MgCalendarBannerComponent>;

  const render = (state: MgBannerState, actionLink?: string | null): HTMLElement => {
    fixture.componentRef.setInput('state', state);
    if (actionLink !== undefined) {
      fixture.componentRef.setInput('actionLink', actionLink);
    }
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MgCalendarBannerComponent, TranslateModule.forRoot()],
      providers: [provideRouter([]), provideZonelessChangeDetection()],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', TRANSLATIONS);
    translate.use('en');
    fixture = TestBed.createComponent(MgCalendarBannerComponent);
  });

  it('should render nothing when state is none', () => {
    const el = render({ kind: 'none' });

    expect(el.querySelector('.banner')).toBeNull();
    expect(el.querySelector('[role="status"]')).toBeNull();
    expect(el.textContent?.trim()).toBe('');
  });

  it('should render the count and an action link when state is superAdminLow', () => {
    const el = render({ kind: 'superAdminLow', futureCount: 1 });

    expect(el.querySelector('[role="status"]')?.textContent).toContain('Only 1 MG planned');
    const link = el.querySelector('a');
    expect(link?.textContent?.trim()).toBe('Plan MGs');
    expect(link?.getAttribute('href')).toBe(MG_CALENDAR_ROUTE);
  });

  it('should point the action to actionLink when provided', () => {
    const el = render({ kind: 'superAdminLow', futureCount: 0 }, '/app/custom');

    expect(el.querySelector('a')?.getAttribute('href')).toBe('/app/custom');
  });

  it('should render text without any link when state is serverAdminNone', () => {
    const el = render({ kind: 'serverAdminNone' });

    expect(el.querySelector('[role="status"]')?.textContent).toContain('No MG planned');
    expect(el.querySelector('a')).toBeNull();
  });

  it('should render both dates without timezone shift when state is playerNext', () => {
    const el = render({ kind: 'playerNext', mgStart: '2027-05-31', openingDate: '2027-05-24' });

    const text = el.querySelector('[role="status"]')?.textContent ?? '';
    expect(text).toContain('May 31, 2027');
    expect(text).toContain('May 24, 2027');
    expect(el.querySelector('a')).toBeNull();
  });

  it('should use the "following MG" wording when a current event is already displayed', () => {
    const el = render({ kind: 'playerNext', mgStart: '2027-05-31', openingDate: '2027-05-24', afterCurrent: true });

    const text = el.querySelector('[role="status"]')?.textContent ?? '';
    expect(text).toContain('Following MG');
    expect(text).toContain('May 31, 2027');
  });

  it('should render the not announced message when state is playerNotAnnounced', () => {
    const el = render({ kind: 'playerNotAnnounced' });

    expect(el.querySelector('[role="status"]')?.textContent).toContain('Not announced');
    expect(el.querySelector('a')).toBeNull();
  });

  it('should render the cancelled start date when state is cancelled', () => {
    const el = render({ kind: 'cancelled', mgStart: '2027-01-01' });

    expect(el.querySelector('[role="status"]')?.textContent).toContain('MG of Jan 1, 2027 cancelled');
    expect(el.querySelector('a')).toBeNull();
  });

  it('should expose role status on every visible kind', () => {
    const states: MgBannerState[] = [
      { kind: 'superAdminLow', futureCount: 1 },
      { kind: 'serverAdminNone' },
      { kind: 'playerNext', mgStart: '2027-05-31', openingDate: '2027-05-24' },
      { kind: 'playerNotAnnounced' },
      { kind: 'cancelled', mgStart: '2027-05-31' },
    ];

    for (const state of states) {
      expect(render(state).querySelectorAll('[role="status"]')).toHaveLength(1);
    }
  });
});
