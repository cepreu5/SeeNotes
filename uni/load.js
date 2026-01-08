// =================================================================================
// IX. LOAD MODULE (Google Drive Data Fetching & Sync)
// =================================================================================

/**
 * Parses the raw responses from Google Drive into JSON objects.
 */
async function parseFileResults(results, filenameForError) {
    const data = [];
    let parseError = false;
    results.forEach(({ res }) => {
        if (!res || !res.body || res.body.trim() === '') return;
        try {
            const content = JSON.parse(res.body);
            if (filenameForError === 'note.txt') {
                if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
                    data.push(content);
                }
            } else {
                if (Array.isArray(content)) {
                    data.push(...content);
                } else if (typeof content === 'object' && content !== null) {
                    data.push(content);
                }
            }
        } catch (e) {
            parseError = true;
            console.log(`Error parsing content from a '${filenameForError}' file:`, e);
        }
    });
    return { data, parseError };
}

async function loadAndParseFile(filename, folderId, modifiedSince = null, onProgress = null) {
    const results = await fetchFiles(filename, folderId, onProgress, modifiedSince);
    return await parseFileResults(results, filename);
}

async function fetchAllData(folderIdFromPrompt, modifiedSince = null) {
    let folderId = folderIdFromPrompt || await getFolderID();
    if (!folderId) {
        if (useIndexedDb && useGoogleDb) {
            try {
                await fetchAllDataLocal();
                if (allNotesData.length > 0) {
                    showToast(_('loadedFromLocalNoDrive'), 5000);
                    return { boardParseError: false };
                }
            } catch (e) { }
        }
        showMessagePopup(_('errorFolderNotFound'));
        throw new Error("Main folder ID not found.");
    }

    loaderText.textContent = _('loadingFile') + " ...";
    const onNoteProgress = (loaded, total) => {
        loaderText.textContent = `${_('loadingFile')} ${loaded} ${_('of')} ${total}`;
    };

    console.time("fetchAllData_TotalLoad");
    const [boardRes, mediaRes, noteRes] = await Promise.all([
        loadAndParseFile('board.txt', folderId, modifiedSince),
        loadAndParseFile('media.txt', folderId, modifiedSince),
        loadAndParseFile('note.txt', folderId, modifiedSince, onNoteProgress)
    ]);
    console.timeEnd("fetchAllData_TotalLoad");

    boardsData = boardRes.data;
    mediaData = mediaRes.data;
    allNotesData = noteRes.data;

    // Integrity checks for initial Google Drive load
    const gdidMap = new Map();
    const checkIntegrity = (data, filename) => {
        data.forEach(item => {
            if (!item.gdid) {
                dataIntegrityIssues.push({ type: 'missing', file: filename, mode: 'gdrive' });
            } else if (gdidMap.has(item.gdid)) {
                dataIntegrityIssues.push({
                    type: 'duplicate',
                    gdid: item.gdid,
                    file1: gdidMap.get(item.gdid),
                    file2: filename,
                    mode: 'gdrive'
                });
            } else {
                gdidMap.set(item.gdid, filename);
            }
        });
    };
    checkIntegrity(boardsData, 'board.txt');
    checkIntegrity(mediaData, 'media.txt');
    checkIntegrity(allNotesData, 'note.txt');

    if (boardsData.length === 0) {
        showToast(_('errorNoBoardFilesFound'), 15000);
        return { error: 'NO_BOARD_FILES' };
    }
    if (allNotesData.length === 0) {
        showToast(_('errorNoNoteFilesFound'));
        return { error: 'NO_NOTE_FILES' };
    }
    return { boardParseError: boardRes.parseError };
}

