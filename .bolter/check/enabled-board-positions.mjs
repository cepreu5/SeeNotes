// Включен допълнителен борд: приложението да влезе направо в него.
//
// Какво проверява (истински Chromium, истинският uni код, засята IndexedDB, ?demo=1):
//   за всеки допълнителен борд (Със снимки, С видео, Със звуци, Други прикачени, Напомняния, Всички):
//     1) бордът е изключен и стоим на друг борд („Всички", а за самите „Всички" - на първия борд);
//     2) включваме го от Настройки → избраната плочка в менюто е неговата, на екрана са неговите
//        бележки, а плочката е в полезрението на менюто (не остава извън екрана);
//
// Пускане от корена на хранилището: node .bolter/check/enabled-board-positions.mjs   (exit 1 при провал)
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
if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}
const DB_NAME = process.env.UNI_DB || 'NotesDB-demo';
const SEED_PATH = '/__seed.html';
const W = Number(process.env.W || 390), H = Number(process.env.H || 844);

// 6 борда × 2 бележки = 12 бележки. След зареждане тестът слага флаговете на екрана така:
// 2 бележки „със снимки", 2 „с видео", 2 „със звуци", 2 „други прикачени", 3 „с напомняне".
const NOTES_TOTAL = 12;
const BOARD1_NOTES = 2;

// key в localStorage, id на чекбокса, клас на бутона в менюто, id на борда, брой бележки на борда,
// къде стоим преди включването (id на борда и колко бележки се виждат там)
const BOARDS = [
    { key: 'showPhotosBoard', checkbox: 'show-photos-board-checkbox', cls: 'photos-filter-btn', name: 'Със снимки', boardId: 'with-photos', count: 2, before: 'all', beforeCount: NOTES_TOTAL },
    { key: 'showVideosBoard', checkbox: 'show-videos-board-checkbox', cls: 'videos-filter-btn', name: 'С видео', boardId: 'with-videos', count: 2, before: 'all', beforeCount: NOTES_TOTAL },
    { key: 'showSoundsBoard', checkbox: 'show-sounds-board-checkbox', cls: 'sounds-filter-btn', name: 'Със звуци', boardId: 'with-sounds', count: 2, before: 'all', beforeCount: NOTES_TOTAL },
    { key: 'showOtherBoard', checkbox: 'show-other-board-checkbox', cls: 'other-filter-btn', name: 'Други прикачени', boardId: 'with-other', count: 2, before: 'all', beforeCount: NOTES_TOTAL },
    { key: 'showBoardRemind', checkbox: 'remind-board-checkbox', cls: 'reminder-filter-btn', name: 'Напомняния', boardId: 'reminder', count: 3, before: 'all', beforeCount: NOTES_TOTAL },
    { key: 'showBoardAll', checkbox: 'all-board-checkbox', cls: 'all-boards-filter-btn', name: 'Всички', boardId: 'all', count: NOTES_TOTAL, before: 'b1', beforeCount: BOARD1_NOTES }
];

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
});

// --- 1) Засяване на базата преди старта ----------------------------------------------------
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
        out.seeded = { boards: boards.length, notes: notes.length };
    } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
    return out;
}, { dbName: DB_NAME });
ok(!seed.err && seed.seeded && seed.seeded.notes === NOTES_TOTAL, `базата е засята преди старта: 6 борда, ${NOTES_TOTAL} бележки`, seed);
if (fails) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

const loadApp = async () => {
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        && document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    await page.waitForTimeout(1800);
    return ready;
};

// Флаговете, по които менюто решава кой борд какво показва. Слагат се на самите карти на екрана,
// за да има по 2 бележки за снимки/видео/звуци/други и 3 с напомняне.
const markFlags = () => page.evaluate(() => {
    const notes = Array.from(document.querySelectorAll('#notes-container .note'))
        .filter(el => !el.classList.contains('boards-note') && !el.classList.contains('promo-note'));
    notes.forEach(el => { el.dataset.hp = '0'; el.dataset.hv = '0'; el.dataset.hs = '0'; el.dataset.ho = '0'; el.dataset.tm = '0'; });
    [['hp', 0], ['hp', 1], ['hv', 2], ['hv', 3], ['hs', 4], ['hs', 5], ['ho', 6], ['ho', 7]].forEach(([k, i]) => {
        if (notes[i]) notes[i].dataset[k] = '1';
    });
    [0, 1, 2].forEach(i => { if (notes[i]) notes[i].dataset.tm = '1'; });
    return notes.length;
});

const visibleNotes = () => page.evaluate(() => Array.from(document.querySelectorAll('#notes-container .note'))
    .filter(el => !el.classList.contains('boards-note') && !el.classList.contains('promo-note'))
    .filter(el => getComputedStyle(el).display !== 'none')
    .map(el => el.dataset.b));

const chipInMenu = (cls) => page.evaluate((cls) => {
    const menu = document.querySelector('header .board-menu-container');
    return !!(menu && menu.querySelector('.' + cls));
}, cls);

const selectedChip = () => page.evaluate(() => {
    const el = document.querySelector('header .board-menu-container .board-filter-link.selected-board');
    return el ? (el.dataset.boardid || null) : null;
});

// Плочката на избрания борд да е в полезрението на менюто, а не извън екрана.
const selectedChipInView = () => page.evaluate(() => {
    const menu = document.querySelector('header .board-menu-container');
    const el = menu && menu.querySelector('.board-filter-link.selected-board');
    if (!menu || !el) return null;
    const m = menu.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { inside: r.left >= m.left - 1 && r.right <= m.right + 1 && r.width > 0,
        menu: { l: Math.round(m.left), r: Math.round(m.right) }, chip: { l: Math.round(r.left), r: Math.round(r.right) } };
});

