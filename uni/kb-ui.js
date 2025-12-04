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
        this.fabButton.innerHTML = '<img src="msm-assist.png" alt="Mr. StickyMan" style="width: 40px; height: 40px; object-fit: contain;">';
        this.fabButton.title = 'Mr. StickyMan Assistant';

        document.body.appendChild(this.fabButton);
    }

    /**
     * Създава чат прозорец
     */
    createChatBox() {
        this.container = document.createElement('div');
        this.container.id = 'kb-assistant-container';
        this.container.className = 'kb-assistant-container kb-hidden';

        this.container.innerHTML = `
            <div class="kb-header">
                <div class="kb-header-title">
                    <span class="kb-icon"><img src="msm-assist.png" alt="Mr. StickyMan" style="width: 24px; height: 24px; object-fit: contain;"></span>
                    <span class="kb-title">Mr. StickyMan</span>
                </div>
                <button class="kb-close-btn" id="kb-close-btn">×</button>
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
        this.fabButton.addEventListener('click', () => {
            this.toggle();
        });

        // Close бутон
        document.getElementById('kb-close-btn').addEventListener('click', () => {
            this.close();
        });

        // Send бутон
        document.getElementById('kb-send-btn').addEventListener('click', () => {
            this.sendMessage();
        });

        // Enter key в input полето
        this.inputField.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
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

        // Event delegation за "Show me" бутоните
        this.chatBox.addEventListener('click', (e) => {
            if (e.target.classList.contains('kb-show-me-btn')) {
                const guideData = JSON.parse(e.target.dataset.guide);
                this.showGuide(guideData);
            }

            // Event delegation за допълнителни резултати
            if (e.target.classList.contains('kb-additional-item')) {
                const question = e.target.textContent.trim();
                this.inputField.value = question;
                this.sendMessage();
            }

            // Event delegation за свързани теми
            if (e.target.classList.contains('kb-related-item')) {
                const settingId = e.target.dataset.id;
                // Търсим настройката по ID
                this.inputField.value = settingId.replace(/-/g, ' ');
                this.sendMessage();
            }
        });

        // Event delegation за suggestions
        this.suggestionsBox.addEventListener('click', (e) => {
            if (e.target.classList.contains('kb-suggestion-item')) {
                const question = e.target.textContent;
                this.inputField.value = question;
                this.sendMessage();
            }
        });
    }

    /**
     * Отваря чата
     */
    open() {
        this.isOpen = true;
        this.container.classList.remove('kb-hidden');
        this.fabButton.classList.add('kb-fab-hidden');

        // Фокус на input полето
        setTimeout(() => {
            this.inputField.focus();
        }, 300);

        // Показваме greeting ако няма история
        if (this.chatHistory.length === 0) {
            // Обновяваме езика преди greeting
            if (window.kbAssistant) {
                window.kbAssistant.updateLanguage();
            }
            this.showGreeting();
        }
    }

    /**
     * Затваря чата
     */
    close() {
        this.isOpen = false;
        this.container.classList.add('kb-hidden');
        this.fabButton.classList.remove('kb-fab-hidden');
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
        const query = this.inputField.value.trim();

        if (!query) return;

        // Добавяме въпроса на потребителя
        this.addMessage('user', query);

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
        if (response.success) {
            this.showAnswer(response.topResult);

            // Показваме допълнителни резултати ако има
            if (response.results.length > 1) {
                this.showAdditionalResults(response.results.slice(1));
            }
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
     */
    addMessage(type, content, customClass = '') {
        const messageDiv = document.createElement('div');
        messageDiv.className = `kb-message kb-message-${type}`;

        // Използваме изображения вместо emoji
        const icon = type === 'user'
            ? '<img src="user-icon.png" alt="User" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">'
            : '<img src="msm-assist.png" alt="Mr. StickyMan" style="width: 100%; height: 100%; object-fit: contain;">';

        const contentClass = customClass ? `kb-message-content ${customClass}` : 'kb-message-content';

        messageDiv.innerHTML = `
            <div class="kb-message-icon">${icon}</div>
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
     */
    showAnswer(result) {
        const answerHTML = window.kbAssistant.formatAnswerHTML(result);
        this.addMessage('assistant', answerHTML);
    }

    /**
     * Показва допълнителни резултати
     * @param {Array} results
     */
    showAdditionalResults(results) {
        if (results.length === 0) return;

        let html = '<div class="kb-additional-results">';
        html += '<div class="kb-additional-title">Може също да ви интересува:</div>';

        results.forEach(result => {
            const question = result.question || result.label;
            html += `<div class="kb-additional-item">${question}</div>`;
        });

        html += '</div>';

        this.addMessage('assistant', html, 'kb-compact-padding');
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
        // Затваряме чата
        this.close();

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
    });
} else {
    window.kbUI = new KBUI();
}
