// „Разширено търсене“ (b2.76). Собственикът (24.10.2026): „значи това не е точно лексикално търсене
// (щом не ползва индекс, RAG и т.н.), да го кръстим Разширено търсене“.
//
// Режимът е същият (българска нормализация: хомоглифи, ѝ→и, й→и, махане на членуване) — сменя се само
// името и се добавя кратък псевдоним. Проверява се по ИСТИНСКИЯ път в браузър (истински Chromium върху
// uni/, истинско писане с клавиатура в полето за търсене, истински клик по реда в списъка с команди):
//   - в списъка с команди („/?“) редът казва „Разширено търсене“ и „/adv“, а „Лексикално“ го няма никъде;
//   - клик по този ред слага „/adv “ в полето (не „/9 “);
//   - „/adv моливите“ намира бележката с „молив“ и командата остава в полето;
//   - „/9 моливите“ и „/lex моливите“ намират същото (старите псевдоними не са счупени);
//   - голо „/adv“ без дума не филтрира нищо — всички бележки остават видими;
//   - обикновеното „моливите“ (без команда) не намира нищо — тоест разширеният режим още е единственият,
//     който нормализира (а „молив“ без команда се намира, за да се види, че търсенето изобщо работи).
// Статично: и шестте i18n файла носят новото име и нито един — старото; main.js разпознава /adv и слага
// „/adv “ при клик; sw.js е вдигнат (сега b2.78); node --check на двата main.js и на sw.js.
// Пуска се от корена на хранилището:
//   node .bolter/check/advanced-search.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 500) : ''));
    if (!cond) fails++;
};

// ======================= СТАТИЧНО =======================
const BG_TEXT = '/9  или  /adv — Разширено търсене (нормализирано)';
const EN_TEXT = '/9  or  /adv — Advanced search (normalised)';

for (const rel of ['uni/lang/i18n-bg.json', 'lang/i18n-bg.json', 'local/lang/i18n-bg.json',
    'uni/lang/i18n-en.json', 'lang/i18n-en.json', 'local/lang/i18n-en.json']) {
    let raw = '', j = null;
    try { raw = await readFile(path.resolve(rel), 'utf8'); j = JSON.parse(raw); } catch (e) { /* отчита се по-долу */ }
    const want = rel.includes('-bg.') ? BG_TEXT : EN_TEXT;
    const last = j && Array.isArray(j.searchCommandsList) ? j.searchCommandsList[j.searchCommandsList.length - 1] : null;
    ok(!!last && last.text === want, `static: ${rel} — последната команда в списъка е „${want}“`, last);
    ok(!!raw && !/Лексикално|Lexical search/.test(raw), `static: ${rel} — старото име го няма никъде във файла`);
}

const mainPath = path.join(root, 'main.js');
const mainSrc = await readFile(mainPath, 'utf8');
const swSrc = await readFile(path.join(root, 'sw.js'), 'utf8');
ok(/const LEX_SEARCH_COMMAND_RE = \/\^\\s\*\\\/\(\?:9\|adv\|lex\)/.test(mainSrc),
    'static: LEX_SEARCH_COMMAND_RE разпознава /9, /adv и /lex');
ok(/\{ cmd: '\/9', text: '\/9 {2}or {2}\/adv — Advanced search \(normalised\)' \}/.test(mainSrc),
    'static: defaultList (английският резервен списък) показва „/adv — Advanced search (normalised)“');
const clickHandler = mainSrc.match(/else if \(parseSearchQuery\(cmd\)\.lex\) \{[\s\S]{0,400}?\n            \}/);
ok(!!clickHandler && /sBox\.value = '\/adv ';/.test(clickHandler[0]),
    'static: клик по реда в списъка слага „/adv “ в полето', clickHandler ? clickHandler[0] : null);
ok(!/sBox\.value = '\/9 '/.test(mainSrc), 'static: никъде не остана „/9 “ като сложена команда');
// Кешът се вдига с всяка промяна по приложението (тук: b2.78 - лентата при една отворена бележка).
ok(/const CACHE_NAME = 'cx-notes-b2\.78';/.test(swSrc), 'static: sw.js е на cx-notes-b2.78');
for (const p of ['uni/main.js', 'uni/sw.js']) {
    let checked = true;
    try { execFileSync(process.execPath, ['--check', path.resolve(p)], { stdio: ['ignore', 'ignore', 'pipe'] }); } catch { checked = false; }
    ok(checked, `static: node --check ${p}`);
}

