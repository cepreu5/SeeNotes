// https://multinotes.app/gdviewer
// terser main.js --compress --mangle --toplevel --output mainn.js
// terser mainAll.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output mainn.js
// terser db.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output dbb.js
// terser calendar.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output calendarr.js
// node -e "const fs=require('fs'); const T=require('terser'); (async()=>{ const code=fs.readFileSync('main.js','utf8'); const result=await T.minify(code,{ compress:{ arrows:true, booleans:true, collapse_vars=true, comparisons:true, dead_code=true, drop_console=true, hoist_funs=true, if_return=true, passes:3, pure_funcs:['console.log'] }, mangle:{ reserved:['gisLoaded'], keep_fnames: /^gisLoaded$/ }, toplevel:true, ecma:2020, module:true, format:{ wrap_iife:true } }); fs.writeFileSync('mainn.js',result.code); })();"

// terser main.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true -c pure_funcs=["console.log"] --output mainn.js

const version = 'Beta 1.38'; // App version
const debug = true; // Глобален флаг за дебъг режим
window.isAppErrorState = false; // Флаг за грешки (изтекъл сертификат и др.)

let guide = true;
guide = localStorage.getItem('guide');
if (guide === 'false') {
    guide = false;
}
else guide = true;

// --- OAuth Redirect Handler for iframe ---
// Ако сме в iframe и има access_token в URL hash, изпращаме го на parent
if (window.location.hash && window.location.hash.includes('access_token')) {
    if (window.parent !== window) {
        // Изпращаме hash-а на parent window
        window.parent.postMessage(window.location.hash, window.location.origin);
    }
}

// --- Unified Share Event Handler ---
const handleShareEvent = (eventData, source) => {
    if (eventData && eventData.type === 'SHARE_TARGET_EVENT') {
        const now = Date.now();
        const isDuplicate = window.lastShareEventTime && (now - window.lastShareEventTime < 1000);

        console.log(`[Main] Received SHARE_TARGET_EVENT from ${source}. ${isDuplicate ? '(Duplicate ignored)' : ''}`, eventData.data);

        if (isDuplicate) return;
        window.lastShareEventTime = now;

        // 1. Изчистваме всички отворени модали
        document.querySelectorAll('.modal.visible, .settings-modal.visible, .modal-overlay.visible').forEach(m => {
            m.classList.remove('visible');
        });

        // 2. Фокусираме и изчистваме активни елементи
        if (document.activeElement) document.activeElement.blur();

        // 3. Изчакваме анимациите и отваряме Share Target
        setTimeout(() => {
            console.log(`[Main] Invoking handleShareTarget (triggered by ${source})...`);
            handleShareTarget(eventData.data);
        }, 300);
    }
};

// Listen via BroadcastChannel
// const shareChannel = new BroadcastChannel('share_target_channel');
// shareChannel.onmessage = (event) => handleShareEvent(event.data, 'BroadcastChannel');

// Listen via direct SW postMessage
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => handleShareEvent(event.data, 'ServiceWorker.postMessage'));
}

// --- Debug Listener for Service Worker logs ---
// const swDebugChannel = new BroadcastChannel('sw_debug_channel');
// swDebugChannel.onmessage = (event) => {
//     if (event.data && event.data.type === 'LOG') {
//         console.log('[SW-REMOTE-LOG]', ...event.data.args);
//     }
// };

let pass = false;

// --- Demo Mode ---
let DEMO_MODE = false;
const DEMO_NOTE_LIMIT = 5;

// =================================================================================
// I. ГЛОБАЛНИ ПРОМЕНЛИВИ И КОНСТАНТИ
// =================================================================================

// --- Конфигурация и версия ---
// const CLIENT_ID = '1090128984423-80074rvs8n45v787044d9ca1bvahla98.apps.googleusercontent.com';
const CLIENT_ID = '365177022923-59fegvrs9tjimpmclr8nbrvk6ik8qfg6.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
const TRIAL_URL = "http://index.html?token=bEis1x9_geJ3w1aM4SWnR3KjEXbz6l9SK91w9Zk5Clqd6TBnMQgUbMTYErrb_js5wP4I699wO-NflxzGy2yn"; // days token

// --- Глобално състояние на приложението ---
let allNotesData = []; // Съхранява всички бележки за календара
let noteId = 1000000, noteNumord = 1000000;

