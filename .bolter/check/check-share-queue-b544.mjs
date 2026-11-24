// b5.44: две споделяния, докато приложението е затворено, не се губят.
// Преди: второто споделяне триеше файла и записа на първото, затова снимката изчезваше
// и оставаше само бележка с линка. Сега всяко споделяне пази своето и приложението ги
// взима заедно, по реда на пристигане.
// Пуска се с истински Chromium: две истински POST заявки към service worker-а, после
// отваряне на приложението и проверка на бележката и на кеша.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const PLAYWRIGHT = [
    '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs',
    'playwright'
].find(p => p === 'playwright' || existsSync(p));
const { chromium } = await import(PLAYWRIGHT);
const CHROME = [
    '/opt/ms-playwright/chromium-1248/chrome-linux64/chrome',
    '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome'
].find(p => existsSync(p));

const root = path.resolve(process.env.ROOT || 'repo/nomn');
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/__share.html' || p === '/__seed.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end('<!doctype html><meta charset="utf-8"><title>share harness</title>');
        return;
    }
    const rel = p === '/' ? 'index.html' : p.replace(/^\//, '');
    try {
        const b = await readFile(path.join(root, rel));
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(b);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const ORIGIN = `http://localhost:${srv.address().port}`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const LINK = 'https://youtube.com/shorts/1_9GcVLQBtE';
const PHOTO_TEXT = 'Изпратено от Viber https://www.viber.com/invite/e86334ba';

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ' | ' + extra : '')); };

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const logs = [];
const hook = p => { p.on('console', m => logs.push(m.text().slice(0, 220))); p.on('pageerror', e => logs.push('PAGEERROR ' + String(e.message).slice(0, 220))); };

const initScript = () => {
    const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
    window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
    window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
    window.kofiWidgetOverlay = { draw() { } };
    window.kofiwidget2 = { init() { }, draw() { } };
    localStorage.setItem('language', 'bg');
    localStorage.setItem('hideAssistant', 'true');
};
const seedDemoDb = async (page) => {
    await page.goto(`${ORIGIN}/__seed.html`, { waitUntil: 'load' });
    await page.evaluate(async () => {
        const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null, files: { keyPath: 'key' } };
        await new Promise((res) => { const d = indexedDB.deleteDatabase('NotesDB-demo'); d.onsuccess = d.onerror = d.onblocked = () => res(); setTimeout(res, 3000); });
        const db = await new Promise((res, rej) => {
            const req = indexedDB.open('NotesDB-demo', 4);
            req.onupgradeneeded = () => { const d = req.result; for (const [n, opt] of Object.entries(STORES)) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, opt || undefined); };
            req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
        });
        db.close();
    });
};

// --- 1. Приложението се отваря веднъж, за да регистрира service worker-а ---
const app = await ctx.newPage(); hook(app);
await app.addInitScript(initScript);
await seedDemoDb(app);
await app.goto(`${ORIGIN}/index.html?demo=1`, { waitUntil: 'load' });
await app.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 30000 }).catch(() => console.log('няма app-ready'));
await app.evaluate(() => navigator.serviceWorker.ready).catch(() => { });
await app.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(async () => {
    await app.reload({ waitUntil: 'load' });
    await app.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => { });
});
await app.waitForTimeout(1200);
check('service worker-ът контролира приложението', await app.evaluate(() => !!navigator.serviceWorker.controller));
const cacheVersion = await app.evaluate(async () => {
    try { return await (await caches.keys()).join(','); } catch (e) { return ''; }
});
const swText = await readFile(path.join(root, 'sw.js'), 'utf8');
const wantCache = (swText.match(/CACHE_NAME\s*=\s*'([^']+)'/) || [])[1] || '';
check('кешът в браузъра е този от nomn/sw.js', !!wantCache && cacheVersion.split(',').includes(wantCache), cacheVersion + ' // ' + wantCache);

// Приложението се затваря: собственикът е в Viber, прозорецът на приложението го няма.
await app.close();

// --- 2. Две споделяния, докато приложението е затворено ---
const sharer = await ctx.newPage(); hook(sharer);
await sharer.goto(`${ORIGIN}/__share.html`, { waitUntil: 'load' });
const shoot = async (payload) => sharer.evaluate(async ({ pngB64, text, link }) => {
    const fd = new FormData();
    if (pngB64) {
        const bytes = Uint8Array.from(atob(pngB64), c => c.charCodeAt(0));
        fd.append('shared_image', new File([bytes], '20261124_150135.jpg', { type: 'image/jpeg' }));
    }
    fd.append('shared_title', '');
    fd.append('shared_text', text || '');
    fd.append('shared_url', link || '');
    try {
        const res = await fetch('index.html', { method: 'POST', body: fd, redirect: 'follow' });
        return res.status;
    } catch (e) {
        return 'ERR ' + e.message;
    }
}, payload);

