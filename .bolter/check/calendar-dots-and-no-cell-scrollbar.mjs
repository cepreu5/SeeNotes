// Точките в календара на защитния екран + без скролбар в клетката с дата (истинския месечен календар).
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1):
//   1) защитният екран се вдига и долната плочка показва месечния календар с точки за дните с бележки;
//   2) точките са 24% от ширината на деня (бяха 28% — „една идея по-малки“), кръгли, две на ред,
//      побират се в слота си;
//   3) слотът на точките остава 28% от ширината на деня — числта не мърдат спрямо преди;
//   4) днешният ден е отбелязан;
//   5) истинският месечен календар показва 30/31 клетки и бележките в клетката преливат (има какво да се скролира);
//   6) в клетката с дата НЯМА скролбар: scrollbar-width: none и никакво правило за ::-webkit-scrollbar
//      с ширина/фон на плъзгача (преди беше 5px сива лента);
//   7) съдържанието в клетката пак се скролира (scrollTop стига до дъното) — махната е лентата, не скролът;
//   8) клетките не са се разширили и страницата няма хоризонтален скрол;
//   9) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/calendar-dots-and-no-cell-scrollbar.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (за контрола върху стария код).
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
const DOT_SHARE = 24;   // новият размер на точката, % от ширината на деня
const SLOT_SHARE = 28;  // слотът на точките остава същият, за да не мърдат числата

