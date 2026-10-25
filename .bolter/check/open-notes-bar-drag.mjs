// Преподреждане на плочките в лентата с плъзгане (b1.50, порт от cx-notes b2.83).
// Собственикът (25.10.2026): „dragging along the bar да премества бутона на бележките в рамките на
// лентата за преподреждане".
// Проверява се по ИСТИНСКИЯ път в браузър - истински прозорци (showModal) и истински показалец:
//   1) при 4 отворени бележки плъзгане на ТРЕТАТА плочка пред първата дава нов DOM ред;
//   2) window.refreshOpenNotesBar() НЕ връща стария ред (редът се пази в модулния масив и се прилага
//      при всяко опресняване);
//   3) редът се записва в localStorage (cx_open_notes_bar_order) и оцелява след презареждане - дори
//      когато след него бележките се отворят в друг ред;
//   4) нова бележка влиза в КРАЯ, без да разваля подредбата, а затворена бележка изчезва от реда;
//   5) плъзгането не скрива/показва/затваря нищо (кликът след плъзгане се прескача от
//      bar._barDragged), а дългото натискане (500ms) само ВДИГА плочката - местенето тръгва от първото
//      движение, без праг, и нищо не се затваря (b1.52);
//   6) плъзгане, започнало на ФОНА на лентата, още скролва (scrollLeft се мени) и не мести плочки;
//   7) на 390px при 8 бележки редът се приплъзва и пак се преподрежда с плъзгане;
//   8) плъзганата плочка носи клас is-dragging, а на плочките има touch-action: pan-y.
//   9) истински ПРЪСТ (CDP Input.dispatchTouchEvent, не показалец на мишка): задържане 500ms и
//      плъзгане МЕСТИ плочката - и върху плочка със снимка (has-thumb), и когато родният жест за дълго
//      натискане поеме пръста, както е на Android (тук: истински pointercancel след вдигането). Върху
//      плочките няма родно меню и маркиране: contextmenu/selectstart са отменени (b1.55).
// Пуска се от корена на хранилището:
//   node .bolter/check/open-notes-bar-drag.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Приложението е index-2.html (то зарежда main.js); index.html е само splash.
const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index-2.html' : p;
    try {
        const b = await readFile(path.join(root, rel));
        res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(b);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 500) : ''));
    if (!cond) fails++;
};

// Chromium в сандбокса е под два номера: взимаме този, който наистина е на място.
const CHROME = [
    '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome',
    '/opt/ms-playwright/chromium-1248/chrome-linux64/chrome',
].find(p => existsSync(p));
const browser = await chromium.launch(CHROME ? { executablePath: CHROME, args: ['--num-raster-threads=4'] } : { args: ['--num-raster-threads=4'] });

