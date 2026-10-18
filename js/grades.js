// Grades arrive from the Bolles Planner Grades browser extension (see
// extension/), which reads the student's own Schoology grades page. They are
// saved in the planner (and so to the student's private account row), and
// never shared with friends.

import { getState, update } from './store.js';

export const extension = { installed: false, version: null, status: null };

const listeners = new Set();
export const onExtensionChange = (fn) => listeners.add(fn);

export function initGrades() {
  window.addEventListener('message', (e) => {
    if (e.source !== window || e.origin !== location.origin) return;
    const msg = e.data;
    if (msg?.source !== 'bolles-planner-extension' || msg.type !== 'grades') return;
    Object.assign(extension, { installed: true, version: msg.version ?? null, status: msg.status ?? null });
    const incoming = msg.grades;
    if (incoming?.courses?.length && (incoming.readAt ?? 0) > (getState().grades?.readAt ?? 0)) {
      update((s) => {
        s.grades = sanitize(incoming);
      });
    }
    listeners.forEach((l) => l(extension));
  });
  // The extension may have spoken before this listener existed; ask again.
  window.postMessage({ source: 'bolles-planner-app', type: 'request-grades' }, location.origin);
}

// Keep only the fields the planner uses, with sane types and sizes.
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : null);
const numOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const grade = (g) => ({
  display: str(g?.display, 40),
  score: numOrNull(g?.score),
  max: numOrNull(g?.max),
  percent: numOrNull(g?.percent),
  letter: str(g?.letter, 3),
  status: str(g?.status, 20),
});

export function sanitize(data) {
  return {
    readAt: numOrNull(data.readAt) ?? Date.now(),
    domain: str(data.domain, 100),
    courses: (data.courses ?? []).slice(0, 20).map((c) => ({
      id: str(String(c.id ?? ''), 60),
      title: str(cleanCourseText(c.title), 120) || 'Course',
      section: str(cleanCourseText(c.section), 120) || null,
      ...grade({ display: c.grade, percent: c.percent, letter: c.letter }),
      periods: (c.periods ?? []).slice(0, 8).map((p) => ({ title: str(p.title, 60), weight: numOrNull(p.weight), ...grade(p) })),
      categories: (c.categories ?? []).slice(0, 40).map((k) => ({
        title: str(k.title, 80),
        period: str(k.period, 60),
        weight: numOrNull(k.weight),
        ...grade(k),
      })),
      items: (c.items ?? []).slice(0, 300).map((i) => ({
        id: str(String(i.id ?? ''), 80),
        title: str(i.title, 200),
        category: str(i.category, 80),
        period: str(i.period, 60),
        due: str(i.due, 40),
        ...grade(i),
      })),
    })),
  };
}

const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 1 && !['and', 'the', 'of', 'section', 'sec'].includes(w)));

// Schoology adds hidden text like "Course" right after section names.
export const cleanCourseText = (s) => (s ?? '').replace(/(?<=\S)Course$/, '').trim();

// Best-matching planner class for a Schoology course, or null. Bolles section
// names include the period ("MS_Period 2"), which is the most reliable match.
export function matchClass(course, classes) {
  const period = /period\s*(\d)\b/i.exec(`${course.section ?? ''} ${course.title}`)?.[1];
  if (period) {
    const byPeriod = (classes ?? []).find((c) => Number(c.period) === Number(period) && c.name);
    if (byPeriod) return byPeriod;
  }
  const title = norm(`${course.title} ${course.section ?? ''}`);
  const tw = words(title);
  let best = null;
  let bestScore = 0;
  for (const c of classes ?? []) {
    const name = norm(c.name);
    if (!name) continue;
    let score = 0;
    // Whole words only: "PE" must not match the "pe" in "Period".
    if (` ${title} `.includes(` ${name} `)) score = 10 + name.length;
    else {
      const cw = words(name);
      const shared = [...cw].filter((w) => tw.has(w)).length;
      if (shared && shared === cw.size) score = 5 + shared;
      else if (shared) score = shared;
    }
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return bestScore >= 2 ? best : null;
}
