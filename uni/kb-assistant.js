/**
 * KB Assistant - Главна логика на асистента
 * Интегрира matcher, guide система и UI
 */

class KBAssistant {
    constructor() {
        this.kbData = null;
        this.matcher = null;
        this.currentLang = this.getCurrentLanguage();
        this.isInitialized = false;

        // Текстове на асистента (ще се заредят от JSON)
        this.texts = {
            bg: {},
            en: {}
        };

        // Конфигурация
        this.showRelatedSettings = false;
        this.showLocation = false;

        // Query history
        this.queryHistory = [];
        this.MAX_HISTORY = 10;
    }

    getCurrentLanguage() {
        return localStorage.getItem('language') || 'en';
    }

    getText(key) {
        // Fallback ако текстовете още не са заредени
        if (!this.texts[this.currentLang] || !this.texts[this.currentLang][key]) {
            if (this.texts.en && this.texts.en[key]) return this.texts.en[key];
            return key; // Връщаме ключа ако няма превод
        }
        return this.texts[this.currentLang][key];
    }

    /**
     * Инициализация - зарежда KB данните
     */
    async init() {
        try {
            // Зареждаме KB данните от JSON файла
            const response = await fetch('kb-data.txt');
            if (!response.ok) {
                throw new Error('Failed to load KB data');
            }

            const text = await response.text();
            try {
                this.kbData = JSON.parse(text);
            } catch (e) {
                // Try relaxed parsing (allows unquoted keys like x: 1)
                try {
                    this.kbData = new Function('return ' + text)();
                } catch (relaxedError) {
                    console.warn('KB Data has syntax errors, attempting auto-repair...', e);
                    // This regex finds alphanumeric keys preceded by { or , and wraps them in quotes
                    const fixedText = text.replace(/([{,]\s*)([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
                    try {
                        this.kbData = JSON.parse(fixedText);
                        console.log('✅ KB Data auto-repaired successfully');
                    } catch (repairError) {
                        console.error('❌ KB Data repair failed:', repairError);
                        throw e; // Throw original error
                    }
                }
            }

            // Зареждаме UI текстовете от JSON-а
            if (this.kbData.ui_texts) {
                this.texts = this.kbData.ui_texts;
            }

            this.matcher = new KBMatcher(this.kbData);
            this.isInitialized = true;

            // Обновяваме езика
            this.updateLanguage();

            console.log('✅ KB Assistant initialized successfully');
            console.log('Current language:', this.getCurrentLanguage());
            return true;
        } catch (error) {
            console.error('❌ KB Assistant initialization failed:', error);
            this.isInitialized = false;
            return false;
        }
    }

    /**
     * Обработва въпрос от потребителя
     * @param {string} query - Въпросът
     * @returns {Object} - Отговор с резултати
     */
    async ask(query) {
        if (!this.isInitialized) {
            await this.init();
        }

        // Обновяваме езика преди всяка заявка
        this.updateLanguage();

        if (!query || query.trim().length === 0) {
            return {
                success: false,
                message: this.getText('greeting'),
                suggestions: this.getSuggestions()
            };
        }

        // Handle history request
        if (query.trim() === '?') {
            return {
                success: true,
                isHistory: true, // Marker for UI handling
                history: this.queryHistory.slice().reverse(), // Show newest first
                message: this.queryHistory.length > 0
                    ? this.getText('recentQuestions')
                    : this.getText('noRecentQuestions')
            };
        }

        // Търсим в KB
        const results = this.matcher.search(query, 3);
        const hasResults = results.length > 0;

        // NOTE: History saving logic moved after results processing to save the matched question instead of user input
        // See below code block

        if (!hasResults) {
            return {
                success: false,
                message: this.getText('noResults'),
                suggestions: this.getSuggestions()
            };
        }

        // Форматираме резултатите
        const formattedResults = results.map(r => this.matcher.formatResult(r));
        const topResult = formattedResults[0];

        // Save to history the actual matched question/label
        if (query.trim() !== '?' && topResult) {
            const questionText = topResult.question || topResult.label || topResult.term || query;
            // Remove if exists to move to top
            const existingIndex = this.queryHistory.indexOf(questionText);
            if (existingIndex !== -1) {
                this.queryHistory.splice(existingIndex, 1);
            }

            this.queryHistory.push(questionText);
            if (this.queryHistory.length > this.MAX_HISTORY) {
                this.queryHistory.shift();
            }
        }

        return {
            success: true,
            results: formattedResults,
            topResult: topResult
        };
    }

    /**
     * Връща предложения за въпроси
     * @param {number} count - Брой предложения
     * @returns {Array}
     */
    getSuggestions(count = 5) {
        if (!this.matcher) return [];
        return this.matcher.getSuggestions(count);
    }

    /**
     * Показва guided tour за дадена настройка/UI елемент
     * @param {Object} guideData - Guide данни от KB
     */
    showGuide(guideData) {
        console.log('showGuide called with:', guideData);
        if (!guideData) {
            console.warn('No guide data provided');
            return;
        }

        // Check for multi-step sequence (keys "1", "2", etc.)
        const multiSteps = [];
        let i = 1;
        while (guideData[i]) {
            const stepConfig = guideData[i];

            // Merge defaults from parent guideData
            const defaults = { ...guideData };
            // Remove numeric keys from defaults
            Object.keys(defaults).forEach(key => {
                if (/^\d+$/.test(key)) delete defaults[key];
            });

            const mergedStep = { ...defaults, ...stepConfig };
            // Note: we pass the whole object including 'text' object, so msm.js handles lang switch.

            multiSteps.push(mergedStep);
            i++;
        }

        if (multiSteps.length > 0) {
            // It is a multi-step tour
            if (typeof window.setGuideSteps === 'function' && typeof showStep === 'function') {
                console.log('Starting multi-step guide:', multiSteps);
                window.setGuideSteps(multiSteps);

                // Context management for multi-step guides
                const settingsContexts = ['display', 'sorting', 'boards', 'data', 'behavior', 'startup', 'settings', 'calendar', 'search'];

                let prevCtx = null;
                multiSteps.forEach(step => {
                    const currentCtx = step.context || guideData.context;
                    const isPrevSettings = prevCtx && settingsContexts.includes(prevCtx);
                    const isCurrSettings = settingsContexts.includes(currentCtx);

                    if (isPrevSettings && !isCurrSettings) {
                        step.onStart = () => { this.closeSettings(); };
                    } else if (!isPrevSettings && isCurrSettings) {
                        step.onStart = () => { this.openSettings(); };
                    }
                    prevCtx = currentCtx;
                });

                const firstStep = multiSteps[0];
                const isFirstSettings = settingsContexts.includes(firstStep.context || guideData.context);

                if (isFirstSettings) {
                    this.openSettings();
                    setTimeout(() => {
                        showStep(0);
                    }, 300);
                } else {
                    this.closeSettings();
                    showStep(0);
                }
                return;
            } else {
                console.warn('msm.js functions not found for multi-step guide');
                return; // Cannot proceed without msm.js
            }
        }

        // Контексти, които се намират в Settings
        const settingsContexts = ['display', 'sorting', 'boards', 'data', 'behavior', 'startup', 'settings', 'calendar'];
        const isSettingsContext = settingsContexts.includes(guideData.context);

        // Проверяваме дали има target елемент
        let targetElement = document.querySelector(guideData.target);
        console.log('Initial targetElement search:', guideData.target, targetElement);

        // Ако елементът не е намерен, но е в Settings контекст, опитваме да отворим Settings
        if (!targetElement && isSettingsContext) {
            console.log('Target not found, opening settings...');
            this.openSettings();

            // Даваме малко време на DOM-а да се обнови
            setTimeout(() => {
                targetElement = document.querySelector(guideData.target);
                console.log('Retry targetElement search:', guideData.target, targetElement);

                if (targetElement) {
                    this.ensureElementVisible(targetElement, guideData).then(() => {
                        this.highlightElement(targetElement, guideData);
                    });
                } else {
                    // Fallback: ако все още не го намираме, highlight-ваме целия модал
                    const settingsModal = document.getElementById('settings-modal');
                    if (settingsModal) {
                        this.highlightElement(settingsModal, guideData); // Pass guideData here too
                        const msg = this.currentLang === 'bg'
                            ? `Настройката се намира в Settings. Моля, потърсете я ръчно.`
                            : `The setting is in Settings. Please search for it manually.`;
                        console.info(msg);
                    }
                }
            }, 300);
            return;
        }

        if (!targetElement) {
            console.warn(`Target element not found: ${guideData.target}`);
            return;
        }

        // Ако елементът е намерен и е в Settings контекст
        if (isSettingsContext) {
            this.openSettings();

            // Изчакваме Settings да се отвори
            setTimeout(() => {
                // Намираме елемента отново
                const el = document.querySelector(guideData.target) || targetElement;

                // Проверяваме дали елементът е видим и ако не е - опитваме да го покажем (акордеони)
                this.ensureElementVisible(el, guideData).then(() => {
                    this.highlightElement(el, guideData);
                });
            }, 300);
        } else {
            // За UI елементи директно highlight-ваме
            this.highlightElement(targetElement, guideData);
        }

        // Ако има глобална guide система (от msmguide.js), използваме я
        if (typeof window.showGuideStep === 'function') {
            const step = {
                image: guideData.image,
                height: guideData.height,
                target: guideData.target,
                text: guideData.text, // Pass object directly
                x: guideData.x,
                y: guideData.y,
                bx: guideData.bx,
                by: guideData.by,
                bWidth: guideData.bWidth,
                bHeight: guideData.bHeight
            };
            window.showGuideStep(step);
        }
    }

    /**
     * Взема текста за guide от KB данните
     * @param {Object} guideData
     * @returns {string}
     */
    getGuideText(guideData) {
        // Ако guide data има text, използваме го
        if (guideData.text) {
            return guideData.text[this.currentLang] || guideData.text.en;
        }

        // Иначе използваме answer от KB записа
        return '';
    }

    /**
     * Highlight на UI елемент
     * @param {HTMLElement} element
     */
    /**
     * Highlight на UI елемент
     * @param {HTMLElement} element
     * @param {Object} options - Опции за визуализация (image, height)
     */
    highlightElement(element, options = {}) {
        // Scroll до елемента
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Проверка за скролируеми контейнери (специфично за Settings modal)
        const scrollableParent = element.closest('.modal-content-box, .settings-modal-body, .scrollable-content');
        if (scrollableParent) {
            const parentRect = scrollableParent.getBoundingClientRect();
            const elementRect = element.getBoundingClientRect();

            // Ако елементът е извън видимата област на контейнера
            if (elementRect.top < parentRect.top || elementRect.bottom > parentRect.bottom) {
                scrollableParent.scrollTo({
                    top: element.offsetTop - (parentRect.height / 2) + (elementRect.height / 2),
                    behavior: 'smooth'
                });
            }
        }

        // Премахваме предишни pointers
        const existingPointer = document.getElementById('kb-pointer-img');
        if (existingPointer) existingPointer.remove();

        // Създаваме нов pointer
        const pointer = document.createElement('img');
        pointer.id = 'kb-pointer-img';

        // Използваме зададеното изображение или default
        pointer.src = options.image || 'msm/msm-show.png';

        // Задаваме височина ако е подадена
        if (options.height) {
            pointer.style.height = `${options.height}px`;
            pointer.style.width = 'auto'; // Запазваме пропорциите
        }

        pointer.className = 'kb-pointer-image';

        // Функция за обновяване на позицията
        const updatePosition = () => {
            if (!pointer.parentNode || !document.body.contains(element)) return;

            const rect = element.getBoundingClientRect();
            // msm.js използва top-left координатна система
            const targetLeft = rect.left;
            const targetTop = rect.top;

            // Добавяме offset-ите от guideData (ако има такива)
            const offsetX = options.x || 0;
            const offsetY = options.y || 0;

            pointer.style.top = `${targetTop + offsetY}px`;
            pointer.style.left = `${targetLeft + offsetX}px`;

            // Премахваме CSS трансформациите, които пречат на точното позициониране (като translateX(-100%))
            pointer.style.transform = 'none';
            pointer.style.animation = 'none';
        };

        // Първоначално позициониране
        updatePosition();

        // Обновяваме позицията непрекъснато за известно време (докато трае скролирането)
        let frames = 0;
        const animate = () => {
            if (frames < 100) { // ~1.6 секунди при 60fps
                updatePosition();
                frames++;
                requestAnimationFrame(animate);
            }
        };
        requestAnimationFrame(animate);

        // Слушаме за scroll и resize
        window.addEventListener('scroll', updatePosition, { passive: true });
        window.addEventListener('resize', updatePosition, { passive: true });
        if (scrollableParent) {
            scrollableParent.addEventListener('scroll', updatePosition, { passive: true });
        }

        // Скриване при клик
        const hidePointer = (immediate = false) => {
            // Почистване на event listeners
            window.removeEventListener('scroll', updatePosition);
            window.removeEventListener('resize', updatePosition);
            if (scrollableParent) {
                scrollableParent.removeEventListener('scroll', updatePosition);
            }

            if (immediate) {
                pointer.remove();
            } else {
                pointer.style.opacity = '0';
                setTimeout(() => {
                    if (pointer.parentNode) pointer.remove();
                }, 300);
            }
        };



        pointer.addEventListener('click', () => hidePointer(false));
        pointer.addEventListener('touchstart', () => hidePointer(false));

        document.body.appendChild(pointer);

        // Премахваме pointer след 10 секунди
        const timeoutId = setTimeout(() => {
            if (pointer.parentNode) {
                hidePointer(false);
            }
        }, 10000);

        // Наблюдаваме дали елементът става невидим
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) {
                    // Ако елементът вече не е видим, скриваме веднага
                    hidePointer(true);
                    observer.disconnect();
                    clearTimeout(timeoutId);
                }
            });
        }, { threshold: 0 });