// Целият външен свят се отговаря на място: проверката не излиза в мрежата (същият начин като
// open-notes-bar.mjs - приложението стартира без истински Drive).
async function mockExternal(ctx) {
    await ctx.route(/^https?:\/\/(?!localhost)/, route => {
        const url = route.request().url();
        if (url.startsWith('https://accounts.google.com/gsi/client')) {
            return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
        }
        if (url.startsWith('https://storage.ko-fi.com/')) {
            return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.kofiWidgetOverlay={draw(){},update(){}};' });
        }
        if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
}

// hasTouch е включен, за да може истинският пръст (CDP Input.dispatchTouchEvent) да провери местенето
// след задържане - на телефон точно там то се чупеше (b1.55).
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', hasTouch: true });
await mockExternal(ctx);
await ctx.addInitScript(() => {
    // main пита Drive през gapi: празни отговори, за да не тръгва истинско теглене.
    window.gapi = {
        load() { },
        client: {
            setToken() { }, getToken() { return { access_token: 'tok' }; },
            drive: {
                files: {
                    list() { return Promise.resolve({ result: { files: [] } }); },
                    get() { return Promise.resolve({ result: {} }); },
                },
            },
        },
        auth: { getToken() { return { access_token: 'tok' }; } },
    };
    try {
        localStorage.setItem('language', 'bg');
        localStorage.setItem('singleNoteMode', 'false');
        // cx_open_notes_bar_order НЕ се трие: addInitScript се пуска при ВСЯКО зареждане, а тестът
        // проверява точно това - че редът оцелява след презареждане на страницата.
    } catch (e) { }
});

const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof showModal === 'function' && typeof initNoteWindows === 'function', null, { timeout: 20000 });

// Минималното състояние, което прозорците искат: без логин и без теглене от Drive.
const BOOT = `(() => {
    useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
    dbSourceGlobal = null; dirHandle = null; isOfflineMode = false;
    authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
    notesContainer = document.getElementById('notes-container');
    searchBox = document.getElementById('search-box');
    if (!noteWindows || !noteWindows.length) initNoteWindows();
    return { windows: noteWindows.length, open: getOpenNoteWindows().length };
})()`;
const boot = await page.evaluate(BOOT);
if (!(boot.windows >= 1 && boot.open === 0)) {
    ok(false, 'приложението стартира с празен прозорец и без отворени бележки', boot);
}
errs.length = 0; // шумът от стартирането без Drive не е това, което този тест мери

// --- Бележките: осем на брой, всяка със свой gdid/id -------------------------------------------
const NOTES = [
    { gdid: 'DGB1', id: 9201, raw: 'Първа бележка' },
    { gdid: 'DGB2', id: 9202, raw: 'Втора бележка' },
    { gdid: 'DGB3', id: 9203, raw: 'Трета бележка' },
    { gdid: 'DGB4', id: 9204, raw: 'Четвърта бележка' },
    { gdid: 'DGB5', id: 9205, raw: 'Пета бележка' },
    { gdid: 'DGB6', id: 9206, raw: 'Шеста бележка' },
    { gdid: 'DGB7', id: 9207, raw: 'Седма бележка' },
    { gdid: 'DGB8', id: 9208, raw: 'Осма бележка' },
];

// Отваря бележка по истинския път на приложението (showModal), както клик на картата на борда.
const openNote = (gdid) => page.evaluate((def) => {
    useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
    dbSourceGlobal = null; dirHandle = null; isOfflineMode = false;
    authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
    if (!allNotesData.some(x => String(x.gdid) === def.gdid)) {
        const now = Date.now();
        allNotesData.push({
            alarm_type: -1, boardid: 'B1', calendarDate: 0, color: 0, date: now, datemod: now, eventId: 0,
            gdid: def.gdid, id: def.id, notetxt: def.raw, numord: def.id, sellist: 0, status: 0,
            text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
        });
    }
    showModal({ raw: def.raw, format: '', id: def.id, gdid: def.gdid, boardId: 'B1' });
}, NOTES.find(x => x.gdid === gdid));

// Затваря прозореца на бележка през истинския X (същият път като клик на потребителя).
const closeNoteByX = (gdid) => page.evaluate((gdid) => {
    const win = getOpenNoteWindows().find(w => w.body.dataset.gdid === gdid);
    if (!win) return false;
    activateNoteWindow(win, true);
    win.el.querySelector('.modal-close').click();
    return true;
}, gdid);

// Два кадъра: подредбата и класовете са приложени, преди да се мери.
const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// Редът на плочките в лентата (по gdid) и записаният в localStorage ред.
const tileOrder = () => page.evaluate(() => [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')]
    .map(t => (t.dataset.barKey || '').split('\u0000')[1] || ''));
const storedOrder = () => page.evaluate(() => {
    try {
        const list = JSON.parse(localStorage.getItem('cx_open_notes_bar_order') || 'null');
        return Array.isArray(list) ? list.map(k => String(k).split('\u0000')[1] || '') : null;
    } catch (e) { return 'BAD'; }
});
const windowsState = () => page.evaluate(() => ({
    open: getOpenNoteWindows().map(w => ({ gdid: w.body.dataset.gdid || '', hidden: !!w.hidden, active: w === activeNoteWindow })),
    activeGdid: (activeNoteWindow && activeNoteWindow.body.dataset.gdid) || '',
}));

// Мястото на плочка по gdid: центърът ѝ на екрана.
const tileCentre = (gdid) => page.evaluate((gdid) => {
    const t = [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')]
        .find(x => (x.dataset.barKey || '').includes(gdid));
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}, gdid);

// Истинско плъзгане с показалеца: натискане върху плочката, междинни стъпки (прагът е 10px) и пускане
// в targetX. Връща и какво е станало по средата на жеста (класът is-dragging).
const dragTileTo = async (gdid, targetX, onMidway) => {
    const p = await tileCentre(gdid);
    if (!p) return { started: false };
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + Math.sign(targetX - p.x) * 14, p.y, { steps: 4 });
    const mid = onMidway ? await onMidway() : null;
    await page.mouse.move(targetX, p.y, { steps: 10 });
    await page.mouse.up();
    await settle();
    return { started: true, mid };
};

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Информация за видимата част на лентата (за жеста по фона и за проверката на скрола).
const stripInfo = () => page.evaluate(() => {
    const s = document.querySelector('#open-notes-bar .open-notes-bar-strip');
    const r = s.getBoundingClientRect();
    return {
        scrollLeft: Math.round(s.scrollLeft), scrollWidth: Math.round(s.scrollWidth), clientWidth: Math.round(s.clientWidth),
        left: r.left, right: r.right, top: r.top, bottom: r.bottom, midY: Math.round(r.top + r.height / 2),
    };
});

// --- 1) Четири бележки: плочките са в реда на отваряне -----------------------------------------
for (const g of ['DGB1', 'DGB2', 'DGB3', 'DGB4']) await openNote(g);
await settle();
let ord = await tileOrder();
ok(same(ord, ['DGB1', 'DGB2', 'DGB3', 'DGB4']), `при 4 отворени бележки плочките са в реда на отваряне (${ord.join(' ')})`, ord);

const tileCss = await page.evaluate(() => {
    const t = document.querySelector('#open-notes-bar .open-notes-bar-tile');
    const cs = getComputedStyle(t);
    const r = t.getBoundingClientRect();
    return { touchAction: cs.touchAction, userSelect: cs.userSelect, w: Math.round(r.width), h: Math.round(r.height), cursor: cs.cursor };
});
// Собственикът (25.10.2026): „Плъзгането на лентата при препълване не се получава, местят се плочките."
// Затова хоризонталният жест върху плочка вече е СКРОЛ на лентата (pan-x), а местенето с пръст тръгва
// само след задържане - виж open-notes-bar-scroll-arrows.mjs.
ok(tileCss.touchAction === 'pan-x',
    `плочките имат touch-action: pan-x - хоризонталният жест скролва лентата (${tileCss.touchAction})`, tileCss);
ok(tileCss.userSelect === 'none', `плочките не се маркират при плъзгане (user-select ${tileCss.userSelect})`, tileCss);
ok(tileCss.w === 40 && tileCss.h === 40, `плочката е още 40x40 (${tileCss.w}x${tileCss.h})`, tileCss);

// --- 2) Плъзгане на ТРЕТАТА плочка пред първата -----------------------------------------------
const wsBeforeDrag = await windowsState();
const p1 = await tileCentre('DGB1');
const midState = async () => page.waitForFunction(() => {
    const t = document.querySelector('#open-notes-bar .open-notes-bar-tile.is-dragging');
    if (!t) return null;
    const cs = getComputedStyle(t);
    const m = String(cs.transform).match(/^matrix\(([\d.]+)/);
    const scale = m ? Number(m[1]) : 1;
    // Изчаква се преходът (0.15s) да стигне до вдигането - иначе се мери средата му.
    if (Math.abs(scale - 1.06) > 0.008) return null;
    return {
        key: (t.dataset.barKey || '').split('\u0000')[1],
        opacity: Number(cs.opacity),
        scale,
        filter: cs.filter,
        z: Number(cs.zIndex) || 0,
    };
}, null, { timeout: 2000 }).then(h => h.jsonValue()).catch(() => null);

const drag1 = await dragTileTo('DGB3', p1.x - 12, midState);
ok(drag1.started, 'плъзгането на третата плочка тръгва');
ok(drag1.mid && drag1.mid.key === 'DGB3', `по средата на жеста класът is-dragging е на плъзганата плочка (${drag1.mid && drag1.mid.key})`, drag1.mid);
ok(drag1.mid && drag1.mid.opacity > 0.85 && drag1.mid.opacity < 1,
    `плъзганата плочка е леко прозрачна (opacity ${drag1.mid && drag1.mid.opacity})`, drag1.mid);
ok(drag1.mid && drag1.mid.scale > 1.04 && drag1.mid.scale < 1.08,
    `плъзганата плочка е леко уголемена (scale ${drag1.mid && drag1.mid.scale})`, drag1.mid);
ok(drag1.mid && drag1.mid.filter !== 'none', `плъзганата плочка носи по-силна сянка (filter ${drag1.mid && drag1.mid.filter})`, drag1.mid);
ok(drag1.mid && drag1.mid.z >= 3, `плъзганата плочка е над останалите (z-index ${drag1.mid && drag1.mid.z})`, drag1.mid);

const ord1 = await tileOrder();
ok(same(ord1, ['DGB3', 'DGB1', 'DGB2', 'DGB4']),
    `след пускането третата плочка е ПЪРВА (${ord1.join(' ')})`, ord1);
ok(!(await page.evaluate(() => !!document.querySelector('#open-notes-bar .open-notes-bar-tile.is-dragging'))),
    'след пускането класът is-dragging е махнат');

// Нищо не е скрито/показано/затворено от плъзгането - и активната бележка е същата.
const wsAfterDrag = await windowsState();
ok(wsAfterDrag.open.length === wsBeforeDrag.open.length,
    `плъзгането не затваря бележка (отворени ${wsBeforeDrag.open.length} -> ${wsAfterDrag.open.length})`, { wsBeforeDrag, wsAfterDrag });
ok(same(wsAfterDrag.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).sort(), wsBeforeDrag.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).sort()),
    `плъзгането не скрива и не показва никоя бележка (${wsAfterDrag.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).join(' ')})`, { wsBeforeDrag, wsAfterDrag });
ok(wsAfterDrag.activeGdid === wsBeforeDrag.activeGdid,
    `плъзгането не сменя активната бележка (${wsBeforeDrag.activeGdid} -> ${wsAfterDrag.activeGdid})`, { wsBeforeDrag, wsAfterDrag });

// --- 3) Опресняването пази новия ред ----------------------------------------------------------
await page.evaluate(() => window.refreshOpenNotesBar());
await settle();
const ordRefresh = await tileOrder();
ok(same(ordRefresh, ['DGB3', 'DGB1', 'DGB2', 'DGB4']),
    `window.refreshOpenNotesBar() не връща стария ред (${ordRefresh.join(' ')})`, ordRefresh);

// --- 4) Редът е записан в localStorage --------------------------------------------------------
const stored1 = await storedOrder();
ok(same(stored1, ['DGB3', 'DGB1', 'DGB2', 'DGB4']),
    `редът е записан в localStorage под cx_open_notes_bar_order (${(stored1 || []).join(' ')})`, stored1);

// --- 5) Плъзгане в рамките на СЪЩАТА плочка не отваря/скрива бележката ------------------------
// Кликът, който браузърът праща след пускането, попада върху същата плочка (пазачът bar._barDragged
// го прескача) - иначе едно плъзгане би превключило бележката, която местиш.
{
    const wsBefore = await windowsState();
    const p2 = await tileCentre('DGB2');
    const ordBefore = await tileOrder();
    await page.mouse.move(p2.x, p2.y);
    await page.mouse.down();
    await page.mouse.move(p2.x + 15, p2.y, { steps: 4 });
    await page.mouse.move(p2.x + 2, p2.y, { steps: 3 });
    await page.mouse.up();
    await settle();
    const wsAfter = await windowsState();
    const ordAfter = await tileOrder();
    ok(same(ordAfter, ordBefore), `плъзгане в рамките на една плочка не разменя нищо (${ordAfter.join(' ')})`, { ordBefore, ordAfter });
    ok(same(wsAfter.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')), wsBefore.open.map(w => w.gdid + (w.hidden ? 'h' : 'v'))),
        `кликът след плъзгане не скрива/показва бележка (${wsAfter.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).join(' ')})`, { wsBefore, wsAfter });
}

// --- 6) Плъзгане, което трае повече от 500ms, не затваря бележката ----------------------------
// Задържането се отменя от самото плъзгане: иначе жестът, с който местиш плочката, би затворил
// бележката след 500ms (tile._cancelLongPress).
{
    const wsBefore = await windowsState();
    const p3 = await tileCentre('DGB4');
    await page.mouse.move(p3.x, p3.y);
    await page.mouse.down();
    await page.mouse.move(p3.x - 18, p3.y, { steps: 4 });
    await page.waitForTimeout(650);
    await page.mouse.up();
    await settle();
    const wsAfter = await windowsState();
    ok(wsAfter.open.some(w => w.gdid === 'DGB4'),
        `плъзгане, което трае 650ms, не затваря бележката, която местиш (отворени ${wsBefore.open.length} -> ${wsAfter.open.length})`, { wsBefore, wsAfter });
    ok(wsAfter.open.length === wsBefore.open.length,
        `и не затваря никоя друга (отворени ${wsBefore.open.length} -> ${wsAfter.open.length})`, { wsBefore, wsAfter });
}

// --- 7) Нова бележка влиза в КРАЯ, без да разваля подредбата ----------------------------------
{
    const before = await tileOrder();
    await openNote('DGB5');
    await settle();
    const after = await tileOrder();
    ok(same(after.slice(0, before.length), before),
        `новата бележка не разваля подредбата (${before.join(' ')} -> ${after.join(' ')})`, { before, after });
    ok(after[after.length - 1] === 'DGB5', `новата бележка влиза в КРАЯ на лентата (${after.join(' ')})`, after);
    ok(same(await storedOrder(), after), `и редът в localStorage се допълва с нея (${((await storedOrder()) || []).join(' ')})`, await storedOrder());
}

// --- 8) Затворена бележка излиза от реда; отворена наново - в края ----------------------------
{
    const before = await tileOrder();
    ok(await closeNoteByX('DGB1'), 'бележка DGB1 се затваря през своя X');
    await settle();
    const afterClose = await tileOrder();
    ok(!afterClose.includes('DGB1'), `плочката на затворената бележка изчезва от лентата (${afterClose.join(' ')})`, afterClose);
    ok(!((await storedOrder()) || []).includes('DGB1'), 'ключът на затворената бележка се маха от запомнения ред', await storedOrder());
    ok(same(afterClose, before.filter(g => g !== 'DGB1')),
        `останалите пазят реда си (${afterClose.join(' ')})`, { before, afterClose });
    await openNote('DGB1');
    await settle();
    const afterReopen = await tileOrder();
    ok(afterReopen[afterReopen.length - 1] === 'DGB1',
        `отворена наново, бележката влиза в края (${afterReopen.join(' ')})`, afterReopen);
}

// --- 9) Задържане ВДИГА плочката, а местенето тръгва от първото движение (b1.52) ----------------
// Собственикът (25.10.2026): „Продължително натискане само за местене, не затваря". Задържане 500ms
// върху плочка я вдига (is-dragging) - същото повдигане като при плъзгане - а после и 3px движение, под
// стария праг от 10px, вече местят: редът се сменя и се записва. Задържане и пускане без движение не
// променя реда, не затваря и не скрива нищо.
{
    // а) Задържане 500ms и след него малко движение: местенето тръгва ПОД стария праг.
    const before = await tileOrder();
    const moved = before[2];
    const firstCentre = await tileCentre(before[0]);
    const p = await tileCentre(moved);
    const wsBeforeHeld = await windowsState();
    const heldTile = () => page.evaluate(() => {
        const t = document.querySelector('#open-notes-bar .open-notes-bar-tile.is-dragging');
        if (!t) return null;
        const cs = getComputedStyle(t);
        const m = String(cs.transform).match(/^matrix\(([\d.]+)/);
        return {
            key: (t.dataset.barKey || '').split('\u0000')[1],
            scale: m ? Number(m[1]) : 1,
            opacity: Number(cs.opacity),
        };
    });
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.waitForTimeout(620);
    const heldState = await heldTile();
    ok(heldState && heldState.key === moved,
        `задържане 500ms вдига точно тази плочка (${heldState && heldState.key})`, heldState);
    ok(heldState && heldState.scale > 1.04 && heldState.opacity < 1,
        `вдигнатата плочка изглежда както при плъзгане: уголемена и леко прозрачна (scale ${heldState && heldState.scale}, opacity ${heldState && heldState.opacity})`, heldState);
    // 3px надясно - под стария праг от 10px. След задържане това вече е местене: жестът е започнал.
    await page.mouse.move(p.x + 3, p.y);
    const smallMove = await page.evaluate(() => {
        const s = document.querySelector('#open-notes-bar .open-notes-bar-strip');
        const d = s && s._barDrag;
        return { started: !!(d && d.started), tileIsLifted: !!(d && d.tile && d.tile.classList.contains('is-dragging')) };
    });
    ok(smallMove.started,
        `след задържане местенето тръгва от 3px движение - без прага от 10px (започнал жест ${smallMove.started})`, smallMove);
    // Останалото движение до преди първата плочка сменя реда.
    await page.mouse.move(firstCentre.x - 12, p.y, { steps: 8 });
    await page.mouse.up();
    await settle();
    const afterHeld = await tileOrder();
    ok(afterHeld[0] === moved && same(afterHeld.filter(g => g !== moved), before.filter(g => g !== moved)),
        `след задържане и движение под стария праг редът се сменя: ${moved} е първа (${before.join(' ')} -> ${afterHeld.join(' ')})`, { before, afterHeld });
    const storedHeld = await storedOrder();
    ok(same(storedHeld, afterHeld),
        `новият ред е записан в localStorage (${(storedHeld || []).join(' ')})`, storedHeld);
    ok(!(await page.evaluate(() => !!document.querySelector('#open-notes-bar .open-notes-bar-tile.is-dragging'))),
        'след пускането класът is-dragging е махнат');
    const wsAfterHeld = await windowsState();
    ok(wsAfterHeld.open.length === wsBeforeHeld.open.length
        && same(wsAfterHeld.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).sort(), wsBeforeHeld.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).sort()),
        `задържането и местенето не затварят, не скриват и не показват бележка (отворени ${wsBeforeHeld.open.length} -> ${wsAfterHeld.open.length})`, { wsBeforeHeld, wsAfterHeld });
}

// б) Задържане и пускане БЕЗ движение: плочката слиза долу, нищо не се записва и бележката остава.
{
    const ordBefore = await tileOrder();
    const storedBefore = await storedOrder();
    const wsBefore = await windowsState();
    const target = ordBefore[1];
    const p = await tileCentre(target);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.waitForTimeout(620);
    const heldKey = await page.evaluate(() => {
        const t = document.querySelector('#open-notes-bar .open-notes-bar-tile.is-dragging');
        return t ? (t.dataset.barKey || '').split('\u0000')[1] : null;
    });
    await page.mouse.up();
    await settle();
    const ordAfter = await tileOrder();
    const storedAfter = await storedOrder();
    const wsAfter = await windowsState();
    ok(heldKey === target, `задържане 500ms без движение също вдига плочката (${heldKey})`, { heldKey, target });
    ok(same(ordAfter, ordBefore),
        `задържане и пускане без движение не променя реда (${ordAfter.join(' ')})`, { ordBefore, ordAfter });
    ok(same(storedAfter, storedBefore),
        `и записаният ред остава същият (${(storedAfter || []).join(' ')})`, { storedBefore, storedAfter });
    ok(wsAfter.open.length === wsBefore.open.length
        && same(wsAfter.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).sort(), wsBefore.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).sort()),
        `задържане и пускане без движение не затваря, не скрива и не показва бележка (отворени ${wsBefore.open.length} -> ${wsAfter.open.length})`, { wsBefore, wsAfter });
    ok(wsAfter.activeGdid === wsBefore.activeGdid,
        `активната бележка не се сменя (${wsBefore.activeGdid} -> ${wsAfter.activeGdid})`, { wsBefore, wsAfter });
    ok(!(await page.evaluate(() => !!document.querySelector('#open-notes-bar .open-notes-bar-tile.is-dragging'))),
        'след пускането плочката слиза долу');
}

