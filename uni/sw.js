const CACHE_NAME = 'multinotes-b1.91';
const ASSETS_TO_CACHE = [
  './',
  './index-2.html',
  './style.css',
  './msmstyle.css',
  './kb-assistant.css',
  './kb-assistantt.js',
  './msmrtt.js',
  './mainn.js',
  './kb-core.json',
  './kb-bg.json',
  './kb-en.json',
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
  './msm-ex/1764551652828.jpg',
  './msm-ex/1764551676242.jpg',
  './msm-ex/1764551691209.jpg',
  './msm-ex/1764551755697.jpg',
  './msm-ex/1764553894822.jpg',
  './msm-ex/1764553917946.jpg',
  './msm-ex/1764553933512.jpg',
  './msm-ex/1764553941918.jpg',
  './msm-ex/1764553952897.jpg',
  './msm-ex/1764553963870.jpg',
  './msm-ex/1764553974033.jpg',
  './msm-ex/1764553984943.jpg',
  './msm-ex/1764553993077.jpg',
  './msm-ex/1764554001197.jpg',
  './msm-ex/1764554007494.jpg',
  './msm-ex/1764554013461.jpg',
  './msm-ex/1764554019417.jpg',
  './msm-ex/1764554055674.jpg',
  './msm-ex/1764554064490.jpg',
  './msm-ex/1764554083159.jpg',
  './msm-ex/1764554091671.jpg',
  './msm-ex/1764554098238.jpg',
  './msm-ex/1764554106965.jpg',
  './msm-ex/1764554137382.jpg',
  './msm-ex/1764554248286.jpg',
  './msm-ex/1764554317449.jpg',
  './msm-ex/1764554407319.jpg',
  './msm-ex/1764554540104.jpg',
];

self.addEventListener('install', (event) => {
  // Don't call skipWaiting() here - wait for user confirmation via SKIP_WAITING message
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
