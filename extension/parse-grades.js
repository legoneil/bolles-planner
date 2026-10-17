// Reads a Schoology grades page (https://<school>.schoology.com/grades/grades)
// into plain data. Schoology's markup isn't documented, so every lookup has
// fallbacks, and describeLayout() produces a grade-free outline of the page
// for fixing the selectors when Schoology changes.
//
// Loaded as a classic script in the extension, and in tests.

(function (root) {
  const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  const text = (el) => clean(el?.textContent);
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

  // "94.5%", "A-", "18 / 20", "Missing"
  function readGrade(cell) {
    if (!cell) return { display: null, score: null, max: null, percent: null, status: null };
    const awarded = first(cell, ['.awarded-grade', '.rounded-grade', '.grade-value', '.numeric-grade', '.grade']);
    const exact = cell.querySelector('.rounded-grade[title]')?.getAttribute('title');
    const maxText = text(first(cell, ['.max-grade', '.grade-max', '.max-points']));
    // Without a separate score element, the cell is e.g. "Missing / 20": drop the max.
    const awardedText = text(awarded) || clean(text(cell).replace(maxText, ''));
    const status = /missing|excused|incomplete|not graded|pending/i.exec(text(cell))?.[0] ?? null;
    const score = num(exact ?? awardedText);
    const max = num(maxText);
    let percent = null;
    if (/%/.test(awardedText)) percent = num(awardedText);
    else if (score !== null && max) percent = Math.round((score / max) * 1000) / 10;
    const letter = /(?:^|\s)([A-F][+-]?)(?=\s|$)/.exec(awardedText)?.[1] ?? null;
    const display = clean(awardedText.replace(maxText, '')) || null;
    return { display, score, max, percent, letter, status };
  }

  function rowKind(tr) {
    const c = ` ${tr.className} `;
    if (/\bperiod-row\b/.test(c)) return 'period';
    if (/\bcategory-row\b/.test(c)) return 'category';
    if (/\bitem-row\b/.test(c)) return 'item';
    return null;
  }

  function parseCourse(el) {
    const titleEl = first(el, ['.gradebook-course-title a', '.gradebook-course-title', '.course-title', 'h2', 'h3']);
    const rawTitle = text(titleEl);
    const href = titleEl?.closest('a')?.getAttribute('href') ?? el.querySelector('a[href*="/course/"]')?.getAttribute('href') ?? '';
    const id = /\/course\/(\d+)/.exec(href)?.[1] ?? el.getAttribute('data-id') ?? el.id ?? rawTitle;
    const [title, section] = rawTitle.split(/\s*:\s*/, 2);
    const overall = readGrade(first(el, ['.gradebook-course-title .course-grade-value', '.course-grade-value', '.gradebook-course-title .grade', '.final-grade']));

    const periods = [];
    const items = [];
    let category = null;
    for (const tr of el.querySelectorAll('tr')) {
      const kind = rowKind(tr);
      if (!kind) continue;
      const th = tr.querySelector('th') ?? tr.cells?.[0];
      const name = text(first(th ?? tr, ['.title', 'a', '.title-column'])) || text(th);
      const g = readGrade(first(tr, ['.grade-column', 'td.grade', 'td:last-child']));
      if (kind === 'period') periods.push({ title: name, ...g });
      else if (kind === 'category') category = name.replace(/\s*\(\d+%\)\s*$/, '');
      else if (kind === 'item' && items.length < 300) {
        const due = text(th?.querySelector('.due-date, .item-due-date'));
        const link = th?.querySelector('a[href]')?.getAttribute('href') ?? '';
        items.push({
          id: tr.getAttribute('data-id') ?? /\/(assignment|discussion|assessment)\/(\d+)/.exec(link)?.[2] ?? `${name}|${due}`,
          title: clean(name.replace(due, '')),
          category,
          due: due.replace(/^Due\s*/i, '') || null,
          ...g,
        });
      }
    }
    // Course grade fallback: the latest period with a grade.
    const course = overall.display || overall.percent !== null ? overall : ([...periods].reverse().find((p) => p.display || p.percent !== null) ?? overall);
    return { id: String(id), title: clean(title), section: clean(section) || null, grade: course.display, percent: course.percent, letter: course.letter ?? null, periods, items };
  }

  function parseGrades(doc) {
    const courses = [...doc.querySelectorAll('.gradebook-course')].map(parseCourse).filter((c) => c.title);
    return { courses, readAt: Date.now(), url: doc.location?.href ?? null };
  }

  // A grade-free outline of the page structure, for debugging selectors.
  function describeLayout(doc) {
    const lines = [];
    const walk = (el, depth) => {
      if (depth > 9 || lines.length > 400) return;
      const cls = [...el.classList].slice(0, 4).join('.');
      const tag = el.tagName.toLowerCase();
      if (['script', 'style', 'svg', 'noscript'].includes(tag)) return;
      lines.push(`${'  '.repeat(depth)}${tag}${el.id ? `#${el.id}` : ''}${cls ? `.${cls}` : ''}`);
      for (const child of el.children) walk(child, depth + 1);
    };
    const main = doc.querySelector('#main-inner, #main, main, #content-wrapper') ?? doc.body;
    walk(main, 0);
    return lines.join('\n');
  }

  root.BollesGrades = { parseGrades, describeLayout, readGrade };
})(typeof globalThis !== 'undefined' ? globalThis : this);
