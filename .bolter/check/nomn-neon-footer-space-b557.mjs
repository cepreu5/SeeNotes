// nomn-neon b5.57: място за футъра на картата в борда само когато има приложения.
//
// Собственик (23.11.2026): „Нека да се отделя място за footer на бележката в борда само
// когато има приложения към нея (в nomn-neon)."
//
// Проверява в истински Chromium с две бележки на един борд: едната с прикачен файл
// (media запис в IndexedDB, type 3), другата без. Мери:
//   - padding-bottom на картата и дали .note-footer съществува,
//   - къде свършва тялото на бележката спрямо картата и спрямо футъра (без застъпване),
//   - че тялото на бележката без футър е с ~30px по-високо (освободеното място),
//   - че .note-item (графичен фон) не е пипнат — padding 0, футърът там е където беше.
//
// Пускане от корена на хранилището: node .bolter/check/nomn-neon-footer-space-b557.mjs
// ROOT=… сочи друга папка на приложението.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import os from 'node:os';

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

const root = path.resolve(process.env.ROOT || 'nomn-neon');
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

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

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
        const longText = ['Бележка с текст за мерене', 'Ред 1', 'Ред 2', 'Ред 3', 'Ред 4', 'Ред 5'].join('\n');
        await new Promise((res, rej) => {
            const tx = db.transaction(['boards', 'notes', 'media', 'config'], 'readwrite');
            tx.oncomplete = res; tx.onerror = () => rej(tx.error);
            for (const s of ['boards', 'notes', 'media', 'config']) tx.objectStore(s).clear();
            tx.objectStore('boards').put({ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b1', id: 1, numord: 1, status: 0, title: 'Board 1' });
            const base = { alarm_type: -1, calendarDate: now, color: 4, datemod: now, eventId: 0, numord: 0, pass: false, sellist: 1, text_span: '', timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 263, boardid: 'b1', date: now, status: 0, timer: now, pinnedAt: now, notetxt: longText };
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
    const ready = await page.waitForFunction(
        () => document.body.classList.contains('app-ready') && document.querySelectorAll('#notes-container .note').length >= 2,
        null, { timeout: 30000 }
    ).then(() => true, () => false);
    await page.waitForTimeout(1200);
    return { ctx, page, errs, ready };
}

// gdid → измерване на картата
const measure = (page) => page.evaluate(() => {
    const out = {};
    for (const note of document.querySelectorAll('#notes-container .note')) {
        const g = note.dataset.g || note.getAttribute('data-g') || '';
        const key = g === 'NoteAtt' ? 'withAttachments' : (g === 'NotePlain' ? 'plain' : null);
        if (!key) continue;
        const cs = getComputedStyle(note);
        const nb = note.getBoundingClientRect();
        const footer = note.querySelector('.note-footer');
        const wrapper = note.querySelector('.note-content-wrapper');
        const content = note.querySelector('.note-content');
        const fb = footer ? footer.getBoundingClientRect() : null;
        const wb = wrapper ? wrapper.getBoundingClientRect() : null;
        const cb = content ? content.getBoundingClientRect() : null;
        out[key] = {
            classes: note.className,
            paddingBottom: cs.paddingBottom,
            hasFooter: !!footer,
            footerIcons: footer ? footer.querySelectorAll('.footer-icon').length : 0,
            cardBottomToWrapperBottom: wb ? +(nb.bottom - wb.bottom).toFixed(1) : null,
            contentBox: cb ? { top: +(cb.top - nb.top).toFixed(1), bottom: +(cb.bottom - nb.top).toFixed(1), height: +cb.height.toFixed(1) } : null,
            footerBox: fb ? { top: +(fb.top - nb.top).toFixed(1), bottom: +(fb.bottom - nb.top).toFixed(1), height: +fb.height.toFixed(1) } : null,
            contentOverlapsFooter: (cb && fb) ? +(cb.bottom - fb.top).toFixed(1) : null
        };
    }
    return out;
});

// --- 1) графичен фон ИЗКЛЮЧЕН: картата с футър пази 35px, тази без футър — 5px ----------
{
    const { ctx, page, errs, ready } = await openBoard(false);
    ok(ready, '1.1 бордът се зарежда с двете бележки');
    const m = await measure(page);
    const a = m.withAttachments, p = m.plain;
    ok(!!a && !!p, '1.2 двете бележки са намерени по gdid', Object.keys(m));
    if (a && p) {
        ok(!/note-item/.test(a.classes) && !/note-item/.test(p.classes), '1.3 графичният фон е изключен (обикновени карти)', [a.classes, p.classes]);
        ok(a.hasFooter && a.footerIcons === 1, '1.4 бележката с прикачен файл има футър с една икона', a);
        ok(a.paddingBottom === '35px', '1.5 картата с футър пази 35px отдолу', a.paddingBottom);
        ok(!p.hasFooter, '1.6 бележката без приложения няма футър', p);
        ok(p.paddingBottom === '5px', '1.7 картата без приложения пази само 5px отдолу', p.paddingBottom);
        ok(a.contentBox && a.footerBox && a.contentOverlapsFooter <= 0.5,
            '1.8 тялото не влиза под иконите (текстът не се крие зад футъра)', { content: a.contentBox, footer: a.footerBox, overlap: a.contentOverlapsFooter });
        ok(p.contentBox && Math.abs((p.contentBox.height - a.contentBox.height) - 30) <= 2,
            '1.9 тялото на бележката без приложения е с ~30px по-високо', { plain: p.contentBox, withAtt: a.contentBox });
        ok(a.footerBox && a.footerBox.height === 30, '1.10 футърът е висок 30px, както преди', a.footerBox);
    }
    await page.screenshot({ path: path.join(os.tmpdir(), 'nomn-neon-footer-space-plain.png'), fullPage: false });
    const real = errs.filter(e => !/favicon|net::ERR/i.test(e));
    ok(real.length === 0, '1.11 няма грешки в страницата', real.slice(0, 3));
    await ctx.close();
}

// --- 2) графичен фон ВКЛЮЧЕН: .note-item не е пипнат -----------------------------------
{
    const { ctx, page, errs, ready } = await openBoard(true);
    ok(ready, '2.1 бордът се зарежда с двете бележки (графичен фон)');
    const m = await measure(page);
    const a = m.withAttachments, p = m.plain;
    ok(!!a && !!p, '2.2 двете бележки са намерени по gdid', Object.keys(m));
    if (a && p) {
        ok(/note-item/.test(a.classes) && /note-item/.test(p.classes), '2.3 картите са note-item (графичен фон)', [a.classes, p.classes]);
        ok(p.paddingBottom === '0px', '2.4 note-item без приложения остава с padding 0 (не е пипнат)', p.paddingBottom);
        ok(a.paddingBottom === '0px', '2.5 note-item с приложение също не е пипнат', a.paddingBottom);
        ok(a.hasFooter === true && !p.hasFooter, '2.6 футърът пак се строи само при приложения', { a: a.hasFooter, p: p.hasFooter });
    }
    await page.screenshot({ path: path.join(os.tmpdir(), 'nomn-neon-footer-space-graphic.png'), fullPage: false });
    const real = errs.filter(e => !/favicon|net::ERR/i.test(e));
    ok(real.length === 0, '2.7 няма грешки в страницата', real.slice(0, 3));
    await ctx.close();
}

// --- 3) футър, добавен по-късно, също вдига мястото ------------------------------------
{
    const { ctx, page, ready } = await openBoard(false);
    ok(ready, '3.1 бордът се зарежда');
    const res = await page.evaluate(() => {
        const plain = [...document.querySelectorAll('#notes-container .note')].find(n => (n.dataset.g || '') === 'NotePlain');
        if (!plain) return null;
        const before = getComputedStyle(plain).paddingBottom;
        const footer = document.createElement('div');
        footer.className = 'note-footer';
        footer.innerHTML = '<div class="footer-icon"><svg viewBox="0 0 24 24" width="25" height="25"></svg></div>';
        plain.appendChild(footer);
        const after = getComputedStyle(plain).paddingBottom;
        const nb = plain.getBoundingClientRect();
        const fb = footer.getBoundingClientRect();
        const cb = plain.querySelector('.note-content').getBoundingClientRect();
        footer.remove();
        return { before, after, footerTopFromCard: +(fb.top - nb.top).toFixed(1), overlap: +(cb.bottom - fb.top).toFixed(1) };
    });
    ok(res && res.before === '5px' && res.after === '35px', '3.2 щом футърът се появи, мястото става 35px', res);
    ok(res && res.overlap <= 0.5, '3.3 и тогава текстът не влиза под иконите', res);
    await ctx.close();
}

await browser.close();
srv.close();

console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails === 0 ? 'PASSED' : 'FAILED');
process.exit(fails === 0 ? 0 : 1);
