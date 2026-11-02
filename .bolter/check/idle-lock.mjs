// Заключване след бездействие (b3.48): приложението вдига защитния екран сам, когато известно
// време никой не го пипа — за да не може кадърът, който Android пази за списъка с приложенията,
// да покаже бележките.
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1, мобилен контекст 390x844,
// преместен часовник — нищо не чака 30 истински секунди):
//   1) в Настройки има ред „Заключване след“ под „Автоматична защита“, по подразбиране 30 s;
//   2) заключва след избраното време и не по-рано (по подразбиране 30 s);
//   3) 15 и 60 се четат от запаметеното (localStorage privacyIdleLock);
//   4) докосване, клавиш и скролване нулират брояча;
//   5) заключеният от брояча екран се маха само с бутона „Затвори“ (докосване, клавиш и скрол
//      по него не го махат), докато екранът от blur се държи както в b3.43 (маха се при фокус);
//   6) отворен системен избор (поле за файл) не заключва;
//   7) изключена „Автоматична защита“ не заключва;
//   8) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/idle-lock.mjs   (exit 1 при провал)
// UNI_ROOT=… сочи друга папка на приложението — за контролен пуск срещу стария код (b3.43),
// където проверките 2–4 трябва да се провалят.
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

const root = path.resolve(process.env.UNI_ROOT || process.env.ROOT || 'uni');
const PAGE = process.env.UNI_PAGE || 'index.html';
const W = 390, H = 844;

if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
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
const ORIGIN = `http://localhost:${srv.address().port}`;

let fails = 0, n = 0;
// Коя стъпка тече в момента — за да се вижда откъде идва грешка в конзолата.
let step = 'старт';
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

const browser = await chromium.launch({ executablePath: CHROME });

// appScreen=true подменя само display-mode заявките, за да се държи страницата като инсталирано
// приложение (Playwright не пуска истински standalone прозорец).
const openApp = async ({ idleLock = null, autoProtect = true, appScreen = true, stubFocus = false } = {}) => {
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        serviceWorkers: 'block'
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(`[${step}] ` + String(e.stack || e.message).split('\n').slice(0, 3).join(' | ').slice(0, 400)));
    page.on('console', m => { if (m.type() === 'error') errs.push(`[${step}] console: ` + m.text().slice(0, 200)); });

    // Часовникът се мести от теста: проверките не чакат 30 истински секунди.
    await page.clock.install({ time: new Date('2026-11-02T11:07:00Z') });
    await page.addInitScript(({ appScreen, idleLock, autoProtect, stubFocus }) => {
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
        localStorage.setItem('lang', 'bg');
        localStorage.setItem('hideAssistant', 'true');
        if (idleLock) localStorage.setItem('privacyIdleLock', idleLock);
        if (autoProtect === false) localStorage.setItem('privacyAutoProtect', 'false');
        // Фокусът се управлява от теста, за да се покаже отворен системен избор.
        if (stubFocus) {
            window.__focus = true;
            window.__setFocus = (v) => { window.__focus = v; };
            document.hasFocus = () => window.__focus;
        }
        const orig = window.matchMedia.bind(window);
        window.matchMedia = (q) => {
            if (appScreen && /display-mode:\s*(standalone|fullscreen|minimal-ui)/.test(String(q))) {
                return { matches: true, media: String(q), onchange: null, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { }, dispatchEvent() { return false; } };
            }
            return orig(q);
        };
    }, { appScreen, idleLock, autoProtect, stubFocus });

    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        || document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    await page.waitForTimeout(1500);
    // Оттук нататък времето минава само с advance(): часовникът е спрян.
    await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 20));
    return { ctx, page, errs, ready };
};

// Грешките в конзолата, които имат значение за тази работа. msm.js (модулът на асистента) хвърля
// при зареждане на картинка, преди контейнерът му да е строен; със спрения в теста часовник това
// е по-вероятно. Същата грешка излиза и на стария код b3.43 при същите стъпки (контролен пуск с
// UNI_ROOT), значи не идва от заключването — затова не се брои за провал.
const realErrs = (errs) => errs.filter(e => !(/msm\.js/.test(e) && /updatePosition|startPositioning/.test(e)));

// Състоянието на защитния екран се чете без изчакване.
const state = (page) => page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    if (!ov) return { present: false, visible: false, tiles: [] };
    const cs = getComputedStyle(ov);
    const tiles = [...ov.querySelectorAll('.privacy-tile')].map(t => Math.round(t.getBoundingClientRect().width));
    return {
        present: true,
        visible: cs.display !== 'none' && cs.visibility !== 'hidden',
        display: cs.display,
        tiles
    };
});

