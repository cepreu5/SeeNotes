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
                <button id="close-month-calendar-btn" class="close-calendar-btn">&times;</button>
                <button id="prev-month-btn" title="${_('prevMonthTooltip')}">&laquo;</button>
                <button id="today-month-btn">${calendarIconSvg}</button>
                <button id="next-month-btn" title="${_('nextMonthTooltip')}">&raquo;</button><button id="weekly-view-btn" title="${_('weeklyViewTooltip')}">${weeklyViewIconSvg}</button>
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
        // Check if the cell being rendered is today's date
        if (day === todayDate && month === todayMonth && year === todayYear) {
            dateNum.classList.add('today-date');
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
            if (noteData.calendarDate) {
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
                    if (noteData.color) {
                        miniNote.style.backgroundColor = `var(--note-bg-${noteData.color})`;
                    }
                    miniNote.addEventListener('click', (e) => {
                        e.stopPropagation();
                        // Подаваме и ID-тата, за да работят прикачните файлове.
                        // --- КОРЕКЦИЯ: Премахваме подаването на originalNote, за да уеднаквим поведението със седмичния календар ---
                        showModal({ raw: noteData.notetxt, format: noteData.text_span, color: miniNote.style.backgroundColor, id: noteData.id, gdid: noteData.gdid }, null, true);
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

        // Scroll to today's date if visible
        const todayElement = document.querySelector('.today-date');
        if (todayElement) {
            todayElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    document.getElementById('close-month-calendar-btn').addEventListener('click', () => {
        setTimeout(() => {
            requestAnimationFrame(() => {
                calendarContainer.style.visibility = 'hidden';
                document.querySelector('header').style.display = 'flex';
                notesContainer.style.display = 'flex';
                window.dispatchEvent(new Event('scroll'));
            });
        }, 20);
    });
}

/**
 * Рендира седмичен изглед на календара.
 */
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
    header.innerHTML = `<div class="calendar-nav-controls"><button id="close-week-calendar-btn" class="close-calendar-btn">&times;</button><button id="prev-week-btn">&laquo;</button><button id="next-week-btn">&raquo;</button><button id="today-week-btn">${calendarIconSvg}</button><button id="month-view-btn" title="${_('monthlyViewTooltip')}" style="display: flex; align-items: center; justify-content: center;">${weeklyViewIconSvg}</button></div><h2 style="cursor: default;">${titleText}</h2>`;
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

    header.querySelector('.close-calendar-btn').addEventListener('click', () => {
        weeklyContainer.style.display = 'none';
        document.querySelector('header').style.display = 'flex';
        notesContainer.style.display = 'flex';
        window.dispatchEvent(new Event('scroll'));
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
        if (noteData.calendarDate) {
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
                const originalNote = document.querySelector(`.note[data-extra-info*='"gdid":"${gdid}"']`);
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

                    // --- КОРЕКЦИЯ: Променяме начина на отваряне на бележката ---
                    // Вместо да симулираме клик върху оригиналния елемент,
                    // директно извикваме showModal с данните на бележката,
                    // точно както го прави месечният календар.
                    clone.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const noteData = allNotesData.find(note => note.gdid === gdid);
                        if (noteData) {
                            showModal({ raw: noteData.notetxt, format: noteData.text_span, color: clone.style.backgroundColor, id: noteData.id, gdid: noteData.gdid });
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
