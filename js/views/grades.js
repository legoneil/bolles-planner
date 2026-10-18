import { cleanCourseText, matchClass } from '../grades.js';
import { className, esc } from '../ui.js';

const ago = (t, now) => {
  const m = Math.round((now - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
};

const gradeText = (g) => {
  const pct = g.percent !== null ? `${g.percent}%` : null;
  const letter = g.letter ?? (/^[A-F][+-]?$/.test(g.display ?? '') ? g.display : null);
  if (letter && pct) return `${letter} · ${pct}`;
  return pct ?? g.display ?? letter ?? '—';
};
const LETTER_TONE = { A: 'g-high', B: 'g-mid', C: 'g-low', D: 'g-alert', F: 'g-alert' };
const tone = (g) => {
  if (g.percent !== null) return g.percent >= 90 ? 'g-high' : g.percent >= 80 ? 'g-mid' : g.percent >= 70 ? 'g-low' : 'g-alert';
  const letter = g.letter ?? /^([A-F])[+-]?$/.exec(g.display ?? '')?.[1];
  return LETTER_TONE[letter?.[0]] ?? '';
};

const INSTALL = `
  <ol class="steps">
    <li>On your laptop, install the <b>Bolles Planner Grades</b> extension for Chrome (<a href="https://github.com/legoneil/bolles-planner/blob/claude/zealous-fermat-gt2k97/docs/EXTENSION.md" target="_blank" rel="noopener">how to install</a>).</li>
    <li>Open your Schoology grades page once while logged in.</li>
    <li>Open this planner in Chrome on that laptop. Your grades appear here, and on your phone after it syncs.</li>
  </ol>
  <p class="muted small">The extension only reads pages you can already see in Schoology. Your grades are saved to your own planner and are never shared with friends.</p>`;

export function renderGrades(ctx, extension) {
  const g = ctx.state.grades;
  const head = `<header class="view-head"><div class="day-title"><h1>Grades</h1></div></header>`;
  if (!g?.courses?.length) {
    return `${head}
      ${extension.status && !extension.status.ok ? `<section class="alert"><p class="alert-title">The extension couldn’t read your grades</p><p>${esc(extension.status.message)} Open the extension and use <b>Copy debug info</b>, then send it to Claude.</p></section>` : ''}
      <section class="card"><h2>Bring in your Schoology grades</h2>${INSTALL}</section>`;
  }
  const now = ctx.now.getTime();
  const stale = now - g.readAt > 3 * 24 * 3600 * 1000;
  const courses = g.courses
    .map((c) => {
      const cls = matchClass(c, ctx.profile.classes);
      const items = c.items.filter((i) => i.display || i.percent !== null || i.status);
      return `<li class="course" style="--c:${esc(cls?.color ?? 'var(--line)')}">
        <details>
          <summary>
            <span class="course-main"><b>${esc(cls ? className(cls) : cleanCourseText(c.title))}</b>
              <small>${esc(cls ? `${cleanCourseText(c.title)}${c.section ? ` · ${cleanCourseText(c.section)}` : ''}` : cleanCourseText(c.section))}</small></span>
            <span class="course-grade ${tone(c)}">${esc(gradeText(c))}</span>
          </summary>
          ${c.periods.length ? `<p class="periods">${c.periods.map((p) => `<span class="chip-static">${esc(p.title)}: <b>${esc(gradeText(p))}</b></span>`).join('')}</p>` : ''}
          ${items.length
            ? `<ul class="grade-items">${items
                .map(
                  (i) => `<li><span class="gi-title">${esc(i.title)}${i.category ? `<small>${esc(i.category)}${i.due ? ` · due ${esc(i.due)}` : ''}</small>` : ''}</span>
                  <span class="gi-score ${tone(i)} ${i.status ? 'gi-status' : ''}">${esc(i.status && !i.score ? i.status : i.max ? `${i.score ?? '–'}/${i.max}` : gradeText(i))}</span></li>`,
                )
                .join('')}</ul>`
            : '<p class="muted small">No graded assignments yet.</p>'}
        </details>
      </li>`;
    })
    .join('');
  return `${head}
    <p class="muted small grades-meta">From Schoology · updated ${esc(ago(g.readAt, now))}${stale ? ' · open Schoology on your laptop to refresh' : ''}</p>
    <section class="card"><ul class="course-list">${courses}</ul></section>
    <p class="muted small">Only you can see your grades. They’re saved to your own planner and never shared with friends. Always check Schoology for official grades.</p>`;
}

// Small card for Today.
export function gradesCard(ctx) {
  const g = ctx.state.grades;
  if (!g?.courses?.length) return '';
  const chips = g.courses
    .slice(0, 8)
    .map((c) => {
      const cls = matchClass(c, ctx.profile.classes);
      return `<span class="grade-chip" style="--c:${esc(cls?.color ?? 'var(--line)')}">${esc(cls ? className(cls) : cleanCourseText(c.title))} <b class="${tone(c)}">${esc(gradeText(c))}</b></span>`;
    })
    .join('');
  return `<section class="card"><div class="card-head"><h2>Grades</h2><button class="link-btn small" data-nav="#/grades">Details</button></div>
    <div class="grade-chips">${chips}</div></section>`;
}

