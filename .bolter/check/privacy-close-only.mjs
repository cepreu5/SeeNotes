// Екран за поверителност: маха го САМО бутонът „Затвори“ (uni).
//
// Защо: Android дава кратък фокус, преди да отчете скриването на страницата. Докато фокусът
// махаше плочките, редът blur -> focus -> hidden оставяше екрана без плочки точно когато се
// снима кадърът за списъка с приложенията - оттам „мигането“.
// Решение на собственика (2.11.2026): „Само бутонът Затвори. Мигането изчезва напълно.“
// Приетата цена: след системен диалог, избор на дата/час или падащо меню плочките стоят,
// докато човекът не натисне „Затвори“.
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1, мобилен контекст 390x844):
//   1) истинският ред на Android blur -> focus -> hidden оставя плочките на екрана (без мигане);
//   2) blur + фокус без скриване (системен диалог, избор на дата, падащо меню) оставя плочките;
//   3) нищо не ги маха само след време (няма таймер);
//   4) маха ги само бутонът „Затвори“;
//   5) след „Затвори“ следващият blur пак ги показва;
//   6) при изключена „Автоматична защита“ blur не показва нищо;
//   7) в обикновен таб blur не показва нищо;
//   8) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/privacy-close-only.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (за да се провери, че тестът хваща старата логика).
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
const openApp = async ({ appScreen = true, autoProtect = true } = {}) => {
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
    await page.addInitScript(({ appScreen, autoProtect }) => {
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
        if (!autoProtect) localStorage.setItem('privacyAutoProtect', 'false');
        else localStorage.removeItem('privacyAutoProtect');
        const orig = window.matchMedia.bind(window);
        window.matchMedia = (q) => {
            if (appScreen && /display-mode:\s*(standalone|fullscreen|minimal-ui)/.test(String(q))) {
                return { matches: true, media: String(q), onchange: null, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { }, dispatchEvent() { return false; } };
            }
            return orig(q);
        };
    }, { appScreen, autoProtect });
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        || document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    await page.waitForTimeout(1500);
    return { ctx, page, errs, ready };
};

const state = (page) => page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    if (!ov) return { present: false, visible: false };
    const cs = getComputedStyle(ov);
    return {
        present: true,
        visible: cs.display !== 'none',
        opacity: cs.opacity,
        tiles: [...ov.querySelectorAll('.privacy-tile')].map(t => Math.round(t.getBoundingClientRect().width)),
        closeVisible: (() => {
            const b = ov.querySelector('.privacy-close');
            if (!b) return false;
            const r = b.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1;
        })()
    };
});

const goHidden = (page) => page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
});