        observer.observe(element);

        // Допълнителна проверка за премахване от DOM (MutationObserver)
        const mutationObserver = new MutationObserver(() => {
            if (!document.body.contains(element)) {
                hidePointer(true);
                observer.disconnect();
                mutationObserver.disconnect();
                clearTimeout(timeoutId);
            }
        });

        mutationObserver.observe(document.body, { childList: true, subtree: true });

        // Почистване при ръчно скриване
        pointer.addEventListener('remove', () => {
            observer.disconnect();
            mutationObserver.disconnect();
            clearTimeout(timeoutId);
        });
    }

    /**
     * Уверява се, че елементът е видим (отваря акордеони ако е нужно)
     * @param {HTMLElement} element 
     * @param {Object} guideData - Данни за стъпката, може да съдържа 'action' (селектор за кликване)
     */
    async ensureElementVisible(element, guideData = null) {
        if (!element) return;

        // 1. Проверка за специфично действие (action) от JSON-а
        // Това позволява ръчно да укажем кой елемент трябва да се кликне, за да се покаже target-а
        // Игнорираме 'highlight', тъй като това е стара стойност, която не е селектор
        if (guideData && guideData.action && guideData.action !== 'highlight' && guideData.action !== 'explain' && guideData.action !== 'explain!') {
            console.log('Custom action found:', guideData.action);
            const actionTrigger = document.querySelector(guideData.action);
            if (actionTrigger) {
                console.log(`Executing custom action: clicking ${guideData.action}`);
                actionTrigger.click();

                // Dispatch event just in case
                const clickEvent = new MouseEvent('click', {
                    view: window,
                    bubbles: true,
                    cancelable: true
                });
                actionTrigger.dispatchEvent(clickEvent);

                await new Promise(resolve => setTimeout(resolve, 300));

                // Ако елементът вече е видим след акцията, може да приключим
                if (element.offsetParent !== null) return;
            } else {
                console.warn('Action trigger not found:', guideData.action);
            }
        }

        // Проверяваме дали елементът е видим (offsetParent !== null означава, че е видим)
        // Забележка: в някои случаи (fixed position) offsetParent може да е null, но тук ни интересува display: none
        if (element.offsetParent !== null) return;

        // Дефинираме познатите акордеони и техните тригери
        const accordions = [
            {
                contentId: 'boards-options-section',
                triggerSelector: '#remind-board', // Wrapper-ът, който съдържа стрелката
                arrowSelector: '#boards-arrow'
            },
            {
                contentId: 'sorting-options-section',
                triggerSelector: '#order-notes',
                arrowSelector: '#sorting-arrow'
            },
            {
                contentClass: 'accordion-content', // За Advanced Settings
                triggerSelector: '.accordion-header',
                arrowSelector: '.accordion-arrow'
            }
        ];

        for (const acc of accordions) {
            let contentEl = null;
            if (acc.contentId) {
                contentEl = document.getElementById(acc.contentId);
            } else if (acc.contentClass) {
                // Търсим най-близкия родител с този клас
                contentEl = element.closest(`.${acc.contentClass}`);
            }

            // Ако елементът е вътре в този акордеон
            if (contentEl && contentEl.contains(element)) {
                // Проверяваме дали е скрит
                const style = window.getComputedStyle(contentEl);
                if (style.display === 'none') {
                    // Намираме тригера
                    let trigger = null;
                    if (acc.contentId) {
                        // Първо опитваме да намерим стрелката, защото тя е най-сигурният тригер
                        if (acc.arrowSelector) {
                            trigger = document.querySelector(acc.arrowSelector);
                        }
                        // Ако няма стрелка или не я намираме, пробваме wrapper-а
                        if (!trigger && acc.triggerSelector) {
                            trigger = document.querySelector(acc.triggerSelector);
                        }
                    } else {
                        // За класовете (Advanced Settings), тригерът е sibling на content-а
                        // Структурата е: header -> content
                        trigger = contentEl.previousElementSibling;
                    }

                    if (trigger) {
                        console.log(`Expanding accordion for ${element.id || element.tagName}...`);
                        console.log('Trigger element:', trigger);
                        console.log('Content display before:', contentEl.style.display);

                        // Ако тригерът е стрелката, трябва да сме сигурни, че event listener-ът в main.js ще се задейства
                        // Той очаква 'click' събитие точно върху стрелката
                        trigger.click();
                        console.log('trigger.click() executed');

                        // За всеки случай, ако click() не сработи (някои браузъри/контексти), dispatch-ваме и MouseEvent
                        const clickEvent = new MouseEvent('click', {
                            view: window,
                            bubbles: true,
                            cancelable: true
                        });
                        trigger.dispatchEvent(clickEvent);
                        console.log('MouseEvent dispatched');
                    }

                    // Изчакваме малко за анимацията/обновяването
                    await new Promise(resolve => setTimeout(resolve, 300));
                    console.log('Content display after:', contentEl.style.display);

                    // Fallback: Ако кликът не е променил display (все още е none), го променяме ръчно
                    if (contentEl.style.display === 'none') {
                        console.warn('Click failed to open accordion. Forcing display: block.');
                        contentEl.style.display = 'block';

                        // Завъртаме и стрелката ръчно, ако тригерът е стрелка
                        if (trigger.id === 'sorting-arrow' || trigger.id === 'boards-arrow' || trigger.classList.contains('accordion-arrow')) {
                            trigger.style.transition = 'transform 0.3s ease';
                            trigger.style.transform = 'rotate(180deg)';
                        }
                    }
                }
                break; // Намерили сме контейнера
            }
        }
    }

    /**
     * Отваря Settings modal (ако е затворен)
     */
    openSettings() {
        const settingsModal = document.getElementById('settings-modal');
        // Проверяваме дали модалът вече е отворен
        // Той е отворен, ако има клас 'visible' (според style.css) или ако style.display е изрично зададен
        const isVisible = settingsModal && (
            settingsModal.classList.contains('visible') ||
            settingsModal.style.display === 'block' ||
            settingsModal.style.display === 'flex'
        );

        if (!isVisible) {
            const settingsButton = document.getElementById('settings_button');
            if (settingsButton) {
                settingsButton.click();
            }
        }
    }

    /**
     * Затваря Settings modal (ако е отворен)
     */
    closeSettings() {
        const settingsModal = document.getElementById('settings-modal');
        const isVisible = settingsModal && (
            settingsModal.classList.contains('visible') ||
            settingsModal.style.display === 'block' ||
            settingsModal.style.display === 'flex' ||
            (!settingsModal.hasAttribute('hidden') && window.getComputedStyle(settingsModal).display !== 'none')
        );

        if (isVisible) {
            const closeBtn = document.getElementById('settings-close-btn');
            if (closeBtn) closeBtn.click();
        }
    }

    /**
     * Форматира отговор за показване в чата
     * @param {Object} result - Форматиран резултат
     * @param {string} userQuery - Въпросът на потребителя (по избор)
     * @returns {string} - HTML за показване
     */
    formatAnswerHTML(result, userQuery = '') {
        const normalize = (text) => {
            if (!text) return '';
            const div = document.createElement('div');
            div.innerHTML = text;
            return div.textContent.trim().toLowerCase();
        };

        const normalizedQuery = normalize(userQuery);
        let html = '';

        if (result.type === 'setting') {
            html += `<div class="kb-answer">`;
            if (result.question && normalize(result.question) !== normalizedQuery) {
                html += `<div class="kb-matched-question" style="font-style: italic; margin-bottom: 5px; opacity: 0.8;">${result.question}</div>`;
            }
            html += `<div class="kb-answer-text">${result.answer}</div>`;

            if (this.showLocation && result.location) {
                html += `<div class="kb-answer-location">📍 ${result.location}</div>`;
            }

            if (result.guide) {
                html += `<button class="kb-show-me-btn" data-guide='${JSON.stringify(result.guide)}'>`;
                html += `${this.getText('showMe')} →</button>`;
            }

            if (this.showRelatedSettings && result.relatedSettings && result.relatedSettings.length > 0) {
                html += `<div class="kb-related">`;
                html += `<div class="kb-related-title">${this.getText('relatedTopics')}</div>`;
                html += `<div class="kb-related-items">`;
                result.relatedSettings.forEach(id => {
                    html += `<span class="kb-related-item" data-id="${id}">${id}</span>`;
                });
                html += `</div></div>`;
            }

            html += `</div>`;
        } else if (result.type === 'ui') {
            html += `<div class="kb-answer">`;
            if (result.label && normalize(result.label) !== normalizedQuery) {
                html += `<div class="kb-matched-question" style="font-style: italic; margin-bottom: 5px; opacity: 0.8;">${result.label}</div>`;
            }
            html += `<div class="kb-answer-text">${result.description}</div>`;

            if (result.guide) {
                html += `<button class="kb-show-me-btn" data-guide='${JSON.stringify(result.guide)}'>`;
                html += `${this.getText('showMe')} →</button>`;
            }
            html += `</div>`;
        } else if (result.type === 'general') {
            html += `<div class="kb-answer">`;
            if (result.question && normalize(result.question) !== normalizedQuery) {
                html += `<div class="kb-matched-question" style="font-style: italic; margin-bottom: 5px; opacity: 0.8;">${result.question}</div>`;
            }
            html += `<div class="kb-answer-text">${result.answer}</div>`;

            if (result.guide) {
                html += `<button class="kb-show-me-btn" data-guide='${JSON.stringify(result.guide)}'>`;
                html += `${this.getText('showMe')} →</button>`;
            }

            html += `</div>`;
        }

        return html;
    }

    /**
     * Обновява езика на асистента
     */
    updateLanguage() {
        this.currentLang = this.getCurrentLanguage();
        if (this.matcher) {
            this.matcher.currentLang = this.currentLang;
        }
    }
}

// Глобална инстанция
window.kbAssistant = new KBAssistant();

// Auto-init при зареждане на страницата
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.kbAssistant.init();
    });
} else {
    window.kbAssistant.init();
}