// --- 10) Тесен екран: 8 бележки, редът се приплъзва и пак се преподрежда ----------------------
await page.setViewportSize({ width: 390, height: 844 });
// Лентата се допълва до ОСЕМ плочки с бележки, които още не са отворени: жестът в точка 9 вече не
// затваря нищо, значи броят на отворените не може да се смята на ръка.
for (const g of ['DGB1', 'DGB2', 'DGB3', 'DGB4', 'DGB5', 'DGB6', 'DGB7', 'DGB8']) {
    if ((await tileOrder()).length >= 8) break;
    if (!(await tileOrder()).includes(g)) { await openNote(g); await settle(); }
}
await settle();
let strip = await stripInfo();
ord = await tileOrder();
ok(ord.length === 8, `на 390px има 8 плочки (${ord.join(' ')})`, ord);
ok(strip.scrollWidth > strip.clientWidth,
    `на 390px редът се приплъзва (scrollWidth ${strip.scrollWidth} > clientWidth ${strip.clientWidth})`, strip);

// Точка на ФОНА между две плочки: там жестът е скрол на лентата, не местене на плочка.
const gapPoint = await page.evaluate((midY) => {
    const s = document.querySelector('#open-notes-bar .open-notes-bar-strip');
    const r = s.getBoundingClientRect();
    for (let x = Math.round(r.left) + 2; x < Math.round(r.right) - 2; x++) {
        const el = document.elementFromPoint(x, midY);
        if (el && el.classList && el.classList.contains('open-notes-bar-strip')) return { x, y: midY };
    }
    return null;
}, strip.midY);
ok(!!gapPoint, `има фон между плочките за жеста по лентата (${gapPoint && gapPoint.x})`, gapPoint);

