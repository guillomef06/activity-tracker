import { Injectable, inject, signal, computed } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { fromEvent, merge } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { SnackbarService } from './snackbar.service';
import { StorageService } from './storage.service';
import { TranslateService } from '@ngx-translate/core';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Phase 2B (Async Signals, see SPEC_ANGULAR_22_MIGRATION.md #4): this service exposes
// browser event streams (online/offline, install prompt, SW updates), not fetched data,
// so `resource()`/`rxResource()` don't fit — they target re-fetchable data sources, not
// one-shot DOM/browser events. `online`/`offline` are pure state and become a `toSignal()`.
// `beforeinstallprompt`/`appinstalled`/`versionUpdates` carry imperative side effects
// beyond a signal `set()` (see inline comments below) and stay as `.subscribe()`.
@Injectable({
  providedIn: 'root',
})
export class PwaService {
  private static readonly DISMISS_KEY = 'pwa-install-dismissed-at';
  private static readonly DISMISS_DURATION_MS = 24 * 60 * 60 * 1000;

  private readonly swUpdate = inject(SwUpdate);
  private readonly snackbarService = inject(SnackbarService);
  private readonly storageService = inject(StorageService);
  private readonly translate = inject(TranslateService);

  private readonly _canInstall = signal<boolean>(false);
  private readonly _bannerDismissed = signal<boolean>(this.isBannerDismissed());
  private _deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

  readonly isOnline = toSignal(
    merge(fromEvent(window, 'online').pipe(map(() => true)), fromEvent(window, 'offline').pipe(map(() => false))),
    { initialValue: navigator.onLine }
  );
  readonly canInstall = this._canInstall.asReadonly();
  readonly isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
  private readonly isStandalone =
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) ||
    (navigator as { standalone?: boolean }).standalone === true;

  readonly showInstallBanner = computed(
    () => !this.isStandalone && !this._bannerDismissed() && (this.isIos || this._canInstall())
  );

  constructor() {
    // Not a toSignal candidate: beyond setting `_canInstall`, this stores the raw
    // browser event (`_deferredInstallPrompt`, a plain field) for later use in
    // `promptInstall()` and calls `preventDefault()` — an imperative side effect.
    fromEvent<BeforeInstallPromptEvent>(window, 'beforeinstallprompt')
      .pipe(takeUntilDestroyed())
      .subscribe(event => {
        event.preventDefault();
        this._deferredInstallPrompt = event;
        this._canInstall.set(true);
      });

    // Not a toSignal candidate: clears the imperative `_deferredInstallPrompt` field
    // in addition to the signal set, so it's a side effect, not pure state.
    fromEvent(window, 'appinstalled')
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this._deferredInstallPrompt = null;
        this._canInstall.set(false);
      });

    // Not a toSignal candidate: this drives a one-shot snackbar side effect
    // (with a reload callback), not a piece of exposed state.
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

  dismissBanner(): void {
    this.storageService.set(PwaService.DISMISS_KEY, Date.now());
    this._bannerDismissed.set(true);
  }

  private isBannerDismissed(): boolean {
    const stored = this.storageService.get<number>(PwaService.DISMISS_KEY);
    if (!stored) return false;
    return Date.now() - stored < PwaService.DISMISS_DURATION_MS;
  }
}
