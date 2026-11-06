// Смяна на активната папка в nomn: по-малко заявки към Drive и спинер в бутона Refresh,
// докато трае смяната. Жив браузър, подправен Drive със забавена връзка.
//
// Какво проверява:
//   1) докато трае смяната, бутонът Refresh се върти (animation: spin), не приема клик
//      и е отбелязан aria-busy=true; след смяната се връща в нормално състояние;
//   2) страницата НЕ се презарежда (маркерът в window остава същият);
//   3) след смяната е активна новата папка и на екрана са нейните бележки;
//   4) за смяната отиват осезаемо по-малко заявки отпреди (контролата върху стария код
//      пада точно на 2, 3 и 4);
//   5) съобщение за смяната се показва (тост).
//
// Пускане от корена на хранилището: node .bolter/check/folder-switch-fast.mjs   (exit 1 при провал)
// ROOT=… сочи друга папка на приложението (контрола върху стария код).
// LAT=… е забавянето на всяка Drive заявка в милисекунди (по подразбиране 250).
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
const LAT = Number(process.env.LAT || 250);
const W = 390, H = 844;
const EMAIL = 'test@example.com';
const FROM = 'CX-Notes';
const TO = 'Work';
const NEW_NOTE = 'Бележка от втората папка';

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
        const names = [...q.matchAll(/name\s*=\s*'((?:[^'\\]|\\.)*)'/g)].map(m => m[1].replace(/\\(.)/g, '$1'));
        const parentM = q.match(/'([^']+)'\s+in\s+parents/);
        const parent = parentM ? parentM[1] : null;
        const folderOnly = /mimeType\s*=\s*'application\/vnd\.google-apps\.folder'/.test(q);
        return [...files.values()].filter(f =>
            (!names.length || names.includes(f.name)) &&
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
        const val = chunk.slice(i + 4).replace(/\r\n$/, '');
        out[nm[1]] = Buffer.from(val, 'latin1').toString('utf8');
    }
    return out;
}

const GIS = `window.google = { accounts: { oauth2: { initTokenClient(cfg) { return { requestAccessToken() {
  setTimeout(() => cfg.callback({ access_token: 'tok', expires_in: 3599 }), 10); } }; } },
  hasGrantedAllScopes() { return true; } }, id: { initialize() {}, renderButton() {}, prompt() {}, disableAutoSelect() {} } } };`;
const GAPI = `window.gapi = { load(n, cb) { cb(); }, client: { load: async () => {}, setToken() {}, getToken() { return null; } } };`;

function json(route, obj, status = 200) {
    return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj) });
}

// Брояч и забавяне на Drive заявките — за да се види колко чакания прави смяната.
const stat = { reqs: [] };
let counting = false;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function answer(route, drive) {
    const req = route.request();
    const u = new URL(req.url());
    if (u.href.startsWith('https://accounts.google.com/gsi/client')) return route.fulfill({ contentType: 'text/javascript', body: GIS });
    if (u.href.startsWith('https://apis.google.com/js/api.js')) return route.fulfill({ contentType: 'text/javascript', body: GAPI });
    if (u.href.includes('generate_204')) return route.fulfill({ status: 204, body: '' });
    if (u.pathname.includes('/oauth2/v3/userinfo')) return json(route, { email: EMAIL });
    if (u.host === 'script.google.com') return json(route, { success: true, term: 365, daysPassed: 1, email: EMAIL });
    if (u.host !== 'www.googleapis.com') return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });

    if (counting) stat.reqs.push({ t: Date.now(), method: req.method(), path: u.pathname + (u.search || '').slice(0, 60) });
    await sleep(LAT);

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

// ---------------------------------------------------------------- сценарият
const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });

console.log(`ROOT=${root}  LAT=${LAT} ms`);

const drive = newDrive();
const cxId = drive.folder(FROM, 'root');
const workId = drive.folder(TO, 'root');
const boardJson = (title) => JSON.stringify({ id: 1, gdid: '', title, numord: 1, status: 0, color: '#4CAF50', colorfont: '#000', datemod: Date.now() });
drive.add('board.txt', cxId, boardJson('Main'));
drive.add('note.txt', cxId, JSON.stringify({ id: 1, gdid: '', notetxt: 'Бележка от първата папка', boardid: 1, datemod: Date.now() }));
drive.add('board.txt', workId, boardJson('Main'));
drive.add('note.txt', workId, JSON.stringify({ id: 1, gdid: '', notetxt: NEW_NOTE, boardid: 1, datemod: Date.now() }));