// Предсъществуващ шум от msm.js: таймер, който гърми, когато спреният от теста часовник го пусне
// (същото излиза и на стария код b3.43 — виж realErrs). Брои се, за да се вижда, че го е имало.
let knownMsmThrows = 0;
const isKnownMsm = (e) => {
    const s = String((e && e.stack) || e);
    return /msm\.js/.test(s) && /updatePosition|startPositioning/.test(s);
};

// Мести часовника. Грешката на msm.js се пропуска, за да не спира контролния пуск; часовникът се
// мести още малко, за да има шанс броячът да прецени наново.
const advance = async (page, ms) => {
    try {
        await page.clock.fastForward(ms);
    } catch (e) {
        if (!isKnownMsm(e)) throw e;
        knownMsmThrows++;
        await page.clock.fastForward(1100).catch(() => { });
    }
};

// Активност без истинско докосване: същите събития, които стигат до слушателите.
// 'scroll' се пуска върху вътрешен елемент — такъв скрол не изплува до документа, значи
// проверява, че слушателят е във фаза прихващане.
const doActivity = (page, type = 'touchstart') => page.evaluate((t) => {    const el = document.body;
    let ev;
    if (t === 'scroll') {
        // Скролът се пуска върху истински контейнер с бележки, не върху body: слушателят е във
        // фаза прихващане и хваща и скрол, който не изплува до документа.
        const inner = document.getElementById('notes-container') || el;
        inner.dispatchEvent(new Event('scroll'));
        return true;
    }
    if (t === 'keydown') {
        ev = new KeyboardEvent('keydown', { key: 'Shift', code: 'ShiftLeft', bubbles: true });
    } else {
        // Истинско докосване има поне една точка; приложението чете touches[0].
        const touch = new Touch({ identifier: 1, target: el, clientX: 10, clientY: 10, screenX: 10, screenY: 10, pageX: 10, pageY: 10, radiusX: 1, radiusY: 1, force: 1 });
        ev = new TouchEvent(t, { bubbles: true, touches: [touch], targetTouches: [touch], changedTouches: [touch] });
    }
    el.dispatchEvent(ev);
    return true;
}, type);

const activity = (page, type = 'touchstart') => { step = 'активност ' + type; return doActivity(page, type); };

const closeOverlay = (page) => page.evaluate(() => {
    const btn = document.querySelector('#privacy-overlay .privacy-close');
    if (!btn) return { clicked: false, visible: null };
    btn.click();
    const ov = document.getElementById('privacy-overlay');
    return { clicked: true, visible: ov ? getComputedStyle(ov).display !== 'none' : null };
});

const blurNow = (page) => page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    const ov = document.getElementById('privacy-overlay');
    return { visible: ov ? getComputedStyle(ov).display !== 'none' : false };
});
const goHidden = (page) => page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
});
const goVisible = (page) => page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
});
const focusNow = (page) => page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    const ov = document.getElementById('privacy-overlay');
    return { visible: ov ? getComputedStyle(ov).display !== 'none' : false };
});

// Отваря Настройки. Класът се слага директно: в този тестов режим копчето в хедъра може вече
// да е пресъздадено и слушателят му да не хване синтетичния клик, а тук се проверява редът в
// Настройки (и че се побира), не отварянето на модала — то си има свои тестове.
const openSettings = async (page) => {
    const open = await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        if (!m) return false;
        m.classList.add('visible');
        return getComputedStyle(m).display !== 'none';
    });
    await page.waitForTimeout(400);
    return open;
};

const idleRow = (page) => page.evaluate(() => {
    const row = document.getElementById('idle-lock');
    if (!row) return { present: false };
    const label = row.querySelector('label');
    const sel = document.getElementById('idle-lock-select');
    const prev = row.previousElementSibling;
    const box = document.querySelector('#settings-modal .modal-content-box') || row.parentElement;
    const rr = sel ? sel.getBoundingClientRect() : null;
    const br = box ? box.getBoundingClientRect() : null;
    return {
        present: true,
        prevId: prev ? prev.id : null,
        label: label ? label.textContent.trim() : null,
        dataKey: label ? label.getAttribute('data-key') : null,
        labelShown: label ? getComputedStyle(label).display !== 'none' : false,
        value: sel ? sel.value : null,
        options: sel ? [...sel.options].map(o => o.value) : null,
        title: sel ? sel.getAttribute('title') : null,
        stored: localStorage.getItem('privacyIdleLock'),
        // Редът не бива да прелива: селектът остава в кутията на Настройки и няма хоризонтален скрол.
        overflow: row.scrollWidth - row.clientWidth,
        selectInside: !!(rr && br && rr.right <= br.right + 1 && rr.left >= br.left - 1)
    };
});

