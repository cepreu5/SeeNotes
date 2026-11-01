// https://multinotes.app/gdviewer
// terser main.js --compress --mangle --toplevel --output mainn.js
// terser mainAll.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output mainn.js
// terser db.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output dbb.js
// terser calendar.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output calendarr.js
// node -e "const fs=require('fs'); const T=require('terser'); (async()=>{ const code=fs.readFileSync('main.js','utf8'); const result=await T.minify(code,{ compress:{ arrows:true, booleans:true, collapse_vars:true, comparisons:true, dead_code:true, drop_console:true, hoist_funs:true, if_return:true, passes:3, pure_funcs:['console.log'] }, mangle:{ reserved:['gisLoaded'], keep_fnames: /^gisLoaded$/ }, toplevel:true, ecma:2020, module:true, format:{ wrap_iife:true } }); fs.writeFileSync('mainn.js',result.code); })();"

// terser main.js --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true -c pure_funcs=["console.log"] --output mainn.js

const version = 'Beta 1.77'; // App version — трябва да съвпада с CACHE_NAME в sw.js (multinotes-b1.77)
let debug = true; // Глобален флаг за дебъг режим
window.isAppErrorState = false; // Флаг за грешки (изтекъл сертификат и др.)

const SUPPORTED_LANGUAGES = [
    { id: 'en', label: 'EN' },
    { id: 'ru', label: 'RU' },
    { id: 'bg', label: 'BG' },
    { id: 'xx', label: 'XX' }
];

const appSettingsKeys = [
    'zoomLevel', 'noteFontSize', 'modalFontSize', 'showDatemod', 'oneTapLink',
    'imgBgrd', 'notesBgrd', 'showBoardNoteCount', 'showNewBoard', 'showBoardAll',
    'showBoardRemind', 'showPhotosBoard', 'showVideosBoard', 'showSoundsBoard',
    'showOtherBoard', 'showWeeklyCalendar', 'enableNoteSorting', 'sortCriteria',
    'sortInReverse', 'sortRemindersTop', 'startBoard', 'maxSavedSearches',
    'hideAssistant', 'privacyAutoProtect', // 'useGoogleDb', 'useLocalDb', 'useArhDb', 'useIndexedDb', 
    'language', 'showAdvancedSettings', 'savedSearches', 'modalWidth', 'modalHeight', 'singleNoteMode',
    'popupMenuBtnPosition', 'kbFabPosition', 'scrollTopBtnPosition', 'boardMenuOrder'
];

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

let pass = false;

// --- Demo Mode ---
let DEMO_MODE = false;
const DEMO_NOTE_LIMIT = 5;

// =================================================================================
// I. ГЛОБАЛНИ ПРОМЕНЛИВИ И КОНСТАНТИ
// =================================================================================

// --- Конфигурация и версия ---
const CLIENT_ID = '1090128984423-80074rvs8n45v787044d9ca1bvahla98.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/userinfo.email';

// --- Глобално състояние на приложението ---
let allNotesData = []; // Съхранява всички бележки за календара
let boardsData = []; // Съхранява данните за бордовете
let mediaData = []; // Съхранява данните за медия
let folderIds = {}; // Съхранява ID-тата на папките за медия
let currentBoardFilter = 'all';
let previousBoardFilter = 'all'; // Запомняме борда преди търсенето
let currentBackground = 'Board.png';
let currentCalendarDate = new Date();
let currentWeeklyViewDate = new Date(); // За новия седмичен изглед
let authToken = null;
let token;
let ts; // Време на първо стартиране на приложението
let tokenRemainingDays = null; // Остават дни валидност на токена
let dirHandle = null; // За локален достъп до файловата система
let isInitialLoad = true; // Флаг за първоначално зареждане
let isLoadCancelled = false; // Флаг за прекратяване на зареждането
let isDbOwner = true; // Флаг, който показва дали потребителят е собственик на базата
let updatedNoteGdims = []; // Съхранява gdid на новите/обновените бележки
let tokenClient = null; // Client for silent auth refresh
let notesBgrdChanged = false; // Flag to track if notes background setting changed

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
let dbNoteIdTypeGlobal = null; // Запомня типа на връзката в базата
let dataIntegrityIssues = []; // Track missing/duplicate IDs during load
let initialLoadTime = null; // Time taken for initial Google Drive load in seconds
let initialLoadTimestamp = null; // Timestamp when the load finished
let isAppStarted = false; // Guard for startApp
let isMainLogicRunning = false; // Guard for mainLogic concurrency
let isOfflineMode = false; // Глобален флаг за офлайн режим

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
// const eyeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const eyeOffIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><path d="M3 3l18 18"></path></svg>`;
const calendarIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="5" width="16" height="16" rx="2" /><line x1="16" y1="3" x2="16" y2="7" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="4" y1="11" x2="20" y2="11" /><circle cx="12" cy="16" r="1.5" /></svg>`;
const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" /></svg>`;
const weeklyViewIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`;
// Хиксче за затваряне на мини календара: вектор, за да е центрирано в кръгчето
// еднакво на всяка система. Текстовият „×" зависи от шрифта и на Windows излиза встрани.
const closeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2.6" stroke="currentColor" fill="none" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>`;
// „Затвори всички" в лентата на прозореца: същата икона като в cx-notes (два листа, горният с хиксче).
// Плътният преден лист е в сиво-синьото на cx-notes, за да се чете и върху хартията на бележката.
const closeAllNotesIconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="1.6" y="7.6" width="14.8" height="14.8" rx="2.6" fill="none" stroke="currentColor" stroke-width="2.2" />
    <rect class="close-all-icon-front" x="7.6" y="1.6" width="14.8" height="14.8" rx="2.6" fill="#546E7A" stroke="currentColor" stroke-width="2.2" />
    <path d="M11.4 5.4l7.2 7.2M18.6 5.4l-7.2 7.2" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" />
</svg>`;
// „Скрий всички" / „Покажи всички" в лентата на отворените бележки: двойна стрелка надолу (скрий)
// и двойна стрелка нагоре (покажи) - собственикът поиска стрелки вместо око (порт от cx-notes b2.74).
const hideAllNotesIconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 6.4l6 5.6 6-5.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M6 13.4l6 5.6 6-5.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
const showAllNotesIconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 17.6l6-5.6 6 5.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M6 10.6l6-5.6 6 5.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
// Стрелките за скрол на лентата с отворените бележки (собственикът, 25.10.2026: „Плъзгането на лентата
// при препълване не се получава, местят се плочките - ще трябва да сложим тесни бутони с стрелки в
// двата края в този случай"). Малък chevron 10x10 в цвета на текста, като останалите икони в лентата.
const openNotesBarPrevIconSvg = `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
    <path d="M6.4 1.6L3 5l3.4 3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
const openNotesBarNextIconSvg = `<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
    <path d="M3.6 1.6L7 5l-3.4 3.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
</svg>`;
const boardIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="black" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="12" y1="4" x2="12" y2="20" /></svg>`;
const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21V3M5 10l7-7 7 7"/></svg>`;
const pencilIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(2, 2) scale(0.85)"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></g></svg>`;
const emptyTrashIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 100%; height: 100%;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="14" y2="17"></line><line x1="14" y1="11" x2="10" y2="17"></line></svg>`;
const restoreIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`;
const noteIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M13 20l7 -7" /><path d="M13 20v-6a1 1 0 0 1 1 -1h6v-7a2 2 0 0 0 -2 -2h-12a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7" /></svg>`;
const clockIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" /></svg>`;
const lockIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
const saveSearchSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
const attachmentIcons = [
    { type: 1, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6l1.5-2h3L15 6"/><circle cx="12" cy="13" r="3"/></svg>` },
    { type: 2, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24" ><circle cx="7" cy="12" r="4" /><circle cx="17" cy="12" r="4"/><line x1="6" y1="16" x2="18" y2="16" stroke="black" stroke-width="1" /></svg>` },
    { type: 3, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 2v6h6"/></svg>` },
    { type: 4, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>` },
    { type: 5, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>` },
    { type: 6, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="10" r="2"/><path d="M8 16c0-1.33 2.67-2 4-2s4 .67 4 2"/></svg>` }
];

let currentLang = localStorage.getItem('language') || 'en';

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
    '#FBCB39', '#FBFBCD', '#FFC5D2', '#B6FFCD', '#B2DAFF'
];

const noteBgCache = new Map();

// --- Optimization: Preload unique backgrounds to avoid 'checkered' loading and reduce memory ---
// --- Optimization: Preload unique backgrounds to avoid 'checkered' loading and reduce memory ---
async function preloadNoteBackgrounds(notesData) {
    const notesBgrdEnabled = localStorage.getItem('notesBgrd') !== 'false';
    if (!notesBgrdEnabled) return;

    const needed = new Set();
    notesData.forEach(note => {
        if (note.status === 1) return;
        const noteColor = note.color;
        const color = (noteColor !== null && noteColor >= 0 && noteColor <= 9) ? noteColorMap[noteColor] : '#FBFF86';
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
    const data = [];
    let parseError = false;
    results.forEach(({ res }) => {
        if (!res || !res.body || res.body.trim() === '') return;
        try {
            const content = JSON.parse(res.body);
            if (filenameForError === 'note.txt') {
                if (typeof content === 'object' && content !== null && !Array.isArray(content)) {
                    data.push(content);
                }
            } else {
                if (Array.isArray(content)) {
                    data.push(...content);
                } else if (typeof content === 'object' && content !== null) {
                    data.push(content);
                }
            }
        } catch (e) {
            parseError = true;
            console.log(`Error parsing content from a '${filenameForError}' file:`, e);
        }
    });
    return { data, parseError };
}

async function loadAndParseFile(filename, folderId, modifiedSince = null, onProgress = null) {
    const results = await fetchFiles(filename, folderId, onProgress, modifiedSince);
    return await parseFileResults(results, filename);
}

async function fetchAllData(folderIdFromPrompt, modifiedSince = null) {
    let folderId = folderIdFromPrompt || await getFolderID();
    if (!folderId) {
        if (useIndexedDb && useGoogleDb) {
            try {
                await fetchAllDataLocal();
                if (allNotesData.length > 0) {
                    showToast(_('loadedFromLocalNoDrive'), 5000);
                    return { boardParseError: false };
                }
            } catch (e) { }
        }
        showMessagePopup(_('errorFolderNotFound'));
        throw new Error("Main folder ID not found.");
    }
    loaderText.textContent = _('loadingFile') + " ...";
    const onNoteProgress = (loaded, total) => {
        loaderText.textContent = `${_('loadingFile')} ${loaded} ${_('of')} ${total}`;
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
    if (boardsData.length === 0) {
        showToast(_('errorNoBoardFilesFound'), 15000);
        return { error: 'NO_BOARD_FILES' };
    }
    if (allNotesData.length === 0) {
        showToast(_('errorNoNoteFilesFound'));
        return { error: 'NO_NOTE_FILES' };
    }
    return { boardParseError: boardRes.parseError };
}

async function runGoogleDriveSync() {
    const loaderTitle = document.getElementById('loader-title');
    const useIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
    if (!useIndexedDb) return 0;

    const updateOnly = localStorage.getItem('updateFromSource') !== 'false';
    let lastSyncTimestamp = (updateOnly && dbExists) ? await getConfig('lastGDTimestamp') : null;
    if (lastSyncTimestamp) lastSyncTimestamp = parseInt(lastSyncTimestamp, 10);

    const modifiedSince = lastSyncTimestamp ? new Date(lastSyncTimestamp).toISOString() : null;
    if (loaderTitle) {
        loaderTitle.innerText = modifiedSince ?
            _('checkingForGDriveUpdates').replace('{date}', new Date(lastSyncTimestamp).toLocaleString(currentLang)) :
            _('initialGDriveSync');
    }

    const folderId = await getFolderID();
    if (!folderId) return 0;

    let updatedFilesCount = 0;
    const gdidMap = new Map(); // Track duplicates during GDrive sync
    const syncFileWorker = async (filename, storeName, isNote = false) => {
        const files = await fetchFiles(filename, folderId, null, modifiedSince);
        if (files.length > 0) {
            updatedFilesCount += files.length;
            const { data } = await parseFileResults(files, filename);
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
                await bulkPutDB(storeName, data, true);
                if (filename === 'media.txt') {
                    data.forEach(n => {
                        const i = mediaData.findIndex(m => m.gdid === n.gdid);
                        if (i !== -1) mediaData[i] = n; else mediaData.push(n);
                    });
                } else if (filename === 'board.txt') {
                    data.forEach(n => {
                        const i = boardsData.findIndex(b => b.gdid === n.gdid);
                        if (i !== -1) boardsData[i] = n; else boardsData.push(n);
                    });
                }
                if (isNote) data.forEach(note => updatedNoteGdims.push(note.gdid));
            }
        }
    };

    // loaderText.textContent = _('checkingForGDriveUpdates').split('{')[0] + "...";
    console.time("runGoogleDriveSync_Parallel");
    await Promise.all([
        syncFileWorker('board.txt', BOARD_STORE_NAME, false),
        syncFileWorker('media.txt', MEDIA_STORE_NAME, false),
        syncFileWorker('note.txt', NOTE_STORE_NAME, true)
    ]);
    console.timeEnd("runGoogleDriveSync_Parallel");

    await saveConfig('lastGDTimestamp', Date.now());
    loaderText.textContent = _('syncFinishedLoadingData');
    return updatedFilesCount;
}

/**
 * Cached license data from URL token decryption.
 * Prevents multiple expensive crypto operations.
 */
let cachedLicenseData = null;

/**
 * Decrypts the URL license token and caches the result.
 * Returns cached data on subsequent calls.
 * @returns {Promise<{email: string|null, validityDays: number, ageInDays: number, remainingDays: number, pass: boolean}>}
 */
async function decryptLicenseToken() {
    let urlToken = localStorage.getItem('urlToken');

    // Check for URL token parameter and save to localStorage
    const url = new URL(window.location.href);
    const urlTokenParam = url.searchParams.get("token");
    if (urlTokenParam) {
        if (urlTokenParam !== urlToken) {
            localStorage.setItem('urlToken', urlTokenParam);
            urlToken = urlTokenParam;
            cachedLicenseData = null; // Invalidate cache
        }
    }

    // Return cached result only if it matches current token presence
    if (cachedLicenseData !== null) {
        if (!urlToken && !cachedLicenseData.urlTokenUsed) return cachedLicenseData;
        if (urlToken && cachedLicenseData.urlTokenUsed === urlToken) return cachedLicenseData;
    }

    // Ensure ts is available (first start timestamp)
    if (!ts) {
        ts = await getFirstStartEncoded();
    }

    // If no ts exists at all, pretend it started just now (so new users pass the check)
    const startTs = ts ? parseInt(ts, 10) : Date.now();
    const ageInDays = (Date.now() - startTs) / (1000 * 60 * 60 * 24);

    let validityInDays = 30;
    let decryptedEmail = null;

    if (urlToken) {
        try {
            const b64 = urlToken.replace(/-/g, '+').replace(/_/g, '/');
            const pad = b64 + '='.repeat((4 - b64.length % 4) % 4);
            const raw = Uint8Array.from(atob(pad), c => c.charCodeAt(0));
            const iv = raw.slice(0, 12), data = raw.slice(12);
            const key = await crypto.subtle.importKey(
                'raw',
                new TextEncoder().encode(CLIENT_ID.match(/-(.{16})/)[1]),
                { name: 'AES-GCM' },
                false,
                ['decrypt']
            );
            const out = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
            const parts = new TextDecoder().decode(out).split('|');
            decryptedEmail = parts[0];
            const tokenValidity = parts[2];

            if (tokenValidity && !isNaN(parseInt(tokenValidity))) {
                validityInDays = parseInt(tokenValidity, 10);
            }
        } catch (error) {
            console.log("Error decrypting license token:", error);
            validityInDays = 0; // Invalidate if decryption fails
        }
    } else {
        console.log("No URL license token found. Using default 30-day trial.");
    }

    const remainingDays = Math.max(0, Math.floor(validityInDays - ageInDays)) + 1;
    const isValid = ageInDays < validityInDays;

    cachedLicenseData = {
        urlTokenUsed: urlToken,
        email: decryptedEmail,
        validityDays: validityInDays,
        ageInDays: ageInDays,
        remainingDays: remainingDays,
        pass: isValid
    };

    console.log(`License check: Age: ${ageInDays.toFixed(2)} days, Validity: ${validityInDays} days, Remaining: ${remainingDays} days`);

    return cachedLicenseData;
}

/**
 * Refreshes the Google Auth Token silently if possible.
 */
// Singleton promise to prevent multiple concurrent refresh attempts
let refreshPromise = null;

async function refreshAuthToken() {
    if (refreshPromise) return refreshPromise;

    refreshPromise = new Promise(async (resolve, reject) => {
        console.log("Refreshing auth token...");
        try {
            // Wait for Google Identity Services to load (with timeout)
            const waitForGis = () => new Promise((res, rej) => {
                if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                    res(true);
                    return;
                }
                let attempts = 0;
                const maxAttempts = 50; // 5 секунди (50 * 100ms) — толкова чакаме GIS, преди да покажем логина
                const checkInterval = setInterval(() => {
                    attempts++;
                    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
                        clearInterval(checkInterval);
                        res(true);
                    } else if (attempts >= maxAttempts) {
                        clearInterval(checkInterval);
                        rej(new Error("Google Identity Services not loaded after 5 seconds."));
                    }
                }, 100);
            });

            try {
                await waitForGis();
            } catch (gisError) {
                console.warn("GIS not available, cannot refresh token silently:", gisError.message);
                reject(new Error("Google Identity Services not loaded. User interaction required."));
                return;
            }
            const client = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (tokenResponse) => {
                    clearTimeout(requestTimeout); // Спираме таймера при отговор
                    if (tokenResponse && tokenResponse.access_token) {
                        const tokenWithTimestamp = { ...tokenResponse, issued_at: Date.now() };
                        // Determine storage based on existing token location or rememberMe
                        // --- FIX: Prioritize updating sessionStorage if it exists, to match checkAuth priority ---
                        if (sessionStorage.getItem('google_auth_token')) {
                            sessionStorage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                        }

                        const rememberMe = localStorage.getItem('google_auth_token') !== null ||
                            localStorage.getItem('rememberMe') === 'true';

                        if (rememberMe) {
                            localStorage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                        } else if (!sessionStorage.getItem('google_auth_token')) {
                            sessionStorage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                        }

                        console.log("Token refreshed successfully.");
                        resolve({ pass: true, tokenData: tokenWithTimestamp });
                    } else {
                        console.warn("Token refresh failed:", tokenResponse);
                        // Вместо да reject-ваме веднага, връщаме pass: false, за да може
                        // checkAuth да обработи това като "нужен е логин"
                        resolve({ pass: false, error: tokenResponse });
                    }
                },
            });

            // Таймер за безопасност: ако Google не отговори до 5 секунди
            // (b1.73: беше 30 секунди — при изтекла сесия приложението висеше
            // половин минута, преди да покаже логин страницата)
            const requestTimeout = setTimeout(() => {
                reject(new Error("Token refresh request timed out after 5s."));
            }, 5000);

            // Request the token (silent refresh using login_hint)
            // Важно: Ако няма login_hint, това ще покаже прозорец (което не искаме при silent refresh),
            // но prompt: 'none' предотвратява това и връща грешка, ако е нужна интеракция.
            const loginHint = localStorage.getItem('google_login_hint') ||
                (cachedLicenseData && cachedLicenseData.email_hint);

            if (loginHint) {
                client.requestAccessToken({ hint: loginHint, prompt: 'none' });
            } else {
                clearTimeout(requestTimeout);
                console.warn("No login hint available for silent refresh.");
                resolve({ pass: false, reason: "no_hint" });
            }

        } catch (error) {
            reject(error);
        }
    }).finally(() => {
        refreshPromise = null; // Винаги зачистваме promise-а
    });

    try {
        const result = await refreshPromise;
        return result;
    } finally {
        refreshPromise = null; // Reset promise so next time we can try again
    }
}

/**
 * Downloads file contents with Concurrency Control & 'Kick' mechanism.
 */
async function fetchFiles(filename, folderId, onProgress, modifiedSince = null) {
    let query = `'${folderId}' in parents and name = '${filename}' and mimeType='text/plain' and trashed = false`;
    if (modifiedSince) query += ` and modifiedTime > '${modifiedSince}'`;
    let allFiles = [], pageToken = null;
    if (filename) console.time(`fetchFiles_${filename}_List`);

    const listFiles = async () => {
        let files = [];
        let token = null;
        do {
            const resp = await gapi.client.drive.files.list({ q: query, fields: 'files(id, name), nextPageToken', pageSize: 1000, pageToken: token });
            files.push(...resp.result.files);
            token = resp.result.nextPageToken;
        } while (token);
        return files;
    };

    try {
        allFiles = await listFiles();
    } catch (e) {
        // Build robust 401 check
        const is401 = (e.result && e.result.error && e.result.error.code === 401) ||
            (e.status === 401) ||
            (e.result && e.result.error && e.result.error.status === 'UNAUTHENTICATED');

        if (is401) {
            console.warn("Got 401 during file list, attempting token refresh...");
            try {
                await refreshAuthToken();
                // Small delay to let old connections close before making new requests
                await new Promise(r => setTimeout(r, 300));
                allFiles = await listFiles();
            } catch (refreshError) {
                console.error("Token refresh failed:", refreshError);
                throw new Error("Drive API List failed (Auth).");
            }
        } else {
            throw new Error("Drive API List failed.");
        }
    }

    if (filename) {
        try { console.timeEnd(`fetchFiles_${filename}_List`); } catch (e) { }
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
            const response = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
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
                    const retryResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`, {
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
    try {
        const resp = await gapi.client.drive.files.list({ q: `'${folderId}' in parents and name = '${fileName}'`, fields: 'files(id, name)', pageSize: 1 });
        return resp.result.files?.[0]?.id || null;
    } catch (e) { return null; }
}

async function getFolderID() {
    try {
        const multinotesDataId = await getMultinotesDataFolderID();
        if (!multinotesDataId) return null;

        const listFolders = async () => {
            const folderNames = ["Other", "Sound", "Video", "Images"];
            await Promise.all(folderNames.map(async (name) => {
                const cachedId = localStorage.getItem(`gdrive_folder_id_${name}`);
                if (cachedId) { folderIds[name] = cachedId; return; }
                const resp = await gapi.client.drive.files.list({ q: `'${multinotesDataId}' in parents and name = '${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`, fields: 'files(id)', pageSize: 1 });
                const id = resp.result.files?.[0]?.id || "";
                folderIds[name] = id;
                if (id) localStorage.setItem(`gdrive_folder_id_${name}`, id);
            }));
        };

        try {
            await listFolders();
        } catch (error) {
            const is401 = (error.result?.error?.code === 401) || (error.status === 401) || (error.result?.error?.status === 'UNAUTHENTICATED');
            if (is401) {
                console.warn("Got 401 in getFolderID, attempting refresh...");
                await refreshAuthToken();
                await listFolders();
            } else {
                throw error;
            }
        }
        return multinotesDataId;
    } catch (e) {
        console.error("Error in getFolderID:", e);
        throw e;
    }
}

async function getMultinotesDataFolderID() {
    const cachedId = localStorage.getItem('gdrive_multinotes_data_id');
    if (cachedId) return cachedId;

    const listRequest = () => gapi.client.drive.files.list({
        q: "name='multinotes_data' and mimeType='application/vnd.google-apps.folder' and trashed=false",
        fields: 'files(id)',
        pageSize: 1
    });

    try {
        const resp = await listRequest();
        const id = resp.result.files?.[0]?.id || null;
        if (id) localStorage.setItem('gdrive_multinotes_data_id', id);
        return id;
    } catch (error) {
        const is401 = (error.result?.error?.code === 401) || (error.status === 401) || (error.result?.error?.status === 'UNAUTHENTICATED');
        if (is401) {
            console.warn("Got 401 in getMultinotesDataFolderID, attempting refresh...");
            try {
                const refreshResult = await refreshAuthToken();
                if (refreshResult && refreshResult.pass) {
                    const resp = await listRequest();
                    const id = resp.result.files?.[0]?.id || null;
                    if (id) localStorage.setItem('gdrive_multinotes_data_id', id);
                    return id;
                }
            } catch (refreshError) {
                console.error("Token refresh failed in getMultinotesDataFolderID:", refreshError);
            }
            showToast(_('errorSessionExpired'));
            handleSignoutClick();
            throw new Error("Google Drive Unauthorized");
        }
        return null;
    }
}

// =================================================================================

function gisLoaded() {
    // Задаваме езика преди да се покаже login box-а
    setLanguage(currentLang);
    // Ако вече има токен
    const sessionToken = sessionStorage.getItem('google_auth_token');
    const localToken = localStorage.getItem('google_auth_token');
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (tokenResponse) => {
            if (tokenResponse && tokenResponse.access_token) {
                const tokenWithTimestamp = { ...tokenResponse, issued_at: Date.now() };
                const rememberMe = document.getElementById('rememberMe')?.checked;
                // Токенът се записва в localStorage или sessionStorage според избора
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
                        // Имейлът за текущата сесия се записва ВИНАГИ в sessionStorage
                        sessionStorage.setItem('google_auth_email_hint', userInfo.email);
                        // Запазваме имейла за следващо "тихо" влизане
                        localStorage.setItem('google_login_hint', userInfo.email);
                    } else {
                        console.warn('User info response not OK:', await userInfoResponse.text());
                    }
                } catch (error) {
                    console.log('Failed to fetch user info:', error);
                }
                sessionStorage.removeItem('logout_flag');
                // Вместо redirect, скриваме login страницата и продължаваме
                const loginPage = document.getElementById('login-page');
                if (loginPage) loginPage.hidden = true;
                // Извикваме startApp за да заредим приложението
                startApp(true);
            } else {
                console.log('Failed to get access token');
                alert(_('authFailed'));
            }
        },
        error_callback: (error) => {
            console.log("GSI Error:", error);
            alert(_('authFailed') + `\n\nError: ${error.type}`);
        }
    });
    const loginBox = document.querySelector('.login-box');
    // Проверяваме дали вече имаме токен и дали не сме излезли нарочно
    const hasToken = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
    const isLogout = sessionStorage.getItem('logout_flag') === 'true';

    if (hasToken && !isLogout) {
        // Ако имаме токен и не сме в процес на logout, се опитваме да стартираме директно
        console.log("Existing token found, starting app silently...");
        const loginPage = document.getElementById('login-page');
        if (loginPage) loginPage.hidden = true;
        startApp();
    } else {
        // Винаги показваме екрана за вход
        // Автоматичното влизане ще се случи при клик на бутона, ако rememberMe е активно
        if (loginBox) loginBox.style.visibility = 'visible';
        const authBtn = document.getElementById('authorize_button');
        if (authBtn) authBtn.disabled = false;
    }
}

// --- КОРЕКЦИЯ: Зареждаме състоянието на "Запомни ме" при стартиране ---
document.addEventListener('DOMContentLoaded', async () => {
    // Load translations immediately to ensure they're available
    await loadTranslations(currentLang);
    const rememberMeCheckbox = document.getElementById('rememberMe');
    if (rememberMeCheckbox) {
        rememberMeCheckbox.checked = localStorage.getItem('rememberMe') === 'true';
    }
    // Apply Hide Assistant setting on load
    if (localStorage.getItem('hideAssistant') === 'true') {
        const fabButton = document.getElementById('kb-fab');
        if (fabButton) {
            fabButton.style.display = 'none';
        }
    }
});

// Добави този код в началото или края на main.js
// Динамично зареждане на Google Identity Services скрипта с retry логика
function loadGoogleIdentityServices(retries = 3) {
    // Check if script already exists to avoid duplicates
    if (document.querySelector('script[src="https://accounts.google.com/gsi/client"]')) {
        return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => { gisLoaded(); }; // Извикваме функцията след зареждане
    script.onerror = () => {
        // console.log('Failed to load Google Identity Services');
        if (retries > 0) {
            // console.log(`Retrying to load GIS... (${retries} attempts left)`);
            setTimeout(() => loadGoogleIdentityServices(retries - 1), 2000);
        } else {
            // console.log('Giving up on loading Google Identity Services.');
        }
    };
    document.head.appendChild(script);
}

// Стартирай зареждането
loadGoogleIdentityServices();

// ---------- Calendar ----------------------------
// --- Месечен изглед в нисък (завъртян) екран: кутия със скрол (порт от uni b3.29) --------------
// Авто-зумът смаляваше целия месец до миниатюра, щом не се побира по височина, а в 844x390 това
// прави числата нечетливи. Затова в нисък екран месецът минава в кутия: хедърът и редът с имената
// на дните остават горе, а мрежата се скролира в собствена кутия под тях - клетките си остават
// квадратни, както са. Във висок екран (портрет, компютър) нищо не се променя.
const CALENDAR_SCROLL_MAX_HEIGHT = 500; // px: до тази височина месецът ползва кутия

function calendarUsesScrollBox() {
    return window.innerHeight <= CALENDAR_SCROLL_MAX_HEIGHT;
}

// Слага/маха кутията според височината на екрана. Връща true, когато кутията е сложена - тогава зум
// не се смята, защото скролът върши същата работа, но числата остават четливи.
function toggleCalendarScrollBox(container) {
    if (!container) return false;
    const on = calendarUsesScrollBox();
    // display се пише и от самия рендер инлайн (block), а седмичният изглед слага none - затова
    // кутията сменя инлайн стойността, а не я презаписва с !important от таблицата (иначе скритият
    // месец остава в подредбата под седмичния изглед и страницата става двойно по-висока).
    container.style.display = on ? 'flex' : 'block';
    container.classList.toggle('calendar-scroll-box', on);
    if (!on) {
        container.style.removeProperty('height');
        return false;
    }
    // Кутията заема точно остатъка от екрана, считано от мястото ѝ: 100vh не става, защото над
    // календара има отстъп и долният ред излизаше под екрана.
    const top = Math.round(container.getBoundingClientRect().top + (window.scrollY || 0));
    const height = Math.max(180, window.innerHeight - top);
    container.style.setProperty('height', `${height}px`, 'important');
    return true;
}

// Смяната на изгледа връща страницата в началото на календара: седмичният и месечният изглед са с
// различна височина, значи скролът, останал от единия, винаги каца по средата на другия.
// Връща се само при СМЯНА на изгледа - стрелките за месец напред/назад прерисуват същия изглед и
// нямат причина да местят страницата.
let calendarLastView = null;

function resetCalendarViewScroll(view) {
    if (calendarLastView === view) return;
    calendarLastView = view;
    const scroller = document.scrollingElement || document.documentElement;
    if (scroller) scroller.scrollTop = 0;
    if (window.scrollY) window.scrollTo(0, 0);
}

// Квадратчетата на бележките се мерят, след като браузърът е наредил елементите, и се заковават
// квадратни (височина = ширина).
function squareCalendarMiniNotes() {
    document.querySelectorAll('.calendar-mini-note').forEach(miniNote => {
        const width = miniNote.getBoundingClientRect().width;
        if (width > 0) miniNote.style.height = `${width}px`;
    });
}

// Подрежда месеца за текущия размер на екрана. Вика се след всеки рендер и при завъртане на
// телефона (виж scheduleRotationRefit): иначе месец, нареден в портрет, излизаше със 115px клетки и
// 724px мрежа в завъртян екран.
function fitCalendarMonth(container) {
    if (!container) return;
    // Нулираме зума и всичко, оставено от предишен рендер, преди да мерим.
    container.style.transform = 'none';
    container.style.transformOrigin = 'top center';
    container.style.width = '';
    container.style.height = ''; // height пак се дава инлайн, но от toggleCalendarScrollBox
    container.style.marginBottom = '';
    container.style.overflow = '';
    // Кутията се решава преди меренето: тя сменя ширината на мрежата (скролбар), значи и ширината
    // на квадратчетата.
    const useScrollBox = toggleCalendarScrollBox(container);
    squareCalendarMiniNotes();
    // Кутията решава - зум не се смята (иначе числата пак се смаляват), а мрежата остава в началото
    // на месеца: тя е нов елемент при всеки рендер, значи се виждат хедърът и първите редове.
    if (useScrollBox) return;
    // --- AUTO ZOOM LOGIC (както досега, само че в собствена функция) ---
    const windowHeight = window.innerHeight;
    // Използваме getBoundingClientRect за по-точни размери, включително padding/margin ако има
    const rect = container.getBoundingClientRect();
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
        container.style.transform = `scale(${scale})`;
        // КОРЕКЦИЯ 2: Задаваме изрично височината на контейнера да е равна на новия визуален размер.
        // Тъй като съдържанието е по-голямо, то ще прелее, но transform ще го свие обратно в тези граници.
        container.style.height = `${contentHeight * scale}px`;
        // Уверяваме се, че няма да се отреже нищо важно
        container.style.overflow = 'visible';
        // ОБРАТНО МАЩАБИРАНЕ: Увеличаваме font-size вместо transform, за да не се нарушава layout-а
        const counterScale = 1 / scale;
        // Увеличаваме font-size на бутоните в хедъра
        const calendarHeader = container.querySelector('.calendar-header');
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
        const dayNames = container.querySelectorAll('.calendar-day-name');
        dayNames.forEach(dayName => {
            const currentFontSize = parseFloat(window.getComputedStyle(dayName).fontSize);
            dayName.style.fontSize = `${currentFontSize * counterScale}px`;
        });
        // Увеличаваме font-size на номерата на датите
        const dateNumbers = container.querySelectorAll('.calendar-date-number');
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

}

function renderCalendarView() {
    // Смяна на изгледа: страницата се връща в началото на календара (само при смяна).
    resetCalendarViewScroll('month');
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
                <button id="today-month-btn">${calendarIconSvg}</button>
                <button id="next-month-btn" title="${_('nextMonthTooltip')}">&raquo;</button><button id="weekly-view-btn" title="${_('weeklyViewTooltip')}">${weeklyViewIconSvg}</button>
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
    const dayKeys = ['day_monday', 'day_tuesday', 'day_wednesday', 'day_thursday', 'day_friday', 'day_saturday', 'day_sunday'];
    dayKeys.forEach((key, index) => {
        const dayEl = document.createElement('div');
        dayEl.className = 'calendar-day-name';
        const longName = document.createElement('span');
        longName.className = 'day-name-long';
        longName.textContent = _(key);
        const shortName = document.createElement('span');
        shortName.className = 'day-name-short';
        const shortKey = key + '_short';
        shortName.textContent = _(shortKey);
        shortName.dataset.key = shortKey;
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
        // Клик на клетката отваря седмичния изглед за съответната дата
        cell.style.cursor = 'pointer';
        cell.addEventListener('click', () => {
            calendarContainer.style.display = 'none';
            renderWeeklyCalendarView(new Date(year, month, day));
        });
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
    // Мрежата живее в собствена обвивка: в нисък екран тя се скролира в нея (calendar-scroll-box),
    // в портрет обвивката е обикновен блок и нищо не се променя.
    const gridScrollArea = document.createElement('div');
    gridScrollArea.className = 'calendar-grid-scroll';
    gridScrollArea.appendChild(calendarGrid);
    calendarContainer.appendChild(gridScrollArea);
    // Подреждане на месеца за текущия размер на екрана: квадратчета, кутия със скрол в нисък
    // екран (иначе авто-зумът смалява целия месец до миниатюра) и едва после авто-зум.
    setTimeout(() => fitCalendarMonth(calendarContainer), 0);
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
    // Смяна на изгледа: страницата се връща в началото на календара (само при смяна).
    resetCalendarViewScroll('week');
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
        <button id="today-week-btn">${calendarIconSvg}</button>
        <button id="next-week-btn">&raquo;</button>
        <button id="month-view-btn" title="${_('monthlyViewTooltip')}" style="display: flex; align-items: center; justify-content: center;">${weeklyViewIconSvg}</button>
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

    header.querySelector('#prev-week-btn').addEventListener('click', () => {
        const newStartDate = new Date(startDate); // Използваме началната дата на текущия изглед
        newStartDate.setDate(newStartDate.getDate() - 7); // Връщаме 7 дни назад
        renderWeeklyCalendarView(newStartDate);
    });
    header.querySelector('#next-week-btn').addEventListener('click', () => {
        const newStartDate = new Date(startDate); // Използваме началната дата на текущия изглед
        newStartDate.setDate(newStartDate.getDate() + 7); // Отиваме 7 дни напред
        renderWeeklyCalendarView(newStartDate);
    });

    header.querySelector('#today-week-btn').addEventListener('click', () => {
        renderWeeklyCalendarView(); // Показваме текущата седмица от понеделник
    });
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
        const weeklyDayKeys = ['day_sunday', 'day_monday', 'day_tuesday', 'day_wednesday', 'day_thursday', 'day_friday', 'day_saturday'];
        const currentDayKey = weeklyDayKeys[date.getDay()];
        dateInfo.innerHTML = `
                <div class="weekly-date-number">${date.getDate()}</div>
                <div class="weekly-day-name" data-key="${currentDayKey}">${_(currentDayKey)}</div>
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
 * Обработва изтриването на бележка.
 * @param {HTMLElement} noteEl - DOM елементът на бележката.
 * @param {Event} [e] - Обектът на събитието (опционален).
 * @param {boolean} fromModal - Дали функцията се извиква от модалния прозорец.
 */
async function handleNoteDelete(noteEl, e = null, fromModal = false) {
    if (e) e.stopPropagation();
    if (e) e.preventDefault();
    if (!useIndexedDb) return;
    let noteGdid = noteEl.dataset ? noteEl.dataset.g : null;
    let extraInfo = {};
    if (!noteGdid) {
        if (noteEl.gdid) noteGdid = noteEl.gdid;
        else {
            try {
                extraInfo = JSON.parse((noteEl.dataset && noteEl.dataset.extraInfo) ? noteEl.dataset.extraInfo : '{}');
                noteGdid = extraInfo.gdid;
            } catch (ex) { }
        }
    }
    if (!noteGdid) return;
    const noteData = allNotesData.find(n => n.gdid == noteGdid);
    if (!noteData) return;
    const isTrashBoard = currentBoardFilter === 'trash' || noteData.status === 1;
    const msgKey = isTrashBoard ? 'confirmNoteDelete' : 'confirmNoteMoveToTrash';
    if (fromModal) {
        document.getElementById('content-modal').classList.remove('visible');
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    const confirmed = await showConfirmation(_(msgKey) || _('confirmNoteDelete'));
    if (confirmed) {
        try {
            const db = await openNotesDB();
            if (!isTrashBoard) {
                noteData.status = 1;
                noteData.datemod = Date.now();
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(NOTE_STORE_NAME, 'readwrite');
                    tx.objectStore(NOTE_STORE_NAME).put(noteData);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
                if (localStorage.getItem('updateGDrive') === 'true') {
                    // await updateGDriveFile(noteGdid, JSON.stringify(noteData));
                }
                const newNoteEl = await createNoteElement(noteData);
                noteEl.replaceWith(newNoteEl);
                showToast(_('noteMovedToTrash') || "Note moved to Trash", 3000);
            } else {
                await new Promise((resolve, reject) => {
                    const tx = db.transaction(NOTE_STORE_NAME, 'readwrite');
                    tx.objectStore(NOTE_STORE_NAME).delete(noteGdid);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
                if (localStorage.getItem('updateGDrive') === 'true') {
                    await deleteGDriveFile(noteGdid);
                }
                allNotesData = allNotesData.filter(n => n.gdid !== noteGdid);
                if (noteEl.remove) noteEl.remove();
                showToast(_('noteDeletedSuccess'), 3000);
            }
            renderUI({ boardParseError: false, rerenderOnlyMenu: true });
            applyFilters();
            const calendarContainer = document.getElementById('calendar-container');
            if (calendarContainer && calendarContainer.style.display !== 'none') renderCalendarView();
            const weeklyContainer = document.getElementById('weekly-calendar-container');
            if (weeklyContainer && weeklyContainer.style.display !== 'none' && typeof renderWeeklyCalendarView === 'function') {
                renderWeeklyCalendarView(currentWeeklyViewDate);
            }
        } catch (error) {
            console.error("Failed to delete note:", error);
            showToast((_('noteDeletedError') || "Error deleting note from the database.") + " - " + error.message, 5000);
        }
    }
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
 * Четимо описание на грешка от IndexedDB (errorCode е отдавна отпаднал и е undefined).
 * @param {any} error
 * @returns {string}
 */
function describeDbError(error) {
    if (!error) return 'unknown error';
    if (error.name && error.message) return `${error.name}: ${error.message}`;
    if (error.message) return String(error.message);
    return String(error);
}

/**
 * Създава липсващите object store-и върху база, която се отваря/вдига.
 * @param {IDBDatabase} db
 */
function createMissingNotesStores(db) {
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
}

// Таван на един опит за отваряне (b1.72): заключена от друг таб база иначе оставя
// приложението вечно на екрана за зареждане — нито onsuccess, нито onerror идват.
const NOTES_DB_OPEN_TIMEOUT_MS = 8000;
// Питаме за изтриване най-много веднъж на влизане, не при всяка заявка към базата.
let notesDbRecoveryAsked = false;

/**
 * Превод с резерва: ако ключът липсва в езиковия файл, _() връща самия ключ.
 * @param {string} key
 * @param {string} fallback
 * @returns {string}
 */
function dbT(key, fallback) {
    const value = _ ? _(key) : key;
    return (value && value !== key) ? value : fallback;
}

/**
 * Текстът в попъпа за изтриване на базата. Когато тя е единственото копие
 * (режим „само база“), не обещаваме, че нищо няма да се загуби.
 * @returns {string}
 */
function notesDbRecoveryMessage() {
    const ask = dbT('dbRecoveryAsk', 'Локалната база данни не се отваря. Може да е заключена от друг таб или повредена. Да я изтрия ли и да я изградя наново?');
    const dbIsOnlySource = useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb;
    const note = dbIsOnlySource
        ? dbT('dbRecoveryNoBackup', 'В момента няма друг източник, така че бележките, които съществуват само в базата, ще се загубят.')
        : dbT('dbRecoveryRebuild', 'Базата ще се изгради наново от източника и нищо няма да се загуби.');
    return ask + '\n\n' + note;
}

/**
 * Отваря NotesDB на точно определена версия (или на текущата, ако version е null).
 * @param {number|null} version
 * @returns {Promise<IDBDatabase>}
 */
function openNotesDBAtVersion(version) {
    return new Promise((resolve, reject) => {
        const request = version ? indexedDB.open(NOTES_DB_NAME, version) : indexedDB.open(NOTES_DB_NAME);
        // Заявка, която не получава нито onsuccess, нито onerror, не бива да държи
        // приложението на екрана за зареждане — отчитаме я като провал.
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            console.warn(`NotesDB: open at version ${version} timed out after ${NOTES_DB_OPEN_TIMEOUT_MS} ms.`);
            reject(new Error('IndexedDB open timed out'));
        }, NOTES_DB_OPEN_TIMEOUT_MS);
        const done = (settle, value) => {
            clearTimeout(timer);
            settle(value);
        };
        request.onupgradeneeded = (event) => {
            createMissingNotesStores(event.target.result);
            console.log("NotesDB structure is up to date.");
        };
        request.onsuccess = (event) => {
            const db = event.target.result;
            // Отворена връзка не бива да блокира deleteNotesDB.
            db.onversionchange = () => db.close();
            // Закъсняла връзка след таймаут вече не е нужна — затваряме я, за да не дели базата.
            if (timedOut) { db.close(); return; }
            done(resolve, db);
        };
        request.onerror = (event) => {
            // Истинската грешка е в error (VersionError, QuotaExceededError...),
            // а не в остарелия errorCode, който винаги е undefined.
            done(reject, event.target.error || new Error('IndexedDB open failed without an error object'));
        };
        request.onblocked = () => {
            console.warn('NotesDB: another tab keeps the database open; waiting for it to close.');
        };
    });
}

/**
 * След като отваряне на NOTES_DB_VERSION се провали веднъж (базата на диска е
 * по-нова), запомняме го: всяко следващо отваряне минава направо без версия,
 * за да не пълним конзолата със същото предупреждение при всеки DB достъп.
 * @type {boolean}
 */
let notesDbVersionUnavailable = false;

/**
 * Отварянията минават едно по едно: иначе няколко едновременни извиквания пробват
 * невалидната версия преди флагът да е вдигнат и предупреждението се повтаря.
 * @type {Promise<void>}
 */
let notesDbOpenQueue = Promise.resolve();

/**
 * Отваря IndexedDB базата данни.
 * Ако базата на диска е по-нова от тази версия на приложението (VersionError),
 * отваря я такава, каквато е, вместо да остане без бележки.
 * @returns {Promise<IDBDatabase>}
 */
async function openNotesDB() {
    const waitForPrevious = notesDbOpenQueue;
    let releaseQueue;
    notesDbOpenQueue = new Promise((resolve) => { releaseQueue = resolve; });
    await waitForPrevious;
    try {
        return await openNotesDBUnqueued();
    } catch (error) {
        console.warn(`NotesDB could not be opened (${describeDbError(error)}).`);
        if (notesDbRecoveryAsked) throw error;
        notesDbRecoveryAsked = true;
        let answer = false;
        try {
            answer = await showConfirmation(notesDbRecoveryMessage());
        } catch (popupError) {
            console.warn("NotesDB recovery popup could not be shown:", popupError);
        }
        if (answer !== true) {
            showToast(dbT('dbRecoveryDeclined', 'Локалната база данни не се отваря.'), 10000);
            throw error;
        }
        await deleteNotesDB();
        // След изтриване базата се вдига от нулата, значи версията пак е нашата.
        notesDbVersionUnavailable = false;
        return openNotesDBUnqueued();
    } finally {
        releaseQueue();
    }
}

/**
 * Самото отваряне: нашата версия, падане към текущата версия и ремонт на липсващи store-и.
 * @returns {Promise<IDBDatabase>}
 */
async function openNotesDBUnqueued() {
    let db;
    if (notesDbVersionUnavailable) {
        db = await openNotesDBAtVersion(null);
    } else {
        try {
            db = await openNotesDBAtVersion(NOTES_DB_VERSION);
        } catch (error) {
            notesDbVersionUnavailable = true;
            console.warn(`NotesDB: open at version ${NOTES_DB_VERSION} failed (${describeDbError(error)}). Opening the existing database as it is. Shown once.`);
            db = await openNotesDBAtVersion(null);
        }
    }
    const requiredStores = [BOARD_STORE_NAME, MEDIA_STORE_NAME, NOTE_STORE_NAME, CONFIG_STORE_NAME];
    const missingStores = requiredStores.filter(name => !db.objectStoreNames.contains(name));
    if (missingStores.length > 0) {
        const nextVersion = db.version + 1;
        console.warn(`NotesDB: missing stores (${missingStores.join(', ')}), upgrading to version ${nextVersion}.`);
        db.close();
        db = await openNotesDBAtVersion(nextVersion);
    }
    return db;
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
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject('Error saving to config: ' + event.target.error);
            transaction.oncomplete = () => db.close();
            transaction.onerror = () => db.close();
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
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject('Error getting from config: ' + event.target.error);
            transaction.oncomplete = () => db.close();
            transaction.onerror = () => db.close();
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
        // Заключена от друг таб база не дава нито onsuccess, нито onerror — не чакаме.
        req.onblocked = () => resolve(true);
    });
}

/**
 * Изтрива NotesDB и чака резултата.
 * @returns {Promise<boolean>} true при успешно изтриване; false при грешка или ако остане блокирано над 8 сек.
 */
function deleteNotesDB() {
    // --- ОКОНЧАТЕЛНА КОРЕКЦИЯ: Директно изтриване ---
    // Тъй като вече не поддържаме постоянна отворена връзка,
    // можем директно да извикаме изтриването.
    return new Promise(resolve => {
        let deleteFinished = false;
        const finish = (ok) => {
            if (deleteFinished) return;
            deleteFinished = true;
            resolve(ok);
        };
        const deleteRequest = indexedDB.deleteDatabase(NOTES_DB_NAME);
        deleteRequest.onsuccess = () => {
            showToast(_('dbDeleted'), 3000);
            finish(true);
        };
        deleteRequest.onerror = (event) => {
            showToast(_('dbDeleteFailed') + `: ${event.target.error}`, 10000);
            finish(false);
        };
        deleteRequest.onblocked = (event) => {
            console.log('Database deletion is blocked unexpectedly:', event);
            // Съобщението се показва само ако изтриването не завърши до 1.5 секунди
            setTimeout(() => {
                if (!deleteFinished) {
                    showToast(_('errorDbDeletionBlocked'), 15000);
                }
            }, 1500);
            // Горна граница - блокирано изтриване не бива да заклещи приложението
            setTimeout(() => finish(false), 8000);
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
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(`Error deleting from ${storeName}: ` + event.target.error);
            transaction.oncomplete = () => db.close();
            transaction.onerror = () => db.close();
        } catch (error) {
            db.close();
            reject(error);
        }
    });
}

// =================================================================================
// II. ИНИЦИАЛИЗАЦИЯ НА ПРИЛОЖЕНИЕТО
// =================================================================================
// --- Основна стартова функция ---
async function startApp(isExplicitLogin = false) {
    if (isAppStarted) return;
    isAppStarted = true;

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
        // Първо инициализираме UI, за да се покаже веднага и да имаме достъп до елементите
        document.body.style.display = 'block';
        console.log('First start:', Date.now());
        ts = await getFirstStartEncoded();
        console.log('First start in cache:', ts);
        // --- Предварително изчисляване на оставащите дни за UI (използва кеширана функция) ---
        const licenseData = await decryptLicenseToken();
        if (licenseData.remainingDays > 0) {
            tokenRemainingDays = licenseData.remainingDays;
            if (typeof updateSignoutTooltip === 'function') updateSignoutTooltip();
        }

        // --- КОРЕКЦИЯ: Осигуряваме наличност на имейла при безшумен старт ---
        // Използваме САМО записания от логина hint (ако е избрано 'Запомни ме'),
        // за да избегнем несъответствие с лицензния имейл.
        if (!sessionStorage.getItem('google_auth_email_hint')) {
            const emailHint = localStorage.getItem('google_login_hint');
            if (emailHint) {
                sessionStorage.setItem('google_auth_email_hint', emailHint);
            }
        }
        initApp(); // Инициализира UI елементите и event listeners
        // --- Задаване на настройки по подразбиране при първо стартиране ---
        // Ако никога не са задавани настройки за източник на данни,
        // избираме Google Drive + База данни по подразбиране.
        if (localStorage.getItem('useGoogleDb') === null && localStorage.getItem('useLocalDb') === null) {
            localStorage.setItem('useGoogleDb', 'true');
            localStorage.setItem('useIndexedDb', 'true');
        }
        // --- КОРЕКЦИЯ: Проверяваме за базата данни ВЕДНАГА при стартиране ---
        // Това е критично, за да може userCheck() да работи правилно.
        dbExists = await checkDbExists(NOTES_DB_NAME);
        // --- ЦЕНТРАЛИЗИРАНО УДОСТОВЕРЯВАНЕ И ПРОВЕРКА НА ПОТРЕБИТЕЛ ---
        const authResult = await checkAuth();
        if (!authResult || !authResult.pass) {
            if (isLoadCancelled) return; // Не прави нищо, ако е отказано
            loaderContainer.style.display = 'none';
            // checkAuth вече е показал грешка или е пренасочил
            return;
        }

        // --- NEW: Създаваме запис 's' след успешно логване, ако липсва ---
        const cache = await caches.open('app-cache');
        let sCache = await cache.match('s');
        if (!sCache) {
            const nowTs = Date.now();
            const encoded = btoa(String(nowTs));
            const response = new Response(encoded, { headers: { 'Content-Type': 'text/plain' } });
            await cache.put('s', response);
            ts = nowTs;
        }

        authToken = authResult.tokenData;
        // --- WHITELIST CHECK (Only on explicit login) ---
        if (isExplicitLogin) {
            checkWhitelist();
        }
        // Обновяваме глобалните флагове веднага, за да отразим настройките по подразбиране
        updateGlobalStateFlags();
        await createBoardsUI([], false);
        await createSettingsUI([], false); // Предварително създава UI на настройките
        // Проверката за потребител и основната логика се извикват директно.
        // mainLogic ще се погрижи за автентикацията и зареждането на Google API,
        // само ако е необходимо.
        // --- Инициализация на KB Assistant след успешно логване ---
        if (!window.isAppErrorState) window.kbAssistant.init();
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
        await mainLogic(authResult);
    } catch (err) {
        console.error("Error in startApp:", err);
    }
}

// Чете timestamp от кеша, без да генерира нов, ако липсва
async function getFirstStartEncoded() {
    const cache = await caches.open('app-cache');
    const cachedResponse = await cache.match('s'); // /firstStart.json
    if (cachedResponse) {
        // Четене на текста от кеша
        const encoded = await cachedResponse.text();
        const decodedTs = parseInt(atob(encoded), 10);
        return decodedTs;
    }
    return null;
}

/*function _(key) {
    // If translations aren't loaded yet, try to load them synchronously
    if (!appTranslations[currentLang]) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `i18n-${currentLang}.txt`, false); // false = synchronous
            xhr.send();
            if (xhr.status === 200) {
                const data = new Function('return {' + xhr.responseText + '}')();
                appTranslations[currentLang] = data[currentLang];
            }
        } catch (e) {
            console.error("Failed to load translations synchronously:", e);
            return key;
        }
    }
    return appTranslations[currentLang][key] || key;
}
*/

function _(key) {
    // Ако преводите за текущия език още не са заредени
    if (!appTranslations[currentLang]) {
        try {
            const xhr = new XMLHttpRequest();
            xhr.open('GET', `lang/i18n-${currentLang}.json`, false); // синхронно
            xhr.send();
            if (xhr.status === 200) {
                appTranslations[currentLang] = JSON.parse(xhr.responseText);
            }
        } catch (e) {
            console.error("Failed to load translations:", e);
            return key;
        }
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
            noButton.className = 'zoom-btn settings-close-btn'; // Use classes from other buttons
            noButton.style.marginLeft = '10px';
            okButton.parentNode.appendChild(noButton);
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
            popupContent.style.maxWidth = '90vw'; // Override constraint if specific width requested
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
        okButton.addEventListener('click', onOk);
        noButton.addEventListener('click', onNo);
        popup.classList.add('show');
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

// --- Пълноекранен режим на приложението (порт от cx-notes) --------------------------------------
// Хедърът се скрива: остават само полето за търсене и името на борда вляво. Режимът се помни в
// localStorage['extendedMode'] и се възстановява при следващо отваряне. Видимият път към него е
// квадратът „Цял екран" в менюто с бордове (вж. createBoardsUI) - същият квадрат се появява и в
// плаващото меню, защото то клонира хедърните бутони. Ctrl+клик и задържане върху плаващия бутон
// остават като бърз път, а /7 и /ex пускат режима, /6 и /norm излизат от него.
const fullscreenExpandIconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
const fullscreenCompressIconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6m10-10h-6V4m0 6l7-7M3 21l7-7"></path></svg>`;

function isHeaderFullscreen() {
    const header = document.querySelector('header');
    return !!(header && header.classList.contains('header-fullscreen'));
}

function toggleHeaderFullscreen() {
    const header = document.querySelector('header');
    if (!header) return;
    if (header.classList.contains('header-fullscreen')) {
        header.classList.remove('header-fullscreen');
        localStorage.setItem('extendedMode', 'false');
    } else {
        header.classList.add('header-fullscreen');
        localStorage.setItem('extendedMode', 'true');
    }
    const boardsModal = document.getElementById('boards-menu-modal');
    if (boardsModal) boardsModal.classList.remove('visible');
    updateHeaderFullscreenUI();
    adjustFullscreenSearchLayout();
}

// Иконата на всеки квадрат „Цял екран" (хедърния и клонирания в плаващото меню) следва режима:
// стрелки навън, докато хедърът се вижда, стрелки навътре, докато е скрит.
function updateHeaderFullscreenUI() {
    const isHidden = isHeaderFullscreen();
    document.querySelectorAll('.fullscreen-toggle-btn').forEach(btn => {
        btn.innerHTML = isHidden ? fullscreenCompressIconSvg : fullscreenExpandIconSvg;
        btn.title = isHidden ? (_('restoreHeaderTooltip') || 'Show header') : (_('toggleFullscreenTooltip') || 'Full screen (Hide/Show header)');
        btn.setAttribute('aria-label', btn.title);
        btn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
    });
}

// Името на борда за пълноекранния хедър: истинският борд по име, специалните изгледи по превод.
const FULLSCREEN_LABEL_KEYS = {
    'all': 'allBoards',
    'search-results': 'searchResultTitle',
    'reminder': 'reminder',
    'new-updates': 'newUpdates',
    'trash': 'trashBoardTitle',
    'with-photos': 'photosBoardTitle',
    'with-videos': 'videosBoardTitle',
    'with-sounds': 'soundsBoardTitle',
    'with-other': 'otherBoardTitle'
};

function fullscreenBoardLabel(boardId) {
    const bId = (boardId === undefined || boardId === null) ? '' : String(boardId);
    if (!bId) return '';
    const board = (typeof boardsData !== 'undefined' && Array.isArray(boardsData))
        ? boardsData.find(b => b.gdid == bId || b.id == bId) : null;
    if (board && board.title) return board.title;
    const key = FULLSCREEN_LABEL_KEYS[bId];
    if (key) {
        const translated = _('' + key);
        if (translated && translated !== key) return translated;
    }
    // Календарът има собствен изглед, който сам крие хедъра: там етикет не трябва.
    if (bId === 'calendar' || bId === 'calendar_monthly' || bId === 'calendar_weekly') return '';
    return bId;
}

// При смяна на борд етикетът се обновява на място (полето за търсене се подрежда наново).
function updateFullscreenBoardLabel() {
    const fsBoardLabel = document.getElementById('fullscreen-board-label');
    if (!fsBoardLabel) return;
    fsBoardLabel.textContent = fullscreenBoardLabel(currentBoardFilter);
    adjustFullscreenSearchLayout();
}

// Етикетът стои вляво в пълноекранния хедър и не се бърка на полето за търсене: иконата и
// отстъпът на полето се смятат от ширината му.
function adjustFullscreenSearchLayout() {
    const isFullscreen = isHeaderFullscreen();
    const searchBox = document.getElementById('search-box');
    const searchIcon = document.querySelector('.search-icon-static');
    const fsBoardLabel = document.getElementById('fullscreen-board-label');
    if (!searchBox || !searchIcon) return;
    if (isFullscreen && fsBoardLabel) {
        if (!fsBoardLabel.textContent) fsBoardLabel.textContent = fullscreenBoardLabel(currentBoardFilter);
        if (fsBoardLabel.textContent) {
            let labelWidth = fsBoardLabel.offsetWidth;
            if (labelWidth === 0) {
                // Скрит етикет не се мери: мерим го навън, със същите стилове.
                const tempSpan = document.createElement('span');
                tempSpan.style.cssText = 'position:absolute;visibility:hidden;font-size:12px;font-weight:bold;padding:2px 8px;white-space:nowrap;';
                tempSpan.textContent = fsBoardLabel.textContent;
                document.body.appendChild(tempSpan);
                labelWidth = Math.min(tempSpan.offsetWidth, 120);
                tempSpan.remove();
            }
            const offset = labelWidth + 5;
            searchIcon.style.left = (offset + 5) + 'px';
            searchBox.style.paddingLeft = (offset + 34) + 'px';
            return;
        }
    }
    searchIcon.style.left = '';
    searchBox.style.paddingLeft = '';
}

// Началното състояние идва от localStorage['extendedMode']. Слуша се и за смяна на класа/стиловете
// на хедъра, за да е подредено полето за търсене винаги.
function initHeaderFullscreen() {
    const isExtended = localStorage.getItem('extendedMode') === 'true';
    const header = document.querySelector('header');
    if (header) header.classList.toggle('header-fullscreen', isExtended);
    updateHeaderFullscreenUI();
    adjustFullscreenSearchLayout();
    if (header && !header._hasSearchLayoutObserver) {
        header._hasSearchLayoutObserver = true;
        new MutationObserver(() => { adjustFullscreenSearchLayout(); })
            .observe(header, { attributes: true, attributeFilter: ['style', 'class'] });
        window.addEventListener('resize', adjustFullscreenSearchLayout);
    }
}

// --- Командите в полето за търсене (порт от cx-notes) -------------------------------------------
// Списъкът се показва при /? (или /help) и при фокус, ако командата е в полето. Клик по ред
// изпълнява командата. /9 (лексикално търсене) НЕ се пренася: в main няма такъв режим, затова и
// редът му липсва в списъка.
function renderCommandsHelpPopup() {
    const popup = document.getElementById('saved-searches-popup');
    if (!popup) return;
    popup.style.display = 'block';
    popup.innerHTML = '';
    const closeBtn = document.createElement('div');
    closeBtn.className = 'saved-search-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = _('closeButton') || 'Close';
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        popup.style.display = 'none';
    });
    popup.appendChild(closeBtn);
    const contentContainer = document.createElement('div');
    contentContainer.className = 'saved-searches-content';
    popup.appendChild(contentContainer);
    const headerRow = document.createElement('div');
    headerRow.className = 'saved-search-item';
    headerRow.style.fontWeight = 'bold';
    headerRow.style.fontStyle = 'normal';
    headerRow.style.cursor = 'default';
    headerRow.style.color = '#1f3b52';
    headerRow.textContent = _('searchCommandsTitle') || 'Commands:';
    headerRow.addEventListener('click', (e) => e.stopPropagation());
    contentContainer.appendChild(headerRow);
    const defaultList = [
        { cmd: '/1', text: '/1  or  /set — Settings' },
        { cmd: '/2', text: '/2  or  /info — System information' },
        { cmd: '/3', text: '/3  or  /cal — Calendar' },
        { cmd: '/4', text: '/4  or  /rel — Reload' },
        { cmd: '/5', text: '/5  or  /out — Sign out' },
        { cmd: '/6', text: '/6  or  /norm — Exit full screen' },
        { cmd: '/7', text: '/7  or  /ex — Full screen' },
        { cmd: '/%', text: '/%number — Zoom (e.g. /%50)' },
        { cmd: '/0', text: '/0  or  /wipe — Erase data and close tab' }
    ];
    const rawList = _('searchCommandsList');
    const commandsList = (Array.isArray(rawList) && rawList.length > 0) ? rawList : defaultList;
    commandsList.forEach(item => {
        const row = document.createElement('div');
        row.className = 'saved-search-item';
        row.style.fontStyle = 'normal';
        const text = typeof item === 'string' ? item : item.text;
        let cmd = item.cmd || (typeof item === 'string' ? item.split(/\s+/)[0] : (item.text ? item.text.split(/\s+/)[0] : ''));
        if (cmd.startsWith('/%')) cmd = '/%';
        row.textContent = text;
        row.addEventListener('click', () => {
            popup.style.display = 'none';
            const sBox = document.getElementById('search-box');
            if (cmd === '/%') {
                if (sBox) { sBox.value = '/%'; sBox.focus(); }
            } else {
                if (sBox) sBox.value = '';
                handleSearchCommand(cmd);
            }
        });
        contentContainer.appendChild(row);
    });
}

async function handleSearchCommand(commandText) {
    if (!commandText || typeof commandText !== 'string') return false;
    const trimmed = commandText.trim();
    if (!trimmed.startsWith('/')) return false;
    const cmd = trimmed.toLowerCase();
    if (cmd === '/?' || cmd === '/help') {
        renderCommandsHelpPopup();
        return true;
    }
    if (cmd === '/set' || cmd === '/settings' || cmd === '/1') {
        const btn = document.getElementById('settings_button');
        if (btn) btn.click();
        return true;
    }
    if (cmd === '/norm' || cmd === '/normal' || cmd === '/6') {
        if (isHeaderFullscreen()) toggleHeaderFullscreen();
        return true;
    }
    if (cmd === '/ex' || cmd === '/expand' || cmd === '/7') {
        if (!isHeaderFullscreen()) toggleHeaderFullscreen();
        return true;
    }
    if (cmd === '/rel' || cmd === '/reload' || cmd === '/4') {
        const btn = document.getElementById('reload_button');
        if (btn) btn.click();
        return true;
    }
    if (cmd === '/cal' || cmd === '/calendar' || cmd === '/3') {
        const btn = document.getElementById('calendar_button');
        if (btn) btn.click();
        else if (typeof filterNotesByBoard === 'function') filterNotesByBoard('calendar');
        return true;
    }
    if (cmd === '/out' || cmd === '/5' || cmd === '/logout') {
        const btn = document.getElementById('signout_button');
        if (btn) btn.click();
        else if (typeof handleSignoutClick === 'function') handleSignoutClick();
        return true;
    }
    if (cmd === '/info' || cmd === '/2') {
        const counter = document.getElementById('note-counter');
        if (counter) counter.click();
        return true;
    }
    const zoomMatch = cmd.match(/^\/%\s*(\d+)%?$/);
    if (zoomMatch) {
        const scaleInput = document.getElementById('scaleInput');
        const applyBtn = document.getElementById('applyZoomBtn');
        if (scaleInput) scaleInput.value = zoomMatch[1];
        if (applyBtn) applyBtn.click();
        return true;
    }
    if (cmd === '/wipe' || cmd === '/0') {
        // Изтриването иска код за потвърждение, който се въвежда на ръка - както в cx-notes.
        const code = Math.floor(100 + Math.random() * 900);
        const template = _('wipeConfirmationPrompt') || 'Enter confirmation code {code} to wipe all data:';
        const inputVal = await showPrompt(template.replace('{code}', code));
        if (inputVal === null) return true;
        if (inputVal.trim() !== String(code)) {
            alert(_('wipeWrongCode') || 'Incorrect confirmation code. Operation cancelled.');
            return true;
        }
        try {
            if (typeof NOTES_DB_NAME !== 'undefined') indexedDB.deleteDatabase(NOTES_DB_NAME);
            if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
                const dbs = await indexedDB.databases();
                for (const d of dbs) { if (d.name) indexedDB.deleteDatabase(d.name); }
            }
            if (typeof caches !== 'undefined') {
                const keys = await caches.keys();
                for (const k of keys) { if (k !== 'app-cache') await caches.delete(k); }
            }
        } catch (e) { }
        try {
            localStorage.clear();
            sessionStorage.clear();
        } catch (e) { }
        document.body.innerHTML = '';
        window.close();
        window.location.href = 'about:blank';
        return true;
    }
    return false;
}

// Въпрос с поле за въвеждане (порт от cx-notes): ползва същия popup, който пита за ID на папка.
function showPrompt(message, defaultValue = '') {
    return new Promise(resolve => {
        const popup = document.getElementById('folderIdPromptPopup');
        if (!popup) { resolve(null); return; }
        const messagePara = popup.querySelector('p');
        const okButton = document.getElementById('submitFolderIdBtn');
        const input = document.getElementById('folderIdInput');
        let noButton = document.getElementById('prompt-no-btn');
        if (!noButton) {
            noButton = document.createElement('button');
            noButton.id = 'prompt-no-btn';
            noButton.className = 'zoom-btn settings-close-btn';
            noButton.style.marginLeft = '10px';
            okButton.parentNode.appendChild(noButton);
        }
        messagePara.textContent = message;
        input.style.display = 'block';
        input.value = defaultValue;
        okButton.textContent = _('submitButton') || 'OK';
        noButton.textContent = _('cancelButton') || 'Cancel';
        noButton.style.display = 'inline-block';
        const cleanup = () => {
            popup.classList.remove('show');
            okButton.removeEventListener('click', onOk);
            noButton.removeEventListener('click', onCancel);
            input.removeEventListener('keydown', onKeyDown);
            noButton.style.display = 'none';
            okButton.addEventListener('click', handleSubmitFolderId);
        };
        const onOk = () => { const val = input.value; cleanup(); resolve(val); };
        const onCancel = () => { cleanup(); resolve(null); };
        const onKeyDown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); onOk(); }
            else if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
        };
        okButton.removeEventListener('click', handleSubmitFolderId);
        okButton.addEventListener('click', onOk);
        noButton.addEventListener('click', onCancel);
        input.addEventListener('keydown', onKeyDown);
        popup.classList.add('show');
        input.focus();
    });
}

function initApp() {
    // Inject custom styles dynamically to fix UI issues
    const style = document.createElement('style');
    style.textContent = `
        .all-boards-filter-btn span { text-align: center; width: 100%; }
        .sounds-filter-btn { color: #fcfcfc !important; text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.5); }
    `;
    document.head.appendChild(style);
    // Set default showBoardAll to false if not set
    if (localStorage.getItem('showBoardAll') === null) {
        localStorage.setItem('showBoardAll', 'false');
    }
    // Set default showWeeklyCalendar to true if not set
    if (localStorage.getItem('showWeeklyCalendar') === null) {
        localStorage.setItem('showWeeklyCalendar', 'true');
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
    // Първият прозорец е самият #content-modal: той носи id-тата, докато не се отвори втори.
    initNoteWindows();
    scrollTopBtn = document.getElementById("scrollTopBtn");
    // --- КОРЕКЦИЯ: Предотвратяваме контекстното меню в модала ---
    modalBody.addEventListener('contextmenu', e => e.preventDefault());
    // --- Предотвратяваме Edge минименюто при маркиране на текст ---
    modalBody.addEventListener('pointerup', e => {
        if (window.getSelection().toString().length > 0) {
            e.preventDefault();
            e.stopPropagation();
        }
    });
    searchBox = document.getElementById('search-box');
    loaderContainer = document.getElementById('loader-container');
    loaderText = document.getElementById('loader-text');
    // --- Add Title to Loader (Idempotent) ---
    let loaderTitle = document.getElementById('loader-title');
    if (!loaderTitle) {
        loaderTitle = document.createElement('h3');
        loaderTitle.id = 'loader-title';
        loaderTitle.setAttribute('data-key', 'appTitle');
        loaderTitle.style.marginTop = '0';
        loaderTitle.style.marginBottom = '20px';
        loaderContainer.prepend(loaderTitle);
    }
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
            document.getElementById('settings-modal').classList.add('visible');
        });
    }
    // Настройване на UI и езикови настройки
    const toast = document.getElementById('toastNotification');
    toast.addEventListener('click', hideToast);
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
    reloadButton.addEventListener('click', () => mainLogic());
    settingsButton.addEventListener('click', () => {
        // Запомняме началното състояние на чекбоксовете при отваряне на настройките
        // Първо обновяваме състоянието на чекбоксовете, после го запазваме ---
        document.getElementById('use-google-db-checkbox').checked = localStorage.getItem('useGoogleDb') !== 'false';
        document.getElementById('use-local-db-checkbox').checked = localStorage.getItem('useLocalDb') === 'true';
        document.getElementById('use-arh-db-checkbox').checked = localStorage.getItem('useArhDb') === 'true';
        document.getElementById('use-indexeddb-checkbox').checked = localStorage.getItem('useIndexedDb') === 'true';
        settingsInitialState = {
            useGoogleDb: document.getElementById('use-google-db-checkbox').checked,
            useLocalDb: document.getElementById('use-local-db-checkbox').checked,
            useArhDb: document.getElementById('use-arh-db-checkbox').checked,
            useIndexedDb: document.getElementById('use-indexeddb-checkbox').checked
        };
        document.getElementById('settings-modal').classList.add('visible');
        renderLanguageSwitchers();
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
    scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    // --- Search Box Enhancements ---
    const searchWrapper = document.getElementById('search-wrapper');
    // 1. Static Search Icon (Left)
    const staticSearchIcon = document.createElement('span');
    staticSearchIcon.className = 'search-icon-static';
    staticSearchIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>`;
    // 2. Clear Button (Right, next to Save)
    const clearSearchBtn = document.createElement('span');
    clearSearchBtn.className = 'search-action-btn search-btn-clear';
    clearSearchBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
    clearSearchBtn.style.display = 'none'; // Hidden initially
    clearSearchBtn.title = _('closeButton'); // "Close" or "Clear"
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
    // Етикетът с името на борда: вижда се само в пълноекранен режим (вж. adjustFullscreenSearchLayout).
    const fsBoardLabel = document.createElement('span');
    fsBoardLabel.id = 'fullscreen-board-label';
    searchWrapper.appendChild(fsBoardLabel);
    // This function will be the single point for applying search and UI updates
    window.triggerSearch = (isUserTyping = false) => {
        let hasText = searchBox.value.trim().length > 0;
        const searchResultsBtn = document.getElementById('search-results-board-btn');
        if (searchResultsBtn) {
            searchResultsBtn.style.display = hasText ? 'flex' : 'none';
            if (hasText) {
                if (currentBoardFilter !== 'search-results') {
                    previousBoardFilter = currentBoardFilter;
                }
                currentBoardFilter = 'search-results';
                document.querySelectorAll('.board-filter-link').forEach(link => {
                    const isSelected = link.dataset.boardid === 'search-results';
                    link.classList.toggle('selected-board', isSelected);
                    link.classList.toggle('active', isSelected);
                    link.style.height = isSelected ? '39px' : '35px';
                    if (isSelected) {
                        link.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    }
                });
            } else if (currentBoardFilter === 'search-results') {
                currentBoardFilter = previousBoardFilter || 'all';
                document.querySelectorAll('.board-filter-link').forEach(link => {
                    const isSelected = String(link.dataset.boardid) === String(currentBoardFilter);
                    link.classList.toggle('selected-board', isSelected);
                    link.classList.toggle('active', isSelected);
                    link.style.height = isSelected ? '39px' : '35px';
                    if (isSelected) {
                        link.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                    }
                });
            }
        }
        if (isUserTyping) {
            if (searchBox.value.trim() !== '') {
                lastSearchTerm = searchBox.value;
                localStorage.setItem('lastSearchTerm', lastSearchTerm);
            }
        }
        applyFilters();
        hasText = searchBox.value.length > 0;
        const hasTextTrimmed = searchBox.value.trim().length > 0;
        clearSearchBtn.style.display = hasText ? 'flex' : 'none';
        saveSearchBtn.style.display = hasTextTrimmed ? 'flex' : 'none';
    };

    // Listen for user typing with Debounce
    let searchDebounceTimeout;
    searchBox.addEventListener('input', (event) => {
        // Immediate UI update for buttons (no debounce needed for visibility)
        const hasText = searchBox.value.length > 0;
        clearSearchBtn.style.display = hasText ? 'flex' : 'none';
        // Save button might wait for debounce, but usually safer to show immediately too
        saveSearchBtn.style.display = searchBox.value.trim().length > 0 ? 'flex' : 'none';
        const typed = searchBox.value.trim();
        // „/?" (или „/help") показва списъка с команди, вместо да търси.
        if (typed === '/?' || typed === '/help') {
            saveSearchBtn.style.display = 'none';
            renderCommandsHelpPopup();
            clearTimeout(searchDebounceTimeout);
            return;
        }
        // Команда се изпълнява с Enter: докато се пише, не се търси и стрелката за запис се скрива.
        if (typed.startsWith('/')) {
            saveSearchBtn.style.display = 'none';
            const cmdPopup = document.getElementById('saved-searches-popup');
            if (cmdPopup) cmdPopup.style.display = 'none';
            clearTimeout(searchDebounceTimeout);
            return;
        }
        if (!event.isTrusted) return;
        clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = setTimeout(() => {
            triggerSearch(true);
        }, 300); // Wait 300ms after last keystroke
    });

    // Handle Enter key
    searchBox.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent form submission if any
            searchBox.blur(); // Hide keyboard on mobile
            const typed = searchBox.value.trim();
            // Команда („/7", „/norm", „/%50"): изпълнява се вместо търсене.
            if (typed.startsWith('/')) {
                const handled = await handleSearchCommand(typed);
                if (handled) {
                    if (typed !== '/?' && typed !== '/help') {
                        searchBox.value = '';
                        clearSearchBtn.style.display = 'none';
                        saveSearchBtn.style.display = 'none';
                        const popup = document.getElementById('saved-searches-popup');
                        if (popup) popup.style.display = 'none';
                    }
                    return;
                }
            }
            triggerSearch(true); // Ensure search is applied
            document.getElementById('saved-searches-popup').style.display = 'none'; // Close popup
        }
    });

    clearSearchBtn.addEventListener('click', () => {
        searchBox.value = '';
        triggerSearch(true);
        searchBox.focus();
        const popup = document.getElementById('saved-searches-popup');
        if (popup) popup.style.display = 'none';
    });

    searchBox.addEventListener('focus', () => {
        const typed = searchBox.value.trim();
        // В полето стои команда: показва се списъкът с командите, иначе запазените търсения.
        if (typed === '/?' || typed === '/help') renderCommandsHelpPopup();
        else renderSavedSearchesPopup(); // Модалът ще се показва винаги при фокус
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

    // Пълноекранният режим се възстановява сега: полето за търсене и етикетът вече съществуват.
    initHeaderFullscreen();

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
        btn.addEventListener('click', (e) => {
            const modal = e.currentTarget.closest('.modal-overlay');
            modal.classList.remove('visible');
            if (modal.id === 'settings-modal') {
                window.kbAssistant.terminateGuide(); // Safe to call due to dummy object
                if (notesBgrdChanged) {
                    mainLogic();
                    notesBgrdChanged = false;
                }
            }
        });

    });
    // Specific listener for the settings close button (not class 'modal-close')
    document.getElementById('settings-close-btn').addEventListener('click', () => {
        document.getElementById('settings-modal').classList.remove('visible');
        window.kbAssistant.terminateGuide(); // Safe to call
        if (notesBgrdChanged) {
            mainLogic();
            notesBgrdChanged = false;
        }
    });

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('visible');
                if (modal.id === 'settings-modal') {
                    if (window.kbAssistant) window.kbAssistant.terminateGuide();
                    window.kbAssistant.terminateGuide(); // Safe to call
                    if (notesBgrdChanged) {
                        mainLogic();
                        notesBgrdChanged = false;
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
            // Модалът се е затворил (по който и да е път) - звукът от плочката не остава да свири.
            stopAttachmentAudio();
            modalBody.style.fontSize = `${localStorage.getItem('modalFontSize') || 16}px`;
        }
    });

    // --- Плъзгането за размер е на всеки прозорец поотделно: виж wireNoteWindowResize ---
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

    // --- Mode Button Logic (Ctrl-click and long-press for advanced) ---
    const modeButton = document.getElementById('mode_button');
    const calendarButton = document.getElementById('calendar_button');
    // Ако потребителят е запазил 'calendar' като стартов борд, го променяме на 'all'
    if (localStorage.getItem('startBoard') === 'calendar') {
        localStorage.setItem('startBoard', 'all');
    }
    if (calendarButton) {
        calendarButton.addEventListener('click', () => {
            /* Календарът заема целия екран, а прозорците на бележките живеят в #note-windows-layer
               над всичко останало - затова отворените бележки оставаха да плават върху календара.
               Затваряме ги преди рисуването, по същия път, по който го прави и изборът на борд
               „Календар" (filterNotesByBoard). В MNV няма режим на редактиране, значи незаписани
               промени няма и closeAllNoteWindows() не пита нищо. */
            closeAllNoteWindows();
            renderCalendarView();
        });

    }
    let modeButtonLongPressTimer;
    let modeButtonIsLongPress = false;
    const showAdvancedSettings = () => {
        const advancedSettingsSpan = document.getElementById('advanced-settings-span');
        if (advancedSettingsSpan) {
            const isHidden = advancedSettingsSpan.hasAttribute('hidden');
            if (isHidden) {
                advancedSettingsSpan.removeAttribute('hidden');
                localStorage.setItem('showAdvancedSettings', 'true');
            }
        }
        // Отваряме настройките
        document.getElementById('settings_button').click();
        // Симулираме клик на accordion стрелката, за да разгърнем секцията
        // Използваме setTimeout, за да сме сигурни, че модалът е отворен
        setTimeout(() => {
            const accordionHeader = document.querySelector('.accordion-header');
            if (accordionHeader) {
                accordionHeader.click();
            }
        }, 100); // Малко забавяне, за да се отвори модалът първо
    };

    const modeStartPress = (e) => {
        modeButtonIsLongPress = false;
        modeButtonLongPressTimer = setTimeout(() => {
            modeButtonIsLongPress = true;
            showAdvancedSettings();
        }, 500); // 500ms за long press

    };
    const modeEndPress = () => {
        clearTimeout(modeButtonLongPressTimer);
    };

    // Добавяме listeners за long-press
    modeButton.addEventListener('mousedown', modeStartPress);
    modeButton.addEventListener('mouseup', modeEndPress);
    modeButton.addEventListener('mouseleave', modeEndPress);
    modeButton.addEventListener('touchstart', modeStartPress, { passive: true });
    modeButton.addEventListener('touchend', modeEndPress);
    // Click handler
    modeButton.addEventListener('click', (e) => {
        // Ако е long press, не правим нищо (вече е обработено)
        if (modeButtonIsLongPress) {
            modeButtonIsLongPress = false;
            return;
        }
        if (e.ctrlKey) {
            // Логика за Ctrl+клик: Показване на разширените настройки
            e.preventDefault();
            showAdvancedSettings();
        } else {
            // Логика за обикновен клик: "Умен" бутон
            updateGlobalStateFlags();
            const isDbOnlyMode = useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb;
            if (isDbOnlyMode && dbExists) {
                triggerSync();
            } else {
                document.getElementById('settings_button').click();
            }
        }
    });

    async function triggerSync() {
        loaderContainer.style.display = 'block'; // Показваме статус панела
        const dbSource = await getConfig('dbSource');
        let updatedCount = 0;
        // Показваме лоудъра
        loaderContainer.style.display = 'block';
        const loaderTitle = document.getElementById('loader-title');
        if (dbSource === 1) { // Базата е създадена от Google Drive
            // --- КОРЕКЦИЯ: Зареждаме Google API, тъй като тази функция го пропуска ---
            try {
                if (typeof gapi === 'undefined' || typeof gapi.client === 'undefined') {
                    await loadGoogleApis();
                }
                if (!authToken) return; // Прекратяваме, ако няма валиден токен
                gapi.client.setToken({ access_token: authToken.access_token });
            } catch (error) {
                throw new Error(_('errorGoogleLibs'));
            }
            console.log("Triggering Google Drive sync...");
            if (loaderTitle) loaderTitle.textContent = _('syncTitleGD');
            try {
                updatedCount = await runGoogleDriveSync();
            } catch (err) {
                console.warn("GD Sync failed, attempting token refresh...", err);
                const refreshResult = await refreshAuthToken();
                if (refreshResult && refreshResult.pass) {
                    authToken = refreshResult.tokenData;
                    // Update gapi client with new token
                    gapi.client.setToken({ access_token: authToken.access_token });
                    updatedCount = await runGoogleDriveSync();
                } else {
                    showToast(_('errorSessionExpired'));
                    loaderContainer.style.display = 'none';
                    return;
                }
            }
            showToast(updatedCount > 0 ? _('gdriveUpdatesFound').replace('{count}', updatedCount) : _('gdriveNoUpdates'), 5000);
        } else if (dbSource === 2) { // Базата е създадена от Локална папка
            console.log("Triggering Local Folder sync...");
            if (loaderTitle) loaderTitle.textContent = _('syncTitleLocal');
            updatedCount = await runLocalSync();
            showToast(updatedCount > 0 ? _('localUpdatesFound').replace('{count}', updatedCount) : _('localNoUpdates'), 5000);
        } else {
            loaderContainer.style.display = 'none';
            return; // Не правим нищо, ако базата е от архив
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
            // 4. Обновяваме броячите и менюто с бордове
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
            const gdDate = lastGDTimestamp ? formatDateTime(lastGDTimestamp) : _('noData');
            const localDate = lastLocalTimestamp ? formatDateTime(lastLocalTimestamp) : _('noData');
            const dbCreatedDate = dbCreatedTimestamp ? formatDateTime(dbCreatedTimestamp) : '';
            const loadTimeDate = initialLoadTimestamp ? formatDateTime(initialLoadTimestamp) : '';

            // Създаваме съдържанието без начални отстояния, за да се подравни правилно в модала.
            const content = [
                `${_('sysInfoUser')}: ${currentUserEmail}`,
                `${_('sysInfoDbOwner')}: ${dbOwnerEmail}`,
                `${_('sysInfoLoadTime')}: ${initialLoadTime ? initialLoadTime + ' s' + (loadTimeDate ? ' (' + loadTimeDate + ')' : '') : _('noData')}`,
                `${_('sysInfoDbCreatedFrom')}: ${dbSourceText}${dbCreatedDate ? ' (' + dbCreatedDate + ')' : ''}`,
                `${_('sysInfoLastLocalSync')}: ${localDate}`,
                `${_('sysInfoLastGDSync')}: ${gdDate}`,
                `${_('sysInfoAttachmentLinks')}: ${dbNoteIdType}`,
                ...(tokenRemainingDays !== null ? [`${_('remainingDays')}: ${tokenRemainingDays}`] : []),
            ].join('\n');
            showModal({ raw: content, color: '#f0f0f0' });
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
    searchInput.placeholder = _('searchPlaceholder') || "Type text";
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
            searchBox.value = term;
            if (window.triggerSearch) window.triggerSearch();
            else applyFilters();
            popup.style.display = 'none';
        });
        contentContainer.appendChild(item);
    });
}

// Флаг за предотвратяване на двойна нотификация за Service Worker
window.swUpdateNotificationShown = false;

// Проверяваме дали има токен преди да стартираме приложението
// Ако няма токен, ще изчакаме gisLoaded() да покаже login страницата
(async () => {
    // 1. Проверяваме за параметри 'debug', 'token' и 'offline' в URL-a
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('debug')) {
        debug = true;
    }

    if (urlParams.has('token')) {
        const licenseData = await decryptLicenseToken();
        if (licenseData && cachedLicenseData) {
            console.log("Декриптиран токен, validityDays:", cachedLicenseData.validityDays);
        }
    }

    // 2. Проверяваме за записа 's' в кеша
    const cache = await caches.open('app-cache');
    const cachedResponse = await cache.match('s');
    let hasValidSRecord = false;

    if (cachedResponse) {
        try {
            const encoded = await cachedResponse.text();
            const decodedTs = parseInt(atob(encoded), 10);
            if (!isNaN(decodedTs) && decodedTs > 0) {
                hasValidSRecord = true;

                // Проверяваме дали пробният период е изтекъл
                const licenseData = await decryptLicenseToken();
                if (!licenseData.pass) {
                    console.log('Резултат от проверката на s запис: НЕВАЛИДЕН (изтекъл)');
                    window.isAppErrorState = true;
                    document.body.innerHTML = '';
                    document.body.style.backgroundColor = '#1a1a1a';
                    document.body.style.display = 'flex';
                    document.body.style.flexDirection = 'column';
                    document.body.style.alignItems = 'center';
                    document.body.style.justifyContent = 'center';
                    document.body.style.minHeight = '100vh';
                    document.body.style.margin = '0';
                    const logoImg = document.createElement('img');
                    logoImg.src = 'MNVLogo.png';
                    logoImg.alt = 'Logo';
                    logoImg.style.width = '150px';
                    logoImg.style.marginBottom = '30px';
                    logoImg.style.userSelect = 'none';
                    document.body.appendChild(logoImg);
                    const msg = document.createElement('h1');
                    msg.style.color = 'yellow';
                    msg.style.textAlign = 'center';
                    msg.style.margin = '0';
                    // Use generic text fallback early on if i18n not yet loaded
                    msg.innerHTML = typeof _ === 'function' && _('invalidCertificate') !== 'invalidCertificate' ? _('invalidCertificate') : "Trial period has expired.";
                    document.body.appendChild(msg);
                    sessionStorage.clear();
                    return; // Спираме зареждането
                }
            } else {
                throw new Error("Invalid format");
            }
        } catch (e) {
            console.log("Проблем със 's' записа:", e);
            await cache.delete('s');
            hasValidSRecord = false;
        }
    }

    if (!hasValidSRecord) {
        // Няма (или е невалиден) запис 's' - показваме login с trial бутон
        initLoginPage();
        const trialBtn = document.getElementById("trialBtn");
        const authorizeBtn = document.getElementById("authorize_button");
        if (trialBtn) trialBtn.style.display = 'inline-block';
        if (authorizeBtn) authorizeBtn.style.display = 'none';
        setupSelectionLocking();
        return;
    }

    if (urlParams.has('offline')) {
        isOfflineMode = true;
        // Задаваме настройки за офлайн режим
        localStorage.setItem('useGoogleDb', 'false');
        // Ако потребителят няма избран НИТО ЕДИН офлайн източник, активираме "База данни" автоматично.
        const hasOfflineSource = localStorage.getItem('useIndexedDb') === 'true' ||
            localStorage.getItem('useLocalDb') === 'true' ||
            localStorage.getItem('useArhDb') === 'true';
        if (!hasOfflineSource) {
            localStorage.setItem('useIndexedDb', 'true');
            localStorage.setItem('mode', 'database');
        }
        // Стартираме приложението директно без да търсим токен
        startApp();
        return;
    }

    // Има валиден запис 's', проверяваме за токен
    const sessionToken = sessionStorage.getItem('google_auth_token');
    const localToken = localStorage.getItem('google_auth_token');
    if (sessionToken || localToken) {
        // Има токен, стартираме приложението
        startApp();
    } else {
        // Няма токен - показваме login страницата веднага и инициализираме event listeners
        initLoginPage();
        const trialBtn = document.getElementById("trialBtn");
        const authorizeBtn = document.getElementById("authorize_button");
        if (trialBtn) trialBtn.style.display = 'none';
        if (authorizeBtn) authorizeBtn.style.display = 'inline-block';
        // gisLoaded() ще инициализира Google authentication когато се зареди
    }

    setupSelectionLocking();
})();

function setupSelectionLocking() {
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
        }
    });
}

// След успешно удостоверяване gisLoaded() ще извика startApp()

// Функция за инициализация на login страницата
function initLoginPage() {
    // Инициализираме KB Assistant веднага, за да следим версията (само ако не сме в състояние на грешка)
    if (window.kbAssistant && !window.kbAssistant.isInitialized && !window.isAppErrorState) {
        window.kbAssistant.init();
    }
    const loginPage = document.getElementById('login-page');
    if (loginPage) loginPage.hidden = false;
    const loaderCont = document.getElementById('loader-container');
    if (loaderCont) loaderCont.style.display = 'none';
    // document.getElementById("mode_button").style.display = 'none';
    renderLanguageSwitchers();
    // Добавяне на действие при натискане на trial бутона
    const trialBtn = document.getElementById("trialBtn");
    if (trialBtn) {
        trialBtn.addEventListener("click", (e) => {
            console.log("Trial button clicked");
            e.preventDefault(); // Предотвратяваме стандартното действие
            sessionStorage.setItem('isTrialStart', 'true'); // Маркираме, че е стартиран пробен период
            // Директно извикваме функцията за авторизация (вместо клик върху скрития бутон)
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
    // b1.73: слушателят се закача само веднъж — initLoginPage се вика и от
    // пътя за изтекла сесия, а втори слушател пускаше по две заявки на клик.
    const authorizeBtn = document.getElementById('authorize_button');
    if (authorizeBtn) {
        // b1.73: бутонът има disabled в HTML и се включваше само в gisLoaded().
        // При изтекла сесия gisLoaded минава по другия път и бутонът оставаше
        // мъртъв до презареждане на страницата.
        authorizeBtn.disabled = false;
        if (!authorizeBtn.dataset.authListenerAdded) {
            authorizeBtn.addEventListener('click', handleAuthClick);
            authorizeBtn.dataset.authListenerAdded = 'true';
        }
    }
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

function handleAuthClick() {
    // Опит за инициализация, ако липсва tokenClient, но Google lib е налична
    if (!tokenClient && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: CLIENT_ID,
            scope: SCOPES,
            callback: async (resp) => { // Reusing logic from gisLoaded callback partly
                if (resp.error) {
                    throw (resp);
                }
                await authCallback(resp);
            },
        });
    }

    if (tokenClient) {
        const rememberMe = localStorage.getItem('rememberMe') === 'true';
        const loginHint = localStorage.getItem('google_login_hint');
        if (rememberMe && loginHint) {
            // Ако "Запомни ме" е активно и има запазен имейл, влизаме с hint
            // Popup-ът ще покаже само запазения акаунт
            tokenClient.requestAccessToken({ hint: loginHint });
        } else {
            // В противен случай показваме екрана за избор на акаунт
            tokenClient.requestAccessToken({ prompt: 'select_account' });
        }
    } else {
        console.error("Google Identity Services not loaded.");
        alert(_('errorGoogleLibs'));
    }
}

function checkWhitelist() {
    if (isOfflineMode) return;
    const isTrialStart = sessionStorage.getItem('isTrialStart') === 'true';
    const action = isTrialStart ? 'log' : 'check';

    // Изчакваме 2 секунди, за да не пречим на началната синхронизация 
    setTimeout(() => {
        console.log('Executing delayed whitelist check...');
        const currentUserEmail = sessionStorage.getItem('google_auth_email_hint');
        console.log('Email for whitelist:', currentUserEmail);
        if (currentUserEmail) {
            fetch('https://script.google.com/macros/s/AKfycbyD-Y_qPdLOkowGv_pmYnIIjRsazSuWWJpDNMb2idxuW5_KfAn7sJZJZ1_wKuFQbM5fqQ/exec', {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify({
                    email: currentUserEmail,
                    action: 'log'
                })
            })
                .then(response => response.json())
                .then(data => {
                    console.log('Whitelist log response:', data);
                    if (isTrialStart) {
                        sessionStorage.removeItem('isTrialStart');
                        console.log('Trial registered for:', currentUserEmail);
                    }
                })
                .catch(err => console.log('Whitelist check delayed fail:', err));
        }
    }, 2000);
}

async function checkAuth() {
    console.log("checkAuth");
    if (isOfflineMode) {
        console.log("Offline mode active, bypassing authentication checks.");
        return { tokenData: { access_token: 'offline' }, pass: true };
    }
    // --- Проверяваме и в двата storage-а за токен ---
    // Това решава проблема с безкрайното презареждане при избрана опция "Запомни ме".
    const sessionToken = sessionStorage.getItem('google_auth_token');
    const localToken = localStorage.getItem('google_auth_token');
    const storedTokenString = sessionToken || localToken;
    if (!storedTokenString) {
        // Инициализираме login страницата само веднъж, за да избегнем дублиране на listeners
        if (!window.authListenersAdded) {
            initLoginPage();
            window.authListenersAdded = true;
        } else {
            // Ако вече е инициализирана, само я показваме
            const loginPage = document.getElementById('login-page');
            if (loginPage) loginPage.hidden = false;
            const loader = document.getElementById('loader-container');
            if (loader) loader.style.display = 'none';
        }
        return null; // Stop execution
    }
    const tokenData = JSON.parse(storedTokenString);
    // Explicitly set the token in gapi.client if it's already loaded
    if (window.gapi && window.gapi.client && tokenData.access_token) {
        window.gapi.client.setToken(tokenData);
    }
    // --- Винаги добавяме email_hint от sessionStorage ---
    // Това гарантира, че проверката на токена ще работи коректно,
    // дори когато основният токен се чете от localStorage.
    tokenData.email_hint = sessionStorage.getItem('google_auth_email_hint');
    const isExpired = (Date.now() - tokenData.issued_at) / 1000 > (tokenData.expires_in - 60);
    if (isExpired) {
        console.log("Token expired. Attempting silent refresh...");
        try {
            const refreshResult = await refreshAuthToken();
            if (refreshResult && refreshResult.pass) {
                console.log("Silent refresh successful.");
                return refreshResult;
            }
        } catch (refreshErr) {
            console.warn("Silent refresh threw an error (GIS likely not loaded):", refreshErr);
            // Продължаваме надолу към логиката за неуспешен refresh
        }

        console.log("Token expired. Refresh failed. Showing login page.");
        sessionStorage.removeItem('google_auth_token');
        localStorage.removeItem('google_auth_token');
        // Показваме login страницата вместо безкраен reload
        initLoginPage();
        // b1.73: беше alert() — блокиращ прозорец точно когато човекът иска
        // да натисне Authorize. Съобщението минава през тоста.
        if (typeof showToast === 'function') showToast(_('errorSessionExpired'));
        return null; // Stop execution
    }
    // --- 🔐 Проверка на лиценз (използва кеширана функция) ---
    const licenseData = await decryptLicenseToken();
    tokenRemainingDays = licenseData.remainingDays;
    pass = licenseData.pass; // @@ прескачаме сертификата

    if (licenseData.pass) {
        console.log(`tokenRemainingDays: ${tokenRemainingDays}`);
        if (typeof updateSignoutTooltip === 'function') updateSignoutTooltip();
    } else if (!localStorage.getItem('urlToken')) {
        console.log("Липсващ токен!");
        sessionStorage.clear();
    } else {
        console.log('Резултат от проверката: НЕВАЛИДЕН (изтекъл)');
        sessionStorage.clear();
    }
    if (!pass) {
        window.isAppErrorState = true;
        document.body.innerHTML = ''; // Изчистваме само съдържанието на body, не и самия body
        document.body.style.backgroundColor = '#1a1a1a';
        document.body.style.display = 'flex';
        document.body.style.flexDirection = 'column';
        document.body.style.alignItems = 'center';
        document.body.style.justifyContent = 'center';
        document.body.style.minHeight = '100vh';
        document.body.style.margin = '0';
        // Създаваме лого
        const logoImg = document.createElement('img');
        logoImg.src = 'MNVLogo.png';
        logoImg.alt = 'Logo';
        logoImg.style.width = '150px';
        logoImg.style.marginBottom = '30px';
        // logoImg.style.cursor = 'pointer';
        logoImg.style.userSelect = 'none';
        document.body.appendChild(logoImg);
        const errorElement = document.createElement('h1');
        errorElement.innerHTML = _('invalidCertificate');
        errorElement.style.color = 'yellow';
        errorElement.style.textAlign = 'center';
        errorElement.style.margin = '0';
        document.body.appendChild(errorElement);
        sessionStorage.clear();
        // Early return to prevent any further initialization (including assistant)
        return null;
    }
    return { tokenData, pass }; // Връщаме обект с данните и резултата от проверката
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
    // Премахваме само ключовете, свързани с удостоверяването
    localStorage.removeItem('google_auth_token');
    sessionStorage.removeItem('google_auth_token');
    sessionStorage.removeItem('google_auth_email_hint');
    // Премахваме кешираните ID-та на папки, за да не се ползват от друг потребител
    localStorage.removeItem('gdrive_multinotes_data_id');
    localStorage.removeItem('gdrive_folder_id_Other');
    localStorage.removeItem('gdrive_folder_id_Sound');
    localStorage.removeItem('gdrive_folder_id_Video');
    localStorage.removeItem('gdrive_folder_id_Images');
    // Премахваме google_login_hint САМО ако "Запомни ме" НЕ е активно
    const rememberMe = localStorage.getItem('rememberMe') === 'true';
    if (!rememberMe) {
        localStorage.removeItem('google_login_hint'); // Спираме автоматичния вход
    }
    // Задаваме флаг за изход, за да се покаже login формата
    sessionStorage.setItem('logout_flag', 'true');
    // Презареждаме страницата - checkAuth ще покаже login формата
    window.location.reload();
}

// =================================================================================
// IV. ЧЕТЕНЕ НА ДАННИ ОТ GOOGLE DRIVE
// =================================================================================
// --- GDrive Data Loading logic moved to load.js ---
/**
 * Проверява дали текущият потребител съвпада със собственика на локалната база данни.
 * Ако има несъответствие, превключва приложението в ограничен режим.
 */
async function userCheck() {
    if (!dbExists) {
        // Базата не съществува, не правим нищо.
        // Потребителят ще бъде записан при първоначалното създаване на базата.
        isDbOwner = true;
        return;
    }
    // Базата съществува, продължаваме с проверката на потребителя
    const storedUserEmail = await getConfig('userEmail');
    const currentUserEmail = sessionStorage.getItem('google_auth_email_hint');
    // Проверяваме за несъответствие само ако има записан потребител в базата
    if (storedUserEmail && currentUserEmail && storedUserEmail !== currentUserEmail) {
        isDbOwner = false;
        await handleUserMismatch(storedUserEmail);
    } else {
        isDbOwner = true;
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
async function createDatabaseFromMemory() {
    if (boardsData.length === 0 && allNotesData.length === 0) {
        showToast(_('dbCreateFailedNoData'), 10000);
        return false;
    }
    try {
        // --- КЛЮЧОВА КОРЕКЦИЯ: Осигуряваме gdid за IndexedDB (особено за архиви) ---
        // Тъй като базата използва 'gdid' като keyPath, ако полето е празно (както е в архивите),
        // всички записи ще се презаписват един друг.
        const ensureGdid = (data) => data.map(item => {
            // АКО СМЕ В РЕЖИМ АРХИВ: Винаги използваме цифровия 'id' като основен ключ 'gdid' за базата.
            // Това гарантира, че връзките в архива ще работят правилно в IndexedDB.
            if (useArhDb && item.id !== undefined) {
                return { ...item, gdid: String(item.id) };
            }
            // ЗА ДРУГИ РЕЖИМИ: Само ако gdid липсва, ползваме id като резервен вариант.
            if ((!item.gdid || item.gdid === "") && item.id !== undefined) {
                return { ...item, gdid: String(item.id) };
            }
            return item;
        });
        const preparedBoards = ensureGdid(boardsData);
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
    if (isCombinedWithDb) {
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
    // Добавяме иконата за наслагване, ако сме в комбиниран режим
    if (isCombinedWithDb) {
        let overlaySrc = '';
        let overlayAlt = '';
        if (currentUseGoogleDb) {
            overlaySrc = 'GDrive.png'; overlayAlt = 'Google Drive Sync';
        } else if (currentUseLocalFolder) {
            overlaySrc = 'Folder.png'; overlayAlt = 'Local Folder Sync';
        } else if (currentUseArhDb) {
            overlaySrc = 'Zip.png'; overlayAlt = 'Archive Source';
        }
        const overlay = document.createElement('div');
        overlay.className = 'mode-db-overlay';
        overlay.innerHTML = `<img src="${overlaySrc}" alt="${overlayAlt}">`;
        iconWrapper.appendChild(overlay);
    }
    modeButton.title = title;
}

/**
 * Обновява глобалните променливи за режим на работа от localStorage.
 * Извиква се, за да се синхронизира състоянието на приложението с настройките.
 */
function updateGlobalStateFlags() {
    if (isOfflineMode) {
        useGoogleDb = false;
        useLocalFolder = localStorage.getItem('useLocalDb') === 'true';
        useArhDb = localStorage.getItem('useArhDb') === 'true';
        useIndexedDb = localStorage.getItem('useIndexedDb') !== 'false'; // true by default in offline
    } else {
        useGoogleDb = localStorage.getItem('useGoogleDb') !== 'false'; // true по подразбиране
        useLocalFolder = localStorage.getItem('useLocalDb') === 'true';
        useArhDb = localStorage.getItem('useArhDb') === 'true';
        useIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
    }
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
        loaderContainer.style.display = 'none'; // Скриваме лоудъра
        return false; // Сигнализираме, че проверката е неуспешна
    }
    return true; // Всичко е наред
}

/**
 * Отчита проблеми с целостта на данните (липсващи или дублирани ID-та).
 */
function reportDataIntegrityIssues() {
    if (dataIntegrityIssues.length === 0) return;
    const duplicates = dataIntegrityIssues.filter(i => i.type === 'duplicate');
    const missing = dataIntegrityIssues.filter(i => i.type === 'missing');
    console.group('%c Data Integrity Report ', 'background: #f44336; color: white; font-weight: bold;');
    if (duplicates.length > 0) {
        console.warn(`Found ${duplicates.length} duplicate IDs. IndexedDB will only keep the LAST version of each.`);
        duplicates.forEach(d => {
            console.info(` - ID: ${d.gdid} | Mode: ${d.mode || 'direct'} | Files: [${d.file1}] and [${d.file2}]`);
        });
    }
    if (missing.length > 0) {
        console.warn(`Found ${missing.length} items missing an ID property. These were likely skipped.`);
        missing.forEach(m => {
            console.info(` - File: ${m.file} | Mode: ${m.mode || 'direct'} | Content: "${(m.text || '').substring(0, 50)}..."`);
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

/**
 * Основна логика за зареждане на данни в приложението.
 * Управлява откъде и как се зареждат данните в зависимост от потребителските настройки.
 */
async function mainLogic(existingAuthResult) {
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
        // --- ЗАДЪЛЖИТЕЛНО УДОСТОВЕРЯВАНЕ И ПРОВЕРКА НА ПОТРЕБИТЕЛ ---
        // Ако вече имаме валиден authResult от startApp(), го ползваме директно.
        // Иначе извикваме checkAuth() (напр. при reload, смяна на настройки и т.н.).
        const authResult = existingAuthResult || await checkAuth();
        if (!authResult || !authResult.pass) {
            if (isLoadCancelled) return;
            if (loaderContainer) loaderContainer.style.display = 'none';
            return; // Прекратяваме, checkAuth вече е пренасочил или показал грешка.
        }
        authToken = authResult.tokenData;
        // Проверяваме за съвпадение на потребителя, ако има локална база.
        await userCheck();
        if (isLoadCancelled) return;
        // ПРЕЗАРЕЖДАМЕ флаговете, в случай че userCheck ги е променил!
        updateGlobalStateFlags();
        const loaderTitle = document.getElementById('loader-title'); // Element to display loader title
        updateModeButton(); // Актуализираме иконата за режим веднага
        // Проверяваме за базата данни и нейното съдържание ВИНАГИ, когато useIndexedDb е true
        let boardsInDb = [];
        if (useIndexedDb) {
            dbExists = await checkDbExists(NOTES_DB_NAME);
            if (dbExists) {
                boardsInDb = await getAllFromDB(BOARD_STORE_NAME);
                if (isLoadCancelled) return;
            }
            // ПРОВЕРКА ЗА НЕСЪОТВЕТСТВИЕ НА БАЗАТА И ИЗТОЧНИКА
            // Тази проверка се прави тук, за да обхване всички режими, които използват база данни.
            if (dbExists && boardsInDb.length > 0) {
                // Извличаме конфигурацията на базата САМО ВЕДНЪЖ тук
                // Взимаме стойностите от базата само ако не са зададени вече от активен източник (GD, Local, Arh).
                // Това е важно за режим "само база данни".
                const dbSource = await getConfig('dbSource');
                const dbNoteIdType = await getConfig('dbNoteIdType');
                dbSourceGlobal = dbSource;
                dbNoteIdTypeGlobal = dbNoteIdType;
                console.log(`[mainLogic] DB Config Loaded: Source=${dbSource}, IdType=${dbNoteIdType}`);
                if (dbNoteIdType) { // Проверяваме само ако типът е записан
                    // Проверяваме за несъответствие, САМО ако е избран и друг източник на данни
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
        }
        // --- КОРЕКЦИЯ: Извикваме проверката за потребител тук, след като UI е готов ---
        await userCheck();
        if (isLoadCancelled) return;
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
                await loadGoogleApis();
                gapi.client.setToken({ access_token: authToken.access_token });
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
                    if (useGoogleDb) {
                        console.log("Source for initial load: Google Drive");
                        if (isLoadCancelled) return;
                        const result = await fetchAllData(null);
                        if (result.error) { // Проверяваме за грешка при зареждането
                            return; // Прекратяваме, ако няма файлове
                        }
                        // Прилагаме филтъра за демо версията ПРЕДИ създаване на DB и рендиране
                        filterNotesForDemo();
                        await createDatabaseFromMemory();
                        await renderUI({ boardParseError: result.boardParseError });
                    } else if (useLocalFolder) {
                        console.log("Source for initial load: Local Folder");
                        const { boardParseError } = await fetchAllDataFromLocalFolder();
                        // Прилагаме филтъра за демо версията ПРЕДИ създаване на DB и рендиране
                        filterNotesForDemo();
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
                        if (loaderTitle) loaderTitle.textContent = _('syncTitleGD');
                        if (isLoadCancelled) return;
                        const updatedCount = await runGoogleDriveSync();
                        showToast(updatedCount > 0 ? _('gdriveUpdatesFound').replace('{count}', updatedCount) : _('gdriveNoUpdates'), 10000);
                    } else if (useLocalFolder) {
                        if (loaderTitle) loaderTitle.textContent = _('syncTitleLocal');
                        if (isLoadCancelled) return;
                        const updatedCount = await runLocalSync();
                        showToast(updatedCount > 0 ? _('localUpdatesFound').replace('{count}', updatedCount) : _('localNoUpdates'), 10000);
                    }
                    // След синхронизация, винаги зареждаме ВСИЧКИ данни от базата
                    loaderText.textContent = _('fetchingFromDb');
                    if (isLoadCancelled) return;
                    await fetchAllDataLocal();
                    // Създаваме UI с всички данни
                    await renderUI({ boardParseError: false });
                    // Ако има обновени бележки, автоматично филтрираме по тях
                    if (updatedNoteGdims.length > 0) {
                        filterNotesByBoard('new-updates', false);
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
            loaderText.textContent = ''; // Изчистваме текста за прогреса
            updateSearchPlaceholder();
            document.body.style.backgroundImage = `url('Board.png')`; // Reset background
            loaderContainer.style.display = 'none'; // Скриваме лоудъра
            document.querySelector('header').style.visibility = 'visible';
            document.querySelector('#search-wrapper').style.display = 'flex';
            notesContainer.style.visibility = 'visible';
            isMainLogicRunning = false;
        }
    } finally {
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
    const gdidMap = new Map(); // To track duplicates
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
    mediaData = await getAllFromDB(MEDIA_STORE_NAME);
    const notesFromDB = await getAllFromDB(NOTE_STORE_NAME);
    allNotesData = notesFromDB;
    // --- REFRESH GLOBAL FLAGS FROM DB CONFIG ---
    dbSourceGlobal = await getConfig('dbSource');
    dbNoteIdTypeGlobal = await getConfig('dbNoteIdType');
    console.log(`Loaded ${boardsData.length} boards, ${mediaData.length} media, and ${allNotesData.length} notes from DB.`);
    console.log(`[fetchAllDataLocal] dbSourceGlobal: ${dbSourceGlobal}, dbNoteIdTypeGlobal: ${dbNoteIdTypeGlobal}`);
}

/**
 * Управлява процеса на локална синхронизация с файловата система.
 */
async function runLocalSync() {
    const useIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
    if (!useIndexedDb) {
        console.log("Skipping local sync because IndexedDB is disabled for this mode.");
        return 0;
    }
    const lastLocalTimestamp = await getConfig('lastLocalTimestamp');
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
                        }
                        if (item.isBoard) {
                            stores[BOARD_STORE_NAME].push(fileObject);
                        } else if (item.isMedia) {
                            stores[MEDIA_STORE_NAME].push(fileObject);
                        } else if (item.isNote) {
                            stores[NOTE_STORE_NAME].push(fileObject);
                            updatedNoteGdims.push(fileObject.gdid);
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
    return updatedCount;
}

/**
 * Показва модален прозорец на цял екран за преглед на изображение или видео.
 * @param {string} src - URL адресът на медийния файл.
 * @param {boolean} isVideo - True, ако файлът е видео.
 */
function showImageVideoOverlay(src, isVideo = false) {
    // Видеото има свой звук: пуснатото от плочката аудио се спира, преди видеото да тръгне.
    if (isVideo) stopAttachmentAudio();
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
    const fileMetadata = await gapi.client.drive.files.get({ fileId: fileId, fields: 'thumbnailLink, webContentLink' });
    const thumbnailUrl = fileMetadata.result.thumbnailLink;
    if (thumbnailUrl) {
        showImageVideoOverlay(thumbnailUrl.replace(/=s\d+/, '=s1600'), isVideo);
    } else {
        throw new Error(_(isVideo ? 'noVideoPreview' : 'noImgPreview'));
    }
}

async function showLocalPreview(folderName, fileName, mode) {
    const fileHandle = await (await dirHandle.getDirectoryHandle(folderName, { create: false })).getFileHandle(fileName);
    const file = await fileHandle.getFile();
    showImageVideoOverlay(URL.createObjectURL(file), file.type.startsWith('video'));
}
/**
 * Адресът за overlay-а на снимка: първо thumbnail-ът на Drive в голям размер (=s1600), само ако
 * го няма - самият файл (?alt=media).
 * Големият thumbnail стига за приблизителен преглед и се тегли много по-бързо от файла (една
 * снимка от телефон е няколко мегабайта, thumbnail-ът - стотина килобайта). Самият файл е
 * резервата, за да не угасва прегледът заради миниатюра, която Drive още не е направил.
 * @param {string} fileId - Id на файла в Drive.
 * @param {Function} fetchFromDrive - Заявка към Drive с токена и едно опресняване при 401.
 * @param {Function} sessionExpired - Грешката за изтекла сесия (същата, която показва прегледът).
 * @param {{skipThumb?: boolean}} [opts] - skipThumb пропуска thumbnail-а и чете направо файла;
 *        така прегледът се връща към файла, когато thumbnail адресът не се зареди.
 * @returns {Promise<{url: string, temporary: boolean}>} temporary значи blob URL, който overlay-ът
 *          трябва да отмени при затваряне. Адресът от thumbnailLink не е blob - той се помни от
 *          Drive и не бива да се отменя.
 */
async function resolvePreviewImageUrl(fileId, fetchFromDrive, sessionExpired, opts) {
    const skipThumb = !!(opts && opts.skipThumb);
    if (!skipThumb) {
        const metaResp = await fetchFromDrive(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=thumbnailLink`);
        if (metaResp.status === 401) throw sessionExpired();
        // Неуспешните метаданни не спират прегледа: минава се направо към самия файл, вместо да се
        // покаже съобщение за снимка, която може и да е достъпна.
        if (metaResp.ok) {
            let link = null;
            try { link = (await metaResp.json()).thumbnailLink || null; } catch (e) { link = null; }
            if (link) return { url: link.replace(/=s\d+/, `=s${INLINE_IMAGE_PREVIEW_SIZE}`), temporary: false };
        }
    }
    const mediaResp = await fetchFromDrive(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`);
    if (mediaResp.status === 401) throw sessionExpired();
    if (!mediaResp.ok) throw new Error(_('noImgPreview') || 'Image preview is not available right now.');
    return { url: URL.createObjectURL(await mediaResp.blob()), temporary: true };
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
    // Всяко отваряне на преглед спира звука от плочката: ако е видео, то носи свой звук и двете не
    // бива да се чуват заедно; ако е звук, прегледът е вторият глас за същия файл.
    stopAttachmentAudio();
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
    Object.assign(overlay.style, {
        position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
        backgroundColor: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: '1000', borderRadius: '8px', padding: '5px', boxSizing: 'border-box',
        flexDirection: 'column'
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
    };
    closeButton.addEventListener('click', (ev) => {
        ev.stopPropagation();
        cleanup();
    });
    overlay.appendChild(closeButton);
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
        // Откъде дойде снимката: от thumbnail адрес или от самия файл, и дали вече е имало връщане
        // към файла. Ако thumbnail адресът не се зареди, прегледът чете самия файл веднъж, вместо
        // да покаже съобщение за снимка, която е достъпна.
        let photoFromThumbnail = false;
        let photoRetriedFull = false;
        // Четенето на самия файл се дефинира в клона за Drive - там живеят токенът и заявката.
        let readFullPhotoPreview = null;
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
                    // checkAuth връща обвивка { pass, tokenData }, не самия tokenData. В authToken
                    // стои САМО tokenData - иначе хедърът излиза 'Bearer undefined' и Drive
                    // отговаря с 401 точно когато токенът тъкмо е бил обновен.
                    const newTokenData = newToken && (newToken.tokenData || (newToken.access_token ? newToken : null));
                    if (newTokenData) {
                        authToken = newTokenData;
                        // Update gapi client if needed
                        if (gapi.client) gapi.client.setToken({ access_token: authToken.access_token });
                    }
                }
                const tokenObj = (typeof authToken !== 'undefined' && authToken) ? authToken : gapi.auth.getToken();
                if (!tokenObj) throw new Error(_('errorTokenMissing'));
                // При 401 токенът се обновява веднъж и заявката се повтаря веднъж - същата схема
                // като inlineImageThumbUrl. 401 значи изтекъл токен, не липсващ файл.
                const refreshPreviewToken = async () => {
                    const refresh = await refreshAuthToken().catch(() => null);
                    if (!refresh || !refresh.pass || !refresh.tokenData || !refresh.tokenData.access_token) return null;
                    authToken = refresh.tokenData;
                    if (typeof gapi !== 'undefined' && gapi.client) {
                        gapi.client.setToken({ access_token: authToken.access_token });
                    }
                    return authToken.access_token;
                };
                const fetchFromDrive = async (url, extraHeaders = {}) => {
                    const send = (token) => fetch(url, { headers: { ...extraHeaders, 'Authorization': `Bearer ${token}` } });
                    let response = await send(tokenObj.access_token);
                    if (response.status === 401) {
                        const refreshedToken = await refreshPreviewToken();
                        if (refreshedToken) response = await send(refreshedToken);
                    }
                    return response;
                };
                // И след опресняването 401 значи изтекла сесия. Показва се точно това, а не
                // английското „Thumbnail fetch failed: 401".
                const sessionExpired = () => {
                    const err = new Error(_('errorSessionExpired'));
                    err.sessionExpired = true;
                    return err;
                };
                if (isActuallyVideo || isActuallySound) {
                    try {
                        const mediaResponse = await fetchFromDrive(`https://www.googleapis.com/drive/v3/files/${fileIdOrPath}?alt=media`, {
                            'Range': 'bytes=0-10000000'
                        });
                        if (mediaResponse.status === 401) throw sessionExpired();
                        if (!mediaResponse.ok) throw new Error(`Media fetch failed: ${mediaResponse.status}`);
                        const mediaBlob = await mediaResponse.blob();
                        mediaUrl = URL.createObjectURL(mediaBlob);
                        overlay.mediaUrlToRevoke = mediaUrl;
                    } catch (err) {
                        console.log("Failed to load GDrive media blob:", err);
                        // Изтеклата сесия не е „няма преглед на този файл" - казва се, че е изтекла.
                        if (err && err.sessionExpired) throw err;
                        throw new Error(_(isActuallyVideo ? 'noVideoPreview' : 'noSoundPreview') || 'Preview error');
                    }
                } else {
                    // Снимка: първо thumbnail в размер за преглед (виж resolvePreviewImageUrl), а
                    // самият файл се чете само ако thumbnail не дойде - или ако адресът му не се
                    // зареди (виж обработчика на error по-долу).
                    const picked = await resolvePreviewImageUrl(fileIdOrPath, fetchFromDrive, sessionExpired);
                    mediaUrl = picked.url;
                    if (picked.temporary) {
                        overlay.mediaUrlToRevoke = mediaUrl;
                    } else {
                        photoFromThumbnail = true;
                        readFullPhotoPreview = () => resolvePreviewImageUrl(fileIdOrPath, fetchFromDrive, sessionExpired, { skipThumb: true });
                    }
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
                // Съобщението се показва само когато и резервата не помогне.
                const showNoPreview = (message) => {
                    if (!mediaElement.isConnected) return;
                    const failed = document.createElement('div');
                    failed.style.color = 'white';
                    failed.style.textAlign = 'center';
                    failed.style.padding = '20px';
                    failed.textContent = message || _('noImgPreview') || 'Image preview is not available right now.';
                    mediaContainer.replaceChildren(failed);
                };
                mediaElement.addEventListener('error', () => {
                    if (!mediaElement.isConnected) return;
                    // thumbnail адресът не се зареди (изтекъл подпис, още неготов thumbnail, счупен
                    // размер) - това не значи, че снимката я няма: чете се самият файл, веднъж.
                    if (photoFromThumbnail && !photoRetriedFull && readFullPhotoPreview) {
                        photoRetriedFull = true;
                        readFullPhotoPreview().then(full => {
                            if (!mediaElement.isConnected) {
                                // Прегледът е затворен, докато файлът се теглеше - blob-ът се пуска.
                                if (full && full.temporary) URL.revokeObjectURL(full.url);
                                return;
                            }
                            if (!full || !full.url) { showNoPreview(); return; }
                            if (full.temporary) overlay.mediaUrlToRevoke = full.url;
                            mediaElement.src = full.url;
                        }).catch(err => {
                            // Изтекла сесия се казва с думите за изтекла сесия, не като липсваща снимка.
                            showNoPreview(err && err.sessionExpired ? err.message : null);
                        });
                        return;
                    }
                    // Адресът е файлът, прочетен преди това; ако въпреки това не тръгне (мрежата е
                    // паднала между четенето и показването), се казва с думи, а не с липсваща картинка.
                    showNoPreview();
                });
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
        const noteElement = e.currentTarget.closest('.note') || e.currentTarget.closest('#modal-body') || document.getElementById('modal-body');
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
function makeElementDraggable(element, storageKey) {
    if (!element) return;
    // Restore position
    const setDefaultPosition = () => {
        element.style.right = '10px';
        element.style.left = 'auto';
        element.style.top = ''; // Clear top to fallback to bottom
        if (element.id === 'kb-fab') {
            element.style.bottom = '10px';
        } else if (element.id === 'scrollTopBtn') {
            element.style.bottom = '80px';
        } else {
            // Default for other elements if any, fallback to CSS or a safe default
            // Assume CSS handles it if we don't set it, or set a safe default.
            // But to be safe if we are clearing top, let's look at ID or just leave custom styles alone
            // However, for consistency with 'no values', we might want to respect CSS.
            // If we set top='', bottom takes over from CSS.
            // If we want to enforce bottom right for others too:
            element.style.bottom = '20px';
        }
    };
    // Restore position
    const savedPos = localStorage.getItem(storageKey);
    let positionRestored = false;
    if (savedPos) {
        try {
            const pos = JSON.parse(savedPos);
            // Check if pos properties exist
            if (pos.top !== undefined && pos.right !== undefined) {
                const viewportWidth = window.innerWidth;
                const viewportHeight = window.innerHeight;
                // Use fallback dimensions if element is hidden (offset is 0)
                const elHeight = element.offsetHeight || 60;
                const elWidth = element.offsetWidth || 60;
                let topVal = parseInt(pos.top, 10);
                let rightVal = parseInt(pos.right, 10);
                // Define "off-screen" tolerance
                // If top is negative or way below viewport
                // If right is negative or way to the left (right > viewportWidth)
                const isVerticalOut = (topVal < 0) || (topVal > viewportHeight - 20); // At least 20px visible
                const isHorizontalOut = (rightVal < 0) || (rightVal > viewportWidth - 20);
                if (isVerticalOut || isHorizontalOut) {
                    console.log(`Element ${element.id} position reset (was off-screen):`, pos);
                    setDefaultPosition();
                } else {
                    // Clamp values to be within the viewport
                    topVal = Math.max(0, Math.min(topVal, viewportHeight - elHeight));
                    rightVal = Math.max(0, Math.min(rightVal, viewportWidth - elWidth));
                    element.style.top = `${topVal}px`;
                    element.style.right = `${rightVal}px`;
                    element.style.bottom = 'auto';
                    element.style.left = 'auto';
                }
                positionRestored = true;
            }
        } catch (e) {
            console.log("Error restoring position:", e);
        }
    }
    if (!positionRestored) {
        setDefaultPosition();
    }
    let isDragging = false;
    let hasMoved = false;
    let startX, startY, startTop, startRight;
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
    };
    const onDragMove = (e) => {
        if (!isDragging) return;
        const clientX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
        const clientY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
        if (Math.abs(clientX - startX) > 5 || Math.abs(clientY - startY) > 5) {
            hasMoved = true;
            element.classList.add('dragging');
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
    // Block click if moved
    element.addEventListener('click', (e) => {
        if (hasMoved) {
            e.preventDefault();
            e.stopImmediatePropagation();
            hasMoved = false;
        }
    }, true);
}

// --- Няколко отворени бележки (порт от cx-notes b1.82 / b1.83) -----------------------------------
// Всяка бележка се отваря в свой прозорец: клонинг на #content-modal-template в #note-windows-layer.
// Останалият код продължава да говори за „модала" (contentModal, modalBody, copyBtn,
// currentModalContent, #content-modal, #modal-body ...). Само АКТИВНИЯТ прозорец носи тези id-та и
// глобални променливи; другите пазят своите като data-mwid + .nw-<id> и ги получават обратно, щом
// станат активни (натиск или фокус в тях). Така един прозорец не пише в друг, а старите пътища в
// кода не се пипат.
//
// Рендерът си остава на main (renderNoteWindow по-долу, бившият showModal): рендерът на cx-notes
// вика редактор, който main няма, а вградените картинки (type=8), футърът с плочки и аудио/видеото
// са точно в main-овия.
//
// Ново тук (го няма в cx-notes):
// - мястото и размерът на прозореца се пазят в localStorage за всяка бележка поотделно - един
//   речник „ключ на бележка -> {x, y, w, h}" плюс ред на използване, до 300 бележки, най-старата
//   се изхвърля;
// - „Затвори всички" в лентата на прозореца, само когато са отворени три или повече бележки;
// - смяната на борда не пипа отворените прозорци.
const NOTE_WINDOW_Z_BASE = 10050; // вътре в #note-windows-layer: никога не стига до останалата страница
const NOTE_WINDOW_CASCADE = 28;
const NOTE_WINDOW_CYCLE = 6;
const NOTE_WINDOW_NARROW = 768; // px: под това стълбицата слиза само надолу, без отместване встрани
const NOTE_WINDOW_MARGIN = 10; // px около прозорец, по-голям от екрана
const NOTE_WINDOW_GEOM_KEY = 'noteWindowGeometry';
const NOTE_WINDOW_GEOM_MAX = 300; // до 300 записа; най-старият се изхвърля
const NOTE_WINDOW_WALK_IDLE = 1200; // мс без натиск на стрелка: обхождането на прозорците се строи наново
const NOTE_WINDOW_NAV_IN_PLACE_MS = 1500; // мс: < / > сменя бележката в СЪЩИЯ прозорец (бележките на борда)
let noteWindows = []; // всички прозорци в DOM: отворените плюс най-много един празен (затворен)
let activeNoteWindow = null;
let noteWindowZ = NOTE_WINDOW_Z_BASE - 1;
// Кога (мс) е бил натиснат < / > за бележка от борда: следващата показана бележка влиза в СЪЩИЯ
// прозорец, вместо да отвори нов. Пази се като време, за да не зависи от това дали кликът стига до
// showModal в същия такт.
let noteWindowNavInPlace = 0;
// Обхождане на отворените прозорци със стрелките (при повече от два): { order: [прозорец...], index }.
// Редът се строи ВЕДНЪЖ за сесията - вж. stepNoteWindowWalk.
let noteWindowWalk = null;
let noteWindowWalkTimer = 0;
// Кой прозорец е бил активен в момента, в който е започнало натискането. Стрелката прави своя
// прозорец активен още на pointerdown, така че без това обхождането не знае откъде е тръгнало.
let noteWindowPressFrom = null;
// Кой прозорец чиято стрелка беше натисната последно: повторен натиск в същата стрелка продължава
// обхождането, натиск в друга стрелка тръгва от нея.
let noteWindowLastArrowWin = null;
// Натискането е започнало върху стрелка: тогава активирането на прозореца НЕ строи обхождането
// наново (иначе всеки натиск тръгва от натиснатата стрелка - вж. stepNoteWindowWalk).
let noteWindowPressOnArrow = false;

// Слоят и шаблонът се правят от самия #content-modal, за да няма две копия на една и съща
// разметка в index-2.html. Самият #content-modal влиза в слоя и е първият прозорец: иначе, като
// по-ранен в DOM, той всеки път оставаше под новите.
function ensureNoteWindowLayer() {
    const src = document.getElementById('content-modal');
    if (!src) return null;
    let layer = document.getElementById('note-windows-layer');
    if (!layer) {
        layer = document.createElement('div');
        layer.id = 'note-windows-layer';
        // Слоят застава на мястото на модала, тоест ПРЕДИ менюто с бордове и настройките: те са
        // със същия z-index и по-късните в DOM остават отгоре.
        src.parentNode.insertBefore(layer, src.nextSibling);
    }
    if (!document.getElementById('content-modal-template')) {
        decorateNoteWindowIds(src);
        const tpl = src.cloneNode(true);
        tpl.id = 'content-modal-template';
        tpl.classList.remove('visible', 'note-window', 'note-window-active');
        tpl.classList.add('note-window');
        tpl.style.display = 'none';
        // Вътрешните id-та стават data-mwid: самият шаблон пази своето, по него се намира.
        [...tpl.querySelectorAll('[id]')].forEach(el => {
            if (!el.id) return;
            el.dataset.mwid = el.id;
            el.classList.add('nw-' + el.id);
            el.removeAttribute('id');
        });
        layer.parentNode.insertBefore(tpl, layer);
    }
    if (src.parentNode !== layer) layer.appendChild(src);
    return layer;
}

// Класовете .nw-<id> остават и когато id-то бъде прибрано: CSS-ът на бележката (#modal-body ...)
// е разширен с :is(#modal-body, .nw-modal-body), за да изглежда и неактивният прозорец както трябва.
function decorateNoteWindowIds(root) {
    if (!root) return;
    [root, ...root.querySelectorAll('[id]')].forEach(el => {
        if (!el.id) return;
        if (el !== root) el.classList.add('nw-' + el.id);
    });
}

function stashNoteWindowIds(win) {
    [win.el, ...win.el.querySelectorAll('[id]')].forEach(el => {
        if (!el.id) return;
        el.dataset.mwid = el.id;
        if (el !== win.el) el.classList.add('nw-' + el.id);
        el.removeAttribute('id');
    });
}

function restoreNoteWindowIds(win) {
    [win.el, ...win.el.querySelectorAll('[data-mwid]')].forEach(el => {
        if (!el.dataset.mwid) return;
        el.id = el.dataset.mwid;
        delete el.dataset.mwid;
    });
}

function activateNoteWindow(win, front = true) {
    if (!win) return;
    // Скрита бележка се връща на екрана, преди да стане активна: „активна, но невидима" не е
    // състояние, което потребителят може да види (клик на плочка, showModal за нея, < / >).
    if (win.hidden) showNoteWindow(win);
    // Клик в самата бележка (или програматично активиране) е съзнателен избор на прозорец: следващото
    // натискане на стрелка тръгва от него. Натиск върху стрелка не брои - там стъпката решава.
    if (!noteWindowPressOnArrow && activeNoteWindow && activeNoteWindow !== win) {
        resetNoteWindowWalk();
        noteWindowLastArrowWin = null;
    }
    if (activeNoteWindow !== win) {
        const prev = activeNoteWindow;
        if (prev) {
            prev.state.currentModalContent = currentModalContent;
            stashNoteWindowIds(prev);
            prev.el.classList.remove('note-window-active');
        }
        restoreNoteWindowIds(win);
        activeNoteWindow = win;
        contentModal = win.el;
        modalBody = win.body;
        copyBtn = win.copyBtn;
        currentModalContent = win.state.currentModalContent || '';
        win.el.classList.add('note-window-active');
        // Открояването в лентата на отворените бележки следва активната: и когато прозорецът не се
        // вдига отпред, плочката пак трябва да сочи вярната бележка.
        refreshOpenNotesBar();
    }
    if (front) raiseNoteWindow(win);
    // Лентата следва прозорците и когато активната НЕ се сменя: щом бележката се върне от скрита
    // през плочката си, приглушаването ѝ трябва да падне веднага. Без това (активната бележка е
    // скрита, значи activateNoteWindow не влиза в горния клон, а raiseNoteWindow излиза още в
    // началото, защото прозорецът вече е най-отпред) плочката остава is-hidden до следващото
    // опресняване - стига се при една отворена бележка или когато всички са скрити.
    refreshOpenNotesBar();
}

function raiseNoteWindow(win) {
    if (Number(win.el.style.zIndex) === noteWindowZ && noteWindowZ >= NOTE_WINDOW_Z_BASE) return;
    if (noteWindowZ > NOTE_WINDOW_Z_BASE + 5000) {
        // Числата да останат малки: преномерираме в текущия ред.
        noteWindowZ = NOTE_WINDOW_Z_BASE - 1;
        noteWindows.filter(w => w !== win)
            .sort((a, b) => (Number(a.el.style.zIndex) || 0) - (Number(b.el.style.zIndex) || 0))
            .forEach(w => { w.el.style.zIndex = String(++noteWindowZ); });
    }
    win.el.style.zIndex = String(++noteWindowZ);
    win.el.classList.add('note-window-active');
    updateSingleNoteOverlay();
}

function getOpenNoteWindows() {
    return noteWindows.filter(w => w.open);
}

function getTopNoteWindow(list = getOpenNoteWindows()) {
    // Скритите бележки не се броят за „най-отпред": вдигането, Escape и single-note overlay-ът работят
    // само с видимите. Ако всички са скрити, се връща най-горната от всички - затварянето на активна
    // бележка има нужда от прозорец, който да поеме активността.
    const visible = list.filter(w => !w.hidden);
    const pool = visible.length ? visible : list;
    return pool.reduce((top, w) => (!top || (Number(w.el.style.zIndex) || 0) > (Number(top.el.style.zIndex) || 0)) ? w : top, null);
}

// --- Стрелките < / > в лентата ----------------------------------------------------------------
// При ЕДИН отворен прозорец стрелките ходят по бележките на борда и сменят бележката в същия
// прозорец. От ДВА отворени нагоре те обхождат САМИТЕ ПРОЗОРЦИ, по един на натиск, и се завъртат в
// краищата (при два се редуват двата и зациклят). Редът се строи веднъж за сесията и курсорът се
// мести с ±1 по него, така че многократно натискане в ЕДНА бележка минава през целия списък и се
// връща в началото. Ако редът се предефинираше след всяко активиране (например по z-index),
// вдигнатият прозорец щеше да е винаги последен и всеки натиск щеше да подскача между същите два
// прозореца, вместо да върви напред.
function noteWindowWalkEnabled() {
    return getOpenNoteWindows().length > 1;
}

function sameNoteWindowOrder(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    return a.every((w, i) => w === b[i]);
}

function resetNoteWindowWalk() {
    noteWindowWalk = null;
    if (noteWindowWalkTimer) {
        clearTimeout(noteWindowWalkTimer);
        noteWindowWalkTimer = 0;
    }
}

const NOTE_ARROW_SELECTOR = '#prev-note-btn, #next-note-btn, [data-mwid="prev-note-btn"], [data-mwid="next-note-btn"]';

function stepNoteWindowWalk(direction, pressed) {
    const open = getOpenNoteWindows();
    if (open.length < 2) return;
    const active = (activeNoteWindow && activeNoteWindow.open) ? activeNoteWindow : null;
    // Откъде тръгва стъпката:
    // - натиск върху ДРУГА стрелка (друг прозорец) тръгва от нея - това е съзнателен избор;
    // - повторен натиск върху СЪЩАТА стрелка продължава курса на обхождането. Иначе всеки натиск
    //   в нея щеше да тръгва от нея и да стига винаги до един и същ съсед (от бележка 1 винаги 2);
    // - след изтичане на NOTE_WINDOW_WALK_IDLE обхождането се строи наново от прозореца, който е
    //   бил активен ПРЕДИ натискането (noteWindowPressFrom): самата стрелка прави своя прозорец
    //   активен още на pointerdown.
    const otherArrow = pressed && noteWindowLastArrowWin !== pressed;
    const from = otherArrow ? pressed
        : ((noteWindowPressFrom && noteWindowPressFrom.open && open.includes(noteWindowPressFrom))
            ? noteWindowPressFrom : active);
    let walk = noteWindowWalk;
    if (!walk || !sameNoteWindowOrder(walk.order, open)) {
        walk = noteWindowWalk = { order: open.slice(), index: Math.max(0, open.indexOf(from)) };
    } else if (otherArrow) {
        walk.index = Math.max(0, walk.order.indexOf(pressed));
    }
    noteWindowLastArrowWin = pressed || null;
    // Курсът НЕ се мести към натиснатия прозорец: той е състояние на сесията и всеки натиск го
    // мести само с една стъпка. Иначе многократно натискане в една стрелка се връщаше в началото.
    walk.index = (walk.index + (direction < 0 ? -1 : 1) + walk.order.length) % walk.order.length;
    const target = walk.order[walk.index];
    if (target && target.open) activateNoteWindow(target, true);
    if (noteWindowWalkTimer) clearTimeout(noteWindowWalkTimer);
    noteWindowWalkTimer = setTimeout(resetNoteWindowWalk, NOTE_WINDOW_WALK_IDLE);
    // Изяждат се след стъпката: иначе при натискане без pointerdown (програмно) остава стар
    // "предишен прозорец" и обхождането тръгва от него.
    noteWindowPressFrom = null;
    noteWindowPressOnArrow = false;
}

// Съседната бележка от борда влиза в СЪЩИЯ прозорец (noteWindowNavInPlace), не отваря втори.
function navigateBoardNote(win, direction) {
    const notes = win && win.navNotes;
    if (!notes || !notes.length) return;
    const newIndex = (win.navIndex || 0) + direction;
    if (newIndex < 0 || newIndex >= notes.length) return;
    noteWindowNavInPlace = Date.now();
    notes[newIndex].click();
}

// Стрелките на един прозорец: при повече от два отворени прозореца и двете се виждат и обхождат
// прозорците (всеки натиск - следващият, със завъртане). Иначе са това, което са били: водят до
// съседната бележка от борда и се скриват в края на списъка.
function updateNoteWindowNav(win) {
    if (!win || !win.el) return;
    const prevBtn = win.el.querySelector('#prev-note-btn, [data-mwid="prev-note-btn"]');
    const nextBtn = win.el.querySelector('#next-note-btn, [data-mwid="next-note-btn"]');
    if (!prevBtn || !nextBtn) return;
    prevBtn.onclick = () => {
        if (noteWindowWalkEnabled()) stepNoteWindowWalk(-1, win);
        else navigateBoardNote(win, -1);
    };
    nextBtn.onclick = () => {
        if (noteWindowWalkEnabled()) stepNoteWindowWalk(1, win);
        else navigateBoardNote(win, 1);
    };
    if (noteWindowWalkEnabled()) {
        prevBtn.style.display = 'flex';
        nextBtn.style.display = 'flex';
        return;
    }
    const notes = win.navNotes, idx = (typeof win.navIndex === 'number') ? win.navIndex : -1;
    prevBtn.style.display = (notes && idx > 0) ? 'flex' : 'none';
    nextBtn.style.display = (notes && idx >= 0 && idx < notes.length - 1) ? 'flex' : 'none';
}

function findNoteWindow(id, gdid) {
    const sid = (id === undefined || id === null) ? '' : String(id);
    const sgdid = (gdid === undefined || gdid === null) ? '' : String(gdid);
    if (!sid && !sgdid) return null;
    return getOpenNoteWindows().find(w => (sgdid && w.body.dataset.gdid === sgdid) || (sid && w.body.dataset.id === sid)) || null;
}

function getNoteWindowRaw(win) {
    return win === activeNoteWindow ? currentModalContent : (win.state.currentModalContent || '');
}

// --- Единична бележка (настройка, b1.83) ---------------------------------------------------------
// Затъмнение точно под горния отворен прозорец, вътре в слоя: то поема всяко натискане, което е
// било за страницата или за друг прозорец. Натиск върху него затваря бележката като хиксчето.
// Като defaultNoteBg живее в localStorage; ключът е в appSettingsKeys, значи профилът го носи.
function isSingleNoteMode() {
    return localStorage.getItem('singleNoteMode') === 'true';
}

// След зареждане на профил: чекбоксът и затъмнението следват заредената стойност веднага.
function applySingleNoteModeSetting() {
    const checkbox = document.getElementById('single-note-mode-checkbox');
    if (checkbox) checkbox.checked = isSingleNoteMode();
    // В режим „единична бележка" лентата не се показва, значи скрита бележка остава недостъпна -
    // затова включването на режима затваря скритите, вместо да ги връща на екрана. Собственикът
    // (25.10.2026): „Включването на режима връща скритите бележки на екрана - не, в този режим не
    // може да има много бележки, така че да не ги връща, а да ги затваря".
    if (isSingleNoteMode()) closeHiddenNoteWindows();
    updateSingleNoteOverlay();
}

// „Единична бележка" значи една бележка: включването (и всяко изкарване напред, докато е включена)
// оставя само горния прозорец - останалите се затварят, както ги затваря хиксчето. Иначе режимът
// щеше да е само затъмнение върху няколко прозореца, а той е „една бележка".
let singleNoteEnforcing = false;
function enforceSingleNoteWindow() {
    if (singleNoteEnforcing || !isSingleNoteMode()) return;
    const open = getOpenNoteWindows();
    if (open.length < 2) return;
    const keep = getTopNoteWindow(open);
    singleNoteEnforcing = true;
    try {
        open.filter(w => w !== keep).forEach(closeNoteWindow);
        if (keep && keep.open && activeNoteWindow !== keep) activateNoteWindow(keep, false);
    } finally {
        singleNoteEnforcing = false;
    }
}

function updateSingleNoteOverlay() {
    enforceSingleNoteWindow();
    // Лентата на отворените бележки върви заедно с прозорците: тук минава всяко вдигане, всяко
    // затваряне и „затвори всички", значи състоянието ѝ никога не изостава от прозорците.
    refreshOpenNotesBar();
    // Броят на отворените прозорци може да се е сменил: стрелките се преизчисляват във всеки от тях.
    noteWindows.forEach(w => { if (w.open) updateNoteWindowNav(w); });
    const layer = document.getElementById('note-windows-layer');
    if (!layer) return;
    let overlay = document.getElementById('single-note-overlay');
    const top = isSingleNoteMode() ? getTopNoteWindow() : null;
    if (!top) {
        overlay?.classList.remove('visible');
        return;
    }
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'single-note-overlay';
        overlay.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const win = getTopNoteWindow();
            if (!win) return;
            activateNoteWindow(win, true);
            closeNoteWindow(win);
        });
        layer.appendChild(overlay);
    }
    overlay.style.zIndex = top.el.style.zIndex || String(NOTE_WINDOW_Z_BASE);
    if (overlay.parentNode !== layer || overlay.nextSibling !== top.el) layer.insertBefore(overlay, top.el);
    overlay.classList.add('visible');
}

// --- Лента на отворените бележки (порт от cx-notes b2.70/b2.72/b2.74/b2.77, кеш b1.39) ----------
// Собственикът (24.10.2026): „когато имаме отворени повече от 2 бележки най-отдолу на екрана да се
// появи лента с мини-изображения (40px) на бележките и бутон за затваряне на всички бележки, която
// да се приплъзва, ако няма достатъчно място на екрана. кликването на иконка активира съответната
// ѝ бележка".
// Лентата живее в #note-windows-layer - същият родител като прозорците - затова носи
// pointer-events: auto и z-index над всеки прозорец: иначе вдигнат с клик прозорец би я закрил.
// Показва се при ДВЕ и повече отворени и видими бележки (собственикът, 29.10.2026: „искам лентата с
// бутони на отворени бележки да не се показва, ако е отворена само 1 бележка, а за 2 и повече") ИЛИ
// когато има скрити бележки - иначе няма как да ги върнеш обратно.
// В режим „единична бележка" лентата не се показва изобщо (собственикът, 25.10.2026: тя е
// излишна, когато режимът държи една бележка) - виж refreshOpenNotesBar.
const OPEN_NOTES_BAR_MIN = 2;
const OPEN_NOTES_BAR_Z = NOTE_WINDOW_Z_BASE + 9000;
// Размерът на миниатюрата: плочката е 40px, значи 80px стигат за плътна картинка на екран с
// двойна плътност, а заявката остава малка.
const OPEN_NOTES_BAR_THUMB_SIZE = 80;
// Колко се чака миниатюрата, преди плочката да остане с буквите си: лентата не бива да чака мрежата.
const OPEN_NOTES_BAR_THUMB_WAIT = 1000;
// Повторни опити след изтеклото чакане. Търсенето на файла по име в Drive може да е по-бавно от
// OPEN_NOTES_BAR_THUMB_WAIT, а опресняването излиза по подписа на плочката - значи без повторен опит
// една бавна заявка оставяше плочката с букви до края на сесията (собственикът, 25.10.2026).
// Времената са от началото на първия опит: ~1.5s и ~4s, тоест три опита за около четири секунди.
const OPEN_NOTES_BAR_THUMB_TRIES = 3;
const OPEN_NOTES_BAR_THUMB_RETRY_MS = [500, 1500];
// Тъмният цвят на буквите върху светла плочка. Плочката носи ТОЧНИЯ цвят на бележката си, значи
// цветът на текста се смята от фона (виж openNotesBarTextColorFor), а не е фиксиран.
const OPEN_NOTES_BAR_DARK_TEXT = '#1F2A30';
// Цветът, с който showModal боядисва бележка без свой цвят (вж. renderNoteWindow). Ползва се само
// ако прозорецът още не е боядисан и бележката няма цвят в данните си.
const OPEN_NOTES_BAR_DEFAULT_BG = '#eef603';
// Дългото натискане на плочка само я ВДИГА за местене (собственикът, 25.10.2026: „Продължително
// натискане само за местене, не затваря"). Прагът за отмяна при touchmove (5px) е ПО-МАЛЪК от този на
// wireOpenNotesBarDragGuard (6px): плъзгане по лентата отменя задържането още преди пазачът да го
// обяви за плъзгане, а лекото трепване на пръста не губи задържането.
const OPEN_NOTES_BAR_LONG_PRESS_MS = 500;
const OPEN_NOTES_BAR_LONG_PRESS_MOVE_PX = 5;
// Намерен адрес на миниатюра по име на файл: при всяко опресняване плочката се строи наново, а без
// този кеш всяка смяна на активната бележка връща картинката в началото и тя мига. Помни се за
// КОЛКОТО и общият кеш на thumbnail-ите (INLINE_IMAGE_THUMB_TTL): подписаният адрес на Drive изтича
// и не бива да се ползва до края на сесията.
const openNotesBarThumbSrc = new Map();
let openNotesBarKeySeq = 0;

/** Бележката зад един прозорец (по gdid, иначе по id) - както я търсят и другите места в main.js. */
function findNoteForWindow(win) {
    if (!win || !win.body) return null;
    const gdid = win.body.dataset.gdid, id = win.body.dataset.id;
    return allNotesData.find(n => (n.gdid && String(n.gdid) === String(gdid)) || (n.id && String(n.id) === String(id))) || null;
}

/** Ключът на плочката за един прозорец: бележката (gdid/id), а за бележка без id - самият прозорец. */
function openNotesBarKeyFor(win) {
    const gdid = win.body.dataset.gdid || '';
    const id = win.body.dataset.id || '';
    if (gdid || id) return `n\u0000${gdid}\u0000${id}`;
    if (!win.barKey) win.barKey = `w\u0000${++openNotesBarKeySeq}`;
    return win.barKey;
}

/** Прозорецът, към който сочи една плочка (по ключа ѝ), или null, ако вече е затворен. */
function openNotesBarWindowFor(tile) {
    const key = tile && tile.dataset.barKey;
    if (!key) return null;
    return getOpenNoteWindows().find(w => openNotesBarKeyFor(w) === key) || null;
}

// --- Редът на плочките в лентата (b1.50) -------------------------------------------------------
// Собственикът (25.10.2026): „dragging along the bar да премества бутона на бележките в рамките на
// лентата за преподреждане". Редът е СПИСЪК ОТ КЛЮЧОВЕ (openNotesBarKeyFor), а не от позиции: плочката
// на затворена и отворена наново бележка е същата бележка и си остава на мястото. Живее в localStorage
// и оцелява след презареждане на страницата; ако localStorage не е достъпен, работи само в паметта.
const OPEN_NOTES_BAR_ORDER_STORE = 'cx_open_notes_bar_order';
let openNotesBarOrder = readOpenNotesBarOrder();
// Ключовете, които ТАЗИ сесия е виждала отворени. По тях се разбира кое е „затворена бележка" (била е
// отворена, сега я няма) и кое е „бележка, която още не е отваряна" (идва от записа на предишното
// зареждане): иначе първото отваряне след презареждане би изтрило целия записан ред, защото в него
// всички останали ключове изглеждат „затворени".
const openNotesBarSeen = new Set();

function readOpenNotesBarOrder() {
    try {
        const raw = localStorage.getItem(OPEN_NOTES_BAR_ORDER_STORE);
        const list = raw ? JSON.parse(raw) : null;
        if (!Array.isArray(list)) return [];
        return list.filter(k => typeof k === 'string' && k);
    } catch (e) { return []; }
}

function saveOpenNotesBarOrder() {
    try { localStorage.setItem(OPEN_NOTES_BAR_ORDER_STORE, JSON.stringify(openNotesBarOrder)); } catch (e) { }
}

/**
 * Подрежда отворените прозорци по запомнения ред. Новодошлите влизат в КРАЯ, а ключовете на
 * затворените бележки се махат - иначе списъкът расте с всеки отворен прозорец и редът на новите
 * зависи от това кога за последно е бил отворен някой стар.
 */
function orderOpenNoteWindows(open) {
    // Без отворена бележка редът НЕ се пипа: първото опресняване при старт на приложението идва точно
    // така (лентата се строи, когато няма отворена бележка) и иначе би изтрило запомнения ред, тоест
    // редът не би оцелял след презареждане на страницата.
    if (!open.length) return open.slice();
    const keys = open.map(w => openNotesBarKeyFor(w));
    keys.forEach(k => openNotesBarSeen.add(k));
    // Ключ се маха само ако бележката е била отворена в тази сесия и вече я няма - виж openNotesBarSeen.
    const kept = openNotesBarOrder.filter(k => keys.includes(k) || !openNotesBarSeen.has(k));
    let changed = kept.length !== openNotesBarOrder.length;
    keys.forEach((k) => {
        if (!kept.includes(k)) { kept.push(k); changed = true; }
    });
    openNotesBarOrder = kept;
    if (changed) saveOpenNotesBarOrder();
    const rank = new Map(openNotesBarOrder.map((k, i) => [k, i]));
    const rankOf = (win) => {
        const k = openNotesBarKeyFor(win);
        return rank.has(k) ? rank.get(k) : Number.MAX_SAFE_INTEGER;
    };
    return open.slice().sort((a, b) => rankOf(a) - rankOf(b));
}

/** Записва реда такъв, какъвто е в лентата в момента (след плъзгане). */
function commitOpenNotesBarOrderFromStrip(strip) {
    if (!strip) return [];
    const keys = Array.from(strip.children).map(el => el.dataset.barKey).filter(Boolean);
    if (!keys.length) return keys;
    openNotesBarOrder = keys;
    saveOpenNotesBarOrder();
    return keys;
}


// --- Скриване на бележките без затваряне (порт от cx-notes b2.70) ------------------------------
// Собственикът: „скрий всички бележки" - прозорците изчезват от екрана, но НЕ се затварят: бележката
// остава отворена в noteWindows с текста, позицията и незаписаните си промени. Затова тук НЕ се
// вика onNoteWindowClosed (тоест няма и въпрос за незаписване), нищо не се трие и нищо не се записва.
// Скритият прозорец е display: none, значи не прихваща кликове и не участва в single-note overlay-а.

/** Скритите отворени бележки. */
function getHiddenNoteWindows() {
    return getOpenNoteWindows().filter(w => w.hidden);
}

/** Скрива един прозорец: маха го от екрана, без да го затваря. */
function hideNoteWindow(win) {
    if (!win || !win.open || win.hidden) return;
    win.hidden = true;
    // Класът 'visible' НЕ се пипа: той значи „отворена" и свалянето му минава през затваряне.
    win.el.classList.add('note-window-hidden');
    // Бележката остава разпъната, ако е била: състоянието ѝ се помни за прозореца и се възстановява
    // при връщане на екрана. Тук не се пипа нищо по разпъването.
}

/** Връща скрит прозорец на екрана (без да го вдига и без да го прави активен). */
function showNoteWindow(win) {
    if (!win || !win.hidden) return;
    win.hidden = false;
    win.el.classList.remove('note-window-hidden');
}

/** Бутонът в лентата: скрива всички отворени бележки наведнъж - без питане и без затваряне. */
function hideAllNoteWindows() {
    getOpenNoteWindows().forEach(hideNoteWindow);
    updateSingleNoteOverlay();
}

/** Бутонът в лентата, когато всички са скрити: връща всички наведнъж, най-горната - активна. */
function showAllNoteWindows() {
    const hidden = getHiddenNoteWindows();
    if (!hidden.length) return;
    hidden.forEach(showNoteWindow);
    const top = getTopNoteWindow();
    if (top) activateNoteWindow(top, true);
    updateSingleNoteOverlay();
}

/** Включването на режима „единична бележка" затваря скритите прозорци: в него не може да има много
 *  бележки, а лентата, единственият път да върнеш скрита бележка, не се показва. Затваря ги както
 *  „затвори всички" - без питане, защото и там (closeAllNoteWindows) не се пита. */
function closeHiddenNoteWindows() {
    const hidden = getHiddenNoteWindows();
    if (!hidden.length) return;
    hidden.forEach(closeNoteWindow);
}

// --- Лентата избутва нагоре плаващите бутони на долния ръб (порт от cx-notes b2.70) ------------
// Собственикът: „докато лентата е видима, тя ИЗБУТВА нагоре плаващите бутони, които стоят най-долу
// на екрана... те трябва да се качат НАД лентата, а не да са зад нея."
// Механизъм: височината на лентата се мери и се записва в --open-notes-bar-h, а класът
// body.open-notes-bar-visible включва правилата, които я ползват. Класът се маха и променливата се
// връща на 0px, щом лентата изчезне - тогава нищо не остава отместено.
// Бутоните, които местенето слага с инлайн !important (kb-fab, scrollTopBtn - вж.
// makeElementDraggable), не могат да бъдат вдигнати от stylesheet - затова тук инлайн стойността им
// се обвива в calc() със същата променлива. Обвивката се разпознава и се разгъва при всяко викане,
// значи местене на бутон, докато лентата е видима, не оставя сметката сгрешена.
const OPEN_NOTES_BAR_LIFT_GAP = 8;
// Само елементите, които съществуват в main: асистентският бутон и стрелката нагоре. cx-ските
// #add-note-fab и #selection-bar тук ги няма, значи и правила за тях няма.
const OPEN_NOTES_BAR_FLOATERS = ['kb-fab', 'scrollTopBtn'];
const OPEN_NOTES_BAR_LIFT_RE = /^calc\((.+?)\s*[+-]\s*var\(--open-notes-bar-h\)\s*[+-]\s*8px\)$/;

/** Височината на лентата в пиксели, или 0, ако не се вижда. */
function openNotesBarHeight() {
    const bar = document.getElementById('open-notes-bar');
    if (!bar || !bar.classList.contains('is-visible')) return 0;
    return Math.round(bar.getBoundingClientRect().height) || 0;
}

/** Казва на CSS колко е висока лентата (0, когато я няма на екрана). */
function setOpenNotesBarHeightVar(px) {
    document.documentElement.style.setProperty('--open-notes-bar-h', (px > 0 ? px : 0) + 'px');
}

/**
 * Вдига плаващите бутони с инлайн позиция над лентата. Основната стойност се взима от самата
 * инлайн стойност (обвивката от предишно викане се разгъва), значи повторното викане не трупа
 * отместване, а скриването връща точната първоначална стойност.
 */
function applyOpenNotesBarLift() {
    if (!document.body) return;
    const lifted = document.body.classList.contains('open-notes-bar-visible');
    OPEN_NOTES_BAR_FLOATERS.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        // Оста е тази, по която елементът е закачен за долния ръб: при местене бутоните минават на
        // top/right, значи тогава се вдига top (с изваждане), а не bottom.
        const bottomRaw = el.style.getPropertyValue('bottom').trim();
        const topRaw = el.style.getPropertyValue('top').trim();
        const axis = bottomRaw && bottomRaw !== 'auto' ? 'bottom' : (topRaw && topRaw !== 'auto' ? 'top' : null);
        // Без инлайн позиция елементът се вдига от stylesheet правилата (body.open-notes-bar-visible):
        // тук не се пипа, за да не му се смени основната стойност.
        if (!axis) return;
        const priority = el.style.getPropertyPriority(axis) || '';
        const raw = axis === 'bottom' ? bottomRaw : topRaw;
        // Обвивката от предишно викане се разгъва: иначе отместването се трупа.
        const unwrapped = (raw && OPEN_NOTES_BAR_LIFT_RE.test(raw)) ? raw.replace(OPEN_NOTES_BAR_LIFT_RE, '$1') : raw;
        const base = unwrapped || '0px';
        if (!lifted) {
            // Лентата я няма: връща се точно основната стойност - без остатъчно отместване.
            el.style.setProperty(axis, base, priority);
            return;
        }
        const value = axis === 'bottom'
            ? `calc(${base} + var(--open-notes-bar-h) + ${OPEN_NOTES_BAR_LIFT_GAP}px)`
            : `calc(${base} - var(--open-notes-bar-h) - ${OPEN_NOTES_BAR_LIFT_GAP}px)`;
        el.style.setProperty(axis, value, priority);
    });
}

/** Включва/изключва избутването: класът на body и височината в променливата вървят заедно. */
function syncOpenNotesBarLift(visible) {
    if (!document.body) return;
    if (visible) {
        setOpenNotesBarHeightVar(openNotesBarHeight());
        document.body.classList.add('open-notes-bar-visible');
    } else {
        document.body.classList.remove('open-notes-bar-visible');
        setOpenNotesBarHeightVar(0);
    }
    applyOpenNotesBarLift();
}

/**
 * Заглавието на бележката за плочката: първият ред с думи, както го показва и картата на борда.
 * cx строи заглавието през nmInlineTitleLine/nmTitleCleanLine; тези функции в main ги няма, затова
 * тук се ползва същата логика, с която main показва първия непразен ред (вж. календара): текстът
 * преди '|' (така Android маркира скритото), първият непразен ред, без маркерите на вградените
 * снимки (иначе заглавието е звездичка).
 */
function openNotesBarTitleFor(note) {
    if (!note) return '';
    let text = String(note.notetxt || '');
    if (!text) return '';
    const pipeIndex = text.indexOf('|');
    if (pipeIndex !== -1) text = text.slice(0, pipeIndex);
    // Маркерите на вградените снимки (type=8) са знаци от текста - махат се от заглавието.
    try {
        if (note.text_span) text = stripInlineImageMarkers(text, note.text_span);
    } catch (e) { }
    const first = text.replace(/\r\n/g, '\n').split('\n').find(l => l.trim()) || '';
    return openNotesBarCleanTitle(first);
}

/** Заглавие за плочката: без markdown линкове и без адреси, които не се четат в 40px. */
function openNotesBarCleanTitle(line) {
    return String(line || '')
        // {#L#} маркерът, с който се бележи линк в текста на бележката.
        .replace(/\{#L#[^#]*#\}/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();
}

// Показва се САМО първото емоджи от началото: собственикът (25.10.2026) видя няколко емоджита в
// началото цели в плочката и поиска в бутона да стои само първият емотикон.
const OPEN_NOTES_BAR_EMOJI_MAX = 1;
// Емоджи ли е един графемен клъстър: pictographic, регионален индикатор (флаг) или keycap (\u20E3).
const OPEN_NOTES_BAR_EMOJI_RE = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u20E3]/u;
// Резервен път, ако Intl.Segmenter липсва: водещата емоджи последователност се взима с регулярен
// израз - целият ZWJ състав, модификаторът на тона, вариационният селектор, флагът и keycap-ът.
const OPEN_NOTES_BAR_EMOJI_CLUSTER_RE = /^(?:\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3|\p{Extended_Pictographic}\uFE0F?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}\uFE0F?(?:\p{Emoji_Modifier})?)*)/u;

/**
 * Водещата емоджи последователност на низа, или '' ако низът не започва с емоджи.
 * Собственикът (25.10.2026): „Ако първият ред започва с емотикон като този: 📷 ASCII - в бутона да
 * се появява само емотикона". Взима се ЦЯЛ графемен клъстър (Intl.Segmenter), а не един знак, за да
 * не се разкъсат: ZWJ семейство (👨‍👩‍👧), модификатор на тона (👍🏽), вариационен селектор (❤️),
 * флаг от два регионални индикатора (🇧🇬) и keycap (1️⃣). От няколко емоджита в началото се показва
 * само ПЪРВОТО (OPEN_NOTES_BAR_EMOJI_MAX = 1), не целият ред емоджита.
 */
function openNotesBarLeadingEmoji(text) {
    const value = String(text || '').trim();
    if (!value) return '';
    const found = [];
    if (typeof Intl === 'object' && Intl && typeof Intl.Segmenter === 'function') {
        const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        for (const part of segmenter.segment(value)) {
            // Редът на емоджитата свършва при първия клъстър, който не е емоджи - той вече е текст.
            if (!OPEN_NOTES_BAR_EMOJI_RE.test(part.segment)) break;
            found.push(part.segment);
            if (found.length >= OPEN_NOTES_BAR_EMOJI_MAX) break;
        }
    } else {
        let rest = value;
        while (rest && found.length < OPEN_NOTES_BAR_EMOJI_MAX) {
            const match = rest.match(OPEN_NOTES_BAR_EMOJI_CLUSTER_RE);
            if (!match) break;
            found.push(match[0]);
            rest = rest.slice(match[0].length);
        }
    }
    return found.join('');
}

// Колко букви от една дума влизат в реда на плочката (собственикът, 29.10.2026).
const OPEN_NOTES_BAR_LETTERS_PER_WORD = 3;
// Колко реда има надписът: първата и втората дума на заглавието, всяка на свой ред.
const OPEN_NOTES_BAR_LETTERS_LINES = 2;

/**
 * Думите на заглавието без препинателните знаци по края им (собственикът, 29.10.2026: „като се
 * пропускат препинателни знаци, ако ги има - например ", - и др."). Знаците се махат от двата края
 * на всяка дума („мляко," -> „мляко", „(второ)" -> „второ"), а дума, в която не е останала нито буква,
 * нито цифра (само „—" или „..."), не влиза в надписа изобщо.
 */
function openNotesBarTitleWords(title) {
    const parts = String(title || '').replace(/\s+/g, ' ').trim().split(' ');
    const words = [];
    for (const part of parts) {
        const word = part.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
        if (word) words.push(word);
    }
    return words;
}

/**
 * Надписът на буквената плочка: ако заглавието ЗАПОЧВА с емоджи - само емоджито (собственикът,
 * 25.10.2026), иначе по 3 букви от първата и от втората дума, всяка на свой ред (собственикът,
 * 29.10.2026). Емоджито се връща както е (без .toUpperCase()), буквите - главни. При заглавие от
 * една дума (или когато втората е само препинателни знаци) редът е един. Редовете са разделени с
 * \n - CSS-ът на плочката е с white-space: pre-line, значи всеки ред застава на своя ред.
 */
function openNotesBarLetters(title) {
    const emoji = openNotesBarLeadingEmoji(title);
    if (emoji) return emoji;
    const words = openNotesBarTitleWords(title);
    if (!words.length) return '\u00b7';
    const lines = words
        .slice(0, OPEN_NOTES_BAR_LETTERS_LINES)
        .map(word => Array.from(word).slice(0, OPEN_NOTES_BAR_LETTERS_PER_WORD).join(''));
    return lines.join('\n').toUpperCase();
}

/**
 * Цветът на плочката в лентата: ТОЧНО цветът на бележката. Взима се фонът, с който renderNoteWindow
 * е боядисал кутията на прозореца (`.modal-content-box`) - така плочката и бележката не могат да се
 * разминат. Ако прозорецът още не е боядисан или фонът е прозрачен, се пада на цвета от данните на
 * бележката, а накрая - на цвета по подразбиране за нови бележки.
 */
function openNotesBarTileColor(win, note) {
    try {
        const box = win && (win.box || (win.el && win.el.querySelector('.modal-content-box')));
        const bg = box ? String(getComputedStyle(box).backgroundColor || '').trim() : '';
        if (bg && bg !== 'transparent' && !/^rgba\([^)]*,\s*0\s*\)$/i.test(bg)) return bg;
    } catch (e) { }
    const stored = getNoteColorCss(note && note.color, '');
    if (stored) return stored;
    return OPEN_NOTES_BAR_DEFAULT_BG;
}

/** Относителната яркост на CSS цвят (0..1) за избор на четящ се текст; null за неразпознат цвят. */
function openNotesBarRelativeLuminance(css) {
    const value = String(css || '').trim();
    let r, g, b;
    let m = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
        let hex = m[1];
        if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
    } else if ((m = value.match(/^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i))) {
        r = Number(m[1]); g = Number(m[2]); b = Number(m[3]);
    } else {
        return null;
    }
    const lin = (v) => {
        const s = Math.min(255, Math.max(0, v)) / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/**
 * Цветът на буквите върху плочката: тъмен, когато контрастът му към фона е по-добър, иначе бял.
 * Палитрата на бележките е пастелна, но потребителските цветове може да са и тъмни - затова се
 * смята, а не се приема „винаги тъмен текст".
 */
function openNotesBarTextColorFor(bgCss) {
    const bgL = openNotesBarRelativeLuminance(bgCss);
    if (bgL === null) return '#FFFFFF';
    const darkL = openNotesBarRelativeLuminance(OPEN_NOTES_BAR_DARK_TEXT);
    const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    return contrast(bgL, 1) >= contrast(bgL, darkL) ? '#FFFFFF' : OPEN_NOTES_BAR_DARK_TEXT;
}

/**
 * Първата вградена снимка (type=8) на бележката - тя става миниатюрата в плочката. Името се взима
 * по СЪЩИЯ път като в бележката: записите type=8 в text_span/title_span и data-nm-file в текста.
 */
function openNotesBarImageName(note) {
    if (!note) return '';
    const names = new Set();
    const add = (raw) => {
        const name = inlineImageName(raw);
        if (name) names.add(name);
    };
    try {
        for (const field of ['text_span', 'title_span', 'title_text_span']) {
            const raw = note[field];
            if (typeof raw !== 'string' || !raw) continue;
            for (const chunk of raw.split('|')) {
                if (!chunk) continue;
                let format = null;
                try { format = JSON.parse(chunk); } catch (e) { continue; }
                if (format && +format.type === 8) add(format.paramstring);
            }
        }
        const text = String(note.notetxt || '');
        const attr = /data-nm-file="([^"]+)"/g;
        let match;
        while ((match = attr.exec(text)) !== null) add(match[1]);
    } catch (e) { }
    for (const name of names) {
        if (name) return name;
    }
    return '';
}

/**
 * Първата вградена снимка, която бележката вече е нарисувала в ТЯЛОТО си. hydrateInlineImages слага
 * в рамката истински <img> с готов адрес, значи това е точно картинката, която потребителят вижда в
 * бележката, и се взима без нито една заявка. Гледа се ПРЕДИ търсенето по име в Drive: то може да не
 * намери файла (име, сменено при качване) и тогава плочката показваше първите две букви от текста,
 * докато снимката си стоеше в самата бележка (собственикът, 25.10.2026).
 * src може да е празен - рамката още се тегли.
 */
function openNotesBarBodyImage(win) {
    const el = win && win.el;
    if (!el || typeof el.querySelector !== 'function') return { name: '', src: '' };
    const boxes = Array.from(el.querySelectorAll('.nm-inline-img[data-nm-file]'));
    let firstName = '';
    for (const box of boxes) {
        const name = String(box.dataset.nmFile || '');
        if (!firstName) firstName = name;
        const img = box.querySelector('img');
        const src = (img && img.getAttribute('src')) || '';
        // Търси се първата ГОТОВА картинка, не просто първата рамка: рамката на първата снимка може
        // още да се тегли (или да е останала празна), а по-нататъшна вече да е на екрана.
        if (src) return { name, src };
    }
    return { name: firstName, src: '' };
}

/**
 * Слага готов адрес на миниатюра в плочката - една логика и за адрес от кеша, и от Drive, и направо
 * от тялото на бележката. has-thumb се вдига чак когато картинката се зареди, иначе буквите изчезват
 * под празна рамка.
 */
function openNotesBarPutThumb(tile, src, fileName) {
    if (!src || !tile || !tile.isConnected) return;
    const name = String(fileName || '');
    let img = tile.querySelector('.open-notes-bar-thumb');
    if (!img) {
        img = document.createElement('img');
        img.className = 'open-notes-bar-thumb';
        img.alt = '';
        img.decoding = 'async';
        // Родният drag на картинката краде жеста: плъзгането по плочката преподрежда
        // лентата (b1.50), а не тегли миниатюрата.
        img.draggable = false;
        img.addEventListener('load', () => tile.classList.add('has-thumb'));
        img.addEventListener('error', () => {
            // Мъртъв адрес (изтекъл подпис): плочката се връща на буквите, а адресът се забравя,
            // за да не се показва празно при следващото опресняване.
            img.remove();
            tile.classList.remove('has-thumb');
            if (name) openNotesBarThumbSrc.delete(name);
        });
        tile.appendChild(img);
    }
    if (img.getAttribute('src') !== src) img.src = src;
}

/**
 * Взима адреса направо от тялото на бележката, ако там вече има готова картинка. Връща true, когато
 * плочката е получила адрес - така повторният опит не пита мрежата за нещо, което е на екрана.
 */
function openNotesBarAdoptBodyThumb(tile) {
    if (!tile || !tile.isConnected) return false;
    const body = openNotesBarBodyImage(openNotesBarWindowFor(tile));
    if (!body.src) return false;
    openNotesBarPutThumb(tile, body.src, body.name);
    return true;
}

/**
 * Миниатюрата идва по СЪЩИЯ път като снимките в бележката (resolveNoteImageSrc): Drive - thumbnail на
 * файла, локална папка/архив - файлът от диска. Чака се ~1 секунда; ако не дойде, плочката остава с
 * буквите си, но опитва отново (до OPEN_NOTES_BAR_THUMB_TRIES общо), защото търсенето по име в Drive
 * може да е по-бавно от чакането. Всеки повторен опит първо гледа тялото на бележката: там адресът
 * вече може да е готов и не се чака мрежа.
 */
function openNotesBarFetchThumb(tile, fileName, attempt) {
    const name = String(fileName || '');
    if (!name || !tile) return;
    const tries = Number(attempt) || 0;
    const cached = openNotesBarThumbSrc.get(name);
    // Стар адрес не се ползва: подписаният линк на Drive изтича и <img> остава празен.
    if (cached && Date.now() - cached.at < INLINE_IMAGE_THUMB_TTL) { openNotesBarPutThumb(tile, cached.src, name); return; }
    const work = (async () => {
        try {
            const mode = await inlineImageSourceMode();
            const res = await resolveNoteImageSrc(name, mode, null, { size: OPEN_NOTES_BAR_THUMB_SIZE });
            return res && res.status === 'ok' && res.src ? res.src : null;
        } catch (e) { return null; }
    })();
    const waited = new Promise(resolve => setTimeout(() => resolve(null), OPEN_NOTES_BAR_THUMB_WAIT));
    Promise.race([work, waited]).then(src => {
        if (src) {
            openNotesBarThumbSrc.set(name, { at: Date.now(), src });
            openNotesBarPutThumb(tile, src, name);
            return;
        }
        // Чакането изтече без адрес. Плочката се проверява пак: тя може вече да е получила картинка
        // от тялото на бележката или да е изчезнала от лентата (тогава не се оставя таймер за нея).
        if (tries + 1 >= OPEN_NOTES_BAR_THUMB_TRIES) return;
        const delay = OPEN_NOTES_BAR_THUMB_RETRY_MS[tries] || OPEN_NOTES_BAR_THUMB_RETRY_MS[0];
        setTimeout(() => {
            if (!tile.isConnected || tile.querySelector('.open-notes-bar-thumb')) return;
            if (openNotesBarAdoptBodyThumb(tile)) return;
            openNotesBarFetchThumb(tile, name, tries + 1);
        }, delay);
    }).catch(() => { });
}

/**
 * Плъзгане по лентата не бива да „избира" бележка случайно - само истински клик. Затова при
 * показалец, изминал повече от няколко пиксела от натискането, кликът върху плочка се прескача.
 */
function wireOpenNotesBarDragGuard(bar) {
    if (bar._barDragged) return;
    let downX = 0, downY = 0, dragged = false;
    bar.addEventListener('pointerdown', (e) => { downX = e.clientX; downY = e.clientY; dragged = false; }, true);
    bar.addEventListener('pointermove', (e) => {
        if (dragged) return;
        if (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6) dragged = true;
    }, true);
    bar._barDragged = () => dragged;
}

// --- Преподреждане с плъзгане (b1.50) -----------------------------------------------------------
// Собственикът (25.10.2026): „dragging along the bar да премества бутона на бележките в рамките на
// лентата за преподреждане". Плъзгане, започнало ВЪРХУ плочка, мести ТАЗИ плочка: докато показалецът
// върви, плочките в лентата се разместват на живо (DOM ред на децата на .open-notes-bar-strip), за
// да се вижда къде ще падне, а при пускане новият ред се записва. Плъзгане, започнало на фона на
// лентата или върху бутоните ѝ, НЕ се пипа - то продължава да скролва лентата.
// Прагът е 10px: под него жестът си остава клик. Пазачът wireOpenNotesBarDragGuard вдига своя флаг
// още на 6px, значи след плъзгане click-ът на плочката не вдига и не скрива бележка (иначе плъзгане
// би превключило активната бележка, преди да си преместил плочката).
// Слушателите са на САМАТА лента, а показалецът се прихваща за нея: плочката се мести в DOM по време
// на жеста, а местенето на елемент, който държи прихващането, би го загубило.
const OPEN_NOTES_BAR_DRAG_PX = 10;

function wireOpenNotesBarStripDrag(bar) {
    const strip = bar && bar.querySelector('.open-notes-bar-strip');
    if (!strip || strip._dragWired) return;
    strip._dragWired = true;
    const state = { tile: null, pointerId: null, pointerType: null, startX: 0, startY: 0, started: false, restore: null, pointerDead: false };
    strip._barDrag = state;
    const tiles = () => Array.from(strip.querySelectorAll('.open-notes-bar-tile'));

    // Къде отива плъзганата плочка при този X: пред първата плочка, чийто център е зад показалеца.
    const targetNodeAt = (tile, clientX) => {
        const others = tiles().filter(t => t !== tile);
        for (let i = 0; i < others.length; i++) {
            const r = others[i].getBoundingClientRect();
            if (clientX < r.left + r.width / 2) return others[i];
        }
        return null;
    };

    // Плочката се мести на мястото, където показалецът (или пръстът) вече е подминал центъра на
    // съседна плочка. Една и съща логика за двата входа - показалец и touch (b1.55).
    const moveTo = (clientX) => {
        if (!state.tile) return;
        const node = targetNodeAt(state.tile, clientX);
        if (node !== state.tile.nextSibling) strip.insertBefore(state.tile, node);
    };

    // Тръгва ли местенето от това движение? След задържане плочката вече е вдигната: местенето тръгва от
    // първото движение напред, без праг и без значение на посоката (включително вертикална).
    // БЕЗ задържане местенето е САМО за мишка (хоризонтално над 10px). С пръст или писалка хоризонталният
    // жест върху плочка е скрол на лентата - иначе всяко плъзгане разместваше плочките вместо да скролира
    // (собственикът, 25.10.2026: „Плъзгането на лентата при препълване не се получава, местят се
    // плочките"). Затова единственият вход за местене с пръст е задържането
    // (wireOpenNotesBarTileLongPress), а под прага жестът си остава клик.
    const shouldStart = (clientX, clientY) => {
        if (state.started) return true;
        const dx = Math.abs(clientX - state.startX);
        const dy = Math.abs(clientY - state.startY);
        if (!state.tile._longPressArmed) {
            if (state.pointerType !== 'mouse') return false;
            if (dx < OPEN_NOTES_BAR_DRAG_PX || dx < dy) return false;
        }
        return true;
    };

    const begin = () => {
        if (state.started) return;
        state.started = true;
        // Редът отпреди жеста - по него се връща плочката, ако жестът бъде отменен (pointercancel).
        state.restore = Array.from(strip.children).map(el => el.dataset.barKey).filter(Boolean);
        // Задържането вече не затваря нищо (b1.52) - то само е вдигнало плочката. Таймерът се отменя
        // все пак, за да не вдигне плочката посред местенето.
        if (typeof state.tile._cancelLongPress === 'function') state.tile._cancelLongPress();
        state.tile.classList.add('is-dragging');
        // Прихващането е за ЖИВИЯ показалец: след pointercancel той е мъртъв и жестът върви по touch пътя.
        if (!state.pointerDead && state.pointerId !== null) { try { strip.setPointerCapture(state.pointerId); } catch (e) { } }
    };

    const finish = (commit) => {
        const tile = state.tile;
        if (state.started && tile) {
            tile.classList.remove('is-dragging');
            try { strip.releasePointerCapture(state.pointerId); } catch (e) { }
            if (commit) commitOpenNotesBarOrderFromStrip(strip);
            else if (state.restore && state.restore.length) {
                openNotesBarOrder = state.restore.slice();
                saveOpenNotesBarOrder();
                // Отменен жест: лентата се строи наново в реда отпреди него.
                refreshOpenNotesBar();
            }
        } else if (tile) {
            // Жестът беше само задържане, без движение: плочката слиза долу, нищо не се записва и
            // бележката остава отворена (затварянето е само през хиксчето ѝ).
            tile.classList.remove('is-dragging');
        }
        if (tile) tile._longPressArmed = false;
        state.tile = null;
        state.pointerId = null;
        state.pointerType = null;
        state.started = false;
        state.restore = null;
        state.pointerDead = false;
    };

    strip.addEventListener('pointerdown', (e) => {
        if (state.tile) finish(false);
        const tile = e.target && e.target.closest ? e.target.closest('.open-notes-bar-tile') : null;
        if (!tile || !strip.contains(tile)) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        // Кликът от предишното задържане още не е минал (флагът се вдига в
        // wireOpenNotesBarTileLongPress и се нулира при самото натискане): тогава не се започва плъзгане.
        if (tile._longPressTriggered) return;
        // Нов жест: въоръжаването на друга плочка (вдигната от предишно задържане) се нулира, за да не
        // остане вдигната, без никой да я мести.
        tiles().forEach(t => {
            if (t !== tile && t._longPressArmed) {
                t._longPressArmed = false;
                t.classList.remove('is-dragging');
            }
        });
        state.tile = tile;
        state.pointerId = e.pointerId;
        // Видът вход решава дали едно хоризонтално плъзгане мести плочката (мишка) или скролва лентата
        // (пръст/писалка) - виж shouldStart.
        state.pointerType = e.pointerType || '';
        state.startX = e.clientX;
        state.startY = e.clientY;
        state.started = false;
        state.pointerDead = false;
    });

    strip.addEventListener('pointermove', (e) => {
        if (!state.tile || e.pointerId !== state.pointerId) return;
        // След pointercancel показалецът е мъртъв: местенето върви по touch пътя, иначе едно движение
        // на пръста би се броило два пъти (веднъж тук, веднъж там).
        if (state.pointerDead) return;
        if (!shouldStart(e.clientX, e.clientY)) return;
        begin();
        if (e.cancelable) e.preventDefault();
        moveTo(e.clientX);
    });

    const end = (e) => {
        if (!state.tile || state.pointerDead || e.pointerId !== state.pointerId) return;
        finish(e.type === 'pointerup');
    };
    strip.addEventListener('pointerup', end);
    // pointercancel при Android идва, щом родният жест за дълго натискане поеме пръста - веднага след
    // вибрацията (собственикът, 25.10.2026). Тогава жестът НЕ се хвърля: показалецът се обявява за
    // мъртъв и местенето продължава по touch пътя долу (touch събитията остават живи). Иначе тук
    // свършваше всичко - плочката слизаше долу и редът се връщаше, тоест „само кратко вибрация".
    strip.addEventListener('pointercancel', (e) => {
        if (!state.tile || e.pointerId !== state.pointerId) return;
        if (state.tile._longPressArmed || state.started) {
            state.pointerDead = true;
            return;
        }
        finish(false);
    });
    strip.addEventListener('lostpointercapture', (e) => {
        // Събитието ИЗПЛУВА от плочката, когато прихващането на пръста мине към лентата: при touch
        // браузърът дава неявно прихващане на елемента, който е получил pointerdown (плочката), и
        // setPointerCapture на лентата го отнема. Без тази проверка местенето свършваше още с ПЪРВОТО
        // движение на пръста - точно оплакването „продължителното натискане води до кратка вибрация, но
        // само толкова" (собственикът, 25.10.2026). При мишка неявно прихващане няма, затова там
        // плъзгането работеше.
        if (e.target !== strip) return;
        // Жестът вече е по touch пътя - прихващането няма думата.
        if (state.pointerDead) return;
        if (state.tile && e.pointerId === state.pointerId) finish(false);
    });

    // --- Втори вход за местенето: touch (b1.55) ---------------------------------------------------
    // Пръстът остава жив и след pointercancel (touch събитията не се отменят от родния жест), затова
    // местенето има и път по touchmove. Работи САМО когато показалецът е мъртъв (state.pointerDead),
    // за да не мести плочката два пъти за едно движение.
    const touchOf = (e) => (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || null;
    strip.addEventListener('touchmove', (e) => {
        const touch = touchOf(e);
        if (!touch) return;
        if (!state.pointerDead) {
            // Живият показалец върши работата. Тук само се пази жестът от скрол, докато плочката е
            // вдигната - иначе браузърът поема движението, праща pointercancel и местенето умира.
            if (state.tile && (state.tile._longPressArmed || state.started) && e.cancelable) e.preventDefault();
            return;
        }
        if (!state.tile) return;
        if (!shouldStart(touch.clientX, touch.clientY)) return;
        begin();
        if (e.cancelable) e.preventDefault();
        moveTo(touch.clientX);
    }, { passive: false });
    const touchEnd = (e) => {
        if (!state.pointerDead || !state.tile) return;
        // Пръстът се вдигна - жестът се довършва както при pointerup. Отменен жест (touchcancel)
        // връща стария ред, също както pointercancel без въоръжаване.
        finish(e.type === 'touchend');
    };
    strip.addEventListener('touchend', touchEnd);
    strip.addEventListener('touchcancel', touchEnd);
}

/**
 * Скрол на лентата с една стъпка. Стъпката е 80% от видимата част, но не по-малко от 80px: остава
 * застъпване, по което окото хваща посоката, и се вижда, че лентата е мръднала и когато е много тясна.
 */
function openNotesBarScrollBy(strip, dir) {
    if (!strip) return;
    const step = Math.max(80, Math.round(strip.clientWidth * 0.8));
    strip.scrollBy({ left: dir * step, behavior: 'smooth' });
}

/**
 * Стрелките се показват само когато плочките не се побират (иначе няма какво да се скролира), а онази,
 * накъдето няма накъде, е НЕАКТИВНА, не скрита: мястото ѝ не мърда, значи плочките не подскачат,
 * когато стигнеш до края. След плавния скрол състоянието се обновява от събитието scroll.
 */
function updateOpenNotesBarScrollButtons(bar) {
    if (!bar) return;
    const strip = bar.querySelector('.open-notes-bar-strip');
    const prev = bar.querySelector('.open-notes-bar-scroll-prev');
    const next = bar.querySelector('.open-notes-bar-scroll-next');
    if (!strip || !prev || !next) return;
    const overflow = strip.scrollWidth - strip.clientWidth;
    if (overflow <= 1) {
        prev.hidden = true;
        next.hidden = true;
        return;
    }
    prev.hidden = false;
    next.hidden = false;
    prev.disabled = strip.scrollLeft <= 1;
    next.disabled = strip.scrollLeft >= overflow - 1;
}

/**
 * Следенето на състоянието на стрелките: скролът на самата лента (включително плавния, който бутоните
 * пускат), смяната на размера на прозореца и смяната на ширината на лентата, когато плочки се добавят
 * или махат (ResizeObserver, ако го има). Обновяването от ResizeObserver е в следващия кадър: то самото
 * сменя ширината на лентата (скритата стрелка освобождава място), а пряката промяна в обратната връзка
 * на наблюдателя дава „ResizeObserver loop" в конзолата.
 */
function wireOpenNotesBarScrollButtons(bar) {
    const strip = bar && bar.querySelector('.open-notes-bar-strip');
    if (!strip || strip._scrollArrowsWired) return;
    strip._scrollArrowsWired = true;
    strip.addEventListener('scroll', () => updateOpenNotesBarScrollButtons(bar), { passive: true });
    window.addEventListener('resize', () => {
        if (bar.classList.contains('is-visible')) updateOpenNotesBarScrollButtons(bar);
    });
    if (typeof ResizeObserver === 'function') {
        let scheduled = false;
        bar._scrollArrowsObserver = new ResizeObserver(() => {
            if (scheduled) return;
            scheduled = true;
            requestAnimationFrame(() => {
                scheduled = false;
                updateOpenNotesBarScrollButtons(bar);
            });
        });
        bar._scrollArrowsObserver.observe(strip);
    }
}

/** Лентата се строи при първата нужда и остава в слоя; скрита е с клас, не се маха. */
function ensureOpenNotesBar() {
    const layer = document.getElementById('note-windows-layer');
    if (!layer) return null;
    let bar = document.getElementById('open-notes-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'open-notes-bar';
        bar.setAttribute('role', 'toolbar');
        // z-index над всеки прозорец: прозорците се вдигат до NOTE_WINDOW_Z_BASE + 5000.
        bar.style.zIndex = String(OPEN_NOTES_BAR_Z);
        const strip = document.createElement('div');
        strip.className = 'open-notes-bar-strip';
        // Тесен бутон със стрелка в ДВАТА края на лентата. Стоят ИЗВЪН приплъзващия се ред, значи не се
        // скролват заедно с плочките, и се показват само когато плочките не се побират на екрана.
        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'open-notes-bar-scroll open-notes-bar-scroll-prev';
        prevBtn.innerHTML = openNotesBarPrevIconSvg;
        // Скрити, докато лентата не се измери (refreshOpenNotesBar ги показва, ако има препълване).
        prevBtn.hidden = true;
        prevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openNotesBarScrollBy(strip, -1);
        });
        bar.appendChild(prevBtn);
        bar.appendChild(strip);
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'open-notes-bar-scroll open-notes-bar-scroll-next';
        nextBtn.innerHTML = openNotesBarNextIconSvg;
        nextBtn.hidden = true;
        nextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openNotesBarScrollBy(strip, 1);
        });
        bar.appendChild(nextBtn);
        // „Скрий всички бележки" / „Покажи всички бележки": един бутон, който сменя ролята си, когато
        // всички са скрити (иначе няма как да ги върнеш). Стои ВДЯСНО, до бутона за затваряне.
        const hideBtn = document.createElement('button');
        hideBtn.type = 'button';
        hideBtn.className = 'open-notes-bar-hide';
        hideBtn.dataset.mode = 'hide';
        hideBtn.innerHTML = hideAllNotesIconSvg;
        hideBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (hideBtn.dataset.mode === 'show') showAllNoteWindows();
            else hideAllNoteWindows();
        });
        bar.appendChild(hideBtn);
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'open-notes-bar-close';
        closeBtn.innerHTML = closeAllNotesIconSvg;
        // Същата функция като бутона в менюто: въпросът за незаписани промени остава ЕДИН.
        closeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            closeAllNoteWindows();
        });
        bar.appendChild(closeBtn);
        // Родното меню на плочките е забранено (собственикът, 25.10.2026: „забрани стандартното меню на
        // плочките"). То изскачаше при дълго натискане - особено върху плочка със снимка, където Android
        // предлага копиране/споделяне на картинката - и поемаше жеста, с който се мести плочката.
        // Пазачите са на САМАТА лента, за да хващат и плочките, и всичко, което се появи в тях по-късно.
        // Извън лентата нищо не се пипа: маркирането и менюто на текста в бележките си остават.
        bar.addEventListener('contextmenu', (e) => e.preventDefault());
        // Маркиране на буквите и теглене на миниатюрата: и двете са начало на роден жест, който би
        // откраднал показалеца от местенето.
        bar.addEventListener('selectstart', (e) => e.preventDefault());
        bar.addEventListener('dragstart', (e) => e.preventDefault());
        wireOpenNotesBarDragGuard(bar);
        // Преподреждането с плъзгане се закача тук, веднъж - лентата се строи един път (b1.50).
        wireOpenNotesBarStripDrag(bar);
        // Състоянието на стрелките се следи веднъж - лентата се строи един път.
        wireOpenNotesBarScrollButtons(bar);
    }
    // Лентата е ПОСЛЕДНОТО дете на слоя: над всички прозорци и извън подредбата им.
    if (bar.parentNode !== layer || layer.lastElementChild !== bar) layer.appendChild(bar);
    return bar;
}

/** Една плочка: миниатюра на бележката или буквен квадрат в точния ѝ цвят, с жълт контур за активната. */
function openNotesBarFillTile(tile, win) {
    const note = findNoteForWindow(win);
    const title = openNotesBarTitleFor(note);
    // Снимката се търси първо в ТЯЛОТО на бележката: там тя вече е нарисувана и адресът е точно
    // този, който потребителят вижда. Записът в text_span е само резерва - името в него може да не
    // се намери в Drive и тогава плочката оставаше с букви (собственикът, 25.10.2026).
    const fromBody = openNotesBarBodyImage(win);
    const file = fromBody.name || openNotesBarImageName(note);
    // Фонът е цветът на самата бележка, а буквите върху него се четат - тъмни или бели.
    const color = openNotesBarTileColor(win, note);
    const textColor = openNotesBarTextColorFor(color);
    const isActive = win === activeNoteWindow;
    tile.classList.toggle('is-active', isActive);
    // Скритата бележка е приглушена, за да се различава от показана - клик на плочката я връща.
    tile.classList.toggle('is-hidden', !!win.hidden);
    if (isActive) tile.setAttribute('aria-current', 'true');
    else tile.removeAttribute('aria-current');
    tile.setAttribute('aria-label', title || (_('openNotesBar') || 'Open notes'));
    if (title) tile.title = title; else tile.removeAttribute('title');
    // Съдържанието се строи само когато се е сменило (бележката е друга, сменило се е заглавието
    // или снимката) - иначе картинката се зарежда отначало при всяко вдигане на прозорец. Адресът,
    // дошъл от тялото на бележката, влиза в подписа: той се появява СЛЕД построяването на плочката
    // (hydrateInlineImages) и без него опресняването не виждаше, че има какво да се покаже.
    const sig = `${title}\u0000${file}\u0000${fromBody.src}\u0000${color}\u0000${textColor}`;
    if (tile.dataset.barSig === sig) {
        // Подписът съвпада, значи друго не се е сменило - но плочка БЕЗ картинка се довършва, ако
        // тялото вече има готов адрес. Иначе една бавна или неуспешна заявка заключваше буквите до
        // края на сесията.
        if (fromBody.src && !tile.querySelector('.open-notes-bar-thumb')) openNotesBarPutThumb(tile, fromBody.src, file);
        return;
    }
    tile.dataset.barSig = sig;
    let letters = tile.querySelector('.open-notes-bar-letters');
    if (!letters) {
        letters = document.createElement('span');
        letters.className = 'open-notes-bar-letters';
        tile.appendChild(letters);
    }
    letters.textContent = openNotesBarLetters(title);
    // Фонът е на САМАТА плочка - точният цвят на бележката; буквите са само текст върху него.
    tile.style.backgroundColor = color;
    letters.style.backgroundColor = '';
    letters.style.color = textColor;
    const oldThumb = tile.querySelector('.open-notes-bar-thumb');
    if (oldThumb) oldThumb.remove();
    tile.classList.remove('has-thumb');
    // Готовият адрес от тялото се слага веднага, без мрежа; иначе се търси файла по име.
    if (fromBody.src) openNotesBarPutThumb(tile, fromBody.src, file);
    else if (file) openNotesBarFetchThumb(tile, file);
}

/**
 * Задържане на плочка (500ms) само ВДИГА плочката, за да я местиш (собственикът, 25.10.2026:
 * „Продължително натискане само за местене, не затваря"). Затварянето остава само през хиксчето в
 * прозореца на бележката. Досега задържането викаше .modal-close, а местенето искаше бързо
 * хоризонтално плъзгане ≥10px - двете се биеха, тоест щом задържиш, за да хванеш плочката, бележката
 * се затваряше.
 * Затова задействането ВЪОРЪЖАВА плочката (_longPressArmed) и слага класа is-dragging (съществуващото
 * видимо повдигане), а wireOpenNotesBarStripDrag започва местенето от първото движение напред, без праг
 * и без значение на посоката. Обикновеният клик не се пипа: той си остава превключвател скрий/покажи
 * (виж слушателя за click в refreshOpenNotesBar), а кликът след задържане се прескача.
 * Слушателите се закачат ВЕДНЪЖ, при създаването на плочката: тя се преизползва между
 * опресняванията на лентата (картата existing по tile.dataset.barKey), значи иначе щяха да се трупат.
 */
function wireOpenNotesBarTileLongPress(tile) {
    let pressTimer = null;
    // Състоянието живее на самата плочка (като bar._barDragged), за да го четат кликът и местенето.
    tile._longPressTriggered = false;
    tile._longPressArmed = false;
    let touchStartX = 0, touchStartY = 0;
    let lastTouchEnd = 0;
    const cancelPress = () => {
        if (pressTimer) {
            clearTimeout(pressTimer);
            pressTimer = null;
        }
    };
    // Вдигната плочка, която в момента се мести: повдигането не се маха оттук, а от края на местенето
    // (иначе плочката слиза долу посред жеста, щом показалецът я подмине).
    const beingDragged = () => {
        const strip = tile.closest('.open-notes-bar-strip');
        const drag = strip && strip._barDrag;
        return !!(drag && drag.started && drag.tile === tile);
    };
    // Краят на жеста връща плочката долу: въоръжаването не бива да остане за следващия жест.
    const disarm = () => {
        cancelPress();
        if (beingDragged()) return;
        tile._longPressArmed = false;
        tile.classList.remove('is-dragging');
    };
    const firePress = () => {
        pressTimer = null;
        // Задържането само ВДИГА плочката: никакво затваряне (собственикът, 25.10.2026).
        tile._longPressArmed = true;
        tile._longPressTriggered = true;
        tile.classList.add('is-dragging');
        if (navigator.vibrate) navigator.vibrate(40);
    };
    const startPress = () => {
        tile._longPressTriggered = false;
        cancelPress();
        pressTimer = setTimeout(firePress, OPEN_NOTES_BAR_LONG_PRESS_MS);
    };
    // Плъзгането по плочката (b2.83) отменя задържането, ако още не е изтекло: иначе жестът, който
    // мести плочката, след 500ms би я вдигнал посред местенето.
    tile._cancelLongPress = cancelPress;
    // Нов жест: кликът от предишното задържане вече е минал (той идва веднага след пускането), значи
    // флагът му не бива да важи за този жест - иначе wireOpenNotesBarStripDrag би отказал да мести.
    tile.addEventListener('pointerdown', () => { tile._longPressTriggered = false; });
    tile.addEventListener('touchstart', (e) => {
        const touch = e.touches && e.touches[0];
        if (touch) {
            touchStartX = touch.clientX;
            touchStartY = touch.clientY;
        }
        startPress();
    }, { passive: true });
    tile.addEventListener('touchmove', (e) => {
        const touch = e.touches && e.touches[0];
        if (!touch) return cancelPress();
        // ВДИГНАТА плочка: движението вече е местене, а не скрол. Затова жестът се спира тук
        // (passive: false), иначе браузърът го поема като скрол на страницата или на лентата и праща
        // pointercancel - а с него местенето умираше точно когато е готово да тръгне (b2.88).
        // ПРЕДИ въоръжаването нищо не се спира: там жестът си е скрол, както досега.
        if (tile._longPressArmed || beingDragged()) {
            if (e.cancelable) e.preventDefault();
            return;
        }
        if (Math.abs(touch.clientX - touchStartX) > OPEN_NOTES_BAR_LONG_PRESS_MOVE_PX
            || Math.abs(touch.clientY - touchStartY) > OPEN_NOTES_BAR_LONG_PRESS_MOVE_PX) {
            cancelPress();
        }
    }, { passive: false });
    tile.addEventListener('touchcancel', disarm);
    tile.addEventListener('touchend', (e) => {
        lastTouchEnd = Date.now();
        if (tile._longPressTriggered) {
            // Синтетичният click след touchend не бива да вдига/скрива бележката - жестът беше задържане.
            if (e.cancelable) e.preventDefault();
            tile._longPressTriggered = false;
        }
        disarm();
    });
    // Задържане с мишка; събитията на мишката веднага след докосване се прескачат.
    tile.addEventListener('mousedown', (e) => {
        if (e.button !== 0 || Date.now() - lastTouchEnd < 1000) return;
        startPress();
    });
    ['mouseup', 'mouseleave'].forEach((type) => tile.addEventListener(type, disarm));
    // Показалецът се пуска или излиза от плочката: плочката слиза долу. При пръст това идва и когато
    // пръстът излезе от плочката, значи въоръжаването не остава за следващия жест.
    ['pointerup', 'pointerleave'].forEach((type) => tile.addEventListener(type, disarm));
    // pointercancel НЕ сваля ВДИГНАТА плочка (b2.88). Android праща pointercancel веднага след
    // вибрацията, защото родният жест за дълго натискане поема пръста (собственикът, 25.10.2026:
    // „продължителното натискане води до кратка вибрация, но само толкова"). Жестът не се хвърля -
    // wireOpenNotesBarStripDrag го поема по touch пътя и сваля плочката накрая. Иначе едно
    // pointercancel убиваше местенето точно преди да е тръгнало.
    tile.addEventListener('pointercancel', () => {
        if (tile._longPressArmed || beingDragged()) return;
        disarm();
    });
}

/**
 * Опреснява лентата: кога се вижда, кои плочки са в нея и коя е активна. Вика се от
 * updateSingleNoteOverlay (всяко вдигане, затваряне и „затвори всички") и в края на всеки
 * изчертан прозорец, за да не остане разсинхронизирано състояние.
 */
function refreshOpenNotesBar() {
    const layer = document.getElementById('note-windows-layer');
    if (!layer) return;
    const open = getOpenNoteWindows();
    const hiddenCount = open.filter(w => w.hidden).length;
    // Видимите отворени бележки: скритите не се броят за „има какво да се покаже на лентата", но
    // тяхната лента е точно пътят, по който се връщат - затова те я държат на екрана отделно.
    const visibleOpen = open.length - hiddenCount;
    // Две и повече видими отворени бележки ИЛИ има скрити: лентата остава, докато има какво да
    // покаже или да върне. В режим „единична бележка" лентата НЕ се показва (собственикът,
    // 25.10.2026: „при включена настройка Single note лентата е излишно да се показва") - режимът
    // държи една бележка, значи лентата няма какво да показва. Затова включването на режима затваря
    // скритите бележки (виж applySingleNoteModeSetting), вместо да ги остави недостъпни.
    const show = !isSingleNoteMode() && (visibleOpen >= OPEN_NOTES_BAR_MIN || hiddenCount > 0);
    let bar = document.getElementById('open-notes-bar');
    if (!show) {
        if (bar) bar.classList.remove('is-visible');
        // Лентата изчезна: променливата се връща на 0px и плаващите бутони слизат на мястото си.
        syncOpenNotesBarLift(false);
        return;
    }
    bar = ensureOpenNotesBar();
    if (!bar) return;
    // Текстовете се слагат при всяко опресняване: смяна на езика ги обновява без презареждане.
    const closeLabel = _('closeAllNotes') || 'Close all notes';
    const closeBtn = bar.querySelector('.open-notes-bar-close');
    if (closeBtn) {
        closeBtn.title = closeLabel;
        closeBtn.setAttribute('aria-label', closeLabel);
    }
    // Достъпните имена на стрелките се слагат при всяко опресняване, за да следват езика (както при
    // бутона за затваряне). Ключовете са съществуващите - същите, с които се именуват предишна и
    // следваща бележка в менюто, значи имат превод на всички езици.
    const prevArrow = bar.querySelector('.open-notes-bar-scroll-prev');
    if (prevArrow) {
        const prevLabel = _('prevNoteTooltip') || 'Previous note';
        prevArrow.title = prevLabel;
        prevArrow.setAttribute('aria-label', prevLabel);
    }
    const nextArrow = bar.querySelector('.open-notes-bar-scroll-next');
    if (nextArrow) {
        const nextLabel = _('nextNoteTooltip') || 'Next note';
        nextArrow.title = nextLabel;
        nextArrow.setAttribute('aria-label', nextLabel);
    }
    // Бутонът за скриване сменя ролята си, когато всички отворени бележки са скрити.
    const hideBtn = bar.querySelector('.open-notes-bar-hide');
    if (hideBtn) {
        const allHidden = open.length > 0 && hiddenCount === open.length;
        const hideLabel = allHidden
            ? (_('showAllNotes') || 'Show all notes')
            : (_('hideAllNotes') || 'Hide all notes');
        hideBtn.dataset.mode = allHidden ? 'show' : 'hide';
        hideBtn.innerHTML = allHidden ? showAllNotesIconSvg : hideAllNotesIconSvg;
        hideBtn.title = hideLabel;
        hideBtn.setAttribute('aria-label', hideLabel);
    }
    bar.setAttribute('aria-label', _('openNotesBar') || 'Open notes');
    const strip = bar.querySelector('.open-notes-bar-strip');
    // Ако в момента се плъзга плочка, редът се взема от лентата, а не от запомнения: иначе опресняване
    // по средата на жеста би върнало стария ред под пръста на потребителя.
    if (strip && strip._barDrag && strip._barDrag.started) commitOpenNotesBarOrderFromStrip(strip);
    // Плочките се подреждат по ЗАПОМНЕНИЯ ред (orderOpenNoteWindows), а вече наличните се ползват
    // наново - така картинката не се зарежда наново и скролът на лентата не скача.
    const existing = new Map();
    Array.from(strip.children).forEach(el => existing.set(el.dataset.barKey, el));
    const keep = new Set();
    orderOpenNoteWindows(open).forEach((win, i) => {
        const key = openNotesBarKeyFor(win);
        let tile = existing.get(key);
        if (!tile) {
            tile = document.createElement('button');
            tile.type = 'button';
            tile.className = 'open-notes-bar-tile';
            tile.dataset.barKey = key;
            tile.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // След задържане плочката беше вдигната - това не е клик, значи не превключва
                // скрий/покажи (флагът се вдига при задействането, а се нулира при следващо натискане).
                if (tile._longPressTriggered) { tile._longPressTriggered = false; return; }
                // Плъзгане по лентата не избира бележка: само истински клик.
                if (bar._barDragged && bar._barDragged()) return;
                const target = openNotesBarWindowFor(tile);
                if (!target) return;
                // Плочката на активната и видима бележка е превключвател (b2.77): първи клик я скрива,
                // а вторият (плочката на вече скритата бележка) я връща на екрана през
                // activateNoteWindow долу - тоест същата плочка показва и скрива.
                if (target === activeNoteWindow && !target.hidden) {
                    hideNoteWindow(target);
                    // „Активна, но невидима" бележка би поела клавиатурния вход и писането, затова
                    // активността минава към друга ВИДИМА бележка - без да я вдига отпред.
                    // getTopNoteWindow пада към всички, когато няма видими: тогава не се пипа нищо
                    // (същото като „скрий всички", което също не мести активността).
                    const next = getTopNoteWindow();
                    if (next && next !== target && !next.hidden) activateNoteWindow(next, false);
                    // Лентата се опреснява винаги: плочката получава is-hidden, а бутонът
                    // „скрий/покажи всички" - вярната роля. updateSingleNoteOverlay вика
                    // refreshOpenNotesBar в началото си (а activateNoteWindow - само при смяна на
                    // активната), затова тук минава само пътят без смяна.
                    else updateSingleNoteOverlay();
                    return;
                }
                // Точно както клик върху прозореца на бележката: идва най-отпред и става активна.
                // Скрита бележка се показва тук (activateNoteWindow вика showNoteWindow) - това е
                // вторият клик на плочката.
                activateNoteWindow(target, true);
                tile.scrollIntoView({ inline: 'nearest', block: 'nearest' });
            });
            // Задържане на същата плочка само я вдига за местене. Закача се тук, при създаването:
            // плочката се преизползва между опресняванията, значи слушателите остават само тези.
            wireOpenNotesBarTileLongPress(tile);
        }
        keep.add(key);
        // Плочката влиза в реда ПРЕДИ да се строи: кешираната миниатюра се слага веднага, а
        // openNotesBarFetchThumb не пипа елемент извън документа (tile.isConnected) - иначе
        // новосъздадената плочка изпуска готовия адрес, подписът ѝ вече е записан и тя остава с
        // буквите, докато кешираният адрес не изтече.
        if (strip.children[i] !== tile) strip.insertBefore(tile, strip.children[i] || null);
        openNotesBarFillTile(tile, win);
    });
    Array.from(strip.children).forEach(el => { if (!keep.has(el.dataset.barKey)) el.remove(); });
    bar.classList.add('is-visible');
    // Лентата е на екрана: измерва се и плаващите бутони се качват над нея. Меренето е след като
    // класът е сложен, за да има лентата реална височина (иначе getBoundingClientRect дава 0).
    syncOpenNotesBarLift(true);
    // Стрелките се показват/скриват според това дали плочките се побират. Меренето е в следващия кадър:
    // току-що построените плочки още не са в layout-а, значи scrollWidth е от предишното съдържание.
    requestAnimationFrame(() => updateOpenNotesBarScrollButtons(bar));
}
// Ръчно опресняване (напр. от външен код след смяна на езика или на режима).
window.refreshOpenNotesBar = refreshOpenNotesBar;
// Смяна на размера на прозореца (обръщане на телефона): височината на лентата се мери наново, а
// избутването се прилага пак - смяната на размера може да е върнала бутоните на основното им място.
window.addEventListener('resize', () => {
    if (!document.body || !document.body.classList.contains('open-notes-bar-visible')) return;
    const h = openNotesBarHeight();
    if (h) setOpenNotesBarHeightVar(h);
    applyOpenNotesBarLift();
});

// --- Помнене на място и размер (ново: го няма в cx-notes) ----------------------------------------
// Един речник в localStorage: { v: 2, seq: <брояч>, boxes: { ключ: {x, y, w, h, o[, e: true]} } }.
// o е номерът на записа (по-голямо значи по-скоро пипан) и по него се вижда кой е най-старият, когато
// се стигне таванът от 300. Стои в самата кутия, вместо в отделен масив с ключове: ключът и без това е
// име на кутията и втори списък само го повтаряше.
// seq е последният раздаден номер: всеки нов запис взима seq + 1 и го пази като o. Така не се
// преномерират чуждите записи, а броячът расте точно с 1 на истинска промяна (вж. writeNoteGeometryEntry).
// Чете се само този формат: речник с друг v значи „няма записи", тоест бележките сядат на
// подразбиращото се място, вместо да се гадае какво е имал предвид някой стар запис.
// Ключът е бележката (gdid, иначе id), не прозорецът: същата бележка си идва на същото място.
function noteWindowKeyFor(id, gdid) {
    const sid = (id === undefined || id === null) ? '' : String(id);
    const sgdid = (gdid === undefined || gdid === null) ? '' : String(gdid);
    if (sgdid) return 'g:' + sgdid;
    if (sid) return 'i:' + sid;
    return '';
}

function readNoteWindowGeometry() {
    const empty = { v: 2, seq: 0, boxes: {} };
    try {
        const raw = JSON.parse(localStorage.getItem(NOTE_WINDOW_GEOM_KEY) || 'null');
        if (!raw || typeof raw !== 'object') return empty;
        // Чете се само текущата версия. Друг v е стар или чужд запис и не му се вярва: кутиите там
        // нямат номер на реда, а без него не може да се изхвърли най-старият при тавана и редът на
        // записите е догадка. Затова по-добре подразбиращото се място, отколкото половин познание.
        if (raw.v !== 2) return empty;
        if (!raw.boxes || typeof raw.boxes !== 'object') return empty;
        const boxes = {};
        Object.keys(raw.boxes).forEach(k => {
            const b = raw.boxes[k];
            if (!b || typeof b !== 'object') return;
            const num = (x) => (typeof x === 'number' && isFinite(x)) ? Math.round(x) : null;
            const x = num(b.x), y = num(b.y), w = num(b.w), h = num(b.h);
            if (x === null || y === null || w === null || h === null) return;
            // Петото поле e значи „тази бележка се отваря разпъната"; тогава x/y/w/h са кутията, към
            // която се връща при свиване, а не разпънатият (цял екран) размер.
            const box = (b.e === true) ? { x, y, w, h, e: true } : { x, y, w, h };
            // Номерът на реда идва от самата кутия: по него се вижда кой запис е най-стар, когато се
            // стигне таванът.
            const o = num(b.o);
            if (o !== null) box.o = o;
            boxes[k] = box;
        });
        // Колкото по-голям е номерът, толкова по-скоро е пипан записът. seq е ПОСЛЕДНИЯТ раздаден номер
        // (същият смисъл, в който го пази writeNoteGeometryEntry), значи следващият запис взима seq + 1.
        // Затова тук seq е най-малко най-големият номер в речника: иначе нов запис може да вземе номер,
        // който вече е зает. Без това „+1" на две места (при четене и при запис) броячът скачаше с две
        // на всяко истинско пипане (b1.46).
        let highest = 0;
        Object.keys(boxes).forEach(k => { if (boxes[k].o !== undefined && boxes[k].o > highest) highest = boxes[k].o; });
        // Защита срещу счупен запис: кутия без номер на реда получава номера след най-големия, за да
        // не изпревари запис, който току-що е местен (за нея не се знае кога е пипана).
        let next = highest + 1;
        Object.keys(boxes).forEach(k => {
            if (boxes[k].o === undefined) { boxes[k].o = next++; highest = boxes[k].o; }
        });
        // Броячът се пази и когато е по-голям от номерата: иначе изхвърлените записи връщат стари
        // номера обратно в играта.
        return { v: 2, seq: Math.max(highest, num_or_zero(raw.seq)), boxes };
    } catch (e) {
        return empty;
    }
}

// Число от речника, иначе 0: счупена стойност не бива да чупи целия запис.
function num_or_zero(x) {
    return (typeof x === 'number' && isFinite(x)) ? Math.round(x) : 0;
}

function writeNoteWindowGeometry(store) {
    try {
        localStorage.setItem(NOTE_WINDOW_GEOM_KEY, JSON.stringify(store));
    } catch (e) {
        // Мястото не е толкова важно, колкото бележката: при пълна памет просто не се помни.
        console.warn('noteWindowGeometry: save failed', e);
    }
}

// Един запис за една бележка, с поддръжка на реда (най-старият се изхвърля на 300-ия). Кутията е
// {x, y, w, h} или {x, y, w, h, e: true} за разпъната (вж. readNoteWindowGeometry).
// Пише се само по флаг (b1.46): win.geomDirty се вдига, когато собственикът наистина е пипал бележката -
// в края на местене или преоразмеряване, и при смяна на режима с натискане на стрелката. Отваряне,
// показване, поставяне от приложението, разпъване по запис и затваряне флага не вдигат, значи не пишат
// нищо и не вдигат seq - дори когато измерената кутия се разминава с миналата с пиксел. Затова тук не се
// сравняват нито размери, нито координати: единственият въпрос е „пипал ли я е някой".
function writeNoteGeometryEntry(win, box) {
    if (!win || !win.key || !box) return;
    if (!win.geomDirty) return;
    const store = readNoteWindowGeometry();
    // Новият номер е броячът + 1: така тази бележка става последна (най-скоро пипана), без да се
    // пипат номерата на останалите записи.
    store.seq = (store.seq || 0) + 1;
    store.boxes[win.key] = { ...box, o: store.seq };
    while (Object.keys(store.boxes).length > NOTE_WINDOW_GEOM_MAX) {
        // Най-старият е с най-малкия номер.
        let oldest = null, oldestO = Infinity;
        Object.keys(store.boxes).forEach(k => {
            const o = store.boxes[k].o;
            if (o < oldestO) { oldestO = o; oldest = k; }
        });
        if (oldest === null) break;
        delete store.boxes[oldest];
    }
    writeNoteWindowGeometry(store);
    // Пипането е записано: следващото затваряне без местене няма да пише нищо.
    win.geomDirty = false;
}

// Размерът се мери по computed style, не по offsetWidth: кутията има padding, а записаното се
// слага обратно в style.width/height (същият смисъл), иначе прозорецът расте с по 20x60 всеки път,
// щом се отвори наново.
function measureNoteWindowBox(win) {
    const box = win.box;
    const cs = getComputedStyle(box);
    return {
        x: Math.round(box.offsetLeft),
        y: Math.round(box.offsetTop),
        w: Math.round(parseFloat(cs.width)),
        h: Math.round(parseFloat(cs.height))
    };
}

// Затваряне, пре-рисуване и показване минават оттук, но пишат само ако бележката е била пипана: флагът
// win.geomDirty вдигат местенето и преоразмеряването в края на жеста (вж. wireNoteWindowMove и
// wireNoteWindowResize), а пазачът е в writeNoteGeometryEntry.
function rememberNoteWindowGeometry(win) {
    if (!win || !win.key || !win.box || !win.box.offsetWidth) return;
    // Разпъната бележка не се мести и не се преоразмерява, значи тук няма какво да се запише.
    if (win.expanded) return;
    writeNoteGeometryEntry(win, measureNoteWindowBox(win));
}

// „Ресет на позиции/размери" от Настройки: трие всичко запомнено за бележките. Отворените прозорци
// не се местят - само им се маха флагът „пипана", за да не си създадат запис при затваряне.
// Дефолтният размер (modalWidth/modalHeight) остава: той е настройка за новите бележки, не запис.
function resetNoteWindowGeometry() {
    // „Ресет" трие целия запис, а режимът на разпъване живее в него: затова разпънатите бележки се
    // свиват, преди записът да бъде изтрит. Свиването тук не се записва (без флаг „пипана"), защото
    // записът и без това изчезва на следващия ред.
    noteWindows.forEach(win => { if (win && win.expanded) setNoteWindowExpanded(win, false); });
    try {
        // Ключът се маха целият, а не се оставя празен речник: липсващ ключ и празен речник значат
        // едно и също за readNoteWindowGeometry - „няма записи", тоест бележките сядат на
        // подразбиращото се място. Празен речник само би оставил име на ключ в паметта без полза.
        localStorage.removeItem(NOTE_WINDOW_GEOM_KEY);
    } catch (e) {
        console.warn('noteWindowGeometry: reset failed', e);
    }
    noteWindows.forEach(win => {
        if (win) win.geomDirty = false;
    });
}

function savedNoteWindowGeometry(key) {
    if (!key) return null;
    return readNoteWindowGeometry().boxes[key] || null;
}

// Запомненото място се ползва само ако прозорецът стои изцяло на екрана; иначе - стълбицата.
function windowPositionFits(pos, w, h, vw, vh) {
    const TOL = 1; // толеранс за закръгляне
    return pos.x >= -TOL && pos.y >= -TOL && pos.x + w <= vw + TOL && pos.y + h <= vh + TOL;
}

function clampNoteWindowAxis(pos, size, room) {
    const max = room - size;
    if (max < 0) return Math.round(max / 2); // по-голям от екрана: центриран, както беше модалът
    return Math.round(Math.min(Math.max(pos, 0), max));
}

// Къде сяда прозорец без запомнено място: център плюс стълбица (28px на стъпка, 6 стъпки, после
// отначало). На тесен екран стълбицата слиза само надолу.
function placeNoteWindowInCascade(win, w, h, vw, vh) {
    const used = new Set(getOpenNoteWindows().filter(o => o !== win).map(o => o.slot));
    let slot = 0;
    while (slot < NOTE_WINDOW_CYCLE && used.has(slot)) slot++;
    if (slot >= NOTE_WINDOW_CYCLE) slot = getOpenNoteWindows().filter(o => o !== win).length % NOTE_WINDOW_CYCLE;
    win.slot = slot;
    const narrow = vw < NOTE_WINDOW_NARROW;
    const x = (vw - w) / 2 + (narrow ? 0 : slot * NOTE_WINDOW_CASCADE);
    const y = (vh - h) / 2 + slot * NOTE_WINDOW_CASCADE;
    win.box.style.left = clampNoteWindowAxis(x, w, vw) + 'px';
    win.box.style.top = clampNoteWindowAxis(y, h, vh) + 'px';
}

// --- Завъртане на телефона: отворените бележки се прибират в екрана (порт от uni b3.29) -------
// Досега бележката се местеше само при отваряне, значи след завъртане оставаше извън екрана: 400
// широка на x=222 излизаше 222px извън десния ръб, а на y=272 при 390 висок екран долният ръб
// падаше 182px под екрана. Минава се по СЪЩИЯ път като при отваряне: помненото място, ако се побира
// цяло на новия екран, иначе стълбицата. Размерът се смалява САМО ако иначе не се побира.
// Нищо от това не се записва: записът (noteWindowGeometry) пази мястото от екрана, на който е
// оставено, значи като върнеш телефона бележката отива там, където си я оставил. Флагът geomDirty
// не се вдига - иначе завъртането щеше да е „пипане" и да презапише мястото.
const NOTE_ROTATE_REFIT_DELAY = 120; // ms: завъртането пуска няколко resize-а, работата е веднъж

// Размер, приложен от глобалната настройка (не от бележката), не се свива никъде другаде - тук се
// досвива до екрана. Само на екрана, не в записа.
function fitNoteWindowToScreen(win) {
    const box = win && win.box;
    if (!box) return;
    const vw = window.innerWidth, vh = window.innerHeight;
    const maxW = vw - 2 * NOTE_WINDOW_MARGIN, maxH = vh - 2 * NOTE_WINDOW_MARGIN;
    if (maxW > 0 && box.offsetWidth > vw) box.style.width = `${maxW}px`;
    if (maxH > 0 && box.offsetHeight > vh) box.style.height = `${maxH}px`;
}

function refitOpenNoteWindowsAfterRotation() {
    getOpenNoteWindows().forEach(win => {
        if (!win || !win.box || !win.box.offsetWidth) return;
        // Разпънатата (цял екран) бележка си остава цял екран - тя не се мести.
        if (win.expanded) return;
        // Размерът се връща към запомнения за бележката (ако има запис): прозорец, преоразмерен на
        // широката страна, иначе оставаше 700 широк върху 390 екран.
        const saved = savedNoteWindowGeometry(win.key);
        if (saved) {
            win.box.style.width = saved.w + 'px';
            win.box.style.height = saved.h + 'px';
        }
        fitNoteWindowToScreen(win);
        const vw = window.innerWidth, vh = window.innerHeight;
        const bw = win.box.offsetWidth || 400, bh = win.box.offsetHeight || 300;
        if (saved && windowPositionFits(saved, bw, bh, vw, vh)) {
            win.slot = -1;
            win.box.style.left = saved.x + 'px';
            win.box.style.top = saved.y + 'px';
            return;
        }
        placeNoteWindowInCascade(win, bw, bh, vw, vh);
    });
}

// Месецът се подрежда наново за новия размер: кутията със скрол се слага/маха според височината.
function refitCalendarMonthAfterRotation() {
    const container = document.getElementById('calendar-container');
    if (!container || getComputedStyle(container).display === 'none') return;
    fitCalendarMonth(container);
}

// Завъртането е смяна на ШИРИНАТА или orientationchange. Клавиатурата променя само височината,
// значи не влиза тук и подредбата при писане остава същата.
let noteRotateRefitTimer = null;
let noteRotateLastWidth = window.innerWidth;

function scheduleRotationRefit(force) {
    const width = window.innerWidth;
    if (!force && width === noteRotateLastWidth) return;
    noteRotateLastWidth = width;
    clearTimeout(noteRotateRefitTimer);
    noteRotateRefitTimer = setTimeout(() => {
        noteRotateRefitTimer = null;
        refitOpenNoteWindowsAfterRotation();
        refitCalendarMonthAfterRotation();
    }, NOTE_ROTATE_REFIT_DELAY);
}

window.addEventListener('resize', () => scheduleRotationRefit(false));
window.addEventListener('orientationchange', () => scheduleRotationRefit(true));

// Размер и място на прозореца при рисуване: размерът от options (демо бележка), иначе запомненият
// за бележката, иначе глобалният (плъзгане на дръжката без Ctrl), иначе 400x300. Място се слага
// само когато прозорецът се отваря (fresh) - пре-рисуване не мести нищо.
function applyNoteWindowGeometry(win, options, fresh) {
    const box = win.box;
    const saved = savedNoteWindowGeometry(win.key);
    let w, h;
    if (options && options.width && options.height) {
        w = options.width;
        h = options.height;
    } else if (saved) {
        w = saved.w;
        h = saved.h;
    } else {
        const sw = localStorage.getItem('modalWidth');
        const sh = localStorage.getItem('modalHeight');
        w = (sw && sh) ? sw : 400;
        h = (sw && sh) ? sh : 300;
        const savedWidth = parseInt(sw, 10);
        if (sw && sh && !isNaN(savedWidth) && savedWidth > window.innerWidth) w = '100%';
    }
    box.style.width = typeof w === 'number' ? w + 'px' : w;
    box.style.height = typeof h === 'number' ? h + 'px' : h;
    box.style.maxWidth = 'none';
    box.style.maxHeight = 'none';
    // Пре-рисуване на вече поставен прозорец: разпънатият остава разпънат (стиловете са му цял екран).
    if (!fresh && win.placed) {
        if (win.expanded) setNoteWindowExpanded(win, true);
        return;
    }
    // Нова бележка в този прозорец: режимът на предишната не се наследява. Без това бележка без запис,
    // отворена в прозореца на разпъната, наследява кутията ѝ за връщане и си създава запис - тоест seq
    // расте, без никой да е пипал нищо (b1.46). Маха се направо, без запис: новият ключ още няма
    // запис, който да се пази, а и режимът се решава по-долу от записа на самата бележка.
    dropNoteWindowModeForNewNote(win);
    const vw = window.innerWidth, vh = window.innerHeight;
    const bw = box.offsetWidth || 400, bh = box.offsetHeight || 300;
    if (saved && windowPositionFits(saved, bw, bh, vw, vh)) {
        win.slot = -1;
        box.style.left = saved.x + 'px';
        box.style.top = saved.y + 'px';
    } else {
        placeNoteWindowInCascade(win, bw, bh, vw, vh);
    }
    win.placed = true;
    // Бележка, записана като разпъната, се отваря направо разпъната. Кутията, която току-що се приложи
    // (от записа), е и тази, към която се връща при свиване.
    if (saved && saved.e === true) setNoteWindowExpanded(win, true);
    else if (win.expanded) setNoteWindowExpanded(win, false);
}

// --- Разпъване на бележката (порт от cx-notes b1.91) --------------------------------------------
// Разпънатата бележка заема екрана без рамка и без отстъп. Режимът ѝ е на това устройство, като
// мястото и размерът: живее в noteWindowGeometry като пето поле на кутията ({x, y, w, h, e}), а
// ключът си остава бележката. Само една бележка е разпъната в даден момент.
function applyExpandedModalSize(box, isExpanded) {
    if (!box) return;
    if (isExpanded) {
        // 100% от овърлея, който е fixed inset 0, значи точно екранът: 100vh не се ползва, защото
        // включва лентите на телефона и долният ръб на бележката остава под тях.
        box.style.width = '100%';
        box.style.height = '100%';
        box.style.maxWidth = '100%';
        box.style.maxHeight = '100%';
        return;
    }
    box.style.maxWidth = '100vw';
    box.style.maxHeight = 'none';
}

// Стрелката: ▲ при нормален размер (натискане разпъва), ▼ при разпъната (натискане свива).
function updateModalExpandButton(win) {
    const btn = win && win.expandBtn;
    if (!btn) return;
    const expanded = !!win.expanded;
    btn.innerHTML = expanded ? '&#9660;' : '&#9650;';
    btn.title = expanded
        ? (_('modalCollapseTooltip') || 'Restore normal size')
        : (_('modalExpandTooltip') || 'Expand note');
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

// Класът на body казва на CSS-а, че има разпъната бележка (вж. style.css).
function syncAnyNoteExpanded() {
    const anyExpanded = getOpenNoteWindows().some(w => w && w.expanded);
    document.body.classList.toggle('modal-note-expanded', anyExpanded);
}

// Само една разпъната в даден момент: разпъването на друга свива предишната, която си връща мястото.
// opts се предава нататък, за да не се запише нещо, което е следствие от отваряне на бележка.
function collapseOtherExpandedNotes(keep, opts) {
    getOpenNoteWindows().forEach(w => {
        if (w && w !== keep && w.expanded) setNoteWindowExpanded(w, false, opts);
    });
}

// Прозорецът показва друга бележка: разпъването и кутията за връщане на предишната се махат. Прави се
// без запис - режимът ще се постави наново от записа на новата бележка (applyNoteWindowGeometry), а ако
// тя няма запис, просто остава в нормален размер. Флагът „пипана" на предишната също не се наследява:
// местенето ѝ вече е записано, а новата бележка не е пипана.
function dropNoteWindowModeForNewNote(win) {
    if (!win || !win.box) return;
    win.geomDirty = false;
    win.restoreBox = null;
    if (!win.expanded) return;
    win.expanded = false;
    win.el.classList.remove('note-window-expanded');
    applyExpandedModalSize(win.box, false);
    updateModalExpandButton(win);
    syncAnyNoteExpanded();
}

// Разпъва / свива един прозорец. Докато е разпъната, бележката не се мести и не се преоразмерява (вж.
// wireNoteWindowMove / wireNoteWindowResize): само излизането от режима връща старата кутия.
// Режимът се записва в noteWindowGeometry само когато смяната идва от собственика (opts.save, тоест
// натискане на стрелката). Разпъването, което приложението прилага при отваряне по запис, не е пипане:
// то не вдига флага и не пипа брояча seq (b1.46).
function setNoteWindowExpanded(win, expanded, opts) {
    if (!win || !win.box) return;
    const box = win.box;
    const want = !!expanded;
    if (want === !!win.expanded) {
        // Същото състояние: само подсигуряваме стиловете (при пре-рисуване кутията е презаписана).
        if (want) applyExpandedModalSize(box, true);
        updateModalExpandButton(win);
        syncAnyNoteExpanded();
        return;
    }
    if (want) {
        collapseOtherExpandedNotes(win, opts);
        // Старата кутия се пази, за да има какво да се върне при свиване.
        win.restoreBox = measureNoteWindowBox(win);
        win.expanded = true;
        applyExpandedModalSize(box, true);
        box.style.left = '0px';
        box.style.top = '0px';
    } else {
        const back = win.restoreBox;
        win.expanded = false;
        applyExpandedModalSize(box, false);
        if (back) {
            box.style.width = back.w + 'px';
            box.style.height = back.h + 'px';
            box.style.left = back.x + 'px';
            box.style.top = back.y + 'px';
        } else {
            placeNoteWindowInCascade(win, box.offsetWidth || 400, box.offsetHeight || 300, window.innerWidth, window.innerHeight);
        }
        win.restoreBox = null;
    }
    win.el.classList.toggle('note-window-expanded', !!win.expanded);
    // Записът: разпъната - кутията за връщане с флаг; свита - обикновената кутия, без флаг. Само при
    // смяна по натискане на стрелката (opts.save): това е истинската промяна на режима.
    if (opts && opts.save) {
        win.geomDirty = true;
        const back = win.restoreBox;
        if (win.expanded && back) writeNoteGeometryEntry(win, { x: back.x, y: back.y, w: back.w, h: back.h, e: true });
        else writeNoteGeometryEntry(win, measureNoteWindowBox(win));
    }
    updateModalExpandButton(win);
    syncAnyNoteExpanded();
}

function toggleNoteWindowExpanded(win) {
    if (!win) return;
    activateNoteWindow(win, true);
    // Натискане на стрелката: оттук насетне режимът се помни (вж. setNoteWindowExpanded).
    setNoteWindowExpanded(win, !win.expanded, { save: true });
}

// --- Живот на прозореца -------------------------------------------------------------------------
function createNoteWindow() {
    ensureNoteWindowLayer();
    const tpl = document.getElementById('content-modal-template');
    const layer = document.getElementById('note-windows-layer');
    if (!tpl || !layer) return null;
    const el = tpl.cloneNode(true);
    el.removeAttribute('id');
    el.classList.add('note-window');
    el.style.display = '';
    el.dataset.mwid = 'content-modal';
    layer.appendChild(el);
    const pick = (mwid) => el.querySelector(`[data-mwid="${mwid}"]`);
    const win = {
        el,
        box: el.querySelector('.modal-content-box'),
        body: pick('modal-body'),
        copyBtn: pick('copy-modal-btn'),
        state: {},
        open: false,
        placed: false,
        slot: -1,
        // Флагът „пипана": вдига се само от истинско местене/преоразмеряване (и от смяна на режима с
        // натискане на стрелката) и е единственото, което позволява запис в noteWindowGeometry (b1.46).
        geomDirty: false,
        key: '',
        // Разпъване: флагът е на бележката (в noteWindowGeometry), а това е състоянието на екрана.
        expanded: false,
        restoreBox: null,
        expandBtn: null,
        // Скрита (но отворена) бележка: прозорецът е display: none, а бележката не е затворена.
        hidden: false,
        barKey: ''
    };
    noteWindows.push(win);
    wireNoteWindow(win);
    return win;
}

// Затворен = свален клас 'visible' (от хиксчето, Escape, „затвори всички" или стар код).
function closeNoteWindow(win) {
    if (!win) return;
    rememberNoteWindowGeometry(win);
    const wasOpen = win.open;
    win.el.classList.remove('visible');
    win.open = false;
    if (wasOpen) onNoteWindowClosed(win);
}

function onNoteWindowClosed(win) {
    // Затворена бележка вече не е скрита: белегът се маха, за да не остане по прозореца, който
    // остава в DOM-а като idle, и да се появи отново при следващото му отваряне.
    win.hidden = false;
    win.el.classList.remove('note-window-hidden');
    // Списъкът на отворените се сменя: обхождането на стрелките се строи наново.
    resetNoteWindowWalk();
    stopAttachmentAudio();
    const others = getOpenNoteWindows().filter(w => w !== win);
    // Само СКРИТИ бележки остават: затварянето не ги връща на екрана. Активността остава у
    // затворения прозорец (празният „модал"), а скритите чакат своята плочка - иначе getTopNoteWindow
    // пада към тях, activateNoteWindow ги показва и едно хиксче разкрива всичко скрито.
    const visibleOthers = others.filter(w => !w.hidden);
    if (!visibleOthers.length) {
        // Последният остава в DOM като празен прозорец: „модалът" винаги съществува. Скритите
        // отворени прозорци остават в списъка - иначе плочките им изчезват от лентата и няма как
        // да се върнат на екрана.
        if (activeNoteWindow !== win) activateNoteWindow(win, false);
        noteWindows.filter(w => w !== win && !w.open).forEach(w => w.el.remove());
        noteWindows = noteWindows.filter(w => w === win || w.open);
        updateSingleNoteOverlay();
        return;
    }
    if (activeNoteWindow === win) activateNoteWindow(getTopNoteWindow(visibleOthers), false);
    noteWindows = noteWindows.filter(w => w !== win);
    updateSingleNoteOverlay();
    setTimeout(() => { if (!win.open && activeNoteWindow !== win) win.el.remove(); }, 450);
}

// „Затвори всички" от лентата на прозореца: затваря всички наведнъж и връща фокуса на борда.
function closeAllNoteWindows() {
    const open = getOpenNoteWindows();
    if (!open.length) return;
    resetNoteWindowWalk();
    const top = getTopNoteWindow(open);
    open.forEach(win => {
        rememberNoteWindowGeometry(win);
        win.open = false;
        win.el.classList.remove('visible');
        // Затварянето не оставя скритост: белегът се маха заедно с 'visible'.
        win.hidden = false;
        win.el.classList.remove('note-window-hidden');
    });
    // Само един празен прозорец остава, активният: той е „модалът" оттук нататък.
    const keep = top || open[0];
    // Фокусът се връща на борда: нищо в затворените прозорци не остава фокусирано.
    open.forEach(win => {
        const focused = document.activeElement;
        if (focused && win.el.contains(focused) && focused.blur) focused.blur();
    });
    noteWindows.filter(w => w !== keep).forEach(w => w.el.remove());
    noteWindows = noteWindows.filter(w => w === keep);
    if (activeNoteWindow !== keep) activateNoteWindow(keep, false);
    updateSingleNoteOverlay();
}

// Разрешено ли е отваряне на нова бележка при „Единична бележка": не - затъмнението поема
// натиска, а ако все пак се стигне дотук (клавиатура, друго място в кода), отваря се в същия.
function singleNoteWindowFor(options) {
    const match = findNoteWindow(options && options.id, options && options.gdid);
    if (match) return match;
    const top = getTopNoteWindow();
    return (top && top.open) ? top : null;
}

// Кой прозорец да нарисува showModal:
// - бележка, която вече е отворена: рисува се в НЕЯ и тя идва отпред - втори прозорец за същата
//   бележка не се отваря (нейното място не се пипа: fresh=false значи без местене);
// - < / > заменят бележката в СЪЩИЯ прозорец;
// - „Единична бележка" при отворена бележка: същият прозорец;
// - иначе - празният прозорец, ако има такъв, или нов.
function pickNoteWindowForShow(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    // Натискът на < / > важи само за бележката, която идва веднага след него (виж noteWindowNavInPlace).
    const navInPlace = !!noteWindowNavInPlace && (Date.now() - noteWindowNavInPlace) < NOTE_WINDOW_NAV_IN_PLACE_MS;
    noteWindowNavInPlace = 0;
    const match = findNoteWindow(opts.id, opts.gdid);
    if (match) return { win: match, fresh: false };
    // < / > : съседната бележка от борда влиза в СЪЩИЯ прозорец, не отваря нов.
    if (navInPlace && activeNoteWindow && activeNoteWindow.open) return { win: activeNoteWindow, fresh: false };
    if (isSingleNoteMode()) {
        const single = singleNoteWindowFor(opts);
        if (single) return { win: single, fresh: false };
    }
    if (activeNoteWindow && !activeNoteWindow.open && noteWindows.includes(activeNoteWindow)) {
        return { win: activeNoteWindow, fresh: true };
    }
    const win = createNoteWindow();
    return win ? { win, fresh: true } : null;
}

// Всички слушатели на прозореца, върху неговите собствени елементи (cloneNode не копира нито един).
function wireNoteWindow(win) {
    const { el, box, body } = win;
    const pick = (mwid) => el.querySelector(`[data-mwid="${mwid}"]`);
    // Натиск или фокус навсякъде в прозореца го прави активния - преди собствените му обработчици.
    const activate = () => { if (noteWindows.includes(win)) activateNoteWindow(win, true); };
    // Първо се запомня кой е бил активен, после натиснатият става активен (важен е редът).
    // Запомня се веднъж на натискане: иначе по-късните фази (mousedown, click) ще запишат вече
    // активирания прозорец. click без pointerdown идва от клавиатура или програмно натискане.
    const rememberPress = (e) => {
        if (noteWindowPressFrom) return;
        noteWindowPressFrom = activeNoteWindow;
        noteWindowPressOnArrow = !!(e.target && e.target.closest && e.target.closest(NOTE_ARROW_SELECTOR));
    };
    el.addEventListener('pointerdown', rememberPress, true);
    el.addEventListener('touchstart', rememberPress, { capture: true, passive: true });
    el.addEventListener('click', rememberPress, true);
    el.addEventListener('pointerdown', activate, true);
    el.addEventListener('mousedown', activate, true);
    el.addEventListener('touchstart', activate, { capture: true, passive: true });
    el.addEventListener('focusin', activate, true);
    el.addEventListener('click', (e) => {
        if (win.suppressClick) {
            win.suppressClick = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        activate();
    }, true);
    // Натисканията в прозореца не стигат до бележките отдолу.
    el.addEventListener('click', (e) => e.stopPropagation());

    // --- Лентата на прозореца не се маркира (b1.48) ---
    // CSS сваля селекцията на лентата, но плъзгане, започнало в нея, може да продължи надолу и да
    // маркира текста в тялото на бележката. selectstart се спира още в началото за всичко в лентата:
    // така нито плъзгането от хедъра, нито двойният клик върху часа/датата маркират нещо. Полетата
    // за писане са изключение - в тях маркирането е нужно. Местенето на прозореца не се пипа: то
    // работи с mousedown/mousemove върху кутията (wireNoteWindowMove) и не разчита на селекция.
    el.addEventListener('selectstart', (e) => {
        const t = e.target;
        if (!t || !t.closest || !t.closest('.note-header-toolbar')) return;
        if (t.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
        e.preventDefault();
    }, true);

    // Затворен = свален 'visible'. Така хващаме и старите пътища, които свалят класа направо.
    let wasVisible = false;
    new MutationObserver(() => {
        const visible = el.classList.contains('visible');
        const closed = wasVisible && !visible;
        wasVisible = visible;
        if (!closed || !win.open) return;
        win.open = false;
        onNoteWindowClosed(win);
    }).observe(el, { attributes: true, attributeFilter: ['class'] });

    // --- Контекстното меню и минименюто на Edge, както при стария модал ---
    body.addEventListener('contextmenu', e => e.preventDefault());
    body.addEventListener('pointerup', e => {
        if (window.getSelection().toString().length > 0) {
            e.preventDefault();
            e.stopPropagation();
        }
    });
    // formatText и демо бележката пипат размера на шрифта: след затваряне се връща настройката.
    el.addEventListener('transitionend', () => {
        if (!el.classList.contains('visible')) body.style.fontSize = `${localStorage.getItem('modalFontSize') || 16}px`;
    });

    // --- Хиксче ---
    const closeBtn = el.querySelector('.modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (win.copyBtn) win.copyBtn.style.display = 'flex';
            el.classList.remove('popup-mode');
            closeNoteWindow(win);
        });
    }

    // --- Калкулатор: клик, Ctrl+клик и задържане ---
    const calculateBtn = pick('calculate-modal-btn');
    if (calculateBtn) {
        let longPressTimer;
        let isLongPress = false;
        calculateBtn.addEventListener('click', (e) => {
            if (isLongPress) {
                isLongPress = false;
                return;
            }
            handleCalculateClick(!!e.ctrlKey);
        });
        const startPress = () => {
            isLongPress = false;
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                handleCalculateClick(true);
            }, 500);
        };
        const endPress = () => clearTimeout(longPressTimer);
        calculateBtn.addEventListener('mousedown', startPress);
        calculateBtn.addEventListener('mouseup', endPress);
        calculateBtn.addEventListener('mouseleave', endPress);
        calculateBtn.addEventListener('touchstart', startPress, { passive: true });
        calculateBtn.addEventListener('touchend', endPress);
    }

    // --- Копиране: маркираното в този прозорец, иначе цялата бележка ---
    const copyButton = win.copyBtn;
    if (copyButton) {
        copyButton.innerHTML = copyIconSvg;
        copyButton.addEventListener('click', () => {
            if (!navigator.clipboard) return;
            const selection = window.getSelection();
            let textToCopy = '';
            if (selection && selection.rangeCount > 0 && selection.toString().trim() !== '') {
                const range = selection.getRangeAt(0);
                if (body.contains(range.commonAncestorContainer)) textToCopy = selection.toString();
            }
            if (textToCopy === '') textToCopy = (getNoteWindowRaw(win) || '').trim();
            if (textToCopy) {
                navigator.clipboard.writeText(textToCopy).then(() => {
                    copyButton.innerHTML = '&#10003;';
                    setTimeout(() => { copyButton.innerHTML = copyIconSvg; }, 5000);
                }).catch(() => {
                    showToast(_('errorCopyFailed'));
                });
            }
        });
    }

    // --- Разпъване на бележката: ▲ в нормален размер, ▼ в разпънат ---
    // (id-то носи само активният прозорец, затова се търси и по класа от decorateNoteWindowIds.)
    const expandBtn = el.querySelector('[data-mwid="modal-expand-btn"], #modal-expand-btn');
    if (expandBtn) {
        win.expandBtn = expandBtn;
        expandBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleNoteWindowExpanded(win);
        });
        updateModalExpandButton(win);
    }

    body.style.fontSize = `${localStorage.getItem('modalFontSize') || 16}px`;

    wireNoteWindowResize(win, el.querySelector('.modal-resize-handle'));
    wireNoteWindowMove(win);
}

// Дръжката за размер: обикновеното плъзгане сменя размера, с който се отварят новите бележки
// (modalWidth/modalHeight) - то не е промяна на бележката. Запомнен за бележката размер се пази
// само на това устройство, в noteWindowGeometry.
function wireNoteWindowResize(win, resizeHandle) {
    if (!resizeHandle) return;
    const box = win.box;
    // resized: жегът наистина е сменил размера. Само тогава бележката е „пипана" (b1.46) - натискане
    // по дръжката без местене не е преоразмеряване и не бива да пише запис.
    let startX, startY, startWidth, startHeight, resized = false;
    function doDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        const currentX = e.touches ? e.touches[0].clientX : e.clientX;
        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        const newWidth = Math.round(startWidth + currentX - startX);
        const newHeight = Math.round(startHeight + currentY - startY);
        box.style.width = Math.max(150, Math.min(newWidth, window.innerWidth)) + 'px';
        box.style.height = Math.max(100, newHeight) + 'px';
        box.style.maxWidth = '100vw';
        box.style.maxHeight = 'none';
        resized = newWidth !== startWidth || newHeight !== startHeight;
    }
    function stopDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        document.documentElement.removeEventListener('mousemove', doDrag, false);
        document.documentElement.removeEventListener('mouseup', stopDrag, false);
        document.documentElement.removeEventListener('touchmove', doDrag, false);
        document.documentElement.removeEventListener('touchend', stopDrag, false);
        if (!resized) return;
        // Дефолтният размер за новите бележки (modalWidth/modalHeight) се пипа само в режим
        // „Единична бележка". Извън него преоразмеряването не е настройка: то се помни само за
        // самата бележка (noteWindowGeometry долу).
        if (isSingleNoteMode()) {
            localStorage.setItem('modalWidth', box.style.width);
            localStorage.setItem('modalHeight', box.style.height);
        }
        // Истинско преоразмеряване: чак сега бележката е „пипана" и записът се прави.
        win.geomDirty = true;
        rememberNoteWindowGeometry(win);
        resized = false;
    }
    function startDrag(e) {
        // Разпънатата бележка не се преоразмерява: излиза се от режима, за да се пипне размерът.
        if (win.expanded) return;
        e.preventDefault();
        e.stopPropagation();
        startX = e.touches ? e.touches[0].clientX : e.clientX;
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        startWidth = parseInt(document.defaultView.getComputedStyle(box).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(box).height, 10);
        resized = false;
        document.documentElement.addEventListener('mousemove', doDrag, false);
        document.documentElement.addEventListener('mouseup', stopDrag, false);
        document.documentElement.addEventListener('touchmove', doDrag, false);
        document.documentElement.addEventListener('touchend', stopDrag, false);
    }
    resizeHandle.addEventListener('mousedown', startDrag);
    resizeHandle.addEventListener('touchstart', startDrag, { passive: false });
    resizeHandle.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" style="position: absolute; right: 1px; bottom: 1px; pointer-events: none; stroke: rgba(0,0,0,0.4); stroke-width: 2; stroke-linecap: round; fill: none;">
            <path d="M12 2 L2 12" />
            <path d="M12 7 L7 12" />
            <path d="M10 4 L4 4 L4 10" />
        </svg>`;
}

// Местене на прозорец: хваща се лентата горе (празната ивица или името на борда). Бутоните си
// запазват клика, а плъзгане, което е мръднало, не се брои за клик върху името на борда.
function wireNoteWindowMove(win) {
    const box = win.box;
    let start = null;
    const point = (e) => (e.touches && e.touches[0]) ? e.touches[0] : e;
    const inHeaderBand = (e) => {
        const t = e.target;
        if (!t || !t.closest) return false;
        // Бутоните, лентата с бутоните и лентата на редактора не местят прозореца: там натискът е клик.
        if (t.closest('button, a, input, textarea, select, .modal-header-btn, .modal-nav-btn, .note-window-bar-btn, .note-header-buttons, .modal-edit-toolbar')) return false;
        if (t.closest('#modal-board-name, .nw-modal-board-name, .modal-board-name')) return true;
        // Ивицата за местене е лентата на прозореца (и празното около нея горе в кутията).
        if (t !== box && !t.closest('.note-header-toolbar, .modal-header-toolbar')) return false;
        const header = box.querySelector('.note-header-toolbar, .modal-header-toolbar');
        const band = Math.max(header ? header.offsetHeight : 0, 40);
        return point(e).clientY - box.getBoundingClientRect().top <= band;
    };
    const onMove = (e) => {
        if (!start) return;
        const p = point(e);
        const dx = p.clientX - start.x, dy = p.clientY - start.y;
        if (!start.moving) {
            if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
            start.moving = true;
            win.el.classList.add('note-window-moving');
        }
        if (e.cancelable) e.preventDefault();
        const vw = window.innerWidth, vh = window.innerHeight;
        // Част от лентата остава на екрана, за да може прозорецът да се върне винаги.
        const left = Math.min(Math.max(start.left + dx, 60 - box.offsetWidth), vw - 60);
        const top = Math.min(Math.max(start.top + dy, 0), vh - 40);
        box.style.left = Math.round(left) + 'px';
        box.style.top = Math.round(top) + 'px';
    };
    const onEnd = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onEnd);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onEnd);
        document.removeEventListener('touchcancel', onEnd);
        if (start && start.moving) {
            win.el.classList.remove('note-window-moving');
            win.suppressClick = true;
            setTimeout(() => { win.suppressClick = false; }, 0);
            win.slot = -1;
            win.placed = true;
            // Истинско местене: чак сега бележката е „пипана" и записът се прави (b1.46).
            win.geomDirty = true;
            rememberNoteWindowGeometry(win);
        }
        start = null;
    };
    const onStart = (e) => {
        if (e.type === 'mousedown' && e.button !== 0) return;
        // Разпънатата бележка заема екрана и не се мести (както в cx-notes): мястото ѝ се пази.
        if (win.expanded) return;
        if (!inHeaderBand(e)) return;
        const p = point(e);
        start = {
            x: p.clientX,
            y: p.clientY,
            left: parseFloat(box.style.left) || box.offsetLeft,
            top: parseFloat(box.style.top) || box.offsetTop,
            moving: false
        };
        if (e.type === 'mousedown' && e.target === box) e.preventDefault(); // без маркиране от ивицата
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
        document.addEventListener('touchcancel', onEnd);
    };
    box.addEventListener('mousedown', onStart);
    box.addEventListener('touchstart', onStart, { passive: true });
}

// Първият прозорец е самият #content-modal от index-2.html: така #content-modal, #modal-body и
// глобалните променливи съществуват от самото начало, както при единствения модал.
function initNoteWindows() {
    if (noteWindows.length) return activeNoteWindow;
    ensureNoteWindowLayer();
    const src = document.getElementById('content-modal');
    if (!src) return null;
    const win = {
        el: src,
        box: src.querySelector('.modal-content-box'),
        body: src.querySelector('#modal-body'),
        copyBtn: src.querySelector('#copy-modal-btn'),
        state: {},
        open: false,
        placed: false,
        slot: -1,
        // Флагът „пипана": вдига се само от истинско местене/преоразмеряване (и от смяна на режима с
        // натискане на стрелката) и е единственото, което позволява запис в noteWindowGeometry (b1.46).
        geomDirty: false,
        key: '',
        // Разпъване: флагът е на бележката (в noteWindowGeometry), а това е състоянието на екрана.
        expanded: false,
        restoreBox: null,
        expandBtn: null,
        // Скрита (но отворена) бележка: прозорецът е display: none, а бележката не е затворена.
        hidden: false,
        barKey: ''
    };
    src.classList.add('note-window');
    decorateNoteWindowIds(src);
    if (!noteWindows.includes(win)) noteWindows.push(win);
    wireNoteWindow(win);
    activateNoteWindow(win, true);
    return win;
}

// Escape затваря активния прозорец. Ако отгоре е друг модал (настройки, бордове, въпрос), той е
// негов - както и полето за текст, в което човекът пише в момента.
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (document.querySelector('.modal-overlay.visible:not(.note-window), #folderIdPromptPopup.show')) return;
    const focused = document.activeElement;
    if (focused && (focused.tagName === 'INPUT' || focused.tagName === 'TEXTAREA' || focused.isContentEditable)) return;
    const win = (activeNoteWindow && activeNoteWindow.open) ? activeNoteWindow : getTopNoteWindow();
    if (!win) return;
    e.preventDefault();
    closeNoteWindow(win);
});

// Back to the app: прозорците не се пипат. Само затъмнението и лентата се подреждат отново, ако
// прозорецът е бил скрит/показан, докато е бил отворен.
window.addEventListener('resize', () => {
    if (!noteWindows.length) return;
    updateSingleNoteOverlay();
});

// Рисува бележката в посочения прозорец. Кой прозорец - решава showModal (по-долу); тук той вече е
// активният, тоест id-тата и глобалните променливи сочат към него.
function renderNoteWindow(options, noteElement = null, win = activeNoteWindow, fresh = false) {
    // Нова бележка в прозореца: звукът от предишната спира тук, преди да се строи новата лента.
    stopAttachmentAudio();
    let rawContent, formatString, displayContent, noteColor, noteId, noteGdid;
    if (typeof options === 'string') {
        rawContent = options;
        options = {}; // Ensure options is an object
        formatString = null;
        noteColor = null; // Default color for simple string content
    } else {
        rawContent = options.raw;
        formatString = options.format;
        noteColor = options.color;
        // Извличаме ID-тата на бележката, ако са подадени
        noteId = options.id;
        noteGdid = options.gdid;
    }
    // --- Име на борда и геометрия на прозореца ---
    const modalContentBox = (win && win.box) || contentModal.querySelector('.modal-content-box');
    // Ключът на бележката: по него се помнят мястото и размерът (виж noteWindowGeometry).
    if (win) {
        win.key = noteWindowKeyFor(noteId, noteGdid);
        win.body.dataset.id = (noteId === undefined || noteId === null) ? '' : String(noteId);
        win.body.dataset.gdid = (noteGdid === undefined || noteGdid === null) ? '' : String(noteGdid);
        win.body.dataset.format = formatString || '';
        applyNoteWindowGeometry(win, options, fresh);
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
        // Името на борда се показва ВИНАГИ, когато бележката има борд - и когато текущият филтър е
        // същият борд (b1.11, решение на собственика: то е най-лявата клетка на лентата и се реже с
        // многоточие, когато няма място). Без борд (промо/системни бележки) остава скрито.
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
                // Отворените прозорци остават и при смяна на борда (решение на собственика, 21.10):
                // натискът върху името само превключва борда, бележката остава отворена.
                const boardBtn = document.querySelector(`.board-filter-link[data-boardid="${board.gdid}"]`);
                if (boardBtn) {
                    boardBtn.click();
                } else {
                    filterNotesByBoard(board.gdid);
                }
            });

            // --------------------------------
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
    if (options.isHtml && options.id === 'promo' && !rawContent.includes('{{')) {
        displayContent = rawContent;
    } else if (formatString && formatString.trim() !== '') {
        displayContent = formatText(rawContent, formatString, true); // isForModal = true
    } else {
        displayContent = processNoteContent(rawContent, true); // isForModal = true
    }
    modalBody.innerHTML = displayContent;
    hydrateInlineImages(modalBody); // вградените картинки (type=8) влизат в рамките си
    // Set modal background color
    // По подразбиране изключен: липсваща стойност (първо стартиране) значи изключено.
    const imgBgrdEnabled = localStorage.getItem('imgBgrd') === 'true';
    if (isPromo) {
        modalContentBox.style.backgroundColor = '#222';
        modalContentBox.style.backgroundImage = 'none';
        modalContentBox.classList.add('no-bg-image');
        modalBody.classList.add('no-bg-image');
    } else if (noteColor) {
        modalContentBox.style.backgroundColor = noteColor;
        // Ако графичният фон е изключен, премахваме background-image
        if (!imgBgrdEnabled) {
            modalContentBox.style.backgroundImage = 'none';
            modalContentBox.classList.add('no-bg-image');
            modalBody.classList.add('no-bg-image');
        } else {
            // Ако е включен, възстановяваме фона (ако има зададен в CSS)
            modalContentBox.style.backgroundImage = '';
            modalContentBox.classList.remove('no-bg-image');
            modalBody.classList.remove('no-bg-image');
        }
    } else {
        modalContentBox.style.backgroundColor = '#eef603'; // Reset to default color
        if (!imgBgrdEnabled) {
            modalContentBox.style.backgroundImage = 'none';
            modalContentBox.classList.add('no-bg-image');
            modalBody.classList.add('no-bg-image');
        } else {
            modalBody.classList.remove('no-bg-image');
        }
    }
    // Използваме requestAnimationFrame, за да гарантираме, че браузърът е приложил началните стилове (scale 0.7)
    // преди да добавим класа visible, за да се възпроизведе анимацията.
    if (win) {
        // Отворен/пре-рисуван прозорец: обхождането със стрелките се строи наново.
        resetNoteWindowWalk();
        win.open = true;
        win.placed = true;
        updateSingleNoteOverlay();
    }
    requestAnimationFrame(() => {
        (win ? win.el : contentModal).classList.add('visible');
        if (win) updateSingleNoteOverlay();
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
            // Футърът е лента от плочки като в оригиналното приложение: снимките се виждат самите те,
            // другите файлове носят иконата на типа си, лентата се плъзга настрани, когато не се
            // събират. Имената не стоят под плочките (излизат при задържане), както в оригинала.
            const stripEl = document.createElement('div');
            stripEl.className = 'nm-attach-strip';
            modalBody.appendChild(stripEl);
            // Мястото на плочката се заема веднага и в реда на файловете, а съдържанието идва, когато
            // файлът бъде намерен - иначе редът зависи от това кой файл се чете по-бързо.
            attachments.forEach(attachment => {
                const iconData = attachmentIcons.find(icon => icon.type === attachment.type);
                if (!iconData) return;
                const slot = document.createElement('div');
                slot.className = 'nm-attach-slot';
                stripEl.appendChild(slot);
                const attachmentWrapper = document.createElement('div');
                attachmentWrapper.style.display = 'flex';
                attachmentWrapper.style.alignItems = 'center';
                attachmentWrapper.style.gap = '5px';
                attachmentWrapper.style.marginTop = '5px';
                (async () => {
                    try {
                        if (useArhDb) {
                            await handleAttachment(attachment, attachmentWrapper, iconData, 'archive', true); // true for isForModal
                        } else if (useLocalFolder) {
                            await handleAttachment(attachment, attachmentWrapper, iconData, 'local', true); // true for isForModal
                        } else {
                            await handleGoogleDriveAttachment(attachment, attachmentWrapper, iconData, true); // true for isForModal
                        }
                    } catch (err) {
                        // Ако строенето на плочката се счупи, по-добре обикновеният ред с име, отколкото
                        // изчезнал файл.
                        console.warn('attachment tile: falling back to the plain row', err);
                        slot.appendChild(attachmentWrapper);
                        return;
                    }
                    buildAttachmentTile(attachment, attachmentWrapper, iconData, slot);
                })();
            });

        }
    }
    // --- КРАЙ НА ДОБАВЕНАТА ЛОГИКА ---
    // --- ДОБАВЕНА ЛОГИКА ЗА ФУТЪР В МОДАЛА ---
    // Първо премахваме стария футър, ако има такъв
    const oldFooter = modalContentBox.querySelector('.modal-note-footer');
    if (oldFooter) {
        oldFooter.remove();
    }
    // Ако не е подаден noteElement (напр. от календара), опитваме се да го намерим в DOM-а
    if (!noteElement && (options.gdid || noteGdid)) {
        const gdidToFind = options.gdid || noteGdid;
        noteElement = document.querySelector(`.note[data-g="${gdidToFind}"]`);
    }
    if (noteElement) {
        const noteHeaderInfo = noteElement.querySelector('.note-header-info');
        // Показваме футъра само ако има информация в хедъра на бележката
        // И само ако сме в режим "преглед" (не при редакция, въпреки че тук е само showModal)
        if (noteHeaderInfo && noteHeaderInfo.innerText.trim() !== '') {
            const footer = document.createElement('div');
            footer.className = 'modal-note-footer';
            // Футърът е само за датата и часа. Копието на хедъра носи и пин-бутона,
            // който във футъра няма смисъл (закачането е на борда, не в модала).
            footer.innerHTML = noteHeaderInfo.innerHTML;
            footer.querySelectorAll('.note-pin-btn, button').forEach(el => el.remove());
            modalContentBox.appendChild(footer); // Закачаме го за content box-a, не за body-то
        }
    }

    copyBtn.innerHTML = copyIconSvg;
    // --- Логика за навигация между бележките (стрелките: виж updateNoteWindowNav) ---
    const deleteBtn = document.getElementById('delete-modal-btn');
    // Показваме/скриваме бутона за изтриване
    if (useIndexedDb && (noteElement || noteGdid) && !isPromo) {
        deleteBtn.style.display = 'flex';
        // Премахваме стари event listeners и добавяме нов
        const newDeleteBtn = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
        newDeleteBtn.addEventListener('click', async (e) => {
            // Use Global handleNoteDelete for both cases
            if (noteElement) {
                await handleNoteDelete(noteElement, e, true);
            } else {
                // Calendar/System case: Pass mock element with dataset
                const mockEl = {
                    gdid: options.gdid || noteGdid, // Direct property for fallback logic
                    dataset: {
                        g: options.gdid || noteGdid, // Ensure we get it from options if variable is not in scope
                        b: (options && options.boardId) ? options.boardId : null
                    },
                    remove: () => { } // No-op
                };
                await handleNoteDelete(mockEl, e, true);
            }
        });

    } else {
        deleteBtn.style.display = 'none';
    }
    if (noteElement) {
        const visibleNotes = Array.from(notesContainer.querySelectorAll('.note-item[style*="display: flex"]'));
        // Позицията се пази на прозореца: бутоните се преизчисляват и когато броят на отворените
        // прозорци се промени (виж updateNoteWindowNav).
        if (win) {
            win.navNotes = visibleNotes;
            win.navIndex = visibleNotes.indexOf(noteElement);
        }
        updateNoteWindowNav(win);
    } else {
        // Системна информация без бележка: стрелките водят само обхождането на прозорците.
        if (win) { win.navNotes = null; win.navIndex = -1; }
        updateNoteWindowNav(win);
        const boardNameEl = document.getElementById('modal-board-name');
        if (boardNameEl) boardNameEl.style.left = '15px';
    }
    // Лентата се опреснява и в края на всеки изчертан прозорец (както в cx-notes): плочката се
    // строи чак сега, когато бележката вече е записана в прозореца (dataset.gdid/id) - при
    // отваряне лентата се опреснява и преди това, значи плочката оставаше без заглавие и цвят.
    refreshOpenNotesBar();
}

// Отваря бележката в прозорец: кой прозорец - решава pickNoteWindowForShow.
function showModal(options, noteElement = null) {
    initNoteWindows();
    const pick = pickNoteWindowForShow(options);
    if (!pick) return;
    activateNoteWindow(pick.win, true);
    renderNoteWindow(options, noteElement, pick.win, pick.fresh);
}

window.showModal = showModal;

function showAllBoardsModal() {
    const modalContent = document.createElement('div');
    const boardsModal = document.getElementById('boards-menu-modal');
    modalContent.className = 'all-boards-modal-container';
    // Взимаме всички бутони от главното меню в хедъра
    const headerMenuContainer = document.querySelector('header .board-menu-container');
    if (!headerMenuContainer) return; // Предпазна мярка
    const headerButtons = headerMenuContainer.querySelectorAll('.board-filter-link');
    // Квадратите, които не са бордове („Нареди", „Цял екран"), застават по два на ред: половината
    // ширина на борд-бутон - както е в cx-notes.
    const modalUtilWidth = Math.max(30, Math.floor((maxWidthForButtons - 10) / 2));
    headerButtons.forEach(button => {
        const clone = button.cloneNode(true);
        // --- КОРЕКЦИЯ: Прилагаме същата ширина като на бутоните в хедъра ---
        if (isBoardMenuUtilId(button.dataset.boardid)) {
            clone.style.width = `${modalUtilWidth}px`;
            clone.style.minWidth = '30px';
            clone.style.padding = '0';
        } else {
            clone.style.width = `${maxWidthForButtons}px`;
        }
        modalContent.appendChild(clone);
    });
    // Делегиран слушател за събития върху контейнера на модала
    modalContent.addEventListener('click', (e) => {
        const targetButton = e.target.closest('.board-filter-link');
        if (targetButton) {
            e.preventDefault();
            const boardId = targetButton.dataset.boardid;
            // „Цял екран": клонингът няма свои слушатели (cloneNode не ги копира), затова режимът се
            // превключва тук, а менюто се затваря.
            if (boardId === 'fullscreen') {
                boardsModal.classList.remove('visible');
                toggleHeaderFullscreen();
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
        // Затворен viewer не трябва да оставя звук: плочката, която е свирила, вече я няма.
        stopAttachmentAudio();
        copyBtn.style.display = 'flex'; // Restore copy button visibility when any modal is closed
        contentModal.classList.remove('popup-mode'); // Reset popup mode on close
        contentModal.querySelector('.modal-content-box').style.transform = '';
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
    // --- КОРЕКЦИЯ: Дефинираме buttonBoardId тук ---
    // Независимо дали boardId е число (id) или текст (gdid), за бутона ни трябва gdid.
    const buttonBoardId = typeof boardId === 'number' ? boardsData.find(b => b.id == boardId)?.gdid : boardId;
    // --- Проверка за съществуващ борд ---
    // Ако boardId не е специален изглед ('all', 'calendar', 'reminder', 'new-updates')
    // и не съществува в boardsData, превключваме към 'all'.
    const specialBoards = ['all', 'calendar', 'calendar_monthly', 'calendar_weekly', 'reminder', 'new-updates', 'with-photos', 'with-videos', 'with-sounds', 'with-other', 'trash', 'search-results'];
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
        /* Календарът заема целия екран, а прозорците на бележките живеят в #note-windows-layer
           над всичко останало - затова отворените бележки оставаха да плават върху календара.
           Затваряме ги преди рисуването, по същия път като „Затвори всички" на лентата.
           В MNV няма режим на редактиране, значи незаписани промени няма и closeAllNoteWindows()
           не пита нищо - затова и не се чака отговор, който да отмени отварянето. */
        closeAllNoteWindows();
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
    searchInput.value = ''; // Clear the search box
    saveSearchBtn.style.display = 'none';
    const useIdFilter = (typeof dbNoteIdTypeGlobal !== 'undefined' && dbNoteIdTypeGlobal === 'id') || useArhDb;
    const newBoardFilter = specialBoards.includes(boardId) ? boardId : (useIdFilter ? boardsData.find(b => b.gdid == boardId || b.id == boardId)?.id : boardId);
    if (newBoardFilter !== 'search-results') {
        previousBoardFilter = newBoardFilter;
    }
    currentBoardFilter = newBoardFilter;
    // --- НОВА ЛОГИКА: Анимация в бутона за режим ---
    const modeButton = document.getElementById('mode_button');
    const loadingIcon = modeButton ? modeButton.querySelector('#mode-button-loading-icon') : null;
    let animationStartTime = 0;
    const runFilter = () => {
        applyFilters();
        // Спираме анимацията СЛЕД като браузърът е прерисувал екрана
        if (modeButton && loadingIcon) {
            // Update UI immediately (Stop spinner, show image)
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
                    // Get note count from the UI counter which is updated in applyFilters
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
        // Използваме Promise и setTimeout, за да позволим на браузъра да рендира анимацията
        // преди да започне тежката операция по филтриране и да гарантираме, че filterNotesByBoard
        // няма да приключи преди да е приложен филтърът.
        await new Promise(resolve => {
            setTimeout(() => {
                runFilter();
                resolve();
            }, 10);
        });
    } else {
        runFilter(); // За всички други бутони, изпълняваме веднага
    }
    // Маркираме избрания бутон и задаваме визуалното състояние (active + height).
    document.querySelectorAll('.board-filter-link').forEach(link => {
        const isSelected = link.dataset.boardid === String(boardId);
        link.classList.toggle('selected-board', isSelected);
        link.classList.toggle('active', isSelected);
        link.style.height = isSelected ? '39px' : '35px';
    });
    // Пълноекранният хедър носи името на избрания борд вляво.
    updateFullscreenBoardLabel();
    // Placeholder-ът вече не включва името на борда, тъй като търсенето е във всички бележки
    // updateSearchPlaceholder() ще зададе общ placeholder
    if (boardId === 'all') {
        // For the 'all' view, clear the inline style to let the default CSS background apply.
        // This prevents flickering on initial load.
        if (currentBackground !== 'Board.png') {
            document.body.style.backgroundImage = '';
        }
        currentBackground = 'Board.png';
    } else {
        // For a specific board, set the background via inline style.
        let newBackground = 'Board.png';
        // Търсим по gdid, за да вземем фона
        const board = boardsData.find(b => b.gdid === boardId);
        if (board && board.backnum) {
            switch (board.backnum) {
                case 1: newBackground = 'Board1.png'; break;
                case 2: newBackground = 'Board2.png'; break;
                case 3: newBackground = 'Board3.png'; break;
            }
        }
        document.body.style.backgroundImage = `url('${newBackground}')`;
        currentBackground = newBackground;
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

async function initPromoNote() {
    if (promoNoteElement || isFetchingPromo) return;
    isFetchingPromo = true;

    const imageFile = promoImagesList[promoImageIndex % promoImagesList.length];
    const imgUrl = `msm-ex/${imageFile}`;
    promoImageIndex++;
    localStorage.setItem('promoImageIndex', promoImageIndex);

    if (imgUrl) {
        promoNoteElement = document.createElement('div');
        promoNoteElement.className = 'note promo-note';
        promoNoteElement.dataset.isPromo = 'true';

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

        const cont = document.getElementById('notes-container');
        if (cont) cont.appendChild(promoNoteElement);
        applyFilters();
    }
    isFetchingPromo = false;
}
/* --- PROMO NOTE LOGIC END --- */

function applyFilters() {
    const searchBox = document.getElementById('search-box');
    const searchTerm = searchBox ? searchBox.value.toLowerCase() : '';
    const notes = Array.from(notesContainer.getElementsByClassName('note'));
    let visibleCount = 0;
    // --- PRE-CALCULATE FILTER MODES ---
    const isAll = currentBoardFilter === 'all';
    const isReminder = currentBoardFilter === 'reminder';
    const isNewUpdates = currentBoardFilter === 'new-updates';
    const isWithPhotos = currentBoardFilter === 'with-photos';
    const isWithVideos = currentBoardFilter === 'with-videos';
    const isWithSounds = currentBoardFilter === 'with-sounds';
    const isWithOther = currentBoardFilter === 'with-other';
    const isTrash = currentBoardFilter === 'trash';
    const isSearchResults = currentBoardFilter === 'search-results';
    const isStandard = !isAll && !isReminder && !isNewUpdates && !isWithPhotos && !isWithVideos && !isWithSounds && !isWithOther && !isTrash && !isSearchResults;
    let validBoardIds = [currentBoardFilter];
    if (isStandard && typeof boardsData !== 'undefined') {
        const board = boardsData.find(b => b.gdid == currentBoardFilter || b.id == currentBoardFilter);
        if (board) {
            if (board.gdid) validBoardIds.push(board.gdid);
            if (board.id) validBoardIds.push(board.id);
        }
    }
    for (const note of notes) {
        if (note.classList.contains('boards-note') || note.classList.contains('promo-note')) {
            continue;
        }
        const isDeleted = (parseInt(note.dataset.s || '0', 10) === 1);
        let isVisibleByBoard = false;
        if (isTrash) {
            isVisibleByBoard = isDeleted;
        } else if (isDeleted) {
            isVisibleByBoard = false;
        } else if (isAll) {
            isVisibleByBoard = true;
        } else if (isStandard) {
            isVisibleByBoard = validBoardIds.some(id => note.dataset.b == id);
        } else if (isReminder) {
            isVisibleByBoard = (note.dataset.tm === '1');
        } else if (isNewUpdates) {
            const noteStatus = parseInt(note.dataset.s || '0', 10);
            isVisibleByBoard = (noteStatus === 2 || note.classList.contains('new-update'));
        } else if (isWithPhotos) {
            isVisibleByBoard = (note.dataset.hp === '1');
        } else if (isWithVideos) {
            isVisibleByBoard = (note.dataset.hv === '1');
        } else if (isWithSounds) {
            isVisibleByBoard = (note.dataset.hs === '1');
        } else if (isWithOther) {
            isVisibleByBoard = (note.dataset.ho === '1');
        } else if (isSearchResults) {
            isVisibleByBoard = true;
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
        if ((searchTerm !== '' ? (matchesSearch && !isDeleted) : isVisibleByBoard)) {
            note.style.display = 'flex';
            visibleCount++;
        } else {
            note.style.display = 'none';
        }
    }
    // --- Sorting Logic ---
    if (true) { // Sorting is now always active if settings are present
        const sortCriteria = localStorage.getItem('sortCriteria') || 'numord';
        const sortReverse = localStorage.getItem('sortInReverse') === 'true';
        const sortRemindersTop = localStorage.getItem('sortRemindersTop') === 'true';
        const sortOrder = sortReverse ? -1 : 1;
        const visibleNotes = Array.from(notesContainer.querySelectorAll('.note:not([style*="display: none"]):not(.promo-note)'));
        visibleNotes.sort((a, b) => {
            if (a.classList.contains('boards-note')) return -1;
            if (b.classList.contains('boards-note')) return 1;
            // 0. Закачените бележки са преди незакачените; най-скоро закачената е най-отгоре.
            const pinA = Number(a.dataset.pin || 0);
            const pinB = Number(b.dataset.pin || 0);
            const isPinnedA = pinA > 0;
            const isPinnedB = pinB > 0;
            if (isPinnedA && !isPinnedB) return -1;
            if (!isPinnedA && isPinnedB) return 1;
            if (isPinnedA && isPinnedB && pinA !== pinB) return pinB - pinA;
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
    if (localStorage.getItem('hideAssistant') !== 'true') {
        const isDismissedInBoard = currentBoardFilter && localStorage.getItem(`dismissedPromo_${currentBoardFilter}`) === 'true';

        if (isDismissedInBoard) {
            if (promoNoteElement) promoNoteElement.style.display = 'none';
        } else {
            if (!promoNoteElement && !isFetchingPromo) {
                initPromoNote(); // Start loading
            }
            if (promoNoteElement) {
                // Only show if no active search AND not dismissed in this board
                if (searchTerm === '') {
                    promoNoteElement.style.display = 'flex';
                    // If board changed or promo not in valid place
                    if (currentBoardFilter !== lastPromoBoardFilter || !notesContainer.contains(promoNoteElement)) {
                        const visibleNotes = Array.from(notesContainer.querySelectorAll('.note:not(.boards-note):not(.promo-note)'))
                            .filter(n => n.style.display !== 'none');

                        if (visibleNotes.length > 0) {
                            // Insert at random position
                            const rnd = Math.floor(Math.random() * visibleNotes.length);
                            // Use insertBefore to create randomness
                            notesContainer.insertBefore(promoNoteElement, visibleNotes[rnd]);
                        } else {
                            notesContainer.appendChild(promoNoteElement);
                        }
                        // Обновяваме изображението при всяка смяна на борда
                        updatePromoImage();
                        lastPromoBoardFilter = currentBoardFilter;
                    }
                } else {
                    promoNoteElement.style.display = 'none';
                }
            }
        }
    } else {
        if (promoNoteElement) promoNoteElement.style.display = 'none';
    }

    const noteCounter = document.getElementById('note-counter');
    if (noteCounter) {
        noteCounter.textContent = visibleCount;
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
    if (loaderTitle) loaderTitle.textContent = _('initialDataLoad');
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

// Квадратите в менюто с бордове, които не са бордове: те не участват в мярката на борд-бутоните и
// получават своя, по-тясна - „Нареди" и „Цял екран".
const BOARD_MENU_UTIL_IDS = ['reorder-boards', 'fullscreen'];
function isBoardMenuUtilId(id) { return BOARD_MENU_UTIL_IDS.includes(String(id === undefined ? '' : id)); }

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
    searchResultsLink.style.backgroundColor = '#ffeb3b';
    searchResultsLink.style.color = '#000';
    searchResultsLink.style.justifyContent = 'center';
    searchResultsLink.style.alignItems = 'center';
    addBoardButtonEvents(searchResultsLink, 'search-results');
    allButtonLinks.push(searchResultsLink);
    // --- УСЛОВНО ДОБАВЯНЕ НА БОРД "НАПОМНЯНИЯ" ---
    if (localStorage.getItem('showBoardRemind') !== 'false') {
        const reminderNoteCount = boardsData.reminderNoteCount || 0;
        const reminderLink = document.createElement('span');
        reminderLink.textContent = showCount && reminderNoteCount > 0 ? `${_('reminder')} (${reminderNoteCount})` : _('reminder');
        reminderLink.classList.add('board-filter-link', 'reminder-filter-btn');
        reminderLink.dataset.boardid = 'reminder';
        addBoardButtonEvents(reminderLink, 'reminder');
        allButtonLinks.push(reminderLink);
    }
    // Сортираме бордовете по полето numord и потребителска подредба
    boardsData.sort((a, b) => {
        const numordA = a.numord !== undefined && a.numord !== null ? a.numord : Infinity;
        const numordB = b.numord !== undefined && b.numord !== null ? b.numord : Infinity;
        return numordA - numordB;
    });
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
    } catch (e) {
        console.error("Error sorting boards:", e);
    }
    boardsData.forEach(board => {
        const boardId = board.gdid || board.id;
        if (!board.title || boardId === undefined || boardId === null) return;
        const noteCount = board.noteCount || 0;
        const link = document.createElement('span');
        link.textContent = (showCount && noteCount > 0) ? `${board.title} (${noteCount})` : board.title;
        link.classList.add('board-filter-link');
        link.dataset.boardid = boardId;
        if (board.color !== undefined && !isNaN(board.color)) {
            if (board.color >= 0 && board.color <= 6) {
                link.style.backgroundColor = `var(--board-bg-${board.color})`;
            } else if (board.color < 0) {
                const hexColor = '#' + (board.color >>> 0).toString(16).slice(-6);
                link.style.backgroundColor = hexColor;
            }
        }
        link.style.color = 'black';
        if (board.status === 1) {
            link.style.color = 'red';
        } else if (board.colorfont !== undefined && !isNaN(board.colorfont) && board.colorfont < 0) {
            const hexFontColor = '#' + (board.colorfont >>> 0).toString(16).slice(-6);
            link.style.color = hexFontColor;
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
    // --- УСЛОВНО ДОБАВЯНЕ НА БОРД "КОШЧЕ" ---
    if (localStorage.getItem('showTrashBoard') !== 'false') {
        const trashCount = boardsData.trashCount || 0;
        const trashLink = document.createElement('span');
        trashLink.textContent = (showCount && trashCount > 0) ? `${_('trashBoardTitle') || "Trash"} (${trashCount})` : (_('trashBoardTitle') || "Trash");
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
    const reorderLink = document.createElement('span');
    reorderLink.innerHTML = pencilIconSvg.replace('stroke="black"', 'stroke="white"');
    reorderLink.classList.add('board-filter-link', 'reorder-boards-btn');
    reorderLink.dataset.boardid = 'reorder-boards';
    reorderLink.title = _('reorderBoards') || "Reorder";
    reorderLink.style.display = 'flex';
    reorderLink.style.justifyContent = 'center';
    reorderLink.style.alignItems = 'center';
    reorderLink.style.backgroundColor = 'darkorange';
    reorderLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showBoardReorderPopup();
    });
    allButtonLinks.push(reorderLink);

    // --- БУТОН „ЦЯЛ ЕКРАН" (след „Нареди") ---
    // Пълноекранният режим на приложението, както е в cx-notes: квадрат в менюто с бордове. Същият
    // квадрат се появява и в плаващото меню, защото то клонира хедърните бутони, а иконата му
    // следва режима (updateHeaderFullscreenUI).
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
    fullscreenLink.title = _('toggleFullscreenTooltip') || 'Full screen (Hide/Show header)';
    fullscreenLink.setAttribute('aria-label', fullscreenLink.title);
    fullscreenLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleHeaderFullscreen();
    });
    allButtonLinks.push(fullscreenLink);

    maxWidthForButtons = 0;
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.visibility = 'hidden';
    document.body.appendChild(tempContainer);
    allButtonLinks.forEach(link => {
        tempContainer.appendChild(link);
        if (!isBoardMenuUtilId(link.dataset.boardid)) {
            maxWidthForButtons = Math.max(maxWidthForButtons, link.scrollWidth);
        }
    });

    document.body.removeChild(tempContainer);
    maxWidthForButtons += 10;
    allButtonLinks.forEach(link => {
        if (isBoardMenuUtilId(link.dataset.boardid)) {
            // Квадрат, не борд: същата мярка, каквато „Нареди" имаше и досега.
            link.style.width = '44px';
            link.style.minWidth = '44px';
            link.style.padding = '0';
        } else {
            link.style.width = `${maxWidthForButtons}px`;
        }
        contentEl.appendChild(link);
    });
    // Иконата на новия квадрат следва текущия режим (може да е включен от предния път).
    updateHeaderFullscreenUI();

    const scrollWrapper = document.createElement('div');
    scrollWrapper.className = 'scrolling-menu-wrapper';
    // scrollWrapper.appendChild(allBoardsBtn); // Redundant stationary button removal - kept removed

    // --- КОРЕКЦИЯ: Добавяме бутона и в boards-menu-container --- @@
    const boardsMenuContainer = document.getElementById('boards-menu-container');
    if (boardsMenuContainer) {
        const allBoardsMenuBtn = document.createElement('button');
        allBoardsMenuBtn.className = 'popup-menu-btn-floating'; // The single floating button class
        allBoardsMenuBtn.innerHTML = boardIconSvg;

        // Add event listeners (draggable and click)
        makeElementDraggable(allBoardsMenuBtn, 'popupMenuBtnPosition');

        let clickTimer;
        let longPressTimer = null;
        let longPressTriggered = false;
        allBoardsMenuBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Ctrl+клик превключва пълноекранния режим, без да отваря менюто (както в cx-notes).
            if (e.ctrlKey) {
                toggleHeaderFullscreen();
                return;
            }
            clearTimeout(clickTimer);
            clickTimer = setTimeout(() => {
                showAllBoardsModal();
            }, 200);
        });
        // Задържане с пръст (мобилно) също превключва пълноекранния режим.
        allBoardsMenuBtn.addEventListener('touchstart', () => {
            longPressTriggered = false;
            longPressTimer = setTimeout(() => {
                longPressTriggered = true;
                toggleHeaderFullscreen();
            }, 500);
        }, { passive: true });
        allBoardsMenuBtn.addEventListener('touchend', (e) => {
            clearTimeout(longPressTimer);
            // Задържането не се брои за клик: менюто не се отваря след него.
            if (longPressTriggered) {
                e.preventDefault();
                longPressTriggered = false;
            }
        });
        allBoardsMenuBtn.addEventListener('touchmove', () => {
            clearTimeout(longPressTimer);
        }, { passive: true });

        boardsMenuContainer.innerHTML = '';
        boardsMenuContainer.appendChild(allBoardsMenuBtn);
    }


    scrollWrapper.appendChild(contentEl);
    contentWrapper.appendChild(scrollWrapper);
    // allBoardsBtn.classList.add('visible'); //Redundant - removed
    return boardsNote;
}
async function createSettingsUI(boardsData, boardParseError) {
    const settingsModalBody = document.getElementById('settings-modal-body');
    // --- Get Element References ---
    const scaleSlider = document.getElementById('scaleSlider');
    const scaleInput = document.getElementById('scaleInput');
    const noteFontSizeInput = document.getElementById('note-font-size-input');
    const modalFontSizeInput = document.getElementById('modal-font-size-input');
    const scaleIncBtn = document.getElementById('scaleIncBtn');
    const scaleDecBtn = document.getElementById('scaleDecBtn');
    const showDatemodCheckbox = document.getElementById('show-datemod-checkbox');
    const singleNoteModeCheckbox = document.getElementById('single-note-mode-checkbox');
    const oneTapLinkCheckbox = document.getElementById('one-tap-link-checkbox');
    const showBoardNoteCountCheckbox = document.getElementById('show-board-note-count-checkbox');
    const showBoardAllCheckbox = document.getElementById('all-board-checkbox');
    const weeklyCalendarCheckbox = document.getElementById('weekly-calendar-checkbox');
    const showBoardRemindCheckbox = document.getElementById('remind-board-checkbox');
    const showPhotosBoardCheckbox = document.getElementById('show-photos-board-checkbox');
    const showVideosBoardCheckbox = document.getElementById('show-videos-board-checkbox');
    const showSoundsBoardCheckbox = document.getElementById('show-sounds-board-checkbox');
    const showOtherBoardCheckbox = document.getElementById('show-other-board-checkbox');
    const showNewBoardCheckbox = document.getElementById('show-new-board-checkbox');
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
    const hideAssistantCheckbox = document.getElementById('hide-assistant-checkbox'); // New checkbox
    const settingsExportBtn = document.getElementById('settings-export-btn');
    const settingsImportBtn = document.getElementById('settings-import-btn');
    const settingsImportInput = document.getElementById('settings-import-input');
    if (!settingsModalBody.dataset.initialized) {
        // --- Offline Mode UI Restrictions ---
        if (isOfflineMode) {
            if (useGoogleDbCheckbox) {
                useGoogleDbCheckbox.disabled = true;
                const googleDbLabel = useGoogleDbCheckbox.closest('.settings-row') || useGoogleDbCheckbox.parentElement;
                if (googleDbLabel) {
                    googleDbLabel.style.opacity = '0.5';
                    googleDbLabel.title = _('offlineModeDriveDisabled') || "Google Drive is disabled in Offline Mode";
                }
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
                if (isChecked) {
                    if (promoNoteElement) {
                        promoNoteElement.style.display = 'none';
                    }
                    Object.keys(localStorage).forEach(key => {
                        if (key.startsWith('dismissedPromo_')) {
                            localStorage.removeItem(key);
                        }
                    });
                }
                showToast(_('settingSaved'), 2000);
            });
        }
        // Автоматична защита: защитният екран излиза сам, когато приложението излезе от екрана.
        const autoProtectCheckbox = document.getElementById('auto-protect-checkbox');
        if (autoProtectCheckbox) {
            autoProtectCheckbox.checked = localStorage.getItem('privacyAutoProtect') !== 'false';
            autoProtectCheckbox.addEventListener('change', () => {
                localStorage.setItem('privacyAutoProtect', autoProtectCheckbox.checked);
                // Изключване, докато екранът е вдигнат: махаме го веднага.
                if (!autoProtectCheckbox.checked && typeof window.privacyOverlayHide === 'function') {
                    window.privacyOverlayHide();
                }
                showToast(_('settingSaved'), 2000);
            });
        }
        // Zooom/Opacity Helpers
        let opacityTimeout;
        const settingsModal = document.getElementById('settings-modal');
        const startOpacityChange = () => {
            if (opacityTimeout) clearTimeout(opacityTimeout);
            if (settingsModal) settingsModal.style.opacity = '0.7';
        };
        const endOpacityChange = (delay = 0) => {
            if (opacityTimeout) clearTimeout(opacityTimeout);
            if (typeof delay === 'number' && delay > 0) {
                opacityTimeout = setTimeout(() => { if (settingsModal) settingsModal.style.opacity = '1'; }, delay);
            } else { if (settingsModal) settingsModal.style.opacity = '1'; }
        };
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
        } else { updateZoom(scaleSlider.value); }
        // Scale Buttons
        if (scaleIncBtn) {
            scaleIncBtn.addEventListener('mousedown', startOpacityChange);
            scaleIncBtn.addEventListener('touchstart', startOpacityChange, { passive: true });
            scaleIncBtn.addEventListener('mouseup', () => endOpacityChange(2000));
            scaleIncBtn.addEventListener('touchend', () => endOpacityChange(2000));
            scaleIncBtn.addEventListener('mouseleave', () => endOpacityChange(2000));
            scaleIncBtn.addEventListener('click', () => {
                let value = parseInt(scaleInput.value, 10) + 1;
                updateZoom(value);
                localStorage.setItem('zoomLevel', value);
                showToast(_('settingSaved'), 2000);
            });
        }
        if (scaleDecBtn) {
            scaleDecBtn.addEventListener('mousedown', startOpacityChange);
            scaleDecBtn.addEventListener('touchstart', startOpacityChange, { passive: true });
            scaleDecBtn.addEventListener('mouseup', () => endOpacityChange(2000));
            scaleDecBtn.addEventListener('touchend', () => endOpacityChange(2000));
            scaleDecBtn.addEventListener('mouseleave', () => endOpacityChange(2000));
            scaleDecBtn.addEventListener('click', () => {
                let value = parseInt(scaleInput.value, 10) - 1;
                updateZoom(value);
                localStorage.setItem('zoomLevel', value);
                showToast(_('settingSaved'), 2000);
            });
        }
        const applyBtn = document.getElementById('applyZoomBtn');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                const zoomValue = scaleInput.value;
                updateZoom(zoomValue);
                localStorage.setItem('zoomLevel', zoomValue);
                showToast(_('settingSaved'), 2000);
                startOpacityChange();
                endOpacityChange(5000);
            });
        }
        if (scaleInput) {
            scaleInput.addEventListener('change', () => {
                const zoomValue = scaleInput.value;
                updateZoom(zoomValue);
                localStorage.setItem('zoomLevel', zoomValue);
            });
        }
        if (scaleSlider) {
            scaleSlider.addEventListener('input', () => {
                const zoomValue = scaleSlider.value;
                updateZoom(zoomValue);
                localStorage.setItem('zoomLevel', zoomValue);
            });
        }
        if (scaleSlider) {
            scaleSlider.addEventListener('mousedown', startOpacityChange);
            scaleSlider.addEventListener('touchstart', startOpacityChange, { passive: true });
            scaleSlider.addEventListener('mouseup', () => endOpacityChange(0));
            scaleSlider.addEventListener('touchend', () => endOpacityChange(0));
            scaleSlider.addEventListener('mouseleave', () => endOpacityChange(0));
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
        }
        // Make modal transparent when typing in scaleInput
        if (scaleInput) {
            scaleInput.addEventListener('focus', () => {
                startOpacityChange();
                if (opacityTimeout) clearTimeout(opacityTimeout);
            });
        }
        if (scaleInput) {
            scaleInput.addEventListener('blur', endOpacityChange);
        }
        // Fonts
        const setupFontSizeInput = (selectElement, storageKey, defaultValue, targetUpdate) => {
            if (!selectElement) return;
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
        if (showDatemodCheckbox) {
            showDatemodCheckbox.checked = localStorage.getItem('showDatemod') !== 'false'; // Default to true
            showDatemodCheckbox.addEventListener('change', () => {
                const isChecked = showDatemodCheckbox.checked;
                localStorage.setItem('showDatemod', isChecked);
                document.body.classList.toggle('hide-datemod', !isChecked);
                showToast(_('settingSaved'), 2000);
            });
        }
        // Единична бележка (b1.83): затъмнението под горния прозорец върви с настройката.
        if (singleNoteModeCheckbox) {
            singleNoteModeCheckbox.addEventListener('change', () => {
                localStorage.setItem('singleNoteMode', singleNoteModeCheckbox.checked ? 'true' : 'false');
                // Не само updateSingleNoteOverlay: в режима лентата изчезва (собственикът, 25.10.2026),
                // а тя е единственият път да върнеш скрита бележка - затова смяната минава през
                // applySingleNoteModeSetting, което затваря скритите бележки, слага чекбокса и
                // опреснява.
                applySingleNoteModeSetting();
                showToast(_('settingSaved'), 2000);
            });
        }
        applySingleNoteModeSetting();
        // „Ресет на позиции/размери" (b1.10): бутончето под чекбоксовете трие noteWindowGeometry.
        const resetWindowGeometryBtn = document.getElementById('reset-window-geometry-btn');
        if (resetWindowGeometryBtn) {
            resetWindowGeometryBtn.addEventListener('click', () => {
                resetNoteWindowGeometry();
                showToast(_('settingSaved'), 2000);
            });
        }
        // One-tap links
        if (oneTapLinkCheckbox) {
            oneTapLinkCheckbox.checked = localStorage.getItem('oneTapLink') === 'true'; // Default to false
            oneTapLinkCheckbox.addEventListener('change', () => {
                const isChecked = oneTapLinkCheckbox.checked;
                localStorage.setItem('oneTapLink', isChecked);
                showToast(_('settingSaved'), 2000);
                // Затваряме настройките, за да се вижда презареждането
                document.getElementById('settings-modal').classList.remove('visible');
                // Презареждаме бележките, за да се отрази промяната веднага (само UI рендериране)
                renderUI({ boardParseError: false });
            });
        }
        // Graphical background
        const imgBgrdCheckbox = document.getElementById('img-bgrd-checkbox');
        if (imgBgrdCheckbox) {
            imgBgrdCheckbox.checked = localStorage.getItem('imgBgrd') === 'true'; // По подразбиране изключен
            imgBgrdCheckbox.addEventListener('change', () => {
                const isChecked = imgBgrdCheckbox.checked;
                localStorage.setItem('imgBgrd', isChecked);
                showToast(_('settingSaved'), 2000);
            });
        }
        // Graphical background (notes list)
        const notesBgrdCheckbox = document.getElementById('notes-bgrd-checkbox');
        if (notesBgrdCheckbox) {
            notesBgrdCheckbox.checked = localStorage.getItem('notesBgrd') !== 'false'; // Default to true
            notesBgrdCheckbox.addEventListener('change', () => {
                const isChecked = notesBgrdCheckbox.checked;
                localStorage.setItem('notesBgrd', isChecked);
                showToast(_('settingSaved'), 2000);
                notesBgrdChanged = true;
            });
        }
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
        // Show 'New' Board Checkbox
        if (showNewBoardCheckbox) {
            showNewBoardCheckbox.checked = localStorage.getItem('showNewBoard') === 'true';
            showNewBoardCheckbox.addEventListener('change', () => {
                localStorage.setItem('showNewBoard', showNewBoardCheckbox.checked.toString());
                showToast(_('settingSaved'), 2000);
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
        const sortingOptionsSection = document.getElementById('sorting-options-section');
        const sortingArrow = document.getElementById('sorting-arrow');
        const boardsOptionsSection = document.getElementById('boards-options-section');
        const boardsArrow = document.getElementById('boards-arrow');
        // Event listener for the arrow ONLY
        sortingArrow.addEventListener('click', () => {
            const isActive = sortingOptionsSection.style.display === 'block';
            sortingOptionsSection.style.display = isActive ? 'none' : 'block';
            // Animate arrow rotation
            sortingArrow.style.transition = 'transform 0.3s ease';
            sortingArrow.style.transform = isActive ? 'rotate(0deg)' : 'rotate(180deg)';
        });
        // Event listener for the arrow ONLY
        boardsArrow.addEventListener('click', () => {
            const isActive = boardsOptionsSection.style.display === 'block';
            boardsOptionsSection.style.display = isActive ? 'none' : 'block';
            // Animate arrow rotation
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
                    localStorage.setItem('sortCriteria', radio.value);
                    applyFilters();
                    showToast(_('settingSaved'), 2000);
                }
            });
        });
        const sortReverseCheckbox = document.getElementById('sort-reverse-checkbox');
        sortReverseCheckbox.checked = localStorage.getItem('sortInReverse') === 'true';
        sortReverseCheckbox.addEventListener('change', () => {
            localStorage.setItem('sortInReverse', sortReverseCheckbox.checked);
            applyFilters();
            showToast(_('settingSaved'), 2000);
        });
        const sortRemindersTopCheckbox = document.getElementById('sort-reminders-top-checkbox');
        sortRemindersTopCheckbox.checked = localStorage.getItem('sortRemindersTop') === 'true';
        sortRemindersTopCheckbox.addEventListener('change', () => {
            localStorage.setItem('sortRemindersTop', sortRemindersTopCheckbox.checked);
            applyFilters();
            showToast(_('settingSaved'), 2000);
        });
        // Start Board
        let startBoardSelect; // Declare here to be accessible in the whole function
        startBoardSelect = document.getElementById('start-board-select');
        startBoardSelect.value = localStorage.getItem('startBoard') || 'Main';
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
                showToast(_('errorNoDataSourceSelected'), 5000);
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
            checkbox.addEventListener('change', () => handleDataSourceChange(checkbox, key)); // Вече е async
        });
        // indexedDB
        // Задаваме първоначалното състояние на чекбокса от localStorage
        useIndexedDbCheckbox.checked = localStorage.getItem('useIndexedDb') === 'true';
        // Add event listeners
        useIndexedDbCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            localStorage.setItem('useIndexedDb', isChecked);
            // --- НОВА ЛОГИКА: Ако се сложи отметка, симулираме клик на "Създай" ---
            if (isChecked) {
                document.getElementById('create-db-btn').click();
            } else {
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
                updateModeButton();
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
                    // Слагаме отметка на "База данни" автоматично
                    const useIndexedDbCheckbox = document.getElementById('use-indexeddb-checkbox');
                    if (useIndexedDbCheckbox && !useIndexedDbCheckbox.checked) {
                        useIndexedDbCheckbox.checked = true;
                        localStorage.setItem('useIndexedDb', 'true');
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
                const confirmedConfigDelete = await showConfirmation(_('confirmConfigDelete'), {
                    backgroundColor: '#lightgreen', // Light red background for warning
                    width: '450px'
                });
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
                // Ако сме били в режим "Само база данни", автоматично включваме Google Drive (само ако не сме в офлайн режим)
                if (isDbOnlyMode && !isOfflineMode) {
                    localStorage.setItem('useGoogleDb', 'true');
                    document.getElementById('use-google-db-checkbox').checked = true;
                    updateGlobalStateFlags();
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
        const selectFolderBtn = document.getElementById('select-folder-btn');
        const folderNameDisplay = document.getElementById('local-sync-folder-name');
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
                    document.getElementById('settings-modal').classList.remove('visible');
                    mainLogic();
                }
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.log("Error selecting directory:", error);
                }
            }
        });
        // --- Settings Export/Import ---
        if (settingsExportBtn) {
            settingsExportBtn.addEventListener('click', () => {
                const settings = {};
                appSettingsKeys.forEach(key => {
                    const value = localStorage.getItem(key);
                    if (value !== null) settings[key] = value;
                });
                const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `multinotes_settings.json`; // _${new Date().toISOString().slice(0, 10)}
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showToast(_('settingSaved'), 2000);
            });
        }
        if (settingsImportBtn && settingsImportInput) {
            settingsImportBtn.addEventListener('click', () => settingsImportInput.click());
            settingsImportInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const settings = JSON.parse(event.target.result);
                        Object.keys(settings).forEach(key => {
                            if (appSettingsKeys.includes(key)) {
                                localStorage.setItem(key, settings[key]);
                            }
                        });
                        showToast(_('dbCreated'), 2000); // Use a generic success message
                        setTimeout(() => window.location.reload(), 1000);
                    } catch (err) {
                        console.error("Error importing settings:", err);
                        showToast(_('errorImportSettings'), 5000);
                    }
                };
                reader.readAsText(file);
            });
        }
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
                            warningMessage += " " + (_('requiredFilesForArhFolder') || "It must contain the files 'boards.bcp' and 'notes.bcp'.");
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
                    // КЛЮЧОВА КОРЕКЦИЯ: Обновяваме флаговете ПРЕДИ да извикаме mainLogic
                    updateGlobalStateFlags();
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
        /*const settingsCloseBtn = */
        document.getElementById('settings-close-btn').addEventListener('click', async () => {
            /* const configData = await exportConfig();
            console.log("configData: ", configData); // Ще изведе масива с ключ/стойност от config store-a */
            const currentState = {
                useGoogleDb: document.getElementById('use-google-db-checkbox').checked,
                useLocalDb: document.getElementById('use-local-db-checkbox').checked,
                useArhDb: document.getElementById('use-arh-db-checkbox').checked,
                useIndexedDb: document.getElementById('use-indexeddb-checkbox').checked
            };
            document.getElementById('settings-modal').classList.remove('visible');
            window.kbAssistant.terminateGuide();
            // Винаги обновяваме бутона, за да отрази актуалното състояние от localStorage
            updateModeButton();
            const hasChanged = JSON.stringify(settingsInitialState) !== JSON.stringify(currentState);
            // Ако прозорецът е бил отворен принудително, презареждаме данните.
            if (window.wasOpenedForMissingFolder) {
                window.wasOpenedForMissingFolder = false; // Нулираме флага
                updateGlobalStateFlags(); // Обновяваме флаговете преди да извикаме mainLogic
                mainLogic(); // Извикваме основната логика отново
            } else if (hasChanged) {
                mainLogic(); // Извикваме основната логика отново
            }
        });
        settingsModalBody.dataset.initialized = true;
    }
    // При инициализация на UI, проверяваме дали разширените настройки трябва да са видими
    const advancedSettingsSpan = document.getElementById('advanced-settings-span');
    if (advancedSettingsSpan) {
        const showAdvanced = localStorage.getItem('showAdvancedSettings') === 'true';
        advancedSettingsSpan.hidden = !showAdvanced;
    }
}

// Асинхронно зареждане на името на папката за архив
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
    const codeTagRegex = /\{\{([\s\S]*?)\}\}/g;
    const textWithoutCode = text.replace(codeTagRegex, (match, code) => {
        codeBlocks.push(escapeHtml(code)); // escapeHtml is crucial here
        return '%%CODE_BLOCK%%';
    });
    // 2. Escape the rest of the text to prevent HTML injection
    const escapedText = escapeHtml(textWithoutCode);
    // 3. Decide whether to create links based on the setting and context (modal/card)
    const oneTapLinksEnabled = localStorage.getItem('oneTapLink') === 'true'; // false by default
    let html;
    if (isForModal || oneTapLinksEnabled) {
        // В модала или ако е включено - показваме линковете
        const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%?=~_|])/ig;
        html = escapedText.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    } else {
        // В затворената бележка и е изключено - НЕ показваме текста на линковете
        const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%?=~_|])/ig;
        html = escapedText.replace(urlRegex, ''); // Премахваме линковете изцяло
    }
    // 4. Re-insert code blocks
    codeBlocks.forEach(block => {
        html = html.replace('%%CODE_BLOCK%%', '<pre><code>' + block + '</code></pre>');
    });
    // 5. Finally, replace newlines with <br>
    // This needs to be done on the final HTML string, not on the escaped text
    return html.replace(/\n/g, '<br>');
}

function renderNoteContent(text) {
    if (!text) return '';
    const codeBlocks = [];
    const codeTagRegex = /\{\{([\s\S]*?)\}\}/g;
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

// --- Вградени картинки в бележката (text_span type=8) ------------------------------------
// Android записва в text_span {"start":34,"end":35,"type":8,"paramstring":".../Wallet.jpg",
// "paramint":4}: диапазонът покрива ЕДИН маркер в текста (звездичка), paramstring е пътят на
// прикачения файл (интересува ни само името - файлът се търси по име, точно както прикачените:
// в папка Images в Drive, в Images на локалната папка или направо в плоския архив),
// а paramint е ширината в десетки проценти: 1 = 10%, 10 = 100%.
// Ширината е процент от САМАТА СНИМКА (собственик, 26.10.2026): щом тя се зареди, рамката получава
// ширина в пиксели (paramint/10 × естествената ширина) и таван - ширината на картата. Затова един
// и същ запис не изглежда различно на 250px карта и в модала, а по-широко от картата не се показва.
// formatText слага на мястото на маркера рамка с резервирана височина и ширина;
// hydrateInlineImages после я превръща в картинка, щом файлът се намери по име - в Drive, в
// локалната папка или в архива (в кой режим сме решава inlineImageSourceMode).
// Приложението на main е VIEWER: type=8 се пипа само в рендера, никъде в път за редакция.
const INLINE_IMAGE_PLACEHOLDER = '\uE002'; // един знак - processNoteContent не го пипа
const INLINE_IMAGE_FOLDER = 'Images';
// Едно търсене в Drive за всички карти с един и същ файл: точното име на файла -> запис с promise.
// Точното име, не с малки букви: Drive различава главни от малки и иначе два различни файла
// биха споделили един кеширан отговор.
const inlineImageFileCache = new Map();
// Един thumbnail на файл: fileId -> { at, promise } на URL (или null). Една снимка в пет бележки = една заявка.
// at е кога е получен адресът: подписаният линк на Drive изтича и не бива да се ползва до края на сесията.
const inlineImageThumbCache = new Map();
// Колко дълго се помни thumbnail адресът и колко пъти се пита Drive, преди да се каже „няма адрес".
const INLINE_IMAGE_THUMB_TTL = 20 * 60 * 1000;
const INLINE_IMAGE_THUMB_TRIES = 3;
// Трите места, които показват снимка, искат различен размер - затова размерът е параметър, не
// константа на едно място:
//   400  плочката на прикачения файл - малка икона, никога самият файл;
//   800  картинката в текста на бележката - вижда се в реален размер, затова 400 изглежда размито;
//   1600 големият преглед при клик - точно колкото е екранът, повече не се вижда.
const INLINE_IMAGE_TILE_SIZE = 400;
const INLINE_IMAGE_INLINE_SIZE = 800;
const INLINE_IMAGE_PREVIEW_SIZE = 1600;
// Липсващ файл се помни кратко: може да се появи при следващата синхронизация.
const INLINE_IMAGE_MISSING_TTL = 60 * 1000;

/** Пауза между два опита: 300 мс, после 1.2 с - бавна мрежа не е липсващ файл. */
function inlineRetryDelay(attempt) {
    return new Promise(resolve => setTimeout(resolve, attempt <= 1 ? 300 : 1200));
}

/**
 * Токенът за заявките към самите файлове в Drive: authToken, а при липсващ - от gapi клиента
 * (същият ред като в inlineImageThumbUrl). Null, ако няма никакъв токен.
 */
function inlineDriveToken() {
    const tokenObj = (typeof authToken !== 'undefined' && authToken)
        ? authToken
        : ((typeof gapi !== 'undefined' && gapi.client && typeof gapi.client.getToken === 'function') ? gapi.client.getToken() : null);
    return tokenObj && tokenObj.access_token ? tokenObj.access_token : null;
}

/**
 * Опреснява токена веднъж и връща новия access_token (или null). След успех authToken се
 * обновява, за да не тръгне следващата заявка със стария токен.
 */
async function inlineRefreshToken() {
    const refresh = await refreshAuthToken().catch(() => null);
    if (!refresh || !refresh.pass || !refresh.tokenData || !refresh.tokenData.access_token) return null;
    if (typeof authToken !== 'undefined') authToken = refresh.tokenData;
    return refresh.tokenData.access_token;
}

/** 401 от Drive: изтекъл токен, не липсващ файл - разпознава се еднакво в gapi и във fetch. */
function isUnauthorizedDriveError(err) {
    if (!err) return false;
    if (err.status === 401) return true;
    const result = err.result || err.response;
    if (result && result.error && (result.error.code === 401 || result.error.status === 'UNAUTHENTICATED')) return true;
    return /401|UNAUTHENTICATED/i.test(String(err.message || ''));
}

/** Името на файла от paramstring (път от Android: "/storage/.../Images/Wallet.jpg" -> "Wallet.jpg"). */
function inlineImageName(paramstring) {
    const raw = String(paramstring || '').trim().replace(/\\/g, '/');
    if (!raw) return '';
    const name = raw.split('/').pop();
    return name && name !== '.' && name !== '..' ? name : '';
}

/** Истинско id на файл в Drive ли е: местните записи започват с 'L' и не са файлове там. */
function looksLikeDriveFileId(fileId) {
    const id = String(fileId == null ? '' : fileId).trim();
    return id.length >= 10 && !id.startsWith('L');
}

/**
 * Id на файла от прикачените файлове на бележката (media.txt) за име, което стои в текста.
 * В text_span се пази САМО името - така е записът на Android и той не се променя. Затова id-то
 * се взима от записа в media.txt: това е същият файл, който плочката на прикачения файл отваря
 * по id. Дотук тук картинката се търсеше само по име в папка Images и ако файлът е в друга папка
 * „Images" или името е с друг регистър, рамката оставаше празна, докато плочката работеше.
 * При няколко записа с едно и също име се взима последният: mediaData се дописва в края, значи
 * последният запис е най-новият. Същият ред като в uni (решение на собственика, 26.10.2026).
 */
function inlineImageMediaFileId(fileName) {
    const name = inlineImageName(fileName).toLowerCase();
    if (!name) return '';
    const records = Array.isArray(mediaData) ? mediaData : [];
    let found = '';
    for (const m of records) {
        if (!m || !looksLikeDriveFileId(m.pathGD)) continue;
        if (inlineImageName(m.path).toLowerCase() !== name) continue;
        found = String(m.pathGD);
    }
    return found;
}

/**
 * Дали файлът с това id още е в Drive. Запис в media.txt може да сочи вече изтрит файл - тогава
 * картинката трябва да падне към търсене по име, а не да остане празна. Положителният отговор се
 * помни за сесията, отрицателният - кратко (като липсващ файл), за да не пита всяка карта пак.
 */
const inlineImageFileAliveCache = new Map();

function inlineImageFileAlive(fileId) {
    const key = String(fileId || '');
    if (!key) return Promise.resolve(false);
    const cached = inlineImageFileAliveCache.get(key);
    if (cached) {
        if (cached.alive) return Promise.resolve(true);
        if (Date.now() - cached.at < INLINE_IMAGE_MISSING_TTL) return Promise.resolve(false);
        inlineImageFileAliveCache.delete(key);
    }
    return (async () => {
        const token = inlineDriveToken();
        if (!token) return false;
        try {
            const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(key)}?fields=id,trashed`,
                { headers: { 'Authorization': `Bearer ${token}` } });
            if (res.status === 401) {
                const refreshed = await inlineRefreshToken();
                if (!refreshed) return false;
                const retry = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(key)}?fields=id,trashed`,
                    { headers: { 'Authorization': `Bearer ${refreshed}` } });
                if (!retry.ok) return false;
                const info2 = await retry.json();
                return !!info2 && info2.id && info2.trashed !== true;
            }
            if (!res.ok) return false;
            const info = await res.json();
            return !!info && info.id && info.trashed !== true;
        } catch (e) {
            return false;
        }
    })().then(alive => {
        inlineImageFileAliveCache.set(key, { at: Date.now(), alive: alive === true });
        return alive === true;
    }, () => false);
}

/** Ширината в проценти от колоната: paramint 1..10 -> 10..100 (липсващ/странен = 100). */
function inlineImageWidthPct(paramint) {
    const n = Number(paramint);
    const step = Number.isFinite(n) && n > 0 ? Math.round(n) : 10;
    return Math.min(10, Math.max(1, step)) * 10;
}

/**
 * Рамката, която заема мястото на маркера, докато файлът се търси и тегли.
 * Ако записът няма име на файл, не се показва нищо (не остава и маркер в текста).
 */
function buildInlineImagePlaceholder(format) {
    const name = inlineImageName(format && format.paramstring);
    if (!name) return '';
    const pct = inlineImageWidthPct(format && format.paramint);
    const safeName = escapeHtml(name);
    return `<span class="nm-inline-img is-loading" data-nm-file="${safeName}" ` +
        `data-nm-state="loading" data-nm-pct="${pct}" style="width:${pct}%" role="img" aria-label="${safeName}"></span>`;
}

/**
 * В диапазона на type=8 маркерът (звездичката) е място за картинката, не текст: неинтервалните
 * знаци изчезват, интервалите остават (иначе думите от двете страни се слепват), а на мястото на
 * първия от тях застава INLINE_IMAGE_PLACEHOLDER. Така работи и ако end се окаже затворен
 * (диапазонът ще покрие звездичката и интервала след нея).
 */
function maskInlineImageMarkers(segmentText) {
    let out = '';
    let placed = false;
    for (const ch of segmentText) {
        if (/\s/.test(ch)) { out += ch; continue; }
        if (!placed) { out += INLINE_IMAGE_PLACEHOLDER; placed = true; }
    }
    return placed ? out : out + INLINE_IMAGE_PLACEHOLDER;
}

/** Слага готовите рамки на местата на маркерите, по ред - върху готовия HTML низ. */
function insertInlineImageSlots(html, formats) {
    if (!formats.length || html.indexOf(INLINE_IMAGE_PLACEHOLDER) === -1) return html;
    const parts = html.split(INLINE_IMAGE_PLACEHOLDER);
    let out = parts[0];
    for (let i = 1; i < parts.length; i++) {
        out += (i - 1 < formats.length ? buildInlineImagePlaceholder(formats[i - 1]) : '') + parts[i];
    }
    return out;
}

/**
 * Заглавието на картата е суров текст - не минава през formatText, - затова маркерите на type=8
 * (звездичките) се махат и оттам: иначе картата показва звездичка на мястото, на което в
 * бележката вече има картинка. Позициите са спрямо целия текст, както ги е записал Android,
 * а интервалите остават, за да не се слепват думите.
 */
function stripInlineImageMarkers(text, formatString) {
    if (!text || !formatString) return text;
    const ranges = String(formatString).split('|').map(f => {
        try { return JSON.parse(f); } catch (e) { return null; }
    }).filter(f => f && f.type === 8 && Number.isFinite(f.start) && Number.isFinite(f.end));
    if (!ranges.length) return text;
    let out = '';
    for (let i = 0; i < text.length; i++) {
        const inMarker = ranges.some(f => i >= f.start && i < f.end);
        if (!inMarker || /\s/.test(text[i])) out += text[i];
    }
    return out;
}

// Едно търсене на папка Images за всички карти наведнъж: getFolderID() пита Drive за всички
// папки и пълни folderIds, но кешира чак след отговора - затова заявката се помни тук.
let inlineImageFolderPromise = null;
function inlineImageFolderId() {
    if (!inlineImageFolderPromise) {
        inlineImageFolderPromise = (async () => {
            if (folderIds[INLINE_IMAGE_FOLDER]) return folderIds[INLINE_IMAGE_FOLDER];
            await getFolderID(); // main-овият път: folderIds['Images']
            return folderIds[INLINE_IMAGE_FOLDER] || null;
        })().then(
            id => { if (!id) inlineImageFolderPromise = null; return id; },
            () => { inlineImageFolderPromise = null; return null; }
        );
    }
    return inlineImageFolderPromise;
}

/**
 * Файловете с това име в папка Images, най-новият пръв.
 * Редът се иска изрично (orderBy: modifiedTime desc), а не се разчита на подредбата по подразбиране
 * на gapi, и се подсигурява отново в клиента - при две еднакви имена трябва да се вземе най-новият.
 * Хвърля при грешка (мрежа, 5xx, изтекла сесия) - разликата между „няма такъв файл" и „не знам" се
 * прави от inlineImageFilesByNameDetailed.
 */
async function inlineImageFilesByName(folderId, fileName) {
    const safeName = String(fileName).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const resp = await gapi.client.drive.files.list({
        q: `'${folderId}' in parents and name = '${safeName}' and trashed=false`,
        fields: 'files(id, name, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 10
    });
    const files = (resp && resp.result && resp.result.files) || [];
    return files.slice().sort((a, b) => {
        const ta = Date.parse(a.modifiedTime || 0) || 0;
        const tb = Date.parse(b.modifiedTime || 0) || 0;
        return tb - ta;
    });
}

/**
 * Същото търсене, но с разграничение между „няма такъв файл" и „не знам".
 * Един неуспешен отговор (мрежа, 5xx, изтекла сесия) не е „файлът го няма": при грешка се прави
 * втори опит след пауза, а при 401 - едно опресняване на токена и повторение. Чак когато и двата
 * опита се провалят, отговорът е unavailable, който НЕ се помни в кеша.
 * Отговорът: { status: 'ok', files } (списъкът може да е празен = сигурно „няма") | { status: 'unavailable' }.
 */
async function inlineImageFilesByNameDetailed(folderId, fileName) {
    for (let attempt = 1; attempt <= 2; attempt++) {
        let files = null;
        try {
            files = await inlineImageFilesByName(folderId, fileName);
        } catch (e) {
            if (isUnauthorizedDriveError(e)) {
                const token = await inlineRefreshToken();
                if (token) {
                    try { files = await inlineImageFilesByName(folderId, fileName); } catch (e2) { files = null; }
                }
            } else {
                files = null;
            }
        }
        if (files) return { status: 'ok', files };
        if (attempt < 2) await inlineRetryDelay(attempt);
    }
    return { status: 'unavailable' };
}

/**
 * Файлът по име от папка Images.
 * Отговорът: { status: 'ok', fileId } | { status: 'missing' } (Drive отговори и няма такъв файл)
 * | { status: 'unavailable' } (офлайн, без токен, без папка Images или неуспешен отговор - не знаем
 * дали го има).
 * Търсенето се помни за името, за да не пита всяка карта на борда Drive поотделно.
 */
function resolveInlineImageFile(fileName) {
    const key = String(fileName || '');
    if (!key) return Promise.resolve({ status: 'missing' });
    const cached = inlineImageFileCache.get(key);
    if (cached) {
        // „ok" и „в процес на търсене" се помнят винаги; „missing" - кратко. „unavailable" (не
        // знаем) НЕ се помни: иначе едно прекъсване оставя картинката празна до края на минутата.
        const reusable = cached.status === undefined || cached.status === 'ok' ||
            (cached.status === 'missing' && Date.now() - cached.at < INLINE_IMAGE_MISSING_TTL);
        if (reusable) return cached.promise;
        inlineImageFileCache.delete(key);
    }
    const entry = {
        at: Date.now(),
        promise: (async () => {
            if (typeof isOfflineMode !== 'undefined' && isOfflineMode) return { status: 'unavailable' };
            // 1) По id от прикачените файлове на бележката - същият файл, който плочката отваря.
            //    Записът в text_span пази само името, затова id-то се взима от media.txt.
            //    Редът е като в uni (решение на собственика, 26.10.2026): иначе файл в друга папка
            //    „Images" или име с друг регистър оставаше празен в MNV, а в uni се виждаше.
            const mediaFileId = inlineImageMediaFileId(fileName);
            if (mediaFileId && await inlineImageFileAlive(mediaFileId)) {
                return { status: 'ok', fileId: mediaFileId };
            }
            // 2) Старото търсене по име в папка Images - резерва за записи без media.txt.
            const folderId = await inlineImageFolderId();
            if (!folderId) return { status: 'unavailable' };
            const found = await inlineImageFilesByNameDetailed(folderId, fileName);
            if (found.status !== 'ok') return { status: 'unavailable' };
            if (!found.files.length) return { status: 'missing' };
            return { status: 'ok', fileId: found.files[0].id };
        })()
    };
    entry.promise.then(r => { entry.status = r.status; }).catch(() => { entry.status = 'unavailable'; });
    inlineImageFileCache.set(key, entry);
    return entry.promise;
}

/**
 * URL на thumbnail-а на файла, с токена: метаданни с fields=thumbnailLink, после самият адрес,
 * смален до искания размер. Размерът е параметър, защото три места показват снимката в три
 * различни размера (плочка 400, картинка в текста 800, преглед 1600) - виж INLINE_IMAGE_TILE_SIZE.
 * Адресът се помни INLINE_IMAGE_THUMB_TTL за КОНКРЕТНИЯ размер (подписаният линк изтича);
 * провал не се помни. Кешът е по fileId + размер, иначе плочката и картинката в текста си връщат
 * взаимно грешния адрес.
 * @param {string} fileId - Id на файла в Drive.
 * @param {number} [size] - Желаната ширина в пиксела (подразбирано 400 - плочката).
 */
function inlineImageThumbUrl(fileId, size) {
    const fileKey = String(fileId || '');
    if (!fileKey) return Promise.resolve(null);
    const px = Number(size) > 0 ? Math.round(Number(size)) : INLINE_IMAGE_TILE_SIZE;
    const key = `${fileKey}=s${px}`;
    const cached = inlineImageThumbCache.get(key);
    if (cached) {
        // Стар адрес се хвърля: подписаният линк на Drive изтича и тогава <img> остава празен.
        if (cached.at && Date.now() - cached.at < INLINE_IMAGE_THUMB_TTL) return cached.promise;
        inlineImageThumbCache.delete(key);
    }
    const promise = (async () => {
        try {
            let token = inlineDriveToken();
            if (!token) return null;
            const send = (accessToken) => fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileKey)}?fields=thumbnailLink`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            // До три опита: точно след качване thumbnail-ът още се генерира, а бавната мрежа дава
            // същата картина като липсващ файл. 403/404 са отговор на Drive - там се спира веднага.
            for (let attempt = 1; attempt <= INLINE_IMAGE_THUMB_TRIES; attempt++) {
                let resp = null;
                try {
                    resp = await send(token);
                } catch (e) {
                    resp = null; // мрежата падна - това не е „няма такъв файл"
                }
                if (resp && resp.status === 401) {
                    const refreshed = await inlineRefreshToken();
                    if (!refreshed) return null;
                    token = refreshed;
                    try { resp = await send(token); } catch (e) { resp = null; }
                }
                if (resp && resp.ok) {
                    const link = (await resp.json()).thumbnailLink;
                    if (link) return link.replace(/=s\d+/, `=s${px}`);
                    // Файлът е намерен, но thumbnail още не е готов - след пауза пак.
                } else if (resp && (resp.status === 403 || resp.status === 404)) {
                    return null;
                }
                if (attempt < INLINE_IMAGE_THUMB_TRIES) await inlineRetryDelay(attempt);
            }
            return null;
        } catch (e) {
            console.warn('inline image thumbnail failed:', fileKey, e);
            return null;
        }
    })();
    inlineImageThumbCache.set(key, { at: Date.now(), promise });
    // Провалът НЕ се помни: иначе една изтекла сесия оставя картинката без адрес до края на
    // сесията, дори след като токенът вече е опреснен - същото правило като в
    // resolveInlineImageBlobUrl. Следващият рендер пак ще опита.
    promise.then(src => { if (!src) inlineImageThumbCache.delete(key); })
        .catch(() => inlineImageThumbCache.delete(key));
    return promise;
}

/**
 * Забравя thumbnail адреса на файл - вика се, когато <img> с него не се е заредил.
 * Без размер чисти всички размери за файла: изтеклият подпис не е само за един размер, а и
 * плочката, и картинката в текста питат един и същ файл.
 * @param {string} fileId - Id на файла.
 * @param {number} [size] - Само този размер; без него - всички размери за файла.
 */
function invalidateInlineImageThumb(fileId, size) {
    const key = String(fileId || '');
    if (!key) return;
    if (Number(size) > 0) {
        inlineImageThumbCache.delete(`${key}=s${Math.round(Number(size))}`);
        return;
    }
    for (const k of Array.from(inlineImageThumbCache.keys())) {
        if (k === key || k.startsWith(`${key}=s`)) inlineImageThumbCache.delete(k);
    }
}

// Самият файл в реален размер: чете се, когато thumbnail-ът не помогне (няма го, или адресът му
// не се зарежда) - картинката в текста и прегледът падат на него, вместо да останат празни. Помни
// се за сесията, за да не се тегли един и същ файл втори път при повторно отваряне.
const inlineImageFullBlobCache = new Map();

/** Забравя blob адреса на самия файл - вика се, когато <img> с него не се е заредил. */
function invalidateInlineImageFull(fileId) {
    const key = String(fileId || '');
    if (key) inlineImageFullBlobCache.delete(key);
}

/**
 * Blob URL на самия файл (?alt=media), или null при провал. Провалът не се помни.
 */
function inlineImageFileBlobUrl(fileId) {
    const key = String(fileId || '');
    if (!key) return Promise.resolve(null);
    const cached = inlineImageFullBlobCache.get(key);
    if (cached) return cached;
    const entry = (async () => {
        try {
            let token = inlineDriveToken();
            if (!token) return null;
            const send = (accessToken) => fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(key)}?alt=media`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            let resp = await send(token);
            if (resp.status === 401) {
                const refreshed = await inlineRefreshToken();
                if (!refreshed) return null;
                token = refreshed;
                resp = await send(token);
            }
            if (!resp.ok) return null;
            return URL.createObjectURL(await resp.blob());
        } catch (e) {
            console.warn('inline image file read failed:', key, e);
            return null;
        }
    })();
    inlineImageFullBlobCache.set(key, entry);
    entry.then(url => { if (!url) inlineImageFullBlobCache.delete(key); })
        .catch(() => inlineImageFullBlobCache.delete(key));
    return entry;
}

/** Рамката показва името и защо я няма - бележката трябва да покаже, че там е имало снимка. */
function markInlineImageUnavailable(box, state) {
    if (!box || box.dataset.nmState === 'ready') return;
    box.dataset.nmState = state;
    box.classList.remove('is-loading', 'is-ready');
    box.classList.add(state === 'missing' ? 'is-missing' : 'is-unavailable');
    box.removeAttribute('role');
    const name = document.createElement('span');
    name.className = 'nm-inline-img-note';
    name.textContent = box.dataset.nmFile || '';
    const why = document.createElement('span');
    why.className = 'nm-inline-img-why';
    why.textContent = (state === 'missing' ? _('inlineImgMissing') : _('inlineImgUnavailable')) ||
        (state === 'missing' ? 'no such file in Images' : 'file not available right now');
    box.replaceChildren(name, why);
}

/**
 * Откъде се взимат вградените картинки: 'gdrive' | 'local' | 'archive'.
 * Същата логика като при прикачените файлове (footer иконите в createNoteElement): и двата пътя
 * водят до един и същ файл, различно е само мястото, от което се чете. Без това вграденият
 * placeholder пита Drive и в архив/локална папка чака отговор, който никога не идва.
 */
async function inlineImageSourceMode() {
    if (typeof useArhDb !== 'undefined' && useArhDb) return 'archive';
    if (typeof useLocalFolder !== 'undefined' && useLocalFolder) return 'local';
    if (typeof useIndexedDb !== 'undefined' && useIndexedDb &&
        !(typeof useGoogleDb !== 'undefined' && useGoogleDb) &&
        !(typeof useLocalFolder !== 'undefined' && useLocalFolder) &&
        !(typeof useArhDb !== 'undefined' && useArhDb)) {
        // Режимът е само в базата: dbSourceGlobal се пълни при старт, но при рендер преди това
        // (или след презареждане) се чете от конфига - както прави loadMedia.
        let source = dbSourceGlobal;
        if (source === null || source === undefined) {
            try { source = await getConfig('dbSource'); } catch (e) { source = null; }
        }
        if (Number(source) === 3) return 'archive';
        if (Number(source) === 2) return 'local';
    }
    return 'gdrive';
}

/**
 * Handle на избраната от потребителя папка (или null, ако няма такъв).
 * При старт от база глобалният dirHandle е null, а handle-ът стои в IndexedDB - затова се
 * възстановява точно както в loadMedia, за да работят вградените картинки и без ново избиране.
 */
async function ensureInlineDirHandle(sourceMode) {
    if (dirHandle) return dirHandle;
    if (sourceMode !== 'local' && sourceMode !== 'archive') return null;
    try {
        const dbSource = await getConfig('dbSource');
        let handleKey = null;
        if (Number(dbSource) === 2) handleKey = 'directoryHandle';
        else if (Number(dbSource) === 3) handleKey = 'arhHandle';
        if (!handleKey) return null;
        const handle = await getConfig(handleKey);
        const verifiedHandle = handle ? await verifyPermission(handle) : null;
        if (verifiedHandle) {
            dirHandle = verifiedHandle;
            return verifiedHandle;
        }
    } catch (e) {
        console.warn('inline image: no directory handle', e);
    }
    return null;
}

// Един файл се чете от диска веднъж за сесията: същата снимка стои на борда, в модала и в още
// няколко карти, а читането на файл от папка не е безплатно. Ключът носи и режима, защото един и
// същ файл се търси на различни места в локален режим и в архива.
const inlineImageBlobCache = new Map();

/**
 * Файлът по име от локалната папка или от архива, като blob URL.
 * Отговорът: { status: 'ok', url } | { status: 'missing' } (папката отговори и няма такъв файл)
 * | { status: 'unavailable' } (няма handle или файлът не може да се прочете).
 * Blob URL, а не Drive thumbnail: в тези режими няма нито токен, нито папка в Drive - файлът е
 * на диска и се чете директно. URL-ите НЕ се отменят - живеят колкото сесията, като
 * inlineImageThumbCache, иначе карта, преизградена след минута, остава празна.
 */
async function resolveInlineImageBlobUrl(fileName, mode) {
    const name = String(fileName || '');
    if (!name || (mode !== 'local' && mode !== 'archive')) return { status: 'missing' };
    const key = `${mode}\u0000${name}`;
    const cached = inlineImageBlobCache.get(key);
    if (cached) return cached; // и „в процес на четене" се помни - две карти не четат един файл два пъти
    const entry = (async () => {
        const handle = await ensureInlineDirHandle(mode);
        if (!handle) return { status: 'unavailable' };
        try {
            let fileHandle;
            if (mode === 'local') {
                // Локалната папка пази файловете в подпапки по тип - същото като при прикачените.
                const folderHandle = await handle.getDirectoryHandle(INLINE_IMAGE_FOLDER, { create: false });
                fileHandle = await folderHandle.getFileHandle(name);
            } else {
                // Архивът е ПЛОСЪК: всички файлове са в една папка, без Images/Video/Sound.
                fileHandle = await handle.getFileHandle(name);
            }
            const file = await fileHandle.getFile();
            return { status: 'ok', url: URL.createObjectURL(file) };
        } catch (e) {
            // Липсващ файл се различава от недостъпен: първото е сигурно, второто - не знаем.
            const errName = e && e.name;
            if (errName === 'NotFoundError' || errName === 'TypeMismatchError') return { status: 'missing' };
            return { status: 'unavailable' };
        }
    })();
    inlineImageBlobCache.set(key, entry);
    // Провалът не се помни: архивът се обновява и файлът може да се появи - следващият рендер
    // пак ще опита, вместо да показва „няма такъв файл" до края на сесията.
    entry.then(r => { if (!r || r.status !== 'ok') inlineImageBlobCache.delete(key); })
        .catch(() => inlineImageBlobCache.delete(key));
    return entry;
}

/**
 * Един адрес за картинка по име, независимо от режима - за вградените картинки (type=8) и за
 * миниатюрите в лентата на прикачените файлове. Двата пътя са същите, по които се чете и днес:
 * Drive - файлът по име в папка Images, после thumbnail със токена; локална папка/архив - файлът
 * направо от диска (resolveInlineImageBlobUrl). Втори начин за четене на същия файл няма.
 * @param {string} fileName - Името на файла.
 * @param {string} mode - 'gdrive' | 'local' | 'archive'.
 * @param {string} [fileId] - Id в Drive, ако записът го носи (прикачен файл с pathGD). Запис с id НЕ
 *        се търси по име: търсенето по име в Drive изостава след качване.
 * @param {{size?: number, fallbackFull?: boolean, skipThumb?: boolean}} [opts] - size е колко
 *        пиксела да е thumbnail-ът (подразбирано 400 - плочката). fallbackFull значи, че при
 *        провал на thumbnail-а се чете самият файл (картинката в текста). skipThumb пропуска
 *        thumbnail-а съвсем и чете самият файл - за повторния опит, когато вече се знае, че
 *        адресът на thumbnail-а не се зарежда.
 * Отговорът: { status: 'ok', src, fileId, full? } | { status: 'missing' } | { status: 'unavailable' }.
 */
async function resolveNoteImageSrc(fileName, mode, fileId, opts) {
    const size = opts && Number(opts.size) > 0 ? Math.round(Number(opts.size)) : INLINE_IMAGE_TILE_SIZE;
    const fallbackFull = !!(opts && opts.fallbackFull);
    const skipThumb = !!(opts && opts.skipThumb);
    if (mode === 'gdrive') {
        let resolvedId = String(fileId || '');
        if (!resolvedId) {
            const info = await resolveInlineImageFile(fileName);
            if (info.status !== 'ok') return { status: info.status === 'missing' ? 'missing' : 'unavailable' };
            resolvedId = info.fileId;
        }
        // Редът е thumbnail → самият файл, а не обратното: thumbnail-ът е готов, подписан адрес и
        // се тегли бързо, а файлът е единственият начин картинката да е точна в реален размер.
        // Затова размерът идва от викащия, а самият файл се чете само като резерва.
        const src = skipThumb ? null : await inlineImageThumbUrl(resolvedId, size);
        if (!src) {
            if (fallbackFull || skipThumb) {
                const blobUrl = await inlineImageFileBlobUrl(resolvedId);
                if (blobUrl) return { status: 'ok', src: blobUrl, fileId: resolvedId, full: true };
            }
            return { status: 'unavailable', fileId: resolvedId };
        }
        return { status: 'ok', src, fileId: resolvedId };
    }
    // Локална папка или архив: файлът се чете от диска. Drive не се пита - тук офлайн не е
    // грешка, файловете са при потребителя.
    const info = await resolveInlineImageBlobUrl(fileName, mode);
    if (info.status !== 'ok' || !info.url) return { status: info.status === 'missing' ? 'missing' : 'unavailable' };
    return { status: 'ok', src: info.url, fileId: null };
}

/**
 * Превръща рамките на вградените картинки в самите картинки.
 * Вика се веднага след всяко задаване на innerHTML от formatText/processNoteContent (борд, модал).
 * Идемпотентна: рамка, която вече се тегли или е готова, не се пипа.
 */
function hydrateInlineImages(rootEl) {
    if (!rootEl || typeof rootEl.querySelectorAll !== 'function') return;
    const boxes = Array.from(rootEl.querySelectorAll('.nm-inline-img[data-nm-file]'));
    if (!boxes.length) return;
    // Режимът се пита ВЕДНЪЖ за целия рендер, не за всяка рамка: в режим „само база" това е
    // четене от IndexedDB, а една бележка може да има няколко вградени картинки.
    const modePromise = inlineImageSourceMode();
    // Едно и също поставяне на картинката в рамката за всички режими, за да не се разминават
    // състоянията (is-loading / is-ready / data-nmState) между Drive и файла от диска.
    const putImage = (box, fileName, src, fileId, onRetry) => {
        if (!box.isConnected) return false; // картата вече е преизградена - новата рамка ще поеме
        if (!src) { markInlineImageUnavailable(box, 'unavailable'); return false; }
        const img = document.createElement('img');
        img.alt = fileName;
        img.decoding = 'async';
        img.addEventListener('load', () => {
            box.classList.remove('is-loading');
            box.classList.add('is-ready');
            box.dataset.nmState = 'ready';
            // Ширината е проценти от САМАТА снимка: щом естествената ширина се знае, рамката минава
            // на пиксели и спира да зависи от ширината на картата. Таванът е колоната на бележката -
            // по-широко изчисление се показва с ширината на картата (виж и max-width:100% в style.css).
            if (img.naturalWidth) {
                const pct = Math.max(10, Math.min(100, Number(box.dataset.nmPct) || 100));
                const px0 = Math.max(1, Math.round(img.naturalWidth * pct / 100));
                // На борда картата е по-тясна от колоната на бележката: ширината се смалява с
                // колкото е по-тясна картата (nmInlineBoardScale). В отворена бележка снимката
                // остава както досега.
                const want = nmInlineOnBoard(box) ? Math.max(1, Math.round(px0 * nmInlineBoardScale(box))) : px0;
                const columnWidth = nmInlineColumnWidth(box);
                const px = (columnWidth > 0 && want > columnWidth) ? columnWidth : want;
                box.style.width = px + 'px';
                box.dataset.nmPx = String(px);
                box.dataset.nmBaseUsed = String(img.naturalWidth);
            }
        });
        img.addEventListener('error', () => {
            // Адресът не се зареди: мъртъв blob, изтекъл подпис или още неготов thumbnail. Нов опит
            // с нов адрес, преди рамката да каже „недостъпен". Чистят се и двата кеша за файла -
            // иначе повторният опит връща същия мъртъв адрес и вторият <img> пак пада.
            if (onRetry && box.dataset.nmRetried !== 'true') {
                box.dataset.nmRetried = 'true';
                invalidateInlineImageThumb(fileId);
                invalidateInlineImageFull(fileId);
                img.remove();
                box.classList.add('is-loading');
                onRetry();
                return;
            }
            markInlineImageUnavailable(box, 'unavailable');
        });
        img.src = src;
        box.appendChild(img);
        return true;
    };
    for (const box of boxes) {
        if (box.dataset.nmState !== 'loading' || box.dataset.nmLoading === 'true') continue;
        box.dataset.nmLoading = 'true';
        const fileName = box.dataset.nmFile;
        // Опитът е функция, за да се повтори веднъж - и когато адресът не се зареди, и когато
        // Drive отговори „не знам" (офлайн, бавна мрежа). Един провал не е липсващ файл.
        // Първият опит: thumbnail =s800 (картинката в текста се вижда в реален размер, 400 там
        // изглежда размито), а самият файл се чете само ако thumbnail не дойде.
        // Повторният опит вече знае, че thumbnail адресът не се зарежда, и чете самия файл -
        // иначе вторият <img> получава същия мъртъв адрес и пада по същия начин.
        const attempt = (isRetry) => {
            modePromise.then(async mode => {
                // Тук НЯМА проверка за isConnected: картата се строи, преди да влезе в страницата,
                // и ранно връщане оставяше рамката във "loading" завинаги. Проверката е в putImage,
                // който не рисува в откачена карта.
                const info = await resolveNoteImageSrc(fileName, mode, box.dataset.nmFileId || '',
                    isRetry ? { size: INLINE_IMAGE_INLINE_SIZE, skipThumb: true }
                            : { size: INLINE_IMAGE_INLINE_SIZE, fallbackFull: true });
                if (info.status !== 'ok') {
                    if (!isRetry && info.status === 'unavailable') {
                        setTimeout(() => attempt(true), 1200);
                        return;
                    }
                    markInlineImageUnavailable(box, info.status === 'missing' ? 'missing' : 'unavailable');
                    return;
                }
                if (info.fileId) box.dataset.nmFileId = info.fileId;
                if (!putImage(box, fileName, info.src, info.fileId, () => attempt(true))) return;
                // Кликът се закача веднъж: повтореният опит не бива да слага втори слушател.
                if (box.dataset.nmClickBound === 'true') return;
                box.dataset.nmClickBound = 'true';
                if (mode === 'gdrive') {
                    // Клик отваря съществуващия преглед на бележката - същият overlay като при прикачените
                    // (addInNotePreviewListener -> showInNotePreview, легаси подписът с fileId и 'gdrive').
                    addInNotePreviewListener(box, box.dataset.nmFileId || info.fileId, 'gdrive', false);
                    return;
                }
                // Клик: същият overlay, но с пътя до файла - showInNotePreview сам го прочита в пълен
                // размер по същите три клона като прикачените (тук - 'local' / 'archive').
                addInNotePreviewListener(box, [{ path: fileName, type: 1 }], 0, mode, false);
            }).catch(() => markInlineImageUnavailable(box, 'unavailable'));
        };
        attempt(false);
    }
}

/**
 * Коефициентът за снимките, нарисувани върху карта на борда (същото правило като в uni, 26.10.2026):
 * картата е по-тясна от колоната на бележката, затова ширината от самата снимка се смалява с
 * колкото е по-тясна картата (ширина на картата / ширина на модала) и чак после се слага таванът
 * на картата. Това число е резервата, докато модалът още не може да се измери, и таван на
 * коефициента, за да не става снимка на борда по-голяма от изчислената от себе си.
 */
const NM_INLINE_BOARD_SCALE = 0.5;

/**
 * Ширината на колоната на отворена бележка в пиксели, без отстъпите.
 *
 * Не е едно число в кода: style.css дава 90% от екрана като таван, а бележката се отваря със
 * запомнения си размер (localStorage modalWidth, иначе 400px). Затова тук се смята от тези две
 * неща, а отстъпите се четат от истинските класове: строи се скрита проба
 * .modal-content-box > .nw-modal-body, която веднага се маха. Така числото не се разминава с
 * оформлението, ако CSS-ът се промени, и не зависи от това дали има отворена бележка.
 */
const NM_INLINE_NOTE_DEFAULT_WIDTH = 400;
let nmInlineModalProbe = null;

function nmInlineNoteReferenceWidth() {
    let px = 0;
    try { px = parseFloat(localStorage.getItem('modalWidth') || '') || 0; } catch (e) { px = 0; }
    return px > 0 ? px : NM_INLINE_NOTE_DEFAULT_WIDTH;
}

function nmInlineModalColumnWidth() {
    const width = nmInlineNoteReferenceWidth();
    const key = width + 'x' + window.innerWidth;
    if (nmInlineModalProbe && nmInlineModalProbe.key === key) return nmInlineModalProbe.value;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    // Скрита, но с layout: display:none би дало ширина 0, а visibility:hidden я запазва.
    overlay.style.cssText = 'visibility:hidden;pointer-events:none;z-index:-1;';
    const box = document.createElement('div');
    box.className = 'modal-content-box';
    box.style.width = width + 'px';
    const body = document.createElement('div');
    body.className = 'nw-modal-body';
    box.appendChild(body);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    const styles = typeof window.getComputedStyle === 'function' ? getComputedStyle(body) : null;
    const padding = styles ? (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0) : 0;
    const value = Math.max(0, Math.round((body.clientWidth || 0) - padding));
    overlay.remove();
    nmInlineModalProbe = { key: key, value: value };
    return value;
}

/**
 * Колко пъти е по-тясна картата на борда от колоната на бележката: 1 = същата ширина (нищо не се
 * смалява). Резервата NM_INLINE_BOARD_SCALE се ползва, когато картата или модалът още не могат да
 * се измерят.
 */
function nmInlineBoardScale(box) {
    const modalWidth = nmInlineModalColumnWidth(box);
    if (!modalWidth) return NM_INLINE_BOARD_SCALE;
    const cardWidth = nmInlineColumnWidth(box);
    if (!cardWidth) return NM_INLINE_BOARD_SCALE;
    const ratio = cardWidth / modalWidth;
    if (!Number.isFinite(ratio) || ratio <= 0) return NM_INLINE_BOARD_SCALE;
    return Math.min(1, ratio);
}

/** Рамката е на борда (карта), не в отворена бележка: там ширината минава през коефициента. */
function nmInlineOnBoard(box) {
    if (!box || !box.closest) return false;
    return !box.closest('#modal-body, .nw-modal-body, [data-mwid="modal-body"]');
}

/**
 * Ширината на колоната на бележката в пиксели: тялото на модала или .note-content на картата
 * (без отстъпите); рамка в реда-заглавие е извън .note-content, значи таванът е самата карта.
 * 0, когато рамката още не е в страницата - тогава таванът го слага max-width: 100% в style.css.
 */
function nmInlineColumnWidth(box) {
    if (!box || !box.closest) return 0;
    const column = box.closest('.note-content, #modal-body, .nw-modal-body, [data-mwid="modal-body"]')
        || box.closest('.note');
    if (!column) return 0;
    const styles = typeof window.getComputedStyle === 'function' ? getComputedStyle(column) : null;
    const padding = styles ? (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0) : 0;
    const width = Math.round((column.clientWidth || 0) - padding);
    return width > 0 ? width : 0;
}

/**
 * Форматира текстов низ възоснова на JSON параметри.
 * @param {string} text - Текстовият низ за форматиране.
 * @param {string} formatString - Форматиращият низ, разделен с '\n'.
 * @param {boolean} isForModal - Дали е за модал (за линковете).
 * @returns {string} Форматираният HTML низ.
 */
function formatText(text, formatString, isForModal = false) {
    if (!formatString) return processNoteContent(text, isForModal);
    if (formatString.endsWith('|')) {
        formatString = formatString.slice(0, -1);
    }
    const formats = formatString.split('|').map(f => {
        try {
            return JSON.parse(f);
        } catch (e) {
            console.log('Invalid JSON in format string:', f);
            return null;
        }
    }).filter(f => f !== null);
    if (formats.length === 0) {
        return processNoteContent(text, isForModal);
    }
    const points = new Set([0, text.length]);
    formats.forEach(f => {
        points.add(f.start);
        points.add(f.end);
    });
    const sortedPoints = Array.from(points).sort((a, b) => a - b);
    let html = '';
    // Рамките на вградените картинки (type=8), по ред на появяване в текста.
    const inlineImageSlots = [];
    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i + 1];
        const segmentText = text.substring(start, end);
        if (segmentText.length === 0) continue;
        const activeFormats = formats.filter(f => f.start <= start && f.end >= end);
        // Вградена картинка (type=8): границите на сегментите са точно start/end на форматите,
        // затова един сегмент или е целият в диапазона, или е целият извън него. Знаците в
        // диапазона са маркер за място (звездички) - махат се, а на мястото на първия влиза
        // един знак, който след цикъла се заменя с рамката на картинката.
        const inlineImageFormats = activeFormats.filter(f => f.type === 8);
        const textForSegment = inlineImageFormats.length ? maskInlineImageMarkers(segmentText) : segmentText;
        // Use processNoteContent instead of renderNoteContent
        let formattedSegment = processNoteContent(textForSegment, isForModal);
        // Ред на появяване - по него insertInlineImageSlots връща рамките на местата на маркерите.
        // Започващи по едно и също място диапазони дават ЕДИН маркер, затова остава най-дългият.
        inlineImageFormats
            .slice()
            .sort((a, b) => (a.start - b.start) || (b.end - a.end))
            .filter((f, idx, arr) => idx === 0 || f.start !== arr[idx - 1].start)
            .forEach(f => inlineImageSlots.push(f));
        // Inline стиловете (болд/курсив/цвят/размер) се прилагат по type; type=8 не е стил -
        // той вече е станал място за рамката на картинката по-горе.
        const inlineFormats = activeFormats.filter(f => f.type !== 8);
        inlineFormats.sort((a, b) => b.type - a.type);
        inlineFormats.forEach(format => {
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
    // Вградените картинки (type=8) се сглобяват накрая, върху готовия низ: дотогава на мястото
    // на картинката стои един знак и не пречи на обработката на сегмента.
    html = insertInlineImageSlots(html, inlineImageSlots);
    return html;
}

/**
 * Миниатюрата в плочката: същият път като вградените картинки (resolveNoteImageSrc), режимът се
 * пита по същия начин (inlineImageSourceMode), за да работят Drive, локална папка и архив.
 * Плочката е малката картинка, която не се разпъва: вика се БЕЗ опции, значи твърдо thumbnail
 * =s400 и никога самият файл (без fallbackFull - при провал остава иконата на типа, а не 5 MB
 * снимка за 60px квадрат).
 * Докато файлът се търси, плочката пази мястото с празна подложка; при липсващ файл остава
 * иконата на типа и пунктир, вместо празна дупка.
 */
async function fillAttachmentThumb(photoEl, tile, fileName, attachment) {
    if (!photoEl || !fileName) return;
    // Запис с id в Drive (pathGD) не се търси по име: търсенето по име изостава след качване, а
    // файлът вече си има id - точно оттам идваха празните плочки.
    const fileId = attachment && attachment.pathGD ? String(attachment.pathGD) : '';
    try {
        const mode = await inlineImageSourceMode();
        const info = await resolveNoteImageSrc(fileName, mode, fileId);
        if (!photoEl.isConnected) return; // плочката вече не е на екрана
        if (info.status !== 'ok') {
            // „Недостъпен сега" не е „липсва": един повторен опит, преди плочката да остане празна.
            if (info.status === 'unavailable' && photoEl.dataset.retried !== 'true') {
                photoEl.dataset.retried = 'true';
                setTimeout(() => fillAttachmentThumb(photoEl, tile, fileName, attachment), 1200);
                return;
            }
            dropAttachmentThumb(photoEl, tile, info.status);
            return;
        }
        const img = document.createElement('img');
        img.alt = ''; // името е в title/aria-label на плочката, тук би се повторило
        img.decoding = 'async';
        img.addEventListener('load', () => {
            photoEl.classList.remove('is-loading');
            photoEl.classList.add('is-ready');
            tile.dataset.state = 'ready';
        });
        img.addEventListener('error', () => {
            // Адресът може да е изтекъл или thumbnail-ът още да не е готов: нов опит с нов адрес.
            if (photoEl.dataset.retried !== 'true') {
                photoEl.dataset.retried = 'true';
                invalidateInlineImageThumb(info.fileId);
                img.remove();
                setTimeout(() => fillAttachmentThumb(photoEl, tile, fileName, attachment), 700);
                return;
            }
            dropAttachmentThumb(photoEl, tile, 'unavailable');
        });
        img.src = info.src;
        photoEl.appendChild(img);
    } catch (e) {
        if (photoEl.isConnected) dropAttachmentThumb(photoEl, tile, 'unavailable');
    }
}

/** Миниатюра няма: плочката се връща към иконата на типа и казва защо с пунктир. */
function dropAttachmentThumb(photoEl, tile, state) {
    if (photoEl) photoEl.remove();
    if (!tile) return;
    tile.classList.remove('has-photo');
    tile.classList.add(state === 'missing' ? 'is-missing' : 'is-unavailable');
    tile.dataset.state = state;
}

// --- Втори ред на подсказката: дата, час и размер на файла -----------------------------------
// Собственикът (22.10): при задържане върху плочката да се вижда и от кога е файлът, и колко е
// голям. Това е втори ред в същия title: '\n' се показва като нов ред от Chrome и Firefox, значи
// не е нужен собствен tooltip елемент, нито CSS.
//
// Подпапката в локалната папка по тип на прикачения файл - същите имена ползва и отварянето.
const ATTACHMENT_TYPE_FOLDERS = { 1: 'Images', 2: 'Sound', 3: 'Other', 4: 'Video' };
// Спомнено за сесията: повторно отваряне на модала не пита отново нито Drive, нито диска.
const attachmentMetaCache = new Map();

/**
 * Ключ за спомненото: режим + id в Drive или име на файл (при локалната папка и типа, защото
 * един и същ файл може да е в Images и в Other).
 */
function attachmentMetaKey(attachment, fileName, mode) {
    if (mode === 'gdrive') {
        const direct = String(attachment.pathGD || '');
        if (direct) return `gdrive:${direct}`;
        // Снимка без id се търси по име - ключът е по името, за да не се повтаря търсенето.
        return fileName ? `gdrive-name:${fileName}` : '';
    }
    if (!fileName) return '';
    return mode === 'local' ? `local:${attachment.type}:${fileName}` : `archive:${fileName}`;
}

/**
 * Id-то на файла в Drive - същото, което ползва и отварянето: pathGD, а при снимка без id -
 * файлът по име от папка Images (resolveInlineImageFile).
 * @returns {Promise<string>} Id или празен низ.
 */
async function attachmentDriveFileId(attachment, fileName) {
    const direct = String(attachment.pathGD || '');
    if (direct) return direct;
    if (Number(attachment.type) !== 1 || !fileName) return '';
    const info = await resolveInlineImageFile(fileName);
    return info && info.status === 'ok' && info.fileId ? String(info.fileId) : '';
}

/**
 * Метаданните от Drive: size и modifiedTime с една заявка, с токена за самите файлове.
 * Изтекъл токен се опреснява еднократно - същото правило като при миниатюрите
 * (inlineImageThumbUrl), иначе една изтекла сесия оставя подсказката без втори ред.
 * @returns {Promise<{modified: number|null, size: number|null}|null>}
 */
async function attachmentDriveMeta(attachment, fileName) {
    const fileId = await attachmentDriveFileId(attachment, fileName);
    if (!fileId) return null;
    const token = await driveMediaToken();
    if (!token) return null;
    const send = (accessToken) => fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=size,modifiedTime`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    let resp = await send(token);
    if (resp.status === 401) {
        const refresh = await refreshAuthToken().catch(() => null);
        if (!refresh || !refresh.pass || !refresh.tokenData || !refresh.tokenData.access_token) return null;
        resp = await send(refresh.tokenData.access_token);
    }
    if (!resp.ok) return null;
    const data = await resp.json();
    // Размерът идва като НИЗ в байтове и липсва при документите на Google - тогава остава само
    // датата, вместо "0 B".
    const size = data && data.size !== undefined && data.size !== null && data.size !== ''
        ? Number(data.size) : NaN;
    const modified = data && data.modifiedTime ? Date.parse(data.modifiedTime) : NaN;
    return {
        modified: Number.isFinite(modified) ? modified : null,
        size: Number.isFinite(size) ? size : null
    };
}

/**
 * Метаданните от диска: локалната папка по подпапка на типа (Images/Sound/Other/Video), архивът
 * плоско по име - точно както се отваря и самият файл.
 * @returns {Promise<{modified: number|null, size: number|null}|null>}
 */
async function attachmentHandleMeta(attachment, fileName, mode) {
    if (!fileName) return null;
    const handle = await ensureInlineDirHandle(mode);
    if (!handle) return null;
    let fileHandle;
    if (mode === 'local') {
        const folder = ATTACHMENT_TYPE_FOLDERS[Number(attachment.type)];
        if (!folder) return null;
        fileHandle = await (await handle.getDirectoryHandle(folder, { create: false })).getFileHandle(fileName);
    } else {
        fileHandle = await handle.getFileHandle(fileName);
    }
    const file = await fileHandle.getFile();
    return {
        modified: Number.isFinite(file.lastModified) && file.lastModified > 0 ? file.lastModified : null,
        size: Number.isFinite(file.size) ? file.size : null
    };
}

/** Размерът с езика на приложението: 512 KB, 2,4 MB, 1 GB - без излишното ",0". */
function attachmentFileSizeLabel(size) {
    if (!Number.isFinite(size) || size <= 0) return '';
    const decimal = (value) => value.toLocaleString(currentLang, { minimumFractionDigits: 0, maximumFractionDigits: 1 });
    if (size >= 1024 * 1024 * 1024) return `${decimal(size / (1024 * 1024 * 1024))} GB`;
    if (size >= 1024 * 1024) return `${decimal(size / (1024 * 1024))} MB`;
    if (size >= 1024) return `${decimal(size / 1024)} KB`;
    // Под един килобайт се показват байтовете: иначе малък файл би изглеждал като 0 KB.
    return `${decimal(size)} B`;
}

/**
 * Вторият ред на подсказката: "<дата, час> · <размер>", с езика, избран в приложението.
 * Липсва ли едно от двете, редът носи само другото; няма ли нищо - празен низ.
 */
function attachmentMetaLine(meta) {
    if (!meta) return '';
    const parts = [];
    if (meta.modified) {
        try {
            parts.push(new Intl.DateTimeFormat(currentLang, {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit'
            }).format(new Date(meta.modified)));
        } catch (e) {
            // Език без данни за Intl: редът остава само с размера, вместо да падне.
        }
    }
    const size = attachmentFileSizeLabel(meta.size);
    if (size) parts.push(size);
    return parts.join(' · ');
}

/**
 * Дописва втория ред в подсказката, когато метаданните пристигнат - плочката не чака нищо.
 * aria-label НЕ се пипа: нов ред в него се чете странно от екранните четци, а името там е същото.
 * Провалът е тих: подсказката си остава един ред, както преди.
 * @param {HTMLElement} tile - Плочката.
 * @param {object} attachment - Обектът на прикачения файл.
 * @param {string} fileName - Името на файла.
 * @param {string} oneLineHint - Днешният едноредов текст на подсказката.
 */
async function fillAttachmentTileMeta(tile, attachment, fileName, oneLineHint) {
    if (!tile || !oneLineHint) return; // няма име - няма и подсказка, в която да се допише ред
    try {
        const mode = await inlineImageSourceMode();
        const meta = await attachmentFileMeta(attachment, fileName, mode);
        if (!meta || !tile.isConnected) return; // плочката вече не е на екрана
        const line = attachmentMetaLine(meta);
        if (!line) return;
        tile.title = `${oneLineHint}\n${line}`;
    } catch (e) {
        // Файлът може да е преместен или да няма права - това не е повод за съобщение.
        console.warn('attachment tile meta failed:', fileName, e);
    }
}

/**
 * Метаданните на файла по трите пътя, по които се чете и самият той (inlineImageSourceMode).
 * Успешното се помни за сесията; провалът НЕ се помни - след опреснен токен или върнала се
 * папка следващият рендер пак ще опита (същото правило като при миниатюрите).
 * @returns {Promise<{modified: number|null, size: number|null}|null>} null, ако не се знае.
 */
async function attachmentFileMeta(attachment, fileName, mode) {
    const key = attachmentMetaKey(attachment, fileName, mode);
    if (!key) return null;
    if (attachmentMetaCache.has(key)) return attachmentMetaCache.get(key);
    let meta = null;
    try {
        meta = mode === 'gdrive'
            ? await attachmentDriveMeta(attachment, fileName)
            : await attachmentHandleMeta(attachment, fileName, mode);
    } catch (e) {
        meta = null;
    }
    if (!meta || (meta.modified === null && meta.size === null)) return null;
    attachmentMetaCache.set(key, meta);
    return meta;
}

// --- Звукът остава в плочката ---------------------------------------------------------------
// Собственикът (21.10): кликът на аудио файл отваряше черно поле в бележката и звукът тръгваше
// там. Иска се обратното - звукът да излезе от самата плочка, иконата да пулсира, докато свири, и
// втори клик да го спре. Затова има един скрит <audio> за цялото приложение: два гласа един върху
// друг не се получават, а вторият клик винаги спира това, което се чува.

// Как се казва подпапката със звука в локалната папка - същото име ползва и прегледът. Архивът
// е плосък, там файлът е в корена.
const ATTACHMENT_AUDIO_FOLDER = 'Sound';

// Пуснатото аудио: { tile, audio, url, prevState }. Едно за цялото приложение.
let attachmentAudio = null;
// Искането, което още се тегли: { tile, cancelled }. Втори клик го отменя, вместо да пусне второ.
let attachmentAudioPending = null;

/**
 * Токен за теглене на самия файл от Drive (не thumbnail).
 * Същата проверка като в прегледа (loadMedia): липсващ или изтекъл токен се обновява през
 * checkAuth. Изнесена е отделно, за да не се пипа прегледът, който работи.
 * @returns {Promise<string|null>} Токенът или null, ако го няма.
 */
async function driveMediaToken() {
    if (typeof gapi === 'undefined' || typeof gapi.client === 'undefined') {
        await loadGoogleApis();
    }
    let isTokenExpired = true;
    if (authToken && authToken.issued_at) {
        const elapsedSeconds = (Date.now() - authToken.issued_at) / 1000;
        if (elapsedSeconds < ((authToken.expires_in || 3599) - 300)) isTokenExpired = false;
    }
    if (!authToken || isTokenExpired) {
        const newToken = await checkAuth();
        // checkAuth връща обвивка { pass, tokenData }: в authToken стои само tokenData, иначе
        // заявката тръгва с 'Bearer undefined' и Drive отговаря с 401.
        const newTokenData = newToken && (newToken.tokenData || (newToken.access_token ? newToken : null));
        if (newTokenData) {
            authToken = newTokenData;
            if (gapi.client) gapi.client.setToken({ access_token: authToken.access_token });
        }
    }
    const tokenObj = (typeof authToken !== 'undefined' && authToken)
        ? authToken
        : (gapi.auth && typeof gapi.auth.getToken === 'function' ? gapi.auth.getToken() : null);
    return tokenObj && tokenObj.access_token ? tokenObj.access_token : null;
}

/**
 * Blob URL на звуковия файл - по същите три пътя, по които го чете и прегледът: Drive по
 * attachment.pathGD, локалната папка през Sound/, архивът плоско по име. Нищо не се строи на
 * екрана, затова и не се преизползва кешът на миниатюрите: ключът там е по име на файл, а тук
 * файлът може да е по id.
 * @returns {Promise<string|null>} Blob URL или null, ако файлът липсва или не е достъпен.
 */
async function attachmentAudioBlobUrl(attachment, fileName, mode) {
    if (mode === 'gdrive') {
        const fileId = String(attachment.pathGD || attachment.path || '');
        if (!fileId) return null;
        const token = await driveMediaToken();
        if (!token) return null;
        // Без Range, за разлика от прегледа: там 'bytes=0-10000000' реже дългия файл и звукът
        // спира по средата, без нищо да каже. Тук файлът се тегли цял - това е единственият
        // начин записът да се чуе до края.
        const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!response.ok) return null;
        return URL.createObjectURL(await response.blob());
    }
    if (!fileName) return null;
    const handle = await ensureInlineDirHandle(mode);
    if (!handle) return null;
    const fileHandle = mode === 'local'
        ? await (await handle.getDirectoryHandle(ATTACHMENT_AUDIO_FOLDER, { create: false })).getFileHandle(fileName)
        : await handle.getFileHandle(fileName);
    const file = await fileHandle.getFile();
    return URL.createObjectURL(file);
}

/**
 * Спира звука от плочката и връща плочката в неутрално състояние.
 * Безопасна е по всяко време: няма пуснато аудио - не прави нищо. Вика се и при затваряне на
 * модала, и при смяна на бележката, иначе звукът продължава да свири след затворен viewer.
 */
function stopAttachmentAudio() {
    // Теглене, което още не е стигнало до звук, се отменя: иначе файлът пристига след затворен
    // модал и тръгва сам.
    if (attachmentAudioPending) {
        const loadingTile = attachmentAudioPending.tile;
        attachmentAudioPending.cancelled = true;
        attachmentAudioPending = null;
        if (loadingTile) {
            loadingTile.classList.remove('is-loading');
            if (loadingTile.dataset.state === 'loading') loadingTile.dataset.state = 'plain';
        }
    }
    const state = attachmentAudio;
    attachmentAudio = null;
    if (!state) return;
    const { tile, audio, url, prevState } = state;
    try { audio.pause(); } catch (e) { /* вече е спряно - няма какво да се прави */ }
    audio.removeAttribute('src');
    if (audio.parentNode) audio.parentNode.removeChild(audio);
    if (url) URL.revokeObjectURL(url);
    if (tile) {
        tile.classList.remove('is-playing', 'is-loading');
        tile.removeAttribute('aria-pressed');
        // Липсващият файл си остава пунктиран - състоянието се връща каквото е било.
        tile.dataset.state = prevState || 'plain';
    }
}

/**
 * Клик на аудио плочка: пуска я на място, ако още не свири, и я спира, ако свири тя.
 * Друга плочка, която свири или се тегли, се спира преди тази - чува се само едно.
 * @param {HTMLElement} tile - Плочката, по която е кликнато.
 * @param {object} attachment - Прикаченият файл (type=2).
 */
async function toggleAttachmentAudio(tile, attachment) {
    if (!tile) return;
    // Втори клик по същата плочка е „стоп": или спира звука, или отказва чакането.
    if (attachmentAudio && attachmentAudio.tile === tile) { stopAttachmentAudio(); return; }
    if (attachmentAudioPending && attachmentAudioPending.tile === tile) { stopAttachmentAudio(); return; }
    // Клик по друга плочка сменя звука, не добавя втори.
    stopAttachmentAudio();

    const path = String(attachment.path || '');
    const fileName = path ? path.split('/').pop() : '';
    // Липсващ файл (няма нито име, нито id в Drive) не пуска нищо.
    if (!fileName && !attachment.pathGD) return;

    const pending = { tile, cancelled: false };
    attachmentAudioPending = pending;
    const prevState = tile.dataset.state;
    tile.classList.add('is-loading');
    tile.dataset.state = 'loading';
    let url = null;
    try {
        const mode = await inlineImageSourceMode();
        url = await attachmentAudioBlobUrl(attachment, fileName, mode);
        if (!url) throw new Error('звукът не е достъпен');
        // Докато файлът се тегли, бележката може да е сменена или модалът затворен.
        if (pending.cancelled || !tile.isConnected) { URL.revokeObjectURL(url); return; }
        const audio = document.createElement('audio');
        audio.controls = false;
        audio.hidden = true;
        // Скрит нарочно: звукът излиза от плочката, а не от плеър в бележката.
        audio.style.display = 'none';
        audio.preload = 'auto';
        // Атрибутът е за проверката - по него се намира пуснатият звук в страницата.
        audio.dataset.nmAttachAudio = '1';
        audio.src = url;
        // Свърши ли файлът, плочката не остава завинаги в „свири".
        audio.addEventListener('ended', () => {
            if (attachmentAudio && attachmentAudio.audio === audio) stopAttachmentAudio();
        });
        document.body.appendChild(audio);
        attachmentAudio = { tile, audio, url, prevState };
        tile.classList.remove('is-loading');
        tile.classList.add('is-playing');
        tile.dataset.state = 'playing';
        tile.setAttribute('aria-pressed', 'true');
        audio.play().catch(err => {
            // AbortError значи, че потребителят вече е спрял - това не е провал.
            if (err && err.name === 'AbortError') return;
            if (attachmentAudio && attachmentAudio.audio === audio) stopAttachmentAudio();
            showToast(_('noSoundPreview'));
        });
    } catch (e) {
        if (url) URL.revokeObjectURL(url);
        tile.classList.remove('is-loading');
        if (tile.dataset.state === 'loading') tile.dataset.state = prevState || 'plain';
        showToast(_('noSoundPreview'));
    } finally {
        if (attachmentAudioPending === pending) attachmentAudioPending = null;
    }
}

/**
 * Плочка в лентата с прикачени файлове във viewer-а (модала).
 * Плочката НЕ отваря файла сама: тя натиска съществуващия линк от футъра, който
 * handleAttachment / handleGoogleDriveAttachment вече е построил, за да остане отварянето точно
 * такова, каквото беше при клик върху името (преглед при Drive за снимка/видео/звук, файл в нов
 * раздел при локална папка и архив, картата при type=5).
 * Ctrl+клик показва JSON записа на прикачения файл - същото, което правеше иконата в debug режим,
 * но винаги, защото в лентата отделна икона вече няма.
 * @param {object} attachment - Обектът на прикачения файл.
 * @param {HTMLElement} attachmentWrapper - Готовият ред на футъра (икона + линк) - остава скрит.
 * @param {object} iconData - SVG иконата за типа на файла.
 * @param {HTMLElement} slot - Мястото в лентата, в което влиза плочката (по ред на файловете).
 */
function buildAttachmentTile(attachment, attachmentWrapper, iconData, slot) {
    const path = String(attachment.path || '');
    const fileName = path ? path.split('/').pop() : '';
    // type=5 (място) не е файл: "lat|lng|label", името за подсказката е етикетът.
    const label = attachment.type === 5 ? (path.split('|')[2] || '') : fileName;
    const hint = attachment.description ? `${label} — ${attachment.description}` : label;

    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'nm-attach-tile';
    tile.dataset.type = String(attachment.type);
    tile.dataset.state = path ? 'plain' : 'missing';
    if (hint) {
        // Името не стои под плочката (както в оригинала), но остава достъпно: при задържане и за
        // екранните четци.
        tile.title = hint;
        tile.setAttribute('aria-label', hint);
    }
    // Вторият ред (дата, час, размер) се дописва, когато метаданните пристигнат - плочката не чака.
    // type=5 е място, не файл: там подсказката си остава един ред.
    if (hint && attachment.type !== 5) fillAttachmentTileMeta(tile, attachment, fileName, hint);

    const icon = document.createElement('span');
    icon.className = 'nm-attach-tile-icon';
    icon.innerHTML = iconData.svg;
    tile.appendChild(icon);

    // PDF-ът е червена плочка с "PDF", както в оригиналното приложение.
    if (/\.pdf$/i.test(fileName)) {
        tile.classList.add('is-pdf');
        const tag = document.createElement('span');
        tag.className = 'nm-attach-tile-tag';
        tag.textContent = 'PDF';
        tile.appendChild(tag);
    }

    // Снимката показва себе си, всичко останало - иконата на типа. Файл, който липсва (няма
    // път), си остава плочка с иконата и пунктир.
    if (attachment.type === 1 && fileName) {
        const photo = document.createElement('span');
        photo.className = 'nm-attach-tile-photo is-loading';
        tile.classList.add('has-photo');
        tile.insertBefore(photo, icon);
        fillAttachmentThumb(photo, tile, fileName, attachment);
    } else if (!path) {
        tile.classList.add('is-missing');
    }

    // Кликът: съществуващият линк върши истинската работа, плочката само го натиска.
    // Във viewer-а линкът винаги е <a> (isForModal), затова го търсим директно.
    const sourceLink = attachmentWrapper.querySelector('a');
    const showAttachmentJson = () => showModal(JSON.stringify(attachment, null, 2));
    const openSource = () => { if (sourceLink) sourceLink.click(); };
    // Звукът не отваря нищо: нито черното поле в бележката, нито нов раздел - свири от плочката.
    const isAudioTile = attachment.type === 2;
    // Видеото има собствен звук, затова кликът му спира пуснатото от плочката аудио - иначе двете
    // се чуват едно върху друго.
    const isVideoTile = attachment.type === 4;

    // Плочката е <button>, значи Enter и Space идват като click - клавиатурата работи като мишката.
    tile.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) { showAttachmentJson(); return; }
        if (isAudioTile) { toggleAttachmentAudio(tile, attachment); return; }
        if (isVideoTile) stopAttachmentAudio();
        openSource();
    });
    // На macOS Ctrl+клик идва като contextmenu, не като click - иначе там би се отворил файлът.
    tile.addEventListener('contextmenu', (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        e.stopPropagation();
        showAttachmentJson();
    });

    attachmentWrapper.classList.add('nm-attach-source');
    // Редът има inline display от строежа си (за борда е нужно), затова тук се скрива със inline
    // style - иначе остава видим и имената пак излизат под плочките.
    attachmentWrapper.style.display = 'none';
    if (slot) slot.append(tile, attachmentWrapper);
    return tile;
}

/**
 * Обработва и създава UI за прикачен файл от локална папка.
 * @param {object} attachment - Обектът на прикачения файл.
 * @param {HTMLElement} attachmentWrapper - Елементът, в който да се добави UI.
 * @param {object} iconData - SVG иконата за типа на файла.
 */
async function handleAttachment(attachment, attachmentWrapper, iconData, mode = 'local', isForModal = false) {
    const iconDiv = document.createElement('div');
    iconDiv.innerHTML = iconData.svg;
    const filename = attachment.path ? attachment.path.split('/').pop() : '';
    const archiveFolderName = dirHandle.name;
    const createLink = async (folderName, textPrefix) => {
        const oneTapLinksEnabled = localStorage.getItem('oneTapLink') !== 'false';
        if (!isForModal && !oneTapLinksEnabled) { // Създаваме неактивен span, САМО ако не сме в модал И опцията е изключена
            const span = document.createElement('span');
            span.textContent = textPrefix + (mode === 'local' ? filename : attachment.path);
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
            showModal(JSON.stringify(attachment, null, 2));
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
        iconDiv.addEventListener('click', (e) => { e.stopPropagation(); showModal(JSON.stringify(attachment, null, 2)); });
        attachmentWrapper.prepend(iconDiv);
        return;
    }
    const filename = attachment.path.split('/').pop();
    const fileId = attachment.pathGD; // Вече имаме fileId директно в attachment обекта.
    // Оптимизация: Премахваме API заявката оттук и я местим в onclick събитието.
    const setupLink = (folderName, textPrefix) => {
        const oneTapLinksEnabled = localStorage.getItem('oneTapLink') !== 'false';
        let linkElement;
        if (!isForModal && !oneTapLinksEnabled) { // Създаваме неактивен span, САМО ако не сме в модал И опцията е изключена
            linkElement = document.createElement('span');
            linkElement.textContent = textPrefix + filename;
            return linkElement; // Връщаме span елемента
        }
        linkElement = document.createElement('a');
        linkElement.href = '#'; // href вече не сочи директно към файла.
        linkElement.textContent = textPrefix + filename;
        linkElement.dataset.folderName = folderName; // Запазваме името на папката в data атрибут.
        linkElement.dataset.fileName = filename;     // Запазваме името на файла в data атрибут.
        linkElement.title = _('openFromDriveTooltip').replace('{fileName}', filename);
        linkElement.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Authentication is handled inside showInNotePreview -> loadMedia, or locally for other files
            // --- IMPROVED ATTACHMENT OPENING (Avoid Account Prompt) ---
            if (fileId) {
                // For media (Images, Sound, Video), use internal authenticated viewer
                if (attachment.type === 1 || attachment.type === 2 || attachment.type === 4) {
                    let targetEl = linkElement.closest('.note') || document.getElementById('modal-body') || document.body;
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

// =================================================================================
// Часовник, седмичен мини календар и закачане на бележка (порт от клон cx-notes)
// =================================================================================
// Трите поведения живеят в хедъра на бележката: клик на часа показва аналогов
// часовник в бележката, клик на датата - седмичен мини календар, а до тях има
// бутонче за закачане, което вдига бележката най-отпред на борда.
const pinIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2.4" stroke="currentColor" fill="none"><circle class="pin-dot" cx="12" cy="12" r="7"></circle></svg>`;

// Цвят, записан като цяло число (0xAARRGGBB), се показва като hex.
function colorIntToHex(intVal) {
    if (typeof intVal !== 'number') return intVal;
    return '#' + (intVal >>> 0).toString(16).slice(-6).toUpperCase();
}

// Цветът на бележката за CSS: индекс в палитрата, цяло число или готов низ.
function getNoteColorCss(color, fallback = noteColorMap[0]) {
    if (typeof color === 'number') {
        return color >= 0 && color < noteColorMap.length
            ? noteColorMap[color]
            : (color < 0 ? colorIntToHex(color) : fallback);
    }
    return typeof color === 'string' ? color : fallback;
}

// Моментът, който хедърът показва и по който се отваря календарът: напомняне (timer),
// календарна дата, дата на промяна, дата на създаване - в този ред.
function getNoteHeaderDateTimestamp(noteData) {
    const timer = Number(noteData?.timer || 0);
    if (timer) {
        const timerDate = new Date(timer);
        const isAutoCalendarTimer = timerDate.getHours() === 0 && timerDate.getMinutes() === 0 && timerDate.getSeconds() === 33;
        if (!isAutoCalendarTimer) return timer;
    }
    if (Number(noteData?.calendarDate) > 0) return Number(noteData.calendarDate);
    if (Number(noteData?.datemod) > 0) return Number(noteData.datemod);
    return Number(noteData?.date) || 0;
}

// Аналоговият часовник в бележката: дванадесетте чертички по циферблата и трите
// стрелки, които се местят всяка секунда. Спира сам, когато бележката бъде
// пре-рендерирана (елементът вече не е в страницата).
function startNoteClock(clockElement) {
    if (!clockElement) return null;
    const hourHand = clockElement.querySelector('.hour');
    const minuteHand = clockElement.querySelector('.minute');
    const secondHand = clockElement.querySelector('.second');

    for (let i = 0; i < 12; i++) {
        if (i % 3 === 0) continue; // 12, 3, 6 и 9 са цифри, не чертички
        const mark = document.createElement('div');
        mark.className = 'mark';
        mark.style.transform = `translateX(-50%) rotate(${i * 30}deg)`;
        clockElement.appendChild(mark);
    }

    const updateClock = () => {
        if (!clockElement.isConnected) {
            clearInterval(clockElement._clockInterval);
            clockElement._clockInterval = null;
            return;
        }
        const now = new Date();
        const s = now.getSeconds();
        const m = now.getMinutes();
        const h = now.getHours();
        if (hourHand) hourHand.style.transform = `translate(-50%, -100%) rotate(${(h % 12) * 30 + m * 0.5}deg)`;
        if (minuteHand) minuteHand.style.transform = `translate(-50%, -100%) rotate(${m * 6 + s * 0.1}deg)`;
        if (secondHand) secondHand.style.transform = `translate(-50%, -100%) rotate(${s * 6}deg)`;
    };
    updateClock();
    clockElement._clockInterval = setInterval(updateClock, 1000);
    return clockElement._clockInterval;
}

// Седмичен мини календар върху бележката: 7 реда (по един на ден), стрелки за
// предишна/следваща седмица, бутон за текущата седмица и по една цветна точка за
// всяка бележка с календарна дата в този ден. Точката отваря бележката в модала.
function showNoteWeekCalendar(noteElement, anchorDateTimestamp) {
    if (!noteElement || !anchorDateTimestamp) return;

    const existingCalendar = noteElement.querySelector('.note-week-calendar');
    if (existingCalendar) {
        existingCalendar.remove();
        return;
    }
    document.querySelectorAll('.note-week-calendar').forEach(calendar => calendar.remove());

    const anchorDate = new Date(anchorDateTimestamp);
    if (Number.isNaN(anchorDate.getTime())) return;
    anchorDate.setHours(0, 0, 0, 0);
    const weekStart = new Date(anchorDate);
    weekStart.setDate(anchorDate.getDate() - ((anchorDate.getDay() + 6) % 7)); // понеделник

    const notesByDay = new Map();
    allNotesData.forEach(noteData => {
        if (!noteData.calendarDate || noteData.status === 1) return;
        const noteDate = new Date(noteData.calendarDate);
        if (Number.isNaN(noteDate.getTime())) return;
        noteDate.setHours(0, 0, 0, 0);
        const key = noteDate.getTime();
        if (!notesByDay.has(key)) notesByDay.set(key, []);
        notesByDay.get(key).push(noteData);
    });

    const calendar = document.createElement('div');
    calendar.className = 'note-week-calendar';
    calendar.setAttribute('role', 'dialog');
    calendar.setAttribute('aria-label', _('weeklyCalendar') || 'Weekly calendar');
    calendar.addEventListener('click', event => event.stopPropagation());
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const renderWeek = (startDate) => {
        calendar.replaceChildren();
        const header = document.createElement('div');
        header.className = 'note-week-calendar-header';

        const previousWeek = document.createElement('button');
        previousWeek.type = 'button';
        previousWeek.className = 'note-week-nav';
        previousWeek.textContent = '‹';
        previousWeek.title = _('previousWeek') || 'Previous week';
        previousWeek.addEventListener('click', event => {
            event.stopPropagation();
            const previousStart = new Date(startDate);
            previousStart.setDate(startDate.getDate() - 7);
            renderWeek(previousStart);
        });

        const weekTitle = document.createElement('div');
        weekTitle.className = 'note-week-title';
        const weekEnd = new Date(startDate);
        weekEnd.setDate(startDate.getDate() + 6);
        weekTitle.textContent = `${formatDate(startDate)} – ${formatDate(weekEnd)}`;

        const nextWeek = document.createElement('button');
        nextWeek.type = 'button';
        nextWeek.className = 'note-week-nav';
        nextWeek.textContent = '›';
        nextWeek.title = _('nextWeek') || 'Next week';
        nextWeek.addEventListener('click', event => {
            event.stopPropagation();
            const nextStart = new Date(startDate);
            nextStart.setDate(startDate.getDate() + 7);
            renderWeek(nextStart);
        });

        const currentWeek = document.createElement('button');
        currentWeek.type = 'button';
        currentWeek.className = 'note-week-today';
        currentWeek.innerHTML = calendarIconSvg;
        currentWeek.title = _('today') || 'Today';
        currentWeek.setAttribute('aria-label', currentWeek.title);
        currentWeek.addEventListener('click', event => {
            event.stopPropagation();
            const currentWeekStart = new Date(today);
            currentWeekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
            renderWeek(currentWeekStart);
        });

        const closeHint = document.createElement('span');
        closeHint.className = 'note-week-close-hint';
        closeHint.innerHTML = closeIconSvg;
        closeHint.title = 'Close';
        closeHint.setAttribute('aria-hidden', 'true');

        header.append(previousWeek, weekTitle, currentWeek, closeHint, nextWeek);
        header.addEventListener('click', event => {
            if (!event.target.closest('.note-week-nav, .note-week-today')) {
                event.stopPropagation();
                calendar.remove();
            }
        });
        calendar.appendChild(header);

        const days = document.createElement('div');
        days.className = 'note-week-days';
        for (let index = 0; index < 7; index++) {
            const day = new Date(startDate);
            day.setDate(startDate.getDate() + index);
            const dayCell = document.createElement('div');
            dayCell.className = 'note-week-day';
            if (day.getTime() === anchorDate.getTime()) dayCell.classList.add('is-selected');
            if (day.getTime() === today.getTime()) dayCell.classList.add('is-today');

            const weekdayInitial = day.toLocaleDateString(currentLang, { weekday: 'short' }).trim().charAt(0).toLocaleUpperCase(currentLang);
            const label = document.createElement('div');
            label.className = 'note-week-date-label';
            label.textContent = `${String(day.getDate()).padStart(2, '0')}.${weekdayInitial}`;
            dayCell.appendChild(label);

            const noteMarkers = document.createElement('div');
            noteMarkers.className = 'note-week-markers';
            (notesByDay.get(day.getTime()) || []).forEach(noteData => {
                const marker = document.createElement('button');
                marker.type = 'button';
                marker.className = 'note-week-marker';
                marker.style.backgroundColor = getNoteColorCss(noteData.color);
                marker.title = (noteData.notetxt || '').split('\n').find(line => line.trim())?.trim() || '...';
                marker.setAttribute('aria-label', marker.title);
                marker.addEventListener('click', event => {
                    event.stopPropagation();
                    showModal({
                        raw: noteData.notetxt || '',
                        format: noteData.text_span || '',
                        titleFormat: noteData.title_span || '',
                        color: getNoteColorCss(noteData.color),
                        boardId: noteData.boardid,
                        id: noteData.id,
                        gdid: noteData.gdid,
                        datemod: noteData.datemod,
                        originalNote: noteData
                    });
                });
                noteMarkers.appendChild(marker);
            });
            dayCell.appendChild(noteMarkers);
            days.appendChild(dayCell);
        }
        calendar.appendChild(days);
    };

    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
    renderWeek(currentWeekStart);
    noteElement.appendChild(calendar);
}

// Закачане/откачане на бележка. В main записът минава само през IndexedDB (GDrive и
// локалната папка са изключени навсякъде другаде), затова тук няма нови пътища за запис:
// вдигаме version, слагаме/махаме pinnedAt, пишем в базата и пре-рендерираме картата.
async function toggleNotePinned(noteData) {
    if (!noteData) return false;
    const target = allNotesData.find(n => (noteData.gdid && n.gdid == noteData.gdid) || (noteData.id && n.id == noteData.id)) || noteData;

    const wasPinned = Number(target.pinnedAt || 0) > 0;
    target.version = target.version ? parseInt(target.version, 10) + 1 : 1;
    if (wasPinned) delete target.pinnedAt;
    else target.pinnedAt = Date.now();
    target.datemod = Date.now();

    const oldNoteEl = (target.gdid ? document.querySelector(`.note[data-g="${target.gdid}"]`) : null)
        || (target.id ? document.querySelector(`.note[data-i="${target.id}"]`) : null);
    if (oldNoteEl) {
        const updatedEl = await createNoteElement(target);
        if (updatedEl) oldNoteEl.replaceWith(updatedEl);
    }

    try {
        const db = await openNotesDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(NOTE_STORE_NAME, 'readwrite');
            tx.objectStore(NOTE_STORE_NAME).put(target);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        });
    } catch (err) {
        console.error('Failed to save the pinned note:', err);
    }

    applyFilters();
    if (typeof updateReloadButtonState === 'function') updateReloadButtonState();
    showToast(wasPinned ? (_('noteUnpinned') || 'Note unpinned.') : (_('notePinned') || 'Note pinned.'), 2000);
    return true;
}

async function createNoteElement(noteContent) {
    const note = document.createElement('div');
    const notesBgrdEnabled = localStorage.getItem('notesBgrd') !== 'false';
    note.className = 'note';
    note.style.display = 'none'; // Default to hidden to prevent flicker during load/filter
    if (notesBgrdEnabled) {
        note.classList.add('note-item');
    }
    let fileContent = '';
    let noteGdid = null;
    let noteID = null;
    let noteColor = null;
    let textSpan = null;
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
            extraData = { ...noteContent };
            delete extraData.notetxt;
            // --- OPTIMIZATION: Use individual SHORT dataset attributes ---
            // data-g -> gdid, data-i -> id
            if (noteGdid) note.dataset.g = noteGdid;
            if (noteID) note.dataset.i = noteID;
            // data-pin -> pinnedAt: по-новата закачена бележка застава по-напред на борда.
            if (Number(extraData.pinnedAt || 0) > 0) {
                note.dataset.pin = extraData.pinnedAt;
                note.classList.add('note-pinned');
            } else {
                note.dataset.pin = '0';
            }
            // data-b -> boardid
            if (extraData.boardid !== undefined) note.dataset.b = extraData.boardid;
            // data-dm -> datemod
            if (extraData.datemod) note.dataset.dm = extraData.datemod;
            // data-no -> numord
            if (extraData.numord !== undefined) note.dataset.no = extraData.numord;
            // data-s -> status
            if (extraData.status !== undefined) note.dataset.s = extraData.status;
            // data-cd -> date (creation date)
            if (extraData.date) note.dataset.cd = extraData.date;
            // data-cda -> calendarDate
            if (extraData.calendarDate) note.dataset.cda = extraData.calendarDate;
            // data-c -> color
            if (noteColor !== null && noteColor !== undefined) note.dataset.c = noteColor;
            // --- Set attributes for special filters (SHORT CODES, "1" for true) ---
            if (extraData.timer && extraData.timer !== 0) {
                note.dataset.tm = '1'; // data-tm
            }
            // if (Object.keys(extraData).length > 0) note.dataset.extraInfo = JSON.stringify(extraData);
            if (noteColor && !isNaN(noteColor) && noteColor >= 0 && noteColor <= 9) {
                // Color will be handled by canvas background
            }
        } else { throw new Error(_('errorNoteFieldMissing')); }
    } catch (e) { fileContent = _('errorNoteParse'); }
    const isHiddenNote = extraData.pass === true;
    const isType1Note = extraData.type === 1;
    // let attachments = [];
    let noteTitle = '';
    let displayContent = fileContent;
    // Маркерите на type=8 не се показват и в заглавието на картата (то е суров текст).
    const titleText = stripInlineImageMarkers(fileContent, textSpan);
    if (isHiddenNote) {
        const pipeIndex = fileContent.indexOf('|');
        const previewContent = pipeIndex !== -1 ? fileContent.substring(0, pipeIndex) : '';
        noteTitle = stripInlineImageMarkers(previewContent, textSpan).split('\n')[0].trim();
    } else if (isType1Note) {
        const pipeIndex = fileContent.indexOf('|');
        if (pipeIndex !== -1) {
            noteTitle = titleText.substring(0, pipeIndex).trim();
            displayContent = fileContent.substring(pipeIndex + 1).trim();
        } else {
            noteTitle = titleText.split('\n')[0].substring(0, 50);
        }
    } else if (!isHiddenNote) {
        const lines = titleText.split('\n');
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
    titleEl.className = 'note-title-truncated';
    // Create header info container for date and time
    const headerInfoContainer = document.createElement('div');
    headerInfoContainer.className = 'note-header-info';
    const headerDate = document.createElement('span');
    headerDate.className = 'note-header-date';
    const headerTime = document.createElement('span');
    headerTime.className = 'note-header-time';
    // Иконата и текстът са отделни елементи. Настройката „Покажи дата на
    // промяна/календар“ скрива само ТЕКСТА, така че при скрита дата отляво остава
    // иконата на календара (отваря мини календара), а отдясно - иконата на часовника
    // и пин-бутонът, един до друг. Досега цялата дата се местеше наведнъж и с нея
    // изчезваха и часовникът, и достъпът до двата изгледа.
    const calendarIconEl = document.createElement('span');
    calendarIconEl.className = 'header-icon note-header-calendar-icon icon-only-when-hidden';
    calendarIconEl.innerHTML = calendarIconSvg;
    const clockIconEl = document.createElement('span');
    clockIconEl.className = 'header-icon note-header-clock-icon icon-only-when-hidden';
    clockIconEl.innerHTML = clockIconSvg;
    const dateTextEl = document.createElement('span');
    dateTextEl.className = 'note-header-date-text';
    const timeTextEl = document.createElement('span');
    timeTextEl.className = 'note-header-time-text';
    headerDate.appendChild(calendarIconEl);
    headerDate.appendChild(dateTextEl);
    headerTime.appendChild(clockIconEl);
    headerTime.appendChild(timeTextEl);
    // Add click listener to the date to show full note data
    // Обикновеният клик отваря седмичния мини календар. В debug режим Ctrl+клик
    // показва суровите данни - същият жест, с който debug показва JSON и другаде.
    // (Поръчката беше календарът да е в „нормалния случай", но `debug` в main е
    // винаги true, така че такова условие би оставило календара недостъпен.)
    headerDate.addEventListener('click', (e) => {
        e.stopPropagation();
        if (debug && e.ctrlKey) {
            showModal({ raw: JSON.stringify(fullNoteContent, null, 2), color: 'white' });
            return;
        }
        showNoteWeekCalendar(note, getNoteHeaderDateTimestamp(extraData));
    });

    // Какво показва хедърът: напомняне, календарна дата или дата на създаване - в този ред.
    // Иконата на календара се вижда в нормалния хедър там, където бележката има календарна
    // дата или напомняне (както досега), а при скрита дата остава сама отляво. Иконата на
    // часовника се вижда в нормалния хедър само при наличен час; при скрита дата остава
    // до пин-бутона, за да е достъпен аналоговият часовник.
    const headerTimestamp = getNoteHeaderDateTimestamp(extraData);
    if (headerTimestamp) calendarIconEl.classList.add('has-header-value');
    if (extraData.timer) {
        const dateText = formatDate(extraData.timer);
        if (dateText) {
            dateTextEl.textContent = dateText;
            calendarIconEl.classList.remove('icon-only-when-hidden');
        }
        const timeText = formatTime(extraData.timer);
        if (timeText) {
            timeTextEl.textContent = timeText;
            clockIconEl.classList.add('has-header-value');
            clockIconEl.classList.remove('icon-only-when-hidden');
        }
    } else if (extraData.calendarDate) {
        const dateText = formatDate(extraData.calendarDate);
        if (dateText) {
            dateTextEl.textContent = dateText;
            calendarIconEl.classList.remove('icon-only-when-hidden');
            // Има дата, но няма час: часовникът се появява само при скрита дата.
            clockIconEl.classList.add('has-header-value');
        }
    } else if (extraData.date) { // Fallback to creation date
        const dateText = formatDate(extraData.date);
        if (dateText) {
            dateTextEl.textContent = dateText; // No icon for datemod
            dateTextEl.classList.add('creation-header-date');
            const timeText = formatTime(extraData.date);
            if (timeText) {
                timeTextEl.textContent = timeText;
                clockIconEl.classList.add('has-header-value');
                clockIconEl.classList.remove('icon-only-when-hidden');
            }
        }
    }
    // Клик на часа: аналогов часовник в бележката. Клик върху циферблата връща оригинала.
    // Часовникът работи и върху бележка с текст - оригиналът се пази и се връща обратно.
    headerTime.style.cursor = 'pointer';
    headerTime.addEventListener('click', (e) => {
        e.stopPropagation();
        const originalContent = contentEl.innerHTML;
        const clockId = `clock-${noteGdid || noteID || 'note'}`;

        // Скриваме заглавния ред, за да има място за циферблата.
        titleWrapper.style.display = 'none';
        contentEl.style.display = 'flex';
        contentEl.style.justifyContent = 'center';
        contentEl.style.alignItems = 'center';
        contentEl.style.paddingTop = '35px';
        contentEl.style.height = '80%';
        contentEl.innerHTML = `
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

        const clockElement = contentEl.querySelector(`#${clockId}`);
        if (!clockElement) return;

        clockElement.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (clockElement._clockInterval) clearInterval(clockElement._clockInterval);
            clockElement._clockInterval = null;
            titleWrapper.style.display = '';
            contentEl.style.display = '';
            contentEl.style.justifyContent = '';
            contentEl.style.alignItems = '';
            contentEl.style.paddingTop = '';
            contentEl.style.height = '';
            contentEl.innerHTML = originalContent;
        });

        startNoteClock(clockElement);
    });
    headerInfoContainer.appendChild(headerDate);
    headerInfoContainer.appendChild(headerTime);
    // Закачане: бележката получава червен контур и застава най-отпред на борда.
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
        await toggleNotePinned(noteContent);
    });
    headerInfoContainer.appendChild(pinBtn);
    // Add the new container before the title
    titleWrapper.appendChild(headerInfoContainer);
    titleWrapper.appendChild(titleEl);
    // Use the color map for reliability and define a clear fallback color
    const noteBgColor = (noteColor !== null && noteColor >= 0 && noteColor <= 9)
        ? noteColorMap[noteColor]
        : '#FBFF86';

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
            note.style.backgroundColor = noteBgColor;
            createColoredNoteBackground(noteBgColor, imageName, 250, 250).then(canvas => {
                const dataUrl = `url(${canvas.toDataURL()})`;
                noteBgCache.set(cacheKey, dataUrl);
                note.style.backgroundImage = dataUrl;
                note.style.backgroundColor = 'transparent';
                note.style.backgroundSize = '100% 100%';
                note.style.backgroundRepeat = 'no-repeat';
            }).catch(() => {
                note.style.backgroundColor = noteBgColor;
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
    if (isHiddenNote) {
        const pipeIndex = fileContent.indexOf('|');
        const previewContent = pipeIndex !== -1 ? fileContent.substring(0, pipeIndex) : ''; // КОРЕКЦИЯ: Използваме processNoteContent, за да се съобрази с настройката за линкове
        contentEl.innerHTML = processNoteContent(previewContent, isForModal); // isForModal е false за бележките на борда
        hydrateInlineImages(contentEl);
    } else {
        const formatSource = (textSpan && textSpan.trim() !== '') ? textSpan : null;
        if (formatSource) {
            // Use the exact same logic as in showModal to ensure indices match
            let contentToFormat = fileContent;
            if (contentToFormat.includes('|')) {
                contentToFormat = contentToFormat.replace('|', '\n');
            }
            // Format the full content
            let formattedHtml = formatText(contentToFormat, formatSource, isForModal);
            contentEl.innerHTML = formattedHtml;
            hydrateInlineImages(contentEl); // вградените картинки (type=8) влизат в рамките си
        } else {
            contentEl.innerHTML = processNoteContent(displayContent, isForModal);
        }
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
    const handleNoteClick = (e) => {
        const selection = window.getSelection();
        if (selection.toString().length > 0) return;
        // От 26.10.2026 кликът във футъра (.note-footer) също отваря бележката: карта, запълнена
        // изцяло от вложена снимка, няма празно място за докосване. Иконите за снимка и видео във
        // футъра продължават да отварят своето превю — addInNotePreviewListener спира събитието.
        if (!isLongPress) {
            const noteBgColor = (noteColor !== null && noteColor >= 0 && noteColor <= 9) ? noteColorMap[noteColor] : noteColorMap[0];
            showModal({ raw: fileContent, format: textSpan, color: noteBgColor, boardId: extraData.boardid, id: noteID, gdid: noteGdid }, note);
        }
    };
    // JSON-ът на бележката, като в uni (b2.97+). Обикновен клик в празното на горната
    // ивица (над заглавието), за да работи и с пръст на телефон, където Ctrl няма.
    // Датата, часът и пин-бутонът имат собствени обработчици и спират събитието по-рано.
    const showNoteDebugJson = () => {
        showModal({ raw: JSON.stringify(fullNoteContent, null, 2), color: 'white' });
    };
    const handleHeaderClick = (e) => {
        const onTitleText = !!(e.target && e.target.closest && e.target.closest('.note-title-truncated'));
        if (!onTitleText) {
            if (!debug) return; // без Debug кликът стига до бележката както досега
            e.stopPropagation();
            e.preventDefault();
            showNoteDebugJson();
            return;
        }
        if (e.ctrlKey) handleNoteDelete(note, e);
    };
    titleWrapper.addEventListener('click', handleHeaderClick);
    addLongPressOrCtrlClick(titleWrapper, (e) => handleNoteDelete(note, e));

    // Закачаме събитието за отваряне на модала за цялата бележка
    note.addEventListener('click', handleNoteClick);
    note.addEventListener('contextmenu', e => e.preventDefault());
    contentWrapper.appendChild(titleWrapper);
    contentWrapper.appendChild(contentEl);
    // --- Създаване на футър с икони за прикачени файлове ---
    if (!isHiddenNote && (noteGdid || noteID)) {
        if (extraData.status === 1 || attachments.length > 0) {
            const footerEl = document.createElement('div');
            footerEl.className = 'note-footer';
            if (extraData.status === 1) {
                const restoreBtn = document.createElement('div');
                restoreBtn.className = 'footer-icon restore-btn';
                restoreBtn.innerHTML = restoreIconSvg;
                restoreBtn.title = _('restoreNote') || "Restore note";
                restoreBtn.style.borderRadius = '5px';
                restoreBtn.style.backgroundColor = 'rgba(255,255,255,0.7)';
                restoreBtn.style.padding = '2px';
                restoreBtn.onclick = async (e) => {
                    e.stopPropagation();
                    try {
                        noteContent.status = 0;
                        noteContent.datemod = Date.now();
                        note.dataset.s = '0';
                        note.dataset.dm = noteContent.datemod;
                        const db = await openNotesDB();
                        await new Promise((resolve, reject) => {
                            const tx = db.transaction(NOTE_STORE_NAME, 'readwrite');
                            tx.objectStore(NOTE_STORE_NAME).put(noteContent);
                            tx.oncomplete = () => resolve();
                            tx.onerror = () => reject(tx.error);
                        });
                        if (localStorage.getItem('updateGDrive') === 'true') { // && !isOffline
                            // await updateGDriveFile(noteGdid, JSON.stringify(noteContent));
                        }
                        showToast(_('noteRestoredSuccess') || "Note successfully restored.", 3000);
                        renderUI({ boardParseError: false, rerenderOnlyMenu: true });
                        applyFilters();
                    } catch (err) {
                        console.error("Failed to restore note:", err);
                    }
                };
                footerEl.appendChild(restoreBtn);
            }
            if (attachments.length > 0) {
                const uniqueTypes = [...new Set(attachments.map(att => att.type))];
                if (uniqueTypes.includes(1)) note.dataset.hp = '1';
                if (uniqueTypes.includes(4)) note.dataset.hv = '1';
                if (uniqueTypes.includes(2)) note.dataset.hs = '1';
                if (uniqueTypes.includes(3)) note.dataset.ho = '1';
                uniqueTypes.sort((a, b) => a - b).forEach(type => {
                    const iconData = attachmentIcons.find(icon => icon.type === type);
                    if (iconData) {
                        const iconDiv = document.createElement('div');
                        iconDiv.className = 'footer-icon';
                        iconDiv.innerHTML = iconData.svg;
                        iconDiv.style.borderRadius = '5px';
                        iconDiv.style.backgroundColor = noteBgColor;
                        iconDiv.dataset.type = type;
                        const typeCount = attachments.filter(att => att.type === type).length;
                        if (typeCount > 1) {
                            const plusSpan = document.createElement('span');
                            plusSpan.textContent = '+';
                            plusSpan.style.marginLeft = '2px';
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
                                else if (useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb) {
                                    if (dbSourceGlobal === 3) sourceMode = 'archive';
                                    else if (dbSourceGlobal === 2) sourceMode = 'local';
                                }
                                if (sourceMode === 'gdrive' || sourceMode === 'local' || sourceMode === 'archive') {
                                    const attachmentsOfType = attachments.filter(att => att.type === type);
                                    const isVideo = type === 4;
                                    addInNotePreviewListener(iconDiv, attachmentsOfType, 0, sourceMode, isVideo);
                                }
                            }
                        }
                        footerEl.appendChild(iconDiv);
                    }
                });
            }
            note.appendChild(footerEl);
        }
    }
    return note;
}
async function renderUI({ boardParseError, rerenderOnlyMenu = false }) {
    // Изчистваме бележките само ако не презареждаме единствено менюто - ПРЕМЕСТЕНО ПО-ДОЛУ ЗА ИЗБЯГВАНЕ НА 'МИГАНЕ'
    /* if (!rerenderOnlyMenu) {
        notesContainer.innerHTML = '';
    } */
    let boardsNoteElement = null;
    if (boardsData.length > 0 || boardParseError) {
        const calculateCounters = () => {
            boardsData.forEach(board => {
                const isArh = useArhDb || (useIndexedDb && dbSourceGlobal === 3);
                const boardIdToMatch = String(isArh ? board.id : board.gdid);
                board.noteCount = allNotesData.filter(note => String(note.boardid) === boardIdToMatch && note.status !== 1).length;
            });
            boardsData.reminderNoteCount = allNotesData.filter(note => note.timer && note.timer > 0 && note.status !== 1).length;
            boardsData.calendarNoteCount = allNotesData.filter(note => note.calendarDate && note.status !== 1).length;
            boardsData.trashCount = allNotesData.filter(note => note.status === 1).length;
        };
        calculateCounters();
        boardsNoteElement = await createBoardsUI(boardsData, boardParseError);
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
                // Използваме съществуващата функция за маркуване
                document.querySelectorAll('.board-filter-link').forEach(link => {
                    const isSelected = link.dataset.boardid === String(currentBoardFilter);
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
        if (loaderText) loaderText.textContent = _('loadingFile');
    }
    // Method 1: Clear immediately to save memory
    if (!rerenderOnlyMenu) {
        notesContainer.innerHTML = '';
    }
    // 2. Use setTimeout to allow browser to render the spinner
    await new Promise(resolve => setTimeout(resolve, 50));

    // 2.1 Optimization: Preload backgrounds before creating elements to avoid staggered loading
    await preloadNoteBackgrounds(allNotesData);

    const noteElements = await Promise.all(allNotesData.map(noteData => createNoteElement(noteData)));
    // Create fragment and populate it with new elements
    const fragment = document.createDocumentFragment();
    let notesCount = 0;
    noteElements.forEach(noteEl => {
        if (noteEl) {
            fragment.appendChild(noteEl);
            notesCount++;
        }
    });
    // Update container
    if (!rerenderOnlyMenu) {
        // Скриваме контейнера преди добавяне, за да няма премигване с нефилтрирани бележки
        notesContainer.style.visibility = 'hidden';
        notesContainer.appendChild(fragment);
    }
    // Hide spinner
    if (!rerenderOnlyMenu && loaderContainer) {
        loaderContainer.style.display = 'none';
        if (loaderText) loaderText.textContent = '';
    }
    if (boardsNoteElement) {
        document.querySelector('header').appendChild(boardsNoteElement);
    }
    // --- OWNER CHECK ---
    // If the user is not the owner, force 'all' boards view instead of saved startup board.
    if (!isDbOwner) {
        currentBoardFilter = 'all';
    }
    // Обработка на стартов борд 'Main'
    if (currentBoardFilter === 'Main') {
        const mainBoard = boardsData.find(b => b.title === 'Main');
        currentBoardFilter = mainBoard ? (mainBoard.gdid || mainBoard.id) : 'all';
    }
    // Прилагаме филтъра и скролираме менюто само при първоначално зареждане.
    if (isInitialLoad) {
        // --- КОРЕКЦИЯ: Прилагаме филтъра ВЕДНАГА, за да няма премигване ---
        await filterNotesByBoard(currentBoardFilter, false);
        // Показваме контейнера чак след филтриране
        notesContainer.style.visibility = 'visible';
        // Скролираме менюто към стартовия борд с кратко забавяне (само визуално)
        setTimeout(() => {
            const startBoardBtn = document.querySelector(`.board-menu-container .board-filter-link[data-boardid="${currentBoardFilter}"]`);
            if (startBoardBtn) {
                startBoardBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                startBoardBtn.classList.add('selected-board', 'active');
                startBoardBtn.style.height = '39px';
            }
        }, 100);
        // Start Assistant Guide if needed
        if (guide) {
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
            // Delay slightly to ensure UI is ready
            setTimeout(startAssistantGuide, 1500);
        }
    } else {
        await filterNotesByBoard(currentBoardFilter, false);
        notesContainer.style.visibility = 'visible';
    }
    // След първото зареждане, флагът става false.
    isInitialLoad = false;
    // Броячът в хедъра НЕ се пипа тук: applyFilters() вече е сложил видимия брой за
    // стартовия борд. Ако го презапишем с notesCount (общия брой бележки), при зададена
    // стартова папка хедърът показва всички бележки, докато не се цъкне папката.
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
        validateFileData(boardsData, 'boards.bcp');
        console.log(`Успешно заредени ${boardsData.length} борда от boards.bcp.`);
        // 2. Четене на notes.bcp
        const notesFileHandle = await dirHandle.getFileHandle('notes.bcp');
        const notesFile = await notesFileHandle.getFile();
        const notesContent = await notesFile.text();
        const notesArray = JSON.parse(notesContent);
        allNotesData = notesArray;
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

async function loadCustomTranslation() {
    return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) {
                resolve(null);
                return;
            }
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const json = JSON.parse(event.target.result);
                    resolve(json);
                } catch (err) {
                    console.error("Invalid JSON:", err);
                    showToast(_('errorInvalidJson'), 5000);
                    resolve(null);
                }
            };
            reader.onerror = () => resolve(null);
            reader.readAsText(file);
        };
        input.click();
    });
}

async function loadTranslations(lang) {
    if (appTranslations[lang]) {
        // За 'xx' позволяваме презареждане на нов файл при всяко повикване, ако се поиска
        // Но за сега спазваме стандартната логика: ако има зареден, не правим нищо.
        return;
    }
    if (lang === 'xx') {
        const customJson = await loadCustomTranslation();
        if (customJson) {
            appTranslations[lang] = customJson;
        }
        return;
    }
    try {
        const response = await fetch(`lang/i18n-${lang}.json`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const text = await response.text();
        appTranslations[lang] = JSON.parse(text);
    } catch (e) {
        console.error("Failed to load translations:", e);
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
    document.querySelectorAll('[data-key]').forEach(element => {
        const key = element.getAttribute('data-key');
        element.innerHTML = _(key);
    });
    document.querySelectorAll('[data-key-placeholder]').forEach(element => {
        const key = element.getAttribute('data-key-placeholder');
        element.placeholder = _(key);
    });
    document.querySelectorAll('[data-key-title]').forEach(element => {
        const key = element.getAttribute('data-key-title');
        element.title = _(key);
    });
    // data-key-aria-label: името за екранен четец там, където бутонът няма текст (b1.11: „Ресет на
    // позиции/размери").
    document.querySelectorAll('[data-key-aria-label]').forEach(element => {
        const key = element.getAttribute('data-key-aria-label');
        element.setAttribute('aria-label', _(key));
    });
    // Update all language switchers in the UI
    renderLanguageSwitchers();
    // Check if updateSignoutTooltip exists before calling it
    if (typeof updateSignoutTooltip === 'function') {
        updateSignoutTooltip();
    }
    // Update KB Assistant Language
    if (window.kbAssistant && window.kbAssistant.updateLanguage) {
        window.kbAssistant.updateLanguage();
    }
}
function renderLanguageSwitchers() {
    const containers = document.querySelectorAll('.lang-switcher-container');
    containers.forEach(container => {
        container.innerHTML = '';
        const select = document.createElement('select');
        select.className = 'lang-select';
        SUPPORTED_LANGUAGES.forEach(lang => {
            const opt = document.createElement('option');
            opt.value = lang.id;
            opt.textContent = lang.label;
            if (currentLang === lang.id) opt.selected = true;
            select.appendChild(opt);
        });
        select.onchange = (e) => {
            setLanguage(e.target.value);
        };
        container.appendChild(select);
    });
}

// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            // КОРЕКЦИЯ: Изчистваме старите или дублиращи се Service Workers
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (let registration of registrations) {
                // Ако имаме множество регистрации, това може да причини забавяния (timeouts)
                if (registrations.length > 1 || !registration.active || !registration.active.scriptURL.includes('sw.js')) {
                    console.log('Unregistering stagnant/duplicate service worker:', registration.active?.scriptURL);
                    await registration.unregister();
                }
            }
            // Регистрираме версията с флаг, за да принудим браузъра да я презареди, версиите на sw и main трябва да съвпадат
            const registration = await navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(version)}`);

            if (debug) console.log('ServiceWorker registered with scope: ', registration.scope);

            // КОРЕКЦИЯ (b1.58): проверка за нов worker при всяко отваряне и при връщане към
            // приложението. На телефон PWA-та стои отворена със дни, а без това проверката
            // минава само при пълно стартиране и новата версия не се появява.
            const checkForUpdate = () => {
                if (!navigator.onLine) return;
                registration.update().catch((err) => console.log('[SW] update check failed:', err));
            };
            checkForUpdate();
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') checkForUpdate();
            });
            window.addEventListener('online', checkForUpdate);

            // Global set to track which SW versions we've already notified about
            window.swNotifiedWorkers = window.swNotifiedWorkers || new Set();

            // Function to show update notification as a persistent floating bar
            const showUpdateNotification = (waitingSW) => {
                if (!waitingSW) return;
                const swUrl = waitingSW.scriptURL;

                // КОРЕКЦИЯ (b1.58): известието вече не се пропуска, когато версията в URL-а
                // съвпада с version. Двата файла се вдигат заедно, но ако по някаква причина
                // не съвпадат, чакащият worker пак трябва да се покаже - иначе ъпдейтът
                // остава невидим, а старият style.css се сервира от кеша.
                if (swUrl !== (registration.active && registration.active.scriptURL)) {
                    console.log('[SW] Waiting worker:', swUrl);
                }

                // Don't show if already showed for THIS worker or if a refresh is already pending or if bar exists
                if (window.swNotifiedWorkers.has(swUrl) || document.getElementById('sw-update-bar') || sessionStorage.getItem('swUpdateRefreshPending')) return;
                window.swNotifiedWorkers.add(swUrl);

                // Create update notification bar
                const updateBar = document.createElement('div');
                updateBar.id = 'sw-update-bar';
                updateBar.style.cssText = `
                    position: fixed;
                    bottom: 10px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 12px 10px;
                    border-radius: 8px;
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
                textSpan.textContent = _('newVersionAvailable');

                const refreshBtn = document.createElement('button');
                refreshBtn.textContent = _('refreshNow');
                refreshBtn.style.cssText = `
                    background: white;
                    color: #667eea;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-weight: bold;
                    transition: transform 0.2s;
                `;
                refreshBtn.onmouseover = () => refreshBtn.style.transform = 'scale(1.05)';
                refreshBtn.onmouseout = () => refreshBtn.style.transform = 'scale(1)';
                refreshBtn.onclick = () => {
                    // Mark as pending refresh to avoid duplicate prompts in this session
                    sessionStorage.setItem('swUpdateRefreshPending', 'true');
                    // Forcing the assistant to show the update info after reload by removing seen version
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

            // Check if there's already a waiting SW
            if (registration.waiting) {
                showUpdateNotification(registration.waiting);
            }

            // Listen for new SW installing
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            // New SW is installed and waiting
                            showUpdateNotification(newWorker);
                        }
                    });
                }
            });

            // Reload when the new Service Worker takes control
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    // Clear the refresh flag once the new worker takes control
                    sessionStorage.removeItem('swUpdateRefreshPending');
                    // Use simple reload instead of handleSignoutClick to preserve session
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

document.addEventListener('touchstart', e => {
    // Ignore if multi-touch
    if (e.touches.length > 1) return;
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', e => {
    // Ignore if multi-touch
    if (e.changedTouches.length > 1) return;

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
async function showBoardReorderPopup() {
    let currentOrder = [];
    try {
        const raw = localStorage.getItem('boardMenuOrder');
        if (raw) currentOrder = JSON.parse(raw);
    } catch (e) { }
    if (!Array.isArray(currentOrder) || currentOrder.length === 0) {
        currentOrder = boardsData.filter(b => b.title).map(b => String(b.title));
    }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay reorder-overlay';
    overlay.style.cssText = 'display:flex;align-items:center;justify-content:center;z-index:1000;';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    const box = document.createElement('div');
    box.className = 'modal-content-box';
    box.style.cssText = "background-image:url('Frame.jpg');background-size:cover;border-radius:12px;padding:50px 20px 20px 20px;width:auto;min-width:300px;max-width:95vw;max-height:80vh;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,0.5);position:relative;";
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.className = 'modal-close';
    closeBtn.style.cssText = 'position:absolute;top:10px;right:10px;background:#d6d6d6;border:none;border-radius:6px;width:44px;height:32px;cursor:pointer;font-size:28px;display:flex;align-items:center;justify-content:center;color:#333;box-shadow:0 2px 5px rgba(0,0,0,0.2);';
    closeBtn.onclick = () => overlay.remove();
    box.appendChild(closeBtn);
    const title = document.createElement('h3');
    title.textContent = _('reorderBoards') || 'Reorder';
    title.setAttribute('data-key', 'reorderBoards');
    title.style.cssText = 'margin:0 0 15px 0;font-size:1.2em;color:#fff;text-shadow:1px 1px 3px rgba(0,0,0,0.8);text-align:center;';
    box.appendChild(title);
    const listContainer = document.createElement('div');
    listContainer.style.cssText = 'overflow-y:auto;flex:1;padding:4px;display:flex;flex-direction:column;align-items:center;width:100%;';
    let draggedItem = null;
    let placeholder = document.createElement('div');
    placeholder.style.cssText = `height:40px;width:${maxWidthForButtons}px;border:2px dashed #fff;border-radius:4px;margin-bottom:8px;background:rgba(255,255,255,0.2);`;
    currentOrder.forEach((boardTitle) => {
        const board = boardsData.find(b => String(b.title) === String(boardTitle));
        if (!board || !board.title) return;
        const item = document.createElement('div');
        item.className = 'board-filter-link reorder-item';
        item.dataset.boardtitle = String(boardTitle);
        item.draggable = true;
        item.style.width = `${maxWidthForButtons}px`;
        item.style.marginBottom = '8px';
        item.style.cursor = 'grab';
        item.style.flexShrink = '0';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'flex-start';
        item.style.padding = '0 10px';
        if (board.color !== undefined && !isNaN(board.color)) {
            if (board.color >= 0 && board.color <= 6) item.style.backgroundColor = `var(--board-bg-${board.color})`;
            else if (board.color < 0) item.style.backgroundColor = '#' + (board.color >>> 0).toString(16).slice(-6);
        }
        const grip = document.createElement('span');
        grip.innerHTML = '&#9776;';
        grip.style.cssText = 'margin-right:8px;font-size:16px;opacity:0.6;';
        item.appendChild(grip);
        const text = document.createElement('span');
        text.textContent = board.title;
        text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
        if (board.status === 1) {
            text.style.color = 'red';
        } else if (board.colorfont !== undefined && !isNaN(board.colorfont)) {
            if (board.colorfont < 0) text.style.color = '#' + (board.colorfont >>> 0).toString(16).slice(-6);
            else text.style.color = 'black';
        } else {
            text.style.color = 'black';
        }
        item.appendChild(text);
        item.addEventListener('dragstart', (e) => {
            draggedItem = item;
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => { item.style.opacity = '0'; }, 0);
        });
        item.addEventListener('dragend', () => {
            draggedItem.style.opacity = '1';
            if (placeholder.parentNode) placeholder.remove();
            draggedItem = null;
        });
        item.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            draggedItem = item;
            item.style.opacity = '0.5';
        }, { passive: true });
        item.addEventListener('touchmove', (e) => {
            if (!draggedItem || draggedItem !== item) return;
            e.preventDefault();
            const y = e.touches[0].clientY;
            const target = document.elementFromPoint(e.touches[0].clientX, y);
            const scrollItem = target ? target.closest('.reorder-item') : null;
            if (scrollItem && scrollItem !== item) {
                const rect = scrollItem.getBoundingClientRect();
                if (y < rect.top + rect.height / 2) listContainer.insertBefore(placeholder, scrollItem);
                else listContainer.insertBefore(placeholder, scrollItem.nextSibling);
            }
        }, { passive: false });
        item.addEventListener('touchend', () => {
            if (!draggedItem) return;
            item.style.opacity = '1';
            if (placeholder.parentNode) {
                listContainer.insertBefore(item, placeholder);
                placeholder.remove();
            }
            draggedItem = null;
        });
        listContainer.appendChild(item);
    });
    listContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        const target = e.target.closest('.reorder-item');
        if (target && target !== draggedItem) {
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
    footer.style.cssText = 'display:flex;justify-content:center;margin-top:15px;';
    const saveCloseBtn = document.createElement('button');
    saveCloseBtn.textContent = _('submitButton') || 'Confirm';
    saveCloseBtn.setAttribute('data-key', 'submitButton');
    saveCloseBtn.className = 'zoom-btn';
    saveCloseBtn.style.cssText = 'padding:10px 30px;background:darkorange;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1.1em;font-weight:bold;box-shadow:0 4px 10px rgba(0,0,0,0.3);';
    saveCloseBtn.onclick = async () => {
        const newOrder = [...listContainer.children].filter(el => el.classList.contains('reorder-item')).map(el => el.dataset.boardtitle);
        localStorage.setItem('boardMenuOrder', JSON.stringify(newOrder));
        overlay.remove();
        const boardsNote = document.querySelector('header .boards-note');
        if (boardsNote) boardsNote.remove();
        await renderUI({ boardParseError: false, rerenderOnlyMenu: true });
        if (typeof saveSettingsToGDrive === 'function') saveSettingsToGDrive(true);
        showToast(_('settingSaved'));
    };
    footer.appendChild(saveCloseBtn);
    box.appendChild(footer);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('visible'), 10);
}

/* --- Телефон в завъртян екран: заглавието се крие само ако не остане място за полето (Beta 1.67) --------
   Хедърът на един ред (виж @media (orientation: landscape) and (max-height: 500px) в style.css) пази
   поне 309px за полето за търсене, колкото са 20 видими знака. Ако заглавието + полето + бутоните не
   се събират в ширината на хедъра, заглавието се скрива с класа .title-hidden; иначе си стои.
   Смята се по ширини, а не по координати: при зареждане разположението още не е стабилно и меренето
   на позиции дава грешен отговор. Вика се при зареждане, resize, завъртане и след шрифтовете. */
const HEADER_SEARCH_MIN_WIDTH = 309;   // 307px съдържание + рамка = 20 видими знака
const HEADER_TITLE_GAP = 8;            // отстъпите на #search-wrapper отляво и отдясно

function syncHeaderTitleFit() {
    const header = document.querySelector('header');
    if (!header) return;

    header.classList.remove('title-hidden');
    if (!window.matchMedia('(orientation: landscape) and (max-height: 500px)').matches) return;

    const title = header.firstElementChild;
    const search = document.getElementById('search-wrapper');
    const buttons = document.getElementById('header-buttons');
    if (!title || !search || !buttons) return;

    const cs = getComputedStyle(header);
    const available = header.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const needed = title.getBoundingClientRect().width
        + HEADER_SEARCH_MIN_WIDTH
        + buttons.getBoundingClientRect().width
        + HEADER_TITLE_GAP * 2;

    if (needed > available) {
        header.classList.add('title-hidden');
    }
}

/* Разположението не е готово веднага: шрифтовете, преводът и демо режимът сменят ширината на заглавието
   и бутоните след зареждането. Затова се премерва няколко пъти в първите две секунди, а после при
   всяка промяна на размерите на заглавието или бутоните. */
function scheduleHeaderTitleFit() {
    requestAnimationFrame(() => requestAnimationFrame(syncHeaderTitleFit));
    [60, 200, 500, 1000, 1800].forEach((ms) => setTimeout(syncHeaderTitleFit, ms));
}

window.addEventListener('resize', syncHeaderTitleFit);
window.addEventListener('orientationchange', () => setTimeout(syncHeaderTitleFit, 250));
window.addEventListener('load', scheduleHeaderTitleFit);
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleHeaderTitleFit);
} else {
    scheduleHeaderTitleFit();
}
if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncHeaderTitleFit);
}
if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => syncHeaderTitleFit());
    const header = document.querySelector('header');
    if (header) {
        const title = header.firstElementChild;
        const buttons = document.getElementById('header-buttons');
        if (title) ro.observe(title);
        if (buttons) ro.observe(buttons);
    }
}

window.syncHeaderTitleFit = syncHeaderTitleFit;

/* ===== Екран за поверителност: blur overlay при излизане от приложението =====
   Порт от uni/main.js (PR #146/#150/#151/#152/#153/#160). Показва се, когато приложението (в режим
   на екран на приложението) отиде във фона.
   Две плочки 300x300, една под друга, центрирани: часовник (като при натискане на часа на бележка)
   отгоре и месечен календар отдолу. Малък бутон Затвори долу вдясно.
   Разлика с uni: езикът тук е currentLang (MNV го държи в localStorage['language']), затова
   privacyIsBg() гледа него; всичко останало е същото поведение. */
(function () {
    const TILE = 300;
    const TILE_GAP = 12;
    const PRIVACY_CLOSE_ZONE = 56; // място за бутона Затвори долу вдясно (височина + отстъп + въздух)
    const PRIVACY_SETTLE_MS = 800;
    let privacyOverlay = null;
    let privacyStack = null;
    let privacyClock = null;
    let privacyCal = null;
    let privacyTimer = null;
    let privacyWentHidden = false;   // истинско скриване по време на текущия blur
    let privacyExpectUntil = 0;      // до кога очакваме системен избор (файл), който сам вдига blur
    let privacyArmed = false;        // приложението е било наистина на екрана и на фокус
    let privacyArmedAt = 0;

    function privacyIsBg() {
        return typeof currentLang === 'string' && currentLang.indexOf('bg') === 0;
    }

    // Режим на екран на приложението (инсталирано приложение / fullscreen), не обикновен таб
    function privacyAppScreenMode() {
        try {
            if (window.matchMedia) {
                if (window.matchMedia('(display-mode: standalone)').matches) return true;
                if (window.matchMedia('(display-mode: fullscreen)').matches) return true;
                if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
            }
        } catch (e) { /* ignore */ }
        return navigator.standalone === true;
    }

    // Защитата се включва само след като приложението е било наистина на екрана и на фокус, и то
    // след кратко изчакване: при пускане Android още мести прозореца и blur/visibilitychange идват,
    // докато приложението още излиза на екрана. Иначе защитният екран излиза още при старт.
    function privacyArm() {
        if (privacyArmed) return;
        if (document.hidden) return;
        if (typeof document.hasFocus === 'function' && !document.hasFocus()) return;
        privacyArmed = true;
        privacyArmedAt = Date.now();
    }

    // Настройка „Автоматична защита“: по подразбиране е включена, значи ключът липсва.
    function privacyAutoProtectOn() {
        try { return localStorage.getItem('privacyAutoProtect') !== 'false'; } catch (e) { return true; }
    }

    // Готово ли е приложението да се пази: пускането е отминало и настройката е включена.
    function privacyProtectReady() {
        privacyArm();
        if (!privacyAutoProtectOn()) return false;
        return privacyArmed && (Date.now() - privacyArmedAt) >= PRIVACY_SETTLE_MS;
    }

    function privacyBuildClock() {
        const clock = document.createElement('div');
        clock.className = 'clock privacy-clock';
        clock.innerHTML = '<div class="center"></div>'
            + '<div class="number n12">12</div>'
            + '<div class="number n3">3</div>'
            + '<div class="number n6">6</div>'
            + '<div class="number n9">9</div>'
            + '<div class="hand hour"></div>'
            + '<div class="hand minute"></div>'
            + '<div class="hand second"></div>';
        for (let i = 0; i < 12; i++) {
            if (i % 3 === 0) continue;
            const m = document.createElement('div');
            m.className = 'mark';
            m.style.transform = 'translateX(-50%) rotate(' + (i * 30) + 'deg)';
            clock.appendChild(m);
        }
        return clock;
    }

    function privacyBuild() {
        if (privacyOverlay) return;
        privacyOverlay = document.createElement('div');
        privacyOverlay.id = 'privacy-overlay';
        privacyOverlay.className = 'privacy-overlay';
        privacyOverlay.setAttribute('aria-hidden', 'true');

        privacyStack = document.createElement('div');
        privacyStack.className = 'privacy-stack';

        const clockTile = document.createElement('div');
        clockTile.className = 'privacy-tile privacy-tile-clock';
        privacyClock = privacyBuildClock();
        clockTile.appendChild(privacyClock);

        const calTile = document.createElement('div');
        calTile.className = 'privacy-tile privacy-tile-calendar';
        privacyCal = document.createElement('div');
        privacyCal.className = 'privacy-cal';
        calTile.appendChild(privacyCal);

        privacyStack.appendChild(clockTile);
        privacyStack.appendChild(calTile);
        privacyOverlay.appendChild(privacyStack);

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'privacy-close';
        closeBtn.textContent = privacyIsBg() ? 'Затвори' : 'Close';
        closeBtn.addEventListener('click', function (ev) {
            ev.stopPropagation();
            ev.preventDefault();
            privacyHide();
        });
        closeBtn.addEventListener('pointerdown', function (ev) { ev.stopPropagation(); });
        privacyOverlay.appendChild(closeBtn);

        document.body.appendChild(privacyOverlay);
    }

    function privacyRenderCalendar() {
        if (!privacyCal) return;
        const now = new Date();
        const bg = privacyIsBg();
        const langCode = bg ? 'bg-BG' : 'en-GB';
        const monthName = now.toLocaleDateString(langCode, { month: 'long' });
        const weekdays = bg
            ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
            : ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
        const firstDow = (new Date(now.getFullYear(), now.getMonth(), 1).getDay() + 6) % 7; // понеделник = 0
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

        // Кои дни имат бележка — за цветните точки. Същото правило като в месечния изглед:
        // бележка с дата в този месец, която не е скрита (status !== 1). Без текст и без брой.
        const notesPerDay = {};
        if (typeof allNotesData !== 'undefined' && Array.isArray(allNotesData)) {
            allNotesData.forEach(n => {
                if (!n.calendarDate || n.status === 1) return;
                const nd = new Date(n.calendarDate);
                if (nd.getFullYear() !== now.getFullYear() || nd.getMonth() !== now.getMonth()) return;
                (notesPerDay[nd.getDate()] = notesPerDay[nd.getDate()] || []).push(n);
            });
        }

        let html = '<div class="privacy-cal-month">' + monthName + ' ' + now.getFullYear() + '</div>';
        html += '<div class="privacy-cal-grid privacy-cal-head">';
        for (let i = 0; i < 7; i++) html += '<span>' + weekdays[i] + '</span>';
        html += '</div><div class="privacy-cal-grid privacy-cal-days">';
        for (let i = 0; i < firstDow; i++) html += '<span class="privacy-cal-day is-empty"></span>';
        for (let d = 1; d <= daysInMonth; d++) {
            const today = d === now.getDate();
            const dayNotes = notesPerDay[d] || [];
            html += '<span class="privacy-cal-day' + (today ? ' is-today' : '') + '">';
            html += '<i class="privacy-cal-num">' + d + '</i>';
            // Две точки на ред, цели. Мястото е запазено и в дните без бележки.
            html += '<span class="privacy-cal-dots">';
            dayNotes.slice(0, 2).forEach(n => {
                const ci = (typeof n.color === 'number' && n.color >= 0 && n.color <= 9) ? n.color : 0;
                html += '<i style="background: var(--note-bg-' + ci + ')"></i>';
            });
            html += '</span></span>';
        }
        html += '</div>';
        privacyCal.innerHTML = html;
    }

    function privacyTick() {
        if (!privacyClock) return;
        const now = new Date();
        const s = now.getSeconds();
        const m = now.getMinutes();
        const h = now.getHours();
        const hourHand = privacyClock.querySelector('.hour');
        const minuteHand = privacyClock.querySelector('.minute');
        const secondHand = privacyClock.querySelector('.second');
        if (hourHand) hourHand.style.transform = 'translate(-50%, -100%) rotate(' + ((h % 12) * 30 + m * 0.5) + 'deg)';
        if (minuteHand) minuteHand.style.transform = 'translate(-50%, -100%) rotate(' + (m * 6 + s * 0.1) + 'deg)';
        if (secondHand) secondHand.style.transform = 'translate(-50%, -100%) rotate(' + (s * 6) + 'deg)';
    }

    // Реално видимата част на екрана: при мобилен браузър window.innerHeight може да е
    // по-голям от видимото (напр. 608 срещу 568), затова се взима най-малката стойност.
    function privacyViewport() {
        let vw = window.innerWidth;
        let vh = window.innerHeight;
        if (window.visualViewport) {
            vw = Math.min(vw, Math.round(window.visualViewport.width));
            vh = Math.min(vh, Math.round(window.visualViewport.height));
        }
        if (document.documentElement) {
            vw = Math.min(vw, document.documentElement.clientWidth);
            vh = Math.min(vh, document.documentElement.clientHeight);
        }
        return { vw: vw, vh: vh };
    }

    // Двете плочки остават 300x300; ако екранът е по-малък, цялата група се смалява,
    // за да не се реже нищо (и overlay-ът се свива до видимата част).
    function privacyFit() {
        if (!privacyStack) return;
        const v = privacyViewport();
        if (privacyOverlay) {
            privacyOverlay.style.width = v.vw + 'px';
            privacyOverlay.style.height = v.vh + 'px';
        }
        const availW = v.vw - 24;
        // Групата е центрирана вертикално, значи отдолу остава толкова място, колкото отгоре.
        // Затова се отделя място за бутона Затвори и отгоре, и отдолу, за да не застъпва календара.
        const availH = v.vh - PRIVACY_CLOSE_ZONE * 2;
        const scale = Math.min(1, availW / TILE, availH / (TILE * 2 + TILE_GAP));
        privacyStack.style.transform = 'scale(' + (scale > 0 ? scale.toFixed(4) : 1) + ')';
    }

    function privacyShow() {
        if (!privacyOverlay) privacyBuild();
        if (!privacyOverlay || !privacyOverlay.parentNode) {
            if (privacyOverlay && document.body) document.body.appendChild(privacyOverlay);
        }
        privacyRenderCalendar();
        privacyTick();
        privacyFit();
        privacyOverlay.classList.add('is-visible');
        privacyOverlay.setAttribute('aria-hidden', 'false');
        if (privacyTimer) clearInterval(privacyTimer);
        privacyTimer = setInterval(privacyTick, 1000);
    }

    function privacyHide() {
        if (!privacyOverlay) return;
        privacyOverlay.classList.remove('is-visible');
        privacyOverlay.setAttribute('aria-hidden', 'true');
        if (privacyTimer) {
            clearInterval(privacyTimer);
            privacyTimer = null;
        }
    }

    /* Системният избор на файл е отделен екран: той вдига blur и често скрива страницата.
       Ако го вземем за напускане на приложението, плочките остават върху екрана, след като файлът
       е избран. Затова всеки клик върху поле за файл бележи, че следващият blur/скриване не е
       напускане. */
    function privacyExpectSystemUI() {
        privacyExpectUntil = Date.now() + 10000;
    }

    function privacyExpectingSystemUI() {
        return Date.now() < privacyExpectUntil;
    }

    document.addEventListener('click', function (ev) {
        const el = ev.target;
        if (!el || el.tagName !== 'INPUT') return;
        if (String(el.type || '').toLowerCase() === 'file') privacyExpectSystemUI();
    }, true);

    /* Android снима екрана за списъка с приложенията, докато приложението още излиза от
       екрана. Затова не чакаме visibilitychange (тогава кадърът вече е снет и се виждат
       бележките), а показваме плочките още при blur: прозорецът е изгубил фокус, но още е
       на екрана, значи следващият кадър вече е с часовника и календара. */
    window.addEventListener('blur', function () {
        if (!privacyProtectReady()) return;
        if (privacyExpectingSystemUI()) return;
        if (!privacyAppScreenMode()) return;
        privacyWentHidden = false;
        privacyShow();
    });

    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { privacyArm(); return; }
        if (!privacyProtectReady()) return;
        privacyWentHidden = true;
        if (privacyExpectingSystemUI()) return;
        if (!privacyAppScreenMode()) return;
        privacyShow();
    });

    window.addEventListener('focus', function () {
        privacyExpectUntil = 0;
        privacyArm();
        // Blur без истинско скриване (системен диалог, избор на час, падащо меню): приложението
        // не е напускало екрана, затова бележките се връщат веднага, без бутон Затвори.
        if (!privacyWentHidden) privacyHide();
    });

    window.addEventListener('resize', function () {
        if (privacyOverlay && privacyOverlay.classList.contains('is-visible')) privacyFit();
    });

    /* Собственикът (31.10.2026): „покажи защитния овърлей при клик на логото на приложението в
       хедъра“. Логото е първото нещо на екрана и се натиска за секунда, когато някой погледне
       през рамо - същият овърлей с часовника и календара, който излиза при излизане от приложението,
       без да се чака blur. Кликът се хваща във фаза прихващане, за да не стигне до нищо друго, и се
       отменя (preventDefault), за да не отваря нищо. Затваря се с бутона „Затвори“ на овърлея. */
    document.addEventListener('click', function (ev) {
        const el = ev.target;
        if (!el || !el.closest) return;
        if (!el.closest('.header-logo')) return;
        ev.preventDefault();
        ev.stopPropagation();
        privacyShow();
    }, true);

    privacyArm();
    window.privacyOverlayShow = privacyShow;
    window.privacyOverlayHide = privacyHide;
})();
