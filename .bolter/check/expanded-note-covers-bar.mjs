// Разпъната бележка при отворена лента на бележките: хартията да стига до долния ръб (b3.38)
//
// Симптомът на собственика (31.10.2026): „отварям две бележки, максимизирам горната, текста на долната
// се появява под лентата, която е прозрачна“. Причината беше в style.css: разпънатата кутия се скъсяваше
// с височината на лентата (100% - --open-notes-bar-h - 8px), значи хартията свършваше 8px над лентата и
// под нея се виждаше каквото е отдолу - бордът с плочките и другата отворена бележка. Освен това
// правилото хващаше ВСИЧКИ прозорци: при две отворени бележки втората (несвита) ставаше 784 висока
// (100% от целия екран) и излизаше под екрана, точно под лентата.
//
// Какво проверява (истински Chromium, истинският uni код, засята IndexedDB, ?demo=1, мобилен контекст
// с докосване):
//   1) две отворени бележки, лентата се вижда;
//   2) след разпъване на активната: хартията стига до долния ръб на екрана (долен ръб = височината);
//   3) долният отстъп на кутията е поне височината на лентата + 8px;
//   4) редът с кръглите бутони (modal-footer-toolbar) е НАД лентата;
//   5) в ивицата на лентата най-горният елемент под лентата е хартията на разпънатата бележка - не
//      плочка от борда и не друга бележка;
//   6) другата отворена бележка пази собствения си размер (не се разтяга до екрана) и не излиза под
//      екрана;
//   7) след връщане в нормален размер бележката е пак 300 висока и отстъпът е 0;
//   8) при една отворена бележка (лентата я няма) хартията пак стига до долния ръб, отстъп 0;
//   9) същото на 1280x900;
//  10) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/expanded-note-covers-bar.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (за да се провери, че тестът хваща липсващата поправка).
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
    const body = Array.from({ length: 40 }, (_, i) => `❖ Ред ${i + 1}: дълъг текст за пробата, който пълни бележката.`).join('\n');
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
    return { boards: boards.length, notes: notes.length };
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
    const seed = await seedApp(page);
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        && document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    return { ctx, page, errs, seed, ready };
};

