// Which notifications to send and when, for the next two weeks. The list is
// saved to the account (push_queue) and the server sends each one on time,
// even when the planner isn't open. Times are the device's local time.

import { addDays, diffDays, formatRange, formatTime, parseISO, relativeDay, toISO } from './dates.js';
import { plannerDay } from './planner.js';
import { formatMinutes, planWork } from './study.js';
import { className, typeLabel } from './ui.js';
import { OVERLOAD_DAY, testsByDate } from './workload.js';

const formatWeekdayLong = (iso) => parseISO(iso).toLocaleDateString('en-US', { weekday: 'long' });

export const NOTIFY_DEFAULTS = {
  enabled: false, // reminders are queued for this account
  morning: true,
  morningTime: '07:00',
  evening: true,
  eveningTime: '20:00',
  plan: true,
  planTime: '16:00',
  weekAhead: true,
};

export const notifyPrefs = (state) => ({ ...NOTIFY_DEFAULTS, ...state?.settings?.notify });

const HORIZON_DAYS = 14;
const WEEK_AHEAD_TIME = '16:00';
const MAX_BODY = 300;

const at = (date, hhmm) => {
  const d = parseISO(date);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

const clip = (s, n = MAX_BODY) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// "Unit 4 test (AP Biology) · Read ch. 7 (English 10) · +2 more"
function listOf(items, ctx, { max = 3, label = (a) => a.title } = {}) {
  const shown = items.slice(0, max).map((a) => {
    const cls = ctx.classesById.get(a.classId);
    return cls ? `${label(a)} (${className(cls)})` : label(a);
  });
  if (items.length > max) shown.push(`+${items.length - max} more`);
  return shown.join(' · ');
}

// "tomorrow", "on Thursday", "next Thursday", "on Thu, Nov 19"
function whenFrom(from, date) {
  const days = diffDays(from, date);
  if (days === 1) return 'tomorrow';
  if (days === 7) return `next ${formatWeekdayLong(date)}`;
  return `on ${relativeDay(date, from)}`;
}

const isTestLike = (a) => a.type === 'test' || a.type === 'quiz';
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function morning(date, ctx) {
  const day = plannerDay(date, ctx);
  const classes = day.blocks.filter((b) => b.isClass);
  if (!classes.length) return null;
  const title = [day.letter ? `${day.letter} day` : day.name, day.lateStart && 'Late Start', day.letter && day.status === 'special' && day.name]
    .filter(Boolean)
    .join(' · ');
  const first = classes.find((b) => b.cls) ?? classes[0];
  const parts = [
    first.cls
      ? `First: P${first.period} ${className(first.cls)} at ${formatTime(first.start)}${first.cls.room ? ` in ${first.cls.room}` : ''}.`
      : `School starts at ${formatTime(day.blocks[0].start)}.`,
  ];
  const tests = day.due.filter((a) => !a.done && isTestLike(a));
  if (tests.length) parts.push(`${tests.length === 1 ? `${typeLabel(tests[0].type)} today` : `${tests.length} tests and quizzes today`}: ${listOf(tests, ctx)}.`);
  const acts = day.blocks.filter((b) => b.kind === 'personal');
  if (acts.length) parts.push(`After school: ${acts.map((b) => `${b.label} ${formatRange(b.start, b.end)}`).join(', ')}.`);
  return { title: title || 'School today', body: parts.join(' '), url: '#/today' };
}

function evening(date, ctx) {
  const tomorrow = addDays(date, 1);
  const day = plannerDay(tomorrow, ctx);
  const due = day.due.filter((a) => !a.done);
  if (!due.length) return null;
  const tests = due.filter((a) => a.type === 'test');
  const quizzes = due.filter((a) => a.type === 'quiz');
  let title;
  if (tests.length >= 2) title = `${tests.length} tests tomorrow`;
  else if (tests.length === 1) title = `Test tomorrow: ${className(ctx.classesById.get(tests[0].classId))}`;
  else if (quizzes.length) title = quizzes.length === 1 ? `Quiz tomorrow: ${className(ctx.classesById.get(quizzes[0].classId))}` : `${quizzes.length} quizzes tomorrow`;
  else title = `Due tomorrow: ${plural(due.length, 'assignment')}`;
  if (day.letter) title += ` (${day.letter} day)`;
  const ordered = [...tests, ...quizzes, ...due.filter((a) => !isTestLike(a))];
  return { title, body: listOf(ordered, ctx, { max: 4 }), url: `#/day/${tomorrow}` };
}

function tonight(date, plan, ctx) {
  const sessions = (plan.days.get(date)?.sessions ?? []).filter((s) => !s.done && s.slot === 'evening');
  if (!sessions.length) return null;
  const total = sessions.reduce((t, s) => t + s.minutes, 0);
  const label = (s) => `${s.study ? `Study for ${s.assignment.title}` : s.assignment.title} (${formatMinutes(s.minutes)})`;
  const shown = sessions.slice(0, 3).map(label);
  if (sessions.length > 3) shown.push(`+${sessions.length - 3} more`);
  return { title: `Tonight: about ${formatMinutes(total)}`, body: shown.join(' · '), url: '#/plan' };
}

// Every reminder from `ctx.now` through the next two weeks, soonest first:
// [{ key, sendAt: Date, title, body, url }]
export function buildReminders(ctx, prefs = notifyPrefs(ctx.state)) {
  if (!ctx.profile) return [];
  const now = ctx.now;
  const out = [];
  const add = (key, sendAt, msg) => {
    if (!msg || sendAt <= now) return;
    out.push({ key, sendAt, title: clip(msg.title, 120), body: clip(msg.body), url: msg.url });
  };
  const plan = prefs.plan ? planWork(ctx) : null;

  for (let i = 0; i < HORIZON_DAYS; i++) {
    const date = addDays(ctx.today, i);
    if (prefs.morning) add(`morn-${date}`, at(date, prefs.morningTime), morning(date, ctx));
    if (prefs.evening) add(`eve-${date}`, at(date, prefs.eveningTime), evening(date, ctx));
    if (plan) add(`plan-${date}`, at(date, prefs.planTime), tonight(date, plan, ctx));
  }

  // A week's warning for days with 3+ tests. If the third test was added
  // late, warn at the next 4 PM instead, as long as there are 2+ days left.
  if (prefs.weekAhead) {
    for (const [date, tests] of testsByDate(ctx.assignments.filter((a) => !a.done))) {
      if (tests.length < OVERLOAD_DAY || date <= ctx.today || diffDays(ctx.today, date) > HORIZON_DAYS + 7) continue;
      let send = at(addDays(date, -7), WEEK_AHEAD_TIME);
      if (send <= now) {
        send = at(ctx.today, WEEK_AHEAD_TIME);
        if (send <= now) send = at(addDays(ctx.today, 1), WEEK_AHEAD_TIME);
      }
      const sendDate = toISO(send);
      if (diffDays(sendDate, date) < 2) continue;
      add(`week-${date}`, send, {
        title: `${tests.length} tests ${whenFrom(sendDate, date)}`,
        body: `${listOf(tests, ctx, { max: 4 })}. You may want to ask a teacher to move one.`,
        url: `#/day/${date}`,
      });
    }
  }
  return out.sort((a, b) => a.sendAt - b.sendAt);
}
