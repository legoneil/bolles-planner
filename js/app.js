import {
  account,
  accountsEnabled,
  fetchSchoologyCalendar,
  initAccount,
  onAccountChange,
  sendPasswordReset,
  setNewPassword,
  signIn,
  signOut,
  signUp,
  sync,
} from './account.js';
import { CAMPUSES } from './data/bolles-2026-27.js';
import {
  addFriend,
  enableFriends,
  friends,
  initFriends,
  leaveFriends,
  loadFriends,
  onFriendsChange,
  removeFriend,
  respond,
} from './friends.js';
import { startOfMonth, todayISO } from './dates.js';
import {
  activityForm,
  assignmentForm,
  authForm,
  classForm,
  newPasswordForm,
  quickDue,
  readActivity,
  readAssignment,
  readClass,
  signOutForm,
  syncActivityForm,
  updateDueInfo,
  updateLunchHint,
} from './forms.js';
import { parseICS, schoologyToAssignments } from './ical.js';
import { buildExport, makeContext } from './planner.js';
import { suggestLunch } from './schedule.js';
import {
  allAssignments,
  defaultClasses,
  deleteAssignment,
  freshState,
  getState,
  mergeSchoology,
  replaceState,
  resetState,
  saveAssignment,
  subscribe,
  toggleDone,
  uid,
  update,
} from './store.js';
import { extension, initGrades, onExtensionChange } from './grades.js';
import { disablePush, enablePush, initPush, onPushChange, push, sendTestPush, setNotifyPref } from './notify.js';
import { renderDay } from './views/day.js';
import { renderGrades } from './views/grades.js';
import { renderFriendCompare, renderFriends } from './views/friends.js';
import { renderMonth } from './views/month.js';
import { renderOnboarding } from './views/onboarding.js';
import { renderPlan } from './views/plan.js';
import { renderSettings } from './views/settings.js';
import { renderTodo } from './views/todo.js';
import { renderWeek } from './views/week.js';

const $view = document.getElementById('view');
const $nav = document.getElementById('tabs');
const $fab = document.getElementById('fab');
const $sheet = document.getElementById('sheet');
const $toast = document.getElementById('toast');

const ui = {
  todo: { classId: 'all', show: 'open' },
  onboarding: { step: 1, campus: null, grade: null, classes: defaultClasses() },
  sheetItem: null,
};

// ---------------------------------------------------------------------------
// Routing and rendering

function route() {
  const [, name = 'today', arg] = location.hash.split('/');
  return { name, arg };
}

function render() {
  const state = getState();
  applyTheme(state.settings.theme);
  const onboarding = !state.profile;
  document.body.classList.toggle('onboarding', onboarding);
  if (onboarding) {
    $view.innerHTML = renderOnboarding(ui.onboarding, { accounts: accountsEnabled && account.status !== 'signed-in' });
    return;
  }
  const ctx = { ...makeContext(state), account, extension, push };
  const { name, arg } = route();
  const valid = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');
  let html;
  switch (name) {
    case 'day':
      html = renderDay(ctx, valid(arg) ? arg : ctx.today);
      break;
    case 'week':
      html = renderWeek(ctx, valid(arg) ? arg : ctx.today);
      break;
    case 'month':
      html = renderMonth(ctx, /^\d{4}-\d{2}$/.test(arg ?? '') ? `${arg}-01` : startOfMonth(ctx.today));
      break;
    case 'todo':
      html = renderTodo(ctx, ui.todo);
      break;
    case 'settings':
      html = renderSettings(ctx);
      break;
    case 'grades':
      html = renderGrades(ctx, extension);
      break;
    case 'plan':
      html = renderPlan(ctx);
      break;
    case 'friends':
      html = renderFriends(ctx, friends, account);
      loadFriends();
      break;
    case 'friend': {
      const [, , id, date] = location.hash.split('/');
      html = renderFriendCompare(ctx, friends, id, valid(date) ? date : ctx.today);
      loadFriends();
      break;
    }
    default:
      html = renderDay(ctx, ctx.today);
  }
  const tab = name === 'day' || name === 'grades' || name === 'plan' ? 'today' : name === 'friend' ? 'friends' : name;
  for (const a of $nav.querySelectorAll('a')) a.toggleAttribute('aria-current', a.dataset.tab === tab);
  const scroll = window.scrollY;
  $view.innerHTML = html;
  if (ui.lastRoute === location.hash) window.scrollTo(0, scroll);
  ui.lastRoute = location.hash;
}

function applyTheme(theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

function toast(msg) {
  $toast.textContent = msg;
  $toast.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => ($toast.hidden = true), 3500);
}

