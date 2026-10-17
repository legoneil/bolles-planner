// Runs on the Bolles Planner website. Hands the grades the extension read
// from Schoology to the planner page, which saves them to your account.

const ORIGIN = location.origin;

async function send() {
  const { grades, status } = await chrome.storage.local.get(['grades', 'status']);
  window.postMessage(
    { source: 'bolles-planner-extension', type: 'grades', version: chrome.runtime.getManifest().version, grades: grades ?? null, status: status ?? null },
    ORIGIN,
  );
}

window.addEventListener('message', (e) => {
  if (e.source !== window || e.origin !== ORIGIN) return;
  if (e.data?.source === 'bolles-planner-app' && e.data.type === 'request-grades') send();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.grades || changes.status)) send();
});

send();
