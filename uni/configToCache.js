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
