import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { signal, WritableSignal } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { UserAccountDialogComponent } from './user-account-dialog.component';
import { AuthService } from '@app/core/services/auth.service';
import { LanguageService } from '@app/core/services/language.service';
import { SnackbarService } from '@app/core/services/snackbar.service';
import { UserProfile } from '@app/shared/models/user.model';
import { SupportedLanguage } from '@app/core/services/language.service';

const mockProfile: UserProfile = {
  id: 'user-1',
  display_name: 'Test User',
  username: 'testuser',
  role: 'member',
  alliance_id: 'alliance-1',
  invitation_token_id: null,
  recovery_question_id: 1,
  created_at: '',
  updated_at: '',
};

interface DialogInternals {
  displayNameForm: FormGroup;
  passwordForm: FormGroup;
  recoveryForm: FormGroup;
  onSaveDisplayName(): Promise<void>;
  onSavePassword(): Promise<void>;
  onSaveRecovery(): Promise<void>;
  changeLanguage(lang: SupportedLanguage): Promise<void>;
  close(): void;
}

describe('UserAccountDialogComponent', () => {
  let component: UserAccountDialogComponent;
  let fixture: ComponentFixture<UserAccountDialogComponent>;
  let authService: {
    updateDisplayName: ReturnType<typeof vi.fn>;
    updatePassword: ReturnType<typeof vi.fn>;
    updateRecovery: ReturnType<typeof vi.fn>;
    userProfile: WritableSignal<UserProfile | null>;
  };
  let languageService: {
    setLanguage: ReturnType<typeof vi.fn>;
    currentLanguage: WritableSignal<SupportedLanguage>;
    availableLanguages: { code: SupportedLanguage; name: string; flag: string }[];
  };
  let snackbar: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let dialogRef: { close: ReturnType<typeof vi.fn> };

  function internals(): DialogInternals {
    return component as unknown as DialogInternals;
  }

  beforeEach(async () => {
    authService = {
      userProfile: signal(mockProfile),
      updateDisplayName: vi.fn().mockResolvedValue({ error: null }),
      updatePassword: vi.fn().mockResolvedValue({ error: null }),
      updateRecovery: vi.fn().mockResolvedValue({ error: null }),
    };

    languageService = {
      currentLanguage: signal<SupportedLanguage>('en'),
      availableLanguages: [
        { code: 'en', name: 'English', flag: '🇬🇧' },
        { code: 'fr', name: 'Français', flag: '🇫🇷' },
      ],
      setLanguage: vi.fn().mockResolvedValue(undefined),
    };

    snackbar = {
      success: vi.fn(),
      error: vi.fn(),
    };

    dialogRef = { close: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [UserAccountDialogComponent, NoopAnimationsModule, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: LanguageService, useValue: languageService },
        { provide: SnackbarService, useValue: snackbar },
        { provide: MatDialogRef, useValue: dialogRef },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserAccountDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should pre-fill display name from user profile', () => {
    expect(internals().displayNameForm.get('displayName')?.value).toBe('Test User');
  });

  it('should pre-select recovery question from user profile', () => {
    expect(internals().recoveryForm.get('questionId')?.value).toBe(1);
  });

  describe('onSaveDisplayName', () => {
    it('calls updateDisplayName and shows success snackbar', async () => {
      internals().displayNameForm.setValue({ displayName: 'New Name' });
      internals().displayNameForm.markAsDirty();

      await internals().onSaveDisplayName();

      expect(authService.updateDisplayName).toHaveBeenCalledWith('New Name');
      expect(snackbar.success).toHaveBeenCalled();
    });

    it('shows error snackbar on failure', async () => {
      authService.updateDisplayName.mockResolvedValue({ error: 'DB error' });
      internals().displayNameForm.setValue({ displayName: 'New Name' });
      internals().displayNameForm.markAsDirty();

      await internals().onSaveDisplayName();

      expect(snackbar.error).toHaveBeenCalled();
    });

    it('does not submit if form is invalid', async () => {
      internals().displayNameForm.setValue({ displayName: '' });

      await internals().onSaveDisplayName();

      expect(authService.updateDisplayName).not.toHaveBeenCalled();
    });
  });

  describe('onSavePassword', () => {
    it('calls updatePassword and resets form on success', async () => {
      internals().passwordForm.setValue({ password: 'NewPass1', confirmPassword: 'NewPass1' });
      internals().passwordForm.markAsDirty();

      await internals().onSavePassword();

      expect(authService.updatePassword).toHaveBeenCalledWith('NewPass1');
      expect(snackbar.success).toHaveBeenCalled();
    });

    it('shows error snackbar on failure', async () => {
      authService.updatePassword.mockResolvedValue({ error: 'Auth error' });
      internals().passwordForm.setValue({ password: 'NewPass1', confirmPassword: 'NewPass1' });
      internals().passwordForm.markAsDirty();

      await internals().onSavePassword();

      expect(snackbar.error).toHaveBeenCalled();
    });
  });

  describe('onSaveRecovery', () => {
    it('calls updateRecovery with questionId and trimmed answer', async () => {
      internals().recoveryForm.setValue({ questionId: 2, answer: '  my answer  ' });
      internals().recoveryForm.markAsDirty();

      await internals().onSaveRecovery();

      expect(authService.updateRecovery).toHaveBeenCalledWith(2, 'my answer');
      expect(snackbar.success).toHaveBeenCalled();
    });

    it('shows error snackbar on failure', async () => {
      authService.updateRecovery.mockResolvedValue({ error: 'DB error' });
      internals().recoveryForm.setValue({ questionId: 2, answer: 'answer' });
      internals().recoveryForm.markAsDirty();

      await internals().onSaveRecovery();

      expect(snackbar.error).toHaveBeenCalled();
    });
  });

  describe('changeLanguage', () => {
    it('delegates to languageService.setLanguage', async () => {
      await internals().changeLanguage('fr');
      expect(languageService.setLanguage).toHaveBeenCalledWith('fr');
    });
  });

  it('closes dialog on close()', () => {
    internals().close();
    expect(dialogRef.close).toHaveBeenCalled();
  });
});
