import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '@app/core/services/auth.service';

@Component({
  selector: 'app-super-admin-setup',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './super-admin-setup.page.html',
  styleUrl: './super-admin-setup.page.scss',
})
export class SuperAdminSetupPage {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  protected readonly hidePassword = signal(true);
  protected readonly hideConfirmPassword = signal(true);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly setupForm: FormGroup = this.fb.group({
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(30)]],
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
  }, { validators: this.passwordMatchValidator });

  private passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;
    
    if (password !== confirmPassword) {
      form.get('confirmPassword')?.setErrors({ passwordMismatch: true });
      return { passwordMismatch: true };
    }
    
    return null;
  }

  protected togglePasswordVisibility(): void {
    this.hidePassword.update(value => !value);
  }

  protected toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword.update(value => !value);
  }

  protected getErrorMessage(fieldName: string): string {
    const field = this.setupForm.get(fieldName);
    
    if (!field || !field.errors || !field.touched) {
      return '';
    }

    if (field.errors['required']) {
      return 'auth.errors.required';
    }
    
    if (field.errors['minlength']) {
      return 'auth.errors.minLength';
    }
    
    if (field.errors['maxlength']) {
      return 'auth.errors.maxLength';
    }
    
    if (fieldName === 'confirmPassword' && field.errors['passwordMismatch']) {
      return 'auth.errors.passwordMismatch';
    }

    return '';
  }

  protected async onSubmit(): Promise<void> {
    if (this.setupForm.invalid || this.isLoading()) {
      this.setupForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const { username, displayName, password } = this.setupForm.value;
      
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
