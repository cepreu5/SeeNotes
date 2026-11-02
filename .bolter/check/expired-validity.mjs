// Шестото повторение „Валидност“ и изгледът „Невалидни“ (uni) — жив браузър.
//
// Какво проверява (истински Chromium, истинският uni код, засята IndexedDB, ?demo=1, 390x844):
//   1) бележка с „Валидност“ и отминала дата НЕ е в борда си и НЕ е във „Всички“ (избор A);
//   2) същата бележка Е в „Невалидни“ — с лентата над бележките, броя в нея и значката
//      „изтекла <дата> · <борд>“; редът е по дата на изтичане, най-новата отгоре;
//   3) бележка с БЪДЕЩА дата и „Валидност“ си стои в борда;
//   4) бележка с отминала дата и повторение „всяка седмица“ също си стои в борда (тя не изтича);
//   5) махането на датата от долната лента на бележката (същият бутон с календара) я връща в борда
//      на следващото рисуване, а редът с датата в бележката изчезва;
//   6) ключът в Настройки скрива реда „Невалидни“ от менюто и НЕ връща бележките в бордовете им.
//
// Пускане от корена на хранилището: node .bolter/check/expired-validity.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (за да се провери, че тестът хваща липсващата промяна).
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
    // Броят на бележките по бордовете е включен, за да се види, че броячът не брои изтекла бележка.
    localStorage.setItem('showBoardNoteCount', 'true');
    // „Всички“ е изключен по подразбиране при първи старт (main.js го задава на 'false'), а тук трябва
    // да се види, че изтеклата бележка не е и в него.
    localStorage.setItem('showBoardAll', 'true');
});

