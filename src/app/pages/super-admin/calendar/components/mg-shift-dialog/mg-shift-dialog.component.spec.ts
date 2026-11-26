import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideNativeDateAdapter } from '@angular/material/core';
import type { MatDatepickerInputEvent } from '@angular/material/datepicker';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';

import type { MgEntryLike } from '@shared/models';
import type { MgShiftDialogData } from '../../calendar-page.models';
import { MgShiftDialogComponent } from './mg-shift-dialog.component';

const TRANSLATIONS = {
  superAdmin: {
    calendar: {
      dialog: {
        shiftTitle: 'Shift this MG',
        shiftNewOpening: 'New opening Monday',
        shiftMovedList: 'Entries that will move',
        shiftNotice: 'Every following MG moves too',
        shiftWithEvents: '{{ servers }} server(s), {{ registrations }} registration(s)',
        shiftNobodyNotified: 'Nobody is notified',
        confirm: 'Confirm',
        back: 'Back',
      },
      errors: {
        openingPassed: 'Opening already passed',
        reason: { must_move_later: 'Can only move later' },
      },
    },
  },
};

const entry = (id: string, startsAt: string): MgEntryLike => ({
  id,
  type: 'mg',
  starts_at: `${startsAt}T00:00:00Z`,
  cancelled_at: null,
});

const BASE_DATA: MgShiftDialogData = {
  entries: [entry('a', '2027-06-07'), entry('b', '2027-06-21')],
  selectedId: 'a',
  today: '2026-11-25',
  servers: 0,
  registrations: 0,
};

describe('MgShiftDialogComponent', () => {
  let fixture: ComponentFixture<MgShiftDialogComponent>;
  let component: MgShiftDialogComponent;
  const closeSpy = vi.fn();

  const setup = async (data: MgShiftDialogData = BASE_DATA): Promise<void> => {
    await TestBed.configureTestingModule({
      imports: [MgShiftDialogComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        provideNativeDateAdapter(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: closeSpy } },
      ],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', TRANSLATIONS);
    translate.use('en');
    fixture = TestBed.createComponent(MgShiftDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const pick = (value: Date | null): void => {
    component['onDateChange']({ value } as MatDatepickerInputEvent<Date>);
    fixture.detectChanges();
  };

  const confirmButton = (): HTMLButtonElement => {
    const buttons = (fixture.nativeElement as HTMLElement).querySelectorAll('button');
    return Array.from(buttons).find(b => b.textContent?.trim() === 'Confirm') as HTMLButtonElement;
  };

  beforeEach(() => {
    closeSpy.mockReset();
  });

  it('should disable confirm and show no preview before a date is picked', async () => {
    await setup();

    expect(confirmButton().disabled).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.moved')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Nobody is notified');
    expect(fixture.nativeElement.textContent).toContain('Every following MG moves too');
  });

  it('should list every moved entry with old and new dates for a valid Monday', async () => {
    await setup();

    pick(new Date(2027, 5, 7));

    const items = (fixture.nativeElement as HTMLElement).querySelectorAll('.moved li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Jun 7, 2027');
    expect(items[0].textContent).toContain('Jun 14, 2027');
    expect(items[1].textContent).toContain('Jun 28, 2027');
    expect(confirmButton().disabled).toBe(false);
  });

  it('should close with the re-anchored opening Monday when confirmed', async () => {
    await setup();
    pick(new Date(2027, 5, 7));

    confirmButton().click();

    expect(closeSpy).toHaveBeenCalledWith('2027-06-07');
  });

  it('should show the translated refusal and keep confirm disabled when the preview is refused', async () => {
    await setup();

    pick(new Date(2026, 10, 23));

    expect(fixture.nativeElement.textContent).toContain('Opening already passed');
    expect(confirmButton().disabled).toBe(true);
    confirmButton().click();
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('should prefer the precise reason message when the preview carries one', async () => {
    await setup({ ...BASE_DATA, today: '2027-06-01' });

    pick(new Date(2027, 5, 14));
    expect(confirmButton().disabled).toBe(false);

    pick(new Date(2027, 4, 24));

    expect(fixture.nativeElement.textContent).toContain('Can only move later');
    expect(confirmButton().disabled).toBe(true);
  });

  it('should show the events impact when the MG is already open on servers', async () => {
    await setup({ ...BASE_DATA, servers: 2, registrations: 9 });

    expect(fixture.nativeElement.textContent).toContain('2 server(s), 9 registration(s)');
  });

  it('should only accept Mondays through the picker filter', async () => {
    await setup();

    const filter = component['mondayFilter'];

    expect(filter(new Date(2027, 5, 7))).toBe(true);
    expect(filter(new Date(2027, 5, 8))).toBe(false);
    expect(filter(null)).toBe(false);
  });
});
