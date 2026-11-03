// Заглавният ред на бележката в борда на MNV се образува като в uni.
//
// Повод (3 Nov 2026, собственикът): „пренеси образуването на заглавния ред на бележките в борда
// от uni в mnv". Досега MNV решаваше другояче какво да стои на реда:
//   - нямаше клон за дата на промяна (класът datemod-header-date съществуваше в style.css, но
//     никой не го слагаше), значи променена бележка показваше датата си на създаване;
//   - авто-таймерът на календара (00:00:33) се показваше като напомняне - бележка с календарна
//     дата изписваше датата на таймера и час „00:00" вместо своята дата;
//   - иконата на календара се виждаше и при бележка само с напомняне;
//   - часът беше винаги 24-часов, докато uni следва настройката на устройството (12/24).
//
// Какво проверява (истински Chromium, истинският MNV код, засята IndexedDB NotesDB):
//   1) обикновена бележка: дата и час от дата на промяна, клас datemod-header-date;
//   2) променена бележка: показва датата на промяна, не на създаване;
//   3) настройката „Покажи дата на промяна" изключена: текстът на датата и часа се скрива,
//      иконите остават (часовникът води до аналоговия часовник);
//   4) календарна дата: дата от calendarDate, икона на календара, без часовник;
//   5) напомняне: дата и час от timer, БЕЗ икона на календара;
//   6) авто-таймер 00:00:33 + календарна дата: календарната дата, без час;
//   7) авто-таймер без календарна дата: пада към дата на промяна, не показва „00:00";
//   8) часът следва устройството: en-US дава AM/PM, en-GB дава 24-часов вид;
//   9) няма изключения в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/mnv-note-header-row.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (контролата върху стария код пада).
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

