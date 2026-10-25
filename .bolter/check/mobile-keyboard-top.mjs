// Мобилна клавиатура: бележката застава най-горе при фокус в полето за текст (b2.89).
// Собственикът (25.10.2026): „на мобилни, при отваряне на редактора и показване на клавиатурата,
// бележката да се измества най-горе на екрана, за да не я закрива клавиатурата. засичането да е по
// фокус в полето за текст, не по measured височина на изгледа."
// Проверява се по ИСТИНСКИЯ път в браузър (showModal, истински клик в бележката, истински фокус):
//   - на 390x844 с пръст (pointer: coarse) бележката преди редакция стои на запомненото си място;
//   - клик в тялото влиза в редакция и фокусът в полето вдига бележката на НАЙ-ГОРНИЯ ръб (top: 0);
//   - височината се съкращава до 55vh (таванът, който пази долния ред с бутони над клавиатурата);
//   - инлайн top/left на бележката НЕ се пишат - запомненото място остава същото;
//   - щом фокусът излезе (blur, както при затваряне на клавиатурата), бележката се връща точно на
//     мястото си и на цялата си височина;
//   - фокусът в полето за заглавие също вдига бележката;
//   - на широк екран (1280) и при мишка (pointer: fine) на 390px бележката НЕ се мести;
//   - статично в източниците: засичането е по фокус, не по visualViewport.
// Пуска се от корена на хранилището:
//   node .bolter/check/mobile-keyboard-top.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const rootSrc = path.resolve(process.env.ROOT || 'uni');
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

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });

// Един „клиент" на приложението: контекст с избран екран/показалец, фалшив Drive и отворено приложение.
async function newClient(opts) {
    const ctx = await browser.newContext({
        viewport: { width: opts.width, height: opts.height },
        hasTouch: !!opts.touch,
        isMobile: !!opts.mobile,
        serviceWorkers: 'block',
    });
    await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
        const url = route.request().url();
        if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
        }
        if (url.startsWith('https://thumb.invalid/')) {
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="225"><rect width="300" height="225" fill="#c6d2e4"/></svg>';
            return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg });
        }
        if (url.startsWith('https://accounts.google.com/gsi/client')) {
            return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
        }
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    await ctx.addInitScript(() => {
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
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof startApp === 'function' && typeof showModal === 'function');
    await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
    await page.waitForFunction(() => contentModal, null, { timeout: 20000 });
    await page.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 10000 });
    return { ctx, page, errs };
}

// Бележка по истинския път (showModal), както клик на картата на борда.
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

// Състоянието на бележката, което се проверява: място, височина, класът за клавиатура.
const state = (page) => page.evaluate(() => {
    const win = getOpenNoteWindows().find(w => w.el.classList.contains('visible'));
    if (!win) return { open: false };
    const b = win.box.getBoundingClientRect();
    const ae = document.activeElement;
    return {
        open: true,
        kbClass: win.el.classList.contains('note-window-kb-top'),
        top: Math.round(b.top), left: Math.round(b.left),
        w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom),
        inlineTop: win.box.style.top, inlineLeft: win.box.style.left,
        vh: innerHeight, vw: innerWidth,
        active: ae ? (ae.id || ae.tagName) : null,
        hasTextarea: !!win.box.querySelector('#note-edit-textarea'),
        hasTitle: !!win.box.querySelector('#note-edit-title-textarea'),
    };
});
const settle = (page) => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
// Отварянето има поп анимация (scale 0.7 -> 1 за 0.4s). Меренето ѝ по средата дава по-малка кутия и
// изместен ръб, затова се чака тя да свърши, а не се спи фиксирано време.
const settleOpen = (page) => page.waitForFunction(() => {
    const w = getOpenNoteWindows().find(x => x.el.classList.contains('visible'));
    if (!w) return false;
    const t = getComputedStyle(w.box).transform;
    return t === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(t);
}, null, { timeout: 5000 }).then(() => settle(page));

