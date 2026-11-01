// Бутонът за календар в хедъра на MNV затваря отворените бележки — жив браузър (Playwright).
// Досега този бутон викаше renderCalendarView() напряко, а прозорците на бележките живеят в
// #note-windows-layer над всичко останало, значи оставаха да плават върху календара (пътят през
// борд „Календар" / filterNotesByBoard ги затваряше, бутонът - не).
//  1) две отворени бележки -> истински клик върху #calendar_button -> няма видим прозорец,
//     календарът е на екрана с нарисувана решетка, хедърът/списъкът/стрелката остават скрити;
//  2) същото с ЕДНА отворена бележка;
//  3) без отворени бележки календарът пак се отваря и нищо не хвърля.
// Всяка подредба е на своя страница, за да не зависи от това как се излиза от календара.
// Пускане от корена на хранилището: node .bolter/check/mnv-calendar-button-closes-notes.mjs
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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
await ctx.addInitScript(() => {
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
    localStorage.setItem('showWeeklyCalendar', 'false'); // месечен изглед за boardId 'calendar'
});

// Нов прозорец върху същия контекст (един браузър за целия тест).
async function bootPage() {
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
    page.on('console', m => {
        if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300));
    });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    const loaded = await page.waitForFunction(() => typeof createNoteElement === 'function'
        && typeof startApp === 'function' && typeof mediaData !== 'undefined'
        && typeof showModal === 'function' && typeof filterNotesByBoard === 'function', null, { timeout: 30000 })
        .then(() => true, () => false);
    let started = false;
    if (loaded) {
        // Истинският старт на приложението (офлайн): слушателят на бутона за календар се закача
        // в initApp, който се вика от startApp. Без него кликът върху бутона не прави нищо, тоест
        // проверката нямаше да пипа истинския път на приложението.
        started = await page.evaluate(async () => {
            const out = { started: false, err: '' };
            try { if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags(); } catch (e) { /* ignore */ }
            useIndexedDb = true; useGoogleDb = false; useLocalFolder = false; useArhDb = false;
            isOffline = true;
            try {
                await startApp(true);
                out.started = true;
            } catch (e) { out.err = String((e && e.message) || e).slice(0, 200); }
            try { dbNoteIdTypeGlobal = 'gdid'; dbSourceGlobal = 1; } catch (e) { /* ignore */ }
            if (typeof notesContainer === 'undefined' || !notesContainer) notesContainer = document.getElementById('notes-container');
            if (typeof scrollTopBtn === 'undefined' || !scrollTopBtn) scrollTopBtn = document.getElementById('scrollTopBtn');
            if (typeof currentCalendarDate === 'undefined' || !currentCalendarDate) currentCalendarDate = new Date();
            return out.started ? true : ('старт: ' + (out.err || 'няма грешка'));
        }).catch(e => String((e && e.message) || e).slice(0, 200));
    }
    return { page, errs, booted: loaded && started === true, bootInfo: started };
}

// Отваря n бележки през собствения път на приложението (showModal) и чака прозорците им да се
// изрисуват (появата им е анимация: класът 'visible' се слага в requestAnimationFrame, а кутията
// изплува с opacity 0 -> 1).
async function openNotes(page, count) {
    await page.evaluate((c) => {
        for (let i = 0; i < c; i++) {
            const id = 980100 + i * 10;
            showModal({ raw: `Бележка ${i + 1}|Тялото на бележка ${i + 1}`, format: '', color: '#FBFF86', id, gdid: `${id}` });
        }
    }, count);
    return page.waitForFunction((c) => {
        if (typeof getOpenNoteWindows !== 'function' || getOpenNoteWindows().length !== c) return false;
        let drawn = 0;
        document.querySelectorAll('#note-windows-layer .note-window').forEach(el => {
            if (!el.classList.contains('visible')) return;
            const box = el.querySelector('.modal-content-box');
            if (!box) return;
            const cs = getComputedStyle(box);
            const r = box.getBoundingClientRect();
            if ((parseFloat(cs.opacity) || 0) > 0.05 && r.width > 4 && r.height > 4) drawn++;
        });
        return drawn === c;
    }, count, { timeout: 8000 }).then(() => true, () => false);
}