// ---------------------------------------------------------------------------
// Sheets (dialogs)

function openSheet(html, item = null) {
  ui.sheetItem = item;
  $sheet.innerHTML = html;
  if (!$sheet.open) $sheet.showModal();
  const form = $sheet.querySelector('form');
  const ctx = makeContext(getState());
  if (form?.dataset.form === 'assignment') updateDueInfo(form, ctx);
  if (form?.dataset.form === 'class') updateLunchHint(form);
  if (form?.dataset.form === 'activity') syncActivityForm(form);
}

const closeSheet = () => $sheet.open && $sheet.close();

function openAssignment(id, preset = {}) {
  const ctx = makeContext(getState());
  const a = id ? allAssignments().find((x) => x.id === id) : { type: 'homework', dueDate: '', ...preset };
  if (a) openSheet(assignmentForm(a, ctx), a);
}

// ---------------------------------------------------------------------------
// Schoology

let schoologyRunning = false;
let schoologyAttempt = 0;

async function syncSchoology(url = getState().schoology.url, { quiet = false } = {}) {
  if (!url || schoologyRunning) return;
  schoologyRunning = true;
  schoologyAttempt = Date.now();
  try {
    await runSchoologySync(url, quiet);
  } finally {
    schoologyRunning = false;
  }
}

