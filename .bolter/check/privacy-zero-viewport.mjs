// Екран за поверителност: плочките не бива да се свиват до 0x0, докато приложението излиза.
//
// Защо: по време на анимацията за излизане Android връща за миг 0 (или шепа пиксели) от
// innerWidth/innerHeight/visualViewport и точно тогава идва resize. Старият код пишеше тези
// числа в стила на overlay-а, той оставаше „показан“ с размер 0x0 и в кадъра за списъка със
// приложенията се виждаха бележките. Плочките се връщаха на място едва при следващия resize,
// тоест чак когато човек се върне в приложението.
//
// Пускане от корена на хранилището: node .bolter/check/privacy-zero-viewport.mjs   (exit 1 при провал)
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
const KEYBOARD_VH = 520;

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
    localStorage.setItem('hideAssistant', 'true');
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q) => {
        if (/display-mode:\s*(standalone|fullscreen|minimal-ui)/.test(String(q))) {
            return { matches: true, media: String(q), onchange: null, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { }, dispatchEvent() { return false; } };
        }
        return orig(q);
    };
});
await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('app-ready')
    || document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 }).catch(() => { });
await page.waitForTimeout(1500);

// Размерите на прозореца се подменят, както Android ги подменя при излизане.
const setViewport = ({ w, h }) => page.evaluate(({ w, h }) => {
    Object.defineProperty(window, 'innerWidth', { get: () => w, configurable: true });
    Object.defineProperty(window, 'innerHeight', { get: () => h, configurable: true });
    if (window.visualViewport) {
        Object.defineProperty(window.visualViewport, 'width', { get: () => w, configurable: true });
        Object.defineProperty(window.visualViewport, 'height', { get: () => h, configurable: true });
    }
    window.dispatchEvent(new Event('resize'));
}, { w, h });

const box = () => page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    if (!ov) return { exists: false, visible: false, w: 0, h: 0 };
    const r = ov.getBoundingClientRect();
    return {
        exists: true,
        visible: getComputedStyle(ov).display !== 'none',
        w: Math.round(r.width), h: Math.round(r.height),
        focused: document.hasFocus()
    };
});
const covers = (b, w, h) => b.visible && b.w >= w - 1 && b.h >= h - 1;

// 1) Излизане от приложението: плочките покриват целия екран.
await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
await page.waitForTimeout(120);
let b = await box();
ok(covers(b, W, H), '1 плочките покриват целия екран веднага след излизането', b);

// 2) Android за миг отчита нулев прозорец и праща resize. Плочките не бива да се свиват.
await setViewport({ w: 0, h: 0 });
await page.waitForTimeout(120);
b = await box();
ok(covers(b, W, H), '2 нулев размер на прозореца (преходно при излизане) не свива плочките', b);

// 3) Същото с малък, но ненулев размер (екранът се свива в анимацията, прозорецът не е на фокус).
await setViewport({ w: 170, h: 120 });
await page.waitForTimeout(120);
b = await box();
ok(covers(b, W, H), '3 смален размер на прозореца при излизане не оставя бележките на показ', b);

// 4) Прозорецът се връща на истинския си размер.
await setViewport({ w: W, h: H });
await page.waitForTimeout(120);
b = await box();
ok(covers(b, W, H), '4 при връщане на истинския размер плочките са цели', b);

// 5) Връщане в приложението: плочките стоят и са цели.
await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
await page.waitForTimeout(150);
b = await box();
ok(covers(b, W, H), '5 след връщане в приложението плочките са цели, без жест не се махат', b);

// 6) Клавиатура, докато прозорецът е на фокус: истинско смаляване се прилага (за да не се
//    счупи работата с отворена клавиатура — там overlay-ът трябва да стига до клавиатурата).
await page.bringToFront();
await page.focus('body').catch(() => { });
const focused = await page.evaluate(() => document.hasFocus());
await setViewport({ w: W, h: KEYBOARD_VH });
await page.waitForTimeout(150);
b = await box();
if (focused) {
    ok(b.visible && Math.abs(b.h - KEYBOARD_VH) <= 1, '6 с клавиатура (прозорецът е на фокус) плочките се свиват до видимата част', b);
} else {
    console.log('SKIP 6 прозорецът не е на фокус в този пуск, проверката за клавиатура не се прави');
}

ok(errs.length === 0, '7 няма изключения в конзолата', errs);

await browser.close();
srv.close();
console.log(fails ? `FAILED  OK=${n - fails} FAIL=${fails}` : `ALL OK  OK=${n} FAIL=0`);
process.exit(fails ? 1 : 0);
