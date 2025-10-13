// ================================================================================
// IV. ЧЕТЕНЕ НА ДАННИ ОТ GOOGLE DRIVE
// ================================================================================

    async function parseFileResults(results, filenameForError) {
        const data = [];
        let parseError = false;
        results.forEach(({ res }) => {
            if (res.body.trim() === '') return;
            try {
                const content = JSON.parse(res.body);
                // For note.txt, the content is the object itself.
                // For board.txt and media.txt, the content is an array of objects.
                if (filenameForError === 'note.txt') {
                     if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
                        data.push(content);
                    }
                } else { // board.txt, media.txt
                    if (Array.isArray(content)) {
                        data.push(...content);
                    } else if (typeof content === 'object' && content !== null) {
                        // Handle case where a file might contain a single object instead of an array
                        data.push(content);
                    }
                }
            } catch (e) {
                parseError = true;
                console.error(`Error parsing content from a '${filenameForError}' file:`, e, "Content was:", res.body);
            }
        });
        return { data, parseError };
    }

    async function loadAndParseFile(filename, folderId, modifiedSince = null) {
        loaderText.textContent = _('loadingFile') + ` ${filename}`;
        const results = await fetchFiles(filename, folderId, null, modifiedSince);
        return await parseFileResults(results, filename);
    }

    async function fetchAllData(folderIdFromPrompt, saveToDb = true, modifiedSince = null) {
        let folderId = folderIdFromPrompt || await getFolderID();
        if (!folderId) {
            // Try to load from local DB as a fallback
            console.log("Main folder ID not found on Google Drive, attempting to load from local IndexedDB.");
            try {
                await fetchAllDataLocal();
                if (allNotesData.length > 0) {
                    showToast(_('loadedFromLocalNoDrive'), 5000);
                    return { boardParseError: false }; // Assuming no parse error from local
                }
            } catch (localDbError) {
                console.error("Failed to load from local DB as well:", localDbError);
            }
            // If local loading also fails or is empty, show the original error.
            showMessagePopup(_('errorFolderNotFound'));
            throw new Error("Main folder ID not found.");
        }
        // Proceed with fetching from Google Drive
        const { data: boardFileData, parseError: boardParseError } = await loadAndParseFile('board.txt', folderId, modifiedSince);
        boardsData = boardFileData;
        if (saveToDb) {
            await bulkPutDB(BOARD_STORE_NAME, boardsData); // Sync to DB
        }
        const { data: mediaFileData } = await loadAndParseFile('media.txt', folderId, modifiedSince);
        mediaData = mediaFileData;
        if (saveToDb) {
            await bulkPutDB(MEDIA_STORE_NAME, mediaData); // Sync to DB
        }
        const onNoteProgress = (loaded, total) => {
            loaderText.textContent = `${_('loadingFile')} ${loaded} ${_('of')} ${total}`;
        };
        loaderText.textContent = _('loadingFile') + ' note.txt...';
        const noteResults = await fetchFiles('note.txt', folderId, onNoteProgress, modifiedSince);
        // We need to process the raw data for both the UI and the DB
        const notesToStoreInDB = [];
        allNotesData = noteResults.map(r => {
            const content = JSON.parse(r.res.body);
            notesToStoreInDB.push(content);
            return { file: r.file, content: content, rawData: r };
        });
        if (saveToDb && notesToStoreInDB.length > 0) {
            await bulkPutDB(NOTE_STORE_NAME, notesToStoreInDB); // Sync to DB
        }
        return { boardParseError };
    }

    /**
     * Fetches only updated files from Google Drive since the last sync and updates IndexedDB.
     */
    async function runGoogleDriveSync() {
        let updatedFilesCount = 0;
        const lastSyncTimestamp = await getConfig('lastGoogleDriveSyncTimestamp');
        const modifiedSince = lastSyncTimestamp ? new Date(lastSyncTimestamp).toISOString() : null;

        if (modifiedSince) {
            console.log(`Checking for Google Drive updates since ${modifiedSince}`);
        } else {
            console.log('Performing full initial sync from Google Drive to local DB.');
        }

        const folderId = await getFolderID();
        if (!folderId) {
            showToast(_('errorFolderNotFound'));
            return;
        }

        const syncFile = async (filename, storeName) => {
            const files = await fetchFiles(filename, folderId, null, modifiedSince);
            if (files.length > 0) {
                updatedFilesCount += files.length;
                console.log(`Found ${files.length} updated '${filename}' file(s).`);
                const parsedData = await parseFileResults(files, filename);
                if (parsedData.data.length > 0) {
                    await bulkPutDB(storeName, parsedData.data, true); // Incremental update
                }
            }
        };

        await syncFile('board.txt', BOARD_STORE_NAME);
        await syncFile('media.txt', MEDIA_STORE_NAME);
        await syncFile('note.txt', NOTE_STORE_NAME);

        if (modifiedSince) { // Only show toast for incremental updates
            const message = updatedFilesCount > 0
                ? _('gdriveUpdatesFound').replace('{count}', updatedFilesCount)
                : _('gdriveNoUpdates');
            showToast(message, 10000);
        }
        await saveConfig('lastGoogleDriveSyncTimestamp', Date.now());
        console.log('Google Drive sync finished.');
    }

    async function fetchFiles(filename, folderId, onProgress, modifiedSince = null) {
        if (!folderId || typeof folderId !== 'string' || folderId.trim() === '') {
            showMessagePopup(_('errorInvalidFolderIdSession'));
            throw new Error("Invalid Folder ID provided to fetchFiles.");
        }

        let query = `'${folderId}' in parents and name = '${filename}' and mimeType='text/plain' and trashed = false`;
        if (modifiedSince) {
            query += ` and modifiedTime > '${modifiedSince}'`;
        }

        const allFiles = [];
        let pageToken = null;
        do {
            const response = await gapi.client.drive.files.list({
                q: query,
                fields: 'files(id, name), nextPageToken',
                pageSize: 1000,
                pageToken: pageToken
            });
            if (!response.result || !response.result.files) {
                throw new Error("Invalid response from Drive API.");
            }
            allFiles.push(...response.result.files);
            pageToken = response.result.nextPageToken;
        } while (pageToken);

        if (allFiles.length === 0) {
            if (modifiedSince) console.log(`No files named '${filename}' modified since ${modifiedSince}.`);
            return [];
        }

        let loadedFiles = 0;
        const totalFiles = allFiles.length;
        const filePromises = allFiles.map(file =>
            gapi.client.request({ path: `/drive/v3/files/${file.id}`, params: { alt: 'media' } })
            .then(res => {
                loadedFiles++;
                if (onProgress) {
                    onProgress(loadedFiles, totalFiles);
                }
                return { file, res };
            })
        );
        return Promise.all(filePromises);
    }
    async function getFileID(folderId, fileName) {
        try {
            const response = await gapi.client.drive.files.list({
                q: `'${folderId}' in parents and name = '${fileName}'`,
                fields: 'files(id, name)',
                pageSize: 1
            });
            const files = response.result.files;
            if (files && files.length > 0) {
                return files[0].id;
            } else {
                console.warn(`File '${fileName}' not found in folder '${folderId}'.`);
                return null;
            }
        } catch (error) {
            console.error(`Error fetching file ID for '${fileName}' in folder '${folderId}':`, error);
            showToast(`Error fetching file ID for ${fileName}.`);
            return null;
        }
    }
    async function getFolderID() {
        try {
            const multinotesDataId = await getMultinotesDataFolderID();
            if (!multinotesDataId) {
                return null;
            }
            const folderNames = ["Other", "Sound", "Video", "Images"];
            for (const name of folderNames) {
                const response = await gapi.client.drive.files.list({
                    q: `'${multinotesDataId}' in parents and name = '${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
                    fields: 'files(id)',
                    pageSize: 1
                });
                const files = response.result.files;
                if (files && files.length > 0) {
                    folderIds[name] = files[0].id;
                } else {
                    console.warn(`Folder '${name}' not found within 'multinotes_data'.`);
                    folderIds[name] = "";
                }
            }
            return multinotesDataId;
        } catch (error) {
            console.error("Error in getFolderID:", error);
            showToast("Error fetching folder IDs.");
            return null;
        }
    }
    async function getMultinotesDataFolderID() {
        try {
            const response = await gapi.client.drive.files.list({
                q: "name='multinotes_data' and mimeType='application/vnd.google-apps.folder' and trashed=false",
                fields: 'files(id)',
                pageSize: 1
            });
            const files = response.result.files;
            if (files && files.length > 0) {
                return files[0].id;
            } else {
                console.warn("Folder 'multinotes_data' not found.");
                return null;
            }
        } catch (error) {
            console.error("Error fetching multinotes_data folder ID:", error);
            // If it's an auth error, redirect to login
            if (error.result && error.result.error && error.result.error.code === 401) {
                showToast(_('errorSessionExpired'));
                handleSignoutClick();
            }
            return null;
        }
    }
