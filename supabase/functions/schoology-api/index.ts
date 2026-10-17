// Supabase Edge Function: "Connect Schoology" for Bolles Planner.
//
// Schoology's API uses OAuth 1.0a. The app's consumer key and secret live
// only here (Edge Function secrets SCHOOLOGY_CONSUMER_KEY and
// SCHOOLOGY_CONSUMER_SECRET). A student approves the app on Schoology's own
// site; their personal access token is handed back to them and saved in
// their private planner. It is useless without the consumer secret, so the
// function never stores anything itself.
//
// Actions (POST JSON, signed-in planner users only):
//   start  {callback}                         -> {authorizeUrl, requestToken, requestSecret}
//   finish {requestToken, requestSecret}      -> {accessToken, accessSecret, user}
//   sync   {accessToken, accessSecret}        -> {user, sections, assignments, grades}
//
// Deploy: Edge Functions → Deploy a new function → Via Editor, name it
// `schoology-api`, paste this file, turn OFF "Verify JWT". Add the two
// secrets under Edge Functions → Secrets. See docs/SUPABASE_SETUP.md.

const ALLOWED_ORIGINS = ['https://legoneil.github.io', 'http://localhost:4173'];
const API = 'https://api.schoology.com/v1';
const SCHOOL_DOMAIN = 'bolles.schoology.com';
const TIMEOUT_MS = 20_000;

type Env = {
  supabaseUrl: string;
  apiKey?: string | null;
  consumerKey?: string | null;
  consumerSecret?: string | null;
  fetch: typeof fetch;
  now?: () => number;
  nonce?: () => string;
};

// ---------------------------------------------------------------------------
// OAuth 1.0a (RFC 5849), HMAC-SHA1

export const pct = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

async function hmacSha1(key: string, text: string): Promise<string> {
  const enc = new TextEncoder();
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
  let bin = '';
  for (const b of sig) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function oauthSignature(
  method: string,
  url: string,
  params: Record<string, string>,
  consumerSecret: string,
  tokenSecret = '',
): Promise<string> {
  const u = new URL(url);
  const all: [string, string][] = [...u.searchParams.entries(), ...Object.entries(params)];
  const normalized = all
    .map(([k, v]) => [pct(k), pct(v)])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const base = `${method.toUpperCase()}&${pct(`${u.origin}${u.pathname}`)}&${pct(normalized)}`;
  return hmacSha1(`${pct(consumerSecret)}&${pct(tokenSecret)}`, base);
}

async function authHeader(env: Env, method: string, url: string, token?: { key: string; secret: string }, extra: Record<string, string> = {}) {
  const params: Record<string, string> = {
    oauth_consumer_key: env.consumerKey!,
    oauth_nonce: env.nonce?.() ?? crypto.randomUUID().replace(/-/g, ''),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor((env.now?.() ?? Date.now()) / 1000)),
    oauth_version: '1.0',
    ...extra,
  };
  if (token) params.oauth_token = token.key;
  params.oauth_signature = await oauthSignature(method, url, params, env.consumerSecret!, token?.secret ?? '');
  return `OAuth realm="Schoology API", ${Object.entries(params)
    .map(([k, v]) => `${pct(k)}="${pct(v)}"`)
    .join(', ')}`;
}

class SchoologyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// Signed GET; follows Schoology's redirects (e.g. /users/me) by re-signing.
async function signedGet(env: Env, url: string, token?: { key: string; secret: string }): Promise<Response> {
  let target = url;
  for (let hops = 0; hops <= 3; hops++) {
    const res = await env.fetch(target, {
      method: 'GET',
      redirect: 'manual',
      headers: { Authorization: await authHeader(env, 'GET', target, token), Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      const next = new URL(location, target);
      if (next.hostname !== 'api.schoology.com') throw new SchoologyError(502, 'Schoology redirected somewhere unexpected.');
      target = next.toString();
      continue;
    }
    if (res.status === 401 || res.status === 403) throw new SchoologyError(401, 'Schoology turned down the request. Try disconnecting and connecting again.');
    if (res.status === 429) throw new SchoologyError(429, 'Schoology is busy. Try again in a minute.');
    if (!res.ok) throw new SchoologyError(502, `Schoology answered ${res.status}.`);
    return res;
  }
  throw new SchoologyError(502, 'Too many redirects from Schoology.');
}

const getJson = async (env: Env, path: string, token: { key: string; secret: string }) =>
  (await signedGet(env, `${API}${path}`, token)).json();

const parseForm = (text: string) => Object.fromEntries(new URLSearchParams(text));

// ---------------------------------------------------------------------------
// Data

const arr = (x: unknown): any[] => (Array.isArray(x) ? x : x ? [x] : []);
const num = (x: unknown) => (x === null || x === undefined || x === '' ? null : Number(x));

// "2026-10-22 23:59:00" -> { date, time }
const splitDue = (due: unknown) => {
  const m = String(due ?? '').match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
  if (!m) return { date: null, time: null };
  return { date: m[1], time: m[2] && m[2] !== '00:00' ? m[2] : null };
};

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

async function syncData(env: Env, token: { key: string; secret: string }) {
  const me = await getJson(env, '/users/me', token);
  const uid = String(me.id ?? me.uid);
  const user = { id: uid, name: me.name_display ?? [me.name_first, me.name_last].filter(Boolean).join(' ') };

  const sectionsRaw = arr((await getJson(env, `/users/${uid}/sections`, token)).section);
  const sections = sectionsRaw.map((s) => ({
    id: String(s.id),
    course: s.course_title ?? '',
    section: s.section_title ?? '',
  }));

  const perSection = await mapLimit(sections, 3, async (s) => {
    const [a, e] = await Promise.all([
      getJson(env, `/sections/${s.id}/assignments?start=0&limit=200`, token).catch(() => ({})),
      getJson(env, `/sections/${s.id}/events?start=0&limit=200`, token).catch(() => ({})),
    ]);
    const assignments = arr(a.assignment).map((x) => ({
      id: `a${x.id}`,
      sectionId: s.id,
      title: String(x.title ?? '').trim(),
      ...splitDue(x.due),
      kind: String(x.type ?? 'assignment'),
      maxPoints: num(x.max_points),
      url: x.web_url ?? null,
      description: String(x.description ?? '').slice(0, 2000),
    }));
    // Events tied to an assignment are duplicates of it.
    const events = arr(e.event)
      .filter((x) => !x.assignment_id || x.type === 'event')
      .map((x) => ({
        id: `e${x.id}`,
        sectionId: s.id,
        title: String(x.title ?? '').trim(),
        ...splitDue(x.start),
        kind: 'event',
        maxPoints: null,
        url: x.web_url ?? null,
        description: String(x.description ?? '').slice(0, 2000),
      }));
    return [...assignments, ...events].filter((x) => x.title && x.date);
  });

  const gradesRaw = arr((await getJson(env, `/users/${uid}/grades`, token).catch(() => ({}))).section);
  const grades = gradesRaw.map((g) => ({
    sectionId: String(g.section_id),
    periods: arr(g.period).map((p) => ({
      id: String(p.period_id ?? ''),
      title: p.period_title ?? '',
      assignments: arr(p.assignment).map((x) => ({
        assignmentId: `a${x.assignment_id}`,
        grade: num(x.grade),
        maxPoints: num(x.max_points),
        exception: num(x.exception) ?? 0,
      })),
    })),
    final: arr(g.final_grade).map((f) => ({ periodId: String(f.period_id ?? ''), grade: num(f.grade) })),
  }));

  return { user, sections, assignments: perSection.flat(), grades };
}

// ---------------------------------------------------------------------------

export async function handle(req: Request, env: Env): Promise<Response> {
  const origin = req.headers.get('origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  if (!env.consumerKey || !env.consumerSecret) return json(503, { error: 'Connect Schoology isn’t set up yet.' });

  // Signed-in planner users only, so nobody else can use our Schoology key.
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const apiKey = req.headers.get('apikey') ?? env.apiKey;
  if (!token || !apiKey) return json(401, { error: 'Sign in first.' });
  const who = await env.fetch(`${env.supabaseUrl}/auth/v1/user`, { headers: { apikey: apiKey, Authorization: `Bearer ${token}` } });
  if (!who.ok) return json(401, { error: 'Sign in first.' });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Bad request.' });
  }

  try {
    if (body.action === 'start') {
      const callback = String(body.callback ?? '');
      if (!ALLOWED_ORIGINS.some((o) => callback.startsWith(`${o}/`))) return json(400, { error: 'Bad callback.' });
      const res = await signedGet(env, `${API}/oauth/request_token`);
      const t = parseForm(await res.text());
      if (!t.oauth_token || !t.oauth_token_secret) return json(502, { error: 'Schoology didn’t start the connection.' });
      // The request secret rides along in our own callback URL so the planner
      // can finish even if the phone reopens it in a different browser
      // window. It is short-lived and useless without the consumer secret.
      const back = new URL(callback);
      back.searchParams.set('rs', t.oauth_token_secret);
      const authorizeUrl = `https://${SCHOOL_DOMAIN}/oauth/authorize?oauth_token=${pct(t.oauth_token)}&oauth_callback=${pct(back.toString())}`;
      return json(200, { authorizeUrl, requestToken: t.oauth_token, requestSecret: t.oauth_token_secret });
    }

    if (body.action === 'finish') {
      const request = { key: String(body.requestToken ?? ''), secret: String(body.requestSecret ?? '') };
      if (!request.key || !request.secret) return json(400, { error: 'Bad request.' });
      const res = await signedGet(env, `${API}/oauth/access_token`, request);
      const t = parseForm(await res.text());
      if (!t.oauth_token || !t.oauth_token_secret) return json(502, { error: 'Schoology didn’t finish the connection. Try again.' });
      const access = { key: t.oauth_token, secret: t.oauth_token_secret };
      const me = await getJson(env, '/users/me', access);
      return json(200, {
        accessToken: access.key,
        accessSecret: access.secret,
        user: { id: String(me.id ?? me.uid), name: me.name_display ?? [me.name_first, me.name_last].filter(Boolean).join(' ') },
      });
    }

    if (body.action === 'sync') {
      const access = { key: String(body.accessToken ?? ''), secret: String(body.accessSecret ?? '') };
      if (!access.key || !access.secret) return json(400, { error: 'Not connected.' });
      return json(200, await syncData(env, access));
    }
  } catch (e) {
    if (e instanceof SchoologyError) return json(e.status, { error: e.message });
    return json(502, { error: 'Couldn’t reach Schoology. Try again in a minute.' });
  }
  return json(400, { error: 'Unknown action.' });
}

const deno = (globalThis as any).Deno;
if (deno) {
  deno.serve((req: Request) =>
    handle(req, {
      supabaseUrl: deno.env.get('SUPABASE_URL'),
      apiKey: deno.env.get('SUPABASE_ANON_KEY'),
      consumerKey: deno.env.get('SCHOOLOGY_CONSUMER_KEY'),
      consumerSecret: deno.env.get('SCHOOLOGY_CONSUMER_SECRET'),
      fetch,
    }),
  );
}
