import { Component, ChangeDetectionStrategy, input } from '@angular/core';

@Component({
  selector: 'app-auth-background',
  imports: [],
  templateUrl: './auth-background.component.html',
  styleUrl: './auth-background.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthBackgroundComponent {
  readonly layout = input<'card' | 'page'>('card');
}
