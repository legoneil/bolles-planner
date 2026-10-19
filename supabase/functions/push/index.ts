// Supabase Edge Function: sends Bolles Planner reminders as push notifications.
//
// - Every few minutes the scheduler (supabase/push-cron.sql) calls it with
//   {action: "send"}; it sends every reminder that's due and marks it sent.
// - The app calls {action: "public-key"} to get the key browsers need to
//   subscribe, and {action: "test"} for "Send a test notification".
//
// Push keys are made automatically the first time and kept in the
// push_config table, which only the server can read. Messages are encrypted
// for each device (Web Push, RFC 8291), using only built-in WebCrypto.
//
// Deploy: Supabase dashboard → Edge Functions → Deploy a new function → Via
// Editor, name it `push`, paste this file, and turn OFF "Verify JWT". Then run
// supabase/push-cron.sql. See docs/SUPABASE_SETUP.md.

const ALLOWED_ORIGINS = ['https://legoneil.github.io', 'http://localhost:4173'];
const SUBJECT = 'mailto:bollesplanner@gmail.com';
const PUSH_HOSTS =
  /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;

type Env = {
  supabaseUrl: string;
  anonKey?: string | null;
  serviceKey: string;
  fetch: typeof fetch;
};

// ---------------------------------------------------------------------------
// Web Push (VAPID, RFC 8292; aes128gcm encryption, RFC 8291)

const enc = new TextEncoder();


export const b64u = {
  encode(bytes: Uint8Array): string {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(text: string): Uint8Array {
    const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  },
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) {
    out.set(p, i);
    i += p.length;
  }
  return out;
};

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// A P-256 private key as JWK, from the raw 32-byte d and 65-byte public point.
export const privateJwk = (d: Uint8Array, pub: Uint8Array) => ({
  kty: 'EC',
  crv: 'P-256',
  d: b64u.encode(d),
  x: b64u.encode(pub.slice(1, 33)),
  y: b64u.encode(pub.slice(33, 65)),
});

export type Subscription = { endpoint: string; p256dh: string; auth: string };
export type VapidKeys = { publicKey: string; privateJwk: JsonWebKey };

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { publicKey: b64u.encode(pub), privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey) };
}

// RFC 8291: encrypt `payload` for one browser subscription.
// `salt` and `serverKeys` are only passed in by tests.
export async function encryptPayload(
  payload: Uint8Array,
  sub: { p256dh: string; auth: string },
  { salt = crypto.getRandomValues(new Uint8Array(16)), serverKeys }: { salt?: Uint8Array; serverKeys?: CryptoKeyPair } = {},
) {
  const uaPublic = b64u.decode(sub.p256dh);
  const authSecret = b64u.decode(sub.auth);
  const keys = serverKeys ?? ((await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, keys.privateKey, 256));

  const ikm = await hkdf(authSecret, ecdhSecret, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // One record: the message, then the 0x02 "last record" delimiter.
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const rs = 4096;
  const header = concat(salt, new Uint8Array([rs >>> 24, (rs >>> 16) & 255, (rs >>> 8) & 255, rs & 255, asPublic.length]), asPublic);
  return concat(header, cipher);
}

// RFC 8292: a signed token saying who is sending, valid for 12 hours.
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, subject: string, now = Date.now()) {
  const aud = new URL(endpoint).origin;
  const header = b64u.encode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.encode(enc.encode(JSON.stringify({ aud, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64u.encode(sig)}, k=${vapid.publicKey}`;
}

// Send one message. Returns the push service's HTTP status
// (201 = accepted; 404/410 = the subscription is gone).
export async function sendPush(
  sub: Subscription,
  message: unknown,
  vapid: VapidKeys,
  { subject, fetch: f = fetch, ttl = 6 * 3600, topic }: { subject: string; fetch?: typeof fetch; ttl?: number; topic?: string },
) {
  const body = await encryptPayload(enc.encode(JSON.stringify(message)), sub);
  const headers: Record<string, string> = {
    Authorization: await vapidAuthorization(sub.endpoint, vapid, subject),
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: String(ttl),
    Urgency: 'normal',
  };
  // A topic replaces an older undelivered message with the same topic.
  if (topic) headers.Topic = topic.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  const res = await f(sub.endpoint, { method: 'POST', headers, body });
  return res.status;
}

// ---------------------------------------------------------------------------
// Database calls (as the server)

const serverHeaders = (env: Env) => ({
  apikey: env.serviceKey,
  // Legacy service_role keys are JWTs and also go in Authorization; new
  // sb_secret_ keys only go in apikey.
  ...(env.serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${env.serviceKey}` } : {}),
  'Content-Type': 'application/json',
});

