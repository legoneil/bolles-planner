import assert from 'node:assert/strict';
import { test } from 'node:test';

import { gradeLinks, gradeModel, gradeState, scoreNeeded } from '../js/gradework.js';
import { makeContext, overdueWork } from '../js/planner.js';

const classes = [{ id: 'bio', period: 1, name: 'AP Biology' }, { id: 'eng', period: 2, name: 'English 10' }];
const item = (id, title, extra = {}) => ({ id, title, category: null, period: null, due: null, display: null, score: null, max: null, percent: null, letter: null, status: null, ...extra });
const grades = {
  readAt: 1,
  courses: [
    {
      id: '1',
      title: 'AP Biology',
      section: 'Period 1',
      items: [
        item('7001', 'Cell lab', { score: 18, max: 20, display: '18' }),
        item('7002', 'Ch. 5 worksheet', { status: 'Missing', score: 0, max: 10 }),
        item('7003', 'Unit 4 test'), // not graded yet
        item('7004', 'Reading notes', { status: 'Excused' }),
        item('x1', 'Homework 3', { score: 5, max: 5 }),
        item('x2', 'Homework 3', { score: 4, max: 5 }),
      ],
    },
  ],
};
const sgy = (id, title, url, extra = {}) => ({ id, title, type: 'homework', classId: 'bio', dueDate: '2026-10-28', done: false, source: 'schoology', url, ...extra });

test('gradebook states', () => {
  assert.equal(gradeState(item('a', 'a', { score: 9, max: 10 })), 'graded');
  assert.equal(gradeState(item('a', 'a', { display: 'A-' })), 'graded');
  assert.equal(gradeState(item('a', 'a', { status: 'Missing', score: 0 })), 'missing');
  assert.equal(gradeState(item('a', 'a', { status: 'Excused' })), 'excused');
  assert.equal(gradeState(item('a', 'a', { status: 'Pending' })), null);
  assert.equal(gradeState(item('a', 'a')), null);
});

test('to-dos match gradebook items by Schoology id, or by title in the same class', () => {
  const todos = [
    sgy('s1', 'Cell lab', 'https://bolles.schoology.com/assignment/7001'),
    sgy('s2', 'Ch. 5 worksheet', 'https://bolles.schoology.com/assignment/7002'),
    sgy('s3', 'Unit 4 test', 'https://bolles.schoology.com/assignment/7003'),
    sgy('s4', 'Cell lab', 'https://bolles.schoology.com/assignment/9999'), // same title, different id: no match
    { id: 'm1', title: 'cell LAB', classId: 'bio', source: 'manual' },
    { id: 'm2', title: 'Cell lab', classId: 'eng', source: 'manual' }, // other class
    { id: 'm3', title: 'Homework 3', classId: 'bio', source: 'manual' }, // two items share the title
  ];
  const links = gradeLinks(todos, grades, classes);
  assert.equal(links.get('s1').state, 'graded');
  assert.equal(links.get('s1').score, 18);
  assert.equal(links.get('s2').state, 'missing');
  assert.equal(links.has('s3'), false);
  assert.equal(links.has('s4'), false);
  assert.equal(links.get('m1').state, 'graded');
  assert.equal(links.has('m2'), false);
  assert.equal(links.has('m3'), false);
});

test('graded work counts as done unless unticked; missing work stays open and in view', () => {
  const state = (assignments, overrides = {}) => ({ profile: { campus: 'us', grade: 10, classes, closures: {} }, assignments, activities: [], schoology: { overrides }, settings: {}, grades });
  const todos = [
    sgy('s1', 'Cell lab', 'https://bolles.schoology.com/assignment/7001'),
    { ...sgy('s2', 'Ch. 5 worksheet', 'https://bolles.schoology.com/assignment/7002'), dueDate: '2026-10-01' },
  ];
  const now = new Date(2026, 10, 2, 9);
  const ctx = makeContext(state(todos), now);
  const [lab, ws] = ctx.assignments;
  assert.equal(lab.done, true);
  assert.equal(ws.done, false);
  assert.equal(ws.grade.state, 'missing');
  // A month overdue, but missing in Schoology: not folded away with old work.
  assert.deepEqual(overdueWork(ctx).recent.map((a) => a.id), ['s2']);

  const unticked = makeContext(state(todos, { s1: { done: false, keepOpen: true } }), now);
  assert.equal(unticked.assignments[0].done, false);
});

// A weighted class: Tests 60%, Homework 40%, in the second semester.
const weighted = {
  id: '2',
  title: 'Precalculus',
  percent: 82.6,
  periods: [{ title: 'S1', percent: 91 }, { title: 'S2', percent: 82.6 }],
  categories: [
    { title: 'Tests', period: 'S1', weight: 60 },
    { title: 'Homework', period: 'S1', weight: 40 },
    { title: 'Tests', period: 'S2', weight: 60 },
    { title: 'Homework', period: 'S2', weight: 40 },
  ],
  items: [
    item('1', 'Old test', { period: 'S1', category: 'Tests', score: 95, max: 100 }),
    item('2', 'Test 1', { period: 'S2', category: 'Tests', score: 75, max: 100 }),
    item('3', 'HW 1', { period: 'S2', category: 'Homework', score: 47, max: 50 }),
  ],
};

