// Runs supabase/schema.sql and supabase/friends.sql in a real Postgres
// (PGlite) and checks the privacy rules as different signed-in students.
// Needs `npm install` (dev dependency @electric-sql/pglite).

import assert from 'node:assert/strict';
import { before, test } from 'node:test';

let createSim;
try {
  ({ createSim } = await import('./support/supabase-sim.js'));
} catch {
  createSim = null;
}

const opts = { skip: createSim ? false : 'run `npm install` to enable database tests' };
let sim, ana, ben, cal;

before(async () => {
  if (!createSim) return;
  sim = await createSim();
  ana = await sim.createUser('ana@example.com');
  ben = await sim.createUser('ben@example.com');
  cal = await sim.createUser('cal@example.com');
});

const schedule = (name) => ({ campus: 'us', grade: 10, classes: [{ period: 1, name, teacher: 'Hicks' }] });
const visibleProfiles = async (uid) => (await sim.query(uid, { table: 'profiles', action: 'select', columns: 'user_id, display_name' })).data;

test('friend codes are 8 readable characters and unique', opts, async () => {
  const a = (await sim.rpc(ana, 'enable_friends', { name: 'Ana' })).data;
  const b = (await sim.rpc(ben, 'enable_friends', { name: 'Ben' })).data;
  const c = (await sim.rpc(cal, 'enable_friends', { name: 'Cal' })).data;
  for (const code of [a, b, c]) assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
  assert.equal(new Set([a, b, c]).size, 3);
  // Renaming keeps the code.
  assert.equal((await sim.rpc(ana, 'enable_friends', { name: 'Ana R.' })).data, a);
  for (const [uid, name] of [[ana, 'Bio A'], [ben, 'Bio B'], [cal, 'Bio C']]) {
    const r = await sim.query(uid, { table: 'profiles', action: 'update', values: { schedule: schedule(name) }, filters: [['eq', 'user_id', uid]] });
    assert.equal(r.error, null);
  }
});

test('strangers cannot see each other, even with direct queries', opts, async () => {
  assert.deepEqual((await visibleProfiles(ana)).map((p) => p.user_id), [ana]);
  const raw = await sim.sqlAs(ana, 'select user_id from public.profiles');
  assert.equal(raw.rows.length, 1);
  // Signed-out visitors see nothing at all.
  await assert.rejects(sim.sqlAs(null, 'select * from public.profiles'));
});

test('students cannot write around the rules', opts, async () => {
  // Can't change someone else's profile (no error, but nothing changes).
  await sim.query(ana, { table: 'profiles', action: 'update', values: { display_name: 'hacked' }, filters: [['eq', 'user_id', ben]] });
  assert.equal((await visibleProfiles(ben)).find((p) => p.user_id === ben).display_name, 'Ben');
  // Can't pick their own friend code or insert profiles/friendships directly.
  await assert.rejects(sim.sqlAs(ana, `update public.profiles set friend_code = 'AAAAAAAA' where user_id = $1`, [ana]));
  await assert.rejects(sim.sqlAs(ana, `insert into public.friendships (requester, addressee, status) values ($1, $2, 'accepted')`, [ana, ben]));
  // Can't accept a request on someone else's behalf.
  await assert.rejects(sim.sqlAs(ana, `update public.friendships set status = 'accepted'`));
});

