// Supabase Edge Function: discord-submit
// ---------------------------------------------------------------------------
// The ONLY endpoint the Discord bot calls. It holds no DB credentials of its own
// in the bot — the bot sends a shared secret (x-bot-secret); this function runs
// inside Supabase with the service role (auto-injected as SUPABASE_SERVICE_ROLE_KEY)
// and forwards to the SECURITY DEFINER RPCs from migration 44. All validation +
// point math live in Postgres; this is a thin, authenticated proxy.
//
// Actions (JSON body { action, ... }):
//   submit         → submit_activity_for_discord(discord_id, activity, rank, week_date)
//   open_weeks     → discord_open_weeks(discord_id)              [autocomplete]
//   week_activities→ discord_week_activities(week_date)          [autocomplete]
//
// Env (set via `supabase secrets set`):
//   DISCORD_BOT_SECRET          — shared secret the bot must present
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — auto-provided by the platform
// ---------------------------------------------------------------------------
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BOT_SECRET = Deno.env.get('DISCORD_BOT_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ ok: false, reason: 'method_not_allowed' }, 405);
  }

  // Constant-ish shared-secret gate. Reject anything without the bot secret.
  const presented = req.headers.get('x-bot-secret') ?? '';
  if (!BOT_SECRET || presented !== BOT_SECRET) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, reason: 'bad_json' }, 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const action = String(payload.action ?? '');
  try {
    if (action === 'submit') {
      const { data, error } = await supabase.rpc('submit_activity_for_discord', {
        p_discord_id: String(payload.discord_id ?? ''),
        p_activity: String(payload.activity ?? ''),
        p_rank: payload.rank == null ? null : Number(payload.rank),
        p_week_date: String(payload.week_date ?? ''),
      });
      if (error) return json({ ok: false, reason: 'rpc_error', message: error.message }, 500);
      return json(data);
    }

    if (action === 'open_weeks') {
      const { data, error } = await supabase.rpc('discord_open_weeks', {
        p_discord_id: String(payload.discord_id ?? ''),
      });
      if (error) return json({ ok: false, reason: 'rpc_error', message: error.message }, 500);
      return json(data);
    }

    if (action === 'week_activities') {
      const { data, error } = await supabase.rpc('discord_week_activities', {
        p_week_date: String(payload.week_date ?? ''),
      });
      if (error) return json({ ok: false, reason: 'rpc_error', message: error.message }, 500);
      return json(data);
    }

    return json({ ok: false, reason: 'unknown_action' }, 400);
  } catch (e) {
    return json({ ok: false, reason: 'error', message: (e as Error).message }, 500);
  }
});
