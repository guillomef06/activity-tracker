import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { vi } from 'vitest';

import type { CalendarConfirmDialogData } from '../../calendar-page.models';
import { CalendarConfirmDialogComponent } from './calendar-confirm-dialog.component';

const TRANSLATIONS = {
  superAdmin: {
    calendar: {
      dialog: {
        cancelTitle: 'Cancel this MG',
        cancelNoEvent: 'No server has opened this MG',
        cancelWithEvents: '{{ servers }} server(s), {{ registrations }} registration(s)',
        cancelNobodyNotified: 'Nobody is notified',
        deleteTitle: 'Delete this entry',
        deleteBody: 'Permanently deleted',
        confirm: 'Confirm',
        back: 'Back',
      },
    },
  },
};

describe('CalendarConfirmDialogComponent', () => {
  let fixture: ComponentFixture<CalendarConfirmDialogComponent>;
  const closeSpy = vi.fn();

  const render = async (data: CalendarConfirmDialogData): Promise<HTMLElement> => {
    await TestBed.configureTestingModule({
      imports: [CalendarConfirmDialogComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close: closeSpy } },
      ],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', TRANSLATIONS);
    translate.use('en');
    fixture = TestBed.createComponent(CalendarConfirmDialogComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  const buttons = (el: HTMLElement): HTMLButtonElement[] => Array.from(el.querySelectorAll('button'));

  beforeEach(() => {
    closeSpy.mockReset();
  });

  it('should show the short message when cancelling an MG without generated event', async () => {
    const el = await render({ variant: 'cancel', label: '2027-06-07', servers: 0, registrations: 0 });

    expect(el.textContent).toContain('Cancel this MG');
    expect(el.textContent).toContain('2027-06-07');
    expect(el.textContent).toContain('No server has opened this MG');
    expect(el.textContent).not.toContain('Nobody is notified');
  });

  it('should show counts and the nobody-notified notice when events exist', async () => {
    const el = await render({ variant: 'cancel', label: '2027-06-07', servers: 3, registrations: 12 });

    expect(el.textContent).toContain('3 server(s), 12 registration(s)');
    expect(el.textContent).toContain('Nobody is notified');
  });

  it('should show a simple body for the delete variant', async () => {
    const el = await render({ variant: 'delete', label: 'PvP night', servers: 0, registrations: 0 });

    expect(el.textContent).toContain('Delete this entry');
    expect(el.textContent).toContain('Permanently deleted');
    expect(el.textContent).not.toContain('Nobody is notified');
  });

  it('should close with true when confirmed', async () => {
    const el = await render({ variant: 'delete', label: 'x', servers: 0, registrations: 0 });

    buttons(el)[1].click();

    expect(closeSpy).toHaveBeenCalledWith(true);
  });

  it('should expose a back button that closes through mat-dialog-close', async () => {
    const el = await render({ variant: 'delete', label: 'x', servers: 0, registrations: 0 });

    const back = buttons(el)[0];

    expect(back.textContent?.trim()).toBe('Back');
    expect(back.hasAttribute('mat-dialog-close')).toBe(true);
  });
});
