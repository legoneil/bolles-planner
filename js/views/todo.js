import { addDays, startOfWeek } from '../dates.js';
import { assignmentItem, className, emptyState, esc } from '../ui.js';

export function renderTodo(ctx, filter = { classId: 'all', show: 'open' }) {
  const t = ctx.today;
  let items = ctx.assignments;
  if (filter.classId === 'tests') items = items.filter((a) => a.type === 'test' || a.type === 'quiz');
  else if (filter.classId !== 'all') items = items.filter((a) => a.classId === filter.classId);

  const open = items.filter((a) => !a.done).sort(byDue);
  const done = items.filter((a) => a.done).sort((a, b) => byDue(b, a));
  const endOfWeek = addDays(startOfWeek(t), 6);
  const groups = [
    ['Overdue', open.filter((a) => a.dueDate && a.dueDate < t)],
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

  const body =
    filter.show === 'done'
      ? done.length
        ? `<section class="card">${list(done)}</section>`
        : emptyState('Nothing completed yet')
      : open.length
        ? groups
            .filter(([, arr]) => arr.length)
            .map(([title, arr]) => `<section class="card"><h2>${title} <span class="count">${arr.length}</span></h2>${list(arr, title !== 'Today' && title !== 'Tomorrow')}</section>`)
            .join('')
        : emptyState('All caught up', 'Tap <b>+</b> to add homework, a test or a project, or connect Schoology in Settings.');

  return `
    <header class="view-head"><div class="day-title"><h1>To-Do</h1></div>
      <div class="seg">
        <button class="${filter.show !== 'done' ? 'on' : ''}" data-action="todo-show" data-show="open">To do</button>
        <button class="${filter.show === 'done' ? 'on' : ''}" data-action="todo-show" data-show="done">Done</button>
      </div>
    </header>
    <div class="chips" role="toolbar" aria-label="Filter by class">${chips}</div>
    ${body}`;
}

const byDue = (a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || a.title.localeCompare(b.title);
