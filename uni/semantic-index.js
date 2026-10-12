// b2.23: стъпка 3 от плана „Семантично търсене“ — блокът „Търсене по смисъл“ в Настройки (акордеон под „Подреждане на
// бележките“), свалянето на модела по натискане и индексът на бележките в IndexedDB (cx-notes-semantic-index).
// Двигателят е SeeNotesSemantic от semantic.js (b2.22) — тук само се вика. При зареждане на приложението НИЩО не се
// тегли и не се отваря: initSemanticSection() само закача слушатели; кешът и базата се поглеждат при отваряне на акордеона.
// Резултатите в търсачката не се променят — сливането на двата крака е стъпка 4.
// b2.24: по-бързо индексиране без промяна във векторите — партиди по 16, текстът се реже на 3000 знака (моделът и без
// това чете само първите 512 токена) и кратка пауза между партидите, за да диша интерфейсът.
(function () {
    'use strict';

    const MB = 1000 * 1000;
    const MODEL_MB = 118; // onnx/model_quantized.onnx — числото на бутона
    const READY_KEY = 'semanticIndexReady'; // '1' след пълен индекс — евтина проверка при всеки запис
    const SYNC_DELAY_MS = 3000; // поредица записи → едно обновяване
    const BATCH = 16;
    // e5 чете само първите 512 токена ≈ до ~2400 знака български (измерено: 3,56 знака/токен средно, 4,65 най-много);
    // 3000 оставя резерв — първите 512 токена са същите като на пълния текст. Под 2500 вече може да реже четен текст.
    const MAX_CHARS = 3000;
    const BATCH_PAUSE_MS = 20; // между партидите — рисува се напредъкът, интерфейсът не замръзва
    const VECTOR_BYTES = 384 * 4;

    let ui = { phase: 'idle' }; // idle | checking | downloading | indexing | ready | error
    let gen = 0; // всяко отказване / изтриване го вдига — старите обещания се игнорират
    let db = null;
    let syncPromise = null;
    let syncAgain = false;
    let syncTimer = null;
    let bound = false;

    const S = () => window.SeeNotesSemantic;
    const t = (key, vars) => {
        let s = (typeof _ === 'function' && _(key)) || key;
        if (vars) Object.keys(vars).forEach(k => { s = s.split('{' + k + '}').join(vars[k]); });
        return s;
    };
    const locale = () => (typeof currentLang !== 'undefined' && currentLang === 'bg') ? 'bg-BG' : 'en-US';
    const fmt = (n, digits) => Number(n).toLocaleString(locale(), { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 });

    // ---------- IndexedDB: vectors {id, fp, v} и meta {key: 'state', complete, count, modelId} ----------
    function openDB() {
        if (db) return Promise.resolve(db);
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(S().indexDbName, 1);
            req.onupgradeneeded = () => {
                const d = req.result;
                if (!d.objectStoreNames.contains('vectors')) d.createObjectStore('vectors', { keyPath: 'id' });
                if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
            };
            req.onsuccess = () => {
                db = req.result;
                db.onversionchange = () => closeDB(); // clear() трие базата — не я държим отворена
                resolve(db);
            };
            req.onerror = () => reject(req.error);
        });
    }

    function closeDB() {
        if (db) { try { db.close(); } catch (e) { /* вече затворена */ } db = null; }
    }

    function tx(store, mode, fn) {
        return openDB().then(d => new Promise((resolve, reject) => {
            const tr = d.transaction(store, mode);
            const result = fn(tr.objectStore(store));
            tr.oncomplete = () => resolve(result && 'result' in result ? result.result : result);
            tr.onerror = tr.onabort = () => reject(tr.error);
        }));
    }

    // Само поглед — без да се създава празна база при първото отваряне на Настройки.
    async function readMeta() {
        try {
            if (indexedDB.databases) {
                const list = await indexedDB.databases();
                if (!list.some(x => x.name === S().indexDbName)) return null;
            }
            return (await tx('meta', 'readonly', st => st.get('state'))) || null;
        } catch (e) { return null; }
    }

    // ---------- бележките ----------
    function noteKey(n) { return String(n.gdid || n.id || ''); }

    function fingerprint(text) {
        let h = 0x811c9dc5;
        for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return (h >>> 0).toString(16) + ':' + text.length;
    }

    // Бележките без кошчето; празните не носят смисъл.
    function collectNotes() {
        const list = (typeof allNotesData !== 'undefined' && Array.isArray(allNotesData)) ? allNotesData : [];
        const out = [];
        const seen = new Set();
        for (const n of list) {
            if (!n || Number(n.status) === 1) continue;
            const id = noteKey(n);
            if (!id || seen.has(id)) continue;
            const title = n.title ? String(n.title) : '';
            const body = String(n.notetxt !== undefined ? n.notetxt : (n.text || ''));
            const raw = ((title && !body.startsWith(title) ? title + '\n' : '') + body).slice(0, MAX_CHARS);
            const prepared = S().prepareText(raw);
            if (!prepared) continue;
            seen.add(id);
            // ИД + отпечатък на съдържанието (заглавие + тяло): бележка, променена на друго устройство, идва със
            // същия ИД и нов отпечатък → преиндексира се.
            out.push({ id, raw, fp: fingerprint(prepared) });
        }
        return out;
    }

    // Разликата между бележките в паметта и индекса — само IndexedDB, без двигателя: нови/променени и изчезнали.
    // Изчезнала = вече я няма в локалния списък (изтрита или в кошчето, тук или на друго устройство).
    async function diffIndex() {
        const notes = collectNotes();
        const existing = await tx('vectors', 'readonly', st => st.getAll());
        const known = new Map((existing || []).map(r => [r.id, r.fp]));
        const ids = new Set(notes.map(n => n.id));
        const listEmpty = !(typeof allNotesData !== 'undefined' && Array.isArray(allNotesData) && allNotesData.length);
        // Празен списък = бележките още не са заредени — не трием целия индекс заради това.
        const stale = listEmpty ? [] : [...known.keys()].filter(id => !ids.has(id));
        const todo = notes.filter(n => known.get(n.id) !== n.fp).sort((a, b) => a.raw.length - b.raw.length);
        return { notes, stale, todo };
    }

    // Една сверка наведнъж: смята само бележките с нов отпечатък, маха изчезналите. Късото първо.
    function syncIndex(onProgress) {
        if (syncPromise) { syncAgain = true; return syncPromise; }
        const myGen = gen;
        syncPromise = (async () => {
            let count = 0;
            do {
                syncAgain = false;
                const { notes, stale, todo } = await diffIndex();
                if (stale.length) await tx('vectors', 'readwrite', st => stale.forEach(id => st.delete(id)));
                let done = notes.length - todo.length;
                if (onProgress) onProgress(done, notes.length);
                for (let i = 0; i < todo.length; i += BATCH) {
                    if (myGen !== gen) throw new Error('cancelled');
                    const part = todo.slice(i, i + BATCH);
                    const vectors = await S().embedBatch(part.map(n => n.raw), 'passage');
                    if (myGen !== gen) throw new Error('cancelled');
                    await tx('vectors', 'readwrite', st => part.forEach((n, k) => st.put({ id: n.id, fp: n.fp, v: vectors[k] })));
                    done += part.length;
                    if (onProgress) onProgress(done, notes.length);
                    if (i + BATCH < todo.length) await new Promise(r => setTimeout(r, BATCH_PAUSE_MS));
                }
                count = notes.length;
                await tx('meta', 'readwrite', st => st.put({ key: 'state', complete: true, count, modelId: S().modelId, updated: Date.now() }));
            } while (syncAgain && myGen === gen);
            localStorage.setItem(READY_KEY, '1');
            return count;
        })().finally(() => { syncPromise = null; });
        return syncPromise;
    }

    // ---------- грешки с думи ----------
    function classifyError(err) {
        const msg = String((err && (err.name + ' ' + err.message)) || err || '');
        if (navigator.onLine === false || /Failed to fetch|NetworkError|Load failed|network|ERR_INTERNET|offline/i.test(msg)) return 'semanticErrNoConnection';
        if (/quota|space|storage/i.test(msg)) return 'semanticErrNoSpace';
        if (/HTTP\s*\d{3}|status\s*\d{3}|\b(40[0-9]|5\d\d)\b/i.test(msg)) return 'semanticErrServer';
        return 'semanticErrDevice';
    }

    // ---------- действията ----------
    function startDownload() {
        if (ui.phase === 'downloading' || ui.phase === 'indexing') return;
        if (navigator.onLine === false) { setUi({ phase: 'error', errorKey: 'semanticErrNoConnectionStart' }); return; }
        const myGen = ++gen;
        const files = new Map(); // само файловете на модела (.onnx) — те са „118 MB“ от бутона; токенизаторът е дребен
        setUi({ phase: 'downloading', loaded: 0, total: MODEL_MB * MB, pct: 0 });
        const onProgress = (d) => {
            if (myGen !== gen || !d || !d.file || !/\.onnx(\?|$)/.test(d.file)) return;
            if (typeof d.loaded !== 'number' && d.status !== 'done') return;
            const f = files.get(d.file) || { loaded: 0, total: 0 };
            if (typeof d.total === 'number' && d.total > 0) f.total = d.total;
            if (typeof d.loaded === 'number') f.loaded = d.loaded;
            if (d.status === 'done' && f.total) f.loaded = f.total;
            files.set(d.file, f);
            let loaded = 0, total = 0;
            files.forEach(x => { loaded += x.loaded; total += x.total; });
            total = Math.max(total || MODEL_MB * MB, loaded);
            const pct = Math.max(ui.pct || 0, Math.min(99, Math.floor(loaded / total * 100)));
            setUi({ phase: 'downloading', loaded: Math.max(loaded, ui.loaded || 0), total, pct });
        };
        S().init({ onProgress }).then(() => {
            if (myGen !== gen) return;
            return runIndex(myGen);
        }, async (err) => {
            if (myGen !== gen) return; // отказано
            const errorKey = classifyError(err);
            const errorMb = Math.round((ui.loaded || 0) / MB);
            console.warn('[SemanticIndex] download failed:', err && err.message);
            gen++;
            closeDB();
            await S().clear(); // да не остане половин модел, който изглежда готов
            localStorage.removeItem(READY_KEY);
            setUi({ phase: 'error', errorKey, errorMb });
        });
    }

    async function runIndex(myGen) {
        setUi({ phase: 'indexing', done: 0, total: 0 });
        try {
            if (S().status !== 'ready') await S().init();
            if (myGen !== gen) return;
            await syncIndex((done, total) => { if (myGen === gen) setUi({ phase: 'indexing', done, total }); });
            if (myGen !== gen) return;
            await showReady();
        } catch (err) {
            if (myGen !== gen) return;
            console.warn('[SemanticIndex] indexing failed:', err && err.message);
            setUi({ phase: 'error', errorKey: 'semanticErrIndex', done: ui.done || 0, total: ui.total || 0, keepModel: true });
        }
    }

    async function cancel() {
        gen++;
        closeDB();
        await S().clear(); // при отказ кешът се чисти изцяло
        localStorage.removeItem(READY_KEY);
        setUi({ phase: 'idle' });
    }

    async function deleteModel() {
        gen++;
        clearTimeout(syncTimer);
        closeDB();
        await S().clear(); // кешът на модела + базата cx-notes-semantic-index; двигателят → „не е зареден“
        localStorage.removeItem(READY_KEY);
        setUi({ phase: 'idle' });
    }

    function retry() {
        if (ui.keepModel) { runIndex(++gen); return; }
        setUi({ phase: 'idle' });
        startDownload();
    }

    async function showReady() {
        const meta = await readMeta();
        setUi({ phase: 'ready', count: meta ? meta.count : 0 });
    }

    // При отваряне на акордеона: само локален поглед (Cache API + IndexedDB), без мрежа.
    async function refreshState() {
        if (ui.phase === 'downloading' || ui.phase === 'indexing' || ui.phase === 'error') { render(); return; }
        const myGen = gen;
        setUi({ phase: 'checking' });
        const cached = await S().isCached();
        const meta = cached ? await readMeta() : null;
        if (myGen !== gen) return;
        if (cached && meta && meta.complete) {
            // Промени отвсякъде (запис тук без зареден двигател, синхрон от Drive) се догонват тук — само разликата.
            const diff = await diffIndex().catch(() => null);
            if (myGen !== gen) return;
            if (diff && (diff.todo.length || diff.stale.length)) { runIndex(++gen); return; }
            setUi({ phase: 'ready', count: meta.count });
            return;
        }
        if (cached) { runIndex(++gen); return; } // индексът не е довършен (затворено по средата) — продължава
        localStorage.removeItem(READY_KEY);
        setUi({ phase: 'idle' });
    }

    // След запис / триене / възстановяване и след като синхронът с Drive / локалната папка приложи входящите промени:
    // тихо догонване на разликата — само ако индексът вече е направен И двигателят е зареден в тази сесия.
    // Незареден двигател не се зарежда оттук: догонването става при следващо отваряне на блока в Настройки.
    // Сверката само чете бележките и пише в собствената си база — не записва бележки, затова няма цикъл със записа.
    function scheduleSemanticIndexSync(delay) {
        if (localStorage.getItem(READY_KEY) !== '1' || !S()) return;
        clearTimeout(syncTimer);
        syncTimer = setTimeout(quietSync, typeof delay === 'number' ? delay : SYNC_DELAY_MS);
    }

    async function quietSync() {
        syncTimer = null;
        if (ui.phase === 'downloading' || ui.phase === 'indexing') return;
        const myGen = gen;
        try {
            if (S().status !== 'ready') return; // нищо не се зарежда само
            if (myGen !== gen) return;
            const count = await syncIndex();
            if (myGen === gen && ui.phase === 'ready') setUi({ phase: 'ready', count });
        } catch (e) {
            console.warn('[SemanticIndex] quiet sync failed:', e && e.message);
        }
    }

    // ---------- изгледът ----------
    function setUi(next) { ui = next; render(); }

    function indexSizeText(count) {
        const bytes = count * VECTOR_BYTES;
        return bytes < 0.1 * MB ? fmt(bytes / 1000, 1) + ' KB' : fmt(bytes / MB, 1) + ' MB';
    }

    function render() {
        const section = document.getElementById('semantic-section');
        if (!section) return;
        section.dataset.phase = ui.phase;
        section.querySelectorAll('[data-sem]').forEach(el => { el.hidden = el.dataset.sem !== ui.phase; });
        const $ = (id) => document.getElementById(id);
        if (ui.phase === 'downloading') {
            $('semantic-dl-bar').style.width = (ui.pct || 0) + '%';
            $('semantic-dl-text').textContent = t('semanticDownloadProgress', {
                done: fmt(Math.floor((ui.loaded || 0) / MB)), total: fmt(Math.round(ui.total / MB)), pct: ui.pct || 0,
            });
        } else if (ui.phase === 'indexing') {
            $('semantic-ix-bar').style.width = (ui.total ? Math.floor(ui.done / ui.total * 100) : 0) + '%';
            $('semantic-ix-text').textContent = t('semanticIndexProgress', { done: fmt(ui.done || 0), total: fmt(ui.total || 0) });
        } else if (ui.phase === 'ready') {
            $('semantic-ready-count').textContent = fmt(ui.count || 0) + ' · ' + indexSizeText(ui.count || 0);
        } else if (ui.phase === 'error') {
            $('semantic-error-text').textContent = t(ui.errorKey, { mb: fmt(ui.errorMb || 0), done: fmt(ui.done || 0), total: fmt(ui.total || 0) });
        }
        const arrowState = document.getElementById('semantic-head-state');
        if (arrowState) {
            arrowState.textContent = ui.phase === 'downloading' ? (ui.pct || 0) + '%' : ui.phase === 'indexing' ? '…' : '';
        }
    }

    // Вика се от main.js при инициализацията на Настройки. Само слушатели — нищо не се чете и не се тегли.
    function initSemanticSection() {
        if (bound) return;
        const header = document.getElementById('semantic-search-header');
        const section = document.getElementById('semantic-section');
        const arrow = document.getElementById('semantic-arrow');
        if (!header || !section || !arrow || !S()) return;
        bound = true;
        header.addEventListener('click', () => {
            const isOpen = section.style.display === 'block';
            section.style.display = isOpen ? 'none' : 'block';
            arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
            header.setAttribute('aria-expanded', String(!isOpen));
            if (!isOpen) refreshState();
        });
        document.getElementById('semantic-download-btn').addEventListener('click', startDownload);
        document.getElementById('semantic-cancel-btn').addEventListener('click', cancel);
        document.getElementById('semantic-delete-btn').addEventListener('click', deleteModel);
        document.getElementById('semantic-retry-btn').addEventListener('click', retry);
        render();
    }

    window.initSemanticSection = initSemanticSection;
    window.scheduleSemanticIndexSync = scheduleSemanticIndexSync;
    window.SeeNotesSemanticIndex = {
        get state() { return Object.assign({}, ui); },
        readyKey: READY_KEY,
        modelMb: MODEL_MB,
        refresh: refreshState,
        sync: syncIndex,
        diff: diffIndex,
        scheduleSync: scheduleSemanticIndexSync,
        fingerprint,
        collectNotes,
    };
})();
