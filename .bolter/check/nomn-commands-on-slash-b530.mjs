// nomn b5.30: списъкът с командите излиза още при въвеждане на самото „/“, без да се чака „?“.
// Собственик (11.11.2026): „/ командите да се показват още при въвеждане на / , да не чака ?“.
//
// Проверява се:
//   1) статично: има isCommandsHelpInput, който приема и самотo „/“, input и focus ползват същата
//      проверка, sw.js е nomn-b5.30;
//   2) в истински Chromium: при набрано „/“ попъпът с командите се показва веднага, редовете са
//      всички команди, включително /9;
//   3) след „/9“ списъкът се скрива и търсенето продължава в разширен режим (както преди);
//   4) „/?“ и „/help“ още показват списъка;
//   5) при фокус в полето със самотно „/“ списъкът пак излиза;
//   6) клик по ред с „/9“ оставя „/adv “ в полето;
//   7) без грешки в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/nomn-commands-on-slash-b530.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const PLAYWRIGHT = [
    '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs',
    'playwright'
].find(p => p === 'playwright' || existsSync(p));
const { chromium } = await import(PLAYWRIGHT);
const CHROME = [
    '/opt/ms-playwright/chromium-1248/chrome-linux64/chrome',
    '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome'
].find(p => existsSync(p));

const root = path.resolve(process.env.ROOT || 'nomn');

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index.html' : p;
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
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : ''));
    if (!cond) fails++;
};
const done = async (browser) => {
    if (browser) await browser.close();
    srv.close();
    console.log(fails ? 'FAILED' : `OK ${n - fails}/${n}`);
    process.exit(fails ? 1 : 0);
};

// --- 1. Статично -------------------------------------------------------------------------------
const mainJs = await readFile(path.join(root, 'main.js'), 'utf8');
const sw = await readFile(path.join(root, 'sw.js'), 'utf8');
const helper = (mainJs.match(/function isCommandsHelpInput\(value\)[\s\S]*?\n\}/) || [''])[0];
ok(!!helper, 'има isCommandsHelpInput');
ok(/v === '\/'/.test(helper), 'самотното „/“ се приема за показване на командите', helper.slice(0, 200));
ok(/v === '\/\?'/.test(helper) && /v === '\/help'/.test(helper), '„/?“ и „/help“ продължават да показват командите');
ok(/if \(isCommandsHelpInput\(val\)\) \{\s*\n\s*renderCommandsHelpPopup\(\);/.test(mainJs),
    'при въвеждане показването минава през isCommandsHelpInput');
ok(/if \(isCommandsHelpInput\(searchBox\.value\.trim\(\)\)\) \{\s*\n\s*renderCommandsHelpPopup\(\);/.test(mainJs),
    'при фокус показването минава през isCommandsHelpInput');
ok(/CACHE_NAME = 'nomn-b5\.30'/.test(sw), 'sw.js е вдигнат на nomn-b5.30');

// --- 2. Живият път ----------------------------------------------------------------------------
const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
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
});

await page.goto(`${ORIGIN}/index.html?demo=1`, { waitUntil: 'load' });
const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 30000 }).then(() => true, () => false);
ok(ready, 'приложението се вдигна');
if (!ready) await done(browser);

const popupState = () => page.evaluate(() => {
    const popup = document.getElementById('saved-searches-popup');
    if (!popup) return { present: false };
    const rows = [...popup.querySelectorAll('.saved-search-item')].map(r => r.textContent);
    return { present: true, display: popup.style.display, rows };
});

// 2) самото „/“ вече показва командите
await page.click('#search-box');
await page.fill('#search-box', '');
await page.type('#search-box', '/');
await page.waitForTimeout(150);
const atSlash = await popupState();
ok(atSlash.present && atSlash.display === 'block', 'при набрано „/“ попъпът е показан веднага', atSlash);
ok((atSlash.rows || []).length >= 10, 'редовете с командите са всички', (atSlash.rows || []).length);
ok((atSlash.rows || []).some(t => t.includes('/9')), 'сред тях е и /9 (разширено търсене)', atSlash.rows);

// 3) „/9“ вече не държи списъка, но вдига разширения режим
await page.type('#search-box', '9');
await page.waitForTimeout(150);
const afterNine = await popupState();
ok(afterNine.display === 'none', 'при „/9“ списъкът се затваря', afterNine);
const lexMode = await page.evaluate(() => {
    const box = document.getElementById('search-box');
    return { value: box.value, lex: typeof parseSearchQuery === 'function' ? !!parseSearchQuery(box.value).lex : null };
});
ok(lexMode.lex === true, '„/9“ продължава да е разширено търсене', lexMode);

// 4) „/?“ и „/help“ още показват списъка
for (const v of ['/?', '/help']) {
    await page.fill('#search-box', '');
    await page.type('#search-box', v);
    await page.waitForTimeout(150);
    const st = await popupState();
    ok(st.display === 'block', `при „${v}“ списъкът се показва`, st);
}

// 5) фокус със самотно „/“ също показва списъка
await page.evaluate(() => {
    const popup = document.getElementById('saved-searches-popup');
    const box = document.getElementById('search-box');
    box.value = '/';
    popup.style.display = 'none';
    box.blur();
});
await page.click('#search-box');
await page.waitForTimeout(150);
const onFocus = await popupState();
ok(onFocus.display === 'block', 'при фокус със самотно „/“ списъкът излиза', onFocus);

// 6) клик по реда с „/9“ оставя „/adv “ в полето
const clicked = await page.evaluate(() => {
    const popup = document.getElementById('saved-searches-popup');
    const row = [...popup.querySelectorAll('.saved-search-item')].find(r => (r.textContent || '').includes('/9'));
    if (!row) return { found: false };
    row.click();
    return { found: true, value: document.getElementById('search-box').value, display: popup.style.display };
});
ok(clicked.found && clicked.value === '/adv ' && clicked.display === 'none',
    'клик по „/9“ оставя „/adv “ в полето и затваря списъка', clicked);

// 7) конзола
ok(errs.length === 0, 'без грешки в конзолата', errs);

await done(browser);
