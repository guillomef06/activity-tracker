import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { TranslateModule } from '@ngx-translate/core';
import { AuthBackgroundComponent } from '@app/shared/components/auth-background/auth-background.component';

interface Step {
  icon: string;
  titleKey: string;
  descKey: string;
}

interface Benefit {
  icon: string;
  titleKey: string;
  descKey: string;
}

@Component({
  selector: 'app-landing',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatCardModule, TranslateModule, AuthBackgroundComponent],
  templateUrl: './landing.page.html',
  styleUrl: './landing.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPage {
  protected readonly steps: Step[] = [
    { icon: 'edit_note', titleKey: 'landing.steps.step1.title', descKey: 'landing.steps.step1.description' },
    { icon: 'insights', titleKey: 'landing.steps.step2.title', descKey: 'landing.steps.step2.description' },
    { icon: 'military_tech', titleKey: 'landing.steps.step3.title', descKey: 'landing.steps.step3.description' },
  ];

  protected readonly benefits: Benefit[] = [
    { icon: 'groups', titleKey: 'landing.benefits.benefit1.title', descKey: 'landing.benefits.benefit1.description' },
    { icon: 'savings', titleKey: 'landing.benefits.benefit2.title', descKey: 'landing.benefits.benefit2.description' },
    {
      icon: 'emoji_events',
      titleKey: 'landing.benefits.benefit3.title',
      descKey: 'landing.benefits.benefit3.description',
    },
  ];
}