async function runSchoologySync(url, quiet) {
  const httpsUrl = url.trim().replace(/^webcal:\/\//i, 'https://');
  let text = null;
  let error = null;
  try {
    text = await fetchSchoologyText(httpsUrl);
  } catch (e) {
    error = e.message;
  }
  if (!text?.includes('BEGIN:VCALENDAR')) {
    update((s) => {
      s.schoology.lastError = error ?? 'That link didn’t return a calendar. Check it, or upload the .ics file instead.';
    });
    if (!quiet) toast('Schoology sync didn’t work. See Settings.');
    return;
  }
  const n = importICS(text);
  if (!quiet) toast(`Schoology synced · ${n} items`);
}

// Signed in: through our server. Accounts off: an optional self-hosted proxy.
async function fetchSchoologyText(url) {
  if (accountsEnabled) return fetchSchoologyCalendar(url);
  const proxy = getState().settings.proxyUrl;
  if (!proxy) throw new Error('Your browser can’t read Schoology links directly. Upload the .ics file below.');
  return fetchText(`${proxy.replace(/\/$/, '')}/?url=${encodeURIComponent(url)}`);
}

// Sync on open (and when returning to the app) if the last sync is stale.
function maybeSyncSchoology() {
  const s = getState().schoology;
  if (!s.url || Date.now() - (s.lastSync ?? 0) < 30 * 60 * 1000) return;
  if (Date.now() - schoologyAttempt < 5 * 60 * 1000) return; // don't hammer after a failure
  if (accountsEnabled && account.status !== 'signed-in') return;
  syncSchoology(s.url, { quiet: true });
}

async function fetchText(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function importICS(text) {
  const events = parseICS(text);
  const items = schoologyToAssignments(events, getState().profile.classes);
  mergeSchoology(items);
  return items.length;
}

// ---------------------------------------------------------------------------
// Actions

const actions = {
  'toggle-done': (el) => toggleDone(el.dataset.id),
  'edit-assignment': (el) => openAssignment(el.dataset.id),
  'delete-assignment': (el) => {
    deleteAssignment(el.dataset.id);
    closeSheet();
    toast('Removed');
  },
  'close-sheet': closeSheet,
  'due-quick': (el) => {
    const form = el.closest('form');
    const ctx = makeContext(getState());
    const err = quickDue(form, el.dataset.when, ctx);
    if (err) toast(err);
    updateDueInfo(form, ctx);
  },
  'todo-filter': (el) => {
    ui.todo.classId = el.dataset.class;
    render();
  },
  'todo-show': (el) => {
    ui.todo.show = el.dataset.show;
    render();
  },
  'add-class': () => {
    const s = getState();
    const used = new Set(s.profile.classes.map((c) => Number(c.period)));
    const period = [1, 2, 3, 4, 5, 6, 7].find((p) => !used.has(p)) ?? 1;
    const c = { ...defaultClasses()[period - 1], id: uid() };
    openSheet(classForm(c, makeContext(s)), c);
  },
  'edit-class': (el) => {
    const s = getState();
    const c = s.profile.classes.find((x) => x.id === el.dataset.id);
    if (c) openSheet(classForm(c, makeContext(s)), c);
  },
  'delete-class': (el) => {
    update((s) => {
      s.profile.classes = s.profile.classes.filter((c) => c.id !== el.dataset.id);
    });
    closeSheet();
  },
  'add-activity': () => openSheet(activityForm({ days: [] })),
  'edit-activity': (el) => {
    const a = getState().activities.find((x) => x.id === el.dataset.id);
    if (a) openSheet(activityForm(a), a);
  },
  'delete-activity': (el) => {
    update((s) => {
      s.activities = s.activities.filter((a) => a.id !== el.dataset.id);
    });
    closeSheet();
  },
  'remove-closure': (el) =>
    update((s) => {
      delete s.profile.closures[el.dataset.date];
    }),
  'set-theme': (el) =>
    update((s) => {
      s.settings.theme = el.dataset.theme;
    }),
  'push-enable': () => enablePush(),
  'push-disable': () => disablePush(),
  'push-test': async () => {
    await sendTestPush();
    if (!push.error) toast('Test sent. It should arrive in a few seconds.');
  },
  'set-budget': (el) =>
    update((s) => {
      s.settings.studyBudget = Number(el.dataset.minutes) || null;
    }),
  // Check off a study session: the minutes count toward that assignment.
  'log-session': (el) => {
    const a = allAssignments().find((x) => x.id === el.dataset.id);
    if (!a) return;
    const sessions = { ...(a.sessions ?? {}) };
    if (sessions[el.dataset.date]) delete sessions[el.dataset.date];
    else sessions[el.dataset.date] = Number(el.dataset.minutes);
    saveAssignment({ ...a, sessions });
  },
  backup: () => download(`bolles-planner-backup-${todayISO()}.json`, JSON.stringify(getState(), null, 2), 'application/json'),
  reset: () => {
    const signedIn = account.status === 'signed-in';
    const msg = signedIn
      ? 'Erase all classes, assignments and settings on this device AND in your account? This cannot be undone.'
      : 'Erase all classes, assignments and settings on this device? This cannot be undone.';
    if (!confirm(msg)) return;
    // Signed in: erase as a normal edit so the deletion syncs to the account.
    if (signedIn) update((s) => ({ ...freshState(), ownerId: s.ownerId }));
    else resetState();
    ui.onboarding = { step: 1, campus: null, grade: null, classes: defaultClasses() };
    location.hash = '#/today';
  },
  'clear-grades': () => {
    if (confirm('Remove your grades from the planner (this device and your account)? The extension will add them again next time you open Schoology unless you remove it.')) {
      update((s) => {
        s.grades = null;
      });
    }
  },
  'friends-refresh': () => loadFriends({ force: true }),
  'friend-accept': (el) => friendAction(() => respond(el.dataset.id, true), 'Friend added'),
  'friend-decline': (el) => friendAction(() => respond(el.dataset.id, false)),
  'friend-cancel': (el) => friendAction(() => removeFriend(el.dataset.id), 'Request canceled'),
  'friend-remove': (el) => {
    if (!confirm(`Remove ${el.dataset.name} as a friend? You'll stop seeing each other's schedules.`)) return;
    friendAction(() => removeFriend(el.dataset.id), 'Removed').then(() => (location.hash = '#/friends'));
  },
  'friends-leave': () => {
    if (!confirm('Stop sharing your schedule and remove all your friends? You can turn friends on again later, but you will get a new code.')) return;
    friendAction(leaveFriends, 'Friends turned off');
  },
  'share-code': async (el) => {
    const code = el.dataset.code;
    const text = `Add me on Bolles Planner! My friend code is ${code.slice(0, 4)}-${code.slice(4)}. ${location.origin}${location.pathname}#/friends`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast('Copied. Paste it to a friend.');
      }
    } catch {
      // Share sheet dismissed.
    }
  },
  'open-auth': (el) => openSheet(authForm(el.dataset.mode, { email: $sheet.querySelector('[name=email]')?.value ?? '' })),
  'sync-now': () => sync(),
  'open-sign-out': () => openSheet(signOutForm(account.email)),
  'sign-out': async (el) => {
    el.disabled = true;
    try {
      await signOut({ clearDevice: Boolean(el.dataset.clear) });
      closeSheet();
      toast('Signed out');
    } catch (e) {
      el.disabled = false;
      toast(e.message);
    }
  },
  'onboard-back': () => {
    ui.onboarding.step = 1;
    render();
  },
};

async function friendAction(fn, done) {
  try {
    await fn();
    if (done) toast(done);
  } catch (e) {
    toast(e.message);
  }
}

