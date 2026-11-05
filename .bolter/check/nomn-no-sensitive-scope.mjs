// nomn: приложението иска само non-sensitive обхвати и не работи с чужда папка.
//
// Какво проверява (истински Chromium, истинският код от nomn/):
//   1) при вход низът за обхват е точно drive.file + drive.appdata + userinfo.email и нищо друго,
//      а клиентът е съществуващият CLIENT_ID (не нов);
//   2) първоначалният избор на папка за данни няма опция за внасяне от съществуваща папка и
//      никъде не споменава multinotes_data;
//   3) Настройки → Разширени има реда „Активна папка“ и реда „Изтрий папка“, а списъкът с папки
//      не съдържа нищо с multinotes;
//   4) Архив: папка с 'boards (1).bcp', 'notes (2).bcp' и 'medias (3).bcp' минава проверката и
//      бележките наистина се зареждат в приложението (не само че проверката е минала);
//   5) при зареждане няма непохванати грешки в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/nomn-no-sensitive-scope.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението.
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

// Същите ключове в localStorage като в uni (решение на собственика, 5.11.2026: двата
// варианта не работят едновременно, значи общата памет на един origin е допустима).
{
    const uniMain = path.join(path.dirname(root), 'uni', 'main.js');
    if (existsSync(uniMain)) {
        const nomnSrc = await readFile(path.join(root, 'main.js'), 'utf8');
        const uniSrc = await readFile(uniMain, 'utf8');
        for (const k of ['gdrive_multinotes_data_id', 'settings_multinotes_data']) {
            const a = nomnSrc.split(k).length - 1, b = uniSrc.split(k).length - 1;
            ok(a === b && a > 0, `ключът ${k} се среща толкова пъти, колкото в uni (${a}/${b})`, { a, b });
        }
    }
}

const SCOPES = [    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/drive.appdata',
    'https://www.googleapis.com/auth/userinfo.email'
];
const CLIENT_ID = '365177022923-59fegvrs9tjimpmclr8nbrvk6ik8qfg6.apps.googleusercontent.com';

// Google Identity Services се подменя преди main.js: записва какво точно се иска при вход.
const GOOGLE_STUB = () => {
    window.__scopeCalls = [];
    window.__clientConfigs = [];
    const initTokenClient = (cfg) => {
        window.__clientConfigs.push(cfg);
        return {
            requestAccessToken(opts) { window.__scopeCalls.push(opts || {}); },
            callback: null,
            error_callback: null
        };
    };
    const oauth2 = { initTokenClient, hasGrantedAllScopes() { return false; }, revoke() { } };
    window.google = {
        accounts: {
            oauth2,
            id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }
        }
    };
    window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
    window.kofiWidgetOverlay = { draw() { } };
    window.kofiwidget2 = { init() { }, draw() { } };
};

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
};

const newPage = async (browser, { initFn, initArg } = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
    await ctx.route(/^https?:\/\/(?!localhost)/, route => {
        const url = route.request().url();
        // Drive/Docs API отговори: празен списък с файлове, за да не се чупи JSON.parse.
        if (/googleapis\.com/.test(url)) {
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ files: [], error: { code: 404 } }) });
        }
        return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 300)));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
    await page.addInitScript(GOOGLE_STUB);
    await page.addInitScript(BASE_STATE);
    if (initFn) await page.addInitScript(initFn, initArg);
    return { ctx, page, errs };
};

// Същинската подготовка на UI, която startApp прави при истински старт.
const bootSettings = async (page) => {
    await page.waitForFunction(() => typeof startApp === 'function', null, { timeout: 30000 });
    await page.evaluate(() => { if (!contentModal) startApp().catch(() => { }); });
    await page.waitForFunction(() => contentModal, null, { timeout: 20000 }).catch(() => { });
    await page.evaluate(async () => {
        if (typeof notesContainer === 'undefined' || !notesContainer) notesContainer = document.getElementById('notes-container');
        if (typeof createSettingsUI === 'function') await createSettingsUI([], false);
    });
    await page.waitForFunction(() => document.getElementById('settings-modal-body')?.dataset.initializedListeners === 'true', null, { timeout: 15000 });
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });

