// Тесни стрелки за скрол в двата края на лентата с отворените бележки (порт от cx-notes b2.90).
// Собственикът (25.10.2026): „Плъзгането на лентата при препълване не се получава, местят се плочките -
// ще трябва да сложим тесни бутони с стрелки в двата края в този случай".
// Проверява се по ИСТИНСКИЯ път в браузър - истински прозорци (showModal), истински кликове с показалеца,
// ИСТИНСКИ пръст през CDP (Input.dispatchTouchEvent), истински scrollBy на лентата:
//   1) когато плочките се побират, двата бутона със стрелки са СКРИТИ (няма какво да се скролва);
//   2) при препълване двата са ВИДИМИ, а „назад" е неактивен при scrollLeft === 0;
//   3) клик на „напред" мести лентата с ~80% от видимата ѝ част, „назад" става активен, а в края на
//      лентата „напред" е неактивен;
//   4) клик на „назад" връща лентата към началото (там „назад" пак е неактивен);
//   5) хоризонтално плъзгане с ПРЪСТ (60px) върху плочка НЕ променя реда и не вдига плочката - жестът
//      остава скрол на лентата;
//   6) плъзгане с МИШКА (60px) върху плочка ПРОМЕНЯ реда - старото поведение се пази;
//   7) задържане 600ms + движение с пръст ПРОМЕНЯ реда - старото поведение се пази;
//   8) клик на стрелка не вдига, не скрива и не разбърква нищо.
// Пуска се от корена на хранилището:
//   node .bolter/check/open-notes-bar-scroll-arrows.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Приложението е index-2.html на main клона (то зарежда main.js), а на cx-notes - самият index.html.
// Затова входът се избира по това кой файл съществува, така че този тест е един и същ в двата клона.
const root = path.resolve(process.env.ROOT || 'uni');
const ENTRY = existsSync(path.join(root, 'index-2.html')) ? 'index-2.html' : 'index.html';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? ENTRY : p;
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
// open-notes-bar-drag.mjs - приложението стартира без истински Drive).
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

// hasTouch е включен, за да може истинският пръст (CDP Input.dispatchTouchEvent) да провери, че
// хоризонталният жест върху плочка НЕ мести плочката.
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
        // Запомненият ред на плочките се изтрива: проверката иска чист ред на отваряне.
        localStorage.removeItem('cx_open_notes_bar_order');
    } catch (e) { }
});

const page = await ctx.newPage();
page.setDefaultTimeout(8000);
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.goto(`http://localhost:${PORT}/${ENTRY}`, { waitUntil: 'load' });
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

// --- Помощни функции -----------------------------------------------------------------------------
// Отваря бележка по истинския път на приложението (showModal), както клик на картата на борда.
const openNote = (gdid, id) => page.evaluate((def) => {
    useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
    dbSourceGlobal = null; dirHandle = null; isOfflineMode = false;
    authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
    const raw = 'Бележка ' + def.gdid;
    if (!allNotesData.some(x => String(x.gdid) === def.gdid)) {
        const now = Date.now();
        allNotesData.push({
            alarm_type: -1, boardid: 'B1', calendarDate: 0, color: 0, date: now, datemod: now, eventId: 0,
            gdid: def.gdid, id: def.id, notetxt: raw, numord: def.id, sellist: 0, status: 0,
            text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
        });
    }
    showModal({ raw, format: '', id: def.id, gdid: def.gdid, boardId: 'B1' });
}, { gdid, id });

