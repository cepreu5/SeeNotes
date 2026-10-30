// Броячът в хедъра показва броя на СТАРТОВИЯ борд (uni / CX Notes) — жив браузър (Playwright + Chromium).
// Какво доказва: при зададена стартова папка (localStorage.startBoard = gdid на борд) хедърът
// #note-counter показва броя на бележките в ТОЗИ борд още при първото зареждане, а не общия брой
// на всички бележки, и остава правилен и секунда и половина по-късно (без презапис след зареждането).
// Същата регресия като в MNV: „броячът показва 530, а в папката има 5, едва след клик на бутона на
// папката се показва правилният брой“. Тук се проверява uni, с неговия си код.
//
// Приложението се вдига по СВОЯ СИ път, без Google:
//   1) демо режимът на uni (?demo=1) дава собствена база NotesDB-demo и офлайн път без логин;
//   2) базата се засива ПРЕДИ зареждането на страницата (от същия произход, през /__seed.html),
//      затова demото не слага своите примерни данни (то пипа само празна база);
//   3) след това страницата се зарежда нормално: prepareDemoMode() → startApp() → mainLogic() →
//      fetchAllDataLocal() → renderUI() → applyFilters() → populateStartBoardSelect() → showAppUI().
// Точно това вижда човекът при първо зареждане. Кликовете по бордовете са с истинска мишка.
//
// Пускане от корена на хранилището: node .bolter/check/start-board-counter-uni.mjs   (exit 1 при провал)
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
const PAGE = process.env.UNI_PAGE || 'index.html'; // истинската страница на приложението
if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}
const DB_NAME = process.env.UNI_DB || 'NotesDB-demo'; // демото на uni работи в собствена база
const SEED_PATH = '/__seed.html';

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // Празна страница от същия произход: от нея се засива IndexedDB преди старта на приложението.
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
const PORT = srv.address().port;
const ORIGIN = `http://localhost:${PORT}`;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

// --- Засят: 2 борда; „Bolter“ има 5 бележки, „Main“ – 25, значи общо 30 (общо ≠ стартовия борд) ---
const START_BOARD = 'b5';       // стартовата папка
const START_BOARD_TITLE = 'Bolter';
const START_COUNT = 5;          // бележки в нея
const MAIN_BOARD = 'b1';
const MAIN_BOARD_TITLE = 'Main';
const MAIN_COUNT = 25;
const TOTAL_COUNT = START_COUNT + MAIN_COUNT;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
// Всичко извън localhost се отбива: до Drive / Google не се стига.
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.addInitScript(({ startBoard }) => {
    // Отбитите външни скриптове не носят своите обекти: даваме ги тук, за да не остане
    // страницата с грешки, които нямат нищо общо с проверката.
    const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
    window.google = {
        accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 },
        oauth2
    };
    window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
    window.kofiWidgetOverlay = { draw() { } };
    window.kofiwidget2 = { init() { }, draw() { } };
    // Локална база, без Google: приложението не бива да ходи до Drive.
    localStorage.setItem('useIndexedDb', 'true');
    localStorage.setItem('useGoogleDb', 'false');
    localStorage.setItem('useLocalDb', 'false');
    localStorage.setItem('useLocalFolder', 'false');
    localStorage.setItem('useArhDb', 'false');
    localStorage.setItem('updateFromSource', 'false'); // няма от какво да синхронизира
    localStorage.setItem('language', 'bg');
    // ТОВА е стартовата папка от доклада: gdid на борд „Bolter“.
    localStorage.setItem('startBoard', startBoard);
    // Промо бележката на асистента не участва в броя, но тегли картинка — изключваме я.
    localStorage.setItem('hideAssistant', 'true');

    // --- Инструментиране на брояча -----------------------------------------------------------
    // Хедърът е скрит с CSS, докато body няма клас 'app-ready' (index.html), значи точно
    // стойността в този момент е първото, което човекът вижда. Записваме я, преди която и да е
    // по-късна поправка (uni цъка сам стартовия борд 50 ms след renderUI) да я е замаскирала.
    window.__axiCounterAtReady = undefined;
    window.__axiCounterLog = [];
    const readCounterText = () => {
        const el = document.getElementById('note-counter');
        return el ? String(el.textContent) : null;
    };
    const recordCounter = () => {
        const v = readCounterText();
        const log = window.__axiCounterLog;
        const last = log[log.length - 1];
        if (last && last.v === v) return;
        log.push({ v, t: Math.round(performance.now()), ready: document.body ? document.body.classList.contains('app-ready') : false });
    };
    const watchReady = () => {
        const body = document.body;
        if (!body) return;
        const seen = () => {
            if (!body.classList.contains('app-ready')) return false;
            if (window.__axiCounterAtReady === undefined) window.__axiCounterAtReady = readCounterText();
            return true;
        };
        if (seen()) return;
        const ro = new MutationObserver(() => { if (seen()) ro.disconnect(); });
        ro.observe(body, { attributes: true, attributeFilter: ['class'] });
    };
    const startInstrumentation = () => {
        recordCounter();
        const mo = new MutationObserver(recordCounter);
        mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
        watchReady();
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startInstrumentation, { once: true });
    } else {
        startInstrumentation();
    }
}, { startBoard: START_BOARD });

