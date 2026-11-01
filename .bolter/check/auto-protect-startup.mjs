// Автоматична защита: защитният екран да не излиза при старт + нова настройка под „Скриване на
// асистента“ (uni и MNV), включена по подразбиране.
//
// Защо: при пускане Android още мести прозореца и праща blur/visibilitychange, докато приложението
// още излиза на екрана. Старият код вдигаше плочките още тогава, а скриването оставяше флага
// „истинско скриване“, затова след връщане на фокуса екранът оставаше до натискане на „Затвори“.
//
// Какво проверява (истински Chromium, истинският код, мобилен контекст 390x844):
//   1) пускане с blur и скриване, докато приложението още не е на фокус: екранът не излиза и след
//      като фокусът дойде не остава (бележките са на екрана, без плочки);
//   2) след пускането истински blur в режим на приложение пак вдига екрана (двете плочки 300px);
//   3) редът „Автоматична защита“ е точно под „Скриване на асистента“, етикетът идва от езиковия
//      файл и отметката е включена по подразбиране;
//   4) изключването записва privacyAutoProtect=false и маха вдигнатия екран веднага; след презареждане
//      blur и скриване не вдигат нищо;
//   5) кликът на логото в хедъра пак вдига екрана и при изключена защита;
//   6) включването пак връща защитата;
//   7) същото пускане и същият ред в MNV;
//   8) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/auto-protect-startup.mjs   (exit 1 при провал)
// UNI_ROOT=… / MNV_ROOT=… сочат друга папка (за контролата върху стария код).
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

const UNI_ROOT = path.resolve(process.env.UNI_ROOT || 'uni');
const MNV_ROOT = path.resolve(process.env.MNV_ROOT || 'MNV');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };

const serve = async (root, page) => {
    const srv = http.createServer(async (req, res) => {
        const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const rel = p === '/' ? page : p;
        try {
            const b = await readFile(path.join(root, rel));
            res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
            res.end(b);
        } catch { res.writeHead(404); res.end(); }
    });
    await new Promise(r => srv.listen(0, r));
    return { origin: `http://localhost:${srv.address().port}`, close: () => srv.close() };
};

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

// ---------- Общи четци (еднакви id-та и класове в двете приложения) ----------
const overlayState = (page) => page.evaluate(() => {
    const ov = document.getElementById('privacy-overlay');
    if (!ov) return { present: false, visible: false };
    const cs = getComputedStyle(ov);
    return { present: true, visible: cs.display !== 'none' && cs.visibility !== 'hidden', display: cs.display };
});

// Пускане на Android: blur и скриване, докато прозорецът още излиза на екрана.
const launchBlur = (page) => page.evaluate(() => { window.dispatchEvent(new Event('blur')); });
const launchHidden = (page) => page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
});
const goVisible = (page) => page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
});
const setFocus = (page, v) => page.evaluate((v) => { window.__setFocus(v); }, v);
const focusEvt = (page) => page.evaluate(() => { window.dispatchEvent(new Event('focus')); });

const rowInfo = (page) => page.evaluate(() => {
    const row = document.getElementById('auto-protect');
    if (!row) return { present: false };
    const prev = row.previousElementSibling;
    const label = row.querySelector('label');
    const cb = document.getElementById('auto-protect-checkbox');
    return {
        present: true,
        prevId: prev ? prev.id : null,
        dataKey: label ? label.getAttribute('data-key') : null,
        text: label ? label.textContent.trim() : null,
        checked: cb ? cb.checked : null,
        rowDisplay: getComputedStyle(row).display,
        labelShown: label ? getComputedStyle(label).display !== 'none' : false
    };
});

const openSettings = async (page) => {
    await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        if (m) m.classList.remove('visible');
        const btn = document.getElementById('settings_button') || document.querySelector('#settings_button, .settings-button');
        if (btn) btn.click();
    });
    await page.waitForSelector('#settings-modal.visible', { timeout: 8000 }).catch(() => { });
    await page.waitForTimeout(400);
    return page.evaluate(() => !!document.getElementById('settings-modal').classList.contains('visible'));
};

const browser = await chromium.launch({ executablePath: CHROME });
const uniSrv = await serve(UNI_ROOT, 'index.html');
const mnvSrv = await serve(MNV_ROOT, 'index-2.html');

