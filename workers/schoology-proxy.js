// Cloudflare Worker that lets the planner read a student's Schoology
// calendar feed. Browsers block reading bolles.schoology.com directly
// (no CORS headers), so the app asks this worker instead.
//
// It only forwards GET requests to *.schoology.com, never stores anything,
// and only answers pages from ALLOWED_ORIGIN.
//
// Deploy: https://dash.cloudflare.com → Workers → Create → paste this file.
// Then put the worker's URL in the planner under Settings → Schoology → Advanced.

const ALLOWED_ORIGIN = '*'; // e.g. 'https://yourname.github.io' once the site is live

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
      'Access-Control-Allow-Methods': 'GET',
      'Cache-Control': 'no-store',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

    let target;
    try {
      target = new URL(new URL(request.url).searchParams.get('url'));
    } catch {
      return new Response('Missing or invalid ?url=', { status: 400, headers: cors });
    }
    const okHost = target.hostname === 'schoology.com' || target.hostname.endsWith('.schoology.com');
    if (target.protocol !== 'https:' || !okHost) {
      return new Response('Only Schoology links are allowed', { status: 403, headers: cors });
    }

    const upstream = await fetch(target.toString(), { headers: { Accept: 'text/calendar' } });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { ...cors, 'Content-Type': 'text/calendar; charset=utf-8' },
    });
  },
};
