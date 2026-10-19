import { budgetPicker } from './plan.js';
import { buildReminders, notifyPrefs } from '../reminders.js';
import { CAMPUSES } from '../data/bolles-2026-27.js';
import { formatDate, formatRange } from '../dates.js';
import { className, esc, ordinal } from '../ui.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function renderSettings(ctx) {
  const { state, profile } = ctx;
  const campus = CAMPUSES[profile.campus];
  const classes = [...profile.classes].sort((a, b) => a.period - b.period);
  const sgy = state.schoology;
  const closures = Object.entries(profile.closures ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return `
    <header class="view-head"><div class="day-title"><h1>Settings</h1></div></header>
    ${accountCard(ctx.account)}
    ${notificationsCard(ctx)}

    <section class="card">
      <h2>Your school</h2>
      <div class="form-row">
        <label>Campus
          <select data-action="set-campus">
            ${Object.values(CAMPUSES).map((c) => `<option value="${c.id}" ${c.id === profile.campus ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
        </label>
        <label>Grade
          <select data-action="set-grade">
            ${campus.grades.map((g) => `<option value="${g}" ${Number(profile.grade) === g ? 'selected' : ''}>${ordinal(g)} grade</option>`).join('')}
          </select>
        </label>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Classes</h2><button class="btn small" data-action="add-class">Add class</button></div>
      <ul class="class-list">
        ${classes
          .map(
            (c) => `<li><button class="class-row" data-action="edit-class" data-id="${esc(c.id)}" style="--c:${esc(c.color)}">
              <span class="period">P${c.period}</span>
              <span class="class-row-main"><b>${esc(className(c))}</b>
                <small>${esc([c.type !== 'Regular' && c.type, c.teacher, c.room && `Room ${c.room}`, campus.hasLunchSplit && lunchText(c)].filter(Boolean).join(' · ') || 'Tap to add details')}</small></span>
            </button></li>`,
          )
          .join('')}
      </ul>
      ${missingPeriods(classes)}
    </section>

    <section class="card">
      <h2>Schoology</h2>
      ${connectCard(ctx)}
      <p class="muted">${ctx.state.schoology.api?.accessToken ? 'Connected accounts sync automatically, so you don\u2019t need a calendar link.' : 'Or paste your Schoology calendar link once'} and your assignments and tests stay up to date: they sync every time you open the planner. In Schoology, open your <b>Calendar</b> and use its export (iCal) option to copy the link. It usually starts with <code>webcal://bolles.schoology.com</code>.</p>
      ${ctx.account?.status === 'signed-out' ? '<p class="muted small"><b>Sign in</b> (top of Settings) to sync automatically. Without an account, use the upload option below.</p>' : ''}
      <form class="inline-form" data-form="schoology">
        <input type="url" name="url" inputmode="url" placeholder="webcal://bolles.schoology.com/calendar/feed/ical/..." value="${esc(sgy.url)}" aria-label="Schoology calendar link" />
        <button class="btn" type="submit">${sgy.url ? 'Sync now' : 'Connect'}</button>
      </form>
      ${sgy.lastSync ? `<p class="muted small">Last synced ${esc(new Date(sgy.lastSync).toLocaleString())} · ${state.assignments.filter((a) => a.source === 'schoology').length} items</p>` : ''}
      ${sgy.lastError ? `<p class="error small">${esc(sgy.lastError)}</p>` : ''}
      <p class="muted small">Or open the link in your browser to download the <code>.ics</code> file, then
        <label class="link-btn file-btn">upload it here<input type="file" accept=".ics,text/calendar" data-action="upload-ics" hidden /></label>.</p>
      ${ctx.account?.status && ctx.account.status !== 'disabled' ? '' : `<details class="small"><summary>Advanced: sync server</summary>
        <p class="muted">Browsers can't read Schoology links directly. A tiny sync server (see <code>workers/schoology-proxy.js</code>) fixes that.</p>
        <form class="inline-form" data-form="proxy">
          <input type="url" name="proxy" placeholder="https://your-proxy.workers.dev" value="${esc(state.settings.proxyUrl)}" aria-label="Sync server URL" />
          <button class="btn secondary" type="submit">Save</button>
        </form>
      </details>`}
    </section>

    <section class="card">
      <h2>Grades</h2>
      ${state.grades?.courses?.length
        ? `<p class="muted">${state.grades.courses.length} courses from Schoology, updated ${esc(new Date(state.grades.readAt).toLocaleString())}. <button class="link-btn" data-nav="#/grades">See grades</button></p>`
        : '<p class="muted">Bring in your Schoology grades with the <b>Rotation Planner Grades</b> Chrome extension on your laptop.</p>'}
      <p class="muted small">${gradesSyncText(ctx)}
        <a href="https://github.com/legoneil/rotation-planner/blob/claude/zealous-fermat-gt2k97/docs/EXTENSION.md" target="_blank" rel="noopener">${ctx.extension?.installed ? 'Help' : 'How to install'}</a></p>
      <div class="btn-row" style="margin-top:12px;align-items:center;gap:16px">
        ${ctx.extension?.canLink ? '<button class="btn secondary small" data-action="refresh-grades">Check Schoology now</button>' : ''}
        ${state.grades ? '<button class="link-btn danger small" data-action="clear-grades">Remove grades from my planner</button>' : ''}
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Sports, clubs and activities</h2><button class="btn small" data-action="add-activity">Add</button></div>
      ${ctx.activities.length
        ? `<ul class="class-list">${ctx.activities
            .map(
              (a) => `<li><button class="class-row" data-action="edit-activity" data-id="${esc(a.id)}" style="--c:${esc(a.color)}">
                <span class="class-row-main"><b>${esc(a.title)}</b>
                <small>${esc(a.date ? formatDate(a.date) : a.days.map((d) => DAY_NAMES[d]).join(', '))} · ${esc(formatRange(a.start, a.end))}</small></span>
              </button></li>`,
            )
            .join('')}</ul>`
        : '<p class="muted">Add practices, games, rehearsals or club meetings so they show up on your schedule.</p>'}
    </section>

    <section class="card">
      <h2>Unplanned closures</h2>
      <p class="muted">For hurricane days or other surprise closures. That day's letter is skipped, as the school does.</p>
      <form class="inline-form" data-form="closure">
        <input type="date" name="date" required aria-label="Date" />
        <input type="text" name="reason" placeholder="Reason (e.g. Hurricane)" aria-label="Reason" />
        <button class="btn secondary" type="submit">Mark closed</button>
      </form>
      ${closures.length ? `<ul class="plain-list">${closures
        .map(([d, r]) => `<li>${esc(formatDate(d))}${r ? ` · ${esc(r)}` : ''} <button class="link-btn" data-action="remove-closure" data-date="${d}">Undo</button></li>`)
        .join('')}</ul>` : ''}
    </section>

    <section class="card">
      <h2>Add to Google or Apple Calendar</h2>
      <p class="muted">Download a calendar file and open it to add everything to your phone's calendar app, including its reminders.</p>
      <form data-form="export" class="stack">
        <label class="check-row"><input type="checkbox" name="assignments" checked /> Assignments and tests</label>
        <label class="check-row"><input type="checkbox" name="events" checked /> Letter days and school events</label>
        <label class="check-row"><input type="checkbox" name="schedule" /> My class schedule (every class meeting)</label>
        <button class="btn secondary" type="submit">Download .ics</button>
      </form>
    </section>

    <section class="card">
      <h2>Study time</h2>
      <p class="muted">How long you can usually work on a school night. The plan spreads tests and projects over your free periods and evenings, and warns you when a night won't fit.</p>
      ${budgetPicker(ctx)}
    </section>

    <section class="card">
      <h2>Appearance</h2>
      <div class="seg" role="radiogroup" aria-label="Theme">
        ${['auto', 'light', 'dark'].map((t) => `<button role="radio" aria-checked="${state.settings.theme === t}" class="${state.settings.theme === t ? 'on' : ''}" data-action="set-theme" data-theme="${t}">${t === 'auto' ? 'Match device' : t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2>Backup</h2>
      <p class="muted">${ctx.account?.status === 'signed-in' ? 'Your planner is saved to your account. You can also download a copy.' : 'Your planner is saved on this device. Download a backup to keep a copy or move it to another device.'}</p>
      <div class="btn-row">
        <button class="btn secondary" data-action="backup">Download backup</button>
        <label class="btn secondary file-btn">Restore backup<input type="file" accept="application/json,.json" data-action="restore" hidden /></label>
      </div>
    </section>

    <section class="card about">
      <h2>About</h2>
      <p>A student-made planner for The Bolles School. It is <b>not</b> an official Bolles app and is not affiliated with or endorsed by the school.
        Schedules come from the 2026-27 student planners. Always check official school communications for changes.</p>
      <p><a href="privacy.html">Privacy policy</a>: what the planner stores, who can see it, and how to delete it.</p>
      <button class="link-btn danger" data-action="reset">${ctx.account?.status === 'signed-in' ? 'Erase all planner data (this device and your account)' : 'Erase all planner data'}</button>
    </section>`;
}

function gradesSyncText(ctx) {
  const ext = ctx.extension;
  if (!ext?.installed) return 'Extension not detected in this browser.';
  if (!ext.canLink) return `Extension connected (version ${esc(ext.version ?? '?')}). Update it to keep grades updating on their own.`;
  const parts = [
    ext.status?.loggedOut
      ? '<b>Log in to Schoology</b> to keep grades updating.'
      : ext.status?.needsVisit
        ? '<b>Open any Schoology page</b> to update grades. This browser doesn’t let the extension check in the background, so keeping a Schoology tab open keeps them updating every 30 minutes.'
        : 'Grades update every 30 minutes while your browser is open.',
  ];
  if (ext.status && !ext.status.ok && !ext.status.loggedOut && !ext.status.needsVisit) parts.push(`Last check: ${esc(ext.status.message)}`);
  if (ctx.account?.status === 'signed-in') {
    parts.push(ext.linkedUser === ctx.account.userId ? 'New grades go straight to your account, so your phone stays up to date.' : 'Linking the extension to your account…');
  }
  return parts.join(' ');
}

const KINDS = [
  ['morning', 'morningTime', 'Morning', 'Letter day, first class and room, tests today'],
  ['evening', 'eveningTime', 'Night before', 'What’s due tomorrow, tests first'],
  ['plan', 'planTime', 'Study plan', 'How long tonight will take, and what to do'],
  ['weekAhead', null, 'Week ahead', 'A warning when a day has 3 or more tests'],
];

function notificationsCard(ctx) {
  const { account, push } = ctx;
  if (!account || account.status === 'disabled' || !push) return '';
  const prefs = notifyPrefs(ctx.state);
  const head = '<h2>Notifications</h2>';
  if (account.status !== 'signed-in') {
    return `<section class="card">${head}<p class="muted">Sign in to get reminders on your phone: tests tomorrow, your letter day each morning, and tonight’s study plan.</p></section>`;
  }

  let device;
  if (push.support === 'ios-browser') {
    device = `<div class="notice">
      <p><b>On iPhone, add the planner to your Home Screen first.</b></p>
      <ol class="steps small">
        <li>Tap the <b>Share</b> button in Safari.</li>
        <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
        <li>Open Rotation Planner from your Home Screen and come back here.</li>
      </ol>
    </div>`;
  } else if (push.support !== 'ok') {
    device = '<p class="muted small">This browser can’t show notifications. Try Chrome, Edge, Firefox or Safari.</p>';
  } else if (push.permission === 'denied') {
    device = '<p class="warning">Notifications are blocked for this site. Allow them in your browser’s site settings (or Settings → Notifications on iPhone), then reload.</p>';
  } else if (push.subscribed) {
    device = `<div class="notify-status"><span class="dot-on" aria-hidden="true"></span><b>On for this device</b></div>
      <div class="btn-row">
        <button class="btn secondary small" data-action="push-test" ${push.busy ? 'disabled' : ''}>Send a test</button>
        <button class="btn secondary small" data-action="push-disable" ${push.busy ? 'disabled' : ''}>Turn off on this device</button>
      </div>
      <p class="muted small" style="margin-top:10px">Test not showing up? ${/Mac/.test(navigator.platform) && !/iPhone|iPad/.test(navigator.userAgent)
        ? 'On a Mac, open System Settings → Notifications, find your browser, and turn on Allow notifications. Also check Focus / Do Not Disturb.'
        : 'Check that notifications are allowed for your browser in your device’s settings, and that Do Not Disturb is off.'}</p>`;
  } else {
    device = `<p class="muted">Get reminders on this ${/iPhone|Android/.test(navigator.userAgent) ? 'phone' : 'device'}, even when the planner is closed.</p>
      <button class="btn" data-action="push-enable" ${push.busy ? 'disabled' : ''}>${push.busy ? 'Turning on…' : 'Turn on notifications'}</button>`;
  }

  const kinds = KINDS.map(
    ([key, timeKey, label, hint]) => `<li class="notify-kind">
      <label class="switch-row"><input type="checkbox" role="switch" data-action="notify-pref" data-pref="${key}" ${prefs[key] ? 'checked' : ''} />
        <span><b>${label}</b><small>${hint}</small></span></label>
      ${timeKey ? `<input type="time" class="time-input" data-action="notify-time" data-pref="${timeKey}" value="${esc(prefs[timeKey])}" aria-label="${label} time" ${prefs[key] ? '' : 'disabled'} />` : ''}
    </li>`,
  ).join('');

  const upcoming = prefs.enabled ? buildReminders(ctx, prefs).slice(0, 3) : [];
  const preview = upcoming.length
    ? `<div class="notify-preview"><p class="eyebrow">Coming up</p><ul>${upcoming
        .map((r) => `<li><span class="np-when">${esc(r.sendAt.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' }))}</span>
          <span class="np-msg"><b>${esc(r.title)}</b><small>${esc(r.body)}</small></span></li>`)
        .join('')}</ul></div>`
    : '';

  return `<section class="card">
    ${head}
    ${device}
    ${push.error ? `<p class="error small">${esc(push.error)}</p>` : ''}
    <ul class="notify-kinds">${kinds}</ul>
    ${preview}
  </section>`;
}

function accountCard(account) {
  if (!account || account.status === 'disabled') return '';
  if (account.status === 'loading') return '<section class="card"><h2>Account</h2><p class="muted">Checking your account…</p></section>';
  if (account.status === 'signed-in') {
    const when = account.syncing
      ? 'Syncing…'
      : account.lastSynced
        ? `Synced ${new Date(account.lastSynced).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
        : 'Not synced yet';
    return `<section class="card">
      <h2>Account</h2>
      <p>Signed in as <b>${esc(account.email)}</b></p>
      <p class="muted small">${esc(when)}. Your planner syncs between your devices automatically.</p>
      ${account.error ? `<p class="error small">${esc(account.error)}</p>` : ''}
      <div class="btn-row" style="margin-top:10px">
        <button class="btn secondary small" data-action="sync-now" ${account.syncing ? 'disabled' : ''}>Sync now</button>
        <button class="btn secondary small" data-action="open-sign-out">Sign out</button>
      </div>
    </section>`;
  }
  return `<section class="card">
    <h2>Account</h2>
    <p class="muted">Sign in to save your planner online and use it on your phone and your laptop.</p>
    ${account.error ? `<p class="error small">${esc(account.error)}</p>` : ''}
    ${account.status === 'unavailable' ? '' : `<div class="btn-row" style="margin-top:10px">
      <button class="btn small" data-action="open-auth" data-mode="signin">Sign in</button>
      <button class="btn secondary small" data-action="open-auth" data-mode="signup">Create account</button>
    </div>`}
  </section>`;
}

function connectCard(ctx) {
  const account = ctx.account;
  if (!account || account.status === 'disabled') return '';
  const api = ctx.state.schoology.api;
  if (!api?.accessToken) {
    if (account.status !== 'signed-in') return '';
    return `<div class="connect-box">
      <p><b>Connect Schoology</b> to import your courses, assignments and grades automatically. You approve it on Schoology's own site; Rotation Planner never sees your password.</p>
      <button class="btn" data-action="sgy-connect">Connect Schoology</button>
    </div>`;
  }
  const classes = [...(ctx.profile.classes ?? [])].sort((a, b) => a.period - b.period);
  const items = ctx.state.assignments.filter((a) => String(a.id).startsWith('sgy:api:')).length;
  return `<div class="connect-box connected">
    <p><b>Connected${api.user?.name ? ` as ${esc(api.user.name)}` : ''}</b></p>
    <p class="muted small">${api.lastSync ? `Synced ${esc(new Date(api.lastSync).toLocaleString())} · ${items} items` : 'Syncing…'}</p>
    ${api.lastError ? `<p class="error small">${esc(api.lastError)}</p>` : ''}
    <div class="btn-row">
      <button class="btn secondary small" data-action="sgy-sync">Sync now</button>
      <button class="btn secondary small" data-nav="#/grades">Grades</button>
      <button class="btn secondary small" data-action="sgy-disconnect">Disconnect</button>
    </div>
    ${api.sections?.length ? `<details class="section-map" ${api.sections.some((x) => !api.sectionMap?.[x.id]) ? 'open' : ''}>
      <summary>Match your Schoology courses to your periods</summary>
      <ul class="plain-list">${api.sections
        .map((sec) => `<li><label>${esc(sec.course)}${sec.section ? ` <small class="muted">${esc(sec.section)}</small>` : ''}
          <select data-action="sgy-map" data-section="${esc(sec.id)}">
            <option value="">Not one of my periods</option>
            ${classes.map((c) => `<option value="${esc(c.id)}" ${api.sectionMap?.[sec.id] === c.id ? 'selected' : ''}>P${c.period} · ${esc(className(c))}</option>`).join('')}
          </select></label></li>`)
        .join('')}</ul>
    </details>` : ''}
  </div>`;
}

const lunchText = (c) => (c.lunch === 'first' ? 'Lunch first in 3rd block' : c.lunch === 'second' ? 'Class first in 3rd block' : 'Lunch order not set');

function missingPeriods(classes) {
  const have = new Set(classes.map((c) => Number(c.period)));
  const free = [1, 2, 3, 4, 5, 6, 7].filter((p) => !have.has(p));
  return free.length ? `<p class="muted small">Free: ${free.map((p) => `P${p}`).join(', ')}</p>` : '';
}
