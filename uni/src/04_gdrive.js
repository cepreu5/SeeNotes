// =================================================================================
// IX. LOAD MODULE (Google Drive Data Fetching & Sync)
// =================================================================================
/**
 * Parses the raw responses from Google Drive into JSON objects.
 */
async function parseFileResults(results, filenameForError) {
    const tempMap = new Map();
    const duplicates = [];
    let parseError = false;
    const updateGDrive = useGoogleDb && !isOffline;

    for (const { res, id } of results) {
        if (!res || !res.body || res.body.trim() === '') continue;
        try {
            const content = JSON.parse(res.body);
            let items = [];
            if (filenameForError === 'note.txt') {
                if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
                    items.push(content);
                }
            } else {
                if (Array.isArray(content)) {
                    items = content;
                } else if (typeof content === 'object' && content !== null) {
                    items.push(content);
                }
            }

            for (let item of items) {
                // ВИНАГИ използвайте реалното ID на файла от Google Drive като gdid (само за бележки)
                if (id && filenameForError === 'note.txt') {
                    if (item.gdid && item.gdid !== id) {
                        console.warn(`[Sync-ID-Fix] Corrected mismatched ID for note "${item.id}": Internal was "${item.gdid}", actual GDrive ID is "${id}"`);
                        item.type = -1; // Mark as dirty to allow bulk fixing via Sync button
                    }

                    item.gdid = id;
                }
                const key = (item.gdid && item.gdid !== '') ? item.gdid : item.id;
                if (typeof key !== 'undefined' && key !== null) {
                    const existing = tempMap.get(key);
                    if (!existing) {
                        tempMap.set(key, item);
                    } else if (filenameForError === 'note.txt') {
                        // Проверяваме дали съдържанието е различно
                        const isDiff = (item.notetxt !== existing.notetxt ||
                            item.color !== existing.color ||
                            item.title !== existing.title ||
                            item.boardid != existing.boardid);
                        if (isDiff) {
                            duplicates.push({ localNote: existing, serverNote: item });
                        }
                    }
                }
            }
        } catch (e) {
            parseError = true;
            console.log(`Error parsing content from a '${filenameForError}' file:`, e);

            if (updateGDrive && id && filenameForError === 'note.txt') {
                const snippet = res.body.substring(0, 50) + (res.body.length > 50 ? '...' : '');
                const confirmMsg = _('confirmDeleteCorruptedNote')
                    .replace('{error}', e.message)
                    .replace('{content}', snippet);

                const confirmed = await showConfirmation(confirmMsg);
                if (confirmed) {
                    try {
                        if (await deleteGDriveFile(id)) {
                            if (typeof showToast === 'function') showToast(_('fileDeletedSuccess'), 3000);
                        }
                    } catch (delErr) {
                        console.error("Failed to delete corrupted file", delErr);
                        if (typeof showToast === 'function') showToast(_('gdriveDeleteError').replace('{error}', delErr.message), 5000);
                    }
                }
            }
        }
    }
    const finalData = Array.from(tempMap.values());
    if (filenameForError === 'note.txt' || filenameForError === 'board.txt') {
        const rawItemCount = results.length; // Approximate if 1 item per file
        console.log(`[parseFileResults] ${filenameForError}: Found ${finalData.length} unique items from ${results.length} files.`);
    }
    return { data: finalData, parseError, duplicates };
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
    const tStart = Date.now();
    const [boardRes, mediaRes, noteRes] = await Promise.all([
        loadAndParseFile('board.txt', folderId, modifiedSince),
        loadAndParseFile('media.txt', folderId, modifiedSince),
        loadAndParseFile('note.txt', folderId, modifiedSince, onNoteProgress)
    ]);
    const tEnd = Date.now();
    initialLoadTime = ((tEnd - tStart) / 1000).toFixed(2);
    initialLoadTimestamp = tEnd;
    console.timeEnd("fetchAllData_TotalLoad");
    boardsData = boardRes.data;
    mediaData = mediaRes.data;
    allNotesData = noteRes.data;
    trackMaxIds(allNotesData);
    trackMaxBoardIds(boardsData);
    // Integrity checks for initial Google Drive load
    const gdidMap = new Map();
    const checkIntegrity = (data, filename) => {
        data.forEach(item => {
            if (!item.gdid) {
                const textContent = item.notetxt || item.text || '';
                dataIntegrityIssues.push({ type: 'missing', file: filename, mode: 'gdrive', text: textContent });
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
        showToast(_('errorNoBoardFilesFound'), 10000);
        if (typeof showNewBoardModal === 'function') showNewBoardModal();
        // Не връщаме грешка, за да позволим създаването на празна база данни и рендиране на UI
    }
    if (allNotesData.length === 0) {
        // Показваме съобщението само ако вече не сме показали за липсващи бордове, за да не се трупат
        if (boardsData.length > 0) {
            showToast(_('errorNoNoteFilesFound'), 10000);
        }
    }
    return { boardParseError: boardRes.parseError, duplicates: noteRes.duplicates };
}

let isSyncing = false;
async function runGoogleDriveSync() {
    if (isSyncing) {
        console.log("[Sync-Run] Already syncing, skipping call.");
        return 0;
    }
    isSyncing = true;
    try {
        console.log("[Sync-Run] runGoogleDriveSync started");
        const loaderTitle = document.getElementById('loader-title');
        const loaderFolderInfo = document.getElementById('loader-folder-info');
        if (loaderFolderInfo) loaderFolderInfo.textContent = `(${activeFolderName})`;
        const loaderText = document.getElementById('loader-text');
        if (!useIndexedDb) {
            console.log("[Sync-Run] Exiting: useIndexedDb is false");
            return 0;
        }

        const updateOnly = localStorage.getItem('updateFromSource') !== 'false';
        const lastSyncTimestampOrig = (updateOnly && dbExists) ? await getConfig('lastGDTimestamp') : null;
        let lastSyncTimestamp = lastSyncTimestampOrig;
        if (lastSyncTimestamp) lastSyncTimestamp = parseInt(lastSyncTimestamp, 10);

        const modifiedSince = lastSyncTimestamp ? new Date(lastSyncTimestamp).toISOString() : null;
        let notesForConflictCheck = [];
        if (loaderTitle) {
            loaderTitle.innerText = modifiedSince ?
                _('checkingForGDriveUpdates').replace('{date}', new Date(lastSyncTimestamp).toLocaleString(currentLang)) :
                _('initialGDriveSync');
        }

        const syncStartTime = Date.now();
        const folderId = await getFolderID();
        if (!folderId) {
            console.log("[Sync-Run] Exiting: folderId not found.");
            return 0;
        }
        console.log("[Sync-Run] Folder identity found:", folderId);

        let updatedFilesCount = 0;
        let skippedNotesCount = 0;
        const gdidMap = new Map(); // Track duplicates during GDrive sync
        const syncFileWorker = async (filename, storeName, isNote = false, forceFull = false) => {
            const since = forceFull ? null : modifiedSince;
            const files = await fetchFiles(filename, folderId, null, since);
            if (files.length > 0) {
                updatedFilesCount += files.length;
                const { data, duplicates } = await parseFileResults(files, filename);
                if (duplicates && duplicates.length > 0 && isNote) {
                    duplicates.forEach(pair => notesForConflictCheck.push(pair));
                }
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
                    if (filename === 'media.txt') {
                        data.forEach(n => {
                            const i = mediaData.findIndex(m => m.gdid === n.gdid);
                            if (i !== -1) mediaData[i] = n; else mediaData.push(n);
                        });
                    } else if (filename === 'board.txt') {
                        for (let n of data) {
                            const i = boardsData.findIndex(b => b.gdid === n.gdid);
                            if (i !== -1) {
                                boardsData[i] = n;
                            } else {
                                boardsData.push(n);
                            }
                        }
                    }
                    let dataToPut = data;
                    if (isNote && useIndexedDb && (lastSyncTimestamp || dbExists)) {
                        const nonConflicting = [];
                        for (let serverNote of data) {
                            const localNote = await getFromDB(NOTE_STORE_NAME, serverNote.gdid || serverNote.id);
                            if (localNote) {
                                const isDifferent = serverNote.notetxt !== localNote.notetxt || serverNote.color !== localNote.color || serverNote.calendarDate !== localNote.calendarDate || serverNote.boardid !== localNote.boardid;
                                const localDm = parseInt(localNote.datemod, 10) || 0;
                                const isDirty = lastSyncTimestamp ? (localDm > lastSyncTimestamp) : isDifferent;

                                // Modal Safety: If this note is currently open in the modal, 
                                // we treat it as a conflict ONLY if the user has unsaved changes in the modal.
                                const modalBodyElem = document.getElementById('modal-body');
                                const modalGdid = modalBodyElem?.dataset.gdid;
                                const modalNoteId = modalBodyElem?.dataset.id;
                                const isOpenInModal = (serverNote.gdid && String(serverNote.gdid) === String(modalGdid)) || (serverNote.id && String(serverNote.id) === String(modalNoteId));

                                let hasUnsavedChangesInModal = false;
                                if (isOpenInModal && modalBodyElem) {
                                    const textarea = modalBodyElem.querySelector('textarea');
                                    const titleArea = modalBodyElem.querySelector('#note-edit-title-textarea');
                                    if (textarea) {
                                        let currentText = textarea.value;
                                        if (titleArea) currentText = titleArea.value + '|' + currentText;
                                        hasUnsavedChangesInModal = (currentText !== localNote.notetxt);
                                    }
                                }

                                const isConflict = isDifferent && (isDirty || (isOpenInModal && hasUnsavedChangesInModal));

                                /*
                                console.log(`[Sync-Debug] Note: ${serverNote.gdid || serverNote.id}`);
                                console.log(` - Server dm: ${serverNote.datemod}`);
                                console.log(` - Local dm: ${localNote.datemod}`);
                                console.log(` - Last sync base: ${lastSyncTimestamp || 'None'}`);
                                console.log(` - isDifferent: ${isDifferent}, isDirty: ${isDirty}, isOpenInModal: ${isOpenInModal}, hasUnsavedChanges: ${hasUnsavedChangesInModal}`);
                                */

                                if (isConflict) {
                                    console.log(`[Sync-Conflict!] Buffering for manual resolution: ${serverNote.gdid}${isOpenInModal ? " (Open in Modal with Changes)" : ""}`);
                                    notesForConflictCheck.push({ serverNote, localNote });
                                    continue;
                                } else if (isDifferent && !isDirty && isOpenInModal && !hasUnsavedChangesInModal) {
                                    // Special Case: Open in modal but no changes -> Auto-refresh the modal content
                                    console.log(`[Sync-Update] Auto-refreshing open note: ${serverNote.gdid}`);
                                    // We need to refresh the modal after sync finishes or immediately
                                    setTimeout(() => {
                                        const activeModalBody = document.getElementById('modal-body');
                                        const activeGdid = activeModalBody?.dataset.gdid;
                                        if (activeGdid && String(activeGdid) === String(serverNote.gdid)) {
                                            // Refresh content if still open
                                            showToast(_('noteUpdatedFromServer') || 'Note updated from server', 3000);
                                            // Trigger a refresh of the modal if possible
                                            // For now, it will be updated in allNotesData, but UI might need a nudge
                                        }
                                    }, 500);
                                } else if (isDifferent && !isDirty) {
                                    console.log(`[Sync-Update] Server version is newer: ${serverNote.gdid}`);
                                }
                            }
                            nonConflicting.push(serverNote);
                        }
                        dataToPut = nonConflicting;
                    }
                    if (isNote) {
                        for (const note of dataToPut) {
                            if (note.gdid && !updatedNoteGdims.includes(note.gdid)) {
                                const localNote = await getFromDB(NOTE_STORE_NAME, note.gdid);
                                if (!localNote || (parseInt(note.datemod, 10) > (parseInt(localNote.datemod, 10) || 0))) {
                                    updatedNoteGdims.push(note.gdid);
                                } else {
                                    skippedNotesCount++;
                                }
                            }
                        }
                    }
                    await bulkPutDB(storeName, dataToPut, true);

                    // Update allNotesData in memory to prevent stale data
                    if (isNote) {
                        dataToPut.forEach(newNote => {
                            const mIdx = allNotesData.findIndex(n => n.gdid === newNote.gdid);
                            if (mIdx !== -1) {
                                allNotesData[mIdx] = newNote;
                            } else {
                                allNotesData.push(newNote);
                            }
                        });
                    }

                    console.log(`[Sync] Updated ${filename}:`, dataToPut.length, "items.");
                }
            }
        };

        try {
            console.time("runGoogleDriveSync_Parallel");
            await Promise.all([
                syncFileWorker('board.txt', BOARD_STORE_NAME, false),
                syncFileWorker('media.txt', MEDIA_STORE_NAME, false),
                syncFileWorker('note.txt', NOTE_STORE_NAME, true)
            ]);
        } finally {
            try { console.timeEnd("runGoogleDriveSync_Parallel"); } catch (e) { }
        }
        console.log("[Sync-Run] Parallel sync workers finished. Updated count:", updatedFilesCount);

        await saveConfig('lastGDTimestamp', syncStartTime);

        // --- Conflict Resolution Logic after GDrive Sync ---
        if (useIndexedDb && notesForConflictCheck.length > 0) {
            for (const pair of notesForConflictCheck) {
                const { serverNote, localNote } = pair;
                // Only trigger if content or critical fields actually differ
                if (serverNote.notetxt !== localNote.notetxt || serverNote.color !== localNote.color || serverNote.calendarDate !== localNote.calendarDate || serverNote.boardid !== localNote.boardid) {
                    // We use localNote as baseNote for mergeNotes since we don't have a common third version handy.
                    // This means mergeNotes won't automatically detect field conflicts (as local==base),
                    // so we manually check for differences and populate conflicts.
                    const baseNote = localNote;
                    const { conflicts } = mergeNotes(baseNote, localNote, serverNote);
                    if (Object.keys(conflicts).length === 0) {
                        if (serverNote.notetxt !== localNote.notetxt) conflicts.notetxt = { local: localNote.notetxt, server: serverNote.notetxt };
                        if (serverNote.color !== localNote.color) conflicts.color = { local: localNote.color, server: serverNote.color };
                        if (serverNote.calendarDate !== localNote.calendarDate) conflicts.calendarDate = { local: localNote.calendarDate, server: serverNote.calendarDate };
                    }
                    if (Object.keys(conflicts).length > 0) {
                        const resolved = await showNoteConflictModal(baseNote, localNote, serverNote, conflicts);
                        if (resolved) {
                            await bulkPutDB(NOTE_STORE_NAME, [resolved], true);
                            const mIdx = allNotesData.findIndex(n => n.gdid === resolved.gdid);
                            if (mIdx !== -1) allNotesData[mIdx] = resolved;
                            if (resolved.gdid && !updatedNoteGdims.includes(resolved.gdid)) {
                                updatedNoteGdims.push(resolved.gdid);
                            }
                        }
                    }
                }
            }
        }
        loaderText.textContent = _('syncFinishedLoadingData');
        return Math.max(0, updatedFilesCount - skippedNotesCount);
    } finally {
        isSyncing = false;
    }
}
let cachedLicenseData = null;
let cachedLicenseEmailHint = null;
async function decryptLicenseToken() {
    const currentEmail = sessionStorage.getItem('google_auth_email_hint');
    if (cachedLicenseData !== null && cachedLicenseEmailHint !== currentEmail) {
        cachedLicenseData = null;
    }
    if (cachedLicenseData !== null) return cachedLicenseData;
    cachedLicenseData = { email: null, validityDays: 30, ageInDays: 0, remainingDays: 0, pass: false };
    const url = new URL(window.location.href);
    const urlTokenParam = url.searchParams.get("token");
    if (urlTokenParam) {
        if (urlTokenParam !== localStorage.getItem('urlToken')) {
            localStorage.setItem('urlToken', urlTokenParam);
        }
    }
    let urlToken = localStorage.getItem('urlToken');
    if (!urlToken && typeof TRIAL_URL !== 'undefined') {
        try {
            urlToken = (new URL(TRIAL_URL)).searchParams.get("token");
            console.log("Using hardcoded trial token.");
        } catch (e) { }
    }
    const cachedEmail = localStorage.getItem('cached_whitelist_email');
    if (cachedEmail && cachedEmail !== currentEmail) {
        localStorage.removeItem('cached_whitelist_data');
        localStorage.removeItem('cached_whitelist_time');
        localStorage.removeItem('cached_whitelist_email');
    }
    const cachedDataStr = localStorage.getItem('cached_whitelist_data');
    const cachedTimeStr = localStorage.getItem('cached_whitelist_time');
    let whitelistData = null;
    let cacheIsValid = false;
    if (cachedDataStr && cachedTimeStr && !isOffline) {
        const cachedTime = parseInt(cachedTimeStr, 10);
        if (Date.now() - cachedTime < 24 * 60 * 60 * 1000) {
            try {
                whitelistData = JSON.parse(cachedDataStr);
                cacheIsValid = true;
                console.log("[License] Using cached whitelist data (age: " + Math.round((Date.now() - cachedTime) / 60000) + " minutes).");
                if (Date.now() - cachedTime > 12 * 60 * 60 * 1000) {
                    setTimeout(() => {
                        checkWhitelist(false).then(freshData => {
                            if (freshData) {
                                localStorage.setItem('cached_whitelist_data', JSON.stringify(freshData));
                                localStorage.setItem('cached_whitelist_time', Date.now().toString());
                                localStorage.setItem('cached_whitelist_email', currentEmail || '');
                                console.log("[License] Background whitelist update successful.");
                            }
                        }).catch(e => console.warn("Background whitelist update failed:", e));
                    }, 5000);
                }
            } catch (e) {
                console.warn("Error parsing cached whitelist data:", e);
            }
        }
    }
    if (!cacheIsValid && !isOffline) {
        whitelistData = await checkWhitelist();
        if (whitelistData) {
            localStorage.setItem('cached_whitelist_data', JSON.stringify(whitelistData));
            localStorage.setItem('cached_whitelist_time', Date.now().toString());
            localStorage.setItem('cached_whitelist_email', currentEmail || '');
        }
    }
    if (whitelistData) {
        if (whitelistData.terminated === true || whitelistData.terminated === "YES") {
            console.warn("Access terminated by server administrator.");
            cachedLicenseData.pass = false;
            cachedLicenseData.remainingDays = 0;
            cachedLicenseData.email = whitelistData.email;
            cachedLicenseEmailHint = currentEmail;
            return cachedLicenseData;
        }
        cachedLicenseData.pass = whitelistData.success === true;
        const term = whitelistData.term || whitelistData.newTerm || 30;
        const daysPassed = whitelistData.daysPassed || 0;
        if (whitelistData.success === true) {
            cachedLicenseData.remainingDays = Math.max(0, term - daysPassed);
        } else if ((whitelistData.extended === true || whitelistData.extended === "YES") && whitelistData.newTerm > 0) {
            cachedLicenseData.pass = true;
            cachedLicenseData.remainingDays = whitelistData.newTerm;
        } else {
            cachedLicenseData.remainingDays = 0;
        }
        cachedLicenseData.email = whitelistData.email;
        if (cachedLicenseData.pass) {
            cachedLicenseEmailHint = currentEmail;
            return cachedLicenseData;
        }
    } else if (!isOffline) {
        console.warn("Whitelist check failed.");
    }
    if (!urlToken) {
        if (!ts) {
            ts = await getFirstStartEncoded(true); // Persist if it's the very first start
        }
        const ageInDays = (Date.now() - parseInt(ts, 10)) / (1000 * 60 * 60 * 24);
        const validityInDays = 30;
        const remainingDays = Math.max(0, Math.floor(validityInDays - ageInDays)) + 1;
        cachedLicenseData.ageInDays = ageInDays;
        cachedLicenseData.remainingDays = remainingDays;
        cachedLicenseData.pass = ageInDays < validityInDays;
        cachedLicenseEmailHint = currentEmail;
        if (!cachedLicenseData.pass) {
            console.warn("Trial period has expired. License required.");
        } else if (!whitelistData) {
            console.log(`Working in offline trial mode (${remainingDays} days remaining).`);
        }
        return cachedLicenseData;
    }
    try {
        const b64 = urlToken.replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64 + '='.repeat((4 - b64.length % 4) % 4);
        const raw = Uint8Array.from(atob(pad), c => c.charCodeAt(0));
        const iv = raw.slice(0, 12), data = raw.slice(12);
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(CLIENT_ID.match(/-(.{16})/)[1]), { name: 'AES-GCM' }, false, ['decrypt']);
        const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        const [decryptedEmail, timestamp, tokenValidity] = new TextDecoder().decode(out).split('|');
        const isDeviceValidated = (localStorage.getItem('validatedTokenForDevice') === urlToken);
        if (!isDeviceValidated) {
            const localPart = decryptedEmail.split('@')[0];
            if (localPart !== 'all' && currentEmail && decryptedEmail !== currentEmail) {
                // Do not remove the token, so it consistently fails instead of reverting to the trial on reload
                throw new Error(`Token email (${decryptedEmail}) mismatch for user (${currentEmail})`);
            }
            if (currentEmail) {
                localStorage.setItem('validatedTokenForDevice', urlToken);
            }
        }
        if (!ts) ts = await getFirstStartEncoded();
        const ageInDays = (Date.now() - parseInt(ts, 10)) / (1000 * 60 * 60 * 24);
        let validityInDays = 30;
        if (tokenValidity && !isNaN(parseInt(tokenValidity))) validityInDays = parseInt(tokenValidity, 10);
        const remainingDays = Math.max(0, Math.ceil(validityInDays - ageInDays));
        cachedLicenseData = { urlTokenUsed: urlToken, email: decryptedEmail, validityDays: validityInDays, ageInDays, remainingDays, pass: ageInDays < validityInDays };
        cachedLicenseEmailHint = currentEmail;
        console.log(`License token: Age: ${ageInDays.toFixed(2)} days, Remaining: ${remainingDays} days`);
    } catch (error) {
        console.warn("Error decrypting license token.", error);
        cachedLicenseData.pass = false;
        cachedLicenseData.remainingDays = 0;
        cachedLicenseEmailHint = currentEmail;
    }
    return cachedLicenseData;
}

