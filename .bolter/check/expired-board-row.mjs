// Редът „Невалидни“ (Expired) в Настройки и в менюто на бордовете (uni) — жив браузър.
//
// Какво доказва (истински Chromium, истинският uni код, засята IndexedDB, ?demo=1, 390x844):
//   1) статично: в двата езикови файла има ключ „showExpiredBoardLabel“ с точния низ — с таговете и с
//      двоеточието накрая, — а „expiredBoardTitle“ е чист текст без тагове; никой ключ *BoardTitle не носи
//      „<“ (иначе таговете излизат като текст в менюто, където заглавието се слага с textContent);
//   2) статично: етикетът в реда #show-expired-board в index.html чете ключа showExpiredBoardLabel;
//   3) в менюто редът „Невалидни“ е чист текст, точно както е редът „Със снимки“ (сравнение един до друг);
//   4) в Настройки редът показва получер курсив и завършва с двоеточие, точно като съседните редове,
//      а ключето е включено по подразбиране;
//   5) в подредбата на системните бордове има избор „expired“ с чист текст;
//   6) изгледът „Невалидни“ показва само изтеклите бележки и лентата със заглавие без тагове;
//   7) ключът в Настройки само скрива борда от менюто (не връща бележките в бордовете им);
//   8) на английски редът в менюто е „Expired“, а в Настройки — „Expired:“ с получер курсив;
//   9) няма грешки в конзолата на страницата.
//
// Пускане от корена на хранилището: node .bolter/check/expired-board-row.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (за да се провери, че тестът хваща липсващата промяна).
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

const root = path.resolve(process.env.ROOT || 'uni');
const PAGE = process.env.UNI_PAGE || 'index.html';
const DB_NAME = process.env.UNI_DB || 'NotesDB-demo';
const SEED_PATH = '/__seed.html';
const W = Number(process.env.W || 390), H = Number(process.env.H || 844);

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

// --- 1–2) Статичните проверки: езиковите файлове и index.html ---------------------------------
// Те не се нуждаят от браузър и се пускат първи — така на стар дърво веднага се вижда какво липсва.
const readJson = async (p) => {
    try { return JSON.parse(await readFile(p, 'utf8')); }
    catch (e) { return { __err: String((e && e.message) || e).slice(0, 200) }; }
};
const EN = await readJson(path.join(root, 'lang/i18n-en.json'));
const BG = await readJson(path.join(root, 'lang/i18n-bg.json'));

ok(EN.showExpiredBoardLabel === '<strong><i>Expired</i></strong>:',
    'en: showExpiredBoardLabel е "<strong><i>Expired</i></strong>:"', EN.showExpiredBoardLabel);
ok(BG.showExpiredBoardLabel === '<strong><i>Невалидни</i></strong>:',
    'bg: showExpiredBoardLabel е "<strong><i>Невалидни</i></strong>:"', BG.showExpiredBoardLabel);
ok(EN.expiredBoardTitle === 'Expired', 'en: expiredBoardTitle е чист текст "Expired"', EN.expiredBoardTitle);
ok(BG.expiredBoardTitle === 'Невалидни', 'bg: expiredBoardTitle е чист текст "Невалидни"', BG.expiredBoardTitle);

// Заглавието на борда се слага с textContent — таг в който и да е ключ *BoardTitle излиза като текст.
const taggedTitles = (o) => Object.keys(o || {}).filter(k => /BoardTitle$/.test(k) && typeof o[k] === 'string' && o[k].includes('<'));
const tagged = { en: taggedTitles(EN), bg: taggedTitles(BG) };
ok(tagged.en.length === 0 && tagged.bg.length === 0,
    'нито един ключ *BoardTitle не съдържа "<" (нито en, нито bg)', tagged);

const html = await readFile(path.join(root, PAGE), 'utf8').catch(() => '');
const rowStart = html.indexOf('id="show-expired-board"');
const rowEnd = rowStart >= 0 ? html.indexOf('</div>', rowStart) : -1;
const rowHtml = rowStart >= 0 && rowEnd > rowStart ? html.slice(rowStart, rowEnd) : '';
ok(/<label[^>]*data-key="showExpiredBoardLabel"/.test(rowHtml),
    'index.html: етикетът в #show-expired-board чете ключа showExpiredBoardLabel', rowHtml.slice(0, 240));

