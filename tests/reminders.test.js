import assert from 'node:assert/strict';
import { test } from 'node:test';

import { makeContext } from '../js/planner.js';
import { buildReminders, NOTIFY_DEFAULTS } from '../js/reminders.js';

const classes = [
  { id: 'c1', period: 1, name: 'AP Biology', room: 'S204', type: 'AP', lunch: 'first' },
  { id: 'c2', period: 2, name: 'English 10', room: 'L110', type: 'Honors', lunch: 'first' },
  { id: 'c3', period: 3, name: 'Precalculus', type: 'Regular', lunch: 'first' },
  { id: 'c4', period: 4, name: 'Study Hall', type: 'Study Hall', lunch: 'first' },
  { id: 'c5', period: 5, name: 'Spanish III', type: 'Regular', lunch: 'first' },
  { id: 'c6', period: 6, name: 'US History', type: 'Regular', lunch: 'first' },
  { id: 'c7', period: 7, name: 'Chemistry', room: 'S110', type: 'Regular', lunch: 'first' },
];
const profile = { campus: 'us', grade: 10, classes, closures: {} };
const a = (id, type, dueDate, classId, extra = {}) => ({ id, title: id, type, dueDate, classId, done: false, ...extra });

// Monday Nov 2 2026, 6:00 AM. Nov 2 is a D day, Nov 3 E (P7 first), Nov 4 F (Late Start), Nov 6 has no classes.
const ctxAt = (assignments, { now = new Date(2026, 10, 2, 6, 0), activities = [], notify = {} } = {}) =>
  makeContext({ profile, assignments, activities, schoology: { overrides: {} }, settings: { notify: { ...NOTIFY_DEFAULTS, enabled: true, ...notify } } }, now);
const byKey = (list) => Object.fromEntries(list.map((r) => [r.key, r]));

test('morning: letter day, first class with room, and tests today', () => {
  const r = byKey(buildReminders(ctxAt([a('Unit 4 test', 'test', '2026-11-03', 'c1')])));
  const tue = r['morn-2026-11-03'];
  assert.equal(tue.title, 'E day');
  assert.match(tue.body, /^First: P7 Chemistry at 8:30 AM in S110\./);
  assert.match(tue.body, /Test today: Unit 4 test \(AP Biology\)\./);
  assert.equal(tue.sendAt.getTime(), new Date(2026, 10, 3, 7, 0).getTime());
  assert.equal(r['morn-2026-11-04'].title, 'F day · Late Start');
  assert.equal(r['morn-2026-11-06'], undefined, 'no morning reminder on a day without classes');
  assert.equal(r['morn-2026-11-07'], undefined, 'or on weekends');
});

test('night before: tests first, letter day in the title, nothing when nothing is due', () => {
  const list = buildReminders(
    ctxAt([a('Unit 4 test', 'test', '2026-11-05', 'c1'), a('Chapter 6 test', 'test', '2026-11-05', 'c3'), a('Read ch. 7', 'reading', '2026-11-05', 'c2'), a('Vocab quiz', 'quiz', '2026-11-03', 'c5')]),
  );
  const r = byKey(list);
  assert.equal(r['eve-2026-11-04'].title, '2 tests tomorrow (G day)');
  assert.equal(r['eve-2026-11-04'].body, 'Unit 4 test (AP Biology) · Chapter 6 test (Precalculus) · Read ch. 7 (English 10)');
  assert.equal(r['eve-2026-11-04'].url, '#/day/2026-11-05');
  assert.equal(r['eve-2026-11-02'].title, 'Quiz tomorrow: Spanish III (E day)');
  assert.equal(r['eve-2026-11-03'], undefined);
  assert.equal(r['eve-2026-11-04'].sendAt.getTime(), new Date(2026, 10, 4, 20, 0).getTime());
});

test('done work, past times and turned-off kinds are left out', () => {
  const late = ctxAt([a('Essay', 'essay', '2026-11-03', 'c2', { done: true }), a('HW', 'homework', '2026-11-03', 'c3')], { now: new Date(2026, 10, 2, 21, 0) });
  const r = byKey(buildReminders(late));
  assert.equal(r['eve-2026-11-02'], undefined, '8 PM already passed');
  assert.equal(r['morn-2026-11-02'], undefined);
  const off = byKey(buildReminders(ctxAt([a('HW', 'homework', '2026-11-04', 'c3')], { notify: { morning: false, plan: false } })));
  assert.ok(!Object.keys(off).some((k) => k.startsWith('morn-') || k.startsWith('plan-')));
  assert.equal(off['eve-2026-11-03'].title, 'Due tomorrow: 1 assignment (F day)');
});

test('tonight’s plan lists evening study sessions with times', () => {
  const r = byKey(buildReminders(ctxAt([a('Unit 4 test', 'test', '2026-11-05', 'c1'), a('Chapter 6 test', 'test', '2026-11-05', 'c3')])));
  const plan = r['plan-2026-11-02'];
  assert.match(plan.title, /^Tonight: about \d/);
  assert.match(plan.body, /Study for Unit 4 test \(\d+ min\)/);
  assert.equal(plan.url, '#/plan');
  assert.equal(plan.sendAt.getTime(), new Date(2026, 10, 2, 16, 0).getTime());
});

test('3+ tests get a warning a week ahead, or at the next 4 PM if added late', () => {
  const tests = (date) => ['c1', 'c3', 'c7'].map((c) => a(`Test ${c}`, 'test', date, c));
  const ahead = byKey(buildReminders(ctxAt(tests('2026-11-12'))));
  const w = ahead['week-2026-11-12'];
  assert.equal(w.sendAt.getTime(), new Date(2026, 10, 5, 16, 0).getTime());
  assert.equal(w.title, '3 tests next Thursday');
  assert.equal(byKey(buildReminders(ctxAt(tests('2026-11-05'))))['week-2026-11-05'].title, '3 tests on Thursday');
  assert.match(w.body, /You may want to ask a teacher to move one\.$/);

  const late = byKey(buildReminders(ctxAt(tests('2026-11-05'))));
  assert.equal(late['week-2026-11-05'].sendAt.getTime(), new Date(2026, 10, 2, 16, 0).getTime());
  const tooLate = byKey(buildReminders(ctxAt(tests('2026-11-03'))));
  assert.equal(tooLate['week-2026-11-03'], undefined, 'too close: the night-before reminder covers it');
});

test('everything fits the server’s limits', () => {
  const many = Array.from({ length: 40 }, (_, i) => a(`A very long assignment name number ${i} `.repeat(4), i % 3 ? 'homework' : 'test', `2026-11-${String(3 + (i % 10)).padStart(2, '0')}`, `c${(i % 7) + 1}`));
  const list = buildReminders(ctxAt(many));
  assert.ok(list.length <= 200);
  for (const r of list) {
    assert.match(r.key, /^[a-z0-9-]{1,60}$/);
    assert.ok(r.title.length <= 120 && r.body.length <= 300, r.key);
    assert.match(r.url, /^#\/[A-Za-z0-9/_-]{0,80}$/);
  }
  assert.deepEqual(list.map((r) => r.sendAt), [...list.map((r) => r.sendAt)].sort((x, y) => x - y));
});

test('a quiz with no class does not say "No class"', () => {
  const r = byKey(buildReminders(ctxAt([a('Pop quiz', 'quiz', '2026-11-03', null)])));
  assert.equal(r['eve-2026-11-02'].title, 'Quiz tomorrow (E day)');
});
