// terser main.js --compress --mangle --toplevel --output mainn.js

// --- Google Auth & App Initialization ---
const CLIENT_ID = '1090128984423-80074rvs8n45v787044d9ca1bvahla98.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
let tokenClient;

// Promise to load a script
let allNotesData = []; // Store all notes data for calendar
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

/**
 * Attempts to silently refresh the access token.
 * Returns a promise that resolves with the new token data, or rejects on failure.
 */
function refreshToken() {
    return new Promise((resolve, reject) => {
        if (!tokenClient) {
            return reject(new Error('Google Token Client not initialized.'));
        }
        const timeout = setTimeout(() => reject(new Error('Token refresh timed out.')), 10000);
        tokenClient.callback = (tokenResponse) => {
            clearTimeout(timeout);
            if (tokenResponse && tokenResponse.access_token) {
                const tokenWithTimestamp = { ...tokenResponse, issued_at: Date.now() };
                sessionStorage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                resolve(tokenWithTimestamp);
            } else {
                reject(new Error('Failed to refresh access token. Response was empty.'));
            }
        };
        tokenClient.requestAccessToken({ prompt: '' });
    });
}

// Main startup function
async function startApp() {
    // 1. Check for a stored token first. If missing, redirect to login.
    const storedTokenString = sessionStorage.getItem('google_auth_token');
    if (!storedTokenString) {
        window.location.href = 'login.html';
        return;
    }

    // 2. Load Google libraries in parallel
    try {
        await Promise.all([
            loadScript('https://accounts.google.com/gsi/client'),
            loadScript('https://apis.google.com/js/api.js')
        ]);
    } catch (error) {
        console.error("Failed to load Google scripts", error);
        showToast("Error loading Google libraries.");
        return;
    }

    // 3. Initialize GSI token client
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: '' // Callback is managed by the refreshToken promise
    });

    // 4. Check if token is expired and refresh if needed
    let tokenData = JSON.parse(storedTokenString);
    const isExpired = (Date.now() - tokenData.issued_at) / 1000 > (tokenData.expires_in - 60);

    if (isExpired) {
        console.log("Token expired, attempting to refresh...");
        try {
            tokenData = await refreshToken();
            console.log("Token refreshed silently.");
        } catch (error) {
            console.warn("Silent token refresh failed, attempting consent refresh:", error);
            // If silent refresh fails, try again with user consent.
            // This will show the Google account chooser popup.
            try {
                tokenClient.requestAccessToken({ prompt: 'consent' });
                // The callback in refreshToken will handle the response.
                // We need to wait for the new token. We can create a one-time listener.
                tokenData = await new Promise((resolve, reject) => {
                    tokenClient.callback = (response) => response.access_token ? resolve(response) : reject(new Error('Consent refresh failed.'));
                });
                console.log("Token refreshed with consent.");
            } catch (consentError) {
                console.error("Full token refresh failed:", consentError);
                showToast(_('errorSessionExpired'));
                handleSignoutClick(); // If this also fails, then sign out.
                return;
            }
        }
    }
    
    // 5. We have a valid token, now initialize GAPI client
    authToken = tokenData; // Set global authToken
    await new Promise(resolve => gapi.load('client', resolve));
    await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
    gapi.client.setToken({ access_token: authToken.access_token });
    // console.log("GAPI client initialized for Drive API.");
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
            // errorFolderIdInvalid: 'Folder ID is invalid or empty.',
            errorFolderIdMissing: 'Folder ID not provided. File loading stopped.',
            errorTokenMissing: 'Access token not available. Please log in again.',
            errorSessionExpired: 'Your session has expired. Please log in again.',
            errorCopyFailed: 'Failed to copy content.',
            errorNoteParse: "Error parsing JSON content.",
            errorNoteFieldMissing: "Error: 'notetxt' field not found.",
            errorInvalidFolderIdSession: 'Invalid Folder ID. Please sign out and sign in again.',
            errorFolderNotFound: "The main folder multinotes_data was not found. Please check Google Drive.",
            warningInvalidBoard: 'Warning: One or more board files are invalid and have been skipped.',
            // promptFolderId: 'Please enter the Google Drive Folder ID:',
            // folderIdInputPlaceholder: 'Google Drive Folder ID',
            zoomLabel: 'Zoom:',
            calendar: 'Calendar',
            settingsTitle: 'Settings',
            reminder: 'Reminders',
            // folderIdDeleted: 'Folder ID has been deleted.',
            startBoardLabel: 'Start Board:',
            settingSaved: 'Setting saved!',
            submitButton: 'Confirm',
            allBoardsCtrlClickTooltip: 'Ctrl-click for all',
            noteFontSizeLabel: 'Note Font Size:',
            modalFontSizeLabel: 'Modal Font Size:',
            closeButton: 'Close'
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
            // errorFolderIdInvalid: 'Folder ID е невалиден или празен.',
            errorFolderIdMissing: 'Не е въведен ID. Зареждането на файлове е спряно.',
            errorTokenMissing: 'Няма достъпен токен. Моля, влезте отново.',
            errorSessionExpired: 'Вашата сесия е изтекла. Моля, влезте отново.',
            errorCopyFailed: 'Неуспешно копиране на съдържанието.',
            errorNoteParse: "Грешка при парсване на JSON съдържание.",
            errorFolderNotFound: "Основната папка multinotes_data не е намерена. Моля, проверете в Google Drive.",
            errorInvalidFolderIdSession: 'Невалиден Folder ID. Моля, излезте и влезте отново.',
            errorNoteFieldMissing: "Грешка: липсва поле \'notetxt\'.",
            warningInvalidBoard: 'Внимание: Един или повече файлове за дефиниция на бордове са невалидни и бяха пропуснати.',
            // promptFolderId: 'Моля, въведете ID на папката в Google Drive:',
            // folderIdInputPlaceholder: 'Въведете Google Drive Folder ID',
            // folderIdDeleted: 'Folder ID е изтрит.',
            zoomLabel: 'Мащаб:',
            calendar: 'Календар',
            settingsTitle: 'Настройки',
            reminder: 'Напомняния',
            submitButton: 'Потвърди',
            startBoardLabel: 'Стартов борд:',
            settingSaved: 'Настройката е запазена!',
            closeButton: 'Затвори',
            allBoardsCtrlClickTooltip: 'Ctrl-клик за всички',
            noteFontSizeLabel: 'Размер шрифт (бележка):',
            modalFontSizeLabel: 'Размер шрифт (преглед):'
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

    function showMessagePopup(message, showInput = false) {
        folderIdPromptPopup = document.getElementById('folderIdPromptPopup');
        folderIdInput = document.getElementById('folderIdInput');
        submitFolderIdBtn = document.getElementById('submitFolderIdBtn');

        document.querySelector('#folderIdPromptPopup p').textContent = message;

        if (showInput) {
            folderIdInput.style.display = 'block';
            submitFolderIdBtn.textContent = _('submitButton');
            folderIdInput.value = '';
            folderIdInput.focus();
        } else {
            folderIdInput.style.display = 'none';
            submitFolderIdBtn.textContent = 'OK';
        }

        folderIdPromptPopup.classList.add('show');
    }

    function hideFolderIdPrompt() {
        if (folderIdPromptPopup) {
            folderIdPromptPopup.classList.remove('show');
        }
    }

    function handleSubmitFolderId() {
        // If input is not visible, just close the popup
        if (folderIdInput.style.display === 'none') {
            hideFolderIdPrompt();
            return;
        }
        folderIdPromptPopup.classList.remove('show');
    }

    // --- Constants ---
    const eyeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
    const eyeOffIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><path d="M3 3l18 18"></path></svg>`;
    const calendarIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="5" width="16" height="16" rx="2" /><line x1="16" y1="3" x2="16" y2="7" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="4" y1="11" x2="20" y2="11" /></svg>`;
    const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" /></svg>`;
    const boardIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="black" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="12" y1="4" x2="12" y2="20" /></svg>`;
    const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21V3M5 10l7-7 7 7"/></svg>`;
    const settingsIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" /><circle cx="12" cy="12" r="3" /></svg>`;
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
    let maxWidthForButtons = 0; // Store max width for modal use
    let currentCalendarDate = new Date();
    let folderIds = {};
    let signoutButton, reloadButton, settingsButton, notesContainer, contentModal, modalBody, copyBtn, boardsButton, boardsModal, scrollTopBtn, searchBox, loaderContainer, loaderText, zoomInput;
    const boardsNoteBgnd = '#cfe6f8';

    // --- App Initialization ---
    startApp();

    function initApp() {
        signoutButton = document.getElementById('signout_button');
        reloadButton = document.getElementById('reload_button');
        settingsButton = document.getElementById('settings_button');
        settingsButton.innerHTML = settingsIconSvg;
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
        settingsButton.addEventListener('click', () => {
            document.getElementById('settings-modal').classList.add('visible');
        });
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
        // Prevent clicks inside the content modal from propagating to the underlying notes
        contentModal.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Apply initial font size settings from localStorage
        const initialNoteFontSize = localStorage.getItem('noteFontSize') || 12;
        document.documentElement.style.setProperty('--note-font-size', `${initialNoteFontSize}px`);

        const initialModalFontSize = localStorage.getItem('modalFontSize') || 12;
        modalBody.style.fontSize = `${initialModalFontSize}px`;

        // Add a listener to reset the modal font size when it's closed,
        // as it might be changed by other parts of the app (like formatText).
        contentModal.addEventListener('transitionend', () => {
            if (!contentModal.classList.contains('visible')) {
                modalBody.style.fontSize = `${localStorage.getItem('modalFontSize') || 12}px`;
            }
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
        let rawContent, formatString, displayContent, noteColor;
        if (typeof options === 'string') {
            rawContent = options;
            formatString = null;
            noteColor = null; // Default color for simple string content
        } else {
            rawContent = options.raw;
            formatString = options.format;
            noteColor = options.color;
        }
        currentModalContent = rawContent;

        // For notes with a preview (pass: true), the '|' is a separator.
        // For the full view in the modal, we want to show the entire content,
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
            const link = document.createElement('a');
            link.textContent = text;
            link.href = '#';
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
                if (board.status === 1) link.style.color = 'red';
                modalContent.appendChild(link);
            }
        });

        modalBody.innerHTML = '';
        modalBody.appendChild(modalContent);

        const modalBox = contentModal.querySelector('.modal-content-box');

        if (anchorElement) {
            const rect = anchorElement.getBoundingClientRect();
            contentModal.classList.add('popup-mode'); // Use a class to change positioning behavior
            modalBox.style.top = `${rect.bottom + 5}px`; // Position below the button
            modalBox.style.left = `${rect.left}px`;
            modalBox.style.transform = 'none'; // Override centering transform
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
            // Reset to default placeholder for 'all' and 'calendar'
            searchInput.placeholder = _('searchPlaceholder');
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
            showMessagePopup(_('errorInvalidFolderIdSession'));
            throw new Error("Invalid Folder ID provided to fetchFiles.");
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
        allNotesData = [];
        let mediaData = [];
        let boardsNoteElement = null; // Will hold the boards note element until the end 
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

        // Fix: Remove the old boards note from the header if it exists to prevent duplication on reload
        const oldBoardsNote = document.querySelector('header .boards-note');
        if (oldBoardsNote) {
            oldBoardsNote.remove();
        }
        try {
            let folderId = folderIdFromPrompt;
            if (!folderId) {
                folderId = await getFolderID();
            }
            if (!folderId) {
                showMessagePopup(_('errorFolderNotFound'));
                throw new Error("Main folder ID not found.");
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
                // Create the boards note but don't append it yet
                boardsNote.className = 'note boards-note';
                // Title element is removed for a cleaner look.
                // The note counter is now created and appended to the footer below.
                const contentWrapper = document.createElement('div');
                contentWrapper.className = 'note-content';
                contentWrapper.style.minHeight = '0';
                const contentEl = document.createElement('div');
                contentEl.className = 'board-menu-container';
                
                const zoomValueDisplay = document.createElement('span');
                zoomValueDisplay.id = 'zoom-value-display';
                // --- Zoom Modal Content ---
                const zoomModalBody = document.getElementById('settings-modal-body');
                zoomModalBody.innerHTML = ''; 
                const zoomControlWrapper = document.createElement('div');
                zoomControlWrapper.className = 'zoom-control-wrapper';
                const zoomLabel = document.createElement('label');
                zoomLabel.textContent = _('zoomLabel');
                zoomLabel.htmlFor = 'scaleSlider';
                zoomLabel.style.marginRight = '10px';
                const sliderContainer = document.createElement('div');
                sliderContainer.className = 'slider-container';
                sliderContainer.innerHTML = `<input type="range" id="scaleSlider" min="25" max="175" value="100"><input type="number" id="scaleInput" min="25" max="175" class="zoom-input-number"><span>%</span>`;
                const applyBtn = document.createElement('button');
                applyBtn.className = 'zoom-btn';
                applyBtn.textContent = _('submitButton');
                applyBtn.style.marginLeft = '10px';
                applyBtn.addEventListener('click', () => {
                    document.getElementById('settings-modal').classList.remove('visible');
                });
                zoomControlWrapper.appendChild(zoomLabel);
                zoomControlWrapper.appendChild(sliderContainer);
                zoomControlWrapper.appendChild(applyBtn);
                zoomModalBody.appendChild(zoomControlWrapper);

                // --- Start Board Setting ---
                const startBoardWrapper = document.createElement('div');
                startBoardWrapper.className = 'zoom-control-wrapper';
                startBoardWrapper.style.marginTop = '20px';

                const startBoardLabel = document.createElement('label');
                startBoardLabel.textContent = _('startBoardLabel');
                startBoardLabel.style.marginRight = '10px';

                const startBoardSelect = document.createElement('select');
                startBoardSelect.id = 'start-board-select';
                startBoardSelect.className = 'start-board-select';

                // Add default options
                startBoardSelect.innerHTML = `
                    <option value="all">${_('allBoards')}</option>
                    <option value="calendar">${_('calendar')}</option>
                    <option value="reminder">${_('reminder')}</option>
                `;

                // Add boards from boardsData
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

                startBoardWrapper.appendChild(startBoardLabel);
                startBoardWrapper.appendChild(startBoardSelect);
                zoomModalBody.appendChild(startBoardWrapper);

                // --- Close Button ---
                const closeBtnWrapper = document.createElement('div');
                closeBtnWrapper.className = 'settings-close-btn-wrapper';
                const closeBtn = document.createElement('button');
                closeBtn.className = 'zoom-btn settings-close-btn'; // Add a specific class for styling
                closeBtn.textContent = _('closeButton');
                closeBtn.addEventListener('click', () => {
                    document.getElementById('settings-modal').classList.remove('visible');
                });
                closeBtnWrapper.appendChild(closeBtn);
                // Append the button wrapper to the modal content box, not the scrollable body
                zoomModalBody.parentNode.appendChild(closeBtnWrapper);

                const slider = sliderContainer.querySelector('#scaleSlider');
                const scaleInput = sliderContainer.querySelector('#scaleInput');
                const updateZoom = (value) => {
                    value = Math.max(25, Math.min(175, parseInt(value, 10))); // Clamp value
                    if (isNaN(value)) value = 100;

                    notesContainer.style.zoom = value / 100;
                    zoomValueDisplay.textContent = ` ${value}%`;
                    // Sync slider and input field
                    slider.value = value;
                    scaleInput.value = value;
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
                scaleInput.addEventListener('change', () => { // Use 'change' to update when user finishes editing
                    const zoomValue = scaleInput.value;
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

                // --- Font Size Settings ---
                const createFontSizeInput = (id, labelKey, storageKey, defaultValue, targetUpdate) => {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'zoom-control-wrapper';
                    wrapper.style.marginTop = '15px';

                    const label = document.createElement('label');
                    label.textContent = _(labelKey);
                    label.style.marginRight = '10px';
                    label.style.flexBasis = '200px'; // Adjusted basis for longer labels
                    label.style.flexShrink = '0'; // Prevent label from shrinking
                    label.style.textAlign = 'left';

                    const select = document.createElement('select');
                    select.id = id;
                    select.className = 'zoom-input-select'; // New class for styling
                    select.style.width = '80px'; // Explicit width for consistency
                    select.style.margin = '0 2px 0 10px'; // Match number input margin
                    select.style.flexShrink = '0'; // Prevent select from shrinking

                    const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24];
                    fontSizes.forEach(size => {
                        const option = document.createElement('option');
                        option.value = size;
                        option.textContent = `${size}px`;
                        select.appendChild(option);
                    });
                    select.value = localStorage.getItem(storageKey) || defaultValue; // Set selected value

                    select.addEventListener('change', () => {
                        const value = select.value;
                        localStorage.setItem(storageKey, value);
                        targetUpdate(value);
                        showToast(_('settingSaved'), 2000);
                    });

                    wrapper.appendChild(label);
                    wrapper.appendChild(select); // Append select instead of input
                    return wrapper;
                };

                zoomModalBody.appendChild(createFontSizeInput('note-font-size-input', 'noteFontSizeLabel', 'noteFontSize', 12, (val) => document.documentElement.style.setProperty('--note-font-size', `${val}px`)));
                zoomModalBody.appendChild(createFontSizeInput('modal-font-size-input', 'modalFontSizeLabel', 'modalFontSize', 12, (val) => modalBody.style.fontSize = `${val}px`));

                if (boardParseError) {
                    const errorEl = document.createElement('div');
                    errorEl.style.color = 'red';
                    errorEl.style.marginTop = '10px';
                    errorEl.textContent = _('warningInvalidBoard');
                    contentEl.appendChild(errorEl);
                }
                contentWrapper.appendChild(contentEl);
                boardsNote.appendChild(contentWrapper);
                
                // --- Corrected Logic for Button Sizing and Scrolling ---

                // 1. Create all button elements and store them in an array
                const allButtonLinks = [];

                const allBoardsLink = document.createElement('span');
                allBoardsLink.classList.add('board-filter-link', 'all-boards-filter-btn');
                allBoardsLink.dataset.boardid = 'all';
                allBoardsLink.title = _('allBoardsCtrlClickTooltip'); // Set the title directly

                const allBoardsText = document.createElement('span');
                allBoardsText.textContent = _('allBoards');
                const allBoardsIcon = document.createElement('span');
                allBoardsIcon.innerHTML = boardIconSvg;
                allBoardsIcon.classList.add('board-icon-in-button');
                allBoardsLink.appendChild(allBoardsText);
                allBoardsLink.appendChild(allBoardsIcon);

                let longPressTimer;
                let isLongPress = false;

                const startPress = (e) => {
                    e.preventDefault(); // Prevent context menu on mobile
                    isLongPress = false;
                    longPressTimer = setTimeout(() => {
                        isLongPress = true;
                        showAllBoardsModal(allBoardsLink);
                    }, 500); // 500ms for a long press
                };

                const endPress = () => {
                    clearTimeout(longPressTimer);
                };

                // Desktop and Mobile event listeners
                allBoardsLink.addEventListener('mousedown', startPress);
                allBoardsLink.addEventListener('mouseup', endPress);
                allBoardsLink.addEventListener('mouseleave', endPress); // Cancel if mouse leaves
                allBoardsLink.addEventListener('touchstart', startPress);
                allBoardsLink.addEventListener('touchend', endPress);
                allBoardsLink.addEventListener('touchmove', endPress); // Cancel on scroll

                allBoardsLink.addEventListener('click', (e) => { 
                    e.preventDefault(); 
                    if (isLongPress) return; // Don't trigger click after a long press

                    if (e.ctrlKey) { // Keep Ctrl+Click for desktop
                        showAllBoardsModal(allBoardsLink);
                    } else {
                        filterNotesByBoard('all'); 
                    }
                });
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
                    if (board.status === 1) link.style.color = 'red';
                    link.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (e.ctrlKey) { showModal(JSON.stringify(board, null, 2)); } 
                        else { e.preventDefault(); filterNotesByBoard(board.gdid); }
                    });
                    allButtonLinks.push(link);
                });

                // 2. Measure max width using a temporary container
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
                maxWidthForButtons += 10; // Reverted to smaller padding

                // 3. Apply width and append to the actual container
                allButtonLinks.forEach(link => {
                    link.style.width = `${maxWidthForButtons}px`;
                    contentEl.appendChild(link);
                });

                // 4. Create and add scroll arrows
                const scrollWrapper = document.createElement('div');
                scrollWrapper.className = 'scrolling-menu-wrapper';
                const leftArrow = document.createElement('button');
                leftArrow.className = 'scroll-arrow left-arrow';
                leftArrow.innerHTML = `<svg width="24" height="24"><use href="#icon-arrow-left"></use></svg>`;
                const rightArrow = document.createElement('button');
                rightArrow.className = 'scroll-arrow right-arrow';
                rightArrow.innerHTML = `<svg width="24" height="24"><use href="#icon-arrow-right"></use></svg>`;
                
                leftArrow.onclick = () => { contentEl.scrollLeft -= (maxWidthForButtons + 5); };
                rightArrow.onclick = () => { contentEl.scrollLeft += (maxWidthForButtons + 5); };

                scrollWrapper.appendChild(leftArrow);
                scrollWrapper.appendChild(contentEl);
                scrollWrapper.appendChild(rightArrow);
                contentWrapper.appendChild(scrollWrapper);
                
                // 5. Show/hide arrows based on scroll
                const checkScroll = () => {
                    leftArrow.classList.toggle('visible', contentEl.scrollLeft > 0);
                    rightArrow.classList.toggle('visible', contentEl.scrollWidth > contentEl.clientWidth && contentEl.scrollLeft < contentEl.scrollWidth - contentEl.clientWidth - 1);
                };
                contentEl.addEventListener('scroll', checkScroll);
                new ResizeObserver(checkScroll).observe(contentEl); // Re-check on resize
                
                boardsNoteElement = boardsNote;
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
                let extraData = {};
                try {
                    // Store raw data for calendar view
                    const rawNoteData = {
                        file: file,
                        content: JSON.parse(res.body)
                    };
                    allNotesData.push(rawNoteData);

                    const content = JSON.parse(res.body);
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
                            note.style.backgroundColor = `var(--note-bg-${noteColor})`;
                        }
                        // Check for status field here
                        if (extraData.status === 1) {
                            return; // Skip this note if status is 1
                        }
                    } else { fileContent = _('errorNoteFieldMissing'); }
                } catch (e) { fileContent = _('errorNoteParse'); }
                notesCount++;
                
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
                        // Fallback for type 1 notes without a pipe: use first line as title
                        noteTitle = fileContent.split('\n')[0].substring(0, 50);
                    }
                } else if (!isHiddenNote) {
                    // Default title logic for regular notes
                    const lines = fileContent.split('\n');
                    for (const line of lines) {
                        const trimmedLine = line.trim();
                        if (trimmedLine) {
                            noteTitle = trimmedLine.substring(0, 50);
                            break;
                        }
                    }
                }

                if (!noteTitle && !isHiddenNote) { noteTitle = file.name; }

                const titleEl = document.createElement('h3');
                titleEl.textContent = noteTitle;
                titleEl.title = noteTitle;

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
                if (!isHiddenNote) { // Attachments should only show for non-hidden notes in the main view
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
                                        const eyeButton = document.createElement('button');
                                        eyeButton.className = 'view-button';
                                        eyeButton.innerHTML = eyeIconSvg;
                                        attachmentWrapper.appendChild(eyeButton);
                                        attachmentWrapper.appendChild(link);
                                        eyeButton.addEventListener('click', async (e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            const noteEl = attachmentWrapper.closest('.note');
                                            if (!noteEl || noteEl.querySelector('.image-preview-overlay')) {
                                                return;
                                            }
                                            const titleEl = noteEl.querySelector('h3');
                                            if (!fileId) {
                                                showToast('Image file not found for preview.');
                                                return;
                                            }
                                            try {
                                                const fileMetadata = await gapi.client.drive.files.get({
                                                    fileId: fileId,
                                                    fields: 'thumbnailLink'
                                                });
                                                const thumbnailUrl = fileMetadata.result.thumbnailLink;
                                                if (thumbnailUrl) {
                                                    if (titleEl) titleEl.style.visibility = 'hidden';
                                                    const overlay = document.createElement('div');
                                                    overlay.className = 'image-preview-overlay';
                                                    Object.assign(overlay.style, {
                                                        position: 'absolute',
                                                        top: '0', left: '0',
                                                        width: '100%', height: '100%',
                                                        backgroundColor: 'rgba(0,0,0,0.85)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        zIndex: '10',
                                                        borderRadius: '8px'
                                                    });
                                                    overlay.addEventListener('click', () => {
                                                        window.open(link.href, '_blank');
                                                    });
                                                    const img = document.createElement('img');
                                                    img.src = thumbnailUrl.replace(/=s\d+/, '=s1600');
                                                    Object.assign(img.style, {
                                                        maxWidth: '100%',
                                                        maxHeight: '100%',
                                                        objectFit: 'contain',
                                                        padding: '10px',
                                                        boxSizing: 'border-box'
                                                    });
                                                    overlay.appendChild(img);
                                                    const closeButton = document.createElement('button');
                                                    closeButton.className = 'view-button';
                                                    closeButton.innerHTML = eyeOffIconSvg;
                                                    Object.assign(closeButton.style, {
                                                        position: 'absolute',
                                                        top: '10px',
                                                        right: '10px',
                                                    });
                                                    const svg = closeButton.querySelector('svg');
                                                    if(svg) svg.style.stroke = 'white';
                                                    closeButton.addEventListener('click', (ev) => {
                                                        ev.stopPropagation();
                                                        overlay.remove();
                                                        if (titleEl) titleEl.style.visibility = 'visible';
                                                    });
                                                    overlay.appendChild(closeButton);
                                                    noteEl.appendChild(overlay);
                                                } else {
                                                    showToast('No preview available for this image.');
                                                }
                                            } catch (err) {
                                                console.error('Error fetching image preview:', err);
                                                showToast('Error loading image preview: ' + (err.message || err));
                                            }
                                        });
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
                                        const eyeButton = document.createElement('button');
                                        eyeButton.className = 'view-button';
                                        eyeButton.innerHTML = eyeIconSvg;
                                        attachmentWrapper.appendChild(eyeButton);
                                        attachmentWrapper.appendChild(textContainer);
                                        eyeButton.addEventListener('click', async (e) => {
                                            e.stopPropagation();
                                            e.preventDefault();
                                            const noteEl = attachmentWrapper.closest('.note');
                                            if (!noteEl || noteEl.querySelector('.image-preview-overlay')) {
                                                return;
                                            }
                                            const titleEl = noteEl.querySelector('h3');
                                            if (!fileId) {
                                                showToast('Video file not found for preview.');
                                                return;
                                            }
                                            try {
                                                const fileMetadata = await gapi.client.drive.files.get({
                                                    fileId: fileId,
                                                    fields: 'thumbnailLink'
                                                });
                                                const thumbnailUrl = fileMetadata.result.thumbnailLink;
                                                if (thumbnailUrl) {
                                                    if (titleEl) titleEl.style.visibility = 'hidden';
                                                    const overlay = document.createElement('div');
                                                    overlay.className = 'image-preview-overlay';
                                                    Object.assign(overlay.style, {
                                                        position: 'absolute',
                                                        top: '0', left: '0',
                                                        width: '100%', height: '100%',
                                                        backgroundColor: 'rgba(0,0,0,0.85)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        zIndex: '10',
                                                        borderRadius: '8px'
                                                    });
                                                    overlay.addEventListener('click', () => {
                                                        window.open(link.href, '_blank');
                                                    });
                                                    const img = document.createElement('img');
                                                    img.src = thumbnailUrl.replace(/=s\d+/, '=s1600');
                                                    Object.assign(img.style, {
                                                        maxWidth: '100%',
                                                        maxHeight: '100%',
                                                        objectFit: 'contain',
                                                        padding: '10px',
                                                        boxSizing: 'border-box'
                                                    });
                                                    overlay.appendChild(img);
                                                    const closeButton = document.createElement('button');
                                                    closeButton.className = 'view-button';
                                                    closeButton.innerHTML = eyeOffIconSvg;
                                                    Object.assign(closeButton.style, {
                                                        position: 'absolute',
                                                        top: '10px',
                                                        right: '10px',
                                                    });
                                                    const svg = closeButton.querySelector('svg');
                                                    if(svg) svg.style.stroke = 'white';
                                                    closeButton.addEventListener('click', (ev) => {
                                                        ev.stopPropagation();
                                                        overlay.remove();
                                                        if (titleEl) titleEl.style.visibility = 'visible';
                                                    });
                                                    overlay.appendChild(closeButton);
                                                    noteEl.appendChild(overlay);
                                                } else {
                                                    showToast('No preview available for this video.');
                                                }
                                            } catch (err) {
                                                console.error('Error fetching video preview:', err);
                                                showToast('Error loading video preview: ' + (err.message || err));
                                            }
                                        });
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
                                boardDisplay.addEventListener('click', (e) => {
                                    e.stopPropagation(); // Prevent click from propagating to the note itself
                                    const parentNote = boardDisplay.closest('.note');
                                    if (parentNote && parentNote.dataset.extraInfo) {
                                        try {
                                            const extraInfoData = JSON.parse(parentNote.dataset.extraInfo);
                                            // Pass the note's color to the modal
                                            showModal({ raw: JSON.stringify(extraInfoData, null, 2), color: window.getComputedStyle(parentNote).backgroundColor });
                                        } catch (e) {
                                            console.error('Error parsing data-extra-info:', e);
                                            showToast('Error displaying extra info.');
                                        }
                                    }
                                });
                            }
                        }
                        // Use calendarDate if available, otherwise fallback to datemod
                        const dateToShow = extraData.calendarDate || extraData.datemod;
                        if (dateToShow) {
                            const dateDisplay = document.createElement('div');
                            dateDisplay.className = 'date-display';
                            dateDisplay.innerHTML = calendarIconSvg;
                            const dateText = document.createElement('span');
                            dateText.textContent = formatDate(dateToShow);
                            dateDisplay.appendChild(dateText);
                            footerLeft.appendChild(dateDisplay);
                            dateDisplay.addEventListener('click', () => {
                                const parentNote = dateDisplay.closest('.note');
                                try {
                                    const content = JSON.parse(res.body);
                                    showModal({ raw: JSON.stringify(content, null, 2), color: window.getComputedStyle(parentNote).backgroundColor });
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
                    viewButton.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const noteEl = e.currentTarget.closest('.note');
                        showModal({ raw: fileContent, format: textSpan, color: window.getComputedStyle(noteEl).backgroundColor });
                    });
                    footerRight.appendChild(viewButton);
                    footerEl.appendChild(footerRight);
                }
                note.addEventListener('click', (e) => {
                    const noteEl = e.currentTarget;
                    // Check if the click target is not an interactive element within the note's footer.
                    // This prevents the modal from opening if a child element with its own click handler was clicked.
                    if (!e.target.closest('.note-footer')) {
                        showModal({ raw: fileContent, format: textSpan, color: window.getComputedStyle(noteEl).backgroundColor });
                    }
                });
                note.appendChild(titleEl);
                note.appendChild(contentEl);
                note.appendChild(footerEl);
                notesContainer.appendChild(note);
            }));

            // Now, prepend the boards note if it was created
            if (boardsNoteElement) {
                // Append the boards note to the header for natural sticky positioning
                document.querySelector('header').appendChild(boardsNoteElement);
            }

            filterNotesByBoard(localStorage.getItem('startBoard') || 'all');

            const counterEl = document.getElementById('note-counter');
            if (counterEl) {
                counterEl.textContent = notesCount;
            }
        } catch (err) {
            console.error("Error loading files:", err);
            showToast(err.message || _('errorProcessingFiles'));
        } finally {
            loaderContainer.style.display = 'none';
            // Explicitly set the default background after everything is loaded
            // to ensure consistency and prevent flickering.
            document.body.style.backgroundImage = `url('Board.png')`;
            notesContainer.style.backgroundImage = `url('Board.png')`;
            currentBackground = 'Board.png';
        }
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

        // Grid
        const calendarGrid = document.createElement('div');
        calendarGrid.className = 'calendar-grid';

        // Day names header
        const days = currentLang === 'bg' ? ['Понеделник', 'Вторник', 'Сряда', 'Четвъртък', 'Петък', 'Събота', 'Неделя'] : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        days.forEach((day, index) => {
            const dayEl = document.createElement('div');
            dayEl.className = 'calendar-day-name';
            dayEl.textContent = day;
            // index 5 is Saturday, 6 is Sunday
            if (index >= 5) {
                dayEl.classList.add('weekend-day');
            }
            calendarGrid.appendChild(dayEl);
        });

        // Get today's date components for comparison
        const today = new Date();
        const todayDate = today.getDate();
        const todayMonth = today.getMonth();
        const todayYear = today.getFullYear();
        const firstDayOfMonth = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        let startingDay = firstDayOfMonth.getDay(); // 0=Sun, 1=Mon...
        if (startingDay === 0) startingDay = 7; // Make Sunday 7

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
            cell.appendChild(notesForDayContainer);

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

                        let contentToShow = '...';
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

            calendarGrid.appendChild(cell);
        }

        calendarContainer.appendChild(calendarGrid);

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

    function processCodeAndLinks(text) {
        if (!text) return '';
        const codeBlocks = [];
        const codeTagRegex = /\[code\]([\s\S]*?)\[\/code\]/g;
            const textWithoutCode = text.replace(codeTagRegex, (match, code) => {
            codeBlocks.push(escapeHtml(code));
            return '%%CODE_BLOCK%%';
        });
        let linkifiedText = linkifyText(textWithoutCode);
        codeBlocks.forEach(block => {
            linkifiedText = linkifiedText.replace('%%CODE_BLOCK%%', '<pre><code>' + block + '</code></pre>');
        });
        return linkifiedText;
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
        const codeTagRegex = /\[code\]([\s\S]*?)\[\/code\]/g;
            const textWithoutCode = text.replace(codeTagRegex, (match, code) => {
            codeBlocks.push(escapeHtml(code));
            return '%%CODE_BLOCK%%';
        });
        const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%?=~_|])/ig;
        let html = textWithoutCode.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
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
