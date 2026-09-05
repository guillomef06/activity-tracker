/**
 * Generate a unique ID using timestamp and random string
 * Non-cryptographic use: only needs to avoid accidental collisions, not resist prediction.
 */
export function generateId(): string {
  // eslint-disable-next-line sonarjs/pseudo-random
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Create a user-friendly ID from a name
 * Converts "John Doe" to "john-doe"
 */
export function createUserIdFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Generate a short random ID (8 characters)
 * Non-cryptographic use: only needs to avoid accidental collisions, not resist prediction.
 */
export function generateShortId(): string {
  // eslint-disable-next-line sonarjs/pseudo-random
  return Math.random().toString(36).substring(2, 10);
}
