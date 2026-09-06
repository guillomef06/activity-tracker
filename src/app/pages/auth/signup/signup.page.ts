import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { from } from 'rxjs';
import { form, FormField, required, minLength, maxLength, pattern } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '@app/core/services/auth.service';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import { AuthBackgroundComponent } from '@app/shared/components/auth-background/auth-background.component';
import type { AdminSignUpRequest } from '@app/shared/models';
import { RECOVERY_QUESTIONS } from '@app/shared/constants/recovery-questions.constants';
import {
  getFieldErrorKey,
  validateUsernameAvailable,
  validatePasswordsMatch,
} from '@app/shared/utils/form-validation.utils';

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 100;
const SERVER_NAME_MIN_LENGTH = 3;
const SERVER_NAME_MAX_LENGTH = 100;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 128;
const RECOVERY_ANSWER_MIN_LENGTH = 2;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

interface SignupFormValue {
  username: string;
  displayName: string;
  serverName: string;
  password: string;
  confirmPassword: string;
  recoveryQuestionId: number | null;
  recoveryAnswer: string;
}

@Component({
  selector: 'app-signup',
  imports: [
    FormField,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    AuthBackgroundComponent,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    TranslateModule,
    LoadingButtonComponent,
  ],
  templateUrl: './signup.page.html',
  styleUrl: './signup.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SignupPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly recoveryQuestions = RECOVERY_QUESTIONS;
  protected readonly hidePassword = signal(true);
  protected readonly hideConfirmPassword = signal(true);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly signupModel = signal<SignupFormValue>({
    username: '',
    displayName: '',
    serverName: '',
    password: '',
    confirmPassword: '',
    recoveryQuestionId: null,
    recoveryAnswer: '',
  });

  protected readonly signupForm = form(this.signupModel, path => {
    required(path.username);
    minLength(path.username, USERNAME_MIN_LENGTH);
    maxLength(path.username, USERNAME_MAX_LENGTH);
    pattern(path.username, USERNAME_PATTERN);
    validateUsernameAvailable(path.username, username => from(this.authService.checkUsernameAvailable(username)));

    required(path.displayName);
    minLength(path.displayName, DISPLAY_NAME_MIN_LENGTH);
    maxLength(path.displayName, DISPLAY_NAME_MAX_LENGTH);

    required(path.serverName);
    minLength(path.serverName, SERVER_NAME_MIN_LENGTH);
    maxLength(path.serverName, SERVER_NAME_MAX_LENGTH);

    required(path.password);
    minLength(path.password, PASSWORD_MIN_LENGTH);
    maxLength(path.password, PASSWORD_MAX_LENGTH);
    pattern(path.password, PASSWORD_PATTERN);

    required(path.confirmPassword);
    validatePasswordsMatch(path.password, path.confirmPassword);

    required(path.recoveryQuestionId);
    required(path.recoveryAnswer);
    minLength(path.recoveryAnswer, RECOVERY_ANSWER_MIN_LENGTH);
  });

  protected readonly getFieldErrorKey = getFieldErrorKey;
  protected readonly usernameErrorKeys: Record<string, string> = { pattern: 'auth.errors.usernameInvalidChars' };
  protected readonly passwordErrorKeys: Record<string, string> = { pattern: 'auth.errors.passwordPattern' };

  protected togglePasswordVisibility(): void {
    this.hidePassword.update(value => !value);
  }

  protected toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword.update(value => !value);
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();

    if (this.signupForm().invalid() || this.signupForm().pending() || this.isLoading()) {
      this.signupForm().markAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const { username, displayName, serverName, password, recoveryQuestionId, recoveryAnswer } = this.signupModel();

      const request: AdminSignUpRequest = {
        username,
        password,
        displayName,
        serverName,
        recoveryQuestionId: recoveryQuestionId as number,
        recoveryAnswer,
      };

      await this.authService.signUpAdmin(request);

      await this.router.navigate(['/dashboard']);
    } catch (error: unknown) {
      console.error('Signup error:', error);

      const errorMessage = (error as { message?: string })?.message || '';

      if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
        this.errorMessage.set('auth.errors.usernameExists');
      } else if (errorMessage.includes('server')) {
        this.errorMessage.set('auth.errors.serverCreationFailed');
      } else {
        this.errorMessage.set('auth.errors.signupFailed');
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}