async function rpc(env: Env, name: string, args: Record<string, unknown> = {}) {
  const res = await env.fetch(`${env.supabaseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: serverHeaders(env),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${name} failed (${res.status}): ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

let cachedKeys: VapidKeys | null = null;
async function vapidKeys(env: Env): Promise<VapidKeys> {
  if (cachedKeys) return cachedKeys;
  let [config] = await rpc(env, 'get_push_config');
  if (!config?.public_key) {
    const fresh = await generateVapidKeys();
    [config] = await rpc(env, 'set_push_keys', { new_public_key: fresh.publicKey, new_private_jwk: fresh.privateJwk });
  }
  cachedKeys = { publicKey: config.public_key, privateJwk: config.private_jwk };
  return cachedKeys;
}

// Send to every device; forget devices the push service says are gone.
async function deliver(env: Env, devices: Subscription[], message: Record<string, unknown>, vapid: VapidKeys, topic?: string) {
  let sent = 0;
  let failed = 0;
  for (const device of devices) {
    if (!PUSH_HOSTS.test(device.endpoint)) continue;
    try {
      const status = await sendPush(device, message, vapid, { subject: SUBJECT, fetch: env.fetch, topic });
      if (status === 404 || status === 410) await rpc(env, 'drop_push_endpoint', { endpoint: device.endpoint });
      if (status >= 200 && status < 300) sent++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { sent, failed };
}

// ---------------------------------------------------------------------------

export async function handle(req: Request, env: Env): Promise<Response> {
  const origin = req.headers.get('origin') ?? '';
  const cors = {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    Vary: 'Origin',
  };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const action = body?.action ?? new URL(req.url).searchParams.get('action');

  try {
    if (action === 'public-key') return json(200, { publicKey: (await vapidKeys(env)).publicKey });

    if (action === 'send') {
      // Only the scheduler knows this secret (it reads it from push_config).
      const [config] = await rpc(env, 'get_push_config');
      const secret = req.headers.get('x-cron-secret') ?? '';
      if (!config?.cron_secret || secret !== config.cron_secret) return json(401, { error: 'Not allowed.' });
      const vapid = await vapidKeys(env);
      const due = await rpc(env, 'claim_due_pushes', { max_items: 500 });
      let sent = 0;
      let failed = 0;
      for (const item of due) {
        const r = await deliver(env, item.devices, { title: item.title, body: item.body, url: item.url, tag: item.key }, vapid, item.key);
        sent += r.sent;
        failed += r.failed;
      }
      return json(200, { reminders: due.length, sent, failed });
    }

    if (action === 'test') {
      // Signed-in students only; reads their own devices with their own token.
      const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      const apiKey = req.headers.get('apikey') ?? env.anonKey;
      if (!token || !apiKey) return json(401, { error: 'Sign in first.' });
      const asStudent = { apikey: apiKey, Authorization: `Bearer ${token}` };
      const who = await env.fetch(`${env.supabaseUrl}/auth/v1/user`, { headers: asStudent });
      if (!who.ok) return json(401, { error: 'Sign in first.' });
      const res = await env.fetch(`${env.supabaseUrl}/rest/v1/push_subscriptions?select=endpoint,p256dh,auth`, { headers: asStudent });
      const devices = res.ok ? await res.json() : [];
      if (!devices.length) return json(404, { error: 'No devices have notifications turned on yet.' });
      const r = await deliver(env, devices, { title: 'Notifications are on', body: 'This is what reminders from Bolles Planner look like.', url: '#/settings', tag: 'test' }, await vapidKeys(env));
      return json(200, r);
    }

    return json(400, { error: 'Unknown action.' });
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
}

const deno = (globalThis as any).Deno;
if (deno) {
  deno.serve((req: Request) =>
    handle(req, {
      supabaseUrl: deno.env.get('SUPABASE_URL'),
      anonKey: deno.env.get('SUPABASE_ANON_KEY'),
      serviceKey: deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      fetch,
    }),
  );
}
