// Празна (нова) папка трябва да може да стане активна (nomn) — жив браузър, подправен Google Drive.
//
// Какво проверява:
//   A) „Нова папка…“ + „Не“ на въпроса за копиране → новата папка става активна
//      (active_folder_name), влиза в списъка с папки и след презареждането приложението
//      създава в нея началния борд Main (board.txt), вместо да показва
//      „Тази папка не съдържа данни за бележки“ и да остане на CX-Notes;
//   B) „Избор на папка…“ с име на съществуваща, но празна папка → също става активна;
//   C) „Избор на папка…“ с несъществуващо име → остава CX-Notes и името пада от списъка
//      (старото поведение, за да не се губи проверката за съществуване);
//   D) след активиране на празната папка стартовият екран не показва тоста
//      „не съдържа данни за бележки“.
//
// Пускане от корена на хранилището: node .bolter/check/folder-switch-empty.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (контрола върху стария код).
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
if (!existsSync(path.join(root, 'index.html'))) {
    console.log(`FAIL няма index.html в ${root}`);
    console.log('FAILED');
    process.exit(1);
}
const W = 390, H = 844;
const EMAIL = 'test@example.com';

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    try {
        const b = await readFile(path.join(root, p === '/' ? 'index.html' : p));
        res.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
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

// ---------------------------------------------------------------- подправен Drive
function newDrive() {
    let seq = 0;
    const files = new Map();
    const add = (name, parentId, content = '', mimeType = 'text/plain') => {
        const id = 'f' + (++seq);
        files.set(id, { id, name, mimeType, parents: parentId ? [parentId] : [], content, modifiedTime: new Date().toISOString() });
        return id;
    };
    const folder = (name, parentId = null) => add(name, parentId, '', 'application/vnd.google-apps.folder');
    const find = (q) => {
        const nameM = q.match(/name\s*=\s*'((?:[^'\\]|\\.)*)'/);
        const name = nameM ? nameM[1].replace(/\\(.)/g, '$1') : null;
        const parentM = q.match(/'([^']+)'\s+in\s+parents/);
        const parent = parentM ? parentM[1] : null;
        const folderOnly = /mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q);
        return [...files.values()].filter(f =>
            (!name || f.name === name) &&
            (!parent || f.parents.includes(parent)) &&
            (!folderOnly || f.mimeType === 'application/vnd.google-apps.folder'));
    };
    return { files, add, folder, find };
}

function parseMultipart(req) {
    const ct = (req.headers()['content-type'] || '');
    const bm = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/);
    const boundary = bm ? (bm[1] || bm[2]) : null;
    const buf = req.postDataBuffer();
    if (!boundary || !buf) return {};
    const raw = buf.toString('latin1');
    const out = {};
    for (const chunk of raw.split('--' + boundary)) {
        const nm = chunk.match(/name="([^"]+)"/);
        if (!nm) continue;
        const i = chunk.indexOf('\r\n\r\n');
        if (i < 0) continue;
        let val = chunk.slice(i + 4).replace(/\r\n$/, '');
        out[nm[1]] = Buffer.from(val, 'latin1').toString('utf8');
    }
    return out;
}

const GIS = `window.google = { accounts: { oauth2: { initTokenClient(cfg) { return { requestAccessToken() {
  setTimeout(() => cfg.callback({ access_token: 'tok', expires_in: 3599 }), 10); } }; },
  hasGrantedAllScopes() { return true; } }, id: { initialize() {}, renderButton() {}, prompt() {}, disableAutoSelect() {} } } };`;
const GAPI = `window.gapi = { load(n, cb) { cb(); }, client: { load: async () => {}, setToken() {}, getToken() { return null; } } };`;

function json(route, obj, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
}

