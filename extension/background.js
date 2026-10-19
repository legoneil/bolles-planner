// Keeps grades fresh without opening Schoology. Every 30 minutes (while
// Chrome is open) it loads your Schoology grades page using the Schoology
// login already in this browser, reads it, and sends the result to your
// Bolles Planner account, so your phone sees new grades too.

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
  if (msg?.type === 'schoology-visit') refresh({ maxAgeMs: REFRESH_MINUTES * 60_000, domain: msg.domain });
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

let running = null;
function refresh({ maxAgeMs = 60_000, domain } = {}) {
  running ??= (async () => {
    const { status, grades } = await chrome.storage.local.get(['status', 'grades']);
    if (status?.at && Date.now() - status.at < maxAgeMs) return;
    const host = domain ?? grades?.domain ?? DEFAULT_DOMAIN;
    if (!/^[a-z0-9-]+\.schoology\.com$/.test(host)) return;
    const url = `https://${host}/grades/grades`;
    try {
      const res = await fetch(url, { credentials: 'include' });
      const loggedOut = () =>
        chrome.storage.local.set({ status: { ok: false, loggedOut: true, at: Date.now(), message: 'Log in to Schoology in Chrome to keep your grades updating.' } });
      if (/\/login/.test(new URL(res.url).pathname)) return loggedOut();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { data, layout, loginPage } = await parse(await res.text());
      if (loginPage) return loggedOut();
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
      body: JSON.stringify({ token: link.token, grades }),
    });
    if (res.ok) {
      await chrome.storage.local.set({ link: { ...link, sentReadAt: grades.readAt, sentAt: Date.now(), error: null } });
      return;
    }
    const body = await res.json().catch(() => null);
    // The link was revoked (signed out, or grades removed): forget it.
    if (body?.code === '28000') await chrome.storage.local.remove('link');
    else await chrome.storage.local.set({ link: { ...link, error: body?.message ?? `HTTP ${res.status}` } });
  } catch {
    // Offline: try again after the next reading.
  }
}
