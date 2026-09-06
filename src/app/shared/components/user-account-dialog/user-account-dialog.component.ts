import { Component, inject, signal, ChangeDetectionStrategy, computed } from '@angular/core';
import { form, FormField, required, minLength, maxLength, pattern } from '@angular/forms/signals';
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
import { SwipeTabsDirective } from '@app/shared/directives/swipe-tabs/swipe-tabs.directive';
import { RECOVERY_QUESTIONS } from '@app/shared/constants/recovery-questions.constants';
import { getFieldErrorKey, validatePasswordsMatch } from '@app/shared/utils/form-validation.utils';
import { TranslateService } from '@ngx-translate/core';

const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 50;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;
const RECOVERY_ANSWER_MIN_LENGTH = 2;

interface DisplayNameFormModel {
  displayName: string;
}

interface PasswordFormModel {
  password: string;
  confirmPassword: string;
}

interface RecoveryFormModel {
  questionId: number | null;
  answer: string;
}

@Component({
  selector: 'app-user-account-dialog',
  imports: [
    FormField,
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
    SwipeTabsDirective,
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

  protected readonly displayNameModel = signal<DisplayNameFormModel>({
    displayName: this.authService.userProfile()?.display_name ?? '',
  });

  protected readonly displayNameForm = form(this.displayNameModel, path => {
    required(path.displayName);
    minLength(path.displayName, DISPLAY_NAME_MIN_LENGTH);
    maxLength(path.displayName, DISPLAY_NAME_MAX_LENGTH);
  });

  protected readonly passwordModel = signal<PasswordFormModel>({ password: '', confirmPassword: '' });

  protected readonly passwordForm = form(this.passwordModel, path => {
    required(path.password);
    minLength(path.password, PASSWORD_MIN_LENGTH);
    maxLength(path.password, PASSWORD_MAX_LENGTH);
    pattern(path.password, PASSWORD_PATTERN);
    required(path.confirmPassword);
    validatePasswordsMatch(path.password, path.confirmPassword);
  });

  protected readonly recoveryModel = signal<RecoveryFormModel>({
    questionId: this.authService.userProfile()?.recovery_question_id ?? null,
    answer: '',
  });

  protected readonly recoveryForm = form(this.recoveryModel, path => {
    required(path.questionId);
    required(path.answer);
    minLength(path.answer, RECOVERY_ANSWER_MIN_LENGTH);
  });

  // Reactive error signals
  protected readonly displayNameError = computed(() => getFieldErrorKey(this.displayNameForm.displayName().errors()));
  protected readonly passwordError = computed(() =>
    getFieldErrorKey(this.passwordForm.password().errors(), { pattern: 'auth.errors.passwordPattern' })
  );
  protected readonly confirmPasswordError = computed(() =>
    getFieldErrorKey(this.passwordForm.confirmPassword().errors())
  );
  protected readonly questionError = computed(() => getFieldErrorKey(this.recoveryForm.questionId().errors()));
  protected readonly answerError = computed(() => getFieldErrorKey(this.recoveryForm.answer().errors()));

  protected async onSaveDisplayName(event: Event): Promise<void> {
    event.preventDefault();

    if (this.displayNameForm().invalid() || this.loadingDisplayName()) {
      this.displayNameForm().markAsTouched();
      return;
    }
    this.loadingDisplayName.set(true);
    const { error } = await this.authService.updateDisplayName(this.displayNameModel().displayName.trim());
    this.loadingDisplayName.set(false);

    if (error) {
      this.snackbar.error(this.translate.instant('accountSettings.displayName.error'));
    } else {
      this.snackbar.success(this.translate.instant('accountSettings.displayName.success'));
      this.displayNameForm().reset(this.displayNameModel());
    }
  }

  protected async onSavePassword(event: Event): Promise<void> {
    event.preventDefault();

    if (this.passwordForm().invalid() || this.loadingPassword()) {
      this.passwordForm().markAsTouched();
      return;
    }
    this.loadingPassword.set(true);
    const { error } = await this.authService.updatePassword(this.passwordModel().password);
    this.loadingPassword.set(false);

    if (error) {
      this.snackbar.error(this.translate.instant('accountSettings.password.error'));
    } else {
      this.snackbar.success(this.translate.instant('accountSettings.password.success'));
      this.passwordForm().reset({ password: '', confirmPassword: '' });
    }
  }

  protected async onSaveRecovery(event: Event): Promise<void> {
    event.preventDefault();

    if (this.recoveryForm().invalid() || this.loadingRecovery()) {
      this.recoveryForm().markAsTouched();
      return;
    }
    this.loadingRecovery.set(true);
    const { questionId, answer } = this.recoveryModel();
    const { error } = await this.authService.updateRecovery(questionId as number, answer.trim());
    this.loadingRecovery.set(false);

    if (error) {
      this.snackbar.error(this.translate.instant('accountSettings.recovery.error'));
    } else {
      this.snackbar.success(this.translate.instant('accountSettings.recovery.success'));
      this.recoveryForm().reset({ ...this.recoveryModel(), answer: '' });
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
