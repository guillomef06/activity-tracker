import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal } from '@angular/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { PwaInstallBannerComponent } from './pwa-install-banner.component';
import { PwaService } from '@app/core/services';
import { StorageService } from '@app/core/services';

describe('PwaInstallBannerComponent', () => {
  let component: PwaInstallBannerComponent;
  let fixture: ComponentFixture<PwaInstallBannerComponent>;
  let canInstall: ReturnType<typeof signal<boolean>>;
  let promptInstallSpy: ReturnType<typeof vi.fn>;
  let storageGetSpy: ReturnType<typeof vi.fn>;
  let storageSetSpy: ReturnType<typeof vi.fn>;

  const createComponent = async (canInstallValue = false, storedDismissed: boolean | null = null) => {
    canInstall = signal(canInstallValue);
    promptInstallSpy = vi.fn().mockResolvedValue(undefined);
    storageGetSpy = vi.fn().mockReturnValue(storedDismissed);
    storageSetSpy = vi.fn();

    const pwaServiceMock = {
      canInstall: canInstall.asReadonly(),
      promptInstall: promptInstallSpy,
    };

    const storageServiceMock = {
      get: storageGetSpy,
      set: storageSetSpy,
    };

    await TestBed.configureTestingModule({
      imports: [PwaInstallBannerComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        { provide: PwaService, useValue: pwaServiceMock },
        { provide: StorageService, useValue: storageServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PwaInstallBannerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('should create', async () => {
    await createComponent();
    expect(component).toBeTruthy();
  });

  it('should not show banner when canInstall is false', async () => {
    await createComponent(false);
    const banner = fixture.nativeElement.querySelector('.pwa-install-banner');
    expect(banner).toBeNull();
  });

  it('should show banner when canInstall is true and not dismissed', async () => {
    await createComponent(true, null);
    const banner = fixture.nativeElement.querySelector('.pwa-install-banner');
    expect(banner).not.toBeNull();
  });

  it('should not show banner when dismissed is persisted in storage', async () => {
    await createComponent(true, true);
    const banner = fixture.nativeElement.querySelector('.pwa-install-banner');
    expect(banner).toBeNull();
  });

  it('should call pwaService.promptInstall when install button clicked', async () => {
    await createComponent(true, null);
    const installButton = fixture.nativeElement.querySelector('button[mat-flat-button]');
    installButton?.click();
    expect(promptInstallSpy).toHaveBeenCalledTimes(1);
  });

  it('should dismiss banner and persist to storage when dismiss clicked', async () => {
    await createComponent(true, null);
    const dismissButton = fixture.nativeElement.querySelector('button[mat-icon-button]');
    dismissButton?.click();
    fixture.detectChanges();

    expect(storageSetSpy).toHaveBeenCalledWith('pwa-install-dismissed', true);
    const banner = fixture.nativeElement.querySelector('.pwa-install-banner');
    expect(banner).toBeNull();
  });
});
