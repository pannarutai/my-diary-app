// Lets the app open without internet. Bump the version number whenever app files change (Life RPG in rpg/ included).
// Every download here skips the browser's own 10-minute copy, so a new version is never mixed with old files.
const CACHE = 'diary-v7';
const ASSETS = ['./', 'index.html', 'styles.css', 'todo.js', 'reflect.js', 'app.js', 'manifest.webmanifest', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'rpg/', 'rpg/index.html', 'rpg/styles.css', 'rpg/data.js', 'rpg/app.js', 'rpg/icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // Only this app's old caches: other apps on the same web address (Life RPG) keep theirs.
      .then(keys => Promise.all(keys.filter(k => k.startsWith('diary-') && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Answer from the cache first, then refresh the cache from the network in the background.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const hit = await cache.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request.url, { cache: 'no-cache' }).then(res => {
      if (res.ok) cache.put(e.request, res.clone());
      return res;
    }).catch(() => hit);
    return hit || net;
  }));
});

// Tapping a reminder notification brings the app to the front.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => 'focus' in c);
    return open ? open.focus() : self.clients.openWindow('./');
  }));
});
