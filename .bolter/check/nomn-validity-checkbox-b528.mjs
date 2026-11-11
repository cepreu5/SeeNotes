// nomn b5.28: в реда с датата остава само час + квадратче „Валидност“.
// Собственик (11.11.2026): „в nomn повторението става чекбокс Валидност, поле До се маха“ и
// „в записа на бележката слагаш само дата, час и валидност“.
//
// Проверява се в истински Chromium по истинския път (засята IndexedDB, ?demo=1, 390x844):
//   1) статично: в main.js няма избор за повторение и няма поле „До“, има квадратче validity;
//      в style.css няма правила за „До“, но има за квадратчето; sw.js е nomn-b5.28;
//   2) в реда на бележката стоят точно две плочки - час и квадратче, а надписът е „Валидност“;
//   3) отметването в редакция стига до записа: дата, час и валидност, нищо друго в uiState;
//   4) отмятането в обикновения изглед се записва веднага и маха валидността, часът остава;
//   5) редът не прелива на 390px; 6) няма грешки в конзолата.
//
// Пускане от корена на хранилището: node .bolter/check/nomn-validity-checkbox-b528.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';

const PLAYWRIGHT = [
    '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs',
    'playwright'
].find(p => p === 'playwright' || existsSync(p));
const { chromium } = await import(PLAYWRIGHT);
const CHROME = [
    '/opt/ms-playwright/chromium-1248/chrome-linux64/chrome',
    '/opt/ms-playwright/chromium-1243/chrome-linux64/chrome'
].find(p => existsSync(p));

const root = path.resolve(process.env.ROOT || 'nomn');
const DB_NAME = 'NotesDB-demo';
const W = Number(process.env.W || 390), H = Number(process.env.H || 844);
const NOTE_GDID = 'Note000000000000000001';

const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/__seed.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end('<!doctype html><meta charset="utf-8"><title>seed</title>');
        return;
    }
    const rel = p === '/' ? 'index.html' : p;
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
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : ''));
    if (!cond) fails++;
};
const done = async (browser) => {
    if (browser) await browser.close();
    srv.close();
    console.log(fails ? 'FAILED' : `OK ${n - fails}/${n}`);
    process.exit(fails ? 1 : 0);
};

// --- 1. Статично -------------------------------------------------------------------------------
const mainJs = await readFile(path.join(root, 'main.js'), 'utf8');
const css = await readFile(path.join(root, 'style.css'), 'utf8');
const sw = await readFile(path.join(root, 'sw.js'), 'utf8');
const bg = JSON.parse(await readFile(path.join(root, 'lang/i18n-bg.json'), 'utf8'));
ok(!mainJs.includes('note-cal-repeat-select') && !mainJs.includes('noteCalRepeatDaily'),
    'в main.js няма избор за повторение');
ok(!mainJs.includes('note-cal-until') && !mainJs.includes('noteCalUntil'),
    'в main.js няма поле „До“');
ok(/validityInput\.type = 'checkbox'/.test(mainJs), 'квадратчето е истински checkbox');
ok(/validityInput\.checked \? \{ f: NOTE_CAL_VALIDITY_FREQ, u: null \} : null/.test(mainJs),
    'отметката се пази като cRepeat {f: validity, u: null}, без отметка - нищо');
