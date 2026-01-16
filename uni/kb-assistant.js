/** terser kb-assistant.js -c 'pure_funcs=["console.log"]' --output kb-assistantt.js
 * 
 * 
 * KB Matcher - Интелигентен алгоритъм за съпоставяне на въпроси с KB записи
 * Използва keyword matching, fuzzy search и scoring система
 */

class KBMatcher {
    constructor(kbData) {
        this.kbData = kbData;
        this.currentLang = this.getCurrentLanguage();
    }

    getCurrentLanguage() {
        return localStorage.getItem('language') || 'en';
    }

    /**
     * Главна функция за търсене на отговор
     * @param {string} query - Въпросът на потребителя
     * @param {number} maxResults - Максимален брой резултати
     * @returns {Array} - Масив от резултати, сортирани по score
     */
    search(query, maxResults = 3) {
        if (!query || query.trim().length === 0) {
            return [];
        }

        const normalizedQuery = this.normalizeText(query);
        const queryWords = this.tokenize(normalizedQuery);

        // Търсим във всички секции
        const allResults = [];

        // Търсене в settings
        if (this.kbData.settings) {
            this.kbData.settings.forEach(item => {
                try {
                    const score = this.calculateScore(queryWords, item, 'settings');
                    if (score > 0) {
                        allResults.push({
                            type: 'setting',
                            item: item,
                            score: score
                        });
                    }
                } catch (e) {
                    console.warn('Skipping invalid KB setting item:', item, e);
                }
            });

        }

        // Търсене в UI елементи
        if (this.kbData.ui) {
            this.kbData.ui.forEach(item => {
                try {
                    const score = this.calculateScore(queryWords, item, 'ui');
                    if (score > 0) {
                        allResults.push({
                            type: 'ui',
                            item: item,
                            score: score
                        });
                    }
                } catch (e) {
                    console.warn('Skipping invalid KB UI item:', item, e);
                }
            });

        }

        // Търсене в general въпроси
        if (this.kbData.general) {
            this.kbData.general.forEach(item => {
                try {
                    const score = this.calculateScore(queryWords, item, 'general');
                    if (score > 0) {
                        allResults.push({
                            type: 'general',
                            item: item,
                            score: score
                        });
                    }
                } catch (e) {
                    console.warn('Skipping invalid KB general item:', item, e);
                }
            });

        }

        // Сортираме по score (най-високи първи)
        allResults.sort((a, b) => b.score - a.score);

        // Връщаме топ N резултата
        return allResults.slice(0, maxResults);
    }

    /**
     * Изчислява score за даден KB запис
     * @param {Array} queryWords - Думи от въпроса
     * @param {Object} item - KB запис
     * @param {string} type - Тип на записа (settings/ui/general)
     * @returns {number} - Score (0 = no match)
     */
    calculateScore(queryWords, item, type) {
        let score = 0;
        const lang = this.currentLang;

        // Вземаме keywords за текущия език
        const keywords = item.keywords?.[lang] || [];
        const question = item.question?.[lang] || '';
        const label = item.label?.[lang] || '';

        // Нормализираме всички текстове
        const normalizedKeywords = keywords.map(k => this.normalizeText(k));
        const normalizedQuestion = this.normalizeText(question);
        const normalizedLabel = this.normalizeText(label);

        // Проверяваме всяка дума от query-то
        queryWords.forEach(queryWord => {
            // Точно съвпадение в keywords = +10 точки
            if (normalizedKeywords.some(kw => kw === queryWord)) {
                score += 10;
            }
            // Частично съвпадение в keywords = +5 точки
            else if (normalizedKeywords.some(kw => kw.includes(queryWord) || queryWord.includes(kw))) {
                score += 5;
            }
            // Съвпадение в въпроса = +3 точки
            if (normalizedQuestion.includes(queryWord)) {
                score += 3;
            }
            // Съвпадение в label = +2 точки
            if (normalizedLabel.includes(queryWord)) {
                score += 2;
            }
            // Fuzzy match = +1 точка
            if (this.fuzzyMatch(queryWord, normalizedKeywords)) {
                score += 1;
            }
        });

        // Бонус за general въпроси (те са по-общи и често търсени)
        if (type === 'general') {
            score += 2;
        }

        return score;
    }

