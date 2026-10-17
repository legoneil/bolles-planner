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
      <p class="muted">Paste your Schoology calendar link once and your assignments and tests stay up to date: they sync every time you open the planner. In Schoology, open your <b>Calendar</b> and use its export (iCal) option to copy the link. It usually starts with <code>webcal://bolles.schoology.com</code>.</p>
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
      <button class="link-btn danger" data-action="reset">${ctx.account?.status === 'signed-in' ? 'Erase all planner data (this device and your account)' : 'Erase all planner data'}</button>
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

const lunchText = (c) => (c.lunch === 'first' ? 'Lunch first in 3rd block' : c.lunch === 'second' ? 'Class first in 3rd block' : 'Lunch order not set');

function missingPeriods(classes) {
  const have = new Set(classes.map((c) => Number(c.period)));
  const free = [1, 2, 3, 4, 5, 6, 7].filter((p) => !have.has(p));
  return free.length ? `<p class="muted small">Free: ${free.map((p) => `P${p}`).join(', ')}</p>` : '';
}
