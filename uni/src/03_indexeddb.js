// =================================================================================
// IV.a. ЛОКАЛНИ ДАННИ (INDEXEDDB)
// =================================================================================
/**
 * Зарежда всички данни (boards, media, notes) от локалната IndexedDB.
 */
async function fetchAllDataLocal() {
    console.log("Fetching all data from local IndexedDB...");
    boardsData = await getAllFromDB(BOARD_STORE_NAME);
    /*
    // --- TEMPORARY CLEANUP FOR customBgGdid ---
    let needsCleanup = false;
    for (let board of boardsData) {
        if (board.customBgGdid !== undefined) {
            if (!board.backpath && typeof board.customBgGdid === 'string' && board.customBgGdid.trim() !== '') {
                board.backpath = board.customBgGdid;
            }
            delete board.customBgGdid;
            needsCleanup = true;
            if (useIndexedDb) {
                bulkPutDB(BOARD_STORE_NAME, board, true).catch(e => console.error(e));
            }
            if (useGoogleDb && !isOffline && board.gdid) {
                updateGDriveFile(board.gdid, JSON.stringify(board)).catch(e => console.error(e));
            }
        }
    }
    if (needsCleanup) console.log("Cleaned up customBgGdid from boards.");
    // ----------------------------------------
    */

    trackMaxBoardIds(boardsData);
    mediaData = await getAllFromDB(MEDIA_STORE_NAME);
    const notesFromDB = await getAllFromDB(NOTE_STORE_NAME);
    allNotesData = notesFromDB;
    trackMaxIds(allNotesData);
    // --- REFRESH GLOBAL FLAGS FROM DB CONFIG ---
    dbSourceGlobal = await getConfig('dbSource');
    dbNoteIdTypeGlobal = await getConfig('dbNoteIdType');
    console.log(`Loaded ${boardsData.length} boards, ${mediaData.length} media, and ${allNotesData.length} notes from DB.`);
    console.log(`[fetchAllDataLocal] dbSourceGlobal: ${dbSourceGlobal}, dbNoteIdTypeGlobal: ${dbNoteIdTypeGlobal}`);
}

/**
 * Управлява процеса на локална синхронизация с файловата система.
 */
