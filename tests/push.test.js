// The push Edge Function against supabase/push.sql running in a real Postgres
// (PGlite), with fake push services. Needs `npm install`.

import assert from 'node:assert/strict';
import { before, test } from 'node:test';

import { b64u, handle } from '../supabase/functions/push/index.ts';

let sim;
let SERVICE;
try {
  ({ SERVICE } = await import('./support/supabase-sim.js'));
} catch {
  SERVICE = null;
}
const opts = { skip: SERVICE ? false : 'run `npm install` to enable database tests' };

// A real device key pair (RFC 8291's example), so we can decrypt deliveries.
const UA = {
  d: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
};
const URL_ = 'https://proj.supabase.co';
let ana, ben;
const delivered = [];
const GONE = 'https://fcm.googleapis.com/fcm/send/gone-device';

async function decrypt(body) {
  const pub = b64u.decode(UA.p256dh);
  const priv = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d: UA.d, x: b64u.encode(pub.slice(1, 33)), y: b64u.encode(pub.slice(33)) },
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  );
  const salt = body.slice(0, 16);
  const asPublic = body.slice(21, 21 + body[20]);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, priv, 256));
  const te = new TextEncoder();
  const hk = async (s, ikm, info, n) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
  const ikm = await hk(b64u.decode(UA.auth), secret, new Uint8Array([...te.encode('WebPush: info\0'), ...pub, ...asPublic]), 32);
  const key = await crypto.subtle.importKey('raw', await hk(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: await hk(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12) }, key, body.slice(21 + body[20])));
  return JSON.parse(new TextDecoder().decode(plain.slice(0, -1)));
}

// Supabase's REST API and Auth, backed by the simulated database.
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
async function fakeFetch(input, init = {}) {
  const url = String(input);
  if (url.startsWith(`${URL_}/rest/v1/rpc/`)) {
    assert.equal(init.headers.apikey, 'service-key');
    const name = url.split('/').pop();
    const { data, error } = await sim.rpc(SERVICE, name, JSON.parse(init.body || '{}'));
    if (error) return json(error, 400);
    return data === null ? new Response(null, { status: 204 }) : json(data);
  }
  const token = init.headers?.Authorization?.replace('Bearer ', '');
  const uid = { 'tok-ana': ana, 'tok-ben': ben }[token];
  if (url === `${URL_}/auth/v1/user`) return uid ? json({ id: uid }) : json({}, 401);
  if (url.startsWith(`${URL_}/rest/v1/push_subscriptions`)) {
    return json((await sim.query(uid, { table: 'push_subscriptions', action: 'select', columns: 'endpoint, p256dh, auth' })).data);
  }
  // A push service.
  delivered.push({ url, init });
  return new Response(null, { status: url === GONE ? 410 : 201 });
}
const env = { supabaseUrl: URL_, anonKey: 'anon-key', serviceKey: 'service-key', fetch: fakeFetch };

