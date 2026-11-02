// Защитен екран: плътен фон и забрана да слезе, докато приложението е скрито или без фокус.
//
// Защо: собственикът вижда бележките в кадъра за списъка с приложенията на Android. Две причини:
//   1) фонът на овърлея беше полупрозрачен (rgba(8,10,14,0.55) + blur). Кадърът за списъка се
//      снима без ефектите на слоя, затова около плочките се виждаше бележката.
//   2) овърлеят можеше да слезе, докато страницата вече е скрита или прозорецът е без фокус —
//      точно когато Android прави кадъра.
// Затова: плътен непрозрачен фон без blur и отказ за сваляне при document.hidden или без фокус.
// Ръчният бутон „Затвори“ сваля винаги.
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1, мобилен контекст 390x844):
//   1) фонът на овърлея е напълно непрозрачен и няма backdrop-filter;
//   2) овърлеят покрива целия екран и плочките са отгоре му;
//   3) privacyHide() не сваля овърлея, докато document.hidden е true (и оставя ред refused);
//   4) privacyHide() не сваля овърлея, когато документът е без фокус (и оставя ред refused);
//   5) с фокус и видима страница privacyHide() сваля овърлея както преди;
//   6) бутонът „Затвори“ сваля овърлея и без фокус;
//   7) старото поведение остава: blur показва, focus без скриване маха, focus след скриване пази;
//   8) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/privacy-opaque-and-no-hide.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (за да се провери, че тестът хваща старата версия).
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
});

await page.goto(`${ORIGIN}/${PAGE}?demo=1&privacydebug=1`, { waitUntil: 'load' });
const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
    || document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
    .then(() => true, () => false);
await page.waitForTimeout(1600);
ok(ready, '1. приложението тръгна');

const state = () => page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    if (!ov) return { exists: false };
    const cs = getComputedStyle(ov);
    return {
        exists: true,
        visible: cs.display !== 'none',
        background: cs.backgroundColor,
        backgroundImage: cs.backgroundImage,
        backdrop: cs.backdropFilter || cs.webkitBackdropFilter || '',
        rect: { w: ov.getBoundingClientRect().width, h: ov.getBoundingClientRect().height },
        tiles: ov.querySelectorAll('.privacy-tile').length
    };
});
const logLines = () => page.evaluate(() => (window.privacyDebugText ? window.privacyDebugText().split('\n').filter(Boolean) : []));
const lastLine = (lines, kind) => [...lines].reverse().find(l => l.indexOf(' ' + kind + ' [') >= 0) || '';
const show = () => page.evaluate(() => window.privacyOverlayShow());
const hide = () => page.evaluate(() => window.privacyOverlayHide());
const setFocus = (v) => page.evaluate((v) => {
    if (v === null) { delete document.hasFocus; return; }
    Object.defineProperty(document, 'hasFocus', { configurable: true, value: () => v });
}, v);
const setHidden = (v) => page.evaluate((v) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => v });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (v ? 'hidden' : 'visible') });
    document.dispatchEvent(new Event('visibilitychange'));
}, v);

// ---------- 1) плътен фон ----------
await show();
let s = await state();
const alpha = (() => {
    const m = /rgba?\(([^)]+)\)/.exec(s.background || '');
    if (!m) return 1;
    const parts = m[1].split(',').map(x => parseFloat(x));
    return parts.length === 4 ? parts[3] : 1;
})();
ok(s.exists && s.visible, '1.1 овърлеят се показва', s);
ok(alpha === 1, '1.2 фонът е напълно непрозрачен (alpha=1)', s.background);
ok(!/rgba\([^)]*,\s*0?\.\d+\s*\)/.test(s.backgroundImage || ''), '1.3 градиентът няма прозрачни цветове', s.backgroundImage);
ok((s.backdrop || 'none') === 'none', '1.4 няма backdrop-filter (blur)', s.backdrop);
const px = await page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    const cs = getComputedStyle(ov);
    return { display: cs.display, zIndex: cs.zIndex, position: cs.position };
});
ok(px.display === 'flex' && px.position === 'fixed', '1.5 овърлеят е fixed и покрива екрана', px);

// ---------- 2) размери и плочки ----------
ok(Math.round(s.rect.w) === W && Math.round(s.rect.h) === H, '2.1 овърлеят е точно колкото екрана', s.rect);
ok(s.tiles === 2, '2.2 двете плочки са в овърлея', s.tiles);
const tileOnTop = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 4);
    const ov = document.getElementById('privacy-overlay');
    return !!(el && ov && (el === ov || ov.contains(el)));
});
ok(tileOnTop, '2.3 в точка от екрана най-отгоре е овърлеят, не бележката');

// ---------- 3) отказ при скрита страница ----------
await setHidden(true);
await hide();
s = await state();
ok(s.visible, '3.1 при скрита страница privacyHide() не сваля овърлея', s);
let lines = await logLines();
let h = lastLine(lines, 'hide');
ok(/refused: page hidden/.test(h), '3.2 в записа пише защо не е слязъл', h);
await setHidden(false);
s = await state();
ok(s.visible, '3.3 след връщане на видимостта овърлеят още стои (чака ръчно затваряне)', s);
await hide();
s = await state();
ok(!s.visible, '3.4 при видима страница и фокус privacyHide() вече сваля овърлея', s);

// ---------- 4) отказ без фокус ----------
await show();
await setFocus(false);
await hide();
s = await state();
ok(s.visible, '4.1 без фокус privacyHide() не сваля овърлея', s);
lines = await logLines();
h = lastLine(lines, 'hide');
ok(/refused: no focus/.test(h), '4.2 в записа пише, че няма фокус', h);
await setFocus(null);

// ---------- 5) с фокус сваля както преди ----------
await hide();
s = await state();
ok(s.exists && !s.visible, '5.1 с фокус и видима страница овърлеят слиза', s);

// ---------- 6) бутонът „Затвори“ сваля и без фокус ----------
await show();
await setFocus(false);
await page.evaluate(() => { const b = document.querySelector('#privacy-overlay .privacy-close'); if (b) b.click(); });
await page.waitForTimeout(60);
s = await state();
ok(s.exists && !s.visible, '6.1 „Затвори“ сваля овърлея и без фокус', s);
await setFocus(null);

// ---------- 7) старото поведение ----------
const blurNow = () => page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    const ov = document.getElementById('privacy-overlay');
    return ov ? getComputedStyle(ov).display !== 'none' : false;
});
const focusNow = () => page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    const ov = document.getElementById('privacy-overlay');
    return ov ? getComputedStyle(ov).display !== 'none' : false;
});
ok(await blurNow(), '7.1 blur показва защитния екран');
const afterFocus = await focusNow();
ok(!afterFocus, '7.2 focus след blur без скриване маха овърлея');
ok(await blurNow(), '7.3 blur показва отново');
await setHidden(true);
await focusNow();
s = await state();
ok(s.visible, '7.4 focus след истинско скриване пази овърлея');
await hide();
s = await state();
ok(s.visible, '7.5 и след това privacyHide() при скрита страница пак не го маха', s);
await setHidden(false);

// ---------- 8) конзола ----------
ok(errs.length === 0, '8.1 няма изключения в конзолата', errs.slice(0, 3));

await browser.close();
srv.close();
console.log(`\n${fails === 0 ? 'OK' : 'FAILED'} ${n - fails}/${n}`);
process.exit(fails === 0 ? 0 : 1);