// ======================= ЖИВО =======================
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
const ORIGIN = `http://localhost:${srv.address().port}`;

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'bg-BG' });
// Всичко извън localhost: Drive отговаря празно, Google Identity Services е подставено.
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
    const url = route.request().url();
    if (url.startsWith('https://www.googleapis.com/drive/v3/files')) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [] }) });
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
            drive: { files: { list() { return Promise.resolve({ result: { files: [] } }); }, get() { return Promise.resolve({ result: {} }); } } },
        },
        auth: { getToken() { return { access_token: 'tok' }; } },
    };
    sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
    localStorage.setItem('language', 'bg');
    localStorage.setItem('initial_setup_complete', 'true');
    localStorage.setItem('folderSetupDone', 'true');
    localStorage.setItem('active_folder_name', 'CX-Notes');
    localStorage.setItem('gdrive_multinotes_data_id', 'FOLDER_DATA');
    localStorage.setItem('singleNoteMode', 'false');
    localStorage.removeItem('searchInBoardOnly');
});

const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message || e).slice(0, 300)));
await page.goto(ORIGIN + '/', { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function' && typeof renderUI === 'function', null, { timeout: 20000 });
await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
await page.waitForFunction(() => !!contentModal, null, { timeout: 25000 });

// Три бележки: само първата съдържа „молив“ — „моливите“ я хваща само след нормализация (членуване).
const NOTES = [
    { id: '9201', gdid: 'AS1', notetxt: 'Купи молив' },
    { id: '9202', gdid: 'AS2', notetxt: 'Обади се на Иван' },
    { id: '9203', gdid: 'AS3', notetxt: 'Книга за лятото' },
];
await page.evaluate(async (notes) => {
    useArhDb = false; useLocalFolder = false; useGoogleDb = false; useIndexedDb = false;
    dbSourceGlobal = null; dirHandle = null; isOffline = false;
    boardsData = [{ id: 1, gdid: 'ASB1', title: 'Работа', color: 0, status: 0 }];
    allNotesData = notes.map(x => ({
        alarm_type: -1, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(), eventId: 0,
        gdid: x.gdid, id: x.id, notetxt: x.notetxt, numord: Number(x.id), sellist: 0, status: 0,
        text_span: '', title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244,
    }));
    currentBoardFilter = 'all';
    await renderUI({ boardParseError: false });
}, NOTES);
// Само истинските карти: контейнерът държи и служебни плочки (.boards-note/.promo-note), които
// applyFilters пропуска, затова не влизат в нито една проверка тук.
const NOTE_SEL = '#notes-container .note:not(.boards-note):not(.promo-note)';
await page.waitForFunction((want) => document.querySelectorAll('#notes-container .note:not(.boards-note):not(.promo-note)').length === want,
    NOTES.length, { timeout: 20000 }).catch(() => { });
const cardCount = await page.evaluate(() => document.querySelectorAll('#notes-container .note:not(.boards-note):not(.promo-note)').length);
ok(cardCount === NOTES.length, 'setup: трите бележки са на борда като карти', cardCount);

// Видимите бележки (по gdid), върнати като сортиран списък.
const visible = () => page.evaluate((sel) => Array.from(document.querySelectorAll(sel))
    .filter(el => el.style.display !== 'none')
    .map(el => el.dataset.g || el.dataset.i).sort(), NOTE_SEL);
// Изчаква видимите бележки да станат точно `want` (без фиксирани изчаквания).
const waitVisible = (want) => page.waitForFunction(([sel, w]) => {
    const now = Array.from(document.querySelectorAll(sel))
        .filter(el => el.style.display !== 'none')
        .map(el => el.dataset.g || el.dataset.i).sort();
    return now.length === w.length && now.every((x, i) => x === w[i]);
}, [NOTE_SEL, want], { timeout: 8000 }).then(() => true, () => false);

// Истинско писане с клавиатура в полето за търсене (приложението пуска търсенето след 300 ms debounce).
const typeSearch = async (text) => {
    await page.focus('#search-box');
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    if (text) await page.keyboard.type(text, { delay: 20 });
};
const searchValue = () => page.evaluate(() => document.getElementById('search-box').value);

// ---- 1) Списъкът с команди („/?“) носи новото име и новия псевдоним ----
await page.waitForFunction(() => typeof _ === 'function' && Array.isArray(_('searchCommandsList')), null, { timeout: 20000 }).catch(() => { });
await typeSearch('/?');
const popupReady = await page.waitForFunction(() => {
    const popup = document.getElementById('saved-searches-popup');
    if (!popup || popup.style.display !== 'block') return false;
    return Array.from(popup.querySelectorAll('.saved-search-item')).some(el => /Разширено търсене/.test(el.textContent));
}, null, { timeout: 8000 }).then(() => true, () => false);
const rows = await page.evaluate(() => Array.from(document.querySelectorAll('#saved-searches-popup .saved-search-item')).map(el => el.textContent.trim()));
ok(popupReady, 'живо: „/?“ показва списъка с команди, в който пише „Разширено търсене“', rows);
ok(rows.some(t => /Разширено търсене/.test(t) && /\/adv/.test(t)),
    'живо: редът показва „Разширено търсене“ и псевдонима „/adv“', rows);
ok(!rows.some(t => /Лексикално|Лексикал/i.test(t)), 'живо: никъде в списъка не пише „Лексикално“', rows);
ok(!rows.some(t => /\/lex/.test(t)), 'живо: /lex вече не се показва в списъка с команди', rows);

// ---- 2) Клик по реда слага „/adv “ в полето ----
const clicked = await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll('#saved-searches-popup .saved-search-item'))
        .find(el => /Разширено търсене/.test(el.textContent));
    if (!row) return false;
    row.click();
    return true;
});
const valAfterClick = await searchValue();
const popupHidden = await page.evaluate(() => document.getElementById('saved-searches-popup')?.style.display === 'none');
ok(clicked && valAfterClick === '/adv ' && popupHidden,
    'живо: клик по реда оставя „/adv “ в полето и затваря списъка', { clicked, valAfterClick, popupHidden });

