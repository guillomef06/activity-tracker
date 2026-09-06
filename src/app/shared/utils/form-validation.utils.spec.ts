import { Injector, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, required } from '@angular/forms/signals';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import {
  getFieldErrorKey,
  validateMultipleOf,
  validatePasswordsMatch,
  validateUsernameAvailable,
} from './form-validation.utils';

/** Mirrors the debounce baked into `validateUsernameAvailable` so tests can fast-forward past it. */
const USERNAME_AVAILABILITY_DEBOUNCE_MS = 500;

describe('getFieldErrorKey', () => {
  it('should return an empty string when there are no errors', () => {
    // Arrange
    const errors: { kind: string }[] = [];

    // Act
    const result = getFieldErrorKey(errors);

    // Assert
    expect(result).toBe('');
  });

  it('should map a known built-in error kind to its i18n key', () => {
    // Arrange
    const errors = [{ kind: 'required' }];

    // Act
    const result = getFieldErrorKey(errors);

    // Assert
    expect(result).toBe('errors.required');
  });

  it('should map every default validator kind to its expected i18n key', () => {
    // Arrange
    const expectedMappings: Record<string, string> = {
      required: 'errors.required',
      minLength: 'errors.minLength',
      maxLength: 'errors.maxLength',
      min: 'errors.min',
      max: 'errors.max',
      email: 'errors.email',
      pattern: 'errors.pattern',
      passwordMismatch: 'errors.passwordMismatch',
      usernameTaken: 'auth.errors.usernameExists',
    };

    // Act & Assert
    for (const [kind, expectedKey] of Object.entries(expectedMappings)) {
      expect(getFieldErrorKey([{ kind }])).toBe(expectedKey);
    }
  });

  it('should fall back to the pattern key when the error kind is unknown', () => {
    // Arrange
    const errors = [{ kind: 'somethingUnmapped' }];

    // Act
    const result = getFieldErrorKey(errors);

    // Assert
    expect(result).toBe('errors.pattern');
  });

  it('should prefer a custom error key over the default mapping', () => {
    // Arrange
    const errors = [{ kind: 'min' }];

    // Act
    const result = getFieldErrorKey(errors, { min: 'invitations.errors.minDuration' });

    // Assert
    expect(result).toBe('invitations.errors.minDuration');
  });

  it('should only consider the first error when several are present', () => {
    // Arrange
    const errors = [{ kind: 'required' }, { kind: 'min' }];

    // Act
    const result = getFieldErrorKey(errors);

    // Assert
    expect(result).toBe('errors.required');
  });
});

describe('validateMultipleOf', () => {
  it('should be valid when the value is a strictly positive multiple', () => {
    // Arrange
    const model = signal({ legionSize: 10 });

    // Act
    const legionForm = form(
      model,
      path => {
        validateMultipleOf(path.legionSize, 5);
      },
      { injector: TestBed.inject(Injector) }
    );

    // Assert
    expect(legionForm.legionSize().valid()).toBe(true);
  });

  it('should be invalid when the value is not a multiple', () => {
    // Arrange
    const model = signal({ legionSize: 7 });

    // Act
    const legionForm = form(
      model,
      path => {
        validateMultipleOf(path.legionSize, 5);
      },
      { injector: TestBed.inject(Injector) }
    );

    // Assert
    expect(legionForm.legionSize().valid()).toBe(false);
    expect(legionForm.legionSize().errors()).toEqual([expect.objectContaining({ kind: 'multipleOf' })]);
  });

  it('should be valid when the value is null, deferring to required()', () => {
    // Arrange
    const model = signal<{ legionSize: number | null }>({ legionSize: null });

    // Act
    const legionForm = form(
      model,
      path => {
        validateMultipleOf(path.legionSize, 5);
      },
      { injector: TestBed.inject(Injector) }
    );

    // Assert
    expect(legionForm.legionSize().valid()).toBe(true);
  });

  it('should use a custom message when provided', () => {
    // Arrange
    const model = signal({ legionSize: 7 });

    // Act
    const legionForm = form(
      model,
      path => {
        validateMultipleOf(path.legionSize, 5, { message: 'Must be a multiple of 5' });
      },
      { injector: TestBed.inject(Injector) }
    );

    // Assert
    expect(legionForm.legionSize().errors()).toEqual([
      expect.objectContaining({ kind: 'multipleOf', message: 'Must be a multiple of 5' }),
    ]);
  });
});

