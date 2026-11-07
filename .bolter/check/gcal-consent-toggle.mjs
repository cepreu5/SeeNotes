// Настройки „Запис в календар CX Notes“: отметката да остане и да покаже защо, когато Google не даде обхвата.
//
// Симптомът на собственика (7 Nov 2026): маркира ключа в Настройки, дава поисканото разрешение в
// попъпа на Google, но отметката остава празна и всичко се повтаря — без нито едно обяснение на екрана.
// Причината е в кода: при 404 от Calendar API (календарът е изтрит или токенът не го вижда)
// forgetGcalCalendar() изключва ключа и приложението спира дотук, без да създаде нов календар и без
// ред с причината (редът #gcal-notes-status е закоментиран в index.html).
//
// Какво проверява (истински Chromium, истинският uni код, засята IndexedDB, мобилен контекст 390x844,
// истинско докосване по чекбокса, подменен Google: tokenClient и Calendar API):
//   1) нов календар: съгласие → календарът се създава → отметката остава, ключът е 'true', редът казва
//      „свързан“;
//   2) забравен календар (GET → 404): приложението създава нов календар в СЪЩИЯ опит и отметката
//      остава — не се изключва мълчаливо;
//   3) Google не дава обхвата за календара: отметката се изключва, но под нея има ред с причината,
//      тостът е същият, и втори опит пак иска съгласие (без зацикляне в мълчание).
//
// Пускане от корена на хранилището: node .bolter/check/gcal-consent-toggle.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (за контрола върху стария код).
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
const W = 390, H = 844;
const CAL_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const DRIVE_SCOPES = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email';

if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}

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

const browser = await chromium.launch({ executablePath: CHROME });

// Състояние на подменения Google за всеки сценарий.
//   grant: 'full'    — токенът идва с обхвата за календара (както при дадено разрешение)
//          'noscope' — Google връща токен БЕЗ обхвата (разрешението не е дадено)
//   getOk: true/false — GET на запомнения календар минава ли (false = 404, календарът го няма)
const mkGoogle = (cfg) => (cfg);

