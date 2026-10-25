// Преподреждане на плочките в лентата с плъзгане (b2.83).
// Собственикът (25.10.2026): „dragging along the bar да премества бутона на бележките в рамките на
// лентата за преподреждане".
// Проверява се по ИСТИНСКИЯ път в браузър - истински прозорци (showModal) и истински показалец:
//   1) при 4 отворени бележки плъзгане на ТРЕТАТА плочка пред първата дава нов DOM ред;
//   2) window.refreshOpenNotesBar() НЕ връща стария ред (редът се пази в модулния масив и се прилага
//      при всяко опресняване);
//   3) редът се записва в localStorage (cx_open_notes_bar_order) и оцелява след презареждане - дори
//      когато след него бележките се отворят в друг ред;
//   4) нова бележка влиза в КРАЯ, без да разваля подредбата, а затворена бележка изчезва от реда;
//   5) плъзгането не скрива/показва/затваря нищо (кликът след плъзгане се прескача), а дългото
//      натискане (500ms без движение) още ЗАТВАРЯ бележката;
//   6) плъзгане, започнало на ФОНА на лентата, още скролва (scrollLeft се мени) и не мести плочки;
//   7) на 390px при 8 бележки редът се приплъзва и пак се преподрежда с плъзгане;
//   8) плъзганата плочка носи клас is-dragging, а на плочките има touch-action: pan-y.
// Пуска се от корена на хранилището:
//   node .bolter/check/open-notes-bar-drag.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index.html' : p;
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

// Локален режим, без Google Drive (както edit-toolbar-no-select.mjs): приложението стартира без вход,
// а бележките се отварят през истинския showModal. hasTouch е включен, за да може истинският пръст
// (Input.synthesizeScrollGesture с gestureSourceType: 'touch') да провери скрола по фона на лентата.
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', hasTouch: true });
await ctx.addInitScript(() => {
    try {
        localStorage.setItem('language', 'bg');
        localStorage.setItem('hideAssistant', 'true');
        localStorage.setItem('notesBgrd', 'false');
        localStorage.setItem('singleNoteMode', 'false');
        // cx_open_notes_bar_order НЕ се трие: addInitScript се пуска при ВСЯКО зареждане, а тестът
        // проверява точно това, че редът оцелява след презареждане.
    } catch (e) { }
});
const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function' && typeof showModal === 'function', null, { timeout: 20000 });
await page.evaluate(async () => { if (!contentModal) await startApp().catch(() => { }); });
await page.waitForFunction(() => !!contentModal, null, { timeout: 20000 });
errs.length = 0; // шумът от стартирането без Drive не е наш

// --- Бележките: осем на брой, всяка с свой gdid/id -------------------------------------------
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
    if (!allNotesData.some(x => String(x.gdid) === def.gdid)) {
        const now = Date.now();
        allNotesData.push({
            alarm_type: -1, calendarDate: 0, color: 0, date: now, datemod: now, eventId: 0,
            gdid: def.gdid, id: def.id, notetxt: def.raw, numord: def.id, sellist: 0, status: 0,
            text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
        });
    }
    showModal({ raw: def.raw, id: def.id, gdid: def.gdid, format: '' });
}, NOTES.find(x => x.gdid === gdid));

const closeNoteByX = (gdid) => page.evaluate((gdid) => {
    const win = getOpenNoteWindows().find(w => w.body.dataset.gdid === gdid);
    if (!win) return false;
    activateNoteWindow(win, true);
    win.el.querySelector('.modal-close').click();
    return true;
}, gdid);

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
    activeDb: (activeNoteWindow && activeNoteWindow.body.dataset.gdid) || '',
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

