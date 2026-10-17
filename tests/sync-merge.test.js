import assert from 'node:assert/strict';
import { test } from 'node:test';

import { mergeStates, stampChanges } from '../js/sync-merge.js';

const base = () => ({
  profile: { campus: 'us', grade: 10, classes: [] },
  settings: { theme: 'auto', proxyUrl: '' },
  schoology: { url: '', lastSync: null, lastError: null, overrides: {} },
  assignments: [],
  activities: [],
  stamps: {},
  tombstones: { assignments: {}, activities: {} },
});

// Apply an edit the way store.update() does.
const edit = (prev, fn, now) => {
  const next = structuredClone(prev);
  fn(next);
  return stampChanges(prev, next, now);
};

test('stamps new and changed items, keeps unchanged stamps, remembers deletions', () => {
  let s = edit(base(), (d) => d.assignments.push({ id: 'a', title: 'HW' }, { id: 'b', title: 'Test' }), 100);
  assert.deepEqual(s.assignments.map((a) => a.updatedAt), [100, 100]);
  s = edit(s, (d) => (d.assignments[0].title = 'HW 2'), 200);
  assert.deepEqual(s.assignments.map((a) => a.updatedAt), [200, 100]);
  s = edit(s, (d) => d.assignments.splice(1, 1), 300);
  assert.equal(s.tombstones.assignments.b, 300);
  s = edit(s, (d) => (d.profile.grade = 11), 400);
  assert.equal(s.stamps.profile, 400);
  assert.equal(s.stamps.settings, undefined);
});

test('a re-imported Schoology item with the same content keeps its stamp', () => {
  const s1 = edit(base(), (d) => d.assignments.push({ id: 'sgy:1', title: 'Quiz', source: 'schoology' }), 100);
  const s2 = edit(s1, (d) => (d.assignments = [{ id: 'sgy:1', title: 'Quiz', source: 'schoology' }]), 500);
  assert.equal(s2.assignments[0].updatedAt, 100);
});

test('edits on two devices both survive a merge', () => {
  const start = edit(base(), (d) => d.assignments.push({ id: 'a', title: 'HW' }, { id: 'b', title: 'Lab' }), 100);
  const phone = edit(start, (d) => {
    d.assignments.find((a) => a.id === 'a').done = true;
    d.assignments.push({ id: 'c', title: 'Added on phone' });
  }, 200);
  const laptop = edit(start, (d) => {
    d.assignments = d.assignments.filter((a) => a.id !== 'b');
    d.activities.push({ id: 'x', title: 'Soccer' });
    d.profile.grade = 11;
  }, 300);

  for (const merged of [mergeStates(phone, laptop), mergeStates(laptop, phone)]) {
    const byId = Object.fromEntries(merged.assignments.map((a) => [a.id, a]));
    assert.equal(byId.a.done, true);
    assert.ok(byId.c);
    assert.equal(byId.b, undefined, 'deleted on laptop stays deleted');
    assert.equal(merged.activities.length, 1);
    assert.equal(merged.profile.grade, 11);
  }
});

test('newest edit to the same item wins', () => {
  const start = edit(base(), (d) => d.assignments.push({ id: 'a', title: 'HW' }), 100);
  const older = edit(start, (d) => (d.assignments[0].title = 'older'), 200);
  const newer = edit(start, (d) => (d.assignments[0].title = 'newer'), 300);
  assert.equal(mergeStates(older, newer).assignments[0].title, 'newer');
  assert.equal(mergeStates(newer, older).assignments[0].title, 'newer');
});

test('an item edited after it was deleted elsewhere comes back', () => {
  const start = edit(base(), (d) => d.assignments.push({ id: 'a', title: 'HW' }), 100);
  const deleted = edit(start, (d) => (d.assignments = []), 200);
  const edited = edit(start, (d) => (d.assignments[0].title = 'still need this'), 300);
  assert.equal(mergeStates(deleted, edited).assignments[0].title, 'still need this');
});

test('first sign-in: local planner merges into an empty account and vice versa', () => {
  const local = edit(base(), (d) => d.assignments.push({ id: 'a', title: 'HW' }), 100);
  assert.deepEqual(mergeStates(local, null), local);
  const fresh = { ...base(), profile: null };
  const merged = mergeStates(fresh, local);
  assert.equal(merged.profile.grade, 10, 'account profile wins over an unstamped empty device');
  assert.equal(merged.assignments.length, 1);
});

test('Schoology overrides merge per item', () => {
  const start = edit(base(), () => {}, 100);
  const a = edit(start, (d) => (d.schoology.overrides['sgy:1'] = { done: true }), 200);
  const b = edit(start, (d) => (d.schoology.overrides['sgy:2'] = { classId: 'bio' }), 300);
  const merged = mergeStates(a, b);
  assert.equal(merged.schoology.overrides['sgy:1'].done, true);
  assert.equal(merged.schoology.overrides['sgy:2'].classId, 'bio');
});
