// Отворените бележки в MNV се помнят в локалната памет и се отварят при старт (порт от cx-notes
// b3.69 + b3.70, MNV b1.87).
//
// Искане на собственика (5.11.2026): „Когато отворим повече от една бележка и се покаже лентата, да се
// поддържа в локалната памет списък от всички отворени бележки, който се изтрива при скриване на
// лентата. При стартиране на приложението, ако има такъв списък в локалната памет, бележките от него
// се отварят." и „За първата отворена бележка, независимо от режима Single note, също да има отделен
// запис в локалната памет, който се изтрива при затваряне на бележката или при показване на лентата."
//
// Какво проверява (истински Chromium, истинският MNV код, засята IndexedDB NotesDB, заглушени Google
// API, истински кликове по картите на борда и истинско презареждане на страницата):
//   1) в началото няма нито списък, нито запис;
//   2) две отворени бележки → лентата се вижда, списъкът държи точно тях в реда на отваряне, всеки
//      запис носи gdid, а отделният запис за една бележка не съществува;
//   3) след презареждане двете бележки се отварят сами, лентата се вижда, списъкът е същият;
//   4) „затвори всички" трие списъка, а след презареждане няма отворена бележка;
//   5) една отворена бележка → лентата я няма, пише се отделният запис, списък няма;
//   6) след презареждане тази една бележка се отваря, записът остава;
//   7) втора бележка → лентата се показва, отделният запис се трие, списъкът държи двете;
//   8) режим „единична бележка": лентата не се показва, но записаната бележка се отваря при старт;
//   9) нула изключения и нула console.error в целия ход.
//
// Пускане от корена на хранилището: node .bolter/check/mnv-open-notes-restore.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (контролата върху стария код пада).
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
const KEY_LIST = 'mnv_open_notes_list';
const KEY_SINGLE = 'mnv_open_note_single';

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

// Засяване на базата: два борда и шест бележки, за да има карти на борда, по които да се натиска.
const seedApp = (page) => page.evaluate(async (dbName) => {
    const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null };
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
    for (let i = 1; i <= 2; i++) {
        boards.push({ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b' + i, id: i, numord: i, status: 0, title: 'Борд ' + i });
    }
    const body = Array.from({ length: 8 }, (_, i) => `❖ Ред ${i + 1}: текст за пробата.`).join('\n');
    let k = 0;
    for (const b of boards) {
        for (let j = 1; j <= 3; j++) {
            k++;
            notes.push({
                alarm_type: -1, boardid: b.gdid, calendarDate: 0, color: 0,
                date: now - k * 1000, datemod: now - k * 1000, eventId: 0,
                gdid: `Note${String(1000 + k).padStart(18, '0')}`, id: 1000 + k,
                notetxt: `Бележка ${1000 + k}|${body}`, numord: k, pass: false, sellist: 0, status: 0, type: 1,
                text_span: '', timer: 0, timer_type: -1, timer_val: 1, title_span: '', version: 243
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
}, DB_NAME);

const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 }, serviceWorkers: 'block'
});
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = [], consoleErrs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => {
    if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) consoleErrs.push(String(m.text()).slice(0, 300));
});
await page.addInitScript(() => {
    const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
    window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
    window.gapi = window.gapi || { client: { setToken() { }, getToken() { return { access_token: 'test-token' }; }, drive: { files: { list: async () => ({ result: { files: [] } }) } } }, load() { } };
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.includes('googleapis.com')) {
            return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }
        return realFetch(input, init);
    };
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
    localStorage.setItem('showBoardAll', 'true');
    localStorage.setItem('startBoard', 'all');
    localStorage.setItem('showWeeklyCalendar', 'false');
    localStorage.setItem('singleNoteMode', 'false');
    localStorage.removeItem('noteShadeOn');
    localStorage.removeItem('noteWindowGeometry');
});

