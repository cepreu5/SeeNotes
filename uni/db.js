    /**
     * Обработва изтриването на бележка.
     * @param {HTMLElement} noteEl - DOM елементът на бележката.
     * @param {Event} e - Обектът на събитието.
     * @param {boolean} fromModal - Дали функцията се извиква от модалния прозорец.
     */
    async function handleNoteDelete(noteEl, e, fromModal = false) {
        e.stopPropagation();
        e.preventDefault();

        if (!useIndexedDb) return; // Изтриването работи само с база данни

        const extraInfo = JSON.parse(noteEl.dataset.extraInfo || '{}');
        const noteGdid = extraInfo.gdid;
        if (!noteGdid) return;

        const confirmed = await showConfirmation(_('confirmNoteDelete'));
        if (confirmed) {
            try {
                await deleteFromDB(NOTE_STORE_NAME, noteGdid);
                noteEl.remove();

                // Ако е извикано от модала, затваряме го
                if (fromModal) {
                    document.getElementById('content-modal').classList.remove('visible');
                }

                // Актуализираме общия брояч
                const noteCounter = document.getElementById('note-counter');
                if (noteCounter) noteCounter.textContent = parseInt(noteCounter.textContent, 10) - 1;

                // Актуализираме брояча на борда
                const boardIdOfDeletedNote = extraInfo.boardid;
                const boardGdid = boardsData.find(b => b.id == boardIdOfDeletedNote)?.gdid || boardIdOfDeletedNote;
                if (boardGdid) {
                    const boardButton = document.querySelector(`.board-filter-link[data-boardid="${boardGdid}"]`);                    
                    if (boardButton) {
                        const match = boardButton.textContent.match(/(.*)\s\((\d+)\)/);
                        if (match) {
                            const boardName = match[1];
                            const currentCount = parseInt(match[2], 10);
                            boardButton.textContent = (currentCount > 1) ? `${boardName} (${currentCount - 1})` : boardName;
                        }
                    }
                }

                allNotesData = allNotesData.filter(n => n.gdid !== noteGdid);
                showToast(_('noteDeletedSuccess'), 3000);
            } catch (error) {
                console.error("Failed to delete note:", error);
                showToast(_('noteDeletedError') + " - " + error.message, 15000);
            }
        }
    }

    async function createColoredNoteBackground(color, src, width, height) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.src = (src >= 0 && src < noteBackgrounds.length)
                ? noteBackgrounds[src]
                : 'stl1_1.png';
            image.onload = () => {
                const canvas = document.createElement('canvas');
                const w = canvas.width = width;
                const h = canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, w, h);
                ctx.globalCompositeOperation = 'destination-in';
                ctx.drawImage(image, 0, 0, w, h);
                ctx.globalCompositeOperation = 'multiply';
                ctx.drawImage(image, 0, 0, w, h);
                resolve(canvas); // Return the canvas element directly
            };
            image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        });
    }

/**
 * Отваря IndexedDB базата данни.
 * @returns {Promise<IDBDatabase>}
 */
function openNotesDB() {
    // --- КОРЕКЦИЯ: Предотвратяване на множество отворени връзки ---
    // Ако вече имаме отворена и валидна връзка, използваме нея,
    // вместо да отваряме нова, която може да блокира изтриването.
    if (window.db && window.db.version) {
        return Promise.resolve(window.db);
    }
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(NOTES_DB_NAME, NOTES_DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(BOARD_STORE_NAME)) {
                db.createObjectStore(BOARD_STORE_NAME, { keyPath: 'gdid' });
            }
            if (!db.objectStoreNames.contains(MEDIA_STORE_NAME)) {
                db.createObjectStore(MEDIA_STORE_NAME, { keyPath: 'gdid' });
            }
            if (!db.objectStoreNames.contains(NOTE_STORE_NAME)) {
                db.createObjectStore(NOTE_STORE_NAME, { keyPath: 'gdid' });
            }
            if (!db.objectStoreNames.contains(CONFIG_STORE_NAME)) {
                db.createObjectStore(CONFIG_STORE_NAME);
            }
            console.log("NotesDB structure is up to date.");
        };
        request.onsuccess = (event) => {
            // Запазваме отворената връзка в глобална променлива
            window.db = event.target.result;
            resolve(window.db);
        };
        request.onerror = (event) => reject("Error opening NotesDB: " + event.target.errorCode);
    });
}

/**
 * Записва (или обновява) масив от обекти в даден store.
 * @param {string} storeName - Името на object store.
 * @param {Array<Object>} data - Масив от данни за запис.
 * @param {boolean} incremental - Ако е true, не изчиства store-a преди запис (put).
 * @returns {Promise<void>}
 */
