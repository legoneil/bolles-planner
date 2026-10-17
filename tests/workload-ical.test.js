import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildICS, guessType, parseICS, schoologyToAssignments } from '../js/ical.js';
import { overloadAlerts, testWarnings } from '../js/workload.js';

const t = (id, dueDate, type = 'test') => ({ id, title: id, type, dueDate, classId: null });

test('heavy and overloaded test days', () => {
  const list = [t('a', '2026-10-22'), t('b', '2026-10-22'), t('c', '2026-10-22'), t('d', '2026-10-30'), t('e', '2026-10-30'), t('f', '2026-10-30')];
  const alerts = overloadAlerts(list, '2026-10-20');
  assert.deepEqual(alerts.map((a) => a.date), ['2026-10-22']); // Oct 30 is more than a week out
  assert.equal(overloadAlerts(list, '2026-10-23').length, 1); // now Oct 30 is within a week
  // Quizzes and homework don't count.
  assert.equal(overloadAlerts([t('a', '2026-10-22'), t('b', '2026-10-22'), t('q', '2026-10-22', 'quiz')], '2026-10-20').length, 0);
});

test('test warnings when adding', () => {
  const profile = { campus: 'us', grade: 10, classes: [] };
  assert.match(testWarnings([t('a', '2026-10-22')], '2026-10-22', profile)[0], /heavy day/);
  assert.match(testWarnings([t('a', '2026-10-22'), t('b', '2026-10-22')], '2026-10-22', profile)[0], /3 tests/);
  assert.match(testWarnings([], '2026-11-09', profile)[0], /Diwali/);
  // Editing an existing test doesn't count it twice.
  assert.deepEqual(testWarnings([t('a', '2026-10-22')], '2026-10-22', profile, 'a'), []);
});

const FEED = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:assignment-123@bolles.schoology.com',
  'DTSTART;VALUE=DATE:20261022',
  'SUMMARY:Chapter 5 Test',
  'DESCRIPTION:Biology - Hicks\\nStudy sections 5.1-5.4\\, plus the lab',
  '  notes',
  'URL:https://bolles.schoology.com/assignment/123',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:assignment-124@bolles.schoology.com',
  'DTSTART:20261023T035900Z',
  'SUMMARY:Reading Quiz',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

test('parses a Schoology feed', () => {
  const events = parseICS(FEED);
  assert.equal(events.length, 2);
  assert.equal(events[0].summary, 'Chapter 5 Test');
  assert.equal(events[0].description, 'Biology - Hicks\nStudy sections 5.1-5.4, plus the lab notes');
  assert.deepEqual(events[0].dtstart, { date: '2026-10-22', time: null });
  assert.ok(events[1].dtstart.time);

  const classes = [{ id: 'bio', name: 'Biology', teacher: 'Ms. Hicks' }, { id: 'eng', name: 'English', teacher: 'Mr. Dale' }];
  const items = schoologyToAssignments(events, classes);
  assert.equal(items[0].type, 'test');
  assert.equal(items[0].classId, 'bio');
  assert.equal(items[0].url, 'https://bolles.schoology.com/assignment/123');
  assert.equal(items[1].type, 'quiz');
  assert.equal(items[1].classId, null);
});

test('guesses assignment types', () => {
  assert.equal(guessType('Unit 3 Exam'), 'test');
  assert.equal(guessType('Vocab quiz'), 'quiz');
  assert.equal(guessType('Final draft of essay'), 'essay');
  assert.equal(guessType('Science fair project'), 'project');
  assert.equal(guessType('Worksheet 4'), 'homework');
});

test('export round-trips through the parser', () => {
  const ics = buildICS([
    { uid: 'x@test', title: 'Test: Bio; ch. 5, part 2', date: '2026-10-22', start: '13:10', end: '14:10', description: 'line1\nline2' },
    { uid: 'y@test', title: 'B Day', date: '2026-10-20' },
  ]);
  const [a, b] = parseICS(ics);
  assert.equal(a.summary, 'Test: Bio; ch. 5, part 2');
  assert.deepEqual(a.dtstart, { date: '2026-10-22', time: '13:10' });
  assert.equal(a.description, 'line1\nline2');
  assert.deepEqual(b.dtstart, { date: '2026-10-20', time: null });
});