const root = path.resolve(process.env.ROOT || 'MNV');
const PAGE = process.env.MNV_PAGE || 'index-2.html';
if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}
const DB_NAME = process.env.MNV_DB || 'NotesDB';
const SEED_PATH = '/__seed.html';
const W = Number(process.env.W || 1280), H = Number(process.env.H || 900);

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === SEED_PATH) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end('<!doctype html><html><head><meta charset="utf-8"><title>seed</title></head><body>seed</body></html>');
        return;
    }
    const rel = p === '/' ? PAGE : p.replace(/^\//, '');
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

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const errs = [];

// --- Всяка бележка: какво трябва да покаже заглавният ред -------------------------------------
// Фикстурите се засяват веднъж; часовете се смятат в страницата, за да е сигурно, че часът на
// бележката е същият, който тестът очаква (иначе проверката за 12/24 ч не доказва нищо).
const FIXTURES = [
    // gdid, какво слагаме, какво очакваме на реда
    { gdid: 'N1', note: {}, expect: { dateFrom: 'datemod', cls: 'datemod-header-date', hasTime: true, calIcon: false, clockIcon: true } },
    { gdid: 'N2', note: { datemod: 'RECENT' }, expect: { dateFrom: 'datemod', cls: 'datemod-header-date', hasTime: true, calIcon: false, clockIcon: true } },
    { gdid: 'N3', note: { calendarDate: 'CALDAY' }, expect: { dateFrom: 'calendarDate', cls: '', hasTime: false, calIcon: true, clockIcon: false } },
    { gdid: 'N4', note: { timer: 'TOMORROW' }, expect: { dateFrom: 'timer', cls: '', hasTime: true, calIcon: false, clockIcon: true } },
    { gdid: 'N5', note: { calendarDate: 'CALDAY', timer: 'AUTOTIMER' }, expect: { dateFrom: 'calendarDate', cls: '', hasTime: false, calIcon: true, clockIcon: false } },
    { gdid: 'N6', note: { datemod: 'RECENT', timer: 'AUTOTIMER' }, expect: { dateFrom: 'datemod', cls: 'datemod-header-date', hasTime: true, calIcon: false, clockIcon: true } },
    { gdid: 'N7', note: { calendarDate: 'CALDAY', timer: 'TOMORROW' }, expect: { dateFrom: 'timer', cls: '', hasTime: true, calIcon: true, clockIcon: true } }
];

// Разчита какво стои на реда на картата: текстовете, класовете и кои икони се виждат.
const readRow = async (page) => page.evaluate((gdids) => {
    const out = {};
    gdids.forEach(gdid => {
        const card = document.querySelector(`#notes-container .note[data-g="${gdid}"]`);
        if (!card) { out[gdid] = { card: false }; return; }
        const el = (sel) => card.querySelector(sel);
        const vis = (sel) => {
            const e = el(sel);
            if (!e) return null;
            const cs = getComputedStyle(e);
            return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01;
        };
        const dateTextEl = el('.note-header-date-text');
        const timeTextEl = el('.note-header-time-text');
        out[gdid] = {
            card: true,
            ds: { cd: card.dataset.cd || '', dm: card.dataset.dm || '', cda: card.dataset.cda || '' },
            date: dateTextEl ? (dateTextEl.textContent || '').trim() : null,
            dateCls: dateTextEl ? dateTextEl.className : null,
            dateVisible: vis('.note-header-date-text'),
            time: timeTextEl ? (timeTextEl.textContent || '').trim() : null,
            timeVisible: vis('.note-header-time-text'),
            calIconVisible: vis('.note-header-calendar-icon'),
            clockIconVisible: vis('.note-header-clock-icon'),
            pinVisible: vis('.note-pin-btn')
        };
    });
    out.__notes = {};
    (typeof allNotesData !== 'undefined' ? allNotesData : []).forEach(nt => {
        out.__notes[nt.gdid] = { date: Number(nt.date || 0), datemod: Number(nt.datemod || 0), calendarDate: Number(nt.calendarDate || 0), timer: Number(nt.timer || 0) };
    });
    return out;
}, FIXTURES.map(f => f.gdid));

const openApp = async (ctx) => {
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
    await page.addInitScript(() => {
        const oauth2 = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
        window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
        window.gapi = { client: { setToken() { }, getToken() { return { access_token: 'test-token' }; }, drive: { files: { list: async () => ({ result: { files: [] } }) } } }, load() { } };
        const realFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
            const url = typeof input === 'string' ? input : (input && input.url) || '';
            if (url.includes('googleapis.com')) return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }));
            return realFetch(input, init);
        };
        window.kofiWidgetOverlay = { draw() { } };
        window.kofiwidget2 = { init() { }, draw() { } };
        localStorage.setItem('useIndexedDb', 'true');
        localStorage.setItem('useGoogleDb', 'false');
        localStorage.setItem('useLocalDb', 'false');
        localStorage.setItem('useLocalFolder', 'false');
        localStorage.setItem('useArhDb', 'false');
        localStorage.setItem('updateFromSource', 'false');
        localStorage.setItem('lang', 'bg');
        localStorage.setItem('language', 'bg');
        localStorage.setItem('hideAssistant', 'true');
        localStorage.setItem('guide', 'false');
        localStorage.setItem('showBoardAll', 'false');
        localStorage.setItem('startBoard', 'b1');
    });

    // --- Засяване на базата преди старта -----------------------------------------------------
    await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
    const seed = await page.evaluate(async ({ dbName, fixtures }) => {
        const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null };
        const out = {};
        try {
            await new Promise((res) => { const d = indexedDB.deleteDatabase(dbName); d.onsuccess = d.onerror = d.onblocked = () => res(); setTimeout(res, 3000); });
            const db = await new Promise((res, rej) => {
                const req = indexedDB.open(dbName, 4);
                req.onupgradeneeded = () => {
                    const d = req.result;
                    for (const [name, opt] of Object.entries(STORES)) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, opt || undefined);
                };
                req.onsuccess = () => res(req.result);
                req.onerror = () => rej(req.error);
            });
            const now = Date.now();
            const created = now - 5 * 86400000;          // дата на създаване: преди пет дни
            const recent = now - 60 * 1000;              // дата на промяна: преди минута
            const calDay = (() => { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(14, 45, 0, 0); return d.getTime(); })();
            const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(9, 30, 0, 0); return d.getTime(); })();
            const autotimer = (() => { const d = new Date(); d.setDate(d.getDate() + 2); d.setHours(0, 0, 33, 0); return d.getTime(); })();
            const stamp = { RECENT: recent, CALDAY: calDay, TOMORROW: tomorrow, AUTOTIMER: autotimer };
            out.stamps = { created, recent, calDay, tomorrow, autotimer };
            const notes = fixtures.map((f, i) => {
                const extra = {};
                for (const [k, v] of Object.entries(f.note)) extra[k] = typeof v === 'string' && stamp[v] ? stamp[v] : v;
                return Object.assign({
                    alarm_type: -1, boardid: 'b1', calendarDate: 0, color: 0,
                    date: created, datemod: created, eventId: 0, gdid: f.gdid, id: 1001 + i,
                    notetxt: 'Заглавие ' + f.gdid + '|текст', numord: i + 1, pass: false, sellist: 0,
                    status: 0, type: 1, text_span: '', timer: 0, timer_type: -1, timer_val: 1,
                    title_span: '', version: 243
                }, extra);
            });
            await new Promise((res, rej) => {
                const tx = db.transaction(['boards', 'notes', 'media', 'config'], 'readwrite');
                tx.oncomplete = res; tx.onerror = () => rej(tx.error);
                tx.objectStore('boards').clear(); tx.objectStore('notes').clear();
                tx.objectStore('media').clear(); tx.objectStore('config').clear();
                tx.objectStore('boards').put({ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b1', id: 1, numord: 1, status: 0, title: 'Работа' });
                notes.forEach(nt => tx.objectStore('notes').put(nt));
                tx.objectStore('config').put(1, 'dbSource');
                tx.objectStore('config').put('gdid', 'dbNoteIdType');
                tx.objectStore('config').put(now, 'dbCreatedTimestamp');
                tx.objectStore('config').put(now, 'lastLocalTimestamp');
            });
            db.close();
            out.ok = notes.length;
        } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
        return out;
    }, { dbName: DB_NAME, fixtures: FIXTURES });

    ok(!seed.err && seed.ok === FIXTURES.length, 'базата е засята: борд и седем бележки с различни дати', seed.err || seed.ok);

    await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
    const booted = await page.waitForFunction(() => typeof createNoteElement === 'function' && typeof startApp === 'function', null, { timeout: 30000 })
        .then(() => true, () => false);
    ok(booted, 'страницата на приложението се зареди');
    if (!booted) return { page, seed };

    const boot = await page.evaluate(async () => {
        const info = { err: '' };
        isOfflineMode = true;
        try { if (typeof updateGlobalStateFlags === 'function') updateGlobalStateFlags(); } catch (e) { }
        try { await startApp(); } catch (e) { info.err = String((e && e.message) || e).slice(0, 300); }
        ['login-page', 'request-access-modal', 'folderIdPromptPopup'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        document.querySelectorAll('.guide-container, .speech-bubble, .guide-img').forEach(el => el.remove());
        info.cards = document.querySelectorAll('#notes-container .note').length;
        return info;
    });
    ok(!boot.err && boot.cards === FIXTURES.length, 'приложението стартира и нарисува картите', boot);
    return { page, seed };
};

