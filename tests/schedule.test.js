import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MS_LETTERS, US_LETTERS } from '../js/data/letters-2026-27.js';
import { weekday } from '../js/dates.js';
import { getDay, nextMeeting, nowAndNext, suggestLunch } from '../js/schedule.js';

const classes = [1, 2, 3, 4, 5, 6, 7].map((p) => ({ id: `c${p}`, period: p, name: `Class ${p}`, lunch: null }));
const us = (extra = {}) => ({ campus: 'us', grade: 10, classes, closures: {}, ...extra });
const ms = (extra = {}) => ({ campus: 'ms', grade: 7, classes, closures: {}, ...extra });
const periods = (day) => day.blocks.filter((b) => b.isClass).map((b) => b.period);

test('letter days only fall on weekdays and follow A-G except the US exam skip', () => {
  for (const [name, letters] of [['US', US_LETTERS], ['MS', MS_LETTERS]]) {
    const dates = Object.keys(letters).sort();
    for (const d of dates) assert.ok(weekday(d) >= 1 && weekday(d) <= 5, `${name} ${d} is a weekend`);
    const breaks = dates.slice(1).filter((d, i) => (letters[dates[i]].charCodeAt(0) - 64) % 7 !== letters[d].charCodeAt(0) - 65);
    assert.deepEqual(breaks, name === 'US' ? ['2027-01-06'] : [], `${name} rotation breaks`);
  }
  assert.equal(Object.keys(US_LETTERS).length, 162);
  assert.equal(Object.keys(MS_LETTERS).length, 163);
});

test('regular Upper School day uses the rotation for the letter', () => {
  const day = getDay('2026-10-20', us()); // Tuesday after Fall Break
  assert.equal(day.letter, 'B');
  assert.equal(day.status, 'class');
  assert.deepEqual(periods(day), [6, 7, 1, 2, 3]);
  assert.equal(day.blocks[0].start, '08:30');
});

test('Late Start Wednesday times', () => {
  const usDay = getDay('2026-10-21', us());
  assert.ok(usDay.lateStart);
  assert.equal(usDay.blocks.find((b) => b.isClass).start, '09:15');
  const msDay = getDay('2026-10-21', ms());
  assert.equal(msDay.blocks.find((b) => b.isClass).start, '08:55');
});

test('Upper School 3rd block splits into class and lunch by teacher order', () => {
  const unknown = getDay('2026-10-20', us()).blocks.find((b) => b.period === 1);
  assert.equal(unknown.lunchUnknown, true);
  assert.equal(unknown.start, '11:25');
  assert.equal(unknown.end, '13:05');

  const lunchFirst = classes.map((c) => (c.period === 1 ? { ...c, lunch: 'first' } : c));
  const blocks = getDay('2026-10-20', us({ classes: lunchFirst })).blocks;
  const i = blocks.findIndex((b) => b.kind === 'lunch');
  assert.deepEqual([blocks[i].start, blocks[i].end], ['11:25', '12:05']);
  assert.deepEqual([blocks[i + 1].period, blocks[i + 1].start, blocks[i + 1].end], [1, '12:05', '13:05']);

  const classFirst = classes.map((c) => (c.period === 1 ? { ...c, lunch: 'second' } : c));
  const b2 = getDay('2026-10-20', us({ classes: classFirst })).blocks;
  const j = b2.findIndex((b) => b.period === 1);
  assert.deepEqual([b2[j].start, b2[j].end, b2[j + 1].kind, b2[j + 1].start], ['11:25', '12:25', 'lunch', '12:25']);
});

test('Middle School shows only your grade lunch and the right 10:40 block', () => {
  const day = getDay('2026-10-22', ms({ grade: 6 })); // Thursday
  const lunches = day.blocks.filter((b) => b.kind === 'lunch').map((b) => b.label);
  assert.deepEqual(lunches, ['Grade 6 Lunch']);
  assert.ok(day.blocks.some((b) => b.label === 'Advisory' && b.start === '10:40'));
  assert.ok(getDay('2026-10-26', ms()).blocks.some((b) => b.label === 'Convocation'));
});

test('campuses differ on Dec 14: US exams, MS G day', () => {
  const usDay = getDay('2026-12-14', us());
  assert.equal(usDay.letter, null);
  assert.equal(usDay.status, 'exam');
  const msDay = getDay('2026-12-14', ms());
  assert.equal(msDay.letter, 'G');
  assert.deepEqual(periods(msDay), [3, 4, 5, 6, 7]);
});

test('Middle School all-period alt day meets every period', () => {
  const day = getDay('2026-12-15', ms());
  assert.equal(day.status, 'special');
  assert.deepEqual(periods(day), [1, 2, 3, 4, 5, 6, 7]);
});

test('holidays, weekends and user closures', () => {
  assert.equal(getDay('2026-10-19', us()).status, 'closed');
  assert.equal(getDay('2026-10-15', us()).status, 'noclasses');
  assert.equal(getDay('2026-10-17', us()).status, 'weekend');
  assert.equal(getDay('2026-10-17', us()).events[0].title, 'ACT testing');
  const closed = getDay('2026-10-20', us({ closures: { '2026-10-20': 'Hurricane' } }));
  assert.equal(closed.status, 'closed');
  assert.equal(closed.name, 'Hurricane');
  assert.equal(closed.blocks.length, 0);
  // The official calendar keeps its letters: the next day is still C.
  assert.equal(getDay('2026-10-21', us({ closures: { '2026-10-20': '' } })).letter, 'C');
});

test('grade-specific events are filtered', () => {
  const titles = (g) => getDay('2026-10-28', ms({ grade: g })).events.map((e) => e.title);
  assert.ok(titles(8).includes('Grade 8 Class Trip'));
  assert.ok(!titles(6).includes('Grade 8 Class Trip'));
});

test('Advisory Circles Mondays split the activities block', () => {
  const labels = getDay('2026-10-26', us()).blocks.filter((b) => !b.isClass).map((b) => b.label);
  assert.ok(labels.includes('Advisory Circles'));
});

test('next class meeting skips days the class does not meet', () => {
  // Period 6 meets on B, C, D, F, G. Friday Oct 23 is E, so next is Monday Oct 26 (F).
  const next = nextMeeting(us(), 'c6', '2026-10-23');
  assert.equal(next.date, '2026-10-26');
  assert.equal(next.block.period, 6);
  // Skips Thanksgiving week; Nov 30 is a D day (no P1), so Dec 1 (E).
  assert.equal(nextMeeting(us(), 'c1', '2026-11-21').date, '2026-12-01');
});

test('now and next', () => {
  const day = getDay('2026-10-20', us());
  const { current, next } = nowAndNext(day, '09:00');
  assert.equal(current.period, 6);
  assert.equal(next.period, 7);
});

test('lunch order suggestion from the planner teacher list', () => {
  assert.equal(suggestLunch('Ms. Hicks'), 'second');
  assert.equal(suggestLunch('Mr. Elliott'), 'first');
  assert.equal(suggestLunch('Dr. Li'), 'second');
  assert.equal(suggestLunch('Lieb'), 'first');
  assert.equal(suggestLunch('Mr. Bruns'), null); // listed on both lists by subject
  assert.equal(suggestLunch('Stam'), null); // two Stams, needs an initial
  assert.equal(suggestLunch('Andrea Stam'), 'first');
  assert.equal(suggestLunch("Mrs. O'Neill"), 'second');
  assert.equal(suggestLunch('Somebody New'), null);
});