const ctx = await browser.newContext({ viewport: { width: W, height: H }, serviceWorkers: 'block', locale: 'bg-BG' });
await ctx.route(/^https?:\/\/(?!localhost)/, route => answer(route, drive));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 200)));

await page.goto(`${ORIGIN}/index.html`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof createSettingsUI === 'function', null, { timeout: 30000 });

await page.evaluate(({ fromId, names, to }) => {
    localStorage.clear();
    sessionStorage.clear();
    const token = { access_token: 'tok', expires_in: 3599, expires_at: Date.now() + 3600000 };
    localStorage.setItem('language', 'bg');
    localStorage.setItem('useGoogleDb', 'true');
    localStorage.setItem('useIndexedDb', 'true');
    localStorage.setItem('useLocalDb', 'false');
    localStorage.setItem('useArhDb', 'false');
    localStorage.setItem('updateFromSource', 'false');
    localStorage.setItem('initial_setup_complete', 'true');
    localStorage.setItem('folderSetupDone', 'true');
    localStorage.setItem('active_folder_name', 'CX-Notes');
    localStorage.setItem('activeFolderId', fromId);
    localStorage.setItem('gdrive_multinotes_data_id', fromId);
    localStorage.setItem('gdrive_multinotes_data_id_folder', 'CX-Notes');
    localStorage.setItem('gdrive_folder_names', JSON.stringify(names));
    sessionStorage.setItem('google_auth_token', JSON.stringify(token));
    sessionStorage.setItem('google_auth_email_hint', 'test@example.com');
    sessionStorage.setItem('licensing_whitelist_ok', 'true');
    activeFolderName = 'CX-Notes';
    isOffline = false;
    useGoogleDb = true;
    noteId = 5; noteNumord = 5; boardIdCounter = 1;
    boardsData = [{ id: 1, gdid: '', title: 'Main', numord: 1, status: 0, color: '#4CAF50', colorfont: '#000', datemod: Date.now() }];
    allNotesData = [{ id: 1, gdid: '', notetxt: 'Бележка от първата папка', boardid: 1, datemod: Date.now() }];
    mediaData = [];
    window.__toasts = [];
    showToast = (m) => { window.__toasts.push(String(m)); };
    showConfirmation = async () => false;
    window.__target = to;
    // маркер: ако страницата се презареди, той изчезва
    window.__boot = 'alive-' + Date.now();
}, { fromId: cxId, names: [FROM, TO], to: TO });

// Приложението трябва да е стартирало истински (с вход), преди да се сменя папка —
// иначе вътрешните му елементи още не са закачени. Затова: seeded storage, после
// презареждане, и чак тогава смяната. Маркерът за „няма презареждане“ се слага след това.
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof createSettingsUI === 'function', null, { timeout: 30000 });
const booted = await page.waitForFunction(() => {
    const rendered = (document.getElementById('notes-container') || {}).textContent || '';
    return typeof allNotesData !== 'undefined' && Array.isArray(allNotesData) && allNotesData.length > 0
        && rendered.length > 0;
}, null, { timeout: 60000 }).then(() => true).catch(() => false);
ok(booted, 'приложението е стартирало с бележката на първата папка');

// След презареждането вътрешните подправки се слагат наново върху живата страница.
await page.evaluate(() => {
    window.__toasts = [];
    showToast = (m) => { window.__toasts.push(String(m)); };
    showConfirmation = async () => false;
    // маркер: ако страницата се презареди по време на смяната, той изчезва
    window.__boot = 'alive-' + Date.now();
});

// Настройките се строят, за да се закачи слушателят на падащото меню.
await page.evaluate(async () => {
    try { await createSettingsUI([], false); } catch (e) { window.__settingsErr = String(e); }
});
const hasSelect = await page.evaluate(() => !!document.getElementById('active-folder-select'));
ok(hasSelect, 'падащото меню за активна папка е на мястото си');

// Проби за състоянието на бутона Refresh, докато трае смяната.
await page.evaluate(() => {
    window.__samples = [];
    window.__timer = setInterval(() => {
        const btn = document.getElementById('reload_button');
        const img = btn ? btn.querySelector('img') : null;
        window.__samples.push({
            a: img ? img.style.animation : '',
            pe: btn ? btn.style.pointerEvents : null,
            ab: btn ? btn.getAttribute('aria-busy') : null
        });
    }, 40);
});

