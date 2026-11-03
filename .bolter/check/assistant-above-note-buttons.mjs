// Иконата на асистента при разпъната бележка: спира 50px над ДОЛНИЯ РЪБ на бележката, не върху реда с
// кръглите ѝ бутони.
//
// Симптомът на собственика (3.11.2026): „при максимизиране бутонът на асистента не се премества над бутоните
// на бележката“. Причината: отстъпът беше твърд (translate: 0 -60px) и се даваше САМО докато иконата стои на
// основното си място от stylesheet-а. Щом собственикът я е местил, позицията ѝ се пази като инлайн top/right,
// старият код не даваше никакъв отстъп и иконата оставаше плътно на долния ръб - точно върху бутоните.
// Затова отстъпът вече се смята: долният ръб на бележката минус 50px.
//
// Какво проверява (истински Chromium, истинският uni код, засята IndexedDB, ?demo=1, мобилен контекст с
// докосване):
//   1) една бележка, разпъване: долният ръб на иконата е точно 50px над долния ръб на бележката;
//   2) иконата не покрива НИТО ЕДИН кръгъл бутон на бележката;
//   3) същото на 1280x900;
//   4) иконата със ЗАПАЗЕНА позиция на долния ръб (собственикът я е местил) също се вдига - това е случаят,
//      в който преди поправката не се вдигаше нищо;
//   5) икона, сложена от собственика ПО-ВИСОКО от целта, не се дърпа надолу;
//   6) при две бележки с лента на екрана разпънатата спира над лентата, а иконата - 50px над долния ѝ ръб,
//      пак без застъпване с бутоните;
//   7) след свиване отстъпът се маха и иконата се връща на мястото си;
//   8) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/assistant-above-note-buttons.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (за да се провери, че тестът хваща липсващата поправка).
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
const PAGE = 'index.html';
const SEED_PATH = '/__seed.html';

if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}

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

const browser = await chromium.launch({ executablePath: CHROME });

const seedApp = (page) => page.evaluate(async () => {
    const dbName = 'NotesDB-demo';
    const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null, files: { keyPath: 'key' } };
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
    for (let i = 1; i <= 6; i++) {
        boards.push({ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b' + i, id: i, numord: i, status: 0, title: 'Board ' + i });
    }
    const body = Array.from({ length: 40 }, (_, i) => `❖ Ред ${i + 1}: дълъг текст за пробата, който пълни бележката.`).join('\n');
    let k = 0;
    for (const b of boards) {
        for (let j = 1; j <= 2; j++) {
            k++;
            notes.push({
                alarm_type: -1, boardid: b.gdid, calendarDate: 0, color: 0,
                date: now - k * 1000, datemod: now - k * 1000, eventId: 0,
                gdid: `Note${String(k).padStart(18, '0')}`, id: 1000 + k,
                notetxt: `Бележка ${k}|${body}`, numord: k, pass: false, sellist: 0, status: 0,
                text_span: '', timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 243
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
});

const newPage = async (W, H, fabPos) => {
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        serviceWorkers: 'block'
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
    await page.addInitScript(([fabPos]) => {
        const oauth2 = { initTokenClient() { return { requestAccessToken() { } }; }, hasGrantedAllScopes() { return false; } };
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
        localStorage.setItem('hideAssistant', 'false');
        localStorage.setItem('showBoardAll', 'true');
        localStorage.setItem('startBoard', 'all');
        localStorage.setItem('showWeeklyCalendar', 'false');
        if (fabPos) localStorage.setItem('kbFabPosition', JSON.stringify(fabPos));
    }, [fabPos]);
    await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
    await seedApp(page);
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        && document.querySelectorAll('#notes-container .note:not(.promo-note)').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    return { ctx, page, errs, ready };
};

// Геометрията, която ни трябва: долният ръб на разпънатата бележка, иконата и кръглите бутони на бележката.
const geo = (page) => page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right) }; };
    const papers = [...document.querySelectorAll('.note-window .modal-content-box')];
    const expandedPaper = papers.find(p => p.querySelector(':scope > .nw-modal-body[data-is-expanded="true"]')) || null;
    const footer = expandedPaper ? expandedPaper.querySelector('.modal-footer-toolbar') : null;
    const btns = expandedPaper
        ? [...expandedPaper.querySelectorAll('.modal-footer-btn')].filter(b => b.getBoundingClientRect().height > 0).map(b => ({ cls: String(b.className).slice(0, 40), ...r(b) }))
        : [];
    const fabEl = document.getElementById('kb-fab');
    const bar = document.getElementById('open-notes-bar') || document.querySelector('.open-notes-bar');
    const barShown = !!bar && getComputedStyle(bar).display !== 'none' && bar.getBoundingClientRect().height > 0;
    return {
        vw: innerWidth, vh: innerHeight,
        btnsDebug: expandedPaper && footer ? { footerH: Math.round(footer.getBoundingClientRect().height), found: footer.querySelectorAll('.modal-footer-btn').length, all: document.querySelectorAll('.modal-footer-btn').length, html: footer.outerHTML.slice(0, 240) } : null,
        expanded: document.body.classList.contains('modal-note-expanded'),
        liftClass: document.body.classList.contains('modal-note-expanded-fab-lift'),
        liftVar: getComputedStyle(document.body).getPropertyValue('--expanded-fab-lift').trim(),
        barShown, barTop: barShown ? r(bar).top : null,
        paper: expandedPaper ? r(expandedPaper) : null,
        footerTop: footer ? r(footer).top : null,
        btns,
        fab: fabEl ? r(fabEl) : null,
        fabTranslate: fabEl ? getComputedStyle(fabEl).translate : '',
        windowsOpen: document.querySelectorAll('.note-window.visible').length
    };
});

