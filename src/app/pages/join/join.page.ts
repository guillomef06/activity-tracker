import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '@app/core/services/auth.service';
import type { MemberSignUpRequest } from '@app/shared/models';
import { passwordMatchValidator, createFieldErrorSignal } from '@app/shared/utils/form-validation.utils';

@Component({
  selector: 'app-join',
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
  templateUrl: './join.page.html',
  styleUrl: './join.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class JoinPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly hidePassword = signal(true);
  protected readonly hideConfirmPassword = signal(true);
  protected readonly isLoading = signal(false);
  protected readonly isValidatingToken = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly allianceName = signal<string | null>(null);
  protected readonly invitationToken = signal<string | null>(null);

  protected readonly joinForm: FormGroup = this.fb.group({
    token: ['', [Validators.required, Validators.minLength(6)]],
    username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(30)]],
    displayName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    confirmPassword: ['', [Validators.required]],
  }, { validators: passwordMatchValidator });

  ngOnInit(): void {
    // Check if token is provided in query params
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.joinForm.patchValue({ token });
      this.validateToken(token);
    }
  }

  protected togglePasswordVisibility(): void {
    this.hidePassword.update(value => !value);
  }

  protected toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword.update(value => !value);
  }

  // Reactive error signals (automatically update when form state changes)
  protected readonly tokenError = createFieldErrorSignal(this.joinForm, 'token');
  protected readonly usernameError = createFieldErrorSignal(this.joinForm, 'username');
  protected readonly displayNameError = createFieldErrorSignal(this.joinForm, 'displayName');
  protected readonly passwordError = createFieldErrorSignal(this.joinForm, 'password');
  protected readonly confirmPasswordError = createFieldErrorSignal(this.joinForm, 'confirmPassword');

  protected async validateToken(token?: string): Promise<void> {
    const tokenValue = token || this.joinForm.get('token')?.value;
    
    if (!tokenValue || tokenValue.length < 6) {
      this.allianceName.set(null);
      this.invitationToken.set(null);
      return;
    }

    this.isValidatingToken.set(true);
    this.errorMessage.set(null);

    try {
      // TODO: Implement token validation in AuthService or AllianceService
      // For now, we'll just store the token
      this.invitationToken.set(tokenValue);
      this.allianceName.set('Alliance Name'); // TODO: Get from API
    } catch (error: unknown) {
      console.error('Token validation error:', error);
      this.errorMessage.set('auth.errors.invalidToken');
      this.allianceName.set(null);
      this.invitationToken.set(null);
    } finally {
      this.isValidatingToken.set(false);
    }
  }

  protected async onSubmit(): Promise<void> {
    if (this.joinForm.invalid || this.isLoading()) {
      this.joinForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const { token, username, displayName, password } = this.joinForm.value;
      
      const request: MemberSignUpRequest = {
        username,
        password,
        displayName,
        invitationToken: token,
      };
      
      await this.authService.signUpMember(request);
      
      // Redirect to activity input page
      await this.router.navigate(['/activity-input']);
    } catch (error: unknown) {
      console.error('Join error:', error);
      
      const errorMessage = (error as { message?: string })?.message || '';
      
      if (errorMessage.includes('already exists') || errorMessage.includes('duplicate')) {
        this.errorMessage.set('auth.errors.usernameExists');
      } else if (errorMessage.includes('token') || errorMessage.includes('invitation')) {
        this.errorMessage.set('auth.errors.invalidToken');
      } else {
        this.errorMessage.set('auth.errors.joinFailed');
      }
    } finally {
      this.isLoading.set(false);
    }
  }
}
