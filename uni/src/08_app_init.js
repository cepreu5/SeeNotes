// =================================================================================
// II. ИНИЦИАЛИЗАЦИЯ НА ПРИЛОЖЕНИЕТО
// =================================================================================
// --- Web Share Target API Handler ---
async function handleShareTarget(externalData = null) {
    const url = new URL(window.location.href);
    const sharedTitle = externalData ? externalData.shared_title : url.searchParams.get('shared_title');
    const sharedText = externalData ? externalData.shared_text : url.searchParams.get('shared_text');
    const sharedUrl = externalData ? externalData.shared_url : url.searchParams.get('shared_url');
    const hasSharedImage = externalData ? (externalData.shared_image === '1') : (url.searchParams.get('shared_image') === '1');
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
    // --- Обработка на споделено изображение ---
    let sharedImageBlob = null;
    let sharedImageFilename = `shared_${now}.jpg`;
    let sharedImageMimeType = 'image/jpeg';
    if (hasSharedImage) {
        try {
            const cache = await caches.open('share-target-image');
            const response = await cache.match('shared-image');
            if (response) {
                sharedImageBlob = await response.blob();
                sharedImageFilename = response.headers.get('X-Filename') || sharedImageFilename;
                sharedImageMimeType = response.headers.get('Content-Type') || sharedImageMimeType;
                await cache.delete('shared-image');
            }
        } catch (e) {
            console.error('Error retrieving shared image from cache:', e);
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
        // --- Ако има споделено изображение, качваме го в GDrive ---
        if (sharedImageBlob && !isOffline) {
            try {
                showToast(_('uploadingSharedImage') || '📤 Uploading image...', 5000);
                const folderId = await getFolderID();
                if (!folderId) throw new Error('Folder ID not available');
                // 1. Осигуряваме Images папка
                let imagesFolderId = folderIds['Images'] || localStorage.getItem('gdrive_folder_id_Images');
                if (!imagesFolderId) {
                    imagesFolderId = await createNewGDriveFolder('Images', folderId);
                    if (imagesFolderId) {
                        folderIds['Images'] = imagesFolderId;
                        localStorage.setItem('gdrive_folder_id_Images', imagesFolderId);
                    }
                }
                if (!imagesFolderId) throw new Error('Could not get/create Images folder');
                // 2. Качваме изображението в Images папка
                const imageGdid = await uploadBlobToGDrive(imagesFolderId, sharedImageFilename, sharedImageBlob, sharedImageMimeType);
                if (!imageGdid) throw new Error('Image upload failed');
                // 3. Намираме gdid на бележката (след запис)
                // Търсим бележката по id - тя може вече да е записана с gdid
                const waitForNoteGdid = () => {
                    return new Promise(resolve => {
                        const check = (attempts = 0) => {
                            // Търсим в allNotesData по локалното id
                            const noteInData = allNotesData.find(n => String(n.id) === String(noteId));
                            // Важно: gdid трябва да е низ (string) от Google Drive
                            if (noteInData && noteInData.gdid && typeof noteInData.gdid === 'string' && noteInData.gdid.length > 10) {
                                resolve(noteInData.gdid);
                            } else if (attempts < 80) { // До 40 секунди
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
                    console.warn('[ShareTarget] Note gdid not available after timeout. Media entry NOT created.');
                    showToast('⚠️ Image uploaded, but link failed (note not saved to GDrive in time).', 7000);
                    return;
                }
                // 4. Създаваме media.txt запис в GDrive (използваме само истински GDID)
                const maxMediaId = mediaData.reduce((max, m) => Math.max(max, +(m.id || 0)), 0);
                const mediaEntry = {
                    datemod: now,
                    description: '',
                    gdid: '',
                    id: maxMediaId + 1,
                    noteid: noteGdid, // STRING GDID
                    path: sharedImageFilename, // Само името на файла (логика от Multinotes)
                    pathGD: imageGdid,
                    type: 1
                };
                const mediaFileGdid = await createGDriveFile(folderId, 'media.txt', JSON.stringify(mediaEntry));
                if (mediaFileGdid) {
                    mediaEntry.gdid = mediaFileGdid;
                    await updateGDriveFile(mediaFileGdid, JSON.stringify(mediaEntry));
                    // 5. Обновяваме локалните данни и UI
                    mediaData.push(mediaEntry);
                    if (useIndexedDb) {
                        await bulkPutDB(MEDIA_STORE_NAME, [mediaEntry], true);
                    }
                    console.log('[ShareTarget] Media entry added to mediaData:', mediaEntry);
                    showToast(_('sharedImageSaved') || '✅ Image attached to note', 3000);

                    // Хирургично обновяваме само тази бележка, вместо цялото табло
                    if (typeof refreshNoteUI === 'function') {
                        console.log('[ShareTarget] Refreshing single note UI...');
                        await refreshNoteUI(noteGdid);
                    } else {
                        renderNotes();
                    }
                }
            } catch (e) {
                console.error('[ShareTarget] Error processing shared image:', e);
                showToast('❌ Error uploading shared image: ' + e.message, 5000);
            }
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

    // --- Автоматична проверка за режим Online/Offline ---
    if (!navigator.onLine) {
        isOffline = true;
        isExplicitLogin = true;
    } else {
        await goOffline();
        if (isOffline) isExplicitLogin = true;
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

        const cleanup = () => {
            popup.classList.remove('show');
            yesBtn.removeEventListener('click', onYes);
            noBtn.removeEventListener('click', onNo);
            allBtn.removeEventListener('click', onAll);
            yesBtn.addEventListener('click', handleSubmitFolderId);
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
    reloadButton.addEventListener('click', () => {
        const hasDirtyNotes = allNotesData && allNotesData.some(n => n.type === -1);
        if (hasDirtyNotes) {
            if (isOffline) {
                showToast(_('offlineModeMessage') || 'Cannot sync while offline.', 3000);
            } else {
                syncDirtyNotes();
            }
        } else {
            mainLogic();
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

        // Check if we need to show advanced settings (Ctrl click or validation flow which might trigger this)
        if (e.ctrlKey) {
            if (advancedSettingsSpan) {
                const isHidden = advancedSettingsSpan.hasAttribute('hidden');
                if (isHidden) {
                    advancedSettingsSpan.removeAttribute('hidden');
                    localStorage.setItem('showAdvancedSettings', 'true');
                }
                // Попълваме dropdown-а ПРАВИЛНО чрез централизираната функция
                populateFoldersDropdown();
                // Зареждаме folders.json от GDrive само при отваряне на Разширени настройки
                loadGlobalFoldersJson().then(changed => {
                    if (changed) {
                        // Обновяваме dropdown-а, тъй като folders.json може да е заредил нови имена
                        populateFoldersDropdown();
                    }
                });
                // Expand accordion if not already expanded (check for active class if you used it, or just click if content is hidden)
                // Assuming accordion logic toggles display. Using the user's setTimeout approach to ensure modal opens first.
                // Assuming accordion logic toggles display. Using the user's setTimeout approach to ensure modal opens first.
                setTimeout(() => {
                    // Check state via class on accordion wrapper
                    const accordionHeader = document.querySelector('.accordion-header');
                    if (accordionHeader) {
                        const accordion = accordionHeader.parentElement;
                        const isActive = accordion.classList.contains('active');

                        if (!isActive) {
                            // Closed -> Open it (this triggers scroll in listener)
                            accordionHeader.click();
                        } else {
                            // Already Open -> Just scroll to it/bottom
                            const settingsModalBody = document.getElementById('settings-modal-body');
                            if (settingsModalBody) {
                                settingsModalBody.scrollTo({ top: settingsModalBody.scrollHeight, behavior: 'smooth' });
                            } else {
                                accordionHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                        }
                    }
                }, 100);
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
    updateSearchModeIndicator();
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
            if (typeof showToast === 'function') showToast(_('checkingNetwork') || "Checking network connection...", 2000);
            let reallyOnline = false;
            try {
                const response = await fetch('/favicon.ico?_=' + new Date().getTime(), { method: 'HEAD', cache: 'no-store' });
                reallyOnline = response.ok;
            } catch (err) { }

            if (reallyOnline) {
                isOffline = false;
                updateModeButton();
                if (typeof showToast === 'function') showToast(_('onlineRestored') || "Online mode restored", 2000);
            } else {
                showToast(_('offlineModeMessage') || "Cannot sync while offline.", 3000);
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

    async function triggerSync() {
        updatedNoteGdims = []; // Clear previous updates
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
                if (typeof gapi !== 'undefined' && gapi.client) {
                    gapi.client.setToken({ access_token: authToken.access_token });
                }
            } catch (error) {
                throw new Error(_('errorGoogleLibs'));
            }
            console.log("Triggering Google Drive sync...");
            console.trace("[Sync-Trace] triggerSync called");
            if (loaderTitle) loaderTitle.textContent = _('syncTitleGD');
            try {
                updatedCount = await runGoogleDriveSync();
            } catch (err) {
                console.warn("GD Sync failed, attempting token refresh...", err);
                const refreshResult = await refreshAuthToken();
                if (refreshResult && refreshResult.pass) {
                    authToken = refreshResult.tokenData;
                    // Update gapi client with new token
                    if (typeof gapi !== 'undefined' && gapi.client) {
                        gapi.client.setToken({ access_token: authToken.access_token });
                    }
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
    const switchLanguage = (lang) => {
        localStorage.setItem('language', lang);
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
        const titleEndsInWord = /\S$/.test(trimmedLine.slice(0, usedLength));
        const remainderStartsInWord = /^\S/.test(remainder);
        if (titleEndsInWord && remainderStartsInWord) {
            const wordStartMatch = trimmedLine.slice(0, usedLength).match(/\S+$/);
            if (wordStartMatch) {
                remainder = '...' + wordStartMatch[0] + remainder;
            }
        } else {
            remainder = remainder.trimStart();
        }
        lines[titleLineIndex] = ' '.repeat(leadingWhitespaceLength) + remainder;
    } else {
        lines.splice(titleLineIndex, 1);
    }

    return lines.join('\n').replace(/^\s*\n/, '');
}

function getVisibleTitleTextForElement(titleEl, sourceText) {
    if (!titleEl || !sourceText) return sourceText || '';
    const fullText = String(sourceText);
    const maxLength = Math.min(fullText.length, (titleEl.textContent || '').length || fullText.length);
    const availableWidth = titleEl.clientWidth || titleEl.getBoundingClientRect().width;
    if (!availableWidth || titleEl.scrollWidth <= availableWidth) {
        return fullText.slice(0, maxLength);
    }

    const style = getComputedStyle(titleEl);
    const canvas = getVisibleTitleTextForElement._canvas || (getVisibleTitleTextForElement._canvas = document.createElement('canvas'));
    const ctx = canvas.getContext('2d');
    ctx.font = `${style.fontStyle} ${style.fontVariant} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    const ellipsis = '...';
    let low = 0;
    let high = maxLength;
    let best = 0;
    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        const measured = ctx.measureText(fullText.slice(0, mid) + ellipsis).width;
        if (measured <= availableWidth) {
            best = mid;
            low = mid + 1;
        } else {
            high = mid - 1;
        }
    }
    return fullText.slice(0, Math.max(0, best));
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
            if (noteContent.title_span) {
                titleSpan = noteContent.title_span;
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
        const formatSource = (textSpan && textSpan.trim() !== '') ? textSpan : null;
        const tablePreviewHtml = renderMarkdownTableAsPseudoGraphic(contentForPreview);
        if (tablePreviewHtml) {
            contentEl.innerHTML = tablePreviewHtml;
        } else if (formatSource) {
            // Use the exact same logic as in showModal to ensure indices match
            let contentToFormat = fileContent;
            const hasPipe = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(contentToFormat) !== -1 : contentToFormat.includes('|');
            if (hasPipe) {
                contentToFormat = contentForPreview;
            } else {
                contentToFormat = contentForPreview;
            }
            // Format the content
            let formattedHtml = formatText(contentToFormat, formatSource, isForModal);
            contentEl.innerHTML = formattedHtml;
        } else {
            contentEl.innerHTML = processNoteContent(contentForPreview, isForModal);
        }
    };
    if (isHiddenNote) {
        const pipeIndex = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(fileContent) : fileContent.indexOf('|');
        const previewContent = pipeIndex !== -1 ? fileContent.substring(0, pipeIndex) : ''; // КОРЕКЦИЯ: Използваме processNoteContent, за да се съобрази с настройката за линкове
        contentEl.innerHTML = processNoteContent(previewContent, isForModal); // isForModal е false за бележките на борда
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
    // След първото зареждане, флагът става false.
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
        const response = await fetch(`lang/i18n-${lang}.json`, { credentials: 'omit' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        appTranslations[lang] = data;
    } catch (e) {
        console.error("Failed to load translations:", e);
        // Fallback: Populate with critical keys if fetch fails (e.g. offline with old SW)
        if (!appTranslations[lang]) {
            appTranslations[lang] = {};
            if (lang === 'bg') {
                appTranslations[lang]['offlineStartButton'] = 'Старт офлайн';
                appTranslations[lang]['authorizeButton'] = 'Вход с Google';
                appTranslations[lang]['trialButton'] = 'Старт 30-дневен пробен период';
                appTranslations[lang]['sessionExpired'] = 'Сесията изтече. Моля, влезте отново.';
            } else {
                appTranslations[lang]['offlineStartButton'] = 'Start Offline';
                appTranslations[lang]['authorizeButton'] = 'Authorize with Google';
                appTranslations[lang]['trialButton'] = 'Start 30-day trial period';
                appTranslations[lang]['sessionExpired'] = 'Session expired. Please login again.';
            }
            // Добавяме и loginPrompt към фълбека
            if (!appTranslations[lang]['loginPrompt']) {
                appTranslations[lang]['loginPrompt'] = lang === 'bg' ?
                    'Моля, влезте с Google акаунта, с който сте синхронизирали бележките си в MultiNotes.' :
                    'Please sign in with Google account you used to sync MultiNotes.';
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
    if ((isHiddenNote || hasPipe) && !modalBodyElem.querySelector('textarea')) {
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

        // Store BOTH masked links lists
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
    // Add save button if not exists
    if (!document.getElementById('note-save-btn')) {
        const saveBtn = document.createElement('div');
        saveBtn.id = 'note-save-btn';
        saveBtn.className = 'modal-footer-btn';
        saveBtn.innerHTML = diskIconSvg;
        saveBtn.title = _('saveTooltip') || "Save changes";
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
        previewBtn.title = _('previewTooltip') || "Preview changes";
        previewBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (typeof previewEditedNote === 'function') previewEditedNote();
        });

        if (footerToolbar) {
            // We append them in order: Preview, Search (already exists, will move), Save
            const existingSearchBtn = document.getElementById('note-search-btn');
            footerToolbar.appendChild(previewBtn);
            if (existingSearchBtn) footerToolbar.appendChild(existingSearchBtn);
            footerToolbar.appendChild(saveBtn);
        } else if (modalContentBox) {
            const existingSearchBtn = document.getElementById('note-search-btn');
            modalContentBox.appendChild(previewBtn);
            if (existingSearchBtn) modalContentBox.appendChild(existingSearchBtn);
            modalContentBox.appendChild(saveBtn);
        }
    } else {
        // If buttons already exist, re-append them to ensure order: Preview, Search, Save
        const sBtn = document.getElementById('note-save-btn');
        const pBtn = document.getElementById('note-preview-btn');
        const searchBtn = document.getElementById('note-search-btn');
        if (footerToolbar) {
            if (pBtn) footerToolbar.appendChild(pBtn);
            if (searchBtn) footerToolbar.appendChild(searchBtn);
            if (sBtn) footerToolbar.appendChild(sBtn);
        }
    }

    // Ensure state-specific visibility
    const saveBtn = document.getElementById('note-save-btn');
    const previewBtn = document.getElementById('note-preview-btn');
    const editBtn = document.getElementById('note-edit-btn');
    const moveBtn = document.getElementById('note-move-btn');

    if (saveBtn) { saveBtn.style.display = 'flex'; }
    if (previewBtn) { previewBtn.style.display = 'flex'; }
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
    const textarea = document.getElementById('note-edit-textarea');
    const titleTextarea = document.getElementById('note-edit-title-textarea');
    const saveBtn = document.getElementById('note-save-btn');
    const isEditingOrPreviewing = (textarea || titleTextarea) || (saveBtn && saveBtn.style.display !== 'none');
    if (!isEditingOrPreviewing) return true;
    // Check for actual changes
    const initialContent = currentModalContent || "";
    // Get the current content from the textareas (which might have masked links)
    const newBodyTextRaw = textarea ? textarea.value : (modalBodyElem.dataset.draftText || "");
    const newTitleTextRaw = titleTextarea ? titleTextarea.value : (modalBodyElem.dataset.draftTitle || "");
    // Combine raw title and body
    let currentFullTextRaw = titleTextarea ? `${newTitleTextRaw}|${newBodyTextRaw}` : newBodyTextRaw;
    // --- FIX: Unmask links before comparing ---
    // When editing, links are replaced with placeholders like {#L0#}.
    // We need to restore them to prevent false positive change detection.
    const maskedLinksStr = modalBodyElem.dataset.maskedLinks;
    if (maskedLinksStr) {
        try {
            const maskedLinks = JSON.parse(maskedLinksStr);
            if (Array.isArray(maskedLinks) && maskedLinks.length > 0) {
                maskedLinks.forEach((link, idx) => {
                    const placeholder = `{#L${idx}#}`;
                    currentFullTextRaw = currentFullTextRaw.split(placeholder).join(link); // Replace all instances
                });
            }
        } catch (e) {
            console.warn("Could not parse/unmask links in checkUnsavedChanges", e);
        }
    }
    const initialColorIndex = modalBodyElem.dataset.initialColorIndex ? parseInt(modalBodyElem.dataset.initialColorIndex, 10) : 0;
    const newColorIndex = modalBodyElem.dataset.colorIndex ? parseInt(modalBodyElem.dataset.colorIndex, 10) : initialColorIndex;
    // Normalize line endings for consistent comparison
    const normalizedInitialContent = initialContent.replace(/\r\n/g, '\n');
    const normalizedCurrentFullText = currentFullTextRaw.replace(/\r\n/g, '\n');
    const hasTextChanged = normalizedCurrentFullText !== normalizedInitialContent;
    const hasColorChanged = newColorIndex !== initialColorIndex;
    const isNewNote = modalBodyElem.dataset.isNewNote === 'true';
    const isNewNoteWithContent = isNewNote && (newBodyTextRaw.trim() !== "" || newTitleTextRaw.trim() !== "");
    if (!hasTextChanged && !hasColorChanged && !isNewNoteWithContent) {
        return true;
    }
    // If there are changes, ask to save
    const confirmed = await showConfirmation(_('confirmSaveChanges') || "Save changes?");
    if (confirmed) {
        await saveEditedNote();
        return false; // Prevent the default close action, as saveEditedNote handles it
    } else {
        // User clicked "No", so we allow the modal to close without saving.
        return true;
    }
}

// Unified Save Logic
function saveEditedNote() {
    const modalBodyElem = document.getElementById('modal-body');
    if (!modalBodyElem) return;

    // --- ASYNC REFACTOR: Close modal immediately and save in background ---
    const closeAfterSave = localStorage.getItem('closeAfterSave') === 'true';
    if (closeAfterSave) {
        const contentModal = document.getElementById('content-modal');
        if (contentModal) contentModal.classList.remove('visible');
    } else {
        // If not closing, at least disable editing and show a preview
        disableNoteEditing(modalBodyElem);
    }

    // Show a toast message to indicate saving is in progress
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
        const hasChanges = isNewNote || (processedText !== originalContent || finalFormat !== (noteObj?.text_span || "") || finalTitleFormat !== (noteObj?.title_span || "") || newCalendarDate !== noteObj?.calendarDate || newColor !== noteObj?.color);

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
        const title = titleInput.value.trim();
        if (!title) { showToast(_('errorEmptyTitle') || "Моля, въведете заглавие", 3000); return; }

        if (!currentEditingBoard && isOffline) {
            showToast(_('errorOfflineBoardCreate') || "Не може да създавате нов борд в офлайн режим.", 5000);
            return;
        }

        const now = Date.now();
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
    let folderNames = folderNamesStr ? JSON.parse(folderNamesStr) : [defaultFolder];

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
 * Попълва падащото меню за папки в настройките.
 */
function populateFoldersDropdown() {
    const activeFolderSelect = document.getElementById('active-folder-select');
    if (!activeFolderSelect) return;

    // Гарантираме, че стационарните опции съществуват
    if (!activeFolderSelect.querySelector('option[value="select_folder"]')) {
        const selectOption = document.createElement('option');
        selectOption.value = 'select_folder';
        selectOption.textContent = _('selectFolderOption') || 'Избор на папка...';
        activeFolderSelect.appendChild(selectOption);
    }
    if (!activeFolderSelect.querySelector('option[value="new_folder"]')) {
        const newOption = document.createElement('option');
        newOption.value = 'new_folder';
        newOption.textContent = _('newFolderOption');
        activeFolderSelect.appendChild(newOption);
    }

    const defaultFolder = 'multinotes_data';
    let folderNamesStr = localStorage.getItem('gdrive_folder_names');
    let folderNames = folderNamesStr ? JSON.parse(folderNamesStr) : [defaultFolder];
    if (!folderNames.includes(defaultFolder)) folderNames.unshift(defaultFolder);
    if (typeof activeFolderName !== 'undefined' && activeFolderName && !folderNames.includes(activeFolderName)) folderNames.push(activeFolderName);

    // Изчистваме старите опции за данни
    Array.from(activeFolderSelect.options).forEach(opt => {
        if (opt.value !== 'select_folder' && opt.value !== 'new_folder') {
            opt.remove();
        }
    });

    // Вмъкваме опциите за папките ПРЕДИ стационарните опции
    const insertBeforeNode = activeFolderSelect.querySelector('option[value="select_folder"]') || activeFolderSelect.firstChild;

    folderNames.forEach(name => {
        if (name === 'AppDataFolder') return; // Вече ще го добавим като специална опция
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        if (typeof activeFolderName !== 'undefined' && name === activeFolderName) option.selected = true;
        activeFolderSelect.insertBefore(option, insertBeforeNode);
    });

    // Добавяме AppDataFolder като специална опция (винаги, точно веднъж)
    const appDataOption = document.createElement('option');
    appDataOption.value = 'AppDataFolder';
    appDataOption.textContent = (typeof _ === 'function') ? _('appDataFolderLabel') : 'AppDataFolder (Hidden)';
    if (typeof activeFolderName !== 'undefined' && activeFolderName === 'AppDataFolder') appDataOption.selected = true;
    activeFolderSelect.insertBefore(appDataOption, insertBeforeNode);
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