// Какво се вижда в слоя на прозорците: клас 'visible' И наистина изрисувана кутия на бележката.
const layerState = (page) => page.evaluate(() => {
    const shown = [];
    document.querySelectorAll('#note-windows-layer .note-window').forEach(el => {
        const box = el.querySelector('.modal-content-box');
        const cs = box ? getComputedStyle(box) : null;
        const r = box ? box.getBoundingClientRect() : { width: 0, height: 0, left: 0, top: 0 };
        const drawn = el.classList.contains('visible') && getComputedStyle(el).visibility !== 'hidden'
            && !!cs && (parseFloat(cs.opacity) || 0) > 0.05 && cs.display !== 'none'
            && r.width > 4 && r.height > 4;
        if (drawn) shown.push({ w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) });
    });
    return {
        open: typeof getOpenNoteWindows === 'function' ? getOpenNoteWindows().length : -1,
        visibleClass: document.querySelectorAll('#note-windows-layer .note-window.visible').length,
        shown
    };
});

const calendarState = (page) => page.evaluate(() => {
    const c = document.getElementById('calendar-container');
    const r = c ? c.getBoundingClientRect() : null;
    const header = document.querySelector('header');
    const notes = document.getElementById('notes-container');
    const scroll = document.getElementById('scrollTopBtn');
    return {
        exists: !!c,
        display: c ? c.style.display : null,
        rect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
        grid: c ? c.querySelectorAll('.calendar-grid').length : 0,
        cells: c ? c.querySelectorAll('.calendar-grid .calendar-cell, .calendar-grid .calendar-cell-blank').length : 0,
        headerHidden: !!header && getComputedStyle(header).display === 'none',
        notesHidden: !!notes && getComputedStyle(notes).display === 'none',
        scrollHidden: !!scroll && getComputedStyle(scroll).display === 'none',
        scrollExists: !!scroll
    };
});

// Истински клик върху бутона за календар в хедъра (не напряко на renderCalendarView).
async function clickCalendarButton(page) {
    const btn = await page.$('#calendar_button');
    if (!btn) return 'няма #calendar_button';
    const box = await btn.boundingBox();
    if (!box || box.width < 4 || box.height < 4) return 'бутонът няма кутия: ' + JSON.stringify(box);
    try {
        await page.click('#calendar_button', { timeout: 8000 });
        return null;
    } catch (e) {
        return String((e && e.message) || e).split('\n')[0].slice(0, 200);
    }
}

// --- 1) Две отворени бележки ---------------------------------------------------------------
{
    const { page, errs, booted, bootInfo } = await bootPage();
    ok(booted, '[две бележки] страницата на приложението се зареди и стартира', bootInfo);
    if (booted) {
        const twoOpen = await openNotes(page, 2);
        const before = await layerState(page);
        ok(twoOpen && before.open === 2 && before.shown.length === 2,
            '[две бележки] два прозореца са отворени и се виждат преди клика', before);
        const calBefore = await calendarState(page);
        ok(!calBefore.exists || calBefore.display === 'none' || calBefore.display === '',
            '[две бележки] календарът още не е на екрана преди клика', calBefore);

        const clickErr = await clickCalendarButton(page);
        ok(!clickErr, '[две бележки] истинският клик върху #calendar_button мина', clickErr);

        const settled = await page.waitForFunction(() => {
            const c = document.getElementById('calendar-container');
            return !!c && getComputedStyle(c).display !== 'none'
                && typeof getOpenNoteWindows === 'function' && getOpenNoteWindows().length === 0;
        }, null, { timeout: 8000 }).then(() => true, () => false);
        const after = await layerState(page);
        const cal = await calendarState(page);
        ok(settled, '[две бележки] приложението стигна до празен календар', { after, cal });
        ok(after.open === 0 && after.visibleClass === 0 && after.shown.length === 0,
            '[две бележки] след клика не е останал видим прозорец на бележка', after);
        ok(cal.exists && cal.display === 'block' && cal.rect && cal.rect.h > 100,
            '[две бележки] календарът се вижда', cal);
        ok(cal.grid === 1 && cal.cells >= 28, '[две бележки] календарът е нарисуван (клетки за дните)', cal);
        ok(cal.headerHidden && cal.notesHidden && cal.scrollHidden,
            '[две бележки] хедърът, списъкът и стрелката остават скрити от календара', cal);
        ok(errs.length === 0, '[две бележки] няма грешки по страницата', errs.slice(0, 5));
    }
    await page.close();
}

