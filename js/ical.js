// Minimal iCalendar (RFC 5545) reading and writing: enough to import a
// Schoology calendar feed and export the planner to Google/Apple Calendar.

import { toISO } from './dates.js';

const unescapeText = (s) =>
  s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

const escapeText = (s) =>
  String(s ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

export function parseICS(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') {
      if (cur) events.push(cur);
      cur = null;
    } else if (cur) {
      const idx = line.indexOf(':');
      if (idx < 0) continue;
      const [name, ...params] = line.slice(0, idx).split(';');
      const value = line.slice(idx + 1);
      const key = name.toUpperCase();
      const paramMap = Object.fromEntries(params.map((p) => p.split('=')).map(([k, v]) => [k.toUpperCase(), v]));
      if (key === 'DTSTART' || key === 'DTEND') cur[key.toLowerCase()] = parseDateValue(value, paramMap);
      else if (['SUMMARY', 'DESCRIPTION', 'LOCATION', 'URL', 'UID', 'CATEGORIES'].includes(key))
        cur[key.toLowerCase()] = unescapeText(value);
    }
  }
  return events;
}

// Returns { date: 'YYYY-MM-DD', time: 'HH:MM' | null }.
export function parseDateValue(value, params = {}) {
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (!h || params.VALUE === 'DATE') return { date: `${y}-${mo}-${d}`, time: null };
  if (z) {
    const local = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi));
    const hh = String(local.getHours()).padStart(2, '0');
    const mm = String(local.getMinutes()).padStart(2, '0');
    return { date: toISO(local), time: `${hh}:${mm}` };
  }
  return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
}

const TYPE_PATTERNS = [
  ['homework', /\b(corrections?|retakes?)\b/i],
  ['quiz', /\bquiz(zes)?\b/i],
  ['test', /\b(tests?|exams?|midterms?|final exams?|assessments?|summatives?)\b/i],
  ['project', /\b(projects?|presentations?)\b/i],
  ['essay', /\b(essays?|papers?|drafts?|writing)\b/i],
  ['lab', /\b(labs?|laboratory)\b/i],
  ['reading', /\b(read|reading|chapters?)\b/i],
  ['homework', /\b(homework|hw|worksheets?|problems?|problem sets?|assignments?|due)\b/i],
];

// The type a title clearly names, or null.
export const matchType = (title) => TYPE_PATTERNS.find(([, re]) => re.test(title))?.[0] ?? null;
export const guessType = (title) => matchType(title) ?? 'homework';

// Best-effort match of a Schoology item to one of the student's classes.
export function guessClass(event, classes) {
  const hay = `${event.summary ?? ''} ${event.description ?? ''} ${event.location ?? ''} ${event.categories ?? ''}`.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const c of classes) {
    let score = 0;
    const name = (c.name ?? '').toLowerCase().trim();
    if (name.length >= 3 && hay.includes(name)) score += 3;
    const teacherLast = (c.teacher ?? '').toLowerCase().replace(/^(mr|mrs|ms|dr)\.?\s+/, '').split(/\s+/).pop();
    if (teacherLast && teacherLast.length >= 3 && hay.includes(teacherLast)) score += 2;
    if (score > bestScore) {
      best = c;
      bestScore = score;
    }
  }
  return best?.id ?? null;
}

// Convert parsed feed events into planner assignments.
// Calendar events (not assignments) link to /event/ in Schoology. Most are
// announcements (spirit days, club meetings); keep only the ones that name
// work, like "Unit 4 Test".
const isEvent = (e) => /\/event\//.test(e.url ?? extractUrl(e.description) ?? '');
// The same test for items imported before announcements were left out.
export const isAnnouncement = (a) => a.source === 'schoology' && /\/event\//.test(a.url ?? '') && !matchType(a.title);

export function schoologyToAssignments(events, classes) {
  return events
    .filter((e) => e.summary && e.dtstart?.date)
    .filter((e) => !isEvent(e) || matchType(e.summary))
    .map((e) => ({
      id: `sgy:${e.uid ?? `${e.summary}|${e.dtstart.date}`}`,
      uid: e.uid ?? null,
      source: 'schoology',
      title: e.summary.trim(),
      notes: (e.description ?? '').trim(),
      url: e.url ?? extractUrl(e.description),
      type: guessType(e.summary),
      classId: guessClass(e, classes),
      dueDate: e.dtstart.date,
      dueTime: e.dtstart.time,
      done: false,
    }));
}

const extractUrl = (s) => s?.match(/https?:\/\/\S+/)?.[0] ?? null;

// ---------------------------------------------------------------------------
// Export

const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const dateValue = (iso) => iso.replace(/-/g, '');
const dateTimeValue = (iso, hhmm) => `${dateValue(iso)}T${hhmm.replace(':', '')}00`;

const fold = (line) => {
  const out = [];
  let rest = line;
  while (rest.length > 73) {
    out.push(rest.slice(0, 73));
    rest = ` ${rest.slice(73)}`;
  }
  out.push(rest);
  return out.join('\r\n');
};

// items: { uid, title, date, start?, end?, description?, url? }
export function buildICS(items, calName = 'Rotation Planner') {
  const dtstamp = stamp();
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Rotation Planner//Student-made//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(calName)}`,
  ];
  for (const it of items) {
    lines.push('BEGIN:VEVENT', `UID:${it.uid}`, `DTSTAMP:${dtstamp}`);
    if (it.start) {
      lines.push(`DTSTART:${dateTimeValue(it.date, it.start)}`);
      lines.push(`DTEND:${dateTimeValue(it.date, it.end ?? it.start)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${dateValue(it.date)}`);
    }
    lines.push(`SUMMARY:${escapeText(it.title)}`);
    if (it.description) lines.push(`DESCRIPTION:${escapeText(it.description)}`);
    if (it.url) lines.push(`URL:${it.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
