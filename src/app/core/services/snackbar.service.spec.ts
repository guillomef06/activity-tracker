import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Subject } from 'rxjs';
import { provideZonelessChangeDetection } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateModule } from '@ngx-translate/core';
import { SnackbarService } from './snackbar.service';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('SnackbarService', () => {
  let service: SnackbarService;
  let actionSubject$: Subject<void>;
  let snackBarOpenSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    actionSubject$ = new Subject<void>();
    snackBarOpenSpy = vi.fn().mockReturnValue({
      onAction: () => actionSubject$.asObservable(),
    });

    TestBed.configureTestingModule({
      imports: [NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        provideZonelessChangeDetection(),
        SnackbarService,
        {
          provide: MatSnackBar,
          useValue: { open: snackBarOpenSpy },
        },
      ],
    });

    service = TestBed.inject(SnackbarService);
  });

  describe('action()', () => {
    it('should open snackbar with correct message and action label', () => {
      const callback = vi.fn();
      service.action('Update available', 'Reload', callback);

      expect(snackBarOpenSpy).toHaveBeenCalledWith(
        'Update available',
        'Reload',
        expect.objectContaining({
          duration: 0,
          panelClass: ['info-snackbar'],
        })
      );
    });

    it('should call callback when user clicks the action', () => {
      const callback = vi.fn();
      service.action('Update available', 'Reload', callback);

      actionSubject$.next();

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should use duration=0 by default', () => {
      service.action('msg', 'action', vi.fn());
      expect(snackBarOpenSpy).toHaveBeenCalledWith('msg', 'action', expect.objectContaining({ duration: 0 }));
    });

    it('should accept custom duration', () => {
      service.action('msg', 'action', vi.fn(), 5000);
      expect(snackBarOpenSpy).toHaveBeenCalledWith('msg', 'action', expect.objectContaining({ duration: 5000 }));
    });
  });
});
