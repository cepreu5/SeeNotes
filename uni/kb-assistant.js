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

        // Проверяваме дали има target елемент
        const targetElement = document.querySelector(guideData.target);

        if (!targetElement) {
            console.warn(`Target element not found: ${guideData.target}`);

            // Ако елементът не е намерен, отваряме Settings modal
            this.openSettings();

            // Показваме съобщение
            setTimeout(() => {
                const settingsModal = document.getElementById('settings-modal');
                if (settingsModal && settingsModal.style.display !== 'none') {
                    // Highlight-ваме целия Settings modal
                    this.highlightElement(settingsModal);

                    // Показваме съобщение в конзолата
                    const msg = this.currentLang === 'bg'
                        ? `Настройката се намира в Settings. Моля, потърсете я ръчно.`
                        : `The setting is in Settings. Please search for it manually.`;
                    console.info(msg);
                }
            }, 500);

            return;
        }

        // Ако елементът е намерен, отваряме Settings (ако е настройка)
        if (guideData.context === 'settings') {
            this.openSettings();

            // Изчакваме Settings да се отвори
            setTimeout(() => {
                this.highlightElement(targetElement);
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
        // Премахваме предишни highlights
        document.querySelectorAll('.kb-highlight').forEach(el => {
            el.classList.remove('kb-highlight');
        });

        // Добавяме highlight
        element.classList.add('kb-highlight');

        // Scroll до елемента
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });

        // Премахваме highlight след 3 секунди
        setTimeout(() => {
            element.classList.remove('kb-highlight');
        }, 3000);
    }

    /**
     * Отваря Settings modal (ако е затворен)
     */
    openSettings() {
        const settingsButton = document.getElementById('settings_button');
        if (settingsButton) {
            settingsButton.click();
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
