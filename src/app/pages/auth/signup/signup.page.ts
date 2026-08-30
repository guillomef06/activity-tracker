import { Component, inject, signal, ChangeDetectionStrategy, DestroyRef } from '@angular/core';
import { from } from 'rxjs';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
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
  passwordMatchValidator,
  createFieldErrorSignal,
  createFieldValidSignal,
  usernameAvailableValidator,
} from '@app/shared/utils/form-validation.utils';

@Component({
  selector: 'app-signup',
  imports: [
    ReactiveFormsModule,
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
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly recoveryQuestions = RECOVERY_QUESTIONS;
  protected readonly hidePassword = signal(true);
  protected readonly hideConfirmPassword = signal(true);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly signupForm: FormGroup = this.fb.group(
    {
      username: [
        '',
        [
          Validators.required,
          Validators.minLength(3),
          Validators.maxLength(30),
          Validators.pattern(/^[a-zA-Z0-9_-]+$/),
        ],
        [usernameAvailableValidator(u => from(this.authService.checkUsernameAvailable(u)))],
      ],
      displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      serverName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(6),
          Validators.maxLength(128),
          Validators.pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/),
        ],
      ],
      confirmPassword: ['', [Validators.required]],
      recoveryQuestionId: [null, [Validators.required]],
      recoveryAnswer: ['', [Validators.required, Validators.minLength(2)]],
    },
    { validators: passwordMatchValidator }
  );

  protected togglePasswordVisibility(): void {
    this.hidePassword.update(value => !value);
  }

  protected toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword.update(value => !value);
  }

  // Reactive error signals (automatically update when form state changes)
  protected readonly usernameError = createFieldErrorSignal(this.signupForm, 'username', this.destroyRef, undefined, {
    pattern: 'auth.errors.usernameInvalidChars',
  });
  protected readonly displayNameError = createFieldErrorSignal(this.signupForm, 'displayName', this.destroyRef);
  protected readonly serverNameError = createFieldErrorSignal(this.signupForm, 'serverName', this.destroyRef);
  protected readonly passwordError = createFieldErrorSignal(this.signupForm, 'password', this.destroyRef, undefined, {
    pattern: 'auth.errors.passwordPattern',
  });
  protected readonly confirmPasswordError = createFieldErrorSignal(this.signupForm, 'confirmPassword', this.destroyRef);
  protected readonly confirmPasswordValid = createFieldValidSignal(this.signupForm, 'confirmPassword', this.destroyRef);
  protected readonly recoveryQuestionIdError = createFieldErrorSignal(
    this.signupForm,
    'recoveryQuestionId',
    this.destroyRef
  );
  protected readonly recoveryAnswerError = createFieldErrorSignal(this.signupForm, 'recoveryAnswer', this.destroyRef);

  protected async onSubmit(): Promise<void> {
    if (this.signupForm.invalid || this.signupForm.pending || this.isLoading()) {
      this.signupForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const { username, displayName, serverName, password, recoveryQuestionId, recoveryAnswer } = this.signupForm.value;

      const request: AdminSignUpRequest = {
        username,
        password,
        displayName,
        serverName,
        recoveryQuestionId,
        recoveryAnswer,
      };

      await this.authService.signUpAdmin(request);

      // Redirect to dashboard
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
