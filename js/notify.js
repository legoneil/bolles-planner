// Push notifications in the browser: turning them on for this device and
// keeping the account's reminder list (push_queue) up to date. The server
// (supabase/functions/push) sends each reminder when it's due.
//
// iPhones only allow notifications for websites added to the Home Screen
// and opened from there (iOS 16.4+).

import { account, getClient, onAccountChange } from './account.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';
import { makeContext } from './planner.js';
import { buildReminders, notifyPrefs } from './reminders.js';
import { getState, onLocalChange, update } from './store.js';

// support: ok | ios-browser (needs Add to Home Screen) | none
export const push = { support: 'none', permission: 'default', subscribed: false, busy: false, error: null, waiting: null };

const listeners = new Set();
export const onPushChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((l) => l(push));

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;

function detectSupport() {
  if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) return 'ok';
  return isIOS() && !standalone() ? 'ios-browser' : 'none';
}

const b64ToBytes = (b64) => Uint8Array.from(atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4)), (c) => c.charCodeAt(0));
const bytesToB64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf ?? []))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function registration() {
  return (await navigator.serviceWorker.getRegistration()) ?? navigator.serviceWorker.register('sw.js');
}

async function callFunction(body, { signedIn = false } = {}) {
  const headers = { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY };
  if (signedIn) {
    const { data } = await (await getClient()).auth.getSession();
    headers.Authorization = `Bearer ${data.session?.access_token}`;
  }
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/push`, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    throw new Error('Couldn’t connect. Check your internet and try again.');
  }
  if (res.status === 404 && !(await res.clone().json().catch(() => null))?.error) {
    throw new Error('Notifications aren’t set up on the server yet.');
  }
  const out = await res.json().catch(() => null);
  if (!res.ok) throw new Error(out?.error ?? `Something went wrong (${res.status}).`);
  return out;
}

async function rpc(name, args) {
  const { data, error } = await (await getClient()).rpc(name, args);
  if (error) {
    if (/function .* does not exist|could not find the function/i.test(error.message)) throw new Error('Notifications aren’t set up on the server yet.');
    throw new Error(error.message);
  }
  return data;
}

const saveSubscription = (sub) => {
  const { endpoint, keys } = sub.toJSON();
  return rpc('save_push_subscription', { endpoint, p256dh: keys.p256dh, auth: keys.auth });
};

async function run(fn) {
  push.busy = true;
  push.error = null;
  emit();
  try {
    return await fn();
  } catch (e) {
    push.error = e?.message ?? String(e);
  } finally {
    push.busy = false;
    emit();
  }
}

// Must be called from a tap (browsers only ask for permission then).
export const enablePush = () =>
  run(async () => {
    if (account.status !== 'signed-in') throw new Error('Sign in first, so reminders can reach this device.');
    push.permission = await Notification.requestPermission();
    if (push.permission !== 'granted') throw new Error('Notifications were not allowed. You can allow them in your browser or phone settings.');
    const reg = await registration();
    await navigator.serviceWorker.ready;
    const { publicKey } = await callFunction({ action: 'public-key' });
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with another server key can't be reused.
    if (sub && bytesToB64(sub.options.applicationServerKey) !== publicKey) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
    await saveSubscription(sub);
    push.subscribed = true;
    update((s) => {
      s.settings.notify = { ...notifyPrefs(s), enabled: true };
    });
    await syncQueue({ force: true });
  });

export const disablePush = () =>
  run(async () => {
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription();
    if (sub) {
      if (account.status === 'signed-in') await rpc('remove_push_subscription', { endpoint: sub.endpoint }).catch(() => {});
      await sub.unsubscribe();
    }
    push.subscribed = false;
  });

// Says plainly when nothing was delivered, and what the push service said.
export const sendTestPush = () =>
  run(async () => {
    const out = await callFunction({ action: 'test' }, { signedIn: true });
    if (out?.sent > 0) return out;
    const why = (out?.results ?? []).map((r) => `${r.service}: ${r.status ?? 'error'}${r.detail ? ` (${r.detail})` : ''}`).join('; ');
    throw new Error(`The test didn’t reach any device.${why ? ` ${why}` : ''}`);
  });

export function setNotifyPref(key, value) {
  update((s) => {
    s.settings.notify = { ...notifyPrefs(s), [key]: value };
  });
}

// ---------------------------------------------------------------------------
// Keep the server's list of reminders in step with the planner.

let lastSaved = null;
let timer = null;

export function scheduleQueueSync() {
  clearTimeout(timer);
  timer = setTimeout(() => syncQueue(), 4000);
}

export async function syncQueue({ force = false } = {}) {
  if (account.status !== 'signed-in') return;
  const state = getState();
  const prefs = notifyPrefs(state);
  try {
    if (!prefs.enabled) {
      if (lastSaved !== 'off' && lastSaved !== null) await rpc('clear_push_queue', {});
      lastSaved = 'off';
      return;
    }
    const items = buildReminders(makeContext(state), prefs).map((r) => ({
      key: r.key,
      send_at: r.sendAt.toISOString(),
      title: r.title,
      body: r.body,
      url: r.url,
    }));
    const text = JSON.stringify(items);
    if (!force && text === lastSaved) return;
    push.waiting = await rpc('replace_push_queue', { items });
    lastSaved = text;
    emit();
  } catch (e) {
    push.error = e?.message ?? String(e);
    emit();
  }
}

export async function initPush() {
  push.support = detectSupport();
  if (push.support === 'ok') {
    push.permission = Notification.permission;
    const sub = await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription().catch(() => null);
    push.subscribed = Boolean(sub) && push.permission === 'granted';
    emit();
  }
  onLocalChange(scheduleQueueSync);
  // Account events also fire for every sync; act only when the user changes.
  let user = null;
  onAccountChange(async () => {
    if (account.userId === user) return;
    user = account.userId;
    lastSaved = null;
    if (account.status !== 'signed-in') return;
    // Re-save this device in case the browser renewed its subscription.
    const sub = push.support === 'ok' ? await (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription().catch(() => null) : null;
    if (sub && push.permission === 'granted') await saveSubscription(sub).catch(() => {});
    syncQueue();
  });
  // Plans shift as the day goes on; refresh when the app comes back.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && scheduleQueueSync());
}
