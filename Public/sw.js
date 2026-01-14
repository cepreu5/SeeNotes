const CACHE_NAME = 'multinotes-b1.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './msmstyle.css',
  './kb-assistant.css',
  './kb-assistantt.js',
  './msmrt.js',
  './mainn.js',
  './kb-data.txt',
  './msm/msm-assist.png',
  './user-icon.png',
  './msm/1.png',
  './msm/expl.png',
  './msm/l-up.png',
  './msm/r-up.png',
  './msm/l-down.png',
  './msm/r-down.png',
  './msm/l-up-w.png',
  './msm/r-up-w.png',
  './msm/l-down-w.png',
  './msm/r-down-w.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache assets individually for better error reporting and resilience
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url =>
          cache.add(url).catch(err => console.warn(`Failed to cache ${url}:`, err))
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== 'app-cache') {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  // --- FIX: Skip cross-origin requests (e.g. Google GSI, GDrive) to avoid 403/CORS or timeout issues ---
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached response if found, otherwise fetch from network
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