// --- Засяване на базата преди старта -------------------------------------------------------
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
        const DAY = 24 * 60 * 60 * 1000;
        // Ден без час: подравнен на обед, за да не зависи от часовата зона на машината.
        const dayAt = (offsetDays, hh = 12, mm = 0) => {
            const d = new Date(now + offsetDays * DAY);
            d.setHours(hh, mm, 0, 0);
            return d.getTime();
        };
        const boards = [
            { backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b1', id: 1, numord: 1, status: 0, title: 'Работа' },
            { backcolor: 0, backnum: 0, backpath: '', color: '#8BC34A', colorfont: '#000', datemod: now, gdid: 'b2', id: 2, numord: 2, status: 0, title: 'Лични' }
        ];
        const mk = (k, boardid, title, extra) => {
            return Object.assign({
                alarm_type: -1, boardid, calendarDate: 0, color: 0,
                date: now - k * 1000, datemod: now - k * 1000, eventId: 0,
                gdid: `Note${String(k).padStart(18, '0')}`, id: 1000 + k,
                notetxt: `${title}|Тяло ${k}`, numord: k, pass: false, sellist: 0, status: 0,
                text_span: '', timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 243
            }, extra || {});
        };
        const notes = [
            // 1) изтекла по час: дата преди 5 дни, час 14:30
            mk(1, 'b1', 'ИЗТЕКЛА ЧАСОВА', { calendarDate: dayAt(-5, 9, 0), uiState: { cRepeat: { f: 'validity', u: null }, cTime: '14:30' } }),
            // 2) бъдеща „Валидност“ — не изтича
            mk(2, 'b1', 'БЪДЕЩА ВАЛИДНОСТ', { calendarDate: dayAt(10), uiState: { cRepeat: { f: 'validity', u: null } } }),
            // 3) минала дата, но повторение „всяка седмица“ — не изтича
            mk(3, 'b1', 'СЕДМИЧНА МИНАЛА', { calendarDate: dayAt(-5), uiState: { cRepeat: { f: 'weekly', u: null } } }),
            // 4) обикновена бележка без дата
            mk(4, 'b1', 'ОБИКНОВЕНА'),
            // 5) изтекла без час — изтича в края на деня си (тази се връща обратно в борда при махане на датата)
            mk(5, 'b1', 'ИЗТЕКЛА БЕЗ ЧАС', { calendarDate: dayAt(-3), uiState: { cRepeat: { f: 'validity', u: null } } }),
            // 6) „Валидност“ без дата — няма какво да изтече
            mk(6, 'b1', 'ВАЛИДНОСТ БЕЗ ДАТА', { uiState: { cRepeat: { f: 'validity', u: null } } }),
            // 7) бележка в другия борд, за да има какво да покаже „Всички“
            mk(7, 'b2', 'ЛИЧНА', { calendarDate: dayAt(4) })
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
ok(!seed.err && seed.seeded && seed.seeded.notes === 7, 'базата е засята преди старта: 2 борда, 7 бележки', seed);
if (fails) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

// --- Старт на приложението в демо режим -----------------------------------------------------
await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
    && document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
    .then(() => true, () => false);
ok(ready, 'приложението се вдигна и бордът има карти');
if (!ready) {
    console.log('няма смисъл да продължаваме без зареден борд');
    await browser.close(); srv.close();
    console.log('FAILED');
    process.exit(1);
}

const settle = (ms = 250) => page.waitForTimeout(ms);

// Видимите заглавия на картите в текущия изглед (без менюто на бордовете и промо-картата).
const visibleTitles = () => page.evaluate(() => Array.from(document.querySelectorAll('#notes-container .note'))
    .filter(c => !c.classList.contains('boards-note') && !c.classList.contains('promo-note') && c.style.display !== 'none')
    .map(c => (c.querySelector('.note-title-truncated')?.textContent || '').trim()));

// Клик с истинска мишка по елемент (след scrollIntoView, за да е наистина на екрана).
// Менюто на бордовете се плъзга плавно (scroll-behavior: smooth), затова плъзгането тук е моментално,
// а точката се проверява с elementFromPoint и при нужда се мери отново: иначе кликът пада върху
// съседния ред, докато лентата още се движи.
const clickEl = async (selector, rootSel = null) => {
    for (let attempt = 0; attempt < 12; attempt++) {
        const box = await page.evaluate(({ selector, rootSel }) => {
            const host = rootSel ? document.querySelector(rootSel) : document;
            const el = host && host.querySelector(selector);
            if (!el) return null;
            for (let p = el.parentElement; p; p = p.parentElement) {
                if (getComputedStyle(p).scrollBehavior === 'smooth') p.style.scrollBehavior = 'auto';
            }
            el.scrollIntoView({ block: 'center', inline: 'center' });
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return { empty: true };
            const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
            const hit = document.elementFromPoint(x, y);
            return { x, y, w: Math.round(r.width), h: Math.round(r.height), good: !!hit && (hit === el || el.contains(hit)) };
        }, { selector, rootSel });
        if (!box || box.empty) return { ok: false, box };
        if (box.good) {
            await page.mouse.click(box.x, box.y);
            return { ok: true, box };
        }
        await page.waitForTimeout(120);
    }
    return { ok: false, box: null };
};

// Отваря бележка с истинска мишка: първо по заглавието, после по тялото на картата (и двата пътя
// отварят бележката). Връща какво е станало, за да е ясно при провал.
const openNote = async (title) => {
    const tried = [];
    for (const sel of ['.note-title-truncated', '.note-content-wrapper']) {
        const box = await page.evaluate(({ title, sel }) => {
            const card = Array.from(document.querySelectorAll('#notes-container .note'))
                .find(c => c.style.display !== 'none' && (c.querySelector('.note-title-truncated')?.textContent || '').trim() === title);
            if (!card) return { err: 'няма видима карта с това заглавие' };
            card.scrollIntoView({ block: 'center' });
            const el = card.querySelector(sel);
            if (!el) return { err: 'няма ' + sel };
            const r = el.getBoundingClientRect();
            const x = Math.round(r.left + Math.min(r.width / 2, 60)), y = Math.round(r.top + Math.min(r.height / 2, 40));
            const hit = document.elementFromPoint(x, y);
            return { x, y, hit: hit ? String(hit.className || hit.tagName).slice(0, 40) : null };
        }, { title, sel });
        if (!box || box.err) { tried.push({ sel, box }); continue; }
        await page.mouse.click(box.x, box.y);
        const opened = await page.waitForSelector('.note-window.visible', { timeout: 5000 }).then(() => true, () => false);
        if (opened) return { ok: true, via: sel, box };
        tried.push({ sel, box, opened: false });
        await settle(200);
    }
    return { ok: false, tried };
};

// Смяна на борда с истинска мишка по реда в менюто.
const clickBoard = async (boardId) => {
    const res = await clickEl(`.board-filter-link[data-boardid="${boardId}"]`, 'header .board-menu-container');
    if (!res.ok) return { ok: false, res };
    const applied = await page.waitForFunction((id) => {
        if (typeof currentBoardFilter === 'undefined' || String(currentBoardFilter) !== String(id)) return false;
        const c = document.getElementById('notes-container');
        return c && c.style.visibility !== 'hidden';
    }, boardId, { timeout: 8000 }).then(() => true, () => false);
    await settle();
    return { ok: applied, res };
};

const menuRow = (boardId) => page.evaluate((id) => {
    const el = document.querySelector(`header .board-menu-container .board-filter-link[data-boardid="${id}"]`);
    return el ? el.textContent.trim() : null;
}, boardId);

const hintState = () => page.evaluate(() => {
    const bar = document.getElementById('expired-hint');
    if (!bar) return { exists: false };
    return {
        exists: true,
        hidden: bar.hidden,
        display: getComputedStyle(bar).display,
        title: (bar.querySelector('.expired-hint-title')?.textContent || '').trim(),
        count: (bar.querySelector('.expired-hint-count')?.textContent || '').trim(),
        line: (bar.querySelector('.expired-hint-line')?.textContent || '').trim(),
        height: Math.round(bar.getBoundingClientRect().height),
        overflowX: Math.round(document.documentElement.scrollWidth) > Math.round(window.innerWidth)
    };
});

const badgeOf = (title) => page.evaluate((title) => {
    const card = Array.from(document.querySelectorAll('#notes-container .note'))
        .find(c => (c.querySelector('.note-title-truncated')?.textContent || '').trim() === title);
    if (!card) return null;
    const badge = card.querySelector('.note-expired-badge');
    return { hasBadge: !!badge, text: badge ? badge.textContent.trim() : '', xv: card.dataset.xv || '' };
}, title);

const sorted = (arr) => [...arr].sort((a, b) => a.localeCompare(b, 'bg'));

// --- 1) Бордът на изтеклата бележка не я показва -------------------------------------------
let r = await clickBoard('b1');
ok(r.ok, 'минаваме в борд „Работа“ с клик по реда в менюто', r.res);
let titles = await visibleTitles();
ok(!titles.includes('ИЗТЕКЛА ЧАСОВА') && !titles.includes('ИЗТЕКЛА БЕЗ ЧАС'),
    'изтеклата бележка НЕ е в борда си', titles);
ok(sorted(titles).join(' | ') === sorted(['БЪДЕЩА ВАЛИДНОСТ', 'СЕДМИЧНА МИНАЛА', 'ОБИКНОВЕНА', 'ВАЛИДНОСТ БЕЗ ДАТА']).join(' | '),
    'в борда са само неистеклите: бъдеща „Валидност“, „всяка седмица“ с минала дата, без дата, „Валидност“ без дата', titles);
ok((await menuRow('b1')) === 'Работа (4)', 'броят на борда не включва изтеклата бележка: „Работа (4)“', await menuRow('b1'));
ok((await menuRow('expired')) === 'Невалидни (2)', 'редът „Невалидни“ носи броя: „Невалидни (2)“', await menuRow('expired'));

// --- 2) „Всички“ също не я показва (избор A) -----------------------------------------------
r = await clickBoard('all');
ok(r.ok, 'минаваме във „Всички“');
titles = await visibleTitles();
ok(!titles.includes('ИЗТЕКЛА ЧАСОВА') && !titles.includes('ИЗТЕКЛА БЕЗ ЧАС'),
    'изтеклата бележка НЕ е и във „Всички“', titles);
ok(titles.includes('ЛИЧНА'), '„Всички“ показва бележките от двата борда', titles);

// --- 3) „Невалидни“: картите, лентата, значката, редът по дата ------------------------------
r = await clickBoard('expired');
ok(r.ok, 'минаваме в „Невалидни“ с клик по реда в менюто');
titles = await visibleTitles();
ok(titles.length === 2 && titles.includes('ИЗТЕКЛА ЧАСОВА') && titles.includes('ИЗТЕКЛА БЕЗ ЧАС'),
    '„Невалидни“ показва точно двете изтекли бележки', titles);
ok(titles[0] === 'ИЗТЕКЛА БЕЗ ЧАС' && titles[1] === 'ИЗТЕКЛА ЧАСОВА',
    'редът е по дата на изтичане, най-новата отгоре (преди 3 дни преди преди 5 дни)', titles);
const hint = await hintState();
ok(hint.exists && hint.hidden === false && hint.display !== 'none', 'лентата над бележките се вижда в „Невалидни“', hint);
ok(hint.title === 'Невалидни', 'лентата има заглавие „Невалидни“', hint.title);
ok(hint.count === '2 бележки', 'лентата показва броя: „2 бележки“', hint.count);
ok(hint.line === 'Изчисти датата, за да се върне в борда', 'лентата казва как се връща бележката', hint.line);
ok(hint.overflowX === false, 'лентата не чупи layout-а на 390px (няма хоризонтален скрол)', hint);
const badgeHour = await badgeOf('ИЗТЕКЛА ЧАСОВА');
ok(badgeHour && badgeHour.hasBadge && /^изтекла /.test(badgeHour.text) && badgeHour.text.includes('Работа') && badgeHour.text.includes(':'),
    'значката на изтеклата бележка: „изтекла <дата> <час> · Работа“', badgeHour);
const badgeDay = await badgeOf('ИЗТЕКЛА БЕЗ ЧАС');
ok(badgeDay && badgeDay.hasBadge && /^изтекла /.test(badgeDay.text) && badgeDay.text.includes('Работа') && !badgeDay.text.includes(':'),
    'без час значката няма час: „изтекла <дата> · Работа“', badgeDay);
ok(badgeHour.xv === '1' && badgeDay.xv === '1', 'картите носят белега dataset.xv (изтекла)', { a: badgeHour.xv, b: badgeDay.xv });
// Снимка само при поискване (SHOT=/път.png) - в хранилището не влизат снимки.
if (process.env.SHOT) {
    await page.screenshot({ path: process.env.SHOT });
    console.log(`     (снимка: ${process.env.SHOT})`);
}

// --- 4) Махане на датата от долната лента на бележката -------------------------------------
const opened = await openNote('ИЗТЕКЛА БЕЗ ЧАС');
ok(opened.ok, 'карта в „Невалидни“ се отваря с клик по заглавието', opened);
const winOpen = await page.waitForSelector('.note-window.visible', { timeout: 8000 }).then(() => true, () => false);
ok(winOpen, 'бележката се отвори');
const calClick = await clickEl('#note-calendar-btn', '.note-window.visible');
ok(calClick.ok, 'клик по бутона с календара в долната лента (той маха датата)');
const dateGone = await page.waitForFunction(() => {
    const note = (typeof allNotesData !== 'undefined' ? allNotesData : []).find(n => (n.notetxt || '').indexOf('ИЗТЕКЛА БЕЗ ЧАС') === 0);
    const row = document.querySelector('.note-window.visible .note-cal-row');
    return !!note && !(Number(note.calendarDate) > 0) && !!row && row.hidden;
}, null, { timeout: 8000 }).then(() => true, () => false);
ok(dateGone, 'датата е махната от бележката и редът с датата изчезна');
await page.evaluate(() => document.querySelectorAll('#note-windows-layer .note-window.visible .modal-close').forEach(b => b.click()));
await settle(400);
r = await clickBoard('b1');
ok(r.ok, 'обратно в борд „Работа“');
titles = await visibleTitles();
ok(titles.includes('ИЗТЕКЛА БЕЗ ЧАС'), 'след махането на датата бележката е пак в борда си', titles);
ok((await badgeOf('ИЗТЕКЛА БЕЗ ЧАС') || {}).hasBadge === false, 'картата вече няма значка „изтекла“');
r = await clickBoard('expired');
titles = await visibleTitles();
ok(r.ok && !titles.includes('ИЗТЕКЛА БЕЗ ЧАС') && titles.includes('ИЗТЕКЛА ЧАСОВА'),
    'в „Невалидни“ остава само другата изтекла бележка', titles);
ok((await menuRow('expired')) === 'Невалидни (1)' || (await menuRow('expired')) === 'Невалидни',
    'броят на „Невалидни“ след връщането', await menuRow('expired'));

// --- 5) Лентата не излиза от „Невалидни“ ---------------------------------------------------
r = await clickBoard('b1');
const hintHidden = await hintState();
ok(r.ok && hintHidden.exists && (hintHidden.hidden === true || hintHidden.display === 'none'),
    'в борд „Работа“ лентата не се вижда', hintHidden);

// --- 6) Ключът в Настройки скрива реда, но не връща бележките -------------------------------
await page.evaluate(() => { const m = document.getElementById('settings-modal'); if (m) m.classList.remove('visible'); document.getElementById('settings_button').click(); });
const settingsOpen = await page.waitForSelector('#settings-modal.visible', { timeout: 8000 }).then(() => true, () => false);
ok(settingsOpen, 'Настройки се отвориха');
const arrow = await clickEl('#boards-arrow', '#settings-modal');
await page.waitForFunction(() => document.getElementById('boards-options-section').style.display === 'block', null, { timeout: 5000 }).catch(() => {});
await settle(200);
const cbWhenOn = await page.evaluate(() => document.getElementById('show-expired-board-checkbox').checked);
ok(cbWhenOn === true, 'ключът „Невалидни“ е включен по подразбиране', cbWhenOn);
const cbClick = await clickEl('#show-expired-board-checkbox', '#settings-modal');
await page.waitForFunction(() => localStorage.getItem('showExpiredBoard') === 'false', null, { timeout: 8000 }).catch(() => {});
await settle(600);
const cbStore = await page.evaluate(() => localStorage.getItem('showExpiredBoard'));
ok(cbClick.ok && cbStore === 'false', 'ключът се изключва и изборът се пази (showExpiredBoard=false)', { clicked: cbClick.ok, store: cbStore });
const rowGone = await menuRow('expired');
ok(rowGone === null, 'редът „Невалидни“ изчезна от менюто', rowGone);
const cbClickBack = await clickEl('#show-expired-board-checkbox', '#settings-modal');
await settle(700);
const rowBack = await menuRow('expired');
ok(cbClickBack.ok && rowBack !== null, 'включен отново, редът се връща в менюто', rowBack);
await page.evaluate(() => document.getElementById('settings-modal').classList.remove('visible'));
await settle(300);
r = await clickBoard('b1');
titles = await visibleTitles();
ok(r.ok && !titles.includes('ИЗТЕКЛА ЧАСОВА'),
    'след ключа изтеклата бележка пак не е в борда си (ключът не връща бележки)', titles);

ok(errs.length === 0, 'няма грешки в конзолата на страницата', errs.slice(0, 3));

// --- 7) Самият избор в „повторение“ и правилата зад него -------------------------------------
const openFuture = await openNote('БЪДЕЩА ВАЛИДНОСТ');
ok(openFuture.ok, 'отваря се бележка с „Валидност“ и бъдеща дата', openFuture);
const picker = await page.evaluate(() => {
    const win = document.querySelector('.note-window.visible');
    if (!win) return { err: 'прозорецът не е отворен' };
    // Тялото на бележката е същото, което buildNoteCalRow е получил - от прозореца, а не от шаблона.
    const w = (typeof getOpenNoteWindows === 'function' ? getOpenNoteWindows() : [])[0];
    const body = w && w.body ? w.body : win.querySelector('.nw-modal-body');
    const row = win.querySelector('.note-cal-row');
    if (!body || !row) return { err: 'няма ред с датата', hasBody: !!body, hasRow: !!row };
    // Редът се държи като в редакция (там празните полета се виждат) - иначе „До“ и без това е скрит.
    body.dataset.isPreview = 'true';
    row._noteCalSync();
    const sel = row.querySelector('.note-cal-repeat-select');
    const until = row.querySelector('.note-cal-until');
    const untilInput = row.querySelector('.note-cal-until-input');
    return {
        options: [...sel.options].map(o => o.value),
        labels: [...sel.options].map(o => o.textContent.trim()),
        value: sel.value,
        untilHidden: !!until && until.hidden,
        untilDisabled: !!untilInput && untilInput.disabled
    };
});
ok(picker.options && picker.options.join(',') === ',daily,weekly,monthly,yearly,validity',
    'в „повторение“ има шест избора и последният е validity', picker.options);
ok(picker.labels && picker.labels.includes('Валидност'), 'изборът се вижда като „Валидност“', picker.labels);
ok(picker.value === 'validity', 'бележката показва избраното „Валидност“', picker.value);
ok(picker.untilHidden === true && picker.untilDisabled === true,
    'при „Валидност“ полето „До“ е скрито и не се избира', picker);

// --- 8) Правилата зад избора: срок, календар, стара дата ------------------------------------
const rules = await page.evaluate(() => {
    const DAY = 24 * 60 * 60 * 1000;
    const today = new Date();
    today.setHours(9, 0, 0, 0);
    const past = new Date(Date.now() - 5 * DAY);
    past.setHours(10, 0, 0, 0);
    const validity = { calendarDate: today.getTime(), uiState: { cRepeat: { f: 'validity', u: null } } };
    const validityHour = { calendarDate: past.getTime(), uiState: { cRepeat: { f: 'validity', u: null }, cTime: '14:30' } };
    const validityPast = { calendarDate: past.getTime(), uiState: { cRepeat: { f: 'validity' } } };
    const weekly = { calendarDate: past.getTime(), uiState: { cRepeat: { f: 'weekly', u: null } } };
    const plain = { calendarDate: past.getTime() };
    const endOfToday = new Date(today.getTime());
    endOfToday.setHours(23, 59, 59, 999);
    const expiryHour = new Date(past.getTime());
    expiryHour.setHours(14, 30, 0, 0);
    return {
        // без час срокът е краят на деня, а не полунощ
        endOfDay: noteValidityExpiryMoment(validity) === endOfToday.getTime(),
        // с час - датата в този час
        atHour: noteValidityExpiryMoment(validityHour) === expiryHour.getTime(),
        // днес датирана бележка без час още не е изтекла
        todayStillValid: noteValidityExpired(validity) === false,
        pastExpired: noteValidityExpired(validityHour) === true,
        // повторение и обикновена дата не изтичат по този път
        weeklyNotExpired: noteValidityExpiryMoment(weekly) === 0 && noteValidityExpired(weekly) === false,
        plainNotExpired: noteValidityExpiryMoment(plain) === 0,
        // никакъв запис в календара никъде
        notInGcal: isGcalNoteWanted(Object.assign({ gdid: 'g-1', id: 1, status: 0, notetxt: 'x' }, validity)) === false,
        noRecurrence: buildGcalRecurrence({ f: 'validity', u: null }, new Date(), false) === null,
        weeklyHasRecurrence: Array.isArray(buildGcalRecurrence({ f: 'weekly', u: null }, new Date(), false)),
        notInCalendarView: noteShowsInCalendar(validity) === false && noteShowsInCalendar(weekly) === true,
        // „Валидност“ със стара дата е „стара“ като бележка без повторение, а не като безкрайно повторение
        oldDateLikePlain: isGcalNoteOldDate(validityPast) === true && isGcalNoteOldDate(weekly) === false
    };
});
const ruleFailures = Object.keys(rules).filter(k => rules[k] !== true);
ok(ruleFailures.length === 0, 'срокът, календарът и „стара дата“ спазват правилата на „Валидност“', ruleFailures);

await browser.close();
srv.close();
console.log(fails ? `FAILED (${fails} от ${n})` : `OK (${n} проверки)`);
process.exit(fails ? 1 : 0);