// --- Подготовка на сървъра ------------------------------------------------------------------
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === SEED_PATH) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end('<!doctype html><html><head><meta charset="utf-8"><title>seed</title></head><body>seed</body></html>');
        return;
    }
    const rel = p === '/' ? PAGE : p;
    try {
        const b = await readFile(path.join(root, rel));
        res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(b);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const ORIGIN = `http://localhost:${srv.address().port}`;

if (!existsSync(path.join(root, PAGE))) {
    ok(false, `няма ${PAGE} в ${root}`);
    console.log('FAILED');
    await new Promise(r => srv.close(r));
    process.exit(1);
}

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));

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
    // Езикът се задава само при първия старт - иначе презареждането за английския тест пак щеше
    // да върне български.
    if (!localStorage.getItem('language')) localStorage.setItem('language', 'bg');
    localStorage.setItem('hideAssistant', 'true');
    // „Със снимки“ е в менюто като база за сравнение: съседен допълнителен борд със същия вид ред.
    localStorage.setItem('showPhotosBoard', 'true');
    // Броят в скобите е изключен, за да е точно заглавието - без „Невалидни (2)“.
    localStorage.setItem('showBoardNoteCount', 'false');
    localStorage.setItem('showBoardAll', 'true');
});

// --- Засяване на базата преди старта -------------------------------------------------------
// Същата засята база като в expired-validity.mjs: 2 борда и 7 бележки, между които изтекла по час,
// изтекла без час, бъдеща „Валидност“, минала седмична (не изтича) и обикновена.
await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
const seed = await page.evaluate(async ({ dbName }) => {
    const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null, files: { keyPath: 'key' } };
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
        const DAY = 24 * 60 * 60 * 1000;
        // Ден без час: подравнен на обед, за да не зависи от часовата зона на машината.
        const dayAt = (offsetDays, hh = 12, mm = 0) => {
            const d = new Date(now + offsetDays * DAY);
            d.setHours(hh, mm, 0, 0);
            return d.getTime();
        };
        const boards = [
            { backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b1', id: 1, numord: 1, status: 0, title: 'Работа' },
            { backcolor: 0, backnum: 0, backpath: '', color: '#8BC34A', colorfont: '#000', datemod: now, gdid: 'b2', id: 2, numord: 2, status: 0, title: 'Лични' }
        ];
        const mk = (k, boardid, title, extra) => {
            return Object.assign({
                alarm_type: -1, boardid, calendarDate: 0, color: 0,
                date: now - k * 1000, datemod: now - k * 1000, eventId: 0,
                gdid: `Note${String(k).padStart(18, '0')}`, id: 1000 + k,
                notetxt: `${title}|Тяло ${k}`, numord: k, pass: false, sellist: 0, status: 0,
                text_span: '', timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 243
            }, extra || {});
        };
        const notes = [
            // 1) изтекла по час: дата преди 5 дни, час 14:30
            mk(1, 'b1', 'ИЗТЕКЛА ЧАСОВА', { calendarDate: dayAt(-5, 9, 0), uiState: { cRepeat: { f: 'validity', u: null }, cTime: '14:30' } }),
            // 2) бъдеща „Валидност“ — не изтича
            mk(2, 'b1', 'БЪДЕЩА ВАЛИДНОСТ', { calendarDate: dayAt(10), uiState: { cRepeat: { f: 'validity', u: null } } }),
            // 3) минала дата, но повторение „всяка седмица“ — не изтича
            mk(3, 'b1', 'СЕДМИЧНА МИНАЛА', { calendarDate: dayAt(-5), uiState: { cRepeat: { f: 'weekly', u: null } } }),
            // 4) обикновена бележка без дата
            mk(4, 'b1', 'ОБИКНОВЕНА'),
            // 5) изтекла без час — изтича в края на деня си
            mk(5, 'b1', 'ИЗТЕКЛА БЕЗ ЧАС', { calendarDate: dayAt(-3), uiState: { cRepeat: { f: 'validity', u: null } } }),
            // 6) „Валидност“ без дата — няма какво да изтече
            mk(6, 'b1', 'ВАЛИДНОСТ БЕЗ ДАТА', { uiState: { cRepeat: { f: 'validity', u: null } } }),
            // 7) бележка в другия борд
            mk(7, 'b2', 'ЛИЧНА', { calendarDate: dayAt(4) })
        ];
        await new Promise((res, rej) => {
            const tx = db.transaction(['boards', 'notes', 'media', 'config'], 'readwrite');
            tx.oncomplete = res; tx.onerror = () => rej(tx.error);
            tx.objectStore('boards').clear(); tx.objectStore('notes').clear();
            tx.objectStore('media').clear(); tx.objectStore('config').clear();
            boards.forEach(b => tx.objectStore('boards').put(b));
            notes.forEach(x => tx.objectStore('notes').put(x));
            tx.objectStore('config').put(1, 'dbSource');
            tx.objectStore('config').put('gdid', 'dbNoteIdType');
            tx.objectStore('config').put(now, 'dbCreatedTimestamp');
            tx.objectStore('config').put(now, 'lastLocalTimestamp');
        });
        db.close();
        out.seeded = { boards: boards.length, notes: notes.length };
    } catch (e) { out.err = String((e && e.message) || e).slice(0, 300); }
    return out;
}, { dbName: DB_NAME });
const seedOk = !seed.err && seed.seeded && seed.seeded.notes === 7;
ok(seedOk, 'базата е засята преди старта: 2 борда, 7 бележки', seed);
if (!seedOk) {
    await browser.close(); srv.close();
    console.log('FAILED');
    process.exit(1);
}

