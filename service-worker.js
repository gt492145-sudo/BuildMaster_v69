const CACHE_VERSION = 'buildmaster-v80-sw-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './site.webmanifest',
  './favicon-32.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './logo-app.png',
  './app-wallpaper.jpg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(CORE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_VERSION)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Keep HTML fresh but allow offline fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => {
          const cloned = response.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(request, cloned));
          return response;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // Cache-first for static assets and data files.
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        const cloned = response.clone();
        caches.open(CACHE_VERSION).then(cache => cache.put(request, cloned));
        return response;
      });
    })
  );
});
