// A pretend Schoology API for tests. It checks every OAuth 1.0a signature
// with the consumer secret and the right token secret, so a request signed
// wrongly (or with someone else's token) fails like it would for real.

import { oauthSignature } from '../../supabase/functions/schoology-api/index.ts';

export const CONSUMER = { key: 'ck_test', secret: 'cs_test' };

export function createFakeSchoology({ student = { id: 777, name: 'Ana R.' } } = {}) {
  const requestTokens = new Map(); // key -> { secret, approved }
  const accessTokens = new Map(); // key -> secret
  const log = [];
  let n = 0;

  const parseAuth = (h) =>
    Object.fromEntries([...String(h ?? '').matchAll(/([a-z_]+)="([^"]*)"/g)].map(([, k, v]) => [k, decodeURIComponent(v)]));

  async function verify(url, header, tokenSecret) {
    const p = parseAuth(header);
    if (p.oauth_consumer_key !== CONSUMER.key) return false;
    const { oauth_signature: sig, realm, ...params } = p;
    return sig === (await oauthSignature('GET', url, params, CONSUMER.secret, tokenSecret));
  }

  const json = (body) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
  const denied = () => new Response('denied', { status: 401 });

  // Called by the test when the student clicks Approve on the authorize page.
  const approve = (requestToken) => {
    const t = requestTokens.get(requestToken);
    if (t) t.approved = true;
    return Boolean(t);
  };

  async function fetch(input, init = {}) {
    const url = String(input);
    const auth = init.headers?.Authorization;
    const p = parseAuth(auth);
    log.push(url);
    const path = url.replace('https://api.schoology.com/v1', '');

    if (path === '/oauth/request_token') {
      if (p.oauth_token || !(await verify(url, auth, ''))) return denied();
      const key = `rt${++n}`;
      requestTokens.set(key, { secret: `rts${n}`, approved: false });
      return new Response(`oauth_token=${key}&oauth_token_secret=rts${n}`);
    }
    if (path === '/oauth/access_token') {
      const t = requestTokens.get(p.oauth_token);
      if (!t || !t.approved || !(await verify(url, auth, t.secret))) return denied();
      requestTokens.delete(p.oauth_token);
      const key = `at${++n}`;
      accessTokens.set(key, `ats${n}`);
      return new Response(`oauth_token=${key}&oauth_token_secret=ats${n}`);
    }

    const secret = accessTokens.get(p.oauth_token);
    if (!secret || !(await verify(url, auth, secret))) return denied();

    if (path === '/users/me') return new Response(null, { status: 303, headers: { Location: `https://api.schoology.com/v1/users/${student.id}` } });
    if (path === `/users/${student.id}`) return json({ id: student.id, name_display: student.name });
    if (path === `/users/${student.id}/sections`)
      return json({
        section: [
          { id: 101, course_title: 'AP Biology', section_title: 'Hicks P1' },
          { id: 102, course_title: 'English 10 Honors', section_title: 'Dale' },
        ],
      });
    if (path.startsWith('/sections/101/assignments'))
      return json({
        assignment: [
          { id: 9001, title: 'Chapter 6 Test', due: '2026-10-23 00:00:00', type: 'assignment', max_points: '100', web_url: 'https://bolles.schoology.com/assignment/9001' },
          { id: 9002, title: 'Enzyme lab report', due: '2026-10-21 23:59:00', type: 'assignment', max_points: '20' },
          { id: 9003, title: 'Undated reading', due: '' },
        ],
      });
    if (path.startsWith('/sections/102/assignments'))
      return json({ assignment: [{ id: 9101, title: 'Gatsby essay', due: '2026-10-22 08:00:00', type: 'assignment', max_points: '50' }] });
    if (path.startsWith('/sections/101/events')) return json({ event: [{ id: 5001, title: 'Lab practical', start: '2026-10-27 09:00:00', type: 'event' }] });
    if (path.startsWith('/sections/102/events')) return json({ event: [{ id: 5002, title: 'Gatsby essay', start: '2026-10-22', type: 'assignment', assignment_id: 9101 }] });
    if (path === `/users/${student.id}/grades`)
      return json({
        section: [
          {
            section_id: 101,
            period: [{ period_id: 'p1', period_title: 'Q1', assignment: [{ assignment_id: 9002, grade: 18, max_points: 20, exception: 0 }] }],
            final_grade: [{ period_id: 'p1', grade: 93.5 }],
          },
          { section_id: 102, period: [], final_grade: [{ period_id: 'p1', grade: 88 }] },
        ],
      });
    return new Response('not found', { status: 404 });
  }

  return { fetch, approve, log, accessTokens };
}
