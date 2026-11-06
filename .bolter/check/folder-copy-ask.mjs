// Папка без нито една бележка при пълна база: приложението пита дали да копира
// информацията от текущата база данни в нея (nomn) — жив браузър, подправен Drive.
//
// Какво проверява:
//   A) избор на съществуваща празна папка + „Да“ → въпросът се задава с името на
//      папката и в нея се копират бордът и бележката от базата (note.txt);
//   B) същата папка + „Не“ → нищо не се копира, папката пак става активна и
//      получава началния борд Main;
//   C) папка, в която вече има бележка → не се пита нищо и нейната бележка остава;
//   D) „Нова папка…“ + „Не“ → пита се само един път (въпросът на новата папка),
//      втори въпрос за празната папка няма;
//   E) празна база (CX-Notes без бележки) + празна папка → не се пита, създава се
//      началният борд Main.
//
// Пускане от корена на хранилището: node .bolter/check/folder-copy-ask.mjs   (exit 1 при провал)
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

async function scenario({ label, seeds, promptAnswer, confirmAnswer, pick, dbNotes = true, prefilled = [] }) {
    const drive = newDrive();
    const folderId = {};
    for (const s of seeds) folderId[s.name] = drive.folder(s.name, 'root');
    // CX-Notes съдържа Main борд и една бележка — началното състояние на собственика.
    drive.add('board.txt', folderId['CX-Notes'], JSON.stringify({ id: 1, gdid: '', title: 'Main', numord: 1, status: 0, color: '#4CAF50', colorfont: '#000', datemod: Date.now() }));
    if (dbNotes) {
        drive.add('note.txt', folderId['CX-Notes'], JSON.stringify({ id: 1, gdid: '', notetxt: 'Проба', boardid: 1, datemod: Date.now() }));
    }
    for (const p of prefilled) {
        drive.add('note.txt', folderId[p], JSON.stringify({ id: 1, gdid: '', notetxt: 'Собствена бележка на ' + p, boardid: 1, datemod: Date.now() }));
    }

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

    await page.evaluate(({ activeName, promptAnswer, confirmAnswer, dbNotes }) => {
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
        // Смяната на папката завършва с презареждане на страницата, затова
        // въпросите и тостовете се пазят в sessionStorage — иначе се губят.
        sessionStorage.setItem('__confirms', '[]');
        sessionStorage.setItem('__toasts', '[]');
        window.__confirms = [];
        showConfirmation = async (msg) => {
            const arr = JSON.parse(sessionStorage.getItem('__confirms') || '[]');
            arr.push(String(msg));
            sessionStorage.setItem('__confirms', JSON.stringify(arr));
            return confirmAnswer;
        };
        showToast = (m) => {
            const arr = JSON.parse(sessionStorage.getItem('__toasts') || '[]');
            arr.push(String(m));
            sessionStorage.setItem('__toasts', JSON.stringify(arr));
        };
        // Базата на браузъра: приложението държи бележките и бордовете в паметта,
        // заредени от активната папка (migrateDataToNewFolder копира точно тези).
        boardsData = dbNotes ? [{ id: 1, gdid: '', title: 'Main', numord: 1, status: 0, color: '#4CAF50', colorfont: '#000', datemod: Date.now() }] : [];
        allNotesData = dbNotes ? [{ id: 1, gdid: '', notetxt: 'Проба', boardid: 1, datemod: Date.now() }] : [];
        mediaData = [];
        window.__promptAnswer = promptAnswer;
        window.__confirmAnswer = confirmAnswer;
    }, { activeName: 'CX-Notes', promptAnswer, confirmAnswer, dbNotes });

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
        toasts: JSON.parse(sessionStorage.getItem('__toasts') || '[]'),
        confirms: JSON.parse(sessionStorage.getItem('__confirms') || '[]')
    }));

    const isFolder = f => f.mimeType === 'application/vnd.google-apps.folder';
    const newFolder = [...drive.files.values()].find(f => isFolder(f) && f.name === promptAnswer && f.name !== 'CX-Notes');
    const newId = newFolder ? newFolder.id : null;
    const newContents = newId ? [...drive.files.values()].filter(f => !isFolder(f) && f.parents.includes(newId)) : [];

    await ctx.close();
    return { label, before, state, newId, newContents, errs, logs, all: [...drive.files.values()].map(f => ({ id: f.id, name: f.name, parents: f.parents })) };
}

// ---------------------------------------------------------------- сценарии
const notesOf = f => f.filter(x => x.name === 'note.txt');
const boardOf = f => f.find(x => x.name === 'board.txt');
// Въпросът се проверява независимо от езика: тестът сменя езика след зареждането
// на речника, затова текстът може да е на български или на английски.
const COPY_RE = /няма нито една бележка|has no notes/i;
const asksCopy = (st, folderName) => (st.confirms || []).some(m => COPY_RE.test(m) && (!folderName || m.includes(folderName)));