/**
 * Refreshes the Google Auth Token silently if possible.
 */
// Singleton promise to prevent multiple concurrent refresh attempts
let refreshPromise = null;

async function refreshAuthToken(forcePopup = false) {
    if (refreshPromise) return refreshPromise;

    refreshPromise = new Promise(async (resolve, reject) => {
        console.log("Refreshing auth token (forcePopup: " + forcePopup + ")...");
        try {
            // Wait for Google Identity Services to load (with timeout)
            const waitForGis = () => new Promise((res, rej) => {
                if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                    res(true);
                    return;
                }
                let attempts = 0;
                const maxAttempts = 150; // 15 seconds total (150 * 100ms)
                const checkInterval = setInterval(() => {
                    attempts++;
                    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                        clearInterval(checkInterval);
                        res(true);
                    } else if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        rej(new Error("Google Identity Services not loaded after 15 seconds."));
                    }
                }, 100);
            });

            try {
                await waitForGis();
            } catch (gisError) {
                console.warn("GIS not available, cannot refresh token:", gisError.message);
                reject(new Error("Google Identity Services not loaded. User interaction required."));
                return;
            }
            const client = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (tokenResponse) => {
                    clearTimeout(requestTimeout); // Спираме таймера при отговор
                    document.body.classList.remove('silent-token-refresh');
                    if (tokenResponse && tokenResponse.access_token) {
                        const tokenWithTimestamp = { ...tokenResponse, issued_at: Date.now() };
                        // Determine storage based on existing token location or rememberMe
                        if (sessionStorage.getItem('google_auth_token')) {
                            sessionStorage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                        }
                        const rememberMe = localStorage.getItem('google_auth_token') !== null ||
                            localStorage.getItem('rememberMe') === 'true';
                        if (rememberMe) {
                            localStorage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                        } else if (!sessionStorage.getItem('google_auth_token')) {
                            sessionStorage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                        }
                        console.log("Token refreshed successfully.");
                        // Update global state immediately
                        authToken = tokenWithTimestamp;
                        if (typeof gapi !== 'undefined' && gapi.client) {
                            gapi.client.setToken({ access_token: authToken.access_token });
                        }
                        resolve({ pass: true, tokenData: tokenWithTimestamp });
                    } else {
                        console.warn("Token refresh failed:", tokenResponse);
                        // Handle cases where interaction is required (e.g. session expired after long idle)
                        if (tokenResponse && (tokenResponse.error === 'interaction_required' || tokenResponse.error === 'access_denied')) {
                            if (typeof showToast === 'function') {
                                showToast(_('sessionExpired') || "Session expired. Please sign in again.", 5000);
                            }
                            // Small delay to let the user see the toast before redirect
                            setTimeout(() => {
                                if (typeof initLoginPage === 'function') initLoginPage();
                            }, 1500);
                        }
                        resolve({ pass: false, error: tokenResponse });
                    }
                },
            });

            const loginHint = localStorage.getItem('google_login_hint') ||
                (cachedLicenseData && cachedLicenseData.email_hint);

            // Request the token
            const tokenOptions = {
                prompt: forcePopup ? 'select_account' : 'none'
            };
            if (loginHint) tokenOptions.hint = loginHint;

            // Таймер за безопасност: ако Google не отговори
            const isSilent = !forcePopup && tokenOptions.prompt === 'none';
            const timeoutDuration = isSilent ? 5000 : 30000; // 5s за тих опит, 30s за попъп
            if (isSilent) {
                if (!document.getElementById('silent-refresh-style')) {
                    const style = document.createElement('style');
                    style.id = 'silent-refresh-style';
                    style.textContent = 'body.silent-token-refresh iframe[src*="accounts.google.com"]{position:fixed!important;left:-9999px!important;top:-9999px!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;}';
                    document.head.appendChild(style);
                }
                document.body.classList.add('silent-token-refresh');
            }
            const requestTimeout = setTimeout(() => {
                document.body.classList.remove('silent-token-refresh');
                const errMsg = isSilent ? "Silent token refresh failed/blocked." : "Token refresh request timed out after 30s.";
                console.warn(errMsg);
                reject(new Error(errMsg));
            }, timeoutDuration);
            client.requestAccessToken(tokenOptions);
        } catch (error) {
            console.error("Critical error in refreshAuthToken:", error);
            reject(error);
        }
    }).finally(() => {
        refreshPromise = null;
    });

    return refreshPromise;
}

function notifyManualGoogleLoginRequired() {
    if (typeof showToast === 'function') {
        showToast(_('sessionExpired') || "Session expired. Please sign in again.", 5000);
    }
    setTimeout(() => {
        if (typeof initLoginPage === 'function') initLoginPage();
    }, 1500);
}

/**
 * Downloads file contents with Concurrency Control & 'Kick' mechanism.
 */
async function fetchFiles(filename, folderId, onProgress, modifiedSince = null) {
    let query = `'${folderId}' in parents and name = '${filename}' and mimeType='text/plain' and trashed = false`;
    if (modifiedSince) query += ` and modifiedTime > '${modifiedSince}'`;
    let allFiles = [];
    if (filename) console.time(`fetchFiles_${filename}_List`);

    const listFiles = async (token) => {
        let files = [];
        let nextToken = null;
        do {
            const spacesParam = (folderId === 'appDataFolder') ? '&spaces=appDataFolder' : '';
            const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name),nextPageToken&pageSize=1000${nextToken ? `&pageToken=${nextToken}` : ''}${spacesParam}&t=${Date.now()}`;
            const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) {
                const errorData = await resp.json().catch(() => ({}));
                if (resp.status === 401) throw { status: 401, error: errorData };
                throw new Error(`Drive API List failed: ${resp.status} ${JSON.stringify(errorData)}`);
            }
            const result = await resp.json();
            files.push(...(result.files || []));
            nextToken = result.nextPageToken;
        } while (nextToken);
        return files;
    };

    let attempts = 0;
    const maxAttempts = 3;
    try {
        while (attempts < maxAttempts) {
            attempts++;
            try {
                let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
                if (!storedTokenString) throw new Error(_('errorTokenMissing'));
                let tokenData = JSON.parse(storedTokenString);
                allFiles = await listFiles(tokenData.access_token);
                break;
            } catch (e) {
                if (e.status === 401 || (e.result && e.result.error && e.result.error.code === 401)) {
                    if (attempts >= maxAttempts) throw new Error("Drive API List failed (Auth) after retries.");
                    console.warn(`Got 401 during file list (Attempt ${attempts}), attempting token refresh...`);
                    try {
                        const refreshed = await refreshAuthToken(false);
                        if (!refreshed || !refreshed.pass) throw new Error("Token refresh failed.");
                        await new Promise(r => setTimeout(r, 500));
                    } catch (refreshError) {
                        console.error("Token refresh failed during retry:", refreshError);
                        notifyManualGoogleLoginRequired();
                        throw new Error("Drive API List failed (Auth Refresh Failed).");
                    }
                } else throw e;
            }
        }
    } finally {
        if (filename) {
            try { console.timeEnd(`fetchFiles_${filename}_List`); } catch (e) { }
        }
    }
    if (allFiles.length === 0) return [];
    let loadedFiles = 0;
    const totalFiles = allFiles.length;
    // --- robust token retrieval ---
    const tokenObj = (typeof authToken !== 'undefined' && authToken) ? authToken : (gapi.client.getToken() || gapi.auth.getToken());
    let accessToken = tokenObj ? tokenObj.access_token : null;
    if (!accessToken) {
        console.error("No access token found for file download!");
        throw new Error("Missing auth token.");
    }
    // LIMIT CONCURRENCY: Don't overwhelm the browser socket pool
    const CONCURRENCY_LIMIT = 100;
    console.log(`[${filename}] Starting throttled fetch. Total: ${totalFiles}, Limit: ${CONCURRENCY_LIMIT}`);
    if (filename) {
        try { console.time(`fetchFiles_${filename}_Total`); } catch (e) { }
    }
    const UI_STEP = totalFiles <= 50 ? 1 : Math.max(5, Math.floor(totalFiles / 50));

    const downloadWithKick = async (file, attempt = 1) => {
        const controller = new AbortController();
        const kickId = setTimeout(() => { if (attempt === 1) controller.abort(); }, 1200);
        try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&t=${Date.now()}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                cache: 'no-store',
                priority: 'high',
                signal: controller.signal
            });
            clearTimeout(kickId);

            if (!response.ok) {
                if (response.status === 401) {
                    console.warn(`Got 401 fetching file ${file.id}, refreshing token...`);
                    const refreshResult = await refreshAuthToken();
                    if (refreshResult && refreshResult.tokenData) {
                        accessToken = refreshResult.tokenData.access_token;
                    } else {
                        throw new Error("Token refresh failed");
                    }

                    // Retry
                    const retryResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&t=${Date.now()}`, {
                        headers: { 'Authorization': `Bearer ${accessToken}` },
                        cache: 'no-store',
                        priority: 'high'
                    });

                    if (!retryResponse.ok) throw new Error(`HTTP Error ${retryResponse.status}`);
                    const body = await retryResponse.text();

                    loadedFiles++;
                    if (onProgress && (loadedFiles % UI_STEP === 0 || loadedFiles === totalFiles)) {
                        onProgress(loadedFiles, totalFiles);
                    }
                    return { res: { body }, id: file.id };
                }
                throw new Error(`HTTP Error ${response.status}`);
            }

            const body = await response.text();
            if (file.id === '1aQ67KIr7Lv6cLhimAwcznpr3n11z0KmP') {
                console.warn(`[DEBUG-LOAD] Content of ${file.id}:`, body.substring(0, 200));
            }
            loadedFiles++;
            if (onProgress && (loadedFiles % UI_STEP === 0 || loadedFiles === totalFiles)) {
                onProgress(loadedFiles, totalFiles);
            }
            return { res: { body }, id: file.id };

        } catch (error) {
            clearTimeout(kickId);
            if ((error.name === 'AbortError' || error.message.includes('aborted')) && attempt === 1) {
                return downloadWithKick(file, 2);
            }
            if (attempt < 3 && error.name !== 'AbortError') {
                return new Promise(resolve => setTimeout(() => resolve(downloadWithKick(file, attempt + 1)), 500));
            }
            console.error(`[${filename}] Error for ${file.name}:`, error.message);
            return { res: null, id: file.id };
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
    if (filename) {
        try { console.timeEnd(`fetchFiles_${filename}_Total`); } catch (e) { }
    }
    return finalResults;
}

