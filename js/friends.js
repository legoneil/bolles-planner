// Friends: talks to the profiles/friendships tables and functions in
// supabase/friends.sql, keeps the student's shared schedule up to date, and
// caches the friends list for offline use.

import { account, getClient, onAccountChange } from './account.js';
import { sharedSchedule } from './compare.js';
import { getState, subscribe } from './store.js';

const CACHE_KEY = 'bolles-planner:friends';

// status: idle | loading | ready | error
export const friends = { status: 'idle', me: null, list: [], requests: [], error: null, loadedAt: 0 };

const listeners = new Set();
export const onFriendsChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((l) => l(friends));

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ userId: account.userId, me: friends.me, list: friends.list, requests: friends.requests }));
  } catch {
    // Offline cache is optional.
  }
}

function loadCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    if (c?.userId && c.userId === account.userId) Object.assign(friends, { me: c.me, list: c.list, requests: c.requests, status: 'ready' });
  } catch {
    // ignore
  }
}

function clear() {
  Object.assign(friends, { status: 'idle', me: null, list: [], requests: [], error: null, loadedAt: 0 });
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
  emit();
}

const check = ({ data, error }) => {
  if (error) throw new Error(error.message);
  return data;
};

let inflight = null;

export function loadFriends({ force = false } = {}) {
  if (account.status !== 'signed-in') return Promise.resolve();
  if (inflight) return inflight;
  if (!force && Date.now() - friends.loadedAt < 15_000) return Promise.resolve();
  // Start on the next tick so a render triggered by emit() sees `inflight`.
  inflight = Promise.resolve()
    .then(fetchFriends)
    .finally(() => (inflight = null));
  return inflight;
}

async function fetchFriends() {
  if (friends.status !== 'ready') {
    friends.status = 'loading';
    emit();
  }
  try {
    const sb = await getClient();
    const [rows, requests] = await Promise.all([
      sb.from('profiles').select('user_id, display_name, friend_code, schedule, updated_at').then(check),
      sb.rpc('friend_requests').then(check),
    ]);
    const me = rows.find((r) => r.user_id === account.userId) ?? null;
    friends.me = me && { display_name: me.display_name, friend_code: me.friend_code, schedule: me.schedule };
    friends.list = rows
      .filter((r) => r.user_id !== account.userId)
      .map(({ user_id, display_name, schedule, updated_at }) => ({ user_id, display_name, schedule, updated_at }))
      .sort((a, b) => a.display_name.localeCompare(b.display_name));
    friends.requests = requests ?? [];
    friends.status = 'ready';
    friends.error = null;
    friends.loadedAt = Date.now();
    saveCache();
    publishSchedule();
  } catch (e) {
    friends.error =
      navigator.onLine === false
        ? 'Offline. Showing your friends as of the last update.'
        : /does not exist|schema cache|could not find the (function|table)/i.test(e.message)
          ? 'Friends isn’t set up on the server yet (supabase/friends.sql needs to be run).'
          : e.message;
    friends.status = friends.me || friends.list.length ? 'ready' : 'error';
  }
  emit();
}

// Push the student's current classes to their profile when they change.
let publishing = null;
export async function publishSchedule() {
  if (account.status !== 'signed-in' || !friends.me) return;
  const schedule = sharedSchedule(getState().profile);
  if (!schedule || JSON.stringify(schedule) === JSON.stringify(friends.me.schedule)) return;
  if (publishing) return publishing;
  publishing = (async () => {
    try {
      const sb = await getClient();
      check(await sb.from('profiles').update({ schedule, updated_at: new Date().toISOString() }).eq('user_id', account.userId));
      friends.me.schedule = schedule;
      saveCache();
    } catch {
      // Try again on the next change or load.
    } finally {
      publishing = null;
    }
  })();
  return publishing;
}

async function call(fn) {
  const sb = await getClient();
  return check(await fn(sb));
}

export async function enableFriends(name) {
  await call((sb) => sb.rpc('enable_friends', { name }));
  await loadFriends({ force: true });
}

const REQUEST_MESSAGES = {
  requested: (n) => `Request sent to ${n}. You'll see each other's schedules once they accept.`,
  accepted: (n) => `You and ${n} are now friends.`,
  already: (n) => `You've already added ${n}.`,
  not_found: () => 'No one has that friend code. Check it and try again.',
  self: () => 'That’s your own code.',
  no_profile: () => 'Turn on friends first.',
};

export async function addFriend(code) {
  const res = await call((sb) => sb.rpc('request_friend', { code }));
  await loadFriends({ force: true });
  return { ok: ['requested', 'accepted', 'already'].includes(res.status), message: REQUEST_MESSAGES[res.status]?.(res.name) ?? res.status };
}

export async function respond(userId, accept) {
  await call((sb) => sb.rpc('respond_friend', { other: userId, accept }));
  await loadFriends({ force: true });
}

export async function removeFriend(userId) {
  await call((sb) => sb.rpc('remove_friend', { other: userId }));
  await loadFriends({ force: true });
}

export async function leaveFriends() {
  await call((sb) => sb.rpc('leave_friends'));
  clear();
  await loadFriends({ force: true });
}

export function initFriends() {
  let lastUser = null;
  onAccountChange(() => {
    if (account.userId === lastUser) return;
    lastUser = account.userId;
    if (!account.userId) return clear();
    loadCache();
    loadFriends({ force: true });
  });
  // Classes edited here, or synced from another device.
  let timer = null;
  const schedulePublish = () => {
    clearTimeout(timer);
    timer = setTimeout(publishSchedule, 1000);
  };
  subscribe(schedulePublish);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') loadFriends();
  });
}
