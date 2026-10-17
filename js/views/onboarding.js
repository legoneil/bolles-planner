import { CAMPUSES } from '../data/bolles-2026-27.js';
import { CLASS_TYPES } from '../store.js';
import { esc, ordinal } from '../ui.js';

// draft: { step, campus, grade, classes }
export function renderOnboarding(draft) {
  if (draft.step === 1) {
    return `
      <section class="onboard">
        <p class="eyebrow">Welcome</p>
        <h1>Bolles Planner</h1>
        <p class="lead">Your letter days, classes, homework and tests in one place. Set it up in about a minute.</p>
        <p class="muted small">Student-made. Not an official Bolles School app.</p>
        <form data-form="onboard-school" class="stack">
          <fieldset>
            <legend>Which campus?</legend>
            ${Object.values(CAMPUSES)
              .map(
                (c) => `<label class="choice"><input type="radio" name="campus" value="${c.id}" ${draft.campus === c.id ? 'checked' : ''} required />
                <span><b>${esc(c.shortName)}</b><small>${esc(c.name.split(' · ')[1])} · Grades ${c.grades[0]}–${c.grades.at(-1)}</small></span></label>`,
              )
              .join('')}
          </fieldset>
          <label>Grade
            <select name="grade" required>
              <option value="">Choose…</option>
              ${[6, 7, 8, 9, 10, 11, 12].map((g) => `<option value="${g}" ${Number(draft.grade) === g ? 'selected' : ''}>${ordinal(g)} grade</option>`).join('')}
            </select>
          </label>
          <button class="btn" type="submit">Next</button>
        </form>
      </section>`;
  }

  const campus = CAMPUSES[draft.campus];
  return `
    <section class="onboard">
      <p class="eyebrow">Step 2 of 2</p>
      <h1>Your classes</h1>
      <p class="lead">Fill in what you have each period. Leave a row blank for a free period. You can change any of this later in Settings.</p>
      <form data-form="onboard-classes" class="stack">
        ${draft.classes
          .map(
            (c, i) => `<fieldset class="class-entry" style="--c:${esc(c.color)}">
            <legend>Period ${c.period}</legend>
            <input name="name-${i}" placeholder="Class (e.g. Biology)" value="${esc(c.name)}" aria-label="Period ${c.period} class" />
            <div class="form-row">
              <input name="teacher-${i}" placeholder="Teacher" value="${esc(c.teacher)}" aria-label="Period ${c.period} teacher" />
              <input name="room-${i}" placeholder="Room" value="${esc(c.room)}" aria-label="Period ${c.period} room" />
              <select name="type-${i}" aria-label="Period ${c.period} level">${CLASS_TYPES.map((t) => `<option ${c.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
            </div>
          </fieldset>`,
          )
          .join('')}
        ${campus.hasLunchSplit ? '<p class="muted small">Your lunch time during 3rd block depends on your teacher. We’ll fill it in from the planner’s teacher list; you can adjust it in Settings.</p>' : ''}
        <div class="btn-row">
          <button class="btn secondary" type="button" data-action="onboard-back">Back</button>
          <button class="btn" type="submit">Finish</button>
        </div>
      </form>
    </section>`;
}
