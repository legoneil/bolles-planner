// Date helpers. Dates are local-calendar ISO strings ('YYYY-MM-DD') so they
// never shift with time zones; times are 'HH:MM' strings.

const pad = (n) => String(n).padStart(2, '0');

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const todayISO = (now = new Date()) => toISO(now);

export const addDays = (iso, n) => {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

export const addMonths = (iso, n) => {
  const d = parseISO(iso);
  return toISO(new Date(d.getFullYear(), d.getMonth() + n, 1));
};

export const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);

// 0 = Sunday ... 6 = Saturday
export const weekday = (iso) => parseISO(iso).getDay();

export const isWeekend = (iso) => [0, 6].includes(weekday(iso));

export const startOfWeek = (iso) => {
  const wd = weekday(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
};

export const startOfMonth = (iso) => `${iso.slice(0, 7)}-01`;

export const range = (from, count) => Array.from({ length: count }, (_, i) => addDays(from, i));

export const minutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const nowMinutes = (now = new Date()) => now.getHours() * 60 + now.getMinutes();

export const formatTime = (hhmm) => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${pad(m)} ${suffix}`;
};

export const formatTimeShort = (hhmm) => formatTime(hhmm).replace(/ [AP]M$/, '');

export const formatRange = (start, end) =>
  end ? `${formatTimeShort(start)}–${formatTime(end)}` : formatTime(start);

const fmt = (iso, opts) => parseISO(iso).toLocaleDateString('en-US', opts);

export const formatDate = (iso) => fmt(iso, { weekday: 'short', month: 'short', day: 'numeric' });
export const formatLongDate = (iso) => fmt(iso, { weekday: 'long', month: 'long', day: 'numeric' });
export const formatMonth = (iso) => fmt(iso, { month: 'long', year: 'numeric' });
export const formatWeekdayShort = (iso) => fmt(iso, { weekday: 'short' });
export const dayOfMonth = (iso) => parseISO(iso).getDate();

export const relativeDay = (iso, today = todayISO()) => {
  const n = diffDays(today, iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 7) return fmt(iso, { weekday: 'long' });
  return formatDate(iso);
};
