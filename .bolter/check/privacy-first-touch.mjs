// Екран за поверителност: маха се при първото ДОКОСВАНЕ, не при връщане на фокуса.
//
// Решение на собственика (1.11.2026): „Сваляне при първото докосване, не при фокус. Диалозите
// се покриват сигурно. Цената: след връщане екранът стои, докато човекът не пипне нещо.“
//
// Защо: фокус идва и когато системен панел (час, дата, избор на файл, падащо меню) се затвори.
// Досега връщането на фокуса махаше плочките безусловно, значи същинското връщане в
// приложението се вземаше за „бележките се връщат“.
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1, мобилен контекст 390x844):
//   1) blur показва плочките;
//   2) връщане на фокуса БЕЗ скриване НЕ ги маха (и след 700 мс още стоят);
//   3) истински пръст (CDP Input.dispatchTouchEvent) ги маха ОЩЕ при touchStart, не при click;
//   4) това докосване не натиска каквото е под пръста (бутон под плочките остава ненатиснат);
//   5) след него приложението пак приема докосвания (вторият допир натиска бутона);
//   6) след като екранът е снет, следващ blur пак го вдига;
//   7) натискане на клавиш също го маха (десктоп/инсталирано приложение с клавиатура);
//   8) докосване, докато страницата е скрита (recents), НЕ го маха - тогава не се пипа;
//   9) бутонът „Затвори“ още работи;
//  10) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/privacy-first-touch.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (за контрола върху стария код).
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
const openApp = async (appScreen) => {
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
                return {
                    matches: true, media: String(q), onchange: null,
                    addListener() { }, removeListener() { },
                    addEventListener() { }, removeEventListener() { }, dispatchEvent() { return false; }
                };
            }
            return orig(q);
        };
    }, { appScreen });
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        || document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    // Изчакването за пускане на защитата е 800 мс (PR #165) - тук се изчаква отгоре.
    await page.waitForTimeout(1500);
    return { ctx, page, errs, ready };
};

const shown = (page) => page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    return !!(ov && ov.classList.contains('is-visible') && getComputedStyle(ov).display !== 'none');
});

const blurNow = (page) => page.evaluate(() => window.dispatchEvent(new Event('blur')));
const focusNow = (page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));
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

const TAP = { x: 195, y: 420 };
const touchPoints = (x, y) => [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }];
// Истински пръст: touchStart (и веднага се чете състоянието), после touchEnd.
const pressStart = (cdp, p) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touchPoints(p.x, p.y) });
const pressEnd = (cdp) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
const tap = async (cdp, p) => { await pressStart(cdp, p); await pressEnd(cdp); };

