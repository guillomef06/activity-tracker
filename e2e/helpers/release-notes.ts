import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';

interface StoredState {
  origins: { localStorage: { name: string; value: string }[] }[];
}

const SEEN_KEY = 'release-notes-seen-version';

/**
 * Fresh (session-less) contexts would get the "What's New" dialog after logging in, and it makes
 * the rest of the page inert. The auth setup already acknowledged it once; this copies ONLY that
 * "seen" flag (never the session) into a clean context before any page script runs.
 */
export async function acknowledgeReleaseNotes(page: Page): Promise<void> {
  const file = resolve(__dirname, '../.auth/admin.json');
  const state = JSON.parse(readFileSync(file, 'utf8')) as StoredState;
  const seen = state.origins.flatMap(o => o.localStorage).find(item => item.name === SEEN_KEY);
  if (!seen) return;
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [SEEN_KEY, seen.value]);
}
