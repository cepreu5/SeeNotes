// Настройки: панелът да не скача в началото след чек на борд.
//
// Какво проверява (истински Chromium, истинският uni код, засята IndexedDB, ?demo=1,
// мобилен контекст с докосване 390x844, чекът се прави с истински tap):
//   1) включване на изключен борд: панелът остава на същия скрол, редът на чекбокса остава на
//      същото място, секцията „Бордове" остава отворена, фокусът остава на чекбокса;
//   2) същото и след 2.5 сек, когато фоновата синхронизация прерисува пак;
//   3) изключване на борда, на който стоим: приложението излиза от него (ПР #138), а панелът
//      пак не мърда;
//   4) панел в самото начало (скрол 0): след чека остава 0, не тръгва надолу.
//
// Пускане от корена на хранилището: node .bolter/check/settings-scroll-kept.mjs   (exit 1 при провал)
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
const NOTES_TOTAL = 12;
// Допустимо трепване в пиксели: скролът се връща цяло число, редът може да мръдне с 1-2 px.
const TOL = 2;

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
    // Изходно положение: всички допълнителни бордове са изключени, „Всички" е включен.
    localStorage.setItem('showPhotosBoard', 'false');
    localStorage.setItem('showVideosBoard', 'false');
    localStorage.setItem('showSoundsBoard', 'false');
    localStorage.setItem('showOtherBoard', 'false');
    localStorage.setItem('showBoardRemind', 'false');
    localStorage.setItem('showBoardAll', 'true');
});

// --- Засяване на базата преди старта --------------------------------------------------------
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

const openSettings = async () => {
    await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        if (m) m.classList.remove('visible');
        document.getElementById('settings_button').click();
    });
    await page.waitForSelector('#settings-modal.visible', { timeout: 8000 }).catch(() => { });
    await page.waitForTimeout(500);
    // Секцията „Бордове" се отваря с истинско докосване по стрелката, ако е затворена. Стрелката
    // стои по-долу в панела, затова първо се докарва в полезрението.
    const open = await page.evaluate(() => {
        const sec = document.getElementById('boards-options-section');
        return !!sec && sec.style.display === 'block';
    });
    if (!open) {
        await page.evaluate(() => {
            const b = document.getElementById('settings-modal-body');
            const a = document.getElementById('boards-arrow');
            b.scrollTop = Math.max(0, Math.round(a.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - 120));
        });
        await page.waitForTimeout(250);
        const box = await page.evaluate(() => {
            const r = document.getElementById('boards-arrow').getBoundingClientRect();
            return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), inView: r.top > 0 && r.bottom < window.innerHeight };
        });
        if (box.inView) {
            await page.touchscreen.tap(box.x, box.y);
            await page.waitForTimeout(500);
        }
    }
    return page.evaluate(() => {
        const sec = document.getElementById('boards-options-section');
        return !!sec && sec.style.display === 'block';
    });
};

// Редът с чекбокса се докарва в средата на панела, за да е далеч от ръбовете.
const bringIntoView = async (checkboxId) => {
    await page.evaluate((id) => {
        const b = document.getElementById('settings-modal-body');
        const row = document.getElementById(id);
        b.scrollTop = Math.max(0, Math.round(row.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - Math.round(b.clientHeight / 2)));
    }, checkboxId);
    await page.waitForTimeout(250);
};

// Скрол на панела до средата (или до самото начало) — така чекбоксовете са далеч от върха.
const scrollPanel = (where) => page.evaluate((where) => {
    const b = document.getElementById('settings-modal-body');
    if (!b) return null;
    const max = Math.max(0, Math.round(b.scrollHeight - b.clientHeight));
    b.scrollTop = where === 'top' ? 0 : Math.round(max / 2);
    return { scrollTop: Math.round(b.scrollTop), max };
}, where);