// Геометрия на екрана: разпънатата бележка, другата бележка, лентата, и какво стои под лентата.
const geo = (page) => page.evaluate(() => {
    const r = el => { const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
    const wins = [...document.querySelectorAll('.note-window.visible')].map(w => {
        const box = w.querySelector('.modal-content-box');
        const bodyEl = w.querySelector('.nw-modal-body');
        const foot = w.querySelector('.modal-footer-toolbar');
        const cs = box ? getComputedStyle(box) : null;
        return {
            active: w.classList.contains('note-window-active'),
            expanded: bodyEl ? bodyEl.dataset.isExpanded === 'true' : false,
            box: box ? r(box) : null,
            foot: foot ? r(foot) : null,
            padBottom: cs ? parseFloat(cs.paddingBottom) || 0 : 0,
            heightStyle: cs ? cs.height : ''
        };
    });
    const bar = document.getElementById('open-notes-bar') || document.querySelector('.open-notes-bar');
    const barShown = !!bar && getComputedStyle(bar).display !== 'none' && bar.getBoundingClientRect().height > 0;
    const barRect = barShown ? r(bar) : null;
    const barH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--open-notes-bar-h')) || 0;
    // Какво се вижда под лентата: първият елемент, който не е самата лента.
    let underBar = null;
    if (barRect) {
        for (const y of [barRect.top + 4, Math.round((barRect.top + innerHeight) / 2), innerHeight - 6]) {
            const stack = document.elementsFromPoint(innerWidth / 2, y)
                .filter(e => !bar.contains(e) && e !== bar)
                .slice(0, 3)
                .map(e => ({
                    cls: typeof e.className === 'string' ? e.className : '',
                    inBoard: !!e.closest('#notes-container'),
                    inWindow: !!e.closest('.note-window'),
                    inExpandedWin: !!e.closest('.note-window.note-window-active'),
                    isPaper: e.classList.contains('modal-content-box')
                }));
            if (!underBar) underBar = {};
            underBar['y' + y] = stack;
        }
    }
    const fabEl = document.getElementById('kb-fab');
    const fab = fabEl && fabEl.getBoundingClientRect().height > 0 ? r(fabEl) : null;
    return {
        vw: innerWidth, vh: innerHeight, bodyCls: document.body.className, barShown, barRect, barH, wins, underBar,
        fab, fabTranslate: fabEl ? getComputedStyle(fabEl).translate : '',
        fabLiftClass: document.body.classList.contains('modal-note-expanded-fab-lift'),
        paperWin: wins.find(w => w.expanded) || null
    };
});

const expandActive = (page) => page.evaluate(() => {
    const wins = [...document.querySelectorAll('.note-window.visible')];
    const top = wins.filter(w => w.classList.contains('note-window-active')).pop() || wins.pop();
    const btn = top.querySelector('.nw-modal-expand-btn');
    if (!btn) return false;
    btn.click();
    return true;
});

// Втората бележка се отваря с истинско натискане върху плочка, която НЕ е зад вече отворения прозорец
// (прозорецът стои по средата и покрива част от списъка). Ако такава плочка няма на екрана, списъкът се
// превърта и се търси пак - иначе тестът зависи от подредбата и пада случайно.
const openTwoNotes = async (page) => {
    await page.locator('#notes-container .note').first().click();
    await page.waitForTimeout(700);
    for (let attempt = 0; attempt < 4; attempt++) {
        const spot = await page.evaluate(() => {
            const boxes = [...document.querySelectorAll('.note-window.visible .modal-content-box')]
                .map(b => b.getBoundingClientRect());
            const card = [...document.querySelectorAll('#notes-container .note')].slice(1).find(c => {
                const r = c.getBoundingClientRect();
                if (r.height === 0 || r.bottom < 0 || r.top > innerHeight) return false;
                return !boxes.some(w => r.bottom > w.top && r.top < w.bottom);
            });
            if (!card) return null;
            const r = card.getBoundingClientRect();
            return { x: Math.round(r.x + Math.min(r.width / 2, 80)), y: Math.round(r.y + Math.min(r.height / 2, 24)) };
        });
        if (spot) {
            await page.mouse.click(spot.x, spot.y);
            await page.waitForTimeout(900);
            if (await page.evaluate(() => document.querySelectorAll('.note-window.visible').length) >= 2) break;
        }
        await page.evaluate(() => { const c = document.getElementById('notes-container'); if (c) c.scrollBy(0, 320); });
        await page.waitForTimeout(400);
    }
    return page.evaluate(() => document.querySelectorAll('.note-window.visible').length);
};

// Проверките за „хартията стига до долния ръб“ - едни и същи за 390 и за 1280.
const checkPaperCoversBar = (g, tag) => {
    const paper = g.paperWin;
    ok(!!paper, `${tag}: има разпъната бележка`, g.wins.map(w => w.expanded));
    if (!paper) return;
    ok(Math.abs(paper.box.bottom - g.vh) <= 1, `${tag}: хартията на разпънатата бележка стига до долния ръб`, { bottom: paper.box.bottom, vh: g.vh });
    ok(paper.padBottom >= g.barH + 8 - 1, `${tag}: долният отстъп е поне височината на лентата + 8`, { padBottom: paper.padBottom, barH: g.barH });
    ok(g.barShown && !!paper.foot && paper.foot.bottom <= g.barRect.top + 1, `${tag}: редът с кръглите бутони е над лентата`, { foot: paper.foot, bar: g.barRect });
    // Под лентата: само хартията на разпънатата бележка, нищо от борда и нищо от друга бележка.
    const stacks = Object.entries(g.underBar || {});
    const bad = stacks.filter(([, st]) => !(st[0] && st[0].isPaper && st[0].inExpandedWin));
    ok(stacks.length > 0 && bad.length === 0, `${tag}: под лентата стои само хартията на разпънатата бележка`, bad.slice(0, 2));
    // Иконата на асистента: отстъп при разпъната бележка и без застъпване с реда с бутоните.
    ok(g.fabLiftClass, `${tag}: иконата на асистента е с отстъп при разпъната бележка`, { cls: g.bodyCls, fab: g.fab });
    ok(!!g.fab && !!paper.foot && g.fab.bottom <= paper.foot.top + 1, `${tag}: иконата не застава върху реда с бутоните на бележката`, { fab: g.fab, foot: paper.foot });
};

// ---------------------------------------------------------------- 1) 390x844, две бележки
{
    const { ctx, page, errs, seed, ready } = await newPage(390, 844);
    ok(seed.boards === 6 && seed.notes === 12, '1: базата е засята преди старта (6 борда, 12 бележки)', seed);
    ok(ready, '1: приложението стартира с бележки на екрана');

    const opened = await openTwoNotes(page);
    const before = await geo(page);
    ok(opened === 2 && before.wins.length === 2, '1: две бележки са отворени', before.wins.length);
    ok(before.barShown, '1: лентата на отворените бележки се вижда преди разпъването');
    ok(before.fabLiftClass === false && before.fabTranslate === 'none', '1: без разпъната бележка иконата не е отместена', { lift: before.fabLiftClass, tr: before.fabTranslate });

    ok(await expandActive(page), '1: бутонът за разпъване е намерен и натиснат');
    await page.waitForTimeout(900);
    const after = await geo(page);
    ok(after.bodyCls.includes('modal-note-expanded'), '1: тялото е с класа за разпъната бележка', after.bodyCls);
    checkPaperCoversBar(after, '1');

    // Другата бележка не се разтяга до екрана (на b3.36 ставаше 784 висока и излизаше под екрана).
    const other = after.wins.find(w => !w.expanded);
    ok(!!other && other.box.h <= 320, '1: другата отворена бележка пази собствения си размер', other && other.box);
    ok(!!other && other.box.bottom <= after.vh, '1: другата бележка не излиза под екрана', other && other.box);

    // Връщане в нормален размер: пак 300 и без долен отстъп.
    await expandActive(page);
    await page.waitForTimeout(900);
    const restored = await geo(page);
    const back = restored.wins.find(w => w.active);
    ok(!!back && Math.abs(back.box.h - 300) <= 2, '1: след връщане бележката е пак 300 висока', back && back.box);
    ok(!!back && back.padBottom === 0, '1: след връщане няма долен отстъп', back && back.padBottom);

    await page.screenshot({ path: path.join('.bolter/check', 'expanded-note-covers-bar-390.png') });
    ok(errs.length === 0, '1: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------------------------------------------------------------- 2) една бележка: лентата я няма
{
    const { ctx, page, errs, ready } = await newPage(390, 844);
    ok(ready, '2: приложението стартира с бележки на екрана');
    await page.locator('#notes-container .note').first().click();
    await page.waitForTimeout(900);
    ok(await expandActive(page), '2: бутонът за разпъване е намерен и натиснат');
    await page.waitForTimeout(700);
    const g = await geo(page);
    const paper = g.paperWin;
    ok(g.barShown === false, '2: лентата я няма при една отворена бележка', g.barShown);
    ok(!!paper && Math.abs(paper.box.bottom - g.vh) <= 1, '2: хартията стига до долния ръб и без лента', paper && paper.box);
    ok(!!paper && paper.padBottom === 0, '2: без лента няма долен отстъп', paper && paper.padBottom);
    ok(g.fabLiftClass, '2: иконата на асистента е с отстъп и без лента', { cls: g.bodyCls });
    ok(!!g.fab && !!paper && !!paper.foot && g.fab.bottom <= paper.foot.top + 1, '2: иконата не застава върху реда с бутоните и без лента', { fab: g.fab, foot: paper && paper.foot });
    ok(errs.length === 0, '2: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------------------------------------------------------------- 3) широк екран 1280x900
{
    const { ctx, page, errs, ready } = await newPage(1280, 900);
    ok(ready, '3: приложението стартира с бележки на екрана');
    const opened = await openTwoNotes(page);
    ok(opened === 2, '3: две бележки са отворени', opened);
    ok(await expandActive(page), '3: бутонът за разпъване е намерен и натиснат');
    await page.waitForTimeout(900);
    const g = await geo(page);
    checkPaperCoversBar(g, '3');
    await page.screenshot({ path: path.join('.bolter/check', 'expanded-note-covers-bar-1280.png') });
    ok(errs.length === 0, '3: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

await browser.close();
srv.close();
console.log(fails === 0 ? `ALL OK (${n})` : `FAILED (${fails}/${n})`);
process.exit(fails === 0 ? 0 : 1);