// --- Старт на приложението в демо режим -----------------------------------------------------
const waitForApp = () => page.waitForFunction(() => document.body.classList.contains('app-ready')
    && document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
    .then(() => true, () => false);

await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
const ready = await waitForApp();
ok(ready, 'приложението се вдигна и бордът има карти');
if (!ready) {
    console.log('няма смисъл да продължаваме без зареден борд');
    await browser.close(); srv.close();
    console.log('FAILED');
    process.exit(1);
}

const settle = (ms = 250) => page.waitForTimeout(ms);

// Видимите заглавия на картите в текущия изглед (без менюто на бордовете и промо-картата).
const visibleTitles = () => page.evaluate(() => Array.from(document.querySelectorAll('#notes-container .note'))
    .filter(c => !c.classList.contains('boards-note') && !c.classList.contains('promo-note') && c.style.display !== 'none')
    .map(c => (c.querySelector('.note-title-truncated')?.textContent || '').trim()));

// Клик с истинска мишка по елемент (след scrollIntoView, за да е наистина на екрана).
// Менюто на бордовете се плъзга плавно (scroll-behavior: smooth), затова плъзгането тук е моментално,
// а точката се проверява с elementFromPoint и при нужда се мери отново.
const clickEl = async (selector, rootSel = null) => {
    for (let attempt = 0; attempt < 12; attempt++) {
        const box = await page.evaluate(({ selector, rootSel }) => {
            const host = rootSel ? document.querySelector(rootSel) : document;
            const el = host && host.querySelector(selector);
            if (!el) return null;
            for (let p = el.parentElement; p; p = p.parentElement) {
                if (getComputedStyle(p).scrollBehavior === 'smooth') p.style.scrollBehavior = 'auto';
            }
            el.scrollIntoView({ block: 'center', inline: 'center' });
            const r = el.getBoundingClientRect();
            if (!r.width || !r.height) return { empty: true };
            const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
            const hit = document.elementFromPoint(x, y);
            return { x, y, w: Math.round(r.width), h: Math.round(r.height), good: !!hit && (hit === el || el.contains(hit)) };
        }, { selector, rootSel });
        if (!box || box.empty) return { ok: false, box };
        if (box.good) {
            await page.mouse.click(box.x, box.y);
            return { ok: true, box };
        }
        await page.waitForTimeout(120);
    }
    return { ok: false, box: null };
};

// Смяна на борда с истинска мишка по реда в менюто.
const clickBoard = async (boardId) => {
    const res = await clickEl(`.board-filter-link[data-boardid="${boardId}"]`, 'header .board-menu-container');
    if (!res.ok) return { ok: false, res };
    const applied = await page.waitForFunction((id) => {
        if (typeof currentBoardFilter === 'undefined' || String(currentBoardFilter) !== String(id)) return false;
        const c = document.getElementById('notes-container');
        return c && c.style.visibility !== 'hidden';
    }, boardId, { timeout: 8000 }).then(() => true, () => false);
    await settle();
    return { ok: applied, res };
};

// Какво пише редът в менюто на бордовете (текстът се слага с textContent, значи таговете се виждат).
const menuOf = (boardId) => page.evaluate((id) => {
    const el = document.querySelector(`header .board-menu-container .board-filter-link[data-boardid="${id}"]`);
    return el ? { text: (el.textContent || '').trim(), html: el.innerHTML } : null;
}, boardId);

const hintState = () => page.evaluate(() => {
    const bar = document.getElementById('expired-hint');
    if (!bar) return { exists: false };
    return {
        exists: true,
        hidden: bar.hidden,
        display: getComputedStyle(bar).display,
        title: (bar.querySelector('.expired-hint-title')?.textContent || '').trim(),
        count: (bar.querySelector('.expired-hint-count')?.textContent || '').trim()
    };
});

// Настройки: отваряне и разгъване на секцията с допълнителните бордове.
const openSettings = async () => {
    await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        if (m) m.classList.remove('visible');
        document.getElementById('settings_button').click();
    });
    const opened = await page.waitForSelector('#settings-modal.visible', { timeout: 8000 }).then(() => true, () => false);
    const shown = await page.evaluate(() => {
        const s = document.getElementById('boards-options-section');
        return !!s && s.style.display === 'block';
    });
    if (!shown) {
        await clickEl('#boards-arrow', '#settings-modal');
        await page.waitForFunction(() => document.getElementById('boards-options-section').style.display === 'block', null, { timeout: 5000 }).catch(() => { });
        await settle(200);
    }
    return opened;
};
const closeSettings = async () => {
    await page.evaluate(() => document.getElementById('settings-modal').classList.remove('visible'));
    await settle(300);
};

