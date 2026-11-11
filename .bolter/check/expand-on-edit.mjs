// Настройки -> „Разпъване при редактиране" (b5.27 в nomn, b3.81 в uni).
// Собственикът (11.11.2026): „Направи го чек бокс в Настройки - Разпъване при редактиране, избран по
// подразбиране. След това принеси разпъването и настройката в uni".
// Проверява се в истински Chromium по истинския път (showModal, истински клик в бележката, истински
// фокус), а не по източниците:
//   - квадратчето е в Настройки, с надпис от езиковия файл, и е избрано, когато няма записана стойност;
//   - при включено (по подразбиране) бележката при писане заема цялата ширина на екрана и стои на 0;
//   - при изключено бележката пак се качва най-горе (иначе клавиатурата я закрива), но пази своята
//     ширина - това е смисълът на настройката;
//   - изключването на квадратчето маха ширината веднага, без да се затваря бележката;
//   - ключът expandOnEdit е в appSettingsKeys, значи стига до профила (иначе при старт се губи).
// Пуска се от корена на хранилището:
//   node .bolter/check/expand-on-edit.mjs            (nomn)
//   ROOT=uni node .bolter/check/expand-on-edit.mjs   (uni)
import { chromium } from '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const rootSrc = path.resolve(process.env.ROOT || 'nomn');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index.html' : p;
    try {
        const b = await readFile(path.join(rootSrc, rel));
        res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(b);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 400) : ''));
    if (!cond) fails++;
};

const html = await readFile(path.join(rootSrc, 'index.html'), 'utf8');
const mainJs = await readFile(path.join(rootSrc, 'main.js'), 'utf8');
const css = await readFile(path.join(rootSrc, 'style.css'), 'utf8');
const bg = JSON.parse(await readFile(path.join(rootSrc, 'lang/i18n-bg.json'), 'utf8'));
const en = JSON.parse(await readFile(path.join(rootSrc, 'lang/i18n-en.json'), 'utf8'));

// --- 1. Статично -------------------------------------------------------------------------------
ok(/<input type="checkbox" id="expand-on-edit-checkbox" class="settings-checkbox">/.test(html), 'index.html има квадратче expand-on-edit-checkbox');
ok(/<label for="expand-on-edit-checkbox"[\s\S]{0,220}data-key="expandOnEditLabel"/.test(html), 'надписът на квадратчето минава през езиковия ключ expandOnEditLabel');
ok(bg.expandOnEditLabel === 'Разпъване при редактиране:', 'българският надпис е „Разпъване при редактиране"', bg.expandOnEditLabel);
ok(typeof en.expandOnEditLabel === 'string' && en.expandOnEditLabel.length > 0, 'има и английски надпис', en.expandOnEditLabel);
ok(/localStorage\.getItem\('expandOnEdit'\) !== 'false'/.test(mainJs), 'липсваща стойност значи включено (по подразбиране избрано)');
ok(/classList\.toggle\('note-window-kb-wide', !!on && isExpandOnEditEnabled\(\)\)/.test(mainJs), 'ширината е отделен клас, който следва настройката');
ok(/const appSettingsKeys = \[[\s\S]*?'expandOnEdit'/.test(mainJs), 'expandOnEdit е в appSettingsKeys, значи стига до профила');
ok(/\.note-window\.note-window-kb-top\.note-window-kb-wide \.modal-content-box\s*\{[^}]*width:\s*100% !important/.test(css), 'style.css разпъва по ширина само с класа note-window-kb-wide');
ok(!/\.note-window\.note-window-kb-top \.modal-content-box\s*\{[^}]*width:\s*100%/.test(css), 'качването най-горе вече не носи ширината');

// --- 2. Телефон 412x915 с пръст (както екранът на собственика) ---------------------------------
const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
let errs = [];
async function newClient(opts) {
    const ctx = await browser.newContext({
        viewport: { width: opts.width, height: opts.height },
        hasTouch: true, isMobile: true, serviceWorkers: 'block',
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
        const url = route.request().url();
        if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
        }
        if (url.startsWith('https://accounts.google.com/gsi/client')) {
            return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
        }
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    await ctx.addInitScript(([expand]) => {
        window.gapi = {
            load() { },
            client: {
                setToken() { }, getToken() { return { access_token: 'tok' }; },
                drive: { files: { list() { return Promise.resolve({ result: { files: [] } }); }, get() { return Promise.resolve({ result: { thumbnailLink: 'https://thumb.invalid/x=s220' } }); } } },
            },
            auth: { getToken() { return { access_token: 'tok' }; } },
        };
        sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
        localStorage.setItem('language', 'bg');
        localStorage.setItem('gdrive_folder_id_Images', 'FOLDER_IMAGES');
        localStorage.setItem('gdrive_multinotes_data_id', 'FOLDER_DATA');
        localStorage.setItem('singleNoteMode', 'false');
        if (expand === 'false') localStorage.setItem('expandOnEdit', 'false');
    }, [opts.expand]);
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof startApp === 'function' && typeof showModal === 'function');
    await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
    await page.waitForFunction(() => contentModal, null, { timeout: 20000 });
    await page.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 10000 });
    return { ctx, page };
}