const call = (action, { secret, token } = {}) =>
  handle(
    new Request(`${URL_}/functions/v1/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://legoneil.github.io',
        ...(secret ? { 'x-cron-secret': secret } : {}),
        ...(token ? { Authorization: `Bearer ${token}`, apikey: 'anon-key' } : {}),
      },
      body: JSON.stringify({ action }),
    }),
    env,
  );

const device = (endpoint) => ({ endpoint, p256dh: UA.p256dh, auth: UA.auth });
const inMinutes = (m) => new Date(Date.now() + m * 60_000).toISOString();
const reminder = (key, minutes, title = key) => ({ key, send_at: inMinutes(minutes), title, body: `Body of ${key}`, url: '#/today' });
const cronSecret = async () => (await sim.rpc(SERVICE, 'get_push_config')).data[0].cron_secret;
const makeDue = (uid) => sim.sqlAs(SERVICE, `update public.push_queue set send_at = now() - interval '1 minute' where user_id = $1 and sent_at is null`, [uid]);

before(async () => {
  if (!SERVICE) return;
  const { createSim } = await import('./support/supabase-sim.js');
  sim = await createSim();
  ana = await sim.createUser('ana@example.com');
  ben = await sim.createUser('ben@example.com');
});

test('the server makes its push key once and keeps it; students cannot read the secrets', opts, async () => {
  const a = await (await call('public-key')).json();
  const b = await (await call('public-key')).json();
  assert.match(a.publicKey, /^[A-Za-z0-9_-]{87}$/);
  assert.equal(a.publicKey, b.publicKey);
  for (const uid of [ana, null]) {
    assert.ok((await sim.rpc(uid, 'get_push_config')).error, 'get_push_config is server-only');
    assert.ok((await sim.query(uid, { table: 'push_config', action: 'select' })).error, 'push_config is unreadable');
    assert.ok((await sim.rpc(uid, 'claim_due_pushes', {})).error, 'students cannot claim reminders');
  }
});

test('only real push services can be saved, and a device belongs to the last account on it', opts, async () => {
  for (const endpoint of ['https://evil.example.com/x', 'http://fcm.googleapis.com/fcm/send/x', 'https://fcm.googleapis.com.evil.com/x']) {
    assert.ok((await sim.rpc(ana, 'save_push_subscription', device(endpoint))).error, endpoint);
  }
  assert.ok((await sim.rpc(null, 'save_push_subscription', device('https://fcm.googleapis.com/fcm/send/x'))).error, 'signed out');

  const shared = 'https://web.push.apple.com/shared-ipad';
  assert.equal((await sim.rpc(ben, 'save_push_subscription', device(shared))).error, null);
  assert.equal((await sim.rpc(ana, 'save_push_subscription', device(shared))).error, null);
  const bens = (await sim.query(ben, { table: 'push_subscriptions', action: 'select' })).data;
  assert.equal(bens.length, 0, 'moved to Ana');
  // Students can't write the table directly.
  const direct = await sim.query(ben, { table: 'push_subscriptions', action: 'upsert', values: { ...device('https://fcm.googleapis.com/fcm/send/b'), user_id: ana } });
  assert.ok(direct.error);
});

test('reminders are replaced, never duplicated, and private to each student', opts, async () => {
  const r1 = await sim.rpc(ana, 'replace_push_queue', { items: JSON.stringify([reminder('eve-2026-11-04', 30), reminder('morn-2026-11-05', 60)]) });
  assert.deepEqual(r1, { data: 2, error: null });
  // Past, far-future and badly named reminders are ignored or refused.
  const r2 = await sim.rpc(ana, 'replace_push_queue', { items: JSON.stringify([reminder('eve-2026-11-04', 30), reminder('old', -5), reminder('far', 60 * 24 * 60)]) });
  assert.deepEqual(r2, { data: 1, error: null });
  assert.ok((await sim.rpc(ana, 'replace_push_queue', { items: JSON.stringify([reminder('Bad Key!', 5)]) })).error);
  assert.ok((await sim.rpc(ana, 'replace_push_queue', { items: JSON.stringify(Array.from({ length: 201 }, (_, i) => reminder(`k${i}`, 5))) })).error);
  assert.equal((await sim.query(ben, { table: 'push_queue', action: 'select' })).data.length, 0, 'Ben sees none of Ana’s');
});

test('the scheduler needs its secret; due reminders reach every device once, encrypted', opts, async () => {
  assert.equal((await call('send')).status, 401);
  assert.equal((await call('send', { secret: 'wrong' })).status, 401);

  await sim.rpc(ana, 'save_push_subscription', device('https://fcm.googleapis.com/fcm/send/ana-laptop'));
  await sim.rpc(ana, 'save_push_subscription', device(GONE));
  await sim.rpc(ana, 'replace_push_queue', { items: JSON.stringify([reminder('eve-2026-11-04', 30, '2 tests tomorrow'), reminder('later', 120)]) });
  await makeDue(ana);
  await sim.sqlAs(SERVICE, `update public.push_queue set send_at = now() + interval '1 hour' where key = 'later'`);

  delivered.length = 0;
  const res = await (await call('send', { secret: await cronSecret() })).json();
  assert.equal(res.reminders, 1);
  assert.equal(res.sent, 2, 'iPad and laptop');
  assert.equal(res.failed, 1, 'the gone device');
  const toLaptop = delivered.find((d) => d.url.endsWith('ana-laptop'));
  assert.deepEqual(await decrypt(toLaptop.init.body), { title: '2 tests tomorrow', body: 'Body of eve-2026-11-04', url: '#/today', tag: 'eve-2026-11-04' });
  assert.match(toLaptop.init.headers.Authorization, /^vapid t=.+, k=.+$/);

  const devices = (await sim.query(ana, { table: 'push_subscriptions', action: 'select', columns: 'endpoint' })).data.map((d) => d.endpoint);
  assert.ok(!devices.includes(GONE), 'a device the push service says is gone is forgotten');

  delivered.length = 0;
  assert.equal((await (await call('send', { secret: await cronSecret() })).json()).reminders, 0, 'nothing sent twice');
  // Re-saving the same list after it was sent doesn't queue it again.
  await sim.rpc(ana, 'replace_push_queue', { items: JSON.stringify([reminder('eve-2026-11-04', 30)]) });
  await makeDue(ana);
  assert.equal((await (await call('send', { secret: await cronSecret() })).json()).reminders, 0);
});

test('a test notification goes only to the signed-in student’s own devices', opts, async () => {
  assert.equal((await call('test')).status, 401);
  assert.equal((await call('test', { token: 'tok-ben' })).status, 404, 'Ben has no devices');
  delivered.length = 0;
  const r = await (await call('test', { token: 'tok-ana' })).json();
  assert.equal(r.sent, 2);
  assert.deepEqual(r.results.map((x) => [x.service, x.status]).sort(), [['fcm.googleapis.com', 201], ['web.push.apple.com', 201]]);
  assert.ok(delivered.every((d) => !d.url.includes('ben')));
  assert.equal((await decrypt(delivered[0].init.body)).title, 'Notifications are on');
});

test('when a push service refuses, the test reports its reason', opts, async () => {
  const cal = await sim.createUser('cal@example.com');
  const refusing = 'https://fcm.googleapis.com/fcm/send/refuses';
  await sim.rpc(cal, 'save_push_subscription', device(refusing));
  const realFetch = env.fetch;
  env.fetch = async (input, init) => (String(input) === refusing ? new Response('the key in the token does not match', { status: 403 }) : realFetch(input, init));
  try {
    const res = await handle(
      new Request(`${URL_}/functions/v1/push`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-cal', apikey: 'anon-key' }, body: JSON.stringify({ action: 'test' }) }),
      { ...env, fetch: async (input, init) => (String(input) === `${URL_}/auth/v1/user` ? new Response(JSON.stringify({ id: cal })) : String(input).startsWith(`${URL_}/rest/v1/push_subscriptions`) ? new Response(JSON.stringify((await sim.query(cal, { table: 'push_subscriptions', action: 'select', columns: 'endpoint, p256dh, auth' })).data)) : env.fetch(input, init)) },
    );
    const out = await res.json();
    assert.equal(out.sent, 0);
    assert.deepEqual(out.results, [{ service: 'fcm.googleapis.com', status: 403, detail: 'the key in the token does not match' }]);
  } finally {
    env.fetch = realFetch;
  }
});
