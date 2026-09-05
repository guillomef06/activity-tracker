import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { from } from 'rxjs';
import { form, FormField, required, minLength, maxLength, pattern } from '@angular/forms/signals';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '@app/core/services/auth.service';
import { ServerService } from '@app/core/services/server.service';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import { AuthBackgroundComponent } from '@app/shared/components/auth-background/auth-background.component';
import type { MemberSignUpRequest } from '@app/shared/models';
import { RECOVERY_QUESTIONS } from '@app/shared/constants/recovery-questions.constants';
import {
  getFieldErrorKey,
  validateUsernameAvailable,
  validatePasswordsMatch,
} from '@app/shared/utils/form-validation.utils';

const TOKEN_MIN_LENGTH = 6;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 30;
const DISPLAY_NAME_MIN_LENGTH = 2;
const DISPLAY_NAME_MAX_LENGTH = 100;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 128;
const RECOVERY_ANSWER_MIN_LENGTH = 2;
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]+$/;
const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

interface JoinFormValue {
  token: string;
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
  recoveryQuestionId: number | null;
  recoveryAnswer: string;
}

@Component({
  selector: 'app-join',
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
  templateUrl: './join.page.html',
  styleUrl: './join.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinPage implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly serverService = inject(ServerService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly recoveryQuestions = RECOVERY_QUESTIONS;
  protected readonly hidePassword = signal(true);
  protected readonly hideConfirmPassword = signal(true);
  protected readonly isLoading = signal(false);
  protected readonly isValidatingToken = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly serverName = signal<string | null>(null);
  protected readonly invitationToken = signal<string | null>(null);

  protected readonly joinModel = signal<JoinFormValue>({
    token: '',
    username: '',
    displayName: '',
    password: '',
    confirmPassword: '',
    recoveryQuestionId: null,
    recoveryAnswer: '',
  });

  protected readonly joinForm = form(this.joinModel, path => {
    required(path.token);
    minLength(path.token, TOKEN_MIN_LENGTH);

    required(path.username);
    minLength(path.username, USERNAME_MIN_LENGTH);
    maxLength(path.username, USERNAME_MAX_LENGTH);
    pattern(path.username, USERNAME_PATTERN);
    validateUsernameAvailable(path.username, username => from(this.authService.checkUsernameAvailable(username)));

    required(path.displayName);
    minLength(path.displayName, DISPLAY_NAME_MIN_LENGTH);
    maxLength(path.displayName, DISPLAY_NAME_MAX_LENGTH);

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

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (token) {
      this.joinModel.update(value => ({ ...value, token }));
      this.validateToken(token);
    }
  }

  protected togglePasswordVisibility(): void {
    this.hidePassword.update(value => !value);
  }

  protected toggleConfirmPasswordVisibility(): void {
    this.hideConfirmPassword.update(value => !value);
  }

  protected async validateToken(token?: string): Promise<void> {
    const tokenValue = token ?? this.joinModel().token;

    if (!tokenValue || tokenValue.length < TOKEN_MIN_LENGTH) {
      this.serverName.set(null);
      this.invitationToken.set(null);
      return;
    }

    this.isValidatingToken.set(true);
    this.errorMessage.set(null);

    try {
      const response = await this.serverService.validateInvitation(tokenValue);

      if (response.valid && response.server) {
        this.invitationToken.set(tokenValue);
        this.serverName.set(response.server.name);
        this.errorMessage.set(null);
      } else {
        this.serverName.set(null);
        this.invitationToken.set(null);
        this.errorMessage.set(response.error || 'auth.errors.invalidToken');
      }
    } catch (error: unknown) {
      console.error('Token validation error:', error);
      this.errorMessage.set('auth.errors.invalidToken');
      this.serverName.set(null);
      this.invitationToken.set(null);
    } finally {
      this.isValidatingToken.set(false);
    }
  }

  protected async onSubmit(event: Event): Promise<void> {
    event.preventDefault();

    if (this.joinForm().invalid() || this.joinForm().pending() || this.isLoading()) {
      this.joinForm().markAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const { token, username, displayName, password, recoveryQuestionId, recoveryAnswer } = this.joinModel();

      const request: MemberSignUpRequest = {
        username,
        password,
        displayName,
        invitationToken: token,
        recoveryQuestionId: recoveryQuestionId as number,
        recoveryAnswer,
      };

      const { error } = await this.authService.signUpMember(request);
      if (error) throw error;

      await this.router.navigate(['/']);
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
