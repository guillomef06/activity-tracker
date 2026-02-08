import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { TranslateModule } from '@ngx-translate/core';
import type { UserProfile } from '@app/shared/models';

@Component({
  selector: 'app-members-tab',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatChipsModule,
    TranslateModule,
  ],
  templateUrl: './members-tab.component.html',
  styleUrl: './members-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MembersTabComponent {
  // Inputs
  members = input.required<UserProfile[]>();
  isLoading = input.required<boolean>();

  // Table configuration
  protected readonly memberColumns: string[] = ['displayName', 'username', 'role', 'createdAt'];

  protected formatDate(date: string): string {
    return new Date(date).toLocaleDateString();
  }

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
