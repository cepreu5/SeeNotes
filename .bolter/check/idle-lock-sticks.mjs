// „Заключване след“ — изборът остава и след ново пускане (b3.58).
//
// Собственикът, 3 Nov 2026: „Зададох 60 сек. за защитния екран, но той се включва на 10-тата —
// това беше предишната настройка.“
//
// Причината: селектът пишеше само localStorage, а при всяко пускане loadSettingsFromGDrive
// презаписва ключа от профилния снапшот (settings_multinotes_data) и от settings.json в Drive.
// Значи изборът се връщаше на предишното време, а броячът заключваше по него. Същата причина вече
// беше поправена за One-tap links; тук е същото решение — обновява се и профилът.
//
// Какво проверява (истински Chromium, истинският uni код, ?demo=1, мобилен контекст 390x844,
// часовникът се мести от теста):
//   1) изборът 10 се пази локално и в профилния снапшот („предишната настройка“);
//   2) след смяна на 60 профилният снапшот също е 60 (иначе при старт се губи);
//   3) симулирано ново пускане (loadSettingsFromGDrive): запазеното остава 60, селектът показва 60;
//   4) броячът заключва след 60 s, не след 10 s (на 11-ата и на 59-ата секунда екранът е свален);
//   5) екранът е същият: две плочки 300x300;
//   6) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/idle-lock-sticks.mjs   (exit 1 при провал)
// UNI_ROOT=… сочи друга папка на приложението — за контролен пуск срещу b5e9d35, където
// проверки 2, 3, 4 (11 s) трябва да паднат.
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

const root = path.resolve(process.env.UNI_ROOT || process.env.ROOT || 'uni');
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
let step = 'старт';
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
page.on('pageerror', e => errs.push(`[${step}] ` + String(e.stack || e.message).split('\n').slice(0, 3).join(' | ').slice(0, 400)));
page.on('console', m => { if (m.type() === 'error') errs.push(`[${step}] console: ` + m.text().slice(0, 200)); });

// Часовникът се мести от теста; тук той още върви, за да минат истинските изчаквания на
// профилния запис. Спира се едва преди броенето на секундите.
await page.clock.install({ time: new Date('2026-11-03T02:40:00Z') });
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
    localStorage.setItem('lang', 'bg');
    localStorage.setItem('hideAssistant', 'true');
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q) => {
        if (/display-mode:\s*(standalone|fullscreen|minimal-ui)/.test(String(q))) {
            return { matches: true, media: String(q), onchange: null, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { }, dispatchEvent() { return false; } };
        }
        return orig(q);
    };
});

await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
    || document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
    .then(() => true, () => false);
await page.waitForTimeout(1500);
ok(ready, '1. приложението тръгна');

const openSettings = async () => {
    const open = await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        if (!m) return false;
        m.classList.add('visible');
        return getComputedStyle(m).display !== 'none';
    });
    await page.waitForTimeout(400);
    return open;
};

const chooseIdle = (v) => page.evaluate((val) => {
    const sel = document.getElementById('idle-lock-select');
    if (!sel) return { found: false };
    sel.value = val;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { found: true, stored: localStorage.getItem('privacyIdleLock') };
}, v);

const snapshot = () => page.evaluate(() => {
    const raw = localStorage.getItem('settings_multinotes_data');
    if (!raw) return { raw: null, idle: null };
    try { const o = JSON.parse(raw); return { raw: 'json', idle: o ? o.privacyIdleLock : null }; }
    catch (e) { return { raw: 'bad', idle: null }; }
});

const selectValue = () => page.evaluate(() => {
    const sel = document.getElementById('idle-lock-select');
    return sel ? sel.value : null;
});

const state = () => page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    if (!ov) return { present: false, visible: false, tiles: [] };
    const cs = getComputedStyle(ov);
    return {
        present: true,
        visible: cs.display !== 'none' && cs.visibility !== 'hidden',
        tiles: [...ov.querySelectorAll('.privacy-tile')].map(t => Math.round(t.getBoundingClientRect().width))
    };
});

