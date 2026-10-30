// Изключването на допълнителен борд от Настройки да маха борда от менюто и да остава изключено.
//
// Какво проверява (истински Chromium, истинският uni код, засята IndexedDB, ?demo=1):
//   за всеки допълнителен борд (Със снимки, С видео, Със звуци, Други прикачени, Напомняния, Всички):
//     1) включваме го от Настройки → появява се в менюто;
//     2) изключваме го от Настройки → веднага изчезва от менюто;
//     3) презареждаме приложението → в Настройки пак е изключен и в менюто го няма.
//
// Пускане от корена на хранилището: node .bolter/check/board-visibility-toggles.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (за да се провери, че тестът хваща бъга).
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
if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}
const DB_NAME = process.env.UNI_DB || 'NotesDB-demo';
const SEED_PATH = '/__seed.html';
const W = Number(process.env.W || 390), H = Number(process.env.H || 844);

// key в localStorage, id на чекбокса в Настройки, клас на бутона в менюто, надпис за лога
const BOARDS = [
    { key: 'showPhotosBoard', checkbox: 'show-photos-board-checkbox', cls: 'photos-filter-btn', name: 'Със снимки' },
    { key: 'showVideosBoard', checkbox: 'show-videos-board-checkbox', cls: 'videos-filter-btn', name: 'С видео' },
    { key: 'showSoundsBoard', checkbox: 'show-sounds-board-checkbox', cls: 'sounds-filter-btn', name: 'Със звуци' },
    { key: 'showOtherBoard', checkbox: 'show-other-board-checkbox', cls: 'other-filter-btn', name: 'Други прикачени' },
    { key: 'showBoardRemind', checkbox: 'remind-board-checkbox', cls: 'reminder-filter-btn', name: 'Напомняния' },
    { key: 'showBoardAll', checkbox: 'all-board-checkbox', cls: 'all-boards-filter-btn', name: 'Всички' }
];

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

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

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
    localStorage.setItem('language', 'bg');
    localStorage.setItem('hideAssistant', 'true');
});

// --- 1) Засяване на базата преди старта ----------------------------------------------------
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
        const boards = [], notes = [];
        for (let i = 1; i <= 6; i++) {
            boards.push({ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b' + i, id: i, numord: i, status: 0, title: 'Board ' + i });
        }
        let k = 0;
        for (const b of boards) {
            for (let j = 1; j <= 2; j++) {
                k++;
                notes.push({
                    alarm_type: -1, boardid: b.gdid, calendarDate: 0, color: 0,
                    date: now - k * 1000, datemod: now - k * 1000, eventId: 0,
                    gdid: `Note${String(k).padStart(18, '0')}`, id: 1000 + k,
                    notetxt: `Бележка ${k}|Тяло ${k}`, numord: k, pass: false, sellist: 0, status: 0,
                    text_span: '', timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 243
                });
            }
        }
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
ok(!seed.err && seed.seeded && seed.seeded.boards === 6, `базата е засята преди старта: 6 борда`, seed);
if (fails) { await browser.close(); srv.close(); console.log('FAILED'); process.exit(1); }

const loadApp = async () => {
    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
        && document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
        .then(() => true, () => false);
    await page.waitForTimeout(1500);
    return ready;
};

// Състояние на даден борд: в менюто ли е, какво пише в localStorage
const readBoard = (b) => page.evaluate(({ key, cls }) => {
    const menu = document.querySelector('header .board-menu-container');
    return {
        inMenu: !!(menu && menu.querySelector('.' + cls)),
        stored: localStorage.getItem(key)
    };
}, { key: b.key, cls: b.cls });

const openSettings = async () => {
    await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        if (m) m.classList.remove('visible');
        document.getElementById('settings_button').click();
    });
    await page.waitForTimeout(1200);
    const st = await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        const cs = getComputedStyle(m);
        return { cls: m.className, display: cs.display, vis: cs.visibility, op: cs.opacity, h: m.getBoundingClientRect().height, btn: !!document.getElementById('settings_button') };
    });
    if (!/visible/.test(st.cls)) { console.log('DEBUG settings modal', JSON.stringify(st)); }
    await page.waitForSelector('#settings-modal.visible', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(300);
};

const readCheckbox = (b) => page.evaluate(({ checkbox }) => {
    const el = document.getElementById(checkbox);
    return el ? el.checked : null;
}, { checkbox: b.checkbox });

const setCheckbox = async (b, want) => {
    const before = await readCheckbox(b);
    if (before === want) return { before, clicked: false };
    await page.evaluate(({ checkbox }) => document.getElementById(checkbox).click(), { checkbox: b.checkbox });
    await page.waitForTimeout(700);
    return { before, clicked: true };
};

// --- 2) Първо зареждане --------------------------------------------------------------------
ok(await loadApp(), 'приложението се зареди от засятата база');