ok(!css.includes('note-cal-until'), 'в style.css няма правила за „До“');
ok(/\.note-cal-chip \.note-cal-validity-input\s*\{/.test(css), 'в style.css има правило за квадратчето');
ok(/CACHE_NAME = 'nomn-b5\.28'/.test(sw), 'sw.js е вдигнат на nomn-b5.28');
ok(bg.noteCalRepeatValidity === 'Валидност', 'надписът идва от езиковия файл', bg.noteCalRepeatValidity);

// --- 2. Живият път ----------------------------------------------------------------------------
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

await page.goto(`${ORIGIN}/__seed.html`, { waitUntil: 'load' });
const seed = await page.evaluate(async ({ dbName, gdid }) => {
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
        const at = new Date(now + 3 * 24 * 60 * 60 * 1000);
        at.setHours(12, 0, 0, 0);
        const boards = [{ backcolor: 0, backnum: 0, backpath: '', color: '#2196F3', colorfont: '#000', datemod: now, gdid: 'b1', id: 1, numord: 1, status: 0, title: 'Работа' }];
        const notes = [{
            alarm_type: -1, boardid: 'b1', calendarDate: at.getTime(), color: 0,
            date: now - 1000, datemod: now - 1000, eventId: 0,
            gdid, id: 1001, notetxt: 'С ДАТА|Тяло за проверка', numord: 1, pass: false, sellist: 0,
            status: 0, text_span: '', timer: 0, timer_type: -1, timer_val: 1, title_span: '', type: 0,
            uiState: { cTime: '14:30' }, version: 243
        }];
        await new Promise((res, rej) => {
            const tx = db.transaction(['boards', 'notes', 'config'], 'readwrite');
            tx.oncomplete = res; tx.onerror = () => rej(tx.error);
            tx.objectStore('boards').clear(); tx.objectStore('notes').clear(); tx.objectStore('config').clear();
            boards.forEach(b => tx.objectStore('boards').put(b));
            notes.forEach(x => tx.objectStore('notes').put(x));
            tx.objectStore('config').put(1, 'dbSource');
            tx.objectStore('config').put('gdid', 'dbNoteIdType');
            tx.objectStore('config').put(now, 'dbCreatedTimestamp');
        });
        db.close();
        return { ok: true };
    } catch (e) { return { err: String((e && e.message) || e).slice(0, 300) }; }
}, { dbName: DB_NAME, gdid: NOTE_GDID });
ok(seed.ok === true, 'базата е засята: борд „Работа“ и бележка с дата и час', seed);
if (fails) await done(browser);

await page.goto(`${ORIGIN}/index.html?demo=1`, { waitUntil: 'load' });
const ready = await page.waitForFunction(() => document.body.classList.contains('app-ready')
    && document.querySelectorAll('#notes-container .note').length > 0, null, { timeout: 30000 })
    .then(() => true, () => false);
ok(ready, 'приложението се вдигна и бордът има карти');
if (!ready) await done(browser);

const settle = (ms = 250) => page.waitForTimeout(ms);
const readNote = () => page.evaluate(({ dbName, gdid }) => new Promise((res) => {
    const req = indexedDB.open(dbName);
    req.onsuccess = () => {
        const d = req.result;
        const g = d.transaction('notes', 'readonly').objectStore('notes').get(gdid);
        g.onsuccess = () => {
            const v = g.result;
            d.close();
            res(v ? { calendarDate: v.calendarDate, uiState: v.uiState || null, keys: Object.keys(v.uiState || {}) } : null);
        };
        g.onerror = () => { d.close(); res({ err: String(g.error) }); };
    };
    req.onerror = () => res({ err: 'open failed' });
}), { dbName: DB_NAME, gdid: NOTE_GDID });

// Отваря бележката с истинска мишка по заглавието на картата.
const openNote = async () => {
    const box = await page.evaluate(() => {
        const card = Array.from(document.querySelectorAll('#notes-container .note'))
            .find(c => c.style.display !== 'none' && (c.querySelector('.note-title-truncated')?.textContent || '').trim() === 'С ДАТА');
        if (!card) return { err: 'няма видима карта „С ДАТА“' };
        card.scrollIntoView({ block: 'center' });
        const el = card.querySelector('.note-title-truncated');
        const r = el.getBoundingClientRect();
        const x = Math.round(r.left + Math.min(r.width / 2, 60)), y = Math.round(r.top + Math.min(r.height / 2, 12));
        return { x, y, hit: !!document.elementFromPoint(x, y) };
    });
    if (box.err) return box;
    await page.mouse.click(box.x, box.y);
    return { ok: await page.waitForSelector('.note-window.visible .note-cal-row', { timeout: 8000 }).then(() => true, () => false) };
};

const first = await openNote();
ok(first.ok === true, 'бележката се отваря и редът с датата е там', first);

