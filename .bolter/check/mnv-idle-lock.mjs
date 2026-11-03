// MNV: настройка „Заключване след“ + защитен екран, вдигнат от брояч за бездействие.
//
// Собственикът, 3 Nov 2026, за MNV:
//   „Приложи на Lock after стил като на другите настройки“
//   „Въпреки, че Lock after е включено, защитния екран не се задейства“
//   „Добави настройката за времетраене“
//
// Причината за второто: в MNV нямаше брояч за бездействие — екранът се вдигаше само при blur и
// visibilitychange, а Android снима кадъра за списъка с приложенията преди това да стигне до
// екрана. Затова портът от uni (b3.48) вдига екрана по-рано, след N секунди без докосване.
//
// Какво проверява (истински Chromium, истинският MNV код, 390x844):
//   1) редът „Заключване след“ е в Настройки, веднага след „Автоматична защита“, със същия клас и
//      същата подредба като другите настройки, с 10 / 15 / 30 / 60 и по подразбиране 30;
//   2) изборът се пази в localStorage и оцелява след ново пускане на страницата;
//   3) в режим на приложение екранът НЕ излиза преди изтеклото време и излиза след него;
//   4) след „Затвори“ броячът тръгва наново;
//   5) докосване нулира брояча (четенето на бележка не е бездействие);
//   6) с изключена „Автоматична защита“ броячът не заключва;
//   7) старият път (blur в режим на приложение) още вдига екрана;
//   8) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/mnv-idle-lock.mjs   (exit 1 при провал)
// MNV_ROOT=… сочи друга папка — за контролен пуск срещу по-стар MNV, където ред 1 и проверки 3-5
// трябва да паднат (няма нито ред, нито брояч).
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

const root = path.resolve(process.env.MNV_ROOT || 'MNV');
const PAGE = process.env.MNV_PAGE || 'index-2.html';
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

const INIT = () => {
    const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
    window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
    window.kofiWidgetOverlay = { draw() { } };
    localStorage.setItem('useIndexedDb', 'true');
    localStorage.setItem('useGoogleDb', 'false');
    localStorage.setItem('useLocalFolder', 'false');
    localStorage.setItem('useArhDb', 'false');
    localStorage.setItem('lang', 'bg');
    localStorage.setItem('language', 'bg');
};

// Режим на приложение (инсталирано приложение / fullscreen): privacyAppScreenMode() гледа това.
const STANDALONE = () => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) => {
        if (/display-mode:\s*(standalone|fullscreen|minimal-ui)/.test(String(q))) {
            return { matches: true, media: String(q), onchange: null, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { }, dispatchEvent() { return false; } };
        }
        return real(q);
    };
};

const ctx = await browser.newContext({
    viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
    serviceWorkers: 'block'
});
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
await ctx.addInitScript(INIT);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(`[${step}] ` + String(e.stack || e.message).split('\n').slice(0, 3).join(' | ').slice(0, 400)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(`[${step}] console: ` + m.text().slice(0, 200)); });

const boot = async () => {
    await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof createNoteElement === 'function' && typeof startApp === 'function'
        && typeof mediaData !== 'undefined' && typeof showModal === 'function', null, { timeout: 30000 })
        .catch(() => { });
    await page.evaluate(async () => {
        try { if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags(); } catch (e) { /* ignore */ }
        useIndexedDb = true; useGoogleDb = false; useLocalFolder = false; useArhDb = false;
        isOffline = true;
        try { dbNoteIdTypeGloal = 'gdid'; } catch (e) { /* ignore */ }
        try { dbNoteIdTypeGlobal = 'gdid'; dbSourceGlobal = 1; } catch (e) { /* ignore */ }
        ['login-page', 'request-access-modal', 'folderIdPromptPopup'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    });
    await page.waitForTimeout(800);
    // Настройките се строят от createSettingsUI() в самия старт на приложението, след успешен вход.
    // В проверката вход няма, затова я викаме директно — това е същият код, не прескачане на логиката.
    await page.evaluate(async () => {
        if (typeof createSettingsUI === 'function') {
            try { await createSettingsUI([], false); } catch (e) { /* ignore */ }
        }
    });
    await page.waitForTimeout(400);
};

