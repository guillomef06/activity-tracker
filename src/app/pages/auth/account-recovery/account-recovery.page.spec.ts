import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AccountRecoveryPage } from './account-recovery.page';
import { AuthService } from '@app/core/services/auth.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { provideZonelessChangeDetection } from '@angular/core';

describe('AccountRecoveryPage', () => {
  let component: AccountRecoveryPage;
  let fixture: ComponentFixture<AccountRecoveryPage>;
  let authSpy: { getRecoveryQuestion: ReturnType<typeof vi.fn>; resetPasswordWithRecovery: ReturnType<typeof vi.fn> };

  const submitStep1 = (): Promise<void> => component['onStep1Submit'](new Event('submit'));
  const submitStep2 = (): Promise<void> => component['onStep2Submit'](new Event('submit'));

  beforeEach(async () => {
    authSpy = {
      getRecoveryQuestion: vi.fn(),
      resetPasswordWithRecovery: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [AccountRecoveryPage, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authSpy },
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountRecoveryPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and start on step 1', () => {
    expect(component).toBeTruthy();
    expect(component['step']()).toBe(1);
  });

  it('should be invalid on step 1 when username is empty', () => {
    expect(component['step1Form']().valid()).toBe(false);
  });

  it('should move to step 2 when username is found', async () => {
    authSpy.getRecoveryQuestion.mockResolvedValue({ questionId: 3, error: null });
    component['step1Model'].set({ username: 'testuser' });
    await submitStep1();
    expect(component['step']()).toBe(2);
    expect(component['questionId']()).toBe(3);
  });

  it('should show error when username not found', async () => {
    authSpy.getRecoveryQuestion.mockResolvedValue({ questionId: null, error: 'recovery.errors.userNotFound' });
    component['step1Model'].set({ username: 'unknown' });
    await submitStep1();
    expect(component['step']()).toBe(1);
    expect(component['errorMessage']()).toBe('recovery.errors.userNotFound');
  });

  it('should not call the service and should mark the field as touched when the step 1 form is invalid', async () => {
    await submitStep1();

    expect(authSpy.getRecoveryQuestion).not.toHaveBeenCalled();
    expect(component['step1Form'].username().touched()).toBe(true);
  });

  it('should be invalid on step 2 when the password does not match its confirmation', () => {
    component['step2Model'].set({ answer: 'Paris', password: 'NewPass1', confirmPassword: 'Different1' });

    expect(
      component['step2Form']
        .confirmPassword()
        .errors()
        .some(error => error.kind === 'passwordMismatch')
    ).toBe(true);
  });

  it('should move to step 3 on successful reset', async () => {
    authSpy.resetPasswordWithRecovery.mockResolvedValue({ error: null });
    component['step'].set(2);
    component['questionId'].set(2);
    component['step2Model'].set({ answer: 'Paris', password: 'NewPass1', confirmPassword: 'NewPass1' });
    component['step1Model'].set({ username: 'testuser' });
    await submitStep2();
    expect(component['step']()).toBe(3);
  });

  it('should show wrong answer error with remaining count', async () => {
    authSpy.resetPasswordWithRecovery.mockResolvedValue({ error: 'recovery.errors.wrongAnswer', remaining: 3 });
    component['step'].set(2);
    component['step2Model'].set({ answer: 'bad', password: 'NewPass1', confirmPassword: 'NewPass1' });
    component['step1Model'].set({ username: 'testuser' });
    await submitStep2();
    expect(component['errorMessage']()).toBe('recovery.errors.wrongAnswer');
    expect(component['remainingAttempts']()).toBe(3);
  });

  it('should show locked error when remaining is 0', async () => {
    authSpy.resetPasswordWithRecovery.mockResolvedValue({ error: 'recovery.errors.wrongAnswer', remaining: 0 });
    component['step'].set(2);
    component['step2Model'].set({ answer: 'bad', password: 'NewPass1', confirmPassword: 'NewPass1' });
    component['step1Model'].set({ username: 'testuser' });
    await submitStep2();
    expect(component['errorMessage']()).toBe('recovery.errors.locked');
  });

  it('should show locked error with until time', async () => {
    authSpy.resetPasswordWithRecovery.mockResolvedValue({
      error: 'recovery.errors.locked',
      until: '2026-03-20T10:15:00Z',
    });
    component['step'].set(2);
    component['step2Model'].set({ answer: 'bad', password: 'NewPass1', confirmPassword: 'NewPass1' });
    component['step1Model'].set({ username: 'testuser' });
    await submitStep2();
    expect(component['errorMessage']()).toBe('recovery.errors.locked');
    expect(component['lockedUntil']()).toBe('2026-03-20T10:15:00Z');
  });
});