// --- 1. Статично: засичането е по фокус, не по измерена височина на изгледа --------------------
const mainJs = await readFile(path.join(rootSrc, 'main.js'), 'utf8');
const css = await readFile(path.join(rootSrc, 'style.css'), 'utf8');
ok(!/visualViewport/.test(mainJs), 'в main.js няма visualViewport (никакво мерене на височината на изгледа)');
ok(/classList\.toggle\('note-window-kb-top'/.test(mainJs), 'main.js слага класа по фокус');
ok(/isNoteKeyboardField/.test(mainJs) && /addEventListener\('focusin'/.test(mainJs) && /addEventListener\('focusout'/.test(mainJs), 'засичането е по focusin/focusout на полетата за текст');
ok(/\.note-window\.note-window-kb-top \.modal-content-box\s*\{[^}]*top:\s*0 !important/.test(css), 'style.css качва бележката на top: 0 при класа');
ok(/\.note-window\.note-window-kb-top \.modal-content-box\s*\{[^}]*max-height:\s*55vh !important/.test(css), 'style.css слага таван 55vh, за да остане долният ред над клавиатурата');

// --- 2. Телефон 390x844 с пръст -----------------------------------------------------------------
const mob = await newClient({ width: 390, height: 844, touch: true, mobile: true });
const { page } = mob;
const SHORT = { key: 'plan', id: '9301', gdid: 'KB1', raw: 'План за седмицата|понеделник: отчет' };
// Бележка с дълго тяло: проверява се таванът на височината, когато бележката е висока.
const TALL = {
    key: 'long', id: '9302', gdid: 'KB2',
    raw: Array.from({ length: 40 }, (_, i) => `Ред ${i + 1}: текст за проверка`).join('\n'),
};

await openNote(page, SHORT);
await settleOpen(page);
let s = await state(page);
ok(s.open && !s.kbClass, 'преди редакция бележката е на запомненото си място, без класа за клавиатура', s);
const parkedTop = s.top, parkedInline = s.inlineTop;

// Истински клик в тялото на бележката влиза в редакция (click-to-edit) и фокусът отива в полето.
await page.locator('.note-window.visible #modal-body').first().click();
await settle(page);
s = await state(page);
ok(s.hasTextarea, 'клик в бележката отваря редактора с поле за текст', s);
ok(s.active === 'note-edit-textarea', 'фокусът е в полето за текст', s);
ok(s.kbClass, 'фокусът в полето слага класа за мобилна клавиатура', s);
ok(s.top === 0, 'бележката застава на най-горния ръб на екрана (top = 0)', s);
ok(s.bottom <= Math.round(s.vh * 0.55) + 1, 'долният ръб на бележката е над 55% от екрана, тоест над клавиатурата', s);
ok(s.inlineTop === parkedInline, 'инлайн top на бележката не се пипа (запомненото място остава)', { before: parkedInline, now: s.inlineTop });
ok(s.left === 0 || s.left > 0, 'бележката остава в екрана по хоризонтала', s);

// --- 3. Бележка, разпъната от потребителя: таванът 55vh наистина реже височината --------------
// (Бележката се разпъва с дръжката за размер, която пише инлайн височина - тук се прави същото.)
await page.evaluate(() => { getOpenNoteWindows().forEach(w => w.el.querySelector('.modal-close')?.click()); });
await page.waitForFunction(() => !getOpenNoteWindows().length, null, { timeout: 5000 }).catch(() => { });
await openNote(page, TALL);
await settleOpen(page);
await page.evaluate(() => {
    const w = getOpenNoteWindows().find(x => x.el.classList.contains('visible'));
    w.box.style.height = '700px';
});
await settle(page);
const tallParked = await state(page);
ok(tallParked.open && tallParked.h > Math.round(844 * 0.55), 'разпънатата бележка преди редакция е по-висока от 55% от екрана', tallParked);
await page.locator('.note-window.visible #modal-body').first().click();
await settle(page);
s = await state(page);
ok(s.kbClass && s.top === 0, 'разпънатата бележка също застава на top = 0 при фокус', s);
ok(s.h <= Math.round(s.vh * 0.55) + 1, 'разпънатата бележка е съкратена до 55vh, за да се вижда и долният ѝ ред', s);
ok(s.h > 200, 'съкратената бележка остава достатъчно висока за писане', s);

// --- 4. Фокусът излиза (както при затваряне на клавиатурата) - бележката се връща --------------
await page.evaluate(() => document.querySelector('#note-edit-textarea').blur());
await settle(page);
s = await state(page);
ok(!s.kbClass, 'щом фокусът излезе, класът се маха', s);
ok(s.top === tallParked.top, 'бележката се връща на същото място, където е била', { before: tallParked.top, now: s.top });
ok(s.h === tallParked.h, 'бележката си връща цялата височина', { before: tallParked.h, now: s.h });

// --- 5. Полето за заглавие също вдига бележката (бележка със заглавие: текстът преди '|') -------
await page.evaluate(() => { getOpenNoteWindows().forEach(w => w.el.querySelector('.modal-close')?.click()); });
await page.waitForFunction(() => !getOpenNoteWindows().length, null, { timeout: 5000 }).catch(() => { });
await openNote(page, SHORT);
await settleOpen(page);
await page.locator('.note-window.visible #modal-body').first().click();
await settle(page);
s = await state(page);
ok(s.hasTitle, 'бележката със заглавие има и поле за заглавие в редактора', s);
if (s.hasTitle) {
    await page.evaluate(() => document.querySelector('#note-edit-title-textarea').blur());
    await settle(page);
    const beforeTitle = await state(page);
    await page.locator('#note-edit-title-textarea').first().click();
    await settle(page);
    s = await state(page);
    ok(s.kbClass && s.top === 0 && s.active === 'note-edit-title-textarea', 'фокусът в полето за заглавие също вдига бележката най-горе', s);
    ok(s.top <= beforeTitle.top || beforeTitle.top === 0, 'заглавието вдига бележката, а не я оставя по средата', { before: beforeTitle.top, now: s.top });
    await page.evaluate(() => document.querySelector('#note-edit-title-textarea').blur());
    await settle(page);
}

// --- 6. Широк екран: бележката не се мести -----------------------------------------------------
await page.setViewportSize({ width: 1280, height: 900 });
await settle(page);
await page.evaluate(() => document.querySelector('#note-edit-textarea').focus());
await settle(page);
const wide = await state(page);
ok(!wide.kbClass, 'на 1280px фокусът в полето не мести бележката', wide);
ok(wide.top > 0, 'на 1280px бележката остава на мястото си', wide);

// --- 7. 390px, но с мишка (pointer: fine): също не се мести ------------------------------------
const desk = await newClient({ width: 390, height: 844, touch: false, mobile: false });
await openNote(desk.page, SHORT);
await settleOpen(desk.page);
const fineBefore = await state(desk.page);
await desk.page.locator('.note-window.visible #modal-body').first().click();
await settle(desk.page);
const fine = await state(desk.page);
ok(fine.hasTextarea, 'при мишка редакторът също се отваря', fine);
ok(!fine.kbClass, 'при мишка (pointer: fine) фокусът в полето НЕ вдига бележката', fine);
ok(fine.top === fineBefore.top, 'при мишка бележката остава на мястото си', { before: fineBefore.top, now: fine.top });

// --- 8. Никакви грешки в конзолата --------------------------------------------------------------
ok(mob.errs.length === 0, 'няма грешки в конзолата на мобилния клиент', mob.errs.slice(0, 3));
ok(desk.errs.length === 0, 'няма грешки в конзолата на клиента с мишка', desk.errs.slice(0, 3));

console.log(`\n${fails ? 'FAILED' : 'ALL PASS'} — ${n - fails}/${n}`);
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
