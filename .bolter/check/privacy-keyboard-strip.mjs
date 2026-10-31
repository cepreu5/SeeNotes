// Екран за поверителност: бележката не бива да прозира под овърлея, когато е отворена с клавиатура.
//
// Защо: overlay-ът взимаше височината си от privacyViewport() — най-малкото от innerHeight,
// visualViewport.height и clientHeight. С отворена бележка и вдигната клавиатура това е само
// частта над клавиатурата (520 от 844), значи overlay-ът е 390x520. Клавиатурата се прибира при
// излизане от приложението, но тогава се сменя само visualViewport и resize на window НЕ идва —
// overlay-ът си остава 520, а долната част на бележката (футърът с датата и бутоните) и бордът
// влизат в кадъра за списъка с приложенията. Затова сега покритието се смята от НАЙ-ГОЛЯМОТО
// число (физическият екран), а плочките — от най-малкото (видимата част), в която се центрират.
//
// Пускане от корена на хранилището: node .bolter/check/privacy-keyboard-strip.mjs   (exit 1 при провал)
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
const W = 390, H = 844, KB = 520;

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
    viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
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
    window.__vis = { hidden: false };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__vis.hidden });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__vis.hidden ? 'hidden' : 'visible') });
});
await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
await page.waitForFunction(() => document.body.classList.contains('app-ready')
    || document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 }).catch(() => { });
await page.waitForTimeout(1500);

// Клавиатурата на Chrome за Android (interactive-widget=resizes-visual, по подразбиране) сменя
// САМО visualViewport: layout-ът и window.innerHeight остават колкото е екранът.
const keyboard = ({ open, h }) => page.evaluate(({ open, h }) => {
    const vv = window.visualViewport;
    if (vv) {
        Object.defineProperty(vv, 'height', { get: () => (open ? h : window.innerHeight), configurable: true });
        if (typeof vv.dispatchEvent === 'function') vv.dispatchEvent(new Event('resize'));
    }
}, { open, h });
// Излизане от приложението: Android за миг отчита нулев или смален прозорец.
const setWindow = ({ w, h }) => page.evaluate(({ w, h }) => {
    Object.defineProperty(window, 'innerWidth', { get: () => w, configurable: true });
    Object.defineProperty(window, 'innerHeight', { get: () => h, configurable: true });
    window.dispatchEvent(new Event('resize'));
}, { w, h });

const read = () => page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    if (!ov) return { exists: false };
    const r = ov.getBoundingClientRect();
    const stack = ov.querySelector('.privacy-stack');
    const sr = stack ? stack.getBoundingClientRect() : null;
    const btn = ov.querySelector('.privacy-close');
    const br = btn ? btn.getBoundingClientRect() : null;
    const probe = (x, y) => {
        const el = document.elementFromPoint(x, y);
        if (!el) return 'none';
        return el.closest('#privacy-overlay') ? 'overlay' : (el.closest('#note-windows-layer') ? 'note-window' : 'app');
    };
    return {
        exists: true,
        visible: getComputedStyle(ov).display !== 'none',
        w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y),
        stackBottom: sr ? Math.round(sr.bottom) : null,
        stackTop: sr ? Math.round(sr.top) : null,
        stackLeft: sr ? Math.round(sr.left) : null,
        stackRight: sr ? Math.round(sr.right) : null,
        btnBottom: br ? Math.round(br.bottom) : null,
        at: { y300: probe(195, 300), y700: probe(195, 700), y830: probe(195, 830) }
    };
});
const covers = (b, w, h) => b.visible && b.w >= w - 1 && b.h >= h - 1;

// ---------- 1) Отворена бележка с клавиатура: овърлеят пак покрива целия екран ----------
const card = await page.$('#notes-container .note:not([style*="display: none"])');
ok(!!card, '1 има карта на бележка в демото');
if (card) { await card.tap({ force: true }).catch(() => { }); await page.waitForTimeout(900); }
const noteOpen = await page.evaluate(() => {
    const w = document.querySelector('#note-windows-layer > *');
    return !!w && getComputedStyle(w).display !== 'none';
});
ok(noteOpen, '1.1 бележката се отвори в прозорец');

