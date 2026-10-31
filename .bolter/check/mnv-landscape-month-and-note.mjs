// Завъртян екран в MNV: месецът в кутия със скрол и отворената бележка, прибрана в екрана
// (порт от uni b3.29 / PR #146) + разпънатата бележка спира до лентата (uni PR #161 - в MNV вече е
// така, тук се проверява, че не е развалено). Жив браузър (Playwright + Chromium).
// Пускане от корена на хранилището: node .bolter/check/mnv-landscape-month-and-note.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const PLAYWRIGHT = [
    '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
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
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? PAGE : p;
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
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

const NOTE_KEY = 'g:985001';
await page.addInitScript((key) => {
    const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
    window.google = {
        accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 },
        oauth2
    };
    window.kofiWidgetOverlay = { draw() { } };
    localStorage.setItem('useIndexedDb', 'true');
    localStorage.setItem('useGoogleDb', 'false');
    localStorage.setItem('useLocalFolder', 'false');
    localStorage.setItem('useArhDb', 'false');
    localStorage.setItem('lang', 'bg');
    localStorage.setItem('language', 'bg');
    localStorage.setItem('showWeeklyCalendar', 'false');
    // Размерът, с който се отваря нова бележка (както би го оставил човек на телефон).
    localStorage.setItem('modalWidth', '340');
    localStorage.setItem('modalHeight', '280');
    // Запомнено място на бележката: долу в портрет, тоест ИЗВЪН екрана в 844x390. Точно то трябва
    // да се върне, когато телефонът се завърти обратно.
    localStorage.setItem('noteWindowGeometry', JSON.stringify({
        v: 2, seq: 1, boxes: { [key]: { x: 20, y: 500, w: 340, h: 280, o: 1 } }
    }));
}, NOTE_KEY);

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
const booted = await page.waitForFunction(() => typeof createNoteElement === 'function'
    && typeof startApp === 'function' && typeof mediaData !== 'undefined'
    && typeof showModal === 'function' && typeof filterNotesByBoard === 'function', null, { timeout: 30000 })
    .then(() => true, () => false);
ok(booted, 'страницата на приложението се зареди (createNoteElement, startApp, mediaData, showModal, filterNotesByBoard)');
await page.evaluate(async () => {
    try { if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags(); } catch (e) { /* ignore */ }
    useIndexedDb = true; useGoogleDb = false; useLocalFolder = false; useArhDb = false;
    isOffline = true;
    try { dbNoteIdTypeGlobal = 'gdid'; dbSourceGlobal = 1; } catch (e) { /* ignore */ }
    // Приложението е влязло: в проверките то стартира без Google, значи страницата за вход и
    // модалите, които тя показва, още стоят в подредбата и бутват съдържанието надолу. Скриваме ги,
    // както ги скрива и самото приложение след успешен старт.
    ['login-page', 'request-access-modal', 'folderIdPromptPopup'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    if (typeof notesContainer === 'undefined' || !notesContainer) notesContainer = document.getElementById('notes-container');
    if (typeof scrollTopBtn === 'undefined' || !scrollTopBtn) scrollTopBtn = document.getElementById('scrollTopBtn');
    if (typeof currentCalendarDate === 'undefined' || !currentCalendarDate) currentCalendarDate = new Date();
});

// ================= 1. Месец в 844x390: кутия със скрол =======================================
await page.evaluate(async () => { await filterNotesByBoard('calendar'); });
const boxOn = await page.waitForFunction(() => {
    const c = document.getElementById('calendar-container');
    return !!c && c.classList.contains('calendar-scroll-box');
}, null, { timeout: 8000 }).then(() => true, () => false);
ok(boxOn, 'в 844x390 месецът получава кутията със скрол (calendar-scroll-box)');

const land = await page.evaluate(() => {
    const c = document.getElementById('calendar-container');
    const header = c.querySelector('.calendar-header');
    const days = c.querySelector('.calendar-days-header');
    const scroller = c.querySelector(':scope > .calendar-grid-scroll');
    const grid = c.querySelector('.calendar-grid');
    const cr = c.getBoundingClientRect();
    const hr = header.getBoundingClientRect();
    const dr = days.getBoundingClientRect();
    const cells = [...c.querySelectorAll('.calendar-cell')].slice(0, 8).map(cell => {
        const r = cell.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) };
    });
    return {
        vh: window.innerHeight,
        container: { top: Math.round(cr.top), h: Math.round(cr.height) },
        header: { top: Math.round(hr.top) },
        days: { top: Math.round(dr.top), bottom: Math.round(dr.bottom) },
        hasScroller: !!scroller,
        scroller: scroller ? {
            top: Math.round(scroller.getBoundingClientRect().top),
            scrollH: scroller.scrollHeight, clientH: scroller.clientHeight, scrollTop: scroller.scrollTop
        } : null,
        gridH: grid ? Math.round(grid.getBoundingClientRect().height) : 0,
        cells: cells,
        scrollY: window.scrollY
    };
});
ok(land.hasScroller, 'мрежата е в собствена обвивка .calendar-grid-scroll');
ok(land.container.h <= land.vh + 1, 'кутията на календара не е по-висока от екрана', land.container);
ok(Math.abs(land.header.top - land.container.top) <= 8, 'хедърът стои в началото на кутията (само 5px padding)', land);
ok(land.days.top > land.header.top && land.days.bottom <= land.container.top + 140,
    'редът с имената на дните е горе, под хедъра, а не в скролващата се част', land);
