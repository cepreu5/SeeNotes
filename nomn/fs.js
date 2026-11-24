/**
 * Помощна функция за изтегляне на файл чрез <a> елемент.
 * Използва octet-stream по подразбиране за да не преименува Android Chrome файла.
 */
function downloadAsFile(filename, content, mimeType = 'application/octet-stream') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
          downloadAsFile(`${storeName}-backup.bcp`, data);

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
  if (inMemBoards || inMemNotes) {
    console.log("Exporting from in-memory data...");
    boards = JSON.parse(JSON.stringify(boardsData || []));
    notes = JSON.parse(JSON.stringify(allNotesData || []));
    media = JSON.parse(JSON.stringify(mediaData || []));
  } else {
    // Fallback: try IndexedDB
    console.log("No in-memory data, trying IndexedDB...");
    try {
      const dbExistsLive = typeof checkDbExists === 'function' ? await checkDbExists('NotesDB') : false;
      if (dbExistsLive) {
        boards = await exportData('NotesDB', 'boards');
        notes = await exportData('NotesDB', 'notes');
        media = await exportData('NotesDB', 'media');
      }
    } catch (e) {
      console.error("Error reading IndexedDB for export:", e);
    }
    if (!notes || notes.length === 0) {
      const msg = typeof _ === 'function' ? _('noDataToExport') || "No data to export!" : "No data to export!";
      if (typeof showToast === 'function') showToast(msg, 3000); else alert(msg);
      return;
    }
  }
  await processAndDownloadExport(boards, notes, media);
}

/**
 * Името е постоянно, за да подменя едно и също копие в NotebookLM при всяко ново изтегляне.
 */
const NOTES_MD_FILENAME = 'cx-notes.md';

function notesMdPad2(n) {
  return String(n).padStart(2, '0');
}

/** Дата (и час) за реда на бележката в markdown файла. */
function notesMdStamp(ms, withTime) {
  const d = new Date(Number(ms) || 0);
  if (isNaN(d.getTime())) return '';
  const date = `${notesMdPad2(d.getDate())}.${notesMdPad2(d.getMonth() + 1)}.${d.getFullYear()}`;
  if (!withTime) return date;
  return `${date} ${notesMdPad2(d.getHours())}:${notesMdPad2(d.getMinutes())}`;
}

/**
 * Първият ред на бележката е заглавието (така го пази и самото приложение).
 * Ако бележката е само един ред, той влиза само в заглавието, за да не се повтаря.
 */
function notesMdSplit(text) {
  const raw = String(text || '');
  const lines = raw.split('\n');
  let firstIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() !== '') { firstIndex = i; break; }
  }
  if (firstIndex === -1) return { title: '', body: '' };
  const firstLine = lines[firstIndex].trim();
  const clean = firstLine.replace(/^#+\s*/, '').trim();
  const title = clean.length <= 90 ? clean : clean.slice(0, 90).trim() + '…';
  let body = lines.slice(firstIndex + 1).join('\n').trim();
  if (!body && title !== clean) body = clean; // дългият първи ред не се губи
  return { title, body };
}

/**
 * Събира всички бележки без тези в кошчето в ЕДИН markdown файл, подредени по бордове,
 * всяка с дата, заглавие и текст. За качване в NotebookLM.
 */