// =====================================================================
// 1 + 2 + 5: обхвати при вход, първоначален избор на папка, чиста конзола
// =====================================================================
{
    const { ctx, page, errs } = await newPage(browser);
    await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof handleAuthClick === 'function' && typeof showInitialDataFolderModal === 'function', null, { timeout: 30000 });

    // --- 1. Какъв обхват се иска при вход ---
    await page.evaluate(() => handleAuthClick());
    await page.waitForFunction(() => window.__scopeCalls && window.__scopeCalls.length > 0, null, { timeout: 10000 }).catch(() => { });
    const signIn = await page.evaluate(() => ({
        calls: window.__scopeCalls,
        configs: window.__clientConfigs.map(c => ({ client_id: c.client_id, scope: c.scope }))
    }));
    const requested = signIn.calls[0] && typeof signIn.calls[0].scope === 'string' ? signIn.calls[0].scope : '';
    const tokens = requested.split(/\s+/).filter(Boolean).sort();
    ok(tokens.length > 0, `при вход се иска обхват (${tokens.length} токена)`, signIn.calls[0] || null);
    ok(JSON.stringify(tokens) === JSON.stringify([...SCOPES].sort()),
        'обхватът при вход е точно drive.file + drive.appdata + userinfo.email', tokens);
    ok(!/auth\/drive\.readonly/.test(requested) && !/auth\/drive(\s|$|["'])/.test(requested),
        'в обхвата няма auth/drive.readonly и няма голо auth/drive', requested);
    ok(signIn.configs.length > 0 && signIn.configs.every(c => c.client_id === CLIENT_ID),
        'ползва се съществуващият OAuth клиент, не нов', signIn.configs.map(c => c.client_id));

    // --- 1б. Същата IndexedDB база като uni (решение на собственика, 5.11.2026):
    // двата варианта не работят едновременно, затова пазят общи ключове и обща база.
    const storage = await page.evaluate(() => ({ db: typeof NOTES_DB_NAME !== 'undefined' ? NOTES_DB_NAME : null }));
    ok(storage.db === 'NotesDB', `ползва същата IndexedDB база като uni (${storage.db})`, storage.db);

    // --- 2. Първоначалният избор на папка ---
    const modal = await page.evaluate(async () => {
        const promise = showInitialDataFolderModal();
        await new Promise(r => setTimeout(r, 50));
        const popup = document.getElementById('folderIdPromptPopup');
        const shown = !!popup && popup.classList.contains('show');
        const text = popup ? popup.innerText : '';
        const html = popup ? popup.innerHTML : '';
        const options = popup ? [...popup.querySelectorAll('[id^="initial-modal-option-"]')].map(e => e.id) : [];
        const opt1 = document.getElementById('initial-modal-option-1');
        const opt2 = document.getElementById('initial-modal-option-2');
        if (opt2) opt2.click();
        const choice = await promise;
        return { shown, text, html, options, hasOpt1: !!opt1, choice };
    });
    ok(modal.shown, 'модалът за избор на папка за данни се показва');
    ok(!modal.hasOpt1 && modal.options.length === 1 && modal.options[0] === 'initial-modal-option-2',
        'има само една възможност — създай CX-Notes', modal.options);
    ok(!/multinotes/i.test(modal.text) && !/multinotes/i.test(modal.html),
        'в модала няма текст с multinotes', (modal.text || '').slice(0, 160));
    ok(!/import|внася|мигр/i.test(modal.text), 'няма опция за внасяне от съществуваща папка', (modal.text || '').slice(0, 200));
    ok(modal.choice === 'option_2', 'изборът завършва с „създай CX-Notes“', modal.choice);

    // --- 5. Конзолата при зареждане ---
    ok(errs.length === 0, 'при зареждане няма непохванати грешки в конзолата', errs.slice(0, 5));
    await ctx.close();
}

// =====================================================================
// 3. Настройки → Разширени: редовете за папки и списъкът с папки
// =====================================================================
{
    const { ctx, page, errs } = await newPage(browser);
    await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
    await page.evaluate(() => localStorage.setItem('showAdvancedSettings', 'true'));
    await page.reload({ waitUntil: 'load' });
    await bootSettings(page);
    await page.evaluate(async () => {
        document.getElementById('settings-modal').classList.add('visible');
        if (typeof updateAdvancedSettingsVisibility === 'function') await updateAdvancedSettingsVisibility();
    });
    const acc = await page.$('#advanced-settings-span .accordion-header');
    ok(!!acc, 'има „Разширени настройки“');
    if (acc) await acc.click();
    await page.waitForFunction(() => {
        const c = document.querySelector('#advanced-settings-span .accordion-content');
        return c && c.getBoundingClientRect().height > 0;
    }, null, { timeout: 10000 }).catch(() => { });

    const probeRow = (id) => page.evaluate(async (id) => {
        const el = document.getElementById(id);
        if (!el) return { exists: false };
        el.scrollIntoView({ block: 'center' });
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
            exists: true,
            h: Math.round(r.height),
            reachable: !!(hit && (hit === el || el.contains(hit))),
            text: el.innerText.replace(/\s+/g, ' ').trim().slice(0, 80)
        };
    }, id);
    const rows = {
        active: await probeRow('active-folder-wrapper'),
        del: await probeRow('delete-folder-wrapper'),
        options: await page.evaluate(() => {
            const sel = document.getElementById('active-folder-select');
            return sel ? [...sel.options].map(o => ({ value: o.value, text: o.textContent.trim() })) : null;
        })
    };
    ok(rows.active.exists, 'редът „Активна папка“ съществува (вариант А)');
    ok(rows.active.exists && rows.active.reachable, `редът „Активна папка“ се вижда (${rows.active.h}px)`, rows.active);
    ok(rows.del.exists, 'редът „Изтрий папка“ съществува (вариант А)');
    ok(rows.del.exists && rows.del.reachable, `редът „Изтрий папка“ се вижда (${rows.del.h}px)`, rows.del);
    ok(Array.isArray(rows.options) && rows.options.length > 0, 'списъкът с папки е попълнен', rows.options);
    ok(Array.isArray(rows.options) && !rows.options.some(o => /multinotes/i.test(o.text) || /multinotes/i.test(o.value)),
        'в списъка с папки няма нищо с multinotes', rows.options);
    ok(Array.isArray(rows.options) && rows.options.some(o => o.value === 'CX-Notes'),
        'списъкът предлага CX-Notes', rows.options);
    ok(!errs.some(e => e.startsWith('pageerror:')), 'в Настройки няма непохванати грешки', errs.slice(0, 5));
    await ctx.close();
}

