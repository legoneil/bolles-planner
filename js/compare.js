// Comparing your schedule with a friend's: classes you share, when you're
// at lunch or free at the same time, and where they are right now.

import { ROTATION } from './data/bolles-2026-27.js';
import { minutes } from './dates.js';
import { getDay, nowAndNext } from './schedule.js';

// What a student shares with friends: no colors, ids or anything personal.
export function sharedSchedule(profile) {
  if (!profile) return null;
  return {
    campus: profile.campus,
    grade: profile.grade,
    classes: (profile.classes ?? [])
      .filter((c) => c.name)
      .map(({ period, name, teacher, room, type, lunch }) => ({ period, name, teacher, room, type, lunch: lunch ?? null }))
      .sort((a, b) => a.period - b.period),
  };
}

// Turn a friend's shared schedule into a profile getDay() understands.
export function friendProfile(shared) {
  return {
    campus: shared?.campus,
    grade: shared?.grade,
    classes: (shared?.classes ?? []).map((c) => ({ ...c, id: `p${c.period}` })),
    closures: {},
  };
}

const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const lastName = (t) =>
  norm(
    (t ?? '')
      .replace(/^(mr|mrs|ms|dr|mx|coach|sra|sr|mme)(\.\s*|\s+)/i, '')
      .trim()
      .split(/\s+/)
      .pop(),
  );

// Same section = same period and the same teacher. Different teachers are
// different sections even when the class name matches; the name is only
// used when one of you hasn't filled in a teacher.
export function sameSection(a, b) {
  if (!a || !b || Number(a.period) !== Number(b.period)) return false;
  const ta = lastName(a.teacher);
  const tb = lastName(b.teacher);
  if (ta && tb) return ta === tb;
  return Boolean(norm(a.name)) && norm(a.name) === norm(b.name);
}

const LETTERS = Object.keys(ROTATION);
const lettersFor = (period) => LETTERS.filter((L) => ROTATION[L].includes(Number(period)));

// Classes you take together, with the letter days they meet.
export function classesTogether(myProfile, shared) {
  if (!shared || myProfile.campus !== shared.campus) return [];
  return (myProfile.classes ?? [])
    .map((mine) => ({ mine, theirs: shared.classes?.find((t) => sameSection(mine, t)) }))
    .filter((x) => x.theirs)
    .map(({ mine, theirs }) => ({ period: Number(mine.period), mine, theirs, letters: lettersFor(mine.period) }))
    .sort((a, b) => a.period - b.period);
}

const overlaps = (as, bs) => {
  const out = [];
  for (const a of as)
    for (const b of bs) {
      const start = Math.max(minutes(a.start), minutes(b.start));
      const end = Math.min(minutes(a.end), minutes(b.end));
      if (end - start >= 10) out.push({ start: hhmm(start), end: hhmm(end), mine: a, theirs: b });
    }
  return out;
};
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// Free periods, counting study hall as free time.
const isFree = (b) => b.isClass && (!b.cls || b.cls.type === 'Study Hall' || /\bstudy hall\b|\bfree\b/i.test(b.cls.name ?? ''));
const isLunch = (b) => b.kind === 'lunch';
const timed = (b) => b.start && b.end;

export function compareDay(date, myProfile, shared) {
  const me = getDay(date, myProfile);
  const them = getDay(date, friendProfile(shared));
  const sameCampus = myProfile.campus === shared?.campus;
  const together = sameCampus
    ? me.blocks.filter((b) => b.isClass && b.cls && them.blocks.some((t) => t.isClass && t.cls && sameSection(b.cls, t.cls)))
    : [];
  const mine = me.blocks.filter(timed);
  const theirs = them.blocks.filter(timed);
  return {
    me,
    them,
    sameCampus,
    together,
    lunch: overlaps(mine.filter(isLunch), theirs.filter(isLunch)),
    free: overlaps(mine.filter(isFree), theirs.filter(isFree)),
  };
}

// One line about where a friend is at `time` on `date`.
export function friendNow(shared, date, time) {
  const day = getDay(date, friendProfile(shared));
  if (!day.blocks.length) return { text: day.name || (day.status === 'weekend' ? 'Weekend' : 'No school'), inSchool: false };
  const { current, next } = nowAndNext(day, time);
  const first = day.blocks.find(timed);
  const last = [...day.blocks].reverse().find(timed);
  if (current?.isClass) {
    const where = current.cls ? `P${current.period} ${current.cls.name}${current.cls.room ? ` · Room ${current.cls.room}` : ''}` : `Free (P${current.period})`;
    return { text: where, inSchool: true };
  }
  if (current) return { text: current.label, inSchool: true };
  if (first && minutes(time) < minutes(first.start)) return { text: `${day.letter ? `${day.letter} day · ` : ''}school starts soon`, inSchool: false };
  if (last && minutes(time) >= minutes(last.end)) return { text: 'After school', inSchool: false };
  if (next) return { text: `Between classes · next P${next.period}`, inSchool: true };
  return { text: day.name || 'At school', inSchool: true };
}
