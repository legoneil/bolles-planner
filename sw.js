// Offline support: serve the app shell from cache when the network is down,
// but always prefer the network so updates show up right away.
const CACHE = 'bolles-planner-v11';
const SHELL = [
  './',
  'index.html',
  'privacy.html',
  'css/app.css',
  'fonts/inter-latin.woff2',
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
  'js/invite.js',
  'js/ical.js',
  'js/notify.js',
  'js/planner.js',
  'js/reminders.js',
  'js/schedule.js',
  'js/store.js',
  'js/study.js',
  'js/sync-merge.js',
  'js/ui.js',
  'js/workload.js',
  'js/vendor/qrcode.mjs',
  'js/data/bolles-2026-27.js',
  'js/data/letters-2026-27.js',
  'js/views/day.js',
  'js/views/friends.js',
  'js/views/grades.js',
  'js/views/month.js',
  'js/views/onboarding.js',
  'js/views/plan.js',
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

// Reminders from the server (supabase/functions/push).
self.addEventListener('push', (e) => {
  let msg = {};
  try {
    msg = e.data?.json() ?? {};
  } catch {
    msg = { body: e.data?.text() ?? '' };
  }
  e.waitUntil(
    self.registration.showNotification(msg.title || 'Rotation Planner', {
      body: msg.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/badge.png',
      tag: msg.tag,
      data: { url: msg.url || '#/today' },
    }),
  );
});

// Tapping a reminder opens the planner on the right page.
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL(e.notification.data?.url ?? '#/today', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) return open.focus().then((w) => w.navigate?.(url) ?? w);
      return self.clients.openWindow(url);
    }),
  );
});
