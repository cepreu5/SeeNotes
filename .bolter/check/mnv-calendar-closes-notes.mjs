// Календарът в MNV затваря отворените бележки (порт от uni PR #155) — жив браузър (Playwright).
// Прозорците на бележките живеят в #note-windows-layer над всичко останало, значи без тази промяна
// оставаха да плават върху календара. Проверява, че изборът на „Календар" (през собствения път на
// приложението, filterNotesByBoard) затваря всички отворени прозорци и календарът се вижда след това.
// Пускане от корена на хранилището: node .bolter/check/mnv-calendar-closes-notes.mjs  (exit 1 при провал)
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
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.addInitScript(() => {
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
    // Без пълния старт на приложението някои глобални DOM референции още са undefined, а календарът
    // ги ползва (notesContainer, scrollTopBtn). Взимаме ги от DOM-а, както прави startApp.
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

// Отваря два прозореца през собствения път на приложението (showModal).
const openTwo = async (tag) => page.evaluate((t) => {
    showModal({ raw: `Бележка ${t} A|Тялото на A`, format: '', color: '#FBFF86', id: 980010, gdid: '980010' });
    showModal({ raw: `Бележка ${t} B|Тялото на B`, format: '', color: '#FF829E', id: 980020, gdid: '980020' });
    return {
        count: getOpenNoteWindows().length,
        texts: getOpenNoteWindows().map(w => (w.body ? w.body.textContent : '').slice(0, 20))
    };
}, tag);

let r = await openTwo('едно');
const twoOpen = await page.waitForFunction(() => typeof getOpenNoteWindows === 'function' && getOpenNoteWindows().length === 2, null, { timeout: 8000 })
    .then(() => true, () => false);
ok(twoOpen && r.count === 2, 'две бележки са отворени в два прозореца', r);

// Календарът през собствения път на приложението.
await page.evaluate(async () => { await filterNotesByBoard('calendar'); });
const calState = await page.waitForFunction(() => {
    const c = document.getElementById('calendar-container');
    return !!c && c.style.display !== 'none' && !!c.querySelector('.calendar-grid')
        && typeof getOpenNoteWindows === 'function' && getOpenNoteWindows().length === 0;
}, null, { timeout: 8000 }).then(() => true, () => false).catch(() => false);
const after = await page.evaluate(() => {
    const c = document.getElementById('calendar-container');
    const cr = c ? c.getBoundingClientRect() : null;
    const visibleWins = [...document.querySelectorAll('#note-windows-layer .note-window.visible')].length;
    return {
        open: typeof getOpenNoteWindows === 'function' ? getOpenNoteWindows().length : -1,
        display: c ? c.style.display : null,
        cells: c ? c.querySelectorAll('.calendar-cell').length : 0,
        size: cr ? { w: Math.round(cr.width), h: Math.round(cr.height) } : null,
        visibleWins: visibleWins
    };
});
ok(after.open === 0, 'след отваряне на календара няма нито един отворен прозорец на бележка', after);
ok(after.visibleWins === 0, 'в слоя на прозорците не е останал видим прозорец', after);
ok(calState && after.display !== 'none' && after.size && after.size.h > 100, 'календарът се вижда след затварянето на бележките', after);
ok(after.cells >= 28, 'календарът е нарисуван (клетки за дните)', after);

// Същото за седмичния изглед: изборът му също минава през filterNotesByBoard.
r = await openTwo('две');
await page.waitForFunction(() => getOpenNoteWindows().length === 2, null, { timeout: 8000 }).catch(() => { });
ok(r.count === 2, 'след календара бележките пак се отварят (два прозореца)', r);
await page.evaluate(async () => { await filterNotesByBoard('calendar_weekly'); });
const weekly = await page.waitForFunction(() => {
    const w = document.getElementById('weekly-calendar-container');
    return !!w && w.style.display !== 'none' && getOpenNoteWindows().length === 0;
}, null, { timeout: 8000 }).then(() => true, () => false).catch(() => false);
const weeklyState = await page.evaluate(() => ({
    open: getOpenNoteWindows().length,
    weekly: (() => { const w = document.getElementById('weekly-calendar-container'); return !!w && w.style.display !== 'none'; })()
}));
ok(weekly && weeklyState.open === 0 && weeklyState.weekly, 'седмичният изглед също затваря отворените бележки', weeklyState);

ok(errs.length === 0, 'няма грешки по страницата', errs.slice(0, 5));

console.log(`\n${n - fails}/${n} проверки минаха` + (fails ? `, ${fails} ПРОВАЛИ` : ''));
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
