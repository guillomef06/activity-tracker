import { Component, ChangeDetectionStrategy } from '@angular/core';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-footer',
  imports: [],
  templateUrl: './app-footer.component.html',
  styleUrl: './app-footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppFooterComponent {
  protected readonly version = environment.appVersion;
  protected readonly envName = environment.production ? 'LIVE' : 'DEV';
  protected readonly envColor = environment.production ? '#4caf50' : '#ff9800';
  protected readonly currentYear = new Date().getFullYear();
}
