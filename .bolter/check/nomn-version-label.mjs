// nomn: версията в Настройки (b5.01).
//
// Изискване на собственика (6.11.2026): „формата на версията в sw.js не отговаря на
// изискванията и по тази причина не се показва в Настройки. Направи версията в nomn b5.01".
//
// Причината: versionFromCacheName() в nomn/main.js приемаше само имена от вида
// 'cx-notes-b3.74' (nomn е копие на uni), а кешът на nomn се казваше 'nomn-1.3'.
// Нищо не съвпадаше, version оставаше null и редът „CX Notes ver. …" се скриваше.
//
// Какво проверява (истински Chromium, кодът от nomn/):
//   1) форматът в sw.js е nomn-b5.01 и парсерът го обръща в 'Beta 5.01';
//   2) при първо отваряне (без активен service worker, версията се чете от sw.js по мрежата)
//      надписът в Настройки е 'Beta 5.01' и редът е видим;
//   3) при активен service worker (версията идва по GET_VERSION) надписът е същият;
//   4) парсерът приема и стария формат cx-notes-b… и отхвърля 'nomn-1.3';
//   5) няма непохванати грешки в страницата.
//
// Пускане от корена на хранилището: node .bolter/check/nomn-version-label.mjs
// ROOT=… сочи друга папка на приложението (контрола срещу предишната версия на nomn/).
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

const root = path.resolve(process.env.ROOT || 'nomn');
const PAGE = 'index.html';
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

// --- 1) форматът във файловете -------------------------------------------------
const swSource = await readFile(path.join(root, 'sw.js'), 'utf8');
const cacheName = (/const\s+CACHE_NAME\s*=\s*'([^']+)'/.exec(swSource) || [])[1] || null;
ok(!!cacheName, '1.1 sw.js има CACHE_NAME', cacheName);
ok(/^(?:cx-notes|nomn)-b\d/.test(String(cacheName || '')), '1.2 името на кеша е от вида nomn-b5.01 (иначе версията не се разпознава)', cacheName);
// Версията не се заковава в теста: вдигането на CACHE_NAME не бива да чупи проверката.
// Иска се само форматът, а надписът по-долу се сравнява точно с това име.
ok(/^nomn-b\d+\.\d+$/.test(String(cacheName || '')), '1.3 CACHE_NAME е от вида nomn-b5.0x', cacheName);
const EXPECTED = 'Beta ' + String(cacheName || '').replace(/^nomn-b/, '');

const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });

const openApp = async ({ blockServiceWorkers }) => {
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, hasTouch: true, isMobile: true,
        timezoneId: 'Europe/Sofia',
        serviceWorkers: blockServiceWorkers ? 'block' : 'allow'
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
    await page.addInitScript(() => {
        localStorage.setItem('language', 'bg');
        localStorage.setItem('hideAssistant', 'true');
    });
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'domcontentloaded' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 30000 })
        .then(() => true, () => false);
    return { ctx, page, errs, ready };
};

// Надписът се създава при старт; чакаме да се появи, за да не четем празно.
const versionLabel = async (page) => {
    await page.waitForFunction(() => !!document.querySelector('#settings-modal .app-version-label'), null, { timeout: 15000 })
        .catch(() => {});
    return page.evaluate(() => {
        const title = document.querySelector('#settings-modal .modal-content-box h3');
        const label = document.querySelector('#settings-modal .app-version-label');
        return {
            exists: !!label,
            text: label ? label.textContent : null,
            titleText: title ? title.textContent.replace(/\s+/g, ' ').trim() : null,
            titleDisplay: title ? getComputedStyle(title).display : null
        };
    });
};

// --- 2) първо отваряне: версията се чете от sw.js по мрежата -------------------
{
    const { ctx, page, errs, ready } = await openApp({ blockServiceWorkers: true });
    ok(ready, '2.1 приложението стартира');
    const v = await versionLabel(page);
    ok(v.exists, '2.2 в Настройки има елемент за версията', v);
    ok(v.text === EXPECTED, `2.3 надписът е „${EXPECTED}"`, v);
    ok(v.titleDisplay !== 'none', '2.4 редът с версията е видим (не е скрит)', v);
    ok(String(v.titleText || '').includes(EXPECTED), '2.5 редът в Настройки показва версията', v);

    // Отваряне на самите Настройки: надписът трябва да се вижда на екрана.
    await page.click('#settings_button').catch(() => {});
    const modalOpen = await page.waitForSelector('#settings-modal.visible', { timeout: 10000 }).then(() => true, () => false);
    ok(modalOpen, '2.6 Настройки се отварят');
    if (modalOpen) {
        const box = await page.evaluate(() => {
            const label = document.querySelector('#settings-modal .app-version-label');
            if (!label) return null;
            const r = label.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height), text: label.textContent };
        });
        ok(!!box && box.w > 0 && box.h > 0, '2.7 надписът се вижда в отворените Настройки', box);
    }
    const real = errs.filter(e => !/favicon|net::ERR/i.test(e));
    ok(real.length === 0, '2.8 няма грешки в страницата', real.slice(0, 3));
    await ctx.close();
}

// --- 3) с активен service worker: версията идва по GET_VERSION ----------------
{
    const { ctx, page, errs, ready } = await openApp({ blockServiceWorkers: false });
    ok(ready, '3.1 приложението стартира');
    const swReady = await page.evaluate(async () => {
        try {
            await navigator.serviceWorker.ready;
            return true;
        } catch { return false; }
    });
    ok(swReady, '3.2 service worker-ът е активен');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 30000 }).catch(() => {});
    const controlled = await page.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    ok(controlled, '3.3 страницата се обслужва от service worker');
    const v = await versionLabel(page);
    ok(v.text === EXPECTED, `3.4 надписът пак е „${EXPECTED}" (по съобщение от service worker-а)`, v);
    const real = errs.filter(e => !/favicon|net::ERR/i.test(e));
    ok(real.length === 0, '3.5 няма грешки в страницата', real.slice(0, 3));
    await ctx.close();
}

// --- 4) парсерът: приема двата формата и отхвърля стария ---------------------
{
    const { ctx, page } = await openApp({ blockServiceWorkers: true });
    const parsed = await page.evaluate((cn) => {
        if (typeof versionFromCacheName !== 'function') return null;
        return [
            versionFromCacheName(cn),
            versionFromCacheName('cx-notes-b3.74'),
            versionFromCacheName('nomn-1.3'),
            versionFromCacheName('')
        ];
    }, cacheName);
    ok(Array.isArray(parsed), '4.1 versionFromCacheName съществува');
    ok(JSON.stringify(parsed) === JSON.stringify([EXPECTED, 'Beta 3.74', null, null]),
        '4.2 разпознава nomn-b5.01 и cx-notes-b3.74, отхвърля nomn-1.3', parsed);
    await ctx.close();
}

await browser.close();
srv.close();

console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails === 0 ? 'PASSED' : 'FAILED');
process.exit(fails === 0 ? 0 : 1);