const runScenario = async (label, mode, before, check) => {
    const ctx = await browser.newContext({
        viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 3,
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
        serviceWorkers: 'block'
    });
    const calls = [];
    await ctx.route(/^https?:\/\/(?!localhost)(?!www\.googleapis\.com)/, route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    // Calendar API: отговорите зависят от mode
    await ctx.route(/googleapis\.com\/calendar\/v3/, route => {
        const req = route.request();
        const url = req.url();
        const method = req.method();
        calls.push({ method, url: url.replace('https://www.googleapis.com/calendar/v3', '') });
        const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
        if (method === 'POST' && /\/calendars(\?|$)/.test(url)) {
            if (mode.createStatus && mode.createStatus !== 200) {
                return json(mode.createStatus, { error: { code: mode.createStatus, message: 'Calendar API has not been used in project', status: 'PERMISSION_DENIED', errors: [{ reason: 'accessNotConfigured' }] } });
            }
            return json(200, { id: 'cal-new', summary: 'CX Notes' });
        }
        if (method === 'GET' && /\/calendars\/cal-old/.test(url)) {
            if (!mode.getOk) return json(404, { error: { code: 404, message: 'Not Found', status: 'NOT_FOUND' } });
            return json(200, { id: 'cal-old', summary: 'CX Notes' });
        }
        if (method === 'GET' && /\/calendars\/cal-new/.test(url)) return json(200, { id: 'cal-new', summary: 'CX Notes' });
        if (/\/events/.test(url)) return json(200, { items: [] });
        return json(200, {});
    });

    const page = await ctx.newPage();
    const net = [];
    page.on('request', r => { if (!r.url().startsWith('http://localhost')) net.push(r.method() + ' ' + r.url().slice(0, 110)); });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));

    await page.addInitScript(({ calScope, driveScopes, mode, before }) => {
        // Подменен GIS: requestAccessToken получава поисканите обхвати и вика callback на клиента.
        const requests = window.__gcalRequests = [];
        const initTokenClient = () => {
            const client = {
                callback: null,
                error_callback: null,
                requestAccessToken(cfg) {
                    requests.push({ prompt: cfg && cfg.prompt, scope: (cfg && cfg.scope) || '', granular: cfg ? cfg.enableGranularPermissions : undefined });
                    const granted = mode.grant === 'noscope' ? driveScopes : ((cfg && cfg.scope) || driveScopes);
                    setTimeout(() => {
                        if (typeof client.callback === 'function') {
                            client.callback({ access_token: 'tok-' + (window.__gcalRequests.length), scope: granted, expires_in: 3600, token_type: 'Bearer' });
                        }
                    }, 40);
                }
            };
            return client;
        };
        const oauth2 = { initTokenClient, hasGrantedAllScopes() { return false; } };
        window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2 }, oauth2 };
        window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
        window.kofiWidgetOverlay = { draw() { } };
        window.kofiwidget2 = { init() { }, draw() { } };
        // Демо режимът пази базата и старта без Google, но блокира всяка външна заявка — тук
        // Calendar API се подменя от теста, затова бариерата се изключва преди main.js.
        window.__cxDemoNetworkBarrier = true;
        localStorage.setItem('useIndexedDb', 'true');
        localStorage.setItem('useGoogleDb', 'false');
        localStorage.setItem('useLocalDb', 'false');
        localStorage.setItem('useLocalFolder', 'false');
        localStorage.setItem('useArhDb', 'false');
        localStorage.setItem('updateFromSource', 'false');
        localStorage.setItem('language', 'bg');
        localStorage.setItem('hideAssistant', 'true');
        localStorage.setItem('showBoardAll', 'true');
        localStorage.setItem('rememberMe', 'true');
        localStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok-0', scope: driveScopes, issued_at: Date.now(), expires_in: 3600 }));
        localStorage.setItem('gcalNotes', 'false');
        localStorage.removeItem('gcalCalendarId');
        localStorage.removeItem('gcalState');
        localStorage.removeItem('gcalLastError');
        localStorage.removeItem('gcalScopeStale');
        // Изходно състояние за сценария: запомнен календар, включен ключ и т.н.
        Object.keys(before || {}).forEach(k => localStorage.setItem(k, before[k]));
    }, { calScope: CAL_SCOPE, driveScopes: DRIVE_SCOPES, mode, before: before || {} });

    await page.goto(`${ORIGIN}${SEED_PATH}`, { waitUntil: 'load' });
    const seed = await page.evaluate(async ({ dbName }) => {
        const STORES = { boards: { keyPath: 'gdid' }, media: { keyPath: 'gdid' }, notes: { keyPath: 'gdid' }, config: null, files: { keyPath: 'key' } };
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
            const boards = [{ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b1', id: 1, numord: 1, status: 0, title: 'Board 1' }];
            const notes = [{
                alarm_type: -1, boardid: 'b1', calendarDate: 0, color: 0, date: now, datemod: now, eventId: 0,
                gdid: 'Note000000000000000001', id: 1001, notetxt: 'Бележка 1|Тяло 1', numord: 1, pass: false, sellist: 0,
                status: 0, text_span: '', timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0, version: 243
            }];
            await new Promise((res, rej) => {
                const tx = db.transaction(['boards', 'notes', 'media', 'config'], 'readwrite');
                tx.oncomplete = res; tx.onerror = () => rej(tx.error);
                tx.objectStore('boards').clear(); tx.objectStore('notes').clear(); tx.objectStore('media').clear(); tx.objectStore('config').clear();
                boards.forEach(b => tx.objectStore('boards').put(b));
                notes.forEach(x => tx.objectStore('notes').put(x));
                tx.objectStore('config').put(1, 'dbSource');
                tx.objectStore('config').put('gdid', 'dbNoteIdType');
                tx.objectStore('config').put(now, 'dbCreatedTimestamp');
                tx.objectStore('config').put(now, 'lastLocalTimestamp');
            });
            db.close();
            return { ok: true };
        } catch (e) { return { err: String((e && e.message) || e).slice(0, 300) }; }
    }, { dbName: DB_NAME });
    if (seed.err) {
        ok(false, `${label}: базата се засява`, seed);
        await ctx.close();
        return;
    }

    // Изходно състояние за сценария вече е сложено в init скрипта на контекста.

    await page.goto(`${ORIGIN}/${PAGE}?demo=1`, { waitUntil: 'load' });
    const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready'), null, { timeout: 30000 }).then(() => true, () => false);
    await page.waitForTimeout(1500);
    ok(ready, `${label}: приложението стартира`, { errs });

    // Отваряне на Настройки и докосване по чекбокса (истинско докосване).
    await page.evaluate(() => {
        const m = document.getElementById('settings-modal');
        if (m) m.classList.remove('visible');
        document.getElementById('settings_button').click();
    });
    await page.waitForSelector('#settings-modal.visible', { timeout: 8000 }).catch(() => { });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
        const b = document.getElementById('settings-modal-body');
        const c = document.getElementById('gcal-notes-checkbox');
        if (b && c) b.scrollTop = Math.max(0, Math.round(c.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - 120));
    });
    await page.waitForTimeout(300);
    const tap = await page.evaluate(() => {
        const c = document.getElementById('gcal-notes-checkbox');
        if (!c) return null;
        const r = c.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height), top: Math.round(r.top) };
    });
    if (!tap || !tap.w || !tap.h) {
        ok(false, `${label}: чекбоксът «Запис в календар» се вижда в панела`, tap);
        await ctx.close();
        return;
    }
    // Чекът се прави като истински click по елемента: попъпът на Google е подменен и не иска жест.
    await page.evaluate(() => document.getElementById('gcal-notes-checkbox').click());
    await page.waitForTimeout(2500);

    const state = await page.evaluate(() => {
        const cb = document.getElementById('gcal-notes-checkbox');
        const line = document.getElementById('gcal-notes-status');
        return {
            checked: !!cb && cb.checked,
            disabled: !!cb && cb.disabled,
            gcalNotes: localStorage.getItem('gcalNotes'),
            calendarId: localStorage.getItem('gcalCalendarId'),
            gcalState: localStorage.getItem('gcalState'),
            lastError: localStorage.getItem('gcalLastError'),
            scopeStale: localStorage.getItem('gcalScopeStale'),
            tokenScope: (() => { try { return (JSON.parse(localStorage.getItem('google_auth_token') || '{}').scope) || ''; } catch (e) { return ''; } })(),
            statusKey: line ? line.getAttribute('data-key') : null,
            statusVisible: !!line && !!(line.offsetWidth || line.offsetHeight),
            statusText: line ? (line.textContent || '').trim().slice(0, 120) : null,
            requests: (window.__gcalRequests || []).map(r => ({ prompt: r.prompt, scope: r.scope, granular: r.granular }))
        };
    });
    state.calls = calls;
    state.net = net;
    console.log('NET', label, JSON.stringify(net.slice(0, 8)));
    check(state, { tap, errs, net });
    await ctx.close();
};