await keyboard({ open: true, h: KB });
await page.waitForTimeout(200);
await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
await page.waitForTimeout(200);
let b = await read();
ok(covers(b, W, H), '1.2 с клавиатура овърлеят покрива целия екран, не само частта над клавиатурата', b);
ok(b.stackBottom !== null && b.stackBottom <= KB + 2, '1.3 плочките остават във видимата част (над клавиатурата)', b);
ok(b.btnBottom !== null && b.btnBottom <= KB + 2, '1.4 бутонът Затвори е във видимата част, не зад клавиатурата', b);

// ---------- 2) Клавиатурата се прибира, БЕЗ resize на window: нищо от бележката не прозира ----------
await keyboard({ open: false });
await page.waitForTimeout(250);
b = await read();
ok(covers(b, W, H), '2.1 при прибрана клавиатура (само visualViewport се сменя) овърлеят е целият екран', b);
ok(b.at.y300 === 'overlay' && b.at.y700 === 'overlay' && b.at.y830 === 'overlay', '2.2 никъде под овърлея не се вижда бележка или борд', b.at);

// ---------- 3) Излизане: нулев и смален прозорец не свалят покритието ----------
await page.evaluate(() => { window.__vis.hidden = true; document.dispatchEvent(new Event('visibilitychange')); });
await setWindow({ w: 0, h: 0 });
await page.waitForTimeout(150);
b = await read();
ok(covers(b, W, H), '3.1 нулев размер на прозореца не свива овърлея', b);
await setWindow({ w: 170, h: 120 });
await page.waitForTimeout(150);
b = await read();
ok(covers(b, W, H), '3.2 смален размер на прозореца не оставя бележките на показ', b);

// ---------- 4) Връщане: плочките стоят, маха ги само жест след 400 мс ----------
await page.evaluate(() => { window.__vis.hidden = false; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus')); });
await setWindow({ w: W, h: H });
await page.waitForTimeout(200);
b = await read();
ok(covers(b, W, H) && b.visible, '4.1 след връщане в приложението плочките са цели', b);
// Вдигането и жестът в ЕДИН кадър: защитата се брои от момента на вдигане.
const keptOnReturn = await page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    const up = () => getComputedStyle(ov).display !== 'none';
    window.__vis.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    window.__vis.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    const before = up();
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    return { before, after: up() };
});
ok(keptOnReturn.before && keptOnReturn.after, '4.2 жест веднага след вдигането не маха плочките', keptOnReturn);
await page.waitForTimeout(500);
const goneByGesture = await page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    return getComputedStyle(ov).display === 'none';
});
ok(goneByGesture, '4.3 истински жест след 400 мс маха плочките');

// ---------- 5) Без бележка и без клавиатура: пак покрива целия екран ----------
await page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
await page.waitForTimeout(200);
b = await read();
ok(covers(b, W, H), '5.1 обикновено излизане: овърлеят покрива целия екран', b);
ok(b.at.y300 === 'overlay' && b.at.y830 === 'overlay', '5.2 нищо не прозира и в двата края на екрана', b.at);

// ---------- 5.3 Завъртане: ширината се взима текущата, не се помни от предишното завъртане ----------
await setWindow({ w: 844, h: 390 });
await page.waitForTimeout(220);
b = await read();
ok(b.visible && b.w === 844, '5.3 при завъртане овърлеят е колкото екрана на ширина', b);
ok(b.stackLeft !== null && b.stackLeft >= -1 && b.stackRight <= 845, '5.4 плочките остават на екрана след завъртане', b);
await setWindow({ w: W, h: H });
await page.waitForTimeout(180);
b = await read();
ok(b.visible && b.w === W, '5.5 връщане в портрет: овърлеят пак е колкото екрана', b);

ok(errs.length === 0, '6 няма изключения в конзолата', errs);

await browser.close();
srv.close();
console.log(fails ? `FAILED  OK=${n - fails} FAIL=${fails}` : `ALL OK  OK=${n} FAIL=0`);
process.exit(fails ? 1 : 0);
