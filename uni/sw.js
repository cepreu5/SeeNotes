const CACHE_NAME = 'cx-notes-b1.14';
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

function swLog(...args) {
  try {
    console.log(...args);
    const bc = new BroadcastChannel('sw_debug_channel');
    bc.postMessage({
      type: 'LOG',
      args: args.map(a => {
        try {
          return typeof a === 'object' ? JSON.stringify(a) : String(a);
        } catch (e) { return "[Unserializable Object]"; }
      })
    });
    bc.close();
  } catch (e) {
    console.error('swLog failed:', e);
  }
}

self.addEventListener('install', (event) => {
  swLog('[SW] Install event triggered.');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        ASSETS_TO_CACHE.map(url =>
          cache.add(url).catch(err => swLog(`Failed to cache ${url}:`, err))
        )
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  swLog('[SW] Activate event triggered.');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== 'app-cache' && cacheName !== 'share-target-image') {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      swLog('[SW] Activated and claiming clients...');
      return self.clients.claim();
    })
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
  // --- Share Target POST handler ---
  if (event.request.method === 'POST') {
    const url = new URL(event.request.url);
    if (url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
      swLog('[SW] Share Target POST request intercepted:', url.href);

      event.respondWith((async () => {
        try {
          const formData = await event.request.formData();
          const title = formData.get('shared_title') || '';
          const text = formData.get('shared_text') || '';
          const sharedUrl = formData.get('shared_url') || '';
          const imageFile = formData.get('shared_image');

          // Build redirect URL for fallback
          const redirectUrl = new URL(url.pathname, self.location.origin);
          if (title) redirectUrl.searchParams.set('shared_title', title);
          if (text) redirectUrl.searchParams.set('shared_text', text);
          if (sharedUrl) redirectUrl.searchParams.set('shared_url', sharedUrl);

          // Store image if present
          if (imageFile && imageFile.size > 0) {
            swLog('[SW] Processing shared image...', imageFile.name, imageFile.size);
            const cache = await caches.open('share-target-image');
            const headers = new Headers({
              'Content-Type': imageFile.type || 'image/jpeg',
              'X-Filename': imageFile.name || `shared_${Date.now()}.jpg`
            });
            await cache.put('shared-image', new Response(imageFile, { headers }));
            redirectUrl.searchParams.set('shared_image', '1');
          }

          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          swLog('[SW] Found active clients:', clients.length);

          let existingClient = clients.find(c => {
            const clientUrl = new URL(c.url);
            const reqPath = url.pathname.replace(/\/+$/, '');
            const cPath = clientUrl.pathname.replace(/\/+$/, '').replace(/\/index\.html$/, '');
            return clientUrl.origin === self.location.origin && reqPath.includes(cPath);
          });

          if (!existingClient && clients.length > 0) existingClient = clients[0];

          if (existingClient) {
            swLog('[SW] Targeting client:', existingClient.url);

            // Пробваме да фокусираме, но ако браузърът го блокира - не сриваме целия процес
            try {
              await existingClient.focus();
            } catch (focusErr) {
              swLog('[SW] Focus blocked by browser (continuing anyway):', focusErr.message);
            }

            const shareData = {
              type: 'SHARE_TARGET_EVENT',
              data: {
                shared_title: title,
                shared_text: text,
                shared_url: sharedUrl,
                shared_image: (imageFile && imageFile.size > 0) ? '1' : '0'
              }
            };
            existingClient.postMessage(shareData);
            const bc = new BroadcastChannel('share_target_channel');
            bc.postMessage(shareData);
            bc.close();

            // Вместо 204 (което на Desktop оставя празен прозорец), връщаме скрипт за самозатваряне
            return new Response('<script>window.close()</script>', {
              headers: { 'Content-Type': 'text/html' }
            });
          }

          swLog('[SW] Redirecting to new instance.');
          return Response.redirect(redirectUrl.toString(), 303);

        } catch (err) {
          swLog('[SW] CRITICAL ERROR in Share Target:', err.message);
          // Failsafe: just redirect to index without shared data rather than showing error page
          return Response.redirect('./index.html', 303);
        }
      })());
      return;
    }
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
