import { Component, inject, signal, DestroyRef, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '@app/core/services/auth.service';
import { LanguageService, type SupportedLanguage } from '@app/core/services/language.service';
import { ThemeService, type ColorScheme } from '@app/core/services/theme.service';
import { SnackbarService } from '@app/core/services/snackbar.service';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import { RECOVERY_QUESTIONS } from '@app/shared/constants/recovery-questions.constants';
import { passwordMatchValidator, createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-user-account-dialog',
  imports: [
    ReactiveFormsModule,
    MatDialogModule,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    TranslateModule,
    LoadingButtonComponent,
  ],
  templateUrl: './user-account-dialog.component.html',
  styleUrl: './user-account-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAccountDialogComponent {
  private readonly authService = inject(AuthService);
  private readonly languageService = inject(LanguageService);
  private readonly themeService = inject(ThemeService);
  private readonly snackbar = inject(SnackbarService);
  private readonly translate = inject(TranslateService);
  private readonly dialogRef = inject(MatDialogRef<UserAccountDialogComponent>);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly RECOVERY_QUESTIONS = RECOVERY_QUESTIONS;
  protected readonly availableLanguages = this.languageService.availableLanguages;
  protected readonly currentLanguage = this.languageService.currentLanguage;
  protected readonly colorSchemes = this.themeService.colorSchemes;
  protected readonly currentScheme = this.themeService.currentScheme;
  protected readonly userProfile = this.authService.userProfile;

  // Loading states per section
  protected readonly loadingDisplayName = signal(false);
  protected readonly loadingPassword = signal(false);
  protected readonly loadingRecovery = signal(false);

  // Password visibility
  protected readonly hidePassword = signal(true);
  protected readonly hideConfirmPassword = signal(true);
  protected readonly hideAnswer = signal(true);

  protected readonly displayNameForm: FormGroup = this.fb.group({
    displayName: [
      this.authService.userProfile()?.display_name ?? '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(50)],
    ],
  });

  protected readonly passwordForm: FormGroup = this.fb.group(
    {
      password: ['', [Validators.required, Validators.minLength(6), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator }
  );

  protected readonly recoveryForm: FormGroup = this.fb.group({
    questionId: [this.authService.userProfile()?.recovery_question_id ?? null, [Validators.required]],
    answer: ['', [Validators.required, Validators.minLength(2)]],
  });

  // Reactive error signals
  protected readonly displayNameError = createFieldErrorSignal(this.displayNameForm, 'displayName', this.destroyRef);
  protected readonly passwordError = createFieldErrorSignal(this.passwordForm, 'password', this.destroyRef);
  protected readonly confirmPasswordError = createFieldErrorSignal(
    this.passwordForm,
    'confirmPassword',
    this.destroyRef
  );
  protected readonly questionError = createFieldErrorSignal(this.recoveryForm, 'questionId', this.destroyRef);
  protected readonly answerError = createFieldErrorSignal(this.recoveryForm, 'answer', this.destroyRef);

  protected async onSaveDisplayName(): Promise<void> {
    if (this.displayNameForm.invalid || this.loadingDisplayName()) {
      this.displayNameForm.markAllAsTouched();
      return;
    }
    this.loadingDisplayName.set(true);
    const { error } = await this.authService.updateDisplayName(this.displayNameForm.value.displayName.trim());
    this.loadingDisplayName.set(false);

    if (error) {
      this.snackbar.error(this.translate.instant('accountSettings.displayName.error'));
    } else {
      this.snackbar.success(this.translate.instant('accountSettings.displayName.success'));
      this.displayNameForm.markAsPristine();
    }
  }

  protected async onSavePassword(): Promise<void> {
    if (this.passwordForm.invalid || this.loadingPassword()) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.loadingPassword.set(true);
    const { error } = await this.authService.updatePassword(this.passwordForm.value.password);
    this.loadingPassword.set(false);

    if (error) {
      this.snackbar.error(this.translate.instant('accountSettings.password.error'));
    } else {
      this.snackbar.success(this.translate.instant('accountSettings.password.success'));
      this.passwordForm.reset();
    }
  }

  protected async onSaveRecovery(): Promise<void> {
    if (this.recoveryForm.invalid || this.loadingRecovery()) {
      this.recoveryForm.markAllAsTouched();
      return;
    }
    this.loadingRecovery.set(true);
    const { questionId, answer } = this.recoveryForm.value;
    const { error } = await this.authService.updateRecovery(questionId, answer.trim());
    this.loadingRecovery.set(false);

    if (error) {
      this.snackbar.error(this.translate.instant('accountSettings.recovery.error'));
    } else {
      this.snackbar.success(this.translate.instant('accountSettings.recovery.success'));
      this.recoveryForm.get('answer')?.reset();
      this.recoveryForm.markAsPristine();
    }
  }

  protected async changeLanguage(lang: SupportedLanguage): Promise<void> {
    await this.languageService.setLanguage(lang);
  }

  protected async changeColorScheme(scheme: ColorScheme): Promise<void> {
    await this.themeService.setColorScheme(scheme);
  }

  protected close(): void {
    this.dialogRef.close();
  }
}
