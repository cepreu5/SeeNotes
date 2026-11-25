// b5.68: бутонът „Постави“ от лентата (paste-modal-btn) слагаше текста ПОД таблицата, когато
// курсорът е в таблицата в редактора; системният пейст (Ctrl+V) е наред.
// Причина: натискането на бутона вдига фокуса от полето на таблицата, getActiveModalEditor() пада
// към скритото #note-edit-textarea, а неговият курсор стои в края на бележката (под таблицата).
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let chromium;
for (const p of ['playwright', '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs']) {
    try { ({ chromium } = await import(p)); break; } catch (e) { }
}
if (!chromium) { console.error('playwright не се намира'); process.exit(2); }

const URL = process.env.PAGE || 'http://127.0.0.1:8099/nomn/index.html';
let pass = 0, fail = 0;
const check = (name, ok, extra) => {
    if (ok) { pass++; console.log('ok   ' + name); }
    else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
};

const browser = await chromium.launch();
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
const errors = [];
const noise = /reading 'getElementsByClassName'|reading 'prepend'|gsi\/client/;
page.on('pageerror', e => { if (!noise.test(e.message)) errors.push(e.message); });
page.on('console', m => { if (m.type() === 'error' && !noise.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
await page.addInitScript(() => {
    const o = { initTokenClient() { return { accessToken() { } }; }, hasGrantedAllScopes() { return false; } };
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
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.showModal === 'function', null, { timeout: 30000 });

const TABLE = '| Бележка | Собственик |\n| --- | --- |\n| mul7236376 | Cepreu |';
const BEFORE = 'Текст над таблицата.';
const AFTER = 'Текст под таблицата.';

await page.evaluate(([table, before, after]) => {
    const raw = before + '\n' + table + '\n' + after;
    showModal({ raw, format: '', titleFormat: '', color: '#fff', boardId: 'board-1', notetxt: raw, id: 'paste-' + raw.length });
}, [TABLE, BEFORE, AFTER]);
await page.waitForTimeout(700);
await page.evaluate(() => { enableNoteEditing(document.getElementById('modal-body')); });
await page.waitForFunction(() => {
    const t = document.getElementById('note-edit-textarea');
    const split = t?.parentElement.querySelector(':scope > .note-table-split');
    return !!split?.querySelector('.note-table-field');
}, null, { timeout: 15000 });

// The caret goes into the table cell „Cepreu“ - the field the owner types in.
const opened = await page.evaluate(() => {
    const field = document.querySelector('.note-table-field');
    const i = field.value.indexOf('Cepreu') + 'Cepreu'.length;
    field.focus();
    field.setSelectionRange(i, i);
    return { active: document.activeElement?.className, caret: field.selectionStart, field: field.value };
});
check('курсорът е в полето на таблицата', /note-table-field/.test(opened.active || ''), opened.active);

// The clipboard the button reads, then a real click on the toolbar button (the press takes the focus).
await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => 'XYZ', writeText: async () => { } } });
});
const btn = page.locator('#paste-modal-btn');
check('бутонът „Постави“ се вижда в лентата', await btn.isVisible());
await btn.click();
await page.waitForTimeout(250);

const done = await page.evaluate(() => {
    const main = document.getElementById('note-edit-textarea');
    const split = main.parentElement.querySelector(':scope > .note-table-split');
    return {
        main: main.value,
        caret: main.selectionStart,
        fields: split ? [...split.querySelectorAll('.note-table-field')].map(f => f.value) : [],
    };
});

const tableLines = (text) => text.split('\n').filter(l => l.startsWith('|')).join('\n');
check('текстът влиза в таблицата, не под нея', /CepreuXYZ/.test(tableLines(done.main)), tableLines(done.main));
check('поставено е само веднъж', done.main.split('XYZ').length === 2, done.main);
check('текстът под таблицата е непокътнат', done.main.endsWith(AFTER), done.main.slice(-45));
check('нищо не е добавено в края на бележката', !done.main.includes(AFTER + 'XYZ'), done.main.slice(-45));
check('полето на таблицата показва същото', done.fields.length === 1 && done.fields[0].includes('CepreuXYZ'), done.fields);
check('курсорът е след поставеното', /CepreuXYZ/.test(done.main) && done.main.slice(0, done.caret).endsWith('XYZ'), { caret: done.caret, main: done.main });
check('няма грешки в конзолата', errors.length === 0, errors.slice(0, 3));

console.log('\n' + (fail ? `FAILS: ${fail} / ${pass + fail}` : `ALL OK (${pass} проверки)`));
await browser.close();
process.exit(fail ? 1 : 0);
