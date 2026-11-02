// Клик в празното на горната ивица на бележка в борда отваря JSON-а (uni) — жив браузър.
// Същото поведение като в MNV (header-json-mnv.mjs), но за uni: картата се строи от самия
// createNoteElement, кликовете са с истинска мишка на телефонен размер, приложението се вдига
// в демо режим (?demo=1), без мрежа и без логин.
// Записваме какво приложението подава на showModal: JSON-ът е извикване БЕЗ `format`/`titleFormat`,
// бележката за редакция е извикване С тях. Така не се разчита на вътрешността на модала.
//   1) клик в празното на горната ивица (над заглавието) показва JSON-а на ТАЗИ бележка;
//   2) клик върху ЗАГЛАВИЕТО отваря бележката както досега, без JSON;
//   3) клик в тялото отваря бележката;
//   4) Ctrl+клик върху заглавието не показва JSON (пътят за изтриване).
// Режимът се задава с UNI_DEBUG: 1 (по подразбиране) — Debug е включен, празното показва JSON;
// 0 — контрола при изключен Debug: празното НЕ показва JSON, а кликът стига до бележката.
// Пускане от корена на хранилището: node .bolter/check/header-json-uni.mjs   (exit 1 при провал)
//   за контрола: UNI_DEBUG=0 ROOT=/tmp/uni-cur node .bolter/check/header-json-uni.mjs
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

const EXPECT_JSON = process.env.UNI_DEBUG !== '0';
const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index.html' : p;
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
// Всичко извън localhost се отбива: до Drive не се стига.
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));

console.log(`     (режим: Debug ${EXPECT_JSON ? 'ВКЛЮЧЕН' : 'изключен'}; код: ${root})`);

await page.goto(`http://localhost:${PORT}/?demo=1`, { waitUntil: 'load' });
const booted = await page.waitForFunction(() => typeof createNoteElement === 'function'
    && typeof showModal === 'function' && typeof mediaData !== 'undefined'
    && typeof notesContainer !== 'undefined' && !!notesContainer, null, { timeout: 30000 }).then(() => true, () => false);
ok(booted, 'приложението се вдигна (createNoteElement, showModal, mediaData, notesContainer)');
if (!booted) { await browser.close(); srv.close(); process.exit(1); }
const boardReady = await page.waitForFunction(() => {
    const c = document.getElementById('notes-container');
    return c && c.querySelectorAll('.note').length > 0;
}, null, { timeout: 30000 }).then(() => true, () => false);
ok(boardReady, 'бордът е зареден (демото донесе поне една карта)');

const NOTE_ID = 900773;
const debugValue = await page.evaluate(() => (typeof debug === 'undefined' ? null : debug));
ok(debugValue === EXPECT_JSON, `флагът debug в приложението е ${EXPECT_JSON}`, debugValue);

