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
        this.fabButton.innerHTML = '<img src="msm/msm-assist.png" alt="Mr. StickyMan" style="width: 40px; height: 40px; object-fit: contain;">';
        this.fabButton.title = 'Mr. StickyMan Assistant';

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
            <button class="kb-reload-btn" id="kb-hero-btn" title="Show Hero" style="font-size: 20px;"><img src="msm/msm-assist.png" alt="Mr. StickyMan" style="width: 24px; height: 24px; object-fit: contain;"></button>
            <button class="kb-reload-btn" id="kb-flip-btn" title="Flip Image" style="font-size: 20px;">↔</button>
            <button class="kb-reload-btn" id="kb-reload-btn" title="Reload Knowledge Base">↻</button>
            `
            : '';

        this.container.innerHTML = `
            <div class="kb-header">
                <div class="kb-header-title">
                    <span class="kb-icon"><img src="msm/msm-assist.png" alt="Mr. StickyMan" style="width: 24px; height: 24px; object-fit: contain;"></span>
                    <span class="kb-title">Mr. StickyMan</span>
                </div>
                <div class="kb-header-controls" style="display: flex; gap: 8px; align-items: center;">
                    ${debugControlsHtml}
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
                    placeholder="Задайте въпрос..."
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
                    this.updateTexts();
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

            // Event delegation за свързани теми
            const relatedItem = e.target.closest('.kb-related-item');
            if (relatedItem) {
                const settingId = relatedItem.dataset.id;
                // Търсим настройката по ID
                this.inputField.value = settingId.replace(/-/g, ' ');
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
        this.fabButton.classList.add('kb-fab-hidden');

        // Обновяваме текстовете
        this.updateTexts();

        // Фокус на input полето
        setTimeout(() => {
            this.inputField.focus();
        }, 300);

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
                this.updateTexts();
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
        if (typeof window.removeGuide === 'function') {
            window.removeGuide();
        }
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
    addMessage(type, content, customClass = '', showIcon = true) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `kb-message kb-message-${type}`;

        let iconHtml = '';
        if (showIcon) {
            // Използваме изображения вместо emoji - Fix case sensitivity for user-icon.png
            const icon = type === 'user'
                ? '<img src="user-icon.png" alt="User" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">'
                : '<img src="msm/msm-assist.png" alt="Mr. StickyMan" style="width: 100%; height: 100%; object-fit: contain;">';
            iconHtml = `<div class="kb-message-icon">${icon}</div>`;
        }

        const contentClass = customClass ? `kb-message-content ${customClass}` : 'kb-message-content';

        messageDiv.innerHTML = `
            ${iconHtml}
            <div class="${contentClass}">${content}</div>
        `;

        this.chatBox.appendChild(messageDiv);

        // Scroll до дъното
        this.scrollToBottom();

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
        html += `<div class="kb-additional-title">${window.kbAssistant.getText('alsoInterested')}</div>`;

        results.forEach(result => {
            const question = result.question || result.label;
            html += `<div class="kb-additional-item">${question}</div>`;
        });

        html += '</div>';

        this.addMessage('assistant', html, 'kb-compact-padding', false);
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
     * Обновява placeholder текста според езика
     */
    updateLanguage() {
        const lang = window.kbAssistant.getCurrentLanguage();
        const placeholders = {
            bg: 'Задайте въпрос...',
            en: 'Ask a question...'
        };

        this.inputField.placeholder = placeholders[lang] || placeholders.en;

        // Обновяваме title на FAB
        const titles = {
            bg: 'Асистент',
            en: 'Assistant'
        };

        this.fabButton.title = titles[lang] || titles.en;

        // Обновяваме header title
        const headerTitle = this.container.querySelector('.kb-title');
        if (headerTitle) {
            headerTitle.textContent = titles[lang] || titles.en;
        }
    }
}

// Глобална инстанция
window.kbUI = null;

// Auto-init при зареждане на страницата
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.kbUI = new KBUI();
        // Auto-open removed as per user request
    });
} else {
    window.kbUI = new KBUI();
    // Auto-open removed as per user request
}
