// ================================================================================
// IV.a. ЛОКАЛНИ ДАННИ (INDEXEDDB)
// ================================================================================

/**
 * Зарежда всички данни (boards, media, notes) от локалната IndexedDB.
 */
async function fetchAllDataLocal() {
    console.log("Fetching all data from local IndexedDB...");
    boardsData = await getAllFromDB(BOARD_STORE_NAME);
    mediaData = await getAllFromDB(MEDIA_STORE_NAME);
    const notesFromDB = await getAllFromDB(NOTE_STORE_NAME);

    // The rest of the app expects `allNotesData` to have a specific structure,
    // including the raw `res.body` for the modal. We need to reconstruct this.
    allNotesData = notesFromDB.map(noteContent => {
        const rawData = {
            file: { name: 'note.txt (local)' }, // Mock file object
            res: { body: JSON.stringify(noteContent) } // Re-stringify the content
        };
        return {
            file: rawData.file,
            content: noteContent,
            rawData: rawData
        };
    });

    console.log(`Loaded ${boardsData.length} boards, ${mediaData.length} media, and ${allNotesData.length} notes from DB.`);
}

/**
 * Управлява процеса на локална синхронизация с файловата система.
 */
async function runLocalSync() {
    const lastUpdateTimestamp = await getConfig('lastUpdateTimestamp');
    const updateDate = lastUpdateTimestamp ? new Date(lastUpdateTimestamp) : null;
    let updatedCount = 0;

    const handle = await getDirectoryHandle();
    if (!handle) {
        showToast(_('errorLocalFolderNotSelected'), 10000);
        return; // Stop if no folder is selected
    }

    loaderText.textContent = updateDate ? `Updating files since ${updateDate.toLocaleString()}...` : "Performing full initial sync...";

    // Perform sync only if the setting is enabled
    if (localStorage.getItem('updateIndexedDb') !== 'false') {
        updatedCount = await processDirectoryContent(lastUpdateTimestamp);
        await saveConfig('lastUpdateTimestamp', Date.now());
    } else {
        console.log("Skipping local file scan because IndexedDB update is disabled.");
        loaderText.textContent = _('skippedFileScan');
    }

    // Show toast only for incremental updates (not the very first sync)
    if (updateDate) {
        const message = updatedCount > 0
            ? _('localUpdatesFound').replace('{count}', updatedCount)
            : _('localNoUpdates');
        showToast(message, 3000);
    }
}

/**
 * Взима handle на директория - от паметта, от IndexedDB или чрез избор от потребителя.
 * @param {boolean} promptUser - Дали да се покаже диалог за избор, ако няма запазен handle.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function getDirectoryHandle(promptUser = false) {
    if (dirHandle) return dirHandle;

    try {
        const savedHandle = await getConfig('directoryHandle');
        if (savedHandle) {
            const verifiedHandle = await verifyPermission(savedHandle);
            if (verifiedHandle) {
                dirHandle = verifiedHandle;
                return dirHandle;
            }
        }

        if (promptUser) {
            const newHandle = await window.showDirectoryPicker();
            await saveConfig('directoryHandle', newHandle);
            dirHandle = newHandle;
            return dirHandle;
        }
        return null;
    } catch (error) {
        if (error.name !== 'AbortError') console.error("Error getting directory handle:", error);
        return null;
    }
}

/**
 * Проверява и иска разрешение за достъп до handle на директория.
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function verifyPermission(handle) {
    const options = { mode: 'readwrite' };
    if (await handle.queryPermission(options) === 'granted') return handle;
    if (await handle.requestPermission(options) === 'granted') return handle;
    return null;
}

/**
 * Обхожда избраната локална директория и обновява IndexedDB.
 * @param {Date} [minModificationDate] - Минимална дата на модификация за инкрементално обновяване.
 */
async function processDirectoryContent(minModificationDate) {
    const minTimestamp = minModificationDate || 0;
    const handle = await getDirectoryHandle();
    if (!handle) return 0;
    const stores = {
        [BOARD_STORE_NAME]: [],
        [MEDIA_STORE_NAME]: [],
        [NOTE_STORE_NAME]: []
    };
    let fileCount = 0;
    let updatedCount = 0;
    for await (const entry of handle.values()) {
        if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.txt')) continue;
        fileCount++;
        loaderText.textContent = `Checked ${fileCount} files...`;
        try {
            const file = await entry.getFile();
            if (file.lastModified >= minTimestamp) {
                updatedCount++;
                const content = await file.text();
                const fileObject = JSON.parse(content);
                if (fileObject.gdid) {
                    const lowerCaseName = entry.name.toLowerCase();
                    if (lowerCaseName.includes('board')) {
                        stores[BOARD_STORE_NAME].push(fileObject);
                    } else if (lowerCaseName.includes('media')) {
                        stores[MEDIA_STORE_NAME].push(fileObject);
                    } else if (lowerCaseName.includes('note')) {
                        stores[NOTE_STORE_NAME].push(fileObject);
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing local file '${entry.name}':`, error);
        }
    }
    // Bulk update the stores that have new/updated data
    const updateIndexedDb = localStorage.getItem('updateIndexedDb') !== 'false';
    if (!updateIndexedDb) {
        console.log("IndexedDB update is disabled in settings. Skipping database write.");
        return;
    }
    for (const storeName in stores) {
        if (stores[storeName].length > 0) {
            await bulkPutDB(storeName, stores[storeName], true); // Use incremental put
        }
    }
    return updatedCount;
}

/**
 * Отваря IndexedDB базата данни.
 * @returns {Promise<IDBDatabase>}
 */
function openNotesDB() {
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

        request.onsuccess = (event) => resolve(event.target.result);
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
    if (!data || !Array.isArray(data) || data.length === 0) return;
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
 * Запазва стойност в config store-a.
 * @param {string} key - Ключ (напр. 'directoryHandle', 'lastUpdateTimestamp').
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