async function getFileID(folderId, fileName) {
    if (isOffline) return null;
    try {
        const query = encodeURIComponent(`'${folderId}' in parents and name = '${fileName}'`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=1`;

        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) return null;
        let tokenData = JSON.parse(storedTokenString);

        let resp = await fetch(url, { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
        if (resp.status === 401) {
            const refresh = await refreshAuthToken(false);
            if (refresh && refresh.pass) {
                tokenData = refresh.tokenData;
                resp = await fetch(url, { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
            }
        }
        if (!resp.ok) return null;
        const result = await resp.json();
        return result.files?.[0]?.id || null;
    } catch (e) { return null; }
}
async function updateLocalFile(gdid, content) {
    if (!gdid) return false;
    try {
        const handle = await getDirectoryHandle();
        if (!handle) {
            // Няма handle (например Android) — fallback към изтегляне
            if (typeof downloadAsFile === 'function') {
                const fname = localFileMap.get(gdid) || `note-${gdid}.txt`;
                downloadAsFile(fname, content, 'text/plain');
                return true;
            }
            return false;
        }
        let filename = localFileMap.get(gdid);
        if (!filename) {
            // Ако нямаме записано име, търсим свободно такова по схемата note.txt, note (1).txt...
            filename = `note.txt`;
            let exists = false;
            try {
                await handle.getFileHandle(filename, { create: false });
                exists = true;
            } catch (e) { exists = false; }
            if (exists) {
                let counter = 1;
                while (true) {
                    filename = `note (${counter}).txt`;
                    try {
                        await handle.getFileHandle(filename, { create: false });
                        counter++;
                    } catch (e) { break; }
                }
            }
            localFileMap.set(gdid, filename);
        }
        const fileHandle = await handle.getFileHandle(filename, { create: true });
        try {
            const writable = await fileHandle.createWritable();
            try {
                await writable.write(new Blob([content], { type: 'text/plain' }));
            } finally {
                await writable.close();
            }
        } catch (writeErr) {
            // createWritable не се поддържа (Android) — fallback към изтегляне
            console.warn(`createWritable failed for ${filename}, falling back to download:`, writeErr.message);
            if (typeof downloadAsFile === 'function') {
                downloadAsFile(filename, content, 'text/plain');
            }
        }
        return true;
    } catch (e) {
        console.error("Local file update failed:", e);
        return false;
    }
}
async function deleteLocalFile(gdid) {
    if (!gdid) return false;
    try {
        const handle = await getDirectoryHandle();
        if (!handle) return false;

        const filename = localFileMap.get(gdid);
        if (filename) {
            await handle.removeEntry(filename);
            localFileMap.delete(gdid);
            return true;
        }
        return false;
    } catch (e) {
        if (e.name === 'NotFoundError') return true;
        console.error("Local file delete failed:", e);
        return false;
    }
}
async function updateGDriveFile(fileId, content) {
    if (isOffline || !fileId) return false;
    const sendRequest = async (token) => {
        return fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'text/plain'
            },
            body: content
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) throw new Error(_('errorTokenMissing'));
        let tokenData = JSON.parse(storedTokenString);
        let response = await sendRequest(tokenData.access_token);
        if (response.status === 401) {
            console.warn("401 Unauthorized in updateGDriveFile, attempting silent refresh...");
            let refreshResult = await refreshAuthToken(false);
            if (refreshResult && refreshResult.pass) {
                tokenData = refreshResult.tokenData;
                response = await sendRequest(tokenData.access_token);
            }
            if (response.status === 401) {
                notifyManualGoogleLoginRequired();
            }
            if (response.status === 401) throw new Error("401 Unauthorized - access token expired.");
        }
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[GDrive-Error] Status: ${response.status}, Details: ${errorText}`);
            throw new Error(`${_('errorSaveGDrive')} (Status: ${response.status})`);
        }
        return true;
    } catch (error) {
        console.error("GDrive update failed:", error);
        throw error;
    }
}
async function deleteGDriveFile(fileId) {
    if (!fileId) return false;
    const sendRequest = async (token) => {
        return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) throw new Error(_('errorTokenMissing'));
        let tokenData = JSON.parse(storedTokenString);
        let response = await sendRequest(tokenData.access_token);
        if (response.status === 401) {
            console.warn("401 Unauthorized in deleteGDriveFile, attempting silent refresh...");
            let refreshResult = await refreshAuthToken(false);
            if (refreshResult && refreshResult.pass) {
                tokenData = refreshResult.tokenData;
                response = await sendRequest(tokenData.access_token);
            }
            if (response.status === 401) {
                notifyManualGoogleLoginRequired();
            }
            if (response.status === 401) throw new Error("401 Unauthorized - access token expired.");
        }
        if (response.status === 404) return false;
        if (!response.ok && response.status !== 204) throw new Error(`HTTP Error ${response.status}`);
        return true;
    } catch (error) {
        console.error("GDrive delete failed:", error);
        throw error;
    }
}

async function emptyAppDataFolder() {
    if (isOffline) return false;
    let nextPageToken = null;
    let allFiles = [];
    try {
        do {
            const query = encodeURIComponent("trashed=false");
            const url = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,parents),nextPageToken&pageSize=1000${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
            const sendRequest = async (token) => {
                return fetch(url, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            };
            let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
            if (!storedTokenString) return false;
            let tokenData = JSON.parse(storedTokenString);
            let response = await sendRequest(tokenData.access_token);
            if (response.status === 401) {
                let refreshResult = await refreshAuthToken(false);
                if (refreshResult && refreshResult.pass) {
                    tokenData = refreshResult.tokenData;
                    response = await sendRequest(tokenData.access_token);
                }
            }
            if (!response.ok) break;
            const result = await response.json();
            if (result.files) {
                allFiles = allFiles.concat(result.files);
            }
            nextPageToken = result.nextPageToken;
        } while (nextPageToken);
        if (allFiles.length === 0) return true;
        const appSettingsId = await getAppSettingsFolderId();
        const pool = new Set();
        const CONCURRENCY_LIMIT = 10;
        for (const file of allFiles) {
            const id = file.id;
            const parents = file.parents || [];
            if (id === appSettingsId || parents.includes(appSettingsId)) continue;
            if (pool.size >= CONCURRENCY_LIMIT) await Promise.race(pool);
            const promise = deleteGDriveFile(id).finally(() => pool.delete(promise));
            pool.add(promise);
        }
        await Promise.all(pool);
        return true;
    } catch (e) {
        console.error("emptyAppDataFolder error:", e);
        return false;
    }
}


/**
 * Търси максималните стойности на id и numord сред бележките и ги запазва в глобални променливи,
 * ако са по-големи от текущите им стойности (1 000 000).
 */
function trackMaxIds(notes) {
    if (!Array.isArray(notes)) return;
    let changed = false;
    notes.forEach(note => {
        const id = parseInt(note.id, 10);
        const numord = parseInt(note.numord, 10);
        if (!isNaN(id) && id > noteId) { noteId = id; changed = true; }
        if (!isNaN(numord) && numord > noteNumord) { noteNumord = numord; changed = true; }
    });
    if (changed) syncFolderDataAsync();
}

/**
 * Създава нов файл в Google Drive в указаната папка.
 */
async function createGDriveFile(folderId, filename, content) {
    if (isOffline) return null;
    const sendRequest = async (token) => {
        const metadata = {
            name: filename,
            parents: [folderId],
            mimeType: 'text/plain'
        };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: 'text/plain' }));
        return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) throw new Error(_('errorTokenMissing'));
        let tokenData = JSON.parse(storedTokenString);
        let response = await sendRequest(tokenData.access_token);
        if (response.status === 401) {
            console.warn("401 Unauthorized in createGDriveFile, attempting silent refresh...");
            let refreshResult = await refreshAuthToken(false);
            if (refreshResult && refreshResult.pass) {
                tokenData = refreshResult.tokenData;
                response = await sendRequest(tokenData.access_token);
            }
            if (response.status === 401) {
                notifyManualGoogleLoginRequired();
            }
            if (response.status === 401) throw new Error("401 Unauthorized - access token expired.");
        }
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const result = await response.json();
        return result.id;
    } catch (e) {
        console.error("Error creating GDrive file:", e);
        throw e;
    }
}

// Uploads a binary Blob (image, etc.) to Google Drive and returns the file ID
async function uploadBlobToGDrive(folderId, filename, blob, mimeType) {
    if (isOffline) return null;
    const sendRequest = async (token) => {
        const metadata = {
            name: filename,
            parents: [folderId]
        };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob, filename);
        return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) throw new Error(_('errorTokenMissing'));
        let tokenData = JSON.parse(storedTokenString);
        let response = await sendRequest(tokenData.access_token);
        if (response.status === 401) {
            let refreshResult = await refreshAuthToken(false);
            if (refreshResult && refreshResult.pass) {
                tokenData = refreshResult.tokenData;
                response = await sendRequest(tokenData.access_token);
            }
            if (response.status === 401) {
                notifyManualGoogleLoginRequired();
            }
            if (response.status === 401) throw new Error("401 Unauthorized - access token expired.");
        }
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const result = await response.json();
        return result.id;
    } catch (e) {
        console.error("Error uploading blob to GDrive:", e);
        throw e;
    }
}

async function createNewGDriveFolder(folderName, parentId = null) {
    if (isOffline) return null;
    const sendRequest = async (token) => {
        const body = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        };
        if (parentId) body.parents = [parentId];
        return fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) throw new Error(_('errorTokenMissing'));
        let tokenData = JSON.parse(storedTokenString);
        let response = await sendRequest(tokenData.access_token);
        if (response.status === 401) {
            let refreshResult = await refreshAuthToken(false);
            if (refreshResult && refreshResult.pass) {
                tokenData = refreshResult.tokenData;
                response = await sendRequest(tokenData.access_token);
            }
        }
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const result = await response.json();
        return result.id;
    } catch (e) {
        console.error("Error creating GDrive folder:", e);
        throw e;
    }
}

/**
 * Създава нова бележка в текущия борд.
 */
async function isGDriveFolderEmpty(folderId) {
    if (isOffline || !folderId) return true;
    const sendRequest = async (token) => {
        const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
        const spacesParam = (folderId === 'appDataFolder') ? '&spaces=appDataFolder' : '';
        return fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=1&fields=files(id)${spacesParam}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) return true;
        let tokenData = JSON.parse(storedTokenString);
        let resp = await sendRequest(tokenData.access_token);
        if (resp.status === 401) {
            let refresh = await refreshAuthToken(false);
            if (refresh && refresh.pass) resp = await sendRequest(refresh.tokenData.access_token);
        }
        if (!resp.ok) return true;
        const result = await resp.json();
        return !result.files || result.files.length === 0;
    } catch (e) {
        console.error("isGDriveFolderEmpty error:", e);
        return true;
    }
}

async function copyGDriveFile(fileId, newParentId, newName) {
    if (isOffline || !fileId || !newParentId) return null;
    const sendRequest = async (token) => {
        const body = { parents: [newParentId] };
        if (newName) body.name = newName;
        return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
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
        if (!resp.ok) {
            if (resp.status === 404) {
                console.warn(`[GDrive] Copy failed: File ${fileId} not found (404). Skipping.`);
                return null;
            }
            throw new Error(`HTTP Error ${resp.status}`);
        }
        const result = await resp.json();
        return result.id;
    } catch (e) {
        if (e.message && e.message.includes('404')) {
            console.warn(`[GDrive] Copy failed: File ${fileId} not found (404). Skipping.`);
            return null;
        }
        console.error("copyGDriveFile error:", e);
        return null;
    }
}

