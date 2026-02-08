/**
 * Form Validation Utilities
 * Helper functions for form error handling with i18n
 */

import { AbstractControl, FormGroup, ValidationErrors } from '@angular/forms';
import { Signal, signal, effect } from '@angular/core';

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
 * @param formSubmitted - Optional signal to force showing errors after form submission
 * @returns A signal that returns the error message key or empty string
 * 
 * @example
 * // Simple usage
 * protected readonly usernameError = createFieldErrorSignal(this.form, 'username');
 * 
 * @example
 * // With form submitted state
 * protected readonly formSubmitted = signal(false);
 * protected readonly usernameError = createFieldErrorSignal(this.form, 'username', this.formSubmitted);
 */
export function createFieldErrorSignal(
  form: FormGroup, 
  fieldName: string,
  formSubmitted?: Signal<boolean>
): Signal<string> {
  const errorSignal = signal('');
  const control = form.get(fieldName);
  
  if (!control) {
    return errorSignal;
  }

  // Update signal when form state changes
  const updateError = () => {
    const showAll = formSubmitted?.() ?? false;
    errorSignal.set(getFormControlError(control, showAll));
  };

  // Listen to control changes
  control.valueChanges.subscribe(() => updateError());
  control.statusChanges.subscribe(() => updateError());
  
  // Initial update
  updateError();
  
  // If formSubmitted signal is provided, update when it changes
  if (formSubmitted) {
    effect(() => {
      if (formSubmitted()) {
        updateError();
      }
    });
  }

  return errorSignal.asReadonly();
}
