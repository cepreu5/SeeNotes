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

function handleSubmitFolderId() {
    // If input is not visible, just close the popup
    if (folderIdInput.style.display === 'none') {
        hideFolderIdPrompt();
        return;
    }
    // Logic for submitting the folder ID would go here
}

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