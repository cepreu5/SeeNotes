// Проверка (31 Oct 2026, b3.29): вариант B - месецът и бележката остават на екрана в завъртян екран.
//
//   C1) 844x390, седмичен -> месечен: хедърът и редът с имената на дните са на екрана, мрежата се
//       скролира в собствената си кутия до последния ден, страницата не остава превъртяна, няма
//       хоризонтален прелив.
//   C2) 390x844 с отворен месец -> завъртане на 844x390: хедърът се вижда, клетките са квадратни,
//       последният ден се стига със скрол в кутията, няма смаляване на месеца; обратно в портрет
//       кутията се маха и месецът е както преди.
//   C3) 780x360: същото на по-малък завъртян екран.
//
//   N1) бележка 400x300 в 390x844, завъртяна на 844x390: кутията е ЦЯЛАТА на екрана, размерът е
//       същите 400x300 (не се смалява, щом се побира), записаното в бележката не се пипа, а връщането
//       в портрет я връща на първоначалния ъгъл.
//   N2) бележка, по-голяма от новия екран: смалява се само толкова, че да се побира, а записаният
//       размер си остава оригиналният.
//   N3) измерената грешка landscape -> портрет (x=222, ширина 400, десен ръб 612 при 390 екран):
//       след завъртане бележката е в екрана.
//   N4) бележка в режим на писане (фокус в полето) не се мести от завъртането - подредбата с
//       клавиатурата (PR #130/#131) остава нейна.
//
// Пускане: node .bolter/check/landscape-variant-b.mjs      (exit 1 при провал)
// ROOT=… сочи друга папка на приложението.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const PLAYWRIGHT = [
    '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs',
].find(p => existsSync(p));
const { chromium } = await import(PLAYWRIGHT);
const CHROME = ['/opt/ms-playwright/chromium-1248/chrome-linux64/chrome', '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome'].find(p => existsSync(p));

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/__seed.html') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end('<!doctype html><meta charset="utf-8"><body>seed'); return; }
    const rel = p === '/' ? 'index.html' : p;
    try { const b = await readFile(path.join(root, rel)); res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(b); }
    catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const ORIGIN = `http://localhost:${srv.address().port}`;
const browser = await chromium.launch({ executablePath: CHROME });

let fails = 0, checks = 0;
const ok = (name, cond, extra = '') => { checks++; if (!cond) fails++; console.log((cond ? 'OK   ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')); };
const say = (label, data) => console.log('   ' + label + ' ' + JSON.stringify(data));

// Бележките: 1 - 400x300 при (5,60), 2 - по-голяма от екрана 800x700 при (0,0), 3 - измерената
// грешка 400 широка при x=222, 4..6 - обикновени, без записано място.
const NOTE1 = 'Note000000000000000001';
const NOTE2 = 'Note000000000000000002';
const NOTE3 = 'Note000000000000000003';

const INIT = () => {
    const oauth2 = { initTokenClient() { return { requestAccessToken() { } }; }, hasGrantedAllScopes() { return false; } };
    window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
    window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
    window.kofiWidgetOverlay = { draw() { } };
    window.kofiwidget2 = { init() { }, draw() { } };
    ['useIndexedDb:true', 'useGoogleDb:false', 'useLocalDb:false', 'useLocalFolder:false', 'useArhDb:false', 'updateFromSource:false', 'language:bg', 'hideAssistant:true', 'showBoardAll:true', 'startBoard:b1'].forEach(s => {
        const i = s.indexOf(':'); localStorage.setItem(s.slice(0, i), s.slice(i + 1));
    });
};

