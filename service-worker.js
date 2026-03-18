const CACHE_VERSION = 'buildmaster-v80-sw-v35';
const CORE_ASSETS = [
  './',
  './index.html',
  './modules/v80-core-utils.js',
  './modules/v80-export-mod.js',
  './modules/v80-auth-mod.js',
  './modules/v80-member-mod.js',
  './modules/v80-audit-snapshot-mod.js',
  './modules/v80-unit-mod.js',
  './modules/v80-ibm-key-mod.js',
  './modules/v80-ifc-core-mod.js',
  './modules/v80-bim-rules-mod.js',
  './modules/v80-bim-estimate-mod.js',
  './modules/v80-layout-core-mod.js',
  './modules/v80-layout-qa-mod.js',
  './modules/v80-layout-geom-mod.js',
  './modules/v80-layout-pipeline-mod.js',
  './modules/v80-survey-math-mod.js',
  './modules/v80-survey-toolkit-mod.js',
  './modules/v80-weather-mod.js',
  './modules/v80-material-mod.js',
  './modules/v80-advanced-estimate-mod.js',
  './modules/v80-list-core-mod.js',
  './modules/v80-app-core-mod.js',
  './modules/v80-calc-core-mod.js',
  './modules/v80-qa-quantum-mod.js',
  './modules/v80-blueprint-ai-mod.js',
  './modules/v80-viewport-interaction-mod.js',
  './modules/v80-ui-coach-mod.js',
  './modules/v80-device-ai-mod.js',
  './modules/v80-bootstrap-bindings-mod.js',
  './modules/v80-runtime-state-mod.js',
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
