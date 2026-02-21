import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { TranslateModule } from '@ngx-translate/core';
import { LocalDatePipe } from '@app/shared/pipes/local-date.pipe';
import type { UserProfile } from '@app/shared/models';

@Component({
  selector: 'app-members-tab',
  imports: [CommonModule, MatCardModule, MatTableModule, MatIconModule, MatChipsModule, TranslateModule, LocalDatePipe],
  templateUrl: './members-tab.component.html',
  styleUrl: './members-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MembersTabComponent {
  // Inputs
  members = input.required<UserProfile[]>();
  isLoading = input.required<boolean>();

  // Table configuration
  protected readonly memberColumns: string[] = ['displayName', 'role', 'createdAt'];

  protected getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'admin':
        return 'role-admin';
      case 'member':
        return 'role-member';
      default:
        return '';
    }
  }
}