ok(land.scroller && land.scroller.scrollH > land.scroller.clientH + 5,
    'мрежата има какво да скролира в кутията си (scrollHeight > clientHeight)', land.scroller);
ok(land.cells.length > 0 && land.cells.every(c => Math.abs(c.w - c.h) <= 2),
    'клетките на месеца остават квадратни', land.cells);

// Скролът е ВЪТРЕ в кутията: страницата не мърда, хедърът също.
const scrollInside = await page.evaluate(() => {
    const c = document.getElementById('calendar-container');
    const header = c.querySelector('.calendar-header');
    const scroller = c.querySelector(':scope > .calendar-grid-scroll');
    const headerTopBefore = Math.round(header.getBoundingClientRect().top);
    const daysTopBefore = Math.round(c.querySelector('.calendar-days-header').getBoundingClientRect().top);
    scroller.scrollTop = 240;
    const out = {
        gridScrollTop: scroller.scrollTop,
        windowScrollY: window.scrollY,
        headerMoved: Math.round(header.getBoundingClientRect().top) - headerTopBefore,
        daysMoved: Math.round(c.querySelector('.calendar-days-header').getBoundingClientRect().top) - daysTopBefore
    };
    scroller.scrollTop = 0;
    return out;
});
ok(scrollInside.gridScrollTop > 100, 'мрежата наистина се скролира в своята кутия', scrollInside);
ok(scrollInside.windowScrollY === 0, 'при това страницата не се скролира (window.scrollY остава 0)', scrollInside);
ok(scrollInside.headerMoved === 0 && scrollInside.daysMoved === 0, 'хедърът и имената на дните не мърдат при скрола на мрежата', scrollInside);

// ================= 1б. Смяна седмица <-> месец: страницата се връща в началото ===============
// Прави се в ЗАВЪРТЯН екран, защото там седмичният изглед е по-висок от екрана (страницата има
// какво да скролира), а месечният е в кутията - тоест скролът, останал от единия изглед, със
// сигурност каца по средата на другия.
await page.evaluate(() => { const b = document.getElementById('weekly-view-btn'); if (b) b.click(); });
const toWeek = await page.waitForFunction(() => {
    const w = document.getElementById('weekly-calendar-container');
    const cal = document.getElementById('calendar-container');
    return !!w && w.style.display !== 'none' && !!cal && cal.style.display === 'none';
}, null, { timeout: 6000 }).then(() => true, () => false);
const weekLand = await page.evaluate(() => {
    const w = document.getElementById('weekly-calendar-container');
    return {
        visible: !!w && w.style.display !== 'none',
        h: w ? Math.round(w.getBoundingClientRect().height) : 0,
        scrollH: document.scrollingElement ? document.scrollingElement.scrollHeight : 0,
        vh: window.innerHeight
    };
});
ok(toWeek && weekLand.visible && weekLand.h > 300, 'седмичният изглед работи в завъртян екран', weekLand);
await page.evaluate(() => window.scrollTo(0, 300));
const scrolledWeek = await page.evaluate(() => window.scrollY);
ok(scrolledWeek > 100, 'седмичният изглед е по-висок от екрана, значи страницата се скролира', { scrolledWeek, weekLand });
await page.evaluate(() => { const b = document.getElementById('month-view-btn'); if (b) b.click(); });
const backToMonth = await page.waitForFunction(() => {
    const c = document.getElementById('calendar-container');
    return !!c && c.style.display !== 'none' && !!c.querySelector('.calendar-grid')
        && c.classList.contains('calendar-scroll-box');
}, null, { timeout: 6000 }).then(() => true, () => false);
const afterSwitch = await page.evaluate(() => {
    const c = document.getElementById('calendar-container');
    return { scrollY: window.scrollY, cls: c.className, cells: c.querySelectorAll('.calendar-cell').length };
});
ok(backToMonth && afterSwitch.cells > 27, 'месецът се връща след седмицата (и пак е в кутия)', afterSwitch);
ok(afterSwitch.scrollY === 0, 'при смяна седмица -> месец страницата се връща в началото', { scrolledWeek, afterSwitch });

