import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handle, oauthSignature } from '../supabase/functions/schoology-api/index.ts';
import { CONSUMER, createFakeSchoology } from './support/fake-schoology.js';

test('OAuth 1.0a signature matches the well-known reference example', async () => {
  // From Twitter's "Creating a signature" documentation.
  const sig = await oauthSignature(
    'POST',
    'https://api.twitter.com/1.1/statuses/update.json?include_entities=true',
    {
      status: 'Hello Ladies + Gentlemen, a signed OAuth request!',
      oauth_consumer_key: 'xvz1evFS4wEEPTGEFPHBog',
      oauth_nonce: 'kYjzVBB8Y0ZFabxSWbWovY3uYSQ2pTgmZeNu2VS4cg',
      oauth_signature_method: 'HMAC-SHA1',
      oauth_timestamp: '1318622958',
      oauth_token: '370773112-GmHxMAgYyLbNEtIKZeRNFsMKPR9EyMZeS9weJAEb',
      oauth_version: '1.0',
    },
    'kAcSOqF21Fu85e7zjz7ZN2U4ZRhfV3WpwPAoE3Z7kBw',
    'LswwdoUaIvS8ltyTt5jkRh4J50vUPVVHtR2YPi5kE',
  );
  assert.equal(sig, 'hCtSmYh+iHYCEqBWrE7C7hYmtUk=');
});

// Supabase Auth plus fake Schoology behind one fetch.
function setup({ configured = true } = {}) {
  const sgy = createFakeSchoology();
  const fetch = async (input, init = {}) => {
    const url = String(input);
    if (url === 'https://proj.supabase.co/auth/v1/user')
      return init.headers.Authorization === 'Bearer student-jwt' ? new Response('{}') : new Response('{}', { status: 401 });
    if (url.startsWith('https://api.schoology.com/')) return sgy.fetch(input, init);
    throw new Error(`unexpected fetch ${url}`);
  };
  const env = {
    supabaseUrl: 'https://proj.supabase.co',
    apiKey: 'sb_publishable_x',
    consumerKey: configured ? CONSUMER.key : null,
    consumerSecret: configured ? CONSUMER.secret : null,
    fetch,
  };
  const call = async (body, { jwt = 'student-jwt', origin = 'https://legoneil.github.io' } = {}) => {
    const res = await handle(
      new Request('https://proj.supabase.co/functions/v1/schoology-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: origin, apikey: 'sb_publishable_x', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
        body: JSON.stringify(body),
      }),
      env,
    );
    return { status: res.status, body: await res.json(), headers: res.headers };
  };
  return { sgy, call };
}

const CALLBACK = 'https://legoneil.github.io/bolles-planner/?schoology=callback';

async function connect(t) {
  const start = await t.call({ action: 'start', callback: CALLBACK });
  t.sgy.approve(start.body.requestToken);
  return t.call({ action: 'finish', requestToken: start.body.requestToken, requestSecret: start.body.requestSecret });
}

test('full connect: start, approve on Schoology, finish', async () => {
  const t = setup();
  const start = await t.call({ action: 'start', callback: CALLBACK });
  assert.equal(start.status, 200);
  const u = new URL(start.body.authorizeUrl);
  assert.equal(u.hostname, 'bolles.schoology.com');
  const back = new URL(u.searchParams.get('oauth_callback'));
  assert.equal(`${back.origin}${back.pathname}`, 'https://legoneil.github.io/bolles-planner/');
  assert.equal(back.searchParams.get('schoology'), 'callback');
  assert.equal(back.searchParams.get('rs'), start.body.requestSecret);
  assert.equal(u.searchParams.get('oauth_token'), start.body.requestToken);

  // Not approved yet: Schoology refuses.
  const early = await t.call({ action: 'finish', requestToken: start.body.requestToken, requestSecret: start.body.requestSecret });
  assert.equal(early.status, 401);

  t.sgy.approve(start.body.requestToken);
  const done = await t.call({ action: 'finish', requestToken: start.body.requestToken, requestSecret: start.body.requestSecret });
  assert.equal(done.status, 200);
  assert.ok(done.body.accessToken && done.body.accessSecret);
  assert.deepEqual(done.body.user, { id: '777', name: 'Ana R.' });
});

test('sync returns courses, dated assignments and events, and grades', async () => {
  const t = setup();
  const { body: tokens } = await connect(t);
  const { status, body } = await t.call({ action: 'sync', accessToken: tokens.accessToken, accessSecret: tokens.accessSecret });
  assert.equal(status, 200);
  assert.deepEqual(body.sections.map((s) => s.course), ['AP Biology', 'English 10 Honors']);
  const titles = body.assignments.map((a) => a.title).sort();
  assert.deepEqual(titles, ['Chapter 6 Test', 'Enzyme lab report', 'Gatsby essay', 'Lab practical']);
  const test6 = body.assignments.find((a) => a.title === 'Chapter 6 Test');
  assert.deepEqual([test6.date, test6.time, test6.sectionId], ['2026-10-23', null, '101']);
  assert.equal(body.assignments.find((a) => a.title === 'Gatsby essay').time, '08:00');
  assert.equal(body.grades.find((g) => g.sectionId === '101').final[0].grade, 93.5);
  assert.equal(body.grades.find((g) => g.sectionId === '101').periods[0].assignments[0].assignmentId, 'a9002');
});

test('a wrong token secret is rejected by Schoology', async () => {
  const t = setup();
  const { body: tokens } = await connect(t);
  const res = await t.call({ action: 'sync', accessToken: tokens.accessToken, accessSecret: 'wrong' });
  assert.equal(res.status, 401);
});

test('only signed-in planner users can use the app key', async () => {
  const t = setup();
  for (const jwt of [null, 'someone-else']) {
    const res = await t.call({ action: 'start', callback: CALLBACK }, { jwt });
    assert.equal(res.status, 401);
  }
  assert.equal(t.sgy.log.length, 0, 'Schoology never contacted');
});

test('callback must point back to the planner', async () => {
  const t = setup();
  for (const callback of ['https://evil.example.com/steal', 'https://legoneil.github.io.evil.com/x', 'javascript:alert(1)']) {
    assert.equal((await t.call({ action: 'start', callback })).status, 400, callback);
  }
});

test('clear message when the Schoology key is not set up yet', async () => {
  const t = setup({ configured: false });
  const res = await t.call({ action: 'start', callback: CALLBACK });
  assert.equal(res.status, 503);
  assert.match(res.body.error, /isn.t set up/);
});
