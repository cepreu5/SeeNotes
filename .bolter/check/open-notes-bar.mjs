// Лентата с миниатюри на отворените бележки в дъното на екрана (порт от cx-notes b2.70/b2.72/b2.74/b2.77).
// Собственикът (24.10.2026): „когато имаме отворени повече от 2 бележки най-отдолу на екрана да се
// появи лента с мини-изображения (40px) на бележките и бутон за затваряне на всички бележки, която
// да се приплъзва, ако няма достатъчно място на екрана. кликването на иконка активира съответната
// ѝ бележка".
// Проверява се по ИСТИНСКИЯ път в браузър - истински прозорци (showModal), истински кликове с
// показалеца, истински thumbnail от (фалшив) Drive:
//   - при 0 отворени бележки лентата я няма (display: none);
//   - при 1, 2 и 3 отворени се вижда (собственикът, 25.10.2026: „лентата вече се показва веднага при
//     1 отворена бележка") - при 1 е с една плочка 40x40, при 3 с три;
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
//   - разпъната бележка при видима лента (extended mode на бележката): долната ѝ част (редът с
//     датата във футъра) свършва НАД лентата, всеки бутон в бележката се натиска (elementFromPoint),
//     а щом лентата изчезне, бележката се връща на цялата височина - на 1280x900 и на 390x844;
//   - клик на плочката на АКТИВНАТА бележка я скрива (плочката става is-hidden), втори клик върху
//     същата плочка я показва пак и я прави активна - плочката е превключвател, а клик на плочка на
//     друга/скрита бележка работи както досега;
//   - ЕДНА отворена бележка, скрита през „Скрий всички", се връща с клик на плочката си и плочката
//     губи приглушаването ВЕДНАГА, без да чака друго опресняване на лентата (b1.41 - активната
//     бележка не се сменя, значи activateNoteWindow не влиза в клона за смяна на активната, а
//     raiseNoteWindow излиза още в началото);
//   - лентата избутва нагоре плаващите бутони на долния ръб (#scrollTopBtn и .kb-fab с инлайн позиция
//     от местенето, .toast-notification и .board-filter-popup от stylesheet-а) и ги връща на място;
//   - фонът на лентата е 50% прозрачен (#37474F), бутоните „скрий/покажи всички" са с двойни стрелки;
//   - лентата работи и в пълноекранен режим на приложението (header-fullscreen, „extended").
//   - задържане (500ms) на плочка ЗАТВАРЯ точно тази бележка - същият път като хиксчето в прозореца ѝ
//     (и за скрита бележка); обикновеният клик продължава да е превключвател, а движение на показалеца
//     над 6px преди 500ms отменя задържането (b1.49);
// Пуска се от корена на хранилището:
//   node .bolter/check/open-notes-bar.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Приложението е index-2.html (то зарежда main.js); index.html е само splash.
const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index-2.html' : p;
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
// Още три файла за проверките на плочката (b1.51) - всеки със СВОЕ име, защото кешът на вече
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
const DRIVE_FILES = {
    [PHOTO]: PHOTO_ID, [FIRST_PHOTO]: FIRST_PHOTO_ID, [SLOW_PHOTO]: SLOW_PHOTO_ID,
};
const PHOTO_IDS = new Set(Object.values(DRIVE_FILES));

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });

// Целият външен свят се отговаря на място: проверката не излиза в мрежата.
async function mockExternal(ctx) {
    await ctx.route(/^https?:\/\/(?!localhost)/, route => {
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
        if (url.startsWith('https://storage.ko-fi.com/')) {
            return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.kofiWidgetOverlay={draw(){},update(){}};' });
        }
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
}

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await mockExternal(ctx);
// main пита Drive през gapi (не през fetch), затова търсенето на файла се отговаря тук: иначе
// бележката със снимка не намира файла си и плочката остава без миниатюра.
await ctx.addInitScript(({ DRIVE_FILES, FOLDER_IMAGES }) => {
    // Забавено търсене (b1.51): тестът казва за кое име Drive да отговаря бавно и колко. Забавянето
    // се чете от window, тоест продуктовият код не знае за проверката.
    window.__barDriveDelay = { name: '', ms: 0 };
    const filesFor = (name) => (DRIVE_FILES[name] ? [{ id: DRIVE_FILES[name], name, modifiedTime: '2026-10-19T09:00:00Z' }] : []);
    window.gapi = {
        load() { },
        client: {
            setToken() { }, getToken() { return { access_token: 'tok' }; },
            drive: {
                files: {
                    async list(params) {
                        const q = (params && params.q) || '';
                        const name = (q.match(/name\s*=\s*'([^']*)'/) || [])[1] || '';
                        if (/application\/vnd\.google-apps\.folder/.test(q)) {
                            // Само папката Images се намира. Папката с данните на приложението НЕ се
                            // намира нарочно: иначе приложението зарежда своя (празен, фалшив) файл
                            // с бележки и ПРЕЗАПИСВА allNotesData - тогава бележките, които тестът
                            // тъкмо е сложил, изчезват под него (пада проверката за заглавието на
                            // плочката). В живота такова състезание няма: бележките идват точно от
                            // това зареждане.
                            if (name === 'Images') return { result: { files: [{ id: FOLDER_IMAGES, name: 'Images' }] } };
                            return { result: { files: [] } };
                        }
                        const delay = window.__barDriveDelay || { name: '', ms: 0 };
                        if (delay.ms && delay.name === name) await new Promise(r => setTimeout(r, delay.ms));
                        return { result: { files: filesFor(name) } };
                    },
                    get() { return Promise.resolve({ result: {} }); },
                },
            },
        },
        auth: { getToken() { return { access_token: 'tok' }; } },
    };
    // Токен НЕ се слага: с него приложението тръгва и зарежда своя (фалшив, празен) файл с бележки,
    // а това ЗАМЕСТВА allNotesData - бележките, които тестът е сложил, изчезват под него и лентата
    // остава с празни плочки. Тестът подава authToken сам (виж BOOT) - това е, което пътят за
    // рисуване и за снимките ползва.
    localStorage.setItem('language', 'bg');
    // Папките са известни от предишно зареждане: тестът мери лентата, не търсенето на папки.
    localStorage.setItem('gdrive_folder_id_Images', 'FOLDER_IMAGES');
    localStorage.setItem('gdrive_multinotes_data_id', 'FOLDER_DATA');
    localStorage.setItem('singleNoteMode', 'false');
}, { DRIVE_FILES, FOLDER_IMAGES });

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof showModal === 'function' && typeof initNoteWindows === 'function', null, { timeout: 20000 });

// Минималното състояние, което прозорците искат: без логин и без теглене от Drive.
const BOOT = `(() => {
    useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
    dbSourceGlobal = null; dirHandle = null; isOfflineMode = false;
    authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
    notesContainer = document.getElementById('notes-container');
    searchBox = document.getElementById('search-box');
    if (!boardsData.some(b => b.gdid === 'B1')) boardsData.push({ id: 9001, gdid: 'B1', title: 'Работа' });
    currentBoardFilter = 'all';
    initNoteWindows();
    return { windows: noteWindows.length, open: getOpenNoteWindows().length };
})()`;
const boot = await page.evaluate(BOOT);
ok(boot.windows === 1 && boot.open === 0, `първият прозорец съществува отначало празен (прозорци ${boot.windows}, отворени ${boot.open})`, boot);

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
    // Бележка със СВОЙ цвят от палитрата: плочката ѝ трябва да носи точно него, а не цвета на лентата.
    { key: 'green', id: '9111', gdid: 'BAR11', raw: 'Зелена бележка', format: '', color: '#EFEFEF' },
    // Бележка със ЗАДАДЕНА ДАТА: тя има ред с датата във футъра на бележката (.modal-note-footer) -
    // той е долната част на разпънатата бележка и също трябва да свършва над лентата.
    { key: 'dated', id: '9110', gdid: 'BAR10', raw: 'Среща с Иван\nв 9:30', format: '', calendarDate: Date.now() },
    // Трите бележки за плочката с миниатюра (b1.51). Първият ред ЗАПОЧВА със снимката - точно случаят
    // на собственика (25.10.2026: „в първия ред има в началото вложена картинка ... се показват
    // първите две букви от текста и картинката си игнорира").
    {
        key: 'firstimg', id: '9114', gdid: 'BAR14', raw: '* Снимка на плажа',
        format: fmt({ start: 0, end: 1, type: 8, paramstring: IMG_FIRST_PATH, paramint: 5 }),
    },
    // Същата бележка, но файлът ѝ се намира в Drive след 2.5s - по-късно от чакането на плочката.
    {
        key: 'slowimg', id: '9115', gdid: 'BAR15', raw: '* Бавна снимка',
        format: fmt({ start: 0, end: 1, type: 8, paramstring: IMG_SLOW_PATH, paramint: 5 }),
    },
    // Бележка, чийто файл по име НЕ се намира в Drive, а снимката вече е в тялото ѝ.
    {
        key: 'bodyimg', id: '9116', gdid: 'BAR16', raw: '* Снимка само в тялото',
        format: fmt({ start: 0, end: 1, type: 8, paramstring: IMG_BODY_PATH, paramint: 5 }),
    },
];

// Отваря бележка по истинския път на приложението (showModal), както клик на картата на борда.
// За бележката с дата се строи и истинската ѝ карта на борда: футърът в модала идва от нея.
const openNote = (key) => page.evaluate(async (def) => {
    useArhDb = false; useLocalFolder = false; useGoogleDb = true; useIndexedDb = false;
    dbSourceGlobal = null; dirHandle = null; isOfflineMode = false;
    authToken = { access_token: 'tok', issued_at: Date.now(), expires_in: 3600 };
    let note = allNotesData.find(x => String(x.gdid) === def.gdid);
    if (!note) {
        note = {
            alarm_type: -1, boardid: 'B1', calendarDate: def.calendarDate || 0, color: def.color || 0,
            date: Date.now(), datemod: Date.now(), eventId: 0,
            gdid: def.gdid, id: def.id, notetxt: def.raw, numord: Number(def.id), sellist: 0, status: 0,
            text_span: def.format, title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
        };
        allNotesData.push(note);
    }
    // Истинска карта на борда се строи само за бележката с дата: от картата showModal вади футъра
    // с датата (.modal-note-footer), а той е долната част на разпънатата бележка.
    let el = null;
    if (def.calendarDate) {
        el = notesContainer.querySelector(`.note[data-g="${def.gdid}"]`);
        if (!el) {
            el = await createNoteElement(note);
            if (el) notesContainer.appendChild(el);
        }
    }
    const opts = { raw: def.raw, format: def.format, id: def.id, gdid: def.gdid, boardId: 'B1' };
    // Цветът се подава по същия път, по който го подава бордът: showModal го превръща във фон на
    // .modal-content-box, а плочката в лентата трябва да носи точно този фон.
    if (def.color !== undefined) opts.color = def.color;
    showModal(opts, el || null);
}, NOTES.find(x => x.key === key));