// --- 1) Засяване на базата ПРЕДИ старта на приложението (същият произход, празна страница) ---------
await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
const seed = await page.evaluate(async ({ dbName, startBoard, mainBoard, startCount, mainCount, startTitle, mainTitle }) => {
    const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null, files: { keyPath: 'key' } };
    const out = { err: '', dropped: '' };
    try {
        await new Promise((res) => { const d = indexedDB.deleteDatabase(dbName); d.onsuccess = d.onerror = d.onblocked = () => res(); setTimeout(res, 3000); });
        const db = await new Promise((res, rej) => {
            const req = indexedDB.open(dbName, 4); // версията, която uni отваря (NOTES_DB_VERSION = 4)
            req.onupgradeneeded = () => {
                const d = req.result;
                for (const [name, opt] of Object.entries(STORES)) {
                    if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, opt || undefined);
                }
            };
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        const now = Date.now();
        const boards = [
            { backcolor: 0, backnum: 0, backpath: '', color: '#4CAF50', colorfont: '#000', datemod: now, gdid: mainBoard, id: 1, numord: 1, status: 0, title: mainTitle },
            { backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: startBoard, id: 2, numord: 2, status: 0, title: startTitle }
        ];
        const makeNote = (boardid, i, tag, idBase) => ({
            alarm_type: -1, boardid, calendarDate: 0, color: 0,
            date: now - i * 1000, datemod: now - i * 1000, eventId: 0,
            gdid: `${tag}Note${String(i).padStart(18, '0')}`, id: idBase + i,
            notetxt: `Бележка ${tag}${i}|Тялото на бележката ${tag}${i}`,
            numord: i, pass: false, sellist: 0, status: 0,
            text_span: '', timer: 0, timer_type: -1, timer_val: 1,
            title_span: '', type: 0, version: 243
        });
        const notes = [];
        for (let i = 1; i <= mainCount; i++) notes.push(makeNote(mainBoard, i, 'A', 1000));
        for (let i = 1; i <= startCount; i++) notes.push(makeNote(startBoard, i, 'B', 2000));

        await new Promise((res, rej) => {
            const tx = db.transaction(['boards', 'notes', 'media', 'config'], 'readwrite');
            tx.oncomplete = res;
            tx.onerror = () => rej(tx.error);
            tx.objectStore('boards').clear();
            tx.objectStore('notes').clear();
            tx.objectStore('media').clear();
            tx.objectStore('config').clear();
            boards.forEach(b => tx.objectStore('boards').put(b));
            notes.forEach(x => tx.objectStore('notes').put(x));
            // Същата конфигурация като в доклада: източник 1 (Google Drive база), ID по gdid.
            tx.objectStore('config').put(1, 'dbSource');
            tx.objectStore('config').put('gdid', 'dbNoteIdType');
            tx.objectStore('config').put(now, 'dbCreatedTimestamp');
            tx.objectStore('config').put(now, 'lastLocalTimestamp');
        });
        db.close();
        out.seeded = { boards: boards.length, notes: notes.length };
    } catch (e) {
        out.err = String((e && e.message) || e).slice(0, 300);
    }
    return out;
}, { dbName: DB_NAME, startBoard: START_BOARD, mainBoard: MAIN_BOARD, startCount: START_COUNT, mainCount: MAIN_COUNT, startTitle: START_BOARD_TITLE, mainTitle: MAIN_BOARD_TITLE });
ok(!seed.err && seed.seeded && seed.seeded.boards === 2 && seed.seeded.notes === TOTAL_COUNT,
    `базата е засята преди старта: 2 борда и ${TOTAL_COUNT} бележки (${START_COUNT} в ${START_BOARD_TITLE} + ${MAIN_COUNT} в ${MAIN_BOARD_TITLE})`,
    seed);
