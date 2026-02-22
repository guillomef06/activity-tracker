import { Component, ChangeDetectionStrategy, inject, signal, computed, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { PwaService } from '@app/core/services';
import { StorageService } from '@app/core/services';

const DISMISS_KEY = 'pwa-install-dismissed';

@Component({
  selector: 'app-pwa-install-banner',
  imports: [MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './pwa-install-banner.component.html',
  styleUrl: './pwa-install-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PwaInstallBannerComponent implements OnInit {
  protected readonly pwaService = inject(PwaService);
  private readonly storageService = inject(StorageService);

  private readonly _dismissed = signal<boolean>(false);

  protected readonly isVisible = computed(() => this.pwaService.canInstall() && !this._dismissed());

  ngOnInit(): void {
    const dismissed = this.storageService.get<boolean>(DISMISS_KEY);
    if (dismissed) {
      this._dismissed.set(true);
    }
  }

  protected dismiss(): void {
    this._dismissed.set(true);
    this.storageService.set(DISMISS_KEY, true);
  }

  protected install(): void {
    this.pwaService.promptInstall();
  }
}