// Показалец по ФОНА на лентата: не мести плочки. Забележка: в този headless Chromium жестът с пръст
// НЕ стига до скрола (композиторът не скролва по синтезиран допир), затова скролът се проверява с
// колело на СЪЩОТО място. Важното за тази функция е, че фонът на лентата не прихваща жеста за
// преподреждане: редът остава същият, а scrollLeft се мени.
if (gapPoint) {
    const ordBeforeScroll = await tileOrder();
    await page.mouse.move(gapPoint.x, gapPoint.y);
    await page.mouse.down();
    await page.mouse.move(gapPoint.x - 40, gapPoint.y, { steps: 8 });
    await page.mouse.up();
    await settle();
    ok(same(await tileOrder(), ordBeforeScroll),
        `плъзгане с показалец по фона на лентата не мести плочките (${(await tileOrder()).join(' ')})`, { ordBeforeScroll, now: await tileOrder() });
    await page.evaluate(() => { document.querySelector('#open-notes-bar .open-notes-bar-strip').scrollLeft = 0; });
    await settle();
    await page.mouse.move(gapPoint.x, gapPoint.y);
    await page.mouse.wheel(160, 0);
    await settle();
    const sl = (await stripInfo()).scrollLeft;
    ok(sl > 0, `жест по фона на лентата скролва (scrollLeft 0 -> ${sl})`, { sl, gapPoint });
    await page.evaluate(() => { document.querySelector('#open-notes-bar .open-notes-bar-strip').scrollLeft = 0; });
    await settle();
}

