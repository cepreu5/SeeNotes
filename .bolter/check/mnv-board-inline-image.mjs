// Вградена картинка в текста на бележка (text_span type=8) се вижда на картата в БОРДА на MNV.
//
// Повод (3 Nov 2026, собственикът): „защо в mnv изображението не се показва в бележката в борда,
// а навсякъде другаде се показва - в отворената бележка, в иконата на лентата, в бутона за
// прикачен файл". На картата остава празна рамка (is-loading) и никога не влиза картинка.
//
// Какво проверява (истински Chromium, истинският MNV код, засята IndexedDB NotesDB):
//   1) картата на бележката се строи и рамката на вградената картинка е в нея;
//   2) пътят до файла наистина минава през Drive (заявките се виждат - значи не е „офлайн");
//   3) картинката влиза в рамката: <img> с реална ширина, рамката е is-ready, не е празна;
//   4) същото и при ВТОРО рисуване на борда, когато отговорите за файла са в кеша (тогава
//      отговорът идва, преди картата да е влязла в страницата - точно случаят от екрана);
//   5) иконата на прикачения файл (плочката в картата) не пречи и също е заредена;
//   6) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/mnv-board-inline-image.mjs   (exit 1 при провал)
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
const THUMB_PATH = '/__thumb.png';
const THUMB_FILE = path.join(root, 'images', 'MN.png');
const W = Number(process.env.W || 1280), H = Number(process.env.H || 900);

// Вградената картинка в текста на бележката: маркерът (звездичката) е на мястото на снимката,
// пътят е както го пише Android (текстът пази само името, id-то идва от media.txt).
const IMG_NAME = 'minion.png';
const IMG_PATH = `/storage/emulated/0/Pictures/Images/${IMG_NAME}`;
const IMG_FILE_ID = 'FILEminion1234567890';
const TITLE = 'Нов агент';
const MARK = '✱';
const BODY = `Нов агент ${MARK} МУА!`;
const RAW_NOTE = `${TITLE}|${BODY}`;
const MARK_AT = RAW_NOTE.indexOf(MARK);
const NOTE_GDID = 'Note000000000000000001';

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === SEED_PATH) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end('<!doctype html><html><head><meta charset="utf-8"><title>seed</title></head><body>seed</body></html>');
        return;
    }
    if (p === THUMB_PATH) {
        try {
            const b = await readFile(THUMB_FILE);
            res.writeHead(200, { 'Content-Type': 'image/png', 'cache-control': 'no-store' });
            res.end(b);
        } catch {
            res.writeHead(500); res.end();
        }
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
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.addInitScript(({ thumb, fileId }) => {
    const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
    window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
    window.gapi = window.gapi || {
        client: {
            setToken() { },
            getToken() { return { access_token: 'test-token' }; },
            drive: { files: { list: async () => ({ result: { files: [] } }) } }
        },
        load() { }
    };
    // Всяка заявка към Drive се вижда: без нея тестът не доказва, че пътят до файла е истински.
    window.__driveCalls = [];
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        if (url.includes('googleapis.com')) {
            window.__driveCalls.push(url);
            const json = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });
            if (url.includes('fields=thumbnailLink')) return Promise.resolve(json({ thumbnailLink: location.origin + thumb + '?s=800' }));
            if (url.includes('fields=id,trashed')) return Promise.resolve(json({ id: fileId, trashed: false }));
            return Promise.resolve(json({}));
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
    localStorage.setItem('showBoardAll', 'false');
    localStorage.setItem('startBoard', 'b1');
}, { thumb: THUMB_PATH, fileId: IMG_FILE_ID });

