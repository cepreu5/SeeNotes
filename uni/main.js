// terser main.js --compress --mangle --toplevel --output mainn.js

// =================================================================================
// I. ГЛОБАЛНИ ПРОМЕНЛИВИ И КОНСТАНТИ
// =================================================================================

// --- Конфигурация и версия ---
const CLIENT_ID = '1090128984423-80074rvs8n45v787044d9ca1bvahla98.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const version = '0.7'; // App version

// --- Глобално състояние на приложението ---
let allNotesData = []; // Съхранява всички бележки за календара
let boardsData = []; // Съхранява данните за бордовете
let mediaData = []; // Съхранява данните за медия
let folderIds = {}; // Съхранява ID-тата на папките за медия
let currentBoardFilter = 'all';
let currentBackground = 'Board.png';
let currentCalendarDate = new Date();
let authToken = null;
let tokenClient;
let dirHandle = null; // За локален достъп до файловата система

// --- Състояние на търсенето ---
let searchMode = 'title';
let lastSearchTerm = "";
let savedSearches = [];
let maxSavedSearches = 20;

// --- Състояние на UI ---
let currentModalContent = '';
let maxWidthForButtons = 0; // За менюто с бордове
let toastTimeout, isShowingToast = false;

// --- DOM елементи (ще бъдат инициализирани в initApp) ---
let signoutButton, reloadButton, settingsButton, notesContainer, contentModal, modalBody, copyBtn, scrollTopBtn, searchBox, loaderContainer, loaderText, searchModeToggle, saveSearchBtn;
let folderIdPromptPopup, folderIdInput, submitFolderIdBtn;

// --- IndexedDB Конфигурация ---
const NOTES_DB_NAME = 'NotesDB';
const BOARD_STORE_NAME = 'boards';
const MEDIA_STORE_NAME = 'media';
const NOTE_STORE_NAME = 'notes';
const CONFIG_STORE_NAME = 'config';
const NOTES_DB_VERSION = 3;

