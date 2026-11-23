// nomn b5.39: заглавният ред на бележка без графичен фон в борда.
//
// Собственик (23.11.2026, по снимка): „За бележка без графичен фон в борда като тази на
// снимката: вдигни хедъра 5px нагоре, подравни иконата на календара пред датата с лявата
// граница на текста, подравни пин бутона с дясната граница на текста."
//
// Мери в истински Chromium върху карта 250px и 480px:
//   - реда е на 21px от горния ръб (26px преди b5.39),
//   - лявата граница на иконата на календара съвпада с лявата граница на заглавието и на
//     текста,
//   - дясната граница на ПИН бутона съвпада с дясната граница на текста,
//   - редът не се пренася на два реда и ПИН бутонът не застъпва часа,
//   - .note-item (графичен фон) не е пипнат: padding 0, икона 20px, ПИН 30px, ред 25px.
//
// Пускане от корена на хранилището: node .bolter/check/nomn-header-align-b539.mjs
// ROOT=… сочи друга папка на приложението.
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

const root = path.resolve(process.env.ROOT || 'nomn');
const W = 412, H = 915;
const TYPES = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/__seed.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><meta charset="utf-8"><title>seed</title>');
        return;
    }
    const rel = p === '/' ? 'index.html' : p;
    try {
        const b = await readFile(path.join(root, rel));
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(b);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const ORIGIN = `http://localhost:${srv.address().port}`;

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

async function openBoard(graphic) {
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, isMobile: true, hasTouch: true,
        deviceScaleFactor: 2, serviceWorkers: 'block', timezoneId: 'Europe/Sofia'
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 200)));
    page.on('console', m => { if (m.type() === 'error' && !/404|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 200)); });
    await page.addInitScript((on) => {
        const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
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
        localStorage.setItem('hideAssistant', 'true');
        localStorage.setItem('guide', 'false');
        localStorage.setItem('notesBgrd', on ? 'true' : 'false');
        localStorage.setItem('imgBgrd', on ? 'true' : 'false');
        localStorage.setItem('dateFormat', 'dd.MM.yyyy');
    }, graphic);

    await page.goto(`${ORIGIN}/__seed.html`, { waitUntil: 'load' });
    await page.evaluate(async () => {
        const DB_NAME = 'NotesDB-demo';
        const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null, files: { keyPath: 'key' } };
        await new Promise((res) => { const d = indexedDB.deleteDatabase(DB_NAME); d.onsuccess = d.onerror = d.onblocked = () => res(); setTimeout(res, 3000); });
        const db = await new Promise((res, rej) => {
            const req = indexedDB.open(DB_NAME, 4);
            req.onupgradeneeded = () => { const d = req.result; for (const [name, opt] of Object.entries(STORES)) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, opt || undefined); };
            req.onsuccess = () => res(req.result);
            req.onerror = () => rej(req.error);
        });
        const now = new Date(2025, 9, 15, 22, 14, 0).getTime();
        const txt = ['Мляко 1', 'Хляб 2', 'Краставици 3', 'Домати 4', 'Ябълки 5'].join('\n');
        await new Promise((res, rej) => {
            const tx = db.transaction(['boards', 'notes', 'media', 'config'], 'readwrite');
            tx.oncomplete = res; tx.onerror = () => rej(tx.error);
            for (const s of ['boards', 'notes', 'media', 'config']) tx.objectStore(s).clear();
            tx.objectStore('boards').put({ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b1', id: 1, numord: 1, status: 0, title: 'Board 1' });
            const base = { alarm_type: -1, calendarDate: now, color: 4, datemod: now, eventId: 0, numord: 0, pass: false, sellist: 1, text_span: '', timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 263, boardid: 'b1', date: now, status: 0, timer: now, pinnedAt: now, title: 'Списък за пазаруване', notetxt: txt };
            tx.objectStore('notes').put({ ...base, gdid: 'NotePlain', id: 1002, pinnedAt: null });
            tx.objectStore('config').put(1, 'dbSource');
            tx.objectStore('config').put('gdid', 'dbNoteIdType');
            tx.objectStore('config').put(now, 'dbCreatedTimestamp');
            tx.objectStore('config').put(now, 'lastLocalTimestamp');
        });
        db.close();
        return true;
    });

    await page.goto(`${ORIGIN}/index.html?demo=1`, { waitUntil: 'load' });
    await page.waitForFunction(
        () => document.body.classList.contains('app-ready') && document.querySelectorAll('#notes-container .note').length >= 1,
        null, { timeout: 30000 }
    ).catch(() => { });
    await page.waitForTimeout(1200);
    return { ctx, page, errs };
}

