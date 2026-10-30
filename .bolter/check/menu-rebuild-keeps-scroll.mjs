// Пресглобяването на менюто с бордовете не мести лентата (uni / CX Notes).
//
// Какво доказва: след като при зареждане менюто е отишло при стартовата папка, всяко следващо
// ПРЕСГЛОБЯВАНЕ на менюто (renderUI) не бива да мести лентата. Преди b3.19 то я нулираше и после
// пак плъзваше до папката — на телефона това е второ превъртане около секунда след първото, точно
// каквото собственикът вижда: uni пуска фонова синхронизация веднага след първото рисуване и при
// намерени промени вика renderUI отново.
//
// Проверява се в истински Chromium с истинския uni код и истински плавни скролирания:
//   1) зареждане → менюто е при стартовата папка (точно 1 заявка за скрол, лентата е на >0);
//   2) пълно пресглобяване (renderUI) → НИТО една нова заявка за скрол, лентата не мърда,
//      нито един кадър не показва 0 (лентата не скача в началото), бутонът е изцяло видим;
//   3) пресглобяване само на менюто (rerenderOnlyMenu) → същото;
//   4) ако избраният борд е извън екрана, пресглобяването ПАК довежда лентата до него
//      (поправката не маха скролирането, когато то наистина трябва).
//
// Пускане от корена на хранилището: node .bolter/check/menu-rebuild-keeps-scroll.mjs   (exit 1 при провал)
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

const W = Number(process.env.W || 390), H = Number(process.env.H || 844);
const BOARD_COUNT = 12;
const START_BOARD = 'b9';          // стартовата папка („Bolter“), далеч надясно в менюто
const START_TITLE = 'Bolter';
const OTHER_BOARD = 'b2';          // борд, който при тази позиция е извън екрана

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

    // Всяка заявка за скрол, която стига до менюто с бордовете
    window.__axiScrolls = [];
    const inMenu = (el) => {
        if (!el || !el.closest) return false;
        return !!(el.closest('header .board-menu-container') || (el.classList && el.classList.contains('board-menu-container')));
    };
    for (const name of ['scrollIntoView', 'scrollTo', 'scroll']) {
        const orig = Element.prototype[name];
        if (!orig) continue;
        Element.prototype[name] = function (...a) {
            if (inMenu(this)) window.__axiScrolls.push({ kind: name, t: Math.round(performance.now()) });
            return orig.apply(this, a);
        };
    }
    // Проби на scrollLeft всеки кадър: виждаме и скок до 0, и плавно движение
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

const readState = () => page.evaluate((startBoard) => {
    const menu = document.querySelector('header .board-menu-container');
    const btn = menu && menu.querySelector(`.board-filter-link[data-boardid="${startBoard}"]`);
    let rect = null;
    if (menu && btn) {
        const m = menu.getBoundingClientRect(), r = btn.getBoundingClientRect();
        rect = { left: Math.round(r.left - m.left), right: Math.round(r.right - m.left), menuW: Math.round(m.width) };
    }
    return {
        scrollLeft: menu ? Math.round(menu.scrollLeft) : null,
        scrollWidth: menu ? menu.scrollWidth : null,
        clientWidth: menu ? menu.clientWidth : null,
        rect,
        scrolls: window.__axiScrolls || [],
        frames: window.__axiFrames || []
    };
}, START_BOARD);

const s1 = await readState();
ok(s1.rect && s1.rect.left >= 0 && s1.rect.right <= s1.rect.menuW,
    `преди пресглобяването менюто е при стартовата папка (${s1.rect && s1.rect.left}..${s1.rect && s1.rect.right} от ${s1.rect && s1.rect.menuW}px)`, s1.rect);
ok(s1.scrollLeft > 0, `лентата е изместена надясно (scrollLeft ${s1.scrollLeft})`, s1.scrollLeft);
const baseScrolls = s1.scrolls.length;