describe('validatePasswordsMatch', () => {
  it('should be valid when password and confirmPassword match', () => {
    // Arrange
    const model = signal({ password: 'secret123', confirmPassword: 'secret123' });

    // Act
    const passwordForm = form(
      model,
      path => {
        validatePasswordsMatch(path.password, path.confirmPassword);
      },
      { injector: TestBed.inject(Injector) }
    );

    // Assert
    expect(passwordForm.confirmPassword().valid()).toBe(true);
  });

  it('should be invalid when confirmPassword does not match password', () => {
    // Arrange
    const model = signal({ password: 'secret123', confirmPassword: 'other' });

    // Act
    const passwordForm = form(
      model,
      path => {
        validatePasswordsMatch(path.password, path.confirmPassword);
      },
      { injector: TestBed.inject(Injector) }
    );

    // Assert
    expect(passwordForm.confirmPassword().valid()).toBe(false);
    expect(passwordForm.confirmPassword().errors()).toEqual([expect.objectContaining({ kind: 'passwordMismatch' })]);
  });

  it('should re-evaluate reactively when password changes after confirmPassword was set', () => {
    // Arrange
    const model = signal({ password: 'secret123', confirmPassword: 'secret123' });
    const passwordForm = form(
      model,
      path => {
        validatePasswordsMatch(path.password, path.confirmPassword);
      },
      { injector: TestBed.inject(Injector) }
    );
    expect(passwordForm.confirmPassword().valid()).toBe(true);

    // Act
    passwordForm.password().value.set('changed');

    // Assert
    expect(passwordForm.confirmPassword().valid()).toBe(false);
  });
});

describe('validateUsernameAvailable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not call checkFn for an empty username', async () => {
    // Arrange
    const model = signal({ username: '' });
    const checkFn = vi.fn(() => of(true));

    // Act
    form(
      model,
      path => {
        required(path.username);
        validateUsernameAvailable(path.username, checkFn);
      },
      { injector: TestBed.inject(Injector) }
    );
    await vi.runAllTimersAsync();

    // Assert
    expect(checkFn).not.toHaveBeenCalled();
  });

  it('should mark the field invalid when checkFn reports the username as taken', async () => {
    // Arrange
    const model = signal({ username: 'taken-user' });
    const checkFn = vi.fn(() => of(false));

    // Act
    const usernameForm = form(
      model,
      path => {
        validateUsernameAvailable(path.username, checkFn);
      },
      { injector: TestBed.inject(Injector) }
    );
    await vi.advanceTimersByTimeAsync(USERNAME_AVAILABILITY_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    // Assert
    expect(checkFn).toHaveBeenCalledWith('taken-user');
    expect(usernameForm.username().errors()).toEqual([expect.objectContaining({ kind: 'usernameTaken' })]);
  });

  it('should be valid when checkFn reports the username as available', async () => {
    // Arrange
    const model = signal({ username: 'free-user' });
    const checkFn = vi.fn(() => of(true));

    // Act
    const usernameForm = form(
      model,
      path => {
        validateUsernameAvailable(path.username, checkFn);
      },
      { injector: TestBed.inject(Injector) }
    );
    await vi.advanceTimersByTimeAsync(USERNAME_AVAILABILITY_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    // Assert
    expect(usernameForm.username().valid()).toBe(true);
  });

  it('should treat a failed availability check as valid rather than blocking submission', async () => {
    // Arrange
    const model = signal({ username: 'error-user' });
    const checkFn = vi.fn(() => throwError(() => new Error('network down')));

    // Act
    const usernameForm = form(
      model,
      path => {
        validateUsernameAvailable(path.username, checkFn);
      },
      { injector: TestBed.inject(Injector) }
    );
    await vi.advanceTimersByTimeAsync(USERNAME_AVAILABILITY_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    // Assert
    expect(usernameForm.username().valid()).toBe(true);
  });

  it('should not call checkFn before the debounce window has elapsed', async () => {
    // Arrange
    const model = signal({ username: 'typing-user' });
    const checkFn = vi.fn(() => of(true));

    // Act
    form(
      model,
      path => {
        validateUsernameAvailable(path.username, checkFn);
      },
      { injector: TestBed.inject(Injector) }
    );
    await vi.advanceTimersByTimeAsync(USERNAME_AVAILABILITY_DEBOUNCE_MS - 1);

    // Assert
    expect(checkFn).not.toHaveBeenCalled();
  });

  it('should reset the debounce timer and only check the final value when the username keeps changing', async () => {
    // Arrange
    const model = signal({ username: 'a' });
    const checkFn = vi.fn(() => of(true));
    form(
      model,
      path => {
        validateUsernameAvailable(path.username, checkFn);
      },
      { injector: TestBed.inject(Injector) }
    );

    // Act — simulate rapid typing, each keystroke landing before the previous debounce elapses
    model.set({ username: 'ab' });
    await vi.advanceTimersByTimeAsync(USERNAME_AVAILABILITY_DEBOUNCE_MS - 1);
    model.set({ username: 'abc' });
    await vi.advanceTimersByTimeAsync(USERNAME_AVAILABILITY_DEBOUNCE_MS - 1);
    model.set({ username: 'abcd' });
    await vi.advanceTimersByTimeAsync(USERNAME_AVAILABILITY_DEBOUNCE_MS);
    await vi.runAllTimersAsync();

    // Assert — only the final, settled value triggers a check, and only once
    expect(checkFn).toHaveBeenCalledTimes(1);
    expect(checkFn).toHaveBeenCalledWith('abcd');
  });
});
