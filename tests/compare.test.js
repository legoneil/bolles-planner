import assert from 'node:assert/strict';
import { test } from 'node:test';

import { classesTogether, compareDay, friendNow, sameSection, sharedSchedule } from '../js/compare.js';

const me = {
  campus: 'us',
  grade: 10,
  closures: {},
  classes: [
    { id: 'a', period: 1, name: 'AP Biology', teacher: 'Ms. Hicks', room: 'S204', color: '#f00', lunch: 'second' },
    { id: 'b', period: 2, name: 'English 10', teacher: 'Mr. Dale', lunch: null },
    { id: 'c', period: 3, name: 'Precalculus', teacher: 'Mr. Elliott', lunch: 'first' },
    { id: 'd', period: 7, name: 'Chemistry', teacher: 'Dr. Li', lunch: 'second' },
  ],
};

const friend = {
  campus: 'us',
  grade: 10,
  classes: [
    { period: 1, name: 'Bio (AP)', teacher: 'Hicks', room: 'S204', lunch: 'second' }, // same section, different name
    { period: 2, name: 'English 10', teacher: 'Mrs. Crotty', lunch: 'second' }, // same name, different teacher: counts
    { period: 3, name: 'Spanish III', teacher: 'Sra. Garcia', lunch: 'second' },
    { period: 4, name: 'Chemistry', teacher: 'Dr. Li', lunch: 'first' }, // same class, different period
  ],
};

test('shared schedule keeps only what friends need', () => {
  const s = sharedSchedule({ ...me, closures: { '2026-10-20': 'x' } });
  assert.deepEqual(Object.keys(s), ['campus', 'grade', 'classes']);
  assert.deepEqual(Object.keys(s.classes[0]).sort(), ['lunch', 'name', 'period', 'room', 'teacher', 'type']);
  assert.equal(JSON.stringify(s).includes('#f00'), false);
});

test('same section needs the same period and teacher or name', () => {
  assert.ok(sameSection(me.classes[0], friend.classes[0]));
  assert.ok(sameSection(me.classes[1], friend.classes[1]));
  assert.ok(!sameSection(me.classes[2], friend.classes[2]));
  assert.ok(!sameSection(me.classes[3], friend.classes[3]));
});

test('classes together, with their letter days', () => {
  const t = classesTogether(me, friend);
  assert.deepEqual(t.map((x) => x.period), [1, 2]);
  assert.deepEqual(t[0].letters, ['A', 'B', 'C', 'E', 'F']);
  assert.deepEqual(classesTogether(me, { ...friend, campus: 'ms' }), []);
});

test('compare a B day: together in P1, P2; lunch overlaps; free time', () => {
  // Tue Oct 20 2026 is a B day: periods 6, 7, 1, 2, 3.
  const c = compareDay('2026-10-20', me, friend);
  assert.deepEqual(c.together.map((b) => b.period), [1, 2]);
  // P1 is in the lunch block. Both class-first, so lunch 12:25-1:05 together.
  assert.deepEqual(c.lunch.map((l) => [l.start, l.end]), [['12:25', '13:05']]);
  // P6 is free for both of us.
  assert.deepEqual(c.free.map((f) => [f.start, f.end]), [['08:30', '09:30']]);
});

test('study hall counts as free time', () => {
  const withStudyHall = { ...me, classes: [...me.classes, { id: 'e', period: 6, name: 'Study Hall', teacher: '' }] };
  assert.deepEqual(compareDay('2026-10-20', withStudyHall, friend).free.map((f) => f.start), ['08:30']);
});

test('different lunch order means no lunch together', () => {
  const f2 = { ...friend, classes: friend.classes.map((c) => (c.period === 1 ? { ...c, lunch: 'first' } : c)) };
  assert.deepEqual(compareDay('2026-10-20', me, f2).lunch, []);
});

test('Middle School lunch depends on grade', () => {
  const ms = (grade) => ({ campus: 'ms', grade, classes: [], closures: {} });
  assert.equal(compareDay('2026-10-20', ms(7), { campus: 'ms', grade: 7, classes: [] }).lunch.length, 1);
  assert.equal(compareDay('2026-10-20', ms(7), { campus: 'ms', grade: 8, classes: [] }).lunch.length, 0);
});

test('where a friend is now', () => {
  assert.equal(friendNow(friend, '2026-10-20', '09:00').text, 'Free (P6)');
  assert.equal(friendNow(friend, '2026-10-20', '11:40').text, 'P1 Bio (AP) · Room S204');
  assert.equal(friendNow(friend, '2026-10-20', '12:40').text, 'Lunch');
  assert.equal(friendNow(friend, '2026-10-20', '16:00').text, 'After school');
  assert.equal(friendNow(friend, '2026-10-17', '12:00').text, 'Weekend');
  assert.equal(friendNow(friend, '2026-10-19', '12:00').text, 'Fall Break · school closed');
});
