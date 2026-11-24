// b5.42: при всяко споделяне service worker-ът оставя запис в кеша, а приложението
// показва панел с него (за телефон без конзола). Тестваме пълната верига с истински
// POST multipart със снимка, както го прави Chrome при споделяне на изображение.
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
// Каквото праща Chrome при „Споделяне на изображението“ от браузър: файл + адрес на страницата.
const HARNESS = `<!doctype html><html><head><meta charset="utf-8"><title>share harness</title></head><body>
<form id="f" action="index.html" method="post" enctype="multipart/form-data">
  <input type="hidden" name="shared_title" value="Снимка от интернет">
  <input type="hidden" name="shared_text" value="https://example.com/statia">
  <input type="file" id="file" name="shared_image" accept="image/*">
  <button type="submit">share</button>
</form></body></html>`;
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/__share.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(HARNESS); return; }
    if (p === '/__seed.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end('<!doctype html><meta charset="utf-8"><title>seed</title>'); return; }
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

const results = [];
const check = (name, ok, extra = '') => { results.push({ name, ok, extra }); console.log((ok ? 'PASS' : 'FAIL') + ' — ' + name + (extra ? ' | ' + extra : '')); };

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 } });
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const logs = [];
const hook = p => { p.on('console', m => logs.push(m.text().slice(0, 220))); p.on('pageerror', e => logs.push('PAGEERROR ' + String(e.message).slice(0, 220))); };
const page = await ctx.newPage(); hook(page);
await page.addInitScript(() => {
    const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
    window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
    window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
    window.kofiWidgetOverlay = { draw() { } };
    window.kofiwidget2 = { init() { }, draw() { } };
    localStorage.setItem('language', 'bg');
    localStorage.setItem('hideAssistant', 'true');
});
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
await page.goto(`${ORIGIN}/index.html?demo=1`, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 30000 }).catch(() => console.log('няма app-ready'));
await page.evaluate(() => navigator.serviceWorker.ready).catch(() => { });
await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(async () => {
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 20000 }).catch(() => { });
});
await page.waitForTimeout(1200);
check('приложението е отворено и контролирано от service worker', await page.evaluate(() => !!navigator.serviceWorker.controller));

// 1. истинско споделяне от друга страница в обхвата на SW-а
const sharer = await ctx.newPage(); hook(sharer);
await sharer.goto(`${ORIGIN}/__share.html`, { waitUntil: 'load' });
await sharer.setInputFiles('#file', { name: 'pic.png', mimeType: 'image/png', buffer: PNG });
await sharer.evaluate(() => document.getElementById('f').submit());
await page.waitForTimeout(4000);

// 2. записите на дебъга
const dbg = await page.evaluate(async () => {
    const cache = await caches.open('share-target-image');
    const res = await cache.match('share-debug');
    const keys = (await cache.keys()).map(r => r.url);
    return { entries: res ? await res.json() : [], keys };
});
const stages = dbg.entries.map(e => e.stage);
check('дебъг записът е в кеша и не е изтрит от новото споделяне', dbg.keys.some(k => k.endsWith('/share-debug')) && dbg.entries.length > 0, 'записи: ' + dbg.entries.length);
check('при успешно споделяне панелът не пречи', await page.evaluate(() => !document.getElementById('share-debug-panel')));
check('записът „post“ е налице (POST е стигнал до SW)', stages.includes('post'));
check('записът „fields“ показва 1 файл', stages.includes('fields') && dbg.entries.find(e => e.stage === 'fields').files === 1, JSON.stringify(dbg.entries.find(e => e.stage === 'fields') || {}));
check('записът „file“ носи име, тип и размер', !!dbg.entries.find(e => e.stage === 'file' && e.type === 'image/png' && e.size === PNG.length), JSON.stringify(dbg.entries.find(e => e.stage === 'file') || {}));
// b5.51: панелът трябва да показва и какво точно е дошло в тялото, не само прочетеното.
const fRec = dbg.entries.find(e => e.stage === 'fields') || {};
check('записът „fields“ изброява всички части преди филтъра', /shared_image \[image\/png, \d+B\]/.test(fRec.parts || ''), String(fRec.parts));
const pRec = dbg.entries.find(e => e.stage === 'post') || {};
check('записът „post“ носи реалната дължина и началото на тялото', typeof pRec.real === 'number' && pRec.real > 0 && /Content-Disposition/.test(pRec.head || ''), 'real=' + pRec.real + ' head=' + String(pRec.head).slice(0, 60));
check('има запис за доставяне или пренасочване', stages.includes('delivered') || stages.includes('redirect'), stages.join(','));
check('няма запис за грешка', !stages.includes('error') && !stages.includes('file-error'));

// 3. панелът на екрана
const panel = await page.evaluate(async () => {
    await window.maybeShowShareDebug(true);
    const box = document.getElementById('share-debug-panel');
    return box ? box.innerText : null;
});
check('панелът се показва', !!panel);
check('панелът съдържа полетата и файла', !!panel && /fields/.test(panel) && /files=1/.test(panel) && /image\/png/.test(panel));
check('панелът има бутони Копирай и Затвори', !!panel && /Копирай/.test(panel) && /Затвори/.test(panel));

// 4. затваряне
const closed = await page.evaluate(() => {
    const box = document.getElementById('share-debug-panel');
    if (!box) return false;
    [...box.querySelectorAll('button')].find(b => b.textContent === 'Затвори').click();
    return !document.getElementById('share-debug-panel');
});
check('бутонът Затвори маха панела', closed);

// 5. ръчният вход: редът с версията в Настройки
const bound = await page.evaluate(() => {
    const label = document.querySelector('.modal-version');
    return label ? (label.dataset.shareDebugBound || '') : 'няма ред';
});
check('редът с версията е свързан с панела', bound === '1', String(bound));
await page.evaluate(() => document.querySelector('.modal-version').click());
await page.waitForTimeout(600);
const trigger = await page.evaluate(() => {
    const box = document.getElementById('share-debug-panel');
    const ok = !!box;
    if (box) box.remove();
    return ok;
});
check('докосване на реда с версията в Настройки отваря панела', trigger === true, String(trigger));

const errors = logs.filter(l => /PAGEERROR/.test(l));
check('без грешки в страницата', errors.length === 0, errors.slice(0, 2).join(' | '));

// 6. случаят на собственика: приложението се отваря след споделяне, но бележка няма
const silent = await ctx.newPage(); hook(silent);
await silent.goto(`${ORIGIN}/index.html?demo=1&share_debug=1`, { waitUntil: 'load' });
await silent.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 30000 }).catch(() => { });
await silent.waitForTimeout(2500);
const autoPanel = await silent.evaluate(() => {
    const box = document.getElementById('share-debug-panel');
    return box ? box.innerText.slice(0, 200) : null;
});
check('без бележка панелът излиза сам', !!autoPanel, autoPanel ? autoPanel.replace(/\n/g, ' / ') : 'няма панел');
await silent.close();

const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length} проверки минават`);
await browser.close();
srv.close();
process.exit(passed === results.length ? 0 : 1);