// --- 3) Пълно пресглобяване (каквото стартовата синхронизация прави) -----------------------
await page.evaluate(() => { window.__axiFrames.length = 0; });
const rebuilt = await page.evaluate(async () => {
    try { await renderUI({ boardParseError: false }); return { ok: true }; }
    catch (e) { return { ok: false, err: String((e && e.message) || e).slice(0, 200) }; }
});
ok(rebuilt.ok, 'пълно пресглобяване (renderUI) минава без грешка', rebuilt);
await page.waitForTimeout(2000);
const s2 = await readState();
ok(s2.scrolls.length === baseScrolls,
    'след пълно пресглобяване към менюто не тръгва НИТО една нова заявка за скрол',
    s2.scrolls.slice(baseScrolls));
ok(Math.abs(s2.scrollLeft - s1.scrollLeft) <= 2,
    `лентата не мърда след пресглобяването (${s1.scrollLeft} → ${s2.scrollLeft})`, { before: s1.scrollLeft, after: s2.scrollLeft });
const zeroFrames = s2.frames.filter(([, v]) => v === 0);
ok(zeroFrames.length === 0, 'лентата не скача в началото (нито един кадър с 0 след пресглобяването)', zeroFrames.slice(0, 5));
ok(s2.rect && s2.rect.left >= 0 && s2.rect.right <= s2.rect.menuW,
    'стартовата папка остава изцяло видима след пресглобяването', s2.rect);

// --- 4) Пресглобяване само на менюто (rerenderOnlyMenu) ------------------------------------
await page.evaluate(() => { window.__axiFrames.length = 0; });
const base2 = s2.scrolls.length;
const menuOnly = await page.evaluate(async () => {
    try { await renderUI({ boardParseError: false, rerenderOnlyMenu: true }); return { ok: true }; }
    catch (e) { return { ok: false, err: String((e && e.message) || e).slice(0, 200) }; }
});
ok(menuOnly.ok, 'пресглобяване само на менюто минава без грешка', menuOnly);
await page.waitForTimeout(1500);
const s3 = await readState();
ok(s3.scrolls.length === base2, 'при пресглобяване само на менюто също няма нова заявка за скрол', s3.scrolls.slice(base2));
ok(Math.abs(s3.scrollLeft - s1.scrollLeft) <= 2, `лентата не мърда и тук (${s1.scrollLeft} → ${s3.scrollLeft})`);
ok(s3.frames.filter(([, v]) => v === 0).length === 0, 'и тук лентата не скача в началото');

// --- 5) Избран борд извън екрана: пресглобяването ПАК довежда лентата до него --------------
await page.evaluate((other) => { currentBoardFilter = other; }, OTHER_BOARD);
const t = await page.evaluate(async () => {
    const before = Math.round(document.querySelector('header .board-menu-container').scrollLeft);
    await renderUI({ boardParseError: false, rerenderOnlyMenu: true });
    await new Promise(r => setTimeout(r, 1500));
    const menu = document.querySelector('header .board-menu-container');
    const btn = menu && menu.querySelector('.board-filter-link.selected-board');
    let rect = null;
    if (menu && btn) {
        const m = menu.getBoundingClientRect(), r = btn.getBoundingClientRect();
        rect = { left: Math.round(r.left - m.left), right: Math.round(r.right - m.left), menuW: Math.round(m.width), id: btn.dataset.boardid };
    }
    return { before, scrollLeft: Math.round(menu.scrollLeft), rect };
});
ok(t.rect && t.rect.id === OTHER_BOARD && t.rect.left >= 0 && t.rect.right <= t.rect.menuW,
    `когато избраният борд е бил извън екрана, пресглобяването пак довежда лентата до него (${t.rect && t.rect.left}..${t.rect && t.rect.right} от ${t.rect && t.rect.menuW}px)`, t);
ok(t.scrollLeft < t.before, `лентата е тръгнала наляво към по-ранния борд (${t.before} → ${t.scrollLeft})`, t);

ok(errs.length === 0, 'няма грешки в конзолата на страницата', errs.slice(0, 3));

await browser.close();
srv.close();
console.log(fails ? `FAILED (${n - fails}/${n})` : `OK (${n}/${n})`);
process.exit(fails ? 1 : 0);
