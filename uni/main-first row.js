// terser main.js --compress --mangle --toplevel --output mainn.js
    console.log("Run uncut 1.10");
    function gapiLoaded() {
        console.log("GAPI library loaded.");
        gapi.load('client', initializeGapiClient);
    }

    const script = document.createElement('script');
    script.src = "https://apis.google.com/js/api.js";
    script.onload = gapiLoaded;
    document.head.appendChild(script);

    async function initializeGapiClient() {
        const tokenData = JSON.parse(sessionStorage.getItem('google_auth_token'));
        const accessToken = tokenData?.access_token;

        if (!accessToken) {
            showToast(_('errorTokenMissing'));
            window.location.href = 'login.html';
            return;
        }

        await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
        gapi.client.setToken({ access_token: accessToken });

        console.log("GAPI client initialized for Drive API.");

        document.body.style.display = 'block';
        initApp();
        listFiles();
    }

    // --- I18N ---
    const translations = {
        en: {
            appTitle: 'CX MultiNotes Viewer',
            searchPlaceholder: 'Search in titles...', 
            reloadButton: 'Reload',
            signoutButton: 'Sign Out',
            copyTooltip: 'Copy content',
            topTooltip: 'Go to top',
            allBoards: 'All',
            boardsTitle: 'Boards',
            viewFullContent: 'View full content',
            loadingFile: 'Loading...', 
            of: 'of',
            noFilesFound: 'No text files found in the folder.',
            errorProcessingFiles: 'An error occurred while processing files.',
            errorInvalidResponse: 'Failed to load files. Make sure the folder exists and you have access.',
            errorRequestFailed: 'Request to Google Drive failed. See console for details.',
            errorFolderIdInvalid: 'Folder ID is invalid or empty.',
            errorFolderIdMissing: 'Folder ID not provided. File loading stopped.',
            errorTokenMissing: 'Access token not available. Please log in again.',
            errorSessionExpired: 'Your session has expired. Please log in again.',
            errorCopyFailed: 'Failed to copy content.',
            errorNoteParse: "Error parsing JSON content.",
            errorNoteFieldMissing: "Error: 'notetxt' field not found.",
            warningInvalidBoard: 'Warning: One or more board files are invalid and have been skipped.',
            promptFolderId: 'Please enter the Google Drive Folder ID:',
            folderIdInputPlaceholder: 'Google Drive Folder ID',
            zoomLabel: 'Zoom:',
            calendar: 'Calendar',
            reminder: 'Reminders',
            // folderIdDeleted: 'Folder ID has been deleted.',
            submitButton: 'Confirm'
        },
        bg: {
            appTitle: 'CX MultiNotes Viewer',
            searchPlaceholder: 'Търсене в заглавията...', 
            reloadButtonTooltip: 'Презареди',
            signoutButtonTooltip: 'Изход',
            copyTooltip: 'Копирай съдържанието',
            topTooltip: 'Към началото',
            allBoards: 'Всички',
            boardsTitle: 'Бордове',
            viewFullContent: 'Виж цялото съдържание',
            loadingFile: 'Четене...', 
            of: 'от',
            noFilesFound: 'Няма намерени текстови файлове в папката.',
            errorProcessingFiles: 'Възникна грешка при обработката на файловете.',
            errorInvalidResponse: 'Неуспешно зареждане на файловете. Уверете се, че папката съществува и имате достъп.',
            errorRequestFailed: 'Грешка при заявката към Google Drive. Виж конзолата за подробности.',
            errorFolderIdInvalid: 'Folder ID е невалиден или празен.',
            errorFolderIdMissing: 'Не е въведен ID. Зареждането на файлове е спряно.',
            errorTokenMissing: 'Няма достъпен токен. Моля, влезте отново.',
            errorSessionExpired: 'Вашата сесия е изтекла. Моля, влезте отново.',
            errorCopyFailed: 'Неуспешно копиране на съдържанието.',
            errorNoteParse: "Грешка при парсване на JSON съдържание.",
            errorNoteFieldMissing: "Грешка: липсва поле 'notetxt'.",
            warningInvalidBoard: 'Внимание: Един или повече файлове за дефиниция на бордове са невалидни и бяха пропуснати.',
            promptFolderId: 'Моля, въведете ID на папката в Google Drive:',
            folderIdInputPlaceholder: 'Въведете Google Drive Folder ID',
            // folderIdDeleted: 'Folder ID е изтрит.',
            zoomLabel: 'Мащаб:',
            calendar: 'Календар',
            reminder: 'Напомняния',
            submitButton: 'Потвърди'
        }
    };
    let currentLang = localStorage.getItem('language') || 'bg';

    function setLanguage(lang) {
        if (!translations[lang]) return;
        currentLang = lang;
        localStorage.setItem('language', lang);
        document.documentElement.lang = lang;

        document.querySelectorAll('[data-key]').forEach(element => {
            const key = element.getAttribute('data-key');
            element.textContent = _(key);
        });

        document.querySelectorAll('[data-key-placeholder]').forEach(element => {
            const key = element.getAttribute('data-key-placeholder');
            element.placeholder = _(key);
        });
        
        document.querySelectorAll('[data-key-title]').forEach(element => {
            const key = element.getAttribute('data-key-title');
            element.title = _(key);
        });
    }

    function _(key) {
        return translations[currentLang][key] || key;
    }

    // --- Toast Notification ---
    let toastTimeout;
    function showToast(message, duration = 5000) {
        const toast = document.getElementById('toastNotification');
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, duration);
    }

    // --- Folder ID Prompt Popup Logic ---
    let folderIdPromptPopup;
    let folderIdInput;
    let submitFolderIdBtn;

    function showFolderIdPrompt() {
        folderIdPromptPopup = document.getElementById('folderIdPromptPopup');
        folderIdInput = document.getElementById('folderIdInput');
        submitFolderIdBtn = document.getElementById('submitFolderIdBtn');

        // Set translated text for popup elements
        document.querySelector('#folderIdPromptPopup p').textContent = _('promptFolderId');
        folderIdInput.placeholder = _('folderIdInputPlaceholder');
        submitFolderIdBtn.textContent = _('submitButton');

        folderIdPromptPopup.classList.add('show');
        folderIdInput.value = ''; // Pre-fill if exists
        folderIdInput.focus(); // Focus on the input field
    }

    function hideFolderIdPrompt() {
        folderIdPromptPopup.classList.remove('show');
    }

    function handleSubmitFolderId() {
        const newFolderId = folderIdInput.value.trim();
        if (newFolderId) {
            hideFolderIdPrompt();
            listFiles(newFolderId); // Re-run listFiles to load notes with the new folder ID
        } else {
            showToast(_('errorFolderIdInvalid')); // Use toast for invalid input
        }
    }

    // --- Constants ---
    const eyeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const calendarIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="5" width="16" height="16" rx="2" /><line x1="16" y1="3" x2="16" y2="7" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="4" y1="11" x2="20" y2="11" /></svg>`;
    const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" /></svg>`;
    const boardIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="9" y1="4" x2="9" y2="20" /><line x1="15" y1="4" x2="15" y2="20" /></svg>`;
    const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21V3M5 10l7-7 7 7"/></svg>`;
    const lockIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
    const attachmentIcons = [
        { type: 1, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6l1.5-2h3L15 6"/><circle cx="12" cy="13" r="3"/></svg>` },
        { type: 2, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24" ><circle cx="7" cy="12" r="4" /><circle cx="17" cy="12" r="4"/><line x1="6" y1="16" x2="18" y2="16" stroke="black" stroke-width="1" /></svg>` },
        { type: 3, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 2v6h6"/></svg>` },
        { type: 4, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>` },
        { type: 5, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>` },
        { type: 6, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="10" r="2"/><path d="M8 16c0-1.33 2.67-2 4-2s4 .67 4 2"/></svg>` }
    ];
    // const refreshSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="#000000" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="feather feather-refresh-cw"><polyline points="23 4 23 10 17 10"></polyline><path d="M1 20a11 11 0 0 0 17.07-4.9"></path></svg>`;
    // const logoutSvg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" id="mdi-application-export" width="24" height="24" viewBox="0 0 24 24"><path d="M8,12H17.76L15.26,9.5L16.67,8.08L21.59,13L16.67,17.92L15.26,16.5L17.76,14H8V12M19,3C20.11,3 21,3.9 21,5V9.67L19,7.67V7H5V19H19V18.33L21,16.33V19A2,2 0 0,1 19,21H5C3.89,21 3,20.1 3,19V5A2,2 0 0,1 5,3H19Z" /></svg>`;

    let authToken = null, currentModalContent = '', boardsData = [], currentBoardFilter = 'all', currentBackground = 'Board.png';
    let folderIds = {};
    let signoutButton, reloadButton, notesContainer, contentModal, modalBody, copyBtn, boardsButton, boardsModal, scrollTopBtn, searchBox, loaderContainer, loaderText, zoomInput;
    const boardsNoteBgnd = '#cfe6f8';

    // --- App Initialization ---
    checkAuth();

    function checkAuth() {
        const storedTokenString = sessionStorage.getItem('google_auth_token');
        if (!storedTokenString) { window.location.href = 'login.html'; return; }
        authToken = JSON.parse(storedTokenString);
        const isExpired = (Date.now() - authToken.issued_at) / 1000 > (authToken.expires_in - 60);
        if (isExpired) {
            sessionStorage.removeItem('google_auth_token');
            showToast(_('errorSessionExpired'));
            window.location.href = 'login.html';
        }
    }

    function initApp() {
        signoutButton = document.getElementById('signout_button');
        reloadButton = document.getElementById('reload_button');
        notesContainer = document.getElementById('notes-container');
        contentModal = document.getElementById('content-modal');
        modalBody = document.getElementById('modal-body');
        copyBtn = document.getElementById('copy-modal-btn');
        scrollTopBtn = document.getElementById("scrollTopBtn");
        scrollTopBtn.innerHTML = arrowSvg;
        searchBox = document.getElementById('search-box');
        loaderContainer = document.getElementById('loader-container');
        loaderText = document.getElementById('loader-text');

        signoutButton.addEventListener('click', handleSignoutClick);
        reloadButton.addEventListener('click', () => listFiles());

        window.onscroll = () => {
            const isScrolled = document.body.scrollTop > 100 || document.documentElement.scrollTop > 100;
            if (currentBoardFilter !== 'all') {
                scrollTopBtn.style.display = "flex";
            } else {
                if (isScrolled) {
                    scrollTopBtn.style.display = "flex";
                } else {
                    scrollTopBtn.style.display = "none";
                }
            }
        };
        scrollTopBtn.addEventListener('click', () => window.scrollTo({top: 0, behavior: 'smooth'}));

        searchBox.addEventListener('input', applySearchFilter);

        copyBtn.innerHTML = copyIconSvg;
        copyBtn.addEventListener('click', () => {
            if (navigator.clipboard) {
                if (currentModalContent?.trim()) {
                    navigator.clipboard.writeText(currentModalContent).then(() => {
                        copyBtn.innerHTML = '&#10003;';
                        setTimeout(() => { copyBtn.innerHTML = copyIconSvg; }, 2000);
                    }).catch(err => { showToast(_('errorCopyFailed')); });
                }
            }
        });

        // Event listener for submit button in folder ID popup
        document.getElementById('submitFolderIdBtn').addEventListener('click', handleSubmitFolderId);
        document.getElementById('folderIdInput').addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                handleSubmitFolderId();
            }
        });

        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', (e) => e.currentTarget.closest('.modal-overlay').classList.remove('visible'));
        });
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('visible'); });
        });
        
        setLanguage(currentLang);
    }

    // --- Core Functions ---
    function handleSignoutClick() {
        sessionStorage.removeItem('google_auth_token');
        // showToast(_('folderIdDeleted'));
        window.location.href = 'login.html';
    }

    function showModal(options) {
        let rawContent, formatString, displayContent;

        if (typeof options === 'string') {
            rawContent = options;
            formatString = null;
        } else {
            rawContent = options.raw;
            formatString = options.format;
        }

        currentModalContent = rawContent;

        if (formatString && formatString.trim() !== '') {
            displayContent = formatText(rawContent, formatString);
        } else {
            displayContent = linkifyText(rawContent);
        }
        
        modalBody.innerHTML = displayContent;
        contentModal.classList.add('visible');
        copyBtn.innerHTML = copyIconSvg;
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

    function appendLinkifiedText(container, text) {
        const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%?=~_|])/ig;
        let lastIndex = 0, match;
        container.innerHTML = '';
        while ((match = urlRegex.exec(text)) !== null) {
            if (match.index > lastIndex) container.appendChild(document.createTextNode(text.substring(lastIndex, match.index)));
            const url = match[0];
            const link = document.createElement('a');
            link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
            link.appendChild(document.createTextNode(url));
            container.appendChild(link);
            lastIndex = match.index + url.length;
        }
        if (text.length > lastIndex) container.appendChild(document.createTextNode(text.substring(lastIndex)));
    }

    function filterNotesByBoard(boardId) {
        currentBoardFilter = boardId;
        applyFilters();

        document.querySelectorAll('.board-filter-link').forEach(link => {
            link.classList.remove('selected-board');
            if (link.dataset.boardid === boardId) {
                link.classList.add('selected-board');
            }
        });

        let newBackground = 'Board.png'; // Default background

        if (boardId !== 'all') {
            const board = boardsData.find(b => b.gdid === boardId);
            if (board && board.backnum) {
                switch (board.backnum) {
                    case 1:
                        newBackground = 'Board1.png';
                        break;
                    case 2:
                        newBackground = 'Board2.png';
                        break;
                    case 3:
                        newBackground = 'Board3.png';
                        break;
                    default:
                        newBackground = 'Board.png';
                        break;
                }
            }
        }

        if (newBackground !== currentBackground) {
            document.body.style.backgroundImage = `url('${newBackground}')`;
            notesContainer.style.backgroundImage = `url('${newBackground}')`;
            currentBackground = newBackground;
        }

        if (boardId === 'all') {
            scrollTopBtn.innerHTML = arrowSvg;
        } else if (boardId === 'calendar') {
            scrollTopBtn.innerHTML = _('calendar') + " " + arrowSvg;
        } else if (boardId === 'reminder') {
            scrollTopBtn.innerHTML = _('reminder') + " " + arrowSvg;
        } else {
            const board = boardsData.find(b => b.gdid === boardId);
            if (board) {
                scrollTopBtn.innerHTML = board.title + " " + arrowSvg;
            }
        }
        window.dispatchEvent(new Event('scroll'));
    }

    function applySearchFilter() {
        applyFilters();
    }

    function applyFilters() {
        const searchTerm = searchBox.value.toLowerCase();
        const notes = notesContainer.getElementsByClassName('note');
        let visibleCount = 0;

        for (const note of notes) {
            if (note.querySelector('h3') && note.querySelector('h3').textContent === _('boardsTitle')) {
                note.style.display = 'flex';
                continue;
            }

            let isVisibleByBoard = false;
            const extraInfo = note.dataset.extraInfo;

            if (currentBoardFilter === 'all') {
                isVisibleByBoard = true;
            } else if (currentBoardFilter === 'calendar') {
                if (extraInfo) {
                    try {
                        const data = JSON.parse(extraInfo);
                        if (data.calendarDate && data.calendarDate !== 0) {
                            isVisibleByBoard = true;
                        }
                    } catch (e) {
                        console.error('Error parsing extraInfo for note:', e);
                    }
                }
            } else if (currentBoardFilter === 'reminder') {
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
            const titleEl = note.querySelector('h3');
            if (titleEl) {
                const title = titleEl.textContent.toLowerCase();
                isVisibleBySearch = title.includes(searchTerm);
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
        
    async function fetchFiles(filename, folderId, onProgress) {
        if (!folderId || typeof folderId !== 'string' || folderId.trim() === '') {
            showFolderIdPrompt();
            throw new Error("Folder ID not provided.");
        }

        const allFiles = [];
        let pageToken = null;

        do {
            const response = await gapi.client.drive.files.list({
                q: `'${folderId}' in parents and name = '${filename}' and mimeType='text/plain'`,
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
            console.error("Error fetching folder ID:", error);
            showToast("Error fetching folder ID.");
            return null;
        }
    }

    async function listFiles(folderIdFromPrompt) {
        boardsData = [];
        let mediaData = [];
        notesContainer.innerHTML = '';
        loaderContainer.style.display = 'block';

        currentBoardFilter = 'all';
        const popup = document.getElementById('board-filter-popup');
        if (popup) {
            popup.classList.remove('visible');
        }
        document.querySelectorAll('.board-filter-link').forEach(link => {
            link.classList.remove('selected-board');
        });
        
        try {
            let folderId = folderIdFromPrompt;
            if (!folderId) {
                folderId = await getFolderID();
            }

            if (!folderId) {
                showFolderIdPrompt();
                return;
            }

            loaderText.textContent = _('loadingFile') + ' board.txt';
            const boardResults = await fetchFiles('board.txt', folderId);
            let boardParseError = false;
            boardResults.forEach(({ res }) => {
                if (res.body.trim() === '') return;
                try {
                    const content = JSON.parse(res.body);
                    if (Array.isArray(content)) {
                        boardsData.push(...content);
                    } else if (typeof content === 'object' && content !== null) {
                        boardsData.push(content);
                    } else {
                        boardParseError = true;
                    }
                } catch (e) {
                    boardParseError = true;
                    console.error(`Error parsing board.txt:`, e);
                }
            });

            if (boardsData.length > 0 || boardParseError) {
                const boardsNote = document.createElement('div');
                boardsNote.className = 'note';
                boardsNote.style.backgroundColor = boardsNoteBgnd;
                boardsNote.style.order = -1;
                boardsNote.style.userSelect = 'none';
                boardsNote.style.height = 'auto';
                boardsNote.style.minHeight = 'auto'; // Added this line

                const titleEl = document.createElement('h3');
                titleEl.textContent = _('boardsTitle');
                titleEl.classList.add('board-menu-header');
                boardsNote.appendChild(titleEl);

                const noteCounter = document.createElement('div');
                noteCounter.id = 'note-counter';
                noteCounter.className = 'note-counter';
                boardsNote.appendChild(noteCounter);

                const boardMenuWrapper = document.createElement('div');
                boardMenuWrapper.className = 'board-menu-wrapper';

                const contentEl = document.createElement('div');
                contentEl.className = 'note-content board-menu-container';
                
                // New footer for the boards note
                const boardsNoteFooter = document.createElement('div');
                boardsNoteFooter.className = 'note-footer boards-note-footer';

                const zoomButton = document.createElement('button');
                zoomButton.className = 'zoom-btn';
                zoomButton.textContent = _('zoomLabel');
                const zoomValueDisplay = document.createElement('span');
                zoomValueDisplay.id = 'zoom-value-display';
                zoomButton.appendChild(zoomValueDisplay);
                zoomButton.addEventListener('click', () => {
                    document.getElementById('zoom-modal').classList.add('visible');
                });
                boardsNoteFooter.appendChild(zoomButton);

                // --- Zoom Modal Content ---
                const zoomModalBody = document.getElementById('zoom-modal-body');
                zoomModalBody.innerHTML = ''; 

                const zoomControlWrapper = document.createElement('div');
                zoomControlWrapper.className = 'zoom-control-wrapper';

                const sliderContainer = document.createElement('div');
                sliderContainer.className = 'slider-container';
                sliderContainer.innerHTML = `<input type="range" id="scaleSlider" min="25" max="175" value="100"><span id="scaleValue"></span>`;

                const applyBtn = document.createElement('button');
                applyBtn.className = 'zoom-btn';
                applyBtn.textContent = _('submitButton');
                applyBtn.style.marginLeft = '10px';
                applyBtn.addEventListener('click', () => {
                    document.getElementById('zoom-modal').classList.remove('visible');
                });

                zoomControlWrapper.appendChild(sliderContainer);
                zoomControlWrapper.appendChild(applyBtn);
                zoomModalBody.appendChild(zoomControlWrapper);

                const slider = sliderContainer.querySelector('#scaleSlider');
                const scaleValue = sliderContainer.querySelector('#scaleValue');

                const updateZoom = (value) => {
                    notesContainer.style.zoom = value / 100;
                    scaleValue.textContent = `${value}%`;
                    zoomValueDisplay.textContent = ` ${value}%`;
                };

                // Load zoom level from localStorage
                let savedZoom = localStorage.getItem('zoomLevel');
                if (savedZoom) {
                    slider.value = savedZoom;
                    updateZoom(savedZoom);
                } else {
                    updateZoom(slider.value);
                }

                slider.addEventListener('input', () => {
                    const zoomValue = slider.value;
                    updateZoom(zoomValue);
                    localStorage.setItem('zoomLevel', zoomValue);
                });

                slider.addEventListener('click', (e) => {
                    if (e.ctrlKey) {
                        e.preventDefault();
                        let currentValue = parseInt(slider.value, 10);
                        let newValue;

                        if (currentValue % 10 === 0) {
                            newValue = currentValue + 10;
                        } else {
                            newValue = Math.round(currentValue / 10) * 10;
                        }

                        const max = parseInt(slider.max, 10);
                        const min = parseInt(slider.min, 10);

                        if (newValue > max) newValue = max;
                        if (newValue < min) newValue = min;

                        slider.value = newValue;
                        updateZoom(newValue);
                        localStorage.setItem('zoomLevel', newValue);
                    }
                });
                
                const calendarBoardLink = document.createElement('a');
                calendarBoardLink.href = '#';
                calendarBoardLink.textContent = _('calendar');
                calendarBoardLink.classList.add('board-filter-link', 'calendar-filter-btn');
                calendarBoardLink.dataset.boardid = 'calendar';
                calendarBoardLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    filterNotesByBoard('calendar');
                });
                contentEl.appendChild(calendarBoardLink);

                const reminderBoardLink = document.createElement('a');
                reminderBoardLink.href = '#';
                reminderBoardLink.textContent = _('reminder');
                reminderBoardLink.classList.add('board-filter-link', 'reminder-filter-btn');
                reminderBoardLink.dataset.boardid = 'reminder';
                reminderBoardLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    filterNotesByBoard('reminder');
                });
                contentEl.appendChild(reminderBoardLink);

                const allBoardsLink = document.createElement('a');
                allBoardsLink.href = '#';
                allBoardsLink.textContent = _('allBoards');
                allBoardsLink.classList.add('board-filter-link');
                allBoardsLink.dataset.boardid = 'all';
                allBoardsLink.addEventListener('click', (e) => {
                    e.preventDefault();
                    filterNotesByBoard('all');
                });
                contentEl.appendChild(allBoardsLink);

                boardsData.forEach(board => {
                    if (board.title && board.gdid) {
                        const boardLink = document.createElement('a');
                        boardLink.href = '#';
                        boardLink.textContent = board.title;
                        boardLink.classList.add('board-filter-link');
                        boardLink.dataset.boardid = board.gdid;

                        if (board.status === 1) {
                            boardLink.style.color = 'red';
                        }

                        boardLink.addEventListener('click', (e) => {
                            if (e.ctrlKey) {
                                const boardDataString = JSON.stringify(board, null, 2);
                                showModal(boardDataString);
                            } else {
                                e.preventDefault();
                                filterNotesByBoard(board.gdid);
                            }
                        });
                        contentEl.appendChild(boardLink);
                    }
                });
                
                if (boardParseError) {
                    const errorEl = document.createElement('div');
                    errorEl.style.color = 'red';
                    errorEl.style.marginTop = '10px';
                    errorEl.textContent = _('warningInvalidBoard');
                    contentEl.appendChild(errorEl);
                }

                boardMenuWrapper.appendChild(contentEl);
                
                boardsNote.appendChild(boardMenuWrapper);
                boardsNote.appendChild(boardsNoteFooter); // Append the new footer
                notesContainer.appendChild(boardsNote);
            }

            loaderText.textContent = _('loadingFile') + ' media.txt';
            const mediaResults = await fetchFiles('media.txt', folderId);
            mediaResults.forEach(({ res }) => {
                try {
                    if (res.body.trim()) {
                        const content = JSON.parse(res.body);
                        if (Array.isArray(content)) {
                            mediaData.push(...content);
                        } else {
                            mediaData.push(content);
                        }
                    }
                } catch (e) {
                    console.error('Error parsing media.txt:', e);
                }
            });

            const onNoteProgress = (loaded, total) => {
                loaderText.textContent = `${_('loadingFile')} ${loaded} ${_('of')} ${total}`;
            };
            loaderText.textContent = _('loadingFile') + ' note.txt';
            const noteResults = await fetchFiles('note.txt', folderId, onNoteProgress);

let notesCount = 0;
await Promise.all(noteResults.map(async ({ file, res }) => {
    const note = document.createElement('div');
    note.className = 'note';
    let fileContent = '';
    let noteGdid = null;
    let noteColor = null;
    let textSpan = null;

    try {
        const content = JSON.parse(res.body);
        if (content && typeof content.notetxt !== 'undefined') {
            fileContent = content.notetxt;
            noteGdid = content.gdid;
            noteColor = content.color;
            if (content.text_span) {
                textSpan = content.text_span;
            }
            const extraData = { ...content };
            delete extraData.notetxt;
            if (Object.keys(extraData).length > 0) note.dataset.extraInfo = JSON.stringify(extraData);
            if (noteColor && !isNaN(noteColor) && noteColor >= 0 && noteColor <= 9) {
                note.style.backgroundColor = `var(--note-bg-${noteColor})`;
            }

            // Check for status field here
            if (extraData.status === 1) {
                return; // Skip this note if status is 1
            }

        } else { fileContent = _('errorNoteFieldMissing'); }
    } catch (e) { fileContent = _('errorNoteParse'); }
    
    notesCount++;

    const isHiddenNote = fileContent.startsWith('|');
    if (isHiddenNote) {
        fileContent = fileContent.substring(1);
    }

    let noteTitle = '';
    const lines = fileContent.split('\n');
    for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine) {
            noteTitle = trimmedLine.substring(0, 50);
            break;
        }
    }
    if (!noteTitle) { noteTitle = file.name; }

    const titleEl = document.createElement('h3');
    if (!isHiddenNote) {
        titleEl.textContent = noteTitle;
        titleEl.title = noteTitle;
    }
    
    const contentEl = document.createElement('div');
    contentEl.className = 'note-content';
    if (!isHiddenNote) {
        if (textSpan && textSpan.trim() !== '') {
            contentEl.innerHTML = formatText(fileContent, textSpan);
        } else {
            appendLinkifiedText(contentEl, fileContent);
        }

        if (noteGdid) {
            const attachments = mediaData.filter(media => media.noteid === noteGdid);
            if (attachments.length > 0) {
                const separator = document.createElement('hr');
                separator.style.marginTop = '10px';
                separator.style.marginBottom = '10px';
                contentEl.appendChild(separator);

                await Promise.all(attachments.map(async attachment => {
                    const iconData = attachmentIcons.find(icon => icon.type === attachment.type);
                    if (iconData) {
                        const attachmentWrapper = document.createElement('div');
                        attachmentWrapper.style.display = 'flex';
                        attachmentWrapper.style.alignItems = 'center';
                        attachmentWrapper.style.gap = '5px';

                        const iconDiv = document.createElement('div');
                        iconDiv.innerHTML = iconData.svg;
                        iconDiv.style.cursor = 'pointer';
                        iconDiv.addEventListener('click', () => {
                            const attachmentDataString = JSON.stringify(attachment, null, 2);
                            showModal(attachmentDataString);
                        });
                        attachmentWrapper.appendChild(iconDiv);

                        if (attachment.type === 3 && attachment.path) {
                            const filename = attachment.path.split('/').pop();
                            const link = document.createElement('a');
                            const fileId = await getFileID(folderIds['Other'], filename);
                            if (attachment.gdid) {
                                link.href = `https://drive.google.com/file/d/${fileId}/view`;
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                            } else {
                                link.href = '#';
                                link.onclick = (e) => e.preventDefault();
                            }
                            link.title = link.href;
                            link.textContent = 'Other/' + filename;
                            attachmentWrapper.appendChild(link);
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
                            }
                        }

                        if (attachment.type === 1 && attachment.path) {
                            const filename = attachment.path.split('/').pop();
                            const link = document.createElement('a');
                            const fileId = await getFileID(folderIds['Images'], filename);
                            if (attachment.gdid) {
                                link.href = `https://drive.google.com/file/d/${fileId}/view`;
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                            } else {
                                link.href = '#';
                                link.onclick = (e) => e.preventDefault();
                            }
                            link.title = link.href;
                            link.textContent = 'Images/' + filename;
                            attachmentWrapper.appendChild(link);
                        }
        
                        if (attachment.type === 2 && attachment.path) {
                            const filename = attachment.path.split('/').pop();
                            const textContainer = document.createElement('div');
                            textContainer.style.flexGrow = '1';
                            textContainer.style.flexShrink = '1';
                            textContainer.style.minWidth = '0';
                            
                            const link = document.createElement('a');
                            const fileId = await getFileID(folderIds['Sound'], filename);
                            if (attachment.gdid) {
                                link.href = `https://drive.google.com/file/d/${fileId}/view`;
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                            } else {
                                link.href = '#';
                                link.onclick = (e) => e.preventDefault();
                            }
                            link.title = link.href;
                            link.textContent = 'Sound/' + filename;
                            textContainer.appendChild(link);
                            
                            const line2 = document.createElement('div');
                            line2.textContent = attachment.description || '';
                            textContainer.appendChild(line2);

                            attachmentWrapper.appendChild(textContainer);
                        }

                        if (attachment.type === 4 && attachment.path) {
                            const filename = attachment.path.split('/').pop();
                            const textContainer = document.createElement('div');
                            textContainer.style.flexGrow = '1';
                            textContainer.style.flexShrink = '1';
                            textContainer.style.minWidth = '0';
                            
                            const link = document.createElement('a');
                            const fileId = await getFileID(folderIds['Video'], filename);
                            if (attachment.gdid) {
                                link.href = `https://drive.google.com/file/d/${fileId}/view`;
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                            } else {
                                link.href = '#';
                                link.onclick = (e) => e.preventDefault();
                            }
                            link.title = link.href;
                            link.textContent = 'Video/' + filename;
                            textContainer.appendChild(link);
                            
                            const line2 = document.createElement('div');
                            line2.textContent = attachment.description || '';
                            textContainer.appendChild(line2);

                            attachmentWrapper.appendChild(textContainer);
                        }

                        contentEl.appendChild(attachmentWrapper);
                    }
                }));
            }
        }
    }

    const footerEl = document.createElement('div');
    footerEl.className = 'note-footer';
    const footerLeft = document.createElement('div');
    footerLeft.style.display = 'flex';

    if (note.dataset.extraInfo) {
        try {
            const extraData = JSON.parse(note.dataset.extraInfo);
            if (extraData.boardid && boardsData.length > 0) {
                const board = boardsData.find(b => b.gdid === extraData.boardid);
                if (board) {
                    const boardDisplay = document.createElement('div');
                    boardDisplay.className = 'board-display';
                    boardDisplay.innerHTML = boardIconSvg;
                    const boardText = document.createElement('span');
                    boardText.textContent = board.title;
                    boardDisplay.appendChild(boardText);
                    footerLeft.appendChild(boardDisplay);

                    // Add event listener to board icon to show extra info
                    boardDisplay.addEventListener('click', () => {
                        const parentNote = boardDisplay.closest('.note');
                        if (parentNote && parentNote.dataset.extraInfo) {
                            try {
                                const extraInfoData = JSON.parse(parentNote.dataset.extraInfo);
                                let formattedContent = '';
                                for (const key in extraInfoData) {
                                    if (Object.hasOwnProperty.call(extraInfoData, key)) {
                                        formattedContent += `${key}: ${JSON.stringify(extraInfoData[key], null, 2)}
`;
                                    }
                                }
                                showModal(formattedContent.trim());
                            } catch (e) {
                                console.error('Error parsing data-extra-info:', e);
                                showToast('Error displaying extra info.');
                            }
                        }
                    });
                }
            }
            if (extraData.datemod) {
                const dateDisplay = document.createElement('div');
                dateDisplay.className = 'date-display';
                dateDisplay.innerHTML = calendarIconSvg;
                const dateText = document.createElement('span');
                dateText.textContent = formatDate(extraData.datemod);
                dateDisplay.appendChild(dateText);
                footerLeft.appendChild(dateDisplay);

                dateDisplay.addEventListener('click', () => {
                    try {
                        const content = JSON.parse(res.body);
                        showModal(JSON.stringify(content, null, 2));
                    } catch(e) {
                        showModal(res.body);
                    }
                });
            }
        } catch (e) { console.error('Error parsing extraInfo:', e); }
    }
    
    footerEl.appendChild(footerLeft);

    if (isHiddenNote) {
        const footerRight = document.createElement('div');
        footerRight.style.display = 'flex';
        footerRight.style.alignItems = 'center';

        const lockIcon = document.createElement('span');
        lockIcon.innerHTML = lockIconSvg;
        lockIcon.style.marginRight = '5px';
        footerRight.appendChild(lockIcon);

        const viewButton = document.createElement('button');
        viewButton.className = 'view-button';
        viewButton.innerHTML = eyeIconSvg;
        viewButton.title = _('viewFullContent');
        viewButton.addEventListener('click', () => showModal({ raw: fileContent, format: textSpan }));
        footerRight.appendChild(viewButton);
        footerEl.appendChild(footerRight);
    } else {
        setTimeout(() => {
            if (contentEl.scrollHeight > contentEl.clientHeight) {
                const viewButton = document.createElement('button');
                viewButton.className = 'view-button';
                viewButton.innerHTML = eyeIconSvg;
                viewButton.title = _('viewFullContent');
                viewButton.addEventListener('click', () => showModal({ raw: fileContent, format: textSpan }));
                footerEl.appendChild(viewButton);
            }
        }, 100);
    }

    note.appendChild(titleEl);
    note.appendChild(contentEl);
    note.appendChild(footerEl);
    notesContainer.appendChild(note);
}));

    const noteCounter = document.getElementById('note-counter');
    if (noteCounter) {
        noteCounter.textContent = notesCount;
    }
        } catch (err) {
            console.error("Error loading files:", err);
            showToast(err.message || _('errorProcessingFiles'));
        } finally {
            loaderContainer.style.display = 'none';
        }
    }

/**
 * Converts URLs in a string to HTML anchor tags.
 * @param {string} text - The text to linkify.
 * @returns {string} The linkified HTML string.
 */
function linkifyText(text) {
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%?=~_|])/ig;
    if (!text) return '';
    return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

/**
 * Форматира текстов низ въз основа на JSON параметри.
 * @param {string} text - Текстовият низ за форматиране.
 * @param {string} formatString - Форматиращият низ, разделен с '
'.
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
    return linkifyText(text);
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
    let formattedSegment = linkifyText(segmentText);

    activeFormats.sort((a, b) => b.type - a.type);

    activeFormats.forEach(format => {
      const {
        type,
        paramint,
        paramfloat
      } = format;
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