// Първо снимка от Viber (файл + текст на Viber), после линк от YouTube — както при собственика.
const statusA = await shoot({ pngB64: PNG.toString('base64'), text: PHOTO_TEXT });
await sharer.waitForTimeout(800);
const statusB = await shoot({ text: 'Евала комшУ.. #смяхдоскъсване', link: LINK, pngB64: null });
await sharer.waitForTimeout(500);
console.log('DIAG статуси на POST:', statusA, statusB);

// --- 3. Кешът пази И ДВЕТЕ споделяния ---
const cacheState = await sharer.evaluate(async () => {
    const cache = await caches.open('share-target-image');
    const keys = (await cache.keys()).map(k => new URL(k.url).pathname.split('/').pop());
    const payloads = [];
    for (const name of keys) {
        if (!name.startsWith('share-payload-')) continue;
        const res = await cache.match(name);
        payloads.push(res ? await res.json() : null);
    }
    return { keys, payloads };
});
const payloadKeys = cacheState.keys.filter(k => k.startsWith('share-payload-'));
const fileKeys = cacheState.keys.filter(k => k.startsWith('shared-file-'));
check('чакат две споделяния, не едно', payloadKeys.length === 2, JSON.stringify(payloadKeys));
check('файлът на снимката не е изтрит от второто споделяне', fileKeys.length === 1, JSON.stringify(fileKeys));
check('двете споделяния носят различни sid-ове', new Set(cacheState.payloads.filter(Boolean).map(p => p.sid)).size === 2);
const photoPayload = cacheState.payloads.find(p => p && p.files && p.files.length === 1);
check('записът на снимката пази името и големината', !!photoPayload && photoPayload.files[0].name === '20261124_150135.jpg' && photoPayload.files[0].size === PNG.length, JSON.stringify(photoPayload && photoPayload.files || []));

// --- 4. Приложението се отваря и взима двете заедно ---
const app2 = await ctx.newPage(); hook(app2);
await app2.addInitScript(initScript);
await app2.goto(`${ORIGIN}/index.html?demo=1`, { waitUntil: 'load' });
await app2.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 30000 }).catch(() => console.log('няма app-ready на второто отваряне'));
await app2.waitForTimeout(3000);

const appDebug = await app2.evaluate(async () => {
    const cache = await caches.open('share-target-image');
    const res = await cache.match('share-debug');
    const entries = res ? await res.json() : [];
    return entries.map(e => ({ stage: e.stage, note: e.note, files: e.files, shares: e.shares, wanted: e.wanted }));
});
const tookEntry = appDebug.find(e => e.stage === 'app');
check('приложението е взело и двете споделяния', !!tookEntry && tookEntry.shares === 2, JSON.stringify(tookEntry || {}));
check('приложението е намерило снимката в кеша', !!tookEntry && tookEntry.files === 1 && tookEntry.wanted === 1, JSON.stringify(tookEntry || {}));

const modalText = await app2.evaluate(() => {
    const body = document.getElementById('modal-body');
    const modal = document.querySelector('.modal.visible, #note-modal.visible, .nw-modal.visible');
    return { body: body ? body.innerText : null, modal: modal ? (modal.id || modal.className) : null };
});
const noteText = (modalText.body || '').replace(/\s+/g, ' ');
check('бележката съдържа и текста на снимката, и линка от второто споделяне', /Изпратено от Viber/.test(noteText) && /(#L\d|youtube|комшУ)/.test(noteText), noteText.slice(0, 160));
console.log('DIAG текст на бележката:', JSON.stringify(noteText.slice(0, 200)), '| модал:', modalText.modal);

const afterKeys = await app2.evaluate(async () => {
    const cache = await caches.open('share-target-image');
    return (await cache.keys()).map(k => new URL(k.url).pathname.split('/').pop());
});
check('след вземане не остават чакащи споделяния', afterKeys.filter(k => k.startsWith('share-payload-')).length === 0, JSON.stringify(afterKeys));
check('след вземане файлът е изчистен от кеша', afterKeys.filter(k => k.startsWith('shared-file-')).length === 0, JSON.stringify(afterKeys));

const errors = logs.filter(l => /PAGEERROR/.test(l));
check('без грешки в страницата', errors.length === 0, errors.slice(0, 2).join(' | '));

const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} проверки минават`);
await browser.close();
srv.close();
process.exit(passed === results.length ? 0 : 1);