// Фокусът се управлява от теста: при пускане приложението още не е на фокус (така Android го
// вижда), а след това фокусът идва. Иначе страницата в Playwright е на фокус още от първия кадър.
const initScript = ({ appScreen, startUnfocused, storage }) => {
    window.__setFocus = (v) => { window.__focusState.on = v; };
    window.__focusState = { on: !startUnfocused };
    document.hasFocus = () => window.__focusState.on;
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
    for (const k of Object.keys(storage || {})) localStorage.setItem(k, storage[k]);
    const orig = window.matchMedia.bind(window);
    window.matchMedia = (q) => {
        if (appScreen && /display-mode:\s*(standalone|fullscreen|minimal-ui)/.test(String(q))) {
            return { matches: true, media: String(q), onchange: null, addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { }, dispatchEvent() { return false; } };
        }
        return orig(q);
    };
};

const newPage = async ({ appScreen = true, startUnfocused = false, storage = {} } = {}) => {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        serviceWorkers: 'block'
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 200)); });
    await page.addInitScript(initScript, { appScreen, startUnfocused, storage });
    return { ctx, page, errs };
};

const openUni = async (opts = {}) => {
    const { ctx, page, errs } = await newPage(opts);
    await page.goto(`${uniSrv.origin}/index.html?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        || document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    await page.waitForTimeout(300);
    return { ctx, page, errs, ready };
};

// MNV тръгва без демо режим: чакаме функциите и скриваме екрана за вход, както го прави и самото
// приложение след успешен старт.
const openMnv = async (opts = {}) => {
    const { ctx, page, errs } = await newPage(opts);
    await page.goto(`${mnvSrv.origin}/`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => typeof createNoteElement === 'function'
        && typeof startApp === 'function' && typeof showModal === 'function', null, { timeout: 30000 })
        .then(() => true, () => false);
    if (ready) {
        await page.evaluate(async () => {
            try { if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags(); } catch (e) { /* ignore */ }
            try { useIndexedDb = true; useGoogleDb = false; useLocalFolder = false; useArhDb = false; isOffline = true; } catch (e) { /* ignore */ }
            ['login-page', 'request-access-modal', 'folderIdPromptPopup'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
        });
    }
    await page.waitForTimeout(300);
    return { ctx, page, errs, ready };
};

// ---------- 1) uni: пускане ----------
{
    const { ctx, page, errs, ready } = await openUni({ appScreen: true, startUnfocused: true });
    ok(ready, '1.1 uni: приложението тръгна');
    ok(!(await overlayState(page)).visible, '1.2 uni: при старт няма защитен екран');

    await launchBlur(page);
    ok(!(await overlayState(page)).visible, '1.3 uni: blur при пускане не вдига екрана', await overlayState(page));
    await launchHidden(page);
    ok(!(await overlayState(page)).visible, '1.4 uni: скриване при пускане не вдига екрана', await overlayState(page));

    await goVisible(page);
    await setFocus(page, true);
    await focusEvt(page);
    await page.waitForTimeout(400);
    ok(!(await overlayState(page)).visible, '1.5 uni: след като фокусът дойде, екранът не остава (не иска Затвори)', await overlayState(page));
    const look = await page.evaluate(() => {
        const ov = document.getElementById('privacy-overlay');
        const note = document.querySelector('#notes-container .note');
        return { overlay: ov ? getComputedStyle(ov).display !== 'none' : false, note: !!note && note.getBoundingClientRect().width > 0 };
    });
    ok(!look.overlay && look.note, '1.6 uni: бележките са на екрана, без плочки отгоре', look);

    // След пускането защитата работи както преди.
    await page.waitForTimeout(900);
    await launchBlur(page);
    const shown = await overlayState(page);
    ok(shown.visible, '1.7 uni: след пускането истински blur пак вдига екрана', shown);
    const tiles = await page.evaluate(() => [...document.querySelectorAll('#privacy-overlay .privacy-tile')].map(t => Math.round(t.getBoundingClientRect().width)));
    ok(tiles.length === 2 && tiles.every(w => w === 300), '1.8 uni: двете плочки са 300px', tiles);
    const closed = await page.evaluate(() => { document.querySelector('#privacy-overlay .privacy-close').click(); const ov = document.getElementById('privacy-overlay'); return getComputedStyle(ov).display !== 'none'; });
    ok(!closed, '1.9 uni: бутонът Затвори маха екрана');

    // ---------- 2) редът в Настройки ----------
    const opened = await openSettings(page);
    ok(opened, '2.1 uni: Настройки се отвориха');
    const row = await rowInfo(page);
    ok(row.present, '2.2 uni: редът „Автоматична защита“ е в Настройки', row);
    ok(row.prevId === 'hide-assistant', '2.3 uni: редът е точно под „Скриване на асистента“', row.prevId);
    ok(row.dataKey === 'autoProtectLabel' && row.text === 'Автоматична защита:', '2.4 uni: етикетът идва от езиковия файл', { key: row.dataKey, text: row.text });
    ok(row.checked === true, '2.5 uni: отметката е включена по подразбиране', row.checked);
    ok(row.rowDisplay !== 'none' && row.labelShown, '2.6 uni: редът се вижда', row);

    // ---------- 3) изключване, докато екранът е вдигнат ----------
    await page.waitForTimeout(400);
    await launchBlur(page);
    ok((await overlayState(page)).visible, '3.1 uni: екранът е вдигнат преди изключването');
    const off = await page.evaluate(() => {
        document.getElementById('auto-protect-checkbox').click();
        const ov = document.getElementById('privacy-overlay');
        return { stored: localStorage.getItem('privacyAutoProtect'), visible: ov ? getComputedStyle(ov).display !== 'none' : false };
    });
    await page.waitForTimeout(300);
    const off2 = await page.evaluate(() => {
        const ov = document.getElementById('privacy-overlay');
        return { stored: localStorage.getItem('privacyAutoProtect'), visible: ov ? getComputedStyle(ov).display !== 'none' : false, checked: document.getElementById('auto-protect-checkbox').checked };
    });
    ok(off2.stored === 'false', '3.2 uni: изключването се записва (privacyAutoProtect=false)', off2);
    ok(!off2.visible, '3.3 uni: изключването маха вдигнатия екран веднага', { immediate: off, later: off2 });
    ok(off2.checked === false, '3.4 uni: отметката е свалена');

    await ctx.close();
}

// ---------- 4) uni: изключена защита след презареждане, логото, включване пак ----------
{
    const { ctx, page, errs, ready } = await openUni({ appScreen: true, startUnfocused: false, storage: { privacyAutoProtect: 'false' } });
    ok(ready, '4.1 uni: тръгна с изключена защита');
    await page.waitForTimeout(1000);
    await launchBlur(page);
    ok(!(await overlayState(page)).visible, '4.2 uni: при изключена защита blur не вдига екрана', await overlayState(page));
    await launchHidden(page);
    ok(!(await overlayState(page)).visible, '4.3 uni: при изключена защита и скриване не вдига екрана', await overlayState(page));
    await goVisible(page);
    await setFocus(page, true);
    await focusEvt(page);
    await page.waitForTimeout(300);
    ok(!(await overlayState(page)).visible, '4.4 uni: и след връщане на фокуса няма екран');

    const logo = await page.evaluate(() => {
        const el = document.querySelector('.header-logo');
        if (!el) return { found: false };
        const r = el.getBoundingClientRect();
        return { found: true, w: Math.round(r.width), display: getComputedStyle(el).display };
    });
    ok(logo.found && logo.w > 0 && logo.display !== 'none', '4.5 uni: логото в хедъра се вижда на 390', logo);
    await page.evaluate(() => document.querySelector('.header-logo').click());
    await page.waitForTimeout(250);
    ok((await overlayState(page)).visible, '4.6 uni: клик на логото вдига екрана и при изключена защита');
    await page.evaluate(() => { const b = document.querySelector('#privacy-overlay .privacy-close'); if (b) b.click(); });

    const opened = await openSettings(page);
    ok(opened, '4.7 uni: Настройки се отвориха при изключена защита');
    const rowOff = await rowInfo(page);
    ok(rowOff.checked === false, '4.8 uni: след презареждане отметката е свалена', rowOff.checked);

    await page.evaluate(() => document.getElementById('auto-protect-checkbox').click());
    await page.waitForTimeout(700);
    const on = await page.evaluate(() => ({ stored: localStorage.getItem('privacyAutoProtect'), checked: document.getElementById('auto-protect-checkbox').checked }));
    ok(on.stored === 'true' && on.checked, '4.9 uni: включването се записва', on);
    await page.waitForTimeout(900);
    await launchBlur(page);
    ok((await overlayState(page)).visible, '4.10 uni: след включване blur пак вдига екрана', await overlayState(page));
    ok(errs.length === 0, '4.11 uni: няма изключения в конзолата', errs);
    await ctx.close();
}

// ---------- 5) MNV: същото пускане и същият ред ----------
{
    const { ctx, page, errs, ready } = await openMnv({ startUnfocused: true });
    ok(ready, '5.1 MNV: приложението тръгна');
    ok(!(await overlayState(page)).visible, '5.2 MNV: при старт няма защитен екран');

    await launchBlur(page);
    ok(!(await overlayState(page)).visible, '5.3 MNV: blur при пускане не вдига екрана', await overlayState(page));
    await launchHidden(page);
    ok(!(await overlayState(page)).visible, '5.4 MNV: скриване при пускане не вдига екрана', await overlayState(page));
    await goVisible(page);
    await setFocus(page, true);
    await focusEvt(page);
    await page.waitForTimeout(400);
    ok(!(await overlayState(page)).visible, '5.5 MNV: след като фокусът дойде, екранът не остава', await overlayState(page));

    // Режим на приложение (Playwright не пуска истински standalone прозорец).
    await page.evaluate(() => {
        const real = window.matchMedia.bind(window);
        window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q)
            ? { matches: true, media: String(q), onchange: null, addListener() { }, removeListener() { }, addEventListener() { }, removeEventListener() { }, dispatchEvent() { return false; } }
            : real(q));
    });
    await page.waitForTimeout(900);
    await launchBlur(page);
    ok((await overlayState(page)).visible, '5.6 MNV: след пускането истински blur пак вдига екрана', await overlayState(page));
    await page.evaluate(() => { const b = document.querySelector('#privacy-overlay .privacy-close'); if (b) b.click(); });

    // MNV без вход не стига до инициализацията на Настройки (тя е след checkAuth), затова викаме
    // строежа на панела директно — същият извик, който приложението прави след успешен старт.
    // Останалата част от панела хвърля без вход (същото е и на стария код, проверено), затова тук
    // гледаме само реда „Автоматична защита“.
    const built = await page.evaluate(async () => {
        const before = document.getElementById('auto-protect-checkbox').checked;
        let err = null;
        try { await createSettingsUI([], false); } catch (e) { err = String((e && e.message) || e); }
        return { before, after: document.getElementById('auto-protect-checkbox').checked, err };
    });
    if (built.err) console.log('NOTE MNV без вход: останалата част от панела хвърля — ' + built.err);
    ok(built.before === false && built.after === true, '5.7 MNV: строежът на Настройки включва отметката по подразбиране', built);
    await page.evaluate(() => document.getElementById('settings-modal').classList.add('visible'));
    await page.waitForTimeout(300);
    const row = await rowInfo(page);
    ok(row.present, '5.8 MNV: редът „Автоматична защита“ е в Настройки', row);
    ok(row.prevId === 'hide-assistant', '5.9 MNV: редът е точно под „Скриване на асистента“', row.prevId);
    ok(row.dataKey === 'autoProtectLabel' && row.text === 'Автоматична защита:', '5.10 MNV: етикетът идва от езиковия файл', { key: row.dataKey, text: row.text });
    ok(row.checked === true, '5.11 MNV: отметката е включена по подразбиране', row.checked);

    const off = await page.evaluate(() => {
        document.getElementById('auto-protect-checkbox').click();
        return localStorage.getItem('privacyAutoProtect');
    });
    await page.waitForTimeout(400);
    ok(off === 'false', '5.12 MNV: изключването се записва', off);
    await page.waitForTimeout(900);
    await launchBlur(page);
    ok(!(await overlayState(page)).visible, '5.13 MNV: при изключена защита blur не вдига екрана', await overlayState(page));
    ok(errs.length === 0, '5.14 MNV: няма изключения в конзолата', errs);
    await ctx.close();
}

await browser.close();
uniSrv.close();
mnvSrv.close();
console.log(`${fails ? 'FAILED' : 'OK'} ${n - fails}/${n}`);
process.exit(fails ? 1 : 0);
