// uni: Архивът чете и файлове с добавка в името ('boards (1).bcp').
// Телефонното приложение записва архивните файлове с добавка в името. Досега проверката
// на папката ги приемаше (шаблони /^boards.*\.bcp$/i), а четенето търсеше точно
// getFileHandle('boards.bcp') → NotFoundError, тост и нула бележки.
//
// Какво проверява (истински Chromium, истинският код от uni/):
//   1) validateArhFolderContent приема папка само с 'boards (1).bcp' и 'notes (2).bcp';
//   2) readArh на същата папка връща true и пълни boardsData/allNotesData/mediaData;
//   3) контрола: точните имена boards.bcp / notes.bcp / medias.bcp още се четат;
//   4) смесен случай: 'boards (1).bcp' + 'notes.bcp';
//   5) липсва notes* → readArh връща false, без непохванато изключение;
//   6) липсва medias* → readArh връща true и mediaData е [];
//   7) папка само с notes* → isValid false, reason 'criteria_not_met';
//   8) подпапки се игнорират (kind:'directory' не е файл);
//   9) нула непохванати грешки в конзолата на страницата до края на хода.
//
// Пускане от корена на хранилището: node .bolter/check/arh-file-suffix.mjs
// ROOT=… сочи друга папка на приложението (контрола срещу старата версия на uni/).
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

// Минимално състояние: без вход, без локална база — приложението не посяга към мрежата.
const BASE_STATE = () => {
    localStorage.setItem('language', 'bg');
    localStorage.setItem('hideAssistant', 'true');
    localStorage.setItem('initial_setup_complete', 'true');
    localStorage.setItem('useGoogleDb', 'false');
    localStorage.setItem('useLocalDb', 'false');
    localStorage.setItem('useArhDb', 'false');
    localStorage.setItem('useIndexedDb', 'false');
};