const advance = async (ms) => {
    try { await page.clock.fastForward(ms); }
    catch (e) {
        const s = String((e && e.stack) || e);
        if (!/msm\.js/.test(s)) throw e;
        await page.clock.fastForward(1100).catch(() => { });
    }
};

// ---------- 1) „предишната настройка“: 10 s, записано и в профила ----------
step = 'избор 10';
await openSettings();
const row = await page.evaluate(() => {
    const sel = document.getElementById('idle-lock-select');
    return sel ? { options: [...sel.options].map(o => o.value), value: sel.value } : null;
});
ok(!!row && JSON.stringify(row.options) === JSON.stringify(['10', '15', '30', '60']), '1.1 редът „Заключване след“ е в Настройки с 10 / 15 / 30 / 60', row);

const first = await chooseIdle('10');
ok(first.found && first.stored === '10', '1.2 изборът 10 се пази локално', first);
step = 'запис на профил 10';
const saved10 = await page.evaluate(async () => {
    try { await window.saveSettingsToGDrive(true); return 'ok'; } catch (e) { return String(e && e.message); }
});
await page.waitForTimeout(300);
const snap10 = await snapshot();
ok(saved10 === 'ok' && snap10.idle === '10', '1.3 профилният снапшот вече помни 10 (това е „предишната настройка“)', { saved10, snap10 });

// ---------- 2) смяна на 60: и локално, и в профила ----------
step = 'избор 60';
const second = await chooseIdle('60');
ok(second.found && second.stored === '60', '2.1 изборът 60 се пази локално', second);
await page.waitForTimeout(800);
const snap60 = await snapshot();
ok(snap60.idle === '60', '2.2 профилният снапшот е обновен на 60 веднага, без бутон Save', snap60);

// ---------- 3) симулирано ново пускане: профилът не връща 10 ----------
step = 'ново пускане';
const loaded = await page.evaluate(async () => {
    try { await window.loadSettingsFromGDrive(true); return 'ok'; } catch (e) { return String(e && e.message); }
});
await page.waitForTimeout(500);
const afterRestart = await page.evaluate(() => localStorage.getItem('privacyIdleLock'));
ok(loaded === 'ok' && afterRestart === '60', '3.1 след ново пускане запазеното е 60, а не предишните 10', { loaded, afterRestart });
const selAfter = await selectValue();
// Селектът и броячът трябва да гледат едно и също: на стария код селектът показваше 60, а
// броячът работеше с 10 — точно объркването, което собственикът описа.
ok(selAfter === afterRestart, '3.2 селектът показва същото, с което работи броячът', { selAfter, afterRestart });

// ---------- 4) броячът: 60 s, не 10 s ----------
step = 'брояч';
await page.clock.pauseAt(new Date(await page.evaluate(() => Date.now()) + 20));
// Истинско докосване има поне една точка — приложението чете touches[0] (иначе чужд слушател
// на документа гърми и грешката се брои за шум в конзолата).
await page.evaluate(() => {
    const el = document.body;
    const t = new Touch({ identifier: 1, target: el, clientX: 10, clientY: 10, screenX: 10, screenY: 10, pageX: 10, pageY: 10, radiusX: 1, radiusY: 1, force: 1 });
    el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
});
await advance(11000);
ok(!(await state()).visible, '4.1 на 11-ата секунда още не е заключено (не 10 s)', await state());
await advance(48000);   // общо 59 s
ok(!(await state()).visible, '4.2 на 59-ата секунда още не е заключено', await state());
await advance(2000);    // общо 61 s
const locked = await state();
ok(locked.visible, '4.3 след 60 s без докосване екранът се заключва сам', locked);
ok(locked.tiles.length === 2 && locked.tiles.every(w => w === 300), '4.4 заключеният екран е същият: две плочки 300x300', locked);

// ---------- 5) конзолата ----------
const realErrs = errs.filter(e => !(/msm\.js/.test(e) && /updatePosition|startPositioning/.test(e)));
ok(realErrs.length === 0, '5.1 няма изключения в конзолата', realErrs.slice(0, 3));

await browser.close();
srv.close();
console.log(fails === 0 ? `OK ${n}/${n}` : `FAILED ${fails} от ${n}`);
process.exit(fails === 0 ? 0 : 1);
