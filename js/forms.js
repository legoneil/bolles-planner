// Dialog forms for assignments, classes and activities.

import { CAMPUSES } from './data/bolles-2026-27.js';
import { addDays, formatLongDate, formatRange } from './dates.js';
import { meetingsOn, nextMeeting, PERIODS, suggestLunch } from './schedule.js';
import { ASSIGNMENT_TYPES, CLASS_COLORS, CLASS_TYPES, uid } from './store.js';
import { formatMinutes, isBigWork, TIME_CHOICES, workKind } from './study.js';
import { className, esc } from './ui.js';
import { testWarnings } from './workload.js';

const WEEKDAYS = [
  [1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun'],
];

export function assignmentForm(a, ctx) {
  const isNew = !a.id;
  const fromSgy = a.source === 'schoology';
  const classes = [...ctx.profile.classes].sort((x, y) => x.period - y.period);
  return `
    <form data-form="assignment" class="sheet-form">
      <header class="sheet-head"><h2>${isNew ? 'New assignment' : 'Edit assignment'}</h2>
        <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Close">×</button></header>
      <input type="hidden" name="id" value="${esc(a.id ?? '')}" />
      <label>What is it?
        <input name="title" required maxlength="200" placeholder="e.g. Chapter 5 test" value="${esc(a.title ?? '')}" ${fromSgy ? 'readonly' : 'autofocus'} />
      </label>
      <div class="form-row">
        <label>Type
          <select name="type">${ASSIGNMENT_TYPES.map((t) => `<option value="${t.id}" ${t.id === (a.type ?? 'homework') ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
        </label>
        <label>Class
          <select name="classId">
            <option value="">No class</option>
            ${classes.map((c) => `<option value="${esc(c.id)}" ${c.id === a.classId ? 'selected' : ''}>P${c.period} · ${esc(className(c))}</option>`).join('')}
          </select>
        </label>
      </div>
      <label>Due
        <input type="date" name="dueDate" required value="${esc(a.dueDate ?? '')}" ${fromSgy ? 'readonly' : ''} />
      </label>
      ${fromSgy ? '' : `<div class="quick-due" role="group" aria-label="Quick due dates">
        <button type="button" class="chip" data-action="due-quick" data-when="next">Next class</button>
        <button type="button" class="chip" data-action="due-quick" data-when="after">Class after</button>
        <button type="button" class="chip" data-action="due-quick" data-when="tomorrow">Tomorrow</button>
        <button type="button" class="chip" data-action="due-quick" data-when="week">In a week</button>
      </div>`}
      <p class="due-info" data-due-info></p>
      <div class="warnings" data-due-warn></div>
      <label>How long will it take?
        <select name="minutes">
          <option value="">Usual for this type</option>
          ${TIME_CHOICES.map((m) => `<option value="${m}" ${Number(a.minutes) === m ? 'selected' : ''}>${formatMinutes(m)}</option>`).join('')}
        </select>
      </label>
      <p class="muted small" data-time-hint></p>
      <label>Notes
        <textarea name="notes" rows="3" placeholder="Pages, rubric, what to study…">${esc(a.notes ?? '')}</textarea>
      </label>
      ${a.url ? `<p><a href="${esc(a.url)}" target="_blank" rel="noopener">Open in Schoology ↗</a></p>` : ''}
      <footer class="sheet-foot">
        ${isNew ? '' : `<button type="button" class="btn danger-outline" data-action="delete-assignment" data-id="${esc(a.id)}">${fromSgy ? 'Hide' : 'Delete'}</button>`}
        <span class="spacer"></span>
        <button type="submit" class="btn">Save</button>
      </footer>
    </form>`;
}

// Live feedback under the due date: which period it's due in and test-load warnings.
export function updateDueInfo(form, ctx) {
  const classId = form.classId.value;
  const date = form.dueDate.value;
  const info = form.querySelector('[data-due-info]');
  const warn = form.querySelector('[data-due-warn]');
  info.textContent = '';
  warn.innerHTML = '';
  if (!date) return;
  if (classId) {
    const [block] = meetingsOn(date, ctx.profile, classId);
    if (block) info.textContent = `Due in class: ${formatLongDate(date)}, P${block.period} (${formatRange(block.start, block.end)})`;
    else {
      const nxt = nextMeeting(ctx.profile, classId, date, { inclusive: false });
      info.textContent = `This class doesn't meet on ${formatLongDate(date)}.${nxt ? ` Next class: ${formatLongDate(nxt.date)}.` : ''}`;
    }
  }
  if (form.type.value === 'test') {
    const msgs = testWarnings(ctx.assignments, date, ctx.profile, form.id.value || null);
    warn.innerHTML = msgs.map((m) => `<p class="warning">${esc(m)}</p>`).join('');
  }
  updateTimeHint(form);
}