const expandActive = (page) => page.evaluate(() => {
    const wins = [...document.querySelectorAll('.note-window.visible')];
    const top = wins.filter(w => w.classList.contains('note-window-active')).pop() || wins.pop();
    const btn = top && top.querySelector('.nw-modal-expand-btn');
    if (!btn) return false;
    btn.click();
    return true;
});

// Кръглите бутони на бележката се строят с тялото на прозореца и на широка част от случаите идват с една
// крачка по-късно от самото разпъване - изчакваме ги, преди да мерим.
const waitFooterButtons = (page, timeout = 6000) => page
    .waitForFunction(() => document.querySelectorAll('.note-window .modal-footer-btn').length > 0, null, { timeout })
    .then(() => true, () => false);

const openTwoNotes = async (page) => {    await page.locator('#notes-container .note:not(.promo-note)').first().click();
    await page.waitForTimeout(700);
    for (let attempt = 0; attempt < 4; attempt++) {
        const spot = await page.evaluate(() => {
            const boxes = [...document.querySelectorAll('.note-window.visible .modal-content-box')]
                .map(b => b.getBoundingClientRect());
            const card = [...document.querySelectorAll('#notes-container .note:not(.promo-note)')].slice(1).find(c => {
                const r = c.getBoundingClientRect();
                if (r.height === 0 || r.bottom < 0 || r.top > innerHeight) return false;
                return !boxes.some(w => r.bottom > w.top && r.top < w.bottom);
            });
            if (!card) return null;
            const r = card.getBoundingClientRect();
            return { x: Math.round(r.x + Math.min(r.width / 2, 80)), y: Math.round(r.y + Math.min(r.height / 2, 24)) };
        });
        if (spot) {
            await page.mouse.click(spot.x, spot.y);
            await page.waitForTimeout(900);
            if (await page.evaluate(() => document.querySelectorAll('.note-window.visible').length) >= 2) break;
        }
        await page.evaluate(() => { const c = document.getElementById('notes-container'); if (c) c.scrollBy(0, 320); });
        await page.waitForTimeout(400);
    }
    return page.evaluate(() => document.querySelectorAll('.note-window.visible').length);
};

// Общите проверки „иконата е 50px над долния ръб и не покрива нито един бутон“.
const checkFabAboveButtons = (g, tag) => {
    ok(g.expanded, `${tag}: бележката е разпъната`, g);
    ok(!!g.paper && !!g.fab, `${tag}: има долен ръб на бележката и икона`, { paper: g.paper, fab: g.fab });
    if (!g.paper || !g.fab) return;
    const gap = g.paper.bottom - g.fab.bottom;
    // Целта: 50px над долния ръб на бележката, но не по-ниско от върха на реда с бутоните (на широк екран
    // редът е по-висок от 50px).
    const target = g.footerTop ? Math.min(g.paper.bottom - 50, g.footerTop) : g.paper.bottom - 50;
    ok(gap >= 50, `${tag}: иконата е поне 50px над долния ръб на бележката`, { gap, paperBottom: g.paper.bottom, fabBottom: g.fab.bottom });
    ok(Math.abs(g.fab.bottom - target) <= 1, `${tag}: иконата е точно на целта (50px или върха на реда с бутоните)`, { fabBottom: g.fab.bottom, target, footerTop: g.footerTop });
    ok(g.liftClass, `${tag}: класът за отстъп е сложен`, g);
    const overlap = g.btns.filter(b => g.fab.bottom > b.top && g.fab.top < b.bottom && g.fab.right > b.left && g.fab.left < b.right);
    ok(overlap.length === 0, `${tag}: иконата не покрива нито един кръгъл бутон на бележката`, { overlap, fab: g.fab, btn1: g.btns[0] });
    if (g.btns.length) ok(g.fab.bottom <= g.btns[0].top, `${tag}: иконата е изцяло НАД реда с бутоните`, { fabBottom: g.fab.bottom, btnTop: g.btns[0].top });
    else ok(false, `${tag}: намерени са кръглите бутони на бележката`, { btns: g.btns.length, footerTop: g.footerTop, debug: g.btnsDebug });
    if (g.barShown) ok(g.paper.bottom <= g.barTop, `${tag}: бележката спира над лентата`, { paperBottom: g.paper.bottom, barTop: g.barTop });
};

