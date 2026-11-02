// Запис на защитния екран (debug): кое събитие какво прави.
//
// Защо: собственикът не вижда плочките в списъка с приложенията на MIUI и по описание не
// може да се разбере кое събитие идва и какво решава кодът. Затова всяко събитие оставя ред
// с това какво вижда браузърът (скрито ли е, има ли фокус, размери, режим на приложение,
// изминало време от включването на защитата) и какво е решил кодът.
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1, мобилен контекст 390x844):
//   1) записът се включва с ?privacydebug=1 и тогава всяка страница пише ред start;
//   2) blur пише ред с решение SHOW и с app=1/arm=1/cfg=1, а показването също оставя ред;
//   3) focus след blur без скриване пише HIDE, а след истинско скриване — keep overlay;
//   4) visibilitychange при скриване пише ред със SHOW;
//   5) в изключено състояние не се пише нищо и бутонът Debug не се вижда;
//   6) чекбоксът в Настройки включва и изключва записа (изключването трие реда);
//   7) панелът с реда се отваря от бутона Debug и показва събитията;
//   8) записът оживява след презареждане (пази се в localStorage);
//   9) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/privacy-debug-log.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (за да се провери, че тестът хваща липсващия запис).
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

const openApp = async (query = '', { appScreen = true } = {}) => {
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
    await page.goto(`${ORIGIN}/${PAGE}?demo=1${query}`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        || document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    await page.waitForTimeout(1600);
    return { ctx, page, errs, ready };
};

const logLines = (page) => page.evaluate(() => (window.privacyDebugText ? window.privacyDebugText().split('\n').filter(Boolean) : []));
const lastLine = (lines, kind) => [...lines].reverse().find(l => l.indexOf(' ' + kind + ' [') >= 0) || '';
const blurNow = (page) => page.evaluate(() => {
    window.dispatchEvent(new Event('blur'));
    const ov = document.getElementById('privacy-overlay');
    return { visible: ov ? getComputedStyle(ov).display !== 'none' : false };
});
const goHidden = (page) => page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    const ov = document.getElementById('privacy-overlay');
    return { visible: ov ? getComputedStyle(ov).display !== 'none' : false };
});
const goVisible = (page) => page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
});
const focusNow = (page) => page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    const ov = document.getElementById('privacy-overlay');
    return { visible: ov ? getComputedStyle(ov).display !== 'none' : false };
});