// Собственият старт на приложението, офлайн: checkAuth иска Google, затова се влиза направо през
// startApp (както в останалите MNV проверки).
const boot = async () => {
    const ready = await page.waitForFunction(() => typeof createNoteElement === 'function'
        && typeof startApp === 'function' && typeof showModal === 'function'
        && typeof getOpenNoteWindows === 'function' && typeof mediaData !== 'undefined', null, { timeout: 30000 })
        .then(() => true, () => false);
    if (!ready) return { ready: false };
    const info = await page.evaluate(async () => {
        const out = { err: '' };
        isOfflineMode = true;
        try { if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags(); } catch (e) { }
        try { await startApp(); } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
        ['login-page', 'request-access-modal', 'folderIdPromptPopup'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        // Продуктовата обиколка „какво ново" слага речев балон в средата на екрана и приема кликове.
        try { localStorage.setItem('app_version_seen', typeof version !== 'undefined' ? version : 'Beta 1.87'); } catch (e) { }
        try { window.removeGuide(); } catch (e) { }
        if (typeof window.showStep === 'function') window.showStep = () => { try { window.removeGuide(); } catch (e) { } };
        document.querySelectorAll('.guide-container, .speech-bubble, .guide-img').forEach(el => el.remove());
        return out;
    });
    await page.waitForFunction(() => document.querySelectorAll('#notes-container .note[data-i]').length >= 4, null, { timeout: 30000 }).catch(() => { });
    info.cards = await page.evaluate(() => document.querySelectorAll('#notes-container .note[data-i]').length);
    return { ready: true, ...info };
};

const reloadApp = async () => {
    await page.reload({ waitUntil: 'load' });
    return boot();
};

// Състоянието, което проверяваме: отворените прозорци (id/gdid) и дали лентата се вижда.
const STATE = () => {
    const bar = document.getElementById('open-notes-bar');
    const wins = (typeof getOpenNoteWindows === 'function' ? getOpenNoteWindows() : []);
    return {
        windows: wins.map(w => ({ id: String(w.body.dataset.id || ''), gdid: String(w.body.dataset.gdid || ''), hidden: !!w.hidden })),
        barShown: !!bar && bar.classList.contains('is-visible') && getComputedStyle(bar).display !== 'none' && bar.getBoundingClientRect().height > 0,
        list: localStorage.getItem('mnv_open_notes_list'),
        single: localStorage.getItem('mnv_open_note_single'),
        mode: localStorage.getItem('singleNoteMode')
    };
};
const state = () => page.evaluate(STATE);
const storedList = () => page.evaluate(() => { try { const r = localStorage.getItem('mnv_open_notes_list'); return r ? JSON.parse(r) : null; } catch (e) { return 'broken'; } });
const storedSingle = () => page.evaluate(() => { try { const r = localStorage.getItem('mnv_open_note_single'); return r ? JSON.parse(r) : null; } catch (e) { return 'broken'; } });
const ids = (list) => (Array.isArray(list) ? list.map(e => String(e && e.id)) : []);

// Точка върху картата, която не е закрита от отворен прозорец на бележка.
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
    for (let attempt = 0; attempt < 3; attempt++) {
        const pt = await cardPoint(id);
        if (pt.err) { await page.waitForTimeout(200); continue; }
        await page.mouse.click(pt.x, pt.y);
        await page.waitForFunction((id) => typeof getOpenNoteWindows === 'function'
            && getOpenNoteWindows().some(w => String(w.body.dataset.id) === String(id)), id, { timeout: 8000 }).catch(() => { });
        const opened = (await state()).windows.some(w => w.id === String(id));
        if (opened) return { ok: true, pt };
    }
    return { ok: false };
};

// --- Старт ------------------------------------------------------------------------------------
await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
const seeded = await seedApp(page);
ok(seeded && seeded.notes === 6, 'базата е засята: два борда и шест бележки', seeded);
await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
let b = await boot();
ok(b.ready && !b.err && b.cards >= 4, 'приложението стартира и бордът има карти', b);
if (!b.ready || !b.cards) {
    console.log('няма смисъл да продължаваме без зареден борд');
    await browser.close(); srv.close();
    console.log('FAILED');
    process.exit(1);
}

// --- 1) В началото няма нито списък, нито запис -----------------------------------------------
let s = await state();
ok(s.list === null, 'в началото в локалната памет няма списък на отворените бележки', s.list);
ok(s.single === null, 'в началото няма и запис за една отворена бележка', s.single);
ok(s.windows.length === 0, 'в началото няма отворена бележка', s.windows);

// --- 2) Две бележки: списъкът държи точно тях, записът за една бележка изчезва ----------------
const chain = ['1001', '1002'];
for (const id of chain) {
    const r = await clickCard(id);
    ok(r.ok, `бележка ${id} се отваря с клик по картата ѝ`, r);
}
await page.waitForTimeout(400);
s = await state();
ok(s.barShown, 'при две отворени бележки лентата се вижда', s);
let list = await storedList();
ok(Array.isArray(list), `в локалната памет има списък на отворените бележки (${KEY_LIST})`, list);
ok(ids(list).join(',') === chain.join(','), 'списъкът съдържа точно двете отворени бележки в реда на отваряне', list);
ok(Array.isArray(list) && list.every(e => e && e.gdid), 'всеки запис в списъка носи и gdid на бележката', list);
ok((await storedSingle()) === null, 'щом лентата се покаже, записът за една бележка не съществува', await storedSingle());

// --- 3) След презареждане двете бележки се отварят сами ---------------------------------------
b = await reloadApp();
ok(b.ready && !b.err && b.cards >= 4, 'след презареждане приложението се вдигна', b);
await page.waitForFunction(() => getOpenNoteWindows().length >= 2, null, { timeout: 10000 }).catch(() => { });
await page.waitForTimeout(400);
s = await state();
ok(s.windows.length === 2, 'след презареждане двете бележки са отворени отново', s.windows);
ok(s.windows.map(w => w.id).sort().join(',') === chain.join(','), 'отворили са се точно записаните бележки', s.windows);
ok(s.barShown, 'след презареждане лентата се вижда отново', s);
list = await storedList();
ok(ids(list).join(',') === chain.join(','), 'списъкът е същият и след възстановяването', list);

