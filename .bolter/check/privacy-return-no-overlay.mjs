// Защитен екран: при връщане от списъка със задачи (активиране на приложението) овърлеят го няма.
//
// Собственикът (02.11.2026): „При връщане от таск мениджъра (активиране на приложение) да не се
// показва овърлеят“.
//
// Какво трябва да се пази, а не само да се поправи:
//   - овърлеят излиза ОЩЕ при blur (Android снима екрана за списъка с приложенията, докато
//     приложението още излиза от екрана) и остава при скриване на страницата - това е снимката,
//     която не бива да показва бележките;
//   - при връщане в приложението овърлеят се маха веднага, без да се чака докосване и без
//     бутон „Затвори“;
//   - blur без истинско скриване (системен диалог, падащо меню) пак се отменя при фокус;
//   - клик върху логото в хедъра вдига овърлея и той остава до бутона „Затвори“.
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1, мобилен контекст 390x844):
//   1) излизане през списъка със задачи: blur -> овърлеят е на екрана в СЪЩИЯ кадър, после
//      скриване на страницата -> овърлеят е още там (моментът на снимката);
//   2) връщане: страницата пак е видима -> овърлеят го няма ВЕДНАГА (без изчакване, без докосване),
//      после фокус -> пак го няма;
//   3) blur без истинско скриване, после фокус -> овърлеят го няма;
//   4) клик върху логото -> овърлеят е на екрана и остава до бутона „Затвори“;
//   5) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/privacy-return-no-overlay.mjs   (exit 1 при провал)
// UNI_ROOT=… сочи друга папка на приложението (контролно пускане върху кода без поправката;
// приема и корена на хранилището, в който има uni/). ROOT=… е същото, за съвместимост със старите тестове.
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

const PAGE = process.env.UNI_PAGE || 'index.html';
const W = 390, H = 844;

// Папката на приложението: UNI_ROOT може да е самата uni/ папка или коренът на хранилището.
let root = path.resolve(process.env.UNI_ROOT || process.env.ROOT || 'uni');
if (!existsSync(path.join(root, PAGE)) && existsSync(path.join(root, 'uni', PAGE))) {
    root = path.join(root, 'uni');
}
console.log(`приложение: ${root}`);

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

// Състоянието се чете В СЪЩИЯ кадър, без изчакване — точно това вижда Android при снимката.
const readOverlay = `(() => {
    const ov = document.getElementById('privacy-overlay');
    if (!ov) return { present: false, visible: false };
    const cs = getComputedStyle(ov);
    return {
        present: true,
        visible: ov.classList.contains('is-visible') && cs.display !== 'none' && Number(cs.opacity) > 0.5,
        display: cs.display,
        opacity: cs.opacity
    };
})()`;

const state = (page) => page.evaluate(readOverlay);

// Излизане към списъка със задачи: прозорецът губи фокус, но още е на екрана.
const blurNow = (page) => page.evaluate(new Function(`window.dispatchEvent(new Event('blur')); return ${readOverlay};`));

// Android вече е снимал екрана за списъка: страницата се води скрита.
const goHidden = (page) => page.evaluate(new Function(`
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    return ${readOverlay};`));

// Връщане в приложението: страницата пак е видима. Чете се веднага, без изчакване.
const goVisible = (page) => page.evaluate(new Function(`
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    return ${readOverlay};`));

const focusNow = (page) => page.evaluate(new Function(`window.dispatchEvent(new Event('focus')); return ${readOverlay};`));

const closeNow = (page) => page.evaluate(new Function(`
    const btn = document.querySelector('#privacy-overlay .privacy-close');
    if (!btn) return { clicked: false };
    btn.click();
    const s = ${readOverlay};
    s.clicked = true;
    return s;`));

const logoBox = (page) => page.evaluate(() => {
    const img = document.querySelector('header .header-logo') || document.querySelector('.header-logo');
    if (!img) return null;
    const r = img.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
});

// ---------- 1) излизане през списъка със задачи и връщане ----------
{
    const { ctx, page, errs, ready } = await openApp(true);
    ok(ready, '1. приложението тръгна');
    ok(!(await state(page)).visible, '1.1 преди излизането няма overlay');

    // Моментът, в който Android прави снимката за списъка със задачи: blur, още преди скриването.
    const b = await blurNow(page);
    ok(b.visible, '1.2 blur при излизане показва overlay-а веднага, без изчакване', b);
    ok(b.opacity === '1', '1.3 overlay-ът е с пълна непрозрачност (без преход)', { opacity: b.opacity });

    const h = await goHidden(page);
    ok(h.visible, '1.4 след скриването overlay-ът е още на екрана (снимката за списъка е чиста)', h);

    // ---------- 2) връщане от таск мениджъра: овърлеят го няма веднага ----------
    const v = await goVisible(page);
    ok(v.present && !v.visible, '2.1 при връщане (страницата пак е видима) overlay-ът го няма веднага', v);

    const f = await focusNow(page);
    ok(!f.visible, '2.2 фокусът след връщането също не връща overlay-а', f);

    await page.waitForTimeout(400);
    ok(!(await state(page)).visible, '2.3 overlay-ът не се появява и след това (нищо не го вдига отново)');

    // ---------- 3) blur без истинско скриване (системен диалог, падащо меню) ----------
    const b2 = await blurNow(page);
    ok(b2.visible, '3.1 blur без скриване пак показва overlay-а', b2);
    const f2 = await focusNow(page);
    ok(!f2.visible, '3.2 фокусът маха overlay-а от blur без истинско скриване', f2);

    ok(errs.length === 0, '3.3 няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------- 4) клик върху логото в хедъра: овърлеят остава до „Затвори“ ----------
// Логото е скрито от CSS в нисък landscape екран, затова тази част върви в широк контекст,
// както в logo-shows-privacy-overlay.mjs.
{
    const { ctx, page, errs, ready } = await openApp(false, 1280, 900);
    ok(ready, '4. приложението тръгна');
    const box = await logoBox(page);
    ok(!!box, '4.1 логото се вижда в хедъра', box);
    ok(await (async () => { if (!box) return false; await page.mouse.click(box.x, box.y); return true; })(), '4.2 кликнато е върху логото');

    const s = await state(page);
    ok(s.present && s.visible, '4.3 след клик върху логото overlay-ът е на екрана', s);

    await page.waitForTimeout(500);
    ok((await state(page)).visible, '4.4 overlay-ът от логото остава на екрана (не се маха сам)');

    const c = await closeNow(page);
    ok(c.clicked && !c.visible, '4.5 бутонът „Затвори“ маха overlay-а', c);

    ok(errs.length === 0, '4.6 няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

await browser.close();
srv.close();
console.log(`${fails ? 'FAILED' : 'OK'} ${n - fails}/${n}`);
process.exit(fails ? 1 : 0);
