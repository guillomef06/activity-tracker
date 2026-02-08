import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SignupPage } from './signup.page';
import { AuthService } from '@app/core/services/auth.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';

describe('SignupPage', () => {
  let component: SignupPage;
  let fixture: ComponentFixture<SignupPage>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['signupAdmin']);

    await TestBed.configureTestingModule({
      imports: [SignupPage, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
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
    expect(component['signupForm'].valid).toBeFalse();
    
    component['signupForm'].patchValue({
      username: 'newadmin',
      password: 'SecurePassword123!',
      confirmPassword: 'SecurePassword123!',
      displayName: 'New Admin',
      allianceName: 'Test Alliance',
    });

    expect(component['signupForm'].valid).toBeTrue();
  });

  it('should validate password match', () => {
    component['signupForm'].patchValue({
      username: 'admin',
      password: 'Password123!',
      confirmPassword: 'Different123!',
      displayName: 'Admin',
      allianceName: 'Alliance',
    });

    expect(component['signupForm'].hasError('passwordMismatch')).toBeTrue();
  });
});
