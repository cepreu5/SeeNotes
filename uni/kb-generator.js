/**
 * KB Generator - Автоматично генериране на Knowledge Base template
 * 
 * Този скрипт анализира съществуващите файлове (index.html, i18n.js, main.js)
 * и генерира template за базата от знания на асистента.
 * 
 * НОВА ФУНКЦИОНАЛНОСТ (v2.0):
 * - Автоматично генериране на guide данни за интеграция с Mr. StickyMan
 * - Позициониране, размери на балона и визуализация за всяка настройка
 * - Default templates според типа на елемента (checkbox, select, range, etc.)
 * 
 * Използване:
 * 1. Отвори index.html в браузър
 * 2. Отвори Developer Console
 * 3. Копирай и изпълни този скрипт
 * 4. Резултатът ще се изведе в конзолата и ще се копира в clipboard
 */

(function () {
    console.log('🤖 KB Generator - Starting...');

    const kbTemplate = {
        metadata: {
            generated: new Date().toISOString(),
            version: '1.0.0',
            description: 'Knowledge Base Template for SeeNotes Assistant'
        },
        settings: [],
        ui: [],
        general: []
    };

    // ========================================================================
    // 1. ИЗВЛИЧАНЕ НА НАСТРОЙКИ ОТ HTML
    // ========================================================================

    console.log('📋 Extracting settings from HTML...');

    // Default guide templates за различни типове елементи
    const defaultGuidesByType = {
        checkbox: {
            image: 'msm/left-up.png',
            height: 150,
            x: -50,
            y: 10,
            bx: -200,
            by: 80,
            bWidth: 250,
            bHeight: 100,
            stopAfter: true,
            action: 'highlight'
        },
        select: {
            image: 'msm/left-up.png',
            height: 150,
            x: -50,
            y: 10,
            bx: -200,
            by: 80,
            bWidth: 250,
            bHeight: 100,
            stopAfter: true,
            action: 'highlight'
        },
        range: {
            image: 'msm/right-up.png',
            height: 150,
            x: -88,
            y: 1,
            bx: 199,
            by: 166,
            bWidth: 275,
            bHeight: 118,
            stopAfter: true,
            action: 'highlight'
        },
        number: {
            image: 'msm/left-up.png',
            height: 150,
            x: -50,
            y: 10,
            bx: -200,
            by: 80,
            bWidth: 250,
            bHeight: 100,
            stopAfter: true,
            action: 'highlight'
        },
        radio: {
            image: 'msm/left-up.png',
            height: 150,
            x: -50,
            y: 10,
            bx: -200,
            by: 80,
            bWidth: 250,
            bHeight: 100,
            stopAfter: true,
            action: 'highlight'
        }
    };

    const settingsElements = [
        // Checkboxes
        { id: 'show-datemod-checkbox', type: 'checkbox', category: 'display' },
        { id: 'one-tap-link-checkbox', type: 'checkbox', category: 'behavior' },
        { id: 'img-bgrd-checkbox', type: 'checkbox', category: 'display' },
        { id: 'show-board-note-count-checkbox', type: 'checkbox', category: 'display' },
        { id: 'weekly-calendar-checkbox', type: 'checkbox', category: 'calendar' },
        { id: 'remind-board-checkbox', type: 'checkbox', category: 'boards' },
        { id: 'all-board-checkbox', type: 'checkbox', category: 'boards' },
        { id: 'show-photos-board-checkbox', type: 'checkbox', category: 'boards' },
        { id: 'show-videos-board-checkbox', type: 'checkbox', category: 'boards' },
        { id: 'show-sounds-board-checkbox', type: 'checkbox', category: 'boards' },
        { id: 'show-other-board-checkbox', type: 'checkbox', category: 'boards' },
        { id: 'order-checkbox', type: 'checkbox', category: 'sorting' },
        { id: 'use-google-db-checkbox', type: 'checkbox', category: 'data' },
        { id: 'use-indexeddb-checkbox', type: 'checkbox', category: 'data' },
        { id: 'use-local-db-checkbox', type: 'checkbox', category: 'data' },
        { id: 'use-arh-db-checkbox', type: 'checkbox', category: 'data' },

        // Selects
        { id: 'start-board-select', type: 'select', category: 'startup' },
        { id: 'note-font-size-input', type: 'select', category: 'display' },
        { id: 'modal-font-size-input', type: 'select', category: 'display' },

        // Inputs
        { id: 'scaleSlider', type: 'range', category: 'display' },
        { id: 'max-searches-input', type: 'number', category: 'search' },

        // Radio buttons (sorting)
        { name: 'sort-criteria', value: 'numord', type: 'radio', category: 'sorting' },
        { name: 'sort-criteria', value: 'color', type: 'radio', category: 'sorting' },
        { name: 'sort-criteria', value: 'date', type: 'radio', category: 'sorting' },
        { name: 'sort-criteria', value: 'datemod', type: 'radio', category: 'sorting' },
        { name: 'sort-criteria', value: 'calendarDate', type: 'radio', category: 'sorting' },
        { name: 'sort-criteria', value: 'alpha', type: 'radio', category: 'sorting' }
    ];

    settingsElements.forEach(setting => {
        let element, label, i18nKey;

        if (setting.id) {
            element = document.getElementById(setting.id);
            if (element) {
                // Намираме label-а
                const labelElement = document.querySelector(`label[for="${setting.id}"]`);
                if (labelElement) {
                    i18nKey = labelElement.getAttribute('data-key');
                    label = {
                        bg: labelElement.textContent.trim(),
                        en: i18nKey ? (translations.en[i18nKey] || '') : ''
                    };
                }
            }
        } else if (setting.name) {
            // Radio button
            element = document.querySelector(`input[name="${setting.name}"][value="${setting.value}"]`);
            if (element) {
                const span = element.parentElement.querySelector('[data-key]');
                if (span) {
                    i18nKey = span.getAttribute('data-key');
                    label = {
                        bg: span.textContent.trim(),
                        en: i18nKey ? (translations.en[i18nKey] || '') : ''
                    };
                }
            }
        }

        if (element && label) {
            const settingId = setting.id || `${setting.name}-${setting.value}`;

            // Генерираме guide обект според типа на елемента
            const guideTemplate = defaultGuidesByType[setting.type] || defaultGuidesByType.checkbox;
            const guide = {
                ...guideTemplate,
                target: setting.id ? `#${setting.id}` : `input[name="${setting.name}"][value="${setting.value}"]`,
                context: setting.category
            };

            kbTemplate.settings.push({
                id: settingId,
                type: setting.type,
                category: setting.category,
                label: label,
                i18nKey: i18nKey || '',
                location: 'Settings',
                keywords: {
                    bg: [], // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                    en: []  // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                },
                question: {
                    bg: '', // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                    en: ''  // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                },
                answer: {
                    bg: '', // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                    en: ''  // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                },
                defaultValue: setting.type === 'checkbox' ? false : '',
                relatedSettings: [],
                guide: guide  // ← НОВ: Guide данни за визуализация
            });
        }
    });

    console.log(`✅ Extracted ${kbTemplate.settings.length} settings`);

    // ========================================================================
    // 2. ИЗВЛИЧАНЕ НА UI ЕЛЕМЕНТИ
    // ========================================================================

    console.log('🎨 Extracting UI elements...');

    const uiElements = [
        { id: 'search-box', type: 'input', i18nKey: 'searchPlaceholder' },
        { id: 'reload_button', type: 'button', i18nKey: 'reloadButtonTooltip' },
        { id: 'settings_button', type: 'button', i18nKey: 'settingsTitle' },
        { id: 'signout_button', type: 'button', i18nKey: 'signoutButtonTooltip' },
        { id: 'scrollTopBtn', type: 'button', i18nKey: 'topTooltip' },
        { id: 'mode_button', type: 'button', i18nKey: 'modeButtonTooltip' },
        { id: 'feedback_button', type: 'button', i18nKey: 'feedbackButtonTooltip' }
    ];

    uiElements.forEach(ui => {
        const element = document.getElementById(ui.id);
        if (element) {
            const title = element.getAttribute('title') || element.getAttribute('placeholder') || '';

            // Guide template за UI елементи (бутони и input полета)
            const uiGuideTemplate = ui.type === 'button' ? {
                image: 'msm/left-up.png',
                height: 200,
                x: 3,
                y: 16,
                bx: -250,
                by: 96,
                bWidth: 215,
                bHeight: 91,
                stopAfter: true,
                action: 'highlight'
            } : {
                image: 'msm/expl.png',
                height: 150,
                x: 25,
                y: 321,
                bx: 80,
                by: -14,
                bWidth: 241,
                bHeight: 124,
                stopAfter: true,
                action: 'highlight'
            };

            const guide = {
                ...uiGuideTemplate,
                target: `#${ui.id}`,
                context: 'ui'
            };

            kbTemplate.ui.push({
                id: ui.id,
                type: ui.type,
                i18nKey: ui.i18nKey,
                label: {
                    bg: title,
                    en: translations.en[ui.i18nKey] || ''
                },
                keywords: {
                    bg: [], // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                    en: []  // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                },
                description: {
                    bg: '', // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                    en: ''  // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                },
                guide: guide  // ← НОВ: Guide данни за визуализация
            });
        }
    });

    console.log(`✅ Extracted ${kbTemplate.ui.length} UI elements`);

    // ========================================================================
    // 3. ДОБАВЯНЕ НА ОБЩИ ВЪПРОСИ (TEMPLATE)
    // ========================================================================

    console.log('💡 Adding general questions template...');

    const generalQuestions = [
        {
            id: 'how-to-start',
            category: 'getting-started',
            keywords: {
                bg: ['начало', 'старт', 'как да започна', 'първи стъпки'],
                en: ['start', 'begin', 'getting started', 'first steps']
            },
            question: {
                bg: 'Как да започна работа с приложението?',
                en: 'How do I get started with the application?'
            },
            answer: {
                bg: '', // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                en: ''  // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
            }
        },
        {
            id: 'organize-notes',
            category: 'workflow',
            keywords: {
                bg: ['организация', 'подреждане', 'бележки', 'boards', 'дъски'],
                en: ['organize', 'arrangement', 'notes', 'boards']
            },
            question: {
                bg: 'Как да организирам бележките си?',
                en: 'How to organize my notes?'
            },
            answer: {
                bg: '', // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                en: ''  // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
            }
        },
        {
            id: 'search-notes',
            category: 'workflow',
            keywords: {
                bg: ['търсене', 'намиране', 'search', 'find'],
                en: ['search', 'find', 'lookup']
            },
            question: {
                bg: 'Как да търся в бележките?',
                en: 'How to search in notes?'
            },
            answer: {
                bg: '', // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                en: ''  // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
            }
        },
        {
            id: 'offline-mode',
            category: 'data-management',
            keywords: {
                bg: ['офлайн', 'без интернет', 'локално', 'offline'],
                en: ['offline', 'no internet', 'local', 'without connection']
            },
            question: {
                bg: 'Мога ли да работя без интернет?',
                en: 'Can I work offline?'
            },
            answer: {
                bg: '', // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                en: ''  // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
            }
        },
        {
            id: 'sync-google-drive',
            category: 'data-management',
            keywords: {
                bg: ['синхронизация', 'google drive', 'обновяване', 'sync'],
                en: ['sync', 'synchronization', 'google drive', 'update']
            },
            question: {
                bg: 'Как работи синхронизацията с Google Drive?',
                en: 'How does Google Drive synchronization work?'
            },
            answer: {
                bg: '', // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                en: ''  // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
            }
        },
        {
            id: 'calendar-view',
            category: 'features',
            keywords: {
                bg: ['календар', 'дати', 'calendar', 'dates'],
                en: ['calendar', 'dates', 'schedule']
            },
            question: {
                bg: 'Как да използвам календара?',
                en: 'How to use the calendar?'
            },
            answer: {
                bg: '', // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
                en: ''  // ← ТУК ТРЯБВА ДА ПОПЪЛНИШ
            }
        }
    ];

    kbTemplate.general = generalQuestions;
    console.log(`✅ Added ${kbTemplate.general.length} general questions`);

    // ========================================================================
    // 4. ГЕНЕРИРАНЕ НА JSON И КОПИРАНЕ
    // ========================================================================

    const jsonOutput = JSON.stringify(kbTemplate, null, 2);

    console.log('\n' + '='.repeat(80));
    console.log('📦 KB TEMPLATE GENERATED SUCCESSFULLY!');
    console.log('='.repeat(80));
    console.log(`\n📊 Statistics:`);
    console.log(`   - Settings: ${kbTemplate.settings.length} (all with guide data)`);
    console.log(`   - UI Elements: ${kbTemplate.ui.length} (all with guide data)`);
    console.log(`   - General Questions: ${kbTemplate.general.length}`);
    console.log(`   - Total Items: ${kbTemplate.settings.length + kbTemplate.ui.length + kbTemplate.general.length}`);
    console.log(`\n✨ NEW: All settings and UI elements include guide data for Mr. StickyMan integration!`);
    console.log('\n📋 JSON output copied to clipboard!');
    console.log('💾 Save it as: kb-template.json');
    console.log('\n' + '='.repeat(80));

    // Копиране в clipboard
    navigator.clipboard.writeText(jsonOutput).then(() => {
        console.log('✅ Copied to clipboard successfully!');
    }).catch(err => {
        console.error('❌ Failed to copy to clipboard:', err);
        console.log('\n📄 Here is the JSON output:\n');
        console.log(jsonOutput);
    });

    // Връщаме и резултата
    return kbTemplate;
})();
