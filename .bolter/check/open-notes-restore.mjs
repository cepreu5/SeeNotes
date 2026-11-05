// Отворените бележки се помнят в локалната памет и се отварят при старт (uni b3.69) — жив браузър.
//
// Какво проверява (истински Chromium, истинският uni код, засята IndexedDB, ?demo=1, 390x844):
//   1) две бележки, отворени с клик по картите: лентата се вижда, а ключът cx_open_notes_list държи
//      точно тези две бележки (id + gdid) в реда на отваряне;
//   2) презареждане: двете бележки са отново отворени в отделни прозорци, лентата се вижда, ключът е
//      налице, няма дублиран прозорец за една бележка;
//   3) затваряне на едната с X: остава една бележка, лентата се скрива, ключът го няма;
//   4) презареждане: нищо не се отваря, ключът още липсва;
//   5) три бележки: ключът има три, след презареждане трите са отворени;
//   6) фалшив id до реален в ключа: отваря се само реалната бележка, без изключения;
//   7) нула грешки в конзолата на страницата в целия ход.
//
// Пускане от корена на хранилището: node .bolter/check/open-notes-restore.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (контрола: на b3.68 пада на проверките за ключа и за
// възстановяването).
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
const KEY = 'cx_open_notes_list';

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
const consoleErrs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error') consoleErrs.push(String(m.text()).slice(0, 300)); });

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
    localStorage.setItem('startBoard', 'b1');
});

// --- Засягане на базата преди старта -------------------------------------------------------
// 4 бележки на „Работа“ (b1) и 2 на „Лични“ (b2): секциите отварят до три бележки от един борд.
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
        const boards = [
            { backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b1', id: 1, numord: 1, status: 0, title: 'Работа' },
            { backcolor: 0, backnum: 0, backpath: '', color: '#8BC34A', colorfont: '#000', datemod: now, gdid: 'b2', id: 2, numord: 2, status: 0, title: 'Лични' }
        ];
        const mk = (id, k, boardid, title) => ({
            alarm_type: -1, boardid, calendarDate: 0, color: 0,
            date: now - k * 1000, datemod: now - k * 1000, eventId: 0,
            gdid: `Note${String(id).padStart(18, '0')}`, id,
            notetxt: `${title}|Тяло ${k}`, numord: k, pass: false, sellist: 0, status: 0,
            text_span: '', timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 243
        });
        const notes = [
            mk(1001, 1, 'b1', 'РАБОТА ЕДНО'),
            mk(1002, 2, 'b1', 'РАБОТА ДВЕ'),
            mk(1003, 3, 'b1', 'РАБОТА ТРИ'),
            mk(1004, 4, 'b1', 'РАБОТА ЧЕТИРИ'),
            mk(2001, 5, 'b2', 'ЛИЧНА ЕДНО'),
            mk(2002, 6, 'b2', 'ЛИЧНА ДВЕ')
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
ok(!seed.err && seed.seeded && seed.seeded.notes === 6, 'базата е засята преди старта: 2 борда, 6 бележки', seed);
if (fails) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

// --- Помощни функции ------------------------------------------------------------------------
// Водачът на демо асистента (снимка + балон) ляга върху картите — маха се преди всяко натискане.
const clearGuide = () => page.evaluate(() => {
    if (typeof window.removeGuide === 'function') { try { window.removeGuide(); } catch (e) { } }
    document.querySelectorAll('.guide-container, .speech-bubble, .guide-img').forEach(el => el.remove());
});

// Състоянието на прозорците идва от самия модел на приложението (getOpenNoteWindows), не от DOM-а.
const openWindows = () => page.evaluate(() => (typeof getOpenNoteWindows === 'function' ? getOpenNoteWindows() : [])
    .map(w => ({ id: String(w.body.dataset.id || ''), gdid: String(w.body.dataset.gdid || ''), hidden: !!w.hidden })));

const storedList = () => page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return 'unparsable: ' + raw.slice(0, 120); }
}, KEY);

const barVisible = () => page.evaluate(() => {
    const bar = document.getElementById('open-notes-bar');
    return !!(bar && bar.classList.contains('is-visible'));
});

const waitFor = (fn, arg, timeout = 8000) => page.waitForFunction(fn, arg, { timeout }).then(() => true, () => false);

// Приложението е готово И възстановяването (ако това дърво го има) е приключило.
const waitAppReady = async () => {
    const ready = await waitFor(() => {
        if (!document.body.classList.contains('app-ready')) return false;
        const done = (typeof openNotesRestoreDone === 'undefined') ? true : openNotesRestoreDone;
        const running = (typeof openNotesRestoreRunning === 'undefined') ? false : openNotesRestoreRunning;
        return done && !running;
    }, null, 30000);
    return ready;
};

const waitBoardCards = () => waitFor(() => document.querySelectorAll('#notes-container .note[data-i]').length >= 4, null, 30000);

