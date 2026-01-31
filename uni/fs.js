async function exportStore(dbName, storeName) {
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
          // Ако няма (като 'config'), запазваме и ключа, и стойността.
          if (store.keyPath) {
            results.push(cursor.value);
          } else {
            results.push({ key: cursor.key, value: cursor.value });
          }
          cursor.continue();
        } else {
          // Курсорът е стигнал до края, всички данни са прочетени.
          const data = JSON.stringify(results, null, 2);

          // Създаваме Blob и предлагаме на потребителя да го свали
          const blob = new Blob([data], { type: "application/json" });
          const url = URL.createObjectURL(blob);

          const a = document.createElement("a");
          a.href = url;
          a.download = `${storeName}-backup.bcp`; // Променяме името на файла
          a.click();

          URL.revokeObjectURL(url);
          db.close();
          resolve();
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

async function exportData(dbName, storeName) {
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
          // Ако няма (като 'config'), запазваме и ключа, и стойността.
          if (store.keyPath) {
            results.push(cursor.value);
          } else {
            results.push({ key: cursor.key, value: cursor.value });
          }
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

async function exportNotes() {
  let boards, notes, media;

  const inMemBoards = (typeof boardsData !== 'undefined' && boardsData.length > 0);
  const inMemNotes = (typeof allNotesData !== 'undefined' && allNotesData.length > 0);

  if (!inMemBoards && !inMemNotes) {
    if (typeof showToast === 'function') {
      showToast("No data in memory to export!", 3000);
    } else {
      alert("No data in memory to export!");
    }
    return;
  }

  console.log("Exporting from in-memory data...");
  // Create deep copies to avoid polluting the global state during processing
  boards = JSON.parse(JSON.stringify(boardsData || []));
  notes = JSON.parse(JSON.stringify(allNotesData || []));
  media = JSON.parse(JSON.stringify(mediaData || []));

  await processAndDownloadExport(boards, notes, media);
}

async function exportNotesFromDB() {
  console.log("Exporting from IndexedDB...");
  const boards = await exportData('NotesDB', 'boards');
  const notes = await exportData('NotesDB', 'notes');
  const media = await exportData('NotesDB', 'media');

  if (!notes || notes.length === 0) {
    if (typeof showToast === 'function') {
      showToast("No notes found in database to export!", 3000);
    } else {
      alert("No notes found in database to export!");
    }
    return;
  }

  await processAndDownloadExport(boards, notes, media);
}

async function processAndDownloadExport(boards, notes, media) {
  // Helper map for converting Note Google IDs to Note Numeric IDs
  const noteGdidToId = new Map();
  notes.forEach(note => {
    if (note.gdid) {
      noteGdidToId.set(note.gdid, note.id);
    }
  });

  // Process data: Link notes to boards using ID instead of GDID/BoardID logic
  for (const board of boards) {
    const originalBoardId = board.gdid;

    // Find notes belonging to this board
    const relatedNotes = notes.filter(n => n.boardid === originalBoardId);
    for (const note of relatedNotes) {
      note.boardid = String(board.id);
    }
    delete board.noteCount;
  }

  // Process media: Link media to notes using ID instead of GDID
  for (const m of media) {
    const originalNoteGdid = m.noteid;
    if (originalNoteGdid && noteGdidToId.has(originalNoteGdid)) {
      m.noteid = String(noteGdidToId.get(originalNoteGdid));
    }
    // Shorten path to filename only
    if (m.path && typeof m.path === 'string') {
      const lastSlashIndex = m.path.lastIndexOf('/');
      if (lastSlashIndex !== -1) {
        m.path = m.path.substring(lastSlashIndex + 1);
      }
    }
  }

  // Try using File System Access API for a smoother experience (one folder pick instead of 3 downloads)
  if (window.showDirectoryPicker) {
    try {
      let startOption = { mode: 'readwrite', startIn: 'downloads' };

      // Attempt to use the existing archive folder handle if available
      try {
        // Note: getConfig must be available globally or imported. main.js exposes it? 
        // fs.js might not have access to getConfig directly if it's not global.
        // Assuming getConfig is global based on main.js usage.
        if (typeof getConfig === 'function') {
          const arhHandle = await getConfig('arhHandle');
          if (arhHandle) {
            // Verify permission first? showDirectoryPicker might handle it or just use it as a hint.
            // The spec says startIn can be a handle.
            startOption.startIn = arhHandle;
          }
        }
      } catch (e) { console.log("Could not retrieve arhHandle for startIn", e); }

      const directoryHandle = await window.showDirectoryPicker(startOption);

      // Check if any of the files already exist
      let filesExist = false;
      const fileNames = ["boards.bcp", "notes.bcp", "medias.bcp"];
      for (const fname of fileNames) {
        try {
          await directoryHandle.getFileHandle(fname, { create: false });
          filesExist = true;
          break;
        } catch (e) { /* File does not exist */ }
      }

      if (filesExist && typeof showConfirmation === 'function') {
        // Close ANY visible modals first
        document.querySelectorAll('.modal.visible, .settings-modal.visible').forEach(m => m.classList.remove('visible'));
        // Wait for modal close animation
        await new Promise(resolve => setTimeout(resolve, 150));

        const confirmed = await showConfirmation(_('confirmFileOverwrite'));
        if (!confirmed) {
          console.log("Export cancelled by user at overwrite prompt.");
          return;
        }
      }

      const saveToFile = async (filename, content) => {
        const fileHandle = await directoryHandle.getFileHandle(filename, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(content);
        await writable.close();
      };

      await saveToFile("boards.bcp", JSON.stringify(boards));
      await saveToFile("notes.bcp", JSON.stringify(notes));
      await saveToFile("medias.bcp", JSON.stringify(media));

      if (typeof showToast === 'function') {
        showToast(_('archiveSavedSuccess') || "Archive saved successfully!", 3000);
      }
      return; // Exit successfully
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log("User cancelled folder picker.");
        return; // Simply stop if user cancelled
      }
      console.warn("Folder picker failed, falling back to multiple downloads:", err);
    }
  }

  // Fallback: Multiple separate downloads
  const blob = new Blob([JSON.stringify(boards)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "boards.bcp";
  a.click();
  URL.revokeObjectURL(url);

  const blob2 = new Blob([JSON.stringify(notes)], { type: "application/json" });
  const url2 = URL.createObjectURL(blob2);
  const a2 = document.createElement("a");
  a2.href = url2;
  a2.download = "notes.bcp";
  a2.click();
  URL.revokeObjectURL(url2);

  const blob3 = new Blob([JSON.stringify(media)], { type: "application/json" });
  const url3 = URL.createObjectURL(blob3);
  const a3 = document.createElement("a");
  a3.href = url3;
  a3.download = "medias.bcp";
  a3.click();
  URL.revokeObjectURL(url3);
}
