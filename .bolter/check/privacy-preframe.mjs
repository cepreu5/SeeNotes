// Екран за поверителност: плочките да са на екрана ОЩЕ ПРЕДИ приложението да излезе.
//
// Защо: собственикът видя на телефон (MIUI, b3.33), че в списъка с приложенията плочките се
// появяват за миг и веднага се връщат бележките. Android снима кадъра за списъка от последния
// кадър, който приложението е успяло да нарисува, а при blur то често вече е замразено —
// затова вдигането при blur не влиза в снимката. Решението: плочките се вдигат още при жеста,
// който започва излизането (пръст в долната ивица или плъзгане нагоре), докато приложението
// още рисува, и се махат сами, ако човекът остане в приложението.
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1, мобилен контекст 390x844,
// режим на екран на приложението, истински докосвания през CDP):
//   1) пръст в долната ивица -> плочките са на екрана в същия момент, преди всякакъв blur;
//   2) след това blur + скриване -> плочките остават (това е кадърът за списъка);
//   3) връщане -> пак остават, докато човек не ги махне с жест;
//   4) пръст в долната ивица, но без излизане -> плочките се махат сами до ~1 сек;
//   5) докосване в средата на екрана -> плочките не се вдигат;
//   6) след махане с жест ново докосване в ивицата веднага не ги вдига пак;
//   7) старият път (blur без докосване, напр. бутон „скорошни“) пак вдига плочките.
//
// Пускане от корена на хранилището: node .bolter/check/privacy-preframe.mjs   (exit 1 при провал)
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

const openApp = async () => {
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        serviceWorkers: 'block'
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
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
        const orig = window.matchMedia.bind(window);
        window.matchMedia = (q) => {
            if (/display-mode:\s*(standalone|fullscreen|minimal-ui)/.test(String(q))) {
                return { matches: true, media: String(q), onchange: null, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { }, dispatchEvent() { return false; } };
            }
            return orig(q);
        };
        window.__vis = { hidden: false };
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__vis.hidden });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__vis.hidden ? 'hidden' : 'visible') });
    });
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => document.body.classList.contains('app-ready')
        || document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    await page.waitForTimeout(1200);
    const cdp = await ctx.newCDPSession(page);
    return { ctx, page, errs, cdp };
};

const visible = (page) => page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    if (!ov) return false;
    return getComputedStyle(ov).display !== 'none';
});
const blurNow = (page) => page.evaluate(() => window.dispatchEvent(new Event('blur')));
const focusNow = (page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));
const goHidden = (page) => page.evaluate(() => {
    window.__vis.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
});
const goVisible = (page) => page.evaluate(() => {
    window.__vis.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
});
const touch = async (cdp, type, x, y) => {
    await cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, radiusX: 8, radiusY: 8, force: 1 }]
    });
};
const debugText = (page) => page.evaluate(() => {
    const el = document.getElementById('privacy-debug');
    return el ? el.textContent : '';
});

// ---------- 1-3: жест за излизане, после blur и скриване ----------
{
    const { ctx, page, errs, cdp } = await openApp();
    ok(await visible(page) === false, '1.0 преди жеста няма плочки');

    // Пръстът пада на 14 px от долния ръб — там започва жестът за „начало“/„скорошни“.
    await touch(cdp, 'touchStart', 195, H - 14);
    const shownAtTouch = await visible(page);
    ok(shownAtTouch === true, '1.1 плочките са на екрана още при докосването в долната ивица (преди blur)', { shownAtTouch });

    // Точно това дава Android: жестът се открадва (cancel), после blur и скриване.
    await touch(cdp, 'touchCancel', 0, 0);
    await blurNow(page);
    await goHidden(page);
    await page.waitForTimeout(60);
    ok(await visible(page) === true, '1.2 кадърът за списъка е с плочките (blur + скриване)');

    // Връщане в приложението: плочките не бива да изчезват сами.
    await goVisible(page);
    await focusNow(page);
    await page.waitForTimeout(1200);
    ok(await visible(page) === true, '1.3 след връщане плочките чакат жест');

    // Истински жест на човека ги маха.
    await page.waitForTimeout(450);
    await page.mouse.click(195, 500);
    await page.waitForTimeout(120);
    ok(await visible(page) === false, '1.4 жест върху плочките ги маха');

    ok(errs.length === 0, '1.5 няма изключения в конзолата', errs.slice(0, 2));
    await ctx.close();
}

// ---------- 4: пръст в ивицата, но човекът остава в приложението ----------
{
    const { ctx, page, cdp } = await openApp();
    await touch(cdp, 'touchStart', 195, H - 14);
    ok(await visible(page) === true, '4.1 докосване в ивицата вдига плочките');
    await touch(cdp, 'touchEnd', 0, 0);
    await page.waitForTimeout(900);
    ok(await visible(page) === false, '4.2 остана в приложението — плочките се махат сами');
    await ctx.close();
}

// ---------- 5: докосване в средата не вдига нищо ----------
{
    const { ctx, page, cdp } = await openApp();
    await touch(cdp, 'touchStart', 195, 420);
    await page.waitForTimeout(40);
    ok(await visible(page) === false, '5.1 докосване в средата на екрана не вдига плочките');
    await touch(cdp, 'touchEnd', 0, 0);
    await page.waitForTimeout(600);
    ok(await visible(page) === false, '5.2 и след вдигане на пръста пак няма плочки');
    await ctx.close();
}

// ---------- 6: след махане с жест ивицата веднага не ги вдига пак ----------
{
    const { ctx, page, cdp } = await openApp();
    await blurNow(page);
    await page.waitForTimeout(500);
    ok(await visible(page) === true, '6.1 blur без докосване пак вдига плочките (бутон „скорошни“)');
    await page.mouse.click(195, 600);
    await page.waitForTimeout(100);
    ok(await visible(page) === false, '6.2 жестът ги маха');
    await touch(cdp, 'touchStart', 195, H - 14);
    await page.waitForTimeout(40);
    ok(await visible(page) === false, '6.3 същият жест не ги вдига веднага отново');
    await touch(cdp, 'touchEnd', 0, 0);
    await ctx.close();
}

// ---------- 7: какво пише диагностиката след връщане ----------
{
    const { ctx, page, cdp } = await openApp();
    await touch(cdp, 'touchStart', 195, H - 14);
    await touch(cdp, 'touchCancel', 0, 0);
    await blurNow(page);
    await goHidden(page);
    await goVisible(page);
    await focusNow(page);
    await page.waitForTimeout(400);
    const txt = await debugText(page);
    ok(/b3\.34/.test(txt), '7.1 диагностиката показва кой файл върви на телефона', txt.slice(0, 120));
    ok(/touch долу/.test(txt), '7.2 диагностиката помни докосването до долния ръб', txt.slice(0, 200));
    ok(/blur/.test(txt) && /скрито/.test(txt), '7.3 диагностиката помни blur и скриването', txt.slice(0, 240));
    await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n${fails === 0 ? 'OK' : 'FAILED'} ${n - fails}/${n}`);
process.exit(fails ? 1 : 0);
