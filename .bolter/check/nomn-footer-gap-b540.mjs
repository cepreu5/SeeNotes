// nomn b5.40: място за футъра само при приложения + по-малко разстояние ред → заглавие.
//
// Собственик (23.11.2026): „При изключен графичен фон винаги се слага футър, независимо дали има
// приложения и разстоянието между хедъра и за главния ред е излишно голямо."
//
// Мери в истински Chromium върху борд с две бележки без графичен фон: една с прикачен файл
// (media запис, type 3) и една без:
//   - без приложения: padding-bottom 5px (преди b5.40 беше 35px), няма .note-footer, текстът
//     стига до 6px от дъното на картата,
//   - с приложения: padding-bottom 35px, .note-footer стои и не застъпва текста,
//   - ред → заглавие: 3px и в двете карти (ред 21px, заглавие 46px от ръба) — същото
//     разстояние като при графичен фон, където редът е на 25px и заглавието на 50px,
//   - графичен фон (.note-item) не е пипнат: padding 0, ред 25px, заглавие 50px.
//
// Пускане от корена на хранилището: node .bolter/check/nomn-footer-gap-b540.mjs
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
        const txt = ['Бележка с текст за мерене', 'Ред 1', 'Ред 2', 'Ред 3', 'Ред 4', 'Ред 5'].join('\n');
        await new Promise((res, rej) => {
            const tx = db.transaction(['boards', 'notes', 'media', 'config'], 'readwrite');
            tx.oncomplete = res; tx.onerror = () => rej(tx.error);
            for (const s of ['boards', 'notes', 'media', 'config']) tx.objectStore(s).clear();
            tx.objectStore('boards').put({ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b1', id: 1, numord: 1, status: 0, title: 'Board 1' });
            const base = { alarm_type: -1, calendarDate: now, color: 4, datemod: now, eventId: 0, numord: 0, pass: false, sellist: 1, text_span: '', timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 263, boardid: 'b1', date: now, status: 0, timer: now, pinnedAt: now, title: 'Списък', notetxt: txt };
            tx.objectStore('notes').put({ ...base, gdid: 'NoteAtt', id: 1001 });
            tx.objectStore('notes').put({ ...base, gdid: 'NotePlain', id: 1002 });
            tx.objectStore('media').put({ datemod: now, description: '', gdid: 'media-1', id: 1, noteid: 'NoteAtt', path: 'скан.pdf', pathGD: 'L-media-1', type: 3 });
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
        () => document.body.classList.contains('app-ready') && document.querySelectorAll('#notes-container .note').length >= 2,
        null, { timeout: 30000 }
    ).catch(() => { });
    await page.waitForTimeout(1200);
    return { ctx, page, errs };
}

// gdid → измерване на картата (разстояния спрямо ръба на картата)
const measure = (page) => page.evaluate(() => {
    const out = {};
    for (const note of document.querySelectorAll('#notes-container .note')) {
        const g = note.dataset.g || '';
        const key = g === 'NoteAtt' ? 'withAttachments' : (g === 'NotePlain' ? 'plain' : null);
        if (!key) continue;
        const nb = note.getBoundingClientRect();
        const cs = getComputedStyle(note);
        const rel = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { l: +(r.left - nb.left).toFixed(1), r: +(nb.right - r.right).toFixed(1), t: +(r.top - nb.top).toFixed(1), b: +(nb.bottom - r.bottom).toFixed(1), h: +r.height.toFixed(1) }; };
        const head = note.querySelector('.note-header-info');
        const title = note.querySelector('.note-title-truncated') || note.querySelector('.note-title');
        const footer = note.querySelector('.note-footer');
        const hb = head ? head.getBoundingClientRect() : null;
        const tb = title ? title.getBoundingClientRect() : null;
        out[key] = {
            cls: note.className,
            padding: cs.padding,
            paddingBottom: cs.paddingBottom,
            hasFooter: !!footer,
            footer: rel(footer),
            header: rel(head),
            title: rel(title),
            content: rel(note.querySelector('.note-content')),
            gapHeaderTitle: hb && tb ? +(tb.top - hb.bottom).toFixed(1) : null
        };
    }
    return out;
});

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

// --- 1) графичен фон ИЗКЛЮЧЕН: място за футъра само при приложения ----------------------
{
    const { ctx, page, errs } = await openBoard(false);
    const m = await measure(page);
    ok(!!m.plain && !!m.withAttachments, '1.1 двете карти са намерени', Object.keys(m));
    if (m.plain && m.withAttachments) {
        ok(!m.plain.cls.includes('note-item'), '1.2 картата е в режим изключен графичен фон', m.plain.cls);
        ok(m.plain.hasFooter === false, '1.3 бележка без приложения няма футър', m.plain.hasFooter);
        ok(m.plain.paddingBottom === '5px', '1.4 без футър долният отстъп е 5px, а не 35px', m.plain.paddingBottom);
        ok(m.plain.content.b <= 7, '1.5 текстът стига до дъното на картата (6px от ръба)', m.plain.content.b);
        ok(m.withAttachments.hasFooter === true, '1.6 бележка с приложение има футър', m.withAttachments.hasFooter);
        ok(m.withAttachments.paddingBottom === '35px', '1.7 с футър отстъпът остава 35px', m.withAttachments.paddingBottom);
        ok(m.withAttachments.content.b >= 34, '1.8 футърът не застъпва текста', { contentBottom: m.withAttachments.content.b, footerTop: m.withAttachments.footer && m.withAttachments.footer.b + m.withAttachments.footer.h });
        ok(m.withAttachments.footer && Math.abs(m.withAttachments.footer.h - 30) <= 0.6, '1.9 футърът е 30px висок', m.withAttachments.footer);
        // ред → заглавие: 3px като при графичен фон (преди b5.40 беше 18px)
        ok(m.plain.header.t === 21 && m.plain.title.t === 46, '1.10 редът е на 21px, заглавието на 46px от ръба', { header: m.plain.header.t, title: m.plain.title.t });
        ok(Math.abs(m.plain.gapHeaderTitle - 3) <= 0.6, '1.11 празнината ред → заглавие е 3px без приложения', m.plain.gapHeaderTitle);
        ok(Math.abs(m.withAttachments.gapHeaderTitle - 3) <= 0.6, '1.12 празнината ред → заглавие е 3px и с приложения', m.withAttachments.gapHeaderTitle);
    }
    ok(errs.length === 0, '1.13 няма грешки в страницата', errs.slice(0, 3));
    await ctx.close();
}

// --- 2) графичен фон ВКЛЮЧЕН: .note-item не е пипнат ------------------------------------
{
    const { ctx, page, errs } = await openBoard(true);
    const m = await measure(page);
    ok(!!m.plain && !!m.withAttachments, '2.1 двете карти са намерени', Object.keys(m));
    if (m.plain && m.withAttachments) {
        ok(m.plain.cls.includes('note-item'), '2.2 картата е в режим графичен фон', m.plain.cls);
        ok(m.plain.padding === '0px', '2.3 padding на .note-item остава 0', m.plain.padding);
        ok(m.plain.header.t === 25 && m.plain.title.t === 50, '2.4 редът е на 25px, заглавието на 50px както преди b5.40', { header: m.plain.header.t, title: m.plain.title.t });
        ok(Math.abs(m.withAttachments.gapHeaderTitle - 3) <= 0.6, '2.5 празнината ред → заглавие е 3px и при графичен фон', m.withAttachments.gapHeaderTitle);
        ok(m.plain.hasFooter === false && m.withAttachments.hasFooter === true, '2.6 футърът и тук е само при приложения', { plain: m.plain.hasFooter, att: m.withAttachments.hasFooter });
    }
    ok(errs.length === 0, '2.7 няма грешки в страницата', errs.slice(0, 3));
    await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
process.exit(fails ? 1 : 0);
