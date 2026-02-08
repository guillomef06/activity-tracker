import { ComponentFixture, TestBed } from '@angular/core/testing';
import { JoinPage } from './join.page';
import { AuthService } from '@app/core/services/auth.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';

describe('JoinPage', () => {
  let component: JoinPage;
  let fixture: ComponentFixture<JoinPage>;

  beforeEach(async () => {
    const authServiceSpy = jasmine.createSpyObj('AuthService', ['joinWithInvitation']);

    await TestBed.configureTestingModule({
      imports: [JoinPage, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        provideRouter([]),
        provideHttpClient(),
        provideAnimations(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(JoinPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have a valid form with all required fields', () => {
    expect(component['joinForm'].valid).toBeFalse();
    
    component['joinForm'].patchValue({
      token: 'abc123',
      username: 'newmember',
      password: 'SecurePassword123!',
      confirmPassword: 'SecurePassword123!',
      displayName: 'New Member',
    });

    expect(component['joinForm'].valid).toBeTrue();
  });

  it('should validate password match', () => {
    component['joinForm'].patchValue({
      token: 'abc123',
      username: 'member',
      password: 'Password123!',
      confirmPassword: 'Different123!',
      displayName: 'Member',
    });

    expect(component['joinForm'].hasError('passwordMismatch')).toBeTrue();
  });
});
