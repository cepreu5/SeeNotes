// Менюто с бордовете се позиционира на стартовия борд САМО ВЕДНЪЖ при зареждане (uni / CX Notes).
// Какво доказва: при зададена стартова папка далеч в менюто (на телефон 390px) uni подкарва точно
// ЕДНО плавно скролиране към бутона на папката. Преди поправката (b3.18) бяха две на 11 ms една от
// друга: boardClick() центрира бутона, а filterNotesByBoard() веднага след него викаше
// revealBoardInHeaderMenu(), което прекъсваше току-що почналото скролиране и го подкарваше пак —
// менюто се местеше два пъти. Поправката: онова второ връщане на менюто се прави само когато хедърът
// наистина е бил скрит (връщане от календара), защото тогава скролирането в boardClick няма какво
// да измери.
//
// Проверява се в истински Chromium, с истинския uni код и истински плавни скролирания:
//   1) зареждане → точно 1 заявка за скрол към менюто и точно 1 епизод на движение на scrollLeft;
//   2) бутонът на стартовата папка е изцяло видим и близо до средата на менюто;
//   3) обикновен клик на друг борд също дава точно 1 скрол и центрира бутона;
//   4) връщане от календар (хедърът бил скрит) ПАК връща менюто при избрания борд — поправката не
//      маха поведението от b2.35.
//
// Пускане от корена на хранилището: node .bolter/check/start-board-scroll-once.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (използва се, за да се провери, че тестът хваща бъга).
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

const root = path.resolve(process.env.ROOT || 'uni');
const PAGE = process.env.UNI_PAGE || 'index.html';
if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}
const DB_NAME = process.env.UNI_DB || 'NotesDB-demo';
const SEED_PATH = '/__seed.html';

// Телефон: менюто с 12 борда не се побира и наистина трябва да се скролира.
const W = Number(process.env.W || 390), H = Number(process.env.H || 844);
const BOARD_COUNT = 12;
const START_BOARD = 'b9';        // стартовата папка („Bolter“), далеч надясно в менюто
const START_TITLE = 'Bolter';

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

await page.addInitScript(({ startBoard }) => {
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
    localStorage.setItem('language', 'bg');
    localStorage.setItem('startBoard', startBoard);
    localStorage.setItem('hideAssistant', 'true');

    // --- Запис на всяка заявка за скрол, която стига до менюто с бордовете --------------------
    window.__axiScrolls = [];
    const inMenu = (el) => {
        if (!el || !el.closest) return false;
        return !!(el.closest('header .board-menu-container') || (el.classList && el.classList.contains('board-menu-container')));
    };
    const record = (kind, el, arg) => {
        if (!inMenu(el)) return;
        window.__axiScrolls.push({ kind, t: Math.round(performance.now()), arg: typeof arg === 'object' ? JSON.stringify(arg) : String(arg) });
    };
    for (const name of ['scrollIntoView', 'scrollTo', 'scroll']) {
        const orig = Element.prototype[name];
        if (!orig) continue;
        Element.prototype[name] = function (...a) { record(name, this, a[0]); return orig.apply(this, a); };
    }
    // --- Проби на scrollLeft на менюто всеки кадър: броим отделните движения ------------------
    window.__axiFrames = [];
    const tick = () => {
        const menu = document.querySelector('header .board-menu-container');
        if (menu) window.__axiFrames.push([Math.round(performance.now()), Math.round(menu.scrollLeft)]);
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}, { startBoard: START_BOARD });

// --- 1) Засяване на базата преди старта ----------------------------------------------------
await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
const seed = await page.evaluate(async ({ dbName, startBoard, boardCount }) => {
    const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null, files: { keyPath: 'key' } };
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
        const boards = [];
        for (let i = 1; i <= boardCount; i++) {
            const gdid = 'b' + i;
            boards.push({ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid, id: i, numord: i, status: 0, title: gdid === startBoard ? 'Bolter' : 'Board ' + i });
        }
        const notes = [];
        let k = 0;
        for (const b of boards) {
            for (let j = 1; j <= 3; j++) {
                k++;
                notes.push({
                    alarm_type: -1, boardid: b.gdid, calendarDate: 0, color: 0,
                    date: now - k * 1000, datemod: now - k * 1000, eventId: 0,
                    gdid: `Note${String(k).padStart(18, '0')}`, id: 1000 + k,
                    notetxt: `Бележка ${k}|Тяло ${k}`, numord: k, pass: false, sellist: 0, status: 0,
                    text_span: '', timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 243
                });
            }
        }
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
}, { dbName: DB_NAME, startBoard: START_BOARD, boardCount: BOARD_COUNT });
ok(!seed.err && seed.seeded && seed.seeded.boards === BOARD_COUNT,
    `базата е засята преди старта: ${BOARD_COUNT} борда, стартов е „${START_TITLE}“ (${START_BOARD})`, seed);
if (fails) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

// --- 2) Първо зареждане на истинското приложение ------------------------------------------
await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
    && document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
    .then(() => true, () => false);
ok(ready, 'приложението се зареди от засятата база (демо/офлайн път, без Google)');
if (!ready) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }
await page.waitForTimeout(2000);