async function answer(route, drive) {
    const req = route.request();
    const u = new URL(req.url());
    if (u.href.startsWith('https://accounts.google.com/gsi/client')) return route.fulfill({ contentType: 'text/javascript', body: GIS });
    if (u.href.startsWith('https://apis.google.com/js/api.js')) return route.fulfill({ contentType: 'text/javascript', body: GAPI });
    if (u.href.includes('generate_204')) return route.fulfill({ status: 204, body: '' });
    if (u.pathname.includes('/oauth2/v3/userinfo')) return json(route, { email: EMAIL });
    if (u.host === 'script.google.com') return json(route, { success: true, term: 365, daysPassed: 1, email: EMAIL });
    if (u.host !== 'www.googleapis.com') return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });

    if (u.pathname === '/upload/drive/v3/files' && req.method() === 'POST') {
        const parts = parseMultipart(req);
        let meta = {};
        try { meta = JSON.parse(parts.metadata || '{}'); } catch { meta = {}; }
        const id = drive.add(meta.name, (meta.parents || [])[0], parts.file ?? '', meta.mimeType || 'text/plain');
        return json(route, { id, name: meta.name });
    }
    if (u.pathname.startsWith('/upload/drive/v3/files/') && req.method() === 'PATCH') {
        const id = u.pathname.split('/').pop();
        const f = drive.files.get(id);
        if (f) f.content = String(req.postData() ?? '');
        return json(route, { id });
    }
    if (u.pathname === '/drive/v3/files' && req.method() === 'GET') {
        const q = u.searchParams.get('q') || '';
        const list = drive.find(q).map(f => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, size: String(f.content.length), parents: f.parents, trashed: false }));
        return json(route, { files: list });
    }
    if (u.pathname === '/drive/v3/files' && req.method() === 'POST') {
        let body = {};
        try { body = JSON.parse(req.postData() || '{}'); } catch { body = {}; }
        const parent = (body.parents || [])[0] || null;
        const id = body.mimeType === 'application/vnd.google-apps.folder'
            ? drive.folder(body.name, parent)
            : drive.add(body.name, parent, '');
        return json(route, { id, name: body.name });
    }
    const m = u.pathname.match(/^\/drive\/v3\/files\/([^/]+)(\/copy)?$/);
    if (m) {
        const f = drive.files.get(m[1]);
        if (!f) return json(route, { error: { code: 404, message: 'File not found' } }, 404);
        if (m[2] && req.method() === 'POST') {
            let body = {};
            try { body = JSON.parse(req.postData() || '{}'); } catch { body = {}; }
            const id = drive.add(body.name || f.name, (body.parents || f.parents || [])[0], f.content, f.mimeType);
            return json(route, { id });
        }
        if (req.method() === 'DELETE') { drive.files.delete(f.id); return route.fulfill({ status: 204, body: '' }); }
        if (req.method() === 'PATCH') {
            let body = {};
            try { body = JSON.parse(req.postData() || '{}'); } catch { body = {}; }
            Object.assign(f, body);
            return json(route, { id: f.id, name: f.name });
        }
        if (u.searchParams.get('alt') === 'media') return route.fulfill({ contentType: 'text/plain', body: f.content });
        return json(route, { id: f.id, name: f.name, mimeType: f.mimeType, trashed: false, modifiedTime: f.modifiedTime });
    }
    return json(route, {});
}

// ---------------------------------------------------------------- един сценарий
const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });

async function scenario({ label, seeds, promptAnswer, confirmAnswer, pick }) {
    const drive = newDrive();
    const folderId = {};
    for (const s of seeds) folderId[s.name] = drive.folder(s.name, 'root');
    // CX-Notes съдържа Main борд и една бележка — началното състояние на собственика.
    drive.add('board.txt', folderId['CX-Notes'], JSON.stringify({ id: 1, gdid: '', title: 'Main', numord: 1, status: 0, color: '#4CAF50', colorfont: '#000', datemod: Date.now() }));
    drive.add('note.txt', folderId['CX-Notes'], JSON.stringify({ id: 1, gdid: '', notetxt: 'Проба', boardid: 1, datemod: Date.now() }));

    const ctx = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block', locale: 'bg-BG' });
    await ctx.route(/^https?:\/\/(?!localhost)/, route => answer(route, drive));
    await ctx.addInitScript(() => {
        window.__toasts = [];
    });
    const page = await ctx.newPage();
    const errs = [];
    const logs = [];
    page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));
    page.on('console', m => { const t = m.text(); if (/Folder-Init|Folder-Switch|\[Initial Setup\]|getMainDataFolderID/.test(t)) logs.push(t.slice(0, 220)); });
    await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof createSettingsUI === 'function', null, { timeout: 20000 });

    await page.evaluate(({ activeName, promptAnswer, confirmAnswer }) => {
        localStorage.clear();
        sessionStorage.clear();
        const token = { access_token: 'tok', expires_in: 3599, expires_at: Date.now() + 3600000 };
        localStorage.setItem('language', 'bg');
        localStorage.setItem('useGoogleDb', 'true');
        localStorage.setItem('useIndexedDb', 'false');
        localStorage.setItem('useLocalDb', 'false');
        localStorage.setItem('useArhDb', 'false');
        localStorage.setItem('updateFromSource', 'false');
        localStorage.setItem('initial_setup_complete', 'true');
        localStorage.setItem('folderSetupDone', 'true');
        localStorage.setItem('active_folder_name', 'CX-Notes');
        localStorage.setItem('activeFolderId', 'f-cx');
        localStorage.setItem('gdrive_folder_names', JSON.stringify(['CX-Notes']));
        sessionStorage.setItem('google_auth_token', JSON.stringify(token));
        sessionStorage.setItem('google_auth_email_hint', 'test@example.com');
        sessionStorage.setItem('licensing_whitelist_ok', 'true');
        // глобалните променливи на приложението (глобални let/var в main.js)
        activeFolderName = 'CX-Notes';
        isOffline = false;
        useGoogleDb = true;
        noteId = 5; noteNumord = 5; boardIdCounter = 1;
        // диалозите се отговарят програмно
        showPrompt = async () => promptAnswer;
        showConfirmation = async () => confirmAnswer;
        showToast = (m) => { (window.__toasts = window.__toasts || []).push(String(m)); };
        window.__promptAnswer = promptAnswer;
        window.__confirmAnswer = confirmAnswer;
    }, { activeName: 'CX-Notes', promptAnswer, confirmAnswer });

    // Настройките се строят, за да се закачи слушателят на падащото меню.
    await page.evaluate(async () => {
        try { await createSettingsUI([], false); } catch (e) { window.__settingsErr = String(e); }
    });

    const before = await page.evaluate(() => ({ settingsErr: window.__settingsErr || null, hasSelect: !!document.getElementById('active-folder-select') }));

    const nav = page.waitForNavigation({ waitUntil: 'load', timeout: 25000 }).catch(() => null);
    await page.evaluate(({ pick }) => {
        const sel = document.getElementById('active-folder-select');
        if (!sel) return;
        sel.value = pick;
        sel.dispatchEvent(new Event('change'));
    }, { pick });
    await nav;
    await page.waitForTimeout(6000); // ръчно: приложението стартира след презареждането

    const state = await page.evaluate(() => ({
        active: localStorage.getItem('active_folder_name'),
        names: localStorage.getItem('gdrive_folder_names'),
        setupComplete: localStorage.getItem('initial_setup_complete'),
        cachedFolder: localStorage.getItem('gdrive_multinotes_data_id_folder'),
        cachedId: localStorage.getItem('gdrive_multinotes_data_id'),
        toasts: window.__toasts || []
    }));

    const isFolder = f => f.mimeType === 'application/vnd.google-apps.folder';
    const newFolder = [...drive.files.values()].find(f => isFolder(f) && f.name === promptAnswer && f.name !== 'CX-Notes');
    const newId = newFolder ? newFolder.id : null;
    const newContents = newId ? [...drive.files.values()].filter(f => !isFolder(f) && f.parents.includes(newId)) : [];

    await ctx.close();
    return { label, before, state, newId, newContents, errs, logs, all: [...drive.files.values()].map(f => ({ id: f.id, name: f.name, parents: f.parents })) };
}

