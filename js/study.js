// Work plan: when to do each assignment. Homework lands on the last evening
// (or free period) before it's due; tests, quizzes, essays and projects are
// spread over several days before. Each day has a limited amount of time:
// free periods and study halls at school, plus the evening after school and
// activities, capped by the student's nightly study time.

import { activitiesOn } from './planner.js';
import { addDays, minutes, nowMinutes, weekday } from './dates.js';
import { getDay } from './schedule.js';

// How much time each kind of work takes by default, and how it's spread.
export const WORK = {
  homework: { minutes: 30 },
  reading: { minutes: 30 },
  lab: { minutes: 30 },
  other: { minutes: 30 },
  quiz: { minutes: 45, days: 2, session: 30 },
  test: { minutes: 120, days: 4, session: 45 },
  essay: { minutes: 180, days: 6, session: 60 },
  project: { minutes: 240, days: 7, session: 60 },
};

export const TIME_CHOICES = [15, 30, 45, 60, 90, 120, 180, 240, 300];
export const DEFAULT_BUDGET = 150;
export const BUDGET_CHOICES = [60, 90, 120, 150, 180, 240];

const EVENING_ENDS = minutes('21:30');
const WEEKEND_STARTS = minutes('09:00');
const BREAK_MINUTES = 60; // dinner and a breather
const MIN_SESSION = 15;
const HORIZON_DAYS = 21;
const OVERDUE_DAYS = 7; // older unfinished work isn't piled onto today

const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

export const workKind = (a) => WORK[a.type] ?? WORK.other;
export const isBigWork = (a) => Boolean(workKind(a).days);
export const estimate = (a) => (Number(a.minutes) > 0 ? Number(a.minutes) : workKind(a).minutes);

// Minutes already logged (study sessions checked off), by date.
const logged = (a) => Object.values(a.sessions ?? {}).reduce((t, m) => t + (Number(m) || 0), 0);