    /**
     * Нормализира текст - премахва диакритици, lowercase, trim
     * @param {string} text
     * @returns {string}
     */
    normalizeText(text) {
        if (!text) return '';

        return text
            .toLowerCase()
            .trim()
            // Премахваме пунктуация
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
            // Премахваме множество spaces
            .replace(/\s+/g, ' ');
    }

    /**
     * Разделя текст на думи
     * @param {string} text
     * @returns {Array}
     */
    tokenize(text) {
        return text.split(' ').filter(word => word.length > 2); // Игнорираме думи < 3 символа
    }

    /**
     * Fuzzy matching - проверява за близки съвпадения
     * @param {string} word - Дума от query
     * @param {Array} keywords - Масив от keywords
     * @returns {boolean}
     */
    fuzzyMatch(word, keywords) {
        return keywords.some(keyword => {
            // Levenshtein distance <= 2
            return this.levenshteinDistance(word, keyword) <= 2;
        });

    }

    /**
     * Изчислява Levenshtein distance между две думи
     * @param {string} a
     * @param {string} b
     * @returns {number}
     */
    levenshteinDistance(a, b) {
        const matrix = [];

        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }

        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }

        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // substitution
                        matrix[i][j - 1] + 1,     // insertion
                        matrix[i - 1][j] + 1      // deletion
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    }

    /**
     * Връща предложения за често задавани въпроси
     * @param {number} count - Брой предложения
     * @returns {Array}
     */
    getSuggestions(count = 5) {
        const suggestions = [];
        const lang = this.currentLang;

        // Вземаме първите N general въпроса
        if (this.kbData.general) {
            for (const item of this.kbData.general) {
                if (suggestions.length >= count) break;

                if (item.question && item.question[lang]) {
                    suggestions.push({
                        type: 'general',
                        question: item.question[lang],
                        item: item
                    });
                }
            }
        }

        return suggestions;
    }

    /**
     * Форматира резултат за показване
     * @param {Object} result - Резултат от search()
     * @returns {Object} - Форматиран отговор
     */
    formatResult(result) {
        const lang = this.currentLang;
        const item = result.item;

        let formattedResult = {
            type: result.type,
            score: result.score,
            id: item.id
        };

        if (result.type === 'setting') {
            formattedResult.question = item.question[lang] || item.question['en'];
            formattedResult.answer = item.answer[lang] || item.answer['en'];
            formattedResult.location = item.location;
            formattedResult.guide = item.guide;
            formattedResult.relatedSettings = item.relatedSettings;
        } else if (result.type === 'ui') {
            formattedResult.label = item.label[lang] || item.label['en'];
            formattedResult.description = item.description[lang] || item.description['en'];
            formattedResult.guide = item.guide;
        } else if (result.type === 'general') {
            formattedResult.question = item.question[lang] || item.question['en'];
            formattedResult.answer = item.answer[lang] || item.answer['en'];
            formattedResult.category = item.category;
            formattedResult.guide = item.guide;
        }

        return formattedResult;
    }
}