if (fails) {
    await browser.close(); srv.close();
    console.log('FAILED');
    process.exit(1);
}

// --- 2) Първо зареждане на ИСТИНСКОТО приложение (демо режим: без Google, без логин страница) ------
await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
const booted = await page.waitForFunction(() => typeof startApp === 'function'
    && typeof renderUI === 'function' && typeof applyFilters === 'function'
    && typeof filterNotesByBoard === 'function' && typeof allNotesData !== 'undefined', null, { timeout: 30000 })
    .then(() => true, () => false);
ok(booted, 'страницата на приложението се зареди (startApp, renderUI, applyFilters, filterNotesByBoard)');
const ready = booted && await page.waitForFunction((total) => document.body.classList.contains('app-ready')
    && typeof allNotesData !== 'undefined' && allNotesData.length === total
    && document.querySelectorAll('#notes-container .note').length > 0, TOTAL_COUNT, { timeout: 30000 })
    .then(() => true, () => false);
const state = await page.evaluate(() => ({
    demo: !!window.__cxDemoMode,
    boards: typeof boardsData === 'undefined' ? null : boardsData.length,
    notes: typeof allNotesData === 'undefined' ? null : allNotesData.length,
    currentBoardFilter: typeof currentBoardFilter === 'undefined' ? null : currentBoardFilter,
    cards: document.querySelectorAll('#notes-container .note').length
}));
ok(ready && state.demo === true, 'приложението се вдигна само от засятата база, в демо/офлайн пътя (без Google)', state);
ok(state.boards === 2 && state.notes === TOTAL_COUNT,
    `от базата са заредени 2 борда и ${TOTAL_COUNT} бележки (${START_COUNT} в ${START_BOARD_TITLE} + ${MAIN_COUNT} в ${MAIN_BOARD_TITLE})`, state);
ok(String(state.currentBoardFilter) === START_BOARD,
    `стартовата папка е приложена още в началото (currentBoardFilter = ${START_BOARD})`, state);
if (!ready) {
    await browser.close(); srv.close();
    console.log('FAILED');
    process.exit(1);
}

// --- Помощни: чакане на стабилен брояч и броене на РЕАЛНИТЕ карти в DOM ---------------------------
const readCounter = () => page.evaluate(() => (document.getElementById('note-counter') || {}).textContent ?? '');
const readCards = (boardId) => page.evaluate((id) => {
    const cont = document.getElementById('notes-container');
    if (!cont) return { all: 0, mine: 0, visible: 0, counter: null };
    const all = [...cont.querySelectorAll('.note')]
        .filter(x => !x.classList.contains('promo-note') && !x.classList.contains('boards-note'));
    const mine = all.filter(x => String(x.dataset.b) === String(id));
    const visible = mine.filter(x => getComputedStyle(x).display !== 'none');
    return {
        all: all.length, mine: mine.length, visible: visible.length,
        counter: (document.getElementById('note-counter') || {}).textContent
    };
}, boardId);
// Чакаме броячът да спре да се мени (иначе хващаме междинна стойност от зареждането).
const stableCounter = async (ms = 10000) => {
    const deadline = Date.now() + ms;
    let last = null, same = 0;
    while (Date.now() < deadline) {
        const t = await readCounter();
        if (t === last) same++; else { last = t; same = 0; }
        if (same >= 3) return t;
        await page.waitForTimeout(80);
    }
    return last;
};

