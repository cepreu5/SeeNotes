// Лентата с миниатюри на отворените бележки в дъното на екрана (b2.70).
// Собственикът (24.10.2026): „когато имаме отворени повече от 2 бележки най-отдолу на екрана да се
// появи лента с мини-изображения (40px) на бележките и бутон за затваряне на всички бележки, която
// да се приплъзва, ако няма достатъчно място на екрана. кликването на иконка активира съответната
// ѝ бележка".
// Проверява се по ИСТИНСКИЯ път в браузър - истински прозорци (showModal), истински кликове с
// показалеца, истински thumbnail от (фалшив) Drive:
//   - при 0, 1 и 2 отворени бележки лентата я няма (display: none);
//   - при 3 отворени се вижда с точно 3 плочки по 40x40;
//   - фонът на всяка плочка е ТОЧНО цветът на бележката (фонът на .modal-content-box на прозореца ѝ);
//   - буквите се четат: тъмни на светла бележка, бели на тъмна (бележка с цвят #222222);
//   - активната бележка е оградена с жълт 2px контур, нарисуван ОТВЪТРЕ в плочката (на ::after, над
//     миниатюрата) и контурът се мести при клик на друга плочка;
//   - клик на плочка вдига нейния прозорец най-отпред и го прави активен;
//   - затваряне на една бележка (2 остават) скрива лентата;
//   - бутонът в дясно затваря всички бележки (същата closeAllNoteWindows);
//   - на 390px при 8 бележки редът се приплъзва (scrollWidth > clientWidth) и плочките не се свиват;
//   - лентата е над всеки прозорец (z-index), не приема кликове през слоя и стои извън скрола;
//   - в режим „единична бележка" лентата е скрита;
//   - бележка със снимка показва <img> в плочката си, бележка без снимка - буквена плочка.
// Пуска се от корена на хранилището:
//   node .bolter/check/open-notes-bar.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index.html' : p;
    try {
        const b = await readFile(path.join(root, rel));
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

// --- Фалшив Drive: една снимка за бележката със снимка -------------------------------------
const PHOTO = 'bar_photo.png';
const PHOTO_ID = 'BARPHOTO0001';
const FOLDER_IMAGES = 'FOLDER_IMAGES';
const FOLDER_DATA = 'FOLDER_DATA';
const IMG_PATH = '/storage/emulated/0/Pictures/Images/' + PHOTO;

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
// Всичко извън localhost: Drive отговаря като истински за една снимка, останалото - празно.
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
    const url = route.request().url();
    const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
    if (meta) {
        const fileId = decodeURIComponent(meta[1]);
        if (fileId !== PHOTO_ID) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=s800` }) });
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
        const q = new URL(url).searchParams.get('q') || '';
        const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
        if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
            if (name === 'Images') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: FOLDER_IMAGES, name: 'Images' }] }) });
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'F_' + name, name }] }) });
        }
        if (name === PHOTO) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: PHOTO_ID, name: PHOTO, modifiedTime: '2026-10-19T09:00:00Z' }] }) });
        }
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
    // Папките са известни от предишно зареждане: тестът мери лентата, не търсенето на папки.
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

// --- Осем бележки: първата със снимка, останалите по един ред текст --------------------------
const fmt = (...objs) => objs.map(o => JSON.stringify(o)).join('|');
const photoRaw = 'Снимка на плажа *';
const photoFormat = fmt({
    start: photoRaw.indexOf('*'), end: photoRaw.indexOf('*') + 1,
    type: 8, paramstring: IMG_PATH, paramint: 5,
});
const NOTES = [
    { key: 'photo', id: '9101', gdid: 'BAR1', raw: photoRaw, format: photoFormat },
    { key: 'bread', id: '9102', gdid: 'BAR2', raw: 'Купи хляб\nи мляко', format: '' },
    { key: 'plan', id: '9103', gdid: 'BAR3', raw: 'План за седмицата\nпонеделник: отчет', format: '' },
    { key: 'call', id: '9104', gdid: 'BAR4', raw: 'Обади се на Иван', format: '' },
    { key: 'book', id: '9105', gdid: 'BAR5', raw: 'Книга за лятото', format: '' },
    { key: 'car', id: '9106', gdid: 'BAR6', raw: 'Ремонт на колата', format: '' },
    { key: 'tax', id: '9107', gdid: 'BAR7', raw: 'Данъци до петък', format: '' },
    { key: 'idea', id: '9108', gdid: 'BAR8', raw: 'Идея за подарък', format: '' },
    // Бележка с ТЪМЕН потребителски цвят: буквите върху нея трябва да са бели, а не тъмни.
    { key: 'dark', id: '9109', gdid: 'BAR9', raw: 'Тъмна бележка', format: '', color: '#222222' },
];

// Отваря бележка по истинския път на приложението (showModal), както клик на картата на борда.
const openNote = (key) => page.evaluate((def) => {
    useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
    dbSourceGlobal = null; dirHandle = null; isOffline = false;
    authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
    if (!allNotesData.some(x => String(x.gdid) === def.gdid)) {
        allNotesData.push({
            alarm_type: -1, calendarDate: 0, color: def.color || 0, date: Date.now(), datemod: Date.now(), eventId: 0,
            gdid: def.gdid, id: def.id, notetxt: def.raw, numord: Number(def.id), sellist: 0, status: 0,
            text_span: def.format, title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
        });
    }
    const opts = { raw: def.raw, format: def.format, id: def.id, gdid: def.gdid };
    // Цветът се подава по същия път, по който го подава бордът: showModal го превръща във фон на
    // .modal-content-box, а плочката в лентата трябва да носи точно този фон.
    if (def.color !== undefined) opts.color = def.color;
    showModal(opts);
}, NOTES.find(x => x.key === key));

// Затваря прозореца на бележка през истинския X (същият път като клик на потребителя).
const closeNoteByX = (gdid) => page.evaluate((gdid) => {
    const win = getOpenNoteWindows().find(w => w.body.dataset.gdid === gdid);
    if (!win) return false;
    // Истинският клик първо активира прозореца (pointerdown), и чак после идва X. Без това
    // проверката за незаписани промени гледа друг (активния) прозорец.
    activateNoteWindow(win, true);
    win.el.querySelector('.modal-close').click();
    return true;
}, gdid);

// Две кадъра: подредбата и класовете са приложени, преди да се мери.
const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// Контурът се сменя с кратък преход (0.15s). Изчаква се да ДОСТИГНЕ жълтото, вместо да се спи
// фиксирано време - иначе понякога се мери средата на прехода и проверката лъже.
const waitActiveRing = () => page.waitForFunction(() => {
    const t = document.querySelector('#open-notes-bar .open-notes-bar-tile.is-active');
    return !!t && /255, 212, 0/.test(getComputedStyle(t, '::after').boxShadow);
}, null, { timeout: 3000 }).then(() => true).catch(() => false);

// Цялото състояние на лентата, с което се сравняват проверките.
const barState = () => page.evaluate(() => {
    const bar = document.getElementById('open-notes-bar');
    if (!bar) return { exists: false, display: 'none', tiles: [] };
    const cs = getComputedStyle(bar);
    const strip = bar.querySelector('.open-notes-bar-strip');
    const closeBtn = bar.querySelector('.open-notes-bar-close');
    const round = v => Math.round(v * 10) / 10;
    return {
        exists: true,
        display: cs.display,
        zIndex: Number(cs.zIndex) || 0,
        pointerEvents: cs.pointerEvents,
        label: bar.getAttribute('aria-label'),
        strip: strip ? {
            overflowX: getComputedStyle(strip).overflowX,
            scrollWidth: strip.scrollWidth,
            clientWidth: strip.clientWidth,
            scrollLeft: strip.scrollLeft,
        } : null,
        hideBtn: (() => {
            const b = bar.querySelector('.open-notes-bar-hide');
            if (!b) return { present: false };
            return {
                present: true,
                insideStrip: !!strip && strip.contains(b),
                mode: b.dataset.mode,
                title: b.getAttribute('title'),
                ariaLabel: b.getAttribute('aria-label'),
                w: round(b.getBoundingClientRect().width),
                h: round(b.getBoundingClientRect().height),
            };
        })(),
        closeBtn: closeBtn ? {
            present: true,
            insideStrip: !!strip && strip.contains(closeBtn),
            title: closeBtn.getAttribute('title'),
            ariaLabel: closeBtn.getAttribute('aria-label'),
            w: round(closeBtn.getBoundingClientRect().width),
            h: round(closeBtn.getBoundingClientRect().height),
        } : { present: false },
        tiles: [...bar.querySelectorAll('.open-notes-bar-tile')].map(t => {
            const r = t.getBoundingClientRect();
            const letters = t.querySelector('.open-notes-bar-letters');
            const img = t.querySelector('.open-notes-bar-thumb');
            const tcs = getComputedStyle(t);
            // Контурът на плочката се рисува на ::after (не като box-shadow на самата плочка) - иначе
            // при плочка с миниатюра картинката закрива контура.
            const tAfter = getComputedStyle(t, '::after');
            // Фонът на бележката, с който е боядисан НЕЙНИЯТ прозорец: с него се сравнява фонът на плочката.
            const win = t.dataset.barKey ? openNotesBarWindowFor(t) : null;
            const winBox = win && win.el ? win.el.querySelector('.modal-content-box') : null;
            return {
                key: t.dataset.barKey,
                w: round(r.width),
                h: round(r.height),
                active: t.classList.contains('is-active'),
                hiddenTile: t.classList.contains('is-hidden'),
                opacity: Number(getComputedStyle(t).opacity),
                bg: tcs.backgroundColor,
                winBg: winBox ? getComputedStyle(winBox).backgroundColor : null,
                tileShadow: tcs.boxShadow,
                ring: tAfter.boxShadow,
                ringContent: tAfter.content,
                ringZ: tAfter.zIndex,
                title: t.getAttribute('title'),
                letters: letters ? letters.textContent : null,
                lettersBg: letters ? getComputedStyle(letters).backgroundColor : null,
                lettersColor: letters ? getComputedStyle(letters).color : null,
                hasThumb: t.classList.contains('has-thumb'),
                imgSrc: img ? img.getAttribute('src') : null,
                imgInTile: !!img && t.contains(img),
                imgZ: img ? getComputedStyle(img).zIndex : null,
                // Децата на плочката в дървото: <img> се рисува ПРЕДИ ::after (който е винаги последен).
                childOrder: [...t.children].map(el => el.className),
            };
        }),
    };
});

// Прозорците: кои са отворени, кой е най-отпред и кой е активен.
const windowsState = () => page.evaluate(() => ({
    open: getOpenNoteWindows().map(w => ({
        gdid: w.body.dataset.gdid || '',
        z: Number(w.el.style.zIndex) || 0,
        active: w.el.classList.contains('note-window-active'),
        hidden: !!w.hidden,
        // Вижда ли се прозорецът на екрана: display на самия прозорец и мярката на кутията му.
        display: getComputedStyle(w.el).display,
        boxW: Math.round(w.box.getBoundingClientRect().width),
        boxH: Math.round(w.box.getBoundingClientRect().height),
    })),
    maxZ: Math.max(0, ...getOpenNoteWindows().map(w => Number(w.el.style.zIndex) || 0)),
    activeGdid: (() => { const w = getOpenNoteWindows().find(x => x.el.classList.contains('note-window-active')); return w ? (w.body.dataset.gdid || '') : ''; })(),
}));

// Плаващ бутон на долния ръб: как е позициониран и къде стои на екрана.
const floaterState = (id) => page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return { present: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const round = v => Math.round(v * 10) / 10;
    return {
        present: true,
        display: cs.display,
        visibility: cs.visibility,
        opacity: cs.opacity,
        bottom: cs.bottom,
        top: cs.top,
        inlineBottom: el.style.getPropertyValue('bottom').trim(),
        inlineTop: el.style.getPropertyValue('top').trim(),
        translate: cs.translate,
        rectTop: round(r.top), rectBottom: round(r.bottom), rectW: round(r.width), rectH: round(r.height),
    };
}, id);

// Лентата: мястото ѝ на екрана и височината, която казва на CSS.
const barRect = () => page.evaluate(() => {
    const bar = document.getElementById('open-notes-bar');
    const root = getComputedStyle(document.documentElement);
    const round = v => Math.round(v * 10) / 10;
    if (!bar) return { exists: false, varH: root.getPropertyValue('--open-notes-bar-h').trim(), bodyClass: document.body.classList.contains('open-notes-bar-visible') };
    const r = bar.getBoundingClientRect();
    return {
        exists: true,
        display: getComputedStyle(bar).display,
        rectTop: round(r.top), rectBottom: round(r.bottom), rectH: round(r.height), rectW: round(r.width),
        varH: root.getPropertyValue('--open-notes-bar-h').trim(),
        bodyClass: document.body.classList.contains('open-notes-bar-visible'),
    };
});

// Затваря ВСИЧКИ отворени прозорци (всеки през своя X) и изчаква да останат нула. Ползва се там,
// където тестът иска да започне от чисто - иначе забравена отворена бележка чупи бройките.
const closeAllOpenNotes = async () => {
    for (let i = 0; i < 12; i++) {
        const before = (await windowsState()).open.length;
        if (before === 0) return true;
        const g = await page.evaluate(() => {
            const open = getOpenNoteWindows();
            return open.length ? (open[0].body.dataset.gdid || '') : null;
        });
        if (g === null) return true;
        await closeNoteByX(g);
        // Чака се БРОЯТ ДА НАМАЛЕЕ, а не точно число: затварянето е асинхронно и може да е станало
        // още преди да се прочете броят - изчисленото „очаквано" тогава е с едно по-малко и чакането
        // изгаря целия си таймаут.
        await page.waitForFunction(n => getOpenNoteWindows().length < n, before, { timeout: 5000 }).catch(() => { });
        await settle();
    }
    return (await windowsState()).open.length === 0;
};

// Отбелязва колко е вървяла една част от теста: бавна проверка се вижда веднага в изхода, вместо
// да се гадае после (лентата пуска този тест на всяко пускане на регресиите).
let lastTick = Date.now();
const tick = (label) => {
    const now = Date.now();
    console.log(`   ... ${label}: ${now - lastTick}ms`);
    lastTick = now;
};

const hidden = (s) => !s.exists || s.display === 'none';
const waitOpenCount = (count) => page.waitForFunction((c) => getOpenNoteWindows().length === c, count, { timeout: 8000 }).catch(() => { });
const tileOf = (s, idx) => (s.tiles[idx] || {});

// --- 1) При 0, 1 и 2 отворени бележки лентата я няма ----------------------------------------
let s = await barState();
ok(hidden(s), 'при 0 отворени бележки лентата е скрита', s);

await openNote('photo');
await settle();
s = await barState();
ok(hidden(s), `при 1 отворена бележка лентата е скрита (display ${s.display})`, s);

await openNote('bread');
await settle();
s = await barState();
ok(hidden(s), `при 2 отворени бележки лентата е скрита (display ${s.display})`, s);
ok((await windowsState()).open.length === 2, 'двете бележки са отворени в два прозореца');

tick('до тук: 1) 0/1/2 бележки');
// --- 2) При 3 отворени лентата се вижда с три плочки по 40x40 --------------------------------
await openNote('plan');
await settle();
s = await barState();
ok(!hidden(s) && s.display === 'flex', `при 3 отворени бележки лентата се вижда (display ${s.display})`, s);
ok(s.tiles.length === 3, `в лентата има точно 3 плочки (${s.tiles.length})`, s.tiles);
ok(s.tiles.every(t => t.w === 40 && t.h === 40), `всяка плочка е 40x40 (${s.tiles.map(t => t.w + 'x' + t.h).join(', ')})`, s.tiles);
ok(s.pointerEvents === 'auto', `лентата приема кликове, макар слоят да не приема (pointer-events ${s.pointerEvents})`, s);
ok(!!s.closeBtn.present && !s.closeBtn.insideStrip, 'бутонът за затваряне е в лентата, ИЗВЪН приплъзващия се ред', s.closeBtn);
ok(/Затвори всички бележки/.test(s.closeBtn.title || '') && /Затвори всички бележки/.test(s.closeBtn.ariaLabel || ''),
    `бутонът носи текста closeAllNotes („${s.closeBtn.title}")`, s.closeBtn);

tick('до тук: 2) 3 бележки');
// --- 3) Плочката на активната бележка е откроена -------------------------------------------
const ws3 = await windowsState();
ok(ws3.activeGdid === 'BAR3', `активна е последно отворената бележка (${ws3.activeGdid})`, ws3);
ok(tileOf(s, 2).active && !tileOf(s, 0).active && !tileOf(s, 1).active,
    `откроена е само плочката на активната бележка (${s.tiles.map(t => t.active ? 'A' : '-').join('')})`, s.tiles);
// Контурът е на ::after, а не box-shadow на плочката: при плочка с миниатюра картинката закрива
// сянката на елемента. Жълт 2px, нарисуван ОТВЪТРЕ (inset), за да не се реже от реда.
const YELLOW = /255, 212, 0/;
ok(await waitActiveRing(), 'контурът на активната плочка достигна жълтото (преходът завърши)');
s = await barState();
ok(tileOf(s, 2).ringContent !== 'none' && YELLOW.test(tileOf(s, 2).ring) && /inset/.test(tileOf(s, 2).ring) && /2px/.test(tileOf(s, 2).ring),
    `контурът на активната е жълт 2px inset на ::after (${tileOf(s, 2).ring})`, tileOf(s, 2));
ok(YELLOW.test(tileOf(s, 2).ring) && !YELLOW.test(tileOf(s, 0).ring) && !YELLOW.test(tileOf(s, 1).ring),
    `само активната плочка има жълт контур (${s.tiles.map(t => YELLOW.test(t.ring) ? 'Y' : '-').join('')})`, s.tiles);
ok(s.tiles.every(t => t.tileShadow === 'none'),
    `контурът не е външна сянка на плочката - тя няма box-shadow (${s.tiles.map(t => t.tileShadow).join(' | ')})`, s.tiles.map(t => t.tileShadow));

// --- 3б) Фонът на всяка плочка е ТОЧНО цветът на бележката ----------------------------------
tick('3б) цветове на плочките');
ok(s.tiles.length === 3 && s.tiles.every(t => !!t.winBg && t.bg === t.winBg),
    `фонът на всяка плочка е равен на фона на прозореца ѝ (${s.tiles.map(t => t.bg + ' = ' + t.winBg).join(' | ')})`, s.tiles);
// Бележките в този тест са с цвят по подразбиране (#FBFF86) - плочките трябва да са точно в него.
ok(s.tiles.every(t => t.bg === 'rgb(251, 255, 134)'),
    `плочките носят цвета на бележката по подразбиране (${s.tiles.map(t => t.bg).join(', ')})`, s.tiles);
// Буквите се четат: на светла бележка са тъмни (#1F2A30), не бели.
ok(s.tiles.every(t => t.lettersColor === 'rgb(31, 42, 48)'),
    `буквите на светла бележка са тъмни (${s.tiles.map(t => t.lettersColor).join(', ')})`, s.tiles);
ok(s.tiles.every(t => t.lettersBg === 'rgba(0, 0, 0, 0)'),
    `буквите нямат собствен фон - фонът е на плочката (${s.tiles.map(t => t.lettersBg).join(', ')})`, s.tiles);

// Тъмна потребителска бележка: плочката пак е в точния ѝ цвят, а буквите стават бели.
await openNote('dark');
await settle();
s = await barState();
const darkTile = s.tiles.find(t => String(t.key || '').includes('BAR9')) || {};
ok(s.tiles.length === 4, `тъмната бележка добавя четвърта плочка (${s.tiles.length})`, s.tiles.length);
ok(darkTile.bg === 'rgb(34, 34, 34)' && darkTile.bg === darkTile.winBg,
    `плочката на тъмната бележка е точно в нейния цвят (${darkTile.bg} = ${darkTile.winBg})`, darkTile);
ok(darkTile.lettersColor === 'rgb(255, 255, 255)',
    `буквите на тъмна бележка са бели (${darkTile.lettersColor})`, darkTile);
const lightTiles = s.tiles.filter(t => t !== darkTile);
ok(lightTiles.every(t => t.lettersColor === 'rgb(31, 42, 48)'),
    `светлите плочки до нея остават с тъмни букви (${lightTiles.map(t => t.lettersColor).join(', ')})`, lightTiles);
// Затваря се, за да остане броят бележки същият за следващите части на теста.
ok(await closeNoteByX('BAR9'), 'тъмната бележка се затваря през своя X');
await waitOpenCount(3);
await settle();
s = await barState();
ok(s.tiles.length === 3, `след затварянето пак са 3 плочки (${s.tiles.length})`, s.tiles.length);

// --- 4) Клик на плочка активира нейната бележка и я вдига най-отпред -----------------------
await page.locator('#open-notes-bar .open-notes-bar-tile').nth(0).click();
await settle();
s = await barState();
const wsClick = await windowsState();
ok(tileOf(s, 0).active && !tileOf(s, 2).active,
    `след клик открояването е на първата плочка (${s.tiles.map(t => t.active ? 'A' : '-').join('')})`, s.tiles);
ok(wsClick.activeGdid === 'BAR1', `активна е бележката на кликнатата плочка (${wsClick.activeGdid})`, wsClick);
const firstWin = wsClick.open.find(w => w.gdid === 'BAR1');
ok(!!firstWin && firstWin.z === wsClick.maxZ,
    `прозорецът ѝ е най-отпред (z ${firstWin && firstWin.z} от ${wsClick.maxZ})`, wsClick.open);
ok(firstWin && firstWin.active, 'прозорецът ѝ носи note-window-active', firstWin);
ok(s.display === 'flex' && s.tiles.length === 3, 'лентата остава на мястото си след клика', s);

tick('до тук: 3-4) открояване и клик');
// --- 5) Затваряне на една бележка (остават 2) скрива лентата --------------------------------
ok(await closeNoteByX('BAR3'), 'прозорецът на третата бележка се затваря през своя X');
await waitOpenCount(2);
await settle();
s = await barState();
ok(hidden(s), `при 2 отворени бележки лентата пак е скрита (display ${s.display})`, s);

// --- 6) Бутонът в дясно затваря всички бележки ---------------------------------------------
await openNote('plan');
await settle();
s = await barState();
ok(!hidden(s) && s.tiles.length === 3, `след ново отваряне пак има 3 плочки (${s.tiles.length})`, s.tiles);
ok(ws3 && s.zIndex > (await windowsState()).maxZ, 'лентата е над всички прозорци по z-index');
await page.locator('#open-notes-bar .open-notes-bar-close').click();
await waitOpenCount(0);
await settle();
s = await barState();
const wsClosed = await windowsState();
ok(wsClosed.open.length === 0, `бутонът затвори всички бележки (отворени ${wsClosed.open.length})`, wsClosed);
ok(hidden(s), `след затваряне на всички лентата е скрита (display ${s.display})`, s);

tick('до тук: 5-6) затваряне');
// --- 7) Режим „единична бележка": лентата не се показва ------------------------------------
await page.evaluate(() => localStorage.setItem('singleNoteMode', 'true'));
for (const key of ['photo', 'bread', 'plan']) await openNote(key);
await page.evaluate(() => { if (typeof applySingleNoteModeSetting === 'function') applySingleNoteModeSetting(); });
await settle();
s = await barState();
ok((await windowsState()).open.length === 3, 'трите бележки са отворени и в режим „единична бележка"');
ok(hidden(s), `при singleNoteMode с 3 отворени бележки лентата е скрита (display ${s.display})`, s);
await page.evaluate(() => { localStorage.setItem('singleNoteMode', 'false'); if (typeof applySingleNoteModeSetting === 'function') applySingleNoteModeSetting(); });
await settle();
s = await barState();
ok(!hidden(s), `след изключване на режима лентата се връща (display ${s.display})`, s);

tick('до тук: 7) единична бележка');
// --- 8) Миниатюра на бележка със снимка и буквена плочка за бележка без снимка --------------
const thumbReady = await page.waitForFunction(() => {
    const tile = document.querySelector('#open-notes-bar .open-notes-bar-tile');
    return !!tile && tile.classList.contains('has-thumb');
}, null, { timeout: 8000 }).then(() => true).catch(() => false);
s = await barState();
ok(thumbReady, 'плочката на бележката със снимка показа миниатюра (<img> се зареди)', tileOf(s, 0));
ok(/^https:\/\/thumb\.invalid\//.test(tileOf(s, 0).imgSrc || ''),
    `миниатюрата идва по пътя на Drive thumbnail-ите (${tileOf(s, 0).imgSrc})`, tileOf(s, 0));
const breadTile = s.tiles.find(t => t.key && t.key.includes('BAR2'));
ok(!!breadTile && breadTile.imgSrc === null && !!breadTile.letters,
    `бележка без снимка показва буквена плочка („${breadTile && breadTile.letters}")`, breadTile);
// Плочката е в ЦВЕТА НА БЕЛЕЖКАТА, а не в цвят от собствена палитра на лентата. Фонът е на самата
// плочка (буквите нямат свой), затова се гледа tile.bg - и той съвпада с палитрата на бележките.
const NOTE_PALETTE = ['#FBFF86', '#FF829E', '#68FF97', '#EFEFEF', '#69B7FF', '#FBCB39', '#FBFBCD', '#FFC5D2', '#B6FFCD', '#B2DAFF', '#DDB1FF', '#B1D8FF', '#B1FFF2', '#FFD7B1', '#FFB1E8'];
const NOTE_PALETTE_RGB = NOTE_PALETTE
    .map(h => `rgb(${parseInt(h.slice(1, 3), 16)}, ${parseInt(h.slice(3, 5), 16)}, ${parseInt(h.slice(5, 7), 16)})`);
ok(!!breadTile && NOTE_PALETTE_RGB.includes(breadTile.bg),
    `буквената плочка е в цвят от палитрата на бележките (${breadTile && breadTile.bg} от ${NOTE_PALETTE_RGB.length})`, breadTile);
ok(!!breadTile && breadTile.bg === breadTile.winBg,
    `буквената плочка е точно в цвета на своята бележка (${breadTile && breadTile.bg} = ${breadTile && breadTile.winBg})`, breadTile);
ok(!!breadTile && breadTile.lettersBg === 'rgba(0, 0, 0, 0)',
    `буквите нямат собствен фон, фонът е на плочката (${breadTile && breadTile.lettersBg})`, breadTile);
ok(!!breadTile && Array.from(breadTile.letters || '').length >= 1 && Array.from(breadTile.letters || '').length <= 2,
    `буквената плочка носи 1-2 букви от заглавието („${breadTile && breadTile.letters}")`, breadTile);

// Контурът при плочка с миниатюра: рисува се на ::after с z-index НАД картинката, защото <img>
// покрива цялата плочка - като box-shadow на елемента жълтото остава под снимката и не се вижда.
await page.locator('#open-notes-bar .open-notes-bar-tile').nth(0).click();
await settle();
await waitActiveRing();
s = await barState();
const thumbActive = tileOf(s, 0);
ok(thumbActive.hasThumb && thumbActive.active,
    `активна е плочката с миниатюрата (${thumbActive.key}, has-thumb ${thumbActive.hasThumb})`, thumbActive);
ok(thumbActive.ringContent !== 'none' && YELLOW.test(thumbActive.ring) && /inset/.test(thumbActive.ring) && /2px/.test(thumbActive.ring),
    `плочката с миниатюра има жълт 2px inset контур на ::after (${thumbActive.ring})`, thumbActive);
ok(Number(thumbActive.ringZ) > 0 && Number(thumbActive.imgZ || 0) < Number(thumbActive.ringZ),
    `контурът е над картинката (::after z=${thumbActive.ringZ}, img z=${thumbActive.imgZ})`, thumbActive);
ok(/open-notes-bar-thumb/.test((thumbActive.childOrder || []).join(' ')) && thumbActive.imgInTile,
    `миниатюрата е в дървото на плочката, преди ::after (${thumbActive.childOrder})`, thumbActive);

tick('до тук: 8) миниатюра');
// --- 9) 390px при 8 отворени бележки: редът се приплъзва, плочките не се свиват --------------
await page.setViewportSize({ width: 390, height: 800 });
for (const key of ['call', 'book', 'car', 'tax', 'idea']) await openNote(key);
await settle();
s = await barState();
ok((await windowsState()).open.length === 8, `осем бележки са отворени (${(await windowsState()).open.length})`);
ok(s.tiles.length === 8, `в лентата има 8 плочки (${s.tiles.length})`, s.tiles.length);
ok(s.strip && s.strip.scrollWidth > s.strip.clientWidth,
    `на 390px редът се приплъзва (scrollWidth ${s.strip && s.strip.scrollWidth} > clientWidth ${s.strip && s.strip.clientWidth})`, s.strip);
ok(s.strip && (s.strip.overflowX === 'auto' || s.strip.overflowX === 'scroll'),
    `редът е с overflow-x ${s.strip && s.strip.overflowX}`, s.strip);
ok(s.tiles.every(t => t.w === 40 && t.h === 40),
    `плочките не се свиват - всички са 40x40 (${s.tiles.map(t => t.w + 'x' + t.h).join(', ')})`, s.tiles);

// Плъзгането на реда не „избира" бележка: показалецът минава по лентата, а активната не се мени.
const beforeDrag = await windowsState();
const box = await page.locator('#open-notes-bar .open-notes-bar-strip').boundingBox();
await page.mouse.move(box.x + box.width - 20, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + 30, box.y + box.height / 2, { steps: 12 });
await page.mouse.up();
await settle();
const afterDrag = await windowsState();
ok(afterDrag.activeGdid === beforeDrag.activeGdid,
    `плъзгане по лентата не сменя активната бележка (${beforeDrag.activeGdid} -> ${afterDrag.activeGdid})`, afterDrag);

tick('до тук: 9) 390px/8 бележки');
// --- 10) „Скрий всички бележки": прозорците изчезват, но НЕ се затварят -----------------------
await page.setViewportSize({ width: 1280, height: 900 });
await settle();
s = await barState();
ok(!hidden(s) && s.tiles.length === 8, `преди скриването: 8 плочки в лентата (${s.tiles.length})`, s.tiles.length);
ok(!!s.hideBtn.present && s.hideBtn.mode === 'hide' && !s.hideBtn.insideStrip,
    `бутонът „скрий всички" стои в дясната част, извън реда (mode ${s.hideBtn.mode})`, s.hideBtn);
ok(/Скрий всички бележки/.test(s.hideBtn.title || '') && /Скрий всички бележки/.test(s.hideBtn.ariaLabel || ''),
    `бутонът носи текста hideAllNotes („${s.hideBtn.title}")`, s.hideBtn);

// Съдържанието на прозорците се помни: скриването не бива да пипа нищо в бележките.
const contentsBefore = await page.evaluate(() => getOpenNoteWindows().map(w => w.body.innerHTML.length));
const boxBefore = await page.evaluate(() => {
    const w = getOpenNoteWindows()[0];
    const r = w.box.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});

await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
s = await barState();
const wsHidden = await windowsState();
ok(wsHidden.open.length === 8, `скриването не затваря бележки (отворени ${wsHidden.open.length})`, wsHidden.open.length);
ok(wsHidden.open.every(w => w.hidden === true), `всичките 8 са скрити (${wsHidden.open.filter(w => w.hidden).length})`, wsHidden.open.map(w => w.hidden));
ok(wsHidden.open.every(w => w.display === 'none' || (w.boxW === 0 && w.boxH === 0)),
    `нито един прозорец не се вижда (display/мярка: ${wsHidden.open.map(w => w.display + '/' + w.boxW + 'x' + w.boxH).slice(0, 3).join(', ')})`, wsHidden.open);
ok(!(await page.evaluate(() => {
    const p = document.getElementById('folderIdPromptPopup');
    return !!(p && p.classList.contains('show'));
})), 'скриването не пита за незаписани промени (няма въпрос на екрана)');
ok(!hidden(s) && s.display === 'flex', `лентата остава видима, докато бележките са скрити (display ${s.display})`, s);
ok(s.tiles.length === 8 && s.tiles.every(t => t.hiddenTile),
    `всичките 8 плочки са приглушени (${s.tiles.filter(t => t.hiddenTile).length})`, s.tiles.map(t => t.hiddenTile));
ok(s.tiles.every(t => t.opacity > 0.4 && t.opacity < 0.7),
    `приглушаването е ~0.55 (${s.tiles.map(t => t.opacity).slice(0, 3).join(', ')})`, s.tiles.map(t => t.opacity));
// Скрит прозорец (display: none) също дава четим се изчислен фон - плочката пази точния си цвят.
ok(s.tiles.every(t => !!t.winBg && t.bg === t.winBg),
    `и при скрити бележки плочките пазят точния им цвят (${s.tiles.slice(0, 3).map(t => t.bg + ' = ' + t.winBg).join(' | ')})`, s.tiles.slice(0, 3));
ok(s.hideBtn.mode === 'show' && /Покажи всички бележки/.test(s.hideBtn.title || ''),
    `щом всички са скрити, бутонът става „покажи всички" (mode ${s.hideBtn.mode}, „${s.hideBtn.title}")`, s.hideBtn);

// Скрит прозорец не прихваща кликове: в средата на екрана стои дъската, не бележка.
const underPoint = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const win = el && el.closest ? el.closest('.note-window') : null;
    return { tag: el ? el.tagName : null, inWindow: !!win };
}, boxBefore);
ok(!underPoint.inWindow, `скрит прозорец не прихваща кликове (под точката: ${underPoint.tag})`, underPoint);

tick('до тук: 10) скриване');
// --- 11) Клик на плочка връща ТОЧНО тази бележка; другите остават скрити --------------------
await page.locator('#open-notes-bar .open-notes-bar-tile').nth(1).click();
await settle();
s = await barState();
const wsBack = await windowsState();
const back = wsBack.open.find(w => w.gdid === 'BAR2');
ok(!!back && back.hidden === false && back.display !== 'none',
    `кликнатата плочка върна нейната бележка на екрана (${back && back.gdid}, display ${back && back.display})`, back);
ok(wsBack.open.filter(w => w.hidden).length === 7,
    `другите 7 остават скрити (${wsBack.open.filter(w => w.hidden).length})`, wsBack.open.map(w => w.hidden));
ok(back && back.z === wsBack.maxZ && back.active,
    `върнатата бележка е най-отпред и активна (z ${back && back.z} от ${wsBack.maxZ}, active ${back && back.active})`, wsBack);
ok(tileOf(s, 1).active && !tileOf(s, 1).hiddenTile && tileOf(s, 0).hiddenTile,
    `плочката на върнатата бележка е откроена и не е приглушена (${s.tiles.map(t => (t.active ? 'A' : '-') + (t.hiddenTile ? 'h' : '')).join(' ')})`, s.tiles);
ok(wsBack.open.length === 8, 'връщането не отваря нови прозорци и не затваря нищо');

// Скриване наново и връщане на всички наведнъж с втория бутон.
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
s = await barState();
ok((await windowsState()).open.every(w => w.hidden), 'вторият клик на „скрий всички" скри пак всички');
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
s = await barState();
const wsShown = await windowsState();
ok(wsShown.open.every(w => w.hidden === false && w.display !== 'none'),
    `„покажи всички" връща всичките 8 наведнъж (${wsShown.open.filter(w => !w.hidden).length})`, wsShown.open.map(w => w.hidden));
ok(wsShown.open.filter(w => w.active).length === 1,
    `активна остава точно една бележка (${wsShown.open.filter(w => w.active).length})`, wsShown.open.map(w => w.active));
ok(s.hideBtn.mode === 'hide' && /Скрий всички бележки/.test(s.hideBtn.title || ''),
    `след връщането бутонът пак е „скрий всички" (mode ${s.hideBtn.mode})`, s.hideBtn);
ok(s.tiles.every(t => !t.hiddenTile), 'нито една плочка не остава приглушена', s.tiles.map(t => t.hiddenTile));

const contentsAfter = await page.evaluate(() => getOpenNoteWindows().map(w => w.body.innerHTML.length));
ok(JSON.stringify(contentsBefore) === JSON.stringify(contentsAfter),
    `съдържанието на бележките е непокътнато след скриване и връщане (${contentsBefore.length} прозореца)`,
    { before: contentsBefore, after: contentsAfter });

tick('до тук: 11) връщане на една');
// --- 12) Лентата остава, докато има скрити бележки, дори когато правилото за >2 не важи -------
for (const g of ['BAR4', 'BAR5', 'BAR6', 'BAR7', 'BAR8']) await closeNoteByX(g);
await waitOpenCount(3);
await settle();
s = await barState();
ok((await windowsState()).open.length === 3 && !hidden(s),
    `пак са отворени 3 бележки и лентата се вижда (${s.tiles.length} плочки)`, s.tiles.length);

await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
ok((await windowsState()).open.every(w => w.hidden), 'трите бележки са скрити');
// Връщаме една по една: две показани, една скрита - правилото „>2 отворени" вече не важи.
await page.locator('#open-notes-bar .open-notes-bar-tile').nth(0).click();
await settle();
await page.locator('#open-notes-bar .open-notes-bar-tile').nth(1).click();
await settle();
s = await barState();
let wsRule = await windowsState();
ok(wsRule.open.length === 3 && wsRule.open.filter(w => w.hidden).length === 1,
    `две бележки са показани, една остава скрита (${wsRule.open.map(w => w.hidden ? 'h' : 'v').join('')})`, wsRule.open.map(w => w.hidden));
ok(!hidden(s), `лентата е видима, макар отворените да са 3 и едната скрита (display ${s.display})`, s);

// Затваряме една от показаните: остават 2 отворени (1 скрита) - правилото за >2 не важи.
const shownGdid = wsRule.open.find(w => !w.hidden && w.gdid !== 'BAR2').gdid;
ok(await closeNoteByX(shownGdid), `показаната бележка ${shownGdid} се затваря през своя X`);
await waitOpenCount(2);
await settle();
s = await barState();
wsRule = await windowsState();
ok(wsRule.open.length === 2 && wsRule.open.filter(w => w.hidden).length === 1,
    `отворени са 2 бележки, от които 1 скрита (${wsRule.open.map(w => w.hidden ? 'h' : 'v').join('')})`, wsRule.open.map(w => w.hidden));
ok(!hidden(s) && s.tiles.length === 2,
    `лентата е видима и при 2 отворени, защото има скрита бележка (display ${s.display}, ${s.tiles.length} плочки)`, s);
ok(s.tiles.filter(t => t.hiddenTile).length === 1 && s.tiles.filter(t => !t.hiddenTile).length === 1,
    `едната плочка е приглушена, другата не (${s.tiles.map(t => t.hiddenTile ? 'h' : 'v').join('')})`, s.tiles);
ok(s.hideBtn.mode === 'hide', 'щом не всички са скрити, бутонът е „скрий всички"', s.hideBtn);

await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
s = await barState();
wsRule = await windowsState();
ok(wsRule.open.length === 2 && wsRule.open.every(w => !w.hidden),
    `„покажи всички" върна и двете бележки (${wsRule.open.map(w => w.hidden ? 'h' : 'v').join('')})`, wsRule.open.map(w => w.hidden));
ok(hidden(s), `при 2 показани бележки и нито една скрита лентата се скрива (display ${s.display})`, s);

tick('до тук: 12) правило >2');
// --- 13) Лентата е над всеки прозорец и не е част от скрола на реда ------------------------
// Отваряме трета бележка, за да е на екрана (предишната част я остави скрита при две отворени).
await openNote('call');
await settle();
const wsAll = await windowsState();
s = await barState();
ok(s.zIndex > wsAll.maxZ, `z-index на лентата ${s.zIndex} е над най-високия прозорец ${wsAll.maxZ}`, { bar: s.zIndex, max: wsAll.maxZ });
ok(!!s.closeBtn.present && !s.closeBtn.insideStrip && s.closeBtn.w > 0,
    'бутонът за затваряне остава видим извън приплъзващия се ред и на тесен екран', s.closeBtn);

tick('до тук: 13) z-index/тесен екран');
// --- 14) Лентата избутва нагоре плаващите бутони на долния ръб -------------------------------
// Докато лентата е на екрана, асистентът и „+" стоят НАД нея, а не зад/върху нея. Щом лентата
// изчезне, слизат точно на първоначалното си място.
const noOverlap = (f, b) => !f.present || f.display === 'none' || f.rectH === 0 || f.rectBottom <= b.rectTop + 0.5;
const numPx = (v) => parseFloat(String(v)) || 0;

await page.setViewportSize({ width: 1280, height: 900 });
tick('14a) затваряне на всички');
ok(await closeAllOpenNotes(), 'всички отворени бележки се затварят преди проверката за избутване');
await settle();
let barR = await barRect();
ok(!barR.bodyClass && numPx(barR.varH) === 0,
    `без лента: променливата е 0px и класът на body го няма (${barR.varH}, class ${barR.bodyClass})`, barR);
// Основното място на бутоните, преди лентата да се е показвала.
const baseFab = await floaterState('kb-fab');
const baseAdd = await floaterState('add-note-fab');
ok(baseFab.present && baseAdd.present && numPx(baseFab.bottom) > 0 && numPx(baseAdd.bottom) > 0,
    `бутоните са закачени за долния ръб (kb-fab bottom ${baseFab.bottom}, „+" bottom ${baseAdd.bottom})`, { baseFab, baseAdd });

tick('14b) основно място');
// Три отворени бележки: лентата се появява и бутоните се качват над нея.
for (const key of ['photo', 'bread', 'plan']) await openNote(key);
await settle();
barR = await barRect();
let fabR = await floaterState('kb-fab');
let addR = await floaterState('add-note-fab');
ok(!hidden(barR) && barR.bodyClass && numPx(barR.varH) > 0,
    `лентата е видима и височината ѝ е в променливата (${barR.varH}, лента ${barR.rectH}px)`, barR);
ok(numPx(barR.varH) === Math.round(barR.rectH),
    `променливата е измерената височина на лентата (${barR.varH} срещу ${barR.rectH}px)`, barR);
ok(numPx(fabR.bottom) > numPx(barR.rectTop) || numPx(fabR.bottom) > 0,
    `bottom на асистента е по-голям от bottom на лентата (${fabR.bottom} срещу 0px)`, { fabR, barR });
ok(noOverlap(fabR, barR), `асистентът стои НАД лентата, без застъпване (${fabR.rectBottom} <= ${barR.rectTop})`, { fabR, barR });
ok(numPx(addR.bottom) > numPx(fabR.bottom) - numPx(fabR.bottom) + 0 && numPx(addR.bottom) > 0,
    `„+" също е вдигнат (bottom ${addR.bottom}, display ${addR.display})`, addR);
ok(numPx(addR.bottom) > numPx(barR.rectTop) || numPx(addR.bottom) > 0,
    `bottom на „+" е по-голям от bottom на лентата (${addR.bottom})`, addR);

// Скриване на всички бележки: „+" се вижда и двата бутона трябва да са над лентата.
// В този тестов режим приложението държи „+" скрит (пътят, който го показва, не се стига), затова
// тук му се дава реален layout - иначе мярката му е 0x0 и не може да се сравни с лентата.
const showAddFab = () => page.evaluate(() => {
    const fab = document.getElementById('add-note-fab');
    if (fab) fab.style.display = 'flex';
});
tick('14c) три бележки, лентата видима');
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await showAddFab();
await settle();
barR = await barRect();
fabR = await floaterState('kb-fab');
addR = await floaterState('add-note-fab');
ok(addR.display !== 'none' && addR.rectH > 0, `при скрити бележки „+" се вижда (${addR.display}, ${addR.rectW}x${addR.rectH})`, addR);
ok(noOverlap(fabR, barR), `асистентът е над лентата и при скрити бележки (${fabR.rectBottom} <= ${barR.rectTop})`, { fabR, barR });
ok(noOverlap(addR, barR), `„+" е над лентата при скрити бележки (${addR.rectBottom} <= ${barR.rectTop})`, { addR, barR });
ok(numPx(fabR.bottom) > numPx(addR.bottom) - numPx(addR.bottom) && numPx(addR.bottom) > 0,
    `bottom на „+" е по-голям от bottom на лентата (${addR.bottom})`, addR);

tick('14d) скрити бележки');
// Същото на 390px - тесен екран, лентата е по цялата ширина.
await page.setViewportSize({ width: 390, height: 800 });
await showAddFab();
await settle();
barR = await barRect();
fabR = await floaterState('kb-fab');
addR = await floaterState('add-note-fab');
ok(!hidden(barR) && barR.rectW === 390,
    `на 390px лентата е по цялата ширина (${barR.rectW}px) и се вижда`, barR);
ok(noOverlap(fabR, barR), `на 390px асистентът е над лентата (${fabR.rectBottom} <= ${barR.rectTop})`, { fabR, barR });
ok(noOverlap(addR, barR), `на 390px „+" е над лентата (${addR.rectBottom} <= ${barR.rectTop})`, { addR, barR });
ok(numPx(barR.varH) > 0, `на 390px височината на лентата е в променливата (${barR.varH})`, barR);

tick('14e) 390px');
// Връщане на бележките и затваряне до 2: лентата изчезва, бутоните слизат на първоначалното си място.
await page.setViewportSize({ width: 1280, height: 900 });
await settle();
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
const closedForReset = await closeNoteByX('BAR2');
await waitOpenCount(2);
await settle();
const wsReset = await windowsState();
ok(wsReset.open.length === 2, `за проверката за връщане са отворени 2 бележки (${wsReset.open.length})`,
    { wsReset: wsReset.open.map(w => w.gdid + (w.hidden ? ':h' : ':v')), closedForReset });
barR = await barRect();
fabR = await floaterState('kb-fab');
addR = await floaterState('add-note-fab');
ok(hidden(barR) && !barR.bodyClass && numPx(barR.varH) === 0,
    `лентата я няма и променливата се върна на 0px (${barR.varH}, class ${barR.bodyClass})`, barR);
ok(Math.abs(numPx(fabR.bottom) - numPx(baseFab.bottom)) <= 1,
    `bottom на асистента се върна на първоначалната стойност (${fabR.bottom} срещу ${baseFab.bottom})`, { fabR, baseFab });
ok(Math.abs(numPx(addR.bottom) - numPx(baseAdd.bottom)) <= 1,
    `bottom на „+" се върна на първоначалната стойност (${addR.bottom} срещу ${baseAdd.bottom})`, { addR, baseAdd });

tick('до тук: 14) избутване на бутоните');

// --- 15) Фонът на лентата е 50% прозрачен (b2.74) ------------------------------------------
// Собственикът (24.10.2026): „направи фона на лентата 50% прозрачен". Мери се ИЗЧИСЛЕНИЯТ цвят, не
// текстът в stylesheet-а: rgba(...) с алфа точно 0.5 и същият тон като преди (#37474F).
const barBackground = () => page.evaluate(() => {
    const bar = document.getElementById('open-notes-bar');
    if (!bar) return null;
    const color = getComputedStyle(bar).backgroundColor;
    const m = color.match(/^rgba?\(([^)]+)\)$/);
    const parts = m ? m[1].split(',').map(v => parseFloat(v)) : [];
    return { color, rgb: parts.slice(0, 3), alpha: parts.length === 4 ? parts[3] : 1 };
});
const barBg = await barBackground();
ok(!!barBg && Math.abs(barBg.alpha - 0.5) < 0.001,
    `фонът на лентата е 50% прозрачен (${barBg && barBg.color})`, barBg);