// Плъзгане на 390px при 8 бележки: първата плочка се мести надясно в реда.
{
    // Скрол в началото, за да е ВИДИМА първата плочка (иначе натискането попада върху фона или върху
    // плочка, изнесена извън видимата част на лентата).
    await page.evaluate(() => { document.querySelector('#open-notes-bar .open-notes-bar-strip').scrollLeft = 0; });
    await settle();
    strip = await stripInfo();
    const before = await tileOrder();
    const firstG = before[0];
    const res = await dragTileTo(firstG, strip.right - 6);
    const after = await tileOrder();
    ok(res.started, `плъзгането на ${firstG} на 390px тръгва`);
    ok(after.length === before.length && after.indexOf(firstG) > 0
        && same(after.filter(g => g !== firstG), before.filter(g => g !== firstG)),
        `на 390px плъзгането пак преподрежда: ${firstG} слиза назад в реда (${before.join(' ')} -> ${after.join(' ')})`, { before, after });
    ok(same(await storedOrder(), after), `и новият ред е записан (${((await storedOrder()) || []).join(' ')})`, await storedOrder());
}

// --- 10б) Истински ПРЪСТ: задържане и местене (b1.55) -----------------------------------------
// Собственикът (25.10.2026): „Местенето на плочките не работи - продължителното натискане води до
// кратка вибрация, но само толкова." Задържането вдигаше плочката, но при touch браузърът дава неявно
// прихващане на плочката, setPointerCapture на лентата го отнемаше и lostpointercapture, изплувало от
// плочката, приключваше жеста още с първото движение. Затова жестът тук е ИСТИНСКИ пръст през CDP
// (Input.dispatchTouchEvent), а не показалец на мишка:
//   а) задържане и плъзгане на обикновена плочка пред първата;
//   б) същото върху плочка СЪС СНИМКА - точно оплакването (там изскачаше родното меню на картинката);
//   в) същото, но с истински pointercancel след вдигането - така поемането на пръста от родния жест,
//      което убива местенето на телефона, е възпроизведено точно.
await page.setViewportSize({ width: 1280, height: 900 });
await settle();
const cdp = await ctx.newCDPSession(page);
const touchPoints = (x, y) => [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
// Задържане върху плочка, докато тя се ВДИГНЕ (въоръжи), после серия движения и пускане.
// Изчакването е по СЪСТОЯНИЕТО (waitForFunction), не по часовник: 500ms се изчакват сами.
const touchDragTile = async (gdid, targetX, opts = {}) => {
    const p = await tileCentre(gdid);
    if (!p) return { armed: false, started: false };
    const armed = await (async () => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(p.x, p.y) });
        return page.waitForFunction((g) => {
            const t = [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')]
                .find(x => (x.dataset.barKey || '').includes(g));
            return !!(t && t._longPressArmed);
        }, gdid, { timeout: 4000 }).then(() => true).catch(() => false);
    })();
    if (!armed) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        return { armed: false, started: false };
    }
    if (opts.cancelPointer) {
        // Родният жест пое пръста: Android праща pointercancel веднага след вибрацията. Събитието се
        // праща ИСТИНСКО (през dispatchEvent), със същия pointerId, който браузърът даде на докосването.
        await page.evaluate(() => {
            const strip = document.querySelector('#open-notes-bar .open-notes-bar-strip');
            const d = strip && strip._barDrag;
            strip.dispatchEvent(new PointerEvent('pointercancel', {
                pointerId: d ? d.pointerId : 1, pointerType: 'touch', bubbles: true, cancelable: true,
            }));
        });
    }
    const step = (targetX - p.x) / 8;
    for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', {
            type: 'touchMove', touchPoints: touchPoints(Math.round(p.x + step * i), p.y),
        });
    }
    const during = await page.evaluate((g) => {
        const s = document.querySelector('#open-notes-bar .open-notes-bar-strip');
        const d = s && s._barDrag;
        const t = [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')]
            .find(x => (x.dataset.barKey || '').includes(g));
        return { started: !!(d && d.started), dead: !!(d && d.pointerDead), lifted: !!(t && t.classList.contains('is-dragging')) };
    }, gdid);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle();
    return { armed: true, started: true, during };
};

