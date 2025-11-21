// https://multinotes.app/gdviewer
// terser main.js --compress --mangle --toplevel --output mainn.js
// terser main.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output mainn.js
// terser mainAll.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output mainn.js
// terser db.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output dbb.js
// terser calendar.js  --compress arrows=true,booleans=true,collapse_vars=true,comparisons=true,dead_code=true,drop_console=true,hoist_funs=true,if_return=true,passes=3 --mangle --toplevel --ecma 2020 --module --format wrap_iife=true  --output calendarr.js

let debug = true; // Глобален флаг за дебъг режим
let pass = true;

// --- Demo Mode ---
let DEMO_MODE = false;
const DEMO_NOTE_LIMIT = 5;

// =================================================================================
// I. ГЛОБАЛНИ ПРОМЕНЛИВИ И КОНСТАНТИ
// =================================================================================

// --- Конфигурация и версия ---
const CLIENT_ID = '1090128984423-80074rvs8n45v787044d9ca1bvahla98.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
const version = '0.16'; // App version

// --- Глобално състояние на приложението ---
let allNotesData = []; // Съхранява всички бележки за календара
let boardsData = []; // Съхранява данните за бордовете
let mediaData = []; // Съхранява данните за медия
let folderIds = {}; // Съхранява ID-тата на папките за медия
let currentBoardFilter = 'all';
let currentBackground = 'Board.png';
let currentCalendarDate = new Date();
let currentWeeklyViewDate = new Date(); // За новия седмичен изглед
let authToken = null;
let token;
let tokenRemainingDays = null; // Остават дни валидност на токена
let dirHandle = null; // За локален достъп до файловата система
let isInitialLoad = true; // Флаг за първоначално зареждане
let isLoadCancelled = false; // Флаг за прекратяване на зареждането
let updatedNoteGdims = []; // Съхранява gdid на новите/обновените бележки
let tokenClient = null; // Client for silent auth refresh

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

// --- Глобални флагове за състоянието (заместват многократните localStorage.getItem()) ---
let useGoogleDb = true;
let useLocalFolder = false;
let useArhDb = false;
let useIndexedDb = false;
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
// const eyeIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`;
const eyeOffIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.5 18.5 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><path d="M3 3l18 18"></path></svg>`;
const calendarIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="5" width="16" height="16" rx="2" /><line x1="16" y1="3" x2="16" y2="7" /><line x1="8" y1="3" x2="8" y2="7" /><line x1="4" y1="11" x2="20" y2="11" /><circle cx="12" cy="16" r="1.5" /></svg>`;
const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8v-2a2 2 0 0 0 -2 -2h-8a2 2 0 0 0 -2 2v8a2 2 0 0 0 2 2h2" /></svg>`;
const weeklyViewIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>`;
const boardIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="black" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><rect x="4" y="4" width="16" height="16" rx="2" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="12" y1="4" x2="12" y2="20" /></svg>`;
const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21V3M5 10l7-7 7 7"/></svg>`;
const noteIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z" fill="none"/><path d="M13 20l7 -7" /><path d="M13 20v-6a1 1 0 0 1 1 -1h6v-7a2 2 0 0 0 -2 -2h-12a2 2 0 0 0 -2 2v12a2 2 0 0 0 2 2h7" /></svg>`;
const clockIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" /></svg>`;
const lockIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>`;
// const GDSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></svg>`;
const saveSearchSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`;
const attachmentIcons = [
    { type: 1, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6l1.5-2h3L15 6"/><circle cx="12" cy="13" r="3"/></svg>` },
    { type: 2, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24" ><circle cx="7" cy="12" r="4" /><circle cx="17" cy="12" r="4"/><line x1="6" y1="16" x2="18" y2="16" stroke="black" stroke-width="1" /></svg>` },
    { type: 3, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/><path d="M14 2v6h6"/></svg>` },
    { type: 4, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10l5-3v10l-5-3"/></svg>` },
    { type: 5, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>` },
    { type: 6, svg: `<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24" fill="none" stroke="black" stroke-width="1" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="10" r="2"/><path d="M8 16c0-1.33 2.67-2 4-2s4 .67 4 2"/></svg>` }
];

let currentLang = localStorage.getItem('language') || 'bg';
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
// MODULES
// =================================================================================

// =================================================================================
// II. ИНИЦИАЛИЗАЦИЯ НА ПРИЛОЖЕНИЕТО
// =================================================================================

// --- Основна стартова функция ---
async function startApp() {
    // Първо инициализираме UI, за да се покаже веднага и да имаме достъп до елементите
    document.body.style.display = 'block';
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
    authToken = authResult.tokenData;
    // Обновяваме глобалните флагове веднага, за да отразим настройките по подразбиране
    updateGlobalStateFlags();

    await createBoardsUI([], false);
    await createSettingsUI([], false); // Предварително създава UI на настройките

    // Проверката за потребител и основната логика се извикват директно.
    // mainLogic ще се погрижи за автентикацията и зареждането на Google API,
    // само ако е необходимо.
    await mainLogic();
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
            callback(e); // Извикваме callback-а при long press
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

/**
 * Обработва клик върху бутона за калкулатор в модалния прозорец.
 * Взима маркирания текст, изчислява го като математически израз и замества селекцията с резултата.
 */
async function handleCalculateClick() {
    const selection = window.getSelection();
    const modalBody = document.getElementById('modal-body');
    let expression = '';
    let isFromClipboard = false;
    let range = null;

    // Проверяваме дали има маркиран текст в модалния прозорец
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
            console.error('Failed to read clipboard contents: ', err);
            showToast(_('errorClipboardRead'));
            return;
        }
    }

    if (expression === '') return;

    try {
        // Основна проверка за сигурност - позволяваме само определени символи
        const sanitizedExpression = expression.replace(/[^0-9+\-*/().\s]/g, '');
        if (sanitizedExpression !== expression) {
            throw new Error("Invalid characters in expression.");
        }

        // Използваме Function конструктор, който е малко по-сигурен от директен eval()
        const result = new Function('return ' + sanitizedExpression)();
        const resultText = ` = ${result}`;

        // Ако имаме селекция и не е от клипборда, вмъкваме резултата
        if (range && !isFromClipboard) {
            // Създаваме текстов възел с резултата
            const resultNode = document.createTextNode(resultText);

            // Вмъкваме го след оригиналната селекция
            range.collapse(false); // Свиваме обхвата до края му
            range.insertNode(resultNode);

            // Създаваме нов обхват (range), който да обхване само числото
            const newRange = document.createRange();
            newRange.setStart(resultNode, resultText.indexOf(result.toString())); // Начало на числото
            newRange.setEnd(resultNode, resultText.length); // Край на текста
            selection.removeAllRanges(); // Изчистваме старата селекция
            selection.addRange(newRange); // Добавяме новата селекция
        } else {
            // Ако е от клипборда, просто показваме резултата в toast
            showToast(`${expression} = ${result}`, 5000);
        }
    } catch (error) {
        showToast(_('invalidExpression'), 3000);
        console.error("Calculation error:", error);
    }
}