// ================= 2. Портрет 390x844: никаква кутия ========================================
await page.setViewportSize({ width: 390, height: 844 });
const boxOff = await page.waitForFunction(() => {
    const c = document.getElementById('calendar-container');
    return !!c && !c.classList.contains('calendar-scroll-box');
}, null, { timeout: 8000 }).then(() => true, () => false);
const port = await page.evaluate(() => {
    const c = document.getElementById('calendar-container');
    const scroller = c.querySelector(':scope > .calendar-grid-scroll');
    return {
        cls: c.className,
        display: getComputedStyle(c).display,
        inlineHeight: c.style.height,
        scrollH: scroller ? scroller.scrollHeight : -1,
        clientH: scroller ? scroller.clientHeight : -1
    };
});
ok(boxOff && !/calendar-scroll-box/.test(port.cls), 'в 390x844 кутията я няма (класът е махнат при завъртане)', port);
ok(port.scrollH >= 0 && port.scrollH <= port.clientH + 2, 'в портрет вътрешната обвивка не скролира', port);
ok(port.inlineHeight === '', 'в портрет височината на календара не е закована инлайн', port);

// ================= 3. Отворена бележка след завъртане =======================================
await page.evaluate(() => {
    showModal({ raw: 'Завъртане|Тялото на завъртяната бележка', format: '', color: '#FBFF86', id: 985001, gdid: '985001' });
});
const noteOpen = await page.waitForFunction(() => typeof getOpenNoteWindows === 'function'
    && getOpenNoteWindows().length === 1 && getOpenNoteWindows()[0].box.offsetWidth > 100, null, { timeout: 8000 })
    .then(() => true, () => false);