for (const b of BOARDS) {
    // начално състояние
    await openSettings();
    const initial = await readCheckbox(b);
    ok(initial !== null, `${b.name}: чекбоксът е в Настройки (${initial ? 'включен' : 'изключен'})`);

    // 1) включваме (ако не е включен)
    if (initial === false) {
        await setCheckbox(b, true);
        const afterOn = await readBoard(b);
        ok(afterOn.inMenu, `${b.name}: след включване се появява в менюто`, afterOn);
    }

    // 2) изключваме
    await openSettings();
    await setCheckbox(b, false);
    const afterOff = await readBoard(b);
    ok(afterOff.stored === 'false', `${b.name}: изключването се записва (localStorage=${afterOff.stored})`, afterOff);
    ok(!afterOff.inMenu, `${b.name}: след изключване веднага изчезва от менюто`, afterOff);
    ok(await readCheckbox(b) === false, `${b.name}: чекбоксът в Настройки е изключен веднага`);

    // 3) презареждаме
    ok(await loadApp(), `${b.name}: приложението се зареди след презареждане`);
    const afterReload = await readBoard(b);
    ok(!afterReload.inMenu, `${b.name}: след презареждане бордът не е в менюто`, afterReload);
    await openSettings();
    ok(await readCheckbox(b) === false, `${b.name}: след презареждане чекбоксът е изключен`, { stored: afterReload.stored });
}

// --- 3) Изборът стига до профила -------------------------------------------------------------
// Профилът (settings.json в Drive, тук локалното му копие settings_multinotes_data) е това, което
// при старт се прилага върху localStorage. Ако изключването не влезе в него, следващият старт връща
// старото „включен" и бордът се появява пак в менюто — точно каквото вижда собственикът.
await page.waitForTimeout(2500);
const profileNow = await page.evaluate(() => {
    const raw = localStorage.getItem('settings_multinotes_data');
    let snap = null;
    try { snap = JSON.parse(raw || 'null'); } catch (e) { }
    let dev = snap;
    if (snap && typeof snap === 'object' && !Array.isArray(snap)) {
        dev = snap[localStorage.getItem('deviceName') || 'Default'] || snap.Default || snap;
    }
    return { hasSnapshot: !!raw, dev: dev || {} };
});
for (const b of BOARDS) {
    ok(profileNow.dev[b.key] === 'false', `${b.name}: изключването влиза в профила (${profileNow.dev[b.key]})`, profileNow.hasSnapshot);
}

// --- 4) Прилагане на профила при старт не връща изключеното ----------------------------------
// Вика се същата функция, която стартът вика.
const applied = await page.evaluate(async () => {
    if (typeof window.loadSettingsFromGDrive !== 'function') return { err: 'loadSettingsFromGDrive не е глобална' };
    await window.loadSettingsFromGDrive(true);
    await new Promise(r => setTimeout(r, 1500));
    return { ok: true };
});
ok(!applied.err, 'стартовата функция loadSettingsFromGDrive е достъпна за теста', applied);
for (const b of BOARDS) {
    const st = await readBoard(b);
    ok(st.stored === 'false', `${b.name}: профилът не връща изключването (localStorage=${st.stored})`, st);
    ok(!st.inMenu, `${b.name}: профилът не връща изключен борд в менюто`, st);
    await openSettings();
    ok(await readCheckbox(b) === false, `${b.name}: профилът не връща чекбокса`, { stored: st.stored });
}

// --- 5) Стар профил със старото „включен" не бива да презаписва чакащ запис --------------------
// Случаят „записът в профила се провали или още не е пристигнал": ключовете стоят в
// pendingBoardVisibility и профилът ги подминава.
const guard = await page.evaluate(async () => {
    const keys = ['showBoardAll', 'showPhotosBoard', 'showVideosBoard', 'showSoundsBoard', 'showOtherBoard', 'showBoardRemind'];
    const stale = {};
    keys.forEach(k => { stale[k] = 'true'; localStorage.setItem(k, 'false'); });
    localStorage.setItem('pendingBoardVisibility', JSON.stringify(keys));
    localStorage.setItem('settings_multinotes_data', JSON.stringify({ Default: stale }));
    await window.loadSettingsFromGDrive(true);
    await new Promise(r => setTimeout(r, 1500));
    const out = {};
    keys.forEach(k => { out[k] = localStorage.getItem(k); });
    return out;
});
for (const b of BOARDS) {
    ok(guard[b.key] === 'false', `${b.name}: чакащ запис не се презаписва от стар профил (${guard[b.key]})`, guard);
    const st = await readBoard(b);
    ok(!st.inMenu, `${b.name}: след стар профил с чакащ запис бордът не е в менюто`, st);
}

ok(errs.length === 0, 'няма изключения в конзолата', errs.slice(0, 3));

console.log(fails ? `FAILED ${fails}/${n}` : `OK ${n}/${n}`);
await browser.close();
srv.close();
process.exit(fails ? 1 : 0);
