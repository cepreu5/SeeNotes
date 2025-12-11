const CACHE_NAME = 'seenotes-v0.1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './kb-data.txt',
  './msm.js',
  './msm/msm-assist.png',
  './user-Icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache assets
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached response if found, otherwise fetch from network
      // If network fails (e.g., offline), we fall back to cache for navigational requests or other critical assets logic if needed
      // But for now, basic cache-first or network-first-fallback-to-cache is better.
      // Let's do Network First, Fallback to Cache for logic files, Cache First for images could be better?
      // Given the user's offline issue, Cache First for static assets is safest.

      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request);
    })
  );
});
