import { addDays, startOfWeek } from '../dates.js';
import { RECENT_OVERDUE_DAYS } from '../planner.js';
import { assignmentItem, className, emptyState, esc } from '../ui.js';

export function renderTodo(ctx, filter = { classId: 'all', show: 'open', older: false }) {
  const t = ctx.today;
  let items = ctx.assignments;
  if (filter.classId === 'tests') items = items.filter((a) => a.type === 'test' || a.type === 'quiz');
  else if (filter.classId !== 'all') items = items.filter((a) => a.classId === filter.classId);

  const open = items.filter((a) => !a.done).sort(byDue);
  const done = items.filter((a) => a.done).sort((a, b) => byDue(b, a));
  const endOfWeek = addDays(startOfWeek(t), 6);
  const since = addDays(t, -RECENT_OVERDUE_DAYS);
  // Older overdue work is usually done in Schoology already: folded away.
  const older = open.filter((a) => a.dueDate && a.dueDate < since).reverse();
  const groups = [
    ['Overdue', open.filter((a) => a.dueDate && a.dueDate >= since && a.dueDate < t).reverse()],
    ['Today', open.filter((a) => a.dueDate === t)],
    ['Tomorrow', open.filter((a) => a.dueDate === addDays(t, 1))],
    ['Later this week', open.filter((a) => a.dueDate > addDays(t, 1) && a.dueDate <= endOfWeek)],
    ['Next week', open.filter((a) => a.dueDate > endOfWeek && a.dueDate <= addDays(endOfWeek, 7))],
    ['Later', open.filter((a) => a.dueDate > addDays(endOfWeek, 7))],
    ['No due date', open.filter((a) => !a.dueDate)],
  ];

  const chips = [
    ['all', 'All'],
    ['tests', 'Tests & quizzes'],
    ...(ctx.profile.classes ?? []).map((c) => [c.id, className(c)]),
  ]
    .map(
      ([id, label]) =>
        `<button class="chip ${filter.classId === id ? 'on' : ''}" data-action="todo-filter" data-class="${esc(id)}">${esc(label)}</button>`,
    )
    .join('');

  const list = (arr, showDate = true) =>
    `<ul class="assignments">${arr.map((a) => assignmentItem(a, ctx.classesById, { showDate, today: t })).join('')}</ul>`;

  const olderCard = older.length
    ? `<section class="card older-card">
        <div class="card-head">
          <button class="link-btn" data-action="todo-older" aria-expanded="${Boolean(filter.older)}">${filter.older ? 'Hide' : 'Show'} ${older.length} older overdue ${older.length === 1 ? 'item' : 'items'}</button>
          <button class="link-btn small" data-action="clear-overdue">Mark all done</button>
        </div>
        <p class="muted small">More than a week overdue. If you’ve done them in Schoology, mark them done here.</p>
        ${filter.older ? list(older) : ''}
      </section>`
    : '';

  const body =
    filter.show === 'done'
      ? done.length
        ? `<section class="card">${list(done)}</section>`
        : emptyState('Nothing completed yet')
      : open.length
        ? groups
            .filter(([, arr]) => arr.length)
            .map(([title, arr]) => `<section class="card"><h2>${title} <span class="count">${arr.length}</span></h2>${list(arr, title !== 'Today' && title !== 'Tomorrow')}</section>`)
            .join('') + olderCard
        : emptyState('All caught up', 'Tap <b>+</b> to add homework, a test or a project, or connect Schoology in Settings.');

  return `
    <header class="view-head"><div class="day-title"><h1>To-Do</h1><p class="eyebrow"><button class="link-btn" data-nav="#/plan">When should I do all this? →</button></p></div>
      <div class="seg">
        <button class="${filter.show !== 'done' ? 'on' : ''}" data-action="todo-show" data-show="open">To do</button>
        <button class="${filter.show === 'done' ? 'on' : ''}" data-action="todo-show" data-show="done">Done</button>
      </div>
    </header>
    <div class="chips" role="toolbar" aria-label="Filter by class">${chips}</div>
    ${body}`;
}

const byDue = (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.title.localeCompare(b.title);