// --- 2) Една отворена бележка ---------------------------------------------------------------
{
    const { page, errs, booted, bootInfo } = await bootPage();
    ok(booted, '[една бележка] страницата на приложението се зареди и стартира', bootInfo);
    if (booted) {
        const oneOpen = await openNotes(page, 1);
        const before = await layerState(page);
        ok(oneOpen && before.open === 1 && before.shown.length === 1,
            '[една бележка] един прозорец е отворен и се вижда преди клика', before);

        const clickErr = await clickCalendarButton(page);
        ok(!clickErr, '[една бележка] истинският клик върху #calendar_button мина', clickErr);

        const settled = await page.waitForFunction(() => {
            const c = document.getElementById('calendar-container');
            return !!c && getComputedStyle(c).display !== 'none'
                && typeof getOpenNoteWindows === 'function' && getOpenNoteWindows().length === 0;
        }, null, { timeout: 8000 }).then(() => true, () => false);
        const after = await layerState(page);
        const cal = await calendarState(page);
        ok(settled, '[една бележка] приложението стигна до празен календар', { after, cal });
        ok(after.open === 0 && after.visibleClass === 0 && after.shown.length === 0,
            '[една бележка] след клика не е останал видим прозорец на бележка', after);
        ok(cal.display === 'block' && cal.cells >= 28, '[една бележка] календарът се вижда и е нарисуван', cal);
        ok(cal.headerHidden && cal.notesHidden && cal.scrollHidden,
            '[една бележка] хедърът, списъкът и стрелката остават скрити', cal);
        ok(errs.length === 0, '[една бележка] няма грешки по страницата', errs.slice(0, 5));
    }
    await page.close();
}

// --- 3) Без отворени бележки: календарът пак се отваря --------------------------------
{
    const { page, errs, booted, bootInfo } = await bootPage();
    ok(booted, '[без бележки] страницата на приложението се зареди и стартира', bootInfo);
    if (booted) {
        const before = await layerState(page);
        ok(before.open === 0 && before.shown.length === 0, '[без бележки] няма отворени прозорци', before);
        const clickErr = await clickCalendarButton(page);
        ok(!clickErr, '[без бележки] истинският клик върху #calendar_button мина', clickErr);
        const cal = await page.waitForFunction(() => {
            const c = document.getElementById('calendar-container');
            return !!c && getComputedStyle(c).display !== 'none' && !!c.querySelector('.calendar-grid');
        }, null, { timeout: 8000 }).then(() => true, () => false);
        const st = await calendarState(page);
        ok(cal && st.display === 'block' && st.cells >= 28, '[без бележки] календарът се отваря както досега', st);
        ok(st.headerHidden && st.notesHidden && st.scrollHidden, '[без бележки] хедърът и списъкът са скрити', st);
        ok(errs.length === 0, '[без бележки] няма грешки по страницата', errs.slice(0, 5));
    }
    await page.close();
}

console.log(`\n${n - fails}/${n} проверки минаха` + (fails ? `, ${fails} ПРОВАЛИ` : ''));
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