step = 'пускане';
await boot();
ok(await page.evaluate(() => typeof createNoteElement === 'function'), '1.0 приложението тръгна');

const visible = () => page.evaluate(() => {
    const el = document.getElementById('privacy-overlay');
    if (!el) return false;
    const cs = getComputedStyle(el);
    return el.classList.contains('is-visible') && cs.display !== 'none' && cs.visibility !== 'hidden';
});

// Изчаква състояние, връща след колко ms се е появило (или null при изтичане).
const waitVisible = async (timeout) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
        if (await visible()) return Date.now() - t0;
        await page.waitForTimeout(250);
    }
    return null;
};

const openSettings = async () => {
    await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        if (m) m.classList.add('visible');
    });
    await page.waitForTimeout(400);
};

// ---------- 1) редът е като другите настройки ----------
step = 'ред в Настройки';
await openSettings();
const rowInfo = await page.evaluate(() => {
    const sel = document.getElementById('idle-lock-select');
    const row = document.getElementById('idle-lock');
    const auto = document.getElementById('auto-protect');
    if (!sel || !row) return { row: false };
    const label = row.querySelector('label');
    const autoLabel = auto ? auto.querySelector('label') : null;
    const csRow = getComputedStyle(row);
    const csAuto = auto ? getComputedStyle(auto) : null;
    const csLabel = label ? getComputedStyle(label) : null;
    const sameRowStyle = !!csAuto && csRow.display === csAuto.display
        && csRow.alignItems === csAuto.alignItems && csRow.flexDirection === csAuto.flexDirection;
    return {
        row: true,
        rowClass: row.className,
        autoRowClass: auto ? auto.className : null,
        options: [...sel.options].map(o => o.value),
        value: sel.value,
        selectClass: sel.className,
        selectWidth: Math.round(sel.getBoundingClientRect().width),
        labelText: label ? label.textContent.trim() : null,
        labelAlign: csLabel ? csLabel.textAlign : null,
        sameRowStyle,
        // редът стои веднага след „Автоматична защита“ и преди „Показване на дата…“
        afterAuto: auto ? auto.nextElementSibling === row : false
    };
});
ok(rowInfo.row === true, '2.1 в Настройки има ред „Заключване след“', rowInfo);
ok(rowInfo.row === true && JSON.stringify(rowInfo.options) === JSON.stringify(['10', '15', '30', '60']),
    '2.2 времената са 10 / 15 / 30 / 60', rowInfo.options);
ok(rowInfo.value === '30', '2.3 по подразбиране е 30 s', rowInfo.value);
ok(rowInfo.labelText === 'Заключване след:', '2.4 етикетът е преведен (BG)', rowInfo.labelText);
ok(rowInfo.rowClass === rowInfo.autoRowClass, '2.5 редът е със същия клас като „Автоматична защита“', { a: rowInfo.rowClass, b: rowInfo.autoRowClass });
ok(rowInfo.sameRowStyle === true, '2.6 подредбата е като на другите настройки (ред, подравняване, посока)', rowInfo);
ok(rowInfo.selectClass === 'zoom-input-select' && rowInfo.selectWidth >= 60,
    '2.7 падащото меню е със същия клас и ширина като другите в Настройки', { c: rowInfo.selectClass, w: rowInfo.selectWidth });
ok(rowInfo.afterAuto === true, '2.8 редът стои веднага след „Автоматична защита“', rowInfo.afterAuto);

// ---------- 2) изборът се пази ----------
step = 'избор 10';
const chosen = await page.evaluate(() => {
    const sel = document.getElementById('idle-lock-select');
    if (!sel) return { found: false, stored: localStorage.getItem('privacyIdleLock'), value: null };
    sel.value = '10';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    return { found: true, stored: localStorage.getItem('privacyIdleLock'), value: sel.value };
});
ok(chosen.found === true && chosen.stored === '10' && chosen.value === '10', '3.1 изборът 10 се пази', chosen);

