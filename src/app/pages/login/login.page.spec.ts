import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LoginPage } from './login.page';
import { AuthService } from '@app/core/services/auth.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;

  beforeEach(async () => {
    const authServiceSpy = { login: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [LoginPage, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have a valid form with username and password', () => {
    expect(component['loginForm'].valid).toBe(false);

    component['loginForm'].patchValue({
      username: 'testuser',
      password: 'password123',
    });

    expect(component['loginForm'].valid).toBe(true);
  });

  it('should require username', () => {
    const usernameControl = component['loginForm'].get('username');
    usernameControl?.setValue('');
    expect(usernameControl?.hasError('required')).toBe(true);
  });

  it('should require password', () => {
    const passwordControl = component['loginForm'].get('password');
    passwordControl?.setValue('');
    expect(passwordControl?.hasError('required')).toBe(true);
  });
});