const rA = await scenario({ label: 'A празна папка + „Да“', seeds: [{ name: 'CX-Notes' }, { name: 'Папка А' }], promptAnswer: 'Папка А', confirmAnswer: true, pick: 'select_folder' });
ok(rA.before.hasSelect, 'A: падащото меню за папки съществува');
ok(asksCopy(rA.state, 'Папка А'), 'A: зададен е въпросът за копиране с името на папката', rA.state.confirms);
ok(rA.state.active === 'Папка А', 'A: папката става активна', { active: rA.state.active, toasts: rA.state.toasts });
const aNotes = notesOf(rA.newContents);
ok(aNotes.length === 1, 'A: бележката от базата е копирана в папката', rA.newContents.map(f => f.name));
ok(!!aNotes[0] && aNotes[0].content.includes('Проба'), 'A: копираната бележка носи текста от базата', aNotes[0] && aNotes[0].content.slice(0, 120));
const aBoard = boardOf(rA.newContents);
let aParsed = null;
try { aParsed = JSON.parse(aBoard.content); } catch { }
ok(!!aBoard && !!aParsed && aParsed.title === 'Main', 'A: в папката има и бордът Main', aBoard && aBoard.content.slice(0, 120));
ok(!rA.state.toasts.some(t => /не съдържа данни/.test(t)), 'A: няма тост „папката не съдържа данни“', rA.state.toasts);

const rB = await scenario({ label: 'B празна папка + „Не“', seeds: [{ name: 'CX-Notes' }, { name: 'Папка Б' }], promptAnswer: 'Папка Б', confirmAnswer: false, pick: 'select_folder' });
ok(asksCopy(rB.state, 'Папка Б'), 'B: въпросът за копиране е зададен', rB.state.confirms);
ok(rB.state.active === 'Папка Б', 'B: папката става активна и без копиране', { active: rB.state.active, toasts: rB.state.toasts });
ok(notesOf(rB.newContents).length === 0, 'B: нищо не е копирано, щом собственикът откаже', rB.newContents.map(f => f.name));
ok(!!boardOf(rB.newContents), 'B: в папката се създава начален board.txt', rB.newContents.map(f => f.name));

const rC = await scenario({ label: 'C папка с бележка', seeds: [{ name: 'CX-Notes' }, { name: 'Папка В' }], prefilled: ['Папка В'], promptAnswer: 'Папка В', confirmAnswer: true, pick: 'select_folder' });
ok((rC.state.confirms || []).length === 0, 'C: при папка с бележки не се пита нищо', rC.state.confirms);
ok(rC.state.active === 'Папка В', 'C: папката става активна', { active: rC.state.active });
const cNotes = notesOf(rC.newContents);
ok(cNotes.length === 1, 'C: в папката остава само нейната бележка', rC.newContents.map(f => f.name));
ok(!!cNotes[0] && cNotes[0].content.includes('Собствена бележка на Папка В'), 'C: бележката на папката не е пипана', cNotes[0] && cNotes[0].content.slice(0, 120));

const rD = await scenario({ label: 'D нова папка + „Не“', seeds: [{ name: 'CX-Notes' }], promptAnswer: 'Папка Г', confirmAnswer: false, pick: 'new_folder' });
ok((rD.state.confirms || []).length === 1, 'D: зададен е точно един въпрос', rD.state.confirms);
ok(!asksCopy(rD.state, 'Папка Г'), 'D: втори въпрос за празната папка няма', rD.state.confirms);
ok(rD.state.active === 'Папка Г', 'D: новата папка става активна', { active: rD.state.active, toasts: rD.state.toasts });
ok(!!boardOf(rD.newContents) && notesOf(rD.newContents).length === 0, 'D: в нея има само начален борд Main', rD.newContents.map(f => f.name));

const rE = await scenario({ label: 'E празна база + празна папка', seeds: [{ name: 'CX-Notes' }, { name: 'Папка Д' }], dbNotes: false, promptAnswer: 'Папка Д', confirmAnswer: true, pick: 'select_folder' });
ok((rE.state.confirms || []).length === 0, 'E: при празна база не се пита за копиране', rE.state.confirms);
ok(rE.state.active === 'Папка Д', 'E: папката става активна', { active: rE.state.active });
ok(!!boardOf(rE.newContents) && notesOf(rE.newContents).length === 0, 'E: създава се само началният борд Main', rE.newContents.map(f => f.name));

console.log('--- A конзола');
console.log(rA.logs.join('\n'));
if (rA.errs.length) console.log('--- A грешки', rA.errs);

console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails === 0 ? 'PASSED' : 'FAILED');
await browser.close();
srv.close();
process.exit(fails === 0 ? 0 : 1);
