import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { assertDemoServerConfigured, DEMO_SERVER_NAME, requireEnv } from './env';

export interface DemoSession {
  client: SupabaseClient;
  serverId: string;
  userId: string;
}

/** Reads the public Supabase URL / anon key the app itself ships with (never a service-role key). */
function publicSupabaseConfig(): { url: string; anonKey: string } {
  const source = readFileSync(resolve(__dirname, '../../src/environments/environment.ts'), 'utf8');
  const url = /url:\s*'([^']+)'/.exec(source)?.[1];
  const anonKey = /anon[A-Za-z]*:\s*'([^']+)'/.exec(source)?.[1];
  if (!url || !anonKey) throw new Error('Could not read the public Supabase config from environment.ts');
  return { url, anonKey };
}

/**
 * Signs in as e2e_admin through the regular authenticated API and refuses to return unless the
 * account belongs to ERA008-DEMO. Every e2e write path must go through this single guard
 * (RLS then also restricts the session to that server).
 */
export async function openDemoSession(): Promise<DemoSession> {
  assertDemoServerConfigured();
  const { url, anonKey } = publicSupabaseConfig();
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const username = requireEnv('E2E_USERNAME');
  const { error } = await client.auth.signInWithPassword({
    email: `${username}@app.tracker`,
    password: requireEnv('E2E_PASSWORD'),
  });
  if (error) throw new Error(`e2e login failed: ${error.message}`);

  const { data: profile, error: profileError } = await client
    .from('user_profiles')
    .select('id, server_id, servers(name)')
    .eq('username', username)
    .single();
  if (profileError || !profile) throw new Error('Could not load the e2e profile');
  const serverName = (profile.servers as unknown as { name: string } | null)?.name;
  if (serverName !== DEMO_SERVER_NAME) {
    throw new Error(`E2E safety guard: e2e account belongs to "${serverName}", not ${DEMO_SERVER_NAME}. Aborting.`);
  }
  return { client, serverId: profile.server_id as string, userId: profile.id as string };
}