// Google Identity Services се подменя преди main.js: външният скрипт не се тегли, а
// приложението не бива да пада с „google is not defined“ при старт.
const GOOGLE_STUB = () => {
    const client = { requestAccessToken() { }, callback: null, error_callback: null };
    const oauth2 = { initTokenClient: () => client, hasGrantedAllScopes() { return false; }, revoke() { } };
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
await page.addInitScript(BASE_STATE);
await page.addInitScript(GOOGLE_STUB);

// Оценка в страницата, която не събаря теста: грешката става резултат, а не изключение.
const ev = async (fn, arg) => {
    try { return { ok: true, value: await page.evaluate(fn, arg) }; }
    catch (e) { return { ok: false, err: String(e && e.message || e).slice(0, 300) }; }
};

let booted = false;
try {
    await page.goto(`${ORIGIN}/${PAGE}`, { waitUntil: 'load' });
    await page.waitForFunction(
        () => typeof readArh === 'function' && typeof validateArhFolderContent === 'function',
        null, { timeout: 30000 });
    booted = true;
} catch (e) {
    booted = false;
}
ok(booted, 'страницата зарежда main.js и readArh / validateArhFolderContent са налични');

// Фалшив FileSystemDirectoryHandle: истински имена, истински JSON низове.
// getFileHandle хвърля DOMException NotFoundError за липсващ файл, както прави браузърът,
// а values() връща същите handle-и (с getFile), както истинската папка.
await ev(() => {
    window.__mkDir = (spec) => {
        const handles = spec.map(e => ({
            kind: e.kind || 'file',
            name: e.name,
            async getFile() { return { name: e.name, async text() { return e.json; } }; }
        }));
        const files = new Map(handles.filter(h => h.kind === 'file').map(h => [h.name, h]));
        return {
            name: 'arh-test',
            kind: 'directory',
            async *values() { for (const h of handles) yield h; },
            async getFileHandle(name) {
                if (!files.has(name)) throw new DOMException(`Файл '${name}' не е намерен.`, 'NotFoundError');
                return files.get(name);
            },
            async queryPermission() { return 'granted'; },
            async requestPermission() { return 'granted'; },
            async *entries() { for (const h of handles) yield [h.name, h]; }
        };
    };
    // Зареждането на архива обновява броячи и може да поиска синхронизация — тук не ни трябва.
    window.syncFolderDataAsync = async () => { };
});

// --- Данни на архива (по 2 борда, 3 бележки и 1 медиен запис) ---
const BOARDS = JSON.stringify([{ id: '1', name: 'Борд 1' }, { id: '2', name: 'Борд 2' }]);
const NOTES = JSON.stringify([{ id: '11', numord: '1', title: 'Първа' }, { id: '12', numord: '2', title: 'Втора' }, { id: '13', numord: '3', title: 'Трета' }]);
const MEDIA = JSON.stringify([{ id: 'm1', mediaName: 'snimka.png' }]);
const f = (name, json) => ({ name, kind: 'file', json });
const d = (name) => ({ name, kind: 'directory' });

// Чете през фалшивата папка: занулява глобалните, вика readArh и връща какво е останало в тях.
const runRead = (spec) => ev(async (spec) => {
    boardsData = []; allNotesData = []; mediaData = [];
    const ret = await readArh(window.__mkDir(spec));
    return {
        ret,
        boards: boardsData.map(b => b.id),
        notes: allNotesData.map(x => x.id),
        media: mediaData.map(m => m.id)
    };
}, spec);

const runValidate = (spec) => ev(async (spec) => await validateArhFolderContent(window.__mkDir(spec)), spec);

const sameIds = (a, b) => Array.isArray(a) && a.length === b.length && a.every(x => b.includes(x));

// --- 1. Проверката на папката приема имена с добавка ---
const vSuffix = await runValidate([f('boards (1).bcp', BOARDS), f('notes (2).bcp', NOTES)]);
ok(vSuffix.ok && vSuffix.value.isValid === true && vSuffix.value.reason === null,
    'проверката приема папка само с „boards (1).bcp“ и „notes (2).bcp“',
    vSuffix.ok ? vSuffix.value : vSuffix.err);

// --- 2. Четенето на същата папка (тук старият код падаше) ---
const rSuffix = await runRead([f('boards (1).bcp', BOARDS), f('notes (2).bcp', NOTES), f('medias (3).bcp', MEDIA)]);
ok(rSuffix.ok && rSuffix.value.ret === true,
    'readArh връща true за папка с имена с добавка', rSuffix.ok ? rSuffix.value : rSuffix.err);
ok(rSuffix.ok && rSuffix.value.boards.length === 2 && rSuffix.value.notes.length === 3,
    'бордовете и бележките са прочетени от файловете с добавка',
    rSuffix.ok ? { boards: rSuffix.value.boards, notes: rSuffix.value.notes } : rSuffix.err);
ok(rSuffix.ok && sameIds(rSuffix.value.media, ['m1']),
    'медиите са прочетени от „medias (3).bcp“', rSuffix.ok ? rSuffix.value.media : rSuffix.err);

// --- 3. Контрола: точните имена още се четат (регресия) ---
const rExact = await runRead([f('boards.bcp', BOARDS), f('notes.bcp', NOTES), f('medias.bcp', MEDIA)]);
ok(rExact.ok && rExact.value.ret === true && rExact.value.boards.length === 2
    && rExact.value.notes.length === 3 && rExact.value.media.length === 1,
    'контрола: точните имена boards.bcp / notes.bcp / medias.bcp още се четат',
    rExact.ok ? { ret: rExact.value.ret, boards: rExact.value.boards.length, notes: rExact.value.notes.length, media: rExact.value.media.length } : rExact.err);

// --- 4. Смесен случай: едното име с добавка, другото точно ---
const rMixed = await runRead([f('boards (1).bcp', BOARDS), f('notes.bcp', NOTES)]);
ok(rMixed.ok && rMixed.value.ret === true && rMixed.value.boards.length === 2 && rMixed.value.notes.length === 3,
    'смесен случай: „boards (1).bcp“ + „notes.bcp“ се четат',
    rMixed.ok ? rMixed.value : rMixed.err);

// --- 5. Липсва notes* → false, без непохванато изключение ---
const rNoNotes = await runRead([f('boards (1).bcp', BOARDS)]);
ok(rNoNotes.ok && rNoNotes.value.ret === false,
    'липсващ notes*.bcp: readArh връща false, без непохванато изключение',
    rNoNotes.ok ? rNoNotes.value : rNoNotes.err);
ok(rNoNotes.ok && rNoNotes.value.boards.length === 2 && rNoNotes.value.notes.length === 0,
    'липсващ notes*.bcp: бордовете са прочетени, бележки няма',
    rNoNotes.ok ? rNoNotes.value : rNoNotes.err);

// --- 6. Липсва medias* → true и mediaData е [] ---
const rNoMedia = await runRead([f('boards (1).bcp', BOARDS), f('notes (2).bcp', NOTES)]);
ok(rNoMedia.ok && rNoMedia.value.ret === true && Array.isArray(rNoMedia.value.media) && rNoMedia.value.media.length === 0,
    'липсващ medias*.bcp: readArh връща true и mediaData е []',
    rNoMedia.ok ? { ret: rNoMedia.value.ret, media: rNoMedia.value.media } : rNoMedia.err);

// --- 7. Папка само с notes* не минава проверката ---
const vNoBoards = await runValidate([f('notes (2).bcp', NOTES)]);
ok(vNoBoards.ok && vNoBoards.value.isValid === false && vNoBoards.value.reason === 'criteria_not_met',
    'папка само с notes*.bcp: isValid false, reason criteria_not_met',
    vNoBoards.ok ? vNoBoards.value : vNoBoards.err);

// --- 8. Подпапки се игнорират ---
const vDirs = await runValidate([d('boards'), d('medias.bcp'), f('boards (1).bcp', BOARDS), f('notes (2).bcp', NOTES)]);
ok(vDirs.ok && vDirs.value.isValid === true,
    'подпапки не се броят за файлове (проверката)', vDirs.ok ? vDirs.value : vDirs.err);
const rDirs = await runRead([d('boards'), d('medias.bcp'), f('boards (1).bcp', BOARDS), f('notes (2).bcp', NOTES)]);
ok(rDirs.ok && rDirs.value.ret === true && rDirs.value.boards.length === 2
    && rDirs.value.notes.length === 3 && rDirs.value.media.length === 0,
    'подпапки се игнорират и при четенето (подпапка „medias.bcp“ не е медиен файл)',
    rDirs.ok ? rDirs.value : rDirs.err);

// --- 9. Конзола ---
ok(errs.length === 0, 'няма непохванати грешки в страницата', errs.slice(0, 5));

await ctx.close();
await browser.close();
srv.close();

console.log(fails ? `\n${n - fails}/${n} проверки минават\nFAILED` : `\nOK (${n} проверки)`);
process.exit(fails ? 1 : 0);