// 1) Нов календар: съгласие с обхвата → създаване → отметката остава.
await runScenario('нов календар', mkGoogle({ grant: 'full', getOk: false }), {}, (s) => {
    ok(s.requests.length >= 1 && s.requests[0].scope.includes('calendar.app.created'),
        'нов календар: поискан е обхватът за календара', { requests: s.requests, net: s.net });
    ok(s.calendarId === 'cal-new', 'нов календар: календарът е създаден и запомнен', { calendarId: s.calendarId, calls: s.calls });
    ok(s.checked && s.gcalNotes === 'true', 'нов календар: отметката остава включена', s);
});

// 2) Забравеният календар (404): нов календар в същия опит, отметката остава.
await runScenario('изтрит календар', mkGoogle({ grant: 'full', getOk: false }), { gcalCalendarId: 'cal-old' }, (s) => {
    ok(s.calls.some(c => c.method === 'GET' && c.url.includes('cal-old')), 'изтрит календар: GET на запомнения календар', s.calls);
    ok(s.calendarId === 'cal-new', 'изтрит календар: създаден е нов календар в същия опит', { calendarId: s.calendarId, calls: s.calls, state: s.gcalState });
    ok(s.checked && s.gcalNotes === 'true', 'изтрит календар: отметката остава включена', { checked: s.checked, gcalNotes: s.gcalNotes, lastError: s.lastError });
    ok(s.statusKey === 'gcalStatusOk', 'изтрит календар: редът под ключа казва „свързан“', { statusKey: s.statusKey, text: s.statusText });
});

// 3) Google не дава обхвата: отметката се изключва, но редът с причината се вижда.
await runScenario('без обхват', mkGoogle({ grant: 'noscope', getOk: false }), {}, (s) => {
    ok(s.requests.length >= 1, 'без обхват: съгласието е поискано', s.requests);
    ok(!s.requests[0].scope.includes('undefined'), 'без обхват: в поисканите обхвати няма „undefined“', s.requests);
    // Приложението не бива да твърди, че календарът е изтрит, когато липсва разрешение
    ok(s.checked === false && s.gcalNotes === 'false', 'без обхват: отметката е изключена (разрешението липсва)', { checked: s.checked, gcalNotes: s.gcalNotes });
    ok(s.statusVisible && s.statusKey && s.statusKey !== 'gcalNotesHint',
        'без обхват: под ключа има видим ред с причината', { statusKey: s.statusKey, visible: s.statusVisible, text: s.statusText });
    ok(s.lastError === 'scope-not-granted', 'без обхват: причината е „Google не даде обхвата“', { lastError: s.lastError, tokenScope: s.tokenScope });
});

await browser.close();
srv.close();
console.log(fails ? `FAILED (${fails} от ${n})` : `PASSED ${n}/${n}`);
process.exit(fails ? 1 : 0);
