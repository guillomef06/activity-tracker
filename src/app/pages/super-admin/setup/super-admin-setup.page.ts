import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';

import { form, FormField, required, minLength, maxLength, pattern } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '@app/core/services/auth.service';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import { getFieldErrorKey, validatePasswordsMatch } from '@app/shared/utils/form-validation.utils';

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 100;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 128;
const PASSWORD_COMPLEXITY_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

interface SetupFormValue {
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
}

@Component({
  selector: 'app-super-admin-setup',
  imports: [
    FormField,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    TranslateModule,
    LoadingButtonComponent,
  ],
  templateUrl: './super-admin-setup.page.html',
  styleUrl: './super-admin-setup.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminSetupPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly hidePassword = signal(true);
  protected readonly hideConfirmPassword = signal(true);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly setupModel = signal<SetupFormValue>({
    username: '',
    displayName: '',
    password: '',
    confirmPassword: '',
  });

  protected readonly setupForm = form(this.setupModel, path => {
    required(path.username);
    minLength(path.username, USERNAME_MIN_LENGTH);
    maxLength(path.username, USERNAME_MAX_LENGTH);

    required(path.displayName);
    minLength(path.displayName, DISPLAY_NAME_MIN_LENGTH);
    maxLength(path.displayName, DISPLAY_NAME_MAX_LENGTH);

    required(path.password);
    minLength(path.password, PASSWORD_MIN_LENGTH);
    maxLength(path.password, PASSWORD_MAX_LENGTH);
    pattern(path.password, PASSWORD_COMPLEXITY_PATTERN, { message: 'auth.errors.passwordPattern' });

    required(path.confirmPassword);
    validatePasswordsMatch(path.password, path.confirmPassword);
  });

  protected readonly getFieldErrorKey = getFieldErrorKey;

  protected togglePasswordVisibility(): void {
    this.hidePassword.update(value => !value);
  }

  protected toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword.update(value => !value);
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();

    if (this.setupForm().invalid() || this.isLoading()) {
      this.setupForm().markAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const { username, displayName, password } = this.setupModel();

      await this.authService.signUpSuperAdmin(username, password, displayName);

      // Redirect to super admin dashboard
      await this.router.navigate(['/super-admin']);
    } catch (error: unknown) {
      console.error('Super admin setup error:', error);

      const errorMessage = (error as { message?: string })?.message || '';

      if (errorMessage.includes('already exists')) {
        this.errorMessage.set('auth.errors.usernameExists');
      } else if (errorMessage.includes('super admin')) {
        this.errorMessage.set('auth.errors.superAdminExists');
      } else {
        this.errorMessage.set('auth.errors.setupFailed');
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}
