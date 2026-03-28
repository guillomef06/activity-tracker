import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SignupPage } from './signup.page';
import { AuthService } from '@app/core/services/auth.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { provideZonelessChangeDetection } from '@angular/core';

describe('SignupPage', () => {
  let component: SignupPage;
  let fixture: ComponentFixture<SignupPage>;

  beforeEach(async () => {
    const authServiceSpy = {
      signupAdmin: vi.fn(),
      checkUsernameAvailable: vi.fn().mockResolvedValue(true),
    };

    await TestBed.configureTestingModule({
      imports: [SignupPage, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SignupPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have a valid form with all required fields', () => {
    expect(component['signupForm'].valid).toBe(false);

    component['signupForm'].patchValue({
      username: 'newadmin',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      displayName: 'New Admin',
      allianceName: 'Test Alliance',
      recoveryQuestionId: 1,
      recoveryAnswer: 'Fluffy',
    });

    // Form may be PENDING due to async username validator — invalid must be false
    // meaning all sync validators pass (required, minLength, pattern, passwordMatch)
    expect(component['signupForm'].invalid).toBe(false);
  });

  it('should be invalid without recovery question and answer', () => {
    component['signupForm'].patchValue({
      username: 'newadmin',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      displayName: 'New Admin',
      allianceName: 'Test Alliance',
    });

    expect(component['signupForm'].valid).toBe(false);
  });

  it('should validate password match', () => {
    component['signupForm'].patchValue({
      username: 'admin',
      password: 'Password123',
      confirmPassword: 'Different123',
      displayName: 'Admin',
      allianceName: 'Alliance',
    });

    expect(component['signupForm'].hasError('passwordMismatch')).toBe(true);
  });
});
