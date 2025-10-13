// ================================================================================
// I. ГЛОБАЛНИ ПРОМЕНЛИВИ И КОНСТАНТИ
// ================================================================================

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
            useLocalDbLabel: 'Local database:',
            updateIndexedDbLabel: 'from local disk',
            updateLocalDbTitle: 'Update local database:',
            updateFromGoogleDriveLabel: 'from Google Drive',
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
            errorNoteFieldMissing: "Грешка: липсва поле 'notetxt'.",
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
            useLocalDbLabel: 'Локална база:',
            updateIndexedDbLabel: 'от локален диск',
            updateLocalDbTitle: 'Обновяване на локалната база:',
            updateFromGoogleDriveLabel: 'от Google Drive',
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