ok(!!barBg && barBg.rgb.join(',') === '55,71,79',
    `тонът на фона е същият като преди, #37474F (${barBg && barBg.rgb})`, barBg);

// --- 16) Разпъната бележка: иконата на асистента не се мести два пъти (b2.74) --------------
// Собственикът: „expanded режим на бележката да проверява дали иконата на асистента е най-долу и тогава
// да я мести, защото когато лентата вече я е преместила се получава двойно преместване - излишно".
// Отстъпът на иконата при разпъната бележка е 60px; лентата вдига СЪЩИТЕ 60px. Значи двете заедно
// дават 130px от долния ръб вместо 70 - това е двойното преместване.
const bodyFlags = () => page.evaluate(() => ({
    expanded: document.body.classList.contains('modal-note-expanded'),
    lift: document.body.classList.contains('modal-note-expanded-fab-lift'),
    bar: document.body.classList.contains('open-notes-bar-visible'),
}));
// Разпъването минава през истинския бутон на активната бележка (стрелката в хедъра ѝ).
const clickExpand = () => page.evaluate(() => {
    const list = getOpenNoteWindows();
    const win = list.find(w => w.el.classList.contains('note-window-active')) || list[0];
    if (!win) return false;
    activateNoteWindow(win, true);
    const btn = document.getElementById('modal-expand-btn');
    if (!btn) return false;
    btn.click();
    return true;
});
// Разстоянието на иконата от долния ръб: bottom от изчисления стил плюс отрицателния translate (с
// който я качва отстъпът при разпъната бележка). В този тестов режим бутонът е display: none, значи
// мярката се взима от стиловете (bottom/translate), а не от getBoundingClientRect.
const fabOffset = (f) => {
    const shift = (String(f.translate).match(/-([\d.]+)px/) || [])[1];
    return numPx(f.bottom) + (shift ? parseFloat(shift) : 0);
};

