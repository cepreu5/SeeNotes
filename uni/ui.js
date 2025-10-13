// ================================================================================
// V. СЪЗДАВАНЕ И УПРАВЛЕНИЕ НА UI ЕЛЕМЕНТИ
// ================================================================================

    function _(key) {
        return translations[currentLang][key] || key;
    }

    /**
     * Initializes the loading process by resetting state and showing the loader.
     */
    function initializeLoad() {
        boardsData = [];
        allNotesData = [];
        notesContainer.innerHTML = '';
        loaderContainer.style.display = 'block';
        currentBoardFilter = localStorage.getItem('startBoard') || 'all';
        currentBoardFilter = 'all';
        const popup = document.getElementById('board-filter-popup');
        if (popup) {
            popup.classList.remove('visible');
        }
        document.querySelectorAll('.board-filter-link').forEach(link => {
            link.classList.remove('selected-board');
        });
        // Fix: Remove the old boards note from the header to prevent duplication on reload
        const oldBoardsNote = document.querySelector('header .boards-note');
        if (oldBoardsNote) {
            oldBoardsNote.remove();
        }
    }

    async function listFiles(folderIdFromPrompt) {
        const useLocalDb = localStorage.getItem('useLocalDb') === 'true';
        const updateFromGoogleDrive = localStorage.getItem('updateFromGoogleDrive') !== 'false';
        let tokenData = null;

        // Decide if we need a token BEFORE anything else.
        const needsToken = !useLocalDb || (useLocalDb && updateFromGoogleDrive);

        if (needsToken) {
            tokenData = checkAuth();
            if (!tokenData) {
                // checkAuth() redirects to login, so we just stop here.
                return;
            }
        }

        initializeLoad();
        const loaderTitle = document.getElementById('loader-title');
        try {
            if (useLocalDb) {
                if (updateFromGoogleDrive) {
                    if (loaderTitle) loaderTitle.textContent = "Google Drive Sync";
                    await runGoogleDriveSync();
                    loaderText.textContent = "Fetching updated data from DB...";
                    await fetchAllDataLocal();
                    const boardParseError = false; // Assume no parse error after sync
                    await renderUI({ boardParseError });

            } else { // GDrive sync is disabled OR local folder is missing
                    // GDrive sync is disabled. Load locally.
                    if (loaderTitle) loaderTitle.textContent = "Локална база";
                    console.log("Loading from local DB (Google Drive sync is disabled).");
                    loaderText.textContent = "Starting local sync...";
                    await runLocalSync();
                    // Only show the "Fetching data" message if a sync was actually performed.
                    // runLocalSync will handle its own toast messages.
                    loaderText.textContent = "Fetching data from DB..."; 

                    await fetchAllDataLocal();
                    await renderUI({ boardParseError: false });
                }
            } else { // Not using local DB
                if (loaderTitle) loaderTitle.textContent = "Google Drive";
                // Ensure folderIds are populated BEFORE fetching any data.
                const folderId = await getFolderID();
                if (!folderId) {
                    throw new Error("Could not get main folder ID from Google Drive.");
                }
                // Fetch all data for the session without saving to DB
                const { boardParseError } = await fetchAllData(folderIdFromPrompt, false);
                await renderUI({ boardParseError });
            }
        } catch (err) {
            console.error("Error in listFiles:", err);
            if (err.result && err.result.error && err.result.error.code === 401) {
                showToast(_('errorSessionExpired'));
                handleSignoutClick();
            } else {
                let errorMessage = _('errorProcessingFiles');
                if (err.result && err.result.error) {
                    errorMessage += ` (Status: ${err.result.error.code} - ${err.result.error.message})`;
                }
                showToast(errorMessage);
            }
        } finally {
            loaderContainer.style.display = 'none';
            document.body.style.backgroundImage = `url('Board.png')`;
            notesContainer.style.backgroundImage = `url('Board.png')`;
            currentBackground = 'Board.png';
        }
    }

    function showModal(options) {
        let rawContent, formatString, displayContent, noteColor;
        if (typeof options === 'string') {
            rawContent = options;
        options = {}; // Ensure options is an object
            formatString = null;
            noteColor = null; // Default color for simple string content
        } else {
            rawContent = options.raw;
            formatString = options.format;
            noteColor = options.color;
        }
        // --- Board Name Display in Modal ---
        const modalBoardNameEl = document.getElementById('modal-board-name');
        if (options && options.boardId) {
            const board = boardsData.find(b => b.gdid === options.boardId);
            if (board) {
                modalBoardNameEl.textContent = board.title;
                modalBoardNameEl.style.display = 'block';
            } else {
                modalBoardNameEl.style.display = 'none';
            }
        } else {
            modalBoardNameEl.style.display = 'none';
        }
        currentModalContent = rawContent;
        // For notes with a preview (pass: true), the '|' is a separator.
        // For the full view in the modal, we want to show the entire content,
        // just replacing the separator with a newline for better readability.
        if (rawContent.includes('|')) {
            rawContent = rawContent.replace('|', '\n');
        }
        if (formatString && formatString.trim() !== '') {
            displayContent = formatText(rawContent, formatString);
        } else {
            displayContent = renderNoteContent(rawContent);
        }
        modalBody.innerHTML = displayContent;
        // Set modal background color
        const modalContentBox = contentModal.querySelector('.modal-content-box');
        if (noteColor) {
            modalContentBox.style.backgroundColor = noteColor;
        } else {
            modalContentBox.style.backgroundColor = '#eef603'; // Reset to default color
        }
        contentModal.classList.add('visible');
        copyBtn.innerHTML = copyIconSvg;
    }

    
    function showAllBoardsModal(anchorElement) {
        const modalContent = document.createElement('div');
        // Use CSS class for styling
        modalContent.className = 'all-boards-modal-container';
        const createLink = (text, boardId, classes = []) => {
            const link = document.createElement('span'); // Use SPAN to match header buttons
            link.textContent = text;
            // link.href = '#'; // Not needed for span
            // Apply the same width as the header buttons
            link.style.width = `${maxWidthForButtons}px`;
            link.classList.add('board-filter-link', ...classes);
            link.addEventListener('click', (e) => {
                e.preventDefault();
                document.getElementById('content-modal').classList.remove('visible');
                filterNotesByBoard(boardId);
            });
            return link;
        };
        modalContent.appendChild(createLink(_('allBoards'), 'all', ['all-boards-filter-btn']));
        modalContent.appendChild(createLink(_('calendar'), 'calendar', ['calendar-filter-btn']));
        modalContent.appendChild(createLink(_('reminder'), 'reminder', ['reminder-filter-btn']));
        boardsData.forEach(board => {
            if (board.title && board.gdid) {
                const link = createLink(board.title, board.gdid);
                // Apply custom colors from board definition (same as in header)
                if (board.color !== undefined && !isNaN(board.color) && board.color >= 0 && board.color <= 6) {
                    link.style.backgroundColor = `var(--board-bg-${board.color})`;
                }
                // Set text color to black by default, as per header logic
                link.style.color = 'black';
                // Override for status
                if (board.status === 1) link.style.color = 'red';
                modalContent.appendChild(link);
            }
        });

        modalBody.innerHTML = '';
        modalBody.appendChild(modalContent);
        const modalBox = contentModal.querySelector('.modal-content-box');
        if (anchorElement) {
            const rect = anchorElement.getBoundingClientRect();
            contentModal.classList.add('popup-mode');
            modalBox.style.top = `${rect.bottom + 5}px`; // Position below the button
            modalBox.style.transform = 'none'; // Override centering transform
            modalBox.style.width = 'auto';
            
            // Special handling for the right arrow to align its right edge
            if (anchorElement.classList.contains('right-arrow')) {
                modalBox.style.right = `${window.innerWidth - rect.right}px`;
                modalBox.style.left = 'auto';
            } else {
                // Default behavior: align left, but check for overflow
                const modalRect = modalBox.getBoundingClientRect();
                const windowWidth = window.innerWidth;
                modalBox.style.left = `${rect.left}px`; // Align with the anchor element
                modalBox.style.right = 'auto'; // Unset right alignment
                if (rect.left + modalRect.width > windowWidth - 10) {
                    modalBox.style.left = 'auto';
                    modalBox.style.right = '10px';
                }
            }
        } else {
            contentModal.classList.remove('popup-mode'); // Revert to default centered modal
        }
        // Hide the copy button as it's not relevant for this view
        copyBtn.style.display = 'none';
        // Ensure the close button is visible
        contentModal.querySelector('.modal-close').style.display = 'flex';
        contentModal.classList.add('visible');
    }

    function formatDate(dateString) {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}.${month}.${year}`;
        } catch (e) { return dateString; }
    }

    function formatDateTime(timestamp) {
        if (!timestamp) return '';
        try {
            const date = new Date(timestamp);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${day}.${month}.${year} ${hours}:${minutes}`;
        } catch (e) {
            return timestamp; // Fallback
        }
    }

    function formatTime(timestamp) {
        if (!timestamp) return '';
        try {
            const date = new Date(timestamp);
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        } catch (e) {
            return ''; // Fallback
        }
    }

    // Add an event listener to the modal's close button to reset button visibility
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            copyBtn.style.display = 'flex'; // Restore copy button visibility when any modal is closed
            contentModal.classList.remove('popup-mode'); // Reset popup mode on close
            const modalBox = contentModal.querySelector('.modal-content-box');
            modalBox.style.top = '';
            modalBox.style.left = '';
            modalBox.style.transform = '';
        });
    });

    function filterNotesByBoard(boardId) {
        const searchInput = document.getElementById('search-box'); // The search input field

        if (boardId === 'calendar') {
            renderCalendarView();
            return;
        }
        searchInput.value = ''; // Clear the search box
        saveSearchBtn.style.display = 'none'; // Hide the save icon
        currentBoardFilter = boardId;
        applyFilters();
        document.querySelectorAll('.board-filter-link').forEach(link => {
            link.classList.remove('selected-board');
            if (link.dataset.boardid === boardId) {
                link.classList.add('selected-board');
            }
        });
        // Update search box placeholder based on the selected board
        if (boardId === 'reminder') {
            searchInput.placeholder = `[${_('reminder')}]: ${_('searchPlaceholder')}`;
        } else if (boardId !== 'all' && boardId !== 'calendar') {
            const board = boardsData.find(b => b.gdid === boardId);
            if (board) {
                searchInput.placeholder = `[${board.title}]: ${_('searchPlaceholder')}`;
            }
        } else {
            // Reset to default placeholder for 'all', considering the current search mode
            if (searchMode === 'title') {
                searchInput.placeholder = `${_('searchPlaceholder')} ${_('searchInTitles')}...`;
            } else {
                searchInput.placeholder = `${_('searchPlaceholder')} ${_('searchInContent')}...`;
            }
        }
        if (boardId === 'all') {
            // For the 'all' view, clear the inline style to let the default CSS background apply.
            // This prevents flickering on initial load.
            if (currentBackground !== 'Board.png') {
                document.body.style.backgroundImage = '';
                notesContainer.style.backgroundImage = '';
            }
            currentBackground = 'Board.png';
        } else {
            // For a specific board, set the background via inline style.
            let newBackground = 'Board.png'; // Default
            const board = boardsData.find(b => b.gdid === boardId);
            if (board && board.backnum) {
                switch (board.backnum) {
                    case 1: newBackground = 'Board1.png'; break;
                    case 2: newBackground = 'Board2.png'; break;
                    case 3: newBackground = 'Board3.png'; break;
                }
            }
            document.body.style.backgroundImage = `url('${newBackground}')`;
            notesContainer.style.backgroundImage = `url('${newBackground}')`;
            currentBackground = newBackground;
        }

        if (boardId === 'all') {
            scrollTopBtn.innerHTML = arrowSvg;
        }  else if (boardId === 'reminder') {
            scrollTopBtn.innerHTML = _('reminder') + " " + arrowSvg;
        } else {
            const board = boardsData.find(b => b.gdid === boardId);
            if (board) {
                scrollTopBtn.innerHTML = board.title + " " + arrowSvg;
            }
        }
        window.dispatchEvent(new Event('scroll'));
        // Add or remove a class from the container to control child visibility
        // This part is no longer needed as calendar has its own view
        notesContainer.classList.remove('calendar-view');
    }
    function applySearchFilter() {
        applyFilters();
    }

    function applyFilters() {
        const searchTerm = searchBox.value.toLowerCase();
        const notes = notesContainer.getElementsByClassName('note');
        let visibleCount = 0;
        for (const note of notes) {
            // Keep the boards note visible regardless of the filter
            if (note.classList.contains('boards-note')) {
                continue;
            }
            let isVisibleByBoard = false;
            const extraInfo = note.dataset.extraInfo;
            if (currentBoardFilter === 'all') {
                isVisibleByBoard = true;
            }  else if (currentBoardFilter === 'reminder') {
                if (extraInfo) {
                    try {
                        const data = JSON.parse(extraInfo);
                        if (data.timer && data.timer !== 0) {
                            isVisibleByBoard = true;
                        }
                    } catch (e) {
                        console.error('Error parsing extraInfo for note:', e);
                    }
                }
            } else if (extraInfo) {
                try {
                    const data = JSON.parse(extraInfo);
                    if (data.boardid === currentBoardFilter) {
                        isVisibleByBoard = true;
                    }
                } catch (e) {
                    console.error('Error parsing extraInfo for note:', e);
                }
            }
            let isVisibleBySearch = false;
            if (searchMode === 'title') {
                const titleEl = note.querySelector('h3');
                if (titleEl) {
                    const title = titleEl.textContent.toLowerCase();
                    isVisibleBySearch = title.includes(searchTerm);
                }
            } else { // searchMode === 'content'
                const contentEl = note.querySelector('.note-content');
                if (contentEl) {
                    isVisibleBySearch = contentEl.textContent.toLowerCase().includes(searchTerm);
                }
            }
            if (isVisibleByBoard && isVisibleBySearch) {
                note.style.display = 'flex';
                visibleCount++;
            } else {
                note.style.display = 'none';
            }
        }
        const noteCounter = document.getElementById('note-counter');
        if (noteCounter) {
            noteCounter.textContent = visibleCount;
        }
    }

    async function createBoardsUI(boardsData, boardParseError) {
        const boardsNote = document.createElement('div');
        boardsNote.className = 'boards-note';
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'note-content';
        contentWrapper.style.minHeight = '0';
        const contentEl = document.createElement('div');
        contentEl.className = 'board-menu-container';

        // --- Get Element References ---
        const scaleSlider = document.getElementById('scaleSlider');
        const scaleInput = document.getElementById('scaleInput');
        const applyZoomBtn = document.getElementById('applyZoomBtn');
        const startBoardSelect = document.getElementById('start-board-select');
        const maxSearchesInput = document.getElementById('max-searches-input');
        const noteFontSizeInput = document.getElementById('note-font-size-input');
        const modalFontSizeInput = document.getElementById('modal-font-size-input');
        const showDatemodCheckbox = document.getElementById('show-datemod-checkbox');
        const useLocalDbCheckbox = document.getElementById('use-local-db-checkbox');
        const updateDbOptionsWrapper = document.getElementById('update-db-options-wrapper');
        const updateIndexedDbCheckbox = document.getElementById('update-indexed-db-checkbox');
        const updateFromGoogleDriveCheckbox = document.getElementById('update-from-gdrive-checkbox');
        const selectFolderBtn = document.getElementById('select-folder-btn');
        const localSyncFolderName = document.getElementById('local-sync-folder-name');
        const settingsCloseBtn = document.getElementById('settings-close-btn');

        // --- Logic for Settings Modal ---

        // 1. Zoom Controls
        const updateZoom = (value) => {
            value = Math.max(25, Math.min(175, parseInt(value, 10)));
            if (isNaN(value)) value = 100;
            notesContainer.style.zoom = value / 100;
            scaleSlider.value = value;
            scaleInput.value = value;
        };

        let savedZoom = localStorage.getItem('zoomLevel');
        if (savedZoom) {
            updateZoom(savedZoom);
        } else {
            updateZoom(scaleSlider.value);
        }

        scaleSlider.addEventListener('input', () => {
            const zoomValue = scaleSlider.value;
            updateZoom(zoomValue);
            localStorage.setItem('zoomLevel', zoomValue);
        });

        scaleInput.addEventListener('change', () => {
            const zoomValue = scaleInput.value;
            updateZoom(zoomValue);
            localStorage.setItem('zoomLevel', zoomValue);
        });
        
        applyZoomBtn.addEventListener('click', () => {
            const zoomValue = scaleInput.value;
            updateZoom(zoomValue);
            localStorage.setItem('zoomLevel', zoomValue);
            showToast(_('settingSaved'), 2000);
        });

        scaleSlider.addEventListener('click', (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
                let currentValue = parseInt(scaleSlider.value, 10);
                let newValue;
                if (currentValue % 10 === 0) {
                    newValue = currentValue + 10;
                } else {
                    newValue = Math.round(currentValue / 10) * 10;
                }
                const max = parseInt(scaleSlider.max, 10);
                const min = parseInt(scaleSlider.min, 10);
                if (newValue > max) newValue = max;
                if (newValue < min) newValue = min;
                scaleSlider.value = newValue;
                updateZoom(newValue);
                localStorage.setItem('zoomLevel', newValue);
            }
        });

        // 2. Start Board Select
        boardsData.forEach(board => {
            if (board.gdid && board.title) {
                const option = new Option(board.title, board.gdid);
                startBoardSelect.appendChild(option);
            }
        });
        startBoardSelect.value = localStorage.getItem('startBoard') || 'all';
        startBoardSelect.addEventListener('change', () => {
            localStorage.setItem('startBoard', startBoardSelect.value);
            showToast(_('settingSaved'), 2000);
        });

        // 3. Max Saved Searches
        maxSearchesInput.value = maxSavedSearches;
        maxSearchesInput.addEventListener('change', () => {
            let newValue = parseInt(maxSearchesInput.value, 10);
            if (isNaN(newValue) || newValue < 0) newValue = 0;
            if (newValue > 20) newValue = 20;
            maxSavedSearches = newValue;
            localStorage.setItem('maxSavedSearches', newValue);
            if (savedSearches.length > maxSavedSearches) {
                savedSearches.length = maxSavedSearches;
                localStorage.setItem('savedSearches', JSON.stringify(savedSearches));
            }
            showToast(_('settingSaved'), 2000);
        });

        // 4. Font Size Inputs
        const setupFontSizeInput = (selectElement, storageKey, defaultValue, targetUpdate) => {
            const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
            fontSizes.forEach(size => {
                const option = document.createElement('option');
                option.value = size;
                option.textContent = `${size}px`;
                selectElement.appendChild(option);
            });
            selectElement.value = localStorage.getItem(storageKey) || defaultValue;
            // Apply initial value
            targetUpdate(selectElement.value);
            selectElement.addEventListener('change', () => {
                const value = selectElement.value;
                localStorage.setItem(storageKey, value);
                targetUpdate(value);
                showToast(_('settingSaved'), 2000);
            });
        };
        setupFontSizeInput(noteFontSizeInput, 'noteFontSize', 18, (val) => document.documentElement.style.setProperty('--note-font-size', `${val}px`));
        setupFontSizeInput(modalFontSizeInput, 'modalFontSize', 18, (val) => modalBody.style.fontSize = `${val}px`);

        // 5. Show Datemod Checkbox
        showDatemodCheckbox.checked = localStorage.getItem('showDatemod') !== 'false';
        showDatemodCheckbox.addEventListener('change', () => {
            const isChecked = showDatemodCheckbox.checked;
            localStorage.setItem('showDatemod', isChecked);
            document.body.classList.toggle('hide-datemod', !isChecked);
            showToast(_('settingSaved'), 2000);
        });

        // 6. Local DB & Update Options
        useLocalDbCheckbox.checked = localStorage.getItem('useLocalDb') === 'true';
        useLocalDbCheckbox.addEventListener('change', () => {
            localStorage.setItem('useLocalDb', useLocalDbCheckbox.checked);
            toggleUpdateOptionsVisibility();
            showToast(_('settingSaved'), 2000);
        });

        updateIndexedDbCheckbox.checked = localStorage.getItem('updateIndexedDb') !== 'false';
        updateIndexedDbCheckbox.addEventListener('change', () => {
            localStorage.setItem('updateIndexedDb', updateIndexedDbCheckbox.checked);
            showToast(_('settingSaved'), 2000);
        });

        updateFromGoogleDriveCheckbox.checked = localStorage.getItem('updateFromGoogleDrive') !== 'false';
        updateFromGoogleDriveCheckbox.addEventListener('change', () => {
            localStorage.setItem('updateFromGoogleDrive', updateFromGoogleDriveCheckbox.checked);
            showToast(_('settingSaved'), 2000);
        });

        const toggleUpdateOptionsVisibility = () => {
            const isVisible = useLocalDbCheckbox.checked;
            updateDbOptionsWrapper.style.display = isVisible ? 'block' : 'none';
        };
        toggleUpdateOptionsVisibility();

        // 7. Local Sync Folder
        selectFolderBtn.addEventListener('click', async () => {
            const handle = await getDirectoryHandle(true); // Prompt user to select
            if (handle) {
                localSyncFolderName.textContent = handle.name;
                localSyncFolderName.title = handle.name;
                showToast(_('folderSelectedForSync').replace('{folderName}', handle.name), 10000);
                await runLocalSync();
            }
        });

        (async () => {
            const handle = await getDirectoryHandle(); // This won't prompt the user
            if (handle) {
                localSyncFolderName.textContent = handle.name;
                localSyncFolderName.title = handle.name;
            } else {
                localSyncFolderName.textContent = _('folderNotSelected');
            }
        })();

        // 8. Close Button
        settingsCloseBtn.addEventListener('click', () => {
            document.getElementById('settings-modal').classList.remove('visible');
        });


        // --- Original logic for boards menu (unchanged) ---
        if (boardParseError) {
            const errorEl = document.createElement('div');
            errorEl.style.color = 'red';
            errorEl.style.marginTop = '10px';
            errorEl.textContent = _('warningInvalidBoard');
            contentEl.appendChild(errorEl);
        }
        contentWrapper.appendChild(contentEl);
        boardsNote.appendChild(contentWrapper);
        const allButtonLinks = [];
        const allBoardsLink = document.createElement('span');
        allBoardsLink.classList.add('board-filter-link', 'all-boards-filter-btn');
        allBoardsLink.dataset.boardid = 'all';
        allBoardsLink.title = _('allBoardsCtrlClickTooltip');
        const allBoardsText = document.createElement('span');
        allBoardsText.textContent = _('allBoards');
        const allBoardsIcon = document.createElement('span');
        allBoardsIcon.classList.add('board-icon-in-button');
        allBoardsLink.appendChild(allBoardsText);

        const addAllBoardsModalEvents = (element, singleClickCallback) => {
            let longPressTimer;
            let isLongPress = false;
            const startPress = (e) => {
                isLongPress = false;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    showAllBoardsModal(element);
                }, 500);
                if (e.type === 'touchstart') {
                    e.preventDefault();
                }
            };
            const endPress = (e) => {
                clearTimeout(longPressTimer);
                if (e.type === 'touchend' && !isLongPress) {
                    if (singleClickCallback) singleClickCallback();
                }
            };
            element.addEventListener('mousedown', startPress);
            element.addEventListener('mouseup', endPress);
            element.addEventListener('mouseleave', endPress);
            element.addEventListener('touchstart', startPress);
            element.addEventListener('touchend', endPress);
            element.addEventListener('click', (e) => {
                if (isLongPress) return;
                if (e.ctrlKey) showAllBoardsModal(element);
                else if (singleClickCallback) singleClickCallback();
            });
        };
        addAllBoardsModalEvents(allBoardsLink, () => filterNotesByBoard('all'));
        allButtonLinks.push(allBoardsLink);

        const calendarLink = document.createElement('span');
        calendarLink.textContent = _('calendar');
        calendarLink.classList.add('board-filter-link', 'calendar-filter-btn');
        calendarLink.dataset.boardid = 'calendar';
        calendarLink.addEventListener('click', (e) => { e.preventDefault(); filterNotesByBoard('calendar'); });
        allButtonLinks.push(calendarLink);
        const reminderLink = document.createElement('span');
        reminderLink.textContent = _('reminder');
        reminderLink.classList.add('board-filter-link', 'reminder-filter-btn');
        reminderLink.dataset.boardid = 'reminder';
        reminderLink.addEventListener('click', (e) => { e.preventDefault(); filterNotesByBoard('reminder'); });
        allButtonLinks.push(reminderLink);
        boardsData.forEach(board => {
            if (!board.title || !board.gdid) return;
            const link = document.createElement('span');
            link.textContent = board.title;
            link.classList.add('board-filter-link');
            link.dataset.boardid = board.gdid;
            if (board.color !== undefined && !isNaN(board.color) && board.color >= 0 && board.color <= 6) {
                link.style.backgroundColor = `var(--board-bg-${board.color})`;
            }
            link.style.color = 'black';
            if (board.status === 1) link.style.color = 'red';
            link.addEventListener('click', (e) => {
                e.preventDefault();
                if (e.ctrlKey) { showModal(JSON.stringify(board, null, 2)); }
                else { e.preventDefault(); filterNotesByBoard(board.gdid); }
            });
            allButtonLinks.push(link);
        });
        maxWidthForButtons = 0;
        const tempContainer = document.createElement('div');
        tempContainer.style.position = 'absolute';
        tempContainer.style.visibility = 'hidden';
        document.body.appendChild(tempContainer);
        allButtonLinks.forEach(link => {
            tempContainer.appendChild(link);
            maxWidthForButtons = Math.max(maxWidthForButtons, link.scrollWidth);
        });
        document.body.removeChild(tempContainer);
        maxWidthForButtons += 10;
        allButtonLinks.forEach(link => {
            link.style.width = `${maxWidthForButtons}px`;
            contentEl.appendChild(link);
        });
        const scrollWrapper = document.createElement('div');
        scrollWrapper.className = 'scrolling-menu-wrapper';
        const leftArrow = document.createElement('button');
        leftArrow.className = 'scroll-arrow left-arrow';
        leftArrow.innerHTML = boardIconSvg;
        addAllBoardsModalEvents(leftArrow, () => { showAllBoardsModal(leftArrow); });

        scrollWrapper.appendChild(leftArrow);
        scrollWrapper.appendChild(contentEl);
        contentWrapper.appendChild(scrollWrapper);

        const checkScroll = () => {
            leftArrow.classList.toggle('visible', true);
        };
        contentEl.addEventListener('scroll', checkScroll);
        new ResizeObserver(checkScroll).observe(contentEl);

        return boardsNote;
    }

    function renderCalendarView() {
        document.querySelector('header').style.display = 'none';
        notesContainer.style.display = 'none';
        scrollTopBtn.style.display = 'none';
        let calendarContainer = document.getElementById('calendar-container');
        if (!calendarContainer) {
            calendarContainer = document.createElement('div');
            calendarContainer.id = 'calendar-container';
            document.querySelector('main').appendChild(calendarContainer);
        }
        calendarContainer.style.display = 'block';
        calendarContainer.innerHTML = ''; // Clear previous content
        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();
        const monthName = currentCalendarDate.toLocaleString(currentLang, { month: 'long', year: 'numeric' });

        // Header
        const calendarHeader = document.createElement('div');
        calendarHeader.className = 'calendar-header';
        calendarHeader.innerHTML = `
            <button class="close-calendar-btn">&times;</button>
            <button id="prev-month-btn">&laquo;</button>
            <h2>${monthName}</h2>
            <button id="next-month-btn">&raquo;</button>
            <button class="close-calendar-btn">&times;</button>
        `;
        calendarContainer.appendChild(calendarHeader);
        // Day names header
        const daysHeader = document.createElement('div');
        daysHeader.className = 'calendar-days-header';
        const days = currentLang === 'bg' ? ['Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота', 'Неделя'] : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        days.forEach((day, index) => {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day-name';
            const longName = document.createElement('span');
            longName.className = 'day-name-long';
            longName.textContent = day;
            const shortName = document.createElement('span');
            shortName.className = 'day-name-short';
            shortName.textContent = day.substring(0, 3);

            dayEl.appendChild(longName);
            dayEl.appendChild(shortName);

            if (index >= 5) {
                dayEl.classList.add('weekend-day');
            }
            daysHeader.appendChild(dayEl);
        });
        calendarContainer.appendChild(daysHeader);
        // Get today's date components for comparison
        const today = new Date();
        const todayDate = today.getDate();
        const todayMonth = today.getMonth();
        const todayYear = today.getFullYear();
        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let startingDay = firstDayOfMonth.getDay(); // 0=Sun, 1=Mon...
        if (startingDay === 0) startingDay = 7; // Make Sunday 7
        // Grid for the actual days
        const calendarGrid = document.createElement('div');
        calendarGrid.className = 'calendar-grid';
        // Create blank cells for days before the 1st
        for (let i = 1; i < startingDay; i++) {
            const blankCell = document.createElement('div');
            blankCell.className = 'calendar-cell-blank';
            calendarGrid.appendChild(blankCell);
        }
        // Create cells for each day of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-cell';
            const dateNum = document.createElement('div');
            dateNum.className = 'calendar-date-number';
            dateNum.textContent = day;
            // Check if the cell being rendered is today's date
            if (day === todayDate && month === todayMonth && year === todayYear) {
                dateNum.classList.add('today-date');
            }
            cell.appendChild(dateNum);
            const notesForDayContainer = document.createElement('div');
            notesForDayContainer.className = 'calendar-notes-container';
            // Find and render notes for this day
            const dayDate = new Date(year, month, day);
            allNotesData.forEach(noteData => {
                if (noteData.content.calendarDate) {
                    const noteDate = new Date(noteData.content.calendarDate);
                    if (noteDate.getFullYear() === dayDate.getFullYear() &&
                        noteDate.getMonth() === dayDate.getMonth() &&
                        noteDate.getDate() === dayDate.getDate()) {
                        const miniNote = document.createElement('div');
                        miniNote.className = 'calendar-mini-note';

                        const noteContent = noteData.content.notetxt;
                        const isHidden = noteData.content.pass === true;
                        const isType1 = noteData.content.type === 1;

                        if ((isHidden || isType1) && noteContent.includes('|')) {
                            contentToShow = noteContent.split('|')[0].trim();
                        } else {
                            const lines = noteContent.split('\n');
                            let firstNonEmptyLineIndex = -1;
                            for (let i = 0; i < lines.length; i++) {
                                if (lines[i].trim() !== '') {
                                    firstNonEmptyLineIndex = i;
                                    break;
                                }
                            }
                            contentToShow = firstNonEmptyLineIndex !== -1 ? lines.slice(firstNonEmptyLineIndex).join('\n') : '...';
                        }
                        miniNote.textContent = contentToShow;
                        if (noteData.content.color) {
                             miniNote.style.backgroundColor = `var(--note-bg-${noteData.content.color})`;
                        }
                        miniNote.addEventListener('click', (e) => {
                            e.stopPropagation();
                            showModal({ raw: noteData.content.notetxt, format: noteData.content.text_span, color: miniNote.style.backgroundColor });
                        });
                        notesForDayContainer.appendChild(miniNote);
                    }
                }
            });
            cell.appendChild(notesForDayContainer);
            calendarGrid.appendChild(cell);
        }
        calendarContainer.appendChild(calendarGrid);
        // Make mini-notes square by setting their height equal to their calculated width
        // Use setTimeout to ensure the browser has rendered the elements before we measure them.
        setTimeout(() => {
            document.querySelectorAll('.calendar-mini-note').forEach(miniNote => {
                const width = miniNote.getBoundingClientRect().width;
                if (width > 0) miniNote.style.height = `${width}px`;
            });
        }, 0);
        // Event Listeners
        document.getElementById('prev-month-btn').addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            renderCalendarView();
        });

        document.getElementById('next-month-btn').addEventListener('click', () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            renderCalendarView();
        });
        document.querySelectorAll('.close-calendar-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                calendarContainer.style.display = 'none';
                document.querySelector('header').style.display = 'flex';
                notesContainer.style.display = 'flex';
                filterNotesByBoard('all'); // Go back to all notes view
                window.dispatchEvent(new Event('scroll')); // Trigger scroll to show/hide scrollTopBtn
            });
        });
    }
    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    function renderNoteContent(text) {
        if (!text) return '';
        const codeBlocks = [];
        const codeTagRegex = /\ \[code\]([\s\S]*?)\[\/code\]/g;
            const textWithoutCode = text.replace(codeTagRegex, (match, code) => {
            codeBlocks.push(escapeHtml(code));
            return '%%CODE_BLOCK%%';
        });
        // First, escape the entire remaining text to neutralize any HTML
        const escapedText = escapeHtml(textWithoutCode);
        // Then, find URLs in the *escaped* text and wrap them in <a> tags.
        const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%?=~_|])/ig;
        let html = escapedText.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        codeBlocks.forEach(block => {
            html = html.replace('%%CODE_BLOCK%%', '<pre><code>' + block + '</code></pre>');
        });
        return html;
    }

    /**
     * Форматира текстов низ въз основа на JSON параметри.
     * @param {string} text - Текстовият низ за форматиране.
     * @param {string} formatString - Форматиращият низ, разделен с '\n'.
     * @returns {string} Форматираният HTML низ.
     */
    function formatText(text, formatString) {
    if (formatString.endsWith('|')) {
        formatString = formatString.slice(0, -1);
    }
    const formats = formatString.split('|').map(f => {
        try {
        return JSON.parse(f);
        } catch (e) {
        console.error('Invalid JSON in format string:', f);
        return null;
        }
    }).filter(f => f !== null);
    if (formats.length === 0) {
        return renderNoteContent(text);
    }
    const points = new Set([0, text.length]);
    formats.forEach(f => {
        points.add(f.start);
        points.add(f.end);
    });
    const sortedPoints = Array.from(points).sort((a, b) => a - b);
    let html = '';
    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i + 1];
        const segmentText = text.substring(start, end);
        if (segmentText.length === 0) continue;
        const activeFormats = formats.filter(f => f.start <= start && f.end >= end);
        let formattedSegment = renderNoteContent(segmentText);
        activeFormats.sort((a, b) => b.type - a.type);
        activeFormats.forEach(format => {
        const { type, paramint, paramfloat } = format;
        switch (type) {
            case 1: // bold
            formattedSegment = `<strong>${formattedSegment}</strong>`;
            break;
            case 2: // italic
            formattedSegment = `<em>${formattedSegment}</em>`;
            break;
            case 3: // underline
            formattedSegment = `<u>${formattedSegment}</u>`;
            break;
            case 4: // text color
            case 5: // background color
            {
                let aVal = (paramint >> 24) & 0xff;
                // If alpha is 0, but the color is not black, assume it should be opaque.
                if (aVal === 0 && (paramint & 0x00ffffff) !== 0) {
                aVal = 255;
                }
                const r = (paramint >> 16) & 0xff;
                const g = (paramint >> 8) & 0xff;
                const b = paramint & 0xff;
                const a = aVal / 255;
                const rgbaColor = `rgba(${r}, ${g}, ${b}, ${a})`;
                if (type === 4) {
                formattedSegment = `<span style="color: ${rgbaColor};">${formattedSegment}</span>`;
                } else {
                formattedSegment = `<span style="background-color: ${rgbaColor};">${formattedSegment}</span>`;
                }
                break;
            }
            case 6: // font size
            const fontSize = 100 * paramfloat;
            formattedSegment = `<span style="font-size: ${fontSize}%;">${formattedSegment}</span>`;
            break;
            case 7: // strike-through
            formattedSegment = `<s>${formattedSegment}</s>`;
            break;
            default:
            break;
        }
        });
        html += formattedSegment;
    }
    return html;
    }
    async function createNoteElement(noteRawData) {
        const { file, res } = noteRawData;
        const note = document.createElement('div');
        note.className = 'note note-item';
        let fileContent = '';
        let noteGdid = null;
        let noteColor = null;
        let textSpan = null;
        let extraData = {};
        let fullNoteContent = {}; // Variable to hold the complete note object
        try {
            const content = JSON.parse(res.body);
            fullNoteContent = content; // Store the full object
            if (content && typeof content.notetxt !== 'undefined') {
                fileContent = content.notetxt;
                noteGdid = content.gdid;
                noteColor = content.color;
                if (content.text_span) {
                    textSpan = content.text_span;
                }
                extraData = { ...content };
                delete extraData.notetxt;
                if (Object.keys(extraData).length > 0) note.dataset.extraInfo = JSON.stringify(extraData);
                if (noteColor && !isNaN(noteColor) && noteColor >= 0 && noteColor <= 9) {
                    // Color will be handled by canvas background
                }
                if (extraData.status === 1) {
                    return null; // Skip this note if status is 1
                }
            } else { fileContent = _('errorNoteFieldMissing'); } // Ensure _() is defined or handle appropriately
        } catch (e) { fileContent = _('errorNoteParse'); } // Ensure _() is defined or handle appropriately
        
        const isHiddenNote = extraData.pass === true;
        const isType1Note = extraData.type === 1;
        let noteTitle = '';
        let displayContent = fileContent;
        if (isHiddenNote) {
            const pipeIndex = fileContent.indexOf('|');
            const previewContent = pipeIndex !== -1 ? fileContent.substring(0, pipeIndex) : '';
            noteTitle = previewContent.split('\n')[0].trim();
        } else if (isType1Note) {
            const pipeIndex = fileContent.indexOf('|');
            if (pipeIndex !== -1) {
                noteTitle = fileContent.substring(0, pipeIndex).trim();
                displayContent = fileContent.substring(pipeIndex + 1).trim();
            } else {
                noteTitle = fileContent.split('\n')[0].substring(0, 50);
            }
        } else if (!isHiddenNote) {
            const lines = fileContent.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    noteTitle = trimmedLine.substring(0, 50);
                    break;
                }
            }
        }
        if (!noteTitle && !isHiddenNote) { noteTitle = '...'; }
        const titleWrapper = document.createElement('div');
        const titleEl = document.createElement('h3');
        titleEl.textContent = noteTitle;
        titleEl.title = noteTitle; // Keep the tooltip with the full title
        titleEl.className = 'note-title-truncated';
        // Create header info container for date and time
        const headerInfoContainer = document.createElement('div');
        headerInfoContainer.className = 'note-header-info';
        const headerDate = document.createElement('span');
        headerDate.className = 'note-header-date';
        const headerTime = document.createElement('span');
        headerTime.className = 'note-header-time';

        // Add click listener to the date to show full note data
        headerDate.addEventListener('click', (e) => {
            e.stopPropagation();
            showModal({ raw: JSON.stringify(fullNoteContent, null, 2), color: 'white' });
        });
        if (extraData.timer) {
            const dateText = formatDate(extraData.timer);
            if (dateText) headerDate.innerHTML = `<span class="header-icon">${calendarIconSvg}</span> ${dateText}`;
            const timeText = formatTime(extraData.timer);
            if (timeText) headerTime.innerHTML = `<span class="header-icon">${clockIconSvg}</span> ${timeText}`;
        } else if (extraData.calendarDate) {
            const dateText = formatDate(extraData.calendarDate);
            if (dateText) {
                headerDate.innerHTML = `<span class="header-icon">${calendarIconSvg}</span> ${dateText}`;
            }
        } else if (extraData.datemod) { // Always create the element
            const dateText = formatDate(extraData.datemod);
            if (dateText) {
                headerDate.textContent = dateText; // No icon for datemod
                headerDate.classList.add('datemod-header-date');
            }
        }
        headerInfoContainer.appendChild(headerDate);
        headerInfoContainer.appendChild(headerTime);
        // Add the new container before the title
        titleWrapper.appendChild(headerInfoContainer);
        titleWrapper.appendChild(titleEl);
        // Asynchronously create and apply the colored background
        const noteBgColor = noteColor !== null ? getComputedStyle(document.documentElement).getPropertyValue(`--note-bg-${noteColor}`).trim() : '#FBFF86';
        try {
            // Pass the note's dimensions (from CSS) to the canvas function
            const imageName = (extraData.sellist && extraData.sellist > 0) ? `${extraData.sellist}` : 0;
            const backgroundCanvas = await createColoredNoteBackground(noteBgColor, imageName, 250, 250);
            backgroundCanvas.className = 'note-background-canvas';
            // Prepend the canvas so it's the first child and sits behind the content wrapper
            note.prepend(backgroundCanvas);
        } catch (error) {
            console.error("Failed to create colored note background:", error);
        }
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'note-content-wrapper';
        note.appendChild(contentWrapper);
        if (isHiddenNote) {
            const lockIconOverlay = document.createElement('div');
            lockIconOverlay.className = 'lock-icon-overlay';
            lockIconOverlay.innerHTML = lockIconSvg;
            contentWrapper.appendChild(lockIconOverlay);
        }
        const contentEl = document.createElement('div');
        contentEl.className = 'note-content';
    
        if (isHiddenNote) {
            const pipeIndex = fileContent.indexOf('|');
            const previewContent = pipeIndex !== -1 ? fileContent.substring(0, pipeIndex) : '';
            contentEl.innerHTML = renderNoteContent(previewContent);
        } else {
            if (textSpan && textSpan.trim() !== '') {
                contentEl.innerHTML = formatText(displayContent, textSpan);
            } else {
                contentEl.innerHTML = renderNoteContent(displayContent);
            }
        }
        if (!isHiddenNote && noteGdid) {
            const attachments = mediaData.filter(media => media.noteid === noteGdid);
            if (attachments.length > 0) {
                const separator = document.createElement('hr');
                separator.style.marginTop = '10px';
                separator.style.marginBottom = '10px';
                contentEl.appendChild(separator);
                await Promise.all(attachments.map(async attachment => {
                    const iconData = attachmentIcons.find(icon => icon.type === attachment.type);
                    const useLocalDb = localStorage.getItem('useLocalDb') === 'true';

                    if (iconData) {
                        const attachmentWrapper = document.createElement('div');
                        attachmentWrapper.style.display = 'flex';
                        attachmentWrapper.style.alignItems = 'center';
                        attachmentWrapper.style.gap = '5px';
                        
                        if (useLocalDb && dirHandle) {
                            // The existing local DB logic remains here
                            const iconDiv = document.createElement('div');
                            if (attachment.type === 3 && attachment.path) {
                                const filename = attachment.path.split('/').pop();
                                const link = document.createElement('a');
                                link.href = '#';
                                link.onclick = async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try {
                                        const otherDir = await dirHandle.getDirectoryHandle('Other');
                                        const fileHandle = await otherDir.getFileHandle(filename);
                                        const file = await fileHandle.getFile();
                                        window.open(URL.createObjectURL(file), '_blank');
                                    } catch (err) {
                                        console.error(`Could not open local file Other/${filename}`, err);
                                        showToast(`Could not open local file: ${filename}`);
                                    }
                                };
                                link.target = '_blank';
                                link.title = link.href;
                                link.textContent = 'Other/' + filename;
                                attachmentWrapper.appendChild(link);
                                iconDiv.innerHTML = iconData.svg;
                                iconDiv.style.cursor = 'pointer';
                                iconDiv.addEventListener('click', () => {
                                    const attachmentDataString = JSON.stringify(attachment, null, 2);
                                    showModal(attachmentDataString);
                                });
                            } else if (attachment.type === 5 && attachment.path) {
                                const parts = attachment.path.split('|');
                                if (parts.length >= 3) {
                                    const textContainer = document.createElement('div');
                                    const line1 = document.createElement('span');
                                    line1.textContent = `${parts[0]}, ${parts[1]}`;
                                    textContainer.appendChild(line1);
                                    const line2 = document.createElement('div');
                                    line2.textContent = parts[2];
                                    textContainer.appendChild(line2);
                                    attachmentWrapper.appendChild(textContainer);
                                    iconDiv.innerHTML = iconData.svg;
                                    iconDiv.style.cursor = 'pointer';
                                    iconDiv.addEventListener('click', () => {
                                        const attachmentDataString = JSON.stringify(attachment, null, 2);
                                        showModal(attachmentDataString);
                                    });
                                }
                            }
                            if (attachment.type === 1 && attachment.path) {
                                const filename = attachment.path.split('/').pop();
                                const link = document.createElement('a');
                                link.href = '#';
                                link.onclick = async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try {
                                        const imagesDir = await dirHandle.getDirectoryHandle('Images');
                                        const fileHandle = await imagesDir.getFileHandle(filename);
                                        const file = await fileHandle.getFile();
                                        window.open(URL.createObjectURL(file), '_blank');
                                    } catch (err) {
                                        console.error(`Could not open local file Images/${filename}`, err);
                                        showToast(`Could not open local file: ${filename}`);
                                    }
                                };
                                link.target = '_blank';
                                link.title = link.href;
                                link.textContent = 'Images/' + filename;
                                iconDiv.innerHTML = iconData.svg;
                                attachmentWrapper.appendChild(link);
                            }
                            attachmentWrapper.prepend(iconDiv);
                            if (attachment.type === 2 && attachment.path) {
                                const filename = attachment.path.split('/').pop();
                                const textContainer = document.createElement('div');
                                textContainer.style.flexGrow = '1';
                                textContainer.style.flexShrink = '1';
                                textContainer.style.minWidth = '0';
                                const link = document.createElement('a');
                                link.href = '#';
                                link.onclick = async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try {
                                        const soundDir = await dirHandle.getDirectoryHandle('Sound');
                                        const fileHandle = await soundDir.getFileHandle(filename);
                                        const file = await fileHandle.getFile();
                                        window.open(URL.createObjectURL(file), '_blank');
                                    } catch (err) {
                                        console.error(`Could not open local file Sound/${filename}`, err);
                                        showToast(`Could not open local file: ${filename}`);
                                    }
                                };
                                link.target = '_blank';
                                link.title = link.href;
                                link.textContent = 'Sound/' + filename;
                                textContainer.appendChild(link);
                                const line2 = document.createElement('div');
                                line2.textContent = attachment.description || '';
                                textContainer.appendChild(line2);
                                iconDiv.innerHTML = iconData.svg;
                                iconDiv.style.cursor = 'pointer';
                                iconDiv.addEventListener('click', () => {
                                    const attachmentDataString = JSON.stringify(attachment, null, 2);
                                    showModal(attachmentDataString);
                                });
                                attachmentWrapper.appendChild(textContainer);
                            }
                        } else if (attachment.gdid) {
                            await handleGoogleDriveAttachment(attachment, attachmentWrapper, iconData);
                        }
                        contentEl.appendChild(attachmentWrapper);
                    }
                }));
            }
        }
        note.addEventListener('click', (e) => {
            const noteEl = e.currentTarget;
            if (!e.target.closest('.note-footer')) {
                const noteBgColor = noteColor !== null ? `var(--note-bg-${noteColor})` : 'var(--note-bg-0)';
                showModal({ raw: fileContent, format: textSpan, color: noteBgColor, boardId: extraData.boardid });
            }
        });
        contentWrapper.appendChild(titleWrapper);
        contentWrapper.appendChild(contentEl);
        return note;
    }

    async function handleGoogleDriveAttachment(attachment, attachmentWrapper, iconData) {
        const iconDiv = document.createElement('div');
        iconDiv.innerHTML = iconData.svg;

        if (!attachment.path) {
            iconDiv.style.cursor = 'pointer';
            iconDiv.addEventListener('click', (e) => {
                e.stopPropagation();
                const attachmentDataString = JSON.stringify(attachment, null, 2);
                showModal(attachmentDataString);
            });
            attachmentWrapper.prepend(iconDiv);
            return;
        }

        const filename = attachment.path.split('/').pop();
        const link = document.createElement('a');

        const setupLink = async (folderName, textPrefix) => {
            const fileId = await getFileID(folderIds[folderName], filename);
            if (fileId) {
                link.href = `https://drive.google.com/file/d/${fileId}/view`;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.onclick = (e) => e.stopPropagation();
            } else {
                link.href = '#';
                link.onclick = (e) => e.preventDefault();
            }
            link.title = link.href;
            link.textContent = textPrefix + filename;
        };

        switch (attachment.type) {
            case 1: // Image
                await setupLink('Images', 'Images/');
                iconDiv.addEventListener('click', async (e) => {
                    if (localStorage.getItem('useLocalDb') === 'true') return;
                    e.stopPropagation();
                    e.preventDefault();
                    const noteEl = attachmentWrapper.closest('.note');
                    if (!noteEl || noteEl.querySelector('.image-preview-overlay')) return;
                    
                    const titleEl = noteEl.querySelector('h3');
                    const fileId = await getFileID(folderIds['Images'], filename);
                    if (!fileId) {
                        showToast(_('imgNotFound'));
                        return;
                    }
                    try {
                        const fileMetadata = await gapi.client.drive.files.get({ fileId: fileId, fields: 'thumbnailLink' });
                        const thumbnailUrl = fileMetadata.result.thumbnailLink;
                        if (thumbnailUrl) {
                            if (titleEl) titleEl.style.visibility = 'hidden';
                            const overlay = document.createElement('div');
                            overlay.className = 'image-preview-overlay';
                            Object.assign(overlay.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '10', borderRadius: '8px' });
                            overlay.addEventListener('click', (ev) => { ev.stopPropagation(); window.open(link.href, '_blank'); });
                            const img = document.createElement('img');
                            img.src = thumbnailUrl.replace(/=s\d+/, '=s1600');
                            Object.assign(img.style, { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', padding: '10px', boxSizing: 'border-box' });
                            overlay.appendChild(img);
                            const closeButton = document.createElement('button');
                            closeButton.className = 'view-button';
                            closeButton.innerHTML = eyeOffIconSvg;
                            Object.assign(closeButton.style, { position: 'absolute', top: '10px', right: '10px' });
                            const svg = closeButton.querySelector('svg');
                            if(svg) svg.style.stroke = 'white';
                            closeButton.addEventListener('click', (ev) => { ev.stopPropagation(); overlay.remove(); if (titleEl) titleEl.style.visibility = 'visible'; });
                            overlay.appendChild(closeButton);
                            noteEl.appendChild(overlay);
                        } else {
                            showToast(_('noImgPreview'));
                        }
                    } catch (err) {
                        console.error('Error fetching image preview:', err);
                        showToast(_('errorImgPreview').replace('{error}', (err.message || err)));
                    }
                });
                attachmentWrapper.appendChild(link);
                break;

            case 2: // Sound
                await setupLink('Sound', 'Sound/');
                const soundTextContainer = document.createElement('div');
                soundTextContainer.style.flexGrow = '1';
                soundTextContainer.style.flexShrink = '1';
                soundTextContainer.style.minWidth = '0';
                soundTextContainer.appendChild(link);
                const soundLine2 = document.createElement('div');
                soundLine2.textContent = attachment.description || '';
                soundTextContainer.appendChild(soundLine2);
                iconDiv.style.cursor = 'pointer';
                iconDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const attachmentDataString = JSON.stringify(attachment, null, 2);
                    showModal(attachmentDataString);
                });
                attachmentWrapper.appendChild(soundTextContainer);
                break;

            case 3: // Other
                await setupLink('Other', 'Other/');
                attachmentWrapper.appendChild(link);
                iconDiv.style.cursor = 'pointer';
                iconDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const attachmentDataString = JSON.stringify(attachment, null, 2);
                    showModal(attachmentDataString);
                });
                break;

            case 4: // Video
                await setupLink('Video', 'Video/');
                const videoTextContainer = document.createElement('div');
                videoTextContainer.style.flexGrow = '1';
                videoTextContainer.style.flexShrink = '1';
                videoTextContainer.style.minWidth = '0';
                videoTextContainer.appendChild(link);
                const videoLine2 = document.createElement('div');
                videoLine2.textContent = attachment.description || '';
                videoTextContainer.appendChild(videoLine2);
                iconDiv.addEventListener('click', async (e) => {
                    if (localStorage.getItem('useLocalDb') === 'true') return;
                    e.stopPropagation();
                    e.preventDefault();
                    const noteEl = attachmentWrapper.closest('.note');
                    if (!noteEl || noteEl.querySelector('.image-preview-overlay')) return;

                    const titleEl = noteEl.querySelector('h3');
                    const fileId = await getFileID(folderIds['Video'], filename);
                    if (!fileId) {
                        showToast(_('videoNotFound'));
                        return;
                    }
                    try {
                        const fileMetadata = await gapi.client.drive.files.get({ fileId: fileId, fields: 'thumbnailLink' });
                        const thumbnailUrl = fileMetadata.result.thumbnailLink;
                        if (thumbnailUrl) {
                            if (titleEl) titleEl.style.visibility = 'hidden';
                            const overlay = document.createElement('div');
                            overlay.className = 'image-preview-overlay';
                            Object.assign(overlay.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '10', borderRadius: '8px' });
                            overlay.addEventListener('click', (ev) => { ev.stopPropagation(); window.open(link.href, '_blank'); });
                            const img = document.createElement('img');
                            img.src = thumbnailUrl.replace(/=s\d+/, '=s1600');
                            Object.assign(img.style, { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', padding: '10px', boxSizing: 'border-box' });
                            overlay.appendChild(img);
                            const closeButton = document.createElement('button');
                            closeButton.className = 'view-button';
                            closeButton.innerHTML = eyeOffIconSvg;
                            Object.assign(closeButton.style, { position: 'absolute', top: '10px', right: '10px' });
                            const svg = closeButton.querySelector('svg');
                            if(svg) svg.style.stroke = 'white';
                            closeButton.addEventListener('click', (ev) => { ev.stopPropagation(); overlay.remove(); if (titleEl) titleEl.style.visibility = 'visible'; });
                            overlay.appendChild(closeButton);
                            noteEl.appendChild(overlay);
                        } else {
                            showToast(_('noVideoPreview'));
                        }
                    } catch (err) {
                        console.error('Error fetching video preview:', err);
                        showToast(_('errorVideoPreview').replace('{error}', (err.message || err)));
                    }
                });
                attachmentWrapper.appendChild(videoTextContainer);
                break;

            case 5: // Location
                const parts = attachment.path.split('|');
                if (parts.length >= 3) {
                    const textContainer = document.createElement('div');
                    const line1 = document.createElement('span');
                    line1.textContent = `${parts[0]}, ${parts[1]}`;
                    textContainer.appendChild(line1);
                    const line2 = document.createElement('div');
                    line2.textContent = parts[2];
                    textContainer.appendChild(line2);
                    attachmentWrapper.appendChild(textContainer);
                    iconDiv.style.cursor = 'pointer';
                    iconDiv.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const attachmentDataString = JSON.stringify(attachment, null, 2);
                        showModal(attachmentDataString);
                    });
                }
                break;
        }
        attachmentWrapper.prepend(iconDiv);
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

async function renderUI({ boardParseError }) {
    let boardsNoteElement = null;
    if (boardsData.length > 0 || boardParseError) {
        boardsNoteElement = await createBoardsUI(boardsData, boardParseError);
    }
    const noteElements = await Promise.all(allNotesData.map(noteData => createNoteElement(noteData.rawData)));
    let notesCount = 0;
    noteElements.forEach(noteEl => {
        if (noteEl) {
            notesContainer.appendChild(noteEl);
            notesCount++;
        }
    });
    if (boardsNoteElement) {
        document.querySelector('header').appendChild(boardsNoteElement);
    }
    filterNotesByBoard(localStorage.getItem('startBoard') || 'all');
    const counterEl = document.getElementById('note-counter');
    if (counterEl) {
        counterEl.textContent = notesCount;
    }
}