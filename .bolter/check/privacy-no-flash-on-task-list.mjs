// Защитен екран: при излизане към списъка със задачи (и при връщане) НЕ се показва нищо.
//
// Собственикът (02.11.2026): „Когато приложението не е показало овърлея и го пратим в task list-а,
// овърлеят примигва за кратко. При излизане от task list-а ще се случва същото — махни го“ и
// „махни показването на овърлея при скриване на приложението“.
//
// Защо: Android снима кадъра за списъка с приложенията преди поправката да стигне до екрана, значи
// плочките, вдигнати в мига на излизане, само примигваха и не пазеха нищо. Затова вдигането при
// blur и при скриване на страницата отпада. Защитата идва от брояча за бездействие (Настройки →
// „Заключване след“) и от клика върху логото — те вдигат екрана, докато приложението е на екрана.
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1, мобилен контекст 390x844):
//   1) в режим на екран на приложението: blur не вдига нищо и екранът е байт-за-байт същият
//      (това е „примигването“ — то трябва да го няма);
//   2) скриване на страницата (снимката за списъка) не вдига нищо;
//   3) връщане (страницата пак е видима + фокус) не вдига нищо;
//   4) три пълни излизания и връщания подред — овърлеят никога не се появява;
//   5) в обикновен таб също нищо;
//   6) клик върху логото в хедъра пак вдига овърлея и той чака „Затвори“ — излизане, скриване,
//      връщане и фокус не го махат (собственикът, 02.11.2026: и ръчно вдигнатият чака „Затвори“);
//   7) броячът за бездействие пак вдига овърлея (15 s без докосване) и той остава, докато
//      приложението излиза и се връща — защитата не е изчезнала, само се вдига по-рано;
//   8) „Заключване след“ 10 s: опцията я има, избира се и овърлеят излиза след 10 s;
//   9) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/privacy-no-flash-on-task-list.mjs   (exit 1 при провал)
// UNI_ROOT=… сочи друга папка на приложението (контролно пускане върху кода без поправката;
// приема и корена на хранилището, в който има uni/). ROOT=… е същото.
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

const PAGE = process.env.UNI_PAGE || 'index.html';
const W = 390, H = 844;

let root = path.resolve(process.env.UNI_ROOT || process.env.ROOT || 'uni');
if (!existsSync(path.join(root, PAGE)) && existsSync(path.join(root, 'uni', PAGE))) {
    root = path.join(root, 'uni');
}
console.log(`приложение: ${root}`);

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
const openApp = async (appScreen, idleSeconds) => {
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
    await page.addInitScript(({ appScreen, idleSeconds }) => {
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
        if (idleSeconds) localStorage.setItem('privacyIdleLock', String(idleSeconds));
        const orig = window.matchMedia.bind(window);
        window.matchMedia = (q) => {
            if (appScreen && /display-mode:\s*(standalone|fullscreen|minimal-ui)/.test(String(q))) {
                return { matches: true, media: String(q), onchange: null, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { }, dispatchEvent() { return false; } };
            }
            return orig(q);
        };
    }, { appScreen, idleSeconds });
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        || document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    await page.waitForTimeout(1500);
    return { ctx, page, errs, ready };
};

// Състоянието се чете В СЪЩИЯ кадър, без изчакване — точно това вижда Android при снимката.
const readOverlay = `(() => {
    const ov = document.getElementById('privacy-overlay');
    if (!ov) return { present: false, visible: false };
    const cs = getComputedStyle(ov);
    return {
        present: true,
        visible: ov.classList.contains('is-visible') && cs.display !== 'none' && Number(cs.opacity) > 0.5,
        display: cs.display,
        opacity: cs.opacity
    };
})()`;

const state = (page) => page.evaluate(readOverlay);

// Излизане към списъка със задачи: прозорецът губи фокус, но още е на екрана.
const blurNow = (page) => page.evaluate(new Function(`window.dispatchEvent(new Event('blur')); return ${readOverlay};`));

// Android вече е снимал екрана за списъка: страницата се води скрита.
const goHidden = (page) => page.evaluate(new Function(`
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    return ${readOverlay};`));

// Връщане в приложението: страницата пак е видима. Чете се веднага, без изчакване.
const goVisible = (page) => page.evaluate(new Function(`
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    return ${readOverlay};`));

const focusNow = (page) => page.evaluate(new Function(`window.dispatchEvent(new Event('focus')); return ${readOverlay};`));

const closeNow = (page) => page.evaluate(new Function(`
    const btn = document.querySelector('#privacy-overlay .privacy-close');
    if (!btn) return { clicked: false };
    btn.click();
    const s = ${readOverlay};
    s.clicked = true;
    return s;`));

const logoBox = (page) => page.evaluate(() => {
    const img = document.querySelector('header .header-logo') || document.querySelector('.header-logo');
    if (!img) return null;
    const r = img.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) };
});

// Област от дъската с бележки: тук плочките биха се видели, ако овърлеят примигне.
const CLIP = { x: 20, y: 300, width: 120, height: 120 };

