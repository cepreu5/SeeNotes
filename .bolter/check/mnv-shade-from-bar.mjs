// Блурът от лентата в MNV (порт от uni b3.65–b3.67): дълго натискане или Ctrl/⌘+клик върху бутона
// за затваряне на всички отворени бележки вдига и сваля същия затъмнен слой, който режим
// „единична бележка" слага под отворените бележки.
//
// Искане на собственика (3.11.2026): „пренеси включването на блур при много бележки, както в uni".
//
// Какво проверява (истински Chromium, истинският MNV код, засята IndexedDB NotesDB, заглушени
// Google API):
//   1) при две отворени бележки лентата е видима и има бутон за затваряне на всички;
//   2) Ctrl+клик върху бутона вдига #single-note-overlay.visible, НЕ затваря бележките, а бутонът
//      носи клас is-shade-on (жълтият контур се вижда и в изчисления стил);
//   3) при вдигнат блур клик върху карта от борда не отваря бележка;
//   4) слоят е под ВСИЧКИ отворени бележки: z-index-ът му не е над нито една, а средата на всяка
//      бележка се уцелва с elementFromPoint като част от бележка (не като слоя);
//   5) дълго натискане (pointerdown, над 500 ms, pointerup) също вдига блура, а следващият click не
//      затваря бележките;
//   6) повторен Ctrl+клик сваля блура;
//   7) при една отворена бележка и вдигнат блур лентата остава на екрана (само от нея се сваля);
//   8) затварянето на последната бележка сваля блура и скрива лентата;
//   9) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/mnv-shade-from-bar.mjs   (exit 1 при провал)
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
const SHOTS = process.env.SHOTS_DIR || '.bolter/check';

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
                gdid: `Note${String(k).padStart(18, '0')}`, id: 1000 + k,
                notetxt: `Бележка ${k}|${body}`, numord: k, pass: false, sellist: 0, status: 0, type: 1,
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

