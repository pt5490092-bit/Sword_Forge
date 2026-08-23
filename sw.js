/* Sword Forge service worker.
   Caches the shell and the scripture data so the app opens offline after the
   first visit. Bump CACHE when you change any file. */
const CACHE = 'sword-forge-v1';
const ASSETS = [
  './', './index.html',
  './assets/styles.css',
  './assets/app.js',
  './assets/data/meta.json',
  './assets/data/bible.json',
  './assets/icon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // never cache the neural voice weights: they are large and the browser
  // already caches them itself
  if (url.hostname.includes('huggingface') || url.hostname.includes('jsdelivr')) return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res && res.status === 200 && url.origin === location.origin) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
