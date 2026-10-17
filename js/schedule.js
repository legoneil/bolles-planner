// Turns the school calendar plus a student's classes into a concrete day:
// letter day, status, and the ordered list of blocks with the student's
// classes filled in.

import { CAMPUSES, ROTATION, SCHOOL_YEAR, US_LUNCH_TEACHERS } from './data/bolles-2026-27.js';
import { addDays, isWeekend, minutes, weekday } from './dates.js';

export const PERIODS = [1, 2, 3, 4, 5, 6, 7];

const inRange = (date, ev) => date >= ev.date && date <= (ev.end ?? ev.date);
const forGrade = (item, grade) => !item.grades || !grade || item.grades.includes(Number(grade));

export function eventsOn(date, profile) {
  const campus = CAMPUSES[profile.campus];
  if (!campus) return [];
  return campus.events.filter((ev) => inRange(date, ev) && forGrade(ev, profile.grade));
}

// Status is one of: class, special, exam, closed, noclasses, weekend, summer
export function getDay(date, profile) {
  const campus = CAMPUSES[profile.campus];
  const wd = weekday(date);
  const events = eventsOn(date, profile);
  const closure = profile.closures?.[date];
  const base = { date, weekday: wd, letter: null, events, blocks: [], name: null, note: null, lateStart: false };

  if (!campus) return { ...base, status: 'summer' };

  if (closure !== undefined) {
    return {
      ...base,
      status: 'closed',
      name: closure || 'School closed',
      note: 'Marked closed by you. Classes for this letter day are skipped.',
    };
  }

  const letter = campus.letters[date] ?? null;
  const special = campus.special[date];

  if (letter) {
    let blocks;
    let lateStart = false;
    if (special) blocks = special.blocks;
    else if (wd === 3) {
      blocks = campus.lateStartBlocks(date, wd);
      lateStart = true;
    } else blocks = campus.regularBlocks(date, wd);
    return {
      ...base,
      status: special && !special.minor ? 'special' : 'class',
      letter,
      lateStart,
      name: special?.name ?? (lateStart ? 'Late Start Wednesday' : null),
      note: special?.note ?? null,
      blocks: resolveBlocks(blocks, letter, profile),
    };
  }

  if (special) {
    return {
      ...base,
      status: special.exam ? 'exam' : 'special',
      name: special.name,
      note: special.note ?? null,
      blocks: resolveBlocks(special.blocks, null, profile),
    };
  }

  const closedEv = events.find((e) => e.kind === 'closed');
  if (closedEv) return { ...base, status: 'closed', name: closedEv.title };
  const noClassEv = events.find((e) => e.kind === 'noclasses' || e.kind === 'exam');
  if (noClassEv) return { ...base, status: noClassEv.kind === 'exam' ? 'exam' : 'noclasses', name: noClassEv.title };
  if (isWeekend(date)) return { ...base, status: 'weekend' };
  if (date < SCHOOL_YEAR.firstDay || date > SCHOOL_YEAR.lastDay) return { ...base, status: 'summer', name: 'No school' };
  return { ...base, status: 'noclasses', name: 'No classes' };
}

export function classForPeriod(profile, period) {
  return profile.classes?.find((c) => Number(c.period) === Number(period)) ?? null;
}

function resolveBlocks(blocks, letter, profile) {
  const out = [];
  for (const b of blocks) {
    if (!forGrade(b, profile.grade)) continue;
    const period = b.period ?? (b.slot && letter ? ROTATION[letter][b.slot - 1] : null);
    if (!period) {
      out.push({ ...b, isClass: false });
      continue;
    }
    const cls = classForPeriod(profile, period);
    const classBlock = { period, classId: cls?.id ?? null, cls, isClass: true, kind: 'class' };
    if (b.lunchSplit) {
      const order = lunchOrder(cls);
      if (order) {
        const split = b.lunchSplit[order];
        const cb = { ...classBlock, start: split.class[0], end: split.class[1] };
        const lb = { label: 'Lunch', kind: 'lunch', start: split.lunch[0], end: split.lunch[1], isClass: false };
        out.push(...(order === 'lunchFirst' ? [lb, cb] : [cb, lb]));
      } else {
        out.push({
          ...classBlock,
          start: b.start,
          end: b.end,
          lunchUnknown: true,
          note: 'Includes lunch. Set this class’s lunch order in Settings to see exact times.',
        });
      }
      continue;
    }
    out.push({ ...classBlock, start: b.start, end: b.end });
  }
  return out;
}

// 'lunchFirst' | 'classFirst' | null
export function lunchOrder(cls) {
  if (!cls) return null;
  if (cls.lunch === 'first') return 'lunchFirst';
  if (cls.lunch === 'second') return 'classFirst';
  return null;
}

// Suggest a lunch order from the teacher's name using the planner's lists.
// Returns 'first' | 'second' | null (unknown or ambiguous).
export function suggestLunch(teacher) {
  const name = normalize(teacher);
  if (!name) return null;
  const words = ` ${name} `;
  const matches = (list) =>
    list.filter((entry) => {
      // Entries look like "Hicks", "Stam, A" or "Bruns - Precalculus".
      const [last, rest] = entry.split(/\s+-\s+|,\s*/).map(normalize);
      if (!words.includes(` ${last} `)) return false;
      if (rest && rest.length === 1) return name.split(' ').some((p) => p !== last && p.startsWith(rest));
      return true;
    });
  const first = matches(US_LUNCH_TEACHERS.lunchFirst);
  const second = matches(US_LUNCH_TEACHERS.classFirst);
  if (first.length && !second.length) return 'first';
  if (second.length && !first.length) return 'second';
  return null;
}

const normalize = (s) =>
  (s ?? '')
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|dr|coach|mx)\.?\s+/g, '')
    .replace(/[^a-z' ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Every time a class meets on a date (usually 0 or 1).
export function meetingsOn(date, profile, classId) {
  return getDay(date, profile).blocks.filter((b) => b.isClass && b.classId === classId);
}

// Next date on or after `from` when the class meets.
export function nextMeeting(profile, classId, from, { inclusive = true, limit = 120 } = {}) {
  for (let i = inclusive ? 0 : 1; i <= limit; i++) {
    const date = addDays(from, i);
    const [block] = meetingsOn(date, profile, classId);
    if (block) return { date, block };
  }
  return null;
}

// The block happening at `time` and the next class block after it.
export function nowAndNext(day, time) {
  const t = minutes(time);
  const current = day.blocks.find((b) => b.end && minutes(b.start) <= t && t < minutes(b.end)) ?? null;
  const next = day.blocks.find((b) => b.isClass && minutes(b.start) > t) ?? null;
  return { current, next };
}

export function letterDaysBetween(profile, from, to) {
  const campus = CAMPUSES[profile.campus];
  if (!campus) return [];
  return Object.keys(campus.letters).filter((d) => d >= from && d <= to);
}
