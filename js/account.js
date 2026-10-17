// Accounts and sync, backed by Supabase. Each student has one row in the
// `planners` table holding their planner; row-level security limits every
// row to its owner (see supabase/schema.sql).
//
// Sync = pull the account copy, merge it with this device's copy, save the
// result here and push it back. It runs after local edits (debounced), when
// the app comes back to the foreground and when the device reconnects.

import { SUPABASE_ANON_KEY, SUPABASE_JS_URL, SUPABASE_URL } from './config.js';
import { applySynced, freshState, getState, onLocalChange, resetState } from './store.js';
import { mergeStates } from './sync-merge.js';

export const accountsEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// status: disabled | loading | signed-out | signed-in | unavailable
export const account = {
  status: accountsEnabled ? 'loading' : 'disabled',
  email: null,
  userId: null,
  syncing: false,
  lastSynced: null,
  error: null,
};

const listeners = new Set();
export const onAccountChange = (fn) => listeners.add(fn);
const emit = () => listeners.forEach((l) => l(account));

let clientPromise = null;
export const getClient = () =>
  (clientPromise ??= import(SUPABASE_JS_URL).then(({ createClient }) =>
    createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    }),
  ));

const appUrl = () => `${location.origin}${location.pathname}`;

export async function initAccount({ onPasswordRecovery }) {
  if (!accountsEnabled) return;
  try {
    const sb = await getClient();
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') onPasswordRecovery();
      setSession(session);
    });
    const { data } = await sb.auth.getSession();
    setSession(data.session);
  } catch {
    account.status = 'unavailable';
    account.error = 'Couldn’t reach the account server. Your planner still works on this device.';
    emit();
    return;
  }
  onLocalChange(scheduleSync);
  addEventListener('online', () => sync());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - (account.lastSynced ?? 0) > 30_000) sync();
  });
}

function setSession(session) {
  const userId = session?.user?.id ?? null;
  if (userId === account.userId && account.status !== 'loading') return;
  account.userId = userId;
  account.email = session?.user?.email ?? null;
  account.status = userId ? 'signed-in' : 'signed-out';
  account.error = null;
  emit();
  if (userId) sync();
}

let timer = null;
function scheduleSync() {
  clearTimeout(timer);
  timer = setTimeout(sync, 1500);
}

let running = null;
let again = false;

export function sync() {
  if (account.status !== 'signed-in') return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    account.syncing = true;
    emit();
    try {
      const sb = await getClient();
      const { data, error } = await sb.from('planners').select('data').eq('user_id', account.userId).maybeSingle();
      if (error) throw error;
      // Read local state only now, so edits made while we were waiting aren't lost.
      const local = getState();
      const mine = !local.ownerId || local.ownerId === account.userId ? local : freshState();
      const merged = { ...mergeStates(mine, data?.data ?? null), ownerId: account.userId };
      applySynced(merged);
      const { error: upErr } = await sb
        .from('planners')
        .upsert({ user_id: account.userId, data: merged, updated_at: new Date().toISOString() });
      if (upErr) throw upErr;
      account.lastSynced = Date.now();
      account.error = null;
    } catch (e) {
      account.error = navigator.onLine === false ? 'Offline. Changes will sync when you reconnect.' : `Sync failed: ${e?.message ?? e}`;
    } finally {
      account.syncing = false;
      running = null;
      emit();
      if (again) {
        again = false;
        sync();
      }
    }
  })();
  return running;
}

const AUTH_MESSAGES = [
  [/invalid login credentials/i, 'Wrong email or password.'],
  [/email not confirmed/i, 'Confirm your email first: check your inbox for the link, then sign in.'],
  [/already registered/i, 'There’s already an account with that email. Try signing in.'],
  [/password should be at least/i, 'Use a password with at least 8 characters.'],
  [/rate limit|too many/i, 'Too many tries. Wait a minute and try again.'],
  [/failed to fetch|network/i, 'Couldn’t connect. Check your internet and try again.'],
];

const friendly = (error) => {
  const msg = error?.message ?? String(error);
  return new Error(AUTH_MESSAGES.find(([re]) => re.test(msg))?.[1] ?? msg);
};

async function call(fn) {
  const sb = await getClient().catch(() => {
    throw new Error('Couldn’t reach the account server. Try again later.');
  });
  const { data, error } = await fn(sb.auth);
  if (error) throw friendly(error);
  return data;
}

export async function signUp(email, password) {
  const data = await call((auth) => auth.signUp({ email, password, options: { emailRedirectTo: appUrl() } }));
  return { needsConfirmation: !data.session };
}

export const signIn = (email, password) => call((auth) => auth.signInWithPassword({ email, password }));

export const sendPasswordReset = (email) => call((auth) => auth.resetPasswordForEmail(email, { redirectTo: appUrl() }));

export const setNewPassword = (password) => call((auth) => auth.updateUser({ password }));

export async function signOut({ clearDevice }) {
  clearTimeout(timer);
  await sync();
  await call((auth) => auth.signOut());
  if (clearDevice) resetState();
}
