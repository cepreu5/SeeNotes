// Отварянето на календара да затваря отворените бележки.
//
// Симптомът на собственика: „Все още отворените бележки не се затварят когато се отвори
// календара". Прозорците на бележките живеят в #note-windows-layer (z-index 1000) над всичко,
// а renderCalendarView / renderWeeklyCalendarView не пипат нито един от тях — затова остават
// да плават върху календара, заедно с лентата на отворените бележки.
//
// Какво проверява (истински Chromium, истинският uni код, засята IndexedDB, ?demo=1, мобилен
// контекст с докосване 390x844):
//   1) две отворени бележки и лентата на отворените бележки се виждат преди календара;
//   2) след клик на календара НЯМА нито един видим прозорец на бележка и лентата я няма;
//   3) календарът е на екрана;
//   4) същото за седмичния изглед;
//   5) бележка с незаписани промени: въпросът излиза, „Отказ" ОСТАВЯ бележката и календарът не
//      се отваря, а „Запази" затваря бележката и календарът се отваря.
//
// Пускане от корена на хранилището: node .bolter/check/calendar-closes-notes.mjs   (exit 1 при провал)
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
const PAGE = process.env.UNI_PAGE || 'index.html';
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
        localStorage.setItem('hideAssistant', 'true');
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

// Видимо състояние на екрана: прозорци на бележки, лента на отворените бележки, календар.
const screenState = (page) => page.evaluate(() => {
    const vis = el => {
        if (!el) return false;
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || Number(st.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
    };
    const wins = [...document.querySelectorAll('.note-window')];
    const bar = document.getElementById('open-notes-bar') || document.querySelector('.open-notes-bar');
    const cal = document.getElementById('calendar-container');
    const week = document.getElementById('weekly-calendar-container');
    return {
        windows: wins.length,
        visibleWindows: wins.filter(vis).length,
        openWindows: wins.filter(w => w.classList.contains('visible')).length,
        bar: !!bar && vis(bar),
        calendar: !!cal && vis(cal),
        weekly: !!week && vis(week),
        header: vis(document.querySelector('header'))
    };
});

const openTwoNotes = async (page) => {
    const cards = page.locator('#notes-container .note');
    await cards.nth(0).click();
    await page.waitForTimeout(700);
    await cards.nth(1).click();
    await page.waitForTimeout(900);
    return page.evaluate(() => document.querySelectorAll('.note-window.visible').length);
};

// ---------------------------------------------------------------- 1) месечен изглед
{
    const { ctx, page, errs, seed, ready } = await newPage();
    ok(seed.boards === 6 && seed.notes === NOTES_TOTAL, '1: базата е засята преди старта (6 борда, 12 бележки)', seed);
    ok(ready, '1: приложението стартира с бележки на екрана');

    const opened = await openTwoNotes(page);
    const before = await screenState(page);
    ok(opened === 2 && before.visibleWindows === 2, '1: две бележки са отворени преди календара', before);
    ok(before.bar, '1: лентата на отворените бележки се вижда', before);

    await page.click('#calendar_button');
    await page.waitForTimeout(1200);
    const after = await screenState(page);
    ok(after.visibleWindows === 0, '1: след отваряне на календара няма видим прозорец на бележка', after);
    ok(after.openWindows === 0, '1: няма и отворена (скрита) бележка — всички са затворени', after);
    ok(after.calendar, '1: календарът е на екрана', after);
    ok(!after.bar, '1: лентата на отворените бележки я няма', after);
    ok(errs.length === 0, '1: няма изключения в конзолата', errs.slice(0, 3));

    // Снимка за човешко око: календарът без бележки отгоре.
    await page.screenshot({ path: path.join('.bolter/check', 'calendar-closes-notes-390.png') });
    await ctx.close();
}

// ---------------------------------------------------------------- 2) седмичен изглед
{
    const { ctx, page, errs, ready } = await newPage();
    ok(ready, '2: приложението стартира с бележки на екрана');
    const opened = await openTwoNotes(page);
    ok(opened === 2, '2: две бележки са отворени преди седмичния изглед');
    await page.evaluate(() => { if (window.filterNotesByBoard) return window.filterNotesByBoard('calendar_weekly'); });
    await page.waitForTimeout(1200);
    const after = await screenState(page);
    ok(after.visibleWindows === 0 && after.openWindows === 0, '2: седмичният изглед също затваря бележките', after);
    ok(after.weekly, '2: седмичният изглед е на екрана', after);
    ok(!after.bar, '2: лентата на отворените бележки я няма', after);
    ok(errs.length === 0, '2: няма изключения в консолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------------------------------------------------------------- 3) незаписани промени
{
    const { ctx, page, errs, ready } = await newPage();
    ok(ready, '3: приложението стартира с бележки на екрана');

    // Една бележка, вкарана в режим Редактиране с променен текст: getNoteUnsavedKind() става 'ui'.
    await page.locator('#notes-container .note').nth(0).click();
    await page.waitForTimeout(800);
    const dirtied = await page.evaluate(async () => {
        const win = document.querySelector('.note-window.visible');
        if (!win) return 'няма прозорец';
        const editBtn = win.querySelector('.note-edit-btn, [data-action="edit"], #note-edit-btn');
        if (editBtn) editBtn.click();
        await new Promise(r => setTimeout(r, 500));
        const area = win.querySelector('textarea, [contenteditable="true"]');
        if (!area) return 'няма поле за писане';
        area.focus();
        if (area.tagName === 'TEXTAREA') {
            area.value += ' промяна';
            area.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            area.textContent += ' промяна';
            area.dispatchEvent(new Event('input', { bubbles: true }));
        }
        await new Promise(r => setTimeout(r, 300));
        return 'ok';
    });
    ok(dirtied === 'ok', '3: бележката е в режим Редактиране с променен текст', dirtied);

    // Отказ: календарът не се отваря, бележката остава.
    // Извикваме пътя на календара направо (без физическо натискане), защото отворената бележка
    // застъпва хедъра и поеме клика — тук се проверява решението, не хедърът.
    await page.evaluate(() => { window.filterNotesByBoard('calendar'); });
    await page.waitForTimeout(900);
    const dialogShown = await page.evaluate(() => document.getElementById('folderIdPromptPopup').classList.contains('show'));
    ok(dialogShown, '3: при незаписани промени излиза въпросът');
    await page.evaluate(() => document.getElementById('prompt-cancel-btn').click());
    await page.waitForTimeout(900);
    const afterCancel = await screenState(page);
    ok(afterCancel.visibleWindows === 1, '3: след „Отказ“ бележката остава отворена', afterCancel);
    ok(!afterCancel.calendar && !afterCancel.weekly, '3: след „Отказ“ календарът не се отваря', afterCancel);

    // Запази: бележката се затваря, календарът се отваря.
    await page.evaluate(() => { window.filterNotesByBoard('calendar'); });
    await page.waitForTimeout(900);
    const dialog2 = await page.evaluate(() => document.getElementById('folderIdPromptPopup').classList.contains('show'));
    ok(dialog2, '3: въпросът излиза и втори път');
    await page.evaluate(() => document.getElementById('submitFolderIdBtn').click());
    await page.waitForTimeout(2000);
    const afterSave = await screenState(page);
    ok(afterSave.visibleWindows === 0 && afterSave.openWindows === 0, '3: след „Запази“ бележката се затваря', afterSave);
    ok(afterSave.calendar || afterSave.weekly, '3: след „Запази“ календарът е на екрана', afterSave);
    ok(errs.length === 0, '3: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

await browser.close();
srv.close();
console.log(fails ? `FAILED ${fails}/${n}` : `OK ${n}/${n}`);
process.exit(fails ? 1 : 0);
