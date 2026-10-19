import assert from 'node:assert/strict';
import { test } from 'node:test';

import { b64u, encryptPayload, generateVapidKeys, privateJwk, sendPush, vapidAuthorization } from '../supabase/functions/push/index.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();

// RFC 8291 Appendix A: the worked example from the Web Push encryption spec.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  result:
    'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

async function ecdhPair(d, pub) {
  const jwk = privateJwk(b64u.decode(d), b64u.decode(pub));
  return {
    privateKey: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']),
    publicKey: await crypto.subtle.importKey('raw', b64u.decode(pub), { name: 'ECDH', namedCurve: 'P-256' }, true, []),
  };
}

// What a browser does with an incoming message (RFC 8291, receiving side).
async function decryptAsBrowser(body, uaKeys, uaPublic, authSecret) {
  const salt = body.slice(0, 16);
  const idlen = body[20];
  const asPublic = body.slice(21, 21 + idlen);
  const cipher = body.slice(21 + idlen);
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, uaKeys.privateKey, 256));
  const hk = async (s, ikm, info, n) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s, info }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), n * 8));
  const ikm = await hk(authSecret, secret, new Uint8Array([...enc.encode('WebPush: info\0'), ...uaPublic, ...asPublic]), 32);
  const cek = await hk(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hk(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, cipher));
  assert.equal(plain.at(-1), 2, 'last-record delimiter');
  return dec.decode(plain.slice(0, -1));
}

test('encryption matches the RFC 8291 worked example byte for byte', async () => {
  const serverKeys = await ecdhPair(RFC.asPrivate, RFC.asPublic);
  const out = await encryptPayload(enc.encode(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, { salt: b64u.decode(RFC.salt), serverKeys });
  assert.equal(b64u.encode(out), RFC.result);
});

test('a browser can decrypt what we send, with fresh random keys', async () => {
  const ua = await ecdhPair(RFC.uaPrivate, RFC.uaPublic);
  const message = JSON.stringify({ title: '2 tests tomorrow', body: 'AP Biology, Precalculus' });
  const out = await encryptPayload(enc.encode(message), { p256dh: RFC.uaPublic, auth: RFC.auth });
  assert.equal(await decryptAsBrowser(out, ua, b64u.decode(RFC.uaPublic), b64u.decode(RFC.auth)), message);
});

test('VAPID token is signed by our key, for the push service origin, and expires', async () => {
  const vapid = await generateVapidKeys();
  const now = Date.UTC(2026, 10, 2, 12);
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', vapid, 'mailto:rotationplanner@gmail.com', now);
  const [, token, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header);
  assert.equal(k, vapid.publicKey);
  const [h, c, s] = token.split('.');
  const claims = JSON.parse(dec.decode(b64u.decode(c)));
  assert.equal(claims.aud, 'https://fcm.googleapis.com');
  assert.equal(claims.exp, now / 1000 + 12 * 3600);
  assert.equal(claims.sub, 'mailto:rotationplanner@gmail.com');
  const pub = await crypto.subtle.importKey('raw', b64u.decode(vapid.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  assert.ok(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64u.decode(s), enc.encode(`${h}.${c}`)));
});

test('sendPush posts an encrypted body with the right headers', async () => {
  const vapid = await generateVapidKeys();
  const ua = await ecdhPair(RFC.uaPrivate, RFC.uaPublic);
  let seen;
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    return new Response(null, { status: 201 });
  };
  const sub = { endpoint: 'https://web.push.apple.com/QGuQyavXut', p256dh: RFC.uaPublic, auth: RFC.auth };
  const status = await sendPush(sub, { title: 'Hi' }, vapid, { subject: 'mailto:x@example.com', fetch: fakeFetch, topic: 'tests-2026-11-04' });
  assert.equal(status, 201);
  assert.equal(seen.url, sub.endpoint);
  assert.equal(seen.init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(seen.init.headers.Topic, 'tests-2026-11-04');
  assert.ok(Number(seen.init.headers.TTL) > 0);
  assert.equal(await decryptAsBrowser(seen.init.body, ua, b64u.decode(RFC.uaPublic), b64u.decode(RFC.auth)), '{"title":"Hi"}');
});
