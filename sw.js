// Offline support: serve the app shell from cache when the network is down,
// but always prefer the network so updates show up right away.
const CACHE = 'bolles-planner-v4';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'manifest.webmanifest',
  'icons/icon.svg',
  'js/account.js',
  'js/app.js',
  'js/compare.js',
  'js/config.js',
  'js/dates.js',
  'js/forms.js',
  'js/friends.js',
  'js/grades.js',
  'js/ical.js',
  'js/planner.js',
  'js/schedule.js',
  'js/store.js',
  'js/sync-merge.js',
  'js/ui.js',
  'js/workload.js',
  'js/data/bolles-2026-27.js',
  'js/data/letters-2026-27.js',
  'js/views/day.js',
  'js/views/friends.js',
  'js/views/grades.js',
  'js/views/month.js',
  'js/views/onboarding.js',
  'js/views/settings.js',
  'js/views/todo.js',
  'js/views/week.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