// Два кадъра: подредбата и класовете са приложени, преди да се мери.
const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// Редът на плочките в лентата (по gdid).
const tileOrder = () => page.evaluate(() => [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')]
    .map(t => (t.dataset.barKey || '').split('\u0000')[1] || ''));

const windowsState = () => page.evaluate(() => ({
    open: getOpenNoteWindows().map(w => ({ gdid: w.body.dataset.gdid || '', hidden: !!w.hidden, active: w === activeNoteWindow })),
    activeGdid: (activeNoteWindow && activeNoteWindow.body.dataset.gdid) || '',
}));

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Лентата: скрол-състояние, мястото на видимата ѝ част и състоянието на двата бутона със стрелки.
const barInfo = () => page.evaluate(() => {
    const bar = document.getElementById('open-notes-bar');
    if (!bar) return null;
    const s = bar.querySelector('.open-notes-bar-strip');
    const prev = bar.querySelector('.open-notes-bar-scroll-prev');
    const next = bar.querySelector('.open-notes-bar-scroll-next');
    const r = s.getBoundingClientRect();
    const box = (b) => {
        // Липсващ бутон: заместник, за да се четат съобщенията. Проверките за НАЛИЧИЕ минават през
        // hasArrows (иначе липсващ бутон би минал за „скрит").
        if (!b) return { missing: true, hidden: true, disabled: true, display: 'none', w: 0, h: 0, label: '', title: '', svgW: 0, svgH: 0, insideStrip: false, right: 0 };
        const br = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        const svg = b.querySelector('svg');
        return {
            hidden: b.hidden, disabled: !!b.disabled, display: cs.display,
            w: Math.round(br.width), h: Math.round(br.height),
            label: b.getAttribute('aria-label') || '', title: b.title || '',
            svgW: svg ? Math.round(svg.getBoundingClientRect().width) : 0,
            svgH: svg ? Math.round(svg.getBoundingClientRect().height) : 0,
            // Лентата не бива да е вътре в приплъзващия се ред: тогава тя би се скролвала с плочките.
            insideStrip: !!b.closest('.open-notes-bar-strip'),
            right: Math.round(br.right),
        };
    };
    const kids = [...bar.children].map(el => el.className || el.id || el.tagName);
    return {
        visible: bar.classList.contains('is-visible'),
        scrollLeft: Math.round(s.scrollLeft),
        scrollWidth: Math.round(s.scrollWidth),
        clientWidth: Math.round(s.clientWidth),
        overflow: Math.round(s.scrollWidth - s.clientWidth),
        midY: Math.round(r.top + r.height / 2),
        stripLeft: Math.round(r.left), stripRight: Math.round(r.right),
        prev: box(prev), next: box(next), kids,
    };
});

// Средата на бутон на стрелките (за истински клик с показалеца).
const arrowCentre = (which) => page.evaluate((which) => {
    const b = document.querySelector(`#open-notes-bar .open-notes-bar-scroll-${which}`);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}, which);

// Мястото на плочка по gdid: центърът ѝ на екрана.
const tileCentre = (gdid) => page.evaluate((gdid) => {
    const t = [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')]
        .find(x => (x.dataset.barKey || '').includes(gdid));
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
}, gdid);

// Клик със СЪЩИЯ показалец, с който потребителят натиска (не .click() от кода).
const clickAt = async (p) => {
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.up();
};

// Клик по стрелка. Когато бутонът липсва (старият код), проверката пада с ясно съобщение, вместо да
// се счупи на null и да скрие останалите случаи.
const clickArrow = async (which) => {
    const p = await arrowCentre(which);
    if (!p) {
        ok(false, `бутонът „${which}" е на мястото си за клик`);
        return false;
    }
    await clickAt(p);
    return true;
};
const nextActive = async () => { const i = await barInfo(); return !!(i && i.next && !i.next.disabled); };
const prevActive = async () => { const i = await barInfo(); return !!(i && i.prev && !i.prev.disabled); };

// Плавният скрол върви с кадри: чака се, докато scrollLeft спре да мърда (не по часовник).
const waitScrollSettled = () => page.evaluate(() => new Promise(resolve => {
    const s = document.querySelector('#open-notes-bar .open-notes-bar-strip');
    if (!s) return resolve(null);
    const deadline = performance.now() + 3000;
    let last = -1, still = 0;
    const tick = () => {
        const v = Math.round(s.scrollLeft);
        if (v === last) still++; else still = 0;
        last = v;
        if (still >= 4 || performance.now() > deadline) return resolve(v);
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}));

const hasArrows = (i) => !!(i && i.prev && !i.prev.missing && i.next && !i.next.missing);

const dragging = () => page.evaluate(() => !!document.querySelector('#open-notes-bar .open-notes-bar-tile.is-dragging'));

// --- 1) Плочките се побират: стрелки НЯМА --------------------------------------------------------
for (let i = 1; i <= 2; i++) await openNote(`DGA${i}`, 9300 + i);
await settle();
let info = await barInfo();
ok(!!info && info.visible, 'лентата се вижда при 2 отворени бележки', info);
ok(!!info && info.overflow <= 1, `при 2 бележки на 1280px няма препълване (overflow ${info && info.overflow})`, info);
ok(!!info && hasArrows(info) && info.prev.hidden && info.next.hidden,
    `без препълване двата бутона със стрелки са скрити (prev ${info && info.prev && info.prev.hidden}, next ${info && info.next && info.next.hidden})`, info);
ok(!!info && hasArrows(info) && info.prev.display === 'none' && info.next.display === 'none',
    `скритите стрелки не заемат място в лентата (display ${info && info.prev.display} / ${info && info.next.display})`, info);

// --- 2) Тесен екран и много бележки: препълване, двата бутона са видими --------------------------
const NOTES_TOTAL = 20;
await page.setViewportSize({ width: 390, height: 844 });
await settle();
for (let i = 3; i <= NOTES_TOTAL; i++) await openNote(`DGA${i}`, 9300 + i);
await settle();
info = await barInfo();
const order0 = await tileOrder();
ok(order0.length === NOTES_TOTAL, `на 390px има ${NOTES_TOTAL} плочки (${order0.length})`, order0);
ok(info.overflow > 1, `лентата се приплъзва (scrollWidth ${info.scrollWidth} > clientWidth ${info.clientWidth})`, info);
const step = Math.max(80, Math.round(info.clientWidth * 0.8));
ok(info.overflow > step * 2,
    `препълването е достатъчно за няколко стъпки, за да не се удря в края при първия клик (overflow ${info.overflow}, стъпка ${step})`, info);
ok(hasArrows(info) && !info.prev.hidden && !info.next.hidden,
    `при препълване двата бутона са видими (prev ${!info.prev.hidden}, next ${!info.next.hidden})`, info);
ok(hasArrows(info) && info.prev.display !== 'none' && info.next.display !== 'none',
    `и са в потока на лентата (display ${info.prev.display} / ${info.next.display})`, info);
ok(hasArrows(info) && info.prev.w === 18 && info.prev.h === 36 && info.next.w === 18 && info.next.h === 36,
    `бутоните са тесни: 18x36 (prev ${info.prev.w}x${info.prev.h}, next ${info.next.w}x${info.next.h})`, info);
ok(hasArrows(info) && info.prev.svgW === 10 && info.prev.svgH === 10 && info.next.svgW === 10 && info.next.svgH === 10,
    `стрелките са малки: 10x10 (prev ${info.prev.svgW}x${info.prev.svgH}, next ${info.next.svgW}x${info.next.svgH})`, info);
ok(hasArrows(info) && !info.prev.insideStrip && !info.next.insideStrip,
    'стрелките са ИЗВЪН приплъзващия се ред - не се скролват заедно с плочките', info);
const iP = info.kids.findIndex(k => k.includes('open-notes-bar-scroll-prev'));
const iS = info.kids.findIndex(k => k.includes('open-notes-bar-strip'));
const iN = info.kids.findIndex(k => k.includes('open-notes-bar-scroll-next'));
const iH = info.kids.findIndex(k => k.includes('open-notes-bar-hide'));
const iC = info.kids.findIndex(k => k.includes('open-notes-bar-close'));
ok(iP === 0 && iP < iS && iS < iN && iN < iH && iH < iC,
    `редът в лентата е: назад, ред, напред, скрий всички, затвори всички (${info.kids.join(' | ')})`, info.kids);
ok(hasArrows(info) && info.prev.label.length > 0 && info.next.label.length > 0 && info.prev.title.length > 0 && info.next.title.length > 0,
    `стрелките имат достъпни имена („${info.prev.label}" / „${info.next.label}")`, info);
ok(hasArrows(info) && info.scrollLeft === 0 && info.prev.disabled && !info.next.disabled,
    `в началото „назад" е неактивен, а „напред" е активен (scrollLeft ${info.scrollLeft})`, info);

// --- 3) Клик на „напред" мести лентата с ~80% от видимата ѝ част --------------------------------
await page.evaluate(() => { document.querySelector('#open-notes-bar .open-notes-bar-strip').scrollLeft = 0; });
await settle();
await clickArrow('next');
let sl = await waitScrollSettled();
let after = await barInfo();
ok(Math.abs(sl - step) <= 3,
    `клик на „напред" мести лентата с ~80% от видимата част (преместени ${sl}px при clientWidth ${after.clientWidth}, очаквани ${step}px)`, { sl, step, after });
ok(hasArrows(after) && !after.prev.disabled, `след първия клик „назад" става активен (disabled ${after.prev.disabled})`, after);
ok(hasArrows(after) && !after.next.disabled, `а „напред" е още активен - лентата не е в края (scrollLeft ${after.scrollLeft} / overflow ${after.overflow})`, after);
let clicks = 1;
while (await nextActive() && clicks < 12) {
    await clickArrow('next');
    await waitScrollSettled();
    clicks++;
}
after = await barInfo();
ok(hasArrows(after) && after.next.disabled, `в края на лентата „напред" е неактивен (след ${clicks} клика, scrollLeft ${after.scrollLeft})`, after);
ok(after.scrollLeft >= after.overflow - 2,
    `и лентата е стигнала до края (scrollLeft ${after.scrollLeft}, overflow ${after.overflow})`, after);
ok(hasArrows(after) && !after.prev.disabled, `а „назад" е активен в края (disabled ${after.prev.disabled})`, after);

// --- 4) Клик на „назад" връща лентата към началото ----------------------------------------------
const beforePrev = await barInfo();
await clickArrow('prev');
await waitScrollSettled();
const afterPrev = await barInfo();
ok(afterPrev.scrollLeft < beforePrev.scrollLeft,
    `клик на „назад" връща лентата назад (${beforePrev.scrollLeft} -> ${afterPrev.scrollLeft})`, { beforePrev, afterPrev });
ok(Math.abs((beforePrev.scrollLeft - afterPrev.scrollLeft) - step) <= 3,
    `със същата стъпка (преместени ${beforePrev.scrollLeft - afterPrev.scrollLeft}px, очаквани ${step}px)`, { beforePrev, afterPrev, step });
let back = 1;
while (await prevActive() && back < 12) {
    await clickArrow('prev');
    await waitScrollSettled();
    back++;
}
const atStart = await barInfo();
ok(atStart.scrollLeft <= 1 && hasArrows(atStart) && atStart.prev.disabled,
    `в началото „назад" пак е неактивен (scrollLeft ${atStart.scrollLeft}, след ${back} клика)`, atStart);
ok(same(await tileOrder(), order0), `скролът със стрелки не разбърква реда на плочките (${(await tileOrder()).join(' ')})`);

// --- 5) ПРЪСТ върху плочка: скрол на лентата, НЕ местене на плочка -------------------------------
const cdp = await ctx.newCDPSession(page);
const touchPoints = (x, y) => [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
{
    await page.evaluate(() => { document.querySelector('#open-notes-bar .open-notes-bar-strip').scrollLeft = 0; });
    await settle();
    const before = await tileOrder();
    const wsBefore = await windowsState();
    const p = await tileCentre(before[0]);
    ok(!!p, `първата плочка е на екрана за жеста с пръст (${before[0]})`, { before, p });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(p.x, p.y) });
    const mid = [];
    for (let i = 1; i <= 6; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints(Math.round(p.x + 10 * i), p.y) });
        mid.push(await page.evaluate(() => {
            const d = document.querySelector('#open-notes-bar .open-notes-bar-strip')._barDrag;
            return { started: !!(d && d.started), lifted: !!document.querySelector('#open-notes-bar .open-notes-bar-tile.is-dragging') };
        }));
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle();
    const after = await tileOrder();
    ok(same(after, before), `пръст върху плочка НЕ променя реда (${after.join(' ')})`, { before, after });
    ok(!mid.some(m => m.started || m.lifted),
        `пръст върху плочка не вдига плочка и не започва местене по средата на жеста (${JSON.stringify(mid)})`, mid);
    ok(!(await dragging()), 'след пускането няма вдигната плочка');
    const wsAfter = await windowsState();
    ok(same(wsAfter.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')), wsBefore.open.map(w => w.gdid + (w.hidden ? 'h' : 'v'))),
        `жестът с пръст не вдига и не скрива бележка (${wsAfter.open.filter(w => w.hidden).length} скрити)`, { wsBefore, wsAfter });
}

// --- 6) МИШКА върху плочка: старото поведение се пази - плочката се мести ------------------------
{
    await page.evaluate(() => { document.querySelector('#open-notes-bar .open-notes-bar-strip').scrollLeft = 0; });
    await settle();
    const before = await tileOrder();
    const moved = before[1];
    const p = await tileCentre(moved);
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(p.x + 14, p.y, { steps: 4 });
    const started = await page.evaluate(() => {
        const d = document.querySelector('#open-notes-bar .open-notes-bar-strip')._barDrag;
        return !!(d && d.started);
    });
    await page.mouse.move(p.x + 60, p.y, { steps: 8 });
    await page.mouse.up();
    await settle();
    const after = await tileOrder();
    ok(started, `мишка: местенето тръгва при хоризонтално движение над 10px (започнал жест ${started})`);
    ok(after.length === before.length && after.indexOf(moved) > before.indexOf(moved)
        && same(after.filter(g => g !== moved), before.filter(g => g !== moved)),
        `мишка: плъзгане с 60px мести ${moved} напред в реда (${before.join(' ')} -> ${after.join(' ')})`, { before, after });
    ok(!(await dragging()), 'мишка: след пускането класът is-dragging е махнат');
}

// --- 7) Задържане 600ms + движение с пръст: старото поведение се пази - плочката се мести --------
{
    const before = await tileOrder();
    const moved = before[2];
    const p = await tileCentre(moved);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(p.x, p.y) });
    const armed = await page.waitForFunction((g) => {
        const t = [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')]
            .find(x => (x.dataset.barKey || '').includes(g));
        return !!(t && t._longPressArmed);
    }, moved, { timeout: 4000 }).then(() => true).catch(() => false);
    // Задържането се мери по СЪСТОЯНИЕТО (вдигната плочка), а после се изчакват и останалите до 600ms.
    await page.waitForTimeout(620);
    ok(armed, `пръст: задържане върху плочка я вдига за местене (${moved})`);
    ok(await dragging(), 'пръст: вдигнатата плочка носи клас is-dragging');
    const firstCentre = await tileCentre(before[0]);
    const stepX = (firstCentre.x - 12 - p.x) / 8;
    for (let i = 1; i <= 8; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touchPoints(Math.round(p.x + stepX * i), p.y) });
    }
    const midStarted = await page.evaluate(() => {
        const d = document.querySelector('#open-notes-bar .open-notes-bar-strip')._barDrag;
        return !!(d && d.started);
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await settle();
    const after = await tileOrder();
    ok(midStarted, `пръст: след задържането местенето тръгва (започнал жест ${midStarted})`);
    ok(after.length === before.length && after[0] === moved && same(after.filter(g => g !== moved), before.filter(g => g !== moved)),
        `пръст: задържане + движение мести ${moved} пред първата (${before.join(' ')} -> ${after.join(' ')})`, { before, after });
    ok(!(await dragging()), 'пръст: след пускането класът is-dragging е махнат');
}

// --- 8) Клик на стрелка не вдига, не скрива и не разбърква нищо ----------------------------------
{
    await page.evaluate(() => { document.querySelector('#open-notes-bar .open-notes-bar-strip').scrollLeft = 0; });
    await settle();
    const before = await tileOrder();
    const wsBefore = await windowsState();
    await clickArrow('next');
    await waitScrollSettled();
    await clickArrow('prev');
    await waitScrollSettled();
    const after = await tileOrder();
    const wsAfter = await windowsState();
    ok(same(after, before), `кликовете на стрелките не разбъркват реда (${after.join(' ')})`, { before, after });
    ok(wsAfter.open.length === wsBefore.open.length
        && same(wsAfter.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')), wsBefore.open.map(w => w.gdid + (w.hidden ? 'h' : 'v'))),
        `кликовете на стрелките не вдигат и не скриват бележка (отворени ${wsBefore.open.length} -> ${wsAfter.open.length})`, { wsBefore, wsAfter });
    ok(wsAfter.activeGdid === wsBefore.activeGdid,
        `и не сменят активната бележка (${wsBefore.activeGdid} -> ${wsAfter.activeGdid})`, { wsBefore, wsAfter });
    const backHome = await barInfo();
    ok(backHome.scrollLeft <= 1, `след „назад" лентата е пак в началото (scrollLeft ${backHome.scrollLeft})`, backHome);
}

ok(errs.length === 0, `няма грешки в конзолата (${errs.slice(0, 3).join(' | ')})`, errs);

console.log('');
console.log(fails ? `FAILED ${fails} of ${n}` : `ALL PASS (${n} проверки)`);
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