let boardsData = []; // Съхранява данните за бордовете
let mediaData = []; // Съхранява данните за медия
let folderIds = {}; // Съхранява ID-тата на папките за медия
let currentBoardFilter = 'all';
let boardBeforeSearch = 'all';
let searchInBoardOnly = localStorage.getItem('searchInBoardOnly') === 'true';
let currentBackground = 'Board.png';
let currentCalendarDate = new Date();
let currentWeeklyViewDate = new Date(); // За новия седмичен изглед
let authToken = null;
let token;
let ts; // Време на първо стартиране на приложението
let tokenRemainingDays = null; // Остават дни валидност на токена
let activeFolderName = localStorage.getItem('active_folder_name') || 'AppDataFolder'; // Текуща папка в Google Drive
let dirHandle = null; // За локален достъп до файловата система
let isInitialLoad = true; // Флаг за първоначално зареждане
let isLoadCancelled = false; // Флаг за прекратяване на зареждането
let noteToAssignDate = null; // Запомня бележката, на която ще се зададе дата
let isDbOwner = true; // Флаг, който показва дали потребителят е собственик на базата
let updatedNoteGdims = []; // Съхранява gdid на новите/обновените бележки
let tokenClient = null; // Client for silent auth refresh
let notesBgrdChanged = false; // Flag to track if notes background setting changed
let oneTapLinkChanged = false;
let isToastHidden = localStorage.getItem('hideToast') === 'true'; // Default to false

// --- Състояние на търсенето ---
let searchMode = 'content'; // Default to content search (includes title)
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

// --- Глобални флагове за състоянието (заместват многократните localStorage.getItem()) ---
let useGoogleDb = true;
let useLocalFolder = false;
let useArhDb = false;
let useIndexedDb = false;
let automatedTimer = true; // true по подразбиране
let dbNoteIdTypeGlobal = null; // Запомня типа на връзката в базата
let dataIntegrityIssues = []; // Track missing/duplicate IDs during load
let initialLoadTime = null; // Time taken for initial Google Drive load in seconds
let initialLoadTimestamp = null; // Timestamp when the load finished
let isAppStarted = false; // Guard for startApp
let isMainLogicRunning = false; // Guard for mainLogic concurrency
let isOffline = false; // Flag for offline mode
let isOfflineChecked = false;
let isSyncSuspended = false;
let localFileMap = new Map(); // Карта за съответствие GDID -> име на файл за локална папка

// --- DOM елементи (ще бъдат инициализирани в initApp) ---
let signoutButton, reloadButton, settingsButton, notesContainer, contentModal, modalBody, copyBtn, scrollTopBtn, searchBox, loaderContainer, loaderText, searchModeToggle, saveSearchBtn;
console.log(`[Startup] Active folder: ${activeFolderName}`);
let folderIdPromptPopup, folderIdInput, submitFolderIdBtn;

// --- IndexedDB Конфигурация ---
const NOTES_DB_NAME = 'NotesDB';
const BOARD_STORE_NAME = 'boards';
const MEDIA_STORE_NAME = 'media';
const NOTE_STORE_NAME = 'notes';
const CONFIG_STORE_NAME = 'config';
const NOTES_DB_VERSION = 3;

// --- SVG икони ---
// const eyeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const eyeOffIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><path d="M3 3l18 18"></path></svg>`;
const calendarIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><rect x="4" y="5" width="16" height="16" rx="2" /><line x1="16" y1="3" x2="16" y2="7" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="4" y1="11" x2="20" y2="11" /></svg>`;
const calendarTodaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><rect x="4" y="5" width="16" height="16" rx="2" /><line x1="16" y1="3" x2="16" y2="7" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="4" y1="11" x2="20" y2="11" /><circle cx="12" cy="16" r="1.5" fill="currentColor"></circle></svg>`;
const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" /></svg>`;
const boardIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="black" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="12" y1="4" x2="12" y2="20" /></svg>`;
const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21V3M5 10l7-7 7 7"/></svg>`;
const noteIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M13 20l7 -7" /><path d="M13 20v-6a1 1 0 0 1 1 -1h6v-7a2 2 0 0 0 -2 -2h-12a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7" /></svg>`;
const clockIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" /></svg>`;
const lockIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
const pinIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2.4" stroke="currentColor" fill="none"><circle class="pin-dot" cx="12" cy="12" r="7"></circle></svg>`;
const saveSearchSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
const attachmentIcons = [
    { type: 1, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6l1.5-2h3L15 6"/><circle cx="12" cy="13" r="3"/></svg>` },
    { type: 2, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24" ><circle cx="7" cy="12" r="4" /><circle cx="17" cy="12" r="4"/><line x1="6" y1="16" x2="18" y2="16" stroke="black" stroke-width="1" /></svg>` },
    { type: 3, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 2v6h6"/></svg>` },
    { type: 4, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>` },
    { type: 5, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>` },
    { type: 6, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="10" r="2"/><path d="M8 16c0-1.33 2.67-2 4-2s4 .67 4 2"/></svg>` }
];
const diskIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
const pencilIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
  <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
</svg>
`;
const emptyTrashIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="14" y2="17"></line><line x1="14" y1="11" x2="10" y2="17"></line></svg>`;
const eyeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;