async function runGoogleDriveSync() {
    const loaderTitle = document.getElementById('loader-title');
    const useIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
    if (!useIndexedDb) return 0;

    const updateOnly = localStorage.getItem('updateFromSource') !== 'false';
    let lastSyncTimestamp = (updateOnly && dbExists) ? await getConfig('lastGDTimestamp') : null;
    if (lastSyncTimestamp) lastSyncTimestamp = parseInt(lastSyncTimestamp, 10);

    const modifiedSince = lastSyncTimestamp ? new Date(lastSyncTimestamp).toISOString() : null;
    if (loaderTitle) {
        loaderTitle.innerText = modifiedSince ?
            _('checkingForGDriveUpdates').replace('{date}', new Date(lastSyncTimestamp).toLocaleString(currentLang)) :
            _('initialGDriveSync');
    }

    const folderId = await getFolderID();
    if (!folderId) return 0;

    let updatedFilesCount = 0;
    const gdidMap = new Map(); // Track duplicates during GDrive sync
    const syncFileWorker = async (filename, storeName, isNote = false) => {
        const files = await fetchFiles(filename, folderId, null, modifiedSince);
        if (files.length > 0) {
            updatedFilesCount += files.length;
            const { data } = await parseFileResults(files, filename);
            if (data.length > 0) {
                // Integrity check for the batch
                data.forEach(item => {
                    if (!item.gdid) {
                        dataIntegrityIssues.push({ type: 'missing', file: filename, mode: 'gdrive' });
                    } else if (gdidMap.has(item.gdid)) {
                        dataIntegrityIssues.push({
                            type: 'duplicate',
                            gdid: item.gdid,
                            file1: gdidMap.get(item.gdid),
                            file2: filename,
                            mode: 'gdrive'
                        });
                    } else {
                        gdidMap.set(item.gdid, filename);
                    }
                });

                await bulkPutDB(storeName, data, true);
                if (filename === 'media.txt') {
                    data.forEach(n => {
                        const i = mediaData.findIndex(m => m.gdid === n.gdid);
                        if (i !== -1) mediaData[i] = n; else mediaData.push(n);
                    });
                } else if (filename === 'board.txt') {
                    data.forEach(n => {
                        const i = boardsData.findIndex(b => b.gdid === n.gdid);
                        if (i !== -1) boardsData[i] = n; else boardsData.push(n);
                    });
                }
                if (isNote) data.forEach(note => updatedNoteGdims.push(note.gdid));
            }
        }
    };

    loaderText.textContent = _('checkingForGDriveUpdates').split('{')[0] + "...";
    console.time("runGoogleDriveSync_Parallel");
    await Promise.all([
        syncFileWorker('board.txt', BOARD_STORE_NAME, false),
        syncFileWorker('media.txt', MEDIA_STORE_NAME, false),
        syncFileWorker('note.txt', NOTE_STORE_NAME, true)
    ]);
    console.timeEnd("runGoogleDriveSync_Parallel");

    await saveConfig('lastGDTimestamp', Date.now());
    loaderText.textContent = _('syncFinishedLoadingData');
    return updatedFilesCount;
}

/**
 * Downloads file contents with Concurrency Control & 'Kick' mechanism.
 */