async function seed(page) {
    await page.goto(`${ORIGIN}/__seed.html`, { waitUntil: 'load' });
    await page.evaluate(async () => {
        const dbName = 'NotesDB-demo';
        const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null, files: { keyPath: 'key' } };
        await new Promise((res) => { const d = indexedDB.deleteDatabase(dbName); d.onsuccess = d.onerror = d.onblocked = () => res(); setTimeout(res, 3000); });
        const db = await new Promise((res, rej) => {
            const req = indexedDB.open(dbName, 4);
            req.onupgradeneeded = () => { const d = req.result; for (const [name, opt] of Object.entries(STORES)) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, opt || undefined); };
            req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
        });
        const now = new Date(); const stamp = now.getTime();
        const boards = [];
        for (let i = 1; i <= 6; i++) boards.push({ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: stamp, gdid: 'b' + i, id: i, numord: i, status: 0, title: 'Board ' + i });
        const mk = (k, calendarDate, uiState) => ({
            alarm_type: -1, boardid: 'b1', calendarDate, color: k % 5, date: stamp - k * 1000, datemod: stamp - k * 1000,
            eventId: 0, gdid: `Note${String(k).padStart(18, '0')}`, id: 1000 + k, notetxt: `Бележка ${k}\nвтори ред ${k}`,
            numord: k, pass: false, sellist: 0, status: 0, text_span: '', timer: 0, timer_type: -1, timer_val: 1,
            title_span: '', type: 0, version: 243, ...(uiState ? { uiState } : {})
        });
        const dToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 9).getTime();
        const notes = [
            mk(1, dToday, { pos: { x: 5, y: 60 }, size: { w: 400, h: 300 } }),
            mk(2, 0, { pos: { x: 0, y: 0 }, size: { w: 800, h: 700 } }),
            mk(3, 0, { pos: { x: 222, y: 40 }, size: { w: 400, h: 300 } }),
            mk(4, new Date(now.getFullYear(), now.getMonth(), 3, 9).getTime()),
            mk(5, new Date(now.getFullYear(), now.getMonth(), 10, 9).getTime()),
            mk(6, 0)
        ];
        await new Promise((res, rej) => {
            const tx = db.transaction(['boards', 'notes', 'media', 'config'], 'readwrite');
            tx.oncomplete = res; tx.onerror = () => rej(tx.error);
            tx.objectStore('boards').clear(); tx.objectStore('notes').clear(); tx.objectStore('media').clear(); tx.objectStore('config').clear();
            boards.forEach(b => tx.objectStore('boards').put(b)); notes.forEach(x => tx.objectStore('notes').put(x));
            tx.objectStore('config').put(1, 'dbSource'); tx.objectStore('config').put('gdid', 'dbNoteIdType');
            tx.objectStore('config').put(stamp, 'dbCreatedTimestamp'); tx.objectStore('config').put(stamp, 'lastLocalTimestamp');
        });
        db.close();
    });
}