// --- 3. Редът: две плочки, квадратче „Валидност“, без „До“ -------------------------------------
const row1 = await page.evaluate(() => {
    const win = document.querySelector('.note-window.visible');
    const row = win.querySelector('.note-cal-row');
    const box = row.querySelector('.note-cal-validity-input');
    const text = row.querySelector('.note-cal-validity-text');
    return {
        chips: row.children.length,
        hasTime: !!row.querySelector('.note-cal-time-input'),
        isCheckbox: !!box && box.type === 'checkbox',
        checked: !!box && box.checked,
        label: text ? text.textContent.trim() : '',
        noRepeat: !row.querySelector('select'),
        noUntil: !row.querySelector('.note-cal-until, .note-cal-until-input'),
        overflow: row.scrollWidth - row.clientWidth
    };
});
ok(row1.chips === 2 && row1.hasTime === true, 'редът е точно две плочки: час и квадратче', row1);
ok(row1.isCheckbox === true && row1.checked === false, 'квадратчето е празно при бележка без валидност', row1);
ok(row1.label === 'Валидност', 'надписът до квадратчето е „Валидност“', row1.label);
ok(row1.noRepeat === true && row1.noUntil === true, 'в реда няма избор за повторение и няма „До“', row1);
ok(row1.overflow <= 1, 'редът не прелива на 390px', row1.overflow);

// --- 4. Отметка в редакция стига до записа: само дата, час и валидност -------------------------
const edit = await page.evaluate(() => {
    const body = document.querySelector('.note-window.visible .nw-modal-body') || document.getElementById('modal-body');
    if (!body) return { err: 'няма тяло на бележката' };
    if (body.querySelector('textarea')) return { ok: true, already: true };
    if (typeof enableNoteEditing === 'function') { enableNoteEditing(body, -1); }
    return { ok: !!body.querySelector('textarea'), hasFn: typeof enableNoteEditing === 'function' };
});
ok(edit.ok === true, 'бележката влиза в редакция', edit);
await page.screenshot({ path: '.bolter/check/validity-row-nomn.png' });

const before = await readNote();
ok(before && before.uiState && !before.uiState.cRepeat, 'преди отметката в записа няма валидност', before);

const clickBox = await page.evaluate(() => {
    const box = document.querySelector('.note-window.visible .note-cal-validity-input');
    if (!box) return { err: 'няма квадратче' };
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    return { checked: box.checked, draft: (document.querySelector('.note-window.visible .nw-modal-body') || {}).dataset?.cRepeat || '' };
});
ok(clickBox.checked === true, 'квадратчето се отмята', clickBox);

await page.evaluate(() => { if (typeof saveEditedNote === 'function') saveEditedNote(); });
await settle(900);
const after = await readNote();
ok(after && after.uiState && after.uiState.cRepeat && after.uiState.cRepeat.f === 'validity',
    'след записа валидността е в бележката', after);
ok(after && after.uiState && after.uiState.cRepeat && after.uiState.cRepeat.u === null,
    'към валидността няма „До“', after && after.uiState);
ok(after && after.uiState && after.uiState.cTime === '14:30', 'часът е запазен', after && after.uiState);
ok(after && after.keys && after.keys.filter(k => k !== 'exp').sort().join(',') === 'cRepeat,cTime',
    'в uiState има само час и валидност (exp е състоянието на прозореца)', after && after.keys);
ok(after && after.calendarDate > 0 && after.calendarDate === before.calendarDate,
    'датата не е пипана', [before && before.calendarDate, after && after.calendarDate]);

// --- 5. Отмятане в обикновения изглед се записва веднага ---------------------------------------
await page.keyboard.press('Escape');
await settle(400);
const reopened = await openNote();
ok(reopened.ok === true, 'бележката се отваря пак', reopened);
const row2 = await page.evaluate(() => {
    const row = document.querySelector('.note-window.visible .note-cal-row');
    const box = row.querySelector('.note-cal-validity-input');
    return { hidden: !!box && box.closest('.note-cal-validity').hidden, checked: !!box && box.checked, visible: !row.hidden };
});
ok(row2.checked === true && row2.hidden === false && row2.visible === true,
    'в обикновения изглед квадратчето се вижда отметнато', row2);

await page.evaluate(() => {
    const box = document.querySelector('.note-window.visible .note-cal-validity-input');
    box.checked = false;
    box.dispatchEvent(new Event('change', { bubbles: true }));
});
await settle(900);
const cleared = await readNote();
ok(cleared && cleared.uiState && !cleared.uiState.cRepeat,
    'отмятането маха валидността от записа', cleared && cleared.uiState);
ok(cleared && cleared.uiState && cleared.uiState.cTime === '14:30', 'часът остава след отмятането', cleared && cleared.uiState);
ok(cleared && cleared.calendarDate > 0, 'датата остава след отмятането', cleared && cleared.calendarDate);

ok(errs.length === 0, 'няма грешки в конзолата на страницата', errs.slice(0, 3));
await done(browser);
