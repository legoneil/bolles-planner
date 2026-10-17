// Test-load checks. Only assignments of type 'test' count, per the rule:
// two tests on one day is a heavy day; three or more triggers an alert a
// week ahead so the student can ask to move one.

import { addDays, todayISO } from './dates.js';
import { eventsOn } from './schedule.js';

export const HEAVY_DAY = 2;
export const OVERLOAD_DAY = 3;
export const ALERT_WINDOW_DAYS = 7;

export const isTest = (a) => a.type === 'test' && !a.hidden;

export function testsByDate(assignments) {
  const map = new Map();
  for (const a of assignments) {
    if (!isTest(a) || !a.dueDate) continue;
    if (!map.has(a.dueDate)) map.set(a.dueDate, []);
    map.get(a.dueDate).push(a);
  }
  return map;
}

export function loadLevel(count) {
  if (count >= OVERLOAD_DAY) return 'overload';
  if (count >= HEAVY_DAY) return 'heavy';
  return null;
}

// Days with 3+ tests from today through the alert window, soonest first.
export function overloadAlerts(assignments, today = todayISO()) {
  const horizon = addDays(today, ALERT_WINDOW_DAYS);
  return [...testsByDate(assignments)]
    .filter(([date, tests]) => date >= today && date <= horizon && tests.length >= OVERLOAD_DAY)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, tests]) => ({ date, tests }));
}

// Problems with putting a test on `date` (used when adding or editing).
export function testWarnings(assignments, date, profile, ignoreId = null) {
  const others = (testsByDate(assignments).get(date) ?? []).filter((a) => a.id !== ignoreId);
  const warnings = [];
  const total = others.length + 1;
  if (total >= OVERLOAD_DAY) warnings.push(`That makes ${total} tests on this day. Consider asking a teacher to move one.`);
  else if (total >= HEAVY_DAY) warnings.push('Heads up: this will be a heavy day (2 tests).');
  const noTests = eventsOn(date, profile).find((e) => e.kind === 'notests');
  if (noTests) warnings.push(`${noTests.title}. Check this date with your teacher.`);
  return warnings;
}
