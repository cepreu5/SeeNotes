// Блурът от лентата: дълго натискане или Ctrl+клик върху бутона за затваряне на всички бележки
// вдига и сваля същия затъмнен слой, който режим „единична бележка" слага под най-горната бележка.
//
// Искане на собственика (3.11.2026): „при ctrl-click/long press на бутона за затваряне на всички
// отворени бележки в лентата да се активира/деактивира blur overlay-я, който се използва в режим
// Single Note".
//
// Какво проверява (истински Chromium, истинският uni код, засята IndexedDB, ?demo=1, мобилен
// контекст с докосване):
//   1) обикновено натискане на бутона затваря всички бележки както досега и НЕ вдига блура
//      (жеста не бива да се задейства от обикновен клик);
//   2) дълго натискане вдига блура, бележките остават отворени, лентата остава на екрана;
//   3) Ctrl+клик сваля блура, без да затваря бележки;
//   4) Ctrl+клик пак го вдига - жестът работи в двете посоки от същия бутон;
//   5) състоянието се вижда на бутона (клас is-shade-on);
//   6) щом се затвори и последната бележка (обикновен клик за „затвори всички" или хиксчето), блурът
//      пада сам, а лентата се скрива с него - собственикът, 3.11.2026: „когато се затворят всички
//      бележки блур овърлеят трябва да се затвори автоматично и лентата да се скрие";
//   7) натискане върху блура затваря най-горната бележка, както в режим „единична бележка";
//   8) докато блурът е вдигнат, клик по карта от борда НЕ отваря бележка (собственикът, 3.11.2026:
//      „докато имаме блур овърлей не трябва да може да се отварят бележки ръчно");
//   9) след свалянето картата пак отваря бележка, а след презареждане на празен борд няма нито блур,
//      нито лента - дори когато в localStorage е останал стар запис „вдигнат";
//   10) блурът е ПОД всички отворени бележки, значи всяка от тях се натиска (собственикът, 3.11.2026:
//      „искам да е под всички отворени бележки - т. е. да са достъпни всички отворени, когато има блур");
//   11) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/shade-from-bar.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (за да се провери, че тестът хваща липсващия жест).
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
    const body = Array.from({ length: 12 }, (_, i) => `❖ Ред ${i + 1}: текст за пробата.`).join('\n');
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

const newPage = async (W, H) => {
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        serviceWorkers: 'block'
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
    await page.addInitScript(() => {
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
    });
    await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
    await seedApp(page);
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        && document.querySelectorAll('#notes-container .note:not(.promo-note)').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    return { ctx, page, errs, ready };
};

