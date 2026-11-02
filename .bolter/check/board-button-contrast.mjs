// Бутоните на бордовете в uni: текстът се чете върху цвета на борда — жив браузър.
// Искане на собственика (2 Nov 2026): тъмен борд с черен шрифт не се чете.
//
// Какво проверява (истински Chromium, истинският uni код, засята IndexedDB, ?demo=1, 390x844):
//   1) за всеки борд се взимат РЕАЛНИТЕ изчислени цветове на текста и на фона на бутона в менюто;
//   2) контрастът между тях е поне 4.5:1 (WCAG AA за обикновен текст) за всеки борд поотделно;
//   3) тъмните бордове минават на бял текст, а светлите остават с черен;
//   4) когато бордът сам иска бял текст, той се запазва;
//   5) изтрит борд (status 1, червен текст) също се чете;
//   6) на широк екран (1280) същото важи и в попъпа „Нареди бордовете“.
//
// Пускане от корена на хранилището: node .bolter/check/board-button-contrast.mjs   (exit 1 при провал)
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

// Бордовете, с които се проверява: тъмни, светли, от темата и такъв, който сам иска бял текст.
const BOARDS = [
    { gdid: 'b-dark', id: 11, color: '#2F3B4A', colorfont: 0, title: 'ТЪМЕН' },
    { gdid: 'b-black', id: 12, color: '#1A1A1A', colorfont: '#000000', title: 'ЧЕРЕН' },
    { gdid: 'b-yellow', id: 13, color: 3, colorfont: 0, title: 'ЖЪЛТ' },
    { gdid: 'b-blue', id: 14, color: 6, colorfont: 0, title: 'СИН' },
    { gdid: 'b-white', id: 15, color: '#FFFFFF', colorfont: 0, title: 'БЯЛ' },
    { gdid: 'b-darkwhite', id: 16, color: '#2F3B4A', colorfont: 1, title: 'ТЪМЕН БЯЛ' },
    { gdid: 'b-deleted', id: 17, color: '#2F3B4A', colorfont: 0, status: 1, title: 'ИЗТРИТ' }
];

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
    localStorage.setItem('showBoardAll', 'false');
    localStorage.setItem('showBoardNoteCount', 'false');
    localStorage.setItem('showBoardRemind', 'false');
    localStorage.setItem('showTrashBoard', 'false');
    localStorage.setItem('showExpiredBoard', 'false');
    localStorage.setItem('startBoard', 'b-dark');
});

// --- Засяване на базата преди старта ---------------------------------------------------------
await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
const seed = await page.evaluate(async ({ dbName, boards }) => {
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
        const rows = boards.map((b, i) => ({
            backcolor: 0, backnum: 0, backpath: '', color: b.color, colorfont: b.colorfont,
            datemod: now, gdid: b.gdid, id: b.id, numord: i + 1, status: b.status || 0, title: b.title
        }));
        const note = {
            alarm_type: -1, boardid: 'b-dark', calendarDate: 0, color: 0,
            date: now, datemod: now, eventId: 0, gdid: 'Note1', id: 1001,
            notetxt: 'БЕЛЕЖКА|Тяло', numord: 1, pass: false, sellist: 0, status: 0,
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
    } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
    return out;
}, { dbName: DB_NAME, boards: BOARDS.map(b => ({ ...b })) });
ok(!seed.err && seed.seeded === BOARDS.length, `базата е засята: ${BOARDS.length} борда с различни цветове`, seed);
if (fails) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

// --- Старт --------------------------------------------------------------------------------
await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
    && document.querySelectorAll('header .board-menu-container .board-filter-link').length > 0, null, { timeout: 30000 })
    .then(() => true, () => false);
ok(ready, 'приложението се вдигна и менюто с бордове е нарисувано');
if (!ready) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

// Измерва РЕАЛНИТЕ цветове от страницата и смята контраста по WCAG.
const measure = (scopeSelector) => page.evaluate((sel) => {
    const lum = (rgb) => {
        const ch = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        return 0.2126 * ch(rgb[0]) + 0.7152 * ch(rgb[1]) + 0.0722 * ch(rgb[2]);
    };
    const parse = (css) => {
        const m = String(css).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/i);
        if (!m) return null;
        return { rgb: [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3])], alpha: m[4] === undefined ? 1 : Number(m[4]) };
    };
    const rows = [];
    document.querySelectorAll(sel).forEach(el => {
        const cs = getComputedStyle(el);
        const bg = parse(cs.backgroundColor);
        const fg = parse(cs.color);
        if (!fg || !bg || bg.alpha === 0) return;
        const l1 = lum(fg.rgb), l2 = lum(bg.rgb);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        rows.push({
            id: String(el.dataset.boardid || ''), title: (el.textContent || '').trim().slice(0, 20),
            color: cs.color, background: cs.backgroundColor, ratio: Math.round(ratio * 100) / 100
        });
    });
    return rows;
}, scopeSelector);

