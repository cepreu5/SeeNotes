// Футърът на картата в борда отваря бележката (MNV) — жив браузър (Playwright + Chromium).
// Същото нещо като footer-opens-note-uni.mjs, но за MNV (index-2.html):
//   • клик в ПРАЗНАТА част на футъра отваря бележката;
//   • клик върху иконата за снимка (.footer-icon[data-type="1"]) отваря прегледа и НЕ отваря бележката;
//   • клик върху икона без собствено действие (документ, type=3) отваря бележката;
//   • клик в тялото на картата отваря бележката;
//   • клик върху бутона за възстановяване („кошче“: .footer-icon.restore-btn) НЕ отваря бележката.
// Картата се строи от самия createNoteElement на приложението, кликовете са с истинска мишка.
// Пускане от корена на хранилището: node .bolter/check/footer-opens-note-mnv.mjs   (exit 1 при провал)
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
const PAGE = process.env.MNV_PAGE || 'index-2.html'; // истинската страница на приложението
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

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
// Всичко извън localhost се отбива: до Drive не се стига.
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

const BODY_TEXT = 'Тялото на бележката';

// Отворена бележка в MNV = прозорец на бележка, който е отворен, не е скрит и показва ТОЗИ текст.
// ВАЖНО: подава се като ИСТИНСКА функция, не като низ (низ Playwright изчислява като израз и
// „(text) => {...}" е винаги истинна функция, тоест чакането минава веднага).
const mineVisibleFn = (text) => {
    if (typeof getOpenNoteWindows !== 'function') return false;
    return getOpenNoteWindows().some(w => {
        if (!w.body || w.hidden) return false;
        const box = w.box || w.el;
        const r = box.getBoundingClientRect();
        if (r.width < 50 || r.height < 30) return false;
        const cs = getComputedStyle(w.el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        return (w.body.textContent || '').includes(text);
    });
};

await page.addInitScript(() => {
    // Отбитите външни скриптове (виж route-а по-горе) не носят своите обекти: даваме ги тук, за да не
    // остане страницата с грешки, които нямат нищо общо с проверката.
    const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
    window.google = {
        accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 },
        oauth2
    };
    window.kofiWidgetOverlay = { draw() { } };
    // Локална база, без Google: приложението не бива да ходи до Drive.
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
ok(booted, 'страницата на приложението се зареди (createNoteElement, startApp, mediaData, showModal)');

// --- Старт: приложението се вдига офлайн; ако стартът не стигне до модала, взимаме го от DOM ----
const bootInfo = await page.evaluate(async () => {
    const notes = { name: '', started: false, err: '' };
    // Флаговете на източника се задават преди старта, за да не тръгне към Drive.
    try {
        if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags();
    } catch (e) { /* няма значение */ }
    if (typeof contentModal === 'undefined' || !contentModal) {
        try {
            isOffline = true;
            await startApp(true);
            notes.started = true;
        } catch (e) { notes.err = String((e && e.message) || e).slice(0, 200); }
    }
    if (typeof contentModal === 'undefined' || !contentModal) {
        contentModal = document.getElementById('content-modal');
        modalBody = document.getElementById('modal-body');
        copyBtn = document.getElementById('copy-modal-btn') || document.createElement('button');
        notes.name = 'DOM refs';
    } else {
        notes.name = 'startApp';
    }
    if (typeof notesContainer === 'undefined' || !notesContainer) notesContainer = document.getElementById('notes-container');
    // Източник на данните: локална база, за която прикачените файлове се водят по gdid.
    useIndexedDb = true; useGoogleDb = false; useLocalFolder = false; useArhDb = false;
    isOffline = true;
    try { dbNoteIdTypeGlobal = 'gdid'; dbSourceGlobal = 1; } catch (e) { /* само за прегледа */ }
    return { ...notes, contentModal: !!contentModal, notesContainer: !!notesContainer, flags: `${useIndexedDb}/${useGoogleDb}` };
});
ok(bootInfo.contentModal && bootInfo.notesContainer, 'модалът и контейнерът на борда са налични', bootInfo);
console.log(`     (старт: ${bootInfo.name}; грешка: ${bootInfo.err || 'няма'})`);

// --- Картите се строят от самото приложение: нормална бележка и бележка в кошчето ---------------
const built = await page.evaluate(async () => {
    const out = {};
    // 1) Нормална бележка: снимка (type=1) + документ (type=3) във футъра.
    mediaData.push(
        { gdid: '1MedPhoto00000000000000000aa', id: 900011, noteid: '900010', path: 'Снимка.jpg', pathGD: '1PhotoFile000000000000000bb', type: 1 },
        { gdid: '1MedDoc0000000000000000000cc', id: 900012, noteid: '900010', path: 'Документ.pdf', pathGD: '1DocFile0000000000000000dd', type: 3 });
    const note = {
        id: 900010, gdid: '900010', boardid: currentBoardFilter, notetxt: 'Заглавие на картата|Тялото на бележката',
        text_span: '', title_span: '', color: 0, datemod: Date.now(), version: 1, date: Date.now(), numord: 1, status: 0
    };
    allNotesData.push(note);
    const el = await createNoteElement(allNotesData[allNotesData.length - 1]);
    if (!el) { out.err = 'createNoteElement върна null'; return out; }
    el.style.display = 'flex';
    window.__card = el;
    notesContainer.appendChild(el);
    const f = el.querySelector('.note-footer');
    out.footer = !!f;
    out.icons = f ? [...f.querySelectorAll('.footer-icon')].map(i => i.dataset.type || i.className) : [];

    // 2) Бележка в кошчето: футърът носи бутона за възстановяване.
    const trash = {
        id: 900020, gdid: '900020', boardid: currentBoardFilter, notetxt: 'Изтрита бележка|Тялото на кошчето',
        text_span: '', title_span: '', color: 0, datemod: Date.now(), version: 1, date: Date.now(), numord: 2, status: 1
    };
    allNotesData.push(trash);
    const el2 = await createNoteElement(allNotesData[allNotesData.length - 1]);
    if (el2) {
        el2.style.display = 'flex';
        window.__cardTrash = el2;
        notesContainer.appendChild(el2);
        out.restore = !!el2.querySelector('.footer-icon.restore-btn');
    }
    const r = el.getBoundingClientRect();
    out.card = { w: Math.round(r.width), h: Math.round(r.height) };
    return out;
});
ok(!built.err && built.footer, 'картата има футър .note-footer', built);
ok(built.icons && built.icons.includes('1') && built.icons.includes('3'), 'футърът носи иконите за снимка (1) и документ (3)', built.icons);
ok(built.card && built.card.w > 50 && built.card.h > 50, 'картата е с реални размери на борда', built.card);
ok(built.restore === true, 'бележката в кошчето има бутон за възстановяване във футъра', built);
if (built.err) {
    console.log('няма смисъл да продължаваме без карта');
    await browser.close(); srv.close();
    process.exit(1);
}

const mineVisible = () => page.evaluate(mineVisibleFn, BODY_TEXT);
const waitMine = (ms = 8000) => page.waitForFunction(mineVisibleFn, BODY_TEXT, { timeout: ms }).then(() => true, () => false);
const previewOpen = () => page.evaluate(() => !!window.__card.querySelector('.image-preview-overlay'));
const closeNotes = async () => {
    await page.evaluate(() => {
        if (typeof getOpenNoteWindows === 'function') {
            getOpenNoteWindows().forEach(w => { const b = w.el.querySelector('.modal-close'); if (b) b.click(); });
        }
    });
    return page.waitForFunction(() => typeof getOpenNoteWindows !== 'function' || getOpenNoteWindows().length === 0,
        null, { timeout: 8000 }).then(() => true, () => false);
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
// Изчаква точката да принадлежи на очаквания елемент (иначе кликът може да попадне в избледняващ
// прозорец на бележка).
const waitPoint = (x, y, selector, cardVar) => page.waitForFunction(({ x, y, selector, cardVar }) => {
    const card = window[cardVar || '__card'];
    const el = card && card.querySelector(selector);
    const hit = document.elementFromPoint(x, y);
    if (!el || !hit) return false;
    if (selector === '.note-footer') return hit === el;
    return hit === el || el.contains(hit);
}, { x, y, selector, cardVar }, { timeout: 8000 }).then(() => true, () => false);
const pointIn = (selector, filter, cardVar) => page.evaluate(({ selector, filter, cardVar }) => {
    const card = window[cardVar || '__card'];
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
                : (card.contains(hit) && !hit.closest('.note-footer') && !hit.closest('.note-title-wrapper'));
            if (good) return { x, y, rect: { w: Math.round(r.width), h: Math.round(r.height) } };
        }
    }
    return null;
}, { selector, filter, cardVar });
const iconPoint = (type, cardVar) => page.evaluate(({ type, cardVar }) => {
    const card = window[cardVar || '__card'];
    const el = card.querySelector(`.footer-icon[data-type="${type}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    return { x, y, w: Math.round(r.width), h: Math.round(r.height) };
}, { type, cardVar });

// --- 1. Клик в празната част на футъра отваря бележката -------------------------------------
const footerPoint = await pointIn('.note-footer', 'footer');
ok(!!footerPoint, 'има празна точка във футъра, която принадлежи на самия футър', footerPoint);
if (footerPoint) {
    ok(await waitPoint(footerPoint.x, footerPoint.y, '.note-footer'), 'празната част на футъра е свободна за клик');
    await page.mouse.click(footerPoint.x, footerPoint.y);
    ok(await waitMine(), 'клик в празната част на футъра отваря бележката');
    ok(!(await previewOpen()), 'при клик в празната част на футъра НЕ се отваря преглед на файл');
    ok(await closeNotes(), 'бележката се затваря');
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
}

// --- 3. Икона без собствено действие (документ, type=3) отваря бележката --------------------
const docPoint = await iconPoint('3');
ok(!!docPoint && docPoint.w > 20 && docPoint.h > 10, 'иконата за документ има място на футъра', docPoint);
if (docPoint) {
    ok(await waitPoint(docPoint.x, docPoint.y, '.footer-icon[data-type="3"]'), 'иконата за документ е свободна за клик');
    await page.mouse.click(docPoint.x, docPoint.y);
    ok(await waitMine(), 'клик върху икона без собствено действие (документ) отваря бележката');
    ok(await closeNotes(), 'бележката се затваря');
}

// --- 4. Клик в тялото на картата отваря бележката -------------------------------------------
const bodyPoint = await pointIn('.note-content', 'body');
ok(!!bodyPoint, 'има точка в тялото на картата извън футъра и заглавието', bodyPoint);
if (bodyPoint) {
    ok(await waitPoint(bodyPoint.x, bodyPoint.y, '.note-content'), 'тялото на картата е свободно за клик');
    await page.mouse.click(bodyPoint.x, bodyPoint.y);
    ok(await waitMine(), 'клик в тялото на картата отваря бележката');
    ok(await closeNotes(), 'бележката се затваря');
}

// --- 5. Бутонът за възстановяване в кошчето НЕ отваря бележката ------------------------------
const restorePoint = await page.evaluate(() => {
    const card = window.__cardTrash;
    if (!card) return null;
    card.scrollIntoView({ block: 'center', inline: 'center' });
    const el = card.querySelector('.footer-icon.restore-btn');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width), h: Math.round(r.height) };
});
ok(!!restorePoint && restorePoint.w > 5, 'бутонът за възстановяване има място на футъра', restorePoint);
if (restorePoint) {
    ok(await waitPoint(restorePoint.x, restorePoint.y, '.footer-icon.restore-btn', '__cardTrash'), 'бутонът за възстановяване е свободен за клик');
    await page.mouse.click(restorePoint.x, restorePoint.y);
    await page.waitForTimeout(400);
    ok(!(await mineVisible()), 'клик върху бутона за възстановяване НЕ отваря бележката');
}

// --- Никакви грешки по страницата -----------------------------------------------------------
ok(errs.length === 0, 'няма грешки по страницата', errs.slice(0, 5));

console.log(`\n${n - fails}/${n} проверки минаха` + (fails ? `, ${fails} ПРОВАЛИ` : ''));
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
