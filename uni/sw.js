const CACHE_NAME = 'cx-notes-b3.06';
const OFFLINE_PAGE = 'index.html';
// Демо режимът (index.html?demo=1) не минава през кеша: данните му живеят само в IndexedDB
// (NotesDB-demo) и нищо не се записва тук. Fetch handler-ът пропуска cross-origin заявки,
// а демото не прави такива — така че кешът не пречи на отварянето на демото. При напълно
// първо отваряне без мрежа (преди който и да е онлайн старт) страницата не е в кеша, но това
// важи за приложението като цяло, не само за демото.
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
  './msmstyle.css',
  './msm.js',
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
// Асистентът се зарежда при първо отваряне (ensureKBAssistant в main.js), затова
// файловете му не са в предкеша, а влизат в кеша при първото ползване.
const LAZY_ASSETS = [
  './kb-assistant.js',
  './kb-assistant.css',
  './lang/kb-core.json',
  './lang/kb-bg.json',
  './lang/kb-en.json',
  './lang/kb-tour-core.json',
  './lang/kb-tour-bg.json',
  './lang/kb-tour-en.json',
];
const LAZY_ASSET_URLS = LAZY_ASSETS.map(url => new URL(url, self.location.href).href);

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
  // Start caching assets without blocking the page load
  caches.open(CACHE_NAME).then((cache) => {
    return Promise.allSettled(
      ASSETS_TO_CACHE.map(url =>
        cache.add(url).catch(err => swLog(`Failed to cache ${url}:`, err))
      )
    );
  });
  // Без поемане на контрола при install: новият SW изчаква. main.js го пуска
  // (SKIP_WAITING) веднага щом страницата се зареди, ако потребителят още не е
  // пипал приложението - тогава обикновен refresh вдига версията. Ако вече се
  // работи в приложението, банерът изчаква натискането на Refresh now.
  // НЕ връщай self.skipWaiting() тук (виж projects/seenotes-sw-update в паметта).
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
  // main.js чете версията на приложението от CACHE_NAME (отговор през MessageChannel).
  if (event.data && event.data.type === 'GET_VERSION' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ type: 'VERSION', cacheName: CACHE_NAME });
  }
  // Изпраща се след първото успешно зареждане на асистента: допълва липсващите
  // му файлове (напр. другия езиков KB файл), за да работи и офлайн.
  if (event.data && event.data.type === 'CACHE_KB_ASSETS') {
    event.waitUntil(caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        LAZY_ASSETS.map(url => cache.match(url).then(hit => hit || cache.add(url)))
      );
    }));
  }
});

self.addEventListener('fetch', (event) => {
  // Skip cross-origin requests
  if (!event.request.url.startsWith(self.location.origin)) {
    return;
  }
  // --- Share Target POST handler ---
  // Ред: първо записваме споделеното в кеша (трайно), после пробваме да го дадем на
  // отворен прозорец. Прозорецът на споделянето се затваря САМО след като приложението
  // потвърди, че е приело данните. Ако потвърждение няма (замразен или убит фон), отваряме
  // приложението с ?share_id=<id> и то взима данните от кеша. Така линк или снимка не се губи.
  if (event.request.method === 'POST') {
    const url = new URL(event.request.url);
    if (url.pathname.endsWith('/index.html') || url.pathname.endsWith('/')) {
      event.respondWith((async () => {
        const redirectToApp = (sid) => {
          const target = new URL(url.pathname || './index.html', self.location.origin);
          if (sid) target.searchParams.set('share_id', sid);
          return Response.redirect(target.toString(), 303);
        };
        try {
          const formData = await event.request.formData();
          const title = (formData.get('shared_title') || '').toString();
          const text = (formData.get('shared_text') || '').toString();
          const sharedUrl = (formData.get('shared_url') || '').toString();
          const imageFiles = formData.getAll('shared_image').filter(f => f && f.size > 0);
          const sid = 'sh-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

          const cache = await caches.open('share-target-image');
          const staleKeys = await cache.keys();
          await Promise.all(staleKeys.map(k => cache.delete(k)));

          const files = [];
          for (let i = 0; i < imageFiles.length; i++) {
            const f = imageFiles[i];
            const key = 'shared-file-' + i;
            const name = f.name || ('shared_' + Date.now() + '_' + i);
            const headers = new Headers({
              'Content-Type': f.type || 'application/octet-stream',
              'X-Filename': encodeURIComponent(name)
            });
            await cache.put(key, new Response(f, { headers }));
            files.push({ key: key, name: name, type: f.type || 'application/octet-stream' });
          }

          const payload = { sid: sid, title: title, text: text, url: sharedUrl, files: files, ts: Date.now() };
          await cache.put('share-payload', new Response(JSON.stringify(payload), {
            headers: { 'Content-Type': 'application/json' }
          }));
          swLog('[SW] Share stored:', sid, files.length, 'file(s)');

          // Колко чакаме отворен прозорец да потвърди, че е приел споделеното.
          const ACK_TIMEOUT_MS = 3000;
          const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
          let existingClient = clients.find(c => {
            const clientUrl = new URL(c.url);
            const reqPath = url.pathname.replace(/\/+$/, '');
            const cPath = clientUrl.pathname.replace(/\/+$/, '').replace(/\/index\.html$/, '');
            return clientUrl.origin === self.location.origin && reqPath.includes(cPath);
          });
          if (!existingClient && clients.length > 0) existingClient = clients[0];

          if (existingClient && existingClient.postMessage) {
            const acked = await new Promise((resolve) => {
              let settled = false;
              const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
              const timer = setTimeout(() => finish(false), ACK_TIMEOUT_MS);
              const channel = new MessageChannel();
              channel.port1.onmessage = (msg) => {
                if (msg.data && msg.data.type === 'SHARE_TARGET_ACK') {
                  clearTimeout(timer);
                  finish(msg.data.sid === sid || !msg.data.sid);
                }
              };
              try {
                existingClient.postMessage({ type: 'SHARE_TARGET_EVENT', data: { sid: sid } }, [channel.port2]);
              } catch (postErr) {
                swLog('[SW] postMessage to client failed:', postErr.message);
                clearTimeout(timer);
                finish(false);
              }
            });

            if (acked) {
              try {
                await existingClient.focus();
              } catch (focusErr) {
                swLog('[SW] Focus blocked by browser (continuing anyway):', focusErr.message);
              }
              return new Response(
                '<!doctype html><meta charset="utf-8"><title>CX Notes</title>' +
                '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;' +
                'background:#000;color:#eee;font:16px system-ui,sans-serif"><div>Записано в CX Notes</div>' +
                '<script>setTimeout(function(){try{window.close()}catch(e){}},250)<\/script>',
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
              );
            }
            swLog('[SW] No confirmation from the open window - opening the app instead.');
          }

          return redirectToApp(sid);
        } catch (err) {
          swLog('[SW] CRITICAL ERROR in Share Target:', err.message);
          return redirectToApp(null);
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
  // Адресът на споделянето носи ?share_id= - кешът да го търси без параметрите.
  const hasShareId = new URL(event.request.url).searchParams.has('share_id');

  event.respondWith(
    caches.match(event.request, { ignoreSearch: hasShareId }).then((cachedResponse) => {
      // 1. If match in cache, return it
      if (cachedResponse) {
        return cachedResponse;
      }

      // 2. If not in cache, try network
      return fetch(event.request).then((networkResponse) => {
        if (networkResponse.ok && LAZY_ASSET_URLS.includes(event.request.url)) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        }
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