async function fetchFiles(filename, folderId, onProgress, modifiedSince = null) {
    let query = `'${folderId}' in parents and name = '${filename}' and mimeType='text/plain' and trashed = false`;
    if (modifiedSince) query += ` and modifiedTime > '${modifiedSince}'`;

    let allFiles = [], pageToken = null;
    console.time(`fetchFiles_${filename}_List`);
    try {
        do {
            const resp = await gapi.client.drive.files.list({ q: query, fields: 'files(id, name), nextPageToken', pageSize: 1000, pageToken });
            allFiles.push(...resp.result.files);
            pageToken = resp.result.nextPageToken;
        } while (pageToken);
    } catch (e) { throw new Error("Drive API List failed."); }
    console.timeEnd(`fetchFiles_${filename}_List`);

    if (allFiles.length === 0) return [];

    let loadedFiles = 0;
    const totalFiles = allFiles.length;
    const accessToken = gapi.auth.getToken().access_token;

    // LIMIT CONCURRENCY: Don't overwhelm the browser socket pool
    const CONCURRENCY_LIMIT = 100;
    console.log(`[${filename}] Starting throttled fetch. Total: ${totalFiles}, Limit: ${CONCURRENCY_LIMIT}`);
    console.time(`fetchFiles_${filename}_Total`);

    const UI_STEP = totalFiles <= 50 ? 1 : Math.max(5, Math.floor(totalFiles / 50));

    const downloadWithKick = async (file, attempt = 1) => {
        const controller = new AbortController();
        const kickId = setTimeout(() => { if (attempt === 1) controller.abort(); }, 1200);

        try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                cache: 'no-store',
                priority: 'high',
                signal: controller.signal
            });
            clearTimeout(kickId);
            if (!response.ok) throw new Error(response.status);
            const body = await response.text();
            loadedFiles++;
            if (loadedFiles % 50 === 0 || loadedFiles === totalFiles) {
                console.log(`[${filename}] Progress: ${loadedFiles}/${totalFiles}`);
            }
            // Adaptive UI update to keep it smooth but fast
            if (onProgress && (loadedFiles % UI_STEP === 0 || loadedFiles === totalFiles)) {
                onProgress(loadedFiles, totalFiles);
            }
            return { file, res: { body } };
        } catch (err) {
            clearTimeout(kickId);
            if (attempt === 1) return downloadWithKick(file, 2);
            console.error(`[${filename}] Error for ${file.name}:`, err.message);
            return { file, res: { body: '' } };
        }
    };

    // SLIDING WINDOW POOL
    const results = [];
    const pool = new Set();
    for (const file of allFiles) {
        if (pool.size >= CONCURRENCY_LIMIT) {
            await Promise.race(pool);
        }
        const promise = downloadWithKick(file).then(res => {
            pool.delete(promise);
            return res;
        });
        results.push(promise);
        pool.add(promise);
    }

    const finalResults = await Promise.all(results);
    console.timeEnd(`fetchFiles_${filename}_Total`);
    return finalResults;
}

async function getFileID(folderId, fileName) {
    try {
        const resp = await gapi.client.drive.files.list({ q: `'${folderId}' in parents and name = '${fileName}'`, fields: 'files(id, name)', pageSize: 1 });
        return resp.result.files?.[0]?.id || null;
    } catch (e) { return null; }
}

async function getFolderID() {
    try {
        const multinotesDataId = await getMultinotesDataFolderID();
        if (!multinotesDataId) return null;
        const folderNames = ["Other", "Sound", "Video", "Images"];
        await Promise.all(folderNames.map(async (name) => {
            const cachedId = localStorage.getItem(`gdrive_folder_id_${name}`);
            if (cachedId) { folderIds[name] = cachedId; return; }
            const resp = await gapi.client.drive.files.list({ q: `'${multinotesDataId}' in parents and name = '${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id)', pageSize: 1 });
            const id = resp.result.files?.[0]?.id || "";
            folderIds[name] = id;
            if (id) localStorage.setItem(`gdrive_folder_id_${name}`, id);
        }));
        return multinotesDataId;
    } catch (e) { return null; }
}

async function getMultinotesDataFolderID() {
    const cachedId = localStorage.getItem('gdrive_multinotes_data_id');
    if (cachedId) return cachedId;
    try {
        const resp = await gapi.client.drive.files.list({ q: "name='multinotes_data' and mimeType='application/vnd.google-apps.folder' and trashed=false", fields: 'files(id)', pageSize: 1 });
        const id = resp.result.files?.[0]?.id || null;
        if (id) localStorage.setItem('gdrive_multinotes_data_id', id);
        return id;
    } catch (error) {
        if (error.result?.error?.code === 401) {
            showToast(_('errorSessionExpired'));
            if (typeof handleLogout === 'function') handleLogout();
        }
        return null;
    }
}
