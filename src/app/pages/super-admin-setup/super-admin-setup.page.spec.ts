import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SuperAdminSetupPage } from './super-admin-setup.page';
import { AuthService } from '@app/core/services/auth.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';

describe('SuperAdminSetupPage', () => {
  let component: SuperAdminSetupPage;
  let fixture: ComponentFixture<SuperAdminSetupPage>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['setupSuperAdmin']);

    await TestBed.configureTestingModule({
      imports: [SuperAdminSetupPage, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SuperAdminSetupPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have a valid form with required fields', () => {
    expect(component['setupForm'].valid).toBeFalse();
    
    component['setupForm'].patchValue({
      username: 'superadmin',
      password: 'SecurePassword123!',
      confirmPassword: 'SecurePassword123!',
      displayName: 'Super Administrator',
    });

    expect(component['setupForm'].valid).toBeTrue();
  });

  it('should validate password match', () => {
    component['setupForm'].patchValue({
      username: 'superadmin',
      password: 'Password123!',
      confirmPassword: 'DifferentPassword123!',
      displayName: 'Super Admin',
    });

    expect(component['setupForm'].hasError('passwordMismatch')).toBeTrue();
  });
});