// --- 1) Менюто с бордове: всеки бутон се чете ---------------------------------------------
await page.evaluate(() => {
    document.querySelectorAll('.guide-container, .speech-bubble, .guide-img').forEach(el => el.remove());
});
const rows = await measure('header .board-menu-container .board-filter-link[data-boardid^="b-"]');
ok(rows.length === BOARDS.length, `в менюто са всичките ${BOARDS.length} пробни борда`, rows.map(r => r.id));
const weak = rows.filter(r => !(r.ratio >= 4.5));
ok(weak.length === 0, 'всеки бутон има контраст поне 4.5:1 между текста и фона си', weak);

const byId = Object.fromEntries(rows.map(r => [r.id, r]));
ok(byId['b-dark'] && /255,\s*255,\s*255/.test(byId['b-dark'].color), 'тъмният борд с черен шрифт мина на БЯЛ текст', byId['b-dark']);
ok(byId['b-black'] && /255,\s*255,\s*255/.test(byId['b-black'].color), 'черният борд също е с бял текст', byId['b-black']);
ok(byId['b-yellow'] && /0,\s*0,\s*0/.test(byId['b-yellow'].color), 'жълтият борд остава с ЧЕРЕН текст (така се чете най-добре)', byId['b-yellow']);
ok(byId['b-white'] && /0,\s*0,\s*0/.test(byId['b-white'].color), 'белият борд остава с черен текст', byId['b-white']);
ok(byId['b-darkwhite'] && /255,\s*255,\s*255/.test(byId['b-darkwhite'].color), 'бордът, който сам иска бял текст, го запазва', byId['b-darkwhite']);
ok(byId['b-deleted'] && byId['b-deleted'].ratio >= 4.5, 'изтритият борд (червен текст по подразбиране) също се чете', byId['b-deleted']);
{
    // Червеното трябва да остане червено (изсветлено), а не да стане бяло — иначе „изтрит“ се губи.
    const m = String((byId['b-deleted'] || {}).color || '').match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    const r = m ? +m[1] : 0, g = m ? +m[2] : 0, b = m ? +m[3] : 0;
    ok(m && r > g + 60 && r > b + 60, 'изтритият борд остава ЧЕРВЕН, само изсветлен, за да се чете', byId['b-deleted']);
}

// --- 2) Същото правило и в попъпа „Нареди бордовете" (широк екран) -------------------------
const popupOpened = await page.evaluate(() => {
    try { showBoardReorderPopup(); } catch (e) { return false; }
    return !!document.querySelector('.reorder-overlay .reorder-item');
});
ok(popupOpened, 'попъпът „Нареди бордовете“ се отваря');
if (popupOpened) {
    const popupRows = await page.evaluate((titles) => {
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
        document.querySelectorAll('.reorder-overlay .reorder-item').forEach(item => {
            const span = item.querySelector('span') || item;
            const title = (span.textContent || '').trim();
            if (!titles.includes(title)) return; // само нашите пробни бордове, не системните плочки
            const bg = parse(getComputedStyle(item).backgroundColor);
            const fg = parse(getComputedStyle(span).color);
            if (!bg || bg.alpha === 0 || !fg) { out.push({ title, missing: true }); return; }
            const l1 = lum(fg.rgb), l2 = lum(bg.rgb);
            out.push({
                title, color: getComputedStyle(span).color, background: getComputedStyle(item).backgroundColor,
                ratio: Math.round(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)) * 100) / 100
            });
        });
        return out;
    }, BOARDS.map(b => b.title));
    ok(popupRows.length === BOARDS.length, `в попъпа са всичките ${BOARDS.length} пробни борда`, popupRows.map(r => r.title));
    const weakPopup = popupRows.filter(r => r.missing || !(r.ratio >= 4.5));
    ok(weakPopup.length === 0, 'всеки ред в попъпа също се чете (поне 4.5:1)', weakPopup);
    await page.evaluate(() => { const o = document.querySelector('.reorder-overlay'); if (o) o.remove(); });
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
