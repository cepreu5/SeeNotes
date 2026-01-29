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
  const boards = await exportData('NotesDB', 'boards');
  // console.log(boards);
  const notes = await exportData('NotesDB', 'notes');
  // console.log(notes);

  if (!notes || notes.length === 0) {
    if (typeof showToast === 'function') {
      showToast("No notes found to export!", 3000);
    } else {
      alert("No notes found to export!");
    }
    return;
  }

  const media = await exportData('NotesDB', 'media');

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
    // console.log(originalBoardId);

    // Find notes belonging to this board
    const relatedNotes = notes.filter(n => n.boardid === originalBoardId);
    // console.log(relatedNotes);
    for (const note of relatedNotes) {
      note.boardid = String(board.id);
    }

    // board.gdid = "";
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
  a3.download = "mediaя.bcp";
  a3.click();
  URL.revokeObjectURL(url3);
}