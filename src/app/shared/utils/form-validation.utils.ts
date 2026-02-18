/**
 * Form Validation Utilities
 * Helper functions for form error handling with i18n
 */

import { AbstractControl, FormGroup, ValidationErrors } from '@angular/forms';
import { Signal, signal, computed, DestroyRef } from '@angular/core';
import { toSignal, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { merge } from 'rxjs';

/**
 * Get translated error message key for a form control
 * Returns empty string if no errors or control not touched/dirty
 * @param control - The form control to check
 * @param showAll - If true, shows errors even if control is pristine and untouched (useful after form submit)
 */
export function getFormControlError(control: AbstractControl | null, showAll = false): string {
  if (!control || !control.errors) {
    return '';
  }

  // Show errors only if control is touched, dirty, or showAll is true
  if (!showAll && !control.touched && !control.dirty) {
    return '';
  }

  // Check common validators
  if (control.errors['required']) {
    return 'auth.errors.required';
  }

  if (control.errors['minlength']) {
    return 'auth.errors.minLength';
  }

  if (control.errors['maxlength']) {
    return 'auth.errors.maxLength';
  }

  if (control.errors['email']) {
    return 'auth.errors.invalidEmail';
  }

  if (control.errors['pattern']) {
    return 'auth.errors.invalidFormat';
  }

  if (control.errors['passwordMismatch']) {
    return 'auth.errors.passwordMismatch';
  }

  // Default unknown error
  return 'auth.errors.invalidFormat';
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
 * Creates a reactive error signal for a form field
 * This creates a signal that automatically updates when the form control state changes
 *
 * @param form - The FormGroup containing the field
 * @param fieldName - The name of the field to validate
 * @param destroyRef - DestroyRef for automatic cleanup when component is destroyed
 * @param formSubmitted - Optional signal to force showing errors after form submission
 * @returns A signal that returns the error message key or empty string
 *
 * @example
 * // Simple usage
 * protected readonly usernameError = createFieldErrorSignal(
 *   this.form,
 *   'username',
 *   this.destroyRef
 * );
 *
 * @example
 * // With form submitted state
 * protected readonly formSubmitted = signal(false);
 * protected readonly usernameError = createFieldErrorSignal(
 *   this.form,
 *   'username',
 *   this.destroyRef,
 *   this.formSubmitted
 * );
 */
export function createFieldErrorSignal(
  form: FormGroup,
  fieldName: string,
  destroyRef: DestroyRef,
  formSubmitted?: Signal<boolean>
): Signal<string> {
  const control = form.get(fieldName);

  if (!control) {
    return signal('').asReadonly();
  }

  // Convert control changes to signal with automatic cleanup
  const controlChanges = toSignal(
    merge(control.valueChanges, control.statusChanges).pipe(
      takeUntilDestroyed(destroyRef)
    ),
    { initialValue: control.value }
  );

  // Compute error message based on control state and changes
  return computed(() => {
    // Trigger recomputation when control changes
    controlChanges();

    const showAll = formSubmitted?.() ?? false;
    return getFormControlError(control, showAll);
  });
}
