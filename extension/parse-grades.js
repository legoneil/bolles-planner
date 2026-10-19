// Reads a Schoology grades page (https://<school>.schoology.com/grades/grades)
// into plain data. Schoology's markup isn't documented, so every lookup has
// fallbacks, and describeLayout() produces a grade-free outline of the page
// for fixing the selectors when Schoology changes.
//
// Loaded as a classic script in the extension, and in tests.

(function (root) {
  const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  const text = (el) => clean(el?.textContent);
  // Text a sighted student sees: without screen-reader-only text, tooltips
  // and the weight badge Schoology puts next to period/category names.
  const HIDDEN_BITS = '.visually-hidden, .infotip-content, .percentage-contrib, .sr-only';
  const visibleText = (el) => {
    if (!el) return '';
    const copy = el.cloneNode(true);
    copy.querySelectorAll(HIDDEN_BITS).forEach((n) => n.remove());
    return clean(copy.textContent);
  };
  const first = (el, selectors) => {
    for (const s of selectors) {
      const found = el.querySelector(s);
      if (found) return found;
    }
    return null;
  };

  const num = (s) => {
    const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
  };

  const PCT = /(-?\d+(?:\.\d+)?)\s*%/;
  const HINT_ATTRS = ['title', 'aria-label', 'data-original-title', 'data-title', 'data-grade', 'data-percentage'];
  const attrValues = (cell) =>
    [cell, ...cell.querySelectorAll('*')].flatMap((el) => HINT_ATTRS.map((a) => el.getAttribute(a)).filter(Boolean));

  // "94.5%", "A-", "18 / 20", "Missing". Schoology often shows a letter and
  // keeps the percentage in a tooltip (title attribute) or hidden text.
  function readGrade(cell) {
    const none = { display: null, score: null, max: null, percent: null, letter: null, status: null };
    if (!cell) return none;
    // Not graded yet: Schoology shows a dash in .no-grade.
    if (cell.querySelector('.no-grade') && !cell.querySelector('.awarded-grade')) return none;
    const awarded = first(cell, ['.awarded-grade', '.rounded-grade', '.grade-value', '.numeric-grade', '.grade']);
    const exact = cell.querySelector('.rounded-grade[title]')?.getAttribute('title');
    const maxText = text(first(cell, ['.max-grade', '.grade-max', '.max-points']));
    // Without a separate score element, the cell is e.g. "Missing / 20": drop the max.
    const awardedText = text(awarded) || clean(text(cell).replace(maxText, ''));
    const status = /missing|excused|incomplete|not graded|pending/i.exec(text(cell))?.[0] ?? null;
    const score = num(exact && !PCT.test(exact) ? exact : awardedText);
    const max = num(maxText);
    const pctSource = [awardedText, ...attrValues(cell), text(cell)].find((v) => PCT.test(v));
    let percent = null;
    if (pctSource) percent = Number(PCT.exec(pctSource)[1]);
    else if (score !== null && max) percent = Math.round((score / max) * 1000) / 10;
    const letter = /(?:^|\s)([A-F][+-]?)(?=\s|$)/.exec(awardedText)?.[1] ?? null;
    const display = clean(awardedText.replace(maxText, '')) || null;
    return { display, score, max, percent, letter, status };
  }

  function rowKind(tr) {
    const c = ` ${tr.className} `;
    if (/\bcourse-row\b/.test(c)) return 'course';
    if (/\bperiod-row\b/.test(c)) return 'period';
    if (/\bcategory-row\b/.test(c)) return 'category';
    if (/\bitem-row\b/.test(c)) return 'item';
    return null;
  }

  function parseCourse(el) {
    const titleEl = first(el, ['.gradebook-course-title a', '.gradebook-course-title', '.course-title', 'h2', 'h3']);
    const rawTitle = visibleText(titleEl);
    const href = titleEl?.closest('a')?.getAttribute('href') ?? el.querySelector('a[href*="/course/"]')?.getAttribute('href') ?? '';
    const id = /\/course\/(\d+)/.exec(href)?.[1] || el.getAttribute('data-id') || el.id || rawTitle;
    // Schoology appends hidden text like "Course" right after the section name.
    // "Spanish III: Honors: MS_Period 4" → title "Spanish III", section "Honors: MS_Period 4".
    const full = rawTitle.replace(/(?<=\S)Course$/, '');
    const colon = full.indexOf(':');
    const [title, section] = colon < 0 ? [full, ''] : [full.slice(0, colon).trim(), full.slice(colon + 1).trim()];
    const overall = readGrade(first(el, ['.gradebook-course-title .course-grade-value', '.course-grade-value', '.gradebook-course-title .grade', '.final-grade']));

    const periods = [];
    const categories = [];
    const items = [];
    let category = null;
    let period = null;
    let courseRow = null;
    for (const tr of el.querySelectorAll('tr')) {
      const kind = rowKind(tr);
      if (!kind) continue;
      const th = tr.querySelector('th') ?? tr.cells?.[0];
      const titleEl = first(th ?? tr, ['.title', 'a', '.title-column']);
      const due = visibleText(th?.querySelector('.due-date, .item-due-date'));
      const name = clean((visibleText(titleEl) || visibleText(th)).replace(due, '')).replace(/\s*\(\d+(\.\d+)?%\)\s*$/, '');
      // "(50%)" next to a period or category name is its weight, not a grade.
      const weight = num(text(th?.querySelector('.percentage-contrib'))) ?? num(/\((\d+(?:\.\d+)?)%\)/.exec(text(titleEl))?.[1]);
      const g = readGrade(first(tr, ['.grade-column', 'td.grade', 'td:last-child']));
      if (kind === 'course') courseRow = g;
      else if (kind === 'period') {
        period = name;
        category = null;
        periods.push({ title: name, weight, ...g });
      } else if (kind === 'category') {
        category = name;
        categories.push({ title: name, period, weight, ...g });
      } else if (kind === 'item' && items.length < 300) {
        const link = th?.querySelector('a[href]')?.getAttribute('href') ?? '';
        items.push({
          id: tr.getAttribute('data-id') ?? /\/(assignment|discussion|assessment)\/(\d+)/.exec(link)?.[2] ?? `${name}|${due}`,
          title: name,
          category,
          period,
          due: due.replace(/^Due\s*/i, '') || null,
          ...g,
        });
      }
    }
    // Course grade fallback: the latest period with a grade.
    const has = (g) => g && (g.display || g.percent !== null);
    const course = has(overall) ? overall : has(courseRow) ? courseRow : ([...periods].reverse().find((p) => p.display || p.percent !== null) ?? overall);
    return { id: String(id), title: clean(title), section: clean(section) || null, grade: course.display, percent: course.percent, letter: course.letter ?? null, periods, categories, items };
  }

  function parseGrades(doc) {
    const courses = [...doc.querySelectorAll('.gradebook-course')].map(parseCourse).filter((c) => c.title);
    return { courses, readAt: Date.now(), url: doc.location?.href ?? null };
  }

  // A grade-free outline of the page structure, for debugging selectors.
  // Instead of text it notes the *kind* of value an element holds: [%] for a
  // percentage, [letter], [num], and attributes holding a percentage ({title:%}).
  const kind = (s) => (PCT.test(s) ? '%' : /^[A-F][+-]?$/.test(s) ? 'letter' : /\d/.test(s) ? 'num' : null);
  function describeLayout(doc) {
    const lines = [];
    // Names of hint and data-* attributes, with the kind of value (never the value).
    const attrInfo = (el) =>
      [...el.attributes]
        .filter((a) => HINT_ATTRS.includes(a.name) || a.name.startsWith('data-'))
        .slice(0, 8)
        .map((a) => `${a.name}:${kind(clean(a.value)) ?? (a.value ? 'text' : 'empty')}`);
    const walk = (el, depth, maxDepth) => {
      if (depth > maxDepth || lines.length > 900) return;
      const cls = [...el.classList].slice(0, 6).join('.');
      const tag = el.tagName.toLowerCase();
      if (['script', 'style', 'svg', 'noscript'].includes(tag)) return;
      const own = clean([...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' '));
      const textKind = own ? (kind(own) ?? 'txt') : null;
      const attrs = attrInfo(el);
      lines.push(
        `${'  '.repeat(depth)}${tag}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}${textKind ? ` [${textKind}]` : ''}${attrs.length ? ` {${attrs.join(', ')}}` : ''}`,
      );
      for (const child of el.children) walk(child, depth + 1, maxDepth);
    };
    const courses = [...doc.querySelectorAll('.gradebook-course')];
    if (courses.length) {
      // The courses are deeply nested; outline the first two from the top.
      lines.push(`${courses.length} courses on page`);
      courses.slice(0, 2).forEach((c, i) => {
        lines.push(`--- course ${i + 1}`);
        walk(c, 0, 30);
      });
    } else {
      const main = doc.querySelector('#main-inner') ?? doc.querySelector('#main') ?? doc.querySelector('#content-wrapper') ?? doc.body;
      walk(main, 0, 16);
    }
    return lines.join('\n');
  }

  root.BollesGrades = { parseGrades, describeLayout, readGrade };
})(typeof globalThis !== 'undefined' ? globalThis : this);
