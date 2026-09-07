import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { SuperAdminSetupPage } from './super-admin-setup.page';
import { AuthService } from '@app/core/services/auth.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { provideZonelessChangeDetection } from '@angular/core';

describe('SuperAdminSetupPage', () => {
  let component: SuperAdminSetupPage;
  let fixture: ComponentFixture<SuperAdminSetupPage>;

  beforeEach(async () => {
    const authServiceSpy = { signUpSuperAdmin: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [SuperAdminSetupPage, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SuperAdminSetupPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should be invalid when fields are empty', () => {
    expect(component['setupForm']().valid()).toBe(false);
  });

  it('should become valid with a complete, matching, compliant submission', () => {
    component['setupModel'].set({
      username: 'superadmin',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      displayName: 'Super Administrator',
    });

    expect(component['setupForm']().valid()).toBe(true);
  });

  it('should flag a password mismatch on confirmPassword', () => {
    component['setupModel'].set({
      username: 'superadmin',
      password: 'Password123',
      confirmPassword: 'DifferentPassword123',
      displayName: 'Super Admin',
    });

    expect(
      component['setupForm']
        .confirmPassword()
        .errors()
        .some(error => error.kind === 'passwordMismatch')
    ).toBe(true);
  });

  it('should reject a password missing complexity requirements', () => {
    component['setupModel'].set({
      username: 'superadmin',
      password: 'alllowercase',
      confirmPassword: 'alllowercase',
      displayName: 'Super Admin',
    });

    expect(
      component['setupForm']
        .password()
        .errors()
        .some(error => error.kind === 'pattern')
    ).toBe(true);
  });

  it('should not submit and should mark fields as touched when the form is invalid', async () => {
    const submitEvent = new Event('submit');
    const preventDefaultSpy = vi.spyOn(submitEvent, 'preventDefault');

    await component['onSubmit'](submitEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(component['setupForm'].username().touched()).toBe(true);
  });
});
