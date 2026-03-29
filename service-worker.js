const CACHE_VERSION = 'buildmaster-v833-sw-v43';
const CORE_ASSETS = [
  './',
  './index.html',
  './stake.html',
  './site.webmanifest',
  './logo-app.png',
  './styles/app-layout.css',
  './styles/blueprint-core.css',
  './styles/app-panels.css',
  './styles/blueprint-effects.css',
  './styles/app-overlays.css',
  './styles/weather-effects.css',
  './styles/app-responsive.css',
  './scripts/modules/shared-ui.js',
  './scripts/modules/calc-pages.js',
  './scripts/modules/stake-page.js',
  './scripts/modules/navigation.js',
  './scripts/core/core-bootstrap.js',
  './scripts/features/materials-weather.js',
  './scripts/features/measurement-logs.js',
  './scripts/features/bim-qa.js',
  './scripts/features/blueprint-measurement.js',
  './scripts/features/calc-engine.js',
  './scripts/features/app-shell.js',
  './scripts/app-main.js'
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
  if (url.pathname.startsWith('/api/')) return;

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