async function migrateDataToNewFolder(targetFolderId) {
    const backupOnBeforeUnload = window.onbeforeunload;
    let reloadBtn = document.getElementById('reload_button');
    let counterElem = document.getElementById('note-counter');
    const originalReloadHtml = reloadBtn ? reloadBtn.innerHTML : null;

    // Ако липсва counter-elem в DOM, опитваме да го намерим по друг начин
    if (!counterElem) counterElem = document.querySelector('.note-counter') || document.getElementById('footer-note-count');
    const originalCounterHtml = counterElem ? counterElem.innerHTML : null;
    const CONCURRENCY_LIMIT = 10;
    try {
        window.onbeforeunload = function () { return _('migrationInProgressWarn') || "Migration in progress, please wait..."; };
        if (reloadBtn) {
            reloadBtn.style.pointerEvents = 'none';
            reloadBtn.innerHTML = `<img src="Refresh.png" style="width:24px; height:24px; animation: spin 0.8s linear infinite;">`;
        }
        if (typeof showToast === 'function') showToast(_('migratingData') + " (Parallel)");
        console.time("Migration_Parallel");
        const subfolderNames = ["Other", "Sound", "Video", "Images"];
        const newSubfolderIds = {};
        for (const name of subfolderNames) {
            newSubfolderIds[name] = await createNewGDriveFolder(name, targetFolderId);
        }
        const rawBoards = (boardsData || []);
        const boardsToMigrate = [];
        const seenTitles = new Set();
        for (const b of rawBoards) {
            if (b.title && !seenTitles.has(b.title)) {
                boardsToMigrate.push(b);
                seenTitles.add(b.title);
            }
        }
        const totalBoards = boardsToMigrate.length;
        const boardGdidMap = {};
        let pool = new Set();
        let boardResults = [];
        let completedBoards = 0;
        for (let i = 0; i < totalBoards; i++) {
            if (pool.size >= CONCURRENCY_LIMIT) await Promise.race(pool);
            const board = boardsToMigrate[i];
            const oldGdid = board.gdid;
            const oldId = board.id;
            const boardToSave = JSON.parse(JSON.stringify(board));
            const promise = createGDriveFile(targetFolderId, 'board.txt', JSON.stringify(boardToSave)).then(async res => {
                if (res) {
                    boardToSave.gdid = res;
                    // Обновяваме файла в облака, за да съдържа новото ID
                    await updateGDriveFile(res, JSON.stringify(boardToSave));

                    board.gdid = res;
                    if (oldGdid) boardGdidMap[oldGdid] = res;
                    if (oldId) boardGdidMap[oldId] = res;
                    if (useIndexedDb) await bulkPutDB(BOARD_STORE_NAME, [boardToSave], true);
                }
                pool.delete(promise);
                completedBoards++;
                if (counterElem) counterElem.innerText = `[B] ${completedBoards}/${totalBoards}`;
                return res;
            });
            pool.add(promise);
            boardResults.push(promise);
        }

        await Promise.all(boardResults);
        const notesToMigrate = (allNotesData || []);
        const totalNotes = notesToMigrate.length;
        const mediaToMigrate = (mediaData || []);
        const mediaNotesMap = {};
        for (const item of mediaToMigrate) {
            if (item.noteid) mediaNotesMap[item.noteid] = null;
        }
        pool = new Set();
        let noteResults = [];
        let completedNotes = 0;
        for (let i = 0; i < totalNotes; i++) {
            if (pool.size >= CONCURRENCY_LIMIT) await Promise.race(pool);
            const note = { ...notesToMigrate[i] }; // Клонираме, за да не повредим оригинала в паметта
            const oldGdid = note.gdid;
            delete note.gdid;
            const promise = (async () => {
                try {
                    // Update boardid mapping for the note using the mapping table
                    if (note.boardid && boardGdidMap[note.boardid]) {
                        note.boardid = boardGdidMap[note.boardid];
                    }
                    const newId = await createGDriveFile(targetFolderId, 'note.txt', JSON.stringify(note));
                    if (newId) {
                        note.gdid = newId;
                        if (oldGdid && mediaNotesMap.hasOwnProperty(oldGdid)) {
                            mediaNotesMap[oldGdid] = newId;
                        }
                        if (useIndexedDb) await bulkPutDB(NOTE_STORE_NAME, [note], true);
                    }
                } finally {
                    completedNotes++;
                    if (counterElem) counterElem.innerText = `[N] ${completedNotes}/${totalNotes}`;
                }
            })().then(() => {
                pool.delete(promise);
            });
            pool.add(promise);
            noteResults.push(promise);
        }
        await Promise.all(noteResults);
        const newMediaData = [];
        const totalMedia = mediaToMigrate.length;
        pool = new Set();
        let mediaResults = [];
        let completedMedia = 0;
        for (let i = 0; i < totalMedia; i++) {
            if (pool.size >= CONCURRENCY_LIMIT) await Promise.race(pool);
            const item = mediaToMigrate[i];
            const promise = (async () => {
                const newItem = { ...item };
                if (newItem.noteid && mediaNotesMap[newItem.noteid]) {
                    newItem.noteid = mediaNotesMap[newItem.noteid];
                }
                const typeFolderName = (item.type === 1 ? "Images" : (item.type === 2 ? "Sound" : (item.type === 4 ? "Video" : "Other")));
                const targetSubfolderId = newSubfolderIds[typeFolderName];
                if (item.pathGD && targetSubfolderId) {
                    const newId = await copyGDriveFile(item.pathGD, targetSubfolderId, item.filename);
                    if (newId) newItem.pathGD = newId;
                }
                newMediaData.push(newItem);
                completedMedia++;
                if (counterElem) counterElem.innerText = `[M] ${completedMedia}/${totalMedia}`;
            })().then(() => {
                pool.delete(promise);
            });
            pool.add(promise);
            mediaResults.push(promise);
        }
        await Promise.all(mediaResults);
        if (newMediaData.length > 0) {
            await createGDriveFile(targetFolderId, 'media.txt', JSON.stringify(newMediaData));
            if (useIndexedDb) {
                for (let m of newMediaData) await bulkPutDB(MEDIA_STORE_NAME, [m], true);
            }
        }

        // Update sync timestamp and last folder for consistency
        const now = Date.now();
        localStorage.setItem('lastSyncTimestamp', now);
        lastSyncTimestamp = now;

        if (typeof showToast === 'function') showToast(_('migrationSuccess'));
        console.timeEnd("Migration_Parallel");
        return true;
    } catch (e) {
        console.error("Parallel migration error:", e);
        if (typeof showToast === 'function') showToast(_('migrationError'));
        return false;
    } finally {
        window.onbeforeunload = backupOnBeforeUnload;
        if (reloadBtn) {
            reloadBtn.style.pointerEvents = 'auto';
            reloadBtn.innerHTML = originalReloadHtml;
        }
        if (counterElem) counterElem.innerHTML = originalCounterHtml;
    }
}


let cachedFolderIdsByName = {};
async function getFolderIDByName(name) {
    if (isOffline) return null;
    if (name === 'AppDataFolder') return 'appDataFolder';
    if (cachedFolderIdsByName[name]) return cachedFolderIdsByName[name];
    const sendRequest = async (token) => {
        const query = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
        return fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) return null;
        let tokenData = JSON.parse(storedTokenString);
        let resp = await sendRequest(tokenData.access_token);
        if (resp.status === 401 || resp.status === 403) {
            let refresh = await refreshAuthToken(false);
            if (refresh && refresh.pass) {
                tokenData = refresh.tokenData;
                resp = await sendRequest(tokenData.access_token);
            }
        }
        if (!resp.ok) return null;
        const result = await resp.json();
        const id = result.files?.[0]?.id || null;
        if (id) cachedFolderIdsByName[name] = id;
        return id;
    } catch (e) {
        console.error("Error in getFolderIDByName:", e);
        return null;
    }
}

let _appSettingsFolderIdPromise = null;
async function getAppSettingsFolderId() {
    if (isOffline) return null;
    if (cachedFolderIdsByName['appDataFolder:AppSettings']) return cachedFolderIdsByName['appDataFolder:AppSettings'];
    if (_appSettingsFolderIdPromise) return _appSettingsFolderIdPromise;

    _appSettingsFolderIdPromise = (async () => {
        const findFolder = async (token) => {
            const query = encodeURIComponent("name='AppSettings' and mimeType='application/vnd.google-apps.folder' and trashed=false");
            // Извличаме всички копия, сортирани по последна промяна (най-новия първи)
            return fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        };
        try {
            let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
            if (!storedTokenString) return null;
            let tokenData = JSON.parse(storedTokenString);
            let resp = await findFolder(tokenData.access_token);
            if (resp.status === 401) {
                let refresh = await refreshAuthToken(false);
                if (refresh && refresh.pass) {
                    tokenData = refresh.tokenData;
                    resp = await findFolder(tokenData.access_token);
                }
            }
            if (resp.ok) {
                const result = await resp.json();
                if (result.files && result.files.length > 0) {
                    // Ако има дубликати на папката AppSettings, изтриваме старите и оставяме най-новата
                    if (result.files.length > 1) {
                        console.warn("[Sync] Cleanup duplicates for AppSettings folder.");
                        for (let i = 1; i < result.files.length; i++) {
                            deleteGDriveFile(result.files[i].id).catch(err => console.error("Error deleting duplicate folder:", err));
                        }
                    }
                    const id = result.files[0].id;
                    cachedFolderIdsByName['appDataFolder:AppSettings'] = id;
                    return id;
                }
            }
            const newId = await createNewGDriveFolder('AppSettings', 'appDataFolder');
            if (newId) cachedFolderIdsByName['appDataFolder:AppSettings'] = newId;
            return newId;
        } catch (e) {
            console.error("getAppSettingsFolderId error:", e);
            return null;
        }
    })();

    try {
        const result = await _appSettingsFolderIdPromise;
        return result;
    } finally {
        _appSettingsFolderIdPromise = null;
    }
}


/**
 * Създава нова бележка в текущия борд.
 */
async function createNewNote() {
    const updateGDrive = useGoogleDb && !isOffline;
    const useLocalFolderNow = (localStorage.getItem('updateLocalFolder') === 'true') && !isOffline;


    if (boardsData.length === 0) {
        showToast(_('errorNoBoards') || "Моля, създайте първо поне един борд, преди да добавяте бележки.", 3000);
        if (typeof showNewBoardModal === 'function') {
            setTimeout(showNewBoardModal, 100);
        }
        return;
    }

    let boardId = currentBoardFilter;
    // Разширен списък на системни/виртуални бордове, в които не може да се създават бележки директно
    const systemBoards = [
        'all', 'calendar', 'reminders', 'photos', 'videos', 'sounds',
        'other', 'new-updates', 'search', 'favorites', 'archived'
    ];

    // Проверка дали boardId е системен ИЛИ дали не съществува в boardsData (освен ако списъкът с бордове не е празен)
    const isRealBoard = boardsData.some(b => String(b.gdid) === String(boardId));

    if (systemBoards.includes(boardId) || (!isRealBoard && boardsData.length > 0)) {
        showToast(_('cannotCreateInSystemBoard') || "Please select a specific board to create a note.", 3000);
        return;
    }

    // Увеличаваме броячите
    noteId++;
    noteNumord++;
    const now = Date.now();

    // Base note structure
    const newNote = {
        "alarm_type": -1,
        "boardid": boardId,
        "calendarDate": 0,
        "color": 0,
        "date": now,
        "datemod": now,
        "eventId": 0,
        "gdid": "",
        "id": noteId, // Temporary ID, will be finalized on save
        "notetxt": "",
        "numord": noteNumord,
        "pass": false,
        "pinnedAt": 0,
        "sellist": 0,
        "status": 0,
        "text_span": "",
        "timer": 0,
        "timer_type": -1,
        "timer_val": 1,
        "title_span": "",
        "type": 0,
        "version": 243
    };

    try {
        // Open modal in "New Note" mode (deferred creation)
        if (typeof showModal === 'function') {
            showModal({
                raw: newNote.notetxt,
                format: newNote.text_span,
                color: newNote.color,
                boardId: newNote.boardid,
                id: newNote.id,
                gdid: newNote.gdid,
                numord: newNote.numord,
                isNewNote: true // Flag for deferred creation
            });

            // Auto-enter edit mode
            setTimeout(() => {
                const editBtn = document.getElementById('note-edit-btn');
                if (editBtn) editBtn.click();
            }, 100);
        }

        // Force save button to appear immediately because it's a new unsaved note
        // (Handled by enableNoteEditing, but we ensure button visibility logic there)

    } catch (error) {
        console.error("Create note setup failed:", error);
        if (typeof showToast === 'function') showToast("Error initializing note: " + error.message, 5000);
    }
}

let cachedMainFolderId = null;
async function getFolderID() {
    if (isOffline) return null;
    if (cachedMainFolderId) return cachedMainFolderId;
    try {
        const multinotesDataId = await getMultinotesDataFolderID();
        if (!multinotesDataId) return null;
        cachedMainFolderId = multinotesDataId;

        const listFolders = async () => {
            const folderNames = ["Other", "Sound", "Video", "Images"];
            const storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
            if (!storedTokenString) return;
            let tokenData = JSON.parse(storedTokenString);

            await Promise.all(folderNames.map(async (name) => {
                const cachedId = localStorage.getItem(`gdrive_folder_id_${name}`);
                if (cachedId) { folderIds[name] = cachedId; return; }

                const query = encodeURIComponent(`'${multinotesDataId}' in parents and name = '${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
                const spacesParam = (multinotesDataId === 'appDataFolder') ? '&spaces=appDataFolder' : '';
                const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1${spacesParam}`;

                let resp = await fetch(url, { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });

                if (resp.status === 401) {
                    const refresh = await refreshAuthToken(false);
                    if (refresh && refresh.pass) {
                        tokenData = refresh.tokenData;
                        resp = await fetch(url, { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
                    }
                }

                if (resp.ok) {
                    const result = await resp.json();
                    const id = result.files?.[0]?.id || "";
                    folderIds[name] = id;
                    if (id) localStorage.setItem(`gdrive_folder_id_${name}`, id);
                }
            }));
        };

        await listFolders();
        return multinotesDataId;
    } catch (e) {
        if (e instanceof TypeError || (e.message && e.message.includes('Failed to fetch'))) {
            console.log('getFolderID: Network unavailable, switching to offline mode.');
            isOffline = true;
            return null;
        }
        console.error("Error in getFolderID:", e);
        throw e;
    }
}

async function getMultinotesDataFolderID() {
    if (isOffline) return null;
    if (typeof activeFolderName !== 'undefined' && activeFolderName === 'AppDataFolder') return 'appDataFolder';
    const cachedId = localStorage.getItem('gdrive_multinotes_data_id');
    if (cachedId) return cachedId;

    const sendRequest = async (token) => {
        const query = encodeURIComponent(`name='${activeFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
        return fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    };

    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) return null;
        let tokenData = JSON.parse(storedTokenString);
        let resp = await sendRequest(tokenData.access_token);

        if (resp.status === 401) {
            console.warn("Got 401 in getMultinotesDataFolderID, attempting refresh...");
            let refresh = await refreshAuthToken(false);
            if (refresh && refresh.pass) {
                tokenData = refresh.tokenData;
                resp = await sendRequest(tokenData.access_token);
            }
        }

        if (!resp.ok) return null;
        const result = await resp.json();
        const id = result.files?.[0]?.id || null;
        if (id) localStorage.setItem('gdrive_multinotes_data_id', id);
        return id;
    } catch (e) {
        if (e instanceof TypeError || (e.message && e.message.includes('Failed to fetch'))) {
            console.log('getMultinotesDataFolderID: Network unavailable, switching to offline mode.');
            isOffline = true;
        } else {
            console.error("Error in getMultinotesDataFolderID:", e);
        }
        return null;
    }
}

// =================================================================================
// III. GOOGLE DRIVE АВТЕНТИКАЦИЯ И API
// =================================================================================



async function silentLoginWithIframe(loginHint) {
    const REDIRECT_URI = window.location.origin + window.location.pathname;
    return new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&response_type=token&scope=${SCOPES}&redirect_uri=${REDIRECT_URI}&prompt=none&login_hint=${loginHint}`;
        // Слушаме за съобщения от iframe
        const messageListener = (event) => {
            // Приемаме съобщения от нашия собствен origin (след redirect)
            if (event.origin !== window.location.origin) {
                return;
            }
            const hash = event.data;
            if (hash && hash.includes('access_token')) {
                const params = new URLSearchParams(hash.substring(1)); // Премахваме #
                const accessToken = params.get('access_token');
                const expiresIn = params.get('expires_in');
                const tokenWithTimestamp = {
                    access_token: accessToken,
                    expires_in: expiresIn,
                    issued_at: Date.now()
                };
                // Обновяваме storage според rememberMe
                const rememberMe = localStorage.getItem('rememberMe') === 'true';
                const storage = rememberMe ? localStorage : sessionStorage;
                storage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                window.removeEventListener('message', messageListener);
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
                resolve(tokenWithTimestamp);
            } else {
                window.removeEventListener('message', messageListener);
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
                resolve(null);
            }
        };
        window.addEventListener('message', messageListener);
        document.body.appendChild(iframe);
        // Таймаут за безопасност
        setTimeout(() => {
            window.removeEventListener('message', messageListener);
            if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }
            resolve(null); // Връщаме null вместо reject
        }, 5000); // 5 секунди
    });

}

async function handleAuthClick() {
    if (isOffline) {
        document.getElementById('login-page').hidden = true;
        document.getElementById('login-page').style.display = 'none';
        startApp(true);
        return;
    }
    if (!tokenClient && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: async (resp) => {
                if (resp.error) {
                    throw (resp);
                }
                await authCallback(resp);
            },
        });
    }
    if (tokenClient) {
        const rememberMe = localStorage.getItem('rememberMe') === 'true';
        const loginHint = localStorage.getItem('google_login_hint');
        if (rememberMe && loginHint) {
            tokenClient.requestAccessToken({ hint: loginHint });
        } else {
            tokenClient.requestAccessToken({ prompt: 'select_account' });
        }
    } else {
        console.warn("Google Identity Services not loaded. Checking for offline capability...");
        let hasS = false;
        try {
            const cache = await caches.open('app-cache');
            const cachedResponse = await cache.match('s');
            hasS = !!cachedResponse;
        } catch (e) { console.warn(e); }
        if (hasS) {
            if (confirm("Google services could not be loaded (likely due to connection issues).\n\nDo you want to start in Offline Mode?")) {
                isOffline = true;
                document.getElementById('login-page').hidden = true;
                document.getElementById('login-page').style.display = 'none';
                startApp(true);
                return;
            }
        }
        console.error("Google Identity Services not loaded.");
        alert("Google services are not loaded yet. Please check your connection and reload via F5.");
    }
}

