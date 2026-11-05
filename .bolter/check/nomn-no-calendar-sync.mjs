// nomn: без синхронизация с Google Календар. Приложението не иска календарен обхват, не вика
// Calendar API и няма ред в Настройки, а собственият му календар с бележките остава непокътнат.
//
// Какво проверява (истински Chromium, истинският код от nomn/):
//   1) приложението стартира и месечният календар рисува цялата мрежа на текущия месец;
//   2) бележка със своя calendarDate се показва в клетката на своя ден, а седмичният изглед
//      се отваря от хедъра на календара и връща месечния;
//   3) при старт, вход и отваряне на календара поисканият обхват е точно трите base — никога
//      низ с /auth/calendar;
//   4) няма fetch към адрес на googleapis.com/calendar;
//   5) в Настройки няма ред за Google Календар (нито #gcal-notes, нито data-key="gcalNotesLabel");
//   6) в nomn/ (main.js, index.html, sw.js, lang/*.json) няма gcal / calendar.app.created /
//      calendar/v3 / GCAL_;
//   7) няма непохванати грешки в страницата.
//
// Пускане от корена на хранилището: node .bolter/check/nomn-no-calendar-sync.mjs
// ROOT=… сочи друга папка на приложението (контрола срещу старата версия на nomn/).
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
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

const root = path.resolve(process.env.ROOT || 'nomn');
const PAGE = 'index.html';
if (!existsSync(path.join(root, PAGE))) {
    console.log(`FAIL няма ${PAGE} в ${root}`);
    console.log('FAILED');
    process.exit(1);
}

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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

const BASE = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/userinfo.email'
];
const BASE_SORTED = JSON.stringify([...BASE].sort());

