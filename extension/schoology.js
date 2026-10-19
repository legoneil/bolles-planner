// Runs on Schoology pages you're logged into. On your grades page
// (/grades/grades) it reads your grades right away; the background worker
// (background.js) also refreshes them every 30 minutes.

async function run() {
  if (!/^\/grades\/grades/.test(location.pathname)) {
    // Elsewhere on Schoology: a good moment for the background worker to refresh.
    chrome.runtime.sendMessage({ type: 'schoology-visit', domain: location.hostname }).catch(() => {});
    return;
  }
  const data = BollesGrades.parseGrades(document);
  await chrome.storage.local.set(gradesResult(data, BollesGrades.describeLayout(document), location.href, location.hostname));
}

run();
