import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LoginPage } from './login.page';
import { AuthService } from '@app/core/services/auth.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { provideZonelessChangeDetection } from '@angular/core';

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
        provideHttpClient(withXhr()),
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should be invalid when username and password are empty', () => {
    expect(component['loginForm']().valid()).toBe(false);
  });

  it('should become valid once username and password are filled', () => {
    component['loginModel'].set({ username: 'testuser', password: 'password123' });

    expect(component['loginForm']().valid()).toBe(true);
  });

  it('should require username', () => {
    component['loginModel'].set({ username: '', password: 'password123' });

    expect(
      component['loginForm']
        .username()
        .errors()
        .some(error => error.kind === 'required')
    ).toBe(true);
  });

  it('should require password', () => {
    component['loginModel'].set({ username: 'testuser', password: '' });

    expect(
      component['loginForm']
        .password()
        .errors()
        .some(error => error.kind === 'required')
    ).toBe(true);
  });

  it('should not submit and should mark fields as touched when the form is invalid', async () => {
    const submitEvent = new Event('submit');
    const preventDefaultSpy = vi.spyOn(submitEvent, 'preventDefault');

    await component['onSubmit'](submitEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(component['loginForm'].username().touched()).toBe(true);
    expect(component['loginForm'].password().touched()).toBe(true);
  });
});
