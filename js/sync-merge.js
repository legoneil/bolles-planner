// Merging planner data between devices.
//
// Every local change is stamped (stampChanges) so two copies of the planner
// can be merged without losing edits: assignments and activities merge per
// item (newest edit wins, deletions are remembered as tombstones), and the
// profile, settings and Schoology link merge as whole sections.

const COLLECTIONS = ['assignments', 'activities'];
const SECTIONS = ['profile', 'settings', 'grades'];

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const strip = ({ updatedAt, ...rest }) => rest;
const schoologyMeta = ({ overrides, ...rest } = {}) => rest;

export function ensureSyncFields(s) {
  s.stamps ??= {};
  s.tombstones ??= {};
  for (const c of COLLECTIONS) s.tombstones[c] ??= {};
  return s;
}

// Mutates `next` to record what changed since `prev`.
export function stampChanges(prev, next, now = Date.now()) {
  ensureSyncFields(next);
  for (const key of SECTIONS) if (!same(prev[key], next[key])) next.stamps[key] = now;
  if (!same(schoologyMeta(prev.schoology), schoologyMeta(next.schoology))) next.stamps.schoology = now;

  for (const coll of COLLECTIONS) {
    const before = new Map((prev[coll] ?? []).map((r) => [r.id, r]));
    const ids = new Set();
    for (const r of next[coll] ?? []) {
      ids.add(r.id);
      const p = before.get(r.id);
      if (p && same(strip(p), strip(r))) r.updatedAt = p.updatedAt;
      else r.updatedAt = now;
    }
    for (const id of before.keys()) if (!ids.has(id)) next.tombstones[coll][id] = now;
  }

  const prevOv = prev.schoology?.overrides ?? {};
  for (const [id, ov] of Object.entries(next.schoology?.overrides ?? {})) {
    if (!prevOv[id] || !same(strip(prevOv[id]), strip(ov))) ov.updatedAt = now;
    else ov.updatedAt = prevOv[id].updatedAt;
  }
  return next;
}

const newer = (a, b) => ((b?.updatedAt ?? 0) > (a?.updatedAt ?? 0) ? b : a);

// Combine two planner states. `local` wins ties.
export function mergeStates(local, remote) {
  if (!remote) return local;
  if (!local) return remote;
  const out = ensureSyncFields(structuredClone(local));
  const r = ensureSyncFields(structuredClone(remote));
  const stamp = (s, k) => s.stamps[k] ?? 0;

  // On a tie (e.g. data saved before stamping existed) never let an empty
  // section replace a filled one.
  const remoteWins = (k, a, b) => stamp(r, k) > stamp(out, k) || (stamp(r, k) === stamp(out, k) && a == null && b != null);
  for (const key of SECTIONS) {
    if (remoteWins(key, out[key], r[key])) {
      out[key] = r[key];
      out.stamps[key] = r.stamps[key];
    }
  }

  const overrides = { ...(out.schoology?.overrides ?? {}) };
  for (const [id, ov] of Object.entries(r.schoology?.overrides ?? {})) overrides[id] = newer(overrides[id], ov);
  if (remoteWins('schoology', out.schoology?.url || null, r.schoology?.url || null)) {
    out.schoology = r.schoology;
    out.stamps.schoology = r.stamps.schoology;
  }
  out.schoology = { ...out.schoology, overrides };

  for (const coll of COLLECTIONS) {
    const tomb = { ...out.tombstones[coll] };
    for (const [id, t] of Object.entries(r.tombstones[coll])) tomb[id] = Math.max(tomb[id] ?? 0, t);
    const byId = new Map();
    for (const rec of [...(out[coll] ?? []), ...(r[coll] ?? [])]) byId.set(rec.id, newer(byId.get(rec.id), rec));
    out[coll] = [...byId.values()].filter((rec) => (rec.updatedAt ?? 0) > (tomb[rec.id] ?? -1));
    out.tombstones[coll] = tomb;
  }
  return out;
}