async function checkWhitelist(delayed = false) {
    if (isOffline) return null;
    if (delayed) {
        // Изчакваме 2 секунди, за да не пречим на началната синхронизация 
        await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const isTrialStart = sessionStorage.getItem('isTrialStart') === 'true';
    const action = isTrialStart ? 'log' : 'check';
    const currentUserEmail = sessionStorage.getItem('google_auth_email_hint');

    console.log('>>> Executing whitelist check (action: ' + action + ')...');
    console.log('>>> Email for whitelist:', currentUserEmail);

    if (!currentUserEmail) return null;

    try {
        // Use robust fetch wrapper
        const whitelistUrl = 'https://script.google.com/macros/s/AKfycbzYpXGxlfFyyOuPY7gmKanmEPF2mXTCsqefNAtvsfNvym4lJApiHEwGTJCoYAHGaz25Uw/exec';
        const data = await fetchJson(whitelistUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            email: currentUserEmail,
            action: action
          })
        });
        console.log('>>> Whitelist response:', data);

        if (isTrialStart) {
            sessionStorage.removeItem('isTrialStart');
            console.log('>>> Trial registered for:', currentUserEmail);
        }
        return data;
    } catch (err) {
        if (err.name === 'TypeError' || err.message === 'Failed to fetch') {
            console.log('>>> Whitelist check: Service unavailable (likely offline).');
        } else {
            console.log('>>> Whitelist check fail:', err);
        }
        return null;
    }
}

async function checkAuth(isExplicitLogin = false) {
    console.log("checkAuth");
    const searchInput = document.getElementById('search-box');
    if (searchInput) {
        const val = searchInput.value.trim();
        // По-толерантен regex: приема ?token= или само token=
        const tokenMatch = val.match(/^\??token=(.+)$/);
        if (tokenMatch) {
            const tokenValue = tokenMatch[1].trim();
            if (tokenValue) {
                localStorage.setItem('urlToken', tokenValue);
                searchInput.value = '';
                cachedLicenseData = null; // Изчистваме кеша за лиценза
                if (saveSearchBtn) saveSearchBtn.style.display = 'none';
            }
        }
    }
    const sessionToken = sessionStorage.getItem('google_auth_token');
    const localToken = localStorage.getItem('google_auth_token');
    const storedTokenString = sessionToken || localToken;
    if (isOffline && (storedTokenString || isExplicitLogin)) return { pass: true };
    if (!storedTokenString) {
        await initLoginPage();
        window.authListenersAdded = true;
        return { pass: false };
    }
    const tokenData = JSON.parse(storedTokenString);
    if (window.gapi && window.gapi.client && tokenData.access_token) window.gapi.client.setToken(tokenData);
    tokenData.email_hint = sessionStorage.getItem('google_auth_email_hint');
    const isExpired = (Date.now() - tokenData.issued_at) / 1000 > (tokenData.expires_in - 60);
    if (isExpired) {
        console.log("Token expired. Attempting silent refresh...");
        try {
            const refreshResult = await refreshAuthToken();
            if (refreshResult && refreshResult.pass) return refreshResult;
            console.warn("Silent refresh returned non-pass result:", refreshResult);
        } catch (refreshErr) {
            console.warn("Silent refresh failed:", refreshErr);
        }
        let hasLocalData = false;
        if (dbExists) {
            try {
                const boardsInDb = await getAllFromDB(BOARD_STORE_NAME);
                if (boardsInDb && boardsInDb.length > 0) hasLocalData = true;
            } catch (e) {
                console.warn("Failed to check local DB in checkAuth:", e);
            }
        }
        if (hasLocalData) {
            isOffline = true;
            isSyncSuspended = true;
            console.log("[Auth] Switching to local-only mode (sync suspended).");
            return { pass: true, tokenData };
        }
        sessionStorage.removeItem('google_auth_token');
        localStorage.removeItem('google_auth_token');
        initLoginPage();
        return { pass: false };
    }
    const licenseData = await decryptLicenseToken();
    tokenRemainingDays = licenseData.remainingDays;
    pass = licenseData.pass;
    if (licenseData.pass) {
        console.log(`tokenRemainingDays: ${tokenRemainingDays}`);
        if (typeof updateSignoutTooltip === 'function') updateSignoutTooltip();
    } else {
        console.warn("License required. Showing login page.");
        initLoginPage();
        return null;
    }
    return { tokenData, pass };
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
    });
}

async function loadGoogleApis() {
    if (isOffline) return;
    if (typeof gapi !== 'undefined' && gapi.client) return;
    try {
        await loadScript('https://apis.google.com/js/api.js');
        await new Promise(resolve => gapi.load('client', resolve));
        await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
    } catch (error) {
        throw new Error(_('errorGoogleLibs'));
    }
}

function handleSignoutClick() {
    // Премахваме само ключовете, свързани с удостоверяването
    localStorage.removeItem('google_auth_token');
    sessionStorage.removeItem('google_auth_token');
    sessionStorage.removeItem('google_auth_email_hint');
    // Премахваме кешираните ID-та на папки, за да не се ползват от друг потребител
    localStorage.removeItem('gdrive_multinotes_data_id');
    localStorage.removeItem('gdrive_folder_id_Other');
    localStorage.removeItem('gdrive_folder_id_Sound');
    localStorage.removeItem('gdrive_folder_id_Video');
    localStorage.removeItem('gdrive_folder_id_Images');
    // Премахваме google_login_hint САМО ако "Запомни ме" НЕ е активно
    const rememberMe = localStorage.getItem('rememberMe') === 'true';
    if (!rememberMe) {
        localStorage.removeItem('google_login_hint'); // Спираме автоматичния вход
    }
    // Задаваме флаг за изход, за да се покаже login формата
    sessionStorage.setItem('logout_flag', 'true');
    // Презареждаме страницата - checkAuth ще покаже login формата
    window.location.reload();
}

// =================================================================================
// IV. ЧЕТЕНЕ НА ДАННИ ОТ GOOGLE DRIVE
// =================================================================================
// --- GDrive Data Loading logic moved to load.js ---
/**
 * Проверява дали текущият потребител съвпада със собственика на локалната база данни.
 * Ако има несъответствие, превключва приложението в ограничен режим.
 */
async function userCheck() {
    if (!dbExists) {
        // Базата не съществува, не правим нищо.
        // Потребителят ще бъде записан при първоначалното създаване на базата.
        isDbOwner = true;
        return;
    }
    // Базата съществува, продължаваме с проверката на потребителя
    const storedUserEmail = await getConfig('userEmail');
    const currentUserEmail = sessionStorage.getItem('google_auth_email_hint');
    // Проверяваме за несъответствие само ако има записан потребител в базата
    if (storedUserEmail && currentUserEmail && storedUserEmail !== currentUserEmail) {
        isDbOwner = false;
        await handleUserMismatch(storedUserEmail);
    } else {
        isDbOwner = true;
    }
}

/**
 * Обработва случая на несъответствие на потребители.
 * Показва съобщение и заключва настройките за управление на данни.
 */
async function handleUserMismatch(storedUser) {
    // --- КОРЕКЦИЯ: Добавяме динамичен източник към съобщението ---
    let sourceName = '';
    if (localStorage.getItem('useGoogleDb') !== 'false') {
        sourceName = _('sourceGoogleDrive');
    } else if (localStorage.getItem('useLocalDb') === 'true') {
        sourceName = _('sourceLocalFolder');
    } else if (localStorage.getItem('useArhDb') === 'true') {
        sourceName = _('sourceArchive');
    } else {
        // Fallback, ако нищо не е избрано, въпреки че не би трябвало да се случва
        sourceName = _('sourceGoogleDrive');
    }
    showToast(_('userMismatchWarning').replace('{user}', storedUser).replace('{source}', sourceName), 15000);
    // Принудително превключваме към режим "Google Drive" без IndexedDB
    localStorage.setItem('useIndexedDb', 'false');
    localStorage.setItem('useGoogleDb', 'true');
    localStorage.setItem('useLocalDb', 'false');
    localStorage.setItem('useArhDb', 'false'); // Добавяме и архива
    updateGlobalStateFlags();
    updateModeButton();
    // Деактивираме контролите в настройките
    const settingsModal = document.getElementById('settings-modal');
    // Проверяваме дали модалът за настройки изобщо съществува в DOM
    if (!settingsModal) return;
    const controlsToDisable = [
        'use-indexeddb-checkbox', 'use-local-db-checkbox', 'use-arh-db-checkbox',
        'create-db-btn', // 'delete-db-btn',
        'select-folder-btn', 'select-arh-btn'
    ];
    controlsToDisable.forEach(id => {
        const el = settingsModal.querySelector(`#${id}`);
        if (el) {
            // Ако елементът е чекбокс, първо го изключваме
            if (el.type === 'checkbox') {
                el.checked = false;
            }
            el.disabled = true;
        }
    });
    // Деактивираме и целия акордеон за разширени настройки
    const accordionHeader = settingsModal.querySelector('.accordion-header');
    if (accordionHeader) {
        accordionHeader.style.pointerEvents = 'none';
        accordionHeader.style.opacity = '0.5';
    }
    const googleDbCheckbox = settingsModal.querySelector('#use-google-db-checkbox');
    googleDbCheckbox.checked = true; // Маркираме го
    // --- КОРЕКЦИЯ: Заключваме и него, за да е ясно, че режимът е принудителен ---
    // googleDbCheckbox.disabled = false; // Оставяме го активно, но заключено
    // googleDbCheckbox.disabled = true;
}

/**
 * Активира контролите в настройките, които може да са били деактивирани
 * от `handleUserMismatch`. Извиква се след изтриване на базата данни.
 */
function enableSettingsControls() {
    const settingsModal = document.getElementById('settings-modal');
    if (!settingsModal) return;
    const controlsToEnable = [
        'use-indexeddb-checkbox', 'use-local-db-checkbox', 'use-arh-db-checkbox',
        'create-db-btn', 'select-folder-btn', 'select-arh-btn'
    ];
    controlsToEnable.forEach(id => {
        const el = settingsModal.querySelector(`#${id}`);
        if (el) {
            el.disabled = false;
        }
    });
    // Активираме и акордеона за разширени настройки
    const accordionHeader = settingsModal.querySelector('.accordion-header');
    if (accordionHeader) {
        accordionHeader.style.pointerEvents = 'auto';
        accordionHeader.style.opacity = '1';
    }
    console.log("Settings controls have been re-enabled after DB deletion.");
}

/**
 * Създава или пресъздава цялата база данни от данните, заредени в паметта.
 * @returns {Promise<boolean>} Връща true при успех и false при грешка.
 */
async function createDatabaseFromMemory() {
    if (boardsData.length === 0 && allNotesData.length === 0) {
        showToast(_('dbCreateFailedNoData'), 10000);
        return false;
    }
    try {
        // --- КЛЮЧОВА КОРЕКЦИЯ: Осигуряваме gdid за IndexedDB (особено за архиви) ---
        // Тъй като базата използва 'gdid' като keyPath, ако полето е празно (както е в архивите),
        // всички записи ще се презаписват един друг.
        const ensureGdid = (data) => data.map(item => {
            // АКО СМЕ В РЕЖИМ АРХИВ: Винаги използваме цифровия 'id' като основен ключ 'gdid' за базата.
            // Това гарантира, че връзките в архива ще работят правилно в IndexedDB.
            // if (useArhDb && item.id !== undefined) {
            //    return { ...item, gdid: String(item.id) };
            // }
            // ЗА ДРУГИ РЕЖИМИ: Само ако gdid липсва, ползваме id като резервен вариант.
            if ((!item.gdid || item.gdid === "") && item.id !== undefined) {
                return { ...item, gdid: String(item.id) };
            }
            return item;
        });
        // Почистване на временни полета преди запис
        const cleanItem = (item) => {
            const cleaned = { ...item };
            delete cleaned.noteCount;
            delete cleaned.reminderNoteCount;
            delete cleaned.calendarNoteCount;
            return cleaned;
        };
        const preparedBoards = ensureGdid(boardsData).map(cleanItem);
        const preparedMedia = ensureGdid(mediaData);
        const preparedNotes = ensureGdid(allNotesData);
        await bulkPutDB(BOARD_STORE_NAME, preparedBoards);
        await bulkPutDB(MEDIA_STORE_NAME, preparedMedia);
        await bulkPutDB(NOTE_STORE_NAME, preparedNotes);
        const currentUserEmail = sessionStorage.getItem('google_auth_email_hint');
        if (currentUserEmail) {
            await saveConfig('userEmail', currentUserEmail);
        }
        // ЗАПИСВАМЕ ТИПА НА ВРЪЗКАТА (КЛЮЧОВА СТЪПКА) - използваме глобалните флагове
        const noteIdType = useArhDb ? 'id' : 'gdid';
        await saveConfig('dbNoteIdType', noteIdType);
        const dbSource = useArhDb ? 3 : (useLocalFolder ? 2 : 1);
        // Запазваме timestamp само за източника, от който създаваме базата.
        // Ако е от архив, не записваме нищо, за да може следващата синхронизация да е пълна.
        const now = Date.now();
        if (dbSource === 1) { // Google Drive
            await saveConfig('lastGDTimestamp', now); // В IndexedDB
        } else if (dbSource === 2) { // Local Folder
            await saveConfig('lastLocalTimestamp', now);
        }
        await saveConfig('dbSource', dbSource);
        await saveConfig('dbCreatedFolderName', activeFolderName);
        // Записваме кога е създадена базата
        await saveConfig('dbCreatedTimestamp', now);
        // --- IMMEDIATELY UPDATE GLOBALS FOR CURRENT SESSION ---
        dbSourceGlobal = dbSource;
        dbNoteIdTypeGlobal = noteIdType;
        console.log(`[createDatabaseFromMemory] Session globals updated: Source=${dbSourceGlobal}, IdType=${dbNoteIdTypeGlobal}`);
        dbExists = true; // Маркираме, че базата вече съществува
        return true;
    } catch (error) {
        console.log("Failed to create/recreate DB from memory:", error);
        return false;
    }
}

/**
 * Финализира процеса по създаване на база данни, като записва
 * необходимата конфигурация (timestamps, потребител).
 */
async function finalizeDbCreation() {
    const now = Date.now();
    await saveConfig('lastGDTimestamp', now);
    await saveConfig('lastLocalTimestamp', now);
    const currentUserEmail = sessionStorage.getItem('google_auth_email_hint');
    if (currentUserEmail) {
        await saveConfig('userEmail', currentUserEmail);
    }
}