// --- 3) Първо зареждане: броячът = бележките на стартовия борд, не общият брой ---------------------
const menuOk = await page.waitForSelector(`.board-menu-container .board-filter-link[data-boardid="${START_BOARD}"]`, { timeout: 15000 })
    .then(() => true, () => false);
ok(menuOk, `менюто с бордове е готово (има бутон за „${START_BOARD_TITLE}“ (${START_BOARD}))`);

const counter1 = await stableCounter();
const cards1 = await readCards(START_BOARD);
// Първото видимо показване: броячът вече трябва да е на стартовата папка. Точно тук старият
// ред в renderUI (counterEl.textContent = notesCount) се вижда, преди uni да цъкне борда сам.
const atReady = await page.evaluate(() => ({ atReady: window.__axiCounterAtReady, log: (window.__axiCounterLog || []).slice(0, 40) }));
ok(String(atReady.atReady) === String(cards1.visible) && cards1.visible === START_COUNT,
    `още при първото показване на хедъра (body.app-ready) броячът показва бележките на стартовата папка (${START_COUNT}), колкото са и картите в DOM`,
    { atReady: atReady.atReady, cards: cards1, counterLog: atReady.log });
ok(String(counter1) === String(cards1.visible) && cards1.visible === START_COUNT,
    `след зареждането броячът в хедъра показва бележките на стартовата папка (${START_COUNT}), колкото са и картите в DOM`,
    { counter: counter1, cards: cards1 });
ok(Number(counter1) !== TOTAL_COUNT,
    `броячът НЕ показва общия брой на бележките (${TOTAL_COUNT})`, { counter: counter1 });
ok(String(cards1.all) === String(TOTAL_COUNT),
    `в контейнера наистина има картите на всички бележки (${TOTAL_COUNT}), тоест разликата е реална`,
    { cardsInDom: cards1.all });

// --- 4) Секунда и половина по-късно: без презапис след зареждането ---------------------------------
await page.waitForTimeout(1500);
const counter2 = await readCounter();
const cards2 = await readCards(START_BOARD);
ok(String(counter2) === String(START_COUNT) && cards2.visible === START_COUNT,
    `секунда и половина по-късно броячът още показва ${START_COUNT} (няма презапис след зареждането)`,
    { counter: counter2, cards: cards2 });

// --- 5) Клик по другия борд и обратно: броячът следва борда ---------------------------------------
const clickBoard = async (boardId) => {
    const sel = `.board-menu-container .board-filter-link[data-boardid="${boardId}"]`;
    const el = await page.$(sel);
    if (!el) return false;
    await el.scrollIntoViewIfNeeded();
    await el.click();
    return true;
};
const waitCounter = (want, ms = 8000) => page.waitForFunction((w) => {
    const el = document.getElementById('note-counter');
    return el && String(el.textContent) === String(w);
}, String(want), { timeout: ms }).then(() => true, () => false);

const clickedMain = await clickBoard(MAIN_BOARD);
const mainOk = clickedMain && await waitCounter(MAIN_COUNT);
const cardsMain = await readCards(MAIN_BOARD);
ok(mainOk && cardsMain.visible === MAIN_COUNT,
    `клик на борд „${MAIN_BOARD_TITLE}“ сменя брояча на неговите бележки (${MAIN_COUNT})`, { cards: cardsMain });

const clickedBack = await clickBoard(START_BOARD);
const backOk = clickedBack && await waitCounter(START_COUNT);
const cardsBack = await readCards(START_BOARD);
ok(backOk && cardsBack.visible === START_COUNT,
    `клик обратно на „${START_BOARD_TITLE}“ връща брояча на ${START_COUNT}`, { cards: cardsBack });

// --- 6) Никакви грешки в страницата ----------------------------------------------------------------
ok(errs.length === 0, 'няма грешки в страницата (pageerror / console.error)', errs.slice(0, 5));

await browser.close();
srv.close();
n++;
console.log((fails ? 'FAILED' : 'ALL OK') + ` (${n - fails}/${n})`);
process.exit(fails ? 1 : 0);