const openNote = (page, def) => page.evaluate((def) => {
    useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
    dbSourceGlobal = null; dirHandle = null; isOffline = false;
    authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
    if (!allNotesData.some(x => String(x.gdid) === def.gdid)) {
        allNotesData.push({
            alarm_type: -1, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0,
            gdid: def.gdid, id: def.id, notetxt: def.raw, numord: Number(def.id), sellist: 0, status: 0,
            text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
        });
    }
    showModal({ raw: def.raw, format: '', id: def.id, gdid: def.gdid });
}, def);

const state = (page) => page.evaluate(() => {
    const win = getOpenNoteWindows().find(w => w.el.classList.contains('visible'));
    if (!win) return { open: false };
    const b = win.box.getBoundingClientRect();
    return {
        open: true,
        kbClass: win.el.classList.contains('note-window-kb-top'),
        wideClass: win.el.classList.contains('note-window-kb-wide'),
        top: Math.round(b.top), left: Math.round(b.left),
        w: Math.round(b.width), h: Math.round(b.height),
        vw: innerWidth, vh: innerHeight,
        active: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : null,
    };
});
const settle = (page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const settleOpen = (page) => page.waitForFunction(() => {
    const w = getOpenNoteWindows().find(x => x.el.classList.contains('visible'));
    if (!w) return false;
    const t = getComputedStyle(w.box).transform;
    return t === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(t);
}, null, { timeout: 5000 }).then(() => settle(page));

const NOTE = { key: 'plan', id: '9401', gdid: 'EX1', raw: 'План за седмицата|понеделник: отчет' };

// Настройките се строят от createSettingsUI, значи квадратчето се вижда, когато екранът се отвори.
const openSettings = async (page) => {
    await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        if (m) m.classList.remove('visible');
        document.getElementById('settings_button').click();
    });
    await page.waitForSelector('#settings-modal.visible', { timeout: 8000 }).catch(() => { });
    await page.waitForTimeout(1200);
};
const hideSettings = (page) => page.evaluate(() => {
    const m = document.getElementById('settings-modal');
    if (m) m.classList.remove('visible');
});