function areBoardsIdentical(memBoards, dbBoards) {
    if (!memBoards || memBoards.length === 0 || !dbBoards || dbBoards.length === 0) return true; // Празни данни не са несъответствие в този контекст

    const dbGdidSet = new Set(dbBoards.map(b => String(b.gdid)));
    const dbTitleSet = new Set(dbBoards.map(b => String(b.title || '').trim().toLowerCase()));

    // Проверяваме дали всички бордове от паметта присъстват в базата
    for (const mb of memBoards) {
        const memGdid = mb.gdid ? String(mb.gdid) : (mb.id !== undefined ? String(mb.id) : null);
        const memTitle = String(mb.title || '').trim().toLowerCase();

        if (memGdid !== null && !dbGdidSet.has(memGdid) && !dbTitleSet.has(memTitle)) {
            console.warn(`Mismatch: Memory board "${mb.title}" (ID: ${memGdid}) not in DB.`);
            return false;
        }
    }

    // Проверяваме и обратното (само ако имаме бордове в базата)
    if (dbBoards.length > 0) {
        const memGdidSet = new Set(memBoards.map(mb => mb.gdid ? String(mb.gdid) : (mb.id !== undefined ? String(mb.id) : null)));
        const memTitleSet = new Set(memBoards.map(mb => String(mb.title || '').trim().toLowerCase()));

        for (const db of dbBoards) {
            const dbGdid = String(db.gdid);
            const dbTitle = String(db.title || '').trim().toLowerCase();
            if (!memGdidSet.has(dbGdid) && !memTitleSet.has(dbTitle)) {
                console.warn(`Mismatch: DB board "${db.title}" (GDID: ${dbGdid}) not in memory.`);
                return false;
            }
        }
    }

    return true;
}

/**
 * Актуализира иконата и tooltip-а на бутона за режим, за да покаже текущия източник на данни.
 */
function updateModeButton() {
    // Тази функция се извиква преди mainLogic, затова трябва да прочете актуалните стойности.
    const currentUseGoogleDb = localStorage.getItem('useGoogleDb') !== 'false';
    const currentUseLocalFolder = localStorage.getItem('useLocalDb') === 'true';
    const currentUseArhDb = localStorage.getItem('useArhDb') === 'true';
    const currentUseIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
    const modeButton = document.getElementById('mode_button');
    if (!modeButton) return;
    let iconWrapper = modeButton.querySelector('.mode-icon-wrapper');
    if (!iconWrapper) {
        iconWrapper = document.createElement('div');
        iconWrapper.className = 'mode-icon-wrapper';
        modeButton.prepend(iconWrapper);
    }
    let iconSrc = '';
    let title = '';
    // --- РАЗШИРЕНА ЛОГИКА: Проверяваме за всяка комбинация с база данни ---
    const isCombinedWithDb = currentUseIndexedDb && (currentUseGoogleDb || currentUseLocalFolder || currentUseArhDb);

    if (!modeButton.querySelector('#mode-button-loading-icon')) {
        const loadingIcon = document.createElement('img');
        loadingIcon.src = 'Refresh.png';
        loadingIcon.id = 'mode-button-loading-icon';
        modeButton.appendChild(loadingIcon);
    }

    if (isOffline) {
        iconSrc = 'Database.png';
        title = _('offlineMode') || "Offline Mode";
        // Ensure overlay is hidden in offline mode unless we want to show it's disabled?
        // For now, let's keep it simple or maybe show a 'OFF' overlay?
    } else if (isCombinedWithDb) {
        // Когато имаме комбинация, базата е основна
        iconSrc = 'Database.png';
        if (currentUseGoogleDb) title = _('modeDbAndDrive');
        else if (currentUseLocalFolder) title = _('modeDbAndLocal');
        else if (currentUseArhDb) title = _('modeDbAndArchive');
    } else if (currentUseArhDb) {
        iconSrc = 'Zip.png';
        title = _('modeArchiveTitle');
    } else if (currentUseLocalFolder) {
        iconSrc = 'Folder.png';
        title = _('modeLocalTitle');
    } else if (currentUseGoogleDb) {
        iconSrc = 'GDrive.png';
        title = _('modeDrive');
    } else if (currentUseIndexedDb) {
        iconSrc = 'Database.png';
        title = _('modeDb');
    } else {
        // Fallback: Ако няма избран източник
        iconSrc = 'Database.png';
        title = _('noData');
    }
    iconWrapper.innerHTML = '';
    const mainIcon = document.createElement('img');
    mainIcon.src = iconSrc;
    mainIcon.alt = title;
    mainIcon.style.width = '24px';
    mainIcon.style.height = '24px';
    iconWrapper.appendChild(mainIcon);
    // Добавяме иконата за наслагване
    let overlaySrc = '';
    let overlayAlt = '';
    if (isOffline) {
        // overlaySrc = 'Offline.png'; overlayAlt = 'Offline Mode';
        overlaySrc = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAERElEQVR4nO2YW2hcVRSGT1pFBS/4JGqb2WsSSGIlFWvO6IMo1JkMSuYkMTU++OKlVIvYh0LVGIngrdpWDZ21xlFRES8Y6YsXUoIKal8KovggUvGCivUWSmatSYXmsmWfSew0c+bMmWQymYH5YcPMnL33Wd/Ze/9rnbGshhpaHdmxvs1WvSoSSzxpxxKzkXjPHVY9Bh/pdrRpdQfRFXWucoNeAHAhup2ZSMwZtOpFdjyxzQ06H6LeVsJuQNQRxMaD05cplEEg2atIDinib4BkEkiyQKIXmvk8aa6ZPkDyTIjk9g2p6cvXCMKZu3LXq+MK5Ye8IJfbfgTiF0KUudbSuql6EPE+3TE0vtLg9ZL2E5Dsbh2dvLBiwV+R/Ot8QHm8/ZGJbCTer6sAoRVJRqE8HU6fuGj5kWvdBCTbFPIvixO3D3+sqwUBuTapUHZZY3p9WbE3p7OXKuQJr0mLQWza/c5RQH7YQANOdzXTVNjMAy/LJe7ng9mrw8j9CnmPIn5bEf9Wxop8oZInQ4GCD2PmFkXyt9+EBsKO982v1GJb01MtBnrBufwhUKaM2/lOqEgeAOK5EhMdAcz0dN3ce1sl80QLTW8B5DcU8YwvDPKop1sByrMlAj8aejFz3WonO5XKbgbiT0tAvF5wLlSKdwDyvMeArLlWzKO9LbZXdzz0YRaQZ91GckKhfA/E40C8TyXZaaapi/1ATKIz47wB5LEi9EsgkL9SlGnz7Dym10OSBxTJ+21DEzPlupNCPqWQPzL7+oYRfZbXLVrw5EYg+SxQ8IsC5Lvdc4B8uO2Vfy4o6DCi16kkb89l0NLuFMRilbFq5J1eIOY3IEnn3IhHrCAKpeRGL+819gjEX/u504ryBMq3QHx9QUBaN4WTstVatkb0OiAeMsteKoiVQ/CsInmq2LYqW62j+hxAfjfAjf81e9qAdm7fv9eOOWe+2cWcuc776E1F8p7x9ADzHfbcwuXKOEYRd1rIkiYJZe5aWoD5Waz7UIhvVSif+54N436VkJfFKuJfjdX5lcB2NDFQKk9ASqK5vR/QKisBoZDfClopBoEIvabPBeTnVy34fAhF/GCx6znf5nvcYg3liEleiuRYx54PvrPjvSVrpzBm7lTEj1rVFqB0AsmY31lpH/6k0J1ia/yO7S49yUt+gdcsxIYD+jxF/GUgb69VCFgsO+oZQhVYLP9hSvNQMhtvScqmEHIHkNykSJ4AlJ/zIezu3rmagAgh3+tWl8TDZmsV67clrc+GlNxvsrbJ2HYAi62azB9cy+lr1xLEcmXXGsTpzGrOAx9XxM+Z3+oGAvLLgtO104FS4+xagXCffOFb159Bxtq1AOEFAMS/Bx1vrzWE2S4eAPvKmSMScwaXQkS6E6eu2doftlZb5sC6EMjH3UOMvN+8xJQ7j33mSsxH4s5Oq95kRxMD5snXZfCLsqM98P+XhhqyKqr/AEJezD2/ik84AAAAAElFTkSuQmCC'; overlayAlt = 'Offline Mode';
    } else if (isCombinedWithDb) {
        if (currentUseGoogleDb) {
            overlaySrc = 'GDrive.png'; overlayAlt = 'Google Drive Sync';
        } else if (currentUseLocalFolder) {
            overlaySrc = 'Folder.png'; overlayAlt = 'Local Folder Sync';
        } else if (currentUseArhDb) {
            overlaySrc = 'Zip.png'; overlayAlt = 'Archive Source';
        }
    }
    if (overlaySrc) {
        const overlay = document.createElement('div');
        overlay.className = 'mode-db-overlay';
        const filterStyle = isOffline ? ' style="filter: brightness(0);"' : '';
        overlay.innerHTML = `<img src="${overlaySrc}" alt="${overlayAlt}"${filterStyle}>`;
        iconWrapper.appendChild(overlay);
    }
    if (isSyncSuspended) {
        title = (_('syncSuspendedTooltip') || 'Синхронизацията е спряна. Кликнете за свързване.');
        iconWrapper.style.position = 'relative';
        const warnBadge = document.createElement('span');
        warnBadge.textContent = '⚠️';
        warnBadge.style.cssText = 'position:absolute;bottom:-4px;right:-4px;font-size:12px;line-height:1;';
        iconWrapper.appendChild(warnBadge);
    }
    modeButton.title = title;
}

/**
 * Обновява глобалните променливи за режим на работа от localStorage.
 * Извиква се, за да се синхронизира състоянието на приложението с настройките.
 */
function updateGlobalStateFlags() {
    useGoogleDb = localStorage.getItem('useGoogleDb') !== 'false'; // true по подразбиране
    useLocalFolder = localStorage.getItem('useLocalDb') === 'true';
    useArhDb = localStorage.getItem('useArhDb') === 'true';
    useIndexedDb = localStorage.getItem('useIndexedDb') !== 'false'; // true по подразбиране
    automatedTimer = localStorage.getItem('automatedTimer') !== 'false'; // true по подразбиране
    updateLocalFolder = localStorage.getItem('updateLocalFolder') === 'true';
}

/**
 * Проверява дали е избран поне един източник на данни.
 * Ако не е, показва съобщение и отваря настройките.
 * @returns {boolean} Връща true, ако има избран източник, и false, ако няма.
 */
function validateDataSourceSelection() {
    if (!useGoogleDb && !useLocalFolder && !useArhDb && !useIndexedDb) {
        showToast(_('errorNoDataSourceSelected'), 15000);
        document.getElementById('settings-modal').classList.add('visible');
        const advancedSettingsSpan = document.getElementById('advanced-settings-span');
        if (advancedSettingsSpan) {
            advancedSettingsSpan.removeAttribute('hidden');
            localStorage.setItem('showAdvancedSettings', 'true');
        }
        setTimeout(() => {
            const accordionHeader = document.querySelector('.accordion-header');
            const advancedSettingsContent = document.getElementById('advanced-settings');
            if (advancedSettingsContent && advancedSettingsContent.style.display === 'none' && accordionHeader) {
                accordionHeader.click();
            }
        }, 100);

        if (typeof updateAdvancedSettingsVisibility === 'function') updateAdvancedSettingsVisibility();

        loaderContainer.style.display = 'none'; // Скриваме лоудъра
        // Изчистваме осиротели файлове при старт
        // cleanupOrphanedImages();
        return false; // Сигнализираме, че проверката е неуспешна
    }
    return true; // Всичко е наред
}

/**
 * Отчита проблеми с целостта на данните (липсващи или дублирани ID-та).
 */
async function goOffline() {
    if (isOfflineChecked) return;
    isOfflineChecked = true;
    let hasS = false;
    try {
        const cache = await caches.open('app-cache');
        const cachedResponse = await cache.match('s');
        hasS = !!cachedResponse;
    } catch (e) {
        console.warn("Error checking app-cache for 's':", e);
    }
    if (isOffline) return;

    let reallyOnline = true;
    if (!navigator.onLine && hasS) {
        try {
            const response = await fetch('/favicon.ico?_=' + new Date().getTime(), { method: 'HEAD', cache: 'no-store' });
            reallyOnline = response.ok;
        } catch (e) {
            reallyOnline = false;
        }
    }

    if (!reallyOnline && hasS) {
        isOffline = true;
        console.warn("Working in offline mode (s-record found).");
        if (document.querySelector('.login-box')) {
            document.querySelector('.login-box').style.display = 'block';
        }
        if (dbExists) {
            try {
                const boardsInDb = await getAllFromDB(BOARD_STORE_NAME);
                if (boardsInDb && boardsInDb.length > 0) {
                    localStorage.setItem('useIndexedDb', 'true');
                    localStorage.setItem('useGoogleDb', 'false');
                    localStorage.setItem('forceGDriveRead', 'false');
                    updateGlobalStateFlags();
                }
            } catch (e) {
                console.error("Error checking DB in goOffline:", e);
            }
        }
    } else {
        isOffline = false;
    }
}

function reportDataIntegrityIssues() {
    if (dataIntegrityIssues.length === 0) return;
    const duplicates = dataIntegrityIssues.filter(i => i.type === 'duplicate');
    const missing = dataIntegrityIssues.filter(i => i.type === 'missing');
    console.group('%c Data Integrity Report ', 'background: #f44336; color: white; font-weight: bold;');
    if (duplicates.length > 0) {
        console.warn(`Found ${duplicates.length} duplicate IDs. IndexedDB will only keep the LAST version of each.`);
        duplicates.forEach(d => {
            console.log(` - ID: ${d.gdid} | Mode: ${d.mode || 'direct'} | Files: [${d.file1}] and [${d.file2}]`);
        });
    }
    if (missing.length > 0) {
        console.warn(`Found ${missing.length} items missing an ID property. These were likely skipped.`);
        missing.forEach(m => {
            console.log(` - File: ${m.file} | Mode: ${m.mode || 'direct'} | Content: "${(m.text || '').substring(0, 50)}..."`);
        });
    }
    console.groupEnd();
    // Show a small toast if there are many issues
    if (duplicates.length > 0) {
        let previewText = '';
        // Find the content of the first duplicate to show as a hint
        const firstDupId = duplicates[0].gdid;
        const dupNote = allNotesData.find(n => n.gdid === firstDupId);
        if (dupNote) {
            const content = dupNote.notetxt || dupNote.text || '';
            previewText = content.substring(0, 50).replace(/\n/g, ' ');
            if (content.length > 50) previewText += '...';
        }
        const msg = `${_('duplicateNotes')}: ${duplicates.length}. ${_('content')}: "${previewText}"`;
        showToast(msg, 10000);
    }
}

/**
 * Филтрира бележките, за да остави само по 5 за всеки борд (за демо версия).
 */
function filterNotesForDemo() {
    if (!DEMO_MODE) return; // Изпълнява се само ако демо флагът е активен
    console.log("DEMO MODE: Filtering notes to 5 per board.");
    if (!boardsData || boardsData.length === 0 || !allNotesData || allNotesData.length === 0) {
        return;
    }
    const filteredNotes = new Set();
    const isArh = useArhDb || (useIndexedDb && dbSourceGlobal === 3);
    boardsData.forEach(board => {
        const boardIdToMatch = isArh ? board.id : board.gdid;
        const notesForBoard = allNotesData
            .filter(note => note.boardid == boardIdToMatch)
            .sort((a, b) => (a.numord || 0) - (b.numord || 0)) // Сортираме за консистентност
            .slice(0, DEMO_NOTE_LIMIT); // Взимаме броя бележки от константата
        notesForBoard.forEach(note => filteredNotes.add(note));
    });
    const originalCount = allNotesData.length;
    allNotesData = Array.from(filteredNotes);
    console.log(`DEMO MODE: Notes reduced from ${originalCount} to ${allNotesData.length}.`);
}

