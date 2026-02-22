import { Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { fromEvent } from 'rxjs';
import { filter } from 'rxjs/operators';
import { SnackbarService } from './snackbar.service';
import { TranslateService } from '@ngx-translate/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

@Injectable({
  providedIn: 'root',
})
export class PwaService {
  private readonly swUpdate = inject(SwUpdate);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translate = inject(TranslateService);

  private readonly _isOnline = signal<boolean>(navigator.onLine);
  private readonly _canInstall = signal<boolean>(false);
  private _deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

  readonly isOnline = this._isOnline.asReadonly();
  readonly canInstall = this._canInstall.asReadonly();

  constructor() {
    fromEvent(window, 'online')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this._isOnline.set(true));

    fromEvent(window, 'offline')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this._isOnline.set(false));

    fromEvent<BeforeInstallPromptEvent>(window, 'beforeinstallprompt')
      .pipe(takeUntilDestroyed())
      .subscribe(event => {
        event.preventDefault();
        this._deferredInstallPrompt = event;
        this._canInstall.set(true);
      });

    fromEvent(window, 'appinstalled')
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this._deferredInstallPrompt = null;
        this._canInstall.set(false);
      });

    if (this.swUpdate.isEnabled) {
      this.swUpdate.versionUpdates
        .pipe(
          filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'),
          takeUntilDestroyed()
        )
        .subscribe(() => {
          this.snackbarService.action(
            this.translate.instant('pwa.updateAvailable'),
            this.translate.instant('pwa.reload'),
            () => window.location.reload()
          );
        });
    }
  }

  async promptInstall(): Promise<void> {
    if (!this._deferredInstallPrompt) return;
    await this._deferredInstallPrompt.prompt();
    this._deferredInstallPrompt = null;
    this._canInstall.set(false);
  }
}