const openSettings = async () => {
    await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        if (m) m.classList.remove('visible');
        document.getElementById('settings_button').click();
    });
    await page.waitForSelector('#settings-modal.visible', { timeout: 8000 }).catch(() => { });
    await page.waitForTimeout(500);
};

const readCheckbox = (b) => page.evaluate(({ checkbox }) => {
    const el = document.getElementById(checkbox);
    return el ? el.checked : null;
}, { checkbox: b.checkbox });

// Минаване на борд с клик в менюто — така изходното положение е едно и също при всеки борд,
// независимо какво е останало от предишния.
const goToBoard = async (boardId) => {
    const clicked = await page.evaluate((id) => {
        const el = document.querySelector(`.board-menu-container .board-filter-link[data-boardid="${id}"]`);
        if (!el) return false;
        el.click();
        return true;
    }, boardId);
    await page.waitForTimeout(700);
    return clicked;
};

const closeSettings = async () => {
    await page.evaluate(() => {
        const x = document.getElementById('settings-close-x');
        if (x) x.click();
    });
    await page.waitForTimeout(600);
};

const setCheckbox = async (b, want) => {
    const before = await readCheckbox(b);
    if (before === want) return { before, clicked: false };
    await page.evaluate(({ checkbox }) => document.getElementById(checkbox).click(), { checkbox: b.checkbox });
    await page.waitForTimeout(900);
    return { before, clicked: true };
};

// --- 2) Всеки допълнителен борд: изключен → включен → влизаме в него ---------------------------
for (const b of BOARDS) {
    ok(await loadApp(), `${b.name}: приложението се зареди`);
    const marked = await markFlags();
    ok(marked === NOTES_TOTAL, `${b.name}: на екрана има ${NOTES_TOTAL} бележки за теста`, marked);
    ok(await page.evaluate(() => typeof applyFilters === 'function'), `${b.name}: applyFilters е достъпен за теста`);

    // Изходно положение: „Всички" е включен, целевият борд е изключен.
    await openSettings();
    await setCheckbox({ checkbox: 'all-board-checkbox' }, true);
    await setCheckbox(b, false);
    ok(await readCheckbox(b) === false, `${b.name}: изходно положение - бордът е изключен`);
    ok(!(await chipInMenu(b.cls)), `${b.name}: изключен - няма го в менюто`);
    await closeSettings();
    // Изходното положение се задава с клик в менюто: чекбоксът за „Всички" вече е отметнат от
    // предишния борд, а клик по вече отметнат чекбокс не мести приложението.
    ok(await goToBoard(b.before), `${b.name}: застанахме на ${b.before} през менюто`);
    // След изключването картите са прерисувани: флаговете се слагат пак, за да се мери филтърът.
    await markFlags();
    await page.evaluate(() => applyFilters());
    await page.waitForTimeout(400);
    const beforeList = await visibleNotes();
    ok((await selectedChip()) === b.before, `${b.name}: преди включването стоим на ${b.before}`, await selectedChip());
    ok(beforeList.length === b.beforeCount, `${b.name}: преди включването на екрана са ${b.beforeCount} бележки`, beforeList.length);

    // Включваме го от Настройки, без да пипаме менюто.
    await openSettings();
    const switched = await setCheckbox(b, true);
    ok(switched.clicked && await readCheckbox(b) === true, `${b.name}: включен е от Настройки`);
    ok(await chipInMenu(b.cls), `${b.name}: бутонът се появи в менюто`);

    // Включването прерисува картите: флаговете се слагат пак и филтърът се смята наново, за да не
    // мери тестът изгубените флагове вместо избора на борд.
    await markFlags();
    await page.evaluate(() => applyFilters());
    await page.waitForTimeout(500);

    const afterList = await visibleNotes();
    const sel = await selectedChip();
    ok(sel === b.boardId, `${b.name}: след включването приложението е в този борд (избрана плочка ${b.boardId})`, sel);
    ok(afterList.length === b.count, `${b.name}: на екрана са неговите ${b.count} бележки`, afterList.length);
    if (b.boardId !== 'all') {
        ok(afterList.length !== beforeList.length,
            `${b.name}: бележките се смениха спрямо предишното положение (${beforeList.length} → ${afterList.length})`);
    }
    const view = await selectedChipInView();
    ok(view && view.inside, `${b.name}: плочката на борда е в полезрението на менюто`, view);

    // Затваряме Настройки и проверяваме, че екранът не се е върнал назад.
    await page.evaluate(() => {
        const x = document.getElementById('settings-close-x');
        if (x) x.click();
    });
    await page.waitForTimeout(800);
    await markFlags();
    await page.evaluate(() => applyFilters());
    await page.waitForTimeout(300);
    const closedList = await visibleNotes();
    ok((await selectedChip()) === b.boardId && closedList.length === b.count,
        `${b.name}: след затваряне на Настройки оставаме в борда (${b.count} бележки)`,
        { chip: await selectedChip(), count: closedList.length });
}

// --- 3) Няма изключения в конзолата ---------------------------------------------------------
ok(errs.length === 0, 'няма изключения в конзолата', errs.slice(0, 3));

console.log(fails ? `FAILED ${fails}/${n}` : `OK ${n}/${n}`);
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
