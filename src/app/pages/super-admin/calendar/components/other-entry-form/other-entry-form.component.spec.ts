import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import type { OtherEntryInput } from '@shared/models';
import { OtherEntryFormComponent, toOtherEntryFormValue, toOtherEntryInput } from './other-entry-form.component';

const TRANSLATIONS = {
  errors: { required: 'Required', maxLength: 'Too long' },
  superAdmin: {
    calendar: {
      type: { pvp: 'PvP' },
      dialog: { back: 'Back' },
      form: {
        type: 'Type',
        title: 'Title',
        allDay: 'All day',
        startsAt: 'Starts at (UTC)',
        endsAt: 'Ends at (UTC)',
        utcHint: 'Entered in UTC.',
        save: 'Save',
      },
      errors: { endsAfterStart: 'End must be after start.' },
    },
  },
};

const PVP_INPUT: OtherEntryInput = {
  type: 'pvp',
  title: 'Kingdom war',
  starts_at: '2027-01-05T19:00:00.000Z',
  ends_at: '2027-01-05T21:30:00.000Z',
  all_day: false,
};

const ALL_DAY_INPUT: OtherEntryInput = {
  type: 'pvp',
  title: 'Festival',
  starts_at: '2027-01-05T00:00:00.000Z',
  ends_at: '2027-01-08T00:00:00.000Z',
  all_day: true,
};