// Двата реда една до друг: какво пише в тях и как е нарисуван текстът. Таговете са в децата
// (<strong><i>), затова се мери най-вътрешният елемент с текста — той е този, който се вижда получер курсив.
const settingsRows = () => page.evaluate(() => {
    const pick = (id) => {
        const host = document.getElementById(id);
        if (!host) return null;
        const label = host.querySelector('label');
        if (!label) return { noLabel: true };
        const inner = label.querySelector('i') || label.querySelector('strong') || label;
        const cs = getComputedStyle(inner);
        const cb = host.querySelector('input[type="checkbox"]');
        return {
            innerHTML: label.innerHTML,
            text: (label.textContent || '').trim(),
            dataKey: label.getAttribute('data-key'),
            innerTag: inner.tagName,
            fontStyle: cs.fontStyle,
            fontWeight: cs.fontWeight,
            checkbox: !!cb,
            checked: cb ? cb.checked : null
        };
    };
    return { expired: pick('show-expired-board'), photos: pick('show-photos-board') };
});

// --- 3) Менюто на бордовете: чист текст, както при „Със снимки“ -------------------------------
const expiredMenu = await menuOf('expired');
ok(!!expiredMenu, 'в менюто има ред .board-filter-link[data-boardid="expired"]', expiredMenu);
ok(expiredMenu && expiredMenu.text === 'Невалидни', 'редът в менюто се чете точно "Невалидни"', expiredMenu);
ok(expiredMenu && !expiredMenu.text.includes('<'), 'редът в менюто не показва тагове', expiredMenu);
const photosMenu = await menuOf('with-photos');
ok(photosMenu && photosMenu.text === 'Със снимки', 'за сравнение: редът „Със снимки“ се чете точно "Със снимки"', photosMenu);

// --- 4) Настройки: редът изглежда като съседните ----------------------------------------------
const settingsOpen = await openSettings();
ok(settingsOpen, 'Настройки се отвориха');
const rows = await settingsRows();
ok(rows.expired && rows.expired.innerHTML === '<strong><i>Невалидни</i></strong>:',
    'редът в Настройки е "<strong><i>Невалидни</i></strong>:" - като съседните редове', rows.expired);
ok(rows.expired && rows.expired.text === 'Невалидни:',
    'текстът на реда в Настройки завършва с двоеточие', rows.expired);
ok(rows.expired && rows.expired.fontStyle === 'italic' && rows.expired.fontWeight === '700',
    'текстът на реда е получер курсив (italic, 700)', rows.expired);
ok(rows.photos && rows.photos.text === 'Със снимки:' && rows.photos.fontStyle === 'italic' && rows.photos.fontWeight === '700',
    'за сравнение: „Със снимки“ също е получер курсив и завършва с двоеточие', rows.photos);
ok(rows.expired && rows.expired.checkbox === true && rows.expired.checked === true,
    'ключето #show-expired-board-checkbox е налице и включено по подразбиране', rows.expired);

// --- 5) Подредбата на системните бордове -----------------------------------------------------
const sortOptions = await page.evaluate(() => {
    const sel = document.getElementById('system-board-sort-select');
    return sel ? [...sel.options].map(o => ({ value: o.value, text: (o.textContent || '').trim() })) : null;
});
const optOf = (v) => (sortOptions || []).find(o => o.value === v) || null;
const optExpired = optOf('expired');
ok(!!optExpired && optExpired.text === 'Невалидни', 'в подредбата има избор „expired“ с чист текст "Невалидни"', { optExpired, sortOptions });
const optPhotos = optOf('with-photos');
ok(!!optPhotos && optPhotos.text === 'Със снимки', 'за сравнение: изборът „with-photos“ се чете "Със снимки"', optPhotos);
const expiredIdx = (sortOptions || []).findIndex(o => o.value === 'expired');
const otherIdx = (sortOptions || []).findIndex(o => o.value === 'with-other');
const searchIdx = (sortOptions || []).findIndex(o => o.value === 'search-results');
ok(expiredIdx > otherIdx && otherIdx >= 0 && searchIdx > expiredIdx,
    'изборът „expired“ стои след „with-other“ и преди „search-results“', { expiredIdx, otherIdx, searchIdx, sortOptions });