// ── 1. Една бележка: разпъване без лента, 390x844 и 1280x900 ─────────────────────────────────────
for (const [W, H] of [[390, 844], [1280, 900]]) {
    const { ctx, page, errs, ready } = await newPage(W, H, null);
    const tag = `${W}x${H}`;
    ok(ready, `${tag}: приложението е готово`);
    await page.locator('#notes-container .note:not(.promo-note)').first().click();
    await page.waitForTimeout(800);
    // Демо данните понякога идват след първото отваряне: бележката се отваря само за четене и редът с бутони
    // остава празен. Затваряме и отваряме пак, преди да мерим - това не е част от проверяваното поведение.
    for (let attempt = 0; attempt < 2; attempt++) {
        if (await waitFooterButtons(page, 5000)) break;
        await page.evaluate(() => {
            const wins = [...document.querySelectorAll('.note-window.visible')];
            const top = wins.filter(w => w.classList.contains('note-window-active')).pop() || wins.pop();
            const close = top && top.querySelector('.modal-close');
            if (close) close.click();
        });
        await page.waitForTimeout(600);
        await page.locator('#notes-container .note:not(.promo-note)').first().click();
        await page.waitForTimeout(900);
    }
    const before = await geo(page);
    ok(!before.liftClass && before.fab.bottom !== null, `${tag}: преди разпъване няма отстъп`, before);
    ok(await expandActive(page), `${tag}: има бутон за разпъване`);
    await page.waitForTimeout(900);
    const haveBtns = await waitFooterButtons(page);
    if (!haveBtns) await page.waitForTimeout(400);
    const g = await geo(page);
    checkFabAboveButtons(g, `${tag} една бележка`);
    // ── 7. Свиване: отстъпът се маха и иконата се връща на мястото си ──
    ok(await expandActive(page), `${tag}: има бутон за свиване`);
    await page.waitForTimeout(900);
    const back = await geo(page);
    ok(!back.liftClass && back.fab.bottom === before.fab.bottom, `${tag}: след свиване иконата е пак на мястото си`, { before: before.fab, after: back.fab, liftClass: back.liftClass });
    ok(errs.length === 0, `${tag}: няма изключения в конзолата`, errs);
    await page.screenshot({ path: `.bolter/check/assistant-above-note-buttons-${W}.png` });
    await ctx.close();
}

// ── 2. Иконата е местена (запазена позиция): преди поправката точно тук не се вдигаше нищо ─────────
{
    const { ctx, page, errs, ready } = await newPage(390, 844, { right: 10, bottom: 10 });
    ok(ready, 'запазена позиция: приложението е готово');
    await page.locator('#notes-container .note:not(.promo-note)').first().click();
    await page.waitForTimeout(800);
    const before = await geo(page);
    ok(before.fab.bottom === 844, 'запазена позиция: иконата наистина е плътно на долния ръб', before.fab);
    await expandActive(page);
    await page.waitForTimeout(900);
    const g = await geo(page);
    checkFabAboveButtons(g, 'запазена позиция долу');
    await ctx.close();
}

// ── 5. Икона, сложена от собственика по-високо от целта, не се дърпа надолу ──────────────────────
{
    const { ctx, page } = await newPage(390, 844, { right: 10, top: 500 });
    await page.locator('#notes-container .note:not(.promo-note)').first().click();
    await page.waitForTimeout(800);
    const before = await geo(page);
    await expandActive(page);
    await page.waitForTimeout(900);
    const g = await geo(page);
    ok(g.fab.bottom === before.fab.bottom, 'икона висока горе: остава където собственикът я е сложил', { before: before.fab, after: g.fab });
    ok(!g.liftClass && g.liftVar === '0px', 'икона висока горе: няма отстъп', { liftVar: g.liftVar, liftClass: g.liftClass });
    const overlap = g.btns.filter(b => g.fab.bottom > b.top && g.fab.left < b.right && g.fab.right > b.left);
    ok(overlap.length === 0, 'икона висока горе: не покрива бутоните', overlap);
    await ctx.close();
}

// ── 6. Две бележки с лента на екрана: разпънатата спира над лентата, иконата - 50px над нея ───────
{
    const { ctx, page, errs, ready } = await newPage(390, 844, null);
    ok(ready, 'лента: приложението е готово');
    const n = await openTwoNotes(page);
    ok(n >= 2, 'лента: отворени са две бележки', n);
    const withBar = await geo(page);
    ok(withBar.barShown, 'лента: лентата се вижда', withBar.barTop);
    await expandActive(page);
    await page.waitForTimeout(900);
    const g = await geo(page);
    checkFabAboveButtons(g, 'лента');
    ok(errs.length === 0, 'лента: няма изключения в конзолата', errs);
    await page.screenshot({ path: '.bolter/check/assistant-above-note-buttons-bar-390.png' });
    await ctx.close();
}

await browser.close();
srv.close();

console.log(fails === 0 ? `ALL OK (${n} проверки)` : `${fails} от ${n} проверки падат`);
process.exit(fails === 0 ? 0 : 1);