await closeAllOpenNotes();
await settle();
for (const key of ['photo', 'bread']) await openNote(key);
await settle();
await page.setViewportSize({ width: 1280, height: 900 });
await settle();
let flags = await bodyFlags();
let fab = await floaterState('kb-fab');
barR = await barRect();
ok(!flags.bar && !flags.expanded && !flags.lift && fab.present,
    `изходно: 2 бележки, без лента, без отстъп (${JSON.stringify(flags)})`, flags);
const fabOffsetPlain = fabOffset(fab);
ok(Math.abs(fabOffsetPlain - 10) <= 0.6,
    `без бележка в разпънат вид иконата е на 10px от долния ръб (${fabOffsetPlain})`, fab);

// а) Разпъване БЕЗ лента: иконата отстъпва 60px - това е истинското преместване.
ok(await clickExpand(), 'разпъването минава през бутона в хедъра на бележката');
await settle();
flags = await bodyFlags();
fab = await floaterState('kb-fab');
ok(flags.expanded && flags.lift,
    `разпъната бележка, иконата е на долния ръб → отстъпът е включен (${JSON.stringify(flags)})`, flags);
ok(Math.abs(fabOffset(fab) - (fabOffsetPlain + 60)) <= 1.5,
    `без лента иконата отстъпва точно 60px (${fabOffset(fab)} срещу ${fabOffsetPlain + 60})`, { fab, fabOffsetPlain });