// Какво вижда човекът: скрол на панела, мястото на реда с чекбокса, състоянието на секцията,
// фокуса и отме¬тнатостта на чекбокса.
const view = (checkboxId) => page.evaluate((id) => {
    const b = document.getElementById('settings-modal-body');
    const row = document.getElementById(id);
    const sec = document.getElementById('boards-options-section');
    const act = document.activeElement;
    const rect = row ? row.getBoundingClientRect() : null;
    const panel = b ? b.getBoundingClientRect() : null;
    return {
        scrollTop: b ? Math.round(b.scrollTop) : null,
        max: b ? Math.round(b.scrollHeight - b.clientHeight) : null,
        rowTop: rect ? Math.round(rect.top) : null,
        rowVisible: !!(rect && panel && rect.top >= panel.top - 1 && rect.bottom <= panel.bottom + 1),
        section: sec ? sec.style.display : null,
        checked: row ? row.checked : null,
        active: act ? (act.id || act.tagName) : null
    };
}, checkboxId);

// Истинско докосване по чекбокса, както го прави пръст.
const tapCheckbox = async (checkboxId) => {
    const box = await page.evaluate((id) => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    }, checkboxId);
    await page.touchscreen.tap(box.x, box.y);
    return box;
};

const selectedChip = () => page.evaluate(() => {
    const el = document.querySelector('header .board-menu-container .board-filter-link.selected-board');
    return el ? (el.dataset.boardid || null) : null;
});

// --- Случай 1: включване на изключен борд при скролнат панел ---------------------------------
const caseEnable = async () => {
    const label = 'включване на „Със снимки"';
    const CB = 'show-photos-board-checkbox';
    ok(await loadApp(), `${label}: приложението се зареди`);
    ok(await openSettings(), `${label}: Настройки е отворен на секция „Бордове"`);
    await bringIntoView(CB);
    const before = await view(CB);
    ok(before.rowVisible, `${label}: чекбоксът е в полезрението на панела`, before);
    ok(before.scrollTop > 0, `${label}: панелът е скролнат преди чека`, before.scrollTop);
    ok(before.checked === false, `${label}: изходно положение - бордът е изключен`, before.checked);
    const point = await tapCheckbox(CB);
    await page.waitForTimeout(1200);
    const after = await view(CB);
    ok(after.checked === true, `${label}: чекбоксът е отметнат`, after);
    ok(Math.abs(after.scrollTop - before.scrollTop) <= TOL, `${label}: панелът остава на същия скрол`,
        { before: before.scrollTop, after: after.scrollTop, tap: point });
    ok(Math.abs(after.rowTop - before.rowTop) <= TOL, `${label}: редът с чекбокса остава на същото място`,
        { before: before.rowTop, after: after.rowTop, tap: point });
    ok(after.section === 'block', `${label}: секцията „Бордове" остава отворена`, after.section);
    ok(after.active === CB, `${label}: фокусът остава на чекбокса`, after.active);
    const chip = await selectedChip();
    ok(chip === 'with-photos', `${label}: приложението влезе в новия борд`, chip);
    // Фоновата синхронизация прерисува пак след няколко секунди - панелът не бива да мърда и тогава.
    await page.waitForTimeout(2500);
    const later = await view(CB);
    ok(Math.abs(later.scrollTop - before.scrollTop) <= TOL, `${label}: след 2.5 сек панелът е пак там`,
        { before: before.scrollTop, later: later.scrollTop });
    ok(Math.abs(later.rowTop - before.rowTop) <= TOL, `${label}: след 2.5 сек редът е пак там`,
        { before: before.rowTop, later: later.rowTop });
};

// --- Случай 2: изключване на борда, на който стоим -------------------------------------------
const caseDisableCurrent = async () => {
    const label = 'изключване на текущия борд „Със снимки"';
    const CB = 'show-photos-board-checkbox';
    ok(await loadApp(), `${label}: приложението се зареди`);
    ok(await openSettings(), `${label}: Настройки е отворен на секция „Бордове"`);
    // Първо включваме борда, за да влезем в него.
    await tapCheckbox(CB);
    await page.waitForTimeout(1300);
    ok((await selectedChip()) === 'with-photos', `${label}: стоим на борда „Със снимки"`, await selectedChip());
    await bringIntoView(CB);
    const before = await view(CB);
    ok(before.checked === true && before.rowVisible, `${label}: чекбоксът е отметнат и в полезрението`, before);
    ok(before.scrollTop > 0, `${label}: панелът е скролнат преди чека`, before.scrollTop);
    await tapCheckbox(CB);
    await page.waitForTimeout(1300);
    const after = await view(CB);
    ok(after.checked === false, `${label}: чекбоксът е изключен`, after);
    ok(Math.abs(after.scrollTop - before.scrollTop) <= TOL, `${label}: панелът остава на същия скрол`,
        { before: before.scrollTop, after: after.scrollTop });
    ok(Math.abs(after.rowTop - before.rowTop) <= TOL, `${label}: редът остава на същото място`,
        { before: before.rowTop, after: after.rowTop });
    ok(after.active === CB, `${label}: фокусът остава на чекбокса`, after.active);
    const chip = await selectedChip();
    ok(!!chip && chip !== 'with-photos', `${label}: приложението излезе от изключения борд`, chip);
};

