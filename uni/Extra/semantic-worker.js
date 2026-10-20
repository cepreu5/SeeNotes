// b2.22: векторният крак на търсенето (стъпка 2) — Web Worker (type: 'module') около transformers.js.
// Нищо не се тегли, докато главната нишка не изпрати изрично 'init' (SeeNotesSemantic.init в semantic.js).
// Библиотеката, WASM файловете на ONNX Runtime и моделът стоят в собствен кеш (SEMANTIC_CACHE_NAME), отделен
// от CACHE_NAME на sw.js — вдигането на версията на приложението не трие модела.
// Текстовете идват вече подготвени и с префикс („query: “ / „passage: “) — тук само се смятат векторите.

let extractor = null;
let initPromise = null;

function post(msg) { self.postMessage(msg); }

// Библиотеката: първо от собствения кеш, иначе от мрежата (и се записва в кеша); вдига се през blob URL.
async function importLibrary(url, cacheName) {
    let response = null;
    let cache = null;
    try {
        cache = await caches.open(cacheName);
        response = await cache.match(url);
    } catch (e) { cache = null; }
    if (!response) {
        post({ type: 'progress', data: { status: 'download', file: url, name: 'transformers.js' } });
        response = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!response.ok) throw new Error(`library HTTP ${response.status}`);
        if (cache) {
            try { await cache.put(url, response.clone()); } catch (e) { /* без кеш — работи и така */ }
        }
    }
    const code = await response.text();
    const blobUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    try {
        return await import(blobUrl);
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
}

async function hasWebGPU() {
    try {
        if (!self.navigator || !navigator.gpu) return false;
        const adapter = await navigator.gpu.requestAdapter();
        return !!adapter;
    } catch (e) { return false; }
}

async function doInit(opts) {
    const lib = await importLibrary(opts.libraryUrl, opts.cacheName);
    const env = lib.env;
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    env.useBrowserCache = true;
    env.cacheKey = opts.cacheName; // модел + WASM в нашия кеш, не в 'transformers-cache'

    const progress_callback = (data) => post({ type: 'progress', data });
    const wantGPU = opts.device !== 'wasm' && await hasWebGPU();
    const tries = wantGPU ? ['webgpu', 'wasm'] : ['wasm'];
    let lastError = null;
    for (const dev of tries) {
        try {
            extractor = await lib.pipeline('feature-extraction', opts.modelId, { device: dev, dtype: opts.dtype, progress_callback });
            return { device: dev };
        } catch (e) {
            lastError = e;
            extractor = null;
        }
    }
    throw lastError || new Error('pipeline failed');
}

async function embed(texts) {
    if (!extractor) throw new Error('not-ready');
    const out = await extractor(texts, { pooling: 'mean', normalize: true });
    const dims = out.dims[out.dims.length - 1];
    const data = out.data instanceof Float32Array ? out.data : Float32Array.from(out.data);
    const vectors = [];
    for (let i = 0; i < texts.length; i++) vectors.push(data.slice(i * dims, (i + 1) * dims));
    return { dims, vectors };
}

self.onmessage = async (event) => {
    const msg = event.data || {};
    const { id, type } = msg;
    try {
        let result;
        if (type === 'init') {
            if (!initPromise) initPromise = doInit(msg.options || {});
            try {
                result = await initPromise;
            } catch (e) {
                initPromise = null; // повторен опит след грешка
                throw e;
            }
        } else if (type === 'embed') {
            result = await embed(msg.texts || []);
            self.postMessage({ id, ok: true, result }, result.vectors.map(v => v.buffer));
            return;
        } else {
            throw new Error('unknown message: ' + type);
        }
        post({ id, ok: true, result });
    } catch (e) {
        post({ id, ok: false, error: (e && e.message) || String(e) });
    }
};
