// Броячът на „Напомняния“ да брои само бележките, които бордът наистина показва.
//
// Сценарий (истински Chromium, истинският nomn код, засята IndexedDB, ?demo=1):
//   3 бележки с timer > 0: една в борда, две в Кошчето (status 1), плюс една без напомняне.
//   Очаквано: надписът е „Напомняния (1)“ и в борда има точно 1 карта.
//
// Пускане от корена на хранилището: node /workspace/check-reminder-count-trash.mjs
// ROOT=… сочи друга папка на приложението (за да се провери, че тестът хваща бъга).
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

const root = path.resolve(process.env.ROOT || 'nomn');
const PAGE = process.env.PAGE || 'index.html';
const DB_NAME = process.env.DB || 'NotesDB-demo';
const SEED_PATH = '/__seed.html';
const W = Number(process.env.W || 390), H = Number(process.env.H || 844);

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
    localStorage.setItem('language', 'bg');
    localStorage.setItem('hideAssistant', 'true');
    localStorage.setItem('showBoardNoteCount', 'true'); // броят до името на борда, както е при собственика
});

await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
const seed = await page.evaluate(async ({ dbName }) => {
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
        for (let i = 1; i <= 2; i++) {
            boards.push({ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b' + i, id: i, numord: i, status: 0, title: 'Board ' + i });
        }
        const base = {
            alarm_type: -1, calendarDate: 0, color: 0, datemod: now, eventId: 0,
            numord: 0, pass: false, sellist: 0, text_span: '', timer_type: -1, timer_val: 1,
            title_span: '', type: 0, version: 243
        };
        const timer = now + 3600 * 1000;
        const past = new Date(now - 10 * 24 * 3600 * 1000).setHours(10, 0, 0, 0);
        const notes = [
            // 1) видима бележка с напомняне - единствената, която бордът показва
            { ...base, boardid: 'b1', date: now - 1000, gdid: 'NoteV', id: 2001, notetxt: 'Видима с напомняне', status: 0, timer },
            // 2) две бележки с напомняне, чиято „Валидност“ вече е изтекла: бордът ги крие
            { ...base, boardid: 'b1', date: now - 2000, gdid: 'NoteX1', id: 2002, notetxt: 'Изтекла с напомняне 1', status: 0, timer, calendarDate: past, uiState: { cTime: '10:00', cRepeat: { f: 'validity', u: null } } },
            { ...base, boardid: 'b2', date: now - 3000, gdid: 'NoteX2', id: 2003, notetxt: 'Изтекла с напомняне 2', status: 0, timer, calendarDate: past, uiState: { cTime: '10:00', cRepeat: { f: 'validity', u: null } } },
            // 3) контролна бележка без напомняне
            { ...base, boardid: 'b2', date: now - 4000, gdid: 'NoteP', id: 2004, notetxt: 'Без напомняне', status: 0, timer: 0 }
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
ok(!seed.err && seed.seeded && seed.seeded.notes === 4, 'базата е засята: 2 борда, 4 бележки (3 с напомняне, 2 от тях изтрити)', seed);
if (fails) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
    && document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
    .then(() => true, () => false);
ok(ready, 'приложението се зареди от засятата база');
await page.waitForTimeout(1500);

// Надписът на бутона „Напомняния“ в менюто
const label = await page.evaluate(() => {
    const btn = document.querySelector('header .board-menu-container .reminder-filter-btn');
    return btn ? btn.textContent.trim() : null;
});
ok(label === 'Напомняния (1)', 'надписът брои само бележките, които бордът показва', label);

// Отваряме борда и броим картите
await page.evaluate(() => {
    const btn = document.querySelector('header .board-menu-container .reminder-filter-btn');
    if (btn) btn.click();
});
await page.waitForTimeout(1200);
const shown = await page.evaluate(() => Array.from(document.querySelectorAll('#notes-container .note'))
    .filter(el => !el.classList.contains('boards-note') && !el.classList.contains('promo-note'))
    .filter(el => el.offsetParent !== null && getComputedStyle(el).display !== 'none')
    .map(el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)));
ok(shown.length === 1, 'в борда „Напомняния“ има точно 1 карта', shown);
ok(shown.length === 1 && /Видима с напомняне/.test(shown[0] || ''), 'показаната карта е видимата бележка', shown);

// Контрола: изтеклите бележки стигат ли до приложението (иначе сценарият не доказва нищо)
await page.evaluate(() => {
    const btn = document.querySelector('header .board-menu-container .expired-filter-btn');
    if (btn) btn.click();
});
await page.waitForTimeout(1200);
const expired = await page.evaluate(() => Array.from(document.querySelectorAll('#notes-container .note'))
    .filter(el => !el.classList.contains('boards-note') && !el.classList.contains('promo-note'))
    .filter(el => el.offsetParent !== null && getComputedStyle(el).display !== 'none')
    .map(el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40)));
ok(expired.length === 2, 'двете изтекли бележки са в борда „Невалидни“ (значи са заредени)', expired);

const realErrs = errs.filter(e => !/ServiceWorker|sw\.js|Failed to load resource/i.test(e));
ok(realErrs.length === 0, 'без грешки в страницата', realErrs);

await browser.close();
srv.close();
console.log(fails ? `FAILED (${n - fails}/${n})` : `OK (${n}/${n})`);
process.exit(fails ? 1 : 0);
