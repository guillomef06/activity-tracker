import { Component, inject, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { ConfirmDialogComponent } from '@app/shared/components/confirm-dialog/confirm-dialog.component';
import { PointRulesService } from '@app/core/services/point-rules.service';
import type { ActivityPointRule } from '@app/shared/models';
import { APP_CONSTANTS } from '@app/shared/constants/constants';

@Component({
  selector: 'app-point-rules-tab',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatTooltipModule,
    MatSnackBarModule,
    MatDialogModule,
    TranslateModule,
  ],
  templateUrl: './point-rules-tab.component.html',
  styleUrl: './point-rules-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PointRulesTabComponent {
  private readonly pointRulesService = inject(PointRulesService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  private readonly translate = inject(TranslateService);

  // Inputs
  pointRules = input.required<ActivityPointRule[]>();
  isLoading = input.required<boolean>();

  // Outputs
  ruleCreated = output<void>();
  ruleDeleted = output<void>();

  // State
  protected readonly isSubmitting = signal(false);
  protected readonly activityTypes = APP_CONSTANTS.ACTIVITY_TYPES;
  protected readonly pointRuleColumns: string[] = ['activityType', 'positionRange', 'points', 'actions'];

  protected readonly pointRuleForm: FormGroup = this.fb.group({
    activity_type: ['', Validators.required],
    position_min: [1, [Validators.required, Validators.min(1)]],
    position_max: [1, [Validators.required, Validators.min(1)]],
    points: [10, [Validators.required, Validators.min(0)]],
  });

  protected async createPointRule(): Promise<void> {
    if (this.pointRuleForm.invalid) {
      return;
    }

    const formValue = this.pointRuleForm.value;
    
    // Validate position range
    if (formValue.position_min > formValue.position_max) {
      this.snackBar.open('Minimum position cannot be greater than maximum position', 'Close', { duration: 3000 });
      return;
    }

    this.isSubmitting.set(true);
    try {
      const { error } = await this.pointRulesService.createRule({
        activity_type: formValue.activity_type,
        position_min: formValue.position_min,
        position_max: formValue.position_max,
        points: formValue.points,
      });
      
      if (error) {
        throw error;
      }

      this.snackBar.open('Point rule created successfully', 'Close', { duration: 3000 });
      
      // Reset form
      this.pointRuleForm.reset({
        activity_type: '',
        position_min: 1,
        position_max: 1,
        points: 10,
      });
      
      // Notify parent to reload
      this.ruleCreated.emit();
    } catch (error) {
      console.error('Error creating point rule:', error);
      this.snackBar.open(
        error instanceof Error ? error.message : 'Failed to create point rule',
        'Close',
        { duration: 5000 }
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected async deletePointRule(id: string): Promise<void> {
    const confirmed = await this.dialog.open(ConfirmDialogComponent, {
      data: {
        message: this.translate.instant('alliance.settings.pointRules.deleteConfirm'),
        confirmColor: 'warn'
      }
    }).afterClosed().toPromise();

    if (!confirmed) {
      return;
    }

    this.isSubmitting.set(true);
    try {
      const { error } = await this.pointRulesService.deleteRule(id);
      
      if (error) {
        throw error;
      }

      this.snackBar.open('Point rule deleted successfully', 'Close', { duration: 3000 });
      
      // Notify parent to reload
      this.ruleDeleted.emit();
    } catch (error) {
      console.error('Error deleting point rule:', error);
      this.snackBar.open('Failed to delete point rule', 'Close', { duration: 3000 });
    } finally {
      this.isSubmitting.set(false);
    }
  }

  protected getActivityTypeLabel(value: string): string {
    const activityType = this.activityTypes.find(type => type.value === value);
    return activityType?.labelKey || value;
  }

  protected formatPositionRange(min: number, max: number): string {
    return min === max ? `${min}` : `${min}-${max}`;
  }
}
