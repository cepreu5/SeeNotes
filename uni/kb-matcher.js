/**
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
            this.kbData.general.slice(0, count).forEach(item => {
                suggestions.push({
                    type: 'general',
                    question: item.question[lang],
                    item: item
                });
            });
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
            formattedResult.question = item.question[lang];
            formattedResult.answer = item.answer[lang];
            formattedResult.location = item.location;
            formattedResult.guide = item.guide;
            formattedResult.relatedSettings = item.relatedSettings;
        } else if (result.type === 'ui') {
            formattedResult.label = item.label[lang];
            formattedResult.description = item.description[lang];
            formattedResult.guide = item.guide;
        } else if (result.type === 'general') {
            formattedResult.question = item.question[lang];
            formattedResult.answer = item.answer[lang];
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