/**
 * Обработва първоначалното зареждане, когато settings.json и folders.json не съществуват.
 * Ред:
 * 1. Създава борд Main в AppDataFolder и го задава като стартов борд
 * 2. Проверява дали в GD съществува папка multinotes_data и пита потребителя
 * 3. Задава активна папка (AppDataFolder или multinotes_data)
 * 4. Създава folders.json и settings.json с профил Default
 * @returns {boolean} true ако е извършена първоначална настройка, false ако не е необходима
 */
async function handleFirstRunSetup() {
    if (isOffline) return false;
    // Проверка дали вече е настроено (локално или в сесията)
    if (localStorage.getItem('initial_setup_complete') === 'true' || sessionStorage.getItem('first_run_lock')) return false;
    const hasLocalSettings = localStorage.getItem('settings_multinotes_data');
    if (hasLocalSettings) return false;

    sessionStorage.setItem('first_run_lock', 'true'); // Временна блокировка за текущата сесия

    // Проверка дали settings.json съществува в AppSettings папката
    try {
        const appSettingsFolderId = await getAppSettingsFolderId();
        if (!appSettingsFolderId) return false;
        const settingsFiles = await findGDFileByName(appSettingsFolderId, 'settings.json');
        if (settingsFiles && settingsFiles.length > 0) {
            localStorage.setItem('initial_setup_complete', 'true');
            return false;
        }
        const foldersFiles = await findGDFileByName(appSettingsFolderId, 'folders.json');
        if (foldersFiles && foldersFiles.length > 0) {
            localStorage.setItem('initial_setup_complete', 'true');
            return false;
        }
    } catch (e) {
        console.warn('[FirstRun] Error checking AppSettings:', e);
        return false;
    }
    console.log('[FirstRun] First-time setup detected. Starting initial configuration...');
    if (typeof loaderText !== 'undefined') loaderText.textContent = _('firstRunSetup');
    // --- СТЪПКА 1: Проверка за multinotes_data в Google Drive ---
    let chosenFolder = 'AppDataFolder';
    let multinotesFound = false;
    try {
        const multinotesId = await getFolderIDByName('multinotes_data');
        if (multinotesId) {
            multinotesFound = true;
            const useMultinotes = await showConfirmation(_('firstRunMultinotesFound'));
            if (useMultinotes) {
                chosenFolder = 'multinotes_data';
                localStorage.setItem('gdrive_multinotes_data_id', multinotesId);
            }
        }
    } catch (e) {
        console.warn('[FirstRun] Error checking for multinotes_data:', e);
    }

    // --- СТЪПКА 2: Задаване на активна папка ---
    activeFolderName = chosenFolder;
    localStorage.setItem('active_folder_name', chosenFolder);
    cachedMainFolderId = null;
    const loaderFolderInfo = document.getElementById('loader-folder-info');
    if (loaderFolderInfo) loaderFolderInfo.textContent = `(${activeFolderName})`;
    console.log('[FirstRun] Active folder selected:', chosenFolder);

    const folderNames = ['AppDataFolder'];
    if (multinotesFound) folderNames.push('multinotes_data');
    localStorage.setItem('gdrive_folder_names', JSON.stringify(folderNames));

    // --- СТЪПКА 3: Създаване на борд Main (САМО ако е избрана AppDataFolder) ---
    if (chosenFolder === 'AppDataFolder') {
        try {
            console.log('[FirstRun] Creating Main board in AppDataFolder...');

            const existingMainBoards = await findGDFileByName('appDataFolder', 'board.txt');

            if (existingMainBoards && existingMainBoards.length > 0) {
                console.log('[FirstRun] Main board already exists in AppDataFolder');
                localStorage.setItem('startBoard_AppDataFolder', existingMainBoards[0].id);
            } else {
                const now = Date.now();
                boardIdCounter = 1;
                localStorage.setItem('boardIdCounter', '1');
                const boardToSave = {
                    "backcolor": 0, "backnum": 0, "backpath": "", "color": "#4CAF50",
                    "colorfont": "#000", "datemod": now, "gdid": "", "id": 1,
                    "numord": 1, "status": 0, "title": "Main"
                };

                const gdid = await createGDriveFile('appDataFolder', 'board.txt', JSON.stringify(boardToSave));
                if (gdid) {
                    boardToSave.gdid = gdid;
                    await updateGDriveFile(gdid, JSON.stringify(boardToSave));
                    console.log('[FirstRun] Main board created in AppDataFolder');
                    localStorage.setItem('startBoard_AppDataFolder', gdid);
                }
            }
        } catch (e) {
            console.error('[FirstRun] Error creating Main board in AppDataFolder:', e);
        }
    }

    // --- СТЪПКА 4: Създаване на folders.json ---
    try {
        // ПРЕДПАЗНА МЯРКА: Ако сме създали борд, трябва да е в boardsData, за да се запише в folders.json
        if (typeof boardsData !== 'undefined' && boardsData.length === 0) {
            const startBoardId = localStorage.getItem('startBoard_AppDataFolder');
            if (startBoardId) {
                // Търсим дали имаме вече някаква информация или слагаме дефолтния Main
                boardsData = [{ id: 1, title: 'Main', gdid: startBoardId, numord: 1 }];
            }
        }
        await syncGlobalFoldersJson();
        console.log('[FirstRun] folders.json created.');
    } catch (e) {
        console.warn('[FirstRun] Error creating folders.json:', e);
    }
    // --- СТЪПКА 5: Подразбиращи се координати за плаващите бутони ---
    // localStorage.setItem('popupMenuBtnPosition', JSON.stringify({ top: '60px', right: '10px' }));
    // Задаваме FAB бутона малко по-вляво от KB Assistant (който е на right: 10px)
    // localStorage.setItem('addNoteFabPosition', JSON.stringify({ top: (window.innerHeight - 80) + 'px', right: '70px' }));
    // localStorage.setItem('kbFabPosition', JSON.stringify({ bottom: '10px', right: '10px' }));
    // localStorage.setItem('scrollTopBtnPosition', JSON.stringify({ bottom: '50px', right: '10px' }));
    // --- СТЪПКА 6: Създаване на settings.json с профил Default ---
    try {
        await saveSettingsToGDrive(true); // silent=true
        console.log('[FirstRun] settings.json created with Default profile.');
    } catch (e) {
        console.warn('[FirstRun] Error creating settings.json:', e);
    }
    if (typeof showToast === 'function') showToast(_('firstRunComplete'), 5000);
    localStorage.setItem('initial_setup_complete', 'true');
    console.log('[FirstRun] First-time setup complete.');
    return true;
}