async function bulkPutDB(storeName, data, incremental = false) {
    // Ако данните не са масив, ги превръщаме в такъв.
    if (data && !Array.isArray(data)) {
        data = [data];
    }
    if (!data || data.length === 0) return;
    const db = await openNotesDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const putData = () => {
            data.forEach(item => {
                store.put(item);
            });
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject("DB Transaction Error: " + event.target.error);
        if (incremental) {
            putData();
        } else {
            store.clear().onsuccess = putData;
        }
    });
}

/**
 * Извлича всички записи от даден store.
 * @param {string} storeName - Името на object store.
 * @returns {Promise<Array<Object>>}
 */
async function getAllFromDB(storeName) {
    const db = await openNotesDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(`Error in getAllFromDB (${storeName}): ` + event.target.error);
    });
}

/**
 * Извлича единичен запис от даден store по ключ.
 * @param {string} storeName - Името на object store.
 * @param {any} key - Ключът на записа за извличане.
 * @returns {Promise<Object|undefined>}
 */
async function getFromDB(storeName, key) {
    const db = await openNotesDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(`Error in getFromDB (${storeName}): ` + event.target.error);
    });
}

/**
 * Запазва стойност в config store-a.
 * @param {string} key - Ключ (напр. 'directoryHandle', 'lastLocalTimestamp').
 * @param {*} value - Стойността за запис.
 */
async function saveConfig(key, value) {
    const db = await openNotesDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIG_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(CONFIG_STORE_NAME);
        const request = store.put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject('Error saving to config: ' + event.target.error);
    });
}

/**
 * Извлича стойност от config store-a.
 * @param {string} key - Ключът за извличане.
 * @returns {Promise<*>} - Стойността или undefined, ако не съществува.
 */
async function getConfig(key) {
    const db = await openNotesDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIG_STORE_NAME, 'readonly');
        const store = transaction.objectStore(CONFIG_STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject('Error getting from config: ' + event.target.error);
    });
}

/**
 * Checks if an IndexedDB database exists.
 * @param {string} dbName The name of the database.
 * @returns {Promise<boolean>}
 */
async function checkDbExists(dbName) {
    // The modern `databases()` method is the most reliable.
    if (window.indexedDB.databases) {
        const dbs = await indexedDB.databases();
        return dbs.some(db => db.name === dbName);
    }
    // Fallback for older browsers that don't support `databases()`.
    console.warn("checkDbExists: indexedDB.databases() is not supported. Using a fallback check.");
    return new Promise(resolve => {
        const req = indexedDB.open(dbName);
        let existed = true;
        req.onupgradeneeded = () => {
            existed = false; // This event is only triggered if the DB doesn't exist or needs upgrading.
        };
        req.onsuccess = () => {
            req.result.close();
            // If the DB was created just now, delete it to leave no trace.
            if (!existed) {
                indexedDB.deleteDatabase(dbName);
            }
            resolve(existed);
        };
        // If we can't even open it, assume it doesn't exist or is inaccessible.
        req.onerror = () => resolve(false);
    });
}

function deleteNotesDB() {
    // --- НОВА КОРЕКЦИЯ: Принудително затваряне на всички връзки чрез презареждане ---
    // За да гарантираме, че абсолютно всички връзки към базата данни са затворени,
    // презареждаме страницата със специален флаг. При следващото зареждане,
    // приложението ще види флага и ще изтрие базата, преди да отвори нови връзки.
    // Това е най-надеждният начин за избягване на 'onblocked' събитието.
    return new Promise((resolve, reject) => {
        // Задаваме флаг в sessionStorage, който ще бъде прочетен веднага след презареждането.
        sessionStorage.setItem('forceDeleteDb', 'true');
        
        // Показваме съобщение на потребителя, че страницата ще се презареди.
        showToast('Презареждане за изтриване на базата данни...', 5000);

        // Изчакваме малко, за да може потребителят да види съобщението, и презареждаме.
        setTimeout(() => {
            window.location.reload();
        }, 1500);
    });
}

/**
 * Deletes the entire IndexedDB database.
 * @returns {Promise<void>}
 */
async function clearDbStores() {
    try {
        const db = await openNotesDB();
        const storesToClear = [BOARD_STORE_NAME, MEDIA_STORE_NAME, NOTE_STORE_NAME];
        const transaction = db.transaction(storesToClear, 'readwrite');

        const clearPromises = storesToClear.map(storeName => {
            return new Promise((resolve, reject) => {
                const request = transaction.objectStore(storeName).clear();
                request.onsuccess = resolve;
                request.onerror = reject;
            });
        });

        await Promise.all(clearPromises);
        console.log('Data stores cleared, config preserved.');
    } catch (error) {
        console.error('Failed to clear data stores:', error);
        showToast(_('dbDeleteFailed'), 10000);
    }
}

/**
 * Deletes a single record from a specified store by its key.
 * @param {string} storeName - The name of the object store.
 * @param {any} key - The key of the record to delete.
 * @returns {Promise<void>}
 */
async function deleteFromDB(storeName, key) {
    const db = await openNotesDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(`Error deleting from ${storeName}: ` + event.target.error);
    });
}