async function exportNotesToMarkdown() {
  let boards = [];
  let notes = [];
  const inMemBoards = (typeof boardsData !== 'undefined' && boardsData.length > 0);
  const inMemNotes = (typeof allNotesData !== 'undefined' && allNotesData.length > 0);
  if (inMemBoards || inMemNotes) {
    boards = JSON.parse(JSON.stringify(boardsData || []));
    notes = JSON.parse(JSON.stringify(allNotesData || []));
  } else {
    try {
      const dbExistsLive = typeof checkDbExists === 'function' ? await checkDbExists('NotesDB') : false;
      if (dbExistsLive) {
        boards = await exportData('NotesDB', 'boards');
        notes = await exportData('NotesDB', 'notes');
      }
    } catch (e) {
      console.error('Error reading IndexedDB for markdown export:', e);
    }
  }

  // Кошчето (status = 1) не влиза, нито празните бележки.
  const visibleNotes = (notes || []).filter(n => Number(n.status) !== 1 && String(n.notetxt || '').trim() !== '');
  if (!visibleNotes.length) {
    const msg = typeof _ === 'function' ? (_('noDataToExport') || 'No data to export!') : 'No data to export!';
    if (typeof showToast === 'function') showToast(msg, 3000); else alert(msg);
    return;
  }

  const liveBoards = (boards || []).filter(b => Number(b.status) !== 1);
  const boardKey = b => String(b.gdid || b.id || '');
  const notesByBoard = new Map();
  visibleNotes.forEach(n => {
    const key = String(n.boardid || '');
    if (!notesByBoard.has(key)) notesByBoard.set(key, []);
    notesByBoard.get(key).push(n);
  });

  const byDateAsc = (a, b) => (Number(a.date) || 0) - (Number(b.date) || 0);
  const noBoardLabel = typeof _ === 'function' ? (_('exportMdNoBoard') || 'No board') : 'No board';

  const orderedBoards = liveBoards
    .map(b => ({ board: b, notes: (notesByBoard.get(boardKey(b)) || []).slice().sort(byDateAsc) }))
    .filter(entry => entry.notes.length > 0);
  const knownBoardKeys = new Set(orderedBoards.map(entry => boardKey(entry.board)));
  let orphanNotes = [];
  notesByBoard.forEach((list, key) => {
    if (!knownBoardKeys.has(key)) orphanNotes = orphanNotes.concat(list);
  });
  orphanNotes.sort(byDateAsc);
  if (orphanNotes.length) {
    orderedBoards.push({ board: { title: noBoardLabel }, notes: orphanNotes });
  }

  const lines = [];
  const header = typeof _ === 'function' ? (_('exportMdTitle') || 'SeeNotes') : 'SeeNotes';
  const exportedLabel = typeof _ === 'function' ? (_('exportMdExported') || 'Exported') : 'Exported';
  const notesLabel = typeof _ === 'function' ? (_('exportMdNotesWord') || 'notes') : 'notes';
  const boardsLabel = typeof _ === 'function' ? (_('exportMdBoardsWord') || 'boards') : 'boards';
  const noteWord = visibleNotes.length === 1 && typeof _ === 'function'
    ? (_('exportMdNoteOne') || notesLabel) : notesLabel;
  const boardWord = orderedBoards.length === 1 && typeof _ === 'function'
    ? (_('exportMdBoardOne') || boardsLabel) : boardsLabel;
  lines.push(`# ${header}`);
  lines.push('');
  lines.push(`${exportedLabel}: ${notesMdStamp(Date.now(), true)} · ${visibleNotes.length} ${noteWord} · ${orderedBoards.length} ${boardWord}`);
  lines.push('');

  orderedBoards.forEach(({ board, notes: boardNotes }) => {
    const boardTitle = String(board.title || '').trim() || noBoardLabel;
    lines.push(`## ${boardTitle.replace(/^#+\s*/, '')}`);
    lines.push('');
    boardNotes.forEach(note => {
      const stamp = notesMdStamp(note.date, true);
      const { title, body } = notesMdSplit(note.notetxt);
      lines.push(`### ${stamp}${title ? ' — ' + title : ''}`);
      lines.push('');
      if (body) {
        lines.push(body);
        lines.push('');
      }
      lines.push('---');
      lines.push('');
    });
  });

  const content = lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
  downloadAsFile(NOTES_MD_FILENAME, content);

  const doneMsg = typeof _ === 'function'
    ? (_('exportMdDone') || 'Saved cx-notes.md with {count} notes').replace('{count}', visibleNotes.length)
    : `Saved cx-notes.md with ${visibleNotes.length} notes`;
  if (typeof showToast === 'function') showToast(doneMsg, 4000);
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
        try {
          const writable = await fileHandle.createWritable();
          try {
            await writable.write(new Blob([content], { type: 'application/octet-stream' }));
          } finally {
            await writable.close();
          }
        } catch (writeErr) {
          console.warn(`createWritable failed for ${filename}, falling back to download:`, writeErr.message);
          downloadAsFile(filename, content, 'application/octet-stream');
        }
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

  // Fallback: Multiple separate downloads (octet-stream prevents Android adding .json)
  downloadAsFile("boards.bcp", JSON.stringify(boards), "application/octet-stream");
  downloadAsFile("notes.bcp", JSON.stringify(notes), "application/octet-stream");
  downloadAsFile("medias.bcp", JSON.stringify(media), "application/octet-stream");
}