function initApp() {
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
    reloadButton = document.getElementById('reload_button');
    settingsButton = document.getElementById('settings_button');
    notesContainer = document.getElementById('notes-container');
    contentModal = document.getElementById('content-modal');
    modalBody = document.getElementById('modal-body');
    copyBtn = document.getElementById('copy-modal-btn');
    scrollTopBtn = document.getElementById("scrollTopBtn");
    // --- КОРЕКЦИЯ: Предотвратяваме контекстното меню в модала ---
    modalBody.addEventListener('contextmenu', e => e.preventDefault());

    searchBox = document.getElementById('search-box');
    loaderContainer = document.getElementById('loader-container');
    loaderText = document.getElementById('loader-text');

    // --- Add Title to Loader ---
    const loaderTitle = document.createElement('h3');
    loaderTitle.id = 'loader-title';
    loaderTitle.style.marginTop = '0';
    loaderTitle.style.marginBottom = '20px';
    loaderContainer.prepend(loaderTitle);

    // --- Add Cancel Button to Loader ---
    const cancelButton = document.createElement('button');
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
    scrollTopBtn.innerHTML = arrowSvg;
    signoutButton.addEventListener('click', handleSignoutClick);
    reloadButton.addEventListener('click', () => mainLogic());
    settingsButton.addEventListener('click', () => {
        // Запомняме началното състояние на чекбоксовете при отваряне на настройките
        // --- КОРЕКЦИЯ: Първо обновяваме състоянието на чекбоксовете, после го запазваме ---
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
    });
    window.onscroll = () => {
        const weeklyCalendar = document.getElementById('weekly-calendar-container');
        // Скриваме бутона, ако седмичният календар е видим
        if (weeklyCalendar && weeklyCalendar.style.display !== 'none') {
            scrollTopBtn.style.display = "none";
            return;
        }

        const isScrolled = document.body.scrollTop > 100 || document.documentElement.scrollTop > 100;
        if (currentBoardFilter !== 'all') {
            scrollTopBtn.style.display = "flex";
        } else if (isScrolled) {
            scrollTopBtn.style.display = "flex";
        } else {
            scrollTopBtn.style.display = "none";
        }
    };
    scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
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
    saveSearchBtn.innerHTML = saveSearchSvg;
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
    // --- Calculator Button ---
    const calculateBtn = document.getElementById('calculate-modal-btn');
    calculateBtn.addEventListener('click', handleCalculateClick);

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
    let startX, startY, startWidth, startHeight;

    function doDrag(e) {
        e.preventDefault();
        e.stopPropagation();
        const currentX = e.touches ? e.touches[0].clientX : e.clientX;
        const currentY = e.touches ? e.touches[0].clientY : e.clientY;
        const newWidth = startWidth + currentX - startX;
        const newHeight = startHeight + currentY - startY;
        modalContentBox.style.width = Math.max(150, newWidth) + 'px'; // Minimum width
        modalContentBox.style.height = Math.max(100, newHeight) + 'px'; // Minimum height
        modalContentBox.style.maxWidth = 'none';
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
    // updateSignoutTooltip();
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

    // --- Mode Button Logic (Ctrl-click for advanced) ---
    const modeButton = document.getElementById('mode_button');
    modeButton.addEventListener('click', (e) => { // Обединена логика
        if (e.ctrlKey) {
            // Логика за Ctrl+клик: Показване на разширените настройки
            e.preventDefault();
            const advancedSettingsSpan = document.getElementById('advanced-settings-span');
            if (advancedSettingsSpan) {
                const isHidden = advancedSettingsSpan.hasAttribute('hidden');
                if (isHidden) {
                    advancedSettingsSpan.removeAttribute('hidden');
                    localStorage.setItem('showAdvancedSettings', 'true');
                }
            }
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

    /**
     */
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
            updatedCount = await runGoogleDriveSync();
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
            // 2. Добавяме ги към съществуващите данни в паметта
            allNotesData.push(...newNotesContent.filter(Boolean));
            // 3. Създаваме HTML елементи само за новите бележки
            const newNoteElements = await Promise.all(newNotesContent.map(note => createNoteElement(note)));
            newNoteElements.forEach(el => el && notesContainer.prepend(el)); // Добавяме ги в началото
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

            const gdDate = lastGDTimestamp ? formatDateTime(lastGDTimestamp) : _('noData');
            const localDate = lastLocalTimestamp ? formatDateTime(lastLocalTimestamp) : _('noData');

            // Създаваме съдържанието без начални отстояния, за да се подравни правилно в модала.
            const content = [
                `${_('sysInfoUser')}: ${currentUserEmail}`,
                `${_('sysInfoLastGDSync')}: ${gdDate}`,
                `${_('sysInfoLastLocalSync')}: ${localDate}`,
                `${_('sysInfoAttachmentLinks')}: ${dbNoteIdType}`,
                `${_('sysInfoDbCreatedFrom')}: ${dbSourceText}`,
                `${_('sysInfoDbOwner')}: ${dbOwnerEmail}`
            ].join('\n');
            showModal({ raw: content, color: '#f0f0f0' });
        } catch (error) {
            console.error("Error fetching system info:", error);
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

function updateSignoutTooltip() {
    const email = sessionStorage.getItem('google_auth_email_hint');
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
            signoutBtn.title = baseTooltip;
        }
    }
}

// =================================================================================
// III. GOOGLE DRIVE АВТЕНТИКАЦИЯ И API
// =================================================================================

async function refreshAuthToken() {
    const loginHint = localStorage.getItem('google_login_hint');
    if (!loginHint) return null;

    // Wait for Google library to load if not ready
    if (typeof google === 'undefined') {
        await new Promise(resolve => {
            const interval = setInterval(() => {
                if (typeof google !== 'undefined') {
                    clearInterval(interval);
                    resolve();
                }
            }, 100);
        });
    }

    return new Promise((resolve) => {
        if (!tokenClient) {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        const tokenWithTimestamp = { ...tokenResponse, issued_at: Date.now() };
                        // Update storage - prefer localStorage if it was there
                        if (localStorage.getItem('google_auth_token')) {
                            localStorage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                        } else {
                            sessionStorage.setItem('google_auth_token', JSON.stringify(tokenWithTimestamp));
                        }
                        // Return success format matching checkAuth expectations
                        resolve({ tokenData: tokenWithTimestamp, pass: true });
                    } else {
                        resolve(null);
                    }
                },
                error_callback: (error) => {
                    console.error("Silent refresh failed:", error);
                    resolve(null);
                }
            });
        }
        // Request token silently
        tokenClient.requestAccessToken({ prompt: 'none', login_hint: loginHint });
    });
}