const newPage = async (W, H) => {
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, serviceWorkers: 'block',
        ...(W < 800 ? { isMobile: true, hasTouch: true, deviceScaleFactor: 3 } : {})
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
    await page.addInitScript(() => {
        const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
        window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
        window.gapi = window.gapi || { client: { setToken() { }, getToken() { return { access_token: 'test-token' }; }, drive: { files: { list: async () => ({ result: { files: [] } }) } } }, load() { } };
        // Никакви заявки към Drive: миниатюрите на плочките падат тихо, вместо да хвърлят разбор на празен отговор.
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
    await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
    const seeded = await seedApp(page);
    await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
    const booted = await page.waitForFunction(() => typeof createNoteElement === 'function'
        && typeof startApp === 'function' && typeof showModal === 'function'
        && typeof getOpenNoteWindows === 'function' && typeof mediaData !== 'undefined', null, { timeout: 30000 })
        .then(() => true, () => false);
    if (!booted) return { ctx, page, errs, booted, seeded };
    // Офлайн само за старта (иначе checkAuth иска Google) - както в mnv-board-inline-image.
    const boot = await page.evaluate(async () => {
        const info = { err: '' };
        isOfflineMode = true;
        try { if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags(); } catch (e) { }
        try { await startApp(); } catch (e) { info.err = String((e && e.message) || e).slice(0, 300); }
        ['login-page', 'request-access-modal', 'folderIdPromptPopup'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        // Продуктовата обиколка „какво ново" (checkVersionUpdates на асистента) слага речев балон точно
        // в средата на екрана и той приема кликове - тогава средата на бележка изобщо не се уцелва.
        // За проверката тя не участва, затова пускането ѝ се затваря по същия път, по който се маха от
        // екрана (window.removeGuide), вместо пробата да се мести, за да я заобиколи.
        try { localStorage.setItem('app_version_seen', typeof version !== 'undefined' ? version : 'Beta 1.84'); } catch (e) { }
        try { window.removeGuide(); } catch (e) { }
        if (typeof window.showStep === 'function') window.showStep = () => { try { window.removeGuide(); } catch (e) { } };
        document.querySelectorAll('.guide-container, .speech-bubble, .guide-img').forEach(el => el.remove());
        info.cards = document.querySelectorAll('#notes-container .note:not(.promo-note)').length;
        return info;
    });
    return { ctx, page, errs, booted, seeded, boot };
};

// --- Помощни проверки в страницата ------------------------------------------------------------

// Бележките, които наистина се виждат на екрана: скрита бележка пази класа си, но е с нулева височина.
const STATE = () => {
    const o = document.getElementById('single-note-overlay');
    const cs = o ? getComputedStyle(o) : null;
    const bar = document.getElementById('open-notes-bar');
    const btn = document.querySelector('#open-notes-bar .open-notes-bar-close');
    const bcs = btn ? getComputedStyle(btn) : null;
    const wins = [...document.querySelectorAll('.note-window.visible')].filter(w => w.getBoundingClientRect().height > 0);
    return {
        overlayExists: !!o,
        overlayShown: !!o && o.classList.contains('visible') && cs.display !== 'none' && o.getBoundingClientRect().height > 0,
        blur: cs ? (cs.backdropFilter || cs.webkitBackdropFilter || '') : '',
        stored: localStorage.getItem('noteShadeOn'),
        mode: localStorage.getItem('singleNoteMode'),
        barShown: !!bar && getComputedStyle(bar).display !== 'none' && bar.getBoundingClientRect().height > 0,
        closeBtn: !!btn,
        btnShade: btn ? btn.classList.contains('is-shade-on') : null,
        btnShadow: bcs ? bcs.boxShadow : '',
        windows: wins.length
    };
};
const state = (page) => page.evaluate(STATE);

// Слоят трябва да е с z-index, който не е над нито една видима бележка.
const overlayBelowAll = (page) => page.evaluate(() => {
    const o = document.getElementById('single-note-overlay');
    if (!o) return { ok: false, why: 'няма слой' };
    const oz = Number(getComputedStyle(o).zIndex) || 0;
    const wins = [...document.querySelectorAll('.note-window.visible')]
        .filter(w => w.getBoundingClientRect().height > 0)
        .map(w => Number(getComputedStyle(w).zIndex) || 0);
    return { ok: wins.length > 0 && wins.every(z => z >= oz), oz, wins };
});

// Средата на всяка видима бележка трябва да е част от бележка (а не слоят). Бележките се застъпват
// стълбицей, значи средата на една може да е закрита от друга - това е нормално; важното е натискът
// там да стига до бележка, а не до блура.
const centersReachable = (page) => page.evaluate(() => {
    const chain = (el) => {
        const out = [];
        let e = el;
        while (e && e !== document.body && out.length < 6) {
            out.push(e.tagName + (e.id ? '#' + e.id : '') + '.' + (typeof e.className === 'string' ? e.className : ''));
            e = e.parentElement;
        }
        return out;
    };
    const wins = [...document.querySelectorAll('.note-window.visible')].filter(w => w.getBoundingClientRect().height > 0);
    const bad = [];
    for (const w of wins) {
        const r = w.getBoundingClientRect();
        const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
        if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) { bad.push({ why: 'средата е извън екрана', r: [r.left, r.top, r.width, r.height] }); continue; }
        const el = document.elementFromPoint(x, y);
        const at = el ? el.tagName + '.' + (typeof el.className === 'string' ? el.className : '') : null;
        if (!el || !el.closest('.note-window')) bad.push({ why: 'средата не стига до бележка', at, x, y, r: [r.left, r.top, r.width, r.height], chain: chain(el) });
        else if (el.closest('#single-note-overlay')) bad.push({ why: 'средата е слоят', at, x, y, r: [r.left, r.top, r.width, r.height] });
    }
    return { total: wins.length, bad };
});

// Точка от слоя, която наистина се вижда (за натискане върху блура).
const shadeSpot = (page) => page.evaluate(() => {
    const o = document.getElementById('single-note-overlay');
    if (!o) return null;
    const r = o.getBoundingClientRect();
    for (const y of [Math.round(r.top + 10), Math.round(r.top + r.height / 2), Math.round(r.bottom - 40)]) {
        for (const x of [Math.round(r.left + 8), Math.round(r.right - 8), Math.round(r.left + r.width / 2)]) {
            if (document.elementFromPoint(x, y) === o) return { x, y };
        }
    }
    return null;
});

// Бутонът трябва да е най-горният елемент в центъра си: иначе натискането отива в нещо друго и
// жестът мълчаливо не работи.
const closeTopmost = (page) => page.evaluate(() => {
    const btn = document.querySelector('#open-notes-bar .open-notes-bar-close');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return {
        ok: !!el && (el === btn || btn.contains(el)),
        at: el ? el.tagName + '.' + (typeof el.className === 'string' ? el.className : '') : null
    };
});

const CLOSE_SEL = '#open-notes-bar .open-notes-bar-close';
const closeCenter = async (page) => {
    const box = await page.locator(CLOSE_SEL).boundingBox();
    if (!box) return null;
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
};
const ctrlClick = async (page) => {
    await page.locator(CLOSE_SEL).click({ modifiers: ['Control'] });
    await page.waitForTimeout(400);
};
// Дълго натискане: истински показалец надолу, изчакване над прага (500 ms), нагоре. Браузърът праща и
// click - точно той не бива да затвори бележките.
const longPress = async (page) => {
    const c = await closeCenter(page);
    if (!c) return false;
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.waitForTimeout(560);
    await page.mouse.up();
    await page.waitForTimeout(400);
    return true;
};
// Отваря два прозореца през собствения път на приложението (showModal), както останалите MNV проверки.
const openTwo = async (page, tag) => {
    await page.evaluate((t) => {
        showModal({ raw: `Бележка ${t} A|Тялото на A`, format: '', color: '#FBFF86', id: 980010, gdid: '980010' });
        showModal({ raw: `Бележка ${t} B|Тялото на B`, format: '', color: '#FF829E', id: 980020, gdid: '980020' });
    }, tag);
    await page.waitForFunction(() => getOpenNoteWindows().filter(w => !w.hidden).length >= 2, null, { timeout: 8000 }).catch(() => { });
    return (await state(page)).windows;
};

// ── 1. Жестът на широк екран ───────────────────────────────────────────────────────────────────
{
    const { ctx, page, errs, booted, boot } = await newPage(1280, 900);
    ok(booted && boot && !boot.err, 'приложението стартира', { booted, boot });
    ok(!!boot && boot.cards >= 2, 'на борда има карти, по които да се натиска', boot && boot.cards);

    // 1) Две отворени бележки: лентата се вижда и има бутон за затваряне на всички.
    const opened = await openTwo(page, 'едно');
    ok(opened === 2, 'отворени са две бележки', opened);
    const s0 = await state(page);
    ok(s0.barShown, 'при две бележки лентата се вижда', s0);
    ok(s0.closeBtn, 'лентата има бутон за затваряне на всички', s0);
    ok(!s0.overlayShown, 'преди жеста блур няма', s0);

    // 2) Ctrl+клик: блурът се вдига, бележките остават, бутонът го показва.
    const before = await closeTopmost(page);
    ok(before && before.ok, 'бутонът е най-горният елемент в центъра си', before);
    await ctrlClick(page);
    const s1 = await state(page);
    ok(s1.overlayShown, 'Ctrl+клик вдига слоя (single-note-overlay.visible)', s1);
    ok(/blur/.test(s1.blur) && !/blur\(0px\)/.test(s1.blur), 'слоят е наистина замъглен (backdrop blur)', s1.blur);
    ok(s1.windows === 2 && s1.stored === 'true', 'Ctrl+клик НЕ затваря бележките', { before: 2, after: s1.windows, stored: s1.stored });
    ok(s1.btnShade === true, 'бутонът носи клас is-shade-on', s1.btnShade);
    ok(/inset/.test(s1.btnShadow) && /255,\s*212,\s*0|#FFD400/.test(s1.btnShadow), 'бутонът показва жълтия контур', s1.btnShadow);

    // 3) Карта от борда не отваря бележка, докато блурът е вдигнат (истински показалец по карта се
    // хваща от слоя, значи се проверява самата защита в handleNoteClick - програмно натискане).
    const cardPress = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#notes-container .note:not(.promo-note)')];
        cards.slice(0, 3).forEach(c => c.click());
        return { cards: cards.length, clicked: Math.min(3, cards.length) };
    });
    await page.waitForTimeout(700);
    const s2 = await state(page);
    ok(cardPress.clicked > 0, 'има по коя карта да се натисне', cardPress);
    ok(s2.windows === 2, 'при вдигнат блур натискане по карта НЕ отваря бележка', { before: 2, after: s2.windows });

    // 4) Слоят е под ВСИЧКИ отворени бележки.
    const zord = await overlayBelowAll(page);
    ok(zord.ok, 'z-index на слоя не е над нито една отворена бележка', zord);
    const reach = await centersReachable(page);
    ok(reach.total === 2, 'има две видими бележки за проверката на достъпността', reach);
    ok(reach.bad.length === 0, 'средата на всяка бележка се уцелва като част от бележка, не като слоя', reach);
    await page.screenshot({ path: `${SHOTS}/mnv-shade-from-bar-1280.png` });

    // 6) Повторен Ctrl+клик сваля блура, без да затваря бележки.
    await ctrlClick(page);
    const s3 = await state(page);
    ok(!s3.overlayShown && s3.stored === 'false', 'повторен Ctrl+клик сваля блура', s3);
    ok(s3.windows === 2, 'свалянето не затваря бележки', s3.windows);
    ok(s3.btnShade === false, 'бутонът вече не показва блур', s3.btnShade);
    ok(s3.barShown, 'при две бележки лентата си остава', s3);

    // 5) Дълго натискане: блурът се вдига, а click-ът след него не затваря бележките.
    ok(await longPress(page), 'има бутон за дълго натискане');
    const s4 = await state(page);
    ok(s4.overlayShown, 'дълго натискане вдига блура', s4);
    ok(s4.windows === 2, 'click-ът след дългото натискане НЕ затваря бележките', { before: 2, after: s4.windows });
    ok(s4.stored === 'true' && s4.btnShade === true && s4.barShown, 'състоянието се вижда на бутона и лентата остава', s4);

    // 7) Натискане върху блура затваря най-горната бележка; с една останала лентата остава, защото
    // само от нея се сваля блурът.
    const spot = await shadeSpot(page);
    ok(!!spot, 'блурът се вижда извън бележките', spot);
    if (spot) {
        await page.mouse.click(spot.x, spot.y);
        await page.waitForTimeout(800);
        const s5 = await state(page);
        ok(s5.windows === 1, 'натискане върху блура затваря най-горната бележка', { before: 2, after: s5.windows });
        ok(s5.overlayShown && s5.stored === 'true', 'с една бележка блурът е още вдигнат', s5);
        ok(s5.barShown, 'при една отворена бележка и вдигнат блур лентата остава на екрана', s5);
        ok(s5.btnShade === true, 'и бутонът в нея още показва блура', s5.btnShade);
    }

    // 8) Обикновен клик върху бутона затваря и последната бележка: блурът пада сам, лентата се скрива.
    const topmost = await closeTopmost(page);
    ok(topmost && topmost.ok, 'бутонът е достъпен и при една бележка', topmost);
    await page.locator(CLOSE_SEL).click();
    await page.waitForTimeout(800);
    const s6 = await state(page);
    ok(s6.windows === 0, 'обикновен клик затваря всички бележки', s6);
    ok(!s6.overlayShown && s6.stored === 'false', 'обикновеният клик НЕ вдига блура, а последната бележка го сваля', s6);
    ok(!s6.barShown, 'и лентата се скрива заедно с блура', s6);

    // След свалянето картата пак отваря бележка - блурът не остава да пречи.
    const reopened = await page.evaluate(async () => {
        const card = document.querySelector('#notes-container .note:not(.promo-note)');
        if (card) card.click();
        await new Promise(r => setTimeout(r, 800));
        return getOpenNoteWindows().filter(w => !w.hidden).length;
    });
    ok(reopened >= 1, 'след свалянето на блура карта пак отваря бележка', reopened);

    ok(errs.length === 0, '1280: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ── 2. Същото на телефон ──────────────────────────────────────────────────────────────────────
{
    const { ctx, page, errs, booted, boot } = await newPage(390, 844);
    ok(booted && boot && !boot.err, '390: приложението стартира', { booted, boot });
    const opened = await openTwo(page, 'телефон');
    ok(opened === 2, '390: две бележки', opened);
    const b = await closeTopmost(page);
    ok(b && b.ok, '390: бутонът в лентата е най-горе', b);
    ok(await longPress(page), '390: има бутон за дълго натискане');
    const s = await state(page);
    ok(s.overlayShown && s.windows === 2 && s.barShown, '390: дълго натискане вдига блура, бележките и лентата остават', s);
    const reach = await centersReachable(page);
    ok(reach.total === 2 && reach.bad.length === 0, '390: и двете бележки са над слоя', reach);
    const zord = await overlayBelowAll(page);
    ok(zord.ok, '390: z-index на слоя е под най-долната бележка', zord);
    await page.screenshot({ path: `${SHOTS}/mnv-shade-from-bar-390.png` });
    await ctrlClick(page);
    const s2 = await state(page);
    ok(!s2.overlayShown && s2.windows === 2, '390: Ctrl+клик сваля блура, бележките остават', s2);
    ok(errs.length === 0, '390: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

await browser.close();
srv.close();

console.log(fails === 0 ? `ALL OK (${n} проверки)` : `${fails} от ${n} проверки падат`);
process.exit(fails === 0 ? 0 : 1);
