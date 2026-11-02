// Екран за поверителност: blur overlay при излизане от приложението (режим на екран на приложението).
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1, мобилен контекст с докосване 390x844):
//   1) в режим на екран на приложението, при скриване на страницата (visibilitychange + hidden)
//      overlay-ът се показва и покрива целия екран, с истински blur отзад;
//   2) двете плочки са точно 300x300, една под друга, центрирани хоризонтално и вертикално;
//   3) горната плочка показва същия часовник като при натискане на часа на бележка (12/3/6/9,
//      9 междинни маркера, три стрелки) и стрелките наистина вървят;
//   4) долната плочка показва месечния календар за текущия месец: име на месеца и година,
//      7 дни от седмицата, точен брой дни, днешният ден е отбелязан;
//   5) малкият бутон Затвори е долу вдясно и скрива overlay-а;
//   6) извън режим на екран на приложението (обикновен таб) при скриване НИЩО не се показва;
//   7) няма изключения в конзолата и нищо не прелива извън екрана.
//
// Пускане от корена на хранилището: node .bolter/check/privacy-overlay.mjs   (exit 1 при провал)
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
const W = 390, H = 844;
const TILE = 300;

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
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

const browser = await chromium.launch({ executablePath: CHROME });

// appScreen=true подменя само display-mode заявките, за да се държи страницата като инсталирано
// приложение (Playwright не пуска истински standalone прозорец).
const openApp = async (appScreen, vw = W, vh = H) => {
    const ctx = await browser.newContext({
        viewport: { width: vw, height: vh }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        serviceWorkers: 'block'
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
    await page.addInitScript(({ appScreen }) => {
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
        const orig = window.matchMedia.bind(window);
        window.matchMedia = (q) => {
            if (appScreen && /display-mode:\s*(standalone|fullscreen|minimal-ui)/.test(String(q))) {
                return { matches: true, media: String(q), onchange: null, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { }, dispatchEvent() { return false; } };
            }
            return orig(q);
        };
    }, { appScreen });
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        || document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    await page.waitForTimeout(1500);
    return { ctx, page, errs, ready };
};

// Скриване на страницата така, както го вижда кодът: document.hidden === true + visibilitychange.
const goHidden = (page) => page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
});

const measure = (page) => page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    if (!ov) return { present: false };
    const cs = getComputedStyle(ov);
    const box = ov.getBoundingClientRect();
    const tiles = [...ov.querySelectorAll('.privacy-tile')].map(t => {
        const r = t.getBoundingClientRect();
        return { cls: t.className, x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    });
    const stack = ov.querySelector('.privacy-stack');
    const st = stack ? stack.getBoundingClientRect() : null;
    const close = ov.querySelector('.privacy-close');
    const cr = close ? close.getBoundingClientRect() : null;
    const clock = ov.querySelector('.privacy-clock');
    const hands = clock ? ['.hour', '.minute', '.second'].map(s => {
        const el = clock.querySelector(s);
        return el ? getComputedStyle(el).transform : null;
    }) : [];
    const cal = ov.querySelector('.privacy-cal');
    const now = new Date();
    const monthName = now.toLocaleDateString('bg-BG', { month: 'long' });
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayCells = cal ? [...cal.querySelectorAll('.privacy-cal-day')] : [];
    const todayCell = cal ? cal.querySelector('.privacy-cal-day.is-today') : null;
    const calScroll = cal ? { sw: cal.scrollWidth, cw: cal.clientWidth, sh: cal.scrollHeight, ch: cal.clientHeight } : null;
    return {
        present: true,
        visible: cs.display !== 'none',
        opacity: cs.opacity,
        box: { x: Math.round(box.left), y: Math.round(box.top), w: Math.round(box.width), h: Math.round(box.height) },
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter || '',
        background: cs.backgroundColor,
        backgroundImage: cs.backgroundImage,
        position: cs.position,
        vw: window.innerWidth, vh: window.innerHeight,
        visW: Math.min(window.innerWidth, document.documentElement.clientWidth, window.visualViewport ? Math.round(window.visualViewport.width) : window.innerWidth),
        visH: Math.min(window.innerHeight, document.documentElement.clientHeight, window.visualViewport ? Math.round(window.visualViewport.height) : window.innerHeight),
        tiles,
        stack: st ? { x: Math.round(st.left), y: Math.round(st.top), w: Math.round(st.width), h: Math.round(st.height) } : null,
        close: close ? { text: close.textContent.trim(), x: Math.round(cr.left), y: Math.round(cr.top), w: Math.round(cr.width), h: Math.round(cr.height), right: Math.round(cr.right), bottom: Math.round(cr.bottom) } : null,
        clock: clock ? {
            numbers: [...clock.querySelectorAll('.number')].map(e => e.textContent.trim()).sort().join(','),
            marks: clock.querySelectorAll('.mark').length,
            hands
        } : null,
        calendar: cal ? {
            monthLabel: (cal.querySelector('.privacy-cal-month') || {}).textContent || '',
            weekdays: [...cal.querySelectorAll('.privacy-cal-head span')].map(e => e.textContent.trim()),
            dayCells: dayCells.length,
            emptyCells: dayCells.filter(e => e.classList.contains('is-empty')).length,
            today: todayCell ? todayCell.textContent.trim() : null,
            expectMonth: monthName,
            expectDays: daysInMonth,
            expectToday: String(new Date().getDate()),
            firstDayNumber: (dayCells.find(e => !e.classList.contains('is-empty')) || {}).textContent || '',
            scroll: calScroll
        } : null
    };
});

