// b5.62: заключена бележка → катинарче (покажи) → Редакция → попълване на заглавие → Запис →
// катинарче (заключи) → затваряне и отваряне: добавеното заглавие липсваше.
// Причина: кешът за сесията (nmEncPlainCache) пази открития текст от показването, а след Запис
// бележката става отключена и записът НЕ се обновяваше в кеша. Заключването наново шифроваше
// стария текст от кеша и записваше него. Същото губеше и промяна в тялото (проверки 8-9).
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
const noise = /reading 'getElementsByClassName'|reading 'prepend'/;
page.on('pageerror', e => { if (!noise.test(e.message)) errors.push(e.message); });
await page.addInitScript(() => {
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
    window.__nmTestPassword = 'test-pass-123';
    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('folderIdInput');
        const ok = document.getElementById('submitFolderIdBtn');
        setInterval(() => {
            const popup = document.getElementById('folderIdPromptPopup');
            if (!popup || !popup.classList.contains('show')) return;
            const input = document.getElementById('folderIdInput'); // b5.72: полето се пресъздава при всяко отваряне, затова се търси наново
            if (input && ok && !input.value) { input.value = window.__nmTestPassword; ok.click(); }
        }, 60);
    });
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.saveEditedNote === 'function', null, { timeout: 30000 });
await page.evaluate(() => {
    window.boardData = [{ gdid: 'board-1', boardTxt: 'Тест', numord: 1 }];
    try { boardsData.length = 0; boardsData.push({ gdid: 'board-1', boardTxt: 'Тест', numord: 1 }); } catch (e) { window.boardsData = window.boardData; }
    currentBoardFilter = 'board-1';
});

const step1 = await page.evaluate(async () => {
    const note = {
        id: 900001, gdid: 'gd-900001', boardid: 'board-1', notetxt: '', pass: true,
        text_span: '', title_span: '', color: 0, datemod: Date.now(), numord: 1, date: Date.now(), version: 1
    };
    note.notetxt = await nmEncEncryptNoteText('Тяло на тайната бележка.', '');
    allNotesData.push(note);
    showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'board-1',
        id: note.id, gdid: note.gdid, datemod: note.datemod, originalNote: note });
    await new Promise(r => setTimeout(r, 700));
    const body = activeNoteWindow.body;
    return { needs: body.dataset.nmEncNeedsPassword || '', text: body.textContent.slice(0, 80),
        stored: String(note.notetxt).slice(0, 12) };
});
check('1 отваря се заключена, тялото скрито', step1.needs === 'true' && step1.text.indexOf('Тяло на тайната') === -1, step1);

const step2 = await page.evaluate(async () => {
    activeNoteWindow.box.querySelector('#note-lock-btn')?.click();
    await new Promise(r => setTimeout(r, 900));
    const body = activeNoteWindow.body;
    return { text: body.textContent.slice(0, 120), needs: body.dataset.nmEncNeedsPassword || '',
        locked: body.dataset.nmEncLocked || '' };
});
check('2 катинарчето показва тялото', step2.text.indexOf('Тяло на тайната') !== -1, step2);

const step3 = await page.evaluate(async () => {
    activeNoteWindow.box.querySelector('#note-edit-btn')?.click();
    await new Promise(r => setTimeout(r, 600));
    const titleEl = document.getElementById('note-edit-title-textarea');
    const bodyEl = document.getElementById('note-edit-textarea');
    if (titleEl) { titleEl.value = 'Добавено заглавие'; titleEl.dispatchEvent(new Event('input', { bubbles: true })); }
    const hadTitle = !!titleEl;
    activeNoteWindow.box.querySelector('#note-save-btn')?.click();
    await new Promise(r => setTimeout(r, 2500));
    const n = allNotesData.find(x => String(x.id) === '900001');
    const btn = activeNoteWindow.box.querySelector('#note-lock-btn');
    return { hadTitle, pass: n ? n.pass : null, stored: String(n ? n.notetxt : '').slice(0, 40),
        cached: nmEncPlainCache.get(nmEncCacheKeyFor(n)) || '',
        btnOn: btn ? btn.classList.contains('nw-lock-on') : null, titleFieldAfter: !!document.getElementById('note-edit-title-textarea') };
});
check('3 полето за заглавие е имало', step3.hadTitle === true, step3);
check('4 след Запис бележката е отключена и заглавието е в записа', step3.stored.split('|')[0] === 'Добавено заглавие', step3);

