// Режим Редактиране: текстът плътно до линиите на горния и долния хедър (b3.40)
//
// Собственикът (31.10.2026): „добави и в режим Редактиране текста да приближава плътно до линиите,
// отделящи горния и долния хедър - в момента има неизползвано пространство“.
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1):
//   1) на 390x844: редът с форматиране има линия отдолу; полето за писане започва до 6px под нея;
//   2) долу: полето свършва до 4px над линията на долната лента;
//   3) вертикалните отстъпи на полето са 3px, страничните са 10px (текстът не стига до ръба);
//   4) същото на 1280x900;
//   5) режимът за четене не е пипан: там текстът не залепва за горната лента;
//   6) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/edit-mode-text-tight.mjs   (exit 1 при провал)
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

const openNote = async (W, H, edit) => {
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, isMobile: W < 900, hasTouch: true, deviceScaleFactor: 2,
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
    });
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        && document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    await page.waitForTimeout(800);
    if (ready) {
        await page.locator('#notes-container .note').first().click();
        await page.waitForTimeout(900);
    }
    if (ready && edit) {
        await page.evaluate(() => { const b = document.getElementById('note-edit-btn'); if (b) b.click(); });
        await page.waitForTimeout(1200);
    }
    return { ctx, page, errs, ready };
};

// Геометрия на режима Редактиране: линията под лентата, полето за писане, линията на долната лента.
const editGeo = (page) => page.evaluate(() => {
    const win = document.querySelector('.note-window.visible');
    if (!win) return { ok: false };
    const box = win.querySelector('.modal-content-box');
    const headerBar = win.querySelector('.modal-header-toolbar');
    const editToolbar = win.querySelector('.modal-edit-toolbar');
    const body = win.querySelector('.nw-modal-body');
    const areas = [...win.querySelectorAll('.nw-modal-body textarea')];
    const foot = win.querySelector('.modal-footer-toolbar');
    const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height), left: Math.round(r.left) }; };
    const cs = ta => ta ? getComputedStyle(ta) : null;
    const bodyTa = areas.length ? areas[areas.length - 1] : null;
    const titleTa = areas.length > 1 ? areas[0] : null;
    const firstTa = areas.length ? areas[0] : null;
    const bcs = cs(bodyTa);
    const tcs = cs(titleTa);
    return {
        ok: true,
        editMode: box.classList.contains('has-edit-toolbar'),
        headerH: getComputedStyle(box).getPropertyValue('--nw-header-h').trim(),
        box: R(box),
        headerBar: R(headerBar),
        headerPadBottom: headerBar ? getComputedStyle(headerBar).paddingBottom : null,
        editToolbar: R(editToolbar),
        editToolbarBorder: editToolbar ? (getComputedStyle(editToolbar).borderBottomWidth) : null,
        body: R(body),
        firstArea: R(firstTa), bodyArea: R(bodyTa), titleArea: R(titleTa),
        bodyPad: bcs ? [bcs.paddingTop, bcs.paddingBottom, bcs.paddingLeft, bcs.paddingRight].join('/') : null,
        titlePad: tcs ? [tcs.paddingTop, tcs.paddingBottom, tcs.paddingLeft, tcs.paddingRight].join('/') : null,
        foot: R(foot),
        footBorderTop: foot ? getComputedStyle(foot).borderTopWidth : null
    };
});

const checkTight = (g, tag) => {
    const line = g.editToolbar ? g.editToolbar.bottom : null;   // линията под лентата с форматиране
    const gapTop = line !== null && g.firstArea ? g.firstArea.top - line : null;
    const gapBottom = g.bodyArea && g.foot ? g.foot.top - g.bodyArea.bottom : null;
    ok(g.editMode, `${tag}: бележката е в режим Редактиране`, g.editMode);
    ok(Math.abs(parseFloat(g.headerH) - (g.headerBar.h - (parseFloat(g.headerPadBottom) || 0))) <= 1, `${tag}: --nw-header-h е височината на лентата БЕЗ долния ѝ отстъп`, { headerH: g.headerH, headerBar: g.headerBar, pad: g.headerPadBottom });
    ok(gapTop !== null && gapTop >= 0 && gapTop <= 6, `${tag}: полето за писане започва до 6px под линията (${gapTop}px)`, { line, firstArea: g.firstArea });
    ok(gapBottom !== null && gapBottom >= 0 && gapBottom <= 4, `${tag}: полето свършва до 4px над линията на долната лента (${gapBottom}px)`, { bodyArea: g.bodyArea, foot: g.foot });
    ok(g.bodyPad === '3px/3px/10px/10px', `${tag}: вертикални отстъпи 3px, странични 10px`, g.bodyPad);
};

// ---------------------------------------------------------------- 1) 390x844
{
    const { ctx, page, errs, ready } = await openNote(390, 844, true);
    ok(ready, '1: приложението стартира и бележката се отваря');
    const g = await editGeo(page);
    checkTight(g, '1');
    await page.screenshot({ path: path.join('.bolter/check', 'edit-mode-text-tight-390.png') });
    ok(errs.length === 0, '1: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------------------------------------------------------------- 2) 1280x900
{
    const { ctx, page, errs, ready } = await openNote(1280, 900, true);
    ok(ready, '2: приложението стартира и бележката се отваря');
    const g = await editGeo(page);
    checkTight(g, '2');
    await page.screenshot({ path: path.join('.bolter/check', 'edit-mode-text-tight-1280.png') });
    ok(errs.length === 0, '2: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------------------------------------------------------------- 3) режимът за четене не е пипан
{
    const { ctx, page, errs, ready } = await openNote(390, 844, false);
    ok(ready, '3: приложението стартира и бележката се отваря');
    const g = await editGeo(page);
    ok(g.ok && !g.editMode, '3: бележката е в режим за четене', g.editMode);
    // В четящия режим няма поле за писане и текстът не залепва за горната лента.
    ok(!g.firstArea, '3: в режим за четене няма полета за писане', g.firstArea);
    // Лентата има долен отстъп 10px, значи тялото може да започне точно под него, не под ръба на кутията.
    const headerContentBottom = g.headerBar ? g.headerBar.bottom - (parseFloat(g.headerPadBottom) || 0) : null;
    ok(!!g.body && headerContentBottom !== null && g.body.top >= headerContentBottom - 1, '3: текстът в режим за четене не застъпва горната лента', { body: g.body, headerBar: g.headerBar, headerContentBottom });
    ok(errs.length === 0, '3: няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

await browser.close();
srv.close();
console.log(fails === 0 ? `ALL OK (${n})` : `FAILED (${fails}/${n})`);
process.exit(fails === 0 ? 0 : 1);