// ---------- 1) истинският ред на Android: blur -> focus -> hidden ----------
{
    const { ctx, page, errs, ready } = await openApp();
    ok(ready, '1. приложението тръгна');
    ok(!(await state(page)).visible, '1.1 преди blur няма overlay');

    const region = { x: 20, y: 300, width: 120, height: 120 };
    const before = await page.screenshot({ clip: region });

    // Трите събития в един ход, точно както ги праща Android при излизане към списъка.
    const step = await page.evaluate(() => {
        const read = () => {
            const ov = document.getElementById('privacy-overlay');
            return ov ? getComputedStyle(ov).display !== 'none' : false;
        };
        const ov = document.getElementById('privacy-overlay');
        const seq = { before: read() };
        window.dispatchEvent(new Event('blur'));
        seq.afterBlur = read();
        window.dispatchEvent(new Event('focus'));
        seq.afterFocus = read();
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
        seq.afterHidden = read();
        const ovNow = document.getElementById('privacy-overlay');
        seq.tiles = ovNow ? [...ovNow.querySelectorAll('.privacy-tile')].map(t => Math.round(t.getBoundingClientRect().width)) : [];
        return seq;
    });
    ok(!step.before, '1.2 преди събитията overlay няма', step);
    ok(step.afterBlur, '1.3 blur показва плочките', step);
    ok(step.afterFocus, '1.4 кратък фокус НЕ маха плочките', step);
    ok(step.afterHidden, '1.5 и при скриване плочките са на екрана (кадърът за списъка е с тях)', step);
    ok(step.tiles.length === 2 && step.tiles.every(w => w === 300), '1.6 двете плочки са 300x300', step.tiles);

    const after = await page.screenshot({ clip: region });
    ok(Buffer.compare(before, after) !== 0, '1.7 екранът е прерисуван с плочките');

    // ---------- 2) blur + фокус без скриване: системен диалог, избор на дата, падащо меню ----------
    const back = await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
        document.dispatchEvent(new Event('visibilitychange'));
        window.dispatchEvent(new Event('focus'));
        const ov = document.getElementById('privacy-overlay');
        return { visible: ov ? getComputedStyle(ov).display !== 'none' : false };
    });
    ok(back.visible, '2.1 след връщане в приложението плочките стоят (иска се „Затвори“)', back);

    const st = await state(page);
    ok(st.closeVisible, '2.2 бутонът „Затвори“ е на екрана, за да се излезе', st);

    // ---------- 3) нищо не ги маха само след време (няма таймер) ----------
    await page.waitForTimeout(1200);
    const later = await state(page);
    ok(later.visible, '3.1 след 1.2 сек плочките са още там', later);

    // ---------- 4) маха ги само бутонът „Затвори“ ----------
    const closed = await page.evaluate(() => {
        const btn = document.querySelector('#privacy-overlay .privacy-close');
        if (!btn) return { clicked: false };
        btn.click();
        const ov = document.getElementById('privacy-overlay');
        return { clicked: true, visible: getComputedStyle(ov).display !== 'none' };
    });
    ok(closed.clicked && !closed.visible, '4.1 бутонът „Затвори“ маха overlay-а', closed);

    // ---------- 5) след „Затвори“ следващият blur пак ги показва ----------
    const again = await page.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
        const ov = document.getElementById('privacy-overlay');
        return { visible: ov ? getComputedStyle(ov).display !== 'none' : false };
    });
    ok(again.visible, '5.1 следващият blur пак показва плочките', again);
    const back2 = await page.evaluate(() => {
        window.dispatchEvent(new Event('focus'));
        const ov = document.getElementById('privacy-overlay');
        return { visible: ov ? getComputedStyle(ov).display !== 'none' : false };
    });
    ok(back2.visible, '5.2 и този път фокусът не ги маха', back2);

    // ---------- 6) избор на файл: пак не вдига екрана ----------
    await page.evaluate(() => {
        const btn = document.querySelector('#privacy-overlay .privacy-close');
        if (btn) btn.click();
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.id = 'test-file-picker';
        inp.style.display = 'none';
        document.body.appendChild(inp);
        inp.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        window.dispatchEvent(new Event('blur'));
    });
    ok(!(await state(page)).visible, '6.1 клик върху поле за файл не вдига overlay');

    ok(errs.length === 0, '6.2 няма изключения в конзолата', errs);
    await ctx.close();
}

// ---------- 7) изключена „Автоматична защита“: нищо не се показва ----------
{
    const { ctx, page, errs, ready } = await openApp({ autoProtect: false });
    ok(ready, '7. приложението тръгна с изключена защита');
    const s = await page.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
        const ov = document.getElementById('privacy-overlay');
        return { visible: ov ? getComputedStyle(ov).display !== 'none' : false };
    });
    ok(!s.visible, '7.1 при изключена защита blur не показва overlay', s);
    ok(errs.length === 0, '7.2 няма изключения в конзолата', errs);
    await ctx.close();
}

// ---------- 8) обикновен таб: нищо не се показва ----------
{
    const { ctx, page, errs, ready } = await openApp({ appScreen: false });
    ok(ready, '8. приложението тръгна в обикновен таб');
    const s = await page.evaluate(() => {
        window.dispatchEvent(new Event('blur'));
        const ov = document.getElementById('privacy-overlay');
        return { visible: ov ? getComputedStyle(ov).display !== 'none' : false };
    });
    ok(!s.visible, '8.1 в обикновен таб blur не показва overlay', s);
    await goHidden(page);
    ok(!(await state(page)).visible, '8.2 в обикновен таб и скриването не показва overlay');
    ok(errs.length === 0, '8.3 няма изключения в конзолата', errs);
    await ctx.close();
}

await browser.close();
srv.close();
console.log(`${fails ? 'FAILED' : 'OK'} ${n - fails}/${n}`);
process.exit(fails ? 1 : 0);
