// Логото в хедъра се вижда и на телефон (31.10.2026)
//
// Решение на собственика: „Не на двете места само в uni“ — промяната е само в uni, MNV остава
// както си беше (там логото продължава да се крие под 480px).
// Дотогава style.css криеше логото с @media (max-width: 480px), значи на телефон то изчезваше —
// а точно там хедърът е в колона от три реда и логото има място до заглавието. Освен това логото е
// натискаемото място за защитния овърлей, значи на телефон функцията беше недостъпна.
//
// Какво проверява (истински Chromium):
//   1) при 320x568, 390x844 и 480x800 логото се вижда, има размери и е вътре в хедъра;
//   2) при 390x844 хедърът остава колона, заглавието е вдясно от логото (не се застъпват),
//      полето за търсене не пада под 300px и страницата не получава хоризонтален скрол;
//   3) хедърът при 390x844 не става по-висок от 240px и не получава пети ред;
//   4) при 599x900 и 1280x900 логото се вижда както преди;
//   5) в завъртян екран 844x390 хедърът е на един ред и логото остава скрито (както преди);
//   6) при 390x844 натискане на логото вдига защитния овърлей;
//   7) няма изключения в конзолата.
//
// Пускане от корена на хранилището:
//   APP=uni ROOT=uni node .bolter/check/header-logo-three-rows.mjs
// (само за uni — в MNV по решение на собственика логото остава скрито под 480px)
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

const APP = process.env.APP || 'uni';
const PAGE = process.env.PAGE || (APP === 'MNV' ? 'index-2.html' : 'index.html');
const root = path.resolve(process.env.ROOT || APP);
console.log(`     (${APP}: ${root}/${PAGE})`);

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

const open = async (W, H) => {
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block',
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36'
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
        localStorage.setItem('lang', 'bg');
        localStorage.setItem('hideAssistant', 'false');
        localStorage.setItem('showBoardAll', 'true');
        localStorage.setItem('startBoard', 'all');
    });
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' }).catch(() => { });
    await page.waitForTimeout(2600);
    return { ctx, page, errs };
};

const geo = (page) => page.evaluate(() => {
    const header = document.querySelector('header');
    const hr = header.getBoundingClientRect();
    const logo = header.querySelector('.header-logo');
    const lb = logo.getBoundingClientRect();
    const ls = getComputedStyle(logo);
    const h1 = header.querySelector('h1');
    const hb = h1 ? h1.getBoundingClientRect() : null;
    const hs = h1 ? getComputedStyle(h1) : null;
    const titleBox = h1 ? h1.parentElement.getBoundingClientRect() : null;
    const tbs = h1 ? getComputedStyle(h1.parentElement) : null;
    const search = document.getElementById('search-wrapper');
    const sb = search ? search.getBoundingClientRect() : null;
    const kids = [...header.children].filter(el => {
        const s = getComputedStyle(el);
        const b = el.getBoundingClientRect();
        return s.display !== 'none' && b.height > 0;
    }).map(el => Math.round(el.getBoundingClientRect().top));
    return {
        headerH: Math.round(hr.height),
        headerTop: Math.round(hr.top),
        headerBottom: Math.round(hr.bottom),
        headerW: Math.round(hr.width),
        flexDir: getComputedStyle(header).flexDirection,
        rows: [...new Set(kids)].length,
        logo: {
            display: ls.display, w: Math.round(lb.width), h: Math.round(lb.height),
            top: Math.round(lb.top), right: Math.round(lb.right), visible: ls.display !== 'none' && lb.width > 1 && lb.height > 1
        },
        titleBox: titleBox ? {
            left: Math.round(titleBox.left), right: Math.round(titleBox.right), top: Math.round(titleBox.top),
            display: tbs.display
        } : null,
        title: hb ? { w: Math.round(hb.width), left: Math.round(hb.left), display: hs.display } : null,
        search: sb ? { w: Math.round(sb.width), top: Math.round(sb.top) } : null,
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth
    };
});

// 1) Телефон в портрет: логото се вижда.
for (const [W, H] of [[320, 568], [390, 844], [480, 800]]) {
    const { ctx, page, errs } = await open(W, H);
    const g = await geo(page);
    ok(g.logo.visible, `${W}x${H}: логото се вижда`, g.logo);
    ok(g.logo.h >= 30 && g.logo.w >= 30, `${W}x${H}: логото има реални размери`, g.logo);
    ok(g.logo.top >= g.headerTop && g.logo.top < g.headerBottom, `${W}x${H}: логото е вътре в хедъра`, { logo: g.logo.top, header: [g.headerTop, g.headerBottom] });
    if (W === 390) {
        ok(g.flexDir === 'column', '390x844: хедърът е в колона (три реда)', g.flexDir);
        ok(!!g.title && g.title.left >= g.logo.right - 2, '390x844: заглавието е вдясно от логото, не се застъпват',
            { titleLeft: g.title && g.title.left, logoRight: g.logo.right });
        ok(g.title && g.title.display !== 'none' && g.title.w > 60, '390x844: заглавието се вижда', g.title);
        ok(!!g.search && g.search.w >= 300, '390x844: полето за търсене не пада под 300px', g.search);
        ok(g.scrollW <= g.clientW + 1, '390x844: няма хоризонтален скрол', { scrollW: g.scrollW, clientW: g.clientW });
        ok(g.headerH <= 240, '390x844: хедърът не е по-висок от 240px', g.headerH);
        ok(g.rows <= 4, '390x844: хедърът не е получил нов ред', { rows: g.rows });
    }
    ok(errs.length === 0, `${W}x${H}: няма изключения в конзолата`, errs);
    await ctx.close();
}

// 2) По-широки екрани: както преди.
for (const [W, H] of [[599, 900], [1280, 900]]) {
    const { ctx, page } = await open(W, H);
    const g = await geo(page);
    ok(g.logo.visible, `${W}x${H}: логото се вижда`, g.logo);
    await ctx.close();
}

// 3) Завъртян екран: хедърът е на един ред, логото остава скрито (това не се променя).
{
    const { ctx, page } = await open(844, 390);
    const g = await geo(page);
    ok(g.flexDir === 'row', '844x390: хедърът е на един ред', g.flexDir);
    ok(!g.logo.visible, '844x390: логото остава скрито, за да не вдигне едноредовия хедър', g.logo);
    await ctx.close();
}

// 4) Натискането на логото на телефон вдига защитния овърлей.
{
    const { ctx, page, errs } = await open(390, 844);
    const shown0 = await page.evaluate(() => {
        const o = document.querySelector('.privacy-overlay');
        return !!o && getComputedStyle(o).display !== 'none';
    });
    ok(!shown0, '390x844: овърлеят не се вижда в началото');
    await page.click('header .header-logo', { force: true }).catch(() => { });
    await page.waitForTimeout(300);
    const shown = await page.evaluate(() => {
        const o = document.querySelector('.privacy-overlay');
        return !!o && getComputedStyle(o).display !== 'none' && o.classList.contains('is-visible');
    });
    ok(shown, '390x844: натискане на логото вдига защитния овърлей');
    ok(errs.length === 0, '390x844: няма изключения след натискането', errs);
    await ctx.close();
}

await browser.close();
srv.close();
console.log(fails === 0 ? `\n ${n}/${n} проверки минаха` : `\n ${n - fails}/${n} проверки минаха, ${fails} ПРОВАЛИ`);
process.exit(fails === 0 ? 0 : 1);
