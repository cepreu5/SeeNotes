async function exportConfig() {
  const dbName = NOTES_DB_NAME;
  const storeName = CONFIG_STORE_NAME;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = (event) => {
      const db = event.target.result;
      const tx = db.transaction(storeName, "readonly");
      const store = tx.objectStore(storeName);
      const cursorRequest = store.openCursor();
      const results = [];

      cursorRequest.onsuccess = e => {
        const cursor = e.target.result;
        if (cursor) {
          // Проверяваме дали store-ът има keyPath.
          // --- КОРЕКЦИЯ: Пропускаме FileSystemDirectoryHandle обекти, тъй като не са сериализуеми ---
          if (cursor.value && cursor.value.kind === 'directory') {
            console.log(`Skipping non-serializable FileSystemDirectoryHandle for key: ${cursor.key}`);
            cursor.continue();
            return;
          }
          // Запазваме и ключа, и стойността.
          results.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        } else {
          // Курсорът е стигнал до края, всички данни са прочетени.
          db.close();
          resolve(results);
        }
      };

      cursorRequest.onerror = (err) => {
        db.close();
        reject(err);
      };
    };
    request.onerror = (err) => reject(err);
  });
}