{
    const before = await tileOrder();
    const moved = before[2];
    const firstCentre = await tileCentre(before[0]);
    const wsBefore = await windowsState();
    const res = await touchDragTile(moved, firstCentre.x - 12);
    ok(res.armed, `пръст: задържане върху плочка я вдига (${moved})`, res);
    ok(res.during && res.during.started,
        `пръст: местенето тръгва след задържането (започнал жест ${res.during && res.during.started})`, res);
    ok(res.during && res.during.lifted,
        `пръст: местената плочка е вдигната по време на жеста (is-dragging ${res.during && res.during.lifted})`, res);
    const after = await tileOrder();
    ok(after.length === before.length && after[0] === moved
        && same(after.filter(g => g !== moved), before.filter(g => g !== moved)),
        `пръст: задържане и плъзгане мести ${moved} пред първата (${before.join(' ')} -> ${after.join(' ')})`, { before, after });
    const storedTouch = await storedOrder();
    ok(same(storedTouch, after), `пръст: новият ред е записан в localStorage (${(storedTouch || []).join(' ')})`, storedTouch);
    ok(!(await page.evaluate(() => !!document.querySelector('#open-notes-bar .open-notes-bar-tile.is-dragging'))),
        'пръст: след пускането класът is-dragging е махнат');
    const wsAfter = await windowsState();
    ok(wsAfter.open.length === wsBefore.open.length
        && same(wsAfter.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).sort(), wsBefore.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).sort()),
        `пръст: жестът не затваря, не скрива и не показва бележка (отворени ${wsBefore.open.length} -> ${wsAfter.open.length})`, { wsBefore, wsAfter });
}