async function checkAuth() {
    console.log("checkAuth");
    // --- Проверяваме и в двата storage-а за токен ---
    // Това решава проблема с безкрайното презареждане при избрана опция "Запомни ме".
    const sessionToken = sessionStorage.getItem('google_auth_token');
    const localToken = localStorage.getItem('google_auth_token');
    const storedTokenString = sessionToken || localToken;
    if (!storedTokenString) {
        window.location.href = 'login.html';
        return null; // Stop execution
    }
    const tokenData = JSON.parse(storedTokenString);
    // --- Винаги добавяме email_hint от sessionStorage ---
    // Това гарантира, че проверката на токена ще работи коректно,
    // дори когато основният токен се чете от localStorage.
    tokenData.email_hint = sessionStorage.getItem('google_auth_email_hint');
    const isExpired = (Date.now() - tokenData.issued_at) / 1000 > (tokenData.expires_in - 60);
    if (isExpired) {
        console.log("Token expired. Attempting silent refresh...");
        const refreshResult = await refreshAuthToken();
        if (refreshResult && refreshResult.pass) {
            console.log("Silent refresh successful.");
            return refreshResult;
        }

        console.log("Token expired. Redirecting to login for re-authentication.");
        sessionStorage.removeItem('google_auth_token');
        localStorage.removeItem('google_auth_token'); // Изчистваме и от localStorage
        window.location.href = 'login.html?reauth=true';
        return null; // Stop execution
    }
    /*/ --- 🔐 Вградена декрипция ---
    // Първо проверяваме за urlToken, за да видим дали можем да изключим Demo Mode
    const url = new URL(window.location.href);
    const urlTokenParam = url.searchParams.get("token");

    if (urlTokenParam) {
        // Ако има токен в URL-а, той е с приоритет и презаписва стария
        localStorage.setItem('urlToken', urlTokenParam);
    }

    let urlToken = localStorage.getItem('urlToken');

    let isUrlTokenValidTime = false;
    let decryptedEmailFromToken = null;

    if (urlToken) {
        // --- Извличаме валидността от самия токен ---
        let validityInDays = 365; // 3. Стойност по подразбиране в дни
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
            // Декодираме токена, който вече съдържа и валидността
            const [decryptedEmail, timestamp, tokenValidity] = new TextDecoder().decode(out).split('|');

            // 3. Изчисляваме възрастта в дни
            const ageInDays = (Date.now() - parseInt(timestamp, 10)) / (1000 * 60 * 60 * 24);

            if (tokenValidity && !isNaN(parseInt(tokenValidity))) {
                validityInDays = parseInt(tokenValidity, 10);
            }

            tokenRemainingDays = Math.max(0, Math.floor(validityInDays - ageInDays));
            updateSignoutTooltip();
            console.log(`Проверка на токен: Декриптиран имейл: ${decryptedEmail}`);
            console.log(`Проверка на токен: Възраст: ${ageInDays.toFixed(2)} дни, Проверявана валидност: ${validityInDays} дни`);

            if (ageInDays < validityInDays) {
                isUrlTokenValidTime = true;
                decryptedEmailFromToken = decryptedEmail;
                DEMO_MODE = false;
            } else {
                console.log('Резултат от проверката: НЕВАЛИДЕН (изтекъл)');
            }
        } catch (error) {
            console.error("Грешка при декриптиране на токен:", error);
        }
    }
    else DEMO_MODE = true;
    */
    /*/ --- Demo Mode Check --- не се ползва, за изтриване
    if (DEMO_MODE) {
        if (isUrlTokenValidTime) {
            console.log("Valid token detected. Disabling Demo Mode behavior.");
            // Продължаваме към стандартната проверка
        } else {
            console.log("Demo mode active. Skipping auth check.");
            pass = true;
            const email = sessionStorage.getItem('google_auth_email_hint');
            return { tokenData: { email_hint: email }, pass: true };
        }
    }*/
    /*/ --- Финална проверка на urlToken срещу логнатия потребител ---
    let isTokenValid = true; // Приемаме, че токенът е валиден, освен ако проверката не се провали

    if (isUrlTokenValidTime) {
        // Проверяваме дали имейлът съвпада с логнатия потребител
        console.log(`Сравняване на имейли: Токен=${decryptedEmailFromToken}, Сесия=${tokenData.email_hint}`);

        if (decryptedEmailFromToken == tokenData.email_hint) {
            pass = true;
        } else {
            console.log('Резултат от проверката: НЕВАЛИДЕН (грешен имейл)');
        }
    }

    if (!pass) {
        document.body.innerHTML = ''; // Изчистваме само съдържанието на body, не и самия body
        const errorElement = document.createElement('h1');
        errorElement.textContent = 'Невалиден token или токенът е изтекъл.';
        errorElement.style.color = 'yellow';
        errorElement.style.textAlign = 'center';
        errorElement.style.marginTop = '50px';
        document.body.appendChild(errorElement);
    }
    */
    /*/ --- 🔐 Вградена декрипция (скрита логика) стара ---
    const url = new URL(window.location.href);
    const urlToken = url.searchParams.get("token");
    let isTokenValid = true; // Приемаме, че токенът е валиден, освен ако проверката не се провали

    if (urlToken) {
        // --- КОРЕКЦИЯ: Извличаме валидността от самия токен ---
        let validityInMinutes = 5; // Стойност по подразбиране, ако не е намерена в токена
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
            // Декодираме токена, който вече съдържа и валидността
            const [decryptedEmail, timestamp, tokenValidity] = new TextDecoder().decode(out).split('|');
            const ageInMinutes = (Date.now() - parseInt(timestamp, 10)) / 60000;

            if (tokenValidity && !isNaN(parseInt(tokenValidity))) {
                validityInMinutes = parseInt(tokenValidity, 10);
            }

            // Проверяваме дали токенът е изтекъл, дали имейлът съвпада и дали съвпада с логнатия потребител
            console.log(`Проверка на токен: Декриптиран имейл: ${decryptedEmail}, Имейл от сесия: ${tokenData.email_hint}`);
            console.log(`Проверка на токен: Възраст: ${ageInMinutes.toFixed(2)} мин, Проверявана валидност: ${validityInMinutes} мин`);
            if (ageInMinutes < validityInMinutes && decryptedEmail == tokenData.email_hint) pass = true;
            if (ageInMinutes > validityInMinutes || decryptedEmail !== tokenData.email_hint) {
                console.log('Резултат от проверката: НЕВАЛИДЕН');
            }
        } catch (error) {
            console.error("Грешка при декриптиране на токен:", error);
        }
    }
    if (!pass) {
        document.body.innerHTML = ''; // Изчистваме само съдържанието на body, не и самия body
        const errorElement = document.createElement('h1');
        errorElement.textContent = 'Невалиден token или токенът е изтекъл.';
        errorElement.style.color = 'yellow';
        errorElement.style.textAlign = 'center';
        errorElement.style.marginTop = '50px';
        document.body.appendChild(errorElement);
    }*/
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
    // localStorage.clear();
    // sessionStorage.clear();
    // Премахваме само ключовете, свързани с удостоверяването
    localStorage.removeItem('google_auth_token');
    sessionStorage.removeItem('google_auth_token');
    sessionStorage.removeItem('google_auth_email_hint');
    localStorage.removeItem('google_login_hint'); // Спираме автоматичния вход

    // Пренасочваме към страницата за вход
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
        if (useIndexedDb && useGoogleDb) {
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

    // Check for at least one board.txt file
    if (boardsData.length === 0) {
        showToast(_('errorNoBoardFilesFound'), 15000);
        return { error: 'NO_BOARD_FILES' }; // Връщаме специален статус
    }
    const { data: mediaFileData } = await loadAndParseFile('media.txt', folderId, modifiedSince);
    mediaData = mediaFileData;
    const onNoteProgress = (loaded, total) => {
        loaderText.textContent = `${_('loadingFile')} ${loaded} ${_('of')} ${total}`;
    };
    loaderText.textContent = _('loadingFile') + ' note.txt...';
    const noteResults = await fetchFiles('note.txt', folderId, onNoteProgress, modifiedSince);
    allNotesData = noteResults.map(r => JSON.parse(r.res.body));

    if (allNotesData.length === 0) {
        showToast(_('errorNoNoteFilesFound'));
        return { error: 'NO_NOTE_FILES' }; // Връщаме специален статус
    }

    return { boardParseError };
}

/**
 * Fetches only updated files from Google Drive since the last sync and updates IndexedDB.
 */
async function runGoogleDriveSync() {
    const loaderTitle = document.getElementById('loader-title'); // Взимаме елемента за заглавие
    // Коригирана проверка: използваме общата настройка 'useIndexedDb'
    const useIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
    if (!useIndexedDb) {
        console.log("Skipping Google Drive sync because IndexedDB is disabled for this mode.");
        return 0;
    }

    let updatedFilesCount = 0;
    let lastSyncTimestamp = null;
    // Коригирана проверка: използваме общата настройка 'updateFromSource'
    const updateOnly = localStorage.getItem('updateFromSource') !== 'false';
    // Get the timestamp only if "update only" is checked
    if (updateOnly) {
        // Винаги четем timestamp-а от IndexedDB, тъй като е персистентен.
        // localStorage се изтрива при logout, което правеше тази стойност невалидна.
        if (dbExists) {
            lastSyncTimestamp = await getConfig('lastGDTimestamp');
            if (lastSyncTimestamp) lastSyncTimestamp = parseInt(lastSyncTimestamp, 10);
        }
    }
    // This will be null if updateOnly is false or if no timestamp is found,
    // triggering a full sync in those cases.
    const modifiedSince = lastSyncTimestamp ? new Date(lastSyncTimestamp).toISOString() : null;

    if (updateOnly && modifiedSince) {
        console.log(`Checking for Google Drive updates since ${modifiedSince}`);
        // --- КОРЕКЦИЯ: Преместваме съобщението в заглавието ---
        if (loaderTitle) {
            loaderTitle.innerText = _('checkingForGDriveUpdates')
                .replace('{date}', new Date(lastSyncTimestamp).toLocaleString(currentLang));
        }
    } else {
        console.log('Performing full initial sync from Google Drive to local DB.');
        // --- КОРЕКЦИЯ: Преместваме съобщението в заглавието ---
        if (loaderTitle) loaderTitle.textContent = _('initialGDriveSync');
    }
    const folderId = await getFolderID();
    if (!folderId) {
        showToast(_('errorFolderNotFound'));
        return 0;
    }
    const syncFile = async (filename, storeName, isNote = false) => {
        loaderText.textContent = _('checkingFile').replace('{filename}', filename);
        const files = await fetchFiles(filename, folderId, null, modifiedSince);
        if (files.length > 0) {
            updatedFilesCount += files.length;
            console.log(`Found ${files.length} updated '${filename}' file(s).`);
            const { data } = await parseFileResults(files, filename);
            if (data.length > 0) {
                loaderText.textContent = _('savingChangesFromFile').replace('{filename}', filename);
                await bulkPutDB(storeName, data, true);
                if (isNote) {
                    data.forEach(note => updatedNoteGdims.push(note.gdid));
                }
            }
        }
    };
    await syncFile('board.txt', BOARD_STORE_NAME, false);
    await syncFile('media.txt', MEDIA_STORE_NAME, false);
    await syncFile('note.txt', NOTE_STORE_NAME, true); // Подаваме флаг, че това са бележки

    // ЗАПИСВАМЕ TIMESTAMP-А СЛЕД УСПЕШНА СИНХРОНИЗАЦИЯ
    const now = Date.now();
    await saveConfig('lastGDTimestamp', now);

    loaderText.textContent = _('syncFinishedLoadingData');
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
        await bulkPutDB(BOARD_STORE_NAME, boardsData);
        await bulkPutDB(MEDIA_STORE_NAME, mediaData);
        await bulkPutDB(NOTE_STORE_NAME, allNotesData);
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

        dbExists = true; // Маркираме, че базата вече съществува
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
        if (currentUseGoogleDb) title = 'Режим: База данни + Google Drive';
        else if (currentUseLocalFolder) title = 'Режим: База данни + Локална папка';
        else if (currentUseArhDb) title = 'Режим: База данни + Архив';
    } else if (currentUseArhDb) {
        iconSrc = 'Zip.png';
        title = 'Режим: Архив';
    } else if (currentUseLocalFolder) {
        iconSrc = 'Folder.png';
        title = 'Режим: Локална папка';
    } else if (currentUseGoogleDb) {
        iconSrc = 'GDrive.png';
        title = 'Режим: Google Drive';
    } else if (currentUseIndexedDb) {
        iconSrc = 'Database.png';
        title = 'Режим: База данни';
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
    useGoogleDb = localStorage.getItem('useGoogleDb') !== 'false'; // true по подразбиране
    useLocalFolder = localStorage.getItem('useLocalDb') === 'true';
    useArhDb = localStorage.getItem('useArhDb') === 'true';
    useIndexedDb = localStorage.getItem('useIndexedDb') === 'true';
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
async function mainLogic() {
    dbSourceGlobal = null; // Нулираме глобалните променливи
    isLoadCancelled = false; // Нулираме флага за отказ при всяко ново зареждане
    updatedNoteGdims = []; // Изчистваме масива с обновени бележки при всяко зареждане
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
    /*
            // --- ЗАДЪЛЖИТЕЛНО УДОСТОВЕРЯВАНЕ И ПРОВЕРКА НА ПОТРЕБИТЕЛ ---
            // Тази логика трябва да е в самото начало, преди да се вземе решение за източника на данни.
            const tokenData = checkAuth();
            if (!tokenData) {
            if (isLoadCancelled) return;
                loaderContainer.style.display = 'none';
                return; // Прекратяваме, checkAuth вече е пренасочил.
            }
            authToken = tokenData;
    
            // Проверяваме за съвпадение на потребителя, ако има локална база.
            // Тази функция може да промени настройките в localStorage.
            await userCheck();
            if (isLoadCancelled) return;
            // ПРЕЗАРЕЖДАМЕ флаговете, в случай че userCheck ги е променил!
            updateGlobalStateFlags();
    */
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
            if (dbSourceGlobal === null) dbSourceGlobal = await getConfig('dbSource');
            if (dbNoteIdTypeGlobal === null) dbNoteIdTypeGlobal = await getConfig('dbNoteIdType');

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
                if (result.error) { // Проверяваме за грешка при зареждането
                    return; // Прекратяваме, ако няма файлове
                }
                // Прилагаме филтъра за демо версията ПРЕДИ рендиране
                filterNotesForDemo();
                await renderUI({ boardParseError: result.boardParseError });
            } else if (useLocalFolder) {
                console.log("Source: Local Folder");
                if (loaderTitle) loaderTitle.textContent = "Локална папка";
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
                // }
            }
        }
    } catch (err) {
        console.error("Error in mainLogic:", err);
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
        notesContainer.style.backgroundImage = `url('Board.png')`; // Reset background

        // Скриваме лоудъра
        loaderContainer.style.display = 'none';
        // Показваме основните елементи, след като всичко е заредено
        document.querySelector('header').style.visibility = 'visible';
        document.querySelector('#search-wrapper').style.display = 'flex';
        notesContainer.style.visibility = 'visible';
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
                localNotes.push(fileObject);
            }
        }
    } catch (err) {
        if (err.name === 'NotFoundError') {
            console.error("Local folder not found:", err);
            showToast(_('errorLocalFolderNotFound'), 15000);
            // Изчистваме невалидния handle от базата данни
            await saveConfig('directoryHandle', null);
            // Отваряме настройките, за да може потребителят да избере нова папка
            document.getElementById('settings-modal').classList.add('visible');
            // Нулираме и UI елемента, показващ името на папката
            const folderNameDisplay = document.getElementById('local-sync-folder-name');
            if (folderNameDisplay) folderNameDisplay.textContent = _('folderNotSelected');
        } else {
            console.error("Error parsing local files:", err);
            showToast(_('errorNoteParse'));
        }
        boardParseError = true; // Вдигаме флага за грешка и в двата случая
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
    allNotesData = notesFromDB;

    console.log(`Loaded ${boardsData.length} boards, ${mediaData.length} media, and ${allNotesData.length} notes from DB.`);
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
        loaderText.textContent = _('checkedFilesCount').replace('{count}', fileCount);
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
                        // Попълваме масива с обновените бележки
                        updatedNoteGdims.push(fileObject.gdid);
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
 * Показва преглед на изображение/видео в рамките на самата бележка.
 * @param {HTMLElement} noteElement - DOM елементът на бележката.
 * @param {string} fileIdOrPath - ID на файла (Google Drive) или път до файла (локален/архив).
 * @param {string} sourceMode - 'gdrive', 'local' или 'archive'.
 * @param {boolean} isVideo - Дали файлът е видео.
 */
async function showInNotePreview(noteElement, fileIdOrPath, sourceMode, isVideo) {
    if (!noteElement || noteElement.querySelector('.image-preview-overlay')) return;

    let mediaUrl;
    const folderName = isVideo ? 'Video' : 'Images';

    try {
        // --- КОРЕКЦИЯ: Проверяваме за gapi ПРЕДИ да го използваме ---
        // Изпълняваме логиката за Google Drive, само ако gapi е заредено И sourceMode е 'gdrive'.
        if (typeof gapi !== 'undefined' && gapi.client && sourceMode === 'gdrive') {
            const fileMetadata = await gapi.client.drive.files.get({ fileId: fileIdOrPath, fields: 'thumbnailLink' });
            const thumbnailUrl = fileMetadata.result.thumbnailLink;
            if (!thumbnailUrl) throw new Error(_(isVideo ? 'noVideoPreview' : 'noImgPreview'));
            mediaUrl = thumbnailUrl.replace(/=s\d+/, '=s1600');
        } else { // 'local' or 'archive'
            // Тази част от кода вече ще се изпълнява правилно в офлайн режими,
            // защото проверката за gapi по-горе ще е неуспешна.
            let fileHandle;
            const fileName = fileIdOrPath.split('/').pop();
            if (sourceMode === 'local') {
                // В локален режим файловете са в подпапки
                const folderHandle = await dirHandle.getDirectoryHandle(folderName, { create: false });
                fileHandle = await folderHandle.getFileHandle(fileName);
            } else { // 'archive'
                // В архивен режим файловете са директно в основната папка
                fileHandle = await dirHandle.getFileHandle(fileName);
            }
            const file = await fileHandle.getFile(); // Взимаме файла от правилния handle
            mediaUrl = URL.createObjectURL(file);
        }

        const overlay = document.createElement('div');
        overlay.className = 'image-preview-overlay'; // Този клас вече съществува
        Object.assign(overlay.style, { position: 'absolute', top: '0', left: '0', width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: '10', borderRadius: '8px' });

        const mediaElement = isVideo ? document.createElement('video') : document.createElement('img');
        mediaElement.src = mediaUrl;
        if (isVideo) mediaElement.controls = true;
        Object.assign(mediaElement.style, { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', padding: '10px', boxSizing: 'border-box' });
        overlay.appendChild(mediaElement);

        const closeButton = document.createElement('button');
        closeButton.className = 'view-button';
        closeButton.innerHTML = eyeOffIconSvg;
        Object.assign(closeButton.style, { position: 'absolute', top: '10px', right: '10px' });
        closeButton.querySelector('svg').style.stroke = 'white';
        closeButton.addEventListener('click', (ev) => { ev.stopPropagation(); overlay.remove(); });
        overlay.appendChild(closeButton);

        noteElement.appendChild(overlay);
    } catch (err) {
        console.error(`Error showing in-note preview:`, err);
        showToast(_(isVideo ? 'errorVideoPreview' : 'errorImgPreview').replace('{error}', (err.message || err)));
    }
}

/**
 * Добавя event listener към елемент за показване на преглед в бележката.
 * @param {HTMLElement} element - DOM елементът, към който да се добави listener (напр. икона).
 * @param {string} fileIdentifier - ID на файла (Google Drive) или път до файла (локален/архив).
 * @param {string} sourceMode - 'gdrive', 'local' или 'archive'.
 * @param {boolean} isVideo - Дали файлът е видео.
 */
function addInNotePreviewListener(element, fileIdentifier, sourceMode, isVideo) {
    element.style.cursor = 'pointer';
    element.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        const noteElement = e.currentTarget.closest('.note');
        showInNotePreview(noteElement, fileIdentifier, sourceMode, isVideo);
    });
}

// =================================================================================
// V. СЪЗДАВАНЕ И УПРАВЛЕНИЕ НА UI ЕЛЕМЕНТИ
// =================================================================================

function showModal(options, noteElement = null) {
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
                    await handleAttachment(attachment, attachmentWrapper, iconData, 'archive');
                } else if (useLocalFolder) {
                    await handleAttachment(attachment, attachmentWrapper, iconData, 'local');
                } else {
                    await handleGoogleDriveAttachment(attachment, attachmentWrapper, iconData);
                }
                modalBody.appendChild(attachmentWrapper);
            });
        }
    }
    // --- КРАЙ НА ДОБАВЕНАТА ЛОГИКА ---

    copyBtn.innerHTML = copyIconSvg;
    // --- Логика за навигация между бележките ---
    const prevBtn = document.getElementById('prev-note-btn');
    const nextBtn = document.getElementById('next-note-btn');
    const deleteBtn = document.getElementById('delete-modal-btn');

    // Показваме/скриваме бутона за изтриване
    if (noteElement && useIndexedDb) {
        deleteBtn.style.display = 'flex';
        // Премахваме стари event listeners и добавяме нов
        const newDeleteBtn = deleteBtn.cloneNode(true);
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
        newDeleteBtn.addEventListener('click', (e) => {
            handleNoteDelete(noteElement, e, true); // true, за да затвори модала
        });
    } else {
        deleteBtn.style.display = 'none';
    }


    if (noteElement) {
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
        // Ако не е подаден елемент на бележка (напр. за системна информация), скриваме бутоните
        prevBtn.style.display = 'none';
        nextBtn.style.display = 'none';
        const boardNameEl = document.getElementById('modal-board-name');
        if (boardNameEl) boardNameEl.style.left = '15px';
    }
}

