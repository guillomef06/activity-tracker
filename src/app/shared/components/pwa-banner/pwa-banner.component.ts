import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { PwaService } from '@app/core/services/pwa.service';

@Component({
  selector: 'app-pwa-banner',
  imports: [MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './pwa-banner.component.html',
  styleUrl: './pwa-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaBannerComponent {
  protected readonly pwaService = inject(PwaService);

  protected dismiss(): void {
    this.pwaService.dismissBanner();
  }

  protected install(): void {
    this.pwaService.promptInstall();
  }
}
