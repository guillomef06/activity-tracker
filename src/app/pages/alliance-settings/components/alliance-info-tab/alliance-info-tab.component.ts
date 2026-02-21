import { Component, inject, input, output, signal, effect, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import { SnackbarService } from '@app/core/services';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { AllianceService } from '@app/core/services/alliance.service';
import { createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';
import type { Alliance } from '@app/shared/models';

@Component({
  selector: 'app-alliance-info-tab',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    TranslateModule,
    LoadingButtonComponent,
  ],
  templateUrl: './alliance-info-tab.component.html',
  styleUrl: './alliance-info-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AllianceInfoTabComponent {
  private readonly allianceService = inject(AllianceService);
  private readonly fb = inject(FormBuilder);
  private readonly snackbarService = inject(SnackbarService);
  private readonly translate = inject(TranslateService);
  private readonly destroyRef = inject(DestroyRef);

  // Inputs
  alliance = input.required<Alliance | null>();
  membersCount = input.required<number>();
  invitationsCount = input.required<number>();

  // Outputs
  allianceUpdated = output<void>();

  // State
  protected readonly isLoading = signal(false);

  protected readonly allianceForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    tag: ['', [Validators.minLength(3), Validators.maxLength(3)]],
  });

  // Error signals for validation
  protected readonly nameError = createFieldErrorSignal(this.allianceForm, 'name', this.destroyRef);
  protected readonly tagError = createFieldErrorSignal(this.allianceForm, 'tag', this.destroyRef);

  constructor() {
    // Update form when alliance changes
    effect(() => {
      const currentAlliance = this.alliance();
      if (currentAlliance) {
        this.allianceForm.patchValue(
          { name: currentAlliance.name, tag: currentAlliance.tag ?? '' },
          { emitEvent: false }
        );
      }
    });
  }

  protected async updateAlliance(): Promise<void> {
    if (this.allianceForm.invalid) {
      return;
    }

    this.isLoading.set(true);
    try {
      const { name, tag } = this.allianceForm.value;
      const { error } = await this.allianceService.updateAlliance({
        name,
        tag: tag || null,
      });

      if (error) {
        throw error;
      }

      this.snackbarService.success(this.translate.instant('alliance.settings.nameUpdated'));
      this.allianceUpdated.emit();
    } catch (error) {
      console.error('Error updating alliance:', error);
      this.snackbarService.error(this.translate.instant('alliance.settings.nameUpdateFailed'));
    } finally {
      this.isLoading.set(false);
    }
  }
}
