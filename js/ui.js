// Small rendering helpers shared by the views. Views build HTML strings;
// every piece of user text goes through esc().

import { formatRange, relativeDay } from './dates.js';
import { ASSIGNMENT_TYPES } from './store.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const typeLabel = (id) => ASSIGNMENT_TYPES.find((t) => t.id === id)?.label ?? 'Other';

export const className = (cls) => cls?.name || (cls ? `Period ${cls.period}` : 'No class');

export const letterBadge = (letter, extra = '') =>
  letter ? `<span class="letter ${extra}" title="${letter} day">${letter}</span>` : '';

export const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][n % 10 > 3 || Math.floor(n / 10) === 1 ? 0 : n % 10]}`;

export function statusLabel(day) {
  switch (day.status) {
    case 'class':
      return day.lateStart ? `${day.letter} day · Late Start` : `${day.letter} day`;
    case 'special':
      return day.letter ? `${day.letter} day · Altered schedule` : 'Special schedule';
    case 'exam':
      return 'Exams';
    case 'closed':
      return 'No school';
    case 'noclasses':
      return 'No classes';
    case 'weekend':
      return 'Weekend';
    default:
      return 'No school';
  }
}

// What Schoology's gradebook says: graded (with the score), missing or excused.
function gradeTag(a) {
  const g = a.grade;
  if (!g) return '';
  if (g.state === 'missing') return '<span class="grade-tag is-missing">Missing in Schoology</span>';
  if (g.state === 'excused') return '<span class="grade-tag">Excused</span>';
  const score = g.max ? `${g.score}/${g.max}` : g.percent !== null ? `${g.percent}%` : g.display;
  return `<span class="grade-tag is-graded">Graded${score ? ` ${esc(score)}` : ''}</span>`;
}

export function assignmentItem(a, classesById, { showDate = false, today } = {}) {
  const cls = classesById.get(a.classId);
  const color = cls?.color ?? 'var(--muted)';
  const isTest = a.type === 'test' || a.type === 'quiz';
  const overdue = !a.done && today && a.dueDate < today;
  return `
    <li class="assignment ${a.done ? 'done' : ''} ${overdue ? 'overdue' : ''}" style="--c:${esc(color)}">
      <button class="check" data-action="toggle-done" data-id="${esc(a.id)}" aria-label="${a.done ? 'Mark not done' : 'Mark done'}" aria-pressed="${a.done}">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10.5l3 3 7-7" /></svg>
      </button>
      <button class="assignment-body" data-action="edit-assignment" data-id="${esc(a.id)}">
        <span class="assignment-title">${esc(a.title)}</span>
        <span class="assignment-meta">
          <span class="type-tag ${isTest ? 'type-test' : ''}">${esc(typeLabel(a.type))}</span>
          <span>${esc(className(cls))}</span>
          ${showDate ? `<span class="${overdue ? 'overdue-text' : ''}">${esc(relativeDay(a.dueDate, today))}</span>` : ''}
          ${gradeTag(a)}
          ${a.source === 'schoology' && !a.grade ? '<span class="src">Schoology</span>' : ''}
        </span>
      </button>
    </li>`;
}

export function blockRow(b, { due = [], classesById, now = false, today } = {}) {
  const time = `<span class="block-time">${esc(formatRange(b.start, b.end))}</span>`;
  if (!b.isClass) {
    return `<li class="block block-${esc(b.kind ?? 'other')} ${now ? 'now' : ''}">
      ${time}<span class="block-label">${esc(b.label)}</span>
    </li>`;
  }
  const cls = b.cls;
  const details = [cls?.room && `Room ${cls.room}`, cls?.teacher].filter(Boolean).join(' · ');
  return `<li class="block block-class ${now ? 'now' : ''} ${cls ? '' : 'free'}" style="--c:${esc(cls?.color ?? 'var(--line)')}">
    ${time}
    <div class="block-main">
      <div class="block-title"><span class="period">P${b.period}</span> ${esc(cls ? className(cls) : 'Free period')}</div>
      ${details ? `<div class="block-details">${esc(details)}</div>` : ''}
      ${b.note ? `<div class="block-note">${esc(b.note)}</div>` : ''}
      ${due.length ? `<ul class="assignments compact">${due.map((a) => assignmentItem(a, classesById, { today })).join('')}</ul>` : ''}
    </div>
  </li>`;
}

export function eventChips(events) {
  if (!events.length) return '';
  return `<ul class="events">${events
    .map((e) => `<li class="event event-${esc(e.kind)}">${esc(e.title)}</li>`)
    .join('')}</ul>`;
}

export const emptyState = (title, body = '') =>
  `<div class="empty"><p class="empty-title">${esc(title)}</p>${body ? `<p>${body}</p>` : ''}</div>`;