export const formatMinutes = (m) => {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} h ${rest} min` : `${h} h`;
};

const overlap = (s1, e1, s2, e2) => Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));

// Study time available on a date: free periods at school and the evening.
export function dayCapacity(date, ctx, { budget = DEFAULT_BUDGET, nowMin = null } = {}) {
  const day = getDay(date, ctx.profile);
  const free = day.blocks
    .filter((b) => b.isClass && (!b.cls || !b.cls.name || b.cls.type === 'Study Hall'))
    .filter((b) => nowMin === null || minutes(b.start) >= nowMin)
    .map((b) => ({
      kind: 'free',
      start: b.start,
      end: b.end,
      period: b.period,
      label: b.cls?.name ? `P${b.period} ${b.cls.name}` : `P${b.period} free period`,
      // A 3rd-block study hall with an unknown lunch order still includes lunch.
      minutes: minutes(b.end) - minutes(b.start) - (b.lunchUnknown ? 40 : 0),
    }));

  const schoolEnd = day.blocks.length ? Math.max(...day.blocks.map((b) => minutes(b.end ?? b.start))) + 30 : WEEKEND_STARTS;
  const start = Math.max(schoolEnd, nowMin ?? 0);
  let evening = Math.max(0, EVENING_ENDS - start);
  for (const act of activitiesOn(date, ctx.activities ?? [])) {
    evening -= overlap(start, EVENING_ENDS, minutes(act.start), minutes(act.end));
  }
  if (start < minutes('19:00')) evening -= BREAK_MINUTES;
  // Friday and Saturday nights count for half.
  const nightly = [5, 6].includes(weekday(date)) ? Math.round(budget / 2) : budget;
  evening = Math.max(0, Math.min(evening, nightly));
  return { day, free, evening };
}

// Pick `count` dates from `days` (oldest first), evenly spaced and always
// including the last one (the day before it's due).
function spread(days, count) {
  if (count >= days.length) return [...days];
  const out = [];
  for (let i = 0; i < count; i++) out.push(days[Math.round(((days.length - 1) * (i + 1)) / count)]);
  return [...new Set(out)];
}

// The plan from `ctx.today` for the next few weeks.
// Returns { days: Map(date -> { capacity, sessions, used, over }), unscheduled }
export function planWork(ctx, { budget = ctx.state?.settings?.studyBudget ?? DEFAULT_BUDGET } = {}) {
  const today = ctx.today;
  const nowMin = ctx.now ? nowMinutes(ctx.now) : null;
  const open = ctx.assignments.filter(
    (a) => !a.done && a.dueDate && a.dueDate <= addDays(today, HORIZON_DAYS) && a.dueDate >= addDays(today, -OVERDUE_DAYS),
  );
  const work = open
    .filter((a) => a.dueDate > today || a.dueDate < today) // due today: it's due in class, too late to plan
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || Number(isBigWork(b)) - Number(isBigWork(a)) || a.title.localeCompare(b.title));

  const days = new Map();
  const dayOf = (date) => {
    if (!days.has(date)) {
      const cap = dayCapacity(date, ctx, { budget, nowMin: date === today ? nowMin : null });
      const slots = [...cap.free.map((f) => ({ ...f, left: f.minutes })), { kind: 'evening', label: 'Evening', left: cap.evening, minutes: cap.evening }];
      days.set(date, { date, capacity: cap.free.reduce((t, f) => t + f.minutes, 0) + cap.evening, slots, sessions: [], used: 0, over: 0 });
    }
    return days.get(date);
  };

  // Today's checked-off sessions stay on today's list and use up its time.
  for (const a of ctx.assignments) {
    const m = Number(a.sessions?.[today]);
    if (!m || a.dueDate < today) continue;
    const d = dayOf(today);
    const evening = d.slots.at(-1);
    evening.left = Math.max(0, evening.left - m);
    d.used += m;
    d.sessions.push(session(a, m, evening, { done: true }));
  }

  const unscheduled = [];
  for (const a of work) {
    const remaining = Math.max(0, estimate(a) - logged(a));
    if (!remaining) continue;
    const last = a.dueDate < today ? today : addDays(a.dueDate, -1);
    if (a.dueDate < today) {
      place(dayOf(today), a, remaining, { overdue: true });
      continue;
    }
    const kind = workKind(a);
    if (!kind.days) {
      // Latest day with room, back to today; otherwise squeeze it into the last evening.
      let target = null;
      for (let d = last; d >= today; d = addDays(d, -1)) {
        if (roomFor(dayOf(d)) >= remaining) {
          target = d;
          break;
        }
      }
      place(dayOf(target ?? last), a, remaining);
      continue;
    }
    // Already studied today: spread the rest from tomorrow (unless it's due tomorrow).
    const start = a.sessions?.[today] && addDays(today, 1) <= last ? addDays(today, 1) : today;
    const first = [addDays(a.dueDate, -kind.days), start].sort().at(-1);
    const window = [];
    for (let d = first; d <= last; d = addDays(d, 1)) window.push(d);
    if (!window.length) {
      unscheduled.push(a);
      continue;
    }
    const count = Math.max(1, Math.min(window.length, Math.ceil(remaining / kind.session)));
    const chosen = spread(window, count);
    let left = remaining;
    chosen.forEach((date, i) => {
      const share = i === chosen.length - 1 ? left : Math.min(left, Math.max(MIN_SESSION, round5(remaining / chosen.length)));
      left -= share;
      if (share > 0) place(dayOf(date), a, share, { part: i + 1, of: chosen.length });
    });
  }

  for (const d of days.values()) d.sessions.sort(bySlot);
  return { days, unscheduled };

  // Fill free periods first (whole sessions only), then the evening; whatever
  // doesn't fit still goes on the evening and is counted as over.
  function place(d, a, m, extra = {}) {
    const freeSlot = d.slots.find((s) => s.kind === 'free' && s.left >= m && a.dueDate > d.date);
    const slot = freeSlot ?? d.slots.at(-1);
    const fits = Math.min(slot.left, m);
    slot.left -= fits;
    d.over += m - fits;
    d.used += m;
    d.sessions.push(session(a, m, slot, extra));
  }
}

// Homework goes in one slot: the largest free period or the evening.
const roomFor = (d) => Math.max(0, ...d.slots.map((s) => s.left));

function session(a, m, slot, extra) {
  return {
    assignment: a,
    minutes: m,
    slot: slot.kind,
    slotLabel: slot.label,
    start: slot.start ?? null,
    study: isBigWork(a),
    done: false,
    ...extra,
  };
}

const bySlot = (x, y) =>
  (x.slot === 'evening') - (y.slot === 'evening') ||
  (x.start ?? '').localeCompare(y.start ?? '') ||
  Number(x.done) - Number(y.done) ||
  x.assignment.dueDate.localeCompare(y.assignment.dueDate);