// ---------- 1) Редът в Настройки и заключване след 30 s по подразбиране ----------
{
    const { ctx, page, errs, ready } = await openApp({});
    ok(ready, '1. приложението тръгна');

    await openSettings(page);
    const row = await idleRow(page);
    ok(row.present, '1.1 редът „Заключване след“ е в Настройки', row);
    ok(row.prevId === 'auto-protect', '1.2 редът е точно под „Автоматична защита“', row);
    ok(row.dataKey === 'idleLockLabel' && /Заключване след/.test(row.label || ''), '1.3 етикетът е преведен на български', row);
    ok(/заключва/.test(row.title || ''), '1.4 подсказката е преведена (вторият i18n ключ)', { title: row.title });
    ok(JSON.stringify(row.options) === JSON.stringify(['10', '15', '30', '60']), '1.5 изборът е 10 / 15 / 30 / 60', { options: row.options });
    ok(row.value === '30', '1.6 по подразбиране е 30 секунди', { value: row.value });
    ok(row.labelShown && row.overflow <= 1 && row.selectInside, '1.7 редът се побира в Настройки на 390 px', row);

    const st0 = await state(page);
    ok(!st0.visible, '1.8 при пускане защитният екран не е вдигнат', st0);

    // Часовникът: докосване сега, после 29 s и още 2 s.
    await activity(page, 'touchstart');
    await advance(page, 29000);
    ok(!(await state(page)).visible, '2.1 на 29 s без докосване още не е заключено');
    await advance(page, 2000);
    const locked = await state(page);
    ok(locked.visible, '2.2 след 30 s без докосване екранът се заключва сам', locked);
    ok(locked.tiles.length === 2 && locked.tiles.every(w => w === 300), '2.3 заключеният екран е същият: две плочки 300x300', locked);

    // ---------- 5) само бутонът „Затвори“ маха екрана, вдигнат от брояча ----------
    await page.touchscreen.tap(195, 400);              // истинско докосване по заключения екран
    ok((await state(page)).visible, '5.1 истинско докосване по заключения екран не го маха');
    step = 'клавиш по заключения екран';
    await activity(page, 'keydown');
    ok((await state(page)).visible, '5.2 клавиш не маха заключения екран');
    step = 'скрол по заключения екран';
    await activity(page, 'scroll');
    ok((await state(page)).visible, '5.3 скрол не маха заключения екран');
    step = 'затваряне на заключения екран';
    const closed = await closeOverlay(page);
    ok(closed.clicked && !closed.visible, '5.4 бутонът „Затвори“ маха заключения екран', closed);

    // ---------- 4) докосване, клавиш и скрол нулират брояча ----------
    await advance(page, 25000);
    ok(!(await state(page)).visible, '4.1 на 25 s след затварянето още не е заключено');
    await activity(page, 'touchstart');
    await advance(page, 25000);                          // общо 50 s, но само 25 s след докосването
    ok(!(await state(page)).visible, '4.2 докосването нулира брояча (50 s общо, 25 s след него)');
    await advance(page, 6000);                           // 31 s след докосването
    ok((await state(page)).visible, '4.3 заключва 31 s след последното докосване');
    await closeOverlay(page);

    await activity(page, 'keydown');
    await advance(page, 25000);
    await activity(page, 'keydown');
    await advance(page, 25000);
    ok(!(await state(page)).visible, '4.4 клавишът също нулира брояча');
    await closeOverlay(page);

    await activity(page, 'scroll');
    await advance(page, 25000);
    await activity(page, 'scroll');
    await advance(page, 25000);
    ok(!(await state(page)).visible, '4.5 скролът също нулира брояча (слушател във фаза прихващане)');

    // ---------- b3.50: при излизане не се вдига нищо (само броячът и логото вдигат) ----------
    await closeOverlay(page);
    const b1 = await blurNow(page);
    ok(!b1.visible, '9.1 blur не вдига защитния екран (b3.50: няма го примигването при излизане)', b1);
    await goHidden(page);
    ok(!(await state(page)).visible, '9.2 скриването на страницата също не вдига екран (b3.50)');
    const f1 = await focusNow(page);
    ok(!f1.visible, '9.3 фокусът не вдига нищо', f1);
    await goVisible(page);
    await closeOverlay(page);

    ok(realErrs(errs).length === 0, '8.1 няма изключения в конзолата', realErrs(errs));
    await ctx.close();
}