/**
 * Експортира данните от паметта като индивидуални файлове в избрана локална папка.
 * Бордовете, бележките и медия метаданните се записват файл по файл.
 */
async function exportToIndividualFiles() {
  const inMemBoards = (typeof boardsData !== 'undefined' && boardsData.length > 0);
  const inMemNotes = (typeof allNotesData !== 'undefined' && allNotesData.length > 0);

  if (!inMemBoards && !inMemNotes) {
    const msg = "No data in memory to export!";
    if (typeof showToast === 'function') showToast(msg, 3000); else alert(msg);
    return;
  }

  if (!window.showDirectoryPicker) {
    const msg = "FileSystem API not supported in this browser.";
    if (typeof showToast === 'function') showToast(msg, 5000); else alert(msg);
    return;
  }

  try {
    const rootHandle = await window.showDirectoryPicker({
      mode: 'readwrite',
      id: 'individual_export'
    });

    /**
     * Помощна функция за генериране на уникално име по схемата "име (брояч).txt"
     */
    const getUniqueName = async (baseName, handle) => {
      let filename = `${baseName}.txt`;
      let exists = false;
      try {
        await handle.getFileHandle(filename, { create: false });
        exists = true;
      } catch (e) { exists = false; }

      if (exists) {
        let counter = 1;
        while (true) {
          filename = `${baseName} (${counter}).txt`;
          try {
            await handle.getFileHandle(filename, { create: false });
            counter++;
          } catch (e) { break; }
        }
      }
      return filename;
    };

    const saveToFile = async (filename, content, folderHandle) => {
      const fileHandle = await folderHandle.getFileHandle(filename, { create: true });
      try {
        const writable = await fileHandle.createWritable();
        try {
          await writable.write(new Blob([content], { type: 'text/plain' }));
        } finally {
          await writable.close();
        }
      } catch (writeErr) {
        console.warn(`createWritable failed for ${filename}, falling back to download:`, writeErr.message);
        downloadAsFile(filename, content, 'text/plain');
      }
    };

    // 1. Експорт на бордове
    for (const board of boardsData) {
      const fileName = await getUniqueName('board', rootHandle);
      await saveToFile(fileName, JSON.stringify(board), rootHandle);
    }

    // 2. Експорт на бележки
    for (const note of allNotesData) {
      const fileName = await getUniqueName('note', rootHandle);
      await saveToFile(fileName, JSON.stringify(note), rootHandle);
    }

    // 3. Експорт на медия (метаданни)
    // Всички метаданни media.txt отиват в основната папка
    const media = (typeof mediaData !== 'undefined') ? mediaData : [];
    if (media.length > 0) {
      for (const m of media) {
        const fileName = await getUniqueName('media', rootHandle);
        await saveToFile(fileName, JSON.stringify(m), rootHandle);
      }
    }

    if (typeof showToast === 'function') {
      showToast(_('archiveSavedSuccess') || "Files saved successfully!", 3000);
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error("Individual export failed:", err);
    if (typeof showToast === 'function') showToast("Error: " + err.message, 5000);
  }
}

