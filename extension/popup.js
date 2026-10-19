const PLANNER = 'https://legoneil.github.io/bolles-planner/#/grades';
const GRADES = 'https://bolles.schoology.com/grades/grades';

const $ = (id) => document.getElementById(id);
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

$('version').textContent = `v${chrome.runtime.getManifest().version}`;

function show({ grades, status, layout, link }) {
  const el = $('status');
  if (status) {
    el.className = status.ok ? 'ok' : 'bad';
    el.textContent = `${status.message} (${ago(status.at)})`;
  }
  $('link').textContent = link?.token
    ? link.error
      ? `Couldn’t send to your planner account: ${link.error}`
      : link.sentAt
        ? `Sent to your planner account ${ago(link.sentAt)}.`
        : 'Linked to your planner account.'
    : 'Open Bolles Planner once while signed in so new grades go to your account (and your phone).';
  if (grades?.domain) $('open-grades').dataset.url = `https://${grades.domain}/grades/grades`;
  $('copy-debug').hidden = !layout;
  $('copy-debug').onclick = async () => {
    await navigator.clipboard.writeText(`Bolles Planner extension debug\n${status?.message ?? ''}\n\n${layout}`);
    $('copy-debug').textContent = 'Copied. Paste it to Claude.';
  };
}

const load = () => chrome.storage.local.get(['grades', 'status', 'layout', 'link']).then(show);
load();
chrome.storage.onChanged.addListener(load);

$('refresh').onclick = () => {
  $('refresh').textContent = 'Refreshing…';
  chrome.runtime.sendMessage({ type: 'refresh-now' }).catch(() => {});
  setTimeout(() => ($('refresh').textContent = 'Refresh now'), 3000);
};
$('open-grades').onclick = (e) => chrome.tabs.create({ url: e.target.dataset.url ?? GRADES });
$('open-planner').onclick = () => chrome.tabs.create({ url: PLANNER });
