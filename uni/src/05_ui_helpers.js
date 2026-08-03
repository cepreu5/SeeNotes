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
    await startApp();
    if (hasToken && !isLogout) {
        console.log("Existing token found in GIS callback, silente mode handled by startApp...");
    } else {
        if (loginBox) loginBox.style.visibility = 'visible';
        const authBtn = document.getElementById('authorize_button');
        if (authBtn) authBtn.disabled = false;
    }
}

// --- КОРЕКЦИЯ: Зареждаме състоянието на "Запомни ме" при стартиране ---
document.addEventListener('DOMContentLoaded', async () => {
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

// Стартирай зареждането в зависимост от състоянието
(async () => {
    // 1. ПЪРВО зареждаме преводите, за да са готови за всеки UI компонент (като initLoginPage)
    await setLanguage(currentLang);

    dbExists = await checkDbExists(NOTES_DB_NAME);
    // Проверяваме за кеширана сесия (PWA/Offline)
    const hasToken = sessionStorage.getItem('google_auth_token') || localStorage.getItem('google_auth_token');
    await goOffline();

    if (isOffline) {
        startApp();
    } else if (hasToken) {
        // Имаме токен и сме онлайн - пускаме Google API и стартираме
        loadGoogleIdentityServices();
    } else {
        // Нямаме токен - показваме login страницата (вече преведена)
        initLoginPage();
        loadGoogleIdentityServices(); // За да сме готови за входящ логин
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
