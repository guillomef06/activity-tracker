import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';

import { form, FormField, required } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '@app/core/services/auth.service';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import { AuthBackgroundComponent } from '@app/shared/components/auth-background/auth-background.component';
import type { SignInRequest } from '@app/shared/models';
import { getFieldErrorKey } from '@app/shared/utils/form-validation.utils';

interface LoginFormValue {
  username: string;
  password: string;
}

@Component({
  selector: 'app-login',
  imports: [
    FormField,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    AuthBackgroundComponent,
    TranslateModule,
    LoadingButtonComponent,
  ],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly hidePassword = signal(true);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly loginModel = signal<LoginFormValue>({ username: '', password: '' });

  protected readonly loginForm = form(this.loginModel, path => {
    required(path.username);
    required(path.password);
  });

  protected readonly getFieldErrorKey = getFieldErrorKey;

  protected togglePasswordVisibility(): void {
    this.hidePassword.update(value => !value);
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();

    if (this.loginForm().invalid() || this.isLoading()) {
      this.loginForm().markAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const { username, password } = this.loginModel();

      const request: SignInRequest = {
        username,
        password,
      };

      const { error } = await this.authService.signIn(request);

      if (error) {
        throw error;
      }

      const role = this.authService.userProfile()?.role;
      if (role === 'super_admin') {
        await this.router.navigate(['/super-admin']);
      } else {
        await this.router.navigate(['/']);
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
