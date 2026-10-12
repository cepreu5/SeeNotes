// b2.22: векторният крак на търсенето (стъпка 2 от плана „Семантично търсене“) — само двигателят, без интерфейс.
// multilingual-e5-small (ONNX int8, 384 измерения) през transformers.js в Web Worker (semantic-worker.js); WebGPU, ако го има, иначе WASM.
// При зареждане на приложението НИЩО не се тегли и не се стартира: работникът, библиотеката и моделът тръгват само при
// изрично SeeNotesSemantic.init() (бутонът в Настройки е стъпка 3). Без API и без ключ — бележките не напускат устройството.
// Собствен кеш (SEMANTIC_CACHE_NAME), отделен от CACHE_NAME на sw.js; sw.js го пази при activate и не прихваща заявките към CDN/HF.
(function () {
    'use strict';

    const SEMANTIC_CACHE_NAME = 'cx-notes-semantic-v1';
    const SEMANTIC_INDEX_DB = 'cx-notes-semantic-index'; // за индекса от стъпка 4; clear() го трие заедно с модела
    const MODEL_ID = 'Xenova/multilingual-e5-small';
    const MODEL_DTYPE = 'q8'; // onnx/model_quantized.onnx ≈ 118 MB
    const LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.1/dist/transformers.min.js';
    const DIMENSIONS = 384;
    const PREFIX = { query: 'query: ', passage: 'passage: ' };

    let status = 'idle'; // idle (не е зареден) | downloading | ready | error
    let lastError = null;
    let device = null;
    let worker = null;
    let initPromise = null;
    let nextId = 1;
    const pending = new Map();
    const listeners = { status: new Set(), progress: new Set() };

    function emit(kind, payload) {
        listeners[kind].forEach(fn => { try { fn(payload); } catch (e) { console.error('[Semantic] listener', e); } });
    }

    function setStatus(next, err) {
        status = next;
        lastError = err || null;
        emit('status', { status, error: lastError, device });
    }

    // Markdown шумът и маркерите ❖/⚠ не носят смисъл за модела. След това — хомоглифите и ѝ → и от лексикалния крак
    // (replaceSearchHomoglyphs / SEARCH_WORD_RE в main.js). Регистърът, членуването и й остават — моделът ги разбира.
    function prepareText(text) {
        if (text == null) return '';
        let s = String(text)
            .replace(/```[^\n]*\n?/g, ' ')                     // огради на код
            .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')            // картинки → alt
            .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')         // връзки → текст
            .replace(/https?:\/\/\S+/g, ' ')                     // голи адреси
            .replace(/<\/?[a-z][^>]*>/gi, ' ')                   // HTML тагове
            .replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, ' ') // разделителен ред на таблица
            .replace(/^\s{0,3}#{1,6}\s+/gm, '')                  // заглавия
            .replace(/^\s*>\s?/gm, '')                           // цитати
            .replace(/^\s*(?:[-*+•]|\d+[.)])\s+/gm, '')          // точки и номера на списъци
            .replace(/\[(?: |x|X)\]\s*/g, '')                    // отметки [ ] / [x]
            .replace(/\*{1,3}|~~|_{2,}|`/g, '')                  // удебеляване, курсив, зачеркване, код
            .replace(/[❖⚠]️?/g, ' ')
            .replace(/\|/g, ' ')                                 // клетки на таблица и разделителят заглавие|текст
            .replace(/\s+/g, ' ')
            .trim();
        if (typeof replaceSearchHomoglyphs === 'function' && typeof SEARCH_WORD_RE !== 'undefined') {
            s = s.replace(SEARCH_WORD_RE, replaceSearchHomoglyphs);
        }
        return s.replace(/ѝ/g, 'и');
    }

    // Точният низ, който отива в модела: e5 иска „query: “ за заявка и „passage: “ за документ.
    function withPrefix(text, kind) {
        const prefix = PREFIX[kind];
        if (!prefix) throw new Error('unknown kind: ' + kind);
        return prefix + prepareText(text);
    }

    function rejectAll(message) {
        pending.forEach(p => p.reject(new Error(message)));
        pending.clear();
    }

    function ensureWorker() {
        if (worker) return worker;
        worker = new Worker(new URL('semantic-worker.js', document.baseURI || location.href), { type: 'module' });
        worker.onmessage = (event) => {
            const msg = event.data || {};
            if (msg.type === 'progress') { emit('progress', msg.data); return; }
            const p = pending.get(msg.id);
            if (!p) return;
            pending.delete(msg.id);
            if (msg.ok) p.resolve(msg.result); else p.reject(new Error(msg.error));
        };
        worker.onerror = (event) => {
            const message = (event && event.message) || 'worker error';
            rejectAll(message);
            setStatus('error', message);
        };
        return worker;
    }

    function call(type, payload) {
        const w = ensureWorker();
        const id = nextId++;
        return new Promise((resolve, reject) => {
            pending.set(id, { resolve, reject });
            w.postMessage(Object.assign({ id, type }, payload));
        });
    }

    // Единственото място, което пуска мрежата. options: { onProgress(data), device: 'wasm' за принудително WASM }.
    function init(options) {
        const opts = options || {};
        let unsubscribe = null;
        if (typeof opts.onProgress === 'function') unsubscribe = on('progress', opts.onProgress);
        if (!initPromise) {
            setStatus('downloading');
            initPromise = call('init', {
                options: { libraryUrl: LIBRARY_URL, modelId: MODEL_ID, dtype: MODEL_DTYPE, cacheName: SEMANTIC_CACHE_NAME, device: opts.device || 'auto' }
            }).then((res) => {
                device = (res && res.device) || null;
                setStatus('ready');
                return { status, device, dimensions: DIMENSIONS };
            }, (err) => {
                initPromise = null;
                setStatus('error', err.message);
                throw err;
            });
        }
        return initPromise.finally(() => { if (unsubscribe) unsubscribe(); });
    }

    async function embedPrepared(strings) {
        if (status !== 'ready') throw new Error('Semantic engine not ready (status: ' + status + ') — call SeeNotesSemantic.init() first');
        const res = await call('embed', { texts: strings });
        if (res.dims !== DIMENSIONS) throw new Error('unexpected dimensions: ' + res.dims);
        return res.vectors;
    }

    // embed / embedBatch: по подразбиране като документ („passage: “) — за индексиране на бележки; за заявка — embedQuery.
    async function embed(text, kind) { return (await embedPrepared([withPrefix(text, kind || 'passage')]))[0]; }
    async function embedQuery(text) { return embed(text, 'query'); }
    async function embedPassage(text) { return embed(text, 'passage'); }
    async function embedBatch(texts, kind) {
        const list = Array.from(texts || []);
        if (!list.length) return [];
        return embedPrepared(list.map(t => withPrefix(t, kind || 'passage')));
    }

    // Векторите са нормализирани — косинусът е скаларното произведение.
    function cosine(a, b) {
        let sum = 0;
        for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
        return sum;
    }

    // Само локална проверка (Cache API) — без мрежа: свален ли е вече моделът.
    async function isCached() {
        try {
            if (!('caches' in self) || !(await caches.has(SEMANTIC_CACHE_NAME))) return false;
            const cache = await caches.open(SEMANTIC_CACHE_NAME);
            const keys = await cache.keys();
            return keys.some(r => r.url.includes('multilingual-e5-small') && r.url.endsWith('.onnx'));
        } catch (e) { return false; }
    }

    function deleteIndexDB() {
        return new Promise((resolve) => {
            try {
                const req = indexedDB.deleteDatabase(SEMANTIC_INDEX_DB);
                req.onsuccess = req.onerror = req.onblocked = () => resolve();
            } catch (e) { resolve(); }
        });
    }

    // Маха модела, библиотеката и индекса и връща двигателя в „не е зареден“.
    async function clear() {
        if (worker) { worker.terminate(); worker = null; }
        rejectAll('Semantic engine reset');
        initPromise = null;
        device = null;
        try { if ('caches' in self) await caches.delete(SEMANTIC_CACHE_NAME); } catch (e) { /* няма кеш */ }
        await deleteIndexDB();
        setStatus('idle');
    }

    function on(kind, fn) {
        if (!listeners[kind]) throw new Error('unknown event: ' + kind);
        listeners[kind].add(fn);
        return () => listeners[kind].delete(fn);
    }

    window.SeeNotesSemantic = Object.freeze({
        dimensions: DIMENSIONS,
        modelId: MODEL_ID,
        cacheName: SEMANTIC_CACHE_NAME,
        indexDbName: SEMANTIC_INDEX_DB,
        libraryUrl: LIBRARY_URL,
        get status() { return status; },
        get lastError() { return lastError; },
        get device() { return device; },
        init,
        load: init,
        on,
        prepareText,
        withPrefix,
        embed,
        embedQuery,
        embedPassage,
        embedBatch,
        cosine,
        isCached,
        clear,
        reset: clear,
    });
})();
