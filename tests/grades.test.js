import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cleanCourseText, matchClass, sanitize } from '../js/grades.js';
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

test('Bolles section names match by period, and "PE" does not match "Period"', () => {
  const ms = [
    { id: 'geo', period: 1, name: 'Geometry' },
    { id: 'idea', period: 2, name: 'IDEA' },
    { id: 'pe', period: 3, name: 'PE' },
  ];
  assert.equal(matchClass({ title: 'INNOVATIVE DESIGN ENGINEERING APPLICATIONS S1', section: 'MS_Period 2 (361-01)' }, ms)?.id, 'idea');
  assert.equal(matchClass({ title: 'PE 8/Health & Wellness S1', section: 'MS_Period 3 (751-03)' }, ms)?.id, 'pe');
  // Without a period, "pe" inside other words must not match the PE class.
  assert.equal(matchClass({ title: 'Engineering Applications', section: 'Peterson' }, [ms[2]]), null);
  assert.equal(matchClass({ title: 'PE 8', section: '' }, [ms[2]])?.id, 'pe');
});

test('hidden "Course" text is removed from Schoology names', () => {
  const out = sanitize({ courses: [{ title: 'ACCELERATED GEOMETRY 8', section: 'MS_Period 1 (333-01)Course' }, { title: 'Grade 8 Advisory', section: 'Teichert AdvisoryCourse' }] });
  assert.equal(out.courses[0].section, 'MS_Period 1 (333-01)');
  assert.equal(out.courses[1].section, 'Teichert Advisory');
  assert.equal(cleanCourseText('Intro Course'), 'Intro Course');
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