// --- 4) „Затвори всички" трие списъка ---------------------------------------------------------
await page.locator('#open-notes-bar .open-notes-bar-close').click();
await page.waitForFunction(() => getOpenNoteWindows().length === 0, null, { timeout: 8000 }).catch(() => { });
await page.waitForTimeout(400);
s = await state();
ok(s.windows.length === 0, '„затвори всички" затваря бележките', s.windows);
ok(s.list === null, 'при нула отворени бележки списъкът се трие', s.list);
ok(s.single === null, 'и записът за една бележка е празен', s.single);

b = await reloadApp();
ok(b.ready && b.cards >= 4, 'след второто презареждане приложението се вдигна', b);
await page.waitForTimeout(600);
s = await state();
ok(s.windows.length === 0, 'след презареждане няма отворена бележка (списъкът е бил изтрит)', s.windows);

// --- 5) Една бележка: пише се отделният запис ------------------------------------------------
const singleId = '1003';
let r = await clickCard(singleId);
ok(r.ok, `бележка ${singleId} се отваря с клик по картата ѝ`, r);
await page.waitForTimeout(400);
s = await state();
ok(!s.barShown, 'при една отворена бележка лентата не се показва', s);
const rec = await storedSingle();
ok(rec && String(rec.id) === singleId && !!rec.gdid, 'едната отворена бележка се помни в отделен запис', rec);
ok(s.list === null, 'списък не се пише, докато лентата я няма', s.list);

// --- 6) След презареждане тази бележка се отваря ----------------------------------------------
b = await reloadApp();
ok(b.ready && b.cards >= 4, 'след третото презареждане приложението се вдигна', b);
await page.waitForFunction(() => getOpenNoteWindows().length >= 1, null, { timeout: 10000 }).catch(() => { });
await page.waitForTimeout(400);
s = await state();
ok(s.windows.length === 1 && s.windows[0].id === singleId, 'записаната бележка се отваря при старт', s.windows);
const recKept = await storedSingle();
ok(recKept && String(recKept.id) === singleId, 'записът остава налице и след възстановяването', recKept);
ok(s.list === null, 'списъкът не се появява при една бележка', s.list);

// --- 7) Втора бележка: лентата поема, записът се трие ----------------------------------------
const secondId = '1004';
r = await clickCard(secondId);
ok(r.ok, `втората бележка ${secondId} се отваря`, r);
await page.waitForTimeout(500);
s = await state();
ok(s.barShown, 'при втора бележка лентата се показва', s);
list = await storedList();
ok(Array.isArray(list) && ids(list).length === 2 && ids(list).includes(singleId) && ids(list).includes(secondId),
    'списъкът държи двете отворени бележки', list);
ok((await storedSingle()) === null, 'щом лентата се покаже, отделният запис се трие', await storedSingle());

b = await reloadApp();
ok(b.ready && b.cards >= 4, 'след четвъртото презареждане приложението се вдигна', b);
await page.waitForFunction(() => getOpenNoteWindows().length >= 2, null, { timeout: 10000 }).catch(() => { });
await page.waitForTimeout(400);
s = await state();
ok(s.windows.length === 2, 'след презареждане двете бележки се отварят отново', s.windows);
ok(s.barShown, 'и лентата се вижда', s);

// --- 8) Режим „единична бележка": лентата я няма, но бележката се връща ----------------------
await page.evaluate(() => { localStorage.setItem('singleNoteMode', 'true'); localStorage.removeItem('mnv_open_notes_list'); });
await page.locator('#open-notes-bar .open-notes-bar-close').click().catch(() => { });
await page.waitForFunction(() => getOpenNoteWindows().length === 0, null, { timeout: 8000 }).catch(() => { });
await page.waitForTimeout(300);
r = await clickCard('1005');
ok(r.ok, 'в режим „единична бележка" бележка 1005 се отваря', r);
await page.waitForTimeout(400);
s = await state();
ok(!s.barShown, 'в режим „единична бележка" лентата не се показва', s);
const rec2 = await storedSingle();
ok(rec2 && String(rec2.id) === '1005', 'режимът пише отделния запис', rec2);

b = await reloadApp();
ok(b.ready && b.cards >= 4, 'след презареждане в режим „единична бележка" приложението се вдигна', b);
await page.waitForFunction(() => getOpenNoteWindows().length >= 1, null, { timeout: 10000 }).catch(() => { });
await page.waitForTimeout(400);
s = await state();
ok(s.windows.length === 1 && s.windows[0].id === '1005', 'в режим „единична бележка" записаната бележка се отваря при старт', s.windows);
ok(!s.barShown, 'в режим „единична бележка" лентата не се показва и след възстановяването', s);
ok((await storedList()) === null, 'списъкът не се появява в режим „единична бележка"', await storedList());
await page.evaluate(() => localStorage.setItem('singleNoteMode', 'false'));

// --- 9) Конзолата на страницата ---------------------------------------------------------------
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
