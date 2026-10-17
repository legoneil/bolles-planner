// Derived data that combines the school calendar with what the student entered.

import { SCHOOL_YEAR } from './data/bolles-2026-27.js';
import { addDays, minutes, todayISO, weekday } from './dates.js';
import { buildICS } from './ical.js';
import { getDay, meetingsOn } from './schedule.js';
import { allAssignments } from './store.js';
import { className, typeLabel } from './ui.js';

export function makeContext(state, now = new Date()) {
  const profile = state.profile;
  const assignments = allAssignments(state).filter((a) => !a.hidden);
  return {
    state,
    profile,
    assignments,
    activities: state.activities ?? [],
    classesById: new Map((profile?.classes ?? []).map((c) => [c.id, c])),
    today: todayISO(now),
    now,
  };
}

export function activitiesOn(date, activities) {
  const wd = weekday(date);
  return activities
    .filter((a) => (a.date ? a.date === date : a.days?.includes(wd) && (!a.from || date >= a.from) && (!a.to || date <= a.to)))
    .map((a) => ({ label: a.title, kind: 'personal', start: a.start, end: a.end, isClass: false, activityId: a.id, color: a.color }));
}

// The school day plus personal activities, with assignments attached to the
// class meeting they are due in.
export function plannerDay(date, ctx) {
  const day = getDay(date, ctx.profile);
  const extra = activitiesOn(date, ctx.activities);
  const blocks = [...day.blocks, ...extra].sort((a, b) => minutes(a.start) - minutes(b.start));
  const due = ctx.assignments.filter((a) => a.dueDate === date);
  const meetingClassIds = new Set(day.blocks.filter((b) => b.isClass && b.classId).map((b) => b.classId));
  const placed = new Set();
  const dueByBlock = new Map();
  for (const b of blocks) {
    if (!b.isClass || !b.classId) continue;
    const list = due.filter((a) => a.classId === b.classId && !placed.has(a.id));
    list.forEach((a) => placed.add(a.id));
    dueByBlock.set(b, list);
  }
  const unplaced = due.filter((a) => !placed.has(a.id));
  return { ...day, blocks, dueByBlock, due, unplaced, meetingClassIds };
}

// Human description of when an assignment is due, e.g. "In class · P4 1:05–2:00 PM".
export function dueDescription(a, ctx) {
  if (!a.classId || !a.dueDate) return null;
  const [block] = meetingsOn(a.dueDate, ctx.profile, a.classId);
  return block ?? null;
}

export function buildExport(ctx, { assignments = true, events = true, schedule = false } = {}) {
  const items = [];
  const from = ctx.today;
  if (assignments) {
    for (const a of ctx.assignments) {
      if (a.done || !a.dueDate || a.dueDate < addDays(from, -7)) continue;
      const cls = ctx.classesById.get(a.classId);
      const [block] = a.classId ? meetingsOn(a.dueDate, ctx.profile, a.classId) : [];
      items.push({
        uid: `assignment-${a.id}@bolles-planner`,
        title: `${typeLabel(a.type)}: ${a.title}${cls ? ` (${className(cls)})` : ''}`,
        date: a.dueDate,
        start: block?.start ?? a.dueTime ?? null,
        end: block?.end ?? null,
        description: a.notes,
        url: a.url,
      });
    }
  }
  for (let date = from; date <= SCHOOL_YEAR.lastDay; date = addDays(date, 1)) {
    const day = getDay(date, ctx.profile);
    if (events) {
      day.events.forEach((e, i) => items.push({ uid: `event-${date}-${i}@bolles-planner`, title: e.title, date }));
      if (day.letter) items.push({ uid: `letter-${date}@bolles-planner`, title: `${day.letter} Day`, date });
    }
    if (schedule) {
      for (const b of day.blocks) {
        if (!b.isClass || !b.cls) continue;
        items.push({
          uid: `class-${date}-${b.period}@bolles-planner`,
          title: `P${b.period} ${className(b.cls)}`,
          date,
          start: b.start,
          end: b.end,
          description: [b.cls.teacher, b.cls.room && `Room ${b.cls.room}`].filter(Boolean).join(' · '),
        });
      }
    }
  }
  return buildICS(items);
}
