import { cleanCourseText, matchClass } from '../grades.js';
import { GOAL_LETTERS, gradeModel, letterCutoff, letterFor, scoreNeeded } from '../gradework.js';
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
    <li>On your laptop, install the <b>Rotation Planner Grades</b> extension for Chrome (<a href="https://github.com/legoneil/rotation-planner/blob/claude/zealous-fermat-gt2k97/docs/EXTENSION.md" target="_blank" rel="noopener">how to install</a>).</li>
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
  // "Tests (60%): B": the weight is how much it counts, not a score.
  const chip = (p) =>
    `<span class="chip-static">${esc(p.title)}${p.weight !== null && p.weight !== undefined ? ` (${esc(p.weight)}%)` : ''}: <b>${esc(gradeText(p))}</b></span>`;
  const courses = g.courses
    .map((c) => {
      const cls = matchClass(c, ctx.profile.classes);
      const items = c.items.filter((i) => i.display || i.percent !== null || i.status);
      return `<li class="course" style="--c:${esc(cls?.color ?? 'var(--line)')}">
        <details data-key="course-${esc(c.id)}">
          <summary>
            <span class="course-main"><b>${esc(cls ? className(cls) : cleanCourseText(c.title))}</b>
              <small>${esc(cls ? `${cleanCourseText(c.title)}${c.section ? ` · ${cleanCourseText(c.section)}` : ''}` : cleanCourseText(c.section))}</small></span>
            <span class="course-grade ${tone(c)}">${esc(gradeText(c))}</span>
          </summary>
          ${c.periods.length ? `<p class="periods">${c.periods.map(chip).join('')}</p>` : ''}
          ${c.categories?.length ? `<p class="periods">${c.categories.map(chip).join('')}</p>` : ''}
          ${items.length
            ? `<ul class="grade-items">${items
                .map(
                  (i) => `<li><span class="gi-title">${esc(i.title)}${i.category ? `<small>${esc(i.category)}${i.due ? ` · due ${esc(i.due)}` : ''}</small>` : ''}</span>
                  <span class="gi-score ${tone(i)} ${i.status ? 'gi-status' : ''}">${esc(i.status && !i.score ? i.status : i.max ? `${i.score ?? '–'}/${i.max}` : gradeText(i))}</span></li>`,
                )
                .join('')}</ul>`
            : '<p class="muted small">No graded assignments yet.</p>'}
          ${needCalc(c)}
        </details>
      </li>`;
    })
    .join('');
  return `${head}
    <p class="muted small grades-meta">From Schoology · updated ${esc(ago(g.readAt, now))}${stale ? ' · open Schoology on your laptop to refresh' : ''}</p>
    <section class="card"><ul class="course-list">${courses}</ul></section>
    <p class="muted small">Only you can see your grades. They’re saved to your own planner and never shared with friends. Always check Schoology for official grades.</p>`;
}

// ---------------------------------------------------------------------------
// What do I need?

const TARGETS = [97, 93, 90, 87, 85, 83, 80, 77, 75, 73, 70];
const BIG = /test|exam|assess|summative|major|quiz/i;

function needCalc(course) {
  const model = gradeModel(course);
  if (!model) return '';
  const letters = model.mode === 'letters';
  // Aim one step up from where you are.
  const now = model.reported ?? (letters ? letterFor(model.percent) : model.percent);
  const goals = letters ? GOAL_LETTERS : TARGETS;
  const goal = letters ? (GOAL_LETTERS[GOAL_LETTERS.indexOf(now) - 1] ?? 'A') : ([...TARGETS].reverse().find((t) => t > now) ?? TARGETS[0]);
  const cats = model.weighted ? [...model.categories].sort((a, b) => b.weight - a.weight) : [];
  const cat = cats.find((k) => BIG.test(k.title)) ?? cats[0];
  return `<form class="need" data-form="need-${esc(course.id)}" data-course="${esc(course.id)}" onsubmit="return false">
    <p class="need-title">What do I need?</p>
    <div class="need-fields">
      <label>Goal <select name="target">${goals.map((t) => `<option value="${t}" ${t === goal ? 'selected' : ''}>${letters ? t : `${t}%`}</option>`).join('')}</select></label>
      ${cats.length ? `<label>Next <select name="category">${cats.map((k) => `<option value="${esc(k.title)}" ${k === cat ? 'selected' : ''}>${esc(k.title)} (${esc(k.weight)}%)</option>`).join('')}</select></label>` : ''}
      ${letters ? '' : '<label>Worth <input name="points" type="number" inputmode="numeric" min="1" max="1000" value="100" /> points</label>'}
    </div>
    <p class="need-result" aria-live="polite">${needText(model, { goal, category: cat?.title ?? null, points: 100 })}</p>
  </form>`;
}

function needText(model, { goal, category, points }) {
  const what = model.period ? `${esc(model.period)} grade` : 'grade';
  const next = category ? `the next ${esc(category)} grade` : 'the next assignment';
  if (model.mode === 'letters') {
    const r = scoreNeeded(model, { target: letterCutoff(goal), category, points: 100 });
    let text;
    if (r.kind === 'need') text = `You’d need about <b>${letterFor(r.percent)}</b> (${Math.ceil(r.percent)}%) on ${next} to bring your ${what} to ${esc(goal)}.`;
    else if (r.kind === 'safe') text = `Your ${what} stays at ${esc(goal)} or above even with an F on ${next}.`;
    else text = `Even an A+ on ${next} gets your ${what} to about ${letterFor(r.best)}, short of ${esc(goal)}. It will take a few more good grades.`;
    const note = model.approximate
      ? `Schoology shows ${esc(model.reported)}, and these letters work out to ${letterFor(model.percent)}, so this one is a rough guess.`
      : 'An estimate: Schoology only shows letters here, so this assumes A = 93–100, B = 83–86 and so on, and that each assignment in a category counts the same.';
    return `${text}<br><small class="muted">${note}</small>`;
  }
  const r = scoreNeeded(model, { target: goal, category, points });
  let text;
  if (r.kind === 'need') text = `You need about <b>${r.score}/${points}</b> (${r.percent}%) on ${next} to bring your ${what} to ${goal}%.`;
  else if (r.kind === 'safe') text = `You’ll stay at ${goal}% or above even with a 0 (lowest: ${r.worst}%).`;
  else text = `Even ${points}/${points} only gets your ${what} to ${r.best}%, short of ${goal}%.`;
  const note = model.approximate
    ? `<br><small class="muted">Schoology shows ${esc(model.reported)}%, but the scores here add up to ${model.percent}%. This class may drop scores or count extra credit, so treat this as a guide.</small>`
    : '';
  return text + note;
}

export function updateNeed(form, ctx) {
  const course = ctx.state.grades?.courses?.find((c) => c.id === form.dataset.course);
  const model = course && gradeModel(course);
  const out = form.querySelector('.need-result');
  if (!model || !out) return;
  const points = Math.min(1000, Math.max(1, Number(form.points?.value) || 100));
  const goal = model.mode === 'letters' ? form.target.value : Number(form.target.value);
  out.innerHTML = needText(model, { goal, category: form.category?.value ?? null, points });
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