// ---------------------------------------------------------------- сценарии
const rA = await scenario({ label: 'A нова папка + „Не“ на копирането', seeds: [{ name: 'CX-Notes' }], promptAnswer: 'Папка А', confirmAnswer: false, pick: 'new_folder' });
if (process.env.DEBUG_A) {
    console.log('--- A: всички файлове в подправения Drive');
    console.log(JSON.stringify(rA.all, null, 1));
    console.log('--- A: конзола');
    console.log(rA.logs.join('\n'));
    console.log('--- A: грешки', rA.errs);
}
ok(rA.before.hasSelect, 'A: падащото меню за папки съществува');
ok(rA.state.active === 'Папка А', 'A: новата папка е активна след избора', { active: rA.state.active, toasts: rA.state.toasts });
ok((rA.state.names || '').includes('Папка А'), 'A: новата папка влиза в списъка с папки', rA.state.names);
ok(!!rA.newId, 'A: папката е създадена в Drive', { newId: rA.newId });
const aBoard = rA.newContents.find(f => f.name === 'board.txt');
ok(!!aBoard, 'A: в новата папка има начален board.txt', { files: rA.newContents.map(f => f.name) });
if (aBoard) {
    let parsed = null;
    try { parsed = JSON.parse(aBoard.content); } catch { }
    ok(!!parsed && parsed.title === 'Main', 'A: началният борд е Main', { content: aBoard.content.slice(0, 120) });
}
ok(!rA.state.toasts.some(t => /не съдържа данни/.test(t)), 'A: няма тост „папката не съдържа данни“', rA.state.toasts);

const rB = process.env.ONLY_A ? { state: {}, newContents: [] } : await scenario({ label: 'B избор на съществуваща празна папка', seeds: [{ name: 'CX-Notes' }, { name: 'Папка Б' }], promptAnswer: 'Папка Б', confirmAnswer: false, pick: 'select_folder' });
if (!process.env.ONLY_A) {
ok(rB.state.active === 'Папка Б', 'B: празната съществуваща папка става активна', { active: rB.state.active, toasts: rB.state.toasts });
const bBoard = rB.newContents.find(f => f.name === 'board.txt');
ok(!!bBoard, 'B: в нея се създава начален board.txt', { files: rB.newContents.map(f => f.name) });
ok(!rB.state.toasts.some(t => /не съдържа данни/.test(t)), 'B: няма тост „папката не съдържа данни“', rB.state.toasts);
}

const rC = process.env.ONLY_A ? { state: {}, names: '' } : await scenario({ label: 'C избор на несъществуваща папка', seeds: [{ name: 'CX-Notes' }], promptAnswer: 'Няма такава', confirmAnswer: false, pick: 'select_folder' });
if (!process.env.ONLY_A) {
ok(rC.state.active === 'CX-Notes', 'C: при несъществуваща папка остава CX-Notes', { active: rC.state.active });
ok(!(rC.state.names || '').includes('Няма такава'), 'C: несъществуващото име не влиза в списъка', rC.state.names);
}

console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails === 0 ? 'PASSED' : 'FAILED');
await browser.close();
srv.close();
process.exit(fails === 0 ? 0 : 1);
