// App state, persisted to localStorage. Every local change is stamped so it
// can be merged with the copy saved to the student's account (see sync-merge.js).

import { ensureSyncFields, stampChanges } from './sync-merge.js';

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
  ownerId: null, // account this device's data belongs to, if signed in
  stamps: {},
  tombstones: { assignments: {}, activities: {} },
});

export const freshState = initialState;

let state = load();
const listeners = new Set();
const localListeners = new Set();

function load() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return initialState();
    return ensureSyncFields({ ...initialState(), ...JSON.parse(raw) });
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

function commit(next, { local }) {
  state = next;
  save();
  for (const l of listeners) l(state);
  if (local) for (const l of localListeners) l(state);
}

// A change made on this device.
export function update(fn) {
  const draft = structuredClone(state);
  const next = fn(draft) ?? draft;
  commit(stampChanges(state, next), { local: true });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Called after local changes that should be saved to the account.
export function onLocalChange(fn) {
  localListeners.add(fn);
  return () => localListeners.delete(fn);
}

// Restoring a backup counts as a local change.
export function replaceState(next) {
  commit(stampChanges(state, ensureSyncFields({ ...initialState(), ...next, ownerId: state.ownerId })), { local: true });
}

// Data that came from the account: no new stamps, and no push back.
export function applySynced(next) {
  commit(ensureSyncFields({ ...initialState(), ...next }), { local: false });
}

// Wipe this device without touching the account (signing out, starting over).
export const resetState = () => commit(initialState(), { local: false });

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
