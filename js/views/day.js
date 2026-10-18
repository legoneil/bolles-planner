import { addDays, diffDays, formatLongDate, formatRange, formatTime, minutes, nowMinutes, relativeDay } from '../dates.js';
import { plannerDay } from '../planner.js';
import { gradesCard } from './grades.js';
import { tonightCard } from './plan.js';
import { nowAndNext } from '../schedule.js';
import { assignmentItem, blockRow, className, emptyState, esc, eventChips, letterBadge, statusLabel } from '../ui.js';
import { loadLevel, overloadAlerts, testsByDate } from '../workload.js';

export function renderDay(ctx, date) {
  const isToday = date === ctx.today;
  const day = plannerDay(date, ctx);
  const tests = testsByDate(ctx.assignments).get(date) ?? [];
  const level = loadLevel(tests.length);
  const nowMin = nowMinutes(ctx.now);
  const hhmm = `${String(ctx.now.getHours()).padStart(2, '0')}:${String(ctx.now.getMinutes()).padStart(2, '0')}`;
  const { current, next } = isToday ? nowAndNext(day, hhmm) : { current: null, next: null };

  const head = `
    <header class="view-head day-head">
      <button class="icon-btn" data-nav="#/day/${addDays(date, -1)}" aria-label="Previous day"><svg class="chev-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5" /></svg></button>
      <div class="day-title">
        <p class="eyebrow">${esc(relativeDay(date, ctx.today))}</p>
        <h1>${esc(formatLongDate(date))}</h1>
        <p class="day-status">${letterBadge(day.letter, 'lg')}<span>${esc(statusLabel(day))}</span>
          ${level ? `<span class="load load-${level}">${level === 'heavy' ? 'Heavy day' : `${tests.length} tests`}</span>` : ''}</p>
      </div>
      <button class="icon-btn" data-nav="#/day/${addDays(date, 1)}" aria-label="Next day"><svg class="chev-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5L13 10l-5.5 5.5" /></svg></button>
    </header>
    ${isToday ? '' : `<button class="link-btn back-today" data-nav="#/today">Back to today</button>`}`;

  const alerts = isToday ? renderAlerts(ctx) : '';
  const nowCard = isToday && day.blocks.some((b) => b.isClass) ? renderNowCard(current, next, nowMin) : '';
  const tonight = isToday ? tonightCard(ctx) : '';

  const name = day.name && day.name !== statusLabel(day) ? `<p class="day-name">${esc(day.name)}</p>` : '';
  const note = day.note ? `<p class="day-note">${esc(day.note)}</p>` : '';

  let schedule;
  if (day.blocks.length) {
    schedule = `<ol class="blocks">${day.blocks
      .map((b) =>
        blockRow(b, {
          due: day.dueByBlock.get(b) ?? [],
          classesById: ctx.classesById,
          today: ctx.today,
          now: isToday && b === current,
        }),
      )
      .join('')}</ol>`;
  } else {
    schedule = emptyState(
      day.status === 'weekend' ? 'No classes this weekend' : day.name || 'No classes',
      nextSchoolDayHint(ctx, date),
    );
  }

  const unplaced = day.unplaced.length
    ? `<section class="card">
        <h2>Also due ${esc(relativeDay(date, ctx.today).toLowerCase())}</h2>
        <ul class="assignments">${day.unplaced.map((a) => assignmentItem(a, ctx.classesById, { today: ctx.today })).join('')}</ul>
      </section>`
    : '';

  const upcoming = isToday ? renderUpcoming(ctx) : '';

  const scheduleCard = `<section class="card">
      ${name}${note}${eventChips(day.events.filter((e) => e.title !== day.name))}
      <h2 class="sr-only">Schedule</h2>
      ${schedule}
    </section>`;
  if (!isToday) return `${head}${scheduleCard}${unplaced}`;
  // Today: on laptops the schedule sits beside the plan.
  return `${head}${alerts}${nowCard}
    <div class="today-grid">
      <div>${scheduleCard}${unplaced}</div>
      <div class="today-side">${tonight}${upcoming}${gradesCard(ctx)}</div>
    </div>`;
}

function renderNowCard(current, next, nowMin) {
  const parts = [];
  if (current) {
    const left = minutes(current.end) - nowMin;
    const length = minutes(current.end) - minutes(current.start);
    const pct = Math.round(((length - left) / Math.max(length, 1)) * 100);
    const title = current.isClass ? `P${current.period} · ${className(current.cls)}` : current.label;
    parts.push(`<div><p class="eyebrow">Now</p><p class="now-title">${esc(title)}</p>
      <p class="muted">${left} min left · ends ${esc(formatTime(current.end))}</p>
      <div class="now-progress" role="progressbar" aria-label="Time through this block" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="--pct:${pct}%"></span></div></div>`);
  }
  if (next) {
    const until = minutes(next.start) - nowMin;
    parts.push(`<div><p class="eyebrow">Next class</p><p class="now-title">P${next.period} · ${esc(className(next.cls))}</p>
      <p class="muted">${until < 60 ? `in ${until} min` : esc(formatRange(next.start, next.end))}${next.cls?.room ? ` · Room ${esc(next.cls.room)}` : ''}</p></div>`);
  }
  if (!parts.length) return '';
  return `<section class="card now-card">${parts.join('')}</section>`;
}

function renderAlerts(ctx) {
  const alerts = overloadAlerts(ctx.assignments, ctx.today);
  if (!alerts.length) return '';
  return alerts
    .map(
      ({ date, tests }) => `<section class="alert" role="alert">
        <p class="alert-title">${tests.length} tests on ${esc(relativeDay(date, ctx.today))}</p>
        <p>${tests.map((t) => esc(className(ctx.classesById.get(t.classId)))).join(', ')}. You may want to ask a teacher to move one.</p>
        <button class="link-btn" data-nav="#/day/${date}">See that day</button>
      </section>`,
    )
    .join('');
}

function renderUpcoming(ctx) {
  const horizon = addDays(ctx.today, 14);
  const soon = ctx.assignments
    .filter((a) => !a.done && (a.type === 'test' || a.type === 'quiz' || a.type === 'project') && a.dueDate > ctx.today && a.dueDate <= horizon)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const overdue = ctx.assignments.filter((a) => !a.done && a.dueDate && a.dueDate < ctx.today);
  return `
    ${overdue.length ? `<section class="card"><h2>Overdue <span class="count">${overdue.length}</span></h2>
      <ul class="assignments">${overdue.map((a) => assignmentItem(a, ctx.classesById, { showDate: true, today: ctx.today })).join('')}</ul></section>` : ''}
    <section class="card">
      <h2>Tests, quizzes and projects · next 2 weeks</h2>
      ${soon.length ? `<ul class="assignments">${soon
        .map((a) => assignmentItem(a, ctx.classesById, { showDate: true, today: ctx.today }))
        .join('')}</ul>` : '<p class="muted">Nothing big coming up.</p>'}
    </section>`;
}

function nextSchoolDayHint(ctx, date) {
  for (let i = 1; i <= 21; i++) {
    const d = addDays(date, i);
    const day = plannerDay(d, ctx);
    if (day.letter) {
      const n = diffDays(ctx.today, d);
      const when = n >= 0 && n < 7 ? relativeDay(d, ctx.today) : formatLongDate(d);
      return `Next class day: <button class="link-btn" data-nav="#/day/${d}">${esc(when)} (${day.letter} day)</button>`;
    }
  }
  return '';
}
