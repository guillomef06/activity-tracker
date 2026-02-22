import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { ReleaseNotesService } from '@app/core/services/release-notes.service';
import { LanguageService } from '@app/core/services/language.service';

@Component({
  selector: 'app-release-notes-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule, TranslateModule],
  templateUrl: './release-notes-dialog.component.html',
  styleUrl: './release-notes-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReleaseNotesDialogComponent {
  protected readonly releaseNotesService = inject(ReleaseNotesService);
  protected readonly languageService = inject(LanguageService);
  private readonly dialogRef = inject(MatDialogRef<ReleaseNotesDialogComponent>);

  protected readonly TYPE_ICONS: Record<string, string> = {
    feature: 'new_releases',
    fix: 'build',
    improvement: 'trending_up',
  };

  protected close(): void {
    this.dialogRef.close();
  }

  protected markAsSeenAndClose(): void {
    this.releaseNotesService.markAsSeen();
    this.dialogRef.close();
  }
}
