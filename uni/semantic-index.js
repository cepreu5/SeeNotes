// b2.23: стъпка 3 от плана „Семантично търсене“ — блокът „Търсене по смисъл“ в Настройки (акордеон под „Подреждане на
// бележките“), свалянето на модела по натискане и индексът на бележките в IndexedDB (cx-notes-semantic-index).
// Двигателят е SeeNotesSemantic от semantic.js (b2.22) — тук само се вика. При зареждане на приложението НИЩО не се
// тегли и не се отваря: initSemanticSection() само закача слушатели; кешът и базата се поглеждат при отваряне на акордеона.
// Резултатите в търсачката не се променят — сливането на двата крака е стъпка 4.
// b2.24: по-бързо индексиране без промяна във векторите — партиди по 16, текстът се реже на 3000 знака (моделът и без
// това чете само първите 512 токена) и кратка пауза между партидите, за да диша интерфейсът.
// b2.25: отметка в реда на блока (пред стрелката, без отметка по подразбиране, помни се в semanticSearchEnabled) —
// търсене по смисъл само ако индексът е готов И отметката е поставена (searchEnabled()). Търсачката още НЕ го вика:
// това е шлюзът за стъпка 4 (сливането на двата крака). Фоновото догонване на индекса не зависи от отметката.
// Редът не показва проценти: при сваляне е празен (процентът е в тялото), при индексиране „…“, при готов индекс „Готово“.
// b2.26: стъпка 4 — векторният крак на обикновеното търсене: searchVectors(заявка) → топ 20 над прага по косинус и fuse()
// (RRF, k = 60) за сливането с лексикалния крак в applyFilters(). Двигателят се вдига от кеша само при търсене с поставена
// отметка и готов индекс — и само ако моделът е в кеша (isCached(), Cache API, без мрежа). Няма ли го — пети ред в блока:
// „липсва модел“ с бутон за повторно сваляне; търсенето пада на лексикалния крак.
(function () {
    'use strict';

    const MB = 1000 * 1000;
    const MODEL_MB = 118; // onnx/model_quantized.onnx — числото на бутона
    const READY_KEY = 'semanticIndexReady'; // '1' след пълен индекс — евтина проверка при всеки запис
    const ENABLED_KEY = 'semanticSearchEnabled'; // '1' = отметката в реда е поставена; липсва = изключено
    const SYNC_DELAY_MS = 3000; // поредица записи → едно обновяване
    const BATCH = 16;
    // e5 чете само първите 512 токена ≈ до ~2400 знака български (измерено: 3,56 знака/токен средно, 4,65 най-много);
    // 3000 оставя резерв — първите 512 токена са същите като на пълния текст. Под 2500 вече може да реже четен текст.
    const MAX_CHARS = 3000;
    const BATCH_PAUSE_MS = 20; // между партидите — рисува се напредъкът, интерфейсът не замръзва
    const VECTOR_BYTES = 384 * 4;
    // Праг по косинус за векторния крак. Измерено на 12.10.2026 с истинския модел (Xenova/multilingual-e5-small, q8,
    // „query: “ / „passage: “, нормализирани вектори) върху 18 реалистични български бележки (кола и сервиз, застраховка,
    // гуми, лекар, лекарства, пазар, рецепта, почивка, билети, сметки, заплата, куче, градина, книги, работа, водопроводчик,
    // фитнес, Коледа) и 30 заявки: 21 със зададени близки бележки и 9, които нямат съответствие никъде.
    // e5 събира всичко нагоре: и далечните двойки са 0,71–0,84 (медиана 0,79), близките 0,76–0,90 (медиана 0,82), а
    // заявките без съответствие стигат до 0,84 — ориентирът от плана 0,70–0,75 би пропуснал почти всичко.
    // При 0,83 остават 14 от 33 близки двойки, 4 от 345 далечни и 1 от 144 при заявките без съответствие
    // („ремонт на покрива“ → сервизът на колата, 0,837); при 0,82 са 17/33, 18/345 и 1/144; при 0,84 — 8/33, 0 и 0.
    // Избрано 0,83: бележка с „≈“ без думата от заявката трябва да е наистина близка, а лексикалният крак носи останалото.
    // Пробата е .bolter-task-artifacts/b226-threshold-probe.mjs.
    const SEARCH_MIN_COSINE = 0.83;
    // Долна граница на дължината на индексирания текст (заглавие + тяло, от който е изчислен векторът) за векторния крак.
    // Измерено на 12.10.2026 с истинския модел (Xenova/multilingual-e5-small, q8, „query: “ / „passage: “, нормализирани
    // вектори): бележки от 4–6 знака дават косинус 0,80–0,89 срещу всяка заявка от една дума („Кольо“ 0,874 и „Мляко“ 0,817
    // за „кола“), а несвързани бележки от 9+ знака стоят ≤ 0,82 — при късия текст косинусът е шум и прагът не го дели
    // (дефект: „кола“ показваше бележка само със „Светла“). Под границата бележка не се показва САМО по смисъл;
    // лексикалният крак продължава да я намира, ако съдържа думата от заявката. Дължината е в отпечатъка (fp „хеш:дължина“).
    const MIN_NOTE_CHARS = 12;
    const SEARCH_TOP = 20;
    const RRF_K = 60;

    let ui = { phase: 'idle' }; // idle | checking | downloading | indexing | ready | error | missing (b2.26)
    let gen = 0; // всяко отказване / изтриване го вдига — старите обещания се игнорират
    let db = null;
    let syncPromise = null;
    let syncAgain = false;
    let syncTimer = null;
    let bound = false;
    let vectorRows = null; // векторите от базата в паметта за търсене; всеки запис в базата ги нулира

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
        vectorRows = null;
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
                if (stale.length) { vectorRows = null; await tx('vectors', 'readwrite', st => stale.forEach(id => st.delete(id))); }
                let done = notes.length - todo.length;
                if (onProgress) onProgress(done, notes.length);
                for (let i = 0; i < todo.length; i += BATCH) {
                    if (myGen !== gen) throw new Error('cancelled');
                    const part = todo.slice(i, i + BATCH);
                    const vectors = await S().embedBatch(part.map(n => n.raw), 'passage');
                    if (myGen !== gen) throw new Error('cancelled');
                    vectorRows = null;
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
        const meta = await readMeta();
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
        if (modelMissing(meta)) { setUi({ phase: 'missing' }); return; }
        localStorage.removeItem(READY_KEY);
        setUi({ phase: 'idle' });
    }

    // b2.26: отметката е поставена, индексът е правен, но моделът вече не е в кеша (системата го е изчистила — Safari на iOS).
    // Индексът и semanticIndexReady остават: след повторно сваляне сверката смята само разликата.
    function modelMissing(meta) {
        return storageGet(ENABLED_KEY) === '1' && (storageGet(READY_KEY) === '1' || !!(meta && meta.complete));
    }

    // ---------- търсенето (b2.26) ----------
    // Векторите от базата се четат веднъж и стоят в паметта до следващия запис в базата.
    async function loadVectors() {
        if (vectorRows) return vectorRows;
        const myGen = gen;
        const rows = await tx('vectors', 'readonly', st => st.getAll());
        const out = (rows || []).filter(r => r && r.id && r.v && r.v.length).map(r => ({ id: r.id, v: r.v, len: rowLen(r.fp) }));
        if (myGen === gen) vectorRows = out;
        return out;
    }

    // Дължината на индексирания текст от отпечатъка „хеш:дължина“; null, ако я няма.
    function rowLen(fp) {
        if (typeof fp !== 'string') return null;
        const tail = fp.slice(fp.lastIndexOf(':') + 1);
        if (fp.indexOf(':') < 0 || tail === '') return null;
        const n = Number(tail);
        return Number.isFinite(n) ? n : null;
    }

    // Чисто смятане (тества се отделно): косинус срещу всеки вектор, само над прага, най-близките първи, най-много top.
    // Ред с известна дължина под minChars се прескача (b2.27); ред без дължина (стар/непознат) не се гейтва.
    function rankVectors(queryVector, rows, minCosine, top, minChars) {
        const min = typeof minCosine === 'number' ? minCosine : SEARCH_MIN_COSINE;
        const limit = typeof top === 'number' ? top : SEARCH_TOP;
        const floor = typeof minChars === 'number' ? minChars : MIN_NOTE_CHARS;
        const hits = [];
        for (const r of rows || []) {
            if (typeof r.len === 'number' && r.len < floor) continue;
            let sum = 0;
            const v = r.v;
            for (let i = 0; i < v.length; i++) sum += queryVector[i] * v[i];
            if (sum >= min) hits.push({ id: r.id, score: sum });
        }
        hits.sort((a, b) => b.score - a.score);
        return hits.slice(0, limit);
    }

    // RRF: оценка = Σ 1/(k + ранг) по двата крака; ранговете са от 1. Без нагласа между брой срещания и косинус.
    // lexicalIds и vectorIds са подредени списъци с ИД; връща [{id, score, lexRank, vecRank}] по низходяща оценка,
    // при равенство — по реда на лексикалния крак, после на векторния.
    function fuse(lexicalIds, vectorIds, k) {
        const kk = typeof k === 'number' ? k : RRF_K;
        const map = new Map();
        const add = (ids, field) => (ids || []).forEach((id, i) => {
            const key = String(id);
            const row = map.get(key) || { id: key, score: 0, lexRank: 0, vecRank: 0, first: map.size };
            if (row[field]) return; // повторен ИД в същия списък — важи първият ранг
            row[field] = i + 1;
            row.score += 1 / (kk + i + 1);
            map.set(key, row);
        });
        add(lexicalIds, 'lexRank');
        add(vectorIds, 'vecRank');
        return [...map.values()]
            .sort((a, b) => (b.score - a.score) || (a.first - b.first))
            .map(({ id, score, lexRank, vecRank }) => ({ id, score, lexRank, vecRank }));
    }

    // Векторният крак за една заявка. Никога не хвърля: { ok: true, hits } или { ok: false, reason } — тогава търсенето
    // остава лексикално. Мрежа не се пипа: двигателят се вдига само ако моделът е в кеша; иначе блокът казва „липсва модел“.
    async function searchVectors(query) {
        const q = String(query || '').trim();
        if (!q) return { ok: false, reason: 'empty' };
        if (!searchEnabled() || !S()) return { ok: false, reason: 'off' };
        if (ui.phase === 'downloading' || ui.phase === 'indexing') return { ok: false, reason: 'busy' };
        const myGen = gen;
        try {
            if (S().status !== 'ready') {
                if (!(await S().isCached())) {
                    if (myGen === gen && (ui.phase === 'idle' || ui.phase === 'ready' || ui.phase === 'checking')) setUi({ phase: 'missing' });
                    return { ok: false, reason: 'missing-model' };
                }
                await S().init(); // от кеша — моделът и библиотеката са там
                if (myGen !== gen) return { ok: false, reason: 'cancelled' };
                scheduleSemanticIndexSync(); // двигателят вече е зареден — догонва се разликата, ако има такава
            }
            const rows = await loadVectors();
            if (!rows.length) return { ok: false, reason: 'no-index' };
            const qv = await S().embedQuery(q);
            if (myGen !== gen) return { ok: false, reason: 'cancelled' };
            return { ok: true, hits: rankVectors(qv, rows) };
        } catch (e) {
            console.warn('[SemanticIndex] search failed:', e && e.message);
            return { ok: false, reason: 'error' };
        }
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
        } else if (ui.phase === 'missing') {
            // нищо за попълване — текстът е в речника
        } else if (ui.phase === 'error') {
            $('semantic-error-text').textContent = t(ui.errorKey, { mb: fmt(ui.errorMb || 0), done: fmt(ui.done || 0), total: fmt(ui.total || 0) });
        }
        const arrowState = document.getElementById('semantic-head-state');
        if (arrowState) {
            arrowState.textContent = ui.phase === 'indexing' ? '…' : ui.phase === 'ready' ? t('semanticReadyWord')
                : ui.phase === 'missing' ? t('semanticMissingWord') : '';
        }
    }

    // ---------- отметката „използвай търсене по смисъл“ ----------
    function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }

    // Шлюзът за стъпка 4: true само при поставена отметка И готов индекс — иначе търсачката остава старата.
    function searchEnabled() { return storageGet(ENABLED_KEY) === '1' && storageGet(READY_KEY) === '1'; }

    function setSearchEnabled(on) {
        try { if (on) localStorage.setItem(ENABLED_KEY, '1'); else localStorage.removeItem(ENABLED_KEY); } catch (e) { }
        const box = document.getElementById('semantic-enabled');
        if (box) box.checked = !!on;
    }

    // Вика се от main.js при инициализацията на Настройки. Само слушатели — нищо не се чете и не се тегли.
    function initSemanticSection() {
        if (bound) return;
        const header = document.getElementById('semantic-search-header');
        const section = document.getElementById('semantic-section');
        const arrow = document.getElementById('semantic-arrow');
        if (!header || !section || !arrow || !S()) return;
        bound = true;
        const enabled = document.getElementById('semantic-enabled');
        if (enabled) {
            enabled.checked = storageGet(ENABLED_KEY) === '1';
            // кликът по отметката не отваря/затваря акордеона
            enabled.addEventListener('click', (e) => e.stopPropagation());
            enabled.addEventListener('change', () => setSearchEnabled(enabled.checked));
        }
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
        const redownload = document.getElementById('semantic-redownload-btn');
        if (redownload) redownload.addEventListener('click', startDownload);
        render();
    }

    window.initSemanticSection = initSemanticSection;
    window.scheduleSemanticIndexSync = scheduleSemanticIndexSync;
    window.SeeNotesSemanticIndex = {
        get state() { return Object.assign({}, ui); },
        readyKey: READY_KEY,
        enabledKey: ENABLED_KEY,
        searchEnabled,
        setSearchEnabled,
        modelMb: MODEL_MB,
        refresh: refreshState,
        sync: syncIndex,
        diff: diffIndex,
        scheduleSync: scheduleSemanticIndexSync,
        fingerprint,
        collectNotes,
        searchVectors,
        rankVectors,
        fuse,
        minCosine: SEARCH_MIN_COSINE,
        minNoteChars: MIN_NOTE_CHARS,
        searchTop: SEARCH_TOP,
        rrfK: RRF_K,
    };
})();
