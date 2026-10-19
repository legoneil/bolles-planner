// The work plan: what to do each day, and the "Tonight" card on Today.

import { addDays, formatRange, range, relativeDay } from '../dates.js';
import { getDay } from '../schedule.js';
import { BUDGET_CHOICES, DEFAULT_BUDGET, formatMinutes, planWork } from '../study.js';
import { className, esc, statusLabel, typeLabel } from '../ui.js';

const budgetOf = (ctx) => ctx.state?.settings?.studyBudget ?? DEFAULT_BUDGET;

export function renderPlan(ctx) {
  const plan = planWork(ctx);
  const week = range(ctx.today, 7);
  const later = [...plan.days.values()].filter((d) => d.date > week.at(-1) && d.sessions.length).sort((a, b) => a.date.localeCompare(b.date));
  const anything = [...plan.days.values()].some((d) => d.sessions.length);

  const head = `
    <header class="view-head">
      <div class="day-title">
        <p class="eyebrow">Next 7 days</p>
        <h1>Plan</h1>
      </div>
      <button class="btn small secondary" data-nav="#/settings">Study time: ${esc(formatMinutes(budgetOf(ctx)))}</button>
    </header>`;

  if (!anything) {
    return `${head}<div class="empty"><p class="empty-title">Nothing to plan yet</p>
      <p>Add homework, tests and projects with a due date, and the planner will spread the work over your free periods and evenings.</p></div>`;
  }

  const days = week.map((date) => dayPlanCard(plan.days.get(date), date, ctx)).join('');
  const laterHtml = later.length
    ? `<section class="card"><h2>Later</h2>${later.map((d) => dayPlanCard(d, d.date, ctx, { bare: true })).join('')}</section>`
    : '';
  const skipped = plan.unscheduled.length
    ? `<p class="muted small">Not enough days left to spread: ${plan.unscheduled.map((a) => esc(a.title)).join(', ')}.</p>`
    : '';
  return `${head}${days}${laterHtml}${skipped}
    <p class="muted small">Study sessions are suggestions based on how long each thing usually takes. Change the time on any assignment, or your nightly study time in Settings, and the plan updates.</p>`;
}

function dayPlanCard(d, date, ctx, { bare = false } = {}) {
  const day = d?.capacity !== undefined ? d : null;
  const label = relativeDay(date, ctx.today);
  const sessions = day?.sessions ?? [];
  const inner = sessions.length
    ? `<ul class="sessions">${sessions.map((s) => sessionRow(s, date, ctx)).join('')}</ul>`
    : `<p class="muted small">Nothing planned${date === ctx.today ? ' for today' : ''}.</p>`;
  const meter = day && sessions.length ? capacityMeter(day, ctx) : '';
  if (bare) return `<div class="plan-later"><h3>${esc(label)}</h3>${inner}</div>`;
  const dayInfo = statusLabel(getDay(date, ctx.profile));
  return `<section class="card plan-day ${date === ctx.today ? 'is-today' : ''}">
    <div class="card-head">
      <h2><button class="link-btn plan-day-link" data-nav="#/day/${date}">${esc(label)}</button> <small class="muted">${esc(dayInfo)}</small></h2>
      ${sessions.length ? `<span class="plan-total ${day.over ? 'is-over' : ''}">${esc(formatMinutes(day.used))}</span>` : ''}
    </div>
    ${meter}${inner}
  </section>`;
}


function capacityMeter(day, ctx) {
  const pct = Math.min(100, Math.round((day.used / Math.max(day.capacity, 1)) * 100));
  const over = day.over > 0;
  const text = over
    ? `About ${formatMinutes(day.over)} more than fits. Start earlier or move something.`
    : `${formatMinutes(Math.max(0, day.capacity - day.used))} to spare`;
  return `<div class="cap ${over ? 'is-over' : ''}" role="img" aria-label="${esc(text)}">
    <span class="cap-bar" style="--pct:${pct}%"></span><span class="cap-text">${esc(text)}</span></div>`;
}

