import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '@app/core/services/auth.service';
import type { AdminSignUpRequest } from '@app/shared/models';
import { passwordMatchValidator, createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  templateUrl: './signup.page.html',
  styleUrl: './signup.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SignupPage {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly hidePassword = signal(true);
  protected readonly hideConfirmPassword = signal(true);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly signupForm: FormGroup = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(30)]],
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    allianceName: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
  }, { validators: passwordMatchValidator });

  protected togglePasswordVisibility(): void {
    this.hidePassword.update(value => !value);
  }

  protected toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword.update(value => !value);
  }

  // Reactive error signals (automatically update when form state changes)
  protected readonly usernameError = createFieldErrorSignal(this.signupForm, 'username');
  protected readonly displayNameError = createFieldErrorSignal(this.signupForm, 'displayName');
  protected readonly allianceNameError = createFieldErrorSignal(this.signupForm, 'allianceName');
  protected readonly passwordError = createFieldErrorSignal(this.signupForm, 'password');
  protected readonly confirmPasswordError = createFieldErrorSignal(this.signupForm, 'confirmPassword');

  protected async onSubmit(): Promise<void> {
    if (this.signupForm.invalid || this.isLoading()) {
      this.signupForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const { username, displayName, allianceName, password } = this.signupForm.value;
      
      const request: AdminSignUpRequest = {
        username,
        password,
        displayName,
        allianceName,
      };
      
      await this.authService.signUpAdmin(request);
      
      // Redirect to dashboard
      await this.router.navigate(['/dashboard']);
    } catch (error: unknown) {
      console.error('Signup error:', error);
      
      const errorMessage = (error as { message?: string })?.message || '';
      
      if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
        this.errorMessage.set('auth.errors.usernameExists');
      } else if (errorMessage.includes('alliance')) {
        this.errorMessage.set('auth.errors.allianceCreationFailed');
      } else {
        this.errorMessage.set('auth.errors.signupFailed');
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}