// Export за използване в други модули
if (typeof module !== 'undefined' && module.exports) {
    module.exports = KBMatcher;
}

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
            let text = await response.text();
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

            // Създаваме UI компонентите (FAB бутон и чат прозорец) само след успешна инициализация
            if (!window.kbUI) {
                window.kbUI = new KBUI();
            }
            this.ui = window.kbUI; // Референция за updateLanguage()

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
                    // Handle context transitions (Settings open/close)
                    if (isPrevSettings && !isCurrSettings) {
                        const existingOnStart = step.onStart;
                        step.onStart = () => {
                            if (existingOnStart) existingOnStart();
                            this.closeSettings();
                        };
                    } else if (!isPrevSettings && isCurrSettings) {
                        const existingOnStart = step.onStart;
                        step.onStart = () => {
                            if (existingOnStart) existingOnStart();
                            this.openSettings();
                        };
                    }
                    // Handle action (click element to reveal target)
                    if (step.action && step.action !== 'highlight' && step.action !== 'explain' && step.action !== 'explain!') {
                        const existingOnStart = step.onStart;
                        step.onStart = () => {
                            if (existingOnStart) existingOnStart();
                            // Click the action element
                            const actionElement = document.querySelector(step.action);
                            if (actionElement) {
                                console.log(`[KB Assistant] Clicking action element: ${step.action}`);
                                actionElement.click();
                            } else {
                                console.warn(`[KB Assistant] Action element not found: ${step.action}`);
                            }
                        };
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
                const guideJson = JSON.stringify(result.guide).replace(/'/g, "&#39;");
                html += `<button class="kb-show-me-btn" data-guide='${guideJson}'>`;
                html += `${this.getText('showMe')} →</button>`;
            }



            html += `</div>`;
        } else if (result.type === 'ui') {
            html += `<div class="kb-answer">`;
            if (result.label && normalize(result.label) !== normalizedQuery) {
                html += `<div class="kb-matched-question" style="font-style: italic; margin-bottom: 5px; opacity: 0.8;">${result.label}</div>`;
            }
            html += `<div class="kb-answer-text">${result.description}</div>`;

            if (result.guide) {
                const guideJson = JSON.stringify(result.guide).replace(/'/g, "&#39;");
                html += `<button class="kb-show-me-btn" data-guide='${guideJson}'>`;
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
                const guideJson = JSON.stringify(result.guide).replace(/'/g, "&#39;");
                html += `<button class="kb-show-me-btn" data-guide='${guideJson}'>`;
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
        // Обновяваме UI компонентите (title, input placeholder)
        if (this.ui) {
            this.ui.updateLanguage();
        }
        // Обновяваме и езика на "героя" (msm guide), ако е активен
        if (window.refreshGuideLanguage) {
            window.refreshGuideLanguage();
        }
    }
}

// Глобална инстанция (без автоматична инициализация)
// init() трябва да се извика ръчно след успешно логване от startApp() в main.js
window.kbAssistant = new KBAssistant();

/**
 * KB UI - Потребителски интерфейс на асистента
 * Чат прозорец, FAB бутон, предложения
 */
class KBUI {
    constructor() {
        this.isOpen = false;
        this.chatHistory = [];
        this.container = null;
        this.fabButton = null;
        this.chatBox = null;
        this.inputField = null;

        this.init();
    }

    /**
     * Инициализация на UI
     */
    init() {
        this.createFAB();
        this.createChatBox();
        this.attachEventListeners();
    }

    /**
     * Създава FAB (Floating Action Button)
     */
    createFAB() {
        this.fabButton = document.createElement('button');
        this.fabButton.id = 'kb-fab';
        this.fabButton.className = 'kb-fab';
        // Проверка при стартиране - ако е скрит в паметта, скриваме го веднага
        if (localStorage.getItem('hideAssistant') === 'true') {
            this.fabButton.style.display = 'none';
        }
        this.fabButton.innerHTML = '<img src="msm/msm-assist.png" alt="Assistant" style="width: 40px; height: 40px; object-fit: contain;">';
        this.fabButton.title = 'Assistant';

        document.body.appendChild(this.fabButton);
    }

    /**
     * Създава чат прозорец
     */
    /**
     * Създава чат прозорец
     */
    createChatBox() {
        this.container = document.createElement('div');
        this.container.id = 'kb-assistant-container';
        this.container.className = 'kb-assistant-container kb-hidden';

        // Check for debug mode (global variable from main.js)
        const isDebug = typeof debug !== 'undefined' && debug;
        const debugControlsHtml = isDebug
            ? `
            <button class="kb-reload-btn" id="kb-lang-btn" title="Toggle Language" style="font-size: 16px; font-weight: bold;">🌐</button>
            <button class="kb-reload-btn" id="kb-hero-btn" title="Show Hero" style="font-size: 20px;"><img src="msm/msm-assist.png" alt="Assistant" style="width: 24px; height: 24px; object-fit: contain;"></button>
            <button class="kb-reload-btn" id="kb-flip-btn" title="Flip Image" style="font-size: 20px;">↔</button>
            <button class="kb-reload-btn" id="kb-reload-btn" title="Reload Knowledge Base">↻</button>
            `
            : '';

        this.container.innerHTML = `
            <div class="kb-header">
                <div class="kb-header-title">
                    <span class="kb-icon"><img src="msm/msm-assist.png" alt="Assistant" style="width: 24px; height: 24px; object-fit: contain;"></span>
                    <span class="kb-title">Assistant</span>
                </div>
                <div class="kb-header-controls" style="display: flex; gap: 8px; align-items: center;">
                    ${debugControlsHtml}
                    <button class="kb-reload-btn" id="kb-all-questions-btn" title="All Questions" style="font-size: 18px; padding-top: 4px;">📑</button>
                    <button class="kb-close-btn" id="kb-close-btn" title="Minimize" 
                        style="padding-top: 10px; font-size: 20px; line-height: 20px;">−</button>
                </div>
            </div>
            
            <div class="kb-chat-messages" id="kb-chat-messages">
                <!-- Съобщенията ще се добавят тук -->
            </div>
            
            <div class="kb-suggestions" id="kb-suggestions">
                <!-- Предложенията ще се добавят тук -->
            </div>
            
            <div class="kb-input-container">
                <input 
                    type="text" 
                    id="kb-input" 
                    class="kb-input" 
                    placeholder="${(window.kbAssistant && typeof window.kbAssistant.getText === 'function') ? window.kbAssistant.getText('inputPlaceholder') : '...'}"
                    autocomplete="off"

                />
                <button class="kb-clear-btn" id="kb-clear-btn" title="Clear">×</button>
                <button class="kb-send-btn" id="kb-send-btn">→</button>
            </div>
        `;

        document.body.appendChild(this.container);

        // Запазваме референции
        this.chatBox = document.getElementById('kb-chat-messages');
        this.inputField = document.getElementById('kb-input');
        this.suggestionsBox = document.getElementById('kb-suggestions');
    }

    /**
     * Прикачва event listeners
     */
    attachEventListeners() {
        // FAB бутон - отваря/затваря чата
        this.fabButton.addEventListener('click', (e) => {
            if (e.ctrlKey) {
                // Превключване на прозрачността при Ctrl + Click
                if (this.fabButton.style.opacity === '0.5') {
                    this.fabButton.style.opacity = '1';
                } else {
                    this.fabButton.style.opacity = '0.5';
                }
            } else {
                this.toggle();
            }
        });

        // Close бутон
        document.getElementById('kb-close-btn').addEventListener('click', () => {
            this.close();
        });

        // All Questions бутон
        const allQuestionsBtn = document.getElementById('kb-all-questions-btn');
        if (allQuestionsBtn) {
            allQuestionsBtn.addEventListener('click', () => {
                this.showAllQuestions();
            });

        }

        // Reload бутон (only if it exists)
        const reloadBtn = document.getElementById('kb-reload-btn');
        if (reloadBtn) {
            reloadBtn.addEventListener('click', async () => {
                reloadBtn.classList.add('kb-spin'); // Add spinning animation class
                if (window.kbAssistant) {
                    const success = await window.kbAssistant.init();
                    if (success) {
                        this.clear();
                        this.showGreeting();
                    } else {
                        this.addMessage('assistant', 'Failed to reload Knowledge Base. ❌', '', false);
                    }
                }
                setTimeout(() => {
                    reloadBtn.classList.remove('kb-spin');
                }, 1000);
            });

        }

        // Hero бутон (only if it exists)
        const heroBtn = document.getElementById('kb-hero-btn');
        if (heroBtn) {
            heroBtn.addEventListener('click', () => {
                this.close(); // Затваряме чата при клик
                if (typeof window.toggleHero === 'function') {
                    window.toggleHero();
                } else if (typeof showStep === 'function') {
                    // Fallback
                    showStep(0);
                } else {
                    console.error('Guide functions not found');
                    this.addMessage('assistant', 'Error: msm.js functions not found', '', false);
                }
            });

        }

        // Flip Img Button (only if it exists)
        const flipBtn = document.getElementById('kb-flip-btn');
        if (flipBtn) {
            flipBtn.addEventListener('click', () => {
                if (typeof window.msmFlipImage === 'function') {
                    window.msmFlipImage();
                } else {
                    console.warn('msmFlipImage function not found');
                }
            });

        }

        // Language toggle button (only if it exists)
        const langBtn = document.getElementById('kb-lang-btn');
        if (langBtn) {
            langBtn.addEventListener('click', () => {
                const currentLang = localStorage.getItem('language') || 'en';
                const newLang = currentLang === 'bg' ? 'en' : 'bg';
                localStorage.setItem('language', newLang);
                if (window.kbAssistant) {
                    window.kbAssistant.updateLanguage();
                    this.updateLanguage();
                    this.clear();
                    this.showGreeting();
                }
            });

        }

        // Send бутон
        document.getElementById('kb-send-btn').addEventListener('click', () => {
            const val = this.inputField.value;
            if (val.length === 0) {
                this.close();
            } else {
                this.sendMessage();
            }
        });

        // Clear бутон
        const clearBtn = document.getElementById('kb-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                this.inputField.value = '';
                this.inputField.focus();
                this.inputField.dispatchEvent(new Event('input'));
            });

        }

        // Enter key в input полето
        this.inputField.addEventListener('keydown', (e) => {
            // Спираме прорагацията на събитието, за да не се задействат глобални shortcut-и (напр. Space за Next Step или Scroll)
            e.stopPropagation();
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent default (like form submission or newline)
                const val = this.inputField.value;
                if (val.length === 0) {
                    this.close();
                } else {
                    this.sendMessage();
                }
            }
        });

        // Filter suggestions while typing in full mode
        this.inputField.addEventListener('input', () => {
            const query = this.inputField.value.trim().toLowerCase();
            if (this.container.classList.contains('kb-full-mode')) {
                const items = this.suggestionsBox.querySelectorAll('.kb-suggestion-item');
                items.forEach(item => {
                    const text = item.textContent.toLowerCase();
                    if (text.includes(query)) {
                        item.style.display = '';
                    } else {
                        item.style.display = 'none';
                    }
                });
            }
        });

        // Затваряне при клик извън чата
        document.addEventListener('click', (e) => {
            if (this.isOpen &&
                !this.container.contains(e.target) &&
                !this.fabButton.contains(e.target)) {
                // Не затваряме автоматично - потребителят трябва да кликне X
            }
        });

        // Event delegation за "Show me" бутоните и други елементи в чата
        this.chatBox.addEventListener('click', (e) => {
            // Event delegation за "Show me" бутоните
            const showMeBtn = e.target.closest('.kb-show-me-btn');
            if (showMeBtn) {
                const guideData = JSON.parse(showMeBtn.dataset.guide);
                this.showGuide(guideData);
            }
            // Event delegation за history items
            const historyItem = e.target.closest('.kb-history-item');
            if (historyItem) {
                const question = historyItem.textContent;
                this.inputField.value = question;
                this.sendMessage();
            }
            // Event delegation за допълнителни резултати
            const additionalItem = e.target.closest('.kb-additional-item');
            if (additionalItem) {
                const question = additionalItem.textContent.trim();
                this.inputField.value = question;
                this.sendMessage();
            }
            // Copy user question text to input on click
            const userMsgContent = e.target.closest('.kb-message-user .kb-message-content');
            if (userMsgContent) {
                this.inputField.value = userMsgContent.textContent.trim();
                this.inputField.focus();
            }
        });

        // Event delegation за suggestions
        this.suggestionsBox.addEventListener('click', (e) => {
            const suggestionItem = e.target.closest('.kb-suggestion-item');
            if (suggestionItem) {
                const question = suggestionItem.textContent;
                this.inputField.value = question;
                this.sendMessage();
            }
        });

        // Предотвратяване на скролването на страницата
        this.preventScrollPropagation(this.chatBox);
        this.preventScrollPropagation(this.suggestionsBox);
        this.preventScrollPropagation(this.container);
    }

    /**
     * Предотвратява скролирането на страницата, когато се достигне края на елемента
     * @param {HTMLElement} element 
     */
    preventScrollPropagation(element) {
        if (!element) return;

        element.addEventListener('wheel', (e) => {
            const delta = e.deltaY;
            const contentHeight = element.scrollHeight;
            const visibleHeight = element.offsetHeight;
            const scrollTop = element.scrollTop;
            // Винаги спираме пропагацията към родителските елементи
            e.stopPropagation();
            // Ако няма скролбар, спираме стандартното поведение (скролиране)
            if (visibleHeight >= contentHeight) {
                e.preventDefault();
                return;
            }
            // Ако сме в краищата и се опитваме да скролираме извън тях
            if ((delta < 0 && scrollTop <= 0) ||
                (delta > 0 && scrollTop + visibleHeight >= contentHeight - 1)) {
                e.preventDefault();
            }
        }, { passive: false });

    }

    /**
     * Обновява текстовете в UI според езика
     */
    updateTexts() {
        if (!window.kbAssistant) return;

        const titleEl = this.container.querySelector('.kb-title');
        const inputEl = this.inputField;

        if (titleEl) {
            titleEl.textContent = window.kbAssistant.getText('assistantName');
        }
        if (inputEl) {
            inputEl.placeholder = window.kbAssistant.getText('inputPlaceholder');
        }
    }

    /**
     * Отваря чата
     */
    open() {
        this.isOpen = true;
        this.container.classList.remove('kb-hidden');
        this.container.classList.remove('kb-full-mode'); // Reset full mode
        this.fabButton.classList.add('kb-fab-hidden');

        // Обновяваме текстовете
        this.updateLanguage();

        // Фокус на input полето - премахнато по желание на потребителя (за мобилни устройства)
        // setTimeout(() => {
        //     this.inputField.focus();
        // }, 300);

        // Показваме greeting ако няма история
        if (this.chatHistory.length === 0) {
            // Обновяваме езика преди greeting
            if (window.kbAssistant) {
                // Ensure initialized if necessary (though it should be auto-inited)
                if (!window.kbAssistant.texts || Object.keys(window.kbAssistant.texts.en || {}).length === 0) {
                    // Wait slightly or trigger init? 
                    // Since showGreeting is async, we can await init if not ready?
                    // But open() is synchronous.
                    // Better: showGreeting handles the check.
                }

                window.kbAssistant.updateLanguage();
                // Обновяваме текстовете отново след updateLanguage, за да сме сигурни
                this.updateLanguage();
                this.showGreeting();
            } else {
                console.warn("kbAssistant not ready when opening UI");
            }
        }
    }

    /**
     * Затваря чата
     */
    close() {
        this.isOpen = false;
        this.container.classList.add('kb-hidden');
        this.fabButton.classList.remove('kb-fab-hidden');

        // Stop guide execution if running
        // if (typeof window.removeGuide === 'function') {
        //     window.removeGuide();
        // }

    }

    /**
     * Toggle чата
     */
    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    /**
     * Показва greeting съобщение
     */
    async showGreeting() {
        if (!window.kbAssistant) return;

        // Ensure initialized
        if (!window.kbAssistant.isInitialized) {
            await window.kbAssistant.init();
        }

        const greeting = window.kbAssistant.getText('greeting');
        this.addMessage('assistant', greeting);

        // Показваме suggestions
        await this.showSuggestions();
    }

    /**
     * Показва предложения за въпроси
     */
    async showSuggestions() {
        const suggestions = window.kbAssistant.getSuggestions(5);

        if (suggestions.length === 0) return;

        const suggestionsTitle = window.kbAssistant.getText('suggestions');

        let html = `<div class="kb-suggestions-title">${suggestionsTitle}</div>`;
        html += `<div class="kb-suggestions-list">`;

        suggestions.forEach(s => {
            html += `<div class="kb-suggestion-item">${s.question}</div>`;
        });

        html += `</div>`;

        this.suggestionsBox.innerHTML = html;
    }

    /**
     * Изпраща съобщение
     */
    async sendMessage() {
        this.container.classList.remove('kb-full-mode'); // Exit full mode

        let queryRaw = this.inputField.value;
        let query = queryRaw.trim();

        // Treat spaces as '?' command
        if (query === '' && queryRaw.length > 0) {
            query = '?';
        }

        if (!query) return;

        // Добавяме въпроса на потребителя (скриваме командата ?)
        if (query !== '?') {
            this.addMessage('user', query);
        }

        // Изчистваме input полето
        this.inputField.value = '';

        // Скриваме suggestions
        this.suggestionsBox.innerHTML = '';

        // Показваме loading
        this.showLoading();

        // Питаме асистента
        const response = await window.kbAssistant.ask(query);

        // Премахваме loading
        this.hideLoading();

        // Показваме отговора
        if (response.success && !response.isHistory) {
            this.showAnswer(response.topResult, query);

            // Показваме допълнителни резултати ако има
            if (response.results.length > 1) {
                this.showAdditionalResults(response.results.slice(1));
            }
        } else if (response.isHistory) {
            // Handle history display - reusing structure from showAdditionalResults for consistency
            let historyHtml = '<div class="kb-additional-results">';
            historyHtml += `<div class="kb-additional-title">${response.message}</div>`;

            if (response.history && response.history.length > 0) {
                response.history.forEach(q => {
                    historyHtml += `<div class="kb-additional-item">${q}</div>`;
                });

            }
            historyHtml += '</div>';

            this.addMessage('assistant', historyHtml, 'kb-compact-padding', false);
        } else {
            this.addMessage('assistant', response.message);

            // Показваме suggestions
            if (response.suggestions && response.suggestions.length > 0) {
                await this.showSuggestions();
            }
        }
    }

    /**
     * Добавя съобщение в чата
     * @param {string} type - 'user' или 'assistant'
     * @param {string} content - Съдържание (text или HTML)
     * @param {string} customClass - Опционален допълнителен клас
     * @param {boolean} showIcon - Дали да се показва икона
     */
    addMessage(type, content, customClass = '', showIcon = true, scrollMode = 'auto') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `kb-message kb-message-${type}`;

        let iconHtml = '';
        if (showIcon) {
            // Използваме изображения вместо emoji - Fix case sensitivity for user-icon.png
            const icon = type === 'user'
                ? '<img src="user-icon.png" alt="User" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">'
                : '<img src="msm/msm-assist.png" alt="Assistant" style="width: 100%; height: 100%; object-fit: contain;">';
            iconHtml = `<div class="kb-message-icon">${icon}</div>`;
        }

        const contentClass = customClass ? `kb-message-content ${customClass}` : 'kb-message-content';

        messageDiv.innerHTML = `
            ${iconHtml}
            <div class="${contentClass}">${content}</div>
        `;

        this.chatBox.appendChild(messageDiv);

        // Scroll logic
        if (scrollMode === 'none') {
            // No scroll
        } else if (scrollMode === 'bottom') {
            this.scrollToBottom();
        } else if (scrollMode === 'start') {
            setTimeout(() => {
                messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);

        } else {
            // auto
            if (type === 'assistant') {
                setTimeout(() => {
                    messageDiv.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);

            } else {
                this.scrollToBottom();
            }
        }

        // Запазваме в историята
        this.chatHistory.push({ type, content });
    }

    /**
     * Показва отговор
     * @param {Object} result - Форматиран резултат
     * @param {string} query - Въпросът на потребителя
     */
    showAnswer(result, query = '') {
        const answerHTML = window.kbAssistant.formatAnswerHTML(result, query);
        this.addMessage('assistant', answerHTML);
    }

    /**
     * Показва допълнителни резултати
     * @param {Array} results
     */
    showAdditionalResults(results) {
        if (results.length === 0) return;

        let html = '<div class="kb-additional-results">';
        const titleText = window.kbAssistant.getText('alsoInterested') || 'You might also be interested in:';
        html += `<div class="kb-additional-title">${titleText}</div>`;

        const seenQuestions = new Set();

        results.forEach(result => {
            const question = result.question || result.label || result.term || '...';
            if (question && question !== '...' && !seenQuestions.has(question)) {
                seenQuestions.add(question);
                html += `<div class="kb-additional-item">${question}</div>`;
            }
        });

        html += '</div>';

        this.addMessage('assistant', html, 'kb-compact-padding', false, 'none');
    }

    /**
     * Показва loading индикатор
     */
    showLoading() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'kb-message kb-message-assistant kb-loading';
        loadingDiv.id = 'kb-loading';

        loadingDiv.innerHTML = `
            <div class="kb-message-icon">🤖</div>
            <div class="kb-message-content">
                <div class="kb-loading-dots">
                    <span></span><span></span><span></span>
                </div>
            </div>
        `;

        this.chatBox.appendChild(loadingDiv);
        this.scrollToBottom();
    }

    /**
     * Скрива loading индикатор
     */
    hideLoading() {
        const loadingDiv = document.getElementById('kb-loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }

    /**
     * Scroll до дъното на чата
     */
    scrollToBottom() {
        setTimeout(() => {
            this.chatBox.scrollTop = this.chatBox.scrollHeight;
        }, 100);

    }

    /**
     * Показва guide
     * @param {Object} guideData
     */
    showGuide(guideData) {
        // Ако action завършва с '!', не затваряме чата
        const shouldClose = !(guideData && guideData.action && typeof guideData.action === 'string' && guideData.action.endsWith('!'));

        if (shouldClose) {
            // Затваряме чата
            this.close();
        }

        // Показваме guide
        window.kbAssistant.showGuide(guideData);
    }

    /**
     * Изчиства чата
     */
    clear() {
        this.chatBox.innerHTML = '';
        this.suggestionsBox.innerHTML = '';
        this.chatHistory = [];
    }

    /**
     * Показва всички въпроси от базата данни
     */
    showAllQuestions() {
        if (!window.kbAssistant || !window.kbAssistant.kbData) return;

        // Изчистваме чата и текущите предложения
        this.clear();
        this.container.classList.add('kb-full-mode'); // Enter full mode

        let questions = [];

        const extractQuestions = (items) => {
            if (!Array.isArray(items)) return;
            items.forEach(item => {
                // Пропускаме записи без въпроси
                if (!item.q && !item.question) return;
                let qVal = item.question || item.q;
                const lang = window.kbAssistant.getCurrentLanguage();
                if (typeof qVal === 'object' && qVal !== null) {
                    if (qVal[lang]) {
                        questions.push(qVal[lang]);
                    } else if (qVal['en']) {
                        questions.push(qVal['en']);
                    }
                } else if (typeof qVal === 'string') {
                    questions.push(qVal);
                } else if (Array.isArray(qVal)) {
                    questions.push(...qVal);
                }
            });
        };

        // Extract from known arrays
        if (window.kbAssistant.kbData.settings) {
            extractQuestions(window.kbAssistant.kbData.settings);
        }
        if (window.kbAssistant.kbData.general) {
            extractQuestions(window.kbAssistant.kbData.general);
        }

        // Fallback for array structure
        if (Array.isArray(window.kbAssistant.kbData)) {
            extractQuestions(window.kbAssistant.kbData);
        }

        // Prepare objects for sorting/deduping
        let questionObjs = questions.map(q => {
            const tmp = document.createElement('div');
            tmp.innerHTML = q;
            const clean = tmp.textContent || tmp.innerText || "";
            return { raw: q, clean: clean.trim() };
        });

        // Unique by clean text (keep first occurrence)
        const uniqueMap = new Map();
        questionObjs.forEach(item => {
            if (!uniqueMap.has(item.clean) && item.clean.length > 0) {
                uniqueMap.set(item.clean, item);
            }
        });

        questionObjs = Array.from(uniqueMap.values());

        // Sort by clean text
        questionObjs.sort((a, b) => a.clean.localeCompare(b.clean));

        const lang = window.kbAssistant.getCurrentLanguage();
        const titleText = (window.kbAssistant && typeof window.kbAssistant.getText === 'function')
            ? window.kbAssistant.getText('allQuestionsTitle') + ':'
            : '';

        let html = `<div class="kb-suggestions-title">${titleText}</div>`;
        html += `<div class="kb-suggestions-list">`;

        questionObjs.forEach(item => {
            html += `<div class="kb-suggestion-item">${item.raw}</div>`;
        });

        html += `</div>`;

        this.suggestionsBox.innerHTML = html;
    }

    /**
     * Обновява placeholder текста според езика
     */
    updateLanguage() {
        if (!window.kbAssistant || typeof window.kbAssistant.getText !== 'function') return;
        this.inputField.placeholder = window.kbAssistant.getText('inputPlaceholder');
        // Обновяваме title на FAB
        this.fabButton.title = window.kbAssistant.getText('assistantTitle');
        // Обновяваме header title
        const headerTitle = this.container.querySelector('.kb-title');
        if (headerTitle) {
            headerTitle.textContent = window.kbAssistant.getText('assistantName');
        }
        // Обновяваме All Questions Button tooltip
        const allQuestionsBtn = document.getElementById('kb-all-questions-btn');
        if (allQuestionsBtn) {
            allQuestionsBtn.title = window.kbAssistant.getText('allQuestionsTitle');
        }
    }
}

// Глобална инстанция (без автоматична инициализация)
// KBUI ще се създаде от KBAssistant.init() след успешно логване
window.kbUI = null;