async function mainLogic() {
    const loaderFolderInfo = document.getElementById('loader-folder-info');
    if (loaderFolderInfo) loaderFolderInfo.textContent = `(${activeFolderName})`;
    const settingsOverride = localStorage.getItem('settings_json_full_override'); //@@ прилагане на промени, направени в set.html
    if (settingsOverride) {
        localStorage.removeItem('settings_json_full_override');
        try {
            const parsed = JSON.parse(settingsOverride);
            const currentDevice = localStorage.getItem('deviceName') || 'Default';
            if (parsed[currentDevice]) {
                const devSettings = parsed[currentDevice];
                Object.keys(devSettings).forEach(k => {
                    let val = devSettings[k];
                    if (k === 'boardMenuOrder' && (!val || (Array.isArray(val) && val.length === 0))) return;
                    if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
                    localStorage.setItem(k, val);
                });
                console.log("[Settings-Override] Applied settings for device:", currentDevice);
            }
            if (!isOffline) {
                (async () => {
                    try {
                        const folderId = await getFolderIDByName('multinotes_data');
                        if (folderId) {
                            const existingFiles = await findGDFileByName(folderId, 'settings.json');
                            if (existingFiles && existingFiles.length > 0) {
                                await updateGDriveFile(existingFiles[0].id, settingsOverride);
                                console.log("[Settings-Override] Pushed to GDrive.");
                            }
                        }
                    } catch (err) {
                        console.error("GDrive push error for settings override:", err);
                    }
                })();
            }
        } catch (e) {
            console.error("Error applying settings override:", e);
        }
    }
    if (isOffline) {
        console.log("Working in offline mode. Skipping sync.");
        loaderText.textContent = _('loadingFromLocal');

        // --- КОРЕКЦИЯ: Инициализация на състоянието и в офлайн режим ---
        updateGlobalStateFlags();
        if (useArhDb) {
            dbSourceGlobal = 3; dbNoteIdTypeGlobal = 'id';
        } else if (useLocalFolder) {
            dbSourceGlobal = 2; dbNoteIdTypeGlobal = 'gdid';
        } else if (useGoogleDb) {
            dbSourceGlobal = 1; dbNoteIdTypeGlobal = 'gdid';
        }
        updateModeButton();
        initializeLoad(); // Нулираме контейнерите и подготвяме за нови данни

        try {
            await fetchAllDataLocal();
            await renderUI({ boardParseError: false });
        } catch (e) {
            console.error("Error loading local data in offline mode:", e);
        }

        // --- КОРЕКЦИЯ: Осигуряваме видимост на UI елементите ---
        showAppUI();

        if (currentBoardFilter !== 'calendar' && currentBoardFilter !== 'calendar_monthly' && currentBoardFilter !== 'calendar_weekly') {
            const addNoteFab = document.getElementById('add-note-fab');
            if (addNoteFab) addNoteFab.style.display = 'flex';
        }

        // Показваме бутона за инсталиране, ако има такъв
        if (window.showInstallButton) window.showInstallButton();

        return;
    }
    if (isMainLogicRunning) {
        console.log("mainLogic is already running, skipping...");
        return;
    }
    isMainLogicRunning = true;
    try {
        dbSourceGlobal = null; // Нулираме глобалните променливи
        isLoadCancelled = false; // Нулираме флага за отказ при всяко ново зареждане
        updatedNoteGdims = []; // Изчистваме масива с обновени бележки при всяко зареждане
        dataIntegrityIssues = []; // Reset integrity report
        isInitialLoad = true; // --- КОРЕКЦИЯ: Нулираме флага, за да работи скролирането при презареждане ---
        updateGlobalStateFlags();
        enableSettingsControls();
        // Извикваме новата функция за валидация
        if (!validateDataSourceSelection()) return;
        // --- ЗАДАВАНЕ НА ГЛОБАЛЕН ИЗТОЧНИК И ТИП ВРЪЗКА ЗА ТЕКУЩАТА СЕСИЯ ---
        // Това е необходимо, за да работят коректно функции като createNoteElement,
        // дори когато не се използва база данни.
        if (useArhDb) {
            dbSourceGlobal = 3; // 3: Архив
            dbNoteIdTypeGlobal = 'id';
        } else if (useLocalFolder) {
            dbSourceGlobal = 2; // 2: Локална папка
            dbNoteIdTypeGlobal = 'gdid';
        } else if (useGoogleDb) {
            dbSourceGlobal = 1; // 1: Google Drive
            dbNoteIdTypeGlobal = 'gdid';
        }
        initializeLoad(); // Resets state and shows the loader screen
        let hasLocalData = false;
        if (useIndexedDb) {
            dbExists = await checkDbExists(NOTES_DB_NAME);
            if (dbExists) {
                const boardsInDb = await getAllFromDB(BOARD_STORE_NAME);
                if (boardsInDb && boardsInDb.length > 0) {
                    hasLocalData = true;
                }
            }
        }
        if (!hasLocalData) {
            if (!authToken) {
                const authResult = await checkAuth(isExplicitLogin);
                if (!authResult || !authResult.pass) {
                    if (isLoadCancelled) return;
                    showAppUI();
                    return;
                }
                authToken = authResult.tokenData;
            }
            if (!isOffline) await loadGlobalFoldersJson();
            if (!isOffline) {
                const wasFirstRun = await handleFirstRunSetup();
                if (wasFirstRun) {
                    console.log('[mainLogic] First run setup completed. Reloading to start normal cycle...');
                    location.reload();
                    return;
                }
            }
        }
        const loaderTitle = document.getElementById('loader-title'); // Element to display loader title
        updateModeButton(); // Актуализираме иконата за режим веднага
        // Проверяваме за базата данни и нейното съдържание ВИНАГИ, когато useIndexedDb е true
        let boardsInDb = [];
        if (useIndexedDb) {
            dbExists = await checkDbExists(NOTES_DB_NAME);
            if (dbExists) {
                boardsInDb = await getAllFromDB(BOARD_STORE_NAME);
                if (isLoadCancelled) return;
            }
            // ПРОВЕРКА ЗА НЕСЪОТВЕТСТВИЕ НА БАЗАТА И ИЗТОЧНИКА
            // Тази проверка се прави тук, за да обхване всички режими, които използват база данни.
            if (dbExists && boardsInDb.length > 0) {
                // Извличаме конфигурацията на базата САМО ВЕДНЪЖ тук
                // Взимаме стойностите от базата само ако не са зададени вече от активен източник (GD, Local, Arh).
                // Това е важно за режим "само база данни".
                const dbSource = await getConfig('dbSource');
                const dbNoteIdType = await getConfig('dbNoteIdType');
                dbSourceGlobal = dbSource;
                dbNoteIdTypeGlobal = dbNoteIdType;
                console.log(`[mainLogic] DB Config Loaded: Source=${dbSource}, IdType=${dbNoteIdType}`);
                if (dbNoteIdType) { // Проверяваме само ако типът е записан
                    // Проверяваме за несъответствие, САМО ако е избран и друг източник на данни
                    const isAnySourceActive = useGoogleDb || useLocalFolder || useArhDb;
                    if (isAnySourceActive) {
                        if ((dbNoteIdType === 'id' && !useArhDb) || (dbNoteIdType === 'gdid' && useArhDb)) {
                            console.warn(`[mainLogic] Data source mismatch! DB expects ${dbNoteIdType}, but current mode is different.`);
                            showToast(_('errorDbSourceMismatch'), 15000);
                        }
                    }
                }
            }
            // --- КОРЕКЦИЯ: Гарантираме, че dirHandle е зареден в режим "Само база данни" ---
            // Ако сме в режим "Само база данни" и базата е създадена от локален източник,
            // трябва да заредим dirHandle, за да работят линковете към прикачени файлове.
            if (useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb && dbExists && boardsInDb.length > 0) {
                const dbSource = await getConfig('dbSource');
                let handleKey = null;
                if (dbSource === 2) handleKey = 'directoryHandle'; // Локална папка
                else if (dbSource === 3) handleKey = 'arhHandle';   // Архив
                if (handleKey) {
                    const handle = await getConfig(handleKey);
                    const verifiedHandle = handle ? await verifyPermission(handle) : null;
                    if (verifiedHandle) {
                        dirHandle = verifiedHandle; // Задаваме глобалния handle
                    } else {
                        showToast(_('noUpdateMode'), 10000);
                    }
                }
            }
        }
        // --- КОРЕКЦИЯ: Извикваме проверката за потребител тук, след като UI е готов ---
        if (!hasLocalData) {
            await userCheck();
        }
        if (isLoadCancelled) return;
        // ПРЕЗАРЕЖДАМЕ флаговете, в случай че userCheck ги е променил!
        updateGlobalStateFlags();
        // НОВА ПРОВЕРКА: Ако е избрана само база данни, но тя е празна
        if (useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb && dbExists && boardsInDb.length === 0) {
            showToast(_('errorDbOnlyAndEmpty'), 15000);
            if (isLoadCancelled) return;
            document.getElementById('settings-modal').classList.add('visible');
            loaderContainer.style.display = 'none'; // Скриваме лоудъра
            return; // Прекратяваме изпълнението
        }
        try {
            // --- УСЛОВНО ЗАРЕЖДАНЕ НА GOOGLE DRIVE API ---
            // Зареждаме API-то само ако ще работим с Google Drive.
            if (useGoogleDb) {
                if (typeof gapi !== 'undefined' && gapi.client) {
                    gapi.client.setToken({ access_token: authToken.access_token });
                }
            }
            if (useArhDb) {
                // --- РЕЖИМ 0: Зареждане от Архив ---
                console.log("Mode: Archive");
                if (loaderTitle) loaderTitle.textContent = _('arhFolderLabel');
                // --- КОРЕКЦИЯ: Задаваме правилното заглавие на лоудъра ---
                // Преди: Показваше "Избери архивна папка", дори когато такава вече е избрана.
                // Сега: Показва "Зареждане директно от архив", което е по-коректно.
                if (loaderTitle) {
                    loaderTitle.textContent = useIndexedDb ? _('dbManagementTitle') : _('loadedFromArhNoDb');
                }
                const arhHandle = await getConfig('arhHandle');
                if (!arhHandle) {
                    showToast(_('errorArhFolderNotSelected'), 10000);
                    if (isLoadCancelled) return;
                    document.getElementById('settings-modal').classList.add('visible');
                    return; // Stop execution if no archive handle
                }
                const verifiedHandle = await verifyPermission(arhHandle);
                if (isLoadCancelled) return;
                if (!verifiedHandle) {
                    showToast(_('permissionDenied'), 10000);
                    return; // Stop execution if no permission
                }
                dirHandle = verifiedHandle; // <-- ДОБАВЕН РЕД
                if (useIndexedDb) {
                    // Archive + IndexedDB mode
                    console.log("Mode: Archive + IndexedDB");
                    if (!dbExists || boardsInDb.length === 0) {
                        // DB is empty or does not exist, prompt for creation from archive
                        const confirmed = await showConfirmation(_('confirmCreateDbFromArh')); // "Искате ли да се създаде локална база?"
                        if (confirmed) {
                            loaderText.textContent = _('creatingDbFromArh');
                            if (isLoadCancelled) return;
                            const success = await readArh(verifiedHandle); // Read archive into memory
                            if (success) {
                                if (isLoadCancelled) return;
                                const dbCreatedSuccessfully = await createDatabaseFromMemory(); // Create DB from memory
                                if (dbCreatedSuccessfully) {
                                    showToast(_('dbCreated'), 10000);
                                    if (isLoadCancelled) return;
                                    await fetchAllDataLocal(); // Load from the newly created DB
                                    await renderUI({ boardParseError: false });
                                } else {
                                    showToast(_('dbCreateFailedNoData'), 10000);
                                    // Fallback to direct archive load if DB creation fails
                                    await readArh(verifiedHandle); // Re-read archive into memory for direct display
                                    await renderUI({ boardParseError: false });
                                }
                            } else {
                                // If reading archive failed, cannot create DB.
                                showToast(_('errorReadArh'), 10000);
                                // What to do here? Maybe just show an empty UI or an error.
                            }
                        } else {
                            // User declined to create DB, load directly from archive for this session
                            showToast(_('loadedFromArhNoDb'), 10000);
                            if (isLoadCancelled) return;
                            const success = await readArh(verifiedHandle);
                            if (success) {
                                await renderUI({ boardParseError: false });
                            }
                        }
                    } else {
                        // DB exists and has data, load from DB
                        loaderText.textContent = _('loadingFromDb');
                        if (isLoadCancelled) return;
                        await fetchAllDataLocal();
                        await renderUI({ boardParseError: false });
                    }
                } else {
                    // Archive mode without IndexedDB
                    console.log("Mode: Archive (no IndexedDB)");
                    // КЛЮЧОВА СТЪПКА: Задаваме dirHandle и при директно четене
                    dirHandle = verifiedHandle;
                    if (isLoadCancelled) return;
                    const success = await readArh(verifiedHandle);
                    if (success) {
                        await renderUI({ boardParseError: false });
                    }
                }
            } else if (!useIndexedDb) {
                // --- РЕЖИМ 1: Без IndexedDB - Директно зареждане от източник ---
                console.log("Mode: Direct from source (IndexedDB is OFF)");
                if (useGoogleDb) {
                    // Нулираме dirHandle тук, за да сме сигурни, че няма да се използват стари handles от локален/архивен режим
                    dirHandle = null;
                    console.log("Source: Google Drive");
                    if (loaderTitle) loaderTitle.textContent = _('sourceGoogleDrive');
                    if (isLoadCancelled) return;
                    const result = await fetchAllData(null, false); // false -> не записвай в DB
                    if (result.error) return;
                    // Прилагаме филтъра за демо версията ПРЕДИ рендиране
                    filterNotesForDemo();
                    await renderUI({ boardParseError: result.boardParseError });
                } else if (useLocalFolder) {
                    console.log("Source: Local Folder");
                    if (loaderTitle) loaderTitle.textContent = _('sourceLocalFolder');
                    const { boardParseError } = await fetchAllDataFromLocalFolder();
                    // Прилагаме филтъра за демо версията ПРЕДИ рендиране
                    filterNotesForDemo();
                    await renderUI({ boardParseError });
                }
            } else {
                // --- РЕЖИМ 2: С IndexedDB
                console.log("Mode: Using IndexedDB");
                if (!dbExists || boardsInDb.length === 0) {
                    // Първоначално създаване на базата данни
                    console.log("DB is empty or does not exist. Performing initial data load.");
                    if (loaderTitle) loaderTitle.textContent = _('dbManagementTitle');
                    loaderText.textContent = _('initialDataLoad');
                    if (useGoogleDb) {
                        console.log("Source for initial load: Google Drive");
                        if (isLoadCancelled) return;
                        const result = await fetchAllData(null);
                        if (result.error) { // Проверяваме за грешка при зареждането
                            return; // Прекратяваме, ако няма файлове
                        }
                        // Разрешаваме дублираните бележки, ако има такива (преди запис в базата)
                        if (result.duplicates && result.duplicates.length > 0) {
                            await resolveLoadedConflicts(result.duplicates);
                        }
                        // Прилагаме филтъра за демо версията ПРЕДИ създаване на DB и рендиране
                        filterNotesForDemo();
                        await createDatabaseFromMemory();
                        await renderUI({ boardParseError: result.boardParseError });
                    } else if (useLocalFolder) {
                        console.log("Source for initial load: Local Folder");
                        const { boardParseError } = await fetchAllDataFromLocalFolder();
                        // Прилагаме филтъра за демо версията ПРЕДИ създаване на DB и рендиране
                        filterNotesForDemo();
                        await createDatabaseFromMemory();
                        await renderUI({ boardParseError });
                    }
                    showToast(_('dbCreated'), 10000);
                } else {
                    // DB exists and has data, load from DB FIRST then sync in background
                    console.log("[mainLogic] DB exists. Fast loading local data first.");
                    loaderText.textContent = _('fetchingFromDb');
                    if (isLoadCancelled) return;
                    await fetchAllDataLocal();

                    // --- ПЪРВОНАЧАЛНО РЕНДИРАНЕ (ОТ БАЗАТА) ---
                    await renderUI({ boardParseError: false });

                    // Background Sync Task - стартираме го веднага след първото рендиране
                    const updateFromSource = localStorage.getItem('updateFromSource') !== 'false';
                    if (updateFromSource && !isOffline) {
                        (async () => {
                            try {
                                if (hasLocalData) {
                                    if (!authToken) {
                                        const authResult = await checkAuth(isExplicitLogin);
                                        if (authResult && authResult.pass) {
                                            authToken = authResult.tokenData;
                                        }
                                    }
                                    if (authToken) {
                                        if (useGoogleDb && typeof gapi !== 'undefined' && gapi.client) {
                                            gapi.client.setToken({ access_token: authToken.access_token });
                                        }
                                        await loadGlobalFoldersJson();
                                        const wasFirstRun = await handleFirstRunSetup();
                                        if (wasFirstRun) {
                                            location.reload();
                                            return;
                                        }
                                        await userCheck();
                                        updateGlobalStateFlags();
                                    } else {
                                        return;
                                    }
                                }
                                console.log("[mainLogic] Starting background sync task...");
                                let updatedCount = 0;
                                if (useGoogleDb) {
                                    updatedCount = await runGoogleDriveSync();
                                } else if (useLocalFolder) {
                                    updatedCount = await runLocalSync();
                                }
                                if (updatedCount > 0) {
                                    console.log(`[mainLogic] Background sync finished: ${updatedCount} updates found.`);
                                    await fetchAllDataLocal();
                                    if (updatedNoteGdims.length > 0 && !document.getElementById('modal-body')) {
                                        currentBoardFilter = 'new-updates';
                                    }
                                    await renderUI({ boardParseError: false });
                                    showToast(useGoogleDb ? _('gdriveUpdatesFound').replace('{count}', updatedCount) : _('localUpdatesFound').replace('{count}', updatedCount), 5000);
                                } else {
                                    console.log("[mainLogic] Background sync finished. No new updates.");
                                }
                            } catch (e) {
                                console.error("[mainLogic] Background sync error:", e);
                            }
                        })();
                    }
                }
            }
            reportDataIntegrityIssues(); // Generate report before finishing loading
        } catch (err) {
            console.log("Error in mainLogic:", err);
            showToast(_('errorProcessingFiles'));
            loaderContainer.style.display = 'none'; // Скриваме лоудъра при грешка
        } finally {
            if (isLoadCancelled) return; // Не скриваме лоудъра, ако е отказано, за да не "премигне"
            // Изчистваме текстовете в лоудъра, преди да го скрием
            const loaderTitle = document.getElementById('loader-title');
            if (loaderTitle) loaderTitle.textContent = '';
            const loaderFolderInfo = document.getElementById('loader-folder-info');
            if (loaderFolderInfo) loaderFolderInfo.textContent = '';
            loaderText.textContent = ''; // Изчистваме текста за прогреса
            updateSearchPlaceholder();
            document.body.style.backgroundImage = `url('Board.png')`; // Reset background
            // Скриваме лоудъра и логин страницата
            loaderContainer.style.display = 'none';
            document.getElementById('login-page').style.display = 'none';
            document.getElementById('login-page').hidden = true;
            // Показваме основните елементи, след като всичко е заредено
            document.querySelector('header').style.visibility = 'visible';
            document.querySelector('#search-wrapper').style.display = 'flex';
            notesContainer.style.visibility = 'visible';
            isMainLogicRunning = false;

            if (currentBoardFilter !== 'calendar' && currentBoardFilter !== 'calendar_monthly' && currentBoardFilter !== 'calendar_weekly') {
                const addNoteFab = document.getElementById('add-note-fab');
                if (addNoteFab) addNoteFab.style.display = 'flex';
            }
            if (window.showInstallButton) window.showInstallButton();
            if (!isOffline) loadSettingsFromGDrive(true);
        }
    } finally {
        // Изчистваме осиротели файлове след зареждане на всичко
        // cleanupOrphanedImages();
        isMainLogicRunning = false;
    }
}

/**
 * Зарежда всички данни директно от локална папка, без да използва IndexedDB.
 * Аналогична на fetchAllData, но за локален източник.
 */
async function fetchAllDataFromLocalFolder() {
    console.log("--- Local Folder fetch sequence started ---");
    const startTime = performance.now();
    const handle = await getDirectoryHandle();
    if (!handle) {
        window.wasOpenedForMissingFolder = true; // Вдигаме флага
        showToast(_('errorLocalFolderNotSelected'), 10000);
        document.getElementById('settings-modal').classList.add('visible');
        return { boardParseError: false };
    }
    let localBoards = [];
    let localMedia = [];
    let localNotes = [];
    let boardParseError = false;
    const gdidMap = new Map(); // To track duplicates for processing
    localFileMap.clear(); // Изчистваме глобалната карта преди ново зареждане
    try {
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
        console.log(`[Local Folder] Found ${entries.length} valid .txt files for processing.`);
        const CHUNK_SIZE = 80; // Balanced parallelism
        for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
            const chunk = entries.slice(i, i + CHUNK_SIZE);
            // Optimize UI updates - only update once per chunk
            loaderText.textContent = `${_('loadingFile')} (${Math.min(i + CHUNK_SIZE, entries.length)}/${entries.length})`;
            await Promise.all(chunk.map(async (item) => {
                try {
                    const file = await item.entry.getFile();
                    const content = await file.text();
                    const fileObject = JSON.parse(content);
                    if (!fileObject.gdid) {
                        const error = `[Missing ID] File '${item.entry.name}' is missing 'gdid' property.`;
                        console.warn(error);
                        dataIntegrityIssues.push({ type: 'missing', file: item.entry.name, gdid: null });
                    } else {
                        if (gdidMap.has(fileObject.gdid)) {
                            const error = `[Duplicate ID] GDID '${fileObject.gdid}' found in multiple files: '${gdidMap.get(fileObject.gdid)}' and '${item.entry.name}'`;
                            console.error(error);
                            dataIntegrityIssues.push({ type: 'duplicate', gdid: fileObject.gdid, file1: gdidMap.get(fileObject.gdid), file2: item.entry.name });
                        } else {
                            gdidMap.set(fileObject.gdid, item.entry.name);
                            localFileMap.set(fileObject.gdid, item.entry.name); // Попълваме глобалната карта
                        }
                    }
                    if (item.isBoard) {
                        localBoards.push(fileObject);
                    } else if (item.isMedia) {
                        localMedia.push(fileObject);
                    } else if (item.isNote) {
                        localNotes.push(fileObject);
                    }
                } catch (e) {
                    console.log(`Failed to process ${item.entry.name}:`, e);
                }
            }));
        }
    } catch (err) {
        if (err.name === 'NotFoundError') {
            console.log("Local folder not found:", err);
            showToast(_('errorLocalFolderNotFound'), 15000);
            // Изчистваме невалидния handle от базата данни
            await saveConfig('directoryHandle', null);
            // Отваряме настройките, за да може потребителят да избере нова папка
            document.getElementById('settings-modal').classList.add('visible');
            // Нулираме и UI елемента, показващ името на папката
            const folderNameDisplay = document.getElementById('local-sync-folder-name');
            if (folderNameDisplay) folderNameDisplay.textContent = _('folderNotSelected');
        } else {
            console.log("Error parsing local files:", err);
            showToast(_('errorNoteParse'));
        }
        boardParseError = true; // Вдигаме флага за грешка и в двата случая
    }
    // Зареждаме данните в глобалните променливи
    boardsData = localBoards.flat(); // .flat() за всеки случай, ако някой файл съдържа масив
    mediaData = localMedia.flat();
    allNotesData = localNotes;
    trackMaxIds(allNotesData);
    trackMaxBoardIds(boardsData);
    const endTime = performance.now();
    console.log(`--- Local Folder fetch sequence completed in ${((endTime - startTime) / 1000).toFixed(2)}s ---`);
    console.log(`[Summary] Boards: ${boardsData.length}, Media: ${mediaData.length}, Notes: ${allNotesData.length}`);
    return { boardParseError };
}