// ---------- 1) излизане към списъка със задачи: нищо не примигва ----------
{
    const { ctx, page, errs, ready } = await openApp(true);
    ok(ready, '1. приложението тръгна');
    ok(!(await state(page)).visible, '1.1 преди излизането няма overlay');

    const before = await page.screenshot({ clip: CLIP });
    const b = await blurNow(page);
    ok(!b.visible, '1.2 blur при излизане не вдига overlay (няма примигване)', b);

    // Същият кадър, байт-за-байт: нищо не е покрило бележките за миг.
    const afterBlur = await page.screenshot({ clip: CLIP });
    ok(Buffer.compare(before, afterBlur) === 0, '1.3 екранът след blur е същият като преди него (нищо не е примигнало)');

    const h = await goHidden(page);
    ok(!h.visible, '1.4 скриването на страницата (снимката за списъка) не вдига overlay', h);
    const afterHidden = await page.screenshot({ clip: CLIP });
    ok(Buffer.compare(before, afterHidden) === 0, '1.5 екранът при скриване е същият като преди излизането');

    // ---------- 2) връщане от списъка със задачи ----------
    const v = await goVisible(page);
    ok(!v.visible, '2.1 при връщане (страницата пак е видима) няма overlay', v);
    const f = await focusNow(page);
    ok(!f.visible, '2.2 фокусът след връщането също не вдига overlay', f);

    // ---------- 3) три пълни излизания и връщания подред ----------
    const seen = [];
    for (let i = 0; i < 3; i++) {
        seen.push((await blurNow(page)).visible);
        seen.push((await goHidden(page)).visible);
        seen.push((await goVisible(page)).visible);
        seen.push((await focusNow(page)).visible);
    }
    ok(seen.every(x => x === false), '3.1 при три излизания и връщания овърлеят не се показва нито веднъж', seen);
    ok(Buffer.compare(await page.screenshot({ clip: CLIP }), before) === 0, '3.2 екранът е същият и след трите обиколки');

    ok(errs.length === 0, '3.3 няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------- 4) обикновен таб: също нищо ----------
{
    const { ctx, page, errs, ready } = await openApp(false);
    ok(ready, '4. приложението тръгна в обикновен таб');
    ok(!(await blurNow(page)).visible, '4.1 в обикновен таб blur не показва overlay');
    ok(!(await goHidden(page)).visible, '4.2 в обикновен таб скриването не показва overlay');
    ok(!(await goVisible(page)).visible, '4.3 връщането не показва overlay');
    ok(errs.length === 0, '4.4 няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------- 5) клик върху логото: ръчният начин остава ----------
{
    const { ctx, page, errs, ready } = await openApp(true);
    ok(ready, '5. приложението тръгна');
    const box = await logoBox(page);
    ok(!!box, '5.1 логото се вижда в хедъра', box);
    if (box) await page.mouse.click(box.x, box.y);
    const s = await state(page);
    ok(s.visible, '5.2 клик върху логото вдига overlay-а', s);
    const shotLogo = await page.screenshot({ clip: CLIP });
    await blurNow(page);
    ok((await state(page)).visible, '5.3 излизането към списъка не маха екран, вдигнат от логото');
    await goHidden(page);
    ok((await state(page)).visible, '5.4 скриването на страницата не го маха');
    await goVisible(page);
    ok((await state(page)).visible, '5.5 връщането в приложението не го маха');
    await focusNow(page);
    ok((await state(page)).visible, '5.6 фокусът не го маха — чака „Затвори“');
    ok(Buffer.compare(await page.screenshot({ clip: CLIP }), shotLogo) === 0, '5.7 екранът е същият след цялата обиколка');
    const c = await closeNow(page);
    ok(c.clicked && !c.visible, '5.8 бутонът „Затвори“ го маха', c);
    ok(errs.length === 0, '5.9 няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------- 6) броячът за бездействие: защитата не е изчезнала, само се вдига по-рано ----------
{
    const { ctx, page, errs, ready } = await openApp(true, 15);
    ok(ready, '6. приложението тръгна с „Заключване след“ 15 s');
    await page.waitForTimeout(3000);
    ok(!(await state(page)).visible, '6.1 преди 15 s овърлей няма');
    await page.waitForTimeout(14000);
    const idle = await state(page);
    ok(idle.visible, '6.2 след 15 s без докосване овърлеят е на екрана', idle);

    // Екранът от брояча остава и след излизане и връщане (иска „Затвори“).
    await blurNow(page);
    await goHidden(page);
    await goVisible(page);
    await focusNow(page);
    ok((await state(page)).visible, '6.3 екранът от брояча остава след излизане и връщане');
    const c = await closeNow(page);
    ok(c.clicked && !c.visible, '6.4 „Затвори“ го маха', c);
    ok(errs.length === 0, '6.5 няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

// ---------- 7) „Заключване след“ 10 s (b3.51) ----------
{
    const { ctx, page, errs, ready } = await openApp(true, 10);
    ok(ready, '7. приложението тръгна с „Заключване след“ 10 s');
    const sel = await page.evaluate(() => {
        const s = document.getElementById('idle-lock-select');
        return s ? { opts: [...s.options].map(o => o.value), value: s.value } : null;
    });
    ok(!!sel && sel.opts.includes('10'), '7.1 в списъка има опция 10 s', sel);
    ok(!!sel && sel.value === '10', '7.2 запазените 10 s се показват избрани', sel);
    await page.waitForTimeout(6000);
    ok(!(await state(page)).visible, '7.3 преди 10 s овърлей няма');
    await page.waitForTimeout(6000);
    ok((await state(page)).visible, '7.4 след 10 s без докосване овърлеят е на екрана');
    await blurNow(page);
    await goHidden(page);
    await goVisible(page);
    await focusNow(page);
    ok((await state(page)).visible, '7.5 остава след излизане и връщане — чака „Затвори“');
    const c = await closeNow(page);
    ok(c.clicked && !c.visible, '7.6 „Затвори“ го маха', c);
    ok(errs.length === 0, '7.7 няма изключения в конзолата', errs.slice(0, 3));
    await ctx.close();
}

await browser.close();
srv.close();

console.log('');
console.log(fails === 0 ? `ALL OK (${n})` : `FAILED: ${fails} от ${n}`);
process.exit(fails === 0 ? 0 : 1);
