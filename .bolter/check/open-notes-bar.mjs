// Лентата с миниатюри на отворените бележки в дъното на екрана (b2.70).
// Собственикът (24.10.2026): „когато имаме отворени повече от 2 бележки най-отдолу на екрана да се
// появи лента с мини-изображения (40px) на бележките и бутон за затваряне на всички бележки, която
// да се приплъзва, ако няма достатъчно място на екрана. кликването на иконка активира съответната
// ѝ бележка".
// Проверява се по ИСТИНСКИЯ път в браузър - истински прозорци (showModal), истински кликове с
// показалеца, истински thumbnail от (фалшив) Drive:
//   - при 0 отворени бележки лентата я няма (display: none);
//   - при 1, 2 и 3 отворени бележки се вижда (собственикът, 25.10.2026: „лентата вече се показва
//     веднага при 1 отворена бележка, не при 3") - при 1 е с една плочка 40x40, при 3 с три;
//     при 1 кликът на плочката вдига бележката, а кликът на активната я скрива и връща;
//   - фонът на всяка плочка е ТОЧНО цветът на бележката (фонът на .modal-content-box на прозореца ѝ);
//   - буквите се четат: тъмни на светла бележка, бели на тъмна (бележка с цвят #222222);
//   - активната бележка е оградена с жълт 2px контур, нарисуван ОТВЪТРЕ в плочката (на ::after, над
//     миниатюрата) и контурът се мести при клик на друга плочка;
//   - клик на плочка вдига нейния прозорец най-отпред и го прави активен;
//   - лентата изчезва едва когато не остане нито една отворена бележка;
//   - бутонът в дясно затваря всички бележки (същата closeAllNoteWindows);
//   - на 390px при 8 бележки редът се приплъзва (scrollWidth > clientWidth) и плочките не се свиват;
//   - лентата е над всеки прозорец (z-index), не приема кликове през слоя и стои извън скрола;
//   - в режим „единична бележка" лентата НЕ се показва - изключването на режима я връща веднага,
//     без презареждане, а скрита бележка се ЗАТВАРЯ още при включването на режима (собственикът,
//     25.10.2026: „при включена настройка Single note лентата е излишно да се показва" и „в този
//     режим не може да има много бележки, така че да не ги връща, а да ги затваря");
//   - бележка със снимка показва <img> в плочката си, бележка без снимка - буквена плочка;
//   - плочката стига до снимката и когато първият ред ЗАПОЧВА със снимката, и когато търсенето по име
//     в Drive е по-бавно от чакането ѝ (до три опита), и когато адресът е готов само в тялото на
//     бележката (b2.84);
//   - разпъната бележка при видима лента (extended mode, b2.75): долният ред с бутоните и редът с
//     датата под него свършват НАД лентата, всеки бутон се натиска (elementFromPoint), а щом лентата
//     изчезне, бележката се връща на цялата височина - на 1280x900 и на 390x844;
//   - клик на плочката на АКТИВНАТА бележка я скрива (плочката става is-hidden), втори клик върху
//     същата плочка я показва пак и я прави активна - плочката е превключвател, а клик на плочка на
//     друга/скрита бележка работи както досега (b2.77);
//   - при ЕДНА отворена бележка разпънатата бележка и иконката на Ko-fi стоят НАД лентата - със
//     същите мерки като при три (b2.78);
//   - дълго натискане (500ms) на плочка само ВДИГА плочката (is-dragging) и я въоръжава за местене
//     (_longPressArmed); пускане без движение не затваря, не скрива и не показва нищо - .modal-close на
//     бележката не се вика, а плочката слиза долу; обикновен клик още вдига/скрива, а touchmove преди
//     500ms (плъзгане по лентата) не вдига нищо (b2.85).
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
// Още три файла за проверките на плочката (b2.84) - всеки със СВОЕ име, защото кешът на вече
// намерен адрес помни по име и обща снимка би скрила проверката.
const FIRST_PHOTO = 'bar_first_photo.png';
const FIRST_PHOTO_ID = 'BARPHOTO0002';
const SLOW_PHOTO = 'bar_slow_photo.png';
const SLOW_PHOTO_ID = 'BARPHOTO0003';
// Този файл НЕ съществува в Drive: търсенето по име връща празен списък.
const BODY_FILE = 'bar_body_only.png';
const IMG_FIRST_PATH = '/storage/emulated/0/Pictures/Images/' + FIRST_PHOTO;
const IMG_SLOW_PATH = '/storage/emulated/0/Pictures/Images/' + SLOW_PHOTO;
const IMG_BODY_PATH = '/storage/emulated/0/Pictures/Images/' + BODY_FILE;
// Адресът, който бележката вече е нарисувала в тялото си (проверка В).
const BODY_SRC = 'https://thumb.invalid/BODY1=s80';
const DRIVE_NAMES = { [PHOTO]: PHOTO_ID, [FIRST_PHOTO]: FIRST_PHOTO_ID, [SLOW_PHOTO]: SLOW_PHOTO_ID };
const PHOTO_IDS = new Set(Object.values(DRIVE_NAMES));
// Забавяне на търсенето по име за едно име: така се проверява, че плочката опитва пак, когато
// Drive отговаря по-бавно от чакането ѝ (проверка Б). Продуктовият код не знае за това.
let driveSearchDelay = { name: '', ms: 0 };

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
// Всичко извън localhost: Drive отговаря като истински за една снимка, останалото - празно.
await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
    const url = route.request().url();
    const meta = url.match(/^https:\/\/www\.googleapis\.com\/drive\/v3\/files\/([^?]+)\?fields=thumbnailLink/);
    if (meta) {
        const fileId = decodeURIComponent(meta[1]);
        if (!PHOTO_IDS.has(fileId)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ thumbnailLink: `https://thumb.invalid/${fileId}=s800` }) });
    }
    if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
        const q = new URL(url).searchParams.get('q') || '';
        const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
        if (/mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q)) {
            if (name === 'Images') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: FOLDER_IMAGES, name: 'Images' }] }) });
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: 'F_' + name, name }] }) });
        }
        if (DRIVE_NAMES[name]) {
            // Бавно търсене за избраното име: отговорът закъснява, за да се провери, че плочката
            // опитва пак, вместо да остане с буквите до края на сесията.
            if (driveSearchDelay.name === name && driveSearchDelay.ms) {
                await new Promise(r => setTimeout(r, driveSearchDelay.ms));
            }
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [{ id: DRIVE_NAMES[name], name, modifiedTime: '2026-10-19T09:00:00Z' }] }) });
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
    // Бележка със ЗАДАДЕНА ДАТА и час: под долната лента има и ред с датата (.note-cal-row), който
    // също трябва да свършва над лентата на бележките, когато бележката е разпъната (b2.75).
    {
        key: 'dated', id: '9110', gdid: 'BAR10', raw: 'Среща с Иван\nв 9:30', format: '',
        calendarDate: Date.now(), uiState: { cTime: '09:30' },
    },
    // Трите бележки за плочката с миниатюра (b2.84). Първият ред ЗАПОЧВА със снимката - точно
    // случаят на собственика (25.10.2026: „в първия ред има в началото вложена картинка ... се
    // показват първите две букви от текста и картинката си игнорира").
    {
        key: 'firstimg', id: '9111', gdid: 'BAR11', raw: '* Снимка на плажа',
        format: fmt({ start: 0, end: 1, type: 8, paramstring: IMG_FIRST_PATH, paramint: 5 }),
    },
    // Същата бележка, но файлът ѝ се намира в Drive след 2.5s - по-късно от чакането на плочката.
    {
        key: 'slowimg', id: '9112', gdid: 'BAR12', raw: '* Бавна снимка',
        format: fmt({ start: 0, end: 1, type: 8, paramstring: IMG_SLOW_PATH, paramint: 5 }),
    },
    // Бележка, чийто файл по име НЕ се намира в Drive, а снимката вече е в тялото ѝ.
    {
        key: 'bodyimg', id: '9113', gdid: 'BAR13', raw: '* Снимка само в тялото',
        format: fmt({ start: 0, end: 1, type: 8, paramstring: IMG_BODY_PATH, paramint: 5 }),
    },
];

