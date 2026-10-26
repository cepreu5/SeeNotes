// X върху плочката в режим ЧЕТЕНЕ: маха ли се вградената снимка от ЗАПИСАНАТА бележка и остават ли
// форматите на местата си. Отделен скрипт от attach-delete-x.mjs, защото там се проверява лентата и
// потвърждението, а тук - пътят по обекта на бележката (notetxt/text_span/title_span) и записът.
// Пускане от корена на хранилището: node .bolter/check/attach-delete-read-mode.mjs   (exit 1 при провал)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const PLAYWRIGHT = [
    '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.2/lib/node_modules/@playwright/mcp/node_modules/playwright/index.mjs',
    'playwright'
].find(p => p === 'playwright' || existsSync(p));
const { chromium } = await import(PLAYWRIGHT);
const CHROME = ['/opt/ms-playwright/chromium-1248/chrome-linux64/chrome', '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome']
    .find(p => existsSync(p));

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index.html' : p;
    try {
        const b = await readFile(path.join(root, rel));
        res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(b);
    } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let fails = 0, n = 0;
// Форматите се пазят като JSON-и, слепени с '|' - същото като parseFormatsString в приложението.
const parseF = (s) => String(s || '').split(/[|\n]/).filter(x => x.trim() !== '')
    .map(x => { try { return JSON.parse(x); } catch { return null; } })
    .filter(f => f && f.start !== undefined && f.end !== undefined);
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'ok   ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra) : ''));
    if (!cond) fails++;
};

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
const GSI = 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};';
await ctx.route(/^https?:\/\/(?!localhost)/, route => {
    const url = route.request().url();
    const body = url.startsWith('https://accounts.google.com/gsi/client') ? GSI : '';
    return route.fulfill({ status: 200, contentType: 'application/javascript', body });
});
const page = await ctx.newPage();
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
    r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));
const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.addInitScript(() => {
    sessionStorage.setItem('google_auth_token', JSON.stringify({ access_token: 'tok', issued_at: Date.now(), expires_in: 3600 }));
});
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof nmRemoveInlineImageFromNote === 'function' && typeof allNotesData !== 'undefined', null, { timeout: 25000 });

// Тяло: "първо * после * край" - звездичките са знаците на вградените снимки (така ги вкарва
// noteEditReplace), покрити с формат type=8.
const BODY = 'първо * после * край';
const TITLE = 'Заглавие * и тук';
const body1 = BODY.indexOf('*');
const body2 = BODY.indexOf('*', body1 + 1);
const titleMarker = TITLE.indexOf('*');
const bodyFormats = [
    { start: body1, end: body1 + 1, type: 8, paramint: 3, paramstring: 'a.png' },
    { start: body2, end: body2 + 1, type: 8, paramint: 5, paramstring: 'b.png' },
    { start: BODY.indexOf('край'), end: BODY.indexOf('край') + 4, type: 1, paramint: 1 }
];
const titleFormats = [
    { start: titleMarker, end: titleMarker + 1, type: 8, paramint: 2, paramstring: 'a.png' }
];

const setup = await page.evaluate(({ BODY, TITLE, bodyFormats, titleFormats }) => {
    contentModal = document.getElementById('content-modal');
    modalBody = document.getElementById('modal-body');
    // text_span/title_span се пазят като JSON-и, слепени с '|' (stringifyFormatsArray), не като
    // един JSON масив - така ги пише и приложението.
    const note = {
        id: 'note-1',
        gdid: 'GDIDNOTE0000000001',
        notetxt: TITLE + '|' + BODY,
        text_span: stringifyFormatsArray(bodyFormats),
        title_span: stringifyFormatsArray(titleFormats),
        version: 4,
        datemod: 1
    };
    allNotesData.length = 0;
    allNotesData.push(note);
    modalBody.dataset.id = note.id;
    modalBody.dataset.gdid = note.gdid;
    document.getElementById('content-modal').style.display = 'flex';
    // Записът и преизграждането на картата се прихващат: до Drive не се стига, а тук се проверява
    // ДАЛИ са повикани и с какво.
    window.__saved = [];
    window.__refreshed = [];
    window.__hydrated = 0;
    window.writeNoteToSources = (obj) => { window.__saved.push({ notetxt: obj.notetxt, text_span: obj.text_span, title_span: obj.title_span, version: obj.version }); return Promise.resolve(); };
    window.refreshNoteUI = (gdid) => { window.__refreshed.push(gdid); return Promise.resolve(); };
    window.hydrateInlineImages = () => { window.__hydrated++; };
    return true;
}, { BODY, TITLE, bodyFormats, titleFormats });

