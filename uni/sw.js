// ====== Конфигурация ======
const CACHE_VERSION = 'cx-notes-b1.15';
const APP_SHELL_CACHE = `cx-notes-shell-${CACHE_VERSION}`;
const STATIC_CACHE = `cx-notes-static-${CACHE_VERSION}`;
const SHARE_IMAGE_CACHE = 'share-target-image';

const OFFLINE_FALLBACK = './index.html';

// Основни файлове за стартиране на приложението (app shell)
const APP_SHELL_ASSETS = [
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
  './lang/kb-core.json',
  './lang/kb-bg.json',
  './lang/kb-en.json',
  './msmstyle.css',
  './kb-assistant.css',
  './kb-assistant.js',
  './msmrt.js'
];

// Статични ресурси (икони, изображения и др.)
const STATIC_ASSETS = [
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
  './CXNotes192.png',
  './CXNotes384.png',
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
  // големите примерни изображения може да се кешират „on demand“ при fetch,
  // но ако държиш да са офлайн, остави ги тук:
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
  './msm-ex/1764554540104.jpg'
];

// ====== Помощна лог функция (по желание) ======
function swLog(...args) {
  try {
    console.log('[SW]', ...args);
    const bc = new BroadcastChannel('sw_debug_channel');
    bc.postMessage({
      type: 'LOG',
      args: args.map(a => {
        try {
          return typeof a === 'object' ? JSON.stringify(a) : String(a);
        } catch (e) { return '[Unserializable Object]'; }
      })
    });
    bc.close();
  } catch (e) {
    // тихо падане
  }
}

// ====== INSTALL ======
self.addEventListener('install', (event) => {
  swLog('Install');
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(APP_SHELL_CACHE);
      await shellCache.addAll(APP_SHELL_ASSETS);

      const staticCache = await caches.open(STATIC_CACHE);
      await staticCache.addAll(STATIC_ASSETS);

      // веднага активиране на новия SW
      await self.skipWaiting();
    })()
  );
});

// ====== ACTIVATE ======
self.addEventListener('activate', (event) => {
  swLog('Activate');
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.map((key) => {
          if (
            key !== APP_SHELL_CACHE &&
            key !== STATIC_CACHE &&
            key !== SHARE_IMAGE_CACHE
          ) {
            swLog('Deleting old cache:', key);
            return caches.delete(key);
          }
        })
      );
      await self.clients.claim();
    })()
  );
});

// ====== MESSAGE (skipWaiting от клиента) ======
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ====== SHARE TARGET POST ======
self.addEventListener('fetch', (event) => {
  // само същия origin
  if (!event.request.url.startsWith(self.location.origin)) return;

  // --- Share Target POST handler ---
  if (event.request.method === 'POST') {
    const url = new URL(event.request.url);

    if (url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
      swLog('Share Target POST intercepted:', url.href);

      event.respondWith(handleShareTargetPost(event.request, url));
      return;
    }
  }

  // само GET оттук надолу
  if (event.request.method !== 'GET') return;

  const isNavigation = event.request.mode === 'navigate';
  event.respondWith(handleFetch(event.request, isNavigation));
});

// ====== Логика за Share Target ======
async function handleShareTargetPost(request, url) {
  try {
    const formData = await request.formData();
    const title = formData.get('shared_title') || '';
    const text = formData.get('shared_text') || '';
    const sharedUrl = formData.get('shared_url') || '';
    const imageFile = formData.get('shared_image');

    // Записваме изображението (ако има) в отделен cache
    if (imageFile && imageFile.size > 0) {
      swLog('Processing shared image:', imageFile.name, imageFile.size);
      const cache = await caches.open(SHARE_IMAGE_CACHE);
      const headers = new Headers({
        'Content-Type': imageFile.type || 'image/jpeg',
        'X-Filename': imageFile.name || `shared_${Date.now()}.jpg`
      });
      await cache.put('shared-image', new Response(imageFile, { headers }));
    }

    const clientsList = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true
    });

    const existingClient = clientsList.find((c) => {
      const clientUrl = new URL(c.url);
      const cPath = clientUrl.pathname.replace(/\/+$/, '').replace(/\/index\.html$/, '');
      const reqPath = url.pathname.replace(/\/+$/, '').replace(/\/index\.html$/, '');
      return clientUrl.origin === self.location.origin && reqPath.includes(cPath);
    });

    const sharePayload = {
      type: 'SHARE_TARGET_EVENT',
      data: {
        shared_title: title,
        shared_text: text,
        shared_url: sharedUrl,
        shared_image: (imageFile && imageFile.size > 0) ? '1' : '0'
      }
    };

    if (existingClient) {
      // 👉 Приложението вече работи:
      // - НЕ отваряме нов прозорец
      // - НЕ презареждаме бележките от GD
      swLog('Sending share data to existing client:', existingClient.url);
      existingClient.postMessage(sharePayload);

      // по желание – и през BroadcastChannel
      const bc = new BroadcastChannel('share_target_channel');
      bc.postMessage(sharePayload);
      bc.close();

      // затваряме празния прозорец, който Chrome е отворил за POST
      return new Response('<script>window.close()</script>', {
        headers: { 'Content-Type': 'text/html' }
      });
    }

    // 👉 НЯМА отворен клиент → отваряме нов прозорец
    const redirectUrl = new URL('/index.html', self.location.origin);
    if (title) redirectUrl.searchParams.set('shared_title', title);
    if (text) redirectUrl.searchParams.set('shared_text', text);
    if (sharedUrl) redirectUrl.searchParams.set('shared_url', sharedUrl);
    if (imageFile && imageFile.size > 0) {
      redirectUrl.searchParams.set('shared_image', '1');
    }

    swLog('No existing client, opening new window:', redirectUrl.toString());
    await self.clients.openWindow(redirectUrl.toString());

    return new Response('<script>window.close()</script>', {
      headers: { 'Content-Type': 'text/html' }
    });

  } catch (err) {
    swLog('CRITICAL ERROR in Share Target:', err.message);
    // Failsafe: просто redirect към index без данни
    return Response.redirect('./index.html', 303);
  }
}

// ====== Fetch стратегия ======
async function handleFetch(request, isNavigation) {
  const url = new URL(request.url);

  // 1) App shell / HTML навигации → network-first с fallback към cache
  if (isNavigation || request.destination === 'document') {
    try {
      const networkResponse = await fetch(request);
      // по желание: може да се обнови cache-а на index.html
      const cache = await caches.open(APP_SHELL_CACHE);
      cache.put(OFFLINE_FALLBACK, networkResponse.clone());
      return networkResponse;
    } catch (e) {
      const cached = await caches.match(OFFLINE_FALLBACK);
      if (cached) return cached;
      return new Response('Offline: Page not found.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }

  // 2) Статични ресурси → cache-first
  if (request.destination === 'style' ||
    request.destination === 'script' ||
    request.destination === 'image' ||
    request.destination === 'font') {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
      const networkResponse = await fetch(request);
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    } catch (e) {
      return new Response('Offline: Resource not found.', {
        status: 404,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
  }

  // 3) Всичко останало → опит за мрежа, fallback към cache ако има
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    return await fetch(request);
  } catch (e) {
    return new Response('Offline: Resource not found.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
