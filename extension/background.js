// Keeps grades fresh without opening Schoology's grades page. Every 30
// minutes (while the browser is open) it asks an open Schoology tab to
// re-read your grades, since requests from a Schoology page carry your
// login. With no Schoology tab open it tries directly, which works in
// browsers that share the login with extensions. New grades go to your
// planner account, so your phone sees them too.

importScripts('common.js');

const REFRESH_MINUTES = 30;
const DEFAULT_DOMAIN = 'bolles.schoology.com';

function setup() {
  chrome.alarms.create('refresh', { periodInMinutes: REFRESH_MINUTES, delayInMinutes: 1 });
  refresh();
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
chrome.alarms.onAlarm.addListener((alarm) => alarm.name === 'refresh' && refresh());

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'refresh-now') refresh({ maxAgeMs: 0 });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.grades || (changes.link && changes.link.newValue?.token !== changes.link.oldValue?.token)) submit();
});

// Parse HTML in an offscreen page (workers have no DOMParser).
async function parse(html) {
  if (!(await chrome.offscreen.hasDocument())) {
    await chrome.offscreen
      .createDocument({ url: 'offscreen.html', reasons: ['DOM_PARSER'], justification: 'Read your Schoology grades page' })
      .catch((e) => {
        if (!/single offscreen/i.test(e.message)) throw e;
      });
  }
  return chrome.runtime.sendMessage({ target: 'offscreen', type: 'parse', html });
}

// Ask an open Schoology tab to re-read the grades page. Tabs opened before
// the extension was installed have no content script; skip those.
async function refreshThroughTab() {
  const tabs = await chrome.tabs.query({ url: 'https://*.schoology.com/*' });
  for (const tab of tabs) {
    try {
      // Any answer (ok, logged out, error) means the tab handled it.
      if (await chrome.tabs.sendMessage(tab.id, { type: 'refresh-grades' })) return true;
    } catch {
      // No content script in this tab.
    }
  }
  return false;
}

let running = null;
function refresh({ maxAgeMs = 60_000 } = {}) {
  running ??= (async () => {
    const { lastAttempt, grades } = await chrome.storage.local.get(['lastAttempt', 'grades']);
    if (lastAttempt && Date.now() - lastAttempt < maxAgeMs) return;
    await chrome.storage.local.set({ lastAttempt: Date.now() });
    if (await refreshThroughTab()) return;

    const host = grades?.domain ?? DEFAULT_DOMAIN;
    if (!/^[a-z0-9-]+\.schoology\.com$/.test(host)) return;
    const url = `https://${host}/grades/grades`;
    try {
      // Without the login, Schoology redirects to Microsoft sign-in; don't follow it.
      const res = await fetch(url, { credentials: 'include', redirect: 'manual' });
      if (res.type === 'opaqueredirect' || /\/login/.test(new URL(res.url).pathname)) {
        await chrome.storage.local.set({ status: { ok: false, needsVisit: true, at: Date.now(), message: 'Open any Schoology page (logged in) to update your grades.' } });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data, layout, loginPage } = await parse(await res.text());
      if (loginPage) {
        await chrome.storage.local.set({ status: { ok: false, needsVisit: true, at: Date.now(), message: 'Open any Schoology page (logged in) to update your grades.' } });
        return;
      }
      await chrome.storage.local.set(gradesResult(data, layout, url, host));
    } catch (e) {
      await chrome.storage.local.set({ status: { ok: false, at: Date.now(), message: `Couldn’t load your grades page (${e.message}).` } });
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

// Send the latest grades to the planner account this extension is linked to.
async function submit() {
  const { grades, link } = await chrome.storage.local.get(['grades', 'link']);
  if (!grades?.courses?.length || !link?.token || (link.sentReadAt ?? 0) >= grades.readAt) return;
  try {
    const res = await fetch(`${link.url}/rest/v1/rpc/submit_grades`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: link.anonKey },
      // The server takes at most 20 courses.
      body: JSON.stringify({ token: link.token, grades: { ...grades, courses: grades.courses.slice(0, 20) } }),
    });
    const body = res.ok ? null : await res.json().catch(() => null);
    // The planner may have unlinked (signed out) while this was in flight:
    // only touch the link if it's still the one we used.
    const { link: now } = await chrome.storage.local.get('link');
    if (now?.token !== link.token) return;
    if (res.ok) await chrome.storage.local.set({ link: { ...now, sentReadAt: grades.readAt, sentAt: Date.now(), error: null } });
    // The link was revoked (signed out, or grades removed): forget it.
    else if (body?.code === '28000') await chrome.storage.local.remove('link');
    else await chrome.storage.local.set({ link: { ...now, error: body?.message ?? `HTTP ${res.status}` } });
  } catch {
    // Offline: try again after the next reading.
  }
}