// --- Част 1: какво показва редът при всяка бележка --------------------------------------------
const ctx = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block', locale: 'en-US' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const { page, seed } = await openApp(ctx);
const stamps = seed.stamps || {};
const fmtDate = (ts) => { const d = new Date(ts); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
const stampValue = (key) => ({ created: stamps.created, recent: stamps.recent, calDay: stamps.calDay, tomorrow: stamps.tomorrow, autotimer: stamps.autotimer })[key];

let row = await readRow(page);
const notesData = row.__notes || {};
const dsValue = (gdid, from) => (notesData[gdid] || {})[from] || 0;
for (const f of FIXTURES) {
    const got = row[f.gdid] || {};
    const want = f.expect;
    ok(got.card === true, `${f.gdid}: картата е на борда`, got);
    if (!got.card) continue;
    const wantDate = fmtDate(Number(dsValue(f.gdid, want.dateFrom)));
    ok(got.date === wantDate, `${f.gdid}: датата идва от ${want.dateFrom} (${wantDate})`, { got: got.date });
    ok(got.dateVisible === true, `${f.gdid}: датата се вижда`, got.dateVisible);
    ok(!want.cls || String(got.dateCls || '').includes(want.cls),
        `${f.gdid}: класът на датата${want.cls ? ' е ' + want.cls : ' не е datemod-header-date'}`, got.dateCls);
    ok(!String(got.dateCls || '').includes('creation-header-date') || want.dateFrom === 'date',
        `${f.gdid}: датата не е обявена за дата на създаване`, got.dateCls);
    if (want.hasTime) {
        ok(!!got.time && /\d/.test(got.time) && got.timeVisible === true, `${f.gdid}: часът се вижда`, got.time);
        ok(!/^0?0(:00|:0)?$/.test(got.time), `${f.gdid}: часът не е „00:00"`, got.time);
    } else {
        ok(!got.time, `${f.gdid}: часът липсва`, got.time);
    }
    ok(got.calIconVisible === want.calIcon, `${f.gdid}: иконата на календара ${want.calIcon ? 'се вижда' : 'я няма'}`, got.calIconVisible);
    ok(got.clockIconVisible === want.clockIcon, `${f.gdid}: иконата на часовника ${want.clockIcon ? 'се вижда' : 'я няма'}`, got.clockIconVisible);
    ok(got.pinVisible === true, `${f.gdid}: пин-бутонът е на реда`, got.pinVisible);
}

// --- Част 2: настройката „Покажи дата на промяна" скрива текста, не иконите -------------------
await page.evaluate(() => { document.body.classList.add('hide-datemod'); });
let hidden = await readRow(page);
ok(hidden['N1'].dateVisible === false, 'при изключена дата на промяна текстът на датата се скрива', hidden['N1']);
ok(hidden['N1'].timeVisible === false, 'при изключена дата на промяна текстът на часа се скрива', hidden['N1']);
ok(hidden['N1'].clockIconVisible === true, 'часовникът остава достъпен при изключена дата на промяна', hidden['N1']);
ok(row['N4'].calIconVisible === false, 'иконата на календара не излиза при бележка само с напомняне', row['N4']);
await page.evaluate(() => { document.body.classList.remove('hide-datemod'); });
let back = await readRow(page);
ok(back['N1'].dateVisible === true, 'след връщане на настройката текстът се вижда отново', back['N1']);

// --- Част 3: часът следва устройството (12 ч при en-US, 24 ч при en-GB) ----------------------
ok(/AM|PM/i.test(row['N1'].time || ''), 'при en-US часът е 12-часов (AM/PM)', row['N1'].time);

const ctx24 = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block', locale: 'en-GB' });
await ctx24.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const app24 = await openApp(ctx24);
const row24 = await readRow(app24.page);
ok(!/AM|PM/i.test(row24['N1'].time || ''), 'при en-GB часът е 24-часов', row24['N1'].time);
ok(/^2[01]|^\d{1,2}:\d{2}$/.test(row24['N1'].time || ''), 'при en-GB часът е във вид „23:45"', row24['N1'].time);

ok(errs.length === 0, 'няма изключения в конзолата', errs.slice(0, 3));

await browser.close();
srv.close();
console.log(fails ? `FAILED (${fails} от ${n})` : `ALL OK (${n} проверки)`);
process.exit(fails ? 1 : 0);
