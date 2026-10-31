// Иконата на асистента при разпъната бележка: да стои НАД реда с бутоните ѝ — и когато лентата на
// отворените бележки е на екрана, и когато я няма.
//
// Собственик (31.10.2026): „когато expand-нем бележка бутона на асистента не се мести над бутоните й
// във футъра и ги покрива - това трябва да става и в двата случая - когато има и когато няма лента с
// бутони на бележките отдолу на екрана.“
//
// Причината: expandedFabLiftNeeded() връщаше false, докато лентата е видима (в b2.74 двете отмествания
// се събираха). Но лентата вдига иконата само над СЕБЕ СИ, а разпънатата бележка свършва точно над
// лентата - значи редът с бутоните ѝ е на същото място и без отстъп иконата ляга върху него.
//
// Какво проверява (истински Chromium, истинският uni код, засята IndexedDB, ?demo=1, мобилен контекст
// с докосване 390x844):
//   1) една бележка, разпъната, без лента: иконата е над реда с бутоните (без застъпване);
//   2) две бележки, лентата се вижда, разпъната отпред: иконата пак е над реда с бутоните;
//   3) две бележки, лентата се вижда, НЕразпъната: иконата е над лентата и остава на мястото си
//      (без излишен отстъп - нищо не се е вдигнало двойно);
//   4) разпъната бележка, но иконата е преместена от собственика (инлайн top): отстъп не се дава.
//
// Пускане от корена на хранилището: node .bolter/check/assistant-above-note-footer.mjs  (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (за да се провери, че тестът хваща липсващата поправка).
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
const PAGE = 'index.html';
const SEED_PATH = '/__seed.html';
const W = 390, H = 844;
const NOTES_TOTAL = 12;

if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}

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

const browser = await chromium.launch({ executablePath: CHROME });

const seedApp = (page) => page.evaluate(async () => {
    const dbName = 'NotesDB-demo';
    const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null, files: { keyPath: 'key' } };
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
    const boards = [], notes = [];
    for (let i = 1; i <= 6; i++) {
        boards.push({ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b' + i, id: i, numord: i, status: 0, title: 'Board ' + i });
    }
    let k = 0;
    for (const b of boards) {
        for (let j = 1; j <= 2; j++) {
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
    return { boards: boards.length, notes: notes.length };
});

const newPage = async () => {
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        serviceWorkers: 'block'
    });
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
        // Иконата на асистента трябва да е на екрана - иначе няма какво да се мери.
        localStorage.setItem('hideAssistant', 'false');
        localStorage.setItem('showBoardAll', 'true');
        localStorage.setItem('startBoard', 'all');
        localStorage.setItem('showWeeklyCalendar', 'false');
    });
    await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
    const seed = await seedApp(page);
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        && document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    return { ctx, page, errs, seed, ready };
};

// Отваря бележка по id (картите се пренареждат след отваряне - затова се търси по data-i).
const openNote = async (page, id) => {
    await page.evaluate((id) => {
        const card = document.querySelector(`#notes-container .note[data-i="${id}"]`);
        if (card) card.click();
    }, id);
    await page.waitForTimeout(900);
};

// Разпъва бележката, която е отпред (последният видим прозорец).
const expandFrontNote = async (page) => {
    await page.evaluate(() => {
        const wins = [...document.querySelectorAll('.note-window')].filter(w => w.classList.contains('visible'));
        const win = wins[wins.length - 1];
        const btn = win && win.querySelector('#modal-expand-btn');
        if (btn) btn.click();
    });
    await page.waitForTimeout(900);
};

const measure = (page) => page.evaluate(() => {
    const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) }; };
    const shown = el => {
        if (!el) return false;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    };
    const fab = document.getElementById('kb-fab');
    const wins = [...document.querySelectorAll('.note-window')].filter(w => w.classList.contains('visible') && shown(w));
    const win = wins[wins.length - 1] || null;
    const toolbar = win ? win.querySelector('.modal-footer-toolbar') : null;
    const bar = document.getElementById('open-notes-bar');
    const f = R(fab), t = R(toolbar), b = R(bar);
    const over = (a, c) => (!a || !c) ? 0 : Math.max(0, Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top));
    return {
        fabShown: shown(fab), fab: f, toolbar: t, barRect: b,
        overlapToolbar: over(f, t),
        overlapBar: over(f, b),
        gapToToolbar: (f && t) ? t.top - f.bottom : null,
        barVisible: !!bar && bar.classList.contains('is-visible') && shown(bar),
        barHeightVar: getComputedStyle(document.documentElement).getPropertyValue('--open-notes-bar-h').trim(),
        expanded: document.body.classList.contains('modal-note-expanded'),
        liftClass: document.body.classList.contains('modal-note-expanded-fab-lift'),
        translate: fab ? getComputedStyle(fab).translate : null,
        visibleWindows: wins.length
    };
});