const step4 = await page.evaluate(async () => {
    activeNoteWindow.box.querySelector('#note-lock-btn')?.click();
    await new Promise(r => setTimeout(r, 1800));
    const n = allNotesData.find(x => String(x.id) === '900001');
    return { pass: n ? n.pass : null, stored: String(n ? n.notetxt : '').slice(0, 60),
        title: String(n ? n.notetxt : '').split('|')[0] };
});
check('5 при заключване заглавието остава открито пред |', step4.title === 'Добавено заглавие', step4);

const step5 = await page.evaluate(async () => {
    const win = activeNoteWindow;
    const closeBtn = win.box.querySelector('.nw-close-btn, .modal-close-btn, .close-btn, [data-nw-close]');
    if (closeBtn) closeBtn.click(); else if (typeof closeNoteWindow === 'function') closeNoteWindow(win);
    await new Promise(r => setTimeout(r, 800));
    const n = allNotesData.find(x => String(x.id) === '900001');
    showModal({ raw: n.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'board-1',
        id: n.id, gdid: n.gdid, datemod: n.datemod, originalNote: n });
    await new Promise(r => setTimeout(r, 700));
    return { shown: document.getElementById('modal-body').textContent.slice(0, 120) };
});
check('6 след отваряне заглавието се вижда', step5.shown.indexOf('Добавено заглавие') !== -1, step5);

// Б. същото с тялото: промяната в текста също не бива да се губи при заключване наново.
const step6 = await page.evaluate(async () => {
    const win = activeNoteWindow;
    const closeBtn = win.box.querySelector('.nw-close-btn, .modal-close-btn, .close-btn, [data-nw-close]');
    if (closeBtn) closeBtn.click(); else if (typeof closeNoteWindow === 'function') closeNoteWindow(win);
    await new Promise(r => setTimeout(r, 800));
    const note = {
        id: 900002, gdid: 'gd-900002', boardid: 'board-1', notetxt: '', pass: true,
        text_span: '', title_span: '', color: 0, datemod: Date.now(), numord: 2, date: Date.now(), version: 1
    };
    note.notetxt = await nmEncEncryptNoteText('Старо тяло', '');
    allNotesData.push(note);
    showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'board-1',
        id: note.id, gdid: note.gdid, datemod: note.datemod, originalNote: note });
    await new Promise(r => setTimeout(r, 700));
    activeNoteWindow.box.querySelector('#note-lock-btn')?.click();
    await new Promise(r => setTimeout(r, 900));
    activeNoteWindow.box.querySelector('#note-edit-btn')?.click();
    await new Promise(r => setTimeout(r, 600));
    const bodyEl = document.getElementById('note-edit-textarea');
    if (bodyEl) { bodyEl.value = 'Ново тяло'; bodyEl.dispatchEvent(new Event('input', { bubbles: true })); }
    activeNoteWindow.box.querySelector('#note-save-btn')?.click();
    await new Promise(r => setTimeout(r, 2500));
    activeNoteWindow.box.querySelector('#note-lock-btn')?.click();
    await new Promise(r => setTimeout(r, 1800));
    const n = allNotesData.find(x => String(x.id) === '900002');
    const plain = await nmEncDecryptNoteText(String(n ? n.notetxt : ''));
    return { pass: n ? n.pass : null, plain: String(plain || '') };
});
check('8 при заключване наново промяната в тялото остава',
    step6.plain.indexOf('Ново тяло') !== -1 && step6.plain.indexOf('Старо тяло') === -1, step6);
check('9 бележката е заключена (pass=true)', step6.pass === true, step6);
check('10 без грешки в конзолата', errors.length === 0, errors.slice(0, 3));

await browser.close();
console.log(`\n${pass}/${pass + fail} проверки`);
process.exit(fail === 0 ? 0 : 1);