// --- 6. Статична проверка: в nomn/ няма нищо календарно-синхронизиращо ---
{
    const langDir = path.join(root, 'lang');
    let langFiles = [];
    try { langFiles = (await readdir(langDir)).filter(f => f.endsWith('.json')).map(f => 'lang/' + f); } catch { }
    const files = ['main.js', PAGE, 'sw.js', ...langFiles];
    const CASES = [
        ['calendar.app.created', /calendar\.app\.created/i],
        ['calendar/v3', /calendar\/v3/i],
        ['GCAL_', /GCAL_/],
        // „gcal“ като собствено име: gcalNotes, _gcalSyncTimer, gcal; и в camelCase — getGcalStatusKey,
        // reportGcalResult. „existingCalendar“ не е съвпадение (това е gCal, а не gcal).
        ['gcal', /(?<![A-Za-z])gcal|Gcal/]
    ];
    const texts = {};
    for (const f of files) {
        try { texts[f] = await readFile(path.join(root, f), 'utf8'); } catch { texts[f] = null; }
    }
    ok(texts['main.js'] !== null && texts[PAGE] !== null && texts['sw.js'] !== null,
        'файловете на nomn са налични за статичната проверка', files);
    for (const [label, re] of CASES) {
        const hits = [];
        for (const f of files) {
            const t = texts[f];
            if (t === null) continue;
            t.split('\n').forEach((line, i) => { if (re.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 90)}`); });
        }
        ok(hits.length === 0, `в nomn/ няма «${label}»`, hits.slice(0, 6));
    }
}

// Google Identity Services се подменя преди main.js: записва какво точно се иска, после отговаря с токен.
const GOOGLE_STUB = () => {
    window.__scopeCalls = [];
    const initTokenClient = (cfg) => {
        const client = {
            requestAccessToken(opts) {
                const o = opts || {};
                window.__scopeCalls.push({ scope: o.scope || cfg.scope || '', prompt: o.prompt || null });
                setTimeout(() => {
                    const cb = client.callback;
                    if (typeof cb === 'function') {
                        cb({ access_token: 'stub-token', scope: o.scope || cfg.scope || '', expires_in: 3600 });
                    }
                }, 0);
            },
            callback: null,
            error_callback: null
        };
        return client;
    };
    const oauth2 = { initTokenClient, hasGrantedAllScopes() { return false; }, revoke() { } };
    window.google = {
        accounts: {
            oauth2,
            id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }
        }
    };
    window.gapi = window.gapi || { client: { setToken() { }, load() { } } };
    window.kofiWidgetOverlay = { draw() { } };
    window.kofiwidget2 = { init() { }, draw() { } };
};

// Всяко извикване на fetch се записва — така се вижда дали приложението посяга към Calendar API.
const FETCH_STUB = () => {
    window.__fetchCalls = [];
    const nativeFetch = window.fetch ? window.fetch.bind(window) : null;
    window.fetch = function (input, init) {
        let url = '';
        try { url = typeof input === 'string' ? input : (input && input.url) || String(input); } catch { url = '?'; }
        window.__fetchCalls.push(url);
        return nativeFetch ? nativeFetch(input, init) : Promise.reject(new Error('no fetch'));
    };
};

// Влязъл човек: точно трите base обхвата в токена, без календарен.
const BASE_STATE = () => {
    localStorage.setItem('language', 'bg');
    localStorage.setItem('hideAssistant', 'true');
    localStorage.setItem('initial_setup_complete', 'true');
    localStorage.setItem('folderSetupDone', 'true');
    localStorage.setItem('active_folder_name', 'CX-Notes');
    localStorage.setItem('activeFolderId', 'folder-cx');
    localStorage.setItem('gdrive_folder_names', JSON.stringify(['CX-Notes']));
    localStorage.setItem('useGoogleDb', 'false');
    localStorage.setItem('useLocalDb', 'false');
    localStorage.setItem('useArhDb', 'false');
    localStorage.setItem('useIndexedDb', 'false');
    localStorage.setItem('rememberMe', 'true');
    localStorage.setItem('google_auth_token', JSON.stringify({
        access_token: 'stub-token',
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.email',
        expires_in: 3600,
        issued_at: Date.now()
    }));
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
    const url = route.request().url();
    if (/googleapis\.com/.test(url)) {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [], items: [], error: { code: 404 } }) });
    }
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && /calendar|gcal/i.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
await page.addInitScript(FETCH_STUB);
await page.addInitScript(GOOGLE_STUB);
await page.addInitScript(BASE_STATE);

// Оценка в страницата, която не събаря теста: грешката става резултат, а не изключение.
const ev = async (fn, arg) => {
    try { return { ok: true, value: await page.evaluate(fn, arg) }; }
    catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 300) }; }
};

// --- Старт ---
let booted = false;
try {
    await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof startApp === 'function', null, { timeout: 30000 });
    await page.evaluate(() => { if (typeof contentModal === 'undefined' || !contentModal) startApp().catch(() => { }); });
    await page.waitForFunction(() => typeof contentModal !== 'undefined' && !!contentModal, null, { timeout: 20000 });
    booted = true;
} catch (e) {
    booted = false;
}
ok(booted, 'приложението стартира');

// --- 1. Месечният календар се отваря и рисува цялата мрежа на текущия месец ---
const drawn = await ev(() => {
    const out = {};
    try { renderCalendarView(); out.render = 'ok'; } catch (e) { out.render = 'threw: ' + e.message; }
    const now = currentCalendarDate;
    const c = document.getElementById('calendar-container');
    const grid = c ? c.querySelector('.calendar-grid') : null;
    const cells = grid ? Array.from(grid.querySelectorAll('.calendar-cell')) : [];
    out.visible = !!c && getComputedStyle(c).display !== 'none';
    out.cells = cells.length;
    out.expected = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    out.sequential = cells.every((x, i) => Number(x.dataset.day) === i + 1);
    out.monthOk = cells.every(x => Number(x.dataset.month) === now.getMonth() && Number(x.dataset.year) === now.getFullYear());
    out.nav = ['prev-month-btn', 'next-month-btn', 'today-month-btn', 'weekly-view-btn'].every(id => !!document.getElementById(id));
    out.rows = c ? c.querySelectorAll('.calendar-days-header .calendar-day-name').length : 0;
    return out;
});
ok(drawn.ok && drawn.value.render === 'ok' && drawn.value.visible && drawn.value.nav
    && drawn.value.cells === drawn.value.expected && drawn.value.sequential && drawn.value.monthOk
    && drawn.value.rows === 7,
    'месечният календар се отваря и рисува всички дни на текущия месец',
    drawn.ok ? drawn.value : drawn.err);

// --- 1б. Навигацията по месеци работи (напред и «днес») ---
const nav = await ev(() => {
    const out = {};
    const title = () => (document.querySelector('#calendar-container h2') || {}).textContent || '';
    const firstMonth = () => Number((document.querySelector('#calendar-container .calendar-cell') || { dataset: {} }).dataset.month);
    // currentCalendarDate се мени на място (setMonth), затова числата се взимат преди клика.
    const nowMonth = currentCalendarDate.getMonth();
    const nowYear = currentCalendarDate.getFullYear();
    out.before = title();
    document.getElementById('next-month-btn').click();
    out.after = title();
    out.changed = out.before !== out.after;
    out.nextMonth = firstMonth();
    out.nextCells = document.querySelectorAll('#calendar-container .calendar-cell').length;
    const nextDate = new Date(nowYear, nowMonth + 1, 1);
    out.nextExpected = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    document.getElementById('today-month-btn').click();
    out.backMonth = firstMonth();
    out.nowMonth = nowMonth;
    return out;
});
ok(nav.ok && nav.value.changed && nav.value.nextMonth !== nav.value.nowMonth
    && nav.value.backMonth === nav.value.nowMonth && nav.value.nextCells === nav.value.nextExpected,
    'навигацията по месеци работи (напред и «днес»)', nav.ok ? nav.value : nav.err);

// --- 2. Бележка със своя дата се показва в клетката на деня ---
const seeded = await ev(() => {
    const now = currentCalendarDate;
    const day = 15;
    const text = 'Бележка за календара (проверка)';
    const ts = new Date(now.getFullYear(), now.getMonth(), day, 12, 0, 0).getTime();
    allNotesData.push({
        id: 987654, gdid: 'check-cal-note', notetxt: text, text_span: null, title_span: null,
        color: null, boardid: 'all', status: 0, calendarDate: ts
    });
    renderCalendarView();
    const cell = document.querySelector(`#calendar-container .calendar-cell[data-day="${day}"]`);
    const mini = cell ? cell.querySelector('.calendar-mini-note') : null;
    const days = Array.from(document.querySelectorAll('#calendar-container .calendar-mini-note'))
        .map(m => { const c = m.closest('.calendar-cell'); return c ? Number(c.dataset.day) : -1; });
    return { day, text, found: !!mini, miniText: mini ? mini.textContent.trim() : '', days };
});
ok(seeded.ok && seeded.value.found && seeded.value.miniText.includes(seeded.value.text)
    && JSON.stringify(seeded.value.days) === JSON.stringify([seeded.value.day]),
    'бележката с дата в текущия месец се показва в клетката на своя ден',
    seeded.ok ? seeded.value : seeded.err);

// --- Вход и отваряне на календара: какъв обхват се иска ---
await ev(() => { if (typeof handleAuthClick === 'function') handleAuthClick(); });
await page.waitForFunction(() => window.__scopeCalls && window.__scopeCalls.length > 0, null, { timeout: 10000 }).catch(() => { });
await ev(() => { renderCalendarView(); document.getElementById('weekly-view-btn').click(); });
await ev(() => { document.getElementById('today-month-btn') && document.getElementById('today-month-btn').click(); });
await ev(() => { if (typeof createSettingsUI === 'function') return createSettingsUI([], false); });

// --- 2б. Седмичният изглед се отваря от хедъра на календара ---
const weekly = await ev(() => {
    renderCalendarView();
    document.getElementById('weekly-view-btn').click();
    const w = document.getElementById('weekly-calendar-container');
    const out = {
        visible: !!w && getComputedStyle(w).display !== 'none',
        rows: w ? w.querySelectorAll('.weekly-day-row').length : 0,
        dates: w ? Array.from(w.querySelectorAll('.weekly-date-number')).map(e => Number(e.textContent)) : [],
        monthHidden: getComputedStyle(document.getElementById('calendar-container')).display === 'none',
        nav: w ? ['prev-week-btn', 'next-week-btn', 'today-week-btn', 'month-view-btn', 'close-week-calendar-btn']
            .every(id => !!w.querySelector('#' + id)) : false
    };
    return out;
});
ok(weekly.ok && weekly.value.visible && weekly.value.rows === 7 && weekly.value.dates.length === 7
    && weekly.value.nav && weekly.value.monthHidden,
    'седмичният изглед се отваря от хедъра на календара',
    weekly.ok ? weekly.value : weekly.err);

// --- 3. Обхватът е точно трите base, никога календарен ---
const scopeCalls = await ev(() => (window.__scopeCalls || []).map(c => c.scope));
const calls = scopeCalls.ok ? scopeCalls.value : [];
ok(calls.length > 0, 'поискано е съгласие поне веднъж (проверката не е празна)', calls);
ok(!calls.some(s => /\/auth\/calendar/.test(s)), 'никъде не се иска обхват с /auth/calendar', calls);
const badScopes = calls.filter(s => {
    const tokens = s.split(/\s+/).filter(Boolean).sort();
    return JSON.stringify(tokens) !== BASE_SORTED;
});
ok(calls.length > 0 && badScopes.length === 0, 'поисканият обхват е точно трите base (drive.file, drive.appdata, userinfo.email)', badScopes);

// --- 4. Няма fetch към Calendar API ---
const fetchCalls = await ev(() => window.__fetchCalls || []);
const urls = fetchCalls.ok ? fetchCalls.value : [];
const calUrls = urls.filter(u => /googleapis\.com\/calendar/i.test(u));
ok(!calUrls.length, 'няма заявка към googleapis.com/calendar', calUrls.slice(0, 5));

// --- 5. В Настройки няма ред за Google Календар ---
const settings = await ev(() => {
    const body = document.getElementById('settings-modal-body');
    return {
        initialized: !!body && body.dataset.initializedListeners === 'true',
        rows: body ? body.querySelectorAll('.settings-mobile-row').length : 0,
        hasCheckbox: !!document.getElementById('gcal-notes-checkbox'),
        hasRow: !!document.getElementById('gcal-notes'),
        labelKeys: Array.from(document.querySelectorAll('[data-key]')).map(el => el.dataset.key).filter(k => /gcal/i.test(k || '')),
        calendarRows: ['weekly-calendar', 'show-date']
            .filter(id => !!document.getElementById(id))
    };
});
ok(settings.ok && settings.value.initialized && settings.value.rows > 5,
    'Настройките се отварят (проверката не е празна)', settings.ok ? settings.value : settings.err);
ok(settings.ok && !settings.value.hasCheckbox && !settings.value.hasRow && settings.value.labelKeys.length === 0,
    'в Настройки няма ред за Google Календар',
    settings.ok ? settings.value : settings.err);
ok(settings.ok && settings.value.calendarRows.length === 2,
    'настройките showWeeklyCalendar и showDatemod остават', settings.ok ? settings.value.calendarRows : settings.err);

// --- 7. Конзола ---
ok(errs.length === 0, 'няма непохванати грешки в страницата', errs.slice(0, 5));

await ctx.close();
await browser.close();
srv.close();

console.log(fails === 0 ? `\n${n}/${n} passed\nOK` : `\n${n - fails}/${n} passed\nFAILED`);
process.exit(fails === 0 ? 0 : 1);
