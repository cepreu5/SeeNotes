// Футърът на картата в борда отваря бележката (uni) — жив браузър (Playwright + Chromium).
// Проверява това, което собственикът поиска (26.10.2026): карта, запълнена изцяло от вложена
// снимка, няма празно място за докосване, затова и футърът (.note-footer) отваря бележката.
//   • клик в ПРАЗНАТА част на футъра отваря бележката;
//   • клик върху иконата за снимка (.footer-icon[data-type="1"]) отваря прегледа на прикачения
//     файл и НЕ отваря бележката (това поведение остава както досега);
//   • клик върху икона без собствено действие (тук type=3) отваря бележката;
//   • клик в тялото на картата отваря бележката;
//   • Shift+клик върху картата влиза в режим на избор и НЕ отваря бележката.
// Приложението се вдига ИСТИНСКИ, в демо режим (?demo=1): собствена IndexedDB, без мрежа и без
// логин. Картата се строи от самия createNoteElement на приложението.
// Пускане от корена на хранилището: node .bolter/check/footer-opens-note-uni.mjs   (exit 1 при провал)
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

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
// Всичко извън localhost се отбива: до Drive не се стига.
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

const BODY_TEXT = 'Тялото на бележката';
const NOTE_ID = '900010';

// Отворена бележка в uni = прозорец на бележка в #note-windows-layer, който е активен/видим и
// показва ТОЗИ текст. (В активния прозорец вътрешните ids са истински ids, не само data-mwid.)
// ВАЖНО: подава се като ИСТИНСКА функция, не като низ. Низ Playwright изчислява като израз, а
// изразът „(text) => {...}" е просто функция - винаги истинна, тоест чакането минава веднага.
const mineVisibleFn = (text) => {
    const layer = document.getElementById('note-windows-layer');
    return [...(layer ? layer.children : [])]
        .filter(el => el.classList && el.classList.contains('note-window'))
        .some(el => {
            if (!el.classList.contains('visible') || el.classList.contains('note-window-hidden')) return false;
            const box = el.querySelector('.modal-content-box');
            if (!box) return false;
            const r = box.getBoundingClientRect();
            if (r.width < 50 || r.height < 30) return false;
            const body = el.querySelector('.nw-modal-body, #modal-body, [data-mwid="modal-body"]');
            return !!body && (body.textContent || '').includes(text);
        });
};
const waitMineFor = (text, ms = 8000) => page.waitForFunction(mineVisibleFn, text, { timeout: ms }).then(() => true, () => false);
const waitMine = (ms = 8000) => waitMineFor(BODY_TEXT, ms);
const mineVisible = () => page.evaluate(mineVisibleFn, BODY_TEXT);
// Затвореният прозорец избледнява (~450 ms) и дотогава стои над борда: чакаме да се махне от пътя,
// иначе следващият клик попада върху него, а не върху картата.
const settle = () => page.waitForFunction(() => {
    const layer = document.getElementById('note-windows-layer');
    return [...(layer ? layer.children : [])].every(el => {
        if (!el.classList || !el.classList.contains('note-window')) return true;
        const cs = getComputedStyle(el);
        return cs.visibility === 'hidden' || cs.display === 'none' || cs.pointerEvents === 'none' || Number(cs.opacity) < 0.05;
    });
}, null, { timeout: 10000 }).then(() => true, () => false);

await page.goto(`http://localhost:${PORT}/?demo=1`, { waitUntil: 'load' });
const booted = await page.waitForFunction(() => typeof createNoteElement === 'function'
    && typeof showModal === 'function' && typeof mediaData !== 'undefined'
    && typeof notesContainer !== 'undefined' && !!notesContainer, null, { timeout: 30000 }).then(() => true, () => false);
ok(booted, 'приложението се вдигна (createNoteElement, showModal, mediaData, notesContainer)');
const boardReady = await page.waitForFunction(() => {
    const c = document.getElementById('notes-container');
    return c && c.querySelectorAll('.note').length > 0;
}, null, { timeout: 30000 }).then(() => true, () => false);
ok(boardReady, 'бордът е зареден (демото донесе поне една карта)');

