// supabase/grades.sql in a real Postgres (PGlite): the extension's link key
// can only save grades for its own student. Needs `npm install`.

import assert from 'node:assert/strict';
import { before, test } from 'node:test';

let createSim;
try {
  ({ createSim } = await import('./support/supabase-sim.js'));
} catch {
  createSim = null;
}
const opts = { skip: createSim ? false : 'run `npm install` to enable database tests' };
let sim, ana, ben;

before(async () => {
  if (!createSim) return;
  sim = await createSim();
  ana = await sim.createUser('ana@example.com');
  ben = await sim.createUser('ben@example.com');
});

const reading = (letter, readAt = Date.now()) => ({ readAt, domain: 'bolles.schoology.com', courses: [{ id: '1', title: 'AP Biology', grade: letter, letter, periods: [], items: [] }] });
const gradesOf = async (uid) => (await sim.query(uid, { table: 'grades', action: 'select', columns: 'user_id, data' })).data;

test('a link key saves grades to its own student only, without signing in', opts, async () => {
  assert.ok((await sim.rpc(null, 'link_grades_extension')).error, 'must be signed in to make a key');
  const token = (await sim.rpc(ana, 'link_grades_extension')).data;
  assert.match(token, /^[0-9a-f]{64}$/);

  assert.deepEqual(await sim.rpc(null, 'submit_grades', { token, grades: JSON.stringify(reading('A-')) }), { data: 'saved', error: null });
  const mine = await gradesOf(ana);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].data.courses[0].letter, 'A-');
  assert.equal((await gradesOf(ben)).length, 0, 'Ben cannot see Ana’s grades');
  assert.equal(((await gradesOf(null)) ?? []).length, 0, 'signed out sees nothing');
});

test('wrong keys, bad data and older readings are refused', opts, async () => {
  assert.equal((await sim.rpc(null, 'submit_grades', { token: 'f'.repeat(64), grades: JSON.stringify(reading('F')) })).error?.code, '28000');
  const token = (await sim.rpc(ana, 'link_grades_extension')).data;
  for (const bad of [{ courses: 'nope', readAt: 1 }, { courses: [] }, { readAt: 1, courses: Array.from({ length: 21 }, () => ({})) }]) {
    assert.ok((await sim.rpc(null, 'submit_grades', { token, grades: JSON.stringify(bad) })).error, JSON.stringify(bad).slice(0, 40));
  }
  await sim.rpc(null, 'submit_grades', { token, grades: JSON.stringify(reading('B+', Date.now() - 3600_000)) });
  assert.equal((await gradesOf(ana))[0].data.courses[0].letter, 'A-', 'an older reading does not replace a newer one');
});

test('students cannot write grades or read link keys directly', opts, async () => {
  const direct = await sim.query(ben, { table: 'grades', action: 'upsert', values: { user_id: ben, data: reading('A'), read_at: new Date().toISOString() } });
  assert.ok(direct.error);
  assert.ok((await sim.query(ana, { table: 'grade_links', action: 'select' })).error);
});

test('only the 5 newest links work, and clearing removes links and grades', opts, async () => {
  const tokens = [];
  for (let i = 0; i < 6; i++) tokens.push((await sim.rpc(ben, 'link_grades_extension')).data);
  assert.ok((await sim.rpc(null, 'submit_grades', { token: tokens[0], grades: JSON.stringify(reading('C')) })).error, 'oldest link dropped');
  assert.equal((await sim.rpc(null, 'submit_grades', { token: tokens[5], grades: JSON.stringify(reading('B')) })).error, null);

  await sim.rpc(ben, 'clear_synced_grades');
  assert.equal((await gradesOf(ben)).length, 0);
  assert.ok((await sim.rpc(null, 'submit_grades', { token: tokens[5], grades: JSON.stringify(reading('B')) })).error, 'link revoked');
  assert.equal((await gradesOf(ana)).length, 1, 'Ana is untouched');
});
