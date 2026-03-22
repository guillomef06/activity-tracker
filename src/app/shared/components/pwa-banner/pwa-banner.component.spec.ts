import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal, provideZonelessChangeDetection } from '@angular/core';
import { PwaBannerComponent } from './pwa-banner.component';
import { PwaService } from '@app/core/services/pwa.service';
import { TranslateModule } from '@ngx-translate/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

const makePwaServiceMock = (overrides: Partial<{ showInstallBanner: boolean; isIos: boolean }> = {}) => ({
  showInstallBanner: signal(overrides.showInstallBanner ?? false),
  isIos: overrides.isIos ?? false,
  dismissBanner: vi.fn(),
  promptInstall: vi.fn().mockResolvedValue(undefined),
});

describe('PwaBannerComponent', () => {
  let fixture: ComponentFixture<PwaBannerComponent>;
  let pwaServiceMock: ReturnType<typeof makePwaServiceMock>;

  const setup = async (pwaOverrides: Parameters<typeof makePwaServiceMock>[0] = {}) => {
    pwaServiceMock = makePwaServiceMock(pwaOverrides);

    await TestBed.configureTestingModule({
      imports: [PwaBannerComponent, TranslateModule.forRoot(), NoopAnimationsModule],
      providers: [{ provide: PwaService, useValue: pwaServiceMock }, provideZonelessChangeDetection()],
    }).compileComponents();

    fixture = TestBed.createComponent(PwaBannerComponent);
    fixture.detectChanges();
  };

  it('should not render when showInstallBanner is false', async () => {
    await setup({ showInstallBanner: false });
    expect(fixture.nativeElement.querySelector('.pwa-banner')).toBeNull();
  });

  it('should render when showInstallBanner is true', async () => {
    await setup({ showInstallBanner: true });
    expect(fixture.nativeElement.querySelector('.pwa-banner')).not.toBeNull();
  });

  it('should show install button on non-iOS', async () => {
    await setup({ showInstallBanner: true, isIos: false });
    expect(fixture.nativeElement.querySelector('.install-btn')).not.toBeNull();
  });

  it('should not show install button on iOS', async () => {
    await setup({ showInstallBanner: true, isIos: true });
    expect(fixture.nativeElement.querySelector('.install-btn')).toBeNull();
  });

  it('should show iOS instruction on iOS', async () => {
    await setup({ showInstallBanner: true, isIos: true });
    expect(fixture.nativeElement.querySelector('.banner-instruction')).not.toBeNull();
  });

  it('should call dismissBanner when close button is clicked', async () => {
    await setup({ showInstallBanner: true });
    fixture.nativeElement.querySelector('.dismiss-btn').click();
    expect(pwaServiceMock.dismissBanner).toHaveBeenCalledOnce();
  });

  it('should call promptInstall when install button is clicked', async () => {
    await setup({ showInstallBanner: true, isIos: false });
    fixture.nativeElement.querySelector('.install-btn').click();
    expect(pwaServiceMock.promptInstall).toHaveBeenCalledOnce();
  });
});
