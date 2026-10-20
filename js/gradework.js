// What the Schoology gradebook (read by the extension) says about to-dos, and
// the "what do I need?" calculator.
//
// A to-do that's graded in Schoology counts as done; one Schoology marks
// Missing is flagged. Schoology items are matched by their assignment id (the
// calendar links to /assignment/<id>, the gradebook row carries the same id);
// items the student added by hand fall back to the same title in the same class.

import { matchClass } from './grades.js';

const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const schoologyId = (a) => /\/(?:assignment|assessment|discussion)\/(\d+)/.exec(a.url ?? '')?.[1] ?? null;

// 'graded', 'missing', 'excused', or null (not graded yet, incomplete, pending).
export function gradeState(i) {
  const status = (i.status ?? '').toLowerCase();
  if (status === 'missing') return 'missing';
  if (status === 'excused') return 'excused';
  if (status) return null;
  return i.score !== null || i.percent !== null || i.display ? 'graded' : null;
}

// Map: to-do id -> { state, score, max, percent, display }, for to-dos the gradebook has a verdict on.
export function gradeLinks(assignments, grades, classes) {
  const out = new Map();
  if (!grades?.courses?.length) return out;
  const byId = new Map();
  const byTitle = new Map();
  for (const c of grades.courses) {
    const cls = matchClass(c, classes);
    for (const i of c.items ?? []) {
      const state = gradeState(i);
      const link = state ? { state, score: i.score, max: i.max, percent: i.percent, display: i.display } : null;
      if (/^\d+$/.test(i.id ?? '')) byId.set(i.id, link);
      if (!cls || !norm(i.title)) continue;
      const key = `${cls.id}|${norm(i.title)}`;
      // Two items with the same title ("Homework 3") can't be told apart.
      byTitle.set(key, byTitle.has(key) ? null : link);
    }
  }
  for (const a of assignments) {
    const id = schoologyId(a);
    const link = id ? byId.get(id) : a.classId ? byTitle.get(`${a.classId}|${norm(a.title)}`) : null;
    if (link) out.set(a.id, link);
  }
  return out;
}

// ---------------------------------------------------------------------------
// What do I need?

// Schoology shows Bolles grades as letters only (no points or percentages),
// so letters are turned into percentages on the usual scale, and each
// assignment in a category is assumed to count the same. Where a class does
// show points, those are used instead.
const SCALE = [
  ['A+', 97], ['A', 93], ['A-', 90], ['B+', 87], ['B', 83], ['B-', 80], ['C+', 77],
  ['C', 73], ['C-', 70], ['D+', 67], ['D', 63], ['D-', 60], ['F', 0],
];
const band = (letter) => {
  const i = SCALE.findIndex(([l]) => l === letter);
  return i < 0 ? null : { lo: SCALE[i][1], hi: i ? SCALE[i - 1][1] : 100 };
};
export const letterFor = (pct) => SCALE.find(([, lo]) => pct >= lo - 1e-9)[0];
export const letterCutoff = (letter) => band(letter)?.lo ?? null;
export const GOAL_LETTERS = SCALE.slice(0, 9).map(([l]) => l); // A+ down to C-
const letterOf = (g) => [g?.letter, g?.display].find((l) => band(l)) ?? null;
const midpoint = (letter) => {
  const b = band(letter);
  return (b.lo + b.hi) / 2;
};

const round1 = (n) => Math.round(n * 10) / 10;

// The current grading period of a course and how its grade is worked out:
// weighted categories, or one pool. Each category holds earned/possible, in
// real points, or with every letter-graded item out of 100. Null when there's
// nothing to go on.
export function gradeModel(course) {
  const all = course.items ?? [];
  // A Missing item with a 0 counts; excused and ungraded items don't.
  const byPoints = all.filter((i) => i.score !== null && i.max > 0 && gradeState(i) !== 'excused');
  const byLetter = all.filter((i) => gradeState(i) === 'graded' && letterOf(i));
  const mode = byPoints.length && byPoints.length >= byLetter.length ? 'points' : byLetter.length ? 'letters' : null;
  if (!mode) return null;
  const items = mode === 'points' ? byPoints : byLetter;

  // The latest period with grades (periods are listed in order).
  const periods = course.periods ?? [];
  const period = [...periods].reverse().find((p) => items.some((i) => i.period === p.title))?.title ?? null;
  const inPeriod = items.filter((i) => (period ? i.period === period : true));
  const sum = (list) =>
    list.reduce(
      (t, i) => (mode === 'points' ? { earned: t.earned + i.score, possible: t.possible + i.max } : { earned: t.earned + midpoint(letterOf(i)), possible: t.possible + 100 }),
      { earned: 0, possible: 0 },
    );
  // With letters, keep the estimate inside the letter Schoology shows for the whole group.
  const fit = (total, shown) => {
    const b = mode === 'letters' && total.possible && band(letterOf(shown));
    if (!b) return total;
    const pct = Math.min(Math.max((total.earned / total.possible) * 100, b.lo), b.hi - 0.1);
    return { earned: (pct / 100) * total.possible, possible: total.possible };
  };

  const categories = (course.categories ?? [])
    .filter((k) => (period ? k.period === period : true) && k.title)
    .map((k) => ({ title: k.title, weight: k.weight > 0 ? k.weight : null, ...fit(sum(inPeriod.filter((i) => i.category === k.title)), k) }));
  const weighted = categories.length > 0 && categories.every((k) => k.weight !== null);
  const shownPeriod = periods.find((p) => p.title === period) ?? null;
  const total = fit(sum(inPeriod), shownPeriod ?? course);
  const model = { mode, period, weighted, categories, total };

  const percent = gradeAfter(model, null, 0, 0);
  if (!Number.isFinite(percent)) return null;
  const reported = mode === 'points' ? (shownPeriod?.percent ?? course.percent ?? null) : (letterOf(shownPeriod) ?? letterOf(course));
  return {
    ...model,
    percent: round1(percent),
    reported,
    // Points that don't add up to Schoology's number (dropped scores, extra
    // credit), or letters that don't land on Schoology's letter.
    approximate: reported !== null && (mode === 'points' ? Math.abs(reported - percent) > 1 : letterFor(percent) !== reported),
  };
}

// The grade after scoring `score` out of `points` on one more item in `category`.
export function gradeAfter(model, category, score, points) {
  if (!model.weighted) return model.total.possible + points ? ((model.total.earned + score) / (model.total.possible + points)) * 100 : NaN;
  let top = 0;
  let w = 0;
  for (const k of model.categories) {
    const earned = k.earned + (k.title === category ? score : 0);
    const possible = k.possible + (k.title === category ? points : 0);
    if (!possible) continue;
    top += (k.weight * earned) / possible;
    w += k.weight;
  }
  return w ? (top / w) * 100 : NaN;
}

// Score needed on the next item to reach `target` percent. The grade only
// goes up with the score, so solve the straight line through 0 and full marks.
export function scoreNeeded(model, { target, category = null, points = 100 }) {
  const low = gradeAfter(model, category, 0, points);
  const high = gradeAfter(model, category, points, points);
  const EPS = 1e-9; // exactly full marks shouldn't miss by a rounding error
  if (high < target - EPS) return { kind: 'out-of-reach', best: round1(high) };
  if (low >= target - EPS) return { kind: 'safe', worst: round1(low) };
  const score = Math.ceil(((target - low) / (high - low)) * points * 10 - 1e-6) / 10;
  return { kind: 'need', score, percent: round1((score / points) * 100) };
}