// ---- 3-5) /adv, /9 и /lex вдигат режима и намират „молив“ по заявка „моливите“ ----
for (const cmd of ['/adv', '/9', '/lex']) {
    await typeSearch(cmd + ' моливите');
    const found = await waitVisible(['AS1']);
    const shown = await visible();
    ok(found, `живо: „${cmd} моливите“ намира само бележката с „молив“`, shown);
    ok((await searchValue()) === cmd + ' моливите',
        `живо: „${cmd} моливите“ остава в полето (командата е режим, не действие)`, await searchValue());
}

// ---- 6) Голо /adv без дума не филтрира нищо ----
await typeSearch('/adv');
const allVisible = await waitVisible(['AS1', 'AS2', 'AS3']);
ok(allVisible, 'живо: голо „/adv“ без дума не филтрира — и трите бележки са видими', await visible());

// ---- 7) Обикновеното търсене не нормализира: „моливите“ не намира „молив“ ----
await typeSearch('моливите');
// Обикновеното търсене показва само съвпаденията, тоест при „моливите“ не остава нито една бележка.
const plain = await waitVisible([]);
ok(plain, 'живо: обикновеното „моливите“ не намира нищо — нито бележката с „молив“ (нормализация има само в разширения режим)', await visible());
// и обратното: обикновеното търсене на точната дума я намира — полето работи, не е счупено
await typeSearch('молив');
const plainExact = await waitVisible(['AS1']);
ok(plainExact, 'живо: обикновеното „молив“ намира бележката (търсенето изобщо работи)', await visible());

const ours = errs.filter(e => !/kofiWidgetOverlay|Ko-fi|kofi/i.test(e));
ok(!ours.length, 'живо: няма нехванати грешки в страницата', ours);

console.log(`${n - fails}/${n} проверки минават`);
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