// Under the time estimate: what the plan will do with it.
export function updateTimeHint(form) {
  const hint = form.querySelector('[data-time-hint]');
  if (!hint) return;
  const fake = { type: form.type.value };
  const kind = workKind(fake);
  const total = Number(form.minutes.value) || kind.minutes;
  hint.textContent = isBigWork(fake)
    ? `About ${formatMinutes(total)} of studying, spread over the ${kind.days} days before, in sessions of about ${kind.session} min.`
    : `About ${formatMinutes(total)}, planned for a free period or the evening before it's due.`;
}

export function quickDue(form, when, ctx) {
  const classId = form.classId.value;
  if (when === 'tomorrow') form.dueDate.value = addDays(ctx.today, 1);
  else if (when === 'week') form.dueDate.value = addDays(ctx.today, 7);
  else {
    if (!classId) return 'Pick a class first.';
    const first = nextMeeting(ctx.profile, classId, ctx.today, { inclusive: false });
    const target = when === 'after' && first ? nextMeeting(ctx.profile, classId, first.date, { inclusive: false }) : first;
    if (!target) return 'No upcoming class meetings found.';
    form.dueDate.value = target.date;
  }
  return null;
}

export function readAssignment(form, existing) {
  const f = new FormData(form);
  return {
    ...existing,
    id: f.get('id') || undefined,
    title: String(f.get('title')).trim(),
    type: f.get('type'),
    classId: f.get('classId') || null,
    dueDate: f.get('dueDate'),
    notes: String(f.get('notes') ?? '').trim(),
    minutes: Number(f.get('minutes')) || null,
    done: existing?.done ?? false,
  };
}

// ---------------------------------------------------------------------------