// ---------------------------------------------------------------- 1) една бележка, без лента
{
    const { ctx, page, errs, seed, ready } = await newPage();
    ok(seed.notes === NOTES_TOTAL, '1: базата е засята преди старта (12 бележки)', seed);
    ok(ready, '1: приложението стартира с бележки на екрана');
    await openNote(page, '1001');
    await expandFrontNote(page);
    const m = await measure(page);
    ok(m.fabShown, '1: иконата на асистента е на екрана', m);
    ok(m.expanded, '1: бележката е разпъната', m);
    ok(!m.barVisible, '1: лентата на отворените бележки я няма (една бележка)', m);
    ok(m.overlapToolbar === 0, '1: иконата не застъпва реда с бутоните на бележката', m);
    ok(m.fab.bottom <= m.toolbar.top, '1: иконата стои изцяло над реда с бутоните', { fab: m.fab, toolbar: m.toolbar });
    ok(errs.length === 0, '1: няма изключения в конзолата', errs.slice(0, 3));
    await page.screenshot({ path: path.join('.bolter/check', 'assistant-above-footer-one.png') });
    await ctx.close();
}

// ---------------------------------------------------------------- 2) две бележки, с лента
{
    const { ctx, page, errs, ready } = await newPage();
    ok(ready, '2: приложението стартира с бележки на екрана');
    await openNote(page, '1001');
    await openNote(page, '1002');
    const before = await measure(page);
    ok(before.visibleWindows === 2, '2: две бележки са отворени', before);
    ok(before.barVisible, '2: лентата на отворените бележки се вижда', before);
    ok(parseInt(before.barHeightVar, 10) > 0, '2: височината на лентата е измерена във --open-notes-bar-h', before);
    await expandFrontNote(page);
    const m = await measure(page);
    ok(m.expanded, '2: бележката е разпъната', m);
    ok(m.barVisible, '2: лентата е още на екрана', m);
    ok(m.overlapToolbar === 0, '2: иконата не застъпва реда с бутоните на бележката (с лента)', m);
    ok(m.fab.bottom <= m.toolbar.top, '2: иконата стои изцяло над реда с бутоните (с лента)', { fab: m.fab, toolbar: m.toolbar });
    ok(m.fab.bottom <= m.barRect.top, '2: иконата е и над лентата, не само над бутоните', { fab: m.fab, bar: m.barRect });
    ok(m.fab.bottom > 0 && m.fab.top >= 0, '2: иконата остава в екрана', m.fab);
    // Същата пролука като без лента - иначе отстъпът е друг, не същият случай.
    ok(m.gapToToolbar >= 8, '2: има видима пролука до бутоните (поне 8px)', m.gapToToolbar);
    ok(errs.length === 0, '2: няма изключения в конзолата', errs.slice(0, 3));
    await page.screenshot({ path: path.join('.bolter/check', 'assistant-above-footer-two-expanded.png') });
    await ctx.close();
}

// ---------------------------------------------------------------- 3) две бележки, НЕразпъната
{
    const { ctx, page, errs, ready } = await newPage();
    ok(ready, '3: приложението стартира с бележки на екрана');
    await openNote(page, '1001');
    await openNote(page, '1002');
    const m = await measure(page);
    ok(m.barVisible, '3: лентата се вижда', m);
    ok(!m.expanded, '3: няма разпъната бележка', m);
    ok(!m.liftClass, '3: отстъпът за разпъната бележка не се дава', m);
    ok(m.translate === 'none', '3: иконата не е отместена с translate', m);
    ok(m.overlapBar === 0 && m.fab.bottom <= m.barRect.top, '3: иконата стои над лентата', { fab: m.fab, bar: m.barRect });
    ok(errs.length === 0, '3: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------------------------------------------------------------- 4) иконата е преместена от собственика
{
    const { ctx, page, errs, ready } = await newPage();
    ok(ready, '4: приложението стартира с бележки на екрана');
    await openNote(page, '1001');
    // Собственикът е плъзнал иконата другаде: инлайн top, без bottom.
    await page.evaluate(() => {
        const fab = document.getElementById('kb-fab');
        fab.style.setProperty('top', '200px', 'important');
        fab.style.setProperty('bottom', 'auto', 'important');
    });
    await expandFrontNote(page);
    const m = await measure(page);
    ok(m.expanded, '4: бележката е разпъната', m);
    ok(!m.liftClass, '4: преместена икона не получава отстъп', m);
    ok(m.translate === 'none', '4: иконата остава където я е оставил собственикът', m);
    ok(m.fab.top === 200, '4: иконата е точно на зададеното място', m.fab);
    ok(errs.length === 0, '4: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

await browser.close();
srv.close();
console.log(fails === 0 ? `ALL OK (${n} проверки)` : `FAILED (${fails} от ${n})`);
process.exit(fails === 0 ? 0 : 1);
