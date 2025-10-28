// terser main.js --compress --mangle --toplevel --output mainn.js
// terser main.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output mainn.js

// =================================================================================
// I. ГЛОБАЛНИ ПРОМЕНЛИВИ И КОНСТАНТИ
// =================================================================================

// --- Конфигурация и версия ---
const CLIENT_ID = '1090128984423-80074rvs8n45v787044d9ca1bvahla98.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const version = '0.9'; // App version

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
let dbExists = false; // Флаг за съществуването на IndexedDB
let settingsInitialState = {}; // Запомня състоянието на настройките при отваряне
let dbSourceGlobal = null; // Запомня откъде е създадена базата
let dbNoteIdTypeGlobal = null; // Запомня типа на връзката в базата

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
const GDSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
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
            orderLabel: 'Order notes:',
            sortByNumber: 'by number',
            sortByColor: 'by color',
            sortByCreationDate: 'by creation date',
            sortByModificationDate: 'by modification date',
            sortByCalendarDate: 'by calendar date',
            sortByAlphabetical: 'alphabetically',
            sortInReverse: 'in reverse order',
            sortRemindersTop: 'reminders on top',
            useArhDbLabel: 'Archive:',
            calendar: 'Calendar',
            settingsTitle: 'Settings',
            reminder: 'Reminders',
            searchSavedTip: 'Save search',
            startBoardLabel: 'Start Board:',
            settingSaved: 'Setting saved',
            submitButton: 'Confirm',
            searchSaved: 'Search saved',
            allBoardsCtrlClickTooltip: 'Ctrl-click - menu',
            maxSearchesLabel: 'Saved Searches:',
            clearSearchesTooltip: 'Clear search history',
            noteFontSizeLabel: 'Note Font Size:',
            showDatemodLabel: 'Show modification/calendar date:',
            dataManagementTitle: 'Data Loading',
            advancedSettings: 'Advanced Settings',
            useLocalDbLabel: 'Local folder:',
            useGoogleDbLabel: 'Google Drive:',
            updateIndexedDbLabel: 'update',
            updateFromGoogleDriveLabel: 'update only',
            localSyncFolderLabel: 'Select local folder',
            arhFolderLabel: 'Select archive folder',
            useIndexedDbLabel: 'Database:',
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
            folderSelectedForArh: 'Folder \'{folderName}\' selected for archive reading.',
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
            localNoUpdates: 'No new updates from local disk.',
            confirmDbRecreate: 'The local database already exists. Do you want to delete it and create a new one from the current data?',
            confirmDbDelete: 'Are you sure you want to delete the local database?',
            dbPopulated: 'Notes loaded into the database.',
            dbCreated: 'Database created successfully.',
            dbCreateFailedNoData: 'Cannot create database. No data loaded in memory.',
            errorDbSourceMismatch: 'Mismatch between the database and the data source. Attachment links will not be available.',
            dbDeleted: 'Database deleted successfully.',
            confirmCreateDbFromArh: 'The local database is empty or does not exist. Do you want to create a new one from the current archive data?',
            loadedFromArhNoDb: 'Loading directly from archive.',
            errorDbOnlyAndEmpty: 'You have selected Database only, but it is empty. Please select another data source.',
            dbDeleteFailed: 'Failed to delete local database.',
            noUpdateMode: 'Attachment links will not be active.',
            createDbButton: 'Create',
            permissionDenied: 'Permission Denied',
            deleteDbButton: 'Delete',
            confirmConfigDelete: 'Delete settings as well? (User, folder, etc.)',
            dbManagementTitle: 'Database Management'
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
            useArhDbLabel: 'Архив:',
            orderLabel: 'Подреждане на бележките:',
            sortByNumber: 'по номер',
            sortByColor: 'по цвят',
            sortByCreationDate: 'по дата на създаване',
            sortByModificationDate: 'по дата на редактиране',
            sortByCalendarDate: 'по дата в календара',
            sortByAlphabetical: 'по азбучен ред',
            sortInReverse: 'в обратен ред',
            sortRemindersTop: 'напомняния най-отгоре',
            calendar: 'Календар',
            settingsTitle: 'Настройки',
            reminder: 'Напомняния',
            submitButton: 'Потвърди',
            startBoardLabel: 'Стартов борд:',
            settingSaved: 'Настройката е запазена',
            searchSaved: 'Търсенето е запазено',
            closeButton: 'Затвори',
            allBoardsCtrlClickTooltip: 'Ctrl-клик - меню',
            maxSearchesLabel: 'Запазени търсения:',
            clearSearchesTooltip: 'Изчисти историята на търсенията',
            noteFontSizeLabel: 'Размер шрифт (бележка):',
            showDatemodLabel: 'Покажи дата на промяна/календар:',
            dataManagementTitle: 'Четене на данни',
            advancedSettings: 'Разширени настройки',
            useLocalDbLabel: 'Локална папка:',
            useGoogleDbLabel: 'Google Drive:',
            updateIndexedDbLabel: 'обновяване',
            updateFromGoogleDriveLabel: 'само обновяване',
            localSyncFolderLabel: 'Избери локална папка',
            arhFolderLabel: 'Избери архивна папка',
            useIndexedDbLabel: 'База данни:',
            selectFolderButton: 'Избери папка',
            folderNotSelected: 'Не е избрана',
            modalFontSizeLabel: 'Размер шрифт (преглед):',
            searchByTitleTooltip: 'Търсене в заглавията',
            searchByContentTooltip: 'Търсене в съдържанието',
            searchInTitles: 'в заглавията',
            searchInContent: 'в съдържанието',
            errorLocalFolderNotSelected: 'Папката за локална синхронизация не е избрана. Моля, изберете такава от Настройки.',
            folderSelectedForSync: 'Папка \'{folderName}\' е избрана за локална синхронизация.',
            folderSelectedForArh: 'Папка \'{folderName}\' е избрана за четене от архив.',
            localDataLoaded: 'Локалните данни са заредени.',
            localDbUpdated: 'Локалната база е обновена от Google Drive.',
            dbPopulated: 'Бележките са заредени в базата данни.',
            dbCreated: 'Базата данни е създадена успешно.',
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
            localNoUpdates: 'Няма нови промени в локалния диск.',
            confirmDbRecreate: 'Локалната база данни вече съществува. Искате ли да я изтриете и да създадете нова от текущите данни?',
            confirmDbDelete: 'Сигурни ли сте, че искате да изтриете локалната база данни?',
            dbCreated: 'Локалната база данни е създадена успешно.',
            errorDbSourceMismatch: 'Несъответствие между базата данни и източника на данни. Линковете към приложенията няма да са достъпни.',            
            dbCreateFailedNoData: 'Базата не може да бъде създадена. Няма заредени данни в паметта.',
            dbDeleted: 'Локалната база данни е изтрита успешно.',
            confirmCreateDbFromArh: 'Локалната база данни е празна или не съществува. Искате ли да създадете нова от текущите архивни данни?',
            loadedFromArhNoDb: 'Зареждане директно от архив.',
            errorDbOnlyAndEmpty: 'Избрали сте само База данни, но тя е празна. Моля, изберете друг източник на данни.',
            dbDeleteFailed: 'Неуспешно изтриване на локалната база данни.',
            noUpdateMode: 'Приложенията към бележките няма да се отварят.',
            createDbButton: 'Създай',
            permissionDenied: 'Няма разрешение',
            deleteDbButton: 'Изтрий',
            confirmConfigDelete: 'Да се изтрият ли и настройките? (Потребител, папка и др.)',
            dbManagementTitle: 'Управление на базата данни'
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
    // Първо инициализираме UI, за да се покаже веднага
    document.body.style.display = 'block';
    initApp(); // Инициализира UI елементите и event listeners
    await createBoardsUI([], false);
    await createSettingsUI([], false); // Предварително създава UI на настройките

    // Проверяваме за базата данни САМО веднъж при стартиране
    dbExists = await checkDbExists(NOTES_DB_NAME);

    // Проверката за потребител и основната логика се извикват директно.
    // mainLogic ще се погрижи за автентикацията и зареждането на Google API,
    // само ако е необходимо.
    mainLogic();
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
    toastTimeout = setTimeout(hideToast, duration); // This should match the animation duration or be slightly longer
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
        reloadButton.addEventListener('click', () => mainLogic());
        settingsButton.addEventListener('click', () => {
            // Запомняме началното състояние на чекбоксовете при отваряне на настройките
            settingsInitialState = {
                useGoogleDb: document.getElementById('use-google-db-checkbox').checked,
                useLocalDb: document.getElementById('use-local-db-checkbox').checked,
                useArhDb: document.getElementById('use-arh-db-checkbox').checked,
                useIndexedDb: document.getElementById('use-indexeddb-checkbox').checked
            };
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
            } else {
                searchMode = 'title';
                searchModeToggle.innerHTML = boardIconSvg; // Icon for Title Search
                searchModeToggle.title = _('searchByTitleTooltip');
            }
            updateSearchPlaceholder(); // Актуализираме placeholder-а
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
            renderSavedSearchesPopup(); // Модалът ще се показва винаги при фокус
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
                document.getElementById('saved-searches-popup').style.display = 'block';
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

        // --- Modal Resizing Logic ---
        const modalContentBox = contentModal.querySelector('.modal-content-box');
        const resizeHandle = contentModal.querySelector('.modal-resize-handle');

        resizeHandle.addEventListener('mousedown', function(e) {
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = parseInt(document.defaultView.getComputedStyle(modalContentBox).width, 10);
            const startHeight = parseInt(document.defaultView.getComputedStyle(modalContentBox).height, 10);

            function doDrag(e) {
                e.preventDefault();
                e.stopPropagation();
                const newWidth = startWidth + e.clientX - startX;
                const newHeight = startHeight + e.clientY - startY;
                // Задаваме минимални размери, за да не изчезне прозорецът
                modalContentBox.style.width = newWidth + 'px';
                modalContentBox.style.height = newHeight + 'px';
                // Премахваме max-width/height, за да позволим разширяване
                modalContentBox.style.maxWidth = 'none';
                modalContentBox.style.maxHeight = 'none';
            }

            function stopDrag(e) {
                e.preventDefault();
                e.stopPropagation();
                document.documentElement.removeEventListener('mousemove', doDrag, false);
                document.documentElement.removeEventListener('mouseup', stopDrag, false);
                // Запазваме новите размери в localStorage
                localStorage.setItem('modalWidth', modalContentBox.style.width);
                localStorage.setItem('modalHeight', modalContentBox.style.height);
            }

            document.documentElement.addEventListener('mousemove', doDrag, false);
            document.documentElement.addEventListener('mouseup', stopDrag, false);
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
        updateSearchPlaceholder();
        // Hide saved searches popup when clicking outside
        document.addEventListener('click', (e) => {
            if (savedSearchesPopup.style.display === 'block' && !searchWrapper.contains(e.target)) {
                savedSearchesPopup.style.display = 'none';
            }
        });

        // Добавяме event listener за показване на системна информация при клик на брояча
        const noteCounter = document.getElementById('note-counter');
        noteCounter.addEventListener('click', async () => {
            try {
                const userEmail = await getConfig('userEmail') || 'Няма данни';
                const lastGDTimestamp = await getConfig('lastGDTimestamp');
                const lastLocalTimestamp = await getConfig('lastLocalTimestamp');
                const dbNoteIdType = await getConfig('dbNoteIdType') || 'Няма данни';
                const dbSourceValue = await getConfig('dbSource');
                let dbSourceText = 'Няма данни';
                if (dbSourceValue === 1) {
                    dbSourceText = 'Google Drive';
                } else if (dbSourceValue === 2) {
                    dbSourceText = 'Локална папка';
                } else if (dbSourceValue === 3) {
                    dbSourceText = 'Архив';
                }

                const gdDate = lastGDTimestamp ? formatDateTime(lastGDTimestamp) : 'Няма данни';
                const localDate = lastLocalTimestamp ? formatDateTime(lastLocalTimestamp) : 'Няма данни';

                const content = `Потребител: ${userEmail}\nПоследна Google Drive синхронизация: ${gdDate}\nПоследна локална синхронизация: ${localDate}\nВръзка към приложенията: ${dbNoteIdType}\nБазата е създадена от: ${dbSourceText}`;

                showModal({ raw: content, color: '#f0f0f0' });
            } catch (error) {
                console.error("Error fetching system info:", error);
                showToast("Грешка при извличане на системна информация.");
            }
        });
}

    /**
     * Актуализира текста в полето за търсене, за да покаже текущия режим.
     */
    function updateSearchPlaceholder() {
        const searchInput = document.getElementById('search-box');
        if (!searchInput) return;

        let prefix = '';
        if (currentBoardFilter !== 'all' && currentBoardFilter !== 'calendar') {
            const board = boardsData.find(b => b.gdid === currentBoardFilter);
            if (board) prefix = `[${board.title}]: `;
        }

        if (searchMode === 'title') {
            searchInput.placeholder = `${prefix}${_('searchPlaceholder')} ${_('searchInTitles')}...`;
        } else {
            searchInput.placeholder = `${prefix}${_('searchPlaceholder')} ${_('searchInContent')}...`;
        }
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
        // Комбинираме последното търсене със запазените и премахваме дубликати,
        // за да сме сигурни, че всяко търсене се показва само веднъж.
        const allSearchesForDisplay = [...new Set([lastSearchTerm, ...savedSearches])];
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
        const { data, parseError } = await parseFileResults(results, filename);
        return { data, parseError }; // Връщаме обекта, за да може fetchAllData да го обработи
    }

    async function fetchAllData(folderIdFromPrompt, modifiedSince = null) {
        let folderId = folderIdFromPrompt || await getFolderID();
        if (!folderId) {
            // Try to load from local DB as a fallback
            // Only attempt this if IndexedDB is actually enabled for Google Drive mode.
            if (saveToDb) { // Проверяваме само флага, който е подаден
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
            }
            // If local loading also fails or is empty, show the original error.
            showMessagePopup(_('errorFolderNotFound'));
            throw new Error("Main folder ID not found.");
        }
        // Proceed with fetching from Google Drive
        const { data: boardFileData, parseError: boardParseError } = await loadAndParseFile('board.txt', folderId, modifiedSince);
        boardsData = boardFileData;
        const { data: mediaFileData } = await loadAndParseFile('media.txt', folderId, modifiedSince);
        mediaData = mediaFileData;
        const onNoteProgress = (loaded, total) => {
            loaderText.textContent = `${_('loadingFile')} ${loaded} ${_('of')} ${total}`;
        };
        loaderText.textContent = _('loadingFile') + ' note.txt...';
        const noteResults = await fetchFiles('note.txt', folderId, onNoteProgress, modifiedSince);
        loaderText.textContent = _('loadingFile');
        allNotesData = noteResults.map(r => {
            const content = JSON.parse(r.res.body);
            return { file: r.file, content: content, rawData: r };
        });
        return { boardParseError };
    }

    /**
     * Fetches only updated files from Google Drive since the last sync and updates IndexedDB.
     */
    async function runGoogleDriveSync() {
        // Коригирана проверка: използваме общата настройка 'useIndexedDb'
        const useIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
        if (!useIndexedDb) {
            console.log("Skipping Google Drive sync because IndexedDB is disabled for this mode.");
            return;
        }
        let updatedFilesCount = 0;
        let lastSyncTimestamp = null;
        const updateOnly = localStorage.getItem('updateFromGoogleDrive') !== 'false';
        // Get the timestamp only if "update only" is checked
        if (updateOnly) {
            lastSyncTimestamp = await getConfig('lastGDTimestamp');
        }
        // This will be null if updateOnly is false or if no timestamp is found,
        // triggering a full sync in those cases.
        const modifiedSince = lastSyncTimestamp ? new Date(lastSyncTimestamp).toISOString() : null;

        if (updateOnly && modifiedSince) {
            console.log(`Checking for Google Drive updates since ${modifiedSince}`);
            loaderText.textContent = `Проверка за промени в Google Drive от ${new Date(lastSyncTimestamp).toLocaleString()}...`;
        } else {
            console.log('Performing full initial sync from Google Drive to local DB.');
            loaderText.textContent = 'Първоначална синхронизация с Google Drive...';
        }
        const folderId = await getFolderID();
        if (!folderId) {
            showToast(_('errorFolderNotFound'));
            return;
        }
        const syncFile = async (filename, storeName) => {
            loaderText.textContent = `Проверка на ${filename}...`;
            const files = await fetchFiles(filename, folderId, null, modifiedSince);
            if (files.length > 0) {
                updatedFilesCount += files.length;
                console.log(`Found ${files.length} updated '${filename}' file(s).`);
                const parsedData = await parseFileResults(files, filename);
                if (parsedData.data.length > 0) {
                    loaderText.textContent = `Записване на промените от ${filename}...`;
                    await bulkPutDB(storeName, parsedData.data, true); // Incremental update
                }
            }
        };
        await syncFile('board.txt', BOARD_STORE_NAME);
        await syncFile('media.txt', MEDIA_STORE_NAME);
        await syncFile('note.txt', NOTE_STORE_NAME);
        await saveConfig('lastGDTimestamp', Date.now());
        loaderText.textContent = 'Синхронизацията приключи. Зареждане на данни...';
        console.log('Google Drive sync finished.');
        return updatedFilesCount;
    }

/**
 * Проверява дали текущият потребител съвпада със собственика на локалната база данни.
 * Ако има несъответствие, превключва приложението в ограничен режим.
 */
async function userCheck() {
    if (!dbExists) {
        // Базата не съществува, не правим нищо.
        // Потребителят ще бъде записан при първоначалното създаване на базата.
        return;
    }
    // Базата съществува, продължаваме с проверката на потребителя
    const storedUserEmail = await getConfig('userEmail');
    const currentUserEmail = sessionStorage.getItem('google_auth_email_hint');
    // Проверяваме за несъответствие само ако има записан потребител в базата
    if (storedUserEmail && currentUserEmail && storedUserEmail !== currentUserEmail) {
        await handleUserMismatch(storedUserEmail);
    }
}

/**
 * Обработва случая на несъответствие на потребители.
 * Показва съобщение и заключва настройките за управление на данни.
 */
async function handleUserMismatch(storedUser) {
    showToast(`Съществуващата база е създадена с потребителско име ${storedUser}, данните ще се заредят от Google Drive`, 15000);
    // Принудително превключваме към режим "Google Drive" без IndexedDB
    localStorage.setItem('useIndexedDb', 'false');
    localStorage.setItem('useGoogleDb', 'true');
    localStorage.setItem('useLocalDb', 'false');
    // Деактивираме контролите в настройките
    const settingsModal = document.getElementById('settings-modal');
    // Проверяваме дали модалът за настройки изобщо съществува в DOM
    if (!settingsModal) return;
    const controlsToDisable = [
        'use-indexeddb-checkbox', 'use-local-db-checkbox', 'use-arh-db-checkbox',
        'create-db-btn', // 'delete-db-btn',
        'select-folder-btn', 'select-arh-btn'
    ];
    controlsToDisable.forEach(id => {
        const el = settingsModal.querySelector(`#${id}`);
        if (el) {
            // Ако елементът е чекбокс, първо го изключваме
            if (el.type === 'checkbox') {
                el.checked = false;
            }
            el.disabled = true;
        }
    });
    // Деактивираме и целия акордеон за разширени настройки
    const accordionHeader = settingsModal.querySelector('.accordion-header');
    if (accordionHeader) {
        accordionHeader.style.pointerEvents = 'none';
        accordionHeader.style.opacity = '0.5';
    }
    const googleDbCheckbox = settingsModal.querySelector('#use-google-db-checkbox');
    if (googleDbCheckbox) googleDbCheckbox.checked = true;
}

/**
 * Създава или пресъздава цялата база данни от данните, заредени в паметта.
 * @returns {Promise<boolean>} Връща true при успех и false при грешка.
 */
async function createDatabaseFromMemory() {
    if (boardsData.length === 0 && allNotesData.length === 0) {
        showToast(_('dbCreateFailedNoData'), 10000);
        return false;
    }
    try {
        await bulkPutDB(BOARD_STORE_NAME, boardsData);
        await bulkPutDB(MEDIA_STORE_NAME, mediaData);
        await bulkPutDB(NOTE_STORE_NAME, allNotesData.map(n => n.content));
        const now = Date.now();
        await saveConfig('lastGDTimestamp', now);
        await saveConfig('lastLocalTimestamp', now);
        const currentUserEmail = sessionStorage.getItem('google_auth_email_hint');
        if (currentUserEmail) {
            await saveConfig('userEmail', currentUserEmail);
        }

        // ЗАПИСВАМЕ ТИПА НА ВРЪЗКАТА (КЛЮЧОВА СТЪПКА)
        const useArh = localStorage.getItem('useArhDb') === 'true';
        const useLocal = localStorage.getItem('useLocalDb') === 'true';

        const noteIdType = useArh ? 'id' : 'gdid';
        await saveConfig('dbNoteIdType', noteIdType);

        // ЗАПИСВАМЕ И ИЗТОЧНИКА НА ДАННИ (1: GD, 2: Local, 3: Arh)
        let dbSource = 1; // Google Drive by default
        if (useArh) dbSource = 3; // Archive
        else if (useLocal) dbSource = 2; // Local Folder

        await saveConfig('dbSource', dbSource);

        dbExists = true;
        return true;
    } catch (error) {
        console.error("Failed to create/recreate DB from memory:", error);
        return false;
    }
}

/**
 * Финализира процеса по създаване на база данни, като записва
 * необходимата конфигурация (timestamps, потребител).
 */
async function finalizeDbCreation() {
    const now = Date.now();
    await saveConfig('lastGDTimestamp', now);
    await saveConfig('lastLocalTimestamp', now);

    const currentUserEmail = sessionStorage.getItem('google_auth_email_hint');
    if (currentUserEmail) {
        await saveConfig('userEmail', currentUserEmail);
    }
}

/**
 * Актуализира иконата и tooltip-а на бутона за режим, за да покаже текущия източник на данни.
 */
function updateModeButton() {
    const modeButton = document.getElementById('mode_button');
    if (!modeButton) return;

    const useGoogleDb = localStorage.getItem('useGoogleDb') !== 'false';
    const useLocalFolder = localStorage.getItem('useLocalDb') === 'true';
    const useArhDb = localStorage.getItem('useArhDb') === 'true';
    const useIndexedDb = localStorage.getItem('useIndexedDb') === 'true';

    let iconSrc = '';
    let title = '';

    if (useArhDb) {
        iconSrc = 'Zip.png';
        title = 'Режим: Архив';
    } else if (useLocalFolder) {
        iconSrc = 'Folder.png';
        title = 'Режим: Локална папка';
    } else if (useGoogleDb) {
        iconSrc = 'GDrive.png';
        title = 'Режим: Google Drive';
    } else if (useIndexedDb) {
        // Случай, когато е избрана само база данни
        iconSrc = 'Database.png';
        title = 'Режим: База данни';
    }

    if (useIndexedDb && (useGoogleDb || useLocalFolder || useArhDb)) {
        title += ' + База данни';
    }

    let buttonHtml = `<img src="${iconSrc}" alt="${title}" style="width:24px; height:24px;">`;

    // Добавяме иконата за база данни, само ако е в комбинация с друг източник
    if (useIndexedDb && (useGoogleDb || useLocalFolder || useArhDb)) {
        buttonHtml += `<img src="Database.png" alt="Database enabled" style="width:20px; height:20px;">`;
    }

    modeButton.innerHTML = buttonHtml;
    modeButton.title = title;
}

    /**
     * Основна логика за зареждане на данни в приложението.
     * Управлява откъде и как се зареждат данните в зависимост от потребителските настройки.
     */
    async function mainLogic() {
        dbSourceGlobal = null; // Нулираме глобалните променливи
        dbNoteIdTypeGlobal = null;
        initializeLoad(); // Resets state and shows the loader screen
        const loaderTitle = document.getElementById('loader-title'); // Element to display loader title

        // Взимаме актуалните настройки от localStorage
        const useGoogleDb = localStorage.getItem('useGoogleDb') !== 'false'; // true по подразбиране
        const useLocalFolder = localStorage.getItem('useLocalDb') === 'true';
        const useArhDb = localStorage.getItem('useArhDb') === 'true';
        const useIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
        // Проверяваме за базата данни и нейното съдържание ВИНАГИ, когато useIndexedDb е true
        let boardsInDb = [];
        if (useIndexedDb) {
            dbExists = await checkDbExists(NOTES_DB_NAME);
            if (dbExists) {
                boardsInDb = await getAllFromDB(BOARD_STORE_NAME);
            }

            // ПРОВЕРКА ЗА НЕСЪОТВЕТСТВИЕ НА БАЗАТА И ИЗТОЧНИКА
            // Тази проверка се прави тук, за да обхване всички режими, които използват база данни.
            if (dbExists && boardsInDb.length > 0) {
                // Извличаме конфигурацията на базата САМО ВЕДНЪЖ тук
                dbSourceGlobal = await getConfig('dbSource');
                dbNoteIdTypeGlobal = await getConfig('dbNoteIdType');

                const dbNoteIdType = await getConfig('dbNoteIdType');
                if (dbNoteIdType) { // Проверяваме само ако типът е записан
                    // Проверяваме за несъответствие, САМО ако е избран и друг източник на данни
                    const isAnySourceActive = useGoogleDb || useLocalFolder || useArhDb;
                    if (isAnySourceActive) {
                        if ((dbNoteIdType === 'id' && !useArhDb) || (dbNoteIdType === 'gdid' && useArhDb)) {
                            showToast(_('errorDbSourceMismatch'), 15000);
                        }
                    }
                }
            }

            // ПРОВЕРКА ЗА ДОСТЪП ДО ПРИКАЧЕНИ ФАЙЛОВЕ В РЕЖИМ "САМО БАЗА ДАННИ"
            if (useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb && dbExists && boardsInDb.length > 0) {
                const dbSource = await getConfig('dbSource');
                if (dbSource === 2) { // 2: Локална папка (Local Folder)
                    const handle = await getConfig('directoryHandle');
                    const verifiedHandle = handle ? await verifyPermission(handle) : null;
                    if (verifiedHandle) {
                        dirHandle = verifiedHandle; // Задаваме handle, за да работят линковете
                    } else {
                        showToast(_('noUpdateMode'), 10000);
                    }
                } else if (dbSource === 3) { // 3: Архив (Archive)
                    const handle = await getConfig('arhHandle');
                    const verifiedHandle = handle ? await verifyPermission(handle) : null;
                    if (verifiedHandle) {
                        dirHandle = verifiedHandle; // Задаваме handle, за да работят линковете
                    } else {
                        showToast(_('noUpdateMode'), 10000);
                    }
                }
                // Ако базата е от Google Drive, не правим нищо, защото линковете ще работят,
                // стига потребителят да е логнат (което се проверява по-късно).
            }

        }

        // НОВА ПРОВЕРКА: Ако е избрана само база данни, но тя е празна
        if (useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb && dbExists && boardsInDb.length === 0) {
            showToast(_('errorDbOnlyAndEmpty'), 15000);
            document.getElementById('settings-modal').classList.add('visible');
            loaderContainer.style.display = 'none'; // Скриваме лоудъра
            return; // Прекратяваме изпълнението
        }
        try {
            // --- УСЛОВНО ЗАРЕЖДАНЕ НА GOOGLE API ---
            // Зареждаме API-то само ако ще работим с Google Drive.
            if (useGoogleDb) {
                const tokenData = checkAuth();
                if (!tokenData) {
                    // checkAuth вече е пренасочил към login.html, спираме изпълнението.
                    loaderContainer.style.display = 'none';
                    return;
                }
                try {
                    await loadScript('https://apis.google.com/js/api.js');
                } catch (error) {
                    throw new Error(_('errorGoogleLibs'));
                }
                authToken = tokenData;
                await new Promise(resolve => gapi.load('client', resolve));
                await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
                gapi.client.setToken({ access_token: authToken.access_token });
                // Проверяваме за съответствие на потребителя само ако използваме Google Drive
                await userCheck();
            }

            if (useArhDb) {
                // --- РЕЖИМ 0: Зареждане от Архив ---
                console.log("Mode: Archive");
                if (loaderTitle) loaderTitle.textContent = _('arhFolderLabel');
                const arhHandle = await getConfig('arhHandle');
                if (!arhHandle) {
                    showToast("Моля, изберете папка за архив от настройките.", 10000);
                    document.getElementById('settings-modal').classList.add('visible');
                    return; // Stop execution if no archive handle
                }
                const verifiedHandle = await verifyPermission(arhHandle);
                if (!verifiedHandle) {
                    showToast(_('permissionDenied'), 10000);
                    return; // Stop execution if no permission
                }
                dirHandle = verifiedHandle; // <-- ДОБАВЕН РЕД

                if (useIndexedDb) {
                    // Archive + IndexedDB mode
                    console.log("Mode: Archive + IndexedDB");
                    if (!dbExists || boardsInDb.length === 0) {
                        // DB is empty or does not exist, prompt for creation from archive
                        const confirmed = await showConfirmation(_('confirmCreateDbFromArh')); // "Искате ли да се създаде локална база?"
                        if (confirmed) {
                            loaderText.textContent = "Creating DB from archive...";
                            const success = await readArh(verifiedHandle); // Read archive into memory
                            if (success) {
                                const dbCreatedSuccessfully = await createDatabaseFromMemory(); // Create DB from memory
                                if (dbCreatedSuccessfully) {
                                    showToast(_('dbCreated'), 10000);
                                    await fetchAllDataLocal(); // Load from the newly created DB
                                    await renderUI({ boardParseError: false });
                                } else {
                                    showToast(_('dbCreateFailedNoData'), 10000);
                                    // Fallback to direct archive load if DB creation fails
                                    await readArh(verifiedHandle); // Re-read archive into memory for direct display
                                    await renderUI({ boardParseError: false });
                                }
                            } else {
                                // If reading archive failed, cannot create DB.
                                showToast("Failed to read archive, cannot create DB.", 10000);
                                // What to do here? Maybe just show an empty UI or an error.
                            }
                        } else {
                            // User declined to create DB, load directly from archive for this session
                            showToast(_('loadedFromArhNoDb'), 10000);
                            const success = await readArh(verifiedHandle);
                            if (success) {
                                await renderUI({ boardParseError: false });
                            }
                        }
                    } else {
                        // DB exists and has data, load from DB
                        loaderText.textContent = "Loading from local database...";
                        await fetchAllDataLocal();
                        await renderUI({ boardParseError: false });
                    }
                } else {
                    // Archive mode without IndexedDB
                    console.log("Mode: Archive (no IndexedDB)");
                    // КЛЮЧОВА СТЪПКА: Задаваме dirHandle и при директно четене
                    dirHandle = verifiedHandle;
                    const success = await readArh(verifiedHandle);
                    if (success) {
                        await renderUI({ boardParseError: false });
                    }
                }
            } else if (!useIndexedDb) {
                // --- РЕЖИМ 1: Без IndexedDB - Директно зареждане от източник ---
                console.log("Mode: Direct from source (IndexedDB is OFF)");
                if (useGoogleDb) {
                    console.log("Source: Google Drive");
                    if (loaderTitle) loaderTitle.textContent = "Google Drive";
                    const { boardParseError } = await fetchAllData(null, false); // false -> не записвай в DB
                    await renderUI({ boardParseError });
                } else if (useLocalFolder) {
                    console.log("Source: Local Folder");
                    if (loaderTitle) loaderTitle.textContent = "Локална папка";
                    const { boardParseError } = await fetchAllDataFromLocalFolder();
                    await renderUI({ boardParseError });
                }
            } else {
                // --- РЕЖИМ 2: С IndexedDB
                console.log("Mode: Using IndexedDB");
 
                if (!dbExists || boardsInDb.length === 0) {
                    // Първоначално създаване на базата данни
                    console.log("DB is empty or does not exist. Performing initial data load.");
                    if (loaderTitle) loaderTitle.textContent = _('dbManagementTitle');
                    loaderText.textContent = "Performing initial data load...";

                    if (useGoogleDb) {
                        console.log("Source for initial load: Google Drive");
                    const { boardParseError } = await fetchAllData(null);
                    await createDatabaseFromMemory();
                    await renderUI({ boardParseError });
                    } else if (useLocalFolder) {
                    console.log("Source for initial load: Local Folder");
                    const { boardParseError } = await fetchAllDataFromLocalFolder();
                    await createDatabaseFromMemory();
                    await renderUI({ boardParseError });
                    }
                showToast(_('dbCreated'), 10000);
                } else {
                    // DB exists and has data, sync from source then load from DB
                    const updateFromSource = localStorage.getItem('updateFromSource') !== 'false';
                        // Синхронизираме от източника, след което зареждаме от базата
                        console.log("Syncing from source (sync is enabled).");
                        if (useGoogleDb) {
                            console.log("Sync source: Google Drive");
                            if (loaderTitle) loaderTitle.textContent = "Google Drive Sync";
                            const updatedCount = await runGoogleDriveSync();
                            const message = updatedCount > 0
                                ? _('gdriveUpdatesFound').replace('{count}', updatedCount)
                                : _('gdriveNoUpdates');
                            showToast(message, 10000);
                        } else if (useLocalFolder) {
                            console.log("Sync source: Local Folder");
                            if (loaderTitle) loaderTitle.textContent = "Local Folder Sync";
                            await runLocalSync();
                        }
                        loaderText.textContent = "Fetching updated data from DB...";
                        await fetchAllDataLocal();
                        await renderUI({ boardParseError: false });
                    // }
                }
            }
        } catch (err) {
            console.error("Error in mainLogic:", err);
            showToast(_('errorProcessingFiles'));
            loaderContainer.style.display = 'none'; // Скриваме лоудъра при грешка
        } finally {
            loaderText.textContent = ''; // Изчистваме текста за прогреса
            loaderContainer.style.display = 'none';
            updateSearchPlaceholder();
            document.body.style.backgroundImage = `url('Board.png')`; // Reset background
            notesContainer.style.backgroundImage = `url('Board.png')`; // Reset background
            updateModeButton(); // Актуализираме иконата за режим
        }
    }

    /**
     * Зарежда всички данни директно от локална папка, без да използва IndexedDB.
     * Аналогична на fetchAllData, но за локален източник.
     */
    async function fetchAllDataFromLocalFolder() {
        const handle = await getDirectoryHandle();
        if (!handle) {
            window.wasOpenedForMissingFolder = true; // Вдигаме флага
            showToast(_('errorLocalFolderNotSelected'), 10000);
            document.getElementById('settings-modal').classList.add('visible');
            return { boardParseError: false };
        }

        let localBoards = [];
        let localMedia = [];
        let localNotes = [];
        let boardParseError = false;

        try {
            for await (const entry of handle.values()) {
                if (entry.kind !== 'file' || !entry.name.toLowerCase().endsWith('.txt')) continue;

                // Показваме името на файла, който се обработва
                loaderText.textContent = `${_('loadingFile')} ${entry.name}`;

                const file = await entry.getFile();
                const content = await file.text();
                const fileObject = JSON.parse(content);
                const lowerCaseName = entry.name.toLowerCase();

                if (lowerCaseName.includes('board')) {
                    localBoards.push(fileObject);
                } else if (lowerCaseName.includes('media')) {
                    localMedia.push(fileObject);
                } else if (lowerCaseName.includes('note')) {
                    localNotes.push({
                        file: { name: entry.name },
                        content: fileObject,
                        rawData: { file: { name: entry.name }, res: { body: content } }
                    });
                }
            }
        } catch (e) {
            console.error("Error parsing local files:", e);
            boardParseError = true; // Set a general parse error flag
            showToast(_('errorNoteParse'));
        }

        // Зареждаме данните в глобалните променливи
        boardsData = localBoards.flat(); // .flat() за всеки случай, ако някой файл съдържа масив
        mediaData = localMedia.flat();
        allNotesData = localNotes;

        return { boardParseError };
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
    const useIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
    if (!useIndexedDb) {
        console.log("Skipping local sync because IndexedDB is disabled for this mode.");
        return;
    }

    const lastLocalTimestamp = await getConfig('lastLocalTimestamp');
    const updateDate = lastLocalTimestamp ? new Date(lastLocalTimestamp) : null;
    let updatedCount = 0;
    const handle = await getDirectoryHandle();
    if (!handle) return;

    loaderText.textContent = updateDate ? `Updating files since ${updateDate.toLocaleString()}...` : "Performing full initial sync...";

    // Коригирана проверка: използваме 'updateFromSource' вместо старата 'updateIndexedDb'
    if (localStorage.getItem('updateFromSource') !== 'false') {
        updatedCount = await processDirectoryContent(lastLocalTimestamp);
        await saveConfig('lastLocalTimestamp', Date.now());
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
 * Проверява дали избраната папка съдържа само файлове от очаквания тип.
 * Функцията проверява дали файловете в основната директория започват с 'note', 'media', или 'board' и завършват на '.txt'.
 * Игнорира под-директории и скрити файлове (започващи с точка).
 * @param {FileSystemDirectoryHandle} directoryHandle - Handle на папката за проверка.
 * @returns {Promise<{isValid: boolean, invalidFile: string|null}>} 
 * Връща обект, който показва дали папката е валидна (`isValid`) 
 * и името на първия невалиден файл (`invalidFile`), ако такъв е намерен.
 */
async function validateFolderContent(directoryHandle) {
    const boardPattern = /^board.*\.txt$/i;
    const notePattern = /^note.*\.txt$/i;
    let boardFileCount = 0;
    let noteFileCount = 0;
    try {
        for await (const entry of directoryHandle.values()) {
            if (entry.kind === 'file') {
                if (boardPattern.test(entry.name)) {
                    boardFileCount++;
                } else if (notePattern.test(entry.name)) {
                    noteFileCount++;
                }
                // Прекъсваме проверката веднага щом условията са изпълнени
                if (boardFileCount >= 1 && noteFileCount >= 3) {
                    console.log(`Validation successful: Found at least 1 board file and 3 note files.`);
                    return { isValid: true, reason: null };
                }
            }
        }
    } catch (error) {
        console.error("Error during folder validation:", error);
        return { isValid: false, reason: 'error' };
    }
    // Ако цикълът приключи без да са изпълнени условията
    console.log(`Validation failed: Found ${boardFileCount} board file(s) and ${noteFileCount} note file(s). Required: >=1 board, >=3 notes.`);
    return { isValid: false, reason: 'criteria_not_met' };
}

async function validateArhFolderContent(directoryHandle) {
    const boardPattern = /^boards.*\.bcp$/i;
    const notePattern = /^notes.*\.bcp$/i;
    let boardsFile = false;
    let notesFile = false
    try {
        for await (const entry of directoryHandle.values()) {
            if (entry.kind === 'file') {
                if (boardPattern.test(entry.name)) {
                    boardsFile = true;
                } else if (notePattern.test(entry.name)) {
                    notesFile = true;
                }
                // Прекъсваме проверката веднага щом условията са изпълнени
                if (boardsFile && notesFile) {
                    console.log(`Arh validation successful: Found files.`);
                    return { isValid: true, reason: null };
                }
            }
        }
    } catch (error) {
        console.error("Error during arh folder validation:", error);
        return { isValid: false, reason: 'error' };
    }
    // Ако цикълът приключи без да са изпълнени условията
    console.log('Arh validation failed: Not found boards.bcp or notes.bcp.');
    return { isValid: false, reason: 'criteria_not_met' };
}


/**
 * Взима handle на директория - от паметта, от IndexedDB или чрез избор от потребителя.
 * @param {boolean} promptUser - Дали да се покаже диалог за избор, ако няма запазен handle.
 * @returns {Promise<FileSystemDirectoryHandle|null>}
 */
async function getDirectoryHandle(promptUser = false) {
    try {
        // Определяме кой handle да заредим въз основа на активната настройка в localStorage
        const useLocal = localStorage.getItem('useLocalDb') === 'true';
        const useArh = localStorage.getItem('useArhDb') === 'true';
        const configKey = useLocal ? 'directoryHandle' : (useArh ? 'arhHandle' : null);

        const savedHandle = configKey ? await getConfig(configKey) : null;
        if (savedHandle) {
            const verifiedHandle = await verifyPermission(savedHandle);
            if (verifiedHandle) {
                dirHandle = verifiedHandle;
                return dirHandle;
            }
        }

        if (promptUser) {
            const newHandle = await window.showDirectoryPicker();
            // Запазването ще се случи в извикващата функция СЛЕД валидация.
            // dirHandle = newHandle; // Глобалната променлива също ще се зададе там.
            return newHandle;
        }
        if (localStorage.getItem('useLocalDb') === 'true') showToast(_('errorLocalFolderNotSelected'), 10000);
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
    // --- КЛЮЧОВА ПРОВЕРКА ---
    // Ако опцията за използване на IndexedDB е изключена, не трябва да записваме нищо.
    if (localStorage.getItem('useIndexedDb') !== 'true') {
        console.log("Skipping processDirectoryContent because useIndexedDb is disabled.");
        return 0; // Връщаме 0, защото нищо не е обновено.
    }

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
        const modalContentBox = contentModal.querySelector('.modal-content-box');

        // Прилагаме запазените размери, ако съществуват
        const savedWidth = localStorage.getItem('modalWidth');
        const savedHeight = localStorage.getItem('modalHeight');

        if (savedWidth && savedHeight) {
            modalContentBox.style.width = savedWidth;
            modalContentBox.style.height = savedHeight;
            modalContentBox.style.maxWidth = 'none';
            modalContentBox.style.maxHeight = 'none';
        } else {
            // Връщаме към CSS стойностите по подразбиране, ако няма запазен размер
            modalContentBox.style.width = '';
            modalContentBox.style.height = '';
            modalContentBox.style.maxWidth = '';
            modalContentBox.style.maxHeight = '';
        }
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
        const boardsModal = document.getElementById('boards-menu-modal');
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
                boardsModal.classList.remove('visible');
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

        const boardsModalBody = document.getElementById('boards-menu-modal-body');
        boardsModalBody.innerHTML = '';
        boardsModalBody.appendChild(modalContent);
        const modalBox = boardsModal.querySelector('.modal-content-box');
        if (anchorElement) {
            const rect = anchorElement.getBoundingClientRect();
            boardsModal.classList.add('popup-mode');
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
            boardsModal.classList.remove('popup-mode'); // Revert to default centered modal
        }
        boardsModal.classList.add('visible');
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
        // --- Проверка за съществуващ борд ---
        // Ако boardId не е специален изглед ('all', 'calendar', 'reminder')
        // и не съществува в boardsData, превключваме към 'all'.
        const specialBoards = ['all', 'calendar', 'reminder'];
        if (!specialBoards.includes(boardId)) {
            const boardExists = boardsData.some(b => b.gdid === boardId);
            if (!boardExists) {
                console.warn(`Board with ID '${boardId}' not found. Defaulting to 'all'.`);
                boardId = 'all';
            }
        }
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
        updateSearchPlaceholder();
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

        // Scroll the main board menu to the selected board
        const selectedButtonInMenu = document.querySelector(`.board-menu-container .board-filter-link[data-boardid="${boardId}"]`);
        if (selectedButtonInMenu) {
            selectedButtonInMenu.scrollIntoView({
                behavior: 'smooth',
                inline: 'center',
                block: 'nearest'
            });
        }
    }

    /**
     * Сортира и пренарежда видимите бележки в DOM.
     * @param {Array<Object>} visibleNotes - Масив от обекти, съдържащи {element, numord}.
     */
    function sortAndReorderNotes(visibleNotes) {
        // Сортираме видимите бележки по numord
        visibleNotes.sort((a, b) => {
            const numordA = (a.numord !== undefined && a.numord !== null) ? a.numord : Infinity;
            const numordB = (b.numord !== undefined && b.numord !== null) ? b.numord : Infinity;
            return numordA - numordB;
        });

        // Подреждаме елементите в DOM според сортирания ред
        // Започваме отзад-напред, за да вмъкваме в началото, което е по-ефективно
        for (let i = visibleNotes.length - 1; i >= 0; i--) {
            notesContainer.prepend(visibleNotes[i].element);
        }

        // Връщаме boards-note винаги най-отгоре в DOM дървото на контейнера
        const boardsNote = document.querySelector('header .boards-note');
        if (boardsNote) {
            document.querySelector('header').appendChild(boardsNote);
        }
    }

    function applySearchFilter() {
        applyFilters();
    }

    function applyFilters() {
        const searchTerm = searchBox.value.toLowerCase();
        const notes = Array.from(notesContainer.getElementsByClassName('note'));
        const visibleNotes = [];

        let visibleCount = 0;

        for (const note of notes) {
            if (note.classList.contains('boards-note')) {
                continue;
            }

            const extraInfo = note.dataset.extraInfo;
            let data = {};
            try {
                if (extraInfo) data = JSON.parse(extraInfo);
            } catch (e) { console.error('Error parsing extraInfo for note:', e); }

            const isVisibleByBoard = (currentBoardFilter === 'all') ||
                                     (currentBoardFilter === 'reminder' && data.timer && data.timer !== 0) ||
                                     (data.boardid === currentBoardFilter);

            const isVisibleBySearch = (() => {
                if (!searchTerm) return true;
                if (searchMode === 'title') {
                    const titleEl = note.querySelector('h3');
                    return titleEl ? titleEl.textContent.toLowerCase().includes(searchTerm) : false;
                } else { // searchMode === 'content'
                    const contentEl = note.querySelector('.note-content');
                    return contentEl ? contentEl.textContent.toLowerCase().includes(searchTerm) : false;
                }
            })();

            if (isVisibleByBoard && isVisibleBySearch) {
                visibleNotes.push({ element: note, numord: data.numord });
                visibleCount++;
                note.style.display = 'flex'; // Показваме го временно, за да се избегне "премигване"
            } else {
                note.style.display = 'none';
            }
        }

        // Сортираме само ако опцията е включена
        if (localStorage.getItem('enableNoteSorting') === 'true') {
            sortAndReorderNotes(visibleNotes);
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
                console.log(`File '${fileName}' not found in folder '${folderId}'.`);
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
                    console.log(`Folder '${name}' not found within 'multinotes_data'.`);
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
                console.log("Folder 'multinotes_data' not found.");
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
        // Сортираме бордовете по полето numord, преди да създадем бутоните
        boardsData.sort((a, b) => {
            const numordA = a.numord !== undefined && a.numord !== null ? a.numord : Infinity;
            const numordB = b.numord !== undefined && b.numord !== null ? b.numord : Infinity;
            return numordA - numordB;
        })
        .forEach(board => {
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
        // The contentEl (which holds the buttons) goes inside the scrollWrapper
        scrollWrapper.appendChild(contentEl);
        contentWrapper.appendChild(scrollWrapper);
        const checkScroll = () => {
            leftArrow.classList.toggle('visible', true); // The button is now always visible
        };
        contentEl.addEventListener('scroll', checkScroll);
        new ResizeObserver(checkScroll).observe(contentEl);
        return boardsNote;
    }

    async function createSettingsUI(boardsData, boardParseError) {
        const settingsModalBody = document.getElementById('settings-modal-body');
        // --- Get Element References ---
        const scaleSlider = document.getElementById('scaleSlider');
        const scaleInput = document.getElementById('scaleInput');
        const noteFontSizeInput = document.getElementById('note-font-size-input');
        const modalFontSizeInput = document.getElementById('modal-font-size-input');
        const showDatemodCheckbox = document.getElementById('show-datemod-checkbox');
        const orderCheckbox = document.getElementById('order-checkbox');
        // const startBoardSelect = document.getElementById('start-board-select');
        const maxSearchesInput = document.getElementById('max-searches-input');
        const useGoogleDbCheckbox = document.getElementById('use-google-db-checkbox');
        const useLocalDbCheckbox = document.getElementById('use-local-db-checkbox');
        const useArhDbCheckbox = document.getElementById('use-arh-db-checkbox');
        const useIndexedDbCheckbox = document.getElementById('use-indexeddb-checkbox');
        const updateFromSourceCheckbox = document.getElementById('update-from-source-checkbox');
        const dbSectionWrapper = document.getElementById('db-section-wrapper');
        const updateFromSourceWrapper = document.getElementById('update-from-source-wrapper');
        const selectFolderBtn = document.getElementById('select-folder-btn');
        const folderNameDisplay = document.getElementById('local-sync-folder-name');
        const settingsCloseBtn = document.getElementById('settings-close-btn');
        if (!settingsModalBody.dataset.initialized) {

            // Zooom
            const updateZoom = (value) => {
                value = Math.max(25, Math.min(175, parseInt(value, 10)));
                if (isNaN(value)) value = 100;
                notesContainer.style.zoom = value / 100;
                scaleSlider.value = value;
                scaleInput.value = value;
            };
            let savedZoom = localStorage.getItem('zoomLevel');
            if (savedZoom) {
                scaleSlider.value = savedZoom;
                updateZoom(savedZoom);
            } else {
                updateZoom(scaleSlider.value);
            }
            const applyBtn = document.getElementById('applyZoomBtn');
            applyBtn.addEventListener('click', () => {
                const zoomValue = scaleInput.value;
                updateZoom(zoomValue);
                localStorage.setItem('zoomLevel', zoomValue);
                showToast(_('settingSaved'), 2000);
            });
            scaleInput.addEventListener('change', () => {
                const zoomValue = scaleInput.value;
                updateZoom(zoomValue);
                localStorage.setItem('zoomLevel', zoomValue);
            });
            scaleSlider.addEventListener('input', () => {
                const zoomValue = scaleSlider.value;
                updateZoom(zoomValue);
                localStorage.setItem('zoomLevel', zoomValue);
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

            // Fonts
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

            // Date
            showDatemodCheckbox.checked = localStorage.getItem('showDatemod') !== 'false'; // Default to true
            showDatemodCheckbox.addEventListener('change', () => {
                const isChecked = showDatemodCheckbox.checked;
                localStorage.setItem('showDatemod', isChecked);
                document.body.classList.toggle('hide-datemod', !isChecked);
                showToast(_('settingSaved'), 2000);
            });

            // Order checkbox
            orderCheckbox.checked = localStorage.getItem('enableNoteSorting') === 'true';
            const sortingOptionsSection = document.getElementById('sorting-options-section');

            // Function to toggle visibility of the sorting options
            const toggleSortingOptions = () => {
                if (orderCheckbox.checked) {
                    sortingOptionsSection.style.display = 'block';
                } else {
                    sortingOptionsSection.style.display = 'none';
                }
            };

            // Initial check
            toggleSortingOptions();

            orderCheckbox.addEventListener('change', () => {
                localStorage.setItem('enableNoteSorting', orderCheckbox.checked);
                toggleSortingOptions();
                applyFilters(); // Прилагаме филтрите, за да се отрази сортирането веднага
                showToast(_('settingSaved'), 2000);
            });

            // Start Board
            let startBoardSelect; // Declare here to be accessible in the whole function
            startBoardSelect = document.getElementById('start-board-select');
            startBoardSelect.value = localStorage.getItem('startBoard') || 'all';
            startBoardSelect.addEventListener('change', () => {
                localStorage.setItem('startBoard', startBoardSelect.value);
                showToast(_('settingSaved'), 2000);
            });

            // Max Searches
            // let maxSearchesInput; // Declare here as well
            maxSearchesInput.value = maxSavedSearches;
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

            // --- New Data Source Selection Logic ---
            const dataSources = [
                { checkbox: useGoogleDbCheckbox, key: 'useGoogleDb' },
                { checkbox: useLocalDbCheckbox, key: 'useLocalDb' },
                { checkbox: useArhDbCheckbox, key: 'useArhDb' }
            ];

            const handleDataSourceChange = (changedCheckbox, changedKey) => {
                // Ако се опитваме да премахнем отметка и базата данни НЕ съществува
                if (!changedCheckbox.checked && !dbExists) {
                    showToast("Трябва да има избран поне един източник на данни, когато не се използва База данни.", 5000);
                    // Не позволяваме премахването, като връщаме отметката
                    changedCheckbox.checked = true;
                    return;
                }
                if (changedCheckbox.checked) {
                    // Uncheck all other data sources
                    dataSources.forEach(({ checkbox, key }) => {
                        if (key !== changedKey) {
                            checkbox.checked = false;
                            localStorage.setItem(key, 'false');
                        }
                    });
                    // Автоматично отваряне на диалога за избор на папка, ако не е избрана
                    if (changedKey === 'useLocalDb') {
                        const folderNameDisplay = document.getElementById('local-sync-folder-name');
                        if (folderNameDisplay.textContent === _('folderNotSelected')) {
                            document.getElementById('select-folder-btn').click();
                        }
                    } else if (changedKey === 'useArhDb') {
                        const arhFolderNameDisplay = document.getElementById('arh-folder-name');
                        if (arhFolderNameDisplay.textContent === _('folderNotSelected')) {
                            document.getElementById('select-arh-btn').click();
                        }
                    }
                }
                // Save the state of the changed checkbox
                localStorage.setItem(changedKey, changedCheckbox.checked);
                showToast(_('settingSaved'), 2000);
            };

            dataSources.forEach(({ checkbox, key }) => {
                checkbox.addEventListener('change', () => handleDataSourceChange(checkbox, key));
            });

            // indexedDB
            const dbSectionWrapper = document.getElementById('db-section-wrapper');
            const useIndexedDbCheckbox = document.getElementById('use-indexeddb-checkbox');
            // Задаваме първоначалното състояние на чекбокса от localStorage
            useIndexedDbCheckbox.checked = localStorage.getItem('useIndexedDb') === 'true';
            // Add event listeners
            useIndexedDbCheckbox.addEventListener('change', () => {
                localStorage.setItem('useIndexedDb', useIndexedDbCheckbox.checked);
                showToast(_('settingSaved'), 2000);
            });

            // Accordion logic
            const accordionHeader = document.querySelector('.accordion-header');
            if (accordionHeader) {
                accordionHeader.addEventListener('click', () => {
                    const accordion = accordionHeader.parentElement;
                    accordion.classList.toggle('active');
                    const content = accordion.querySelector('.accordion-content');
                    const settingsModalBody = document.getElementById('settings-modal-body');
                    if (content.style.maxHeight) {
                        content.style.maxHeight = null;
                        if (settingsModalBody) {
                            settingsModalBody.style.overflowY = 'auto'; // Възстановяваме скролбара, ако е бил скрит
                        }
                    } else {
                        content.style.maxHeight = content.scrollHeight + "px";
                        // Скролираме модала надолу, за да видим отворената секция
                        if (settingsModalBody) {
                            // Временно скриваме скролбара, докато се скролира
                            settingsModalBody.style.overflowY = 'hidden';
                            // Изчакваме анимацията на акордеона да завърши (300ms)
                            setTimeout(() => {
                                settingsModalBody.scrollTo({
                                    top: settingsModalBody.scrollHeight,
                                    behavior: 'smooth'
                                });
                                // Изчакваме и скролирането да приключи (още около 500ms)
                                setTimeout(() => {
                                    settingsModalBody.style.overflowY = 'auto'; // Възстановяваме скролбара
                                }, 500);
                            }, 300);
                        }
                    }
                });
            }

            // --- End of DB Section ---

            // DB delete
            const createDbBtn = document.getElementById('create-db-btn');
            createDbBtn.addEventListener('click', async () => {
                let confirmed = false;
 
                // Проверяваме дали базата съществува И дали не е празна.
                const boardsInDb = dbExists ? await getAllFromDB(BOARD_STORE_NAME) : [];
 
                if (dbExists && boardsInDb.length > 0) {
                    // Показваме диалог за потвърждение само ако базата съществува и има данни.
                    document.getElementById('settings-modal').classList.remove('visible');
                    await new Promise(resolve => setTimeout(resolve, 150));
                    confirmed = await showConfirmation(_('confirmDbRecreate'));
                } else {
                    // Ако базата не съществува или е празна, продължаваме директно със създаването.
                    confirmed = true;
                }

                if (confirmed) {
                    const success = await createDatabaseFromMemory();
                    if (success) {
                        showToast(_('dbCreated'), 10000);
                        dbExists = true;
                    }
                }
            });

            const deleteDbBtn = document.getElementById('delete-db-btn');
            deleteDbBtn.addEventListener('click', async () => {
                document.getElementById('settings-modal').classList.remove('visible');
                // Изчакваме анимацията на затваряне да приключи, преди да покажем новия диалог
                await new Promise(resolve => setTimeout(resolve, 150));
                const confirmedDataDelete = await showConfirmation(_('confirmDbDelete'));
                if (confirmedDataDelete) {
                    const confirmedConfigDelete = await showConfirmation(_('confirmConfigDelete'));
                    if (confirmedConfigDelete) {
                        // Потребителят иска да изтрие всичко, включително настройките
                        await deleteNotesDB();
                        // Нулираме UI елементите за избраните папки
                        const folderNameDisplay = document.getElementById('local-sync-folder-name');
                        const arhFolderNameDisplay = document.getElementById('arh-folder-name');
                        if (folderNameDisplay) folderNameDisplay.textContent = _('folderNotSelected');
                        if (arhFolderNameDisplay) arhFolderNameDisplay.textContent = _('folderNotSelected');
                        dirHandle = null; // Нулираме и handle-a в паметта
                    } else {
                        // Потребителят иска да изтрие само данните, но да запази настройките
                        await clearDbStores();
                    }
                showToast(_('dbDeleted'), 10000);
                // Изчистваме настройката за стартов борд, тъй като бордовете вече не съществуват
                localStorage.removeItem('startBoard');
                }
            });

            // Set initial states from localStorage
            useGoogleDbCheckbox.checked = localStorage.getItem('useGoogleDb') !== 'false'; // Default to true
            useLocalDbCheckbox.checked = localStorage.getItem('useLocalDb') === 'true';
            useArhDbCheckbox.checked = localStorage.getItem('useArhDb') === 'true';

            // --- Local Sync Folder ---
            const selectFolderBtn = document.getElementById('select-folder-btn');
            const folderNameDisplay = document.getElementById('local-sync-folder-name');
            selectFolderBtn.addEventListener('click', async () => {
                try {
                    const handle = await window.showDirectoryPicker();
                    if (handle) {
                        const validationResult = await validateFolderContent(handle);
                        if (!validationResult.isValid) {
                            let warningMessage = `Папката '${handle.name}' не изглежда като валидна папка с данни.`;
                            if (validationResult.reason === 'criteria_not_met') {
                                warningMessage += " Необходимо е да съдържа поне 1 'board' файл и 3 'note' файла.";
                            }
                            showToast(warningMessage, 15000);
                            return;
                        }
                        await saveConfig('directoryHandle', handle);
                        dirHandle = handle;
                        folderNameDisplay.textContent = handle.name;
                        folderNameDisplay.title = handle.name;
                        showToast(_('folderSelectedForSync').replace('{folderName}', handle.name), 10000);
                        document.getElementById('settings-modal').classList.remove('visible');
                        mainLogic();
                    }
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error("Error selecting directory:", error);
                    }
                }
            });

            // --- Archive Folder Setting ---
            const selectArhBtn = document.getElementById('select-arh-btn');
            const arhFolderNameDisplay = document.getElementById('arh-folder-name');
            selectArhBtn.addEventListener('click', async () => {
                try {
                    const handle = await window.showDirectoryPicker(); // Prompt user to select
                    if (handle) {
                        const validationArh = await validateArhFolderContent(handle);
                        if (!validationArh.isValid) {
                            let warningMessage = `Папката '${handle.name}' не изглежда като валидна папка с архив.`;
                            if (validationArh.reason === 'criteria_not_met') {
                                warningMessage += " Необходимо е да съдържа boards.bcp и notes.bcp.";
                            }
                            showToast(warningMessage, 15000);
                            return;
                        }
                        arhFolderNameDisplay.textContent = handle.name;
                        arhFolderNameDisplay.title = handle.name;
                        dirHandle = handle; // <--- ДОБАВЕН РЕД
                        await saveConfig('arhHandle', handle); // Запазваме избраната папка
                        document.getElementById('settings-modal').classList.remove('visible');
                        showToast(_('folderSelectedForArh').replace('{folderName}', handle.name), 5000);
                        // След избор, просто презареждаме основната логика,
                        // която вече ще види, че е избран режим "Архив".
                        mainLogic();
                    }
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error("Error selecting directory:", error);
                    }
                }
            });
            
            // Close
            const settingsCloseBtn = document.getElementById('settings-close-btn');
            settingsCloseBtn.addEventListener('click', () => {
                const currentState = {
                    useGoogleDb: document.getElementById('use-google-db-checkbox').checked,
                    useLocalDb: document.getElementById('use-local-db-checkbox').checked,
                    useArhDb: document.getElementById('use-arh-db-checkbox').checked,
                    useIndexedDb: document.getElementById('use-indexeddb-checkbox').checked
                };

                document.getElementById('settings-modal').classList.remove('visible');

                const hasChanged = JSON.stringify(settingsInitialState) !== JSON.stringify(currentState);

                // Ако прозорецът е бил отворен принудително, презареждаме данните.
                if (window.wasOpenedForMissingFolder) {
                    window.wasOpenedForMissingFolder = false; // Нулираме флага
                    mainLogic(); // Извикваме основната логика отново
                } else if (hasChanged) {
                    mainLogic(); // Извикваме основната логика отново
                }
            });
            settingsModalBody.dataset.initialized = true;
    }

    }

    (async () => {
        const arhFolderNameDisplay = document.getElementById('arh-folder-name');
        const arhHandle = await getConfig('arhHandle'); // Опитваме да вземем handle от базата
        if (arhHandle) {
            // Проверяваме дали имаме разрешение, без да питаме потребителя отново
            const permission = await arhHandle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                arhFolderNameDisplay.textContent = arhHandle.name;
                arhFolderNameDisplay.title = arhHandle.name;
            } else { 
                arhFolderNameDisplay.textContent = _('permissionDenied'); // Показваме новото съобщение
                arhFolderNameDisplay.style.color = 'red';
            }
        } else { arhFolderNameDisplay.textContent = _('folderNotSelected'); }
    })();

    // Асинхронно зареждане на името на папката за локална синхронизация
    (async () => {
        const folderNameDisplay = document.getElementById('local-sync-folder-name');
        const syncHandle = await getConfig('directoryHandle'); // Четем директно handle-a за синхронизация
        if (syncHandle) {
            const permission = await syncHandle.queryPermission({ mode: 'readwrite' });
            if (permission === 'granted') {
                folderNameDisplay.textContent = syncHandle.name;
                folderNameDisplay.title = syncHandle.name;
            } else {
                folderNameDisplay.textContent = _('permissionDenied');
            }
        } else { folderNameDisplay.textContent = _('folderNotSelected'); }
    })();


    /**
     * Попълва падащото меню за избор на стартов борд в настройките.
     */
    function populateStartBoardSelect() {
        const startBoardSelect = document.getElementById('start-board-select');
        const savedValue = localStorage.getItem('startBoard') || 'all'; // Взимаме запазената стойност или 'all' по подразбиране
        // Изчистваме напълно списъка, преди да го попълним наново
        startBoardSelect.innerHTML = `
            <option value="all">${_('allBoards')}</option>
            <option value="calendar">${_('calendar')}</option>
            <option value="reminder">${_('reminder')}</option>
        `;
        boardsData.forEach(board => { if (board.gdid && board.title) startBoardSelect.add(new Option(board.title, board.gdid)); });
        startBoardSelect.value = savedValue; // Задаваме правилната стойност
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
     * Форматира текстов низ възоснова на JSON параметри.
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

    /**
     * Обработва и създава UI за прикачен файл от локална папка.
     * @param {object} attachment - Обектът на прикачения файл.
     * @param {HTMLElement} attachmentWrapper - Елементът, в който да се добави UI.
     * @param {object} iconData - SVG иконата за типа на файла.
     */
async function handleAttachment(attachment, attachmentWrapper, iconData, mode = 'local') {
    const iconDiv = document.createElement('div');
    iconDiv.innerHTML = iconData.svg;

    const filename = attachment.path ? attachment.path.split('/').pop() : '';
    const archiveFolderName = dirHandle.name;

    const createLink = async (folderName, textPrefix) => {
        const link = document.createElement('a');
        link.href = '#';
        link.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!filename) return;
            console.log(`Opening file: ${folderName}/${filename}   DirHandle:`, dirHandle);
            try {
                const fileHandle = mode === 'local'
                    ? await (await dirHandle.getDirectoryHandle(folderName)).getFileHandle(filename)
                    : await dirHandle.getFileHandle(attachment.path);
                const file = await fileHandle.getFile();
                window.open(URL.createObjectURL(file), '_blank');
            } catch (err) {
                console.error(`Could not open local file ${folderName}/${filename}`, err);
                showToast(_('errorOpenFile').replace('{filename}', filename));
            }
        };
        link.textContent = textPrefix + (mode === 'local' ? filename : attachment.path);
        return link;
    };

    const appendWithDescription = async (folder, prefix, description) => {
        const container = document.createElement('div');
        container.style.flexGrow = '1';
        container.style.flexShrink = '1';
        container.style.minWidth = '0';
        container.appendChild(await createLink(folder, prefix));
        const line2 = document.createElement('div');
        line2.textContent = description || '';
        container.appendChild(line2);
        attachmentWrapper.appendChild(container);
    };

    switch (attachment.type) {
        case 1: // Image
            attachmentWrapper.appendChild(await createLink(
                mode === 'local' ? 'Images' : '',
                mode === 'local' ? 'Images/' : '' // `${archiveFolderName}/`
            ));
            break;
        case 2: // Sound
            await appendWithDescription(
                mode === 'local' ? 'Sound' : '',
                mode === 'local' ? 'Sound/' : '', // `${archiveFolderName}/`
                attachment.description
            );
            break;
        case 3: // Other
            attachmentWrapper.appendChild(await createLink(
                mode === 'local' ? 'Other' : '',
                mode === 'local' ? 'Other/' : '' // `${archiveFolderName}/`
            ));
            break;
        case 4: // Video
            await appendWithDescription(
                mode === 'local' ? 'Video' : '',
                mode === 'local' ? 'Video/' : '', // `${archiveFolderName}/`
                attachment.description
            );
            break;
        case 5: // Location
            const parts = attachment.path.split('|');
            if (parts.length >= 3) {
                const [lat, lng, label] = parts;
                const textContainer = document.createElement('div');
                const link = document.createElement('a');
                link.textContent = `${lat}, ${lng}`;
                link.href = `https://www.google.com/maps?q=${lat},${lng}(${encodeURIComponent(label)})`;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.onclick = (e) => e.stopPropagation();
                textContainer.appendChild(link);
                const line2 = document.createElement('div');
                line2.textContent = label;
                textContainer.appendChild(line2);
                attachmentWrapper.appendChild(textContainer);

                iconDiv.style.cursor = 'pointer';
                iconDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showModal(JSON.stringify(attachment, null, 2));
                });
            }
            break;
    }

    iconDiv.style.cursor = 'pointer';
    iconDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        showModal(JSON.stringify(attachment, null, 2));
    });

    attachmentWrapper.prepend(iconDiv);
}

    /**
     * Обработва и създава UI за прикачен файл от Google Drive.
     * @param {object} attachment - Обектът на прикачения файл.
     * @param {HTMLElement} attachmentWrapper - Елементът, в който да се добави UI.
     * @param {object} iconData - SVG иконата за типа на файла.
     */
    async function handleGoogleDriveAttachment(attachment, attachmentWrapper, iconData) {
        const iconDiv = document.createElement('div');
        iconDiv.innerHTML = iconData.svg;

        if (!attachment.path) {
            iconDiv.style.cursor = 'pointer';
            iconDiv.addEventListener('click', (e) => { e.stopPropagation(); showModal(JSON.stringify(attachment, null, 2)); });
            attachmentWrapper.prepend(iconDiv);
            return;
        }

        const filename = attachment.path.split('/').pop();
        const link = document.createElement('a');

        // Оптимизация: Премахваме API заявката оттук и я местим в onclick събитието.
        const setupLink = (folderName, textPrefix) => {
            link.href = '#'; // href вече не сочи директно към файла.
            link.textContent = textPrefix + filename;
            link.dataset.folderName = folderName; // Запазваме името на папката в data атрибут.
            link.dataset.fileName = filename;     // Запазваме името на файла в data атрибут.
            link.title = `Click to open ${filename} from Google Drive`;

            link.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!checkAuth()) return;

                showToast(`${_('loadingFile')} ${link.dataset.fileName}...`, 2000);
                const fileId = await getFileID(folderIds[link.dataset.folderName], link.dataset.fileName);
                if (fileId) {
                    window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank', 'noopener,noreferrer');
                } else {
                    showToast(_('errorFetchFileId').replace('{fileName}', link.dataset.fileName));
                }
            };
        };

        const showPreview = async (folderName) => {
            const noteEl = attachmentWrapper.closest('.note');
            if (!noteEl || noteEl.querySelector('.image-preview-overlay')) return;
            try {
                const fileMetadata = await gapi.client.drive.files.get({ fileId: fileId, fields: 'thumbnailLink' });
                const thumbnailUrl = fileMetadata.result.thumbnailLink;
                if (thumbnailUrl) {
                    if (titleEl) titleEl.style.visibility = 'hidden';
                    const overlay = document.createElement('div');
                    overlay.className = 'image-preview-overlay';
                    Object.assign(overlay.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '10', borderRadius: '8px' });
                    overlay.addEventListener('click', () => window.open(link.href, '_blank'));
                    const img = document.createElement('img');
                    img.src = thumbnailUrl.replace(/=s\d+/, '=s1600');
                    Object.assign(img.style, { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', padding: '10px', boxSizing: 'border-box' });
                    overlay.appendChild(img);
                    const closeButton = document.createElement('button');
                    closeButton.className = 'view-button';
                    closeButton.innerHTML = eyeOffIconSvg;
                    Object.assign(closeButton.style, { position: 'absolute', top: '10px', right: '10px' });
                    const svg = closeButton.querySelector('svg');
                    if (svg) svg.style.stroke = 'white';
                    closeButton.addEventListener('click', (ev) => { ev.stopPropagation(); overlay.remove(); if (titleEl) titleEl.style.visibility = 'visible'; });
                    overlay.appendChild(closeButton);
                    noteEl.appendChild(overlay);
                } else {
                    showToast(folderName === 'Images' ? _('noImgPreview') : _('noVideoPreview'));
                }
            } catch (err) {
                console.error(`Error fetching ${folderName} preview:`, err);
                const errorKey = folderName === 'Images' ? 'errorImgPreview' : 'errorVideoPreview';
                showToast(_(errorKey).replace('{error}', (err.message || err)));
            }
        };

        switch (attachment.type) {
            case 1: // Image
                setupLink('Images', 'Images/');
                iconDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    showPreview('Images');
                });
                attachmentWrapper.appendChild(link);
                break;
            case 2: // Sound
                setupLink('Sound', 'Sound/');
                const soundTextContainer = document.createElement('div');
                soundTextContainer.style.flexGrow = '1';
                soundTextContainer.style.flexShrink = '1';
                soundTextContainer.style.minWidth = '0';
                soundTextContainer.appendChild(link);
                const soundLine2 = document.createElement('div');
                soundLine2.textContent = attachment.description || '';
                soundTextContainer.appendChild(soundLine2);
                attachmentWrapper.appendChild(soundTextContainer);
                break;
            case 3: // Other
                setupLink('Other', 'Other/');
                attachmentWrapper.appendChild(link);
                break;
            case 4: // Video
                setupLink('Video', 'Video/');
                const videoTextContainer = document.createElement('div');
                videoTextContainer.style.flexGrow = '1';
                videoTextContainer.style.flexShrink = '1';
                videoTextContainer.style.minWidth = '0';
                videoTextContainer.appendChild(link);
                const videoLine2 = document.createElement('div');
                videoLine2.textContent = attachment.description || '';
                videoTextContainer.appendChild(videoLine2);
                iconDiv.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    showPreview('Video');
                });
                attachmentWrapper.appendChild(videoTextContainer);
                break;
            case 5: // Location
                const parts = attachment.path.split('|');
                if (parts.length >= 3) {
                    const textContainer = document.createElement('div');
                    const lat = parts[0];
                    const lng = parts[1];
                    const label = parts[2];

                    const link = document.createElement('a');
                    link.textContent = `${lat}, ${lng}`;
                    link.href = `https://www.google.com/maps?q=${lat},${lng}(${encodeURIComponent(label)})`;
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    link.onclick = (e) => e.stopPropagation(); // Предотвратява отварянето на модала на бележката

                    textContainer.appendChild(link);
                    const line2 = document.createElement('div');
                    line2.textContent = label;
                    textContainer.appendChild(line2);
                    attachmentWrapper.appendChild(textContainer);
                    // Добавяме onclick на иконата, за да покаже JSON данните
                    iconDiv.style.cursor = 'pointer';
                    iconDiv.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showModal(JSON.stringify(attachment, null, 2));
                    });
                }
                break;
        }

        if (attachment.type !== 1 && attachment.type !== 4) { // Add generic info click for non-preview types
            iconDiv.style.cursor = 'pointer';
        }
        attachmentWrapper.prepend(iconDiv);
    }

        async function createNoteElement(noteRawData) {
        const { file, res } = noteRawData;
        const note = document.createElement('div');
        note.className = 'note note-item';
        let fileContent = '';
        let noteGdid = null;
        let noteID = null;
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
                noteID = content.id;
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
        const useArhDb = localStorage.getItem('useArhDb') === 'true'; // @@ няма нужда да е тук, но да е за всеки случай
        const useLocalFolder = localStorage.getItem('useLocalDb') === 'true';
        const useGD = localStorage.getItem('useGoogleDb') === 'true';
        const useIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
        let attachments = [];

        if (useIndexedDb) {
            // Когато използваме база данни, трябва да знаем как е създадена.
            const dbNoteIdType = await getConfig('dbNoteIdType') || 'gdid'; // 'gdid' по подразбиране за стари бази
            if (dbNoteIdType === 'id') {
                attachments = mediaData.filter(media => +media.noteid === +noteID);
            } else { // 'gdid'
                attachments = mediaData.filter(media => media.noteid === noteGdid);
            }
        } else {
            // Когато четем директно, логиката зависи от текущия режим.
            if (useArhDb) attachments = mediaData.filter(media => +media.noteid === +noteID);
            else if (useLocalFolder || useGD) attachments = mediaData.filter(media => media.noteid === noteGdid);
        }

        if (attachments.length > 0) {
            const separator = document.createElement('hr');
            separator.style.marginTop = '10px';
            separator.style.marginBottom = '10px';
            contentEl.appendChild(separator);
            await Promise.all(attachments.map(async attachment => {
                const iconData = attachmentIcons.find(icon => icon.type === attachment.type);
                if (!iconData) return;
                const attachmentWrapper = document.createElement('div');
                attachmentWrapper.style.display = 'flex';
                attachmentWrapper.style.alignItems = 'center';
                attachmentWrapper.style.gap = '5px';

                const isDbOnlyMode = useIndexedDb && !useGD && !useLocalFolder && !useArhDb;

                if (isDbOnlyMode) {
                    // В режим "Само база данни", логиката зависи ИЗЦЯЛО от произхода на базата.
                    // Използваме глобалните променливи, зададени в mainLogic.
                    if (dbNoteIdTypeGlobal === 'id' && dbSourceGlobal === 3) { // Валидна комбинация за Архив
                        await handleAttachment(attachment, attachmentWrapper, iconData, 'archive');
                    } else if (dbNoteIdTypeGlobal === 'gdid' && dbSourceGlobal === 2) { // Валидна комбинация за Локална папка
                        await handleAttachment(attachment, attachmentWrapper, iconData, 'local');
                    } else if (dbNoteIdTypeGlobal === 'gdid' && dbSourceGlobal === 1) { // Валидна комбинация за Google Drive
                        await handleGoogleDriveAttachment(attachment, attachmentWrapper, iconData);
                    }
                    // При невалидна комбинация, не правим нищо и линкове не се създават.
                    // Съобщението за грешка вече се показва от mainLogic.
                } else if (useArhDb) {
                    // --- ЛОГИКА ЗА АРХИВ ---
                    await handleAttachment(attachment, attachmentWrapper, iconData, 'archive');
                } else if (useLocalFolder) {
                    // --- ЛОГИКА ЗА ЛОКАЛНА ПАПКА ---
                    await handleAttachment(attachment, attachmentWrapper, iconData, 'local');
                } else { // По подразбиране, ако не е нито един от горните, е Google Drive
                    // --- ЛОГИКА ЗА GOOGLE DRIVE (ИЛИ FALLBACK) ---
                    await handleGoogleDriveAttachment(attachment, attachmentWrapper, iconData);
                }
                contentEl.appendChild(attachmentWrapper);
            }));
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

        // --- Създаване на футър с икони за прикачени файлове ---
        if (!isHiddenNote && noteGdid) {
            let attachments = [];
            if (!isHiddenNote && noteGdid && useLocalFolder) {
                attachments = mediaData.filter(media => media.noteid === noteGdid);
            }
            const useGoogleDb = localStorage.getItem('useGoogleDb') === 'true';
            if (!isHiddenNote && noteGdid && useGoogleDb) {
                attachments = mediaData.filter(media => media.noteid === noteGdid);
            }
            if (!isHiddenNote && noteID && useArhDb) {
                attachments = mediaData.filter(media => +media.noteid === +noteID);  // @@  филтриране, но няма проблем
            }
            const uniqueTypes = [...new Set(attachments.map(att => att.type))];

            if (uniqueTypes.length > 0) {
                const footerEl = document.createElement('div');
                footerEl.className = 'note-footer';

                uniqueTypes.sort((a, b) => a - b).forEach(type => {
                    const iconData = attachmentIcons.find(icon => icon.type === type);
                    if (iconData) {
                        const iconDiv = document.createElement('div');
                        iconDiv.className = 'footer-icon';
                        iconDiv.innerHTML = iconData.svg;                        
                        iconDiv.style.borderRadius = '5px'; // Добавяме заобляне на ъглите
                        iconDiv.style.backgroundColor = noteBgColor;
                        footerEl.appendChild(iconDiv);
                    }
                });
                note.appendChild(footerEl); // Преместваме футъра да е директен наследник на .note
            }
        }

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
    // Ако данните не са масив, ги превръщаме в такъв.
    if (data && !Array.isArray(data)) {
        data = [data];
    }
    if (!data || data.length === 0) return;
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
 * @param {string} key - Ключ (напр. 'directoryHandle', 'lastLocalTimestamp').
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

function deleteNotesDB() {
    return new Promise((resolve, reject) => {
        console.log(`Attempting to delete database: ${NOTES_DB_NAME}`);
        const deleteRequest = indexedDB.deleteDatabase(NOTES_DB_NAME);

        deleteRequest.onsuccess = () => {
            console.log(`Database '${NOTES_DB_NAME}' deleted successfully.`);
            resolve();
        };
        deleteRequest.onerror = (event) => {
            console.error(`Error deleting database:`, event.target.error);
            reject(event.target.error);
        };
        deleteRequest.onblocked = () => {
            console.warn("Database deletion is blocked. Please close other tabs with this app open.");
            showToast("Database deletion is blocked. Please close other tabs with this app open.", 10000);
            reject(new Error("Database deletion blocked."));
        };
    });
}

/**
 * Deletes the entire IndexedDB database.
 * @returns {Promise<void>}
 */
async function clearDbStores() {
    try {
        const db = await openNotesDB();
        const storesToClear = [BOARD_STORE_NAME, MEDIA_STORE_NAME, NOTE_STORE_NAME];
        const transaction = db.transaction(storesToClear, 'readwrite');

        const clearPromises = storesToClear.map(storeName => {
            return new Promise((resolve, reject) => {
                const request = transaction.objectStore(storeName).clear();
                request.onsuccess = resolve;
                request.onerror = reject;
            });
        });

        await Promise.all(clearPromises);
        console.log('Data stores cleared, config preserved.');
    } catch (error) {
        console.error('Failed to clear data stores:', error);
        showToast(_('dbDeleteFailed'), 10000);
    }
}

/*function deleteNotesDB() {
    return new Promise((resolve, reject) => {
        const deleteRequest = indexedDB.deleteDatabase(NOTES_DB_NAME);
        deleteRequest.onsuccess = () => resolve();
        deleteRequest.onerror = (event) => reject(event.target.error);
        deleteRequest.onblocked = () => reject(new Error("Database deletion blocked."));
    });
}*/

async function renderUI({ boardParseError }) {
    let boardsNoteElement = null;
    if (boardsData.length > 0 || boardParseError) {
        boardsNoteElement = await createBoardsUI(boardsData, boardParseError);
    }

    // КЛЮЧОВА СТЪПКА: Принудително премахваме старото меню с бордове, ако съществува.
    const oldBoardsNote = document.querySelector('header .boards-note');
    if (oldBoardsNote) {
        oldBoardsNote.remove();
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
    // Обновяваме списъка със стартови бордове в настройките
    populateStartBoardSelect();
}

/**
 * Чете архивни данни (boards.bcp, notes.bcp, medias.bcp) от подадена директория
 * и попълва глобалните променливи boardsData, allNotesData и mediaData.
 *
 * @param {FileSystemDirectoryHandle} dirHandle - Handle към директорията, съдържаща .bcp файловете.
 * @returns {Promise<boolean>} Връща true при успех, false при провал.
 */
async function readArh(dirHandle) {
    if (!dirHandle) {
        console.error("readArh: Не е подаден валиден handle на директория.");
        showToast("Не е избрана папка за архив.", 10000);
        return false;
    }

    console.log(`Започва четене на архив от папка: ${dirHandle.name}`);
    let success = true;

    try {
        // 1. Четене на boards.bcp
        const boardsFileHandle = await dirHandle.getFileHandle('boards.bcp');
        const boardsFile = await boardsFileHandle.getFile();
        const boardsContent = await boardsFile.text();
        boardsData = JSON.parse(boardsContent);
        console.log(`Успешно заредени ${boardsData.length} борда от boards.bcp.`);

        // 2. Четене на notes.bcp
        const notesFileHandle = await dirHandle.getFileHandle('notes.bcp');
        const notesFile = await notesFileHandle.getFile();
        const notesContent = await notesFile.text();
        const notesArray = JSON.parse(notesContent);

        // Преобразуване в структурата, очаквана от приложението за allNotesData
        allNotesData = notesArray.map(noteObject => {
            const rawData = {
                file: { name: 'notes.bcp (архив)' },
                res: { body: JSON.stringify(noteObject) }
            };
            return {
                file: rawData.file,
                content: noteObject,
                rawData: rawData
            };
        });
        console.log(`Успешно заредени ${allNotesData.length} бележки от notes.bcp.`);

        // 3. Четене на medias.bcp (ако съществува)
        try {
            const mediaFileHandle = await dirHandle.getFileHandle('medias.bcp');
            const mediaFile = await mediaFileHandle.getFile();
            const mediaContent = await mediaFile.text();
            mediaData = JSON.parse(mediaContent);
            console.log(`Успешно заредени ${mediaData.length} медийни файла от medias.bcp.`);
        } catch (mediaError) {
            if (mediaError.name === 'NotFoundError') {
                console.log("Файл 'medias.bcp' не е намерен. Продължаваме без него.");
                mediaData = []; // Нулираме mediaData, ако файлът липсва
            } else {
                throw mediaError; // Хвърляме други грешки нагоре
            }
        }

    } catch (error) {
        success = false;
        if (error.name === 'NotFoundError') {
            console.error(`Грешка: Файл 'boards.bcp' или 'notes.bcp' не е намерен в папката '${dirHandle.name}'.`);
            showToast(`Задължителен архивен файл не е намерен.`, 10000);
        } else if (error instanceof SyntaxError) {
            console.error("Грешка при парсване на JSON съдържание от архивен файл:", error);
            showToast("Архивните файлове съдържат невалидни данни.", 10000);
        } else {
            console.error("Възникна неочаквана грешка при четене на архива:", error);
            showToast("Грешка при четене на архива.", 10000);
        }
    }

    if (success) {
        console.log("Четенето на архива приключи успешно.");
    }

    return success;
}