// --- 1. Махане на a.png (тя е и в заглавието, и в тялото) ---
const out = await page.evaluate(async () => {
    const removed = await nmRemoveInlineImageFromNote(modalBody, 'a.png');
    const note = allNotesData[0];
    return {
        removed,
        notetxt: note.notetxt,
        text_span: note.text_span,
        title_span: note.title_span,
        version: note.version,
        saved: window.__saved.length,
        savedVersion: window.__saved[0] && window.__saved[0].version,
        refreshed: window.__refreshed.length,
        html: modalBody.innerHTML,
        rendered: modalBody.dataset.renderedHtml || ''
    };
});

ok(out.removed === 2, 'махнати са две места - едно в тялото и едно в заглавието', out.removed);
const [titleAfter, bodyAfter] = out.notetxt.split('|');
ok(titleAfter === 'Заглавие  и тук', 'от заглавието е махната звездичката, а думите са цели', titleAfter);
ok(bodyAfter === 'първо  после * край', 'от тялото е махната първата звездичка, втората е останала', bodyAfter);

const bf = parseF(out.text_span);
const img2 = bf.find(f => Number(f.type) === 8);
ok(!!img2 && img2.paramstring === 'b.png', 'останалият формат на снимка е този на b.png', bf);
ok(!!img2 && bodyAfter[img2.start] === '*' && img2.end === img2.start + 1, 'втората снимка пак сочи своята звездичка', img2 && { at: bodyAfter[img2.start], start: img2.start, end: img2.end });
const bold = bf.find(f => Number(f.type) === 1);
ok(!!bold && bodyAfter.slice(bold.start, bold.end) === 'край', 'удебеляването пак покрива точно „край“', bold && { covered: bodyAfter.slice(bold.start, bold.end) });
const tf = parseF(out.title_span);
ok(!tf.some(f => f.paramstring === 'a.png'), 'в заглавието не е останал формат на махнатата снимка', tf);

ok(!out.html.includes('a.png') && !out.rendered.includes('a.png'), 'в нарисуваното няма рамка на махнатата снимка');
ok(out.html.includes('b.png') || out.rendered.includes('b.png'), 'рамката на другата снимка е останала');
ok(out.version === 5, 'версията на бележката е вдигната', out.version);
ok(out.saved === 1 && out.savedVersion === 5, 'бележката е записана веднъж, с новата версия', out);
ok(out.refreshed === 1, 'картата на бележката е преизградена', out.refreshed);
ok(out.html.includes('после') && out.html.includes('край'), 'останалият текст е на мястото си');

// --- 2. Не пипа бележка, в която снимката не е вградена ---
const noop = await page.evaluate(async () => {
    const note = allNotesData[0];
    const before = note.notetxt;
    const removed = await nmRemoveInlineImageFromNote(modalBody, 'nyama.png');
    return { removed, same: note.notetxt === before, saved: window.__saved.length };
});
ok(noop.removed === 0, 'липсващо име не маха нищо', noop.removed);
ok(noop.same === true, 'текстът не е пипан', noop.same);
ok(noop.saved === 1, 'и не е записвано втори път', noop.saved);

ok(errs.length === 0, 'в конзолата няма грешки', errs.slice(0, 3));

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минаха`);
process.exit(fails ? 1 : 0);