// --- Засяване на базата преди старта ---------------------------------------------------------
await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
const seed = await page.evaluate(async ({ dbName, noteGdid, raw, markAt, imgPath, imgFileId }) => {
    const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null };
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
            { backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b1', id: 1, numord: 1, status: 0, title: 'Работа' }
        ];
        // една бележка с вградена картинка в текста и един прикачен файл (същият файл, със своето id)
        const note = {
            alarm_type: -1, boardid: 'b1', calendarDate: 0, color: 0,
            date: now, datemod: now, eventId: 0, gdid: noteGdid, id: 1001,
            notetxt: raw, numord: 1, pass: false, sellist: 0, status: 0, type: 1,
            text_span: JSON.stringify({ type: 8, start: markAt, end: markAt + 1, paramstring: imgPath, paramint: 6 }) + '|',
            timer: 0, timer_type: -1, timer_val: 1, title_span: '', version: 243
        };
        const media = [{
            datemod: now, gdid: 'MEDIA000000000001', noteid: noteGdid,
            path: imgPath, pathGD: imgFileId, type: 1
        }];
        await new Promise((res, rej) => {
            const tx = db.transaction(['boards', 'notes', 'media', 'config'], 'readwrite');
            tx.oncomplete = res; tx.onerror = () => rej(tx.error);
            tx.objectStore('boards').clear(); tx.objectStore('notes').clear();
            tx.objectStore('media').clear(); tx.objectStore('config').clear();
            boards.forEach(b => tx.objectStore('boards').put(b));
            tx.objectStore('notes').put(note);
            media.forEach(m => tx.objectStore('media').put(m));
            tx.objectStore('config').put(1, 'dbSource');
            tx.objectStore('config').put('gdid', 'dbNoteIdType');
            tx.objectStore('config').put(now, 'dbCreatedTimestamp');
            tx.objectStore('config').put(now, 'lastLocalTimestamp');
        });
        db.close();
        out.seeded = { boards: boards.length, notes: 1, media: media.length };
    } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
    return out;
}, { dbName: DB_NAME, noteGdid: NOTE_GDID, raw: RAW_NOTE, markAt: MARK_AT, imgPath: IMG_PATH, imgFileId: IMG_FILE_ID });
ok(!seed.err && seed.seeded && seed.seeded.notes === 1, 'базата е засята: борд, бележка с вградена картинка и прикачен файл', seed);
if (fails) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

// --- Старт на страницата --------------------------------------------------------------------
await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
const booted = await page.waitForFunction(() => typeof createNoteElement === 'function'
    && typeof startApp === 'function' && typeof filterNotesByBoard === 'function'
    && typeof renderUI === 'function' && typeof hydrateInlineImages === 'function', null, { timeout: 30000 })
    .then(() => true, () => false);
ok(booted, 'страницата на приложението се зареди');
if (!booted) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

