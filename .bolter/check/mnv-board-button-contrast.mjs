// Бутоните на бордовете в MNV: текстът се чете върху цвета на борда — жив браузър.
// Същото искане на собственика (2 Nov 2026) като в uni: тъмен борд с черен шрифт не се чете.
//
// Какво проверява (истински Chromium, истинският MNV код, засята IndexedDB NotesDB, офлайн старт):
//   1) за всеки борд се взимат РЕАЛНИТЕ изчислени цветове на текста и на фона на бутона в менюто;
//   2) контрастът между тях е поне 4.5:1 (WCAG AA за обикновен текст) за всеки борд поотделно;
//   3) тъмните бордове минават на бял текст, а жълтият остава с черен;
//   4) когато бордът сам иска бял текст (отрицателно число в colorfont), той се запазва;
//   5) изтрит борд (status 1, червен текст) също се чете.
//
// Пускане от корена на хранилището: node .bolter/check/mnv-board-button-contrast.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (контролата върху стария код пада на тъмните бордове).
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

// MNV пази цвета на борда като число: 0..6 са цветовете от темата, отрицателно е ARGB.
const BOARDS = [
    { gdid: 'mb1', id: 1, color: '#2F3B4A', colorfont: null, title: 'ТЪМЕН' },
    { gdid: 'mb2', id: 2, color: 3, colorfont: null, title: 'ЖЪЛТ' },
    { gdid: 'mb3', id: 3, color: 6, colorfont: null, title: 'СИН' },
    { gdid: 'mb4', id: 4, color: '#2F3B4A', colorfont: '#FFFFFF', title: 'ТЪМЕН БЯЛ' },
    { gdid: 'mb5', id: 5, color: '#2F3B4A', colorfont: null, status: 1, title: 'ИЗТРИТ' }
];

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
    localStorage.setItem('showBoardAll', 'false');
    localStorage.setItem('showBoardNoteCount', 'false');
    localStorage.setItem('showBoardRemind', 'false');
    localStorage.setItem('showTrashBoard', 'false');
    localStorage.setItem('startBoard', 'mb1');
});

// --- Засяване на базата преди старта ---------------------------------------------------------
await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
const seed = await page.evaluate(async ({ dbName, boards }) => {
    // Отрицателно число е ARGB: така MNV пази цвят, избран извън темата.
    const negColor = (hex) => (0xFF000000 | parseInt(hex.slice(1), 16)) - 0x100000000;
    const out = {};
    try {
        await new Promise((res) => { const d = indexedDB.deleteDatabase(dbName); d.onsuccess = d.onerror = d.onblocked = () => res(); setTimeout(res, 3000); });
        const db = await new Promise((res, rej) => {
            const req = indexedDB.open(dbName, 4);
            req.onupgradeneeded = () => {
                const d = req.result;
                ['boards', 'media', 'notes'].forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'gdid' }); });
                if (!d.objectStoreNames.contains('config')) d.createObjectStore('config');
            };
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        const now = Date.now();
        const rows = boards.map((b, i) => ({
            backcolor: 0, backnum: 0, backpath: '',
            color: typeof b.color === 'string' ? negColor(b.color) : b.color,
            colorfont: b.colorfont ? negColor(b.colorfont) : 0,
            datemod: now, gdid: b.gdid, id: b.id, numord: i + 1, status: b.status || 0, title: b.title
        }));
        const note = {
            alarm_type: -1, boardid: 'mb1', calendarDate: 0, color: 0, date: now, datemod: now, eventId: 0,
            gdid: 'Note1', id: 1001, notetxt: 'БЕЛЕЖКА|Тяло', numord: 1, pass: false, sellist: 0, status: 0,
            text_span: '', timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 243
        };
        await new Promise((res, rej) => {
            const tx = db.transaction(['boards', 'notes', 'media', 'config'], 'readwrite');
            tx.oncomplete = res; tx.onerror = () => rej(tx.error);
            tx.objectStore('boards').clear(); tx.objectStore('notes').clear();
            tx.objectStore('media').clear(); tx.objectStore('config').clear();
            rows.forEach(b => tx.objectStore('boards').put(b));
            tx.objectStore('notes').put(note);
            tx.objectStore('config').put(1, 'dbSource');
            tx.objectStore('config').put('gdid', 'dbNoteIdType');
            tx.objectStore('config').put(now, 'dbCreatedTimestamp');
            tx.objectStore('config').put(now, 'lastLocalTimestamp');
        });
        db.close();
        out.seeded = rows.length;
        out.colors = rows.map(r => r.color);
    } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
    return out;
}, { dbName: DB_NAME, boards: BOARDS.map(b => ({ ...b })) });
ok(!seed.err && seed.seeded === BOARDS.length, `базата е засята: ${BOARDS.length} борда с различни цветове`, seed);
if (fails) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