// Точка върху картата, която не е закрита от отворен прозорец на бележка: прозорците плават над
// борда и на 390px закриват част от него. Търси се точка в самата карта през elementFromPoint.
const cardPoint = (id) => page.evaluate((id) => {
    const card = document.querySelector(`#notes-container .note[data-i="${id}"]`);
    if (!card) return { err: 'няма карта' };
    const scan = () => {
        const r = card.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return null;
        for (let fy = 0.75; fy >= 0.25; fy -= 0.25) {
            for (let fx = 0.5; fx >= 0.2; fx -= 0.3) {
                const x = Math.round(r.left + r.width * fx), y = Math.round(r.top + r.height * fy);
                if (x < 2 || y < 2 || x > window.innerWidth - 2 || y > window.innerHeight - 2) continue;
                const hit = document.elementFromPoint(x, y);
                if (hit && (hit === card || card.contains(hit))) return { x, y };
            }
        }
        return null;
    };
    let pt = scan();
    if (pt) return pt;
    for (const block of ['start', 'end', 'center']) {
        card.scrollIntoView({ block, inline: 'nearest' });
        pt = scan();
        if (pt) return pt;
    }
    return { err: 'закрита', box: card.getBoundingClientRect().toJSON() };
}, id);

// Отваря бележка с истински клик по картата на борда (както го прави човек).
const clickCard = async (id) => {
    await clearGuide();
    for (let attempt = 0; attempt < 3; attempt++) {
        const pt = await cardPoint(id);
        if (pt.err) { await page.waitForTimeout(200); continue; }
        await page.mouse.click(pt.x, pt.y);
        const opened = await waitFor((id) => typeof getOpenNoteWindows === 'function'
            && getOpenNoteWindows().some(w => String(w.body.dataset.id) === String(id)), id, 8000);
        if (opened) return { ok: true, pt };
    }
    return { ok: false };
};

// Горещият прозорец (най-голям z-index) — той е най-отпред и активен.
const topWindow = () => page.evaluate(() => {
    const wins = (typeof getOpenNoteWindows === 'function' ? getOpenNoteWindows() : []).filter(w => !w.hidden);
    if (!wins.length) return null;
    const top = wins.reduce((a, b) => (Number(b.el.style.zIndex) || 0) > (Number(a.el.style.zIndex) || 0) ? b : a);
    const btn = top.el.querySelector('.modal-close');
    if (!btn) return { id: String(top.body.dataset.id || ''), close: null };
    const r = btn.getBoundingClientRect();
    return { id: String(top.body.dataset.id || ''), close: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } };
});

const reloadApp = async () => {
    await page.reload({ waitUntil: 'load' });
    const ready = await waitAppReady();
    const cards = ready ? await waitBoardCards() : false;
    return { ready, cards };
};

// --- Старт на приложението в демо режим -----------------------------------------------------
await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
const firstReady = await waitAppReady();
const firstCards = firstReady ? await waitBoardCards() : false;
ok(firstReady && firstCards, 'приложението се вдигна и бордът има карти');
if (!firstReady || !firstCards) {
    console.log('няма смисъл да продължаваме без зареден борд');
    await browser.close(); srv.close();
    console.log('FAILED');
    process.exit(1);
}

// --- 1) Две бележки от борда: ключът държи точно тях, в реда на отваряне ---------------------
const before = await storedList();
ok(before === null, 'в началото в локалната памет няма списък на отворените бележки', before);

const chain = ['1001', '1002'];
let clicked = [];
for (const id of chain) {
    const r = await clickCard(id);
    ok(r.ok, `бележка ${id} се отваря с клик по картата ѝ`, r);
    if (r.ok) clicked.push(id);
}
ok(clicked.length === 2, 'двете бележки са отворени в два прозореца', clicked);
const barShown = await waitFor(() => {
    const bar = document.getElementById('open-notes-bar');
    return !!(bar && bar.classList.contains('is-visible'));
}, null, 5000);
ok(barShown, 'при две отворени бележки лентата се вижда');
let list = await storedList();
ok(Array.isArray(list), 'в локалната памет има списък на отворените бележки (' + KEY + ')', list);
const idsOf = (l) => (Array.isArray(l) ? l.map(e => String(e && e.id)) : []);
ok(Array.isArray(list) && idsOf(list).join(',') === chain.join(','),
    'списъкът съдържа точно двете отворени бележки в реда на отваряне', list);
ok(Array.isArray(list) && list.every(e => e && e.gdid), 'всеки запис в списъка носи и gdid на бележката', list);

