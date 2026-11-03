import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** The ONLY server e2e tests may ever write to (the Supabase project is shared with production). */
export const DEMO_SERVER_NAME = 'ERA008-DEMO';

/** Loads .env.e2e when present (local runs); in CI the variables come from the environment. */
export function loadE2eEnv(): void {
  const file = resolve(__dirname, '../../.env.e2e');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required e2e environment variable ${name} (see .env.e2e.example).`);
  return value;
}

/** Aborts the whole run unless the configured target server is exactly ERA008-DEMO. */
export function assertDemoServerConfigured(): void {
  const configured = process.env['E2E_SERVER_NAME'];
  if (configured !== DEMO_SERVER_NAME) {
    throw new Error(
      `E2E safety guard: E2E_SERVER_NAME must be "${DEMO_SERVER_NAME}" (got "${configured ?? ''}"). ` +
        'The Supabase project is shared with production; refusing to run.'
    );
  }
}
