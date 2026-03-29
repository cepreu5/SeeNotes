const CACHE_NAME = 'multinotes-b1.96';
const ASSETS_TO_CACHE = [
  './',
  './index-2.html',
  './style.css',
  './lang/i18n-bg.json',
  './lang/i18n-en.json',
  './lang/i18n-ru.json',
  './msmstyle.css',
  './kb-assistant.css',
  './kb-assistantt.js',
  './msmrtt.js',
  './mainn.js',
  './lang/kb-core.json',
  './lang/kb-bg.json',
  './lang/kb-en.json',
  './lang/kb-ru.json',
  './lang/index-bg.json',
  './lang/index-en.json',
  './lang/index-ru.json',
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
  './msm-ex/1764553984943.jpg'
];
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url =>
          fetch(url, { cache: 'reload' }).then(response => {
            if (!response.ok) throw new Error(`Network response was not ok for ${url}`);
            return cache.put(url, response);
          }).catch(err => console.warn(`Failed to cache ${url}:`, err))
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
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(event.request).then((cachedResponse) => {
        // Return cached response if found, otherwise fetch from network
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(event.request);
      });
    })
  );
});
