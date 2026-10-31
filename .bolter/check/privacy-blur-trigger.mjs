// Екран за поверителност: показване още при blur, не само при скриване на страницата.
//
// Защо: Android снима екрана за списъка с приложенията, докато приложението още излиза от
// екрана. Ако плочките се покажат чак на visibilitychange, снимката вече е направена и в
// списъка се виждат бележките. Затова плочките трябва да са на екрана още при blur.
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1, мобилен контекст 390x844):
//   1) в режим на екран на приложението blur показва overlay-а веднага, в същия кадър
//      (computed style, не след изчакване) и следващият кадър наистина е прерисуван;
//   2) blur без истинско скриване (системен диалог) се отменя при връщане на фокуса;
//   3) blur + истинско скриване оставя плочките и след връщане на фокуса (иска Затвори);
//   4) избор на файл (поле за файл) не се взема за напускане на приложението;
//   5) извън режим на екран на приложението (обикновен таб) blur не показва нищо;
//   6) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/privacy-blur-trigger.mjs   (exit 1 при провал)
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

// Състоянието се чете В СЪЩИЯ кадър, без изчакване — точно това трябва да види Android.
const state = (page) => page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    if (!ov) return { present: false, visible: false };
    const cs = getComputedStyle(ov);
    const tiles = [...ov.querySelectorAll('.privacy-tile')].map(t => Math.round(t.getBoundingClientRect().width));
    return {
        present: true,
        visible: cs.display !== 'none',
        opacity: cs.opacity,
        display: cs.display,
        tiles
    };
});

const blurNow = (page) => page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    const ov = document.getElementById('privacy-overlay');
    const cs = ov ? getComputedStyle(ov) : null;
    return ov ? { visible: cs.display !== 'none', opacity: cs.opacity } : { visible: false };
});

const goHidden = (page) => page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
});

const focusNow = (page) => page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    const ov = document.getElementById('privacy-overlay');
    return { visible: ov ? getComputedStyle(ov).display !== 'none' : false };
});

// ---------- 1) blur показва плочките веднага, в същия кадър ----------
{
    const { ctx, page, errs, ready } = await openApp(true);
    ok(ready, '1. приложението тръгна');
    ok(!(await state(page)).visible, '1.1 преди blur няма overlay');

    const region = { x: 20, y: 300, width: 120, height: 120 };
    const before = await page.screenshot({ clip: region });
    const s = await blurNow(page);
    ok(s.visible, '1.2 blur показва overlay-а веднага, без изчакване', s);
    ok(s.opacity === '1', '1.3 overlay-ът е с пълна непрозрачност (без преход)', { opacity: s.opacity });

    // Кадърът след blur трябва да е прерисуван — иначе Android снима старото.
    const after = await page.screenshot({ clip: region });
    ok(Buffer.compare(before, after) !== 0, '1.4 следващият кадър е прерисуван с плочките');

    const st = await state(page);
    const tiles = st.tiles || [];
    ok(tiles.length === 2 && tiles.every(w => w === 300), '1.5 двете плочки са 300x300', tiles);

    // ---------- 2) blur без истинско скриване се отменя при връщане ----------
    // От b3.30 решението е отложено с 350 мс: Android понякога дава focus за миг, преди да отчете
    // скриването, и мигновеното махане оставяше кадър без плочки в списъка с приложенията.
    const f = await focusNow(page);
    await page.waitForTimeout(600);
    ok(!(await state(page)).visible, '2.1 връщане на фокуса без скриване маха overlay-а до 600 мс', f);

    // ---------- 3) blur + истинско скриване остава и след връщане ----------
    await blurNow(page);
    await goHidden(page);
    const f2 = await focusNow(page);
    ok(f2.visible, '3.1 след истинско скриване overlay-ът остава и след връщане (иска Затвори)', f2);
    const closed = await page.evaluate(() => {
        const btn = document.querySelector('#privacy-overlay .privacy-close');
        if (!btn) return { clicked: false };
        btn.click();
        const ov = document.getElementById('privacy-overlay');
        return { clicked: true, visible: getComputedStyle(ov).display !== 'none' };
    });
    ok(closed.clicked && !closed.visible, '3.2 бутонът Затвори маха overlay-а', closed);

    // ---------- 4) избор на файл не се взема за напускане ----------
    await page.evaluate(() => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.id = 'test-file-picker';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const afterPicker = await blurNow(page);
    ok(!afterPicker.visible, '4.1 blur след клик върху поле за файл не показва overlay', afterPicker);
    await goHidden(page);
    ok(!(await state(page)).visible, '4.2 скриване по време на избора на файл също не показва overlay');
    const f3 = await focusNow(page);
    ok(!f3.visible, '4.3 след избора на файл бележките се връщат веднага', f3);
    const again = await blurNow(page);
    ok(again.visible, '4.4 следващият истински blur пак показва overlay', again);

    ok(errs.length === 0, '6.1 няма изключения в конзолата', errs);
    await ctx.close();
}

// ---------- 5) обикновен таб: нищо не се показва ----------
{
    const { ctx, page, errs, ready } = await openApp(false);
    ok(ready, '5. приложението тръгна в обикновен таб');
    const s = await blurNow(page);
    ok(!s.visible, '5.1 в обикновен таб blur не показва overlay', s);
    await goHidden(page);
    ok(!(await state(page)).visible, '5.2 в обикновен таб скриването не показва overlay');
    ok(errs.length === 0, '5.3 няма изключения в конзолата', errs);
    await ctx.close();
}

await browser.close();
srv.close();
console.log(`${fails ? 'FAILED' : 'OK'} ${n - fails}/${n}`);
process.exit(fails ? 1 : 0);