const measure = (page) => page.evaluate(() => {
    const note = document.querySelector('#notes-container .note');
    if (!note) return null;
    const nb = note.getBoundingClientRect();
    const rel = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { l: +(r.left - nb.left).toFixed(1), r: +(nb.right - r.right).toFixed(1), t: +(r.top - nb.top).toFixed(1), b: +(nb.bottom - r.bottom).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    };
    const q = (s) => note.querySelector(s);
    const cs = getComputedStyle(note);
    return {
        cls: note.className,
        padding: cs.padding, border: cs.borderWidth,
        card: { w: +nb.width.toFixed(1), h: +nb.height.toFixed(1) },
        titleWrapper: rel(q('.note-title-wrapper')),
        title: rel(q('.note-title-truncated') || q('.note-title')),
        content: rel(q('.note-content')),
        headerInfo: rel(q('.note-header-info')),
        dateWrap: rel(q('.note-header-date')),
        calIcon: rel(q('.note-header-calendar-icon')),
        clockIcon: rel(q('.note-header-clock-icon')),
        pin: rel(q('.note-pin-btn')),
        headerHTML: (q('.note-header-info') || {}).outerHTML?.replace(/\s+/g, ' ').slice(0, 400)
    };
});

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

// --- 1) графичен фон ИЗКЛЮЧЕН: ред на 20px, икона по левия ръб на текста, ПИН по десния ----
{
    const { ctx, page, errs } = await openBoard(false);
    const m = await measure(page);
    ok(!!m, '1.1 картата е намерена', m);
    if (m) {
        const textL = m.content.l, textR = m.content.r;
        ok(m.headerInfo.t === 21, '1.2 заглавният ред е на 21px от горния ръб (5px по-горе от 26px)', m.headerInfo.t);
        ok(Math.abs(m.calIcon.l - textL) <= 0.6, '1.3 иконата на календара е подравнена с лявата граница на текста', { icon: m.calIcon.l, text: textL });
        ok(Math.abs(m.calIcon.l - m.title.l) <= 0.6, '1.4 иконата е подравнена и със заглавието', { icon: m.calIcon.l, title: m.title.l });
        ok(Math.abs(m.pin.r - textR) <= 0.6, '1.5 ПИН бутонът е подравнен с дясната граница на текста', { pin: m.pin.r, text: textR });
        ok(m.headerInfo.h <= 23, '1.6 редът е на един ред', m.headerInfo.h);
        // b5.40 (23.11.2026) сви празнината от 18px на 3px — същото разстояние като при графичен
        // фон, по указание на собственика. Тук се пази само условието редът да не застъпва заглавието.
        ok(m.headerInfo.b - m.title.t >= 2.5, '1.7 между реда и заглавието остават 3px (b5.40), без застъпване', { headerBottomToTitle: +(m.headerInfo.b - m.title.t).toFixed(1) });
        ok(m.pin.l >= m.clockIcon.l + m.clockIcon.w, '1.8 ПИН бутонът не застъпва часовника', { pinLeft: m.pin.l, clockRight: +(m.clockIcon.l + m.clockIcon.w).toFixed(1) });
    }
    ok(errs.length === 0, '1.9 няма грешки в страницата', errs.slice(0, 3));

    // същата карта, но широка 480px — подравняването не зависи от ширината
    await page.evaluate(() => { const el = document.querySelector('#notes-container .note'); if (el) { el.style.width = '480px'; el.style.height = '300px'; } });
    await page.waitForTimeout(300);
    const w = await measure(page);
    ok(!!w && Math.abs(w.calIcon.l - w.content.l) <= 0.6 && Math.abs(w.pin.r - w.content.r) <= 0.6,
        '1.10 на 480px иконата и ПИН бутонът пак са по ръбовете на текста',
        w ? { icon: w.calIcon.l, textL: w.content.l, pin: w.pin.r, textR: w.content.r } : null);
    await ctx.close();
}

// --- 2) графичен фон ВКЛЮЧЕН: .note-item не е пипнат ------------------------------------
{
    const { ctx, page, errs } = await openBoard(true);
    const m = await measure(page);
    ok(!!m && m.cls.includes('note-item'), '2.1 картата е в режим графичен фон', m && m.cls);
    if (m) {
        ok(m.padding === '0px', '2.2 padding на .note-item остава 0', m.padding);
        ok(m.headerInfo.t === 25 && m.calIcon.t === 27.7, '2.3 редът е на 25px както преди b5.39', { top: m.headerInfo.t, iconTop: m.calIcon.t });
        ok(m.calIcon.l === 20 && m.pin.r === 30, '2.4 иконата на 20px и ПИН на 30px както преди', { icon: m.calIcon.l, pin: m.pin.r });
    }
    ok(errs.length === 0, '2.5 няма грешки в страницата', errs.slice(0, 3));
    await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
process.exit(fails ? 1 : 0);
