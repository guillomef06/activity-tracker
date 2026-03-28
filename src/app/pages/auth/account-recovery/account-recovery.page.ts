import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateModule } from '@ngx-translate/core';
import { AuthService } from '@app/core/services/auth.service';
import { LoadingButtonComponent } from '@app/shared/components/loading-button/loading-button.component';
import { RECOVERY_QUESTIONS } from '@app/shared/constants/recovery-questions.constants';
import { passwordMatchValidator } from '@app/shared/utils/form-validation.utils';

type Step = 1 | 2 | 3;

@Component({
  selector: 'app-account-recovery',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    TranslateModule,
    LoadingButtonComponent,
  ],
  templateUrl: './account-recovery.page.html',
  styleUrl: './account-recovery.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountRecoveryPage {
  private readonly authService = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  protected readonly step = signal<Step>(1);
  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly questionId = signal<number | null>(null);
  protected readonly lockedUntil = signal<string | null>(null);
  protected readonly remainingAttempts = signal<number | null>(null);
  protected readonly hideAnswer = signal(true);
  protected readonly hidePassword = signal(true);
  protected readonly hideConfirmPassword = signal(true);
  protected readonly RECOVERY_QUESTIONS = RECOVERY_QUESTIONS;

  protected readonly step1Form: FormGroup = this.fb.group({
    username: ['', [Validators.required]],
  });

  protected readonly step2Form: FormGroup = this.fb.group(
    {
      answer: ['', [Validators.required, Validators.minLength(2)]],
      password: ['', [Validators.required, Validators.minLength(6), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator }
  );

  protected get currentQuestion() {
    const id = this.questionId();
    if (id === null) return null;
    return RECOVERY_QUESTIONS.find(q => q.id === id) ?? null;
  }

  protected async onStep1Submit(): Promise<void> {
    if (this.step1Form.invalid || this.isLoading()) {
      this.step1Form.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const { username } = this.step1Form.value;
    const { questionId, error } = await this.authService.getRecoveryQuestion(username);

    if (error || questionId === null) {
      this.errorMessage.set(error ?? 'recovery.errors.userNotFound');
    } else {
      this.questionId.set(questionId);
      this.step.set(2);
    }
    this.isLoading.set(false);
  }

  protected async onStep2Submit(): Promise<void> {
    if (this.step2Form.invalid || this.isLoading()) {
      this.step2Form.markAllAsTouched();
      return;
    }
    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.remainingAttempts.set(null);
    this.lockedUntil.set(null);

    const username = this.step1Form.value.username as string;
    const { answer, password } = this.step2Form.value;
    const { error, remaining, until } = await this.authService.resetPasswordWithRecovery(username, answer, password);

    if (!error) {
      this.step.set(3);
    } else if (error === 'recovery.errors.wrongAnswer' && remaining === 0) {
      this.errorMessage.set('recovery.errors.locked');
    } else if (error === 'recovery.errors.wrongAnswer') {
      this.errorMessage.set(error);
      this.remainingAttempts.set(remaining ?? null);
    } else if (error === 'recovery.errors.locked') {
      this.errorMessage.set(error);
      this.lockedUntil.set(until ?? null);
    } else {
      this.errorMessage.set(error);
    }
    this.isLoading.set(false);
  }

  protected toggleHideAnswer(): void {
    this.hideAnswer.update(v => !v);
  }
  protected toggleHidePassword(): void {
    this.hidePassword.update(v => !v);
  }
  protected toggleHideConfirmPassword(): void {
    this.hideConfirmPassword.update(v => !v);
  }
}
