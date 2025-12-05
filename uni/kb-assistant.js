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

        // Текстове на асистента
        this.texts = {
            bg: {
                greeting: "Здравей! 👋 Аз съм вашият асистент. Как мога да помогна?",
                noResults: "Съжалявам, не намерих отговор на този въпрос. 😔",
                suggestions: "Може да попитате:",
                showMe: "Покажи ми къде",
                relatedTopics: "Свързани теми:",
                loading: "Зареждам...",
                error: "Възникна грешка при зареждане на базата от знания."
            },
            en: {
                greeting: "Hello! 👋 I'm your assistant. How can I help?",
                noResults: "Sorry, I couldn't find an answer to that question. 😔",
                suggestions: "You might ask:",
                showMe: "Show me where",
                relatedTopics: "Related topics:",
                loading: "Loading...",
                error: "An error occurred while loading the knowledge base."
            }
        };
    }

    getCurrentLanguage() {
        return localStorage.getItem('language') || 'en';
    }

    getText(key) {
        return this.texts[this.currentLang][key] || this.texts.en[key];
    }

    /**
     * Инициализация - зарежда KB данните
     */
    async init() {
        try {
            // Зареждаме KB данните от JSON файла
            const response = await fetch('kb-template.json');
            if (!response.ok) {
                throw new Error('Failed to load KB data');
            }

            this.kbData = await response.json();
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

        // Търсим в KB
        const results = this.matcher.search(query, 3);

        if (results.length === 0) {
            return {
                success: false,
                message: this.getText('noResults'),
                suggestions: this.getSuggestions()
            };
        }

        // Форматираме резултатите
        const formattedResults = results.map(r => this.matcher.formatResult(r));

        return {
            success: true,
            results: formattedResults,
            topResult: formattedResults[0]
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
        if (!guideData) {
            console.warn('No guide data provided');
            return;
        }

        // Контексти, които се намират в Settings
        const settingsContexts = ['display', 'sorting', 'boards', 'data', 'behavior', 'startup', 'settings'];
        const isSettingsContext = settingsContexts.includes(guideData.context);

        // Проверяваме дали има target елемент
        let targetElement = document.querySelector(guideData.target);

        // Ако елементът не е намерен, но е в Settings контекст, опитваме да отворим Settings
        if (!targetElement && isSettingsContext) {
            this.openSettings();

            // Даваме малко време на DOM-а да се обнови
            setTimeout(() => {
                targetElement = document.querySelector(guideData.target);
                if (targetElement) {
                    this.highlightElement(targetElement);
                } else {
                    // Fallback: ако все още не го намираме, highlight-ваме целия модал
                    const settingsModal = document.getElementById('settings-modal');
                    if (settingsModal) {
                        this.highlightElement(settingsModal);
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
                // Намираме елемента отново, за всеки случай (ако референцията е стара)
                const el = document.querySelector(guideData.target) || targetElement;
                this.highlightElement(el);
            }, 300);
        } else {
            // За UI елементи директно highlight-ваме
            this.highlightElement(targetElement);
        }

        // Ако има глобална guide система (от msmguide.js), използваме я
        if (typeof window.showGuideStep === 'function') {
            const step = {
                image: guideData.image,
                height: guideData.height,
                target: guideData.target,
                text: this.getGuideText(guideData),
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
    highlightElement(element) {
        // Scroll до елемента
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Премахваме предишни pointers
        const existingPointer = document.getElementById('kb-pointer-img');
        if (existingPointer) existingPointer.remove();

        // Създаваме нов pointer
        const pointer = document.createElement('img');
        pointer.id = 'kb-pointer-img';
        pointer.src = 'msm-show.png';
        pointer.className = 'kb-pointer-image';

        // Изчисляваме позиция
        const rect = element.getBoundingClientRect();
        const centerX = rect.left + (rect.width / 2);
        const centerY = rect.top + (rect.height / 2);

        // Позиционираме горния десен ъгъл на картинката в центъра на елемента
        pointer.style.top = `${centerY}px`;
        pointer.style.left = `${centerX}px`;

        // Скриване при клик
        const hidePointer = () => {
            pointer.style.opacity = '0';
            setTimeout(() => pointer.remove(), 300);
        };

        pointer.addEventListener('click', hidePointer);
        pointer.addEventListener('touchstart', hidePointer);

        document.body.appendChild(pointer);

        // Премахваме pointer след 10 секунди
        const timeoutId = setTimeout(() => {
            if (pointer.parentNode) {
                hidePointer();
            }
        }, 10000);

        // Наблюдаваме дали елементът става невидим
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) {
                    hidePointer();
                    observer.disconnect();
                    clearTimeout(timeoutId);
                }
            });
        }, { threshold: 0 });

        observer.observe(element);

        // Допълнителна проверка за премахване от DOM (MutationObserver)
        const mutationObserver = new MutationObserver(() => {
            if (!document.body.contains(element)) {
                hidePointer();
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
     * Форматира отговор за показване в чата
     * @param {Object} result - Форматиран резултат
     * @returns {string} - HTML за показване
     */
    formatAnswerHTML(result) {
        let html = '';

        if (result.type === 'setting') {
            html += `<div class="kb-answer">`;
            html += `<div class="kb-answer-text">${result.answer}</div>`;

            if (result.location) {
                html += `<div class="kb-answer-location">📍 ${result.location}</div>`;
            }

            if (result.guide) {
                html += `<button class="kb-show-me-btn" data-guide='${JSON.stringify(result.guide)}'>`;
                html += `${this.getText('showMe')} →</button>`;
            }

            if (result.relatedSettings && result.relatedSettings.length > 0) {
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
            html += `<div class="kb-answer-text">${result.description}</div>`;

            if (result.guide) {
                html += `<button class="kb-show-me-btn" data-guide='${JSON.stringify(result.guide)}'>`;
                html += `${this.getText('showMe')} →</button>`;
            }
            html += `</div>`;
        } else if (result.type === 'general') {
            html += `<div class="kb-answer">`;
            html += `<div class="kb-answer-text">${result.answer}</div>`;
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