describe('OtherEntryFormComponent', () => {
  let fixture: ComponentFixture<OtherEntryFormComponent>;
  let el: HTMLElement;

  const field = (selector: string): HTMLInputElement => {
    const found = el.querySelector<HTMLInputElement>(selector);
    if (!found) {
      throw new Error(`Missing ${selector}`);
    }
    return found;
  };

  const type = async (selector: string, value: string): Promise<void> => {
    const input = field(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    input.dispatchEvent(new Event('blur'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const submit = async (): Promise<void> => {
    field('form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const toggleAllDay = async (): Promise<void> => {
    field('mat-slide-toggle button').click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const create = async (initial?: OtherEntryInput | null): Promise<void> => {
    fixture = TestBed.createComponent(OtherEntryFormComponent);
    if (initial !== undefined) {
      fixture.componentRef.setInput('initial', initial);
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    el = fixture.nativeElement as HTMLElement;
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OtherEntryFormComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();

    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', TRANSLATIONS);
    translate.use('en');
  });

  describe('pure mapping', () => {
    it('should convert UTC inputs to ISO values when timestamped', () => {
      const result = toOtherEntryInput({
        type: 'pvp',
        title: '  War ',
        allDay: false,
        startsAt: '2027-01-05T19:00',
        endsAt: '2027-01-05T21:30',
      });

      expect(result).toEqual({
        type: 'pvp',
        title: 'War',
        starts_at: '2027-01-05T19:00:00.000Z',
        ends_at: '2027-01-05T21:30:00.000Z',
        all_day: false,
      });
    });

    it('should use midnight UTC of both days when all-day', () => {
      const result = toOtherEntryInput({
        type: 'pvp',
        title: 'War',
        allDay: true,
        startsAt: '2027-01-05',
        endsAt: '2027-01-08',
      });

      expect(result?.starts_at).toBe('2027-01-05T00:00:00.000Z');
      expect(result?.ends_at).toBe('2027-01-09T00:00:00.000Z');
    });

    it('should store a single all-day entry with ends_at one day after starts_at', () => {
      const result = toOtherEntryInput({
        type: 'pvp',
        title: 'War',
        allDay: true,
        startsAt: '2027-01-05',
        endsAt: '2027-01-05',
      });

      expect(result?.starts_at).toBe('2027-01-05T00:00:00.000Z');
      expect(result?.ends_at).toBe('2027-01-06T00:00:00.000Z');
    });

    it('should show the last included day when pre-filling an all-day entry', () => {
      const value = toOtherEntryFormValue(ALL_DAY_INPUT);

      expect(value.startsAt).toBe('2027-01-05');
      expect(value.endsAt).toBe('2027-01-07');
    });

    it('should round-trip an all-day entry through the form value', () => {
      expect(toOtherEntryInput(toOtherEntryFormValue(ALL_DAY_INPUT))).toEqual(ALL_DAY_INPUT);
    });

    it('should return null when a date is missing', () => {
      const value = toOtherEntryFormValue(null);

      expect(toOtherEntryInput(value)).toBeNull();
    });

    it('should round-trip a stored entry through the form value', () => {
      expect(toOtherEntryInput(toOtherEntryFormValue(PVP_INPUT))).toEqual(PVP_INPUT);
    });
  });

  it('should label the date fields as UTC and show the UTC hint', async () => {
    await create();

    expect(el.textContent).toContain('Starts at (UTC)');
    expect(el.textContent).toContain('Ends at (UTC)');
    expect(el.textContent).toContain('Entered in UTC.');
  });

  it('should use datetime-local inputs by default and date inputs when all-day', async () => {
    await create();
    expect(field('.starts-at').type).toBe('datetime-local');

    await toggleAllDay();

    expect(field('.starts-at').type).toBe('date');
    expect(field('.ends-at').type).toBe('date');
  });

  it('should not emit and show required errors when the form is empty', async () => {
    await create();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);

    await submit();

    expect(saved).not.toHaveBeenCalled();
    expect(el.querySelectorAll('mat-error').length).toBeGreaterThan(0);
    expect(el.textContent).toContain('Required');
  });

  it('should reject a title longer than 100 characters', async () => {
    await create();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    await type('input[type="text"]', 'x'.repeat(101));
    await type('.starts-at', '2027-01-05T19:00');
    await type('.ends-at', '2027-01-05T21:00');

    await submit();

    expect(saved).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Too long');
  });

  it('should show endsAfterStart and not emit when the end is not after the start', async () => {
    await create();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    await type('input[type="text"]', 'War');
    await type('.starts-at', '2027-01-05T19:00');
    await type('.ends-at', '2027-01-05T19:00');

    await submit();

    expect(saved).not.toHaveBeenCalled();
    expect(el.textContent).toContain('End must be after start.');
  });

  it('should emit the UTC payload when the form is valid', async () => {
    await create();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    await type('input[type="text"]', 'Kingdom war');
    await type('.starts-at', '2027-01-05T19:00');
    await type('.ends-at', '2027-01-05T21:30');

    await submit();

    expect(saved).toHaveBeenCalledExactlyOnceWith(PVP_INPUT);
  });

  it('should emit an all-day payload at midnight UTC when the toggle is on', async () => {
    await create();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    await toggleAllDay();
    await type('input[type="text"]', 'Event');
    await type('.starts-at', '2027-01-05');
    await type('.ends-at', '2027-01-08');

    await submit();

    expect(saved).toHaveBeenCalledWith({
      type: 'pvp',
      title: 'Event',
      starts_at: '2027-01-05T00:00:00.000Z',
      ends_at: '2027-01-09T00:00:00.000Z',
      all_day: true,
    });
  });

  it('should accept a single-day all-day entry', async () => {
    await create();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    await toggleAllDay();
    await type('input[type="text"]', 'Event');
    await type('.starts-at', '2027-01-05');
    await type('.ends-at', '2027-01-05');

    await submit();

    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ ends_at: '2027-01-06T00:00:00.000Z' }));
  });

  it('should reject an all-day end before the start', async () => {
    await create();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    await toggleAllDay();
    await type('input[type="text"]', 'Event');
    await type('.starts-at', '2027-01-05');
    await type('.ends-at', '2027-01-04');

    await submit();

    expect(saved).not.toHaveBeenCalled();
    expect(el.textContent).toContain('End must be after start.');
  });

  it('should pre-fill the fields from the initial entry in UTC', async () => {
    await create(PVP_INPUT);

    expect(field('input[type="text"]').value).toBe('Kingdom war');
    expect(field('.starts-at').value).toBe('2027-01-05T19:00');
    expect(field('.ends-at').value).toBe('2027-01-05T21:30');
  });

  it('should keep the UTC day when switching an entry to all-day', async () => {
    await create(PVP_INPUT);

    await toggleAllDay();

    expect(field('.starts-at').value).toBe('2027-01-05');
  });

  it('should not emit and disable save when busy', async () => {
    await create(PVP_INPUT);
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);

    await submit();

    expect(field('.save-button').hasAttribute('disabled')).toBe(true);
    expect(saved).not.toHaveBeenCalled();
  });

  it('should emit cancelled when the back button is clicked', async () => {
    await create();
    const cancelled = vi.fn();
    fixture.componentInstance.cancelled.subscribe(cancelled);

    field('.cancel-button').click();

    expect(cancelled).toHaveBeenCalledTimes(1);
  });
});
