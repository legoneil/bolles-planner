// App state, persisted to localStorage. Everything a student enters lives
// here so it can later be synced to an account without touching the views.

const KEY = 'bolles-planner:v1';

export const ASSIGNMENT_TYPES = [
  { id: 'homework', label: 'Homework' },
  { id: 'test', label: 'Test' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'project', label: 'Project' },
  { id: 'essay', label: 'Essay' },
  { id: 'lab', label: 'Lab' },
  { id: 'reading', label: 'Reading' },
  { id: 'other', label: 'Other' },
];

export const CLASS_TYPES = ['Regular', 'Honors', 'AP', 'Elective', 'Study Hall'];

export const CLASS_COLORS = [
  '#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626', '#0891b2', '#ca8a04', '#db2777', '#4b5563',
];

export const uid = () =>
  (globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

export const defaultClasses = () =>
  [1, 2, 3, 4, 5, 6, 7].map((period, i) => ({
    id: uid(),
    period,
    name: '',
    teacher: '',
    room: '',
    type: 'Regular',
    color: CLASS_COLORS[i],
    lunch: null,
  }));

const initialState = () => ({
  version: 1,
  profile: null, // { campus: 'us'|'ms', grade, name, classes: [...], closures: { date: reason } }
  assignments: [],
  activities: [], // { id, title, days: [0-6], start, end, from, to, color, notes }
  schoology: { url: '', lastSync: null, lastError: null, overrides: {} },
  settings: { theme: 'auto', proxyUrl: '' },
});

let state = load();
const listeners = new Set();

function load() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return initialState();
    return { ...initialState(), ...JSON.parse(raw) };
  } catch {
    return initialState();
  }
}

function save() {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or blocked (private mode); keep working in memory.
  }
}

export const getState = () => state;

export function update(fn) {
  const draft = structuredClone(state);
  state = fn(draft) ?? draft;
  save();
  for (const l of listeners) l(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function replaceState(next) {
  state = { ...initialState(), ...next };
  save();
  for (const l of listeners) l(state);
}

export const resetState = () => replaceState(initialState());

// Assignments, with Schoology items merged with the student's local edits.
export function allAssignments(s = state) {
  return s.assignments.map((a) => (a.source === 'schoology' ? { ...a, ...s.schoology.overrides[a.id] } : a));
}

export function saveAssignment(a) {
  update((s) => {
    if (a.source === 'schoology') {
      const { classId, type, done, hidden, notes } = a;
      s.schoology.overrides[a.id] = { classId, type, done, hidden, notes };
      return;
    }
    const i = s.assignments.findIndex((x) => x.id === a.id);
    if (i >= 0) s.assignments[i] = a;
    else s.assignments.push({ ...a, id: a.id ?? uid(), source: 'manual', createdAt: Date.now() });
  });
}

export function toggleDone(id) {
  const a = allAssignments().find((x) => x.id === id);
  if (a) saveAssignment({ ...a, done: !a.done });
}

export function deleteAssignment(id) {
  update((s) => {
    const a = s.assignments.find((x) => x.id === id);
    if (a?.source === 'schoology') s.schoology.overrides[id] = { ...s.schoology.overrides[id], hidden: true };
    else s.assignments = s.assignments.filter((x) => x.id !== id);
  });
}

// Replace all Schoology items with a fresh import; local edits survive via overrides.
export function mergeSchoology(items) {
  update((s) => {
    s.assignments = [...s.assignments.filter((a) => a.source !== 'schoology'), ...items];
    s.schoology.lastSync = Date.now();
    s.schoology.lastError = null;
  });
}
