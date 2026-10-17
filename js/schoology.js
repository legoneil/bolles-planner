// "Connect Schoology": talks to the schoology-api Edge Function
// (supabase/functions/schoology-api). The student approves the planner on
// Schoology's own site; the access token that comes back is saved in their
// private planner (it only works together with the app's secret, which
// never leaves the server) and syncs to their other devices.

import { account, getClient } from './account.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';
import { guessType } from './ical.js';
import { getState, update } from './store.js';

async function callFunction(body) {
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/schoology-api`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token}` },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Couldn’t connect. Check your internet and try again.');
  }
  const out = await res.json().catch(() => null);
  if (res.ok) return out;
  if (res.status === 404) throw new Error('Connect Schoology isn’t set up on the server yet.');
  throw new Error(out?.error ?? `Schoology connection failed (${res.status}).`);
}

export const isConnected = (s = getState()) => Boolean(s.schoology.api?.accessToken);

// Step 1: send the student to Schoology to approve the planner.
export async function startConnect() {
  if (account.status !== 'signed-in') throw new Error('Sign in first.');
  const { authorizeUrl } = await callFunction({
    action: 'start',
    callback: `${location.origin}${location.pathname}?schoology=callback`,
  });
  location.href = authorizeUrl;
}

// Schoology sends the student back to ?schoology=callback&rs=…&oauth_token=…
export function pendingCallback() {
  const q = new URLSearchParams(location.search);
  if (q.get('schoology') !== 'callback') return null;
  return { token: q.get('oauth_token'), secret: q.get('rs'), denied: q.has('denied') || !q.get('oauth_token') };
}

export function clearCallbackUrl() {
  history.replaceState(null, '', `${location.pathname}#/settings`);
}

// Step 2: trade the approved request token for the student's access token.
export async function finishConnect({ token, secret }) {
  const r = await callFunction({ action: 'finish', requestToken: token, requestSecret: secret });
  update((s) => {
    s.schoology.api = {
      accessToken: r.accessToken,
      accessSecret: r.accessSecret,
      user: r.user,
      sections: [],
      sectionMap: {},
      grades: [],
      lastSync: null,
      lastError: null,
    };
  });
  return r.user;
}

export function disconnect() {
  update((s) => {
    delete s.schoology.api;
    s.assignments = s.assignments.filter((a) => !String(a.id).startsWith('sgy:api:'));
  });
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/\b(ap|honors|h|cp|accelerated)\b/g, '').replace(/[^a-z0-9]/g, '');

// Best guess at which period a Schoology course is, by class name or teacher.
export function guessSection(section, classes) {
  const course = norm(section.course);
  const sectionText = String(section.section ?? '').toLowerCase();
  let best = null;
  let score = 0;
  for (const c of classes) {
    let s = 0;
    const name = norm(c.name);
    if (name && course && (name === course || name.includes(course) || course.includes(name))) s += 3;
    const last = String(c.teacher ?? '').toLowerCase().replace(/^(mr|mrs|ms|dr|mx|sra|sr)\.?\s+/, '').split(/\s+/).pop();
    if (last && last.length >= 3 && sectionText.includes(last)) s += 2;
    const p = sectionText.match(/\b(?:p|per|period)\s*(\d)\b/);
    if (p && Number(p[1]) === Number(c.period)) s += 2;
    if (s > score) {
      best = c;
      score = s;
    }
  }
  return score >= 2 ? best.id : null;
}

const stripHtml = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// Step 3 (and every sync after): pull courses, assignments and grades.
export async function syncConnected() {
  const s0 = getState();
  const api = s0.schoology.api;
  if (!api?.accessToken) return 0;
  let r;
  try {
    r = await callFunction({ action: 'sync', accessToken: api.accessToken, accessSecret: api.accessSecret });
  } catch (e) {
    update((s) => {
      if (s.schoology.api) s.schoology.api.lastError = e.message;
    });
    throw e;
  }
  const classes = s0.profile?.classes ?? [];
  const sectionMap = { ...api.sectionMap };
  for (const sec of r.sections) if (!(sec.id in sectionMap)) sectionMap[sec.id] = guessSection(sec, classes);

  const items = r.assignments.map((a) => ({
    id: `sgy:api:${a.id}`,
    uid: a.id,
    source: 'schoology',
    sectionId: a.sectionId,
    title: a.title,
    notes: stripHtml(a.description),
    url: a.url,
    type: guessType(a.title),
    classId: sectionMap[a.sectionId] ?? null,
    dueDate: a.date,
    dueTime: a.time,
    maxPoints: a.maxPoints,
    done: false,
  }));

  update((s) => {
    if (!s.schoology.api) return;
    s.schoology.api = { ...s.schoology.api, user: r.user, sections: r.sections, sectionMap, grades: r.grades, lastSync: Date.now(), lastError: null };
    s.assignments = [...s.assignments.filter((a) => a.source !== 'schoology'), ...items];
    s.schoology.lastSync = Date.now();
    s.schoology.lastError = null;
  });
  return items.length;
}

// Student fixes which period a Schoology course is.
export function setSectionClass(sectionId, classId) {
  update((s) => {
    const api = s.schoology.api;
    if (!api) return;
    api.sectionMap = { ...api.sectionMap, [sectionId]: classId || null };
    for (const a of s.assignments) if (a.sectionId === sectionId) a.classId = classId || null;
  });
}