// --- Случай 3: панел, скролнат до дъното -------------------------------------------------------
const caseBottom = async () => {
    const label = 'панел до дъното, включване на „Други прикачени"';
    const CB = 'show-other-board-checkbox';
    ok(await loadApp(), `${label}: приложението се зареди`);
    ok(await openSettings(), `${label}: Настройки е отворен на секция „Бордове"`);
    const start = await page.evaluate(() => {
        const b = document.getElementById('settings-modal-body');
        b.scrollTop = b.scrollHeight;
        return { scrollTop: Math.round(b.scrollTop), max: Math.round(b.scrollHeight - b.clientHeight) };
    });
    await page.waitForTimeout(250);
    const before = await view(CB);
    ok(before.rowVisible, `${label}: чекбоксът се вижда при скрол до дъното`, before);
    ok(before.checked === false, `${label}: изходно положение - бордът е изключен`, before.checked);
    if (!before.rowVisible) return;
    await tapCheckbox(CB);
    await page.waitForTimeout(1200);
    const after = await view(CB);
    ok(after.checked === true, `${label}: чекбоксът е отметнат`, after);
    // Включването на борд променя височината на съдържанието, затова при дъното мерим, че
    // панелът е пак на дъното (а не че пикселът е същият) и че редът е пак в полезрението.
    ok(after.scrollTop >= after.max - TOL, `${label}: панелът остава до дъното`,
        { before, after, start });
    ok(after.rowVisible, `${label}: редът с чекбокса остава в полезрението`,
        { before: before.rowTop, after: after.rowTop });
    ok(after.active === CB, `${label}: фокусът остава на чекбокса`, after.active);
};

// --- Случай 4: изключване на борд, който не е на екрана в момента -----------------------------
const caseOtherBoard = async () => {
    const label = 'изключване на „Напомняния", докато стоим на друг борд';
    const CB = 'remind-board-checkbox';
    ok(await loadApp(), `${label}: приложението се зареди`);
    ok(await openSettings(), `${label}: Настройки е отворен на секция „Бордове"`);
    // Включваме „Напомняния", за да има какво да изключим; влизаме в него.
    await tapCheckbox(CB);
    await page.waitForTimeout(1300);
    await bringIntoView(CB);
    const before = await view(CB);
    ok(before.checked === true && before.rowVisible, `${label}: чекбоксът е отметнат и в полезрението`, before);
    ok(before.scrollTop > 0, `${label}: панелът е скролнат преди чека`, before.scrollTop);
    await tapCheckbox(CB);
    await page.waitForTimeout(1300);
    const after = await view(CB);
    ok(after.checked === false, `${label}: чекбоксът е изключен`, after);
    ok(Math.abs(after.scrollTop - before.scrollTop) <= TOL, `${label}: панелът остава на същия скрол`,
        { before: before.scrollTop, after: after.scrollTop });
    ok(Math.abs(after.rowTop - before.rowTop) <= TOL, `${label}: редът остава на същото място`,
        { before: before.rowTop, after: after.rowTop });
    ok(after.active === CB, `${label}: фокусът остава на чекбокса`, after.active);
};

await caseEnable();
await caseDisableCurrent();
await caseBottom();
await caseOtherBoard();

ok(errs.length === 0, 'няма изключения в конзолата', errs.slice(0, 3));

console.log(fails ? `FAILED ${fails}/${n}` : `OK ${n}/${n}`);
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