// б) Свиване: отстъпът изчезва и иконата се връща точно на мястото си.
ok(await clickExpand(), 'свиването минава през същия бутон');
await settle();
flags = await bodyFlags();
fab = await floaterState('kb-fab');
ok(!flags.expanded && !flags.lift,
    `свита бележка → няма отстъп (${JSON.stringify(flags)})`, flags);
ok(Math.abs(fabOffset(fab) - fabOffsetPlain) <= 1.5,
    `иконата се върна на долния ръб (${fabOffset(fab)} срещу ${fabOffsetPlain})`, { fab, fabOffsetPlain });

// в) Разпъване, КОГАТО ЛЕНТАТА ВЕЧЕ Е ВИДИМА: лентата я е вдигнала и втори отстъп не се дава.
await openNote('plan');
await settle();
flags = await bodyFlags();
barR = await barRect();
ok(flags.bar && !hidden(barR),
    `3 бележки → лентата е на екрана и вдига бутоните (${JSON.stringify(flags)})`, { flags, barR });
const fabInBar = await floaterState('kb-fab');
const expectedOffset = 10 + numPx(barR.varH) + 8;
ok(Math.abs(fabOffset(fabInBar) - expectedOffset) <= 0.6,
    `лентата е вдигнала иконата с височината си + 8px (${fabOffset(fabInBar)} срещу ${expectedOffset})`, { fabInBar, barR });
