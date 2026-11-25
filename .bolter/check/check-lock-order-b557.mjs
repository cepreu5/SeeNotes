// b5.57 / b5.58: катинарчето седи в footer-а на бележката преди последния бутон — в редакция това е
// дискетата (b5.57), в режим преглед моливът (b5.58, там преди беше най-ляво до датата).
//
// Проверки (в режим на редактиране, където се виждат лупата и дискетата):
//   1) видимите бутони във footer-а са Move, Calendar, Attach, Preview, Search, Lock, Save;
//   2) катинарчето е точно след лупата и точно преди дискетата;
//   3) геометрията потвърждава същия ред (ляв ръб на лупата < катинарчето < дискетата);
//   4) катинарчето се вижда (34x34);
//   5) същото и при съществуваща бележка;
//   6) същото и в изскачащ прозорец на бележка (note window);
//   7) в заглавния ред няма второ катинарче;
//   8) режим преглед (както собственикът отваря заключена бележка): редът е Move, Calendar, Duplicate,
//      Search, Lock, Edit и катинарчето е между лупата и молива, не най-ляво;
//   9) без грешки в конзолата.

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let chromium;
for (const p of [
    'playwright',
    '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs',
]) {
    try { ({ chromium } = await import(p)); break; } catch (e) { /* следващият */ }
}
if (!chromium) {
    try { ({ chromium } = await import(path.join(__dirname, 'node_modules', 'playwright', 'index.mjs'))); } catch (e) { }
}
if (!chromium) { console.error('playwright не се намира'); process.exit(2); }

const URL = process.env.PAGE || 'http://127.0.0.1:8099/nomn/index.html';