// --- Картата се строи от самото приложение: бележка + два прикачени файла (снимка и документ) ---
const built = await page.evaluate(async (id) => {
    const gdid = String(id);
    mediaData.push(
        { gdid: '1MedPhoto00000000000000000aa', id: id + 1, noteid: gdid, path: 'Снимка.jpg', pathGD: '1PhotoFile000000000000000bb', type: 1 },
        { gdid: '1MedDoc0000000000000000000cc', id: id + 2, noteid: gdid, path: 'Документ.pdf', pathGD: '1DocFile0000000000000000dd', type: 3 });
    const note = {
        id: id, gdid: gdid, boardid: (typeof currentBoardFilter !== 'undefined' ? currentBoardFilter : 'demo'),
        notetxt: 'Заглавие на картата|Тялото на бележката', text_span: '', title_span: '',
        color: 0, datemod: Date.now(), version: 1, date: Date.now(), numord: 1, status: 0
    };
    allNotesData.push(note);
    const el = await createNoteElement(allNotesData[allNotesData.length - 1]);
    if (!el) return { err: 'createNoteElement върна null' };
    el.style.display = 'flex';
    window.__card = el;
    document.getElementById('notes-container').appendChild(el);
    const f = el.querySelector('.note-footer');
    const r = el.getBoundingClientRect();
    return {
        footer: !!f,
        icons: f ? [...f.querySelectorAll('.footer-icon')].map(i => i.dataset.type) : [],
        card: { w: Math.round(r.width), h: Math.round(r.height) }
    };
}, Number(NOTE_ID));
ok(!built.err && built.footer, 'картата има футър .note-footer', built);
ok(built.icons && built.icons.length === 2 && built.icons.includes('1') && built.icons.includes('3'),
    'футърът носи иконите за снимка (1) и документ (3)', built.icons);
ok(built.card && built.card.w > 50 && built.card.h > 50, 'картата е с реални размери на борда', built.card);
if (built.err) {
    console.log('няма смисъл да продължаваме без карта');
    await browser.close(); srv.close();
    process.exit(1);
}