test('the grade model follows the current period and its category weights', () => {
  const m = gradeModel(weighted);
  assert.equal(m.period, 'S2');
  assert.equal(m.weighted, true);
  // 60% × 75% + 40% × 94% = 82.6%
  assert.equal(m.percent, 82.6);
  assert.equal(m.approximate, false);
});

test('score needed on the next test, and the edges', () => {
  const m = gradeModel(weighted);
  // Tests become (75 + x) / 200. 60 × (75 + x) / 200 + 37.6 = 90 → x = 99.67, rounded up.
  assert.deepEqual(scoreNeeded(m, { target: 90, category: 'Tests', points: 100 }), { kind: 'need', score: 99.7, percent: 99.7 });
  assert.deepEqual(scoreNeeded(m, { target: 93, category: 'Tests', points: 100 }), { kind: 'out-of-reach', best: 90.1 });
  // 0.3 × (75 + x) + 37.6 = 70 → x = 33 exactly (not 33.1 from rounding).
  assert.deepEqual(scoreNeeded(m, { target: 70, category: 'Tests', points: 100 }), { kind: 'need', score: 33, percent: 33 });
  assert.deepEqual(scoreNeeded(m, { target: 60, category: 'Tests', points: 100 }), { kind: 'safe', worst: 60.1 });
  // Homework moves the grade less: 40% × (47 + x) / 100 + 45 = 85 → x = 53, more than 50.
  assert.equal(scoreNeeded(m, { target: 85, category: 'Homework', points: 50 }).kind, 'out-of-reach');
});

test('total-points classes, and a warning when Schoology’s number differs', () => {
  const course = { id: '3', title: 'English 10', percent: 80, periods: [], categories: [], items: [item('1', 'Essay', { score: 40, max: 50 }), item('2', 'Quiz', { score: 8, max: 10 })] };
  const m = gradeModel(course);
  assert.equal(m.weighted, false);
  assert.equal(m.percent, 80);
  // (48 + x) / 80 = 0.9 needs x = 24, more than the 20 points available.
  assert.deepEqual(scoreNeeded(m, { target: 90, points: 20 }), { kind: 'out-of-reach', best: 85 });
  assert.deepEqual(scoreNeeded(m, { target: 85, points: 20 }), { kind: 'need', score: 20, percent: 100 });
  assert.equal(gradeModel({ ...course, percent: 88 }).approximate, true);
  assert.equal(gradeModel({ ...course, items: [item('1', 'Ungraded')] }), null);
});

// Bolles: letters only. Tests 60% (B, from a B- test), Homework 40% (A, from an A+).
const lettersOnly = {
  id: '501',
  title: 'Algebra II',
  section: 'US_Period 3',
  letter: 'B+',
  periods: [{ title: 'Semester 1', weight: 50, letter: 'B+', display: 'B+', percent: null }],
  categories: [
    { title: 'Tests', period: 'Semester 1', weight: 60, letter: 'B', display: 'B', percent: null },
    { title: 'Homework', period: 'Semester 1', weight: 40, letter: 'A', display: 'A', percent: null },
  ],
  items: [
    item('7001', 'Unit 2 Test', { category: 'Tests', period: 'Semester 1', display: 'B-', letter: 'B-' }),
    item('7002', 'Unit 3 Test', { category: 'Tests', period: 'Semester 1' }),
    item('7003', 'Problem Set 4', { category: 'Homework', period: 'Semester 1', display: 'A+', letter: 'A+' }),
  ],
};

test('letter grades: estimated inside the letters Schoology shows', async () => {
  const { letterFor } = await import('../js/gradework.js');
  const m = gradeModel(lettersOnly);
  assert.equal(m.mode, 'letters');
  assert.equal(m.period, 'Semester 1');
  // Tests: a B- item, kept inside the category's B (83). Homework: A+ kept inside A (96.9).
  // 0.6 × 83 + 0.4 × 96.9 = 88.56
  assert.equal(m.percent, 88.6);
  assert.equal(letterFor(m.percent), 'B+');
  assert.equal(m.approximate, false);
  // To reach A- (90): 0.3 × (83 + x) + 38.76 = 90 → x = 87.8, a B+.
  const r = scoreNeeded(m, { target: 90, category: 'Tests', points: 100 });
  assert.equal(r.kind, 'need');
  assert.equal(letterFor(r.percent), 'B+');
  assert.equal(scoreNeeded(m, { target: 97, category: 'Tests', points: 100 }).kind, 'out-of-reach');
  // Schoology's letter disagreeing with the estimate is flagged.
  assert.equal(gradeModel({ ...lettersOnly, periods: [{ ...lettersOnly.periods[0], letter: 'C', display: 'C' }] }).approximate, true);
});