// Затваря прозореца на бележка през истинския X (същият път като клик на потребителя).
const closeNoteByX = (gdid) => page.evaluate((gdid) => {
    const win = getOpenNoteWindows().find(w => w.body.dataset.gdid === gdid);
    if (!win) return false;
    // Истинският клик първо активира прозореца (pointerdown), и чак после идва X.
    activateNoteWindow(win, true);
    win.el.querySelector('.modal-close').click();
    return true;
}, gdid);

// Два кадъра: подредбата и класовете са приложени, преди да се мери.
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
        background: cs.backgroundColor,
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
            const svg = b.querySelector('svg');
            return {
                present: true,
                insideStrip: !!strip && strip.contains(b),
                mode: b.dataset.mode,
                title: b.getAttribute('title'),
                ariaLabel: b.getAttribute('aria-label'),
                w: round(b.getBoundingClientRect().width),
                h: round(b.getBoundingClientRect().height),
                circles: svg ? svg.querySelectorAll('circle').length : -1,
                paths: svg ? [...svg.querySelectorAll('path')].map(p => p.getAttribute('d')) : [],
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
const floaterState = (sel) => page.evaluate((sel) => {
    const el = typeof sel === 'string' && sel.startsWith('.') ? document.querySelector(sel) : document.getElementById(sel);
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
        rectTop: round(r.top), rectBottom: round(r.bottom), rectW: round(r.width), rectH: round(r.height),
    };
}, sel);

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
    for (let i = 0; i < 14; i++) {
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

// Отбелязва колко е вървяла една част от теста: бавна проверка се вижда веднага в изхода.
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

// Собственикът (25.10.2026): лентата се показва още при ЕДНА отворена бележка.
await openNote('photo');
await settle();
s = await barState();
ok(!hidden(s) && s.display === 'flex', `при 1 отворена бележка лентата вече се вижда (display ${s.display})`, s);
ok(s.tiles.length === 1, `при 1 бележка в лентата има точно 1 плочка (${s.tiles.length})`, s.tiles.length);
ok(tileOf(s, 0).w === 40 && tileOf(s, 0).h === 40, `плочката е 40x40 (${tileOf(s, 0).w}x${tileOf(s, 0).h})`, tileOf(s, 0));
ok(!!s.closeBtn.present && !!s.hideBtn.present, 'бутоните „скрий всички" и „затвори всички" са на мястото си и при 1 бележка', s.hideBtn);
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
ok((await windowsState()).open.every(w => w.hidden) && !hidden(await barState()),
    '„скрий всички" работи още при 1 бележка и лентата остава (иначе няма как да я върнеш)');
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
ok((await windowsState()).open.every(w => !w.hidden), '„покажи всички" връща бележката');

await openNote('bread');
await settle();
s = await barState();
ok(!hidden(s) && s.tiles.length === 2, `при 2 отворени бележки лентата е с 2 плочки (display ${s.display}, ${s.tiles.length})`, s.tiles.length);
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
ok(/Затвори всички/.test(s.closeBtn.title || '') && /Затвори всички/.test(s.closeBtn.ariaLabel || ''),
    `бутонът носи текста closeAllNotes („${s.closeBtn.title}")`, s.closeBtn);
ok(/Отворени бележки/.test(s.label || ''), `лентата носи текста openNotesBar („${s.label}")`, s.label);

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
// Бележките в този тест са без свой цвят: main ги боядисва с цвета по подразбиране (#eef603, вж.
// renderNoteWindow) - плочките трябва да са точно в него, а не в цвят от собствена палитра.
ok(s.tiles.every(t => t.bg === 'rgb(238, 246, 3)'),
    `плочките носят цвета на бележката по подразбиране (${s.tiles.map(t => t.bg).join(', ')})`, s.tiles);
// Буквите се четат: на светла бележка са тъмни (#1F2A30), не бели.
ok(s.tiles.every(t => t.lettersColor === 'rgb(31, 42, 48)'),
    `буквите на светла бележка са тъмни (${s.tiles.map(t => t.lettersColor).join(', ')})`, s.tiles);
ok(s.tiles.every(t => t.lettersBg === 'rgba(0, 0, 0, 0)'),
    `буквите нямат собствен фон - фонът е на плочката (${s.tiles.map(t => t.lettersBg).join(', ')})`, s.tiles);
// Заглавието на плочката е първият ред с думи, както на картата на борда. Лентата може да се
// изчертае, докато прозорецът още се пълни, затова се чака заглавието да се появи (до 2s) - ако не
// се появи, проверката пада: плочка без заглавие е точно това, което се проверява.
const titlesReady = await page.waitForFunction(() => {
    const tiles = [...document.querySelectorAll('#open-notes-bar .open-notes-bar-tile')];
    return tiles.length > 0 && tiles.every(t => (t.getAttribute('title') || '').length > 0);
}, null, { timeout: 2000 }).then(() => true).catch(() => false);
s = await barState();
const titleDiag = await page.evaluate(() => {
    const bar = document.getElementById('open-notes-bar');
    return {
        tiles: [...bar.querySelectorAll('.open-notes-bar-tile')].map(t => {
            const w = openNotesBarWindowFor(t);
            const n = w ? findNoteForWindow(w) : null;
            return {
                key: t.dataset.barKey, sig: t.dataset.barSig, title: t.getAttribute('title'),
                winGdid: w ? w.body.dataset.gdid : null, winId: w ? w.body.dataset.id : null,
                noteFound: !!n, noteTxt: n ? String(n.notetxt || '').slice(0, 16) : null,
                computed: n ? openNotesBarTitleFor(n) : null,
            };
        }),
        notes: allNotesData.map(n => (n.gdid || '?') + '/' + String(n.notetxt || '').length),
        open: getOpenNoteWindows().map(w => (w.body.dataset.gdid || '?') + '/' + w.open),
    };
});
ok(titlesReady && s.tiles.every(t => typeof t.title === 'string' && t.title.length > 0 && !t.title.includes('|') && !t.title.includes('*')),
    `плочките носят заглавието на бележката (${s.tiles.map(t => t.title).join(' | ')})`, titleDiag);

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
// Бележка със СВОЙ цвят: плочката ѝ носи точно неговия цвят, а не цвета по подразбиране.
await openNote('green');
await settle();
s = await barState();
const greenTile = s.tiles.find(t => String(t.key || '').includes('BAR11')) || {};
ok(s.tiles.length === 5, `бележката със свой цвят добавя пета плочка (${s.tiles.length})`, s.tiles.length);
ok(greenTile.bg === 'rgb(239, 239, 239)' && greenTile.bg === greenTile.winBg,
    `плочката на бележката със свой цвят е точно в него (${greenTile.bg} = ${greenTile.winBg})`, greenTile);
ok(greenTile.bg !== tileOf(s, 0).bg,
    `плочката със свой цвят се различава от плочката по подразбиране (${greenTile.bg} срещу ${tileOf(s, 0).bg})`, greenTile);
ok(await closeNoteByX('BAR11'), 'бележката със свой цвят се затваря през своя X');
await waitOpenCount(4);
await settle();

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
// --- 5) Лентата изчезва едва когато не остане нито една отворена бележка ----------------
ok(await closeNoteByX('BAR3'), 'прозорецът на третата бележка се затваря през своя X');
await waitOpenCount(2);
await settle();
s = await barState();
ok(!hidden(s) && s.tiles.length === 2, `при 2 отворени бележки лентата остава с 2 плочки (display ${s.display}, ${s.tiles.length})`, s.tiles.length);
for (const g of ['BAR2', 'BAR1']) { await closeNoteByX(g); await settle(); }
await waitOpenCount(0);
await settle();
s = await barState();
ok(hidden(s), `при 0 отворени бележки лентата изчезва (display ${s.display})`, s);
const barR0 = await barRect();
ok(!barR0.bodyClass && parseFloat(barR0.varH) === 0,
    `без лента: класът на body го няма и променливата е 0px (${barR0.varH}, class ${barR0.bodyClass})`, barR0);

// --- 6) Бутонът в дясно затваря всички бележки ---------------------------------------------
for (const key of ['photo', 'bread', 'plan']) await openNote(key);
await settle();
s = await barState();
ok(!hidden(s) && s.tiles.length === 3, `след ново отваряне пак има 3 плочки (${s.tiles.length})`, s.tiles);
ok(s.zIndex > (await windowsState()).maxZ, 'лентата е над всички прозорци по z-index');
await page.locator('#open-notes-bar .open-notes-bar-close').click();
await waitOpenCount(0);
await settle();
s = await barState();
const wsClosed = await windowsState();
ok(wsClosed.open.length === 0, `бутонът затвори всички бележки (отворени ${wsClosed.open.length})`, wsClosed);
ok(hidden(s), `след затваряне на всички лентата е скрита (display ${s.display})`, s);

tick('до тук: 5-6) затваряне');
// Смяна на настройката „Single note" през ИСТИНСКИЯ чекбокс от настройките (същият път като клик на
// потребителя): checked + change, без модалът да трябва да е отворен на екрана.
// UI-ът на настройките (createSettingsUI) се създава още при старт на приложението, но в теста
// стартът спира на мрежовите заявки, затова тук се вика изрично. Функцията има пазач
// (settings-modal-body.dataset.initialized), значи повторното ѝ викане не слага втори слушател.
const ensureSettingsUI = () => page.evaluate(async () => {
    try { await createSettingsUI([], false); } catch (e) { }
    const body = document.getElementById('settings-modal-body');
    return !!body && body.dataset.initialized === 'true';
});
const setSingleNote = (on) => page.evaluate((on) => {
    const cb = document.getElementById('single-note-mode-checkbox');
    if (!cb) return false;
    cb.checked = on;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
}, on);

// --- 7) Режим „единична бележка": лентата НЕ се показва --------------------------------------
// Собственикът (25.10.2026): „при включена настройка Single note лентата е излишно да се показва" -
// режимът държи една бележка, значи лентата няма какво да показва. main държи режима строго:
// включването му оставя САМО горната бележка (останалите се затварят като с хиксче), затова тук се
// проверява и че лентата изчезва заедно с това.
for (const key of ['photo', 'bread', 'plan']) await openNote(key);
await settle();
s = await barState();
ok(!hidden(s) && s.tiles.length === 3,
    `преди включването на режима: 3 отворени бележки и видима лента (display ${s.display}, ${s.tiles.length} плочки)`, s);

const settingsReady = await ensureSettingsUI();
ok(settingsReady, 'настройките са инициализирани - чекбоксът Single note носи истинския си слушател');

const cbFound = await setSingleNote(true);
const modeNow = await page.evaluate(() => localStorage.getItem('singleNoteMode'));
ok(cbFound, 'чекбоксът #single-note-mode-checkbox е на страницата - режимът се включва през него');
ok(modeNow === 'true', `включването на режима записа настройката (singleNoteMode=${modeNow})`);
await waitOpenCount(1);
await settle();
s = await barState();
const rectSingle = await barRect();
const wsSingle = await windowsState();
ok(wsSingle.open.length === 1, `в режим „единична бележка" остава една отворена бележка (${wsSingle.open.length})`, wsSingle.open.length);
ok(hidden(s), `при включен Single note лентата не се показва (display ${s.display})`, s);
ok(!rectSingle.bodyClass && parseFloat(rectSingle.varH || '0') === 0,
    `избутването на плаващите бутони е върнато (клас ${rectSingle.bodyClass}, --open-notes-bar-h ${rectSingle.varH})`, rectSingle);
// В режима лентата е display: none - значи не заема място на екрана (плочките остават в скрития ѝ
// DOM и се строят наново, щом лентата се покаже пак).
ok(rectSingle.exists && rectSingle.rectH === 0 && rectSingle.rectW === 0,
    `скритата лента не заема място на екрана (${rectSingle.rectW}x${rectSingle.rectH})`, rectSingle);

tick('7а) лентата при включен Single note');
// --- 7б) Изключването на режима връща лентата веднага, без презареждане -----------------------
await setSingleNote(false);
await settle();
s = await barState();
const rectBack = await barRect();
ok(!hidden(s) && s.tiles.length === 1,
    `след изключване на режима лентата се връща веднага с плочката на отворената бележка (display ${s.display}, ${s.tiles.length} плочки)`, s.tiles.length);
ok(rectBack.bodyClass && parseFloat(rectBack.varH || '0') > 0,
    `и плаващите бутони се качват пак над нея (клас ${rectBack.bodyClass}, --open-notes-bar-h ${rectBack.varH})`, rectBack);

tick('7б) връщане при изключване');
// --- 7в) Включването на режима ЗАТВАРЯ скритите бележки ---------------------------------------
// Лентата е ЕДИНСТВЕНИЯТ път да върнеш скрита бележка, а в режима тя я няма - затова включването
// затваря скритите (closeHiddenNoteWindows), вместо да ги върне на екрана. Собственикът
// (25.10.2026): „Включването на режима връща скритите бележки на екрана - не, в този режим не може
// да има много бележки, така че да не ги връща, а да ги затваря".
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
const wsHid = await windowsState();
ok(wsHid.open.length === 1 && wsHid.open.every(w => w.hidden),
    `в изключен режим „скрий всички" скри бележката (скрити ${wsHid.open.filter(w => w.hidden).length})`, wsHid.open);
ok(!hidden(await barState()), 'и лентата остава - тя е пътят да я върнеш');

await setSingleNote(true);
await waitOpenCount(0);
await settle();
const wsClosedByMode = await windowsState();
s = await barState();
ok(wsClosedByMode.open.length === 0,
    `включването на режима затвори скритата бележка, вместо да я върне (отворени ${wsClosedByMode.open.length})`, wsClosedByMode);
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
// Плочка има само за ОТВОРЕНА бележка: затворената не получава жива плочка, тоест не се връща и
// през лентата.
const liveTiles = s.tiles.filter(t => t.winBg !== null);
ok(liveTiles.length === 0,
    `след изключване на режима няма плочка за затворената бележка (живи ${liveTiles.length} от ${s.tiles.length})`, s.tiles);
ok(hidden(s), `и лентата не се показва, щом няма отворена бележка (display ${s.display})`, s);

// От чисто: отварят се трите бележки, за да продължи тестът от същото състояние.
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
ok(!!breadTile && breadTile.bg === 'rgb(238, 246, 3)',
    `буквената плочка е в цвета на бележката по подразбиране (${breadTile && breadTile.bg})`, breadTile);
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
// Жестът тръгва от ФОНА между две плочки, а НЕ от плочка: от b1.50 плъзгане, започнало върху плочка,
// законно преподрежда лентата (виж open-notes-bar-drag.mjs) - а тук се проверява само, че минаването
// по лентата не сменя активната бележка. Стартирането върху плочка би преместило реда и следващите
// проверки (плочка n извиква бележка X) биха гледали друга бележка.
const beforeDrag = await windowsState();
const box = await page.locator('#open-notes-bar .open-notes-bar-strip').boundingBox();
const gapX9 = await page.evaluate(({ x0, x1, y }) => {
    for (let x = Math.round(x0) + 1; x < Math.round(x1) - 1; x++) {
        const el = document.elementFromPoint(x, y);
        if (el && el.classList && el.classList.contains('open-notes-bar-strip')) return x;
    }
    return null;
}, { x0: box.x, x1: box.x + box.width, y: box.y + box.height / 2 });
ok(gapX9 !== null, `има фон между плочките, от който да тръгне жестът по лентата (${gapX9})`, { box, gapX9 });
if (gapX9 !== null) {
    await page.mouse.move(gapX9, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(gapX9 - 40, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await settle();
}
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
// --- 12) Лентата остава, докато има отворена или скрита бележка --------------------------------
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

// Затваряме една от показаните: остават една показана и една скрита.
const shownGdid = wsRule.open.find(w => !w.hidden && w.gdid !== 'BAR2').gdid;
ok(await closeNoteByX(shownGdid), `показаната бележка ${shownGdid} се затваря през своя X`);
await waitOpenCount(2);
await settle();
s = await barState();
wsRule = await windowsState();
ok(wsRule.open.length === 2 && wsRule.open.filter(w => w.hidden).length === 1,
    `отворени са 2 бележки, от които 1 скрита (${wsRule.open.map(w => w.hidden ? 'h' : 'v').join('')})`, wsRule.open.map(w => w.hidden));
ok(!hidden(s) && s.tiles.length === 2,
    `лентата е видима при 1 показана и 1 скрита бележка (display ${s.display}, ${s.tiles.length} плочки)`, s);
ok(s.tiles.filter(t => t.hiddenTile).length === 1 && s.tiles.filter(t => !t.hiddenTile).length === 1,
    `едната плочка е приглушена, другата не (${s.tiles.map(t => t.hiddenTile ? 'h' : 'v').join('')})`, s.tiles);
ok(s.hideBtn.mode === 'hide', 'щом не всички са скрити, бутонът е „скрий всички"', s.hideBtn);

// „Покажи всички" връща и скритата: две показани, нито една скрита - лентата пак е на екрана,
// защото вече се показва още при ЕДНА отворена бележка (не при повече от две).
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
s = await barState();
wsRule = await windowsState();
ok(wsRule.open.length === 2 && wsRule.open.every(w => !w.hidden),
    `„покажи всички" върна и двете бележки (${wsRule.open.map(w => w.hidden ? 'h' : 'v').join('')})`, wsRule.open.map(w => w.hidden));
ok(!hidden(s) && s.tiles.length === 2,
    `лентата остава при две показани бележки (display ${s.display}, ${s.tiles.length} плочки)`, s);
ok(s.tiles.every(t => !t.hiddenTile), 'нито една плочка не е приглушена, щом нищо не е скрито', s.tiles.map(t => t.hiddenTile));

// Последно: затварят се и двете - лентата изчезва едва при нула отворени бележки.
for (const g of wsRule.open.map(w => w.gdid)) { await closeNoteByX(g); await settle(); }
await waitOpenCount(0);
await settle();
s = await barState();
ok(hidden(s), `при 0 отворени бележки лентата изчезва (display ${s.display})`, s);
const barRGone = await barRect();
ok(!barRGone.bodyClass && parseFloat(barRGone.varH) === 0,
    `лентата я няма и променливата се върна на 0px (${barRGone.varH}, class ${barRGone.bodyClass})`, barRGone);

tick('до тук: 12) лентата остава при отворена/скрита бележка');
// --- 13) Лентата е над всеки прозорец и не е част от скрола на реда ------------------------
await openNote('call');
await settle();
const wsAll = await windowsState();
s = await barState();
ok(s.zIndex > wsAll.maxZ, `z-index на лентата ${s.zIndex} е над най-високия прозорец ${wsAll.maxZ}`, { bar: s.zIndex, max: wsAll.maxZ });
ok(!!s.closeBtn.present && !s.closeBtn.insideStrip && s.closeBtn.w > 0,
    'бутонът за затваряне остава видим извън приплъзващия се ред и на тесен екран', s.closeBtn);
// Лентата е последното дете на слоя: над всички прозорци, а слоят не приема кликове.
const layerInfo = await page.evaluate(() => {
    const layer = document.getElementById('note-windows-layer');
    const bar = document.getElementById('open-notes-bar');
    return {
        last: layer && layer.lastElementChild === bar,
        inLayer: bar && bar.parentNode === layer,
        layerPointer: layer ? getComputedStyle(layer).pointerEvents : null,
    };
});
ok(layerInfo.last && layerInfo.inLayer && layerInfo.layerPointer === 'none',
    `лентата е последното дете на слоя, а слоят не приема кликове (${JSON.stringify(layerInfo)})`, layerInfo);

tick('до тук: 13) z-index/тесен екран');

// --- 14) Лентата избутва нагоре плаващите бутони на долния ръб -------------------------------
// Докато лентата е на екрана, всичко закачено за долния ръб се качва НАД нея, а не остава зад/върху
// нея. Щом лентата изчезне, елементите слизат точно на първоначалното си място.
// Бутоните #scrollTopBtn и .kb-fab се местят от makeElementDraggable с ИНЛАЙН позиция - затова тук
// им се дава инлайн bottom, както го прави приложението след логин (иначе пътят с обвивката в calc()
// не се изпълнява и проверката не би доказала нищо за него). .toast-notification и
// .board-filter-popup се вдигат от stylesheet-а - тях ги проверяваме без инлайн позиция.
const noOverlap = (f, b) => !f.present || f.display === 'none' || f.rectH === 0 || f.rectBottom <= b.rectTop + 0.5;
const numPx = (v) => parseFloat(String(v)) || 0;
// Съобщенията (toast) се показват точно на долния ръб и са над всичко (z-index 1001) - докато са на
// екрана, elementFromPoint попада в тях, а не в това, което е под тях. Те са краткотрайни (изчезват
// сами), затова тук се махат от пътя на показалеца, преди да се мери.
const clearToast = () => page.evaluate(() => {
    const t = document.getElementById('toastNotification');
    if (!t) return;
    t.classList.remove('show');
    t.style.display = 'none';
    t.style.pointerEvents = 'none';
});
// .kb-fab има преход по всички свойства (transition: all 0.3s) - докато трае, изчисленият bottom е
// междинна стойност и сравнението с точното число лъже. Затова се чака стойността да стигне
// очакваната, вместо да се спи фиксирано време.
const waitFloaterBottom = (sel, expected) => page.waitForFunction(([sel, expected]) => {
    const el = typeof sel === 'string' && sel.startsWith('.') ? document.querySelector(sel) : document.getElementById(sel);
    if (!el) return true;
    return Math.abs(parseFloat(getComputedStyle(el).bottom) - expected) < 0.3;
}, [sel, expected], { timeout: 3000 }).catch(() => { });

await page.setViewportSize({ width: 1280, height: 900 });
tick('14a) затваряне на всички');
ok(await closeAllOpenNotes(), 'всички отворени бележки се затварят преди проверката за избутване');
await settle();
let barR = await barRect();
ok(!barR.bodyClass && numPx(barR.varH) === 0,
    `без лента: променливата е 0px и класът на body го няма (${barR.varH}, class ${barR.bodyClass})`, barR);

// Бутоните с инлайн позиция (както ги слага местенето) + скритите по подразбиране плаващи елементи.
const FLOATERS = await page.evaluate(() => {
    const put = (el, bottom, right) => {
        if (!el) return;
        el.style.display = 'flex';
        el.style.bottom = bottom;
        el.style.right = right;
    };
    put(document.getElementById('scrollTopBtn'), '80px', '30px');
    put(document.getElementById('kb-fab'), '10px', '10px');
    // .board-filter-popup се строи от бордовете; тук се слага ръчно, за да има какво да се мери
    // (иначе проверката за него не би се изпълнила никога).
    let popup = document.getElementById('board-filter-popup');
    if (!popup) {
        popup = document.createElement('div');
        popup.id = 'board-filter-popup';
        popup.className = 'board-filter-popup';
        popup.textContent = 'бордове';
        document.body.appendChild(popup);
    }
    popup.classList.add('visible');
    return {
        scrollTop: !!document.getElementById('scrollTopBtn'),
        kbFab: !!document.getElementById('kb-fab'),
        toast: !!document.querySelector('.toast-notification'),
        popup: !!popup,
    };
});
ok(FLOATERS.scrollTop && FLOATERS.toast && FLOATERS.popup,
    `плаващите елементи, за които има правила, съществуват (${JSON.stringify(FLOATERS)})`, FLOATERS);

// .kb-fab има преход по всички свойства: основната стойност се чака да се установи, иначе се
// сравнява междинна стойност от предишно вдигане.
await waitFloaterBottom('kb-fab', 10);
const baseScroll = await floaterState('scrollTopBtn');
const baseFab = await floaterState('kb-fab');
const baseToast = await floaterState('.toast-notification');
const basePopup = await floaterState('board-filter-popup');
ok(numPx(baseScroll.bottom) === 80 && baseScroll.inlineBottom === '80px',
    `стрелката нагоре е с инлайн bottom 80px, както я слага местенето (${baseScroll.inlineBottom})`, baseScroll);
ok(!baseFab.present || baseFab.inlineBottom === '10px',
    `асистентът е с инлайн bottom 10px (${baseFab.inlineBottom})`, baseFab);
ok(numPx(baseToast.bottom) === 0 && numPx(basePopup.bottom) === 20,
    `съобщенията са на 0px, а менюто на бордовете - на 20px (${baseToast.bottom}, ${basePopup.bottom})`, { baseToast, basePopup });

tick('14b) основно място');
// Три отворени бележки: лентата се появява и елементите се качват над нея.
for (const key of ['photo', 'bread', 'plan']) await openNote(key);
await settle();
barR = await barRect();
await waitFloaterBottom('kb-fab', 10 + numPx(barR.varH) + 8);
const liftScroll = await floaterState('scrollTopBtn');
const liftFab = await floaterState('kb-fab');
const liftToast = await floaterState('.toast-notification');
const liftPopup = await floaterState('board-filter-popup');
ok(!hidden(barR) && barR.bodyClass && numPx(barR.varH) > 0,
    `лентата е видима и височината ѝ е в променливата (${barR.varH}, лента ${barR.rectH}px)`, barR);
ok(numPx(barR.varH) === Math.round(barR.rectH),
    `променливата е измерената височина на лентата (${barR.varH} срещу ${barR.rectH}px)`, barR);
// Инлайн позицията се обвива в calc() с променливата - точно измереното отместване.
ok(numPx(liftScroll.bottom) === 80 + numPx(barR.varH) + 8,
    `стрелката нагоре е вдигната с височината на лентата + 8px (${liftScroll.bottom} срещу ${80 + numPx(barR.varH) + 8})`, { liftScroll, barR });
ok(noOverlap(liftScroll, barR), `стрелката нагоре стои НАД лентата (${liftScroll.rectBottom} <= ${barR.rectTop})`, { liftScroll, barR });
if (liftFab.present) {
    ok(Math.abs(numPx(liftFab.bottom) - (10 + numPx(barR.varH) + 8)) <= 0.6,
        `асистентът е вдигнат с височината на лентата + 8px (${liftFab.bottom} срещу ${10 + numPx(barR.varH) + 8})`, { liftFab, barR });
    ok(noOverlap(liftFab, barR), `асистентът стои НАД лентата (${liftFab.rectBottom} <= ${barR.rectTop})`, { liftFab, barR });
}
// Тези двамата се вдигат от stylesheet-а: bottom идва от calc() с променливата.
ok(numPx(liftToast.bottom) === numPx(barR.varH) + 8,
    `съобщенията са вдигнати от stylesheet-а (${liftToast.bottom} срещу ${numPx(barR.varH) + 8})`, { liftToast, barR });
ok(noOverlap(liftToast, barR), `съобщенията са НАД лентата (${liftToast.rectBottom} <= ${barR.rectTop})`, { liftToast, barR });
ok(numPx(liftPopup.bottom) === 20 + numPx(barR.varH) + 8,
    `менюто на бордовете е вдигнато от stylesheet-а (${liftPopup.bottom} срещу ${20 + numPx(barR.varH) + 8})`, { liftPopup, barR });
ok(noOverlap(liftPopup, barR), `менюто на бордовете е НАД лентата (${liftPopup.rectBottom} <= ${barR.rectTop})`, { liftPopup, barR });

tick('14c) три бележки, лентата видима');
// Същото на 390px - тесен екран, лентата е по цялата ширина.
await page.setViewportSize({ width: 390, height: 800 });
await settle();
barR = await barRect();
const narrowScroll = await floaterState('scrollTopBtn');
const narrowToast = await floaterState('.toast-notification');
ok(!hidden(barR) && barR.rectW === 390,
    `на 390px лентата е по цялата ширина (${barR.rectW}px) и се вижда`, barR);
ok(noOverlap(narrowScroll, barR), `на 390px стрелката нагоре е над лентата (${narrowScroll.rectBottom} <= ${barR.rectTop})`, { narrowScroll, barR });
ok(noOverlap(narrowToast, barR), `на 390px съобщенията са над лентата (${narrowToast.rectBottom} <= ${barR.rectTop})`, { narrowToast, barR });
ok(numPx(barR.varH) > 0, `на 390px височината на лентата е в променливата (${barR.varH})`, barR);

tick('14d) 390px');
// Затваряне на ВСИЧКИ: лентата изчезва (вече се показва, докато има отворена бележка - затова
// слиза от екрана едва при нула отворени), а елементите слизат на ТОЧНО първоначалното си място.
await page.setViewportSize({ width: 1280, height: 900 });
await settle();
ok(await closeAllOpenNotes(), 'всички бележки се затварят, за да слезе лентата от екрана');
await waitOpenCount(0);
await settle();
barR = await barRect();
await waitFloaterBottom('kb-fab', 10);
const resetScroll = await floaterState('scrollTopBtn');
const resetFab = await floaterState('kb-fab');
const resetToast = await floaterState('.toast-notification');
const resetPopup = await floaterState('board-filter-popup');
ok(hidden(barR) && !barR.bodyClass && numPx(barR.varH) === 0,
    `лентата я няма и променливата се върна на 0px (${barR.varH}, class ${barR.bodyClass})`, barR);
ok(Math.abs(numPx(resetScroll.bottom) - numPx(baseScroll.bottom)) <= 1 && resetScroll.inlineBottom === '80px',
    `bottom на стрелката се върна на първоначалната стойност и инлайн стойността е разгъната (${resetScroll.bottom}, инлайн „${resetScroll.inlineBottom}")`,
    { resetScroll, baseScroll });
if (resetFab.present) {
    ok(Math.abs(numPx(resetFab.bottom) - numPx(baseFab.bottom)) <= 0.6 && resetFab.inlineBottom === '10px',
        `bottom на асистента се върна на първоначалната стойност (${resetFab.bottom}, инлайн „${resetFab.inlineBottom}")`, { resetFab, baseFab });
}
ok(Math.abs(numPx(resetToast.bottom) - numPx(baseToast.bottom)) <= 1,
    `bottom на съобщенията се върна на 0px (${resetToast.bottom})`, { resetToast, baseToast });
ok(Math.abs(numPx(resetPopup.bottom) - numPx(basePopup.bottom)) <= 1,
    `bottom на менюто на бордовете се върна на 20px (${resetPopup.bottom})`, { resetPopup, basePopup });

tick('до тук: 14) избутване на бутоните');

// --- 15) Фонът на лентата е 50% прозрачен ---------------------------------------------------
// Собственикът (24.10.2026): „направи фона на лентата 50% прозрачен". Мери се ИЗЧИСЛЕНИЯТ цвят, не
// текстът в stylesheet-а: rgba(...) с алфа точно 0.5 и същият тон като преди (#37474F).
// Предишната част остави 2 отворени бележки (лентата я няма) - отварят се още две, за да е на
// екрана наистина.
for (const key of ['call', 'book']) await openNote(key);
await settle();
ok((await windowsState()).open.length >= 1 && !hidden(await barState()),
    `лентата е на екрана, преди да се мери фонът ѝ (отворени ${(await windowsState()).open.length})`);
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

// --- 16) Бутоните „скрий/покажи всички" са с двойни стрелки, не с око -----------------------
// Собственикът: „бутонът око да стане със стрелки вместо око". Двойна стрелка НАДОЛУ значи „скрий
// всички", двойна НАГОРЕ - „покажи всички".
s = await barState();
ok(!!s.hideBtn.present && s.hideBtn.mode === 'hide' && s.hideBtn.circles === 0 && s.hideBtn.paths.length === 2
    && s.hideBtn.paths.every(d => /l6 5\.6/.test(d)),
    `в състояние „скрий" иконата е две стрелки надолу, без око (${s.hideBtn.paths.join(' | ')})`, s.hideBtn);
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
s = await barState();
ok(!!s.hideBtn.present && s.hideBtn.mode === 'show' && s.hideBtn.circles === 0 && s.hideBtn.paths.length === 2
    && s.hideBtn.paths.every(d => /l6-5\.6/.test(d)),
    `в състояние „покажи" иконата е две стрелки нагоре, без око (${s.hideBtn.paths.join(' | ')})`, s.hideBtn);
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
s = await barState();
ok(!!s.hideBtn.present && s.hideBtn.mode === 'hide' && s.hideBtn.paths.every(d => /l6 5\.6/.test(d)),
    `връщането в „скрий" връща стрелките надолу (${s.hideBtn.mode})`, s.hideBtn);

tick('до тук: 15-16) прозрачен фон и стрелки');

// --- 17) Разпъната бележка при видима лента: долната ѝ част свършва НАД лентата -------------
// Собственикът (24.10.2026): „extended mode на бележката трябва да се съобразява с наличието на
// лента, защото бутоните на бележката се скриват зад нея (когато я има)".
// Лентата е position: fixed в дъното и се рисува НАД прозорците, а разпънатата бележка беше висока
// 100% от екрана - значи долната ѝ част (футърът с датата) оставаше зад лентата. Сега кутията
// свършва 8px над лентата.
// Мерките тук са от истинския екран: getBoundingClientRect + document.elementFromPoint, тоест
// проверява се какво ВСЪЩНОСТ стои под пръста, а не само числа от стилове.
// Адаптация към main: разпъването е на ПРОЗОРЕЦА (win.expanded + клас .note-window-expanded), не на
// body, и бележката няма долен ред с кръгли бутони - долната ѝ част е футърът .modal-note-footer с
// датата (cx-ският .note-cal-row). Затова се проверяват кутията, футърът и ВСЕКИ бутон в бележката.
const expandedBottomState = () => page.evaluate(() => {
    const list = getOpenNoteWindows();
    // Мерките са за РАЗПЪНАТИЯ прозорец, а не за активния: активен може да стане друг (затваряне на
    // съседна бележка го прави активна) и тогава проверката щеше да мери свит прозорец.
    const win = list.find(w => w.expanded) || list.find(w => w.el.classList.contains('note-window-active')) || list[0];
    const bar = document.getElementById('open-notes-bar');
    const round = v => Math.round(v * 10) / 10;
    if (!win) return { win: false, openCount: list.length };
    const box = win.box;
    const br = box.getBoundingClientRect();
    const barR = bar ? bar.getBoundingClientRect() : null;
    const footer = box.querySelector('.modal-note-footer');
    const footerVisible = !!footer && !footer.hidden
        && getComputedStyle(footer).display !== 'none' && footer.getBoundingClientRect().height > 0;
    const at = (el) => {
        const r = el.getBoundingClientRect();
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return {
            which: el.id || el.className,
            x: round(x), y: round(y), w: round(r.width), h: round(r.height),
            top: round(r.top), bottom: round(r.bottom),
            // Елемент на лентата под пръста значи, че елементът е ЗАД лентата - точно оплакването.
            inBar: !!hit && !!hit.closest && !!hit.closest('#open-notes-bar'),
            // Иначе точката трябва да е върху самия елемент (или нещо в същата бележка).
            hitsSelf: !!hit && (hit === el || el.contains(hit) || (!!hit.closest && !!hit.closest('.note-window'))),
            hitDesc: hit ? (hit.id || hit.className || hit.tagName) : null,
        };
    };
    const buttons = [...box.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height > 0).map(at);
    return {
        win: true,
        openCount: list.length,
        gdid: win.body.dataset.gdid || '',
        expanded: !!win.expanded,
        cls: win.el.classList.contains('note-window-expanded'),
        bodyExpanded: document.body.classList.contains('modal-note-expanded'),
        bodyBar: document.body.classList.contains('open-notes-bar-visible'),
        boxTop: round(br.top), boxBottom: round(br.bottom), boxH: round(br.height),
        barVisible: !!bar && bar.classList.contains('is-visible') && getComputedStyle(bar).display !== 'none',
        barTop: barR ? round(barR.top) : null,
        barH: barR ? round(barR.height) : 0,
        varH: getComputedStyle(document.documentElement).getPropertyValue('--open-notes-bar-h').trim(),
        viewH: window.innerHeight, viewW: window.innerWidth,
        footer: footerVisible ? at(footer) : null,
        buttons,
    };
});

// Разпъването/свиването става през истинския бутон в хедъра на активната бележка.
const clickExpand = () => page.evaluate(() => {
    const list = getOpenNoteWindows();
    const win = list.find(w => w.el.classList.contains('note-window-active')) || list[0];
    if (!win || !win.expandBtn) return false;
    activateNoteWindow(win, true);
    win.expandBtn.click();
    return true;
});
const waitExpanded = (want) => page.waitForFunction((w) => {
    const list = getOpenNoteWindows();
    const win = list.find(x => x.expanded);
    return w ? !!win : !list.some(x => x.expanded);
}, want, { timeout: 3000 }).catch(() => { });

// Кутията влиза с „поп" (transform: scale(0.7) → scale(1), 0.4s) - докато трае, мярката ѝ е
// по-малка и по-навътре от истинската, тоест проверката за пролука лъже. Затова се чака
// ИЗЧИСЛЕНИЯТ transform да е точно единичен (или none), вместо да се спи фиксирано време.
const waitBoxSettled = () => page.waitForFunction(() => {
    const list = getOpenNoteWindows();
    const win = list.find(w => w.expanded) || list.find(w => w.el.classList.contains('note-window-active')) || list[0];
    if (!win || !win.box) return true;
    const t = getComputedStyle(win.box).transform;
    if (!t || t === 'none') return true;
    const m = /^matrix\(([^)]+)\)$/.exec(t);
    if (!m) return true;
    const p = m[1].split(',').map(Number);
    return Math.abs(p[0] - 1) < 0.002 && Math.abs(p[3] - 1) < 0.002 && Math.abs(p[5]) < 0.5;
}, null, { timeout: 3000 }).catch(() => { });
const settleAll = async () => { await settle(); await waitBoxSettled(); await settle(); };

// Трите проверки на разпънатата бележка при видима лента - едни и същи на широк и на тесен екран.
const checkExpandedClearance = async (label) => {
    const st = await expandedBottomState();
    ok(st.win && st.expanded && st.cls && st.bodyExpanded,
        `${label}: бележката е разпъната (${st.gdid}, expanded ${st.expanded}, клас ${st.cls}, клас на body ${st.bodyExpanded})`, st);
    ok(st.barVisible && st.bodyBar,
        `${label}: лентата е на екрана (${st.barTop}..${st.boxBottom})`, st);
    ok(st.barTop !== null && st.boxBottom <= st.barTop - 4,
        `${label}: кутията на бележката свършва НАД лентата (${st.boxBottom} <= ${st.barTop} - 4)`, st);
    // Всеки бутон в бележката се натиска: под центъра му НЕ стои елемент на лентата.
    const blocked = st.buttons.filter(b => b.inBar || !b.hitsSelf);
    ok(st.buttons.length >= 4 && blocked.length === 0,
        `${label}: всеки от ${st.buttons.length} бутона в бележката е над лентата (${blocked.map(b => b.which + '@' + b.x + ',' + b.y + '→' + b.hitDesc).join(' | ') || 'нито един закрит'})`,
        { blocked, buttons: st.buttons });
    // Футърът с датата е последният елемент в кутията - той е първият, който лентата закриваше.
    ok(!!st.footer, `${label}: долната част на бележката (футърът с датата) е видима - има какво да се закрие`, st);
    if (st.footer) {
        ok(st.footer.bottom <= st.barTop - 4 && !st.footer.inBar && st.footer.hitsSelf,
            `${label}: футърът с датата е изцяло над лентата (${st.footer.bottom} <= ${st.barTop} - 4, под центъра: ${st.footer.hitDesc})`,
            st.footer);
    }
    return st;
};

// Три отворени бележки, последната със зададена дата - тя е активна, значи нея разпъваме.
const openThreeForClearance = async () => {
    const closed = await closeAllOpenNotes();
    await settle();
    for (const key of ['photo', 'bread', 'dated']) await openNote(key);
    await settle();
    await clearToast();
    return closed;
};

// Един пълен кръг на един екран: разпъване при видима лента, свиване, пак разпъване и изчезване на
// лентата, когато бележките станат 2.
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

    // а) Разпъване при ВИДИМА лента: цялата кутия свършва над нея, с 8px пролука.
    ok(await clickExpand(), `${label}: разпъването минава през бутона в хедъра при видима лента`);
    await waitExpanded(true);
    await settleAll();
    st = await checkExpandedClearance(label);
    ok(Math.abs(st.boxBottom - (st.barTop - 8)) <= 2,
        `${label}: кутията свършва с 8px пролука над лентата (${st.boxBottom} срещу ${st.barTop - 8})`, st);

    // б) Свиване при ВИДИМА лента: долният ръб се връща точно на мястото си - без остатъчна пролука.
    ok(await clickExpand(), `${label}: свиването минава през същия бутон`);
    await waitExpanded(false);
    await settleAll();
    st = await expandedBottomState();
    ok(!st.expanded && !st.cls, `${label}: бележката е свита (expanded ${st.expanded}, клас ${st.cls})`, st);
    ok(Math.abs(st.boxBottom - collapsedBottom) <= 4,
        `${label}: долният ръб на кутията се върна на мястото отпреди разпъването (${st.boxBottom} срещу ${collapsedBottom})`,
        { st, collapsedBottom });

    // в) Пак разпъване, а после лентата слиза от екрана: бележката си връща цялата височина.
    // Лентата вече се показва, докато има отворена бележка (собственикът, 25.10.2026), значи
    // „лентата я няма, а бележката е отворена" не се стига със затваряне на бележки. Затова тук се
    // прави ТОЧНО това, което прави и приложението, когато лентата слиза (refreshOpenNotesBar →
    // syncOpenNotesBarLift(false)): класът на body се маха и променливата се връща на 0px.
    ok(await clickExpand(), `${label}: разпъването минава втори път`);
    await waitExpanded(true);
    await settleAll();
    st = await checkExpandedClearance(label + ' (второ разпъване)');
    // Точно двете неща, които приложението прави, когато лентата слиза от екрана: маха класа
    // 'is-visible' на самата лента и изчиства избутването (клас на body + променливата на 0px).
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
    // И долната ѝ част вече не е ограничена от нищо: стига до дъното на екрана.
    ok(!!st.footer && st.footer.bottom <= st.viewH + 0.5,
        `${label}: футърът с датата е на дъното на екрана, без остатъчна пролука (${st.footer && st.footer.bottom} <= ${st.viewH})`, st.footer);
    // Връщане на лентата (същият път, по който се появява): бележката пак свършва над нея.
    await page.evaluate(() => refreshOpenNotesBar());
    await settleAll();
    st = await checkExpandedClearance(label + ' (лентата се връща)');
    ok(Math.abs(st.boxBottom - (st.barTop - 8)) <= 2,
        `${label}: щом лентата се върне, кутията пак свършва 8px над нея (${st.boxBottom} срещу ${st.barTop - 8})`, st);
    ok(await clickExpand(), `${label}: свиването след това минава`);
    await waitExpanded(false);
    await settle();
};

tick('17a) подготовка');
await clearanceScenario('широк екран', { width: 1280, height: 900 });
tick('17b) 1280x900');
await clearanceScenario('телефон', { width: 390, height: 844 });
tick('17c) 390x844');
await page.setViewportSize({ width: 1280, height: 900 });
await settle();
tick('до тук: 17) разпъната бележка над лентата');

// --- 18) Клик на плочката на активната бележка я скрива, втори клик я показва -----------------
// Собственикът (24.10.2026): „ако имаме лента и кликнем бутона на активната бележка веднъж - тя да
// се скрива, втори път - показва се". Тук се проверява по истинския път: истински кликове с
// показалеца върху плочките и истински прозорци (showModal).
ok(await closeAllOpenNotes(), '18) изходно: няма отворени бележки');
for (const key of ['bread', 'plan', 'call']) await openNote(key);
await settle();
s = await barState();
let ws18 = await windowsState();
ok(ws18.open.length === 3 && !hidden(s) && s.tiles.length === 3,
    `18) три бележки са отворени, лентата е видима с 3 плочки (${ws18.open.length}, display ${s.display})`, s.tiles.map(t => t.key));

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
    return st.tiles.find(x => (x.key || '').includes(gdid)) || null;
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
ok(await clickTile('BAR2'), '18) клик на плочката на BAR2 минава');
ws18 = await windowsState();
ok(ws18.activeGdid === 'BAR2' && winOf(ws18, 'BAR2').z === ws18.maxZ && (await tileStateOf('BAR2')).active,
    `18) клик на плочка на друга видима бележка я прави активна и най-отпред (${ws18.activeGdid}, z ${winOf(ws18, 'BAR2').z} от ${ws18.maxZ})`, ws18.open);

// --- Първи клик на плочката на активната: бележката се скрива -------------------------------
ok(await clickTile('BAR2'), '18) клик на плочката на активната бележка BAR2 минава');
s = await barState();
ws18 = await windowsState();
const p18hidden = await winProbe('BAR2');
ok(p18hidden.hidden === true && p18hidden.hidClass === true,
    `18) клик на плочката на активната бележка я скрива (hidden ${p18hidden.hidden}, клас ${p18hidden.hidClass})`, p18hidden);
ok(p18hidden.display === 'none' && p18hidden.boxH === 0,
    `18) скритият прозорец не се вижда (display ${p18hidden.display}, височина ${p18hidden.boxH})`, p18hidden);
const t18hidden = await tileStateOf('BAR2');
// Приглушаването е с преход (opacity 1 -> 0.55), значи тук се проверява КЛАСЪТ, а не междинната
// стойност; самата непрозрачност се мери в част 10, след като преходът е свършил.
ok(!!t18hidden && t18hidden.hiddenTile === true && t18hidden.active === false,
    `18) плочката на скритата бележка получава is-hidden и вече не е откроена (is-hidden ${t18hidden && t18hidden.hiddenTile}, is-active ${t18hidden && t18hidden.active})`, t18hidden);
const p18others = [await winProbe('BAR3'), await winProbe('BAR4')];
ok(p18others.every(p => p.hidden === false && p.hidClass === false && p.display !== 'none' && p.boxH > 0),
    `18) другите две бележки остават видими (${p18others.map(p => p.hidden ? 'h' : 'v').join('')})`, p18others);
ok(ws18.open.length === 3 && !hidden(s) && s.tiles.length === 3,
    `18) скриването не затваря бележката и лентата остава (отворени ${ws18.open.length}, плочки ${s.tiles.length})`, ws18.open.map(w => w.hidden));
// „Активна, но невидима" бележка би поела клавиатурния вход и писането - активността минава към
// друга ВИДИМА бележка, без да я вдига отпред.
ok(ws18.activeGdid !== 'BAR2' && ws18.activeGdid !== ''
    && (winOf(ws18, ws18.activeGdid) || {}).hidden === false,
    `18) активността минава към друга ВИДИМА бележка (${ws18.activeGdid})`, ws18.open);
ok(s.hideBtn.mode === 'hide' && /Скрий всички бележки/.test(s.hideBtn.title || ''),
    `18) бутонът „скрий/покажи всички" не сменя ролята си, щом не всички са скрити (mode ${s.hideBtn.mode})`, s.hideBtn);

// --- Втори клик на СЪЩАТА плочка: бележката се връща на екрана и става активна --------------
ok(await clickTile('BAR2'), '18) втори клик на същата плочка минава');
s = await barState();
ws18 = await windowsState();
const p18back = await winProbe('BAR2');
ok(p18back.hidden === false && p18back.hidClass === false && p18back.display !== 'none' && p18back.boxH > 0,
    `18) вторият клик връща бележката на екрана (hidden ${p18back.hidden}, display ${p18back.display}, височина ${p18back.boxH})`, p18back);
const t18back = await tileStateOf('BAR2');
ok(!!t18back && t18back.hiddenTile === false && t18back.active === true,
    `18) плочката вече не е приглушена и отново е откроена (is-hidden ${t18back && t18back.hiddenTile}, is-active ${t18back && t18back.active})`, t18back);
ok(p18back.active === true && ws18.activeGdid === 'BAR2' && p18back.z === ws18.maxZ,
    `18) върнатата бележка е активна и най-отпред (${ws18.activeGdid}, z ${p18back.z} от ${ws18.maxZ})`, ws18.open);
ok(ws18.open.length === 3 && ws18.open.every(w => w.hidden === false),
    `18) след връщането и трите бележки са видими (${ws18.open.map(w => w.hidden ? 'h' : 'v').join('')})`, ws18.open.map(w => w.hidden));

// --- Клик на плочката на СКРИТА бележка я показва и я прави активна --------------------------
ok(await clickTile('BAR2'), '18) BAR2 се скрива пак с клик на плочката си');
ws18 = await windowsState();
ok((await winProbe('BAR2')).hidden === true && ws18.activeGdid !== 'BAR2',
    `18) BAR2 е скрита, активна е друга бележка (${ws18.activeGdid})`, ws18.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')));
// Видима, но НЕактивна бележка: клик на плочката ѝ я активира (старото поведение не е счупено).
const otherVisible = (ws18.open.find(w => !w.hidden && w.gdid !== ws18.activeGdid) || {}).gdid;
ok(!!otherVisible && await clickTile(otherVisible), `18) клик на плочката на другата видима бележка (${otherVisible}) минава`);
ws18 = await windowsState();
ok(ws18.activeGdid === otherVisible && winOf(ws18, otherVisible).hidden === false
    && winOf(ws18, otherVisible).z === ws18.maxZ && (await winProbe('BAR2')).hidden === true,
    `18) клик на плочка на друга видима бележка я активира и вдига, а скритата си остава скрита (active ${ws18.activeGdid})`, ws18.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')));
ok(await clickTile('BAR2'), '18) клик на плочката на СКРИТАТА BAR2 минава');
ws18 = await windowsState();
const p18shown = await winProbe('BAR2');
ok(p18shown.hidden === false && p18shown.display !== 'none' && p18shown.active === true && p18shown.z === ws18.maxZ,
    `18) скрита бележка се показва и става активна от клик на плочката си (hidden ${p18shown.hidden}, active ${p18shown.active}, z ${p18shown.z} от ${ws18.maxZ})`, p18shown);
ok(ws18.open.length === 3 && ws18.open.every(w => w.hidden === false),
    `18) и трите бележки са видими след това (${ws18.open.map(w => w.hidden ? 'h' : 'v').join('')})`, ws18.open.map(w => w.hidden));

// --- Плъзгане по лентата не скрива и не показва нищо ----------------------------------------
// Показалецът натиска ВЪРХУ плочка, минава повече от 6px и пуска пак върху нея: това е плъзгане,
// а не клик - значи превключването не бива да се задейства (иначе плъзгането по лентата щеше да
// крие бележки). Показалецът идва през истинския вход на браузъра, не през изкуствено събитие.
const ws18BeforeDrag = await windowsState();
const s18BeforeDrag = await barState();
const dragIdx = s18BeforeDrag.tiles.findIndex(t => (t.key || '').includes(ws18BeforeDrag.activeGdid));
const dragBox = await page.locator('#open-notes-bar .open-notes-bar-tile').nth(dragIdx).boundingBox();
await page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
await page.mouse.down();
await page.mouse.move(dragBox.x + dragBox.width / 2 + 12, dragBox.y + dragBox.height / 2, { steps: 8 });
await page.mouse.up();
await settle();
const ws18AfterDrag = await windowsState();
const p18afterDrag = await winProbe(ws18BeforeDrag.activeGdid);
const t18afterDrag = await tileStateOf(ws18BeforeDrag.activeGdid);
ok(ws18AfterDrag.activeGdid === ws18BeforeDrag.activeGdid && p18afterDrag.hidden === false
    && ws18AfterDrag.open.every(w => w.hidden === false),
    `18) плъзгане по лентата не скрива бележка (active ${ws18BeforeDrag.activeGdid} -> ${ws18AfterDrag.activeGdid}, hidden ${p18afterDrag.hidden})`,
    { before: ws18BeforeDrag.activeGdid, after: ws18AfterDrag.activeGdid });
ok(!!t18afterDrag && t18afterDrag.hiddenTile === false && !(await hidden(await barState())),
    '18) нито една плочка не става is-hidden от плъзгане и лентата остава видима', t18afterDrag);

// --- 18б) Последната ВИДИМА бележка: активността остава, лентата не изчезва ------------------
// Когато друга видима бележка няма, активността не се мести (същото като „скрий всички") - иначе
// getTopNoteWindow() връща и скритите и активна щеше да стане невидима бележка.
for (let i = 0; i < 3; i++) {
    const activeG = (await windowsState()).activeGdid;
    ok(!!activeG && await clickTile(activeG), `18б) клик на плочката на активната ${activeG} (${i + 1}/3) минава`);
    ok((await winProbe(activeG)).hidden === true, `18б) ${activeG} се скри от клик на плочката си (${i + 1}/3)`);
}
s = await barState();
ws18 = await windowsState();
const activeCount18 = await page.evaluate(() => getOpenNoteWindows().filter(w => w.el.classList.contains('note-window-active')).length);
ok(ws18.open.length === 3 && ws18.open.every(w => w.hidden === true),
    `18б) и трите бележки са скрити, но нито една не е затворена (${ws18.open.map(w => w.hidden ? 'h' : 'v').join('')})`, ws18.open);
ok(activeCount18 === 1,
    `18б) активна остава точно една бележка, както при „скрий всички" (${activeCount18})`, activeCount18);
ok(!hidden(s) && s.tiles.length === 3 && s.tiles.every(t => t.hiddenTile),
    `18б) лентата остава с три приглушени плочки (display ${s.display})`, s.tiles.map(t => t.hiddenTile));
ok(s.hideBtn.mode === 'show' && /Покажи всички бележки/.test(s.hideBtn.title || ''),
    `18б) щом всички са скрити, бутонът става „покажи всички" (mode ${s.hideBtn.mode})`, s.hideBtn);
// И обратно: клик на скрита плочка връща точно нея - вторият клик от превключването.
const lastHiddenG = ws18.open[0].gdid;
ok(await clickTile(lastHiddenG), `18б) клик на плочката на скритата ${lastHiddenG} минава`);
ws18 = await windowsState();
ok(ws18.open.filter(w => !w.hidden).length === 1 && (await winProbe(lastHiddenG)).active === true,
    `18б) връща се само тя и става активна (${ws18.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).join(' ')})`, ws18.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')));

tick('до тук: 18) превключване от плочка');

// --- 18в) Връщане на ЕДИНСТВЕНАТА скрита бележка през плочката: приглушаването пада ВЕДНАГА ------
// Дефектът, потвърден от собственика на живо в main (b1.40): при ЕДНА отворена бележка „Скрий всички"
// я скрива, клик на плочката я връща на екрана, но плочката остава приглушена (is-hidden) до
// следващото опресняване на лентата. Причината: активната бележка не се сменя, значи activateNoteWindow
// не влиза в клона за смяна на активната, а raiseNoteWindow излиза още в началото (прозорецът вече е
// най-отпред) - затова от b1.41 activateNoteWindow опреснява лентата и след вдигането на прозореца.
ok(await closeAllOpenNotes(), '18в) изходно: няма отворени бележки');
await openNote('bread');
await settle();
s = await barState();
ws18 = await windowsState();
ok(ws18.open.length === 1 && !hidden(s) && s.tiles.length === 1,
    `18в) една отворена бележка: лентата е видима с една плочка (отворени ${ws18.open.length}, плочки ${s.tiles.length})`, s.tiles.map(t => t.key));
const t18vStart = tileOf(s, 0);
ok(!!t18vStart && t18vStart.hiddenTile === false,
    `18в) изходно плочката не е приглушена (is-hidden ${t18vStart && t18vStart.hiddenTile})`, t18vStart);

// „Скрий всички" от лентата: бележката изчезва от екрана, плочката се приглушава.
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
ws18 = await windowsState();
s = await barState();
ok(ws18.open.length === 1 && ws18.open[0].hidden === true && !hidden(s) && s.tiles.length === 1,
    `18в) „скрий всички" скрива единствената бележка, а лентата остава (hidden ${ws18.open[0].hidden}, display ${s.display}, плочки ${s.tiles.length})`, ws18.open);
const t18vHidden = tileOf(s, 0);
ok(!!t18vHidden && t18vHidden.hiddenTile === true,
    `18в) плочката на скритата бележка е приглушена (is-hidden ${t18vHidden && t18vHidden.hiddenTile})`, t18vHidden);

// Клик на плочката: бележката се връща на екрана И плочката вече не е приглушена - в същия кадър,
// без никакво друго опресняване на лентата.
await page.locator('#open-notes-bar .open-notes-bar-tile').nth(0).click();
await settle();
ws18 = await windowsState();
s = await barState();
const p18v = await winProbe(ws18.open[0].gdid);
ok(p18v.hidden === false && p18v.hidClass === false && p18v.display !== 'none' && p18v.boxH > 0,
    `18в) клик на плочката връща бележката на екрана (hidden ${p18v.hidden}, display ${p18v.display}, височина ${p18v.boxH})`, p18v);
const t18vBack = tileOf(s, 0);
ok(!!t18vBack && t18vBack.hiddenTile === false,
    `18в) плочката вече НЕ е приглушена веднага след клика (is-hidden ${t18vBack && t18vBack.hiddenTile})`, t18vBack);
ok(!!t18vBack && t18vBack.active === true && ws18.activeGdid === ws18.open[0].gdid,
    `18в) върнатата бележка е активна и плочката е откроена (${ws18.activeGdid})`, ws18.open);
// Приглушаването е с преход (opacity 0.55 -> 1): непрозрачността се чака да стигне 1, вместо да се
// спи фиксирано време - иначе понякога се мери средата на прехода.
const op18v = await page.waitForFunction(() => {
    const t = document.querySelector('#open-notes-bar .open-notes-bar-tile');
    return !!t && Number(getComputedStyle(t).opacity) === 1;
}, null, { timeout: 3000 }).then(() => true).catch(() => false);
const t18vOpacity = tileOf(s, 0);
ok(op18v, `18в) непрозрачността на плочката се връща на 1 (${t18vOpacity && t18vOpacity.opacity})`, t18vOpacity);
ok(s.tiles.length === 1 && !hidden(s) && s.hideBtn.mode === 'hide',
    `18в) лентата остава с една плочка и бутон „скрий всички" (плочки ${s.tiles.length}, mode ${s.hideBtn.mode})`, s.tiles.map(t => t.key));

tick('до тук: 18в) връщане на единствената скрита бележка');

// --- 19) Лентата работи и в пълноекранен режим на приложението („extended") ------------------
// Пълноекранният режим скрива хедъра и разпъва търсенето (localStorage['extendedMode']); лентата е
// закачена за долния ръб и не бива да се разваля от него.
ok(await closeAllOpenNotes(), '19) изходно: няма отворени бележки');
const extended = await page.evaluate(() => {
    if (typeof toggleHeaderFullscreen !== 'function') return { available: false };
    const header = document.querySelector('header');
    if (!header.classList.contains('header-fullscreen')) toggleHeaderFullscreen();
    return {
        available: true,
        on: header.classList.contains('header-fullscreen'),
        stored: localStorage.getItem('extendedMode'),
    };
});
ok(extended.available && extended.on && extended.stored === 'true',
    `19) пълноекранният режим е включен през истинската си функция (${JSON.stringify(extended)})`, extended);
await settle();
for (const key of ['photo', 'bread', 'plan']) await openNote(key);
await settle();
s = await barState();
barR = await barRect();
ok(!hidden(s) && s.tiles.length === 3,
    `19) в пълноекранен режим лентата се появява с 3 плочки (display ${s.display}, ${s.tiles.length})`, s.tiles.map(t => t.key));
ok(!hidden(barR) && numPx(barR.varH) === Math.round(barR.rectH),
    `19) височината на лентата е измерена и в променливата (${barR.varH} срещу ${barR.rectH}px)`, barR);
ok((await floaterState('scrollTopBtn')).rectBottom <= barR.rectTop + 0.5,
    `19) стрелката нагоре е над лентата и в пълноекранен режим (${(await floaterState('scrollTopBtn')).rectBottom} <= ${barR.rectTop})`);
await page.locator('#open-notes-bar .open-notes-bar-tile').nth(1).click();
await settle();
s = await barState();
const ws19 = await windowsState();
ok(ws19.activeGdid === 'BAR2' && tileOf(s, 1).active,
    `19) клик на плочка активира бележката и в пълноекранен режим (${ws19.activeGdid}, ${s.tiles.map(t => t.active ? 'A' : '-').join('')})`, ws19.open);
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
ok((await windowsState()).open.every(w => w.hidden) && !hidden(await barState()),
    '19) „скрий всички" работи и в пълноекранен режим');
await page.locator('#open-notes-bar .open-notes-bar-hide').click();
await settle();
ok((await windowsState()).open.every(w => !w.hidden), '19) „покажи всички" ги връща и в пълноекранен режим');
const restored = await page.evaluate(() => {
    const header = document.querySelector('header');
    if (header.classList.contains('header-fullscreen')) toggleHeaderFullscreen();
    return header.classList.contains('header-fullscreen');
});
ok(restored === false, '19) пълноекранният режим се изключва обратно');

tick('до тук: 19) пълноекранен режим');

// --- 20) Задържане (500ms) на плочка в лентата ЗАТВАРЯ точно тази бележка ----------------------
// Собственикът (25.10.2026): „дълго натискане на мини бутон в лентата долу с отворените бележки да
// затваря съответната бележка". Задържането минава по същия път като хиксчето в прозореца, значи
// бележката не се скрива, а се ЗАТВАРЯ: изчезва и от getOpenNoteWindows(), и плочката ѝ от реда.
// Пуска се с истинския вход на браузъра (показалец надолу - изчакване - нагоре), не с изкуствено
// събитие; изчакването е до самото затваряне, а не фиксирано време.
const tileBoxFor = async (gdid) => {
    const idx = await tileIndexFor(gdid);
    if (idx < 0) return null;
    return page.locator('#open-notes-bar .open-notes-bar-tile').nth(idx).boundingBox();
};
// Задържане върху плочката на бележка: чака САМОТО затваряне (до 3s), после пуска показалеца.
const longPressTile = async (gdid) => {
    const box = await tileBoxFor(gdid);
    if (!box) return { pressed: false, closed: false };
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    const closed = await page.waitForFunction(
        g => !getOpenNoteWindows().some(w => (w.body.dataset.gdid || '') === g),
        gdid, { timeout: 3000 }
    ).then(() => true).catch(() => false);
    await page.mouse.up();
    await settle();
    return { pressed: true, closed };
};

ok(await closeAllOpenNotes(), '20) изходно: няма отворени бележки');
for (const key of ['bread', 'plan', 'call']) await openNote(key);
await settle();
s = await barState();
let ws20 = await windowsState();
ok(ws20.open.length === 3 && !hidden(s) && s.tiles.length === 3,
    `20) три бележки са отворени, лентата е видима с 3 плочки (${ws20.open.length}, display ${s.display})`, s.tiles.map(t => t.key));
const active20 = ws20.activeGdid;
const order20 = s.tiles.map(t => String(t.key || ''));

// а) Контрола: обикновеният клик НЕ затваря - плочката на активната бележка я скрива, както досега.
ok(await clickTile(active20), `20а) клик на плочката на активната ${active20} минава`);
ws20 = await windowsState();
let p20 = await winProbe(active20);
s = await barState();
ok(ws20.open.length === 3 && p20.present && p20.hidden === true && p20.display === 'none',
    `20а) обикновеният клик СКРИВА бележката, но не я затваря (отворени ${ws20.open.length}, hidden ${p20.hidden}, display ${p20.display})`, p20);
ok(s.tiles.length === 3 && !hidden(s),
    `20а) лентата остава с трите плочки (${s.tiles.length}, display ${s.display})`, s.tiles.map(t => t.key));

// б) Задържане върху плочката на СКРИТАТА бележка: тя се ЗАТВАРЯ (не само скрива).
const lp20hidden = await longPressTile(active20);
ws20 = await windowsState();
s = await barState();
ok(lp20hidden.pressed && lp20hidden.closed,
    `20б) задържане на плочката затваря бележката ${active20} (затвори се: ${lp20hidden.closed})`, lp20hidden);
ok(!ws20.open.some(w => w.gdid === active20) && ws20.open.length === 2,
    `20б) затворената бележка изчезва от отворените (отворени ${ws20.open.map(w => w.gdid).join(',')})`, ws20.open);
ok(s.tiles.length === 2 && !s.tiles.some(t => String(t.key || '').includes(active20)),
    `20б) и плочката ѝ изчезва от реда (плочки ${s.tiles.length})`, s.tiles.map(t => t.key));
ok(JSON.stringify(s.tiles.map(t => String(t.key || ''))) === JSON.stringify(order20.filter(k => !k.includes(active20))),
    '20б) останалите плочки са в същия ред', { before: order20, after: s.tiles.map(t => t.key) });

// в) Задържане върху плочката на ВИДИМА бележка: затваря се точно тя, другите остават.
const visible20 = (ws20.open.find(w => !w.hidden) || {}).gdid;
const orderBefore20 = (await barState()).tiles.map(t => String(t.key || ''));
const lp20 = await longPressTile(visible20);
ws20 = await windowsState();
s = await barState();
ok(lp20.pressed && lp20.closed && !ws20.open.some(w => w.gdid === visible20),
    `20в) задържане на плочката затваря видимата бележка ${visible20} (отворени ${ws20.open.map(w => w.gdid).join(',')})`, lp20);
const expected20 = orderBefore20.filter(k => !k.includes(visible20));
ok(s.tiles.length === 1 && JSON.stringify(s.tiles.map(t => String(t.key || ''))) === JSON.stringify(expected20),
    `20в) в реда остава само другата плочка, на същото място (${s.tiles.map(t => t.key).join(',')})`, { expected20, after: s.tiles.map(t => t.key) });
ok(ws20.open.length === 1 && ws20.open[0].hidden === false && !hidden(s),
    `20в) другата бележка остава отворена и видима, лентата остава (${ws20.open.map(w => w.gdid + (w.hidden ? 'h' : 'v')).join(' ')})`, { ws: ws20.open, display: s.display });

// г) Контрола: движение на показалеца над 6px преди 500ms ОТМЕНЯ задържането - бележката остава
// отворена (иначе плъзгане по лентата щеше да затваря бележки).
const keep20 = ws20.open[0].gdid;
const keepBox20 = await tileBoxFor(keep20);
ok(!!keepBox20, `20г) плочката на ${keep20} е на екрана`, keepBox20);
if (keepBox20) {
    await page.mouse.move(keepBox20.x + keepBox20.width / 2, keepBox20.y + keepBox20.height / 2);
    await page.mouse.down();
    await page.mouse.move(keepBox20.x + keepBox20.width / 2 + 22, keepBox20.y + keepBox20.height / 2, { steps: 6 });
    // Задържането е 500ms, значи тук се чака повече от него: ако движението не отменяше, бележката
    // щеше да е затворена вече.
    await page.waitForTimeout(700);
    await page.mouse.up();
    await settle();
}
ws20 = await windowsState();
p20 = await winProbe(keep20);
s = await barState();
ok(ws20.open.length === 1 && p20.present && p20.hidden === false && p20.display !== 'none',
    `20г) движение над 6px отменя задържането - бележката остава отворена и видима (отворени ${ws20.open.length}, hidden ${p20.hidden}, display ${p20.display})`, p20);
ok(s.tiles.length === 1 && !hidden(s),
    `20г) плочката ѝ остава в лентата (плочки ${s.tiles.length}, display ${s.display})`, s.tiles.map(t => t.key));

// --- 22) Плочката стига до снимката и когато първият ред ЗАПОЧВА със снимка, когато търсенето в
// Drive е бавно и когато адресът е готов само в тялото на бележката (b1.51) ----------------------
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
const firstReady = await waitTileThumb('BAR14', 8000);
const firstTile = await tileStateOf('BAR14');
const firstLetters = await lettersShown('BAR14');
ok(firstReady && /^https:\/\/thumb\.invalid\//.test((firstTile && firstTile.imgSrc) || ''),
    `22а) бележка, чийто първи ред започва със снимка, показва снимката в плочката (${firstTile && firstTile.imgSrc})`, firstTile);
ok(firstLetters === 'none',
    `22а) буквите отстъпват на снимката, вместо да стоят върху нея (display ${firstLetters})`, firstTile);
ok(!!firstTile && /Снимка/.test(firstTile.title || ''),
    `22а) заглавието на бележката пак се чете - снимката не маха текста (${firstTile && firstTile.title})`, firstTile);

// Б) Търсенето на файла по име в Drive е по-бавно от чакането на плочката (1s): повторните опити
// трябва да я довършат, вместо тя да остане с буквите до края на сесията.
const BAR_THUMB_WAIT = 1000; // същото като OPEN_NOTES_BAR_THUMB_WAIT в main.js
await page.evaluate((name) => { window.__barDriveDelay = { name, ms: 2500 }; }, SLOW_PHOTO);
const slowStart = Date.now();
await openNote('slowimg');
await settle();
const slowReady = await waitTileThumb('BAR15', 6000);
const slowElapsed = Date.now() - slowStart;
await page.evaluate(() => { window.__barDriveDelay = { name: '', ms: 0 }; });
const slowTile = await tileStateOf('BAR15');
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
}, { gdid: 'BAR16', file: BODY_FILE, src: BODY_SRC });
ok(injected.ok, '22в) снимката е сложена в тялото на бележката (както я рисува hydrateInlineImages)', injected);
const bodyReady = await waitTileThumb('BAR16', 3000);
const bodyTile = await tileStateOf('BAR16');
ok(bodyReady && (bodyTile && bodyTile.imgSrc) === BODY_SRC,
    `22в) плочката взима адреса от ТЯЛОТО на бележката, вместо да остане с букви (${bodyTile && bodyTile.imgSrc})`, bodyTile);

// Трите бележки се затварят през своя X: не остават таймери на повторните опити за края на теста.
for (const g of ['BAR14', 'BAR15', 'BAR16']) await closeNoteByX(g);
await settle();

// --- 21) Никакви грешки в конзолата / страницата -------------------------------------------
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);

await browser.close();
srv.close();
console.log(`${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