const previewOpen = () => page.evaluate(() => !!window.__card.querySelector('.image-preview-overlay'));
const closeNotes = async () => {
    await page.evaluate(() => { document.querySelectorAll('#note-windows-layer .note-window.visible .modal-close').forEach(b => b.click()); });
    return settle();
};
const closePreview = async () => {
    await page.evaluate(() => {
        const o = window.__card.querySelector('.image-preview-overlay');
        const b = o && o.querySelector('button.view-button');
        if (b) b.click(); else if (o) o.remove();
    });
    return page.waitForFunction(() => !window.__card.querySelector('.image-preview-overlay'), null, { timeout: 5000 })
        .then(() => true, () => false);
};
// Точка, която наистина принадлежи на елемента, който искаме да натиснем (а не на нещо отгоре).
// filter='footer' - точката трябва да е САМИЯТ футър (празната му част), за да не улучим икона.
// filter='body'   - точка в картата извън футъра и заглавието.
const pointIn = (selector, filter) => page.evaluate(({ selector, filter }) => {
    const card = window.__card;
    card.scrollIntoView({ block: 'center', inline: 'center' });
    const el = card.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    for (let dy = 2; dy < Math.max(3, r.height - 1); dy += 3) {
        for (let dx = 2; dx < Math.max(3, r.width - 1); dx += 3) {
            const x = r.left + dx, y = r.top + dy;
            const hit = document.elementFromPoint(x, y);
            if (!hit) continue;
            const good = filter === 'footer'
                ? hit === el
                : (card.contains(hit) && !hit.closest('.note-footer') && !hit.closest('.note-title-wrapper') && !hit.closest('.note-header'));
            if (good) return { x, y, rect: { w: Math.round(r.width), h: Math.round(r.height) } };
        }
    }
    return null;
}, { selector, filter });
// Изчаква точката да принадлежи на очаквания елемент - без това клик може да попадне в избледняващ
// прозорец на бележка.
const waitPoint = (x, y, selector) => page.waitForFunction(({ x, y, selector }) => {
    const el = window.__card.querySelector(selector);
    const hit = document.elementFromPoint(x, y);
    if (!el || !hit) return false;
    if (selector === '.note-footer') return hit === el;
    return hit === el || el.contains(hit);
}, { x, y, selector }, { timeout: 8000 }).then(() => true, () => false);
const iconPoint = (type) => page.evaluate((type) => {
    const card = window.__card;
    const el = card.querySelector(`.footer-icon[data-type="${type}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const hit = document.elementFromPoint(x, y);
    return {
        x, y, w: Math.round(r.width), h: Math.round(r.height),
        ok: !!hit && (hit === el || el.contains(hit)),
        stack: document.elementsFromPoint(x, y).slice(0, 4).map(n => n.tagName + '.' + String(n.className).slice(0, 40))
    };
}, type);

// --- 1. Клик в празната част на футъра отваря бележката -------------------------------------
const footerPoint = await pointIn('.note-footer', 'footer');
ok(!!footerPoint, 'има празна точка във футъра, която принадлежи на самия футър', footerPoint);
if (footerPoint) {
    ok(await waitPoint(footerPoint.x, footerPoint.y, '.note-footer'), 'празната част на футъра е свободна за клик');
    await page.mouse.click(footerPoint.x, footerPoint.y);
    ok(await waitMine(), 'клик в празната част на футъра отваря бележката');
    ok(!(await previewOpen()), 'при клик в празната част на футъра НЕ се отваря преглед на файл');
    await closeNotes();
    ok(!(await mineVisible()), 'след затваряне бележката вече не е отворена');
}

// --- 2. Иконата за снимка отваря прегледа и НЕ отваря бележката (както досега) ---------------
const photoPoint = await iconPoint('1');
ok(!!photoPoint && photoPoint.w > 20 && photoPoint.h > 10, 'иконата за снимка има място на футъра', photoPoint);
if (photoPoint) {
    ok(await waitPoint(photoPoint.x, photoPoint.y, '.footer-icon[data-type="1"]'), 'иконата за снимка е свободна за клик');
    await page.mouse.click(photoPoint.x, photoPoint.y);
    const pv = await page.waitForFunction(() => !!window.__card.querySelector('.image-preview-overlay'), null, { timeout: 8000 }).then(() => true, () => false);
    ok(pv, 'клик върху иконата за снимка отваря прегледа на прикачения файл');
    ok(!(await mineVisible()), 'клик върху иконата за снимка НЕ отваря бележката');
    ok(await closePreview(), 'прегледът се затваря (за да не пречи на следващите проверки)');
    ok(await settle(), 'прозорците на бележките не пречат на борда преди следващата проверка');
}

// --- 3. Икона без собствено действие (документ, type=3) отваря бележката --------------------
const docPoint = await iconPoint('3');
ok(!!docPoint && docPoint.w > 20 && docPoint.h > 10, 'иконата за документ има място на футъра', docPoint);
if (docPoint) {
    ok(await waitPoint(docPoint.x, docPoint.y, '.footer-icon[data-type="3"]'), 'иконата за документ е свободна за клик');
    await page.mouse.click(docPoint.x, docPoint.y);
    ok(await waitMine(), 'клик върху икона без собствено действие (документ) отваря бележката');
    await closeNotes();
}

// --- 4. Клик в тялото на картата отваря бележката -------------------------------------------
const bodyPoint = await pointIn('.note-content', 'body');
ok(!!bodyPoint, 'има точка в тялото на картата извън футъра и заглавието', bodyPoint);
if (bodyPoint) {
    ok(await waitPoint(bodyPoint.x, bodyPoint.y, '.note-content'), 'тялото на картата е свободно за клик');
    await page.mouse.click(bodyPoint.x, bodyPoint.y);
    ok(await waitMine(), 'клик в тялото на картата отваря бележката');
    await closeNotes();
}

// --- 5. Shift+клик върху картата влиза в режим на избор и НЕ отваря бележката ---------------
const selPoint = await pointIn('.note-content', 'body');
if (selPoint) {
    // Shift се държи истински: page.mouse.click не приема modifiers.
    await page.keyboard.down('Shift');
    await page.mouse.click(selPoint.x, selPoint.y);
    await page.keyboard.up('Shift');
    const sel = await page.waitForFunction((key) => typeof selectionState !== 'undefined'
        && selectionState.active && selectionState.keys.has(key), NOTE_ID, { timeout: 5000 }).then(() => true, () => false);
    ok(sel, 'Shift+клик върху картата влиза в режим на избор с тази бележка');
    ok(!(await mineVisible()), 'Shift+клик върху картата НЕ отваря бележката');
    await page.evaluate(() => { if (typeof exitSelectionMode === 'function') exitSelectionMode(); });
    const off = await page.evaluate(() => typeof selectionState === 'undefined' || !selectionState.active);
    ok(off, 'излязохме от режима на избор (за да не пречи на следващи проверки)');
} else {
    ok(false, 'има точка в тялото на картата за Shift+клик');
}

// --- 6. Вградената снимка в картата: кликът върху нея НЕ отваря преглед на файл --------------
// Случаят на собственика: снимка, която заема картата. На борда кликът върху вградената снимка
// отваря бележката (собствен capture-обработвач на приложението спира събитието само вътре в
// отворена бележка) - и това остава както преди промяната, без преглед на файл отгоре.
const built2 = await page.evaluate(async () => {
    const raw = 'Снимка|*';
    const at = raw.substring(raw.indexOf('|') + 1).indexOf('*');
    const nt = {
        alarm_type: -1, boardid: (typeof currentBoardFilter !== 'undefined' ? currentBoardFilter : 'demo'),
        calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0,
        gdid: '900030', id: 900030, notetxt: raw, numord: 900030, sellist: 0, status: 0,
        text_span: JSON.stringify({ start: at, end: at + 1, type: 8, paramstring: '/storage/emulated/0/Pictures/Images/file_0000.png', paramint: 3 }),
        title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244
    };
    allNotesData.push(nt);
    const el = await createNoteElement(nt);
    if (!el) return { err: 'createNoteElement върна null' };
    el.style.display = 'flex';
    window.__card2 = el;
    document.getElementById('notes-container').appendChild(el);
    const deadline = Date.now() + 6000;
    let frame = null;
    while (Date.now() < deadline) {
        frame = el.querySelector('.note-content .nm-inline-img');
        if (frame && frame.getBoundingClientRect().width > 5) break;
        await new Promise(r => setTimeout(r, 40));
    }
    if (!frame) return { err: 'няма рамка .nm-inline-img в картата' };
    const r = frame.getBoundingClientRect();
    return { w: Math.round(r.width), h: Math.round(r.height), state: frame.dataset.nmState || null, x: r.left + r.width / 2, y: r.top + r.height / 2 };
});
ok(!built2.err && built2.w > 5 && built2.h > 5, 'картата със вградена снимка има рамка .nm-inline-img с размери', built2);
if (!built2.err && built2.w > 5) {
    await page.evaluate(() => window.__card2.scrollIntoView({ block: 'center', inline: 'center' }));
    await waitPoint(built2.x, built2.y, '.note-content .nm-inline-img', '__card2');
    await page.mouse.click(built2.x, built2.y);
    ok(await waitMineFor('Снимка'), 'клик върху вградената снимка в картата отваря бележката');
    const pv2 = await page.evaluate(() => !!document.querySelector('.image-preview-overlay'));
    ok(!pv2, 'клик върху вградената снимка в картата НЕ отваря преглед на файл');
    ok(await closeNotes(), 'бележката се затваря');
}

// --- Никакви грешки по страницата -----------------------------------------------------------
ok(errs.length === 0, 'няма грешки по страницата', errs.slice(0, 5));

console.log(`\n${n - fails}/${n} проверки минаха` + (fails ? `, ${fails} ПРОВАЛИ` : ''));
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
