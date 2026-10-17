import assert from 'node:assert/strict';
import { test } from 'node:test';

import { matchClass, sanitize } from '../js/grades.js';
import { sharedSchedule } from '../js/compare.js';

const classes = [
  { id: 'bio', period: 1, name: 'AP Biology' },
  { id: 'eng', period: 2, name: 'English 10' },
  { id: 'calc', period: 3, name: 'Precalculus Honors' },
  { id: 'chem', period: 7, name: 'Chemistry' },
];

test('Schoology course titles match planner classes', () => {
  assert.equal(matchClass({ title: 'AP Biology', section: 'Section 3' }, classes)?.id, 'bio');
  assert.equal(matchClass({ title: 'English 10 Honors', section: 'Dale' }, classes)?.id, 'eng');
  assert.equal(matchClass({ title: 'Honors Precalculus', section: 'P3' }, classes)?.id, 'calc');
  assert.equal(matchClass({ title: 'Chemistry', section: '7' }, classes)?.id, 'chem');
  assert.equal(matchClass({ title: 'Upper School Advisory', section: '' }, classes), null);
});

test('sanitize keeps only expected fields and limits sizes', () => {
  const out = sanitize({
    readAt: 5,
    domain: 'bolles.schoology.com',
    evil: '<script>',
    courses: [{ id: 1, title: 'x'.repeat(500), grade: '94%', percent: 94, periods: [{ title: 'Q1', display: 'A', extra: 1 }], items: [{ id: 2, title: 'Lab', score: 18, max: 20, html: '<b>' }] }],
  });
  assert.equal(out.evil, undefined);
  assert.equal(out.courses[0].title.length, 120);
  assert.equal(out.courses[0].percent, 94);
  assert.equal(out.courses[0].items[0].html, undefined);
  assert.equal(out.courses[0].items[0].max, 20);
});

test('grades are never part of what friends see', () => {
  const s = sharedSchedule({ campus: 'us', grade: 10, classes, grades: { secret: 1 } });
  assert.equal(JSON.stringify(s).includes('secret'), false);
});