const forms = {
  'friends-enable': async (form) => {
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    await friendAction(() => enableFriends(form.name.value.trim()), 'Friends turned on');
    button.disabled = false;
  },
  'friends-rename': (form) => friendAction(() => enableFriends(form.name.value.trim()), 'Name saved'),
  'friend-add': async (form) => {
    const msg = form.parentElement.querySelector('[data-friend-message]');
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try {
      const res = await addFriend(form.code.value);
      if (res.ok) form.reset();
      // The view re-renders after loading, so report through a toast too.
      toast(res.message);
      if (msg?.isConnected) {
        msg.textContent = res.message;
        msg.classList.toggle('is-error', !res.ok);
      }
    } catch (e) {
      toast(e.message);
    } finally {
      button.disabled = false;
    }
  },
  auth: async (form) => {
    const mode = form.dataset.mode;
    const email = form.email.value.trim();
    const password = form.password?.value ?? '';
    const button = form.querySelector('[type=submit]');
    const message = (text, isError = false) => {
      const el = form.querySelector('[data-auth-message]');
      el.textContent = text;
      el.classList.toggle('is-error', isError);
    };
    button.disabled = true;
    message('');
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        closeSheet();
        toast('Signed in. Syncing your planner…');
      } else if (mode === 'signup') {
        const { needsConfirmation } = await signUp(email, password);
        if (needsConfirmation) openSheet(authForm('signin', { email, message: `Check ${email} for a confirmation link, then sign in here.` }));
        else {
          closeSheet();
          toast('Account created. Your planner is saved online.');
        }
      } else {
        await sendPasswordReset(email);
        message('If that email has an account, a reset link is on its way.');
      }
    } catch (e) {
      message(e.message, true);
    } finally {
      button.disabled = false;
    }
  },
  'new-password': async (form) => {
    const msg = form.querySelector('[data-auth-message]');
    try {
      await setNewPassword(form.password.value);
      closeSheet();
      toast('Password updated');
    } catch (e) {
      msg.textContent = e.message;
      msg.classList.add('is-error');
    }
  },
  assignment: (form) => {
    const a = readAssignment(form, ui.sheetItem);
    if (!a.title || !a.dueDate) return;
    saveAssignment(a);
    closeSheet();
    toast(ui.sheetItem?.id ? 'Saved' : 'Added');
  },
  class: (form) => {
    const c = readClass(form, ui.sheetItem);
    update((s) => {
      const clash = s.profile.classes.find((x) => x.id !== c.id && Number(x.period) === c.period);
      if (clash) clash.period = Number(ui.sheetItem?.period) || clash.period;
      const i = s.profile.classes.findIndex((x) => x.id === c.id);
      if (i >= 0) s.profile.classes[i] = c;
      else s.profile.classes.push(c);
    });
    closeSheet();
  },
  activity: (form) => {
    const a = readActivity(form, ui.sheetItem);
    if (!a.date && !a.days.length) return toast('Pick at least one day.');
    update((s) => {
      const i = s.activities.findIndex((x) => x.id === a.id);
      if (i >= 0) s.activities[i] = a;
      else s.activities.push(a);
    });
    closeSheet();
  },
  schoology: (form) => {
    const url = form.url.value.trim();
    update((s) => {
      s.schoology.url = url;
    });
    if (url) syncSchoology(url);
  },
  proxy: (form) => {
    update((s) => {
      s.settings.proxyUrl = form.proxy.value.trim();
    });
    toast('Saved');
  },
  closure: (form) => {
    const date = form.date.value;
    if (!date) return;
    update((s) => {
      s.profile.closures ??= {};
      s.profile.closures[date] = form.reason.value.trim();
    });
    form.reset();
  },
  export: (form) => {
    const ctx = makeContext(getState());
    const ics = buildExport(ctx, {
      assignments: form.assignments.checked,
      events: form.events.checked,
      schedule: form.schedule.checked,
    });
    download('bolles-planner.ics', ics, 'text/calendar');
  },
  'onboard-school': (form) => {
    ui.onboarding.campus = form.campus.value;
    ui.onboarding.grade = Number(form.grade.value);
    const grades = CAMPUSES[form.campus.value].grades;
    if (!grades.includes(ui.onboarding.grade)) return toast(`${CAMPUSES[form.campus.value].shortName} is grades ${grades[0]}–${grades.at(-1)}.`);
    ui.onboarding.step = 2;
    render();
    window.scrollTo(0, 0);
  },
  'onboard-classes': (form) => {
    const f = new FormData(form);
    const hasLunch = CAMPUSES[ui.onboarding.campus].hasLunchSplit;
    const classes = ui.onboarding.classes
      .map((c, i) => ({
        ...c,
        name: String(f.get(`name-${i}`) ?? '').trim(),
        teacher: String(f.get(`teacher-${i}`) ?? '').trim(),
        room: String(f.get(`room-${i}`) ?? '').trim(),
        type: f.get(`type-${i}`),
      }))
      .filter((c) => c.name)
      .map((c) => ({ ...c, lunch: hasLunch ? suggestLunch(c.teacher) : null }));
    update((s) => {
      s.profile = { campus: ui.onboarding.campus, grade: ui.onboarding.grade, classes, closures: {} };
    });
    location.hash = '#/today';
  },
};

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Event wiring