// б) Плочка СЪС СНИМКА: точно оплакването на собственика (b1.55) - „ако на плочката има снимка ...
// се показва стандартното меню ... на снимката".
{
    const before = await tileOrder();
    const target = before[before.length - 1];
    // Миниатюрата се слага по СЪЩИЯ път, по който идва истинската (openNotesBarPutThumb): плочката
    // получава has-thumb чак когато картинката се зареди.
    const thumbInfo = await page.evaluate(async (g) => {
        const tile = [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')]
            .find(x => (x.dataset.barKey || '').includes(g));
        if (!tile || typeof openNotesBarPutThumb !== 'function') return { put: false };
        const c = document.createElement('canvas');
        c.width = 8; c.height = 8;
        const cx = c.getContext('2d');
        cx.fillStyle = '#3366cc';
        cx.fillRect(0, 0, 8, 8);
        openNotesBarPutThumb(tile, c.toDataURL('image/png'), 'snimka.png');
        const has = await new Promise(r => {
            const hit = () => (tile.classList.contains('has-thumb') ? r(true) : setTimeout(hit, 20));
            hit();
            setTimeout(() => r(false), 2000);
        });
        const img = tile.querySelector('.open-notes-bar-thumb');
        const r = tile.getBoundingClientRect();
        const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        const cs = img ? getComputedStyle(img) : null;
        return {
            put: true, has, imgShow: !!img && cs.display !== 'none',
            // Под пръста (в средата на плочката) стои САМАТА плочка, не <img>: родното меню на
            // картинката няма как да изскочи, защото картинката не приема показалеца.
            hitTag: el ? el.tagName : null, hitIsTile: !!el && el === tile,
            imgPointerEvents: cs ? cs.pointerEvents : null,
            imgUserSelect: cs ? cs.userSelect : null,
        };
    }, target);
    ok(thumbInfo.has && thumbInfo.imgShow,
        `снимката в плочката се вижда и слага has-thumb (${target})`, thumbInfo);
    ok(thumbInfo.hitIsTile && thumbInfo.hitTag !== 'IMG',
        `в средата на плочка със снимка стои плочката, не картинката (под точката: ${thumbInfo.hitTag})`, thumbInfo);
    ok(thumbInfo.imgPointerEvents === 'none',
        `миниатюрата не приема показалеца (pointer-events ${thumbInfo.imgPointerEvents})`, thumbInfo);
    ok(thumbInfo.imgUserSelect === 'none',
        `миниатюрата не се маркира (user-select ${thumbInfo.imgUserSelect})`, thumbInfo);

    // Родното меню и маркирането: събитието се праща КЪМ плочката и към картинката в нея, а пазачът е
    // на лентата - тоест покрива и двете.
    const guards = await page.evaluate((g) => {
        const tile = [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')]
            .find(x => (x.dataset.barKey || '').includes(g));
        const img = tile ? tile.querySelector('.open-notes-bar-thumb') : null;
        const fire = (el, type) => {
            if (!el) return null;
            const ev = new Event(type, { bubbles: true, cancelable: true });
            el.dispatchEvent(ev);
            return ev.defaultPrevented;
        };
        return {
            tileCtx: fire(tile, 'contextmenu'),
            imgCtx: fire(img, 'contextmenu'),
            tileSelect: fire(tile, 'selectstart'),
            imgSelect: fire(img, 'selectstart'),
            imgDrag: fire(img, 'dragstart'),
        };
    }, target);
    ok(guards.tileCtx === true, `contextmenu върху плочка е отменен (defaultPrevented ${guards.tileCtx})`, guards);
    ok(guards.imgCtx === true, `contextmenu върху снимката в плочката е отменен (defaultPrevented ${guards.imgCtx})`, guards);
    ok(guards.tileSelect === true, `selectstart върху плочка е отменен (defaultPrevented ${guards.tileSelect})`, guards);
    ok(guards.imgSelect === true, `selectstart върху снимката е отменен (defaultPrevented ${guards.imgSelect})`, guards);
    ok(guards.imgDrag === true, `dragstart върху снимката е отменен (defaultPrevented ${guards.imgDrag})`, guards);

    // в) Задържане и местене на ТАЗИ плочка, когато родният жест поеме пръста (pointercancel).
    const firstCentre = await tileCentre(before[0]);
    const res = await touchDragTile(target, firstCentre.x - 12, { cancelPointer: true });
    ok(res.armed, `пръст върху плочка със снимка: задържането я вдига (${target})`, res);
    ok(res.during && res.during.dead,
        `pointercancel след вдигането не хвърля жеста, а минава на touch пътя (pointerDead ${res.during && res.during.dead})`, res);
    ok(res.during && res.during.started,
        `пръст върху плочка със снимка: местенето тръгва и след pointercancel (започнал жест ${res.during && res.during.started})`, res);
    const after = await tileOrder();
    ok(after.length === before.length && after[0] === target
        && same(after.filter(g => g !== target), before.filter(g => g !== target)),
        `пръст върху плочка със снимка: ${target} стига до началото (${before.join(' ')} -> ${after.join(' ')})`, { before, after });
    ok(same(await storedOrder(), after),
        `и новият ред е записан в localStorage (${((await storedOrder()) || []).join(' ')})`, await storedOrder());
}

// Обратно на 390x844 - там беше точка 10 и там продължава проверката след презареждане.
await page.setViewportSize({ width: 390, height: 844 });
await settle();

// --- 11) Редът оцелява след ПРЕЗАРЕЖДАНЕ на страницата ---------------------------------------
const savedBeforeReload = await storedOrder();
ok(Array.isArray(savedBeforeReload) && savedBeforeReload.length === 8,
    `преди презареждането редът в localStorage е пълен (${(savedBeforeReload || []).join(' ')})`, savedBeforeReload);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof showModal === 'function' && typeof initNoteWindows === 'function', null, { timeout: 20000 });
await page.evaluate(BOOT);
await settle();
// Най-важното: първото (празно) опресняване при старт НЕ бива да трие запомнения ред.
ok(same(await storedOrder(), savedBeforeReload),
    `празното опресняване при старт не трие запомнения ред (${((await storedOrder()) || []).join(' ')})`, await storedOrder());
// След презареждането бележките се отварят в ДРУГ ред - плочките трябва да следват запомнения.
for (const g of ['DGB2', 'DGB8', 'DGB1', 'DGB3', 'DGB4', 'DGB5', 'DGB6', 'DGB7']) await openNote(g);
await settle();
const afterReload = await tileOrder();
ok(same(afterReload, savedBeforeReload),
    `след презареждане редът е запомненият, а не редът на отваряне (${afterReload.join(' ')})`,
    { savedBeforeReload, afterReload });
ok(same(await storedOrder(), savedBeforeReload), `и записът в localStorage не се е променил (${((await storedOrder()) || []).join(' ')})`, await storedOrder());

// Плъзгането работи и след презареждане (слушателите се закачат при строежа на лентата).
{
    const before = await tileOrder();
    const second = before[1];
    const pA = await tileCentre(before[0]);
    const pB = await tileCentre(second);
    if (pA && pB) {
        const res = await dragTileTo(second, pA.x - 12);
        const after = await tileOrder();
        ok(res.started, `плъзгането след презареждане тръгва (${second})`);
        ok(after[0] === second && same(after.filter(g => g !== second), before.filter(g => g !== second)),
            `и мести плочката пред първата (${before.join(' ')} -> ${after.join(' ')})`, { before, after });
        ok(same(await storedOrder(), after), `редът след презареждането е записан (${((await storedOrder()) || []).join(' ')})`, await storedOrder());
    } else {
        ok(false, 'двете плочки за плъзгане след презареждане са на екрана', { before });
    }
}

// --- 12) Никакви грешки в конзолата / страницата ---------------------------------------------
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);

await browser.close();
srv.close();
console.log(`${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
