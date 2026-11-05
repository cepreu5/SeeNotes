// nomn: календарът остава и иска само своя обхват, поискан на място (не при вход).
//
// Какво проверява (истински Chromium, истинският код от nomn/):
//   1) календарът се отваря и рисува месечната мрежа;
//   2) при отваряне се иска съгласие точно за base трите + calendar.app.created, нищо друго;
//   3) никъде не се иска auth/drive.readonly и няма голо auth/drive;
//   4) при вход (преди календара) не се иска календарният обхват;
//   5) няма непохванати грешки в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/nomn-calendar-keeps-own-scope.mjs
// ROOT=… сочи друга папка на приложението (контрола срещу uni/).
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
const CAL = 'https://www.googleapis.com/auth/calendar.app.created';

// Google Identity Services се подменя преди main.js: записва какво точно се иска, после отговаря с токен.
const GOOGLE_STUB = () => {
    window.__scopeCalls = [];
    window.__clientConfigs = [];
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
        window.__clientConfigs.push(cfg);
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

// Токен без календарен обхват — точно положението на човек, който е влязъл в приложението.
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
page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
await page.addInitScript(GOOGLE_STUB);
await page.addInitScript(BASE_STATE);

await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof startApp === 'function', null, { timeout: 30000 });
await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
await page.waitForFunction(() => contentModal, null, { timeout: 20000 }).catch(() => { });
await page.evaluate(async () => {
    if (typeof notesContainer === 'undefined' || !notesContainer) notesContainer = document.getElementById('notes-container');
    if (typeof createSettingsUI === 'function') await createSettingsUI([], false);
});
await page.waitForFunction(() => document.getElementById('settings-modal-body')?.dataset.initializedListeners === 'true', null, { timeout: 15000 }).catch(() => { });
await page.waitForTimeout(800);

// --- 4. При вход календарният обхват още не се иска ---
await page.evaluate(() => { if (typeof handleAuthClick === 'function') handleAuthClick(); });
await page.waitForFunction(() => window.__scopeCalls && window.__scopeCalls.length > 0, null, { timeout: 10000 }).catch(() => { });
const beforeOpen = await page.evaluate(() => window.__scopeCalls.map(c => c.scope));
ok(!beforeOpen.some(s => /calendar/.test(s)), 'преди отваряне на календара не се иска календарен обхват', beforeOpen);
const signInTokens = (beforeOpen[0] || '').split(/\s+/).filter(Boolean).sort();
ok(JSON.stringify(signInTokens) === JSON.stringify([...BASE].sort()),
    'обхватът при вход е само трите non-sensitive', signInTokens);

// --- 1. Календарът се рисува (месечната мрежа) ---
// Бутонът минава през filterNotesByBoard, който при празна база не стига до рисуването;
// затова тук се вика самата функция за изглед, както я вика и приложението.
const drawn = await page.evaluate(() => {
    const out = {};
    try { renderCalendarView(); out.render = 'ok'; } catch (e) { out.render = 'threw: ' + e.message; }
    const c = document.getElementById('calendar-container');
    out.visible = !!c && getComputedStyle(c).display !== 'none';
    out.nav = !!document.getElementById('prev-month-btn');
    out.children = c ? c.children.length : 0;
    return out;
});
ok(drawn.render === 'ok' && drawn.visible && drawn.nav && drawn.children > 0, 'календарът се рисува', drawn);

// Съгласието се иска на място, не при вход
const consentResult = await page.evaluate(async () => {
    try { return await startGcalConsent('test'); } catch (e) { return 'threw: ' + e.message; }
});
ok(consentResult === true, 'съгласието за календара минава', consentResult);
const cal = await page.evaluate(() => {
    const c = document.getElementById('calendar-container');
    return {
        exists: !!c,
        visible: !!c && getComputedStyle(c).display !== 'none',
        hasNav: !!document.getElementById('prev-month-btn'),
        title: c ? (c.innerText || '').slice(0, 80) : '',
        cells: c ? c.querySelectorAll('.calendar-day, .cal-day, td').length : 0
    };
});
ok(cal.exists && cal.visible, 'календарът се отваря', cal);
ok(cal.hasNav, 'календарът е нарисуван (има навигация по месеци)', cal);

// --- 2. Съгласието иска точно base + календар ---
const afterOpen = await page.evaluate(() => window.__scopeCalls.map(c => c.scope));
const calCall = afterOpen.find(s => /calendar/.test(s)) || '';
const calTokens = calCall.split(/\s+/).filter(Boolean).sort();
const expected = [...BASE, CAL].sort();
ok(calTokens.length > 0, 'при отваряне се иска съгласие за календара', afterOpen);
ok(JSON.stringify(calTokens) === JSON.stringify(expected),
    'поисканият обхват е точно base трите + calendar.app.created', calTokens);

// --- 3. Никъде няма чувствителен обхват ---
const allScopes = afterOpen.join(' ');
ok(!/auth\/drive\.readonly/.test(allScopes), 'никъде не се иска auth/drive.readonly', allScopes);
ok(!/auth\/drive(\s|$)/.test(allScopes), 'никъде не се иска голо auth/drive', allScopes);

// --- 5. Конзола ---
ok(errs.length === 0, 'няма непохванати грешки в конзолата', errs.slice(0, 5));

await ctx.close();
await browser.close();
srv.close();

console.log(fails === 0 ? `\n${n}/${n} passed\nOK` : `\n${n - fails}/${n} passed\nFAILED`);
process.exit(fails === 0 ? 0 : 1);
