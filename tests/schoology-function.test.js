import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handle } from '../supabase/functions/schoology-ical/index.ts';

const ICS = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Quiz\r\nDTSTART;VALUE=DATE:20261022\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
const FEED = 'https://bolles.schoology.com/calendar/feed/ical/123/abc/ical.ics';

// Fake network: Supabase Auth plus whatever pages a test defines.
function makeEnv(pages = {}) {
  const calls = [];
  const fetch = async (input, init = {}) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://proj.supabase.co/auth/v1/user') {
      return init.headers.Authorization === 'Bearer good-token' ? new Response('{"id":"u1"}') : new Response('{}', { status: 401 });
    }
    const page = pages[url];
    if (!page) return new Response('not found', { status: 404 });
    return typeof page === 'function' ? page() : page.clone();
  };
  return { env: { supabaseUrl: 'https://proj.supabase.co', apiKey: 'sb_publishable_x', fetch }, calls };
}

const post = (body, { token = 'good-token', origin = 'https://legoneil.github.io' } = {}) =>
  new Request('https://proj.supabase.co/functions/v1/schoology-ical', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, ...(token ? { Authorization: `Bearer ${token}` } : {}), apikey: 'sb_publishable_x' },
    body: JSON.stringify(body),
  });

test('returns the calendar for a signed-in student', async () => {
  const { env } = makeEnv({ [FEED]: new Response(ICS) });
  const res = await handle(post({ url: FEED.replace('https://', 'webcal://') }), env);
  assert.equal(res.status, 200);
  assert.equal(await res.text(), ICS);
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://legoneil.github.io');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('refuses callers who are not signed in, before fetching anything', async () => {
  for (const token of [null, 'bad-token']) {
    const { env, calls } = makeEnv({ [FEED]: new Response(ICS) });
    const res = await handle(post({ url: FEED }, { token }), env);
    assert.equal(res.status, 401);
    assert.ok(!calls.includes(FEED));
  }
});

test('only fetches Schoology links', async () => {
  const bad = [
    'https://evil.example.com/calendar.ics',
    'http://bolles.schoology.com/calendar.ics',
    'https://bolles.schoology.com.evil.com/x',
    'https://user:pw@bolles.schoology.com/x',
    'https://bolles.schoology.com:8443/x',
    'file:///etc/passwd',
    'not a url',
  ];
  for (const url of bad) {
    const { env, calls } = makeEnv();
    const res = await handle(post({ url }), env);
    assert.equal(res.status, 400, url);
    assert.equal(calls.length, 1, `${url} should only hit auth`);
  }
});

test('follows redirects only within Schoology', async () => {
  const moved = 'https://app.schoology.com/calendar/feed/ical/123/abc/ical.ics';
  const ok = makeEnv({
    [FEED]: new Response(null, { status: 302, headers: { Location: moved } }),
    [moved]: new Response(ICS),
  });
  assert.equal((await handle(post({ url: FEED }), ok.env)).status, 200);

  const away = makeEnv({ [FEED]: new Response(null, { status: 302, headers: { Location: 'https://evil.example.com/' } }) });
  const res = await handle(post({ url: FEED }), away.env);
  assert.equal(res.status, 502);
  assert.ok(!away.calls.includes('https://evil.example.com/'));
});

test('rejects pages that are not calendars, errors and huge files', async () => {
  const html = makeEnv({ [FEED]: new Response('<html>Log in</html>') });
  assert.equal((await handle(post({ url: FEED }), html.env)).status, 502);

  const gone = makeEnv({ [FEED]: new Response('gone', { status: 403 }) });
  const res = await handle(post({ url: FEED }), gone.env);
  assert.equal(res.status, 502);
  assert.match((await res.json()).error, /403/);

  const big = makeEnv({ [FEED]: () => new Response(`BEGIN:VCALENDAR${'x'.repeat(5_100_000)}`) });
  assert.equal((await handle(post({ url: FEED }), big.env)).status, 413);
});

test('CORS preflight, and unknown sites get no access', async () => {
  const { env } = makeEnv();
  const pre = await handle(new Request('https://x/', { method: 'OPTIONS', headers: { Origin: 'http://localhost:4173' } }), env);
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), 'http://localhost:4173');
  const other = await handle(post({ url: FEED }, { origin: 'https://evil.example.com' }), makeEnv({ [FEED]: new Response(ICS) }).env);
  assert.notEqual(other.headers.get('access-control-allow-origin'), 'https://evil.example.com');
});
