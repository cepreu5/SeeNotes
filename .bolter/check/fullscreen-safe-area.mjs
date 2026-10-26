// Full screen при инсталиране: манифестът иска display: fullscreen, а изгледът пази отстъпи за
// изреза и жестовата лента. Пуска се от корена на репото:
//   node .bolter/check/fullscreen-safe-area.mjs
//   BASE=origin/cx-notes node .bolter/check/fullscreen-safe-area.mjs   (старият код: чакат се падания
//                                                                      на проверките за манифеста)
// В истински Chromium, но без истински изрез: env(safe-area-inset-*) тук е 0px, значи първата част
// проверява, че изгледът НЕ се е променил, а втората подменя двете променливи с 34px/24px и проверява
// сметката на отстъпите (calc), която иначе не може да се види на този екран.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';

// Playwright и Chromium стоят на различни места в различните компютри, затова тук се търсят, а не се
// записват твърдо (PLAYWRIGHT_MODULE / CHROME_PATH имат предимство).
const pwCandidates = [process.env.PLAYWRIGHT_MODULE,
    '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs',
    '/usr/local/lib/node_modules/playwright/index.mjs'].filter(Boolean);
let chromium = null;
for (const p of pwCandidates) {
    if (!existsSync(p)) continue;
    try { ({ chromium } = await import(p)); break; } catch { /* следващият */ }
}
if (!chromium) throw new Error('Playwright не е намерен; задай PLAYWRIGHT_MODULE=/път/до/index.mjs');
const chromeCandidates = [process.env.CHROME_PATH,
    ...(existsSync('/opt/ms-playwright') ? readdirSync('/opt/ms-playwright').filter((d) => d.startsWith('chromium-')).sort().reverse().map((d) => `/opt/ms-playwright/${d}/chrome-linux64/chrome`) : []),
    '/usr/bin/chromium', '/usr/bin/google-chrome'].filter(Boolean);
const executablePath = chromeCandidates.find((p) => existsSync(p));
if (!executablePath) throw new Error('Chromium не е намерен; задай CHROME_PATH=/път/до/chrome');

const root = path.resolve('uni');
const BASE = process.env.BASE || '';
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg' };
const read = async (p) => BASE
    ? execFileSync('git', ['show', BASE + ':uni/' + p], { maxBuffer: 64 << 20 })
    : await readFile(path.join(root, p));
const srv = http.createServer(async (req, res) => {
    const raw = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\//, '');
    const p = raw === '' ? 'index.html' : raw;
    try {
        const b = await read(p);
        res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(b);
    } catch { res.writeHead(404); res.end(); }
}).listen(8781);

let fails = 0, n = 0;
const ok = (c, m, extra) => { n++; if (!c) { fails++; console.log('FAIL', m, extra !== undefined ? JSON.stringify(extra) : ''); } else console.log('ok  ', m); };
const eq = (a, b, m) => ok(a === b, m, { got: a, want: b });

const browser = await chromium.launch({ executablePath, args: ['--num-raster-threads=4'] });
const BASE_URL = 'http://127.0.0.1:8781/';

// --- 1. Манифестът и метаданните на страницата --------------------------------------------------
const manifest = JSON.parse(await (await fetch(BASE_URL + 'manifest.webmanifest')).text());
eq(manifest.display, 'fullscreen', 'manifest: display е fullscreen');
ok(Array.isArray(manifest.display_override) && manifest.display_override[0] === 'fullscreen' && manifest.display_override.includes('standalone'),
    'manifest: display_override е [fullscreen, standalone]', manifest.display_override);
ok(!!manifest.share_target, 'manifest: share_target остава (споделянето не се пипа)');
ok(!!manifest.start_url && manifest.start_url.includes('index.html'), 'manifest: start_url непроменен', manifest.start_url);
eq(manifest.icons.length, 8, 'manifest: осемте икони са на място');

const html = await (await fetch(BASE_URL)).text();
ok(/<meta name="viewport" content="width=device-width, initial-scale=1\.0, viewport-fit=cover">/.test(html), 'index.html: viewport-fit=cover');
ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(html), 'index.html: връзката към манифеста');

const css = await (await fetch(BASE_URL + 'style.css')).text();
ok(/--safe-top: env\(safe-area-inset-top, 0px\)/.test(css), 'style.css: променливите за безопасната площ');
ok(/--safe-bottom: env\(safe-area-inset-bottom, 0px\)/.test(css), 'style.css: --safe-bottom');
const mainJs = await (await fetch(BASE_URL + 'main.js')).text();
ok(/SAFE_BOTTOM_CSS = 'env\(safe-area-inset-bottom, 0px\)'/.test(mainJs), 'main.js: помощната константа за долния отстъп');
ok((mainJs.match(/SAFE_BOTTOM_CSS/g) || []).length >= 5, 'main.js: плаващите бутони минават през нея',
    (mainJs.match(/SAFE_BOTTOM_CSS/g) || []).length);