document.addEventListener('click', (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) {
    closeSheet();
    location.hash = nav.dataset.nav;
    return;
  }
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action] && el.tagName !== 'SELECT' && el.type !== 'file') {
    e.preventDefault();
    actions[el.dataset.action](el);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form || !forms[form.dataset.form]) return;
  e.preventDefault();
  forms[form.dataset.form](form);
});

document.addEventListener('change', async (e) => {
  const el = e.target;
  const action = el.dataset.action;
  if (action === 'set-campus')
    update((s) => {
      s.profile.campus = el.value;
      if (!CAMPUSES[el.value].grades.includes(Number(s.profile.grade))) s.profile.grade = CAMPUSES[el.value].grades[0];
    });
  else if (action === 'notify-pref') setNotifyPref(el.dataset.pref, el.checked);
  else if (action === 'notify-time' && /^\d{2}:\d{2}$/.test(el.value)) setNotifyPref(el.dataset.pref, el.value);
  else if (action === 'set-grade')
    update((s) => {
      s.profile.grade = Number(el.value);
    });
  else if (action === 'upload-ics' && el.files[0]) {
    const n = importICS(await el.files[0].text());
    toast(`Imported ${n} items from Schoology`);
  } else if (action === 'restore' && el.files[0]) {
    try {
      const data = JSON.parse(await el.files[0].text());
      if (!data || typeof data !== 'object' || !('assignments' in data)) throw new Error('bad');
      if (confirm('Replace everything on this device with the backup?')) replaceState(data);
    } catch {
      toast('That file isn’t a Bolles Planner backup.');
    }
  }
  const form = el.closest('form');
  if (form?.dataset.form === 'assignment') updateDueInfo(form, makeContext(getState()));
  if (form?.dataset.form === 'activity') syncActivityForm(form);
  if (form?.dataset.form === 'class' && el.name === 'lunch') el.dataset.touched = '1';
  rememberOnboarding(el);
});

document.addEventListener('input', (e) => {
  const form = e.target.closest('form');
  if (form?.dataset.form === 'class' && e.target.name === 'teacher') updateLunchHint(form);
  rememberOnboarding(e.target);
});

// Keep what's been typed during setup in the draft, so a re-render (e.g. the
// account finishing loading) never wipes it.
function rememberOnboarding(el) {
  const form = el.closest?.('form')?.dataset.form;
  const draft = ui.onboarding;
  if (form === 'onboard-school') {
    if (el.name === 'campus') draft.campus = el.value;
    if (el.name === 'grade') draft.grade = Number(el.value) || null;
  } else if (form === 'onboard-classes') {
    const [, field, i] = el.name.match(/^(name|teacher|room|type)-(\d+)$/) ?? [];
    if (field && draft.classes[i]) draft.classes[i][field] = el.value;
  }
}

$sheet.addEventListener('click', (e) => {
  if (e.target === $sheet) closeSheet();
});

$fab.addEventListener('click', () => {
  const { name, arg } = route();
  const preset = name === 'day' && arg && arg >= todayISO() ? { dueDate: arg } : {};
  openAssignment(null, preset);
});

window.addEventListener('hashchange', render);
subscribe(render);
onAccountChange(render);
// Once signed in (on load or after signing in), catch up on Schoology.
let lastAccountUser = null;
onAccountChange(() => {
  if (account.userId === lastAccountUser) return;
  lastAccountUser = account.userId;
  if (account.status !== 'signed-in') return;
  schoologyAttempt = 0; // attempts made while signed out don't count
  maybeSyncSchoology();
});
onFriendsChange(() => {
  const { name } = route();
  if (name === 'friends' || name === 'friend') render();
});
initFriends();
initGrades();
onExtensionChange(() => ['grades', 'settings'].includes(route().name) && render());
onPushChange(() => route().name === 'settings' && render());
initPush();
initAccount({ onPasswordRecovery: () => openSheet(newPasswordForm()) });

// Keep "now / next" fresh and roll over at midnight.
setInterval(() => {
  const { name } = route();
  if (!$sheet.open && getState().profile && (name === 'today' || name === 'day' || name === '')) render();
}, 60_000);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') maybeSyncSchoology();
});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
maybeSyncSchoology();
