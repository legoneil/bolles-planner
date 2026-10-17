import { addDays, dayOfMonth, formatDate, formatRange, formatWeekdayShort, range, startOfWeek } from '../dates.js';
import { plannerDay } from '../planner.js';
import { assignmentItem, className, esc, eventChips, letterBadge, statusLabel } from '../ui.js';
import { loadLevel, testsByDate } from '../workload.js';

export function renderWeek(ctx, anchor) {
  const monday = startOfWeek(anchor);
  const days = range(monday, 7);
  const tests = testsByDate(ctx.assignments);
  const weekdays = days.slice(0, 5);
  const weekend = days.slice(5).map((d) => plannerDay(d, ctx)).filter((d) => d.events.length || d.due.length || d.blocks.length);

  const head = `
    <header class="view-head">
      <button class="icon-btn" data-nav="#/week/${addDays(monday, -7)}" aria-label="Previous week">‹</button>
      <div class="day-title">
        <p class="eyebrow">Week of</p>
        <h1>${esc(formatDate(monday))} – ${esc(formatDate(addDays(monday, 4)))}</h1>
      </div>
      <button class="icon-btn" data-nav="#/week/${addDays(monday, 7)}" aria-label="Next week">›</button>
    </header>
    ${days.includes(ctx.today) ? '' : '<button class="link-btn back-today" data-nav="#/week">This week</button>'}`;

  const columns = weekdays
    .map((date) => {
      const day = plannerDay(date, ctx);
      const count = tests.get(date)?.length ?? 0;
      const level = loadLevel(count);
      return `<section class="week-day ${date === ctx.today ? 'is-today' : ''} status-${day.status}">
        <button class="week-day-head" data-nav="#/day/${date}">
          <span class="wd">${esc(formatWeekdayShort(date))}</span>
          <span class="dn">${dayOfMonth(date)}</span>
          ${letterBadge(day.letter)}
          ${level ? `<span class="load load-${level}" title="${count} tests">${level === 'heavy' ? 'Heavy' : `${count} tests`}</span>` : ''}
        </button>
        ${day.letter ? '' : `<p class="week-status">${esc(day.name || statusLabel(day))}</p>`}
        ${eventChips(day.events.filter((e) => e.title !== day.name))}
        <ol class="week-blocks">${day.blocks.map((b) => weekBlock(b, day, ctx)).join('')}</ol>
        ${day.unplaced.length ? `<ul class="assignments compact">${day.unplaced.map((a) => assignmentItem(a, ctx.classesById, { today: ctx.today })).join('')}</ul>` : ''}
      </section>`;
    })
    .join('');

  const weekendHtml = weekend.length
    ? `<section class="card weekend"><h2>Weekend</h2>${weekend
        .map(
          (day) => `<div class="weekend-day"><button class="link-btn" data-nav="#/day/${day.date}">${esc(formatDate(day.date))}</button>
          ${eventChips(day.events)}
          <ol class="week-blocks">${day.blocks.map((b) => weekBlock(b, day, ctx)).join('')}</ol>
          ${day.due.length ? `<ul class="assignments compact">${day.due.map((a) => assignmentItem(a, ctx.classesById, { today: ctx.today })).join('')}</ul>` : ''}</div>`,
        )
        .join('')}</section>`
    : '';

  return `${head}<div class="week-grid">${columns}</div>${weekendHtml}`;
}

function weekBlock(b, day, ctx) {
  if (!b.isClass) {
    if (!['personal', 'event', 'exam'].includes(b.kind)) return '';
    return `<li class="wb wb-${esc(b.kind)}"><span class="wb-time">${esc(formatRange(b.start, b.end))}</span><span class="wb-name">${esc(b.label)}</span></li>`;
  }
  const due = day.dueByBlock.get(b) ?? [];
  return `<li class="wb ${b.cls ? '' : 'free'}" style="--c:${esc(b.cls?.color ?? 'var(--line)')}">
    <span class="wb-time">${esc(formatRange(b.start, b.end))}</span>
    <span class="wb-name"><span class="period">P${b.period}</span> ${esc(b.cls ? className(b.cls) : 'Free')}</span>
    ${due.length ? `<ul class="assignments compact">${due.map((a) => assignmentItem(a, ctx.classesById, { today: ctx.today })).join('')}</ul>` : ''}
  </li>`;
}