// =====================================================================
// 4. Архив: файлове с добавка в името се зареждат в приложението
// =====================================================================
{
    const BOARDS = [{ id: 1, numord: 1, title: 'Main', color: '#4CAF50', colorfont: '#000', backcolor: 0, backnum: 0, backpath: '', status: 0, gdid: 'arh-b1', datemod: 1700000000000 }];
    const NOTES = [
        { id: 1, numord: 1, board: 'Main', notetxt: 'Бележка от телефона', title: 'Първа', gdid: 'arh-n1', datemod: 1700000001000, type: 0 },
        { id: 2, numord: 2, board: 'Main', notetxt: 'Друга със снимка', title: 'Втора', gdid: 'arh-n2', datemod: 1700000002000, type: 0 },
        { id: 3, numord: 3, board: 'Main', notetxt: 'Трета', title: 'Трета', gdid: 'arh-n3', datemod: 1700000003000, type: 0 }
    ];
    const MEDIAS = [];

    const ARCHIVE_DIR = (data) => {
        const makeFile = (name, obj) => ({
            kind: 'file',
            name,
            async getFile() { return new File([JSON.stringify(obj)], name, { type: 'application/json' }); }
        });
        const files = [
            makeFile('boards (1).bcp', data.BOARDS),
            makeFile('notes (2).bcp', data.NOTES),
            makeFile('medias (3).bcp', data.MEDIAS)
        ];
        const dir = {
            kind: 'directory',
            name: 'backup-21.03',
            async *values() { for (const f of files) yield f; },
            async queryPermission() { return 'granted'; },
            async requestPermission() { return 'granted'; },
            async getFileHandle(name) {
                const f = files.find(x => x.name === name);
                if (!f) { const e = new Error('no ' + name); e.name = 'NotFoundError'; throw e; }
                return f;
            }
        };
        window.__arhDir = dir;
        window.showDirectoryPicker = async () => dir;
        // Токен, който не е изтекъл: стартът не бива да ходи до Google.
        localStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'stub-token', issued_at: Date.now(), expires_in: 3600, scope: 'stub' }));
    };

    const { ctx, page, errs } = await newPage(browser, { initFn: ARCHIVE_DIR, initArg: { BOARDS, NOTES, MEDIAS } });
    await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
    // Стартът се изчаква докрай: иначе кликът пуска втори mainLogic, докато първият още върви,
    // и вторият се отказва (guard isMainLogicRunning).
    await page.evaluate(() => startApp(true).catch(() => { }));
    await page.waitForFunction(() => typeof authToken !== 'undefined' && !!authToken, null, { timeout: 20000 }).catch(() => { });
    await page.waitForFunction(() => typeof isMainLogicRunning === 'undefined' || isMainLogicRunning === false, null, { timeout: 20000 }).catch(() => { });
    await bootSettings(page);
    // Памет вместо IndexedDB за дръжката на папката: фалшивата дръжка не може да се запише в базата.
    await page.evaluate(() => {
        window.__cfgStore = {};
        window.saveConfig = async (k, v) => { window.__cfgStore[k] = v; };
        window.getConfig = async (k) => window.__cfgStore[k];
        // Токенът в паметта, както го задава startApp след успешен вход: иначе mainLogic
        // тръгва към checkAuth и в този стенд стига до липсващ идентификатор.
        authToken = { access_token: 'stub-token', issued_at: Date.now(), expires_in: 3600, scope: 'stub' };
        document.getElementById('settings-modal').classList.add('visible');
    });
    const btnExists = await page.evaluate(() => !!document.getElementById('select-arh-btn'));
    ok(btnExists, 'има бутон за избор на архивна папка');
    await page.evaluate(() => document.getElementById('select-arh-btn').click());
    const loaded = await page.waitForFunction(() => (typeof boardsData !== 'undefined' && boardsData.length > 0)
        && (typeof allNotesData !== 'undefined' && allNotesData.length > 0), null, { timeout: 25000 })
        .then(() => true, () => false);
    const state = await page.evaluate(() => ({
        boards: (typeof boardsData !== 'undefined' ? boardsData.length : -1),
        notes: (typeof allNotesData !== 'undefined' ? allNotesData.length : -1),
        boardTitles: (typeof boardsData !== 'undefined' ? boardsData.map(b => b.title) : []),
        noteTexts: (typeof allNotesData !== 'undefined' ? allNotesData.map(n => n.notetxt || '') : []),
        shownAsArh: (() => { const el = document.getElementById('arh-folder-name'); return el ? el.textContent.trim() : null; })()
    }));
    // Бележките се рисуват от renderUI веднага след четенето; чакаме карта, не фиксирано време.
    const rendered = await page.waitForFunction(() => document.querySelectorAll('#notes-container .note').length > 0,
        null, { timeout: 15000 }).then(() => true, () => false);
    const cards = await page.evaluate(() => ({
        cards: document.querySelectorAll('#notes-container .note').length,
        titles: [...document.querySelectorAll('#notes-container .note')].map(e => e.innerText.replace(/\s+/g, ' ').trim().slice(0, 40)).slice(0, 5)
    }));
    ok(loaded, 'след избор на архива бордовете и бележките са в паметта на приложението', state);
    ok(state.boards === BOARDS.length, `заредени са ${state.boards} борда от 'boards (1).bcp'`, state.boardTitles);
    ok(state.notes === NOTES.length, `заредени са ${state.notes} бележки от 'notes (2).bcp'`, state.noteTexts);
    ok(state.noteTexts.includes('Бележка от телефона'), 'текстът на бележката от архива е в паметта', state.noteTexts);
    ok(rendered && cards.cards > 0, `бележките се показват на екрана (${cards.cards} карти)`, cards);
    ok(cards.titles.some(t => t.includes('Бележка от телефона')), 'картата с бележката от архива е на екрана', cards.titles);
    ok(state.shownAsArh === 'backup-21.03', `избраната папка се показва в Настройки (${state.shownAsArh})`, state.shownAsArh);
    ok(!errs.some(e => e.startsWith('pageerror:')), 'при вноса от Архив няма непохванати грешки', errs.slice(0, 5));
    await ctx.close();
}

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} passed`);
console.log(fails ? 'FAILED' : 'OK');
process.exit(fails ? 1 : 0);