// Отваря две бележки, за да се появи лентата (показва се при две и повече). Клика се само върху
// карта, която наистина се вижда на екрана и не е закрита от отворен прозорец; ако кликът само
// вдигне вече отворена бележка, се пробва следващата карта - иначе втората не се отваря.
const openTwoNotes = async (page) => {
    for (let round = 0; round < 6; round++) {
        const count = await page.evaluate(() => document.querySelectorAll('.note-window.visible').length);
        if (count >= 2) return count;
        const points = await page.evaluate(() => {
            const boxes = [...document.querySelectorAll('.note-window.visible .modal-content-box')]
                .map(b => b.getBoundingClientRect());
            const out = [];
            for (const card of document.querySelectorAll('#notes-container .note:not(.promo-note)')) {
                const r = card.getBoundingClientRect();
                if (r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
                const x = Math.round(Math.min(r.left + 40, r.right - 12));
                for (const y0 of [r.top + Math.min(r.height / 2, 24), r.top + 12]) {
                    const y = Math.round(y0);
                    if (y < 0 || y > innerHeight) continue;
                    if (boxes.some(w => x > w.left && x < w.right && y > w.top && y < w.bottom)) continue;
                    const el = document.elementFromPoint(x, y);
                    if (!el || !card.contains(el)) continue;
                    out.push({ x, y });
                    break;
                }
            }
            return out;
        });
        if (!points.length) {
            await page.evaluate(() => { const c = document.getElementById('notes-container'); if (c) c.scrollBy(0, 300); });
            await page.waitForTimeout(350);
            continue;
        }
        for (const p of points) {
            await page.mouse.click(p.x, p.y);
            await page.waitForTimeout(900);
            const now = await page.evaluate(() => document.querySelectorAll('.note-window.visible').length);
            if (now >= 2) return now;
        }
        await page.evaluate(() => { const c = document.getElementById('notes-container'); if (c) c.scrollBy(0, 300); });
        await page.waitForTimeout(350);
    }
    return page.evaluate(() => document.querySelectorAll('.note-window.visible').length);
};

const CLOSE_SEL = '#open-notes-bar .open-notes-bar-close';

// Бележките, които наистина се виждат на екрана: скрита бележка пази класа си, но е с нулева височина.
const VISIBLE_WINS = "[...document.querySelectorAll('.note-window.visible')].filter(w => w.getBoundingClientRect().height > 0).length";

// Отваря бележка от борда (за стъпката след презареждане, където е достатъчна една).
const openOneNote = async (page) => {
    for (let round = 0; round < 5; round++) {
        const count = await page.evaluate(VISIBLE_WINS);
        if (count >= 1) return count;
        const spot = await page.evaluate(() => {
            const boxes = [...document.querySelectorAll('.note-window.visible .modal-content-box')]
                .map(b => b.getBoundingClientRect());
            for (const card of document.querySelectorAll('#notes-container .note:not(.promo-note)')) {
                const r = card.getBoundingClientRect();
                if (r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
                const x = Math.round(Math.min(r.left + 40, r.right - 12));
                for (const y0 of [r.top + Math.min(r.height / 2, 24), r.top + 12]) {
                    const y = Math.round(y0);
                    if (y < 0 || y > innerHeight) continue;
                    if (boxes.some(w => x > w.left && x < w.right && y > w.top && y < w.bottom)) continue;
                    const el = document.elementFromPoint(x, y);
                    if (!el || !card.contains(el)) continue;
                    return { x, y };
                }
            }
            return null;
        });
        if (!spot) {
            await page.evaluate(() => { const c = document.getElementById('notes-container'); if (c) c.scrollBy(0, 300); });
            await page.waitForTimeout(350);
            continue;
        }
        await page.mouse.click(spot.x, spot.y);
        await page.waitForTimeout(1000);
    }
    return page.evaluate(VISIBLE_WINS);
};

// Клика по до `want` различни карти от борда и връща колко клика е направил. Ползва се, за да се
// провери, че при вдигнат блур нито един от тях не отваря бележка.
const clickBoardCards = async (page, want) => {
    const points = await page.evaluate((max) => {
        const out = [];
        for (const card of document.querySelectorAll('#notes-container .note:not(.promo-note)')) {
            const r = card.getBoundingClientRect();
            if (r.height === 0 || r.bottom < 0 || r.top > innerHeight) continue;
            const x = Math.round(Math.min(r.left + 40, r.right - 12));
            const y = Math.round(r.top + Math.min(r.height / 2, 24));
            const el = document.elementFromPoint(x, y);
            if (!el || !card.contains(el)) continue;
            out.push({ x, y });
            if (out.length >= max) break;
        }
        return out;
    }, want);
    for (const p of points) {
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(600);
    }
    return points.length;
};

// Бутонът за сваляне на блура трябва да е най-горният елемент в центъра си: ако нещо стои отгоре му
// (напр. иконата на асистента, когато лентата се е появила преди нея), натискането отива там и жестът
// мълчаливо не работи - точно това се случваше при пускане с вдигнат блур и нула отворени бележки.
const closeTopmost = (page) => page.evaluate((SEL) => {
    const btn = document.querySelector(SEL);
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return {
        ok: !!el && (el === btn || btn.contains(el)),
        at: el ? el.tagName + '.' + (typeof el.className === 'string' ? el.className : '') : null
    };
}, CLOSE_SEL);

// Всяка видима бележка трябва да е най-горният елемент в точка от себе си - иначе блурът е над нея и тя
// не се натиска. Връща колко са и кои са закрити.
const windowsReachable = (page) => page.evaluate(() => {
    const wins = [...document.querySelectorAll('.note-window.visible')].filter(w => w.getBoundingClientRect().height > 0);
    const blocked = [];
    for (const w of wins) {
        const r = w.getBoundingClientRect();
        // Бележките се застъпват, значи точка от една може да е закрита от друга - това е нормално.
        // Пробата е „стига ли някоя точка от прозореца до прозорец, а не до слоя“: ако навсякъде има
        // само блурът (или страницата), значи бележката е под него и не се натиска.
        const ys = [r.top + 28, r.top + r.height / 2, r.bottom - 40];
        const xs = [r.left + 30, r.left + r.width / 2, r.right - 30];
        let hitWin = false;
        let firstAt = null;
        for (const y of ys) {
            for (const x of xs) {
                if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) continue;
                const el = document.elementFromPoint(Math.round(x), Math.round(y));
                if (!firstAt) firstAt = el ? el.tagName + '.' + (typeof el.className === 'string' ? el.className : '') : null;
                if (el && el.closest('.note-window')) { hitWin = true; break; }
            }
            if (hitWin) break;
        }
        if (!hitWin) blocked.push({ at: firstAt });
    }
    return { total: wins.length, blocked };
});

// Слоят трябва да е с z-index, който не е над нито една видима бележка.
const overlayBelowAllWindows = (page) => page.evaluate(() => {
    const o = document.getElementById('single-note-overlay');
    if (!o) return { ok: false, why: 'няма слой' };
    const oz = Number(getComputedStyle(o).zIndex) || 0;
    const wins = [...document.querySelectorAll('.note-window.visible')]
        .filter(w => w.getBoundingClientRect().height > 0)
        .map(w => Number(getComputedStyle(w).zIndex) || 0);
    return { ok: wins.length > 0 && wins.every(z => z >= oz), oz, wins };
});

// Състоянието, което ни интересува: вдигнат ли е блурът, има ли лента, има ли клас на бутона.
const state = (page) => page.evaluate((VIS) => {
    const o = document.getElementById('single-note-overlay');
    const cs = o ? getComputedStyle(o) : null;
    const bar = document.getElementById('open-notes-bar');
    const btn = document.querySelector('#open-notes-bar .open-notes-bar-close');
    const bcs = btn ? getComputedStyle(btn) : null;
    return {
        overlayExists: !!o,
        overlayShown: !!o && o.classList.contains('visible') && cs.display !== 'none' && o.getBoundingClientRect().height > 0,
        blur: cs ? (cs.backdropFilter || cs.webkitBackdropFilter || '') : '',
        stored: localStorage.getItem('noteShadeOn'),
        mode: localStorage.getItem('singleNoteMode'),
        barShown: !!bar && getComputedStyle(bar).display !== 'none' && bar.getBoundingClientRect().height > 0,
        btnShade: btn ? btn.classList.contains('is-shade-on') : null,
        btnShadow: bcs ? bcs.boxShadow : '',
        windows: eval(VIS)
    };
}, VISIBLE_WINS);

const closeCenter = async (page) => {
    const box = await page.locator(CLOSE_SEL).boundingBox();
    if (!box) return null;
    return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
};

// Дълго натискане: истински показалец надолу, изчакване над прага, нагоре. Браузърът праща и click -
// точно това не бива да затвори бележките.
const longPress = async (page) => {
    const c = await closeCenter(page);
    if (!c) return false;
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.waitForTimeout(750);
    await page.mouse.up();
    await page.waitForTimeout(350);
    return true;
};

const ctrlClick = async (page) => {
    await page.locator(CLOSE_SEL).click({ modifiers: ['Control'] });
    await page.waitForTimeout(350);
};

// ── 1. Жестът: обикновен клик, дълго натискане, блурът като изход, Ctrl+клик, презареждане ───────
{
    const { ctx, page, errs, ready } = await newPage(390, 844);
    ok(ready, 'приложението е готово');
    const opened = await openTwoNotes(page);
    ok(opened >= 2, 'отворени са две бележки', opened);
    const s0 = await state(page);
    ok(s0.barShown, 'лентата се вижда при две бележки', s0);
    ok(!s0.overlayShown, 'преди жеста блур няма', s0);

    // 1) Обикновено натискане: затваря всички, блур не се вдига.
    await page.locator(CLOSE_SEL).click();
    await page.waitForTimeout(700);
    const s1 = await state(page);
    ok(s1.windows === 0, 'обикновен клик затваря всички бележки', s1);
    ok(!s1.overlayShown && s1.stored !== 'true', 'обикновен клик НЕ вдига блура', s1);

    // 2) Дълго натискане върху бутона на лентата: блурът се вдига, бележките остават.
    const again = await openTwoNotes(page);
    ok(again >= 2, 'пак две бележки', again);
    const beforePress = await state(page);
    ok(await longPress(page), 'има бутон за затваряне в лентата');
    const s2 = await state(page);
    ok(s2.windows === beforePress.windows, 'дълго натискане НЕ затваря бележките', { before: beforePress.windows, after: s2.windows });
    ok(s2.overlayShown, 'дълго натискане вдига блура', s2);
    ok(/blur/.test(s2.blur) && !/blur\(0px\)/.test(s2.blur), 'слоят е наистина замъглен (backdrop blur)', s2.blur);
    ok(s2.barShown, 'лентата остава на екрана, за да се свали блурът от нея', s2);
    ok(s2.btnShade === true, 'бутонът показва, че блурът е вдигнат', s2.btnShadow);
    // 2б) Блурът е ПОД всички отворени бележки (собственикът, 3.11.2026: „искам да е под всички
    // отворени бележки - т. е. да са достъпни всички отворени, когато има блур"). Досега слоят беше
    // само под най-горната, значи останалите бяха зад него и не се натискаха.
    const reach = await windowsReachable(page);
    ok(reach.total >= 2, 'има две отворени бележки за проверка на достъпността', reach);
    ok(reach.blocked.length === 0, 'при вдигнат блур всяка отворена бележка се натиска (не е под слоя)', reach);
    const zord = await overlayBelowAllWindows(page);
    ok(zord.ok, 'слоят е с z-index под най-долната отворена бележка', zord);
    await page.screenshot({ path: '.bolter/check/shade-from-bar-390.png' });

    // 3) Натискане върху блура: затваря най-горната бележка, както в режим „единична бележка".
    const spot = await page.evaluate(() => {
        const o = document.getElementById('single-note-overlay');
        if (!o) return null;
        const r = o.getBoundingClientRect();
        for (const y of [Math.round(r.top + 8), Math.round(r.top + r.height / 2), Math.round(r.bottom - 30)]) {
            for (const x of [Math.round(r.left + 6), Math.round(r.right - 6), Math.round(r.left + r.width / 2)]) {
                if (document.elementFromPoint(x, y) === o) return { x, y };
            }
        }
        return null;
    });
    ok(!!spot, 'блурът се вижда някъде извън бележката', spot);
    if (spot) {
        await page.mouse.click(spot.x, spot.y);
        await page.waitForTimeout(800);
        const s3 = await state(page);
        ok(s3.windows === beforePress.windows - 1, 'натискане върху блура затваря най-горната бележка', { before: beforePress.windows, after: s3.windows });
        ok(s3.barShown, 'с една бележка лентата остава, защото блурът се сваля само от нея', s3);
    }

    // 4) Ctrl+клик сваля блура дори при една бележка и не затваря нищо.
    const beforeOff = await state(page);
    await ctrlClick(page);
    const s5 = await state(page);
    ok(!s5.overlayShown && s5.stored === 'false', 'Ctrl+клик сваля блура', s5);
    ok(s5.windows === beforeOff.windows && s5.windows >= 1, 'Ctrl+клик НЕ затваря бележката', { before: beforeOff.windows, after: s5.windows });
    ok(s5.btnShade === false, 'бутонът вече не показва блур', s5.btnShadow);
    ok(!s5.barShown, 'след свалянето при една бележка лентата пак се крие', s5);

    // 5) Пак две бележки и Ctrl+клик го вдига; лентата остава.
    const again3 = await openTwoNotes(page);
    ok(again3 >= 2, 'пак две бележки за Ctrl+клик', again3);
    await ctrlClick(page);
    const s6 = await state(page);
    ok(s6.overlayShown && s6.stored === 'true' && s6.windows >= 2, 'Ctrl+клик вдига блура', s6);
    ok(s6.barShown && s6.btnShade === true, 'при вдигнат блур лентата и белегът на бутона са налице', s6);

    // 6) Новото правило (собственикът, 3.11.2026): щом се затвори и последната бележка, блурът се сваля
    // сам, а лентата се скрива с него. Затваряме всички с ОБИКНОВЕН клик върху бутона в лентата - жестът
    // не се задейства, значи свалянето идва от затварянето на бележките, а не от него.
    await page.locator(CLOSE_SEL).click();
    await page.waitForTimeout(700);
    const s7 = await state(page);
    ok(s7.windows === 0, 'обикновен клик затваря и последната бележка', s7);
    ok(!s7.overlayShown && s7.stored === 'false', 'щом няма отворени бележки блурът пада сам', s7);
    ok(!s7.barShown, 'и лентата се скрива заедно с блура', s7);

    // 6б) Докато блурът е вдигнат, карта от борда не отваря бележка (собственикът, 3.11.2026). Истински
    // показалец по карта при вдигнат блур се хваща от слоя, не от картата - затова тук се проверява
    // самата защита в handleNoteClick: програмно натискане по картите (то не минава през слоя) не бива
    // да отвори нищо.
    const again4 = await openTwoNotes(page);
    ok(again4 >= 2, 'пак две бележки за проверката с карта', again4);
    await ctrlClick(page);
    const s8a = await state(page);
    ok(s8a.overlayShown && s8a.windows >= 2, 'блурът е вдигнат при две отворени бележки', s8a);
    const beforeCard = s8a.windows;
    const cardPress = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('#notes-container .note:not(.promo-note)')];
        cards.slice(0, 3).forEach(c => c.click());
        return { cards: cards.length, clicked: Math.min(3, cards.length) };
    });
    await page.waitForTimeout(700);
    const s8 = await state(page);
    ok(cardPress.clicked > 0, 'има по коя карта да се натисне', cardPress);
    ok(s8.windows === beforeCard, 'при вдигнат блур натискане по карта НЕ отваря бележка', { before: beforeCard, after: s8.windows });

    // 7) Затваряне с хиксчето: предпоследната бележка още държи блура (лентата е единственото място,
    // откъдето се сваля), а последната го сваля и скрива лентата.
    const clickX = () => page.evaluate(() => {
        const win = [...document.querySelectorAll('.note-window.visible')].find(w => w.getBoundingClientRect().height > 0);
        const btn = win && win.querySelector('.modal-close');
        if (!btn) return false;
        btn.click();
        return true;
    });
    const x1 = await clickX();
    await page.waitForTimeout(700);
    const s8b = await state(page);
    ok(x1 && s8b.windows === beforeCard - 1, 'хиксчето затваря една бележка', { x1, before: beforeCard, after: s8b.windows });
    ok(s8b.overlayShown && s8b.stored === 'true' && s8b.barShown, 'с една останала бележка блурът и лентата са още там', s8b);
    const x2 = await clickX();
    await page.waitForTimeout(700);
    const s9 = await state(page);
    ok(x2, 'има хиксче и на последната бележка', x2);
    ok(s9.windows === 0 && !s9.overlayShown && s9.stored === 'false' && !s9.barShown,
        'хиксчето на последната бележка сваля блура и скрива лентата', s9);

    // 8) След свалянето картата пак отваря бележка - блурът не остава да пречи.
    const afterOpen = await openOneNote(page);
    ok(afterOpen >= 1, 'след свалянето на блура карта пак отваря бележка', afterOpen);

    // 9) Презареждане: няма отворени бележки, значи няма нито блур, нито лента - и старият запис в
    // localStorage не вдига блур над празен борд.
    await page.evaluate(() => localStorage.setItem('noteShadeOn', 'true'));
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 30000 }).catch(() => { });
    await page.waitForTimeout(700);
    const s10 = await state(page);
    ok(s10.windows === 0, 'след презареждане няма отворени бележки', s10);
    ok(s10.stored === 'false' && !s10.overlayShown, 'след презареждане блурът не се вдига над празен борд', s10);
    ok(!s10.barShown, 'след презареждане лентата също не е на екрана', s10);

    ok(errs.length === 0, 'няма изключения в конзолата', errs);
    await ctx.close();
}

// ── 2. Същото на широк екран ────────────────────────────────────────────────────────────────────
{
    const { ctx, page, errs, ready } = await newPage(1280, 900);
    ok(ready, '1280: приложението е готово');
    const opened = await openTwoNotes(page);
    ok(opened >= 2, '1280: две бележки', opened);
    await longPress(page);
    const s = await state(page);
    ok(s.overlayShown && s.windows >= 2 && s.barShown, '1280: дълго натискане вдига блура, бележките и лентата остават', s);
    await page.screenshot({ path: '.bolter/check/shade-from-bar-1280.png' });
    await ctrlClick(page);
    const s2 = await state(page);
    ok(!s2.overlayShown && s2.windows >= 2, '1280: Ctrl+клик сваля блура', s2);
    ok(errs.length === 0, '1280: няма изключения в конзолата', errs);
    await ctx.close();
}

await browser.close();
srv.close();

console.log(fails === 0 ? `ALL OK (${n} проверки)` : `${fails} от ${n} проверки падат`);
process.exit(fails === 0 ? 0 : 1);