// --- SVG икони ---
const eyeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const eyeOffIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><path d="M3 3l18 18"></path></svg>`;
const calendarIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="5" width="16" height="16" rx="2" /><line x1="16" y1="3" x2="16" y2="7" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="4" y1="11" x2="20" y2="11" /></svg>`;
const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" /></svg>`;
const boardIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="black" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="12" y1="4" x2="12" y2="20" /></svg>`;
const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21V3M5 10l7-7 7 7"/></svg>`;
const settingsIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z" /><circle cx="12" cy="12" r="3" /></svg>`;
const noteIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M13 20l7 -7" /><path d="M13 20v-6a1 1 0 0 1 1 -1h6v-7a2 2 0 0 0 -2 -2h-12a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7" /></svg>`;
const clockIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" /></svg>`;
const lockIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
const attachmentIcons = [
    { type: 1, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6l1.5-2h3L15 6"/><circle cx="12" cy="13" r="3"/></svg>` },
    { type: 2, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24" ><circle cx="7" cy="12" r="4" /><circle cx="17" cy="12" r="4"/><line x1="6" y1="16" x2="18" y2="16" stroke="black" stroke-width="1" /></svg>` },
    { type: 3, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 2v6h6"/></svg>` },
    { type: 4, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>` },
    { type: 5, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>` },
    { type: 6, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="10" r="2"/><path d="M8 16c0-1.33 2.67-2 4-2s4 .67 4 2"/></svg>` }
];

// --- I18N ---
const translations = {
        en: {
            appTitle: 'CX MultiNotes Viewer',
            searchPlaceholder: 'Search', 
            reloadButtonTooltip: 'Reload',
            signoutButtonTooltip: 'Sign Out',
            copyTooltip: 'Copy content',
            topTooltip: 'Go to top',
            allBoards: 'All',
            boardsTitle: 'Boards',
            viewFullContent: 'View full content',
            loadingFile: 'Loading...', 
            of: 'of',
            noFilesFound: 'No text files found in the folder.',
            skippedFileScan: 'Skipped DB update. Loading from DB...',
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
            confirmCreateDbYes: 'Yes',
            confirmCreateDbNo: 'No',
            // promptFolderId: 'Please enter the Google Drive Folder ID:',
            // folderIdInputPlaceholder: 'Google Drive Folder ID',
            zoomLabel: 'Zoom:',
            calendar: 'Calendar',
            settingsTitle: 'Settings',
            reminder: 'Reminders',
            searchSavedTip: 'Save search',
            startBoardLabel: 'Start Board:',
            settingSaved: 'Setting saved!',
            submitButton: 'Confirm',
            searchSaved: 'Search saved',
            allBoardsCtrlClickTooltip: 'Ctrl-click for all',
            maxSearchesLabel: 'Saved Searches:',
            clearSearchesTooltip: 'Clear search history',
            noteFontSizeLabel: 'Note Font Size:',
            showDatemodLabel: 'Show modification date:',
            useLocalDbLabel: 'Local folder:',
            useGoogleDbLabel: 'Google Drive database:',
            updateIndexedDbLabel: 'update',
            updateFromGoogleDriveLabel: 'update only',
            localSyncFolderLabel: 'Local sync folder:',
            selectFolderButton: 'Select Folder',
            folderNotSelected: 'Not selected',
            modalFontSizeLabel: 'Modal Font Size:',
            closeButton: 'Close',
            searchByTitleTooltip: 'Search by Title',
            searchByContentTooltip: 'Search by Content',
            searchInTitles: 'in titles',
            searchInContent: 'in content',
            errorLocalFolderNotSelected: 'Local sync folder not selected. Please select one in Settings.',
            folderSelectedForSync: 'Folder \'{folderName}\' selected for local sync.',
            localDataLoaded: 'Local data loaded.',
            localDbUpdated: 'Local database updated from Google Drive.',
            errorGoogleLibs: 'Error loading Google libraries.',
            loadedFromLocalNoDrive: 'Loaded data from local storage. Could not connect to Google Drive.',
            imgNotFound: 'Image file not found for preview.',
            noImgPreview: 'No preview available for this image.',
            errorImgPreview: 'Error loading image preview: {error}',
            videoNotFound: 'Video file not found for preview.',
            noVideoPreview: 'No preview available for this video.',
            errorVideoPreview: 'Error loading video preview: {error}',
            errorOpenFile: 'Could not open local file: {filename}',
            errorFetchFolderIds: 'Error fetching folder IDs.',
            errorFetchFileId: 'Error fetching file ID for {fileName}.',
            confirmCreateLocalDb: 'Do you want to create a local database?',
            gdriveUpdatesFound: '{count} file(s) updated from Google Drive.',
            gdriveNoUpdates: 'No new updates from Google Drive.',
            localUpdatesFound: '{count} file(s) updated from local disk.',
            localNoUpdates: 'No new updates from local disk.'            
        },
        bg: {
            appTitle: 'CX MultiNotes Viewer',
            searchPlaceholder: 'Търсене', 
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
            skippedFileScan: 'Пропускане на обновяването. Зареждане от базата...',
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
            confirmCreateDbYes: 'Да',
            confirmCreateDbNo: 'Не',
            // promptFolderId: 'Моля, въведете ID на папката в Google Drive:',
            // folderIdInputPlaceholder: 'Въведете Google Drive Folder ID',
            searchSavedTip: 'Запомни търсенето',
            zoomLabel: 'Мащаб:',
            calendar: 'Календар',
            settingsTitle: 'Настройки',
            reminder: 'Напомняния',
            submitButton: 'Потвърди',
            startBoardLabel: 'Стартов борд:',
            settingSaved: 'Настройката е запазена!',
            searchSaved: 'Търсенето е запазено',
            closeButton: 'Затвори',
            allBoardsCtrlClickTooltip: 'Ctrl-клик за всички',
            maxSearchesLabel: 'Запазени търсения:',
            clearSearchesTooltip: 'Изчисти историята на търсенията',
            noteFontSizeLabel: 'Размер шрифт (бележка):',
            showDatemodLabel: 'Покажи дата на модификация:',
            useLocalDbLabel: 'Локална папка:',
            useGoogleDbLabel: 'Google Drive база:',
            updateIndexedDbLabel: 'обновяване',
            updateFromGoogleDriveLabel: 'само обновяване',
            localSyncFolderLabel: 'Папка за локална синхронизация:',
            selectFolderButton: 'Избери папка',
            folderNotSelected: 'Не е избрана',
            modalFontSizeLabel: 'Размер шрифт (преглед):',
            searchByTitleTooltip: 'Търсене в заглавията',
            searchByContentTooltip: 'Търсене в съдържанието',
            searchInTitles: 'в заглавията',
            searchInContent: 'в съдържанието',
            errorLocalFolderNotSelected: 'Папката за локална синхронизация не е избрана. Моля, изберете такава от Настройки.',
            folderSelectedForSync: 'Папка \'{folderName}\' е избрана за локална синхронизация.',
            localDataLoaded: 'Локалните данни са заредени.',
            localDbUpdated: 'Локалната база е обновена от Google Drive.',
            errorGoogleLibs: 'Грешка при зареждане на библиотеките на Google.',
            loadedFromLocalNoDrive: 'Заредени са данни от локалното хранилище. Няма връзка с Google Drive.',
            imgNotFound: 'Файлът с изображение не е намерен за преглед.',
            noImgPreview: 'Няма наличен преглед за това изображение.',
            errorImgPreview: 'Грешка при зареждане на преглед на изображение: {error}',
            videoNotFound: 'Видео файлът не е намерен за преглед.',
            noVideoPreview: 'Няма наличен преглед за това видео.',
            errorVideoPreview: 'Грешка при зареждане на преглед на видео: {error}',
            errorOpenFile: 'Неуспешно отваряне на локален файл: {filename}',
            errorFetchFolderIds: 'Грешка при извличане на ID-та на папки.',
            errorFetchFileId: 'Грешка при извличане на ID на файл за {fileName}.',
            confirmCreateLocalDb: 'Искате ли да се създаде локална база?',
            gdriveUpdatesFound: 'Обновени са {count} файла от Google Drive.',
            gdriveNoUpdates: 'Няма нови промени в Google Drive.',
            localUpdatesFound: 'Обновени са {count} файла от локалния диск.',
            localNoUpdates: 'Няма нови промени в локалния диск.'            
        }
    };
    let currentLang = localStorage.getItem('language') || 'bg';
    // --- Други константи ---
    const noteBackgrounds = [
        'wg1_1.png', // 0
        'wr1_1.png', // 1
        'wb1_1.png', // 2
        'wr1_1.png', // 3
        'wg1_1.png', // 4
        'wy1_1.png', // 5
        'wb1_1.png', // 6
        'wr1_1.png', // 7
        'wy1_1.png', // 8
        'stl1_1.png', // 9
        'stl2_1.png', // 10
        'stl3_1.png'  // 11
    ];

// =================================================================================
// II. ИНИЦИАЛИЗАЦИЯ НА ПРИЛОЖЕНИЕТО
// =================================================================================

// --- Основна стартова функция ---
async function startApp() {
    const tokenData = checkAuth();
    if (!tokenData) {
        return; // Спира, ако проверката за автентикация не успее/пренасочи
    }
    // Зарежда Google API скрипта преди да се използва gapi
    try {
        await loadScript('https://apis.google.com/js/api.js');
    } catch (error) {
        console.error("Failed to load Google API script", error);
        showToast("Error loading Google libraries.");
        return;
    }
    // Имаме валиден токен, инициализираме GAPI клиента
    authToken = tokenData; // Задаваме глобалния authToken
    await new Promise(resolve => gapi.load('client', resolve));
    await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
    gapi.client.setToken({ access_token: authToken.access_token });
    
    document.body.style.display = 'block';
    initApp();
    listFiles();
}

function _(key) {
    return translations[currentLang][key] || key;
}

function hideToast() {
    const toast = document.getElementById('toastNotification');
    if (toast.classList.contains('show')) {
        clearTimeout(toastTimeout);
        toast.classList.remove('show');
        isShowingToast = false;
    }
}

function showToast(message, duration = 10000) {
    if (isShowingToast) {
        hideToast();
        // Short delay to allow the hide animation to finish before showing the new one
        setTimeout(() => showToast(message, duration), 300);
        return;
    }
    isShowingToast = true;
    const toast = document.getElementById('toastNotification');
    toast.textContent = message;
    toast.classList.add('show');
    toastTimeout = setTimeout(hideToast, duration);
}

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
    // Logic for submitting the folder ID would go here
}

function showConfirmation(message) {
    return new Promise(resolve => {
        const popup = document.getElementById('folderIdPromptPopup');
        const messagePara = popup.querySelector('p');
        const okButton = document.getElementById('submitFolderIdBtn');
        const folderIdInput = document.getElementById('folderIdInput');
        
        let noButton = document.getElementById('prompt-no-btn');
        if (!noButton) {
            noButton = document.createElement('button');
            noButton.id = 'prompt-no-btn';
            noButton.className = 'zoom-btn settings-close-btn'; // Use classes from other buttons
            noButton.style.marginLeft = '10px';
            okButton.parentNode.appendChild(noButton);
        }

        messagePara.textContent = message;
        folderIdInput.style.display = 'none';
        okButton.textContent = _('confirmCreateDbYes');
        noButton.textContent = _('confirmCreateDbNo');
        noButton.style.display = 'inline-block';

        // Remove existing listener to avoid conflicts
        okButton.removeEventListener('click', handleSubmitFolderId);

        const cleanup = () => {
            popup.classList.remove('show');
            okButton.removeEventListener('click', onOk);
            noButton.removeEventListener('click', onNo);
            noButton.style.display = 'none';
            // Restore original listener
            okButton.addEventListener('click', handleSubmitFolderId);
        };

        const onOk = () => {
            cleanup();
            resolve(true);
        };

        const onNo = () => {
            cleanup();
            resolve(false);
        };

        okButton.addEventListener('click', onOk);
        noButton.addEventListener('click', onNo);

        popup.classList.add('show');
    });
}

function initApp() {
    // Инициализация на DOM елементи
    signoutButton = document.getElementById('signout_button');
    reloadButton = document.getElementById('reload_button');
    settingsButton = document.getElementById('settings_button');
    notesContainer = document.getElementById('notes-container');
    contentModal = document.getElementById('content-modal');
    modalBody = document.getElementById('modal-body');
    copyBtn = document.getElementById('copy-modal-btn');
    scrollTopBtn = document.getElementById("scrollTopBtn");
    searchBox = document.getElementById('search-box');
    loaderContainer = document.getElementById('loader-container');
    loaderText = document.getElementById('loader-text');

    // --- Add Title to Loader ---
    const loaderTitle = document.createElement('h3');
    loaderTitle.id = 'loader-title';
    loaderTitle.style.marginTop = '0';
    loaderTitle.style.marginBottom = '20px';
    loaderContainer.prepend(loaderTitle);

    // Настройване на UI и езикови настройки
    const toast = document.getElementById('toastNotification');
    toast.addEventListener('click', hideToast);

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
        updateSignoutTooltip();
    }

    function updateSignoutTooltip() {
        const email = sessionStorage.getItem('google_auth_email_hint');
        const signoutBtn = document.getElementById('signout_button');
        if (signoutBtn) {
            const baseTooltip = _('signoutButtonTooltip');
            if (email) {
                const username = email.split('@')[0];
                signoutBtn.title = `${baseTooltip} (${username})`;
            } else {
                signoutBtn.title = baseTooltip;
            }
        }
    }

        settingsButton.innerHTML = settingsIconSvg;
        scrollTopBtn.innerHTML = arrowSvg;
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
        // --- Search Box Enhancements ---
        const searchWrapper = document.getElementById('search-wrapper');
        searchModeToggle = document.createElement('button');
        searchModeToggle.innerHTML = boardIconSvg; // Icon for Title Search
        searchModeToggle.id = 'search-mode-toggle';
        searchModeToggle.className = 'search-mode-btn';
        searchModeToggle.title = _('searchByTitleTooltip');

        searchModeToggle.addEventListener('click', () => {
            if (searchMode === 'title') {
                searchMode = 'content';
                searchModeToggle.innerHTML = noteIconSvg; // Icon for Content Search
                searchModeToggle.title = _('searchByContentTooltip');
                searchBox.placeholder = `${_('searchPlaceholder')} ${_('searchInContent')}...`;
            } else {
                searchMode = 'title';
                searchModeToggle.innerHTML = boardIconSvg; // Icon for Title Search
                searchModeToggle.title = _('searchByTitleTooltip');
                searchBox.placeholder = `${_('searchPlaceholder')} ${_('searchInTitles')}...`;
            }
            applyFilters();
        });
        saveSearchBtn = document.createElement('span');
        saveSearchBtn.id = 'save-search-btn';
        saveSearchBtn.className = 'search-icon';
        saveSearchBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
        saveSearchBtn.style.display = 'none';
        saveSearchBtn.style.marginTop = '2px';
        saveSearchBtn.title = _('searchSavedTip');
        const savedSearchesPopup = document.createElement('div');
        savedSearchesPopup.id = 'saved-searches-popup';
        // Add all icons and popups to the wrapper
        searchWrapper.prepend(searchModeToggle);
        searchWrapper.appendChild(saveSearchBtn);
        searchWrapper.appendChild(savedSearchesPopup);
        // This function will be the single point for applying search and UI updates
        const triggerSearch = (isUserTyping = false) => {
            if (isUserTyping) {
                // Only update the "last search" if the input is not empty
                if (searchBox.value.trim() !== '') {
                    lastSearchTerm = searchBox.value;
                    localStorage.setItem('lastSearchTerm', lastSearchTerm);
                }
            }
            applyFilters(); // This just filters the notes
            saveSearchBtn.style.display = searchBox.value.trim() ? 'block' : 'none';
        };
        // Listen for user typing
        searchBox.addEventListener('input', (event) => {
            if (event.isTrusted) triggerSearch(true);
        });
        searchBox.addEventListener('focus', () => {
            if (savedSearches.length > 0) {
                renderSavedSearchesPopup(); // This will now just populate the div
                document.getElementById('saved-searches-popup').style.display = 'block';
            }
        });

        saveSearchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const searchTerm = searchBox.value.trim();
            if (searchTerm && !savedSearches.includes(searchTerm)) {
                saveSearchTerm(searchTerm);
                // Animate the save button instead of showing a toast
                saveSearchBtn.classList.add('saved-animation');
                setTimeout(() => saveSearchBtn.classList.remove('saved-animation'), 600);
                renderSavedSearchesPopup(); // Re-render to show the new term immediately
            }
        });
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
        // Apply initial state for datemod visibility
        const shouldHideDatemod = localStorage.getItem('showDatemod') === 'false';
        document.body.classList.toggle('hide-datemod', shouldHideDatemod);
        const initialModalFontSize = localStorage.getItem('modalFontSize') || 12;
        modalBody.style.fontSize = `${initialModalFontSize}px`;
        // Add a listener to reset the modal font size when it's closed,
        // as it might be changed by other parts of the app (like formatText).
        contentModal.addEventListener('transitionend', () => {
            if (!contentModal.classList.contains('visible')) {
                modalBody.style.fontSize = `${localStorage.getItem('modalFontSize') || 12}px`;
            }
        });
        // Load saved searches and settings from localStorage
        lastSearchTerm = localStorage.getItem('lastSearchTerm') || "";
        savedSearches = JSON.parse(localStorage.getItem('savedSearches') || '[]');
        maxSavedSearches = parseInt(localStorage.getItem('maxSavedSearches') || '20', 10);


        setLanguage(currentLang);
        updateSignoutTooltip();
        // Add app version to the settings modal title
        const settingsTitle = document.querySelector('#settings-modal .modal-content-box h3');
        if (settingsTitle) {
            settingsTitle.textContent += `${version}`;
        }
        // Set initial placeholder text correctly
        searchBox.placeholder = `${_('searchPlaceholder')} ${_('searchInTitles')}...`;
        // Hide saved searches popup when clicking outside
        document.addEventListener('click', (e) => {
            if (savedSearchesPopup.style.display === 'block' && !searchWrapper.contains(e.target)) {
                savedSearchesPopup.style.display = 'none';
            }
        });
    }

    function saveSearchTerm(term) {
        // Remove if it already exists to move it to the top
        const existingIndex = savedSearches.indexOf(term);
        if (existingIndex > -1) {
            savedSearches.splice(existingIndex, 1);
        }
        // Add to the beginning
        savedSearches.unshift(term);
        // Trim the array if it's too long
        if (maxSavedSearches > 0 && savedSearches.length > maxSavedSearches) {
            savedSearches.length = maxSavedSearches;
        } else if (maxSavedSearches === 0) {
            savedSearches = []; // If max is 0, clear the list
        }
        localStorage.setItem('savedSearches', JSON.stringify(savedSearches));
    }

    function renderSavedSearchesPopup() {
        const popup = document.getElementById('saved-searches-popup');
        popup.style.display = 'block';
        popup.innerHTML = ''; // Clear everything
        // Add corner dots for styling
        // popup.insertAdjacentHTML('beforeend', `<div class="corner-dot top-left"></div><div class="corner-dot top-right"></div><div class="corner-dot bottom-left"></div><div class="corner-dot bottom-right"></div>`);

        // Create a dedicated container for the scrollable items
        const contentContainer = document.createElement('div');
        contentContainer.className = 'saved-searches-content';
        popup.appendChild(contentContainer);
        // Combine last search with saved searches for display
        const allSearchesForDisplay = [lastSearchTerm, ...savedSearches];
        allSearchesForDisplay.forEach((term, index) => {
            if (index > 0 && !term) return; // Don't show empty saved searches
            const item = document.createElement('div');
            item.className = 'saved-search-item';
            item.textContent = term;
            item.addEventListener('click', () => {
                searchBox.value = term;
                // Directly call applyFilters to ensure the search runs.
                // This bypasses the 'input' event listener, so lastSearchTerm is not updated.
                applyFilters();
                saveSearchBtn.style.display = 'block'; // Also ensure the save icon is visible
                popup.style.display = 'none';
            });
            contentContainer.appendChild(item); // Add items to the new container
        });
    }

startApp();

// =================================================================================
// III. GOOGLE DRIVE АВТЕНТИКАЦИЯ И API
// =================================================================================

function checkAuth() {
    const storedTokenString = sessionStorage.getItem('google_auth_token');
    if (!storedTokenString) {
        window.location.href = 'login.html';
        return null; // Stop execution
    }
    const tokenData = JSON.parse(storedTokenString);
    const isExpired = (Date.now() - tokenData.issued_at) / 1000 > (tokenData.expires_in - 60);
    if (isExpired) {
        console.log("Token expired. Redirecting to login for re-authentication.");
        sessionStorage.removeItem('google_auth_token');
        // Redirect to login page with a parameter to trigger re-auth automatically
        window.location.href = 'login.html?reauth=true';
        return null; // Stop execution
    }
    return tokenData; // Token is valid
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

function handleSignoutClick() {
    sessionStorage.removeItem('google_auth_token');
    window.location.href = 'login.html';
}

// =================================================================================
// IV. ЧЕТЕНЕ НА ДАННИ ОТ GOOGLE DRIVE
// =================================================================================

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

    async function listFiles(folderIdFromPrompt) {
        let useLocalDb = localStorage.getItem('useLocalDb') === 'true';
        const updateFromGoogleDrive = localStorage.getItem('updateFromGoogleDrive') !== 'false';
        let tokenData = null;

        // --- Prompt to create DB if it doesn't exist ---
        if (useLocalDb) {
            const dbExists = await checkDbExists(NOTES_DB_NAME);
            if (!dbExists) {
                const createDb = await showConfirmation(_('confirmCreateLocalDb'));
                if (!createDb) {
                    // User declined. Fallback to non-local mode for this session.
                    useLocalDb = false;
                    showToast(_('loadedFromLocalNoDrive'), 5000); // Inform user about the fallback
                }
                // If they confirmed, the DB will be created automatically on the first `openNotesDB` call.
            }
        }
        // ----------------------------------------------------

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

                } else {
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

// =================================================================================
// IV.a. ЛОКАЛНИ ДАННИ (INDEXEDDB)
// =================================================================================

/**
 * Зарежда всички данни (boards, media, notes) от локалната IndexedDB.
 */
async function fetchAllDataLocal() {
    console.log("Fetching all data from local IndexedDB...");
    boardsData = await getAllFromDB(BOARD_STORE_NAME);
    mediaData = await getAllFromDB(MEDIA_STORE_NAME);
    const notesFromDB = await getAllFromDB(NOTE_STORE_NAME);

    // The rest of the app expects `allNotesData` to have a specific structure,
    // including the raw `res.body` for the modal. We need to reconstruct this.
    allNotesData = notesFromDB.map(noteContent => {
        const rawData = {
            file: { name: 'note.txt (local)' }, // Mock file object
            res: { body: JSON.stringify(noteContent) } // Re-stringify the content
        };
        return {
            file: rawData.file,
            content: noteContent,
            rawData: rawData
        };
    });

    console.log(`Loaded ${boardsData.length} boards, ${mediaData.length} media, and ${allNotesData.length} notes from DB.`);
}

/**
 * Управлява процеса на локална синхронизация с файловата система.
 */
async function runLocalSync() {
    const lastUpdateTimestamp = await getConfig('lastUpdateTimestamp');
    const updateDate = lastUpdateTimestamp ? new Date(lastUpdateTimestamp) : null;
    let updatedCount = 0;

    const handle = await getDirectoryHandle();
    if (!handle) {
        showToast(_('errorLocalFolderNotSelected'), 10000);
        return; // Stop if no folder is selected
    }

    loaderText.textContent = updateDate ? `Updating files since ${updateDate.toLocaleString()}...` : "Performing full initial sync...";

    // Perform sync only if the setting is enabled
    if (localStorage.getItem('updateIndexedDb') !== 'false') {
        updatedCount = await processDirectoryContent(lastUpdateTimestamp);
        await saveConfig('lastUpdateTimestamp', Date.now());
    } else {
        console.log("Skipping local file scan because IndexedDB update is disabled.");
        loaderText.textContent = _('skippedFileScan');
    }

    // Show toast only for incremental updates (not the very first sync)
    if (updateDate) {
        const message = updatedCount > 0
            ? _('localUpdatesFound').replace('{count}', updatedCount)
            : _('localNoUpdates');
        showToast(message, 3000);
    }
}

/**
 * Взима handle на директория - от паметта, от IndexedDB или чрез избор от потребителя.
 * @param {boolean} promptUser - Дали да се покаже диалог за избор, ако няма запазен handle.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function getDirectoryHandle(promptUser = false) {
    if (dirHandle) return dirHandle;

    try {
        const savedHandle = await getConfig('directoryHandle');
        if (savedHandle) {
            const verifiedHandle = await verifyPermission(savedHandle);
            if (verifiedHandle) {
                dirHandle = verifiedHandle;
                return dirHandle;
            }
        }

        if (promptUser) {
            const newHandle = await window.showDirectoryPicker();
            await saveConfig('directoryHandle', newHandle);
            dirHandle = newHandle;
            return dirHandle;
        }
        return null;
    } catch (error) {
        if (error.name !== 'AbortError') console.error("Error getting directory handle:", error);
        return null;
    }
}

/**
 * Проверява и иска разрешение за достъп до handle на директория.
 * @param {FileSystemDirectoryHandle} handle
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function verifyPermission(handle) {
    const options = { mode: 'readwrite' };
    if (await handle.queryPermission(options) === 'granted') return handle;
    if (await handle.requestPermission(options) === 'granted') return handle;
    return null;
}

/**
 * Обхожда избраната локална директория и обновява IndexedDB.
 * @param {Date} [minModificationDate] - Минимална дата на модификация за инкрементално обновяване.
 */
async function processDirectoryContent(minModificationDate) {
    const minTimestamp = minModificationDate || 0;
    const handle = await getDirectoryHandle();
    if (!handle) return 0;
    const stores = {
        [BOARD_STORE_NAME]: [],
        [MEDIA_STORE_NAME]: [],
        [NOTE_STORE_NAME]: []
    };
    let fileCount = 0;
    let updatedCount = 0;
    for await (const entry of handle.values()) {
        if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.txt')) continue;
        fileCount++;
        loaderText.textContent = `Checked ${fileCount} files...`;
        try {
            const file = await entry.getFile();
            if (file.lastModified >= minTimestamp) {
                updatedCount++;
                const content = await file.text();
                const fileObject = JSON.parse(content);
                if (fileObject.gdid) {
                    const lowerCaseName = entry.name.toLowerCase();
                    if (lowerCaseName.includes('board')) {
                        stores[BOARD_STORE_NAME].push(fileObject);
                    } else if (lowerCaseName.includes('media')) {
                        stores[MEDIA_STORE_NAME].push(fileObject);
                    } else if (lowerCaseName.includes('note')) {
                        stores[NOTE_STORE_NAME].push(fileObject);
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing local file '${entry.name}':`, error);
        }
    }
    // Bulk update the stores that have new/updated data
    const updateIndexedDb = localStorage.getItem('updateIndexedDb') !== 'false';
    if (!updateIndexedDb) {
        console.log("IndexedDB update is disabled in settings. Skipping database write.");
        return;
    }
    for (const storeName in stores) {
        if (stores[storeName].length > 0) {
            await bulkPutDB(storeName, stores[storeName], true); // Use incremental put
        }
    }
    return updatedCount;
}

// =================================================================================
// V. СЪЗДАВАНЕ И УПРАВЛЕНИЕ НА UI ЕЛЕМЕНТИ
// =================================================================================

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
    
    async function createBoardsUI(boardsData, boardParseError) {
        const boardsNote = document.createElement('div');
        boardsNote.className = 'boards-note';
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'note-content';
        contentWrapper.style.minHeight = '0';
        const contentEl = document.createElement('div');
        contentEl.className = 'board-menu-container';
        const zoomValueDisplay = document.createElement('span');
        zoomValueDisplay.id = 'zoom-value-display';
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
            const zoomValue = scaleInput.value;
            updateZoom(zoomValue);
            localStorage.setItem('zoomLevel', zoomValue);
            showToast(_('settingSaved'), 2000);
        });
        zoomControlWrapper.appendChild(zoomLabel);
        zoomControlWrapper.appendChild(sliderContainer);
        zoomControlWrapper.appendChild(applyBtn);
        zoomModalBody.appendChild(zoomControlWrapper);
        const startBoardWrapper = document.createElement('div');
        startBoardWrapper.className = 'zoom-control-wrapper';
        startBoardWrapper.style.marginTop = '20px';
        const startBoardLabel = document.createElement('label');
        startBoardLabel.textContent = _('startBoardLabel');
        startBoardLabel.style.marginRight = '10px';
        const startBoardSelect = document.createElement('select');
        startBoardSelect.id = 'start-board-select';
        startBoardSelect.className = 'start-board-select';
    
        startBoardSelect.innerHTML = `
            <option value="all">${_('allBoards')}</option>
            <option value="calendar">${_('calendar')}</option>
            <option value="reminder">${_('reminder')}</option>
        `;
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
        // --- Max Saved Searches Setting ---
        const maxSearchesWrapper = document.createElement('div');
        maxSearchesWrapper.className = 'zoom-control-wrapper';
        maxSearchesWrapper.style.marginTop = '20px';
        const maxSearchesLabel = document.createElement('label');
        maxSearchesLabel.textContent = _('maxSearchesLabel');
        maxSearchesLabel.style.marginRight = '10px';
        const maxSearchesInput = document.createElement('input');
        maxSearchesInput.type = 'number';
        maxSearchesInput.id = 'max-searches-input';
        maxSearchesInput.className = 'zoom-input-number';
        maxSearchesInput.value = maxSavedSearches;
        maxSearchesInput.min = '0';
        maxSearchesInput.max = '20';
        maxSearchesInput.addEventListener('change', () => {
            let newValue = parseInt(maxSearchesInput.value, 10);
            if (isNaN(newValue) || newValue < 0) newValue = 0;
            if (newValue > 20) newValue = 20;
            maxSavedSearches = newValue;
            localStorage.setItem('maxSavedSearches', newValue);
            // Trim existing searches if new limit is smaller
            if (savedSearches.length > maxSavedSearches) {
                savedSearches.length = maxSavedSearches;
                localStorage.setItem('savedSearches', JSON.stringify(savedSearches));
            }
            showToast(_('settingSaved'), 2000);
        });
        maxSearchesWrapper.appendChild(maxSearchesLabel);
        maxSearchesWrapper.appendChild(maxSearchesInput);
        zoomModalBody.appendChild(maxSearchesWrapper);
        const slider = sliderContainer.querySelector('#scaleSlider');
        const scaleInput = sliderContainer.querySelector('#scaleInput');
        const updateZoom = (value) => {
            value = Math.max(25, Math.min(175, parseInt(value, 10)));
            if (isNaN(value)) value = 100;
            notesContainer.style.zoom = value / 100;
            zoomValueDisplay.textContent = ` ${value}%`;
            slider.value = value;
            scaleInput.value = value;
        };
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
        scaleInput.addEventListener('change', () => {
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
    
        const createFontSizeInput = (id, labelKey, storageKey, defaultValue, targetUpdate) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'zoom-control-wrapper';
            wrapper.style.marginTop = '15px';
            const label = document.createElement('label');
            label.textContent = _(labelKey);
            label.style.marginRight = '10px';
            label.style.flexBasis = '200px';
            label.style.flexShrink = '0';
            label.style.textAlign = 'left';
            const select = document.createElement('select');
            select.id = id;
            select.className = 'zoom-input-select';
            select.style.width = '80px';
            select.style.margin = '0 2px 0 10px';
            select.style.flexShrink = '0';
    
            const fontSizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 60, 72];
            fontSizes.forEach(size => {
                const option = document.createElement('option');
                option.value = size;
                option.textContent = `${size}px`;
                select.appendChild(option);
            });
            select.value = localStorage.getItem(storageKey) || defaultValue;
            select.addEventListener('change', () => {
                const value = select.value;
                localStorage.setItem(storageKey, value);
                targetUpdate(value);
                showToast(_('settingSaved'), 2000);
            });
    
            wrapper.appendChild(label);
            wrapper.appendChild(select);
            return wrapper;
        };
    
        zoomModalBody.appendChild(createFontSizeInput('note-font-size-input', 'noteFontSizeLabel', 'noteFontSize', 18, (val) => document.documentElement.style.setProperty('--note-font-size', `${val}px`)));
        zoomModalBody.appendChild(createFontSizeInput('modal-font-size-input', 'modalFontSizeLabel', 'modalFontSize', 18, (val) => modalBody.style.fontSize = `${val}px`));

        const showDatemodWrapper = document.createElement('div');
        showDatemodWrapper.className = 'zoom-control-wrapper';
        showDatemodWrapper.style.marginTop = '20px';
        const showDatemodLabel = document.createElement('label');
        showDatemodLabel.textContent = _('showDatemodLabel');
        showDatemodLabel.style.marginRight = '10px';
        showDatemodLabel.htmlFor = 'show-datemod-checkbox';
        const showDatemodCheckbox = document.createElement('input');
        showDatemodCheckbox.type = 'checkbox';
        showDatemodCheckbox.id = 'show-datemod-checkbox';
        showDatemodCheckbox.className = 'settings-checkbox'; // Unified class
        showDatemodCheckbox.checked = localStorage.getItem('showDatemod') !== 'false'; // Default to true
        showDatemodCheckbox.addEventListener('change', () => {
            const isChecked = showDatemodCheckbox.checked;
            localStorage.setItem('showDatemod', isChecked);
            document.body.classList.toggle('hide-datemod', !isChecked);
            showToast(_('settingSaved'), 2000);
        });
        showDatemodWrapper.appendChild(showDatemodLabel);
        showDatemodWrapper.appendChild(showDatemodCheckbox);
        zoomModalBody.appendChild(showDatemodWrapper);

        // --- Use Local DB Setting ---
        const useLocalDbWrapper = document.createElement('div');
        useLocalDbWrapper.className = 'zoom-control-wrapper';
        useLocalDbWrapper.style.marginTop = '20px';
        const useLocalDbLabel = document.createElement('label');
        useLocalDbLabel.textContent = _('useLocalDbLabel');
        useLocalDbLabel.style.marginRight = '10px';
        useLocalDbLabel.htmlFor = 'use-local-db-checkbox';
        const useLocalDbCheckbox = document.createElement('input');
        useLocalDbCheckbox.type = 'checkbox';
        useLocalDbCheckbox.id = 'use-local-db-checkbox';
        useLocalDbCheckbox.className = 'settings-checkbox'; // Unified class
        useLocalDbCheckbox.checked = localStorage.getItem('useLocalDb') === 'true';
        useLocalDbCheckbox.addEventListener('change', () => {
            localStorage.setItem('useLocalDb', useLocalDbCheckbox.checked);
            if (useLocalDbCheckbox.checked) {
                useGoogleDbCheckbox.checked = false;
                localStorage.setItem('useGoogleDb', false);
            }
            toggleUpdateOptionsVisibility();
            showToast(_('settingSaved'), 2000);
        });
        useLocalDbWrapper.appendChild(useLocalDbLabel);
        useLocalDbWrapper.appendChild(useLocalDbCheckbox);

        const useGoogleDbWrapper = document.createElement('div');
        useGoogleDbWrapper.className = 'zoom-control-wrapper';
        useGoogleDbWrapper.style.marginTop = '20px';
        const useGoogleDbLabel = document.createElement('label');
        useGoogleDbLabel.textContent = _('useGoogleDbLabel');
        useGoogleDbLabel.style.marginRight = '10px';
        useGoogleDbLabel.htmlFor = 'use-google-db-checkbox';
        const useGoogleDbCheckbox = document.createElement('input');
        useGoogleDbCheckbox.type = 'checkbox';
        useGoogleDbCheckbox.id = 'use-google-db-checkbox';
        useGoogleDbCheckbox.className = 'settings-checkbox'; // Unified class
        useGoogleDbCheckbox.checked = localStorage.getItem('useGoogleDb') === 'true';
        useGoogleDbCheckbox.addEventListener('change', () => {
            localStorage.setItem('useGoogleDb', useGoogleDbCheckbox.checked);
            if (useGoogleDbCheckbox.checked) {
                useLocalDbCheckbox.checked = false;
                localStorage.setItem('useLocalDb', false);
            }
            toggleUpdateOptionsVisibility();
            showToast(_('settingSaved'), 2000);
        });
        useGoogleDbWrapper.appendChild(useGoogleDbLabel);
        useGoogleDbWrapper.appendChild(useGoogleDbCheckbox);
        
        // --- Update from Google Drive Setting ---
        const updateFromGoogleDriveWrapper = document.createElement('div');
        updateFromGoogleDriveWrapper.className = 'zoom-control-wrapper';
        updateFromGoogleDriveWrapper.style.paddingLeft = '20px'; // Indent
        const updateFromGoogleDriveLabel = document.createElement('label');
        updateFromGoogleDriveLabel.style.marginRight = '10px';
        updateFromGoogleDriveLabel.textContent = _('updateFromGoogleDriveLabel');
        updateFromGoogleDriveLabel.htmlFor = 'update-from-gdrive-checkbox';
        const updateFromGoogleDriveCheckbox = document.createElement('input');
        updateFromGoogleDriveCheckbox.type = 'checkbox';
        updateFromGoogleDriveCheckbox.id = 'update-from-gdrive-checkbox';
        updateFromGoogleDriveCheckbox.className = 'settings-checkbox'; // Unified class
        updateFromGoogleDriveCheckbox.checked = localStorage.getItem('updateFromGoogleDrive') !== 'false'; // Default to true
        updateFromGoogleDriveCheckbox.addEventListener('change', () => {
            localStorage.setItem('updateFromGoogleDrive', updateFromGoogleDriveCheckbox.checked);
            showToast(_('settingSaved'), 2000);
        });
        updateFromGoogleDriveWrapper.appendChild(updateFromGoogleDriveLabel);
        updateFromGoogleDriveWrapper.appendChild(updateFromGoogleDriveCheckbox);

        zoomModalBody.appendChild(useGoogleDbWrapper);
        zoomModalBody.appendChild(updateFromGoogleDriveWrapper); // <-- ДОБАВЕН ЛИПСВАЩ РЕД
        
        zoomModalBody.appendChild(useLocalDbWrapper);

        // --- Database Update Settings (conditionally shown) ---
        /*const updateDbTitleWrapper = document.createElement('div');
        updateDbTitleWrapper.className = 'zoom-control-wrapper';
        updateDbTitleWrapper.style.marginTop = '20px';
        const updateDbTitleLabel = document.createElement('label');
        updateDbTitleLabel.textContent = _('updateLocalDbTitle');
        updateDbTitleWrapper.appendChild(updateDbTitleLabel);
        zoomModalBody.appendChild(updateDbTitleWrapper);*/

        // --- Update IndexedDB from local disk Setting ---
        const updateIndexedDbWrapper = document.createElement('div');
        updateIndexedDbWrapper.className = 'zoom-control-wrapper';
        updateIndexedDbWrapper.style.paddingLeft = '20px'; // Indent
        const updateIndexedDbLabel = document.createElement('label');
        updateIndexedDbLabel.style.marginRight = '10px';
        updateIndexedDbLabel.textContent = _('updateIndexedDbLabel');
        updateIndexedDbLabel.htmlFor = 'update-indexed-db-checkbox';
        const updateIndexedDbCheckbox = document.createElement('input');
        updateIndexedDbCheckbox.type = 'checkbox';
        updateIndexedDbCheckbox.id = 'update-indexed-db-checkbox';
        updateIndexedDbCheckbox.className = 'settings-checkbox'; // Unified class
        updateIndexedDbCheckbox.checked = localStorage.getItem('updateIndexedDb') !== 'false'; // Default to true
        updateIndexedDbCheckbox.addEventListener('change', () => {
            localStorage.setItem('updateIndexedDb', updateIndexedDbCheckbox.checked);
            showToast(_('settingSaved'), 2000);
        });
        updateIndexedDbWrapper.appendChild(updateIndexedDbLabel);
        updateIndexedDbWrapper.appendChild(updateIndexedDbCheckbox);
        zoomModalBody.appendChild(updateIndexedDbWrapper);

        // Function to toggle visibility of the update options
        const toggleUpdateOptionsVisibility = () => {
            const isVisible = useLocalDbCheckbox.checked;
            updateIndexedDbWrapper.style.display = isVisible ? 'flex' : 'none';
            const isVisibleG = useGoogleDbCheckbox.checked;
            updateFromGoogleDriveWrapper.style.display = isVisibleG ? 'flex' : 'none';
        };

        // Add the event listener to the "Use Local DB" checkbox
        // The logic is now inside the main change listeners
        toggleUpdateOptionsVisibility();

        // --- Local Sync Folder Setting ---
        const localSyncWrapper = document.createElement('div');
        localSyncWrapper.className = 'zoom-control-wrapper';
        localSyncWrapper.style.marginTop = '20px';
        const localSyncLabel = document.createElement('label');
        localSyncLabel.textContent = _('localSyncFolderLabel');
        localSyncLabel.style.marginRight = '10px';
        const selectFolderBtn = document.createElement('button');
        selectFolderBtn.className = 'zoom-btn';
        selectFolderBtn.textContent = _('selectFolderButton');
        const folderNameDisplay = document.createElement('span');
        folderNameDisplay.id = 'local-sync-folder-name';
        folderNameDisplay.style.marginLeft = '10px';
        folderNameDisplay.style.fontStyle = 'italic';
        folderNameDisplay.style.maxWidth = '200px';
        folderNameDisplay.style.overflow = 'hidden';
        folderNameDisplay.style.textOverflow = 'ellipsis';
        folderNameDisplay.style.whiteSpace = 'nowrap';

        selectFolderBtn.addEventListener('click', async () => {
            const handle = await getDirectoryHandle(true); // Prompt user to select
            if (handle) {
                folderNameDisplay.textContent = handle.name;
                folderNameDisplay.title = handle.name;
                showToast(_('folderSelectedForSync').replace('{folderName}', handle.name), 10000);
                await runLocalSync(); // Run initial sync immediately
            }
        });

        localSyncWrapper.appendChild(localSyncLabel);
        localSyncWrapper.appendChild(selectFolderBtn);
        zoomModalBody.appendChild(localSyncWrapper);

        const closeBtnWrapper = document.createElement('div');
        closeBtnWrapper.className = 'settings-close-btn-wrapper';
        const closeBtn = document.createElement('button');
        closeBtn.className = 'zoom-btn settings-close-btn';
        closeBtn.textContent = _('closeButton');
        closeBtn.addEventListener('click', () => {
            document.getElementById('settings-modal').classList.remove('visible');
        });
        closeBtnWrapper.appendChild(closeBtn);
        zoomModalBody.appendChild(closeBtnWrapper);
        localSyncWrapper.appendChild(folderNameDisplay);

        // Asynchronously get and display the current folder name
        (async () => {
            const handle = await getDirectoryHandle(); // This won't prompt the user
            if (handle) {
                folderNameDisplay.textContent = handle.name;
                folderNameDisplay.title = handle.name;
            } else {
                folderNameDisplay.textContent = _('folderNotSelected');
            }
        })();
        updateIndexedDbWrapper.style.marginTop = '20px';

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
        /**
         * Attaches long-press and Ctrl-click events to an element to show the all-boards modal.
         * @param {HTMLElement} element The element to attach events to.
         * @param {Function} [singleClickCallback] An optional callback for a regular single click.
         */
        const addAllBoardsModalEvents = (element, singleClickCallback) => {
            let longPressTimer;
            let isLongPress = false;
            const startPress = (e) => {
                isLongPress = false;
                longPressTimer = setTimeout(() => {
                    isLongPress = true;
                    showAllBoardsModal(element);
                }, 500);
                // Only prevent default on touch to avoid unwanted scrolling while holding
                if (e.type === 'touchstart') {
                    e.preventDefault();
                }
            };
            const endPress = (e) => {
                clearTimeout(longPressTimer);
                // If it's a touchend and not a long press, trigger the single click action
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
        leftArrow.className = 'scroll-arrow left-arrow'; // Keep class for styling
        leftArrow.innerHTML = boardIconSvg; // Use the board icon
        // Add long-press/ctrl-click to arrows, with scrolling as the default single-click action
        addAllBoardsModalEvents(leftArrow, () => { showAllBoardsModal(leftArrow); });
    
        scrollWrapper.appendChild(leftArrow);
        scrollWrapper.appendChild(contentEl);
        contentWrapper.appendChild(scrollWrapper);
        
        const checkScroll = () => {
            leftArrow.classList.toggle('visible', true); // The button is now always visible
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
        const codeTagRegex = /\[code\]([\s\S]*?)\[\/code\]/g;
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
            } else { fileContent = _('errorNoteFieldMissing'); }
        } catch (e) { fileContent = _('errorNoteParse'); }
        
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
                        const iconDiv = document.createElement('div');

                        if (attachment.type === 3 && attachment.path) {
                            const filename = attachment.path.split('/').pop();
                            const link = document.createElement('a');
                            
                            if (useLocalDb && dirHandle) {
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
                            } else if (attachment.gdid) {
                                const fileId = await getFileID(folderIds['Other'], filename);
                                link.href = `https://drive.google.com/file/d/${fileId}/view`;
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                                link.onclick = (e) => {
                                    // Спираме разпространението, за да не се отвори модалът на бележката
                                    e.stopPropagation();
                                };
                            } else {
                                link.href = '#';
                                link.onclick = (e) => e.preventDefault();
                            }

                            link.title = link.href;
                            link.textContent = 'Other/' + filename;
                            attachmentWrapper.appendChild(link);
                            iconDiv.innerHTML = iconData.svg;
                            iconDiv.style.cursor = 'pointer';
                            iconDiv.addEventListener('click', (e) => {
                                const attachmentDataString = JSON.stringify(attachment, null, 2);
                                e.stopPropagation();
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
                                iconDiv.addEventListener('click', (e) => {
                                    const attachmentDataString = JSON.stringify(attachment, null, 2);
                                    e.stopPropagation();
                                    showModal(attachmentDataString);
                                });
                            }
                        }
                        if (attachment.type === 1 && attachment.path) {
                            const filename = attachment.path.split('/').pop();
                            const link = document.createElement('a');

                            if (useLocalDb && dirHandle) {
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
                            } else if (attachment.gdid) {
                                const fileId = await getFileID(folderIds['Images'], filename);
                                link.href = `https://drive.google.com/file/d/${fileId}/view`;
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                                link.onclick = (e) => {
                                    // Спираме разпространението, за да не се отвори модалът на бележката
                                    e.stopPropagation();
                                };
                            } else {
                                link.href = '#';
                                link.onclick = (e) => e.preventDefault();
                            }

                            link.title = link.href;
                            link.textContent = 'Images/' + filename;
                            iconDiv.innerHTML = iconData.svg;
                            iconDiv.addEventListener('click', async (e) => {
                                if (useLocalDb) return; // Preview is not available in local mode
                                e.stopPropagation();
                                e.preventDefault();
                                const noteEl = attachmentWrapper.closest('.note');
                                if (!noteEl || noteEl.querySelector('.image-preview-overlay')) {
                                    return;
                                }
                                const titleEl = noteEl.querySelector('h3');
                                const fileId = await getFileID(folderIds['Images'], filename);
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

                            if (useLocalDb && dirHandle) {
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
                            } else if (attachment.gdid) {
                                const fileId = await getFileID(folderIds['Sound'], filename);
                                link.href = `https://drive.google.com/file/d/${fileId}/view`;
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                                link.onclick = (e) => {
                                    // Спираме разпространението, за да не се отвори модалът на бележката
                                    e.stopPropagation();
                                };
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
                            iconDiv.innerHTML = iconData.svg;
                            iconDiv.style.cursor = 'pointer';
                            iconDiv.addEventListener('click', (e) => {
                                const attachmentDataString = JSON.stringify(attachment, null, 2);
                                e.stopPropagation();
                                showModal(attachmentDataString);
                            });
                            attachmentWrapper.appendChild(textContainer);
                        }
                        if (attachment.type === 4 && attachment.path) {
                            const filename = attachment.path.split('/').pop();
                            const textContainer = document.createElement('div');
                            textContainer.style.flexGrow = '1';
                            textContainer.style.flexShrink = '1';
                            textContainer.style.minWidth = '0';
                            const link = document.createElement('a');

                            if (useLocalDb && dirHandle) {
                                link.href = '#';
                                link.onclick = async (e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    try {
                                        const videoDir = await dirHandle.getDirectoryHandle('Video');
                                        const fileHandle = await videoDir.getFileHandle(filename);
                                        const file = await fileHandle.getFile();
                                        window.open(URL.createObjectURL(file), '_blank');
                                    } catch (err) {
                                        console.error(`Could not open local file Video/${filename}`, err);
                                        showToast(`Could not open local file: ${filename}`);
                                    }
                                };
                                link.target = '_blank';
                            } else if (attachment.gdid) {
                                const fileId = await getFileID(folderIds['Video'], filename);
                                link.href = `https://drive.google.com/file/d/${fileId}/view`;
                                link.target = '_blank';
                                link.rel = 'noopener noreferrer';
                                link.onclick = (e) => {
                                    // Спираме разпространението, за да не се отвори модалът на бележката
                                    e.stopPropagation();
                                };
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
                            iconDiv.innerHTML = iconData.svg;
                            iconDiv.addEventListener('click', async (e) => {
                                if (useLocalDb) return; // Preview is not available in local mode
                                e.stopPropagation();
                                e.preventDefault();
                                const noteEl = attachmentWrapper.closest('.note');
                                if (!noteEl || noteEl.querySelector('.image-preview-overlay')) {
                                    return;
                                }
                                const titleEl = noteEl.querySelector('h3');
                                const fileId = await getFileID(folderIds['Video'], filename);
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
                            attachmentWrapper.appendChild(textContainer);
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

/**
 * Отваря IndexedDB базата данни.
 * @returns {Promise<IDBDatabase>}
 */
function openNotesDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(NOTES_DB_NAME, NOTES_DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(BOARD_STORE_NAME)) {
                db.createObjectStore(BOARD_STORE_NAME, { keyPath: 'gdid' });
            }
            if (!db.objectStoreNames.contains(MEDIA_STORE_NAME)) {
                db.createObjectStore(MEDIA_STORE_NAME, { keyPath: 'gdid' });
            }
            if (!db.objectStoreNames.contains(NOTE_STORE_NAME)) {
                db.createObjectStore(NOTE_STORE_NAME, { keyPath: 'gdid' });
            }
            if (!db.objectStoreNames.contains(CONFIG_STORE_NAME)) {
                db.createObjectStore(CONFIG_STORE_NAME);
            }
            console.log("NotesDB structure is up to date.");
        };

        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject("Error opening NotesDB: " + event.target.errorCode);
    });
}

/**
 * Записва (или обновява) масив от обекти в даден store.
 * @param {string} storeName - Името на object store.
 * @param {Array<Object>} data - Масив от данни за запис.
 * @param {boolean} incremental - Ако е true, не изчиства store-a преди запис (put).
 * @returns {Promise<void>}
 */
async function bulkPutDB(storeName, data, incremental = false) {
    if (!data || !Array.isArray(data) || data.length === 0) return;
    const db = await openNotesDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const putData = () => {
            data.forEach(item => {
                store.put(item);
            });
        };
        transaction.oncomplete = () => resolve();
        transaction.onerror = (event) => reject("DB Transaction Error: " + event.target.error);
        if (incremental) {
            putData();
        } else {
            store.clear().onsuccess = putData;
        }
    });
}

/**
 * Извлича всички записи от даден store.
 * @param {string} storeName - Името на object store.
 * @returns {Promise<Array<Object>>}
 */
async function getAllFromDB(storeName) {
    const db = await openNotesDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(`Error in getAllFromDB (${storeName}): ` + event.target.error);
    });
}

/**
 * Запазва стойност в config store-a.
 * @param {string} key - Ключ (напр. 'directoryHandle', 'lastUpdateTimestamp').
 * @param {*} value - Стойността за запис.
 */
async function saveConfig(key, value) {
    const db = await openNotesDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIG_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(CONFIG_STORE_NAME);
        const request = store.put(value, key);
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject('Error saving to config: ' + event.target.error);
    });
}