// Отваря бележка по истинския път на приложението (showModal), както клик на картата на борда.
const openNote = (key) => page.evaluate((def) => {
    useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
    dbSourceGlobal = null; dirHandle = null; isOffline = false;
    authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
    if (!allNotesData.some(x => String(x.gdid) === def.gdid)) {
        allNotesData.push({
            alarm_type: -1, calendarDate: def.calendarDate || 0, color: def.color || 0, date: Date.now(), datemod: Date.now(), eventId: 0,
            gdid: def.gdid, id: def.id, notetxt: def.raw, numord: Number(def.id), sellist: 0, status: 0,
            text_span: def.format, title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
            // Състоянието идва от бележката, както при истинско отваряне (тук: час за реда с датата).
            uiState: def.uiState,
        });
    }
    const opts = { raw: def.raw, format: def.format, id: def.id, gdid: def.gdid };
    if (def.uiState) opts.uiState = def.uiState;
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
                // Вдигната ли е плочката (is-dragging - след задържане или по време на местене) и стои ли
                // въоръжена за местене (_longPressArmed).
                dragging: t.classList.contains('is-dragging'),
                armed: !!t._longPressArmed,
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

// Иконката на Ko-fi: истинският widget се проверява в kofi-widget.mjs (със своите фикстури), а тук
// се мери правилото, което я качва над лентата - контейнер със същите класове, вдиган със СЪЩАТА
// променлива --open-notes-bar-h (12px от долния ръб, а с лента - височината ѝ + 8px отгоре).
const kofiState = () => page.evaluate(() => {
    let wrap = document.querySelector('.floatingchat-container-wrap[data-test-stub]');
    if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'floatingchat-container-wrap';
        wrap.dataset.testStub = '1';
        wrap.style.width = '88px';
        wrap.style.height = '48px';
        document.body.appendChild(wrap);
    }
    const bar = document.getElementById('open-notes-bar');
    const round = v => Math.round(v * 10) / 10;
    const r = wrap.getBoundingClientRect();
    const br = bar ? bar.getBoundingClientRect() : null;
    return {
        bottom: round(parseFloat(getComputedStyle(wrap).bottom) || 0),
        rectBottom: round(r.bottom),
        rectH: round(r.height),
        barTop: br ? round(br.top) : null,
        above: !!br && r.bottom <= br.top + 0.5,
        bodyBar: document.body.classList.contains('open-notes-bar-visible'),
    };
});
const removeKofiStub = () => page.evaluate(() => {
    document.querySelectorAll('.floatingchat-container-wrap[data-test-stub]').forEach(el => el.remove());
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

// --- 1) Лентата я няма само при 0 отворени бележки; при 1 вече се вижда ----------------------
let s = await barState();
ok(hidden(s), 'при 0 отворени бележки лентата е скрита', s);

// ЕДНА отворена бележка вече е достатъчна (собственикът, 25.10.2026: „лентата вече се показва
// веднага при 1 отворена бележка, не при 3"). Плочката е 40x40, кликът ѝ вдига бележката, а кликът
// на активната ѝ плочка я скрива - вторият клик я връща.
await openNote('photo');
await settle();
s = await barState();
ok(!hidden(s) && s.display === 'flex', `при 1 отворена бележка лентата се вижда (display ${s.display})`, s);
ok(s.tiles.length === 1, `в лентата има точно 1 плочка (${s.tiles.length})`, s.tiles);
ok(s.tiles.every(t => t.w === 40 && t.h === 40), `плочката е 40x40 (${s.tiles.map(t => t.w + 'x' + t.h).join(', ')})`, s.tiles);
let ws1 = await windowsState();
ok(ws1.open.length === 1 && ws1.activeGdid === 'BAR1',
    `единствената бележка е отворена и активна (${ws1.open.length}, ${ws1.activeGdid})`, ws1);
ok(s.tiles[0].active === true, `плочката ѝ е откроена (is-active ${s.tiles[0].active})`, s.tiles[0]);
// Клик на плочката на активната (единствена) бележка я скрива, а лентата остава на екрана - тя е
// пътят да се върне.
await page.locator('#open-notes-bar .open-notes-bar-tile').nth(0).click();
await settle();
s = await barState();
ws1 = await windowsState();
ok(ws1.open.length === 1 && ws1.open[0].hidden === true,
    `клик на плочката на активната бележка я скрива (отворени ${ws1.open.length}, скрити ${ws1.open.filter(w => w.hidden).length})`, ws1.open);
ok(s.tiles.length === 1 && s.tiles[0].hiddenTile === true,
    `плочката на скритата бележка е приглушена (is-hidden ${s.tiles[0].hiddenTile})`, s.tiles[0]);
ok(!hidden(s) && s.display === 'flex',
    `лентата остава на екрана и при скритата единствена бележка (display ${s.display})`, s);
// Вторият клик на същата плочка я връща и я прави активна.
await page.locator('#open-notes-bar .open-notes-bar-tile').nth(0).click();
await settle();
s = await barState();
ws1 = await windowsState();
ok(ws1.open.length === 1 && ws1.open[0].hidden === false && ws1.open[0].display !== 'none',
    `вторият клик върна бележката на екрана (hidden ${ws1.open[0].hidden}, display ${ws1.open[0].display})`, ws1.open);
ok(ws1.activeGdid === 'BAR1' && s.tiles[0].active === true && s.tiles[0].hiddenTile === false,
    `върнатата бележка е активна и плочката ѝ е откроена, не приглушена (${ws1.activeGdid})`, s.tiles[0]);

await openNote('bread');
await settle();
s = await barState();
ok(!hidden(s) && s.display === 'flex', `при 2 отворени бележки лентата се вижда (display ${s.display})`, s);
ok(s.tiles.length === 2, `в лентата има 2 плочки (${s.tiles.length})`, s.tiles);
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
// --- 5) Лентата остава и след като бележките станат 2 (прагът вече е 1) ----------------------
ok(await closeNoteByX('BAR3'), 'прозорецът на третата бележка се затваря през своя X');
await waitOpenCount(2);
await settle();
s = await barState();
ok(!hidden(s) && s.tiles.length === 2,
    `при 2 отворени бележки лентата остава видима с 2 плочки (display ${s.display}, ${s.tiles.length})`, s);

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
// Смяна на настройката „Single note" през ИСТИНСКИЯ чекбокс от настройките (същият път като клик
// на потребителя): checked + change, без модалът да трябва да е отворен на екрана.
// В истинското приложение настройките се инициализират още при старт (createSettingsUI в startApp),
// но в теста стартът спира на мрежовите заявки и слушателят на чекбокса още не е сложен - затова
// тук UI-ът на настройките се създава изрично. Чекбоксът и слушателят са истинските.
const ensureSettingsUI = () => page.evaluate(async () => {
    try { await createSettingsUI([], false); } catch (e) { }
    const body = document.getElementById('settings-modal-body');
    return !!body && body.dataset.initializedListeners === 'true';
});
const setSingleNote = (on) => page.evaluate((on) => {
    const cb = document.getElementById('single-note-mode-checkbox');
    if (!cb) return false;
    cb.checked = on;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}, on);

// Избутването на плаващите бутони: класът на body и височината в --open-notes-bar-h.
const liftState = () => page.evaluate(() => ({
    cls: document.body.classList.contains('open-notes-bar-visible'),
    h: getComputedStyle(document.documentElement).getPropertyValue('--open-notes-bar-h').trim(),
}));

// --- 7) Режим „единична бележка": лентата НЕ се показва ---------------------------------------
// Собственикът (25.10.2026): „при включена настройка Single note лентата е излишно да се показва" -
// режимът държи една бележка, значи лентата няма какво да показва.
for (const key of ['photo', 'bread', 'plan']) await openNote(key);
await settle();
s = await barState();
ok(!hidden(s) && s.tiles.length === 3,
    `преди включването на режима: 3 отворени бележки и видима лента (display ${s.display}, ${s.tiles.length} плочки)`, s);

// Настройките се инициализират още при старт в истинското приложение; в теста стартът спира на
// мрежовите заявки и слушателят на чекбокса още не е сложен - затова UI-ът се създава тук.
const settingsReady = await ensureSettingsUI();
ok(settingsReady, 'настройките са инициализирани - чекбоксът Single note носи истинския си слушател');

const cbFound = await setSingleNote(true);
const modeNow = await page.evaluate(() => localStorage.getItem('singleNoteMode'));
ok(cbFound, 'чекбоксът #single-note-mode-checkbox е на страницата - режимът се включва през него');
ok(modeNow === 'true', `включването на режима записа настройката (singleNoteMode=${modeNow})`);
await settle();
s = await barState();
const liftOff = await liftState();
ok((await windowsState()).open.length === 3, 'трите бележки остават отворени и в режим „единична бележка"');
ok(hidden(s), `при включен Single note лентата не се показва (display ${s.display})`, s);
ok(!liftOff.cls && parseFloat(liftOff.h || '0') === 0,
    `избутването на плаващите бутони е върнато (клас ${liftOff.cls}, --open-notes-bar-h ${liftOff.h})`, liftOff);

tick('7а) лентата при включен Single note');
// --- 7б) Изключването на режима връща лентата веднага, без презареждане -----------------------
await setSingleNote(false);
await settle();
s = await barState();
const liftOn = await liftState();
ok(!hidden(s) && s.tiles.length === 3,
    `след изключване на режима лентата се връща веднага (display ${s.display}, ${s.tiles.length} плочки)`, s);
ok(liftOn.cls && parseFloat(liftOn.h || '0') > 0,
    `и плаващите бутони се качват пак над нея (клас ${liftOn.cls}, --open-notes-bar-h ${liftOn.h})`, liftOn);

tick('7б) връщане при изключване');
// --- 7в) Включването на режима ЗАТВАРЯ скритите бележки ---------------------------------------
// Лентата е ЕДИНСТВЕНИЯТ път да върнеш скрита бележка, а в режима тя я няма - затова включването
// затваря скритите (closeHiddenNoteWindows), вместо да ги върне на екрана. Собственикът
// (25.10.2026): „Включването на режима връща скритите бележки на екрана - не, в този режим не може
// да има много бележки, така че да не ги връща, а да ги затваря".
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
const wsHid = await windowsState();
ok(wsHid.open.length === 3 && wsHid.open.every(w => w.hidden),
    `в изключен режим „скрий всички" скри 3 бележки (${wsHid.open.filter(w => w.hidden).length})`, wsHid.open.map(w => w.hidden));

await setSingleNote(true);
// Затварянето минава през същия преход като X, затова се чака броят да падне до нула.
await waitOpenCount(0);
await settle();
const wsClosedByMode = await windowsState();
s = await barState();
ok(wsClosedByMode.open.length === 0,
    `включването на режима затвори скритите бележки, вместо да ги върне (отворени ${wsClosedByMode.open.length})`, wsClosedByMode);
const leftOpen = await page.evaluate(() => ({
    visible: document.querySelectorAll('.note-window.visible').length,
    hiddenOnes: document.querySelectorAll('.note-window.note-window-hidden').length,
}));
ok(leftOpen.visible === 0 && leftOpen.hiddenOnes === 0,
    `нито един прозорец не остана отворен или скрит (видими ${leftOpen.visible}, скрити ${leftOpen.hiddenOnes})`, leftOpen);
ok(hidden(s), `и лентата остава скрита в режима (display ${s.display})`, s);

await setSingleNote(false);
await settle();
s = await barState();
// Плочка има само за ОТВОРЕНА бележка: затворените не получават жива плочка, тоест не се връщат
// и през лентата.
const liveTiles = s.tiles.filter(t => t.winBg !== null);
ok(liveTiles.length === 0,
    `след изключване на режима няма плочка за затворените бележки (живи ${liveTiles.length} от ${s.tiles.length})`, s.tiles);
ok(hidden(s), `и лентата не се показва, щом няма отворена бележка (display ${s.display})`, s);

// Следващите части започват от същото състояние като преди: три отворени бележки и видима лента.
for (const key of ['photo', 'bread', 'plan']) await openNote(key);
await waitOpenCount(3);
await settle();
s = await barState();
ok(!hidden(s) && s.tiles.length === 3 && s.tiles.every(t => t.winBg !== null),
    `след ново отваряне на трите бележки лентата пак е видима с 3 плочки (display ${s.display}, ${s.tiles.length})`, s);

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
// От b2.83 плъзгане, започнало ВЪРХУ плочка, преподрежда лентата (виж open-notes-bar-drag.mjs) -
// затова това плъзгане тръгва от ФОНА между две плочки: то е само минаване по лентата и не бива нито
// да избира бележка, нито да мести плочки.
const beforeDrag = await windowsState();
const beforeOrder = await page.evaluate(() => [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')].map(t => t.dataset.barKey));
const box = await page.locator('#open-notes-bar .open-notes-bar-strip').boundingBox();
const stripMidY = box.y + box.height / 2;
const gapX = await page.evaluate(([x0, x1, y]) => {
    for (let x = Math.round(x0) + 2; x < Math.round(x1) - 2; x++) {
        const el = document.elementFromPoint(x, y);
        if (el && el.classList && el.classList.contains('open-notes-bar-strip')) return x;
        // Първият фон между две плочки е достатъчен.
        if (el && el.classList && el.classList.contains('open-notes-bar-tile')) continue;
    }
    return null;
}, [box.x, box.x + box.width, stripMidY]);
ok(gapX !== null, `има фон между плочките, от който да тръгне плъзгане по лентата (x ${gapX})`, { box, gapX });
if (gapX !== null) {
    await page.mouse.move(gapX, stripMidY);
    await page.mouse.down();
    await page.mouse.move(Math.max(4, gapX - 60), stripMidY, { steps: 12 });
    await page.mouse.up();
    await settle();
}
const afterDrag = await windowsState();
ok(afterDrag.activeGdid === beforeDrag.activeGdid,
    `плъзгане по лентата не сменя активната бележка (${beforeDrag.activeGdid} -> ${afterDrag.activeGdid})`, afterDrag);
const afterOrder = await page.evaluate(() => [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')].map(t => t.dataset.barKey));
ok(JSON.stringify(afterOrder) === JSON.stringify(beforeOrder),
    'плъзгане, започнало на фона на лентата, не мести плочките', { beforeOrder, afterOrder });

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
// --- 12) Лентата остава, докато има скрити бележки, а прагът за показване вече е 1 ------------
for (const g of ['BAR4', 'BAR5', 'BAR6', 'BAR7', 'BAR8']) await closeNoteByX(g);
await waitOpenCount(3);
await settle();
s = await barState();
ok((await windowsState()).open.length === 3 && !hidden(s),
    `пак са отворени 3 бележки и лентата се вижда (${s.tiles.length} плочки)`, s.tiles.length);

await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
ok((await windowsState()).open.every(w => w.hidden), 'трите бележки са скрити');
// Връщаме една по една: две показани, една скрита.
await page.locator('#open-notes-bar .open-notes-bar-tile').nth(0).click();
await settle();
await page.locator('#open-notes-bar .open-notes-bar-tile').nth(1).click();
await settle();
s = await barState();
let wsRule = await windowsState();
ok(wsRule.open.length === 3 && wsRule.open.filter(w => w.hidden).length === 1,
    `две бележки са показани, една остава скрита (${wsRule.open.map(w => w.hidden ? 'h' : 'v').join('')})`, wsRule.open.map(w => w.hidden));
ok(!hidden(s), `лентата е видима, макар отворените да са 3 и едната скрита (display ${s.display})`, s);

// Затваряме една от показаните: остават 2 отворени (1 скрита).
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
ok(!hidden(s) && s.tiles.length === 2,
    `при 2 показани бележки и нито една скрита лентата остава видима (display ${s.display}, ${s.tiles.length} плочки)`, s);

tick('до тук: 12) праг 1');
// --- 13) Лентата е над всеки прозорец и не е част от скрола на реда ------------------------
// Отваряме трета бележка (предишната част остави две отворени).
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
// Връщане на бележките и затваряне на ВСИЧКИ: лентата изчезва, бутоните слизат на първоначалното си
// място. Лентата вече се показва, докато има и една отворена бележка (прагът е 1), значи слиза от
// екрана едва когато не остане нито една - затова тук се затварят всички, а не се стига до две.
await page.setViewportSize({ width: 1280, height: 900 });
await settle();
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
const closedForReset = await closeAllOpenNotes();
await settle();
const wsReset = await windowsState();
ok(wsReset.open.length === 0, `за проверката за връщане няма отворени бележки (${wsReset.open.length})`,
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
await page.setViewportSize({ width: 1280, height: 900 });
await settle();
let flags = await bodyFlags();
let fab = await floaterState('kb-fab');
barR = await barRect();
// Основното място на иконата се мери БЕЗ отворена бележка: лентата вече се показва и при една
// (прагът е 1), значи „отворена бележка без лента" не се стига по нормалния път.
ok(!flags.bar && !flags.expanded && !flags.lift && fab.present,
    `изходно: без отворени бележки, без лента, без отстъп (${JSON.stringify(flags)})`, flags);
const fabOffsetPlain = fabOffset(fab);
ok(Math.abs(fabOffsetPlain - 10) <= 0.6,
    `без бележка в разпънат вид иконата е на 10px от долния ръб (${fabOffsetPlain})`, fab);

// а) ЕДНА отворена бележка: лентата вече е на екрана и е вдигнала иконата.
await openNote('photo');
await settle();
flags = await bodyFlags();
barR = await barRect();
const fabInBar = await floaterState('kb-fab');
const expectedOffset = 10 + numPx(barR.varH) + 8;
ok(flags.bar && !hidden(barR),
    `1 бележка → лентата е на екрана и вдига бутоните (${JSON.stringify(flags)})`, { flags, barR });
ok(Math.abs(fabOffset(fabInBar) - expectedOffset) <= 0.6,
    `лентата е вдигнала иконата с височината си + 8px (${fabOffset(fabInBar)} срещу ${expectedOffset})`, { fabInBar, barR });

// б) Разпъване при ВИДИМАТА лента: лентата вече я е вдигнала и втори отстъп (60px) не се дава.
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

// в) Свиване при видима лента: нищо не се размества, лентата продължава да я вдига.
ok(await clickExpand(), 'свиването минава при видима лента');
await settle();
flags = await bodyFlags();
fab = await floaterState('kb-fab');
ok(!flags.expanded && !flags.lift && flags.bar,
    `свито при видима лента: пак без отстъп, лентата я вдига (${JSON.stringify(flags)})`, flags);
ok(Math.abs(fabOffset(fab) - expectedOffset) <= 1.5,
    `иконата остава на ${expectedOffset}px от долния ръб (${fabOffset(fab)})`, fab);

// г) Отстъпът при разпъната бележка (b2.74) остава верен и когато лентата я няма на екрана: тогава
// иконата получава своите 60px, а щом лентата се върне, отстъпът изчезва и я вдига тя. Лентата
// слиза от екрана с ТОЧНО това, което прави и приложението (refreshOpenNotesBar →
// syncOpenNotesBarLift(false)).
ok(await clickExpand(), 'разпъването минава и за проверката с отстъпа');
await settle();
await page.evaluate(() => {
    const bar = document.getElementById('open-notes-bar');
    if (bar) bar.classList.remove('is-visible');
    syncOpenNotesBarLift(false);
});
await settle();
flags = await bodyFlags();
fab = await floaterState('kb-fab');
ok(flags.expanded && !flags.bar && flags.lift,
    `без лента при разпъната бележка иконата получава отстъпа (${JSON.stringify(flags)})`, flags);
ok(Math.abs(fabOffset(fab) - (fabOffsetPlain + 60)) <= 1.5,
    `без лента иконата отстъпва точно 60px (${fabOffset(fab)} срещу ${fabOffsetPlain + 60})`, { fab, fabOffsetPlain });
await page.evaluate(() => refreshOpenNotesBar());
await settle();
flags = await bodyFlags();
fab = await floaterState('kb-fab');
ok(flags.expanded && flags.bar && !flags.lift,
    `щом лентата се върне, отстъпът изчезва (${JSON.stringify(flags)})`, flags);
ok(Math.abs(fabOffset(fab) - expectedOffset) <= 1.5,
    `иконата пак е на ${expectedOffset}px, вдигната от лентата (${fabOffset(fab)})`, fab);
ok(await clickExpand(), 'свиването след това минава');
await settle();

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

// --- 19) Разпъната бележка при видима лента: долният ѝ ред свършва НАД лентата (b2.75) ------
// Собственикът (24.10.2026): „extended mode на бележката трябва да се съобразява с наличието на
// лента, защото бутоните на бележката се скриват зад нея (когато я има)“.
// Лентата е position: fixed в дъното и се рисува НАД прозорците, а разпънатата бележка беше висока
// 100% от екрана - значи редът с кръглите бутони (.modal-footer-toolbar) и редът с датата
// (.note-cal-row) под него оставаха зад лентата. Сега кутията свършва 8px над лентата.
// Мерките тук са от истинския екран: getBoundingClientRect + document.elementFromPoint, тоест
// проверява се какво ВСЪЩНОСТ стои под пръста, а не само числа от стилове.
const expandedBottomState = () => page.evaluate(() => {
    const list = getOpenNoteWindows();
    // Мерките са за РАЗПЪНАТИЯ прозорец, а не за активния: активен може да стане друг (затваряне на
    // съседна бележка го прави активна) и тогава проверката щеше да мери свит прозорец.
    const win = list.find(w => w.body.dataset.isExpanded === 'true')
        || list.find(w => w.el.classList.contains('note-window-active')) || list[0];
    const bar = document.getElementById('open-notes-bar');
    const round = v => Math.round(v * 10) / 10;
    if (!win) return { win: false, openCount: list.length };
    const box = win.box;
    const br = box.getBoundingClientRect();
    const barR = bar ? bar.getBoundingClientRect() : null;
    const toolbar = box.querySelector('.modal-footer-toolbar');
    const calRow = box.querySelector('.note-cal-row');
    const calVisible = !!calRow && !calRow.hidden
        && getComputedStyle(calRow).display !== 'none' && calRow.getBoundingClientRect().height > 0;
    const at = (el) => {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
            which: el.id || el.className,
            x: round(x), y: round(y), w: round(r.width), h: round(r.height),
            top: round(r.top), bottom: round(r.bottom),
            // Елемент на лентата под пръста значи, че бутонът е ЗАД лентата - точно оплакването.
            inBar: !!hit && !!hit.closest && !!hit.closest('#open-notes-bar'),
            // Иначе точката трябва да е върху самия елемент (или нещо в същата бележка).
            hitsSelf: !!hit && (hit === el || el.contains(hit) || (!!hit.closest && !!hit.closest('.note-window'))),
            hitDesc: hit ? (hit.id || hit.className || hit.tagName) : null,
        };
    };
    const buttons = toolbar ? [...toolbar.querySelectorAll('.modal-footer-btn')].map(at) : [];
    return {
        win: true,
        openCount: list.length,
        gdid: win.body.dataset.gdid || '',
        expanded: win.body.dataset.isExpanded === 'true',
        bodyExpanded: document.body.classList.contains('modal-note-expanded'),
        bodyBar: document.body.classList.contains('open-notes-bar-visible'),
        boxTop: round(br.top), boxBottom: round(br.bottom), boxH: round(br.height),
        barVisible: !!bar && bar.classList.contains('is-visible') && getComputedStyle(bar).display !== 'none',
        barTop: barR ? round(barR.top) : null,
        barH: barR ? round(barR.height) : 0,
        varH: getComputedStyle(document.documentElement).getPropertyValue('--open-notes-bar-h').trim(),
        viewH: window.innerHeight, viewW: window.innerWidth,
        toolbar: toolbar ? at(toolbar) : null,
        calRow: calVisible ? at(calRow) : null,
        buttons,
    };
});

// Трите проверки на разпънатата бележка при видима лента - едни и същи на широк и на тесен екран.
const checkExpandedClearance = async (label) => {
    const st = await expandedBottomState();
    ok(st.win && st.expanded && st.bodyExpanded,
        `${label}: бележката е разпъната (${st.gdid}, isExpanded ${st.expanded}, клас на body ${st.bodyExpanded})`, st);
    ok(st.barVisible && st.bodyBar,
        `${label}: лентата е на екрана (${st.barTop}..${st.boxBottom})`, st);
    ok(!!st.toolbar && st.barTop !== null && st.toolbar.bottom <= st.barTop - 4,
        `${label}: редът с бутоните свършва НАД лентата (${st.toolbar && st.toolbar.bottom} <= ${st.barTop} - 4)`, st.toolbar);
    // Всеки кръгъл бутон се натиска: под центъра му НЕ стои елемент на лентата.
    const blocked = st.buttons.filter(b => b.inBar || !b.hitsSelf);
    ok(st.buttons.length >= 2 && blocked.length === 0,
        `${label}: всеки от ${st.buttons.length} бутона в долния ред е над лентата (${blocked.map(b => b.which + '@' + b.x + ',' + b.y + '→' + b.hitDesc).join(' | ') || 'нито един закрит'})`,
        { blocked, buttons: st.buttons });
    // Редът с датата е последният елемент в кутията - той е първият, който лентата закриваше.
    ok(!!st.calRow, `${label}: редът с датата е видим в разпънатата бележка (има какво да се закрие)`, st);
    if (st.calRow) {
        ok(st.calRow.bottom <= st.barTop - 4 && !st.calRow.inBar && st.calRow.hitsSelf,
            `${label}: редът с датата е изцяло над лентата (${st.calRow.bottom} <= ${st.barTop} - 4, под центъра: ${st.calRow.hitDesc})`,
            st.calRow);
    }
    return st;
};

// Три отворени бележки, последната със зададена дата - тя е активна, значи нея разпъваме.
const openThreeForClearance = async () => {
    const closed = await closeAllOpenNotes();
    await settle();
    for (const key of ['photo', 'bread', 'dated']) await openNote(key);
    await settle();
    return closed;
};

// Разпъването/свиването става през истинския бутон (стрелката в хедъра на активната бележка).
const waitExpandedClass = (want) => page.waitForFunction(
    (w) => document.body.classList.contains('modal-note-expanded') === w, want, { timeout: 3000 }).catch(() => { });

// Кутията на бележката влиза с „поп“ (transform: scale(0.7) → scale(1), 0.4s) - докато трае, мярката
// ѝ е по-малка и по-навътре от истинската, тоест проверката за пролука лъже. Затова се чака
// ИЗЧИСЛЕНИЯТ transform да е точно единичен (или none), вместо да се спи фиксирано време.
const waitBoxSettled = () => page.waitForFunction(() => {
    const list = getOpenNoteWindows();
    const win = list.find(w => w.body.dataset.isExpanded === 'true')
        || list.find(w => w.el.classList.contains('note-window-active')) || list[0];
    if (!win || !win.box) return true;
    const t = getComputedStyle(win.box).transform;
    if (!t || t === 'none') return true;
    const m = /^matrix\(([^)]+)\)$/.exec(t);
    if (!m) return true;
    const p = m[1].split(',').map(Number);
    return Math.abs(p[0] - 1) < 0.002 && Math.abs(p[3] - 1) < 0.002 && Math.abs(p[5]) < 0.5;
}, null, { timeout: 3000 }).catch(() => { });
const settleAll = async () => { await settle(); await waitBoxSettled(); await settle(); };

// Един пълен кръг на един екран: разпъване при видима лента, свиване, пак разпъване и изчезване на
// лентата от екрана.
const clearanceScenario = async (label, view) => {
    await page.setViewportSize(view);
    await settle();
    ok(await openThreeForClearance(), `${label}: затворено е старото и са отворени 3 бележки`);
    await settleAll();
    let st = await expandedBottomState();
    ok(st.openCount === 3 && st.barVisible && !st.expanded,
        `${label}: изходно 3 бележки, лентата е видима, бележката е свита (${st.openCount}, ${st.barTop})`, st);
    ok(Math.abs(st.viewW - view.width) <= 1 && Math.abs(st.viewH - view.height) <= 1,
        `${label}: екранът е ${view.width}x${view.height} (${st.viewW}x${st.viewH})`, st);
    const collapsedBottom = st.boxBottom;

    // а) Разпъване при ВИДИМА лента: цялата кутия свършва над нея.
    ok(await clickExpand(), `${label}: разпъването минава през бутона в хедъра при видима лента`);
    await waitExpandedClass(true);
    await settleAll();
    st = await checkExpandedClearance(label);
    ok(Math.abs(st.boxBottom - (st.barTop - 8)) <= 2,
        `${label}: кутията свършва с 8px пролука над лентата (${st.boxBottom} срещу ${st.barTop - 8})`, st);

    // б) Свиване при ВИДИМА лента: долният ръб се връща точно на мястото си - без остатъчна пролука.
    ok(await clickExpand(), `${label}: свиването минава през същия бутон`);
    await waitExpandedClass(false);
    await settleAll();
    st = await expandedBottomState();
    ok(!st.expanded && !st.bodyExpanded, `${label}: бележката е свита (isExpanded ${st.expanded})`, st);
    ok(Math.abs(st.boxBottom - collapsedBottom) <= 4,
        `${label}: долният ръб на кутията се върна на мястото отпреди разпъването (${st.boxBottom} срещу ${collapsedBottom})`,
        { st, collapsedBottom });

    // в) Пак разпъване, а после лентата слиза от екрана: бележката си връща цялата височина.
    // Лентата вече се показва, докато има и една отворена бележка (собственикът, 25.10.2026), значи
    // „лентата я няма, а бележката е отворена" не се стига със затваряне на бележки. Затова тук се
    // прави ТОЧНО това, което прави и приложението, когато лентата слиза (refreshOpenNotesBar →
    // syncOpenNotesBarLift(false)): класът is-visible се маха и променливата се връща на 0px.
    ok(await clickExpand(), `${label}: разпъването минава втори път`);
    await waitExpandedClass(true);
    await settleAll();
    st = await checkExpandedClearance(label + ' (второ разпъване)');
    await page.evaluate(() => {
        const bar = document.getElementById('open-notes-bar');
        if (bar) bar.classList.remove('is-visible');
        syncOpenNotesBarLift(false);
    });
    await settleAll();
    st = await expandedBottomState();
    ok(!st.barVisible && !st.bodyBar,
        `${label}: лентата слиза от екрана (класът на body го няма: ${st.bodyBar})`, st);
    ok(numPx(st.varH) === 0, `${label}: променливата с височината на лентата се върна на 0px (${st.varH})`, st);
    ok(st.expanded && Math.abs(st.boxBottom - st.viewH) <= 1.5,
        `${label}: разпънатата бележка пак стига до долния ръб на екрана (${st.boxBottom} срещу ${st.viewH})`, st);
    ok(Math.abs(st.boxH - st.viewH) <= 1.5,
        `${label}: височината ѝ е пак цялата (${st.boxH} срещу ${st.viewH})`, st);
    // И долният ред вече не е ограничен от нищо: стига до дъното на кутията.
    ok(!!st.toolbar && st.toolbar.bottom <= st.viewH + 0.5,
        `${label}: редът с бутоните е на дъното на екрана, без остатъчна пролука (${st.toolbar && st.toolbar.bottom} <= ${st.viewH})`, st.toolbar);
    // Връщане на лентата (по същия път, по който се появява): бележката пак свършва над нея.
    await page.evaluate(() => refreshOpenNotesBar());
    await settleAll();
    st = await checkExpandedClearance(label + ' (лентата се връща)');
    ok(Math.abs(st.boxBottom - (st.barTop - 8)) <= 2,
        `${label}: щом лентата се върне, кутията пак свършва 8px над нея (${st.boxBottom} срещу ${st.barTop - 8})`, st);
    ok(await clickExpand(), `${label}: свиването след това минава`);
    await waitExpandedClass(false);
    await settle();
};

tick('19a) подготовка');
await clearanceScenario('широк екран', { width: 1280, height: 900 });
tick('19b) 1280x900');
await clearanceScenario('телефон', { width: 390, height: 844 });
tick('19c) 390x844');
await page.setViewportSize({ width: 1280, height: 900 });
await settle();
tick('до тук: 19) разпъната бележка над лентата');

// --- 19д) Същите мерки при ЕДНА отворена бележка (b2.78) -------------------------------------
// Собственикът (25.10.2026): „лентата вече се показва веднага при 1 отворена бележка, не при 3".
// Значи разпънатата бележка и иконката на Ko-fi трябва да стоят НАД лентата точно както при три.
const oneNoteClearance = async (label, view) => {
    await page.setViewportSize(view);
    await settle();
    ok(await closeAllOpenNotes(), `${label}: изходно няма отворени бележки`);
    await openNote('dated');
    await settleAll();
    let st = await expandedBottomState();
    ok(st.openCount === 1 && st.barVisible && !st.expanded,
        `${label}: една отворена бележка, лентата е видима, бележката е свита (${st.openCount}, лента от ${st.barTop})`, st);
    ok(await clickExpand(), `${label}: разпъването минава при една отворена бележка`);
    await waitExpandedClass(true);
    await settleAll();
    st = await checkExpandedClearance(label);
    ok(Math.abs(st.boxBottom - (st.barTop - 8)) <= 2,
        `${label}: кутията свършва с 8px пролука над лентата (${st.boxBottom} срещу ${st.barTop - 8})`, st);
    // Иконката на Ko-fi се качва със СЪЩАТА променлива --open-notes-bar-h: контейнерът със същите
    // класове се мери срещу върха на лентата (истинският widget се проверява в kofi-widget.mjs).
    const kofi = await kofiState();
    ok(kofi.above, `${label}: иконката на Ko-fi стои НАД лентата (${kofi.rectBottom} <= ${kofi.barTop})`, kofi);
    ok(Math.abs(kofi.bottom - (12 + numPx(st.varH) + 8)) <= 0.6,
        `${label}: контейнерът на Ko-fi е вдигнат с височината на лентата + 8px (${kofi.bottom} срещу ${12 + numPx(st.varH) + 8})`,
        { kofi, varH: st.varH });
    await removeKofiStub();
    ok(await clickExpand(), `${label}: свиването минава`);
    await waitExpandedClass(false);
    await settle();
};
tick('19д) подготовка');
await oneNoteClearance('една бележка на 1280x900', { width: 1280, height: 900 });
tick('19д) 1280x900');
await oneNoteClearance('една бележка на 390x844', { width: 390, height: 844 });
tick('до тук: 19д) една бележка над лентата');
await page.setViewportSize({ width: 1280, height: 900 });
await settle();

tick('20) подготовка');
// --- 20) Клик на плочката на активната бележка я скрива, втори клик я показва (b2.77) ---------
// Собственикът (24.10.2026): „ако имаме лента и кликнем бутона на активната бележка веднъж - тя да
// се скрива, втори път - показва се". Досега клик на плочка само активираше бележката, значи клик
// върху плочката на ВЕЧЕ активната не правеше нищо видимо. Тук се проверява по истинския път:
// истински кликове с показалеца върху плочките и истински прозорци (showModal).
await page.setViewportSize({ width: 1280, height: 900 });
await settle();
ok(await closeAllOpenNotes(), '20) изходно: няма отворени бележки');
for (const key of ['bread', 'plan', 'call']) await openNote(key);
await settle();
s = await barState();
let ws20 = await windowsState();
ok(ws20.open.length === 3 && !hidden(s) && s.tiles.length === 3,
    `20) три бележки са отворени, лентата е видима с 3 плочки (${ws20.open.length}, display ${s.display})`, s.tiles.map(t => t.key));

// Плочка по gdid: редът в лентата следва getOpenNoteWindows(), затова индексът се търси по ключа.
const tileIndexFor = async (gdid) => (await barState()).tiles.findIndex(t => (t.key || '').includes(gdid));
const clickTile = async (gdid) => {
    const idx = await tileIndexFor(gdid);
    if (idx < 0) return false;
    await page.locator('#open-notes-bar .open-notes-bar-tile').nth(idx).click();
    await settle();
    return true;
};
const winOf = (ws, gdid) => ws.open.find(w => w.gdid === gdid) || null;
const tileStateOf = async (gdid) => {
    const st = await barState();
    const t = st.tiles.find(x => (x.key || '').includes(gdid));
    return t || null;
};
// Състоянието на един прозорец, прочетено в самата страница: класът note-window-hidden, display и
// дали наистина се вижда на екрана (мярката на кутията).
const winProbe = (gdid) => page.evaluate((g) => {
    const w = getOpenNoteWindows().find(x => x.body.dataset.gdid === g);
    if (!w) return { present: false };
    const r = w.box.getBoundingClientRect();
    return {
        present: true,
        hidden: !!w.hidden,
        hidClass: w.el.classList.contains('note-window-hidden'),
        display: getComputedStyle(w.el).display,
        active: w.el.classList.contains('note-window-active'),
        z: Number(w.el.style.zIndex) || 0,
        boxH: Math.round(r.height),
    };
}, gdid);

// Клик на плочката на ДРУГА (неактивна) видима бележка: старото поведение - става активна и идва
// най-отпред. Така активната бележка е известна преди превключването.
ok(await clickTile('BAR2'), '20) клик на плочката на BAR2 минава');
ws20 = await windowsState();
ok(ws20.activeGdid === 'BAR2' && winOf(ws20, 'BAR2').z === ws20.maxZ && (await tileStateOf('BAR2')).active,
    `20) клик на плочка на друга видима бележка я прави активна и най-отпред (${ws20.activeGdid}, z ${winOf(ws20, 'BAR2').z} от ${ws20.maxZ})`, ws20.open);

// --- Първи клик на плочката на активната: бележката се скрива -------------------------------
ok(await clickTile('BAR2'), '20) клик на плочката на активната бележка BAR2 минава');
s = await barState();
ws20 = await windowsState();
const p20hidden = await winProbe('BAR2');
ok(p20hidden.hidden === true && p20hidden.hidClass === true,
    `20) клик на плочката на активната бележка я скрива (hidden ${p20hidden.hidden}, клас ${p20hidden.hidClass})`, p20hidden);
ok(p20hidden.display === 'none' && p20hidden.boxH === 0,
    `20) скритият прозорец не се вижда (display ${p20hidden.display}, височина ${p20hidden.boxH})`, p20hidden);
const t20hidden = await tileStateOf('BAR2');
// Приглушаването е с преход (opacity 1 -> 0.55), значи тук се проверява КЛАСЪТ, а не междинната
// стойност; самата непрозрачност се мери в част 10, след като преходът е свършил.
ok(!!t20hidden && t20hidden.hiddenTile === true && t20hidden.active === false,
    `20) плочката на скритата бележка получава is-hidden и вече не е откроена (is-hidden ${t20hidden && t20hidden.hiddenTile}, is-active ${t20hidden && t20hidden.active})`, t20hidden);
const p20others = [await winProbe('BAR3'), await winProbe('BAR4')];
ok(p20others.every(p => p.hidden === false && p.hidClass === false && p.display !== 'none' && p.boxH > 0),
    `20) другите две бележки остават видими (${p20others.map(p => p.hidden ? 'h' : 'v').join('')})`, p20others);
ok(ws20.open.length === 3 && !hidden(s) && s.tiles.length === 3,
    `20) скриването не затваря бележката и лентата остава (отворени ${ws20.open.length}, плочки ${s.tiles.length})`, ws20.open.map(w => w.hidden));
// „Активна, но невидима" бележка би поела клавиатурния вход и писането - активността минава към
// друга ВИДИМА бележка, без да я вдига отпред.
ok(ws20.activeGdid !== 'BAR2' && ws20.activeGdid !== ''
    && (winOf(ws20, ws20.activeGdid) || {}).hidden === false,
    `20) активността минава към друга ВИДИМА бележка (${ws20.activeGdid})`, ws20.open);
ok(s.hideBtn.mode === 'hide' && /Скрий всички бележки/.test(s.hideBtn.title || ''),
    `20) бутонът „скрий/покажи всички" не сменя ролята си, щом не всички са скрити (mode ${s.hideBtn.mode})`, s.hideBtn);

// --- Втори клик на СЪЩАТА плочка: бележката се връща на екрана и става активна --------------
ok(await clickTile('BAR2'), '20) втори клик на същата плочка минава');
s = await barState();
ws20 = await windowsState();
const p20back = await winProbe('BAR2');
ok(p20back.hidden === false && p20back.hidClass === false && p20back.display !== 'none' && p20back.boxH > 0,
    `20) вторият клик връща бележката на екрана (hidden ${p20back.hidden}, display ${p20back.display}, височина ${p20back.boxH})`, p20back);
const t20back = await tileStateOf('BAR2');
ok(!!t20back && t20back.hiddenTile === false && t20back.active === true,
    `20) плочката вече не е приглушена и отново е откроена (is-hidden ${t20back && t20back.hiddenTile}, is-active ${t20back && t20back.active})`, t20back);
ok(p20back.active === true && ws20.activeGdid === 'BAR2' && p20back.z === ws20.maxZ,
    `20) върнатата бележка е активна и най-отпред (${ws20.activeGdid}, z ${p20back.z} от ${ws20.maxZ})`, ws20.open);
ok(ws20.open.length === 3 && ws20.open.every(w => w.hidden === false),
    `20) след връщането и трите бележки са видими (${ws20.open.map(w => w.hidden ? 'h' : 'v').join('')})`, ws20.open.map(w => w.hidden));

// --- Клик на плочката на СКРИТА бележка я показва и я прави активна --------------------------
// Скрива се активната, активна става друга видима, и чак после се кликва плочката на скритата -
// тоест вторият клик стига до пътя за скрита бележка, а не до превключването.
ok(await clickTile('BAR2'), '20) BAR2 се скрива пак с клик на плочката си');
ws20 = await windowsState();
ok((await winProbe('BAR2')).hidden === true && ws20.activeGdid !== 'BAR2',
    `20) BAR2 е скрита, активна е друга бележка (${ws20.activeGdid})`, ws20.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')));
// Видима, но НЕактивна бележка: клик на плочката ѝ я активира (старото поведение не е счупено).
const otherVisible = (ws20.open.find(w => !w.hidden && w.gdid !== ws20.activeGdid) || {}).gdid;
ok(!!otherVisible && await clickTile(otherVisible), `20) клик на плочката на другата видима бележка (${otherVisible}) минава`);
ws20 = await windowsState();
ok(ws20.activeGdid === otherVisible && winOf(ws20, otherVisible).hidden === false
    && winOf(ws20, otherVisible).z === ws20.maxZ && (await winProbe('BAR2')).hidden === true,
    `20) клик на плочка на друга видима бележка я активира и вдига, а скритата си остава скрита (active ${ws20.activeGdid})`, ws20.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')));
ok(await clickTile('BAR2'), '20) клик на плочката на СКРИТАТА BAR2 минава');
ws20 = await windowsState();
const p20shown = await winProbe('BAR2');
ok(p20shown.hidden === false && p20shown.display !== 'none' && p20shown.active === true && p20shown.z === ws20.maxZ,
    `20) скрита бележка се показва и става активна от клик на плочката си (hidden ${p20shown.hidden}, active ${p20shown.active}, z ${p20shown.z} от ${ws20.maxZ})`, p20shown);
ok(ws20.open.length === 3 && ws20.open.every(w => w.hidden === false),
    `20) и трите бележки са видими след това (${ws20.open.map(w => w.hidden ? 'h' : 'v').join('')})`, ws20.open.map(w => w.hidden));

// --- Плъзгане по лентата не скрива и не показва нищо ----------------------------------------
// Показалецът натиска ВЪРХУ плочка, минава повече от 6px и пуска пак върху нея: това е плъзгане,
// а не клик - значи превключването не бива да се задейства (иначе плъзгането по лентата щеше да
// крие бележки). Показалецът идва през истинския вход на браузъра, не през изкуствено събитие.
const ws20BeforeDrag = await windowsState();
const s20BeforeDrag = await barState();
const dragIdx = s20BeforeDrag.tiles.findIndex(t => (t.key || '').includes(ws20BeforeDrag.activeGdid));
const dragBox = await page.locator('#open-notes-bar .open-notes-bar-tile').nth(dragIdx).boundingBox();
await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
await page.mouse.down();
await page.mouse.move(dragBox.x + dragBox.width / 2 + 12, dragBox.y + dragBox.height / 2, { steps: 8 });
await page.mouse.up();
await settle();
const ws20AfterDrag = await windowsState();
const p20afterDrag = await winProbe(ws20BeforeDrag.activeGdid);
const t20afterDrag = await tileStateOf(ws20BeforeDrag.activeGdid);
ok(ws20AfterDrag.activeGdid === ws20BeforeDrag.activeGdid && p20afterDrag.hidden === false
    && ws20AfterDrag.open.every(w => w.hidden === false),
    `20) плъзгане по лентата не скрива бележка (active ${ws20BeforeDrag.activeGdid} -> ${ws20AfterDrag.activeGdid}, hidden ${p20afterDrag.hidden})`,
    { before: ws20BeforeDrag.activeGdid, after: ws20AfterDrag.activeGdid });
ok(!!t20afterDrag && t20afterDrag.hiddenTile === false && !(await hidden(await barState())),
    '20) нито една плочка не става is-hidden от плъзгане и лентата остава видима', t20afterDrag);

// --- 20б) Последната ВИДИМА бележка: активността остава, лентата не изчезва ------------------
// Когато друга видима бележка няма, активността не се мести (същото като „скрий всички") - иначе
// getTopNoteWindow() връща и скритите и активна щеше да стане невидима бележка.
// Тук трите се скриват една по една през плочките им и се гледа какво остава.
for (let i = 0; i < 3; i++) {
    const activeG = (await windowsState()).activeGdid;
    ok(!!activeG && await clickTile(activeG), `20б) клик на плочката на активната ${activeG} (${i + 1}/3) минава`);
    ok((await winProbe(activeG)).hidden === true, `20б) ${activeG} се скри от клик на плочката си (${i + 1}/3)`);
}
s = await barState();
ws20 = await windowsState();
const activeCount20 = await page.evaluate(() => getOpenNoteWindows().filter(w => w.el.classList.contains('note-window-active')).length);
ok(ws20.open.length === 3 && ws20.open.every(w => w.hidden === true),
    `20б) и трите бележки са скрити, но нито една не е затворена (${ws20.open.map(w => w.hidden ? 'h' : 'v').join('')})`, ws20.open);
ok(activeCount20 === 1,
    `20б) активна остава точно една бележка, както при „скрий всички" (${activeCount20})`, activeCount20);
ok(!hidden(s) && s.tiles.length === 3 && s.tiles.every(t => t.hiddenTile),
    `20б) лентата остава с три приглушени плочки (display ${s.display})`, s.tiles.map(t => t.hiddenTile));
ok(s.hideBtn.mode === 'show' && /Покажи всички бележки/.test(s.hideBtn.title || ''),
    `20б) щом всички са скрити, бутонът става „покажи всички" (mode ${s.hideBtn.mode})`, s.hideBtn);
// И обратно: клик на скрита плочка връща точно нея - вторият клик от превключването.
const lastHiddenG = ws20.open[0].gdid;
ok(await clickTile(lastHiddenG), `20б) клик на плочката на скритата ${lastHiddenG} минава`);
ws20 = await windowsState();
ok(ws20.open.filter(w => !w.hidden).length === 1 && (await winProbe(lastHiddenG)).active === true,
    `20б) връща се само тя и става активна (${ws20.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).join(' ')})`, ws20.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')));

tick('до тук: 20) превключване от плочка');

// --- 21) Дълго натискане на плочка само ВДИГА плочката, без да затваря бележката (b2.85) --------
// Собственикът (25.10.2026): „Продължително натискане само за местене, не затваря". Досега
// задържането минаваше по пътя на хиксчето (activateNoteWindow + .modal-close) и затваряше бележката,
// а местенето искаше бързо хоризонтално плъзгане ≥10px - двете се биеха. Сега задържане 500ms и
// пускане без движение НЕ затваря и НЕ показва/скрива нищо: плочката само се вдига (is-dragging) и се
// въоръжава за местене (_longPressArmed), а след пускането слиза долу.
// Затварянето остава само през хиксчето на бележката - затова тук се броят и кликовете по .modal-close.
// Жестът се пуска с истински touch събития (Touch конструктора): същите слушатели
// touchstart/touchmove/touchend, които ползва приложението, с истинско изчакване на 500ms.
const tileGesture = (gdid, { holdMs = 620, moveDx = 0 } = {}) => page.evaluate(async ([gdid, holdMs, moveDx]) => {
    const tile = [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')]
        .find(t => (t.dataset.barKey || '').includes(gdid));
    if (!tile) return { started: false };
    const r = tile.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const make = (type, x, y) => {
        const touch = new Touch({ identifier: 11, target: tile, clientX: x, clientY: y });
        const active = type === 'touchend' ? [] : [touch];
        return new TouchEvent(type, { bubbles: true, cancelable: true, touches: active, targetTouches: active, changedTouches: [touch] });
    };
    // Състоянието на плочката, прочетено в самата страница: вдигната ли е (is-dragging), въоръжена ли
    // е за местене (_longPressArmed) и дали следващият click ще бъде прескочен (_longPressTriggered).
    const read = () => ({
        lifted: tile.classList.contains('is-dragging'),
        armed: !!tile._longPressArmed,
        triggered: !!tile._longPressTriggered,
    });
    tile.dispatchEvent(make('touchstart', cx, cy));
    if (moveDx) tile.dispatchEvent(make('touchmove', cx + moveDx, cy));
    await new Promise(res => setTimeout(res, holdMs));
    // Пръстът е още върху плочката: тук се вижда какво е направило задържането, преди пускането.
    const held = read();
    // touchend се пуска върху СЪЩИЯ елемент - точно както браузърът праща събитието на елемента, върху
    // който е започнало докосването.
    tile.dispatchEvent(make('touchend', cx, cy));
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    return { started: true, stillInBar: tile.isConnected, held, after: read() };
}, [gdid, holdMs, moveDx]);

// Колко пъти се ВИЖДАТ на екрана и какъв е броят на отворените. Класът 'visible' го имат всички
// отворени (скритата бележка пази класа и получава note-window-hidden), затова „видима" се брои по
// истинското състояние: не е скрита и се вижда (display + мярка).
const windowsSeen = () => page.evaluate(() => {
    const open = getOpenNoteWindows();
    return {
        open: open.length,
        visible: open.filter(w => !w.hidden && getComputedStyle(w.el).display !== 'none'
            && w.box.getBoundingClientRect().height > 0).length,
        hidden: open.filter(w => !!w.hidden).length,
        gdids: open.map(w => w.body.dataset.gdid || ''),
    };
});

// Стартът на тази част: BAR2 е видима и активна, BAR3 и BAR4 са скрити (края на 20б).
{
    const start = await windowsSeen();
    ok(start.open === 3 && start.visible === 1 && start.gdids.includes('BAR3'),
        `21) изходно: три отворени бележки, една видима (${start.open}/${start.visible}: ${start.gdids.join(' ')})`, start);

    // Брояч на кликовете по хиксчето на бележка (.modal-close): с него се доказва, че задържането вече
    // НЕ минава по пътя на затварянето.
    await page.evaluate(() => {
        window.__modalCloseClicks = 0;
        document.addEventListener('click', (e) => {
            const el = e.target && e.target.closest ? e.target.closest('.modal-close') : null;
            if (el) window.__modalCloseClicks++;
        }, true);
    });
    const closeClicks = () => page.evaluate(() => window.__modalCloseClicks || 0);

    // Контрола: обикновен клик още вдига и скрива - задържането не е заменило клика.
    ok(await clickTile('BAR4'), '21) контрола: клик на плочката на скритата BAR4 минава');
    const shown = await winProbe('BAR4');
    ok(shown.hidden === false && shown.display !== 'none' && shown.boxH > 0,
        `21) контрола: обикновен клик показва бележката (hidden ${shown.hidden}, display ${shown.display})`, shown);
    ok((await windowsSeen()).open === 3, '21) контрола: кликът не е затворил нищо');
    ok(await clickTile('BAR4'), '21) контрола: втори клик на същата плочка минава');
    const hiddenAgain = await winProbe('BAR4');
    ok(hiddenAgain.hidden === true && (await windowsSeen()).open === 3,
        `21) контрола: вторият клик я скрива, без да я затваря (hidden ${hiddenAgain.hidden}, отворени ${(await windowsSeen()).open})`, hiddenAgain);

    // Плъзгане по лентата (touchmove преди 500ms) НЕ вдига плочката и не затваря бележка - плочката е в
    // ред с хоризонтален скрол и лекото местене на пръста не бива да се брои за задържане.
    const dragged = await tileGesture('BAR4', { moveDx: 14 });
    ok(dragged.started, '21) плъзгане: жестът върху плочката на BAR4 минава', dragged);
    ok(dragged.held.lifted === false && dragged.held.armed === false,
        `21) touchmove преди 500ms не вдига плочката (is-dragging ${dragged.held.lifted}, въоръжена ${dragged.held.armed})`, dragged.held);
    const afterDrag = await windowsSeen();
    const dragProbe = await winProbe('BAR4');
    ok(afterDrag.open === 3 && dragProbe.present === true,
        `21) touchmove преди 500ms не затваря бележката (отворени ${afterDrag.open}, BAR4 ${dragProbe.present ? 'стои' : 'липсва'})`, { afterDrag, dragProbe });

    // Задържане на СКРИТА плочка: плочката се вдига и се въоръжава за местене, но нищо не се затваря,
    // нищо не се показва и хиксчето на бележката не се пипа.
    const beforeHiddenPress = await windowsSeen();
    const closeBeforeHidden = await closeClicks();
    const press3 = await tileGesture('BAR3');
    ok(press3.started, '21) задържане: жестът върху плочката на скритата BAR3 минава', press3);
    ok(press3.held.lifted === true && press3.held.armed === true,
        `21) по време на задържането плочката е вдигната и въоръжена (is-dragging ${press3.held.lifted}, въоръжена ${press3.held.armed})`, press3.held);
    const afterHiddenPress = await windowsSeen();
    const probe3 = await winProbe('BAR3');
    const tile3 = await tileStateOf('BAR3');
    const closeAfterHidden = await closeClicks();
    ok(closeAfterHidden === closeBeforeHidden,
        `21) задържането НЕ вика хиксчето на бележката (кликове по .modal-close ${closeBeforeHidden} -> ${closeAfterHidden})`, { closeBeforeHidden, closeAfterHidden });
    ok(probe3.present === true && probe3.hidden === true,
        `21) бележката остава отворена и още скрита (present ${probe3.present}, hidden ${probe3.hidden})`, probe3);
    ok(afterHiddenPress.open === beforeHiddenPress.open && afterHiddenPress.gdids.includes('BAR3'),
        `21) броят на отворените прозорци не се променя (${beforeHiddenPress.open} -> ${afterHiddenPress.open}: ${afterHiddenPress.gdids.join(' ')})`, { beforeHiddenPress, afterHiddenPress });
    ok(afterHiddenPress.visible === beforeHiddenPress.visible,
        `21) и нито един прозорец не се показва (видими ${beforeHiddenPress.visible} -> ${afterHiddenPress.visible})`, { beforeHiddenPress, afterHiddenPress });
    ok(!!tile3 && tile3.dragging === false && tile3.armed === false,
        `21) след пускането плочката слиза долу и въоръжаването се нулира (is-dragging ${tile3 && tile3.dragging}, въоръжена ${tile3 && tile3.armed})`, tile3);
    ok(!!tile3 && tile3.hiddenTile === true,
        `21) плочката на скритата бележка си стои в лентата (${tile3 && tile3.key})`, tile3);

    // Задържане на АКТИВНАТА ВИДИМА плочка: също нищо не се затваря и не се скрива, а активността
    // остава при нея (кликът след пускането не бива да я скрие).
    const activeNow = (await windowsState()).activeGdid;
    const beforeVisible = await windowsSeen();
    const closeBeforeVisible = await closeClicks();
    const pressActive = await tileGesture(activeNow);
    const activeTile = await tileStateOf(activeNow);
    const probeActive = await winProbe(activeNow);
    const afterVisible = await windowsSeen();
    const closeAfterVisible = await closeClicks();
    ok(pressActive.held.lifted === true && pressActive.held.armed === true,
        `21) на активната ${activeNow} плочката също се вдига (is-dragging ${pressActive.held.lifted}, въоръжена ${pressActive.held.armed})`, pressActive.held);
    ok(closeAfterVisible === closeBeforeVisible,
        `21) и тук не се вика хиксчето на бележката (.modal-close кликове ${closeBeforeVisible} -> ${closeAfterVisible})`, { closeBeforeVisible, closeAfterVisible });
    ok(probeActive.present === true && probeActive.hidden === false && probeActive.display !== 'none' && probeActive.boxH > 0,
        `21) активната бележка остава отворена и видима (hidden ${probeActive.hidden}, display ${probeActive.display}, височина ${probeActive.boxH})`, probeActive);
    ok(afterVisible.open === beforeVisible.open && afterVisible.visible === beforeVisible.visible,
        `21) нито един прозорец не се затваря и не се скрива (отворени ${beforeVisible.open} -> ${afterVisible.open}, видими ${beforeVisible.visible} -> ${afterVisible.visible})`, { beforeVisible, afterVisible });
    ok(probeActive.active === true && (await windowsState()).activeGdid === activeNow,
        `21) активността остава при нея (${activeNow})`, probeActive);
    ok(!!activeTile && activeTile.dragging === false,
        `21) плочката слиза долу след пускането (is-dragging ${activeTile && activeTile.dragging})`, activeTile);

    // Същото с МИШКА (десктоп): задържане на показалеца върху плочка я вдига, но не затваря бележката.
    // Взима се бележка, която НЕ е пипана с пръст: пазачът в кода прескача миши събития до 1s след
    // touchend на същата плочка (те са синтетични след истински пръст), а тук жестът е истински.
    await openNote('book');
    await settle();
    const mouseGdid = 'BAR5';
    ok((await winProbe(mouseGdid)).present === true, `21б) ${mouseGdid} е отворена за проверката с мишка`);
    const mouseIdx = await tileIndexFor(mouseGdid);
    ok(mouseIdx >= 0, `21б) плочката на ${mouseGdid} е в лентата (индекс ${mouseIdx})`);
    const mBox = await page.locator('#open-notes-bar .open-notes-bar-tile').nth(mouseIdx).boundingBox();
    const closeBeforeMouse = await closeClicks();
    await page.mouse.move(mBox.x + mBox.width / 2, mBox.y + mBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(620);
    const mouseHeld = await tileStateOf(mouseGdid);
    await page.mouse.up();
    await settle();
    const mouseProbe = await winProbe(mouseGdid);
    const mouseTile = await tileStateOf(mouseGdid);
    const closeAfterMouse = await closeClicks();
    ok(!!mouseHeld && mouseHeld.dragging === true,
        `21б) задържане с мишка вдига плочката (is-dragging ${mouseHeld && mouseHeld.dragging})`, mouseHeld);
    ok(closeAfterMouse === closeBeforeMouse,
        `21б) задържане с мишка не вика хиксчето на бележката (.modal-close кликове ${closeBeforeMouse} -> ${closeAfterMouse})`, { closeBeforeMouse, closeAfterMouse });
    ok(mouseProbe.present === true && mouseProbe.hidden === false && mouseProbe.display !== 'none',
        `21б) бележката остава отворена и видима след задържането (present ${mouseProbe.present}, hidden ${mouseProbe.hidden}, display ${mouseProbe.display})`, mouseProbe);
    ok(!!mouseTile && mouseTile.dragging === false,
        `21б) и плочката слиза долу след пускането (is-dragging ${mouseTile && mouseTile.dragging})`, mouseTile);

    // Нищо не е останало недовършено: всички отворени бележки се затварят през своя X, лентата изчезва.
    ok(await closeAllOpenNotes(), '21) останалите отворени бележки се затварят през своя X');
    await settle();
    s = await barState();
    ok(hidden(s), `21) след затварянето на всички лентата е скрита (display ${s.display})`, s);
}

// --- 22) Плочката стига до снимката и когато първият ред ЗАПОЧВА със снимка, когато търсенето в
// Drive е бавно и когато адресът е готов само в тялото на бележката (b2.84) ---------------------
// Собственикът (25.10.2026): „в бележка, в която в първия ред има в началото вложена картинка ...
// се показват първите две букви от текста и картинката си игнорира - върни и предното състояние на
// бутона". Затова тук се проверява САМО картинката в плочката; видът ѝ (40px, цвят на бележката,
// жълт контур на активната) се пази от предишните части.
const waitTileThumb = (gdid, timeout) => page.waitForFunction((g) => {
    const tile = [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')]
        .find(t => (t.dataset.barKey || '').includes(g));
    return !!tile && tile.classList.contains('has-thumb') && !!tile.querySelector('.open-notes-bar-thumb');
}, gdid, { timeout }).then(() => true).catch(() => false);
const lettersShown = (gdid) => page.evaluate((g) => {
    const tile = [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')]
        .find(t => (t.dataset.barKey || '').includes(g));
    if (!tile) return null;
    const letters = tile.querySelector('.open-notes-bar-letters');
    return letters ? getComputedStyle(letters).display : null;
}, gdid);

// А) Бележка, чийто ПЪРВИ РЕД ЗАПОЧВА със снимката (type=8 със start=0) - точно случаят на
// собственика. Плочката трябва да покаже снимката, а не първите две букви от текста.
await openNote('firstimg');
await settle();
const firstReady = await waitTileThumb('BAR11', 8000);
const firstTile = await tileStateOf('BAR11');
const firstLetters = await lettersShown('BAR11');
ok(firstReady && /^https:\/\/thumb\.invalid\//.test((firstTile && firstTile.imgSrc) || ''),
    `22а) бележка, чийто първи ред започва със снимка, показва снимката в плочката (${firstTile && firstTile.imgSrc})`, firstTile);
ok(firstLetters === 'none',
    `22а) буквите отстъпват на снимката, вместо да стоят върху нея (display ${firstLetters})`, firstTile);
ok(!!firstTile && /Снимка/.test(firstTile.title || ''),
    `22а) заглавието на бележката пак се чете - снимката не маха текста (${firstTile && firstTile.title})`, firstTile);

// Б) Търсенето на файла по име в Drive е по-бавно от чакането на плочката (1s): повторните опити
// трябва да я довършат, вместо тя да остане с буквите до края на сесията.
const BAR_THUMB_WAIT = 1000; // същото като OPEN_NOTES_BAR_THUMB_WAIT в main.js
driveSearchDelay = { name: SLOW_PHOTO, ms: 2500 };
const slowStart = Date.now();
await openNote('slowimg');
await settle();
const slowReady = await waitTileThumb('BAR12', 6000);
const slowElapsed = Date.now() - slowStart;
driveSearchDelay = { name: '', ms: 0 };
const slowTile = await tileStateOf('BAR12');
ok(slowReady && /^https:\/\/thumb\.invalid\//.test((slowTile && slowTile.imgSrc) || ''),
    `22б) при бавно търсене в Drive (2.5s) плочката пак получава снимка (${slowTile && slowTile.imgSrc})`, slowTile);
ok(slowElapsed > BAR_THUMB_WAIT,
    `22б) снимката е дошла след първото чакане (${slowElapsed}ms), тоест повторният опит работи`, { slowElapsed });

// В) Тялото на бележката вече има готова картинка, а търсенето по име не намира нищо (празен
// списък): плочката трябва да вземе адреса от тялото, без да чака мрежа.
await openNote('bodyimg');
await settle();
const injected = await page.evaluate(({ gdid, file, src }) => {
    const win = getOpenNoteWindows().find(w => w.body.dataset.gdid === gdid);
    if (!win) return { ok: false };
    // Същата рамка, която hydrateInlineImages пълни в бележката, само че вече готова.
    const box = document.createElement('span');
    box.className = 'nm-inline-img is-ready';
    box.dataset.nmFile = file;
    box.dataset.nmView = 'note';
    box.dataset.nmState = 'ready';
    const img = document.createElement('img');
    img.alt = file;
    img.src = src;
    box.appendChild(img);
    win.body.appendChild(box);
    // Лентата се опреснява по същия път, по който го прави приложението при всяко вдигане и
    // затваряне: плочката трябва да види новия адрес, вместо да излезе по подписа си.
    refreshOpenNotesBar();
    return { ok: true, bodySrc: box.querySelector('img').getAttribute('src') };
}, { gdid: 'BAR13', file: BODY_FILE, src: BODY_SRC });
ok(injected.ok, '22в) снимката е сложена в тялото на бележката (както я рисува hydrateInlineImages)', injected);
const bodyReady = await waitTileThumb('BAR13', 3000);
const bodyTile = await tileStateOf('BAR13');
ok(bodyReady && (bodyTile && bodyTile.imgSrc) === BODY_SRC,
    `22в) плочката взима адреса от ТЯЛОТО на бележката, вместо да остане с букви (${bodyTile && bodyTile.imgSrc})`, bodyTile);

// Трите бележки се затварят през своя X: не остават таймери на повторните опити за края на теста.
for (const g of ['BAR11', 'BAR12', 'BAR13']) await closeNoteByX(g);
await settle();

// --- 18) Никакви грешки в конзолата / страницата -------------------------------------------
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);

await browser.close();
srv.close();
console.log(`${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
