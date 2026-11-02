// След натискане на Reload в MNV активен остава бордът, от който е натиснат бутонът — жив браузър.
// Порт на uni теста .bolter/check/refresh-keeps-board.mjs (PR #183, b3.56) за MNV.
//
// Какво проверява (истински Chromium, истинският MNV код, засята IndexedDB NotesDB, офлайн старт):
//   1) при старт приложението е на СТАРТОВИЯ борд от Настройки (тук „Работа“), както досега;
//   2) влизаме в другия борд („Лични“) с истински клик по реда в хедъра;
//   3) клик по Reload: зареждането наистина минава (контейнерът се изчиства) и след него
//      активен остава „Лични“, а не стартовият борд; менюто е маркирало същия ред;
//   4) същото от специален изглед: от „Всички“ Reload връща „Всички“;
//   5) още един Reload от „Работа“, за да не е случайност;
//   6) стартовият борд в localStorage не се пипа от Reload;
//   7) няма изключения в конзолата на страницата.
//
// Пускане от корена на хранилището: node .bolter/check/mnv-reload-keeps-board.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (контролата върху стария код пада на 3).
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

const root = path.resolve(process.env.ROOT || 'MNV');
const PAGE = process.env.MNV_PAGE || 'index-2.html';
if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}
const DB_NAME = process.env.MNV_DB || 'NotesDB';
const SEED_PATH = '/__seed.html';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 900);

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === SEED_PATH) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end('<!doctype html><html><head><meta charset="utf-8"><title>seed</title></head><body>seed</body></html>');
        return;
    }
    const rel = p === '/' ? PAGE : p;
    try {
        const b = await readFile(path.join(root, rel));
        res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(b);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const ORIGIN = `http://localhost:${srv.address().port}`;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.addInitScript(() => {
    const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
    window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
    window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
    window.kofiWidgetOverlay = { draw() { } };
    window.kofiwidget2 = { init() { }, draw() { } };
    localStorage.setItem('useIndexedDb', 'true');
    localStorage.setItem('useGoogleDb', 'false');
    localStorage.setItem('useLocalDb', 'false');
    localStorage.setItem('useLocalFolder', 'false');
    localStorage.setItem('useArhDb', 'false');
    localStorage.setItem('updateFromSource', 'false');
    localStorage.setItem('lang', 'bg');
    localStorage.setItem('language', 'bg');
    localStorage.setItem('hideAssistant', 'true');
    localStorage.setItem('guide', 'false');
    localStorage.setItem('showBoardAll', 'true');
    // Стартовият борд е „Работа“ (b1) — точно този, на който приложението падаше след Reload.
    localStorage.setItem('startBoard', 'b1');
});

// --- Засяване на базата преди старта -------------------------------------------------------
await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
const seed = await page.evaluate(async ({ dbName }) => {
    const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null };
    const out = {};
    try {
        await new Promise((res) => { const d = indexedDB.deleteDatabase(dbName); d.onsuccess = d.onerror = d.onblocked = () => res(); setTimeout(res, 3000); });
        const db = await new Promise((res, rej) => {
            const req = indexedDB.open(dbName, 4);
            req.onupgradeneeded = () => {
                const d = req.result;
                for (const [name, opt] of Object.entries(STORES)) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, opt || undefined);
            };
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        const now = Date.now();
        const boards = [
            { backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b1', id: 1, numord: 1, status: 0, title: 'Работа' },
            { backcolor: 0, backnum: 0, backpath: '', color: '#8BC34A', colorfont: '#000', datemod: now, gdid: 'b2', id: 2, numord: 2, status: 0, title: 'Лични' }
        ];
        const mk = (k, boardid, title) => ({
            alarm_type: -1, boardid, calendarDate: 0, color: 0,
            date: now - k * 1000, datemod: now - k * 1000, eventId: 0,
            gdid: `Note${String(k).padStart(18, '0')}`, id: 1000 + k,
            notetxt: `${title}|Тяло ${k}`, numord: k, pass: false, sellist: 0, status: 0,
            text_span: '', timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 243
        });
        const notes = [
            mk(1, 'b1', 'РАБОТА ЕДНО'),
            mk(2, 'b1', 'РАБОТА ДВЕ'),
            mk(3, 'b2', 'ЛИЧНА ЕДНО'),
            mk(4, 'b2', 'ЛИЧНА ДВЕ')
        ];
        await new Promise((res, rej) => {
            const tx = db.transaction(['boards', 'notes', 'media', 'config'], 'readwrite');
            tx.oncomplete = res; tx.onerror = () => rej(tx.error);
            tx.objectStore('boards').clear(); tx.objectStore('notes').clear();
            tx.objectStore('media').clear(); tx.objectStore('config').clear();
            boards.forEach(b => tx.objectStore('boards').put(b));
            notes.forEach(x => tx.objectStore('notes').put(x));
            tx.objectStore('config').put(1, 'dbSource');
            tx.objectStore('config').put('gdid', 'dbNoteIdType');
            tx.objectStore('config').put(now, 'dbCreatedTimestamp');
            tx.objectStore('config').put(now, 'lastLocalTimestamp');
        });
        db.close();
        out.seeded = { boards: boards.length, notes: notes.length };
    } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
    return out;
}, { dbName: DB_NAME });
ok(!seed.err && seed.seeded && seed.seeded.notes === 4, 'базата е засята преди старта: 2 борда, 4 бележки', seed);
if (fails) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

// --- Старт на страницата --------------------------------------------------------------------
await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
const booted = await page.waitForFunction(() => typeof createNoteElement === 'function'
    && typeof startApp === 'function' && typeof filterNotesByBoard === 'function'
    && typeof initializeLoad === 'function' && typeof mainLogic === 'function', null, { timeout: 30000 })
    .then(() => true, () => false);
ok(booted, 'страницата на приложението се зареди');
if (!booted) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

// Офлайн режим: checkAuth минава без Google, а данните идват от засятата IndexedDB.
// startApp() е собственият старт на приложението — той вързва слушателите на бутоните
// (initApp) и вика mainLogic, значи след него Reload е истинският бутон на приложението.
// Страниците на входа се скриват, както ги скрива и самото приложение след успешен старт.
const boot = await page.evaluate(async () => {
    const info = { err: '' };
    isOfflineMode = true;
    try { if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags(); } catch (e) { }
    try { await startApp(); } catch (e) { info.err = String((e && e.message) || e).slice(0, 300); }
    ['login-page', 'request-access-modal', 'folderIdPromptPopup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    document.querySelectorAll('.guide-container, .speech-bubble, .guide-img').forEach(el => el.remove());
    info.reloadBound = typeof reloadButton !== 'undefined' && !!reloadButton;
    return info;
});
ok(!boot.err && boot.reloadBound, 'приложението стартира офлайн и върза бутона Reload', boot);

const settle = (ms = 250) => page.waitForTimeout(ms);

// Заглавието носи целия текст на бележката ("Заглавие|Тяло"), затова се сравнява по съдържание.
const visibleTitles = () => page.evaluate(() => Array.from(document.querySelectorAll('#notes-container .note'))
    .filter(c => !c.classList.contains('boards-note') && !c.classList.contains('promo-note') && c.style.display !== 'none')
    .map(c => (c.querySelector('.note-title-truncated')?.textContent || '').trim()));
const shown = (titles, needle) => titles.some(t => t.includes(needle));

const boardState = () => page.evaluate(() => ({
    filter: String(typeof currentBoardFilter !== 'undefined' ? currentBoardFilter : ''),
    selected: Array.from(document.querySelectorAll('.board-menu-container .board-filter-link.selected-board'))
        .map(l => String(l.dataset.boardid))
}));

// Смяна на борда с истинска мишка по реда в менюто на хедъра.
const clickBoard = async (boardId) => {
    const box = await page.evaluate((id) => {
        const el = document.querySelector(`header .board-menu-container .board-filter-link[data-boardid="${id}"]`);
        if (!el) return null;
        el.scrollIntoView({ block: 'center', inline: 'center' });
        const r = el.getBoundingClientRect();
        const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
        const hit = document.elementFromPoint(x, y);
        return { x, y, good: !!hit && (hit === el || el.contains(hit)), hit: hit ? (hit.id || hit.className || hit.tagName) : null };
    }, boardId);
    if (!box) return { ok: false, step: 'row', box };
    if (!box.good) return { ok: false, step: 'hit', box };
    await page.mouse.click(box.x, box.y);
    const applied = await page.waitForFunction((id) => String(currentBoardFilter) === String(id)
        && document.getElementById('notes-container').style.visibility !== 'hidden', boardId, { timeout: 8000 })
        .then(() => true, () => false);
    await settle();
    return { ok: applied, box };
};

// Натискане на Reload и изчакване на самото презареждане: броим изчистванията на контейнера
// и вдигането на лоудъра (initializeLoad прави и двете) и чакаме зареждането да свърши.
const pressReload = async () => {
    await page.evaluate(() => {
        if (typeof window.removeGuide === 'function') { try { window.removeGuide(); } catch (e) { } }
        document.querySelectorAll('.guide-container, .speech-bubble, .guide-img').forEach(el => el.remove());
        window.__reloadSeen = 0;
        const cont = document.getElementById('notes-container');
        const loader = document.getElementById('loader-container');
        const tick = () => { window.__reloadSeen++; };
        window.__reloadObserver = new MutationObserver((records) => {
            for (const r of records) {
                if (r.type === 'childList' && cont.querySelectorAll('.note').length === 0) return tick();
                if (r.type === 'attributes' && r.target === loader && loader.style.display === 'block') return tick();
            }
        });
        window.__reloadObserver.observe(cont, { childList: true });
        window.__reloadObserver.observe(loader, { attributes: true, attributeFilter: ['style'] });
    });
    let box = null;
    for (let attempt = 0; attempt < 6; attempt++) {
        box = await page.evaluate(() => {
            const el = document.getElementById('reload_button');
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
            const hit = document.elementFromPoint(x, y);
            return { x, y, good: !!hit && (hit === el || el.contains(hit)), hit: hit ? (hit.id || hit.className || hit.tagName) : null };
        });
        if (!box || box.good) break;
        await page.evaluate(() => {
            document.querySelectorAll('.guide-container, .speech-bubble, .guide-img').forEach(el => el.remove());
        });
        await page.waitForTimeout(300);
    }
    const clicked = !!box && box.good;
    if (clicked) await page.mouse.click(box.x, box.y);
    const started = await page.waitForFunction(() => window.__reloadSeen > 0, null, { timeout: 15000 })
        .then(() => true, () => false);
    const done = await page.waitForFunction(() => {
        if (typeof isMainLogicRunning !== 'undefined' && isMainLogicRunning) return false;
        return document.querySelectorAll('#notes-container .note').length > 0;
    }, null, { timeout: 30000 }).then(() => true, () => false);
    await settle(600);
    await page.evaluate(() => { if (window.__reloadObserver) window.__reloadObserver.disconnect(); });
    return { clicked, box, started, done, seen: await page.evaluate(() => window.__reloadSeen) };
};

const loaded = await page.waitForFunction(() => document.querySelectorAll('#notes-container .note').length > 0,
    null, { timeout: 30000 }).then(() => true, () => false);
ok(loaded, 'приложението се зареди от базата (има карти)');
if (!loaded) {
    console.log('няма смисъл да продължаваме без зареден борд');
    await browser.close(); srv.close();
    console.log('FAILED');
    process.exit(1);
}
await settle(400);

// --- 1) Старт: стартовият борд от Настройки ------------------------------------------------
let st = await boardState();
ok(st.filter === 'b1' && st.selected.includes('b1'), 'при старт активен е стартовият борд „Работа“ (b1)', st);
let titles = await visibleTitles();
ok(shown(titles, 'РАБОТА ЕДНО') && !shown(titles, 'ЛИЧНА ЕДНО'), 'на екрана са бележките на „Работа“', titles);

// --- 2) Влизаме в другия борд ---------------------------------------------------------------
let r = await clickBoard('b2');
ok(r.ok, 'минаваме в борд „Лични“ с клик по реда в менюто', r);
st = await boardState();
titles = await visibleTitles();
ok(st.filter === 'b2' && st.selected.includes('b2') && shown(titles, 'ЛИЧНА ЕДНО'), '„Лични“ е активен и показва своите бележки', { st, titles });

// --- 3) Reload: остава „Лични“, не стартовият борд ------------------------------------------
let ref = await pressReload();
ok(ref.clicked, 'клик по бутона Reload от „Лични“', ref);
ok(ref.started && ref.done, 'презареждането наистина мина (контейнерът се изчисти и се напълни пак)', ref);
st = await boardState();
titles = await visibleTitles();
ok(st.filter === 'b2', 'след Reload активен е СЪЩИЯТ борд „Лични“ (b2), не стартовият „Работа“ (b1)', st);
ok(st.selected.includes('b2') && !st.selected.includes('b1'), 'менюто е маркирало реда „Лични“', st);
ok(shown(titles, 'ЛИЧНА ЕДНО') && !shown(titles, 'РАБОТА ЕДНО'), 'на екрана са бележките на „Лични“, а не на стартовия борд', titles);
const startStored = await page.evaluate(() => localStorage.getItem('startBoard'));
ok(startStored === 'b1', 'Reload не пипа стартовия борд в Настройки (startBoard = b1)', startStored);

// --- 4) Същото от специален изглед: „Всички“ ------------------------------------------------
r = await clickBoard('all');
ok(r.ok, 'минаваме във „Всички“', r);
ref = await pressReload();
st = await boardState();
ok(ref.started && ref.done && st.filter === 'all', 'след Reload от „Всички“ активен остава „Всички“', { ref, st });

// --- 5) Още един Reload от „Работа“, за да не е случайност -----------------------------------
r = await clickBoard('b1');
ok(r.ok, 'обратно в борд „Работа“', r);
ref = await pressReload();
st = await boardState();
titles = await visibleTitles();
ok(ref.started && ref.done && st.filter === 'b1' && shown(titles, 'РАБОТА ДВЕ') && !shown(titles, 'ЛИЧНА ДВЕ'),
    'втори Reload от „Работа“ също остава на „Работа“', { st, titles });

ok(errs.length === 0, 'няма изключения в конзолата на страницата', errs.slice(0, 3));

if (process.env.SHOT) {
    await page.screenshot({ path: process.env.SHOT });
    console.log(`     (снимка: ${process.env.SHOT})`);
}

await browser.close();
srv.close();
console.log(fails ? `FAILED (${fails} от ${n})` : `OK (${n} проверки)`);
process.exit(fails ? 1 : 0);