// ---------- 1-4, 7) записът работи, когато е включен ----------
{
    const { ctx, page, errs, ready } = await openApp('&privacydebug=1');
    ok(ready, '1. приложението тръгна');
    const on = await page.evaluate(() => typeof window.privacyDebugOn === 'function' && window.privacyDebugOn());
    ok(on, '1.1 ?privacydebug=1 включва записа');
    let lines = await logLines(page);
    ok(lines.length > 0, '1.2 записът има редове още при пускането', lines);
    const start = lastLine(lines, 'start');
    ok(/start \[/.test(start) && /app=/.test(start) && /ua=/.test(start), '1.3 първият ред е start с режим на приложение и user agent', start);

    // ---------- 2) blur ----------
    const s = await blurNow(page);
    ok(s.visible, '2.0 blur показва защитния екран');
    lines = await logLines(page);
    const blur = lastLine(lines, 'blur');
    ok(/blur \[SHOW\]/.test(blur), '2.1 blur оставя ред с решение SHOW', blur);
    ok(/app=1/.test(blur) && /arm=1\(/.test(blur) && /cfg=1/.test(blur), '2.2 редът казва режим на приложение, включена защита и изминало време', blur);
    ok(/foc=/.test(blur) && /win=390x844/.test(blur) && /vv=/.test(blur) && /de=/.test(blur), '2.3 редът носи фокус и трите размера на екрана', blur);
    const show = lastLine(lines, 'show');
    ok(/show \[/.test(show) && /ovl=1/.test(show), '2.4 показването също оставя ред', show);
    ok(lines.findIndex(l => l.indexOf(' blur [') >= 0) < lines.findIndex(l => l.indexOf(' show [') >= 0), '2.5 редът на blur е преди реда на показването', lines.slice(-3));

    // ---------- 3) focus ----------
    await focusNow(page);
    lines = await logLines(page);
    const focus1 = lastLine(lines, 'focus');
    ok(/focus \[HIDE/.test(focus1), '3.1 focus след blur без скриване пише HIDE', focus1);

    await blurNow(page);
    await goHidden(page);
    await focusNow(page);
    lines = await logLines(page);
    const focus2 = lastLine(lines, 'focus');
    ok(/focus \[keep overlay/.test(focus2), '3.2 focus след истинско скриване пише keep overlay', focus2);

    // ---------- 4) visibilitychange ----------
    await page.evaluate(() => { window.privacyOverlayHide(); });
    await goVisible(page);
    const hid = await goHidden(page);
    ok(hid.visible, '4.0 скриване показва защитния екран');
    lines = await logLines(page);
    const vis = lastLine(lines, 'visibilitychange');
    ok(/visibilitychange \[hidden SHOW\]/.test(vis), '4.1 скриване оставя ред със SHOW', vis);
    ok(/hid=1\/hidden/.test(vis), '4.2 редът казва, че страницата е скрита', vis);
    await page.evaluate(() => { window.privacyOverlayHide(); });
    await goVisible(page);
    lines = await logLines(page);
    ok(/visibilitychange \[visible -> arm\]/.test(lastLine(lines, 'visibilitychange')), '4.3 връщането оставя ред, че защитата е включена отново', lastLine(lines, 'visibilitychange'));

    // ---------- 7) панелът с реда ----------
    await page.evaluate(() => { window.privacyOverlayShow(); });
    const btn = await page.evaluate(() => {
        const b = document.querySelector('#privacy-overlay .privacy-debug-open');
        if (!b) return { present: false };
        return { present: true, display: getComputedStyle(b).display };
    });
    ok(btn.present && btn.display !== 'none', '7.1 при включен запис бутонът Debug се вижда на защитния екран', btn);
    const opened = await page.evaluate(() => {
        const b = document.querySelector('#privacy-overlay .privacy-debug-open');
        if (!b) return { open: false, z: '0', text: '' };
        b.click();
        const v = document.getElementById('privacy-debug-view');
        const pre = v ? v.querySelector('.privacy-debug-log') : null;
        return { open: !!v && v.classList.contains('is-open'), z: v ? getComputedStyle(v).zIndex : '0', text: pre ? pre.textContent : '' };
    });
    ok(opened.open, '7.2 бутонът Debug отваря панела');
    ok(Number(opened.z) > 2147483000, '7.3 панелът е над защитния екран', opened.z);
    ok(opened.text.indexOf('blur [SHOW]') >= 0 && opened.text.indexOf('visibilitychange') >= 0 && opened.text.indexOf('focus [') >= 0, '7.4 панелът показва събитията (blur, скриване, фокус)', opened.text.slice(0, 200));

    // ---------- 8) оживява след презареждане ----------
    const before = (await logLines(page)).length;
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1600);
    const after = await logLines(page);
    ok(after.length > before, '8.1 записът се пази след презареждане', { before, after: after.length });
    ok(/start \[/.test(lastLine(after, 'start')), '8.2 след презареждане има нов ред start', lastLine(after, 'start'));

    ok(errs.length === 0, '9.1 няма изключения в конзолата', errs);
    await ctx.close();
}

// ---------- 5-6) изключен запис ----------
{
    const { ctx, page, errs, ready } = await openApp('');
    ok(ready, '5. приложението тръгна без запис');
    const on = await page.evaluate(() => window.privacyDebugOn ? window.privacyDebugOn() : 'no-fn');
    ok(on === false, '5.1 по подразбиране записът е изключен', on);
    const s = await blurNow(page);
    ok(s.visible, '5.2 защитният екран работи и без запис');
    const lines = await logLines(page);
    ok(lines.length === 0, '5.3 при изключен запис не се пише нищо', lines);
    const btn = await page.evaluate(() => {
        const b = document.querySelector('#privacy-overlay .privacy-debug-open');
        return { present: !!b, display: b ? getComputedStyle(b).display : 'none' };
    });
    ok(btn.present && btn.display === 'none', '5.4 бутонът Debug не се вижда при изключен запис', btn);

    const cb = await page.evaluate(() => {
        const c = document.getElementById('privacy-debug-checkbox');
        if (!c) return { present: false };
        return { present: true, checked: c.checked, hasHint: !!document.getElementById('privacy-debug-hint') };
    });
    ok(cb.present && cb.hasHint, '6.1 в Настройки има чекбокс и подсказка за записа', cb);
    ok(cb.checked === false, '6.2 чекбоксът е празен при изключен запис');

    const turned = await page.evaluate(async () => {
        const c = document.getElementById('privacy-debug-checkbox');
        if (!c) return { on: 'no-el', lines: [], marked: false };
        c.checked = true;
        c.dispatchEvent(new Event('change', { bubbles: true }));
        const on = typeof window.privacyDebugOn === 'function' ? window.privacyDebugOn() : 'no-fn';
        window.dispatchEvent(new Event('blur'));
        const text = typeof window.privacyDebugText === 'function' ? window.privacyDebugText() : '';
        return { on, lines: text.split('\n').filter(Boolean), marked: text.indexOf('debug-on') >= 0 };
    });
    ok(turned.on === true, '6.3 чекбоксът включва записа');
    ok(turned.marked, '6.4 включването оставя ред debug-on', turned.lines);
    ok(turned.lines.some(l => l.indexOf(' blur [') >= 0), '6.4b след включване от Настройки blur се записва', turned.lines);

    const turnedOff = await page.evaluate(() => {
        const c = document.getElementById('privacy-debug-checkbox');
        if (!c) return { on: 'no-el', left: 'no-el', lines: 'no-el' };
        c.checked = false;
        c.dispatchEvent(new Event('change', { bubbles: true }));
        return { on: typeof window.privacyDebugOn === 'function' ? window.privacyDebugOn() : 'no-fn', left: localStorage.getItem('privacyDebugLog'), lines: typeof window.privacyDebugText === 'function' ? window.privacyDebugText() : 'no-fn' };
    });
    ok(turnedOff.on === false, '6.5 чекбоксът изключва записа');
    ok(turnedOff.left === null && turnedOff.lines === '', '6.6 изключването трие записаното', turnedOff);

    ok(errs.length === 0, '9.2 няма изключения в конзолата', errs);
    await ctx.close();
}

await browser.close();
srv.close();
console.log(fails === 0 ? `OK ${n}/${n}` : `FAILED ${fails} от ${n}`);
process.exit(fails === 0 ? 0 : 1);