// ---------- 3a) 15 секунди се четат от запаметеното ----------
{
    const { ctx, page, errs, ready } = await openApp({ idleLock: '15' });
    ok(ready, '3a. приложението тръгна с 15 s');
    await openSettings(page);
    const row = await idleRow(page);
    ok(row.value === '15', '3a.1 изборът показва запаметените 15 s', row);

    await activity(page, 'touchstart');
    await advance(page, 14000);
    ok(!(await state(page)).visible, '3a.2 на 14 s още не е заключено');
    await advance(page, 2000);
    ok((await state(page)).visible, '3a.3 на 16 s е заключено');
    ok(realErrs(errs).length === 0, '3a.4 няма изключения в конзолата', realErrs(errs));
    await ctx.close();
}

// ---------- 3b) 60 секунди се четат от запаметеното ----------
{
    const { ctx, page, errs, ready } = await openApp({ idleLock: '60' });
    ok(ready, '3b. приложението тръгна с 60 s');
    await activity(page, 'touchstart');
    await advance(page, 45000);
    ok(!(await state(page)).visible, '3b.1 на 45 s още не е заключено');
    await advance(page, 14000);                          // 59 s
    ok(!(await state(page)).visible, '3b.2 на 59 s още не е заключено');
    await advance(page, 2000);                           // 61 s
    ok((await state(page)).visible, '3b.3 на 61 s е заключено');
    ok(realErrs(errs).length === 0, '3b.4 няма изключения в конзолата', realErrs(errs));
    await ctx.close();
}

// ---------- 6) отворен системен избор не заключва ----------
{
    const { ctx, page, errs, ready } = await openApp({ idleLock: '15', stubFocus: true });
    ok(ready, '6. приложението тръгна');
    await page.evaluate(() => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.id = 'test-file-picker';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.evaluate(() => { window.__setFocus(false); window.dispatchEvent(new Event('blur')); });
    await advance(page, 40000);
    ok(!(await state(page)).visible, '6.1 40 s с отворен системен избор не заключва');
    await page.evaluate(() => { window.__setFocus(true); window.dispatchEvent(new Event('focus')); });
    ok(!(await state(page)).visible, '6.2 след системния избор бележките са отпред (b3.43)');
    await activity(page, 'touchstart');
    await advance(page, 14000);
    ok(!(await state(page)).visible, '6.3 след него броячът брои наново (14 s)');
    await advance(page, 2000);
    ok((await state(page)).visible, '6.4 и заключва на 16 s');
    ok(realErrs(errs).length === 0, '6.5 няма изключения в конзолата', realErrs(errs));
    await ctx.close();
}

// ---------- 7) изключена „Автоматична защита“ не заключва ----------
{
    const { ctx, page, errs, ready } = await openApp({ idleLock: '15', autoProtect: false });
    ok(ready, '7. приложението тръгна с изключена автоматична защита');
    await activity(page, 'touchstart');
    await advance(page, 60000);
    ok(!(await state(page)).visible, '7.1 изключена настройка не заключва и след 60 s');
    const b = await blurNow(page);
    ok(!b.visible, '7.2 и blur не вдига защитния екран (един ключ, не два)', b);
    ok(realErrs(errs).length === 0, '7.3 няма изключения в конзолата', realErrs(errs));
    await ctx.close();
}

// ---------- 10) обикновен таб: броячът не заключва ----------
{
    const { ctx, page, errs, ready } = await openApp({ idleLock: '15', appScreen: false });
    ok(ready, '10. приложението тръгна в обикновен таб');
    await activity(page, 'touchstart');
    await advance(page, 30000);
    ok(!(await state(page)).visible, '10.1 в обикновен таб броячът не заключва');
    ok(realErrs(errs).length === 0, '10.2 няма изключения в конзолата', realErrs(errs));
    await ctx.close();
}

await browser.close();
srv.close();

console.log(`\n${n - fails}/${n} проверки минават (${root})`);
if (knownMsmThrows) console.log(`(пропуснати ${knownMsmThrows} предсъществуващи грешки от msm.js при местенето на часовника)`);
console.log(fails === 0 ? 'OK' : 'FAILED');
process.exit(fails === 0 ? 0 : 1);
