import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeaderComponent } from '../app-header/app-header.component';
import { AppFooterComponent } from '../app-footer/app-footer.component';
import { PwaInstallBannerComponent } from '@app/shared/components/pwa-install-banner/pwa-install-banner.component';

@Component({
  selector: 'app-main-layout',
  imports: [RouterOutlet, AppHeaderComponent, AppFooterComponent, PwaInstallBannerComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent {}
