import { Component, ChangeDetectionStrategy, input, signal } from '@angular/core';
import { animate, style, transition, trigger } from '@angular/animations';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

const DISMISSED_STORAGE_KEY = 'discord_invite_banner_dismissed';

@Component({
  selector: 'app-discord-invite-banner',
  imports: [MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './discord-invite-banner.component.html',
  styleUrl: './discord-invite-banner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  animations: [
    trigger('bannerSlide', [
      transition(':enter', [
        style({ opacity: 0, transform: 'translateY(-8px)' }),
        animate('200ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ]),
      transition(':leave', [animate('150ms ease-in', style({ opacity: 0, transform: 'translateY(-8px)' }))]),
    ]),
  ],
})
export class DiscordInviteBannerComponent {
  readonly inviteUrl = input<string | null>(null);

  protected readonly isDismissed = signal<boolean>(localStorage.getItem(DISMISSED_STORAGE_KEY) === 'true');

  protected dismiss(): void {
    localStorage.setItem(DISMISSED_STORAGE_KEY, 'true');
    this.isDismissed.set(true);
  }
}
