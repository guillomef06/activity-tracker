import { Injectable, inject } from '@angular/core';
import { MatSnackBar, MatSnackBarRef, TextOnlySnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';

@Injectable({
  providedIn: 'root',
})
export class SnackbarService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly translate = inject(TranslateService);

  success(message: string, duration = 3000): void {
    this.snackBar.open(message, this.translate.instant('common.close'), {
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: ['success-snackbar'],
    });
  }

  error(message: string, duration = 3000): void {
    this.snackBar.open(message, this.translate.instant('common.close'), {
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: ['error-snackbar'],
    });
  }

  action(message: string, actionLabel: string, callback: () => void, duration = 0): MatSnackBarRef<TextOnlySnackBar> {
    const ref = this.snackBar.open(message, actionLabel, {
      duration,
      horizontalPosition: 'end',
      verticalPosition: 'top',
      panelClass: ['info-snackbar'],
    });
    ref.onAction().subscribe(() => callback());
    return ref;
  }
}
