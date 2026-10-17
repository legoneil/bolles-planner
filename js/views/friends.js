import { CAMPUSES } from '../data/bolles-2026-27.js';
import { addDays, formatLongDate, formatRange, relativeDay } from '../dates.js';
import { classesTogether, compareDay, friendNow } from '../compare.js';
import { className, emptyState, esc, letterBadge, ordinal, statusLabel } from '../ui.js';

const nowHHMM = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const formatCode = (c) => (c ? `${c.slice(0, 4)}-${c.slice(4)}` : '');
const campusLabel = (s) => (s?.campus ? `${ordinal(Number(s.grade))} grade · ${CAMPUSES[s.campus]?.shortName ?? ''}` : 'No schedule yet');

const head = (title, sub = '') => `<header class="view-head"><div class="day-title">${sub ? `<p class="eyebrow">${esc(sub)}</p>` : ''}<h1>${esc(title)}</h1></div></header>`;

export function renderFriends(ctx, friends, account) {
  if (!account || account.status === 'disabled')
    return `${head('Friends')}${emptyState('Friends needs accounts', 'Accounts aren’t set up for this planner yet.')}`;
  if (account.status === 'loading' || account.status === 'unavailable')
    return `${head('Friends')}${emptyState(account.status === 'loading' ? 'Loading…' : 'Can’t reach the account server', account.error ? esc(account.error) : '')}`;
  if (account.status !== 'signed-in')
    return `${head('Friends')}
      <section class="card intro">
        <h2>Compare schedules with friends</h2>
        <p>See which classes you share, when you have lunch together, and where your friends are right now.</p>
        <p class="muted small">Sign in first so your friends can find your schedule.</p>
        <div class="btn-row" style="margin-top:12px">
          <button class="btn" data-action="open-auth" data-mode="signin">Sign in</button>
          <button class="btn secondary" data-action="open-auth" data-mode="signup">Create account</button>
        </div>
      </section>`;
  if (!friends.me) {
    if (friends.status === 'loading' || friends.status === 'idle') return `${head('Friends')}${emptyState('Loading…')}`;
    return `${head('Friends')}
      ${friends.error ? `<p class="error small">${esc(friends.error)}</p>` : ''}
      <section class="card intro">
        <h2>Compare schedules with friends</h2>
        <ul class="bullets">
          <li>See classes you share, lunch together and free periods in common.</li>
          <li>Friends add you with your private friend code. Nobody can search for you.</li>
          <li>You approve every friend. They see only your name and classes, never your homework, tests or email.</li>
        </ul>
        <form data-form="friends-enable" class="stack" style="margin-top:12px">
          <label>Name your friends will see
            <input name="name" required maxlength="40" autocomplete="given-name" placeholder="e.g. Neil S." />
          </label>
          <button class="btn" type="submit">Turn on friends</button>
        </form>
      </section>`;
  }

  const incoming = friends.requests.filter((r) => r.direction === 'incoming');
  const outgoing = friends.requests.filter((r) => r.direction === 'outgoing');
  const time = nowHHMM(ctx.now);

  const list = friends.list.length
    ? `<ul class="friend-list">${friends.list
        .map((f) => {
          const together = classesTogether(ctx.profile, f.schedule);
          const now = friendNow(f.schedule, ctx.today, time);
          return `<li><button class="friend-row" data-nav="#/friend/${esc(f.user_id)}">
            <span class="avatar" aria-hidden="true">${esc(initials(f.display_name))}</span>
            <span class="friend-main"><b>${esc(f.display_name)}</b>
              <small>${esc(campusLabel(f.schedule))}${together.length ? ` · ${together.length} ${together.length === 1 ? 'class' : 'classes'} together` : ''}</small>
              <small class="${now.inSchool ? 'now-text' : 'muted'}">${now.inSchool ? 'Now: ' : ''}${esc(now.text)}</small>
            </span><span class="chev" aria-hidden="true">›</span>
          </button></li>`;
        })
        .join('')}</ul>`
    : '<p class="muted">No friends yet. Share your code, or add a friend with theirs.</p>';

  return `${head('Friends')}
    ${friends.error ? `<p class="error small">${esc(friends.error)}</p>` : ''}
    ${incoming.length ? `<section class="card"><h2>Friend requests <span class="count">${incoming.length}</span></h2>
      <ul class="request-list">${incoming
        .map(
          (r) => `<li><span><b>${esc(r.display_name)}</b> wants to compare schedules</span>
          <span class="btn-row"><button class="btn small" data-action="friend-accept" data-id="${esc(r.user_id)}">Accept</button>
          <button class="btn secondary small" data-action="friend-decline" data-id="${esc(r.user_id)}">Decline</button></span></li>`,
        )
        .join('')}</ul></section>` : ''}

    <section class="card"><div class="card-head"><h2>Friends</h2>
      <button class="link-btn small" data-action="friends-refresh">Refresh</button></div>
      ${list}
      ${outgoing.length ? `<ul class="request-list pending">${outgoing
        .map((r) => `<li><span class="muted">Waiting for <b>${esc(r.display_name)}</b> to accept</span>
          <button class="link-btn small" data-action="friend-cancel" data-id="${esc(r.user_id)}">Cancel</button></li>`)
        .join('')}</ul>` : ''}
    </section>

    <section class="card code-card">
      <h2>Your friend code</h2>
      <p class="friend-code" aria-label="Friend code">${esc(formatCode(friends.me.friend_code))}</p>
      <div class="btn-row"><button class="btn secondary small" data-action="share-code" data-code="${esc(friends.me.friend_code)}">Share code</button></div>
      <p class="muted small">Friends type this in to send you a request. You'll be asked to accept.</p>
    </section>

    <section class="card">
      <h2>Add a friend</h2>
      <form data-form="friend-add" class="inline-form">
        <input name="code" required placeholder="Their friend code" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="12" aria-label="Friend code" />
        <button class="btn" type="submit">Send request</button>
      </form>
      <p class="form-message" role="status" data-friend-message></p>
    </section>

    <section class="card">
      <h2>Your name</h2>
      <form data-form="friends-rename" class="inline-form">
        <input name="name" required maxlength="40" value="${esc(friends.me.display_name)}" aria-label="Name friends see" />
        <button class="btn secondary" type="submit">Save</button>
      </form>
      <p class="muted small">Friends see your name and classes (periods, class names, teachers, rooms). Never your assignments, tests or email.</p>
      <button class="link-btn danger small" data-action="friends-leave">Stop sharing and remove all friends</button>
    </section>`;
}

