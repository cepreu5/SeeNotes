// Екран за поверителност: плочките не бива да изчезват, докато приложението е в списъка
// с приложенията (recents).
//
// Защо: собственикът видя на телефон, че в списъка плочките се показват и веднага се
// превключват обратно към бележките/календара. Причината е в подредбата на събитията при
// преминаване към списъка: Android не винаги дава blur и visibilitychange в един и същи ред,
// а старият код махаше плочките при всеки focus, ако преди това не е видял скриване —
// включително когато страницата е скрита, и включително когато blur е дошъл СЛЕД скриването
// (тогава blur нулираше флага и следващият focus махаше плочките, докато приложението още е
// в списъка — оттам и кадърът без тях).
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1, мобилен контекст 390x844,
// режим на екран на приложението):
//   1) blur -> скриване -> focus (focus, докато страницата е скрита) — плочките остават;
//   2) скриване -> blur -> focus — плочките остават (blur не бива да трие „скрито е“);
//   3) blur -> focus и скриване 100 мс по-късно — плочките не изчезват и за миг;
//   4) blur -> focus без скриване (системен диалог) — плочките не се махат сами, чакат докосване;
//   5) истинско напускане и връщане — плочките остават, искат Затвори, Затвори ги маха;
//   6) системен диалог, докато плочките чакат Затвори — пак остават (не се махат сами);
//   7) след Затвори следващият blur пак вдига плочките.
//
// b3.31: собственикът видя на MIUI, че при ОТВОРЕНА бележка (с клавиатура) плочките пак липсват
// в списъка. Причината беше таймерът от 350 мс: при натискане на „скорошни" клавиатурата се
// прибира, Android дава focus, страницата още се води видима и таймерът махаше плочките точно
// преди снимката. Сега няма нито таймер, нито махане по focus: маха само истински жест.
//
// Пускане от корена на хранилището: node .bolter/check/privacy-recents-race.mjs   (exit 1 при провал)
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

const openApp = async () => {
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
        // Режим на екран на приложението (Playwright не пуска истински standalone прозорец).
        const orig = window.matchMedia.bind(window);
        window.matchMedia = (q) => {
            if (/display-mode:\s*(standalone|fullscreen|minimal-ui)/.test(String(q))) {
                return { matches: true, media: String(q), onchange: null, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { }, dispatchEvent() { return false; } };
            }
            return orig(q);
        };
        // Управляемо състояние на видимостта: така се възпроизвеждат и двете подредби на
        // blur и visibilitychange, които Android дава при преминаване към списъка.
        window.__vis = { hidden: false };
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => window.__vis.hidden });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window.__vis.hidden ? 'hidden' : 'visible') });
    });
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        || document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    await page.waitForTimeout(1200);
    return { ctx, page, errs, ready };
};

// Състоянието се чете в същия кадър: точно това вижда Android, когато снима екрана.
const visible = (page) => page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    if (!ov) return false;
    return getComputedStyle(ov).display !== 'none';
});
const blurNow = (page) => page.evaluate(() => window.dispatchEvent(new Event('blur')));
const focusNow = (page) => page.evaluate(() => window.dispatchEvent(new Event('focus')));
const goHidden = (page) => page.evaluate(() => {
    window.__vis.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
});
const goVisible = (page) => page.evaluate(() => {
    window.__vis.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
});
const closeOverlay = (page) => page.evaluate(() => {
    const btn = document.querySelector('#privacy-overlay .privacy-close');
    if (!btn) return { clicked: false };
    btn.click();
    const ov = document.getElementById('privacy-overlay');
    return { clicked: true, visible: getComputedStyle(ov).display !== 'none' };
});
// Истински жест от човек: от b3.31 само той маха плочките (не focus, не таймер).
const tapNow = (page) => page.evaluate(() => {
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    const ov = document.getElementById('privacy-overlay');
    return !!ov && getComputedStyle(ov).display !== 'none';
});

// ---------- 1) blur -> скриване -> focus, докато страницата е скрита ----------
{
    const { ctx, page, errs, ready } = await openApp();
    ok(ready, '1. приложението тръгна');
    ok(!(await visible(page)), '1.1 преди напускането няма плочки');
    await blurNow(page);
    ok(await visible(page), '1.2 blur вдига плочките');
    await goHidden(page);
    await focusNow(page);
    ok(await visible(page), '1.3 focus, докато страницата е скрита, не маха плочките');
    await page.waitForTimeout(400);
    ok(await visible(page), '1.4 плочките са там и 400 мс по-късно (кадърът за списъка)');
    ok(errs.length === 0, '1.5 няма изключения в конзолата', errs);
    await ctx.close();
}

// ---------- 2) скриване -> blur -> focus (blur идва след скриването) ----------
{
    const { ctx, page, ready } = await openApp();
    ok(ready, '2. приложението тръгна');
    await goHidden(page);
    ok(await visible(page), '2.1 скриването вдига плочките');
    await blurNow(page);
    ok(await visible(page), '2.2 blur след скриването не маха плочките');
    await focusNow(page);
    ok(await visible(page), '2.3 focus след това не маха плочките (blur не трие „скрито е“)');
    await page.waitForTimeout(400);
    ok(await visible(page), '2.4 плочките са там и 400 мс по-късно');
    await ctx.close();
}

