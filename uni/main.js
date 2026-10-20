

// App version: идва от CACHE_NAME на service worker-а ('cx-notes-b1.67' -> 'Beta 1.67').
// null, докато не се разбере; ако не се разбере изобщо, надписът се скрива.
let version = null;
const debug = false; // Глобален флаг за дебъг режим

function versionFromCacheName(cacheName) {
    const match = /^cx-notes-b(\d.*)$/.exec(String(cacheName || '').trim());
    return match ? `Beta ${match[1]}` : null;
}

function cacheNameFromSwSource(source) {
    const match = /const\s+CACHE_NAME\s*=\s*(['"`])([^'"`]*)\1/.exec(String(source || ''));
    return match ? match[2] : null;
}

// Пита service worker-а, който обслужва страницата (работи и офлайн).
function askServiceWorkerCacheName(controller, timeoutMs = 1500) {
    return new Promise((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve(null), timeoutMs);
        channel.port1.onmessage = (event) => {
            clearTimeout(timer);
            resolve(event.data && event.data.cacheName ? event.data.cacheName : null);
        };
        try {
            controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
        } catch (e) {
            clearTimeout(timer);
            resolve(null);
        }
    });
}

async function resolveAppVersion() {
    let resolved = null;
    const controller = 'serviceWorker' in navigator ? navigator.serviceWorker.controller : null;
    if (controller) {
        resolved = versionFromCacheName(await askServiceWorkerCacheName(controller));
    }
    // Няма активен service worker (първо отваряне) или не отговаря - четем sw.js от мрежата
    if (!resolved) {
        try {
            const response = await fetch('sw.js', { cache: 'no-store' });
            if (response.ok) resolved = versionFromCacheName(cacheNameFromSwSource(await response.text()));
        } catch (e) {
            console.warn('[Version] Could not read sw.js:', e);
        }
    }
    version = resolved;
    renderVersionLabels();
    return version;
}

// Надписът с версията живее само в Настройки, в собствен елемент, за да не се дублира при повторно извикване.
function renderVersionLabels() {
    // Версията НЕ се показва в хедъра (CX, 2026-10-09): на таблет в landscape той е висок,
    // а надписът не носи нищо за работата. Остава само в заглавието на Настройки.
    const settingsTitle = document.querySelector('#settings-modal .modal-content-box h3');
    if (settingsTitle) {
        let label = settingsTitle.querySelector('.app-version-label');
        if (!label) {
            label = document.createElement('span');
            label.className = 'app-version-label';
            settingsTitle.appendChild(label);
        }
        label.textContent = version || '';
        settingsTitle.style.display = version ? '' : 'none';
    }
}

window.isAppErrorState = false; // Флаг за грешки (изтекъл сертификат и др.)

let guide = true;
guide = localStorage.getItem('guide');
if (guide === 'false') {
    guide = false;
}
else guide = true;

let initialBoardModalPending = false;


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

// --- Локален режим (b3.0) -------------------------------------------------------
// Приложението работи само върху IndexedDB в браузъра: без акаунт, без Google
// Drive, без нито една външна заявка.

// =================================================================================
// I. ГЛОБАЛНИ ПРОМЕНЛИВИ И КОНСТАНТИ
// =================================================================================

// --- Конфигурация и версия ---



// --- Глобално състояние на приложението ---
let allNotesData = []; // Съхранява всички бележки за календара
let noteId = 1000000, noteNumord = 1000000;

let boardsData = []; // Съхранява данните за бордовете
let mediaData = []; // Съхранява данните за медия
let currentBoardFilter = 'all';
let boardBeforeSearch = 'all';
let searchInBoardOnly = localStorage.getItem('searchInBoardOnly') === 'true';
let currentBackground = 'Board.png';
let currentCalendarDate = new Date();
let currentWeeklyViewDate = new Date(); // За новия седмичен изглед
let ts; // Време на първо стартиране на приложението
let isInitialLoad = true; // Флаг за първоначално зареждане
let isLoadCancelled = false; // Флаг за прекратяване на зареждането
let noteToAssignDate = null; // Запомня бележката, на която ще се зададе дата
let updatedNoteGdims = []; // Съхранява gdid на новите/обновените бележки
let notesBgrdChanged = false; // Flag to track if notes background setting changed
let oneTapLinkChanged = false;
let isToastHidden = localStorage.getItem('hideToast') === 'true'; // Default to false

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
// Локален режим: единствен източник на данни е IndexedDB в браузъра.
let useGoogleDb = false;
let useLocalFolder = false;
let useArhDb = false;
let useIndexedDb = true;
let automatedTimer = true; // true по подразбиране
let dbNoteIdTypeGlobal = null; // Запомня типа на връзката в базата
let dataIntegrityIssues = []; // Track missing/duplicate IDs during load
let isAppStarted = false; // Guard for startApp
let isOffline = true; // Локален режим: винаги работим без мрежа
let localFileMap = new Map(); // Карта за съответствие GDID -> име на файл за локална папка

// --- DOM елементи (ще бъдат инициализирани в initApp) ---
let signoutButton, reloadButton, settingsButton, notesContainer, contentModal, modalBody, copyBtn, scrollTopBtn, searchBox, loaderContainer, loaderText, searchModeToggle, saveSearchBtn;
let folderIdPromptPopup, folderIdInput, submitFolderIdBtn;

// --- IndexedDB Конфигурация ---
const NOTES_DB_NAME_DEFAULT = 'NotesDB';
// Демото работи в собствена база: истинските бележки в NotesDB остават недокоснати.
// Името е една точка на истина — целият код по-долу ползва NOTES_DB_NAME.
const NOTES_DB_NAME = NOTES_DB_NAME_DEFAULT;
const BOARD_STORE_NAME = 'boards';
const MEDIA_STORE_NAME = 'media';
const NOTE_STORE_NAME = 'notes';
const CONFIG_STORE_NAME = 'config';
// Файловете (картинки, звук, видео, прикачени) живеят като Blob в собствен store.
const FILES_STORE_NAME = 'files';
const NOTES_DB_VERSION = 4; // b3.0: нов store `files`
// Флаг в config store-а: началният борд вече е сложен. Пази от повторно слагане,
// ако човек сам изтрие всички бордове. Трие се заедно с базата.
const FIRST_RUN_SEEDED_KEY = 'firstRunSeeded';

// --- SVG икони ---
// const eyeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const eyeOffIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><path d="M3 3l18 18"></path></svg>`;
const calendarIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><rect x="4" y="5" width="16" height="16" rx="2" /><line x1="16" y1="3" x2="16" y2="7" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="4" y1="11" x2="20" y2="11" /></svg>`;
const calendarTodaySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none" /><rect x="4" y="5" width="16" height="16" rx="2" /><line x1="16" y1="3" x2="16" y2="7" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="4" y1="11" x2="20" y2="11" /><circle cx="12" cy="16" r="1.5" fill="currentColor"></circle></svg>`;
const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" /></svg>`;
const boardIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="black" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="12" y1="4" x2="12" y2="20" /></svg>`;
const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21V3M5 10l7-7 7 7"/></svg>`;
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

// Езикът живееше на login екрана; без него остава само изборът в Настройки и ?lang в адреса.
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
let translationsFallback = {}; // езици, за които езиковият файл не се зареди и appTranslations[lang] е само резервата от loadTranslations

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
const NOTE_TEXT_COLORS = noteColorMap.filter(c => c !== '#EFEFEF'); // 14: the note palette without the neutral grey

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

function getNoteColorCss(color, fallback = noteColorMap[0]) {
    if (typeof color === 'number') {
        return color >= 0 && color < noteColorMap.length
            ? noteColorMap[color]
            : (color < 0 ? colorIntToHex(color) : fallback);
    }
    return typeof color === 'string' ? color : fallback;
}

// --- Default note background -------------------------------------------------
// The background of the last note the user recoloured. New notes, and notes with
// no colour of their own, open with it. It lives in local storage; the profile
// carries it because 'defaultNoteBg' is in appSettingsKeys, so the next profile
// save writes it into settings.json and loading a profile restores it.
const DEFAULT_NOTE_BG_KEY = 'defaultNoteBg';
const FALLBACK_NOTE_BG = noteColorMap[0]; // '#FBFF86'

function getDefaultNoteBg() {
    const stored = String(localStorage.getItem(DEFAULT_NOTE_BG_KEY) || '').toUpperCase();
    return /^#[0-9A-F]{6}$/.test(stored) ? stored : FALLBACK_NOTE_BG;
}

// A note's colour is stored as a palette index (0-9) or as a colour int - the
// same shape getModalColorValue() returns.
function getDefaultNoteBgValue() {
    const hex = getDefaultNoteBg();
    const idx = noteColorMap.indexOf(hex);
    return (idx !== -1 && idx < 10) ? idx : hexToColorInt(hex);
}

// Remembers a new default. Local only: the profile is written on its own save.
function setDefaultNoteBg(hex) {
    if (typeof hex !== 'string') return;
    const value = hex.toUpperCase();
    if (!/^#[0-9A-F]{6}$/.test(value)) return;
    if (localStorage.getItem(DEFAULT_NOTE_BG_KEY) === value) return;
    localStorage.setItem(DEFAULT_NOTE_BG_KEY, value);
}

function getNoteHeaderDateTimestamp(noteData) {
    const timer = Number(noteData?.timer || 0);
    const timerDate = timer ? new Date(timer) : null;
    const isAutoCalendarTimer = timerDate && timerDate.getHours() === 0 && timerDate.getMinutes() === 0 && timerDate.getSeconds() === 33;

    if (timer && !isAutoCalendarTimer) return timer;
    const calDateTime = getNoteCalDateTimeTimestamp(noteData);
    if (calDateTime) return calDateTime;
    if (Number(noteData?.calendarDate) > 0) return Number(noteData.calendarDate);
    if (Number(noteData?.datemod) > 0) return Number(noteData.datemod);
    return Number(noteData?.date) || 0;
}

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
    weekStart.setDate(anchorDate.getDate() - ((anchorDate.getDay() + 6) % 7)); // Monday

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
        closeHint.textContent = '×';
        closeHint.title = _('close') || 'Close';
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
                marker.title = (noteData.notetxt || '').split('\n').find(line => line.trim())?.trim() || _('note') || 'Note';
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

function getModalColorValue(modalBodyElem, fallback = 0) {
    const colorIndex = Number.parseInt(modalBodyElem?.dataset.colorIndex, 10);
    const color = modalBodyElem?.dataset.color;
    if (Number.isInteger(colorIndex) && colorIndex >= 0 && colorIndex < 10) return colorIndex;
    if (Number.isInteger(colorIndex) && colorIndex >= 10 && colorIndex < noteColorMap.length) {
        return hexToColorInt(color || noteColorMap[colorIndex]);
    }
    if (colorIndex === -1 && color && color.startsWith('#')) return hexToColorInt(color);
    return fallback;
}
const noteBgCache = new Map();
const customBgCache = new Map();

window.getPipeIndex = function (text) {
    if (!text || !text.includes('|')) return -1;
    const tables = (typeof parseAllMarkdownTables === 'function') ? parseAllMarkdownTables(text) : [];
    let maskedText = text.replace(/\{\{([\s\S]*?)\}\}/g, m => m.replace(/[^\r\n]/g, ' '));
    maskedText = maskedText.replace(/```([\s\S]*?)```/g, m => m.replace(/[^\r\n]/g, ' '));
    maskedText = maskedText.replace(/`([^`\r\n]+)`/g, m => ' '.repeat(m.length));
    let currentLine = 0;
    for (let i = 0; i < maskedText.length; i++) {
        if (maskedText[i] === '\n') currentLine++;
        if (maskedText[i] === '|') {
            if (tables.some(t => currentLine >= t.startIndex && currentLine <= t.endIndex)) {
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
        const color = (typeof noteColor === 'number' && noteColor >= 0 && noteColor < noteColorMap.length) ? noteColorMap[noteColor] : (typeof noteColor === 'string' ? noteColor : getDefaultNoteBg());
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

function trackMaxIds(notes) {
    if (!Array.isArray(notes)) return;
    let changed = false;
    notes.forEach(note => {
        const id = parseInt(note.id, 10);
        const numord = parseInt(note.numord, 10);
        if (!isNaN(id) && id > noteId) { noteId = id; changed = true; }
        if (!isNaN(numord) && numord > noteNumord) { noteNumord = numord; changed = true; }
    });
}

async function createNewNote() {


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
        "color": getDefaultNoteBgValue(),
        "date": now,
        "datemod": now,
        "eventId": 0,
        "gdid": localUuid(), // локален ключ на бележката
        "id": noteId, // Temporary ID, will be finalized on save
        "notetxt": "",
        "numord": noteNumord,
        "pass": false,
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

function renderCalendarView() {
    document.querySelector('header').style.display = 'none';
    notesContainer.style.display = 'none';
    scrollTopBtn.style.display = 'none';
    const addNoteFab = document.getElementById('add-note-fab');
    if (addNoteFab) addNoteFab.style.display = 'none';
    const weeklyContainer = document.getElementById('weekly-calendar-container');
    if (weeklyContainer) weeklyContainer.style.display = 'none';
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
                <button id="today-month-btn" title="${_('today')}">${calendarTodaySvg}</button>
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
                    adjustFullscreenSearchLayout();
                }

                // --- Re-open note modal if we were assigning a date ---
                if (noteToAssignDate) {
                    const noteObj = allNotesData.find(n => (n.gdid && String(n.gdid) === String(noteToAssignDate.gdid)) || (n.id && String(n.id) === String(noteToAssignDate.id)));
                    noteToAssignDate = null;
                    if (noteObj) {
                        const noteColorStr = getNoteColorCss(noteObj.color);
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
    const calendarContainer = document.getElementById('calendar-container');
    if (calendarContainer) calendarContainer.style.display = 'none';
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
        <button id="today-week-btn" title="${_('today')}">${calendarTodaySvg}</button>
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
                    adjustFullscreenSearchLayout();
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
 * @param {Object} [options] - { batch: true } пропуска работата по интерфейса за всяка бележка
 *        (броячи, филтри, календар); при партида те се правят веднъж след цикъла.
 */
async function moveNoteToTrash(noteGdid, noteId, options = {}) {
    const batch = !!(options && options.batch);
    const noteToUpdate = allNotesData.find(n => (noteGdid && n.gdid == noteGdid) || (noteId && n.id == noteId));
    if (!noteToUpdate) return false;
    const boardIdOfNote = noteToUpdate.boardid;
    noteToUpdate.status = 1;
    noteToUpdate.datemod = Date.now();
    noteToUpdate.type = -1; // локален режим: бележката живее само в базата


    if (useIndexedDb && typeof NOTE_STORE_NAME !== 'undefined') {
        const db = await openNotesDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(NOTE_STORE_NAME, 'readwrite');
            tx.objectStore(NOTE_STORE_NAME).put(noteToUpdate);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // Обновяваме DOM елемента (ако съществува) вместо да го премахваме
    const noteEl = document.querySelector(`.note[data-g="${noteGdid}"]`) ||
        (noteId ? document.querySelector(`.note[data-i="${noteId}"]`) : null);
    if (noteEl) noteEl.dataset.s = '1';
    // При партида (b2.36) интерфейсът се обновява веднъж след цикъла — иначе 20 бележки
    // правят 20 пре-рисувания и 20 брояча.
    if (!batch) {
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
    }
    if (typeof scheduleSemanticIndexSync === 'function') scheduleSemanticIndexSync(); // b2.23: изчезва от индекса за търсене по смисъл
    return true;
}
function deleteKeyFromDBHandle(db, storeName, key) {
    return new Promise((resolve) => {
        let transaction;
        try {
            transaction = db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            store.delete(key);
            // Същият ключ може да е записан като число или низ - трием и двата варианта.
            if (typeof key === 'number') {
                store.delete(String(key));
            } else if (typeof key === 'string' && !isNaN(key) && key.trim() !== "" && !key.startsWith('L') && !key.includes('-')) {
                store.delete(Number(key));
            }
        } catch (error) {
            console.error("Local DB deletion failed:", error);
            resolve(false);
            return;
        }
        transaction.oncomplete = () => resolve(true);
        transaction.onerror = () => resolve(false);
        transaction.onabort = () => resolve(false);
    });
}
/**
 * Изтрива бележка окончателно от базата, прикачените ѝ файлове и паметта.
 * Връща { ok, error }. ok === false значи, че бележката е още в базата и остава в паметта.
 * @param {object} opts - { db }: отворена IndexedDB връзка за партидно триене.
 */
async function emptyTrash() {
    const trashBtn = document.getElementById('empty-trash-fab');
    if (!trashBtn) return;

    // Кошчето се чете от данните, не от видимите карти: така влизат и бележките, които в
    // момента не са изрисувани (друг борд, резултати от търсене, скрит филтър).
    const trashNotes = () => allNotesData.filter(n => n && n.status === 1);

    if (trashNotes().length === 0) {
        showToast(_('trashAlreadyEmpty') || "Кошчето е вече празно.", 3000);
        return;
    }

    const confirmed = await showConfirmation(_('confirmEmptyTrash') || "Сигурни ли сте, че искате да изпразните кошчето окончателно? Това действие е необратимо.");
    if (!confirmed) return;

    const originalContent = trashBtn.innerHTML;
    trashBtn.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" class="spin-animation"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" stroke="white" stroke-width="2" stroke-linecap="round"/></svg><style>@keyframes spin{to{transform:rotate(360deg)}}.spin-animation{animation:spin 1s linear infinite}</style>`;
    trashBtn.style.pointerEvents = 'none';

    let deletedCount = 0;
    let lastErrors = [];
    let db = null;
    try {
        // Една връзка към IndexedDB за цялата партида, вместо по една на бележка.
        if (useIndexedDb && typeof NOTE_STORE_NAME !== 'undefined') {
            try {
                db = await openNotesDB();
            } catch (e) {
                console.warn("[Trash] Could not open DB, falling back to a connection per note:", e);
                db = null;
            }
        }

        const CONCURRENCY_LIMIT = 4; // по-малко паралелни заявки към Drive = по-малко 403/429
        const MAX_ROUNDS = 4;
        let round = 0;
        while (round < MAX_ROUNDS) {
            round++;
            const pending = trashNotes();
            if (pending.length === 0) break;
            console.log(`[Trash] Round ${round}: ${pending.length} note(s) left`);
            let deletedThisRound = 0;
            const roundErrors = [];
            for (let i = 0; i < pending.length; i += CONCURRENCY_LIMIT) {
                const chunk = pending.slice(i, i + CONCURRENCY_LIMIT);
                const results = await Promise.all(chunk.map(note =>
                    permanentlyDeleteNote(note.gdid, note.id, true, { db })
                        .catch(error => ({ ok: false, error }))
                ));
                results.forEach((result, index) => {
                    if (result && result.ok) {
                        deletedCount++;
                        deletedThisRound++;
                    } else {
                        const note = chunk[index];
                        roundErrors.push({
                            gdid: note.gdid,
                            id: note.id,
                            error: (result && result.error && (result.error.message || String(result.error))) || 'unknown'
                        });
                    }
                });
                if (deletedThisRound) updateBoardCounterUI('trash');
            }
            lastErrors = roundErrors;
            // Нищо не мина в този кръг - още един кръг няма да помогне.
            if (!deletedThisRound) break;
        }

        updateBoardCounterUI('trash');
        applyFilters();
        const remaining = trashNotes().length;
        if (remaining === 0) {
            showToast((_('trashEmptiedSuccessCount') || "Кошчето е празно. Изтрити: {count}.")
                .replace('{count}', String(deletedCount)), 3000);
        } else {
            console.warn("[Trash] Notes left in trash after emptying:", lastErrors);
            showToast((_('trashEmptiedPartial') || "Изтрити: {deleted}. Останали: {failed} - натиснете отново.")
                .replace('{deleted}', String(deletedCount))
                .replace('{failed}', String(remaining)), 6000);
        }
    } catch (error) {
        console.error("Error emptying trash:", error);
        showToast("Error: " + error.message, 5000);
    } finally {
        if (db) { try { db.close(); } catch (e) { /* вече затворена */ } }
        trashBtn.innerHTML = originalContent;
        trashBtn.style.pointerEvents = 'auto';
    }
}

async function permanentlyDeleteNote(noteGdid, noteId, skipUI = false, opts = {}) {
    const noteToDelete = allNotesData.find(n => (noteGdid && n.gdid == noteGdid) || (noteId && n.id == noteId));
    const actualGdid = noteToDelete ? noteToDelete.gdid : noteGdid;

    // 1. Локална база - през общата връзка на партидата, ако е подадена.
    let localDeleted = false;
    if (useIndexedDb && typeof NOTE_STORE_NAME !== 'undefined') {
        const dbKey = (noteToDelete && noteToDelete.gdid) || noteGdid || noteId;
        let dbOk = false;
        if (opts.db) {
            dbOk = await deleteKeyFromDBHandle(opts.db, NOTE_STORE_NAME, dbKey);
        } else {
            try {
                await deleteFromDB(NOTE_STORE_NAME, dbKey);
                dbOk = true;
            } catch (e) {
                console.error("Local DB deletion failed:", e);
            }
        }
        if (!dbOk) {
            if (!skipUI) showToast((_('trashDeleteFailed') || "Бележката не е изтрита - грешка в локалната база."), 5000);
            return { ok: false, error: new Error('IndexedDB delete failed') };
        }
    }

    // 2. Прикачените файлове на бележката (blob-овете в store `files`) отиват с нея.
    try {
        await deleteFilesForNote(actualGdid);
    } catch (e) {
        console.warn("Attachment blob delete failed:", e);
    }

    // 3. Памет и екран - само след като източниците са изчистени.
    const midx = allNotesData.findIndex(n => (noteGdid && n.gdid == noteGdid) || (noteId && n.id == noteId) || (actualGdid && n.gdid === actualGdid));
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
    return { ok: true };
}
/**
 * UI обвивка: показва потвърждение и извиква moveNoteToTrash или permanentlyDeleteNote.
 * @param {string} noteGdid - Google Drive ID на бележката.
 * @param {string|number} noteId - Локално ID на бележката.
 * @param {boolean} fromModal - Дали се извиква от модалния прозорец.
 */
async function handleNoteDelete(noteGdid, noteId, fromModal = false) {
    if (!useIndexedDb) return;
    if (fromModal) {
        document.getElementById('content-modal').classList.remove('visible');
        await new Promise(resolve => setTimeout(resolve, 150));
    }
    const noteData = allNotesData.find(n => (noteGdid && n.gdid == noteGdid) || (noteId && n.id == noteId));
    const isInTrash = currentBoardFilter === 'trash' || (noteData && noteData.status === 1);
    const confirmMsgKey = isInTrash ? 'confirmNoteDelete' : 'confirmNoteMoveToTrash';
    const confirmed = await showConfirmation(_(confirmMsgKey) || _('confirmNoteDelete'));
    if (!confirmed) return;
    try {
        if (!isInTrash) {
            await moveNoteToTrash(noteGdid, noteId);
            showToast(_('noteMovedToTrash') || 'Бележката е преместена в Кошче', 3000);
        } else {
            await permanentlyDeleteNote(noteGdid, noteId);
            showToast(_('noteDeletedSuccess'), 3000);
        }
    } catch (error) {
        console.error("Failed to delete note:", error);
        showToast((_('noteDeletedError') || "Грешка при изтриване") + " - " + error.message, 5000);
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
 * @param {Object} [options] - { batch: true } пропуска съобщението и обновяването на
 *        интерфейса за всяка бележка; при партида те се правят веднъж след цикъла.
 */
async function moveNoteToBoard(noteGdid, noteId, newBoardId, options = {}) {
    const batch = !!(options && options.batch);
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
                if (!batch) showToast(_('noteAlreadyInBoard'), 3000);
                return false;
            }
        } else {
            noteToMove.boardid = newBoardId;
            if (noteToMove.status === 1) noteToMove.status = 0; // Възстановяване от кошчето в нов борд
        }

        const targetBoardTitle = targetBoard.title;
        noteToMove.datemod = Date.now();
        noteToMove.type = -1; // локален режим: бележката живее само в базата
        // Update DB
        if (useIndexedDb && typeof bulkPutDB === 'function' && typeof NOTE_STORE_NAME !== 'undefined') {
            await bulkPutDB(NOTE_STORE_NAME, [noteToMove], true);
        }


        if (!batch) showToast(_('noteMovedSuccess').replace('{boardName}', targetBoardTitle), 3000);
        const noteElementInDom = document.querySelector(`.note[data-g="${noteGdid}"]`) || document.querySelector(`.note[data-i="${noteId}"]`);
        if (noteElementInDom) {
            noteElementInDom.dataset.b = newBoardId;
            noteElementInDom.dataset.s = noteToMove.status;
        }
        // При партида (b2.36) броячите и пре-рисуването се правят веднъж след цикъла.
        if (!batch) {
            const oldBoard = boardsData.find(b => (b.gdid || b.id) == oldBoardId);
            const newBoard = boardsData.find(b => (b.gdid || b.id) == newBoardId);
            if (oldBoard) {
                updateBoardCounterUI(oldBoardId);
            }
            if (newBoard) {
                updateBoardCounterUI(newBoardId);
            }
            updateBoardCounterUI('trash');
            filterNotesByBoard(currentBoardFilter, false);
            updateReloadButtonState();
            if (typeof scheduleSemanticIndexSync === 'function') scheduleSemanticIndexSync();
        }
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
                if (!db.objectStoreNames.contains(FILES_STORE_NAME)) {
                    db.createObjectStore(FILES_STORE_NAME, { keyPath: 'key' });
                }
                console.log("NotesDB structure is up to date.");
            };
            request.onsuccess = (event) => {
                const db = event.target.result;
                // Отворена връзка не бива да блокира deleteNotesDB (смяна на акаунт)
                db.onversionchange = () => db.close();
                resolve(db);
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
 * @returns {Promise<void>}
 */
async function putConfig(key, value) {
    const db = await openNotesDB();
    return new Promise((resolve, reject) => {
        try {
            const transaction = db.transaction(CONFIG_STORE_NAME, 'readwrite');
            transaction.objectStore(CONFIG_STORE_NAME).put(value, key);
            transaction.oncomplete = () => { db.close(); resolve(); };
            transaction.onerror = (event) => { db.close(); reject('Error saving to config: ' + event.target.error); };
            transaction.onabort = () => { db.close(); reject('Transaction aborted saving to config'); };
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

/**
 * Изтрива NotesDB и чака резултата.
 * @returns {Promise<boolean>} true при успешно изтриване; false при грешка или ако остане блокирано над 8 сек.
 */
function deleteNotesDB() {
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
            // Показваме съобщението само ако изтриването не завърши до 1.5 секунди
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
                color: getDefaultNoteBg(), // Фон по подразбиране (вж. setDefaultNoteBg)
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
        if (sharedFiles.length > 0) {
            const targetNoteId = noteId; // Capture the local ID for closures
            (async () => {
                try {
                    for (let i = 0; i < sharedFiles.length; i++) {
                        const { blob, filename, mimeType } = sharedFiles[i];
                        try {
                            const fileType = mimeType.startsWith('video') ? 'Video' : (mimeType.startsWith('audio') ? 'Sound' : 'Images');
                            const mediaTypeNum = fileType === 'Images' ? 1 : (fileType === 'Sound' ? 2 : 4);
                            const noteInData = allNotesData.find(n => String(n.id) === String(targetNoteId));
                            if (!noteInData) throw new Error('Note not found');
                            const fileKey = await saveBlobToFiles(filename, blob, mimeType);
                            const maxMediaId = mediaData.reduce((max, m) => Math.max(max, +(m.id || 0)), 0);
                            const mediaEntry = {
                                datemod: Date.now(),
                                description: '',
                                gdid: localUuid(),
                                id: maxMediaId + 1,
                                noteid: noteInData.gdid,
                                path: filename,
                                pathGD: fileKey,
                                type: mediaTypeNum
                            };
                            mediaData.push(mediaEntry);
                            await bulkPutDB(MEDIA_STORE_NAME, [mediaEntry], true);
                            showToast((_('attachSuccessMsg') || '✅ Attached: {name}').replace('{name}', filename), 3000);
                        } catch (fileErr) {
                            console.error(`[ShareTarget] Error processing file ${filename}:`, fileErr);
                            showToast((_('attachErrorMsg') || '❌ Error: {msg}').replace('{msg}', fileErr.message), 5000);
                        }
                    }
                    await renderUI({ boardParseError: false });
                } catch (e) {
                    console.error('[ShareTarget] Error saving shared files:', e);
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
async function startApp() {
    if (isAppStarted) return;
    isAppStarted = true;

    const lc = document.getElementById('loader-container');
    if (lc) lc.style.display = 'block';

    // Локален режим: няма вход, няма проверки за мрежа - всичко е в браузъра.
    isOffline = true;

    // --- Graceful fallback for KB Assistant ---
    if (typeof window.kbAssistant === 'undefined') {
        window.kbAssistant = {
            init: () => Promise.resolve(false),
            showGuide: () => { console.warn("KB Assistant not loaded."); },
            terminateGuide: () => { },
            updateLanguage: () => { },
            isInitialized: false
        };
    }
    try {
        console.log('First start:', Date.now());
        ts = await getFirstStartEncoded();
        initApp(); // Инициализира UI елементите и event listeners

        const lt = document.getElementById('loader-title');
        if (lt) lt.textContent = _('initialDataLoad') || 'Data loading...';

        if (dbExists === null || typeof dbExists === 'undefined') {
            dbExists = await checkDbExists(NOTES_DB_NAME);
        }
        await createBoardsUI([], false);
        initHeaderFullscreen();
        await createSettingsUI([], false);

        const initDraggableButtons = () => {
            const scrollTopBtnElement = document.getElementById('scrollTopBtn');
            if (scrollTopBtnElement) makeElementDraggable(scrollTopBtnElement, 'scrollTopBtnPosition');
            const initKbFab = () => {
                const kbFab = document.getElementById('kb-fab');
                if (kbFab) makeElementDraggable(kbFab, 'kbFabPosition');
            };
            initKbFab();
        };
        initDraggableButtons();

        await mainLogic();
        // Интрото на асистента при първо влизане. В локалния режим няма първоначална
        // настройка, затова единственото условие е флагът 'guide' (вдига се на 'false'
        // след първото показване, за да не излиза втори път).
        if (guide) {
            setTimeout(() => { startAssistantGuide().catch(err => console.warn('[Guide] intro failed:', err)); }, 1500);
        }
        handleShareTarget();
    } catch (err) {
        console.error("Error in startApp:", err);
        showAppUI();
    }
}

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
    if (appTranslations && appTranslations[currentLang] && appTranslations[currentLang][key] !== undefined) {
        return appTranslations[currentLang][key];
    }
    if (window._langCache && window._langCache[currentLang] && window._langCache[currentLang][key] !== undefined) {
        return window._langCache[currentLang][key];
    }
    return '';
}

/**
 * Текст за партида (b2.36): при една бележка се ползва ключът с наставка '.one', за да не
 * пише „1 бележки". Замества {count} и подадените стойности.
 * @param {string} key - Ключът за много бележки.
 * @param {number} count - Броят.
 * @param {Object} [vars] - Допълнителни замествания, напр. { boardName: 'Борд Б' }.
 */
function _n(key, count, vars = {}) {
    const lookupKey = (count === 1 && _((key + '.one'))) ? (key + '.one') : key;
    let text = _(lookupKey) || _(key) || '';
    text = text.replace('{count}', count);
    Object.keys(vars).forEach(k => { text = text.replace('{' + k + '}', vars[k]); });
    return text;
}

function hideToast() {
    clearUndoToast();
    const toast = document.getElementById('toastNotification');
    if (toast.classList.contains('show')) {
        clearTimeout(toastTimeout);
        toast.classList.remove('show');
        isShowingToast = false;
    }
}

// Маха бутона „Отмени" от съобщението. Извиква се при всяко скриване, за да не остане
// бутон, който вече сочи към свършена партида.
function clearUndoToast() {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;
    const btn = toast.querySelector('.toast-undo-btn');
    if (btn) btn.remove();
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
    clearUndoToast();
    toast.textContent = message;
    toast.classList.add('show');
    toastTimeout = setTimeout(hideToast, duration); // This should match the animation duration or be slightly longer
}

/**
 * Съобщение с един бутон „Отмени" (b2.36) — за масово триене и преместване.
 * Заменя текста на вече показано съобщение, както showToast.
 */
function showUndoToast(message, onUndo, durationMs = 8000) {
    if (isToastHidden) return;
    if (isShowingToast) {
        hideToast();
        setTimeout(() => showUndoToast(message, onUndo, durationMs), 300);
        return;
    }
    isShowingToast = true;
    const toast = document.getElementById('toastNotification');
    clearUndoToast();
    toast.textContent = '';
    const text = document.createElement('span');
    text.className = 'toast-msg';
    text.textContent = message;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'toast-undo-btn';
    btn.textContent = _('undoAction') || 'Undo';
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideToast();
        try {
            const result = onUndo();
            if (result && typeof result.catch === 'function') result.catch(err => console.error('Undo failed:', err));
        } catch (err) {
            console.error('Undo failed:', err);
        }
    });
    toast.appendChild(text);
    toast.appendChild(btn);
    toast.classList.add('show');
    toastTimeout = setTimeout(hideToast, durationMs);
}

// Едно съобщение на запис, когато маркер за линк не е могъл да бъде възстановен и е премахнат.
function notifyRemovedLinkMarkers(count) {
    if (!count) return;
    showToast((_('linkMarkersRemovedToast') || '').replace('{count}', count));
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
        okButton.textContent = (typeof _ === 'function' && _('submitButton')) || 'OK';
        noButton.textContent = (typeof _ === 'function' && _('cancel')) || 'Cancel';
        noButton.style.display = 'inline-block';
        const cleanup = () => {
            popup.classList.remove('show');
            okButton.removeEventListener('click', onOk);
            noButton.removeEventListener('click', onCancel);
            folderIdInput.removeEventListener('keydown', onKeyDown);
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
        const onKeyDown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                onOk();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                onCancel();
            }
        };
        okButton.removeEventListener('click', handleSubmitFolderId);
        okButton.addEventListener('click', onOk);
        noButton.addEventListener('click', onCancel);
        folderIdInput.addEventListener('keydown', onKeyDown);
        popup.classList.add('show');
        folderIdInput.focus();
    });
}

/**
 * Истинско продължително натискане (b2.36): задейства callback веднъж, ако пръстът остане
 * неподвижен върху елемента за delay ms. Отменя се при движение над tolerance px (за да
 * работи превъртането), при отпускане, при отмяна на докосването и при скрол.
 * Мишка не задейства — жестът е за телефон; на компютър има Shift+клик и Ctrl+A.
 * @param {HTMLElement} element - Елементът, който се натиска.
 * @param {Function} callback - Функцията, която се изпълнява при задействане (получава началното събитие).
 * @param {Object} [options] - { delay = 500, tolerance = 10 }
 */
function addLongPress(element, callback, options = {}) {
    const delay = options.delay || 500;
    const tolerance = options.tolerance || 10;
    let timer = null;
    let startX = 0;
    let startY = 0;
    const cancel = () => {
        if (timer) {
            clearTimeout(timer);
            timer = null;
        }
    };
    const startPress = (e) => {
        if (e && e.pointerType === 'mouse') return; // само пръст/писалка
        const p = (e && e.touches && e.touches[0]) ? e.touches[0] : e;
        if (!p || p.clientX === undefined) return;
        startX = p.clientX;
        startY = p.clientY;
        cancel();
        timer = setTimeout(() => {
            timer = null;
            callback(e);
        }, delay);
    };
    const movePress = (e) => {
        if (!timer) return;
        const p = (e && e.touches && e.touches[0]) ? e.touches[0] : e;
        if (!p || p.clientX === undefined) {
            cancel();
            return;
        }
        if (Math.abs(p.clientX - startX) > tolerance || Math.abs(p.clientY - startY) > tolerance) cancel();
    };
    element.addEventListener('touchstart', startPress, { passive: true });
    element.addEventListener('pointerdown', startPress);
    element.addEventListener('touchmove', movePress, { passive: true });
    element.addEventListener('pointermove', movePress, { passive: true });
    element.addEventListener('touchend', cancel);
    element.addEventListener('touchcancel', cancel);
    element.addEventListener('pointerup', cancel);
    element.addEventListener('pointercancel', cancel);
    element.addEventListener('pointerleave', cancel);
    element.addEventListener('mouseup', cancel);
    element.addEventListener('mouseleave', cancel);
    element.addEventListener('scroll', cancel, { passive: true, capture: true });
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
    // Set default useIndexedDb to true if not set
    if (localStorage.getItem('useIndexedDb') === null) {
        localStorage.setItem('useIndexedDb', 'true');
    }
    // Инициализация на DOM елементи
    signoutButton = null; // локален режим: няма акаунт, няма изход
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
    initNoteWindows(); // the note windows wire themselves (wireNoteWindow)
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
    if (loaderFolderInfo) {
        loaderFolderInfo.textContent = '';
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
            // Trigger the assistant-1 guide (зарежда асистента, ако още не е зареден)
            if (await ensureKBAssistant()) {
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
    reloadButton.addEventListener('click', () => {
        // Локален режим: презареждаме всичко от IndexedDB.
        mainLogic();
    });

    function toggleAdvancedSettings(forceState = null) {
        const advancedSettingsSpan = document.getElementById('advanced-settings-span');
        const accordionHeader = document.querySelector('.accordion-header');
        const isAdvanced = localStorage.getItem('showAdvancedSettings') === 'true';
        const nextState = forceState !== null ? forceState : !isAdvanced;
        if (!nextState) {
            localStorage.setItem('showAdvancedSettings', 'false');
            if (advancedSettingsSpan) advancedSettingsSpan.setAttribute('hidden', '');
            if (accordionHeader && accordionHeader.parentElement) {
                accordionHeader.parentElement.classList.remove('active');
                const content = accordionHeader.parentElement.querySelector('.accordion-content');
                if (content) content.style.maxHeight = null;
            }
            if (typeof showToast === 'function') {
                showToast((typeof _ === 'function' && _('advancedSettingsDisabled')) || 'Advanced settings hidden');
            }
        } else {
            localStorage.setItem('showAdvancedSettings', 'true');
            if (advancedSettingsSpan) advancedSettingsSpan.removeAttribute('hidden');
            if (typeof updateAdvancedSettingsVisibility === 'function') updateAdvancedSettingsVisibility();
            if (accordionHeader && accordionHeader.parentElement) {
                const accordion = accordionHeader.parentElement;
                accordion.classList.add('active');
                const content = accordion.querySelector('.accordion-content');
                if (content) content.style.maxHeight = Math.max(content.scrollHeight, 1000) + 'px';
                const settingsModalBody = document.getElementById('settings-modal-body');
                if (settingsModalBody) {
                    setTimeout(() => {
                        settingsModalBody.scrollTo({ top: settingsModalBody.scrollHeight, behavior: 'smooth' });
                    }, 300);
                }
            }
            if (typeof showToast === 'function') {
                showToast((typeof _ === 'function' && _('advancedSettingsEnabled')) || 'Advanced settings enabled');
            }
        }
    }

    settingsButton.addEventListener('click', () => {
        const advancedSettingsSpan = document.getElementById('advanced-settings-span');
        const accordionHeader = document.querySelector('.accordion-header');
        if (localStorage.getItem('showAdvancedSettings') === 'true') {
            if (advancedSettingsSpan) advancedSettingsSpan.removeAttribute('hidden');
        } else {
            if (advancedSettingsSpan) advancedSettingsSpan.setAttribute('hidden', '');
            if (accordionHeader && accordionHeader.parentElement) {
                accordionHeader.parentElement.classList.remove('active');
                const content = accordionHeader.parentElement.querySelector('.accordion-content');
                if (content) content.style.maxHeight = null;
            }
        }
        // Запомняме началното състояние на чекбоксовете при отваряне на настройките
        // Първо обновяваме състоянието на чекбоксовете, после го запазваме ---
        settingsInitialState = {};
        document.getElementById('settings-modal').classList.add('visible');
        if (typeof updateAdvancedSettingsVisibility === 'function') updateAdvancedSettingsVisibility();
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

    // Локален режим: няма мрежа за следене и няма синхронизация.

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
            triggerSearch();
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
        // b2.20: показват се само запазените търсения (без дубликати) — последното търсене вече не се помни
        const allSearchesForDisplay = [...new Set(savedSearches)];
        allSearchesForDisplay.forEach((term) => {
            if (!term) return; // Don't show empty saved searches
            const item = document.createElement('div');
            item.className = 'saved-search-item';
            item.textContent = term;
            item.addEventListener('click', () => {
                if (searchBox) {
                    searchBox.value = term;
                    triggerSearch();
                }
                popup.style.display = 'none';
            });
            contentContainer.appendChild(item); // Add items to the new container
        });
    }

    // This function will be the single point for applying search and UI updates
    const triggerSearch = () => {
        // b2.20: „/9“ без текст не е търсене — бордът не превключва, докато няма дума след командата
        const parsedSearch = parseSearchQuery(searchBox.value);
        const hasTextTrimmed = parsedSearch.query.trim().length > 0;
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
        saveSearchBtn.style.display = (hasTextTrimmed && !parsedSearch.lex) ? 'flex' : 'none';

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
        // Масовият избор (b2.36) се изчиства при търсене — иначе се трият невидими бележки.
        if (selectionState.active && searchBox.value.trim() !== '') exitSelectionMode();
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
        if (val === '/?' || val === '/help') {
            renderCommandsHelpPopup();
            saveSearchBtn.style.display = 'none';
            clearTimeout(searchDebounceTimeout);
            return;
        }
        const isLexInput = parseSearchQuery(val).lex;
        if (val.startsWith('/')) {
            saveSearchBtn.style.display = 'none';
            const popup = document.getElementById('saved-searches-popup');
            if (popup) popup.style.display = 'none';
            if (!isLexInput) {
                clearTimeout(searchDebounceTimeout);
                return;
            }
            // b2.20: „/9 …“ и „/lex …“ продължават към търсенето в реално време
        }
        if (!event.isTrusted) return;
        clearTimeout(searchDebounceTimeout);
        searchDebounceTimeout = setTimeout(() => {
            triggerSearch();
        }, 300); // Wait 300ms after last keystroke
    });

    // Handle Enter key
    searchBox.addEventListener('keydown', async (event) => {
        if (event.key === 'Enter') {
            event.preventDefault(); // Prevent form submission if any
            searchBox.blur(); // Hide keyboard on mobile
            const val = searchBox.value.trim();
            if (val.startsWith('/')) {
                const handled = await handleSearchCommand(val);
                if (handled) {
                    if (val !== '/?' && val !== '/help') {
                        searchBox.value = '';
                        clearSearchBtn.style.display = 'none';
                        saveSearchBtn.style.display = 'none';
                        const popup = document.getElementById('saved-searches-popup');
                        if (popup) popup.style.display = 'none';
                    }
                    return;
                }
            }
            triggerSearch(); // Ensure search is applied
            document.getElementById('saved-searches-popup').style.display = 'none'; // Close popup
        }
    });

    // Clear Button Logic
    clearSearchBtn.addEventListener('click', () => {
        searchBox.value = '';
        triggerSearch();
        searchBox.blur();
        const popup = document.getElementById('saved-searches-popup');
        if (popup) popup.style.display = 'none';
    });

    searchBox.addEventListener('focus', () => {
        if (searchBox.value.trim() === '/?' || searchBox.value.trim() === '/help') {
            renderCommandsHelpPopup();
        } else {
            renderSavedSearchesPopup();
        }
    });
    saveSearchBtn.addEventListener('click', async (e) => {
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

    // Event listener for submit button in folder ID popup
    document.getElementById('submitFolderIdBtn').addEventListener('click', handleSubmitFolderId);
    document.getElementById('folderIdInput').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleSubmitFolderId();
        }
    });

    document.querySelectorAll('.modal-close').forEach(btn => {
        if (btn.closest('.note-window')) return; // the note windows have their own (wireNoteWindow)
        btn.addEventListener('click', async (e) => {
            const modal = e.currentTarget.closest('.modal-overlay');
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
    settingsCloseBtnPrimary.addEventListener('click', () => {
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
            }
        }
    });

    document.querySelectorAll('.modal-overlay').forEach(modal => {
        if (modal.classList.contains('note-window')) return; // a note window does not cover the page
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
                        }
                    }
                }
            }
        });
    });
    // Apply initial font size settings from localStorage
    const initialNoteFontSize = localStorage.getItem('noteFontSize') || 16;
    document.documentElement.style.setProperty('--note-font-size', `${initialNoteFontSize}px`);
    // Apply initial state for datemod visibility
    const shouldHideDatemod = localStorage.getItem('showDatemod') === 'false';
    document.body.classList.toggle('hide-datemod', shouldHideDatemod);
    const initialModalFontSize = localStorage.getItem('modalFontSize') || 16;
    modalBody.style.fontSize = `${initialModalFontSize}px`;

    // Load saved searches and settings from localStorage
    // b2.20: последното търсене не се помни и не се възстановява — при старт полето е празно и режимът изключен.
    // Остатъкът от по-стари версии се изчиства.
    localStorage.removeItem('lastSearchTerm');
    savedSearches = JSON.parse(localStorage.getItem('savedSearches') || '[]');
    maxSavedSearches = parseInt(localStorage.getItem('maxSavedSearches') || '20', 10);
    setLanguage(currentLang);
    // Add app version to the settings modal title and hold gesture for Advanced Settings
    const settingsTitle = document.querySelector('#settings-modal .modal-content-box h3');
    if (settingsTitle) {
        renderVersionLabels();
        let versionPressTimer = null;
        let versionLongPressTriggered = false;
        const startVersionPress = () => {
            versionLongPressTriggered = false;
            versionPressTimer = setTimeout(() => {
                versionLongPressTriggered = true;
                if (navigator.vibrate) navigator.vibrate([60, 50, 60]);
                toggleAdvancedSettings();
            }, 3000);
        };
        const cancelVersionPress = () => {
            if (versionPressTimer) clearTimeout(versionPressTimer);
        };
        settingsTitle.addEventListener('touchstart', startVersionPress, { passive: true });
        settingsTitle.addEventListener('touchend', cancelVersionPress);
        settingsTitle.addEventListener('touchmove', cancelVersionPress);
        settingsTitle.addEventListener('touchcancel', cancelVersionPress);
        settingsTitle.addEventListener('mousedown', (e) => {
            if (e.button === 0) startVersionPress();
        });
        settingsTitle.addEventListener('mouseup', cancelVersionPress);
        settingsTitle.addEventListener('mouseleave', cancelVersionPress);
        settingsTitle.addEventListener('click', (e) => {
            if (versionLongPressTriggered) {
                versionLongPressTriggered = false;
                e.preventDefault();
                e.stopPropagation();
            } else if (e.ctrlKey) {
                toggleAdvancedSettings();
            }
        });
        settingsTitle.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            return false;
        });
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
    // Часовникът и при работа без Google Drive (IndexedDB/локална папка); празен allNotesData не му пречи.
    startCalendarBellClock();
    if (calendarButton) {
        calendarButton.addEventListener('click', () => {
            // b2.14: докато е камбанка, кликът отваря бележката на събитието, не филтъра.
            if (calBellActive) {
                openCalendarBellNote();
                return;
            }
            filterNotesByBoard('calendar');
        });
    }

    // Локален режим: режимът не се сменя. Бутонът само казва къде живеят данните.
    modeButton.addEventListener('click', () => {
        showToast(_('localModeToast') || 'Локален режим: бележките са само в тази база (IndexedDB).', 4000);
    });
    renderLocalModeBadge();

    // Добавяме event listener за показване на системна информация при клик на брояча
    const noteCounter = document.getElementById('note-counter');
    noteCounter.addEventListener('click', async () => {
        if (isLoadCancelled) return;
        try {
            const boardsCount = (boardsData || []).length;
            const notesCount = (allNotesData || []).length;
            const dbSource = await getConfig('dbSource');
            const dbNoteIdType = await getConfig('dbNoteIdType');
            const content = [
                `${_('sysInfoBoards')}: ${boardsCount}`,
                `${_('sysInfoNotes')}: ${notesCount}`,
                ``,
                `${_('sysInfoDb')} NotesDB v${NOTES_DB_VERSION}`,
                `${_('sysInfoMode')}: IndexedDB (локално)`,
                `${_('sysInfoSource')}: ${dbSource ?? '-'}`,
                `${_('sysInfoAttachmentLinks')}: ${dbNoteIdType || 'gdid'}`,
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
}


// Стартираме приложението веднага: локален режим, без вход и без проверка за токен.
(async () => {
    startApp();
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

function enableSettingsControls() {
    const settingsModal = document.getElementById('settings-modal');
    if (!settingsModal) return;
    const controlsToEnable = [
        'use-indexeddb-checkbox', 'create-db-btn', 'delete-db-btn'
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

function updateGlobalStateFlags() {
    // Локален режим: няма Drive, няма локална папка, няма архив. Само базата.
    useGoogleDb = false;
    useLocalFolder = false;
    useArhDb = false;
    useIndexedDb = true;
    automatedTimer = localStorage.getItem('automatedTimer') !== 'false';
}


/**
 * Първо стартиране: базата се създава празна и без нито един борд екранът остава
 * празен — няма къде да се създаде бележка. Затова при празна база се слага борд
 * „Main“ с бележка „Welcome“.
 *
 * Прави се само веднъж. Флагът в config store-а (върви заедно с базата) пази от
 * повторно слагане, ако човек сам изтрие всички бордове. При „създай база наново“
 * флагът изчезва заедно с базата и началният борд се появява отново.
 */
async function seedFirstRunContent() {
    try {
        if (await getConfig(FIRST_RUN_SEEDED_KEY)) return;

        const [boards, notes] = await Promise.all([
            getAllFromDB(BOARD_STORE_NAME),
            getAllFromDB(NOTE_STORE_NAME)
        ]);
        // Има данни (собствени или внесени от резервно копие): нищо не пипаме,
        // само отбелязваме, че началното съдържание вече не се дължи.
        if ((boards && boards.length) || (notes && notes.length)) {
            await putConfig(FIRST_RUN_SEEDED_KEY, Date.now());
            return;
        }

        const now = Date.now();
        let noteColor = 0;
        try { noteColor = getDefaultNoteBgValue(); } catch (e) { noteColor = 0; }

        const boardGdid = localUuid();
        const board = {
            "backcolor": 0, "backnum": 0, "backpath": "", "color": "#4CAF50",
            "colorfont": "#000", "datemod": now, "gdid": boardGdid,
            "id": 1, "numord": 1, "status": 0, "title": "Main"
        };
        const note = {
            "alarm_type": -1, "boardid": boardGdid, "calendarDate": 0,
            "color": noteColor, "date": now, "datemod": now, "eventId": 0,
            "gdid": localUuid(), "id": 1, "notetxt": "Welcome",
            "numord": 1, "pass": false, "sellist": 0, "status": 0,
            "text_span": "", "timer": 0, "timer_type": -1, "timer_val": 1,
            "title_span": "", "type": 0, "version": 243
        };

        await bulkPutDB(BOARD_STORE_NAME, [board], true);
        await bulkPutDB(NOTE_STORE_NAME, [note], true);
        await putConfig(FIRST_RUN_SEEDED_KEY, now);
        console.log('[First run] Created the Main board with a Welcome note.');
    } catch (e) {
        // Празна начална база не бива да спира приложението.
        console.warn('[First run] Could not create the initial board:', e);
    }
}

async function mainLogic() {
    if (!appTranslations[currentLang]) {
        await loadTranslations(currentLang);
    }
    // --- Локален режим: зареждане само от IndexedDB ---
    isOffline = true;
    updateGlobalStateFlags();
    dbSourceGlobal = null;
    dbNoteIdTypeGlobal = 'gdid';
    isLoadCancelled = false;
    updatedNoteGdims = [];
    dataIntegrityIssues = [];
    isInitialLoad = true;
    initializeLoad();
    if (loaderText) loaderText.textContent = _('loadingFromLocal') || 'Loading from the local database...';

    try {
        dbExists = await checkDbExists(NOTES_DB_NAME);
        // Празна база получава начален борд „Main“ с бележка „Welcome“.
        await seedFirstRunContent();
        await fetchAllDataLocal();
        await renderUI({ boardParseError: false });
    } catch (e) {
        console.error("Error loading local data:", e);
    }

    showAppUI();

    if (currentBoardFilter !== 'calendar' && currentBoardFilter !== 'calendar_monthly' && currentBoardFilter !== 'calendar_weekly') {
        const addNoteFab = document.getElementById('add-note-fab');
        if (addNoteFab) addNoteFab.style.display = 'flex';
    }
    if (window.showInstallButton) window.showInstallButton();
}


// =================================================================================
// IV.a.2. ЛОКАЛНИ ФАЙЛОВЕ (store `files`) — картинки, звук, видео, прикачени
// =================================================================================
/**
 * Локален ключ за нов запис: борд, бележка или файл. Идва от crypto.randomUUID,
 * за да не съвпадне с нищо друго в базата.
 */
function localUuid() {
    try {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) { /* остава резервният вариант */ }
    return 'local-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Записва blob в store `files` и връща ключа му. */
async function saveBlobToFiles(name, blob, mimeType, noteGdid = null) {
    const key = localUuid();
    const record = {
        key: key,
        name: name || 'file',
        mime: mimeType || (blob && blob.type) || 'application/octet-stream',
        size: blob ? blob.size : 0,
        noteid: noteGdid || null,
        datemod: Date.now(),
        blob: blob
    };
    await bulkPutDB(FILES_STORE_NAME, [record], true);
    return key;
}

/** Чете един запис от store `files` по ключ. */
async function getFileRecord(key) {
    if (!key) return null;
    try {
        return await getFromDB(FILES_STORE_NAME, key);
    } catch (e) {
        console.warn('Could not read file record', key, e);
        return null;
    }
}

/** Връща object URL за файл по ключ (или null). Извикващият пуска URL-а след употреба. */
async function getFileObjectUrl(key) {
    const record = await getFileRecord(key);
    if (!record || !record.blob) return null;
    return URL.createObjectURL(record.blob);
}

/** Трие един файл по ключ. */
async function deleteFileRecord(key) {
    if (!key) return;
    try {
        await deleteFromDB(FILES_STORE_NAME, key);
    } catch (e) {
        console.warn('Could not delete file record', key, e);
    }
}

/** Трие всички файлове, прикачени към бележка (media.pathGD сочи към ключа в store `files`). */
async function deleteFilesForNote(noteGdid) {
    if (!noteGdid) return 0;
    const related = (mediaData || []).filter(m => m.noteid === noteGdid || String(m.noteid) === String(noteGdid));
    let deleted = 0;
    for (const media of related) {
        if (media.pathGD) { await deleteFileRecord(media.pathGD); deleted++; }
        const idx = mediaData.indexOf(media);
        if (idx !== -1) mediaData.splice(idx, 1);
        try { await deleteFromDB(MEDIA_STORE_NAME, media.gdid || media.id); } catch (e) { }
    }
    return deleted;
}

/** Значката в хедъра: къде живеят данните. Иконата на режима не се сменя повече. */
function renderLocalModeBadge() {
    const badge = document.getElementById('mode-badge');
    if (badge && typeof _ === 'function') {
        badge.textContent = _('localModeBadge') || 'локално · IndexedDB';
    }
    const modeButton = document.getElementById('mode_button');
    if (modeButton) {
        modeButton.title = _('localModeTooltip') || 'Локален режим: данните са в този браузър';
    }
}

// =================================================================================
// IV.b. РЕЗЕРВНО КОПИЕ (експорт / импорт на JSON файл)
// =================================================================================
// Без Drive няма облак: резервното копие е файл, който потребителят избира къде да
// запази. Файлът съдържа бордовете, бележките и медийните записи; байтовете на
// прикачените файлове влизат като base64, за да е пълно копието.

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = String(reader.result || '');
            resolve(result.substring(result.indexOf(',') + 1));
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function base64ToBlob(base64, mime) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime || 'application/octet-stream' });
}

/** Експорт на цялата база в един JSON файл. */
async function backupExport() {
    try {
        const boards = await getAllFromDB(BOARD_STORE_NAME);
        const notes = await getAllFromDB(NOTE_STORE_NAME);
        const media = await getAllFromDB(MEDIA_STORE_NAME);
        let files = [];
        try { files = await getAllFromDB(FILES_STORE_NAME); } catch (e) { files = []; }

        const filesOut = [];
        for (const record of (files || [])) {
            if (!record || !record.blob) continue;
            try {
                filesOut.push({
                    key: record.key,
                    name: record.name,
                    mime: record.mime,
                    size: record.size,
                    noteid: record.noteid,
                    datemod: record.datemod,
                    data: await blobToBase64(record.blob)
                });
            } catch (e) {
                console.warn('Could not encode attachment for export:', record.key, e);
            }
        }

        const payload = {
            app: 'CX Notes',
            format: 'cx-notes-backup',
            version: NOTES_DB_VERSION,
            exportedAt: new Date().toISOString(),
            boards: boards || [],
            notes: notes || [],
            media: media || [],
            files: filesOut
        };

        const json = JSON.stringify(payload);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'cx-notes-backup-' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        showToast(_('backupExported') || 'Backup exported.', 4000);
    } catch (e) {
        console.error('Backup export failed:', e);
        showToast((_('backupExportFailed') || 'Backup export failed: {msg}').replace('{msg}', e.message), 6000);
    }
}

/** Импорт на резервно копие от JSON файл. Замества съдържанието на базата. */
async function backupImport(file) {
    try {
        const confirmed = await showConfirmation(_('confirmBackupImport') || 'Importing replaces the current notes with the ones in the file. Continue?');
        if (!confirmed) return;

        const text = await file.text();
        const payload = JSON.parse(text);
        if (!payload || payload.format !== 'cx-notes-backup') {
            showToast(_('backupBadFile') || 'This file is not a CX Notes backup.', 6000);
            return;
        }

        const db = await openNotesDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction([BOARD_STORE_NAME, NOTE_STORE_NAME, MEDIA_STORE_NAME, FILES_STORE_NAME], 'readwrite');
            tx.objectStore(BOARD_STORE_NAME).clear();
            tx.objectStore(NOTE_STORE_NAME).clear();
            tx.objectStore(MEDIA_STORE_NAME).clear();
            tx.objectStore(FILES_STORE_NAME).clear();
            (payload.boards || []).forEach(b => tx.objectStore(BOARD_STORE_NAME).put(b));
            (payload.notes || []).forEach(n => tx.objectStore(NOTE_STORE_NAME).put(n));
            (payload.media || []).forEach(m => tx.objectStore(MEDIA_STORE_NAME).put(m));
            (payload.files || []).forEach(f => {
                tx.objectStore(FILES_STORE_NAME).put({
                    key: f.key,
                    name: f.name,
                    mime: f.mime,
                    size: f.size,
                    noteid: f.noteid,
                    datemod: f.datemod,
                    blob: base64ToBlob(f.data, f.mime)
                });
            });
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        });

        dbExists = await checkDbExists(NOTES_DB_NAME);
        showToast(_('backupImported') || 'Backup imported.', 5000);
        await mainLogic();
    } catch (e) {
        console.error('Backup import failed:', e);
        showToast((_('backupImportFailed') || 'Backup import failed: {msg}').replace('{msg}', e.message), 6000);
    }
}

async function fetchAllDataLocal() {
    console.log("Fetching all data from local IndexedDB...");
    const [bData, mData, nData, dbSource, dbNoteIdType] = await Promise.all([
        getAllFromDB(BOARD_STORE_NAME),
        getAllFromDB(MEDIA_STORE_NAME),
        getAllFromDB(NOTE_STORE_NAME),
        getConfig('dbSource'),
        getConfig('dbNoteIdType')
    ]);
    boardsData = bData || [];
    trackMaxBoardIds(boardsData);
    mediaData = mData || [];
    allNotesData = nData || [];
    trackMaxIds(allNotesData);
    dbSourceGlobal = dbSource ?? null;
    dbNoteIdTypeGlobal = dbNoteIdType || 'gdid';
    console.log(`Loaded ${boardsData.length} boards, ${mediaData.length} media, and ${allNotesData.length} notes from DB.`);
}


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
            const fileKey = attachment.pathGD || attachment.path;
            let mediaUrl;
            try {
                // Локален режим: файлът е blob в store `files`, ключът му е в pathGD.
                const record = await getFileRecord(fileKey);
                if (!record || !record.blob) {
                    throw new Error(_('errorOpenFile') ? _('errorOpenFile').replace('{filename}', attachment.path || fileKey) : 'File not found');
                }
                mediaUrl = URL.createObjectURL(record.blob);
                overlay.mediaUrlToRevoke = mediaUrl;
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
let floatingPositionSettingsSaveTimer = null;

function scheduleFloatingPositionSettingsSave() {
    clearTimeout(floatingPositionSettingsSaveTimer);
    floatingPositionSettingsSaveTimer = setTimeout(() => {
        // Позициите на плаващите бутони се пазят в localStorage (виж makeElementDraggable).
    }, 600);
}

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
            scheduleFloatingPositionSettingsSave();
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

function getNoteUiState(uiState) {
    return uiState && typeof uiState === 'object' && !Array.isArray(uiState) ? uiState : {};
}

// Записът в бележката е с кратки ключове: {exp, size: {w, h}, pos: {x, y}}. Четат се и старите
// дълги (isExpanded, editorSize: {width, height}); windowPosition - не. Пише се само късата форма.
function getNoteExpanded(uiState) {
    const u = getNoteUiState(uiState);
    return u.exp !== undefined ? u.exp === true : u.isExpanded === true;
}

function getValidEditorSize(uiState) {
    const u = getNoteUiState(uiState);
    const size = u.size !== undefined ? u.size : u.editorSize;
    if (!size || typeof size !== 'object') return null;
    const w = Number(size.w !== undefined ? size.w : size.width);
    const h = Number(size.h !== undefined ? size.h : size.height);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
    return { width: Math.round(w), height: Math.round(h) };
}

// Мястото на прозореца (uiState.pos) пътува с бележката; записва се само с обикновения запис:
// местенето я прави „с промени“. Размерът в бележката (uiState.size) идва само от Ctrl/задържане.
function getValidWindowPosition(uiState) {
    const pos = getNoteUiState(uiState).pos;
    if (!pos || typeof pos !== 'object') return null;
    const x = Number(pos.x), y = Number(pos.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x: Math.round(x), y: Math.round(y) };
}

// Каноничната (къса) форма на записа; дългите ключове се махат.
function normalizeNoteUiState(uiState) {
    const u = { ...getNoteUiState(uiState) };
    const exp = getNoteExpanded(u), size = getValidEditorSize(u), pos = getValidWindowPosition(u);
    ['isExpanded', 'editorSize', 'windowPosition'].forEach(k => { delete u[k]; });
    delete u.exp; delete u.size; delete u.pos;
    if (exp) u.exp = true;
    if (size) u.size = { w: size.width, h: size.height };
    if (pos) u.pos = { x: pos.x, y: pos.y };
    return u;
}

function noteUiSizeKey(size) { return size ? { size: { w: size.width, h: size.height } } : {}; }
function noteUiPosKey(pos) { return pos ? { pos: { x: pos.x, y: pos.y } } : {}; }

// При отваряне старият (дълъг) uiState се нормализира само в паметта: нищо не се пише и бележката
// не става „с промени“. Късата форма стига до диска с първия запис заради истинска промяна.
function normalizeNoteUiStateInMemory(noteObj) {
    if (!noteObj || !noteObj.uiState || typeof noteObj.uiState !== 'object' || Array.isArray(noteObj.uiState)) return;
    const normalized = normalizeNoteUiState(noteObj.uiState);
    if (JSON.stringify(normalized) !== JSON.stringify(noteObj.uiState)) noteObj.uiState = normalized;
}

// Час и повторение на бележка с дата (етап 2 на календара): uiState.cTime = "HH:MM" (няма ли го -
// целодневна), uiState.cRepeat = {f: daily|weekly|monthly|yearly, u: "YYYY-MM-DD"|null} („без“ =
// ключът липсва). В модала чернова стои в dataset.cTime / dataset.cRepeat, а dataset.calBase е
// стойността от бележката при отваряне. Без редакция смяната в реда се записва веднага, както датата от
// бутона (b2.16); при редакция / преглед чака обикновения запис на бележката.
const NOTE_CAL_REPEAT_FREQS = ['daily', 'weekly', 'monthly', 'yearly'];

function getNoteCalTime(uiState) {
    const t = getNoteUiState(uiState).cTime;
    return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t) ? t : '';
}

function getNoteCalRepeat(uiState) {
    const r = getNoteUiState(uiState).cRepeat;
    if (!r || typeof r !== 'object' || !NOTE_CAL_REPEAT_FREQS.includes(r.f)) return null;
    return { f: r.f, u: typeof r.u === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.u) ? r.u : null };
}

function noteCalStateKey(time, repeat) {
    return JSON.stringify({ t: time || '', r: repeat || null });
}

function getModalCalDraft(modalBodyElem) {
    let repeat = null;
    try { repeat = modalBodyElem.dataset.cRepeat ? JSON.parse(modalBodyElem.dataset.cRepeat) : null; } catch (e) { repeat = null; }
    return { time: getNoteCalTime({ cTime: modalBodyElem.dataset.cTime }), repeat: getNoteCalRepeat({ cRepeat: repeat }) };
}

function setModalCalDraft(modalBodyElem, time, repeat) {
    if (time) modalBodyElem.dataset.cTime = time; else delete modalBodyElem.dataset.cTime;
    if (repeat) modalBodyElem.dataset.cRepeat = JSON.stringify(repeat); else delete modalBodyElem.dataset.cRepeat;
}

// При отваряне черновата идва от бележката. При опресняване на същата бележка непроменената чернова
// следва бележката (запис от друго устройство), а променената се пази.
function initModalCalDraft(modalBodyElem, noteObj, keepDraft) {
    const time = getNoteCalTime(noteObj && noteObj.uiState), repeat = getNoteCalRepeat(noteObj && noteObj.uiState);
    const draft = getModalCalDraft(modalBodyElem);
    const isDirty = keepDraft && modalBodyElem.dataset.calBase !== undefined && noteCalStateKey(draft.time, draft.repeat) !== modalBodyElem.dataset.calBase;
    modalBodyElem.dataset.calBase = noteCalStateKey(time, repeat);
    if (!isDirty) setModalCalDraft(modalBodyElem, time, repeat);
}

function hasModalCalChanges(modalBodyElem, noteObj) {
    const draft = getModalCalDraft(modalBodyElem);
    return noteCalStateKey(draft.time, draft.repeat) !== noteCalStateKey(getNoteCalTime(noteObj && noteObj.uiState), getNoteCalRepeat(noteObj && noteObj.uiState));
}

// Слага черновата в uiState: празен час / „без“ повторение махат ключа.
function applyNoteCalDraft(uiState, draft) {
    const u = { ...uiState };
    if (draft.time) u.cTime = draft.time; else delete u.cTime;
    if (draft.repeat) u.cRepeat = { f: draft.repeat.f, u: draft.repeat.u || null }; else delete u.cRepeat;
    return u;
}

// Редът „час / повторение / до“ под долната лента на модала (b2.12). Показва се само при зададена дата;
// без дата се скрива, но черновата и стойностите в бележката остават. Датата НЕ е в реда - тя е само в
// лентата и се задава/маха от бутона с календара там (b2.15). Часът се вижда като в лентата (formatTime),
// а не както Chrome рисува нативния input.
// b2.17: часовникът и часът са само тук (не и в лентата) и оттук се задава часът. В преглед празните
// полета (без час, „без“ повторение, без „До“) не се виждат, а без нищо за показване се скрива целият
// ред; в редакция трите полета стоят винаги, празните като „час“ / „без“ / „до“.
// b2.18: прегледът с окото се държи като обикновения изглед (без празни полета); редът е подравнен вляво.
function buildNoteCalRow(modalBodyElem) {
    const row = document.createElement('div');
    row.className = 'note-cal-row';
    // <label>: щракване по надписа отива в полето. Без labelKey - без надпис. Датата е само в лентата (b2.15).
    const chip = (labelKey, fallback, tag = 'label') => {
        const el = document.createElement(tag);
        el.className = 'note-cal-chip';
        if (labelKey) {
            const lbl = document.createElement('span');
            lbl.className = 'note-cal-lbl';
            lbl.textContent = _(labelKey) || fallback;
            el.appendChild(lbl);
        }
        return el;
    };
    const clearBtn = (titleKey, fallback, onClick) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'note-cal-clear';
        b.textContent = '✕';
        b.title = _(titleKey) || fallback;
        b.setAttribute('aria-label', b.title);
        b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(); });
        return b;
    };

    const timeChip = chip(null);
    timeChip.classList.add('note-cal-time');
    // Видимият час е по устройството (formatTime); прозрачното <input type="time"> отгоре (върху часовника
    // и часа) само отваря избора (b2.15, часовникът от b2.17).
    const timeField = document.createElement('span');
    timeField.className = 'note-cal-time-field';
    const timeIcon = document.createElement('span');
    timeIcon.className = 'note-cal-time-icon';
    timeIcon.innerHTML = clockIconSvg;
    const timeText = document.createElement('span');
    timeText.className = 'note-cal-time-text';
    const timeInput = document.createElement('input');
    timeInput.type = 'time';
    timeInput.className = 'note-cal-time-input';
    timeInput.addEventListener('click', () => { try { timeInput.showPicker?.(); } catch (e) { /* старите браузъри отварят избора сами */ } });
    timeField.append(timeIcon, timeText, timeInput);
    const timeClear = clearBtn('noteCalClearTime', 'Remove the time (all day)', () => { timeInput.value = ''; commit(); });
    timeChip.append(timeField, timeClear);

    const repeatChip = chip('noteCalRepeat', 'repeat');
    repeatChip.classList.add('note-cal-repeat');
    const repeatSelect = document.createElement('select');
    repeatSelect.className = 'note-cal-repeat-select';
    [['', 'noteCalRepeatNone', 'none'], ['daily', 'noteCalRepeatDaily', 'every day'], ['weekly', 'noteCalRepeatWeekly', 'every week'],
    ['monthly', 'noteCalRepeatMonthly', 'every month'], ['yearly', 'noteCalRepeatYearly', 'every year']].forEach(([value, key, fallback]) => {
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = _(key) || fallback;
        repeatSelect.appendChild(opt);
    });
    repeatChip.appendChild(repeatSelect);

    const untilChip = chip('noteCalUntil', 'until');
    untilChip.classList.add('note-cal-until');
    // Видимата дата е по устройството; прозрачното <input type="date"> отгоре само отваря избора.
    const untilField = document.createElement('span');
    untilField.className = 'note-cal-until-field';
    const untilText = document.createElement('span');
    untilText.className = 'note-cal-until-text';
    const untilInput = document.createElement('input');
    untilInput.type = 'date';
    untilInput.className = 'note-cal-until-input';
    untilInput.addEventListener('click', () => { try { untilInput.showPicker?.(); } catch (e) { /* старите браузъри отварят избора сами */ } });
    untilField.append(untilText, untilInput);
    const untilClear = clearBtn('noteCalClearUntil', 'No end date', () => { untilInput.value = ''; commit(); });
    untilChip.append(untilField, untilClear);

    row.append(timeChip, repeatChip, untilChip);

    // Прегледът с окото е част от редакцията (промените чакат Save), но празните полета се виждат само
    // при истинска редакция - с textarea (b2.18).
    const isEditing = () => !!modalBodyElem.querySelector('textarea') || modalBodyElem.dataset.isPreview === 'true';
    const showEmpty = () => !!modalBodyElem.querySelector('textarea');
    const timeLabel = (hhmm) => {
        const m = /^(\d{2}):(\d{2})$/.exec(hhmm || '');
        if (!m) return _('noteCalTime') || 'time';
        const d = new Date();
        d.setHours(Number(m[1]), Number(m[2]), 0, 0);
        return formatTime(d.getTime()) || hhmm;
    };
    const sync = () => {
        const calDate = parseInt(modalBodyElem.dataset.calendarDate, 10) || 0;
        const draft = getModalCalDraft(modalBodyElem);
        const editing = showEmpty();
        const hasUntil = !!(draft.repeat && draft.repeat.u);
        row._noteCalEditing = editing;
        // Без редакция (и в прегледа с окото) ред без нищо за показване не стои като празна ивица (b2.17, b2.18).
        row.hidden = !(calDate > 0) || (!editing && !draft.time && !draft.repeat);
        timeInput.value = draft.time;
        timeText.textContent = timeLabel(draft.time);
        timeClear.hidden = !draft.time;
        timeChip.hidden = !editing && !draft.time;
        timeChip.classList.toggle('is-empty', !draft.time);
        repeatSelect.value = draft.repeat ? draft.repeat.f : '';
        repeatChip.hidden = !editing && !draft.repeat;
        repeatChip.classList.toggle('is-empty', !draft.repeat);
        untilChip.hidden = !editing && !hasUntil;
        untilChip.classList.toggle('is-empty', !hasUntil);
        // „До“ има смисъл само при повторение: без него полето се вижда (в редакция), но не се избира.
        untilInput.disabled = !draft.repeat;
        untilInput.value = hasUntil ? draft.repeat.u : '';
        untilText.textContent = hasUntil ? formatDeviceDate(untilInput.value) : '';
        untilClear.hidden = !hasUntil;
    };
    const commit = () => {
        const f = repeatSelect.value;
        const repeat = NOTE_CAL_REPEAT_FREQS.includes(f) ? { f, u: untilInput.value || null } : null;
        setModalCalDraft(modalBodyElem, getNoteCalTime({ cTime: timeInput.value }), getNoteCalRepeat({ cRepeat: repeat }));
        sync();
        // Без редакция няма Save, който да я приложи: записва се веднага и тръгва сверката с календара (b2.16).
        if (!isEditing()) saveModalCalDraft(modalBodyElem);
        updateModalUiStateSaveUI();
    };
    timeInput.addEventListener('change', commit);
    repeatSelect.addEventListener('change', commit);
    untilInput.addEventListener('change', commit);
    // Клавишите в полетата не стигат до клавишните комбинации на прозореца (стрелки, Delete...).
    row.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
    row._noteCalSync = sync;
    // Влизане/излизане от редакция сменя децата на тялото (textarea / готовия текст), прегледът - data-is-preview.
    row._noteCalObserver = new MutationObserver(() => {
        if (row._noteCalEditing !== showEmpty()) sync();
    });
    row._noteCalObserver.observe(modalBodyElem, { childList: true, attributes: true, attributeFilter: ['data-is-preview'] });
    sync();
    return row;
}

// Записва часа / повторението от реда в бележката без режим редакция (b2.16) - по пътя на бутона с датата
// (saveNoteCalendarChange: източниците + сверката с Google Календар). timer не се пипа.
function saveModalCalDraft(modalBodyElem) {
    const noteObj = allNotesData.find(n => (n.gdid && String(n.gdid) === String(modalBodyElem.dataset.gdid)) || (n.id && String(n.id) === String(modalBodyElem.dataset.id)));
    if (!noteObj || !hasModalCalChanges(modalBodyElem, noteObj)) return null;
    const draft = getModalCalDraft(modalBodyElem);
    noteObj.uiState = applyNoteCalDraft(normalizeNoteUiState(noteObj.uiState), draft);
    modalBodyElem.dataset.calBase = noteCalStateKey(draft.time, draft.repeat);
    // Часът вече не е в лентата на модала, а само в реда (b2.17) - там няма какво да се опреснява.
    return saveNoteCalendarChange(noteObj).catch(e => console.error('Failed to save note time/repeat', e));
}

function applyExpandedModalSize(modalContentBox, isExpanded) {
    if (isExpanded) {
        // Целият екран, без рамка (b1.91): 100% от овърлея, който е fixed inset 0, значи точно
        // екранът. 100vh не се ползва - той включва лентите на телефона и долният ръб на
        // бележката остава под тях.
        modalContentBox.style.width = '100%';
        modalContentBox.style.height = '100%';
        modalContentBox.style.maxWidth = '100%';
        modalContentBox.style.maxHeight = '100%';
        return;
    }
    modalContentBox.style.maxWidth = '100vw';
    modalContentBox.style.maxHeight = 'none';
}

function setExpandedModalFloatingControls(isExpanded) {
    document.body.classList.toggle('modal-note-expanded', isExpanded);
}

function updateModalExpandButton(isExpanded) {
    const expandBtn = document.getElementById('modal-expand-btn');
    if (!expandBtn) return;
    expandBtn.innerHTML = isExpanded ? '&#9660;' : '&#9650;';
    expandBtn.title = isExpanded ? (_('modalCollapseTooltip') || 'Restore normal size') : (_('modalExpandTooltip') || 'Expand modal');
    expandBtn.setAttribute('aria-label', expandBtn.title);
}

function getModalEditorSize() {
    const modalBodyElem = document.getElementById('modal-body');
    if (!modalBodyElem || !modalBodyElem.dataset.editorSize) return null;
    try {
        return getValidEditorSize({ editorSize: JSON.parse(modalBodyElem.dataset.editorSize) });
    } catch (e) {
        return null;
    }
}

function hasModalUiStateChanges() {
    const modalBodyElem = document.getElementById('modal-body');
    if (!modalBodyElem) return false;
    const noteObj = allNotesData.find(n => (n.gdid && String(n.gdid) === String(modalBodyElem.dataset.gdid)) || (n.id && String(n.id) === String(modalBodyElem.dataset.id)));
    if (!noteObj) return false;
    const savedUiState = getNoteUiState(noteObj.uiState);
    const isExpandedChanged = (modalBodyElem.dataset.isExpanded === 'true') !== getNoteExpanded(savedUiState);
    const savedEditorSize = getValidEditorSize(savedUiState);
    const editorSize = getModalEditorSize();
    const editorSizeChanged = JSON.stringify(editorSize) !== JSON.stringify(savedEditorSize);
    // Час / повторение (uiState.cTime / cRepeat) също са промяна по бележката.
    if (hasModalCalChanges(modalBodyElem, noteObj)) return true;
    // Преместен прозорец също е промяна (спрямо мястото при отваряне): затварянето пита за запис,
    // а записът носи uiState.pos. Собственият размер е в dataset.editorSize (само Ctrl/задържане).
    return isExpandedChanged || editorSizeChanged || !!getMovedNoteWindowPosition(modalBodyElem);
}

// Мястото на прозореца, ако е преместен спрямо отварянето (dataset.baseGeometry), иначе null.
// Разпънатият изглед не се брои - той стои в ъгъла и мястото му не се пази.
function getMovedNoteWindowPosition(modalBodyElem) {
    if (!modalBodyElem || modalBodyElem.dataset.isExpanded === 'true' || !modalBodyElem.dataset.baseGeometry) return null;
    const box = modalBodyElem.closest('.modal-content-box');
    if (!box) return null;
    let base;
    try { base = JSON.parse(modalBodyElem.dataset.baseGeometry); } catch (e) { return null; }
    const pos = { x: Math.round(parseFloat(box.style.left) || 0), y: Math.round(parseFloat(box.style.top) || 0) };
    return (base && base.x === pos.x && base.y === pos.y) ? null : pos;
}

// Отметката „както е при отварянето“ за мястото: при отваряне, в края на enableNoteEditing (ако
// още няма) и след запис.
function setNoteWindowBaseGeometry(modalBodyElem) {
    const box = modalBodyElem && modalBodyElem.closest('.modal-content-box');
    if (!box || modalBodyElem.dataset.isExpanded === 'true') { if (modalBodyElem) delete modalBodyElem.dataset.baseGeometry; return; }
    modalBodyElem.dataset.baseGeometry = JSON.stringify({ x: Math.round(parseFloat(box.style.left) || 0), y: Math.round(parseFloat(box.style.top) || 0) });
}

// Размерът, с който прозорецът стои в момента (собствен или стандартен). Записва се заедно с
// преместеното място: иначе при отваряне преценката "събира ли се мястото цяло на екрана" може да
// го отхвърли и бележката да падне на стандартното място, тоест местенето да се загуби.
function getNoteWindowCurrentSize(modalBodyElem) {
    const box = modalBodyElem && modalBodyElem.closest('.modal-content-box');
    if (!box) return null;
    const width = Math.round(box.offsetWidth), height = Math.round(box.offsetHeight);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    return { width, height };
}

function updateModalUiStateSaveUI() {
    const modalBodyElem = document.getElementById('modal-body');
    const modalContentBox = document.querySelector('#content-modal .modal-content-box');
    const footerToolbar = modalContentBox?.querySelector('.modal-footer-toolbar');
    const existingBtn = document.getElementById('note-ui-state-save-btn');
    const draftSaveBtn = document.getElementById('note-save-btn');
    const isEditing = !!modalBodyElem?.querySelector('textarea');
    const shouldShow = !isEditing && hasModalUiStateChanges() && footerToolbar;
    if (!shouldShow) {
        if (existingBtn) existingBtn.remove();
        footerToolbar?._footerDateScheduleUpdate?.();
        return;
    }
    // Preview already exposes the regular Save button, which persists both the
    // draft and the changed uiState. Do not add a duplicate disk button.
    if (draftSaveBtn && getComputedStyle(draftSaveBtn).display !== 'none') {
        if (existingBtn) existingBtn.remove();
        footerToolbar?._footerDateScheduleUpdate?.();
        return;
    }
    if (existingBtn) return;
    const saveBtn = document.createElement('div');
    saveBtn.id = 'note-ui-state-save-btn';
    saveBtn.className = 'modal-footer-btn';
    saveBtn.innerHTML = diskIconSvg;
    saveBtn.title = (typeof _ === 'function') ? (_('saveTooltip') || 'Save changes') : 'Save changes';
    saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        enableNoteEditing(modalBodyElem);
        saveEditedNote();
    });
    footerToolbar.appendChild(saveBtn);
    footerToolbar._footerDateScheduleUpdate?.();
}

function updateModalFooterDateVisibility(footerToolbar) {
    const footerDate = footerToolbar?.querySelector('.modal-note-footer');
    if (!footerDate) return;
    const visibleButtons = Array.from(footerToolbar.children).filter((child) => {
        return child !== footerDate && !child.classList.contains('modal-search-bar') && !child.hidden && getComputedStyle(child).display !== 'none';
    });
    const toolbarStyle = getComputedStyle(footerToolbar);
    const gap = Number.parseFloat(toolbarStyle.columnGap) || 10;
    const horizontalPadding = (Number.parseFloat(toolbarStyle.paddingLeft) || 0) + (Number.parseFloat(toolbarStyle.paddingRight) || 0);
    const availableWidth = Math.max(0, footerToolbar.clientWidth - horizontalPadding);
    const buttonsWidth = visibleButtons.reduce((total, button) => total + (button.offsetWidth || 40), 0);
    if (!footerDate.hidden) {
        const measured = Math.min(160, Math.max(footerDate.offsetWidth, footerDate.scrollWidth));
        if (measured > 0) footerDate.dataset.measuredWidth = String(measured);
    }
    const dateWidth = Number(footerDate.dataset.measuredWidth) || 140;
    const requiredWidth = dateWidth + buttonsWidth + (gap * visibleButtons.length);
    footerDate.hidden = requiredWidth > availableWidth;
}

function observeModalFooterDateVisibility(footerToolbar) {
    if (!footerToolbar) return;
    if (footerToolbar._footerDateResizeObserver) {
        updateModalFooterDateVisibility(footerToolbar);
        footerToolbar._footerDateScheduleUpdate?.();
        return;
    }
    let frameId = null;
    const scheduleUpdate = () => {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = requestAnimationFrame(() => {
            frameId = null;
            updateModalFooterDateVisibility(footerToolbar);
        });
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(footerToolbar);
    footerToolbar._footerDateResizeObserver = resizeObserver;
    footerToolbar._footerDateScheduleUpdate = scheduleUpdate;
    updateModalFooterDateVisibility(footerToolbar);
    scheduleUpdate();
    setTimeout(scheduleUpdate, 450);
}

// --- Several open notes (b1.82) ---------------------------------------------------------------
// Every note opens in a window of its own: a clone of #content-modal-template in #note-windows-layer.
// The rest of the code keeps talking to "the" modal (contentModal, modalBody, copyBtn,
// currentModalContent, #content-modal, #modal-body, #note-edit-textarea ...). Only the active window
// carries those ids and globals; every other window keeps its ids as data-mwid + .nw-<id> and its
// globals in win.state, and gets them back when it becomes active again (a press or a focus inside
// it, or showModal). So one window never writes into another.
const NOTE_WINDOW_Z_BASE = 10050; // inside #note-windows-layer: never reaches the rest of the page
const NOTE_WINDOW_CASCADE = 28;
const NOTE_WINDOW_CYCLE = 6;
const NOTE_WINDOW_NARROW = 768; // px: below it the cascade only goes down, no side offset
const NOTE_WINDOW_MARGIN = 10; // px around a window that is bigger than the screen (as the expanded view)
let noteWindows = []; // every window in the DOM: the open ones plus at most one idle (closed) one
let activeNoteWindow = null;
let noteWindowZ = NOTE_WINDOW_Z_BASE - 1;
let noteWindowNavInPlace = false; // < / > in a window: the neighbour note opens in the same window

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
    if (activeNoteWindow !== win) {
        const prev = activeNoteWindow;
        if (prev) {
            prev.state.currentModalContent = currentModalContent;
            prev.state.sticky = { formats: noteStickyFormats, key: noteStickyNoteKey, colors: noteStickyColors };
            stashNoteWindowIds(prev);
            prev.el.classList.remove('note-window-active');
        }
        restoreNoteWindowIds(win);
        activeNoteWindow = win;
        contentModal = win.el;
        modalBody = win.body;
        copyBtn = win.copyBtn;
        currentModalContent = win.state.currentModalContent || '';
        const sticky = win.state.sticky;
        noteStickyFormats = sticky ? sticky.formats : new Set();
        noteStickyNoteKey = sticky ? sticky.key : null;
        noteStickyColors = sticky ? sticky.colors : { 4: null, 5: null };
        win.el.classList.add('note-window-active');
        if (win.open) setExpandedModalFloatingControls(win.body.dataset.isExpanded === 'true');
    }
    if (front) raiseNoteWindow(win);
}

function raiseNoteWindow(win) {
    if (Number(win.el.style.zIndex) === noteWindowZ && noteWindowZ >= NOTE_WINDOW_Z_BASE) return;
    if (noteWindowZ > NOTE_WINDOW_Z_BASE + 5000) {
        // Keep the numbers small: renumber in the current order.
        noteWindowZ = NOTE_WINDOW_Z_BASE - 1;
        noteWindows.filter(w => w !== win)
            .sort((a, b) => (Number(a.el.style.zIndex) || 0) - (Number(b.el.style.zIndex) || 0))
            .forEach(w => { w.el.style.zIndex = String(++noteWindowZ); });
    }
    win.el.style.zIndex = String(++noteWindowZ);
    updateSingleNoteOverlay();
}

// Single note mode (setting, b1.83): a shade right under the top open window, inside the layer,
// takes every press meant for the page or another window. A press on it closes the note like the X.
// Like defaultNoteBg it lives in local storage; the profile carries it because 'singleNoteMode' is in
// appSettingsKeys: only a profile save writes it (the checkbox does not), loading a profile applies it.
function isSingleNoteMode() {
    return localStorage.getItem('singleNoteMode') === 'true';
}


function updateSingleNoteOverlay() {
    updateCloseAllNotesButtons();
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
            win.el.querySelector('.modal-close')?.click();
        });
    }
    // Same z-index as the top window and right before it in the layer: above every other window, below it.
    overlay.style.zIndex = top.el.style.zIndex || String(NOTE_WINDOW_Z_BASE);
    if (overlay.parentNode !== layer || overlay.nextSibling !== top.el) layer.insertBefore(overlay, top.el);
    overlay.classList.add('visible');
}

// Runs fn with win as "the" modal (ids and globals), then hands them back. Only the synchronous
// part of fn sees win.
function withNoteWindow(win, fn) {
    const prev = activeNoteWindow;
    if (!win || win === prev) return fn();
    activateNoteWindow(win, false);
    try {
        return fn();
    } finally {
        if (prev && noteWindows.includes(prev) && activeNoteWindow === win) activateNoteWindow(prev, false);
    }
}

function getOpenNoteWindows() {
    return noteWindows.filter(w => w.open);
}

function getTopNoteWindow(list = getOpenNoteWindows()) {
    return list.reduce((top, w) => (!top || (Number(w.el.style.zIndex) || 0) > (Number(top.el.style.zIndex) || 0)) ? w : top, null);
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

function findNoteForWindow(win) {
    const gdid = win.body.dataset.gdid, id = win.body.dataset.id;
    return allNotesData.find(n => (n.gdid && String(n.gdid) === String(gdid)) || (n.id && String(n.id) === String(id))) || null;
}

// The size a window opens with: `size` - the note's own ({width, height}, from uiState.size), else
// the global modalWidth/modalHeight (set by a plain handle drag), else 400x300. An own size bigger
// than this screen is shown shrunk to the screen minus the margin, but the shrunk value is never
// written back; a size that fits the screen is kept as it is (a note stretched exactly to the
// screen width used to be shrunk and left a gap on the right). win.geomSize is what was applied, so
// a move alone does not change it.
function applyNoteWindowSize(win, box, size) {
    let w, h;
    if (size) {
        w = size.width; h = size.height;
    } else {
        const sw = localStorage.getItem('modalWidth'), sh = localStorage.getItem('modalHeight');
        w = sw && sh ? sw : '400px';
        h = sw && sh ? sh : '300px';
    }
    let clamped = false;
    if (size) {
        // Only a size that does not fit the screen itself is shrunk (to the screen minus the
        // margin); a size that fits the screen is kept whole.
        const vw = window.innerWidth, vh = window.innerHeight;
        const maxW = vw - 2 * NOTE_WINDOW_MARGIN, maxH = vh - 2 * NOTE_WINDOW_MARGIN;
        if (maxW > 0 && w > vw) { w = maxW; clamped = true; }
        if (maxH > 0 && h > vh) { h = maxH; clamped = true; }
    }
    box.style.width = typeof w === 'number' ? w + 'px' : w;
    box.style.height = typeof h === 'number' ? h + 'px' : h;
    if (win) {
        win.geomSize = { width: Math.round(box.offsetWidth), height: Math.round(box.offsetHeight) };
        win.geomClamped = clamped;
    }
}

// Само поддръжка: помни приложения размер (win.geomSize) и опреснява бутона за запис.
// Размерът в самата бележка (dataset.editorSize) се слага само от Ctrl/задържане в stopDrag.
// Мястото се чете от кутията спрямо dataset.baseGeometry и се записва с обикновения запис (uiState.pos).
function rememberNoteWindowGeometry(win) {
    if (!win || win.body.dataset.isExpanded === 'true') return;
    const cur = { width: Math.round(win.box.offsetWidth), height: Math.round(win.box.offsetHeight) };
    if (!win.geomSize || win.geomSize.width !== cur.width || win.geomSize.height !== cur.height) {
        win.geomSize = cur;
        win.geomClamped = false;
    }
    withNoteWindow(win, () => updateModalUiStateSaveUI());
}

function clampNoteWindowAxis(pos, size, room) {
    const max = room - size;
    if (max < 0) return Math.round(max / 2); // bigger than the screen: centred, like the old modal
    return Math.round(Math.min(Math.max(pos, 0), max));
}

// Запомненото място се ползва само ако прозорецът стои изцяло на екрана; иначе - стандартното.
function windowPositionFits(pos, w, h, vw, vh) {
    const TOL = 1; // толеранс за закръгляне
    return pos.x >= -TOL && pos.y >= -TOL && pos.x + w <= vw + TOL && pos.y + h <= vh + TOL;
}

// Where a window opens: where this note was last left (uiState.pos) if it fits whole on
// this screen, else centred plus the cascade (28px a step, 6 steps, then round again). On a narrow
// screen the cascade only goes down. A remembered place that does not fit is neither clamped nor
// overwritten - it stays for the screen it was set on.
function placeNoteWindow(win, isExpanded, note) {
    const box = win.box;
    if (isExpanded) {
        box.style.left = '0px';
        box.style.top = '0px';
        return;
    }
    const vw = window.innerWidth, vh = window.innerHeight;
    const w = box.offsetWidth, h = box.offsetHeight;
    // showModal подава бележката: нов прозорец още няма data-id/gdid в този момент.
    if (note === undefined) note = findNoteForWindow(win);
    const pos = note ? getValidWindowPosition(note.uiState) : null;
    if (pos && windowPositionFits(pos, w, h, vw, vh)) {
        win.slot = -1;
        box.style.left = pos.x + 'px';
        box.style.top = pos.y + 'px';
        return;
    }
    const used = new Set(getOpenNoteWindows().filter(o => o !== win).map(o => o.slot));
    let slot = 0;
    while (slot < NOTE_WINDOW_CYCLE && used.has(slot)) slot++;
    if (slot >= NOTE_WINDOW_CYCLE) slot = getOpenNoteWindows().filter(o => o !== win).length % NOTE_WINDOW_CYCLE;
    win.slot = slot;
    const narrow = vw < NOTE_WINDOW_NARROW;
    const x = (vw - w) / 2 + (narrow ? 0 : slot * NOTE_WINDOW_CASCADE);
    const y = (vh - h) / 2 + slot * NOTE_WINDOW_CASCADE;
    box.style.left = clampNoteWindowAxis(x, w, vw) + 'px';
    box.style.top = clampNoteWindowAxis(y, h, vh) + 'px';
}

// The expand button: the full-size view fills the screen from the top-left corner (no frame); back to
// normal puts it where it was.
function syncNoteWindowExpandedPlace(win, isExpanded) {
    if (!win) return;
    if (isExpanded) {
        win.placeBeforeExpand = { left: win.box.style.left, top: win.box.style.top };
        win.box.style.left = '0px';
        win.box.style.top = '0px';
    } else if (win.placeBeforeExpand) {
        win.box.style.left = win.placeBeforeExpand.left;
        win.box.style.top = win.placeBeforeExpand.top;
        win.placeBeforeExpand = null;
    } else {
        placeNoteWindow(win, false);
    }
}

// The one place that decides where showModal draws:
// - a re-render (save, eye preview, background sync) names its window and never opens another;
// - a note that is already open: its window comes to the front (and only takes the new content when
//   it has nothing of the user's in it), no second copy;
// - < / > replace the note in the same window;
// - anything else goes to the idle window or a new one.
function pickNoteWindowForShow(options) {
    const opts = (options && typeof options === 'object') ? options : {};
    if (opts.noteWindow) {
        const win = opts.noteWindow;
        if (!noteWindows.includes(win) || !win.open) return null;
        const shownId = win.body.dataset.id || '', shownGdid = win.body.dataset.gdid || '';
        const sameNote = (shownGdid && String(opts.gdid || '') === shownGdid) || (shownId && String(opts.id || '') === shownId);
        if ((shownId || shownGdid) && !sameNote) return null; // the window shows another note by now
        return { win, fresh: false, background: win !== activeNoteWindow };
    }
    const match = findNoteWindow(opts.id, opts.gdid);
    const navInPlace = noteWindowNavInPlace;
    noteWindowNavInPlace = false;
    if (match) {
        const body = match.body;
        // The user's work in it (editing, the eye preview, a draft): it only comes to the front.
        // (disableNoteEditing takes the edit toolbar away but leaves the fields to the re-render.)
        const busy = !!match.box.querySelector('.modal-edit-toolbar') || body.dataset.isPreview === 'true' || !!body.dataset.draftText;
        const differs = typeof opts.raw === 'string' && (opts.raw !== getNoteWindowRaw(match)
            || String(opts.format || '') !== String(body.dataset.format || ''));
        if (busy || !differs) {
            activateNoteWindow(match, true);
            return null;
        }
        return { win: match, fresh: false, background: false };
    }
    if (navInPlace && activeNoteWindow && activeNoteWindow.open) return { win: activeNoteWindow, fresh: false, background: false };
    if (activeNoteWindow && !activeNoteWindow.open && noteWindows.includes(activeNoteWindow)) {
        activeNoteWindow.state = {};
        return { win: activeNoteWindow, fresh: true, background: false };
    }
    const win = createNoteWindow();
    return win ? { win, fresh: true, background: false } : null;
}

function showModal(options, noteElement = null) {
    const pick = pickNoteWindowForShow(options);
    if (!pick) return;
    if (pick.background) {
        withNoteWindow(pick.win, () => renderNoteWindow(options, noteElement, pick.win, false));
        return;
    }
    activateNoteWindow(pick.win, true);
    renderNoteWindow(options, noteElement, pick.win, pick.fresh);
}

function createNoteWindow() {
    const tpl = document.getElementById('content-modal-template');
    const layer = document.getElementById('note-windows-layer');
    if (!tpl || !layer) return null;
    const el = tpl.cloneNode(true);
    el.removeAttribute('id');
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
        slot: -1
    };
    noteWindows.push(win);
    wireNoteWindow(win);
    return win;
}

function onNoteWindowClosed(win) {
    win.el.querySelector('.note-window-sync-banner')?.remove();
    const others = getOpenNoteWindows().filter(w => w !== win);
    if (!others.length) {
        // The last one stays in the DOM as the idle window: "the" modal always exists.
        if (activeNoteWindow !== win) activateNoteWindow(win, false);
        setExpandedModalFloatingControls(false);
        noteWindows.filter(w => w !== win && !w.open).forEach(w => w.el.remove());
        noteWindows = noteWindows.filter(w => w === win || w.open);
        updateSingleNoteOverlay();
        return;
    }
    if (activeNoteWindow === win) activateNoteWindow(getTopNoteWindow(others), false);
    noteWindows = noteWindows.filter(w => w !== win);
    updateSingleNoteOverlay();
    setTimeout(() => { if (!win.open && activeNoteWindow !== win) win.el.remove(); }, 450);
}

// "Close all notes" in the boards menu: one question for all the windows with unsaved changes.
async function closeAllNoteWindows() {
    const open = getOpenNoteWindows();
    if (!open.length) return;
    const dirty = open.filter(w => withNoteWindow(w, () => !!getNoteUnsavedKind()));
    if (dirty.length) {
        const msg = (_('closeAllNotesConfirm') || 'Unsaved changes in {count} notes. Save them before closing?').replace('{count}', dirty.length);
        const answer = await showConfirmation(msg, { showCancel: true });
        if (answer === 'cancel') return;
        if (answer === true) {
            dirty.forEach(w => {
                if (!w.open) return;
                withNoteWindow(w, () => {
                    if (getNoteUnsavedKind() === 'ui') enableNoteEditing(w.body);
                    saveEditedNote(true);
                });
            });
        }
    }
    getOpenNoteWindows().forEach(closeNoteWindow);
}
window.closeAllNoteWindows = closeAllNoteWindows;

// A window opened a moment ago gets 'visible' only in the next frame: closing it then must not let it appear.
function closeNoteWindow(win) {
    if (win.el.classList.contains('visible')) {
        win.el.classList.remove('visible');
    } else if (win.open) {
        win.open = false;
        onNoteWindowClosed(win);
    }
}





// Every listener a window needs, on its own elements (cloneNode copies none).
function wireNoteWindow(win) {
    const { el, box, body } = win;
    const pick = (mwid) => el.querySelector(`[data-mwid="${mwid}"]`);
    // A press or a focus anywhere in a window makes it the active one, before any of its own handlers.
    const activate = () => { if (noteWindows.includes(win)) activateNoteWindow(win, true); };
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
    // Clicks inside a window must not reach the notes underneath.
    el.addEventListener('click', (e) => e.stopPropagation());

    // Closed = 'visible' taken away (by the X, Escape, a save that closes, any old code path).
    let wasVisible = false;
    new MutationObserver(() => {
        const visible = el.classList.contains('visible');
        const closed = wasVisible && !visible;
        wasVisible = visible;
        if (!closed) return;
        if (activeNoteWindow === win) setExpandedModalFloatingControls(false);
        if (!win.open) return;
        win.open = false;
        onNoteWindowClosed(win);
    }).observe(el, { attributes: true, attributeFilter: ['class'] });

    // --- Calculator button: click, Ctrl+click and a long press ---
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

    // --- Copy: the selection inside this window, else the whole note ---
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
            if (textToCopy === '') textToCopy = getNoteWindowRaw(win)?.trim() || '';
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

    const pasteModalBtn = pick('paste-modal-btn');
    if (pasteModalBtn) {
        pasteModalBtn.style.display = 'none';
        pasteModalBtn.addEventListener('click', async () => {
            const textarea = getActiveModalEditor();
            if (!textarea) return;
            try {
                if (!navigator.clipboard?.readText) throw new Error('Clipboard access is unavailable');
                const clipboardText = await navigator.clipboard.readText();
                textarea.setRangeText(clipboardText, textarea.selectionStart, textarea.selectionEnd, 'end');
                textarea.focus();
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                scrollCaretIntoView(textarea);
            } catch (error) {
                console.warn('Failed to paste from clipboard:', error);
                showToast((typeof _ === 'function' && _('errorClipboardRead')) || 'Неуспешно четене от клипборда.');
            }
        });
    }

    const closeBtn = el.querySelector('.modal-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', async () => {
            if (!(await checkUnsavedChanges())) return;
            el.classList.remove('visible');
            if (win.copyBtn) win.copyBtn.style.display = 'flex';
            if (pasteModalBtn) pasteModalBtn.style.display = 'none';
            el.classList.remove('popup-mode');
        });
    }

    ['bullet', 'numbered'].forEach(kind => {
        pick(kind + '-list-btn')?.addEventListener('mousedown', (e) => {
            e.preventDefault();
            const activeTextarea = document.activeElement;
            if (activeTextarea && (isNoteEditBodyField(activeTextarea) || activeTextarea.id === 'note-edit-title-textarea')) {
                toggleListFormat(activeTextarea, kind);
            }
        });
    });

    body.style.fontSize = `${localStorage.getItem('modalFontSize') || 16}px`;
    // formatText and the demo note change the font size: back to the setting once the window is closed.
    el.addEventListener('transitionend', () => {
        if (!el.classList.contains('visible')) body.style.fontSize = `${localStorage.getItem('modalFontSize') || 16}px`;
    });

    wireNoteWindowResize(win, el.querySelector('.modal-resize-handle'));
    wireNoteWindowMove(win);
}

// The resize handle: a plain drag changes the size new notes open with (localStorage modalWidth/
// modalHeight) and is not a change of the note. Ctrl + drag / hold on the phone makes the size the
// note's own (dataset.editorSize -> uiState.size with the next save) - closing then asks.
function wireNoteWindowResize(win, resizeHandle) {
    if (!resizeHandle) return;
    const modalContentBox = win.box;
    let startX, startY, startWidth, startHeight, isIndividualResize = false, individualResizeTimer = null;
    function doDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        // Обикновеното движение преди long-press запазва обикновения resize режим.
        if (e.type === 'touchmove' && individualResizeTimer) {
            clearTimeout(individualResizeTimer);
            individualResizeTimer = null;
        }
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
        clearTimeout(individualResizeTimer);
        individualResizeTimer = null;
        if (isIndividualResize) {
            win.body.dataset.editorSize = JSON.stringify({
                width: Math.round(modalContentBox.getBoundingClientRect().width),
                height: Math.round(modalContentBox.getBoundingClientRect().height)
            });
        } else {
            localStorage.setItem('modalWidth', modalContentBox.style.width);
            localStorage.setItem('modalHeight', modalContentBox.style.height);
        }
        rememberNoteWindowGeometry(win);
        isIndividualResize = false;
        resizeHandle.classList.remove('individual-resize-active');
    }
    function startDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        startX = e.touches ? e.touches[0].clientX : e.clientX;
        startY = e.touches ? e.touches[0].clientY : e.clientY;
        isIndividualResize = !!e.ctrlKey;
        clearTimeout(individualResizeTimer);
        if (e.type === 'touchstart') {
            // Задръж дръжката преди влачене, за да запишеш размера и в самата бележка.
            individualResizeTimer = setTimeout(() => {
                isIndividualResize = true;
                resizeHandle.classList.add('individual-resize-active');
                if (navigator.vibrate) navigator.vibrate(40);
                if (typeof showToast === 'function') showToast('Индивидуален размер', 1200);
            }, 450);
        }
        startWidth = parseInt(document.defaultView.getComputedStyle(modalContentBox).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(modalContentBox).height, 10);
        document.documentElement.addEventListener('mousemove', doDrag, false);
        document.documentElement.addEventListener('mouseup', stopDrag, false);
        document.documentElement.addEventListener('touchmove', doDrag, false);
        document.documentElement.addEventListener('touchend', stopDrag, false);
    }
    resizeHandle.addEventListener('mousedown', startDrag);
    resizeHandle.addEventListener('touchstart', startDrag, { passive: false });
    // The window can be cloned before the translations are in (or the language changes later): the
    // tooltip is read again whenever the pointer comes over the handle.
    const setResizeHandleTooltip = () => {
        resizeHandle.title = _('resizeHandleTooltip') || 'Drag: changes the size of new notes · Ctrl + drag / hold on the phone: size for this note only';
        resizeHandle.setAttribute('aria-label', resizeHandle.title);
    };
    setResizeHandleTooltip();
    resizeHandle.addEventListener('pointerenter', setResizeHandleTooltip);
    resizeHandle.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 21h13V8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
            <path d="M12 21h9v-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
            <circle cx="8" cy="16" r="1.5" fill="currentColor" />
            <circle cx="13" cy="16" r="1.5" fill="currentColor" />
            <circle cx="8" cy="11" r="1.5" fill="currentColor" />
        </svg>`;
}

// Moving a window: drag its header band (the empty strip or the board name; a drag that moved does
// not count as a click on the board name). Buttons keep their clicks.
function wireNoteWindowMove(win) {
    const box = win.box;
    let start = null;
    const point = (e) => (e.touches && e.touches[0]) ? e.touches[0] : e;
    const inHeaderBand = (e) => {
        const t = e.target;
        if (!t || !t.closest) return false;
        if (win.body.dataset.isExpanded === 'true') return false;
        if (t.closest('button, a, input, textarea, select, .modal-header-btn, .modal-edit-toolbar, #color-palette-dropdown, .nw-color-palette-dropdown')) return false;
        if (t.closest('#modal-board-name, .nw-modal-board-name')) return true;
        if (t !== box) return false;
        const header = box.querySelector('.modal-header-toolbar');
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
        // Keep a piece of the header on the screen, so the window can always be taken back.
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
            rememberNoteWindowGeometry(win);
        }
        start = null;
    };
    const onStart = (e) => {
        if (e.type === 'mousedown' && e.button !== 0) return;
        if (!inHeaderBand(e)) return;
        const p = point(e);
        start = { x: p.clientX, y: p.clientY, left: parseFloat(box.style.left) || box.offsetLeft, top: parseFloat(box.style.top) || box.offsetTop, moving: false };
        if (e.type === 'mousedown' && e.target === box) e.preventDefault(); // no text selection from the strip
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);
        document.addEventListener('touchcancel', onEnd);
    };
    box.addEventListener('mousedown', onStart);
    box.addEventListener('touchstart', onStart, { passive: true });
}

// The first window exists from the start (idle), so #content-modal, #modal-body and the globals are
// always there, as they were with the single modal.
function initNoteWindows() {
    if (noteWindows.length) return;
    const win = createNoteWindow();
    if (win) activateNoteWindow(win, true);
}

function renderNoteWindow(options, noteElement = null, win = activeNoteWindow, fresh = false) {
    let rawContent, formatString, titleFormatString, displayContent, noteColor, noteId, noteGdid;
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
    modalContentBox.style.transition = 'none';
    const noteForUiState = allNotesData.find(n => (n.gdid && String(n.gdid) === String(noteGdid)) || (n.id && String(n.id) === String(noteId)));
    const existingModalBody = document.getElementById('modal-body');
    const isMatchingNote = existingModalBody && ((noteGdid && existingModalBody.dataset.gdid === String(noteGdid)) || (noteId && existingModalBody.dataset.id === String(noteId)));
    const existingEditorSize = isMatchingNote ? getModalEditorSize() : null;
    const uiState = getNoteUiState(options.uiState || (noteForUiState && noteForUiState.uiState) || null);
    const openEditorSize = getValidEditorSize(uiState) || existingEditorSize;
    const isExpanded = getNoteExpanded(uiState);
    if (noteForUiState) normalizeNoteUiStateInMemory(noteForUiState);
    // Разпънатият изглед винаги използва наличната площ, а не глобалния размер.
    if (isExpanded) {
        applyExpandedModalSize(modalContentBox, true);
        // Check for explicit dimensions in options (e.g. from guide temp note)
    } else if (options && options.width && options.height) {
        modalContentBox.style.width = typeof options.width === 'number' ? options.width + 'px' : options.width;
        modalContentBox.style.height = typeof options.height === 'number' ? options.height + 'px' : options.height;
        applyExpandedModalSize(modalContentBox, false);
    } else {
        // Размерът на бележката (uiState.size), после глобалният, после 400x300.
        applyExpandedModalSize(modalContentBox, false);
        applyNoteWindowSize(win, modalContentBox, openEditorSize);
    }
    void modalContentBox.offsetHeight;
    if (win && fresh) placeNoteWindow(win, isExpanded, noteForUiState || null);
    else if (win && isExpanded) syncNoteWindowExpandedPlace(win, true);
    if (win) win.open = true;
    updateSingleNoteOverlay();
    modalContentBox.style.transition = '';
    setExpandedModalFloatingControls(isExpanded);
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
        // Докато KB не е заредена, името идва от i18n таблицата
        modalBoardNameEl.textContent = (window.kbAssistant && window.kbAssistant.isInitialized) ? window.kbAssistant.getText('assistantName') : (_('assistantName') || 'Assistant');
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
                const boardNameWin = win || activeNoteWindow;
                newEl.addEventListener('click', async () => {
                    // Same way as the X: ask about unsaved changes first, then close this window (b1.83)
                    if (!(await checkUnsavedChanges())) return;
                    if (boardNameWin) closeNoteWindow(boardNameWin);
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
    setNoteCheckboxSource(modalBody, 0, String(rawContent || '').length);

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
        const tableCell = e.target.closest('.md-table-render th, .md-table-render td');
        if (tableCell) {
            charIndex = getMarkdownTableCellCharIndex(currentModalContent, tableCell);
        }
        if (charIndex === -1) {
            const selection = window.getSelection();
            if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                charIndex = getPreciseCharIndex(modalBody, range);
            }
        }

        enableNoteEditing(modalBody, charIndex);
    };
    modalBody.addEventListener('click', modalBody._clickListener, { capture: true }); // Use capture to handle event before other listeners if needed

    // Store metadata for editing and rendering identification
    modalBody.dataset.id = noteId || '';
    modalBody.dataset.gdid = noteGdid || '';
    modalBody.dataset.isExpanded = isExpanded ? 'true' : 'false';
    // Мястото при отваряне - спрямо него местенето е промяна. Опресняване на същата бележка го пази.
    if (fresh || !isMatchingNote || modalBody.dataset.baseGeometry === undefined) setNoteWindowBaseGeometry(modalBody);
    const initialEditorSize = openEditorSize;
    if (initialEditorSize) modalBody.dataset.editorSize = JSON.stringify(initialEditorSize);
    else delete modalBody.dataset.editorSize;
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
    // Затворен преглед (окото) без запис оставяше флага на тялото и следващата бележка в същия прозорец се
    // смяташе за преглед: празни полета в реда, а промяна на часа не се записваше (b2.18). previewEditedNote
    // ги вдига наново след showModal.
    delete modalBody.dataset.isPreview;
    delete modalBody.dataset.previewDraftFormat;
    delete modalBody.dataset.previewDraftTitleFormat;
    delete modalBody.dataset.previewDraftMaskedLinks;
    delete modalBody.dataset.previewHasTitle;
    delete modalBody.dataset.previewDraftJoined;
    modalBody.dataset.boardId = (options && options.boardId) ? options.boardId : '';
    modalBody.dataset.isNewNote = options.isNewNote ? 'true' : 'false';
    modalBody.dataset.color = typeof noteColor === 'string' ? noteColor.toUpperCase() : (noteColor || '');
    if (options.maskedLinks) {
        modalBody.dataset.maskedLinks = JSON.stringify(options.maskedLinks);
    } else {
        delete modalBody.dataset.maskedLinks;
    }
    const noteObjForCalendar = allNotesData.find(n => (n.gdid && String(n.gdid) === String(noteGdid)) || (n.id && String(n.id) === String(noteId)));
    modalBody.dataset.calendarDate = (noteObjForCalendar && noteObjForCalendar.calendarDate) ? noteObjForCalendar.calendarDate : '0';
    initModalCalDraft(modalBody, noteObjForCalendar, isMatchingNote && !fresh);
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
        const foundIndex = noteColorMap.indexOf(noteColor.toUpperCase());
        colorIndex = foundIndex !== -1 ? foundIndex : -1;
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

    const expandBtn = document.getElementById('modal-expand-btn');
    if (expandBtn) {
        updateModalExpandButton(isExpanded);
        expandBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const nextIsExpanded = modalBody.dataset.isExpanded !== 'true';
            modalBody.dataset.isExpanded = nextIsExpanded ? 'true' : 'false';
            if (nextIsExpanded) {
                applyExpandedModalSize(modalContentBox, true);
            } else {
                // Размерът може да е записан тихо след отварянето: от бележката, иначе от uiState при отваряне.
                const noteNow = activeNoteWindow ? findNoteForWindow(activeNoteWindow) : null;
                applyExpandedModalSize(modalContentBox, false);
                applyNoteWindowSize(activeNoteWindow, modalContentBox, getValidEditorSize(noteNow ? noteNow.uiState : uiState));
            }
            syncNoteWindowExpandedPlace(activeNoteWindow, nextIsExpanded);
            // Отворена разпъната: отметката за мястото се взема при първото свиване.
            if (!nextIsExpanded && modalBody.dataset.baseGeometry === undefined) setNoteWindowBaseGeometry(modalBody);
            updateModalExpandButton(nextIsExpanded);
            setExpandedModalFloatingControls(nextIsExpanded);
            updateModalUiStateSaveUI();
        };
    }

    // Set modal background color
    const imgBgrdEnabled = localStorage.getItem('imgBgrd') !== 'false'; // Default to true
    if (isPromo) {
        modalContentBox.style.backgroundColor = '#222';
        modalContentBox.style.backgroundImage = 'none';
        modalContentBox.classList.add('no-bg-image');
        modalBody.classList.add('no-bg-image');
    } else {
        let bgColor = getDefaultNoteBg();
        if (typeof colorIndex === 'number') {
            if (colorIndex >= 0 && colorIndex < noteColorMap.length) bgColor = noteColorMap[colorIndex];
            else if (colorIndex === -1 && typeof noteColor === 'string' && noteColor.startsWith('#')) bgColor = noteColor;
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
            const expandBtn = document.getElementById('modal-expand-btn');
            const colorBtn = document.createElement('div');
            colorBtn.id = 'modal-color-btn';
            colorBtn.className = 'modal-header-btn';
            colorBtn.title = _('changeColor') || 'Change Color';
            colorBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="gray" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>`;
            Object.assign(colorBtn.style, {
                cursor: 'pointer',
                display: 'none',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: '0.7'
            });
            colorBtn.onmouseover = () => colorBtn.style.opacity = '1';
            colorBtn.onmouseout = () => colorBtn.style.opacity = '0.7';
            // Keeps the editor's focus and selection (the text colours apply to the selection).
            colorBtn.addEventListener('mousedown', (e) => e.preventDefault());
            // Keep it immediately to the left of the expand control in the first header row.
            closeBtn.parentNode.insertBefore(colorBtn, expandBtn || closeBtn);

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
                gridTemplateColumns: 'auto',
                gap: '4px',
                zIndex: '10050', // above everything the modal draws itself (footer toolbar 10001): nothing in the page may sit over the popup
                borderRadius: '8px',
                boxShadow: '0 4px 15px rgba(0,0,0,0.2)',
                maxHeight: 'calc(100vh - 80px)',
                overflowY: 'auto'
            });

            // Close glyph in the popup's top-right corner. The white dot inside the text
            // sections stays what it is: the standard colour.
            const closeRow = document.createElement('div');
            Object.assign(closeRow.style, { display: 'flex', justifyContent: 'flex-end' });
            const paletteClose = document.createElement('div');
            paletteClose.id = 'color-palette-close';
            paletteClose.className = 'color-palette-close';
            Object.assign(paletteClose.style, {
                width: '20px', height: '20px', cursor: 'pointer', borderRadius: '50%', boxSizing: 'border-box',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#777', fontSize: '14px', lineHeight: '1'
            });
            paletteClose.textContent = '✕';
            paletteClose.title = _('paletteCloseTooltip') || 'Close';
            paletteClose.addEventListener('mousedown', (e) => e.preventDefault());
            paletteClose.onclick = (e) => { e.stopPropagation(); closePaletteDropdown(); };
            closeRow.appendChild(paletteClose);
            palette.appendChild(closeRow);

            // Three sections, each a grid of 8 dots x 2 rows: text colour, text background, note background.
            const addPaletteSection = (labelKey, labelFallback, kind) => {
                const label = document.createElement('div');
                label.className = 'color-palette-label';
                label.textContent = _(labelKey) || labelFallback;
                Object.assign(label.style, { fontSize: '11px', color: '#555', margin: '2px 0 0 0' });
                const grid = document.createElement('div');
                grid.className = 'color-palette-grid';
                grid.dataset.kind = kind;
                Object.assign(grid.style, { display: 'grid', gridTemplateColumns: 'repeat(8, 22px)', gap: '8px', marginBottom: '4px' });
                palette.appendChild(label);
                palette.appendChild(grid);
                return grid;
            };
            const markSwatch = (sw, on) => {
                sw.style.border = on ? '2px solid #555' : '1px solid #ccc';
                sw.style.transform = on ? 'scale(1.1)' : '';
                sw.classList.toggle('is-selected', on);
            };

            // Text colour (type 4) and text background (type 5): the editor field and its selection
            // are taken when the press starts (the native colour picker of the custom dot takes the
            // focus away; the other dots keep it with preventDefault on mousedown).
            let colorTarget = null;
            // A touch screen draws the selection handles and the copy/paste menu in a layer of the
            // browser's own, above every element - no z-index can put the popup over them. So while
            // the popup is open the selection is taken out of the browser's hands instead: the field
            // is blurred and its native selection collapsed (no handles, no menu), and the colours
            // apply to the range captured here. Closing the popup hands the selection back.
            const paletteTouchPointer = typeof window.matchMedia === 'function'
                && window.matchMedia('(pointer: coarse)').matches;
            let colorTargetReleased = false;
            const snapColorTarget = (force) => {
                // While a released selection is held, only the field's own changes (a new popup
                // opening) may replace it - never a press inside the popup.
                if (!force && colorTargetReleased && colorTarget && colorTarget.field && colorTarget.field.isConnected) return;
                const field = typeof getActiveModalEditor === 'function' ? getActiveModalEditor() : null;
                colorTarget = field ? { field, start: field.selectionStart, end: field.selectionEnd } : null;
            };
            const releaseNativeSelection = () => {
                const t = colorTarget;
                if (!paletteTouchPointer || !t || !t.field || !t.field.isConnected) return;
                t.wasFocused = document.activeElement === t.field;
                try { t.field.blur(); } catch (e) { /* the field is gone */ }
                try { t.field.setSelectionRange(t.start, t.start); } catch (e) { /* some fields refuse it */ }
                t.released = true;
                colorTargetReleased = true;
            };
            const restoreNativeSelection = () => {
                colorTargetReleased = false;
                const t = colorTarget;
                if (!t || !t.released || !t.field || !t.field.isConnected) return;
                t.released = false;
                try { t.field.setSelectionRange(t.start, t.end); } catch (e) { /* nothing to hand back */ }
                if (t.wasFocused) { try { t.field.focus({ preventScroll: true }); } catch (e) { /* nothing to hand back */ } }
            };
            const closePaletteDropdown = () => {
                if (palette.style.display === 'none') return;
                palette.style.display = 'none';
                restoreNativeSelection();
            };
            palette.addEventListener('pointerdown', () => snapColorTarget(), true);
            palette.addEventListener('mousedown', () => snapColorTarget(), true);
            const textGrids = {};
            const refreshTextColorMarks = () => {
                const t = colorTarget && colorTarget.field && colorTarget.field.isConnected ? colorTarget : null;
                const field = t ? t.field : (typeof getActiveModalEditor === 'function' ? getActiveModalEditor() : null);
                [4, 5].forEach(type => {
                    const grid = textGrids[type];
                    if (!grid) return;
                    const current = field ? getNoteEditColorAt(field, type, t ? t.start : undefined, t ? t.end : undefined) : null;
                    let found = false;
                    grid.querySelectorAll('[data-color-int]').forEach(sw => {
                        const on = current !== null && Number(sw.dataset.colorInt) === current;
                        if (on) found = true;
                        markSwatch(sw, on);
                    });
                    const custom = grid.querySelector('.color-swatch-custom');
                    if (custom) markSwatch(custom, current !== null && !found);
                });
            };
            const applyTextColor = (type, colorInt, keepTarget) => {
                if (!keepTarget || !colorTarget) snapColorTarget();
                const t = colorTarget;
                if (!t || !t.field || !t.field.isConnected) return;
                applyNoteEditColor(t.field, type, colorInt, t.start, t.end);
                // applyNoteEditColor puts the selection back; with a released one that would raise
                // the native handles over the popup again, so it goes back to the collapsed state.
                if (t.released) { try { t.field.setSelectionRange(t.start, t.start); } catch (e) { /* nothing to collapse */ } }
                refreshTextColorMarks();
            };
            const buildTextColorSection = (type, labelKey, labelFallback) => {
                const grid = addPaletteSection(labelKey, labelFallback, type === 4 ? 'text-color' : 'text-background');
                textGrids[type] = grid;
                NOTE_TEXT_COLORS.forEach(c => {
                    const swatch = document.createElement('div');
                    swatch.className = 'color-swatch';
                    Object.assign(swatch.style, {
                        width: '22px', height: '22px', backgroundColor: c, cursor: 'pointer', borderRadius: '50%',
                        border: '1px solid #ccc', boxShadow: 'inset 0 0 2px rgba(0,0,0,0.2)', boxSizing: 'border-box'
                    });
                    swatch.dataset.color = c;
                    swatch.dataset.colorInt = String(hexToColorInt(c));
                    swatch.title = _(`color${noteColorMap.indexOf(c)}`) || c;
                    swatch.addEventListener('mousedown', (e) => e.preventDefault());
                    swatch.onclick = (e) => {
                        e.stopPropagation();
                        applyTextColor(type, hexToColorInt(c), true);
                    };
                    grid.appendChild(swatch);
                });
                // Standard colour: takes the colour off the selection, or the pending one.
                const resetSwatch = document.createElement('div');
                resetSwatch.className = 'color-swatch-default';
                Object.assign(resetSwatch.style, {
                    width: '22px', height: '22px', cursor: 'pointer', borderRadius: '50%', border: '1px solid #ccc',
                    backgroundColor: 'white', color: '#777', boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', lineHeight: '1'
                });
                resetSwatch.textContent = '×';
                resetSwatch.title = _('standardColor') || 'Standard colour';
                resetSwatch.addEventListener('mousedown', (e) => e.preventDefault());
                resetSwatch.onclick = (e) => {
                    e.stopPropagation();
                    applyTextColor(type, null, true);
                };
                grid.appendChild(resetSwatch);
                const custom = document.createElement('div');
                custom.className = 'color-swatch-custom';
                Object.assign(custom.style, {
                    width: '22px', height: '22px', cursor: 'pointer', borderRadius: '50%', border: '1px solid #ccc',
                    background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)', boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
                });
                custom.title = _('customColor') || 'Custom color';
                const input = document.createElement('input');
                input.type = 'color';
                Object.assign(input.style, {
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer'
                });
                const onPick = (e) => applyTextColor(type, hexToColorInt(e.target.value.toUpperCase()), true);
                input.oninput = onPick;
                input.onchange = (e) => {
                    onPick(e);
                    const t = colorTarget;
                    if (t && t.field && t.field.isConnected) {
                        t.field.focus({ preventScroll: true });
                        t.field.setSelectionRange(t.start, t.end);
                    }
                };
                custom.appendChild(input);
                grid.appendChild(custom);
            };
            buildTextColorSection(4, 'textColorLabel', 'Text colour');
            buildTextColorSection(5, 'textBackgroundLabel', 'Text background');
            palette._refreshTextColorMarks = refreshTextColorMarks;

            if (typeof noteColorMap !== 'undefined') {
                const noteGrid = addPaletteSection('noteBackgroundLabel', 'Note background', 'note-background');
                noteColorMap.forEach((c, idx) => {
                    const swatch = document.createElement('div');
                    Object.assign(swatch.style, {
                        width: '22px',
                        height: '22px',
                        backgroundColor: c,
                        cursor: 'pointer',
                        borderRadius: '50%',
                        border: '1px solid #ccc',
                        boxShadow: 'inset 0 0 2px rgba(0,0,0,0.2)',
                        boxSizing: 'border-box'
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
                        setDefaultNoteBg(c); // last background becomes the default for new notes
                        closePaletteDropdown();
                    };
                    noteGrid.appendChild(swatch);
                });

                // --- Добавяне на бутон за избор на произволен цвят ---
                const customSwatch = document.createElement('div');
                Object.assign(customSwatch.style, {
                    width: '22px', height: '22px', cursor: 'pointer', borderRadius: '50%', border: '1px solid #ccc',
                    background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)', boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative'
                });
                customSwatch.title = _('customColor') || 'Custom color';

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
                    setDefaultNoteBg(hex); // last background becomes the default for new notes
                };

                colorInput.onchange = () => {
                    closePaletteDropdown();
                };

                customSwatch.appendChild(colorInput);
                noteGrid.appendChild(customSwatch);
            }
            modalContentBox.appendChild(palette);

            colorBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (palette.style.display === 'none') {
                    snapColorTarget(true); // the live selection is what the colours apply to
                    releaseNativeSelection();
                    palette.style.display = 'grid';
                    refreshTextColorMarks();
                } else {
                    closePaletteDropdown();
                }
            });
            // Click outside to close (simple handler)
            const closePalette = (e) => {
                if (palette.style.display === 'grid' && !palette.contains(e.target) && e.target !== colorBtn) {
                    closePaletteDropdown();
                }
            };
            document.addEventListener('click', closePalette);
            // The browser keeps its copy/paste bar in a layer of its own, above every element: over the
            // popup while it is open, and over the modal toolbar whenever a piece of the editor text is
            // selected on a touch screen - a long press raises it above the selection, so on the first
            // line it lands right on the toolbar. It is swallowed in both places. On a computer nothing
            // but a right click inside the popup is swallowed, the editor keeps its own right click.
            const blockNativeTextMenu = (e) => {
                const t = e.target;
                if (palette.isConnected && palette.style.display === 'grid') {
                    if (t && palette.contains(t)) { e.preventDefault(); return; }
                    if (paletteTouchPointer) e.preventDefault();
                    return;
                }
                if (!paletteTouchPointer) return;
                if (t && typeof isNoteMdField === 'function' && isNoteMdField(t)
                    && typeof t.selectionStart === 'number' && t.selectionStart !== t.selectionEnd) {
                    e.preventDefault();
                }
            };
            document.addEventListener('contextmenu', blockNativeTextMenu);
            // Cleanup listener on modal close logic (or just let it persist, it's lightweight)
        }
    }
    // Използваме requestAnimationFrame, за да гарантираме, че браузърът е приложил началните стилове (scale 0.7)
    // преди да добавим класа visible, за да се възпроизведе анимацията.
    const shownModal = win ? win.el : contentModal;
    requestAnimationFrame(() => {
        if (!win || win.open) shownModal.classList.add('visible');
    });

    // --- ДОБАВЕНА ЛОГИКА ЗА ПРИКАЧЕНИ ФАЙЛОВЕ ---
    // Проверяваме дали имаме ID-та, за да търсим прикачени файлове
    if (noteId || noteGdid) {
        // --- Логика за показване на бутона за изтриване ---
        // Локален режим: media.noteid е локалният ключ на бележката.
        let attachments = mediaData.filter(media => media.noteid === noteGdid || String(media.noteid) === String(noteId));
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
                await handleLocalAttachment(attachment, attachmentWrapper, iconData, true);
                modalBody.appendChild(attachmentWrapper);
            });

        }
    }
    // --- КРАЙ НА ДОБАВЕНАТА ЛОГИКА ---
    // --- FOOTER GENERATION LOGIC ---
    // Remove old search bar and footer if they exist
    const oldFooter = modalContentBox.querySelector('.modal-note-footer');
    if (oldFooter) oldFooter.remove();
    restoreModalHeaderListButtons();
    modalContentBox.classList.remove('has-edit-toolbar');
    const oldEditToolbar = modalContentBox.querySelector('.modal-edit-toolbar');
    if (oldEditToolbar) oldEditToolbar.remove();
    const oldToolbar = modalContentBox.querySelector('.modal-footer-toolbar');
    if (oldToolbar) {
        oldToolbar._footerDateResizeObserver?.disconnect();
        oldToolbar.remove();
    }
    const oldSearchBar = modalContentBox.querySelector('.modal-search-bar');
    if (oldSearchBar) oldSearchBar.remove();
    const oldCalRow = modalContentBox.querySelector('.note-cal-row');
    if (oldCalRow) {
        oldCalRow._noteCalObserver?.disconnect();
        oldCalRow.remove();
    }

    const canEdit = useIndexedDb && !isPromo && !options.readonly;
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
            // Часът (uiState.cTime) не е в лентата: стои в реда под нея и се задава оттам (b2.17).
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
    const pasteModalBtn = document.getElementById('paste-modal-btn');
    if (pasteModalBtn) pasteModalBtn.style.display = 'none';
    // --- Логика за навигация между бележките ---
    const prevBtn = document.getElementById('prev-note-btn');
    const nextBtn = document.getElementById('next-note-btn');
    const deleteBtn = document.getElementById('delete-modal-btn');

    // Показваме/скриваме бутона за изтриване
    // --- КОРЕКЦИЯ: Разрешаваме изтриване и в режим "Локална папка" ---
    if (useIndexedDb && (currentNoteObj || noteElement) && !isPromo && !options.readonly) {
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
                // Симулираме клик върху съседната бележка: тя се отваря в същия прозорец
                noteWindowNavInPlace = true;
                try { visibleNotes[newIndex].click(); } finally { noteWindowNavInPlace = false; }
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
        // Ред „час / повторение / до“ - само при зададена дата, последен в кутията, под долната лента.
        // Датата се вижда в лентата и се маха само с бутона (b2.15).
        const calRowBody = modalBody;
        const calRow = buildNoteCalRow(calRowBody);
        footerToolbar.after(calRow);
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
                calRowBody.dataset.calendarDate = "0";
                calRow._noteCalSync();
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
                    color: getNoteColorCss(noteCopy.color),
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
            editBtn.title = _('restoreNoteTooltip') || "Restore note";
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

    observeModalFooterDateVisibility(footerToolbar);
}

// Изрично излагане на window: минифицираният продукционен билд (Beta/mainn.js) преименува
// функциите, но не и имената на свойства, а двигателят на водача (msm.js) търси точно
// window.showModal за стъпките с action: "note".
window.showModal = showModal;

// Същото и за двигателя на водача: Beta/mainn.js се минифицира с --toplevel и той не вижда
// тези имена. Състоянието, което се препредава, е жив getter, не снимка.
Object.defineProperty(window, 'boardsData', { get: () => boardsData, configurable: true });
Object.defineProperty(window, 'allNotesData', { get: () => allNotesData, configurable: true });
Object.defineProperty(window, 'currentBoardFilter', { get: () => currentBoardFilter, configurable: true });
Object.defineProperty(window, 'notesContainer', { get: () => notesContainer, configurable: true });
window.createNoteElement = createNoteElement;
window.filterNotesByBoard = filterNotesByBoard;
window.applyFilters = applyFilters;
window.toggleHeaderFullscreen = toggleHeaderFullscreen;

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
        toolbar?._footerDateScheduleUpdate?.();
        return;
    }
    searchBar = document.createElement('div');
    searchBar.className = 'modal-search-bar';
    // We prepend it to the toolbar if possible
    if (toolbar) {
        toolbar.insertBefore(searchBar, toolbar.firstChild);
        toolbar._footerDateScheduleUpdate?.();
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
            toolbar?._footerDateScheduleUpdate?.();
        }
    });
    closeBtn.onclick = () => {
        searchBar.remove();
        restoreContent();
        toolbar?._footerDateScheduleUpdate?.();
    };
}

const fullscreenExpandIconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>`;
const fullscreenCompressIconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14h6v6m10-10h-6V4m0 6l7-7M3 21l7-7"></path></svg>`;

// The squares of the board menu that are not boards: Reorder, Fullscreen and Close-all-notes.
function isBoardMenuUtilId(id) {
    return id === 'reorder' || id === 'fullscreen' || id === 'close-all-notes';
}
// Left to right: Reorder, Fullscreen, Close-all-notes.
function boardMenuUtilRank(id) {
    if (id === 'reorder') return 0;
    if (id === 'fullscreen') return 1;
    return 2;
}
// Close all notes: two overlapping windows of the SAME size, the x in the upper (front) one (CX, 2026-10-07).
// The front window is drawn last and filled with the button's own colour, so it hides the part of the back
// window it covers; the x sits in the middle of the front window.
const closeAllNotesIconSvg = `<svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
    <rect x="1.6" y="7.6" width="14.8" height="14.8" rx="2.6" fill="none" stroke="currentColor" stroke-width="2.2" />
    <rect class="close-all-icon-front" x="7.6" y="1.6" width="14.8" height="14.8" rx="2.6" fill="#546E7A" stroke="currentColor" stroke-width="2.2" />
    <path d="M11.4 5.4l7.2 7.2M18.6 5.4l-7.2 7.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
</svg>`;
// The square is dimmed while no note window is open: with nothing to close it only shuts the menu. Every
// place that shows the square (the header strip and the menu that clones it) is refreshed from here.
function updateCloseAllNotesButtons() {
    const hasOpen = getOpenNoteWindows().length > 0;
    document.querySelectorAll('.close-all-notes-btn').forEach(btn => {
        const bg = hasOpen ? '#546E7A' : '#90A4AE';
        btn.style.backgroundColor = bg;
        btn.style.opacity = hasOpen ? '1' : '0.65';
        const front = btn.querySelector('.close-all-icon-front');
        if (front) front.setAttribute('fill', bg);
        if (hasOpen) delete btn.dataset.noOpenNotes; else btn.dataset.noOpenNotes = 'true';
    });
}

function toggleHeaderFullscreen() {
    const header = document.querySelector('header');
    if (!header) return;
    const isCurrentlyHidden = header.classList.contains('header-fullscreen');
    if (isCurrentlyHidden) {
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

function updateHeaderFullscreenUI() {
    const header = document.querySelector('header');
    const isHidden = header && header.classList.contains('header-fullscreen');
    document.querySelectorAll('.fullscreen-toggle-btn').forEach(btn => {
        btn.innerHTML = isHidden ? fullscreenCompressIconSvg : fullscreenExpandIconSvg;
        btn.title = isHidden ? (_('restoreHeaderTooltip') || 'Show header') : (_('toggleFullscreenTooltip') || 'Toggle fullscreen (Hide/Show header)');
    });
}

function adjustFullscreenSearchLayout() {
    const header = document.querySelector('header');
    const isFullscreen = header && header.classList.contains('header-fullscreen');
    const searchBox = document.getElementById('search-box');
    const searchIcon = document.querySelector('.search-icon-static');
    const fsBoardLabel = document.getElementById('fullscreen-board-label');
    if (!searchBox || !searchIcon) return;
    if (isFullscreen && fsBoardLabel) {
        if (!fsBoardLabel.textContent && typeof currentBoardFilter !== 'undefined') {
            const bId = currentBoardFilter;
            const board = (typeof boardsData !== 'undefined') ? boardsData.find(b => b.gdid == bId || b.id == bId) : null;
            fsBoardLabel.textContent = board ? board.title : (bId === 'all' ? ((typeof _ === 'function' && _('allBoards')) || 'All') : (bId && bId !== 'calendar' ? bId : ''));
        }
        if (fsBoardLabel.textContent) {
            let labelWidth = fsBoardLabel.offsetWidth;
            if (labelWidth === 0) {
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

function initHeaderFullscreen() {
    const isExtended = localStorage.getItem('extendedMode') === 'true';
    const header = document.querySelector('header');
    if (header) {
        if (isExtended) {
            header.classList.add('header-fullscreen');
        } else {
            header.classList.remove('header-fullscreen');
        }
    }
    updateHeaderFullscreenUI();
    adjustFullscreenSearchLayout();
    if (header && !header._hasSearchLayoutObserver) {
        header._hasSearchLayoutObserver = true;
        new MutationObserver(() => {
            adjustFullscreenSearchLayout();
        }).observe(header, { attributes: true, attributeFilter: ['style', 'class'] });
        window.addEventListener('resize', adjustFullscreenSearchLayout);
    }
}

function renderCommandsHelpPopup() {
    const popup = document.getElementById('saved-searches-popup');
    if (!popup) return;
    popup.style.display = 'block';
    popup.innerHTML = '';
    const closeBtn = document.createElement('div');
    closeBtn.className = 'saved-search-close-btn';
    closeBtn.innerHTML = '&times;';
    closeBtn.title = (typeof _ === 'function' && _('closeButton')) || 'Close';
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
    headerRow.style.cursor = 'default';
    headerRow.style.color = '#1f3b52';
    headerRow.textContent = (typeof _ === 'function' && _('searchCommandsTitle')) || 'Commands:';
    headerRow.addEventListener('click', (e) => e.stopPropagation());
    contentContainer.appendChild(headerRow);
    const defaultList = [
        { cmd: '/1', text: '/1  or  /set — Settings' },
        { cmd: '/2', text: '/2  or  /info — System information' },
        { cmd: '/3', text: '/3  or  /cal — Calendar' },
        { cmd: '/4', text: '/4  or  /rel — Reload' },
        { cmd: '/5', text: '/5  or  /out — Sign out' },
        { cmd: '/6', text: '/6  or  /norm — Exit expanded mode' },
        { cmd: '/7', text: '/7  or  /ex — Enter expanded mode' },
        { cmd: '/%', text: '/%number — Zoom (e.g. /%50)' },
        { cmd: '/0', text: '/0  or  /wipe — Erase data and close tab' },
        { cmd: '/9', text: '/9  or  /lex — Lexical search (normalised)' }
    ];
    const rawList = (typeof _ === 'function') ? _('searchCommandsList') : null;
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
                if (sBox) {
                    sBox.value = '/%';
                    sBox.focus();
                }
            } else if (parseSearchQuery(cmd).lex) {
                // b2.20: режимът иска текст — оставяме командата в полето и чакаме думата
                if (sBox) {
                    sBox.value = '/9 ';
                    sBox.focus();
                }
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
    // b2.20: /9 и /lex не са еднократно действие, а режим на търсенето — връщаме false, за да остане
    // командата в полето и извикващият да пусне обикновеното търсене (applyFilters разпознава командата).
    if (parseSearchQuery(trimmed).lex) return false;
    if (cmd === '/set' || cmd === '/settings' || cmd === '/1') {
        const btn = document.getElementById('settings_button');
        if (btn) btn.click();
        return true;
    }
    if (cmd === '/norm' || cmd === '/normal' || cmd === '/6') {
        const header = document.querySelector('header');
        if (header && header.classList.contains('header-fullscreen')) toggleHeaderFullscreen();
        return true;
    }
    if (cmd === '/ex' || cmd === '/expand' || cmd === '/7') {
        const header = document.querySelector('header');
        if (header && !header.classList.contains('header-fullscreen')) toggleHeaderFullscreen();
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
    if (cmd === '/info' || cmd === '/2') {
        const counter = document.getElementById('note-counter');
        if (counter) counter.click();
        return true;
    }
    const zoomMatch = cmd.match(/^\/%\s*(\d+)\%?$/);
    if (zoomMatch) {
        const scaleInput = document.getElementById('scaleInput');
        const applyBtn = document.getElementById('applyZoomBtn');
        if (scaleInput) scaleInput.value = zoomMatch[1];
        if (applyBtn) applyBtn.click();
        return true;
    }
    if (cmd === '/wipe' || cmd === '/0') {
        const code = Math.floor(100 + Math.random() * 900);
        const template = (typeof _ === 'function' && _('wipeConfirmationPrompt')) || 'Enter confirmation code {code} to wipe all data:';
        const msg = template.replace('{code}', code);
        const inputVal = await showPrompt(msg);
        if (inputVal === null) return true;
        if (inputVal.trim() !== String(code)) {
            const wrongMsg = (typeof _ === 'function' && _('wipeWrongCode')) || 'Incorrect confirmation code. Operation cancelled.';
            alert(wrongMsg);
            return true;
        }
        try {
            if (typeof NOTES_DB_NAME !== 'undefined') indexedDB.deleteDatabase(NOTES_DB_NAME);
            if (typeof indexedDB !== 'undefined' && indexedDB.databases) {
                const dbs = await indexedDB.databases();
                for (const d of dbs) {
                    if (d.name) indexedDB.deleteDatabase(d.name);
                }
            }
            if (typeof caches !== 'undefined') {
                const keys = await caches.keys();
                for (const k of keys) {
                    if (k !== 'app-cache') await caches.delete(k);
                }
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

function showAllBoardsModal(onSelectCallback = null, hint = '') {
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
        // Pick-a-board mode (a note's "Move to board"): the close-all square has no place there.
        if (onSelectCallback && button.dataset.boardid === 'close-all-notes') return;
        const clone = button.cloneNode(true);
        // Only the header's own square keeps the id; the clone must not duplicate it.
        if (button.dataset.boardid === 'close-all-notes') clone.removeAttribute('id');
        const isUtil = isBoardMenuUtilId(button.dataset.boardid);
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

            if (boardId === 'close-all-notes') {
                // Closes the menu, then runs the header's own square: one question for the unsaved notes,
                // the same in both places.
                boardsModal.classList.remove('visible');
                const headerCloseAll = headerMenuContainer.querySelector('[data-boardid="close-all-notes"]');
                if (headerCloseAll && headerCloseAll.click) headerCloseAll.click();
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
    // The close-all square is one of the menu's own squares (createBoardsUI, b1.85), so the clone
    // above already carries it. Only its dim state is refreshed, for the state at this moment.
    updateCloseAllNotesButtons();
    const boardsModalBody = document.getElementById('boards-menu-modal-body');
    boardsModalBody.innerHTML = '';
    // Режим „премести N бележки": ред отгоре, иначе изборът на борд изглежда като навигация.
    if (hint) {
        const hintEl = document.createElement('div');
        hintEl.className = 'boards-modal-hint';
        hintEl.textContent = hint;
        boardsModalBody.appendChild(hintEl);
    }
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


// 12 или 24 ч по устройството (b2.13), определя се веднъж: първо -u-hc- в езика (системната настройка
// стига до браузъра така, напр. en-US-u-hc-h23), после какво дава Intl за езика. null - няма Intl.
let deviceHour12 = undefined;
function getDeviceHour12() {
    if (deviceHour12 !== undefined) return deviceHour12;
    deviceHour12 = null;
    try {
        const tag = (navigator.languages && navigator.languages[0]) || navigator.language || '';
        const hc = /-u(?:-[a-z0-9]+)*?-hc-(h11|h12|h23|h24)(?:-|$)/i.exec(tag);
        if (hc) {
            deviceHour12 = /^h1[12]$/i.test(hc[1]);
        } else {
            const resolved = new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' }).resolvedOptions();
            if (typeof resolved.hour12 === 'boolean') deviceHour12 = resolved.hour12;
            else if (resolved.hourCycle) deviceHour12 = resolved.hourCycle === 'h11' || resolved.hourCycle === 'h12';
        }
    } catch (e) {
        deviceHour12 = null;
    }
    return deviceHour12;
}

// Датата по устройството (b2.13): ден/месец/година и разделителите между тях, без опашки като „ г.“.
let deviceDateFormatter = null;
function formatDeviceDate(value) {
    if (!value) return '';
    const isoDay = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    const parsedValue = !isoDay && !isNaN(value) && !isNaN(parseFloat(value)) ? Number(value) : value;
    const date = isoDay ? new Date(Number(isoDay[1]), Number(isoDay[2]) - 1, Number(isoDay[3])) : new Date(parsedValue);
    if (Number.isNaN(date.getTime())) return '';
    try {
        if (!deviceDateFormatter) deviceDateFormatter = new Intl.DateTimeFormat(navigator.language, { day: '2-digit', month: '2-digit', year: 'numeric' });
        const parts = deviceDateFormatter.formatToParts(date);
        const first = parts.findIndex(p => p.type !== 'literal');
        let last = parts.length - 1;
        while (last >= 0 && parts[last].type === 'literal') last--;
        const text = parts.slice(first, last + 1).map(p => p.value).join('');
        if (text) return text;
    } catch (e) { /* без Intl - ръчно по-долу */ }
    return formatDate(date.getTime());
}

// Часът по настройката на устройството (12/24 ч, b2.12; изрично hour12 от b2.13); без Intl - 'HH:MM'.
let timeFormatter = null;
function formatTime(timestamp) {
    if (!timestamp) return '';
    try {
        const parsedValue = !isNaN(timestamp) && !isNaN(parseFloat(timestamp)) ? Number(timestamp) : timestamp;
        const date = new Date(parsedValue);
        if (Number.isNaN(date.getTime())) return '';
        try {
            const hour12 = getDeviceHour12();
            if (typeof hour12 !== 'boolean') throw new Error('no Intl');
            if (!timeFormatter) timeFormatter = new Intl.DateTimeFormat(navigator.language, { hour: 'numeric', minute: '2-digit', hour12 });
            return timeFormatter.format(date);
        } catch (e) {
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
        }
    } catch (e) {
        return ''; // Fallback
    }
}

// Календарната дата с часа от uiState.cTime ('HH:MM') като timestamp; без час - 0.
function getNoteCalDateTimeTimestamp(noteData) {
    const calDate = Number(noteData?.calendarDate) || 0;
    const time = calDate > 0 ? getNoteCalTime(noteData.uiState) : '';
    if (!time) return 0;
    const d = new Date(calDate);
    if (Number.isNaN(d.getTime())) return 0;
    const [h, m] = time.split(':').map(Number);
    d.setHours(h, m, 0, 0);
    return d.getTime();
}

// --- b2.14: камбанка и звук при настъпване на събитие от календара ---
// Локален часовник на всеки 20 сек през allNotesData: без заявки към Google. Звъни бележка с дата и час,
// чийто момент е настъпил в последната минута, докато приложението е отворено. Момент преди пускането на
// часовника (отминал, при затворено приложение, при презареждане) не звъни; всяка двойка бележка+момент звъни веднъж.
const CAL_BELL_TICK_MS = 20000;
const CAL_BELL_WINDOW_MS = 60000;
const CAL_BELL_SHOW_MS = 10000;
const CAL_BELL_SVG = '<svg width="24" height="24" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>';
let calBellStartedAt = 0;
let calBellInterval = null;
const calBellFired = new Set(); // '<id|gdid>@<момент>'
let calBellQueue = []; // бележките на събитията, които звъннаха, докато камбанката е на екрана
let calBellOpened = 0; // колко от опашката вече са отворени с клик
let calBellActive = false;
let calBellUntil = 0;
let calBellTimer = null;
let calBellSaved = null; // { html, title, keyTitle } на календарчето
let calBellAudioCtx = null;
let calBellSoundCalls = 0;

function getCalBellAudioCtx() {
    if (!calBellAudioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        calBellAudioCtx = new Ctx();
    }
    if (calBellAudioCtx.state === 'suspended') calBellAudioCtx.resume().catch(() => { });
    return calBellAudioCtx;
}

// Политиката за автостарт пуска звук само след жест: първото докосване отключва контекста с тих импулс.
function unlockCalBellAudio() {
    document.removeEventListener('pointerdown', unlockCalBellAudio, true);
    try {
        const ctx = getCalBellAudioCtx();
        if (!ctx) return;
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
    } catch (e) { }
}

// Къс двоен тон (880 Hz, после 1175 Hz), без звуков файл.
function playCalendarBellSound() {
    calBellSoundCalls++;
    try {
        const ctx = getCalBellAudioCtx();
        if (!ctx) return;
        const t0 = ctx.currentTime + 0.01;
        [[880, 0], [1175, 0.14]].forEach(([freq, at]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, t0 + at);
            gain.gain.exponentialRampToValueAtTime(0.15, t0 + at + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.12);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0 + at);
            osc.stop(t0 + at + 0.13);
        });
    } catch (e) { }
}

function calBellNoteKey(note) {
    return String(note.gdid || note.id || '');
}

function showCalendarBell(now) {
    const btn = document.getElementById('calendar_button');
    if (!btn) return;
    if (!calBellActive) {
        calBellSaved = { html: btn.innerHTML, title: btn.getAttribute('title'), keyTitle: btn.getAttribute('data-key-title') };
        btn.innerHTML = CAL_BELL_SVG;
        btn.classList.add('cal-bell-flash');
        btn.setAttribute('data-key-title', 'calendarBellTooltip');
        btn.setAttribute('title', (typeof _ === 'function' && _('calendarBellTooltip')) || 'Calendar event');
        calBellActive = true;
    }
    // 10-те секунди се броят от последното събитие.
    calBellUntil = now + CAL_BELL_SHOW_MS;
    clearTimeout(calBellTimer);
    calBellTimer = setTimeout(restoreCalendarButton, CAL_BELL_SHOW_MS);
}

function restoreCalendarButton() {
    clearTimeout(calBellTimer);
    calBellTimer = null;
    calBellQueue = [];
    calBellOpened = 0;
    calBellUntil = 0;
    if (!calBellActive) return;
    calBellActive = false;
    const btn = document.getElementById('calendar_button');
    if (!btn || !calBellSaved) return;
    btn.innerHTML = calBellSaved.html;
    btn.classList.remove('cal-bell-flash');
    if (calBellSaved.title === null) btn.removeAttribute('title'); else btn.setAttribute('title', calBellSaved.title);
    if (calBellSaved.keyTitle === null) btn.removeAttribute('data-key-title'); else btn.setAttribute('data-key-title', calBellSaved.keyTitle);
    const restoredTitle = calBellSaved.keyTitle && typeof _ === 'function' ? _(calBellSaved.keyTitle) : '';
    if (restoredTitle) btn.setAttribute('title', restoredTitle); // езикът може да се е сменил междувременно
    calBellSaved = null;
}

// Клик върху камбанката: най-старата неотворена бележка от опашката (после пак последната).
function openCalendarBellNote() {
    if (!calBellQueue.length) return;
    const entry = calBellQueue[Math.min(calBellOpened, calBellQueue.length - 1)];
    calBellOpened++;
    const note = allNotesData.find(n => n && ((entry.gdid && String(n.gdid) === entry.gdid) || (entry.id && String(n.id) === entry.id)));
    if (!note) return;
    // Същият път като клик върху картата на борда (handleNoteClick); без карта в DOM - същият showModal.
    let card = null;
    try {
        card = (note.gdid ? document.querySelector(`.note[data-g="${CSS.escape(String(note.gdid))}"]`) : null) ||
            ((note.id !== undefined && note.id !== null) ? document.querySelector(`.note[data-i="${CSS.escape(String(note.id))}"]`) : null);
    } catch (e) { }
    if (card) {
        card.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true }));
        return;
    }
    showModal({
        raw: note.notetxt !== undefined ? note.notetxt : note.text,
        format: note.text_span,
        titleFormat: note.title_span || note.title_text_span,
        color: getNoteColorCss(note.color),
        boardId: note.boardid,
        id: note.id,
        gdid: note.gdid,
        datemod: note.datemod,
        originalNote: note
    });
}

function calendarBellTick(now = Date.now()) {
    try {
        if (calBellActive && calBellUntil && now >= calBellUntil) restoreCalendarButton();
        if (!Array.isArray(allNotesData) || !allNotesData.length) return 0;
        const due = [];
        allNotesData.forEach(note => {
            if (!note || Number(note.status) === 1 || !(Number(note.calendarDate) > 0)) return;
            const moment = getNoteCalDateTimeTimestamp(note);
            if (!moment || now < moment) return;
            const key = calBellNoteKey(note) + '@' + moment;
            if (calBellFired.has(key)) return;
            calBellFired.add(key); // отминалите се отбелязват, за да не звънят по-късно
            if (moment < calBellStartedAt || now - moment > CAL_BELL_WINDOW_MS) return;
            due.push({ id: note.id !== undefined && note.id !== null ? String(note.id) : '', gdid: note.gdid ? String(note.gdid) : '', moment });
        });
        if (!due.length) return 0;
        due.sort((a, b) => a.moment - b.moment);
        calBellQueue.push(...due);
        playCalendarBellSound();
        showCalendarBell(now);
        return due.length;
    } catch (e) {
        console.warn('calendarBellTick failed:', e);
        return 0;
    }
}

function startCalendarBellClock() {
    if (calBellInterval) return;
    calBellStartedAt = Date.now();
    calendarBellTick(calBellStartedAt);
    calBellInterval = setInterval(() => calendarBellTick(Date.now()), CAL_BELL_TICK_MS);
    document.addEventListener('pointerdown', unlockCalBellAudio, true);
}

// Тънка кука за проверките с изкуствен часовник.
window.calendarBell = {
    tick: calendarBellTick,
    expire: (now) => { if (calBellActive && now >= calBellUntil) restoreCalendarButton(); return !calBellActive; },
    restart: (startedAt) => { restoreCalendarButton(); calBellFired.clear(); calBellStartedAt = startedAt; calBellSoundCalls = 0; },
    state: () => ({ active: calBellActive, until: calBellUntil, queue: calBellQueue.slice(), opened: calBellOpened, soundCalls: calBellSoundCalls, startedAt: calBellStartedAt })
};
// Add an event listener to the modal's close button to reset button visibility
document.querySelectorAll('.modal-close').forEach(btn => {
    if (btn.closest('.note-window')) return; // the note windows reset themselves (wireNoteWindow)
    btn.addEventListener('click', () => {
        // This reset belongs to the note modal alone, and its own close button is wired in wireNoteWindow
        // (the note windows reset themselves). What reaches this listener is the close button of the OTHER
        // overlays -- the boards menu, the new-board dialog, the settings. They must not touch the note
        // modal: clearing the inline left/top of its box dropped the active note window into the top-left
        // corner of the workspace (CX, 2026-10-07).
        const owner = btn.closest('.modal-overlay, .settings-modal, .modal');
        if (!owner || owner.id !== 'content-modal') return;
        copyBtn.style.display = 'flex'; // Restore copy button visibility when the note modal is closed
        const pasteModalBtn = document.getElementById('paste-modal-btn');
        if (pasteModalBtn) pasteModalBtn.style.display = 'none';
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
// b2.35: менюто с бордовете се връща при избрания борд и когато е било скрито по време на избора.
// При отворен календар хедърът е display:none, така че scrollIntoView в boardClick не може да измери
// нищо; след връщането към бележките менюто остава там, където е било, а избраният борд е извън екрана.
// Скролира се само когато бордът наистина не се вижда, за да не мести менюто при обикновен клик.
function revealBoardInHeaderMenu(boardId) {
    if (boardId === undefined || boardId === null) return;
    const menu = document.querySelector('header .board-menu-container');
    if (!menu) return;
    let link = null;
    try {
        link = menu.querySelector(`.board-filter-link[data-boardid="${CSS.escape(String(boardId))}"]`);
    } catch (e) {
        link = null;
    }
    if (!link) return;
    const box = menu.getBoundingClientRect();
    const item = link.getBoundingClientRect();
    if (!box.width || !item.width) return; // още скрит: няма какво да се скролира
    if (item.left >= box.left - 1 && item.right <= box.right + 1) return; // вече се вижда
    const target = menu.scrollLeft + (item.left - box.left) - (box.width - item.width) / 2;
    menu.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
}

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
        let boardToFilter = null;
        // Локален режим: връзката е по gdid на борда.
        const board = boardsData.find(b => b.gdid == boardId || b.id == boardId);
        if (board) {
            boardToFilter = board.gdid || board.id;
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
        // Масовият избор (b2.36) не живее в календара — изчистваме го при отваряне.
        if (selectionState.active) exitSelectionMode();
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
    currentBoardFilter = specialBoards.includes(boardId) ? boardId : boardId;
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

        if (board && board.backpath) {
            // Локален режим: фонът е blob в store `files`, ключът му е в backpath.
            const cacheKey = board.backpath;
            if (customBgCache.has(cacheKey)) {
                document.body.style.backgroundImage = `url('${customBgCache.get(cacheKey)}')`;
            } else {
                getFileRecord(cacheKey).then(record => {
                    if (record && record.blob) {
                        const objectUrl = URL.createObjectURL(record.blob);
                        customBgCache.set(cacheKey, objectUrl);
                        document.body.style.backgroundImage = `url('${objectUrl}')`;
                    } else {
                        board.backpath = "";
                        board.backnum = 0;
                        document.body.style.backgroundImage = `url('Board.png')`;
                    }
                });
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
    const runFilter = () => {
        applyFilters();
        // Показваме контейнера след като филтрирането е приключило
        requestAnimationFrame(() => {
            notesContainer.style.visibility = '';
        });
    };
    runFilter();
    updateSearchPlaceholder();
    window.dispatchEvent(new Event('scroll'));
    // --- КОРЕКЦИЯ: Възстановяване на UI след затваряне на календара ---
    // Тъй като renderCalendarView скрива хедъра и контейнера с бележки,
    // тук трябва изрично да ги покажем отново, ако не сме в режим календар.
    if (boardId !== 'calendar') {
        const calendarContainer = document.getElementById('calendar-container');
        if (calendarContainer) calendarContainer.style.display = 'none';
        const weeklyCalendarContainer = document.getElementById('weekly-calendar-container');
        if (weeklyCalendarContainer) weeklyCalendarContainer.style.display = 'none';
        // Възстановяваме видимостта на основните елементи
        document.querySelector('header').style.display = 'flex';
        notesContainer.style.display = 'flex';
        // scrollTopBtn visibility is handled by the scroll event
        // scrollTopBtn.style.display = 'block';
        const addNoteFab = document.getElementById('add-note-fab');
        if (addNoteFab) addNoteFab.style.display = 'flex';
        adjustFullscreenSearchLayout();
        // b2.35: хедърът тъкмо е станал видим — връщаме менюто при избрания борд (при отворен календар
        // кликът е минал, докато менюто беше скрито, и скролирането в boardClick не е имало какво да мери).
        requestAnimationFrame(() => revealBoardInHeaderMenu(buttonBoardId));
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
        if (isBoardMenuUtilId(link.dataset.boardid)) return; // Reorder / Fullscreen / Close-all are not boards
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

// b2.19: лексикален крак на търсенето — българска нормализация, прилагана и на заявката, и на текста на бележката.
// Семантиката остава подниз: нормализират се само двата сравнявани низа.
// b2.21: „и“ и „й“ се приравняват — и двете стават „и“, точно както ѝ→и. Важи само в лексикалния режим (/9, /lex).
const SEARCH_HOMOGLYPHS = {
    a: 'а', e: 'е', o: 'о', c: 'с', p: 'р', x: 'х', y: 'у', k: 'к',
    A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
    '0': 'о', '3': 'З'
};
const SEARCH_CYRILLIC_RE = /[\u0400-\u04FF]/;
const SEARCH_WORD_RE = /[\p{L}\p{N}]+/gu;
const SEARCH_ARTICLE_ENDINGS = ['ите', 'ът', 'ят', 'та', 'то', 'те'];
const SEARCH_MIN_STEM = 4;

// Хомоглифи само в дума с кирилска буква (иначе „ok“, „SMS“ стават кирилица). Цифрите 0/3 се сменят само когато
// не са до друга цифра и думата има поне 3 букви — „б0лка“ → „болка“, но „2023г“, „10кг“ остават числа.
function replaceSearchHomoglyphs(word) {
    if (!SEARCH_CYRILLIC_RE.test(word)) return word;
    const letters = (word.match(/\p{L}/gu) || []).length;
    let out = '';
    for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        const mapped = SEARCH_HOMOGLYPHS[ch];
        if (mapped && (ch === '0' || ch === '3')) {
            const isolated = !/\d/.test(word[i - 1] || '') && !/\d/.test(word[i + 1] || '');
            out += (isolated && letters >= 3) ? mapped : ch;
        } else {
            out += mapped || ch;
        }
    }
    return out;
}

// Членуване: маха -ите/-ът/-ят/-та/-то/-те само ако основата остава ≥ 4 знака („дата“, „нота“ не се пипат).
function stripSearchArticle(word) {
    if (!SEARCH_CYRILLIC_RE.test(word)) return word;
    for (const ending of SEARCH_ARTICLE_ENDINGS) {
        if (word.endsWith(ending) && word.length - ending.length >= SEARCH_MIN_STEM) {
            return word.slice(0, -ending.length);
        }
    }
    return word;
}

function normalizeSearchText(text) {
    if (!text) return '';
    return String(text)
        .replace(SEARCH_WORD_RE, replaceSearchHomoglyphs)
        .toLowerCase()
        .replace(/ѝ/g, 'и')
        .replace(/й/g, 'и')
        .replace(SEARCH_WORD_RE, stripSearchArticle);
}

// b2.19: нормализираният текст на бележка се помни за самия елемент (WeakMap), за да не се преизчислява
// на всяко натискане. Ключ е самият суров textContent — щом текстът се промени, кешът се подменя.
const normalizedNoteTextCache = new WeakMap();
function getNormalizedNoteText(el, raw) {
    const cached = normalizedNoteTextCache.get(el);
    if (cached && cached.raw === raw) return cached.norm;
    const norm = normalizeSearchText(raw);
    normalizedNoteTextCache.set(el, { raw, norm });
    return norm;
}

// b2.20: лексикалният режим се вдига само с команда в самото поле — „/9 текст“ или „/lex текст“.
// Командата остава видима (тя е указателят за режима); търси се само текстът след нея.
const LEX_SEARCH_COMMAND_RE = /^\s*\/(?:9|lex)(?:\s+|$)/i;
function parseSearchQuery(raw) {
    const value = raw || '';
    const m = value.match(LEX_SEARCH_COMMAND_RE);
    if (!m) return { lex: false, query: value };
    return { lex: true, query: value.slice(m[0].length) };
}

function applyFilters() {
    const searchBox = document.getElementById('search-box');
    const parsedSearch = parseSearchQuery(searchBox ? searchBox.value : '');
    const isLexSearch = parsedSearch.lex;
    // b2.20: ефективната заявка е без командата — празно „/9“ не е търсене; голата заявка е както преди b2.19
    const searchTerm = (!isLexSearch || parsedSearch.query.trim() !== '') ? parsedSearch.query.toLowerCase() : '';
    // b2.19: заявката се нормализира веднъж на извикване — b2.20: само в лексикален режим
    const normalizedSearchTerm = (isLexSearch && searchTerm !== '') ? normalizeSearchText(parsedSearch.query) : '';
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
            matchesSearch = isLexSearch
                ? getNormalizedNoteText(note, noteText).includes(normalizedSearchTerm)
                : noteText.toLowerCase().includes(searchTerm);
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
            const boardToMatch = boardsData.find(b => (b.gdid || b.id) == currentBoardFilter);
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
        // Иконата и слушателят се слагат веднъж: тази секция върви при всяко пре-рисуване.
        if (!emptyTrashFab.dataset.trashBound) {
            emptyTrashFab.innerHTML = emptyTrashIconSvg;
            emptyTrashFab.addEventListener('click', emptyTrash);
            emptyTrashFab.dataset.trashBound = '1';
        }
        const isTrash = currentBoardFilter === 'trash';
        emptyTrashFab.style.display = (isTrash && visibleCount > 0) ? 'flex' : 'none';
    }

    // --- Масов избор (b2.36): връщаме отметките след всяко пре-рисуване ---
    applySelectionToDom();
}

/* --- МАСОВ ИЗБОР НА БЕЛЕЖКИ (b2.36) ---
 * Изборът живее ИЗВЪН затварянията на картите: тук се пази само ключът на бележката
 * (String(gdid || id)), а отметките се нанасят върху DOM след всяко пре-рисуване.
 * Затварянията на картите държат снимка на данните от момента на рисуване, затова
 * избор, пазен в тях, би остарял при първото пре-рисуване.
 */
const MASS_SELECTION_LIMIT = 500;
const selectionState = {
    keys: new Set(), // ключове на избраните бележки
    anchorKey: null, // котва за Shift+клик (последната карта, отбелязана без Shift)
    boardId: null, // бордът, в който е започнал изборът
    active: false // дали сме в режим на избор
};

/** Ключът на карта в дъската: String(gdid || id). Празен низ = не е истинска бележка. */
function getNoteCardKey(el) {
    if (!el || !el.dataset) return '';
    return String(el.dataset.g || el.dataset.i || '');
}

/** Истинска карта на бележка ли е (не промо, не ред от менюто на бордовете)? */
function isSelectableNoteCard(el) {
    if (!el || el.nodeType !== 1) return false;
    if (!el.classList || !el.classList.contains('note')) return false;
    if (el.classList.contains('promo-note') || el.classList.contains('boards-note')) return false;
    return getNoteCardKey(el) !== '';
}

/** Всички карти на бележки в контейнера; visibleOnly - само показаните в текущия борд. */
function getNoteCards(visibleOnly = false) {
    if (!notesContainer) return [];
    return Array.from(notesContainer.querySelectorAll('.note'))
        .filter(el => isSelectableNoteCard(el) && (!visibleOnly || el.style.display !== 'none'));
}

/** Лентата с действията. Създава се веднъж и стои в document.body, за да не мести решетката. */
function ensureSelectionBar() {
    let bar = document.getElementById('selection-bar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'selection-bar';
    bar.hidden = true;
    const count = document.createElement('span');
    count.id = 'selection-count';
    bar.appendChild(count);
    const moveBtn = document.createElement('button');
    moveBtn.type = 'button';
    moveBtn.id = 'selection-move-btn';
    moveBtn.className = 'selection-bar-btn';
    moveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        bulkMoveSelectedNotes();
    });
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.id = 'selection-delete-btn';
    delBtn.className = 'selection-bar-btn selection-bar-danger';
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        bulkDeleteSelectedNotes();
    });
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.id = 'selection-clear-btn';
    clearBtn.className = 'selection-bar-btn selection-bar-icon';
    clearBtn.textContent = '✕';
    clearBtn.title = _('selectionClear') || 'Clear selection';
    clearBtn.setAttribute('aria-label', clearBtn.title);
    clearBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exitSelectionMode();
    });
    bar.appendChild(moveBtn);
    bar.appendChild(delBtn);
    bar.appendChild(clearBtn);
    document.body.appendChild(bar);
    return bar;
}

/** Обновява текстовете и видимостта на лентата. Показва се само при непразен избор. */
function updateSelectionBar() {
    const bar = ensureSelectionBar();
    const count = selectionState.keys.size;
    if (!selectionState.active || count === 0) {
        bar.hidden = true;
        return;
    }
    bar.hidden = false;
    const countEl = document.getElementById('selection-count');
    if (countEl) countEl.textContent = (_('selectionCount') || 'Selected: {count}').replace('{count}', count);
    const moveBtn = document.getElementById('selection-move-btn');
    if (moveBtn) moveBtn.textContent = _('selectionMove') || 'Move';
    const delBtn = document.getElementById('selection-delete-btn');
    if (delBtn) {
        delBtn.textContent = (currentBoardFilter === 'trash')
            ? (_('selectionDeletePermanent') || 'Delete permanently')
            : (_('selectionDelete') || 'Delete {count}').replace('{count}', count);
    }
    const clearBtn = document.getElementById('selection-clear-btn');
    if (clearBtn) {
        const title = _('selectionClear') || 'Clear selection';
        clearBtn.title = title;
        clearBtn.setAttribute('aria-label', title);
    }
}

/** Слага/маха отметката на една карта. Отметката е пряк съсед на кръгчето за закачане в реда на
 *  кабарчето и заема неговото място, затова не се мери нищо и не се пипа оформлението. */
function setCardSelectionMarker(card, isSelected) {
    if (!card) return;
    const box = card.querySelector('.note-select-check');
    if (!isSelected) {
        card.classList.remove('note-selected');
        if (box) box.remove();
        return;
    }
    card.classList.add('note-selected');
    if (box) return;
    const mark = document.createElement('div');
    mark.className = 'note-select-check checked';
    mark.setAttribute('aria-hidden', 'true');
    // Влиза точно преди кръгчето; без кръгче — в края на реда на заглавието.
    const pin = card.querySelector('.note-pin-btn');
    if (pin && pin.parentNode) {
        pin.parentNode.insertBefore(mark, pin);
    } else {
        const host = card.querySelector('.note-title-wrapper');
        if (host) host.appendChild(mark);
        else card.appendChild(mark);
    }
}

/** Нанася избора върху DOM: отметки, рамка, затъмняване на останалите карти.
 *  Пипа само картите, чието състояние се различава от желаното — при влизане в избор това е
 *  само кликнатата карта, а не целият борд (иначе големите бордове се усещат като забавяне). */
function applySelectionDomOnly() {
    if (!notesContainer) return;
    notesContainer.classList.toggle('selection-mode', selectionState.active);
    if (!selectionState.active) {
        notesContainer.querySelectorAll('.note-select-check').forEach(box => box.remove());
        notesContainer.querySelectorAll('.note.note-selected').forEach(card => card.classList.remove('note-selected'));
    } else {
        getNoteCards(false).forEach(card => {
            const shouldBeSelected = selectionState.keys.has(getNoteCardKey(card));
            if (shouldBeSelected !== card.classList.contains('note-selected')) {
                setCardSelectionMarker(card, shouldBeSelected);
            }
        });
    }
    const bar = document.getElementById('selection-bar');
    if (bar && !selectionState.active) bar.hidden = true;
}

/**
 * Извиква се в края на всяко пре-рисуване на дъската: връща отметките по картите и
 * изхвърля ключове, чиито бележки вече ги няма в DOM.
 */
function applySelectionToDom() {
    if (!notesContainer) return;
    if (!selectionState.active) {
        if (notesContainer.classList.contains('selection-mode')) notesContainer.classList.remove('selection-mode');
        return;
    }
    // Сменили сме борда или отворили календара → изборът се изчиства.
    if (selectionState.boardId !== null && String(selectionState.boardId) !== String(currentBoardFilter)) {
        exitSelectionMode();
        return;
    }
    const present = new Set(getNoteCards(false).map(getNoteCardKey));
    Array.from(selectionState.keys).forEach(k => {
        if (!present.has(k)) selectionState.keys.delete(k);
    });
    if (selectionState.keys.size === 0) {
        exitSelectionMode();
        return;
    }
    applySelectionDomOnly();
    updateSelectionBar();
}

/** Влиза в режим на избор и отбелязва дадена карта (ако е подадена). */
function enterSelectionMode(key) {
    selectionState.active = true;
    selectionState.boardId = currentBoardFilter;
    if (key) {
        selectionState.keys.add(key);
        selectionState.anchorKey = key;
    }
    applySelectionDomOnly();
    updateSelectionBar();
}

/** Излиза от режима и маха всички отметки. */
function exitSelectionMode() {
    selectionState.active = false;
    selectionState.keys.clear();
    selectionState.anchorKey = null;
    selectionState.boardId = null;
    applySelectionDomOnly();
    updateSelectionBar();
}

/** Слага/маха отметка на един ключ, без да пипа останалите. */
function setNoteSelected(key, selected) {
    if (!key) return;
    if (selected) {
        if (selectionState.keys.size >= MASS_SELECTION_LIMIT && !selectionState.keys.has(key)) {
            showToast((_('selectionTooMany') || '').replace('{max}', MASS_SELECTION_LIMIT), 3000);
            return;
        }
        selectionState.keys.add(key);
    } else {
        selectionState.keys.delete(key);
    }
    selectionState.anchorKey = key;
    if (selectionState.keys.size === 0) {
        exitSelectionMode();
        return;
    }
    applySelectionDomOnly();
    updateSelectionBar();
}

/** Маха бележка от избора, ако е била в него (при триене от кабарчето). */
function dropFromSelectionIfPresent(key) {
    if (!key || !selectionState.active || !selectionState.keys.has(key)) return;
    setNoteSelected(key, false);
}

/** Обикновен клик в режим на избор: сменя отметката на картата. */
function toggleNoteSelection(key) {
    if (!key) return;
    if (selectionState.keys.has(key)) {
        selectionState.keys.delete(key);
        selectionState.anchorKey = key;
    } else {
        setNoteSelected(key, true);
        return;
    }
    if (selectionState.keys.size === 0) {
        exitSelectionMode();
        return;
    }
    applySelectionDomOnly();
    updateSelectionBar();
}

/** Shift+клик: отбелязва диапазона от котвата до тази карта. */
function extendSelectionTo(key) {
    const keys = getNoteCards(true).map(getNoteCardKey);
    const targetIndex = keys.indexOf(key);
    if (targetIndex === -1) return;
    const anchorIndex = selectionState.anchorKey ? keys.indexOf(selectionState.anchorKey) : -1;
    if (anchorIndex === -1) {
        setNoteSelected(key, true);
        return;
    }
    const from = Math.min(anchorIndex, targetIndex);
    const to = Math.max(anchorIndex, targetIndex);
    for (let i = from; i <= to; i++) {
        if (selectionState.keys.size >= MASS_SELECTION_LIMIT && !selectionState.keys.has(keys[i])) {
            showToast((_('selectionTooMany') || '').replace('{max}', MASS_SELECTION_LIMIT), 3000);
            break;
        }
        selectionState.keys.add(keys[i]);
    }
    applySelectionDomOnly();
    updateSelectionBar();
}

/** Ctrl+A: избира всички показани карти на текущия борд (до лимита). */
function selectAllVisibleNotes() {
    const cards = getNoteCards(true);
    if (!cards.length) return;
    selectionState.active = true;
    selectionState.boardId = currentBoardFilter;
    if (cards.length > MASS_SELECTION_LIMIT) showToast((_('selectionTooMany') || '').replace('{max}', MASS_SELECTION_LIMIT), 3000);
    for (const card of cards) {
        if (selectionState.keys.size >= MASS_SELECTION_LIMIT) break;
        selectionState.keys.add(getNoteCardKey(card));
    }
    if (selectionState.keys.size === 0) {
        exitSelectionMode();
        return;
    }
    applySelectionDomOnly();
    updateSelectionBar();
}

/** Фокусът в поле за писане ли е (там Ctrl+A избира текста, не бележките). */
function isTypingTarget(el) {
    if (!el || el === document.body || el.nodeType !== 1) return false;
    const tag = (el.tagName || '').toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

/** Отворен ли е модал/прозорец — тогава клавишите принадлежат на него, не на дъската. */
function isAnyOverlayOpen() {
    return !!document.querySelector('.modal-overlay.visible, #content-modal.visible, #boards-menu-modal.visible, #folderIdPromptPopup.show, #note-edit-textarea');
}

// Ctrl/Cmd+A избира целия борд, Escape изчиства избора.
document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (e.key === 'Escape') {
        if (!selectionState.active) return;
        if (isAnyOverlayOpen()) return; // първо модалите се затварят
        e.preventDefault();
        exitSelectionMode();
        return;
    }
    const isA = e.key === 'a' || e.key === 'A' || e.code === 'KeyA';
    if (!isA || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    if (isTypingTarget(document.activeElement)) return;
    if (isAnyOverlayOpen()) return;
    e.preventDefault();
    selectAllVisibleNotes();
});

/* --- КРАЙ НА МАСОВИЯ ИЗБОР (следват действията по партида) --- */

/* --- ДЕЙСТВИЯ ПО ПАРТИДА (b2.36) --- */

/** Записва възстановена бележка по същите пътища, по които върви триенето/преместването. */
async function persistRestoredNote(note) {
    note.type = -1; // локален режим
    await bulkPutDB(NOTE_STORE_NAME, [note], true);
}

/** Едно пре-рисуване и едни броячи за цялата партида. */
function refreshAfterBatch(boardIds) {
    (boardIds || []).forEach(b => {
        if (b !== undefined && b !== null) updateBoardCounterUI(b);
    });
    updateBoardCounterUI('trash');
    applyFilters();
    const cal = document.getElementById('calendar-container');
    if (cal && cal.style.display !== 'none') renderCalendarView();
    const week = document.getElementById('weekly-calendar-container');
    if (week && week.style.display !== 'none' && typeof renderWeeklyCalendarView === 'function') {
        renderWeeklyCalendarView(currentWeeklyViewDate);
    }
    updateReloadButtonState();
    if (typeof scheduleSemanticIndexSync === 'function') scheduleSemanticIndexSync();
}

/** Връща на картата в DOM новите борд/статус, за да не се разминава с данните. */
function syncCardDataset(note) {
    if (!note) return;
    const el = document.querySelector(`.note[data-g="${note.gdid}"]`) ||
        (note.id !== undefined ? document.querySelector(`.note[data-i="${note.id}"]`) : null);
    if (!el) return;
    if (note.boardid !== undefined) el.dataset.b = note.boardid;
    if (note.status !== undefined) el.dataset.s = String(note.status);
}

/** Избраните бележки от данните, в реда на избора. */
function getSelectedNotes() {
    const notes = [];
    selectionState.keys.forEach(k => {
        const note = allNotesData.find(n => String(n.gdid || n.id) === k);
        if (note) notes.push(note);
    });
    return notes;
}

/**
 * Триене на партидата: в кошчето — окончателно, другаде — в кошчето, с едно потвърждение
 * с числото и едно съобщение с „Отмени" за цялата партида.
 */
async function bulkDeleteSelectedNotes() {
    if (selectionState.keys.size === 0) return;
    if (selectionState.keys.size > MASS_SELECTION_LIMIT) {
        showToast((_('selectionTooMany') || '').replace('{max}', MASS_SELECTION_LIMIT), 3000);
        return;
    }
    const targets = getSelectedNotes();
    if (!targets.length) {
        exitSelectionMode();
        return;
    }
    const count = targets.length;
    const inTrash = currentBoardFilter === 'trash';
    const confirmMsg = inTrash
        ? (_n('confirmBatchDelete', count) || _('confirmNoteDelete') || '')
        : (_n('confirmBatchMoveToTrash', count) || _('confirmNoteMoveToTrash') || '');
    const confirmed = await showConfirmation(confirmMsg);
    if (!confirmed) return;
    const before = targets.map(note => ({ note, boardid: note.boardid, status: note.status }));
    const boards = new Set();
    before.forEach(b => {
        if (b.boardid !== undefined && b.boardid !== null) boards.add(String(b.boardid));
    });
    exitSelectionMode();
    if (inTrash) {
        // Окончателното триене не може да се отмени — затова тук няма бутон „Отмени".
        for (const b of before) {
            try {
                await permanentlyDeleteNote(b.note.gdid, b.note.id, true);
            } catch (err) {
                console.error('Batch permanent delete failed:', err);
            }
        }
        refreshAfterBatch(boards);
        showToast(_n('batchDeleted', count), 4000);
        return;
    }
    let trashed = 0;
    for (const b of before) {
        const ok = await moveNoteToTrash(b.note.gdid, b.note.id, { batch: true });
        if (ok) trashed++;
    }
    refreshAfterBatch(boards);
    if (trashed === 0) {
        showToast(_('noteDeletedError') || 'Error', 5000);
        return;
    }
    showUndoToast(_n('batchMovedToTrash', trashed), async () => {
        let restored = 0;
        for (const b of before) {
            b.note.status = b.status === undefined ? 0 : b.status;
            if (b.boardid !== undefined) b.note.boardid = b.boardid;
            b.note.datemod = Date.now();
            try {
                await persistRestoredNote(b.note);
                restored++;
            } catch (err) {
                console.error('Batch undo failed:', err);
            }
            syncCardDataset(b.note);
        }
        refreshAfterBatch(boards);
        if (restored === before.length) {
            showToast(_n('batchUndone', restored), 3000);
        } else {
            showToast((_('batchUndoPartial') || '')
                .replace('{done}', restored).replace('{total}', before.length), 5000);
        }
    });
}

/** Отваря избора на борд за партидата (със свой ред „Премести N бележки в…"). */
async function bulkMoveSelectedNotes() {
    if (selectionState.keys.size === 0) return;
    if (selectionState.keys.size > MASS_SELECTION_LIMIT) {
        showToast((_('selectionTooMany') || '').replace('{max}', MASS_SELECTION_LIMIT), 3000);
        return;
    }
    const keys = Array.from(selectionState.keys);
    const hint = _n('selectionMoveHint', keys.length);
    showAllBoardsModal((newBoardId) => {
        runBulkMove(keys, newBoardId);
    }, hint);
}

/** Самото преместване: едно пре-рисуване, едно съобщение, бележките в целта се пропускат. */
async function runBulkMove(keys, newBoardId) {
    const targetBoard = boardsData.find(b => (b.gdid || b.id) == newBoardId);
    if (!targetBoard) return;
    const targets = [];
    keys.forEach(k => {
        const note = allNotesData.find(n => String(n.gdid || n.id) === k);
        if (note) targets.push(note);
    });
    if (!targets.length) {
        exitSelectionMode();
        return;
    }
    const before = targets.map(note => ({ note, boardid: note.boardid, status: note.status }));
    const boards = new Set([String(newBoardId)]);
    before.forEach(b => {
        if (b.boardid !== undefined && b.boardid !== null) boards.add(String(b.boardid));
    });
    exitSelectionMode();
    let moved = 0;
    let skipped = 0;
    const movedEntries = [];
    for (const b of before) {
        if (String(b.note.boardid) === String(newBoardId) && b.note.status !== 1) {
            skipped++;
            continue;
        }
        const ok = await moveNoteToBoard(b.note.gdid, b.note.id, newBoardId, { batch: true });
        if (ok === true) {
            moved++;
            movedEntries.push(b);
        } else {
            skipped++;
        }
    }
    refreshAfterBatch(boards);
    if (moved === 0) {
        showToast((_('batchMoveNothing') || '').replace('{boardName}', targetBoard.title), 4000);
        return;
    }
    let msg = _n('batchMovedSuccess', moved, { boardName: targetBoard.title });
    if (skipped > 0) {
        msg += ' ' + _n('batchMoveSkipped', skipped, { boardName: targetBoard.title });
    }
    showUndoToast(msg, async () => {
        let restored = 0;
        for (const b of movedEntries) {
            b.note.boardid = b.boardid;
            b.note.status = b.status === undefined ? 0 : b.status;
            b.note.datemod = Date.now();
            try {
                await persistRestoredNote(b.note);
                restored++;
            } catch (err) {
                console.error('Batch move undo failed:', err);
            }
            syncCardDataset(b.note);
        }
        refreshAfterBatch(boards);
        if (restored === movedEntries.length) {
            showToast(_n('batchUndone', restored), 3000);
        } else {
            showToast((_('batchUndoPartial') || '')
                .replace('{done}', restored).replace('{total}', movedEntries.length), 5000);
        }
    });
}

/* --- КРАЙ НА ДЕЙСТВИЯТА ПО ПАРТИДА --- */

// --- GDrive Fetch & ID logic moved to load.js ---
/**
 * Initializes the loading process by resetting state and showing the loader.
 */
function initializeLoad(showLoader = true) {
    boardsData = [];
    allNotesData = [];
    notesContainer.innerHTML = ''; // Продължаваме да изчистваме бележките
    if (loaderContainer) {
        loaderContainer.style.display = showLoader ? 'block' : 'none';
    }
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
    const oldBoardsNote = document.querySelector('header .boards-note');
    if (oldBoardsNote) {
        oldBoardsNote.remove();
    }
}

// The colour of a board button. One set of rules for every place that draws a board as a button
// (the menu itself and the reorder popup), so a board cannot show one colour in the menu and a
// different one while its order is being changed. `color` comes in three shapes: a 0..6 index into
// the --board-bg-* theme colours, a negative decimal (the Windows app stores ARGB like -65536), or
// a hex string typed by hand in the board dialog's custom field.
function boardBackgroundValue(color) {
    if (color === undefined || color === null || color === '') return null;
    const num = Number(color);
    if (!isNaN(num)) {
        if (num >= 0 && num <= 6) return `var(--board-bg-${num})`;
        if (num < 0) return '#' + (num >>> 0).toString(16).slice(-6);
        return null; // an index outside 0..6 has never had a background colour
    }
    const text = String(color).trim();
    return text.startsWith('#') ? text : null;
}

// The text colour of a board button, or null when the board keeps the default one. Status 1 wins
// (the platform marks such a board red); then colorfont: 1/2/3 are white/red/blue, a negative
// decimal is ARGB, anything else is a hex string from the custom field.
function boardFontColorValue(board) {
    if (!board) return null;
    if (board.status === 1) return 'red';
    const colorfont = board.colorfont;
    if (colorfont === undefined || colorfont === null || colorfont === '') return null;
    const num = Number(colorfont);
    if (!isNaN(num)) {
        if (num === 1) return '#FFFFFF';
        if (num === 2) return '#FF0000';
        if (num === 3) return '#0000FF';
        if (num < 0) return '#' + (num >>> 0).toString(16).slice(-6);
        return null; // 0 and anything above 3 keep the default text colour
    }
    const text = String(colorfont).trim();
    return text.startsWith('#') ? text : null;
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
        const boardBg = boardBackgroundValue(board.color);
        if (boardBg) link.style.backgroundColor = boardBg;
        link.style.color = 'black';
        const boardFont = boardFontColorValue(board);
        if (boardFont) link.style.color = boardFont;
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
    reorderLink.title = _('reorderBoards') || 'Reorder boards';
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

    // --- БУТОН „ЗАТВОРИ ВСИЧКИ БЕЛЕЖКИ" (след Цял екран) ---
    // Две застъпващи се квадратчета с еднакъв размер и „x" в горното (предното). Един въпрос за всички
    // незаписани бележки; докато няма отворена бележка, квадратчето е притъмнено и кликът само затваря менюто.
    const closeAllLink = document.createElement('span');
    closeAllLink.id = 'close-all-notes-btn';
    closeAllLink.classList.add('board-filter-link', 'close-all-notes-btn');
    closeAllLink.dataset.boardid = 'close-all-notes';
    closeAllLink.style.backgroundColor = '#546E7A';
    closeAllLink.style.color = '#fff';
    closeAllLink.style.cursor = 'pointer';
    closeAllLink.style.display = 'flex';
    closeAllLink.style.alignItems = 'center';
    closeAllLink.style.justifyContent = 'center';
    closeAllLink.innerHTML = closeAllNotesIconSvg;
    closeAllLink.title = _('closeAllNotes') || 'Close all notes';
    closeAllLink.setAttribute('aria-label', closeAllLink.title);
    closeAllLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeAllNoteWindows();
    });
    allButtonLinks.push(closeAllLink);
    updateCloseAllNotesButtons();

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
                        if (boardId === 'close-all-notes') return 'system:close-all-notes';
                        const board = boardsData.find(b => String(b.gdid || b.id) === String(boardId));
                        if (board && board.title) return String(board.title);
                        return `system:${boardId}`;
                    };
                    allButtonLinks.sort((a, b) => {
                        const isUtilA = isBoardMenuUtilId(a.dataset.boardid);
                        const isUtilB = isBoardMenuUtilId(b.dataset.boardid);
                        if (isUtilA && isUtilB) {
                            return boardMenuUtilRank(a.dataset.boardid) - boardMenuUtilRank(b.dataset.boardid);
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
        const isUtil = isBoardMenuUtilId(link.dataset.boardid);
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
        const isUtil = isBoardMenuUtilId(link.dataset.boardid);
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
    updateHeaderFullscreenUI();
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
    'showBoardNoteCount', 'showWeeklyCalendar', 'showDatemod', 'singleNoteMode', 'showNewBoard', 'oneTapLink',
    'clickToEdit', 'closeAfterSave', 'automatedTimer', 'notesBgrd', 'imgBgrd', 'defaultNoteBg',
    'checkEmptyBoards', 'mdBold', 'mdItalic', 'mdStrike', 'mdUnderline', 'mdClear',
    'sortCriteria', 'sortInReverse', 'sortRemindersTop', 'savedSearches', 'maxSavedSearches',
    'language',
    'showBoardAll', 'showPhotosBoard', 'showVideosBoard', 'showSoundsBoard', 'showOtherBoard', 'showBoardRemind',
    'enableNoteSorting', 'guide', 'showAdvancedSettings', 'promoImageIndex',
    'deviceName',
    'addNoteFabPosition', 'popupMenuBtnPosition', 'scrollTopBtnPosition', 'kbFabPosition'
];
async function createSettingsUI(boardsData, boardParseError) {
    const settingsModalBody = document.getElementById('settings-modal-body');
    if (!settingsModalBody.dataset.initializedListeners) {
        // Резервно копие: експорт и импорт на JSON файл (без мрежа, без папки).
        const exportBackupBtn = document.getElementById('export-backup-btn');
        const importBackupBtn = document.getElementById('import-backup-btn');
        const importBackupInput = document.getElementById('import-backup-input');
        if (exportBackupBtn) {
            exportBackupBtn.onclick = null;
            exportBackupBtn.addEventListener('click', () => { backupExport(); });
        }
        if (importBackupBtn && importBackupInput) {
            importBackupBtn.onclick = null;
            importBackupBtn.addEventListener('click', () => importBackupInput.click());
            importBackupInput.onchange = (e) => {
                const file = e.target.files && e.target.files[0];
                if (file) backupImport(file);
                importBackupInput.value = '';
            };
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
    const singleNoteModeCheckbox = document.getElementById('single-note-mode-checkbox');
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
    const useIndexedDbCheckbox = document.getElementById('use-indexeddb-checkbox');
    const clickToEditCheckbox = document.getElementById('click-to-edit-checkbox');
    const hideAssistantCheckbox = document.getElementById('hide-assistant-checkbox'); // New checkbox
    const hideToastCheckbox = document.getElementById('hide-toast-checkbox');
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
        });
    }
    if (addDeviceBtn) {
        addDeviceBtn.addEventListener('click', async () => {
            const newName = prompt("Въведете име за новото устройство / профил:");
            if (newName && newName.trim()) {
                localStorage.setItem('deviceName', newName.trim());
                await loadDeviceProfiles();
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
            if (!await showConfirmation(`Сигурни ли сте, че искате да изтриете профила '${currentDevice}'?`)) return;
            try {
                const cached = localStorage.getItem('settings_multinotes_data');
                const parsed = cached ? JSON.parse(cached) : {};
                if (parsed && parsed[currentDevice]) {
                    delete parsed[currentDevice];
                    localStorage.setItem('settings_multinotes_data', JSON.stringify(parsed));
                }
                localStorage.setItem('deviceName', 'Default');
                const newDevicesList = Object.keys(parsed || {});
                if (!newDevicesList.includes('Default')) newDevicesList.push('Default');
                localStorage.setItem('deviceProfilesList', JSON.stringify(newDevicesList));
                await loadDeviceProfiles();
                showToast("Профилът е изтрит.");
            } catch (err) {
                console.error("Delete profile error:", err);
                showToast("Грешка при изтриване.");
            }
        });
    }
    if (!settingsModalBody.dataset.initialized) {
        // Active Folder Logic
        // Active Folder Logic
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
    // Single note: a shade under the open note blocks the rest of the page (as up to b1.81)
    if (singleNoteModeCheckbox) {
        singleNoteModeCheckbox.checked = isSingleNoteMode(); // Default to false
        singleNoteModeCheckbox.addEventListener('change', () => {
            localStorage.setItem('singleNoteMode', singleNoteModeCheckbox.checked.toString());
            updateSingleNoteOverlay();
            showToast(_('settingSaved'), 2000);
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
    // Базата е единственото хранилище в локален режим: чекбоксът е винаги включен.
    if (useIndexedDbCheckbox) useIndexedDbCheckbox.checked = true;
    localStorage.setItem('useIndexedDb', 'true');
    // Accordion logic
    const accordionHeader = document.querySelector('.accordion-header');
    if (accordionHeader) {
        accordionHeader.addEventListener('click', () => {
            const accordion = accordionHeader.parentElement;
            if (!accordion) return;
            const willBeActive = !accordion.classList.contains('active');
            accordion.classList.toggle('active');
            const content = accordion.querySelector('.accordion-content');
            if (content) content.style.maxHeight = willBeActive ? (Math.max(content.scrollHeight, 1000) + 'px') : null;
            const settingsModalBody = document.getElementById('settings-modal-body');
            if (willBeActive && settingsModalBody) {
                setTimeout(() => {
                    settingsModalBody.scrollTo({ top: settingsModalBody.scrollHeight, behavior: 'smooth' });
                }, 300);
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

            if (!confirmed) {
                dbExists = true;
                updateGlobalStateFlags();
                return;
            }
        } else {
            // Ако базата не съществува или е празна, продължаваме директно със създаването.
            confirmed = true;
        }
        if (confirmed) {
            dbExists = await checkDbExists(NOTES_DB_NAME);
            await mainLogic();
            showToast(_('dbCreated'), 10000);
        }
    });
    const deleteDbBtn = document.getElementById('delete-db-btn');
    deleteDbBtn.addEventListener('click', async () => {
        // Затваряме настройките, за да се видят диалозите за потвърждение
        document.getElementById('settings-modal').classList.remove('visible');
        // Изчакваме анимацията на затваряне да приключи, преди да покажем новия диалог
        await new Promise(resolve => setTimeout(resolve, 150));
        const confirmedDataDelete = await showConfirmation(_('confirmDbDelete'));
        if (confirmedDataDelete) {
            await deleteNotesDB();
            dbExists = false; // Актуализираме глобалния флаг
            localStorage.removeItem('startBoard');
            showToast(_('dbDeleted'), 5000);
            const useIndexedDbCheckbox = document.getElementById('use-indexeddb-checkbox');
            if (useIndexedDbCheckbox) useIndexedDbCheckbox.checked = true;
            localStorage.setItem('useIndexedDb', 'true');
            updateGlobalStateFlags();
            await mainLogic(); // презареждаме празното приложение
        } else {
            // Ако потребителят откаже изтриването, отваряме настройките отново, за да не остава празен екран.
            document.getElementById('settings-modal').classList.add('visible');
        }
        // Активираме контролите, в случай че са били деактивирани
        enableSettingsControls();
    });
    // --- Local Sync Folder ---
    // --- Archive Folder Setting ---
    // Close
    document.getElementById('settings-close-btn').addEventListener('click', async (e) => {
        if (e && e.ctrlKey) return; // Allow Ctrl-Click toggle behavior to fire without closing the UI

        document.getElementById('settings-modal').classList.remove('visible');
        if (window.kbAssistant) window.kbAssistant.terminateGuide();
    });
    settingsModalBody.dataset.initialized = true;
}
// Always ensure the delete folder button has a listener (outside the initialization guard)

// При инициализация на UI, проверяваме дали разширените настройки трябва да са видими
// Разширените настройки вече са част от settings2-modal и са винаги видими
const advancedSettings = document.getElementById('advanced-settings');
if (advancedSettings) {
    // Вече не се скриват
    advancedSettings.removeAttribute('hidden');
}

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

// Разделителна клетка на Markdown таблица: двоеточия и тирета. Интервалите вътре в клетката
// (| : --- | --- : |) не я променят, затова се махат преди проверката.
function isMarkdownTableSeparatorCell(cell) {
    return /^:?-+:?$/.test(cell.replace(/\s+/g, ''));
}

function parseAllMarkdownTables(text) {
    if (!text || !text.includes('|')) return [];
    let maskedText = text.replace(/\{\{([\s\S]*?)\}\}/g, m => m.replace(/[^\r\n]/g, ' '));
    maskedText = maskedText.replace(/```([\s\S]*?)```/g, m => m.replace(/[^\r\n]/g, ' '));
    maskedText = maskedText.replace(/`([^`\r\n]+)`/g, m => ' '.repeat(m.length));
    const originalLines = maskedText.replace(/\r\n/g, '\n').split('\n');
    const tableLinesInfo = originalLines.map((line, index) => ({ line: line.trim(), index }))
        .filter(item => item.line.includes('|'));
    if (tableLinesInfo.length < 2) return [];
    const parseRow = (line) => {
        let normalized = line.trim();
        if (normalized.startsWith('|')) normalized = normalized.slice(1);
        if (normalized.endsWith('|')) normalized = normalized.slice(0, -1);
        return normalized.split('|').map(cell => cell.trim());
    };
    const tables = [];
    let i = 0;
    while (i < tableLinesInfo.length) {
        let sepIdx = -1;
        for (let j = i; j < tableLinesInfo.length; j++) {
            const cells = tableLinesInfo[j].line.split('|').map(cell => cell.trim()).filter(Boolean);
            if (cells.length > 0 && cells.every(isMarkdownTableSeparatorCell)) {
                sepIdx = j;
                break;
            }
        }
        if (sepIdx <= i || sepIdx < 1) break;
        if (tableLinesInfo[sepIdx - 1].index !== tableLinesInfo[sepIdx].index - 1) {
            i = sepIdx + 1;
            continue;
        }
        const startIndex = tableLinesInfo[sepIdx - 1].index;
        let lastValidIdx = sepIdx;
        for (let j = sepIdx + 1; j < tableLinesInfo.length; j++) {
            if (tableLinesInfo[j].index === tableLinesInfo[j - 1].index + 1) {
                lastValidIdx = j;
            } else {
                break;
            }
        }
        const endIndex = tableLinesInfo[lastValidIdx].index;
        const rawLines = text.replace(/\r\n/g, '\n').split('\n');
        const headerRow = parseRow(rawLines[tableLinesInfo[sepIdx - 1].index]);
        const rows = [
            headerRow,
            ...tableLinesInfo.slice(sepIdx + 1, lastValidIdx + 1).map(item => parseRow(rawLines[item.index]))
        ].filter(row => row.length > 0);
        if (rows.length >= 2) {
            const columnCount = Math.max(...rows.map(row => row.length));
            const paddedRows = rows.map(row => {
                const padded = [...row];
                while (padded.length < columnCount) padded.push('');
                return padded;
            });
            const isBorderless = headerRow[0] === '%%' || (headerRow[0] === '' && headerRow.length > 1);
            // Подравняване по колони от реда-разделител (същото правило като getMarkdownTableEdits):
            // ':' отпред - ляво, ':' отзад - дясно, двете - център; без двоеточие - null.
            const sepCells = parseRow(rawLines[tableLinesInfo[sepIdx].index]);
            const alignments = Array.from({ length: columnCount }, (_, c) => {
                const value = c < sepCells.length ? sepCells[c] : '';
                const left = value.startsWith(':');
                const right = value.length > 1 && value.endsWith(':');
                if (left && right) return 'center';
                if (right) return 'right';
                if (left) return 'left';
                return null;
            });
            tables.push({
                borderless: isBorderless,
                alignments,
                rows: paddedRows,
                rowLineIndexes: [tableLinesInfo[sepIdx - 1].index, ...tableLinesInfo.slice(sepIdx + 1, lastValidIdx + 1).map(item => item.index)],
                startIndex,
                endIndex
            });
        }
        i = lastValidIdx + 1;
    }
    return tables;
}

function parseMarkdownTable(text) {
    const tables = parseAllMarkdownTables(text);
    return tables.length > 0 ? tables[0] : null;
}

// formatString: обхватите на бележката (офсети в text). Всяка клетка и всеки блок извън таблицата
// получава своя отрязък от тях; без обхвати изходът е същият като преди (processNoteContent).
function renderMarkdownTableAsPseudoGraphic(text, formatString = null) {
    const tables = (typeof parseAllMarkdownTables === 'function') ? parseAllMarkdownTables(text) : (parseMarkdownTable(text) ? [parseMarkdownTable(text)] : []);
    if (!tables || tables.length === 0) return null;
    // При \r\n нормализираните редове не съвпадат с офсетите на обхватите - тогава без обхвати.
    const formats = (formatString && !text.includes('\r')) ? parseFormatsString(formatString) : [];
    const lineStarts = [];
    text.split('\n').reduce((pos, line) => { lineStarts.push(pos); return pos + line.length + 1; }, 0);
    // Отрязък [start, start + len) с обхватите му, отместени към началото му.
    const renderPart = (part, start) => {
        const local = formats
            .map(f => ({ ...f, start: Math.max(0, f.start - start), end: Math.min(part.length, f.end - start) }))
            .filter(f => Number.isFinite(f.start) && Number.isFinite(f.end) && f.end > f.start);
        if (!local.length) return processNoteContent(part, true);
        return formatText(part, local.map(f => JSON.stringify(f)).join('|'), true);
    };
    // Началата на клетките в реда (същото рязане като parseRow в parseAllMarkdownTables).
    const getCellStarts = (lineIndex) => {
        const line = String(text.split('\n')[lineIndex] || '').replace(/\r$/, '');
        let pos = line.length - line.trimStart().length;
        let normalized = line.trim();
        if (normalized.startsWith('|')) { normalized = normalized.slice(1); pos++; }
        if (normalized.endsWith('|')) normalized = normalized.slice(0, -1);
        return normalized.split('|').map(seg => {
            const cellStart = lineStarts[lineIndex] + pos + (seg.length - seg.trimStart().length);
            pos += seg.length + 1;
            return cellStart;
        });
    };
    const renderSingleTable = (table) => {
        const renderCells = (row, tag, rowIndex) => {
            const lineIndex = table.rowLineIndexes ? table.rowLineIndexes[rowIndex] : undefined;
            const starts = (formats.length && lineIndex !== undefined) ? getCellStarts(lineIndex) : [];
            return row.map((cell, c) => {
                const cellText = String(cell || '');
                const html = starts[c] !== undefined ? renderPart(cellText, starts[c]) : processNoteContent(cellText, true);
                // Подравняване само при двоеточие в разделителя - иначе HTML-ът е същият като преди.
                const align = table.alignments ? table.alignments[c] : null;
                const attr = align ? ` style="text-align: ${align};"` : '';
                return `<${tag}${attr}>${html}</${tag}>`;
            }).join('');
        };
        if (table.borderless) {
            const bodyRows = table.rows.slice(1);
            if (!bodyRows.length) return '';
            const bodyHtml = bodyRows.map((row, r) => `<tr>${renderCells(row, 'td', r + 1)}</tr>`).join('');
            return `<div class="md-table-wrapper"><table class="md-table-render md-table-borderless"><tbody>${bodyHtml}</tbody></table></div>`;
        } else {
            const headerHtml = `<thead><tr>${renderCells(table.rows[0], 'th', 0)}</tr></thead>`;
            const bodyRows = table.rows.slice(1);
            if (!bodyRows.length) return '';
            const bodyHtml = bodyRows.map((row, r) => `<tr>${renderCells(row, 'td', r + 1)}</tr>`).join('');
            return `<div class="md-table-wrapper"><table class="md-table-render">${headerHtml}<tbody>${bodyHtml}</tbody></table></div>`;
        }
    };
    const originalLines = text.replace(/\r\n/g, '\n').split('\n');
    let finalHtml = '';
    let lastIndex = 0;
    tables.forEach(table => {
        const beforeLines = originalLines.slice(lastIndex, table.startIndex).join('\n');
        if (beforeLines.trim()) {
            if (finalHtml && !finalHtml.endsWith('<br>')) finalHtml += '<br>';
            finalHtml += renderPart(beforeLines, lineStarts[lastIndex]) + '<br>';
        }
        finalHtml += renderSingleTable(table);
        lastIndex = table.endIndex + 1;
    });
    const afterLines = originalLines.slice(lastIndex).join('\n');
    if (afterLines.trim()) {
        finalHtml += '<br>' + renderPart(afterLines, lineStarts[lastIndex]);
    }
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

// --- Link markers {#L<n>#} and code block placeholder ---
// Маркер за маскиран линк (preEdit го слага в режим на редакция, postEdit го връща).
const LINK_MARKER_REGEX = /\{#L(\d+)#\}/g;
// Кодовият блок се заменя с ЕДИН символ (Private Use Area), за да не може граница на сегмент да го разкъса.
const CODE_BLOCK_PLACEHOLDER = '\uE000';

function buildCodeBlockHtml(block) {
    const copyBtn = `<button class="code-block-copy" onclick="event.stopPropagation();copyCode(this)" title="${_('copyCodeBtn')}">${copyIconSvg}</button>`;
    return '<div class="code-block"><code>' + block + '</code>' + copyBtn + '</div>';
}

/**
 * Замества маркерите на кодовите блокове по ред с HTML-а на блоковете.
 * Маркери без блок (подадени отвън, напр. от сегмент на formatText) остават за външния проход.
 */
function insertCodeBlocks(html, codeBlocks) {
    if (!codeBlocks.length || html.indexOf(CODE_BLOCK_PLACEHOLDER) === -1) return html;
    const parts = html.split(CODE_BLOCK_PLACEHOLDER);
    let out = parts[0];
    for (let i = 1; i < parts.length; i++) {
        out += (i - 1 < codeBlocks.length ? buildCodeBlockHtml(codeBlocks[i - 1]) : CODE_BLOCK_PLACEHOLDER) + parts[i];
    }
    return out;
}

/**
 * Премахва {#L<n>#} от текст за показване и измества форматите за премахнатите символи:
 * позиция след маркер се мести наляво с дължината на всички маркери преди нея,
 * позиция вътре в маркер отива на неговото начало.
 */
function stripLinkMarkersForDisplay(text, formatString = null) {
    if (!text || text.indexOf('{#L') === -1) return { text, formatString };
    const removed = [];
    const stripped = text.replace(LINK_MARKER_REGEX, (m, n, idx) => { removed.push({ start: idx, len: m.length }); return ''; });
    if (!removed.length) return { text, formatString };
    const mapPos = (p) => {
        let shift = 0;
        for (const r of removed) {
            if (p >= r.start + r.len) shift += r.len;
            else if (p > r.start) return r.start - shift;
            else break;
        }
        return p - shift;
    };
    if (!formatString || formatString.trim() === '') return { text: stripped, formatString };
    let isPipeSeparated = formatString.endsWith('|');
    const str = isPipeSeparated ? formatString.slice(0, -1) : formatString;
    const delimiter = isPipeSeparated ? '|' : '\n';
    const formats = str.split(/[|\n]/).map(f => {
        try { return JSON.parse(f); } catch (e) { return null; }
    }).filter(f => f !== null && f.start !== undefined && f.end !== undefined);
    if (formats.length === 0) return { text: stripped, formatString };
    const adjusted = formats.map(f => JSON.stringify({ ...f, start: mapPos(f.start), end: mapPos(f.end) }));
    return { text: stripped, formatString: adjusted.join(delimiter) + (isPipeSeparated ? '|' : '') };
}

/**
 * Резервира номерата на маркерите, които вече стоят като текст в бележката (няма линк за тях),
 * така че новите маркери от preEdit да не ги повторят. Резервираните места са null.
 */
function reserveLinkMarkerSlots(text) {
    const slots = [];
    if (!text) return slots;
    for (const m of text.matchAll(LINK_MARKER_REGEX)) {
        const n = parseInt(m[1], 10);
        if (n < 1000) while (slots.length <= n) slots.push(null);
    }
    return slots;
}

/**
 * Връща линковете на мястото на маркерите в ред на появяване. Маркер без линк
 * (липсващ списък, индекс извън списъка, резервирано място) се премахва и се брои.
 */
function restoreLinkMarkers(text, formats, maskedLinks) {
    let out = '', last = 0, delta = 0, removed = 0;
    for (const m of text.matchAll(LINK_MARKER_REGEX)) {
        const link = Array.isArray(maskedLinks) ? maskedLinks[parseInt(m[1], 10)] : undefined;
        const rep = (typeof link === 'string') ? link : '';
        if (!rep) removed++;
        const s = m.index + delta, len = m[0].length, diff = rep.length - len;
        formats.forEach(f => {
            if (f.start >= s + len) f.start += diff; else if (!rep && f.start > s) f.start = s;
            if (f.end >= s + len) f.end += diff; else if (!rep && f.end > s) f.end = s;
        });
        out += text.substring(last, m.index) + rep;
        last = m.index + len;
        delta += diff;
    }
    return { text: last ? out + text.substring(last) : text, formats, removed };
}
// --- end link markers ---

/**
 * Унифицирана функция за форматиране и рендиране на съдържанието на бележка.
 * Използва се напълно еднакво както в модала за преглед, така и на картичките в борда.
 * Маркерите {#L<n>#} не се показват (само режимът на редакция ги вижда).
 */
function getFormattedNoteHtml(rawContent, formatString = null, titleFormatString = null, isForModal = false, listIndentMeasureEl = undefined) {
    return renderNoteCheckboxes(getFormattedNoteHtmlBase(rawContent, formatString, titleFormatString, isForModal, listIndentMeasureEl));
}

function getFormattedNoteHtmlBase(rawContent, formatString = null, titleFormatString = null, isForModal = false, listIndentMeasureEl = undefined) {
    if (!rawContent) return '';
    const pipeIndex = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(rawContent) : rawContent.indexOf('|');
    if (pipeIndex !== -1) {
        const titleStripped = stripLinkMarkersForDisplay(rawContent.substring(0, pipeIndex), titleFormatString);
        const bodyStripped = stripLinkMarkersForDisplay(rawContent.substring(pipeIndex + 1), formatString);
        const titlePart = titleStripped.text;
        const bodyPart = bodyStripped.text;
        titleFormatString = titleStripped.formatString;
        formatString = bodyStripped.formatString;
        let formattedTitle = '';
        if (titleFormatString && titleFormatString.trim() !== '') {
            formattedTitle = formatText(titlePart, titleFormatString, isForModal, listIndentMeasureEl);
        } else {
            const titleTableHtml = renderMarkdownTableAsPseudoGraphic(titlePart, titleFormatString);
            formattedTitle = titleTableHtml || processNoteContent(titlePart, isForModal, false, listIndentMeasureEl);
        }
        let formattedBody = '';
        const tableHtml = renderMarkdownTableAsPseudoGraphic(bodyPart, formatString);
        if (tableHtml) {
            formattedBody = tableHtml;
        } else if (formatString && formatString.trim() !== '') {
            formattedBody = formatText(bodyPart, formatString, isForModal, listIndentMeasureEl);
        } else {
            formattedBody = processNoteContent(bodyPart, isForModal, false, listIndentMeasureEl);
        }
        return formattedTitle + '<br>' + formattedBody;
    }
    ({ text: rawContent, formatString } = stripLinkMarkersForDisplay(rawContent, formatString));
    if (!rawContent) return '';
    const fullTableHtml = renderMarkdownTableAsPseudoGraphic(rawContent, formatString);
    if (fullTableHtml) return fullTableHtml;
    if (formatString && formatString.trim() !== '') {
        return formatText(rawContent, formatString, isForModal, listIndentMeasureEl);
    }
    return processNoteContent(rawContent, isForModal, false, listIndentMeasureEl);
}

// --- MD отметки: [ ] / [x] (и ☐ / ☑, в които ги обръща postEdit) в началото на реда ---
// Отметка се разпознава само в началото на реда (след отстъп и евентуален маркер на списък), както
// в Markdown. Рендираното квадратче носи поредния си номер (data-cb), а кликът обръща отметката със
// същия пореден номер в суровия текст - "коя по ред" остава вярно и след пре-рендер.
const NOTE_CHECKBOX_TOGGLE = { '[ ]': '[x]', '[x]': '[ ]', '[X]': '[ ]', '[х]': '[ ]', '[Х]': '[ ]', '☐': '☑', '☑': '☐' };

function matchNoteCheckboxLine(line) {
    const list = matchNoteListLine(line);
    const prefix = list ? list.prefix : /^[ \t]*/.exec(line)[0];
    const m = /^(\[ \]|\[[xXхХ]\]|☐|☑)(?=\s|$)/.exec(line.slice(prefix.length));
    if (!m) return null;
    return { start: prefix.length, mark: m[1], checked: m[1] !== '[ ]' && m[1] !== '☐' };
}

// Отметките в текста, който се подава на getFormattedNoteHtml, в реда на показване:
// [{ index, mark, checked }]. Кодовите блокове не съдържат отметки; '|' дели заглавие от тяло.
// Началата на клетките в един ред на Markdown таблица: същото делене като parseRow в
// parseAllMarkdownTables (маха се водещата и евентуално една задна черта, после се дели по '|'),
// но с отместване в реда - за да се знае къде точно започва съдържанието на всяка клетка.
function noteTableCellStarts(line) {
    let s = 0, e = line.length;
    while (s < e && /\s/.test(line[s])) s++;
    while (e > s && /\s/.test(line[e - 1])) e--;
    let base = s, body = line.slice(s, e);
    if (body.startsWith('|')) { body = body.slice(1); base += 1; }
    if (body.endsWith('|')) body = body.slice(0, -1);
    const out = [];
    let seg = 0;
    for (let k = 0; k <= body.length; k++) {
        if (k === body.length || body[k] === '|') {
            let a = seg;
            while (a < k && /\s/.test(body[a])) a++;
            out.push(base + a);
            seg = k + 1;
        }
    }
    return out;
}

// Отметките в текста, който се подава на getFormattedNoteHtml, в реда на показване:
// [{ index, mark, checked }]. Кодовите блокове не съдържат отметки; '|' дели заглавие от тяло.
// В ред на Markdown таблица отметката се брои в началото на всяка клетка (там началото на реда е
// началото на клетката), за да съвпадат броят и редът с renderNoteCheckboxes.
function findNoteCheckboxes(text) {
    const out = [];
    if (!text) return out;
    const masked = text.replace(/\{\{([\s\S]*?)\}\}|```([\s\S]*?)```/g, m => m.replace(/[^\n]/g, CODE_BLOCK_PLACEHOLDER));
    const maskedLines = masked.split('\n');
    const lineStarts = [];
    let pos = 0;
    for (const line of maskedLines) { lineStarts.push(pos); pos += line.length + 1; }
    const inTable = new Set();
    const tables = (typeof parseAllMarkdownTables === 'function') ? parseAllMarkdownTables(text.replace(/\r\n/g, '\n')) : [];
    for (const t of tables) for (let i = t.startIndex; i <= t.endIndex; i++) inTable.add(i);
    const pipe = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(text) : text.indexOf('|');
    for (let i = 0; i < maskedLines.length; i++) {
        const line = maskedLines[i];
        const from = lineStarts[i], to = from + line.length;
        if (inTable.has(i)) {
            for (const off of noteTableCellStarts(line)) {
                const m = matchNoteCheckboxLine(line.slice(off));
                if (m) out.push({ index: from + off + m.start, mark: m.mark, checked: m.checked });
            }
            continue;
        }
        const spans = (pipe > from && pipe < to) ? [[from, pipe], [pipe + 1, to]] : [[from, to]];
        for (const [a, b] of spans) {
            const m = matchNoteCheckboxLine(masked.slice(a, b));
            if (m) out.push({ index: a + m.start, mark: m.mark, checked: m.checked });
        }
    }
    return out;
}

// Върху готовия HTML: всяка отметка в началото на ред става <input type="checkbox">. Суровите
// знаци остават в скрит span, за да брои getPreciseCharIndex същите символи като в текста.
// Отметнатият ред е само приглушен (.nmd-cb-done), без задраскване.
// Върху готовия HTML: всяка отметка в началото на ред (или на клетка в таблица) става
// <input type="checkbox">. Суровите знаци остават в скрит span, за да брои getPreciseCharIndex
// същите символи като в текста. Отметнатият ред е само приглушен (.nmd-cb-done), без задраскване.
function renderNoteCheckboxes(html) {
    if (!html || !/\[[ xXхХ]\]|☐|☑/.test(html)) return html;
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const SKIP = '.code-block, code, pre, table, .md-heading, button, textarea, input';
    let ordinal = 0;

    // Отметката в началото на подадения ред от текстови възли (един ред на прегледа или една клетка).
    const renderMarkInNodes = (nodes) => {
        const plain = nodes.map(n => n ? n.data : CODE_BLOCK_PLACEHOLDER).join('');
        const m = matchNoteCheckboxLine(plain);
        if (!m) return;
        const cb = ordinal++;
        let pos = 0, at = -1;
        for (let i = 0; i < nodes.length; i++) {
            const len = nodes[i] ? nodes[i].data.length : 1;
            if (nodes[i] && m.start >= pos && m.start + m.mark.length <= pos + len) { at = i; break; }
            if (m.start < pos + len) break;
            pos += len;
        }
        if (at === -1) return; // знаците на отметката са разделени между тагове - остават текст
        const node = nodes[at];
        const markNode = node.splitText(m.start - pos);
        const rest = markNode.splitText(m.mark.length);
        const hit = document.createElement('span');
        hit.className = 'nmd-cb-hit';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'nmd-cb';
        input.tabIndex = -1;
        input.dataset.cb = String(cb);
        if (m.checked) input.setAttribute('checked', '');
        const src = document.createElement('span');
        src.className = 'nmd-cb-src';
        src.hidden = true;
        hit.append(input, src);
        markNode.replaceWith(hit);
        src.appendChild(markNode);
        // Квадратчето и първата дума след него са една неразделяща се двойка с 4px резерв отзад:
        // колоната в таблицата резервира цялата двойка, затова редът не се къса, когато колоната
        // е тясна (например при по-едър шрифт на телефон).
        let pairTail = [];
        if (rest && rest.data) {
            const firstWord = /^[ \t]*\S+/.exec(rest.data);
            if (firstWord) {
                pairTail = [rest.splitText(firstWord[0].length)];
                const pair = document.createElement('span');
                pair.className = 'nmd-cb-pair';
                hit.replaceWith(pair);
                pair.append(hit, rest);
            }
        }
        if (m.checked) {
            [rest, ...pairTail, ...nodes.slice(at + 1)].forEach(n => {
                if (!n || !n.data) return;
                const done = document.createElement('span');
                done.className = 'nmd-cb-done';
                n.replaceWith(done);
                done.appendChild(n);
            });
        }
    };

    // Текстовите възли на един елемент (клетка) в реда на показване; пропуснатото (код) е едно "нищо".
    const collectNodes = (root, out) => {
        for (const child of Array.from(root.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) { out.push(child); continue; }
            if (child.nodeType !== Node.ELEMENT_NODE) continue;
            if (child.tagName === 'BR') continue;
            if (child.matches(SKIP)) { out.push(null); continue; }
            collectNodes(child, out);
        }
    };

    let lineNodes = [];
    const flushLine = () => { if (lineNodes.length) renderMarkInNodes(lineNodes); lineNodes = []; };
    const walk = (node) => {
        for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) { lineNodes.push(child); continue; }
            if (child.nodeType !== Node.ELEMENT_NODE) continue;
            if (child.tagName === 'BR') { flushLine(); continue; }
            if (child.tagName === 'TABLE') {
                // Номерата трябва да вървят в същия ред като в findNoteCheckboxes: клетките се броят
                // на мястото на таблицата в текста, не накрая.
                flushLine();
                for (const row of Array.from(child.querySelectorAll('tr'))) {
                    for (const cell of Array.from(row.children)) {
                        const nodes = [];
                        collectNodes(cell, nodes);
                        if (nodes.length) renderMarkInNodes(nodes);
                    }
                }
                continue;
            }
            if (child.matches(SKIP)) { lineNodes.push(null); continue; }
            walk(child);
        }
    };
    walk(tpl.content);
    flushLine();
    return tpl.innerHTML;
}

// Кой текст е рендиран в elem (модала или картата): [start, end) от notetxt на бележката.
function setNoteCheckboxSource(elem, start, end) {
    if (!elem) return;
    if (start === null || start < 0) {
        delete elem.dataset.cbSrcStart;
        delete elem.dataset.cbSrcEnd;
        return;
    }
    elem.dataset.cbSrcStart = String(start);
    elem.dataset.cbSrcEnd = String(end);
}

// Клик върху квадратчето (или зоната около него): обръща отметката в текста и записва бележката.
// Прихваща се на window в capture фаза - преди отварянето на бележката и преди click-to-edit.
window.addEventListener('click', (e) => {
    const hit = e.target && e.target.closest ? e.target.closest('.nmd-cb-hit') : null;
    if (!hit) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    toggleNoteCheckbox(hit).catch(err => console.error('Checkbox toggle failed:', err));
}, true);

async function toggleNoteCheckbox(hit) {
    const input = hit.querySelector('input.nmd-cb');
    const host = hit.closest('[data-cb-src-end]');
    if (!input || !host) return;
    const isModal = host.id === 'modal-body';
    const findNote = (gdid, id) => allNotesData.find(n => (gdid && n.gdid && String(n.gdid) === String(gdid)) || (id && n.id !== undefined && String(n.id) === String(id)));
    let noteObj;
    if (isModal && host.dataset.isPreview === 'true' && host.dataset.draftText !== undefined && !host.querySelector('textarea')) {
        toggleDraftPreviewCheckbox(host, input);
        return;
    }
    if (isModal) {
        // Редакция или преглед на чернова: текстът на модала не е записаната бележка.
        const saveBtn = document.getElementById('note-save-btn');
        if (host.querySelector('textarea') || host.dataset.draftText || host.dataset.isPreview === 'true' ||
            host.dataset.isNewNote === 'true' || (saveBtn && saveBtn.style.display !== 'none' && saveBtn.style.display !== '')) return;
        noteObj = findNote(host.dataset.gdid, host.dataset.id);
    } else {
        const card = host.closest('.note');
        if (!card) return;
        noteObj = findNote(card.dataset.g, card.dataset.i);
    }
    if (!noteObj) return;
    const field = noteObj.notetxt !== undefined ? 'notetxt' : 'text';
    const raw = String(noteObj[field] || '');
    if (isModal && typeof currentModalContent === 'string' && raw !== currentModalContent) return;
    const start = parseInt(host.dataset.cbSrcStart, 10);
    const end = parseInt(host.dataset.cbSrcEnd, 10);
    if (!(start >= 0) || !(end >= start) || end > raw.length) return;
    const boxes = findNoteCheckboxes(raw.substring(start, end));
    const box = boxes[parseInt(input.dataset.cb, 10)];
    // Рендерът и суровият текст трябва да са съгласни, иначе не пипаме нищо (никога грешен ред).
    if (!box || box.checked !== input.hasAttribute('checked')) return;
    if (isModal) {
        const shown = Array.from(host.querySelectorAll('input.nmd-cb')).filter(el => el.closest('[data-cb-src-end]') === host);
        if (shown.length !== boxes.length) return;
    }
    const pos = start + box.index;
    noteObj[field] = raw.slice(0, pos) + NOTE_CHECKBOX_TOGGLE[box.mark] + raw.slice(pos + box.mark.length);
    await saveNoteCheckboxChange(noteObj);
}

// Преглед на чернова (бутонът "око" в редактора): модалът показва postEdit(черновата), а не записаната
// бележка. Отметката се търси по същия път като в модала (findNoteCheckboxes върху [data-cb-src-*] от
// currentModalContent) и се обръща на същия пореден номер в черновата (dataset.draftTitle + '|' +
// dataset.draftText, когато прегледът е със заглавие). В бележката не се пише нищо до запазване.
function toggleDraftPreviewCheckbox(host, input) {
    const shownText = String(currentModalContent || '');
    const start = parseInt(host.dataset.cbSrcStart, 10);
    const end = parseInt(host.dataset.cbSrcEnd, 10);
    if (!(start >= 0) || !(end >= start) || end > shownText.length) return;
    const boxes = findNoteCheckboxes(shownText.substring(start, end));
    const k = parseInt(input.dataset.cb, 10);
    const box = boxes[k];
    if (!box || box.checked !== input.hasAttribute('checked')) return;
    const shown = Array.from(host.querySelectorAll('input.nmd-cb')).filter(el => el.closest('[data-cb-src-end]') === host);
    if (shown.length !== boxes.length) return;
    const joined = host.dataset.previewDraftJoined === 'true';
    const title = host.dataset.draftTitle || '';
    const draft = joined ? title + '|' + host.dataset.draftText : host.dataset.draftText;
    const draftBoxes = findNoteCheckboxes(draft);
    const d = draftBoxes[k];
    // Черновата и прегледът трябва да са съгласни, иначе не пипаме нищо (никога грешен ред).
    if (draftBoxes.length !== boxes.length || !d || d.checked !== box.checked) return;
    // [ ]<->[x] и ☐<->☑ не сменят дължината, затова форматите на черновата остават същите.
    const flipped = draft.slice(0, d.index) + NOTE_CHECKBOX_TOGGLE[d.mark] + draft.slice(d.index + d.mark.length);
    if (joined) {
        host.dataset.draftTitle = flipped.slice(0, title.length);
        host.dataset.draftText = flipped.slice(title.length + 1);
    } else {
        host.dataset.draftText = flipped;
    }
    const textarea = document.getElementById('note-edit-textarea');
    if (textarea) textarea.value = host.dataset.draftText;
    const pos = start + box.index;
    currentModalContent = shownText.slice(0, pos) + NOTE_CHECKBOX_TOGGLE[box.mark] + shownText.slice(pos + box.mark.length);
    const scrollTop = host.scrollTop;
    const html = getFormattedNoteHtml(currentModalContent, host.dataset.format, host.dataset.titleFormat, true);
    host.innerHTML = html;
    host.dataset.renderedHtml = html;
    setNoteCheckboxSource(host, 0, currentModalContent.length);
    host.scrollTop = scrollTop;
}

// Записът след смяна на отметка: обектът, картата, модала (ако показва тази бележка) и базата.
// Дължината на текста не се сменя ([ ]<->[x], ☐<->☑), затова форматите (text_span/title_span)
// остават същите.
async function saveNoteCheckboxChange(noteObj) {
    const useIndexedDbNow = true; // локален режим: единственото хранилище е базата
    noteObj.version = noteObj.version ? parseInt(noteObj.version, 10) + 1 : 1;
    noteObj.datemod = Date.now();

    const noteEl = document.querySelector(`.note[data-g="${noteObj.gdid}"]`) || document.querySelector(`.note[data-i="${noteObj.id}"]`);
    if (noteEl) {
        const updatedEl = await createNoteElement(noteObj);
        if (updatedEl) {
            // A new card is created hidden (applyFilters shows it); the toggled card stays as visible as it was.
            updatedEl.style.display = noteEl.style.display;
            noteEl.replaceWith(updatedEl);
        }
    }
    const mb = document.getElementById('modal-body');
    const modalShowsNote = mb && !mb.querySelector('textarea') &&
        ((noteObj.gdid && String(mb.dataset.gdid) === String(noteObj.gdid)) || (noteObj.id !== undefined && String(mb.dataset.id) === String(noteObj.id)));
    if (modalShowsNote) {
        const raw = noteObj.notetxt !== undefined ? noteObj.notetxt : noteObj.text;
        const html = getFormattedNoteHtml(raw, noteObj.text_span, noteObj.title_span, true);
        mb.innerHTML = html;
        mb.dataset.renderedHtml = html;
        setNoteCheckboxSource(mb, 0, String(raw || '').length);
        currentModalContent = raw;
        mb.dataset.baseDatemod = String(noteObj.datemod);
        if (mb.dataset.baseNote) mb.dataset.baseNote = JSON.stringify(noteObj);
    }

    // Локален режим: записът е само в базата.
    else if (useIndexedDbNow) noteObj.type = -1; // за офлайн синхронизация
    if (useIndexedDbNow) await bulkPutDB(NOTE_STORE_NAME, noteObj, true);
    if (typeof updateReloadButtonState === 'function') updateReloadButtonState();
}

// Елементът, спрямо чийто шрифт се мери висящият отстъп на списъците.
// Без аргумент - модалът (шрифтът на #modal-body). С елемент (карта на дъската) - скрит близнак
// със същите класове, защото картата има свой шрифт (--note-font-size), различен от този в модала.
function getNoteListMeasureEl(contextEl) {
    if (!contextEl) {
        return (typeof modalBody !== 'undefined' && modalBody) || document.getElementById('modal-body');
    }
    let mirror = getNoteListMeasureEl._mirror;
    if (!mirror || !mirror.isConnected) {
        mirror = document.createElement('div');
        mirror.style.cssText = 'position: absolute; left: -10000px; top: 0; visibility: hidden; pointer-events: none;';
        document.body.appendChild(mirror);
        getNoteListMeasureEl._mirror = mirror;
    }
    const cls = typeof contextEl === 'string' ? contextEl : (contextEl.className || '');
    if (mirror.className !== cls) mirror.className = cls;
    return mirror;
}

// Текстът на един HTML ред без тагове и с върнати ентитита - за да разпознаем маркера на списък
// и продължението на ред, дори когато маркерът е вътре във форматиращ таг.
function noteLinePlainText(htmlLine) {
    return String(htmlLine)
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&amp;/g, '&');
}

// Блок за ЦЯЛ ред: заглавие -> <div class="md-heading">, а списъчен ред -> .nmd-li.
// Подава се само завършен ред, никога част от ред (иначе блокът обхваща само началото му).
// plainText е текстът на реда без тагове (при липса - самият ред).
// Връща { html, indent, heading }: indent е отстъпът за ред-продължение (null = не е списъчен ред).
function wrapNoteLineBlock(line, plainText, listMeasureEl) {
    const plain = plainText === undefined ? line : plainText;
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
        const level = headingMatch[1].length;
        const content = headingMatch[2];
        const fontSizes = { 1: '1.6em', 2: '1.35em', 3: '1.18em', 4: '1.05em', 5: '0.95em', 6: '0.85em' };
        const size = fontSizes[level] || '1.1em';
        return { html: `<div class="md-heading md-h${level}" style="font-size: ${size}; font-weight: bold; margin: 0.35em 0 0.15em 0; line-height: 1.25;">${content}</div>`, indent: null, heading: true };
    }
    // Note view: a list item gets its own full-width inline block, so only its wrapped
    // continuation hangs under the text. The <br>s stay as they are (getPreciseCharIndex).
    const listMatch = listMeasureEl ? matchNoteListLine(plain) : null;
    if (listMatch) {
        const w = getNoteListHangingIndent(listMatch.prefix, listMeasureEl);
        if (w > 0) {
            return { html: `<span class="nmd-li" style="display: inline-block; box-sizing: border-box; width: 100%; padding-left: ${w}px; text-indent: -${w}px; white-space: pre-wrap; tab-size: 4;">${line}</span>`, indent: w };
        }
        return { html: line, indent: null };
    }
    return { html: line, indent: null };
}

// Всички редове на един пас: маркерният ред получава висящ отстъп (padding-left + отрицателен
// text-indent), а редът-продължение - ред без маркер, който следва списъчен ред (текстът на булета
// продължава на нов ред) - получава отстъп колкото маркера, за да застане под текста на булета.
// Празен ред, заглавие и ред с кодов блок прекъсват продължението.
function wrapNoteLineBlocks(lines, listMeasureEl, plainTextOf) {
    if (!listMeasureEl) return lines;
    const out = [];
    let cont = 0;
    for (const line of lines) {
        const plain = plainTextOf ? plainTextOf(line) : line;
        if (plain.indexOf(CODE_BLOCK_PLACEHOLDER) !== -1) { out.push(line); cont = 0; continue; }
        const res = wrapNoteLineBlock(line, plain, listMeasureEl);
        if (res.heading) { out.push(res.html); cont = 0; continue; }
        if (res.indent !== null) { out.push(res.html); cont = res.indent; continue; }
        // A checkbox line ([ ] / [x]) is an item of its own, not the continuation of the item above.
        if (cont > 0 && plain.trim() !== '' && !matchNoteCheckboxLine(plain)) {
            out.push(`<span class="nmd-li nmd-li-cont" style="display: inline-block; box-sizing: border-box; width: 100%; padding-left: ${cont}px; white-space: pre-wrap; tab-size: 4;">${line}</span>`);
            continue;
        }
        out.push(line);
        cont = 0;
    }
    return out;
}

// skipLineBlocks: текстът е част от ред (сегмент на formatText) - блоковете на редовете
// се слагат от извикващия върху завършените редове.
function processNoteContent(text, isForModal = false, skipLineBlocks = false, listIndentMeasureEl = undefined) {
    if (!text) return '';
    const codeBlocks = [];
    const codeTagRegex = /\{\{([\s\S]*?)\}\}|```([\s\S]*?)```/g;
    const textWithoutCode = text.replace(codeTagRegex, (match, code1, code2) => {
        const code = code1 !== undefined ? code1 : code2;
        codeBlocks.push(escapeHtml(code));
        return CODE_BLOCK_PLACEHOLDER;
    });
    let escapedText = escapeHtml(textWithoutCode);
    const oneTapLinksEnabled = localStorage.getItem('oneTapLink') === 'true';
    const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%?=~_|])/ig;
    if (isForModal || oneTapLinksEnabled) {
        escapedText = escapedText.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    } else {
        escapedText = escapedText.replace(urlRegex, '$1');
    }
    escapedText = escapedText.replace(/`([^`\n]+)`/g, '<code class="md-inline-code" style="background: rgba(0,0,0,0.06); padding: 1px 4px; border-radius: 3px; font-family: monospace;">$1</code>');
    const symBold = (localStorage.getItem('mdBold') || '**').trim();
    const symStrike = (localStorage.getItem('mdStrike') || '~~').trim();
    const symItalic = (localStorage.getItem('mdItalic') || '*').trim();
    const symUnderline = (localStorage.getItem('mdUnderline') || '_').trim();
    // A pair counts as in the editor and postEdit: the text between does not start or end with a
    // space ("a * b * c" stays as typed) and "_" does not pair inside a word (a_b_c, links).
    const replacePair = (src, sym, tag) => {
        if (!sym) return src;
        const esc = sym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (sym === '_') {
            return src.replace(/(^|[^\p{L}\p{N}])_([^\s_\n](?:[^_\n]*[^\s_\n])?)_(?![\p{L}\p{N}])/gu, `$1<${tag}>$2</${tag}>`);
        }
        return src.replace(new RegExp(`${esc}([^\\s${esc}\\n](?:[^${esc}\\n]*[^\\s${esc}\\n])?)${esc}`, 'g'), `<${tag}>$1</${tag}>`);
    };
    escapedText = replacePair(escapedText, symBold, 'b');
    if (symBold !== '**') escapedText = replacePair(escapedText, '**', 'b');
    escapedText = replacePair(escapedText, symStrike, 's');
    if (symStrike !== '~~') escapedText = replacePair(escapedText, '~~', 's');
    escapedText = replacePair(escapedText, symUnderline, 'u');
    escapedText = replacePair(escapedText, symItalic, 'i');
    if (symItalic !== '*') escapedText = replacePair(escapedText, '*', 'i');
    escapedText = insertCodeBlocks(escapedText, codeBlocks);
    const lines = escapedText.split('\n');
    const listMeasureEl = listIndentMeasureEl !== undefined ? listIndentMeasureEl : (isForModal ? getNoteListMeasureEl() : null);
    const processedLines = skipLineBlocks ? lines : wrapNoteLineBlocks(lines, listMeasureEl);
    return processedLines.join('<br>');
}


// Next mdClear marker (default --) at or after 'from', skipping the dashes of a Markdown table
// separator row (| ----- | --- |): those are the table, not a marker. -1 when there is none.
function indexOfMdClearMarker(text, marker, from) {
    let idx = text.indexOf(marker, from);
    while (idx !== -1) {
        const lineStart = text.lastIndexOf('\n', idx - 1) + 1;
        let lineEnd = text.indexOf('\n', idx);
        if (lineEnd === -1) lineEnd = text.length;
        const line = text.slice(lineStart, lineEnd);
        if (!(line.includes('|') && /^[\s|:\-]*$/.test(line))) return idx;
        idx = text.indexOf(marker, lineEnd);
    }
    return -1;
}

/**
 * Форматира текстов низ възоснова на JSON параметри.
 * @param {string} text - Текстовият низ за форматиране.
 * @param {string} formatString - Форматиращият низ, разделен с '\n'.
 * @param {boolean} isForModal - Дали е за модал (за линковете).
 * @returns {string} Форматираният HTML низ.
 */
function formatText(text, formatString, isForModal = false, listIndentMeasureEl = undefined) {
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
    // Формат с позиции извън текста е остарял - игнорира се (не се подрязва).
    const isFormatInRange = f => Number.isInteger(f.start) && Number.isInteger(f.end) && f.start >= 0 && f.start < f.end && f.end <= localText.length;
    formats = formats.filter(isFormatInRange);

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
            let start = indexOfMdClearMarker(localText, mdClear, searchIdx);
            if (start === -1) break;
            let end = indexOfMdClearMarker(localText, mdClear, start + mdClear.length);
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

    formats = formats.filter(isFormatInRange);
    if (formats.length === 0) {
        return processNoteContent(localText, isForModal, false, listIndentMeasureEl);
    }
    // Extract code blocks {{ }} BEFORE splitting into segments,
    // so they are not broken across segment boundaries
    const codeBlocks = [];
    const codeTagRegex = /\{\{([\s\S]*?)\}\}|```([\s\S]*?)```/g;
    const textForSegments = localText.replace(codeTagRegex, (match, code1, code2) => {
        const code = code1 !== undefined ? code1 : code2;
        codeBlocks.push(escapeHtml(code));
        return CODE_BLOCK_PLACEHOLDER;
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
        codeRanges.push({ start: codeMatch.index, end: codeMatch.index + codeMatch[0].length, replLen: CODE_BLOCK_PLACEHOLDER.length });
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
            // After the code range, the replacement is CODE_BLOCK_PLACEHOLDER (1 char)
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
        // В прегледа сегментът е само част от ред - блоковете на редовете се слагат след цикъла
        const segmentMeasureEl = listIndentMeasureEl !== undefined ? listIndentMeasureEl : (isForModal ? getNoteListMeasureEl() : null);
        let formattedSegment = processNoteContent(segmentText, isForModal, isForModal || !!segmentMeasureEl, segmentMeasureEl);
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
    // Заглавията и списъчните редове се обвиват като цели редове (с първия им форматиран откъс).
    // <br>-овете остават същите; ред с маркер на кодов блок не се обвива.
    const listMeasureEl = listIndentMeasureEl !== undefined ? listIndentMeasureEl : (isForModal ? getNoteListMeasureEl() : null);
    if (listMeasureEl) {
        html = wrapNoteLineBlocks(html.split('<br>'), listMeasureEl, noteLinePlainText).join('<br>');
    }
    // Re-insert code blocks that were extracted before segmentation (final pass, in order)
    html = insertCodeBlocks(html, codeBlocks);
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
 * Прикачен файл в локален режим: байтовете са blob в store `files`, а
 * attachment.pathGD е ключът му. Линкът отваря файла в нов раздел, иконата го
 * показва в самата бележка (снимка / видео).
 */
async function handleLocalAttachment(attachment, attachmentWrapper, iconData, isForModal = false) {
    const iconDiv = document.createElement('div');
    iconDiv.innerHTML = iconData.svg;
    const fileKey = attachment.pathGD || attachment.path;
    const filename = attachment.path || '';

    const openFile = async () => {
        const url = await getFileObjectUrl(fileKey);
        if (!url) {
            showToast((_('errorOpenFile') || 'Файлът не е намерен: {filename}').replace('{filename}', filename));
            return;
        }
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    };

    const buildLink = () => {
        const oneTapLinksEnabled = localStorage.getItem('oneTapLink') !== 'false';
        if (!isForModal && !oneTapLinksEnabled) {
            const span = document.createElement('span');
            span.textContent = filename;
            return span;
        }
        const link = document.createElement('a');
        link.href = '#';
        link.textContent = filename;
        link.title = filename;
        link.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            await openFile();
        };
        return link;
    };

    if (!fileKey) {
        iconDiv.style.cursor = 'pointer';
        iconDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            showModal(JSON.stringify(attachment, null, 2));
        });
        attachmentWrapper.prepend(iconDiv);
        return;
    }

    switch (attachment.type) {
        case 1: // Image
            attachmentWrapper.appendChild(buildLink());
            addInNotePreviewListener(iconDiv, fileKey, 'local', false);
            break;
        case 2: // Sound
            {
                const container = document.createElement('div');
                container.style.flexGrow = '1';
                container.style.flexShrink = '1';
                container.style.minWidth = '0';
                container.appendChild(buildLink());
                const line2 = document.createElement('div');
                line2.textContent = attachment.description || '';
                container.appendChild(line2);
                attachmentWrapper.appendChild(container);
            }
            break;
        case 3: // Other
            attachmentWrapper.appendChild(buildLink());
            break;
        case 4: // Video
            {
                const container = document.createElement('div');
                container.style.flexGrow = '1';
                container.style.flexShrink = '1';
                container.style.minWidth = '0';
                container.appendChild(buildLink());
                const line2 = document.createElement('div');
                line2.textContent = attachment.description || '';
                container.appendChild(line2);
                attachmentWrapper.appendChild(container);
                addInNotePreviewListener(iconDiv, fileKey, 'local', true);
            }
            break;
        case 5: // Location (има собствен низ, не файл)
            {
                const parts = (attachment.path || '').split('|');
                if (parts.length < 3) break;
                const [lat, lng, label] = parts;
                const textContainer = document.createElement('div');
                const oneTapLinksEnabled = localStorage.getItem('oneTapLink') !== 'false';
                const inModal = !!attachmentWrapper.closest('#modal-body');
                let linkElement;
                if (!inModal && !oneTapLinksEnabled) {
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
            }
            break;
    }
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
            const symBold = (localStorage.getItem('mdBold') || '**').trim();
            const escBold = symBold.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            noteTitle = previewTitleSourceText.replace(/^#{1,6}\s+/, '').replace(new RegExp(`${escBold}([^${escBold}]+)${escBold}`, 'g'), '$1').replace(/\*\*([^*]+)\*\*/g, '$1').trim();
            displayContent = getPreviewBodyAfterTitle(fileContent, previewTitleSourceText);
            adjustPreviewBodyToRenderedTitle = true;
        } else {
            const lines = fileContent.split('\n');
            for (const line of lines) {
                const trimmedLine = line.trim();
                if (trimmedLine) {
                    previewTitleSourceText = trimmedLine;
                    const symBold = (localStorage.getItem('mdBold') || '**').trim();
                    const escBold = symBold.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    noteTitle = trimmedLine.replace(/^#{1,6}\s+/, '').replace(new RegExp(`${escBold}([^${escBold}]+)${escBold}`, 'g'), '$1').replace(/\*\*([^*]+)\*\*/g, '$1').trim();
                    break;
                }
            }
            displayContent = getPreviewBodyAfterTitle(fileContent, previewTitleSourceText);
            adjustPreviewBodyToRenderedTitle = true;
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
        const strippedTitle = stripLinkMarkersForDisplay(noteTitle, titleSpan);
        titleEl.innerHTML = formatText(strippedTitle.text, strippedTitle.formatString, false);
    } else {
        titleEl.textContent = noteTitle.replace(LINK_MARKER_REGEX, '');
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
    // In debug mode the date shows raw data; otherwise it opens the compact week calendar.
    headerDate.addEventListener('click', (e) => {
        e.stopPropagation();
        if (debug) {
            let debugText = JSON.stringify(fullNoteContent, null, 2);
            if (fullNoteContent.gdid && localFileMap.has(fullNoteContent.gdid)) {
                debugText = `File: ${localFileMap.get(fullNoteContent.gdid)}\n\n` + debugText;
            }
            showModal({ raw: debugText, color: 'white' });
            return;
        }
        showNoteWeekCalendar(note, getNoteHeaderDateTimestamp(extraData));
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
            // Зададеният час (uiState.cTime); timer не се пише - той прави бележката напомняне.
            const calDateTime = getNoteCalDateTimeTimestamp(extraData);
            const timeText = calDateTime ? formatTime(calDateTime) : '';
            if (timeText) headerTime.innerHTML = `<span class="header-icon">${clockIconSvg}</span> ${timeText}`;
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
        ? (noteColor >= 0 && noteColor < noteColorMap.length ? noteColorMap[noteColor] : (noteColor < 0 ? colorIntToHex(noteColor) : getDefaultNoteBg()))
        : (typeof noteColor === 'string' ? noteColor : getDefaultNoteBg());
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
    // Картата на дъската има свой шрифт (--note-font-size); отстъпът на списъците се мери спрямо
    // него. В модала мярката остава #modal-body (undefined = по подразбиране).
    const noteListMeasureEl = isForModal ? undefined : getNoteListMeasureEl(note);
    const renderPreviewContent = (contentForPreview) => {
        let formatSource = (textSpan && textSpan.trim() !== '') ? textSpan : null;
        const titleFormatSource = (titleSpan && titleSpan.trim() !== '') ? titleSpan : null;
        // Намираме точния символен офсет, ако първият ред (заглавието) е отделен
        const rawOffset = fileContent.indexOf(contentForPreview);
        const offset = rawOffset !== -1 ? rawOffset : Math.max(0, fileContent.length - contentForPreview.length);
        if (offset > 0 && formatSource) {
            formatSource = adjustFormatStringOffset(formatSource, offset);
        }
        contentEl.innerHTML = getFormattedNoteHtml(contentForPreview, formatSource, titleFormatSource, isForModal, noteListMeasureEl);
        setNoteCheckboxSource(contentEl, rawOffset !== -1 ? rawOffset : null, rawOffset + String(contentForPreview || '').length);
    };
    if (isHiddenNote) {
        const pipeIndex = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(fileContent) : fileContent.indexOf('|');
        const previewContent = pipeIndex !== -1 ? fileContent.substring(0, pipeIndex) : '';
        const titleFormatSource = (titleSpan && titleSpan.trim() !== '') ? titleSpan : null;
        contentEl.innerHTML = getFormattedNoteHtml(previewContent, null, titleFormatSource, isForModal, noteListMeasureEl);
        setNoteCheckboxSource(contentEl, 0, previewContent.length);
    } else {
        renderPreviewContent(displayContent);
    }
    let attachments = [];
    {
        // Локален режим: media.noteid е локалният ключ на бележката.
        attachments = mediaData.filter(media => media.noteid === noteGdid || String(media.noteid) === String(noteID));
    }
    if (attachments.length > 0) {
        note.dataset.hasAttachments = 'true';
        // --- КОРЕКЦИЯ: Добавяме специфична проверка за снимки (тип 1) ---
        if (attachments.some(att => att.type === 1)) {
            note.dataset.hp = '1';
            // --- Store preview data for programmatic access (e.g. Board Previews) ---
            const firstPhoto = attachments.find(att => att.type === 1);
            const mode = 'local';
            const fileId = firstPhoto.pathGD || firstPhoto.path;
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
                await handleLocalAttachment(attachment, attachmentWrapper, iconData);
                contentEl.appendChild(attachmentWrapper);
            }));

        }
    }
    // --- Логика за клик, Ctrl+клик, Shift+клик и продължително натискане (long press) ---
    // b2.36: един клик след задействано продължително натискане се поглъща, за да не отвори модала.
    let suppressNextClick = false;
    let suppressClickTimer = null;
    const suppressCardClickOnce = () => {
        suppressNextClick = true;
        clearTimeout(suppressClickTimer);
        suppressClickTimer = setTimeout(() => { suppressNextClick = false; }, 700);
    };

    // Обработва клик върху цялата бележка (с изключение на хедъра)
    const handleNoteClick = async (e) => {
        // Кликът, който следва задействано продължително натискане, не прави нищо.
        if (suppressNextClick) {
            suppressNextClick = false;
            clearTimeout(suppressClickTimer);
            return;
        }
        // --- Масов избор (b2.36): Shift+клик и Ctrl/⌘+клик върху тялото влизат в режим на избор;
        // вътре в него всеки клик сменя отметката, а Shift+клик отбелязва диапазон.
        // Ctrl+клик вече НЕ отваря бележката за редакция — собственикът махна това поведение.
        const cardKey = String(note.dataset.g || note.dataset.i || '');
        if (cardKey) {
            if (selectionState.active) {
                e.preventDefault();
                if (e.shiftKey) extendSelectionTo(cardKey);
                else toggleNoteSelection(cardKey);
                return;
            }
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                e.preventDefault();
                enterSelectionMode(cardKey);
                return;
            }
        }
        // Check if text is selected. If so, prevent opening the modal.
        const selection = window.getSelection();
        if (selection.toString().length > 0) {
            return;
        }
        // Отваряме модала, само ако кликът не е върху футъра
        if (!e.target.closest('.note-footer')) {
            const currentGdid = noteContent.gdid || note.dataset.g;



            const noteBgColor = getNoteColorCss(noteColor);
            showModal({ raw: fileContent, format: textSpan, titleFormat: titleSpan, color: noteBgColor, boardId: (function () { try { const _src = (typeof noteContent !== 'undefined' && noteContent) ? noteContent : extraData; const _live = (typeof allNotesData !== 'undefined' && Array.isArray(allNotesData)) ? allNotesData.find(n => n && (String(n.gdid) === String(_src.gdid) || (n.id !== undefined && _src.id !== undefined && String(n.id) === String(_src.id)))) : null; return (_live && _live.boardid !== undefined) ? _live.boardid : extraData.boardid; } catch (e) { return extraData.boardid; } })(), id: noteID, gdid: currentGdid, datemod: extraData.datemod, originalNote: noteContent }, note);
        }
    };

    // Обработва клик върху хедъра (за изтриване)
    const handleHeaderClick = (e) => {
        // Кликът, който следва дълго натискане върху кабарчето, не бива да стига до бележката.
        if (suppressNextClick) {
            suppressNextClick = false;
            clearTimeout(suppressClickTimer);
            e.stopPropagation();
            return;
        }
        if (e.ctrlKey) {
            e.stopPropagation();
            e.preventDefault();
            dropFromSelectionIfPresent(String(noteGdid || noteID || ''));
            handleNoteDelete(noteGdid, noteID);
        }
    };
    titleWrapper.addEventListener('click', handleHeaderClick);
    // b2.36: продължително натискане върху кабарчето трие ТАЗИ бележка — със същото потвърждение
    // като Ctrl+клик. Работи и докато има избор; ако бележката е била в него, излиза от избора.
    addLongPress(titleWrapper, () => {
        suppressCardClickOnce();
        dropFromSelectionIfPresent(String(noteGdid || noteID || ''));
        handleNoteDelete(noteGdid, noteID);
    }, { delay: 500 });

    // b2.36: продължително натискане върху тялото (телефон) влиза в режим на избор с тази бележка.
    addLongPress(note, (startEvent) => {
        const startTarget = startEvent && startEvent.target;
        // Кабарчето има собствен жест — там изборът не се задейства.
        if (startTarget && startTarget.closest && startTarget.closest('.note-title-wrapper')) return;
        const bodyKey = String(note.dataset.g || note.dataset.i || '');
        if (!bodyKey) return;
        suppressCardClickOnce();
        if (!selectionState.active) enterSelectionMode(bodyKey);
        else setNoteSelected(bodyKey, true);
    }, { delay: 500 });

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
                            const sourceMode = 'local';
                            const attachmentsOfType = attachments.filter(att => att.type === type);
                            const isVideo = type === 4;
                            addInNotePreviewListener(iconDiv, attachmentsOfType, 0, sourceMode, isVideo);
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
    if (wasPinned) delete noteToUpdate.pinnedAt;
    else noteToUpdate.pinnedAt = Date.now();
    noteToUpdate.datemod = Date.now();

    noteToUpdate.type = -1; // локален режим: бележката живее само в базата

    const oldNoteEl = document.querySelector(`.note[data-g="${noteToUpdate.gdid}"]`) ||
        (noteToUpdate.id ? document.querySelector(`.note[data-i="${noteToUpdate.id}"]`) : null);
    if (oldNoteEl) {
        const updatedEl = await createNoteElement(noteToUpdate);
        if (updatedEl) oldNoteEl.replaceWith(updatedEl);
    }


    if (useIndexedDb) await bulkPutDB(NOTE_STORE_NAME, [noteToUpdate], true);
    applyFilters();
    updateReloadButtonState();
    showToast(wasPinned ? (_('noteUnpinned') || 'Note unpinned') : (_('notePinned') || 'Note pinned'), 2000);
    return true;
}
// Два борда с еднакво заглавие: търсенето по заглавие (стартов борд 'Main')
// взима първия срещнат, т.е. произволен. Не трием и не преименуваме нищо сами —
// казваме еднократно кой борд се зарежда и предлагаме преименуване на другия.
const warnedDuplicateBoardTitles = new Set();
function warnDuplicateBoardTitles(loadedBoardId) {
    if (!Array.isArray(boardsData) || boardsData.length < 2) return;
    const groups = new Map();
    boardsData.forEach(b => {
        const key = (b && b.title ? String(b.title) : '').trim().toLowerCase();
        if (!key) return;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(b);
    });
    const boardKey = b => String(b.gdid || b.id);
    for (const boards of groups.values()) {
        if (boards.length < 2) continue;
        const signature = boards.map(boardKey).sort().join('|');
        if (warnedDuplicateBoardTitles.has(signature)) continue;
        warnedDuplicateBoardTitles.add(signature);
        const current = boards.find(b => boardKey(b) === String(loadedBoardId));
        const loaded = current || boards[0];
        const other = boards.find(b => b !== loaded);
        const countNotes = id => (allNotesData || []).filter(n => String(n.boardid) === id).length;
        const describe = b => `${boardKey(b)} (${countNotes(boardKey(b))})`;
        const msg = (current
            ? (_('duplicateBoardTitleLoaded') || 'There are {count} boards named "{title}": {list}. Loading the board with gdid {loaded}. Rename the other board so they can be told apart?')
            : (_('duplicateBoardTitleByName') || 'There are {count} boards named "{title}": {list}. When a board is chosen by this name, the board with gdid {loaded} is used. Rename the other board so they can be told apart?'))
            .replace('{count}', boards.length)
            .replace('{title}', String(loaded.title).trim())
            .replace('{list}', boards.map(describe).join(', '))
            .replace('{loaded}', describe(loaded));
        console.warn('[DuplicateBoards] Duplicate board title "' + loaded.title + '":', boards.map(describe), 'loaded:', boardKey(loaded));
        let tries = 0;
        const ask = async () => {
            const popup = document.getElementById('folderIdPromptPopup');
            if (!popup) return;
            // Не прекъсваме друг диалог (напр. първоначалната настройка) — пробваме пак по-късно.
            if (popup.classList.contains('show')) {
                if (++tries < 20) setTimeout(ask, 3000);
                return;
            }
            const answer = await showConfirmation(msg);
            if (answer !== true || !other) return;
            await showNewBoardModal();
            const editSelect = document.getElementById('board-edit-select');
            if (editSelect) {
                editSelect.value = boardKey(other);
                if (editSelect.value === boardKey(other) && typeof editSelect.onchange === 'function') editSelect.onchange();
            }
            const titleInput = document.getElementById('new-board-title');
            if (titleInput) titleInput.focus();
        };
        setTimeout(ask, 1500);
        return;
    }
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
    warnDuplicateBoardTitles(currentBoardFilter);
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
                        showToast(_('boardDeletedSuccess').replace('{boardName}', board.title), 2000);
                    }
                }
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


async function loadTranslations(lang) {
    if (appTranslations[lang] && !translationsFallback[lang]) return;
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
        delete translationsFallback[lang];
    } catch (e) {
        console.error("Failed to load translations:", e);
        if (!appTranslations[lang]) {
            appTranslations[lang] = {};
            translationsFallback[lang] = true;
            if (lang === 'bg') {
                appTranslations[lang]['initialDataLoad'] = 'Зареждане на данни...';
                appTranslations[lang]['okButton'] = "ОК";
            } else {
                appTranslations[lang]['initialDataLoad'] = 'Data loading...';
                appTranslations[lang]['okButton'] = "OK";
            }
        }
    }
}

async function setLanguage(lang) {
    if (!appTranslations[lang] || translationsFallback[lang]) {
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
    renderVersionLabels();
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
    // Update KB Assistant Language
    if (window.kbAssistant && typeof window.kbAssistant.updateLanguage === 'function') {
        window.kbAssistant.updateLanguage();
    }
}

// --- KB Assistant: зареждане при първа нужда ---
// Скриптът, стиловете и KB файловете на асистента не се теглят при старт.
// ensureKBAssistant() ги зарежда при първото отваряне или от водач и връща
// едно и също обещание на всички извикващи, така че нищо не се тегли два пъти.
let kbAssistantLoadPromise = null;
let kbOpenAfterLoad = false; // потребителят чака панела (клик на бутона)

function loadKBAssistantFile(tag, attrs) {
    return new Promise((resolve, reject) => {
        const el = document.createElement(tag);
        Object.assign(el, attrs);
        el.onload = () => resolve();
        el.onerror = () => {
            el.remove(); // при нов опит елементът се добавя отново
            reject(new Error(`Failed to load ${attrs.src || attrs.href}`));
        };
        document.head.appendChild(el);
    });
}

function setKBLoadingPanel(visible) {
    let panel = document.getElementById('kb-loading-panel');
    if (!visible) {
        if (panel) panel.remove();
        return;
    }
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'kb-loading-panel';
        panel.innerHTML = '<div class="kb-loading-panel-title"></div><div class="kb-loading-panel-text"></div>';
        document.body.appendChild(panel);
    }
    panel.querySelector('.kb-loading-panel-title').textContent = _('assistantName') || 'Assistant';
    panel.querySelector('.kb-loading-panel-text').textContent = _('assistantLoading') || 'Loading...';
}

function ensureKBAssistant() {
    if (window.kbAssistant && window.kbAssistant.isInitialized) return Promise.resolve(true);
    if (kbAssistantLoadPromise) return kbAssistantLoadPromise;
    if (window.isAppErrorState) return Promise.resolve(false);
    setKBLoadingPanel(true);
    const css = document.querySelector('link[href="kb-assistant.css"]')
        ? Promise.resolve()
        : loadKBAssistantFile('link', { rel: 'stylesheet', href: 'kb-assistant.css' });
    // Класът остава дефиниран след първото зареждане - скриптът не се добавя втори път
    const js = typeof KBAssistant !== 'undefined'
        ? Promise.resolve()
        : loadKBAssistantFile('script', { src: 'kb-assistant.js' });
    kbAssistantLoadPromise = Promise.all([css, js])
        .then(() => {
            if (!window.kbAssistant || typeof window.kbAssistant.getText !== 'function') {
                throw new Error('kb-assistant.js did not define the assistant');
            }
            return window.kbAssistant.init();
        })
        .then((ok) => {
            if (!ok) throw new Error('KB Assistant initialization failed');
            // Кешира файловете на асистента, за да работи и офлайн от следващото отваряне
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready
                    .then(reg => { if (reg.active) reg.active.postMessage({ type: 'CACHE_KB_ASSETS' }); })
                    .catch(() => { });
            }
            return true;
        })
        .catch((err) => {
            console.warn('KB Assistant could not be loaded:', err);
            if (kbOpenAfterLoad) showToast(_('assistantLoadFailed') || 'The assistant could not be loaded.', 5000);
            return false;
        })
        .then((ok) => {
            kbAssistantLoadPromise = null; // при неуспех следващ опит зарежда наново
            setKBLoadingPanel(false);
            if (ok && kbOpenAfterLoad && window.kbUI && !window.kbUI.isOpen) window.kbUI.open();
            kbOpenAfterLoad = false;
            return ok;
        });
    return kbAssistantLoadPromise;
}

/**
 * Интрото на асистента (запис assistant-1 в базата на знанието): зарежда асистента и
 * пуска тура. Връща true, ако турът е тръгнал.
 *
 * @param {Object} [options]
 * @param {boolean} [options.force] - пуска интрото дори при вече изтекъл флаг 'guide'
 * @param {boolean} [options.persistFlag=true] - записва ли 'guide'='false' (демото не пипа
 *        истинските настройки на браузъра, за да не изяде интрото на реалното приложение)
 * @returns {Promise<boolean>}
 */
async function startAssistantGuide(options = {}) {
    if (!options.force && !guide) return false;
    if (!(await ensureKBAssistant())) return false;
    const entry = window.kbAssistant.kbData?.general?.find(e => e.id === 'assistant-1');
    if (!entry || !entry.guide) return false;
    window.kbAssistant.showGuide(entry.guide);
    if (options.persistFlag !== false) {
        localStorage.setItem('guide', 'false');
        guide = false;
    }
    return true;
}

// --- Обновяване на приложението (uni/sw.js) ---
// Флагът следи пипал ли е потребителят приложението след отварянето. Докато не е пипал и новият
// worker е готов, го пускаме веднага: обикновен refresh (или отваряне) вдига версията сам,
// с едно презареждане. Щом вече се работи в приложението, не презареждаме под ръцете -
// банерът изчаква натискането на Refresh now.
window.swUserInteracted = false;
['pointerdown', 'touchstart', 'keydown', 'wheel'].forEach(ev =>
    window.addEventListener(ev, () => { window.swUserInteracted = true; }, { capture: true, passive: true }));

function applyWaitingWorker(worker) {
    if (!worker || window.swUserInteracted) return false;
    try {
        worker.postMessage({ type: 'SKIP_WAITING' });
    } catch (e) {
        console.warn('[SW] Чакащият worker не прие SKIP_WAITING:', e);
        return false;
    }
    console.log('[SW] Чакащият worker е пуснат, страницата се презарежда веднъж.');
    return true;
}

// Банерът е само за истински нов билд. Чакащ worker със същата версия като активния значи
// само, че регистрацията си сменя адреса (напр. преминаване от 'sw.js?v=...' към чистия
// 'sw.js') - тогава не показваме нищо и не презареждаме. Такъв worker поема при следващо
// отваряне на приложението.
// Чакащият worker още не обслужва страницата и не приема съобщения надеждно, затова четем
// името на кеша направо от скрипта му.
async function waitingWorkerCacheName(worker) {
    try {
        const res = await fetch(worker.scriptURL, { cache: 'no-store' });
        if (!res.ok) return null;
        const m = /CACHE_NAME\s*=\s*'([^']*)'/.exec(await res.text());
        return m ? m[1] : null;
    } catch (e) { return null; }
}

async function waitingWorkerIsNewBuild(worker) {
    if (!worker || !navigator.serviceWorker.controller) return true;
    const waitingVersion = await waitingWorkerCacheName(worker);
    const activeVersion = await askServiceWorkerCacheName(navigator.serviceWorker.controller);
    if (!waitingVersion || !activeVersion) return true;
    return waitingVersion !== activeVersion;
}

// Банерът за обновяване: на топ ниво, защото го вика handleWaitingWorker (вътре в load
// handler-а не се виждаше от нея - ReferenceError: showUpdateNotification is not defined).
// Function to show update notification as a persistent floating bar
// Uses a simple boolean flag - guarantees at most ONE notification per page load
const showUpdateNotification = (waitingSW) => {
    if (!waitingSW) return;

    // Block if already shown on this page load
    if (window._swUpdateBarShown) return;

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

let handledWaitingWorker = null;
async function handleWaitingWorker(worker) {
    if (!worker || worker === handledWaitingWorker) return;
    handledWaitingWorker = worker;
    if (!(await waitingWorkerIsNewBuild(worker))) {
        console.log('[SW] Чакащият worker е същата версия, само сменя адреса си - без банер.');
        return;
    }
    if (!applyWaitingWorker(worker)) showUpdateNotification(worker);
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
            // Регистрацията е на стабилен адрес 'sw.js'. Печатът с версията (sw.js?v=...) караше
            // браузъра да инсталира "нов" worker при всяко отваряне (различен адрес = различен
            // скрипт), оттам излизаше банер дори когато версията вече е нова. Свежестта се
            // гарантира с updateViaCache: 'none' - скриптът се тегли от мрежата при всяка проверка.
            const registration = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' });
            console.log(`[SW] Registration successful. Scope: ${registration.scope}. Active: ${!!registration.active}, Waiting: ${!!registration.waiting}, Installing: ${!!registration.installing}`);


            // Готов нов worker още при зареждането: пускаме го, ако потребителят не е пипал нищо.
            if (registration.waiting) handleWaitingWorker(registration.waiting);

            // ALWAYS listen for new SW installing
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                console.log('[SW] New worker found installation starting...', newWorker?.scriptURL);
                if (newWorker) {
                    newWorker.addEventListener('statechange', () => {
                        console.log(`[SW] New worker state changed: ${newWorker.state}`);
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            console.log('[SW] New worker installed.');
                            handleWaitingWorker(newWorker);
                        }
                    });
                }
            });

            // Същата проверка и периодично в първите секунди: при бърз (кеширан) sw.js инсталацията
            // може да приключи, преди 'updatefound' да е вързал слушателя, и тогава никой не вижда
            // чакащия worker.
            let waitingWatchTries = 0;
            const waitingWatch = setInterval(() => {
                waitingWatchTries++;
                if (registration.waiting) {
                    clearInterval(waitingWatch);
                    handleWaitingWorker(registration.waiting);
                } else if (waitingWatchTries >= 20) {
                    clearInterval(waitingWatch);
                }
            }, 500);

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
    const advancedSettingsSpan = document.getElementById('advanced-settings-span');
    if (advancedSettingsSpan) {
        if (localStorage.getItem('showAdvancedSettings') === 'true') {
            advancedSettingsSpan.removeAttribute('hidden');
        } else {
            advancedSettingsSpan.setAttribute('hidden', '');
        }
    }
    const useIndexedDbCheckbox = document.getElementById('use-indexeddb-checkbox');
    if (useIndexedDbCheckbox) useIndexedDbCheckbox.checked = true; // локален режим: базата е винаги включена
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
    const maxModalScroll = modalBodyElem.scrollHeight - modalBodyElem.clientHeight;
    const modalScrollRatio = (charIndex === -1 && maxModalScroll > 0) ? (modalBodyElem.scrollTop / maxModalScroll) : -1;
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

    // При редактиране custom color-ът идва директно от записа на бележката.
    // Не разчитаме на colorIndex, защото той е само UI индекс и не описва произволен цвят.
    const isCustomColor = noteObj && (
        (typeof noteObj.color === 'number' && (noteObj.color < 0 || noteObj.color >= noteColorMap.length)) ||
        (typeof noteObj.color === 'string' && !noteColorMap.includes(noteObj.color.toUpperCase()))
    );
    if (isCustomColor && modalContentBox) {
        const customColor = getNoteColorCss(noteObj.color);
        modalContentBox.style.backgroundColor = customColor;
        modalBodyElem.dataset.color = customColor;
        modalBodyElem.dataset.colorIndex = '-1';
    }

    let correctedTitleIndex = -1;
    let correctedBodyIndex = -1;

    let titleText = "";
    let bodyText = currentModalContent || "";
    let currentBodyFormats = parseFormatsString(modalBodyElem.dataset.format);
    let currentTitleFormats = parseFormatsString(modalBodyElem.dataset.titleFormat);

    const hasPipe = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(bodyText) !== -1 : bodyText.includes('|');
    const isPreviewTransition = modalBodyElem.dataset.isPreview === 'true';
    if (isPreviewTransition) {
        // Preview renders postEdit output. Re-enter editing through the normal
        // preEdit path so its Markdown markers and formatting ranges match a
        // newly opened editor.
        delete modalBodyElem.dataset.draftText;
        delete modalBodyElem.dataset.draftTitle;
        delete modalBodyElem.dataset.isPreview;
        delete modalBodyElem.dataset.previewDraftFormat;
        delete modalBodyElem.dataset.previewDraftTitleFormat;
        delete modalBodyElem.dataset.previewDraftMaskedLinks;
        delete modalBodyElem.dataset.previewHasTitle;
        delete modalBodyElem.dataset.previewDraftJoined;
    }
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
        const linkSlots = reserveLinkMarkerSlots(titleText + '\n' + bodyText);
        const titleResult = preEdit(titleText, currentTitleFormats, titleCharIdx, linkSlots);
        const bodyResult = preEdit(bodyText, currentBodyFormats, bodyCharIdx, linkSlots);
        titleText = titleResult.text;
        bodyText = bodyResult.text;
        correctedTitleIndex = titleResult.correctedIndex;
        correctedBodyIndex = bodyResult.correctedIndex;
        modalBodyElem.dataset.maskedLinks = JSON.stringify(linkSlots);
        modalBodyElem.dataset.titleFormat = stringifyFormatsArray(titleResult.formats);
        modalBodyElem.dataset.format = stringifyFormatsArray(bodyResult.formats);
    } else {
        const result = preEdit(bodyText, currentBodyFormats, charIndex);
        bodyText = result.text;
        correctedBodyIndex = result.correctedIndex;
        modalBodyElem.dataset.maskedLinks = JSON.stringify(result.maskedLinks || []);
        modalBodyElem.dataset.format = stringifyFormatsArray(result.formats);
    }
    modalBodyElem.innerHTML = '';
    // Sticky formats (Ctrl+B... without a selection) stay on until pressed again; another note starts without them.
    const stickyKey = getNoteStickyKey();
    if (stickyKey !== noteStickyNoteKey) {
        noteStickyFormats = new Set();
        noteStickyColors = { 4: null, 5: null };
        noteStickyNoteKey = stickyKey;
    }
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
            // The text is drawn by the backdrop (with its formatting); the field shows the caret.
            color: 'transparent',
            caretColor: getComputedStyle(modalBodyElem).color,
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
            height: 'auto',
            padding: '10px',
            boxSizing: 'border-box',
            fontFamily: textarea.style.fontFamily,
            fontSize: textarea.style.fontSize,
            fontWeight: textarea.style.fontWeight,
            lineHeight: 'normal',
            whiteSpace: 'pre-wrap',
            wordWrap: 'break-word',
            overflowWrap: 'break-word',
            color: 'inherit',
            pointerEvents: 'none',
            zIndex: '1',
            // Painted once and then moved by the compositor: scrolling a clipped box re-rastered
            // the whole visible text on every scroll frame, so a long note scrolled at half speed.
            willChange: 'transform',
            transform: 'translate3d(0, 0, 0)'
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
        syncNoteEditBackdropOffset(bodyTextarea, bodyBackdrop);
        bodyTextarea.addEventListener('scroll', () => { syncNoteEditBackdropOffset(bodyTextarea, bodyBackdrop); }, { passive: true });
        bodyTextarea.addEventListener('input', () => { handleEditInput(bodyTextarea, bodyBackdrop); });
        handleEditInput(bodyTextarea, bodyBackdrop);
    }
    // A width change (scrollbar coming or going, modal resize) re-wraps both the same way.
    if (typeof ResizeObserver === 'function') {
        [[bodyTextarea, bodyBackdrop], [titleTextarea, titleBackdrop]].forEach(([ta, bd]) => {
            if (!ta || !bd) return;
            new ResizeObserver(() => { if (ta.isConnected) syncNoteEditBackdropBox(ta, bd); }).observe(ta);
        });
    }
    if (titleTextarea && titleBackdrop) {
        syncNoteEditBackdropOffset(titleTextarea, titleBackdrop);
        titleTextarea.addEventListener('scroll', () => { syncNoteEditBackdropOffset(titleTextarea, titleBackdrop); }, { passive: true });
        titleTextarea.addEventListener('input', () => { handleEditInput(titleTextarea, titleBackdrop); });
        handleEditInput(titleTextarea, titleBackdrop);
    }

    initNoteEditUI();

    const focusEl = (charIndex !== -1 && bodyTextarea) ? bodyTextarea : (titleTextarea || bodyTextarea);
    // Plan 9: the tables open already aligned, each in its field (as after hold on ▦).
    const bodyCaret = (focusEl === bodyTextarea && correctedBodyIndex > -1) ? correctedBodyIndex : (bodyTextarea ? bodyTextarea.value.length : 0);
    const tableSplit = openNoteTableFieldsOnEdit(bodyTextarea, bodyCaret, focusEl === bodyTextarea && correctedBodyIndex > -1);
    if (tableSplit && focusEl === bodyTextarea) {
        // The caret is already in its piece (openNoteTableFieldsOnEdit); the split is what scrolls.
        if (modalScrollRatio >= 0) {
            const applySplitScroll = () => {
                const maxSplitScroll = tableSplit.scrollHeight - tableSplit.clientHeight;
                if (maxSplitScroll > 0) tableSplit.scrollTop = Math.round(modalScrollRatio * maxSplitScroll);
            };
            applySplitScroll();
            requestAnimationFrame(applySplitScroll);
            setTimeout(applySplitScroll, 160);
        } else {
            revealNoteTableSplitCaret(tableSplit);
            setTimeout(() => revealNoteTableSplitCaret(tableSplit), 150);
        }
    } else if (focusEl) {
        focusEl.focus();
        if (correctedTitleIndex > -1 && titleTextarea) {
            titleTextarea.setSelectionRange(correctedTitleIndex, correctedTitleIndex);
        } else if (correctedBodyIndex > -1 && bodyTextarea) {
            bodyTextarea.setSelectionRange(correctedBodyIndex, correctedBodyIndex);
        } else {
            placeCaretAtEnd(focusEl);
        }
        if (modalScrollRatio >= 0 && bodyTextarea) {
            const scroller = tableSplit || bodyTextarea;
            const applyEditScroll = () => {
                const maxEditScroll = scroller.scrollHeight - scroller.clientHeight;
                if (maxEditScroll > 0) {
                    scroller.scrollTop = Math.round(modalScrollRatio * maxEditScroll);
                }
            };
            applyEditScroll();
            requestAnimationFrame(applyEditScroll);
            setTimeout(applyEditScroll, 160);
        } else {
            setTimeout(() => {
                const textarea = document.activeElement;
                if (textarea && (textarea.id === 'note-edit-textarea' || textarea.id === 'note-edit-title-textarea')) {
                    scrollCaretIntoView(textarea);
                }
            }, 150);
        }
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
    const pasteModalBtn = document.getElementById('paste-modal-btn');
    if (pasteModalBtn) pasteModalBtn.style.display = 'flex';

    // Какво показва редакторът в момента на отваряне. Отварянето подравнява таблиците (plan 9), така
    // че текстът тук се различава от записания, без потребителят да е пипал нищо. Затова отметката за
    // „има ли промени“ при затваряне (checkUnsavedChanges) се сверява и с това състояние.
    if (modalBodyElem.dataset.initialEditText === undefined) {
        modalBodyElem.dataset.initialEditText = bodyTextarea ? bodyTextarea.value : bodyText;
        modalBodyElem.dataset.initialEditTitleText = titleTextarea ? titleTextarea.value : titleText;
        modalBodyElem.dataset.initialFormat = modalBodyElem.dataset.format || '';
        modalBodyElem.dataset.initialTitleFormat = modalBodyElem.dataset.titleFormat || '';
        // Геометрията влиза в отметката; вече взета при отварянето - остава (местене преди редакция пак е промяна).
        if (modalBodyElem.dataset.baseGeometry === undefined) setNoteWindowBaseGeometry(modalBodyElem);
    }
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

    // Each line keeps its text ('rest'); only the marker in front of it changes.
    const edits = [];
    let at = lineStart;
    const newLines = selectedLines.map((line, idx) => {
        const escapedBullet = bulletSym.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const markerRegex = isBullet ? new RegExp(`^\\s*${escapedBullet}\\s*`) : /^\s*\d+\.\s*/;
        const rest = line.replace(markerRegex, '');
        const marker = isRemoving ? '' : (isBullet ? `${bulletSym} ` : `${idx + 1}. `);
        edits.push({ s: at, oldLen: line.length - rest.length, newLen: marker.length });
        at += line.length + 1;
        return marker + rest;
    });
    const replacement = newLines.join('\n');
    const ctx = getNoteEditContext(textarea);
    if (!ctx || !ctx.modalBody) {
        textarea.setRangeText(replacement, lineStart, lineEnd, 'end');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }
    // The formats move with the text after each marker: a range starting at a line start (or in
    // its old marker) starts after the new marker, so the marker and its space never get a format
    // and the formatted characters stay the same (handleEditInput would guess one shift at the caret).
    const mapPos = (p, isEnd) => {
        let acc = 0;
        for (const ed of edits) {
            const S = ctx.off + ed.s;
            if (isEnd ? p <= S : p < S) return p + acc;
            if (p < S + ed.oldLen) return S + ed.newLen + acc;
            acc += ed.newLen - ed.oldLen;
        }
        return p + acc;
    };
    const formats = readNoteEditFormats(ctx.modalBody, ctx.key)
        .map(f => ({ ...f, start: mapPos(f.start, false), end: mapPos(f.end, true) }))
        .filter(f => f.end > f.start);
    noteEditReplace(textarea, lineStart, lineEnd, replacement, lineStart + replacement.length);
    writeNoteEditFormats(ctx.modalBody, ctx.key, formats);
    refreshNoteEditBackdrops(ctx);
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

function getMarkdownTableCellCharIndex(text, cellElement) {
    const table = parseMarkdownTable(text);
    const renderedTable = cellElement?.closest('table.md-table-render');
    const renderedRow = cellElement?.closest('tr');
    if (!table || !renderedTable || !renderedRow) return -1;

    const columnIndex = Array.from(renderedRow.children).indexOf(cellElement);
    if (columnIndex < 0) return -1;

    let rowIndex;
    if (!table.borderless && cellElement.tagName === 'TH') {
        rowIndex = 0;
    } else {
        const bodyRows = Array.from(renderedTable.querySelectorAll('tbody tr'));
        const bodyRowIndex = bodyRows.indexOf(renderedRow);
        if (bodyRowIndex < 0) return -1;
        rowIndex = bodyRowIndex + 1;
    }

    // Markdown has a separator row after the header; rendered rows do not.
    const sourceLineIndex = rowIndex === 0 ? table.startIndex : table.startIndex + rowIndex + 1;
    const sourceLines = String(text).split(/\r\n|\n|\r/);
    const sourceLine = sourceLines[sourceLineIndex];
    if (sourceLine === undefined) return -1;

    const lineBreaks = [...String(text).matchAll(/\r\n|\n|\r/g)];
    const lineStart = sourceLineIndex === 0
        ? 0
        : lineBreaks[sourceLineIndex - 1]?.index + lineBreaks[sourceLineIndex - 1]?.[0].length;
    if (!Number.isFinite(lineStart)) return -1;

    let cellStart = sourceLine.trimStart().startsWith('|')
        ? sourceLine.indexOf('|') + 1
        : 0;
    for (let index = 0; index < columnIndex; index++) {
        const separatorIndex = sourceLine.indexOf('|', cellStart);
        if (separatorIndex === -1) return -1;
        cellStart = separatorIndex + 1;
    }

    const cellEnd = sourceLine.indexOf('|', cellStart);
    const rawCell = sourceLine.slice(cellStart, cellEnd === -1 ? sourceLine.length : cellEnd);
    return lineStart + cellStart + (rawCell.length - rawCell.trimStart().length);
}

/**
 * Глобален слушател за прихващане на системни преки пътища (Ctrl+N, Ctrl+U и др.)
 */
document.addEventListener('keydown', (e) => {
    const activeTextarea = document.activeElement;
    if (!activeTextarea || (!isNoteEditBodyField(activeTextarea) && activeTextarea.id !== 'note-edit-title-textarea')) return;

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
// --- Escape key to close modals ---
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        let visibleModal = document.querySelector('.modal-overlay.visible');
        // Several note windows: Escape closes the one in front.
        if (visibleModal && visibleModal.classList.contains('note-window')) {
            const front = (activeNoteWindow && activeNoteWindow.open) ? activeNoteWindow : getTopNoteWindow();
            if (front) visibleModal = front.el;
        }
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




// Ctrl/⌘+B / I / U / D and the B I U S buttons. With a selection: the format goes on, or off when
// all of it already has it; no marker goes into the text. Without one: sticky mode for that format
// (what is typed next gets it) until the same shortcut is pressed again.
function formatKeyboardHotkeys(textarea, backdrop, isB, isI, isU, isD) {
    const type = isB ? 1 : isI ? 2 : isU ? 3 : 7;
    const ctx = getNoteEditContext(textarea);
    if (!ctx) return;
    if (!noteEditKeepsFormats(textarea)) {
        // A note with a table keeps no ranges: the markers go into the text, as they always did.
        const sym = getNoteMdSymbols();
        const symbol = isB ? sym.bold : isI ? sym.italic : isU ? sym.underline : sym.strike;
        const s0 = textarea.selectionStart, e0 = textarea.selectionEnd;
        noteEditReplace(textarea, s0, e0, symbol + textarea.value.substring(s0, e0) + symbol, s0 + symbol.length);
        textarea.setSelectionRange(s0 + symbol.length, e0 + symbol.length);
        return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start === end) {
        if (noteStickyFormats.has(type)) noteStickyFormats.delete(type);
        else noteStickyFormats.add(type);
        updateNoteStickyButtons();
        return;
    }
    const S = ctx.off + start, E = ctx.off + end;
    let formats = readNoteEditFormats(ctx.modalBody, ctx.key);
    if (isNoteRangeCovered(formats, S, E, type)) formats = removeNoteFormatRange(formats, S, E, f => f.type === type);
    else formats = addNoteFormatRange(formats, S, E, type);
    writeNoteEditFormats(ctx.modalBody, ctx.key, formats);
    refreshNoteEditBackdrops(ctx);
    textarea.setSelectionRange(start, end);
}

// Text colour (type 4) / text background (type 5) from the droplet popup; colorInt null = the ×
// dot (standard colour). With a selection the colour replaces whatever colour of that type is
// there (never a toggle); without one it is pending for what is typed next in this note.
function applyNoteEditColor(field, type, colorInt, selStart, selEnd) {
    const ctx = getNoteEditContext(field);
    if (!ctx) return false;
    const start = selStart === undefined ? field.selectionStart : selStart;
    const end = selEnd === undefined ? field.selectionEnd : selEnd;
    if (start === end) {
        noteStickyColors[type] = colorInt;
        return true;
    }
    const S = ctx.off + Math.min(start, end), E = ctx.off + Math.max(start, end);
    let formats = readNoteEditFormats(ctx.modalBody, ctx.key);
    formats = colorInt === null
        ? removeNoteFormatRange(formats, S, E, f => f.type === type)
        : addNoteColorRange(formats, S, E, type, colorInt);
    writeNoteEditFormats(ctx.modalBody, ctx.key, formats);
    refreshNoteEditBackdrops(ctx);
    field.setSelectionRange(start, end);
    return true;
}
// The colour of a type that applies at the selection (its start), or that typing at the caret
// would get (the pending one first); null = standard colour.
function getNoteEditColorAt(field, type, selStart, selEnd) {
    const ctx = getNoteEditContext(field);
    if (!ctx) return null;
    const start = selStart === undefined ? field.selectionStart : selStart;
    const end = selEnd === undefined ? field.selectionEnd : selEnd;
    const formats = readNoteEditFormats(ctx.modalBody, ctx.key);
    if (start === end) {
        if (noteStickyColors[type] !== null && noteStickyColors[type] !== undefined) return noteStickyColors[type];
        const P = ctx.off + start;
        const f = formats.find(f => f.type === type && f.start < P && f.end > P);
        return f ? (f.paramint | 0) : null;
    }
    const S = ctx.off + Math.min(start, end);
    const f = formats.find(f => f.type === type && f.start <= S && f.end > S);
    return f ? (f.paramint | 0) : null;
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
// The editor keeps the text WITHOUT Markdown markers and every format as a range (dataset.format /
// dataset.titleFormat, the same shape as text_span). The textarea text is transparent (only the
// caret and the selection show) and the backdrop under it draws the real formatting by the rules of
// formatText. A textarea has one font, so the backdrop draws only what keeps every glyph where the
// textarea has it: bold is a stroke, italic a slant per word, a heading bold with a bar, a small
// size dimmed. Otherwise the caret would drift away from the letters.
const NOTE_HEADER_SCALES = [1.3, 1.2, 1.1, 0.9, 0.8, 0.7]; // "# " ... "###### " (preEdit/postEdit)
let noteStickyFormats = new Set(); // Ctrl+B/I/U/D without a selection: types the next typed text gets
let noteStickyNoteKey = null;
let noteStickyColors = { 4: null, 5: null }; // droplet popup without a selection: type -> colour int the next typed text gets
let noteMdApplying = false; // our own edits must not run the Markdown input rules again

function ensureNoteMdStyles() {
    if (document.getElementById('note-md-live-styles')) return;
    const style = document.createElement('style');
    style.id = 'note-md-live-styles';
    style.textContent = `
.nmd-b { -webkit-text-stroke: 0.045em currentColor; }
.nmd-i { display: inline-block; transform: skewX(-12deg); transform-origin: 50% 80%; }
.nmd-h { -webkit-text-stroke: 0.045em currentColor; box-shadow: inset 0 -0.16em rgba(128, 128, 128, 0.35); }
.nmd-h2 { box-shadow: inset 0 -0.11em rgba(128, 128, 128, 0.3); }
.nmd-h3 { box-shadow: inset 0 -0.07em rgba(128, 128, 128, 0.3); }
.nmd-small { opacity: 0.7; }
.nmd-other { border-bottom: 2px dashed currentColor; background-color: rgba(128, 128, 128, 0.3); }
#note-edit-textarea::selection, #note-edit-title-textarea::selection, .note-table-split-text::selection, .note-table-field-seg > .note-table-field::selection { color: transparent; background: rgba(74, 144, 226, 0.35); }
.modal-edit-toolbar-btn.is-sticky { background: #4a90e2; border-color: #4a90e2; color: #fff; }
`;
    document.head.appendChild(style);
}

function getNoteMdSymbols() {
    const sym = (key, def) => (localStorage.getItem(key) || def).trim();
    return {
        bold: sym('mdBold', '**'), italic: sym('mdItalic', '*'), underline: sym('mdUnderline', '_'),
        strike: sym('mdStrike', '~~'), clear: sym('mdClear', '--'), bullet: sym('mdBullet', '-') || '-'
    };
}

// A list item line: indent, marker ("-", "•", "+", the mdBullet symbol, or "12."), one space.
function matchNoteListLine(line) {
    const bullet = getNoteMdSymbols().bullet;
    const bullets = ['-', '•', '+', bullet].filter((b, i, a) => b && a.indexOf(b) === i)
        .map(b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const m = new RegExp(`^([ \\t]*)(?:(${bullets.join('|')})|(\\d{1,4})\\.)( +)`).exec(line);
    if (!m) return null;
    return { indent: m[1], bullet: m[2] || null, number: m[3] !== undefined ? parseInt(m[3], 10) : null, prefix: m[0] };
}

// Hanging indent for the continuation of a list item in the note view: the width of the list
// marker (processNoteContent wraps each item in a .nmd-li block). The editor has none.
function getNoteListHangingIndent(text, el) {
    if (!text || !el) return 0;
    const prefixes = [];
    String(text).split('\n').forEach(line => {
        const m = matchNoteListLine(line);
        if (m) prefixes.push(m);
    });
    if (!prefixes.length) return 0;
    const top = prefixes.filter(m => !m.indent);
    const cs = getComputedStyle(el);
    const canvas = getNoteListHangingIndent._canvas || (getNoteListHangingIndent._canvas = document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    if (!ctx) return 0;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const widths = (top.length ? top : prefixes).map(m => ctx.measureText(m.prefix.replace(/\t/g, '    ')).width);
    return Math.round((top.length ? Math.max(...widths) : Math.min(...widths)) * 10) / 10;
}

function getNoteEditColorCss(paramint) {
    let aVal = (paramint >> 24) & 0xff;
    if (aVal === 0 && (paramint & 0x00ffffff) !== 0) aVal = 255;
    return `rgba(${(paramint >> 16) & 0xff}, ${(paramint >> 8) & 0xff}, ${paramint & 0xff}, ${aVal / 255})`;
}

// Draws the text with its formats into the backdrop under the transparent textarea.
function renderNoteEditBackdrop(backdrop, text, formats) {
    ensureNoteMdStyles();
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const valid = (formats || []).filter(f => f && Number.isFinite(f.start) && Number.isFinite(f.end) && f.end > f.start);
    const points = new Set([0, text.length]);
    valid.forEach(f => {
        points.add(Math.max(0, Math.min(text.length, f.start)));
        points.add(Math.max(0, Math.min(text.length, f.end)));
    });
    const sortedPoints = Array.from(points).sort((a, b) => a - b);
    let html = '';
    for (let i = 0; i < sortedPoints.length - 1; i++) {
        const start = sortedPoints[i];
        const end = sortedPoints[i + 1];
        const segment = text.substring(start, end);
        if (!segment) continue;
        const active = valid.filter(f => f.start <= start && f.end >= end).sort((a, b) => a.type - b.type);
        if (!active.length) { html += esc(segment); continue; }
        const classes = new Set();
        const css = [];
        const deco = [];
        let italic = false;
        active.forEach(f => {
            switch (f.type) {
                case 1: classes.add('nmd-b'); break;
                case 2: italic = true; break;
                case 3: deco.push('underline'); break;
                case 7: deco.push('line-through'); break;
                case 4: css.push(`color: ${getNoteEditColorCss(f.paramint)}`); break;
                case 5: css.push(`background-color: ${getNoteEditColorCss(f.paramint)}`); break;
                case 6:
                    if (f.paramfloat > 1) {
                        classes.add('nmd-h');
                        if (f.paramfloat < 1.15) classes.add('nmd-h3');
                        else if (f.paramfloat < 1.25) classes.add('nmd-h2');
                    } else if (f.paramfloat > 0 && f.paramfloat < 1) {
                        classes.add('nmd-small');
                    }
                    break;
                default: classes.add('nmd-other'); break;
            }
        });
        if (deco.length) css.push(`text-decoration-line: ${[...new Set(deco)].join(' ')}`);
        const open = (classes.size || css.length)
            ? `<span${classes.size ? ` class="${[...classes].join(' ')}"` : ''}${css.length ? ` style="${css.join('; ')}"` : ''}>`
            : '';
        const wrap = (t) => open ? open + esc(t) + '</span>' : esc(t);
        if (italic) {
            // A slant per word: an inline-block keeps the width of the word, and the line still
            // breaks only at the spaces, where the textarea breaks it.
            html += segment.split(/(\s+)/).map(part => {
                if (!part) return '';
                return /^\s+$/.test(part) ? wrap(part) : `<span class="nmd-i">${wrap(part)}</span>`;
            }).join('');
        } else {
            html += wrap(segment);
        }
    }
    backdrop.innerHTML = html + (text.endsWith('\n') ? '\n ' : '');
}

// The backdrop has no scrollbar: it gets the textarea's scrollbar width as padding, so both wrap
// the lines at the same width. No text-indent in the editor: a textarea does not apply
// "hanging each-line" the way a div does, so the caret would drift from the letters.
function syncNoteEditBackdropBox(textarea, backdrop) {
    if (!textarea || !backdrop) return;
    const sb = Math.max(0, textarea.offsetWidth - textarea.clientWidth);
    const pad = parseFloat(textarea.style.paddingRight || getComputedStyle(textarea).paddingRight) || 0;
    const value = (pad + sb) + 'px';
    if (backdrop.style.paddingRight !== value) backdrop.style.paddingRight = value;
    syncNoteEditBackdropOffset(textarea, backdrop);
}

// The backdrop is not scrolled: it keeps its full height and is moved up by the field's
// scrollTop with a transform, which the compositor applies without re-rastering the text.
function syncNoteEditBackdropOffset(textarea, backdrop) {
    if (!textarea || !backdrop) return;
    const y = -textarea.scrollTop;
    if (backdrop._lastY === y) return;
    backdrop._lastY = y;
    backdrop.style.transform = `translate3d(0, ${y}px, 0)`;
}

function getNoteEditModalBody(field) {
    return (field && field.closest && field.closest('#modal-body, #conflict-modal-body')) || document.getElementById('modal-body');
}
function readNoteEditFormats(modalBodyElem, key) {
    const fmtStr = modalBodyElem?.dataset[key];
    if (!fmtStr || fmtStr.trim() === '') return [];
    return fmtStr.split('|').map(p => {
        try { return JSON.parse(p); } catch (e) { return null; }
    }).filter(f => f && f.start !== undefined);
}
function writeNoteEditFormats(modalBodyElem, key, formats) {
    if (modalBodyElem) modalBodyElem.dataset[key] = formats.map(f => JSON.stringify(f)).join('|');
}

// Where an edit field keeps its text and formats: the note textarea itself, the title, or a text
// piece of the ▦ table fields (offset = where the piece starts in the note textarea).
function getNoteEditContext(field) {
    if (!field) return null;
    if (field.id === 'note-edit-textarea' || field.id === 'note-edit-title-textarea') {
        const isTitle = field.id === 'note-edit-title-textarea';
        return {
            field, main: field, off: 0, split: null,
            key: isTitle ? 'titleFormat' : 'format',
            modalBody: getNoteEditModalBody(field),
            backdrop: document.getElementById(field.id + '-backdrop')
        };
    }
    if (isNoteTableSplitText(field) || (field.classList && field.classList.contains('note-table-field'))) {
        const split = field.closest('.note-table-split');
        const piece = split?._pieces?.find(p => p.el === field);
        if (!split || !piece) return null;
        return {
            field, main: split._main, off: getNotePieceOffset(split._pieces, piece), split, key: 'format',
            modalBody: getNoteEditModalBody(split._main),
            backdrop: document.getElementById(split._main.id + '-backdrop')
        };
    }
    return null;
}

// Redraws after a change of the formats only.
function refreshNoteEditBackdrops(ctx) {
    if (!ctx) return;
    if (ctx.backdrop) handleEditInput(ctx.main, ctx.backdrop);
    const split = ctx.split || getNoteTableSplit(ctx.main);
    if (split) renderNoteTableSplitBackdrops(split);
}

// Replaces field[start, end) with str (field positions) as one edit: the formats are moved
// exactly (not by the caret guess of handleEditInput), the browser keeps it in its undo history
// where it can, and the caret goes to 'caret' (default: the end of str).
function noteEditReplace(field, start, end, str, caret) {
    const ctx = getNoteEditContext(field);
    if (!ctx) return;
    const oldValue = field.value;
    const newValue = oldValue.slice(0, start) + str + oldValue.slice(end);
    const delta = str.length - (end - start);
    const S = ctx.off + start, E = ctx.off + end;
    const map = (p) => p <= S ? p : (p >= E ? p + delta : S);
    const formats = readNoteEditFormats(ctx.modalBody, ctx.key);
    formats.forEach(f => { f.start = map(f.start); f.end = map(f.end); });
    writeNoteEditFormats(ctx.modalBody, ctx.key, formats);
    const mainOld = ctx.main.value;
    ctx.main.dataset.lastVal = mainOld.slice(0, S) + str + mainOld.slice(E);
    const wasApplying = noteMdApplying;
    noteMdApplying = true;
    try {
        let done = false;
        if (document.activeElement === field && typeof document.execCommand === 'function') {
            field.setSelectionRange(start, end);
            try {
                done = str ? document.execCommand('insertText', false, str) : (start === end || document.execCommand('delete', false));
            } catch (e) { done = false; }
            if (done && field.value !== newValue) {
                field.value = newValue;
                done = false;
            }
        }
        if (!done) {
            if (field.value !== newValue) field.value = newValue;
            field.dispatchEvent(new Event('input', { bubbles: true }));
        }
        const pos = caret === undefined ? start + str.length : caret;
        field.setSelectionRange(pos, pos);
    } finally {
        noteMdApplying = wasApplying;
    }
    refreshNoteEditBackdrops(ctx);
}

// Adds [s, e) of a type to the formats, joined with the ranges of that type it touches.
function addNoteFormatRange(formats, s, e, type, paramfloat = 0) {
    if (e <= s) return formats;
    let start = s, end = e;
    const rest = [];
    formats.forEach(f => {
        if (f.type === type && (f.paramint || 0) === 0 && (f.paramfloat || 0) === paramfloat && f.start <= end && f.end >= start) {
            start = Math.min(start, f.start);
            end = Math.max(end, f.end);
        } else {
            rest.push(f);
        }
    });
    rest.push({ start, end, type, paramint: 0, paramfloat });
    return rest;
}
// Colour ranges (4 text, 5 background): one colour per position. [s, e) is cut out of the ranges
// of that type with another colour, and joined with the ranges of the same colour it touches
// (so typing with a pending colour grows one range instead of adding one per keystroke).
function addNoteColorRange(formats, s, e, type, colorInt) {
    if (e <= s) return formats;
    const color = colorInt | 0;
    let start = s, end = e;
    const rest = [];
    formats.forEach(f => {
        if (f.type !== type || f.end < s || f.start > e) { rest.push(f); return; }
        if ((f.paramint | 0) === color) {
            start = Math.min(start, f.start);
            end = Math.max(end, f.end);
            return;
        }
        if (f.start < s) rest.push({ ...f, end: Math.min(f.end, s) });
        if (f.end > e) rest.push({ ...f, start: Math.max(f.start, e) });
    });
    rest.push({ start, end, type, paramint: color, paramfloat: 0 });
    return rest;
}
// Takes [s, e) out of the formats that match: they are cut, the parts outside stay.
function removeNoteFormatRange(formats, s, e, test) {
    const out = [];
    formats.forEach(f => {
        if (!test(f) || f.end <= s || f.start >= e) { out.push(f); return; }
        if (f.start < s) out.push({ ...f, end: s });
        if (f.end > e) out.push({ ...f, start: e });
    });
    return out;
}
function isNoteRangeCovered(formats, s, e, type) {
    const ranges = formats.filter(f => f.type === type && f.end > s && f.start < e).sort((a, b) => a.start - b.start);
    let pos = s;
    for (const f of ranges) {
        if (f.start > pos) return false;
        pos = Math.max(pos, f.end);
        if (pos >= e) return true;
    }
    return pos >= e;
}

function getNoteStickyKey() {
    const mb = document.getElementById('modal-body');
    return mb ? `${mb.dataset.gdid || ''}|${mb.dataset.id || ''}` : '';
}
function updateNoteStickyButtons() {
    const map = { 1: 'is-bold', 2: 'is-italic', 3: 'is-underline', 7: 'is-strike' };
    Object.entries(map).forEach(([type, cls]) => {
        document.querySelectorAll(`#content-modal .modal-edit-toolbar-btn.${cls}`).forEach(btn => {
            const on = noteStickyFormats.has(Number(type));
            btn.classList.toggle('is-sticky', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
    });
}

function handleEditInput(textarea, backdrop) {
    const modalBodyElem = getNoteEditModalBody(textarea);
    if (!modalBodyElem) return;

    const isTitle = textarea.id === 'note-edit-title-textarea';
    const storageKey = isTitle ? 'titleFormat' : 'format';
    let formats = readNoteEditFormats(modalBodyElem, storageKey);

    const text = textarea.value;
    const lastVal = textarea.dataset.lastVal !== undefined ? textarea.dataset.lastVal : text;
    const diff = text.length - lastVal.length;
    const pos = textarea.selectionStart;

    if (diff > 0) {
        const P = pos - diff;
        const L = diff;
        const inserted = text.substr(P, L);
        formats.forEach(f => {
            if (f.type === 6 && P >= f.start && P <= f.end) {
                // A heading is its line: typing in it (also at its edges) stays heading, a new
                // line ends it there.
                if (inserted.indexOf('\n') === -1) f.end += L;
                else if (P === f.start) { f.start += L; f.end += L; }
                else f.end = P;
                return;
            }
            if (P <= f.start) { f.start += L; f.end += L; }
            else if (P < f.end) { f.end += L; }
        });
        // Sticky mode: what is typed now gets the switched-on formats.
        noteStickyFormats.forEach(type => { formats = addNoteFormatRange(formats, P, P + L, type); });
        [4, 5].forEach(type => {
            if (noteStickyColors[type] !== null) formats = addNoteColorRange(formats, P, P + L, type, noteStickyColors[type]);
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
        writeNoteEditFormats(modalBodyElem, storageKey, formats);
    }

    renderNoteEditBackdrop(backdrop, text, formats);
    syncNoteEditBackdropBox(textarea, backdrop);
}

// --- Markdown input in the editor ---
// A closed pair (**, *, _, ~~, -- and "# " at a line start) disappears as soon as its closing
// marker is typed and the text between gets the format (-- clears it). "+ " / "- " at a line start
// becomes the mdBullet symbol, Enter continues a list item (numbers go on), Enter on an empty item
// ends the list. Our own edits run through noteEditReplace with noteMdApplying set.
function applyNoteMdPair(field, caret) {
    const ctx = getNoteEditContext(field);
    if (!ctx) return false;
    const text = field.value;
    const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
    const sym = getNoteMdSymbols();
    const rules = [
        { s: sym.bold, t: 1 }, { s: sym.strike, t: 7 }, { s: sym.clear, t: 0 },
        { s: sym.italic, t: 2 }, { s: sym.underline, t: 3 }
    ].filter(r => r.s).sort((a, b) => b.s.length - a.s.length);
    const isAlnum = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
    for (const rule of rules) {
        const s = rule.s;
        const closeStart = caret - s.length;
        if (closeStart <= lineStart || text.slice(closeStart, caret) !== s) continue;
        if (rule.t === 0) {
            // The dashes of a Markdown table separator row are the table, not a marker.
            let lineEnd = text.indexOf('\n', caret);
            if (lineEnd === -1) lineEnd = text.length;
            const line = text.slice(lineStart, lineEnd);
            if (line.includes('|') && /^[\s|:\-]*$/.test(line)) continue;
        }
        const single = s.length === 1;
        // A one-char marker that is a piece of a longer one (the * of **) is not this pair.
        if (single && text[closeStart - 1] === s) continue;
        let open = text.lastIndexOf(s, closeStart - 1);
        while (open >= lineStart) {
            const content = text.slice(open + s.length, closeStart);
            const okOpen = !single || (text[open - 1] !== s && text[open + 1] !== s);
            const okUnderscore = s !== '_' || (!isAlnum(text[open - 1]) && !isAlnum(text[caret]));
            if (open + s.length <= closeStart && content && okOpen && okUnderscore &&
                !/^\s/.test(content) && !/\s$/.test(content)) break;
            open = open > lineStart ? text.lastIndexOf(s, open - 1) : -1;
        }
        if (open < lineStart) continue;
        if (open + s.length > closeStart) continue;
        noteEditReplace(field, closeStart, caret, '');
        noteEditReplace(field, open, open + s.length, '', closeStart - s.length);
        const S = ctx.off + open, E = ctx.off + closeStart - s.length;
        let formats = readNoteEditFormats(ctx.modalBody, ctx.key);
        if (rule.t === 0) formats = removeNoteFormatRange(formats, S, E, () => true);
        else formats = addNoteFormatRange(formats, S, E, rule.t);
        writeNoteEditFormats(ctx.modalBody, ctx.key, formats);
        refreshNoteEditBackdrops(ctx);
        return true;
    }
    return false;
}

function applyNoteMdLineStart(field, caret) {
    const ctx = getNoteEditContext(field);
    if (!ctx) return false;
    const text = field.value;
    const lineStart = text.lastIndexOf('\n', caret - 1) + 1;
    const before = text.slice(lineStart, caret);
    const heading = /^(#{1,6}) $/.exec(before);
    if (heading) {
        noteEditReplace(field, lineStart, caret, '', lineStart);
        let lineEnd = field.value.indexOf('\n', lineStart);
        if (lineEnd === -1) lineEnd = field.value.length;
        const S = ctx.off + lineStart, E = ctx.off + lineEnd;
        let formats = readNoteEditFormats(ctx.modalBody, ctx.key);
        formats = formats.filter(f => !(f.type === 6 && f.start <= E && f.end >= S));
        formats.push({ start: S, end: E, type: 6, paramint: 0, paramfloat: NOTE_HEADER_SCALES[heading[1].length - 1] });
        writeNoteEditFormats(ctx.modalBody, ctx.key, formats);
        refreshNoteEditBackdrops(ctx);
        return true;
    }
    const bullet = /^([ \t]*)([+-]) $/.exec(before);
    if (bullet) {
        const sym = getNoteMdSymbols().bullet;
        if (bullet[2] !== sym) {
            const at = lineStart + bullet[1].length;
            noteEditReplace(field, at, at + 1, sym, at + sym.length + 1);
        }
        return true;
    }
    return false;
}

// Called after a line break was typed at caret.
function applyNoteMdListEnter(field, caret) {
    const text = field.value;
    if (text[caret - 1] !== '\n') return false;
    const prevStart = text.lastIndexOf('\n', caret - 2) + 1;
    const prevLine = text.slice(prevStart, caret - 1);
    const m = matchNoteListLine(prevLine);
    if (!m) return false;
    let curEnd = text.indexOf('\n', caret);
    if (curEnd === -1) curEnd = text.length;
    if (matchNoteListLine(text.slice(caret, curEnd))) return false; // the new line already is an item
    if (prevLine.length === m.prefix.length) {
        // Enter on an empty item: the list ends, the empty item becomes an empty line.
        noteEditReplace(field, prevStart, caret, '', prevStart);
        return true;
    }
    if (m.number === null) {
        const marker = `${m.indent}${m.bullet} `;
        noteEditReplace(field, caret, caret, marker);
        return true;
    }
    const marker = `${m.indent}${m.number + 1}. `;
    noteEditReplace(field, caret, caret, marker);
    // The numbered items right after go on from here.
    const caretAfter = field.selectionStart;
    let expected = m.number + 2;
    let lineStart = field.value.indexOf('\n', caretAfter);
    while (lineStart !== -1) {
        lineStart += 1;
        const value = field.value;
        let lineEnd = value.indexOf('\n', lineStart);
        if (lineEnd === -1) lineEnd = value.length;
        const lm = matchNoteListLine(value.slice(lineStart, lineEnd));
        if (!lm || lm.number === null || lm.indent !== m.indent) break;
        if (lm.number !== expected) {
            const numStart = lineStart + lm.indent.length;
            noteEditReplace(field, numStart, numStart + String(lm.number).length, String(expected), caretAfter);
        }
        expected++;
        lineStart = field.value.indexOf('\n', lineStart);
    }
    field.setSelectionRange(caretAfter, caretAfter);
    return true;
}

function isNoteMdField(el) {
    return !!el && (el.id === 'note-edit-textarea' || el.id === 'note-edit-title-textarea' || isNoteTableSplitText(el) || (el.classList && el.classList.contains('note-table-field')));
}

// The editor keeps the text WITHOUT Markdown markers and every format as a range, for every note,
// a note with a Markdown table included: the table is split into raw fields (pipes, alignment and
// separator dashes are plain text) and B/I/U/S apply as ranges there too, never literal symbols.
// The ranges survive the save (postEdit keeps them for table notes). Stored text of an older note
// that already carries literal markers keeps them until that fragment is edited away.
function noteEditKeepsFormats(field) {
    return !!getNoteEditContext(field);
}

function runNoteMdInputRules(field) {
    if (field.selectionStart !== field.selectionEnd) return;
    const caret = field.selectionStart;
    const ch = field.value[caret - 1];
    if (!ch) return;
    if (ch === '\n') { applyNoteMdListEnter(field, caret); return; }
    const keepsFormats = noteEditKeepsFormats(field);
    if (ch === ' ') {
        const before = field.value.slice(field.value.lastIndexOf('\n', caret - 1) + 1, caret);
        if (!keepsFormats && /^#{1,6} $/.test(before)) return;
        if (applyNoteMdLineStart(field, caret)) return;
    }
    if (keepsFormats) applyNoteMdPair(field, caret);
}

document.addEventListener('input', (e) => {
    if (noteMdApplying || !isNoteMdField(e.target) || e.isComposing) return;
    const type = e.inputType || '';
    if (type !== 'insertText' && type !== 'insertLineBreak' && type !== 'insertParagraph' && type !== 'insertCompositionText') return;
    runNoteMdInputRules(e.target);
});
document.addEventListener('compositionend', (e) => {
    if (noteMdApplying || !isNoteMdField(e.target)) return;
    const field = e.target;
    // The committed text is in the field right after this event.
    setTimeout(() => { if (document.activeElement === field) runNoteMdInputRules(field); }, 0);
});
// Backspace at the start of a heading line takes the heading off (there is no "# " to delete).
document.addEventListener('beforeinput', (e) => {
    if (noteMdApplying || e.inputType !== 'deleteContentBackward' || !isNoteMdField(e.target)) return;
    const field = e.target;
    if (field.selectionStart !== field.selectionEnd) return;
    const caret = field.selectionStart;
    const lineStart = field.value.lastIndexOf('\n', caret - 1) + 1;
    if (caret !== lineStart) return;
    const ctx = getNoteEditContext(field);
    if (!ctx) return;
    let lineEnd = field.value.indexOf('\n', lineStart);
    if (lineEnd === -1) lineEnd = field.value.length;
    const S = ctx.off + lineStart, E = ctx.off + lineEnd;
    const formats = readNoteEditFormats(ctx.modalBody, ctx.key);
    const kept = formats.filter(f => !(f.type === 6 && f.start <= S && f.end >= S && (f.end > S || E === S)));
    if (kept.length === formats.length) return;
    e.preventDefault();
    writeNoteEditFormats(ctx.modalBody, ctx.key, kept);
    refreshNoteEditBackdrops(ctx);
});

function getActiveModalEditor() {
    const activeElement = document.activeElement;
    if (isNoteEditBodyField(activeElement) || activeElement?.id === 'note-edit-title-textarea') {
        return activeElement;
    }
    return document.getElementById('note-edit-textarea') || document.getElementById('note-edit-title-textarea');
}

function getVisualLineEdge(textarea, pos, paraStart, paraEnd, moveToEnd) {
    if (!textarea || paraStart >= paraEnd) return paraStart;
    const text = textarea.value;
    if (!text) return 0;
    const styles = getComputedStyle(textarea);
    const mirror = document.createElement('div');
    const stylesToCopy = [
        'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
        'lineHeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
        'boxSizing', 'wordWrap', 'wordBreak', 'tabSize'
    ];
    stylesToCopy.forEach(prop => { mirror.style[prop] = styles[prop]; });
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.left = '-9999px';
    mirror.style.top = '0';
    mirror.style.height = 'auto';
    mirror.style.overflow = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.overflowWrap = 'break-word';
    mirror.style.width = textarea.clientWidth + 'px';
    mirror.style.boxSizing = 'border-box';
    mirror.style.border = 'none';
    const textNode = document.createTextNode(text);
    mirror.appendChild(textNode);
    document.body.appendChild(mirror);
    const range = document.createRange();
    const getCharTop = (idx) => {
        const clampedIdx = Math.max(0, Math.min(idx, text.length - 1));
        range.setStart(textNode, clampedIdx);
        range.setEnd(textNode, clampedIdx + 1);
        const rects = range.getClientRects();
        const r = rects.length > 0 ? rects[0] : range.getBoundingClientRect();
        return Math.round(r.top);
    };
    const charIdx = (pos < paraEnd) ? pos : Math.max(paraStart, paraEnd - 1);
    const targetTop = getCharTop(charIdx);
    let result = pos;
    if (!moveToEnd) {
        let low = paraStart;
        let high = charIdx;
        result = charIdx;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (Math.abs(getCharTop(mid) - targetTop) < 4) {
                result = mid;
                high = mid - 1;
            } else {
                low = mid + 1;
            }
        }
    } else {
        let low = charIdx;
        let high = paraEnd - 1;
        let vEndChar = charIdx;
        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (Math.abs(getCharTop(mid) - targetTop) < 4) {
                vEndChar = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }
        result = vEndChar + 1;
        if (result < paraEnd && text[result - 1] === ' ') {
            result--;
        }
    }
    document.body.removeChild(mirror);
    return result;
}

function moveCaretToLineEdge(textarea, moveToEnd, isParagraph = false) {
    if (!textarea) return;
    const text = textarea.value;
    const caretPosition = textarea.selectionStart;
    const lineStart = text.lastIndexOf('\n', Math.max(0, caretPosition - 1)) + 1;
    const nextLineBreak = text.indexOf('\n', caretPosition);
    const lineEnd = nextLineBreak === -1 ? text.length : nextLineBreak;
    const nextPosition = isParagraph ? (moveToEnd ? lineEnd : lineStart) : getVisualLineEdge(textarea, caretPosition, lineStart, lineEnd, moveToEnd);
    textarea.focus();
    textarea.setSelectionRange(nextPosition, nextPosition);
    scrollCaretIntoView(textarea);
}

function moveCaretByOne(textarea, delta) {
    if (!textarea) return;
    const nextPosition = Math.max(0, Math.min(textarea.value.length, textarea.selectionStart + delta));
    textarea.focus();
    textarea.setSelectionRange(nextPosition, nextPosition);
    scrollCaretIntoView(textarea);
}

function restoreModalHeaderListButtons() {
    const headerButtons = document.querySelector('#content-modal .modal-header-buttons');
    ['bullet-list-btn', 'numbered-list-btn'].forEach((buttonId) => {
        const button = document.getElementById(buttonId);
        if (!button || !headerButtons) return;
        button.style.display = 'none';
        headerButtons.appendChild(button);
    });
}

// --- Markdown table alignment (edit toolbar ▦) ---
// Finds the tables the preview parser would draw and describes each row by its cells
// (start/end = character range of the table's lines, for finding the table under the caret),
// using the same masking as parseAllMarkdownTables for {{...}}, ```...``` and `...`.
function collectAlignableMarkdownTables(text) {
    if (!text || !text.includes('|')) return [];
    let masked = text.replace(/\{\{([\s\S]*?)\}\}/g, m => m.replace(/[^\r\n]/g, ' '));
    masked = masked.replace(/```([\s\S]*?)```/g, m => m.replace(/[^\r\n]/g, ' '));
    masked = masked.replace(/`([^`\r\n]+)`/g, m => ' '.repeat(m.length));
    const lines = [];
    let offset = 0;
    text.split('\n').forEach((raw) => {
        const content = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
        const maskedLine = masked.substr(offset, content.length);
        lines.push({ raw: content, masked: maskedLine, offset, hasPipe: maskedLine.includes('|') });
        offset += raw.length + 1;
    });
    const isSeparator = (maskedLine) => {
        const cells = maskedLine.split('|').map(cell => cell.trim()).filter(Boolean);
        return cells.length > 0 && cells.every(isMarkdownTableSeparatorCell);
    };
    // Like the preview parser, a row may lack its leading and/or trailing |; openLead/openTrail
    // mark that, and the first/last cell then starts/ends at the row's first/last visible character.
    const parseRow = (line) => {
        const count = (s) => s.split('|').length - 1;
        const trimmed = line.raw.trim();
        // Pipes hidden by the masking (inside {{...}} or backticks) and escaped pipes leave the
        // row exactly as written.
        if (count(line.raw) !== count(line.masked) || line.raw.includes('\\|') || trimmed === '|') {
            return null;
        }
        const textStart = line.raw.length - line.raw.replace(/^\s+/, '').length;
        const textEnd = line.raw.replace(/\s+$/, '').length;
        const openLead = !trimmed.startsWith('|');
        const openTrail = !trimmed.endsWith('|');
        const bounds = [];
        for (let i = 0; i < line.raw.length; i++) if (line.raw[i] === '|') bounds.push(i);
        if (openLead) bounds.unshift(textStart - 1);
        if (openTrail) bounds.push(textEnd);
        const cells = [];
        for (let b = 0; b + 1 < bounds.length; b++) {
            const start = bounds[b] + 1;
            const segment = line.raw.slice(start, bounds[b + 1]);
            const lead = segment.length - segment.replace(/^\s+/, '').length;
            const value = segment.trim();
            cells.push({
                start: line.offset + start,
                end: line.offset + bounds[b + 1],
                valueStart: line.offset + start + lead,
                valueEnd: line.offset + start + lead + value.length,
                value
            });
        }
        cells.openLead = openLead;
        cells.openTrail = openTrail;
        cells.lineEnd = line.offset + line.raw.length;
        return cells;
    };
    const tables = [];
    let i = 0;
    while (i < lines.length) {
        if (!lines[i].hasPipe) { i++; continue; }
        let runEnd = i;
        while (runEnd + 1 < lines.length && lines[runEnd + 1].hasPipe) runEnd++;
        let sep = -1;
        for (let j = i + 1; j <= runEnd; j++) {
            if (isSeparator(lines[j].masked)) { sep = j; break; }
        }
        if (sep !== -1) {
            const header = parseRow(lines[sep - 1]);
            const separator = parseRow(lines[sep]);
            if (header && separator) {
                const rows = [{ cells: header, isSeparator: false }, { cells: separator, isSeparator: true }];
                for (let j = sep + 1; j <= runEnd; j++) {
                    const cells = parseRow(lines[j]);
                    if (cells) rows.push({ cells, isSeparator: false });
                }
                const last = lines[runEnd];
                // Column count as the preview draws it: shorter rows are padded with empty cells.
                // The separator row is not counted (the preview draws the header and the data rows
                // only), so a divider with a surplus cell (| - | :-: | - |) cannot add a column that
                // every row then gets padded with.
                const columns = Math.max(...rows.filter(row => !row.isSeparator).map(row => row.cells.length));
                tables.push({ rows, columns, start: lines[sep - 1].offset, end: last.offset + last.raw.length });
            }
        }
        i = runEnd + 1;
    }
    return tables;
}

// Returns the whitespace/dash replacements that bring one table to 'aligned' or 'compact' form.
// Cell text is never part of a replacement, so a cell edited between two presses survives.
// Both forms add a row's missing outer | (the compact form with compact spacing), so every row
// of the table ends up with both pipes; neither form ever removes an outer |.
// A row with fewer cells than the table's column count gets the missing empty cells and its
// closing | (replacing any whitespace after its last |), so every row has the full cell count.
function getMarkdownTableEdits(text, table, mode) {
    const len = (s) => Array.from(s).length;
    const separator = table.rows.find(row => row.isSeparator);
    const aligns = separator.cells.map(cell => ({
        left: cell.value.startsWith(':'),
        right: cell.value.length > 1 && cell.value.endsWith(':')
    }));
    const alignOf = (c) => aligns[c] || { left: false, right: false };
    const widths = [];
    table.rows.forEach(row => row.cells.forEach((cell, c) => {
        const a = alignOf(c);
        const w = row.isSeparator ? 1 + (a.left ? 1 : 0) + (a.right ? 1 : 0) : len(cell.value);
        widths[c] = Math.max(widths[c] || 0, w);
    }));
    // Missing cells of a row shorter than the table, written after its last closing |.
    const columns = table.columns || 0;
    for (let c = 0; c < columns; c++) widths[c] = Math.max(widths[c] || 0, 1);
    const missingCells = (row) => {
        let missing = '';
        for (let c = row.cells.length; c < columns; c++) {
            if (row.isSeparator) {
                const a = alignOf(c);
                const colons = (a.left ? 1 : 0) + (a.right ? 1 : 0);
                const dashes = mode === 'aligned' ? widths[c] - colons : 1;
                missing += ' ' + (a.left ? ':' : '') + '-'.repeat(dashes) + (a.right ? ':' : '') + ' |';
            } else {
                missing += ' ' + (mode === 'aligned' ? ' '.repeat(widths[c] + 1) : '') + '|';
            }
        }
        return missing;
    };
    const edits = [];
    const replace = (start, end, replacement) => {
        if (text.slice(start, end) !== replacement) edits.push({ start, end, text: replacement });
    };
    table.rows.forEach(row => row.cells.forEach((cell, c) => {
        const a = alignOf(c);
        // A missing outer | is added in both forms (the compact form writes it dense, '| ' / ' |').
        // Neither form ever removes one.
        const openStart = c === 0 && row.cells.openLead;
        const openEnd = c === row.cells.length - 1 && row.cells.openTrail;
        const edge = (space, pipe, open) => (open ? pipe : space);
        const short = c === row.cells.length - 1 && row.cells.length < columns;
        if (row.isSeparator) {
            const colons = (a.left ? 1 : 0) + (a.right ? 1 : 0);
            const dashes = mode === 'aligned' ? widths[c] - colons : 1;
            replace(cell.start, openEnd && short ? row.cells.lineEnd : cell.end, edge(' ', '| ', openStart)
                + (a.left ? ':' : '') + '-'.repeat(dashes) + (a.right ? ':' : '') + edge(' ', ' |', openEnd)
                + (openEnd && short ? missingCells(row) : ''));
            return;
        }
        // The borderless-table marker is written tight, as |%%|, in the compact form.
        const isBorderlessMarker = row === table.rows[0] && c === 0 && cell.value === '%%';
        let lead = isBorderlessMarker ? '' : ' ';
        let trail = cell.value && !isBorderlessMarker ? ' ' : '';
        if (mode === 'aligned') {
            const gap = widths[c] - len(cell.value);
            let before = 0;
            if (a.left && a.right) before = Math.floor(gap / 2);
            else if (a.right) before = gap;
            lead = ' '.repeat(before + 1);
            trail = ' '.repeat(gap - before + 1);
        }
        // Open edge: the missing | goes in front of / after the spacing of either form.
        if (openStart) lead = '|' + lead;
        // A short open row: the closing |, the missing cells and no trailing whitespace, in one edit.
        const end = openEnd && short ? row.cells.lineEnd : cell.end;
        if (openEnd) trail = trail + '|' + (short ? missingCells(row) : '');
        if (!cell.value) {
            replace(cell.start, end, lead + trail);
            return;
        }
        replace(cell.start, cell.valueStart, lead);
        replace(cell.valueEnd, end, trail);
    }));
    // A short row that already ends with |: the missing cells replace whatever follows that |.
    table.rows.forEach(row => {
        const count = row.cells.length;
        if (!count || count >= columns || row.cells.openTrail) return;
        replace(row.cells[count - 1].end + 1, row.cells.lineEnd, missingCells(row));
    });
    return edits;
}

// The table whose lines contain the caret offset, or null.
function findMarkdownTableAtOffset(tables, pos) {
    return tables.find(table => pos >= table.start && pos <= table.end) || null;
}

// Which tables the ▦ button works on: all of them for hold / Ctrl/⌘+click, otherwise the one
// under the caret. Caret outside every table: the only table, or all of them when there are
// several (so the click has a visible result). To make that case do nothing, return [] there.
function selectMarkdownTablesForAlignment(text, caret, all) {
    const tables = collectAlignableMarkdownTables(text);
    if (all) return tables;
    const current = findMarkdownTableAtOffset(tables, caret);
    if (current) return [current];
    return tables;
}

// Aligns the given tables (default: every table in the note), or returns them all to the compact
// form when each of them is already aligned. 'Already aligned' is read from the text itself,
// not from a saved copy.
// forceMode ('aligned' / 'compact') skips that reading and brings the tables to the given form.
function toggleMarkdownTablesAlignment(text, tables = collectAlignableMarkdownTables(text), forceMode) {
    if (!tables.length) return { text, edits: [], tableCount: 0, aligned: false };
    const allAligned = forceMode
        ? forceMode === 'compact'
        : tables.every(table => getMarkdownTableEdits(text, table, 'aligned').length === 0);
    const mode = allAligned ? 'compact' : 'aligned';
    const edits = tables.flatMap(table => getMarkdownTableEdits(text, table, mode)).sort((a, b) => b.start - a.start);
    let result = text;
    edits.forEach(edit => { result = result.slice(0, edit.start) + edit.text + result.slice(edit.end); });
    return { text: result, edits, tableCount: tables.length, aligned: !allAligned };
}


// Maps an offset through edits sorted from last to first (as returned above).
function mapOffsetThroughEdits(pos, edits) {
    edits.forEach(edit => {
        if (pos <= edit.start) return;
        if (pos >= edit.end) pos += edit.text.length - (edit.end - edit.start);
        else pos = edit.start + Math.min(pos - edit.start, edit.text.length);
    });
    return pos;
}
// One press of ▦ in the edit modal while no table field is open: align the tables it works on
// (see selectMarkdownTablesForAlignment) and return where each of them now lies, so an editable
// field can be shown in its place. Already aligned tables still get a field. No table -> nothing.
function planMarkdownTableFieldsOpen(text, caret, all) {
    const tables = selectMarkdownTablesForAlignment(text, caret, all);
    if (!tables.length) return { text, edits: [], tableCount: 0, ranges: [] };
    const result = toggleMarkdownTablesAlignment(text, tables, 'aligned');
    const after = collectAlignableMarkdownTables(result.text);
    const ranges = [];
    tables.forEach(table => {
        const start = mapOffsetThroughEdits(table.start, result.edits);
        const found = after.find(t => start >= t.start && start <= t.end);
        if (found && !ranges.some(r => r.start === found.start)) ranges.push({ start: found.start, end: found.end });
    });
    ranges.sort((x, y) => x.start - y.start);
    return { text: result.text, edits: result.edits, tableCount: ranges.length, ranges };
}
// Second press: the tables that were shown in fields (given by their ranges, which already hold
// whatever was typed in the fields) go back to compact: only the padding spaces and the separator
// dashes go, the cell text stays exactly as typed. A table no longer recognisable as one is left
// as it is. Any table lying in a field's range counts (typing may move or split it).
function planMarkdownTableFieldsClose(text, ranges) {
    const inRange = (t, r) => t.start === r.start || (t.start < r.end && t.end > r.start);
    const tables = collectAlignableMarkdownTables(text).filter(t => ranges.some(r => inRange(t, r)));
    if (!tables.length) return { text, edits: [], tableCount: 0 };
    const result = toggleMarkdownTablesAlignment(text, tables, 'compact');
    return { text: result.text, edits: result.edits, tableCount: tables.length };
}
// Cuts the note into pieces around the given table ranges. Joining every piece's value gives the
// text back byte for byte. 'sep' is the line break between a table and the text next to it: it is
// kept out of the text pieces so they do not show an extra empty line. A text piece exists only
// where there are lines next to a table (so a table at the very start has no text piece above it).
function splitNoteAtTableRanges(text, ranges) {
    const pieces = [];
    let pos = 0;
    ranges.forEach((r, i) => {
        let mid = text.slice(pos, r.start);
        const lead = i > 0 && mid.startsWith('\n') ? '\n' : '';
        mid = mid.slice(lead.length);
        const trail = mid.endsWith('\n') ? '\n' : '';
        mid = mid.slice(0, mid.length - trail.length);
        if (lead) pieces.push({ kind: 'sep', value: lead });
        if (lead || trail || mid) pieces.push({ kind: 'text', value: mid });
        if (trail) pieces.push({ kind: 'sep', value: trail });
        pieces.push({ kind: 'table', value: text.slice(r.start, r.end) });
        pos = r.end;
    });
    let rest = text.slice(pos);
    if (ranges.length && rest.startsWith('\n')) {
        pieces.push({ kind: 'sep', value: '\n' });
        rest = rest.slice(1);
        pieces.push({ kind: 'text', value: rest });
    } else if (rest) {
        pieces.push({ kind: 'text', value: rest });
    }
    return pieces;
}
function joinNotePieces(pieces) {
    return pieces.map(p => p.value).join('');
}
function getNotePieceOffset(pieces, piece) {
    let off = 0;
    for (const p of pieces) {
        if (p === piece) return off;
        off += p.value.length;
    }
    return -1;
}
// --- end markdown table alignment ---

// ▦ table fields. While they are open, the content editor is shown as a stack of pieces in its
// place: text field (before) + editable field with the aligned table + text field (after), and so
// on for each table. #note-edit-textarea stays the one source of truth: it keeps the whole note
// (hidden underneath), every edit in a text piece or a table field is written through to it at once
// and replayed as a single edit at the caret (the table text is never re-aligned while typing), so handleEditInput, dataset.format, the backdrop, save and preview work as
// before. The fields live only in this editor's DOM: a newly opened editor starts without them.
function getNoteTableSplit(textarea = document.getElementById('note-edit-textarea')) {
    return textarea?.parentElement?.querySelector(':scope > .note-table-split') || null;
}
function isNoteTableSplitText(el) {
    return !!el && !!el.classList && el.classList.contains('note-table-split-text');
}
// The content editor the caret is in: the note textarea itself, or a text piece while fields are open.
function isNoteEditBodyField(el) {
    return !!el && (el.id === 'note-edit-textarea' || isNoteTableSplitText(el) || (el.classList && el.classList.contains('note-table-field')));
}
function fitNoteTableSplitText(ta) {
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
}
// A table field is as tall as its rows plus the sideways scrollbar (CSS max-height caps it).
function fitNoteTableField(ta) {
    ta.style.height = 'auto';
    ta.style.height = (ta.scrollHeight + ta.offsetHeight - ta.clientHeight) + 'px';
    syncNoteTableFieldBackdrop(ta);
}
// The backdrop of a table field covers exactly the field's client box (no scrollbars) and scrolls with it.
function syncNoteTableFieldBackdrop(ta) {
    const backdrop = ta._backdrop;
    if (!backdrop) return;
    const cs = getComputedStyle(ta);
    const right = Math.max(0, ta.offsetWidth - ta.clientWidth - (parseFloat(cs.borderLeftWidth) || 0) - (parseFloat(cs.borderRightWidth) || 0)) + 'px';
    const bottom = Math.max(0, ta.offsetHeight - ta.clientHeight - (parseFloat(cs.borderTopWidth) || 0) - (parseFloat(cs.borderBottomWidth) || 0)) + 'px';
    if (backdrop.style.right !== right) backdrop.style.right = right;
    if (backdrop.style.bottom !== bottom) backdrop.style.bottom = bottom;
    if (backdrop.scrollLeft !== ta.scrollLeft) backdrop.scrollLeft = ta.scrollLeft;
    if (backdrop.scrollTop !== ta.scrollTop) backdrop.scrollTop = ta.scrollTop;
}
function fitNoteTableSplitPiece(piece) {
    if (piece.kind === 'table') fitNoteTableField(piece.el);
    else fitNoteTableSplitText(piece.el);
}
function getNoteBodyFormats() {
    const fmtStr = document.getElementById('modal-body')?.dataset.format;
    if (!fmtStr || fmtStr.trim() === '') return [];
    return fmtStr.split('|').map(p => {
        try { return JSON.parse(p); } catch (e) { return null; }
    }).filter(f => f && f.start !== undefined);
}
function renderNoteTableSplitBackdrops(split) {
    const formats = getNoteBodyFormats();
    split._pieces.forEach(piece => {
        if ((piece.kind !== 'text' && piece.kind !== 'table') || !piece.backdrop) return;
        const off = getNotePieceOffset(split._pieces, piece);
        const len = piece.value.length;
        const local = formats
            .map(f => ({ ...f, start: Math.max(0, f.start - off), end: Math.min(len, f.end - off) }))
            .filter(f => f.end > f.start);
        renderNoteEditBackdrop(piece.backdrop, piece.value, local);
        if (piece.kind === 'table') syncNoteTableFieldBackdrop(piece.el);
        else fitNoteTableSplitText(piece.el);
    });
}
// A text piece or a table field was edited: rebuild the whole note in the hidden textarea and
// replay it there.
function onNoteTableSplitTextInput(split, piece) {
    const main = split._main;
    piece.value = piece.el.value;
    const off = getNotePieceOffset(split._pieces, piece);
    const full = joinNotePieces(split._pieces);
    split._syncing = true;
    main.value = full;
    main.setSelectionRange(off + piece.el.selectionStart, off + piece.el.selectionEnd);
    main.dispatchEvent(new Event('input', { bubbles: true }));
    split._syncing = false;
    split._value = full;
    fitNoteTableSplitPiece(piece);
    renderNoteTableSplitBackdrops(split);
}
// Something else changed the hidden textarea (paste button, attachment link...). An edit inside
// one piece (text or table field) is carried over; one spanning pieces closes the fields. Either
// way nothing typed is lost: it is already in the hidden textarea.
function onNoteTableSplitMainInput(split) {
    if (split._syncing) return;
    const main = split._main;
    const oldText = split._value;
    const newText = main.value;
    if (oldText === newText) return;
    let p = 0;
    while (p < oldText.length && p < newText.length && oldText[p] === newText[p]) p++;
    let s = 0;
    while (s < oldText.length - p && s < newText.length - p && oldText[oldText.length - 1 - s] === newText[newText.length - 1 - s]) s++;
    const oldEnd = oldText.length - s;
    const piece = split._pieces.find(x => {
        if (x.kind === 'sep') return false;
        const off = getNotePieceOffset(split._pieces, x);
        return p >= off && oldEnd <= off + x.value.length;
    });
    if (!piece) {
        closeNoteTableSplit(main);
        updateTableAlignButtonState();
        return;
    }
    const off = getNotePieceOffset(split._pieces, piece);
    piece.value = newText.slice(off, off + piece.value.length + newText.length - oldText.length);
    piece.el.value = piece.value;
    split._value = newText;
    const caret = main.selectionStart - off;
    if (caret >= 0 && caret <= piece.value.length) {
        piece.el.setSelectionRange(caret, Math.min(piece.value.length, main.selectionEnd - off));
    }
    fitNoteTableSplitPiece(piece);
    renderNoteTableSplitBackdrops(split);
}
function openNoteTableSplit(main, ranges) {
    const container = main.parentElement;
    if (!container || !ranges.length) return null;
    closeNoteTableSplit(main);
    const scrollTop = main.scrollTop;
    const caret = main.selectionStart;
    const split = document.createElement('div');
    split.className = 'note-table-split';
    split._main = main;
    split._value = main.value;
    split._pieces = splitNoteAtTableRanges(main.value, ranges);
    const cs = main.style;
    split._pieces.forEach(piece => {
        if (piece.kind === 'sep') return;
        if (piece.kind === 'table') {
            // Editable like the text pieces: monospace, no wrapping, sideways scroll. Enter adds a
            // line, Tab moves on to the next part of the note (browser default).
            const field = document.createElement('textarea');
            field.className = 'note-table-field';
            field.value = piece.value;
            field.wrap = 'off';
            field.rows = 1;
            field.spellcheck = false;
            field.setAttribute('autocapitalize', 'off');
            field.setAttribute('autocomplete', 'off');
            field.setAttribute('autocorrect', 'off');
            field.addEventListener('input', () => onNoteTableSplitTextInput(split, piece));
            ['keyup', 'mouseup', 'touchend', 'focus'].forEach(type => field.addEventListener(type, updateTableAlignButtonState));
            // Like the text pieces: the backdrop draws the table with its formats, the field shows
            // the caret and the selection. Same box metrics, so the letters stay under the caret.
            const fieldSeg = document.createElement('div');
            fieldSeg.className = 'note-table-split-seg note-table-field-seg';
            const fieldBackdrop = document.createElement('div');
            fieldBackdrop.className = 'note-table-field-backdrop';
            field.style.color = 'transparent';
            field.style.caretColor = cs.caretColor || getComputedStyle(main).caretColor;
            field._backdrop = fieldBackdrop;
            field.addEventListener('scroll', () => syncNoteTableFieldBackdrop(field));
            piece.el = field;
            piece.backdrop = fieldBackdrop;
            piece.seg = fieldSeg;
            fieldSeg.appendChild(fieldBackdrop);
            fieldSeg.appendChild(field);
            split.appendChild(fieldSeg);
            return;
        }
        const seg = document.createElement('div');
        seg.className = 'note-table-split-seg';
        const backdrop = document.createElement('div');
        backdrop.className = 'note-table-split-backdrop';
        const ta = document.createElement('textarea');
        ta.className = 'note-table-split-text';
        ta.value = piece.value;
        ta.rows = 1;
        ta.spellcheck = main.spellcheck;
        [ta, backdrop].forEach(el => {
            el.style.fontFamily = cs.fontFamily;
            el.style.fontSize = cs.fontSize;
            el.style.fontWeight = cs.fontWeight;
        });
        // Like the note textarea: the text is drawn by the backdrop, the field shows the caret.
        ta.style.color = 'transparent';
        ta.style.caretColor = cs.caretColor || getComputedStyle(main).caretColor;
        backdrop.style.color = 'inherit';
        ta.addEventListener('input', () => onNoteTableSplitTextInput(split, piece));
        ['keyup', 'mouseup', 'touchend', 'focus'].forEach(type => ta.addEventListener(type, updateTableAlignButtonState));
        piece.el = ta;
        piece.backdrop = backdrop;
        seg.appendChild(backdrop);
        seg.appendChild(ta);
        split.appendChild(seg);
    });
    split._onMainInput = () => onNoteTableSplitMainInput(split);
    main.addEventListener('input', split._onMainInput);
    container.classList.add('is-table-split');
    container.appendChild(split);
    const texts = split._pieces.filter(p => p.kind === 'text');
    const fields = split._pieces.filter(p => p.kind === 'table');
    const modalBox = main.closest('.modal-content-box');
    // A field is as tall as its table needs, up to about half of the modal.
    const fitFields = () => {
        const limit = Math.round((modalBox ? modalBox.clientHeight : split.clientHeight * 2) / 2);
        fields.forEach(p => { p.el.style.maxHeight = limit + 'px'; fitNoteTableField(p.el); });
    };
    const fitAll = () => texts.forEach(p => fitNoteTableSplitText(p.el));
    fitFields();
    fitAll();
    renderNoteTableSplitBackdrops(split);
    if (typeof ResizeObserver === 'function') {
        let lastWidth = split.clientWidth;
        split._ro = new ResizeObserver(() => {
            fitFields();
            if (split.clientWidth !== lastWidth) { lastWidth = split.clientWidth; fitAll(); }
        });
        split._ro.observe(split);
    }
    // Keep the caret: in the text piece that holds it, else right after (or before) its table.
    let target = null, targetPos = 0;
    split._pieces.forEach(piece => {
        if (target || piece.kind !== 'text') return;
        const off = getNotePieceOffset(split._pieces, piece);
        if (caret >= off && caret <= off + piece.value.length) { target = piece; targetPos = caret - off; }
    });
    const firstTable = split._pieces.find(p => p.kind === 'table');
    const caretTable = split._pieces.find(p => {
        if (p.kind !== 'table') return false;
        const off = getNotePieceOffset(split._pieces, p);
        return caret >= off && caret <= off + p.value.length;
    }) || firstTable;
    if (!target) {
        const i = split._pieces.indexOf(caretTable);
        const after = split._pieces.slice(i + 1).find(p => p.kind === 'text');
        const before = split._pieces.slice(0, i).reverse().find(p => p.kind === 'text');
        target = after || before || null;
        targetPos = after ? 0 : (before ? before.value.length : 0);
    }
    split.scrollTop = scrollTop;
    const field = caretTable.seg || caretTable.el;
    if (field.offsetTop < split.scrollTop || field.offsetTop + field.offsetHeight > split.scrollTop + split.clientHeight) {
        split.scrollTop = Math.max(0, field.offsetTop - 24);
    }
    if (target) {
        target.el.focus({ preventScroll: true });
        target.el.setSelectionRange(targetPos, targetPos);
    } else {
        main.blur();
    }
    return split;
}
// Removes the fields and shows the note textarea again. Returns the ranges of the tables that
// were in fields (offsets in the note), or null when none were open.
function closeNoteTableSplit(main) {
    const split = getNoteTableSplit(main);
    if (!split) return null;
    const ranges = [];
    let sel = null;
    const active = document.activeElement;
    split._pieces.forEach(piece => {
        const off = getNotePieceOffset(split._pieces, piece);
        if (piece.kind === 'table') ranges.push({ start: off, end: off + piece.value.length });
        if (piece.el && piece.el === active && piece.kind !== 'sep') {
            sel = [off + active.selectionStart, off + active.selectionEnd];
        }
    });
    const ratio = split.scrollHeight > split.clientHeight ? split.scrollTop / (split.scrollHeight - split.clientHeight) : 0;
    main.removeEventListener('input', split._onMainInput);
    split._ro?.disconnect();
    split.remove();
    main.parentElement?.classList.remove('is-table-split');
    main.focus({ preventScroll: true });
    if (sel) main.setSelectionRange(sel[0], sel[1]);
    const maxScroll = main.scrollHeight - main.clientHeight;
    main.scrollTop = maxScroll > 0 ? Math.round(ratio * maxScroll) : 0;
    return ranges;
}

function updateTableAlignButtonState() {
    const button = document.querySelector('#content-modal .modal-edit-toolbar-btn.is-table');
    const textarea = document.getElementById('note-edit-textarea');
    if (!button) return;
    // Pressed = the table fields are open.
    const active = !!getNoteTableSplit(textarea);
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
}

// Writes whitespace edits of the table alignment into the note textarea, shifting the stored
// format ranges ourselves (handleEditInput only knows single edits at the caret).
function applyTableEditsToNoteTextarea(textarea, edits, text) {
    if (!edits.length) return;
    const map = (pos) => mapOffsetThroughEdits(pos, edits);
    const modalBodyElem = document.getElementById('modal-body');
    const fmtStr = modalBodyElem?.dataset.format;
    if (fmtStr && fmtStr.trim() !== '') {
        const formats = fmtStr.split('|').map(p => {
            try { return JSON.parse(p); } catch (e) { return null; }
        }).filter(f => f && f.start !== undefined);
        formats.forEach(f => { f.start = map(f.start); f.end = map(f.end); });
        modalBodyElem.dataset.format = formats.map(f => JSON.stringify(f)).join('|');
    }
    const selectionStart = map(textarea.selectionStart);
    const selectionEnd = map(textarea.selectionEnd);
    const scrollTop = textarea.scrollTop;
    textarea.value = text;
    textarea.dataset.lastVal = text;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(selectionStart, selectionEnd);
    textarea.scrollTop = scrollTop;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

// One press of ▦. Fields closed: align the table under the caret (all = true for hold /
// Ctrl/⌘+click: every table in the note) and show each in an editable field in its place.
// Fields open: close them all and bring those tables back to the compact form (what was typed in
// the fields is already in the note; only padding and separator dashes are removed).
function applyMarkdownTableAlignment(all = false) {
    const textarea = document.getElementById('note-edit-textarea');
    if (!textarea) return;
    if (getNoteTableSplit(textarea)) {
        const ranges = closeNoteTableSplit(textarea);
        const result = planMarkdownTableFieldsClose(textarea.value, ranges || []);
        applyTableEditsToNoteTextarea(textarea, result.edits, result.text);
        updateTableAlignButtonState();
        return;
    }
    const plan = planMarkdownTableFieldsOpen(textarea.value, textarea.selectionStart, all);
    if (!plan.tableCount) {
        updateTableAlignButtonState();
        return;
    }
    applyTableEditsToNoteTextarea(textarea, plan.edits, plan.text);
    openNoteTableSplit(textarea, plan.ranges);
    updateTableAlignButtonState();
}

// Opening the editor (plan 9): every alignable table in the note is aligned and shown in its
// field, exactly as hold / Ctrl/⌘+click on ▦ does (broken tables get their missing | too). The
// aligned text is what stands in the note textarea, so Save writes it. caret is where the caret
// should be in the note; it follows the alignment edits. inTable (opened from search): a caret
// inside a table stays there, in its field; otherwise the caret is kept in the text around the
// tables. The textareas get their text by assignment, so the alignment is not in the undo
// history. Returns the split, or null (no table).
function openNoteTableFieldsOnEdit(textarea, caret, inTable = false) {
    if (!textarea) return null;
    const open = getNoteTableSplit(textarea);
    if (open) return open;
    textarea.setSelectionRange(caret, caret);
    const plan = planMarkdownTableFieldsOpen(textarea.value, caret, true);
    if (!plan.tableCount) {
        updateTableAlignButtonState();
        return null;
    }
    applyTableEditsToNoteTextarea(textarea, plan.edits, plan.text);
    const split = openNoteTableSplit(textarea, plan.ranges);
    const pos = textarea.selectionStart;
    const piece = inTable && split?._pieces.find(p => {
        if (p.kind !== 'table') return false;
        const off = getNotePieceOffset(split._pieces, p);
        return pos > off && pos < off + p.value.length;
    });
    if (piece) {
        const off = getNotePieceOffset(split._pieces, piece);
        piece.el.focus({ preventScroll: true });
        piece.el.setSelectionRange(pos - off, pos - off);
    }
    updateTableAlignButtonState();
    return split;
}
// Brings the caret of the focused piece into view inside the split (what scrollCaretIntoView does
// for the plain textarea): a caret at the end of its piece shows the piece's last line.
function revealNoteTableSplitCaret(split) {
    const el = document.activeElement;
    if (!split || !el || !split.contains(el)) return;
    // A table field sits in its backdrop wrapper (positioned): measure the wrapper inside the split.
    const box = el.classList.contains('note-table-field') && el.parentElement?.classList.contains('note-table-field-seg') ? el.parentElement : el;
    const top = box.offsetTop, bottom = top + box.offsetHeight;
    if (el.selectionStart === el.value.length && !el.classList.contains('note-table-field')) {
        if (bottom > split.scrollTop + split.clientHeight) split.scrollTop = bottom - split.clientHeight + 10;
        else if (bottom < split.scrollTop) split.scrollTop = Math.max(0, top - 24);
    } else if (top < split.scrollTop || top > split.scrollTop + split.clientHeight - 24) {
        split.scrollTop = Math.max(0, top - 24);
    }
}

function createModalEditToolbar(modalContentBox) {
    if (!modalContentBox) return;
    restoreModalHeaderListButtons();
    modalContentBox.querySelector('.modal-edit-toolbar')?.remove();
    const headerToolbar = modalContentBox.querySelector('.modal-header-toolbar');
    if (!headerToolbar) return;
    const toolbar = document.createElement('div');
    toolbar.className = 'modal-edit-toolbar';
    toolbar.setAttribute('aria-label', 'Инструменти за форматиране');
    const addButton = ({ label, title, className = '', action, onLongPress }) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `modal-edit-toolbar-btn modal-header-btn ${className}`.trim();
        button.textContent = label;
        button.title = title;
        button.setAttribute('aria-label', title);
        button.addEventListener('mousedown', (event) => event.preventDefault());
        if (typeof onLongPress === 'function') {
            let pressTimer = null;
            let longPressTriggered = false;
            button.addEventListener('touchstart', () => {
                longPressTriggered = false;
                pressTimer = setTimeout(() => {
                    longPressTriggered = true;
                    if (navigator.vibrate) navigator.vibrate(40);
                    onLongPress();
                }, 500);
            }, { passive: true });
            button.addEventListener('touchend', (e) => {
                if (pressTimer) clearTimeout(pressTimer);
                if (longPressTriggered) {
                    if (e.cancelable) e.preventDefault();
                    longPressTriggered = false;
                }
            });
            button.addEventListener('touchmove', () => {
                if (pressTimer) clearTimeout(pressTimer);
            }, { passive: true });
            button.addEventListener('touchcancel', () => {
                if (pressTimer) clearTimeout(pressTimer);
            });
            // Press-and-hold with a mouse; mouse events that follow a touch are ignored.
            let lastTouchEnd = 0;
            button.addEventListener('touchend', () => { lastTouchEnd = Date.now(); });
            button.addEventListener('mousedown', (e) => {
                if (e.button !== 0 || Date.now() - lastTouchEnd < 1000) return;
                longPressTriggered = false;
                if (pressTimer) clearTimeout(pressTimer);
                pressTimer = setTimeout(() => {
                    longPressTriggered = true;
                    onLongPress();
                }, 500);
            });
            ['mouseup', 'mouseleave', 'mouseout'].forEach((type) => {
                button.addEventListener(type, () => {
                    if (pressTimer) clearTimeout(pressTimer);
                });
            });
            button.addEventListener('click', (e) => {
                if (longPressTriggered) {
                    longPressTriggered = false;
                    return;
                }
                action(e);
            });
        } else {
            button.addEventListener('click', action);
        }
        toolbar.appendChild(button);
    };
    const applyMarkdown = (type) => {
        const textarea = getActiveModalEditor();
        if (!textarea) return;
        const backdropId = textarea.id === 'note-edit-textarea'
            ? 'note-edit-textarea-backdrop'
            : 'note-edit-title-textarea-backdrop';
        formatKeyboardHotkeys(
            textarea,
            document.getElementById(backdropId),
            type === 'bold',
            type === 'italic',
            type === 'underline',
            type === 'strike'
        );
    };
    addButton({ label: 'B', title: _('boldTooltip') || 'Bold text', className: 'is-bold', action: () => applyMarkdown('bold') });
    addButton({ label: 'I', title: _('italicTooltip') || 'Italic text', className: 'is-italic', action: () => applyMarkdown('italic') });
    addButton({ label: 'U', title: _('underlineTooltip') || 'Underline text', className: 'is-underline', action: () => applyMarkdown('underline') });
    addButton({ label: 'S', title: _('strikeTooltip') || 'Strikethrough text', className: 'is-strike', action: () => applyMarkdown('strike') });
    ['bullet-list-btn', 'numbered-list-btn'].forEach((buttonId) => {
        const button = document.getElementById(buttonId);
        if (!button) return;
        button.style.display = 'flex';
        toolbar.appendChild(button);
    });
    addButton({
        label: '←',
        title: _('lineStartTooltip') || 'One character left · Ctrl/hold: line start',
        action: (e) => (e && (e.ctrlKey || e.metaKey))
            ? moveCaretToLineEdge(getActiveModalEditor(), false, false)
            : moveCaretByOne(getActiveModalEditor(), -1),
        onLongPress: () => moveCaretToLineEdge(getActiveModalEditor(), false, false)
    });
    addButton({
        label: '→',
        title: _('lineEndTooltip') || 'One character right · Ctrl/hold: line end',
        action: (e) => (e && (e.ctrlKey || e.metaKey))
            ? moveCaretToLineEdge(getActiveModalEditor(), true, false)
            : moveCaretByOne(getActiveModalEditor(), 1),
        onLongPress: () => moveCaretToLineEdge(getActiveModalEditor(), true, false)
    });
    addButton({
        label: '▦',
        title: _('tableAlignTooltip') || 'Align the table under the caret and show it in its place in a field you can type in (no wrapping, scrolls sideways) · press again: close the field and compact the table · Ctrl/⌘+click or hold: all tables',
        className: 'is-table',
        action: (e) => applyMarkdownTableAlignment(!!(e && (e.ctrlKey || e.metaKey))),
        onLongPress: () => applyMarkdownTableAlignment(true)
    });
    headerToolbar.appendChild(toolbar);
    const noteTextarea = document.getElementById('note-edit-textarea');
    // The button state follows the table under the caret, so caret moves refresh it too.
    ['input', 'keyup', 'mouseup', 'touchend', 'focus'].forEach((type) => {
        noteTextarea?.addEventListener(type, updateTableAlignButtonState);
    });
    updateTableAlignButtonState();
    updateNoteStickyButtons();
    modalContentBox.classList.add('has-edit-toolbar');
}

function initNoteEditUI() {
    const contentModal = document.getElementById('content-modal');
    const modalBodyEl = document.getElementById('modal-body');
    const modalContentBox = contentModal?.querySelector('.modal-content-box');
    let footerToolbar = modalContentBox?.querySelector('.modal-footer-toolbar');
    if (!footerToolbar && modalContentBox) {
        // No toolbar from showModal() (no write rights): create it, so the buttons stay one row on the right.
        footerToolbar = document.createElement('div');
        footerToolbar.className = 'modal-footer-toolbar';
        footerToolbar.dataset.editOnly = 'true';
        modalContentBox.appendChild(footerToolbar);
    }
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
    if (footerToolbar) {
        observeModalFooterDateVisibility(footerToolbar);
        updateModalFooterDateVisibility(footerToolbar);
        footerToolbar._footerDateScheduleUpdate?.();
    }
    if (modalBodyEl?.querySelector('textarea')) {
        createModalEditToolbar(modalContentBox);
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

            const noteInData = allNotesData.find(n => String(n.id) === String(targetNoteId));
            if (!noteInData || !noteInData.gdid) {
                if (typeof showToast === 'function') showToast(_('errorNoteFieldMissing') || 'Note not saved yet.', 4000);
                attachInput.value = '';
                return;
            }

            // Локален режим: байтовете отиват в store `files`, бележката пази ключа.
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    const fileType = file.type.startsWith('video') ? 4 : (file.type.startsWith('audio') ? 2 : (file.type === 'application/pdf' || file.type.startsWith('text') ? 3 : 1));
                    const fileKey = await saveBlobToFiles(file.name, file, file.type, noteInData.gdid);
                    const maxMediaId = mediaData.reduce((max, m) => Math.max(max, +(m.id || 0)), 0);
                    const mediaEntry = {
                        datemod: Date.now(),
                        description: '',
                        gdid: localUuid(),
                        id: maxMediaId + 1,
                        noteid: noteInData.gdid,
                        path: file.name,
                        pathGD: fileKey,
                        type: fileType
                    };
                    mediaData.push(mediaEntry);
                    await bulkPutDB(MEDIA_STORE_NAME, [mediaEntry], true);
                    if (typeof refreshNoteUI === 'function') {
                        await refreshNoteUI(noteInData.gdid);
                    }
                    if (typeof showToast === 'function') showToast((_('attachSuccessMsg') || '✅ Attached {name}').replace('{name}', file.name), 3000);
                } catch (e) {
                    console.error(`[Attachment] Error saving ${file.name}:`, e);
                    if (typeof showToast === 'function') showToast((_('attachErrorMsg') || '❌ Error: {msg}').replace('{msg}', e.message), 5000);
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

    const noteGdid = modalBodyElem.dataset.gdid;

    if (!useIndexedDb) return;

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
 
    const noteGdid = modalBodyElem.dataset.gdid;
 
    // If not editable, just return, don't start timer
    if (!useIndexedDb) return;
 
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

function postEditNoteState(bodyText, bodyFormatStr, titleText, titleFormatStr, includeTitle, maskedLinks) {
    if (includeTitle) {
        const titleRes = postEdit(titleText || "", parseFormatsString(titleFormatStr || ""), maskedLinks);
        const bodyRes = postEdit(bodyText || "", parseFormatsString(bodyFormatStr || ""), maskedLinks);
        return {
            text: titleRes.text + '|' + bodyRes.text,
            format: stringifyFormatsArray(bodyRes.formats),
            titleFormat: stringifyFormatsArray(titleRes.formats)
        };
    }
    const res = postEdit(bodyText || "", parseFormatsString(bodyFormatStr || ""), maskedLinks);
    return { text: res.text, format: stringifyFormatsArray(res.formats), titleFormat: titleFormatStr || '' };
}

// Състоянието на редактора при отваряне (след подравняването на таблиците). Липсва ли отметка —
// бележка, отворена без enableNoteEditing — падаме на записаното, както преди.
function noteEditOpenedState(modalBodyElem, includeTitle, maskedLinks, noteObj) {
    if (modalBodyElem.dataset.initialEditText === undefined) {
        return { text: noteObj.notetxt || '', format: noteObj.text_span || '', titleFormat: noteObj.title_span || '' };
    }
    return postEditNoteState(modalBodyElem.dataset.initialEditText, modalBodyElem.dataset.initialFormat,
        modalBodyElem.dataset.initialEditTitleText, modalBodyElem.dataset.initialTitleFormat, includeTitle, maskedLinks);
}

// What closing the active note window would lose, without asking: '' (nothing), 'ui' (only the
// expanded state / the note's own size) or 'edit' (the text, its formats or the colour).
function getNoteUnsavedKind() {
    const modalBodyElem = document.getElementById('modal-body');
    if (!modalBodyElem) return '';
    const textarea = document.getElementById('note-edit-textarea');
    const titleTextarea = document.getElementById('note-edit-title-textarea');
    const saveBtn = document.getElementById('note-save-btn');
    const isEditingOrPreviewing = (textarea || titleTextarea) || (saveBtn && saveBtn.style.display !== 'none');
    const hasUiStateChanged = hasModalUiStateChanges();
    if (!isEditingOrPreviewing && !hasUiStateChanged) return '';
    if (!isEditingOrPreviewing && hasUiStateChanged) return 'ui';
    const isNewNote = modalBodyElem.dataset.isNewNote === 'true';
    const newBodyTextRaw = textarea ? textarea.value : (modalBodyElem.dataset.draftText || "");
    const newTitleTextRaw = titleTextarea ? titleTextarea.value : (modalBodyElem.dataset.draftTitle || "");
    if (isNewNote) {
        const isNewNoteWithContent = (newBodyTextRaw.trim() !== "" || newTitleTextRaw.trim() !== "");
        if (!isNewNoteWithContent) return '';
    } else {
        const noteGdid = modalBodyElem.dataset.gdid;
        const noteId = modalBodyElem.dataset.id;
        const noteObj = allNotesData.find(n => (n.gdid && String(n.gdid) === String(noteGdid)) || (n.id && String(n.id) === String(noteId)));
        if (!noteObj) return '';
        const isPreview = modalBodyElem.dataset.isPreview === 'true';
        const formatStr = isPreview ? (modalBodyElem.dataset.previewDraftFormat || "") : (modalBodyElem.dataset.format || "");
        const titleFormatStr = isPreview ? (modalBodyElem.dataset.previewDraftTitleFormat || "") : (modalBodyElem.dataset.titleFormat || "");
        const maskedSource = isPreview ? modalBodyElem.dataset.previewDraftMaskedLinks : modalBodyElem.dataset.maskedLinks;
        const maskedLinks = maskedSource ? JSON.parse(maskedSource) : [];
        const isHiddenNote = noteObj.pass === true;
        const hasPreviewTitle = isPreview && modalBodyElem.dataset.previewHasTitle === 'true';
        const includeTitle = (isHiddenNote || (titleTextarea && newTitleTextRaw !== "") || (modalBodyElem.dataset.draftTitle && modalBodyElem.dataset.draftTitle !== "")) && (titleTextarea || hasPreviewTitle);
        const editedState = postEditNoteState(newBodyTextRaw, formatStr, newTitleTextRaw, titleFormatStr, includeTitle, maskedLinks);
        const processedText = editedState.text;
        const finalFormat = editedState.format;
        const finalTitleFormat = editedState.titleFormat;
        const originalContent = noteObj.notetxt || "";
        const originalFormat = noteObj.text_span || "";
        const originalTitleFormat = noteObj.title_span || "";
        // Промяна има само ако редакторът се различава и от записаното, и от състоянието при отваряне:
        // така отворена и затворена бележка с таблица (подравнена при отваряне) не пита за запис, а
        // връщането на таблицата в компактния ѝ вид пак не пита (текстът съвпада със записания).
        const openedState = noteEditOpenedState(modalBodyElem, includeTitle, maskedLinks, noteObj);
        const storedState = { text: originalContent, format: originalFormat, titleFormat: originalTitleFormat };
        const sameNoteState = (a, b) => a.text === b.text && a.format === b.format && a.titleFormat === b.titleFormat;
        const hasEditorChanged = !sameNoteState(editedState, storedState) && !sameNoteState(editedState, openedState);
        const initialColor = (noteObj.color !== undefined) ? noteObj.color : 0;
        const currentColor = getModalColorValue(modalBodyElem, initialColor);
        const hasColorChanged = currentColor !== initialColor;
        if (!hasEditorChanged && !hasColorChanged && !hasUiStateChanged) return '';
    }
    return 'edit';
}

async function checkUnsavedChanges(isClosingModal = true) {
    const kind = getNoteUnsavedKind();
    if (!kind) return true;
    const win = activeNoteWindow;
    const confirmed = await showConfirmation(_('confirmSaveChanges') || "Save changes?");
    // The question may have taken a while: the answer belongs to the window that asked.
    if (win && noteWindows.includes(win)) activateNoteWindow(win, false);
    if (confirmed) {
        if (kind === 'ui') enableNoteEditing(document.getElementById('modal-body'));
        await saveEditedNote();
        return false;
    }
    return true;
}

// Unified Save Logic
function saveEditedNote(forceClose = false) {
    const modalBodyElem = document.getElementById('modal-body');
    if (!modalBodyElem) return;
    const saveWindow = activeNoteWindow; // the refresh after the save goes to this window, wherever the user is by then
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

        const useIndexedDbNow = true; // локален режим: единственото хранилище е базата

        // Check if it's a new note (deferred creation)
        let modalGdid = modalBodyElem.dataset.gdid;
        let modalId = parseInt(modalBodyElem.dataset.id, 10);
        let noteNumordValue = parseInt(modalBodyElem.dataset.numord, 10);
        const modalNoteObj = allNotesData.find(n => (n.gdid && String(n.gdid) === String(modalGdid)) || (n.id && String(n.id) === String(modalId)));

        // 1. Get content and format
        const newText = textarea ? textarea.value : modalBodyElem.dataset.draftText;
        const titleText = titleTextarea ? titleTextarea.value : (modalBodyElem.dataset.draftTitle || "");
        const isPreview = modalBodyElem.dataset.isPreview === 'true';
        const formatStr = isPreview ? (modalBodyElem.dataset.previewDraftFormat || "") : (modalBodyElem.dataset.format || "");
        const titleFormatStr = isPreview ? (modalBodyElem.dataset.previewDraftTitleFormat || "") : (modalBodyElem.dataset.titleFormat || "");
        // Чете се преди disableNoteEditing - то трие previewHasTitle (иначе запис от прегледа губи заглавието).
        const hasPreviewTitle = isPreview && modalBodyElem.dataset.previewHasTitle === 'true';

        if (!closeAfterSave) {
            disableNoteEditing(modalBodyElem);
        }

        if (newText === undefined) return;

        const isHiddenNote = modalNoteObj && modalNoteObj.pass === true;
        const isNewNote = (!modalNoteObj && !modalGdid) || modalBodyElem.dataset.isNewNote === 'true';
        const isExpanded = modalBodyElem.dataset.isExpanded === 'true';
        const storedUiState = normalizeNoteUiState(modalNoteObj?.uiState);
        const movedPosition = getMovedNoteWindowPosition(modalBodyElem);
        const editorSize = getModalEditorSize();
        const windowPosition = movedPosition || getValidWindowPosition(storedUiState);
        // Размерът пътува с мястото (правило на CX, 2026-10-08 00:51): собственият размер, ако има
        // такъв, иначе този, с който прозорецът стои в момента - дори да е стандартният. Разпънатият
        // изглед не се брои: мястото му не се пази, а размерът е екранът.
        const savedSize = editorSize || (!isExpanded && windowPosition ? getNoteWindowCurrentSize(modalBodyElem) : null);
        // Час / повторение от реда в модала; сравнява се със записаното, преди uiState да се подмени.
        const calDraft = getModalCalDraft(modalBodyElem);
        const hasCalChanged = !!modalNoteObj && hasModalCalChanges(modalBodyElem, modalNoteObj);
        const currentUiState = applyNoteCalDraft({
            ...storedUiState,
            exp: isExpanded,
            ...noteUiSizeKey(savedSize),
            ...noteUiPosKey(windowPosition)
        }, calDraft);
        // Сравнява се със записаното преди присвояването по-долу (то подменя uiState в паметта).
        const hasWindowGeometryChanged = !!movedPosition
            || JSON.stringify(editorSize) !== JSON.stringify(getValidEditorSize(storedUiState))
            || isExpanded !== getNoteExpanded(storedUiState);
        if (movedPosition) setNoteWindowBaseGeometry(modalBodyElem);
        if (modalNoteObj) modalNoteObj.uiState = currentUiState;
        // Retrieve masked links from dataset if they exist
        const maskedSource = isPreview ? modalBodyElem.dataset.previewDraftMaskedLinks : modalBodyElem.dataset.maskedLinks;
        const maskedLinks = maskedSource ? JSON.parse(maskedSource) : [];
        let processedText, finalFormat, finalTitleFormat;
        if ((isHiddenNote || ((titleTextarea || hasPreviewTitle) && titleText !== "")) && (titleTextarea || hasPreviewTitle)) {
            // Handle hidden note OR normal note with split content
            const titleRes = postEdit(titleText, parseFormatsString(titleFormatStr), maskedLinks);
            finalTitleFormat = stringifyFormatsArray(titleRes.formats);
            const bodyRes = postEdit(newText, parseFormatsString(formatStr), maskedLinks);
            finalFormat = stringifyFormatsArray(bodyRes.formats);
            processedText = titleRes.text + '|' + bodyRes.text;
            notifyRemovedLinkMarkers(titleRes.removedLinkMarkers + bodyRes.removedLinkMarkers);
        } else {
            // Standard note
            const res = postEdit(newText, parseFormatsString(formatStr), maskedLinks);
            processedText = res.text;
            finalFormat = stringifyFormatsArray(res.formats);
            notifyRemovedLinkMarkers(res.removedLinkMarkers);
        }
        // Показваме форматирания текст ВЕДНАГА - не чакаме края на GDrive записа
        if (!closeAfterSave && typeof showModal === 'function') {
            const boardId = modalBodyElem.dataset.boardId || (modalNoteObj && modalNoteObj.boardid) || currentBoardFilter;
            const colorVal = getModalColorValue(modalBodyElem, modalNoteObj ? modalNoteObj.color : 0);
            const noteColorStr = getNoteColorCss(colorVal);
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
                datemod: modalNoteObj ? modalNoteObj.datemod : undefined,
                uiState: currentUiState,
                noteWindow: saveWindow
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
                "color": getModalColorValue(modalBodyElem),
                "date": dateMod,
                "datemod": dateMod,
                "eventId": 0,
                "gdid": localUuid(), // локален ключ на бележката
                "id": modalId,
                "notetxt": processedText,
                "numord": (!isNaN(noteNumordValue) ? noteNumordValue : noteNumord),
                "pass": isHiddenNote, // Use the state from modalNoteObj if available, or false
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
            const newNoteSize = editorSize || (!isExpanded && windowPosition ? getNoteWindowCurrentSize(modalBodyElem) : null);
            if (isExpanded || newNoteSize) newNote.uiState = { exp: isExpanded, ...noteUiSizeKey(newNoteSize), ...noteUiPosKey(windowPosition) };

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
        let newColor = getModalColorValue(modalBodyElem, noteObj ? (noteObj.color || 0) : 0);


        // Check for changes (comparing processed versions to avoid repeated postEdit if nothing changed)
        const hasDrafts = !!modalBodyElem.dataset.draftText;
        const previousIsExpanded = getNoteExpanded(noteObj?.uiState);
        const previousEditorSize = getValidEditorSize(noteObj?.uiState);
        const hasEditorSizeChanged = JSON.stringify(editorSize) !== JSON.stringify(previousEditorSize);
        const hasChanges = isNewNote || hasDrafts || hasCalChanged || (processedText !== originalContent || finalFormat !== (noteObj?.text_span || "") || finalTitleFormat !== (noteObj?.title_span || "") || newCalendarDate !== noteObj?.calendarDate || newColor !== noteObj?.color || isExpanded !== previousIsExpanded || hasEditorSizeChanged || hasWindowGeometryChanged);

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
            const hasExistingUiState = noteObj.uiState && typeof noteObj.uiState === 'object' && !Array.isArray(noteObj.uiState);
            if (hasExistingUiState || isExpanded || editorSize || calDraft.time || calDraft.repeat) {
                noteObj.uiState = applyNoteCalDraft({
                    ...normalizeNoteUiState(noteObj.uiState),
                    exp: isExpanded,
                    ...noteUiSizeKey(editorSize),
                    ...noteUiPosKey(windowPosition)
                }, calDraft);
            }

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

            // --- Запис в базата (единственият източник в локален режим) ---
            noteObj.type = -1;
            if (useIndexedDbNow) await bulkPutDB(NOTE_STORE_NAME, noteObj, true);

            const board = boardsData.find(b => String(b.gdid) === String(noteObj.boardid) || String(b.id) === String(noteObj.boardid));
            const boardTitle = board ? board.title : (_(noteObj.boardid) || noteObj.boardid);

            showToast(_('noteSavedInDb').replace('{boardName}', boardTitle));
            updateReloadButtonState();
        }

        // If modal was not closed, refresh its content to show the saved state
        if (!closeAfterSave) {
            if (typeof showModal === 'function' && noteObj) {
                const noteColorStr = getNoteColorCss(noteObj.color);
                showModal({
                    raw: noteObj.notetxt,
                    format: noteObj.text_span,
                    titleFormat: noteObj.title_span,
                    color: noteColorStr,
                    boardId: noteObj.boardid,
                    id: noteObj.id,
                    gdid: noteObj.gdid,
                    datemod: noteObj.datemod,
                    originalNote: noteObj,
                    uiState: noteObj.uiState,
                    noteWindow: saveWindow
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

    if (newCalendarDate === 0) {
        const weekCal = document.getElementById('weekly-calendar-container');
        if (weekCal && weekCal.style.display !== 'none') {
            const contentModal = document.getElementById('content-modal');
            if (contentModal) contentModal.classList.remove('visible');
        }
    }
    await saveNoteCalendarChange(noteObj);
}

// Записът след промяна по календарните полета на бележката (дата от бутона, час / повторение от реда в
// модала): datemod, картата, източниците, броячите, съобщението, сверката с Google Календар и изгледите.
async function saveNoteCalendarChange(noteObj) {
    noteObj.datemod = Date.now();
    noteObj.type = -1; // локален режим
    // Update UI (DOM Note)
    const noteEl = document.querySelector(`.note[data-g="${noteObj.gdid}"]`) || document.querySelector(`.note[data-i="${noteObj.id}"]`);
    if (noteEl) {
        const updatedEl = await createNoteElement(noteObj);
        if (updatedEl) noteEl.replaceWith(updatedEl);
    }
    noteObj.type = -1; // локален режим: записът е само в базата
    await bulkPutDB(NOTE_STORE_NAME, [noteObj], true);
    if (typeof updateBoardCounterUI === 'function') {
        updateBoardCounterUI(noteObj.boardid);
        updateBoardCounterUI('reminder');
    }
    const board = boardsData.find(b => String(b.gdid) === String(noteObj.boardid) || String(b.id) === String(noteObj.boardid));
    const boardTitle = board ? board.title : (_(noteObj.boardid) || noteObj.boardid);

    showToast(_('noteSavedInDb').replace('{boardName}', boardTitle));

    const monthCal = document.getElementById('calendar-container');
    const weekCal = document.getElementById('weekly-calendar-container');
    const isWeeklyView = weekCal && weekCal.style.display !== 'none';
    if (isWeeklyView) {
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
    const maxTextareaScroll = textarea.scrollHeight - textarea.clientHeight;
    const scrollRatio = maxTextareaScroll > 0 ? (textarea.scrollTop / maxTextareaScroll) : 0;
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
    modalBodyElem.dataset.draftText = newText;
    modalBodyElem.dataset.draftTitle = titleText;
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
        const isExpanded = modalBodyElem.dataset.isExpanded === 'true';
        const editorSize = getModalEditorSize();
        const currentUiState = {
            ...normalizeNoteUiState(modalNoteObj?.uiState),
            exp: isExpanded,
            ...noteUiSizeKey(editorSize)
        };
        const boardId = modalNoteObj ? modalNoteObj.boardid : (modalBodyElem.dataset.boardId || currentBoardFilter);
        const noteColorStr = modalBodyElem.dataset.color || getNoteColorCss(modalNoteObj?.color);
        showModal({
            raw: processedText,
            format: finalFormat,
            titleFormat: finalTitleFormat,
            color: noteColorStr,
            boardId: boardId,
            id: noteId,
            gdid: noteGdid,
            maskedLinks: maskedLinks,
            uiState: currentUiState,
            isNewNote: modalBodyElem.dataset.isNewNote === 'true',
            noteWindow: activeNoteWindow
        }, modalNoteObj ? (document.querySelector(`.note[data-g="${modalNoteObj.gdid}"]`) || document.querySelector(`.note[data-i="${modalNoteObj.id}"]`)) : null);
        const previewModalBox = document.querySelector('#content-modal .modal-content-box');
        if (previewModalBox && noteColorStr) {
            previewModalBox.style.backgroundColor = noteColorStr;
            if (localStorage.getItem('imgBgrd') === 'false') {
                previewModalBox.style.backgroundImage = 'none';
                previewModalBox.classList.add('no-bg-image');
            }
        }
        const newModalBodyElem = document.getElementById('modal-body');
        if (newModalBodyElem) {
            newModalBodyElem.dataset.draftText = newText;
            newModalBodyElem.dataset.draftTitle = titleText;
            newModalBodyElem.dataset.isPreview = 'true';
            newModalBodyElem.dataset.previewDraftFormat = formatStr;
            newModalBodyElem.dataset.previewDraftTitleFormat = titleFormatStr;
            newModalBodyElem.dataset.previewDraftMaskedLinks = JSON.stringify(maskedLinks);
            if (modalBodyElem.dataset.isNewNote !== undefined) newModalBodyElem.dataset.isNewNote = modalBodyElem.dataset.isNewNote;
            if (titleTextarea) newModalBodyElem.dataset.previewHasTitle = 'true';
            // processedText е заглавие + '|' + тяло: отметките в прегледа се броят върху същото съединяване.
            newModalBodyElem.dataset.previewDraftJoined = (titleTextarea && (isHiddenNote || titleText !== "")) ? 'true' : 'false';
            if (modalBodyElem.dataset.initialEditText !== undefined) newModalBodyElem.dataset.initialEditText = modalBodyElem.dataset.initialEditText;
            if (modalBodyElem.dataset.initialEditTitleText !== undefined) newModalBodyElem.dataset.initialEditTitleText = modalBodyElem.dataset.initialEditTitleText;
            if (modalBodyElem.dataset.initialFormat !== undefined) newModalBodyElem.dataset.initialFormat = modalBodyElem.dataset.initialFormat;
            if (modalBodyElem.dataset.initialTitleFormat !== undefined) newModalBodyElem.dataset.initialTitleFormat = modalBodyElem.dataset.initialTitleFormat;
            if (modalBodyElem.dataset.initialColorIndex !== undefined) newModalBodyElem.dataset.initialColorIndex = modalBodyElem.dataset.initialColorIndex;
            if (modalBodyElem.dataset.gdid) newModalBodyElem.dataset.gdid = modalBodyElem.dataset.gdid;
            if (modalBodyElem.dataset.id) newModalBodyElem.dataset.id = modalBodyElem.dataset.id;
            if (modalBodyElem.dataset.numord) newModalBodyElem.dataset.numord = modalBodyElem.dataset.numord;
            if (modalBodyElem.dataset.boardId) newModalBodyElem.dataset.boardId = modalBodyElem.dataset.boardId;
            if (modalBodyElem.dataset.color) newModalBodyElem.dataset.color = modalBodyElem.dataset.color;
            if (modalBodyElem.dataset.colorIndex) newModalBodyElem.dataset.colorIndex = modalBodyElem.dataset.colorIndex;
            if (modalBodyElem.dataset.baseDatemod) newModalBodyElem.dataset.baseDatemod = modalBodyElem.dataset.baseDatemod;
            if (modalBodyElem.dataset.baseNote) newModalBodyElem.dataset.baseNote = modalBodyElem.dataset.baseNote;
            if (modalBodyElem.dataset.isExpanded !== undefined) newModalBodyElem.dataset.isExpanded = modalBodyElem.dataset.isExpanded;
            if (modalBodyElem.dataset.editorSize !== undefined) newModalBodyElem.dataset.editorSize = modalBodyElem.dataset.editorSize;
            if (scrollRatio > 0) {
                const applyPreviewScroll = () => {
                    const maxModalScroll = newModalBodyElem.scrollHeight - newModalBodyElem.clientHeight;
                    if (maxModalScroll > 0) {
                        newModalBodyElem.scrollTop = Math.round(scrollRatio * maxModalScroll);
                    }
                };
                applyPreviewScroll();
                requestAnimationFrame(applyPreviewScroll);
                setTimeout(applyPreviewScroll, 60);
            }
        }
        initNoteEditUI();
        const saveBtn = document.getElementById('note-save-btn');
        const previewBtn = document.getElementById('note-preview-btn');
        const editBtn = document.getElementById('note-edit-btn');
        const moveBtn = document.getElementById('note-move-btn');
        if (saveBtn) { saveBtn.style.display = 'flex'; }
        if (editBtn) { editBtn.style.display = 'flex'; }
        if (previewBtn) { previewBtn.style.display = 'none'; }
        if (moveBtn) { moveBtn.style.display = 'flex'; }
        const colorBtnPreview = document.getElementById('modal-color-btn');
        if (colorBtnPreview) colorBtnPreview.style.display = 'none';
        const pasteBtnPreview = document.getElementById('paste-modal-btn');
        if (pasteBtnPreview) pasteBtnPreview.style.display = 'none';
        const attachBtnPreview = document.getElementById('note-attach-btn');
        if (attachBtnPreview) attachBtnPreview.style.display = 'none';
        const dupBtn = document.getElementById('note-duplicate-btn');
        if (dupBtn) dupBtn.style.display = 'none';
    }
}

function disableNoteEditing(modalBodyElem) {
    if (!modalBodyElem) return;
    const modalBox = modalBodyElem.closest('.modal-content-box');
    restoreModalHeaderListButtons();
    modalBox?.querySelector('.modal-edit-toolbar')?.remove();
    modalBox?.classList.remove('has-edit-toolbar');
    delete modalBodyElem.dataset.draftText;
    delete modalBodyElem.dataset.draftTitle;
    delete modalBodyElem.dataset.isPreview;
    delete modalBodyElem.dataset.previewDraftFormat;
    delete modalBodyElem.dataset.previewDraftTitleFormat;
    delete modalBodyElem.dataset.previewDraftMaskedLinks;
    delete modalBodyElem.dataset.previewHasTitle;
    delete modalBodyElem.dataset.previewDraftJoined;
    const saveBtn = document.getElementById('note-save-btn');
    if (saveBtn) saveBtn.style.display = 'none';
    const previewBtn = document.getElementById('note-preview-btn');
    if (previewBtn) previewBtn.style.display = 'none';
    const attachBtnForDisplay = document.getElementById('note-attach-btn');
    if (attachBtnForDisplay) attachBtnForDisplay.style.display = 'none';
    const editBtn = document.getElementById('note-edit-btn');
    if (editBtn) editBtn.style.display = 'flex';
    const colorBtn = document.getElementById('modal-color-btn');
    if (colorBtn) colorBtn.style.display = 'none';
    const pasteModalBtn = document.getElementById('paste-modal-btn');
    if (pasteModalBtn) pasteModalBtn.style.display = 'none';
    const imgBgrdEnabled = localStorage.getItem('imgBgrd') !== 'false';
    const modalContentBox = document.querySelector('#content-modal .modal-content-box');
    if (modalContentBox) {
        if (imgBgrdEnabled) {
            modalContentBox.style.backgroundImage = '';
            modalContentBox.classList.remove('no-bg-image');
            modalBodyElem.classList.remove('no-bg-image');
        }
    }
    const footerToolbar = modalBox?.querySelector('.modal-footer-toolbar');
    if (footerToolbar?.dataset.editOnly && ![...footerToolbar.children].some((child) => !child.hidden && getComputedStyle(child).display !== 'none')) {
        // The toolbar created only for editing holds nothing visible now: drop it, keep the hidden buttons for the next edit.
        footerToolbar._footerDateResizeObserver?.disconnect();
        footerToolbar.replaceWith(...footerToolbar.children);
    } else if (footerToolbar) {
        updateModalFooterDateVisibility(footerToolbar);
        footerToolbar._footerDateScheduleUpdate?.();
    }
}
/**
 * Превръща MD символи във форматирани области и изчиства текста.
 */
function postEdit(text, formats, maskedLinks = []) {
    if (parseMarkdownTable(text)) {
        // The table text stays exactly as typed — alignment pipes, separator dashes and any '*',
        // '_' or '~~' inside cells are plain text the marker rules must never touch, so none of
        // the format-conversion below runs. The WYSIWYG editor has still kept B/I/U/S as ranges
        // (table cells included) and they are saved as they are; literal markers already present
        // in the stored text (legacy, pasted) stay.
        const restored = restoreLinkMarkers(text, [...formats], maskedLinks);
        const seenFormats = new Set();
        const keptFormats = restored.formats.filter(f => {
            if ([1, 2, 3, 6, 7].includes(f.type) && !(f.end > f.start)) return false;
            const k = JSON.stringify(f);
            if (seenFormats.has(k)) return false;
            seenFormats.add(k);
            return true;
        });
        return { text: restored.text, formats: keptFormats, removedLinkMarkers: restored.removed };
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
            let start = indexOfMdClearMarker(currentText, mdClear, sIdx);
            if (start === -1) break;
            let end = indexOfMdClearMarker(currentText, mdClear, start + mdClear.length);
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

    // The editor keeps these formats as ranges (they are not markers in its text any more), so they
    // stay; markers still in the text (pasted) are added. A pair counts like in the editor: on one
    // line, the text between not empty and not starting or ending with a space ("a * b * c" stays).
    const isAlnumChar = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
    rules.forEach(rule => {
        let searchIdx = 0;
        if (!rule.s) return;
        while (true) {
            let start = currentText.indexOf(rule.s, searchIdx);
            if (start === -1) break;
            let end = currentText.indexOf(rule.e, start + rule.s.length);
            if (end === -1) {
                searchIdx = start + rule.s.length;
                continue;
            }
            const pairContent = currentText.substring(start + rule.s.length, end);
            if (!pairContent || pairContent.includes('\n') || /^\s/.test(pairContent) || /\s$/.test(pairContent) ||
                (rule.s === '_' && isAlnumChar(currentText[start - 1]) && isAlnumChar(currentText[end + 1]))) {
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
    // Heading ranges from the editor stay; "# " lines still in the text (pasted) are added.
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

    // Empty or repeated ranges of the editor formats are dropped (the old markers never made them).
    const seenFormats = new Set();
    currentFormats = currentFormats.filter(f => {
        if ([1, 2, 3, 6, 7].includes(f.type) && !(f.end > f.start)) return false;
        const k = JSON.stringify(f);
        if (seenFormats.has(k)) return false;
        seenFormats.add(k);
        return true;
    });

    // --- Restore Masked Links with proper shifting ---
    // В ред на появяване; маркер без линк се премахва - в бележката никога не се записва маркер.
    const restored = restoreLinkMarkers(currentText, currentFormats, maskedLinks);

    return { text: restored.text, formats: restored.formats, removedLinkMarkers: restored.removed };
}

/**
 * Подготвя текста за редактора: маскира линковете ({#L<n>#}) и отметките ([ ] / [x]).
 * Форматирането (вкл. bold/italic/underline/strike и заглавията) остава като диапазони, без MD символи.
 */
function preEdit(text, formats, targetIndex = -1, linkSlots = null) {
    // linkSlots: общ списък за заглавие + тяло, така че номерата {#L<n>#} са глобални за бележката
    const maskedLinks = linkSlots || reserveLinkMarkerSlots(text);
    if (!text) return { text: "", formats: [], maskedLinks, correctedIndex: targetIndex };

    let currentText = text;
    let currentFormats = formats ? formats.map(f => ({ ...f })) : [];
    let correctedIndex = targetIndex;

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

    // Bold, italic, underline, strike and headings are NOT turned into Markdown markers any more:
    // they stay ranges and the editor's backdrop draws them (renderNoteEditBackdrop).

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

    // --- 4. Markers still in the text (old notes, imports) become ranges here, by the pair rules
    // of postEdit, so the editor shows what the note view and the save make of them. ---
    if (!parseMarkdownTable(currentText)) {
        const removeAt = (pos, len) => {
            currentText = currentText.substring(0, pos) + currentText.substring(pos + len);
            if (targetIndex !== -1 && correctedIndex > pos) correctedIndex = Math.max(pos, correctedIndex - len);
            currentFormats.forEach(f => {
                if (f.start > pos + len) f.start -= len; else if (f.start > pos) f.start = pos;
                if (f.end > pos + len) f.end -= len; else if (f.end > pos) f.end = pos;
            });
        };
        const inCode = (a, b) => [...currentText.matchAll(/\{\{[\s\S]*?\}\}|```[\s\S]*?```/g)]
            .some(m => Math.max(a, m.index) < Math.min(b, m.index + m[0].length));
        const isAlnum = (c) => !!c && /[\p{L}\p{N}]/u.test(c);
        const sym = getNoteMdSymbols();
        [{ s: sym.bold, t: 1 }, { s: sym.strike, t: 7 }, { s: sym.italic, t: 2 }, { s: sym.underline, t: 3 }].forEach(rule => {
            if (!rule.s) return;
            let from = 0;
            while (true) {
                const start = currentText.indexOf(rule.s, from);
                if (start === -1) break;
                const end = currentText.indexOf(rule.s, start + rule.s.length);
                if (end === -1) break;
                const content = currentText.substring(start + rule.s.length, end);
                if (!content || content.includes('\n') || /^\s/.test(content) || /\s$/.test(content) ||
                    (rule.s === '_' && isAlnum(currentText[start - 1]) && isAlnum(currentText[end + 1])) ||
                    inCode(start, end + rule.s.length)) {
                    from = start + rule.s.length;
                    continue;
                }
                removeAt(end, rule.s.length);
                removeAt(start, rule.s.length);
                currentFormats.push({ start, end: start + content.length, type: rule.t, paramint: 0, paramfloat: 0 });
                from = start + content.length;
            }
        });
        let lineStart = 0;
        while (lineStart <= currentText.length) {
            let lineEnd = currentText.indexOf('\n', lineStart);
            if (lineEnd === -1) lineEnd = currentText.length;
            const m = /^(#{1,6}) /.exec(currentText.substring(lineStart, lineEnd));
            if (m && !inCode(lineStart, lineEnd)) {
                removeAt(lineStart, m[0].length);
                lineEnd -= m[0].length;
                currentFormats.push({ start: lineStart, end: lineEnd, type: 6, paramint: 0, paramfloat: NOTE_HEADER_SCALES[m[1].length - 1] });
            }
            lineStart = lineEnd + 1;
        }
    }

    return { text: currentText, formats: currentFormats, maskedLinks, correctedIndex };
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
            const rowBackground = entry.backgroundColor || (board ? boardBackgroundValue(board.color) : null);
            if (rowBackground) item.style.backgroundColor = rowBackground;
            const text = document.createElement('span');
            text.textContent = entry.title;
            text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;';
            // Same rules as the menu button for a real board. A system square (Reminder, Trash, ...)
            // keeps the text colour its own CSS class gives it unless the entry names one.
            if (entry.color) {
                text.style.color = entry.color;
            } else if (board) {
                text.style.color = boardFontColorValue(board) || 'black';
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
        overlay.remove();
        const boardsNote = document.querySelector('header .boards-note');
        if (boardsNote) boardsNote.remove();
        await renderUI({ boardParseError: false, rerenderOnlyMenu: true });
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

    function populateEditSelect(selectedVal = '') {
        if (!editSelect) return;
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
        if (selectedVal !== undefined && selectedVal !== null) editSelect.value = selectedVal.toString();
    }
    populateEditSelect();

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
                // Локален режим: фонът е blob в store `files`.
                getFileRecord(board.backpath).then(record => {
                    if (record && record.blob) {
                        customBgBlob = record.blob;
                        customBgMimeType = record.mime || record.blob.type;
                        customBgDataURL = URL.createObjectURL(record.blob);
                        customBgCache.set(board.backpath, customBgDataURL);
                        renderBackgroundOptions(selectedBackground);
                        updatePreview();
                    }
                });
            }

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
                    resetInputs(null);
                    populateEditSelect('');
                    document.querySelectorAll('header .boards-note').forEach(el => el.remove());
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
            boardToSave = { "backcolor": 0, "backnum": selectedBackground, "backpath": "", "color": selectedColor, "colorfont": selectedFontColor, "datemod": now, "gdid": "", "id": boardIdCounter, "numord": boardIdCounter, "status": selectedBoardStatus, "title": title };
        }

        const oldBackpath = currentEditingBoard ? currentEditingBoard.backpath : null;

        // Локален режим: всеки борд получава собствен ключ. Без него празният gdid караше
        // нов борд да презапише предишния в store-а.
        if (!boardToSave.gdid) {
            boardToSave.gdid = localUuid();
        }

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
                        // Локален режим: фонът е blob в store `files`, ключът му влиза в backpath.
                        const bgKey = await saveBlobToFiles('board_bg_' + Date.now() + '.png', customBgBlob, customBgMimeType);
                        boardToSave.backpath = bgKey;
                        boardToSave.customBgHash = hashHex;
                        boardToSave.backnum = -1;
                        customBgCache.set(bgKey, customBgDataURL);
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

            // Изчистваме стария фон, ако вече не се използва от друг борд.
            if (oldBackpath && oldBackpath !== boardToSave.backpath) {
                const bId = (boardToSave.gdid || boardToSave.id).toString();
                const isUsedByOther = boardsData.some(b => b.backpath === oldBackpath && (b.gdid || b.id).toString() !== bId);
                if (!isUsedByOther) {
                    if (customBgCache.has(oldBackpath)) customBgCache.delete(oldBackpath);
                    deleteFileRecord(oldBackpath);
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
            } catch (e) {
                console.error("Error updating boardMenuOrder:", e);
            }

            if (useIndexedDb) await bulkPutDB(BOARD_STORE_NAME, boardToSave, true);

            document.querySelectorAll('header .boards-note').forEach(el => el.remove());

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

    // Без long-press: той се припокрива с drag. Нов board се създава с Ctrl+клик.
    makeElementDraggable(fab, 'addNoteFabPosition');

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

function updateReloadButtonState() {
    // Локален режим: няма какво да се синхронизира, бутонът остава в обичайния си вид.
    const btn = document.getElementById('reload_button');
    if (!btn) return;
    btn.style.background = '';
    btn.style.borderRadius = '';
    const img = btn.querySelector('img');
    if (img) img.style.filter = '';
}