/**
 * Извлича стойност от config store-a.
 * @param {string} key - Ключът за извличане.
 * @returns {Promise<*>} - Стойността или undefined, ако не съществува.
 */
async function getConfig(key) {
    const db = await openNotesDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(CONFIG_STORE_NAME, 'readonly');
        const store = transaction.objectStore(CONFIG_STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => reject('Error getting from config: ' + event.target.error);
    });
}

/**
 * Checks if an IndexedDB database exists.
 * @param {string} dbName The name of the database.
 * @returns {Promise<boolean>}
 */
async function checkDbExists(dbName) {
    // The modern `databases()` method is the most reliable.
    if (window.indexedDB.databases) {
        const dbs = await indexedDB.databases();
        return dbs.some(db => db.name === dbName);
    }

    // Fallback for older browsers that don't support `databases()`.
    console.warn("checkDbExists: indexedDB.databases() is not supported. Using a fallback check.");
    return new Promise(resolve => {
        const req = indexedDB.open(dbName);
        let existed = true;
        req.onupgradeneeded = () => {
            existed = false; // This event is only triggered if the DB doesn't exist or needs upgrading.
        };
        req.onsuccess = () => {
            req.result.close();
            // If the DB was created just now, delete it to leave no trace.
            if (!existed) {
                indexedDB.deleteDatabase(dbName);
            }
            resolve(existed);
        };
        // If we can't even open it, assume it doesn't exist or is inaccessible.
        req.onerror = () => resolve(false);
    });
}

/**
 * Deletes the entire IndexedDB database.
 * @returns {Promise<void>}
 */
function deleteNotesDB() {
    return new Promise((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(NOTES_DB_NAME);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = (event) => reject(event.target.error);
        deleteRequest.onblocked = () => reject(new Error("Database deletion blocked."));
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
