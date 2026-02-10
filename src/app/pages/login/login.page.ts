import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '@app/core/services/auth.service';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import type { SignInRequest } from '@app/shared/models';
import { createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';

@Component({
  selector: 'app-login',
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
    TranslateModule,
    LoadingButtonComponent,
  ],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly hidePassword = signal(true);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly loginForm: FormGroup = this.fb.group({
    username: ['', [Validators.required]],
    password: ['', [Validators.required]],
  });

  // Reactive error signals (automatically update when form state changes)
  protected readonly usernameError = createFieldErrorSignal(this.loginForm, 'username');
  protected readonly passwordError = createFieldErrorSignal(this.loginForm, 'password');

  protected togglePasswordVisibility(): void {
    this.hidePassword.update(value => !value);
  }

  protected async onSubmit(): Promise<void> {
    if (this.loginForm.invalid || this.isLoading()) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const { username, password } = this.loginForm.value;
      
      const request: SignInRequest = {
        username,
        password,
      };
      
      const { error } = await this.authService.signIn(request);
      
      if (error) {
        throw error;
      }
      
      // Wait a bit for the profile to load
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Redirect based on role
      const role = this.authService.userProfile()?.role;
      if (role === 'super_admin') {
        await this.router.navigate(['/super-admin']);
      } else if (role === 'admin') {
        await this.router.navigate(['/management-dashboard']);
      } else {
        await this.router.navigate(['/activity-input']);
      }
    } catch (error: unknown) {
      console.error('Login error:', error);
      
      const errorMessage = (error as { message?: string })?.message || '';
      
      if (errorMessage.includes('Invalid') || errorMessage.includes('credentials')) {
        this.errorMessage.set('auth.errors.invalidCredentials');
      } else if (errorMessage.includes('not found')) {
        this.errorMessage.set('auth.errors.userNotFound');
      } else {
        this.errorMessage.set('auth.errors.loginFailed');
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}
