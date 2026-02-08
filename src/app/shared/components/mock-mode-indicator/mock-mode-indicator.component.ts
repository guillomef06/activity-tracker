import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { environment } from '../../../../environments/environment';

/**
 * Mock Mode Indicator
 * Displays a chip when the app is running in mock data mode
 */
@Component({
  selector: 'app-mock-mode-indicator',
  standalone: true,
  imports: [CommonModule, MatChipsModule, MatIconModule, MatTooltipModule],
  templateUrl: './mock-mode-indicator.component.html',
  styleUrl: './mock-mode-indicator.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MockModeIndicatorComponent {
  protected readonly showIndicator = environment.enableMockData === true;
  protected readonly tooltipText = 
    'Mode Mock - Données de test\n' +
    'Voir MOCK_USERS_GUIDE.md pour les identifiants';
}
