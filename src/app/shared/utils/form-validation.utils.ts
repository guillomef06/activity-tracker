/**
 * Form Validation Utilities
 * Helper functions for form error handling with i18n
 */

import { AbstractControl, AsyncValidatorFn, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';
import { Signal, signal, computed, DestroyRef } from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge, Observable, timer, switchMap, map, catchError, of, first } from 'rxjs';

const DEFAULT_ERROR_KEYS: Record<string, string> = {
  required: 'errors.required',
  minlength: 'errors.minLength',
  maxlength: 'errors.maxLength',
  min: 'errors.min',
  max: 'errors.max',
  email: 'errors.email',
  pattern: 'errors.pattern',
  passwordMismatch: 'errors.passwordMismatch',
  usernameTaken: 'auth.errors.usernameExists',
};

/**
 * Get translated error message key for a form control
 * Returns empty string if no errors or control not touched/dirty
 * @param control - The form control to check
 * @param showAll - If true, shows errors even if control is pristine and untouched (useful after form submit)
 * @param customErrorKeys - Optional map to override or extend default validator → translation key mappings
 */
export function getFormControlError(
  control: AbstractControl | null,
  showAll = false,
  customErrorKeys: Record<string, string> = {}
): string {
  if (!control || !control.errors) {
    return '';
  }

  if (!showAll && !control.touched && !control.dirty) {
    return '';
  }

  const errorMap = { ...DEFAULT_ERROR_KEYS, ...customErrorKeys };
  const firstErrorKey = Object.keys(control.errors)[0];
  return errorMap[firstErrorKey] ?? 'errors.pattern';
}

/**
 * Async validator factory that checks username availability via a provided check function.
 * Debounces 500ms to avoid flooding the backend on every keystroke.
 */
export function usernameAvailableValidator(checkFn: (username: string) => Observable<boolean>): AsyncValidatorFn {
  return (control: AbstractControl): Observable<ValidationErrors | null> => {
    const value = control.value?.trim();
    if (!value) return of(null);
    return timer(500).pipe(
      switchMap(() => checkFn(value)),
      map(available => (available ? null : { usernameTaken: true })),
      catchError(() => of(null)),
      first()
    );
  };
}

/**
 * Validator factory rejecting values that are not a strictly positive multiple of `multiple`.
 * Emits a `multipleOf` error (with the required multiple) when the value fails the check.
 * Empty values are left to `Validators.required` — this validator only checks the multiple.
 */
export function multipleOfValidator(multiple: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (value === null || value === undefined || value === '') return null;
    return Number.isInteger(value) && value % multiple === 0 ? null : { multipleOf: { multiple } };
  };
}

/**
 * Password match validator
 * Validates that password and confirmPassword fields match
 */
export function passwordMatchValidator(form: FormGroup): ValidationErrors | null {
  const password = form.get('password')?.value;
  const confirmPassword = form.get('confirmPassword')?.value;

  if (password !== confirmPassword) {
    form.get('confirmPassword')?.setErrors({ passwordMismatch: true });
    return { passwordMismatch: true };
  }

  return null;
}

/**
 * Creates a reactive boolean signal that is true when a form field is valid and dirty.
 * Useful for showing success indicators (e.g. green border) when a field is correctly filled.
 */
export function createFieldValidSignal(form: FormGroup, fieldName: string, destroyRef: DestroyRef): Signal<boolean> {
  const control = form.get(fieldName);
  if (!control) return signal(false).asReadonly();

  const controlChanges = toSignal(
    merge(control.valueChanges, control.statusChanges).pipe(takeUntilDestroyed(destroyRef)),
    { initialValue: control.value }
  );

  return computed(() => {
    controlChanges();
    return control.valid && control.dirty;
  });
}

/**
 * Creates a reactive error signal for a form field.
 * Automatically maps Angular validator error names to i18n translation keys.
 *
 * @param form - The FormGroup containing the field
 * @param fieldName - The name of the field to validate
 * @param destroyRef - DestroyRef for automatic cleanup when component is destroyed
 * @param formSubmitted - Optional signal to force showing errors after form submission
 * @param customErrorKeys - Optional map to override or extend default validator → translation key mappings
 * @returns A readonly signal that returns a translation key, or empty string when valid
 *
 * @example
 * // Simple usage — uses default error key mapping
 * protected readonly emailError = createFieldErrorSignal(this.form, 'email', this.destroyRef);
 *
 * @example
 * // With custom keys for specific validators
 * protected readonly durationError = createFieldErrorSignal(
 *   this.form, 'durationDays', this.destroyRef, undefined,
 *   { min: 'invitations.errors.minDuration', max: 'invitations.errors.maxDuration' }
 * );
 */
export function createFieldErrorSignal(
  form: FormGroup,
  fieldName: string,
  destroyRef: DestroyRef,
  formSubmitted?: Signal<boolean>,
  customErrorKeys: Record<string, string> = {}
): Signal<string> {
  const control = form.get(fieldName);

  if (!control) {
    return signal('').asReadonly();
  }

  const controlChanges = toSignal(
    merge(control.valueChanges, control.statusChanges).pipe(takeUntilDestroyed(destroyRef)),
    { initialValue: control.value }
  );

  return computed(() => {
    controlChanges();
    const showAll = formSubmitted?.() ?? false;
    return getFormControlError(control, showAll, customErrorKeys);
  });
}