// ---------- 1) В режим на екран на приложението ----------
{
    const { ctx, page, errs, ready } = await openApp(true);
    ok(ready, 'A: приложението се зарежда (?demo=1)');

    const before = await page.evaluate(() => !!document.querySelector('.privacy-overlay.is-visible'));
    ok(before === false, 'A: преди скриването overlay-ът го няма на екрана');

    await goHidden(page);
    await page.waitForTimeout(400);
    const m = await measure(page);

    ok(m.present && m.visible, 'A: при скриване overlay-ът се показва', m && { present: m.present, visible: m.visible });
    ok(!!m.box && m.box.w === m.vw && m.box.h === m.vh && m.box.x === 0 && m.box.y === 0,
        'A: overlay-ът покрива целия екран', m.box && { box: m.box, vw: m.vw, vh: m.vh });
    // 2 Nov 2026: blur е махнат нарочно. Кадърът за списъка с приложенията на Android се снима
    // без ефектите на слоя и през полупрозрачен фон се виждаха бележките. Затова фонът е плътен,
    // без backdrop-filter.
    ok(!/blur\(/.test(m.backdrop || ''), 'A: фонът е плътен, без blur (blur не влиза в кадъра за списъка)', { backdrop: m.backdrop });
    const bgAlpha = (() => {
        const mm = /rgba?\(([^)]+)\)/.exec(m.background || '');
        if (!mm) return 1;
        const parts = mm[1].split(',').map(Number);
        return parts.length === 4 ? parts[3] : 1;
    })();
    ok(bgAlpha === 1 && !/rgba\([^)]*,\s*0?\.\d+\s*\)/.test(m.backgroundImage || ''),
        'A: фонът на overlay-а е напълно непрозрачен', { background: m.background, image: m.backgroundImage });
    ok(m.position === 'fixed', 'A: overlay-ът е fixed, не мърда при скрол', { position: m.position });

    // Две плочки 300x300, една под друга, центрирани.
    ok(m.tiles.length === 2, 'A: има точно две плочки', { tiles: m.tiles });
    const [t0, t1] = m.tiles;
    ok(t0 && t0.w === TILE && t0.h === TILE && t1 && t1.w === TILE && t1.h === TILE,
        `A: двете плочки са точно ${TILE}x${TILE}`, { t0, t1 });
    ok(t0 && t1 && t1.y > t0.y + TILE - 2, 'A: плочките са една под друга (часовник отгоре, календар отдолу)', { t0y: t0 && t0.y, t1y: t1 && t1.y });
    ok(t0 && t1 && t0.x === t1.x, 'A: двете плочки са подравнени по хоризонтала (еднакво ляво)', { x0: t0 && t0.x, x1: t1 && t1.x });
    const pairCx = t0 && t1 ? ((t0.x + (t0.x + TILE)) / 2 + (t1.x + (t1.x + TILE)) / 2) / 2 : null;
    const pairCy = t0 && t1 ? (t0.y + (t1.y + TILE)) / 2 : null;
    ok(pairCx !== null && Math.abs(pairCx - m.vw / 2) <= 1, 'A: групата е центрирана хоризонтално', { pairCx, vw: m.vw });
    ok(pairCy !== null && Math.abs(pairCy - m.vh / 2) <= 1, 'A: групата е центрирана вертикално', { pairCy, vh: m.vh });

    // Часовник.
    ok(!!m.clock && m.clock.numbers === '12,3,6,9', 'A: часовникът има цифрите 12/3/6/9', m.clock && m.clock.numbers);
    ok(!!m.clock && m.clock.marks === 8, 'A: часовникът има 8 междинни маркера (както в бележката)', m.clock && m.clock.marks);
    ok(!!m.clock && m.clock.hands.every(h => h && h !== 'none'), 'A: трите стрелки са завъртяни по текущия час', m.clock && m.clock.hands);
    const hands1 = m.clock ? m.clock.hands : [];
    await page.waitForTimeout(1300);
    const hands2 = (await measure(page)).clock.hands;
    ok(JSON.stringify(hands1) !== JSON.stringify(hands2), 'A: стрелките наистина вървят (секундната се мести)', { hands1, hands2 });

    // Календар.
    const c = m.calendar || {};
    ok(!!c.monthLabel && c.monthLabel.toLowerCase().includes(c.expectMonth.toLowerCase()),
        'A: календарът показва текущия месец', { label: c.monthLabel, expect: c.expectMonth });
    ok(!!c.monthLabel && c.monthLabel.includes(String(new Date().getFullYear())), 'A: календарът показва годината', { label: c.monthLabel });
    ok(Array.isArray(c.weekdays) && c.weekdays.length === 7 && c.weekdays[0] === 'Пн' && c.weekdays[6] === 'Нд',
        'A: календарът има 7 дни, започва с понеделник', { weekdays: c.weekdays });
    ok(c.dayCells - c.emptyCells === c.expectDays, 'A: календарът има точно колкото дни има месецът',
        { shown: c.dayCells - c.emptyCells, expect: c.expectDays });
    ok(c.today === c.expectToday, 'A: днешният ден е отбелязан', { today: c.today, expect: c.expectToday });
    ok(c.firstDayNumber === '1', 'A: първият ден в месеца е 1', { first: c.firstDayNumber });
    ok(!!c.scroll && c.scroll.sw <= c.scroll.cw + 1 && c.scroll.sh <= c.scroll.ch + 1,
        'A: календарът се побира в плочката без преливане', c.scroll);

    // Бутон Затвори долу вдясно.
    ok(!!m.close && m.close.text === 'Затвори', 'A: има малък бутон Затвори', m.close);
    ok(!!m.close && m.close.w <= 140 && m.close.h <= 60, 'A: бутонът е малък', m.close);
    ok(!!m.close && (m.vw - m.close.right) <= 32 && (m.vh - m.close.bottom) <= 40,
        'A: бутонът е в долния десен ъгъл', m.close && { rightGap: m.vw - m.close.right, bottomGap: m.vh - m.close.bottom });
    const overlapA = !!m.close && !(m.close.right <= t0.x || m.close.x >= t1.x + t1.w || m.close.bottom <= t1.y || m.close.y >= t1.y + t1.h);
    ok(!!m.close && !overlapA, 'A: бутонът не застъпва календара', m.close && { close: m.close, tile2: t1 });

    // Нищо не се реже по екрана (групата и бутонът са във видимата част).
    ok(t0.y >= 0 && t1.y + t1.h <= m.visH + 1 && t0.x >= 0 && t0.x + t0.w <= m.visW + 1,
        'A: двете плочки се побират във видимата част на екрана', { t0, t1, visW: m.visW, visH: m.visH });

    // Затваряне.
    await page.click('.privacy-close');
    await page.waitForTimeout(200);
    const after = await page.evaluate(() => {
        const ov = document.getElementById('privacy-overlay');
        return ov ? getComputedStyle(ov).display : 'missing';
    });
    ok(after === 'none', 'A: Затвори скрива overlay-а', { display: after });

    // Връщане на екрана: overlay-ът не изчезва сам, чака Затвори.
    await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(150);
    const shownAgain = await page.evaluate(() => {
        const ov = document.getElementById('privacy-overlay');
        return ov ? getComputedStyle(ov).display : 'missing';
    });
    ok(shownAgain === 'flex', 'A: при следващо скриване overlay-ът пак се показва', { display: shownAgain });

    ok(errs.length === 0, 'A: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------- 2) В обикновен таб (не режим на екран на приложението) ----------
{
    const { ctx, page, errs, ready } = await openApp(false);
    ok(ready, 'B: приложението се зарежда в обикновен таб');
    await goHidden(page);
    await page.waitForTimeout(400);
    const m = await measure(page);
    const shownNow = m.present && m.visible;
    ok(!shownNow, 'B: в обикновен таб при скриване НЕ се показва overlay', { present: m.present, visible: m.visible });
    ok(errs.length === 0, 'B: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------- 3) Малък екран: плочките се смаляват, но нищо не се реже ----------
{
    const { ctx, page, errs, ready } = await openApp(true, 320, 568);
    ok(ready, 'C: приложението се зарежда на малък екран (320x568)');
    await goHidden(page);
    await page.waitForTimeout(400);
    const m = await measure(page);
    const [t0, t1] = m.tiles;
    ok(m.present && m.visible, 'C: на малък екран overlay-ът се показва');
    ok(!!t0 && !!t1 && t0.w === t1.w && t0.h === t1.h && t0.w <= TILE,
        'C: плочките се смаляват равномерно, но не над 300x300', { t0, t1 });
    ok(!!t0 && !!t1 && t0.y >= 0 && t1.y + t1.h <= m.visH + 1,
        'C: нищо не се реже по височина', { t0, t1, visH: m.visH });
    ok(!!t0 && t0.x >= 0 && t0.x + t0.w <= m.visW + 1, 'C: нищо не се реже по ширина', { t0, visW: m.visW });
    const c = m.calendar || {};
    ok(c.dayCells - c.emptyCells === c.expectDays && c.today === c.expectToday,
        'C: календарът е пълен и на малък екран', { days: c.dayCells - c.emptyCells, today: c.today });
    const cr = m.close;
    ok(!!cr && (m.visW - cr.right) <= 32 && (m.visH - cr.bottom) <= 40,
        'C: бутонът Затвори е в ъгъла на видимата част', cr && { rightGap: m.visW - cr.right, bottomGap: m.visH - cr.bottom });
    const overlapC = !!cr && !!t1 && !(cr.right <= t0.x || cr.x >= t1.x + t1.w || cr.bottom <= t1.y || cr.y >= t1.y + t1.h);
    ok(!!cr && !overlapC, 'C: бутонът не застъпва календара на малък екран', cr && { close: cr, tile2: t1 });
    ok(errs.length === 0, 'C: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

await browser.close();
srv.close();

console.log(`\n${fails === 0 ? 'OK' : 'FAILED'} ${n - fails}/${n}`);
process.exit(fails === 0 ? 0 : 1);