function showAllBoardsModal() {
    const modalContent = document.createElement('div');
    const boardsModal = document.getElementById('boards-menu-modal');
    modalContent.className = 'all-boards-modal-container';

    // Взимаме всички бутони от главното меню в хедъра
    const headerMenuContainer = document.querySelector('header .board-menu-container');
    if (!headerMenuContainer) return; // Предпазна мярка

    const headerButtons = headerMenuContainer.querySelectorAll('.board-filter-link');

    headerButtons.forEach(button => {
        const clone = button.cloneNode(true);
        // --- КОРЕКЦИЯ: Прилагаме същата ширина като на бутоните в хедъра ---
        clone.style.width = `${maxWidthForButtons}px`;
        clone.addEventListener('click', async (e) => {
            e.preventDefault();
            // Връщаме старата логика: затваряме менюто веднага
            boardsModal.classList.remove('visible');
            filterNotesByBoard(clone.dataset.boardid, true, e.currentTarget);
        });
        modalContent.appendChild(clone);
    });

    const boardsModalBody = document.getElementById('boards-menu-modal-body');
    boardsModalBody.innerHTML = '';
    boardsModalBody.appendChild(modalContent);
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
    const specialBoards = ['all', 'calendar', 'reminder', 'new-updates'];
    if (!specialBoards.includes(boardId)) {
        // --- КОРЕКЦИЯ ЗА РЕЖИМИ НА РАБОТА ---
        // В режим "Архив" (useArhDb), бележките се свързват с борда по числов `id`.
        // В другите режими - по текстов `gdid`.
        // Бутоните за филтриране винаги подават `gdid`.
        // Тази логика проверява дали бордът съществува и задава правилния
        // идентификатор за филтриране (`currentBoardFilter`).

        let boardToFilter = null;
        // Търсим борда по gdid, който идва от клик на бутон
        const board = boardsData.find(b => b.gdid === boardId);

        if (board) {
            // Ако сме в режим Архив, ще филтрираме по числовото `id`.
            // В противен случай - по `gdid`.
            boardToFilter = useArhDb ? board.id : board.gdid;
        }

        // Проверяваме дали сме намерили борд. `boardId` е оригиналният gdid от бутона.
        const boardExists = boardsData.some(b => b.gdid === boardId);

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
    if (boardId === 'calendar') {
        // Проверяваме коя версия на календара да покажем
        if (localStorage.getItem('showWeeklyCalendar') === 'true') {
            renderWeeklyCalendarView();
        } else {
            renderCalendarView();
        }
        return;
    }
    searchInput.value = ''; // Clear the search box
    saveSearchBtn.style.display = 'none';

    // Задаваме правилния филтър (числов id за Архив, gdid за другите)
    currentBoardFilter = specialBoards.includes(boardId) ? boardId : (useArhDb ? boardsData.find(b => b.gdid === boardId)?.id : boardId);

    // --- НОВА ЛОГИКА: Анимация в бутона за режим ---
    const modeButton = document.getElementById('mode_button');
    const loadingIcon = modeButton ? modeButton.querySelector('#mode-button-loading-icon') : null;

    const runFilter = () => {
        applyFilters();
        // Спираме анимацията СЛЕД като филтрирането е приключило
        if (modeButton && loadingIcon) {
            modeButton.classList.remove('mode-button-loading');
            loadingIcon.classList.remove('button-loading');
        }
    };

    if (modeButton && loadingIcon) {
        modeButton.classList.add('mode-button-loading');
        loadingIcon.classList.add('button-loading');
        // Използваме setTimeout, за да позволим на браузъра да рендира анимацията
        // преди да започне тежката операция по филтриране.
        setTimeout(runFilter, 10);
    } else {
        runFilter(); // За всички други бутони, изпълняваме веднага
    }

    // Маркираме избрания бутон. `boardId` тук е оригиналният `gdid` от бутона.
    document.querySelectorAll('.board-filter-link').forEach(link => {
        link.classList.toggle('selected-board', link.dataset.boardid === boardId);
    });


    // Update search box placeholder based on the selected board
    if (boardId === 'reminder') {
        searchInput.placeholder = `[${_('reminder')}]: ${_('searchPlaceholder')}`;
    } else if (boardId === 'new-updates') {
        searchInput.placeholder = `[${_('newUpdates')}]: ${_('searchPlaceholder')}`;
    } else if (boardId !== 'all' && boardId !== 'calendar') {
        // Търсим по gdid, за да вземем заглавието
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
        notesContainer.style.backgroundImage = `url('${newBackground}')`;
        currentBackground = newBackground;
    }
    updateSearchPlaceholder();
    if (boardId === 'all') {
        scrollTopBtn.innerHTML = arrowSvg;
    } else if (boardId === 'reminder') {
        scrollTopBtn.innerHTML = `${_('reminder')} ${arrowSvg}`;
    } else if (boardId === 'new-updates') {
        scrollTopBtn.innerHTML = `${_('newUpdates')} ${arrowSvg}`;
    } else {
        // Търсим по gdid, за да вземем заглавието
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

/**
 * Сортира и пренарежда видимите бележки в DOM.
 * @param {Array<Object>} visibleNotes - Масив от обекти, съдържащи {element, numord}.
 */
/*function sortAndReorderNotes(visibleNotes) {
    // Тази функция вече е празна, логиката е преместена в applyFilters
}*/

/*function applySearchFilter() {
    applyFilters();
}*/

function applyFilters() {
    const searchTerm = searchBox.value.toLowerCase();
    const notes = Array.from(notesContainer.getElementsByClassName('note'));

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
            (currentBoardFilter === 'new-updates' && updatedNoteGdims.includes(data.gdid)) ||
            (data.boardid == currentBoardFilter); // Използваме '==' за да сравняваме число и стринг, ако се наложи

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
            visibleCount++;
            note.style.display = 'flex';
        } else {
            note.style.display = 'none';
        }
    }

    // --- НОВА ЛОГИКА ЗА СОРТИРАНЕ ---
    if (localStorage.getItem('enableNoteSorting') === 'true') {
        const visibleNotes = Array.from(notesContainer.querySelectorAll('.note:not(.boards-note)[style*="display: flex"]'));
        const sortCriteria = localStorage.getItem('sortCriteria') || 'numord';
        const sortInReverse = localStorage.getItem('sortInReverse') === 'true';
        const sortRemindersTop = localStorage.getItem('sortRemindersTop') === 'true';

        const sortOrder = sortInReverse ? -1 : 1;

        visibleNotes.sort((noteA, noteB) => {
            const dataA = JSON.parse(noteA.dataset.extraInfo || '{}');
            const dataB = JSON.parse(noteB.dataset.extraInfo || '{}');

            // 1. Приоритет за напомнянията
            if (sortRemindersTop) {
                const isReminderA = dataA.timer && dataA.timer !== 0;
                const isReminderB = dataB.timer && dataB.timer !== 0;
                if (isReminderA && !isReminderB) return -1;
                if (!isReminderA && isReminderB) return 1;
            }

            // 2. Основно сортиране
            let valA, valB;
            if (sortCriteria === 'alpha') {
                valA = noteA.querySelector('h3')?.textContent.trim().toLowerCase() || '';
                valB = noteB.querySelector('h3')?.textContent.trim().toLowerCase() || '';
            } else if (['date', 'datemod', 'calendarDate'].includes(sortCriteria)) {
                valA = dataA[sortCriteria] ? new Date(dataA[sortCriteria]) : null;
                valB = dataB[sortCriteria] ? new Date(dataB[sortCriteria]) : null;
            } else {
                valA = dataA[sortCriteria];
                valB = dataB[sortCriteria];
            }

            // Обработка на null/undefined стойности, за да са винаги накрая
            const aExists = valA !== null && valA !== undefined && valA !== '';
            const bExists = valB !== null && valB !== undefined && valB !== '';

            if (!aExists && bExists) return 1;
            if (aExists && !bExists) return -1;
            if (!aExists && !bExists) return 0;

            // Сравнение с отчитане на посоката
            if (valA < valB) return -1 * sortOrder;
            if (valA > valB) return 1 * sortOrder;
            return 0; // Елементите са равни
        });

        // Пренареждане в DOM
        visibleNotes.forEach(note => notesContainer.appendChild(note));
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
        showToast(_('errorFetchingFileId').replace('{fileName}', fileName));
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
                console.log(`Folder '${name}' not found within 'Google Drive: multinotes_data'.`);
                folderIds[name] = "";
            }
        }
        return multinotesDataId;
    } catch (error) {
        console.error("Error in getFolderID:", error);
        showToast(_('errorFetchingFolderIds'));
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

    // --- УСЛОВНО ДОБАВЯНЕ НА БОРД "ВСИЧКИ" ---
    if (localStorage.getItem('showBoardAll') !== 'false') {
        const allBoardsLink = document.createElement('span');
        allBoardsLink.classList.add('board-filter-link', 'all-boards-filter-btn');
        allBoardsLink.dataset.boardid = 'all';
        allBoardsLink.title = _('allBoardsCtrlClickTooltip');
        const allBoardsText = document.createElement('span');
        allBoardsText.textContent = _('allBoards');
        allBoardsLink.appendChild(allBoardsText);
        addAllBoardsModalEvents(allBoardsLink, (e) => filterNotesByBoard('all', true, e.currentTarget));
        allButtonLinks.push(allBoardsLink);
    }
    const showCount = localStorage.getItem('showBoardNoteCount') === 'true';
    const calendarNoteCount = boardsData.calendarNoteCount || 0;
    const calendarLink = document.createElement('span');
    calendarLink.textContent = showCount && calendarNoteCount > 0 ? `${_('calendar')} (${calendarNoteCount})` : _('calendar');
    calendarLink.classList.add('board-filter-link', 'calendar-filter-btn');
    calendarLink.dataset.boardid = 'calendar';
    calendarLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        filterNotesByBoard('calendar', false);
    });
    allButtonLinks.push(calendarLink);

    // --- ДОБАВЯНЕ НА ВРЕМЕНЕН БОРД "НОВИ" ---
    if (updatedNoteGdims.length > 0) {
        const newUpdatesLink = document.createElement('span');
        newUpdatesLink.textContent = `${_('newUpdates')} (${updatedNoteGdims.length})`;
        newUpdatesLink.classList.add('board-filter-link', 'new-updates-filter-btn');
        newUpdatesLink.dataset.boardid = 'new-updates';
        newUpdatesLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            filterNotesByBoard('new-updates', false);
        });
        allButtonLinks.push(newUpdatesLink);
    }

    // --- УСЛОВНО ДОБАВЯНЕ НА БОРД "НАПОМНЯНИЯ" ---
    if (localStorage.getItem('showBoardRemind') !== 'false') {
        const reminderNoteCount = boardsData.reminderNoteCount || 0;
        const reminderLink = document.createElement('span');
        reminderLink.textContent = showCount && reminderNoteCount > 0 ? `${_('reminder')} (${reminderNoteCount})` : _('reminder');
        reminderLink.classList.add('board-filter-link', 'reminder-filter-btn');
        reminderLink.dataset.boardid = 'reminder';
        reminderLink.addEventListener('click', (e) => {
            e.preventDefault();
            e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            filterNotesByBoard('reminder', false);
        });
        allButtonLinks.push(reminderLink);
    }
    // Сортираме бордовете по полето numord, преди да създадем бутоните
    boardsData.sort((a, b) => {
        const numordA = a.numord !== undefined && a.numord !== null ? a.numord : Infinity;
        const numordB = b.numord !== undefined && b.numord !== null ? b.numord : Infinity;
        return numordA - numordB;
    })
        .forEach(board => {
            if (!board.title || !board.gdid) return;
            const noteCount = board.noteCount || 0;
            const showCount = localStorage.getItem('showBoardNoteCount') === 'true';

            const link = document.createElement('span');
            link.textContent = (showCount && noteCount > 0) ? `${board.title} (${noteCount})` : board.title;
            link.classList.add('board-filter-link');
            link.dataset.boardid = board.gdid;
            if (board.color !== undefined && !isNaN(board.color) && board.color >= 0 && board.color <= 6) {
                link.style.backgroundColor = `var(--board-bg-${board.color})`;
            }
            link.style.color = 'black';
            if (board.status === 1) link.style.color = 'red';
            link.addEventListener('click', (e) => {
                e.preventDefault(); // Винаги предотвратяваме действието по подразбиране
                if (debug && e.ctrlKey) {
                    showModal(JSON.stringify(board, null, 2));
                } else {
                    // Първо се уверяваме, че целият бутон е видим
                    e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
                    filterNotesByBoard(board.gdid, false); // След това филтрираме без допълнително скролиране
                }
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
    addAllBoardsModalEvents(leftArrow, () => { showAllBoardsModal(); });
    scrollWrapper.appendChild(leftArrow);
    scrollWrapper.appendChild(contentEl);
    contentWrapper.appendChild(scrollWrapper);

    // Лявата стрелка вече е винаги видима чрез CSS или директно добавяне на клас.
    // Няма нужда от динамична проверка при скрол.
    leftArrow.classList.add('visible');

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
    const showBoardNoteCountCheckbox = document.getElementById('show-board-note-count-checkbox');
    const showBoardAllCheckbox = document.getElementById('all-board-checkbox');
    const weeklyCalendarCheckbox = document.getElementById('weekly-calendar-checkbox');
    const showBoardRemindCheckbox = document.getElementById('remind-board-checkbox');
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

        // --- Прозрачност при използване на плъзгача ---
        const settingsModal = document.getElementById('settings-modal');
        const startOpacityChange = () => {
            if (settingsModal) settingsModal.style.opacity = '0.5';
        };
        const endOpacityChange = () => {
            if (settingsModal) settingsModal.style.opacity = '1';
        };

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

        // Weekly Calendar Checkbox
        if (weeklyCalendarCheckbox) {
            weeklyCalendarCheckbox.checked = localStorage.getItem('showWeeklyCalendar') === 'true';
            weeklyCalendarCheckbox.addEventListener('change', () => {
                localStorage.setItem('showWeeklyCalendar', weeklyCalendarCheckbox.checked.toString());
                showToast(_('settingSaved'), 2000);
                // No need to rerender, it's checked on calendar view open
            });
        }

        // Order checkbox
        orderCheckbox.checked = localStorage.getItem('enableNoteSorting') === 'true';
        const sortingOptionsSection = document.getElementById('sorting-options-section');
        const sortingArrow = document.getElementById('sorting-arrow');

        // Event listener for the checkbox itself
        orderCheckbox.addEventListener('change', () => {
            localStorage.setItem('enableNoteSorting', orderCheckbox.checked);
            applyFilters(); // Прилагаме филтрите, за да се отрази сортирането веднага
            showToast(_('settingSaved'), 2000);
        });

        // Event listener for the arrow ONLY
        sortingArrow.addEventListener('click', () => {
            const isActive = sortingOptionsSection.style.display === 'block';
            sortingOptionsSection.style.display = isActive ? 'none' : 'block';

            // Animate arrow rotation
            sortingArrow.style.transition = 'transform 0.3s ease';
            sortingArrow.style.transform = isActive ? 'rotate(0deg)' : 'rotate(180deg)';
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
                    // Автоматично активиране на сортирането при избор на критерий
                    if (!orderCheckbox.checked) {
                        orderCheckbox.checked = true;
                        localStorage.setItem('enableNoteSorting', 'true');
                    }
                    localStorage.setItem('sortCriteria', radio.value);
                    applyFilters();
                    showToast(_('settingSaved'), 2000);
                }
            });
        });

        const sortReverseCheckbox = document.getElementById('sort-reverse-checkbox');
        sortReverseCheckbox.checked = localStorage.getItem('sortInReverse') === 'true';
        sortReverseCheckbox.addEventListener('change', () => {
            // Автоматично активиране на сортирането
            if (!orderCheckbox.checked) {
                orderCheckbox.checked = true;
                localStorage.setItem('enableNoteSorting', 'true');
            }
            localStorage.setItem('sortInReverse', sortReverseCheckbox.checked);
            applyFilters();
            showToast(_('settingSaved'), 2000);
        });

        const sortRemindersTopCheckbox = document.getElementById('sort-reminders-top-checkbox');
        sortRemindersTopCheckbox.checked = localStorage.getItem('sortRemindersTop') === 'true';
        sortRemindersTopCheckbox.addEventListener('change', () => {
            // Автоматично активиране на сортирането
            if (!orderCheckbox.checked) {
                orderCheckbox.checked = true;
                localStorage.setItem('enableNoteSorting', 'true');
            }
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
        const dbSectionWrapper = document.getElementById('db-section-wrapper');
        const useIndexedDbCheckbox = document.getElementById('use-indexeddb-checkbox');
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
                const confirmedConfigDelete = await showConfirmation(_('confirmConfigDelete'));
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
            <option value="calendar">${_('calendar')}</option>
            <option value="reminder">${_('reminder')}</option>
        `;
    boardsData.forEach(board => {
        if (board.gdid && board.title) {
            startBoardSelect.add(new Option(board.title, board.gdid));
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

                // Показваме JSON само в дебъг режим
                if (debug) {
                    iconDiv.style.cursor = 'pointer';
                    iconDiv.addEventListener('click', (e) => {
                        e.stopPropagation();
                        showModal(JSON.stringify(attachment, null, 2));
                    });
                }
            }
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
    const fileId = attachment.pathGD; // Вече имаме fileId директно в attachment обекта.
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
            // const fileId = await getFileID(folderIds[link.dataset.folderName], link.dataset.fileName);
            if (fileId) {
                window.open(`https://drive.google.com/file/d/${fileId}/view`, '_blank', 'noopener,noreferrer');
            } else {
                showToast(_('errorFetchFileId').replace('{fileName}', link.dataset.fileName));
            }
        };
    };

    switch (attachment.type) {
        case 1: // Image
            setupLink('Images', ''); // Продължаваме да създаваме линка за отваряне в нов таб
            addInNotePreviewListener(iconDiv, fileId, 'gdrive', false);
            attachmentWrapper.appendChild(link);
            break;
        case 2: // Sound
            setupLink('Sound', '');
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
            setupLink('Other', '');
            attachmentWrapper.appendChild(link);
            break;
        case 4: // Video
            setupLink('Video', '');
            const videoTextContainer = document.createElement('div');
            videoTextContainer.style.flexGrow = '1';
            videoTextContainer.style.flexShrink = '1';
            videoTextContainer.style.minWidth = '0';
            videoTextContainer.appendChild(link);
            const videoLine2 = document.createElement('div');
            videoLine2.textContent = attachment.description || '';
            videoTextContainer.appendChild(videoLine2);
            addInNotePreviewListener(iconDiv, fileId, 'gdrive', true);
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
            }
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
    note.className = 'note note-item';
    let fileContent = '';
    let noteGdid = null;
    let noteID = null;
    let noteColor = null;
    let textSpan = null;
    let extraData = {};
    const fullNoteContent = noteContent; // Вече имаме целия обект
    try {
        if (noteContent && typeof noteContent.notetxt !== 'undefined') {
            fileContent = noteContent.notetxt;
            noteGdid = noteContent.gdid;
            noteID = noteContent.id;
            noteColor = noteContent.color;
            if (noteContent.text_span) {
                textSpan = noteContent.text_span;
            }
            extraData = { ...noteContent };
            delete extraData.notetxt;
            if (Object.keys(extraData).length > 0) note.dataset.extraInfo = JSON.stringify(extraData);
            if (noteColor && !isNaN(noteColor) && noteColor >= 0 && noteColor <= 9) {
                // Color will be handled by canvas background
            }
            if (extraData.status === 1) {
                return null; // Skip this note if status is 1
            }
        } else { throw new Error(_('errorNoteFieldMissing')); }
    } catch (e) { fileContent = _('errorNoteParse'); }
    const isHiddenNote = extraData.pass === true;
    const isType1Note = extraData.type === 1;
    // let attachments = [];
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
        if (debug) {
            e.stopPropagation();
            showModal({ raw: JSON.stringify(fullNoteContent, null, 2), color: 'white' });
        }
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

    // --- Логика за клик, Ctrl+клик и продължително натискане (long press) ---
    let longPressTimer;
    let isLongPress = false;

    const handleNoteDelete = async (noteEl, e, fromModal = false) => {
        e.stopPropagation();
        e.preventDefault();
        isLongPress = false;
        clearTimeout(longPressTimer); // Спираме таймера, ако е бил стартиран

        if (!useIndexedDb) return; // Изтриването работи само с база данни

        // Ако е извикано от модала, първо го затваряме.
        if (fromModal) {
            document.getElementById('content-modal').classList.remove('visible');
            // Изчакваме анимацията на затваряне да приключи, преди да покажем потвърждението.
            await new Promise(resolve => setTimeout(resolve, 150));
        }

        const confirmed = await showConfirmation(_('confirmNoteDelete'));
        if (confirmed) {
            try {
                let totalNotes;
                await deleteFromDB(NOTE_STORE_NAME, noteGdid);

                // Стъпка 1: Премахване от DOM и allNotesData
                noteEl.remove();
                allNotesData = allNotesData.filter(n => n.gdid !== noteGdid);

                // Стъпка 2: Намиране на борда
                const deletedNoteBoardId = extraData.boardid;
                const isArh = useArhDb || (useIndexedDb && dbSourceGlobal === 3);
                const boardToUpdate = boardsData.find(b => (isArh ? b.id : b.gdid) == deletedNoteBoardId);

                // Стъпка 3: Намаляване на брояча в хедъра
                const noteCounter = document.getElementById('note-counter');
                if (noteCounter) {
                    noteCounter.textContent = parseInt(noteCounter.textContent, 10) - 1;
                    totalNotes = parseInt(noteCounter.textContent, 10);
                }

                if (boardToUpdate) {
                    // Стъпка 4: Актуализация на boardsData
                    boardToUpdate.noteCount = totalNotes;

                    // Стъпка 5: Актуализация на UI (винаги използваме новата стойност от noteCounter)
                    const boardButton = document.querySelector(`.board-filter-link[data-boardid="${boardToUpdate.gdid}"]`);
                    if (boardButton) {
                        const showCount = localStorage.getItem('showBoardNoteCount') === 'true';
                        const newText = (showCount && boardToUpdate.noteCount > 0) ? `${boardToUpdate.title} (${totalNotes})` : boardToUpdate.title;
                        boardButton.textContent = newText;
                    }
                }
                showToast(_('noteDeletedSuccess'), 3000);
            } catch (error) {
                console.error("Failed to delete note:", error);
                showToast(_('noteDeletedError') + " - " + error.message, 15000);
            }
        }
    };

    // Обработва клик върху цялата бележка (с изключение на хедъра)
    const handleNoteClick = (e) => {
        // Отваряме модала, само ако не е long press и кликът не е върху футъра
        if (!isLongPress && !e.target.closest('.note-footer')) {
            const noteBgColor = noteColor !== null ? `var(--note-bg-${noteColor})` : 'var(--note-bg-0)';
            showModal({ raw: fileContent, format: textSpan, color: noteBgColor, boardId: extraData.boardid, id: noteID, gdid: noteGdid }, note);
        }
    };

    // Обработва клик върху хедъра (за изтриване)
    const handleHeaderClick = (e) => { if (e.ctrlKey) handleNoteDelete(note, e); };

    // Закачаме събитията за изтриване само за хедъра
    titleWrapper.addEventListener('click', handleHeaderClick);
    addLongPressOrCtrlClick(titleWrapper, (e) => handleNoteDelete(note, e));
    // Закачаме събитието за отваряне на модала за цялата бележка
    note.addEventListener('click', handleNoteClick);
    note.addEventListener('contextmenu', e => e.preventDefault());

    contentWrapper.appendChild(titleWrapper);
    contentWrapper.appendChild(contentEl);

    // --- Създаване на футър с икони за прикачени файлове ---
    // Проверяваме дали има прикачени файлове (масивът `attachments` вече е попълнен правилно по-горе)
    // и дали бележката има идентификатор.
    if (!isHiddenNote && (noteGdid || noteID) && attachments.length > 0) {
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

                    // Добавяме preview само за снимки (type 1) и видео (type 4),
                    // и само ако текущият режим на работа е Google Drive.
                    if (type === 1 || type === 4) {
                        const firstAttachmentOfType = attachments.find(att => att.type === type);
                        if (firstAttachmentOfType) {
                            let sourceMode = 'gdrive'; // По подразбиране
                            if (useArhDb) sourceMode = 'archive'; // Ако е архив, източникът е архив
                            else if (useLocalFolder) sourceMode = 'local'; // Ако е локална папка, източникът е локален
                            else if (useIndexedDb && !useGoogleDb && !useLocalFolder && !useArhDb) { // Ако е само IndexedDB
                                if (dbSourceGlobal === 3) sourceMode = 'archive'; // И базата е от архив
                                else if (dbSourceGlobal === 2) sourceMode = 'local'; // Или базата е от локална папка
                                // Ако dbSourceGlobal е 1 (Google Drive), sourceMode остава 'gdrive'
                            }

                            // Активираме превюто, ако източникът е Google Drive, Локална папка или Архив
                            if (sourceMode === 'gdrive' || sourceMode === 'local' || sourceMode === 'archive') {
                                const fileIdentifier = sourceMode === 'gdrive' ? firstAttachmentOfType.pathGD : firstAttachmentOfType.path;
                                const isVideo = type === 4;
                                addInNotePreviewListener(iconDiv, fileIdentifier, sourceMode, isVideo);
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

async function renderUI({ boardParseError, rerenderOnlyMenu = false }) {
    // Изчистваме бележките само ако не презареждаме единствено менюто
    if (!rerenderOnlyMenu) {
        notesContainer.innerHTML = '';
    }

    let boardsNoteElement = null;
    if (boardsData.length > 0 || boardParseError) {
        // Изчисляваме броячите само при пълно презареждане, не и когато се сменя само менюто.
        if (!rerenderOnlyMenu) {
            boardsData.forEach(board => {
                const isArh = useArhDb || (useIndexedDb && dbSourceGlobal === 3);
                const boardIdToMatch = isArh ? board.id : board.gdid;
                // ВИНАГИ изчисляваме броячите. Настройката контролира само показването.
                board.noteCount = allNotesData.filter(note => note.boardid == boardIdToMatch && note.status !== 1).length;
            });

            // ВИНАГИ изчисляваме броячите за напомняния и календар.
            boardsData.reminderNoteCount = allNotesData.filter(note => note.timer && note.timer > 0 && note.status !== 1).length;
            boardsData.calendarNoteCount = allNotesData.filter(note => note.calendarDate && note.status !== 1).length;
        }
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
            // Възстановяваме селекцията на текущия борд
            const buttonBoardId = typeof currentBoardFilter === 'number'
                ? boardsData.find(b => b.id == currentBoardFilter)?.gdid
                : currentBoardFilter;
            const selectedButton = boardsNoteElement.querySelector(`.board-filter-link[data-boardid="${buttonBoardId}"]`);
            if (selectedButton) {
                selectedButton.classList.add('selected-board');
            }
            // --- КОРЕКЦИЯ: Добавяме скролиране до активния бутон ---
            const selectedButtonInMenu = boardsNoteElement.querySelector(`.board-menu-container .board-filter-link[data-boardid="${buttonBoardId}"]`);
            if (selectedButtonInMenu) {
                selectedButtonInMenu.scrollIntoView({
                    behavior: 'smooth',
                    inline: 'center',
                    block: 'nearest'
                });
            }
        }
        return; // КЛЮЧОВА СТЪПКА: Прекратяваме функцията тук
    }

    // --- Оттук надолу е логиката за ПЪЛНО презареждане ---

    const noteElements = await Promise.all(allNotesData.map(noteData => createNoteElement(noteData)));

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

    // Обработка на стартов борд 'Main'
    if (currentBoardFilter === 'Main') {
        const mainBoard = boardsData.find(b => b.title === 'Main');
        currentBoardFilter = mainBoard ? mainBoard.gdid : 'all';
    }

    // Прилагаме филтъра и скролираме менюто само при първоначално зареждане.
    filterNotesByBoard(currentBoardFilter, isInitialLoad);
    // След първото зареждане, флагът става false.
    isInitialLoad = false;

    const counterEl = document.getElementById('note-counter');
    if (counterEl) {
        counterEl.textContent = notesCount;
    }
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
        showToast(_('errorNoArchiveFolderSelected'), 10000);
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

        allNotesData = notesArray; // Вече директно присвояваме масива с обекти
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
            showToast(_('errorRequiredArchiveFileMissing'), 10000);
        } else if (error instanceof SyntaxError) {
            console.error("Грешка при парсване на JSON съдържание от архивен файл:", error);
            showToast(_('errorInvalidArchiveData'), 10000);
        } else {
            console.error("Възникна неочаквана грешка при четене на архива:", error);
            showToast(_('errorReadingArchive'), 10000);
        }
    }

    if (success) {
        console.log("Четенето на архива приключи успешно.");
    }

    return success;
}
