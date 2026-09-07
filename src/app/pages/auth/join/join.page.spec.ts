import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { JoinPage } from './join.page';
import { AuthService } from '@app/core/services/auth.service';
import { ServerService } from '@app/core/services/server.service';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { TranslateModule } from '@ngx-translate/core';
import { provideZonelessChangeDetection } from '@angular/core';

describe('JoinPage', () => {
  let component: JoinPage;
  let fixture: ComponentFixture<JoinPage>;

  beforeEach(async () => {
    const authServiceSpy = {
      signUpMember: vi.fn(),
      checkUsernameAvailable: vi.fn().mockResolvedValue(true),
    };
    const serverServiceSpy = {
      validateInvitation: vi.fn().mockResolvedValue({ valid: false, error: 'auth.errors.invalidToken' }),
    };

    await TestBed.configureTestingModule({
      imports: [JoinPage, TranslateModule.forRoot()],
      providers: [
        { provide: AuthService, useValue: authServiceSpy },
        { provide: ServerService, useValue: serverServiceSpy },
        provideRouter([]),
        provideHttpClient(withXhr()),
        provideAnimations(),
        provideZonelessChangeDetection(),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(JoinPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const fillValidForm = (): void => {
    component['joinModel'].set({
      token: 'abc123',
      username: 'newmember',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      displayName: 'New Member',
      recoveryQuestionId: 2,
      recoveryAnswer: 'Paris',
    });
  };

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should be invalid when all fields are empty', () => {
    expect(component['joinForm']().valid()).toBe(false);
  });

  it('should become valid once all fields are filled correctly', async () => {
    fillValidForm();

    await vi.waitFor(() => {
      expect(component['joinForm']().pending()).toBe(false);
    });

    expect(component['joinForm']().invalid()).toBe(false);
  });

  it('should be invalid without recovery question and answer', () => {
    component['joinModel'].set({
      token: 'abc123',
      username: 'newmember',
      password: 'SecurePassword123',
      confirmPassword: 'SecurePassword123',
      displayName: 'New Member',
      recoveryQuestionId: null,
      recoveryAnswer: '',
    });

    expect(component['joinForm']().valid()).toBe(false);
  });

  it('should flag a password/confirmPassword mismatch', () => {
    component['joinModel'].set({
      token: 'abc123',
      username: 'member',
      password: 'Password123',
      confirmPassword: 'Different123',
      displayName: 'Member',
      recoveryQuestionId: 1,
      recoveryAnswer: 'Fluffy',
    });

    expect(
      component['joinForm']
        .confirmPassword()
        .errors()
        .some(error => error.kind === 'passwordMismatch')
    ).toBe(true);
  });

  it('should require a token of at least 6 characters', () => {
    component['joinModel'].update(value => ({ ...value, token: 'abc' }));

    expect(
      component['joinForm']
        .token()
        .errors()
        .some(error => error.kind === 'minLength')
    ).toBe(true);
  });

  it('should set serverName when validateToken resolves a valid invitation', async () => {
    const serverServiceSpy = TestBed.inject(ServerService) as unknown as {
      validateInvitation: ReturnType<typeof vi.fn>;
    };
    serverServiceSpy.validateInvitation.mockResolvedValue({ valid: true, server: { name: 'My Server' } });

    await component['validateToken']('abc123');

    expect(component['serverName']()).toBe('My Server');
    expect(component['invitationToken']()).toBe('abc123');
  });

  it('should clear serverName when validateToken resolves an invalid invitation', async () => {
    await component['validateToken']('abc123');

    expect(component['serverName']()).toBeNull();
    expect(component['errorMessage']()).toBe('auth.errors.invalidToken');
  });

  it('should not submit and should mark fields as touched when the form is invalid', async () => {
    const submitEvent = new Event('submit');
    const preventDefaultSpy = vi.spyOn(submitEvent, 'preventDefault');

    await component['onSubmit'](submitEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(component['joinForm'].username().touched()).toBe(true);
  });
});