// --- 6) Изгледът „Невалидни“ ------------------------------------------------------------------
await closeSettings();
const rExpired = await clickBoard('expired');
ok(rExpired.ok, 'клик по реда „Невалидни“ отваря изгледа', rExpired);
const hint = await hintState();
ok(hint.exists && !hint.hidden && hint.display !== 'none', 'лентата #expired-hint се вижда', hint);
ok(hint.title === 'Невалидни' && !hint.title.includes('<'),
    'заглавието на лентата е чист текст "Невалидни", без тагове', hint);
const expiredTitles = (await visibleTitles()).slice().sort();
const wantExpired = ['ИЗТЕКЛА БЕЗ ЧАС', 'ИЗТЕКЛА ЧАСОВА'].sort();
ok(expiredTitles.join('|') === wantExpired.join('|'), 'изгледът показва само изтеклите бележки', expiredTitles);

// --- 7) Ключът в Настройки само скрива борда -------------------------------------------------
const settingsAgain = await openSettings();
ok(settingsAgain, 'Настройки се отвориха втори път');
const unchecked = await page.evaluate(() => {
    const cb = document.getElementById('show-expired-board-checkbox');
    if (!cb) return false;
    cb.checked = false;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
});
await page.waitForFunction(() => localStorage.getItem('showExpiredBoard') === 'false', null, { timeout: 8000 }).catch(() => { });
await settle(600);
const stored = await page.evaluate(() => localStorage.getItem('showExpiredBoard'));
ok(unchecked && stored === 'false', 'ключето се изключва и изборът се пази (showExpiredBoard=false)', { unchecked, stored });
const goneMenu = await menuOf('expired');
ok(goneMenu === null, 'редът „Невалидни“ изчезва от менюто', goneMenu);
await closeSettings();
const rB1 = await clickBoard('b1');
const b1Titles = await visibleTitles();
ok(rB1.ok && !b1Titles.includes('ИЗТЕКЛА ЧАСОВА') && !b1Titles.includes('ИЗТЕКЛА БЕЗ ЧАС'),
    'изтеклите бележки не се връщат в борда си (ключът само скрива борда)', b1Titles);

const settingsThird = await openSettings();
const rechecked = await page.evaluate(() => {
    const cb = document.getElementById('show-expired-board-checkbox');
    if (!cb) return false;
    cb.checked = true;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
});
await page.waitForFunction(() => localStorage.getItem('showExpiredBoard') === 'true', null, { timeout: 8000 }).catch(() => { });
await settle(700);
const backMenu = await menuOf('expired');
ok(settingsThird && rechecked && !!backMenu, 'включен отново, редът се връща в менюто', backMenu);

// --- 8) Английски ------------------------------------------------------------------------------
await closeSettings();
await page.evaluate(() => localStorage.setItem('language', 'en'));
await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
const readyEn = await waitForApp();
ok(readyEn, 'приложението се вдигна на английски');
const enMenu = await menuOf('expired');
ok(enMenu && enMenu.text === 'Expired', 'на английски редът в менюто се чете точно "Expired"', enMenu);
const settingsEn = await openSettings();
const rowsEn = await settingsRows();
ok(settingsEn && rowsEn.expired && rowsEn.expired.innerHTML === '<strong><i>Expired</i></strong>:',
    'на английски редът в Настройки е "<strong><i>Expired</i></strong>:"', rowsEn.expired);
ok(rowsEn.expired && rowsEn.expired.text === 'Expired:' && rowsEn.expired.fontStyle === 'italic' && rowsEn.expired.fontWeight === '700',
    'на английски редът завършва с двоеточие и е получер курсив', rowsEn.expired);

// --- 9) Конзолата на страницата ----------------------------------------------------------------
ok(errs.length === 0, 'няма грешки в конзолата на страницата', errs.slice(0, 3));

await browser.close();
srv.close();
console.log(fails ? `FAILED - ${fails} от ${n} проверки не минаха` : `OK - всички ${n} проверки минаха`);
process.exit(fails ? 1 : 0);