if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
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
    const boards = [];
    for (let i = 1; i <= 6; i++) {
        boards.push({ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b' + i, id: i, numord: i, status: 0, title: 'Board ' + i });
    }
    const start = new Date(now);
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);
    const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
    const notes = [];
    let k = 0;
    for (let day = 1; day <= daysInMonth; day++) {
        // Три бележки на ден: точките се виждат, а контейнерът в клетката прелива и има какво да се скролира.
        for (let j = 0; j < 3; j++) {
            k++;
            const d = new Date(monthStart.getFullYear(), monthStart.getMonth(), day, 12, 0, 0);
            notes.push({
                alarm_type: -1, boardid: boards[j % boards.length].gdid, calendarDate: d.getTime(), color: j % 10,
                date: now - k * 1000, datemod: now - k * 1000, eventId: 0,
                gdid: `Note${String(k).padStart(18, '0')}`, id: 1000 + k,
                notetxt: `Бележка ${k}|Тяло ${k}`, numord: k, pass: false, sellist: 0, status: 0,
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
    return { boards: boards.length, notes: notes.length, daysInMonth };
});

const newPage = async (W, H, mobile) => {
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 3 : 1,
        userAgent: mobile
            ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
            : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
        serviceWorkers: 'block'
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
    await page.addInitScript(() => {
        const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
        window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
        window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
        window.kofiWidgetOverlay = { draw() { } };
        window.kofiwidget2 = { init() { }, draw() { } };
        localStorage.setItem('useIndexedDb', 'true');
        localStorage.setItem('useGoogleDb', 'false');
        localStorage.setItem('useLocalDb', 'false');
    });
    return { page, errs, ctx };
};

const run = async (W, H, mobile, tag) => {
    const { page, errs, ctx } = await newPage(W, H, mobile);
    await page.goto(`${ORIGIN}/index.html?demo=1`, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const seeded = await seedApp(page);
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2200);

    // --- 1) защитен екран и точките в календара ---
    await page.evaluate(() => { if (window.privacyOverlayShow) window.privacyOverlayShow(); });
    await page.waitForTimeout(700);
    const d = await page.evaluate(() => {
        const day = document.querySelector('.privacy-cal-day');
        const wrap = document.querySelector('.privacy-cal-dots');
        const dots = wrap ? [...wrap.querySelectorAll('i')] : [];
        const num = document.querySelector('.privacy-cal-num');
        if (!day || !wrap || !dots.length || !num) return { missing: true };
        const r = el => { const b = el.getBoundingClientRect(); return { w: +b.width.toFixed(2), h: +b.height.toFixed(2) }; };
        const dd = r(day), ww = r(wrap), dot = r(dots[0]);
        const cs = getComputedStyle(dots[0]);
        const today = document.querySelector('.privacy-cal-day.is-today');
        return {
            day: dd, slot: ww, dot,
            dotShare: +(dot.w / dd.w * 100).toFixed(2),
            slotShare: +(ww.h / dd.w * 100).toFixed(2),
            slotNeeds: +(dots.length * dot.w + (dots.length - 1) * 1).toFixed(2),
            round: cs.borderRadius === '50%' && Math.abs(dot.w - dot.h) < 0.2,
            bg: cs.backgroundColor,
            dotsPerDay: dots.length,
            baseDots: document.querySelectorAll('.privacy-cal-dots i').length,
            todayMarked: !!today,
            todayBg: today ? getComputedStyle(today.querySelector('.privacy-cal-num')).backgroundColor : null,
            overlay: !!document.querySelector('.privacy-overlay')
        };
    });
    await page.screenshot({ path: `.bolter/check/calendar-dots-and-no-cell-scrollbar-privacy-${tag}.png` });

    ok(!d.missing, `${tag}: 1: защитният екран показва календар с точки`, d);
    ok(d.overlay, `${tag}: 1: overlay-ът е на екрана`);
    ok(d.baseDots >= seeded.daysInMonth * 2, `${tag}: 1: точки има за всички ${seeded.daysInMonth} дни (${d.baseDots})`);
    ok(Math.abs(d.dotShare - DOT_SHARE) <= 0.6, `${tag}: 2: точката е ${DOT_SHARE}% от ширината на деня`, { dotShare: d.dotShare, dot: d.dot });
    ok(d.dotShare < 28, `${tag}: 2: точката е по-малка от старите 28%`, { dotShare: d.dotShare });
    ok(d.round, `${tag}: 2: точката е кръг`, { dot: d.dot });
    ok(d.dot.w < d.slot.w - 0.5, `${tag}: 2: точките се побират в слота`, { dot: d.dot.w, twoDots: d.slotNeeds, slot: d.slot.w });
    ok(Math.abs(d.slotShare - SLOT_SHARE) <= 0.6, `${tag}: 3: слотът на точките е ${SLOT_SHARE}% — числата не мърдат`, { slotShare: d.slotShare, slot: d.slot });
    ok(d.todayMarked && d.todayBg && d.todayBg !== 'rgba(0, 0, 0, 0)', `${tag}: 4: днешният ден е отбелязан`, { todayBg: d.todayBg });

    await page.evaluate(() => { if (window.privacyOverlayHide) window.privacyOverlayHide(); });
    await page.waitForTimeout(400);

    // --- 2) истински месечен календар: без скролбар в клетката ---
    await page.evaluate(() => { window.filterNotesByBoard('calendar_monthly'); });
    await page.waitForTimeout(1600);
    const c = await page.evaluate(() => {
        const boxes = [...document.querySelectorAll('#calendar-container .calendar-notes-container')];
        const cells = [...document.querySelectorAll('#calendar-container .calendar-cell')];
        const over = boxes.filter(b => b.scrollHeight - b.clientHeight > 1);
        const sample = over[0] || boxes[0];
        // Правилата за лентата: търсим в CSSOM всичко, което пипа ::-webkit-scrollbar на контейнера.
        const barRules = [];
        for (const sheet of document.styleSheets) {
            let rules;
            try { rules = sheet.cssRules; } catch { continue; }
            const walk = (list) => {
                for (const rule of list) {
                    if (rule.cssRules && !rule.selectorText) { walk(rule.cssRules); continue; }
                    if (!rule.selectorText || !rule.selectorText.includes('calendar-notes-container')) continue;
                    if (!rule.selectorText.includes('-webkit-scrollbar')) continue;
                    barRules.push({ sel: rule.selectorText, css: rule.style.cssText });
                }
            };
            walk(rules);
        }
        let scrolled = null;
        if (sample) {
            const before = sample.scrollTop;
            sample.scrollTop = 9999;
            scrolled = { before, after: sample.scrollTop, max: sample.scrollHeight - sample.clientHeight };
            sample.scrollTop = before;
        }
        const cs = sample ? getComputedStyle(sample) : null;
        const cellRect = cells[0] ? cells[0].getBoundingClientRect() : null;
        return {
            cells: cells.length, boxes: boxes.length, overflowing: over.length,
            scrollbarWidth: cs ? cs.scrollbarWidth : null,
            overflowY: cs ? cs.overflowY : null,
            barRules,
            manualBar: cs ? (cs.scrollbarWidth !== 'none') : null,
            scrolled,
            cellSize: cellRect ? { w: +cellRect.width.toFixed(1), h: +cellRect.height.toFixed(1) } : null,
            miniNotesInCell: cells[0] ? cells[0].querySelectorAll('.calendar-mini-note').length : 0,
            docScrollW: document.documentElement.scrollWidth,
            winW: window.innerWidth
        };
    });
    await page.screenshot({ path: `.bolter/check/calendar-dots-and-no-cell-scrollbar-calendar-${tag}.png` });

    ok(c.cells === seeded.daysInMonth, `${tag}: 5: месецът показва ${seeded.daysInMonth} клетки`, { cells: c.cells });
    ok(c.overflowing === c.boxes && c.boxes > 0, `${tag}: 5: бележките в клетките преливат (има какво да се скролира)`, { overflowing: c.overflowing, boxes: c.boxes });
    ok(c.overflowY === 'auto', `${tag}: 7: контейнерът в клетката си остава скролиращ`, { overflowY: c.overflowY });
    ok(c.scrollbarWidth === 'none', `${tag}: 6: scrollbar-width е none в клетката с дата`, { scrollbarWidth: c.scrollbarWidth });
    ok(c.barRules.every(r => /(^|;)\s*(width|height):\s*0px/.test(r.css) || /display:\s*none/.test(r.css)), `${tag}: 6: няма видима ::-webkit-scrollbar лента (5px сива)`, { barRules: c.barRules });
    ok(!c.barRules.some(r => /background/.test(r.css) && !/display:\s*none/.test(r.css)), `${tag}: 6: няма оцветен плъзгач`, { barRules: c.barRules });
    ok(!!c.scrolled && c.scrolled.max > 0 && c.scrolled.after > 0, `${tag}: 7: съдържанието в клетката се скролира до дъното`, c.scrolled);
    ok(c.miniNotesInCell === 3, `${tag}: 5: бележките са в клетката (3)`, { miniNotesInCell: c.miniNotesInCell });
    ok(c.docScrollW <= c.winW + 1, `${tag}: 8: няма хоризонтален скрол на страницата`, { docScrollW: c.docScrollW, winW: c.winW });
    ok(errs.length === 0, `${tag}: 9: няма изключения в конзолата`, errs.slice(0, 4));

    console.log(`${tag}: клетка ${JSON.stringify(c.cellSize)}, точки ${d.dotShare}% в слот ${d.slotShare}%, правило за лента: ${JSON.stringify(c.barRules)}`);
    await ctx.close();
};

await run(390, 844, true, '390');
await run(1280, 900, false, '1280');

await browser.close();
srv.close();
console.log(fails ? `FAILED (${fails} от ${n})` : `OK (${n} проверки)`);
process.exit(fails ? 1 : 0);