{
    const { ctx, page, errs, ready } = await openApp(true);
    ok(ready, '0. приложението тръгна в режим на екран на приложението');
    ok(!(await shown(page)), '0.1 преди blur няма екран');
    const cdp = await ctx.newCDPSession(page);

    // ---------- 1) blur вдига плочките ----------
    await blurNow(page);
    ok(await shown(page), '1. blur вдига екрана');

    // ---------- 2) фокусът вече НЕ го маха ----------
    await focusNow(page);
    ok(await shown(page), '2.1 връщане на фокуса не маха екрана (новото правило)');
    await page.waitForTimeout(700);
    ok(await shown(page), '2.2 и след 700 мс още стои - чака докосване, не таймер');

    // ---------- 3) първото докосване го маха, още при touchStart ----------
    // Бутон под плочките: той показва дали докосването е стигнало до съдържанието.
    await page.evaluate(({ x, y }) => {
        const b = document.createElement('button');
        b.id = 'ft-probe';
        b.type = 'button';
        b.textContent = 'PROBE';
        b.style.cssText = `position:fixed;left:${x - 60}px;top:${y - 30}px;width:120px;height:60px;z-index:5;font-size:16px;`;
        b.addEventListener('click', () => { window.__ftProbe = (window.__ftProbe || 0) + 1; });
        document.body.appendChild(b);
        window.__ftProbe = 0;
    }, TAP);
    const under = await page.evaluate(({ x, y }) => {
        // elementFromPoint тук е overlay-ът (той е отгоре), затова се мери геометрията на бутона.
        const b = document.getElementById('ft-probe');
        const r = b.getBoundingClientRect();
        return { hit: x >= r.left && x <= r.right && y >= r.top && y <= r.bottom, top: Math.round(r.top), left: Math.round(r.left) };
    }, TAP);
    ok(under.hit, '3.0 бутонът е точно под пръста, преди екранът да е вдигнат', under);

    await pressStart(cdp, TAP);
    const afterStart = await shown(page);
    ok(!afterStart, '3.1 екранът пада още при touchStart (не чака click)');
    await pressEnd(cdp);
    await page.waitForTimeout(120);
    ok((await page.evaluate(() => window.__ftProbe || 0)) === 0,
        '4.1 докосването, което маха екрана, НЕ натиска бутона под него',
        await page.evaluate(() => window.__ftProbe || 0));
    ok(!(await shown(page)), '4.2 екранът остава свален след вдигане на пръста');

    // ---------- 5) след това приложението пак приема докосвания ----------
    await page.waitForTimeout(800);
    await tap(cdp, TAP);
    await page.waitForTimeout(150);
    ok((await page.evaluate(() => window.__ftProbe || 0)) === 1,
        '5.1 вторият допир стига до бутона (екранът не поглъща жестовете след себе си)',
        await page.evaluate(() => window.__ftProbe || 0));

    // ---------- 6) след сваляне защитата пак работи ----------
    await blurNow(page);
    ok(await shown(page), '6.1 следващ blur пак вдига екрана');

    // ---------- 7) клавиатурата също го маха ----------
    await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true })));
    ok(!(await shown(page)), '7.1 натискане на клавиш маха екрана');

    // ---------- 8) докато страницата е скрита (recents), докосване не пипа нищо ----------
    await blurNow(page);
    await goHidden(page);
    ok(await shown(page), '8.1 при скриване екранът е вдигнат');
    await page.evaluate(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })));
    ok(await shown(page), '8.2 при скрита страница докосването не маха екрана (тогава не се пипа)');
    await goVisible(page);
    ok(await shown(page), '8.3 след връщане екранът още стои - чака истинско докосване');
    await tap(cdp, { x: 60, y: 200 });
    await page.waitForTimeout(150);
    ok(!(await shown(page)), '8.4 истинското докосване след връщане го маха');

    // ---------- 9) бутонът Затвори още работи ----------
    await page.evaluate(() => window.privacyOverlayShow && window.privacyOverlayShow());
    ok(await shown(page), '9.1 екранът се вдига и ръчно (както при клик на логото)');
    const closeBox = await page.evaluate(() => {
        const b = document.querySelector('#privacy-overlay .privacy-close');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    ok(!!closeBox, '9.2 има бутон Затвори');
    if (closeBox) {
        await tap(cdp, closeBox);
        await page.waitForTimeout(150);
        ok(!(await shown(page)), '9.3 докосване по бутона Затвори маха екрана');
    }

    // ---------- 10) обикновен таб: нищо не се показва ----------
    ok(errs.length === 0, '10.1 няма изключения в конзолата', errs);
    await ctx.close();
}

{
    const { ctx, page, errs, ready } = await openApp(false);
    ok(ready, '11. приложението тръгна в обикновен таб');
    await blurNow(page);
    ok(!(await shown(page)), '11.1 в обикновен таб blur не вдига екрана');
    ok(errs.length === 0, '11.2 няма изключения в конзолата', errs);
    await ctx.close();
}

await browser.close();
srv.close();

console.log(`\nОбщо проверки: ${n}, паднали: ${fails}`);
if (fails) { console.log('FAILED'); process.exit(1); }
console.log('OK');
