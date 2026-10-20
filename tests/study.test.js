import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeContext } from '../js/planner.js';
import { dayCapacity, estimate, formatMinutes, planWork } from '../js/study.js';

// Period 4 is a study hall, period 6 is left empty (a free period).
const classes = [1, 2, 3, 4, 5, 7].map((p) => ({ id: `c${p}`, period: p, name: p === 4 ? 'Study Hall' : `Class ${p}`, type: p === 4 ? 'Study Hall' : 'Regular', lunch: null }));
const profile = { campus: 'us', grade: 10, classes, closures: {} };

// Monday 2026-11-02 is a D day (2 3 4 5 6); Tuesday 11/03 is an E day (7 1 2 3 4);
// Wednesday 11/04 is an F day (5 6 7 1 2); Thursday 11/05 is a G day; Friday 11/06 has no classes.
const ctx = (assignments, { activities = [], now = new Date(2026, 10, 2, 7, 0), settings = {} } = {}) =>
  makeContext({ profile, assignments, activities, schoology: { overrides: {} }, settings }, now);

const a = (id, type, dueDate, extra = {}) => ({ id, title: id, type, dueDate, classId: 'c1', done: false, ...extra });
const sessionsOn = (plan, date) => (plan.days.get(date)?.sessions ?? []).map((s) => [s.assignment.id, s.minutes, s.slot]);

test('free periods and study halls count as study time; evenings lose activities', () => {
  const c = ctx([]);
  const monday = dayCapacity('2026-11-02', c); // D day: study hall P4 and empty P6 both meet
  assert.deepEqual(monday.free.map((f) => f.period), [4, 6]);
  assert.equal(monday.free[0].minutes, 60);
  assert.equal(monday.evening, 150); // capped by the default nightly budget

  const withSoccer = ctx([], { activities: [{ id: 's', title: 'Soccer', days: [1], start: '16:00', end: '19:00' }] });
  const busy = dayCapacity('2026-11-02', withSoccer);
  assert.ok(busy.evening < monday.evening && busy.evening > 0, `evening ${busy.evening}`);

  const tuesday = dayCapacity('2026-11-03', c); // E day: only P4 meets
  assert.deepEqual(tuesday.free.map((f) => f.period), [4]);

  assert.equal(dayCapacity('2026-11-07', c).evening, 75); // Saturday: half budget, no school
});

test('homework lands on the day before it is due, in a free period when it fits', () => {
  const plan = planWork(ctx([a('hw', 'homework', '2026-11-04'), a('read', 'reading', '2026-11-03', { minutes: 60 })]));
  assert.deepEqual(sessionsOn(plan, '2026-11-03'), [['hw', 20, 'free']]);
  assert.deepEqual(sessionsOn(plan, '2026-11-02'), [['read', 60, 'free']]);
  assert.equal(plan.unscheduled.length, 0);
});

test('a test is spread over the days before it, ending the night before', () => {
  const plan = planWork(ctx([a('bio', 'test', '2026-11-05')])); // Thursday test, planned from Monday
  const dates = [...plan.days.keys()].filter((d) => plan.days.get(d).sessions.length).sort();
  assert.deepEqual(dates, ['2026-11-03', '2026-11-04']);
  const total = dates.reduce((t, d) => t + plan.days.get(d).used, 0);
  assert.equal(total, estimate({ type: 'test' }));
  const last = plan.days.get('2026-11-04').sessions[0];
  assert.equal(last.part, 2);
  assert.equal(last.of, 2);
});

test('time already studied comes off the plan, and done sessions stay listed today', () => {
  const plan = planWork(ctx([a('bio', 'test', '2026-11-05', { sessions: { '2026-11-02': 45 } })]));
  const planned = [...plan.days.values()].reduce((t, d) => t + d.sessions.filter((s) => !s.done).reduce((u, s) => u + s.minutes, 0), 0);
  assert.equal(planned, 90 - 45);
  assert.deepEqual(sessionsOn(plan, '2026-11-02').filter(([, , slot]) => slot === 'evening'), [['bio', 45, 'evening']]);
  assert.ok(plan.days.get('2026-11-02').sessions.some((s) => s.done && s.minutes === 45));
});

test('overdue work is counted but not planned, and a packed night is flagged as over', () => {
  const settings = { studyBudget: 60 };
  const plan = planWork(ctx([a('late', 'homework', '2026-10-30'), a('big', 'essay', '2026-11-03', { minutes: 180 })], { settings }));
  const today = plan.days.get('2026-11-02');
  assert.equal(plan.overdue, 1);
  assert.ok(!today.sessions.some((s) => s.assignment.id === 'late'));
  assert.ok(today.over > 0, 'the night is over budget');
  assert.equal(today.used, 180);
});

test('due today is not planned, done work is skipped, and minutes format nicely', () => {
  const plan = planWork(ctx([a('now', 'homework', '2026-11-02'), a('done', 'test', '2026-11-05', { done: true })]));
  assert.equal([...plan.days.values()].reduce((t, d) => t + d.sessions.length, 0), 0);
  assert.equal(formatMinutes(45), '45 min');
  assert.equal(formatMinutes(120), '2 h');
  assert.equal(formatMinutes(150), '2 h 30 min');
});

test('after studying today, the rest of a test goes on later days, not today again', () => {
  const studied = a('bio', 'test', '2026-11-04', { sessions: { '2026-11-02': 60 } });
  const plan = planWork(ctx([studied]));
  const today = plan.days.get('2026-11-02').sessions.filter((s) => s.assignment.id === 'bio');
  assert.deepEqual(today.map((s) => [s.minutes, s.done]), [[60, true]]);
  const later = [...plan.days.values()].filter((d) => d.date > '2026-11-02').flatMap((d) => d.sessions).reduce((t, s) => t + s.minutes, 0);
  assert.equal(later, 90 - 60);
});

test('overdue work is not piled onto today', () => {
  const old = Array.from({ length: 40 }, (_, i) => a(`hw${i}`, 'homework', '2026-09-1' + (i % 10)));
  const recent = a('late', 'homework', '2026-10-30');
  const plan = planWork(ctx([...old, recent, a('hw', 'homework', '2026-11-03')]));
  assert.deepEqual(plan.days.get('2026-11-02').sessions.map((s) => s.assignment.id), ['hw']);
  assert.equal(plan.overdue, 1, 'only last week’s overdue work is counted');
});

test('calendar events ("other") are only planned when given a time', () => {
  const plan = planWork(ctx([a('assembly', 'other', '2026-11-03'), a('permission slip', 'other', '2026-11-03', { minutes: 15 })]));
  assert.deepEqual(sessionsOn(plan, '2026-11-02').map(([id]) => id), ['permission slip']);
});

test('homework only goes on a day that has one slot big enough for it', () => {
  // Tuesday: P4 study hall (60) and a short evening (practice until 7:55 PM).
  const busy = { activities: [{ id: 'p', title: 'Practice', days: [2], start: '15:30', end: '19:55' }] };
  const plan = planWork(ctx([a('h1', 'homework', '2026-11-04', { minutes: 45 }), a('h2', 'homework', '2026-11-04', { minutes: 45 })], busy));
  for (const d of plan.days.values()) assert.equal(d.over, 0, `${d.date} over by ${d.over}`);
});