// --- 2. Живият изглед при нулеви отстъпи (както е в браузър) -------------------------------------
// Лентата на бележките, филтърът на дъската и панелът на асистента се създават от JS едва когато
// потрябват, затова тук се мери еднотипен временен елемент със същия id/клас, ако го няма в DOM-а.
const measureBlock = `(() => {
    const measure = (sel, make) => {
        let el = document.querySelector(sel);
        const temp = !el;
        if (temp) { el = make(); document.body.appendChild(el); }
        const s = getComputedStyle(el);
        const out = { top: s.top, bottom: s.bottom, height: s.height, paddingTop: s.paddingTop, paddingBottom: s.paddingBottom, left: s.left, width: s.width };
        if (temp) el.remove();
        return out;
    };
    const el = (tag) => () => document.createElement(tag);
    const byId = (id) => () => { const d = document.createElement('div'); d.id = id; return d; };
    const bar = () => { const d = document.createElement('div'); d.id = 'open-notes-bar'; d.className = 'is-visible'; return d; };
    const byClass = (cls) => () => { const d = document.createElement('div'); d.className = cls; return d; };
    const probe = document.createElement('div');
    probe.className = 'note-window modal-overlay visible';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    const ps = getComputedStyle(probe);
    const noteWindow = { top: ps.top, height: ps.height };
    probe.remove();
    const inlineEnv = document.createElement('div');
    inlineEnv.style.position = 'fixed';
    inlineEnv.style.bottom = 'calc(10px + env(safe-area-inset-bottom, 0px))';
    document.body.appendChild(inlineEnv);
    const inlineBottom = getComputedStyle(inlineEnv).bottom;
    inlineEnv.remove();
    return {
        body: measure('body', el('div')),
        header: measure('header', el('header')),
        login: measure('.login-div', byClass('login-div')),
        noteWindow,
        bar: measure('#open-notes-bar', bar),
        filterPopup: measure('.board-filter-popup', byClass('board-filter-popup')),
        loadingPanel: measure('#kb-loading-panel', byId('kb-loading-panel')),
        inlineBottom,
        kbFabInlineBottom: document.getElementById('kb-fab')?.style.getPropertyValue('bottom') || null,
        hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        imagesBroken: [...document.images].filter((i) => i.complete && i.naturalWidth === 0).length,
    };
})()`;

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block', locale: 'bg-BG' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(BASE_URL + '?demo=1', { waitUntil: 'load' });
await page.waitForTimeout(1200);

const geometry = await page.evaluate(measureBlock);
eq(geometry.body.paddingTop, '0px', 'нулеви отстъпи: body без допълнителен отстъп');
eq(geometry.header.top, '0px', 'нулеви отстъпи: хедърът залепва на ръба, както преди');
eq(geometry.header.paddingTop, '5px', 'нулеви отстъпи: вътрешният отстъп на хедъра е 5px');
eq(geometry.login.paddingTop, '16px', 'нулеви отстъпи: екранът за вход е с 1em отгоре');
eq(geometry.noteWindow.top, '0px', 'нулеви отстъпи: прозорецът на бележка започва от ръба');
eq(geometry.noteWindow.height, '844px', 'нулеви отстъпи: прозорецът е висок колкото екрана');
eq(geometry.bar.height, '52px', 'нулеви отстъпи: лентата на бележките е 52px');
eq(geometry.bar.paddingBottom, '6px', 'нулеви отстъпи: вътрешният отстъп на лентата е 6px');
eq(geometry.filterPopup.bottom, '20px', 'нулеви отстъпи: филтърът на дъската е на 20px');
eq(geometry.loadingPanel.bottom, '80px', 'нулеви отстъпи: панелът на асистента е на 80px');
eq(geometry.inlineBottom, '10px', 'inline calc с env() се смята до 10px');
eq(geometry.hScroll, 0, 'няма хоризонтален скрол на 390');
eq(geometry.imagesBroken, 0, 'всички снимки се зареждат');

// --- 3. Същите елементи, но с отстъпи като на телефон с изрез и жестова лента ---------------------
await page.addStyleTag({ content: ':root{--safe-top:34px;--safe-bottom:24px;--safe-left:0px;--safe-right:0px;}' });
await page.waitForTimeout(150);
const withInsets = await page.evaluate(measureBlock);
eq(withInsets.body.paddingTop, '0px', 'с изрез: съдържанието не се мести (хедърът покрива изреза)');
eq(withInsets.header.top, '0px', 'с изрез: хедърът залепва за самия ръб');
eq(withInsets.header.paddingTop, '39px', 'с изрез: съдържанието на хедъра започва под камерата');
eq(withInsets.login.paddingTop, '50px', 'с изрез: екранът за вход също пази изреза');
eq(withInsets.noteWindow.top, '34px', 'с изрез: бележката не влиза под камерата');
eq(withInsets.noteWindow.height, '786px', 'с изрез и жестова лента: 844 - 34 - 24');
eq(withInsets.bar.height, '76px', 'жестова лента: лентата на бележките расте с 24px');
eq(withInsets.bar.paddingBottom, '30px', 'жестова лента: плочките се качват над нея');
eq(withInsets.filterPopup.bottom, '44px', 'жестова лента: филтърът на дъската над нея');
eq(withInsets.loadingPanel.bottom, '104px', 'жестова лента: панелът на асистента над нея');

// --- 4. Широк екран -----------------------------------------------------------------------------
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForTimeout(200);
const wide = await page.evaluate(measureBlock);
eq(wide.hScroll, 0, 'няма хоризонтален скрол на 1280');
eq(wide.header.paddingTop, '39px', 'на широк екран хедърът също пази изреза');


ok(errors.length === 0, 'няма грешки в конзолата', errors.slice(0, 5));

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минават${fails ? ' — ИМА ПАДЕНИ' : ''}`);
process.exit(fails ? 1 : 0);