export function sessionRow(s, date, ctx) {
  const a = s.assignment;
  const cls = ctx.classesById.get(a.classId);
  const when = s.slot === 'free' ? `${esc(s.slotLabel)}${s.start ? ` · ${esc(formatRange(s.start, null))}` : ''}` : 'Evening';
  const what = s.study ? `Study${s.of > 1 ? ` ${s.part} of ${s.of}` : ''}` : typeLabel(a.type);
  // Always relative to today, whichever day's card this is.
  const dueDay = relativeDay(a.dueDate, ctx.today);
  const due = a.dueDate < ctx.today ? 'overdue' : `due ${dueDay === 'Today' || dueDay === 'Tomorrow' ? dueDay.toLowerCase() : dueDay}`;
  const canLog = date <= ctx.today;
  const check = s.study
    ? `<button class="check ${canLog ? '' : 'is-future'}" data-action="log-session" data-id="${esc(a.id)}" data-date="${date}" data-minutes="${s.minutes}"
        aria-pressed="${s.done}" aria-label="${s.done ? 'Undo study session' : 'Mark studied'}" ${canLog ? '' : 'disabled'}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3 3 7-7" /></svg></button>`
    : `<button class="check ${canLog ? '' : 'is-future'}" data-action="toggle-done" data-id="${esc(a.id)}" aria-pressed="${a.done}" aria-label="Mark done" ${canLog ? '' : 'disabled'}>
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3 3 7-7" /></svg></button>`;
  return `<li class="session ${s.done ? 'done' : ''} ${s.overdue ? 'overdue' : ''}" style="--c:${esc(cls?.color ?? 'var(--muted)')}">
    ${check}
    <button class="session-body" data-action="edit-assignment" data-id="${esc(a.id)}">
      <span class="session-title">${esc(a.title)}</span>
      <span class="session-meta"><span class="type-tag ${s.study ? 'type-test' : ''}">${esc(what)}</span>
        <span>${esc(className(cls))}</span><span class="${s.overdue ? 'overdue-text' : ''}">${esc(due)}</span></span>
    </button>
    <span class="session-when"><b>${esc(formatMinutes(s.minutes))}</b><small>${when}</small></span>
  </li>`;
}

// On Today: what to do tonight (or, late in the evening, tomorrow).
export function tonightCard(ctx) {
  const plan = planWork(ctx);
  const anything = [...plan.days.values()].some((d) => d.sessions.length);
  if (!anything) return '';
  const today = plan.days.get(ctx.today);
  const sessions = today?.sessions ?? [];
  const open = sessions.filter((s) => !s.done);
  const tomorrow = plan.days.get(addDays(ctx.today, 1));
  let body;
  if (!sessions.length) {
    body = `<p class="muted">Nothing planned for today.${tomorrow?.sessions.length ? ` Tomorrow: about ${esc(formatMinutes(tomorrow.used))}.` : ''}</p>`;
  } else {
    body = `<ul class="sessions compact">${sessions.map((s) => sessionRow(s, ctx.today, ctx)).join('')}</ul>`;
  }
  const total = open.reduce((t, s) => t + s.minutes, 0);
  const over = today?.over > 0;
  return `<section class="card tonight-card ${over ? 'is-over' : ''}">
    <div class="card-head">
      <h2>Today’s plan${sessions.length ? ` <small class="muted">· about ${esc(formatMinutes(total))}${open.length !== sessions.length ? ' left' : ''}</small>` : ''}</h2>
      <button class="btn small secondary" data-nav="#/plan">Full plan</button>
    </div>
    ${over ? `<p class="warning">That’s more than fits around your day. Start early, or move something.</p>` : ''}
    ${body}
  </section>`;
}

export function budgetPicker(ctx) {
  const current = budgetOf(ctx);
  return `<div class="seg wrap" role="radiogroup" aria-label="Study time per school night">
    ${BUDGET_CHOICES.map((m) => `<button role="radio" aria-checked="${m === current}" class="${m === current ? 'on' : ''}" data-action="set-budget" data-minutes="${m}">${esc(formatMinutes(m))}</button>`).join('')}
  </div>`;
}
