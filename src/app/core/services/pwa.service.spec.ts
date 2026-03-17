import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Subject } from 'rxjs';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { PwaService } from './pwa.service';
import { SnackbarService } from './snackbar.service';
import { StorageService } from './storage.service';
import { TranslateModule } from '@ngx-translate/core';

describe('PwaService', () => {
  let service: PwaService;
  let versionUpdates$: Subject<VersionReadyEvent>;
  let snackbarActionSpy: ReturnType<typeof vi.fn>;

  const createService = (swEnabled = false) => {
    versionUpdates$ = new Subject<VersionReadyEvent>();
    snackbarActionSpy = vi.fn().mockReturnValue({ onAction: () => new Subject() });

    const swUpdateMock = {
      isEnabled: swEnabled,
      versionUpdates: versionUpdates$.asObservable(),
    };

    const snackbarMock = {
      action: snackbarActionSpy,
    };

    TestBed.configureTestingModule({
      imports: [TranslateModule.forRoot()],
      providers: [
        PwaService,
        StorageService,
        { provide: SwUpdate, useValue: swUpdateMock },
        { provide: SnackbarService, useValue: snackbarMock },
      ],
    });

    service = TestBed.inject(PwaService);
  };

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  describe('isOnline()', () => {
    it('should initialize from navigator.onLine', () => {
      createService();
      // navigator.onLine is true in jsdom by default
      expect(service.isOnline()).toBe(navigator.onLine);
    });

    it('should set isOnline to false on offline event', () => {
      createService();
      window.dispatchEvent(new Event('offline'));
      expect(service.isOnline()).toBe(false);
    });

    it('should set isOnline to true on online event', () => {
      createService();
      window.dispatchEvent(new Event('offline'));
      window.dispatchEvent(new Event('online'));
      expect(service.isOnline()).toBe(true);
    });
  });

  describe('canInstall()', () => {
    it('should be false initially', () => {
      createService();
      expect(service.canInstall()).toBe(false);
    });

    it('should become true when beforeinstallprompt fires', () => {
      createService();
      const promptEvent = Object.assign(new Event('beforeinstallprompt'), {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(promptEvent);
      expect(service.canInstall()).toBe(true);
    });

    it('should become false when appinstalled fires', () => {
      createService();
      const promptEvent = Object.assign(new Event('beforeinstallprompt'), {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(promptEvent);
      expect(service.canInstall()).toBe(true);

      window.dispatchEvent(new Event('appinstalled'));
      expect(service.canInstall()).toBe(false);
    });
  });

  describe('SwUpdate version updates', () => {
    it('should not subscribe to versionUpdates when swUpdate.isEnabled is false', () => {
      createService(false);
      versionUpdates$.next({
        type: 'VERSION_READY',
        currentVersion: { hash: '1' },
        latestVersion: { hash: '2' },
      } as VersionReadyEvent);
      expect(snackbarActionSpy).not.toHaveBeenCalled();
    });

    it('should call snackbarService.action on VERSION_READY when swUpdate.isEnabled is true', () => {
      createService(true);
      versionUpdates$.next({
        type: 'VERSION_READY',
        currentVersion: { hash: '1' },
        latestVersion: { hash: '2' },
      } as VersionReadyEvent);
      expect(snackbarActionSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('promptInstall()', () => {
    it('should not throw when called without a deferred prompt', async () => {
      createService();
      await expect(service.promptInstall()).resolves.toBeUndefined();
    });
  });

  describe('dismissBanner()', () => {
    it('should set showInstallBanner to false after dismiss', () => {
      createService();
      // Force showInstallBanner to be potentially visible by simulating beforeinstallprompt
      const promptEvent = Object.assign(new Event('beforeinstallprompt'), {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(promptEvent);

      service.dismissBanner();
      expect(service.showInstallBanner()).toBe(false);
    });

    it('should store timestamp in localStorage on dismiss', () => {
      createService();
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');

      service.dismissBanner();

      expect(setItemSpy).toHaveBeenCalledWith('pwa-install-dismissed-at', expect.stringMatching(/^\d+$/));
      setItemSpy.mockRestore();
    });
  });

  describe('showInstallBanner()', () => {
    it('should be false when banner was dismissed less than 24h ago', () => {
      const recentTimestamp = JSON.stringify(Date.now() - 1000); // 1 second ago
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(recentTimestamp);

      createService();
      const promptEvent = Object.assign(new Event('beforeinstallprompt'), {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(promptEvent);

      expect(service.showInstallBanner()).toBe(false);
      vi.restoreAllMocks();
    });

    it('should be true when banner was dismissed more than 24h ago', () => {
      const oldTimestamp = JSON.stringify(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(oldTimestamp);

      createService();
      const promptEvent = Object.assign(new Event('beforeinstallprompt'), {
        prompt: vi.fn().mockResolvedValue(undefined),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(promptEvent);

      expect(service.showInstallBanner()).toBe(true);
      vi.restoreAllMocks();
    });
  });
});