step = 'ново пускане';
await boot();
await openSettings();
const afterReload = await page.evaluate(() => {
    const sel = document.getElementById('idle-lock-select');
    return { value: sel ? sel.value : null, stored: localStorage.getItem('privacyIdleLock') };
});
ok(afterReload.value === '10' && afterReload.stored === '10', '3.2 след ново пускане селектът показва 10, не 30', afterReload);

// Без реда настройката за време няма как да се зададе: контролният пуск спира дотук по смисъл,
// но продължава, за да покаже и че брояч няма.
if (!rowInfo.row) console.log('INFO редът липсва в този код — проверките за времето и за брояча падат по-долу');

// ---------- 3) броячът вдига екрана ----------
step = 'режим на приложение';
await page.evaluate(STANDALONE);
// Броячът се задейства само след като приложението е било на екран и на фокус.
await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    if (typeof window.privacyIdleReset === 'function') window.privacyIdleReset();
});
const early = await waitVisible(4000);
ok(early === null, '4.1 преди изтеклите 10 s екранът НЕ излиза', { early });
const shown = await waitVisible(14000);
ok(shown !== null && shown >= 6000 && shown <= 14000, '4.2 екранът излиза след ~10 s без докосване', { shown });

// ---------- 4) „Затвори“ пуска брояча наново ----------
step = 'затвори';
await page.evaluate(() => window.privacyOverlayHide());
await page.waitForTimeout(300);
ok(!(await visible()), '5.1 „Затвори“ сваля екрана');
const closedEarly = await waitVisible(4000);
ok(closedEarly === null, '5.2 след затваряне екранът не излиза веднага', { closedEarly });
const again = await waitVisible(14000);
ok(again !== null, '5.3 след затваряне броячът тече наново и екранът пак излиза', { again });

// ---------- 5) докосване нулира брояча ----------
step = 'докосване';
await page.evaluate(() => window.privacyOverlayHide());
await page.waitForTimeout(6000);
await page.evaluate(() => {
    const t = new Touch({ identifier: 1, target: document.body, clientX: 20, clientY: 20, screenX: 20, screenY: 20 });
    document.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [t], targetTouches: [t], changedTouches: [t] }));
});
await page.waitForTimeout(6000);
const afterTouch = await visible();
ok(afterTouch === false, '6.1 докосване на 6-ата секунда отлага екрана (на 12-ата още го няма)', { afterTouch });
const afterTouchShown = await waitVisible(9000);
ok(afterTouchShown !== null, '6.2 след отлагането екранът излиза', { afterTouchShown });

// ---------- 6) изключена „Автоматична защита“ изключва и брояча ----------
step = 'без автоматична защита';
await page.evaluate(() => {
    window.privacyOverlayHide();
    localStorage.setItem('privacyAutoProtect', 'false');
    const cb = document.getElementById('auto-protect-checkbox');
    if (cb) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    if (typeof window.privacyIdleReset === 'function') window.privacyIdleReset();
});
await page.waitForTimeout(300);
ok(!(await visible()), '7.1 изключването на защитата сваля екрана');
const offShown = await waitVisible(14000);
ok(offShown === null, '7.2 с изключена защита броячът не заключва', { offShown });

// ---------- 7) старият път (blur) още работи ----------
step = 'blur';
await page.evaluate(() => {
    localStorage.setItem('privacyAutoProtect', 'true');
    const cb = document.getElementById('auto-protect-checkbox');
    if (cb) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); }
    if (typeof window.privacyIdleReset === 'function') window.privacyIdleReset();
    window.dispatchEvent(new Event('blur'));
});
const blurShown = await waitVisible(2000);
ok(blurShown !== null, '8.1 blur в режим на приложение още вдига екрана', { blurShown });

// ---------- 8) конзола ----------
step = 'конзола';
const realErrs = errs.filter(e => !/Failed to load resource|ResizeObserver|net::ERR/.test(e));
ok(realErrs.length === 0, '9.1 няма изключения в конзолата', realErrs.slice(0, 6));

await browser.close();
srv.close();
console.log(fails === 0 ? `OK ${n}/${n}` : `FAILED ${fails}/${n}`);
process.exit(fails === 0 ? 0 : 1);