// Епизоди на движение: последователни кадри с различна стойност на scrollLeft.
const readMenuState = () => page.evaluate((startBoard) => {
    const menu = document.querySelector('header .board-menu-container');
    const btn = menu && menu.querySelector(`.board-filter-link[data-boardid="${startBoard}"]`);
    const frames = window.__axiFrames || [];
    const episodes = [];
    let prev = null;
    for (const [t, v] of frames) {
        if (v === prev) continue;
        const last = episodes[episodes.length - 1];
        if (last && t - last.end < 120) { last.end = t; last.to = v; }
        else episodes.push({ start: t, end: t, from: prev === null ? v : prev, to: v });
        prev = v;
    }
    let rect = null;
    if (menu && btn) {
        const m = menu.getBoundingClientRect(), r = btn.getBoundingClientRect();
        rect = { left: Math.round(r.left - m.left), right: Math.round(r.right - m.left), menuW: Math.round(m.width) };
    }
    return {
        menu: menu ? { overflow: menu.scrollWidth > menu.clientWidth, scrollLeft: Math.round(menu.scrollLeft), scrollWidth: menu.scrollWidth, clientWidth: menu.clientWidth } : null,
        rect,
        selected: btn ? btn.classList.contains('selected-board') : false,
        scrolls: window.__axiScrolls || [],
        episodes
    };
}, START_BOARD);

const s1 = await readMenuState();
ok(s1.menu && s1.menu.overflow,
    `менюто наистина се скролира на ${W}px (съдържание ${s1.menu && s1.menu.scrollWidth}px в ${s1.menu && s1.menu.clientWidth}px)`, s1.menu);
ok(s1.scrolls.length === 1,
    `при зареждане към менюто тръгва ТОЧНО една заявка за скрол (не две)`, s1.scrolls);
ok(s1.episodes.length === 1,
    'менюто се мести в един епизод, без прекъсване и повторно тръгване', s1.episodes);
ok(s1.rect && s1.rect.left >= 0 && s1.rect.right <= s1.rect.menuW && Math.abs((s1.rect.left + s1.rect.right) / 2 - s1.rect.menuW / 2) < 60,
    `бутонът на стартовата папка е изцяло видим и близо до средата на менюто (${s1.rect && s1.rect.left}..${s1.rect && s1.rect.right} от ${s1.rect && s1.rect.menuW}px)`, s1.rect);
ok(s1.selected, 'стартовата папка е маркирана като избрана в менюто');

// --- 3) Обикновен клик на друг борд: пак точно едно скролиране ------------------------------
await page.evaluate(() => { window.__axiScrolls.length = 0; });
await page.click('.board-menu-container .board-filter-link[data-boardid="b3"]');
await page.waitForTimeout(1200);
const s3 = await page.evaluate(() => {
    const menu = document.querySelector('header .board-menu-container');
    const btn = menu && menu.querySelector('.board-filter-link[data-boardid="b3"]');
    let rect = null;
    if (menu && btn) {
        const m = menu.getBoundingClientRect(), r = btn.getBoundingClientRect();
        rect = { left: Math.round(r.left - m.left), right: Math.round(r.right - m.left), menuW: Math.round(m.width) };
    }
    return { scrolls: window.__axiScrolls || [], rect, filter: typeof currentBoardFilter === 'undefined' ? null : currentBoardFilter };
});
ok(s3.scrolls.length === 1, 'клик на друг борд дава точно една заявка за скрол към менюто', s3.scrolls);
ok(s3.rect && s3.rect.left >= 0 && s3.rect.right <= s3.rect.menuW,
    `след клика бутонът на избрания борд е изцяло видим (${s3.rect && s3.rect.left}..${s3.rect && s3.rect.right})`, s3.rect);

// --- 4) Връщане от календар: хедърът бил скрит, менюто пак се връща при борда (b2.35) ---------
// Точно случаят, за който беше добавено второто скролиране: при отворен календар хедърът е
// display:none, boardClick не може да измери нищо, и след връщането менюто трябва да се покаже
// при избрания борд. Поправката не бива да маха това.
await page.evaluate(() => { window.__axiScrolls.length = 0; });
const backFromCalendar = await page.evaluate(async (board) => {
    // Средата е като в календара: хедърът и бележките са скрити, после се избира борд.
    const header = document.querySelector('header');
    header.style.display = 'none';
    document.getElementById('notes-container').style.display = 'none';
    if (typeof filterNotesByBoard === 'function') await filterNotesByBoard(board, false);
    await new Promise(r => setTimeout(r, 1200));
    const menu = document.querySelector('header .board-menu-container');
    const btn = menu && menu.querySelector(`.board-filter-link[data-boardid="${board}"]`);
    let rect = null;
    if (menu && btn) {
        const m = menu.getBoundingClientRect(), r = btn.getBoundingClientRect();
        rect = { left: Math.round(r.left - m.left), right: Math.round(r.right - m.left), menuW: Math.round(m.width) };
    }
    return { headerVisible: getComputedStyle(header).display !== 'none', rect, scrolls: window.__axiScrolls || [] };
}, 'b11');
ok(backFromCalendar.headerVisible, 'след връщане от календара хедърът отново се вижда');
ok(backFromCalendar.rect && backFromCalendar.rect.left >= 0 && backFromCalendar.rect.right <= backFromCalendar.rect.menuW,
    'връщането от календара ПАК довежда менюто до избрания борд (поведението от b2.35 е запазено)',
    { rect: backFromCalendar.rect, scrolls: backFromCalendar.scrolls });

ok(errs.length === 0, 'няма грешки в конзолата на страницата', errs.slice(0, 3));

await browser.close();
srv.close();
console.log(fails ? `FAILED (${n - fails}/${n})` : `OK (${n}/${n})`);
process.exit(fails ? 1 : 0);