// ---------- 3) blur -> focus и скриване 100 мс по-късно (focus преди скриването) ----------
{
    const { ctx, page, ready } = await openApp();
    ok(ready, '3. приложението тръгна');
    await blurNow(page);
    ok(await visible(page), '3.1 blur вдига плочките');
    await focusNow(page);
    ok(await visible(page), '3.2 плочките не изчезват и за миг при focus преди скриването');
    await page.waitForTimeout(100);
    await goHidden(page);
    await page.waitForTimeout(600);
    ok(await visible(page), '3.3 след скриването плочките са на екрана');
    await ctx.close();
}

// ---------- 4) blur -> focus без скриване (системен диалог): плочките чакат жест ----------
{
    const { ctx, page, ready } = await openApp();
    ok(ready, '4. приложението тръгна');
    await blurNow(page);
    ok(await visible(page), '4.1 blur вдига плочките');
    await focusNow(page);
    await page.waitForTimeout(700);
    ok(await visible(page), '4.2 връщането на фокуса НЕ ги маха само (нито веднага, нито след 700 мс)');
    const stillThere = await tapNow(page);
    ok(!stillThere, '4.3 първото истинско докосване ги маха');
    await ctx.close();
}

// ---------- 5) истинско напускане и връщане: иска Затвори ----------
{
    const { ctx, page, ready } = await openApp();
    ok(ready, '5. приложението тръгна');
    await blurNow(page);
    await goHidden(page);
    await goVisible(page);
    await focusNow(page);
    await page.waitForTimeout(600);
    ok(await visible(page), '5.1 след истинско напускане плочките остават и след връщане');
    const closed = await closeOverlay(page);
    ok(closed.clicked && !closed.visible, '5.2 бутонът Затвори маха плочките', closed);
    await ctx.close();
}

// ---------- 6) системен диалог, докато плочките чакат Затвори ----------
{
    const { ctx, page, ready } = await openApp();
    ok(ready, '6. приложението тръгна');
    await blurNow(page);
    await goHidden(page);
    await goVisible(page);
    await focusNow(page);
    await page.waitForTimeout(500);
    ok(await visible(page), '6.1 плочките чакат Затвори');
    await blurNow(page);          // системен диалог (избор на час и т.н.)
    ok(await visible(page), '6.2 blur не маха плочките');
    await focusNow(page);         // диалогът се затваря, приложението не е напускало
    await page.waitForTimeout(600);
    ok(await visible(page), '6.3 системен диалог не маха плочките, които чакат Затвори');
    const closed = await closeOverlay(page);
    ok(closed.clicked && !closed.visible, '6.4 Затвори ги маха', closed);
    await ctx.close();
}

// ---------- 7) след Затвори следващият blur пак вдига плочките ----------
{
    const { ctx, page, ready } = await openApp();
    ok(ready, '7. приложението тръгна');
    await blurNow(page);
    await goHidden(page);
    await goVisible(page);
    await focusNow(page);
    await page.waitForTimeout(400);
    await closeOverlay(page);
    await page.waitForTimeout(200);
    await blurNow(page);
    ok(await visible(page), '7.1 след Затвори следващият blur пак вдига плочките');
    await focusNow(page);
    await page.waitForTimeout(600);
    ok(await visible(page), '7.2 и този blur без скриване не се отменя сам');
    const stillThere = await tapNow(page);
    ok(!stillThere, '7.3 докосването го маха');
    await ctx.close();
}

// ---------- 8) отворена бележка с клавиатура: случаят на собственика (MIUI, 31 Oct) ----------
// При натискане на „скорошни" клавиатурата се прибира, Android дава focus, страницата още се
// води видима. Старият таймер махаше плочките точно в този прозорец и снимката излизаше с
// бележката. Сега нито един кадър между blur и скриването не бива да е без плочки.
{
    const { ctx, page, ready } = await openApp();
    ok(ready, '8. приложението тръгна');
    const noteOpen = await page.evaluate(() => {
        const card = document.querySelector('#notes-container .note');
        if (!card) return false;
        card.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return true;
    });
    await page.waitForTimeout(900);
    const winVisible = await page.evaluate(() => {
        const w = document.querySelector('.note-window.visible');
        if (!w) return false;
        const area = w.querySelector('textarea, [contenteditable="true"]');
        if (area) { area.focus(); area.dispatchEvent(new Event('input', { bubbles: true })); }
        return true;
    });
    ok(noteOpen && winVisible, '8.1 има отворена бележка с поле за писане (както при собственика)');

    await blurNow(page);
    const frames = [];
    frames.push(await visible(page));
    // клавиатурата се прибира: focus идва, а страницата още е видима
    await focusNow(page);
    for (let i = 0; i < 10; i++) {
        await page.waitForTimeout(60);
        frames.push(await visible(page));
    }
    ok(frames.every(Boolean), '8.2 между blur и скриването няма нито един кадър без плочки', frames);
    await goHidden(page);
    await page.waitForTimeout(200);
    ok(await visible(page), '8.3 в кадъра за списъка плочките са на екрана');
    // Връщане в приложението: плочките пак чакат жест (докато страницата е скрита, жестове няма).
    // Първите 120 мс те стоят, за да не ги махне същият жест, който тъкмо ги е вдигнал.
    await goVisible(page);
    await page.waitForTimeout(120);
    ok(await visible(page), '8.4 след връщане плочките още са там, никой жест още не ги е махал');
    ok(await tapNow(page), '8.5 жест веднага след вдигането не ги маха (защитата от 400 мс)');
    await page.waitForTimeout(500);
    const stillThere = await tapNow(page);
    ok(!stillThere, '8.6 истинско докосване след защитата ги маха');
    await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n${fails === 0 ? 'ALL OK' : 'FAILED'}  OK=${n - fails} FAIL=${fails}`);
process.exit(fails === 0 ? 0 : 1);
