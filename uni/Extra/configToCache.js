Запис в IndexedDB + синхронизация към Cache

async function saveConfigToDB(config) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("MyAppDB", 1);
    request.onsuccess = async (event) => {
      const db = event.target.result;
      const tx = db.transaction("config", "readwrite");
      const store = tx.objectStore("config");
      store.put(config);

      tx.oncomplete = async () => {
        // Синхронизация към Cache API
        const cache = await caches.open("config-cache");
        const response = new Response(JSON.stringify(config), {
          headers: { "Content-Type": "application/json" }
        });
        await cache.put("/config.json", response);
        resolve();
      };
      tx.onerror = (err) => reject(err);
    };
    request.onerror = (err) => reject(err);
  });
}

Зареждане от IndexedDB или Cache

async function loadConfig() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("MyAppDB", 1);
    request.onsuccess = async (event) => {
      const db = event.target.result;
      const tx = db.transaction("config", "readonly");
      const store = tx.objectStore("config");
      const getReq = store.get("appConfig");

      getReq.onsuccess = async () => {
        if (getReq.result) {
          resolve(getReq.result);
        } else {
          // Ако няма данни в IndexedDB → възстанови от Cache
          const cache = await caches.open("config-cache");
          const response = await cache.match("/config.json");
          if (response) {
            const config = await response.json();
            resolve(config);
          } else {
            resolve(null);
          }
        }
      };
      getReq.onerror = (err) => reject(err);
    };
    request.onerror = (err) => reject(err);
  });
}

aveConfig да не приема директно обект config, а сама да вземе съдържанието от config store в твоята IndexedDB база NotesDB и да го запише в Cache API. Ето примерен код:

async function saveConfig() {
  // 1. Отваряме IndexedDB NotesDB
  const dbRequest = indexedDB.open("NotesDB", 1);

  return new Promise((resolve, reject) => {
    dbRequest.onsuccess = async (event) => {
      const db = event.target.result;

      // 2. Четем всички записи от object store "config"
      const tx = db.transaction("config", "readonly");
      const store = tx.objectStore("config");
      const getAllRequest = store.getAll();

      getAllRequest.onsuccess = async () => {
        const configData = getAllRequest.result;

        try {
          // 3. Записваме конфигурацията в Cache API
          const cache = await caches.open("config-cache");
          const response = new Response(JSON.stringify(configData), {
            headers: { "Content-Type": "application/json" }
          });
          await cache.put("/config.json", response);

          resolve(configData);
        } catch (err) {
          reject(err);
        }
      };

      getAllRequest.onerror = (err) => reject(err);
    };

    dbRequest.onerror = (err) => reject(err);
  });
}


Ето един примерен вариант как можеш да организираш автоматично синхронизиране на config store от IndexedDB (NotesDB) към Cache API, като използваш взаимодействие между app.js и sw.js

app.js
// Регистрация на service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js')
    .then(reg => console.log('Service Worker registered'))
    .catch(err => console.error('SW registration failed', err));
}

// Функция за запис в IndexedDB + известяване на SW
async function saveConfigToDB(config) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("NotesDB", 1);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction("config", "readwrite");
      const store = tx.objectStore("config");
      store.put(config);

      tx.oncomplete = () => {
        // Изпращаме съобщение към SW за обновяване на кеша
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            action: 'updateConfig',
            data: config
          });
        }
        resolve();
      };
      tx.onerror = (err) => reject(err);
    };
    request.onerror = (err) => reject(err);
  });
}

// Пример: извикване при промяна на настройките
document.getElementById("saveBtn").addEventListener("click", async () => {
  const config = { id: "appConfig", theme: "dark", lang: "bg" };
  await saveConfigToDB(config);
  console.log("Config записан и синхронизиран!");
});


sw.js

self.addEventListener('install', (event) => {
  console.log('SW installed');
});

self.addEventListener('activate', (event) => {
  console.log('SW activated');
});

// Приемане на съобщения от app.js
self.addEventListener('message', async (event) => {
  const { action, data } = event.data;
  if (action === 'updateConfig') {
    // Записваме конфигурацията в Cache API
    const cache = await caches.open('config-cache');
    const response = new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put('/config.json', response);
    console.log('Config кеширан от SW');
  }
});

// По желание: прихващане на fetch за /config.json
self.addEventListener('fetch', (event) => {
  if (event.request.url.endsWith('/config.json')) {
    event.respondWith(
      caches.open('config-cache').then(cache => cache.match('/config.json'))
    );
  }
});

