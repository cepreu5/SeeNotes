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
        if (el) {
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
                // Show board names when viewing from All/Other boards, but hide if in that specific board
                const shouldShow = (typeof currentBoardFilter !== 'undefined' && String(currentBoardFilter) !== String(options.boardId)) ||
                    (options && options.forceShowBoardName);
                if (shouldShow) {
                    modalBoardNameEl.style.display = 'block';
                } else {
                    modalBoardNameEl.style.display = 'block';
                    modalBoardNameEl.textContent = '📝';
                    modalBoardNameEl.style.cursor = 'default';
                    modalBoardNameEl.style.textDecoration = 'none';
                }

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
    const fullTableHtml = renderMarkdownTableAsPseudoGraphic(rawContent);
    const pipeIndex = fullTableHtml ? -1 : (typeof window.getPipeIndex === 'function' ? window.getPipeIndex(rawContent) : rawContent.indexOf('|'));
    if (fullTableHtml) {
        displayContent = fullTableHtml;
    } else if (pipeIndex !== -1 && titleFormatString && titleFormatString.trim() !== '') {
        // Hidden note with title formatting: split, format each part, then combine
        const titlePart = rawContent.substring(0, pipeIndex);
        const bodyPart = rawContent.substring(pipeIndex + 1);
        const formattedTitle = formatText(titlePart, titleFormatString, true);
        let formattedBody = '';
        if (formatString && formatString.trim() !== '') {
            formattedBody = formatText(bodyPart, formatString, true);
        } else {
            formattedBody = renderMarkdownTableAsPseudoGraphic(bodyPart) || processNoteContent(bodyPart, true);
        }
        displayContent = formattedTitle + '<br>' + formattedBody;
    } else {
        // Standard logic: replace separator with newline for hidden notes
        const pipeIdxForReplace = typeof window.getPipeIndex === 'function' ? window.getPipeIndex(rawContent) : rawContent.indexOf('|');
        if (pipeIdxForReplace !== -1) {
            // Replace only the first separating pipe
            const titlePart = rawContent.substring(0, pipeIdxForReplace);
            const bodyPart = rawContent.substring(pipeIdxForReplace + 1);
            const tableHtml = renderMarkdownTableAsPseudoGraphic(bodyPart);
            const formattedBody = tableHtml || processNoteContent(bodyPart, true);
            displayContent = processNoteContent(titlePart, true) + '<br>' + formattedBody;
        } else if (formatString && formatString.trim() !== '') {
            displayContent = formatText(rawContent, formatString, true); // isForModal = true
        } else {
            displayContent = renderMarkdownTableAsPseudoGraphic(rawContent) || processNoteContent(rawContent, true); // isForModal = true
        }
    }
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
            // Ensure globals exist and use them
            noteId++;
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
    if (searchInBoardOnly && searchTerm !== '' && boardBeforeSearch && boardBeforeSearch !== 'all') {
        boardOnlyIds = [boardBeforeSearch];
        if (typeof boardsData !== 'undefined') {
            const bbs = boardsData.find(b => b.gdid == boardBeforeSearch || b.id == boardBeforeSearch);
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
    boardsData.forEach(board => {
        const boardId = board.gdid || board.id;
        if (!board.title || boardId === undefined || boardId === null) return;
        const count = boardCounts.get(String(boardId)) || 0;
        const showCount = localStorage.getItem('showBoardNoteCount') === 'true';
        const link = document.createElement('span');
        link.textContent = (showCount && count > 0) ? `${board.title} (${count})` : board.title;
        link.classList.add('board-filter-link');
        link.dataset.boardid = boardId;
        // Обработка на цвят на фона
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

        // Обработка на цвят на шрифта
        link.style.color = 'black'; // Default
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
    fullscreenLink.title = _('toggleFullscreenTooltip') || 'Цял екран (Скрий/Покажи хедъра)';
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
        if (!isUtil) {
            link.style.width = 'auto';
            link.style.display = 'inline-block';
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
    const headerUtilWidth = Math.max(30, Math.floor((maxWidthForButtons - 5) / 2));
    allButtonLinks.forEach(link => {
        const isUtil = (link.dataset.boardid === 'reorder' || link.dataset.boardid === 'fullscreen');
        if (!isUtil) {
            link.style.width = `${maxWidthForButtons}px`;
            link.style.display = 'inline-block';
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
        const folderNames = JSON.parse(folderNamesStr);
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
    if (isOffline) return false;
    try {
        const folderId = await getAppSettingsFolderId();
        if (!folderId) return false;
        const existingFiles = await findGDFileByName(folderId, 'folders.json');
        if (!existingFiles || existingFiles.length === 0) return false;
        const content = await fetchGDriveFileContent(existingFiles[0].id);
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
        const localFolderNames = localFolderNamesStr ? JSON.parse(localFolderNamesStr) : ['multinotes_data'];

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
                noteId = activeFolderData.lastNoteId;
                changed = true;
            }
            if (activeFolderData.lastNoteNumord !== null && typeof activeFolderData.lastNoteNumord !== 'undefined') {
                noteNumord = activeFolderData.lastNoteNumord;
                changed = true;
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