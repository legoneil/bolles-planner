// Runs on Schoology pages you're logged into. Reads your grades page (the one
// you'd see at /grades/grades) and saves it for Bolles Planner. Nothing is
// sent anywhere except into the planner tab you open yourself.

const REFRESH_MS = 30 * 60 * 1000;

async function save(result) {
  await chrome.storage.local.set(result);
}

async function readFrom(doc, url) {
  const data = BollesGrades.parseGrades(doc);
  if (!data.courses.length) {
    await save({
      status: { ok: false, at: Date.now(), message: 'Couldn’t find any courses on the grades page.' },
      layout: BollesGrades.describeLayout(doc),
    });
    return;
  }
  const withPercent = data.courses.filter((c) => c.percent !== null).length;
  await save({
    grades: { ...data, url, domain: location.hostname },
    status: { ok: true, at: Date.now(), message: `Read ${data.courses.length} courses (${withPercent} with percentages).` },
    // Grade-free outline, kept so "Copy debug info" works even when reading succeeds.
    layout: BollesGrades.describeLayout(doc),
  });
}

async function run() {
  const onGradesPage = /^\/grades\/grades/.test(location.pathname);
  if (onGradesPage) return readFrom(document, location.href);

  // Elsewhere on Schoology: refresh in the background now and then.
  const { status } = await chrome.storage.local.get('status');
  if (status?.at && Date.now() - status.at < REFRESH_MS) return;
  try {
    const res = await fetch('/grades/grades', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
    await readFrom(doc, `${location.origin}/grades/grades`);
  } catch (e) {
    await save({ status: { ok: false, at: Date.now(), message: `Couldn’t load your grades page (${e.message}).` } });
  }
}

run();
