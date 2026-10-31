// При зареждане менюто с бордовете да излиза вече с избран борд — без „излишно кликване“.
//
// Симптомът на собственика: след като лентата плъзне до активния борд, бутонът му сякаш се
// натиска сам. Причината: менюто се построява и се показва БЕЗ избран борд, а 50 мс по-късно
// renderUI натиска програмно стартовия бутон — той получава класовете, бялата рамка и 39px
// височина вече след първата картина. Затова се вижда „щракване“ без пръст.
//
// Какво проверява (истински Chromium, истинският uni код, засята IndexedDB, ?demo=1, мобилен
// контекст с докосване 390x844, две начала: борд, който се вижда отначало, и такъв извън екрана):
//   1) в НИТО един кадър, в който менюто е на екрана, няма кадър без избран борд;
//   2) след първата картина на менюто нито един борд-бутон не сменя клас или височина —
//      тоест няма „натискане“ след появата;
//   3) избраният борд е точно стартовият, и след като лентата спре, той е в средата;
//   4) началният екран не се чупи: бележките са на екрана, няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/board-press-on-load.mjs   (exit 1 при провал)
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
const PAGE = process.env.UNI_PAGE || 'index.html';
const SEED_PATH = '/__seed.html';
const W = 390, H = 844;
const NOTES_TOTAL = 12;
// Колко близо до средата трябва да е избраният бутон, след като лентата спре.
const CENTRE_TOL = 20;

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

// Засяването става в СЪЩИЯ контекст, в който после се отваря приложението: IndexedDB живее в
// профила на контекста и при затваряне изчезва. Затова всеки сценарий засява първо, после влиза.
const seedApp = async (page) => {
    await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
    return page.evaluate(async () => {
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
        let k = 0;
        for (const b of boards) {
            for (let j = 1; j <= 2; j++) {
                k++;
                notes.push({
                    alarm_type: -1, boardid: b.gdid, calendarDate: 0, color: 0,
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
        return { boards: boards.length, notes: notes.length };
    });
};

const runScenario = async (startBoard, label) => {
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
        localStorage.setItem('showBoardAll', 'true');
    });
    await page.addInitScript((b) => { localStorage.setItem('startBoard', b); }, startBoard);

    // Времева линия по кадри: състоянието на менюто и на избрания бутон, плюс всяка промяна по
    // клас/височина на борд-бутон в хедъра.
    await page.addInitScript(() => {
        const trace = window.__trace = [];
        const rec = (k, x) => { if (trace.length < 6000) trace.push([Math.round(performance.now()), k, x]); };
        const tick = () => {
            const menu = document.querySelector('header .board-menu-container');
            const act = menu ? menu.querySelectorAll('.board-filter-link.active') : [];
            const box = menu ? menu.getBoundingClientRect() : null;
            rec('f', {
                n: menu ? menu.children.length : 0,
                menu: menu ? Math.round(menu.scrollLeft) : null,
                box: box ? [Math.round(box.left), Math.round(box.right)] : null,
                act: act.length,
                bid: act[0] ? act[0].dataset.boardid : null,
                h: act[0] ? Math.round(act[0].getBoundingClientRect().height) : null,
                r: act[0] ? [Math.round(act[0].getBoundingClientRect().left), Math.round(act[0].getBoundingClientRect().right)] : null
            });
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        const watch = () => {
            new MutationObserver(list => list.forEach(m => {
                const t = m.target;
                if (!t || !t.classList || !t.classList.contains('board-filter-link')) return;
                if (!t.closest || !t.closest('header .board-menu-container')) return;
                rec('mut', { bid: t.dataset.boardid, attr: m.attributeName, cls: t.className.replace('board-filter-link', '').trim(), inl: t.style.height || '' });
            })).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['class', 'style'] });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
    });

    const seed = await seedApp(page);
    ok(seed.boards === 6 && seed.notes === NOTES_TOTAL, `${label}: базата е засята преди старта (6 борда, ${NOTES_TOTAL} бележки)`, seed);
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        && document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    await page.waitForTimeout(2500);
    const trace = await page.evaluate(() => window.__trace.slice());
    const shown = await page.evaluate(() => document.querySelectorAll('#notes-container .note').length);
    await ctx.close();

    const frames = trace.filter(t => t[1] === 'f' && t[2].n > 0);
    const muts = trace.filter(t => t[1] === 'mut');
    console.log(`\n--- ${label}: менюто се показва с ${frames.length ? frames[0][2].n : 0} бутона`);

    // 1) Нито един кадър с показано меню и нула избрани борда.
    const blank = frames.filter(f => f[2].act === 0);
    ok(blank.length === 0, `${label}: няма кадър с меню без избран борд`, blank.slice(0, 5).map(f => `${f[0]}ms n=${f[2].n}`));

    // 2) Никаква промяна по клас/височина след първата картина на менюто. Гледаме само промени,
    //    които правят бутон избран (клас active/selected-board или 39px) — служебните квадрати
    //    (Резултати, Кошче) се показват и скриват по друго време и не са „натискане“.
    const firstPaint = frames.length ? frames[0][0] : Infinity;
    const after = muts.filter(m => m[0] > firstPaint
        && (/(^|\s)(selected-board|active)(\s|$)/.test(m[2].cls) || m[2].inl === '39px'));
    ok(after.length === 0, `${label}: след появата на менюто бутоните не сменят клас/височина (няма „натискане“)`,
        after.slice(0, 6).map(m => `${m[0]}ms ${m[2].bid} ${m[2].attr} "${m[2].cls}" h=${m[2].inl}`));

    // 3) Избраният борд е стартовият и е в средата, след като лентата спре.
    const last = frames.length ? frames[frames.length - 1][2] : null;
    ok(!!last && String(last.bid) === String(startBoard) && last.act === 1,
        `${label}: избран е стартовият борд ${startBoard}`, last && { bid: last.bid, act: last.act });
    const centred = !!(last && last.r && last.box
        && Math.abs((last.r[0] + last.r[1]) / 2 - (last.box[0] + last.box[1]) / 2) <= CENTRE_TOL);
    ok(centred, `${label}: лентата е спряла с избрания борд в средата`, last && { r: last.r, box: last.box });

    // 4) Началният екран е наред.
    ok(ready && shown >= 1 && errs.length === 0, `${label}: бележките са на екрана и няма изключения`, { ready, shown, errs: errs.slice(0, 3) });
};

// Борд, който се вижда отначало (втори в менюто) — там „щракването“ беше най-видимо.
await runScenario('b2', 'стартов борд b2 (вижда се отначало)');
// Борд извън екрана — трябва да има плавно плъзване до него, но пак без натискане.
await runScenario('b5', 'стартов борд b5 (извън екрана)');

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? 'FAILED' : 'OK');
process.exit(fails ? 1 : 0);
