import { Component, inject, input, output, signal, effect, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslateModule } from '@ngx-translate/core';
import { AllianceService } from '@app/core/services/alliance.service';
import type { Alliance } from '@app/shared/models';

@Component({
  selector: 'app-alliance-info-tab',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    TranslateModule,
  ],
  templateUrl: './alliance-info-tab.component.html',
  styleUrl: './alliance-info-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AllianceInfoTabComponent {
  private readonly allianceService = inject(AllianceService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);

  // Inputs
  alliance = input.required<Alliance | null>();
  membersCount = input.required<number>();
  invitationsCount = input.required<number>();

  // Outputs
  allianceUpdated = output<void>();

  // State
  protected readonly isLoading = signal(false);

  protected readonly allianceNameForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
  });

  constructor() {
    // Update form when alliance changes
    effect(() => {
      const currentAlliance = this.alliance();
      if (currentAlliance) {
        this.allianceNameForm.patchValue({ name: currentAlliance.name }, { emitEvent: false });
      }
    });
  }

  protected async updateAllianceName(): Promise<void> {
    if (this.allianceNameForm.invalid) {
      return;
    }

    this.isLoading.set(true);
    try {
      const { name } = this.allianceNameForm.value;
      const success = await this.allianceService.updateAllianceName(name);
      
      if (success) {
        this.snackBar.open('Alliance name updated successfully!', 'Close', {
          duration: 3000,
        });
        this.allianceUpdated.emit();
      } else {
        throw new Error('Update failed');
      }
    } catch (error) {
      console.error('Error updating alliance name:', error);
      this.snackBar.open('Failed to update alliance name', 'Close', { duration: 3000 });
    } finally {
      this.isLoading.set(false);
    }
  }
}