// Центърът на плочка по gdid, четен ПРЕДИ жеста (по време на жеста плочката е вдигната с transform).
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
ok(tileCss.touchAction === 'pan-y',
    `плочките имат touch-action: pan-y - хоризонталният жест е наш, вертикалният е скрол (${tileCss.touchAction})`, tileCss);
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
        others: [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')].filter(x => x !== t).length,
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
ok(wsAfterDrag.activeDb === wsBeforeDrag.activeDb,
    `плъзгането не сменя активната бележка (${wsBeforeDrag.activeDb} -> ${wsAfterDrag.activeDb})`, { wsBeforeDrag, wsAfterDrag });

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
    ok(same(await tileOrder(), ordBefore), `плъзгане в рамките на една плочка не разменя нищо (${(await tileOrder()).join(' ')})`, { ordBefore, ordAfter: await tileOrder() });
    ok(same(wsAfter.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')), wsBefore.open.map(w => w.gdid + (w.hidden ? 'h' : 'v'))),
        `кликът след плъзгане не скрива/показва бележка (${wsAfter.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).join(' ')})`, { wsBefore, wsAfter });
}

// --- 6) Плъзгане, което трае повече от 500ms, не затваря бележката ----------------------------
// Задържането се отменя от самото плъзгане: иначе жестът, с който местиш плочката, би затворил
// бележката след 500ms.
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
    ok(wsAfter.open.length === wsBefore.open.length,
        `плъзгане, което трае 650ms, не затваря бележка (отворени ${wsBefore.open.length} -> ${wsAfter.open.length})`, { wsBefore, wsAfter });
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

// --- 9) Дълго натискане без движение още ЗАТВАРЯ бележката (b2.82 не е счупено) ---------------
{
    const victim = (await tileOrder())[1];
    const wsBefore = await windowsState();
    const p4 = await tileCentre(victim);
    await page.mouse.move(p4.x, p4.y);
    await page.mouse.down();
    await page.waitForTimeout(620);
    await page.mouse.up();
    await settle();
    const wsAfter = await windowsState();
    ok(wsAfter.open.length === wsBefore.open.length - 1 && !wsAfter.open.some(w => w.gdid === victim),
        `дълго натискане (500ms без движение) още затваря бележката (${victim}: отворени ${wsBefore.open.length} -> ${wsAfter.open.length})`, { victim, wsBefore, wsAfter });
    ok(!(await tileOrder()).includes(victim), `и плочката на ${victim} изчезва от лентата`, await tileOrder());
}

// --- 10) Тесен екран: 8 бележки, редът се приплъзва и пак се преподрежда -----------------------
await page.setViewportSize({ width: 390, height: 844 });
for (const g of ['DGB2', 'DGB6', 'DGB7', 'DGB8']) await openNote(g);
await settle();
const stripInfo = () => page.evaluate(() => {
    const s = document.querySelector('#open-notes-bar .open-notes-bar-strip');
    const r = s.getBoundingClientRect();
    return {
        scrollLeft: Math.round(s.scrollLeft), scrollWidth: Math.round(s.scrollWidth), clientWidth: Math.round(s.clientWidth),
        left: r.left, right: r.right, top: r.top, bottom: r.bottom, midY: Math.round(r.top + r.height / 2),
    };
});
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

// Истински пръст по фона на лентата: скролва лентата и НЕ мести плочки.
// Забележка: в този headless Chromium жестът с пръст НЕ стига до скрола (нито
// Input.synthesizeScrollGesture, нито Input.dispatchTouchEvent местят scrollLeft - композиторът не
// скролва по синтезиран допир), затова скролът се проверява с колело на мястото на пръста. Важното
// за тази функция е, че фонът на лентата НЕ прихваща жеста (иначе нито пръст, нито колело биха
// скролвали): редът остава същият, а scrollLeft се мени.
if (gapPoint) {
    const ordBeforeScroll = await tileOrder();
    await page.mouse.move(gapPoint.x, gapPoint.y);
    await page.mouse.down();
    await page.mouse.move(gapPoint.x - 40, gapPoint.y, { steps: 8 });
    await page.mouse.up();
    await settle();
    ok(same(await tileOrder(), ordBeforeScroll),
        `плъзгане с показалец по фона на лентата не мести плочките (${(await tileOrder()).join(' ')})`, { ordBeforeScroll, now: await tileOrder() });
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

// --- 11) Редът оцелява след презареждане на страницата ---------------------------------------
const savedBeforeReload = await storedOrder();
ok(Array.isArray(savedBeforeReload) && savedBeforeReload.length === 8,
    `преди презареждането редът в localStorage е пълен (${(savedBeforeReload || []).join(' ')})`, savedBeforeReload);
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function' && typeof showModal === 'function', null, { timeout: 20000 });
await page.evaluate(async () => { if (!contentModal) await startApp().catch(() => { }); });
await page.waitForFunction(() => !!contentModal, null, { timeout: 20000 });
await settle();
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
    const firstG = before[0];
    await page.evaluate(() => { const s = document.querySelector('#open-notes-bar .open-notes-bar-strip'); s.scrollLeft = 0; });
    await settle();
    const s2 = await stripInfo();
    const pFirst = await tileCentre(firstG);
    const res = await dragTileTo(firstG, s2.right - 6);
    const after = await tileOrder();
    ok(res.started && pFirst, `след презареждане плъзгането на ${firstG} тръгва`, { pFirst, before });
    ok(after.length === before.length && after[0] !== firstG && after.includes(firstG)
        && same(after.filter(g => g !== firstG), before.filter(g => g !== firstG)),
        `след презареждане плъзгането още мести плочки (${before.join(' ')} -> ${after.join(' ')})`, { before, after });
}

// --- 12) Никакви грешки в конзолата / страницата ----------------------------------------------
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`, errs.slice(0, 3));

await browser.close();
srv.close();
console.log(`${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);


