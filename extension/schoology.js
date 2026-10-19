// Runs on Schoology pages you're logged into. Requests made from a
// Schoology page carry your Schoology login, which background requests
// often don't (Bolles signs in through Microsoft, and some browsers keep
// the login cookie away from extensions). So grades are read here:
// - on your grades page (/grades/grades), right away;
// - on any other Schoology page, if they're more than 30 minutes old;
// - whenever the background worker asks (every 30 minutes).

const REFRESH_MS = 30 * 60 * 1000;

const loggedOut = () =>
  chrome.storage.local.set({ status: { ok: false, loggedOut: true, at: Date.now(), message: 'Log in to Schoology to keep your grades updating.' } });

// Returns 'ok', 'logged-out' or 'error'.
async function fetchAndRead() {
  let res;
  try {
    res = await fetch('/grades/grades', { credentials: 'same-origin' });
  } catch (e) {
    // Online but failed: Schoology sent us away to Microsoft sign-in.
    if (navigator.onLine) {
      await loggedOut();
      return 'logged-out';
    }
    await chrome.storage.local.set({ status: { ok: false, at: Date.now(), message: 'Offline. Grades will update when you reconnect.' } });
    return 'error';
  }
  try {
    if (/\/login/.test(new URL(res.url).pathname)) {
      await loggedOut();
      return 'logged-out';
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    if (doc.querySelector('input[type="password"]') && !doc.querySelector('.gradebook-course')) {
      await loggedOut();
      return 'logged-out';
    }
    await chrome.storage.local.set(gradesResult(BollesGrades.parseGrades(doc), BollesGrades.describeLayout(doc), `${location.origin}/grades/grades`, location.hostname));
    return 'ok';
  } catch (e) {
    await chrome.storage.local.set({ status: { ok: false, at: Date.now(), message: `Couldn’t load your grades page (${e.message}).` } });
    return 'error';
  }
}

async function run() {
  if (/^\/grades\/grades/.test(location.pathname)) {
    const data = BollesGrades.parseGrades(document);
    await chrome.storage.local.set(gradesResult(data, BollesGrades.describeLayout(document), location.href, location.hostname));
    return;
  }
  const { grades } = await chrome.storage.local.get('grades');
  if (!grades?.readAt || Date.now() - grades.readAt > REFRESH_MS) fetchAndRead();
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.type !== 'refresh-grades') return;
  fetchAndRead().then(reply);
  return true; // reply comes later
});

run();
