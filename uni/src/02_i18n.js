let SUPPORTED_LANGUAGES = [
    { id: 'en', label: 'EN' },
    { id: 'bg', label: 'BG' }
];

function renderLanguageSwitchers(onChangeCallback) {
    const build = (languages) => {
        let container = document.getElementById('lang-switcher-main');
        if (!container) return;

        // Ако браузърът е кеширал стар HTML, в който контейнерът е select (а не div):
        if (container.tagName.toLowerCase() === 'select') {
            container.innerHTML = '';
            container.style.cssText = 'font-size: 16px; padding: 6px 30px 6px 12px; border-radius: 6px; background: #afbac6; border: 1px solid #ccc; cursor: pointer; outline: none; margin-bottom: 15px; color: #333;';
            languages.forEach(lang => {
                const option = document.createElement('option');
                option.value = lang.id;
                option.textContent = lang.label;
                if (lang.id === currentLang) option.selected = true;
                container.appendChild(option);
            });
            // Remove old listeners by cloning
            const newSelect = container.cloneNode(true);
            container.parentNode.replaceChild(newSelect, container);
            if (typeof onChangeCallback === 'function') {
                newSelect.addEventListener('change', (e) => {
                    const lang = e.target.value;
                    localStorage.setItem('language', lang);
                    window.location.reload();
                });
            }
            return;
        }

        // Стандартно рендиране в div контейнер
        container.innerHTML = '';
        const select = document.createElement('select');
        select.id = 'main-lang-select';
        select.className = 'lang-select';
        select.style.cssText = 'font-size: 16px; padding: 6px 30px 6px 12px; border-radius: 6px; background: #afbac6; border: 1px solid #ccc; cursor: pointer; outline: none; margin-bottom: 0px; color: #333;';

        languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang.id;
            option.textContent = lang.label;
            if (lang.id === currentLang) option.selected = true;
            select.appendChild(option);
        });

        if (typeof onChangeCallback === 'function') {
            select.addEventListener('change', (e) => {
                const lang = e.target.value;
                localStorage.setItem('language', lang);
                window.location.reload();
            });
        }
        container.appendChild(select);
    };

    // Предварително рисуване
    build(SUPPORTED_LANGUAGES);

    // Фонов ъпдейт
    fetch('languages.json', { cache: 'no-store' })
        .then(res => res.ok ? res.json() : null)
        .then(data => {
            if (data && Array.isArray(data) && data.length > 0) {
                const isDifferent = JSON.stringify(data) !== JSON.stringify(SUPPORTED_LANGUAGES);
                if (isDifferent) {
                    SUPPORTED_LANGUAGES = data;
                    build(SUPPORTED_LANGUAGES);
                }
            }
        })
        .catch(err => console.warn('languages.json fallback to default', err));
}

let currentLang = localStorage.getItem('language') || 'en';

function applyLanguageFromUrl() {
    const search = window.location.search.toLowerCase();
    const params = new URLSearchParams(window.location.search);
    let requestedLang = params.get('lang') || params.get('language') || '';
    if (!requestedLang) {
        const matched = SUPPORTED_LANGUAGES.find(lang => {
            const id = lang.id.toLowerCase();
            return search === `?${id}` || search.startsWith(`?${id}&`) || params.has(lang.id);
        });
        if (matched) requestedLang = matched.id;
    }
    const isSupported = SUPPORTED_LANGUAGES.some(lang => lang.id.toLowerCase() === requestedLang.toLowerCase());
    if (isSupported) {
        localStorage.setItem('language', requestedLang);
        currentLang = requestedLang;
        window.hasUrlLanguage = true;
    }
}

applyLanguageFromUrl();

let appTranslations = {};

const noteBackgrounds = [
    'wg1_1.png', // 0
    'wr1_1.png', // 1
    'wb1_1.png', // 2
    'wr1_1.png', // 3
    'wg1_1.png', // 4
    'wy1_1.png', // 5
    'wb1_1.png', // 6
    'wr1_1.png', // 7
    'wy1_1.png', // 8
    'stl1_1.png', // 9
    'stl2_1.png', // 10
    'stl3_1.png'  // 11
];

const noteColorMap = [
    '#FBFF86', '#FF829E', '#68FF97', '#EFEFEF', '#69B7FF',
    '#FBCB39', '#FBFBCD', '#FFC5D2', '#B6FFCD', '#B2DAFF',
    '#DDB1FF', '#B1D8FF', '#B1FFF2', '#FFD7B1', '#FFB1E8'
];

function colorIntToHex(intVal) {
    if (typeof intVal !== 'number') return intVal;
    return '#' + (intVal >>> 0).toString(16).slice(-6).toUpperCase();
}

function hexToColorInt(hex) {
    if (!hex || typeof hex !== 'string') return 0;
    if (hex.startsWith('#')) hex = hex.slice(1);
    if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
    return (parseInt('FF' + hex, 16) | 0);
}
const noteBgCache = new Map();
const customBgCache = new Map();

window.getPipeIndex = function (text) {
    if (!text) return -1;
    let tableInfo = null;
    if (typeof parseMarkdownTable === 'function') {
        tableInfo = parseMarkdownTable(text);
    }

    let inCode = false;
    let inBacktickCode = false;
    let currentLine = 0;

    for (let i = 0; i < text.length; i++) {
        if (text[i] === '\n') currentLine++;

        if (text.substring(i, i + 2) === '{{') {
            inCode = true;
            i++;
        } else if (text.substring(i, i + 2) === '}}') {
            inCode = false;
            i++;
        } else if (text.substring(i, i + 3) === '```') {
            inBacktickCode = !inBacktickCode;
            i += 2;
        } else if (text[i] === '|' && !inCode && !inBacktickCode) {
            if (tableInfo && currentLine >= tableInfo.startIndex && currentLine <= tableInfo.endIndex) {
                continue;
            }
            return i;
        }
    }
    return -1;
};

// --- Optimization: Preload unique backgrounds to avoid 'checkered' loading and reduce memory ---
async function preloadNoteBackgrounds(notesData) {
    const notesBgrdEnabled = localStorage.getItem('notesBgrd') !== 'false';
    if (!notesBgrdEnabled) return;

    const needed = new Set();
    notesData.forEach(note => {
        // We need backgrounds for deleted notes too, if user goes to trash!
        const noteColor = note.color;
        const color = (typeof noteColor === 'number' && noteColor >= 0 && noteColor < noteColorMap.length) ? noteColorMap[noteColor] : (typeof noteColor === 'string' ? noteColor : '#FBFF86');
        const img = (note.sellist && note.sellist > 0) ? note.sellist : 0;
        needed.add(`${color}_${img}`);
    });

    const promises = [];
    needed.forEach(key => {
        if (!noteBgCache.has(key)) {
            const parts = key.split('_'); // key is "color_img"
            const color = parts[0];
            const img = parseInt(parts[1]);
            const p = createColoredNoteBackground(color, img, 250, 250).then(canvas => {
                return new Promise(resolveBlob => {
                    canvas.toBlob(blob => {
                        const url = URL.createObjectURL(blob);
                        noteBgCache.set(key, `url("${url}")`);
                        resolveBlob();
                    }, 'image/png');
                });
            }).catch(e => console.warn("Failed to preload bg:", key, e));
            promises.push(p);
        }
    });
    await Promise.all(promises);
}
// Времено решение за проблем със скролирането до последната бележка при презареждане от иконата на браузъра
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