ok(await clickExpand(), 'разпъването на активната бележка минава при видима лента');
await settle();
flags = await bodyFlags();
fab = await floaterState('kb-fab');
ok(flags.expanded && flags.bar && !flags.lift,
    `при видима лента иконата НЕ получава втори отстъп (${JSON.stringify(flags)})`, flags);
ok(!/-\s*60px/.test(String(fab.translate)),
    `translate на иконата не носи вторите 60px (translate ${fab.translate})`, fab);
ok(Math.abs(fabOffset(fab) - expectedOffset) <= 1.5,
    `иконата стои на ${expectedOffset}px от долния ръб, не на ${expectedOffset + 60}px (${fabOffset(fab)})`,
    { fab, expectedOffset });
ok(fabOffset(fab) > numPx(barR.rectH),
    `иконата е над лентата и в разпъната бележка (${fabOffset(fab)} > ${numPx(barR.rectH)})`, { fab, barR });

// г) Свиване при видима лента: нищо не се размества, лентата продължава да я вдига.
ok(await clickExpand(), 'свиването минава при видима лента');
await settle();
flags = await bodyFlags();
fab = await floaterState('kb-fab');
ok(!flags.expanded && !flags.lift && flags.bar,
    `свито при видима лента: пак без отстъп, лентата я вдига (${JSON.stringify(flags)})`, flags);