export function renderFriendCompare(ctx, friends, id, date) {
  const f = friends.list.find((x) => x.user_id === id);
  if (!f) return `${head('Friend')}${emptyState(friends.status === 'ready' ? 'Not on your friends list' : 'Loading…')}<button class="link-btn back-today" data-nav="#/friends">Back to friends</button>`;
  const c = compareDay(date, ctx.profile, f.schedule);
  const together = classesTogether(ctx.profile, f.schedule);
  const isToday = date === ctx.today;
  const now = isToday ? friendNow(f.schedule, date, nowHHMM(ctx.now)) : null;

  const summary = [];
  if (!c.sameCampus) summary.push(`<li>${esc(f.display_name)} is at ${esc(CAMPUSES[f.schedule?.campus]?.name ?? 'another campus')}.</li>`);
  if (c.together.length) summary.push(`<li><b>Class together:</b> ${c.together.map((b) => `P${b.period} ${esc(className(b.cls))} (${esc(formatRange(b.start, b.end))})`).join(', ')}</li>`);
  if (c.lunch.length) summary.push(`<li><b>Lunch together:</b> ${c.lunch.map((l) => esc(formatRange(l.start, l.end))).join(', ')}</li>`);
  if (c.free.length) summary.push(`<li><b>Both free:</b> ${c.free.map((l) => `${esc(formatRange(l.start, l.end))} (your P${l.mine.period})`).join(', ')}</li>`);
  if (!summary.length && (c.me.blocks.length || c.them.blocks.length)) summary.push('<li>No shared classes, lunch or free time today.</li>');

  const column = (day, who, mineSide) => `
    <div class="cmp-col">
      <p class="cmp-who">${esc(who)} ${letterBadge(day.letter)}</p>
      ${day.blocks.length
        ? `<ol class="cmp-blocks">${day.blocks
            .filter((b) => b.isClass || ['lunch', 'activity', 'advisory', 'event', 'exam'].includes(b.kind))
            .map((b) => {
              const shared = b.isClass && b.cls && c.together.some((t) => t.period === b.period);
              const lunchTogether = b.kind === 'lunch' && c.lunch.length;
              const label = b.isClass ? (b.cls ? `P${b.period} ${className(b.cls)}` : `P${b.period} Free`) : b.label;
              return `<li class="cmp-b ${shared ? 'together' : ''} ${lunchTogether ? 'lunch-together' : ''} ${b.isClass && !b.cls ? 'free' : ''} kind-${esc(b.kind ?? '')}"
                ${mineSide && b.cls?.color ? `style="--c:${esc(b.cls.color)}"` : ''}>
                <span class="cmp-time">${esc(formatRange(b.start, b.end))}</span>
                <span class="cmp-name">${esc(label)}</span>
                ${b.isClass && b.cls?.room ? `<span class="cmp-room">Room ${esc(b.cls.room)}</span>` : ''}
              </li>`;
            })
            .join('')}</ol>`
        : `<p class="muted small">${esc(day.name || statusLabel(day))}</p>`}
    </div>`;

  return `
    <header class="view-head">
      <button class="icon-btn" data-nav="#/friend/${esc(id)}/${addDays(date, -1)}" aria-label="Previous day">‹</button>
      <div class="day-title">
        <p class="eyebrow">You & ${esc(f.display_name)} · ${esc(relativeDay(date, ctx.today))}</p>
        <h1>${esc(formatLongDate(date))}</h1>
      </div>
      <button class="icon-btn" data-nav="#/friend/${esc(id)}/${addDays(date, 1)}" aria-label="Next day">›</button>
    </header>
    <button class="link-btn back-today" data-nav="${isToday ? '#/friends' : `#/friend/${esc(id)}`}">${isToday ? 'All friends' : 'Back to today'}</button>
    ${now ? `<section class="card now-card"><div><p class="eyebrow">${esc(f.display_name)} right now</p><p class="now-title">${esc(now.text)}</p></div></section>` : ''}
    ${summary.length ? `<section class="card"><ul class="bullets">${summary.join('')}</ul></section>` : ''}
    <section class="card cmp-grid">
      ${column(c.me, 'You', true)}
      ${column(c.them, f.display_name, false)}
    </section>
    <section class="card">
      <h2>Classes together</h2>
      ${together.length
        ? `<ul class="plain-list">${together
            .map((t) => `<li><b>P${t.period} ${esc(className(t.mine))}</b>${t.mine.teacher ? ` · ${esc(t.mine.teacher)}` : ''} <span class="muted small">(${t.letters.join(', ')} days)</span></li>`)
            .join('')}</ul>`
        : '<p class="muted">No classes together.</p>'}
      <p class="muted small" style="margin-top:8px">Matched by period plus teacher or class name, so make sure your classes have teachers filled in.</p>
    </section>
    <button class="link-btn danger small" data-action="friend-remove" data-id="${esc(id)}" data-name="${esc(f.display_name)}">Remove ${esc(f.display_name)} as a friend</button>`;
}

const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
