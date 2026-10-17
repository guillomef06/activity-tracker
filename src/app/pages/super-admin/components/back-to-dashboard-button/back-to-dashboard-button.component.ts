import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';

/**
 * Back arrow shown in the header of every super-admin sub-page.
 * Targets the dashboard through a router link (not history.back()) so the
 * destination is the same however the user arrived on the page.
 */
@Component({
  selector: 'app-back-to-dashboard-button',
  imports: [RouterLink, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './back-to-dashboard-button.component.html',
  styleUrl: './back-to-dashboard-button.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BackToDashboardButtonComponent {
  protected readonly dashboardRoute = '/app/super-admin/dashboard';
}
