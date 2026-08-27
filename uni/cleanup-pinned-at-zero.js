/*
 * ЕДНОКРАТНО ПОЧИСТВАНЕ НА pinnedAt: 0
 *
 * Отвори CX Notes, изчакай бележките да се заредят, после постави целия
 * файл в DevTools Console и потвърди. Скриптът не се зарежда от приложението.
 */
(async () => {
    if (!Array.isArray(allNotesData)) {
        throw new Error('allNotesData is not available. Run this in the CX Notes page after it has loaded.');
    }

    const notesToClean = allNotesData.filter(note =>
        note && (note.pinnedAt === 0 || note.pinnedAt === '0')
    );

    if (notesToClean.length === 0) {
        console.info('No pinnedAt: 0 values found. Nothing to clean.');
        return;
    }

    if (!confirm(`Remove pinnedAt: 0 from ${notesToClean.length} note(s)?`)) {
        console.info('Cleanup cancelled.');
        return;
    }

    for (const note of notesToClean) {
        delete note.pinnedAt;
    }

    const updateGDriveNow = useGoogleDb && !isOffline;
    const updateLocalFolderNow = useLocalFolder && !isOffline;
    const failures = [];

    if (updateGDriveNow) {
        for (const note of notesToClean) {
            if (!note.gdid || String(note.gdid) === String(note.id)) {
                failures.push({ note, reason: 'missing permanent Google Drive id' });
                continue;
            }
            try {
                const saved = await updateGDriveFile(note.gdid, JSON.stringify(note));
                if (!saved) throw new Error('updateGDriveFile returned false');
            } catch (error) {
                failures.push({ note, reason: error.message || String(error) });
            }
        }
    }

    if (updateLocalFolderNow) {
        for (const note of notesToClean) {
            if (!note.gdid) {
                failures.push({ note, reason: 'missing local-file id' });
                continue;
            }
            try {
                await updateLocalFile(note.gdid, JSON.stringify(note));
            } catch (error) {
                failures.push({ note, reason: error.message || String(error) });
            }
        }
    }

    for (const note of notesToClean) {
        note.type = failures.some(failure => failure.note === note) ? -1 : 0;
    }

    if (useIndexedDb) {
        await bulkPutDB(NOTE_STORE_NAME, notesToClean, true);
    }

    if (typeof applyFilters === 'function') applyFilters();
    if (typeof updateReloadButtonState === 'function') updateReloadButtonState();

    console.info(`Cleaned ${notesToClean.length} note(s).`, {
        saved: notesToClean.length - failures.length,
        failed: failures.map(({ note, reason }) => ({ id: note.id, gdid: note.gdid, reason }))
    });
})();