ok(noteOpen, 'бележка се отвори в портрет');
// Прозорецът влиза с анимация (scale 0.7 → 1). Мерките имат смисъл само след като тя свърши.
const settleWin = () => page.waitForFunction(() => {
    if (typeof getOpenNoteWindows !== 'function' || !getOpenNoteWindows().length) return false;
    const m = getComputedStyle(getOpenNoteWindows()[0].box).transform;
    return m === 'none' || /^matrix\(1(\.0*)?, 0, 0, 1(\.0*)?,/.test(m);
}, null, { timeout: 5000 }).then(() => true, () => false);
ok(await settleWin(), 'прозорецът е спрял на мястото си (анимацията е свършила)');

const readWin = () => page.evaluate(() => {
    const w = getOpenNoteWindows()[0];
    const r = w.box.getBoundingClientRect();
    return {
        left: Math.round(r.left), top: Math.round(r.top),
        w: Math.round(r.width), h: Math.round(r.height),
        right: Math.round(r.right), bottom: Math.round(r.bottom),
        vw: window.innerWidth, vh: window.innerHeight,
        geom: localStorage.getItem('noteWindowGeometry'),
        inside: r.left >= -1 && r.top >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1
    };
});
const portrait0 = await readWin();
ok(portrait0.inside, 'в портрет бележката стои на запомненото място и е цялата в екрана', portrait0);
ok(portrait0.left === 20 && portrait0.top === 500, 'запомненото място е приложено (20, 500)', portrait0);

// Завъртаме на 844x390: запомненото място (y=500) НЕ се побира, значи бележката се прибира в екрана.
await page.setViewportSize({ width: 844, height: 390 });
const gotInside = await page.waitForFunction(() => {
    if (typeof getOpenNoteWindows !== 'function') return false;
    const list = getOpenNoteWindows();
    if (!list.length) return false;
    const r = list[0].box.getBoundingClientRect();
    return r.left >= -1 && r.top >= -1 && r.right <= window.innerWidth + 1 && r.bottom <= window.innerHeight + 1;
}, null, { timeout: 5000 }).then(() => true, () => false);
await settleWin();
const landscapeNote = await readWin();
ok(gotInside, 'след завъртане в 844x390 бележката е цялата в екрана (преди беше 500+280 = 780 под екрана)', landscapeNote);
ok(landscapeNote.inside && landscapeNote.bottom <= 390 && landscapeNote.right <= 844, 'ръбовете на бележката са в екрана', landscapeNote);
ok(landscapeNote.w === portrait0.w && landscapeNote.h === portrait0.h,
    'размерът не е смаляван, когато се побира (същият, както в портрет)', { portrait: portrait0, landscape: landscapeNote });
ok(landscapeNote.geom === portrait0.geom, 'записът за мястото НЕ е презаписан от завъртането', { before: portrait0.geom, after: landscapeNote.geom });

// Връщаме телефона: бележката трябва да е точно там, където си е била.
await page.setViewportSize({ width: 390, height: 844 });
const backAgain = await page.waitForFunction((want) => {
    if (typeof getOpenNoteWindows !== 'function') return false;
    const list = getOpenNoteWindows();
    if (!list.length) return false;
    const r = list[0].box.getBoundingClientRect();
    return Math.abs(Math.round(r.left) - want.left) <= 2 && Math.abs(Math.round(r.top) - want.top) <= 2;
}, { left: portrait0.left, top: portrait0.top }, { timeout: 5000 }).then(() => true, () => false);
await settleWin();
const portraitBack = await readWin();
ok(backAgain, 'след връщане в портрет бележката е на същото място, където беше', { was: portrait0, now: portraitBack });
ok(portraitBack.left === portrait0.left && portraitBack.top === portrait0.top, 'мястото е същото до пиксел', { was: portrait0, now: portraitBack });
ok(portraitBack.geom === portrait0.geom, 'записът за мястото е непокътнат и след връщането', { before: portrait0.geom, after: portraitBack.geom });

// ================= 4. Разпъната бележка спира до лентата (uni #161; в MNV вече е така) ========
await page.setViewportSize({ width: 1280, height: 900 });
await page.evaluate(() => {
    showModal({ raw: 'Втора|Тялото на втората бележка', format: '', color: '#68FF97', id: 985002, gdid: '985002' });
});
const twoNotes = await page.waitForFunction(() => typeof getOpenNoteWindows === 'function' && getOpenNoteWindows().length === 2,
    null, { timeout: 8000 }).then(() => true, () => false);
ok(twoNotes, 'две бележки са отворени (за проверката на лентата)');

const expanded = await page.evaluate(async () => {
    const bar = document.getElementById('open-notes-bar');
    const visibleBefore = !!bar && document.body.classList.contains('open-notes-bar-visible');
    const top = getTopNoteWindow();
    const other = getOpenNoteWindows().find(w => w !== top);
    toggleNoteWindowExpanded(top);
    await new Promise(r => setTimeout(r, 260));
    const br = bar ? bar.getBoundingClientRect() : null;
    const box = top.el.querySelector('.modal-content-box');
    const r = box.getBoundingClientRect();
    const otherBox = other ? other.el.querySelector('.modal-content-box') : null;
    const oRect = otherBox ? otherBox.getBoundingClientRect() : null;
    const out = {
        visibleBefore,
        barVisible: document.body.classList.contains('open-notes-bar-visible'),
        barTop: br ? Math.round(br.top) : null,
        expandedBottom: Math.round(r.bottom),
        expandedH: Math.round(r.height),
        expandedClass: top.el.classList.contains('note-window-expanded'),
        otherH: oRect ? Math.round(oRect.height) : null,
        otherBottom: oRect ? Math.round(oRect.bottom) : null,
        vh: window.innerHeight
    };
    toggleNoteWindowExpanded(top); // връщаме нормалния размер
    return out;
});
ok(expanded.barVisible && expanded.expandedClass, 'лентата е на екрана и бележката е разпъната', expanded);
ok(expanded.barTop !== null && Math.abs((expanded.barTop - 8) - expanded.expandedBottom) <= 2,
    'разпънатата бележка свършва 8px над лентата (бутоните ѝ остават видими)', expanded);
ok(expanded.otherH !== null && expanded.otherH < 500, 'другата бележка не е разпъната до целия екран', expanded);
ok(expanded.otherBottom !== null && expanded.otherBottom <= expanded.vh + 1, 'другата бележка не стърчи под екрана', expanded);

ok(errs.length === 0, 'няма грешки по страницата', errs.slice(0, 5));

console.log(`\n${n - fails}/${n} проверки минаха` + (fails ? `, ${fails} ПРОВАЛИ` : ''));
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