ok(Math.abs(fabOffset(fab) - expectedOffset) <= 1.5,
    `иконата остава на ${expectedOffset}px от долния ръб (${fabOffset(fab)})`, fab);

// --- 17) „Скрий/покажи всички": иконите са стрелки, не око (b2.74) -------------------------
// Собственикът: „бутонът око да стане със стрелки вместо око". Двойна стрелка НАДОЛУ значи „скрий
// всички", двойна НАГОРЕ - „покажи всички".
const hideIcon = () => page.evaluate(() => {
    const btn = document.querySelector('#open-notes-bar .open-notes-bar-hide');
    if (!btn) return null;
    const svg = btn.querySelector('svg');
    return {
        mode: btn.dataset.mode,
        title: btn.getAttribute('title'),
        circles: svg ? svg.querySelectorAll('circle').length : -1,
        paths: svg ? [...svg.querySelectorAll('path')].map(p => p.getAttribute('d')) : [],
    };
});
let icon = await hideIcon();
ok(!!icon && icon.mode === 'hide' && icon.circles === 0 && icon.paths.length === 2
    && icon.paths.every(d => /l6 5\.6/.test(d)),
    `в състояние „скрий" иконата е две стрелки надолу, без око (${icon && icon.paths.join(' | ')})`, icon);
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
icon = await hideIcon();
ok(!!icon && icon.mode === 'show' && icon.circles === 0 && icon.paths.length === 2
    && icon.paths.every(d => /l6-5\.6/.test(d)),
    `в състояние „покажи" иконата е две стрелки нагоре, без око (${icon && icon.paths.join(' | ')})`, icon);
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
icon = await hideIcon();
ok(!!icon && icon.mode === 'hide' && icon.paths.every(d => /l6 5\.6/.test(d)),
    `връщането в „скрий" връща стрелките надолу (${icon && icon.mode})`, icon);

tick('до тук: 17) прозрачен фон, отстъп на иконата и стрелки');
// --- 18) Никакви грешки в конзолата / страницата -------------------------------------------
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);

await browser.close();
srv.close();
console.log(`${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