// --- 2) Презареждане: двете бележки се отварят отново ---------------------------------------
let reload = await reloadApp();
ok(reload.ready && reload.cards, 'след презареждане приложението се вдигна', reload);
let wins = await openWindows();
ok(wins.length === 2, 'след презареждане са отворени двете бележки от списъка', wins);
ok(wins.map(w => w.id).sort().join(',') === chain.slice().sort().join(','), 'това са същите две бележки', wins);
ok(new Set(wins.map(w => w.id)).size === wins.length, 'няма дублиран прозорец за една и съща бележка', wins);
ok(wins.every(w => !w.hidden), 'двете бележки са видими, не скрити', wins);
const barAfter = await waitFor(() => {
    const bar = document.getElementById('open-notes-bar');
    return !!(bar && bar.classList.contains('is-visible'));
}, null, 5000);
ok(barAfter, 'след презареждане лентата се вижда');
list = await storedList();
ok(Array.isArray(list) && idsOf(list).sort().join(',') === chain.slice().sort().join(','),
    'след презареждане списъкът е налице и е същият', list);
const activeId = (await topWindow() || {}).id;
ok(chain.includes(activeId), 'най-отпред е една от възстановените бележки', activeId);

// --- 3) Затваряне на едната с X: една бележка, лентата се скрива, ключът го няма -------------
const top = await topWindow();
ok(!!(top && top.close), 'намира се X на горния прозорец', top);
let closed = false;
if (top && top.close) {
    await page.mouse.click(top.close.x, top.close.y);
    closed = await waitFor((id) => typeof getOpenNoteWindows === 'function'
        && getOpenNoteWindows().filter(w => !w.hidden).length === 1
        && !getOpenNoteWindows().some(w => String(w.body.dataset.id) === String(id)), top.id, 8000);
}
ok(closed, 'едната бележка се затваря с X', top);
const barGone = await waitFor(() => {
    const bar = document.getElementById('open-notes-bar');
    return !bar || !bar.classList.contains('is-visible');
}, null, 5000);
ok(barGone, 'при една отворена бележка лентата се скрива');
const cleared = await waitFor((key) => localStorage.getItem(key) === null, KEY, 5000);
list = await storedList();
ok(cleared && list === null, 'при скрита лента списъкът се изтрива от локалната памет', list);

// --- 4) Презареждане: нищо не се отваря, ключът още липсва ----------------------------------
reload = await reloadApp();
ok(reload.ready && reload.cards, 'след второто презареждане приложението се вдигна', reload);
await page.waitForTimeout(400);
wins = await openWindows();
ok(wins.length === 0, 'нищо не се отваря, когато в локалната памет няма списък', wins);
list = await storedList();
ok(list === null, 'ключът още го няма', list);
ok(!(await barVisible()), 'лентата не се вижда');

// --- 5) Три бележки: ключът има три, след презареждане трите са отворени ---------------------
const three = ['1001', '1002', '1003'];
clicked = [];
for (const id of three) {
    const r = await clickCard(id);
    ok(r.ok, `бележка ${id} се отваря с клик по картата ѝ (три бележки)`, r);
    if (r.ok) clicked.push(id);
}
list = await storedList();
ok(Array.isArray(list) && idsOf(list).join(',') === three.join(','), 'ключът има трите бележки в реда на отваряне', list);
reload = await reloadApp();
ok(reload.ready && reload.cards, 'след третото презареждане приложението се вдигна', reload);
wins = await openWindows();
ok(wins.length === 3, 'след презареждане са отворени трите бележки', wins);
ok(wins.map(w => w.id).sort().join(',') === three.slice().sort().join(','), 'това са същите три бележки', wins);
ok(new Set(wins.map(w => w.id)).size === 3, 'няма дублиран прозорец за една и съща бележка', wins);

// --- 6) Фалшив id до реален: отваря се само реалната бележка --------------------------------
await page.evaluate(({ key }) => {
    localStorage.setItem(key, JSON.stringify([
        { id: '999999', gdid: 'Note000000000999999999' },
        { id: '1001', gdid: 'Note000000000000001001' }
    ]));
}, { key: KEY });
reload = await reloadApp();
ok(reload.ready && reload.cards, 'след четвъртото презареждане приложението се вдигна', reload);
wins = await openWindows();
ok(wins.length === 1, 'отваря се само реалната бележка, фалшивият запис се прескача', wins);
ok(wins.length === 1 && wins[0].id === '1001', 'отворената бележка е точно реалната (1001)', wins);
ok(errs.length === 0, 'възстановяването с фалшив запис не хвърля изключение', errs.slice(0, 3));

// --- 7) Конзолата на страницата -------------------------------------------------------------
ok(errs.length === 0, 'нула изключения в конзолата на страницата в целия ход', errs.slice(0, 5));
ok(consoleErrs.length === 0, 'нула грешки (console.error) в конзолата на страницата в целия ход', consoleErrs.slice(0, 5));

if (process.env.SHOT) {
    await page.screenshot({ path: process.env.SHOT });
    console.log(`     (снимка: ${process.env.SHOT})`);
}

await browser.close();
srv.close();
console.log(fails ? `FAILED (${fails} от ${n})` : `OK (${n} проверки)`);
process.exit(fails ? 1 : 0);
