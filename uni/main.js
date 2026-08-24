// https://multinotes.app/gdviewer
// terser main.js --compress --mangle --toplevel --output mainn.js
// terser mainAll.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output mainn.js
// terser db.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output dbb.js
// terser calendar.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output calendarr.js
// node -e "const fs=require('fs'); const T=require('terser'); (async()=>{ const code=fs.readFileSync('main.js','utf8'); const result=await T.minify(code,{ compress:{ arrows:true, booleans:true, collapse_vars=true, comparisons:true, dead_code=true, drop_console=true, hoist_funs=true, if_return=true, passes:3, pure_funcs:['console.log'] }, mangle:{ reserved:['gisLoaded'], keep_fnames: /^gisLoaded$/ }, toplevel:true, ecma:2020, module:true, format:{ wrap_iife:true } }); fs.writeFileSync('mainn.js',result.code); })();"

// terser main.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true -c pure_funcs=["console.log"] --output mainn.js

const version = 'Beta 1.46'; // App version
const debug = true; // Глобален флаг за дебъг режим
window.isAppErrorState = false; // Флаг за грешки (изтекъл сертификат и др.)

let guide = true;
guide = localStorage.getItem('guide');
if (guide === 'false') {
    guide = false;
}
else guide = true;

let initialBoardModalPending = false;

function showInitialBoardModalAfterGuide() {
    if (initialBoardModalPending) return;

    const openModal = () => {
        initialBoardModalPending = false;
        if (boardsData.length === 0 && typeof showNewBoardModal === 'function') {
            showNewBoardModal();
        }
    };

    // The introduction is scheduled after the first render. Defer the board
    // dialog when it is pending or already visible, and resume on completion
    // or when the user explicitly stops the guide.
    if (guide === true || window.isGuideActive || document.querySelector('.guide-container')) {
        initialBoardModalPending = true;
        window.addEventListener('guide-finished', openModal, { once: true });
        return;
    }

    openModal();
}

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
// Динамични scopes - ще се определят според потребителския избор
const SCOPES_BASE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email';
const SCOPES_READONLY = 'https://www.googleapis.com/auth/drive.readonly';
const SCOPES_FULL = 'https://www.googleapis.com/auth/drive';
let SCOPES = SCOPES_BASE; // По подразбиране - минимални scopes
const TRIAL_URL = "http://index.html?token=bEis1x9_geJ3w1aM4SWnR3KjEXbz6l9SK91w9Zk5Clqd6TBnMQgUbMTYErrb_js5wP4I699wO-NflxzGy2yn"; // days token

// --- Глобални флагове за инициализация на папката ---
let folderSetupMode = null; // 'import_migrate' | 'create_empty' | 'advanced_existing' | null
let isInitialFolderSetupDone = false;

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
let activeFolderName = (localStorage.getItem('active_folder_name') === 'AppDataFolder' ? 'CX-Notes' : (localStorage.getItem('active_folder_name') || 'CX-Notes')); // Текуща папка в Google Drive
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
let authPopupAttempted = false; // Popup-ът за автентикация да се показва максимум веднъж на сесия
let proactiveRefreshTimer = null; // Таймер за проактивно обновяване на токена преди изтичане
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
const paperclipIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M15 7l-6.5 6.5a1.5 1.5 0 0 0 3 3l6.5 -6.5a3 3 0 0 0 -6 -6l-6.5 6.5a4.5 4.5 0 0 0 9 9l6.5 -6.5" /></svg>`;

let SUPPORTED_LANGUAGES = [
    { id: 'en', label: 'EN' },
    { id: 'bg', label: 'BG' }
];

function renderLanguageSwitchers(onChangeCallback) {
    const build = (languages) => {
        let container = document.getElementById('lang-switcher-main');
        if (!container) return;

        // Ако браузърът е кеширал стар HTML, в който контейнерът е select (а не div):
        if (container.tagName.toLowerCase() === 'select') {
            container.innerHTML = '';
            container.style.cssText = 'font-size: 16px; padding: 6px 30px 6px 12px; border-radius: 6px; background: #afbac6; border: 1px solid #ccc; cursor: pointer; outline: none; margin-bottom: 15px; color: #333;';
            languages.forEach(lang => {
                const option = document.createElement('option');
                option.value = lang.id;
                option.textContent = lang.label;
                if (lang.id === currentLang) option.selected = true;
                container.appendChild(option);
            });
            // Remove old listeners by cloning
            const newSelect = container.cloneNode(true);
            container.parentNode.replaceChild(newSelect, container);
            if (typeof onChangeCallback === 'function') {
                newSelect.addEventListener('change', async (e) => {
                    const lang = e.target.value;
                    localStorage.setItem('language', lang);
                    if (typeof saveSettingsToGDrive === 'function') {
                        try { await saveSettingsToGDrive(true); } catch (err) { console.warn('Failed to save settings on language change:', err); }
                    }
                    onChangeCallback(lang);
                });
            }
            return;
        }

        // Стандартно рендиране в div контейнер
        container.innerHTML = '';
        const select = document.createElement('select');
        select.id = 'main-lang-select';
        select.className = 'lang-select';
        select.style.cssText = 'font-size: 16px; padding: 6px 30px 6px 12px; border-radius: 6px; background: #afbac6; border: 1px solid #ccc; cursor: pointer; outline: none; margin-bottom: 0px; color: #333;';

        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.id;
            option.textContent = lang.label;
            if (lang.id === currentLang) option.selected = true;
            select.appendChild(option);
        });

        if (typeof onChangeCallback === 'function') {
            select.addEventListener('change', async (e) => {
                const lang = e.target.value;
                localStorage.setItem('language', lang);
                if (typeof saveSettingsToGDrive === 'function') {
                    try { await saveSettingsToGDrive(true); } catch (err) { console.warn('Failed to save settings on language change:', err); }
                }
                onChangeCallback(lang);
            });
        }
        container.appendChild(select);
    };

    // Предварително рисуване
    build(SUPPORTED_LANGUAGES);

    // Фонов ъпдейт
    fetch('languages.json', { cache: 'no-store' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data && Array.isArray(data) && data.length > 0) {
                const isDifferent = JSON.stringify(data) !== JSON.stringify(SUPPORTED_LANGUAGES);
                if (isDifferent) {
                    SUPPORTED_LANGUAGES = data;
                    build(SUPPORTED_LANGUAGES);
                }
            }
        })
        .catch(err => console.warn('languages.json fallback to default', err));
}

let currentLang = localStorage.getItem('language') || 'en';

function applyLanguageFromUrl() {
    const search = window.location.search.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    let requestedLang = params.get('lang') || params.get('language') || '';
    if (!requestedLang) {
        const matched = SUPPORTED_LANGUAGES.find(lang => {
            const id = lang.id.toLowerCase();
            return search === `?${id}` || search.startsWith(`?${id}&`) || params.has(lang.id);
        });
        if (matched) requestedLang = matched.id;
    }
    const isSupported = SUPPORTED_LANGUAGES.some(lang => lang.id.toLowerCase() === requestedLang.toLowerCase());
    if (isSupported) {
        localStorage.setItem('language', requestedLang);
        currentLang = requestedLang;
        window.hasUrlLanguage = true;
    }
}

applyLanguageFromUrl();

let appTranslations = {};

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

const noteColorMap = [
    '#FBFF86', '#FF829E', '#68FF97', '#EFEFEF', '#69B7FF',
    '#FBCB39', '#FBFBCD', '#FFC5D2', '#B6FFCD', '#B2DAFF',
    '#DDB1FF', '#B1D8FF', '#B1FFF2', '#FFD7B1', '#FFB1E8'
];

function colorIntToHex(intVal) {
    if (typeof intVal !== 'number') return intVal;
    return '#' + (intVal >>> 0).toString(16).slice(-6).toUpperCase();
}

function hexToColorInt(hex) {
    if (!hex || typeof hex !== 'string') return 0;
    if (hex.startsWith('#')) hex = hex.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return (parseInt('FF' + hex, 16) | 0);
}
const noteBgCache = new Map();
const customBgCache = new Map();

window.getPipeIndex = function (text) {
    if (!text) return -1;
    let tableInfo = null;
    if (typeof parseMarkdownTable === 'function') {
        tableInfo = parseMarkdownTable(text);
    }

    let inCode = false;
    let inBacktickCode = false;
    let currentLine = 0;

    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') currentLine++;

        if (text.substring(i, i + 2) === '{{') {
            inCode = true;
            i++;
        } else if (text.substring(i, i + 2) === '}}') {
            inCode = false;
            i++;
        } else if (text.substring(i, i + 3) === '```') {
            inBacktickCode = !inBacktickCode;
            i += 2;
        } else if (text[i] === '|' && !inCode && !inBacktickCode) {
            if (tableInfo && currentLine >= tableInfo.startIndex && currentLine <= tableInfo.endIndex) {
                continue;
            }
            return i;
        }
    }
    return -1;
};

// --- Optimization: Preload unique backgrounds to avoid 'checkered' loading and reduce memory ---
async function preloadNoteBackgrounds(notesData) {
    const notesBgrdEnabled = localStorage.getItem('notesBgrd') !== 'false';
    if (!notesBgrdEnabled) return;

    const needed = new Set();
    notesData.forEach(note => {
        // We need backgrounds for deleted notes too, if user goes to trash!
        const noteColor = note.color;
        const color = (typeof noteColor === 'number' && noteColor >= 0 && noteColor < noteColorMap.length) ? noteColorMap[noteColor] : (typeof noteColor === 'string' ? noteColor : '#FBFF86');
        const img = (note.sellist && note.sellist > 0) ? note.sellist : 0;
        needed.add(`${color}_${img}`);
    });

    const promises = [];
    needed.forEach(key => {
        if (!noteBgCache.has(key)) {
            const parts = key.split('_'); // key is "color_img"
            const color = parts[0];
            const img = parseInt(parts[1]);
            const p = createColoredNoteBackground(color, img, 250, 250).then(canvas => {
                return new Promise(resolveBlob => {
                    canvas.toBlob(blob => {
                        const url = URL.createObjectURL(blob);
                        noteBgCache.set(key, `url("${url}")`);
                        resolveBlob();
                    }, 'image/png');
                });
            }).catch(e => console.warn("Failed to preload bg:", key, e));
            promises.push(p);
        }
    });
    await Promise.all(promises);
}
// Времено решение за проблем със скролирането до последната бележка при презареждане от иконата на браузъра
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

// =================================================================================
// IX. LOAD MODULE (Google Drive Data Fetching & Sync)
// =================================================================================
/**
 * Parses the raw responses from Google Drive into JSON objects.
 */
async function parseFileResults(results, filenameForError) {
    const tempMap = new Map();
    const duplicates = [];
    let parseError = false;
    const updateGDrive = useGoogleDb && !isOffline;

    for (const { res, id } of results) {
        if (!res || !res.body || res.body.trim() === '') continue;
        try {
            const content = JSON.parse(res.body);
            let items = [];
            if (filenameForError === 'note.txt') {
                if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
                    items.push(content);
                }
            } else {
                if (Array.isArray(content)) {
                    items = content;
                } else if (typeof content === 'object' && content !== null) {
                    items.push(content);
                }
            }

            for (let item of items) {
                if (id && filenameForError === 'note.txt') {
                    if (item.gdid && item.gdid !== id) {
                        console.warn(`[Sync-ID-Fix] Corrected mismatched ID for note "${item.id}": Internal was "${item.gdid}", actual GDrive ID is "${id}"`);
                        item.type = -1;
                    }
                    item.gdid = id;
                }
                let key = (item.gdid && item.gdid !== '') ? item.gdid : item.id;
                if (filenameForError === 'board.txt' && item.title) {
                    key = `board_${item.title.trim().toLowerCase()}`;
                }
                if (typeof key !== 'undefined' && key !== null) {
                    const existing = tempMap.get(key);
                    if (!existing) {
                        tempMap.set(key, item);
                    } else if (filenameForError === 'note.txt') {
                        const isDiff = (item.notetxt !== existing.notetxt ||
                            item.color !== existing.color ||
                            item.title !== existing.title ||
                            item.boardid != existing.boardid);
                        if (isDiff) {
                            duplicates.push({ localNote: existing, serverNote: item });
                        }
                    }
                }
            }
        } catch (e) {
            parseError = true;
            console.log(`Error parsing content from a '${filenameForError}' file:`, e);
            if (updateGDrive && id && filenameForError === 'note.txt') {
                const snippet = res.body.substring(0, 50) + (res.body.length > 50 ? '...' : '');
                const confirmMsg = _('confirmDeleteCorruptedNote')
                    .replace('{error}', e.message)
                    .replace('{content}', snippet);
                const confirmed = await showConfirmation(confirmMsg);
                if (confirmed) {
                    try {
                        if (await deleteGDriveFile(id)) {
                            if (typeof showToast === 'function') showToast(_('fileDeletedSuccess'), 3000);
                        }
                    } catch (delErr) {
                        console.error("Failed to delete corrupted file", delErr);
                        if (typeof showToast === 'function') showToast(_('gdriveDeleteError').replace('{error}', delErr.message), 5000);
                    }
                }
            }
        }
    }
    const finalData = Array.from(tempMap.values());
    if (filenameForError === 'note.txt' || filenameForError === 'board.txt') {
        console.log(`[parseFileResults] ${filenameForError}: Found ${finalData.length} unique items from ${results.length} files.`);
    }
    return { data: finalData, parseError, duplicates };
}
async function loadAndParseFile(filename, folderId, modifiedSince = null, onProgress = null) {
    const results = await fetchFiles(filename, folderId, onProgress, modifiedSince);
    return await parseFileResults(results, filename);
}
async function fetchAllData(folderIdFromPrompt, modifiedSince = null) {
    let folderId = folderIdFromPrompt || await getFolderID();
    if (!folderId && activeFolderName && activeFolderName !== 'CX-Notes' && activeFolderName !== 'AppDataFolder') {
        const granted = await requestAdditionalScopes(SCOPES_FULL);
        if (granted) {
            folderId = await getFolderID();
        }
    }
    if (!folderId) {
        if (activeFolderName && activeFolderName !== 'AppDataFolder') {
            removeFolderFromList(activeFolderName);
        }
        if (activeFolderName !== 'multinotes_data') {
            try {
                const multinotesId = await getFolderIDByName('multinotes_data');
                if (multinotesId) {
                    console.log(`[fetchAllData] Active folder "${activeFolderName}" was not found, but "multinotes_data" exists (ID: ${multinotesId}). Switching automatically.`);
                    const oldFolder = activeFolderName;
                    activeFolderName = 'multinotes_data';
                    localStorage.setItem('active_folder_name', activeFolderName);
                    setCachedMainFolderId('multinotes_data', multinotesId);
                    cachedMainFolderId = multinotesId;
                    let folderNames = [];
                    try { folderNames = JSON.parse(localStorage.getItem('gdrive_folder_names') || '[]'); } catch (e) { }
                    if (!folderNames.includes('multinotes_data')) {
                        folderNames.push('multinotes_data');
                        localStorage.setItem('gdrive_folder_names', JSON.stringify(folderNames));
                    }

                    const loaderFolderInfo = document.getElementById('loader-folder-info');
                    if (loaderFolderInfo) loaderFolderInfo.textContent = `(${activeFolderName})`;

                    if (typeof showToast === 'function') {
                        const toastMsg = (_('folderNotFoundSwitchedToMultinotes') || `Папката "${oldFolder}" не бе намерена. Автоматично е превключено към намерената папка "multinotes_data".`)
                            .replace('{oldFolder}', oldFolder);
                        showToast(toastMsg, 6000);
                    }

                    return fetchAllData(multinotesId, modifiedSince);
                }
            } catch (e) {
                console.warn('[fetchAllData] Error checking for multinotes_data fallback:', e);
            }
        }

        // 2. При първо стартиране multinotes_data може да липсва. В този случай
        // продължаваме с работната папка на web приложението, вместо да
        // прекъсваме началното зареждане с грешка.
        const isFirstRun = !folderIdFromPrompt && localStorage.getItem('initial_setup_complete') !== 'true';
        if (isFirstRun && activeFolderName !== 'AppDataFolder') {
            console.warn('[FirstRun] Active folder was not found. Switching to AppDataFolder.');
            activeFolderName = 'AppDataFolder';
            localStorage.setItem('active_folder_name', activeFolderName);
            clearCachedMainFolderId();
            ['Other', 'Sound', 'Video', 'Images'].forEach(name => localStorage.removeItem(`gdrive_folder_id_${name}`));
            cachedMainFolderId = null;
            folderIds = {};

            // Няма открита папка на MultiNotes, затова не запазваме стари или
            // подразбиращи се записи за multinotes_data в списъка с папки.
            localStorage.setItem('gdrive_folder_names', JSON.stringify(['AppDataFolder']));

            const loaderFolderInfo = document.getElementById('loader-folder-info');
            if (loaderFolderInfo) loaderFolderInfo.textContent = `(${activeFolderName})`;
            if (typeof showToast === 'function') showToast(_('firstRunAppDataFolderSelected'), 7000);

            return fetchAllData('appDataFolder', modifiedSince);
        }
        if (useIndexedDb && useGoogleDb) {
            try {
                await fetchAllDataLocal();
                if (allNotesData.length > 0) {
                    showToast(_('loadedFromLocalNoDrive'), 5000);
                    return { boardParseError: false };
                }
            } catch (e) { }
        }
        // 3. Папката не е намерена и multinotes_data също я няма — предлагаме да я създадем или да превключим към AppDataFolder
        if (activeFolderName !== 'AppDataFolder') {
            const confirmMsg = (_('folderNotFoundCreate') || `Folder "${activeFolderName}" was not found in Google Drive. Create it now?`)
                .replace('{folder}', activeFolderName);
            const confirmed = await showConfirmation(confirmMsg);
            if (confirmed) {
                try {
                    const newId = await createNewGDriveFolder(activeFolderName);
                    if (newId) {
                        setCachedMainFolderId(activeFolderName, newId);
                        cachedMainFolderId = newId;
                        if (typeof showToast === 'function') showToast((_('folderCreated') || `Folder "${activeFolderName}" created.`).replace('{folder}', activeFolderName), 5000);
                        return fetchAllData(newId, modifiedSince);
                    }
                } catch (createErr) {
                    console.error('[fetchAllData] Failed to create folder:', createErr);
                    if (typeof showToast === 'function') showToast(_('errorCreateFolder') || 'Failed to create folder.', 5000);
                }
            }
            // Потребителят отказа или създаването се провали — превключваме към AppDataFolder
            console.warn('[fetchAllData] Falling back to AppDataFolder.');
            activeFolderName = 'AppDataFolder';
            localStorage.setItem('active_folder_name', activeFolderName);
            clearCachedMainFolderId();
            ['Other', 'Sound', 'Video', 'Images'].forEach(name => localStorage.removeItem(`gdrive_folder_id_${name}`));
            cachedMainFolderId = null;
            folderIds = {};
            return fetchAllData('appDataFolder', modifiedSince);
        }
        showMessagePopup(_('errorFolderNotFound'));
        throw new Error("Main folder ID not found.");
    }
    if (loaderText) loaderText.textContent = _('loadingFile') + " ...";
    const onNoteProgress = (loaded, total) => {
        if (loaderText) loaderText.textContent = `${_('loadingFile')} ${loaded} ${_('of')} ${total}`;
    };
    console.time("fetchAllData_TotalLoad");
    const tStart = Date.now();
    const [boardRes, mediaRes, noteRes] = await Promise.all([
        loadAndParseFile('board.txt', folderId, modifiedSince),
        loadAndParseFile('media.txt', folderId, modifiedSince),
        loadAndParseFile('note.txt', folderId, modifiedSince, onNoteProgress)
    ]);
    const tEnd = Date.now();
    initialLoadTime = ((tEnd - tStart) / 1000).toFixed(2);
    initialLoadTimestamp = tEnd;
    console.timeEnd("fetchAllData_TotalLoad");
    boardsData = boardRes.data;
    mediaData = mediaRes.data;
    allNotesData = noteRes.data;
    trackMaxIds(allNotesData);
    trackMaxBoardIds(boardsData);
    // Integrity checks for initial Google Drive load
    const gdidMap = new Map();
    const checkIntegrity = (data, filename) => {
        data.forEach(item => {
            if (!item.gdid) {
                const textContent = item.notetxt || item.text || '';
                dataIntegrityIssues.push({ type: 'missing', file: filename, mode: 'gdrive', text: textContent });
            } else if (gdidMap.has(item.gdid)) {
                dataIntegrityIssues.push({
                    type: 'duplicate',
                    gdid: item.gdid,
                    file1: gdidMap.get(item.gdid),
                    file2: filename,
                    mode: 'gdrive'
                });
            } else {
                gdidMap.set(item.gdid, filename);
            }
        });
    };
    checkIntegrity(boardsData, 'board.txt');
    checkIntegrity(mediaData, 'media.txt');
    checkIntegrity(allNotesData, 'note.txt');
    if (boardsData.length === 0 && allNotesData.length === 0) {
        if (activeFolderName && activeFolderName !== 'AppDataFolder' && localStorage.getItem('initial_setup_complete') === 'true') {
            showToast(_('errorFolderNoNotesData') || 'This folder does not contain notes data and cannot be used. Please select a folder with MultiNotes data.', 10000);
        } else {
            showToast(_('errorNoBoardFilesFound') || 'No boards found in the selected folder. Please create a board first.', 10000);
            showInitialBoardModalAfterGuide();
        }
    } else if (boardsData.length === 0) {
        showToast(_('errorNoBoardFilesFound') || 'No boards found in the selected folder. Please create a board first.', 10000);
        showInitialBoardModalAfterGuide();
    } else if (allNotesData.length === 0) {
        showToast(_('errorNoNoteFilesFound') || 'No note files found in the selected folder. Please check your data source.', 10000);
    }
    return { boardParseError: boardRes.parseError, duplicates: noteRes.duplicates };
}

let isSyncing = false;
async function runGoogleDriveSync(forceFullSync = false) {
    if (isSyncing) {
        console.log("[Sync-Run] Already syncing, skipping call.");
        return 0;
    }
    isSyncing = true;
    try {
        console.log("[Sync-Run] runGoogleDriveSync started, forceFullSync:", forceFullSync);
        const loaderTitle = document.getElementById('loader-title');
        const loaderFolderInfo = document.getElementById('loader-folder-info');
        if (loaderFolderInfo) loaderFolderInfo.textContent = `(${activeFolderName})`;
        const loaderText = document.getElementById('loader-text');
        if (!useIndexedDb) {
            console.log("[Sync-Run] Exiting: useIndexedDb is false");
            return 0;
        }
        const updateOnly = localStorage.getItem('updateFromSource') !== 'false';
        const lastSyncTimestampOrig = (!forceFullSync && updateOnly && dbExists) ? await getConfig('lastGDTimestamp') : null;
        let lastSyncTimestamp = lastSyncTimestampOrig;
        if (lastSyncTimestamp) lastSyncTimestamp = parseInt(lastSyncTimestamp, 10);
        const modifiedSince = (forceFullSync || !lastSyncTimestamp) ? null : new Date(lastSyncTimestamp).toISOString();
        let notesForConflictCheck = [];
        if (loaderTitle) {
            loaderTitle.innerText = (modifiedSince && !forceFullSync) ?
                _('checkingForGDriveUpdates').replace('{date}', new Date(lastSyncTimestamp).toLocaleString(currentLang)) :
                _('initialGDriveSync');
        }
        const syncStartTime = Date.now();
        const folderId = await getFolderID();
        if (!folderId) {
            console.log("[Sync-Run] Exiting: folderId not found.");
            return 0;
        }
        console.log("[Sync-Run] Folder identity found:", folderId);
        if (forceFullSync && useIndexedDb) {
            console.log("[Sync-Run] forceFullSync active: clearing DB stores for full rebuild...");
            await clearDbStores();
            boardsData = [];
            mediaData = [];
            allNotesData = [];
        }
        let actualBoardUpdates = 0;
        let actualMediaUpdates = 0;
        const gdidMap = new Map(); // Track duplicates during GDrive sync
        const syncFileWorker = async (filename, storeName, isNote = false, forceFull = false) => {
            const since = (forceFull || forceFullSync) ? null : modifiedSince;
            const files = await fetchFiles(filename, folderId, null, since);
            if (files.length > 0) {
                const { data, duplicates } = await parseFileResults(files, filename);
                if (duplicates && duplicates.length > 0 && isNote) {
                    duplicates.forEach(pair => notesForConflictCheck.push(pair));
                }
                if (data.length > 0) {
                    // Integrity check for the batch
                    data.forEach(item => {
                        if (!item.gdid) {
                            dataIntegrityIssues.push({ type: 'missing', file: filename, mode: 'gdrive' });
                        } else if (gdidMap.has(item.gdid)) {
                            dataIntegrityIssues.push({
                                type: 'duplicate',
                                gdid: item.gdid,
                                file1: gdidMap.get(item.gdid),
                                file2: filename,
                                mode: 'gdrive'
                            });
                        } else {
                            gdidMap.set(item.gdid, filename);
                        }
                    });
                    if (filename === 'media.txt') {
                        for (let n of data) {
                            const i = mediaData.findIndex(m => m.gdid === n.gdid);
                            const localMedia = await getFromDB(MEDIA_STORE_NAME, n.gdid || n.id);
                            if (!localMedia || (parseInt(n.datemod, 10) > (parseInt(localMedia.datemod, 10) || 0))) {
                                actualMediaUpdates++;
                            }
                            if (i !== -1) mediaData[i] = n; else mediaData.push(n);
                        }
                    } else if (filename === 'board.txt') {
                        for (let n of data) {
                            const i = boardsData.findIndex(b =>
                                (n.gdid && b.gdid && b.gdid === n.gdid) ||
                                (n.id !== undefined && b.id !== undefined && String(b.id) === String(n.id)) ||
                                (n.title && b.title && b.title.trim().toLowerCase() === n.title.trim().toLowerCase())
                            );
                            const localBoard = await getFromDB(BOARD_STORE_NAME, n.gdid || n.id);
                            const isBoardChanged = !localBoard ||
                                localBoard.title !== n.title ||
                                localBoard.color !== n.color ||
                                localBoard.colorfont !== n.colorfont ||
                                localBoard.status !== n.status ||
                                localBoard.backnum !== n.backnum ||
                                localBoard.backpath !== n.backpath ||
                                localBoard.gdid !== n.gdid;
                            if (isBoardChanged) {
                                actualBoardUpdates++;
                            }
                            if (i !== -1) {
                                const oldGdid = boardsData[i].gdid;
                                if (oldGdid && n.gdid && oldGdid !== n.gdid && useIndexedDb) {
                                    await deleteFromDB(BOARD_STORE_NAME, oldGdid);
                                }
                                boardsData[i] = { ...boardsData[i], ...n };
                            } else {
                                boardsData.push(n);
                            }
                        }
                    }
                    let dataToPut = data;
                    if (isNote && useIndexedDb && (lastSyncTimestamp || dbExists)) {
                        const nonConflicting = [];
                        for (let serverNote of data) {
                            const localNote = await getFromDB(NOTE_STORE_NAME, serverNote.gdid || serverNote.id);
                            if (localNote) {
                                const isDifferent = serverNote.notetxt !== localNote.notetxt || serverNote.color !== localNote.color || serverNote.calendarDate !== localNote.calendarDate || serverNote.boardid !== localNote.boardid;
                                const localDm = parseInt(localNote.datemod, 10) || 0;
                                const isDirty = lastSyncTimestamp ? (localDm > lastSyncTimestamp) : isDifferent;

                                // Modal Safety: If this note is currently open in the modal, 
                                // we treat it as a conflict ONLY if the user has unsaved changes in the modal.
                                const modalBodyElem = document.getElementById('modal-body');
                                const modalGdid = modalBodyElem?.dataset.gdid;
                                const modalNoteId = modalBodyElem?.dataset.id;
                                const isOpenInModal = (serverNote.gdid && String(serverNote.gdid) === String(modalGdid)) || (serverNote.id && String(serverNote.id) === String(modalNoteId));

                                let hasUnsavedChangesInModal = false;
                                if (isOpenInModal && modalBodyElem) {
                                    const textarea = modalBodyElem.querySelector('textarea');
                                    const titleArea = modalBodyElem.querySelector('#note-edit-title-textarea');
                                    if (textarea) {
                                        let currentText = textarea.value;
                                        if (titleArea) currentText = titleArea.value + '|' + currentText;
                                        hasUnsavedChangesInModal = (currentText !== localNote.notetxt);
                                    }
                                }

                                const isConflict = isDifferent && (isDirty || (isOpenInModal && hasUnsavedChangesInModal));

                                /*
                                console.log(`[Sync-Debug] Note: ${serverNote.gdid || serverNote.id}`);
                                console.log(` - Server dm: ${serverNote.datemod}`);
                                console.log(` - Local dm: ${localNote.datemod}`);
                                console.log(` - Last sync base: ${lastSyncTimestamp || 'None'}`);
                                console.log(` - isDifferent: ${isDifferent}, isDirty: ${isDirty}, isOpenInModal: ${isOpenInModal}, hasUnsavedChanges: ${hasUnsavedChangesInModal}`);
                                */

                                if (isConflict) {
                                    console.log(`[Sync-Conflict!] Buffering for manual resolution: ${serverNote.gdid}${isOpenInModal ? " (Open in Modal with Changes)" : ""}`);
                                    notesForConflictCheck.push({ serverNote, localNote });
                                    continue;
                                } else if (isDifferent && !isDirty && isOpenInModal && !hasUnsavedChangesInModal) {
                                    // Special Case: Open in modal but no changes -> Auto-refresh the modal content
                                    console.log(`[Sync-Update] Auto-refreshing open note: ${serverNote.gdid}`);
                                    // We need to refresh the modal after sync finishes or immediately
                                    setTimeout(() => {
                                        const activeModalBody = document.getElementById('modal-body');
                                        const activeGdid = activeModalBody?.dataset.gdid;
                                        if (activeGdid && String(activeGdid) === String(serverNote.gdid)) {
                                            // Refresh content if still open
                                            showToast(_('noteUpdatedFromServer') || 'Note updated from server', 3000);
                                            // Trigger a refresh of the modal if possible
                                            // For now, it will be updated in allNotesData, but UI might need a nudge
                                        }
                                    }, 500);
                                } else if (isDifferent && !isDirty) {
                                    console.log(`[Sync-Update] Server version is newer: ${serverNote.gdid}`);
                                }
                            }
                            nonConflicting.push(serverNote);
                        }
                        dataToPut = nonConflicting;
                    }
                    if (isNote) {
                        for (const note of dataToPut) {
                            if (note.gdid && !updatedNoteGdims.includes(note.gdid)) {
                                const localNote = await getFromDB(NOTE_STORE_NAME, note.gdid);
                                if (!localNote || (parseInt(note.datemod, 10) > (parseInt(localNote.datemod, 10) || 0))) {
                                    updatedNoteGdims.push(note.gdid);
                                }
                            }
                        }
                    }
                    await bulkPutDB(storeName, dataToPut, true);

                    // Update allNotesData in memory to prevent stale data
                    if (isNote) {
                        dataToPut.forEach(newNote => {
                            const mIdx = allNotesData.findIndex(n => n.gdid === newNote.gdid);
                            if (mIdx !== -1) {
                                allNotesData[mIdx] = newNote;
                            } else {
                                allNotesData.push(newNote);
                            }
                        });
                    }

                    console.log(`[Sync] Updated ${filename}:`, dataToPut.length, "items.");
                }
            }
        };

        try {
            console.time("runGoogleDriveSync_Parallel");
            await Promise.all([
                syncFileWorker('board.txt', BOARD_STORE_NAME, false, false),
                syncFileWorker('media.txt', MEDIA_STORE_NAME, false),
                syncFileWorker('note.txt', NOTE_STORE_NAME, true)
            ]);
        } finally {
            try { console.timeEnd("runGoogleDriveSync_Parallel"); } catch (e) { }
        }
        const totalActualUpdates = updatedNoteGdims.length + actualBoardUpdates + actualMediaUpdates;
        console.log("[Sync-Run] Parallel sync workers finished. Actual updates:", totalActualUpdates);

        await saveConfig('lastGDTimestamp', syncStartTime);

        // --- Conflict Resolution Logic after GDrive Sync ---
        if (useIndexedDb && notesForConflictCheck.length > 0) {
            for (const pair of notesForConflictCheck) {
                const { serverNote, localNote } = pair;
                // Only trigger if content or critical fields actually differ
                if (serverNote.notetxt !== localNote.notetxt || serverNote.color !== localNote.color || serverNote.calendarDate !== localNote.calendarDate || serverNote.boardid !== localNote.boardid) {
                    // We use localNote as baseNote for mergeNotes since we don't have a common third version handy.
                    // This means mergeNotes won't automatically detect field conflicts (as local==base),
                    // so we manually check for differences and populate conflicts.
                    const baseNote = localNote;
                    const { conflicts } = mergeNotes(baseNote, localNote, serverNote);
                    if (Object.keys(conflicts).length === 0) {
                        if (serverNote.notetxt !== localNote.notetxt) conflicts.notetxt = { local: localNote.notetxt, server: serverNote.notetxt };
                        if (serverNote.color !== localNote.color) conflicts.color = { local: localNote.color, server: serverNote.color };
                        if (serverNote.calendarDate !== localNote.calendarDate) conflicts.calendarDate = { local: localNote.calendarDate, server: serverNote.calendarDate };
                    }
                    if (Object.keys(conflicts).length > 0) {
                        const resolved = await showNoteConflictModal(baseNote, localNote, serverNote, conflicts);
                        if (resolved) {
                            await bulkPutDB(NOTE_STORE_NAME, [resolved], true);
                            const mIdx = allNotesData.findIndex(n => n.gdid === resolved.gdid);
                            if (mIdx !== -1) allNotesData[mIdx] = resolved;
                            if (resolved.gdid && !updatedNoteGdims.includes(resolved.gdid)) {
                                updatedNoteGdims.push(resolved.gdid);
                            }
                        }
                    }
                }
            }
        }
        loaderText.textContent = _('syncFinishedLoadingData');
        return totalActualUpdates;
    } finally {
        isSyncing = false;
    }
}
let cachedLicenseData = null;
let cachedLicenseEmailHint = null;
async function decryptLicenseToken() {
    const currentEmail = sessionStorage.getItem('google_auth_email_hint');
    if (cachedLicenseData !== null && cachedLicenseEmailHint !== currentEmail) {
        cachedLicenseData = null;
    }
    if (cachedLicenseData !== null) return cachedLicenseData;
    cachedLicenseData = { email: null, validityDays: 30, ageInDays: 0, remainingDays: 0, pass: false };
    const url = new URL(window.location.href);
    const urlTokenParam = url.searchParams.get("token");
    if (urlTokenParam) {
        if (urlTokenParam !== localStorage.getItem('urlToken')) {
            localStorage.setItem('urlToken', urlTokenParam);
        }
    }
    let urlToken = localStorage.getItem('urlToken');
    if (!urlToken && typeof TRIAL_URL !== 'undefined') {
        try {
            urlToken = (new URL(TRIAL_URL)).searchParams.get("token");
            console.log("Using hardcoded trial token.");
        } catch (e) { }
    }
    let whitelistData = null;
    if (currentEmail) {
        const cachedEmail = localStorage.getItem('cached_whitelist_email');
        if (cachedEmail && cachedEmail !== currentEmail) {
            localStorage.removeItem('cached_whitelist_data');
            localStorage.removeItem('cached_whitelist_time');
            localStorage.removeItem('cached_whitelist_email');
        }
        const cachedDataStr = localStorage.getItem('cached_whitelist_data');
        const cachedTimeStr = localStorage.getItem('cached_whitelist_time');
        let cacheIsValid = false;
        if (cachedDataStr && cachedTimeStr && !isOffline) {
            const cachedTime = parseInt(cachedTimeStr, 10);
            try {
                whitelistData = JSON.parse(cachedDataStr);
                cacheIsValid = true;
                console.log("[License] Using cached whitelist data (age: " + Math.round((Date.now() - cachedTime) / 60000) + " minutes).");
                if (Date.now() - cachedTime > 12 * 60 * 60 * 1000) {
                    setTimeout(() => {
                        checkWhitelist(false).then(freshData => {
                            if (freshData) {
                                localStorage.setItem('cached_whitelist_data', JSON.stringify(freshData));
                                localStorage.setItem('cached_whitelist_time', Date.now().toString());
                                localStorage.setItem('cached_whitelist_email', currentEmail || '');
                                console.log("[License] Background whitelist update successful.");
                            }
                        }).catch(e => console.warn("Background whitelist update failed:", e));
                    }, 5000);
                }
            } catch (e) {
                console.warn("Error parsing cached whitelist data:", e);
            }
        }
        if (!cacheIsValid && !isOffline) {
            whitelistData = await checkWhitelist();
            if (whitelistData) {
                localStorage.setItem('cached_whitelist_data', JSON.stringify(whitelistData));
                localStorage.setItem('cached_whitelist_time', Date.now().toString());
                localStorage.setItem('cached_whitelist_email', currentEmail || '');
            }
        }
    } else {
        // Без email (logout) — изчисляваме оставащия срок от запазените данни
        const savedDays = localStorage.getItem('license_remaining_days');
        const savedTime = localStorage.getItem('license_remaining_timestamp');
        if (savedDays && savedTime) {
            const elapsed = (Date.now() - parseInt(savedTime, 10)) / (1000 * 60 * 60 * 24);
            const remaining = Math.max(0, Math.floor(parseFloat(savedDays) - elapsed));
            cachedLicenseData.pass = remaining > 0;
            cachedLicenseData.remainingDays = remaining;
            console.log(`[License] No user email; using stored license data (${remaining} days remaining).`);
            cachedLicenseEmailHint = currentEmail;
            return cachedLicenseData;
        }
    }
    if (whitelistData) {
        if (whitelistData.terminated === true || whitelistData.terminated === "YES") {
            console.warn("Access terminated by server administrator.");
            cachedLicenseData.pass = false;
            cachedLicenseData.remainingDays = 0;
            cachedLicenseData.email = whitelistData.email;
            cachedLicenseEmailHint = currentEmail;
            return cachedLicenseData;
        }
        cachedLicenseData.pass = whitelistData.success === true;
        const term = whitelistData.term || whitelistData.newTerm || 30;
        const daysPassed = whitelistData.daysPassed || 0;
        if (whitelistData.success === true) {
            cachedLicenseData.remainingDays = Math.max(0, term - daysPassed);
        } else if ((whitelistData.extended === true || whitelistData.extended === "YES") && whitelistData.newTerm > 0) {
            cachedLicenseData.pass = true;
            cachedLicenseData.remainingDays = whitelistData.newTerm;
        } else {
            cachedLicenseData.remainingDays = 0;
        }
        cachedLicenseData.email = whitelistData.email;
        if (cachedLicenseData.pass) {
            localStorage.setItem('license_remaining_days', String(cachedLicenseData.remainingDays));
            localStorage.setItem('license_remaining_timestamp', String(Date.now()));
            cachedLicenseEmailHint = currentEmail;
            return cachedLicenseData;
        }
    } else if (!isOffline && currentEmail) {
        console.warn("Whitelist check failed.");
    }
    if (!urlToken) {
        if (!ts) {
            ts = await getFirstStartEncoded(true); // Persist if it's the very first start
        }
        const ageInDays = (Date.now() - parseInt(ts, 10)) / (1000 * 60 * 60 * 24);
        const validityInDays = 30;
        const remainingDays = Math.max(0, Math.floor(validityInDays - ageInDays)) + 1;
        cachedLicenseData.ageInDays = ageInDays;
        cachedLicenseData.remainingDays = remainingDays;
        cachedLicenseData.pass = ageInDays < validityInDays;
        cachedLicenseEmailHint = currentEmail;
        if (!cachedLicenseData.pass) {
            console.warn("Trial period has expired. License required.");
        } else if (!whitelistData) {
            console.log(`Working in offline trial mode (${remainingDays} days remaining).`);
        }
        return cachedLicenseData;
    }
    try {
        const b64 = urlToken.replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64 + '='.repeat((4 - b64.length % 4) % 4);
        const raw = Uint8Array.from(atob(pad), c => c.charCodeAt(0));
        const iv = raw.slice(0, 12), data = raw.slice(12);
        const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(CLIENT_ID.match(/-(.{16})/)[1]), { name: 'AES-GCM' }, false, ['decrypt']);
        const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        const [decryptedEmail, timestamp, tokenValidity] = new TextDecoder().decode(out).split('|');
        const isDeviceValidated = (localStorage.getItem('validatedTokenForDevice') === urlToken);
        if (!isDeviceValidated) {
            const localPart = decryptedEmail.split('@')[0];
            if (localPart !== 'all' && currentEmail && decryptedEmail !== currentEmail) {
                // Do not remove the token, so it consistently fails instead of reverting to the trial on reload
                throw new Error(`Token email (${decryptedEmail}) mismatch for user (${currentEmail})`);
            }
            if (currentEmail) {
                localStorage.setItem('validatedTokenForDevice', urlToken);
            }
        }
        if (!ts) ts = await getFirstStartEncoded();
        const ageInDays = (Date.now() - parseInt(ts, 10)) / (1000 * 60 * 60 * 24);
        let validityInDays = 30;
        if (tokenValidity && !isNaN(parseInt(tokenValidity))) validityInDays = parseInt(tokenValidity, 10);
        const remainingDays = Math.max(0, Math.ceil(validityInDays - ageInDays));
        cachedLicenseData = { urlTokenUsed: urlToken, email: decryptedEmail, validityDays: validityInDays, ageInDays, remainingDays, pass: ageInDays < validityInDays };
        cachedLicenseEmailHint = currentEmail;
        console.log(`License token: Age: ${ageInDays.toFixed(2)} days, Remaining: ${remainingDays} days`);
    } catch (error) {
        console.warn("Error decrypting license token.", error);
        cachedLicenseData.pass = false;
        cachedLicenseData.remainingDays = 0;
        cachedLicenseEmailHint = currentEmail;
    }
    return cachedLicenseData;
}

/**
 * Refreshes the Google Auth Token silently if possible.
 */
// Singleton promise to prevent multiple concurrent refresh attempts
let refreshPromise = null;

async function refreshAuthToken(forcePopup = false, quiet = false) {
    if (refreshPromise) return refreshPromise;

    refreshPromise = new Promise(async (resolve, reject) => {
        console.log("Refreshing auth token (forcePopup: " + forcePopup + ", quiet: " + quiet + ")...");
        try {
            if (forcePopup && authPopupAttempted) {
                console.warn("Popup auth already attempted this session; skipping.");
                resolve({ pass: false, error: { error: 'popup_already_attempted' } });
                return;
            }
            // Wait for Google Identity Services to load (with timeout)
            const waitForGis = () => new Promise((res, rej) => {
                if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                    res(true);
                    return;
                }
                let attempts = 0;
                const maxAttempts = 150; // 15 seconds total (150 * 100ms)
                const checkInterval = setInterval(() => {
                    attempts++;
                    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                        clearInterval(checkInterval);
                        res(true);
                    } else if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        rej(new Error("Google Identity Services not loaded after 15 seconds."));
                    }
                }, 100);
            });

            try {
                await waitForGis();
            } catch (gisError) {
                console.warn("GIS not available, cannot refresh token:", gisError.message);
                reject(new Error("Google Identity Services not loaded. User interaction required."));
                return;
            }
            const client = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: async (tokenResponse) => {
                    clearTimeout(requestTimeout); // Спираме таймера при отговор
                    if (tokenResponse && tokenResponse.access_token) {
                        const tokenWithTimestamp = { ...tokenResponse, issued_at: Date.now() };

                        // Проверяваме дали акаунтът не се е променил при опресняване на токена
                        try {
                            const userInfoResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                                headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
                            });
                            if (userInfoResp.ok) {
                                const userInfo = await userInfoResp.json();
                                const previousEmail = localStorage.getItem('google_login_hint') || sessionStorage.getItem('google_auth_email_hint');
                                if (previousEmail && userInfo.email && previousEmail !== userInfo.email) {
                                    console.warn(`[refreshAuthToken] User account changed: ${previousEmail} → ${userInfo.email}. Resetting folder settings.`);
                                    localStorage.removeItem('active_folder_name');
                                    clearCachedMainFolderId();
                                    localStorage.removeItem('initial_setup_complete');
                                    localStorage.removeItem('settings_multinotes_data');
                                    localStorage.removeItem('gdrive_folder_names');
                                    sessionStorage.removeItem('first_run_lock');
                                    ['Other', 'Sound', 'Video', 'Images'].forEach(name => localStorage.removeItem(`gdrive_folder_id_${name}`));
                                    activeFolderName = 'AppDataFolder';
                                    cachedMainFolderId = null;
                                    folderIds = {};
                                }
                                if (userInfo.email) {
                                    sessionStorage.setItem('google_auth_email_hint', userInfo.email);
                                    localStorage.setItem('google_login_hint', userInfo.email);
                                }
                            }
                        } catch (uErr) {
                            console.warn('[refreshAuthToken] Could not verify userinfo during token refresh:', uErr);
                        }

                        // Determine storage based on existing token location or rememberMe
                        if (sessionStorage.getItem('google_auth_token')) {
                            sessionStorage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                        }
                        const rememberMe = localStorage.getItem('google_auth_token') !== null || localStorage.getItem('rememberMe') === 'true';
                        if (rememberMe) {
                            localStorage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                        } else if (!sessionStorage.getItem('google_auth_token')) {
                            sessionStorage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                        }
                        console.log("Token refreshed successfully.");
                        authPopupAttempted = false; // Сесията е подновена — разрешаваме попъп при следващо изтичане
                        // Update global state immediately
                        authToken = tokenWithTimestamp;
                        if (typeof gapi !== 'undefined' && gapi.client) {
                            gapi.client.setToken({ access_token: authToken.access_token });
                        }
                        resolve({ pass: true, tokenData: tokenWithTimestamp });
                    } else {
                        console.warn("Token refresh failed:", tokenResponse);
                        // Handle cases where interaction is required (e.g. session expired after long idle)
                        if (tokenResponse && (tokenResponse.error === 'interaction_required' || tokenResponse.error === 'access_denied')) {
                            if (!quiet) {
                                if (typeof showToast === 'function') {
                                    showToast(_('sessionExpired') || "Session expired. Please sign in again.", 5000);
                                }
                                // Small delay to let the user see the toast before redirect
                                setTimeout(() => {
                                    if (!isSyncSuspended && typeof initLoginPage === 'function') initLoginPage();
                                }, 1500);
                            }
                        }
                        resolve({ pass: false, error: tokenResponse });
                    }
                },
            });

            const loginHint = sessionStorage.getItem('google_auth_email_hint') ||
                localStorage.getItem('google_login_hint') ||
                cachedLicenseEmailHint ||
                (cachedLicenseData && cachedLicenseData.email_hint);

            // Request the token
            const tokenOptions = {
                prompt: forcePopup ? 'select_account' : 'none'
            };
            if (loginHint) tokenOptions.hint = loginHint;

            // Таймер за безопасност: ако Google не отговори
            const isSilent = !forcePopup && tokenOptions.prompt === 'none';
            const timeoutDuration = isSilent ? 15000 : 30000; // 15s за тих опит, 30s за попъп
            const requestTimeout = setTimeout(async () => {
                const errMsg = isSilent ? "Silent token refresh failed/blocked." : "Token refresh request timed out after 30s.";
                console.warn(errMsg);
                if (isSilent) {
                    if (quiet) {
                        resolve({ pass: false, error: { error: 'silent_timeout' } });
                        return;
                    }
                    console.log("Attempting token refresh with interactive popup...");
                    try {
                        refreshPromise = null;
                        const popupResult = await refreshAuthToken(true);
                        resolve(popupResult);
                    } catch (popupErr) {
                        reject(popupErr);
                    }
                } else {
                    reject(new Error(errMsg));
                }
            }, timeoutDuration);
            if (!isSilent) authPopupAttempted = true;
            client.requestAccessToken(tokenOptions);
        } catch (error) {
            console.error("Critical error in refreshAuthToken:", error);
            reject(error);
        }
    }).finally(() => {
        refreshPromise = null;
    });

    return refreshPromise;
}

function notifyManualGoogleLoginRequired() {
    if (typeof showToast === 'function') {
        showToast(_('sessionExpired') || "Session expired. Please sign in again.", 5000);
    }
    setTimeout(() => {
        if (typeof initLoginPage === 'function') initLoginPage();
    }, 1500);
}

/**
 * Проактивно обновява токена ~5 минути преди изтичането му, за да не се
 * налага интеракция по средата на работа. Изпълнява се тихо (quiet) — без popup,
 * без toast и без логин екран при неуспех.
 */
function scheduleProactiveTokenRefresh() {
    if (proactiveRefreshTimer) clearInterval(proactiveRefreshTimer);
    proactiveRefreshTimer = setInterval(async () => {
        if (isOffline || isSyncSuspended) return;
        const storedToken = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedToken) return;
        let tokenData;
        try { tokenData = JSON.parse(storedToken); } catch (e) { return; }
        if (!tokenData || !tokenData.issued_at || !tokenData.expires_in) return;
        const elapsedSeconds = (Date.now() - tokenData.issued_at) / 1000;
        const remainingSeconds = tokenData.expires_in - elapsedSeconds;
        if (remainingSeconds < 300 && remainingSeconds > 0) {
            console.log(`Proactive token refresh: token expires in ~${Math.round(remainingSeconds)}s.`);
            try {
                const result = await refreshAuthToken(false, true);
                if (result && result.pass) {
                    console.log("Proactive token refresh succeeded.");
                } else {
                    console.warn("Proactive token refresh did not succeed; will retry later if still within window.");
                }
            } catch (e) {
                console.warn("Proactive token refresh failed:", e);
            }
        }
    }, 60000);
}

/**
 * Downloads file contents with Concurrency Control & 'Kick' mechanism.
 */
async function fetchFiles(filename, folderId, onProgress, modifiedSince = null) {
    let query = `'${folderId}' in parents and name = '${filename}' and mimeType='text/plain' and trashed = false`;
    if (modifiedSince) query += ` and modifiedTime > '${modifiedSince}'`;
    let allFiles = [];
    if (filename) console.time(`fetchFiles_${filename}_List`);

    const listFiles = async (token) => {
        let files = [];
        let nextToken = null;
        do {
            const spacesParam = (folderId === 'appDataFolder') ? '&spaces=appDataFolder' : '';
            const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name),nextPageToken&pageSize=1000${nextToken ? `&pageToken=${nextToken}` : ''}${spacesParam}&t=${Date.now()}`;
            const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
            if (!resp.ok) {
                const errorData = await resp.json().catch(() => ({}));
                if (resp.status === 401) throw { status: 401, error: errorData };
                throw new Error(`Drive API List failed: ${resp.status} ${JSON.stringify(errorData)}`);
            }
            const result = await resp.json();
            files.push(...(result.files || []));
            nextToken = result.nextPageToken;
        } while (nextToken);
        return files;
    };

    let attempts = 0;
    const maxAttempts = 3;
    try {
        while (attempts < maxAttempts) {
            attempts++;
            try {
                let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
                if (!storedTokenString) throw new Error(_('errorTokenMissing'));
                let tokenData = JSON.parse(storedTokenString);
                allFiles = await listFiles(tokenData.access_token);
                break;
            } catch (e) {
                if (e.status === 401 || (e.result && e.result.error && e.result.error.code === 401)) {
                    if (attempts >= maxAttempts) throw new Error("Drive API List failed (Auth) after retries.");
                    console.warn(`Got 401 during file list (Attempt ${attempts}), attempting token refresh...`);
                    try {
                        const refreshed = await refreshAuthToken(false);
                        if (!refreshed || !refreshed.pass) throw new Error("Token refresh failed.");
                        await new Promise(r => setTimeout(r, 500));
                    } catch (refreshError) {
                        console.error("Token refresh failed during retry:", refreshError);
                        notifyManualGoogleLoginRequired();
                        throw new Error("Drive API List failed (Auth Refresh Failed).");
                    }
                } else throw e;
            }
        }
    } finally {
        if (filename) {
            try { console.timeEnd(`fetchFiles_${filename}_List`); } catch (e) { }
        }
    }
    if (allFiles.length === 0) return [];
    let loadedFiles = 0;
    const totalFiles = allFiles.length;
    // --- robust token retrieval ---
    const tokenObj = (typeof authToken !== 'undefined' && authToken) ? authToken : (gapi.client.getToken() || gapi.auth.getToken());
    let accessToken = tokenObj ? tokenObj.access_token : null;
    if (!accessToken) {
        console.error("No access token found for file download!");
        throw new Error("Missing auth token.");
    }
    // LIMIT CONCURRENCY: Don't overwhelm the browser socket pool
    const CONCURRENCY_LIMIT = 100;
    console.log(`[${filename}] Starting throttled fetch. Total: ${totalFiles}, Limit: ${CONCURRENCY_LIMIT}`);
    if (filename) {
        try { console.time(`fetchFiles_${filename}_Total`); } catch (e) { }
    }
    const UI_STEP = totalFiles <= 50 ? 1 : Math.max(5, Math.floor(totalFiles / 50));

    const downloadWithKick = async (file, attempt = 1) => {
        const controller = new AbortController();
        const kickId = setTimeout(() => { if (attempt === 1) controller.abort(); }, 1200);
        try {
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&t=${Date.now()}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` },
                cache: 'no-store',
                priority: 'high',
                signal: controller.signal
            });
            clearTimeout(kickId);

            if (!response.ok) {
                if (response.status === 401) {
                    console.warn(`Got 401 fetching file ${file.id}, refreshing token...`);
                    const refreshResult = await refreshAuthToken();
                    if (refreshResult && refreshResult.tokenData) {
                        accessToken = refreshResult.tokenData.access_token;
                    } else {
                        throw new Error("Token refresh failed");
                    }

                    // Retry
                    const retryResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media&t=${Date.now()}`, {
                        headers: { 'Authorization': `Bearer ${accessToken}` },
                        cache: 'no-store',
                        priority: 'high'
                    });

                    if (!retryResponse.ok) throw new Error(`HTTP Error ${retryResponse.status}`);
                    const body = await retryResponse.text();

                    loadedFiles++;
                    if (onProgress && (loadedFiles % UI_STEP === 0 || loadedFiles === totalFiles)) {
                        onProgress(loadedFiles, totalFiles);
                    }
                    return { res: { body }, id: file.id };
                }
                throw new Error(`HTTP Error ${response.status}`);
            }

            const body = await response.text();
            if (file.id === '1aQ67KIr7Lv6cLhimAwcznpr3n11z0KmP') {
                console.warn(`[DEBUG-LOAD] Content of ${file.id}:`, body.substring(0, 200));
            }
            loadedFiles++;
            if (onProgress && (loadedFiles % UI_STEP === 0 || loadedFiles === totalFiles)) {
                onProgress(loadedFiles, totalFiles);
            }
            return { res: { body }, id: file.id };

        } catch (error) {
            clearTimeout(kickId);
            if ((error.name === 'AbortError' || error.message.includes('aborted')) && attempt === 1) {
                return downloadWithKick(file, 2);
            }
            if (attempt < 3 && error.name !== 'AbortError') {
                return new Promise(resolve => setTimeout(() => resolve(downloadWithKick(file, attempt + 1)), 500));
            }
            console.error(`[${filename}] Error for ${file.name}:`, error.message);
            return { res: null, id: file.id };
        }
    };
    // SLIDING WINDOW POOL
    const results = [];
    const pool = new Set();
    for (const file of allFiles) {
        if (pool.size >= CONCURRENCY_LIMIT) {
            await Promise.race(pool);
        }
        const promise = downloadWithKick(file).then(res => {
            pool.delete(promise);
            return res;
        });
        results.push(promise);
        pool.add(promise);
    }
    const finalResults = await Promise.all(results);
    if (filename) {
        try { console.timeEnd(`fetchFiles_${filename}_Total`); } catch (e) { }
    }
    return finalResults;
}

async function getFileID(folderId, fileName) {
    if (isOffline) return null;
    try {
        const query = encodeURIComponent(`'${folderId}' in parents and name = '${fileName}'`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&pageSize=1`;

        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) return null;
        let tokenData = JSON.parse(storedTokenString);

        let resp = await fetch(url, { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
        if (resp.status === 401) {
            const refresh = await refreshAuthToken(false);
            if (refresh && refresh.pass) {
                tokenData = refresh.tokenData;
                resp = await fetch(url, { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
            }
        }
        if (!resp.ok) return null;
        const result = await resp.json();
        return result.files?.[0]?.id || null;
    } catch (e) { return null; }
}
async function updateLocalFile(gdid, content) {
    if (!gdid) return false;
    try {
        const handle = await getDirectoryHandle();
        if (!handle) {
            // Няма handle (например Android) — fallback към изтегляне
            if (typeof downloadAsFile === 'function') {
                const fname = localFileMap.get(gdid) || `note-${gdid}.txt`;
                downloadAsFile(fname, content, 'text/plain');
                return true;
            }
            return false;
        }
        let filename = localFileMap.get(gdid);
        if (!filename) {
            // Ако нямаме записано име, търсим свободно такова по схемата note.txt, note (1).txt...
            filename = `note.txt`;
            let exists = false;
            try {
                await handle.getFileHandle(filename, { create: false });
                exists = true;
            } catch (e) { exists = false; }
            if (exists) {
                let counter = 1;
                while (true) {
                    filename = `note (${counter}).txt`;
                    try {
                        await handle.getFileHandle(filename, { create: false });
                        counter++;
                    } catch (e) { break; }
                }
            }
            localFileMap.set(gdid, filename);
        }
        const fileHandle = await handle.getFileHandle(filename, { create: true });
        try {
            const writable = await fileHandle.createWritable();
            try {
                await writable.write(new Blob([content], { type: 'text/plain' }));
            } finally {
                await writable.close();
            }
        } catch (writeErr) {
            // createWritable не се поддържа (Android) — fallback към изтегляне
            console.warn(`createWritable failed for ${filename}, falling back to download:`, writeErr.message);
            if (typeof downloadAsFile === 'function') {
                downloadAsFile(filename, content, 'text/plain');
            }
        }
        return true;
    } catch (e) {
        console.error("Local file update failed:", e);
        return false;
    }
}
async function deleteLocalFile(gdid) {
    if (!gdid) return false;
    try {
        const handle = await getDirectoryHandle();
        if (!handle) return false;

        const filename = localFileMap.get(gdid);
        if (filename) {
            await handle.removeEntry(filename);
            localFileMap.delete(gdid);
            return true;
        }
        return false;
    } catch (e) {
        if (e.name === 'NotFoundError') return true;
        console.error("Local file delete failed:", e);
        return false;
    }
}
async function updateGDriveFile(fileId, content) {
    if (isOffline || !fileId) return false;
    const sendRequest = async (token) => {
        return fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'text/plain'
            },
            body: content
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) throw new Error(_('errorTokenMissing'));
        let tokenData = JSON.parse(storedTokenString);
        let response = await sendRequest(tokenData.access_token);
        if (response.status === 401) {
            console.warn("401 Unauthorized in updateGDriveFile, attempting silent refresh...");
            let refreshResult = await refreshAuthToken(false);
            if (refreshResult && refreshResult.pass) {
                tokenData = refreshResult.tokenData;
                response = await sendRequest(tokenData.access_token);
            }
            if (response.status === 401) {
                notifyManualGoogleLoginRequired();
            }
            if (response.status === 401) throw new Error("401 Unauthorized - access token expired.");
        }
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[GDrive-Error] Status: ${response.status}, Details: ${errorText}`);
            throw new Error(`${_('errorSaveGDrive')} (Status: ${response.status})`);
        }
        return true;
    } catch (error) {
        console.error("GDrive update failed:", error);
        throw error;
    }
}
async function deleteGDriveFile(fileId) {
    if (!fileId) return false;
    const sendRequest = async (token) => {
        return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) throw new Error(_('errorTokenMissing'));
        let tokenData = JSON.parse(storedTokenString);
        let response = await sendRequest(tokenData.access_token);
        if (response.status === 401) {
            console.warn("401 Unauthorized in deleteGDriveFile, attempting silent refresh...");
            let refreshResult = await refreshAuthToken(false);
            if (refreshResult && refreshResult.pass) {
                tokenData = refreshResult.tokenData;
                response = await sendRequest(tokenData.access_token);
            }
            if (response.status === 401) {
                notifyManualGoogleLoginRequired();
            }
            if (response.status === 401) throw new Error("401 Unauthorized - access token expired.");
        }
        if (response.status === 404) return false;
        if (!response.ok && response.status !== 204) throw new Error(`HTTP Error ${response.status}`);
        return true;
    } catch (error) {
        console.error("GDrive delete failed:", error);
        throw error;
    }
}

async function emptyAppDataFolder() {
    if (isOffline) return false;
    let nextPageToken = null;
    let allFiles = [];
    try {
        do {
            const query = encodeURIComponent("trashed=false");
            const url = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,parents),nextPageToken&pageSize=1000${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`;
            const sendRequest = async (token) => {
                return fetch(url, {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            };
            let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
            if (!storedTokenString) return false;
            let tokenData = JSON.parse(storedTokenString);
            let response = await sendRequest(tokenData.access_token);
            if (response.status === 401) {
                let refreshResult = await refreshAuthToken(false);
                if (refreshResult && refreshResult.pass) {
                    tokenData = refreshResult.tokenData;
                    response = await sendRequest(tokenData.access_token);
                }
            }
            if (!response.ok) break;
            const result = await response.json();
            if (result.files) {
                allFiles = allFiles.concat(result.files);
            }
            nextPageToken = result.nextPageToken;
        } while (nextPageToken);
        if (allFiles.length === 0) return true;
        const appSettingsId = await getAppSettingsFolderId();
        const pool = new Set();
        const CONCURRENCY_LIMIT = 10;
        for (const file of allFiles) {
            const id = file.id;
            const parents = file.parents || [];
            if (id === appSettingsId || parents.includes(appSettingsId)) continue;
            if (pool.size >= CONCURRENCY_LIMIT) await Promise.race(pool);
            const promise = deleteGDriveFile(id).finally(() => pool.delete(promise));
            pool.add(promise);
        }
        await Promise.all(pool);
        return true;
    } catch (e) {
        console.error("emptyAppDataFolder error:", e);
        return false;
    }
}


/**
 * Търси максималните стойности на id и numord сред бележките и ги запазва в глобални променливи,
 * ако са по-големи от текущите им стойности (1 000 000).
 */
function trackMaxIds(notes) {
    if (!Array.isArray(notes)) return;
    let changed = false;
    notes.forEach(note => {
        const id = parseInt(note.id, 10);
        const numord = parseInt(note.numord, 10);
        if (!isNaN(id) && id > noteId) { noteId = id; changed = true; }
        if (!isNaN(numord) && numord > noteNumord) { noteNumord = numord; changed = true; }
    });
    if (changed) syncFolderDataAsync();
}

/**
 * Създава нов файл в Google Drive в указаната папка.
 */
async function createGDriveFile(folderId, filename, content) {
    if (isOffline) return null;
    const sendRequest = async (token) => {
        const metadata = {
            name: filename,
            parents: [folderId],
            mimeType: 'text/plain'
        };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([content], { type: 'text/plain' }));
        return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) throw new Error(_('errorTokenMissing'));
        let tokenData = JSON.parse(storedTokenString);
        let response = await sendRequest(tokenData.access_token);
        if (response.status === 401) {
            console.warn("401 Unauthorized in createGDriveFile, attempting silent refresh...");
            let refreshResult = await refreshAuthToken(false);
            if (refreshResult && refreshResult.pass) {
                tokenData = refreshResult.tokenData;
                response = await sendRequest(tokenData.access_token);
            }
            if (response.status === 401) {
                notifyManualGoogleLoginRequired();
            }
            if (response.status === 401) throw new Error("401 Unauthorized - access token expired.");
        }
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const result = await response.json();
        return result.id;
    } catch (e) {
        console.error("Error creating GDrive file:", e);
        throw e;
    }
}

// Uploads a binary Blob (image, etc.) to Google Drive and returns the file ID
async function uploadBlobToGDrive(folderId, filename, blob, mimeType) {
    if (isOffline) return null;
    const sendRequest = async (token) => {
        const metadata = {
            name: filename,
            parents: [folderId]
        };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', blob, filename);
        return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: form
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) throw new Error(_('errorTokenMissing'));
        let tokenData = JSON.parse(storedTokenString);
        let response = await sendRequest(tokenData.access_token);
        if (response.status === 401) {
            let refreshResult = await refreshAuthToken(false);
            if (refreshResult && refreshResult.pass) {
                tokenData = refreshResult.tokenData;
                response = await sendRequest(tokenData.access_token);
            }
            if (response.status === 401) {
                notifyManualGoogleLoginRequired();
            }
            if (response.status === 401) throw new Error("401 Unauthorized - access token expired.");
        }
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const result = await response.json();
        return result.id;
    } catch (e) {
        console.error("Error uploading blob to GDrive:", e);
        throw e;
    }
}

async function createNewGDriveFolder(folderName, parentId = null) {
    if (isOffline) return null;
    const sendRequest = async (token) => {
        const body = {
            name: folderName,
            mimeType: 'application/vnd.google-apps.folder'
        };
        if (parentId) body.parents = [parentId];
        return fetch('https://www.googleapis.com/drive/v3/files', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) throw new Error(_('errorTokenMissing'));
        let tokenData = JSON.parse(storedTokenString);
        let response = await sendRequest(tokenData.access_token);
        if (response.status === 401) {
            let refreshResult = await refreshAuthToken(false);
            if (refreshResult && refreshResult.pass) {
                tokenData = refreshResult.tokenData;
                response = await sendRequest(tokenData.access_token);
            }
        }
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const result = await response.json();
        return result.id;
    } catch (e) {
        console.error("Error creating GDrive folder:", e);
        throw e;
    }
}

/**
 * Създава нова бележка в текущия борд.
 */
async function isGDriveFolderEmpty(folderId) {
    if (isOffline || !folderId) return true;
    const sendRequest = async (token) => {
        const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
        const spacesParam = (folderId === 'appDataFolder') ? '&spaces=appDataFolder' : '';
        return fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&pageSize=1&fields=files(id)${spacesParam}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) return true;
        let tokenData = JSON.parse(storedTokenString);
        let resp = await sendRequest(tokenData.access_token);
        if (resp.status === 401) {
            let refresh = await refreshAuthToken(false);
            if (refresh && refresh.pass) resp = await sendRequest(refresh.tokenData.access_token);
        }
        if (!resp.ok) return true;
        const result = await resp.json();
        return !result.files || result.files.length === 0;
    } catch (e) {
        console.error("isGDriveFolderEmpty error:", e);
        return true;
    }
}

async function copyGDriveFile(fileId, newParentId, newName) {
    if (isOffline || !fileId || !newParentId) return null;
    const sendRequest = async (token) => {
        const body = { parents: [newParentId] };
        if (newName) body.name = newName;
        return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/copy`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) throw new Error(_('errorTokenMissing'));
        let tokenData = JSON.parse(storedTokenString);
        let resp = await sendRequest(tokenData.access_token);
        if (resp.status === 401) {
            let refresh = await refreshAuthToken(false);
            if (refresh && refresh.pass) {
                tokenData = refresh.tokenData;
                resp = await sendRequest(tokenData.access_token);
            }
        }
        if (!resp.ok) {
            if (resp.status === 404) {
                console.warn(`[GDrive] Copy failed: File ${fileId} not found (404). Skipping.`);
                return null;
            }
            throw new Error(`HTTP Error ${resp.status}`);
        }
        const result = await resp.json();
        return result.id;
    } catch (e) {
        if (e.message && e.message.includes('404')) {
            console.warn(`[GDrive] Copy failed: File ${fileId} not found (404). Skipping.`);
            return null;
        }
        console.error("copyGDriveFile error:", e);
        return null;
    }
}

async function migrateDataToNewFolder(targetFolderId) {
    const backupOnBeforeUnload = window.onbeforeunload;
    let reloadBtn = document.getElementById('reload_button');
    let counterElem = document.getElementById('note-counter');
    const originalReloadHtml = reloadBtn ? reloadBtn.innerHTML : null;
    if (!counterElem) counterElem = document.querySelector('.note-counter') || document.getElementById('footer-note-count');
    const originalCounterHtml = counterElem ? counterElem.innerHTML : null;
    const CONCURRENCY_LIMIT = 10;
    try {
        window.onbeforeunload = function () { return _('migrationInProgressWarn') || "Migration in progress, please wait..."; };
        if (reloadBtn) {
            reloadBtn.style.pointerEvents = 'none';
            reloadBtn.innerHTML = `<img src="Refresh.png" style="width:24px; height:24px; animation: spin 0.8s linear infinite;">`;
        }
        if (typeof showToast === 'function') showToast(_('migratingData') + " (Parallel)");
        console.time("Migration_Parallel");
        if (useIndexedDb) {
            try { await clearIndexedDB(); } catch (e) { console.warn('[Migration] Error clearing IndexedDB:', e); }
        }
        const subfolderNames = ["Other", "Sound", "Video", "Images"];
        const newSubfolderIds = {};
        for (const name of subfolderNames) {
            newSubfolderIds[name] = await createNewGDriveFolder(name, targetFolderId);
        }
        const rawBoards = (boardsData || []);
        const boardsToMigrate = [];
        const seenTitles = new Set();
        for (const b of rawBoards) {
            if (b.title && !seenTitles.has(b.title)) {
                boardsToMigrate.push(b);
                seenTitles.add(b.title);
            }
        }
        const totalBoards = boardsToMigrate.length;
        const boardGdidMap = {};
        let pool = new Set();
        let boardResults = [];
        let completedBoards = 0;
        for (let i = 0; i < totalBoards; i++) {
            if (pool.size >= CONCURRENCY_LIMIT) await Promise.race(pool);
            const board = boardsToMigrate[i];
            const oldGdid = board.gdid;
            const oldId = board.id;
            const boardToSave = JSON.parse(JSON.stringify(board));
            const promise = createGDriveFile(targetFolderId, 'board.txt', JSON.stringify(boardToSave)).then(async res => {
                if (res) {
                    boardToSave.gdid = res;
                    await updateGDriveFile(res, JSON.stringify(boardToSave));
                    board.gdid = res;
                    if (oldGdid) boardGdidMap[oldGdid] = res;
                    if (oldId) boardGdidMap[oldId] = res;
                    if (useIndexedDb) await bulkPutDB(BOARD_STORE_NAME, [boardToSave], true);
                }
                pool.delete(promise);
                completedBoards++;
                if (counterElem) counterElem.innerText = `[B] ${completedBoards}/${totalBoards}`;
                return res;
            });
            pool.add(promise);
            boardResults.push(promise);
        }
        await Promise.all(boardResults);
        boardsData = boardsToMigrate;
        const rawNotes = (allNotesData || []);
        const notesToMigrate = [];
        const seenNoteKeys = new Set();
        for (const n of rawNotes) {
            const key = n.gdid || n.id;
            if (key && !seenNoteKeys.has(key)) {
                seenNoteKeys.add(key);
                notesToMigrate.push(n);
            }
        }
        allNotesData = notesToMigrate;
        const totalNotes = notesToMigrate.length;
        const mediaToMigrate = (mediaData || []);
        const mediaNotesMap = {};
        for (const item of mediaToMigrate) {
            if (item.noteid) mediaNotesMap[item.noteid] = null;
        }
        pool = new Set();
        let noteResults = [];
        let completedNotes = 0;
        for (let i = 0; i < totalNotes; i++) {
            if (pool.size >= CONCURRENCY_LIMIT) await Promise.race(pool);
            const note = { ...notesToMigrate[i] };
            const oldGdid = note.gdid;
            delete note.gdid;
            const promise = (async () => {
                try {
                    if (note.boardid && boardGdidMap[note.boardid]) {
                        note.boardid = boardGdidMap[note.boardid];
                    }
                    const newId = await createGDriveFile(targetFolderId, 'note.txt', JSON.stringify(note));
                    if (newId) {
                        note.gdid = newId;
                        if (oldGdid && mediaNotesMap.hasOwnProperty(oldGdid)) {
                            mediaNotesMap[oldGdid] = newId;
                        }
                        if (useIndexedDb) await bulkPutDB(NOTE_STORE_NAME, [note], true);
                    }
                } finally {
                    completedNotes++;
                    if (counterElem) counterElem.innerText = `[N] ${completedNotes}/${totalNotes}`;
                }
            })().then(() => {
                pool.delete(promise);
            });
            pool.add(promise);
            noteResults.push(promise);
        }
        await Promise.all(noteResults);
        const newMediaData = [];
        const totalMedia = mediaToMigrate.length;
        pool = new Set();
        let mediaResults = [];
        let completedMedia = 0;
        for (let i = 0; i < totalMedia; i++) {
            if (pool.size >= CONCURRENCY_LIMIT) await Promise.race(pool);
            const item = mediaToMigrate[i];
            const promise = (async () => {
                const newItem = { ...item };
                if (newItem.noteid && mediaNotesMap[newItem.noteid]) {
                    newItem.noteid = mediaNotesMap[newItem.noteid];
                }
                const typeFolderName = (item.type === 1 ? "Images" : (item.type === 2 ? "Sound" : (item.type === 4 ? "Video" : "Other")));
                const targetSubfolderId = newSubfolderIds[typeFolderName];
                if (item.pathGD && targetSubfolderId) {
                    const newId = await copyGDriveFile(item.pathGD, targetSubfolderId, item.filename);
                    if (newId) newItem.pathGD = newId;
                }
                newMediaData.push(newItem);
                completedMedia++;
                if (counterElem) counterElem.innerText = `[M] ${completedMedia}/${totalMedia}`;
            })().then(() => {
                pool.delete(promise);
            });
            pool.add(promise);
            mediaResults.push(promise);
        }
        await Promise.all(mediaResults);
        if (newMediaData.length > 0) {
            await createGDriveFile(targetFolderId, 'media.txt', JSON.stringify(newMediaData));
            if (useIndexedDb) {
                for (let m of newMediaData) await bulkPutDB(MEDIA_STORE_NAME, [m], true);
            }
        }
        const now = Date.now();
        localStorage.setItem('lastSyncTimestamp', now);
        lastSyncTimestamp = now;
        if (useIndexedDb) {
            await finalizeDbCreation();
        }
        if (typeof showToast === 'function') showToast(_('migrationSuccess'));
        console.timeEnd("Migration_Parallel");
        return true;
    } catch (e) {
        console.error("Parallel migration error:", e);
        if (typeof showToast === 'function') showToast(_('migrationError'));
        return false;
    } finally {
        window.onbeforeunload = backupOnBeforeUnload;
        if (reloadBtn) {
            reloadBtn.style.pointerEvents = 'auto';
            reloadBtn.innerHTML = originalReloadHtml;
        }
        if (counterElem) counterElem.innerHTML = originalCounterHtml;
    }
}


let cachedFolderIdsByName = {};
async function getFolderIDByName(name) {
    if (isOffline) return null;
    if (name === 'AppDataFolder') return 'appDataFolder';
    if (cachedFolderIdsByName[name]) return cachedFolderIdsByName[name];
    const sendRequest = async (token) => {
        const query = encodeURIComponent(`name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
        return fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1&corpora=allDrives&includeItemsFromAllDrives=true&supportsAllDrives=true`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) return null;
        let tokenData = JSON.parse(storedTokenString);
        let resp = await sendRequest(tokenData.access_token);
        if (resp.status === 401 || resp.status === 403) {
            let refresh = await refreshAuthToken(false);
            if (refresh && refresh.pass) {
                tokenData = refresh.tokenData;
                resp = await sendRequest(tokenData.access_token);
            }
        }
        if (!resp.ok) return null;
        const result = await resp.json();
        const id = result.files?.[0]?.id || null;
        if (id) cachedFolderIdsByName[name] = id;
        return id;
    } catch (e) {
        console.error("Error in getFolderIDByName:", e);
        return null;
    }
}

let _appSettingsFolderIdPromise = null;
async function getAppSettingsFolderId() {
    if (isOffline) return null;
    if (cachedFolderIdsByName['appDataFolder:AppSettings']) return cachedFolderIdsByName['appDataFolder:AppSettings'];
    if (_appSettingsFolderIdPromise) return _appSettingsFolderIdPromise;

    _appSettingsFolderIdPromise = (async () => {
        const findFolder = async (token) => {
            const query = encodeURIComponent("name='AppSettings' and mimeType='application/vnd.google-apps.folder' and trashed=false");
            // Извличаме всички копия, сортирани по последна промяна (най-новия първи)
            return fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&spaces=appDataFolder&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        };
        try {
            let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
            if (!storedTokenString) return null;
            let tokenData = JSON.parse(storedTokenString);
            let resp = await findFolder(tokenData.access_token);
            if (resp.status === 401 || resp.status === 403) {
                let refresh = await refreshAuthToken(false);
                if (refresh && refresh.pass) {
                    tokenData = refresh.tokenData;
                    resp = await findFolder(tokenData.access_token);
                }
            }
            if (!resp.ok) {
                console.warn(`[AppSettings] Search failed with status ${resp.status}`);
                return null;
            }
            const result = await resp.json();
            if (result.files && result.files.length > 0) {
                // Ако има дубликати на папката AppSettings, изтриваме старите и оставяме най-новата
                if (result.files.length > 1) {
                    console.warn("[Sync] Cleanup duplicates for AppSettings folder.");
                    for (let i = 1; i < result.files.length; i++) {
                        deleteGDriveFile(result.files[i].id).catch(err => console.error("Error deleting duplicate folder:", err));
                    }
                }
                const id = result.files[0].id;
                cachedFolderIdsByName['appDataFolder:AppSettings'] = id;
                return id;
            }
            // Търсенето е успешно (resp.ok), но папка AppSettings наистина не съществува в AppDataFolder -> създаваме я
            const newId = await createNewGDriveFolder('AppSettings', 'appDataFolder');
            if (newId) cachedFolderIdsByName['appDataFolder:AppSettings'] = newId;
            return newId;
        } catch (e) {
            console.error("getAppSettingsFolderId error:", e);
            return null;
        }
    })();

    try {
        const result = await _appSettingsFolderIdPromise;
        return result;
    } finally {
        _appSettingsFolderIdPromise = null;
    }
}


/**
 * Създава нова бележка в текущия борд.
 */
async function createNewNote() {
    const updateGDrive = useGoogleDb && !isOffline;
    const useLocalFolderNow = (localStorage.getItem('updateLocalFolder') === 'true') && !isOffline;


    if (boardsData.length === 0) {
        showToast(_('errorNoBoards') || "Моля, създайте първо поне един борд, преди да добавяте бележки.", 3000);
        if (typeof showNewBoardModal === 'function') {
            setTimeout(showNewBoardModal, 100);
        }
        return;
    }

    let boardId = currentBoardFilter;
    // Разширен списък на системни/виртуални бордове, в които не може да се създават бележки директно
    const systemBoards = [
        'all', 'calendar', 'reminders', 'photos', 'videos', 'sounds',
        'other', 'new-updates', 'search', 'favorites', 'archived'
    ];

    // Проверка дали boardId е системен ИЛИ дали не съществува в boardsData (освен ако списъкът с бордове не е празен)
    const isRealBoard = boardsData.some(b => String(b.gdid) === String(boardId));

    if (systemBoards.includes(boardId) || (!isRealBoard && boardsData.length > 0)) {
        showToast(_('cannotCreateInSystemBoard') || "Please select a specific board to create a note.", 3000);
        return;
    }

    // Увеличаваме броячите
    noteId++;
    noteNumord++;
    const now = Date.now();

    // Base note structure
    const newNote = {
        "alarm_type": -1,
        "boardid": boardId,
        "calendarDate": 0,
        "color": 0,
        "date": now,
        "datemod": now,
        "eventId": 0,
        "gdid": "",
        "id": noteId, // Temporary ID, will be finalized on save
        "notetxt": "",
        "numord": noteNumord,
        "pass": false,
        "pinnedAt": 0,
        "sellist": 0,
        "status": 0,
        "text_span": "",
        "timer": 0,
        "timer_type": -1,
        "timer_val": 1,
        "title_span": "",
        "type": 0,
        "version": 243
    };

    try {
        // Open modal in "New Note" mode (deferred creation)
        if (typeof showModal === 'function') {
            showModal({
                raw: newNote.notetxt,
                format: newNote.text_span,
                color: newNote.color,
                boardId: newNote.boardid,
                id: newNote.id,
                gdid: newNote.gdid,
                numord: newNote.numord,
                isNewNote: true // Flag for deferred creation
            });

            // Auto-enter edit mode
            setTimeout(() => {
                const editBtn = document.getElementById('note-edit-btn');
                if (editBtn) editBtn.click();
            }, 100);
        }

        // Force save button to appear immediately because it's a new unsaved note
        // (Handled by enableNoteEditing, but we ensure button visibility logic there)

    } catch (error) {
        console.error("Create note setup failed:", error);
        if (typeof showToast === 'function') showToast("Error initializing note: " + error.message, 5000);
    }
}

let cachedMainFolderId = null;
async function getFolderID() {
    if (isOffline) return null;
    if (cachedMainFolderId) return cachedMainFolderId;
    try {
        const multinotesDataId = await getMultinotesDataFolderID();
        if (!multinotesDataId) return null;
        cachedMainFolderId = multinotesDataId;

        const listFolders = async () => {
            const folderNames = ["Other", "Sound", "Video", "Images"];
            const storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
            if (!storedTokenString) return;
            let tokenData = JSON.parse(storedTokenString);

            await Promise.all(folderNames.map(async (name) => {
                const cachedId = localStorage.getItem(`gdrive_folder_id_${name}`);
                if (cachedId) { folderIds[name] = cachedId; return; }

                const query = encodeURIComponent(`'${multinotesDataId}' in parents and name = '${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
                const spacesParam = (multinotesDataId === 'appDataFolder') ? '&spaces=appDataFolder' : '';
                const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1${spacesParam}`;

                let resp = await fetch(url, { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });

                if (resp.status === 401) {
                    const refresh = await refreshAuthToken(false);
                    if (refresh && refresh.pass) {
                        tokenData = refresh.tokenData;
                        resp = await fetch(url, { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } });
                    }
                }

                if (resp.ok) {
                    const result = await resp.json();
                    const id = result.files?.[0]?.id || "";
                    folderIds[name] = id;
                    if (id) localStorage.setItem(`gdrive_folder_id_${name}`, id);
                }
            }));
        };

        await listFolders();
        return multinotesDataId;
    } catch (e) {
        if (e instanceof TypeError || (e.message && e.message.includes('Failed to fetch'))) {
            console.log('getFolderID: Network unavailable, switching to offline mode.');
            isOffline = true;
            return null;
        }
        console.error("Error in getFolderID:", e);
        throw e;
    }
}

function setCachedMainFolderId(folderName, folderId) {
    localStorage.setItem('gdrive_multinotes_data_id', folderId);
    localStorage.setItem('gdrive_multinotes_data_id_folder', folderName);
}
function clearCachedMainFolderId() {
    localStorage.removeItem('gdrive_multinotes_data_id');
    localStorage.removeItem('gdrive_multinotes_data_id_folder');
}

async function getMultinotesDataFolderID() {
    if (isOffline) return null;
    if (typeof activeFolderName !== 'undefined' && activeFolderName === 'AppDataFolder') return 'appDataFolder';
    const cachedId = localStorage.getItem('gdrive_multinotes_data_id');
    const cachedForFolder = localStorage.getItem('gdrive_multinotes_data_id_folder');
    if (cachedId && cachedForFolder === activeFolderName) return cachedId;

    const sendRequest = async (token) => {
        const query = encodeURIComponent(`name='${activeFolderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1&corpora=allDrives&includeItemsFromAllDrives=true&supportsAllDrives=true`;
        console.log(`[getMultinotesDataFolderID] Requesting: ${url}`);
        return fetch(url, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    };

    const maxAttempts = 3;
    const retryDelays = [1000, 2000, 4000];
    let tokenData = null;
    try {
        const sessionToken = sessionStorage.getItem('google_auth_token');
        const localToken = localStorage.getItem('google_auth_token');
        const storedTokenString = sessionToken || localToken;
        if (!storedTokenString) return null;
        tokenData = JSON.parse(storedTokenString);
        const tokenSource = sessionToken ? 'sessionStorage' : 'localStorage';
        const emailHint = sessionStorage.getItem('google_auth_email_hint') || localStorage.getItem('google_login_hint') || '?';
        console.log(`[getMultinotesDataFolderID] Token from: ${tokenSource}, email hint: ${emailHint}, searching for folder: '${activeFolderName}'`);
    } catch (e) {
        console.error("Error parsing auth token in getMultinotesDataFolderID:", e);
        return null;
    }
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        try {
            let resp = await sendRequest(tokenData.access_token);
            if (resp.status === 401) {
                console.warn("Got 401 in getMultinotesDataFolderID, attempting refresh...");
                const refresh = await refreshAuthToken(false);
                if (refresh && refresh.pass) {
                    tokenData = refresh.tokenData;
                    resp = await sendRequest(tokenData.access_token);
                }
            }
            if (!resp.ok) {
                console.warn(`[getMultinotesDataFolderID] Attempt ${attempt + 1}: HTTP ${resp.status}`);
                try { console.warn('[getMultinotesDataFolderID] Response body:', await resp.text()); } catch (_) { }
            } else {
                const result = await resp.json();
                console.log(`[getMultinotesDataFolderID] Attempt ${attempt + 1} response:`, JSON.stringify(result));
                const id = result.files?.[0]?.id || null;
                if (id) {
                    if (attempt > 0) console.log(`[getMultinotesDataFolderID] Found folder on attempt ${attempt + 1}.`);
                    setCachedMainFolderId(activeFolderName, id);
                    return id;
                }
                console.warn(`[getMultinotesDataFolderID] Attempt ${attempt + 1}: Folder '${activeFolderName}' not found in GDrive response.`);
            }
        } catch (e) {
            if (e instanceof TypeError || (e.message && e.message.includes('Failed to fetch'))) {
                console.log('getMultinotesDataFolderID: Network unavailable, switching to offline mode.');
                isOffline = true;
                return null;
            }
            console.error(`[getMultinotesDataFolderID] Attempt ${attempt + 1} error:`, e);
        }
        if (attempt < maxAttempts - 1) {
            console.log(`[getMultinotesDataFolderID] Retrying in ${retryDelays[attempt]}ms...`);
            await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
        }
    }
    console.warn(`[getMultinotesDataFolderID] All ${maxAttempts} attempts exhausted. Folder not found.`);
    return null;
}

// =================================================================================
// INITIAL FOLDER SETUP FUNCTIONS (for new users)
// =================================================================================

// =================================================================================
// FOLDER CONFIG MANAGEMENT - AppDataFolder as source of truth
// =================================================================================

/**
 * Прочита конфигурацията от AppDataFolder (source of truth)
 * Връща {activeFolderId, folderSetupMode, folderSetupDone}
 */
async function readFolderConfigFromAppData() {
    try {
        const tokenData = getStoredTokenData();
        if (!tokenData || !tokenData.access_token) {
            console.log('[readFolderConfig] No token available yet');
            return null;
        }

        const query = `name='app-config.json' and mimeType='application/json' and trashed=false`;
        const response = await fetch(
            `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(query)}&pageSize=1&fields=id,name`,
            {
                headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
            }
        );

        if (!response.ok) return null;

        const result = await response.json();
        if (!result.files || result.files.length === 0) {
            console.log('[readFolderConfig] No app-config.json found in AppDataFolder');
            return null;
        }

        const fileId = result.files[0].id;
        const fileResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            {
                headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
            }
        );

        if (!fileResponse.ok) return null;

        const config = await fileResponse.json();
        console.log('[readFolderConfig] Config loaded from AppDataFolder:', config);

        // Кешираме в localStorage за производителност
        localStorage.setItem('activeFolderId', config.activeFolderId);
        localStorage.setItem('folderSetupMode', config.folderSetupMode);
        localStorage.setItem('folderSetupDone', config.folderSetupDone ? 'true' : 'false');

        return config;
    } catch (e) {
        console.error('[readFolderConfig] Error reading config:', e);
        return null;
    }
}

/**
 * Записва конфигурацията в AppDataFolder (source of truth)
 */
async function writeFolderConfigToAppData(config) {
    try {
        const tokenData = getStoredTokenData();
        if (!tokenData || !tokenData.access_token) {
            console.log('[writeFolderConfig] No token available');
            return false;
        }

        const configContent = JSON.stringify({
            activeFolderId: config.activeFolderId,
            folderSetupMode: config.folderSetupMode,
            folderSetupDone: config.folderSetupDone,
            timestamp: Date.now()
        });

        const query = `name='app-config.json' and mimeType='application/json' and spaces='appDataFolder' and trashed=false`;
        const searchResponse = await fetch(
            `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${encodeURIComponent(query)}&pageSize=1&fields=id`,
            {
                headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
            }
        );

        const searchResult = await searchResponse.json();
        const existingFileId = searchResult.files?.[0]?.id;

        if (existingFileId) {
            // Обновяваме съществуващия файл
            const updateResponse = await fetch(
                `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
                {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
                    body: configContent
                }
            );
            console.log('[writeFolderConfig] Config updated in AppDataFolder');
            return updateResponse.ok;
        } else {
            // Създаваме нов файл в AppDataFolder
            const metadata = {
                name: 'app-config.json',
                mimeType: 'application/json',
                parents: ['appDataFolder']
            };

            const createResponse = await fetch(
                'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
                {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
                    body: `--boundary\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--boundary\r\nContent-Type: application/json\r\n\r\n${configContent}\r\n--boundary--`
                }
            );

            console.log('[writeFolderConfig] Config created in AppDataFolder');
            return createResponse.ok;
        }
    } catch (e) {
        console.error('[writeFolderConfig] Error writing config:', e);
        return false;
    }
}

/**
 * Проверява дали е необходимо първоначално съзнаване на папка
 * Проверява ПЪРВО AppDataFolder (source of truth), ПОСЛЕ localStorage (кеш)
 */
function needsInitialFolderSetup() {
    if (localStorage.getItem('initial_setup_complete') === 'true') return false;
    if (localStorage.getItem('folderSetupDone') === 'true') return false;
    if (localStorage.getItem('active_folder_name')) return false;
    const gdriveFolderNames = localStorage.getItem('gdrive_folder_names');
    if (gdriveFolderNames && gdriveFolderNames !== '[]') return false;
    const cachedActiveFolderId = localStorage.getItem('activeFolderId');
    const cachedSetupDone = localStorage.getItem('folderSetupDone') === 'true';
    return !cachedActiveFolderId || !cachedSetupDone;
}

/**
 * Определя необходимите scopes на основата на избора на потребителя
 */
function getRequiredScopes(mode) {
    if (mode === 'import_migrate') {
        return SCOPES_BASE + ' ' + SCOPES_READONLY;
    } else if (mode === 'create_empty') {
        return SCOPES_BASE;
    } else if (mode === 'advanced_existing') {
        return SCOPES_BASE + ' ' + SCOPES_FULL;
    }
    return SCOPES_BASE;
}

function getActiveRequiredScopes() {
    const activeFolder = localStorage.getItem('active_folder_name') || (typeof activeFolderName !== 'undefined' ? activeFolderName : '');
    if (activeFolder && activeFolder !== 'CX-Notes' && activeFolder !== 'AppDataFolder') {
        return SCOPES_BASE + ' ' + SCOPES_FULL;
    }
    return SCOPES_BASE;
}

async function requestAdditionalScopes(additionalScopes) {
    if (typeof tokenClient === 'undefined' || typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
        return false;
    }
    const currentScopeString = SCOPES || SCOPES_BASE;
    const combinedScopes = Array.from(new Set((currentScopeString + ' ' + additionalScopes).split(' '))).filter(Boolean).join(' ');
    if (authToken && authToken.scope) {
        const currentScopes = authToken.scope.split(' ');
        const allPresent = additionalScopes.split(' ').every(s => currentScopes.includes(s));
        if (allPresent) return true;
    }
    return new Promise((resolve) => {
        tokenClient.callback = async (resp) => {
            if (resp && resp.access_token) {
                const tokenWithTimestamp = { ...resp, issued_at: Date.now() };
                const rememberMe = localStorage.getItem('rememberMe') === 'true';
                const storage = rememberMe ? localStorage : sessionStorage;
                storage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                authToken = tokenWithTimestamp;
                SCOPES = combinedScopes;
                if (typeof gapi !== 'undefined' && gapi.client) {
                    gapi.client.setToken({ access_token: authToken.access_token });
                }
                resolve(true);
            } else {
                resolve(false);
            }
        };
        tokenClient.error_callback = (err) => {
            console.warn('[requestAdditionalScopes] Error or cancelled:', err);
            resolve(false);
        };
        tokenClient.requestAccessToken({ prompt: 'consent', scope: combinedScopes });
    });
}

/**
 * Показва модал за избор на първоначална папка (ПРЕДИ OAuth)
 */
async function showInitialDataFolderModal() {
    return new Promise((resolve) => {
        const popup = document.getElementById('folderIdPromptPopup');
        if (!popup) {
            console.error('folderIdPromptPopup not found');
            resolve(null);
            return;
        }
        const popupContent = popup.querySelector('.popup-content');
        const messagePara = popup.querySelector('p');
        const okButton = document.getElementById('submitFolderIdBtn');
        const folderIdInput = document.getElementById('folderIdInput');
        folderIdInput.style.display = 'none';
        okButton.style.display = 'none';
        const titleText = _('dataFolderSelectionTitle') || 'Choose your data folder';
        const descText = _('dataFolderSelectionDescription') || 'CX Notes requires a Google Drive folder to store your notes and settings. Please choose an option:';
        const option1Text = _('dataFolderOption1') || 'Migrate to CX-Notes (Recommended)';
        const option1Desc = _('dataFolderOption1Description') || 'Import and migrate your notes from existing multinotes_data folder to CX-Notes.';
        const option2Text = _('dataFolderOption2') || 'Create Empty CX-Notes';
        const option2Desc = _('dataFolderOption2Description') || 'Start fresh with a new CX-Notes folder and a default Main board.';
        const warningText = _('dataFolderMigrationWarning') || '';
        messagePara.innerHTML = `
            <div style="text-align: left; margin: 15px 0;">
                <h2 style="margin-top: 0; font-size: 1.3em; color: #222;">${titleText}</h2>
                <p style="margin: 8px 0 16px 0; font-size: 0.95em; color: #555;">${descText}</p>
                <div style="border: 1px solid #ddd; padding: 14px 16px; margin: 12px 0; border-radius: 8px; cursor: pointer; background-color: #f9f9f9; box-sizing: border-box; width: 100%; transition: all 0.2s ease;" id="initial-modal-option-2" onmouseenter="this.style.backgroundColor='orange'; this.style.borderColor='black'; this.style.transform='translateY(-1px)';" onmouseleave="this.style.backgroundColor='#f9f9f9'; this.style.borderColor='#ddd'; this.style.transform='none';">
                    <strong style="font-size: 1.05em; display: block; margin-bottom: 4px; color: #1a73e8;">⊞ ${option2Text}</strong>
                    <p style="margin: 0; font-size: 0.9em; color: #555; line-height: 1.4;">${option2Desc}</p>
                </div>
                ${warningText ? `<div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 10px; margin: 12px 0; border-radius: 6px; font-size: 0.9em; box-sizing: border-box; width: 100%;">
                    <strong>⚠️ ${_('dataFolderMigrationWarningTitle') || 'Note'}:</strong> ${warningText}
                </div>` : ''}
                <div style="border: 1px solid #ddd; padding: 14px 16px; margin: 12px 0; border-radius: 8px; cursor: pointer; background-color: #f9f9f9; box-sizing: border-box; width: 100%; transition: all 0.2s ease;" id="initial-modal-option-1" onmouseenter="this.style.backgroundColor='orange'; this.style.borderColor='black'; this.style.transform='translateY(-1px)';" onmouseleave="this.style.backgroundColor='#f9f9f9'; this.style.borderColor='#ddd'; this.style.transform='none';">
                    <strong style="font-size: 1.05em; display: block; margin-bottom: 4px; color: #1a73e8;">✓ ${option1Text}</strong>
                    <p style="margin: 0; font-size: 0.9em; color: #555; line-height: 1.4;">${option1Desc}</p>
                </div>
            </div>
        `;
        const cleanup = () => {
            popup.classList.remove('show');
            okButton.style.display = 'inline-block';
            document.getElementById('initial-modal-option-1')?.removeEventListener('click', onOption1);
            document.getElementById('initial-modal-option-2')?.removeEventListener('click', onOption2);
        };
        const onOption1 = () => {
            cleanup();
            localStorage.setItem('folderSetupMode', 'import_migrate');
            folderSetupMode = 'import_migrate';
            resolve('option_1');
        };
        const onOption2 = () => {
            cleanup();
            localStorage.setItem('folderSetupMode', 'create_empty');
            folderSetupMode = 'create_empty';
            resolve('option_2');
        };
        document.getElementById('initial-modal-option-1')?.addEventListener('click', onOption1);
        document.getElementById('initial-modal-option-2')?.addEventListener('click', onOption2);
        popup.classList.add('show');
    });
}


/**
 * Завършва първоначалното съзнаване на папката
 */
async function completeInitialFolderSetup() {
    let appConfig = null;
    try {
        appConfig = await readFolderConfigFromAppData();
    } catch (e) {
        console.warn('[Initial Setup] Error reading AppDataFolder config:', e);
    }
    if (appConfig && appConfig.activeFolderId && appConfig.folderSetupDone) {
        console.log('[Initial Setup] Found existing config in AppDataFolder, restoring...');
        cachedMainFolderId = appConfig.activeFolderId;
        setCachedMainFolderId('CX-Notes', appConfig.activeFolderId);
        activeFolderName = 'CX-Notes';
        localStorage.setItem('active_folder_name', 'CX-Notes');
        localStorage.setItem('activeFolderId', appConfig.activeFolderId);
        localStorage.setItem('folderSetupDone', 'true');
        localStorage.setItem('folderSetupMode', appConfig.folderSetupMode || 'create_empty');
        localStorage.setItem('initial_setup_complete', 'true');
        return;
    }
    let existingCxNotesId = null;
    try {
        existingCxNotesId = await getFolderIDByName('CX-Notes');
    } catch (e) {
        console.warn('[Initial Setup] Error checking for existing CX-Notes folder:', e);
    }
    if (existingCxNotesId) {
        console.log('[Initial Setup] Found existing CX-Notes folder:', existingCxNotesId);
        cachedMainFolderId = existingCxNotesId;
        setCachedMainFolderId('CX-Notes', existingCxNotesId);
        activeFolderName = 'CX-Notes';
        localStorage.setItem('active_folder_name', 'CX-Notes');
        localStorage.setItem('activeFolderId', existingCxNotesId);
        localStorage.setItem('folderSetupDone', 'true');
        localStorage.setItem('folderSetupMode', 'create_empty');
        localStorage.setItem('initial_setup_complete', 'true');
        const folderNames = ['CX-Notes'];
        localStorage.setItem('gdrive_folder_names', JSON.stringify(folderNames));
        const config = { activeFolderId: existingCxNotesId, folderSetupMode: 'create_empty', folderSetupDone: true };
        await writeFolderConfigToAppData(config);
        return;
    }
    const choice = await showInitialDataFolderModal();
    const mode = choice === 'option_1' ? 'import_migrate' : 'create_empty';
    if (mode === 'import_migrate') {
        if (typeof tokenClient !== 'undefined') {
            await new Promise((resolve) => {
                tokenClient.callback = async (resp) => {
                    if (resp && resp.access_token) {
                        const tokenWithTimestamp = { ...resp, issued_at: Date.now() };
                        const rememberMe = document.getElementById('rememberMe')?.checked;
                        const storage = rememberMe ? localStorage : sessionStorage;
                        storage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                        authToken = tokenWithTimestamp;
                        resolve(tokenWithTimestamp);
                    } else {
                        resolve(null);
                    }
                };
                tokenClient.requestAccessToken({ prompt: 'consent', scope: SCOPES_BASE + ' ' + SCOPES_READONLY });
            });
        }
        if (loaderText) loaderText.textContent = _('migratingData') || 'Copying data from multinotes_data to CX-Notes...';
        let multinotesId = null;
        try {
            multinotesId = await getFolderIDByName('multinotes_data');
        } catch (e) {
            console.warn('[Initial Setup] Error searching for multinotes_data:', e);
        }
        let targetFolderId = await getFolderIDByName('CX-Notes');
        if (!targetFolderId) {
            targetFolderId = await createNewGDriveFolder('CX-Notes');
        }
        let migrationDone = false;
        if (multinotesId && targetFolderId) {
            try {
                const fetchResult = await fetchAllData(multinotesId, false);
                if (fetchResult && !fetchResult.error) {
                    const migrationSuccess = await migrateDataToNewFolder(targetFolderId);
                    if (migrationSuccess) {
                        migrationDone = true;
                        console.log('[Initial Setup] Data successfully migrated from multinotes_data to CX-Notes');
                        if (typeof showToast === 'function') showToast(_('migrationSuccess') || 'Data copied successfully to CX-Notes', 5000);
                    }
                }
            } catch (e) {
                console.error('[Initial Setup] Error during data migration:', e);
            }
        }
        if (!migrationDone && targetFolderId) {
            try {
                const existingMainBoards = await findGDFileByName(targetFolderId, 'board.txt');
                if (!existingMainBoards || existingMainBoards.length === 0) {
                    const now = Date.now();
                    boardIdCounter = 1;
                    localStorage.setItem('boardIdCounter', '1');
                    const boardToSave = { "backcolor": 0, "backnum": 0, "backpath": "", "color": "#4CAF50", "colorfont": "#000", "datemod": now, "gdid": "", "id": 1, "numord": 1, "status": 0, "title": "Main" };
                    const gdid = await createGDriveFile(targetFolderId, 'board.txt', JSON.stringify(boardToSave));
                    if (gdid) {
                        boardToSave.gdid = gdid;
                        await updateGDriveFile(gdid, JSON.stringify(boardToSave));
                        localStorage.setItem('startBoard_CX-Notes', gdid);
                    }
                }
            } catch (e) {
                console.warn('[Initial Setup] Error creating fallback Main board:', e);
            }
        }
        if (targetFolderId) {
            cachedMainFolderId = targetFolderId;
            setCachedMainFolderId('CX-Notes', targetFolderId);
            if (multinotesId) setCachedMainFolderId('multinotes_data', multinotesId);
            activeFolderName = 'CX-Notes';
            localStorage.setItem('active_folder_name', 'CX-Notes');
            const folderNames = ['CX-Notes'];
            if (multinotesId) folderNames.push('multinotes_data');
            localStorage.setItem('gdrive_folder_names', JSON.stringify(folderNames));
            const config = {
                activeFolderId: targetFolderId,
                folderSetupMode: mode,
                folderSetupDone: true
            };
            localStorage.setItem('activeFolderId', targetFolderId);
            localStorage.setItem('folderSetupDone', 'true');
            localStorage.setItem('folderSetupMode', mode);
            localStorage.setItem('initial_setup_complete', 'true');
            localStorage.removeItem('pendingImportSetup');
            await writeFolderConfigToAppData(config);
            try {
                await syncGlobalFoldersJson();
                await saveSettingsToGDrive(true);
            } catch (e) {
                console.warn('[Initial Setup] Error saving settings/folders:', e);
            }
        }
        return;
    } else {
        if (loaderText) loaderText.textContent = _('creatingFolder') || 'Creating CX-Notes folder...';
        let newFolderId = await getFolderIDByName('CX-Notes');
        if (!newFolderId) {
            newFolderId = await createNewGDriveFolder('CX-Notes');
        }
        if (newFolderId) {
            cachedMainFolderId = newFolderId;
            setCachedMainFolderId('CX-Notes', newFolderId);
            activeFolderName = 'CX-Notes';
            localStorage.setItem('active_folder_name', 'CX-Notes');
            try {
                const existingMainBoards = await findGDFileByName(newFolderId, 'board.txt');
                if (!existingMainBoards || existingMainBoards.length === 0) {
                    const now = Date.now();
                    boardIdCounter = 1;
                    localStorage.setItem('boardIdCounter', '1');
                    const boardToSave = { "backcolor": 0, "backnum": 0, "backpath": "", "color": "#4CAF50", "colorfont": "#000", "datemod": now, "gdid": "", "id": 1, "numord": 1, "status": 0, "title": "Main" };
                    const gdid = await createGDriveFile(newFolderId, 'board.txt', JSON.stringify(boardToSave));
                    if (gdid) {
                        boardToSave.gdid = gdid;
                        await updateGDriveFile(gdid, JSON.stringify(boardToSave));
                        localStorage.setItem('startBoard_CX-Notes', gdid);
                    }
                }
            } catch (e) {
                console.warn('[Initial Setup] Error creating Main board:', e);
            }
            const folderNames = ['CX-Notes'];
            localStorage.setItem('gdrive_folder_names', JSON.stringify(folderNames));
            const config = {
                activeFolderId: newFolderId,
                folderSetupMode: mode,
                folderSetupDone: true
            };
            localStorage.setItem('activeFolderId', newFolderId);
            localStorage.setItem('folderSetupDone', 'true');
            localStorage.setItem('folderSetupMode', mode);
            localStorage.setItem('initial_setup_complete', 'true');
            await writeFolderConfigToAppData(config);
            try {
                await syncGlobalFoldersJson();
                await saveSettingsToGDrive(true);
            } catch (e) {
                console.warn('[Initial Setup] Error saving settings/folders:', e);
            }
            console.log(`[Initial Setup] Successfully configured CX-Notes folder: ${newFolderId}`);
        } else {
            console.error('[Initial Setup] Failed to create CX-Notes folder');
        }
        return;
    }
}

// =================================================================================
async function authCallback(tokenResponse) {
    if (tokenResponse && tokenResponse.access_token) {
        const tokenWithTimestamp = { ...tokenResponse, issued_at: Date.now() };
        const rememberMe = document.getElementById('rememberMe')?.checked;
        const storage = rememberMe ? localStorage : sessionStorage;
        storage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
        try {
            console.log('Fetching user info...');
            const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                headers: { 'Authorization': `Bearer ${tokenResponse.access_token}` }
            });
            console.log('User info response status:', userInfoResponse.status);
            if (userInfoResponse.ok) {
                const userInfo = await userInfoResponse.json();
                console.log('User info received:', userInfo.email);
                const previousEmail = localStorage.getItem('google_login_hint');
                if (previousEmail && previousEmail !== userInfo.email) {
                    await handleAccountSwitchReset(previousEmail, userInfo.email);
                }
                sessionStorage.setItem('google_auth_email_hint', userInfo.email);
                localStorage.setItem('google_login_hint', userInfo.email);
            } else {
                console.warn('User info response not OK:', await userInfoResponse.text());
            }
        } catch (error) {
            console.log('Failed to fetch user info:', error);
        }
        sessionStorage.removeItem('logout_flag');
        isSyncSuspended = false;
        scheduleProactiveTokenRefresh();
        document.getElementById('login-page').hidden = true;
        document.getElementById('login-page').style.display = 'none';
        startApp(true);
    } else {
        console.log('Failed to get access token');
        alert(_('authFailed'));
    }
}

async function gisLoaded() {
    await setLanguage(currentLang);
    const sessionToken = sessionStorage.getItem('google_auth_token');
    const localToken = localStorage.getItem('google_auth_token');

    // =========================================================================
    // STAGE 1: Determine initial state from localStorage ONLY (no token needed)
    // =========================================================================
    // This is the FIRST determination - no AppDataFolder read yet
    // localStorage is the working cache layer
    let needsSetup = needsInitialFolderSetup();

    console.log(`[gisLoaded] Stage 1 - localStorage check: needsSetup=${needsSetup}, hasToken=${!!sessionToken || !!localToken}`);

    // =========================================================================
    // STAGE 2: Load stored config if not needing setup
    // =========================================================================
    if (!needsSetup) {
        const storedMode = localStorage.getItem('folderSetupMode');
        if (storedMode) {
            const requiredScopes = getRequiredScopes(storedMode);
            console.log(`[gisLoaded] Stage 2 - Using stored mode "${storedMode}", scopes: ${requiredScopes}`);
            Object.defineProperty(window, 'SCOPES', {
                value: requiredScopes,
                writable: false,
                configurable: true
            });
        }
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (tokenResponse) => {
            await authCallback(tokenResponse);
        },
        error_callback: (error) => {
            console.log("GSI Error:", error);
            alert(_('authFailed') + `\n\nError: ${error.type}`);
        }
    });
    const loginBox = document.querySelector('.login-box');
    const hasToken = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
    const isLogout = sessionStorage.getItem('logout_flag') === 'true';

    if (isLogout) {
        if (loginBox) loginBox.style.visibility = 'visible';
        const authBtn = document.getElementById('authorize_button');
        if (authBtn) authBtn.disabled = false;
    } else {
        // Ако няма токен и е необходимо първоначално съзнаване, показваме модал ПО-РАНО
        if (!hasToken && needsSetup) {
            if (loginBox) loginBox.style.visibility = 'visible';
            const authBtn = document.getElementById('authorize_button');
            if (authBtn) authBtn.disabled = false;
            // Модалът ще се покаже при клик на бутона (в handleAuthClick)
        } else {
            // Keep login box hidden during background auth attempt to prevent flashing buttons
            if (loginBox && hasToken) loginBox.style.visibility = 'hidden';
            await startApp();
            if (!hasToken && loginBox) {
                loginBox.style.visibility = 'visible';
                const authBtn = document.getElementById('authorize_button');
                if (authBtn) authBtn.disabled = false;
            }
        }
    }
}

// --- КОРЕКЦИЯ: Зареждаме състоянието на "Запомни ме" при стартиране ---
document.addEventListener('DOMContentLoaded', async () => {
    const rememberMeCheckbox = document.getElementById('rememberMe');
    if (rememberMeCheckbox) {
        rememberMeCheckbox.checked = localStorage.getItem('rememberMe') === 'true';
    }
    if (localStorage.getItem('hideAssistant') === 'true') {
        const fabButton = document.getElementById('kb-fab');
        if (fabButton) {
            fabButton.style.display = 'none';
        }
    }
    const emptyTrashFab = document.getElementById('empty-trash-fab');
    if (emptyTrashFab) {
        emptyTrashFab.innerHTML = emptyTrashIconSvg;
        emptyTrashFab.addEventListener('click', emptyTrash);
    }
    initHeaderFullscreen();
});

// Добави този код в началото или края на main.js
// Динамично зареждане на Google Identity Services скрипта с retry логика
function loadGoogleIdentityServices(retries = 3) {
    if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
        return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => { gisLoaded(); };
    script.onerror = () => {
        if (retries > 0) {
            setTimeout(() => loadGoogleIdentityServices(retries - 1), 2000);
        }
    };
    document.head.appendChild(script);
}

// Стартирай зареждането в зависимост от състоянието
(async () => {
    await setLanguage(currentLang);
    dbExists = await checkDbExists(NOTES_DB_NAME);
    const hasToken = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
    await goOffline();
    if (isOffline) {
        startApp();
    } else if (hasToken) {
        loadGoogleIdentityServices();
        startApp();
    } else {
        initLoginPage();
        loadGoogleIdentityServices();
    }
})();

// ---------- Calendar ----------------------------
function renderCalendarView() {
    document.querySelector('header').style.display = 'none';
    notesContainer.style.display = 'none';
    scrollTopBtn.style.display = 'none';
    const addNoteFab = document.getElementById('add-note-fab');
    if (addNoteFab) addNoteFab.style.display = 'none';
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
    const monthName = currentCalendarDate.toLocaleString(currentLang, { month: 'long' });
    const titleText = `${monthName} ${year}`;
    // Sticky Header Container
    const stickyHeaderContainer = document.createElement('div');
    stickyHeaderContainer.style.position = 'sticky';
    stickyHeaderContainer.style.top = '0';
    stickyHeaderContainer.style.zIndex = '100';
    stickyHeaderContainer.style.backgroundColor = '#fdf6e3'; // Match calendar background
    // Header
    const calendarHeader = document.createElement('div');
    calendarHeader.className = 'calendar-header';
    calendarHeader.innerHTML = `
            <div class="calendar-nav-controls">
                <button id="prev-month-btn" title="${_('prevMonthTooltip')}">&laquo;</button>
                <button id="today-month-btn">${calendarTodaySvg}</button>
                <button id="next-month-btn" title="${_('nextMonthTooltip')}">&raquo;</button><button id="weekly-view-btn" title="${_('weeklyViewTooltip')}">${calendarIconSvg}</button>
                <button id="close-month-calendar-btn" class="close-calendar-btn">
                    <span class="close-symbol">&times;</span>
                    <img src="Refresh.png" class="close-loading-icon" style="display: none;">
                </button>
            </div>
            <h2 style="cursor: default;">${titleText}</h2>
        `;
    stickyHeaderContainer.appendChild(calendarHeader);
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
    stickyHeaderContainer.appendChild(daysHeader);
    calendarContainer.appendChild(stickyHeaderContainer);
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
        // Проверяваме дали е уикенд (събота или неделя)
        const currentDate = new Date(year, month, day);
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) { // 0 = Неделя, 6 = Събота
            dateNum.classList.add('weekend-date');
        }
        // Check if the cell being rendered is today's date
        if (day === todayDate && month === todayMonth && year === todayYear) {
            dateNum.classList.add('today-date');
            cell.classList.add('today-cell');
        }
        cell.dataset.day = day;
        cell.dataset.month = month;
        cell.dataset.year = year;
        cell.style.cursor = 'pointer';
        cell.appendChild(dateNum);
        const notesForDayContainer = document.createElement('div');
        notesForDayContainer.className = 'calendar-notes-container';
        // Find and render notes for this day 
        const dayDate = new Date(year, month, day);
        allNotesData.forEach(noteData => {
            // Прескачаме скрити бележки (status === 1)
            if (noteData.calendarDate && noteData.status !== 1) {
                const noteDate = new Date(noteData.calendarDate);
                if (noteDate.getFullYear() === dayDate.getFullYear() &&
                    noteDate.getMonth() === dayDate.getMonth() &&
                    noteDate.getDate() === dayDate.getDate()) {
                    const miniNote = document.createElement('div');
                    miniNote.className = 'calendar-mini-note';
                    const noteContent = noteData.notetxt;
                    const isHidden = noteData.pass === true;
                    const isType1 = noteData.type === 1;
                    const hasPipe = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(noteContent) !== -1 : noteContent.includes('|');
                    if ((isHidden || isType1) && hasPipe) {
                        const pipeIdx = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(noteContent) : noteContent.indexOf('|');
                        contentToShow = noteContent.substring(0, pipeIdx).trim();
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
                    if (noteData.color !== null && noteData.color !== undefined) {
                        miniNote.style.backgroundColor = noteColorMap[noteData.color] || noteColorMap[0];
                    }
                    miniNote.addEventListener('click', (e) => {
                        e.stopPropagation();
                        // Подаваме и ID-тата, за да работят прикачните файлове.
                        // --- КОРЕКЦИЯ: Премахваме подаването на originalNote, за да уеднаквим поведението със седмичния календар ---
                        // Added forceShowBoardName: true to ensure board name is visible
                        showModal({ raw: noteData.notetxt, format: noteData.text_span, color: miniNote.style.backgroundColor, id: noteData.id, gdid: noteData.gdid, boardId: noteData.boardid, forceShowBoardName: true });
                    });
                    notesForDayContainer.appendChild(miniNote);
                }
            }
        });
        cell.appendChild(notesForDayContainer);
        calendarGrid.appendChild(cell);
    }
    calendarGrid.addEventListener('click', async (e) => {
        const cell = e.target.closest('.calendar-cell');
        if (!cell || e.target.closest('.calendar-mini-note')) return;
        const d = parseInt(cell.dataset.day);
        const m = parseInt(cell.dataset.month);
        const y = parseInt(cell.dataset.year);
        const selectedDate = new Date(y, m, d);
        if (noteToAssignDate) {
            const targetNote = { ...noteToAssignDate };
            // Start sync (updates memory immediately)
            const syncPromise = updateNoteCalendarDate(targetNote, selectedDate);
            // Close calendar immediately to return to note modal
            document.getElementById('close-month-calendar-btn').click();
            // Background handler for the spinner in the re-opened modal
            (async () => {
                await new Promise(r => setTimeout(r, 120)); // Wait for modal to re-open
                const calendarBtn = document.getElementById('note-calendar-btn');
                if (calendarBtn) {
                    calendarBtn.style.pointerEvents = 'none';
                    calendarBtn.innerHTML = `<img src="Refresh.png" style="width:22px; height:22px; animation: spin 0.8s linear infinite;">`;
                    await syncPromise;
                    const finalCalendarBtn = document.getElementById('note-calendar-btn');
                    if (finalCalendarBtn) {
                        finalCalendarBtn.style.pointerEvents = 'auto';
                        finalCalendarBtn.innerHTML = noCalendarIconSvg;
                        finalCalendarBtn.title = _('removeFromCalendar') || "Remove from calendar";
                    }
                }
            })();
        } else {
            calendarContainer.style.display = 'none';
            renderWeeklyCalendarView(selectedDate);
        }
    });
    calendarContainer.appendChild(calendarGrid);
    // Make mini-notes square by setting their height equal to their calculated width
    // Use setTimeout to ensure the browser has rendered the elements before we measure them.
    setTimeout(() => {
        document.querySelectorAll('.calendar-mini-note').forEach(miniNote => {
            const width = miniNote.getBoundingClientRect().width;
            if (width > 0) miniNote.style.height = `${width}px`;
        });
        // --- AUTO ZOOM LOGIC ---
        // Нулираме zoom-а преди измерване
        calendarContainer.style.transform = 'none';
        calendarContainer.style.transformOrigin = 'top center';
        calendarContainer.style.width = ''; // Премахваме изрично зададената ширина
        calendarContainer.style.height = ''; // Премахваме изрично зададената височина
        calendarContainer.style.marginBottom = ''; // Нулираме марджина
        const windowHeight = window.innerHeight;
        // Използваме getBoundingClientRect за по-точни размери, включително padding/margin ако има
        const rect = calendarContainer.getBoundingClientRect();
        const contentHeight = rect.height;
        const contentWidth = rect.width;
        // Оставяме малък буфер (напр. 20px)
        const availableHeight = windowHeight - 20;
        const availableWidth = window.innerWidth;
        // Изчисляваме мащаба
        let scaleH = availableHeight / contentHeight;
        let scaleW = availableWidth / contentWidth;
        // Избираме по-малкия мащаб, за да се побере всичко
        let scale = Math.min(scaleH, scaleW, 1);
        // Прилагаме мащаба само ако е нужно намаляване
        if (scale < 0.99) {
            calendarContainer.style.transform = `scale(${scale})`;
            // КОРЕКЦИЯ 2: Задаваме изрично височината на контейнера да е равна на новия визуален размер.
            // Тъй като съдържанието е по-голямо, то ще прелее, но transform ще го свие обратно в тези граници.
            calendarContainer.style.height = `${contentHeight * scale}px`;
            // Уверяваме се, че няма да се отреже нищо важно
            calendarContainer.style.overflow = 'visible';
            // ОБРАТНО МАЩАБИРАНЕ: Увеличаваме font-size вместо transform, за да не се нарушава layout-а
            const counterScale = 1 / scale;
            // Увеличаваме font-size на бутоните в хедъра
            const calendarHeader = calendarContainer.querySelector('.calendar-header');
            if (calendarHeader) {
                const headerButtons = calendarHeader.querySelectorAll('button');
                headerButtons.forEach(btn => {
                    const currentFontSize = parseFloat(window.getComputedStyle(btn).fontSize);
                    btn.style.fontSize = `${currentFontSize * counterScale}px`;
                    // Увеличаваме и размерите на бутона, за да се побират символите
                    const currentWidth = parseFloat(window.getComputedStyle(btn).width);
                    const currentHeight = parseFloat(window.getComputedStyle(btn).height);
                    btn.style.width = `${currentWidth * counterScale}px`;
                    btn.style.height = `${currentHeight * counterScale}px`;
                    // Гарантираме центриране на съдържанието
                    btn.style.display = 'flex';
                    btn.style.alignItems = 'center';
                    btn.style.justifyContent = 'center';
                    // Корекция за символите « и » - леко ги вдигаме нагоре
                    if (btn.id === 'prev-month-btn' || btn.id === 'next-month-btn') {
                        btn.style.paddingTop = '0';
                        btn.style.paddingBottom = `${4 * counterScale}px`;
                    }
                    // Специално мащабиране за бутона за седмичен изглед
                    if (btn.id === 'weekly-view-btn') {
                        const svgIcon = btn.querySelector('svg');
                        if (svgIcon) {
                            svgIcon.style.transform = `scale(${counterScale})`;
                            svgIcon.style.transformOrigin = 'center';
                        }
                    }
                });
                const headerTitle = calendarHeader.querySelector('h2');
                if (headerTitle) {
                    const currentFontSize = parseFloat(window.getComputedStyle(headerTitle).fontSize);
                    headerTitle.style.fontSize = `${currentFontSize * counterScale}px`;
                }
            }
            // Увеличаваме font-size на имената на дните
            const dayNames = calendarContainer.querySelectorAll('.calendar-day-name');
            dayNames.forEach(dayName => {
                const currentFontSize = parseFloat(window.getComputedStyle(dayName).fontSize);
                dayName.style.fontSize = `${currentFontSize * counterScale}px`;
            });
            // Увеличаваме font-size на номерата на датите
            const dateNumbers = calendarContainer.querySelectorAll('.calendar-date-number');
            dateNumbers.forEach(dateNum => {
                const currentFontSize = parseFloat(window.getComputedStyle(dateNum).fontSize);
                dateNum.style.fontSize = `${currentFontSize * counterScale}px`;
            });
        }
        // Ако не сме мащабирали (или малко), скролираме до днес
        if (scale >= 0.99) {
            const todayElement = document.querySelector('.today-date');
            if (todayElement) {
                todayElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, 0);
    // Event Listeners
    document.getElementById('prev-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderCalendarView();
    });
    // Добавяме event listener за новия бутон за седмичен изглед
    document.getElementById('weekly-view-btn').addEventListener('click', () => {
        calendarContainer.style.display = 'none'; // Затваряме месечния изглед
        renderWeeklyCalendarView(new Date()); // Отваряме седмичния изглед за текущата седмица
    });
    // Добавяме event listener за бутона "Днес" ---
    document.getElementById('today-month-btn').addEventListener('click', () => {
        currentCalendarDate = new Date(); // Връщаме се към днешна дата
        renderCalendarView(); // Прерисуваме календара
    });
    document.getElementById('next-month-btn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderCalendarView();
    });
    document.getElementById('close-month-calendar-btn').addEventListener('click', (e) => {
        const closeBtn = e.currentTarget;
        // --- Анимация в бутона за затваряне ---
        const closeSymbol = closeBtn.querySelector('.close-symbol');
        const loadingIcon = closeBtn.querySelector('.close-loading-icon');
        if (closeSymbol && loadingIcon) {
            closeSymbol.style.display = 'none';
            loadingIcon.style.display = 'inline';
            loadingIcon.classList.add('button-loading');
        }
        setTimeout(() => {
            requestAnimationFrame(() => {
                // --- Програмен клик на активния борд ---
                let boardToClick = currentBoardFilter;
                if (boardToClick === 'calendar') {
                    boardToClick = localStorage.getItem('startBoard') || 'all';
                }
                // Търсим бутона в хедъра
                let activeBoardBtn = document.querySelector(`.board-menu-container .board-filter-link[data-boardid="${boardToClick}"]`);
                // Ако няма активен борд, опитваме да активираме първия от масива с бордовете
                if (!activeBoardBtn && boardsData && boardsData.length > 0) {
                    const firstBoardGdid = boardsData[0].gdid;
                    activeBoardBtn = document.querySelector(`.board-menu-container .board-filter-link[data-boardid="${firstBoardGdid}"]`);
                }
                if (activeBoardBtn) {
                    activeBoardBtn.click();
                } else {
                    // Fallback - показваме основния изглед без активен борд
                    calendarContainer.style.display = 'none';
                    document.querySelector('header').style.display = 'flex';
                    notesContainer.style.display = 'flex';
                    scrollTopBtn.style.display = 'block';
                    window.dispatchEvent(new Event('scroll'));
                }

                // --- Re-open note modal if we were assigning a date ---
                if (noteToAssignDate) {
                    const noteObj = allNotesData.find(n => (n.gdid && String(n.gdid) === String(noteToAssignDate.gdid)) || (n.id && String(n.id) === String(noteToAssignDate.id)));
                    noteToAssignDate = null;
                    if (noteObj) {
                        const noteColorStr = (typeof noteObj.color === 'number' && noteObj.color >= 0 && noteObj.color < noteColorMap.length) ? noteColorMap[noteObj.color] : (typeof noteObj.color === 'string' ? noteObj.color : noteColorMap[0]);
                        showModal({
                            raw: noteObj.notetxt,
                            format: noteObj.text_span,
                            titleFormat: noteObj.title_span,
                            color: noteColorStr,
                            boardId: noteObj.boardid,
                            id: noteObj.id,
                            gdid: noteObj.gdid
                        }, document.querySelector(`.note[data-g="${noteObj.gdid}"]`) || document.querySelector(`.note[data-i="${noteObj.id}"]`));
                    }
                }
                // Спираме анимацията (ако все още е видима)
                if (closeSymbol && loadingIcon) {
                    loadingIcon.classList.remove('button-loading');
                    loadingIcon.style.display = 'none';
                    closeSymbol.style.display = 'inline';
                }
            });
        }, 10);
    });
}

function renderWeeklyCalendarView(dateForWeek) {
    document.querySelector('header').style.display = 'none';
    notesContainer.style.display = 'none';
    scrollTopBtn.style.display = 'none';
    let startDate;
    if (!dateForWeek) {
        // Ако не е подадена дата, използваме днешната, за да намерим текущата седмица
        dateForWeek = new Date();
    } else {
        currentWeeklyViewDate = dateForWeek; // Обновяваме глобалното състояние
    }
    const tempDate = new Date(dateForWeek);
    const day = tempDate.getDay();
    const diff = tempDate.getDate() - day + (day === 0 ? -6 : 1);
    startDate = new Date(tempDate.setDate(diff));
    startDate.setHours(0, 0, 0, 0);
    let weeklyContainer = document.getElementById('weekly-calendar-container');
    if (!weeklyContainer) {
        weeklyContainer = document.createElement('div');
        weeklyContainer.id = 'weekly-calendar-container';
        document.querySelector('main').appendChild(weeklyContainer);
    }
    weeklyContainer.style.display = 'flex'; // Променяме на flex за по-добър контрол
    weeklyContainer.style.flexDirection = 'column';
    weeklyContainer.innerHTML = ''; // Изчистваме предишното съдържание
    // Генериране на динамично заглавие с месеца(ите) ---
    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 6); // Крайната дата на 7-дневния период
    const startMonthName = startDate.toLocaleString(currentLang, { month: 'long' });
    const endMonthName = endDate.toLocaleString(currentLang, { month: 'long' });
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();
    let titleText;
    if (startMonthName === endMonthName) {
        titleText = `${startMonthName} ${startYear}`;
    } else if (startYear === endYear) {
        titleText = `${startMonthName} - ${endMonthName} ${startYear}`;
    } else {
        titleText = `${startMonthName} ${startYear} - ${endMonthName} ${endYear}`;
    }
    // Създаваме хедър с бутон за затваряне
    const header = document.createElement('div');
    header.className = 'calendar-header'; // Използваме същия стил като другия календар
    header.style.position = 'sticky';
    header.style.top = '0';
    header.style.zIndex = '100';
    header.style.backgroundColor = '#fdf6e3'; // Match background
    header.innerHTML = `
        <div class="calendar-nav-controls">
        <button id="prev-week-btn">&laquo;</button>
        <button id="today-week-btn">${calendarTodaySvg}</button>
        <button id="next-week-btn">&raquo;</button>
        <button id="month-view-btn" title="${_('monthlyViewTooltip')}" style="display: flex; align-items: center; justify-content: center;">${calendarIconSvg}</button>
        <button id="close-week-calendar-btn" class="close-calendar-btn"><span class="close-symbol">&times;</span>
        <img src="Refresh.png" class="close-loading-icon" style="display: none;"></button>
        </div><h2 style="cursor: default;">${titleText}</h2>`;
    weeklyContainer.appendChild(header);
    // Добавяме клик събитие за преход към месечен изглед ---
    const goToMonthView = () => {
        weeklyContainer.style.display = 'none'; // Затваряме седмичния изглед
        currentCalendarDate = new Date(startDate); // Задаваме месеца, който да се покаже
        renderCalendarView(); // Отваряме месечния изглед
    };

    // Добавяме същото събитие и към новия бутон
    const monthViewBtn = header.querySelector('#month-view-btn');
    monthViewBtn.addEventListener('click', goToMonthView);
    header.querySelector('.close-calendar-btn').addEventListener('click', (e) => {
        // --- Анимация в бутона за затваряне ---
        const closeBtn = e.currentTarget;
        const closeSymbol = closeBtn.querySelector('.close-symbol');
        const loadingIcon = closeBtn.querySelector('.close-loading-icon');
        if (closeSymbol && loadingIcon) {
            closeSymbol.style.display = 'none';
            loadingIcon.style.display = 'inline';
            loadingIcon.classList.add('button-loading');
        }
        setTimeout(() => {
            requestAnimationFrame(() => {
                // --- КОРЕКЦИЯ: Програмен клик на активния борд ---
                let boardToClick = currentBoardFilter;
                if (boardToClick === 'calendar') {
                    boardToClick = localStorage.getItem('startBoard') || 'all';
                }
                let activeBoardBtn = document.querySelector(`.board-menu-container .board-filter-link[data-boardid="${boardToClick}"]`);
                // Ако няма активен борд, опитваме да активираме първия от масива с бордовете
                if (!activeBoardBtn && boardsData && boardsData.length > 0) {
                    const firstBoardGdid = boardsData[0].gdid;
                    activeBoardBtn = document.querySelector(`.board-menu-container .board-filter-link[data-boardid="${firstBoardGdid}"]`);
                }
                if (activeBoardBtn) {
                    // ВАЖНО: Скриваме седмичния календар ПРЕДИ програмния клик
                    weeklyContainer.style.display = 'none';
                    activeBoardBtn.click();
                } else {
                    // Fallback - показваме основния изглед без активен борд
                    weeklyContainer.style.display = 'none';
                    document.querySelector('header').style.display = 'flex';
                    notesContainer.style.display = 'flex';
                    scrollTopBtn.style.display = 'block';
                    window.dispatchEvent(new Event('scroll'));
                }
                // Спираме анимацията (ако все още е видима, въпреки че click() ще преначертае UI)
                if (closeSymbol && loadingIcon) {
                    loadingIcon.classList.remove('button-loading');
                    loadingIcon.style.display = 'none';
                    closeSymbol.style.display = 'inline';
                }
            });
        }, 20);
    });

    const navigateWeek = (dayOffset) => {
        const newStartDate = new Date(startDate); // Използваме началната дата на текущия изглед
        newStartDate.setDate(newStartDate.getDate() + dayOffset);
        renderWeeklyCalendarView(newStartDate);
    };

    header.querySelector('#prev-week-btn').addEventListener('click', () => {
        navigateWeek(-7); // Връщаме 7 дни назад
    });
    header.querySelector('#next-week-btn').addEventListener('click', () => {
        navigateWeek(7); // Отиваме 7 дни напред
    });

    header.querySelector('#today-week-btn').addEventListener('click', () => {
        renderWeeklyCalendarView(); // Показваме текущата седмица от понеделник
    });

    let weeklySwipeStartX = 0;
    let weeklySwipeStartY = 0;
    let weeklySwipeTracking = false;
    weeklyContainer.ontouchstart = (e) => {
        if (e.touches.length !== 1 || e.target.closest('.weekly-notes-container')) {
            weeklySwipeTracking = false;
            return;
        }
        weeklySwipeStartX = e.touches[0].clientX;
        weeklySwipeStartY = e.touches[0].clientY;
        weeklySwipeTracking = true;
    };
    weeklyContainer.ontouchend = (e) => {
        if (!weeklySwipeTracking || e.changedTouches.length !== 1) return;
        weeklySwipeTracking = false;
        const deltaX = e.changedTouches[0].clientX - weeklySwipeStartX;
        const deltaY = e.changedTouches[0].clientY - weeklySwipeStartY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        if (absX < 60 || absX < absY * 1.3) return;
        navigateWeek(deltaX < 0 ? 7 : -7);
    };
    // Групираме бележките по дата
    const notesByDate = new Map();
    allNotesData.forEach(noteData => {
        // Прескачаме скрити бележки (status === 1)
        if (noteData.calendarDate && noteData.status !== 1) {
            // --- КОРЕКЦИЯ: Преобразуваме датата към UTC, за да избегнем проблеми с часовите зони ---
            const noteDate = new Date(noteData.calendarDate);
            // Създаваме нова дата, използвайки UTC компонентите на оригиналната дата.
            // Това "премахва" часовата зона и третира датата като чиста календарна дата.
            const utcDate = new Date(Date.UTC(noteDate.getFullYear(), noteDate.getMonth(), noteDate.getDate()));
            const dateStr = utcDate.toISOString().split('T')[0];
            if (!notesByDate.has(dateStr)) {
                notesByDate.set(dateStr, []);
            }
            notesByDate.get(dateStr).push(noteData.gdid);
        }
    });

    const listContainer = document.createElement('div');
    listContainer.className = 'weekly-list-container';
    weeklyContainer.appendChild(listContainer);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const daysToRender = 7; // Показваме 7 дни наведнъж
    let todayRowElement = null;
    let weekHasNotes = false; // Флаг, който проверява дали в седмицата има бележки
    // Първо обхождаме, за да проверим дали има поне един ден с бележки
    for (let i = 0; i < daysToRender; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        const dateStr = date.toISOString().split('T')[0];
        if (notesByDate.has(dateStr)) {
            weekHasNotes = true;
            break;
        }
    }
    for (let i = 0; i < daysToRender; i++) {
        const date = new Date(startDate);
        date.setDate(startDate.getDate() + i);
        // --- КОРЕКЦИЯ: Прилагаме същата UTC логика и тук, за да има пълно съответствие ---
        const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dateStr = utcDate.toISOString().split('T')[0];
        const noteGdimsForDay = notesByDate.get(dateStr);
        const dayRow = document.createElement('div');
        dayRow.className = 'weekly-day-row';
        if (date.getTime() === today.getTime()) {
            dayRow.classList.add('today-row');
            todayRowElement = dayRow; // Запазваме елемента за днешния ден
        }
        const dateInfo = document.createElement('div');
        dateInfo.className = 'weekly-date-info';
        // Добавяме клас за почивните дни ---
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) { // 0 = Неделя, 6 = Събота
            dateInfo.classList.add('weekend-day');
        }
        dateInfo.innerHTML = `
                <div class="weekly-date-number">${date.getDate()}</div>
                <div class="weekly-day-name">${date.toLocaleString(currentLang, { weekday: 'long' })}</div>
            `;
        dayRow.appendChild(dateInfo);
        const notesContainerForRow = document.createElement('div');
        notesContainerForRow.className = 'weekly-notes-container';
        if (noteGdimsForDay) {
            noteGdimsForDay.forEach(gdid => {
                const originalNote = document.querySelector(`.note[data-g="${gdid}"]`);
                if (originalNote) {
                    const clone = originalNote.cloneNode(true);
                    clone.classList.add('mini-note');
                    // Копираме съдържанието на canvas-а ---
                    const originalCanvas = originalNote.querySelector('.note-background-canvas');
                    const clonedCanvas = clone.querySelector('.note-background-canvas');
                    if (originalCanvas && clonedCanvas) {
                        const clonedCtx = clonedCanvas.getContext('2d');
                        clonedCtx.drawImage(originalCanvas, 0, 0);
                    }
                    // Опаковаме клонинга в div с фиксирани размери ---
                    const wrapper = document.createElement('div');
                    wrapper.className = 'mini-note-wrapper';
                    wrapper.appendChild(clone);
                    // директно извикваме showModal с данните на бележката,
                    // точно както го прави месечният календар.
                    clone.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const noteData = allNotesData.find(note => note.gdid === gdid);
                        if (noteData) {
                            // Added forceShowBoardName: true to ensure board name is visible
                            showModal({ raw: noteData.notetxt, format: noteData.text_span, color: clone.style.backgroundColor, id: noteData.id, gdid: noteData.gdid, boardId: noteData.boardid, forceShowBoardName: true });
                        }
                    });
                    // Гарантираме, че клонираната бележка винаги е видима ---
                    clone.style.display = 'flex';
                    notesContainerForRow.appendChild(wrapper);
                }
            });

        } else {
            if (weekHasNotes) {
                dateInfo.classList.add('no-notes-day');
            } else {
                dayRow.style.paddingBottom = '5px';
            }
        }
        dayRow.appendChild(notesContainerForRow);
        listContainer.appendChild(dayRow);
    }
    // Скролираме до днешния ден, ако е видим
    if (todayRowElement) {
        todayRowElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Добавяме брояч, ако има повече бележки ---
    // Тази проверка се прави след като елементите са в DOM, за да има реални размери.
    listContainer.querySelectorAll('.weekly-day-row').forEach(row => {
        const notesContainer = row.querySelector('.weekly-notes-container');
        if (notesContainer) {
            // Проверяваме дали има хоризонтален скрол
            const hasOverflow = notesContainer.scrollWidth > notesContainer.clientWidth;
            if (hasOverflow) {
                const totalNotes = notesContainer.children.length;
                const dateInfo = row.querySelector('.weekly-date-info');
                if (dateInfo && !dateInfo.querySelector('.weekly-note-counter')) {
                    const counter = document.createElement('div');
                    counter.className = 'weekly-note-counter';
                    counter.textContent = `(${totalNotes})`;
                    dateInfo.appendChild(counter);
                }
            }
        }
    });

}

/**
 * Премества бележка в Кошчето (задава status = 1).
 * Обновява IndexedDB, GDrive и локална папка според настройките.
 */
async function moveNoteToTrash(noteGdid, noteId) {
    const noteToUpdate = allNotesData.find(n => (noteGdid && n.gdid == noteGdid) || (noteId && n.id == noteId));
    if (!noteToUpdate) return false;
    const boardIdOfNote = noteToUpdate.boardid;
    noteToUpdate.status = 1;
    noteToUpdate.datemod = Date.now();
    const updateGDriveNow = useGoogleDb && !isOffline;
    if (!updateGDriveNow) {
        noteToUpdate.type = -1; // Маркираме за офлайн синхронизация
    }
    if (updateGDriveNow && noteToUpdate.gdid && !isOffline && typeof updateGDriveFile === 'function') {
        const actualGdid = noteToUpdate.gdid;
        await updateGDriveFile(actualGdid, JSON.stringify(noteToUpdate));
        console.log("Updating GD with actual ID:", actualGdid);
    }


    if (useIndexedDb && typeof NOTE_STORE_NAME !== 'undefined') {
        const db = await openNotesDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(NOTE_STORE_NAME, 'readwrite');
            tx.objectStore(NOTE_STORE_NAME).put(noteToUpdate);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    const doLocal = localStorage.getItem('updateLocalFolder') === 'true';
    if (doLocal && noteGdid && typeof updateLocalFile === 'function') {
        await updateLocalFile(noteGdid, JSON.stringify(noteToUpdate));
    }
    // Обновяваме DOM елемента (ако съществува) вместо да го премахваме
    const noteEl = document.querySelector(`.note[data-g="${noteGdid}"]`) ||
        (noteId ? document.querySelector(`.note[data-i="${noteId}"]`) : null);
    if (noteEl) noteEl.dataset.s = '1';
    if (boardIdOfNote) updateBoardCounterUI(boardIdOfNote);
    updateBoardCounterUI('trash');
    applyFilters();
    const cal = document.getElementById('calendar-container');
    if (cal && cal.style.display !== 'none') renderCalendarView();
    const week = document.getElementById('weekly-calendar-container');
    if (week && week.style.display !== 'none' && typeof renderWeeklyCalendarView === 'function') {
        renderWeeklyCalendarView(currentWeeklyViewDate);
    }
    updateReloadButtonState();
    return true;
}
/**
 * Изтрива бележка окончателно от БД, GDrive, локална папка и паметта.
 */
async function permanentlyDeleteNote(noteGdid, noteId, skipUI = false) {
    const updateGDriveNow = useGoogleDb && !isOffline;
    let gdriveDeleted = false;
    const noteToDelete = allNotesData.find(n => (noteGdid && n.gdid == noteGdid) || (noteId && n.id == noteId));
    const actualGdid = noteToDelete ? noteToDelete.gdid : noteGdid;

    if (updateGDriveNow && actualGdid && !isOffline && typeof deleteGDriveFile === 'function') {
        try {
            await deleteGDriveFile(actualGdid);
            gdriveDeleted = true;
        } catch (e) {
            console.warn("GDrive deletion failed but continuing locally:", e);
        }
    }


    if (useIndexedDb && typeof NOTE_STORE_NAME !== 'undefined') {
        try {
            await deleteFromDB(NOTE_STORE_NAME, noteGdid || noteId);
        } catch (e) {
            console.error("Local DB deletion failed:", e);
        }
    }

    const doLocal = localStorage.getItem('updateLocalFolder') === 'true';
    let localDeleted = false;
    if (doLocal && noteGdid && typeof deleteLocalFile === 'function') {
        await deleteLocalFile(noteGdid);
        localDeleted = true;
    }
    const midx = allNotesData.findIndex(n => (noteGdid ? n.gdid === noteGdid : n.id == noteId));
    if (midx !== -1) allNotesData.splice(midx, 1);
    const noteEl = document.querySelector(`.note[data-g="${actualGdid}"]`) ||
        (noteId ? document.querySelector(`.note[data-i="${noteId}"]`) : null);
    if (noteEl) noteEl.remove();


    if (!skipUI) {
        updateBoardCounterUI('trash');
        applyFilters();
        const cal = document.getElementById('calendar-container');
        if (cal && cal.style.display !== 'none') renderCalendarView();
        const week = document.getElementById('weekly-calendar-container');
        if (week && week.style.display !== 'none' && typeof renderWeeklyCalendarView === 'function') {
            renderWeeklyCalendarView(currentWeeklyViewDate);
        }
    }
    return { gdriveDeleted, localDeleted };
}
/**
 * UI обвивка: показва потвърждение и извиква moveNoteToTrash или permanentlyDeleteNote.
 * @param {string} noteGdid - Google Drive ID на бележката.
 * @param {string|number} noteId - Локално ID на бележката.
 * @param {boolean} fromModal - Дали се извиква от модалния прозорец.
 */
async function handleNoteDelete(noteGdid, noteId, fromModal = false) {
    const updateGDriveNow = useGoogleDb && !isOffline;
    const doLocal = localStorage.getItem('updateLocalFolder') === 'true';
    if (!useIndexedDb && !updateGDriveNow && !doLocal) return;
    if (fromModal) {
        document.getElementById('content-modal').classList.remove('visible');
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    const noteData = allNotesData.find(n => (noteGdid && n.gdid == noteGdid) || (noteId && n.id == noteId));
    const isInTrash = currentBoardFilter === 'trash' || (noteData && noteData.status === 1);
    const confirmMsgKey = isInTrash
        ? ((updateGDriveNow || doLocal) ? 'confirmNoteDeleteSync' : 'confirmNoteDelete')
        : 'confirmNoteMoveToTrash';
    const confirmed = await showConfirmation(_(confirmMsgKey) || _('confirmNoteDelete'));
    if (!confirmed) return;
    try {
        if (!isInTrash) {
            await moveNoteToTrash(noteGdid, noteId);
            showToast(_('noteMovedToTrash') || 'Бележката е преместена в Кошче', 3000);
        } else {
            const result = await permanentlyDeleteNote(noteGdid, noteId);
            let msgKey = 'noteDeletedSuccess';
            if (result.gdriveDeleted && result.localDeleted) msgKey = 'noteDeletedSuccessBoth';
            else if (result.gdriveDeleted) msgKey = 'noteDeletedSuccessGDrive';
            else if (result.localDeleted) msgKey = 'noteDeletedSuccessLocal';
            showToast(_(msgKey), 3000);
        }
    } catch (error) {
        console.error("Failed to delete note:", error);
        showToast((_('noteDeletedError') || "Грешка при изтриване") + " - " + error.message, 5000);
    }
}

async function emptyTrash() {
    const trashBtn = document.getElementById('empty-trash-fab');
    if (!trashBtn) return;

    const notesInTrash = Array.from(notesContainer.querySelectorAll('.note'))
        .filter(note => note.style.display !== 'none' && !note.classList.contains('promo-note'));

    if (notesInTrash.length === 0) {
        showToast(_('trashAlreadyEmpty') || "Кошчето е вече празно.", 3000);
        return;
    }

    const confirmed = await showConfirmation(_('confirmEmptyTrash') || "Сигурни ли сте, че искате да изпразните кошчето окончателно? Това действие е необратимо.");
    if (!confirmed) return;

    const originalContent = trashBtn.innerHTML;
    trashBtn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" class="spin-animation"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" stroke="white" stroke-width="2" stroke-linecap="round"/></svg><style>@keyframes spin{to{transform:rotate(360deg)}}.spin-animation{animation:spin 1s linear infinite}</style>`;
    trashBtn.style.pointerEvents = 'none';

    try {
        const pool = new Set();
        const CONCURRENCY_LIMIT = 10;
        for (const noteEl of notesInTrash) {
            if (pool.size >= CONCURRENCY_LIMIT) await Promise.race(pool);
            const noteGdid = noteEl.dataset.g;
            const noteId = noteEl.dataset.i;
            const promise = permanentlyDeleteNote(noteGdid, noteId, true).then(() => pool.delete(promise));
            pool.add(promise);
        }
        await Promise.all(pool);


        updateBoardCounterUI('trash');
        applyFilters();
        showToast(_('trashEmptiedSuccess') || "Кошчето е изпразнено успешно.", 3000);
    } catch (error) {
        console.error("Error emptying trash:", error);
        showToast("Error: " + error.message, 5000);
    } finally {
        trashBtn.innerHTML = originalContent;
        trashBtn.style.pointerEvents = 'auto';
    }
}
/**
 * Актуализира брояча на бележките в заглавието на борда в менюто.
 */
function updateBoardCounterUI(boardIdOrGdid) {
    if (boardIdOrGdid === undefined || boardIdOrGdid === null) return;
    const showCount = localStorage.getItem('showBoardNoteCount') === 'true';
    if (boardIdOrGdid === 'reminder') {
        const reminderLink = document.querySelector('.board-filter-link[data-boardid="reminder"]');
        if (reminderLink) {
            const reminderNoteCount = allNotesData.filter(n => n.timer && n.timer > 0 && n.status !== 1).length;
            reminderLink.textContent = showCount && reminderNoteCount > 0 ? `${_('reminder')} (${reminderNoteCount})` : _('reminder');
        }
        return;
    }
    if (boardIdOrGdid === 'trash') {
        const trashLink = document.querySelector('.board-filter-link[data-boardid="trash"]');
        if (trashLink) {
            const trashCount = allNotesData.filter(n => n.status === 1).length;
            trashLink.textContent = (showCount && trashCount > 0) ? `${_('trashBoardTitle') || "Кошче"} (${trashCount})` : (_('trashBoardTitle') || "Кошче");
            if (trashCount > 0) {
                trashLink.style.display = '';
            }
        }
        return;
    }
    if (boardIdOrGdid === 'search-results') {
        const searchLink = document.getElementById('search-results-board-btn');
        if (searchLink) {
            const count = document.getElementById('note-counter')?.textContent || '0';
            searchLink.textContent = (showCount && parseInt(count) > 0) ? `${_('searchResultTitle')} (${count})` : _('searchResultTitle');
        }
        return;
    }
    const boardData = boardsData.find(b => b.gdid == boardIdOrGdid || b.id == boardIdOrGdid);
    if (!boardData) return;
    const key = boardData.gdid || boardData.id;
    const boardButton = document.querySelector(`.board-filter-link[data-boardid="${key}"]`);
    if (boardButton) {
        const noteCount = allNotesData.filter(n => String(n.boardid) === String(key) && n.status !== 1).length;
        const title = boardData.title;
        boardButton.textContent = (showCount && noteCount > 0) ? `${title} (${noteCount})` : title;
    }
}
/**
 * Премества бележка в избран борд.
 */
async function moveNoteToBoard(noteGdid, noteId, newBoardId) {
    let noteToMove = null;
    if (noteGdid && typeof allNotesData !== 'undefined') {
        noteToMove = allNotesData.find(n => String(n.gdid) === String(noteGdid));
    }
    if (!noteToMove && noteId && typeof allNotesData !== 'undefined') {
        noteToMove = allNotesData.find(n => String(n.id) === String(noteId));
    }
    if (noteToMove) {
        const oldBoardId = noteToMove.boardid;
        const targetBoard = boardsData.find(b => (b.gdid || b.id) == newBoardId);
        if (!targetBoard) return;

        if (String(oldBoardId) === String(newBoardId)) {
            if (noteToMove.status === 1) {
                noteToMove.status = 0; // Възстановяване от кошчето в същия борд
            } else {
                showToast(_('noteAlreadyInBoard'), 3000);
                return false;
            }
        } else {
            noteToMove.boardid = newBoardId;
            if (noteToMove.status === 1) noteToMove.status = 0; // Възстановяване от кошчето в нов борд
        }

        const targetBoardTitle = targetBoard.title;
        noteToMove.datemod = Date.now();
        const updateGDriveNow = useGoogleDb && !isOffline;
        const updateLocalFolderNow = localStorage.getItem('updateLocalFolder') === 'true';
        if (!updateGDriveNow && !updateLocalFolderNow) {
            noteToMove.type = -1; // Маркираме за офлайн синхронизация
        }
        // Update DB
        if (useIndexedDb && typeof bulkPutDB === 'function' && typeof NOTE_STORE_NAME !== 'undefined') {
            await bulkPutDB(NOTE_STORE_NAME, [noteToMove], true);
        }

        // --- GDrive Sync ---
        if (updateGDriveNow) {
            const isTempGdid = !noteToMove.gdid || String(noteToMove.gdid) === String(noteToMove.id);
            if (isTempGdid) {
                const folderId = await getFolderID();
                if (folderId) {
                    const fileContent = JSON.stringify(noteToMove);
                    try {
                        const newGdid = await createGDriveFile(folderId, 'note.txt', fileContent);
                        if (newGdid) {
                            const oldGdid = noteToMove.gdid;
                            noteToMove.gdid = newGdid;
                            if (useIndexedDb) {
                                await bulkPutDB(NOTE_STORE_NAME, [noteToMove], true);
                                if (oldGdid && oldGdid !== newGdid) await deleteFromDB(NOTE_STORE_NAME, oldGdid);
                            }
                        }
                    } catch (e) {
                        console.error("Failed to create GDrive file during move", e);
                    }
                }
            } else {
                try {
                    await updateGDriveFile(noteToMove.gdid, JSON.stringify(noteToMove));
                } catch (err) {
                    console.error("GDrive move update failed:", err);
                    showToast(_('gdriveUpdateError').replace('{error}', err.message), 5000);
                }
            }
        }

        // --- Local Folder Sync ---
        if (updateLocalFolderNow) {
            try {
                const isTempGdid = !noteToMove.gdid || String(noteToMove.gdid) === String(noteToMove.id);
                if (isTempGdid && !updateGDriveNow) {
                    noteToMove.gdid = `L${Date.now()}`;
                }
                if (noteToMove.gdid) {
                    await updateLocalFile(noteToMove.gdid, JSON.stringify(noteToMove));
                }
            } catch (e) {
                console.error("Local move update failed:", e);
            }
        }

        showToast(_('noteMovedSuccess').replace('{boardName}', targetBoardTitle), 3000);
        const oldBoard = boardsData.find(b => (b.gdid || b.id) == oldBoardId);
        const newBoard = boardsData.find(b => (b.gdid || b.id) == newBoardId);
        if (oldBoard) {
            updateBoardCounterUI(oldBoardId);
        }
        if (newBoard) {
            updateBoardCounterUI(newBoardId);
        }
        const noteElementInDom = document.querySelector(`.note[data-g="${noteGdid}"]`) || document.querySelector(`.note[data-i="${noteId}"]`);
        if (noteElementInDom) {
            noteElementInDom.dataset.b = newBoardId;
            noteElementInDom.dataset.s = noteToMove.status;
        }
        updateBoardCounterUI('trash');
        filterNotesByBoard(currentBoardFilter, false);
        updateReloadButtonState();
        return true;
    }
    return false;
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
        image.onerror = () => {
            console.warn(`Failed to load background image: ${image.src}. Using solid color fallback.`);
            const canvas = document.createElement('canvas');
            const w = canvas.width = width;
            const h = canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, w, h);
            resolve(canvas);
        };
    });
}

// ------------------------ Database ----------------------------
/**
 * Отваря IndexedDB базата данни.
 * @returns {Promise<IDBDatabase>}
 */
function openNotesDB() {
    return new Promise((resolve, reject) => {
        let retries = 0;
        const maxRetries = 3;

        const attemptOpen = () => {
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
            request.onsuccess = (event) => {
                resolve(event.target.result);
            };
            request.onerror = (event) => {
                const error = event.target.error;
                const errorName = error ? error.name : "UnknownError";

                // Retry specifically for UnknownError or if backing store is gone (typical browser hiccups)
                if ((errorName === 'UnknownError' || errorName === 'VersionError') && retries < maxRetries) {
                    retries++;
                    console.warn(`Retry ${retries} opening NotesDB due to ${errorName}...`);
                    setTimeout(attemptOpen, 100 * retries);
                    return;
                }
                reject("Error opening NotesDB: " + (error ? (error.name + " - " + error.message) : "Unknown"));
            };
        };
        attemptOpen();
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
        try {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const putData = () => {
                data.forEach(item => store.put(item));
            };
            transaction.oncomplete = () => {
                db.close();
                resolve();
            };
            transaction.onerror = (event) => { db.close(); reject("DB Transaction Error: " + event.target.error); };
            transaction.onabort = () => db.close(); // Затваряме и при прекратяване
            if (incremental) {
                putData();
            } else {
                store.clear().onsuccess = putData;
            }
        } catch (error) {
            db.close();
            reject(error);
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
        try {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(`Error in getAllFromDB (${storeName}): ` + event.target.error);
            transaction.oncomplete = () => db.close();
            transaction.onerror = () => db.close();
        } catch (error) {
            db.close();
            reject(error);
        }
    });
}

/**
 * Извлича единичен запис от даден store по ключ.
 * @param {string} storeName - Името на object store.
 * @param {any} key - Ключът на записа за извличане.
 * @returns {Promise<Object|undefined>}
 */
async function getFromDB(storeName, key) {
    const db = await openNotesDB();
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            request.onsuccess = (event) => resolve(event.target.result);
            request.onerror = (event) => reject(`Error in getFromDB (${storeName}): ` + event.target.error);
            transaction.oncomplete = () => db.close();
            transaction.onerror = () => db.close();
        } catch (error) {
            db.close();
            reject(error);
        }
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
        try {
            const transaction = db.transaction(CONFIG_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(CONFIG_STORE_NAME);
            const request = store.put(value, key);
            request.onerror = (event) => reject('Error saving to config: ' + event.target.error);
            transaction.oncomplete = () => {
                db.close();
                resolve();
            };
            transaction.onerror = () => {
                db.close();
                reject('Transaction error saving to config');
            };
            transaction.onabort = () => {
                db.close();
                reject('Transaction aborted saving to config');
            };
        } catch (error) {
            db.close();
            reject(error);
        }
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
        try {
            const transaction = db.transaction(CONFIG_STORE_NAME, 'readonly');
            const store = transaction.objectStore(CONFIG_STORE_NAME);
            const request = store.get(key);
            let result;
            request.onsuccess = () => { result = request.result; };
            request.onerror = (event) => reject('Error getting from config: ' + event.target.error);
            transaction.oncomplete = () => {
                db.close();
                resolve(result);
            };
            transaction.onerror = () => {
                db.close();
                reject('Transaction error getting from config');
            };
            transaction.onabort = () => {
                db.close();
                reject('Transaction aborted getting from config');
            };
        } catch (error) {
            db.close();
            reject(error);
        }
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
    // --- ОКОНЧАТЕЛНА КОРЕКЦИЯ: Директно изтриване ---
    let deleteFinished = false;
    const deleteRequest = indexedDB.deleteDatabase(NOTES_DB_NAME);
    deleteRequest.onsuccess = () => {
        deleteFinished = true;
        showToast(_('dbDeleted'), 3000);
    };
    deleteRequest.onerror = (event) => {
        deleteFinished = true;
        showToast(_('dbDeleteFailed') + `: ${event.target.error}`, 10000);
    };
    deleteRequest.onblocked = (event) => {
        console.log('Database deletion is blocked unexpectedly:', event);
        // Показваме съобщението само ако изтриването не завърши до 1.5 секунди
        setTimeout(() => {
            if (!deleteFinished) {
                showToast(_('errorDbDeletionBlocked'), 15000);
            }
        }, 1500);
    };
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
        db.close(); // ВИНАГИ затваряме връзката след приключване
        console.log('Data stores cleared, config preserved.');
    } catch (error) {
        console.log('Failed to clear data stores:', error);
        showToast(_('dbDeleteFailed'), 10000);
    }
}

/**
 * Deletes a single record from a specified store by its key.
 * @param {string} storeName - The name of the object store.
 * @param {any} key - The key of the record to delete.
 * @returns {Promise<void>}
 */
async function deleteFromDB(storeName, key) {
    const db = await openNotesDB();
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            // Първи опит с оригиналния ключ
            store.delete(key);
            // Ако ключът е число или низ, който изглежда на число, пробвайте и другия тип
            if (typeof key === 'number') {
                store.delete(String(key));
            } else if (typeof key === 'string' && !isNaN(key) && key.trim() !== "" && !key.startsWith('L') && !key.includes('-')) {
                store.delete(Number(key));
            }
            transaction.oncomplete = () => {
                db.close();
                resolve();
            };
            transaction.onerror = (e) => {
                db.close();
                reject(e.target.error);
            };
            transaction.onabort = () => {
                db.close();
                reject("Abort");
            };
        } catch (error) {
            db.close();
            reject(error);
        }
    });
}

// =================================================================================
// II. ИНИЦИАЛИЗАЦИЯ НА ПРИЛОЖЕНИЕТО
// =================================================================================
// --- Web Share Target API Handler ---
async function handleShareTarget(externalData = null) {
    const url = new URL(window.location.href);
    const sharedTitle = externalData ? externalData.shared_title : url.searchParams.get('shared_title');
    const sharedText = externalData ? externalData.shared_text : url.searchParams.get('shared_text');
    const sharedUrl = externalData ? externalData.shared_url : url.searchParams.get('shared_url');
    const _rawSharedImage = externalData ? externalData.shared_image : url.searchParams.get('shared_image');
    const hasSharedImage = (_rawSharedImage && parseInt(_rawSharedImage, 10) > 0) ? _rawSharedImage : null;
    if (!sharedTitle && !sharedText && !sharedUrl && !hasSharedImage) return;
    // Съставяме съдържанието на бележката от споделените данни
    const parts = [];
    // if (sharedTitle) parts.push(sharedTitle);
    // if (sharedText) parts.push(sharedText);
    // if (sharedUrl && sharedUrl !== sharedText) parts.push(sharedUrl);
    // const noteContent = parts.join('\n') || (hasSharedImage ? '📷' : '');
    const cleanTitle = sharedTitle ? sharedTitle.trim() : '';
    const cleanText = sharedText ? sharedText.trim() : '';
    const cleanUrl = sharedUrl ? sharedUrl.trim() : '';
    const normalize = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    const normTitle = normalize(cleanTitle);
    const normText = normalize(cleanText);
    const normUrl = normalize(cleanUrl);
    if (cleanTitle) {
        const isTitleInText = cleanText && normText.includes(normTitle);
        if (!isTitleInText) parts.push(cleanTitle);
    }
    if (cleanText) {
        parts.push(cleanText);
    }
    if (cleanUrl) {
        const isUrlInText = cleanText && (normText.includes(normUrl) || normText.replace(/\s+/g, '').includes(normUrl.replace(/\s+/g, '')));
        const isUrlInTitle = cleanTitle && (normTitle.includes(normUrl) || normTitle.replace(/\s+/g, '').includes(normUrl.replace(/\s+/g, '')));
        if (!isUrlInText && !isUrlInTitle && cleanUrl !== cleanText && cleanUrl !== cleanTitle) {
            parts.push(cleanUrl);
        }
    }
    const noteContent = parts.join('\n') || (hasSharedImage ? '📷' : '');
    // Изчистваме share параметрите от URL-а, за да не се обработват повторно
    url.searchParams.delete('shared_title');
    url.searchParams.delete('shared_text');
    url.searchParams.delete('shared_url');
    url.searchParams.delete('shared_image');
    window.history.replaceState({}, document.title, url.pathname + url.search);
    // copilot version
    // const url = new URL(window.location.href);
    // const get = (key) => externalData ? externalData[key] : url.searchParams.get(key);
    // const rawTitle = get('shared_title') || '';
    // const rawText = get('shared_text') || '';
    // const rawUrl = get('shared_url') || '';
    // const hasImage = get('shared_image') === '1';
    // const clean = (s) => s.trim();
    // const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
    // const strip = (s) => s.toLowerCase().replace(/\s+/g, '');
    // const title = clean(rawTitle);
    // const text = clean(rawText);
    // const link = clean(rawUrl);
    // const nTitle = norm(title);
    // const nText = norm(text);
    // const nLink = norm(link);
    // const sTitle = strip(title);
    // const sText = strip(text);
    // const sLink = strip(link);
    // const parts = [];
    // // Добавяме заглавие само ако не е част от текста
    // if (title && !(nText.includes(nTitle) || sText.includes(sTitle))) {
    //     parts.push(title);
    // }
    // // Добавяме текст винаги (ако го има)
    // if (text) {
    //     parts.push(text);
    // }
    // // Добавяме URL само ако не се съдържа в заглавието или текста
    // if (link &&
    //     !(nText.includes(nLink) || sText.includes(sLink)) &&
    //     !(nTitle.includes(nLink) || sTitle.includes(sLink)) &&
    //     link !== text &&
    //     link !== title
    // ) {
    //     parts.push(link);
    // }
    // const noteContent = parts.join('\n') || (hasImage ? '📷' : '');
    // // Премахваме share параметрите
    // ['shared_title', 'shared_text', 'shared_url', 'shared_image']
    //     .forEach(k => url.searchParams.delete(k));
    // window.history.replaceState({}, document.title, url.pathname + url.search);
    // Подготвяме нова бележка (копирано от createNewNote логиката)
    noteId++;
    noteNumord++;
    syncFolderDataAsync();
    const now = Date.now();
    // Определяме борда: ако сме в системен борд, ползваме 'Main' или първия наличен
    let boardId = currentBoardFilter;
    const systemBoards = ['all', 'calendar', 'reminders', 'photos', 'videos', 'sounds', 'other', 'new-updates', 'search', 'favorites', 'archived'];
    const isRealBoard = boardsData.some(b => String(b.gdid) === String(boardId));
    if (systemBoards.includes(boardId) || (!isRealBoard && boardsData.length > 0)) {
        const mainBoard = boardsData.find(b => b.title === 'Main' || b.gdid === 'Main');
        boardId = mainBoard ? mainBoard.gdid : (boardsData.length > 0 ? boardsData[0].gdid : 'Main');
    }
    // --- Обработка на споделени файлове (може да са повече от един) ---
    const fileCount = hasSharedImage ? parseInt(hasSharedImage, 10) : 0;
    const sharedFiles = []; // { blob, filename, mimeType }
    if (fileCount > 0) {
        try {
            const cache = await caches.open('share-target-image');
            for (let i = 0; i < fileCount; i++) {
                const response = await cache.match(`shared-image-${i}`);
                if (response) {
                    const blob = await response.blob();
                    const filename = response.headers.get('X-Filename') || `shared_${now}_${i}.jpg`;
                    const mimeType = response.headers.get('Content-Type') || 'image/jpeg';
                    sharedFiles.push({ blob, filename, mimeType });
                    await cache.delete(`shared-image-${i}`);
                }
            }
        } catch (e) {
            console.error('Error retrieving shared files from cache:', e);
        }
    }
    // Показваме модала със споделеното съдържание
    setTimeout(async () => {
        if (typeof showModal === 'function') {
            showModal({
                raw: noteContent,
                format: null,
                color: '#FBFF86', // Жълт фон по подразбиране
                boardId: boardId,
                id: noteId,
                isNewNote: true
            });
            // Автоматично влизаме в режим на редактиране, за да може потребителят да запише
            setTimeout(() => {
                const editBtn = document.getElementById('note-edit-btn');
                if (editBtn) editBtn.click();
            }, 150);
        }
        showToast(_('sharedContentReceived') || '📥 Shared content received', 3000);
        // --- Качваме всички споделени файлове асинхронно (не блокираме UI) ---
        if (sharedFiles.length > 0 && !isOffline) {
            const targetNoteId = noteId; // Capture the local ID for closures
            // Стартираме качването на заден план - не await-ваме
            (async () => {
                try {
                    showToast(_('uploadingSharedImage') || '📤 Uploading files...', 5000);
                    const folderId = await getFolderID();
                    if (!folderId) throw new Error('Folder ID not available');
                    for (let i = 0; i < sharedFiles.length; i++) {
                        const { blob, filename, mimeType } = sharedFiles[i];
                        try {
                            const fileType = mimeType.startsWith('video') ? 'Video' : (mimeType.startsWith('audio') ? 'Sound' : 'Images');
                            let targetFolderId = folderIds[fileType] || localStorage.getItem(`gdrive_folder_id_${fileType}`);
                            if (!targetFolderId) {
                                targetFolderId = await createNewGDriveFolder(fileType, folderId);
                                if (targetFolderId) {
                                    folderIds[fileType] = targetFolderId;
                                    localStorage.setItem(`gdrive_folder_id_${fileType}`, targetFolderId);
                                }
                            }
                            if (!targetFolderId) throw new Error(`Could not get/create ${fileType} folder`);
                            const fileGdid = await uploadBlobToGDrive(targetFolderId, filename, blob, mimeType);
                            if (!fileGdid) throw new Error(`Upload failed: ${filename}`);
                            // Изчакваме бележката да получи gdid (до 30 мин)
                            const noteGdid = await new Promise(resolve => {
                                const check = (attempts = 0) => {
                                    const noteInData = allNotesData.find(n => String(n.id) === String(targetNoteId));
                                    if (noteInData && noteInData.gdid && typeof noteInData.gdid === 'string' && noteInData.gdid.length > 10) {
                                        resolve(noteInData.gdid);
                                    } else if (attempts < 3600) {
                                        setTimeout(() => check(attempts + 1), 500);
                                    } else {
                                        resolve(null);
                                    }
                                };
                                check();
                            });
                            if (!noteGdid) {
                                console.warn(`[ShareTarget] Note gdid timeout for ${filename}`);
                                showToast((_('attachLinkFailedMsg') || '⚠️ {name} uploaded, but link to note failed.').replace('{name}', filename), 7000);
                                continue;
                            }
                            const mediaTypeNum = fileType === 'Images' ? 1 : (fileType === 'Sound' ? 2 : (fileType === 'Video' ? 4 : 5));
                            const maxMediaId = mediaData.reduce((max, m) => Math.max(max, +(m.id || 0)), 0);
                            const mediaEntry = {
                                datemod: now,
                                description: '',
                                gdid: '',
                                id: maxMediaId + 1,
                                noteid: noteGdid,
                                path: filename,
                                pathGD: fileGdid,
                                type: mediaTypeNum
                            };
                            const mediaFileGdid = await createGDriveFile(folderId, 'media.txt', JSON.stringify(mediaEntry));
                            if (mediaFileGdid) {
                                mediaEntry.gdid = mediaFileGdid;
                                await updateGDriveFile(mediaFileGdid, JSON.stringify(mediaEntry));
                                mediaData.push(mediaEntry);
                                if (useIndexedDb) {
                                    await bulkPutDB(MEDIA_STORE_NAME, [mediaEntry], true);
                                }
                                showToast((_('attachSuccessMsg') || '✅ Attached: {name}').replace('{name}', filename), 3000);
                                if (typeof refreshNoteUI === 'function') {
                                    await refreshNoteUI(noteGdid);
                                } else {
                                    renderNotes();
                                }
                            }
                        } catch (fileErr) {
                            console.error(`[ShareTarget] Error processing file ${filename}:`, fileErr);
                            showToast((_('attachErrorMsg') || '❌ Error: {msg}').replace('{msg}', fileErr.message), 5000);
                        }
                    }
                } catch (e) {
                    console.error('[ShareTarget] Error in upload loop:', e);
                    showToast((_('attachErrorMsg') || '❌ Error: {msg}').replace('{msg}', e.message), 5000);
                }
            })();
        }
    }, 500);
}

// --- Support for LaunchQueue (Modern browsers like Chrome/Edge) ---
if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (launchParams) => {
        if (!launchParams.targetURL) return;
        const url = new URL(launchParams.targetURL);
        const params = {
            shared_title: url.searchParams.get('shared_title'),
            shared_text: url.searchParams.get('shared_text'),
            shared_url: url.searchParams.get('shared_url'),
            shared_image: url.searchParams.get('shared_image')
        };
        if (params.shared_title || params.shared_text || params.shared_url || params.shared_image === '1') {
            handleShareTarget(params);
        }
    });
}

// --- Основна стартова функция ---
async function startApp(isExplicitLogin = false) {
    if (isAppStarted) return;
    isAppStarted = true;

    // --- КОРЕКЦИЯ: Показваме лоудъра ВЕДНАГА при стартиране ---
    const lc = document.getElementById('loader-container');
    if (lc) lc.style.display = 'block';

    // --- Поддръжка за URL параметър ?offline ---
    const urlParams = new URLSearchParams(window.location.search);
    const forceOfflineParam = urlParams.has('offline') || urlParams.get('mode') === 'offline';

    let hasLocalDataOrCache = false;
    try {
        const cache = await caches.open('app-cache');
        const cachedResponse = await cache.match('s');
        hasLocalDataOrCache = !!cachedResponse;
        if (!hasLocalDataOrCache && typeof checkDbExists === 'function') {
            hasLocalDataOrCache = await checkDbExists(NOTES_DB_NAME);
        }
    } catch (e) {
        console.warn("Error checking cache/db for offline capability:", e);
    }

    if (forceOfflineParam) {
        if (hasLocalDataOrCache) {
            console.log("[Offline] Force offline mode enabled via URL parameter.");
            isOffline = true;
            isExplicitLogin = true;
        } else {
            console.warn("[Offline] URL parameter ?offline specified, but no local cache/data found. Falling back to online mode.");
            showToast(_('offlineNoCacheWarning') || "За офлайн работа е необходимо поне едно онлайн стартиране.", 6000);
        }
    }

    // --- Автоматична проверка за режим Online/Offline ---
    if (!isOffline) {
        if (!navigator.onLine) {
            isOffline = true;
            isExplicitLogin = true;
        } else {
            await goOffline();
            if (isOffline) isExplicitLogin = true;
        }
    }
    // --- Активна проверка за реална мрежова свързаност (non-blocking) ---
    // Стартираме пробата паралелно с другата инициализация. Ще изчакаме резултата само ако е нужен.
    let networkProbePromise = null;
    if (!isOffline) {
        networkProbePromise = fetch('https://www.googleapis.com/generate_204', {
            method: 'HEAD', mode: 'no-cors', cache: 'no-store'
        }).catch(() => null);
    }

    // --- NEW: Graceful fallback for KB Assistant ---
    // If the assistant script failed to load or has errors, create a dummy object
    // to prevent runtime errors in the main application.
    if (typeof window.kbAssistant === 'undefined') {
        console.warn("Knowledge Base Assistant not found. Creating a dummy object to ensure application stability.");
        window.kbAssistant = {
            init: () => Promise.resolve(false), // init is async, return false on failure
            showGuide: () => { console.warn("KB Assistant not loaded."); },
            terminateGuide: () => { },
            updateLanguage: () => { },
            isInitialized: false // This is important for conditional UI features
        };
    }
    try {
        // ts = await getFirstStartEncoded(); // Move to after UI prep if needed, but it's fine here
        console.log('First start:', Date.now());
        ts = await getFirstStartEncoded();
        console.log('First start in cache:', ts);
        // Преводите вече са заредени от IIFE — не дублираме setLanguage()
        initApp(); // Инициализира UI елементите и event listeners

        // Актуализираме текста на лоудъра след зареждане на преводите
        const lt = document.getElementById('loader-title');
        if (lt) lt.textContent = typeof _ === 'function' ? _('initialDataLoad') : 'Initial Data Load';

        // --- КОРЕКЦИЯ: Осигуряваме наличност на имейла при безшумен старт ---
        // Използваме САМО записания от логина hint (ако е избрано 'Запомни ме'),
        // за да избегнем несъответствие с лицензния имейл.
        if (!sessionStorage.getItem('google_auth_email_hint')) {
            const emailHint = localStorage.getItem('google_login_hint');
            if (emailHint) {
                sessionStorage.setItem('google_auth_email_hint', emailHint);
            }
        }
        // --- Задаване на настройки по подразбиране при първо стартиране ---
        // Ако никога не са задавани настройки за източник на данни,
        // избираме Google Drive + База данни по подразбиране.
        if (localStorage.getItem('useGoogleDb') === null && localStorage.getItem('useLocalDb') === null) {
            localStorage.setItem('useGoogleDb', 'true');
            localStorage.setItem('useIndexedDb', 'true');
        }
        // --- Изчакваме мрежовата проба, ако е стартирана ---
        if (networkProbePromise) {
            const probeResult = await networkProbePromise;
            if (probeResult === null) {
                console.log('Network probe failed — switching to offline mode.');
                isOffline = true;
                isExplicitLogin = true;
            }
        }
        // --- Проверяваме за базата данни (нужно за userCheck) ---
        if (dbExists === null || typeof dbExists === 'undefined') {
            dbExists = await checkDbExists(NOTES_DB_NAME);
        }
        // --- ЦЕНТРАЛИЗИРАНО УДОСТОВЕРЯВАНЕ И ПРОВЕРКА НА ПОТРЕБИТЕЛ ---
        const authResult = await checkAuth(isExplicitLogin);
        if (!authResult || !authResult.pass) {
            if (isLoadCancelled) return; // Не прави нищо, ако е отказано
            loaderContainer.style.display = 'none';
            // checkAuth вече е показал грешка или е пренасочил
            isAppStarted = false; // Allow re-try
            return;
        }
        authToken = authResult.tokenData;
        scheduleProactiveTokenRefresh();
        // Скриваме логин страницата, ако е била показана
        document.getElementById('login-page').hidden = true;
        document.getElementById('login-page').style.display = 'none';
        // --- WHITELIST CHECK (On every login) ---
        checkWhitelist(true); // Delayed background check to log session and update state
        // Обновяваме глобалните флагове веднага, за да отразим настройките по подразбиране
        updateGlobalStateFlags();

        // --- PRE-LOAD START BOARD SETTING ---
        // Avoid FOUC by setting currentBoardFilter immediately from storage
        const savedStartBoard = localStorage.getItem('startBoard');
        if (savedStartBoard && (isDbOwner || savedStartBoard === 'all')) {
            currentBoardFilter = savedStartBoard;
        }

        await createBoardsUI([], false);
        await createSettingsUI([], false); // Предварително създава UI на настройките
        // Проверката за потребител и основната логика се извикват директно.
        // mainLogic ще се погрижи за автентикацията и зареждането на Google API,
        // само ако е необходимо.
        // --- Инициализация на KB Assistant след успешно логване ---
        window.kbAssistant.init();
        // Инициализация на draggable бутони
        const initDraggableButtons = () => {
            // ScrollTop Button
            const scrollTopBtnElement = document.getElementById('scrollTopBtn');
            if (scrollTopBtnElement) {
                makeElementDraggable(scrollTopBtnElement, 'scrollTopBtnPosition');
            }
            // KB Assistant Button (wait for it if necessary)
            // Since KBUI might initialize later, we attempt to find it
            const initKbFab = () => {
                const kbFab = document.getElementById('kb-fab');
                if (kbFab) {
                    makeElementDraggable(kbFab, 'kbFabPosition');
                } else {
                    // Retry once after a short delay in case of async rendering
                    setTimeout(() => {
                        const kbFabRetry = document.getElementById('kb-fab');
                        if (kbFabRetry) makeElementDraggable(kbFabRetry, 'kbFabPosition');
                    }, 1000);
                }
            };
            initKbFab();
        };
        initDraggableButtons();
        await mainLogic();
        handleShareTarget();
    } catch (err) {
        console.error("Error in startApp:", err);
        // Fallback for network errors during mainLogic
        if (err.message === 'Failed to fetch' || err instanceof TypeError || (err.message && err.message.includes('Google libraries'))) {
            const hasS = await checkDbExists(NOTES_DB_NAME) || await caches.open('app-cache').then(c => c.match('s'));
            if (hasS) {
                const promptMsg = (typeof _ === 'function' ? (_('errorGoogleLibs') + "\n\n" + (_('offlineStartPrompt') || "Do you want to start in Offline Mode?")) : "Network error. Do you want to start in Offline Mode?");
                if (confirm(promptMsg)) {
                    isOffline = true;
                    // Reset UI and restart
                    if (loaderContainer) loaderContainer.style.display = 'none';
                    isAppStarted = false;
                    startApp();
                    return;
                }
            }
        }
    }
}

// Записва timestamp като кодиран низ (Base64) при поискване
async function getFirstStartEncoded(shouldSave = false) {
    const cache = await caches.open('app-cache');
    const cachedResponse = await cache.match('s'); // /firstStart.json
    if (cachedResponse) {
        // Четене на текста от кеша
        const encoded = await cachedResponse.text();
        const decodedTs = parseInt(atob(encoded), 10);
        return decodedTs;
    } else {
        // Първо стартиране → генерираме timestamp
        const nowTs = Date.now();
        if (shouldSave) {
            const encoded = btoa(String(nowTs));  // кодиране в Base64 → низ
            const response = new Response(encoded, {
                headers: { 'Content-Type': 'text/plain' }
            });
            await cache.put('s', response);
        }
        return nowTs;
    }
}

// function _(key) {
//     if (appTranslations[currentLang] && appTranslations[currentLang][key]) {
//         return appTranslations[currentLang][key];
//     }
//     return key;
// }

/**
 * Показва основния интерфейс на приложението и скрива лоудъра.
 * Извиква се, когато всичко е готово (преводи, данни, състояние).
 */
function showAppUI() {
    // Малък delay, за да сме сигурни, че DOM е обновен и готов за показване
    requestAnimationFrame(() => {
        document.body.classList.add('app-ready');
        const loader = document.getElementById('loader-container');
        if (loader) {
            loader.style.display = 'none';
        }
    });
}

function _(key) {
    if (!appTranslations[currentLang]) {
        // Fallback: This should rarely happen if loadTranslations was awaited
        return key;
    }
    return appTranslations[currentLang][key] || key;
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
    if (isToastHidden) return;
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
        submitFolderIdBtn.textContent = _('okButton');
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

function showConfirmation(message, options = {}) {
    return new Promise(resolve => {
        const popup = document.getElementById('folderIdPromptPopup');
        const popupContent = popup.querySelector('.popup-content');
        const messagePara = popup.querySelector('p');
        const okButton = document.getElementById('submitFolderIdBtn');
        const folderIdInput = document.getElementById('folderIdInput');
        let noButton = document.getElementById('prompt-no-btn');
        if (!noButton) {
            noButton = document.createElement('button');
            noButton.id = 'prompt-no-btn';
            noButton.className = 'zoom-btn settings-close-btn';
            noButton.style.marginLeft = '10px';
            okButton.parentNode.appendChild(noButton);
        }
        // Cancel button (optional)
        let cancelButton = document.getElementById('prompt-cancel-btn');
        if (!cancelButton) {
            cancelButton = document.createElement('button');
            cancelButton.id = 'prompt-cancel-btn';
            cancelButton.className = 'zoom-btn settings-close-btn';
            cancelButton.style.marginLeft = '10px';
            okButton.parentNode.appendChild(cancelButton);
        }
        // Save original inline styles to restore later
        const originalStyles = {
            backgroundColor: popupContent.style.backgroundColor,
            width: popupContent.style.width,
            maxWidth: popupContent.style.maxWidth
        };
        if (options.backgroundColor) popupContent.style.backgroundColor = options.backgroundColor;
        if (options.width) {
            popupContent.style.width = options.width;
            popupContent.style.maxWidth = '90vw';
        }
        messagePara.textContent = message;
        folderIdInput.style.display = 'none';
        okButton.textContent = _('confirmCreateDbYes');
        noButton.textContent = _('confirmCreateDbNo');
        noButton.style.display = 'inline-block';
        // Show/hide cancel button
        if (options.showCancel) {
            cancelButton.textContent = options.cancelText || _('cancel') || 'Cancel';
            cancelButton.style.display = 'inline-block';
        } else {
            cancelButton.style.display = 'none';
        }
        // Remove existing listener to avoid conflicts
        okButton.removeEventListener('click', handleSubmitFolderId);
        const cleanup = () => {
            popup.classList.remove('show');
            okButton.removeEventListener('click', onOk);
            noButton.removeEventListener('click', onNo);
            cancelButton.removeEventListener('click', onCancel);
            noButton.style.display = 'none';
            cancelButton.style.display = 'none';
            // Restore original listener
            okButton.addEventListener('click', handleSubmitFolderId);
            // Restore Styles
            popupContent.style.backgroundColor = originalStyles.backgroundColor;
            popupContent.style.width = originalStyles.width;
            popupContent.style.maxWidth = originalStyles.maxWidth;
        };
        const onOk = () => {
            cleanup();
            resolve(true);
        };
        const onNo = () => {
            cleanup();
            resolve(false);
        };
        const onCancel = () => {
            cleanup();
            resolve('cancel');
        };
        okButton.addEventListener('click', onOk);
        noButton.addEventListener('click', onNo);
        cancelButton.addEventListener('click', onCancel);
        popup.classList.add('show');
    });
}

/**
 * Показва избор с три опции при синхронизация: Да, Не, Всички.
 */
function showSyncChoiceModal(noteSummary) {
    return new Promise(resolve => {
        const popup = document.getElementById('folderIdPromptPopup');
        const popupContent = popup.querySelector('.popup-content');
        const messagePara = popup.querySelector('p');
        const yesBtn = document.getElementById('submitFolderIdBtn');
        let noBtn = document.getElementById('prompt-no-btn');
        let allBtn = document.getElementById('prompt-cancel-btn');

        if (!noBtn) {
            noBtn = document.createElement('button');
            noBtn.id = 'prompt-no-btn';
            noBtn.className = 'zoom-btn settings-close-btn';
            noBtn.style.marginLeft = '10px';
            yesBtn.parentNode.appendChild(noBtn);
        }
        if (!allBtn) {
            allBtn = document.createElement('button');
            allBtn.id = 'prompt-cancel-btn';
            allBtn.className = 'zoom-btn settings-close-btn';
            allBtn.style.marginLeft = '10px';
            yesBtn.parentNode.appendChild(allBtn);
        }

        const promptText = (typeof _ === 'function' ? _('syncPromptNote') : 'Sync note:');
        messagePara.innerHTML = `<div style="font-weight:bold; margin-bottom:10px;">${promptText}</div><div style="font-style:italic; color:#555; max-height:150px; overflow-y:auto; border:1px solid #eee; padding:10px; border-radius:4px; text-align:left;">${noteSummary}</div>`;

        // Разширяваме прозореца за по-добър преглед
        popupContent.style.width = '450px';
        popupContent.style.maxWidth = '90vw';

        yesBtn.textContent = (typeof _ === 'function' ? _('confirmCreateDbYes') : 'Yes');
        noBtn.textContent = (typeof _ === 'function' ? _('confirmCreateDbNo') : 'No');
        allBtn.textContent = (typeof _ === 'function' ? _('allEntries') : 'All');

        noBtn.style.display = 'inline-block';
        allBtn.style.display = 'inline-block';

        const folderIdInput = document.getElementById('folderIdInput');
        if (folderIdInput) folderIdInput.style.display = 'none';

        const cleanup = () => {
            popup.classList.remove('show');
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
            allBtn.removeEventListener('click', onAll);
            yesBtn.addEventListener('click', handleSubmitFolderId);
            if (folderIdInput) folderIdInput.style.display = '';
            // Restore original width
            popupContent.style.width = '';
            popupContent.style.maxWidth = '';
        };

        const onYes = () => { cleanup(); resolve('yes'); };
        const onNo = () => { cleanup(); resolve('no'); };
        const onAll = () => { cleanup(); resolve('all'); };

        yesBtn.removeEventListener('click', handleSubmitFolderId);
        yesBtn.addEventListener('click', onYes);
        noBtn.addEventListener('click', onNo);
        allBtn.addEventListener('click', onAll);

        popup.classList.add('show');
    });
}
function showPrompt(message, defaultValue = '') {
    return new Promise(resolve => {
        const popup = document.getElementById('folderIdPromptPopup');
        const messagePara = popup.querySelector('p');
        const okButton = document.getElementById('submitFolderIdBtn');
        const folderIdInput = document.getElementById('folderIdInput');
        let noButton = document.getElementById('prompt-no-btn');
        if (!noButton) {
            noButton = document.createElement('button');
            noButton.id = 'prompt-no-btn';
            noButton.className = 'zoom-btn settings-close-btn';
            noButton.style.marginLeft = '10px';
            okButton.parentNode.appendChild(noButton);
        }

        messagePara.textContent = message;
        folderIdInput.style.display = 'block';
        folderIdInput.value = defaultValue;
        okButton.textContent = _('submitButton');
        noButton.textContent = _('cancel') || 'Cancel';
        noButton.style.display = 'inline-block';

        const cleanup = () => {
            popup.classList.remove('show');
            okButton.removeEventListener('click', onOk);
            noButton.removeEventListener('click', onCancel);
            noButton.style.display = 'none';
            okButton.addEventListener('click', handleSubmitFolderId);
        };
        const onOk = () => {
            const val = folderIdInput.value;
            cleanup();
            resolve(val);
        };
        const onCancel = () => {
            cleanup();
            resolve(null);
        };

        okButton.removeEventListener('click', handleSubmitFolderId);
        okButton.addEventListener('click', onOk);
        noButton.addEventListener('click', onCancel);
        popup.classList.add('show');
        folderIdInput.focus();
    });
}

/**
 * Добавя event listeners към елемент за разпознаване на "long press" или Ctrl+клик.
 * @param {HTMLElement} element - Елементът, към който да се добавят събитията.
 * @param {Function} callback - Функцията, която да се изпълни при задействане.
 */
function addLongPressOrCtrlClick(element, callback) {
    let longPressTimer;
    let isLongPress = false;
    const startPress = (e) => {
        isLongPress = false;
        // Започваме таймер за продължително натискане
        longPressTimer = setTimeout(() => {
            isLongPress = true;
            // callback(e); // ВРЕМЕННО: Изключено изтриване при long press
        }, 500); // 500ms за long press
    };
    const endPress = () => {
        clearTimeout(longPressTimer);
    };
    element.addEventListener('mousedown', startPress);
    element.addEventListener('mouseup', endPress);
    element.addEventListener('mouseleave', endPress);
    element.addEventListener('touchstart', startPress, { passive: true });
    element.addEventListener('touchend', endPress);
    element.addEventListener('contextmenu', e => e.preventDefault()); // Предотвратява контекстното меню при long press
}

function extractAndFormat(text, onlyChecked = false) {
    let lines = text.split('\n');
    let results = []
    lines.forEach(line => {
        let trimmedLine = line.trim();
        if (!trimmedLine) return;
        // Първична нормализация на символите
        // ПРОВЕРКА ЗА ФЛАГ: Ако 'onlyChecked' е вдигнат, пропускаме редове без ☑
        if (onlyChecked && !trimmedLine.includes('☑')) {
            return;
        }
        // Ако редът съдържа чекбокс за "неотметнато" (☐) или "отказано" (☒), 
        // го пропускаме в изчисленията (стандартно поведение за списъци)
        // if (trimmedLine.includes('☐') || trimmedLine.includes('☒')) {
        //     return;
        // }
        let normalized = trimmedLine
            // Премахваме чекбоксовете в началото на реда
            .replace(/^[☑☒☐]\s*/, '')
            .replace(/(\d),(\d)/g, '$1.$2') // запетая -> точка
            .replace(/[xх*]/gi, '*')        // х -> *
            .replace(/[:\/]/g, '/');        // : -> /
        // Универсално чистене на номерация и чекбоксове/символи в началото
        // Премахваме ☑, ☒, ☐ и номерация, ако след тях има текст и после числа
        // УСЪВЪРШЕНСТВАНО ЧИСТЕНЕ НА НОМЕРАЦИЯ (Защита за 1733.90)
        // Тук казваме: Премахни число+точка в началото, САМО АКО след него има поне два интервала 
        // или ако след него има букви (текст), преди да започне математическия израз.
        // \p{L} хваща всякаква буква (латиница, кирилица, гръцки, арабски и т.н.)
        // Флагът 'u' (unicode) накрая е задължителен за тази функционалност.
        // let cleanLine = normalized.replace(/^\d+[☑☒☐|\d\.\)]+\s*(?=\p{L})/gu, '');
        let cleanLine = normalized.replace(/^\d+(?:[.\d\)|]+)\s*(?=\p{L})/gu, '');
        // Втора защита: Ако редът започва с число, точка и веднага след това цифра (напр. 1733.90),
        // НЕ го пипаме, защото това е част от сумата.
        // Залепяме операторите (чистим интервалите omkring тях)
        cleanLine = cleanLine.replace(/\s*([\*\/\+\-])\s*/g, '$1');
        // 4. Екстракция на математическия блок
        // Търсим най-дългата поредица от цифри и оператори
        let mathMatch = cleanLine.match(/[+-]?\d+(\.\d+)?([\*\/\+\-]\d+(\.\d+)?)+|[+-]?\d+(\.\d+)?/g);
        if (mathMatch) {
            // Вземаме последното съвпадение (обикновено сумата е в края на реда)
            let expression = mathMatch[mathMatch.length - 1];
            // 5. Финална проверка за знака в самото начало на целия низ
            if (/^\d/.test(expression)) {
                expression = '+' + expression;
            }
            results.push(expression);
        }
    });
    // 5. Генерираме финалния стринг
    let finalSequence = results.join('');
    // Премахваме водещия '+' ако има такъв
    if (finalSequence.startsWith('+')) {
        finalSequence = finalSequence.slice(1);
    }
    console.log(text);
    console.log(finalSequence);
    return (finalSequence);
}

/**
 * Обработва клик върху бутона за калкулатор в модалния прозорец.
 * Взима маркирания текст, изчислява го като математически израз и замества селекцията с резултата.
 */
async function handleCalculateClick(checkList) {
    const selection = window.getSelection();
    const modalBody = document.getElementById('modal-body');
    let expression = '';
    let isFromClipboard = false;
    let range = null;
    // Проверяваме дали има маркиран текст в модалния прозорез
    if (selection.rangeCount > 0 && selection.toString().trim() !== '') {
        const tempRange = selection.getRangeAt(0);
        if (modalBody.contains(tempRange.commonAncestorContainer)) {
            expression = selection.toString().trim();
            range = tempRange;
        }
    }
    // Ако няма маркиран текст, опитваме да четем от клипборда
    if (expression === '') {
        try {
            expression = await navigator.clipboard.readText();
            expression = expression.trim();
            isFromClipboard = true;
        } catch (err) {
            console.log('Failed to read clipboard contents: ', err);
            // Добавяме грешката в края на бележката вместо toast
            const errorText = `\n${_('errorClipboardRead')}`;
            const errorNode = document.createTextNode(errorText);
            modalBody.appendChild(errorNode);
            return;
        }
    }
    if (expression === '') return;
    try {

        /*/ Премахваме всички интервали от израза
        expression = expression.replace(/\s/g, '');
        // Заменяме запетаите с точки за поддръжка на европейски формат за десетични числа
        expression = expression.replace(/,/g, '.');
        // Основна проверка за сигурност - позволяваме само определени символи
        const sanitizedExpression = expression.replace(/[^0-9+\-*__/().]/g, ''); // __ дабавени заради коментарането на блока - махни ги, ако решиш да използваш
        if (sanitizedExpression !== expression) {
            throw new Error("Invalid characters in expression.");
        }*/
        const sanitizedExpression = extractAndFormat(expression, checkList);
        // Използваме Function конструктор, който е малко по-сигурен от директен eval()
        const result = new Function('return ' + sanitizedExpression)();
        // Форматираме резултата с 2 десетични знака
        const formattedResult = result.toFixed(2);
        const resultText = ` = ${formattedResult}`;

        // Ако имаме селекция и не е от клипборда, вмъкваме резултата след маркирания текст
        if (range && !isFromClipboard) {
            // Създаваме текстов възел с резултата
            const resultNode = document.createTextNode(resultText);
            // Вмъкваме го след оригиналната селекция
            range.collapse(false); // Свиваме обхвата до края му
            range.insertNode(resultNode);
            // Създаваме нов обхват (range), който да обхване само числото
            const newRange = document.createRange();
            newRange.setStart(resultNode, resultText.indexOf(formattedResult.toString())); // Начало на числото
            newRange.setEnd(resultNode, resultText.length); // Край на текста
            selection.removeAllRanges(); // Изчистваме старата селекция
            selection.addRange(newRange); // Добавяме новата селекция
        } else {
            // Ако е от клипборда, добавяме цялото изчисление в края на бележката
            const fullResultText = `\n${sanitizedExpression} = ${formattedResult}`;
            const resultNode = document.createTextNode(fullResultText);
            modalBody.appendChild(resultNode);
        }
    } catch (error) {
        // Добавяме грешката в края на бележката вместо toast
        const errorText = `\n${_('invalidExpression')}`;
        const errorNode = document.createTextNode(errorText);
        modalBody.appendChild(errorNode);
        console.log("Calculation error:", error);
    }
}

let isUIInitialized = false;
function initApp() {
    if (isUIInitialized) return;
    isUIInitialized = true;
    // Inject custom styles dynamically to fix UI issues
    // const style = document.createElement('style');
    // style.textContent = `
    //     .all-boards-filter-btn span { text-align: center; width: 100%; }
    //     .sounds-filter-btn { color: #fcfcfc !important; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5); }
    // `;
    // // Добавяме CSS правило за стилизиране на иконата за дублиране
    // style.textContent += `
    //     #copy-modal-btn svg {
    //         width: 24px !important;
    //         height: 24px !important;
    //         stroke-width: 2 !important;
    //     }`;
    // document.head.appendChild(style);
    // Set default showBoardAll to false if not set
    if (localStorage.getItem('showBoardAll') === null) {
        localStorage.setItem('showBoardAll', 'false');
    }
    // Set default showWeeklyCalendar to true if not set
    if (localStorage.getItem('showWeeklyCalendar') === null) {
        localStorage.setItem('showWeeklyCalendar', 'true');
    }
    // Set default updateGDrive to true if not set
    // Removed updateGDrive default check
    // Set default useIndexedDb to true if not set
    if (localStorage.getItem('useIndexedDb') === null) {
        localStorage.setItem('useIndexedDb', 'true');
    }
    // Инициализация на DOM елементи
    signoutButton = document.getElementById('signout_button');
    if (signoutButton) {
        signoutButton.addEventListener('click', handleSignoutClick);
    }
    reloadButton = document.getElementById('reload_button');
    settingsButton = document.getElementById('settings_button');
    notesContainer = document.getElementById('notes-container');
    // --- Global Event Delegation for Note Tooltips ---
    let titleTimeout;
    notesContainer.addEventListener('mouseover', (e) => {
        if (e.target.classList.contains('note-title-truncated')) {
            const titleEl = e.target;
            if (!titleEl.title) { // Only set timeout if title isn't already set
                titleTimeout = setTimeout(() => {
                    if (document.body.contains(titleEl) && !titleEl.title) {
                        titleEl.title = titleEl.textContent;
                    }
                }, 500);
            }
        }
    });
    notesContainer.addEventListener('mouseout', (e) => {
        if (e.target.classList.contains('note-title-truncated')) {
            clearTimeout(titleTimeout);
        }
    });
    contentModal = document.getElementById('content-modal');
    modalBody = document.getElementById('modal-body');

    copyBtn = document.getElementById('copy-modal-btn');
    scrollTopBtn = document.getElementById("scrollTopBtn");
    // Allow context menu for system actions (copy/paste)
    // Removed: modalBody.addEventListener('contextmenu', e => e.preventDefault());
    // Removed: modalBody.addEventListener('pointerup', e => { ... });

    searchBox = document.getElementById('search-box');
    loaderContainer = document.getElementById('loader-container');
    loaderText = document.getElementById('loader-text');
    // --- Add Title to Loader (Idempotent) ---
    let loaderTitle = document.getElementById('loader-title');
    if (!loaderTitle) {
        loaderTitle = document.createElement('h3');
        loaderTitle.id = 'loader-title';
        loaderTitle.style.marginTop = '0';
        loaderTitle.style.marginBottom = '5px';
        loaderContainer.prepend(loaderTitle);
    }
    let loaderFolderInfo = document.getElementById('loader-folder-info');
    if (!loaderFolderInfo) {
        loaderFolderInfo = document.createElement('div');
        loaderFolderInfo.id = 'loader-folder-info';
        loaderFolderInfo.style.fontSize = '0.9em';
        loaderFolderInfo.style.opacity = '0.8';
        loaderFolderInfo.style.marginBottom = '15px';
        loaderTitle.after(loaderFolderInfo);
    }
    if (loaderFolderInfo) loaderFolderInfo.textContent = `(${activeFolderName})`;
    // --- Add Cancel Button to Loader (Idempotent) ---
    let cancelButton = document.getElementById('cancel-load-btn');
    if (!cancelButton) {
        cancelButton = document.createElement('button');
        cancelButton.id = 'cancel-load-btn';
        cancelButton.className = 'zoom-btn settings-close-btn'; // Reuse existing styles
        cancelButton.style.marginTop = '20px';
        cancelButton.dataset.key = 'cancelButton'; // For i18n
        loaderContainer.appendChild(cancelButton);
        cancelButton.addEventListener('click', (e) => {
            // --- КОРЕКЦИЯ: Предотвратяваме други event listeners да се задействат ---
            e.preventDefault();
            e.stopPropagation();
            console.log("Load operation cancelled by user.");
            isLoadCancelled = true;
            // Hide loader and show settings
            loaderContainer.style.display = 'none';
            document.getElementById('settings-modal').classList.add('visible');
        });
    }
    // Инициализираме KB Assistant - ще се инициализира от startApp след логване
    // if (window.kbAssistant && !window.kbAssistant.isInitialized) {
    //     window.kbAssistant.init();
    // }
    // Настройване на UI и езикови настройки
    const toast = document.getElementById('toastNotification');
    toast.addEventListener('click', hideToast);

    // Инициализираме местенето на FAB бутона
    initFABDragging();

    scrollTopBtn.innerHTML = arrowSvg;
    const appTitle = document.querySelector('header h1');
    if (appTitle) {
        appTitle.style.cursor = 'pointer';
        appTitle.addEventListener('click', async () => {
            console.log('Title clicked');
            // Trigger the assistant-1 guide
            if (window.kbAssistant && window.kbAssistant.isInitialized) {
                console.log('KB Assistant is initialized');
                // Search in general section where assistant-1 is located
                const assistantGuide = window.kbAssistant.kbData?.general?.find(item => item.id === 'assistant-1')
                console.log('Found guide:', assistantGuide);
                if (assistantGuide && assistantGuide.guide) {
                    console.log('Showing guide');
                    window.kbAssistant.showGuide(assistantGuide.guide);
                } else {
                    console.warn('assistant-1 guide not found');
                }
            } else {
                console.warn('KB Assistant not initialized');
            }
        });

    }
    let reloadLongPressTimer;
    reloadButton.addEventListener('touchstart', (e) => {
        reloadLongPressTimer = setTimeout(() => {
            reloadButton.dispatchEvent(new MouseEvent('click', {
                ctrlKey: true,
                bubbles: true,
                cancelable: true
            }));
            if (navigator.vibrate) navigator.vibrate(50);
        }, 600);
    }, { passive: true });
    reloadButton.addEventListener('touchend', () => clearTimeout(reloadLongPressTimer));
    reloadButton.addEventListener('touchmove', () => clearTimeout(reloadLongPressTimer));
    reloadButton.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        return false;
    });
    reloadButton.addEventListener('click', (e) => {
        const isForceSync = Boolean(e && (e.ctrlKey || e.shiftKey));
        const hasDirtyNotes = allNotesData && allNotesData.some(n => n.type === -1);
        if (hasDirtyNotes && !isForceSync) {
            if (isOffline) {
                showToast(_('offlineModeMessage') || 'Cannot sync while offline.', 3000);
            } else {
                syncDirtyNotes();
            }
        } else {
            mainLogic(isForceSync);
        }
    });

    // --- Long Press Logic for Settings Button (Mobile) ---
    let settingsLongPressTimer;
    settingsButton.addEventListener('touchstart', (e) => {
        settingsLongPressTimer = setTimeout(() => {
            // Simulate Ctrl+Click behavior
            settingsButton.dispatchEvent(new MouseEvent('click', {
                ctrlKey: true,
                bubbles: true,
                cancelable: true
            }));
            // Provide feedback (haptic) if available
            if (navigator.vibrate) navigator.vibrate(50);
        }, 600); // 600ms threshold for long press
    }, { passive: true });

    settingsButton.addEventListener('touchend', () => clearTimeout(settingsLongPressTimer));
    settingsButton.addEventListener('touchmove', () => clearTimeout(settingsLongPressTimer));
    settingsButton.addEventListener('contextmenu', (e) => {
        // On mobile, long press usually triggers context menu. prevent it here to depend only on our custom logic
        e.preventDefault();
        e.stopPropagation();
        return false;
    });

    settingsButton.addEventListener('click', (e) => {
        // Toggle Advanced Settings based on Ctrl Key or if force-opened
        // Logic adapted for Accordion + hidden span structure
        const advancedSettingsSpan = document.getElementById('advanced-settings-span');
        const accordionHeader = document.querySelector('.accordion-header');

        const isAdvanced = localStorage.getItem('showAdvancedSettings') === 'true';

        if (e.ctrlKey) {
            if (isAdvanced) {
                localStorage.setItem('showAdvancedSettings', 'false');
                if (advancedSettingsSpan) advancedSettingsSpan.setAttribute('hidden', '');
                const dataFoldersDiv = document.getElementById('data-folders');
                if (dataFoldersDiv) {
                    dataFoldersDiv.style.maxHeight = null;
                    dataFoldersDiv.style.display = 'none';
                }
                if (accordionHeader) {
                    const accordion = accordionHeader.parentElement;
                    if (accordion) accordion.classList.remove('active');
                    const content = accordion ? accordion.querySelector('.accordion-content') : null;
                    if (content) content.style.maxHeight = null;
                }
                return;
            } else {
                localStorage.setItem('showAdvancedSettings', 'true');
            }
        }
        if (localStorage.getItem('showAdvancedSettings') === 'true') {
            if (advancedSettingsSpan) advancedSettingsSpan.removeAttribute('hidden');
            populateFoldersDropdown();
            loadGlobalFoldersJson().then(changed => {
                if (changed) {
                    populateFoldersDropdown();
                }
            });
            setTimeout(() => {
                if (accordionHeader) {
                    const accordion = accordionHeader.parentElement;
                    if (!accordion.classList.contains('active')) {
                        accordionHeader.click();
                    } else {
                        const settingsModalBody = document.getElementById('settings-modal-body');
                        if (settingsModalBody) {
                            settingsModalBody.scrollTo({ top: settingsModalBody.scrollHeight, behavior: 'smooth' });
                        } else {
                            accordionHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                }
            }, 100);
        } else {
            if (advancedSettingsSpan) advancedSettingsSpan.setAttribute('hidden', '');
            const dataFoldersDiv = document.getElementById('data-folders');
            if (dataFoldersDiv) {
                dataFoldersDiv.style.maxHeight = null;
                dataFoldersDiv.style.display = 'none';
            }
            if (accordionHeader) {
                const accordion = accordionHeader.parentElement;
                if (accordion && accordion.classList.contains('active')) {
                    accordionHeader.click();
                }
            }
        }

        // Запомняме началното състояние на чекбоксовете при отваряне на настройките
        // Първо обновяваме състоянието на чекбоксовете, после го запазваме ---
        const useGDCheckbox = document.getElementById('use-google-db-checkbox');
        const useLocCheckbox = document.getElementById('use-local-db-checkbox');
        const useArhCheckbox = document.getElementById('use-arh-db-checkbox');
        const useIdbCheckbox = document.getElementById('use-indexeddb-checkbox');

        if (useGDCheckbox) useGDCheckbox.checked = localStorage.getItem('useGoogleDb') !== 'false';
        if (useLocCheckbox) useLocCheckbox.checked = localStorage.getItem('useLocalDb') === 'true';
        if (useArhCheckbox) useArhCheckbox.checked = localStorage.getItem('useArhDb') === 'true';
        if (useIdbCheckbox) useIdbCheckbox.checked = localStorage.getItem('useIndexedDb') === 'true';

        settingsInitialState = {
            useGoogleDb: useGDCheckbox ? useGDCheckbox.checked : true,
            useLocalDb: useLocCheckbox ? useLocCheckbox.checked : false,
            useArhDb: useArhCheckbox ? useArhCheckbox.checked : false,
            useIndexedDb: useIdbCheckbox ? useIdbCheckbox.checked : false
        };
        document.getElementById('settings-modal').classList.add('visible');
        if (typeof updateAdvancedSettingsVisibility === 'function') updateAdvancedSettingsVisibility();
        // ВИНАГИ попълваме dropdown-а при отваряне на настройките
        populateFoldersDropdown();
        // Ако Разширени настройки вече са видими, актуализираме gdrive_folder_names от folders.json
        const advSpanOnOpen = document.getElementById('advanced-settings-span');
        if (advSpanOnOpen && !advSpanOnOpen.hasAttribute('hidden') && !isOffline) {
            loadGlobalFoldersJson().then(changed => {
                if (changed) populateFoldersDropdown();
            });
        }
        // if (guide) showStep(4); // Настройки
    });

    const scrollHandler = function () {
        const scrolled = document.documentElement.scrollTop || document.body.scrollTop;
        // Check both scroll threshold and body visibility to ensure button doesn't appear on hidden/login pages
        if (
            (scrolled > 50) &&
            document.body.style.display !== 'none' &&
            // Also check if we are not on the login page (hidden check acts as proxy often)
            // but explicitly: the login page should have its own logic, 
            // verifying specific container visibility is safer if body is always visible.
            // Using user's strict condition:
            document.body.style.display !== 'none'
        ) {
            // Keep the user's logic exactly as requested
            scrollTopBtn.style.display = "flex";
        } else {
            scrollTopBtn.style.display = "none";
        }
    };
    window.onscroll = scrollHandler;

    // --- Listener for Online/Offline Status (Added for Offline Mode) ---
    let offlineTimeout;
    window.addEventListener('online', () => {
        clearTimeout(offlineTimeout);
        if (isOffline) {
            isOffline = false;
            updateModeButton();
            if (typeof showToast === 'function') showToast("Online mode restored", 2000);
        }
    });
    window.addEventListener('offline', () => {
        clearTimeout(offlineTimeout);
        offlineTimeout = setTimeout(async () => {
            let reallyOnline = false;
            try {
                const response = await fetch('/favicon.ico?_=' + new Date().getTime(), { method: 'HEAD', cache: 'no-store' });
                reallyOnline = response.ok;
            } catch (e) { }

            if (!reallyOnline) {
                isOffline = true;
                updateModeButton();
                if (typeof showToast === 'function') showToast("Offline mode active", 2000);
            }
        }, 3000);
    });
    scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    // --- Search Box Enhancements ---
    const searchWrapper = document.getElementById('search-wrapper');
    // 1. Static Search Icon (Left) — кликаем за превключване режим на търсене
    const staticSearchIcon = document.createElement('span');
    staticSearchIcon.className = 'search-icon-static';
    staticSearchIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><circle class="search-mode-dot" cx="11" cy="11" r="3" fill="black" stroke="none" style="display:none"></circle></svg>`;
    staticSearchIcon.style.cursor = 'pointer';
    staticSearchIcon.title = searchInBoardOnly ? (_('searchInBoardTooltip') || 'Search in current board (click to change)') : (_('searchEverywhereTooltip') || 'Search everywhere (click to change)');
    if (searchInBoardOnly) {
        const dot = staticSearchIcon.querySelector('.search-mode-dot');
        if (dot) { dot.style.display = ''; dot.setAttribute('fill', 'black'); }
    }
    staticSearchIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        searchInBoardOnly = !searchInBoardOnly;
        localStorage.setItem('searchInBoardOnly', searchInBoardOnly);
        updateSearchModeIndicator();
        const searchBox = document.getElementById('search-box');
        if (searchBox && searchBox.value.trim()) {
            triggerSearch(false);
        }
    });
    // 2. Clear Button (Right, next to Save)
    const clearSearchBtn = document.createElement('span');
    clearSearchBtn.className = 'search-action-btn search-btn-clear';
    clearSearchBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    clearSearchBtn.style.display = 'none'; // Hidden initially
    clearSearchBtn.title = _('clearButton') || 'Clear'; // Updated from closeButton to clearButton
    // REMOVED: searchModeToggle logic. We now always search in content (which includes title).
    // Ensure placeholder is correct for content search
    updateSearchPlaceholder();
    saveSearchBtn = document.createElement('span');
    saveSearchBtn.id = 'save-search-btn';
    saveSearchBtn.className = 'search-action-btn search-btn-save'; // Updated class
    saveSearchBtn.innerHTML = saveSearchSvg;
    saveSearchBtn.style.display = 'none';
    // saveSearchBtn.style.marginTop = '2px'; // Removed as we use flex centering
    saveSearchBtn.title = _('searchSavedTip');
    const savedSearchesPopup = document.createElement('div');
    savedSearchesPopup.id = 'saved-searches-popup';
    // Add all icons and popups to the wrapper
    searchWrapper.prepend(staticSearchIcon); // Add Magnifier
    searchWrapper.appendChild(clearSearchBtn); // Add Clear Button
    searchWrapper.appendChild(saveSearchBtn);
    searchWrapper.appendChild(savedSearchesPopup);
    // Етикет за активен борд (видим само в fullscreen mode)
    const fsBoardLabel = document.createElement('span');
    fsBoardLabel.id = 'fullscreen-board-label';
    searchWrapper.appendChild(fsBoardLabel);

    function renderSavedSearchesPopup() {
        const popup = document.getElementById('saved-searches-popup');
        if (!popup) return;
        popup.style.display = 'block';
        popup.innerHTML = ''; // Clear everything
        // --- Close Button ---
        const closeBtn = document.createElement('div');
        closeBtn.className = 'saved-search-close-btn';
        closeBtn.innerHTML = '&times;';
        closeBtn.title = _('closeButton') || 'Close';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            popup.style.display = 'none';
        });
        popup.appendChild(closeBtn);
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
                if (searchBox) {
                    searchBox.value = term;
                    triggerSearch(true);
                }
                popup.style.display = 'none';
            });
            contentContainer.appendChild(item); // Add items to the new container
        });
    }

    // This function will be the single point for applying search and UI updates
    const triggerSearch = (isUserTyping = false) => {
        if (isUserTyping) {
            // Only update the "last search" if the input is not empty
            if (searchBox.value.trim() !== '') {
                lastSearchTerm = searchBox.value;
                localStorage.setItem('lastSearchTerm', lastSearchTerm);
            }
        }

        const hasTextTrimmed = searchBox.value.trim().length > 0;
        const searchBoardBtn = document.getElementById('search-results-board-btn');

        if (!hasTextTrimmed && currentBoardFilter === 'search-results') {
            // Ако изчистваме търсенето, се връщаме към предния борд
            currentBoardFilter = boardBeforeSearch || 'all';
            if (searchBoardBtn) searchBoardBtn.style.display = 'none';
        } else if (hasTextTrimmed) {
            // Ако започваме търсене и не сме в режим търсене
            if (currentBoardFilter !== 'search-results') {
                boardBeforeSearch = currentBoardFilter;
                currentBoardFilter = 'search-results';
            }
            if (searchBoardBtn) {
                searchBoardBtn.style.display = 'inline-flex';
            }
        }

        applyFilters();

        // Update UI counters and active state
        updateBoardCounterUI('search-results');

        // Force UI update for active button state
        const buttonBoardId = (currentBoardFilter === 'search-results') ? 'search-results' : currentBoardFilter;
        document.querySelectorAll('.board-filter-link').forEach(link => {
            const isSelected = link.dataset.boardid === String(buttonBoardId);
            link.classList.toggle('selected-board', isSelected);
            link.classList.toggle('active', isSelected);
            link.style.height = isSelected ? '39px' : '35px';
        });

        const hasText = searchBox.value.length > 0;
        clearSearchBtn.style.display = hasText ? 'flex' : 'none';
        saveSearchBtn.style.display = hasTextTrimmed ? 'flex' : 'none';

        if (hasTextTrimmed && searchBoardBtn) {
            setTimeout(() => {
                searchBoardBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }, 100);
        } else if (!hasTextTrimmed) {
            // Скролираме до активния борд след изчистване на търсенето
            const activeBtn = document.querySelector(`.board-filter-link[data-boardid="${buttonBoardId}"]`);
            if (activeBtn) {
                setTimeout(() => {
                    activeBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                }, 100);
            }
        }
    };

    // Listen for user typing with Debounce
    let searchDebounceTimeout;
    searchBox.addEventListener('input', (event) => {
        // Immediate UI update for buttons (no debounce needed for visibility)
        const val = searchBox.value.trim();
        const hasText = val.length > 0;
        clearSearchBtn.style.display = hasText ? 'flex' : 'none';
        // Save button might wait for debounce, but usually safer to show immediately too
        saveSearchBtn.style.display = hasText ? 'flex' : 'none';

        // По-толерантна проверка за токен в реално време
        if (val.match(/^\??token=/)) {
            saveSearchBtn.title = (typeof _ === 'function') ? _('saveTokenTooltip') : "Update token";
        } else {
            saveSearchBtn.title = (typeof _ === 'function') ? _('searchSavedTip') : "Save search term";
        }
        if (!event.isTrusted) return;
        clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = setTimeout(() => {
            triggerSearch(true);
        }, 300); // Wait 300ms after last keystroke
    });

    // Handle Enter key
    searchBox.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent form submission if any
            searchBox.blur(); // Hide keyboard on mobile
            triggerSearch(true); // Ensure search is applied
            document.getElementById('saved-searches-popup').style.display = 'none'; // Close popup
        }
    });

    // Clear Button Logic
    clearSearchBtn.addEventListener('click', () => {
        searchBox.value = '';
        lastSearchTerm = '';
        localStorage.setItem('lastSearchTerm', lastSearchTerm);
        triggerSearch(true);
        searchBox.blur();
        const popup = document.getElementById('saved-searches-popup');
        if (popup) popup.style.display = 'none';
    });

    searchBox.addEventListener('focus', () => {
        renderSavedSearchesPopup(); // Модалът ще се показва винаги при фокус
    });
    saveSearchBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const searchTerm = searchBox.value.trim();
        // Обработка на токен за лиценз
        const tokenMatch = searchTerm.match(/^\??token=(.+)$/);
        if (tokenMatch) {
            const tokenValue = tokenMatch[1].trim();
            if (tokenValue) {
                localStorage.setItem('urlToken', tokenValue);
                searchBox.value = '';
                saveSearchBtn.style.display = 'none';
                clearSearchBtn.style.display = 'none';
                cachedLicenseData = null; // Изчистваме кеша за лиценза
                isAppStarted = false; // Позволяваме рестартиране на приложението
                startApp(true);
            }
            return;
        }
        if (searchTerm && !savedSearches.includes(searchTerm)) {
            saveSearchTerm(searchTerm);
            // Animate the save button instead of showing a toast
            saveSearchBtn.classList.add('saved-animation');
            setTimeout(() => saveSearchBtn.classList.remove('saved-animation'), 600);
            renderSavedSearchesPopup(); // Re-render to show the new term immediately
            document.getElementById('saved-searches-popup').style.display = 'block';
        }
    });

    // --- Calculator Button ---
    const calculateBtn = document.getElementById('calculate-modal-btn');
    let longPressTimer;
    let isLongPress = false;

    // Обработка на click събитие
    calculateBtn.addEventListener('click', (e) => {
        if (isLongPress) {
            isLongPress = false;
            return;
        }
        if (e.ctrlKey) {
            // Ctrl+клик - извикваме с true
            handleCalculateClick(true);
        } else {
            // Обикновен клик
            handleCalculateClick(false);
        }
    });

    // Обработка на long press
    const startPress = (e) => {
        isLongPress = false;
        longPressTimer = setTimeout(() => {
            isLongPress = true;
            handleCalculateClick(true);
        }, 500); // 500ms за long press
    };

    const endPress = () => {
        clearTimeout(longPressTimer);
    };

    calculateBtn.addEventListener('mousedown', startPress);
    calculateBtn.addEventListener('mouseup', endPress);
    calculateBtn.addEventListener('mouseleave', endPress);
    calculateBtn.addEventListener('touchstart', startPress, { passive: true });
    calculateBtn.addEventListener('touchend', endPress);
    // --- КОРЕКЦИЯ: Преместваме бутоните в хедъра на модала ---
    const modalHeader = contentModal.querySelector('.modal-header-controls');
    const modalCloseBtn = contentModal.querySelector('.modal-close');
    if (modalHeader && modalCloseBtn) {
        // Вмъкваме бутоните преди бутона за затваряне
        modalHeader.insertBefore(calculateBtn, modalCloseBtn);
        modalHeader.insertBefore(copyBtn, modalCloseBtn);
    }
    // --- Край на корекцията ---
    copyBtn.innerHTML = copyIconSvg;
    copyBtn.addEventListener('click', () => {
        if (!navigator.clipboard) return;
        const selection = window.getSelection();
        let textToCopy = '';
        // Проверяваме дали има маркиран текст и дали той се намира в модалния прозорец
        if (selection && selection.rangeCount > 0 && selection.toString().trim() !== '') {
            const range = selection.getRangeAt(0);
            // Уверяваме се, че селекцията е започнала вътре в modalBody
            if (modalBody.contains(range.commonAncestorContainer)) {
                textToCopy = selection.toString();
            }
        }
        // Ако няма избран текст, копираме цялото съдържание на бележката
        if (textToCopy === '') {
            textToCopy = currentModalContent?.trim() || '';
        }
        if (textToCopy) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                copyBtn.innerHTML = '&#10003;'; // Показваме отметка за успех
                setTimeout(() => { copyBtn.innerHTML = copyIconSvg; }, 5000);
            }).catch(err => {
                showToast(_('errorCopyFailed'));
            });
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
        btn.addEventListener('click', async (e) => {
            const modal = e.currentTarget.closest('.modal-overlay');
            if (modal && modal.id === 'content-modal') {
                if (!(await checkUnsavedChanges())) return;
            }
            if (modal) modal.classList.remove('visible');
            if (modal && modal.id === 'settings-modal') {
                window.kbAssistant.terminateGuide();
                if (notesBgrdChanged || oneTapLinkChanged) {
                    mainLogic();
                    notesBgrdChanged = false;
                    oneTapLinkChanged = false;
                }
            }
        });

    });
    // Specific listener for the settings close button (not class 'modal-close')
    const settingsCloseBtnPrimary = document.getElementById('settings-close-btn');

    // Add same long-press touch simulation as settings_button
    let closeBtnLongPressTimer;
    settingsCloseBtnPrimary.addEventListener('touchstart', (e) => {
        closeBtnLongPressTimer = setTimeout(() => {
            settingsCloseBtnPrimary.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true, cancelable: true }));
            if (navigator.vibrate) navigator.vibrate(50);
        }, 600);
    }, { passive: true });
    settingsCloseBtnPrimary.addEventListener('touchend', () => clearTimeout(closeBtnLongPressTimer));
    settingsCloseBtnPrimary.addEventListener('touchmove', () => clearTimeout(closeBtnLongPressTimer));
    settingsCloseBtnPrimary.addEventListener('contextmenu', (e) => {
        e.preventDefault(); e.stopPropagation(); return false;
    });

    settingsCloseBtnPrimary.addEventListener('click', (e) => {
        if (e && e.ctrlKey) {
            const sb = document.getElementById('settings_button');
            if (sb) sb.dispatchEvent(new MouseEvent('click', { ctrlKey: true, bubbles: true }));
            return;
        }
        document.getElementById('settings-modal').classList.remove('visible');
        if (window.kbAssistant) window.kbAssistant.terminateGuide();
        if (notesBgrdChanged || oneTapLinkChanged) {
            mainLogic();
            notesBgrdChanged = false;
            oneTapLinkChanged = false;
        }
        if (!isOffline) {
            const advSpan = document.getElementById('advanced-settings-span');
            if (advSpan && !advSpan.hasAttribute('hidden')) {
                syncGlobalFoldersJson().catch(e => console.warn('Auto-sync folders error:', e));
            }
        }
    });

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        let isMouseDownInside = false;

        modal.addEventListener('mousedown', (e) => {
            // Маркираме дали натискането е започнало вътре в съдържанието
            isMouseDownInside = e.target !== modal;
        });

        modal.addEventListener('touchstart', (e) => {
            // Аналогично за мобилни устройства
            isMouseDownInside = e.target !== modal;
        }, { passive: true });

        modal.addEventListener('click', async (e) => {
            // Затваряме само ако и натискането, и отпускането са били върху овърлея
            if (e.target === modal && !isMouseDownInside) {
                if (modal.id === 'content-modal') {
                    if (!(await checkUnsavedChanges())) return;
                }
                modal.classList.remove('visible');
                if (modal.id === 'settings-modal') {
                    if (window.kbAssistant) window.kbAssistant.terminateGuide();
                    if (notesBgrdChanged || oneTapLinkChanged) {
                        mainLogic();
                        notesBgrdChanged = false;
                        oneTapLinkChanged = false;
                    }
                    if (!isOffline) {
                        const advSpan = document.getElementById('advanced-settings-span');
                        if (advSpan && !advSpan.hasAttribute('hidden')) {
                            syncGlobalFoldersJson().catch(e => console.warn('Auto-sync folders error:', e));
                        }
                    }
                }
            }
        });
    });
    // Prevent clicks inside the content modal from propagating to the underlying notes
    contentModal.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Apply initial font size settings from localStorage
    const initialNoteFontSize = localStorage.getItem('noteFontSize') || 16;
    document.documentElement.style.setProperty('--note-font-size', `${initialNoteFontSize}px`);
    // Apply initial state for datemod visibility
    const shouldHideDatemod = localStorage.getItem('showDatemod') === 'false';
    document.body.classList.toggle('hide-datemod', shouldHideDatemod);
    const initialModalFontSize = localStorage.getItem('modalFontSize') || 16;
    modalBody.style.fontSize = `${initialModalFontSize}px`;
    // Add a listener to reset the modal font size when it's closed,
    // as it might be changed by other parts of the app (like formatText).
    contentModal.addEventListener('transitionend', () => {
        if (!contentModal.classList.contains('visible')) {
            modalBody.style.fontSize = `${localStorage.getItem('modalFontSize') || 16}px`;
        }
    });

    // --- Modal Resizing Logic ---
    const modalContentBox = contentModal.querySelector('.modal-content-box');
    const resizeHandle = contentModal.querySelector('.modal-resize-handle');
    let startX, startY, startWidth, startHeight;
    function doDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        const currentX = e.touches ? e.touches[0].clientX : e.clientX;
        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        const newWidth = Math.round(startWidth + currentX - startX);
        const newHeight = Math.round(startHeight + currentY - startY);
        modalContentBox.style.width = Math.max(150, Math.min(newWidth, window.innerWidth)) + 'px'; // Limited by screen width
        modalContentBox.style.height = Math.max(100, newHeight) + 'px'; // Minimum height
        modalContentBox.style.maxWidth = '100vw';
        modalContentBox.style.maxHeight = 'none';
    }

    function stopDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        document.documentElement.removeEventListener('mousemove', doDrag, false);
        document.documentElement.removeEventListener('mouseup', stopDrag, false);
        document.documentElement.removeEventListener('touchmove', doDrag, false);
        document.documentElement.removeEventListener('touchend', stopDrag, false);
        localStorage.setItem('modalWidth', modalContentBox.style.width);
        localStorage.setItem('modalHeight', modalContentBox.style.height);
    }
    function startDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        startX = e.touches ? e.touches[0].clientX : e.clientX;
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        startWidth = parseInt(document.defaultView.getComputedStyle(modalContentBox).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(modalContentBox).height, 10);
        // Attach listeners for both mouse and touch
        document.documentElement.addEventListener('mousemove', doDrag, false);
        document.documentElement.addEventListener('mouseup', stopDrag, false);
        document.documentElement.addEventListener('touchmove', doDrag, false);
        document.documentElement.addEventListener('touchend', stopDrag, false);
    }

    // Attach start event for both mouse and touch
    resizeHandle.addEventListener('mousedown', startDrag);
    resizeHandle.addEventListener('touchstart', startDrag, { passive: false });
    // Добавяме икона за преоразмеряване, за да е по-ясно за потребителя
    resizeHandle.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" style="position: absolute; right: 1px; bottom: 1px; pointer-events: none; stroke: rgba(0,0,0,0.4); stroke-width: 2; stroke-linecap: round; fill: none;">
            <path d="M12 2 L2 12" />
            <path d="M12 7 L7 12" />
            <!-- Малка стрелка, сочеща към центъра (нагоре и наляво) -->
            <path d="M10 4 L4 4 L4 10" />
        </svg>`;
    // Load saved searches and settings from localStorage
    lastSearchTerm = localStorage.getItem('lastSearchTerm') || "";
    savedSearches = JSON.parse(localStorage.getItem('savedSearches') || '[]');
    maxSavedSearches = parseInt(localStorage.getItem('maxSavedSearches') || '20', 10);
    setLanguage(currentLang);
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

    // --- Mode Button Logic ---
    const modeButton = document.getElementById('mode_button');
    const calendarButton = document.getElementById('calendar_button');
    if (calendarButton) {
        calendarButton.addEventListener('click', () => {
            filterNotesByBoard('calendar');
        });
    }

    // Click handler
    modeButton.addEventListener('click', async (e) => {
        if (isSyncSuspended) {
            isSyncSuspended = false;
            isOffline = false;
            isAppStarted = false;
            handleAuthClick();
            return;
        }
        if (isOffline) {
            const checkingMsg = _('checkingnetwork') || _('checkingNetwork') || "Проверка на мрежовата връзка...";
            if (typeof showToast === 'function') showToast(checkingMsg, 2000);
            let reallyOnline = false;
            if (navigator.onLine) {
                try {
                    const probe = await fetch('https://www.googleapis.com/generate_204', {
                        method: 'HEAD', mode: 'no-cors', cache: 'no-store'
                    });
                    reallyOnline = true;
                } catch (err) {
                    try {
                        const res = await fetch(window.location.origin + window.location.pathname + '?_=' + Date.now(), { method: 'HEAD', cache: 'no-store' });
                        reallyOnline = res.ok;
                    } catch (e2) { }
                }
            }

            if (reallyOnline) {
                isOffline = false;
                isSyncSuspended = false;
                // Премахваме ?offline от URL адреса, за да не се задейства при презареждане
                const url = new URL(window.location.href);
                if (url.searchParams.has('offline') || url.searchParams.get('mode') === 'offline') {
                    url.searchParams.delete('offline');
                    url.searchParams.delete('mode');
                    window.history.replaceState({}, document.title, url.pathname + url.search);
                }
                updateModeButton();
                const restoredMsg = _('onlineRestored') || _('onlinerestored') || "Възстановен е онлайн режим";
                if (typeof showToast === 'function') showToast(restoredMsg, 3000);
                // Стартираме онлайн автентикация и синхронизация
                isAppStarted = false;
                await startApp(true);
            } else {
                showToast(_('offlineModeMessage') || "Няма връзка с мрежата. Синхронизацията е невъзможна.", 3000);
            }
            return;
        }
        updateGlobalStateFlags();
        const isDbOnlyMode = useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb;
        if (isDbOnlyMode && dbExists) {
            triggerSync();
        } else {
            document.getElementById('settings_button').click();
        }
    });

    async function triggerSync(forceFullSync = false) {
        updatedNoteGdims = []; // Clear previous updates
        loaderContainer.style.display = 'block'; // Показваме статус панела
        const dbSource = await getConfig('dbSource');
        let updatedCount = 0;
        loaderContainer.style.display = 'block';
        const loaderTitle = document.getElementById('loader-title');
        if (dbSource === 1) { // Базата е създадена от Google Drive
            try {
                if (typeof gapi === 'undefined' || typeof gapi.client === 'undefined') {
                    await loadGoogleApis();
                }
                if (typeof gapi !== 'undefined' && gapi.client) {
                    gapi.client.setToken({ access_token: authToken.access_token });
                }
            } catch (error) {
                throw new Error(_('errorGoogleLibs'));
            }
            console.log("Triggering Google Drive sync, forceFullSync:", forceFullSync);
            console.trace("[Sync-Trace] triggerSync called");
            if (loaderTitle) loaderTitle.textContent = _('syncTitleGD');
            try {
                updatedCount = await runGoogleDriveSync(forceFullSync);
            } catch (err) {
                console.warn("GD Sync failed, attempting token refresh...", err);
                const refreshResult = await refreshAuthToken();
                if (refreshResult && refreshResult.pass) {
                    authToken = refreshResult.tokenData;
                    if (typeof gapi !== 'undefined' && gapi.client) {
                        gapi.client.setToken({ access_token: authToken.access_token });
                    }
                    updatedCount = await runGoogleDriveSync(forceFullSync);
                } else {
                    showToast(_('errorSessionExpired'));
                    loaderContainer.style.display = 'none';
                    return;
                }
            }
            showToast(updatedCount > 0 ? _('gdriveUpdatesFound').replace('{count}', updatedCount) : _('gdriveNoUpdates'), 5000);
        } else if (dbSource === 2) { // Базата е създадена от Локална папка
            console.log("Triggering Local Folder sync, forceFullSync:", forceFullSync);
            if (loaderTitle) loaderTitle.textContent = _('syncTitleLocal');
            updatedCount = await runLocalSync(forceFullSync);
            showToast(updatedCount > 0 ? _('localUpdatesFound').replace('{count}', updatedCount) : _('localNoUpdates'), 5000);
        } else {
            loaderContainer.style.display = 'none';
            return;
        }
        // --- НОВА, ПО-ЕФИКАСНА ЛОГИКА ЗА ОБНОВЯВАНЕ ---
        if (updatedCount > 0) {
            // 1. Извличаме само новите бележки от базата данни
            const newNotesContent = await Promise.all(
                updatedNoteGdims.map(gdid => getFromDB(NOTE_STORE_NAME, gdid))
            );
            const validNewNotes = newNotesContent.filter(Boolean);
            // 2. Обновяваме данните в паметта и DOM-а
            for (const newNote of validNewNotes) {
                // A. Обновяване на данните
                const existingIndex = allNotesData.findIndex(n => n.gdid === newNote.gdid);
                if (existingIndex !== -1) {
                    allNotesData[existingIndex] = newNote; // Заместваме старата версия
                } else {
                    allNotesData.push(newNote); // Добавяме, ако е нова
                }
                // B. Обновяване на DOM-а
                // Първо премахваме съществуващия елемент, ако има такъв
                const existingEl = document.querySelector(`.note[data-g="${newNote.gdid}"]`);
                if (existingEl) {
                    existingEl.remove();
                }
                // Създаваме и добавяме новия елемент
                const newEl = await createNoteElement(newNote);
                if (newEl) {
                    notesContainer.prepend(newEl);
                }
            }
            trackMaxIds(validNewNotes);
            // 4. Обновяваме броячите и менюто с бордове
            currentBoardFilter = 'new-updates'; // Switch to New board
            await renderUI({ boardParseError: false, rerenderOnlyMenu: true });
            applyFilters(); // Прилагаме филтрите отново
        }
        loaderContainer.style.display = 'none';
    }

    // Добавяме event listener за показване на системна информация при клик на брояча
    const noteCounter = document.getElementById('note-counter');
    noteCounter.addEventListener('click', async () => {
        if (isLoadCancelled) return;
        try {
            const dbOwnerEmail = await getConfig('userEmail') || _('noData');
            const currentUserEmail = sessionStorage.getItem('google_auth_email_hint') || _('noData');
            const lastGDTimestamp = await getConfig('lastGDTimestamp');
            const lastLocalTimestamp = await getConfig('lastLocalTimestamp');
            const dbNoteIdType = await getConfig('dbNoteIdType') || _('noData');
            const dbSourceValue = await getConfig('dbSource');
            let dbSourceText = _('noData');
            if (dbSourceValue === 1) { // Google Drive
                dbSourceText = _('sourceGoogleDrive');
            } else if (dbSourceValue === 2) {
                dbSourceText = _('sourceLocalFolder');
            } else if (dbSourceValue === 3) {
                dbSourceText = _('sourceArchive');
            }
            const dbCreatedTimestamp = await getConfig('dbCreatedTimestamp');
            const dbCreatedFolderName = await getConfig('dbCreatedFolderName') || '';
            const gdDate = lastGDTimestamp ? formatDateTime(lastGDTimestamp) : _('noData');
            const localDate = lastLocalTimestamp ? formatDateTime(lastLocalTimestamp) : _('noData');
            const dbCreatedDate = dbCreatedTimestamp ? formatDateTime(dbCreatedTimestamp) : '';
            const loadTimeDate = initialLoadTimestamp ? formatDateTime(initialLoadTimestamp) : '';

            // Създаваме съдържанието без начални отстояния, за да се подравни правилно в модала.
            const content = [
                `${_('activeFolderLabel')} ${activeFolderName}`,
                `${_('sysInfoLoadTime')}: ${initialLoadTime ? initialLoadTime + ' s' + (loadTimeDate ? ' (' + loadTimeDate + ')' : '') : _('noData')}`,
                ``,
                `${_('sysInfoUser')}: ${currentUserEmail}`,
                `${_('sysInfoDbOwner')}: ${dbOwnerEmail}`,
                `${_('sysInfoDbCreatedFrom')}: ${dbSourceText}${dbCreatedFolderName ? ' (' + dbCreatedFolderName + ')' : ''}${dbCreatedDate ? ' (' + dbCreatedDate + ')' : ''}`,
                `${_('sysInfoLastLocalSync')}: ${localDate}`,
                `${_('sysInfoLastGDSync')}: ${gdDate}`,
                `${_('sysInfoAttachmentLinks')}: ${dbNoteIdType}`,
                ``,
                ...(tokenRemainingDays !== null ? [`${_('remainingDays')}: ${tokenRemainingDays}`] : []),
            ].join('\n');
            showModal({ raw: content, color: '#f0f0f0', readonly: true });
        } catch (error) {
            console.log("Error fetching system info:", error);
            showToast(_('errorSysInfo'));
        }
    });

}

/**
 * Актуализира текста в полето за търсене, за да покаже текущия режим.
 */
function updateSearchPlaceholder() {
    const searchInput = document.getElementById('search-box');
    if (!searchInput) return;
    // Don't overwrite if install button is currently visible over the search box
    const installBtnEl = document.getElementById('install_button');
    if (installBtnEl && window.getComputedStyle(installBtnEl).display !== 'none') return;
    searchInput.placeholder = _('searchPlaceholder') || "Enter text...";
}

function updateSearchModeIndicator() {
    const dot = document.querySelector('.search-mode-dot');
    const icon = document.querySelector('.search-icon-static');
    if (!dot || !icon) return;
    if (searchInBoardOnly) {
        // Вземаме цвета на активния борд бутон
        // const activeBtn = document.querySelector(`.board-filter-link.selected-board`);
        // const boardColor = activeBtn ? getComputedStyle(activeBtn).backgroundColor : '#1976D2';
        dot.style.display = '';
        dot.setAttribute('fill', "black");
        icon.title = _('searchInBoardTooltip') || 'Search in current board (click to change)';
    } else {
        dot.style.display = 'none';
        icon.title = _('searchEverywhereTooltip') || 'Search everywhere (click to change)';
    }
}

function saveSearchTerm(term) {
    const existingIndex = savedSearches.indexOf(term);
    if (existingIndex > -1) {
        savedSearches.splice(existingIndex, 1);
    }
    savedSearches.unshift(term);
    if (maxSavedSearches > 0 && savedSearches.length > maxSavedSearches) {
        savedSearches.length = maxSavedSearches;
    } else if (maxSavedSearches === 0) {
        savedSearches = [];
    }
    localStorage.setItem('savedSearches', JSON.stringify(savedSearches));
    if (!isOffline) {
        saveSettingsToGDrive(true).catch(e => console.warn("Failed to auto-save settings on search save:", e));
    }
}


// Проверяваме дали има токен преди да стартираме приложението
// Ако няма токен, ще изчакаме gisLoaded() да покаже login страницата
(async () => {
    const cache = await caches.open('app-cache');
    const cachedResponse = await cache.match('s');
    if (!cachedResponse) {
        initLoginPage();
        return;
    }
    const sessionToken = sessionStorage.getItem('google_auth_token');
    const localToken = localStorage.getItem('google_auth_token');
    if (sessionToken || localToken) {
        startApp();
    } else {
        // Няма токен - показваме login страницата веднага и инициализираме event listeners
        initLoginPage();
        // gisLoaded() ще инициализира Google authentication когато се зареди
    }
    // --- Selection Locking Logic ---
    // Persistent lock strategy: Lock strictly enforces selection on the active note. 
    // It remains active until the user clicks somewhere else.
    document.addEventListener('mousedown', (e) => {
        // 1. Identify target
        const note = e.target.closest('.note');
        // Exclude the boards menu (header note) from selection locking
        if (note && note.classList.contains('boards-note')) return;
        const isNoteContent = note && e.target.closest('.note-content');
        // 2. Clean up previous active state
        document.querySelectorAll('.active-selection-note').forEach(n => {
            if (n !== note) n.classList.remove('active-selection-note');
        });
        // 3. Apply logic
        if (isNoteContent) {
            // User clicked in a note content -> Lock everything else, activate this one
            document.body.classList.add('selection-locked');
            note.classList.add('active-selection-note');
        } else {
            // User clicked outside note content (e.g. background, header, footer) -> Unlock everything
            // This restores default behavior when not interacting with text.
            document.body.classList.remove('selection-locked');
            document.querySelectorAll('.active-selection-note').forEach(n => n.classList.remove('active-selection-note'));
            // If the user clicked on the note container (but not content), allow selection to clear?
            // Default browser behavior handles focus handling.
        }
    });
    // We no longer remove the lock on mouseup, because doing so allows the browser to 
    // "expand" the selection to the mouse up position if it was outside the note.
    // By keeping the lock, we force the selection to stay contained.
})();

// След успешно удостоверяване gisLoaded() ще извика startApp()

// Функция за инициализация на login страницата
async function initLoginPage() {
    document.getElementById('login-page').hidden = false;
    document.getElementById('login-page').style.display = 'block';

    // Header и search се показват чрез класа app-ready
    updateSearchPlaceholder(); // Обновяваме placeholder-а с преложения език

    // --- Button Visibility Logic (Restored & Consolidated) ---
    const loginBox = document.querySelector('.login-box');
    const authBtn = document.getElementById("authorize_button");
    const trialBtn = document.getElementById("trialBtn");

    if (loginBox) loginBox.style.display = 'block';

    let hasS = false;
    try {
        const cache = await caches.open('app-cache');
        const cachedResponse = await cache.match('s');
        hasS = !!cachedResponse;
    } catch (e) {
        console.warn("Error checking cache in initLoginPage:", e);
    }

    const licenseData = await decryptLicenseToken();
    const isLicenseExpired = hasS && !licenseData.pass;
    window.isAppErrorState = isLicenseExpired; // Mark as error state to hide assistant if needed

    // --- UI Messaging Logic ---
    const rememberMeCheck = document.getElementById('rememberMe');
    if (isLicenseExpired) {
        const loginPrompt = document.querySelector('[data-key="loginPrompt"]');
        if (loginPrompt) {
            loginPrompt.setAttribute('data-key', 'invalidCertificate');
            loginPrompt.innerHTML = _('invalidCertificate');
        }
        if (rememberMeCheck && rememberMeCheck.parentElement) {
            rememberMeCheck.parentElement.style.display = 'none';
        }
    } else {
        const loginPrompt = document.querySelector('[data-key="loginPrompt"], [data-key="invalidCertificate"]');
        if (loginPrompt) {
            loginPrompt.setAttribute('data-key', 'loginPrompt');
            loginPrompt.innerHTML = _('loginPrompt');
        }
        if (rememberMeCheck && rememberMeCheck.parentElement) {
            rememberMeCheck.parentElement.style.display = 'block';
        }
    }

    if (isOffline) {
        // Offline Mode: Show "Start Offline" only if we have data ('s') and license is still OK
        if (authBtn) {
            authBtn.textContent = (typeof _ === 'function') ? _('offlineStartButton') : "Start Offline";
            authBtn.style.display = (hasS && !isLicenseExpired) ? 'inline-block' : 'none';
            authBtn.disabled = false;
        }
        if (trialBtn) trialBtn.style.display = 'none'; // No trial in offline mode
    } else {
        // Online Mode
        if (authBtn) {
            authBtn.textContent = (typeof _ === 'function') ? _('authorizeButton') : "Authorize with Google";
            // Show Auth if we have trial started and it's not expired
            authBtn.style.display = (hasS && !isLicenseExpired) ? 'inline-block' : 'none';
            authBtn.disabled = false;
        }
        if (trialBtn) {
            // Show Trial button only if we haven't started one yet
            trialBtn.style.display = !hasS ? 'inline-block' : 'none';
            trialBtn.textContent = (typeof _ === 'function') ? _('trialButton') : "Start 30-day trial period";
        }
    }

    // Language switcher event listeners
    const switchLanguage = async (lang) => {
        localStorage.setItem('language', lang);
        if (typeof saveSettingsToGDrive === 'function') {
            try { await saveSettingsToGDrive(true); } catch (err) { console.warn('Failed to save settings on language change:', err); }
        }
        location.reload();
    };
    if (typeof renderLanguageSwitchers === 'function') renderLanguageSwitchers(switchLanguage);
    // Добавяне на действие при натискане на trial бутона
    if (trialBtn && trialBtn.parentNode) {
        // Cloning to remove any previous event listeners (simple way to avoid dupes)
        const newTrialBtn = trialBtn.cloneNode(true);
        trialBtn.parentNode.replaceChild(newTrialBtn, trialBtn);
        newTrialBtn.addEventListener("click", async (e) => {
            console.log("Trial button clicked");
            e.preventDefault(); // Предотвратяваме стандартното действие
            // 1. Взимаме токена от TRIAL_URL
            const url = new URL(TRIAL_URL);
            const trialToken = url.searchParams.get("token");
            // 2. Запазваме го в localStorage, за да е наличен след логване
            if (trialToken) {
                localStorage.setItem('urlToken', trialToken);
                sessionStorage.setItem('isTrialStart', 'true'); // Маркираме, че е стартиран пробен период
                // --- НОВО: Записваме 's' в кеша веднага, за да се знае, че е стартиран пробния период ---
                await getFirstStartEncoded(true);
            }
            // 3. Директно извикваме функцията за авторизация (вместо клик върху скрития бутон)
            console.log("Starting Google authorization...");
            handleAuthClick();
        });
    }
    // Запазваме състоянието на "Запомни ме" при промяна
    const rememberMeCheckbox = document.getElementById('rememberMe');
    if (rememberMeCheckbox) {
        rememberMeCheckbox.addEventListener('change', () => {
            localStorage.setItem('rememberMe', rememberMeCheckbox.checked);
        });
    }
    // Event listener за authorize бутона
    const authorizeBtn = document.getElementById('authorize_button');
    if (authorizeBtn) {
        authorizeBtn.addEventListener('click', handleAuthClick);
    }
    if (loginBox) loginBox.style.visibility = 'visible';
    showAppUI();
}

function updateSignoutTooltip() {
    const email = localStorage.getItem('google_login_hint') || sessionStorage.getItem('google_auth_email_hint');
    const signoutBtn = document.getElementById('signout_button');
    if (signoutBtn) {
        const baseTooltip = _('signoutButtonTooltip');
        if (email) {
            const username = email.split('@')[0];
            let tooltipText = `${baseTooltip} (${username})`;
            if (tokenRemainingDays !== null) {
                tooltipText += ` [${tokenRemainingDays}]`;
            }
            signoutBtn.title = tooltipText;
        } else {
            signoutBtn.title = baseTooltip + (tokenRemainingDays !== null ? ` [${tokenRemainingDays}]` : '');
        }
    }
}

// =================================================================================
// III. GOOGLE DRIVE АВТЕНТИКАЦИЯ И API
// =================================================================================



async function silentLoginWithIframe(loginHint) {
    const REDIRECT_URI = window.location.origin + window.location.pathname;
    return new Promise((resolve, reject) => {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&response_type=token&scope=${SCOPES}&redirect_uri=${REDIRECT_URI}&prompt=none&login_hint=${loginHint}`;
        // Слушаме за съобщения от iframe
        const messageListener = (event) => {
            // Приемаме съобщения от нашия собствен origin (след redirect)
            if (event.origin !== window.location.origin) {
                return;
            }
            const hash = event.data;
            if (hash && hash.includes('access_token')) {
                const params = new URLSearchParams(hash.substring(1)); // Премахваме #
                const accessToken = params.get('access_token');
                const expiresIn = params.get('expires_in');
                const tokenWithTimestamp = {
                    access_token: accessToken,
                    expires_in: expiresIn,
                    issued_at: Date.now()
                };
                // Обновяваме storage според rememberMe
                const rememberMe = localStorage.getItem('rememberMe') === 'true';
                const storage = rememberMe ? localStorage : sessionStorage;
                storage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                window.removeEventListener('message', messageListener);
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
                resolve(tokenWithTimestamp);
            } else {
                window.removeEventListener('message', messageListener);
                if (document.body.contains(iframe)) {
                    document.body.removeChild(iframe);
                }
                resolve(null);
            }
        };
        window.addEventListener('message', messageListener);
        document.body.appendChild(iframe);
        // Таймаут за безопасност
        setTimeout(() => {
            window.removeEventListener('message', messageListener);
            if (document.body.contains(iframe)) {
                document.body.removeChild(iframe);
            }
            resolve(null); // Връщаме null вместо reject
        }, 5000); // 5 секунди
    });

}

async function handleAuthClick() {
    if (isOffline) {
        document.getElementById('login-page').hidden = true;
        document.getElementById('login-page').style.display = 'none';
        startApp(true);
        return;
    }
    const requiredScopes = getActiveRequiredScopes();
    SCOPES = requiredScopes;
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: async (resp) => {
                if (resp.error) throw (resp);
                await authCallback(resp);
            },
            error_callback: (error) => {
                console.log("GSI Error:", error);
                alert(_('authFailed') + `\n\nError: ${error.type}`);
            }
        });
    }
    if (tokenClient) {
        const rememberMe = localStorage.getItem('rememberMe') === 'true';
        const loginHint = localStorage.getItem('google_login_hint');
        if (rememberMe && loginHint) {
            tokenClient.requestAccessToken({ hint: loginHint, scope: SCOPES });
        } else {
            tokenClient.requestAccessToken({ prompt: 'select_account', scope: SCOPES });
        }
    } else {
        console.warn("Google Identity Services not loaded. Checking for offline capability...");
        let hasS = false;
        try {
            const cache = await caches.open('app-cache');
            const cachedResponse = await cache.match('s');
            hasS = !!cachedResponse;
        } catch (e) { console.warn(e); }
        if (hasS) {
            if (confirm("Google services could not be loaded (likely due to connection issues).\n\nDo you want to start in Offline Mode?")) {
                isOffline = true;
                document.getElementById('login-page').hidden = true;
                document.getElementById('login-page').style.display = 'none';
                startApp(true);
                return;
            }
        }
        console.error("Google Identity Services not loaded.");
        alert("Google services are not loaded yet. Please check your connection and reload via F5.");
    }
}

async function checkWhitelist(delayed = false) {
    if (isOffline) return null;
    if (delayed) {
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    const isTrialStart = sessionStorage.getItem('isTrialStart') === 'true';
    const action = isTrialStart ? 'log' : 'check';
    const currentUserEmail = sessionStorage.getItem('google_auth_email_hint');
    console.log('>>> Executing whitelist check (action: ' + action + ')...');
    console.log('>>> Email for whitelist:', currentUserEmail);
    if (!currentUserEmail) return null;

    const url = 'https://script.google.com/macros/s/AKfycbzYpXGxlfFyyOuPY7gmKanmEPF2mXTCsqefNAtvsfNvym4lJApiHEwGTJCoYAHGaz25Uw/exec';
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                mode: 'cors',
                credentials: 'omit',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    email: currentUserEmail,
                    action: action
                })
            });
            if (response.ok) {
                const data = await response.json();
                console.log('>>> Whitelist response:', data);
                if (isTrialStart) {
                    sessionStorage.removeItem('isTrialStart');
                    console.log('>>> Trial registered for:', currentUserEmail);
                }
                return data;
            }
            console.log(`>>> Whitelist check attempt ${attempt} HTTP status: ${response.status}`);
        } catch (err) {
            console.log(`>>> Whitelist check attempt ${attempt} network error:`, err.message || err);
        }
        if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 1500));
        }
    }
    return null;
}

async function checkAuth(isExplicitLogin = false) {
    console.log("checkAuth");
    const searchInput = document.getElementById('search-box');
    if (searchInput) {
        const val = searchInput.value.trim();
        // По-толерантен regex: приема ?token= или само token=
        const tokenMatch = val.match(/^\??token=(.+)$/);
        if (tokenMatch) {
            const tokenValue = tokenMatch[1].trim();
            if (tokenValue) {
                localStorage.setItem('urlToken', tokenValue);
                searchInput.value = '';
                cachedLicenseData = null; // Изчистваме кеша за лиценза
                if (saveSearchBtn) saveSearchBtn.style.display = 'none';
            }
        }
    }
    const sessionToken = sessionStorage.getItem('google_auth_token');
    const localToken = localStorage.getItem('google_auth_token');
    const storedTokenString = sessionToken || localToken;
    if (isOffline && (storedTokenString || isExplicitLogin)) return { pass: true };
    if (!storedTokenString) {
        await initLoginPage();
        window.authListenersAdded = true;
        return { pass: false };
    }
    const tokenData = JSON.parse(storedTokenString);
    if (isSyncSuspended) {
        console.log("Sync suspended: staying in local mode, skipping token refresh attempts.");
        return { pass: true, syncSuspended: true, tokenData: tokenData };
    }
    if (window.gapi && window.gapi.client && tokenData.access_token) window.gapi.client.setToken(tokenData);
    tokenData.email_hint = sessionStorage.getItem('google_auth_email_hint');
    const isExpired = (Date.now() - tokenData.issued_at) / 1000 > (tokenData.expires_in - 60);
    if (isExpired) {
        console.log("Token expired. Attempting silent refresh...");
        try {
            let refreshResult = await refreshAuthToken(false, true);
            if (refreshResult && refreshResult.pass) return refreshResult;
        } catch (silentErr) {
            console.warn("Silent refresh failed, opening interactive popup...", silentErr);
        }
        // Ако тихият refresh не стане, ВЕДНАГА отваряме попъпа за автентикация
        try {
            let popupResult = await refreshAuthToken(true, true);
            if (popupResult && popupResult.pass) return popupResult;
        } catch (popupErr) {
            console.warn("Interactive auth popup failed or was closed:", popupErr);
        }

        // Ако и попъпът се провали: ако има локални данни в IndexedDB, продължаваме в локален режим
        if (useIndexedDb) {
            try {
                if (dbExists === null || typeof dbExists === 'undefined') {
                    dbExists = await checkDbExists(NOTES_DB_NAME);
                }
                if (dbExists) {
                    const boardsInDb = await getAllFromDB(BOARD_STORE_NAME);
                    if (boardsInDb && boardsInDb.length > 0) {
                        isSyncSuspended = true;
                        console.warn("Session expired, but local data exists. Entering local mode with suspended sync.");
                        if (typeof showToast === 'function') {
                            showToast(_('syncSuspendedTooltip') || "Синхронизацията е спряна. Кликнете върху бутона за режим, за да влезете отново.", 6000);
                        }
                        updateModeButton();
                        return { pass: true, syncSuspended: true, tokenData: tokenData };
                    }
                }
            } catch (dbErr) {
                console.warn("Could not inspect IndexedDB for optimistic start:", dbErr);
            }
        }
        // Няма локални данни — почистваме изтеклия токен и показваме логин формата
        sessionStorage.removeItem('google_auth_token');
        localStorage.removeItem('google_auth_token');
        initLoginPage();
        return { pass: false };
    }
    const licenseData = await decryptLicenseToken();
    tokenRemainingDays = licenseData.remainingDays;
    pass = licenseData.pass;
    if (licenseData.pass) {
        console.log(`tokenRemainingDays: ${tokenRemainingDays}`);
        if (typeof updateSignoutTooltip === 'function') updateSignoutTooltip();
    } else {
        console.warn("License required. Showing login page.");
        initLoginPage();
        return null;
    }
    return { tokenData, pass };
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

async function loadGoogleApis() {
    if (isOffline) return;
    if (typeof gapi !== 'undefined' && gapi.client) return;
    try {
        await loadScript('https://apis.google.com/js/api.js');
        await new Promise(resolve => gapi.load('client', resolve));
        await gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
    } catch (error) {
        throw new Error(_('errorGoogleLibs'));
    }
}

function handleSignoutClick() {
    // Премахваме ключовете, свързани с удостоверяването
    localStorage.removeItem('google_auth_token');
    sessionStorage.removeItem('google_auth_token');
    sessionStorage.removeItem('google_auth_email_hint');
    localStorage.removeItem('google_login_hint');
    clearCachedMainFolderId();
    localStorage.removeItem('gdrive_folder_id_Other');
    localStorage.removeItem('gdrive_folder_id_Sound');
    localStorage.removeItem('gdrive_folder_id_Video');
    localStorage.removeItem('gdrive_folder_id_Images');
    sessionStorage.setItem('logout_flag', 'true');
    window.location.reload();
}

/**
 * Изчиства старото състояние и изтрива старата локална база при смяна на акаунта.
 */
async function handleAccountSwitchReset(previousEmail, newEmail) {
    console.warn(`[AccountSwitch] Account changed from ${previousEmail} to ${newEmail}. Resetting state and deleting old local database.`);
    localStorage.removeItem('active_folder_name');
    clearCachedMainFolderId();
    localStorage.removeItem('initial_setup_complete');
    localStorage.removeItem('settings_multinotes_data');
    localStorage.removeItem('gdrive_folder_names');
    sessionStorage.removeItem('first_run_lock');
    ['Other', 'Sound', 'Video', 'Images'].forEach(name => localStorage.removeItem(`gdrive_folder_id_${name}`));
    activeFolderName = 'AppDataFolder';
    cachedMainFolderId = null;
    folderIds = {};
    allNotesData = [];
    boardsData = [];
    mediaData = [];
    if (typeof noteBgCache !== 'undefined' && noteBgCache && noteBgCache.clear) {
        noteBgCache.clear();
    }
    try {
        await deleteNotesDB();
        dbExists = false;
        boardsInDb = [];
        notesInDb = [];
    } catch (e) {
        console.warn('Error deleting old NotesDB on account switch:', e);
    }
}

// =================================================================================
// IV. ЧЕТЕНЕ НА ДАННИ ОТ GOOGLE DRIVE
// =================================================================================
// --- GDrive Data Loading logic moved to load.js ---
/**
 * Проверява дали текущият потребител съвпада със собственика на локалната база данни.
 * Ако има несъответствие, нулира старата база за новия потребител.
 */
async function userCheck() {
    if (!dbExists) {
        isDbOwner = true;
        return;
    }
    const storedUserEmail = await getConfig('userEmail');
    const currentUserEmail = sessionStorage.getItem('google_auth_email_hint') || localStorage.getItem('google_login_hint');
    if (storedUserEmail && currentUserEmail && storedUserEmail.toLowerCase() !== currentUserEmail.toLowerCase()) {
        await handleAccountSwitchReset(storedUserEmail, currentUserEmail);
        isDbOwner = true;
    } else {
        isDbOwner = true;
        const dbFolderName = await getConfig('dbCreatedFolderName');
        if (dbFolderName && !localStorage.getItem('active_folder_name')) {
            localStorage.setItem('active_folder_name', dbFolderName);
            activeFolderName = dbFolderName;
        }
    }
}

/**
 * Обработва случая на несъответствие на потребители.
 * Показва съобщение и заключва настройките за управление на данни.
 */
async function handleUserMismatch(storedUser) {
    // --- КОРЕКЦИЯ: Добавяме динамичен източник към съобщението ---
    let sourceName = '';
    if (localStorage.getItem('useGoogleDb') !== 'false') {
        sourceName = _('sourceGoogleDrive');
    } else if (localStorage.getItem('useLocalDb') === 'true') {
        sourceName = _('sourceLocalFolder');
    } else if (localStorage.getItem('useArhDb') === 'true') {
        sourceName = _('sourceArchive');
    } else {
        // Fallback, ако нищо не е избрано, въпреки че не би трябвало да се случва
        sourceName = _('sourceGoogleDrive');
    }
    showToast(_('userMismatchWarning').replace('{user}', storedUser).replace('{source}', sourceName), 15000);
    // Принудително превключваме към режим "Google Drive" без IndexedDB
    localStorage.setItem('useIndexedDb', 'false');
    localStorage.setItem('useGoogleDb', 'true');
    localStorage.setItem('useLocalDb', 'false');
    localStorage.setItem('useArhDb', 'false'); // Добавяме и архива
    updateGlobalStateFlags();
    updateModeButton();
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
    googleDbCheckbox.checked = true; // Маркираме го
    // --- КОРЕКЦИЯ: Заключваме и него, за да е ясно, че режимът е принудителен ---
    // googleDbCheckbox.disabled = false; // Оставяме го активно, но заключено
    // googleDbCheckbox.disabled = true;
}

/**
 * Активира контролите в настройките, които може да са били деактивирани
 * от `handleUserMismatch`. Извиква се след изтриване на базата данни.
 */
function enableSettingsControls() {
    const settingsModal = document.getElementById('settings-modal');
    if (!settingsModal) return;
    const controlsToEnable = [
        'use-indexeddb-checkbox', 'use-local-db-checkbox', 'use-arh-db-checkbox',
        'create-db-btn', 'select-folder-btn', 'select-arh-btn'
    ];
    controlsToEnable.forEach(id => {
        const el = settingsModal.querySelector(`#${id}`);
        if (el) {
            el.disabled = false;
        }
    });
    // Активираме и акордеона за разширени настройки
    const accordionHeader = settingsModal.querySelector('.accordion-header');
    if (accordionHeader) {
        accordionHeader.style.pointerEvents = 'auto';
        accordionHeader.style.opacity = '1';
    }
    console.log("Settings controls have been re-enabled after DB deletion.");
}

/**
 * Създава или пресъздава цялата база данни от данните, заредени в паметта.
 * @returns {Promise<boolean>} Връща true при успех и false при грешка.
 */
async function createDatabaseFromMemory({ suppressEmptyDataToast = false } = {}) {
    if (boardsData.length === 0 && allNotesData.length === 0) {
        if (!suppressEmptyDataToast) showToast(_('dbCreateFailedNoData'), 10000);
        return false;
    }
    try {
        // --- КЛЮЧОВА КОРЕКЦИЯ: Осигуряваме gdid за IndexedDB (особено за архиви) ---
        // Тъй като базата използва 'gdid' като keyPath, ако полето е празно (както е в архивите),
        // всички записи ще се презаписват един друг.
        const ensureGdid = (data) => data.map(item => {
            // АКО СМЕ В РЕЖИМ АРХИВ: Винаги използваме цифровия 'id' като основен ключ 'gdid' за базата.
            // Това гарантира, че връзките в архива ще работят правилно в IndexedDB.
            // if (useArhDb && item.id !== undefined) {
            //    return { ...item, gdid: String(item.id) };
            // }
            // ЗА ДРУГИ РЕЖИМИ: Само ако gdid липсва, ползваме id като резервен вариант.
            if ((!item.gdid || item.gdid === "") && item.id !== undefined) {
                return { ...item, gdid: String(item.id) };
            }
            return item;
        });
        // Почистване на временни полета преди запис
        const cleanItem = (item) => {
            const cleaned = { ...item };
            delete cleaned.noteCount;
            delete cleaned.reminderNoteCount;
            delete cleaned.calendarNoteCount;
            return cleaned;
        };
        const preparedBoards = ensureGdid(boardsData).map(cleanItem);
        const preparedMedia = ensureGdid(mediaData);
        const preparedNotes = ensureGdid(allNotesData);
        await bulkPutDB(BOARD_STORE_NAME, preparedBoards);
        await bulkPutDB(MEDIA_STORE_NAME, preparedMedia);
        await bulkPutDB(NOTE_STORE_NAME, preparedNotes);
        const currentUserEmail = sessionStorage.getItem('google_auth_email_hint');
        if (currentUserEmail) {
            await saveConfig('userEmail', currentUserEmail);
        }
        // ЗАПИСВАМЕ ТИПА НА ВРЪЗКАТА (КЛЮЧОВА СТЪПКА) - използваме глобалните флагове
        const noteIdType = useArhDb ? 'id' : 'gdid';
        await saveConfig('dbNoteIdType', noteIdType);
        const dbSource = useArhDb ? 3 : (useLocalFolder ? 2 : 1);
        // Запазваме timestamp само за източника, от който създаваме базата.
        // Ако е от архив, не записваме нищо, за да може следващата синхронизация да е пълна.
        const now = Date.now();
        if (dbSource === 1) { // Google Drive
            await saveConfig('lastGDTimestamp', now); // В IndexedDB
        } else if (dbSource === 2) { // Local Folder
            await saveConfig('lastLocalTimestamp', now);
        }
        await saveConfig('dbSource', dbSource);
        await saveConfig('dbCreatedFolderName', activeFolderName);
        // Записваме кога е създадена базата
        await saveConfig('dbCreatedTimestamp', now);
        // --- IMMEDIATELY UPDATE GLOBALS FOR CURRENT SESSION ---
        dbSourceGlobal = dbSource;
        dbNoteIdTypeGlobal = noteIdType;
        console.log(`[createDatabaseFromMemory] Session globals updated: Source=${dbSourceGlobal}, IdType=${dbNoteIdTypeGlobal}`);
        dbExists = true; // Маркираме, че базата вече съществува
        return true;
    } catch (error) {
        console.log("Failed to create/recreate DB from memory:", error);
        return false;
    }
}
/**
 * Проверява дали е първото стартиране и настройва приложението.
 * 1. Създава борд Main в CX-Notes и го задава като стартов борд
 * 2. Създава folders.json
 * 3. Задава активна папка (CX-Notes или multinotes_data)
 * 4. Създава folders.json и settings.json с профил Default
 * @returns {boolean} true ако е извършена първоначална настройка, false ако не е необходима
 */
async function handleFirstRunSetup() {
    if (isOffline) return false;
    if (localStorage.getItem('initial_setup_complete') === 'true' || sessionStorage.getItem('first_run_lock')) return false;
    if (localStorage.getItem('gdrive_folder_names') || localStorage.getItem('active_folder_name')) {
        localStorage.setItem('initial_setup_complete', 'true');
        return false;
    }
    const hasLocalSettings = localStorage.getItem('settings_multinotes_data');
    if (hasLocalSettings) return false;
    const isFreshLocalSetup = localStorage.getItem('initial_setup_complete') !== 'true';
    sessionStorage.setItem('first_run_lock', 'true');
    try {
        const appSettingsFolderId = await getAppSettingsFolderId();
        if (!appSettingsFolderId) return false;
        const settingsFiles = await findGDFileByName(appSettingsFolderId, 'settings.json');
        const foldersFiles = await findGDFileByName(appSettingsFolderId, 'folders.json');
        if ((settingsFiles && settingsFiles.length > 0) || (foldersFiles && foldersFiles.length > 0)) {
            if (isFreshLocalSetup) {
                let folderNames = [];
                try {
                    const savedFolderNames = JSON.parse(localStorage.getItem('gdrive_folder_names') || '[]');
                    folderNames = Array.isArray(savedFolderNames) ? savedFolderNames : [];
                } catch (e) {
                    console.warn('[FirstRun] Invalid saved folder list:', e);
                }
                const multinotesId = await getFolderIDByName('multinotes_data');
                if (!multinotesId) {
                    activeFolderName = 'CX-Notes';
                    localStorage.setItem('active_folder_name', activeFolderName);
                    clearCachedMainFolderId();
                    cachedMainFolderId = null;
                    const normalizedFolderNames = folderNames.includes('multinotes_data')
                        ? folderNames.filter(name => name !== 'multinotes_data')
                        : folderNames;
                    if (!normalizedFolderNames.includes('CX-Notes')) normalizedFolderNames.push('CX-Notes');
                    localStorage.setItem('gdrive_folder_names', JSON.stringify(normalizedFolderNames));
                    const loaderFolderInfo = document.getElementById('loader-folder-info');
                    if (loaderFolderInfo) loaderFolderInfo.textContent = `(${activeFolderName})`;
                    if (typeof showToast === 'function') showToast(_('firstRunAppDataFolderSelected'), 7000);
                } else {
                    setCachedMainFolderId('multinotes_data', multinotesId);
                }
            }
            localStorage.setItem('initial_setup_complete', 'true');
            return false;
        }
    } catch (e) {
        console.warn('[FirstRun] Error checking AppSettings:', e);
        return false;
    }
    console.log('[FirstRun] First-time setup detected. Starting initial configuration...');
    if (typeof loaderText !== 'undefined') loaderText.textContent = _('firstRunSetup');
    let chosenFolder = 'CX-Notes';
    let multinotesFound = false;
    let multinotesId = null;
    let userChoice = 'fresh';
    try {
        multinotesId = await getFolderIDByName('multinotes_data');
        if (multinotesId) {
            multinotesFound = true;
            setCachedMainFolderId('multinotes_data', multinotesId);
        }
    } catch (e) {
        console.warn('[FirstRun] Error checking for multinotes_data:', e);
    }
    activeFolderName = chosenFolder;
    localStorage.setItem('active_folder_name', chosenFolder);
    cachedMainFolderId = null;
    const loaderFolderInfo = document.getElementById('loader-folder-info');
    if (loaderFolderInfo) loaderFolderInfo.textContent = `(${activeFolderName})`;
    console.log('[FirstRun] Active folder selected:', chosenFolder);
    const folderNames = ['CX-Notes'];
    if (multinotesFound) folderNames.push('multinotes_data');
    localStorage.setItem('gdrive_folder_names', JSON.stringify(folderNames));
    if (userChoice === 'copy' && multinotesId) {
        try {
            console.log('[FirstRun] Copying data from multinotes_data to CX-Notes...');
            if (typeof loaderText !== 'undefined') loaderText.textContent = _('migratingData') || 'Copying data...';
            let targetFolderId = await getFolderIDByName('CX-Notes');
            if (!targetFolderId) {
                targetFolderId = await createNewGDriveFolder('CX-Notes');
            }
            const result = await fetchAllData(multinotesId, false);
            if (result && !result.error && targetFolderId) {
                // Изчистваме съществуващите бордове в CX-Notes, за да избегнем дубликати
                try {
                    const existingBoards = await findGDFileByName(targetFolderId, 'board.txt');
                    if (existingBoards && existingBoards.length > 0) {
                        console.log(`[FirstRun] Deleting ${existingBoards.length} existing board(s) in CX-Notes before copy...`);
                        for (const b of existingBoards) {
                            await deleteGDriveFile(b.id);
                        }
                    }
                } catch (e) {
                    console.warn('[FirstRun] Error cleaning existing boards:', e);
                }
                const migrationSuccess = await migrateDataToNewFolder(targetFolderId);
                if (migrationSuccess) {
                    cachedMainFolderId = targetFolderId;
                    setCachedMainFolderId('CX-Notes', targetFolderId);
                    console.log('[FirstRun] Data copied successfully to CX-Notes.');
                    if (typeof showToast === 'function') showToast(_('migrationSuccess'), 5000);
                } else {
                    console.error('[FirstRun] Migration failed, falling back to fresh start.');
                    userChoice = 'fresh';
                }
            } else {
                console.error('[FirstRun] Could not load data from multinotes_data, falling back to fresh start.');
                userChoice = 'fresh';
            }
        } catch (e) {
            console.error('[FirstRun] Error copying data from multinotes_data:', e);
            userChoice = 'fresh';
        }
    }
    if (chosenFolder === 'CX-Notes' && userChoice !== 'copy') {
        try {
            console.log('[FirstRun] Creating Main board in CX-Notes...');
            let targetFolderId = await getFolderIDByName('CX-Notes');
            if (!targetFolderId) {
                targetFolderId = await createNewGDriveFolder('CX-Notes');
            }
            if (targetFolderId) {
                cachedMainFolderId = targetFolderId;
                setCachedMainFolderId('CX-Notes', targetFolderId);
                const existingMainBoards = await findGDFileByName(targetFolderId, 'board.txt');
                if (existingMainBoards && existingMainBoards.length > 0) {
                    console.log('[FirstRun] Main board already exists in CX-Notes');
                    localStorage.setItem('startBoard_CX-Notes', existingMainBoards[0].id);
                } else {
                    const now = Date.now();
                    boardIdCounter = 1;
                    localStorage.setItem('boardIdCounter', '1');
                    const boardToSave = {
                        "backcolor": 0, "backnum": 0, "backpath": "", "color": "#4CAF50",
                        "colorfont": "#000", "datemod": now, "gdid": "", "id": 1,
                        "numord": 1, "status": 0, "title": "Main"
                    };
                    const gdid = await createGDriveFile(targetFolderId, 'board.txt', JSON.stringify(boardToSave));
                    if (gdid) {
                        boardToSave.gdid = gdid;
                        await updateGDriveFile(gdid, JSON.stringify(boardToSave));
                        console.log('[FirstRun] Main board created in CX-Notes');
                        localStorage.setItem('startBoard_CX-Notes', gdid);
                    }
                }
            }
        } catch (e) {
            console.error('[FirstRun] Error creating Main board in CX-Notes:', e);
        }
    }
    try {
        if (typeof boardsData !== 'undefined' && boardsData.length === 0) {
            const startBoardId = localStorage.getItem('startBoard_' + chosenFolder) || localStorage.getItem('startBoard_CX-Notes') || localStorage.getItem('startBoard_AppDataFolder');
            if (startBoardId) {
                boardsData = [{ id: 1, title: 'Main', gdid: startBoardId, numord: 1 }];
            }
        }
        await syncGlobalFoldersJson();
        console.log('[FirstRun] folders.json created.');
    } catch (e) {
        console.warn('[FirstRun] Error creating folders.json:', e);
    }
    try {
        await saveSettingsToGDrive(true);
        console.log('[FirstRun] settings.json created with Default profile.');
    } catch (e) {
        console.warn('[FirstRun] Error creating settings.json:', e);
    }
    if (typeof showToast === 'function') showToast(_('firstRunComplete'), 5000);
    localStorage.setItem('initial_setup_complete', 'true');
    console.log('[FirstRun] First-time setup complete.');
    return true;
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

function areBoardsIdentical(memBoards, dbBoards) {
    if (!memBoards || memBoards.length === 0 || !dbBoards || dbBoards.length === 0) return true; // Празни данни не са несъответствие в този контекст

    const dbGdidSet = new Set(dbBoards.map(b => String(b.gdid)));
    const dbTitleSet = new Set(dbBoards.map(b => String(b.title || '').trim().toLowerCase()));

    // Проверяваме дали всички бордове от паметта присъстват в базата
    for (const mb of memBoards) {
        const memGdid = mb.gdid ? String(mb.gdid) : (mb.id !== undefined ? String(mb.id) : null);
        const memTitle = String(mb.title || '').trim().toLowerCase();

        if (memGdid !== null && !dbGdidSet.has(memGdid) && !dbTitleSet.has(memTitle)) {
            console.warn(`Mismatch: Memory board "${mb.title}" (ID: ${memGdid}) not in DB.`);
            return false;
        }
    }

    // Проверяваме и обратното (само ако имаме бордове в базата)
    if (dbBoards.length > 0) {
        const memGdidSet = new Set(memBoards.map(mb => mb.gdid ? String(mb.gdid) : (mb.id !== undefined ? String(mb.id) : null)));
        const memTitleSet = new Set(memBoards.map(mb => String(mb.title || '').trim().toLowerCase()));

        for (const db of dbBoards) {
            const dbGdid = String(db.gdid);
            const dbTitle = String(db.title || '').trim().toLowerCase();
            if (!memGdidSet.has(dbGdid) && !memTitleSet.has(dbTitle)) {
                console.warn(`Mismatch: DB board "${db.title}" (GDID: ${dbGdid}) not in memory.`);
                return false;
            }
        }
    }

    return true;
}

/**
 * Актуализира иконата и tooltip-а на бутона за режим, за да покаже текущия източник на данни.
 */
function updateModeButton() {
    // Тази функция се извиква преди mainLogic, затова трябва да прочете актуалните стойности.
    const currentUseGoogleDb = localStorage.getItem('useGoogleDb') !== 'false';
    const currentUseLocalFolder = localStorage.getItem('useLocalDb') === 'true';
    const currentUseArhDb = localStorage.getItem('useArhDb') === 'true';
    const currentUseIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
    const modeButton = document.getElementById('mode_button');
    if (!modeButton) return;
    let iconWrapper = modeButton.querySelector('.mode-icon-wrapper');
    if (!iconWrapper) {
        iconWrapper = document.createElement('div');
        iconWrapper.className = 'mode-icon-wrapper';
        modeButton.prepend(iconWrapper);
    }
    let iconSrc = '';
    let title = '';
    // --- РАЗШИРЕНА ЛОГИКА: Проверяваме за всяка комбинация с база данни ---
    const isCombinedWithDb = currentUseIndexedDb && (currentUseGoogleDb || currentUseLocalFolder || currentUseArhDb);

    if (!modeButton.querySelector('#mode-button-loading-icon')) {
        const loadingIcon = document.createElement('img');
        loadingIcon.src = 'Refresh.png';
        loadingIcon.id = 'mode-button-loading-icon';
        modeButton.appendChild(loadingIcon);
    }

    if (isOffline) {
        iconSrc = 'Database.png';
        title = _('offlineMode') || "Offline Mode";
        // Ensure overlay is hidden in offline mode unless we want to show it's disabled?
        // For now, let's keep it simple or maybe show a 'OFF' overlay?
    } else if (isCombinedWithDb) {
        // Когато имаме комбинация, базата е основна
        iconSrc = 'Database.png';
        if (currentUseGoogleDb) title = _('modeDbAndDrive');
        else if (currentUseLocalFolder) title = _('modeDbAndLocal');
        else if (currentUseArhDb) title = _('modeDbAndArchive');
    } else if (currentUseArhDb) {
        iconSrc = 'Zip.png';
        title = _('modeArchiveTitle');
    } else if (currentUseLocalFolder) {
        iconSrc = 'Folder.png';
        title = _('modeLocalTitle');
    } else if (currentUseGoogleDb) {
        iconSrc = 'GDrive.png';
        title = _('modeDrive');
    } else if (currentUseIndexedDb) {
        iconSrc = 'Database.png';
        title = _('modeDb');
    } else {
        // Fallback: Ако няма избран източник
        iconSrc = 'Database.png';
        title = _('noData');
    }
    iconWrapper.innerHTML = '';
    const mainIcon = document.createElement('img');
    mainIcon.src = iconSrc;
    mainIcon.alt = title;
    mainIcon.style.width = '24px';
    mainIcon.style.height = '24px';
    iconWrapper.appendChild(mainIcon);
    // Добавяме иконата за наслагване
    let overlaySrc = '';
    let overlayAlt = '';
    if (isOffline) {
        // overlaySrc = 'Offline.png'; overlayAlt = 'Offline Mode';
        overlaySrc = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAsTAAALEwEAmpwYAAAERElEQVR4nO2YW2hcVRSGT1pFBS/4JGqb2WsSSGIlFWvO6IMo1JkMSuYkMTU++OKlVIvYh0LVGIngrdpWDZ21xlFRES8Y6YsXUoIKal8KovggUvGCivUWSmatSYXmsmWfSew0c+bMmWQymYH5YcPMnL33Wd/Ze/9rnbGshhpaHdmxvs1WvSoSSzxpxxKzkXjPHVY9Bh/pdrRpdQfRFXWucoNeAHAhup2ZSMwZtOpFdjyxzQ06H6LeVsJuQNQRxMaD05cplEEg2atIDinib4BkEkiyQKIXmvk8aa6ZPkDyTIjk9g2p6cvXCMKZu3LXq+MK5Ye8IJfbfgTiF0KUudbSuql6EPE+3TE0vtLg9ZL2E5Dsbh2dvLBiwV+R/Ot8QHm8/ZGJbCTer6sAoRVJRqE8HU6fuGj5kWvdBCTbFPIvixO3D3+sqwUBuTapUHZZY3p9WbE3p7OXKuQJr0mLQWza/c5RQH7YQANOdzXTVNjMAy/LJe7ng9mrw8j9CnmPIn5bEf9Wxop8oZInQ4GCD2PmFkXyt9+EBsKO982v1GJb01MtBnrBufwhUKaM2/lOqEgeAOK5EhMdAcz0dN3ce1sl80QLTW8B5DcU8YwvDPKop1sByrMlAj8aejFz3WonO5XKbgbiT0tAvF5wLlSKdwDyvMeArLlWzKO9LbZXdzz0YRaQZ91GckKhfA/E40C8TyXZaaapi/1ATKIz47wB5LEi9EsgkL9SlGnz7Dym10OSBxTJ+21DEzPlupNCPqWQPzL7+oYRfZbXLVrw5EYg+SxQ8IsC5Lvdc4B8uO2Vfy4o6DCi16kkb89l0NLuFMRilbFq5J1eIOY3IEnn3IhHrCAKpeRGL+819gjEX/u504ryBMq3QHx9QUBaN4WTstVatkb0OiAeMsteKoiVQ/CsInmq2LYqW62j+hxAfjfAjf81e9qAdm7fv9eOOWe+2cWcuc776E1F8p7x9ADzHfbcwuXKOEYRd1rIkiYJZe5aWoD5Waz7UIhvVSif+54N436VkJfFKuJfjdX5lcB2NDFQKk9ASqK5vR/QKisBoZDfClopBoEIvabPBeTnVy34fAhF/GCx6znf5nvcYg3liEleiuRYx54PvrPjvSVrpzBm7lTEj1rVFqB0AsmY31lpH/6k0J1ia/yO7S49yUt+gdcsxIYD+jxF/GUgb69VCFgsO+oZQhVYLP9hSvNQMhtvScqmEHIHkNykSJ4AlJ/zIezu3rmagAgh3+tWl8TDZmsV67clrc+GlNxvsrbJ2HYAi62azB9cy+lr1xLEcmXXGsTpzGrOAx9XxM+Z3+oGAvLLgtO104FS4+xagXCffOFb159Bxtq1AOEFAMS/Bx1vrzWE2S4eAPvKmSMScwaXQkS6E6eu2doftlZb5sC6EMjH3UOMvN+8xJQ7j33mSsxH4s5Oq95kRxMD5snXZfCLsqM98P+XhhqyKqr/AEJezD2/ik84AAAAAElFTkSuQmCC'; overlayAlt = 'Offline Mode';
    } else if (isCombinedWithDb) {
        if (currentUseGoogleDb) {
            overlaySrc = 'GDrive.png'; overlayAlt = 'Google Drive Sync';
        } else if (currentUseLocalFolder) {
            overlaySrc = 'Folder.png'; overlayAlt = 'Local Folder Sync';
        } else if (currentUseArhDb) {
            overlaySrc = 'Zip.png'; overlayAlt = 'Archive Source';
        }
    }
    if (overlaySrc) {
        const overlay = document.createElement('div');
        overlay.className = 'mode-db-overlay';
        const filterStyle = isOffline ? ' style="filter: brightness(0);"' : '';
        overlay.innerHTML = `<img src="${overlaySrc}" alt="${overlayAlt}"${filterStyle}>`;
        iconWrapper.appendChild(overlay);
    }
    if (isSyncSuspended) {
        title = (_('syncSuspendedTooltip') || 'Синхронизацията е спряна. Кликнете за свързване.');
        iconWrapper.style.position = 'relative';
        const warnBadge = document.createElement('span');
        warnBadge.textContent = '⚠️';
        warnBadge.style.cssText = 'position:absolute;bottom:-4px;right:-4px;font-size:12px;line-height:1;';
        iconWrapper.appendChild(warnBadge);
    }
    modeButton.title = title;
}

/**
 * Обновява глобалните променливи за режим на работа от localStorage.
 * Извиква се, за да се синхронизира състоянието на приложението с настройките.
 */
function updateGlobalStateFlags() {
    useGoogleDb = localStorage.getItem('useGoogleDb') !== 'false'; // true по подразбиране
    useLocalFolder = localStorage.getItem('useLocalDb') === 'true';
    useArhDb = localStorage.getItem('useArhDb') === 'true';
    useIndexedDb = localStorage.getItem('useIndexedDb') !== 'false'; // true по подразбиране
    automatedTimer = localStorage.getItem('automatedTimer') !== 'false'; // true по подразбиране
    updateLocalFolder = localStorage.getItem('updateLocalFolder') === 'true';
}

/**
 * Проверява дали е избран поне един източник на данни.
 * Ако не е, показва съобщение и отваря настройките.
 * @returns {boolean} Връща true, ако има избран източник, и false, ако няма.
 */
function validateDataSourceSelection() {
    if (!useGoogleDb && !useLocalFolder && !useArhDb && !useIndexedDb) {
        showToast(_('errorNoDataSourceSelected'), 15000);
        document.getElementById('settings-modal').classList.add('visible');
        const advancedSettingsSpan = document.getElementById('advanced-settings-span');
        if (advancedSettingsSpan) {
            advancedSettingsSpan.removeAttribute('hidden');
            localStorage.setItem('showAdvancedSettings', 'true');
        }
        setTimeout(() => {
            const accordionHeader = document.querySelector('.accordion-header');
            const advancedSettingsContent = document.getElementById('advanced-settings');
            if (advancedSettingsContent && advancedSettingsContent.style.display === 'none' && accordionHeader) {
                accordionHeader.click();
            }
        }, 100);

        if (typeof updateAdvancedSettingsVisibility === 'function') updateAdvancedSettingsVisibility();

        loaderContainer.style.display = 'none'; // Скриваме лоудъра
        // Изчистваме осиротели файлове при старт
        // cleanupOrphanedImages();
        return false; // Сигнализираме, че проверката е неуспешна
    }
    return true; // Всичко е наред
}

/**
 * Отчита проблеми с целостта на данните (липсващи или дублирани ID-та).
 */
async function goOffline() {
    if (isOfflineChecked) return;
    isOfflineChecked = true;
    let hasS = false;
    try {
        const cache = await caches.open('app-cache');
        const cachedResponse = await cache.match('s');
        hasS = !!cachedResponse;
    } catch (e) {
        console.warn("Error checking app-cache for 's':", e);
    }
    if (isOffline) return;

    let reallyOnline = true;
    if (!navigator.onLine && hasS) {
        try {
            const response = await fetch('/favicon.ico?_=' + new Date().getTime(), { method: 'HEAD', cache: 'no-store' });
            reallyOnline = response.ok;
        } catch (e) {
            reallyOnline = false;
        }
    }

    if (!reallyOnline && hasS) {
        isOffline = true;
        console.warn("Working in offline mode (s-record found).");
        if (document.querySelector('.login-box')) {
            document.querySelector('.login-box').style.display = 'block';
        }
        if (dbExists) {
            try {
                const boardsInDb = await getAllFromDB(BOARD_STORE_NAME);
                if (boardsInDb && boardsInDb.length > 0) {
                    localStorage.setItem('useIndexedDb', 'true');
                    localStorage.setItem('useGoogleDb', 'false');
                    localStorage.setItem('forceGDriveRead', 'false');
                    updateGlobalStateFlags();
                }
            } catch (e) {
                console.error("Error checking DB in goOffline:", e);
            }
        }
    } else {
        isOffline = false;
    }
}

function reportDataIntegrityIssues() {
    if (dataIntegrityIssues.length === 0) return;
    const duplicates = dataIntegrityIssues.filter(i => i.type === 'duplicate');
    const missing = dataIntegrityIssues.filter(i => i.type === 'missing');
    console.group('%c Data Integrity Report ', 'background: #f44336; color: white; font-weight: bold;');
    if (duplicates.length > 0) {
        console.warn(`Found ${duplicates.length} duplicate IDs. IndexedDB will only keep the LAST version of each.`);
        duplicates.forEach(d => {
            console.log(` - ID: ${d.gdid} | Mode: ${d.mode || 'direct'} | Files: [${d.file1}] and [${d.file2}]`);
        });
    }
    if (missing.length > 0) {
        console.warn(`Found ${missing.length} items missing an ID property. These were likely skipped.`);
        missing.forEach(m => {
            console.log(` - File: ${m.file} | Mode: ${m.mode || 'direct'} | Content: "${(m.text || '').substring(0, 50)}..."`);
        });
    }
    console.groupEnd();
    // Show a small toast if there are many issues
    if (duplicates.length > 0) {
        let previewText = '';
        // Find the content of the first duplicate to show as a hint
        const firstDupId = duplicates[0].gdid;
        const dupNote = allNotesData.find(n => n.gdid === firstDupId);
        if (dupNote) {
            const content = dupNote.notetxt || dupNote.text || '';
            previewText = content.substring(0, 50).replace(/\n/g, ' ');
            if (content.length > 50) previewText += '...';
        }
        const msg = `${_('duplicateNotes')}: ${duplicates.length}. ${_('content')}: "${previewText}"`;
        showToast(msg, 10000);
    }
}

/**
 * Филтрира бележките, за да остави само по 5 за всеки борд (за демо версия).
 */
function filterNotesForDemo() {
    if (!DEMO_MODE) return; // Изпълнява се само ако демо флагът е активен
    console.log("DEMO MODE: Filtering notes to 5 per board.");
    if (!boardsData || boardsData.length === 0 || !allNotesData || allNotesData.length === 0) {
        return;
    }
    const filteredNotes = new Set();
    const isArh = useArhDb || (useIndexedDb && dbSourceGlobal === 3);
    boardsData.forEach(board => {
        const boardIdToMatch = isArh ? board.id : board.gdid;
        const notesForBoard = allNotesData
            .filter(note => note.boardid == boardIdToMatch)
            .sort((a, b) => (a.numord || 0) - (b.numord || 0)) // Сортираме за консистентност
            .slice(0, DEMO_NOTE_LIMIT); // Взимаме броя бележки от константата
        notesForBoard.forEach(note => filteredNotes.add(note));
    });
    const originalCount = allNotesData.length;
    allNotesData = Array.from(filteredNotes);
    console.log(`DEMO MODE: Notes reduced from ${originalCount} to ${allNotesData.length}.`);
}


async function mainLogic(forceFullSync = false) {
    const loaderFolderInfo = document.getElementById('loader-folder-info');
    if (loaderFolderInfo) loaderFolderInfo.textContent = `(${activeFolderName})`;
    const settingsOverride = localStorage.getItem('settings_json_full_override'); //@@ прилагане на промени, направени в set.html
    if (settingsOverride) {
        localStorage.removeItem('settings_json_full_override');
        try {
            const parsed = JSON.parse(settingsOverride);
            const currentDevice = localStorage.getItem('deviceName') || 'Default';
            if (parsed[currentDevice]) {
                const devSettings = parsed[currentDevice];
                Object.keys(devSettings).forEach(k => {
                    let val = devSettings[k];
                    if (k === 'boardMenuOrder' && (!val || (Array.isArray(val) && val.length === 0))) return;
                    if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
                    localStorage.setItem(k, val);
                });
                console.log("[Settings-Override] Applied settings for device:", currentDevice);
            }
            if (!isOffline) {
                (async () => {
                    try {
                        const folderId = await getFolderIDByName('multinotes_data');
                        if (folderId) {
                            const existingFiles = await findGDFileByName(folderId, 'settings.json');
                            if (existingFiles && existingFiles.length > 0) {
                                await updateGDriveFile(existingFiles[0].id, settingsOverride);
                                console.log("[Settings-Override] Pushed to GDrive.");
                            }
                        }
                    } catch (err) {
                        console.error("GDrive push error for settings override:", err);
                    }
                })();
            }
        } catch (e) {
            console.error("Error applying settings override:", e);
        }
    }
    if (isOffline) {
        console.log("Working in offline mode. Skipping sync.");
        loaderText.textContent = _('loadingFromLocal');

        // --- КОРЕКЦИЯ: Инициализация на състоянието и в офлайн режим ---
        updateGlobalStateFlags();
        if (useArhDb) {
            dbSourceGlobal = 3; dbNoteIdTypeGlobal = 'id';
        } else if (useLocalFolder) {
            dbSourceGlobal = 2; dbNoteIdTypeGlobal = 'gdid';
        } else if (useGoogleDb) {
            dbSourceGlobal = 1; dbNoteIdTypeGlobal = 'gdid';
        }
        updateModeButton();
        initializeLoad(); // Нулираме контейнерите и подготвяме за нови данни

        try {
            await fetchAllDataLocal();
            await renderUI({ boardParseError: false });
        } catch (e) {
            console.error("Error loading local data in offline mode:", e);
        }

        // --- КОРЕКЦИЯ: Осигуряваме видимост на UI елементите ---
        showAppUI();

        if (currentBoardFilter !== 'calendar' && currentBoardFilter !== 'calendar_monthly' && currentBoardFilter !== 'calendar_weekly') {
            const addNoteFab = document.getElementById('add-note-fab');
            if (addNoteFab) addNoteFab.style.display = 'flex';
        }

        // Показваме бутона за инсталиране, ако има такъв
        if (window.showInstallButton) window.showInstallButton();

        return;
    }
    if (isMainLogicRunning) {
        console.log("mainLogic is already running, skipping...");
        return;
    }
    isMainLogicRunning = true;
    try {
        dbSourceGlobal = null; // Нулираме глобалните променливи
        isLoadCancelled = false; // Нулираме флага за отказ при всяко ново зареждане
        updatedNoteGdims = []; // Изчистваме масива с обновени бележки при всяко зареждане
        dataIntegrityIssues = []; // Reset integrity report
        isInitialLoad = true; // --- КОРЕКЦИЯ: Нулираме флага, за да работи скролирането при презареждане ---
        updateGlobalStateFlags();
        enableSettingsControls();
        // Извикваме новата функция за валидация
        if (!validateDataSourceSelection()) return;
        // --- ЗАДАВАНЕ НА ГЛОБАЛЕН ИЗТОЧНИК И ТИП ВРЪЗКА ЗА ТЕКУЩАТА СЕСИЯ ---
        // Това е необходимо, за да работят коректно функции като createNoteElement,
        // дори когато не се използва база данни.
        if (useArhDb) {
            dbSourceGlobal = 3; // 3: Архив
            dbNoteIdTypeGlobal = 'id';
        } else if (useLocalFolder) {
            dbSourceGlobal = 2; // 2: Локална папка
            dbNoteIdTypeGlobal = 'gdid';
        } else if (useGoogleDb) {
            dbSourceGlobal = 1; // 1: Google Drive
            dbNoteIdTypeGlobal = 'gdid';
        }
        initializeLoad(); // Resets state and shows the loader screen
        let hasLocalData = false;
        let boardsInDb = [];
        if (useIndexedDb || localStorage.getItem('useIndexedDb') !== 'false') {
            dbExists = await checkDbExists(NOTES_DB_NAME);
            if (dbExists) {
                boardsInDb = await getAllFromDB(BOARD_STORE_NAME);
                if (boardsInDb && boardsInDb.length > 0) {
                    useIndexedDb = true;
                    localStorage.setItem('useIndexedDb', 'true');
                    const dbFolderName = await getConfig('dbCreatedFolderName');
                    if (dbFolderName && (!localStorage.getItem('active_folder_name') || activeFolderName === 'AppDataFolder')) {
                        localStorage.setItem('active_folder_name', dbFolderName);
                        activeFolderName = dbFolderName;
                    }
                    if (!dbFolderName || !activeFolderName || dbFolderName === activeFolderName) {
                        hasLocalData = true;
                    } else {
                        console.warn(`[mainLogic] IndexedDB was created for folder "${dbFolderName}", but active folder is "${activeFolderName}". Bypassing local DB cache.`);
                    }
                }
            }
        }
        if (!hasLocalData) {
            if (!authToken) {
                const authResult = await checkAuth(isExplicitLogin);
                if (!authResult || !authResult.pass) {
                    if (isLoadCancelled) return;
                    showAppUI();
                    return;
                }
                authToken = authResult.tokenData;
            }
            if (!isOffline) await loadGlobalFoldersJson();
            if (!isOffline && needsInitialFolderSetup()) {
                await completeInitialFolderSetup();
            }
            if (!isOffline) {
                const wasFirstRun = await handleFirstRunSetup();
                if (wasFirstRun) {
                    console.log('[mainLogic] First run setup completed. Reloading to start normal cycle...');
                    location.reload();
                    return;
                }
            }
        }
        const loaderTitle = document.getElementById('loader-title'); // Element to display loader title
        updateModeButton(); // Актуализираме иконата за режим веднага
        if (useIndexedDb && dbExists && boardsInDb.length > 0) {
            const dbSource = await getConfig('dbSource');
            const dbNoteIdType = await getConfig('dbNoteIdType');
            dbSourceGlobal = dbSource;
            dbNoteIdTypeGlobal = dbNoteIdType;
            console.log(`[mainLogic] DB Config Loaded: Source=${dbSource}, IdType=${dbNoteIdType}`);
            if (dbNoteIdType) {
                const isAnySourceActive = useGoogleDb || useLocalFolder || useArhDb;
                if (isAnySourceActive) {
                    if ((dbNoteIdType === 'id' && !useArhDb) || (dbNoteIdType === 'gdid' && useArhDb)) {
                        console.warn(`[mainLogic] Data source mismatch! DB expects ${dbNoteIdType}, but current mode is different.`);
                        showToast(_('errorDbSourceMismatch'), 15000);
                    }
                }
            }
        }
            // --- КОРЕКЦИЯ: Гарантираме, че dirHandle е зареден в режим "Само база данни" ---
            // Ако сме в режим "Само база данни" и базата е създадена от локален източник,
            // трябва да заредим dirHandle, за да работят линковете към прикачени файлове.
            if (useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb && dbExists && boardsInDb.length > 0) {
                const dbSource = await getConfig('dbSource');
                let handleKey = null;
                if (dbSource === 2) handleKey = 'directoryHandle'; // Локална папка
                else if (dbSource === 3) handleKey = 'arhHandle';   // Архив
                if (handleKey) {
                    const handle = await getConfig(handleKey);
                    const verifiedHandle = handle ? await verifyPermission(handle) : null;
                    if (verifiedHandle) {
                        dirHandle = verifiedHandle; // Задаваме глобалния handle
                    } else {
                        showToast(_('noUpdateMode'), 10000);
                    }
                }
            }
        await userCheck();
        if (isLoadCancelled) return;
        updateGlobalStateFlags();
        // НОВА ПРОВЕРКА: Ако е избрана само база данни, но тя е празна
        if (useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb && dbExists && boardsInDb.length === 0) {
            showToast(_('errorDbOnlyAndEmpty'), 15000);
            if (isLoadCancelled) return;
            document.getElementById('settings-modal').classList.add('visible');
            loaderContainer.style.display = 'none'; // Скриваме лоудъра
            return; // Прекратяваме изпълнението
        }
        try {
            // --- УСЛОВНО ЗАРЕЖДАНЕ НА GOOGLE DRIVE API ---
            // Зареждаме API-то само ако ще работим с Google Drive.
            if (useGoogleDb) {
                if (typeof gapi !== 'undefined' && gapi.client) {
                    gapi.client.setToken({ access_token: authToken.access_token });
                }
            }
            if (useArhDb) {
                // --- РЕЖИМ 0: Зареждане от Архив ---
                console.log("Mode: Archive");
                if (loaderTitle) loaderTitle.textContent = _('arhFolderLabel');
                // --- КОРЕКЦИЯ: Задаваме правилното заглавие на лоудъра ---
                // Преди: Показваше "Избери архивна папка", дори когато такава вече е избрана.
                // Сега: Показва "Зареждане директно от архив", което е по-коректно.
                if (loaderTitle) {
                    loaderTitle.textContent = useIndexedDb ? _('dbManagementTitle') : _('loadedFromArhNoDb');
                }
                const arhHandle = await getConfig('arhHandle');
                if (!arhHandle) {
                    showToast(_('errorArhFolderNotSelected'), 10000);
                    if (isLoadCancelled) return;
                    document.getElementById('settings-modal').classList.add('visible');
                    return; // Stop execution if no archive handle
                }
                const verifiedHandle = await verifyPermission(arhHandle);
                if (isLoadCancelled) return;
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
                            loaderText.textContent = _('creatingDbFromArh');
                            if (isLoadCancelled) return;
                            const success = await readArh(verifiedHandle); // Read archive into memory
                            if (success) {
                                if (isLoadCancelled) return;
                                const dbCreatedSuccessfully = await createDatabaseFromMemory(); // Create DB from memory
                                if (dbCreatedSuccessfully) {
                                    showToast(_('dbCreated'), 10000);
                                    if (isLoadCancelled) return;
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
                                showToast(_('errorReadArh'), 10000);
                                // What to do here? Maybe just show an empty UI or an error.
                            }
                        } else {
                            // User declined to create DB, load directly from archive for this session
                            showToast(_('loadedFromArhNoDb'), 10000);
                            if (isLoadCancelled) return;
                            const success = await readArh(verifiedHandle);
                            if (success) {
                                await renderUI({ boardParseError: false });
                            }
                        }
                    } else {
                        // DB exists and has data, load from DB
                        loaderText.textContent = _('loadingFromDb');
                        if (isLoadCancelled) return;
                        await fetchAllDataLocal();
                        await renderUI({ boardParseError: false });
                    }
                } else {
                    // Archive mode without IndexedDB
                    console.log("Mode: Archive (no IndexedDB)");
                    // КЛЮЧОВА СТЪПКА: Задаваме dirHandle и при директно четене
                    dirHandle = verifiedHandle;
                    if (isLoadCancelled) return;
                    const success = await readArh(verifiedHandle);
                    if (success) {
                        await renderUI({ boardParseError: false });
                    }
                }
            } else if (!useIndexedDb) {
                // --- РЕЖИМ 1: Без IndexedDB - Директно зареждане от източник ---
                console.log("Mode: Direct from source (IndexedDB is OFF)");
                if (useGoogleDb) {
                    // Нулираме dirHandle тук, за да сме сигурни, че няма да се използват стари handles от локален/архивен режим
                    dirHandle = null;
                    console.log("Source: Google Drive");
                    if (loaderTitle) loaderTitle.textContent = _('sourceGoogleDrive');
                    if (isLoadCancelled) return;
                    const result = await fetchAllData(null, false); // false -> не записвай в DB
                    if (result.error) return;
                    // Прилагаме филтъра за демо версията ПРЕДИ рендиране
                    filterNotesForDemo();
                    await renderUI({ boardParseError: result.boardParseError });
                } else if (useLocalFolder) {
                    console.log("Source: Local Folder");
                    if (loaderTitle) loaderTitle.textContent = _('sourceLocalFolder');
                    const { boardParseError } = await fetchAllDataFromLocalFolder();
                    // Прилагаме филтъра за демо версията ПРЕДИ рендиране
                    filterNotesForDemo();
                    await renderUI({ boardParseError });
                }
            } else {
                // --- РЕЖИМ 2: С IndexedDB
                console.log("Mode: Using IndexedDB");
                if (!dbExists || boardsInDb.length === 0) {
                    // Първоначално създаване на базата данни
                    console.log("DB is empty or does not exist. Performing initial data load.");
                    if (loaderTitle) loaderTitle.textContent = _('dbManagementTitle');
                    loaderText.textContent = _('initialDataLoad');
                    let dbCreatedSuccessfully = false;
                    if (useGoogleDb) {
                        console.log("Source for initial load: Google Drive");
                        if (isLoadCancelled) return;
                        const result = await fetchAllData(null);
                        if (result.error) { // Проверяваме за грешка при зареждането
                            return; // Прекратяваме, ако няма файлове
                        }
                        // Разрешаваме дублираните бележки, ако има такива (преди запис в базата)
                        if (result.duplicates && result.duplicates.length > 0) {
                            await resolveLoadedConflicts(result.duplicates);
                        }
                        // Прилагаме филтъра за демо версията ПРЕДИ създаване на DB и рендиране
                        filterNotesForDemo();
                        dbCreatedSuccessfully = await createDatabaseFromMemory({ suppressEmptyDataToast: true });
                        await renderUI({ boardParseError: result.boardParseError });
                    } else if (useLocalFolder) {
                        console.log("Source for initial load: Local Folder");
                        const { boardParseError } = await fetchAllDataFromLocalFolder();
                        // Прилагаме филтъра за демо версията ПРЕДИ създаване на DB и рендиране
                        filterNotesForDemo();
                        dbCreatedSuccessfully = await createDatabaseFromMemory({ suppressEmptyDataToast: true });
                        await renderUI({ boardParseError });
                    }
                    if (dbCreatedSuccessfully) showToast(_('dbCreated'), 10000);
                } else {
                    // DB exists and has data, load from DB FIRST then sync in background
                    console.log("[mainLogic] DB exists. Fast loading local data first.");
                    if (loaderText) loaderText.textContent = _('fetchingFromDb') || 'Loading from local database...';
                    if (isLoadCancelled) return;
                    await fetchAllDataLocal();
                    await renderUI({ boardParseError: false });
                    loaderContainer.style.display = 'none';
                    document.getElementById('login-page').style.display = 'none';
                    document.getElementById('login-page').hidden = true;
                    showAppUI();
                    const updateFromSource = localStorage.getItem('updateFromSource') !== 'false';
                    if (updateFromSource && !isOffline && !isSyncSuspended) {
                        (async () => {
                            try {
                                if (hasLocalData) {
                                    if (!authToken) {
                                        const authResult = await checkAuth(isExplicitLogin);
                                        if (authResult && authResult.pass) {
                                            authToken = authResult.tokenData;
                                        }
                                    }
                                    if (authToken) {
                                        if (useGoogleDb && typeof gapi !== 'undefined' && gapi.client) {
                                            gapi.client.setToken({ access_token: authToken.access_token });
                                        }
                                        await loadGlobalFoldersJson();
                                        await userCheck();
                                        updateGlobalStateFlags();
                                    } else {
                                        return;
                                    }
                                }
                                console.log("[mainLogic] Starting background sync task...");
                                let updatedCount = 0;
                                if (useGoogleDb) {
                                    if (!isDbOwner) {
                                        console.log("[mainLogic] User mismatch detected! Fetching notes directly from Google Drive...");
                                        const result = await fetchAllData(null, false);
                                        if (result && !result.error) {
                                            filterNotesForDemo();
                                            await renderUI({ boardParseError: result.boardParseError });
                                        }
                                    } else {
                                        updatedCount = await runGoogleDriveSync(forceFullSync);
                                    }
                                } else if (useLocalFolder) {
                                    updatedCount = await runLocalSync(forceFullSync);
                                }
                                if (forceFullSync) {
                                    console.log("[mainLogic] Force full sync finished, refreshing UI...");
                                    if (useIndexedDb) {
                                        await fetchAllDataLocal();
                                        await renderUI({ boardParseError: false });
                                        showToast(_('dbRebuilt') || 'Local database rebuilt successfully.', 5000);
                                    } else {
                                        await renderUI({ boardParseError: false });
                                        showToast(_('syncSuccess') || 'Successfully synced', 3000);
                                    }
                                } else if (updatedCount > 0) {
                                    console.log(`[mainLogic] Background sync finished: ${updatedCount} updates found.`);
                                    await fetchAllDataLocal();
                                    if (updatedNoteGdims.length > 0 && !document.getElementById('modal-body')) {
                                        currentBoardFilter = 'new-updates';
                                    }
                                    await renderUI({ boardParseError: false });
                                    showToast(useGoogleDb ? _('gdriveUpdatesFound').replace('{count}', updatedCount) : _('localUpdatesFound').replace('{count}', updatedCount), 5000);
                                } else {
                                    console.log("[mainLogic] Background sync finished. No new updates.");
                                }
                            } catch (e) {
                                console.error("[mainLogic] Background sync error:", e);
                            }
                        })();
                    }
                }
            }
            reportDataIntegrityIssues(); // Generate report before finishing loading
        } catch (err) {
            console.log("Error in mainLogic:", err);
            showToast(_('errorProcessingFiles'));
            loaderContainer.style.display = 'none'; // Скриваме лоудъра при грешка
        } finally {
            if (isLoadCancelled) return; // Не скриваме лоудъра, ако е отказано, за да не "премигне"
            // Изчистваме текстовете в лоудъра, преди да го скрием
            const loaderTitle = document.getElementById('loader-title');
            if (loaderTitle) loaderTitle.textContent = '';
            const loaderFolderInfo = document.getElementById('loader-folder-info');
            if (loaderFolderInfo) loaderFolderInfo.textContent = '';
            loaderText.textContent = ''; // Изчистваме текста за прогреса
            updateSearchPlaceholder();
            document.body.style.backgroundImage = `url('Board.png')`; // Reset background
            // Скриваме лоудъра и логин страницата
            loaderContainer.style.display = 'none';
            document.getElementById('login-page').style.display = 'none';
            document.getElementById('login-page').hidden = true;
            // Показваме основните елементи, след като всичко е заредено
            document.querySelector('header').style.visibility = 'visible';
            document.querySelector('#search-wrapper').style.display = 'flex';
            notesContainer.style.visibility = 'visible';
            isMainLogicRunning = false;

            if (currentBoardFilter !== 'calendar' && currentBoardFilter !== 'calendar_monthly' && currentBoardFilter !== 'calendar_weekly') {
                const addNoteFab = document.getElementById('add-note-fab');
                if (addNoteFab) addNoteFab.style.display = 'flex';
            }
            if (window.showInstallButton) window.showInstallButton();
            if (!isOffline) loadSettingsFromGDrive(true);
            if (guide && localStorage.getItem('initial_setup_complete') === 'true') {
                const startAssistantGuide = () => {
                    if (window.kbAssistant && window.kbAssistant.isInitialized) {
                        const entry = window.kbAssistant.kbData?.general?.find(e => e.id === 'assistant-1');
                        if (entry && entry.guide) {
                            window.kbAssistant.showGuide(entry.guide);
                            localStorage.setItem('guide', 'false');
                            guide = false;
                        }
                    } else {
                        setTimeout(startAssistantGuide, 100);
                    }
                };
                setTimeout(startAssistantGuide, 1500);
            }
        }
    } finally {
        // Изчистваме осиротели файлове след зареждане на всичко
        // cleanupOrphanedImages();
        isMainLogicRunning = false;
    }
}

/**
 * Зарежда всички данни директно от локална папка, без да използва IndexedDB.
 * Аналогична на fetchAllData, но за локален източник.
 */
async function fetchAllDataFromLocalFolder() {
    console.log("--- Local Folder fetch sequence started ---");
    const startTime = performance.now();
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
    const gdidMap = new Map(); // To track duplicates for processing
    localFileMap.clear(); // Изчистваме глобалната карта преди ново зареждане
    try {
        const entries = [];
        for await (const entry of handle.values()) {
            if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.txt')) {
                const lowerName = entry.name.toLowerCase();
                const isBoard = lowerName.includes('board');
                const isMedia = lowerName.includes('media');
                const isNote = lowerName.includes('note');
                if (isBoard || isMedia || isNote) {
                    entries.push({ entry, lowerName, isBoard, isMedia, isNote });
                }
            }
        }
        console.log(`[Local Folder] Found ${entries.length} valid .txt files for processing.`);
        const CHUNK_SIZE = 80; // Balanced parallelism
        for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
            const chunk = entries.slice(i, i + CHUNK_SIZE);
            // Optimize UI updates - only update once per chunk
            loaderText.textContent = `${_('loadingFile')} (${Math.min(i + CHUNK_SIZE, entries.length)}/${entries.length})`;
            await Promise.all(chunk.map(async (item) => {
                try {
                    const file = await item.entry.getFile();
                    const content = await file.text();
                    const fileObject = JSON.parse(content);
                    if (!fileObject.gdid) {
                        const error = `[Missing ID] File '${item.entry.name}' is missing 'gdid' property.`;
                        console.warn(error);
                        dataIntegrityIssues.push({ type: 'missing', file: item.entry.name, gdid: null });
                    } else {
                        if (gdidMap.has(fileObject.gdid)) {
                            const error = `[Duplicate ID] GDID '${fileObject.gdid}' found in multiple files: '${gdidMap.get(fileObject.gdid)}' and '${item.entry.name}'`;
                            console.error(error);
                            dataIntegrityIssues.push({ type: 'duplicate', gdid: fileObject.gdid, file1: gdidMap.get(fileObject.gdid), file2: item.entry.name });
                        } else {
                            gdidMap.set(fileObject.gdid, item.entry.name);
                            localFileMap.set(fileObject.gdid, item.entry.name); // Попълваме глобалната карта
                        }
                    }
                    if (item.isBoard) {
                        localBoards.push(fileObject);
                    } else if (item.isMedia) {
                        localMedia.push(fileObject);
                    } else if (item.isNote) {
                        localNotes.push(fileObject);
                    }
                } catch (e) {
                    console.log(`Failed to process ${item.entry.name}:`, e);
                }
            }));
        }
    } catch (err) {
        if (err.name === 'NotFoundError') {
            console.log("Local folder not found:", err);
            showToast(_('errorLocalFolderNotFound'), 15000);
            // Изчистваме невалидния handle от базата данни
            await saveConfig('directoryHandle', null);
            // Отваряме настройките, за да може потребителят да избере нова папка
            document.getElementById('settings-modal').classList.add('visible');
            // Нулираме и UI елемента, показващ името на папката
            const folderNameDisplay = document.getElementById('local-sync-folder-name');
            if (folderNameDisplay) folderNameDisplay.textContent = _('folderNotSelected');
        } else {
            console.log("Error parsing local files:", err);
            showToast(_('errorNoteParse'));
        }
        boardParseError = true; // Вдигаме флага за грешка и в двата случая
    }
    // Зареждаме данните в глобалните променливи
    boardsData = localBoards.flat(); // .flat() за всеки случай, ако някой файл съдържа масив
    mediaData = localMedia.flat();
    allNotesData = localNotes;
    trackMaxIds(allNotesData);
    trackMaxBoardIds(boardsData);
    const endTime = performance.now();
    console.log(`--- Local Folder fetch sequence completed in ${((endTime - startTime) / 1000).toFixed(2)}s ---`);
    console.log(`[Summary] Boards: ${boardsData.length}, Media: ${mediaData.length}, Notes: ${allNotesData.length}`);
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
    /*
    // --- TEMPORARY CLEANUP FOR customBgGdid ---
    let needsCleanup = false;
    for (let board of boardsData) {
        if (board.customBgGdid !== undefined) {
            if (!board.backpath && typeof board.customBgGdid === 'string' && board.customBgGdid.trim() !== '') {
                board.backpath = board.customBgGdid;
            }
            delete board.customBgGdid;
            needsCleanup = true;
            if (useIndexedDb) {
                bulkPutDB(BOARD_STORE_NAME, board, true).catch(e => console.error(e));
            }
            if (useGoogleDb && !isOffline && board.gdid) {
                updateGDriveFile(board.gdid, JSON.stringify(board)).catch(e => console.error(e));
            }
        }
    }
    if (needsCleanup) console.log("Cleaned up customBgGdid from boards.");
    // ----------------------------------------
    */

    trackMaxBoardIds(boardsData);
    mediaData = await getAllFromDB(MEDIA_STORE_NAME);
    const notesFromDB = await getAllFromDB(NOTE_STORE_NAME);
    allNotesData = notesFromDB;
    trackMaxIds(allNotesData);
    // --- REFRESH GLOBAL FLAGS FROM DB CONFIG ---
    dbSourceGlobal = await getConfig('dbSource');
    dbNoteIdTypeGlobal = await getConfig('dbNoteIdType');
    console.log(`Loaded ${boardsData.length} boards, ${mediaData.length} media, and ${allNotesData.length} notes from DB.`);
    console.log(`[fetchAllDataLocal] dbSourceGlobal: ${dbSourceGlobal}, dbNoteIdTypeGlobal: ${dbNoteIdTypeGlobal}`);
}

/**
 * Управлява процеса на локална синхронизация с файловата система.
 */
async function runLocalSync(forceFullSync = false) {
    const useIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
    if (!useIndexedDb) {
        console.log("Skipping local sync because IndexedDB is disabled for this mode.");
        return 0;
    }
    if (forceFullSync) {
        console.log("[runLocalSync] forceFullSync active: clearing DB stores for full rebuild...");
        await clearDbStores();
        boardsData = [];
        mediaData = [];
        allNotesData = [];
    }
    const lastLocalTimestamp = forceFullSync ? null : await getConfig('lastLocalTimestamp');
    const updateDate = lastLocalTimestamp ? new Date(lastLocalTimestamp) : null;
    let updatedCount = 0;
    const handle = await getDirectoryHandle();
    if (!handle) return 0;
    loaderText.innerText = updateDate
        ? _('updatingFilesSince').replace('{date}', updateDate.toLocaleString())
        : _('performingFullSync');
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
    return updatedCount;
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
        console.log("Error during folder validation:", error);
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
        console.log("Error during arh folder validation:", error);
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
        if (error.name !== 'AbortError') console.log("Error getting directory handle:", error);
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
    console.log(`--- Local Folder sync sequence started (minTimestamp: ${minTimestamp}) ---`);
    const startTime = performance.now();
    const handle = await getDirectoryHandle();
    if (!handle) return 0;
    const stores = {
        [BOARD_STORE_NAME]: [],
        [MEDIA_STORE_NAME]: [],
        [NOTE_STORE_NAME]: []
    };
    let updatedCount = 0;
    let skippedNotesCount = 0;
    const entries = [];
    for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.txt')) {
            const lowerName = entry.name.toLowerCase();
            const isBoard = lowerName.includes('board');
            const isMedia = lowerName.includes('media');
            const isNote = lowerName.includes('note');
            if (isBoard || isMedia || isNote) {
                entries.push({ entry, lowerName, isBoard, isMedia, isNote });
            }
        }
    }
    console.log(`[Local Sync] Found ${entries.length} valid .txt files for sync check.`);
    const CHUNK_SIZE = 80;
    const gdidMap = new Map(); // Track duplicates during sync
    for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
        const chunk = entries.slice(i, i + CHUNK_SIZE);
        loaderText.textContent = _('checkedFilesCount').replace('{count}', Math.min(i + CHUNK_SIZE, entries.length));
        await Promise.all(chunk.map(async (item) => {
            try {
                const file = await item.entry.getFile();
                if (file.lastModified >= minTimestamp) {
                    updatedCount++;
                    const content = await file.text();
                    const fileObject = JSON.parse(content);
                    if (fileObject.gdid) {
                        if (gdidMap.has(fileObject.gdid)) {
                            const error = `[Duplicate ID] GDID '${fileObject.gdid}' found in multiple files during sync: '${gdidMap.get(fileObject.gdid)}' and '${item.entry.name}'`;
                            console.error(error);
                            dataIntegrityIssues.push({ type: 'duplicate', gdid: fileObject.gdid, file1: gdidMap.get(fileObject.gdid), file2: item.entry.name, mode: 'sync' });
                        } else {
                            gdidMap.set(fileObject.gdid, item.entry.name);
                            localFileMap.set(fileObject.gdid, item.entry.name); // Попълваме глобалната карта
                        }
                        if (item.isBoard) {
                            stores[BOARD_STORE_NAME].push(fileObject);
                        } else if (item.isMedia) {
                            stores[MEDIA_STORE_NAME].push(fileObject);
                        } else if (item.isNote) {
                            stores[NOTE_STORE_NAME].push(fileObject);
                            const localNote = allNotesData.find(n => n.gdid == fileObject.gdid);
                            if (!localNote || (parseInt(fileObject.datemod, 10) > (parseInt(localNote.datemod, 10) || 0))) {
                                if (!updatedNoteGdims.includes(fileObject.gdid)) {
                                    updatedNoteGdims.push(fileObject.gdid);
                                }
                            } else {
                                skippedNotesCount++;
                            }
                        }
                    } else {
                        const error = `[Missing ID] File '${item.entry.name}' skipped: missing 'gdid' property.`;
                        console.warn(error);
                        dataIntegrityIssues.push({ type: 'missing', file: item.entry.name, mode: 'sync' });
                    }
                }
            } catch (error) {
                console.log(`Error processing local file '${item.entry.name}':`, error);
            }
        }));
    }
    for (const storeName in stores) {
        if (stores[storeName].length > 0) {
            await bulkPutDB(storeName, stores[storeName], true); // Use incremental put
        }
    }
    const endTime = performance.now();
    console.log(`--- Local Folder sync sequence completed in ${((endTime - startTime) / 1000).toFixed(2)}s ---`);
    console.log(`[Summary] Updated items: ${updatedCount} (Boards: ${stores[BOARD_STORE_NAME].length}, Media: ${stores[MEDIA_STORE_NAME].length}, Notes: ${stores[NOTE_STORE_NAME].length})`);
    console.log("[Local Sync] Updated objects:", stores);
    return Math.max(0, updatedCount - skippedNotesCount);
}

/**
 * Показва модален прозорец на цял екран за преглед на изображение или видео.
 * @param {string} src - URL адресът на медийния файл.
 * @param {boolean} isVideo - True, ако файлът е видео.
 */
function showImageVideoOverlay(src, isVideo = false) {
    const overlay = document.createElement('div');
    overlay.className = 'fullscreen-preview-overlay';
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });
    const mediaElement = isVideo ? document.createElement('video') : document.createElement('img');
    mediaElement.src = src;
    if (isVideo) {
        mediaElement.controls = true;
        mediaElement.autoplay = true;
    }
    overlay.appendChild(mediaElement);
    const closeButton = document.createElement('button');
    closeButton.className = 'modal-close';
    closeButton.innerHTML = '&times;';
    closeButton.addEventListener('click', () => overlay.remove());
    overlay.appendChild(closeButton);
    document.body.appendChild(overlay);
}

/**
 * Извлича URL за преглед от Google Drive и показва овърлей.
 * @param {string} fileId - ID на файла в Google Drive.
 * @param {boolean} isVideo - True, ако файлът е видео.
 */
async function showGdrivePreview(fileId, isVideo = false) {
    if (!fileId) throw new Error("No file ID provided for Google Drive preview.");

    const sendRequest = async (token) => {
        return fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink,webContentLink`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
    };

    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) throw new Error(_('errorTokenMissing'));
        let tokenData = JSON.parse(storedTokenString);

        let resp = await sendRequest(tokenData.access_token);
        if (resp.status === 401) {
            let refresh = await refreshAuthToken(false);
            if (refresh && refresh.pass) {
                tokenData = refresh.tokenData;
                resp = await sendRequest(tokenData.access_token);
            }
        }

        if (!resp.ok) throw new Error(`HTTP Error ${resp.status}`);
        const result = await resp.json();
        const thumbnailUrl = result.thumbnailLink;

        if (thumbnailUrl) {
            showImageVideoOverlay(thumbnailUrl.replace(/=s\d+/, '=s1600'), isVideo);
        } else {
            throw new Error(_(isVideo ? 'noVideoPreview' : 'noImgPreview'));
        }
    } catch (e) {
        console.error("showGdrivePreview error:", e);
        throw e;
    }
}

async function showLocalPreview(folderName, fileName, mode) {
    const fileHandle = await (await dirHandle.getDirectoryHandle(folderName, { create: false })).getFileHandle(fileName);
    const file = await fileHandle.getFile();
    showImageVideoOverlay(URL.createObjectURL(file), file.type.startsWith('video'));
}
/**
 * Показва преглед на изображение/видео в рамките на самата бележка.
 * @param {HTMLElement} noteElement - DOM елементът на бележката.
 * @param {Array} attachments - Масив с прикачени файлове.
 * @param {number} startIndex - Начален индекс.
 * @param {string} sourceMode - 'gdrive', 'local' или 'archive'.
 * @param {boolean} isVideo - Дали файлът е видео.
 */
async function showInNotePreview(noteElement, attachments, startIndex, sourceMode, isVideo) {
    if (!noteElement) return;
    // Support legacy calls with single string fileId instead of attachments array
    if (typeof attachments === 'string') {
        const fileId = attachments;
        attachments = [{ path: fileId, pathGD: fileId, type: isVideo ? 4 : 1 }];
        startIndex = 0;
    }
    // Remove if already exists to replace it
    const existingOverlay = noteElement.querySelector('.image-preview-overlay');
    if (existingOverlay) existingOverlay.remove();
    let currentIndex = startIndex;
    // 1. Create overlay immediately
    const overlay = document.createElement('div');
    overlay.className = 'image-preview-overlay';
    // Ensure parent has position: relative or higher to contain the absolute overlay
    const parentPos = getComputedStyle(noteElement).position;
    if (parentPos === 'static') {
        noteElement.style.position = 'relative';
    }
    const parentBorderRadius = getComputedStyle(noteElement).borderRadius || '2px';
    Object.assign(overlay.style, {
        position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: '1000', borderRadius: parentBorderRadius, padding: '5px', boxSizing: 'border-box',
        flexDirection: 'column', overflow: 'hidden'
    });
    // Prevent bubbling
    // Close on overlay click
    overlay.addEventListener('click', (e) => {
        // Prevent closing if clicking on buttons or their children, but allow if clicking on img/video or background
        // Wait, arrow buttons stop propagation themselves. Close button stops propagation.
        // So any click reaching here is either on the container/background OR on the media itself (if media doesn't stop prop)
        // Check if the click target is a button or inside a button (just in case)
        if (e.target.closest('button')) return;
        e.stopPropagation();
        cleanup();
    });
    // Create container for media to easily clear/replace it
    const mediaContainer = document.createElement('div');
    Object.assign(mediaContainer.style, {
        width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
    });
    overlay.appendChild(mediaContainer);
    // --- Navigation Arrows ---
    if (attachments.length > 1) {
        const createArrow = (direction) => {
            const btn = document.createElement('button');
            btn.innerHTML = direction === 'prev' ? '&lt;' : '&gt;';
            Object.assign(btn.style, {
                position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                [direction === 'prev' ? 'left' : 'right']: '5px',
                background: 'rgba(255,255,255,0.3)', color: 'white', border: 'none',
                borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '20px', fontWeight: 'bold', zIndex: '20'
            });
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (direction === 'prev') {
                    currentIndex = (currentIndex - 1 + attachments.length) % attachments.length;
                } else {
                    currentIndex = (currentIndex + 1) % attachments.length;
                }
                loadMedia(currentIndex);
            });
            return btn;
        };
        overlay.appendChild(createArrow('prev'));
        overlay.appendChild(createArrow('next'));
    }
    // Close button
    const closeButton = document.createElement('button');
    closeButton.className = 'view-button';
    closeButton.innerHTML = eyeOffIconSvg;
    Object.assign(closeButton.style, { position: 'absolute', top: '5px', right: '5px', zIndex: '21' });
    if (closeButton.querySelector('svg')) closeButton.querySelector('svg').style.stroke = 'white';
    // Cleanup function
    const cleanup = () => {
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        if (overlay.mediaUrlToRevoke) {
            URL.revokeObjectURL(overlay.mediaUrlToRevoke);
        }
        // Възстановяваме toolbar-ите на модала
        const modalHeader = document.querySelector('#content-modal .modal-header-toolbar');
        const modalFooter = document.querySelector('#content-modal .modal-footer-toolbar');
        if (modalHeader) modalHeader.style.visibility = '';
        if (modalFooter) modalFooter.style.visibility = '';
    };
    closeButton.addEventListener('click', (ev) => {
        ev.stopPropagation();
        cleanup();
    });
    overlay.appendChild(closeButton);
    // Скриваме toolbar-ите на модала, ако overlay-ят е вътре в него
    const isInModal = noteElement.closest('#content-modal') !== null || noteElement.id === 'content-modal' || noteElement.classList.contains('modal-content-box');
    if (isInModal) {
        const modalHeader = document.querySelector('#content-modal .modal-header-toolbar');
        const modalFooter = document.querySelector('#content-modal .modal-footer-toolbar');
        if (modalHeader) modalHeader.style.visibility = 'hidden';
        if (modalFooter) modalFooter.style.visibility = 'hidden';
    }
    noteElement.appendChild(overlay);
    // --- Load Media Function ---
    async function loadMedia(index) {
        // Clear container
        mediaContainer.innerHTML = '';
        // Revoke previous URL if any (local scope reuse)
        if (overlay.mediaUrlToRevoke) {
            URL.revokeObjectURL(overlay.mediaUrlToRevoke);
            overlay.mediaUrlToRevoke = null;
        }
        // Add spinner
        const spinner = document.createElement('div');
        spinner.className = 'loader';
        Object.assign(spinner.style, { width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #3498db', borderRadius: '50%', animation: 'spin 1s linear infinite' });
        mediaContainer.appendChild(spinner);
        const attachment = attachments[index];
        const isActuallyVideo = attachment.type === 4 || isVideo;
        const isActuallySound = attachment.type === 2;
        const folderName = isActuallyVideo ? 'Video' : (isActuallySound ? 'Sound' : 'Images');
        const fileIdOrPath = sourceMode === 'gdrive' ? attachment.pathGD : attachment.path;
        let mediaUrl;
        try {
            if (sourceMode === 'gdrive') {
                if (typeof gapi === 'undefined' || typeof gapi.client === 'undefined') {
                    await loadGoogleApis();
                }
                // Check if token is valid or expired using the actual authToken object
                let isTokenExpired = true;
                if (authToken && authToken.issued_at) {
                    const elapsedSeconds = (Date.now() - authToken.issued_at) / 1000;
                    const expiresIn = authToken.expires_in || 3599;
                    if (elapsedSeconds < (expiresIn - 300)) { // Refresh if less than 5 mins remaining
                        isTokenExpired = false;
                    }
                }
                if (!authToken || isTokenExpired) {
                    console.log("Token expired or missing in preview, refreshing...");
                    const newToken = await checkAuth(); // checkAuth handles the actual refresh logic
                    if (newToken) {
                        authToken = newToken;
                        // Update gapi client if needed
                        if (typeof gapi !== 'undefined' && gapi.client) gapi.client.setToken({ access_token: authToken.access_token });
                    }
                }
                const tokenObj = (typeof authToken !== 'undefined' && authToken) ? authToken :
                    ((typeof gapi !== 'undefined' && gapi.auth) ? gapi.auth.getToken() : null);
                if (!tokenObj) throw new Error(_('errorTokenMissing'));
                if (isActuallyVideo || isActuallySound) {
                    try {
                        const mediaResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileIdOrPath}?alt=media`, {
                            headers: {
                                'Authorization': `Bearer ${tokenObj.access_token}`,
                                'Range': 'bytes=0-10000000'
                            }
                        });
                        if (!mediaResponse.ok) throw new Error(`Media fetch failed: ${mediaResponse.status}`);
                        const mediaBlob = await mediaResponse.blob();
                        mediaUrl = URL.createObjectURL(mediaBlob);
                        overlay.mediaUrlToRevoke = mediaUrl;
                    } catch (err) {
                        console.log("Failed to load GDrive media blob:", err);
                        throw new Error(_(isActuallyVideo ? 'noVideoPreview' : 'noSoundPreview') || 'Preview error');
                    }
                } else {
                    // Image high-res thumbnail
                    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileIdOrPath}?fields=thumbnailLink`, {
                        headers: { 'Authorization': `Bearer ${tokenObj.access_token}` }
                    });
                    if (!response.ok) throw new Error(`Thumbnail fetch failed: ${response.status}`);
                    const fileMetadata = await response.json();
                    const thumbnailUrl = fileMetadata.thumbnailLink;
                    if (!thumbnailUrl) throw new Error(_('noImgPreview'));
                    mediaUrl = thumbnailUrl.replace(/=s\d+/, '=s1600');
                }
            } else { // 'local' or 'archive'
                const isDbOnlyMode = useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb;
                if (isDbOnlyMode && !dirHandle && (sourceMode === 'local' || sourceMode === 'archive')) {
                    const dbSource = await getConfig('dbSource');
                    let handleKey = null;
                    if (dbSource === 2) handleKey = 'directoryHandle';
                    else if (dbSource === 3) handleKey = 'arhHandle';
                    if (handleKey) {
                        const handle = await getConfig(handleKey);
                        const verifiedHandle = handle ? await verifyPermission(handle) : null;
                        if (verifiedHandle) {
                            dirHandle = verifiedHandle;
                        } else {
                            showToast(_('noUpdateMode'), 10000);
                            cleanup();
                            return;
                        }
                    }
                }
                let fileHandle;
                const fileName = fileIdOrPath.split('/').pop();
                if (sourceMode === 'local') {
                    const folderHandle = await dirHandle.getDirectoryHandle(folderName, { create: false });
                    fileHandle = await folderHandle.getFileHandle(fileName);
                } else { // 'archive'
                    fileHandle = await dirHandle.getFileHandle(fileName);
                }
                const file = await fileHandle.getFile();
                mediaUrl = URL.createObjectURL(file);
                overlay.mediaUrlToRevoke = mediaUrl;
            }
            // Remove spinner
            if (spinner.parentNode) spinner.remove();
            let mediaElement;
            if (isActuallyVideo) {
                mediaElement = document.createElement('video');
                mediaElement.controls = true;
                mediaElement.autoplay = true;
                // Limit preview to 15 seconds if it's a blob-based partial fetch
                if (sourceMode === 'gdrive') {
                    mediaElement.addEventListener('timeupdate', () => {
                        if (mediaElement.currentTime > 15) {
                            mediaElement.pause();
                        }
                    });
                }
            } else if (isActuallySound) {
                mediaElement = document.createElement('audio');
                mediaElement.controls = true;
                mediaElement.autoplay = true;
            } else {
                mediaElement = document.createElement('img');
            }
            mediaElement.src = mediaUrl;
            if (mediaElement.load) mediaElement.load(); // Explicitly load for better media handling
            Object.assign(mediaElement.style, {
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                padding: '5px',
                boxSizing: 'border-box',
                display: 'block',
                margin: 'auto'
            });
            mediaContainer.appendChild(mediaElement);
        } catch (e) {
            console.log("Preview failed:", e);
            if (spinner.parentNode) spinner.remove();
            const errorMsg = document.createElement('div');
            errorMsg.style.color = 'white';
            errorMsg.style.textAlign = 'center';
            errorMsg.style.padding = '20px';
            errorMsg.textContent = e.message || 'Error loading preview';
            mediaContainer.appendChild(errorMsg);
        }
    }
    // Initial load
    loadMedia(currentIndex);
}

function addInNotePreviewListener(element, attachments, indexOrSource, sourceMode, isVideo) {
    element.style.cursor = 'pointer';
    element.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const modalContentBox = e.currentTarget.closest('#content-modal')?.querySelector('.modal-content-box');
        const noteElement = e.currentTarget.closest('.note') || modalContentBox || document.getElementById('modal-body');
        // Handle both signatures:
        // 1. (element, attachmentsArray, startIndex, sourceMode, isVideo)
        // 2. (element, fileIdString, sourceMode, isVideo)
        if (typeof attachments === 'string') {
            // Legacy: attachments=fileId, indexOrSource=sourceMode, sourceMode=isVideo
            showInNotePreview(noteElement, attachments, 0, indexOrSource, sourceMode);
        } else {
            showInNotePreview(noteElement, attachments, indexOrSource, sourceMode, isVideo);
        }
    });

}

// =================================================================================
// V. СЪЗДАВАНЕ И УПРАВЛЕНИЕ НА UI ЕЛЕМЕНТИ
// =================================================================================
/**
 * Makes an element draggable and saves its position to localStorage.
 * @param {HTMLElement} element - The element to make draggable.
 * @param {string} storageKey - The localStorage key to save the position.
 */
function makeElementDraggable(element, storageKey, onlyRestore = false, onLongPress = null) {
    if (!element) return;

    // Check if we already initialized dragging for this element to avoid duplicate listeners
    if (element.dataset.draggableInitialized === 'true' && !onlyRestore) return;

    // Restore position
    const setDefaultPosition = () => {
        if (debug) console.log(`[Draggable] Resetting ${element.id} to default position. Viewport: ${window.innerWidth}x${window.innerHeight}`);
        element.style.setProperty('top', 'auto', 'important');
        element.style.setProperty('left', 'auto', 'important');

        if (element.id === 'kb-fab') {
            element.style.setProperty('right', '10px', 'important');
            element.style.setProperty('bottom', '10px', 'important');
        } else if (element.id === 'scrollTopBtn') {
            element.style.setProperty('right', '10px', 'important');
            element.style.setProperty('bottom', '80px', 'important');
        } else if (element.id === 'add-note-fab') {
            element.style.setProperty('right', '80px', 'important');
            element.style.setProperty('bottom', '10px', 'important');
        } else if (element.id === 'popup-menu-btn-floating') {
            element.style.setProperty('right', '10px', 'important');
            element.style.setProperty('top', '60px', 'important');
            element.style.setProperty('bottom', 'auto', 'important');
        } else {
            element.style.setProperty('right', '10px', 'important');
            element.style.setProperty('bottom', '10px', 'important');
        }
    };

    // Restore position
    const savedPos = localStorage.getItem(storageKey);
    if (debug) console.log(`[Draggable] ${element.id} savedPos:`, savedPos);

    let positionRestored = false;
    if (savedPos) {
        try {
            const pos = JSON.parse(savedPos);
            const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

            if (debug) console.log(`[Draggable] ${element.id} parsing:`, pos, `Viewport: ${viewportWidth}x${viewportHeight}`);

            // Wait for element to have dimensions if it's currently hidden, but use 50 as safe fallback
            const elHeight = element.offsetHeight || 50;
            const elWidth = element.offsetWidth || 50;

            let topVal = undefined;
            let rightVal = undefined;

            if (pos.top !== undefined && pos.top !== null) {
                topVal = parseFloat(String(pos.top));
            } else if (pos.bottom !== undefined && pos.bottom !== null) {
                const bottomVal = parseFloat(String(pos.bottom));
                topVal = viewportHeight - bottomVal - elHeight;
            }

            if (pos.right !== undefined && pos.right !== null) {
                rightVal = parseFloat(String(pos.right));
            } else if (pos.left !== undefined && pos.left !== null) {
                const leftVal = parseFloat(String(pos.left));
                rightVal = viewportWidth - leftVal - elWidth;
            }

            if (topVal !== undefined && !isNaN(topVal) && rightVal !== undefined && !isNaN(rightVal)) {
                // Define "off-screen" tolerance
                const isVerticalOut = (topVal < -20) || (viewportHeight > 50 && topVal > viewportHeight - 10);
                const isHorizontalOut = (rightVal < -20) || (viewportWidth > 50 && rightVal > viewportWidth - 10);

                if (isVerticalOut || isHorizontalOut) {
                    if (debug) console.warn(`[Draggable] ${element.id} is off-screen (${topVal}, ${rightVal}). Resetting.`, pos);
                    setDefaultPosition();
                } else {
                    // Clamp values to be within the viewport
                    topVal = Math.max(0, Math.min(topVal, viewportHeight > 0 ? viewportHeight - elHeight : 1000));
                    rightVal = Math.max(0, Math.min(rightVal, viewportWidth > 0 ? viewportWidth - elWidth : 1000));

                    element.style.setProperty('bottom', 'auto', 'important');
                    element.style.setProperty('left', 'auto', 'important');
                    element.style.setProperty('top', `${topVal}px`, 'important');
                    element.style.setProperty('right', `${rightVal}px`, 'important');
                    element.style.setProperty('z-index', '9990', 'important'); // Boost z-index, but keep below chat

                    if (debug) console.log(`[Draggable] Restored ${element.id} to ${topVal}px, ${rightVal}px`);
                    positionRestored = true;
                }
            } else {
                if (debug) console.warn(`[Draggable] Invalid coordinates for ${element.id}:`, pos);
            }
        } catch (e) {
            console.error(`[Draggable] Error restoring ${element.id}:`, e);
        }
    }

    if (!positionRestored) {
        setDefaultPosition();
    }

    // If onlyRestore is true, we stop here and don't attach listeners
    if (onlyRestore) return;

    element.dataset.draggableInitialized = 'true';

    let isDragging = false;
    let hasMoved = false;
    let startX, startY, startTop, startRight;
    let longPressTimer;
    let isLongPress = false;

    const onDragStart = (e) => {
        if (e.type === 'mousedown' && e.button !== 0) return;
        // Prevent native drag behavior (e.g. ghost image) for mouse events
        if (e.type === 'mousedown') e.preventDefault();
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        isDragging = true;
        hasMoved = false;
        startX = clientX;
        startY = clientY;
        const rect = element.getBoundingClientRect();
        startTop = rect.top;
        startRight = window.innerWidth - rect.right;

        isLongPress = false;
        if (onLongPress) {
            longPressTimer = setTimeout(() => {
                if (!hasMoved) {
                    isLongPress = true;
                    onLongPress(element);
                    if (navigator.vibrate) navigator.vibrate(50);
                }
            }, 600);
        }
    };
    const onDragMove = (e) => {
        if (!isDragging) return;
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        if (Math.abs(clientX - startX) > 5 || Math.abs(clientY - startY) > 5) {
            hasMoved = true;
            element.classList.add('dragging');
            if (longPressTimer) clearTimeout(longPressTimer);
        }
        if (!hasMoved) return;
        e.preventDefault();
        const newTop = startTop + (clientY - startY);
        const newRight = startRight - (clientX - startX);
        const maxTop = window.innerHeight - element.offsetHeight;
        const maxRight = window.innerWidth - element.offsetWidth;
        element.style.top = `${Math.max(0, Math.min(newTop, maxTop))}px`;
        element.style.right = `${Math.max(0, Math.min(newRight, maxRight))}px`;
        element.style.bottom = 'auto';
        element.style.left = 'auto';
    };
    const onDragEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        if (longPressTimer) clearTimeout(longPressTimer);
        element.classList.remove('dragging');
        if (hasMoved) {
            localStorage.setItem(storageKey, JSON.stringify({ top: element.style.top, right: element.style.right }));
        }
    };
    element.addEventListener('mousedown', onDragStart);
    element.addEventListener('touchstart', onDragStart, { passive: false });
    window.addEventListener('mousemove', onDragMove, { passive: false });
    window.addEventListener('touchmove', onDragMove, { passive: false });
    window.addEventListener('mouseup', onDragEnd);
    window.addEventListener('touchend', onDragEnd);
    // Block context menu on mobile/touch
    element.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
    });
    // Block click if moved or long-pressed
    element.addEventListener('click', (e) => {
        if (hasMoved || isLongPress) {
            e.preventDefault();
            e.stopImmediatePropagation();
            hasMoved = false;
            isLongPress = false;
        }
    }, true);
}

/**
 * Възстановява позициите на всички плаващи елементи от localStorage
 */
function restoreAllFloatingPositions() {
    const mappings = [
        { id: 'add-note-fab', key: 'addNoteFabPosition' },
        { id: 'popup-menu-btn-floating', key: 'popupMenuBtnPosition' },
        { id: 'scrollTopBtn', key: 'scrollTopBtnPosition' },
        { id: 'kb-fab', key: 'kbFabPosition' }
    ];

    mappings.forEach(m => {
        const el = document.getElementById(m.id);
        // При чист старт началната позиция вече е зададена от първата
        // инициализация. Не я пресмятаме отново след тихото зареждане на
        // настройките, освен ако профилът действително съдържа позиция.
        if (el && localStorage.getItem(m.key)) {
            makeElementDraggable(el, m.key, true);
        }
    });
}

function showModal(options, noteElement = null) {
    let rawContent, formatString, titleFormatString, displayContent, noteColor, noteId, noteGdid;
    const updateGDrive = useGoogleDb && !isOffline;
    if (typeof options === 'string') {
        rawContent = options;
        options = {}; // Ensure options is an object
        formatString = null;
        titleFormatString = null;
        noteColor = null; // Default color for simple string content
    } else {
        rawContent = options.raw;
        formatString = options.format;
        titleFormatString = options.titleFormat;
        noteColor = options.color;
        // Извличаме ID-тата на бележката, ако са подадени
        noteId = options.id;
        noteGdid = options.gdid;
    }
    // --- Board Name Display in Modal ---
    const modalContentBox = contentModal.querySelector('.modal-content-box');

    // Check for explicit dimensions in options (e.g. from guide temp note)
    if (options && options.width && options.height) {
        modalContentBox.style.width = typeof options.width === 'number' ? options.width + 'px' : options.width;
        modalContentBox.style.height = typeof options.height === 'number' ? options.height + 'px' : options.height;
        modalContentBox.style.maxWidth = '100vw';
        modalContentBox.style.maxHeight = 'none';
    } else {
        // Прилагаме запазените размери, ако съществуват
        const savedWidth = localStorage.getItem('modalWidth');
        const savedHeight = localStorage.getItem('modalHeight');
        if (savedWidth && savedHeight) {
            modalContentBox.style.width = savedWidth;
            modalContentBox.style.height = savedHeight;
            modalContentBox.style.maxWidth = '100vw';
            modalContentBox.style.maxHeight = 'none';
        } else {
            // Задаваме размер по подразбиране 400x300px, ако няма запазен размер
            modalContentBox.style.width = '400px';
            modalContentBox.style.height = '300px';
            modalContentBox.style.maxWidth = '100vw';
            modalContentBox.style.maxHeight = 'none';
        }
    }
    // Размер на шрифта: от options (демо бележка) или от потребителските настройки
    if (options && options.fontSize) {
        modalBody.style.fontSize = (typeof options.fontSize === 'number' ? options.fontSize + 'px' : options.fontSize);
    } else {
        modalBody.style.fontSize = `${localStorage.getItem('modalFontSize') || 16}px`;
    }
    const modalBoardNameEl = document.getElementById('modal-board-name');
    const isPromo = options.id === 'promo';

    // Скриваме бутоните в хедъра за промо бележката (освен Close)
    const headerBtns = contentModal.querySelectorAll('.modal-header-btn:not(.modal-close)');
    headerBtns.forEach(btn => btn.style.display = isPromo ? 'none' : '');

    if (isPromo) {
        modalBoardNameEl.textContent = (window.kbAssistant && typeof window.kbAssistant.getText === 'function') ? window.kbAssistant.getText('assistantName') : 'Assistant';
        modalBoardNameEl.style.display = 'block';
        modalBoardNameEl.style.color = 'white';
        modalBoardNameEl.style.cursor = 'default';
        modalBoardNameEl.style.textDecoration = 'none';
        modalBoardNameEl.style.fontWeight = 'bold';
    } else if (options && options.boardId) {
        modalBoardNameEl.style.color = ''; // Reset color
        // Показваме името на борда винаги, ако бордът е валиден (по искане на потребителя)
        // options.forceShowBoardName || currentBoardFilter != options.boardId - removed check
        if (true) {
            // Use loose equality (==) to handle potential string/number mismatches
            const board = boardsData.find(b => b.gdid == options.boardId);
            if (board) {
                modalBoardNameEl.textContent = board.title;
                modalBoardNameEl.style.display = 'block';

                // --- Make Board Name Clickable ---
                modalBoardNameEl.style.cursor = 'pointer';
                modalBoardNameEl.style.textDecoration = 'underline';
                modalBoardNameEl.style.fontWeight = 'bold';
                modalBoardNameEl.title = _('goToBoard');
                // Clean old event listeners
                const newEl = modalBoardNameEl.cloneNode(true);
                modalBoardNameEl.parentNode.replaceChild(newEl, modalBoardNameEl);
                newEl.addEventListener('click', () => {
                    document.getElementById('content-modal').classList.remove('visible');
                    const boardBtn = document.querySelector(`.board-filter-link[data-boardid="${board.gdid}"]`);
                    if (boardBtn) {
                        boardBtn.click();
                    } else {
                        filterNotesByBoard(board.gdid);
                    }
                });

                // --------------------------------
            } else {
                modalBoardNameEl.style.display = 'block';
                modalBoardNameEl.textContent = '📝';
                modalBoardNameEl.style.cursor = 'default';
                modalBoardNameEl.style.textDecoration = 'none';
            }
        } else {
            modalBoardNameEl.style.display = 'block';
            modalBoardNameEl.textContent = '📝';
            modalBoardNameEl.style.cursor = 'default';
            modalBoardNameEl.style.textDecoration = 'none';
        }
    } else {
        modalBoardNameEl.style.display = 'block';
        modalBoardNameEl.textContent = '📝';
        modalBoardNameEl.style.cursor = 'default';
        modalBoardNameEl.style.textDecoration = 'none';
    }
    currentModalContent = rawContent;
    // For notes with a preview (pass: true), the '|' is a separator.
    // For the full view in the modal, we want to show the entire content,
    // just replacing the separator with a newline for better readability.
    // Special case: if titleFormatString is provided, format the title part separately.
    displayContent = getFormattedNoteHtml(rawContent, formatString, titleFormatString, true);
    modalBody.innerHTML = displayContent;
    modalBody.dataset.renderedHtml = displayContent; // Запазваме оригинала за възстановяване при търсене

    // Remove previous click listener if it exists to prevent accumulation
    if (modalBody._clickListener) {
        modalBody.removeEventListener('click', modalBody._clickListener, { capture: true });
    }

    // Add click-to-edit functionality
    modalBody._clickListener = (e) => {
        // Do not trigger if a link was clicked, copy button was clicked, if already editing, or if setting is disabled
        if (e.target.closest('a') || e.target.closest('.code-block-copy') || modalBody.querySelector('textarea')) {
            return;
        }

        const clickToEditEnabled = localStorage.getItem('clickToEdit') !== 'false'; // Default true
        if (!clickToEditEnabled || options.readonly) return;

        // Calculate character index from click position
        let charIndex = -1;
        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
            const range = selection.getRangeAt(0);
            charIndex = getPreciseCharIndex(modalBody, range);
        }

        enableNoteEditing(modalBody, charIndex);
    };
    modalBody.addEventListener('click', modalBody._clickListener, { capture: true }); // Use capture to handle event before other listeners if needed

    // Store metadata for editing and rendering identification
    modalBody.dataset.id = noteId || '';
    modalBody.dataset.gdid = noteGdid || '';
    modalBody.dataset.numord = options.numord || '';
    modalBody.dataset.baseDatemod = options.datemod || '0';

    if (options.originalNote) {
        modalBody.dataset.baseNote = JSON.stringify(options.originalNote);
    } else {
        delete modalBody.dataset.baseNote;
    }
    modalBody.dataset.format = formatString || '';
    modalBody.dataset.titleFormat = titleFormatString || '';
    delete modalBody.dataset.initialEditText;
    delete modalBody.dataset.initialEditTitleText;
    delete modalBody.dataset.initialFormat;
    delete modalBody.dataset.initialTitleFormat;
    delete modalBody.dataset.draftText;
    delete modalBody.dataset.draftTitle;
    modalBody.dataset.boardId = (options && options.boardId) ? options.boardId : '';
    modalBody.dataset.isNewNote = options.isNewNote ? 'true' : 'false';
    modalBody.dataset.color = noteColor || '';
    if (options.maskedLinks) {
        modalBody.dataset.maskedLinks = JSON.stringify(options.maskedLinks);
    } else {
        delete modalBody.dataset.maskedLinks;
    }
    const noteObjForCalendar = allNotesData.find(n => (n.gdid && String(n.gdid) === String(noteGdid)) || (n.id && String(n.id) === String(noteId)));
    modalBody.dataset.calendarDate = (noteObjForCalendar && noteObjForCalendar.calendarDate) ? noteObjForCalendar.calendarDate : '0';
    let colorIndex = 0;
    if (typeof noteColor === 'number') {
        if (noteColor >= 0 && noteColor < noteColorMap.length) {
            colorIndex = noteColor;
        } else if (noteColor < 0) {
            // Find if this custom color matches any in the map (especially for indices 10-15)
            const hex = colorIntToHex(noteColor);
            const foundIndex = noteColorMap.indexOf(hex);
            if (foundIndex !== -1) colorIndex = foundIndex;
            else colorIndex = noteColor; // Keep as negative int if not in map
        }
    } else if (typeof noteColor === 'string') {
        const foundIndex = noteColorMap.indexOf(noteColor);
        if (foundIndex !== -1) colorIndex = foundIndex;
    } else if (noteObjForCalendar && noteObjForCalendar.color !== undefined) {
        const c = noteObjForCalendar.color;
        if (typeof c === 'number' && c < 0) {
            const hex = colorIntToHex(c);
            const foundIndex = noteColorMap.indexOf(hex);
            colorIndex = (foundIndex !== -1) ? foundIndex : c;
        } else {
            colorIndex = c;
        }
    }
    modalBody.dataset.initialColorIndex = colorIndex; // Запазваме оригиналния цвят
    modalBody.dataset.colorIndex = colorIndex;

    // Set modal background color
    const imgBgrdEnabled = localStorage.getItem('imgBgrd') !== 'false'; // Default to true
    if (isPromo) {
        modalContentBox.style.backgroundColor = '#222';
        modalContentBox.style.backgroundImage = 'none';
        modalContentBox.classList.add('no-bg-image');
        modalBody.classList.add('no-bg-image');
    } else {
        let bgColor = '#eef603';
        if (typeof colorIndex === 'number') {
            if (colorIndex >= 0 && colorIndex < noteColorMap.length) bgColor = noteColorMap[colorIndex];
            else if (colorIndex < 0) bgColor = colorIntToHex(colorIndex);
        } else if (typeof colorIndex === 'string') {
            bgColor = colorIndex;
        } else if (noteColor) {
            bgColor = (typeof noteColor === 'number' && noteColor < 0) ? colorIntToHex(noteColor) : noteColor;
        }
        modalContentBox.style.backgroundColor = bgColor;
        if (!imgBgrdEnabled) {
            modalContentBox.style.backgroundImage = 'none';
            modalContentBox.classList.add('no-bg-image');
            modalBody.classList.add('no-bg-image');
        } else {
            modalContentBox.style.backgroundImage = '';
            modalContentBox.classList.remove('no-bg-image');
            modalBody.classList.remove('no-bg-image');
        }
    }

    // --- Color Picker UI in Header ---
    const oldColorBtn = document.getElementById('modal-color-btn');
    if (oldColorBtn) oldColorBtn.remove();
    const oldPalette = document.getElementById('color-palette-dropdown');
    if (oldPalette) oldPalette.remove();

    if (!isPromo && !options.readonly) {
        const closeBtn = modalContentBox.querySelector('.modal-close');
        if (closeBtn) {
            const colorBtn = document.createElement('div');
            colorBtn.id = 'modal-color-btn';
            colorBtn.className = 'modal-header-btn';
            colorBtn.title = _('changeColor') || 'Change Color';
            colorBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="gray" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>`;
            Object.assign(colorBtn.style, {
                cursor: 'pointer',
                right: '277px',
                display: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: '0.7'
            });
            colorBtn.onmouseover = () => colorBtn.style.opacity = '1';
            colorBtn.onmouseout = () => colorBtn.style.opacity = '0.7';
            closeBtn.parentNode.insertBefore(colorBtn, closeBtn);

            // Palette
            const palette = document.createElement('div');
            palette.id = 'color-palette-dropdown';
            Object.assign(palette.style, {
                position: 'absolute',
                top: '40px',
                right: '40px',
                backgroundColor: 'white',
                border: '1px solid #ccc',
                padding: '10px',
                display: 'none',
                gridTemplateColumns: 'repeat(4, 22px)',
                gap: '8px',
                zIndex: '10001',
                borderRadius: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
            });

            if (typeof noteColorMap !== 'undefined') {
                noteColorMap.forEach((c, idx) => {
                    const swatch = document.createElement('div');
                    Object.assign(swatch.style, {
                        width: '22px',
                        height: '22px',
                        backgroundColor: c,
                        cursor: 'pointer',
                        borderRadius: '50%',
                        border: '1px solid #ccc',
                        boxShadow: 'inset 0 0 2px rgba(0,0,0,0.2)'
                    });
                    swatch.title = _(`color${idx}`) || c;
                    if (idx === colorIndex) {
                        swatch.style.border = '2px solid #555';
                        swatch.style.transform = 'scale(1.1)';
                    }
                    swatch.onclick = (e) => {
                        e.stopPropagation();
                        // Update UI
                        modalContentBox.style.backgroundColor = c;
                        modalBody.dataset.color = c;
                        modalBody.dataset.colorIndex = idx;
                        palette.style.display = 'none';
                    };
                    palette.appendChild(swatch);
                });

                // --- Добавяне на бутон за избор на произволен цвят ---
                const customSwatch = document.createElement('div');
                Object.assign(customSwatch.style, {
                    width: '22px', height: '22px', cursor: 'pointer', borderRadius: '50%', border: '1px solid #ccc',
                    background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
                });
                customSwatch.title = _('customColor') || 'Потребителски цвят';

                const colorInput = document.createElement('input');
                colorInput.type = 'color';
                Object.assign(colorInput.style, {
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer'
                });

                colorInput.oninput = (e) => {
                    const hex = e.target.value.toUpperCase();
                    modalContentBox.style.backgroundColor = hex;
                    modalBody.dataset.color = hex;
                    modalBody.dataset.colorIndex = -1; // -1 показва, че е потребителски цвят
                };

                colorInput.onchange = () => {
                    palette.style.display = 'none';
                };

                customSwatch.appendChild(colorInput);
                palette.appendChild(customSwatch);
            }
            modalContentBox.appendChild(palette);

            colorBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                palette.style.display = palette.style.display === 'none' ? 'grid' : 'none';
            });
            // Click outside to close (simple handler)
            const closePalette = (e) => {
                if (palette.style.display === 'grid' && !palette.contains(e.target) && e.target !== colorBtn) {
                    palette.style.display = 'none';
                }
            };
            document.addEventListener('click', closePalette);
            // Cleanup listener on modal close logic (or just let it persist, it's lightweight)
        }
    }
    // Използваме requestAnimationFrame, за да гарантираме, че браузърът е приложил началните стилове (scale 0.7)
    // преди да добавим класа visible, за да се възпроизведе анимацията.
    requestAnimationFrame(() => {
        contentModal.classList.add('visible');
    });

    // --- ДОБАВЕНА ЛОГИКА ЗА ПРИКАЧЕНИ ФАЙЛОВЕ ---
    // Проверяваме дали имаме ID-та, за да търсим прикачени файлове
    if (noteId || noteGdid) {
        // --- Логика за показване на бутона за изтриване ---
        let attachments = [];
        if (useIndexedDb) {
            const dbNoteIdType = dbNoteIdTypeGlobal || 'gdid';
            if (dbNoteIdType === 'id') {
                attachments = mediaData.filter(media => +media.noteid === +noteId);
            } else { // 'gdid'
                attachments = mediaData.filter(media => media.noteid === noteGdid);
            }
        } else {
            if (useArhDb) attachments = mediaData.filter(media => +media.noteid === +noteId);
            else if (useLocalFolder || useGoogleDb) attachments = mediaData.filter(media => media.noteid === noteGdid);
        }
        if (attachments.length > 0) {
            const separator = document.createElement('hr');
            separator.style.marginTop = '10px';
            separator.style.marginBottom = '10px';
            modalBody.appendChild(separator);
            attachments.forEach(async attachment => {
                const iconData = attachmentIcons.find(icon => icon.type === attachment.type);
                if (!iconData) return;
                const attachmentWrapper = document.createElement('div');
                attachmentWrapper.style.display = 'flex';
                attachmentWrapper.style.alignItems = 'center';
                attachmentWrapper.style.gap = '5px';
                attachmentWrapper.style.marginTop = '5px';
                if (useArhDb) {
                    await handleAttachment(attachment, attachmentWrapper, iconData, 'archive', true); // true for isForModal
                } else if (useLocalFolder) {
                    await handleAttachment(attachment, attachmentWrapper, iconData, 'local', true); // true for isForModal
                } else {
                    await handleGoogleDriveAttachment(attachment, attachmentWrapper, iconData, true); // true for isForModal
                }
                modalBody.appendChild(attachmentWrapper);
            });

        }
    }
    // --- КРАЙ НА ДОБАВЕНАТА ЛОГИКА ---
    // --- FOOTER GENERATION LOGIC ---
    // Remove old search bar and footer if they exist
    const oldFooter = modalContentBox.querySelector('.modal-note-footer');
    if (oldFooter) oldFooter.remove();
    const oldToolbar = modalContentBox.querySelector('.modal-footer-toolbar');
    if (oldToolbar) oldToolbar.remove();
    const oldSearchBar = modalContentBox.querySelector('.modal-search-bar');
    if (oldSearchBar) oldSearchBar.remove();

    const canEdit = (useIndexedDb || (updateGDrive && (options.gdid || options.isNewNote)) || useLocalFolder) && !isPromo && !options.readonly;
    let footerToolbar = modalContentBox.querySelector('.modal-footer-toolbar');
    if (!footerToolbar && (canEdit || isPromo) && !options.readonly) { // Create toolbar if needed or for date
        footerToolbar = document.createElement('div');
        footerToolbar.className = 'modal-footer-toolbar';
        modalContentBox.appendChild(footerToolbar);
    }

    // First, try to find the note object in memory for the most up-to-date data
    const gdidForLookup = options.gdid || noteGdid;
    const idForLookup = options.id || noteId;
    const currentNoteObj = allNotesData.find(n => (n.gdid && String(n.gdid) === String(gdidForLookup)) || (n.id && String(n.id) === String(idForLookup)));

    // If not passed noteElement, try to find it
    if (!noteElement && gdidForLookup) {
        noteElement = document.querySelector(`.note[data-g="${gdidForLookup}"]`);
    }

    // Determine footer content
    let footerHtml = '';
    if (currentNoteObj) {
        // Generate from data directly (fresh)
        const dateSpan = document.createElement('span');
        dateSpan.className = 'note-header-date';
        const timeSpan = document.createElement('span');
        timeSpan.className = 'note-header-time';

        let isAutomatedTimer = false;
        if (currentNoteObj.timer) {
            const d = new Date(currentNoteObj.timer);
            if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 33) isAutomatedTimer = true;
        }
        if (currentNoteObj.timer && !isAutomatedTimer) {
            const dateText = formatDate(currentNoteObj.timer);
            const showCalIcon = currentNoteObj.calendarDate && parseInt(currentNoteObj.calendarDate, 10) > 0;
            if (dateText) {
                if (showCalIcon) dateSpan.innerHTML = `<span class="header-icon">${calendarIconSvg}</span> ${dateText}`;
                else dateSpan.textContent = dateText;
            }
            const timeText = formatTime(currentNoteObj.timer);
            if (timeText) timeSpan.innerHTML = `<span class="header-icon">${clockIconSvg}</span> ${timeText}`;
        } else if (currentNoteObj.calendarDate) {
            const dateText = formatDate(currentNoteObj.calendarDate);
            if (dateText) dateSpan.innerHTML = `<span class="header-icon">${calendarIconSvg}</span> ${dateText}`;
        } else if (currentNoteObj.datemod) {
            const dateText = formatDate(currentNoteObj.datemod);
            if (dateText) {
                dateSpan.textContent = dateText;
                // dateSpan.classList.add('datemod-header-date'); // Optional styling match
                const timeText = formatTime(currentNoteObj.datemod);
                if (timeText) timeSpan.textContent = timeText;
            }
        }

        if (dateSpan.innerHTML || dateSpan.textContent) {
            const tempContainer = document.createElement('div');
            tempContainer.appendChild(dateSpan);
            tempContainer.appendChild(timeSpan);
            footerHtml = tempContainer.innerHTML;
        }
    } else if (noteElement) {
        // Fallback to DOM if object not found (rare)
        const noteHeaderInfo = noteElement.querySelector('.note-header-info');
        if (noteHeaderInfo && noteHeaderInfo.innerText.trim() !== '') {
            footerHtml = noteHeaderInfo.innerHTML;
        }
    }

    if (footerHtml && footerToolbar) {
        const footer = document.createElement('div');
        footer.className = 'modal-note-footer';
        footer.innerHTML = footerHtml;
        footerToolbar.appendChild(footer); // Append to toolbar instead of box
    }

    copyBtn.innerHTML = copyIconSvg;
    // --- Логика за навигация между бележките ---
    const prevBtn = document.getElementById('prev-note-btn');
    const nextBtn = document.getElementById('next-note-btn');
    const deleteBtn = document.getElementById('delete-modal-btn');

    // Показваме/скриваме бутона за изтриване
    // --- КОРЕКЦИЯ: Разрешаваме изтриване и в режим "Локална папка" ---
    if ((useIndexedDb || updateGDrive || useLocalFolder) && (currentNoteObj || noteElement) && !isPromo && !options.readonly) {
        deleteBtn.style.display = 'flex';
        // Премахваме стари event listeners и добавяме нов
        const newDeleteBtn = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
        newDeleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();
            await handleNoteDelete(gdidForLookup, idForLookup, true);
        });

    } else {
        deleteBtn.style.display = 'none';
    }
    if (noteElement && !options.readonly) {
        const visibleNotes = Array.from(notesContainer.querySelectorAll('.note-item[style*="display: flex"]'));
        const currentIndex = visibleNotes.indexOf(noteElement);
        const navigate = (direction) => {
            const newIndex = currentIndex + direction;
            if (newIndex >= 0 && newIndex < visibleNotes.length) {
                // Симулираме клик върху съседната бележка, за да се отвори в модала
                visibleNotes[newIndex].click();
            }
        };

        prevBtn.onclick = () => navigate(-1);
        nextBtn.onclick = () => navigate(1);
        // Показваме/скриваме бутоните в зависимост от позицията
        prevBtn.style.display = (currentIndex > 0) ? 'flex' : 'none';
        nextBtn.style.display = (currentIndex < visibleNotes.length - 1) ? 'flex' : 'none';
    } else {
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        const boardNameEl = document.getElementById('modal-board-name');
        if (boardNameEl) boardNameEl.style.left = '';
    }
    const bulletBtn = document.getElementById('bullet-list-btn');
    const numberedBtn = document.getElementById('numbered-list-btn');
    if (bulletBtn) bulletBtn.style.display = 'none';
    if (numberedBtn) numberedBtn.style.display = 'none';

    // --- Edit Icon for Modal (DB Mode) ---
    // Individual buttons are cleaned up when oldToolbar is removed at the top,
    // but we ensure extra cleanup for persistent buttons if needed.
    const oldCalendarBtn = document.getElementById('note-calendar-btn');
    if (oldCalendarBtn) oldCalendarBtn.remove();

    if (canEdit && footerToolbar) {
        // --- Move Button ---
        const moveBtn = document.createElement('div');
        moveBtn.id = 'note-move-btn';
        moveBtn.className = 'modal-footer-btn';
        moveBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"
                viewBox="0 0 24 24" fill="none" stroke="black"
                stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <g transform="translate(2, 2) scale(0.85)">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                <path d="M12 11l3 3-3 3"></path>
                <path d="M15 14H9"></path>
            </g></svg>`;
        moveBtn.title = _('moveNote') || 'Move to board';
        moveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showAllBoardsModal(async (newBoardId) => {
                const isEditing = modalBody.querySelector('textarea') !== null;
                const isNewNote = modalBody.dataset.isNewNote === 'true';
                if (isEditing || isNewNote) {
                    modalBody.dataset.boardId = newBoardId;
                    const b = boardsData.find(board => (board.gdid || board.id) == newBoardId);
                    const currentBoardNameEl = document.getElementById('modal-board-name');
                    if (currentBoardNameEl && b) {
                        currentBoardNameEl.textContent = b.title;
                        currentBoardNameEl.style.display = 'flex';
                        currentBoardNameEl.style.cursor = 'pointer';
                        currentBoardNameEl.style.textDecoration = 'underline';
                        currentBoardNameEl.style.fontWeight = 'bold';
                        currentBoardNameEl.title = _('goToBoard') || 'Go to board';
                        // Update click handler to point to new board
                        const newBoardEl = currentBoardNameEl.cloneNode(true);
                        currentBoardNameEl.parentNode.replaceChild(newBoardEl, currentBoardNameEl);
                        newBoardEl.addEventListener('click', () => {
                            document.getElementById('content-modal').classList.remove('visible');
                            const bBtn = document.querySelector(`.board-filter-link[data-boardid="${newBoardId}"]`);
                            if (bBtn) { bBtn.click(); } else { filterNotesByBoard(newBoardId); }
                        });
                    }
                } else {
                    const moved = await moveNoteToBoard(noteGdid, noteId, newBoardId);
                    if (moved) contentModal.classList.remove('visible');
                }
            });
        });
        footerToolbar.appendChild(moveBtn);

        // --- Calendar Button ---
        const noteObjForCalendar = currentNoteObj;
        const cDate = (noteObjForCalendar && noteObjForCalendar.calendarDate) ? parseInt(noteObjForCalendar.calendarDate, 10) : 0;
        const hasCalendarDate = cDate !== 0 && !isNaN(cDate);

        const calendarBtn = document.createElement('div');
        calendarBtn.id = 'note-calendar-btn';
        calendarBtn.className = 'modal-footer-btn';
        calendarBtn.innerHTML = hasCalendarDate ? noCalendarIconSvg : calendarIconSvg;
        calendarBtn.title = hasCalendarDate ? (_('removeFromCalendar') || "Remove from calendar") : (_('calendarButtonTooltip') || "Assign date");
        calendarBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const currentCalendarDateVal = modalBody.dataset.calendarDate;
            const isAssigned = currentCalendarDateVal && currentCalendarDateVal !== '0';
            if (isAssigned) {
                calendarBtn.style.pointerEvents = 'none';
                calendarBtn.innerHTML = `<img src="Refresh.png" style="width:22px; height:22px; animation: spin 0.8s linear infinite;">`;
                await updateNoteCalendarDate({ id: noteId, gdid: noteGdid }, { getTime: () => 0 });
                calendarBtn.style.pointerEvents = 'auto';
                calendarBtn.innerHTML = calendarIconSvg;
                calendarBtn.title = _('calendarButtonTooltip') || "Assign date";
                modalBody.dataset.calendarDate = "0";
            } else {
                if (modalBody.querySelector('textarea')) await saveEditedNote();
                noteToAssignDate = { id: modalBody.dataset.id || noteId, gdid: modalBody.dataset.gdid || noteGdid };
                contentModal.classList.remove('visible');
                renderCalendarView();
            }
        });
        footerToolbar.appendChild(calendarBtn);

        // --- Duplicate (Copy) Button ---
        const noteDuplicateBtn = document.createElement('div');
        noteDuplicateBtn.id = 'note-duplicate-btn';
        // Use a custom SVG to match the scale and style of other footer buttons
        noteDuplicateBtn.innerHTML = copyIconSvg;
        noteDuplicateBtn.className = 'modal-footer-btn';
        noteDuplicateBtn.title = _('copyNoteTooltip') || 'Copy note';
        noteDuplicateBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (!currentNoteObj) return;

            // Clone the note object
            const noteCopy = JSON.parse(JSON.stringify(currentNoteObj));

            // Assign new unique IDs using global variables
            // Ensure the new ID does not collide with any existing note
            let maxExistingId = noteId;
            for (const n of allNotesData) {
                const nid = parseInt(n.id, 10);
                if (!isNaN(nid) && nid > maxExistingId) maxExistingId = nid;
            }
            noteId = maxExistingId + 1;
            noteNumord++;
            syncFolderDataAsync();
            const newId = noteId;
            const newNumord = noteNumord;


            noteCopy.id = newId;
            noteCopy.gdid = String(newId); // Temporary GDID
            noteCopy.numord = newNumord;
            noteCopy.date = Date.now();
            noteCopy.datemod = Date.now();
            noteCopy.isNewNote = true; // Mark as new for save logic

            // Close original modal
            contentModal.classList.remove('visible');

            // Small delay to ensure clean transition
            setTimeout(() => {
                showModal({
                    raw: noteCopy.notetxt || noteCopy.text || "",
                    format: noteCopy.text_span,
                    titleFormat: noteCopy.title_span,
                    color: (typeof noteCopy.color === 'number' && noteCopy.color >= 0 && noteCopy.color < noteColorMap.length) ? noteColorMap[noteCopy.color] : (typeof noteCopy.color === 'string' ? noteCopy.color : noteColorMap[0]),
                    boardId: noteCopy.boardid,
                    id: noteCopy.id,
                    isNewNote: true,
                    originalNote: noteCopy
                });

                // Switch to edit mode automatically
                setTimeout(() => {
                    const mBody = document.getElementById('modal-body');
                    if (mBody) {
                        enableNoteEditing(mBody);
                        showToast(_('copyNoteMessage'), 4000);
                    }
                }, 250);
            }, 400);
        });
        footerToolbar.appendChild(noteDuplicateBtn);

        // --- Search Button ---
        const searchBtn = document.createElement('div');
        searchBtn.id = 'note-search-btn';
        searchBtn.className = 'modal-footer-btn';
        searchBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16" y2="16" />
            </svg>
            `;
        searchBtn.title = _('searchInNoteTooltip') || "Search in note";
        searchBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleModalSearch(modalContentBox, modalBody);
        });
        footerToolbar.appendChild(searchBtn);

        // --- Edit / Restore Button ---
        const editBtn = document.createElement('div');
        editBtn.id = 'note-edit-btn';
        editBtn.className = 'modal-footer-btn';

        if (currentNoteObj && currentNoteObj.status === 1) {
            // Restore button for notes in trash
            editBtn.innerHTML = emptyTrashIconSvg;
            // Override styles for the smaller modal button context
            const editSvg = editBtn.querySelector('svg');
            if (editSvg) {
                editSvg.style.width = '22px';
                editSvg.style.height = '22px';
                editSvg.setAttribute('stroke', 'black');
            }
            editBtn.title = _('restoreNoteTooltip') || "Възстанови бележката";
            editBtn.addEventListener('click', async (e) => {
                e.stopPropagation();
                // Move note back to its original board
                const moved = await moveNoteToBoard(noteGdid, noteId, currentNoteObj.boardid);
                if (moved !== false) {
                    contentModal.classList.remove('visible');
                    // showToast(_('noteRestoredSuccess') || "Бележката е възстановена.", 3000);
                }
            });
        } else {
            // Standard edit button
            editBtn.innerHTML = pencilIconSvg;
            editBtn.title = _('editNoteTooltip') || "Edit note";
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                enableNoteEditing(modalBody);
            });
        }

        footerToolbar.appendChild(editBtn);
    }
}

function toggleModalSearch(modalContentBox, modalBody) {
    const toolbar = modalContentBox.querySelector('.modal-footer-toolbar');
    let searchBar = modalContentBox.querySelector('.modal-search-bar');

    const restoreContent = () => {
        if (modalBody.querySelector('textarea')) {
            // In edit mode, we just trigger handleEditInput to refresh backdrop (clears marks)
            const textareas = modalBody.querySelectorAll('textarea');
            textareas.forEach(ta => {
                const backdrop = document.getElementById(ta.id + '-backdrop');
                if (backdrop) handleEditInput(ta, backdrop);
            });
            return;
        }
        if (modalBody.dataset.renderedHtml) {
            modalBody.innerHTML = modalBody.dataset.renderedHtml;
        }
    };

    if (searchBar) {
        searchBar.remove();
        restoreContent();
        return;
    }

    searchBar = document.createElement('div');
    searchBar.className = 'modal-search-bar';

    // We prepend it to the toolbar if possible
    if (toolbar) {
        toolbar.insertBefore(searchBar, toolbar.firstChild);
    } else {
        modalContentBox.appendChild(searchBar);
    }

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = _('searchPlaceholder') || 'Search...';
    Object.assign(input.style, {
        flex: '1',
        border: 'none',
        padding: '5px',
        fontSize: '14px',
        outline: 'none',
        background: 'transparent',
        width: '100%'
    });

    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"></line>
        <polyline points="12 5 19 12 12 19"></polyline>
    </svg>`;
    nextBtn.title = _('nextHighlight') || "Next";
    Object.assign(nextBtn.style, {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 8px',
        color: '#333'
    });
    nextBtn.onclick = (e) => {
        e.stopPropagation();
        if (highlights.length > 0) {
            currentIdx = (currentIdx + 1) % highlights.length;
            scrollToHighlight();
        }
    };

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>`;
    Object.assign(closeBtn.style, {
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 8px',
        color: '#666'
    });

    searchBar.appendChild(input);
    searchBar.appendChild(nextBtn);
    searchBar.appendChild(closeBtn);
    // REMOVED redundant modalContentBox.appendChild(searchBar) which moved it to the bottom

    input.focus();

    let highlights = [];
    let currentIdx = -1;

    const performSearch = () => {
        const query = input.value.trim();
        restoreContent(); // Винаги започваме от чисто съдържание
        highlights = [];
        currentIdx = -1;

        if (query.length < 2) return;

        const regex = new RegExp(`(${query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');

        // Търсим само в текстовите елементи
        const walker = document.createTreeWalker(modalBody, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        nodes.forEach(node => {
            const text = node.textContent;
            if (regex.test(text)) {
                const fragment = document.createDocumentFragment();
                let lastIdx = 0;
                text.replace(regex, (match, p1, offset) => {
                    // Текст преди съвпадението
                    fragment.appendChild(document.createTextNode(text.substring(lastIdx, offset)));
                    // Самият маркер
                    const mark = document.createElement('mark');
                    mark.className = 'modal-search-highlight';
                    mark.textContent = match;
                    Object.assign(mark.style, {
                        backgroundColor: '#ffff00', // Ярко жълто
                        color: 'black',
                        padding: '0',
                        borderRadius: '2px',
                        fontWeight: 'bold'
                    });
                    fragment.appendChild(mark);
                    highlights.push(mark);
                    lastIdx = offset + match.length;
                });
                fragment.appendChild(document.createTextNode(text.substring(lastIdx)));
                node.parentNode.replaceChild(fragment, node);
            }
        });

        if (highlights.length > 0) {
            currentIdx = 0;
            scrollToHighlight();
        }
    };

    const scrollToHighlight = () => {
        highlights.forEach((h, i) => {
            h.style.backgroundColor = (i === currentIdx) ? '#ff9900' : '#ffff00'; // Наситено оранжево за активното
            h.style.boxShadow = (i === currentIdx) ? '0 0 5px rgba(0,0,0,0.3)' : 'none';
        });
        if (highlights[currentIdx]) {
            highlights[currentIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    input.addEventListener('input', performSearch);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            if (highlights.length > 0) {
                currentIdx = (currentIdx + 1) % highlights.length;
                scrollToHighlight();
            }
        }
        if (e.key === 'Escape') {
            searchBar.remove();
            restoreContent();
        }
    });

    closeBtn.onclick = () => {
        searchBar.remove();
        restoreContent();
    };
}

const fullscreenExpandIconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
const fullscreenCompressIconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6m10-10h-6V4m0 6l7-7M3 21l7-7"></path></svg>`;

function toggleHeaderFullscreen() {
    const header = document.querySelector('header');
    if (!header) return;
    const isCurrentlyHidden = header.classList.contains('header-fullscreen');
    if (isCurrentlyHidden) {
        header.classList.remove('header-fullscreen');
        localStorage.removeItem('isHeaderHidden');
    } else {
        header.classList.add('header-fullscreen');
        localStorage.setItem('isHeaderHidden', 'true');
    }
    const boardsModal = document.getElementById('boards-menu-modal');
    if (boardsModal) boardsModal.classList.remove('visible');
    updateHeaderFullscreenUI();
    adjustFullscreenSearchLayout();
}

function updateHeaderFullscreenUI() {
    const header = document.querySelector('header');
    const isHidden = header && header.classList.contains('header-fullscreen');
    document.querySelectorAll('.fullscreen-toggle-btn').forEach(btn => {
        btn.innerHTML = isHidden ? fullscreenCompressIconSvg : fullscreenExpandIconSvg;
        btn.title = isHidden ? (_('restoreHeaderTooltip') || 'Покажи хедъра') : (_('toggleFullscreenTooltip') || 'Цял екран (Скрий хедъра)');
    });
}

function adjustFullscreenSearchLayout() {
    const header = document.querySelector('header');
    const isFullscreen = header && header.classList.contains('header-fullscreen');
    const searchBox = document.getElementById('search-box');
    const searchIcon = document.querySelector('.search-icon-static');
    const fsBoardLabel = document.getElementById('fullscreen-board-label');
    if (!searchBox || !searchIcon) return;
    if (isFullscreen && fsBoardLabel && fsBoardLabel.textContent) {
        const labelWidth = fsBoardLabel.offsetWidth;
        const offset = labelWidth + 5;
        searchIcon.style.left = (offset + 5) + 'px';
        searchBox.style.paddingLeft = (offset + 34) + 'px';
    } else {
        searchIcon.style.left = '';
        searchBox.style.paddingLeft = '';
    }
}

function initHeaderFullscreen() {
    const isHidden = localStorage.getItem('isHeaderHidden') === 'true';
    if (isHidden) {
        const header = document.querySelector('header');
        if (header) header.classList.add('header-fullscreen');
    }
    updateHeaderFullscreenUI();
    adjustFullscreenSearchLayout();
}

function showAllBoardsModal(onSelectCallback = null) {
    const modalContent = document.createElement('div');
    const boardsModal = document.getElementById('boards-menu-modal');
    updateHeaderFullscreenUI();
    modalContent.className = 'all-boards-modal-container';
    // Взимаме всички бутони от главното меню в хедъра
    const headerMenuContainer = document.querySelector('header .board-menu-container');
    if (!headerMenuContainer) return; // Предпазна мярка
    const headerButtons = headerMenuContainer.querySelectorAll('.board-filter-link');
    const modalUtilWidth = Math.max(30, Math.floor((maxWidthForButtons - 10) / 2));
    headerButtons.forEach(button => {
        const clone = button.cloneNode(true);
        const isUtil = (button.dataset.boardid === 'reorder' || button.dataset.boardid === 'fullscreen');
        if (!isUtil) {
            clone.style.width = `${maxWidthForButtons}px`;
        } else {
            clone.style.width = `${modalUtilWidth}px`;
            clone.style.minWidth = '30px';
            clone.style.padding = '0';
        }
        modalContent.appendChild(clone);
    });
    // Делегиран слушател за събития върху контейнера на модала
    modalContent.addEventListener('click', (e) => {
        const targetButton = e.target.closest('.board-filter-link');
        if (targetButton) {
            e.preventDefault();
            const boardId = targetButton.dataset.boardid;

            if (boardId === 'fullscreen') {
                toggleHeaderFullscreen();
                return;
            }

            if (onSelectCallback) {
                onSelectCallback(boardId);
                boardsModal.classList.remove('visible');
                return;
            }

            // Намираме съответния бутон в хедъра
            const headerButton = headerMenuContainer.querySelector(`.board-filter-link[data-boardid="${boardId}"]`);
            if (headerButton) {
                // Затваряме модала
                boardsModal.classList.remove('visible');
                // Симулираме клик върху бутона в хедъра
                headerButton.click();
            }
        }
    });
    const boardsModalBody = document.getElementById('boards-menu-modal-body');
    boardsModalBody.innerHTML = '';
    boardsModalBody.appendChild(modalContent);
    // --- Calculate optimal width to fit columns exactly ---
    let buttonWidth = maxWidthForButtons;
    // Fallback if global variable is not set or 0
    if (!buttonWidth) {
        const tempClone = modalContent.querySelector('.board-filter-link');
        if (tempClone) {
            // Try to get width from inline style first, then estimated
            buttonWidth = parseFloat(tempClone.style.width) || 150;
        }
    }
    if (buttonWidth) {
        const gap = 10;
        const paddingOverhead = 40; // Exact fit: ContainerPadding (20px) + Scrollbar (approx 17px) + Buffer
        const availableWidth = window.innerWidth * 0.95; // Max allowed width (95% of screen)
        let cols = Math.floor((availableWidth - paddingOverhead + gap) / (buttonWidth + gap));
        cols = Math.max(1, cols); // At least 1 column
        const optimalWidth = cols * (buttonWidth + gap) - gap + paddingOverhead;
        const modalBox = boardsModal.querySelector('.modal-content-box');
        if (modalBox) {
            modalBox.style.width = `${optimalWidth}px`;
            modalBox.style.maxWidth = '95vw'; // Ensure it doesn't overflow viewport width logic
        }
    }
    boardsModal.classList.add('visible');
}

function formatDate(dateString) {
    if (!dateString) return '';
    try {
        // Проверка: ако е низ, който е чисто числово (timestamp), го превръщаме в число
        const parsedValue = !isNaN(dateString) && !isNaN(parseFloat(dateString)) ? Number(dateString) : dateString;
        const date = new Date(parsedValue);
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
        const parsedValue = !isNaN(timestamp) && !isNaN(parseFloat(timestamp)) ? Number(timestamp) : timestamp;
        const date = new Date(parsedValue);
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

/**
 * Филтрира бележките по избран борд.
 * @param {string|number} boardId - ID-то на борда.
 * @param {boolean} [shouldScroll=false] - Дали да се скролира менюто до избрания борд.
 */
async function filterNotesByBoard(boardId, shouldScroll = false, clickedElement = null) {
    // --- ПРОВЕРКА ЗА КОНФЛИКТ: Стартов борд, който е скрит ---
    // Ако стартовият борд е "Всички", но е скрит, избираме първия наличен борд.
    if (boardId === 'all' && localStorage.getItem('showBoardAll') === 'false') {
        // Взимаме първия видим борд (който не е специален)
        const firstAvailableBoard = boardsData.find(b => b.gdid);
        boardId = firstAvailableBoard ? firstAvailableBoard.gdid : 'all'; // Fallback to 'all' if no other boards exist
    }
    // Същата логика за "Напомняния"
    if (boardId === 'reminder' && localStorage.getItem('showBoardRemind') === 'false') {
        const firstAvailableBoard = boardsData.find(b => b.gdid);
        boardId = firstAvailableBoard ? firstAvailableBoard.gdid : 'all';
    }
    const specialBoards = ['all', 'calendar', 'calendar_monthly', 'calendar_weekly', 'reminder', 'new-updates', 'search-results', 'with-photos', 'with-videos', 'with-sounds', 'with-other', 'trash'];
    const targetBoard = specialBoards.includes(boardId) ? null : boardsData.find(b => b.gdid == boardId || b.id == boardId);
    const buttonBoardId = targetBoard ? (targetBoard.gdid || targetBoard.id) : boardId;
    // --- Проверка за съществуващ борд ---
    // Ако boardId не е специален изглед ('all', 'calendar', 'reminder', 'new-updates')
    // и не съществува в boardsData, превключваме към 'all'.
    if (!specialBoards.includes(boardId)) {
        // --- КОРЕКЦИЯ ЗА РЕЖИМИ НА РАБОТА ---
        // В режим "Архив" (useArhDb), бележките се свързват с борда по числов `id`.
        // В другите режими - по текстов `gdid`.
        // Бутоните за филтриране винаги подават `gdid`.
        // Тази логика проверява дали бордът съществува и задава правилния
        // идентификатор за филтриране (`currentBoardFilter`).
        let boardToFilter = null;
        // Търсим борда по gdid или id, който идва от клик на бутон
        const board = boardsData.find(b => b.gdid == boardId || b.id == boardId);
        if (board) {
            // Ако сме в режим Архив, ще филтрираме по числовото `id`.
            // В противен случай - по `gdid`.
            boardToFilter = useArhDb ? board.id : board.gdid;
        }
        // Проверяваме дали сме намерили борд. `boardId` е оригиналният gdid/id от бутона.
        const boardExists = boardsData.some(b => b.gdid == boardId || b.id == boardId);
        if (!boardExists) {
            console.warn(`Board with ID '${boardId}' not found. Defaulting to 'all'.`);
            boardId = 'all';
        }
    }
    const searchInput = document.getElementById('search-box'); // The search input field
    // --- КОРЕКЦИЯ: Първо скролираме, после анимираме ---
    // Преместваме логиката за скролиране в началото.
    if (shouldScroll) {
        // --- КОРЕКЦИЯ: Използваме requestAnimationFrame, за да сме сигурни, че елементът е рендиран ---
        // Това решава проблема с позиционирането при първоначално зареждане на тесен екран.
        requestAnimationFrame(() => {
            const selectedButtonInMenu = document.querySelector(`.board-menu-container .board-filter-link[data-boardid="${buttonBoardId}"]`);
            if (selectedButtonInMenu) {
                selectedButtonInMenu.scrollIntoView({
                    behavior: 'smooth',
                    inline: 'center',
                    block: 'nearest'
                });
            }
        });
    }
    if (boardId === 'calendar' || boardId === 'calendar_monthly' || boardId === 'calendar_weekly') {
        // Проверяваме коя версия на календара да покажем
        if (boardId === 'calendar_weekly') {
            renderWeeklyCalendarView();
        } else if (boardId === 'calendar_monthly') {
            renderCalendarView();
        } else {
            // Standard 'calendar' behavior (respects last view)
            if (localStorage.getItem('showWeeklyCalendar') === 'true') {
                renderWeeklyCalendarView();
            } else {
                renderCalendarView();
            }
        }
        return;
    }
    if (boardId !== 'search-results') {
        searchInput.value = ''; // Clear the search box
        saveSearchBtn.style.display = 'none';
        const searchBoardBtn = document.getElementById('search-results-board-btn');
        if (searchBoardBtn) {
            searchBoardBtn.style.display = 'none';
            searchBoardBtn.classList.remove('selected-board', 'active');
        }
        const clearBtn = document.querySelector('.search-btn-clear');
        if (clearBtn) clearBtn.style.display = 'none';
    }
    // Задаваме правилния филтър (числов id за Архив/ID-базирана база, gdid за другите)
    // Използваме dbNoteIdTypeGlobal, ако е налично, за да определим типа на връзката
    const useIdFilter = (typeof dbNoteIdTypeGlobal !== 'undefined' && dbNoteIdTypeGlobal === 'id') || useArhDb;
    currentBoardFilter = specialBoards.includes(boardId) ? boardId : (useIdFilter ? boardsData.find(b => b.gdid == boardId || b.id == boardId)?.id : boardId);
    // --- Скриваме контейнера с бележки преди смяна на борда, за да избегнем мигане ---
    notesContainer.style.visibility = 'hidden';
    // --- Маркираме избрания бутон и задаваме визуалното състояние (active + height). ---
    document.querySelectorAll('.board-filter-link').forEach(link => {
        const isSelected = link.dataset.boardid === String(buttonBoardId);
        link.classList.toggle('selected-board', isSelected);
        link.classList.toggle('active', isSelected);
        link.style.height = isSelected ? '39px' : '35px';
    });
    // Обновяваме етикета за борд във fullscreen mode
    const fsBoardLabel = document.getElementById('fullscreen-board-label');
    if (fsBoardLabel) {
        const board = boardsData.find(b => b.gdid == boardId || b.id == boardId);
        fsBoardLabel.textContent = board ? board.title : (boardId === 'all' ? (_('allBoards') || 'All') : boardId);
        adjustFullscreenSearchLayout();
    }
    // --- Сменяме фона на body ПРЕДИ филтрирането ---
    if (boardId === 'all') {
        if (currentBackground !== 'Board.png') {
            document.body.style.backgroundImage = '';
        }
        currentBackground = 'Board.png';
    } else {
        let newBackground = 'Board.png';
        const board = boardsData.find(b => b.gdid === boardId || b.id == boardId);

        if (board && board.backpath && !board.backpath.includes('/')) {
            const cacheKey = board.backpath;
            if (customBgCache.has(cacheKey)) {
                document.body.style.backgroundImage = `url('${customBgCache.get(cacheKey)}')`;
            } else {
                const loadCustomBg = async () => {
                    const url = `https://www.googleapis.com/drive/v3/files/${board.backpath}?alt=media`;
                    try {
                        const cache = await caches.open('app-cache');
                        let response = await cache.match(url);
                        if (!response) {
                            const token = (typeof authToken !== 'undefined' && authToken) ? authToken.access_token : null;
                            if (!token) throw new Error("No token");
                            response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
                            if (response.ok) {
                                cache.put(url, response.clone());
                            } else {
                                console.warn("Failed to fetch custom bg, reverting to default");
                                board.backpath = "";
                                board.backnum = 0;
                                document.body.style.backgroundImage = `url('Board.png')`;
                                return;
                            }
                        }
                        const blob = await response.blob();
                        const objectUrl = URL.createObjectURL(blob);
                        customBgCache.set(cacheKey, objectUrl);
                        document.body.style.backgroundImage = `url('${objectUrl}')`;
                    } catch (e) {
                        console.warn("Error loading custom bg:", e);
                        document.body.style.backgroundImage = `url('Board.png')`;
                    }
                };
                loadCustomBg();
            }
        } else if (board && board.backnum) {
            switch (board.backnum) {
                case 1: newBackground = 'Board1.png'; break;
                case 2: newBackground = 'Board2.png'; break;
                case 3: newBackground = 'Board3.png'; break;
            }
            document.body.style.backgroundImage = `url('${newBackground}')`;
        } else {
            document.body.style.backgroundImage = `url('${newBackground}')`;
        }
        currentBackground = newBackground;
    }
    // --- НОВА ЛОГИКА: Анимация в бутона за режим ---
    const modeButton = document.getElementById('mode_button');
    const loadingIcon = modeButton ? modeButton.querySelector('#mode-button-loading-icon') : null;
    let animationStartTime = 0;
    const runFilter = () => {
        applyFilters();
        // Показваме контейнера след като филтрирането е приключило
        // Използваме requestAnimationFrame, за да сме сигурни, че браузърът е готов за рисуване
        requestAnimationFrame(() => {
            notesContainer.style.visibility = '';
        });
        // Спираме анимацията СЛЕД като браузърът е прерисувал екрана
        if (modeButton && loadingIcon) {
            modeButton.classList.remove('mode-button-loading');
            loadingIcon.classList.remove('button-loading');
            if (typeof debug !== 'undefined' && debug) {
                setTimeout(() => {
                    const duration = performance.now() - animationStartTime;
                    let logName = boardId;
                    if (boardId !== 'all' && typeof boardsData !== 'undefined') {
                        const b = boardsData.find(b => b.gdid === boardId || b.id === boardId);
                        if (b) logName = b.title;
                    }
                    const noteCounter = document.getElementById('note-counter');
                    const count = noteCounter ? noteCounter.textContent : '0';
                    console.log(`Board "${logName}" (${count} notes) render duration: ${duration.toFixed(0)}ms`);
                }, 0);
            }
        }
    };
    if (modeButton && loadingIcon) {
        animationStartTime = performance.now();
        modeButton.classList.add('mode-button-loading');
        loadingIcon.classList.add('button-loading');
        // Използваме setTimeout, за да позволим на браузъра да рендира анимацията
        // преди да започне тежката операция по филтриране.
        setTimeout(runFilter, 10);
    } else {
        runFilter();
    }
    updateSearchPlaceholder();
    window.dispatchEvent(new Event('scroll'));
    // --- КОРЕКЦИЯ: Възстановяване на UI след затваряне на календара ---
    // Тъй като renderCalendarView скрива хедъра и контейнера с бележки,
    // тук трябва изрично да ги покажем отново, ако не сме в режим календар.
    if (boardId !== 'calendar') {
        const calendarContainer = document.getElementById('calendar-container');
        if (calendarContainer) calendarContainer.style.display = 'none';
        // Възстановяваме видимостта на основните елементи
        document.querySelector('header').style.display = 'flex';
        notesContainer.style.display = 'flex';
        // scrollTopBtn visibility is handled by the scroll event
        // scrollTopBtn.style.display = 'block';
        const addNoteFab = document.getElementById('add-note-fab');
        if (addNoteFab) addNoteFab.style.display = 'flex';
    }
    // Add or remove a class from the container to control child visibility
    // This part is no longer needed as calendar has its own view
    notesContainer.classList.remove('calendar-view');
}

/* --- PROMO NOTE LOGIC START --- */
let promoNoteElement = null;
let isFetchingPromo = false;
let lastPromoBoardFilter = null;
let promoImageIndex = parseInt(localStorage.getItem('promoImageIndex') || '0');

const promoImagesList = [
    "1764551652828.jpg", "1764551676242.jpg", "1764551691209.jpg", "1764551755697.jpg",
    "1764553894822.jpg", "1764553917946.jpg", "1764553933512.jpg", "1764553941918.jpg",
    "1764553952897.jpg", "1764553963870.jpg", "1764553974033.jpg", "1764553984943.jpg",
    "1764553993077.jpg", "1764554001197.jpg", "1764554007494.jpg", "1764554013461.jpg",
    "1764554019417.jpg", "1764554055674.jpg", "1764554064490.jpg", "1764554083159.jpg",
    "1764554091671.jpg", "1764554098238.jpg", "1764554106965.jpg", "1764554137382.jpg",
    "1764554248286.jpg", "1764554317449.jpg", "1764554407319.jpg", "1764554540104.jpg"
];

function updatePromoImage() {
    if (!promoNoteElement) return;
    // Safety check: if dismissed in current board, do not load new image
    if (currentBoardFilter && localStorage.getItem(`dismissedPromo_${currentBoardFilter}`) === 'true') {
        return;
    }
    const img = promoNoteElement.querySelector('img');
    if (img) {
        const imageFile = promoImagesList[promoImageIndex % promoImagesList.length];
        img.src = `msm-ex/${imageFile}`;
        promoImageIndex++;
        localStorage.setItem('promoImageIndex', promoImageIndex);
    }
}

function initPromoNote() {
    if (promoNoteElement || isFetchingPromo) return;

    // Early escape if dismissed in current board
    if (currentBoardFilter && localStorage.getItem(`dismissedPromo_${currentBoardFilter}`) === 'true') {
        return;
    }

    isFetchingPromo = true;

    const imageFile = promoImagesList[promoImageIndex % promoImagesList.length];
    const imgUrl = `msm-ex/${imageFile}`;
    promoImageIndex++;
    localStorage.setItem('promoImageIndex', promoImageIndex);

    if (imgUrl) {
        promoNoteElement = document.createElement('div');
        promoNoteElement.className = 'note promo-note';
        promoNoteElement.dataset.isPromo = 'true';
        promoNoteElement.style.display = 'none'; // Ensure it starts hidden in JS too

        // Note with image style - refined to use CSS for most parts
        promoNoteElement.innerHTML = `
            <div class="note-content">
                <img src="${imgUrl}" loading="lazy" alt="Assistant">
            </div>
            <div class="promo-close" style="position:absolute; top:4px; right:4px; cursor:pointer; background:rgba(255,255,255,0.7); border-radius:50%; width:24px; height:24px; display:flex; align-items:center; justify-content:center; font-size:16px; z-index:10; transition: all 0.2s;">&times;</div>
        `;

        // Click handler to open the image in the large modal
        promoNoteElement.addEventListener('click', (e) => {
            if (e.target.classList.contains('promo-close')) {
                promoNoteElement.style.display = 'none';
                // Записваме, че в ТОЗИ борд снимката е затворена
                if (currentBoardFilter) {
                    localStorage.setItem(`dismissedPromo_${currentBoardFilter}`, 'true');
                }
                return;
            }
            const img = promoNoteElement.querySelector('img');
            const currentSrc = img ? img.src : imgUrl;
            showModal({
                raw: `<img src="${currentSrc}" style="width:100%; height:100%; max-height:100%; object-fit:contain; display:block;">`,
                format: '',
                isHtml: true,
                color: '#222',
                id: 'promo',
                gdid: 'promo',
                boardId: 'promo'
            });
        });

    }
    isFetchingPromo = false;
}
/* --- PROMO NOTE LOGIC END --- */

function getSortStatusFromControls(criteriaName, reverseId, remindersTopId) {
    const criteriaRadio = document.querySelector(`input[name="${criteriaName}"]:checked`);
    const criteriaValue = criteriaRadio ? criteriaRadio.value : 'numord';
    const reverse = document.getElementById(reverseId)?.checked;
    const remindersTop = document.getElementById(remindersTopId)?.checked;
    const valueMap = { 'numord': 10, 'color': 11, 'date': 12, 'datemod': 13, 'calendarDate': 14, 'alpha': 15 };
    const baseStatus = valueMap[criteriaValue] || 10;
    let modifiers = '';
    if (reverse) modifiers += '1';
    if (remindersTop) modifiers += '2';
    return parseInt(baseStatus.toString() + modifiers);
}

function ensureBoardSortOptionsCloned() {
    const destContainer = document.getElementById('board-sort-options-container');
    if (!destContainer || destContainer.children.length > 0) return;
    const sourceContainer = document.querySelector('#sorting-options-section .sort-options-container');
    if (!sourceContainer) return;
    const cloned = sourceContainer.cloneNode(true);

    const radios = cloned.querySelectorAll('input[type="radio"]');
    radios.forEach(r => r.name = "board-sort-criteria");

    const reverseCheck = cloned.querySelector('#sort-reverse-checkbox');
    if (reverseCheck) reverseCheck.id = "board-sort-reverse-checkbox";

    const remindersTop = cloned.querySelector('#sort-reminders-top-checkbox');
    if (remindersTop) remindersTop.id = "board-sort-reminders-top-checkbox";

    destContainer.appendChild(cloned);
}

function applySortStatusToControls(status, criteriaName, reverseId, remindersTopId) {
    let criteria = 'numord';
    let modifiers = '';
    if (status >= 10) {
        const statStr = String(status);
        const baseStat = parseInt(statStr.substring(0, 2));
        modifiers = statStr.substring(2);
        const criteriaMap = { 10: 'numord', 11: 'color', 12: 'date', 13: 'datemod', 14: 'calendarDate', 15: 'alpha' };
        criteria = criteriaMap[baseStat] || 'numord';
    }
    const radio = document.querySelector(`input[name="${criteriaName}"][value="${criteria}"]`);
    if (radio) radio.checked = true;
    const reverseCheck = document.getElementById(reverseId);
    if (reverseCheck) reverseCheck.checked = modifiers.includes('1');
    const remindersTopCheck = document.getElementById(remindersTopId);
    if (remindersTopCheck) remindersTopCheck.checked = modifiers.includes('2');
}

function getSystemBoardSortKey(boardId) {
    return `systemBoardSort_${boardId}`;
}

function getSystemBoardSortStatus(boardId) {
    const raw = localStorage.getItem(getSystemBoardSortKey(boardId));
    const status = parseInt(raw, 10);
    return Number.isFinite(status) ? status : 0;
}

function applySortStatusToVariables(status, fallback) {
    if (status < 10) return fallback;
    const statStr = String(status);
    const baseStat = parseInt(statStr.substring(0, 2));
    const modifiers = statStr.substring(2);
    const criteriaMap = { 10: 'numord', 11: 'color', 12: 'date', 13: 'datemod', 14: 'calendarDate', 15: 'alpha' };
    return {
        sortCriteria: criteriaMap[baseStat] || fallback.sortCriteria,
        sortReverse: modifiers.includes('1'),
        sortRemindersTop: modifiers.includes('2')
    };
}

function getSystemBoardOrderEntries(extraCounts = {}) {
    const showCount = localStorage.getItem('showBoardNoteCount') === 'true';
    const entries = [];
    if (localStorage.getItem('showBoardAll') !== 'false') {
        entries.push({ key: 'system:all', title: _('allBoards'), boardId: 'all', className: 'all-boards-filter-btn' });
    }
    if (updatedNoteGdims.length > 0 && localStorage.getItem('showNewBoard') === 'true') {
        entries.push({ key: 'system:new-updates', title: _('newUpdates'), boardId: 'new-updates', className: 'new-updates-filter-btn' });
    }
    if (localStorage.getItem('showBoardRemind') !== 'false') {
        const count = extraCounts.reminderCount || 0;
        entries.push({ key: 'system:reminder', title: showCount && count > 0 ? `${_('reminder')} (${count})` : _('reminder'), boardId: 'reminder', className: 'reminder-filter-btn' });
    }
    if (localStorage.getItem('showPhotosBoard') === 'true') {
        entries.push({ key: 'system:with-photos', title: _('photosBoardTitle') || "With Photos", boardId: 'with-photos', className: 'photos-filter-btn' });
    }
    if (localStorage.getItem('showVideosBoard') === 'true') {
        entries.push({ key: 'system:with-videos', title: _('videosBoardTitle') || "With Video", boardId: 'with-videos', className: 'videos-filter-btn' });
    }
    if (localStorage.getItem('showSoundsBoard') === 'true') {
        entries.push({ key: 'system:with-sounds', title: _('soundsBoardTitle') || "With Sounds", boardId: 'with-sounds', className: 'sounds-filter-btn' });
    }
    if (localStorage.getItem('showOtherBoard') === 'true') {
        entries.push({ key: 'system:with-other', title: _('otherBoardTitle') || "Other Attachments", boardId: 'with-other', className: 'other-filter-btn', backgroundColor: '#a6a6a6' });
    }
    if (localStorage.getItem('showTrashBoard') !== 'false') {
        const count = extraCounts.trashCount || 0;
        entries.push({ key: 'system:trash', title: showCount && count > 0 ? `${_('trashBoardTitle') || "Кошче"} (${count})` : (_('trashBoardTitle') || "Кошче"), boardId: 'trash', className: 'trash-filter-btn', backgroundColor: '#c00', color: '#fff' });
    }
    return entries;
}

function getSystemBoardEditEntries() {
    const entries = [...getSystemBoardOrderEntries()];
    if (!entries.some(entry => entry.boardId === 'search-results')) {
        entries.push({ key: 'system:search-results', title: _('searchResultTitle') || 'Search Results', boardId: 'search-results' });
    }
    return entries;
}

function getBoardOrderEntryKey(entry) {
    return entry.key || String(entry.title);
}

function orderBoardEntries(entries) {
    try {
        const raw = localStorage.getItem('boardMenuOrder');
        if (!raw) return entries;
        const savedOrder = JSON.parse(raw);
        if (!Array.isArray(savedOrder) || savedOrder.length === 0) return entries;
        const orderMap = new Map(savedOrder.map((key, index) => [String(key), index]));
        return [...entries].sort((a, b) => {
            const keyA = getBoardOrderEntryKey(a);
            const keyB = getBoardOrderEntryKey(b);
            const posA = orderMap.has(keyA) ? orderMap.get(keyA) : 9999;
            const posB = orderMap.has(keyB) ? orderMap.get(keyB) : 9999;
            return posA - posB;
        });
    } catch (e) {
        console.error("Error sorting boards:", e);
        return entries;
    }
}

function orderBoardEntriesByVisibleMenu(entries) {
    const entryByKey = new Map(entries.map(entry => [getBoardOrderEntryKey(entry), entry]));
    const entryByBoardId = new Map(entries.map(entry => [String(entry.boardId), entry]));
    const menuEntries = [];
    const usedKeys = new Set();

    document.querySelectorAll('.board-menu-container .board-filter-link').forEach(link => {
        if (link.dataset.boardid === 'reorder') return;
        if (getComputedStyle(link).display === 'none') return;
        const boardId = link.dataset.boardid;
        const board = boardsData.find(b => String(b.gdid || b.id) === String(boardId));
        const key = board && board.title ? String(board.title) : `system:${boardId}`;
        const entry = entryByKey.get(key) || entryByBoardId.get(String(boardId));
        if (entry && !usedKeys.has(getBoardOrderEntryKey(entry))) {
            menuEntries.push(entry);
            usedKeys.add(getBoardOrderEntryKey(entry));
        }
    });

    if (menuEntries.length === 0) return orderBoardEntries(entries);
    return [
        ...menuEntries,
        ...orderBoardEntries(entries).filter(entry => !usedKeys.has(getBoardOrderEntryKey(entry)))
    ];
}

function applyFilters() {
    const searchBox = document.getElementById('search-box');
    const searchTerm = searchBox ? searchBox.value.toLowerCase() : '';
    const notes = Array.from(notesContainer.getElementsByClassName('note'));
    let visibleCount = 0;
    // --- PRE-CALCULATE FILTER MODES ---
    const isAll = currentBoardFilter === 'all' || currentBoardFilter === 'search-results';
    const isReminder = currentBoardFilter === 'reminder';
    const isNewUpdates = currentBoardFilter === 'new-updates';
    const isWithPhotos = currentBoardFilter === 'with-photos';
    const isWithVideos = currentBoardFilter === 'with-videos';
    const isWithSounds = currentBoardFilter === 'with-sounds';
    const isWithOther = currentBoardFilter === 'with-other';
    const isTrash = currentBoardFilter === 'trash';
    // If none of the above special modes, it's a standard board filter (by ID)
    const isStandard = !isAll && !isReminder && !isNewUpdates && !isWithPhotos && !isWithVideos && !isWithSounds && !isWithOther && !isTrash;
    // --- ENHANCED ID FILTERING (Pre-calc) ---
    // Handle scenarios where notes use legacy ID but filter uses GDID (or vice versa)
    let validBoardIds = [currentBoardFilter];
    if (isStandard && typeof boardsData !== 'undefined') {
        const board = boardsData.find(b => b.gdid == currentBoardFilter || b.id == currentBoardFilter);
        if (board) {
            if (board.gdid) validBoardIds.push(board.gdid);
            if (board.id) validBoardIds.push(board.id);
        }
    }
    const trashSearch = localStorage.getItem('trashSearch') === 'true';
    // Pre-calc за режим "търсене в борда": кои ID-та са валидни за boardBeforeSearch
    let boardOnlyIds = [];
    const effectiveBoardBefore = (boardBeforeSearch && boardBeforeSearch !== 'all') ? boardBeforeSearch : currentBoardFilter;
    if (searchInBoardOnly && searchTerm !== '' && effectiveBoardBefore && effectiveBoardBefore !== 'all' && effectiveBoardBefore !== 'search-results') {
        boardOnlyIds = [effectiveBoardBefore];
        if (typeof boardsData !== 'undefined') {
            const bbs = boardsData.find(b => b.gdid == effectiveBoardBefore || b.id == effectiveBoardBefore);
            if (bbs) {
                if (bbs.gdid) boardOnlyIds.push(bbs.gdid);
                if (bbs.id) boardOnlyIds.push(bbs.id);
            }
        }
    }

    for (const note of notes) {
        if (note.classList.contains('boards-note') || note.classList.contains('promo-note')) {
            continue;
        }
        const isDeleted = (parseInt(note.dataset.s || '0', 10) === 1);
        let isVisibleByBoard = false;

        // Optimized Branching
        if (isTrash) {
            isVisibleByBoard = isDeleted;
        } else if (isNewUpdates) {
            const noteStatus = parseInt(note.dataset.s || '0', 10);
            isVisibleByBoard = (noteStatus === 2 || note.classList.contains('new-update'));
        } else if (isDeleted) {
            isVisibleByBoard = false;
        } else if (isAll) {
            isVisibleByBoard = true;
        } else if (isStandard) {
            // Standard board check: Check against all valid IDs for the board (loose equality)
            isVisibleByBoard = validBoardIds.some(id => note.dataset.b == id);
        } else if (isReminder) {
            isVisibleByBoard = (note.dataset.tm === '1');
        } else if (isWithPhotos) {
            isVisibleByBoard = (note.dataset.hp === '1');
        } else if (isWithVideos) {
            isVisibleByBoard = (note.dataset.hv === '1');
        } else if (isWithSounds) {
            isVisibleByBoard = (note.dataset.hs === '1');
        } else if (isWithOther) {
            isVisibleByBoard = (note.dataset.ho === '1');
        }
        // Filter by Search Term
        let matchesSearch = true;
        // OPTIMIZATION: Only access DOM textContent if there is a search term!
        if (searchTerm !== '') {
            const titleEl = note.querySelector('.note-title-truncated');
            const contentEl = note.querySelector('.note-content');
            const noteText = (titleEl ? titleEl.textContent : '') + ' ' + (contentEl ? contentEl.textContent : '');
            matchesSearch = noteText.toLowerCase().includes(searchTerm);
        }
        // Проверка за режим "търсене само в борда"
        let inBoardScope = true;
        if (searchInBoardOnly && searchTerm !== '' && boardOnlyIds.length > 0) {
            inBoardScope = boardOnlyIds.some(id => note.dataset.b == id);
        }
        if ((searchTerm !== '' ? (matchesSearch && inBoardScope && (!isDeleted || trashSearch)) : isVisibleByBoard)) {
            note.style.display = 'flex';
            visibleCount++;
            if (isNewUpdates && isDeleted) {
                if (!note.querySelector('.trash-icon-overlay')) {
                    const trashIconOverlay = document.createElement('div');
                    trashIconOverlay.className = 'trash-icon-overlay';
                    trashIconOverlay.innerHTML = emptyTrashIconSvg;
                    const wrapper = note.querySelector('.note-content-wrapper');
                    if (wrapper) wrapper.appendChild(trashIconOverlay);
                }
            }
        } else {
            note.style.display = 'none';
        }
        if (!isNewUpdates) {
            const trashOverlay = note.querySelector('.trash-icon-overlay');
            if (trashOverlay) trashOverlay.remove();
        }
    }
    // --- Sorting Logic ---
    const pinSortingEnabled = currentBoardFilter === 'all' || isStandard;
    const systemSortStatus = getSystemBoardSortStatus(currentBoardFilter);
    const systemSortOverrideEnabled = systemSortStatus >= 10;
    const reminderDateSortingEnabled = isReminder && !systemSortOverrideEnabled;
    const noteSortingEnabled = localStorage.getItem('enableNoteSorting') === 'true';
    if (noteSortingEnabled || pinSortingEnabled || reminderDateSortingEnabled || systemSortOverrideEnabled) {
        let sortCriteria = localStorage.getItem('sortCriteria') || 'numord';
        let sortReverse = localStorage.getItem('sortInReverse') === 'true';
        let sortRemindersTop = localStorage.getItem('sortRemindersTop') === 'true';

        // --- Individual Board Sort Override ---
        if (noteSortingEnabled && currentBoardFilter && currentBoardFilter !== 'trash' && currentBoardFilter !== 'reminder' && currentBoardFilter !== 'all') {
            const isArh = useArhDb || (useIndexedDb && dbSourceGlobal === 3);
            const boardToMatch = boardsData.find(b => (isArh ? b.id : b.gdid) == currentBoardFilter);
            if (boardToMatch && boardToMatch.status >= 10) {
                const statStr = String(boardToMatch.status);
                const baseStat = parseInt(statStr.substring(0, 2));
                const modifiers = statStr.substring(2);

                const criteriaMap = { 10: 'numord', 11: 'color', 12: 'date', 13: 'datemod', 14: 'calendarDate', 15: 'alpha' };
                if (criteriaMap[baseStat]) {
                    sortCriteria = criteriaMap[baseStat];
                }

                sortReverse = modifiers.includes('1');
                sortRemindersTop = modifiers.includes('2');
            }
        }
        // --- End Override ---
        if (systemSortOverrideEnabled) {
            const systemSort = applySortStatusToVariables(systemSortStatus, { sortCriteria, sortReverse, sortRemindersTop });
            sortCriteria = systemSort.sortCriteria;
            sortReverse = systemSort.sortReverse;
            sortRemindersTop = systemSort.sortRemindersTop;
        }

        const sortOrder = sortReverse ? -1 : 1;
        const visibleNotes = Array.from(notesContainer.querySelectorAll('.note:not([style*="display: none"]):not(.promo-note)'));
        visibleNotes.sort((a, b) => {
            if (a.classList.contains('boards-note')) return -1;
            if (b.classList.contains('boards-note')) return 1;
            if (pinSortingEnabled) {
                const pinA = Number(a.dataset.pin || 0);
                const pinB = Number(b.dataset.pin || 0);
                const isPinnedA = pinA > 0;
                const isPinnedB = pinB > 0;
                if (isPinnedA && !isPinnedB) return -1;
                if (!isPinnedA && isPinnedB) return 1;
                if (isPinnedA && isPinnedB && pinA !== pinB) return pinB - pinA;
            }
            if (reminderDateSortingEnabled) {
                const timerA = Number(a.dataset.tv || 0);
                const timerB = Number(b.dataset.tv || 0);
                const hasTimerA = timerA > 0;
                const hasTimerB = timerB > 0;
                if (hasTimerA && !hasTimerB) return -1;
                if (!hasTimerA && hasTimerB) return 1;
                if (hasTimerA && hasTimerB && timerA !== timerB) return timerA - timerB;
                return 0;
            }
            if (!noteSortingEnabled && !systemSortOverrideEnabled) return 0;
            // 1. Reminder Priority
            if (sortRemindersTop) {
                const isReminderA = a.dataset.tm === '1';
                const isReminderB = b.dataset.tm === '1';
                if (isReminderA && !isReminderB) return -1;
                if (!isReminderA && isReminderB) return 1;
            }
            let valA, valB;
            // 2. Main Sorting Criteria (Read from SHORT CODES in dataset)
            if (sortCriteria === 'numord') {
                valA = parseFloat(a.dataset.no || 0);
                valB = parseFloat(b.dataset.no || 0);
            } else if (sortCriteria === 'datemod') { // Last Modified
                const val = a.dataset.dm || 0;
                valA = !isNaN(val) ? Number(val) : new Date(val).getTime();
                const vB = b.dataset.dm || 0;
                valB = !isNaN(vB) ? Number(vB) : new Date(vB).getTime();
            } else if (sortCriteria === 'date') { // Creation Date
                const val = a.dataset.cd || 0;
                valA = !isNaN(val) ? Number(val) : new Date(val).getTime();
                const vB = b.dataset.cd || 0;
                valB = !isNaN(vB) ? Number(vB) : new Date(vB).getTime();
            } else if (sortCriteria === 'calendarDate') { // Calendar Date
                const val = a.dataset.cda || 0;
                valA = val ? (!isNaN(val) ? Number(val) : new Date(val).getTime()) : null;
                const vB = b.dataset.cda || 0;
                valB = vB ? (!isNaN(vB) ? Number(vB) : new Date(vB).getTime()) : null;
            } else if (sortCriteria === 'alpha') { // Alphabetical
                valA = a.querySelector('.note-title-truncated')?.textContent.trim().toLowerCase() || '';
                valB = b.querySelector('.note-title-truncated')?.textContent.trim().toLowerCase() || '';
            } else if (sortCriteria === 'color') { // Color
                valA = parseInt(a.dataset.c || -1); // data-c
                valB = parseInt(b.dataset.c || -1);
            } else {
                valA = 0; valB = 0; // Fallback
            }
            // Handle Null/Undefined values (always push to bottom)
            const aExists = valA !== null && valA !== undefined && !Number.isNaN(valA) && valA !== '';
            const bExists = valB !== null && valB !== undefined && !Number.isNaN(valB) && valB !== '';
            if (!aExists && bExists) return 1;
            if (aExists && !bExists) return -1;
            if (!aExists && !bExists) return 0;
            if (valA < valB) return -1 * sortOrder;
            if (valA > valB) return 1 * sortOrder;
            return 0;
        });
        visibleNotes.forEach(note => notesContainer.appendChild(note));
    }

    // --- PROMO NOTE LOGIC: INSERT AT RANDOM PLACE ---
    // Skip this entire logic during initial load to prevent flickering before UI is stable
    if (!isInitialLoad && localStorage.getItem('hideAssistant') !== 'true') {
        const isDismissedInBoard = currentBoardFilter && localStorage.getItem(`dismissedPromo_${currentBoardFilter}`) === 'true';

        if (isDismissedInBoard) {
            if (promoNoteElement) promoNoteElement.style.display = 'none';
        } else {
            if (!promoNoteElement && !isFetchingPromo) {
                initPromoNote();
            }
            if (promoNoteElement) {
                // Only show if no active search
                if (searchTerm === '') {
                    // If board changed or promo not in valid place, position it while hidden
                    if (currentBoardFilter !== lastPromoBoardFilter || !notesContainer.contains(promoNoteElement)) {
                        // Ensure it's hidden before moving to prevent flickering at the bottom
                        promoNoteElement.style.display = 'none';
                        const visibleNotes = Array.from(notesContainer.querySelectorAll('.note:not(.boards-note):not(.promo-note)'))
                            .filter(n => n.style.display !== 'none');

                        if (visibleNotes.length > 0) {
                            const rnd = Math.floor(Math.random() * visibleNotes.length);
                            notesContainer.insertBefore(promoNoteElement, visibleNotes[rnd]);
                        } else {
                            notesContainer.appendChild(promoNoteElement);
                        }
                        updatePromoImage();
                        lastPromoBoardFilter = currentBoardFilter;
                    }
                    // Finally show it in the correct place
                    promoNoteElement.style.display = 'flex';
                } else {
                    promoNoteElement.style.display = 'none';
                }
            }
        }
    } else if (promoNoteElement) {
        // Explicitly hide it during load or if assistant is hidden
        promoNoteElement.style.display = 'none';
    }

    const noteCounter = document.getElementById('note-counter');
    if (noteCounter) {
        noteCounter.textContent = visibleCount;
    }

    if (typeof updateBoardCounterUI === 'function') {
        updateBoardCounterUI(currentBoardFilter);
        updateBoardCounterUI('reminder');
    }

    // --- Покажи/Скрий бутона за изпразване на кошчето ---
    const emptyTrashFab = document.getElementById('empty-trash-fab');
    if (emptyTrashFab) {
        const isTrash = currentBoardFilter === 'trash';
        emptyTrashFab.style.display = (isTrash && visibleCount > 0) ? 'flex' : 'none';
    }
}

// --- GDrive Fetch & ID logic moved to load.js ---
/**
 * Initializes the loading process by resetting state and showing the loader.
 */
function initializeLoad() {
    boardsData = [];
    allNotesData = [];
    notesContainer.innerHTML = ''; // Продължаваме да изчистваме бележките
    loaderContainer.style.display = 'block'; // Показваме лоудъра веднага
    // Задаваме първоначален текст, за да избегнем "премигване" на празен панел
    const loaderTitle = document.getElementById('loader-title');
    if (loaderTitle) loaderTitle.textContent = '';
    currentBoardFilter = localStorage.getItem('startBoard') || 'Main';
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

async function createBoardsUI(boardsData, boardParseError, extraCounts = {}) {
    const { boardCounts = new Map(), reminderCount = 0, calendarCount = 0 } = extraCounts;
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
                showAllBoardsModal();
            }, 500);
            // Only prevent default on touch to avoid unwanted scrolling while holding
            if (e.type === 'touchstart') {
                e.preventDefault();
            }
        };
        const endPress = (e) => {
            clearTimeout(longPressTimer);
            // If it's a touchend and not a long press, trigger the single click action
            if (e.type === 'touchend' && !isLongPress && singleClickCallback) {
                singleClickCallback(e);
            }
        };
        element.addEventListener('mousedown', startPress);
        element.addEventListener('mouseup', endPress);
        element.addEventListener('mouseleave', endPress);
        element.addEventListener('touchstart', startPress);
        element.addEventListener('touchend', endPress);
        element.addEventListener('click', (e) => {
            if (isLongPress) return;
            if (e.ctrlKey) showAllBoardsModal(); else if (singleClickCallback) singleClickCallback(e);
        });
    };

    const allButtonLinks = [];
    const boardClick = (e, boardId, forcePreview = false) => {
        const link = e.currentTarget;
        if (e.preventDefault) e.preventDefault();
        // 1. Logic for Debug JSON (Ctrl+Click in Debug Mode)
        if (debug && e.ctrlKey && !e.shiftKey && !forcePreview) {
            const board = boardsData.find(b => b.gdid == boardId) || { id: boardId, warning: 'Special Board or Data Not Found' };
            showModal(JSON.stringify(board, null, 2));
            return;
        }
        // --- NEW LOGIC: Ctrl+Click when debug is false ---
        if (!debug && e.ctrlKey && !forcePreview) {
            if (boardId !== 'with-photos') {
                showAllBoardsModal();
                return;
            }
        }
        // 2. Standard Navigation & Scroll
        if (link && link.scrollIntoView) {
            link.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
        filterNotesByBoard(boardId, false);
        // 3. Logic for Preview Toggle (Ctrl+Click or Long Press)
        if (e.ctrlKey || forcePreview) {
            setTimeout(() => showBoardPreviews(), 100);
        }
    };

    /**
     * Adds standard click and long-press events to a board button.
     * Handles Context Menu prevention on mobile.
     */
    const addBoardButtonEvents = (element, boardId) => {
        let longPressTimer;
        let isLongPress = false;
        let isTouchMove = false;
        const startPress = (e) => {
            isTouchMove = false;
            isLongPress = false;
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                if (!isTouchMove) {
                    console.log('Long press for preview:', boardId);
                    // Simulate Ctrl+Click behavior
                    // This creates consistency: If Debug is ON -> JSON; If Debug is OFF -> Preview
                    boardClick({ currentTarget: element, ctrlKey: true, preventDefault: () => { } }, boardId);
                    // Optional: Vibrate to indicate success
                    if (navigator.vibrate) navigator.vibrate(50);
                }
            }, 600);
        };
        const cancelPress = () => clearTimeout(longPressTimer);
        const endPress = (e) => {
            clearTimeout(longPressTimer);
            if (isLongPress) {
                if (e.cancelable) e.preventDefault();
                e.stopPropagation();
            }
        };
        const onMove = () => {
            isTouchMove = true;
            clearTimeout(longPressTimer);
        };
        element.addEventListener('touchstart', startPress, { passive: true });
        element.addEventListener('touchend', endPress);
        element.addEventListener('touchmove', onMove, { passive: true });
        element.addEventListener('touchcancel', cancelPress);
        // Prevent context menu on long press
        element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });
        // Standard Click
        element.addEventListener('click', (e) => {
            if (isLongPress) {
                e.stopImmediatePropagation();
                e.preventDefault();
                isLongPress = false;
                return;
            }
            boardClick(e, boardId);
        });
    };

    // --- УСЛОВНО ДОБАВЯНЕ НА БОРД "ВСИЧКИ" ---
    if (localStorage.getItem('showBoardAll') !== 'false') {
        const allBoardsLink = document.createElement('span');
        allBoardsLink.classList.add('board-filter-link', 'all-boards-filter-btn');
        allBoardsLink.dataset.boardid = 'all';
        allBoardsLink.title = _('allBoardsCtrlClickTooltip');
        const allBoardsText = document.createElement('span');
        allBoardsText.textContent = _('allBoards');
        allBoardsLink.appendChild(allBoardsText);
        addAllBoardsModalEvents(allBoardsLink, (e) => boardClick(e, 'all'));
        allButtonLinks.push(allBoardsLink);
    }
    const showCount = localStorage.getItem('showBoardNoteCount') === 'true';
    // --- ДОБАВЯНЕ НА ВРЕМЕНЕН БОРД "НОВИ" ---
    if (updatedNoteGdims.length > 0 && localStorage.getItem('showNewBoard') === 'true') {
        const newUpdatesLink = document.createElement('span');
        newUpdatesLink.textContent = _('newUpdates');
        newUpdatesLink.classList.add('board-filter-link', 'new-updates-filter-btn');
        newUpdatesLink.dataset.boardid = 'new-updates';
        addBoardButtonEvents(newUpdatesLink, 'new-updates');
        allButtonLinks.push(newUpdatesLink);
    }
    // --- ДОБАВЯНЕ НА ВРЕМЕНЕН БОРД "РЕЗУЛТАТИ" ---
    const searchResultsLink = document.createElement('span');
    searchResultsLink.id = 'search-results-board-btn';
    searchResultsLink.textContent = _('searchResultTitle');
    searchResultsLink.classList.add('board-filter-link', 'search-results-filter-btn');
    searchResultsLink.dataset.boardid = 'search-results';
    searchResultsLink.style.display = 'none';
    searchResultsLink.style.backgroundColor = '#ffeb3b'; // Жълт фон
    searchResultsLink.style.color = '#000'; // Черен текст
    searchResultsLink.style.display = 'none'; // Will be set to inline-flex by triggerSearch
    searchResultsLink.style.justifyContent = 'center';
    searchResultsLink.style.alignItems = 'center';
    addBoardButtonEvents(searchResultsLink, 'search-results');
    allButtonLinks.push(searchResultsLink);
    // Сортираме бордовете по полето numord, преди да създадем бутоните
    boardsData.sort((a, b) => {
        const numordA = a.numord !== undefined && a.numord !== null ? a.numord : Infinity;
        const numordB = b.numord !== undefined && b.numord !== null ? b.numord : Infinity;
        return numordA - numordB;
    })
    // --- ПОТРЕБИТЕЛСКА ПОДРЕДБА НА БОРДОВЕТЕ ---
    try {
        const raw = localStorage.getItem('boardMenuOrder');
        if (raw) {
            const savedBoardOrder = JSON.parse(raw);
            if (Array.isArray(savedBoardOrder) && savedBoardOrder.length > 0) {
                const orderMap = new Map(savedBoardOrder.map((t, i) => [String(t), i]));
                boardsData.sort((a, b) => {
                    const posA = orderMap.has(String(a.title)) ? orderMap.get(String(a.title)) : 9999;
                    const posB = orderMap.has(String(b.title)) ? orderMap.get(String(b.title)) : 9999;
                    return posA - posB;
                });
            }
        }
    } catch (e) { console.error("Error sorting boards:", e); }
    // --- УСЛОВНО ДОБАВЯНЕ НА БОРД "НАПОМНЯНИЯ" ---
    if (localStorage.getItem('showBoardRemind') !== 'false') {
        const reminderNoteCount = reminderCount;
        const reminderLink = document.createElement('span');
        reminderLink.textContent = showCount && reminderNoteCount > 0 ? `${_('reminder')} (${reminderNoteCount})` : _('reminder');
        reminderLink.classList.add('board-filter-link', 'reminder-filter-btn');
        reminderLink.dataset.boardid = 'reminder';
        addBoardButtonEvents(reminderLink, 'reminder');
        allButtonLinks.push(reminderLink);
    }
    const renderedBoardKeys = new Set();
    boardsData.forEach(board => {
        const boardId = board.gdid || board.id;
        if (!board.title || boardId === undefined || boardId === null) return;
        const dedupeKey = board.title.trim().toLowerCase();
        if (renderedBoardKeys.has(dedupeKey) || renderedBoardKeys.has(String(boardId))) return;
        renderedBoardKeys.add(dedupeKey);
        renderedBoardKeys.add(String(boardId));
        const count = boardCounts.get(String(boardId)) || 0;
        const showCount = localStorage.getItem('showBoardNoteCount') === 'true';
        const link = document.createElement('span');
        link.textContent = (showCount && count > 0) ? `${board.title} (${count})` : board.title;
        link.classList.add('board-filter-link');
        link.dataset.boardid = boardId;
        let bColor = board.color;
        if (bColor !== undefined && bColor !== null && bColor !== "") {
            const num = Number(bColor);
            if (!isNaN(num)) {
                if (num >= 0 && num <= 6) {
                    link.style.backgroundColor = `var(--board-bg-${num})`;
                } else if (num < 0) {
                    link.style.backgroundColor = '#' + (num >>> 0).toString(16).slice(-6);
                }
            } else if (typeof bColor === 'string' && bColor.startsWith('#')) {
                link.style.backgroundColor = bColor;
            }
        }
        link.style.color = 'black';
        if (board.status === 1) {
            link.style.color = 'red';
        } else {
            let bFColor = board.colorfont;
            if (bFColor !== undefined && bFColor !== null && bFColor !== "") {
                const fnum = Number(bFColor);
                if (!isNaN(fnum)) {
                    if (fnum === 1) link.style.color = '#FFFFFF';
                    else if (fnum === 2) link.style.color = '#FF0000';
                    else if (fnum === 3) link.style.color = '#0000FF';
                    else if (fnum < 0) link.style.color = '#' + (fnum >>> 0).toString(16).slice(-6);
                } else if (typeof bFColor === 'string' && bFColor.startsWith('#')) {
                    link.style.color = bFColor;
                }
            }
        }
        addBoardButtonEvents(link, boardId);
        allButtonLinks.push(link);
    });
    // --- УСЛОВНО ДОБАВЯНЕ НА БОРД "СЪС СНИМКИ" ---
    if (localStorage.getItem('showPhotosBoard') === 'true') {
        const photosLink = document.createElement('span');
        photosLink.textContent = _('photosBoardTitle') || "With Photos";
        photosLink.classList.add('board-filter-link', 'photos-filter-btn');
        photosLink.dataset.boardid = 'with-photos';
        addBoardButtonEvents(photosLink, 'with-photos');
        allButtonLinks.push(photosLink);
    }
    // --- УСЛОВНО ДОБАВЯНЕ НА БОРД "С ВИДЕО" ---
    if (localStorage.getItem('showVideosBoard') === 'true') {
        const videosLink = document.createElement('span');
        videosLink.textContent = _('videosBoardTitle') || "With Video";
        videosLink.classList.add('board-filter-link', 'videos-filter-btn');
        videosLink.dataset.boardid = 'with-videos';
        addBoardButtonEvents(videosLink, 'with-videos');
        allButtonLinks.push(videosLink);
    }
    // --- УСЛОВНО ДОБАВЯНЕ НА БОРД "СЪС ЗВУК" ---
    if (localStorage.getItem('showSoundsBoard') === 'true') {
        const soundsLink = document.createElement('span');
        soundsLink.textContent = _('soundsBoardTitle') || "With Sounds";
        soundsLink.classList.add('board-filter-link', 'sounds-filter-btn');
        soundsLink.dataset.boardid = 'with-sounds';
        addBoardButtonEvents(soundsLink, 'with-sounds');
        allButtonLinks.push(soundsLink);
    }
    // --- УСЛОВНО ДОБАВЯНЕ НА БОРД "ДРУГИ ПРИЛОЖЕНИЯ" ---
    if (localStorage.getItem('showOtherBoard') === 'true') {
        const otherLink = document.createElement('span');
        otherLink.textContent = _('otherBoardTitle') || "Other Attachments";
        otherLink.classList.add('board-filter-link', 'other-filter-btn');
        otherLink.dataset.boardid = 'with-other';
        otherLink.style.backgroundColor = '#a6a6a6';
        addBoardButtonEvents(otherLink, 'with-other');
        allButtonLinks.push(otherLink);
    }
    // --- ДОБАВЯНЕ НА ВРЕМЕНЕН БОРД "КОШЧЕ" ---
    if (localStorage.getItem('showTrashBoard') !== 'false') {
        const trashCount = extraCounts.trashCount || 0;
        const trashLink = document.createElement('span');
        trashLink.textContent = (showCount && trashCount > 0) ? `${_('trashBoardTitle') || "Кошче"} (${trashCount})` : (_('trashBoardTitle') || "Кошче");
        trashLink.classList.add('board-filter-link', 'trash-filter-btn');
        trashLink.dataset.boardid = 'trash';
        trashLink.style.backgroundColor = '#c00';
        trashLink.style.color = '#fff';
        if (trashCount === 0 && currentBoardFilter !== 'trash') {
            trashLink.style.display = 'none';
        }
        addBoardButtonEvents(trashLink, 'trash');
        allButtonLinks.push(trashLink);
    }
    // --- БУТОН "РЕДАКТИРАНЕ" (Предишен Нареди) ---
    const reorderLink = document.createElement('span');
    reorderLink.innerHTML = pencilIconSvg; // Използваме иконата на моливче
    reorderLink.classList.add('board-filter-link', 'reorder-boards-btn');
    reorderLink.dataset.boardid = 'reorder';
    reorderLink.style.backgroundColor = '#607D8B';
    reorderLink.style.color = '#fff';
    reorderLink.style.cursor = 'pointer';
    reorderLink.style.display = 'flex';
    reorderLink.style.alignItems = 'center';
    reorderLink.style.justifyContent = 'center';
    reorderLink.title = _('reorderBoards') || 'Редактиране на бордове';
    reorderLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showNewBoardModal(); // Вече отваряме модала за нов/редактиране на борд
    });
    allButtonLinks.push(reorderLink);

    // --- БУТОН "ЦЯЛ ЕКРАН" (След Нареди) ---
    const fullscreenLink = document.createElement('span');
    fullscreenLink.classList.add('board-filter-link', 'fullscreen-toggle-btn');
    fullscreenLink.dataset.boardid = 'fullscreen';
    fullscreenLink.style.backgroundColor = '#455A64';
    fullscreenLink.style.color = '#fff';
    fullscreenLink.style.cursor = 'pointer';
    fullscreenLink.style.display = 'flex';
    fullscreenLink.style.alignItems = 'center';
    fullscreenLink.style.justifyContent = 'center';
    fullscreenLink.innerHTML = fullscreenExpandIconSvg;
    fullscreenLink.title = _('toggleFullscreenTooltip') || 'Toggle fullscreen (Hide/Show header)';
    fullscreenLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleHeaderFullscreen();
    });
    allButtonLinks.push(fullscreenLink);

    try {
        const raw = localStorage.getItem('boardMenuOrder');
        if (raw) {
            const savedOrder = JSON.parse(raw);
            if (Array.isArray(savedOrder) && savedOrder.length > 0) {
                const hasSystemOrder = savedOrder.some(key => String(key).startsWith('system:'));
                if (hasSystemOrder) {
                    const orderMap = new Map(savedOrder.map((key, index) => [String(key), index]));
                    const getLinkOrderKey = (link) => {
                        const boardId = link.dataset.boardid;
                        if (boardId === 'reorder') return 'system:reorder';
                        if (boardId === 'fullscreen') return 'system:fullscreen';
                        const board = boardsData.find(b => String(b.gdid || b.id) === String(boardId));
                        if (board && board.title) return String(board.title);
                        return `system:${boardId}`;
                    };
                    allButtonLinks.sort((a, b) => {
                        const isUtilA = (a.dataset.boardid === 'reorder' || a.dataset.boardid === 'fullscreen');
                        const isUtilB = (b.dataset.boardid === 'reorder' || b.dataset.boardid === 'fullscreen');
                        if (isUtilA && isUtilB) {
                            return (a.dataset.boardid === 'reorder') ? -1 : 1;
                        }
                        if (isUtilA) return 1;
                        if (isUtilB) return -1;
                        const keyA = getLinkOrderKey(a);
                        const keyB = getLinkOrderKey(b);
                        const posA = orderMap.has(keyA) ? orderMap.get(keyA) : 9999;
                        const posB = orderMap.has(keyB) ? orderMap.get(keyB) : 9999;
                        return posA - posB;
                    });
                }
            }
        }
    } catch (e) { console.error("Error sorting board buttons:", e); }
    maxWidthForButtons = 0;
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.visibility = 'hidden';
    tempContainer.style.whiteSpace = 'nowrap';
    tempContainer.style.display = 'inline-block';
    document.body.appendChild(tempContainer);
    allButtonLinks.forEach(link => {
        const isUtil = (link.dataset.boardid === 'reorder' || link.dataset.boardid === 'fullscreen');
        const isSearchResults = link.dataset.boardid === 'search-results';
        if (!isUtil) {
            link.style.width = 'auto';
            // Results е временен борд: остава скрит, докато няма заявка за търсене.
            if (!isSearchResults) link.style.display = 'inline-block';
            link.style.whiteSpace = 'nowrap';
            tempContainer.appendChild(link);
            const w = Math.ceil(link.getBoundingClientRect().width || link.offsetWidth || link.scrollWidth);
            maxWidthForButtons = Math.max(maxWidthForButtons, w);
        } else {
            tempContainer.appendChild(link);
        }
    });

    document.body.removeChild(tempContainer);
    maxWidthForButtons += 10;
    // Ограничаваме максималната ширина до 200px, за да не стават бутоните прекалено големи
    maxWidthForButtons = Math.min(maxWidthForButtons, 200);
    const headerUtilWidth = Math.max(30, Math.floor((maxWidthForButtons - 5) / 2));
    allButtonLinks.forEach(link => {
        const isUtil = (link.dataset.boardid === 'reorder' || link.dataset.boardid === 'fullscreen');
        const isSearchResults = link.dataset.boardid === 'search-results';
        if (!isUtil) {
            link.style.width = `${maxWidthForButtons}px`;
            if (!isSearchResults) link.style.display = 'inline-block';
            link.style.boxSizing = 'border-box';
            link.style.overflow = 'hidden';
            link.style.textOverflow = 'ellipsis';
            link.style.whiteSpace = 'nowrap';
        } else {
            link.style.width = `${headerUtilWidth}px`;
            link.style.minWidth = '30px';
            link.style.padding = '0';
        }
        contentEl.appendChild(link);
    });

    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'scrolling-menu-wrapper';

    // --- КОРЕКЦИЯ: Плаващият бутон за менюто с бордове (само един в body) --- @@
    let allBoardsBtnForContainer = document.getElementById('popup-menu-btn-floating');
    if (!allBoardsBtnForContainer) {
        allBoardsBtnForContainer = document.createElement('button');
        allBoardsBtnForContainer.id = 'popup-menu-btn-floating';
        allBoardsBtnForContainer.className = 'popup-menu-btn-floating';
        allBoardsBtnForContainer.innerHTML = boardIconSvg;

        // --- DRAGGABLE FUNCTIONALITY ---
        makeElementDraggable(allBoardsBtnForContainer, 'popupMenuBtnPosition');

        let clickTimer;
        allBoardsBtnForContainer.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Ctrl+клик превключва fullscreen режим без отваряне на менюто
            if (e.ctrlKey) {
                toggleHeaderFullscreen();
                return;
            }
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => {
                const boardsModal = document.getElementById('boards-menu-modal');
                if (boardsModal && boardsModal.classList.contains('visible')) {
                    boardsModal.classList.remove('visible');
                } else {
                    showAllBoardsModal();
                }
            }, 200);
        });
        // Long press (мобилно) превключва fullscreen режим
        let longPressTimer = null;
        let longPressTriggered = false;
        allBoardsBtnForContainer.addEventListener('touchstart', (e) => {
            longPressTriggered = false;
            longPressTimer = setTimeout(() => {
                longPressTriggered = true;
                toggleHeaderFullscreen();
            }, 500);
        }, { passive: true });
        allBoardsBtnForContainer.addEventListener('touchend', (e) => {
            clearTimeout(longPressTimer);
            if (longPressTriggered) {
                e.preventDefault();
                longPressTriggered = false;
            }
        });
        allBoardsBtnForContainer.addEventListener('touchmove', () => {
            clearTimeout(longPressTimer);
        }, { passive: true });
        document.body.appendChild(allBoardsBtnForContainer);
    } else {
        allBoardsBtnForContainer.innerHTML = boardIconSvg;
    }
    const bmc = document.getElementById('boards-menu-container');
    if (bmc) bmc.innerHTML = '';
    scrollWrapper.appendChild(contentEl);
    contentWrapper.appendChild(scrollWrapper);
    return boardsNote;
}
const appSettingsKeys = [
    'zoomLevel', 'noteFontSize', 'modalFontSize', 'hideAssistant', 'hideToast', 'trashSearch',
    'showBoardNoteCount', 'showWeeklyCalendar', 'showDatemod', 'showFirstLine', 'showNewBoard', 'oneTapLink',
    'clickToEdit', 'closeAfterSave', 'automatedTimer', 'notesBgrd', 'imgBgrd',
    'useGoogleDb', 'updateGDrive', 'useIndexedDb', 'useLocalDb', 'updateLocalFolder', 'useArhDb',
    'forceGDriveRead', 'checkEmptyBoards', 'mdBold', 'mdItalic', 'mdStrike', 'mdUnderline', 'mdClear',
    'sortCriteria', 'sortInReverse', 'sortRemindersTop', 'savedSearches', 'maxSavedSearches',
    'folderId', 'language', 'rememberMe',
    'showBoardAll', 'showPhotosBoard', 'showVideosBoard', 'showSoundsBoard', 'showOtherBoard', 'showBoardRemind',
    'enableNoteSorting', 'lastSearchTerm', 'guide', 'showAdvancedSettings', 'promoImageIndex', 'urlToken',
    'gdrive_folder_names', 'deviceName',
    'addNoteFabPosition', 'popupMenuBtnPosition', 'scrollTopBtnPosition', 'kbFabPosition'
];
async function findGDFileByName(folderId, fileName) {
    if (isOffline || !folderId) return null;
    const sendRequest = async (token) => {
        const query = encodeURIComponent(`'${folderId}' in parents and name = '${fileName}' and trashed = false`);
        // ВАЖНО: Винаги включваме и двете пространства, за да намерим файловете навсякъде (особено в подпапки на AppData)
        const spacesParam = '&spaces=drive,appDataFolder';
        return fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc${spacesParam}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) return null;
        let tokenData = JSON.parse(storedTokenString);
        let resp = await sendRequest(tokenData.access_token);
        if (resp.status === 401) {
            const refresh = await refreshAuthToken(false);
            if (refresh && refresh.pass) {
                resp = await sendRequest(refresh.tokenData.access_token);
            }
        }
        if (!resp.ok) return null;
        const result = await resp.json();
        return result.files && result.files.length > 0 ? result.files : null;
    } catch (e) {
        console.error("findGDFileByName error:", e);
        return null;
    }
}

async function syncGlobalFoldersJson() {
    if (isOffline || !useGoogleDb) return;
    try {
        const folderNamesStr = localStorage.getItem('gdrive_folder_names');
        if (!folderNamesStr) return;
        const folderNames = JSON.parse(folderNamesStr).filter(n => n && n !== 'AppDataFolder');
        if (!Array.isArray(folderNames)) return;
        const currentEmail = sessionStorage.getItem('google_auth_email_hint') || '';
        const activeFolderCurrent = localStorage.getItem('active_folder_name') || '';
        const folders = folderNames.map(name => {
            const entry = { name };
            // Per-folder start board: use the dedicated key, or for the active folder use the global startBoard
            const perFolderSB = localStorage.getItem('startBoard_' + name);
            if (perFolderSB) {
                entry.startBoard = perFolderSB;
            } else if (name === activeFolderCurrent) {
                const globalSB = localStorage.getItem('startBoard');
                if (globalSB) entry.startBoard = globalSB;
            }
            // Per-folder data: boardMenuOrder, lastNoteId, lastBoardId
            if (name === activeFolderCurrent) {
                const bmo = localStorage.getItem('boardMenuOrder');
                if (bmo) {
                    try {
                        entry.boardMenuOrder = JSON.parse(bmo);
                    } catch (e) { }
                }
                if (typeof noteId !== 'undefined') entry.lastNoteId = noteId;
                if (typeof noteNumord !== 'undefined') entry.lastNoteNumord = noteNumord;
                const bic = localStorage.getItem('boardIdCounter');
                if (bic !== null) entry.lastBoardId = parseInt(bic, 10);
            } else {
                // Запазваме вече записаните стойности от предишни сесии
                const perBmo = localStorage.getItem('boardMenuOrder_' + name);
                if (perBmo) try { entry.boardMenuOrder = JSON.parse(perBmo); } catch (e) { }
                const perNid = localStorage.getItem('lastNoteId_' + name);
                if (perNid !== null) entry.lastNoteId = parseInt(perNid, 10);
                const perNord = localStorage.getItem('lastNoteNumord_' + name);
                if (perNord !== null) entry.lastNoteNumord = parseInt(perNord, 10);
                const perBid = localStorage.getItem('lastBoardId_' + name);
                if (perBid !== null) entry.lastBoardId = parseInt(perBid, 10);
            }
            return entry;
        });
        const data = {
            email: currentEmail,
            activeFolder: activeFolderCurrent,
            folders
        };
        const content = JSON.stringify(data, null, 2);
        // Push only to the main 'AppSettings' folder in AppDataFolder
        try {
            const fID = await getAppSettingsFolderId();
            if (fID) {
                const existingFiles = await findGDFileByName(fID, 'folders.json');
                if (existingFiles && existingFiles.length > 0) {
                    // Ако има дубликати на folders.json, почистваме старите
                    if (existingFiles.length > 1) {
                        for (let i = 1; i < existingFiles.length; i++) {
                            deleteGDriveFile(existingFiles[i].id).catch(e => console.warn("[Sync] Error deleting duplicate folders.json:", e));
                        }
                    }
                    await updateGDriveFile(existingFiles[0].id, content);
                } else {
                    await createGDriveFile(fID, 'folders.json', content);
                }
            }
        } catch (e) {
            console.warn("Failed to sync folders.json to AppSettings", e);
        }
    } catch (e) {
        console.warn("syncGlobalFoldersJson error:", e);
    }
}

/**
 * Асинхронно записва per-folder данни (boardMenuOrder, noteId, boardIdCounter) във folders.json.
 * Извиква се след промяна на тези стойности.
 */
let _syncFolderDataTimer = null;
function syncFolderDataAsync() {
    if (_syncFolderDataTimer) clearTimeout(_syncFolderDataTimer);
    _syncFolderDataTimer = setTimeout(() => {
        _syncFolderDataTimer = null;
        syncGlobalFoldersJson();
    }, 2000);
}

async function loadGlobalFoldersJson() {
    console.log('[DEBUG] loadGlobalFoldersJson() called. isOffline:', isOffline);
    if (isOffline) return false;
    try {
        const folderId = await getAppSettingsFolderId();
        console.log('[DEBUG] loadGlobalFoldersJson(): getAppSettingsFolderId returned:', folderId);
        if (!folderId) return false;
        const existingFiles = await findGDFileByName(folderId, 'folders.json');
        console.log('[DEBUG] loadGlobalFoldersJson(): findGDFileByName returned existingFiles length:', existingFiles ? existingFiles.length : 0);
        if (!existingFiles || existingFiles.length === 0) return false;
        const content = await fetchGDriveFileContent(existingFiles[0].id);
        console.log('[DEBUG] loadGlobalFoldersJson(): fetchGDriveFileContent returned content length:', content ? content.length : 0);
        if (!content) return false;
        sessionStorage.setItem('full_folders_json', content); // Уверяваме се, че set.html също ще ги види
        const parsed = JSON.parse(content);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            console.warn('folders.json has unexpected format, skipping.');
            return false;
        }
        let remoteFolderNames = [];
        let remoteActiveFolder = null;
        let remoteFolderStartBoards = {};
        // Validate email ownership
        const currentEmail = sessionStorage.getItem('google_auth_email_hint') || '';
        if (parsed.email && currentEmail && parsed.email !== currentEmail) {
            console.log('folders.json belongs to another user (' + parsed.email + '), skipping.');
            return false;
        }
        let remoteFolderData = {}; // Per-folder boardMenuOrder, lastNoteId, lastBoardId
        if (Array.isArray(parsed.folders)) {
            remoteFolderNames = parsed.folders.map(f => f && f.name).filter(Boolean);
            parsed.folders.forEach(f => {
                if (f && f.name && f.startBoard) {
                    remoteFolderStartBoards[f.name] = f.startBoard;
                }
                if (f && f.name) {
                    remoteFolderData[f.name] = {
                        boardMenuOrder: (f.boardMenuOrder && Array.isArray(f.boardMenuOrder)) ? f.boardMenuOrder : null,
                        lastNoteId: (typeof f.lastNoteId !== 'undefined') ? f.lastNoteId : null,
                        lastNoteNumord: (typeof f.lastNoteNumord !== 'undefined') ? f.lastNoteNumord : null,
                        lastBoardId: (typeof f.lastBoardId !== 'undefined') ? f.lastBoardId : null
                    };
                }
            });
        }
        if (parsed.activeFolder) {
            remoteActiveFolder = parsed.activeFolder;
        }
        if (remoteFolderNames.length === 0) return false;
        let changed = false;
        // Merge folder names
        const localFolderNamesStr = localStorage.getItem('gdrive_folder_names');
        // При чиста локална инсталация не добавяме multinotes_data по
        // подразбиране. Тя се включва само ако е записана в folders.json или
        // действително е открита при първоначалната настройка.
        const localFolderNames = localFolderNamesStr ? JSON.parse(localFolderNamesStr) : [];

        // Пречистваме remote names от дубликати и празни
        const cleanRemote = [...new Set(remoteFolderNames.filter(Boolean))];
        const merged = [...new Set([...localFolderNames, ...cleanRemote])];

        const mergedStr = JSON.stringify(merged);
        if (mergedStr !== localFolderNamesStr) {
            localStorage.setItem('gdrive_folder_names', mergedStr);
            changed = true;
        }
        // Apply per-folder start boards
        Object.entries(remoteFolderStartBoards).forEach(([folderName, startBoard]) => {
            const key = 'startBoard_' + folderName;
            if (!localStorage.getItem(key)) {
                localStorage.setItem(key, startBoard);
                changed = true;
            }
        });
        // Apply active folder if no local value is set
        if (remoteActiveFolder && !localStorage.getItem('active_folder_name')) {
            localStorage.setItem('active_folder_name', remoteActiveFolder);
            activeFolderName = remoteActiveFolder;
            // Ако кешът на ID не съответства на новата активна папка, го изчистваме,
            // за да се преизчисли по име при следващото зареждане на данни.
            if (localStorage.getItem('gdrive_multinotes_data_id_folder') !== remoteActiveFolder) {
                clearCachedMainFolderId();
            }
            const loaderFolderInfo = document.getElementById('loader-folder-info');
            if (loaderFolderInfo) loaderFolderInfo.textContent = `(${activeFolderName})`;
            changed = true;
        }
        // Apply per-folder data for the active folder
        const activeF = localStorage.getItem('active_folder_name') || 'multinotes_data';
        const activeFolderData = remoteFolderData[activeF];
        if (activeFolderData) {
            if (activeFolderData.boardMenuOrder && Array.isArray(activeFolderData.boardMenuOrder) && activeFolderData.boardMenuOrder.length > 0) {
                const localBmo = localStorage.getItem('boardMenuOrder');
                if (!localBmo || localBmo === '[]') {
                    localStorage.setItem('boardMenuOrder', JSON.stringify(activeFolderData.boardMenuOrder));
                    changed = true;
                }
            }
            if (activeFolderData.lastNoteId !== null && typeof activeFolderData.lastNoteId !== 'undefined') {
                const remoteNoteId = parseInt(activeFolderData.lastNoteId, 10);
                if (!isNaN(remoteNoteId) && remoteNoteId > noteId) {
                    noteId = remoteNoteId;
                    changed = true;
                }
            }
            if (activeFolderData.lastNoteNumord !== null && typeof activeFolderData.lastNoteNumord !== 'undefined') {
                const remoteNoteNumord = parseInt(activeFolderData.lastNoteNumord, 10);
                if (!isNaN(remoteNoteNumord) && remoteNoteNumord > noteNumord) {
                    noteNumord = remoteNoteNumord;
                    changed = true;
                }
            }
            if (activeFolderData.lastBoardId !== null && typeof activeFolderData.lastBoardId !== 'undefined') {
                boardIdCounter = activeFolderData.lastBoardId;
                localStorage.setItem('boardIdCounter', boardIdCounter.toString());

                changed = true;
            }
        }
        // Запазваме per-folder данните за всички папки (за бъдещо превключване)
        Object.entries(remoteFolderData).forEach(([folderName, fdata]) => {
            if (folderName === activeF) return; // Вече приложено
            if (fdata.boardMenuOrder) localStorage.setItem('boardMenuOrder_' + folderName, JSON.stringify(fdata.boardMenuOrder));
            if (fdata.lastNoteId !== null) localStorage.setItem('lastNoteId_' + folderName, fdata.lastNoteId.toString());
            if (fdata.lastNoteNumord !== null) localStorage.setItem('lastNoteNumord_' + folderName, fdata.lastNoteNumord.toString());
            if (fdata.lastBoardId !== null) localStorage.setItem('lastBoardId_' + folderName, fdata.lastBoardId.toString());
        });
        return changed;
    } catch (e) {
        console.warn("loadGlobalFoldersJson error:", e);
    }
    return false;
}
async function saveSettingsToGDrive(silent = false) {
    if (!silent && typeof showToast === 'function') showToast(_('savingProfile'));
    const currentDevice = localStorage.getItem('deviceName') || 'Default';
    const settings = {};
    appSettingsKeys.forEach(key => {
        const val = localStorage.getItem(key);
        if (val !== null) {
            if ((val.startsWith('[') && val.endsWith(']')) || (val.startsWith('{') && val.endsWith('}'))) {
                try {
                    let parsedVal = JSON.parse(val);
                    if (key.endsWith('Position') && parsedVal && typeof parsedVal === 'object') {
                        Object.keys(parsedVal).forEach(posKey => {
                            if (typeof parsedVal[posKey] === 'string' && parsedVal[posKey].endsWith('px')) {
                                const num = parseFloat(parsedVal[posKey]);
                                if (!isNaN(num)) {
                                    parsedVal[posKey] = Math.round(num) + 'px';
                                }
                            } else if (typeof parsedVal[posKey] === 'number') {
                                parsedVal[posKey] = Math.round(parsedVal[posKey]);
                            }
                        });
                    }
                    settings[key] = parsedVal;
                } catch (e) {
                    settings[key] = val;
                }
            } else {
                settings[key] = val;
            }
        }
    });
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('board_')) {
            const val = localStorage.getItem(key);
            if (val && ((val.startsWith('[') && val.endsWith(']')) || (val.startsWith('{') && val.endsWith('}')))) {
                try { settings[key] = JSON.parse(val); } catch (e) { settings[key] = val; }
            } else {
                settings[key] = val;
            }
        }
    }
    const contentLocal = JSON.stringify(settings, null, 2);
    localStorage.setItem('settings_multinotes_data', contentLocal);
    if (!isOffline) {
        const folderId = await getAppSettingsFolderId();
        if (folderId) {
            const fileName = 'settings.json';
            try {
                const existingFiles = await findGDFileByName(folderId, fileName);
                if (debug) console.log("[ProfileSync] existingFiles found:", existingFiles ? existingFiles.length : 0);
                let finalObject = {};
                let targetId = null;
                if (existingFiles && existingFiles.length > 0) {
                    // Почистваме дубликати на settings.json
                    if (existingFiles.length > 1) {
                        for (let i = 1; i < existingFiles.length; i++) {
                            deleteGDriveFile(existingFiles[i].id).catch(e => console.warn("[ProfileSync] Error deleting duplicate settings.json:", e));
                        }
                    }
                    targetId = existingFiles[0].id;
                    const existingContent = await fetchGDriveFileContent(targetId);
                    try {
                        const parsed = JSON.parse(existingContent);
                        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                            const topLevelKeys = Object.keys(parsed);
                            const looksOld = topLevelKeys.some(k => appSettingsKeys.includes(k) || k.startsWith('board_'));
                            if (looksOld) {
                                finalObject = { 'Default': parsed };
                            } else {
                                finalObject = parsed;
                            }
                        }
                    } catch (e) {
                        console.warn("Could not parse existing settings.json, starting fresh.");
                    }
                }
                finalObject[currentDevice] = settings;
                const finalContent = JSON.stringify(finalObject, null, 2);
                if (existingFiles && existingFiles.length > 0) {
                    await updateGDriveFile(existingFiles[0].id, finalContent);
                    for (let j = 1; j < existingFiles.length; j++) {
                        await deleteGDriveFile(existingFiles[j].id);
                    }
                } else {
                    await createGDriveFile(folderId, fileName, finalContent);
                }
            } catch (err) {
                console.error("Save settings to GDrive error:", err);
            }
        }
    }
    if (!silent) showToast(_('settingsSavedSuccess'));
}

async function loadSettingsFromGDrive(silent = false) {
    if (!silent && typeof showToast === 'function') showToast(_('loadingProfiles'));
    let content = null;
    if (!isOffline) {
        try {
            const folderId = await getAppSettingsFolderId();
            if (folderId) {
                const existingFiles = await findGDFileByName(folderId, 'settings.json');
                if (existingFiles && existingFiles.length > 0) content = await fetchGDriveFileContent(existingFiles[0].id);
            }
        } catch (err) {
            if (err instanceof TypeError || (err.message && err.message.includes('Failed to fetch'))) {
                console.log('loadSettingsFromGDrive: Network unavailable, using local settings.');
                isOffline = true;
            } else {
                console.error("Load settings error:", err);
            }
        }
    }
    if (!content) content = localStorage.getItem('settings_multinotes_data');
    if (content) {
        try {
            let settings = JSON.parse(content);
            const currentDevice = localStorage.getItem('deviceName') || 'Default';
            if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
                const topLevelKeys = Object.keys(settings);
                const looksOld = topLevelKeys.some(k => appSettingsKeys.includes(k) || k.startsWith('board_'));
                if (!looksOld) {
                    if (settings[currentDevice]) settings = settings[currentDevice];
                    else if (settings['Default']) settings = settings['Default'];
                    else if (!silent) { showToast("Settings for device '" + currentDevice + "' not found."); return; }
                }
            }
            const preservedKeys = ['useGoogleDb', 'useLocalDb', 'useArhDb', 'useIndexedDb', 'active_folder_name', 'gdrive_folder_names', 'gdrive_multinotes_data_id', 'folderId', 'deviceName'];
            if (window.hasUrlLanguage) preservedKeys.push('language');
            Object.keys(settings).forEach(key => {
                const isBoardKey = key.startsWith('board_');
                if (appSettingsKeys.includes(key) || isBoardKey) {
                    if (!preservedKeys.includes(key)) {
                        let val = settings[key];
                        if (key === 'boardMenuOrder' && (!val || (Array.isArray(val) && val.length === 0))) return;
                        if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
                        localStorage.setItem(key, val);
                    }
                }
            });
            if (silent) {
                await renderUI({ rerenderOnlyMenu: true });
                restoreAllFloatingPositions();
            } else {
                setTimeout(async () => {
                    const confirmed = await showConfirmation(_('settingsLoadedSuccess'));
                    if (confirmed) location.reload();
                }, 100);
            }
        } catch (err) { console.error("Parse error:", err); if (!silent) showToast(_('errorLoadSettings')); }
    } else if (!silent) showToast(_('errorLoadSettings'));
}
async function createSettingsUI(boardsData, boardParseError) {
    const settingsModalBody = document.getElementById('settings-modal-body');
    if (!settingsModalBody.dataset.initializedListeners) {
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        const loadSettingsBtn = document.getElementById('load-settings-btn');
        if (saveSettingsBtn) {
            saveSettingsBtn.onclick = null;
            saveSettingsBtn.addEventListener('click', () => {
                saveSettingsToGDrive();
            });
        }
        if (loadSettingsBtn) {
            loadSettingsBtn.onclick = null;
            loadSettingsBtn.addEventListener('click', () => {
                loadSettingsFromGDrive();
            });
        }
        const showSettingsBtn = document.getElementById('show-settings-btn');
        if (showSettingsBtn) {
            showSettingsBtn.style.display = (typeof debug !== 'undefined' && debug) ? '' : 'none';
            showSettingsBtn.onclick = null;
            showSettingsBtn.addEventListener('click', () => {
                const content = localStorage.getItem('settings_multinotes_data');
                if (content) {
                    sessionStorage.setItem('full_settings_json', content);
                }
                sessionStorage.setItem('boardMenuOrder', localStorage.getItem('boardMenuOrder') || '[]');
                const boardsToStore = (typeof boardsData !== 'undefined' && boardsData.length > 0) ? boardsData : [];
                sessionStorage.setItem('boardsData', JSON.stringify(boardsToStore));
                const titlesMap = {};
                boardsToStore.forEach(b => {
                    const bid = String(b.gdid || b.id);
                    if (bid && bid !== 'undefined' && b.title) titlesMap[bid] = b.title;
                    if (b.title) titlesMap[b.title] = b.title;
                });
                sessionStorage.setItem('boardTitlesMap', JSON.stringify(titlesMap));
                window.open('set.html', '_blank');
            });
        }
        settingsModalBody.dataset.initializedListeners = 'true';
    }
    // --- Language Select in Settings (populated dynamically on UI creation) ---
    const settingsLangSelect = document.getElementById('settings-lang-select');
    if (settingsLangSelect) {
        settingsLangSelect.innerHTML = '';
        SUPPORTED_LANGUAGES.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.id;
            option.textContent = lang.label;
            if (lang.id === currentLang) option.selected = true;
            settingsLangSelect.appendChild(option);
        });
        if (!settingsLangSelect.dataset.hasChangeListener) {
            settingsLangSelect.dataset.hasChangeListener = 'true';
            settingsLangSelect.addEventListener('change', async () => {
                const newLang = settingsLangSelect.value;
                localStorage.setItem('language', newLang);
                if (typeof saveSettingsToGDrive === 'function') {
                    try { await saveSettingsToGDrive(true); } catch (err) { console.warn('Failed to save settings on language change:', err); }
                }
                window.location.reload();
            });
        }
    }
    const settingsLangLabel = document.querySelector('#settings-lang-wrapper label');
    if (settingsLangLabel && typeof _ === 'function') {
        settingsLangLabel.textContent = _('languageLabel') || 'Език:';
    }

    // --- Get Element References ---
    const scaleSlider = document.getElementById('scaleSlider');
    const scaleInput = document.getElementById('scaleInput');
    const noteFontSizeInput = document.getElementById('note-font-size-input');
    const modalFontSizeInput = document.getElementById('modal-font-size-input');
    const showDatemodCheckbox = document.getElementById('show-datemod-checkbox');
    const showFirstLineCheckbox = document.getElementById('show-first-line-checkbox');
    const showNewBoardCheckbox = document.getElementById('show-new-board-checkbox');
    const oneTapLinkCheckbox = document.getElementById('one-tap-link-checkbox');
    const showBoardNoteCountCheckbox = document.getElementById('show-board-note-count-checkbox');
    const showBoardAllCheckbox = document.getElementById('all-board-checkbox');
    const weeklyCalendarCheckbox = document.getElementById('weekly-calendar-checkbox');
    const showBoardRemindCheckbox = document.getElementById('remind-board-checkbox');
    const showPhotosBoardCheckbox = document.getElementById('show-photos-board-checkbox');
    const showVideosBoardCheckbox = document.getElementById('show-videos-board-checkbox');
    const showSoundsBoardCheckbox = document.getElementById('show-sounds-board-checkbox');
    const showOtherBoardCheckbox = document.getElementById('show-other-board-checkbox');
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
    const clickToEditCheckbox = document.getElementById('click-to-edit-checkbox');
    const hideAssistantCheckbox = document.getElementById('hide-assistant-checkbox'); // New checkbox
    const hideToastCheckbox = document.getElementById('hide-toast-checkbox');
    const activeFolderSelect = document.getElementById('active-folder-select');
    const deviceNameSelect = document.getElementById('device-name-select');
    const addDeviceBtn = document.getElementById('add-device-btn');
    const deleteDeviceBtn = document.getElementById('delete-device-btn');
    async function loadDeviceProfiles(forceRefresh = false) {
        console.log('[DEBUG] loadDeviceProfiles() called, forceRefresh:', forceRefresh);
        if (!deviceNameSelect) {
            console.log('[DEBUG] loadDeviceProfiles(): deviceNameSelect not found!');
            return;
        }
        let devices = ['Default'];
        let cachedProfiles = localStorage.getItem('deviceProfilesList');
        console.log('[DEBUG] loadDeviceProfiles(): cachedProfiles from localStorage:', cachedProfiles);

        if (cachedProfiles) {
            try {
                devices = JSON.parse(cachedProfiles);
                console.log('[DEBUG] loadDeviceProfiles(): parsed devices from cache:', devices);
            } catch (e) { console.warn('[DEBUG] parse error on cachedProfiles:', e); }
        }

        // Always fetch from GDrive in background if not offline to discover new profiles
        if (!isOffline && (!cachedProfiles || forceRefresh || true)) {
            (async () => {
                let content = null;
                try {
                    const folderId = await getAppSettingsFolderId();
                    if (folderId) {
                        const existingFiles = await findGDFileByName(folderId, 'settings.json');
                        if (existingFiles && existingFiles.length > 0) content = await fetchGDriveFileContent(existingFiles[0].id);
                    }
                } catch (err) { console.error("Error loading profiles:", err); }

                if (!content) content = localStorage.getItem('settings_multinotes_data');

                if (content) {
                    try {
                        const parsed = JSON.parse(content);
                        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                            const topLevelKeys = Object.keys(parsed);
                            const isNewFormat = !topLevelKeys.some(k => appSettingsKeys.includes(k) || k.startsWith('board_'));
                            if (isNewFormat) {
                                let remoteDevices = topLevelKeys;
                                const currentDevice = localStorage.getItem('deviceName') || 'Default';
                                if (!remoteDevices.includes(currentDevice)) remoteDevices.push(currentDevice);
                                if (!remoteDevices.includes('Default')) remoteDevices.push('Default');

                                // Check if we found new devices compared to cache
                                const newDevicesStr = JSON.stringify(remoteDevices);
                                if (newDevicesStr !== cachedProfiles) {
                                    localStorage.setItem('deviceProfilesList', newDevicesStr);
                                    // Re-render the dropdown with new devices
                                    devices = remoteDevices;
                                    deviceNameSelect.innerHTML = '';
                                    devices.sort((a, b) => {
                                        if (a === 'Default') return -1;
                                        if (b === 'Default') return 1;
                                        return a.localeCompare(b);
                                    }).forEach(dev => {
                                        const opt = document.createElement('option');
                                        opt.value = dev;
                                        opt.textContent = dev;
                                        if (dev === currentDevice) opt.selected = true;
                                        deviceNameSelect.appendChild(opt);
                                    });
                                    console.log('[DEBUG] loadDeviceProfiles(): Background fetch discovered new profiles and updated UI:', devices);
                                }
                            }
                        }
                    } catch (e) { }
                }
            })();
        }

        const currentDevice = localStorage.getItem('deviceName') || 'Default';
        if (!devices.includes(currentDevice)) {
            devices.push(currentDevice);
            localStorage.setItem('deviceProfilesList', JSON.stringify(devices));
        }

        deviceNameSelect.innerHTML = '';
        console.log('[DEBUG] loadDeviceProfiles(): about to populate with devices:', devices);
        devices.sort((a, b) => {
            if (a === 'Default') return -1;
            if (b === 'Default') return 1;
            return a.localeCompare(b);
        }).forEach(dev => {
            const opt = document.createElement('option');
            opt.value = dev;
            opt.textContent = dev;
            if (dev === currentDevice) opt.selected = true;
            deviceNameSelect.appendChild(opt);
        });
        console.log('[DEBUG] loadDeviceProfiles(): Finished populating.');
    }
    if (deviceNameSelect) {
        loadDeviceProfiles();
        deviceNameSelect.addEventListener('change', async () => {
            localStorage.setItem('deviceName', deviceNameSelect.value);
            showToast(_('settingSaved'), 2000);
            // Тихо зареждаме настройките за новия профил
            await loadSettingsFromGDrive(true);
        });
    }
    if (addDeviceBtn) {
        addDeviceBtn.addEventListener('click', () => {
            const newName = prompt("Въведете име за новото устройство / профил:");
            if (newName && newName.trim()) {
                localStorage.setItem('deviceName', newName.trim());
                loadDeviceProfiles();
                showToast(_('settingSaved'), 2000);
            }
        });
    }
    if (deleteDeviceBtn) {
        deleteDeviceBtn.addEventListener('click', async () => {
            const currentDevice = deviceNameSelect.value;
            if (currentDevice === 'Default') {
                showToast("Не може да изтриете профила Default.");
                return;
            }
            if (!await showConfirmation(`Сигурни ли сте, че искате да изтриете профила '${currentDevice}' от облака?`)) return;
            showToast("Изтриване на профила...");
            try {
                const folderId = await getAppSettingsFolderId();
                if (folderId) {
                    const existingFiles = await findGDFileByName(folderId, 'settings.json');
                    if (existingFiles && existingFiles.length > 0) {
                        const content = await fetchGDriveFileContent(existingFiles[0].id);
                        const parsed = JSON.parse(content);
                        if (parsed && parsed[currentDevice]) {
                            delete parsed[currentDevice];
                            await updateGDriveFile(existingFiles[0].id, JSON.stringify(parsed, null, 2));
                            localStorage.setItem('deviceName', 'Default');

                            // Актуализираме кеша веднага щом изтрием файл
                            const newDevicesList = Object.keys(parsed);
                            if (!newDevicesList.includes('Default')) newDevicesList.push('Default');
                            localStorage.setItem('deviceProfilesList', JSON.stringify(newDevicesList));

                            await loadDeviceProfiles();
                            showToast("Профилът е изтрит.");
                        }
                    }
                }
            } catch (err) {
                console.error("Delete profile error:", err);
                showToast("Грешка при изтриване.");
            }
        });
    }
    if (!settingsModalBody.dataset.initialized) {
        // Active Folder Logic
        // Active Folder Logic
        if (activeFolderSelect) {
            populateFoldersDropdown();

            // Попълването на dropdown-а се прави при Ctrl+click/long press (Разширени настройки)

            activeFolderSelect.addEventListener('change', async () => {
                const selectedValue = activeFolderSelect.value;
                let targetFolderName = null;
                let targetFolderId = null;
                const folderNamesStr = localStorage.getItem('gdrive_folder_names');
                const folderNames = folderNamesStr ? JSON.parse(folderNamesStr) : [];
                if (selectedValue === 'new_folder' || selectedValue === 'select_folder') {
                    const isNew = selectedValue === 'new_folder';
                    const promptMsg = isNew ? _('newFolderPrompt') : (_('selectFolderPrompt') || 'Enter existing folder name:');
                    const folderNameInput = await showPrompt(promptMsg);
                    if (folderNameInput && folderNameInput.trim()) {
                        targetFolderName = folderNameInput.trim();
                        try {
                            if (isNew) {
                                if (typeof showToast === 'function') showToast(_('creatingFolder') || 'Creating folder...');
                                targetFolderId = await createNewGDriveFolder(targetFolderName);
                                if (targetFolderId) {
                                    const confirmed = await showConfirmation(_('confirmMigration') || 'Do you want to copy the data from the current folder into the new folder?');
                                    if (confirmed) {
                                        await migrateDataToNewFolder(targetFolderId);
                                        const currentBmo = localStorage.getItem('boardMenuOrder');
                                        if (currentBmo) localStorage.setItem('boardMenuOrder_' + targetFolderName, currentBmo);
                                        localStorage.setItem('lastNoteId_' + targetFolderName, noteId.toString());
                                        localStorage.setItem('lastNoteNumord_' + targetFolderName, noteNumord.toString());
                                        const currentBic = localStorage.getItem('boardIdCounter');
                                        if (currentBic) localStorage.setItem('lastBoardId_' + targetFolderName, currentBic);
                                    }
                                }
                            } else {
                                targetFolderId = await getFolderIDByName(targetFolderName);
                                if (!targetFolderId) {
                                    const granted = await requestAdditionalScopes(SCOPES_FULL);
                                    if (granted) {
                                        targetFolderId = await getFolderIDByName(targetFolderName);
                                    }
                                }
                                if (!targetFolderId) {
                                    if (typeof showToast === 'function') showToast(_('errorFolderNotFoundDrive') || 'Folder not found.');
                                    activeFolderSelect.value = activeFolderName;
                                    return;
                                }
                            }
                        } catch (e) {
                            if (typeof showToast === 'function') showToast(isNew ? (_('errorCreateFolder') || 'Error creating folder.') : (_('errorFolderNotFoundDrive') || 'Folder not found.'));
                            activeFolderSelect.value = activeFolderName;
                            return;
                        }
                    } else {
                        activeFolderSelect.value = activeFolderName;
                        return;
                    }
                } else {
                    targetFolderName = selectedValue;
                }
                if (targetFolderName === activeFolderName) return;
                if (targetFolderName === 'multinotes_data') {
                    const confirmed = await showConfirmation(_('multiNotesSettingsWarn') || 'Warning: Changes in the multinotes_data folder will not automatically reflect in the Android MultiNotes app without a full sync. Are you sure you want to switch to this folder?');
                    if (!confirmed) {
                        activeFolderSelect.value = activeFolderName;
                        return;
                    }
                }
                const settingsModal = document.getElementById('settings-modal');
                const settings2Modal = document.getElementById('settings2-modal');
                if (settingsModal) settingsModal.classList.remove('visible');
                if (settings2Modal) settings2Modal.classList.remove('visible');
                if (typeof showToast === 'function') showToast((_('settingSaved') || 'Settings saved.') + ' ' + (_('synchronizing') || 'Syncing...'));
                try {
                    if (!targetFolderId) {
                        targetFolderId = await getFolderIDByName(targetFolderName);
                    }
                    if (!targetFolderId && targetFolderName !== 'AppDataFolder') {
                        const granted = await requestAdditionalScopes(SCOPES_FULL);
                        if (granted) {
                            targetFolderId = await getFolderIDByName(targetFolderName);
                        } else {
                            if (typeof showToast === 'function') showToast(_('permissionDenied') || 'Permission was not granted.', 5000);
                            activeFolderSelect.value = activeFolderName;
                            return;
                        }
                    }
                    if (!targetFolderId && targetFolderName !== 'AppDataFolder') {
                        removeFolderFromList(targetFolderName);
                        const msg = (_('folderNotFoundRemovedFromList') || `Folder "${targetFolderName}" does not exist in Google Drive and was removed from the list.`)
                            .replace('{folder}', targetFolderName);
                        if (typeof showToast === 'function') showToast(msg, 5000);
                        activeFolderSelect.value = activeFolderName;
                        return;
                    }
                    if (targetFolderId) {
                        if (selectedValue !== 'new_folder' && targetFolderName !== 'AppDataFolder') {
                            const [boardFiles, noteFiles] = await Promise.all([
                                findGDFileByName(targetFolderId, 'board.txt'),
                                findGDFileByName(targetFolderId, 'note.txt')
                            ]);
                            if (!boardFiles && !noteFiles) {
                                if (typeof showToast === 'function') {
                                    showToast(_('errorFolderNoNotesData') || 'This folder does not contain notes data and cannot be used. Please select a folder with MultiNotes data.', 7000);
                                }
                                activeFolderSelect.value = activeFolderName;
                                return;
                            }
                        }
                        const oldActiveFolderName = activeFolderName;
                        console.log(`[Folder-Switch] Changing folder to: "${targetFolderName}" (ID: ${targetFolderId})`);
                        if (oldActiveFolderName) {
                            const currentBmo = localStorage.getItem('boardMenuOrder');
                            if (currentBmo) localStorage.setItem('boardMenuOrder_' + oldActiveFolderName, currentBmo);
                            localStorage.setItem('lastNoteId_' + oldActiveFolderName, noteId.toString());
                            localStorage.setItem('lastNoteNumord_' + oldActiveFolderName, noteNumord.toString());
                            const currentBic = localStorage.getItem('boardIdCounter');
                            if (currentBic) localStorage.setItem('lastBoardId_' + oldActiveFolderName, currentBic);
                        }
                        activeFolderName = targetFolderName;
                        localStorage.setItem('active_folder_name', targetFolderName);
                        const loaderFolderInfo = document.getElementById('loader-folder-info');
                        if (loaderFolderInfo) loaderFolderInfo.textContent = `(${activeFolderName})`;
                        setCachedMainFolderId(targetFolderName, targetFolderId);
                        const folderStartBoard = localStorage.getItem('startBoard_' + targetFolderName);
                        if (folderStartBoard) {
                            localStorage.setItem('startBoard', folderStartBoard);
                        } else {
                            localStorage.removeItem('startBoard');
                        }
                        const newBmo = localStorage.getItem('boardMenuOrder_' + targetFolderName);
                        if (newBmo) {
                            localStorage.setItem('boardMenuOrder', newBmo);
                        } else {
                            localStorage.removeItem('boardMenuOrder');
                        }
                        const newNid = localStorage.getItem('lastNoteId_' + targetFolderName);
                        const newNord = localStorage.getItem('lastNoteNumord_' + targetFolderName);
                        if (newNid !== null) noteId = parseInt(newNid, 10);
                        else noteId = (targetFolderName === 'multinotes_data') ? 1000000 : 0;
                        if (newNord !== null) noteNumord = parseInt(newNord, 10);
                        else noteNumord = (targetFolderName === 'multinotes_data') ? 1000000 : 0;
                        const newBid = localStorage.getItem('lastBoardId_' + targetFolderName);
                        if (newBid !== null) {
                            boardIdCounter = parseInt(newBid, 10);
                            localStorage.setItem('boardIdCounter', boardIdCounter.toString());
                        } else {
                            boardIdCounter = (targetFolderName === 'multinotes_data') ? 1000000 : 0;
                            localStorage.setItem('boardIdCounter', boardIdCounter.toString());
                        }
                        if (!folderNames.includes(targetFolderName)) {
                            folderNames.push(targetFolderName);
                            localStorage.setItem('gdrive_folder_names', JSON.stringify(folderNames));
                        }
                        localStorage.setItem('useGoogleDb', 'true');
                        localStorage.setItem('useIndexedDb', 'true');
                        localStorage.setItem('useLocalDb', 'false');
                        localStorage.setItem('useArhDb', 'false');
                        ["Other", "Sound", "Video", "Images"].forEach(n => localStorage.removeItem(`gdrive_folder_id_${n}`));
                        if (typeof NOTES_DB_NAME !== 'undefined') {
                            indexedDB.deleteDatabase(NOTES_DB_NAME);
                        } else {
                            indexedDB.deleteDatabase('multinotes_db');
                        }
                        await syncGlobalFoldersJson();
                        location.reload();
                    } else {
                        activeFolderSelect.value = activeFolderName;
                    }
                } catch (err) {
                    console.error("Error switching folder:", err);
                    activeFolderSelect.value = activeFolderName;
                }
            });
        }
    }
    // Hide Assistant Logic
    if (hideAssistantCheckbox) {
        hideAssistantCheckbox.checked = localStorage.getItem('hideAssistant') === 'true';
        hideAssistantCheckbox.addEventListener('change', () => {
            const isChecked = hideAssistantCheckbox.checked;
            localStorage.setItem('hideAssistant', isChecked);
            const fabButton = document.getElementById('kb-fab');
            if (fabButton) {
                fabButton.style.display = isChecked ? 'none' : 'block';
            }
            // Ако скрием асистента, скриваме и промо бележката веднага
            if (isChecked) {
                if (promoNoteElement) {
                    promoNoteElement.style.display = 'none';
                }
                // Изчистваме флаговете за затворени промо бележки, за да се покажат отново при включване
                Object.keys(localStorage).forEach(key => {
                    if (key.startsWith('dismissedPromo_')) {
                        localStorage.removeItem(key);
                    }
                });
            }
            showToast(_('settingSaved'), 2000);
        });
    }
    const trashSearchCheckbox = document.getElementById('trash-search-checkbox');
    if (trashSearchCheckbox) {
        trashSearchCheckbox.checked = localStorage.getItem('trashSearch') === 'true';
        trashSearchCheckbox.addEventListener('change', () => {
            localStorage.setItem('trashSearch', trashSearchCheckbox.checked);
            showToast(_('settingSaved'), 2000);
            applyFilters();
        });
    }
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
    let opacityTimeout;
    const settingsModal = document.getElementById('settings-modal');
    const startOpacityChange = () => {
        if (settingsModal) settingsModal.style.opacity = '0.7';
    };
    const endOpacityChange = () => {
        if (settingsModal) settingsModal.style.opacity = '1';
    };
    const scaleDecBtn = document.getElementById('scaleDecBtn');
    const scaleIncBtn = document.getElementById('scaleIncBtn');
    const stepBtnOpacity = () => {
        startOpacityChange();
        if (opacityTimeout) clearTimeout(opacityTimeout);
        opacityTimeout = setTimeout(endOpacityChange, 1500);
    };
    if (scaleDecBtn) {
        scaleDecBtn.addEventListener('click', () => {
            let val = parseInt(scaleInput.value, 10) || 100;
            val = Math.max(25, val - 1);
            updateZoom(val);
            localStorage.setItem('zoomLevel', val);
            stepBtnOpacity();
        });
    }
    if (scaleIncBtn) {
        scaleIncBtn.addEventListener('click', () => {
            let val = parseInt(scaleInput.value, 10) || 100;
            val = Math.min(175, val + 1);
            updateZoom(val);
            localStorage.setItem('zoomLevel', val);
            stepBtnOpacity();
        });
    }
    const applyBtn = document.getElementById('applyZoomBtn');
    // Listeners for migrated settings
    const closeAfterSaveCheckbox = document.getElementById('close-after-save-checkbox');
    if (closeAfterSaveCheckbox) {
        closeAfterSaveCheckbox.checked = localStorage.getItem('closeAfterSave') === 'true';
        closeAfterSaveCheckbox.addEventListener('change', () => {
            localStorage.setItem('closeAfterSave', closeAfterSaveCheckbox.checked);
            showToast(_('settingSaved'), 2000);
        });
    }
    const updateLocalFolderCheckbox = document.getElementById('update-local-folder-checkbox');
    if (updateLocalFolderCheckbox) {
        updateLocalFolderCheckbox.checked = localStorage.getItem('updateLocalFolder') === 'true';
        updateLocalFolderCheckbox.addEventListener('change', () => {
            localStorage.setItem('updateLocalFolder', updateLocalFolderCheckbox.checked);
            updateLocalFolder = updateLocalFolderCheckbox.checked;
            showToast(_('settingSaved'), 2000);
        });
    }
    const forceGDriveReadCheckbox = document.getElementById('force-gdrive-read-checkbox');
    if (forceGDriveReadCheckbox) {
        forceGDriveReadCheckbox.checked = localStorage.getItem('forceGDriveRead') === 'true';
        forceGDriveReadCheckbox.addEventListener('change', () => {
            localStorage.setItem('forceGDriveRead', forceGDriveReadCheckbox.checked);
            showToast(_('settingSaved'), 2000);
        });
    }
    const checkEmptyBoardsCheckbox = document.getElementById('check-empty-boards-checkbox');
    if (checkEmptyBoardsCheckbox) {
        checkEmptyBoardsCheckbox.checked = localStorage.getItem('checkEmptyBoards') === 'true';
        checkEmptyBoardsCheckbox.addEventListener('change', () => {
            localStorage.setItem('checkEmptyBoards', checkEmptyBoardsCheckbox.checked);
            showToast(_('settingSaved'), 2000);
        });
    }
    const automatedTimerCheckbox = document.getElementById('automated-timer-checkbox');
    if (automatedTimerCheckbox) {
        automatedTimerCheckbox.checked = localStorage.getItem('automatedTimer') !== 'false';
        automatedTimerCheckbox.addEventListener('change', () => {
            localStorage.setItem('automatedTimer', automatedTimerCheckbox.checked);
            automatedTimer = automatedTimerCheckbox.checked;
            showToast(_('settingSaved'), 2000);
        });
    }
    // --- Markdown Symbols Settings ---
    const mdBoldInput = document.getElementById('md-bold-input');
    const mdItalicInput = document.getElementById('md-italic-input');
    const mdStrikeInput = document.getElementById('md-strike-input');
    const mdUnderlineInput = document.getElementById('md-underline-input');
    const mdClearInput = document.getElementById('md-clear-input');
    const mdBulletInput = document.getElementById('md-bullet-input');

    const setupMdInput = (input, storageKey, defaultValue) => {
        if (input) {
            input.value = localStorage.getItem(storageKey) || defaultValue;
            input.addEventListener('change', () => {
                localStorage.setItem(storageKey, input.value);
                showToast(_('settingSaved'), 2000);
            });
        }
    };

    setupMdInput(mdBoldInput, 'mdBold', '**');
    setupMdInput(mdItalicInput, 'mdItalic', '*');
    setupMdInput(mdStrikeInput, 'mdStrike', '~~');
    setupMdInput(mdUnderlineInput, 'mdUnderline', '_');
    setupMdInput(mdClearInput, 'mdClear', '--');
    setupMdInput(mdBulletInput, 'mdBullet', '-');

    applyBtn.addEventListener('click', () => {
        const zoomValue = scaleInput.value;
        updateZoom(zoomValue);
        localStorage.setItem('zoomLevel', zoomValue);
        showToast(_('settingSaved'), 2000);
        // Keep transparency for 5 seconds
        if (typeof startOpacityChange === 'function') {
            startOpacityChange();
            if (opacityTimeout) clearTimeout(opacityTimeout);
            opacityTimeout = setTimeout(() => {
                endOpacityChange();
            }, 5000);
        }
    });
    const syncDirtyBtn = document.getElementById('sync-dirty-btn');
    if (syncDirtyBtn) {
        syncDirtyBtn.addEventListener('click', () => {
            syncDirtyNotes();
        });
    }
    const saveDbFolderBtn = document.getElementById('save-db-folder-btn');
    if (saveDbFolderBtn) {
        saveDbFolderBtn.addEventListener('click', () => {
            handleSaveDbToFolder();
        });
    }
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
    // --- Прозрачност при използване на плъзгача ---
    scaleSlider.addEventListener('mousedown', startOpacityChange);
    scaleSlider.addEventListener('touchstart', startOpacityChange, { passive: true });
    scaleSlider.addEventListener('mouseup', endOpacityChange);
    scaleSlider.addEventListener('touchend', endOpacityChange);
    scaleSlider.addEventListener('mouseleave', endOpacityChange); // За всеки случай
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
    // Make modal transparent when typing in scaleInput
    scaleInput.addEventListener('focus', () => {
        startOpacityChange();
        if (opacityTimeout) clearTimeout(opacityTimeout);
    });
    scaleInput.addEventListener('blur', endOpacityChange);
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
    setupFontSizeInput(noteFontSizeInput, 'noteFontSize', 16, (val) => document.documentElement.style.setProperty('--note-font-size', `${val}px`));
    setupFontSizeInput(modalFontSizeInput, 'modalFontSize', 16, (val) => modalBody.style.fontSize = `${val}px`);
    // Date
    showDatemodCheckbox.checked = localStorage.getItem('showDatemod') !== 'false'; // Default to true
    showDatemodCheckbox.addEventListener('change', () => {
        const isChecked = showDatemodCheckbox.checked;
        localStorage.setItem('showDatemod', isChecked);
        document.body.classList.toggle('hide-datemod', !isChecked);
        showToast(_('settingSaved'), 2000);
    });
    if (showFirstLineCheckbox) {
        showFirstLineCheckbox.checked = localStorage.getItem('showFirstLine') === 'true'; // Default to false
        showFirstLineCheckbox.addEventListener('change', async () => {
            localStorage.setItem('showFirstLine', showFirstLineCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            await renderUI({ boardParseError: false });
        });
    }
    // Show 'New' Board Checkbox
    if (showNewBoardCheckbox) {
        showNewBoardCheckbox.checked = localStorage.getItem('showNewBoard') === 'true'; // Default to false
        showNewBoardCheckbox.addEventListener('change', () => {
            localStorage.setItem('showNewBoard', showNewBoardCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
        });
    }
    // One-tap links
    oneTapLinkCheckbox.checked = localStorage.getItem('oneTapLink') === 'true'; // Default to false
    oneTapLinkCheckbox.addEventListener('change', () => {
        const isChecked = oneTapLinkCheckbox.checked;
        localStorage.setItem('oneTapLink', isChecked);
        showToast(_('settingSaved'), 2000);
        oneTapLinkChanged = true;
    });
    // Click to edit
    if (clickToEditCheckbox) {
        clickToEditCheckbox.checked = localStorage.getItem('clickToEdit') !== 'false'; // Default to true
        clickToEditCheckbox.addEventListener('change', () => {
            localStorage.setItem('clickToEdit', clickToEditCheckbox.checked);
            showToast(_('settingSaved'), 2000);
        });
    }
    // Hide Toast info messages
    isToastHidden = localStorage.getItem('hideToast') === 'true'; // Default to false
    if (hideToastCheckbox) {
        hideToastCheckbox.checked = isToastHidden;
        hideToastCheckbox.addEventListener('change', () => {
            isToastHidden = hideToastCheckbox.checked;
            localStorage.setItem('hideToast', isToastHidden.toString());
            if (!isToastHidden) {
                showToast(_('settingSaved'), 2000);
            }
        });
    }
    // Graphical background
    const imgBgrdCheckbox = document.getElementById('img-bgrd-checkbox');
    imgBgrdCheckbox.checked = localStorage.getItem('imgBgrd') !== 'false'; // Default to true
    imgBgrdCheckbox.addEventListener('change', () => {
        const isChecked = imgBgrdCheckbox.checked;
        localStorage.setItem('imgBgrd', isChecked);
        showToast(_('settingSaved'), 2000);
    });
    // Graphical background (notes list)
    const notesBgrdCheckbox = document.getElementById('notes-bgrd-checkbox');
    notesBgrdCheckbox.checked = localStorage.getItem('notesBgrd') !== 'false'; // Default to true
    notesBgrdCheckbox.addEventListener('change', () => {
        const isChecked = notesBgrdCheckbox.checked;
        localStorage.setItem('notesBgrd', isChecked);
        showToast(_('settingSaved'), 2000);
        notesBgrdChanged = true;
    });
    // Board Note Count
    if (showBoardNoteCountCheckbox) {
        showBoardNoteCountCheckbox.checked = localStorage.getItem('showBoardNoteCount') === 'true';
        showBoardNoteCountCheckbox.addEventListener('change', async () => {
            localStorage.setItem('showBoardNoteCount', showBoardNoteCountCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            // Просто презареждаме менюто. renderUI ще се погрижи за показването/скриването.
            await renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Show 'All' Board Checkbox
    if (showBoardAllCheckbox) {
        showBoardAllCheckbox.checked = localStorage.getItem('showBoardAll') !== 'false'; // Default to true
        showBoardAllCheckbox.addEventListener('change', () => {
            localStorage.setItem('showBoardAll', showBoardAllCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Show 'Reminders' Board Checkbox
    if (showBoardRemindCheckbox) {
        showBoardRemindCheckbox.checked = localStorage.getItem('showBoardRemind') !== 'false'; // Default to true
        showBoardRemindCheckbox.addEventListener('change', () => {
            localStorage.setItem('showBoardRemind', showBoardRemindCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Show 'Photos' Board Checkbox
    if (showPhotosBoardCheckbox) {
        showPhotosBoardCheckbox.checked = localStorage.getItem('showPhotosBoard') === 'true';
        showPhotosBoardCheckbox.addEventListener('change', () => {
            localStorage.setItem('showPhotosBoard', showPhotosBoardCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Show 'Videos' Board Checkbox
    if (showVideosBoardCheckbox) {
        showVideosBoardCheckbox.checked = localStorage.getItem('showVideosBoard') === 'true';
        showVideosBoardCheckbox.addEventListener('change', () => {
            localStorage.setItem('showVideosBoard', showVideosBoardCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Show 'Sounds' Board Checkbox
    if (showSoundsBoardCheckbox) {
        showSoundsBoardCheckbox.checked = localStorage.getItem('showSoundsBoard') === 'true';
        showSoundsBoardCheckbox.addEventListener('change', () => {
            localStorage.setItem('showSoundsBoard', showSoundsBoardCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Show 'Other' Board Checkbox
    if (showOtherBoardCheckbox) {
        showOtherBoardCheckbox.checked = localStorage.getItem('showOtherBoard') === 'true';
        showOtherBoardCheckbox.addEventListener('change', () => {
            localStorage.setItem('showOtherBoard', showOtherBoardCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        });
    }
    // Weekly Calendar Checkbox
    if (weeklyCalendarCheckbox) {
        weeklyCalendarCheckbox.checked = localStorage.getItem('showWeeklyCalendar') === 'true';
        weeklyCalendarCheckbox.addEventListener('change', () => {
            localStorage.setItem('showWeeklyCalendar', weeklyCalendarCheckbox.checked.toString());
            showToast(_('settingSaved'), 2000);
            // No need to rerender, it's checked on calendar view open
        });
    }
    // Sorting and Boards accordions
    const sortingOptionsSection = document.getElementById('sorting-options-section');
    const sortingArrow = document.getElementById('sorting-arrow');
    const boardsOptionsSection = document.getElementById('boards-options-section');
    const boardsArrow = document.getElementById('boards-arrow');
    // Event listener for the sorting arrow
    sortingArrow.addEventListener('click', () => {
        const isActive = sortingOptionsSection.style.display === 'block';
        sortingOptionsSection.style.display = isActive ? 'none' : 'block';
        sortingArrow.style.transition = 'transform 0.3s ease';
        sortingArrow.style.transform = isActive ? 'rotate(0deg)' : 'rotate(180deg)';
    });
    // Event listener for the boards arrow
    boardsArrow.addEventListener('click', () => {
        const isActive = boardsOptionsSection.style.display === 'block';
        boardsOptionsSection.style.display = isActive ? 'none' : 'block';
        boardsArrow.style.transition = 'transform 0.3s ease';
        boardsArrow.style.transform = isActive ? 'rotate(0deg)' : 'rotate(180deg)';
    });
    // Sorting options
    const sortCriteriaRadios = document.querySelectorAll('input[name="sort-criteria"]');
    const savedSortCriteria = localStorage.getItem('sortCriteria') || 'numord';
    sortCriteriaRadios.forEach(radio => {
        if (radio.value === savedSortCriteria) {
            radio.checked = true;
        }
        radio.addEventListener('change', () => {
            if (radio.checked) {
                // Всеки избор на критерий автоматично активира сортирането
                localStorage.setItem('enableNoteSorting', 'true');
                localStorage.setItem('sortCriteria', radio.value);
                applyFilters();
                showToast(_('settingSaved'), 2000);
            }
        });
    });
    const sortReverseCheckbox = document.getElementById('sort-reverse-checkbox');
    sortReverseCheckbox.checked = localStorage.getItem('sortInReverse') === 'true';
    sortReverseCheckbox.addEventListener('change', () => {
        localStorage.setItem('enableNoteSorting', 'true');
        localStorage.setItem('sortInReverse', sortReverseCheckbox.checked);
        applyFilters();
        showToast(_('settingSaved'), 2000);
    });
    const sortRemindersTopCheckbox = document.getElementById('sort-reminders-top-checkbox');
    sortRemindersTopCheckbox.checked = localStorage.getItem('sortRemindersTop') === 'true';
    sortRemindersTopCheckbox.addEventListener('change', () => {
        localStorage.setItem('enableNoteSorting', 'true');
        localStorage.setItem('sortRemindersTop', sortRemindersTopCheckbox.checked);
        applyFilters();
        showToast(_('settingSaved'), 2000);
    });
    const systemBoardSortSelect = document.getElementById('system-board-sort-select');
    const systemBoardOrderBtn = document.getElementById('system-board-order-btn');
    if (systemBoardSortSelect) {
        const systemSortBoards = [
            { id: 'all', label: _('allBoards') },
            { id: 'reminder', label: _('reminder') },
            { id: 'new-updates', label: _('newUpdates') },
            { id: 'with-photos', label: _('showPhotosBoardLabel').replace(/<[^>]*>/g, '').replace(/^(Board|Борд)\s*/i, '').replace(/:$/, '') },
            { id: 'with-videos', label: _('showVideosBoardLabel').replace(/<[^>]*>/g, '').replace(/^(Board|Борд)\s*/i, '').replace(/:$/, '') },
            { id: 'with-sounds', label: _('showSoundsBoardLabel').replace(/<[^>]*>/g, '').replace(/^(Board|Борд)\s*/i, '').replace(/:$/, '') },
            { id: 'with-other', label: _('showOtherBoardLabel').replace(/<[^>]*>/g, '').replace(/^(Board|Борд)\s*/i, '').replace(/:$/, '') },
            { id: 'search-results', label: _('searchResultTitle') },
            { id: 'trash', label: _('trashBoardTitle') }
        ];
        systemBoardSortSelect.innerHTML = '';
        systemSortBoards.forEach(board => {
            const option = document.createElement('option');
            option.value = board.id;
            option.textContent = board.label || board.id;
            systemBoardSortSelect.appendChild(option);
        });
    }
    if (systemBoardOrderBtn && systemBoardSortSelect) {
        systemBoardOrderBtn.addEventListener('click', () => {
            const boardOrderModal = document.getElementById('board-order-modal');
            if (!boardOrderModal) return;
            ensureBoardSortOptionsCloned();
            const boardId = systemBoardSortSelect.value || 'all';
            boardOrderModal.dataset.mode = 'system';
            boardOrderModal.dataset.systemBoardId = boardId;
            applySortStatusToControls(getSystemBoardSortStatus(boardId), 'board-sort-criteria', 'board-sort-reverse-checkbox', 'board-sort-reminders-top-checkbox');
            const clearOrderBtn = document.getElementById('board-order-clear-btn');
            const saveOrderBtn = document.getElementById('board-order-save-btn');
            if (clearOrderBtn) {
                clearOrderBtn.onclick = () => {
                    const activeBoardId = boardOrderModal.dataset.systemBoardId;
                    if (activeBoardId) localStorage.removeItem(getSystemBoardSortKey(activeBoardId));
                    boardOrderModal.classList.remove('visible');
                    applyFilters();
                    showToast(_('settingSaved'), 2000);
                };
            }
            if (saveOrderBtn) {
                saveOrderBtn.onclick = () => {
                    const activeBoardId = boardOrderModal.dataset.systemBoardId;
                    const sortStatus = getSortStatusFromControls('board-sort-criteria', 'board-sort-reverse-checkbox', 'board-sort-reminders-top-checkbox');
                    if (activeBoardId) localStorage.setItem(getSystemBoardSortKey(activeBoardId), String(sortStatus));
                    boardOrderModal.classList.remove('visible');
                    applyFilters();
                    showToast(_('settingSaved'), 2000);
                };
            }
            boardOrderModal.classList.add('visible');
        });
    }
    // Start Board
    let startBoardSelect; // Declare here to be accessible in the whole function
    startBoardSelect = document.getElementById('start-board-select');
    const currentFolder = localStorage.getItem('active_folder_name') || 'multinotes_data';
    startBoardSelect.value = localStorage.getItem('startBoard') || 'Main';
    startBoardSelect.addEventListener('change', () => {
        localStorage.setItem('startBoard', startBoardSelect.value);
        const af = localStorage.getItem('active_folder_name') || 'multinotes_data';
        localStorage.setItem('startBoard_' + af, startBoardSelect.value);
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
            showToast(_('errorNoDataSourceSelected'), 5000);
            // Не позволяваме премахването, като връщаме отметката
            changedCheckbox.checked = true;
            return;
        }
        if (changedCheckbox.checked) {
            // Преди да запишем в localStorage, проверяваме дали имаме избрана папка
            if (changedKey === 'useLocalDb' || changedKey === 'useArhDb') {
                const display = (changedKey === 'useLocalDb') ?
                    document.getElementById('local-sync-folder-name') :
                    document.getElementById('arh-folder-name');

                if (!display || display.textContent === _('folderNotSelected')) {
                    // Не записваме в localStorage, махаме отметката и отваряме избора на папка
                    changedCheckbox.checked = false;
                    const btnId = (changedKey === 'useLocalDb') ? 'select-folder-btn' : 'select-arh-btn';
                    document.getElementById(btnId).click();
                    return;
                }
            }
            // Uncheck all other data sources
            dataSources.forEach(({ checkbox, key }) => {
                if (key !== changedKey) {
                    checkbox.checked = false;
                    localStorage.setItem(key, 'false');
                }
            });
        }
        // Save the state of the changed checkbox
        localStorage.setItem(changedKey, changedCheckbox.checked);
        showToast(_('settingSaved'), 2000);
        updateModeButton();
    };
    dataSources.forEach(({ checkbox, key }) => {
        checkbox.addEventListener('change', () => handleDataSourceChange(checkbox, key));
    });
    // indexedDB
    // Задаваме първоначалното състояние на чекбокса от localStorage
    useIndexedDbCheckbox.checked = localStorage.getItem('useIndexedDb') === 'true';
    // Add event listeners
    useIndexedDbCheckbox.addEventListener('change', async (e) => {
        const isChecked = e.target.checked;

        // --- ПРОВЕРКИ ЗА ВАЛИДНОСТ НА БАЗАТА ДАННИ ---
        if (isChecked && dbExists) {
            try {
                // 1. Проверка на папката
                const dbCreatedFolderName = await getConfig('dbCreatedFolderName');
                if (dbCreatedFolderName) {
                    const activeFolder = localStorage.getItem('active_folder_name') || 'multinotes_data';
                    if (dbCreatedFolderName !== activeFolder) {
                        const msg = (_('dbFolderMismatch') || 'Внимание: БД е създадена за папка "{dbFolder}", а текущата е "{activeFolder}".')
                            .replace('{dbFolder}', dbCreatedFolderName)
                            .replace('{activeFolder}', activeFolder);
                        showToast(msg, 5000);
                        // Оставяме отметката включена и не връщаме (return), само информираме
                    }
                }

                // 2. Проверка на потребителя (собственика)
                const dbOwnerEmail = await getConfig('userEmail');
                if (dbOwnerEmail) {
                    const currentUserEmail = sessionStorage.getItem('google_auth_email_hint') || localStorage.getItem('google_login_hint');
                    // Сравняваме само ако имаме и двата имейла. 
                    if (currentUserEmail && dbOwnerEmail !== currentUserEmail) {
                        e.target.checked = false;
                        localStorage.setItem('useIndexedDb', 'false');
                        const msg = (_('dbOwnerMismatch') || 'Грешка: БД принадлежи на {dbOwner}, а текущият потребител е {currentUser}.')
                            .replace('{dbOwner}', dbOwnerEmail)
                            .replace('{currentUser}', currentUserEmail);
                        showToast(msg, 5000);
                        return;
                    }
                }
            } catch (err) {
                console.error("Error validating DB config:", err);
            }
        }

        localStorage.setItem('useIndexedDb', isChecked);
        // --- КОРЕКЦИЯ: Само ако базата НЕ съществува, симулираме клик на "Създай" ---
        if (isChecked) {
            if (!dbExists) {
                document.getElementById('create-db-btn').click();
            } else {
                updateGlobalStateFlags();
                updateModeButton();
                showToast(_('settingSaved'), 2000);
            }
        } else {
            updateGlobalStateFlags();
            updateModeButton();
            showToast(_('settingSaved'), 2000);
        }
    });
    // Accordion logic
    const accordionHeader = document.querySelector('.accordion-header');
    if (accordionHeader) {
        accordionHeader.addEventListener('click', () => {
            const accordion = accordionHeader.parentElement;
            accordion.classList.toggle('active');
            const content = accordion.querySelector('.accordion-content');
            const advancedSettingsDiv = document.getElementById('advanced-settings');
            const dataFoldersDiv = document.getElementById('data-folders');
            const settingsModalBody = document.getElementById('settings-modal-body');

            if (content.style.maxHeight) {
                content.style.maxHeight = null;
                if (advancedSettingsDiv) advancedSettingsDiv.style.display = 'none'; // Hide content when collapsed
                if (dataFoldersDiv) {
                    dataFoldersDiv.style.maxHeight = null;
                    dataFoldersDiv.style.display = 'none';
                }
                if (settingsModalBody) {
                    settingsModalBody.style.overflowY = 'auto'; // Възстановяваме скролбара, ако е бил скрит
                }
            } else {
                if (advancedSettingsDiv) advancedSettingsDiv.style.display = 'block'; // Show content before calculating height
                if (dataFoldersDiv) {
                    dataFoldersDiv.style.display = 'block';
                    dataFoldersDiv.style.maxHeight = dataFoldersDiv.scrollHeight + "px";
                }
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
            updateModeButton();
            await new Promise(resolve => setTimeout(resolve, 150));
            confirmed = await showConfirmation(_('confirmDbRecreate'));

            if (!confirmed) {
                // Ако потребителят откаже презапис, проверяваме дали данните съвпадат
                const memBoards = (typeof boardsData !== 'undefined') ? boardsData : [];
                if (!areBoardsIdentical(memBoards, boardsInDb)) {
                    // Вече само предупреждаваме, без да блокираме
                    console.warn("DB Identity Check: Some boards in DB not found in current memory. This might be normal during state transitions.");
                    dbExists = true;
                    updateGlobalStateFlags();
                    updateModeButton();
                    return; // Спираме процеса тук, но не махаме отметката
                }
                // Ако са идентични, позволяваме включването без презапис
                dbExists = true;
                updateGlobalStateFlags();
                updateModeButton();
                return;
            }
        } else {
            // Ако базата не съществува или е празна, продължаваме директно със създаването.
            confirmed = true;
        }
        if (confirmed) {
            const success = await createDatabaseFromMemory();
            if (success) {
                showToast(_('dbCreated'), 10000);
                dbExists = true;
                // --- КОРЕКЦИЯ: Автоматично включваме отметката при успешно създаване ---
                const cb = document.getElementById('use-indexeddb-checkbox');
                if (cb) {
                    cb.checked = true;
                    localStorage.setItem('useIndexedDb', 'true');
                    updateGlobalStateFlags();
                    updateModeButton();
                }
            }
        }
    });
    const deleteDbBtn = document.getElementById('delete-db-btn');
    deleteDbBtn.addEventListener('click', async () => {
        // --- КОРЕКЦИЯ: Запомняме дали сме в режим "Само база данни" ПРЕДИ изтриването ---
        const isDbOnlyMode =
            document.getElementById('use-indexeddb-checkbox').checked &&
            !document.getElementById('use-google-db-checkbox').checked &&
            !document.getElementById('use-local-db-checkbox').checked &&
            !document.getElementById('use-arh-db-checkbox').checked;
        // Затваряме настройките, за да се видят диалозите за потвърждение
        document.getElementById('settings-modal').classList.remove('visible');
        // Изчакваме анимацията на затваряне да приключи, преди да покажем новия диалог
        await new Promise(resolve => setTimeout(resolve, 150));
        const confirmedDataDelete = await showConfirmation(_('confirmDbDelete'));
        if (confirmedDataDelete) {
            const dirH = await getConfig('directoryHandle');
            const arH = await getConfig('arhHandle');
            const hasFolderHandles = !!(dirH || arH);
            let confirmedConfigDelete = false;
            if (hasFolderHandles) {
                confirmedConfigDelete = await showConfirmation(_('confirmConfigDelete'), {
                    backgroundColor: '#lightgreen',
                    width: '450px'
                });
            } else {
                confirmedConfigDelete = true;
            }
            if (confirmedConfigDelete) {
                // Потребителят иска да изтрие всичко, включително настройките
                await deleteNotesDB();
                // Нулираме UI елементите за избраните папки
                const folderNameDisplay = document.getElementById('local-sync-folder-name');
                const arhFolderNameDisplay = document.getElementById('arh-folder-name');
                if (folderNameDisplay) folderNameDisplay.textContent = _('folderNotSelected');
                if (arhFolderNameDisplay) arhFolderNameDisplay.textContent = _('folderNotSelected');
                dbExists = false; // Актуализираме глобалния флаг
                // --- НОВА ЛОГИКА: Премахваме отметките за локални източници ---
                const localCheckbox = document.getElementById('use-local-db-checkbox');
                const arhCheckbox = document.getElementById('use-arh-db-checkbox');
                if (localCheckbox) localCheckbox.checked = false;
                if (arhCheckbox) arhCheckbox.checked = false;
                localStorage.setItem('useLocalDb', 'false');
                localStorage.setItem('useArhDb', 'false');
                dirHandle = null; // Нулираме и handle-a в паметта
            } else {
                // Потребителят иска да изтрие само данните, но да запази настройките
                await clearDbStores();
            }
            // Изчистваме настройката за стартов борд, тъй като бордовете вече не съществуват
            localStorage.removeItem('startBoard');
            // --- НОВА МИНИМАЛНА КОРЕКЦИЯ ---
            // След успешно изтриване, ВИНАГИ премахваме отметката и обновяваме localStorage.
            showToast(_('dbDeleted'), 5000);
            const useIndexedDbCheckbox = document.getElementById('use-indexeddb-checkbox');
            useIndexedDbCheckbox.checked = false;
            localStorage.setItem('useIndexedDb', 'false');
            // Ако сме били в режим "Само база данни", автоматично включваме Google Drive
            if (isDbOnlyMode) {
                localStorage.setItem('useGoogleDb', 'true');
                document.getElementById('use-google-db-checkbox').checked = true;
                updateGlobalStateFlags();
                await mainLogic(); // ПРЕЗАРЕЖДАМЕ ЛОГИКАТА
            }
            // --- КОРЕКЦИЯ: Актуализираме иконата за режим веднага ---
            updateModeButton();
        } else {
            // Ако потребителят откаже изтриването, отваряме настройките отново, за да не остава празен екран.
            document.getElementById('settings-modal').classList.add('visible');
        }
        // Активираме контролите, в случай че са били деактивирани от userCheck
        enableSettingsControls();
    });
    // --- Local Sync Folder ---
    selectFolderBtn.addEventListener('click', async () => {
        try {
            const handle = await window.showDirectoryPicker();
            if (handle) {
                const validationResult = await validateFolderContent(handle);
                if (!validationResult.isValid) {
                    let warningMessage = _('invalidDataFolder').replace('{folderName}', handle.name);
                    if (validationResult.reason === 'criteria_not_met') {
                        warningMessage += " " + _('requiredFilesForLocalFolder');
                    }
                    showToast(warningMessage, 15000);
                    return;
                }
                await saveConfig('directoryHandle', handle);
                dirHandle = handle;
                folderNameDisplay.textContent = handle.name;
                folderNameDisplay.title = handle.name;
                showToast(_('folderSelectedForSync').replace('{folderName}', handle.name), 10000);

                // Актуализираме отметката и localStorage
                const localCheckbox = document.getElementById('use-local-db-checkbox');
                if (localCheckbox) localCheckbox.checked = true;
                localStorage.setItem('useLocalDb', 'true');

                // Изключваме другите източници
                localStorage.setItem('useGoogleDb', 'false');
                localStorage.setItem('useArhDb', 'false');
                const googleCheckbox = document.getElementById('use-google-db-checkbox');
                const arhCheckbox = document.getElementById('use-arh-db-checkbox');
                if (googleCheckbox) googleCheckbox.checked = false;
                if (arhCheckbox) arhCheckbox.checked = false;

                const settingsModal = document.getElementById('settings-modal');
                const settings2Modal = document.getElementById('settings2-modal');
                if (settingsModal) settingsModal.classList.remove('visible');
                if (settings2Modal) settings2Modal.classList.remove('visible');

                updateModeButton();
                mainLogic();
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.log("Error selecting directory:", error);
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
                    let warningMessage = _('invalidDataFolder').replace('{folderName}', handle.name);
                    if (validationArh.reason === 'criteria_not_met') {
                        warningMessage += " " + _('requiredFilesForLocalFolder');
                    }
                    showToast(warningMessage, 15000);
                    return;
                }
                arhFolderNameDisplay.textContent = handle.name;
                arhFolderNameDisplay.title = handle.name;
                dirHandle = handle; // <--- ДОБАВЕН РЕД
                await saveConfig('arhHandle', handle); // Запазваме избраната папка

                // Актуализираме отметката и localStorage
                const arhCheckbox = document.getElementById('use-arh-db-checkbox');
                if (arhCheckbox) arhCheckbox.checked = true;
                localStorage.setItem('useArhDb', 'true');

                // Изключваме другите източници
                localStorage.setItem('useGoogleDb', 'false');
                localStorage.setItem('useLocalDb', 'false');
                const googleCheckbox = document.getElementById('use-google-db-checkbox');
                const localCheckbox = document.getElementById('use-local-db-checkbox');
                if (googleCheckbox) googleCheckbox.checked = false;
                if (localCheckbox) localCheckbox.checked = false;

                const settingsModal = document.getElementById('settings-modal');
                const settings2Modal = document.getElementById('settings2-modal');
                if (settingsModal) settingsModal.classList.remove('visible');
                if (settings2Modal) settings2Modal.classList.remove('visible');

                showToast(_('folderSelectedForArh').replace('{folderName}', handle.name), 5000);
                // КЛЮЧОВА КОРЕКЦИЯ: Обновяваме флаговете ПРЕДИ да извикаме mainLogic
                updateGlobalStateFlags();

                updateModeButton();
                // След избор, просто презареждаме основната логика,
                // която вече ще види, че е избран режим "Архив".
                mainLogic();
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.log("Error selecting directory:", error);
            }
        }
    });
    // Close
    document.getElementById('settings-close-btn').addEventListener('click', async (e) => {
        if (e && e.ctrlKey) return; // Allow Ctrl-Click toggle behavior to fire without closing the UI

        /* const configData = await exportConfig();
        console.log("configData: ", configData); // Ще изведе масива с ключ/стойност от config store-a */
        const currentState = {
            useGoogleDb: document.getElementById('use-google-db-checkbox').checked,
            useLocalDb: document.getElementById('use-local-db-checkbox').checked,
            useArhDb: document.getElementById('use-arh-db-checkbox').checked,
            useIndexedDb: document.getElementById('use-indexeddb-checkbox').checked
        };

        // --- STRICT VALIDATION FIRST ---
        updateGlobalStateFlags();
        if (!validateDataSourceSelection()) {
            // If validation fails, DO NOT close the modal.
            // toast is shown by validateDataSourceSelection
            return;
        }

        document.getElementById('settings-modal').classList.remove('visible');
        if (window.kbAssistant) window.kbAssistant.terminateGuide();
        // Винаги обновяваме бутона, за да отрази актуалното състояние от localStorage
        updateModeButton();
        const hasChanged = JSON.stringify(settingsInitialState) !== JSON.stringify(currentState);
        if (window.wasOpenedForMissingFolder) {
            window.wasOpenedForMissingFolder = false; // Нулираме флага
            mainLogic(); // Извикваме основната логика отново
        } else if (hasChanged) {
            mainLogic(); // Извикваме основната логика отново
        }
    });
    settingsModalBody.dataset.initialized = true;
}
// Always ensure the delete folder button has a listener (outside the initialization guard)
const deleteFolderBtn = document.getElementById('delete-folder-btn');
if (deleteFolderBtn) {
    deleteFolderBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showFolderDeletePopup();
    };
}

// При инициализация на UI, проверяваме дали разширените настройки трябва да са видими
// Разширените настройки вече са част от settings2-modal и са винаги видими
const advancedSettings = document.getElementById('advanced-settings');
if (advancedSettings) {
    // Вече не се скриват
    advancedSettings.removeAttribute('hidden');
}

// Асинхронно зареждане на името на папката за архив и локална синхронизация
async function updateSpecialFolderNames() {
    try {
        const arhFolderNameDisplay = document.getElementById('arh-folder-name');
        if (arhFolderNameDisplay) {
            const arhHandle = await getConfig('arhHandle');
            if (arhHandle) {
                const permission = await arhHandle.queryPermission({ mode: 'readwrite' });
                if (permission === 'granted') {
                    arhFolderNameDisplay.textContent = arhHandle.name;
                    arhFolderNameDisplay.title = arhHandle.name;
                } else {
                    arhFolderNameDisplay.textContent = _('permissionDenied');
                    arhFolderNameDisplay.style.color = 'red';
                }
            } else { arhFolderNameDisplay.textContent = _('folderNotSelected'); }
        }
    } catch (err) {
        console.warn("Could not load archive folder name:", err);
    }

    try {
        const folderNameDisplay = document.getElementById('local-sync-folder-name');
        if (folderNameDisplay) {
            const syncHandle = await getConfig('directoryHandle');
            if (syncHandle) {
                const permission = await syncHandle.queryPermission({ mode: 'readwrite' });
                if (permission === 'granted') {
                    folderNameDisplay.textContent = syncHandle.name;
                    folderNameDisplay.title = syncHandle.name;
                } else {
                    folderNameDisplay.textContent = _('permissionDenied');
                }
            } else { folderNameDisplay.textContent = _('folderNotSelected'); }
        }
    } catch (err) {
        console.warn("Could not load local sync folder name:", err);
    }
}

// Извикваме веднага за първоначално инициализиране, ако базата ги има
updateSpecialFolderNames();

/**
 * Попълва падащото меню за избор на стартов борд в настройките.
 */
function populateStartBoardSelect() {
    const startBoardSelect = document.getElementById('start-board-select');
    let savedValue = localStorage.getItem('startBoard');
    // Ако няма запазена стойност и няма борд "Main", избираме първия наличен борд
    if (!savedValue) {
        const mainBoard = boardsData.find(b => b.title === 'Main');
        if (!mainBoard && boardsData.length > 0) {
            savedValue = boardsData[0].gdid;
        } else {
            savedValue = 'Main';
        }
    }
    // Изчистваме напълно списъка, преди да го попълним наново
    startBoardSelect.innerHTML = `
            <option value="all">${_('allBoards')}</option>
            <option value="reminder">${_('reminder')}</option>
            <option value="calendar_monthly">${_('calendar')}</option>
            <option value="calendar_weekly">${_('showWeeklyCalendar')}</option>
        `;
    boardsData.forEach(board => {
        const boardId = board.gdid || board.id;
        if (boardId && board.title) {
            startBoardSelect.add(new Option(board.title, boardId));
        }
    });
    startBoardSelect.value = savedValue; // Задаваме правилната стойност
}

function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function parseMarkdownTable(text) {
    if (!text || !text.includes('|')) return null;

    const codeTagRegex = /\{\{([\s\S]*?)\}\}|```([\s\S]*?)```/g;
    const maskedText = text.replace(codeTagRegex, (match) => ' '.repeat(match.length));

    const originalLines = maskedText.replace(/\r\n/g, '\n').split('\n');
    const tableLinesInfo = originalLines.map((line, index) => ({ line: line.trim(), index }))
        .filter(item => item.line.includes('|'));

    if (tableLinesInfo.length < 2) return null;

    const separatorIdxInFiltered = tableLinesInfo.findIndex(item => {
        const cells = item.line.split('|').map(cell => cell.trim()).filter(Boolean);
        return cells.length > 0 && cells.every(cell => /^:?-{1,}:?$/.test(cell));
    });
    if (separatorIdxInFiltered < 1) return null;

    if (tableLinesInfo[separatorIdxInFiltered - 1].index !== tableLinesInfo[separatorIdxInFiltered].index - 1) {
        return null;
    }

    const startIndex = tableLinesInfo[separatorIdxInFiltered - 1].index;
    let lastValidIdxInFiltered = separatorIdxInFiltered;
    for (let i = separatorIdxInFiltered + 1; i < tableLinesInfo.length; i++) {
        if (tableLinesInfo[i].index === tableLinesInfo[i - 1].index + 1) {
            lastValidIdxInFiltered = i;
        } else {
            break;
        }
    }
    const endIndex = tableLinesInfo[lastValidIdxInFiltered].index;

    const parseRow = (line) => {
        let normalized = line.trim();
        if (normalized.startsWith('|')) normalized = normalized.slice(1);
        if (normalized.endsWith('|')) normalized = normalized.slice(0, -1);
        return normalized.split('|').map(cell => cell.trim());
    };

    const headerRow = parseRow(tableLinesInfo[separatorIdxInFiltered - 1].line);
    const rows = [
        headerRow,
        ...tableLinesInfo.slice(separatorIdxInFiltered + 1, lastValidIdxInFiltered + 1).map(item => parseRow(item.line))
    ].filter(row => row.length > 0);
    if (rows.length < 2) return null;

    const columnCount = Math.max(...rows.map(row => row.length));
    const paddedRows = rows.map(row => {
        const padded = [...row];
        while (padded.length < columnCount) padded.push('');
        return padded;
    });

    const isBorderless = headerRow[0] === '%%' || (headerRow[0] === '' && headerRow.length > 1);
    return {
        borderless: isBorderless,
        rows: paddedRows,
        startIndex,
        endIndex
    };
}

function renderMarkdownTableAsPseudoGraphic(text) {
    const table = parseMarkdownTable(text);
    if (!table) return null;
    const renderCells = (row, tag) => row.map(cell => `<${tag}>${escapeHtml(String(cell || ''))}</${tag}>`).join('');

    let tableHtml = '';
    if (table.borderless) {
        const bodyRows = table.rows.slice(1);
        if (bodyRows.length) {
            const bodyHtml = bodyRows.map(row => `<tr>${renderCells(row, 'td')}</tr>`).join('');
            tableHtml = `<div class="md-table-wrapper"><table class="md-table-render md-table-borderless"><tbody>${bodyHtml}</tbody></table></div>`;
        }
    } else {
        const headerHtml = `<thead><tr>${renderCells(table.rows[0], 'th')}</tr></thead>`;
        const bodyRows = table.rows.slice(1);
        if (bodyRows.length) {
            const bodyHtml = bodyRows.map(row => `<tr>${renderCells(row, 'td')}</tr>`).join('');
            tableHtml = `<div class="md-table-wrapper"><table class="md-table-render">${headerHtml}<tbody>${bodyHtml}</tbody></table></div>`;
        }
    }
    if (!tableHtml) return null;

    const originalLines = text.replace(/\r\n/g, '\n').split('\n');
    const beforeTable = originalLines.slice(0, table.startIndex).join('\n');
    const afterTable = originalLines.slice(table.endIndex + 1).join('\n');

    let finalHtml = '';
    if (beforeTable.trim()) finalHtml += processNoteContent(beforeTable, true) + '<br>';
    finalHtml += tableHtml;
    if (afterTable.trim()) finalHtml += '<br>' + processNoteContent(afterTable, true);

    return finalHtml;
}

function getPreviewBodyAfterTitle(fullText, titleText) {
    if (!fullText || !titleText) return fullText || '';
    const normalizedText = String(fullText).replace(/\r\n/g, '\n');
    const lines = normalizedText.split('\n');
    const titleLineIndex = lines.findIndex(line => line.trim());
    if (titleLineIndex === -1) return normalizedText;
    const originalLine = lines[titleLineIndex];
    const leadingWhitespaceLength = originalLine.length - originalLine.trimStart().length;
    const trimmedLine = originalLine.trim();
    const usedLength = Math.min(String(titleText).trim().length, trimmedLine.length);
    if (usedLength <= 0) return normalizedText;
    let remainder = trimmedLine.slice(usedLength);
    if (remainder && /\S/.test(remainder)) {
        // Заглавието вече винаги се срязва на граница на дума, затова просто trimваме началните интервали
        lines[titleLineIndex] = ' '.repeat(leadingWhitespaceLength) + remainder.trimStart();
    } else {
        lines.splice(titleLineIndex, 1);
    }
    return lines.join('\n').replace(/^\s*\n/, '');
}

function getVisibleTitleTextForElement(titleEl, sourceText) {
    if (!titleEl || !sourceText) return sourceText || '';
    const fullText = String(sourceText);
    const availableWidth = titleEl.clientWidth || titleEl.getBoundingClientRect().width;
    if (!availableWidth) return fullText;
    const style = getComputedStyle(titleEl);
    const canvas = getVisibleTitleTextForElement._canvas || (getVisibleTitleTextForElement._canvas = document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    ctx.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    // Ако целият текст се побира, не съкращаваме
    if (ctx.measureText(fullText).width <= availableWidth) return fullText;
    // Вземаме до 30 символа от първия ред
    const S = fullText.slice(0, 30);
    const words = S.split(' ');
    const ellipsis = '...';
    let current = '';
    let lastFitting = '';
    for (const word of words) {
        if (!word) continue;
        const candidate = current ? current + ' ' + word : word;
        if (ctx.measureText(candidate + ellipsis).width <= availableWidth) {
            lastFitting = candidate;
            current = candidate;
        } else {
            // Тази дума вече не се събира → спираме
            break;
        }
    }
    return lastFitting;
}

/**
 * Коригира символните офсети в JSON форматиращия низ, когато съдържанието е съкратено
 * (напр. когато първият ред се показва като заглавие на борда).
 */
function adjustFormatStringOffset(formatString, offset) {
    if (!formatString || !offset || offset <= 0) return formatString;
    try {
        let isPipeSeparated = formatString.endsWith('|');
        let str = isPipeSeparated ? formatString.slice(0, -1) : formatString;
        const delimiter = isPipeSeparated ? '|' : '\n';
        const formats = str.split(/[|\n]/).map(f => {
            try { return JSON.parse(f); } catch (e) { return null; }
        }).filter(f => f !== null && f.start !== undefined && f.end !== undefined);
        if (formats.length === 0) return formatString;
        const adjusted = formats.map(f => {
            const newStart = Math.max(0, f.start - offset);
            const newEnd = Math.max(0, f.end - offset);
            return JSON.stringify({ ...f, start: newStart, end: newEnd });
        });
        return adjusted.join(delimiter) + (isPipeSeparated ? '|' : '');
    } catch (e) {
        return formatString;
    }
}

/**
 * Унифицирана функция за форматиране и рендиране на съдържанието на бележка.
 * Използва се напълно еднакво както в модала за преглед, така и на картичките в борда.
 */
function getFormattedNoteHtml(rawContent, formatString = null, titleFormatString = null, isForModal = false) {
    if (!rawContent) return '';

    const fullTableHtml = renderMarkdownTableAsPseudoGraphic(rawContent);
    if (fullTableHtml) return fullTableHtml;

    const pipeIndex = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(rawContent) : rawContent.indexOf('|');
    if (pipeIndex !== -1) {
        const titlePart = rawContent.substring(0, pipeIndex);
        const bodyPart = rawContent.substring(pipeIndex + 1);

        let formattedTitle = '';
        if (titleFormatString && titleFormatString.trim() !== '') {
            formattedTitle = formatText(titlePart, titleFormatString, isForModal);
        } else {
            formattedTitle = processNoteContent(titlePart, isForModal);
        }

        let formattedBody = '';
        const tableHtml = renderMarkdownTableAsPseudoGraphic(bodyPart);
        if (tableHtml) {
            formattedBody = tableHtml;
        } else if (formatString && formatString.trim() !== '') {
            formattedBody = formatText(bodyPart, formatString, isForModal);
        } else {
            formattedBody = processNoteContent(bodyPart, isForModal);
        }
        return formattedTitle + '<br>' + formattedBody;
    }

    if (formatString && formatString.trim() !== '') {
        return formatText(rawContent, formatString, isForModal);
    }
    return processNoteContent(rawContent, isForModal);
}

/**
 * Processes note content to handle links, code blocks, and newlines.
 * @param {string} text - The raw text content of the note.
 * @param {boolean} isForModal - Flag to indicate if the content is for the modal view.
 * @returns {string} The processed HTML content.
 */
function processNoteContent(text, isForModal = false) { // isForModal is now used to decide about links
    if (!text) return '';
    // 1. Handle code blocks first, just like in renderNoteContent
    const codeBlocks = [];
    const codeTagRegex = /\{\{([\s\S]*?)\}\}|```([\s\S]*?)```/g;
    const textWithoutCode = text.replace(codeTagRegex, (match, code1, code2) => {
        const code = code1 !== undefined ? code1 : code2;
        codeBlocks.push(escapeHtml(code)); // escapeHtml is crucial here
        return '%%CODE_BLOCK%%';
    });
    // 2. Escape the rest of the text to prevent HTML injection
    const escapedText = escapeHtml(textWithoutCode);
    // 3. Decide whether to create links based on the setting and context (modal/card)
    const oneTapLinksEnabled = localStorage.getItem('oneTapLink') === 'true'; // false by default
    let html;
    if (isForModal || oneTapLinksEnabled) {
        // В модала или ако е включено - показваме линковете като <a>
        const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%?=~_|])/ig;
        html = escapedText.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    } else {
        // За запазване на символното отместване (offsets), запазваме текста на линка без <a> таг
        const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%?=~_|])/ig;
        html = escapedText.replace(urlRegex, '$1');
    }
    // 4. Re-insert code blocks
    codeBlocks.forEach(block => {
        const copyBtn = `<button class="code-block-copy" onclick="event.stopPropagation();copyCode(this)" title="${_('copyCodeBtn')}">${copyIconSvg}</button>`;
        html = html.replace('%%CODE_BLOCK%%', '<div class="code-block"><code>' + block + '</code>' + copyBtn + '</div>');
    });
    // 5. Finally, replace newlines with <br>
    // This needs to be done on the final HTML string, not on the escaped text
    return html.replace(/\n/g, '<br>');
}

function renderNoteContent(text) {
    if (!text) return '';
    const codeBlocks = [];
    const codeTagRegex = /\{\{([\s\S]*?)\}\}|```([\s\S]*?)```/g;
    const textWithoutCode = text.replace(codeTagRegex, (match, code1, code2) => {
        const code = code1 !== undefined ? code1 : code2;
        codeBlocks.push(escapeHtml(code));
        return '%%CODE_BLOCK%%';
    });

    // First, escape the entire remaining text to neutralize any HTML
    const escapedText = escapeHtml(textWithoutCode);
    // Then, find URLs in the *escaped* text and wrap them in <a> tags.
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%?=~_|])/ig;
    let html = escapedText.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    codeBlocks.forEach(block => {
        const copyBtn = `<button class="code-block-copy" onclick="event.stopPropagation();copyCode(this)" title="${_('copyCodeBtn')}">${copyIconSvg}</button>`;
        html = html.replace('%%CODE_BLOCK%%', '<div class="code-block"><code>' + block + '</code>' + copyBtn + '</div>');
    });

    return html;
}

/**
 * Форматира текстов низ възоснова на JSON параметри.
 * @param {string} text - Текстовият низ за форматиране.
 * @param {string} formatString - Форматиращият низ, разделен с '\n'.
 * @param {boolean} isForModal - Дали е за модал (за линковете).
 * @returns {string} Форматираният HTML низ.
 */
function formatText(text, formatString, isForModal = false) {
    let localText = text;
    const mdClear = localStorage.getItem('mdClear') || '--';

    // --- mdClear Logic (Markers removal) ---
    // If no formatString, we still process the text to remove markers
    let formats = [];
    if (formatString) {
        if (formatString.endsWith('|')) formatString = formatString.slice(0, -1);
        formats = formatString.split(/[|\n]/).map(f => {
            try { return JSON.parse(f); } catch (e) { return null; }
        }).filter(f => f !== null && f.start !== undefined && f.end !== undefined);
    }

    if (localText.includes(mdClear)) {
        let searchIdx = 0;
        const shiftHelper = (pos, diff) => {
            const L = Math.abs(diff);
            formats.forEach(f => {
                if (f.start > pos + L) f.start -= L; else if (f.start > pos) f.start = pos;
                if (f.end > pos + L) f.end -= L; else if (f.end > pos) f.end = pos;
            });
        };

        while (true) {
            let start = localText.indexOf(mdClear, searchIdx);
            if (start === -1) break;
            let end = localText.indexOf(mdClear, start + mdClear.length);
            if (end === -1) break;

            const clearRangeStart = start;
            const clearRangeEnd = end + mdClear.length;

            // Remove formats that overlap with this range
            formats = formats.filter(f => !(f.start < clearRangeEnd && f.end > clearRangeStart));

            // Remove markers
            localText = localText.substring(0, end) + localText.substring(end + mdClear.length);
            shiftHelper(end, -mdClear.length);
            localText = localText.substring(0, start) + localText.substring(start + mdClear.length);
            shiftHelper(start, -mdClear.length);

            searchIdx = start + (end - start - mdClear.length);
        }
    }

    if (formats.length === 0) {
        return processNoteContent(localText, isForModal);
    }
    // Extract code blocks {{ }} BEFORE splitting into segments,
    // so they are not broken across segment boundaries
    const codeBlocks = [];
    const codeTagRegex = /\{\{([\s\S]*?)\}\}|```([\s\S]*?)```/g;
    const textForSegments = localText.replace(codeTagRegex, (match, code1, code2) => {
        const code = code1 !== undefined ? code1 : code2;
        codeBlocks.push(escapeHtml(code));
        return '%%CODE_BLOCK%%';
    });
    // Adjust format positions for removed {{ }} markers
    // (not needed — we adjust segment points below based on the modified text)
    // Re-calculate format positions relative to the modified text
    // Since code block extraction changes text length, we need to rebuild format points
    // from the original formats mapped to the new text.
    // Strategy: build a position map from original text to textForSegments
    const posMap = []; // posMap[origIdx] = newIdx
    let origIdx = 0, newIdx = 0;
    const origText = localText;
    codeTagRegex.lastIndex = 0;
    let codeMatch;
    const codeRanges = [];
    const codeTagRegex2 = /\{\{([\s\S]*?)\}\}|```([\s\S]*?)```/g;
    while ((codeMatch = codeTagRegex2.exec(localText)) !== null) {
        codeRanges.push({ start: codeMatch.index, end: codeMatch.index + codeMatch[0].length, replLen: '%%CODE_BLOCK%%'.length });
    }
    // Build position mapping
    const positionMap = new Array(localText.length + 1);
    let offset = 0;
    let crIdx = 0;
    for (let ci = 0; ci <= localText.length; ci++) {
        if (crIdx < codeRanges.length && ci === codeRanges[crIdx].start) {
            // Map positions inside the code range
            const cr = codeRanges[crIdx];
            const mappedStart = ci - offset;
            for (let j = cr.start; j <= cr.end && j <= localText.length; j++) {
                positionMap[j] = mappedStart;
            }
            // After the code range, the replacement is '%%CODE_BLOCK%%'
            offset += (cr.end - cr.start) - cr.replLen;
            ci = cr.end - 1; // loop will increment
            crIdx++;
        } else {
            positionMap[ci] = ci - offset;
        }
    }
    // Map format positions to new text positions
    const mappedFormats = formats.map(f => ({
        ...f,
        start: positionMap[f.start] !== undefined ? positionMap[f.start] : f.start,
        end: positionMap[f.end] !== undefined ? positionMap[f.end] : f.end
    }));
    // Continue with textForSegments instead of localText
    const points = new Set([0, textForSegments.length]);
    mappedFormats.forEach(f => {
        if (f.start >= 0 && f.start <= textForSegments.length) points.add(f.start);
        if (f.end >= 0 && f.end <= textForSegments.length) points.add(f.end);
    });
    const sortedPoints = Array.from(points).sort((a, b) => a - b);
    let html = '';
    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i + 1];
        const segmentText = textForSegments.substring(start, end);
        if (segmentText.length === 0) continue;
        const activeFormats = mappedFormats.filter(f => f.start <= start && f.end >= end);
        // Process segment (code blocks already extracted, processNoteContent won't find {{ }})
        let formattedSegment = processNoteContent(segmentText, isForModal);
        activeFormats.sort((a, b) => a.type - b.type); // Sort ascending to apply inline styles (bold/italic/etc) first
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
                    {
                        if (paramfloat && paramfloat > 0) {
                            const fontSizeInPercent = (paramfloat * 100).toFixed(1);
                            formattedSegment = `<span style="font-size: ${fontSizeInPercent}%; display: inline; line-height: normal;">${formattedSegment}</span>`;
                        }
                        break;
                    }
                case 7: // strike-through
                    formattedSegment = `<s>${formattedSegment}</s>`;
                    break;
                default:
                    break;
            }
        });
        html += formattedSegment;
    }
    // Re-insert code blocks that were extracted before segmentation
    codeBlocks.forEach(block => {
        const copyBtn = `<button class="code-block-copy" onclick="event.stopPropagation();copyCode(this)" title="${_('copyCodeBtn')}">${copyIconSvg}</button>`;
        html = html.replace('%%CODE_BLOCK%%', '<div class="code-block"><code>' + block + '</code>' + copyBtn + '</div>');
    });
    return html;
}

window.copyCode = function (btn) {
    const codeElem = btn.parentElement.querySelector('code');
    if (!codeElem) return;
    const text = codeElem.innerText;
    navigator.clipboard.writeText(text).then(() => {
        const originalSvg = btn.innerHTML;
        // Смяна с икона "отметка" за обратна връзка
        btn.innerHTML = '&#10003;';
        setTimeout(() => { btn.innerHTML = originalSvg; }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
};

/**
 * Обработва и създава UI за прикачен файл от локална папка.
 * @param {object} attachment - Обектът на прикачения файл.
 * @param {HTMLElement} attachmentWrapper - Елементът, в който да се добави UI.
 * @param {object} iconData - SVG иконата за типа на файла.
 */
async function handleAttachment(attachment, attachmentWrapper, iconData, mode = 'local', isForModal = false) {
    const iconDiv = document.createElement('div');
    iconDiv.innerHTML = iconData.svg;
    const path = attachment.path || '';
    const nameOnly = path.split('/').pop();
    const isSharedResource = nameOnly.startsWith('shared_');
    const displayLinkText = (isSharedResource || !nameOnly) ? (_('openLink') || 'Open') : nameOnly;
    const archiveFolderName = dirHandle ? dirHandle.name : '';
    const createLink = async (folderName, textPrefix) => {
        const oneTapLinksEnabled = localStorage.getItem('oneTapLink') !== 'false';
        if (!isForModal && !oneTapLinksEnabled) { // Създаваме неактивен span, САМО ако не сме в модал И опцията е изключена
            const span = document.createElement('span');
            span.textContent = textPrefix + displayLinkText;
            return span;
        }
        const link = document.createElement('a');
        link.href = '#';
        link.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            // --- КОРЕКЦИЯ: Зареждаме dirHandle при нужда в режим "Само база данни" ---
            const isDbOnlyMode = useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb;
            if (isDbOnlyMode && !dirHandle) {
                const dbSource = await getConfig('dbSource');
                let handleKey = null;
                if (dbSource === 2) handleKey = 'directoryHandle';
                else if (dbSource === 3) handleKey = 'arhHandle';
                if (handleKey) {
                    const handle = await getConfig(handleKey);
                    if (handle) {
                        const verifiedHandle = await verifyPermission(handle);
                        if (verifiedHandle) dirHandle = verifiedHandle;
                    }
                }
                // Ако и след този опит нямаме handle, показваме съобщение и прекратяваме.
                if (!dirHandle) {
                    showToast(_('noUpdateMode'), 5000);
                    return;
                }
            }
            if (!filename) return;
            console.log(`Opening file: ${folderName}/${filename}   DirHandle:`, dirHandle);
            try {
                const fileHandle = mode === 'local'
                    ? await (await dirHandle.getDirectoryHandle(folderName)).getFileHandle(filename)
                    : await dirHandle.getFileHandle(filename); // Винаги използваме filename
                const file = await fileHandle.getFile();
                window.open(URL.createObjectURL(file), '_blank');
            } catch (err) {
                console.log(`Could not open local file ${folderName}/${filename}`, err);
                showToast(_('errorOpenFile').replace('{filename}', filename));
            }
        };
        link.textContent = textPrefix + displayLinkText;
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
            const imgLink = await createLink(mode === 'local' ? 'Images' : '', mode === 'local' ? '' : '');
            attachmentWrapper.appendChild(imgLink);
            // Добавяме липсващата логика за преглед при клик на иконата
            addInNotePreviewListener(iconDiv, attachment.path, mode, false);
            break;
        case 2: // Sound
            await appendWithDescription(
                mode === 'local' ? 'Sound' : '',
                mode === 'local' ? '' : '', // `${archiveFolderName}/`
                attachment.description
            );
            break;
        case 3: // Other
            attachmentWrapper.appendChild(await createLink(
                mode === 'local' ? 'Other' : '',
                mode === 'local' ? '' : '' // `${archiveFolderName}/`
            ));
            break;
        case 4: // Video
            const videoContainer = document.createElement('div');
            videoContainer.appendChild(await createLink(mode === 'local' ? 'Video' : '', mode === 'local' ? '' : ''));
            videoContainer.appendChild(document.createTextNode(attachment.description || ''));
            attachmentWrapper.appendChild(videoContainer);
            addInNotePreviewListener(iconDiv, attachment.path, mode, true);
            break;
        case 5: // Location
            const parts = attachment.path.split('|');
            if (parts.length < 3) break;
            const [lat, lng, label] = parts;
            const textContainer = document.createElement('div');
            const oneTapLinksEnabled = localStorage.getItem('oneTapLink') !== 'false';
            const isForModal = !!attachmentWrapper.closest('#modal-body');
            let linkElement;
            if (!isForModal && !oneTapLinksEnabled) {
                linkElement = document.createElement('span');
                linkElement.textContent = `${lat}, ${lng}`;
            } else {
                linkElement = document.createElement('a');
                linkElement.textContent = `${lat}, ${lng}`;
                linkElement.href = `https://www.google.com/maps?q=${lat},${lng}(${encodeURIComponent(label)})`;
                linkElement.target = '_blank';
                linkElement.rel = 'noopener noreferrer';
                linkElement.onclick = (e) => e.stopPropagation();
            }
            textContainer.appendChild(linkElement);
            const line2 = document.createElement('div');
            line2.textContent = label;
            textContainer.appendChild(line2);
            attachmentWrapper.appendChild(textContainer);
            break;
    }
    // Добавяме стандартния listener за показване на JSON данни само в дебъг режим
    if (debug) {
        iconDiv.style.cursor = 'pointer';
        iconDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            let debugText = JSON.stringify(attachment, null, 2);
            if (attachment.gdid && localFileMap.has(attachment.gdid)) {
                debugText = `File: ${localFileMap.get(attachment.gdid)}\n\n` + debugText;
            }
            showModal(debugText);
        });
    }
    attachmentWrapper.prepend(iconDiv);
}

/**
 * Обработва и създава UI за прикачен файл от Google Drive.
 * @param {object} attachment - Обектът на прикачения файл.
 * @param {HTMLElement} attachmentWrapper - Елементът, в който да се добави UI.
 * @param {object} iconData - SVG иконата за типа на файла.
 */
async function handleGoogleDriveAttachment(attachment, attachmentWrapper, iconData, isForModal = false) {
    const iconDiv = document.createElement('div');
    iconDiv.innerHTML = iconData.svg;
    if (!attachment.path) {
        iconDiv.style.cursor = 'pointer';
        iconDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            let debugText = JSON.stringify(attachment, null, 2);
            if (attachment.gdid && localFileMap.has(attachment.gdid)) {
                debugText = `File: ${localFileMap.get(attachment.gdid)}\n\n` + debugText;
            }
            showModal(debugText);
        });
        attachmentWrapper.prepend(iconDiv);
        return;
    }
    const path = attachment.path || '';
    const filename = path.split('/').pop();
    const isSharedResource = filename.startsWith('shared_');
    const displayLinkText = (isSharedResource || !filename) ? (_('openLink') || 'Open') : filename;
    const fileId = attachment.pathGD; // Вече имаме fileId директно в attachment обекта.
    // Оптимизация: Премахваме API заявката оттук и я местим в onclick събитието.
    const setupLink = (folderName, textPrefix) => {
        const oneTapLinksEnabled = localStorage.getItem('oneTapLink') !== 'false';
        let linkElement;
        if (!isForModal && !oneTapLinksEnabled) { // Създаваме неактивен span, САМО ако не сме в модал И опцията е изключена
            linkElement = document.createElement('span');
            linkElement.textContent = textPrefix + displayLinkText;
            return linkElement; // Връщаме span елемента
        }
        linkElement = document.createElement('a');
        linkElement.href = '#'; // href вече не сочи директно към файла.
        linkElement.textContent = textPrefix + displayLinkText;
        linkElement.dataset.folderName = folderName; // Запазваме името на папката в data атрибут.
        linkElement.dataset.fileName = filename;     // Запазваме името на файла в data атрибут.
        linkElement.title = `Click to open ${filename} from Google Drive`;
        linkElement.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Authentication is handled inside showInNotePreview -> loadMedia, or locally for other files
            // --- IMPROVED ATTACHMENT OPENING (Avoid Account Prompt) ---
            if (fileId) {
                // For media (Images, Sound, Video), use internal authenticated viewer
                if (attachment.type === 1 || attachment.type === 2 || attachment.type === 4) {
                    const modalContentBox = linkElement.closest('#content-modal')?.querySelector('.modal-content-box');
                    let targetEl = linkElement.closest('.note') || modalContentBox || document.getElementById('modal-body') || document.body;
                    const noteGdid = attachment.noteid || (isForModal && typeof isForModal === 'object' ? isForModal.gdid : null);
                    if (!noteGdid) {
                        // Fallback: just preview this single one if we can't find others
                        showInNotePreview(targetEl, [{ pathGD: fileId, type: attachment.type }], 0, 'gdrive', attachment.type === 4);
                        return;
                    }
                    const attachmentsOfType = mediaData.filter(m => m.noteid === noteGdid && m.type === attachment.type);
                    const currentIndex = attachmentsOfType.findIndex(m => (m.pathGD || m.path) === fileId);
                    showInNotePreview(targetEl, attachmentsOfType, currentIndex !== -1 ? currentIndex : 0, 'gdrive', attachment.type === 4);
                    return;
                }
                // For other files, try fetching with token and opening the blob to skip Google Auth prompt
                showToast(`${_('loadingFile')} ${linkElement.dataset.fileName}...`, 2000);
                try {
                    const tokenObj = (typeof authToken !== 'undefined' && authToken) ? authToken : (gapi.client.getToken() || gapi.auth.getToken());
                    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                        headers: { 'Authorization': `Bearer ${tokenObj ? tokenObj.access_token : ''}` }
                    });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const blob = await response.blob();
                    const blobUrl = URL.createObjectURL(blob);
                    window.open(blobUrl, '_blank');
                } catch (error) {
                    console.warn("Auth-based fetch failed, falling back to direct link:", error);
                    window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank', 'noopener,noreferrer');
                }
            } else {
                showToast(_('errorFetchFileId').replace('{fileName}', linkElement.dataset.fileName));
            }
        };
        return linkElement; // Връщаме конфигурирания 'a' елемент
    };
    switch (attachment.type) {
        case 1: // Image
            const imgLink = setupLink('Images', '');
            addInNotePreviewListener(iconDiv, fileId, 'gdrive', false);
            attachmentWrapper.appendChild(imgLink);
            break;
        case 2: // Sound
            const soundLink = setupLink('Sound', '');
            const soundTextContainer = document.createElement('div');
            soundTextContainer.style.flexGrow = '1';
            soundTextContainer.style.flexShrink = '1';
            soundTextContainer.style.minWidth = '0';
            soundTextContainer.appendChild(soundLink);
            const soundLine2 = document.createElement('div');
            soundLine2.textContent = attachment.description || '';
            soundTextContainer.appendChild(soundLine2);
            attachmentWrapper.appendChild(soundTextContainer);
            break;
        case 3: // Other
            const otherLink = setupLink('Other', '');
            attachmentWrapper.appendChild(otherLink);
            break;
        case 4: // Video
            const videoLink = setupLink('Video', '');
            const videoTextContainer = document.createElement('div');
            videoTextContainer.style.flexGrow = '1';
            videoTextContainer.style.flexShrink = '1';
            videoTextContainer.style.minWidth = '0';
            videoTextContainer.appendChild(videoLink);
            const videoLine2 = document.createElement('div');
            videoLine2.textContent = attachment.description || '';
            videoTextContainer.appendChild(videoLine2);
            addInNotePreviewListener(iconDiv, fileId, 'gdrive', true);
            attachmentWrapper.appendChild(videoTextContainer);
            break;
        case 5: // Location
            const parts = attachment.path.split('|');
            if (parts.length < 3) break;
            const [lat, lng, label] = parts;
            const textContainer = document.createElement('div');
            const oneTapLinksEnabled = localStorage.getItem('oneTapLink') !== 'false';
            const isForModal = !!attachmentWrapper.closest('#modal-body');
            let linkElement;
            if (!isForModal && !oneTapLinksEnabled) {
                linkElement = document.createElement('span');
                linkElement.textContent = `${lat}, ${lng}`;
            } else {
                linkElement = document.createElement('a');
                linkElement.textContent = `${lat}, ${lng}`;
                linkElement.href = `https://www.google.com/maps?q=${lat},${lng}(${encodeURIComponent(label)})`;
                linkElement.target = '_blank';
                linkElement.rel = 'noopener noreferrer';
                linkElement.onclick = (e) => e.stopPropagation();
            }
            textContainer.appendChild(linkElement);
            const line2 = document.createElement('div');
            line2.textContent = label;
            textContainer.appendChild(line2);
            attachmentWrapper.appendChild(textContainer);
            break;
    }
    if (attachment.type !== 1 && attachment.type !== 4) { // Add generic info click for non-preview types
        iconDiv.style.cursor = 'pointer';
    }
    // Винаги добавяме listener за показване на JSON в дебъг режим
    if (debug) {
        iconDiv.style.cursor = 'pointer';
        iconDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            showModal(JSON.stringify(attachment, null, 2));
        });
    }
    attachmentWrapper.prepend(iconDiv);
}

async function createNoteElement(noteContent) {
    const note = document.createElement('div');
    const notesBgrdEnabled = localStorage.getItem('notesBgrd') !== 'false';
    note.className = 'note';
    note.style.display = 'none'; // Keep hidden until applyFilters runs to prevent flashing
    if (notesBgrdEnabled) {
        note.classList.add('note-item');
    }
    let fileContent = '';
    let noteGdid = null;
    let noteID = null;
    let noteColor = null;
    let textSpan = null;
    let titleSpan = null;
    let extraData = {};
    const fullNoteContent = noteContent; // Вече имаме целия обект
    try {
        if (noteContent && (noteContent.notetxt !== undefined || noteContent.text !== undefined)) {
            fileContent = noteContent.notetxt !== undefined ? noteContent.notetxt : noteContent.text;
            noteGdid = noteContent.gdid;
            noteID = noteContent.id;
            // --- Mark as update if in updated list ---
            if (updatedNoteGdims.includes(noteGdid)) {
                note.classList.add('new-update');
            }
            noteColor = noteContent.color;
            if (noteContent.text_span) {
                textSpan = noteContent.text_span;
            }
            if (noteContent.title_span || noteContent.title_text_span) {
                titleSpan = noteContent.title_span || noteContent.title_text_span;
            }
            extraData = { ...noteContent };
            delete extraData.notetxt;
            // --- OPTIMIZATION: Use individual SHORT dataset attributes ---
            // data-g -> gdid, data-i -> id
            if (noteGdid) note.dataset.g = noteGdid;
            if (noteID) note.dataset.i = noteID;
            // data-b -> boardid
            if (extraData.boardid !== undefined) note.dataset.b = extraData.boardid;
            // data-dm -> datemod
            if (extraData.datemod) note.dataset.dm = extraData.datemod;
            // data-no -> numord
            if (extraData.numord !== undefined) note.dataset.no = extraData.numord;
            if (extraData.pinnedAt) {
                note.dataset.pin = extraData.pinnedAt;
                note.classList.add('note-pinned');
            } else {
                note.dataset.pin = '0';
            }
            // data-s -> status
            if (extraData.status !== undefined) {
                note.dataset.s = extraData.status;
                if (parseInt(extraData.status, 10) === -1) {
                    note.classList.add('dirty');
                }
            }
            // data-cd -> date (creation date)
            if (extraData.date) note.dataset.cd = extraData.date;
            // data-cda -> calendarDate
            if (extraData.calendarDate) note.dataset.cda = extraData.calendarDate;
            // data-c -> color
            if (noteColor !== null && noteColor !== undefined) note.dataset.c = noteColor;
            // --- Set attributes for special filters (SHORT CODES, "1" for true) ---
            if (extraData.timer && extraData.timer !== 0) {
                note.dataset.tm = '1'; // data-tm
                note.dataset.tv = extraData.timer; // data-tv = timer value
            }
            // if (Object.keys(extraData).length > 0) note.dataset.extraInfo = JSON.stringify(extraData);
            if (noteColor && !isNaN(noteColor) && noteColor >= 0 && noteColor <= 9) {
                // Color will be handled by canvas background
            }
            if (extraData.status === 1) {
                // Do not skip deleted notes in the UI entirely, so Trash board can load them.
                // ApplyFilters will take care of hiding them from everywhere else.
                // return null; 
            }
        } else { throw new Error(_('errorNoteFieldMissing')); }
    } catch (e) { fileContent = _('errorNoteParse'); }
    const isHiddenNote = extraData.pass === true;
    const isType1Note = extraData.type === 1;
    // let attachments = [];
    let noteTitle = '';
    let displayContent = fileContent;
    let previewTitleSourceText = '';
    let adjustPreviewBodyToRenderedTitle = false;
    let isBorderlessTableNote = false;
    const showFullFirstLinePreview = localStorage.getItem('showFirstLine') === 'true';
    if (isHiddenNote) {
        const pipeIndex = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(fileContent) : fileContent.indexOf('|');
        const previewContent = pipeIndex !== -1 ? fileContent.substring(0, pipeIndex) : '';
        noteTitle = previewContent.split('\n')[0].trim();
    } else {
        const markdownTable = parseMarkdownTable(fileContent);
        const pipeIndex = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(fileContent) : fileContent.indexOf('|');
        const textBeforeTable = markdownTable ? fileContent.replace(/\r\n/g, '\n').split('\n').slice(0, markdownTable.startIndex).join('\n').trim() : '';
        if (markdownTable && !textBeforeTable) {
            const headerCells = markdownTable.rows[0] || [];
            isBorderlessTableNote = markdownTable.borderless;
            noteTitle = markdownTable.borderless ? '' : headerCells.filter(Boolean).join(' ').trim();
            displayContent = fileContent;
        } else if (pipeIndex !== -1) {
            noteTitle = fileContent.substring(0, pipeIndex).trim();
            displayContent = fileContent.substring(pipeIndex + 1).trim();
        } else if (isType1Note) {
            previewTitleSourceText = (fileContent.split('\n').find(line => line.trim()) || '').trim();
            noteTitle = previewTitleSourceText;
            displayContent = showFullFirstLinePreview ? fileContent : getPreviewBodyAfterTitle(fileContent, previewTitleSourceText);
            adjustPreviewBodyToRenderedTitle = !showFullFirstLinePreview;
        } else {
            const lines = fileContent.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    previewTitleSourceText = trimmedLine;
                    noteTitle = trimmedLine;
                    break;
                }
            }
            displayContent = showFullFirstLinePreview ? fileContent : getPreviewBodyAfterTitle(fileContent, previewTitleSourceText);
            adjustPreviewBodyToRenderedTitle = !showFullFirstLinePreview;
        }
    }
    if (!noteTitle && !isHiddenNote && !isBorderlessTableNote) { noteTitle = '...'; }
    if (isBorderlessTableNote) {
        note.classList.add('note-borderless-table');
    }
    const titleWrapper = document.createElement('div');
    titleWrapper.className = 'note-title-wrapper';
    const titleEl = document.createElement('h3');
    // For hidden notes with title_span, apply formatting to the title
    if (isHiddenNote && titleSpan && titleSpan.trim() !== '') {
        titleEl.innerHTML = formatText(noteTitle, titleSpan, false);
    } else {
        titleEl.textContent = noteTitle;
    }
    titleEl.className = 'note-title-truncated';
    if (isBorderlessTableNote) {
        titleEl.style.display = 'none';
    }
    // Create header info container for date and time
    const headerInfoContainer = document.createElement('div');
    headerInfoContainer.className = 'note-header-info';
    const headerDate = document.createElement('span');
    headerDate.className = 'note-header-date';
    const headerTime = document.createElement('span');
    headerTime.className = 'note-header-time';
    // Add click listener to the date to show full note data
    headerDate.addEventListener('click', (e) => {
        if (debug) {
            e.stopPropagation();
            let debugText = JSON.stringify(fullNoteContent, null, 2);
            if (fullNoteContent.gdid && localFileMap.has(fullNoteContent.gdid)) {
                debugText = `File: ${localFileMap.get(fullNoteContent.gdid)}\n\n` + debugText;
            }
            showModal({ raw: debugText, color: 'white' });
        }
    });
    let isAutoTimer = false;
    if (extraData.timer) {
        const d = new Date(extraData.timer);
        if (d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 33) isAutoTimer = true;
    }
    if (extraData.timer && !isAutoTimer) {
        const dateText = formatDate(extraData.timer);
        const showCalIcon = extraData.calendarDate && parseInt(extraData.calendarDate, 10) > 0;
        if (dateText) {
            if (showCalIcon) headerDate.innerHTML = `<span class="header-icon">${calendarIconSvg}</span> ${dateText}`;
            else headerDate.textContent = dateText;
        }
        const timeText = formatTime(extraData.timer);
        if (timeText) headerTime.innerHTML = `<span class="header-icon">${clockIconSvg}</span> ${timeText}`;
    } else if (extraData.calendarDate && extraData.calendarDate > 0) {
        const dateText = formatDate(extraData.calendarDate);
        if (dateText) {
            headerDate.innerHTML = `<span class="header-icon">${calendarIconSvg}</span> ${dateText}`;
        }
    } else if (extraData.datemod) { // Always create the element
        const dateText = formatDate(extraData.datemod);
        if (dateText) {
            headerDate.textContent = dateText; // No icon for datemod
            headerDate.classList.add('datemod-header-date');
            const timeText = formatTime(extraData.datemod);
            if (timeText) headerTime.textContent = timeText;
        }
    } else if (extraData.date) { // Fallback to creation date
        const dateText = formatDate(extraData.date);
        if (dateText) {
            headerDate.textContent = dateText; // No icon for datemod
            headerDate.classList.add('creation-header-date');
            const timeText = formatTime(extraData.date);
            if (timeText) headerTime.textContent = timeText;
        }
    }
    headerInfoContainer.appendChild(headerDate);
    // Add click listener to the time to show clock inside the note if it's empty @@
    headerTime.style.cursor = 'pointer'; // Make it clear it's clickable
    headerTime.addEventListener('click', (e) => {
        e.stopPropagation();
        const currentNoteContent = fullNoteContent.notetxt || fullNoteContent.text || '';
        if (true) {
            const noteElement = e.target.closest('.note');
            const titleWrapper = noteElement.querySelector('.note-content-wrapper > div');
            const contentElement = noteElement.querySelector('.note-content');
            const originalContent = contentElement.innerHTML;
            if (contentElement) {
                // Clear existing content and add clock
                // Скриваме заглавния ред, за да има повече място
                if (titleWrapper) {
                    titleWrapper.style.display = 'none';
                }

                // Add flex styles to center the clock
                contentElement.style.display = 'flex';
                contentElement.style.justifyContent = 'center';
                contentElement.style.alignItems = 'center';
                contentElement.style.paddingTop = '35px';
                contentElement.style.height = '80%'; // Ensure it takes full height

                contentElement.innerHTML = ''; // Clear text
                const clockId = `clock-${fullNoteContent.id}`;
                const clockHtml = `
                    <div class="clock" id="${clockId}" style="margin: auto; transform: scale(0.85); cursor: pointer;" 
                        title="Click to close clock">
                        <div class="center"></div>
                        <div class="number n12">12</div>
                        <div class="number n3">3</div>
                        <div class="number n6">6</div>
                        <div class="number n9">9</div>
                        <div class="hand hour"></div>
                        <div class="hand minute"></div>
                        <div class="hand second"></div>
                    </div>`;
                contentElement.innerHTML = clockHtml;

                const clockElement = contentElement.querySelector(`#${clockId}`);

                // Restore original empty view on clock click
                clockElement.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    // Remove centering styles
                    // Показваме отново заглавния ред
                    if (titleWrapper) {
                        titleWrapper.style.display = '';
                    }

                    contentElement.style.display = '';
                    contentElement.style.justifyContent = '';
                    contentElement.style.alignItems = '';
                    contentElement.style.paddingTop = '';
                    contentElement.style.height = '';
                    contentElement.innerHTML = originalContent;
                });

                // Activate the clock hands
                const script = document.createElement('script');
                script.textContent = `(function() {
                    const clock = document.getElementById('${clockId}');
                    if (!clock) return;
                    const hourHand = clock.querySelector('.hour');
                    const minuteHand = clock.querySelector('.minute');
                    const secondHand = clock.querySelector('.second');

                    for (let i = 0; i < 12; i++) {
                        if (i % 3 === 0) continue;
                        const m = document.createElement('div');
                        m.className = 'mark';
                        m.style.transform = 'translateX(-50%) rotate(' + (i * 30) + 'deg)';
                        clock.appendChild(m);
                    }

                    function updateClock() {
                        const now = new Date();
                        const s = now.getSeconds();
                        const m = now.getMinutes();
                        const h = now.getHours();
                        const sDeg = s * 6;
                        const mDeg = m * 6 + s * 0.1;
                        const hDeg = (h % 12) * 30 + m * 0.5;
                        if(hourHand) hourHand.style.transform = 'translate(-50%, -100%) rotate(' + hDeg + 'deg)';
                        if(minuteHand) minuteHand.style.transform = 'translate(-50%, -100%) rotate(' + mDeg + 'deg)';
                        if(secondHand) secondHand.style.transform = 'translate(-50%, -100%) rotate(' + sDeg + 'deg)';
                    }
                    updateClock();
                    setInterval(updateClock, 1000);
                })();`;
                clockElement.appendChild(script);
            }
        }
    });
    headerInfoContainer.appendChild(headerTime);
    const pinBtn = document.createElement('button');
    const isPinned = Number(extraData.pinnedAt || 0) > 0;
    pinBtn.type = 'button';
    pinBtn.className = `note-pin-btn${isPinned ? ' pinned' : ''}`;
    pinBtn.innerHTML = pinIconSvg;
    pinBtn.title = isPinned ? (_('unpinNoteTooltip') || 'Unpin note') : (_('pinNoteTooltip') || 'Pin note');
    pinBtn.setAttribute('aria-label', pinBtn.title);
    pinBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        await toggleNotePinned(noteGdid, noteID);
    });
    headerInfoContainer.appendChild(pinBtn);
    // Add the new container before the title
    titleWrapper.appendChild(headerInfoContainer);
    titleWrapper.appendChild(titleEl);
    // Use the color map for reliability and define a clear fallback color
    const noteBgColor = (typeof noteColor === 'number')
        ? (noteColor >= 0 && noteColor < noteColorMap.length ? noteColorMap[noteColor] : (noteColor < 0 ? colorIntToHex(noteColor) : '#FBFF86'))
        : (typeof noteColor === 'string' ? noteColor : '#FBFF86');
    note.style.margin = '5px';
    if (notesBgrdEnabled) {
        const imageName = (extraData.sellist && extraData.sellist > 0) ? `${extraData.sellist}` : 0;
        const cacheKey = `${noteBgColor}_${imageName}`;
        if (noteBgCache.has(cacheKey)) {
            // Apply preloaded background instantly
            note.style.backgroundImage = noteBgCache.get(cacheKey);
            note.style.backgroundSize = '100% 100%';
            note.style.backgroundRepeat = 'no-repeat';
        } else {
            // Fallback for cases where it wasn't preloaded (e.g. newly created note)
            // We await it to ensure no "text then background" flicker occurs
            await new Promise(resolve => {
                createColoredNoteBackground(noteBgColor, imageName, 250, 250).then(canvas => {
                    canvas.toBlob(blob => {
                        const url = URL.createObjectURL(blob);
                        const bgUrl = `url("${url}")`;
                        noteBgCache.set(cacheKey, bgUrl);
                        note.style.backgroundImage = bgUrl;
                        note.style.backgroundSize = '100% 100%';
                        note.style.backgroundRepeat = 'no-repeat';
                        resolve();
                    }, 'image/png');
                }).catch(() => {
                    note.style.backgroundColor = noteBgColor; // Only if image fails
                    resolve();
                });
            });
        }
    } else {
        note.style.backgroundColor = noteBgColor;
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
    const isForModal = (note.closest('#modal-body') !== null);
    const renderPreviewContent = (contentForPreview) => {
        let formatSource = (textSpan && textSpan.trim() !== '') ? textSpan : null;
        const titleFormatSource = (titleSpan && titleSpan.trim() !== '') ? titleSpan : null;
        // Намираме точния символен офсет, ако първият ред (заглавието) е отделен
        const rawOffset = fileContent.indexOf(contentForPreview);
        const offset = rawOffset !== -1 ? rawOffset : Math.max(0, fileContent.length - contentForPreview.length);
        if (offset > 0 && formatSource) {
            formatSource = adjustFormatStringOffset(formatSource, offset);
        }
        contentEl.innerHTML = getFormattedNoteHtml(contentForPreview, formatSource, titleFormatSource, isForModal);
    };
    if (isHiddenNote) {
        const pipeIndex = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(fileContent) : fileContent.indexOf('|');
        const previewContent = pipeIndex !== -1 ? fileContent.substring(0, pipeIndex) : '';
        const titleFormatSource = (titleSpan && titleSpan.trim() !== '') ? titleSpan : null;
        contentEl.innerHTML = getFormattedNoteHtml(previewContent, null, titleFormatSource, isForModal);
    } else {
        renderPreviewContent(displayContent);
    }
    let attachments = [];
    if (useIndexedDb) {
        // Когато използваме база данни, трябва да знаем как е създадена.
        // Използваме глобалната променлива, която е заредена в mainLogic
        const dbNoteIdType = dbNoteIdTypeGlobal || 'gdid'; // 'gdid' е fallback за стари бази
        if (dbNoteIdType === 'id') {
            attachments = mediaData.filter(media => +media.noteid === +noteID);
        } else { // 'gdid'
            attachments = mediaData.filter(media => media.noteid === noteGdid);
        }
    } else {
        // Когато четем директно, логиката зависи от текущия режим.
        if (useArhDb) attachments = mediaData.filter(media => +media.noteid === +noteID);
        else if (useLocalFolder || useGoogleDb) attachments = mediaData.filter(media => media.noteid === noteGdid);
    }
    if (attachments.length > 0) {
        note.dataset.hasAttachments = 'true';
        // --- КОРЕКЦИЯ: Добавяме специфична проверка за снимки (тип 1) ---
        if (attachments.some(att => att.type === 1)) {
            note.dataset.hp = '1';
            // --- Store preview data for programmatic access (e.g. Board Previews) ---
            const firstPhoto = attachments.find(att => att.type === 1);
            let mode = 'gdrive';
            // Determine mode based on global state, mirroring the attachment rendering logic
            // Note: DB logic relies on globals set in mainLogic
            if (useIndexedDb) {
                if (typeof dbNoteIdTypeGlobal !== 'undefined' && dbNoteIdTypeGlobal === 'id' && typeof dbSourceGlobal !== 'undefined' && dbSourceGlobal === 3) mode = 'archive';
                else if (typeof dbNoteIdTypeGlobal !== 'undefined' && dbNoteIdTypeGlobal === 'gdid' && typeof dbSourceGlobal !== 'undefined' && dbSourceGlobal === 2) mode = 'local';
            } else if (useArhDb) {
                mode = 'archive';
            } else if (useLocalFolder) {
                mode = 'local';
            }
            const fileId = (mode === 'gdrive') ? (firstPhoto.pathGD || firstPhoto.path) : firstPhoto.path;
            const previewData = {
                fileId: fileId,
                mode: mode,
                isVideo: false
            };
            note.dataset.previewAttachment = JSON.stringify(previewData);
        }
        // --- Край на корекцията ---
        // Check for video attachments (type 4)
        if (attachments.some(att => att.type === 4)) {
            note.dataset.hv = '1';
        }
        // Check for sound attachments (type 2)
        if (attachments.some(att => att.type === 2)) {
            note.dataset.hs = '1';
        }
        // Check for other attachments (not type 1 or 4)
        if (attachments.some(att => att.type !== 1 && att.type !== 4 && att.type !== 2)) {
            note.dataset.ho = '1';
        }
        // Проверка дали да показваме иконите за прикачени файлове в затворената бележка
        const oneTapLinksEnabled = localStorage.getItem('oneTapLink') === 'true';
        const shouldShowAttachments = isForModal || oneTapLinksEnabled;
        if (shouldShowAttachments) {
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
                attachmentWrapper.dataset.type = attachment.type; // Add type for easy selection
                const isDbOnlyMode = useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb;
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
    }
    // --- Логика за клик, Ctrl+клик и продължително натискане (long press) ---
    let longPressTimer;
    let isLongPress = false;

    // Обработва клик върху цялата бележка (с изключение на хедъра)
    const handleNoteClick = async (e) => {
        // Check if text is selected. If so, prevent opening the modal.
        const selection = window.getSelection();
        if (selection.toString().length > 0) {
            return;
        }
        // Отваряме модала, само ако не е long press и кликът не е върху футъра
        if (!isLongPress && !e.target.closest('.note-footer')) {
            const currentGdid = noteContent.gdid || note.dataset.g;

            // --- FORCE GDRIVE READ LOGIC ---
            const forceGDriveRead = localStorage.getItem('forceGDriveRead') === 'true';
            if (forceGDriveRead && currentGdid) {
                showToast(_('loadingFromDrive'), 2000);
                const txt = await fetchGDriveFileContent(currentGdid);
                if (txt) {
                    try {
                        const newItem = JSON.parse(txt);
                        // Update memory
                        Object.assign(noteContent, newItem);
                        // Update critical fields for modal
                        if (newItem.notetxt !== undefined) fileContent = newItem.notetxt;
                        else if (newItem.text !== undefined) fileContent = newItem.text;

                        if (newItem.title_span !== undefined) titleSpan = newItem.title_span;
                        if (newItem.text_span !== undefined) textSpan = newItem.text_span;

                        extraData = { ...noteContent };
                        delete extraData.notetxt;

                        // Update global data array reference too (find and update)
                        if (typeof allNotesData !== 'undefined') {
                            const noteInHeader = allNotesData.find(n => n.gdid === currentGdid);
                            if (noteInHeader) {
                                Object.assign(noteInHeader, newItem);
                            }
                        }

                    } catch (err) {
                        console.error("Error parsing GDrive content", err);
                        showToast(_('errorParsingNote'), 3000);
                    }
                }
            }
            // --- END FORCE GDRIVE READ LOGIC ---

            const noteBgColor = (typeof noteColor === 'number' && noteColor >= 0 && noteColor < noteColorMap.length) ? noteColorMap[noteColor] : (typeof noteColor === 'string' ? noteColor : noteColorMap[0]);
            showModal({ raw: fileContent, format: textSpan, titleFormat: titleSpan, color: noteBgColor, boardId: extraData.boardid, id: noteID, gdid: currentGdid, datemod: extraData.datemod, originalNote: noteContent }, note);

            // Ако е натиснат Ctrl и сме в DB режим ИЛИ е разрешен GDrive update
            const updateGDrive = useGoogleDb && !isOffline;
            if (e.ctrlKey) {
                if ((typeof useIndexedDb !== 'undefined' && useIndexedDb) || (updateGDrive && currentGdid)) {
                    const modalBodyElem = document.getElementById('modal-body');
                    if (modalBodyElem) {
                        enableNoteEditing(modalBodyElem);
                    }
                } else if (!useIndexedDb && !updateGDrive) {
                    showToast("Editing requires Database Mode or 'Update Google Drive' enabled.", 3000);
                }
            }
        }
    };

    // Обработва клик върху хедъра (за изтриване)
    const handleHeaderClick = (e) => {
        if (e.ctrlKey) {
            e.stopPropagation();
            e.preventDefault();
            handleNoteDelete(noteGdid, noteID);
        }
    };
    titleWrapper.addEventListener('click', handleHeaderClick);
    addLongPressOrCtrlClick(titleWrapper, (e) => {
        e.stopPropagation();
        e.preventDefault();
        isLongPress = false;
        clearTimeout(longPressTimer);
        handleNoteDelete(noteGdid, noteID);
    });

    // Закачаме събитието за отваряне на модала за цялата бележка
    note.addEventListener('click', handleNoteClick);
    note.addEventListener('contextmenu', e => e.preventDefault());
    contentWrapper.appendChild(titleWrapper);
    contentWrapper.appendChild(contentEl);
    if (adjustPreviewBodyToRenderedTitle && previewTitleSourceText) {
        const observer = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.contentRect.width > 0) {
                    observer.disconnect();
                    const visibleTitleText = getVisibleTitleTextForElement(titleEl, previewTitleSourceText);
                    if (!visibleTitleText) return;
                    // Обновяваме текста на заглавието, за да не се съкращава CSS в средата на дума
                    titleEl.textContent = visibleTitleText;
                    const adjustedContent = getPreviewBodyAfterTitle(fileContent, visibleTitleText);
                    if (adjustedContent !== displayContent) {
                        displayContent = adjustedContent;
                        renderPreviewContent(displayContent);
                    }
                }
            }
        });
        observer.observe(titleEl);
    }
    // --- Създаване на футър с икони за прикачени файлове ---
    // Проверяваме дали има прикачени файлове (масивът `attachments` вече е попълнен правилно по-горе)
    // и дали бележката има идентификатор.
    if (!isHiddenNote && (noteGdid || noteID) && attachments.length > 0) {
        const uniqueTypes = [...new Set(attachments.map(att => att.type))];
        // --- Set explicit SHORT dataset attributes for attachment types ---
        if (uniqueTypes.includes(1)) note.dataset.hp = '1'; // data-hp = hasPhoto
        if (uniqueTypes.includes(4)) note.dataset.hv = '1'; // data-hv = hasVideo
        if (uniqueTypes.includes(2)) note.dataset.hs = '1'; // data-hs = hasSound
        if (uniqueTypes.includes(3)) note.dataset.ho = '1'; // data-ho = hasOther
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
                    iconDiv.dataset.type = type; // Add type for easier selection
                    // Calculate count of attachments of this type
                    const typeCount = attachments.filter(att => att.type === type).length;
                    if (typeCount > 1) {
                        const plusSpan = document.createElement('span');
                        plusSpan.textContent = '+';
                        plusSpan.style.fontWeight = 'bold';
                        plusSpan.style.fontSize = '14px';
                        plusSpan.style.color = '#333';
                        iconDiv.style.display = 'inline-flex';
                        iconDiv.style.alignItems = 'center';
                        iconDiv.style.justifyContent = 'center';
                        iconDiv.style.paddingRight = '4px';
                        iconDiv.appendChild(plusSpan);
                    }
                    if (type === 1 || type === 4) {
                        const firstAttachmentOfType = attachments.find(att => att.type === type);
                        if (firstAttachmentOfType) {
                            let sourceMode = 'gdrive';
                            if (useArhDb) sourceMode = 'archive';
                            else if (useLocalFolder) sourceMode = 'local';
                            else if (useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb) { // Ако е само IndexedDB
                                if (dbSourceGlobal === 3) sourceMode = 'archive'; // И базата е от архив
                                else if (dbSourceGlobal === 2) sourceMode = 'local'; // Или базата е от локална папка
                                // Ако dbSourceGlobal е 1 (Google Drive), sourceMode остава 'gdrive'
                            }
                            // Активираме превюто, ако източникът е Google Drive, Локална папка или Архив
                            // Only add preview listener if we actually found the attachment
                            if (sourceMode === 'gdrive' || sourceMode === 'local' || sourceMode === 'archive') {
                                // Filter attachments of this type (already filtered above for counting, but let's be explicit or reuse)
                                const attachmentsOfType = attachments.filter(att => att.type === type);
                                const isVideo = type === 4;
                                addInNotePreviewListener(iconDiv, attachmentsOfType, 0, sourceMode, isVideo);
                            }
                        }
                    }
                    footerEl.appendChild(iconDiv);
                }
            });

            note.appendChild(footerEl); // Преместваме футъра да е директен наследник на .note
        }
    }
    return note;
}

/**
 * Актуализира само съответния DOM елемент на бележката, без да прерисува целия екран.
 * @param {string} gdid - Глобалното ID на бележката.
 */
async function refreshNoteUI(gdid) {
    if (!gdid) return;
    const oldNoteEl = document.querySelector(`.note[data-g="${gdid}"]`);
    if (!oldNoteEl) {
        console.warn(`[refreshNoteUI] Note with GDID ${gdid} not found in DOM.`);
        return;
    }

    const noteData = allNotesData.find(n => n.gdid === gdid);
    if (!noteData) {
        console.error(`[refreshNoteUI] Note data for GDID ${gdid} not found in memory.`);
        return;
    }

    const newNoteEl = await createNoteElement(noteData);
    if (newNoteEl && oldNoteEl.parentNode) {
        oldNoteEl.parentNode.replaceChild(newNoteEl, oldNoteEl);
        // Важно: Извикваме applyFilters, за да се приложи текущият филтър на борда (за да не се появи "скрита" бележка)
        if (typeof applyFilters === 'function') applyFilters();
    }
}

async function toggleNotePinned(noteGdid, noteId) {
    const noteToUpdate = allNotesData.find(n => (noteGdid && n.gdid == noteGdid) || (noteId && n.id == noteId));
    if (!noteToUpdate) return false;

    const wasPinned = Number(noteToUpdate.pinnedAt || 0) > 0;
    if (noteToUpdate.version) noteToUpdate.version = parseInt(noteToUpdate.version, 10) + 1;
    else noteToUpdate.version = 1;
    noteToUpdate.pinnedAt = wasPinned ? 0 : Date.now();
    noteToUpdate.datemod = Date.now();

    const updateGDriveNow = useGoogleDb && !isOffline;
    const updateLocalFolderNow = localStorage.getItem('updateLocalFolder') === 'true' && !isOffline;
    if (!updateGDriveNow && !updateLocalFolderNow) {
        noteToUpdate.type = -1;
    }

    const oldNoteEl = document.querySelector(`.note[data-g="${noteToUpdate.gdid}"]`) ||
        (noteToUpdate.id ? document.querySelector(`.note[data-i="${noteToUpdate.id}"]`) : null);
    if (oldNoteEl) {
        const updatedEl = await createNoteElement(noteToUpdate);
        if (updatedEl) oldNoteEl.replaceWith(updatedEl);
    }

    if (updateGDriveNow) {
        const isTempGdid = !noteToUpdate.gdid || String(noteToUpdate.gdid) === String(noteToUpdate.id);
        if (isTempGdid) {
            const folderId = await getFolderID();
            if (folderId) {
                const oldGdid = noteToUpdate.gdid;
                const newGdid = await createGDriveFile(folderId, 'note.txt', JSON.stringify(noteToUpdate));
                if (newGdid) {
                    noteToUpdate.gdid = newGdid;
                    await updateGDriveFile(newGdid, JSON.stringify(noteToUpdate));
                    if (useIndexedDb && oldGdid && oldGdid !== newGdid) await deleteFromDB(NOTE_STORE_NAME, oldGdid);
                }
            }
        } else {
            await updateGDriveFile(noteToUpdate.gdid, JSON.stringify(noteToUpdate));
        }
        noteToUpdate.type = 0;
    }

    if (updateLocalFolderNow) {
        const isTempGdid = !noteToUpdate.gdid || String(noteToUpdate.gdid) === String(noteToUpdate.id);
        if (isTempGdid && !updateGDriveNow) {
            noteToUpdate.gdid = `L${Date.now()}`;
        }
        if (noteToUpdate.gdid) {
            await updateLocalFile(noteToUpdate.gdid, JSON.stringify(noteToUpdate));
        }
    }

    if (useIndexedDb) await bulkPutDB(NOTE_STORE_NAME, [noteToUpdate], true);
    applyFilters();
    updateReloadButtonState();
    showToast(wasPinned ? (_('noteUnpinned') || 'Note unpinned') : (_('notePinned') || 'Note pinned'), 2000);
    return true;
}
async function renderUI({ boardParseError, rerenderOnlyMenu = false }) {
    // Изчистваме бележките само ако не презареждаме единствено менюто - ПРЕМЕСТЕНО ПО-ДОЛУ ЗА ИЗБЯГВАНЕ НА 'МИГАНЕ'
    /* if (!rerenderOnlyMenu) {
        notesContainer.innerHTML = '';
    } */
    let boardsNoteElement = null;
    let extraCounts = {
        boardCounts: new Map(),
        reminderCount: 0,
        calendarCount: 0,
        trashCount: 0
    };

    // --- OWNER CHECK ---
    // If the user is not the owner, force 'all' boards view instead of saved startup board.
    // Exception: Archive and Local Folder modes often involve shared data, so we don't force 'all' if these modes are active.
    if (!isDbOwner && !useArhDb && !useLocalFolder) {
        currentBoardFilter = 'all';
    }

    // Обработка на стартов борд 'Main' (вече и регистронезависимо)
    if (currentBoardFilter === 'Main') {
        const mainBoard = boardsData.find(b => b.title && b.title.trim().toLowerCase() === 'main');
        if (mainBoard) {
            currentBoardFilter = (mainBoard.gdid || mainBoard.id).toString();
        } else if (boardsData.length > 0) {
            currentBoardFilter = (boardsData[0].gdid || boardsData[0].id).toString();
        } else {
            currentBoardFilter = 'all';
        }
    }

    // Проверка за валидност на текущия филтър (ако е останало старо ID от друга папка)
    const specialBoards = ['all', 'calendar', 'calendar_monthly', 'calendar_weekly', 'reminder', 'new-updates', 'search-results', 'with-photos', 'with-videos', 'with-sounds', 'with-other', 'trash'];
    if (!specialBoards.includes(currentBoardFilter)) {
        const boardExists = boardsData.some(b => b.gdid == currentBoardFilter || b.id == currentBoardFilter);
        if (!boardExists) {
            console.warn(`[renderUI] Saved board filter '${currentBoardFilter}' not found. Falling back to 'Main' or first board.`);
            const mainBoard = boardsData.find(b => b.title && b.title.trim().toLowerCase() === 'main');
            if (mainBoard) {
                currentBoardFilter = (mainBoard.gdid || mainBoard.id).toString();
            } else if (boardsData.length > 0) {
                currentBoardFilter = (boardsData[0].gdid || boardsData[0].id).toString();
            } else {
                currentBoardFilter = 'all';
            }
        }
    }
    if (boardsData.length > 0 || boardParseError) {
        const isArh = useArhDb || (useIndexedDb && dbSourceGlobal === 3);
        allNotesData.forEach(note => {
            if (note.status === 1) {
                extraCounts.trashCount++;
            } else {
                const boardId = String(note.boardid);
                extraCounts.boardCounts.set(boardId, (extraCounts.boardCounts.get(boardId) || 0) + 1);
            }
            if (note.timer && note.timer > 0) extraCounts.reminderCount++;
            if (note.calendarDate) extraCounts.calendarCount++;
        });
        boardsNoteElement = await createBoardsUI(boardsData, boardParseError, extraCounts);
    }
    // Винаги премахваме старото меню, за да го заменим с новото
    const oldBoardsNote = document.querySelector('header .boards-note');
    if (oldBoardsNote) {
        oldBoardsNote.remove();
    }
    // Ако само презареждаме менюто, добавяме новото и спираме дотук.
    if (rerenderOnlyMenu) {
        if (boardsNoteElement) {
            document.querySelector('header').appendChild(boardsNoteElement);
            // Синхронизираме визуалното състояние на менюто и скролираме до активния бутон
            // Използваме setTimeout, за да сме сигурни, че DOM-ът е обновен
            setTimeout(() => {
                // Използваме същата логика за маркуване като във filterNotesByBoard
                const specialBoards = ['all', 'calendar', 'calendar_monthly', 'calendar_weekly', 'reminder', 'new-updates', 'search-results', 'with-photos', 'with-videos', 'with-sounds', 'with-other'];
                const targetBoard = specialBoards.includes(currentBoardFilter) ? null : boardsData.find(b => b.gdid == currentBoardFilter || b.id == currentBoardFilter);
                const activeIdForUI = targetBoard ? (targetBoard.gdid || targetBoard.id) : currentBoardFilter;

                document.querySelectorAll('.board-filter-link').forEach(link => {
                    const isSelected = link.dataset.boardid === String(activeIdForUI);
                    link.classList.toggle('selected-board', isSelected);
                    link.classList.toggle('active', isSelected);
                    link.style.height = isSelected ? '39px' : '35px';
                    if (isSelected) {
                        link.scrollIntoView({
                            behavior: 'smooth',
                            inline: 'center',
                            block: 'nearest'
                        });
                    }
                });
            }, 50);
        }
        return; // КЛЮЧОВА СТЪПКА: Прекратяваме функцията тук
    }
    // --- Оттук надолу е логиката за ПЪЛНО презареждане ---
    // 1. Show spinner immediately
    if (!rerenderOnlyMenu && loaderContainer) {
        loaderContainer.style.display = 'block';
        if (loaderText) loaderText.textContent = _('fetchingFromDb') || 'Loading...';
    }
    // Method 1: Clear immediately to save memory
    if (!rerenderOnlyMenu) {
        notesContainer.innerHTML = '';
    }
    // 2. Use setTimeout to allow browser to render the spinner
    await new Promise(resolve => setTimeout(resolve, 50));

    // 2.1 Optimization: Preload backgrounds before creating elements to avoid staggered loading
    await preloadNoteBackgrounds(allNotesData);

    const noteElementsResults = await Promise.all(allNotesData.map(noteData => createNoteElement(noteData)));
    // Create fragment and populate it with new elements
    const fragment = document.createDocumentFragment();
    let notesCount = 0;
    let skippedNotesCount = 0;
    noteElementsResults.forEach(noteEl => {
        // console.log(noteEl);
        if (noteEl) {
            fragment.appendChild(noteEl);
            notesCount++;
        } else {
            skippedNotesCount++;
        }
    });

    if (skippedNotesCount > 0) {
        console.log(`[renderUI] Skipped ${skippedNotesCount} notes (likely status=1/deleted).`);
    }
    // Update container
    if (!rerenderOnlyMenu) {
        notesContainer.style.visibility = 'hidden'; // Hide container to prevent text-before-background flash
        notesContainer.appendChild(fragment);
        // --- IMMEDIATE FILTER APPLICATION ---
        // Apply filters synchronously immediately after adding to DOM to prevent "flash" of all notes
        applyFilters();
        // --- Reveal container after backgrounds are decoded by the browser ---
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                notesContainer.style.visibility = '';
            });
        });
    }
    // Hide spinner - using requestAnimationFrame to ensure the browser has a chance to 
    // paint the newly added notes with their backgrounds before we remove the overlay.
    if (!rerenderOnlyMenu && loaderContainer) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (loaderText) loaderText.textContent = '';
            });
        });
    }
    // Check if we need to delay showing the menu due to empty board cleanup
    let delayMenuRender = false;
    if (isInitialLoad && localStorage.getItem('checkEmptyBoards') === 'true') {
        const potentialEmptyBoards = boardsData.filter(b => (extraCounts.boardCounts.get(String(b.gdid || b.id)) || 0) === 0);
        if (potentialEmptyBoards.length > 0) {
            delayMenuRender = true;
        }
    }

    if (boardsNoteElement && !delayMenuRender) {
        document.querySelector('header').appendChild(boardsNoteElement);
    }
    // Прилагаме филтъра и скролираме менюто само при първоначално зареждане.
    if (isInitialLoad && localStorage.getItem('checkEmptyBoards') === 'true') {
        // Check for empty boards and offer deletion individually
        const emptyBoards = boardsData.filter(b => (extraCounts.boardCounts.get(String(b.gdid || b.id)) || 0) === 0);
        if (emptyBoards.length > 0) {
            setTimeout(async () => {
                let boardsModified = false;
                let currentEmptyCount = emptyBoards.length;
                for (const board of emptyBoards) {
                    // Safety check: Don't delete the last remaining board
                    if (boardsData.length <= 1) {
                        if (boardsModified) showToast(_('cannotDeleteLastBoard'), 3000);
                        break;
                    }
                    const confirmed = await showConfirmation(
                        _('confirmDeleteEmptyBoard').replace('{boardName}', board.title).replace('{count}', currentEmptyCount),
                        { showCancel: true, cancelText: _('cancel') || 'Cancel' }
                    );
                    // User clicked Cancel - stop the entire process
                    if (confirmed === 'cancel') {
                        break;
                    }
                    if (confirmed === true) {
                        currentEmptyCount--;
                        boardsModified = true;
                        boardsData = boardsData.filter(b => (b.gdid || b.id) !== (board.gdid || board.id));
                        // Update DB if used
                        if (useIndexedDb && typeof deleteFromDB === 'function') {
                            await deleteFromDB(BOARD_STORE_NAME, board.gdid || board.id);
                        }
                        // Delete the board file from Google Drive if it has a gdid
                        const updateGDriveNow = useGoogleDb && !isOffline;
                        if (updateGDriveNow && board.gdid && typeof deleteGDriveFile === 'function') {
                            try {
                                if (await deleteGDriveFile(board.gdid)) {
                                    console.log(`Deleted board file from GDrive: ${board.gdid}`);
                                } else {
                                    console.log(`Board file ${board.gdid} not found on GDrive (already deleted).`);
                                }
                            } catch (gdErr) {
                                console.error(`Failed to delete board file ${board.gdid} from GDrive:`, gdErr);
                            }
                        }
                        // Confirmation toast
                        showToast(_('boardDeletedSuccess').replace('{boardName}', board.title), 2000);
                    }
                }
                // Individual board files were already deleted via deleteGDriveFile(board.gdid) above
                // No need to update a centralized board.txt as boards are stored individually
                // Finally render the menu (it was hidden initially)
                renderUI({ rerenderOnlyMenu: true });
                // Re-apply active state to the board button as it was just rendered
                setTimeout(() => {
                    const startBoardBtn = document.querySelector(`.board-menu-container .board-filter-link[data-boardid="${currentBoardFilter}"]`);
                    if (startBoardBtn) {
                        startBoardBtn.classList.add('selected-board', 'active');
                        startBoardBtn.style.height = '39px';
                        startBoardBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    }
                }, 100);
            }, 1000);
        }
    }

    // --- BUTTON ACTIVE STATE SYNC + PROGRAMMATIC CLICK ---
    // For special boards like 'new-updates', applyFilters() alone may not be enough
    // because filterNotesByBoard sets up additional state. Trigger a click on initial load.
    const startBoardBtn = document.querySelector(`.board-menu-container .board-filter-link[data-boardid="${currentBoardFilter}"]`);
    if (startBoardBtn) {
        if (isInitialLoad) {
            // Use setTimeout to ensure DOM is fully ready before clicking
            setTimeout(() => {
                startBoardBtn.click();
            }, 50);
        } else {
            startBoardBtn.classList.add('selected-board', 'active');
            startBoardBtn.style.height = '39px';
            startBoardBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
    } else if (isInitialLoad && (currentBoardFilter === 'calendar' || currentBoardFilter === 'calendar_monthly' || currentBoardFilter === 'calendar_weekly')) {
        // Fallback for cases where the button might be missing from the menu
        setTimeout(() => {
            filterNotesByBoard(currentBoardFilter);
        }, 50);
    }
    isInitialLoad = false;

    // ПРИЛОЖЕНИЕ: Сега, когато зареждането е приключило, извикваме applyFilters отново, 
    // за да може асистентът (промо снимката) да се появи плавно и на правилното място.
    applyFilters();

    const counterEl = document.getElementById('note-counter');
    if (counterEl) {
        counterEl.textContent = notesCount;
    }
    populateStartBoardSelect();
    showAppUI();
    updateReloadButtonState();
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
        console.log("readArh: Не е подаден валиден handle на директория.");
        showToast(_('errorNoArchiveFolderSelected'), 10000);
        return false;
    }
    console.log("--- Archive fetch sequence started ---");
    const startTime = performance.now();
    let success = true;
    // Map usage removed here, now using local maps in validateFileData
    // const gdidMap = new Map();
    const validateFileData = (data, fileName) => {
        const fileMap = new Map();
        if (Array.isArray(data)) {
            data.forEach(item => {
                const itemId = item.id || item.gdid;
                if (itemId === undefined || itemId === null) {
                    const error = `[Archive] Item in '${fileName}' is missing ID property.`;
                    console.warn(error);
                    dataIntegrityIssues.push({ type: 'missing', file: fileName });
                } else {
                    if (fileMap.has(itemId)) {
                        const error = `[Duplicate ID] ID '${itemId}' found multiple times in '${fileName}'. Conflict within file.`;
                        console.error(error);
                        dataIntegrityIssues.push({ type: 'duplicate', gdid: itemId, file1: fileName, file2: fileName, mode: 'archive' });
                    } else {
                        fileMap.set(itemId, true);
                    }
                }
            });
        }
    };
    try {
        // 1. Четене на boards.bcp
        const boardsFileHandle = await dirHandle.getFileHandle('boards.bcp');
        const boardsFile = await boardsFileHandle.getFile();
        const boardsContent = await boardsFile.text();
        boardsData = JSON.parse(boardsContent);
        trackMaxBoardIds(boardsData);
        validateFileData(boardsData, 'boards.bcp');
        console.log(`Успешно заредени ${boardsData.length} борда от boards.bcp.`);
        // 2. Четене на notes.bcp
        const notesFileHandle = await dirHandle.getFileHandle('notes.bcp');
        const notesFile = await notesFileHandle.getFile();
        const notesContent = await notesFile.text();
        const notesArray = JSON.parse(notesContent);
        allNotesData = notesArray;
        trackMaxIds(allNotesData);
        validateFileData(allNotesData, 'notes.bcp');
        console.log(`Успешно заредени ${allNotesData.length} бележки от notes.bcp.`);
        // 3. Четене на medias.bcp (ако съществува)
        try {
            const mediaFileHandle = await dirHandle.getFileHandle('medias.bcp');
            const mediaFile = await mediaFileHandle.getFile();
            const mediaContent = await mediaFile.text();
            mediaData = JSON.parse(mediaContent);
            validateFileData(mediaData, 'medias.bcp');
            console.log(`Успешно заредени ${mediaData.length} медийни файла от medias.bcp.`);
        } catch (mediaError) {
            if (mediaError.name === 'NotFoundError') {
                console.log("Файл 'medias.bcp' не е намерен. Продължаваме без него.");
                mediaData = [];
            } else {
                throw mediaError;
            }
        }
    } catch (error) {
        success = false;
        if (error.name === 'NotFoundError') {
            console.log(`Грешка: Файл 'boards.bcp' или 'notes.bcp' не е намерен в папката '${dirHandle.name}'.`);
            showToast(_('errorRequiredArchiveFileMissing'), 10000);
        } else if (error instanceof SyntaxError) {
            console.log("Грешка при парсване на JSON съдържание от архивен файл:", error);
            showToast(_('errorInvalidArchiveData'), 10000);
        } else {
            console.log("Възникна неочаквана грешка при четене на архива:", error);
            showToast(_('errorReadingArchive'), 10000);
        }
    }
    const endTime = performance.now();
    if (success) {
        console.log(`--- Archive fetch sequence completed in ${((endTime - startTime) / 1000).toFixed(2)}s ---`);
        console.log(`[Summary] Boards: ${boardsData.length}, Media: ${mediaData.length}, Notes: ${allNotesData.length}`);
    }
    return success;
}

async function loadTranslations(lang) {
    if (appTranslations[lang]) return;
    try {
        let data = null;
        if (window.initialTranslationsPromise && lang === (localStorage.getItem('language') || (navigator.language && navigator.language.startsWith('bg') ? 'bg' : 'en'))) {
            data = await window.initialTranslationsPromise;
            window.initialTranslationsPromise = null;
        }
        if (!data) {
            const response = await fetch(`lang/i18n-${lang}.json`, { credentials: 'omit' });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            data = await response.json();
        }
        appTranslations[lang] = data;
    } catch (e) {
        console.error("Failed to load translations:", e);
        if (!appTranslations[lang]) {
            appTranslations[lang] = {};
            if (lang === 'bg') {
                appTranslations[lang]['offlineStartButton'] = 'Старт офлайн';
                appTranslations[lang]['authorizeButton'] = 'Вход с Google';
                appTranslations[lang]['trialButton'] = 'Старт 30-дневен пробен период';
                appTranslations[lang]['sessionExpired'] = 'Сесията изтече. Моля, влезте отново.';
                appTranslations[lang]['initialDataLoad'] = 'Зареждане на данни...';
            } else {
                appTranslations[lang]['offlineStartButton'] = 'Start Offline';
                appTranslations[lang]['authorizeButton'] = 'Authorize with Google';
                appTranslations[lang]['trialButton'] = 'Start 30-day trial period';
                appTranslations[lang]['sessionExpired'] = 'Session expired. Please login again.';
                appTranslations[lang]['initialDataLoad'] = 'Data loading...';
            }
            if (!appTranslations[lang]['loginPrompt']) {
                appTranslations[lang]['loginPrompt'] = lang === 'bg' ? 'Моля, влезте с Google акаунта, с който сте синхронизирали бележките си в MultiNotes.' : 'Please sign in with Google account you used to sync MultiNotes.';
            }
        }
    }
}

async function setLanguage(lang) {
    if (!appTranslations[lang]) {
        await loadTranslations(lang);
    }
    if (!appTranslations[lang]) return;
    currentLang = lang;
    localStorage.setItem('language', lang);
    document.documentElement.lang = lang;
    const translations = appTranslations[lang];

    document.querySelectorAll('[data-key]').forEach(element => {
        const key = element.getAttribute('data-key');
        element.innerHTML = translations[key] || key;
    });
    const appTitleEl = document.getElementById('app-title');
    if (appTitleEl) {
        appTitleEl.innerHTML += ` <span style="font-size: 0.4em; opacity: 0.7; font-weight: normal; vertical-align: middle; margin-left: 8px;">${version}</span>`;
    }
    document.querySelectorAll('[data-key-placeholder]').forEach(element => {

        const key = element.getAttribute('data-key-placeholder');
        element.placeholder = translations[key] || key;
    });
    document.querySelectorAll('[data-key-title]').forEach(element => {
        const key = element.getAttribute('data-key-title');
        element.title = translations[key] || key;
    });
    const mainLangSelect = document.getElementById('main-lang-select');
    if (mainLangSelect) mainLangSelect.value = lang;
    // Check if updateSignoutTooltip exists before calling it
    if (typeof updateSignoutTooltip === 'function') {
        updateSignoutTooltip();
    }
    // Update KB Assistant Language
    if (window.kbAssistant && typeof window.kbAssistant.updateLanguage === 'function') {
        window.kbAssistant.updateLanguage();
    }
    // Update dynamic text that relies on database reads
    if (typeof updateSpecialFolderNames === 'function') {
        updateSpecialFolderNames();
    }
}

// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const hadController = !!navigator.serviceWorker.controller;
            // КОРЕКЦИЯ: Изчистваме САМО ако имаме дублиращи се или грешни Service Workers
            const registrations = await navigator.serviceWorker.getRegistrations();
            if (registrations.length > 1) {
                for (let registration of registrations) {
                    const swUrl = registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL;
                    // Keep only one active sw.js registration
                    if (!swUrl || !swUrl.includes('sw.js')) {
                        console.log('Unregistering stale service worker:', swUrl);
                        await registration.unregister();
                    }
                }
            }
            // Регистрираме версията с флаг, за да принудим браузъра да я презареди, версиите на sw и main трябва да съвпадат
            const registration = await navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(version)}`);
            console.log(`[SW] Registration successful. Scope: ${registration.scope}. Active: ${!!registration.active}, Waiting: ${!!registration.waiting}, Installing: ${!!registration.installing}`);

            // Function to show update notification as a persistent floating bar
            // Uses a simple boolean flag - guarantees at most ONE notification per page load
            const showUpdateNotification = (waitingSW) => {
                if (!waitingSW) return;

                // Block if already shown on this page load, or if we just clicked refresh in this session
                if (window._swUpdateBarShown || sessionStorage.getItem('sw_refresh_clicked')) return;

                window._swUpdateBarShown = true;
                console.log('[SW] Showing update notification bar.');

                // Create update notification bar
                const updateBar = document.createElement('div');
                updateBar.id = 'sw-update-bar';
                updateBar.style.cssText = `
                    position: fixed;
                    bottom: 15px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 12px 20px;
                    border-radius: 12px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                    z-index: 100000;
                    display: flex;
                    align-items: center;
                    gap: 15px;
                    white-space: nowrap;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    animation: swSlideUp 0.3s ease;
                `;

                const textSpan = document.createElement('span');
                textSpan.textContent = typeof _ === 'function' ? _('newVersionAvailable') : "New version available!";
                textSpan.style.fontWeight = '500';

                const refreshBtn = document.createElement('button');
                refreshBtn.textContent = typeof _ === 'function' ? _('refreshNow') : "Refresh now";
                refreshBtn.style.cssText = `
                    background: white;
                    color: #667eea;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 8px;
                    cursor: pointer;
                    font-weight: bold;
                    transition: all 0.2s;
                `;
                refreshBtn.onmouseover = () => { refreshBtn.style.transform = 'scale(1.05)'; refreshBtn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'; };
                refreshBtn.onmouseout = () => { refreshBtn.style.transform = 'scale(1)'; refreshBtn.style.boxShadow = 'none'; };
                refreshBtn.onclick = () => {
                    // Block duplicate prompts after reload in this specific tab session
                    sessionStorage.setItem('sw_refresh_clicked', 'true');
                    localStorage.removeItem('app_version_seen');
                    waitingSW.postMessage({ type: 'SKIP_WAITING' });
                    setTimeout(() => updateBar.remove(), 100);
                };

                updateBar.appendChild(textSpan);
                updateBar.appendChild(refreshBtn);
                document.body.appendChild(updateBar);

                // Add animation style if not exists
                if (!document.getElementById('sw-update-style')) {
                    const style = document.createElement('style');
                    style.id = 'sw-update-style';
                    style.textContent = `
                        @keyframes swSlideUp {
                            from { transform: translateX(-50%) translateY(100px); opacity: 0; }
                            to { transform: translateX(-50%) translateY(0); opacity: 1; }
                        }
                    `;
                    document.head.appendChild(style);
                }
            };

            // ALWAYS check if there's already a waiting SW
            if (registration.waiting) {
                showUpdateNotification(registration.waiting);
            }

            // ALWAYS listen for new SW installing
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('[SW] New worker found installation starting...', newWorker?.scriptURL);
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        console.log(`[SW] New worker state changed: ${newWorker.state}`);
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('[SW] New worker installed and waiting. Showing notification bar.');
                            showUpdateNotification(newWorker);
                        }
                    });
                }
            });

            // Reload when the new Service Worker takes control, but only IF there was a previous controller (actual update)
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                console.log(`[SW] Controller changed. hadController: ${hadController}, refreshing: ${refreshing}`);
                if (!refreshing && hadController) {
                    console.log('[SW] Reloading page due to controller change...');
                    window.location.reload();
                    refreshing = true;
                }
            });

        } catch (err) {
            console.log('ServiceWorker registration failed: ', err);
        }
    });

}
/*
 * Iterates through all visible notes and opens the preview for the first image attachment.
 */
async function showBoardPreviews() {
    console.log("Toggling board previews...");
    // Robustly find visible notes (not 'none'). The previous selector [style*="display: flex"] might fail if style is empty.
    const allNotes = Array.from(notesContainer.querySelectorAll('.note:not(.boards-note)'));
    const visibleNotes = allNotes.filter(n => n.style.display !== 'none');
    // Check if there are any open previews
    const openPreviews = visibleNotes.filter(n => n.querySelector('.image-preview-overlay'));
    if (openPreviews.length > 0) {
        // Close all open previews
        console.log("Closing open previews...");
        openPreviews.forEach(note => {
            const overlay = note.querySelector('.image-preview-overlay');
            if (overlay) overlay.remove();
        });
    } else {
        // Open previews
        console.log("Opening previews...");
        for (const note of visibleNotes) {
            // 1. Primary Method: Click the Footer Icon (Standard UI behavior)
            // This ensures consistency with manual user interaction.
            const footerIcon = note.querySelector('.footer-icon[data-type="1"]');
            if (footerIcon) {
                footerIcon.click();
                continue; // Success, move to next note
            }
            // 2. Fallback Method: Check dataset.previewAttachment (Invisible Metadata)
            // Useful if for some reason the footer icon is not rendered or found.
            if (note.dataset.previewAttachment) {
                try {
                    const data = JSON.parse(note.dataset.previewAttachment);
                    showInNotePreview(note, data.fileId, data.mode, data.isVideo);
                    continue;
                } catch (e) {
                    console.log("Error parsing preview attachment data:", e);
                }
            }
        }
    }
}

// --- Swipe Navigation for Boards ---
let touchStartX = 0;
let touchStartY = 0;
let touchStartedInWeeklyCalendar = false;

document.addEventListener('touchstart', e => {
    // Ignore if multi-touch
    if (e.touches.length > 1) return;
    touchStartedInWeeklyCalendar = !!e.target.closest('#weekly-calendar-container');
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', e => {
    // Ignore if multi-touch
    if (e.changedTouches.length > 1) return;

    if (touchStartedInWeeklyCalendar) {
        touchStartedInWeeklyCalendar = false;
        return;
    }

    // Check if any modal is open
    if (document.querySelector('.modal-overlay.visible')) return;

    // Check if target is scrollable horizontally
    let target = e.target;
    while (target && target !== document.body) {
        // Simple check for potentially scrollable elements
        if (['PRE', 'CODE', 'TABLE', 'TH', 'TD'].includes(target.tagName)) return;
        // Check if element has horizontal scroll
        if (target.scrollWidth > target.clientWidth) {
            return;
        }
        target = target.parentElement;
    }

    const touchEndX = e.changedTouches[0].screenX;
    const touchEndY = e.changedTouches[0].screenY;
    handleSwipe(touchStartX, touchStartY, touchEndX, touchEndY);
}, { passive: true });

function handleSwipe(startX, startY, endX, endY) {
    const minSwipeDistance = 100;
    const maxVerticalDistance = 60;

    const diffX = endX - startX;
    const diffY = endY - startY;

    if (Math.abs(diffX) > minSwipeDistance && Math.abs(diffY) < maxVerticalDistance) {
        if (diffX > 0) {
            // Right Swipe -> Previous (Left)
            navigateBoard(-1);
        } else {
            // Left Swipe -> Next (Right)
            navigateBoard(1);
        }
    }
}

function navigateBoard(direction) {
    const buttons = Array.from(document.querySelectorAll('.board-menu-container .board-filter-link'));
    if (!buttons.length) return;

    let currentIndex = buttons.findIndex(btn => btn.classList.contains('selected-board'));

    // If no board is selected (e.g. initial state or cleared), assume 0
    if (currentIndex === -1) currentIndex = 0;

    let nextIndex = currentIndex + direction;

    // Cyclic navigation
    if (nextIndex < 0) nextIndex = buttons.length - 1;
    if (nextIndex >= buttons.length) nextIndex = 0;

    const targetBtn = buttons[nextIndex];
    if (targetBtn) {
        targetBtn.click();
    }
}

//     <!-- === --- === В Т О Р А   В Е Р С И Я === --- === -->

// Settings 2 IIFE removed

// --- Save Button Listener ---
// --- Save Button Listener ---
(function () {
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
        saveBtn.addEventListener('click', () => {
            document.getElementById('settings-modal').classList.remove('visible');
            if (typeof exportNotes === 'function') exportNotes();
            else console.error('exportNotes function not found');
        });
    }
    const saveIndividualBtn = document.getElementById('save-individual-btn');
    if (saveIndividualBtn) {
        saveIndividualBtn.addEventListener('click', () => {
            document.getElementById('settings-modal').classList.remove('visible');
            if (typeof exportToIndividualFiles === 'function') exportToIndividualFiles();
            else console.error('exportToIndividualFiles function not found');
        });
    }
})();

// --- Settings Close (×) Button ---
const settingsCloseX = document.getElementById('settings-close-x');
if (settingsCloseX) {
    settingsCloseX.addEventListener('click', () => {
        const mainCloseBtn = document.getElementById('settings-close-btn');
        if (mainCloseBtn) mainCloseBtn.click();
    });
}

/**
 * Updates the visibility of elements in Advanced Settings based on application state.
 */
async function updateAdvancedSettingsVisibility() {
    const saveIndividualWrapper = document.getElementById('save-individual-wrapper');
    const advancedSettingsSpan = document.getElementById('advanced-settings-span');

    if (advancedSettingsSpan) {
        if (localStorage.getItem('showAdvancedSettings') === 'true') {
            advancedSettingsSpan.removeAttribute('hidden');
        }
    }

    // Sync checkboxes
    const useArhDbCheckbox = document.getElementById('use-arh-db-checkbox');
    const useLocalDbCheckbox = document.getElementById('use-local-db-checkbox');
    const useGoogleDbCheckbox = document.getElementById('use-google-db-checkbox');
    const useIndexedDbCheckbox = document.getElementById('use-indexeddb-checkbox');

    if (useArhDbCheckbox) useArhDbCheckbox.checked = localStorage.getItem('useArhDb') === 'true';
    if (useLocalDbCheckbox) useLocalDbCheckbox.checked = localStorage.getItem('useLocalDb') === 'true';
    if (useGoogleDbCheckbox) useGoogleDbCheckbox.checked = localStorage.getItem('useGoogleDb') !== 'false';
    if (useIndexedDbCheckbox) useIndexedDbCheckbox.checked = localStorage.getItem('useIndexedDb') !== 'false';

    // Individual save is always visible if supported by browser
    if (saveIndividualWrapper) {
        saveIndividualWrapper.style.display = (window.showDirectoryPicker) ? 'block' : 'none';
    }
}

// --- Edit Note on Ctrl+Click (DB Mode) ---
const noCalendarIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="5" width="16" height="16" rx="2" /><line x1="16" y1="3" x2="16" y2="7" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="4" y1="11" x2="20" y2="11" /><line x1="3" y1="3" x2="21" y2="21" /></svg>`;

// Helper to parse format string into array of objects
const parseFormatsString = (str) => {
    if (!str || str.trim() === "") return [];
    return str.split(/[|\n]/).filter(f => f.trim() !== "").map(f => {
        try { return JSON.parse(f); } catch (e) { return null; }
    }).filter(f => f !== null && f.start !== undefined && f.end !== undefined);
};

// Helper to stringify array of objects back to format string
const stringifyFormatsArray = (arr) => {
    return arr.map(f => JSON.stringify(f)).join('|');
};

function scrollCaretIntoView(textarea) {
    if (!textarea) return;
    const text = textarea.value;
    const pos = textarea.selectionStart;

    // Създаваме временен "mirror" елемент, за да изчислим височината до курсора
    const mirror = document.createElement('div');
    const styles = getComputedStyle(textarea);

    // Копираме всички критични стилове за оформлението
    const stylesToCopy = [
        'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'width', 'boxSizing', 'whiteSpace', 'wordWrap'
    ];

    stylesToCopy.forEach(prop => { mirror.style[prop] = styles[prop]; });
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.height = 'auto';
    mirror.style.overflow = 'hidden';

    // Вземаме текста до позицията на курсора
    const textBeforeCaret = text.substring(0, pos);
    mirror.textContent = textBeforeCaret;

    // Добавяме маркер, който да ни даде координатите
    const marker = document.createElement('span');
    marker.textContent = '|'; // Виртуален курсор
    mirror.appendChild(marker);

    document.body.appendChild(mirror);

    const caretY = marker.offsetTop;
    const markerHeight = marker.offsetHeight;
    const textareaHeight = textarea.clientHeight;
    const currentScroll = textarea.scrollTop;

    // Проверка дали курсорът е извън видимата област (отгоре или отдолу)
    if (caretY < currentScroll) {
        textarea.scrollTop = caretY - 20; // Скролираме нагоре с малък марж
    } else if (caretY + markerHeight > currentScroll + textareaHeight) {
        textarea.scrollTop = caretY + markerHeight - textareaHeight + 30; // Скролираме надолу
    }

    document.body.removeChild(mirror);
}

function enableNoteEditing(modalBodyElem, charIndex = -1) {
    if (!modalBodyElem) return;

    // Show board name when editing starts
    const modalBoardNameEl = document.getElementById('modal-board-name');
    if (modalBoardNameEl) modalBoardNameEl.style.display = 'block';

    // If already editing, don't re-init
    if (modalBodyElem.querySelector('textarea')) return;

    // If search is open, we don't close it, so user can keep searching while editing
    const modalContentBox = modalBodyElem.closest('.modal-content-box');
    const searchBar = modalContentBox.querySelector('.modal-search-bar');
    if (searchBar) {
        // We don't remove it, but we might want to refresh its context if needed
    }

    const noteGdid = modalBodyElem.dataset.gdid;
    const noteId = modalBodyElem.dataset.id;
    const noteObj = allNotesData.find(n => (n.gdid && String(n.gdid) === String(noteGdid)) || (n.id && String(n.id) === String(noteId)));
    const isHiddenNote = noteObj && noteObj.pass === true;

    let correctedTitleIndex = -1;
    let correctedBodyIndex = -1;

    let titleText = "";
    let bodyText = currentModalContent || "";
    let currentBodyFormats = parseFormatsString(modalBodyElem.dataset.format);
    let currentTitleFormats = parseFormatsString(modalBodyElem.dataset.titleFormat);

    const hasPipe = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(bodyText) !== -1 : bodyText.includes('|');
    if (modalBodyElem.dataset.draftText !== undefined) {
        bodyText = modalBodyElem.dataset.draftText;
        titleText = modalBodyElem.dataset.draftTitle || "";
    } else if ((isHiddenNote || hasPipe) && !modalBodyElem.querySelector('textarea')) {
        let splitParts = [];
        if (hasPipe) {
            const pipeIdx = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(bodyText) : bodyText.indexOf('|');
            titleText = bodyText.substring(0, pipeIdx);
            bodyText = bodyText.substring(pipeIdx + 1);
        }
        let titleCharIdx = -1;
        let bodyCharIdx = -1;
        if (charIndex > -1) {
            if (charIndex <= titleText.length) {
                titleCharIdx = charIndex;
            } else {
                bodyCharIdx = charIndex - (titleText.length + 1);
            }
        }
        const titleResult = preEdit(titleText, currentTitleFormats, titleCharIdx);
        const bodyResult = preEdit(bodyText, currentBodyFormats, bodyCharIdx);
        titleText = titleResult.text;
        bodyText = bodyResult.text;
        correctedTitleIndex = titleResult.correctedIndex;
        correctedBodyIndex = bodyResult.correctedIndex;
        const allMasked = [...(titleResult.maskedLinks || []), ...(bodyResult.maskedLinks || [])];
        modalBodyElem.dataset.maskedLinks = JSON.stringify(allMasked);
        modalBodyElem.dataset.titleFormat = stringifyFormatsArray(titleResult.formats);
        modalBodyElem.dataset.format = stringifyFormatsArray(bodyResult.formats);
    } else {
        const result = preEdit(bodyText, currentBodyFormats, charIndex);
        bodyText = result.text;
        correctedBodyIndex = result.correctedIndex;
        modalBodyElem.dataset.maskedLinks = JSON.stringify(result.maskedLinks || []);
        modalBodyElem.dataset.format = stringifyFormatsArray(result.formats);
    }
    if (modalBodyElem.dataset.initialEditText === undefined) {
        modalBodyElem.dataset.initialEditText = bodyText;
        modalBodyElem.dataset.initialEditTitleText = titleText;
        modalBodyElem.dataset.initialFormat = modalBodyElem.dataset.format || '';
        modalBodyElem.dataset.initialTitleFormat = modalBodyElem.dataset.titleFormat || '';
    }
    modalBodyElem.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position:relative; width:100%; height:100%; display: flex; flex-direction: column;';

    const createEditor = (id, value, height = '100%', isTitle = false) => {
        const container = document.createElement('div');
        container.style.cssText = `position:relative; width:100%; height:${height}; overflow:hidden; border-bottom: ${isTitle ? '1px solid #ccc' : 'none'};`;

        const textarea = document.createElement('textarea');
        textarea.id = id;
        textarea.value = value;
        Object.assign(textarea.style, {
            width: '100%',
            height: '100%',
            border: 'none',
            outline: 'none',
            background: 'transparent',
            fontFamily: getComputedStyle(modalBodyElem).fontFamily,
            fontSize: isTitle ? '1.2em' : getComputedStyle(modalBodyElem).fontSize,
            fontWeight: isTitle ? 'bold' : 'normal',
            color: 'inherit',
            resize: 'none',
            padding: '10px',
            boxSizing: 'border-box',
            overflowY: 'auto',
            whiteSpace: 'pre-wrap',
            position: 'relative',
            zIndex: '2',
            lineHeight: 'normal'
        });

        const backdrop = document.createElement('div');
        backdrop.id = id + '-backdrop';
        Object.assign(backdrop.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            padding: '10px',
            boxSizing: 'border-box',
            fontFamily: textarea.style.fontFamily,
            fontSize: textarea.style.fontSize,
            fontWeight: textarea.style.fontWeight,
            lineHeight: 'normal',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            color: 'transparent',
            pointerEvents: 'none',
            zIndex: '1',
            overflow: 'hidden'
        });

        container.appendChild(backdrop);
        container.appendChild(textarea);
        return { container, textarea, backdrop };
    };

    if ((isHiddenNote || titleText !== "") && bodyText !== null) {
        const titleEditor = createEditor('note-edit-title-textarea', titleText, '60px', true);
        const bodyEditor = createEditor('note-edit-textarea', bodyText, 'calc(100% - 60px)');

        wrapper.appendChild(titleEditor.container);
        wrapper.appendChild(bodyEditor.container);
    } else {
        const editor = createEditor('note-edit-textarea', bodyText);
        wrapper.appendChild(editor.container);
    }

    modalBodyElem.appendChild(wrapper);

    const bodyTextarea = document.getElementById('note-edit-textarea');
    const bodyBackdrop = document.getElementById('note-edit-textarea-backdrop');
    const titleTextarea = document.getElementById('note-edit-title-textarea');
    const titleBackdrop = document.getElementById('note-edit-title-textarea-backdrop');

    // Sync scrolling for both if applicable (mostly body)
    if (bodyTextarea && bodyBackdrop) {
        bodyTextarea.addEventListener('scroll', () => { bodyBackdrop.scrollTop = bodyTextarea.scrollTop; });
        bodyBackdrop.addEventListener('scroll', () => { bodyTextarea.scrollTop = bodyBackdrop.scrollTop; });
        bodyTextarea.addEventListener('input', () => { handleEditInput(bodyTextarea, bodyBackdrop); });
        handleEditInput(bodyTextarea, bodyBackdrop);
    }
    if (titleTextarea && titleBackdrop) {
        titleTextarea.addEventListener('scroll', () => { titleBackdrop.scrollTop = titleTextarea.scrollTop; });
        titleBackdrop.addEventListener('scroll', () => { titleTextarea.scrollTop = titleBackdrop.scrollTop; });
        titleTextarea.addEventListener('input', () => { handleEditInput(titleTextarea, titleBackdrop); });
        handleEditInput(titleTextarea, titleBackdrop);
    }

    initNoteEditUI();

    const focusEl = (charIndex !== -1 && bodyTextarea) ? bodyTextarea : (titleTextarea || bodyTextarea);

    if (focusEl) {
        focusEl.focus();
        if (correctedTitleIndex > -1 && titleTextarea) {
            titleTextarea.setSelectionRange(correctedTitleIndex, correctedTitleIndex);
        } else if (correctedBodyIndex > -1 && bodyTextarea) {
            bodyTextarea.setSelectionRange(correctedBodyIndex, correctedBodyIndex);
        } else {
            placeCaretAtEnd(focusEl);
        }
        // --- SCROLL TO CARET LOGIC ---
        setTimeout(() => {
            const textarea = document.activeElement;
            if (textarea && (textarea.id === 'note-edit-textarea' || textarea.id === 'note-edit-title-textarea')) {
                scrollCaretIntoView(textarea);
            }
        }, 150);
    }

    // if (typeof showToast === 'function') showToast("Editing enabled.", 2000);
    const prevBtn = document.getElementById('prev-note-btn');
    const nextBtn = document.getElementById('next-note-btn');
    const bulletBtn = document.getElementById('bullet-list-btn');
    const numberedBtn = document.getElementById('numbered-list-btn');
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
    if (bulletBtn) bulletBtn.style.display = 'flex';
    if (numberedBtn) numberedBtn.style.display = 'flex';
}
function toggleListFormat(textarea, listType) {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    let lineStart = text.lastIndexOf('\n', start - 1) + 1;
    let lineEnd = text.indexOf('\n', end);
    if (lineEnd === -1) lineEnd = text.length;
    const selectedLines = text.substring(lineStart, lineEnd).split('\n');
    const isBullet = listType === 'bullet';
    const bulletSym = (localStorage.getItem('mdBullet') || '-').trim();

    const isRemoving = selectedLines.every(line => {
        if (isBullet) return line.trim().startsWith(bulletSym);
        return /^\d+\.\s/.test(line.trim());
    });

    const newLines = selectedLines.map((line, idx) => {
        if (isRemoving) {
            if (isBullet) {
                const escapedBullet = bulletSym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                return line.replace(new RegExp(`^\\s*${escapedBullet}\\s*`), '');
            }
            return line.replace(/^\s*\d+\.\s*/, '');
        } else {
            const currentMarker = isBullet ? `${bulletSym} ` : `${idx + 1}. `;
            const escapedBullet = bulletSym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const bulletRegex = isBullet ? new RegExp(`^\\s*${escapedBullet}\\s*`) : /^\s*\d+\.\s*/;
            return currentMarker + line.replace(bulletRegex, '');
        }
    });
    const replacement = newLines.join('\n');
    // textarea.setRangeText(replacement, lineStart, lineEnd, 'select');
    textarea.setRangeText(replacement, lineStart, lineEnd, 'end');
    textarea.dispatchEvent(new Event('input', {
        bubbles: true
    }));
}

function getPreciseCharIndex(container, range) {
    let charCount = 0;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: (node) => {
            if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'BR') return NodeFilter.FILTER_SKIP;
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (node === range.startContainer) {
            charCount += range.startOffset;
            break;
        }
        if (node.nodeType === Node.TEXT_NODE) {
            charCount += node.textContent.length;
        } else if (node.tagName === 'BR') {
            charCount += 1; // Count <br> as \n
        }
    }
    return charCount;
}

/**
 * Глобален слушател за прихващане на системни преки пътища (Ctrl+N, Ctrl+U и др.)
 */
document.addEventListener('keydown', (e) => {
    const activeTextarea = document.activeElement;
    if (!activeTextarea || (activeTextarea.id !== 'note-edit-textarea' && activeTextarea.id !== 'note-edit-title-textarea')) return;

    if (e.ctrlKey || e.metaKey) {
        const key = e.key.toLowerCase();
        const code = e.code;
        const isB = (code === 'KeyB' || key === 'b');
        const isI = (code === 'KeyI' || key === 'i');
        const isU = (code === 'KeyU' || key === 'u');
        const isD = (code === 'KeyD' || key === 'd');

        if (isB || isI || isU || isD) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            const backdropId = (activeTextarea.id === 'note-edit-textarea') ? 'note-edit-textarea-backdrop' : 'note-edit-title-textarea-backdrop';
            const backdrop = document.getElementById(backdropId);

            formatKeyboardHotkeys(activeTextarea, backdrop, isB, isI, isU, isD);
        }
    }
}, true);
document.getElementById('bullet-list-btn')?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const activeTextarea = document.activeElement;
    if (activeTextarea && (activeTextarea.id === 'note-edit-textarea' || activeTextarea.id === 'note-edit-title-textarea')) {
        toggleListFormat(activeTextarea, 'bullet');
    }
});
document.getElementById('numbered-list-btn')?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const activeTextarea = document.activeElement;
    if (activeTextarea && (activeTextarea.id === 'note-edit-textarea' || activeTextarea.id === 'note-edit-title-textarea')) {
        toggleListFormat(activeTextarea, 'numbered');
    }
});

// --- Escape key to close modals ---
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const visibleModal = document.querySelector('.modal-overlay.visible');
        if (visibleModal) {
            const closeBtn = visibleModal.querySelector('.modal-close');
            if (closeBtn) {
                closeBtn.click();
            } else {
                // Fallback for settings or other specific close buttons
                const settingsClose = document.getElementById('settings-close-btn');
                if (settingsClose && visibleModal.contains(settingsClose)) {
                    settingsClose.click();
                } else {
                    visibleModal.classList.remove('visible');
                }
            }
        }
    }
});




function formatKeyboardHotkeys(textarea, backdrop, isB, isI, isU, isD) {
    let symbol = '';
    if (isB) symbol = localStorage.getItem('mdBold') || '**';
    else if (isI) symbol = localStorage.getItem('mdItalic') || '*';
    else if (isU) symbol = localStorage.getItem('mdUnderline') || '_';
    else if (isD) symbol = localStorage.getItem('mdStrike') || '~~';

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = textarea.value.substring(start, end);
    const replacement = symbol + selectedText + symbol;

    textarea.setRangeText(replacement, start, end, 'select');

    if (start === end) {
        textarea.selectionStart = start + symbol.length;
        textarea.selectionEnd = textarea.selectionStart;
    } else {
        textarea.selectionStart = start + symbol.length;
        textarea.selectionEnd = start + symbol.length + selectedText.length;
    }

    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

window.addEventListener('orientationchange', () => {
    const floatingButton = document.getElementById('popup-menu-btn-floating');
    if (floatingButton) {
        // Изчакваме малко, за да се установят новите размери на екрана
        setTimeout(() => {
            // Задаваме позицията вертикално в средата, отдясно
            floatingButton.style.top = '50%';
            floatingButton.style.right = '10px';
            floatingButton.style.bottom = 'auto';
            floatingButton.style.left = 'auto';
            floatingButton.style.transform = 'translateY(-50%)';

            // Запазваме новата позиция в localStorage, за да се помни
            localStorage.setItem('popupMenuBtnPosition', JSON.stringify({ top: floatingButton.style.top, right: floatingButton.style.right, transform: floatingButton.style.transform }));
        }, 200);
    }
});

// --- Logic for preserving formatting during editing ---
function handleEditInput(textarea, backdrop) {
    const modalBodyElem = document.getElementById('modal-body');
    if (!modalBodyElem) return;

    const isTitle = textarea.id === 'note-edit-title-textarea';
    const storageKey = isTitle ? 'titleFormat' : 'format';
    let formats = [];
    const fmtStr = modalBodyElem.dataset[storageKey];

    if (fmtStr && fmtStr.trim() !== '') {
        formats = fmtStr.split('|').map(p => {
            try { return JSON.parse(p); } catch (e) { return null; }
        }).filter(f => f && f.start !== undefined);
    }

    const text = textarea.value;
    const lastVal = textarea.dataset.lastVal || text;
    const diff = text.length - lastVal.length;
    const pos = textarea.selectionStart;

    if (diff > 0) {
        const P = pos - diff;
        const L = diff;
        formats.forEach(f => {
            if (P <= f.start) { f.start += L; f.end += L; }
            else if (P < f.end) { f.end += L; }
        });
    } else if (diff < 0) {
        const L = Math.abs(diff);
        const P = pos;
        formats.forEach(f => {
            if (f.start > P + L) f.start -= L; else if (f.start > P) f.start = P;
            if (f.end > P + L) f.end -= L; else if (f.end > P) f.end = P;
        });
    }

    textarea.dataset.lastVal = text;
    if (diff !== 0) {
        modalBodyElem.dataset[storageKey] = formats.map(f => JSON.stringify(f)).join('|');
    }

    // Render Backdrop
    if (!formats.length) {
        backdrop.innerText = text;
    } else {
        const points = new Set([0, text.length]);
        formats.forEach(f => {
            points.add(Math.max(0, Math.min(text.length, f.start)));
            points.add(Math.max(0, Math.min(text.length, f.end)));
        });
        const sortedPoints = Array.from(points).sort((a, b) => a - b);
        let html = '';
        for (let i = 0; i < sortedPoints.length - 1; i++) {
            const start = sortedPoints[i];
            const end = sortedPoints[i + 1];
            let segment = text.substring(start, end);
            const isFormatted = formats.some(f => start >= f.start && end <= f.end);
            segment = segment.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            if (isFormatted) {
                html += `<span style="border-bottom: 2px dashed black; background-color: rgba(128, 128, 128, 0.3);">${segment}</span>`;
            } else {
                html += segment;
            }
        }
        backdrop.innerHTML = html + (text.endsWith('\n') ? '\n ' : '');
    }
}

function initNoteEditUI() {
    const contentModal = document.getElementById('content-modal');
    const modalBodyEl = document.getElementById('modal-body');
    const modalContentBox = contentModal?.querySelector('.modal-content-box');
    const footerToolbar = modalContentBox?.querySelector('.modal-footer-toolbar');
    // Add attach button if not exists
    if (!document.getElementById('note-attach-btn')) {
        const attachBtn = document.createElement('div');
        attachBtn.id = 'note-attach-btn';
        attachBtn.className = 'modal-footer-btn';
        attachBtn.innerHTML = paperclipIconSvg;
        attachBtn.title = (typeof _ === 'function') ? _('attachFileTooltip') || "Attach file" : "Attach file";
        attachBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const attachInput = document.getElementById('modal-attach-image-input');
            if (attachInput) attachInput.click();
        });

        // Add save button if not exists
        const saveBtn = document.createElement('div');
        saveBtn.id = 'note-save-btn';
        saveBtn.className = 'modal-footer-btn';
        saveBtn.innerHTML = diskIconSvg;
        saveBtn.title = (typeof _ === 'function') ? _('saveTooltip') || "Save changes" : "Save changes";
        saveBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof saveEditedNote === 'function') saveEditedNote();
        });

        // Add preview button
        const previewBtn = document.createElement('div');
        previewBtn.id = 'note-preview-btn';
        previewBtn.className = 'modal-footer-btn';
        previewBtn.innerHTML = eyeIconSvg;
        previewBtn.style.backgroundColor = '#4a90e2';
        previewBtn.title = (typeof _ === 'function') ? _('previewTooltip') || "Preview changes" : "Preview changes";
        previewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof previewEditedNote === 'function') previewEditedNote();
        });

        if (footerToolbar) {
            // We append them in order: Attach, Preview, Search (already exists, will move), Save
            const existingSearchBtn = document.getElementById('note-search-btn');
            footerToolbar.appendChild(attachBtn);
            footerToolbar.appendChild(previewBtn);
            if (existingSearchBtn) footerToolbar.appendChild(existingSearchBtn);
            footerToolbar.appendChild(saveBtn);
        } else if (modalContentBox) {
            const existingSearchBtn = document.getElementById('note-search-btn');
            modalContentBox.appendChild(attachBtn);
            modalContentBox.appendChild(previewBtn);
            if (existingSearchBtn) modalContentBox.appendChild(existingSearchBtn);
            modalContentBox.appendChild(saveBtn);
        }
    } else {
        // If buttons already exist, re-append them to ensure order: Attach, Preview, Search, Save
        const aBtn = document.getElementById('note-attach-btn');
        const sBtn = document.getElementById('note-save-btn');
        const pBtn = document.getElementById('note-preview-btn');
        const searchBtn = document.getElementById('note-search-btn');
        if (footerToolbar) {
            if (aBtn) footerToolbar.appendChild(aBtn);
            if (pBtn) footerToolbar.appendChild(pBtn);
            if (searchBtn) footerToolbar.appendChild(searchBtn);
            if (sBtn) footerToolbar.appendChild(sBtn);
        }
    }

    // Bind hidden attach input listener if not already bound
    const attachInput = document.getElementById('modal-attach-image-input');
    if (attachInput && !attachInput.hasAttribute('data-bound')) {
        attachInput.setAttribute('data-bound', 'true');
        attachInput.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (!files || files.length === 0) return;

            const mBodyEl = document.getElementById('modal-body');
            if (!mBodyEl) return;
            let mId = parseInt(mBodyEl.dataset.id, 10);
            if (!mId || isNaN(mId)) {
                // For new notes, ensure they have an ID
                noteId++;
                mId = noteId;
                noteNumord++;
                mBodyEl.dataset.id = mId;
            }
            const targetNoteId = mId;

            if (typeof showToast === 'function') {
                showToast((typeof _ === 'function' ? _('uploadingSharedImage') || '📤 Uploading files...' : '📤 Uploading files...'), 5000);
            }

            const folderId = await getFolderID();
            if (!folderId) {
                if (typeof showToast === 'function') showToast((typeof _ === 'function' ? _('noGDriveFolderError') || '❌ No Google Drive folder found.' : '❌ No Google Drive folder found.'), 3000);
                return;
            }

            // Process files sequentially in the background
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    const fileType = file.type.startsWith('video') ? 'Video' : (file.type.startsWith('audio') ? 'Sound' : 'Images');
                    let targetFolderId = folderIds[fileType] || localStorage.getItem(`gdrive_folder_id_${fileType}`);
                    if (!targetFolderId) {
                        targetFolderId = await createNewGDriveFolder(fileType, folderId);
                        if (targetFolderId) {
                            folderIds[fileType] = targetFolderId;
                            localStorage.setItem(`gdrive_folder_id_${fileType}`, targetFolderId);
                        }
                    }
                    if (!targetFolderId) throw new Error(`Could not get/create ${fileType} folder`);

                    const imageGdid = await uploadBlobToGDrive(targetFolderId, file.name, file, file.type);
                    if (!imageGdid) throw new Error(`File upload failed: ${file.name}`);

                    const waitForNoteGdid = () => {
                        return new Promise(resolve => {
                            const check = (attempts = 0) => {
                                const noteInData = allNotesData.find(n => String(n.id) === String(targetNoteId));
                                if (noteInData && noteInData.gdid && typeof noteInData.gdid === 'string' && noteInData.gdid.length > 10) {
                                    resolve(noteInData.gdid);
                                } else if (attempts < 3600) { // Up to 30 mins
                                    setTimeout(() => check(attempts + 1), 500);
                                } else {
                                    resolve(null);
                                }
                            };
                            check();
                        });
                    };
                    const noteGdid = await waitForNoteGdid();
                    if (!noteGdid) {
                        console.warn(`[Attachment] Note gdid not available after timeout for ${file.name}. Media entry NOT created.`);
                        if (typeof showToast === 'function') showToast((typeof _ === 'function' ? (_('attachLinkFailedMsg') || '⚠️ Uploaded {name}, but link failed.').replace('{name}', file.name) : `⚠️ Uploaded ${file.name}, but link failed.`), 7000);
                        continue;
                    }

                    const maxMediaId = mediaData.reduce((max, m) => Math.max(max, +(m.id || 0)), 0);
                    const mediaTypeNum = fileType === 'Images' ? 1 : (fileType === 'Sound' ? 2 : (fileType === 'Video' ? 4 : 5));
                    const now = Date.now();
                    const mediaEntry = {
                        datemod: now,
                        description: '',
                        gdid: '',
                        id: maxMediaId + 1,
                        noteid: noteGdid,
                        path: file.name,
                        pathGD: imageGdid,
                        type: mediaTypeNum
                    };

                    const mediaFileGdid = await createGDriveFile(folderId, 'media.txt', JSON.stringify(mediaEntry));
                    if (mediaFileGdid) {
                        mediaEntry.gdid = mediaFileGdid;
                        await updateGDriveFile(mediaFileGdid, JSON.stringify(mediaEntry));
                        mediaData.push(mediaEntry);
                        if (useIndexedDb) {
                            await bulkPutDB(MEDIA_STORE_NAME, [mediaEntry], true);
                        }
                        if (typeof refreshNoteUI === 'function') {
                            await refreshNoteUI(noteGdid);
                        } else {
                            renderNotes();
                        }
                        if (typeof showToast === 'function') showToast((typeof _ === 'function' ? (_('attachSuccessMsg') || '✅ Attached {name}').replace('{name}', file.name) : `✅ Attached ${file.name}`), 3000);
                    }
                } catch (e) {
                    console.error(`[Attachment] Error processing file ${file.name}:`, e);
                    if (typeof showToast === 'function') showToast((typeof _ === 'function' ? (_('attachErrorMsg') || '❌ Error: {msg}').replace('{msg}', e.message) : `❌ Error: ${e.message}`), 5000);
                }
            }

            attachInput.value = ''; // Reset input
        });
    }

    // Ensure state-specific visibility
    const saveBtn = document.getElementById('note-save-btn');
    const previewBtn = document.getElementById('note-preview-btn');
    const editBtn = document.getElementById('note-edit-btn');
    const moveBtn = document.getElementById('note-move-btn');

    if (saveBtn) { saveBtn.style.display = 'flex'; }
    if (previewBtn) { previewBtn.style.display = 'flex'; }
    const attachBtnForDisplay = document.getElementById('note-attach-btn');
    if (attachBtnForDisplay) { attachBtnForDisplay.style.display = 'flex'; }
    if (editBtn) editBtn.style.display = 'none';
    const isNewNote = modalBodyEl && modalBodyEl.dataset.isNewNote === 'true';
    if (moveBtn) moveBtn.style.display = isNewNote ? 'flex' : 'none';
    const duplicateBtn = document.getElementById('note-duplicate-btn');
    if (duplicateBtn) duplicateBtn.style.display = 'none';
    const calendarBtn = document.getElementById('note-calendar-btn');
    if (calendarBtn) calendarBtn.style.display = 'flex';
    const searchBtn = document.getElementById('note-search-btn');
    if (searchBtn) searchBtn.style.display = 'flex';
    const colorBtn = document.getElementById('modal-color-btn');
    if (colorBtn) colorBtn.style.display = 'flex';
    // Remove graphical background for edit mode
    if (modalContentBox) {
        modalContentBox.style.backgroundImage = 'none';
        modalContentBox.classList.add('no-bg-image');
    }
    if (modalBodyEl) modalBodyEl.classList.add('no-bg-image');
}

function placeCaretAtEnd(el) {
    el.focus();
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        const len = el.value.length;
        el.setSelectionRange(len, len);
    } else if (typeof window.getSelection != "undefined" && typeof document.createRange != "undefined") {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

document.addEventListener('click', (e) => {
    // Check for Ctrl key - Only then proceed with edit checks
    if (!e.ctrlKey) return;

    // Check for target is inside modal-body and NOT inside footer/header
    const modalBodyElem = document.getElementById('modal-body');
    if (!modalBodyElem || !modalBodyElem.contains(e.target)) return;

    // Explicitly ignore clicks on footer or copy button or any other elements appended to modalBody
    if (e.target.closest('.note-footer') || e.target.closest('.modal-note-footer') || e.target.closest('.code-block-copy')) return;

    // Check if Database mode is active OR if GDrive update is enabled
    const updateGDriveNow = useGoogleDb && !isOffline;
    const noteGdid = modalBodyElem.dataset.gdid;

    if (!useIndexedDb && !updateGDriveNow) {
        showToast("Editing requires Database Mode or active Google Drive synchronization.", 3000);
        return;
    }

    e.preventDefault();
    e.stopPropagation();

    enableNoteEditing(modalBodyElem);
}, true);

/* / --- Long Press for Editing (Mobile) ---
let editLongPressTimer;
let editLongPressTriggered = false;
document.addEventListener('touchstart', (e) => {
    const modalBodyElem = document.getElementById('modal-body');
    if (!modalBodyElem || !modalBodyElem.contains(e.target)) return;
    if (e.target.closest('.note-footer') || e.target.closest('.modal-note-footer') || e.target.closest('.code-block-copy')) return;
 
    const updateGDriveNow = useGoogleDb && !isOffline;
    const noteGdid = modalBodyElem.dataset.gdid;
 
    // If not editable, just return, don't start timer
    if (!useIndexedDb && !updateGDriveNow) return;
 
    editLongPressTriggered = false;
    editLongPressTimer = setTimeout(() => {
        editLongPressTriggered = true;
        enableNoteEditing(modalBodyElem);
        if (navigator.vibrate) navigator.vibrate(50);
        editLongPressTimer = null;
    }, 800);
}, { passive: true });
 
document.addEventListener('touchend', () => {
    if (editLongPressTimer) {
        clearTimeout(editLongPressTimer);
        editLongPressTimer = null;
    }
});
 
document.addEventListener('touchmove', () => {
    if (editLongPressTimer) {
        clearTimeout(editLongPressTimer);
        editLongPressTimer = null;
    }
});*/

document.addEventListener('contextmenu', (e) => {
    const modalBodyElem = document.getElementById('modal-body');
    if (modalBodyElem && modalBodyElem.contains(e.target) && !e.target.closest('.note-footer') && !e.target.closest('.modal-note-footer')) {
        // If textarea exists, we ALLOW context menu for copy/paste
        if (modalBodyElem.querySelector('textarea')) {
            // e.preventDefault(); // Removed to allow system context menu
        }
    }
});

// --- Three-way Merge & Conflict Resolution ---
async function fetchGDriveFileContent(fileId) {
    if (isOffline) return null;
    const tokenObj = (typeof authToken !== 'undefined' && authToken) ? authToken : (gapi.client.getToken() || gapi.auth.getToken());
    let accessToken = tokenObj ? tokenObj.access_token : null;
    if (!accessToken) throw new Error("Missing auth token.");
    try {
        // Force reading from server, not cache
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&t=${Date.now()}`, {
            headers: { 'Authorization': `Bearer ${accessToken}` },
            cache: 'no-store'
        });
        if (!response.ok) {
            if (response.status === 401) {
                const refreshed = await refreshAuthToken();
                if (refreshed && refreshed.pass) {
                    const retry = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                        headers: { 'Authorization': `Bearer ${refreshed.tokenData.access_token}` },
                        cache: 'no-store'
                    });
                    if (retry.ok) return await retry.text();
                }
            }
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
    } catch (e) { console.error("Fetch GDrive failed:", e); return null; }
}

function mergeField(base, local, server) {
    if (String(local) === String(server)) return local;
    if (String(local) === String(base)) return server;
    if (String(server) === String(base)) return local;
    return { conflict: true, local, server };
}

function mergeNotes(baseNote, localNote, serverNote) {
    const result = { ...localNote };
    const conflicts = {};
    const splitNote = (txt) => {
        const textStr = txt || "";
        const pIdx = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(textStr) : textStr.indexOf('|');
        if (pIdx !== -1) {
            return { title: textStr.substring(0, pIdx), body: textStr.substring(pIdx + 1), hasSplit: true };
        }
        return { title: textStr, body: "", hasSplit: false };
    };
    const b = splitNote(baseNote.notetxt), l = splitNote(localNote.notetxt), s = splitNote(serverNote.notetxt);
    if (l.hasSplit || s.hasSplit || b.hasSplit) {
        const mT = mergeField(b.title, l.title, s.title);
        const mB = mergeField(b.body, l.body, s.body);
        let fT = mT, fB = mB;
        if (mT && mT.conflict) { conflicts.title = mT; fT = "<<CONFLICT>>"; }
        if (mB && mB.conflict) { conflicts.body = mB; fB = "<<CONFLICT>>"; }
        result.notetxt = fT + '|' + fB;
    } else {
        const merged = mergeField(baseNote.notetxt, localNote.notetxt, serverNote.notetxt);
        if (merged && merged.conflict) { conflicts.notetxt = merged; result.notetxt = "<<CONFLICT>>"; }
        else result.notetxt = merged;
    }
    ['color', 'boardid', 'calendarDate', 'text_span', 'title_span', 'pass'].forEach(key => {
        if (String(localNote[key]) !== String(baseNote[key]) && String(serverNote[key]) !== String(baseNote[key])) {
            if (String(localNote[key]) !== String(serverNote[key])) conflicts[key] = { local: localNote[key], server: serverNote[key] };
        } else if (String(serverNote[key]) !== String(baseNote[key])) result[key] = serverNote[key];
    });
    return { result, conflicts };
}

async function showNoteConflictModal(unusedBase, localNote, serverNote, unusedConflicts) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.id = 'dual-conflict-overlay';
        Object.assign(overlay.style, { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', zIndex: 10000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' });

        const container = document.createElement('div');
        const sW = localStorage.getItem('modalWidth') || '400px';
        const sH = localStorage.getItem('modalHeight') || '300px';
        Object.assign(container.style, {
            position: 'relative',
            width: `min(${sW}, 95vw)`, // Използваме по-малкото от запазената ширина или 95% от ширината на екрана
            height: sH,
            display: 'flex', justifyContent: 'center', alignItems: 'center', perspective: '1000px'
        });

        const renderVersion = (note, zIndex) => {
            const card = document.createElement('div');
            card.className = 'modal-content-box';
            Object.assign(card.style, { position: 'absolute', width: '100%', height: '100%', zIndex: zIndex, transition: 'all 0.4s cubic-bezier(0.19, 1, 0.22, 1)', opacity: zIndex > 50 ? '1' : '0.4', transform: zIndex > 50 ? 'scale(1)' : 'scale(0.85) translateY(20px)', pointerEvents: zIndex > 50 ? 'auto' : 'none', margin: '0', display: 'flex', flexDirection: 'column' });

            // Background logic
            let bgColor = '#FBFF86';
            if (typeof note.color === 'number') {
                if (note.color >= 0 && note.color < noteColorMap.length) bgColor = noteColorMap[note.color];
                else if (note.color < 0) bgColor = colorIntToHex(note.color);
            } else if (typeof note.color === 'string') {
                bgColor = note.color;
            }
            card.style.backgroundColor = bgColor;
            if (localStorage.getItem('imgBgrd') !== 'false') card.style.backgroundImage = "url('Note.jpg')";

            // Header: Date only (standard look)
            const labelEl = document.createElement('div');
            labelEl.id = 'modal-board-name';
            labelEl.style.display = 'block'; labelEl.style.left = '15px'; labelEl.style.top = '10px';
            labelEl.innerHTML = `<span style="font-weight:normal; font-size:11px; opacity:0.6; color:#000;">${new Date(parseInt(note.datemod)).toLocaleString()}</span>`;
            card.appendChild(labelEl);

            const closeBtn = document.createElement('button');
            closeBtn.className = 'modal-close modal-header-btn';
            closeBtn.style.right = '10px'; closeBtn.onclick = () => { overlay.remove(); resolve(null); };
            card.appendChild(closeBtn);

            const bdy = document.createElement('div');
            bdy.className = 'modal-body'; bdy.style = 'padding:20px; margin-top:40px; overflow-y:auto; flex-grow:1; position:relative;';
            card.appendChild(bdy);

            // Action Buttons (Bottom Right)
            const createBtn = (id, icon, right, title) => {
                const btn = document.createElement('div');
                btn.innerHTML = icon; btn.title = title;
                Object.assign(btn.style, { position: 'absolute', bottom: '15px', right: right, width: '40px', height: '40px', backgroundColor: 'darkorange', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', boxShadow: '0 2px 5px rgba(0,0,0,0.3)', cursor: 'pointer', zIndex: 100 });
                card.appendChild(btn); return btn;
            };

            const btnEdit = createBtn('conf-edit', pencilIconSvg, '100px', 'Edit');
            const btnSave = createBtn('conf-save', diskIconSvg, '50px', 'Use this version');
            const btnEye = createBtn('conf-eye', eyeIconSvg, '100px', 'Preview');
            btnSave.style.display = 'flex'; btnEdit.style.display = 'flex'; btnEye.style.display = 'none';

            const refreshContent = (currentNote) => {
                // Apply to text and formatted element
                let txt = currentNote.notetxt || '';
                const hasPipe = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(txt) !== -1 : txt.includes('|');
                if (hasPipe) {
                    const pipeIdx = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(txt) : txt.indexOf('|');
                    const tPart = txt.substring(0, pipeIdx);
                    const bPart = txt.substring(pipeIdx + 1);
                    bdy.innerHTML = (typeof formatText === 'function') ? formatText(tPart, currentNote.title_span || '', true) + '<br>' + formatText(bPart, currentNote.text_span || '', true) : tPart + '<br>' + bPart;
                } else { bdy.innerHTML = (typeof formatText === 'function') ? formatText(txt, currentNote.text_span || '', true) : txt; }
                bdy.dataset.id = currentNote.id || '';
                bdy.dataset.gdid = currentNote.gdid || '';
                bdy.dataset.format = currentNote.text_span || ''; bdy.dataset.titleFormat = currentNote.title_span || '';
            };

            btnEdit.onclick = () => {
                // Remove the ID collision risk: don't use 'modal-body' here
                bdy.id = 'conflict-modal-body';
                // Instead of swapping global modalBody, provide it to enableNoteEditing as local param
                enableNoteEditing(bdy);
                btnEdit.style.display = 'none'; btnSave.style.right = '50px'; btnEye.style.display = 'flex';
            };

            btnEye.onclick = () => {
                const titleArea = bdy.querySelector('#note-edit-title-textarea');
                let txtArea = bdy.querySelector('#note-edit-textarea') || bdy.querySelector('textarea:not(#note-edit-title-textarea)');
                if (!titleArea) txtArea = bdy.querySelector('textarea');

                if (txtArea) {
                    const masked = bdy.dataset.maskedLinks ? JSON.parse(bdy.dataset.maskedLinks) : [];
                    const res = postEdit(txtArea.value, parseFormatsString(bdy.dataset.format), masked);
                    note.notetxt = res.text; note.text_span = stringifyFormatsArray(res.formats);
                    if (titleArea) {
                        const tRes = postEdit(titleArea.value, parseFormatsString(bdy.dataset.titleFormat), masked);
                        note.notetxt = tRes.text + '|' + res.text; note.title_span = stringifyFormatsArray(tRes.formats);
                    }
                }
                refreshContent(note);
                btnEdit.style.display = 'flex'; btnEye.style.display = 'none';
            };

            btnSave.onclick = async () => {
                const titleArea = bdy.querySelector('#note-edit-title-textarea');
                let txtArea = bdy.querySelector('#note-edit-textarea') || bdy.querySelector('textarea:not(#note-edit-title-textarea)');
                if (!titleArea) txtArea = bdy.querySelector('textarea');

                if (txtArea) {
                    const masked = bdy.dataset.maskedLinks ? JSON.parse(bdy.dataset.maskedLinks) : [];
                    const res = postEdit(txtArea.value, parseFormatsString(bdy.dataset.format), masked);
                    note.notetxt = res.text; note.text_span = stringifyFormatsArray(res.formats);
                    if (titleArea) {
                        const tRes = postEdit(titleArea.value, parseFormatsString(bdy.dataset.titleFormat), masked);
                        note.notetxt = tRes.text + '|' + res.text; note.title_span = stringifyFormatsArray(tRes.formats);
                    }
                }
                note.datemod = Date.now();

                // --- KEY FIX: Update the main modal if it's open for this note ---
                const mainModalBody = document.getElementById('modal-body');
                const mainGdid = mainModalBody?.dataset.gdid;
                if (mainModalBody && mainGdid && String(mainGdid) === String(note.gdid)) {
                    console.log("[Sync] Updating main modal with resolved version.");
                    // Update the original modal's object if it has one
                    if (typeof modalNoteObj !== 'undefined' && modalNoteObj) {
                        Object.assign(modalNoteObj, note);
                    }
                    // Refresh the main modal UI
                    if (typeof refreshModalContent === 'function') {
                        refreshModalContent(note);
                    } else {
                        // Fallback: manually update textareas in main modal if they exist
                        const mainTextArea = mainModalBody.querySelector('textarea:not(#note-edit-title-textarea)');
                        const mainTitleArea = mainModalBody.querySelector('#note-edit-title-textarea');
                        if (mainTextArea) mainTextArea.value = (note.notetxt.includes('|') ? note.notetxt.split('|')[1] : note.notetxt);
                        if (mainTitleArea && note.notetxt.includes('|')) mainTitleArea.value = note.notetxt.split('|')[0];
                    }
                }

                overlay.remove(); resolve(note);
            };

            refreshContent(note);
            return { card, bdy };
        };

        const local = renderVersion(localNote, 60);
        const server = renderVersion(serverNote, 40);
        container.appendChild(server.card); container.appendChild(local.card);

        // Tab-like buttons
        const tabs = document.createElement('div');
        Object.assign(tabs.style, { position: 'absolute', bottom: '-65px', display: 'flex', gap: '5px', zIndex: 5 });
        const createTab = (txt, active) => {
            const t = document.createElement('button');
            t.textContent = txt;
            t.style = `padding:8px 20px; border:none; border-radius:0 0 10px 10px; cursor:pointer; font-weight:bold; background:${active ? 'darkorange' : '#444'}; color:${active ? '#000' : '#fff'}; transition: 0.3s;`;
            return t;
        };
        const tabL = createTab('ЛОКАЛНА (DB)', true);
        const tabS = createTab('СЪРВЪР (GD)', false);

        const switchView = (isLocal) => {
            local.card.style.zIndex = isLocal ? 60 : 40; local.card.style.opacity = isLocal ? '1' : '0.4'; local.card.style.transform = isLocal ? 'scale(1)' : 'scale(0.85) translateY(20px)'; local.card.style.pointerEvents = isLocal ? 'auto' : 'none';
            server.card.style.zIndex = isLocal ? 40 : 60; server.card.style.opacity = isLocal ? '0.4' : '1'; server.card.style.transform = isLocal ? 'scale(0.85) translateY(20px)' : 'scale(1)'; server.card.style.pointerEvents = isLocal ? 'none' : 'auto';
            tabL.style.background = isLocal ? 'darkorange' : '#444'; tabL.style.color = isLocal ? '#000' : '#fff';
            tabS.style.background = isLocal ? '#444' : 'darkorange'; tabS.style.color = isLocal ? '#fff' : '#000';

            // Safe ID management: only one element should have 'modal-body' at any time
            if (isLocal) {
                server.bdy.id = '';
                local.bdy.id = 'modal-body';
            } else {
                local.bdy.id = '';
                server.bdy.id = 'modal-body';
            }
        };

        tabL.onclick = () => switchView(true);
        tabS.onclick = () => switchView(false);
        tabs.appendChild(tabL); tabs.appendChild(tabS);
        container.appendChild(tabs);
        overlay.appendChild(container);
        document.body.appendChild(overlay);
        switchView(true);
    });
}

/**
 * Разрешава конфликти при начално зареждане (дублирани gdid в Google Drive).
 * @param {Array} duplicates - Списък от двойки {localNote, serverNote}
 */
async function resolveLoadedConflicts(duplicates) {
    if (!duplicates || duplicates.length === 0) return;
    const loader = document.getElementById('loader-screen');
    const wasVisible = loader && loader.style.display !== 'none';
    if (wasVisible) loader.style.display = 'none';

    for (const pair of duplicates) {
        // Показваме модала за сливане
        const resolved = await showNoteConflictModal(null, pair.localNote, pair.serverNote, {});
        if (resolved) {
            const gdid = resolved.gdid || resolved.id;
            const idx = allNotesData.findIndex(n => (n.gdid || n.id).toString() === gdid.toString());
            if (idx !== -1) allNotesData[idx] = resolved;

            // Ако вече имаме локална база данни, обновяваме я веднага
            if (useIndexedDb && dbExists) {
                await bulkPutDB(NOTE_STORE_NAME, [resolved], true);
            }
        }
    }

    if (wasVisible && loader) loader.style.display = 'flex';
}

async function checkUnsavedChanges(isClosingModal = true) {
    const modalBodyElem = document.getElementById('modal-body');
    if (!modalBodyElem) return true;
    const textarea = document.getElementById('note-edit-textarea');
    const titleTextarea = document.getElementById('note-edit-title-textarea');
    const saveBtn = document.getElementById('note-save-btn');
    const isEditingOrPreviewing = (textarea || titleTextarea) || (saveBtn && saveBtn.style.display !== 'none');
    if (!isEditingOrPreviewing) return true;
    const isNewNote = modalBodyElem.dataset.isNewNote === 'true';
    const newBodyTextRaw = textarea ? textarea.value : (modalBodyElem.dataset.draftText || "");
    const newTitleTextRaw = titleTextarea ? titleTextarea.value : (modalBodyElem.dataset.draftTitle || "");
    if (isNewNote) {
        const isNewNoteWithContent = (newBodyTextRaw.trim() !== "" || newTitleTextRaw.trim() !== "");
        if (!isNewNoteWithContent) return true;
    } else {
        const noteGdid = modalBodyElem.dataset.gdid;
        const noteId = modalBodyElem.dataset.id;
        const noteObj = allNotesData.find(n => (n.gdid && String(n.gdid) === String(noteGdid)) || (n.id && String(n.id) === String(noteId)));
        if (!noteObj) return true;
        const formatStr = modalBodyElem.dataset.format || "";
        const titleFormatStr = modalBodyElem.dataset.titleFormat || "";
        const maskedLinks = modalBodyElem.dataset.maskedLinks ? JSON.parse(modalBodyElem.dataset.maskedLinks) : [];
        const isHiddenNote = noteObj.pass === true;
        let processedText = newBodyTextRaw;
        let finalFormat = formatStr;
        let finalTitleFormat = titleFormatStr;
        if ((isHiddenNote || (titleTextarea && newTitleTextRaw !== "") || (modalBodyElem.dataset.draftTitle && modalBodyElem.dataset.draftTitle !== "")) && (titleTextarea || modalBodyElem.dataset.draftTitle)) {
            const titleRes = postEdit(newTitleTextRaw, parseFormatsString(titleFormatStr), maskedLinks);
            finalTitleFormat = stringifyFormatsArray(titleRes.formats);
            const bodyRes = postEdit(newBodyTextRaw, parseFormatsString(formatStr), maskedLinks);
            finalFormat = stringifyFormatsArray(bodyRes.formats);
            processedText = titleRes.text + '|' + bodyRes.text;
        } else {
            const res = postEdit(newBodyTextRaw, parseFormatsString(formatStr), maskedLinks);
            processedText = res.text;
            finalFormat = stringifyFormatsArray(res.formats);
        }
        const originalContent = noteObj.notetxt || "";
        const originalFormat = noteObj.text_span || "";
        const originalTitleFormat = noteObj.title_span || "";
        const initialColor = (noteObj.color !== undefined) ? noteObj.color : 0;
        let currentColor = initialColor;
        if (modalBodyElem.dataset.colorIndex !== undefined) {
            currentColor = parseInt(modalBodyElem.dataset.colorIndex, 10);
        } else if (modalBodyElem.dataset.color !== undefined && modalBodyElem.dataset.color !== '') {
            currentColor = modalBodyElem.dataset.color;
        }
        const hasTextChanged = processedText !== originalContent;
        const hasFormatChanged = finalFormat !== originalFormat || finalTitleFormat !== originalTitleFormat;
        const hasColorChanged = currentColor !== initialColor;
        if (!hasTextChanged && !hasFormatChanged && !hasColorChanged) return true;
    }
    const confirmed = await showConfirmation(_('confirmSaveChanges') || "Save changes?");
    if (confirmed) {
        await saveEditedNote(true);
        return false;
    } else {
        return true;
    }
}

// Unified Save Logic
function saveEditedNote(forceClose = false) {
    const modalBodyElem = document.getElementById('modal-body');
    if (!modalBodyElem) return;
    const closeAfterSave = forceClose || (localStorage.getItem('closeAfterSave') === 'true');
    if (closeAfterSave) {
        const contentModal = document.getElementById('content-modal');
        if (contentModal) contentModal.classList.remove('visible');
    }
    showToast(_('savingChanges') || 'Saving changes...', 2000);
    // --- The rest of the function now runs in the background ---
    (async () => {
        const textarea = document.getElementById('note-edit-textarea');
        const titleTextarea = document.getElementById('note-edit-title-textarea');
        if (!textarea && !modalBodyElem.dataset.draftText) return;

        let updateGDriveNow = useGoogleDb && !isOffline;
        const updateLocalFolderNow = (localStorage.getItem('updateLocalFolder') === 'true') && !isOffline;
        const useIndexedDbNow = localStorage.getItem('useIndexedDb') !== 'false';

        // Check if it's a new note (deferred creation)
        let modalGdid = modalBodyElem.dataset.gdid;
        let modalId = parseInt(modalBodyElem.dataset.id, 10);
        let noteNumordValue = parseInt(modalBodyElem.dataset.numord, 10);
        const modalNoteObj = allNotesData.find(n => (n.gdid && String(n.gdid) === String(modalGdid)) || (n.id && String(n.id) === String(modalId)));

        // 1. Get content and format
        const newText = textarea ? textarea.value : modalBodyElem.dataset.draftText;
        const titleText = titleTextarea ? titleTextarea.value : (modalBodyElem.dataset.draftTitle || "");
        const formatStr = modalBodyElem.dataset.format || "";
        const titleFormatStr = modalBodyElem.dataset.titleFormat || "";

        if (!closeAfterSave) {
            disableNoteEditing(modalBodyElem);
        }

        if (newText === undefined) return;

        const isHiddenNote = modalNoteObj && modalNoteObj.pass === true;
        const isNewNote = !modalNoteObj && !modalGdid;

        // Retrieve masked links from dataset if they exist
        const maskedLinks = modalBodyElem.dataset.maskedLinks ? JSON.parse(modalBodyElem.dataset.maskedLinks) : [];

        let processedText, finalFormat, finalTitleFormat;
        if ((isHiddenNote || (titleTextarea && titleText !== "")) && titleTextarea) {
            // Handle hidden note OR normal note with split content
            const titleRes = postEdit(titleText, parseFormatsString(titleFormatStr), maskedLinks);
            finalTitleFormat = stringifyFormatsArray(titleRes.formats);
            const bodyRes = postEdit(newText, parseFormatsString(formatStr), maskedLinks);
            finalFormat = stringifyFormatsArray(bodyRes.formats);
            processedText = titleRes.text + '|' + bodyRes.text;
        } else {
            // Standard note
            const res = postEdit(newText, parseFormatsString(formatStr), maskedLinks);
            processedText = res.text;
            finalFormat = stringifyFormatsArray(res.formats);
        }

        // Показваме форматирания текст ВЕДНАГА - не чакаме края на GDrive записа
        if (!closeAfterSave && typeof showModal === 'function') {
            const boardId = modalBodyElem.dataset.boardId || (modalNoteObj && modalNoteObj.boardid) || currentBoardFilter;
            const colorVal = modalBodyElem.dataset.colorIndex !== undefined ? parseInt(modalBodyElem.dataset.colorIndex, 10) : (modalNoteObj ? modalNoteObj.color : 0);
            const noteColorStr = (typeof colorVal === 'number' && colorVal >= 0 && colorVal < noteColorMap.length) ? noteColorMap[colorVal] : (typeof colorVal === 'string' ? colorVal : noteColorMap[0]);
            const currentModalBodyElem = document.getElementById('modal-body');
            const previewDatasets = currentModalBodyElem ? { ...currentModalBodyElem.dataset } : {};
            showModal({
                raw: processedText,
                format: finalFormat,
                titleFormat: finalTitleFormat,
                color: noteColorStr,
                boardId: boardId,
                id: modalId,
                gdid: modalGdid,
                maskedLinks: maskedLinks,
                datemod: modalNoteObj ? modalNoteObj.datemod : undefined
            }, modalNoteObj ? (document.querySelector(`.note[data-g="${modalNoteObj.gdid}"]`) || document.querySelector(`.note[data-i="${modalNoteObj.id}"]`)) : null);
            // Запазваме dataset-а за saveEditedNote (може да е нужен след preview)
            const newMbe = document.getElementById('modal-body');
            if (newMbe) {
                Object.keys(previewDatasets).forEach(k => { newMbe.dataset[k] = previewDatasets[k]; });
            }
        }


        if (isNewNote) {
            // --- Handle Creation of New Note ---
            const boardId = modalBodyElem.dataset.boardId || currentBoardFilter;
            // Generate new ID/GDID if missing
            if (!modalId || isNaN(modalId)) {
                noteId++;
                modalId = noteId;
                noteNumord++;
            }

            const dateMod = Date.now();

            // Define new note object
            const newNote = {
                "alarm_type": -1,
                "boardid": boardId,
                "calendarDate": 0,
                "color": modalBodyElem.dataset.colorIndex ? parseInt(modalBodyElem.dataset.colorIndex, 10) : 0,
                "date": dateMod,
                "datemod": dateMod,
                "eventId": 0,
                "gdid": String(modalId), // Use ID as temporary key to prevent empty key errors
                "id": modalId,
                "notetxt": processedText,
                "numord": (!isNaN(noteNumordValue) ? noteNumordValue : noteNumord),
                "pass": isHiddenNote, // Use the state from modalNoteObj if available, or false
                "pinnedAt": 0,
                "sellist": 0,
                "status": 0,
                "text_span": finalFormat,
                "title_span": finalTitleFormat,
                "timer": 0,
                "timer_type": -1,
                "timer_val": 1,
                "type": 0,
                "version": 243
            };

            // Add to Global Data (with duplicate check)
            const existingIdx = allNotesData.findIndex(n => (n.id && String(n.id) === String(newNote.id)));
            if (existingIdx !== -1) {
                allNotesData[existingIdx] = newNote;
            } else {
                allNotesData.push(newNote);
            }

            // Create DOM Element
            const newEl = await createNoteElement(newNote);
            if (newEl) {
                // Check if element already exists (e.g. from a parallel call)
                const oldEl = document.querySelector(`.note[data-i="${newNote.id}"]`);
                if (oldEl) {
                    oldEl.replaceWith(newEl);
                } else {
                    notesContainer.prepend(newEl);
                }
                // Update dataset for subsequent saves
                modalBodyElem.dataset.id = newNote.id;
                modalBodyElem.dataset.gdid = newNote.gdid;
            }

            // Update Board Counter
            if (typeof updateBoardCounterUI === 'function') {
                updateBoardCounterUI(boardId);
                updateBoardCounterUI('reminder');
            }
        }

        const dateMod = Date.now();
        // 2. Update local data model (for existing notes)
        let noteObj = allNotesData.find(n => (n.gdid && String(n.gdid) === String(modalGdid)) || (n.id && String(n.id) === String(modalId)));

        if (!noteObj && !isNewNote) {
            console.error("Note object not found for saving.");
            return;
        }
        const originalContent = noteObj ? (noteObj.notetxt || "") : "";
        let newCalendarDate = modalBodyElem.dataset.calendarDate ? parseInt(modalBodyElem.dataset.calendarDate, 10) : (noteObj ? (noteObj.calendarDate || 0) : 0);
        let newColorIdx = modalBodyElem.dataset.colorIndex ? parseInt(modalBodyElem.dataset.colorIndex, 10) : -1;
        let newColor;
        if (newColorIdx >= 0 && newColorIdx <= 9) {
            newColor = newColorIdx;
        } else if (newColorIdx >= 10 && newColorIdx <= 15) {
            // Записваме като десетично число за индекси 10-15
            newColor = hexToColorInt(modalBodyElem.dataset.color || noteColorMap[newColorIdx]);
        } else {
            // Fallback за потребителски цветове или запазване на текущия
            const colorVal = modalBodyElem.dataset.color;
            if (colorVal && typeof colorVal === 'string' && colorVal.startsWith('#')) {
                newColor = hexToColorInt(colorVal);
            } else {
                newColor = noteObj ? (noteObj.color || 0) : 0;
            }
        }

        // --- Conflict Resolution Logic ---
        if (updateGDriveNow && modalGdid && noteObj) {

            try {
                const serverRaw = await fetchGDriveFileContent(modalGdid);

                if (serverRaw) {
                    const sData = JSON.parse(serverRaw);
                    const sNote = Array.isArray(sData) ? sData[0] : sData;
                    const baseDatemod = parseInt(modalBodyElem.dataset.baseDatemod, 10) || 0;
                    const baseNoteStr = modalBodyElem.dataset.baseNote;
                    const baseNote = baseNoteStr ? JSON.parse(baseNoteStr) : noteObj;

                    let dbNote = null;
                    if (useIndexedDb) {
                        try { dbNote = await getFromDB(NOTE_STORE_NAME, modalGdid || modalId); } catch (e) { }
                    }


                    if (sNote && sNote.datemod > baseDatemod) {
                        const lNote = { ...noteObj, notetxt: processedText, text_span: finalFormat, title_span: finalTitleFormat, color: newColor, calendarDate: newCalendarDate };
                        const { result, conflicts } = mergeNotes(baseNote, lNote, sNote);
                        if (Object.keys(conflicts).length > 0) {
                            const resolved = await showNoteConflictModal(baseNote, lNote, sNote, conflicts);
                            if (!resolved) { return; } // User cancelled
                            processedText = resolved.notetxt;
                            finalFormat = resolved.text_span;
                            finalTitleFormat = resolved.title_span;
                            newColor = resolved.color;
                            newCalendarDate = resolved.calendarDate;
                        } else {
                            processedText = result.notetxt;
                            finalFormat = result.text_span;
                            finalTitleFormat = result.title_span;
                            newColor = result.color;
                            newCalendarDate = result.calendarDate;
                        }
                    }
                }
            } catch (e) { console.error("Conflict check failed:", e); }
        }

        // Check for changes (comparing processed versions to avoid repeated postEdit if nothing changed)
        const hasDrafts = !!modalBodyElem.dataset.draftText;
        const hasChanges = isNewNote || hasDrafts || (processedText !== originalContent || finalFormat !== (noteObj?.text_span || "") || finalTitleFormat !== (noteObj?.title_span || "") || newCalendarDate !== noteObj?.calendarDate || newColor !== noteObj?.color);

        if (hasChanges) {
            // --- Apply Changes ---
            if (noteObj.version) noteObj.version = parseInt(noteObj.version, 10) + 1;
            else noteObj.version = 1;

            noteObj.notetxt = processedText;
            noteObj.color = newColor;
            noteObj.text_span = finalFormat;
            noteObj.title_span = finalTitleFormat;
            const oldCalendarDate = noteObj.calendarDate || 0;
            noteObj.calendarDate = newCalendarDate;

            // --- Sync with timer ---
            if (automatedTimer) {
                if (newCalendarDate > 0) {
                    noteObj.timer = newCalendarDate + 33000;
                } else if (newCalendarDate === 0 && oldCalendarDate > 0) {
                    if (noteObj.timer === oldCalendarDate || noteObj.timer === oldCalendarDate + 33000) {
                        noteObj.timer = 0;
                    }
                }
            }

            noteObj.datemod = dateMod;

            // --- Update UI (DOM Note) ---
            const noteEl = document.querySelector(`.note[data-g="${noteObj.gdid}"]`) || document.querySelector(`.note[data-i="${noteObj.id}"]`);
            if (noteEl) {
                const updatedEl = await createNoteElement(noteObj);
                if (updatedEl) noteEl.replaceWith(updatedEl);
            }

            // --- Update Board Counter ---
            if (typeof updateBoardCounterUI === 'function') {
                updateBoardCounterUI(noteObj.boardid);
                updateBoardCounterUI('reminder');
            }

            // --- Save to Source (GDrive / Local / DB) ---
            if (updateGDriveNow) {
                const isTempGdid = !noteObj.gdid || String(noteObj.gdid) === String(noteObj.id);
                if (isTempGdid) {
                    const folderId = await getFolderID();
                    if (folderId) {
                        const fileContent = JSON.stringify(noteObj);
                        const fileName = 'note.txt'; // @@ 
                        try {
                            const tempGdid = noteObj.gdid;
                            const newGdid = await createGDriveFile(folderId, fileName, fileContent);
                            if (!newGdid) throw new Error("Failed to create GDrive file");
                            noteObj.gdid = newGdid;
                            modalBodyElem.dataset.gdid = newGdid;
                            // Update the DOM element on the board so subsequent clicks/actions use the real ID
                            const noteEl = document.querySelector(`.note[data-i="${noteObj.id}"]`);
                            if (noteEl) noteEl.dataset.g = newGdid;
                            // Synchronize internal GDrive ID inside the file content
                            await updateGDriveFile(newGdid, JSON.stringify(noteObj));

                            if (useIndexedDb) {
                                await bulkPutDB(NOTE_STORE_NAME, noteObj, true);
                                if (tempGdid && tempGdid !== newGdid) await deleteFromDB(NOTE_STORE_NAME, tempGdid);
                            }

                        } catch (e) {
                            console.error("Failed to create GDrive file", e);
                            showToast(_('errorSaveGDrive'));
                        }
                    }
                } else {
                    try {
                        const success = await updateGDriveFile(noteObj.gdid, JSON.stringify(noteObj));
                        if (!success) throw new Error("GDrive update returned false");
                    } catch (e) {
                        console.error("Failed to update GDrive file", e);
                        showToast(`${_('errorSaveGDrive')} for GD: ${noteObj.gdid}. ${e.message}`, 10000);
                        updateGDriveNow = false; // Маркираме като неуспешно за финалното съобщение
                    }
                }
            }

            if (useLocalFolder) {
                try {
                    // Ако бележката е нова и няма gdid (или е временен id), генерираме локален такъв
                    const isTempGdid = !noteObj.gdid || String(noteObj.gdid) === String(noteObj.id);
                    if (isTempGdid && !updateGDriveNow) {
                        noteObj.gdid = `L${Date.now()}`;
                        modalBodyElem.dataset.gdid = noteObj.gdid;
                    }
                    if (noteObj.gdid) {
                        await updateLocalFile(noteObj.gdid, JSON.stringify(noteObj));
                    }
                } catch (e) {
                    console.error("Failed to update local file", e);
                    showToast(_('errorSaveLocalFolder') || "Грешка при запис в локалната папка");
                }
            }
            if (updateGDriveNow) {
                noteObj.type = 0;
            } else if (useIndexedDbNow) {
                noteObj.type = -1; // Маркираме за офлайн синхронизация
            }
            if (useIndexedDbNow) await bulkPutDB(NOTE_STORE_NAME, noteObj, true);

            const board = boardsData.find(b => String(b.gdid) === String(noteObj.boardid) || String(b.id) === String(noteObj.boardid));
            const boardTitle = board ? board.title : (_(noteObj.boardid) || noteObj.boardid);

            let msgKey = '';
            if (useIndexedDbNow && updateGDriveNow && updateLocalFolderNow) msgKey = 'noteSavedInAll'; // БД, GD и локална папка
            else if (useIndexedDbNow && updateGDriveNow) msgKey = 'noteSavedInBoth'; // БД и GD
            else if (useIndexedDbNow && updateLocalFolderNow) msgKey = 'noteSavedInLocal'; // БД и локална папка
            else if (useIndexedDbNow) msgKey = 'noteSavedInDb'; // БД
            else {
                // Само външни източници без БД (режим без кеширане)
                if (updateGDriveNow && updateLocalFolderNow) msgKey = 'noteSavedInGDAndLocal';
                else if (updateGDriveNow) msgKey = 'noteSavedInGD';
                else if (updateLocalFolderNow) msgKey = 'noteSavedInLocalOnly';
                else msgKey = 'noteSavedInBoard';
            }

            showToast(_(msgKey).replace('{boardName}', boardTitle));
            updateReloadButtonState();
        }

        // If modal was not closed, refresh its content to show the saved state
        if (!closeAfterSave) {
            if (typeof showModal === 'function' && noteObj) {
                const noteColorStr = (typeof noteObj.color === 'number')
                    ? (noteObj.color >= 0 && noteObj.color < noteColorMap.length ? noteColorMap[noteObj.color] : (noteObj.color < 0 ? colorIntToHex(noteObj.color) : noteColorMap[0]))
                    : (typeof noteObj.color === 'string' ? noteObj.color : noteColorMap[0]);
                showModal({
                    raw: noteObj.notetxt,
                    format: noteObj.text_span,
                    titleFormat: noteObj.title_span,
                    color: noteColorStr,
                    boardId: noteObj.boardid,
                    id: noteObj.id,
                    gdid: noteObj.gdid,
                    datemod: noteObj.datemod,
                    originalNote: noteObj
                }, document.querySelector(`.note[data-g="${noteObj.gdid}"]`) || document.querySelector(`.note[data-i="${noteObj.id}"]`));
            }
        }

        const weekCal = document.getElementById('weekly-calendar-container');
        const isWeeklyView = weekCal && weekCal.style.display !== 'none';
        const monthCal = document.getElementById('calendar-container');
        if (isWeeklyView) {
            if (typeof renderWeeklyCalendarView === 'function') renderWeeklyCalendarView(currentWeeklyViewDate);
        } else if (monthCal && monthCal.style.display !== 'none') {
            if (typeof renderCalendarView === 'function') renderCalendarView();
        } else {
            applyFilters();
        }
        if (isNewNote) {
            syncFolderDataAsync();
        }
    })(); // End of async background function
}

async function updateNoteCalendarDate(noteRef, selectedDate) {
    const noteObj = allNotesData.find(n => (n.gdid && String(n.gdid) === String(noteRef.gdid)) || (n.id && String(n.id) === String(noteRef.id)));
    if (!noteObj) return;
    const oldCalendarDate = noteObj.calendarDate || 0;
    const newCalendarDate = selectedDate.getTime();
    noteObj.calendarDate = newCalendarDate;

    // --- Sync with timer ---
    if (automatedTimer) {
        if (newCalendarDate > 0) {
            noteObj.timer = newCalendarDate + 33000;
        } else if (newCalendarDate === 0 && oldCalendarDate > 0) {
            if (noteObj.timer === oldCalendarDate || noteObj.timer === oldCalendarDate + 33000) {
                noteObj.timer = 0;
            }
        }
    }

    noteObj.datemod = Date.now();
    // Update UI (DOM Note)
    const noteEl = document.querySelector(`.note[data-g="${noteObj.gdid}"]`) || document.querySelector(`.note[data-i="${noteObj.id}"]`);
    if (noteEl) {
        const updatedEl = await createNoteElement(noteObj);
        if (updatedEl) noteEl.replaceWith(updatedEl);
    }
    // Save to Source
    const updateGDriveNow = useGoogleDb && !isOffline;
    const updateLocalFolderNow = localStorage.getItem('updateLocalFolder') === 'true';

    if (updateGDriveNow) {
        const isTempGdid = !noteObj.gdid || String(noteObj.gdid) === String(noteObj.id);
        if (isTempGdid) {
            const folderId = await getFolderID();
            if (folderId) {
                const fileContent = JSON.stringify(noteObj);
                const fileName = 'note.txt';
                try {
                    const newGdid = await createGDriveFile(folderId, fileName, fileContent);
                    if (newGdid) {
                        const oldGdid = noteObj.gdid;
                        noteObj.gdid = newGdid;
                        if (useIndexedDb) {
                            await bulkPutDB(NOTE_STORE_NAME, [noteObj], true);
                            if (oldGdid && oldGdid !== newGdid) await deleteFromDB(NOTE_STORE_NAME, oldGdid);
                        }
                    }
                } catch (e) {
                    console.error("Failed to create GDrive file in calendar update", e);
                }
            }
        } else {
            try {
                await updateGDriveFile(noteObj.gdid, JSON.stringify(noteObj));
            } catch (e) {
                console.error("Failed to update GDrive file in calendar update", e);
            }
        }
    }

    if (updateLocalFolderNow) {
        try {
            const isTempGdid = !noteObj.gdid || String(noteObj.gdid) === String(noteObj.id);
            if (isTempGdid && !updateGDriveNow) {
                noteObj.gdid = `L${Date.now()}`;
            }
            if (noteObj.gdid) {
                await updateLocalFile(noteObj.gdid, JSON.stringify(noteObj));
            }
        } catch (e) {
            console.error("Failed to update local file in calendar update", e);
        }
    }
    if (useIndexedDb) await bulkPutDB(NOTE_STORE_NAME, [noteObj], true);
    if (typeof updateBoardCounterUI === 'function') {
        updateBoardCounterUI(noteObj.boardid);
        updateBoardCounterUI('reminder');
    }
    const board = boardsData.find(b => String(b.gdid) === String(noteObj.boardid) || String(b.id) === String(noteObj.boardid));
    const boardTitle = board ? board.title : (_(noteObj.boardid) || noteObj.boardid);

    let msgKey = 'noteSavedInDb';
    if (updateGDriveNow && updateLocalFolderNow) msgKey = 'noteSavedInAll';
    else if (updateGDriveNow) msgKey = 'noteSavedInBoth';
    else if (updateLocalFolderNow) msgKey = 'noteSavedInLocal';

    showToast(_(msgKey).replace('{boardName}', boardTitle));

    const monthCal = document.getElementById('calendar-container');
    const weekCal = document.getElementById('weekly-calendar-container');
    const isWeeklyView = weekCal && weekCal.style.display !== 'none';
    if (isWeeklyView) {
        if (newCalendarDate === 0) {
            const contentModal = document.getElementById('content-modal');
            if (contentModal) contentModal.classList.remove('visible');
        }
        if (typeof renderWeeklyCalendarView === 'function') renderWeeklyCalendarView(currentWeeklyViewDate);
    } else if (monthCal && monthCal.style.display !== 'none') {
        if (typeof renderCalendarView === 'function') renderCalendarView();
    } else {
        applyFilters();
    }
}

// Unified Preview Logic
function previewEditedNote() {
    const modalBodyElem = document.getElementById('modal-body');
    const textarea = document.getElementById('note-edit-textarea');
    const titleTextarea = document.getElementById('note-edit-title-textarea');
    if (!modalBodyElem || !textarea) return;

    const newText = textarea.value;
    const titleText = titleTextarea ? titleTextarea.value : "";
    const formatStr = modalBodyElem.dataset.format || "";
    const titleFormatStr = modalBodyElem.dataset.titleFormat || "";

    let noteGdid = modalBodyElem.dataset.gdid;
    let noteId = parseInt(modalBodyElem.dataset.id, 10);
    const modalNoteObj = allNotesData.find(n => (n.gdid && String(n.gdid) === String(noteGdid)) || (n.id && String(n.id) === String(noteId)));
    const isHiddenNote = modalNoteObj && modalNoteObj.pass === true;

    let processedText = newText;
    let finalFormat = formatStr;
    let finalTitleFormat = titleFormatStr;

    // Store drafts for saveEditedNote to work without textarea
    modalBodyElem.dataset.draftText = newText;
    modalBodyElem.dataset.draftTitle = titleText;

    // Retrieve masked links
    const maskedLinks = modalBodyElem.dataset.maskedLinks ? JSON.parse(modalBodyElem.dataset.maskedLinks) : [];

    if ((isHiddenNote || (titleTextarea && titleText !== "")) && titleTextarea) {
        const titleRes = postEdit(titleText, parseFormatsString(titleFormatStr), maskedLinks);
        finalTitleFormat = stringifyFormatsArray(titleRes.formats);
        const bodyRes = postEdit(newText, parseFormatsString(formatStr), maskedLinks);
        finalFormat = stringifyFormatsArray(bodyRes.formats);
        processedText = titleRes.text + '|' + bodyRes.text;
    } else {
        const res = postEdit(newText, parseFormatsString(formatStr), maskedLinks);
        processedText = res.text;
        finalFormat = stringifyFormatsArray(res.formats);
    }

    if (typeof showModal === 'function') {
        const boardId = modalNoteObj ? modalNoteObj.boardid : (modalBodyElem.dataset.boardId || currentBoardFilter);
        const color = (modalNoteObj && modalNoteObj.color !== undefined) ? modalNoteObj.color : (modalBodyElem.dataset.color || 0);
        const noteColorStr = (typeof color === 'number' && color >= 0 && color < noteColorMap.length) ? noteColorMap[color] : (typeof color === 'string' ? color : noteColorMap[0]);

        showModal({
            raw: processedText,
            format: finalFormat,
            titleFormat: finalTitleFormat,
            color: noteColorStr,
            boardId: boardId,
            id: noteId,
            gdid: noteGdid,
            maskedLinks: maskedLinks
        }, modalNoteObj ? (document.querySelector(`.note[data-g="${modalNoteObj.gdid}"]`) || document.querySelector(`.note[data-i="${modalNoteObj.id}"]`)) : null);

        // Preserve editing dataset state on the new modalBodyElem for saveEditedNote to work after preview
        const newModalBodyElem = document.getElementById('modal-body');
        if (newModalBodyElem) {
            newModalBodyElem.dataset.draftText = newText;
            newModalBodyElem.dataset.draftTitle = titleText;
            if (modalBodyElem.dataset.initialEditText !== undefined) newModalBodyElem.dataset.initialEditText = modalBodyElem.dataset.initialEditText;
            if (modalBodyElem.dataset.initialEditTitleText !== undefined) newModalBodyElem.dataset.initialEditTitleText = modalBodyElem.dataset.initialEditTitleText;
            if (modalBodyElem.dataset.initialFormat !== undefined) newModalBodyElem.dataset.initialFormat = modalBodyElem.dataset.initialFormat;
            if (modalBodyElem.dataset.initialTitleFormat !== undefined) newModalBodyElem.dataset.initialTitleFormat = modalBodyElem.dataset.initialTitleFormat;
            if (modalBodyElem.dataset.initialColorIndex !== undefined) newModalBodyElem.dataset.initialColorIndex = modalBodyElem.dataset.initialColorIndex;
            if (modalBodyElem.dataset.gdid) newModalBodyElem.dataset.gdid = modalBodyElem.dataset.gdid;
            if (modalBodyElem.dataset.id) newModalBodyElem.dataset.id = modalBodyElem.dataset.id;
            if (modalBodyElem.dataset.numord) newModalBodyElem.dataset.numord = modalBodyElem.dataset.numord;
            if (modalBodyElem.dataset.boardId) newModalBodyElem.dataset.boardId = modalBodyElem.dataset.boardId;
            if (modalBodyElem.dataset.colorIndex) newModalBodyElem.dataset.colorIndex = modalBodyElem.dataset.colorIndex;
            if (modalBodyElem.dataset.baseDatemod) newModalBodyElem.dataset.baseDatemod = modalBodyElem.dataset.baseDatemod;
            if (modalBodyElem.dataset.baseNote) newModalBodyElem.dataset.baseNote = modalBodyElem.dataset.baseNote;
            if (modalBodyElem.dataset.maskedLinks) newModalBodyElem.dataset.maskedLinks = modalBodyElem.dataset.maskedLinks;
            if (modalBodyElem.dataset.format) newModalBodyElem.dataset.format = modalBodyElem.dataset.format;
            if (modalBodyElem.dataset.titleFormat) newModalBodyElem.dataset.titleFormat = modalBodyElem.dataset.titleFormat;
        }

        // --- Custom preview state: Show Save, Preview AND Edit buttons ---
        // 1. Re-initialize edit buttons (showModal cleaned them up)
        initNoteEditUI();

        // 2. Adjust visibility and positions for the 4-button preview layout
        const saveBtn = document.getElementById('note-save-btn');
        const previewBtn = document.getElementById('note-preview-btn');
        const editBtn = document.getElementById('note-edit-btn');
        const moveBtn = document.getElementById('note-move-btn');

        if (saveBtn) { saveBtn.style.display = 'flex'; }
        if (editBtn) { editBtn.style.display = 'flex'; }
        if (previewBtn) { previewBtn.style.display = 'none'; }
        if (moveBtn) { moveBtn.style.display = 'flex'; }
        const attachBtnPreview = document.getElementById('note-attach-btn');
        if (attachBtnPreview) attachBtnPreview.style.display = 'none';
        const dupBtn = document.getElementById('note-duplicate-btn');
        if (dupBtn) dupBtn.style.display = 'none';
    }
}

function disableNoteEditing(modalBodyElem) {
    if (!modalBodyElem) return;

    // Clear editing drafts
    delete modalBodyElem.dataset.draftText;
    delete modalBodyElem.dataset.draftTitle;

    // 1. Hide Save and Preview Buttons
    const saveBtn = document.getElementById('note-save-btn');
    if (saveBtn) saveBtn.style.display = 'none';
    const previewBtn = document.getElementById('note-preview-btn');
    if (previewBtn) previewBtn.style.display = 'none';
    const attachBtnForDisplay = document.getElementById('note-attach-btn');
    if (attachBtnForDisplay) attachBtnForDisplay.style.display = 'none';

    // 2. Show Edit Button (if it exists)
    const editBtn = document.getElementById('note-edit-btn');
    if (editBtn) editBtn.style.display = 'flex';
    // 3. Hide Color Button
    const colorBtn = document.getElementById('modal-color-btn');
    if (colorBtn) colorBtn.style.display = 'none';
    // 4. Restore graphical background if setting allows
    const imgBgrdEnabled = localStorage.getItem('imgBgrd') !== 'false';
    const modalContentBox = document.querySelector('#content-modal .modal-content-box');
    if (modalContentBox) {
        if (imgBgrdEnabled) {
            modalContentBox.style.backgroundImage = '';
            modalContentBox.classList.remove('no-bg-image');
            modalBodyElem.classList.remove('no-bg-image');
        }
    }
    // Note: The actual content replacement (removing textarea) is handled by showModal (called after)
    // or by modal closing. We don't need to manually revert innerHTML here unless we cancel.

}
/**
 * Превръща MD символи във форматирани области и изчиства текста.
 */
function postEdit(text, formats, maskedLinks = []) {
    if (parseMarkdownTable(text)) {
        return { text, formats: [] };
    }

    let currentText = text;
    let currentFormats = [...formats];

    const codeBlockRanges = [];
    const codeTagRegex = /\{\{([\s\S]*?)\}\}|```([\s\S]*?)```/g;
    let match;
    while ((match = codeTagRegex.exec(currentText)) !== null) {
        codeBlockRanges.push({ start: match.index, end: match.index + match[0].length });
    }

    const shift = (pos, diff) => {
        const L = Math.abs(diff);
        currentFormats.forEach(f => {
            if (f.start > pos + L) f.start -= L; else if (f.start > pos) f.start = pos;
            if (f.end > pos + L) f.end -= L; else if (f.end > pos) f.end = pos;
        });
        codeBlockRanges.forEach(cb => {
            if (cb.start > pos + L) cb.start -= L; else if (cb.start > pos) cb.start = pos;
            if (cb.end > pos + L) cb.end -= L; else if (cb.end > pos) cb.end = pos;
        });
    };

    const isInsideCodeBlock = (start, end) => {
        return codeBlockRanges.some(cb => Math.max(start, cb.start) < Math.min(end, cb.end));
    };

    // 1. Първоначално премахваме всички формати, които попадат в обхвата на mdClear (ръчно въведени --)
    const handleClear = (removeMarkers = true) => {
        const mdClear = (localStorage.getItem('mdClear') || '--').trim();
        if (!mdClear) return;
        let sIdx = 0;
        while (true) {
            let start = currentText.indexOf(mdClear, sIdx);
            if (start === -1) break;
            let end = currentText.indexOf(mdClear, start + mdClear.length);
            if (end === -1) {
                if (removeMarkers) {
                    currentText = currentText.substring(0, start) + currentText.substring(start + mdClear.length);
                    shift(start, -mdClear.length);
                } else {
                    sIdx = start + mdClear.length;
                }
                continue;
            }
            const rangeStart = start;
            const rangeEnd = end + mdClear.length;
            if (isInsideCodeBlock(rangeStart, rangeEnd)) {
                sIdx = start + mdClear.length;
                continue;
            }
            currentFormats = currentFormats.filter(f => !(f.start < rangeEnd && f.end > rangeStart));
            if (removeMarkers) {
                currentText = currentText.substring(0, end) + currentText.substring(end + mdClear.length);
                shift(end, -mdClear.length);
                currentText = currentText.substring(0, start) + currentText.substring(start + mdClear.length);
                shift(start, -mdClear.length);
                sIdx = start;
            } else {
                sIdx = end + mdClear.length;
            }
        }
    };

    handleClear(false); // Phase 1: Keep markers, clean existing formats

    const rules = [
        { s: (localStorage.getItem('mdBold') || '**').trim(), e: (localStorage.getItem('mdBold') || '**').trim(), t: 1 },
        { s: (localStorage.getItem('mdStrike') || '~~').trim(), e: (localStorage.getItem('mdStrike') || '~~').trim(), t: 7 },
        { s: (localStorage.getItem('mdItalic') || '*').trim(), e: (localStorage.getItem('mdItalic') || '*').trim(), t: 2 },
        { s: (localStorage.getItem('mdUnderline') || '_').trim(), e: (localStorage.getItem('mdUnderline') || '_').trim(), t: 3 }
    ];

    rules.forEach(rule => {
        let searchIdx = 0;
        // Clean existing formats of this type to avoid duplicates
        currentFormats = currentFormats.filter(f => f.type !== rule.t);
        while (true) {
            let start = currentText.indexOf(rule.s, searchIdx);
            if (start === -1) break;
            let end = currentText.indexOf(rule.e, start + rule.s.length);
            if (end === -1) {
                searchIdx = start + rule.s.length;
                continue;
            }
            if (isInsideCodeBlock(start, end + rule.e.length)) {
                searchIdx = start + rule.s.length;
                continue;
            }
            const contentLen = end - start - rule.s.length;
            currentText = currentText.substring(0, end) + currentText.substring(end + rule.e.length);
            shift(end, -rule.e.length);
            currentText = currentText.substring(0, start) + currentText.substring(start + rule.s.length);
            shift(start, -rule.s.length);
            currentFormats.push({ start, end: start + contentLen, type: rule.t, paramint: 0, paramfloat: 0 });
            searchIdx = start + contentLen;
        }
    });

    const checkRegex = /\[\s*[xXхХ]?\s*\]/g;
    let chMatch;
    while ((chMatch = checkRegex.exec(currentText)) !== null) {
        const fullMatch = chMatch[0];
        const start = chMatch.index;
        if (isInsideCodeBlock(start, start + fullMatch.length)) {
            continue;
        }
        const isChecked = /[xXхХ]/.test(fullMatch);
        const sym = isChecked ? '☑' : '☐';
        currentText = currentText.substring(0, start) + sym + currentText.substring(start + fullMatch.length);
        shift(start, -(fullMatch.length - sym.length));
        checkRegex.lastIndex = start + sym.length;
    }

    const headerRules = [
        { md: '###### ', scale: 0.7 }, { md: '##### ', scale: 0.8 }, { md: '#### ', scale: 0.9 },
        { md: '### ', scale: 1.1 }, { md: '## ', scale: 1.2 }, { md: '# ', scale: 1.3 }
    ];
    // Clean header formats
    currentFormats = currentFormats.filter(f => f.type !== 6);
    headerRules.forEach(rule => {
        let hIdx = 0;
        while (true) {
            let found = -1;
            if (currentText.startsWith(rule.md, hIdx)) found = hIdx;
            else {
                let next = currentText.indexOf('\n' + rule.md, hIdx);
                if (next !== -1) found = next + 1;
            }
            if (found === -1) break;
            let lineEnd = currentText.indexOf('\n', found);
            if (lineEnd === -1) lineEnd = currentText.length;
            if (isInsideCodeBlock(found, lineEnd)) {
                hIdx = found + rule.md.length;
                continue;
            }
            currentText = currentText.substring(0, found) + currentText.substring(found + rule.md.length);
            shift(found, -rule.md.length);
            lineEnd -= rule.md.length;
            currentFormats.push({ start: found, end: lineEnd, type: 6, paramint: 0, paramfloat: rule.scale });
            hIdx = lineEnd;
        }
    });

    handleClear(true); // Phase 2: Final sweep and marker removal

    // --- Restore Masked Links with proper shifting ---
    maskedLinks.forEach((link, idx) => {
        const placeholder = `{#L${idx}#}`;
        let pIdx = currentText.indexOf(placeholder);
        while (pIdx !== -1) {
            currentText = currentText.substring(0, pIdx) + link + currentText.substring(pIdx + placeholder.length);
            const diff = link.length - placeholder.length;
            const startPos = pIdx;
            const markerLen = placeholder.length;

            currentFormats.forEach(f => {
                if (f.start >= startPos + markerLen) f.start += diff;
                if (f.end >= startPos + markerLen) f.end += diff;
            });
            pIdx = currentText.indexOf(placeholder, startPos + link.length);
        }
    });

    return { text: currentText, formats: currentFormats };
}

/**
 * Връща текст с вмъкнати MD символи на мястото на форматиращите команди.
 */
/**
 * Връща текст с вмъкнати MD символи на мястото на форматиращите команди.
 */
function preEdit(text, formats, targetIndex = -1) {
    if (!text) return { text: "", formats: [], correctedIndex: targetIndex };

    let currentText = text;
    let currentFormats = formats ? formats.map(f => ({ ...f })) : [];
    let correctedIndex = targetIndex;
    let maskedLinks = [];

    const shiftIndex = (pos, diff) => {
        if (targetIndex === -1) return;
        if (pos <= correctedIndex) {
            correctedIndex += diff;
        }
    };

    // --- 1. Link Masking (Extract URLs to placeholders) ---
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%?=~_|])/ig;
    let match;
    while ((match = urlRegex.exec(currentText)) !== null) {
        const url = match[0];
        const start = match.index;
        const placeholder = `{#L${maskedLinks.length}#}`;
        maskedLinks.push(url);

        currentText = currentText.substring(0, start) + placeholder + currentText.substring(start + url.length);
        const diff = placeholder.length - url.length;
        shiftIndex(start, diff);

        // Shift format coordinates to match masked text
        currentFormats.forEach(f => {
            if (f.start >= start + url.length) f.start += diff;
            else if (f.start > start) f.start = start; // Clip if it was inside URL
            if (f.end >= start + url.length) f.end += diff;
            else if (f.end > start) f.end = start; // Clip if it was inside URL
        });

        urlRegex.lastIndex = start + placeholder.length; // Adjust for new text length
    }

    // Re-calculate format positions relative to masked text
    // (Simplistic approach: if a format was on a link, it might get slightly offset, but links shouldn't be formatted anyway)
    // For now, let's just use the currentText for further MD insertion

    // --- 2. Header Support (font size -> # levels) ---
    const headerMap = [
        { md: '###### ', scale: 0.7 }, { md: '##### ', scale: 0.8 }, { md: '#### ', scale: 0.9 },
        { md: '### ', scale: 1.1 }, { md: '## ', scale: 1.2 }, { md: '# ', scale: 1.3 }
    ];

    headerMap.forEach(rule => {
        const hFormats = currentFormats.filter(f => f.type === 6 && f.paramfloat === rule.scale);
        let hIns = [];
        hFormats.forEach(f => hIns.push({ pos: f.start, str: rule.md }));
        hIns.sort((a, b) => b.pos - a.pos);
        hIns.forEach(ins => {
            currentText = currentText.substring(0, ins.pos) + ins.str + currentText.substring(ins.pos);
            shiftIndex(ins.pos, ins.str.length);
            currentFormats.forEach(f => {
                if (f.start >= ins.pos) f.start += ins.str.length;
                if (f.end >= ins.pos) f.end += ins.str.length;
            });
        });
    });

    // --- 3. Checkbox Support (Unicode to MD) ---
    const checkRules = [{ md: '[ ]', sym: '☐' }, { md: '[x]', sym: '☑' }];
    checkRules.forEach(rule => {
        let cIdx = 0;
        while (true) {
            let start = currentText.indexOf(rule.sym, cIdx);
            if (start === -1) break;
            currentText = currentText.substring(0, start) + rule.md + currentText.substring(start + rule.sym.length);
            const shiftLen = rule.md.length - rule.sym.length;
            shiftIndex(start, shiftLen);
            currentFormats.forEach(f => {
                if (f.start >= start) f.start += shiftLen;
                if (f.end >= start) f.end += shiftLen;
            });
            cIdx = start + rule.md.length;
        }
    });

    // --- 4. Inline Formatting Rules ---
    const rules = [
        { s: localStorage.getItem('mdBold') || '**', e: localStorage.getItem('mdBold') || '**', t: 1 },
        { s: localStorage.getItem('mdStrike') || '~~', e: localStorage.getItem('mdStrike') || '~~', t: 7 },
        { s: localStorage.getItem('mdItalic') || '*', e: localStorage.getItem('mdItalic') || '*', t: 2 },
        { s: localStorage.getItem('mdUnderline') || '_', e: localStorage.getItem('mdUnderline') || '_', t: 3 }
    ];

    const mdTypes = [1, 2, 3, 7];
    let insertions = [];
    currentFormats.forEach(f => {
        const rule = rules.find(r => r.t === f.type);
        if (rule) {
            insertions.push({ pos: f.end, str: rule.e });
            insertions.push({ pos: f.start, str: rule.s });
        }
    });

    insertions.sort((a, b) => b.pos - a.pos);
    insertions.forEach(ins => {
        currentText = currentText.substring(0, ins.pos) + ins.str + currentText.substring(ins.pos);
        shiftIndex(ins.pos, ins.str.length);
        currentFormats.forEach(f => {
            if (f.start >= ins.pos) f.start += ins.str.length;
            if (f.end >= ins.pos) f.end += ins.str.length;
        });
    });

    const headerScales = [0.7, 0.8, 0.9, 1.1, 1.2, 1.3];
    const remainingFormats = currentFormats.filter(f => !mdTypes.includes(f.type) && !(f.type === 6 && headerScales.includes(f.paramfloat)));

    return { text: currentText, formats: remainingFormats, maskedLinks, correctedIndex };
}

// =================================================================================
// BOARD CREATION MODAL LOGIC
// =================================================================================

let bicFromStorage = localStorage.getItem('boardIdCounter');
let boardIdCounter = bicFromStorage !== null ? parseInt(bicFromStorage, 10) : 1000000;

/**
 * Показва попъп за пренареждане на бордовете с влачене (drag-and-drop).
 * Новият ред се записва в localStorage ('boardMenuOrder').
 */
function showBoardReorderPopup() {
    const normalEntries = [...boardsData]
        .filter(b => b.title)
        .sort((a, b) => {
            const numordA = a.numord !== undefined && a.numord !== null ? a.numord : Infinity;
            const numordB = b.numord !== undefined && b.numord !== null ? b.numord : Infinity;
            return numordA - numordB;
        })
        .map(board => ({ key: String(board.title), title: String(board.title), board, boardId: board.gdid || board.id }));
    const defaultEntries = [...getSystemBoardOrderEntries(), ...normalEntries];
    const orderedEntries = orderBoardEntriesByVisibleMenu(defaultEntries);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay reorder-overlay';
    overlay.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:100000;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    const box = document.createElement('div');
    box.className = 'modal-content-box';
    box.style.cssText = `background-image:url('Frame.jpg');background-size:cover;border-radius:12px;padding:50px 20px 20px 20px;width:auto;min-width:300px;max-width:95vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.5);position:relative;`;
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.className = 'modal-close';
    closeBtn.style.cssText = `position:absolute;top:10px;right:10px;background:#d6d6d6;border:none;border-radius:6px;width:44px;height:32px;cursor:pointer;font-size:28px;display:flex;align-items:center;justify-content:center;color:#333;box-shadow:0 2px 5px rgba(0,0,0,0.2);`;
    closeBtn.onclick = () => overlay.remove();
    box.appendChild(closeBtn);
    const title = document.createElement('h3');
    title.textContent = _('reorderBoards') || 'Нареди бордовете';
    title.style.cssText = 'margin:0 0 15px 0;font-size:1.2em;color:#fff;text-shadow:1px 1px 3px rgba(0,0,0,0.8);text-align:center;';
    box.appendChild(title);
    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'overflow-y:auto;flex:1;padding:4px;display:flex;flex-direction:column;align-items:center;width:100%;';

    const itemWidth = Math.max(maxWidthForButtons, 220);

    let draggedItem = null;
    let placeholder = document.createElement('div');
    placeholder.style.cssText = `height:40px;width:${itemWidth}px;border:2px dashed #fff;border-radius:4px;margin-bottom:8px;background:rgba(255,255,255,0.2);`;

    function renderList(entries) {
        listContainer.innerHTML = '';
        entries.forEach((entry) => {
            const board = entry.board || null;
            const row = document.createElement('div');
            row.style.cssText = `display:flex;align-items:center;width:${itemWidth}px;margin-bottom:8px;flex-shrink:0;`;
            const item = document.createElement('div');
            item.className = `board-filter-link reorder-item ${entry.className || ''}`.trim();
            item.dataset.boardkey = getBoardOrderEntryKey(entry);
            item.draggable = true;
            item.style.cssText = `width:${itemWidth - 40}px;cursor:default;flex-shrink:0;display:flex;align-items:center;justify-content:flex-start;padding:0 10px;box-sizing:border-box;`;
            if (entry.backgroundColor) {
                item.style.backgroundColor = entry.backgroundColor;
            } else if (board && board.color !== undefined && !isNaN(board.color)) {
                if (board.color >= 0 && board.color <= 6) item.style.backgroundColor = `var(--board-bg-${board.color})`;
                else if (board.color < 0) item.style.backgroundColor = '#' + (board.color >>> 0).toString(16).slice(-6);
            }
            const text = document.createElement('span');
            text.textContent = entry.title;
            text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
            if (entry.color) {
                text.style.color = entry.color;
            } else if (board && board.status === 1) {
                text.style.color = 'red';
            } else if (board && board.colorfont !== undefined && !isNaN(board.colorfont)) {
                if (board.colorfont === 1) text.style.color = '#FFFFFF';
                else if (board.colorfont === 2) text.style.color = '#FF0000';
                else if (board.colorfont === 3) text.style.color = '#0000FF';
                else if (board.colorfont < 0) text.style.color = '#' + (board.colorfont >>> 0).toString(16).slice(-6);
                else text.style.color = 'black';
            } else {
                text.style.color = 'black';
            }
            item.appendChild(text);
            const handle = document.createElement('div');
            handle.className = 'reorder-handle';
            handle.innerHTML = '⠿';
            handle.style.cssText = 'width:40px;height:100%;min-height:36px;display:flex;align-items:center;justify-content:center;cursor:grab;font-size:18px;opacity:0.5;color:#fff;flex-shrink:0;user-select:none;-webkit-user-select:none;';
            row.appendChild(item);
            row.appendChild(handle);
            handle.addEventListener('dragstart', (e) => {
                draggedItem = row;
                e.dataTransfer.effectAllowed = 'move';
                setTimeout(() => { row.style.opacity = '0'; }, 0);
            });
            handle.draggable = true;
            handle.addEventListener('dragend', () => {
                row.style.opacity = '1';
                if (placeholder.parentNode) placeholder.remove();
                draggedItem = null;
            });
            handle.addEventListener('touchstart', (e) => {
                if (e.touches.length !== 1) return;
                e.preventDefault();
                draggedItem = row;
                row.style.opacity = '0.5';
            }, { passive: false });
            handle.addEventListener('touchmove', (e) => {
                if (!draggedItem || draggedItem !== row) return;
                e.preventDefault();
                const y = e.touches[0].clientY;
                const target = document.elementFromPoint(e.touches[0].clientX, y);
                const scrollItem = target ? target.closest('.reorder-item') : null;
                const scrollRow = scrollItem ? scrollItem.parentElement : (target ? target.closest('.reorder-handle')?.parentElement : null);
                if (scrollRow && scrollRow !== row && scrollRow.parentElement === listContainer) {
                    const rect = scrollRow.getBoundingClientRect();
                    if (y < rect.top + rect.height / 2) listContainer.insertBefore(placeholder, scrollRow);
                    else listContainer.insertBefore(placeholder, scrollRow.nextSibling);
                }
            }, { passive: false });
            handle.addEventListener('touchend', () => {
                if (!draggedItem) return;
                row.style.opacity = '1';
                if (placeholder.parentNode) {
                    listContainer.insertBefore(row, placeholder);
                    placeholder.remove();
                }
                draggedItem = null;
            });
            listContainer.appendChild(row);
        });
    }

    renderList(orderedEntries);
    listContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const itemTarget = e.target.closest('.reorder-item');
        const handleTarget = e.target.closest('.reorder-handle');
        const target = itemTarget ? itemTarget.parentElement : (handleTarget ? handleTarget.parentElement : null);
        if (target && target !== draggedItem && target.parentElement === listContainer) {
            const rect = target.getBoundingClientRect();
            if (e.clientY < rect.top + rect.height / 2) listContainer.insertBefore(placeholder, target);
            else listContainer.insertBefore(placeholder, target.nextSibling);
        }
    });
    listContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        if (draggedItem && placeholder.parentNode) {
            listContainer.insertBefore(draggedItem, placeholder);
            placeholder.remove();
        }
    });
    box.appendChild(listContainer);
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:center;gap:15px;margin-top:15px;';

    const resetBtn = document.createElement('button');
    resetBtn.textContent = 'Reset';
    resetBtn.className = 'submit-btn';
    resetBtn.style.cssText = 'padding:10px 20px;background:#607D8B;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1.1em;font-weight:bold;box-shadow:0 4px 10px rgba(0,0,0,0.3);';
    resetBtn.onclick = () => {
        renderList(defaultEntries);
    };
    footer.appendChild(resetBtn);

    const saveCloseBtn = document.createElement('button');
    saveCloseBtn.textContent = _('submitButton') || 'Потвърди';
    saveCloseBtn.className = 'submit-btn';
    saveCloseBtn.style.cssText = 'padding:10px 30px;background:darkorange;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1.1em;font-weight:bold;box-shadow:0 4px 10px rgba(0,0,0,0.3);';
    saveCloseBtn.onclick = async () => {
        const newOrder = [...listContainer.children]
            .map(el => {
                const ri = el.querySelector('.reorder-item');
                return ri ? ri.dataset.boardkey : null;
            })
            .filter(Boolean);
        localStorage.setItem('boardMenuOrder', JSON.stringify(newOrder));
        syncFolderDataAsync();
        overlay.remove();
        const boardsNote = document.querySelector('header .boards-note');
        if (boardsNote) boardsNote.remove();
        await renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        saveSettingsToGDrive(true);
        showToast(_('settingSaved') || 'Запазено', 2000);
    };
    footer.appendChild(saveCloseBtn);
    box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('visible'), 10);
}
/**
 * Търси максималните стойности на id сред бордовете и обновява брояча.
 */
function trackMaxBoardIds(boards) {
    if (!Array.isArray(boards)) return;
    let currentMax = boardIdCounter;
    boards.forEach(board => {
        const id = parseInt(board.id, 10);
        if (!isNaN(id) && id > currentMax) currentMax = id;
    });
    if (currentMax > boardIdCounter) {
        boardIdCounter = currentMax;
        localStorage.setItem('boardIdCounter', boardIdCounter.toString());
        syncFolderDataAsync();
    }
}

/**
 * Показва модал за създаване на нов борд.
 */
async function showNewBoardModal() {
    const modal = document.getElementById('new-board-modal');
    if (!modal) return;

    const editSelect = document.getElementById('board-edit-select');
    const reorderBtn = document.getElementById('board-reorder-btn');
    const titleInput = document.getElementById('new-board-title');
    const colorsContainer = document.getElementById('new-board-colors');
    const fontColorsContainer = document.getElementById('new-board-font-colors');
    const backgroundsContainer = document.getElementById('new-board-backgrounds');
    const customColorInput = document.getElementById('new-board-custom-color');
    const customFontColorInput = document.getElementById('new-board-custom-font-color');
    const saveBtn = document.getElementById('save-new-board-btn');
    const delBtn = document.getElementById('board-del-btn');
    const previewTab = document.getElementById('preview-tab');
    const previewBg = document.getElementById('preview-bg');

    const closeBtn = modal.querySelector('.modal-close');

    let selectedColor = 0;
    let selectedFontColor = 0;
    let selectedBackground = 0;
    let selectedBoardStatus = 0;
    let currentEditingBoard = null;
    let currentSystemBoardId = null;
    let customBgBlob = null;
    let customBgDataURL = null;
    let customBgMimeType = null;
    let isBoardSaveInProgress = false;
    // Populated dropdown with current boards
    if (editSelect) {
        while (editSelect.options.length > 1) editSelect.remove(1);
        const normalEditEntries = [...boardsData]
            .filter(board => board.title)
            .sort((a, b) => {
                const numordA = a.numord !== undefined && a.numord !== null ? a.numord : Infinity;
                const numordB = b.numord !== undefined && b.numord !== null ? b.numord : Infinity;
                return numordA - numordB;
            })
            .map(board => ({
                key: String(board.title),
                title: String(board.title),
                board,
                boardId: board.gdid || board.id
            }));
        const orderedEditEntries = orderBoardEntriesByVisibleMenu([
            ...getSystemBoardEditEntries(),
            ...normalEditEntries
        ]);

        orderedEditEntries.forEach(entry => {
            const opt = document.createElement('option');
            opt.value = entry.board ? (entry.board.gdid || entry.board.id).toString() : `system:${entry.boardId}`;
            opt.textContent = entry.title;
            opt.style.background = '#2c2c2c';
            editSelect.appendChild(opt);
        });
    }

    const bgNames = ['Board.png', 'Board1.png', 'Board2.png', 'Board3.png'];
    const fontColors = ['#000000', '#FFFFFF', '#FF0000', '#0000FF'];

    function updatePreview() {
        const title = titleInput.value.trim() || _('addBoardTitle') || "Нов борд";
        previewTab.textContent = title;

        // Sync custom input with direct value if it's a HEX string or an index
        if (customColorInput) {
            if (typeof selectedColor === 'string' && selectedColor.startsWith('#')) {
                customColorInput.value = selectedColor;
            } else if (typeof selectedColor === 'number' && selectedColor >= 0 && selectedColor <= 6) {
                customColorInput.value = `Index: ${selectedColor}`;
            } else {
                customColorInput.value = (selectedColor !== undefined && selectedColor !== null) ? selectedColor : "";
            }
        }

        if (customFontColorInput) {
            if (typeof selectedFontColor === 'string' && selectedFontColor.startsWith('#')) {
                customFontColorInput.value = selectedFontColor;
            } else if (typeof selectedFontColor === 'number' && selectedFontColor >= 0 && selectedFontColor < fontColors.length) {
                customFontColorInput.value = `Index: ${selectedFontColor}`;
            } else {
                customFontColorInput.value = (selectedFontColor !== undefined && selectedFontColor !== null) ? selectedFontColor : "";
            }
        }

        // Background color logic matching createBoardsUI
        if (typeof selectedColor === 'number' && selectedColor >= 0 && selectedColor <= 6) {
            previewTab.style.backgroundColor = `var(--board-bg-${selectedColor})`;
        } else if (typeof selectedColor === 'string' && selectedColor.startsWith('#')) {
            previewTab.style.backgroundColor = selectedColor;
        } else if (typeof selectedColor === 'number' && selectedColor < 0) {
            const hexColor = '#' + (selectedColor >>> 0).toString(16).slice(-6);
            previewTab.style.backgroundColor = hexColor;
        }

        // Font color logic matching createBoardsUI
        if (typeof selectedFontColor === 'number' && selectedFontColor >= 0 && selectedFontColor < fontColors.length) {
            previewTab.style.color = fontColors[selectedFontColor];
        } else if (typeof selectedFontColor === 'string' && selectedFontColor.startsWith('#')) {
            previewTab.style.color = selectedFontColor;
        } else if (typeof selectedFontColor === 'number' && selectedFontColor < 0) {
            const hexFontColor = '#' + (selectedFontColor >>> 0).toString(16).slice(-6);
            previewTab.style.color = hexFontColor;
        } else {
            // Default logic if font color not explicitly set or not custom
            previewTab.style.color = (selectedColor == 1 || selectedColor == 5) ? '#000000' : '#FFFFFF';
        }

        if (selectedBackground === -1 && customBgDataURL) {
            previewBg.style.backgroundImage = `url('${customBgDataURL}')`;
        } else if (bgNames[selectedBackground]) {
            previewBg.style.backgroundImage = `url('${bgNames[selectedBackground]}')`;
        }
    }

    if (customColorInput) {
        customColorInput.oninput = () => {
            const val = customColorInput.value.trim();
            if (val.startsWith('#')) {
                selectedColor = val;
                renderColorOptions(); // Clear selection markers in palette
                updatePreview();
            }
        };
    }
    if (customFontColorInput) {
        customFontColorInput.oninput = () => {
            const val = customFontColorInput.value.trim();
            if (val.startsWith('#')) {
                selectedFontColor = val;
                renderFontColorOptions();
                updatePreview();
            }
        };
    }

    function resetInputs(board = null) {
        if (board) {
            currentEditingBoard = board;
            currentSystemBoardId = null;
            titleInput.value = board.title || "";
            // Handle both numeric indices, hex strings, and negative decimal colors
            let bColor = board.color;
            if (bColor !== undefined && bColor !== null && bColor !== "") {
                const num = Number(bColor);
                if (!isNaN(num)) {
                    if (num < 0) {
                        // Convert negative decimal color to HEX (e.g. -65536 -> #ff0000)
                        selectedColor = '#' + (num >>> 0).toString(16).slice(-6).toUpperCase();
                    } else {
                        selectedColor = num;
                    }
                } else {
                    selectedColor = bColor;
                }
            } else {
                selectedColor = 0;
            }

            let bFColor = board.colorfont;
            if (bFColor !== undefined && bFColor !== null && bFColor !== "") {
                const num = Number(bFColor);
                if (!isNaN(num)) {
                    if (num < 0) {
                        selectedFontColor = '#' + (num >>> 0).toString(16).slice(-6).toUpperCase();
                    } else {
                        selectedFontColor = num;
                    }
                } else {
                    selectedFontColor = bFColor;
                }
            } else {
                selectedFontColor = 0;
            }
            selectedBackground = (board.backnum !== undefined) ? Number(board.backnum) : 0;
            if (board.backpath) {
                selectedBackground = -1;
                // Attempt to load from cache for preview
                caches.open('app-cache').then(cache => {
                    cache.match(`https://www.googleapis.com/drive/v3/files/${board.backpath}?alt=media`)
                        .then(res => res ? res.blob() : null)
                        .then(blob => {
                            if (blob) {
                                customBgBlob = blob;
                                customBgMimeType = blob.type;
                                customBgDataURL = URL.createObjectURL(blob);
                                renderBackgroundOptions(selectedBackground);
                                updatePreview();
                            }
                        });
                });
            }
            selectedBoardStatus = (board.status !== undefined) ? Number(board.status) : 0;
            saveBtn.textContent = _('updateButton') || "Обнови";
            if (editSelect) editSelect.value = (board.gdid || board.id).toString();
            titleInput.disabled = false;
            if (customColorInput) customColorInput.disabled = false;
            if (customFontColorInput) customFontColorInput.disabled = false;
            if (saveBtn) saveBtn.style.display = '';
        } else {
            currentEditingBoard = null;
            currentSystemBoardId = null;
            titleInput.value = "";
            selectedColor = 0;
            selectedFontColor = 0;
            selectedBackground = 0;
            selectedBoardStatus = 0;
            saveBtn.textContent = _('submitButton') || "Потвърди";
            if (editSelect) editSelect.value = "";
            titleInput.disabled = false;
            if (customColorInput) customColorInput.disabled = false;
            if (customFontColorInput) customFontColorInput.disabled = false;
            if (saveBtn) saveBtn.style.display = '';
        }

        const hasIndividualOrderCheckbox = document.getElementById('board-has-individual-order');
        if (hasIndividualOrderCheckbox) {
            hasIndividualOrderCheckbox.checked = selectedBoardStatus >= 10;
        }
        if (delBtn) delBtn.style.display = board ? 'flex' : 'none';
        renderColorOptions(selectedColor);
        renderFontColorOptions(selectedFontColor);
        renderBackgroundOptions(selectedBackground);
        updatePreview();
    }

    function resetSystemInputs(systemBoardId) {
        const systemBoard = getSystemBoardEditEntries().find(entry => entry.boardId === systemBoardId);
        currentEditingBoard = null;
        currentSystemBoardId = systemBoardId;
        titleInput.value = systemBoard ? systemBoard.title : systemBoardId;
        selectedColor = 0;
        selectedFontColor = 1;
        selectedBackground = 0;
        selectedBoardStatus = getSystemBoardSortStatus(systemBoardId);
        saveBtn.textContent = _('submitButton') || "Потвърди";
        titleInput.disabled = true;
        if (customColorInput) customColorInput.disabled = true;
        if (customFontColorInput) customFontColorInput.disabled = true;
        if (saveBtn) saveBtn.style.display = 'none';
        if (delBtn) delBtn.style.display = 'none';
        const hasIndividualOrderCheckbox = document.getElementById('board-has-individual-order');
        if (hasIndividualOrderCheckbox) {
            hasIndividualOrderCheckbox.checked = selectedBoardStatus >= 10;
        }
        renderColorOptions(selectedColor);
        renderFontColorOptions(selectedFontColor);
        renderBackgroundOptions(selectedBackground);
        updatePreview();
    }

    if (editSelect) {
        editSelect.onchange = () => {
            if (editSelect.value === "") {
                resetInputs(null);
            } else if (editSelect.value.startsWith('system:')) {
                resetSystemInputs(editSelect.value.replace(/^system:/, ''));
            } else {
                const board = boardsData.find(b => (b.gdid || b.id).toString() === editSelect.value.toString());
                resetInputs(board);
            }
        };
    }

    if (reorderBtn) {
        reorderBtn.onclick = () => {
            modal.classList.remove('visible');
            showBoardReorderPopup();
        };
    }
    // --- Individual Board Sort Logic ---
    const individualOrderBtn = document.getElementById('board-individual-order-btn');
    const boardOrderModal = document.getElementById('board-order-modal');
    const boardOrderCloseBtn = document.getElementById('board-order-close');
    const clearOrderBtn = document.getElementById('board-order-clear-btn');
    const saveOrderBtn = document.getElementById('board-order-save-btn');

    if (individualOrderBtn && boardOrderModal) {
        individualOrderBtn.onclick = () => {
            ensureBoardSortOptionsCloned();

            if (currentSystemBoardId) {
                boardOrderModal.dataset.mode = 'system';
                boardOrderModal.dataset.systemBoardId = currentSystemBoardId;
                applySortStatusToControls(getSystemBoardSortStatus(currentSystemBoardId), 'board-sort-criteria', 'board-sort-reverse-checkbox', 'board-sort-reminders-top-checkbox');
            } else {
                boardOrderModal.dataset.mode = 'board';
                delete boardOrderModal.dataset.systemBoardId;
                if (selectedBoardStatus >= 10) {
                    applySortStatusToControls(selectedBoardStatus, 'board-sort-criteria', 'board-sort-reverse-checkbox', 'board-sort-reminders-top-checkbox');
                } else {
                    applySortStatusToControls(0, 'board-sort-criteria', 'board-sort-reverse-checkbox', 'board-sort-reminders-top-checkbox');
                }
            }
            boardOrderModal.classList.add('visible');
        };
    }

    if (boardOrderCloseBtn) {
        boardOrderCloseBtn.onclick = () => {
            boardOrderModal.classList.remove('visible');
        };
    }

    if (clearOrderBtn) {
        clearOrderBtn.onclick = () => {
            if (boardOrderModal.dataset.mode === 'system') {
                const boardId = boardOrderModal.dataset.systemBoardId;
                if (boardId) localStorage.removeItem(getSystemBoardSortKey(boardId));
                if (currentSystemBoardId === boardId) {
                    selectedBoardStatus = getSystemBoardSortStatus(boardId);
                    const hasIndividualOrderCheckbox = document.getElementById('board-has-individual-order');
                    if (hasIndividualOrderCheckbox) hasIndividualOrderCheckbox.checked = false;
                }
                boardOrderModal.classList.remove('visible');
                applyFilters();
                showToast(_('settingSaved'), 2000);
                return;
            }
            selectedBoardStatus = 0;
            const hasIndividualOrderCheckbox = document.getElementById('board-has-individual-order');
            if (hasIndividualOrderCheckbox) hasIndividualOrderCheckbox.checked = false;
            boardOrderModal.classList.remove('visible');
        };
    }

    if (saveOrderBtn) {
        saveOrderBtn.onclick = () => {
            const sortStatus = getSortStatusFromControls('board-sort-criteria', 'board-sort-reverse-checkbox', 'board-sort-reminders-top-checkbox');

            if (boardOrderModal.dataset.mode === 'system') {
                const boardId = boardOrderModal.dataset.systemBoardId;
                if (boardId) localStorage.setItem(getSystemBoardSortKey(boardId), String(sortStatus));
                if (currentSystemBoardId === boardId) {
                    selectedBoardStatus = sortStatus;
                    const hasIndividualOrderCheckbox = document.getElementById('board-has-individual-order');
                    if (hasIndividualOrderCheckbox) hasIndividualOrderCheckbox.checked = true;
                }
                boardOrderModal.classList.remove('visible');
                applyFilters();
                showToast(_('settingSaved'), 2000);
                return;
            }

            selectedBoardStatus = sortStatus;

            const hasIndividualOrderCheckbox = document.getElementById('board-has-individual-order');
            if (hasIndividualOrderCheckbox) hasIndividualOrderCheckbox.checked = true;

            boardOrderModal.classList.remove('visible');
        };
    }
    // --- End Individual Board Sort Logic ---

    // (Removed outdated initialization)

    function renderColorOptions(current) {
        colorsContainer.innerHTML = '';
        const docStyles = getComputedStyle(document.documentElement);
        for (let i = 0; i <= 6; i++) {
            const colorDiv = document.createElement('div');
            const themeColor = docStyles.getPropertyValue(`--board-bg-${i}`).trim().toLowerCase();
            const currentStr = (current !== undefined && current !== null) ? current.toString().toLowerCase() : "";
            // Match by index OR by actual HEX color string
            const isMatch = (i.toString() === currentStr) || (currentStr === themeColor);

            Object.assign(colorDiv.style, {
                width: '26px', height: '26px', borderRadius: '50%',
                backgroundColor: `var(--board-bg-${i})`, cursor: 'pointer',
                border: isMatch ? '3px solid #ddd' : '1px solid rgba(255,255,255,0.4)',
                boxShadow: isMatch ? '0 0 10px rgba(255,255,255,0.5)' : '0 2px 4px rgba(0,0,0,0.3)',
                transition: 'transform 0.1s, border 0.2s', margin: 'auto'
            });
            colorDiv.onclick = () => {
                selectedColor = i;
                renderColorOptions(selectedColor);
                updatePreview();
            };
            if (isMatch) colorDiv.style.transform = 'scale(1.15)';
            colorsContainer.appendChild(colorDiv);
        }
    }

    function renderFontColorOptions(current) {
        fontColorsContainer.innerHTML = '';
        const currentStr = (current !== undefined && current !== null) ? current.toString().toLowerCase() : "";
        fontColors.forEach((color, i) => {
            const fcDiv = document.createElement('div');
            const paletteColor = color.toLowerCase();
            const isMatch = (i.toString() === currentStr) || (currentStr === paletteColor);

            Object.assign(fcDiv.style, {
                width: '100%', maxWidth: '26px', aspectRatio: '1/1', borderRadius: '4px',
                backgroundColor: color, cursor: 'pointer',
                border: isMatch ? '3px solid #ddd' : '1px solid rgba(255,255,255,0.4)',
                boxShadow: isMatch ? '0 0 10px rgba(255,255,255,0.5)' : '0 2px 4px rgba(0,0,0,0.3)',
                transition: 'transform 0.1s, border 0.2s', margin: 'auto'
            });
            fcDiv.onclick = () => {
                selectedFontColor = i;
                renderFontColorOptions(selectedFontColor);
                updatePreview();
            };
            if (isMatch) fcDiv.style.transform = 'scale(1.15)';
            fontColorsContainer.appendChild(fcDiv);
        });
    }

    function renderBackgroundOptions(current) {
        backgroundsContainer.innerHTML = '';
        for (let i = 0; i <= 3; i++) {
            const bgDiv = document.createElement('div');
            const isMatch = (i == current);

            Object.assign(bgDiv.style, {
                width: '95%', aspectRatio: '15/10', backgroundImage: `url('${bgNames[i]}')`,
                backgroundSize: 'cover', backgroundPosition: 'center', cursor: 'pointer', borderRadius: '4px',
                border: isMatch ? '3px solid #ddd' : '1px solid rgba(226, 250, 14, 1)',
                boxShadow: isMatch ? '0 0 10px rgba(255,255,255,0.4)' : '0 2px 4px rgba(0,0,0,0.3)',
                transition: 'transform 0.1s, border 0.2s'
            });
            bgDiv.onclick = () => {
                selectedBackground = i;
                renderBackgroundOptions(selectedBackground);
                updatePreview();
            };
            if (isMatch) bgDiv.style.transform = 'scale(1.08)';
            backgroundsContainer.appendChild(bgDiv);
        }

        const customDiv = document.createElement('div');
        const isCustomMatch = (current === -1);
        Object.assign(customDiv.style, {
            width: 'calc(95% - 15px)', aspectRatio: '15/10',
            backgroundColor: 'rgba(255,255,255,0.1)',
            backgroundImage: isCustomMatch && customBgDataURL ? `url('${customBgDataURL}')` : 'none',
            backgroundSize: 'cover', backgroundPosition: 'center', cursor: 'pointer', borderRadius: '4px',
            border: isCustomMatch ? '3px solid #ddd' : '1px dashed rgba(226, 250, 14, 1)',
            boxShadow: isCustomMatch ? '0 0 10px rgba(255,255,255,0.4)' : '0 2px 4px rgba(0,0,0,0.3)',
            transition: 'transform 0.1s, border 0.2s',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: 'white', textAlign: 'center', padding: '5px', boxSizing: 'border-box'
        });

        const btnText = document.createElement('span');
        btnText.textContent = _('customBackgroundButton') || 'Custom';
        btnText.style.fontWeight = 'bold';
        btnText.style.textShadow = '0px 0px 3px black, 0px 0px 3px black';

        const limitText = document.createElement('span');
        limitText.textContent = _('customBgSizeLimit') || '(Max 3MB)';
        limitText.style.fontSize = '10px';
        limitText.style.color = '#ccc';
        limitText.style.textShadow = '0px 0px 2px black, 0px 0px 2px black';

        customDiv.appendChild(btnText);
        customDiv.appendChild(limitText);

        customDiv.onclick = () => {
            const fileInput = document.getElementById('custom-board-bg-input');
            if (fileInput) {
                fileInput.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > 3 * 1024 * 1024) {
                        alert(_('customBgSizeLimit') || "Max size 3MB");
                        fileInput.value = '';
                        return;
                    }
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        customBgBlob = file;
                        customBgMimeType = file.type;
                        customBgDataURL = event.target.result;
                        selectedBackground = -1;
                        renderBackgroundOptions(selectedBackground);
                        updatePreview();
                    };
                    reader.readAsDataURL(file);
                };
                fileInput.click();
            }
        };
        if (isCustomMatch) customDiv.style.transform = 'scale(1.08)';
        backgroundsContainer.appendChild(customDiv);
    }

    titleInput.oninput = updatePreview;

    if (delBtn) {
        delBtn.onclick = async () => {
            if (!currentEditingBoard) return;
            const confirmMsg = (_('confirmDeleteBoard') || "Наистина ли искате да изтриете борд \"{boardTitle}\" и ВСИЧКИ бележки в него? Таза операция е необратима!").replace('{boardTitle}', currentEditingBoard.title);
            const confirmed = await showConfirmation(confirmMsg);
            if (confirmed) {
                try {
                    showToast(_('loadingFile') || 'Изтриване...', 2000);

                    // Първо изтриваме всички бележки от този борд - ПО-ПРЕЦИЗНО ФИЛТРИРАНЕ
                    const notesToDelete = allNotesData.filter(n => {
                        const matchId = n.boardid == currentEditingBoard.id;
                        const matchGdid = currentEditingBoard.gdid && n.boardid == currentEditingBoard.gdid;
                        // Ако текущият борд има gdid, задължително искаме и той да съвпадне или бележката да няма gdid
                        if (currentEditingBoard.gdid) {
                            return n.boardid == currentEditingBoard.gdid || (matchId && !n.gdid);
                        }
                        return matchId;
                    });
                    for (const note of notesToDelete) {
                        await permanentlyDeleteNote(note.gdid, note.id, true); // skipUI=true за бързина
                    }

                    const updateGDriveNow = useGoogleDb && !isOffline;
                    if (updateGDriveNow && currentEditingBoard.gdid) {
                        await deleteGDriveFile(currentEditingBoard.gdid);
                    }
                    // Премахваме от локалния списък
                    boardsData = (boardsData || []).filter(b => b.id !== currentEditingBoard.id && (b.gdid !== currentEditingBoard.gdid || !b.gdid) && b.title !== currentEditingBoard.title);
                    // Премахваме от IndexedDB
                    if (useIndexedDb) {
                        await deleteFromDB(BOARD_STORE_NAME, currentEditingBoard.gdid || currentEditingBoard.id);
                    }
                    // Премахваме от подредбата на менюто
                    try {
                        const raw = localStorage.getItem('boardMenuOrder');
                        if (raw) {
                            let order = JSON.parse(raw);
                            order = order.filter(title => title !== currentEditingBoard.title);
                            localStorage.setItem('boardMenuOrder', JSON.stringify(order));
                            syncFolderDataAsync();
                        }
                    } catch (e) { }
                    const boardId = (currentEditingBoard.gdid || currentEditingBoard.id).toString();
                    // Изчистваме стартовия борд, ако е изтритият
                    if (localStorage.getItem('startBoard') === boardId) {
                        localStorage.removeItem('startBoard');
                    }

                    // Ако изтриваме активния борд, превключваме на друг
                    if (currentBoardFilter === boardId) {
                        if (boardsData.length > 0) {
                            const firstBoard = boardsData[0];
                            currentBoardFilter = (firstBoard.gdid || firstBoard.id).toString();
                        } else {
                            currentBoardFilter = 'all';
                        }
                        boardBeforeSearch = currentBoardFilter;
                    }

                    modal.classList.remove('visible');
                    // Опресняваме UI
                    const boardsNote = document.querySelector('header .boards-note');
                    if (boardsNote) boardsNote.remove();
                    await renderUI({ boardParseError: false });
                    showToast(_('settingsSavedSuccess'));
                } catch (error) {
                    console.error("Board deletion failed:", error);
                    showToast("Error: " + error.message, 5000);
                }
            }
        };
    }

    // (Removed outdated initialization)

    saveBtn.onclick = async () => {
        if (isBoardSaveInProgress) return;

        const title = titleInput.value.trim();
        const normalizedTitle = title.normalize('NFKC').toLocaleLowerCase();
        const currentBoardId = currentEditingBoard && (currentEditingBoard.gdid || currentEditingBoard.id);
        const duplicateBoard = boardsData.some(board => {
            const boardId = board.gdid || board.id;
            return String(board.title || '').trim().normalize('NFKC').toLocaleLowerCase() === normalizedTitle &&
                String(boardId) !== String(currentBoardId);
        });
        if (!title) { showToast(_('errorEmptyTitle') || "Моля, въведете заглавие", 3000); return; }

        if (duplicateBoard) {
            showToast(_('errorDuplicateBoardTitle') || 'A board with this name already exists.', 4000);
            return;
        }

        if (!currentEditingBoard && isOffline) {
            showToast(_('errorOfflineBoardCreate') || "Не може да създавате нов борд в офлайн режим.", 5000);
            return;
        }

        const now = Date.now();
        isBoardSaveInProgress = true;
        saveBtn.disabled = true;

        let boardToSave;

        if (currentEditingBoard) {
            boardToSave = { ...currentEditingBoard, "backnum": selectedBackground, "color": selectedColor, "colorfont": selectedFontColor, "datemod": now, "title": title, "status": selectedBoardStatus };
        } else {
            trackMaxBoardIds(boardsData);
            boardIdCounter++;
            localStorage.setItem('boardIdCounter', boardIdCounter.toString());
            syncFolderDataAsync();
            boardToSave = { "backcolor": 0, "backnum": selectedBackground, "backpath": "", "color": selectedColor, "colorfont": selectedFontColor, "datemod": now, "gdid": "", "id": boardIdCounter, "numord": boardIdCounter, "status": selectedBoardStatus, "title": title };
        }

        const oldBackpath = currentEditingBoard ? currentEditingBoard.backpath : null;

        try {
            // --- NEW LOGIC FOR CUSTOM BG ---
            if (selectedBackground === -1 && customBgBlob) {
                const originalBtnHtml = saveBtn.innerHTML;
                saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm" style="display:inline-block;width:1rem;height:1rem;border:0.2em solid currentColor;border-right-color:transparent;border-radius:50%;animation:spinner-border .75s linear infinite;"></span> ' + (_('uploadingBackground') || "Качване на фон...");
                saveBtn.disabled = true;
                try {
                    const arrayBuffer = await customBgBlob.arrayBuffer();
                    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                    const existingBoard = boardsData.find(b => b.customBgHash === hashHex && b.backpath);

                    if (existingBoard) {
                        // Reuse existing background GDID
                        boardToSave.backpath = existingBoard.backpath;
                        boardToSave.customBgHash = hashHex;
                        boardToSave.backnum = -1;
                        customBgCache.set(existingBoard.backpath, customBgDataURL);
                    } else {
                        const folderId = await getFolderID();
                        if (folderId) {
                            const uploadedGdid = await uploadBlobToGDrive(folderId, 'board_bg_' + Date.now() + '.png', customBgBlob, customBgMimeType);
                            if (uploadedGdid) {
                                boardToSave.backpath = uploadedGdid;
                                boardToSave.customBgHash = hashHex;
                                boardToSave.backnum = -1;
                                customBgCache.set(uploadedGdid, customBgDataURL);

                                // Cache the uploaded image immediately
                                try {
                                    const cache = await caches.open('app-cache');
                                    const url = `https://www.googleapis.com/drive/v3/files/${uploadedGdid}?alt=media`;
                                    const response = new Response(customBgBlob, {
                                        headers: {
                                            'Content-Type': customBgMimeType,
                                            'Cache-Control': 'public, max-age=31536000'
                                        }
                                    });
                                    await cache.put(url, response);
                                } catch (e) {
                                    console.warn("Failed to cache custom bg:", e);
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error("Failed to upload custom background:", err);
                    showToast("Failed to upload background", 3000);
                }
                saveBtn.innerHTML = originalBtnHtml;
                saveBtn.disabled = false;
            } else if (selectedBackground !== -1) {
                // Not a custom background, clear any existing custom paths
                boardToSave.backpath = "";
                if (boardToSave.customBgHash !== undefined) delete boardToSave.customBgHash;
            }

            // Cleanup orphaned background cache
            if (oldBackpath && oldBackpath !== boardToSave.backpath && !oldBackpath.includes('/')) {
                const bId = (boardToSave.gdid || boardToSave.id).toString();
                const isUsedByOther = boardsData.some(b => b.backpath === oldBackpath && (b.gdid || b.id).toString() !== bId);
                if (!isUsedByOther) {
                    if (customBgCache.has(oldBackpath)) customBgCache.delete(oldBackpath);
                    caches.open('app-cache').then(cache => {
                        cache.delete(`https://www.googleapis.com/drive/v3/files/${oldBackpath}?alt=media`);
                    }).catch(e => console.warn("Failed to delete orphaned bg from cache:", e));

                    if (useGoogleDb && !isOffline) {
                        deleteGDriveFile(oldBackpath).catch(e => console.warn("Failed to delete orphaned bg from GDrive:", e));
                    }
                }
            }

            const updateGDriveNow = useGoogleDb && !isOffline;
            if (updateGDriveNow) {
                if (currentEditingBoard && currentEditingBoard.gdid) {
                    await updateGDriveFile(currentEditingBoard.gdid, JSON.stringify(boardToSave));
                } else {
                    const folderId = await getFolderID();
                    if (folderId) {
                        const fileName = `board.txt`;
                        const gdid = await createGDriveFile(folderId, fileName, JSON.stringify(boardToSave));
                        boardToSave.gdid = gdid;
                        await updateGDriveFile(gdid, JSON.stringify(boardToSave));
                    }
                }
            }

            if (currentEditingBoard) {
                const bId = (currentEditingBoard.gdid || currentEditingBoard.id).toString();
                const idx = boardsData.findIndex(b => (b.gdid || b.id).toString() === bId);
                if (idx !== -1) boardsData[idx] = boardToSave;
            } else {
                boardsData.push(boardToSave);
            }

            try {
                const raw = localStorage.getItem('boardMenuOrder');
                let order = raw ? JSON.parse(raw) : [];
                if (!Array.isArray(order)) order = [];

                if (currentEditingBoard) {
                    // Ако редактираме борд, обновяваме заглавието му в списъка за подредба
                    const oldTitle = currentEditingBoard.title;
                    const idx = order.indexOf(oldTitle);
                    if (idx !== -1) {
                        order[idx] = title;
                    } else if (!order.includes(title)) {
                        order.push(title);
                    }
                } else {
                    // Ако е нов борд
                    if (!order.includes(title)) {
                        order.push(title);
                    }
                }

                // Изчистваме невалидни записи (null, undefined)
                order = order.filter(item => item && typeof item === 'string' && item !== 'undefined' && item !== 'null');

                localStorage.setItem('boardMenuOrder', JSON.stringify(order));
                syncFolderDataAsync();
            } catch (e) {
                console.error("Error updating boardMenuOrder:", e);
            }

            if (useIndexedDb) await bulkPutDB(BOARD_STORE_NAME, boardToSave, true);

            const boardsNote = document.querySelector('header .boards-note');
            if (boardsNote) boardsNote.remove();

            modal.classList.remove('visible');
            await renderUI({ boardParseError: false });
            filterNotesByBoard((boardToSave.gdid || boardToSave.id).toString());
            showToast((currentEditingBoard ? (_('updatingBoard') || "Обновяване на борд...") : (_('savingBoard') || "Записване на борд...")), 2000);
            showToast(_('settingsSavedSuccess'));

        } catch (error) {
            console.error("Board operation failed:", error);
            showToast("Error: " + error.message, 5000);
        } finally {
            isBoardSaveInProgress = false;
            saveBtn.disabled = false;
        }
    };

    // Initialize modal with current active board at the very end
    let activeBoard = null;
    const currentIdStr = (currentBoardFilter || "").toString();
    if (currentIdStr && currentIdStr !== 'all' && currentIdStr !== 'reminders' && !currentIdStr.includes('calendar')) {
        const tId = currentIdStr;
        activeBoard = boardsData.find(b => (b.gdid || b.id || "").toString() === tId);
    }
    resetInputs(activeBoard);

    modal.classList.add('visible');
}

/**
 * Инициализира функционалността за местене (dragging) на FAB бутона
 */
function initFABDragging() {
    const fab = document.getElementById('add-note-fab');
    if (!fab) return;

    // Use common logic with long press callback
    makeElementDraggable(fab, 'addNoteFabPosition', false, () => {
        if (typeof showNewBoardModal === 'function') showNewBoardModal();
        if (navigator.vibrate) navigator.vibrate(50);
    });

    fab.addEventListener('click', (e) => {
        // We don't need to check isDragging/isLongPress here because
        // makeElementDraggable blocks the event if it was a drag or long press!
        if (e.ctrlKey) {
            if (typeof showNewBoardModal === 'function') showNewBoardModal();
        } else {
            if (typeof createNewNote === 'function') createNewNote();
        }
    });
}

/**
 * Показва попъп за изтриване на папки от Google Drive.
 */
function showFolderDeletePopup() {
    console.log('Deleting folder...');
    const defaultFolder = 'multinotes_data';
    let folderNamesStr = localStorage.getItem('gdrive_folder_names');
    let folderNames = folderNamesStr ? JSON.parse(folderNamesStr) : [];

    // Филтрираме активната папка и основната папка - те не могат да се трият
    const currentActive = (typeof activeFolderName !== 'undefined') ? activeFolderName : localStorage.getItem('active_folder_name');
    let allPossibleFolders = [...folderNames];
    if (!allPossibleFolders.includes('AppDataFolder')) allPossibleFolders.push('AppDataFolder');
    const otherFolders = allPossibleFolders.filter(name => name !== currentActive && name !== defaultFolder);

    if (otherFolders.length === 0) {
        showToast(_('noData') || "Няма други папки за изтриване.");
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.85);display:flex !important;align-items:center;justify-content:center;z-index:999999 !important;opacity:1 !important;visibility:visible !important;pointer-events:auto !important;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    const box = document.createElement('div');
    box.className = 'modal-content-box';
    box.style.cssText = `background-color:#2c2c2c;background-image:url('Frame.jpg');background-size:cover;border-radius:12px;padding:50px 20px 20px 20px;width:320px;max-width:95vw;max-height:80vh;display:flex !important;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.6);position:relative;border:1px solid rgba(255,255,255,0.3);opacity:1 !important;visibility:visible !important;transform:none !important;`;

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.className = 'modal-close';
    closeBtn.style.cssText = `position:absolute;top:10px;right:10px;background:#eee;border:none;border-radius:6px;width:40px;height:40px;cursor:pointer;font-size:32px;display:flex;align-items:center;justify-content:center;color:#333;box-shadow:0 2px 5px rgba(0,0,0,0.4);z-index:10;`;
    closeBtn.onclick = () => overlay.remove();
    box.appendChild(closeBtn);

    const title = document.createElement('h3');
    title.textContent = _('selectFolderToDelete') || 'Изберете папка за изтриване:';
    title.style.cssText = 'margin:0 0 20px 0;font-size:1.2em;color:#fff;text-shadow:2px 2px 4px rgba(0,0,0,0.9);text-align:center;font-weight:bold;';
    box.appendChild(title);

    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'overflow-y:auto;flex:1;padding:4px;display:flex;flex-direction:column;gap:10px;width:100%;';

    otherFolders.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'zoom-btn';
        btn.style.cssText = 'width:100%; padding:10px; text-align:center; background: rgba(255,255,255,0.1); color: white; border: 1px solid rgba(255,255,255,0.3);';
        btn.textContent = (name === 'AppDataFolder' && typeof _ === 'function') ? `${name} [${_('emptyFolderBtn')}]` : name;
        btn.onclick = async () => {
            const isAppData = (name === 'AppDataFolder');
            const confirmTemplate = isAppData ? _('confirmEmptyFolder') : _('confirmDeleteFolder');
            const confirmMsg = (confirmTemplate || 'Сигурни ли сте, че искате да изтриете папка "{folderName}"?').replace('{folderName}', name);

            // Затваряме попъпа с избора, преди да покажем въпроса
            overlay.remove();

            const confirmed = await showConfirmation(confirmMsg);
            if (confirmed) {
                try {
                    if (typeof showToast === 'function') showToast(_('loadingFile') || 'Изтриване...');

                    if (isAppData) {
                        await emptyAppDataFolder();
                    } else {
                        const folderId = await getFolderIDByName(name);
                        if (folderId) {
                            await deleteGDriveFile(folderId);
                        }
                    }

                    if (!isAppData) {
                        // Обновяваме локалния списък (само за нормални папки)
                        let newFolderNames = folderNames.filter(f => f !== name);
                        localStorage.setItem('gdrive_folder_names', JSON.stringify(newFolderNames));
                        localStorage.removeItem('boardMenuOrder_' + name);
                        localStorage.removeItem('lastNoteId_' + name);
                        localStorage.removeItem('lastNoteNumord_' + name);
                        localStorage.removeItem('lastBoardId_' + name);
                        localStorage.removeItem('startBoard_' + name);

                        // Синхронизираме промяната в останалите папки
                        await syncGlobalFoldersJson();
                    }

                    showToast(isAppData ? _('folderEmptiedSuccess') : _('folderDeletedSuccess'));

                    // Обновяваме dropdown-а в настройките без презареждане
                    if (typeof populateFoldersDropdown === 'function') populateFoldersDropdown();
                } catch (err) {
                    console.error("Error deleting folder:", err);
                    showToast(_('errorDeleteFolder'));
                }
            }
        };
        listContainer.appendChild(btn);
    });

    box.appendChild(listContainer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

/**
 * Премахва несъществуваща папка от gdrive_folder_names и я обновява в падащото меню.
 */
function removeFolderFromList(folderName) {
    if (!folderName || folderName === 'AppDataFolder') return;
    try {
        let folderNamesStr = localStorage.getItem('gdrive_folder_names');
        let folderNames = folderNamesStr ? JSON.parse(folderNamesStr) : [];
        if (folderNames.includes(folderName)) {
            folderNames = folderNames.filter(n => n !== folderName);
            localStorage.setItem('gdrive_folder_names', JSON.stringify(folderNames));
            localStorage.removeItem('startBoard_' + folderName);
            localStorage.removeItem('boardMenuOrder_' + folderName);
            localStorage.removeItem('lastNoteId_' + folderName);
            localStorage.removeItem('lastNoteNumord_' + folderName);
            localStorage.removeItem('lastBoardId_' + folderName);
            populateFoldersDropdown();
            if (typeof syncGlobalFoldersJson === 'function') syncGlobalFoldersJson();
        }
    } catch (e) {
        console.warn('Error removing folder from list:', e);
    }
}

/**
 * Попълва падащото меню за папки в настройките.
 */
function populateFoldersDropdown() {
    console.log('[DEBUG] populateFoldersDropdown() called');
    const activeFolderSelect = document.getElementById('active-folder-select');
    if (!activeFolderSelect) {
        console.log('[DEBUG] populateFoldersDropdown(): activeFolderSelect DOM element NOT FOUND!');
        return;
    }
    if (!activeFolderSelect.querySelector('option[value="select_folder"]')) {
        const selectOption = document.createElement('option');
        selectOption.value = 'select_folder';
        selectOption.textContent = _('selectFolderOption') || 'Select folder...';
        activeFolderSelect.appendChild(selectOption);
    }
    if (!activeFolderSelect.querySelector('option[value="new_folder"]')) {
        const newOption = document.createElement('option');
        newOption.value = 'new_folder';
        newOption.textContent = _('newFolderOption') || 'New folder...';
        activeFolderSelect.appendChild(newOption);
    }
    let folderNamesStr = localStorage.getItem('gdrive_folder_names');
    let folderNames = folderNamesStr ? JSON.parse(folderNamesStr) : [];
    folderNames = folderNames.filter(n => n && n !== 'AppDataFolder');
    if (typeof activeFolderName !== 'undefined' && activeFolderName && activeFolderName !== 'AppDataFolder' && !folderNames.includes(activeFolderName)) {
        folderNames.push(activeFolderName);
    }
    Array.from(activeFolderSelect.options).forEach(opt => {
        if (opt.value !== 'select_folder' && opt.value !== 'new_folder') {
            opt.remove();
        }
    });
    const insertBeforeNode = activeFolderSelect.querySelector('option[value="select_folder"]') || activeFolderSelect.firstChild;
    folderNames.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (typeof activeFolderName !== 'undefined' && name === activeFolderName) option.selected = true;
        activeFolderSelect.insertBefore(option, insertBeforeNode);
    });
    if (typeof activeFolderName !== 'undefined' && activeFolderName && activeFolderName !== 'AppDataFolder') {
        activeFolderSelect.value = activeFolderName;
    }
}

function updateReloadButtonState() {
    const btn = document.getElementById('reload_button');
    if (!btn) return;
    const hasDirty = allNotesData && allNotesData.some(n => n.type === -1);
    const img = btn.querySelector('img');
    if (hasDirty) {
        btn.style.background = '#e74c3c';
        btn.style.borderRadius = '6px';
        if (img) img.style.filter = 'brightness(0) invert(1)';
    } else {
        btn.style.background = '';
        btn.style.borderRadius = '';
        if (img) img.style.filter = '';
    }
}
async function syncDirtyNotes() {
    if (isOffline) {
        showToast(_('offlineModeMessage') || 'Cannot sync while offline.', 3000);
        return;
    }

    const reloadBtn = document.getElementById('reload_button');
    const reloadImg = reloadBtn?.querySelector('img');
    if (reloadImg) reloadImg.style.animation = 'spin 1.5s linear infinite';
    if (reloadBtn) reloadBtn.style.pointerEvents = 'none';
    try {
        const dirtyNotes = allNotesData.filter(n => n.type === -1);
        if (dirtyNotes.length === 0) {
            showToast(_('noDirtyNotesSync') || "No notes to sync.");
            if (reloadImg) reloadImg.style.animation = '';
            if (reloadBtn) reloadBtn.style.pointerEvents = 'auto';
            return;
        }
        const btn = document.getElementById('sync-dirty-btn');
        let originalHtml = '';
        if (btn) {
            originalHtml = btn.innerHTML;
            btn.disabled = true;
            btn.innerHTML = `<img src="Refresh.png" style="width:20px; height:20px; animation: spin 0.8s linear infinite;"> ` + (_('syncing') || 'Syncing...');
        }

        let successCount = 0;
        let errorCount = 0;
        let skipCount = 0;
        let mediaNeedsSync = false;
        let autoApproveAll = false;

        // Помощна функция за обработка на една бележка
        const processNote = async (note) => {
            try {
                if (useIndexedDb && (!note.gdid || note.gdid === "")) {
                    note.gdid = `L${Date.now()}_${Math.floor(Math.random() * 1000)}`;
                }
                const tempGdid = note.gdid;
                note.type = 0;
                if (useIndexedDb && note.gdid) {
                    await bulkPutDB(NOTE_STORE_NAME, JSON.parse(JSON.stringify(note)), true);
                }

                const success = await syncSingleNoteToGDrive(note);
                if (success) {
                    if (useIndexedDb && tempGdid && tempGdid !== note.gdid) {
                        await bulkPutDB(NOTE_STORE_NAME, JSON.parse(JSON.stringify(note)), true);
                        await deleteFromDB(NOTE_STORE_NAME, tempGdid);
                    }
                    allNotesData = allNotesData.filter(obj =>
                        !(String(obj.id) === String(note.id) && String(obj.gdid) !== String(note.gdid))
                    );
                    if (!allNotesData.includes(note)) allNotesData.push(note);

                    if (tempGdid && tempGdid !== note.gdid) {
                        for (let m of mediaData) {
                            if (String(m.noteid) === String(tempGdid)) {
                                m.noteid = note.gdid;
                                if (useIndexedDb) await bulkPutDB(MEDIA_STORE_NAME, m, true);
                                mediaNeedsSync = true;
                            }
                        }
                    }
                    successCount++;
                    const el = document.querySelector(`.note[data-i="${note.id}"], .note[data-g="${note.gdid}"], .note[data-g="${tempGdid}"]`);
                    if (el) {
                        el.classList.remove('dirty');
                        el.dataset.s = String(note.status);
                        if (note.gdid) el.dataset.g = note.gdid;
                    }
                } else {
                    errorCount++;
                    note.type = -1;
                    if (useIndexedDb) await bulkPutDB(NOTE_STORE_NAME, JSON.parse(JSON.stringify(note)), true);
                }
            } catch (e) {
                console.error("Sync error for note", note.id, e);
                errorCount++;
                note.type = -1;
                if (useIndexedDb) await bulkPutDB(NOTE_STORE_NAME, JSON.parse(JSON.stringify(note)), true);
            }
        };

        for (let i = 0; i < dirtyNotes.length; i++) {
            if (isLoadCancelled) break;
            const note = dirtyNotes[i];

            if (!autoApproveAll) {
                // Създаване на смислено резюме на бележката
                let summary = "";
                if (note.title && note.title.trim() !== "") {
                    summary = `<strong>${note.title}</strong>`;
                    if (note.notetxt) {
                        const snippet = note.notetxt.substring(0, 100).replace(/<[^>]*>/g, '');
                        summary += `<br><small>${snippet}${note.notetxt.length > 100 ? '...' : ''}</small>`;
                    }
                } else if (note.notetxt) {
                    const snippet = note.notetxt.substring(0, 150).replace(/<[^>]*>/g, '');
                    summary = snippet + (note.notetxt.length > 150 ? '...' : '');
                } else {
                    summary = "ID: " + note.id;
                }

                // Добавяме gdid за справка
                if (note.gdid) {
                    summary += `<div style="margin-top:8px; font-size:10px; color:#888;">GDID: ${note.gdid}</div>`;
                }

                const choice = await showSyncChoiceModal(summary);
                if (choice === 'no') {
                    skipCount++;
                    continue;
                } else if (choice === 'all') {
                    autoApproveAll = true;
                    // Преминаваме към паралелно изпълнение за оставащите бележки
                    const remainingNotes = dirtyNotes.slice(i);
                    const pool = new Set();
                    const CONCURRENCY_LIMIT = 5; // Леко по-нисък лимит за по-добра стабилност
                    for (const rNote of remainingNotes) {
                        if (isLoadCancelled) break;
                        if (pool.size >= CONCURRENCY_LIMIT) await Promise.race(pool);
                        const p = processNote(rNote);
                        pool.add(p);
                        p.finally(() => pool.delete(p));
                    }
                    await Promise.all(pool);
                    break; // Излизаме от For цикъла, защото вече сме обработили всичко паралелно
                }
            }

            // Последователно изпълнение (ако не е избрано 'all')
            await processNote(note);
        }


        if (mediaNeedsSync && typeof syncFileWorker === 'function') {
            try {
                await syncFileWorker('media.txt', MEDIA_STORE_NAME, false);
            } catch (e) {
                console.error("Failed to sync media.txt after updating orphan links", e);
            }
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalHtml;
        }
        if (errorCount === 0) {
            showToast(`${_('syncSuccess') || 'Successfully synced'} ${successCount} ${_('notes') || 'notes'}`, 3000);
        } else {
            showToast(`${_('syncSuccess') || 'Synced'} ${successCount} ${_('notes') || 'notes.'} ${errorCount} ${_('errorsOccurred') || 'errors occurred.'}`, 5000);
        }
        if (reloadImg) reloadImg.style.animation = '';
        if (reloadBtn) reloadBtn.style.pointerEvents = 'auto';
        updateReloadButtonState();
    } catch (e) {
        console.error("Critical sync error", e);
        if (reloadImg) reloadImg.style.animation = '';
        if (reloadBtn) reloadBtn.style.pointerEvents = 'auto';
        updateReloadButtonState();
    }
}

async function syncSingleNoteToGDrive(noteObj, retryCount = 0) {
    const isTempGdid = !noteObj.gdid || String(noteObj.gdid) === String(noteObj.id) || String(noteObj.gdid).startsWith('L');
    try {
        if (isTempGdid) {
            const folderId = await getFolderID();
            if (!folderId) return false;
            const fileContent = JSON.stringify(noteObj);
            const newGdid = await createGDriveFile(folderId, 'note.txt', fileContent);
            if (!newGdid) return false;
            noteObj.gdid = newGdid;
            // Тук използваме директен опит за обновяване без рекурсия за вътрешната стъпка
            try {
                await updateGDriveFile(newGdid, JSON.stringify(noteObj));
                return true;
            } catch (e) {
                console.warn("[Sync] Internal note update after creation failed (non-critical):", e);
                return true; // Файлът е създаден успешно, затова връщаме true
            }
        } else {
            try {
                return await updateGDriveFile(noteObj.gdid, JSON.stringify(noteObj));
            } catch (e) {
                // Ако файлът не е намерен (404), го пресъздаваме (само един път)
                if (retryCount === 0 && e.message && e.message.includes('Status: 404')) {
                    console.warn(`[Sync] File ${noteObj.gdid} not found on GDrive. Attempting to recreate...`);
                    noteObj.gdid = "";
                    return await syncSingleNoteToGDrive(noteObj, 1);
                }
                throw e;
            }
        }
    } catch (e) {
        console.error("syncSingleNoteToGDrive error:", e);
        return false;
    }
}

async function handleSaveDbToFolder() {
    if (isOffline) {
        showToast((typeof _ === 'function' ? _('offlineModeMessage') : 'Offline mode'), 3000);
        return;
    }
    const folderId = await getFolderID();
    if (!folderId) return;

    // --- ПРИНУДИТЕЛНО ЗАРЕЖДАНЕ ОТ IndexedDB: Винаги взимаме данните от базата за най-голяма сигурност ---
    console.log('[SaveDB] 🔄 Forcing data load from IndexedDB for migration...');
    try {
        const dbNotes = await getAllFromDB(NOTE_STORE_NAME);
        if (dbNotes && dbNotes.length > 0) {
            allNotesData = dbNotes;
            console.log('[SaveDB] ✅ Successfully loaded notes from IndexedDB:', allNotesData.length);
        } else {
            console.warn('[SaveDB] ⚠️ No notes found in IndexedDB store.');
        }

        const dbBoards = await getAllFromDB(BOARD_STORE_NAME);
        if (dbBoards && dbBoards.length > 0) {
            boardsData = dbBoards;
            console.log('[SaveDB] ✅ Successfully loaded boards from IndexedDB:', boardsData.length);
        } else {
            console.warn('[SaveDB] ⚠️ No boards found in IndexedDB store.');
        }

        const dbMedia = await getAllFromDB(MEDIA_STORE_NAME);
        if (dbMedia && dbMedia.length > 0) {
            mediaData = dbMedia;
            console.log('[SaveDB] ✅ Successfully loaded media from IndexedDB:', mediaData.length);
        }
    } catch (e) {
        console.error('[SaveDB] ❌ Failed to read from IndexedDB:', e);
        // Продължаваме с паметта, ако базата е недостъпна
    }

    // Проверка за празна папка
    const checkResult = await checkFolderEligibilityForSave(folderId);
    if (!checkResult.eligible) {
        let msg = (typeof _ === 'function' ? _('errorFolderNotEmpty') : 'Folder is not empty!');
        if (checkResult.conflicts && checkResult.conflicts.length > 0) {
            const conflictNames = checkResult.conflicts.slice(0, 5).join(', ') + (checkResult.conflicts.length > 5 ? '...' : '');
            msg += ` (${conflictNames})`;
        }
        showToast(msg, 7000);
        return;
    }

    const confirmed = await showConfirmation((typeof _ === 'function' ? _('confirmSaveDbToFolder') : 'Save data to this folder?'));
    if (confirmed) {
        const success = await migrateDataToNewFolder(folderId);
        if (success) {
            // Запазваме съществуващата подредба, ако има такава
            let boardTitles;
            const existingBmo = localStorage.getItem('boardMenuOrder');
            if (existingBmo) {
                try {
                    const parsed = JSON.parse(existingBmo);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                        boardTitles = parsed;
                    }
                } catch (e) { /* ignore */ }
            }
            // Ако няма съществуваща подредба, създаваме от boardsData
            if (!boardTitles) {
                const uniqueBoards = [];
                const seen = new Set();
                (boardsData || []).forEach(b => {
                    if (b.title && !seen.has(b.title)) {
                        uniqueBoards.push(b);
                        seen.add(b.title);
                    }
                });
                boardTitles = uniqueBoards
                    .sort((a, b) => {
                        const na = a.numord !== undefined && a.numord !== null ? a.numord : Infinity;
                        const nb = b.numord !== undefined && b.numord !== null ? b.numord : Infinity;
                        return na - nb;
                    })
                    .map(b => String(b.title));
                localStorage.setItem('boardMenuOrder', JSON.stringify(boardTitles));
            }
            // Синхронизираме folders.json с актуалните данни
            await syncGlobalFoldersJson();

            // Актуализираме времевия маркер, за да предотвратим фалшива индикация за нови файлове след рестарта
            if (useIndexedDb) {
                await saveConfig('lastGDTimestamp', Date.now());
            }

            console.log('[SaveDB] boardMenuOrder synced:', boardTitles);
            showToast((typeof _ === 'function' ? _('dbSavedToFolderSuccess') : 'Database saved successfully!'), 7000);
            console.log('%c Migration Complete! Successfully moved data to the new folder. ', 'background: #27ae60; color: white; font-weight: bold; padding: 5px;');
            setTimeout(() => {
                location.reload();
            }, 5000);
        }
    }
}

async function checkFolderEligibilityForSave(folderId) {
    if (isOffline) return { eligible: false, conflicts: ['Offline mode'] };
    const sendRequest = async (token) => {
        let query = `'${folderId}' in parents and trashed = false`;
        // За AppDataFolder търсим само в неговия контекст
        const spaces = (folderId === 'appDataFolder') ? 'appDataFolder' : 'drive';
        return fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&spaces=${spaces}&fields=files(id,name,mimeType)`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
    };
    try {
        let storedTokenString = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
        if (!storedTokenString) return { eligible: false, conflicts: ['No auth token'] };
        let tokenData = JSON.parse(storedTokenString);
        let resp = await sendRequest(tokenData.access_token);
        if (resp.status === 401) {
            const refresh = await refreshAuthToken(false);
            if (refresh && refresh.pass) resp = await sendRequest(refresh.tokenData.access_token);
        }
        if (!resp.ok) return { eligible: false, conflicts: ['API request failed'] };
        const result = await resp.json();
        const files = result.files || [];
        if (files.length === 0) return { eligible: true, conflicts: [] };
        // Специално правило за AppDataFolder и AppSettings
        if (folderId === 'appDataFolder') {
            const nonSettingsFiles = files.filter(f => !(f.name === 'AppSettings' && f.mimeType === 'application/vnd.google-apps.folder'));
            if (nonSettingsFiles.length === 0) {
                return { eligible: true, conflicts: [] };
            } else {
                return { eligible: false, conflicts: nonSettingsFiles.map(f => f.name) };
            }
        }
        return { eligible: false, conflicts: files.map(f => f.name) };
    } catch (e) {
        console.error("checkFolderEligibilityForSave error:", e);
        return { eligible: false, conflicts: ['Network or parse error'] };
    }
}

/**
 * Изчиства осиротели изображения (файлове в папката Images, които нямат запис в mediaData).
 */
async function cleanupOrphanedImages() {
    if (isOffline || isLoadCancelled) return;
    const mediaPaths = new Set(mediaData.map(m => m.path));
    const mediaGdidPaths = new Set(mediaData.map(m => m.pathGD).filter(id => !!id));
    console.log(`[Cleanup] Starting orphaned images check. Known media files: ${mediaPaths.size}`);
    // --- ЛОКАЛНА ПАПКА ---
    if (useLocalFolder && typeof dirHandle !== 'undefined' && dirHandle) {
        try {
            const imagesHandle = await dirHandle.getDirectoryHandle('Images', { create: false }).catch(() => null);
            if (imagesHandle) {
                let deletedCount = 0;
                for await (const entry of imagesHandle.values()) {
                    if (entry.kind === 'file' && !mediaPaths.has(entry.name)) {
                        if (entry.name.startsWith('.') || entry.name === 'media.txt') continue;
                        console.log(`[Cleanup-Local] Deleting orphaned file: ${entry.name}`);
                        await imagesHandle.removeEntry(entry.name);
                        deletedCount++;
                    }
                }
                if (deletedCount > 0) console.log(`[Cleanup-Local] Removed ${deletedCount} files.`);
            }
        } catch (e) { console.error("[Cleanup-Local] Error:", e); }
    }
    // --- GOOGLE DRIVE ---
    if (useGoogleDb && typeof authToken !== 'undefined' && authToken) {
        try {
            const imagesFolderId = folderIds['Images'] || localStorage.getItem('gdrive_folder_id_Images');
            if (imagesFolderId) {
                const response = await fetch(`https://www.googleapis.com/drive/v3/files?q='${imagesFolderId}'+in+parents+and+trashed=false&fields=files(id,name)`, {
                    headers: { 'Authorization': `Bearer ${authToken.access_token}` }
                });
                if (response.ok) {
                    const result = await response.json();
                    const files = result.files || [];
                    let deletedCount = 0;
                    for (const file of files) {
                        if (!mediaPaths.has(file.name) && !mediaGdidPaths.has(file.id)) {
                            console.log(`[Cleanup-GDrive] Deleting orphaned file: ${file.name} (${file.id})`);
                            if (typeof deleteGDriveFile === 'function') await deleteGDriveFile(file.id);
                            deletedCount++;
                        }
                    }
                    if (deletedCount > 0) console.log(`[Cleanup-GDrive] Removed ${deletedCount} files.`);
                }
            }
        } catch (e) { console.error("[Cleanup-GDrive] Error:", e); }
    }
}

// Задаваме периодична проверка за осиротели изображения
// setInterval(cleanupOrphanedImages, 10 * 60 * 1000); // На всеки 10 минути

