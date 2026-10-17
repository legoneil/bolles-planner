const PLANNER = 'https://legoneil.github.io/bolles-planner/#/grades';
const GRADES = 'https://bolles.schoology.com/grades/grades';

const $ = (id) => document.getElementById(id);
const ago = (t) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
};

chrome.storage.local.get(['grades', 'status', 'layout']).then(({ grades, status, layout }) => {
  const el = $('status');
  if (status) {
    el.className = status.ok ? 'ok' : 'bad';
    el.textContent = `${status.message} (${ago(status.at)})`;
  }
  if (grades?.domain) $('open-grades').dataset.url = `https://${grades.domain}/grades/grades`;
  $('copy-debug').hidden = !layout;
  $('copy-debug').onclick = async () => {
    await navigator.clipboard.writeText(`Bolles Planner extension debug\n${status?.message ?? ''}\n\n${layout}`);
    $('copy-debug').textContent = 'Copied. Paste it to Claude.';
  };
});

$('open-grades').onclick = (e) => chrome.tabs.create({ url: e.target.dataset.url ?? GRADES });
$('open-planner').onclick = () => chrome.tabs.create({ url: PLANNER });
