import { Component, ChangeDetectionStrategy } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { MockModeIndicatorComponent } from '@app/shared/components/mock-mode-indicator/mock-mode-indicator.component';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [MockModeIndicatorComponent],
  templateUrl: './app-footer.component.html',
  styleUrl: './app-footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppFooterComponent {
  protected readonly version = environment.appVersion;
  protected readonly envName = environment.production ? 'LIVE' : 'DEV';
  protected readonly envColor = environment.production ? '#4caf50' : '#ff9800';
  protected readonly currentYear = new Date().getFullYear();
}