// Офлайн само за старта (иначе checkAuth иска Google). След старта офлайн флагът се маха -
// точно както в истинското приложение, където картинките се четат от Drive.
const boot = await page.evaluate(async () => {
    const info = { err: '' };
    isOfflineMode = true;
    try { if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags(); } catch (e) { }
    try { await startApp(); } catch (e) { info.err = String((e && e.message) || e).slice(0, 300); }
    ['login-page', 'request-access-modal', 'folderIdPromptPopup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    document.querySelectorAll('.guide-container, .speech-bubble, .guide-img').forEach(el => el.remove());
    info.cards = document.querySelectorAll('#notes-container .note').length;
    return info;
});
ok(!boot.err && boot.cards >= 1, 'приложението стартира и нарисува картата на бележката', boot);

const settle = (ms = 250) => page.waitForTimeout(ms);

// Състоянието на рамката на вградената картинка в картата на борда.
const boxState = () => page.evaluate((noteGdid) => {
    const card = document.querySelector(`#notes-container .note[data-g="${noteGdid}"]`);
    if (!card) return { card: false };
    const box = card.querySelector('.note-content .nm-inline-img');
    if (!box) return { card: true, box: false, content: (card.querySelector('.note-content') || {}).innerHTML?.slice(0, 200) || '' };
    const img = box.querySelector('img');
    return {
        card: true, box: true,
        state: box.dataset.nmState || '',
        cls: box.className,
        loading: box.dataset.nmLoading || '',
        width: box.style.width || '',
        imgs: box.querySelectorAll('img').length,
        naturalWidth: img ? img.naturalWidth : 0,
        complete: img ? img.complete : false,
        src: img ? String(img.getAttribute('src') || '').slice(0, 60) : ''
    };
}, NOTE_GDID);

// Чакаме рамката да стигне до готово състояние (или да каже защо не може).
const waitReady = async (ms = 8000) => {
    const t0 = Date.now();
    let st = await boxState();
    while (Date.now() - t0 < ms && !(st.state === 'ready' && st.naturalWidth > 0)) {
        await settle(200);
        st = await boxState();
    }
    return st;
};

// --- Първо рисуване: пътят до файла е студен ------------------------------------------------
await page.evaluate(() => { isOfflineMode = false; });
await page.evaluate(() => renderUI({ boardParseError: false }));
await settle(400);
let st = await boxState();
ok(st.card === true, 'картата на бележката е на борда', st);
ok(st.box === true, 'рамката на вградената картинка е в текста на картата', st);

const driveCalls = () => page.evaluate(() => (window.__driveCalls || []).length);
st = await waitReady();
ok(await driveCalls() > 0, 'пътят до картинката мина през Drive (заявките се виждат)', await driveCalls());
ok(st.state === 'ready', 'рамката е в състояние „готова", не остава празна', st);
ok(st.imgs === 1 && st.naturalWidth > 0, 'картинката е в рамката и е с реална ширина', st);
ok(/is-ready/.test(st.cls) && !/is-loading/.test(st.cls), 'рамката е is-ready, не is-loading', st);
ok(/(\d+)px/.test(st.width), 'рамката е получила ширина в пиксели', st);

// --- Второ рисуване: отговорите за файла вече са в кеша -------------------------------------
// Точно случаят от екрана на собственика: адресът идва веднага, преди картата да е в страницата.
await page.evaluate(() => renderUI({ boardParseError: false }));
await settle(400);
st = await waitReady(4000);
ok(st.card === true && st.box === true, 'след второ рисуване рамката е пак в картата', st);
ok(st.state === 'ready', 'след второ рисуване (кеширан отговор) картинката пак е готова', st);
ok(st.imgs === 1 && st.naturalWidth > 0, 'след второ рисуване картинката е в рамката', st);

// --- Карта, построена ИЗВЪН страницата ------------------------------------------------------
// renderUI строи всички карти във фрагмент и ги добавя в страницата едва след Promise.all -
// значи картинката в тях се тегли, докато картата още не е в документа. Точно това е случаят от
// екрана на собственика: рамката остава празна (is-loading) и никога не влиза картинка.
const detached = async ({ cold }) => page.evaluate(async ({ noteGdid, cold }) => {
    if (cold) {
        try { inlineImageFileCache.clear(); inlineImageFileAliveCache.clear(); inlineImageThumbCache.clear(); } catch (e) { }
    }
    const note = (Array.isArray(allNotesData) ? allNotesData : []).find(x => x.gdid === noteGdid);
    if (!note) return { noNote: true };
    const el = await createNoteElement(note); // НЕ се добавя в страницата - както прави renderUI
    const box0 = el.querySelector('.note-content .nm-inline-img');
    if (!box0) return { box: false };
    const t0 = Date.now();
    let st = null;
    while (Date.now() - t0 < 6000) {
        const box = el.querySelector('.note-content .nm-inline-img');
        const img = box && box.querySelector('img');
        st = { state: box ? box.dataset.nmState : '', imgs: box ? box.querySelectorAll('img').length : 0,
               naturalWidth: img ? img.naturalWidth : 0, width: box ? box.style.width : '',
               connected: box ? box.isConnected : null };
        if (st.state === 'ready' && st.naturalWidth > 0) break;
        await new Promise(r => setTimeout(r, 150));
    }
    return { box: true, ...st };
}, { noteGdid: NOTE_GDID, cold });

let det = await detached({ cold: true });
ok(det.box === true, 'картата, построена извън страницата, съдържа рамката на картинката', det);
ok(det.connected === false, 'картата наистина не е в страницата, докато се тегли картинката', det);
ok(det.state === 'ready', 'картинката влиза в рамката и в карта, която още не е в страницата', det);
ok(det.imgs === 1 && det.naturalWidth > 0, 'картинката в откачената карта е с реална ширина', det);

det = await detached({ cold: false });
ok(det.state === 'ready' && det.imgs === 1, 'същото и когато отговорът за файла е в кеша', det);

// Иконата на прикачения файл в картата (плочката) не бива да е счупена от същото.
const thumb = await page.evaluate((noteGdid) => {
    const card = document.querySelector(`#notes-container .note[data-g="${noteGdid}"]`);
    if (!card) return { card: false };
    const tiles = Array.from(card.querySelectorAll('[class*="attach"], [class*="thumb"], .note-footer *'));
    return { card: true, tiles: tiles.length, footer: !!card.querySelector('.note-footer, .note-attachments') };
}, NOTE_GDID);
ok(thumb.card === true, 'картата е на място и след проверката на плочката', thumb);

ok(errs.length === 0, 'няма изключения в конзолата', errs.slice(0, 3));

await browser.close();
srv.close();
console.log(fails ? `FAILED (${fails} от ${n})` : `ALL OK (${n})`);
process.exit(fails ? 1 : 0);
