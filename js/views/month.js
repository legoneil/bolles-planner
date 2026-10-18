import { addMonths, dayOfMonth, diffDays, formatMonth, range, startOfMonth, startOfWeek } from '../dates.js';
import { getDay } from '../schedule.js';
import { esc } from '../ui.js';
import { loadLevel, testsByDate } from '../workload.js';

const NOTABLE = new Set(['closed', 'noclasses', 'exam', 'grading', 'notests', 'nohomework', 'testing', 'event', 'dress']);

export function renderMonth(ctx, anchor) {
  const first = startOfMonth(anchor);
  const month = first.slice(0, 7);
  const gridStart = startOfWeek(first);
  const weeks = Math.ceil((diffDays(gridStart, first) + diffDays(first, addMonths(first, 1))) / 7);
  const dates = range(gridStart, weeks * 7);
  const tests = testsByDate(ctx.assignments);
  const dueByDate = new Map();
  for (const a of ctx.assignments) {
    if (a.done || !a.dueDate) continue;
    if (!dueByDate.has(a.dueDate)) dueByDate.set(a.dueDate, []);
    dueByDate.get(a.dueDate).push(a);
  }

  const cells = dates
    .map((date) => {
      const inMonth = date.startsWith(month);
      const day = getDay(date, ctx.profile);
      const due = dueByDate.get(date) ?? [];
      const level = loadLevel(tests.get(date)?.length ?? 0);
      const ev = day.events.filter((e) => NOTABLE.has(e.kind));
      const big = ['special', 'exam', 'closed', 'noclasses'].includes(day.status) && day.name;
      const label = big ? day.name : (ev[0]?.title ?? '');
      return `<button class="mcell ${inMonth ? '' : 'out'} ${date === ctx.today ? 'is-today' : ''} status-${day.status} ${level ? `load-${level}` : ''}" data-nav="#/day/${date}" aria-label="${esc(date)}">
        <span class="mnum">${dayOfMonth(date)}</span>
        ${day.letter ? `<span class="mletter">${day.letter}</span>` : ''}
        ${label ? `<span class="mlabel ${big ? 'big' : ''}">${esc(label)}</span>` : ''}
        ${due.length ? `<span class="mdots">${due
          .slice(0, 5)
          .map((a) => `<i style="--c:${esc(ctx.classesById.get(a.classId)?.color ?? 'var(--muted)')}" class="${a.type === 'test' ? 'test' : ''}"></i>`)
          .join('')}</span>` : ''}
      </button>`;
    })
    .join('');

  return `
    <header class="view-head">
      <button class="icon-btn" data-nav="#/month/${addMonths(first, -1).slice(0, 7)}" aria-label="Previous month"><svg class="chev-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5L7 10l5.5 5.5" /></svg></button>
      <div class="day-title"><h1>${esc(formatMonth(first))}</h1></div>
      <button class="icon-btn" data-nav="#/month/${addMonths(first, 1).slice(0, 7)}" aria-label="Next month"><svg class="chev-ico" viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5L13 10l-5.5 5.5" /></svg></button>
    </header>
    ${ctx.today.startsWith(month) ? '' : '<button class="link-btn back-today" data-nav="#/month">This month</button>'}
    <div class="month-grid" role="grid">
      ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<span class="mhead">${d}</span>`).join('')}
      ${cells}
    </div>
    <p class="legend"><span class="lg lg-closed"></span>No school <span class="lg lg-heavy"></span>Heavy day (2 tests) <span class="lg lg-overload"></span>3+ tests</p>`;
}