async function open(W, H) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' });
    await ctx.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
    await page.addInitScript(INIT);
    await seed(page);
    await page.goto(`${ORIGIN}/index.html?demo=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 30000 }).catch(() => { });
    await page.waitForTimeout(1600);
    return { ctx, page, errs };
}

const MONTH = () => {
    const c = document.getElementById('calendar-container');
    const grid = c && c.querySelector('.calendar-grid');
    if (!c || !grid) return null;
    const rect = el => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width), height: Math.round(b.height) }; };
    const now = new Date();
    const lastNum = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const cell = grid.querySelector('.calendar-cell');
    const last = grid.querySelector(`.calendar-cell[data-day="${lastNum}"]`);
    const area = c.querySelector('.calendar-grid-scroll') || grid;
    const header = c.querySelector('.calendar-header');
    const days = c.querySelector('.calendar-days-header');
    const doc = document.scrollingElement || document.documentElement;
    const btn = id => { const el = document.getElementById(id); return el ? rect(el) : null; };
    return {
        vw: window.innerWidth, vh: window.innerHeight,
        scrollY: Math.round(window.scrollY),
        docScrollW: doc.scrollWidth, docScrollH: doc.scrollHeight,
        scrollBox: c.classList.contains('calendar-scroll-box'),
        transform: getComputedStyle(c).transform,
        container: rect(c), header: rect(header), days: rect(days), grid: rect(grid),
        gridScrollTop: Math.round(area.scrollTop), gridScrollH: area.scrollHeight, gridClientH: area.clientHeight,
        gridScrollW: area.scrollWidth, gridClientW: area.clientWidth,
        cell: cell ? rect(cell) : null,
        lastNum, last: last ? rect(last) : null,
        buttons: { prev: btn('prev-month-btn'), today: btn('today-month-btn'), next: btn('next-month-btn'), weekly: btn('weekly-view-btn'), close: btn('close-month-calendar-btn') }
    };
};

const inside = (r, vw, vh) => !!r && r.top >= -1 && r.left >= -1 && r.bottom <= vh + 1 && r.right <= vw + 1;
const square = r => !!r && Math.abs(r.width - r.height) <= 1;

const NOTE = () => {
    const els = [...document.querySelectorAll('#note-windows-layer > .note-window')]
        .filter(e => e.offsetWidth > 0 && !e.classList.contains('note-window-hidden'));
    const el = els[els.length - 1];
    if (!el) return null;
    const box = el.querySelector('.modal-content-box');
    const body = el.querySelector('[data-mwid="modal-body"]');
    const b = box.getBoundingClientRect();
    return {
        vw: window.innerWidth, vh: window.innerHeight,
        left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom),
        width: Math.round(b.width), height: Math.round(b.height),
        expanded: body && body.dataset.isExpanded === 'true',
        kbTop: el.classList.contains('note-window-kb-top')
    };
};

const STORED = async (page, gdid) => page.evaluate(async (g) => {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('NotesDB-demo'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const note = await new Promise((res, rej) => { const tx = db.transaction('notes'); const rq = tx.objectStore('notes').get(g); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
    db.close();
    return note && note.uiState ? note.uiState : null;
}, gdid);

async function openNote(page, gdid) {
    await page.click(`.note[data-g="${gdid}"]`);
    await page.waitForFunction(() => {
        const els = [...document.querySelectorAll('#note-windows-layer > .note-window')].filter(e => e.offsetWidth > 0 && !e.classList.contains('note-window-hidden'));
        const el = els[els.length - 1];
        return !!(el && el.querySelector('.modal-content-box') && el.querySelector('.modal-content-box').offsetWidth);
    }, null, { timeout: 8000 });
    await page.waitForTimeout(600);
}

// Ротирането: ширината се сменя, чакаме подредбата (120ms debounce + кадър).
async function rotate(page, W, H) {
    await page.setViewportSize({ width: W, height: H });
    await page.waitForTimeout(900);
}

async function openMonthIn(page) {
    await page.click('#calendar_button');
    await page.waitForTimeout(1000);
    if (await page.$('#month-view-btn')) { await page.click('#month-view-btn'); await page.waitForTimeout(1100); }
}

// ---------------- C1) 844x390: седмичен -> месечен ----------------
console.log('\n=== C1 844x390: седмичен -> месечен');
{
    const { ctx, page, errs } = await open(844, 390);
    await page.click('#calendar_button');
    await page.waitForTimeout(1200);
    const weekScroll = await page.evaluate(() => Math.round(window.scrollY));
    const m0 = await page.evaluate(MONTH);
    ok('C1 седмичният изглед е висок и страницата е превъртяна (изходно състояние)', m0 === null && weekScroll > 0, `scrollY=${weekScroll}`);

    await page.click('#month-view-btn');
    await page.waitForTimeout(1400);
    let m = await page.evaluate(MONTH);
    say('месец в landscape:', { scrollY: m.scrollY, header: m.header, days: m.days, grid: m.grid, cell: m.cell, box: m.scrollBox, transform: m.transform });
    ok('C1 страницата НЕ остава превъртяна', m.scrollY === 0, `scrollY=${m.scrollY}`);
    ok('C1 хедърът (стрелки/днес/седмица/затваряне/име) е на екрана', inside(m.header, m.vw, m.vh) && m.header.height > 20, JSON.stringify(m.header));
    ok('C1 редът с имената на дните е на екрана, под хедъра', inside(m.days, m.vw, m.vh) && m.days.top >= m.header.bottom - 2, JSON.stringify(m.days));
    Object.entries(m.buttons).forEach(([k, r]) => ok(`C1 бутонът "${k}" е на екрана`, inside(r, m.vw, m.vh), JSON.stringify(r)));
    ok('C1 месецът е в кутия (вариант B)', m.scrollBox === true);
    ok('C1 месецът НЕ е смален (без transform)', m.transform === 'none' || m.transform === 'matrix(1, 0, 0, 1, 0, 0)', m.transform);
    ok('C1 мрежата се скролира в кутията си', m.gridScrollH > m.gridClientH + 10, `scrollH=${m.gridScrollH} clientH=${m.gridClientH}`);
    ok('C1 мрежата пази естествената си височина (клетките не са смачкани)', m.grid.height >= 5 * m.cell.height, `grid=${m.grid.height} cell=${m.cell.height}`);
    ok('C1 няма хоризонтален прелив в кутията', m.gridScrollW <= m.gridClientW + 1, `scrollW=${m.gridScrollW} clientW=${m.gridClientW}`);
    ok('C1 няма хоризонтален прелив на страницата', m.docScrollW <= m.vw + 1, `docW=${m.docScrollW} vw=${m.vw}`);
    ok('C1 клетките са квадратни', square(m.cell) && m.cell.width > 90, JSON.stringify(m.cell));
    await page.screenshot({ path: '.bolter/check/vb-1-month-landscape-top.png' });

    // Скрол на кутията до дъното: последният ден трябва да влезе в екрана, хедърът да остане горе.
    await page.evaluate(() => { const g = document.querySelector('#calendar-container .calendar-grid-scroll'); g.scrollTop = g.scrollHeight; });
    await page.waitForTimeout(250);
    const m2 = await page.evaluate(MONTH);
    say('след скрол до дъно:', { scrollTop: m2.gridScrollTop, last: m2.last, header: m2.header, scrollY: m2.scrollY });
    ok('C1 кутията наистина се е скролнала', m2.gridScrollTop > 50, `scrollTop=${m2.gridScrollTop}`);
    ok(`C1 ден ${m2.lastNum} е на екрана след скрол`, inside(m2.last, m2.vw, m2.vh) && m2.last.bottom <= m2.vh + 1, JSON.stringify(m2.last));
    ok('C1 хедърът е на същото място след скрола', Math.abs(m2.header.top - m.header.top) <= 1, `top ${m.header.top} -> ${m2.header.top}`);
    ok('C1 скролът на кутията не е превъртял страницата', m2.scrollY === 0, `scrollY=${m2.scrollY}`);
    await page.screenshot({ path: '.bolter/check/vb-2-month-landscape-bottom.png' });

    // И обратно: месец -> седмица не оставя страницата превъртяна в средата на седмицата.
    await page.click('#weekly-view-btn');
    await page.waitForTimeout(1000);
    const back = await page.evaluate(() => {
        const w = document.getElementById('weekly-calendar-container');
        const h = w && w.querySelector('.calendar-header');
        const b = h ? h.getBoundingClientRect() : null;
        const doc = document.scrollingElement || document.documentElement;
        return { scrollY: Math.round(window.scrollY), docH: doc.scrollHeight, clientH: doc.clientHeight, weekH: w ? Math.round(w.getBoundingClientRect().height) : null, weeklyShown: !!w && getComputedStyle(w).display !== 'none', weekHeaderTop: b ? Math.round(b.top) : null, calDisplay: getComputedStyle(document.getElementById('calendar-container')).display, mainH: Math.round(document.querySelector('main').getBoundingClientRect().height), weekBottom: w ? Math.round(w.getBoundingClientRect().bottom) : null };
    });
    say('обратно към седмичния изглед:', back);
    ok('C1 месец -> седмица: хедърът на седмицата е на екрана горе', back.weeklyShown && back.weekHeaderTop !== null && back.weekHeaderTop >= 0 && back.weekHeaderTop < 200, JSON.stringify(back));
    ok('C1 месец -> седмица: скритият месец не остава в подредбата под седмичния изглед', back.calDisplay === 'none', `display=${back.calDisplay}`);

    // И обратно към месеца: страницата пак е превъртяна от седмичния (224), значи смяната трябва да я
    // върне в началото и в тази посока.
    await page.click('#month-view-btn');
    await page.waitForTimeout(1300);
    const again = await page.evaluate(MONTH);
    say('седмица -> месец отново:', { scrollY: again.scrollY, header: again.header, box: again.scrollBox });
    ok('C1 седмица -> месец също връща страницата в началото', again.scrollY === 0, `scrollY=${again.scrollY}`);
    ok('C1 и тогава хедърът е на екрана', inside(again.header, again.vw, again.vh), JSON.stringify(again.header));
    ok('C1 месец -> седмица не оставя страницата в средата на месечната мрежа (седмичният изглед сам слиза до днес)',
        back.weekH !== null && back.scrollY <= Math.max(0, back.docH - back.clientH), `scrollY=${back.scrollY} max=${Math.max(0, back.docH - back.clientH)}`);
    ok('C1 без изключения в конзолата', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
}

// ---------------- C2) 390x844 с отворен месец -> 844x390 ----------------
console.log('\n=== C2 390x844 с отворен месец -> завъртане на 844x390');
{
    const { ctx, page, errs } = await open(390, 844);
    await openMonthIn(page);
    const p = await page.evaluate(MONTH);
    say('портрет:', { box: p.scrollBox, cell: p.cell, transform: p.transform, grid: p.grid });
    ok('C2 в портрет месецът е както досега (без кутия)', p.scrollBox === false);
    // В портрет клетката е 50 широка, а редът е 62 висок, защото квадратчето на бележката вдига
    // min-content височината - така беше и преди тази поправка, затова тук се пази ширината 50.
    ok('C2 в портрет клетките са същите като преди (50 широка)', p.cell.width === 50, JSON.stringify(p.cell));

    await rotate(page, 844, 390);
    const m = await page.evaluate(MONTH);
    say('след завъртане:', { box: m.scrollBox, transform: m.transform, cell: m.cell, grid: m.grid, header: m.header, scrollY: m.scrollY });
    ok('C2 след завъртане месецът мина в кутия', m.scrollBox === true);
    ok('C2 след завъртане месецът не е смален', m.transform === 'none' || m.transform === 'matrix(1, 0, 0, 1, 0, 0)', m.transform);
    ok('C2 хедърът се вижда след завъртане', inside(m.header, m.vw, m.vh) && m.header.height > 20, JSON.stringify(m.header));
    ok('C2 редът с имената на дните се вижда', inside(m.days, m.vw, m.vh), JSON.stringify(m.days));
    ok('C2 клетките остават квадратни', square(m.cell), JSON.stringify(m.cell));
    ok('C2 мрежата пази естествената си височина', m.grid.height >= 5 * m.cell.height, `grid=${m.grid.height} cell=${m.cell.height}`);
    ok('C2 клетките не са 115px (не са от портретния размер)', m.cell.width < 130 && m.cell.width > 60, `w=${m.cell.width}`);
    ok('C2 страницата не е превъртяна', m.scrollY === 0, `scrollY=${m.scrollY}`);
    await page.evaluate(() => { const g = document.querySelector('#calendar-container .calendar-grid-scroll'); g.scrollTop = g.scrollHeight; });
    await page.waitForTimeout(250);
    const m2 = await page.evaluate(MONTH);
    ok(`C2 ден ${m2.lastNum} се стига със скрол в кутията`, inside(m2.last, m2.vw, m2.vh) && m2.gridScrollTop > 50, `scrollTop=${m2.gridScrollTop} last=${JSON.stringify(m2.last)}`);
    ok('C2 хедърът е на екрана и след скрола', inside(m2.header, m2.vw, m2.vh), JSON.stringify(m2.header));

    // Обратно в портрет: кутията се маха, месецът пак е както преди.
    await rotate(page, 390, 844);
    const p2 = await page.evaluate(MONTH);
    const inlineStyle = await page.evaluate(() => document.getElementById('calendar-container').getAttribute('style') || '');
    say('обратно в портрет:', { box: p2.scrollBox, cell: p2.cell, scrollY: p2.scrollY, styleHasHeight: /height/.test(inlineStyle) });
    ok('C2 обратно в портрет кутията се маха', p2.scrollBox === false);
    ok('C2 обратно в портрет клетките са пак 50 широки, както преди', p2.cell.width === 50, JSON.stringify(p2.cell));
    ok('C2 обратно в портрет не остава инлайн височина от кутията', !/height/.test(inlineStyle), inlineStyle);
    ok('C2 обратно в портрет страницата е в началото', p2.scrollY === 0, `scrollY=${p2.scrollY}`);
    ok('C2 без изключения в конзолата', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
}

// ---------------- C3) 780x360: същият нисък екран, малко по-тесен ----------------
console.log('\n=== C3 780x360: месец в по-малък завъртян екран');
{
    const { ctx, page, errs } = await open(780, 360);
    await openMonthIn(page);
    const m = await page.evaluate(MONTH);
    say('месец 780x360:', { box: m.scrollBox, header: m.header, days: m.days, cell: m.cell, grid: m.grid, scrollY: m.scrollY });
    ok('C3 месецът е в кутия', m.scrollBox === true);
    ok('C3 хедърът и имената на дните са на екрана', inside(m.header, m.vw, m.vh) && inside(m.days, m.vw, m.vh), JSON.stringify([m.header, m.days]));
    ok('C3 клетките са квадратни', square(m.cell), JSON.stringify(m.cell));
    ok('C3 няма хоризонтален прелив', m.docScrollW <= m.vw + 1 && m.gridScrollW <= m.gridClientW + 1, `docW=${m.docScrollW} gridW=${m.gridScrollW}/${m.gridClientW}`);
    await page.evaluate(() => { const g = document.querySelector('#calendar-container .calendar-grid-scroll'); g.scrollTop = g.scrollHeight; });
    await page.waitForTimeout(250);
    const m2 = await page.evaluate(MONTH);
    ok(`C3 ден ${m2.lastNum} се стига със скрол, хедърът остава горе`, inside(m2.last, m2.vw, m2.vh) && Math.abs(m2.header.top - m.header.top) <= 1, `last=${JSON.stringify(m2.last)} headerTop=${m2.header.top}`);
    ok('C3 без изключения в конзолата', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
}

// ---------------- N1) 400x300 в портрет -> landscape -> портрет ----------------
console.log('\n=== N1 бележка 400x300: 390x844 -> 844x390 -> 390x844');
{
    const { ctx, page, errs } = await open(390, 844);
    await openNote(page, NOTE1);
    const n0 = await page.evaluate(NOTE);
    const s0 = await STORED(page, NOTE1);
    say('портрет преди завъртане:', n0);
    say('записано:', s0);
    ok('N1 бележката е отворена в портрет', !!n0 && !n0.expanded);

    await rotate(page, 844, 390);
    const n1 = await page.evaluate(NOTE);
    const s1 = await STORED(page, NOTE1);
    say('landscape след завъртане:', n1);
    say('записано:', s1);
    ok('N1 бележката е ЦЯЛАТА на екрана в landscape', inside(n1, n1.vw, n1.vh),
        `left=${n1.left} top=${n1.top} right=${n1.right} bottom=${n1.bottom} (екран ${n1.vw}x${n1.vh})`);
    ok('N1 размерът е същият 400x300 (не се смалява, щом се побира)', n1.width === 400 && n1.height === 300, `${n1.width}x${n1.height}`);
    ok('N1 записаното място и размер не са се променили', JSON.stringify(s1) === JSON.stringify(s0), `${JSON.stringify(s0)} -> ${JSON.stringify(s1)}`);
    await page.screenshot({ path: '.bolter/check/vb-3-note-landscape.png' });

    await rotate(page, 390, 844);
    const n2 = await page.evaluate(NOTE);
    const s2 = await STORED(page, NOTE1);
    say('обратно в портрет:', n2);
    ok('N1 връщането в портрет я връща на първоначалния ъгъл', n2.left === n0.left && n2.top === n0.top,
        `преди ${n0.left},${n0.top} -> след ${n2.left},${n2.top}`);
    ok('N1 размерът в портрет е пак същият като при отваряне', n2.width === n0.width && n2.height === n0.height, `${n2.width}x${n2.height} срещу ${n0.width}x${n0.height}`);
    ok('N1 записаното е непокътнато и след връщането', JSON.stringify(s2) === JSON.stringify(s0), JSON.stringify(s2));
    ok('N1 бележката е на екрана и в портрет', inside(n2, n2.vw, n2.vh), JSON.stringify(n2));
    await page.screenshot({ path: '.bolter/check/vb-4-note-portrait.png' });
    ok('N1 без изключения в конзолата', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
}

// ---------------- N2) бележка, по-голяма от новия екран ----------------
console.log('\n=== N2 бележка 800x700: 390x844 -> 844x390 (смалява се само ако иначе не се побира)');
{
    const { ctx, page, errs } = await open(390, 844);
    await openNote(page, NOTE2);
    const s0 = await STORED(page, NOTE2);
    const n0 = await page.evaluate(NOTE);
    say('портрет преди завъртане:', n0);

    await rotate(page, 844, 390);
    const n1 = await page.evaluate(NOTE);
    const s1 = await STORED(page, NOTE2);
    say('landscape след завъртане:', n1);
    say('записано:', s1);
    ok('N2 бележката е в екрана (смалена само по височина)', inside(n1, n1.vw, n1.vh),
        `left=${n1.left} top=${n1.top} right=${n1.right} bottom=${n1.bottom}`);
    ok('N2 височината е свита до екрана (390 - 2*10)', n1.height === 370, `h=${n1.height}`);
    ok('N2 ширината 800 се побира и не се пипа', n1.width === 800, `w=${n1.width}`);
    ok('N2 записаният размер си остава оригиналният 800x700', JSON.stringify(s1) === JSON.stringify(s0), `${JSON.stringify(s0)} -> ${JSON.stringify(s1)}`);
    ok('N2 без изключения в конзолата', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
}

// ---------------- N3) измерената грешка: landscape -> портрет ----------------
console.log('\n=== N3 бележка при x=222, ширина 400: 844x390 -> 390x844');
{
    const { ctx, page, errs } = await open(844, 390);
    await openNote(page, NOTE3);
    const n0 = await page.evaluate(NOTE);
    const s0 = await STORED(page, NOTE3);
    say('landscape преди завъртане:', n0);
    ok('N3 изходното състояние е измереното: 400 широка при x=222 (десният ръб би бил 622 при 390 екран)',
        n0.left === 222 && n0.width === 400 && inside(n0, n0.vw, n0.vh), `left=${n0.left} right=${n0.right}`);

    await rotate(page, 390, 844);
    const n1 = await page.evaluate(NOTE);
    const s1 = await STORED(page, NOTE3);
    say('портрет след завъртане:', n1);
    ok('N3 бележката е в екрана след завъртане', inside(n1, n1.vw, n1.vh),
        `left=${n1.left} right=${n1.right} (екран ${n1.vw})`);
    ok('N3 ширината е свита до 390 - 2*10 = 370', n1.width === 370, `w=${n1.width}`);
    ok('N3 записаното не се е променило', JSON.stringify(s1) === JSON.stringify(s0), `${JSON.stringify(s0)} -> ${JSON.stringify(s1)}`);
    ok('N3 без изключения в конзолата', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
}

// ---------------- N4) бележка в режим на писане не се мести ----------------
console.log('\n=== N4 бележка в режим на писане: завъртането не я пипа');
{
    const { ctx, page, errs } = await open(390, 844);
    await openNote(page, NOTE1);
    // Влизаме в редактора с истински клик в тялото на бележката (click-to-edit) - фокусът отива в
    // полето и приложението слага класа за мобилна клавиатура.
    await page.locator('#modal-body').first().click();
    await page.waitForTimeout(800);
    const before = await page.evaluate(NOTE);
    const editing = await page.evaluate(() => {
        const els = [...document.querySelectorAll('#note-windows-layer > .note-window')].filter(e => e.offsetWidth > 0 && !e.classList.contains('note-window-hidden'));
        const el = els[els.length - 1];
        return { active: document.activeElement ? document.activeElement.id : null, hasTextarea: !!(el && el.querySelector('#note-edit-textarea')), kbClass: !!(el && el.classList.contains('note-window-kb-top')) };
    });
    say('преди завъртане (в редактор):', { ...before, ...editing });
    if (editing.active !== 'note-edit-textarea' || !editing.kbClass) {
        console.log('   (полето не влезе в редакция в този контекст - проверката N4 се прескача)');
        ok('N4 бележката влиза в редакция (за проверката на клавиатурната подредба)', false, JSON.stringify(editing));
    } else {
        ok('N4 бележката е в редактор, полето е на фокус, класът за клавиатура е сложен',
            editing.active === 'note-edit-textarea' && editing.kbClass === true, JSON.stringify(editing));
        ok('N4 в редакция бележката е на горния ръб (подредбата от PR #130/#131)', before.top === 0, `top=${before.top}`);
        // Смяна на ШИРИНАТА, при която бележката още е "мобилна" (под 768): точно случаят, в който
        // завъртането би я преместило, ако не се прескача бележка в редакция. В 844 широка landscape
        // самият syncNoteKeyboardDock маха класа (широк екран), затова тук ширината е 500.
        await rotate(page, 500, 844);
        const after = await page.evaluate(NOTE);
        say('след смяна на ширината (още в редакция):', after);
        ok('N4 преподреждането при завъртане НЕ пипа бележка в режим на писане', after.top === 0, `top=${after.top} (беше 0)`);
        ok('N4 класът за клавиатура остава', after.kbTop === true, `kbTop=${after.kbTop}`);
        // А в истинска landscape ширина приложението само маха класа (широк екран, мишка) - бележката
        // се връща на запомненото си място, което се побира в 844x390.
        await rotate(page, 844, 390);
        const land = await page.evaluate(NOTE);
        say('след истинска landscape ширина:', land);
        ok('N4 в landscape бележката е цялата на екрана', inside(land, land.vw, land.vh), JSON.stringify(land));
    }
    ok('N4 без изключения в конзолата', errs.length === 0, errs.slice(0, 3).join(' | '));
    await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n${fails ? 'ПРОВАЛ' : 'ВСИЧКО МИНА'} (${checks - fails}/${checks})`);
process.exit(fails ? 1 : 0);