test('request, accept, then both see each other', opts, async () => {
  const benCode = (await sim.rpc(ben, 'enable_friends', { name: 'Ben' })).data;
  assert.deepEqual((await sim.rpc(ana, 'request_friend', { code: 'nope' })).data, { status: 'not_found' });
  const anaCode = (await sim.rpc(ana, 'enable_friends', { name: 'Ana R.' })).data;
  assert.equal((await sim.rpc(ana, 'request_friend', { code: anaCode })).data.status, 'self');

  // Lowercase and a dash are fine.
  const sent = (await sim.rpc(ana, 'request_friend', { code: `${benCode.slice(0, 4).toLowerCase()}-${benCode.slice(4)}` })).data;
  assert.deepEqual(sent, { status: 'requested', name: 'Ben' });
  assert.equal((await sim.rpc(ana, 'request_friend', { code: benCode })).data.status, 'already');

  // Pending: names only, no schedules either way.
  assert.deepEqual((await visibleProfiles(ana)).map((p) => p.user_id), [ana]);
  const incoming = (await sim.rpc(ben, 'friend_requests')).data;
  assert.deepEqual(incoming.map((r) => [r.display_name, r.direction]), [['Ana R.', 'incoming']]);
  assert.deepEqual(Object.keys(incoming[0]).sort(), ['created_at', 'direction', 'display_name', 'user_id']);
  assert.deepEqual((await sim.rpc(ana, 'friend_requests')).data.map((r) => r.direction), ['outgoing']);
  // Cal sees none of this.
  assert.deepEqual((await sim.rpc(cal, 'friend_requests')).data, []);

  // Only the person asked can accept.
  await sim.rpc(ana, 'respond_friend', { other: ben, accept: true });
  assert.equal((await visibleProfiles(ana)).length, 1);
  await sim.rpc(ben, 'respond_friend', { other: ana, accept: true });

  const anaSees = (await sim.query(ana, { table: 'profiles', action: 'select', columns: 'user_id, schedule' })).data;
  assert.deepEqual(anaSees.map((p) => p.user_id).sort(), [ana, ben].sort());
  assert.equal(anaSees.find((p) => p.user_id === ben).schedule.classes[0].name, 'Bio B');
  assert.equal((await visibleProfiles(ben)).length, 2);
  assert.equal((await visibleProfiles(cal)).length, 1);
});

test('friends never see each other’s planner (assignments)', opts, async () => {
  const r = await sim.query(ben, { table: 'planners', action: 'upsert', values: { user_id: ben, data: { assignments: [{ title: 'secret' }] } } });
  assert.equal(r.error, null);
  assert.deepEqual((await sim.query(ana, { table: 'planners', action: 'select', columns: 'user_id' })).data, []);
  // Signed-out visitors get no rows either (planners relies on row-level security).
  assert.equal((await sim.sqlAs(null, 'select * from public.planners')).rows.length, 0);
  assert.equal((await sim.query(ben, { table: 'planners', action: 'select', columns: 'user_id' })).data.length, 1);
});

test('asking someone who already asked you accepts it', opts, async () => {
  const calCode = (await sim.rpc(cal, 'enable_friends', { name: 'Cal' })).data;
  const benCode = (await sim.rpc(ben, 'enable_friends', { name: 'Ben' })).data;
  await sim.rpc(ben, 'request_friend', { code: calCode });
  assert.deepEqual((await sim.rpc(cal, 'request_friend', { code: benCode })).data, { status: 'accepted', name: 'Ben' });
  assert.equal((await visibleProfiles(cal)).length, 2);
});

test('declining, unfriending and leaving', opts, async () => {
  const anaCode = (await sim.rpc(ana, 'enable_friends', { name: 'Ana R.' })).data;
  await sim.rpc(cal, 'request_friend', { code: anaCode });
  await sim.rpc(ana, 'respond_friend', { other: cal, accept: false });
  assert.deepEqual((await sim.rpc(cal, 'friend_requests')).data, []);

  await sim.rpc(ben, 'remove_friend', { other: ana });
  assert.equal((await visibleProfiles(ana)).length, 1);
  assert.ok((await visibleProfiles(ben)).every((p) => p.user_id !== ana));

  await sim.rpc(cal, 'leave_friends');
  assert.ok((await visibleProfiles(ben)).every((p) => p.user_id !== cal));
  assert.deepEqual((await sim.rpc(cal, 'request_friend', { code: anaCode })).data, { status: 'no_profile' });
});

test('signed-out callers cannot use the friend functions', opts, async () => {
  const r = await sim.rpc(null, 'enable_friends', { name: 'x' });
  assert.ok(r.error);
});