export function classForm(c, ctx) {
  const isNew = !ctx.profile.classes.some((x) => x.id === c.id);
  const campus = CAMPUSES[ctx.profile.campus];
  const taken = new Set(ctx.profile.classes.filter((x) => x.id !== c.id).map((x) => Number(x.period)));
  return `
    <form data-form="class" class="sheet-form">
      <header class="sheet-head"><h2>${isNew ? 'Add class' : 'Edit class'}</h2>
        <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Close">×</button></header>
      <input type="hidden" name="id" value="${esc(c.id)}" />
      <label>Class name <input name="name" required maxlength="80" value="${esc(c.name)}" placeholder="e.g. AP Biology" /></label>
      <div class="form-row">
        <label>Period
          <select name="period">${PERIODS.map((p) => `<option value="${p}" ${Number(c.period) === p ? 'selected' : ''}>P${p}${taken.has(p) ? ' (taken)' : ''}</option>`).join('')}</select>
        </label>
        <label>Level
          <select name="type">${CLASS_TYPES.map((t) => `<option ${c.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </label>
      </div>
      <div class="form-row">
        <label>Teacher <input name="teacher" maxlength="80" value="${esc(c.teacher)}" placeholder="e.g. Ms. Hicks" /></label>
        <label>Room <input name="room" maxlength="20" value="${esc(c.room)}" placeholder="e.g. S204" /></label>
      </div>
      ${campus.hasLunchSplit ? `<label>When this class is in 3rd block
        <select name="lunch">
          <option value="" ${!c.lunch ? 'selected' : ''}>Not sure</option>
          <option value="first" ${c.lunch === 'first' ? 'selected' : ''}>Lunch first, then class</option>
          <option value="second" ${c.lunch === 'second' ? 'selected' : ''}>Class first, then lunch</option>
        </select>
      </label><p class="muted small" data-lunch-hint></p>` : ''}
      <fieldset class="swatches"><legend>Color</legend>
        ${CLASS_COLORS.map((col) => `<label class="swatch" style="--c:${col}"><input type="radio" name="color" value="${col}" ${c.color === col ? 'checked' : ''} /><span class="sr-only">${col}</span></label>`).join('')}
      </fieldset>
      <footer class="sheet-foot">
        ${isNew ? '' : `<button type="button" class="btn danger-outline" data-action="delete-class" data-id="${esc(c.id)}">Remove</button>`}
        <span class="spacer"></span>
        <button type="submit" class="btn">Save</button>
      </footer>
    </form>`;
}

export function updateLunchHint(form) {
  const hint = form.querySelector('[data-lunch-hint]');
  if (!hint) return;
  const s = suggestLunch(form.teacher.value);
  hint.textContent = s
    ? `The planner's teacher list says: ${s === 'first' ? 'lunch first' : 'class first'}.`
    : form.teacher.value.trim()
      ? "This teacher isn't on the planner's lunch list (or is listed twice). Check the Teacher/Lunch page."
      : '';
  if (s && !form.lunch.dataset.touched) form.lunch.value = s;
}

export function readClass(form, existing) {
  const f = new FormData(form);
  return {
    ...existing,
    id: f.get('id'),
    name: String(f.get('name')).trim(),
    teacher: String(f.get('teacher') ?? '').trim(),
    room: String(f.get('room') ?? '').trim(),
    period: Number(f.get('period')),
    type: f.get('type'),
    color: f.get('color') ?? existing?.color ?? CLASS_COLORS[0],
    lunch: f.get('lunch') || null,
  };
}

// ---------------------------------------------------------------------------

export function activityForm(a) {
  const isNew = !a.id;
  const repeat = a.date ? 'once' : 'weekly';
  return `
    <form data-form="activity" class="sheet-form">
      <header class="sheet-head"><h2>${isNew ? 'Add activity' : 'Edit activity'}</h2>
        <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Close">×</button></header>
      <input type="hidden" name="id" value="${esc(a.id ?? '')}" />
      <label>Name <input name="title" required maxlength="80" value="${esc(a.title ?? '')}" placeholder="e.g. Soccer practice" /></label>
      <div class="seg" role="radiogroup">
        <label><input type="radio" name="repeat" value="weekly" ${repeat === 'weekly' ? 'checked' : ''} /> Every week</label>
        <label><input type="radio" name="repeat" value="once" ${repeat === 'once' ? 'checked' : ''} /> One time</label>
      </div>
      <fieldset class="days" data-show="weekly"><legend>Days</legend>
        ${WEEKDAYS.map(([d, n]) => `<label class="day-toggle"><input type="checkbox" name="days" value="${d}" ${a.days?.includes(d) ? 'checked' : ''} /><span>${n}</span></label>`).join('')}
      </fieldset>
      <label data-show="once">Date <input type="date" name="date" value="${esc(a.date ?? '')}" /></label>
      <div class="form-row">
        <label>Starts <input type="time" name="start" required value="${esc(a.start ?? '15:30')}" /></label>
        <label>Ends <input type="time" name="end" required value="${esc(a.end ?? '17:30')}" /></label>
      </div>
      <div class="form-row" data-show="weekly">
        <label>From (optional) <input type="date" name="from" value="${esc(a.from ?? '')}" /></label>
        <label>Until (optional) <input type="date" name="to" value="${esc(a.to ?? '')}" /></label>
      </div>
      <footer class="sheet-foot">
        ${isNew ? '' : `<button type="button" class="btn danger-outline" data-action="delete-activity" data-id="${esc(a.id)}">Delete</button>`}
        <span class="spacer"></span>
        <button type="submit" class="btn">Save</button>
      </footer>
    </form>`;
}

export function syncActivityForm(form) {
  const repeat = form.querySelector('[name=repeat]:checked')?.value ?? 'weekly';
  for (const el of form.querySelectorAll('[data-show]')) el.hidden = el.dataset.show !== repeat;
}

export function readActivity(form, existing) {
  const f = new FormData(form);
  const once = f.get('repeat') === 'once';
  return {
    ...existing,
    id: f.get('id') || uid(),
    title: String(f.get('title')).trim(),
    date: once ? f.get('date') || null : null,
    days: once ? [] : f.getAll('days').map(Number),
    start: f.get('start'),
    end: f.get('end'),
    from: once ? null : f.get('from') || null,
    to: once ? null : f.get('to') || null,
    color: existing?.color ?? '#64748b',
  };
}

// ---------------------------------------------------------------------------
// Accounts

const AUTH_TITLES = { signin: 'Sign in', signup: 'Create an account', reset: 'Reset your password' };

export function authForm(mode = 'signin', { email = '', message = '' } = {}) {
  return `
    <form data-form="auth" data-mode="${mode}" class="sheet-form">
      <header class="sheet-head"><h2>${AUTH_TITLES[mode]}</h2>
        <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Close">×</button></header>
      ${mode === 'signup' ? '<p class="muted small">Your planner will be saved to your account so you can use it on your phone and your laptop.</p>' : ''}
      ${mode === 'reset' ? '<p class="muted small">We’ll email you a link to choose a new password.</p>' : ''}
      <label>Email <input type="email" name="email" required autocomplete="email" inputmode="email" value="${esc(email)}" /></label>
      ${mode === 'reset' ? '' : `<label>Password <input type="password" name="password" required minlength="8"
        autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" /></label>`}
      ${mode === 'signup' ? '<p class="muted small">At least 8 characters.</p>' : ''}
      <p class="form-message" role="status" data-auth-message>${esc(message)}</p>
      <button type="submit" class="btn">${mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</button>
      <p class="auth-links small">
        ${mode !== 'signin' ? '<button type="button" class="link-btn" data-action="open-auth" data-mode="signin">I have an account</button>' : '<button type="button" class="link-btn" data-action="open-auth" data-mode="signup">Create an account</button>'}
        ${mode === 'signin' ? '<button type="button" class="link-btn" data-action="open-auth" data-mode="reset">Forgot password?</button>' : ''}
      </p>
    </form>`;
}

export function newPasswordForm() {
  return `
    <form data-form="new-password" class="sheet-form">
      <header class="sheet-head"><h2>Choose a new password</h2></header>
      <label>New password <input type="password" name="password" required minlength="8" autocomplete="new-password" /></label>
      <p class="form-message" role="status" data-auth-message></p>
      <button type="submit" class="btn">Save password</button>
    </form>`;
}

export function signOutForm(email) {
  return `
    <div class="sheet-form">
      <header class="sheet-head"><h2>Sign out</h2>
        <button type="button" class="icon-btn" data-action="close-sheet" aria-label="Close">×</button></header>
      <p>Your planner stays saved in your account (${esc(email)}).</p>
      <button type="button" class="btn" data-action="sign-out" data-clear="1">Sign out and remove from this device</button>
      <button type="button" class="btn secondary" data-action="sign-out" data-clear="">Sign out, keep a copy on this device</button>
      <p class="muted small">Remove it if this is a shared or school computer.</p>
    </div>`;
}
