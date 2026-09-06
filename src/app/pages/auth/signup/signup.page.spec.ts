import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SignupPage } from './signup.page';
import { AuthService } from '@app/core/services/auth.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { provideZonelessChangeDetection } from '@angular/core';

describe('SignupPage', () => {
  let component: SignupPage;
  let fixture: ComponentFixture<SignupPage>;

  beforeEach(async () => {
    const authServiceSpy = {
      signUpAdmin: vi.fn(),
      checkUsernameAvailable: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [SignupPage, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SignupPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const fillValidForm = (): void => {
    component['signupModel'].set({
      username: 'newadmin',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      displayName: 'New Admin',
      serverName: 'Test Server',
      recoveryQuestionId: 1,
      recoveryAnswer: 'Fluffy',
    });
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should be invalid when all fields are empty', () => {
    expect(component['signupForm']().valid()).toBe(false);
  });

  it('should become valid once all fields are filled correctly', async () => {
    fillValidForm();

    await vi.waitFor(() => {
      expect(component['signupForm']().pending()).toBe(false);
    });

    expect(component['signupForm']().invalid()).toBe(false);
  });

  it('should be invalid without recovery question and answer', () => {
    component['signupModel'].set({
      username: 'newadmin',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      displayName: 'New Admin',
      serverName: 'Test Server',
      recoveryQuestionId: null,
      recoveryAnswer: '',
    });

    expect(component['signupForm']().valid()).toBe(false);
  });

  it('should flag a password/confirmPassword mismatch', () => {
    component['signupModel'].set({
      username: 'admin',
      password: 'Password123',
      confirmPassword: 'Different123',
      displayName: 'Admin',
      serverName: 'Server',
      recoveryQuestionId: 1,
      recoveryAnswer: 'Fluffy',
    });

    expect(
      component['signupForm']
        .confirmPassword()
        .errors()
        .some(error => error.kind === 'passwordMismatch')
    ).toBe(true);
  });

  it('should reject a username with invalid characters', () => {
    component['signupModel'].update(value => ({ ...value, username: 'invalid username!' }));

    expect(
      component['signupForm']
        .username()
        .errors()
        .some(error => error.kind === 'pattern')
    ).toBe(true);
  });

  it('should reject a password missing the required character classes', () => {
    component['signupModel'].update(value => ({ ...value, password: 'alllowercase' }));

    expect(
      component['signupForm']
        .password()
        .errors()
        .some(error => error.kind === 'pattern')
    ).toBe(true);
  });

  it('should mark username as taken when the availability check resolves false', async () => {
    const authServiceSpy = TestBed.inject(AuthService) as unknown as {
      checkUsernameAvailable: ReturnType<typeof vi.fn>;
    };
    authServiceSpy.checkUsernameAvailable.mockResolvedValue(false);

    component['signupModel'].update(value => ({ ...value, username: 'takenname' }));

    await vi.waitFor(() => {
      expect(
        component['signupForm']
          .username()
          .errors()
          .some(error => error.kind === 'usernameTaken')
      ).toBe(true);
    });
  });

  it('should not submit and should mark fields as touched when the form is invalid', async () => {
    const submitEvent = new Event('submit');
    const preventDefaultSpy = vi.spyOn(submitEvent, 'preventDefault');

    await component['onSubmit'](submitEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(component['signupForm'].username().touched()).toBe(true);
  });
});
