const CACHE_NAME = 'cx-notes-b1.21';
const OFFLINE_PAGE = 'index.html';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './set.html',
  './manifest.webmanifest',
  './style.css',
  './main.js',
  './fs.js',
  './languages.json',
  './lang/i18n-bg.json',
  './lang/i18n-en.json',
  './MNVLogo.png',
  './NoteFav.png',
  './Refresh.png',
  './Logout.png',
  './Snail.png',
  './GDrive.png',
  './Rabbit.png',
  './Database.png',
  './Folder.png',
  './Zip.png',
  './Notebook.png',
  './CXNotes48.png',
  './CXNotes72.png',
  './CXNotes96.png',
  './CXNotes144.png',
  './CXNotes180.png',
  './CXNotes384.png',
  './CXNotes192.png',
  './CXNotes512.png',
  './Board.png',
  './Frame.png',
  './Frame.jpg',
  './Note.jpg',
  './stl1_1.png',
  './stl2_1.png',
  './stl3_1.png',
  './wy1_1.png',
  './wb1_1.png',
  './wg1_1.png',
  './wr1_1.png',
  './lang/kb-core.json',
  './lang/kb-bg.json',
  './lang/kb-en.json',
  './msmstyle.css',
  './kb-assistant.css',
  './kb-assistant.js',
  './msmrt.js',
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
  // skipWaiting removed to allow application to prompt user before activation
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
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Only handle GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  const isNavigation = event.request.mode === 'navigate';

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // 1. If match in cache, return it
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. If not in cache, try network
      return fetch(event.request).then((networkResponse) => {
        return networkResponse;
      }).catch(() => {
        // 3. Fallback logic for offline/network failure
        if (isNavigation) {
          return caches.match('./index.html').then((fallback) => {
            return fallback || new Response('Offline: Page not found.', {
              status: 404,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
        }
        return new Response('Offline: Resource not found.', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' }
        });
      });
    })
  );
});