const results = [];
function check(name, ok, extra = '') {
    results.push({ name, ok, extra });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra !== '' ? '  — ' + extra : ''}`);
}

const browser = await chromium.launch();

const initScript = () => {
    const o = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
    window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2: o }, oauth2: o };
    window.gapi = window.gapi || { client: { setToken() { } }, load() { } };
    window.kofiWidgetOverlay = { draw() { } };
    window.kofiwidget2 = { init() { }, draw() { } };
    localStorage.setItem('guide', 'false');
    localStorage.setItem('useIndexedDb', 'false');
    localStorage.setItem('useGoogleDb', 'false');
    localStorage.setItem('updateLocalFolder', 'false');
    localStorage.setItem('language', 'bg');
    localStorage.setItem('singleNoteMode', 'false');
};

const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
    const url = route.request().url();
    const isScript = /\.js(\?|$)/.test(url);
    await route.fulfill({
        status: 200,
        contentType: isScript ? 'application/javascript' : 'image/gif',
        body: isScript ? '' : Buffer.from('R0lGODlhAQABAAAAACw=', 'base64')
    });
});
const page = await ctx.newPage();
await page.addInitScript(initScript);
const errors = [];
page.on('console', m => {
    if (m.type() === 'error' && !/404|Failed to load resource|Refused to execute script|net::ERR/.test(m.text())) errors.push(m.text());
});
const envNoise = /reading 'getElementsByClassName'|reading 'prepend'/;
page.on('pageerror', e => { if (!envNoise.test(e.message)) errors.push('pageerror: ' + e.message); });
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.showModal === 'function', null, { timeout: 20000 });

async function openInEdit(note) {
    await page.evaluate(async (n) => {
        window.allNotesData = window.allNotesData || [];
        window.showModal(n);
        await new Promise(r => setTimeout(r, 350));
        const edit = document.getElementById('note-edit-btn');
        if (edit && edit.getBoundingClientRect().width > 0) edit.click();
    }, note);
    await page.waitForTimeout(600);
}

const readFooter = async () => page.evaluate(() => {
    const bar = Array.from(document.querySelectorAll('.modal-footer-toolbar'))
        .find(b => b.getBoundingClientRect().width > 0);
    if (!bar) return { found: false };
    const visible = Array.from(bar.children).filter(c => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    });
    const nameOf = (c) => {
        const raw = `${c.id || ''} ${c.className || ''}`;
        const m = raw.match(/(?:^|\s)(nw-note-[a-z]+-btn|note-[a-z]+-btn)(?:\s|$)/);
        return m ? m[1] : (c.id || c.className);
    };
    const ids = visible.map(nameOf);
    const rect = (name) => {
        const el = visible.find(c => nameOf(c).replace(/^nw-/, '') === name);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
        found: true,
        inWindow: !!bar.closest('.note-window'),
        ids,
        search: rect('note-search-btn'),
        lock: rect('note-lock-btn'),
        save: rect('note-save-btn'),
        edit: rect('note-edit-btn'),
        headerLock: !!document.querySelector('[data-mwid="lock-modal-btn"]')
    };
});

function checkOrder(label, f) {
    const expected = ['note-move-btn', 'note-calendar-btn', 'note-attach-btn', 'note-preview-btn', 'note-search-btn', 'note-lock-btn', 'note-save-btn'];
    // В прозорец на бележка същите бутони носят id с представка nw-
    const ids = f.ids.map(id => String(id).replace(/^nw-/, ''));
    check(`${label}: редът е Move, Calendar, Attach, Preview, Search, Lock, Save`,
        JSON.stringify(ids) === JSON.stringify(expected), f.ids.join(' | '));
    const i = ids.indexOf('note-lock-btn');
    check(`${label}: катинарчето е точно след лупата и точно преди дискетата`,
        i > 0 && ids[i - 1] === 'note-search-btn' && ids[i + 1] === 'note-save-btn',
        ids.slice(Math.max(0, i - 1), i + 2).join(' > '));
    check(`${label}: по геометрия лупа < катинар < дискета`,
        !!f.search && !!f.lock && !!f.save && f.search.x < f.lock.x && f.lock.x < f.save.x,
        `search ${f.search && f.search.x} / lock ${f.lock && f.lock.x} / save ${f.save && f.save.x}`);
    check(`${label}: катинарчето се вижда 34x34`,
        !!f.lock && f.lock.w === 34 && f.lock.h === 34, f.lock ? `${f.lock.w}x${f.lock.h}` : 'няма');
}

// 1: нова бележка
await openInEdit({ raw: '', isNewNote: true, boardId: 'all' });
const fresh = await readFooter();
check('footer-ът е намерен', fresh.found === true);
if (fresh.found) checkOrder('нова бележка', fresh);
check('в заглавния ред няма второ катинарче', fresh.headerLock === false);

// 2: съществуваща бележка
await openInEdit({
    id: 950, gdid: 'order-950', boardid: 'all', status: 0, date: Date.now(), datemod: Date.now(),
    raw: 'Тяло за реда', title: 'Заглавие', pass: false, attachments: []
});
const existing = await readFooter();
if (existing.found) checkOrder('съществуваща бележка', existing);

// 3: разположението при прозореца на бележката е същото (модалът живее в .note-window)
const inWin = await readFooter();
check('бележката се показва в прозорец и footer-ът е същият',
    inWin.found === true && inWin.inWindow === true, `found=${inWin.found} inWindow=${inWin.inWindow}`);

// 4: режим преглед — точно състоянието, в което собственикът вижда заключена бележка (без клик на
// молива). Страницата се презарежда, за да няма отворен редактор от предишните случаи. Тук няма
// дискета, затова катинарчето трябва да е между лупата и молива, а не най-ляво до датата.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.showModal === 'function', null, { timeout: 20000 });
await page.evaluate(async (n) => {
    window.allNotesData = window.allNotesData || [];
    window.allNotesData.push(n);
    window.showModal(n);
    await new Promise(r => setTimeout(r, 700));
}, { id: 951, gdid: 'order-951', boardid: 'all', status: 0, date: Date.now(), datemod: Date.now(), raw: 'nmenc:v1:AAAA:BBBB:CCCC', title: 'Ключ', pass: true, attachments: [] });
await page.waitForTimeout(500);
const preview = await readFooter();
check('преглед: footer-ът е намерен', preview.found === true);
if (preview.found) {
    const pids = preview.ids.map(id => String(id).replace(/^nw-/, ''));
    check('преглед: редът е Move, Calendar, Duplicate, Search, Lock, Edit',
        JSON.stringify(pids) === JSON.stringify(['note-move-btn', 'note-calendar-btn', 'note-duplicate-btn', 'note-search-btn', 'note-lock-btn', 'note-edit-btn']),
        pids.join(' | '));
    const li = pids.indexOf('note-lock-btn');
    check('преглед: катинарчето е точно след лупата и точно преди молива',
        li > 0 && pids[li - 1] === 'note-search-btn' && pids[li + 1] === 'note-edit-btn',
        pids.slice(Math.max(0, li - 1), li + 2).join(' > '));
    check('преглед: по геометрия лупа < катинар < молив',
        !!preview.search && !!preview.lock && !!preview.edit && preview.search.x < preview.lock.x && preview.lock.x < preview.edit.x,
        `search ${preview.search && preview.search.x} / lock ${preview.lock && preview.lock.x} / edit ${preview.edit && preview.edit.x}`);
}

check('без грешки в конзолата', errors.length === 0, errors.slice(0, 3).join(' / '));

await browser.close();
const failed = results.filter(r => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