// --- Старт (офлайн, от базата) ---------------------------------------------------------------
await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
const booted = await page.waitForFunction(() => typeof startApp === 'function' && typeof filterNotesByBoard === 'function',
    null, { timeout: 30000 }).then(() => true, () => false);
ok(booted, 'страницата на приложението се зареди');
if (!booted) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

const boot = await page.evaluate(async () => {
    const info = { err: '' };
    isOfflineMode = true;
    try { if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags(); } catch (e) { }
    try { await startApp(); } catch (e) { info.err = String((e && e.message) || e).slice(0, 300); }
    ['login-page', 'request-access-modal', 'folderIdPromptPopup'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = 'none'; });
    document.querySelectorAll('.guide-container, .speech-bubble, .guide-img').forEach(el => el.remove());
    return info;
});
ok(!boot.err, 'приложението стартира офлайн', boot);
const drawn = await page.waitForFunction(() => document.querySelectorAll('header .board-menu-container .board-filter-link[data-boardid^="mb"]').length > 0,
    null, { timeout: 30000 }).then(() => true, () => false);
ok(drawn, 'менюто с бордове е нарисувано');
if (!drawn) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

// Измерва РЕАЛНИТЕ цветове от страницата и смята контраста по WCAG.
const rows = await page.evaluate(() => {
    const lum = (rgb) => {
        const ch = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        return 0.2126 * ch(rgb[0]) + 0.7152 * ch(rgb[1]) + 0.0722 * ch(rgb[2]);
    };
    const parse = (css) => {
        const m = String(css).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/i);
        if (!m) return null;
        return { rgb: [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])], alpha: m[4] === undefined ? 1 : Number(m[4]) };
    };
    const out = [];
    document.querySelectorAll('header .board-menu-container .board-filter-link[data-boardid^="mb"]').forEach(el => {
        const cs = getComputedStyle(el);
        const bg = parse(cs.backgroundColor), fg = parse(cs.color);
        if (!fg || !bg || bg.alpha === 0) { out.push({ id: String(el.dataset.boardid), missing: true, color: cs.color, background: cs.backgroundColor }); return; }
        const l1 = lum(fg.rgb), l2 = lum(bg.rgb);
        out.push({
            id: String(el.dataset.boardid), title: (el.textContent || '').trim().slice(0, 20),
            color: cs.color, background: cs.backgroundColor,
            ratio: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100
        });
    });
    return out;
});
ok(rows.length === BOARDS.length, `в менюто са всичките ${BOARDS.length} пробни борда`, rows.map(r => r.id));
const weak = rows.filter(r => r.missing || !(r.ratio >= 4.5));
ok(weak.length === 0, 'всеки бутон има контраст поне 4.5:1 между текста и фона си', weak);

const byId = Object.fromEntries(rows.map(r => [r.id, r]));
ok(byId.mb1 && /255,\s*255,\s*255/.test(byId.mb1.color), 'тъмният борд с черен шрифт мина на БЯЛ текст', byId.mb1);
ok(byId.mb2 && /0,\s*0,\s*0/.test(byId.mb2.color), 'жълтият борд остава с ЧЕРЕН текст', byId.mb2);
ok(byId.mb3 && /255,\s*255,\s*255/.test(byId.mb3.color), 'синият борд (тема 6) мина на бял текст', byId.mb3);
ok(byId.mb4 && /255,\s*255,\s*255/.test(byId.mb4.color), 'бордът, който сам иска бял текст, го запазва', byId.mb4);
ok(byId.mb5 && byId.mb5.ratio >= 4.5, 'изтритият борд (червен текст по подразбиране) също се чете', byId.mb5);
{
    // Червеното трябва да остане червено (изсветлено), а не да стане бяло — иначе „изтрит“ се губи.
    const m = String((byId.mb5 || {}).color || '').match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    const r = m ? +m[1] : 0, g = m ? +m[2] : 0, b = m ? +m[3] : 0;
    ok(m && r > g + 60 && r > b + 60, 'изтритият борд остава ЧЕРВЕН, само изсветлен, за да се чете', byId.mb5);
}

ok(errs.length === 0, 'няма изключения в конзолата на страницата', errs.slice(0, 3));

if (process.env.SHOT) {
    await page.screenshot({ path: process.env.SHOT });
    console.log(`     (снимка: ${process.env.SHOT})`);
}

await browser.close();
srv.close();
console.log(fails ? `FAILED (${fails} от ${n})` : `OK (${n} проверки)`);
process.exit(fails ? 1 : 0);
