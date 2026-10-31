// Клик върху логото в хедъра вдига защитния овърлей (b3.39)
//
// Собственикът (31.10.2026): „покажи защитния овърлей при клик на логото на приложението в хедъра“.
// Дотук овърлеят излизаше само при излизане от приложението (blur / visibilitychange) и то само в
// режим на екран на приложението. Сега логото (img.header-logo в хедъра) го вдига и ръчно.
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1, мобилен контекст с докосване):
//   1) логото се вижда в хедъра (на 1280 - на телефон под 480px то е скрито от CSS);
//   2) след клик върху него овърлеят е на екрана, покрива целия екран и двете плочки са цели;
//   3) кликът не отваря нищо друго (никакъв прозорец на бележка, никакъв диалог);
//   4) работи и в обикновен таб, не само в режим на екран на приложението;
//   5) работи и когато има отворена бележка - овърлеят е НАД нея;
//   6) бутонът „Затвори“ го маха;
//   7) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/logo-shows-privacy-overlay.mjs   (exit 1 при провал)
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

// appScreen=true подменя само display-mode заявките (Playwright не пуска истински standalone прозорец).
const openApp = async (appScreen, vw = W, vh = H) => {
    const ctx = await browser.newContext({
        viewport: { width: vw, height: vh }, isMobile: vw < 900, hasTouch: true, deviceScaleFactor: 2,
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
    await page.waitForTimeout(1200);
    return { ctx, page, errs, ready };
};

const logoBox = (page) => page.evaluate(() => {
    const img = document.querySelector('header .header-logo') || document.querySelector('.header-logo');
    if (!img) return null;
    const r = img.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
});

// Състояние на овърлея: видим ли е, покрива ли екрана, цели ли са плочките, какво има в центъра.
const overlayState = (page) => page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    const out = { present: !!ov, visible: false, tiles: 0, tilesOnScreen: 0, coversScreen: false, stackOnScreen: false, centerTop: null, windows: document.querySelectorAll('.note-window.visible').length, closeBtn: false };
    if (!ov) return out;
    const cs = getComputedStyle(ov);
    const b = ov.getBoundingClientRect();
    out.visible = ov.classList.contains('is-visible') && cs.display !== 'none' && Number(cs.opacity) > 0.5 && b.width > 0;
    out.zIndex = cs.zIndex;
    out.coversScreen = Math.abs(b.left) <= 1 && Math.abs(b.top) <= 1 && Math.abs(b.width - innerWidth) <= 1 && Math.abs(b.height - innerHeight) <= 1;
    const tiles = [...ov.querySelectorAll('.privacy-tile')].map(t => t.getBoundingClientRect());
    out.tiles = tiles.length;
    out.tilesOnScreen = tiles.filter(r => r.width > 50 && r.top >= -1 && r.bottom <= innerHeight + 1).length;
    const stack = ov.querySelector('.privacy-stack');
    if (stack) { const s = stack.getBoundingClientRect(); out.stackOnScreen = s.top >= -1 && s.bottom <= innerHeight + 1 && s.width > 50; }
    out.closeBtn = !!ov.querySelector('.privacy-close');
    const top = document.elementsFromPoint(innerWidth / 2, innerHeight / 2)[0];
    out.centerTop = top ? (top.id || (typeof top.className === 'string' ? top.className.split(' ')[0] : top.tagName)) : null;
    return out;
});

const clickLogo = async (page) => {
    const box = await logoBox(page);
    if (!box) return false;
    await page.mouse.click(box.x, box.y);
    await page.waitForTimeout(600);
    return true;
};

// ---------------------------------------------------------------- 1) обикновен таб, без бележка
{
    const { ctx, page, errs, ready } = await openApp(false, 1280, 900);
    ok(ready, '1: приложението стартира');
    const box = await logoBox(page);
    ok(!!box, '1: логото се вижда в хедъра', box);
    const before = await overlayState(page);
    ok(!before.visible, '1: преди клика овърлей няма на екрана', before);

    ok(await clickLogo(page), '1: кликнато е върху логото');
    const after = await overlayState(page);
    ok(after.visible, '1: след клик върху логото овърлеят е на екрана', after);
    ok(after.coversScreen, '1: овърлеят покрива целия екран', after);
    ok(after.tiles === 2 && after.tilesOnScreen === 2, '1: двете плочки са цели на екрана', after);
    ok(after.closeBtn, '1: има бутон „Затвори“', after);
    ok(after.windows === 0, '1: кликът не е отворил прозорец на бележка', after);
    ok(typeof after.centerTop === 'string' && !/note-window/.test(after.centerTop), '1: в центъра на екрана е овърлеят, не бележка', after);

    await page.screenshot({ path: path.join('.bolter/check', 'logo-shows-privacy-overlay-1280.png') });

    // Затваряне
    await page.click('#privacy-overlay .privacy-close');
    await page.waitForTimeout(600);
    const closed = await overlayState(page);
    ok(!closed.visible, '1: бутонът „Затвори“ маха овърлея', closed);
    ok(errs.length === 0, '1: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------------------------------------------------------------- 2) режим на екран на приложението, с отворена бележка
{
    const { ctx, page, errs, ready } = await openApp(true, 1280, 900);
    ok(ready, '2: приложението стартира');
    const cards = page.locator('#notes-container .note');
    await cards.nth(0).click();
    await page.waitForTimeout(900);
    const opened = await page.evaluate(() => document.querySelectorAll('.note-window.visible').length);
    ok(opened === 1, '2: бележката е отворена', opened);

    ok(await clickLogo(page), '2: кликнато е върху логото при отворена бележка');
    const after = await overlayState(page);
    ok(after.visible, '2: овърлеят е на екрана', after);
    ok(after.coversScreen && after.stackOnScreen, '2: овърлеят покрива екрана и плочките са цели', after);
    ok(String(after.centerTop || '').startsWith('privacy') || after.centerTop === 'privacy-stack', '2: овърлеят е НАД отворената бележка', after);
    ok(errs.length === 0, '2: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

await browser.close();
srv.close();
console.log(fails === 0 ? `ALL OK (${n})` : `FAILED (${fails}/${n})`);
process.exit(fails === 0 ? 0 : 1);