const t0 = Date.now();
counting = true;
stat.reqs = [];

await page.evaluate(({ to }) => {
    const sel = document.getElementById('active-folder-select');
    sel.value = to;
    sel.dispatchEvent(new Event('change'));
}, { to: TO });

let switched = true;
try {
    await page.waitForFunction((noteText) => {
        const btn = document.getElementById('reload_button');
        const busy = btn && btn.getAttribute('aria-busy') === 'true';
        const notesOk = typeof allNotesData !== 'undefined' && Array.isArray(allNotesData)
            && allNotesData.some(x => String(x.notetxt || '').includes(noteText));
        const activeOk = localStorage.getItem('active_folder_name') === 'Work';
        return activeOk && notesOk && !busy;
    }, NEW_NOTE, { timeout: 45000 });
} catch { switched = false; }
const elapsed = Date.now() - t0;
counting = false;

const after = await page.evaluate(() => {
    if (window.__timer) clearInterval(window.__timer);
    const btn = document.getElementById('reload_button');
    const img = btn ? btn.querySelector('img') : null;
    return {
        boot: window.__boot || null,
        samples: window.__samples || [],
        button: { a: img ? img.style.animation : '', pe: btn ? btn.style.pointerEvents : null, ab: btn ? btn.getAttribute('aria-busy') : null },
        active: localStorage.getItem('active_folder_name'),
        names: localStorage.getItem('gdrive_folder_names'),
        toasts: window.__toasts || [],
        settingsErr: window.__settingsErr || null,
        notes: (typeof allNotesData !== 'undefined' ? allNotesData : []).map(x => x.notetxt),
        rendered: (document.getElementById('notes-container') || {}).textContent || ''
    };
});

const spinning = after.samples.filter(s => /spin/.test(String(s.a)) && s.pe === 'none' && s.ab === 'true');
const reqCount = stat.reqs.length;

console.log(`\n--- измерване: ${elapsed} ms, ${reqCount} Drive заявки за смяната`);
console.log('    заявки: ' + stat.reqs.map(r => r.method + ' ' + r.path.split('?')[0]).join(' | '));
console.log(`    проби на бутона: ${after.samples.length}, от тях със спинер: ${spinning.length}`);
console.log('    тостове: ' + JSON.stringify(after.toasts) + '\n');

ok(after.boot && after.boot.startsWith('alive-'), 'страницата не се презарежда', after.boot);
ok(spinning.length >= 3, 'по време на смяната бутонът Refresh се върти и не приема клик', { samples: after.samples.slice(0, 6), spinning: spinning.length });
ok(after.button.ab === 'false' && after.button.pe !== 'none' && !/spin/.test(after.button.a), 'след смяната бутонът е в нормално състояние', after.button);
ok(switched, 'новата папка е активна и бележките ѝ са заредени', { active: after.active, notes: after.notes });
ok(after.active === TO, 'активната папка е ' + TO, after.active);
ok(after.notes.length === 1 && String(after.notes[0]).includes(NEW_NOTE), 'заредена е бележката на новата папка', after.notes);
ok(after.names && JSON.parse(after.names).includes(TO), 'новата папка е записана в списъка с папки', after.names);
ok(Array.isArray(after.toasts) && after.toasts.some(t => /смяна на папка|switching folder/i.test(t)), 'показва се съобщение за смяната', after.toasts);
ok(reqCount <= 17, 'за смяната отиват по-малко заявки към Drive (старият код: 20)', { reqCount });
ok(elapsed < 3000, `смяната при ${LAT} ms на заявка минава под 3 s (старият код: 3.76 s)`, { elapsed });
// Двете съобщения идват от подправените Google скриптове в теста, не от приложението:
// появяват се и върху стария код.
const realErrs = errs.filter(e => !/google is not defined/.test(e) && !/^Unexpected token '\}'$/.test(e));
ok(realErrs.length === 0, 'няма грешки в страницата', realErrs.slice(0, 3));

await ctx.close();
await browser.close();
srv.close();

console.log(fails === 0 ? `\nOK всички ${n} проверки минават` : `\nFAILED ${fails} от ${n} проверки`);
process.exit(fails === 0 ? 0 : 1);