// --- Картата се строи от самото приложение ---
const geo = await page.evaluate(async (id) => {
    const note = {
        id: id, gdid: String(id), boardid: (typeof currentBoardFilter !== 'undefined' ? currentBoardFilter : 'demo'),
        notetxt: 'Кратко заглавие|Тялото на бележката', text_span: '', title_span: '',
        color: 0, datemod: Date.now(), version: 1, date: Date.now(), numord: 1, status: 0
    };
    allNotesData.push(note);
    const el = await createNoteElement(allNotesData[allNotesData.length - 1]);
    if (!el) return { err: 'createNoteElement върна null' };
    el.style.display = 'flex';
    window.__card = el;
    document.getElementById('notes-container').appendChild(el);
    el.scrollIntoView({ block: 'center' });
    await new Promise(r => setTimeout(r, 300));
    const title = el.querySelector('.note-title-truncated');
    if (!title) return { err: 'няма .note-title-truncated' };
    const r = (e) => { const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    return { card: r(el), wrap: r(title.parentElement), title: r(title) };
}, NOTE_ID);
ok(!geo.err && geo.card && geo.card.w > 50, 'картата се строи с хедър и е с реални размери', geo);
if (geo.err) { await browser.close(); srv.close(); process.exit(1); }

// Записваме какво приложението подава на showModal.
await page.evaluate((id) => {
    window.__calls = [];
    const orig = window.showModal;
    window.showModal = function (...a) {
        const o = a[0] || {};
        const raw = typeof o.raw === 'string' ? o.raw : '';
        window.__calls.push({
            json: /^\s*\{/.test(raw) && raw.includes(String(id)),
            editor: ('format' in o) || ('titleFormat' in o),
            head: raw.slice(0, 30)
        });
        return orig.apply(this, a);
    };
}, NOTE_ID);

const calls = () => page.evaluate(() => window.__calls.slice());
const clearCalls = () => page.evaluate(() => { window.__calls = []; });
const reset = async () => {
    await page.evaluate(() => {
        document.querySelectorAll('#note-windows-layer .note-window.visible .modal-close').forEach(b => b.click());
        window.__calls = [];
    });
    // Затвореният прозорец избледнява и дотогава стои над борда — чакаме да се махне от пътя.
    await page.waitForFunction(() => {
        const layer = document.getElementById('note-windows-layer');
        return [...(layer ? layer.children : [])].every(el => {
            if (!el.classList || !el.classList.contains('note-window')) return true;
            const cs = getComputedStyle(el);
            return cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none' || Number(cs.opacity) < 0.05;
        });
    }, null, { timeout: 10000 }).catch(() => { });
    await page.waitForTimeout(200);
};

// Точка, която наистина принадлежи на горната ивица и в нея няма заглавие/дата.
const wrapPoint = (dx, dy) => page.evaluate(({ dx, dy }) => {
    const wrap = window.__card.querySelector('.note-title-wrapper');
    const r = wrap.getBoundingClientRect();
    const x = Math.round(r.left + dx);
    const y = Math.round(r.top + dy);
    const hit = document.elementFromPoint(x, y);
    return { x, y, own: hit === wrap || (hit && hit.closest && hit.closest('.note-title-wrapper') === wrap),
             onTitle: !!(hit && hit.closest && hit.closest('.note-title-truncated')),
             onHeader: !!(hit && hit.closest && hit.closest('.note-header-info')) };
}, { dx, dy });

const wrapW = geo.wrap.w;
const blanks = [
    { name: 'ляво', dx: 8, dy: 8 },
    { name: 'средата', dx: Math.round(wrapW / 2), dy: 10 },
    { name: 'дясно', dx: wrapW - 8, dy: 14 }
];

if (EXPECT_JSON) {
    // --- 1) празното на хедъра показва JSON ---
    for (const b of blanks) {
        const p = await wrapPoint(b.dx, b.dy);
        ok(p.own && !p.onTitle && !p.onHeader, `точката ${b.name} е празното на ивицата (${p.x},${p.y})`, p);
        await clearCalls();
        await page.mouse.click(p.x, p.y);
        await page.waitForTimeout(400);
        const c = await calls();
        ok(c.some(z => z.json), `празното ${b.name} показва JSON-а на бележката`, c);
        ok(!c.some(z => z.editor), `празното ${b.name} не отваря бележката за редакция`, c);
        await reset();
    }
} else {
    // --- 1') контрола: при изключен Debug празното стига до бележката, без JSON ---
    const p = await wrapPoint(blanks[1].dx, blanks[1].dy);
    await clearCalls();
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(400);
    const c = await calls();
    ok(!c.some(z => z.json), 'при изключен Debug клик в празното не показва JSON', c);
    ok(c.some(z => z.editor), 'при изключен Debug кликът стига до бележката', c);
    await reset();
}

// --- 2) заглавието отваря бележката, без JSON ---
await clearCalls();
await page.mouse.click(Math.round(geo.title.x + 20), Math.round(geo.title.y + 10));
await page.waitForTimeout(450);
const c2 = await calls();
ok(c2.some(z => z.editor), 'клик върху заглавието отваря бележката както досега', c2);
ok(!c2.some(z => z.json), 'клик върху заглавието не показва JSON', c2);
await reset();

// --- 3) тялото отваря бележката ---
await clearCalls();
await page.mouse.click(Math.round(geo.card.x + geo.card.w / 2), Math.round(geo.card.y + geo.card.h - 30));
await page.waitForTimeout(450);
const c3 = await calls();
ok(c3.some(z => z.editor), 'клик в тялото отваря бележката', c3);
ok(!c3.some(z => z.json), 'клик в тялото не показва JSON', c3);
await reset();

// --- 4) Ctrl+клик върху заглавието не показва JSON (пътят за изтриване) ---
await clearCalls();
await page.keyboard.down('Control');
await page.mouse.click(Math.round(geo.title.x + 20), Math.round(geo.title.y + 10));
await page.keyboard.up('Control');
await page.waitForTimeout(450);
const c4 = await calls();
ok(!c4.some(z => z.json), 'Ctrl+клик върху заглавието не отваря JSON-а', c4);
await reset();

ok(errs.length === 0, 'няма грешки в страницата', errs.slice(0, 3));

await page.screenshot({ path: `.bolter/check/header-json-uni${EXPECT_JSON ? '' : '-control'}-390.png`, fullPage: false }).catch(() => { });
await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
process.exit(fails ? 1 : 0);