async function runLocalSync() {
    const useIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
    if (!useIndexedDb) {
        console.log("Skipping local sync because IndexedDB is disabled for this mode.");
        return 0;
    }
    const lastLocalTimestamp = await getConfig('lastLocalTimestamp');
    const updateDate = lastLocalTimestamp ? new Date(lastLocalTimestamp) : null;
    let updatedCount = 0;
    const handle = await getDirectoryHandle();
    if (!handle) return 0;
    loaderText.innerText = updateDate
        ? _('updatingFilesSince').replace('{date}', updateDate.toLocaleString())
        : _('performingFullSync');
    // Коригирана проверка: използваме 'updateFromSource' вместо старата 'updateIndexedDb'
    if (localStorage.getItem('updateFromSource') !== 'false') {
        updatedCount = await processDirectoryContent(lastLocalTimestamp);
        await saveConfig('lastLocalTimestamp', Date.now());
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
    return updatedCount;
}

/**
 * Проверява дали избраната папка съдържа само файлове от очаквания тип.
 * Функцията проверява дали файловете в основната директория започват с 'note', 'media', или 'board' и завършват на '.txt'.
 * Игнорира под-директории и скрити файлове (започващи с точка).
 * @param {FileSystemDirectoryHandle} directoryHandle - Handle на папката за проверка.
 * @returns {Promise<{isValid: boolean, invalidFile: string|null}>} 
 * Връща обект, който показва дали папката е валидна (`isValid`) 
 * и името на първия невалиден файл (`invalidFile`), ако такъв е намерен.
 */
async function validateFolderContent(directoryHandle) {
    const boardPattern = /^board.*\.txt$/i;
    const notePattern = /^note.*\.txt$/i;
    let boardFileCount = 0;
    let noteFileCount = 0;
    try {
        for await (const entry of directoryHandle.values()) {
            if (entry.kind === 'file') {
                if (boardPattern.test(entry.name)) {
                    boardFileCount++;
                } else if (notePattern.test(entry.name)) {
                    noteFileCount++;
                }
                // Прекъсваме проверката веднага щом условията са изпълнени
                if (boardFileCount >= 1 && noteFileCount >= 3) {
                    console.log(`Validation successful: Found at least 1 board file and 3 note files.`);
                    return { isValid: true, reason: null };
                }
            }
        }
    } catch (error) {
        console.log("Error during folder validation:", error);
        return { isValid: false, reason: 'error' };
    }
    // Ако цикълът приключи без да са изпълнени условията
    console.log(`Validation failed: Found ${boardFileCount} board file(s) and ${noteFileCount} note file(s). Required: >=1 board, >=3 notes.`);
    return { isValid: false, reason: 'criteria_not_met' };
}

async function validateArhFolderContent(directoryHandle) {
    const boardPattern = /^boards.*\.bcp$/i;
    const notePattern = /^notes.*\.bcp$/i;
    let boardsFile = false;
    let notesFile = false
    try {
        for await (const entry of directoryHandle.values()) {
            if (entry.kind === 'file') {
                if (boardPattern.test(entry.name)) {
                    boardsFile = true;
                } else if (notePattern.test(entry.name)) {
                    notesFile = true;
                }
                // Прекъсваме проверката веднага щом условията са изпълнени
                if (boardsFile && notesFile) {
                    console.log(`Arh validation successful: Found files.`);
                    return { isValid: true, reason: null };
                }
            }
        }
    } catch (error) {
        console.log("Error during arh folder validation:", error);
        return { isValid: false, reason: 'error' };
    }
    // Ако цикълът приключи без да са изпълнени условията
    console.log('Arh validation failed: Not found boards.bcp or notes.bcp.');
    return { isValid: false, reason: 'criteria_not_met' };
}
/**
 * Взима handle на директория - от паметта, от IndexedDB или чрез избор от потребителя.
 * @param {boolean} promptUser - Дали да се покаже диалог за избор, ако няма запазен handle.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function getDirectoryHandle(promptUser = false) {
    try {
        // Определяме кой handle да заредим въз основа на активната настройка в localStorage
        const useLocal = localStorage.getItem('useLocalDb') === 'true';
        const useArh = localStorage.getItem('useArhDb') === 'true';
        const configKey = useLocal ? 'directoryHandle' : (useArh ? 'arhHandle' : null);
        const savedHandle = configKey ? await getConfig(configKey) : null;
        if (savedHandle) {
            const verifiedHandle = await verifyPermission(savedHandle);
            if (verifiedHandle) {
                dirHandle = verifiedHandle;
                return dirHandle;
            }
        }
        if (promptUser) {
            const newHandle = await window.showDirectoryPicker();
            // Запазването ще се случи в извикващата функция СЛЕД валидация.
            // dirHandle = newHandle; // Глобалната променлива също ще се зададе там.
            return newHandle;
        }
        if (localStorage.getItem('useLocalDb') === 'true') showToast(_('errorLocalFolderNotSelected'), 10000);
        return null;
    } catch (error) {
        if (error.name !== 'AbortError') console.log("Error getting directory handle:", error);
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
    // --- КЛЮЧОВА ПРОВЕРКА ---
    // Ако опцията за използване на IndexedDB е изключена, не трябва да записваме нищо.
    if (localStorage.getItem('useIndexedDb') !== 'true') {
        console.log("Skipping processDirectoryContent because useIndexedDb is disabled.");
        return 0; // Връщаме 0, защото нищо не е обновено.
    }
    const minTimestamp = minModificationDate || 0;
    console.log(`--- Local Folder sync sequence started (minTimestamp: ${minTimestamp}) ---`);
    const startTime = performance.now();
    const handle = await getDirectoryHandle();
    if (!handle) return 0;
    const stores = {
        [BOARD_STORE_NAME]: [],
        [MEDIA_STORE_NAME]: [],
        [NOTE_STORE_NAME]: []
    };
    let updatedCount = 0;
    let skippedNotesCount = 0;
    const entries = [];
    for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.txt')) {
            const lowerName = entry.name.toLowerCase();
            const isBoard = lowerName.includes('board');
            const isMedia = lowerName.includes('media');
            const isNote = lowerName.includes('note');
            if (isBoard || isMedia || isNote) {
                entries.push({ entry, lowerName, isBoard, isMedia, isNote });
            }
        }
    }
    console.log(`[Local Sync] Found ${entries.length} valid .txt files for sync check.`);
    const CHUNK_SIZE = 80;
    const gdidMap = new Map(); // Track duplicates during sync
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, i + CHUNK_SIZE);
        loaderText.textContent = _('checkedFilesCount').replace('{count}', Math.min(i + CHUNK_SIZE, entries.length));
        await Promise.all(chunk.map(async (item) => {
            try {
                const file = await item.entry.getFile();
                if (file.lastModified >= minTimestamp) {
                    updatedCount++;
                    const content = await file.text();
                    const fileObject = JSON.parse(content);
                    if (fileObject.gdid) {
                        if (gdidMap.has(fileObject.gdid)) {
                            const error = `[Duplicate ID] GDID '${fileObject.gdid}' found in multiple files during sync: '${gdidMap.get(fileObject.gdid)}' and '${item.entry.name}'`;
                            console.error(error);
                            dataIntegrityIssues.push({ type: 'duplicate', gdid: fileObject.gdid, file1: gdidMap.get(fileObject.gdid), file2: item.entry.name, mode: 'sync' });
                        } else {
                            gdidMap.set(fileObject.gdid, item.entry.name);
                            localFileMap.set(fileObject.gdid, item.entry.name); // Попълваме глобалната карта
                        }
                        if (item.isBoard) {
                            stores[BOARD_STORE_NAME].push(fileObject);
                        } else if (item.isMedia) {
                            stores[MEDIA_STORE_NAME].push(fileObject);
                        } else if (item.isNote) {
                            stores[NOTE_STORE_NAME].push(fileObject);
                            const localNote = allNotesData.find(n => n.gdid == fileObject.gdid);
                            if (!localNote || (parseInt(fileObject.datemod, 10) > (parseInt(localNote.datemod, 10) || 0))) {
                                if (!updatedNoteGdims.includes(fileObject.gdid)) {
                                    updatedNoteGdims.push(fileObject.gdid);
                                }
                            } else {
                                skippedNotesCount++;
                            }
                        }
                    } else {
                        const error = `[Missing ID] File '${item.entry.name}' skipped: missing 'gdid' property.`;
                        console.warn(error);
                        dataIntegrityIssues.push({ type: 'missing', file: item.entry.name, mode: 'sync' });
                    }
                }
            } catch (error) {
                console.log(`Error processing local file '${item.entry.name}':`, error);
            }
        }));
    }
    for (const storeName in stores) {
        if (stores[storeName].length > 0) {
            await bulkPutDB(storeName, stores[storeName], true); // Use incremental put
        }
    }
    const endTime = performance.now();
    console.log(`--- Local Folder sync sequence completed in ${((endTime - startTime) / 1000).toFixed(2)}s ---`);
    console.log(`[Summary] Updated items: ${updatedCount} (Boards: ${stores[BOARD_STORE_NAME].length}, Media: ${stores[MEDIA_STORE_NAME].length}, Notes: ${stores[NOTE_STORE_NAME].length})`);
    console.log("[Local Sync] Updated objects:", stores);
    return Math.max(0, updatedCount - skippedNotesCount);
}

/**
 * Показва модален прозорец на цял екран за преглед на изображение или видео.
 * @param {string} src - URL адресът на медийния файл.
 * @param {boolean} isVideo - True, ако файлът е видео.
 */
function showImageVideoOverlay(src, isVideo = false) {
    const overlay = document.createElement('div');
    overlay.className = 'fullscreen-preview-overlay';
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
    const mediaElement = isVideo ? document.createElement('video') : document.createElement('img');
    mediaElement.src = src;
    if (isVideo) {
        mediaElement.controls = true;
        mediaElement.autoplay = true;
    }
    overlay.appendChild(mediaElement);
    const closeButton = document.createElement('button');
    closeButton.className = 'modal-close';
    closeButton.innerHTML = '&times;';
    closeButton.addEventListener('click', () => overlay.remove());
    overlay.appendChild(closeButton);
    document.body.appendChild(overlay);
}

/**
 * Извлича URL за преглед от Google Drive и показва овърлей.
 * @param {string} fileId - ID на файла в Google Drive.
 * @param {boolean} isVideo - True, ако файлът е видео.
 */
async function showGdrivePreview(fileId, isVideo = false) {
    if (!fileId) throw new Error("No file ID provided for Google Drive preview.");

    const sendRequest = async (token) => {
        return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink,webContentLink`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    };

    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) throw new Error(_('errorTokenMissing'));
        let tokenData = JSON.parse(storedTokenString);

        let resp = await sendRequest(tokenData.access_token);
        if (resp.status === 401) {
            let refresh = await refreshAuthToken(false);
            if (refresh && refresh.pass) {
                tokenData = refresh.tokenData;
                resp = await sendRequest(tokenData.access_token);
            }
        }

        if (!resp.ok) throw new Error(`HTTP Error ${resp.status}`);
        const result = await resp.json();
        const thumbnailUrl = result.thumbnailLink;

        if (thumbnailUrl) {
            showImageVideoOverlay(thumbnailUrl.replace(/=s\d+/, '=s1600'), isVideo);
        } else {
            throw new Error(_(isVideo ? 'noVideoPreview' : 'noImgPreview'));
        }
    } catch (e) {
        console.error("showGdrivePreview error:", e);
        throw e;
    }
}

async function showLocalPreview(folderName, fileName, mode) {
    const fileHandle = await (await dirHandle.getDirectoryHandle(folderName, { create: false })).getFileHandle(fileName);
    const file = await fileHandle.getFile();
    showImageVideoOverlay(URL.createObjectURL(file), file.type.startsWith('video'));
}
/**
 * Показва преглед на изображение/видео в рамките на самата бележка.
 * @param {HTMLElement} noteElement - DOM елементът на бележката.
 * @param {Array} attachments - Масив с прикачени файлове.
 * @param {number} startIndex - Начален индекс.
 * @param {string} sourceMode - 'gdrive', 'local' или 'archive'.
 * @param {boolean} isVideo - Дали файлът е видео.
 */
async function showInNotePreview(noteElement, attachments, startIndex, sourceMode, isVideo) {
    if (!noteElement) return;
    // Support legacy calls with single string fileId instead of attachments array
    if (typeof attachments === 'string') {
        const fileId = attachments;
        attachments = [{ path: fileId, pathGD: fileId, type: isVideo ? 4 : 1 }];
        startIndex = 0;
    }
    // Remove if already exists to replace it
    const existingOverlay = noteElement.querySelector('.image-preview-overlay');
    if (existingOverlay) existingOverlay.remove();
    let currentIndex = startIndex;
    // 1. Create overlay immediately
    const overlay = document.createElement('div');
    overlay.className = 'image-preview-overlay';
    // Ensure parent has position: relative or higher to contain the absolute overlay
    const parentPos = getComputedStyle(noteElement).position;
    if (parentPos === 'static') {
        noteElement.style.position = 'relative';
    }
    Object.assign(overlay.style, {
        position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: '1000', borderRadius: '8px', padding: '5px', boxSizing: 'border-box',
        flexDirection: 'column'
    });
    // Prevent bubbling
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        // Prevent closing if clicking on buttons or their children, but allow if clicking on img/video or background
        // Wait, arrow buttons stop propagation themselves. Close button stops propagation.
        // So any click reaching here is either on the container/background OR on the media itself (if media doesn't stop prop)
        // Check if the click target is a button or inside a button (just in case)
        if (e.target.closest('button')) return;
        e.stopPropagation();
        cleanup();
    });
    // Create container for media to easily clear/replace it
    const mediaContainer = document.createElement('div');
    Object.assign(mediaContainer.style, {
        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
    });
    overlay.appendChild(mediaContainer);
    // --- Navigation Arrows ---
    if (attachments.length > 1) {
        const createArrow = (direction) => {
            const btn = document.createElement('button');
            btn.innerHTML = direction === 'prev' ? '&lt;' : '&gt;';
            Object.assign(btn.style, {
                position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                [direction === 'prev' ? 'left' : 'right']: '5px',
                background: 'rgba(255,255,255,0.3)', color: 'white', border: 'none',
                borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', fontWeight: 'bold', zIndex: '20'
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (direction === 'prev') {
                    currentIndex = (currentIndex - 1 + attachments.length) % attachments.length;
                } else {
                    currentIndex = (currentIndex + 1) % attachments.length;
                }
                loadMedia(currentIndex);
            });
            return btn;
        };
        overlay.appendChild(createArrow('prev'));
        overlay.appendChild(createArrow('next'));
    }
    // Close button
    const closeButton = document.createElement('button');
    closeButton.className = 'view-button';
    closeButton.innerHTML = eyeOffIconSvg;
    Object.assign(closeButton.style, { position: 'absolute', top: '5px', right: '5px', zIndex: '21' });
    if (closeButton.querySelector('svg')) closeButton.querySelector('svg').style.stroke = 'white';
    // Cleanup function
    const cleanup = () => {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (overlay.mediaUrlToRevoke) {
            URL.revokeObjectURL(overlay.mediaUrlToRevoke);
        }
    };
    closeButton.addEventListener('click', (ev) => {
        ev.stopPropagation();
        cleanup();
    });
    overlay.appendChild(closeButton);
    noteElement.appendChild(overlay);
    // --- Load Media Function ---
    async function loadMedia(index) {
        // Clear container
        mediaContainer.innerHTML = '';
        // Revoke previous URL if any (local scope reuse)
        if (overlay.mediaUrlToRevoke) {
            URL.revokeObjectURL(overlay.mediaUrlToRevoke);
            overlay.mediaUrlToRevoke = null;
        }
        // Add spinner
        const spinner = document.createElement('div');
        spinner.className = 'loader';
        Object.assign(spinner.style, { width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #3498db', borderRadius: '50%', animation: 'spin 1s linear infinite' });
        mediaContainer.appendChild(spinner);
        const attachment = attachments[index];
        const isActuallyVideo = attachment.type === 4 || isVideo;
        const isActuallySound = attachment.type === 2;
        const folderName = isActuallyVideo ? 'Video' : (isActuallySound ? 'Sound' : 'Images');
        const fileIdOrPath = sourceMode === 'gdrive' ? attachment.pathGD : attachment.path;
        let mediaUrl;
        try {
            if (sourceMode === 'gdrive') {
                if (typeof gapi === 'undefined' || typeof gapi.client === 'undefined') {
                    await loadGoogleApis();
                }
                // Check if token is valid or expired using the actual authToken object
                let isTokenExpired = true;
                if (authToken && authToken.issued_at) {
                    const elapsedSeconds = (Date.now() - authToken.issued_at) / 1000;
                    const expiresIn = authToken.expires_in || 3599;
                    if (elapsedSeconds < (expiresIn - 300)) { // Refresh if less than 5 mins remaining
                        isTokenExpired = false;
                    }
                }
                if (!authToken || isTokenExpired) {
                    console.log("Token expired or missing in preview, refreshing...");
                    const newToken = await checkAuth(); // checkAuth handles the actual refresh logic
                    if (newToken) {
                        authToken = newToken;
                        // Update gapi client if needed
                        if (typeof gapi !== 'undefined' && gapi.client) gapi.client.setToken({ access_token: authToken.access_token });
                    }
                }
                const tokenObj = (typeof authToken !== 'undefined' && authToken) ? authToken :
                    ((typeof gapi !== 'undefined' && gapi.auth) ? gapi.auth.getToken() : null);
                if (!tokenObj) throw new Error(_('errorTokenMissing'));
                if (isActuallyVideo || isActuallySound) {
                    try {
                        const mediaResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileIdOrPath}?alt=media`, {
                            headers: {
                                'Authorization': `Bearer ${tokenObj.access_token}`,
                                'Range': 'bytes=0-10000000'
                            }
                        });
                        if (!mediaResponse.ok) throw new Error(`Media fetch failed: ${mediaResponse.status}`);
                        const mediaBlob = await mediaResponse.blob();
                        mediaUrl = URL.createObjectURL(mediaBlob);
                        overlay.mediaUrlToRevoke = mediaUrl;
                    } catch (err) {
                        console.log("Failed to load GDrive media blob:", err);
                        throw new Error(_(isActuallyVideo ? 'noVideoPreview' : 'noSoundPreview') || 'Preview error');
                    }
                } else {
                    // Image high-res thumbnail
                    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileIdOrPath}?fields=thumbnailLink`, {
                        headers: { 'Authorization': `Bearer ${tokenObj.access_token}` }
                    });
                    if (!response.ok) throw new Error(`Thumbnail fetch failed: ${response.status}`);
                    const fileMetadata = await response.json();
                    const thumbnailUrl = fileMetadata.thumbnailLink;
                    if (!thumbnailUrl) throw new Error(_('noImgPreview'));
                    mediaUrl = thumbnailUrl.replace(/=s\d+/, '=s1600');
                }
            } else { // 'local' or 'archive'
                const isDbOnlyMode = useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb;
                if (isDbOnlyMode && !dirHandle && (sourceMode === 'local' || sourceMode === 'archive')) {
                    const dbSource = await getConfig('dbSource');
                    let handleKey = null;
                    if (dbSource === 2) handleKey = 'directoryHandle';
                    else if (dbSource === 3) handleKey = 'arhHandle';
                    if (handleKey) {
                        const handle = await getConfig(handleKey);
                        const verifiedHandle = handle ? await verifyPermission(handle) : null;
                        if (verifiedHandle) {
                            dirHandle = verifiedHandle;
                        } else {
                            showToast(_('noUpdateMode'), 10000);
                            cleanup();
                            return;
                        }
                    }
                }
                let fileHandle;
                const fileName = fileIdOrPath.split('/').pop();
                if (sourceMode === 'local') {
                    const folderHandle = await dirHandle.getDirectoryHandle(folderName, { create: false });
                    fileHandle = await folderHandle.getFileHandle(fileName);
                } else { // 'archive'
                    fileHandle = await dirHandle.getFileHandle(fileName);
                }
                const file = await fileHandle.getFile();
                mediaUrl = URL.createObjectURL(file);
                overlay.mediaUrlToRevoke = mediaUrl;
            }
            // Remove spinner
            if (spinner.parentNode) spinner.remove();
            let mediaElement;
            if (isActuallyVideo) {
                mediaElement = document.createElement('video');
                mediaElement.controls = true;
                mediaElement.autoplay = true;
                // Limit preview to 15 seconds if it's a blob-based partial fetch
                if (sourceMode === 'gdrive') {
                    mediaElement.addEventListener('timeupdate', () => {
                        if (mediaElement.currentTime > 15) {
                            mediaElement.pause();
                        }
                    });
                }
            } else if (isActuallySound) {
                mediaElement = document.createElement('audio');
                mediaElement.controls = true;
                mediaElement.autoplay = true;
            } else {
                mediaElement = document.createElement('img');
            }
            mediaElement.src = mediaUrl;
            if (mediaElement.load) mediaElement.load(); // Explicitly load for better media handling
            Object.assign(mediaElement.style, {
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                padding: '5px',
                boxSizing: 'border-box',
                display: 'block',
                margin: 'auto'
            });
            mediaContainer.appendChild(mediaElement);
        } catch (e) {
            console.log("Preview failed:", e);
            if (spinner.parentNode) spinner.remove();
            const errorMsg = document.createElement('div');
            errorMsg.style.color = 'white';
            errorMsg.style.textAlign = 'center';
            errorMsg.style.padding = '20px';
            errorMsg.textContent = e.message || 'Error loading preview';
            mediaContainer.appendChild(errorMsg);
        }
    }
    // Initial load
    loadMedia(currentIndex);
}

function addInNotePreviewListener(element, attachments, indexOrSource, sourceMode, isVideo) {
    element.style.cursor = 'pointer';
    element.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const noteElement = e.currentTarget.closest('.note') || e.currentTarget.closest('#modal-body') || document.getElementById('modal-body');
        // Handle both signatures:
        // 1. (element, attachmentsArray, startIndex, sourceMode, isVideo)
        // 2. (element, fileIdString, sourceMode, isVideo)
        if (typeof attachments === 'string') {
            // Legacy: attachments=fileId, indexOrSource=sourceMode, sourceMode=isVideo
            showInNotePreview(noteElement, attachments, 0, indexOrSource, sourceMode);
        } else {
            showInNotePreview(noteElement, attachments, indexOrSource, sourceMode, isVideo);
        }
    });

}
