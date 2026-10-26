// Клик в празното на горната ивица на бележка в борда отваря JSON-а (MNV) — жив браузър.
// Картата се строи от самия createNoteElement, кликовете са с истинска мишка, на телефонен размер.
// Записваме какво приложението подава на showModal: JSON-ът е извикване без `format`,
// бележката за редакция е извикване с `format`. Така не се разчита на вътрешността на модала.
//   1) клик в празното на хедъра (над реда с датата/заглавието) показва JSON-а на бележката;
//   2) клик върху ЗАГЛАВИЕТО отваря бележката както досега, без JSON;
//   3) клик в тялото отваря бележката;
//   4) при debug = false клик в празното не показва JSON и стига до бележката;
//   5) Ctrl+клик върху заглавието не показва JSON.
// Пускане от корена на хранилището: node .bolter/check/header-json-mnv.mjs   (exit 1 при провал)
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

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));

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
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
const booted = await page.waitForFunction(() => typeof createNoteElement === 'function'
    && typeof startApp === 'function' && typeof mediaData !== 'undefined'
    && typeof showModal === 'function', null, { timeout: 30000 }).then(() => true, () => false);
ok(booted, 'страницата на приложението се зареди');
if (!booted) { await browser.close(); srv.close(); process.exit(1); }

const bootInfo = await page.evaluate(async () => {
    const info = { name: '', err: '' };
    try { if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags(); } catch (e) { }
    if (typeof contentModal === 'undefined' || !contentModal) {
        try { isOffline = true; await startApp(true); } catch (e) { info.err = String((e && e.message) || e).slice(0, 200); }
    }
    if (typeof contentModal === 'undefined' || !contentModal) {
        contentModal = document.getElementById('content-modal');
        modalBody = document.getElementById('modal-body');
        copyBtn = document.getElementById('copy-modal-btn') || document.createElement('button');
        info.name = 'DOM refs';
    } else { info.name = 'startApp'; }
    if (typeof notesContainer === 'undefined' || !notesContainer) notesContainer = document.getElementById('notes-container');
    useIndexedDb = true; useGoogleDb = false; useLocalFolder = false; useArhDb = false;
    isOffline = true;
    try { dbNoteIdTypeGlobal = 'gdid'; dbSourceGlobal = 1; } catch (e) { }
    return info;
});
console.log(`     (старт: ${bootInfo.name}; грешка: ${bootInfo.err || 'няма'})`);

// Записваме какво приложението подава на showModal.
await page.evaluate(() => {
    window.__calls = [];
    const orig = window.showModal;
    window.showModal = function (...a) {
        const o = a[0] || {};
        const raw = typeof o.raw === 'string' ? o.raw : '';
        window.__calls.push({
            json: /^\s*\{/.test(raw) && raw.includes('900731'),
            editor: o.format !== undefined,
            head: raw.slice(0, 40)
        });
        return orig.apply(this, a);
    };
});

const geo = await page.evaluate(async () => {
    const note = {
        id: 900731, gdid: '900731', boardid: currentBoardFilter,
        notetxt: 'Кратко заглавие|Тялото на бележката', text: 'Кратко заглавие|Тялото на бележката',
        text_span: '', title_span: '', color: 0, datemod: Date.now(), version: 1, date: Date.now(), numord: 1, status: 0
    };
    allNotesData.push(note);
    const el = await createNoteElement(allNotesData[allNotesData.length - 1]);
    if (!el) return { err: 'createNoteElement върна null' };
    el.style.display = 'flex';
    window.__card = el;
    notesContainer.appendChild(el);
    const title = el.querySelector('.note-title-truncated');
    if (!title) return { err: 'няма .note-title-truncated' };
    el.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 250));
    const r = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    return { card: r(el), wrap: r(title.parentElement), title: r(title) };
});
ok(!geo.err && geo.card.w > 50, 'картата се строи с хедър и е с реални размери', geo);
if (geo.err) { await browser.close(); srv.close(); process.exit(1); }

const calls = () => page.evaluate(() => window.__calls.slice());
const clearCalls = () => page.evaluate(() => { window.__calls = []; });
const reset = async () => {
    await page.evaluate(() => {
        document.querySelectorAll('#content-modal .modal-close').forEach(b => b.click());
        if (typeof getOpenNoteWindows === 'function') {
            getOpenNoteWindows().forEach(w => { const b = w.el.querySelector('.modal-close'); if (b) b.click(); });
        }
        window.__calls = [];
    });
    await page.waitForTimeout(300);
};

// Празното е над реда с датата и над заглавието: ивицата започва на wrap.y, датата е на ~25px,
// заглавието на 50px. Затова точките са в първите ~20px на ивицата.
const blanks = [
    { name: 'ляво', x: Math.round(geo.card.x + 8), y: Math.round(geo.wrap.y + 8) },
    { name: 'средата', x: Math.round(geo.card.x + geo.card.w / 2), y: Math.round(geo.wrap.y + 10) },
    { name: 'дясно', x: Math.round(geo.wrap.x + geo.wrap.w - 8), y: Math.round(geo.wrap.y + 14) }
];

// --- 1) празното на хедъра показва JSON ---
for (const p of blankPointsSafe(blanks)) {
    await clearCalls();
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(350);
    const c = await calls();
    ok(c.some(z => z.json), `празното ${p.name} (${p.x},${p.y}) показва JSON-а`, c);
    ok(!c.some(z => z.editor), `празното ${p.name} не отваря бележката за редакция`, c);
    await reset();
}

// --- 2) заглавието отваря бележката, без JSON ---
await clearCalls();
await page.mouse.click(Math.round(geo.title.x + 15), Math.round(geo.title.y + 10));
await page.waitForTimeout(400);
const c2 = await calls();
ok(c2.some(z => z.editor), 'клик върху заглавието отваря бележката както досега', c2);
ok(!c2.some(z => z.json), 'клик върху заглавието не показва JSON', c2);
await reset();

// --- 3) тялото отваря бележката ---
await clearCalls();
await page.mouse.click(Math.round(geo.card.x + geo.card.w / 2), Math.round(geo.card.y + geo.card.h - 30));
await page.waitForTimeout(400);
const c3 = await calls();
ok(c3.some(z => z.editor), 'клик в тялото отваря бележката', c3);
ok(!c3.some(z => z.json), 'клик в тялото не показва JSON', c3);
await reset();

// --- 4) при изключен Debug празното стига до бележката, без JSON ---
await page.evaluate(() => { debug = false; });
await clearCalls();
await page.mouse.click(blanks[1].x, blanks[1].y);
await page.waitForTimeout(400);
const c4 = await calls();
ok(!c4.some(z => z.json), 'при изключен Debug клик в празното не показва JSON', c4);
ok(c4.some(z => z.editor), 'при изключен Debug кликът стига до бележката', c4);
await reset();
await page.evaluate(() => { debug = true; });

// --- 5) Ctrl+клик върху заглавието не показва JSON (пътят за изтриване) ---
await clearCalls();
await page.keyboard.down('Control');
await page.mouse.click(Math.round(geo.title.x + 15), Math.round(geo.title.y + 10));
await page.keyboard.up('Control');
await page.waitForTimeout(400);
const c5 = await calls();
ok(!c5.some(z => z.json), 'Ctrl+клик върху заглавието не отваря JSON-а', c5);
await reset();

ok(errs.length === 0, 'няма грешки в страницата', errs.slice(0, 3));

await page.screenshot({ path: '.bolter/check/header-json-mnv-390.png', fullPage: false }).catch(() => { });
await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
process.exit(fails ? 1 : 0);

function blankPointsSafe(list) {
    return list.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
}