// --- 3. По подразбиране: включено ---------------------------------------------------------------
const a = await newClient({ width: 412, height: 915 });
let s;
{
    // Както приложението прави при старт: строи Настройки предварително - тогава се слагат слушателите
    // на квадратчетата и се сверява състоянието им.
    await a.page.evaluate(() => createSettingsUI([], false));
    await openSettings(a.page);
    const cb = await a.page.evaluate(() => {
        const el = document.getElementById('expand-on-edit-checkbox');
        const label = el && document.querySelector('label[for="expand-on-edit-checkbox"]');
        return el ? { exists: true, checked: el.checked, stored: localStorage.getItem('expandOnEdit'), label: label ? label.textContent.trim() : null } : { exists: false };
    });
    ok(cb.exists, 'квадратчето съществува в Настройки');
    ok(cb.label === 'Разпъване при редактиране:', 'надписът е „Разпъване при редактиране"', cb);
    ok(cb.checked === true, 'без записана стойност е избрано (по подразбиране)', cb);
    ok(cb.stored === null, 'нищо не се записва, докато не се пипне', cb);
    await hideSettings(a.page);

    await openNote(a.page, NOTE);
    await settleOpen(a.page);
    s = await state(a.page);
    ok(s.open && !s.kbClass && !s.wideClass, 'преди редакция бележката е на мястото си, без класовете', s);
    const parked = s.w;

    await a.page.locator('.note-window.visible #modal-body').first().click();
    await settle(a.page);
    s = await state(a.page);
    ok(s.active === 'note-edit-textarea', 'фокусът е в полето за текст', s);
    ok(s.kbClass, 'бележката се качва най-горе при писане', s);
    ok(s.wideClass, 'ширината е разпъната (класът е сложен)', s);
    ok(s.left === 0 && s.w === s.vw, 'при писане бележката заема цялата ширина на екрана', { parked, ...s });
    ok(s.top === 0, 'и стои на горния ръб', s);

    // Изключване от квадратчето в Настройки, после пак фокус в бележката: ширината трябва да падне,
    // а качването най-горе да остане.
    await openSettings(a.page);
    const beforeToggle = await a.page.evaluate(() => document.getElementById('expand-on-edit-checkbox').checked);
    ok(beforeToggle === true, 'при отворена бележка квадратчето пак е избрано', beforeToggle);
    await a.page.locator('#expand-on-edit-checkbox').click();
    const stored = await a.page.evaluate(() => localStorage.getItem('expandOnEdit'));
    ok(stored === 'false', 'изключването записва expandOnEdit=false', stored);
    await hideSettings(a.page);
    await a.page.locator('.note-window.visible #modal-body').first().click();
    await settle(a.page);
    s = await state(a.page);
    ok(s.kbClass && !s.wideClass, 'след изключването бележката пак се качва най-горе, но вече не се разпъва', s);
    ok(s.w === parked && s.top === 0, 'и си стои на своята ширина, пак на горния ръб', { parked, ...s });
}
await a.ctx.close();

// --- 4. Записано изключено: същото и след презареждане ------------------------------------------
const b = await newClient({ width: 412, height: 915, expand: 'false' });
{
    await b.page.evaluate(() => createSettingsUI([], false));
    await openSettings(b.page);
    const cb = await b.page.evaluate(() => {
        const el = document.getElementById('expand-on-edit-checkbox');
        return { checked: el.checked, stored: localStorage.getItem('expandOnEdit') };
    });
    ok(cb.checked === false, 'при записано изключено квадратчето е празно', cb);
    await hideSettings(b.page);

    await openNote(b.page, NOTE);
    await settleOpen(b.page);
    const parkedState = await state(b.page);
    const parked = parkedState.w;
    await b.page.locator('.note-window.visible #modal-body').first().click();
    await settle(b.page);
    s = await state(b.page);
    ok(s.kbClass, 'и тогава бележката се качва най-горе (клавиатурата не бива да я закрива)', s);
    ok(!s.wideClass, 'без класа за ширина', s);
    ok(s.w === parked && s.w < s.vw, 'бележката пази своята ширина, не цялата', { parked, ...s });
    ok(s.top === 0, 'и пак стои на горния ръб', s);
}
await b.ctx.close();

ok(errs.length === 0, 'без грешки в конзолата', errs);

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} ok`);
process.exit(fails ? 1 : 0);
