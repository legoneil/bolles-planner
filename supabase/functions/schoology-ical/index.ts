// Supabase Edge Function: fetches a student's Schoology calendar (iCal)
// feed for the planner. Browsers can't read bolles.schoology.com links
// directly (Schoology doesn't send CORS headers), so the app asks this
// function instead.
//
// - Only signed-in planner users can call it.
// - It only fetches https://*.schoology.com links, including redirects.
// - It stores nothing; the calendar text goes straight back to the student.
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function → Via
// Editor, name it `schoology-ical`, paste this file, and turn OFF "Verify
// JWT" (this code checks the signed-in user itself, which also works with
// the new publishable keys). See docs/SUPABASE_SETUP.md.

const ALLOWED_ORIGINS = ['https://legoneil.github.io', 'http://localhost:4173'];
const MAX_BYTES = 5_000_000;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 3;

type Env = {
  supabaseUrl: string;
  apiKey?: string | null;
  fetch: typeof fetch;
};

const isSchoology = (u: URL) =>
  u.protocol === 'https:' &&
  (u.hostname === 'schoology.com' || u.hostname.endsWith('.schoology.com')) &&
  !u.username &&
  !u.password &&
  u.port === '';

async function readLimited(res: Response, max: number): Promise<string | null> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export async function handle(req: Request, env: Env): Promise<Response> {
  const origin = req.headers.get('origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });

  // Signed-in students only: ask Supabase Auth who this token belongs to.
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const apiKey = req.headers.get('apikey') ?? env.apiKey;
  if (!token || !apiKey) return json(401, { error: 'Sign in to sync Schoology.' });
  const who = await env.fetch(`${env.supabaseUrl}/auth/v1/user`, {
    headers: { apikey: apiKey, Authorization: `Bearer ${token}` },
  });
  if (!who.ok) return json(401, { error: 'Sign in to sync Schoology.' });

  let target: URL;
  try {
    const body = await req.json();
    target = new URL(String(body?.url ?? '').trim().replace(/^webcal:\/\//i, 'https://'));
  } catch {
    return json(400, { error: 'Paste your Schoology calendar link.' });
  }
  if (!isSchoology(target)) return json(400, { error: 'That isn’t a Schoology link.' });

  // Follow redirects by hand so they can't lead away from Schoology.
  let res: Response;
  for (let hops = 0; ; hops++) {
    try {
      res = await env.fetch(target, {
        redirect: 'manual',
        headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      return json(504, { error: 'Schoology didn’t respond. Try again in a minute.' });
    }
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      target = new URL(location, target);
      if (hops >= MAX_REDIRECTS || !isSchoology(target)) return json(502, { error: 'Schoology sent us somewhere unexpected. Check the link.' });
      continue;
    }
    break;
  }
  if (!res.ok) return json(502, { error: `Schoology answered ${res.status}. Check that the link is your current calendar link.` });

  const text = await readLimited(res, MAX_BYTES);
  if (text === null) return json(413, { error: 'That calendar is too large.' });
  if (!text.includes('BEGIN:VCALENDAR')) {
    return json(502, { error: 'That link didn’t return a calendar. Copy the calendar export (iCal) link from Schoology.' });
  }
  return new Response(text, {
    headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const deno = (globalThis as any).Deno;
if (deno) {
  deno.serve((req: Request) =>
    handle(req, { supabaseUrl: deno.env.get('SUPABASE_URL'), apiKey: deno.env.get('SUPABASE_ANON_KEY'), fetch }),
  );
}
