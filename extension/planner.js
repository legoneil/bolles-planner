// Runs on the Rotation Planner website. Hands the grades the extension read
// from Schoology to the planner page, and keeps the private link key the
// planner gives it so the extension can send new grades to the account
// directly (see background.js).

const ORIGIN = location.origin;

async function send() {
  const { grades, status, link } = await chrome.storage.local.get(['grades', 'status', 'link']);
  window.postMessage(
    {
      source: 'bolles-planner-extension',
      type: 'grades',
      version: chrome.runtime.getManifest().version,
      grades: grades ?? null,
      status: status ?? null,
      canLink: true,
      linkedUser: link?.userId ?? null,
      linkSentAt: link?.sentAt ?? null,
    },
    ORIGIN,
  );
}

window.addEventListener('message', async (e) => {
  if (e.source !== window || e.origin !== ORIGIN || e.data?.source !== 'bolles-planner-app') return;
  const msg = e.data;
  if (msg.type === 'request-grades') send();
  else if (msg.type === 'link' && /^[0-9a-f]{64}$/.test(msg.token) && typeof msg.userId === 'string' && /^https:\/\/[a-z0-9.-]+$/.test(msg.url)) {
    await chrome.storage.local.set({ link: { token: msg.token, userId: msg.userId, url: msg.url, anonKey: String(msg.anonKey ?? '') } });
  } else if (msg.type === 'unlink') {
    await chrome.storage.local.remove('link');
  } else if (msg.type === 'refresh-now') {
    chrome.runtime.sendMessage({ type: 'refresh-now' }).catch(() => {});
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.grades || changes.status || changes.link)) send();
});

send();
