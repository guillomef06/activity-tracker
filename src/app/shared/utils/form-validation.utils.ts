/**
 * Form Validation Utilities
 * Signal Forms (`@angular/forms/signals`) validators plus i18n error-key mapping.
 *
 * `createFieldValidSignal`/`createFieldErrorSignal` from the Reactive Forms version of this
 * file are gone: Signal Forms field state (`field().touched()`, `field().errors()`,
 * `field().valid()`) is already signal-based, so consumers read it directly instead of
 * wrapping a control in a derived signal.
 */

import { Signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { SchemaPath, validate, validateAsync } from '@angular/forms/signals';
import { Observable, catchError, of, switchMap, timer } from 'rxjs';

/** Async username checks only fire once typing pauses, to avoid flooding the backend. */
const USERNAME_AVAILABILITY_DEBOUNCE_MS = 500;

const DEFAULT_ERROR_KEYS: Record<string, string> = {
  required: 'errors.required',
  minLength: 'errors.minLength',
  maxLength: 'errors.maxLength',
  min: 'errors.min',
  max: 'errors.max',
  email: 'errors.email',
  pattern: 'errors.pattern',
  // eslint-disable-next-line sonarjs/no-hardcoded-passwords -- i18n translation key, not a credential
  passwordMismatch: 'errors.passwordMismatch',
  usernameTaken: 'auth.errors.usernameExists',
};

/**
 * A Signal Forms validation error, duck-typed against `ValidationError` — only `kind` is
 * needed for the i18n mapping, so consumers can pass `field().errors()` as-is.
 */
export interface FieldValidationError {
  readonly kind: string;
  readonly message?: string;
}

/**
 * Maps the first error of a Signal Forms field's `errors()` array to an i18n key.
 * Returns an empty string when there are no errors — callers gate visibility themselves
 * via `field().touched()` / `field().dirty()`, which are already signals in Signal Forms.
 * @param errors - The field's current `errors()` signal value
 * @param customErrorKeys - Optional map to override or extend default kind → translation key mappings
 */
export function getFieldErrorKey(
  errors: readonly FieldValidationError[],
  customErrorKeys: Record<string, string> = {}
): string {
  if (errors.length === 0) {
    return '';
  }

  const errorMap = { ...DEFAULT_ERROR_KEYS, ...customErrorKeys };
  return errorMap[errors[0].kind] ?? 'errors.pattern';
}

/**
 * Registers async username-availability validation on a Signal Forms schema path.
 * Call from within a `form()` schema function, e.g. `validateUsernameAvailable(path.username, checkFn)`.
 * Skips the check for empty/blank values — pair with `required()` for that case.
 *
 * Debounce note: `validateAsync`'s own `debounce` option wraps `params` through
 * `@angular/core`'s `debounced()`, which only delays *subsequent* changes — its first
 * value is emitted synchronously (see `debounced()` in `@angular/core`, `computation:
 * (res, previous) => previous !== undefined ? previous.value : ...`), so the very first
 * keystroke would still trigger `checkFn` immediately. The debounce is applied manually
 * here instead, via `timer()` inside the `rxResource` stream: every params change aborts
 * the in-flight `rxResource` request (and its `timer` subscription) before starting a new
 * one, so `checkFn` only ever fires once typing has paused for the full window.
 */
/**
 * Waits out the debounce window, then runs `checkFn`. A failed availability check is
 * treated as available rather than blocking submission.
 */
function checkUsernameAfterDebounce(
  checkFn: (username: string) => Observable<boolean>,
  username: string
): Observable<boolean> {
  return timer(USERNAME_AVAILABILITY_DEBOUNCE_MS).pipe(
    switchMap(() => checkFn(username).pipe(catchError(() => of(true))))
  );
}

export function validateUsernameAvailable(
  path: SchemaPath<string>,
  checkFn: (username: string) => Observable<boolean>
): void {
  validateAsync(path, {
    when: ({ value }) => value().trim().length > 0,
    params: ({ value }) => value().trim(),
    factory: (username: Signal<string | undefined>) =>
      rxResource({
        params: () => username(),
        stream: ({ params }) => (params === undefined ? of(true) : checkUsernameAfterDebounce(checkFn, params)),
      }),
    onSuccess: (available: boolean | undefined) => (available === false ? { kind: 'usernameTaken' } : null),
    // Unreachable in practice — the stream above already swallows checkFn errors as valid —
    // but validateAsync requires an onError handler.
    onError: () => null,
  });
}

/**
 * Registers a validator rejecting values that are not a strictly positive multiple of `multiple`.
 * Empty values are left to `required()` — this validator only checks the multiple.
 */
export function validateMultipleOf<TValue extends number | null>(
  path: SchemaPath<TValue>,
  multiple: number,
  options?: { message?: string }
): void {
  validate(path, ({ value }) => {
    const current = value();
    if (current === null || current === undefined) {
      return null;
    }

    return Number.isInteger(current) && current % multiple === 0
      ? null
      : { kind: 'multipleOf', message: options?.message };
  });
}

/**
 * Registers cross-field validation on `confirmPasswordPath`, failing when it does not
 * match `passwordPath`. Call from within a `form()` schema function, e.g.
 * `validatePasswordsMatch(path.password, path.confirmPassword)`.
 */
export function validatePasswordsMatch(
  passwordPath: SchemaPath<string>,
  confirmPasswordPath: SchemaPath<string>
): void {
  validate(confirmPasswordPath, ({ value, valueOf }) =>
    value() === valueOf(passwordPath) ? null : { kind: 'passwordMismatch' }
  );
}
