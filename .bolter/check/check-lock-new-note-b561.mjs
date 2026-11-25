// b5.61: катинарчето помни за коя бележка е натиснато — нова бележка не се ражда заключена.
// Възпроизвеждането (tmp-lock-sticks2.mjs на b5.59): заключване на нова бележка → затваряне с X →
// нова бележка → Запис даваше шифротекст, защото белегът nmEncPending оставаше по прозореца.
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
    window.__nmPromptCount = 0;
    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('folderIdInput');
        const ok = document.getElementById('submitFolderIdBtn');
        setInterval(() => {
            const popup = document.getElementById('folderIdPromptPopup');
            if (!popup || !popup.classList.contains('show')) return;
            if (input && ok && !input.value) { window.__nmPromptCount++; input.value = window.__nmTestPassword; ok.click(); }
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

const probe = `(() => {
    const win = (typeof activeNoteWindow !== 'undefined' && activeNoteWindow) ? activeNoteWindow : null;
    const body = win ? win.body : document.getElementById('modal-body');
    const btn = win ? win.box.querySelector('#note-lock-btn') : document.getElementById('note-lock-btn');
    const ds = body ? body.dataset : {};
    return { id: ds.id || '', numord: ds.numord || '', newNote: ds.isNewNote || '',
        pending: ds.nmEncPending || '', pendingKey: ds.nmEncPendingKey || '',
        btnOn: btn ? btn.classList.contains('nw-lock-on') : null,
        target: (typeof nmEncModalLockTarget === 'function') ? nmEncModalLockTarget() : 'n/a' };
})()`;

// A. нова бележка → катинарче → Запис: заключена
const stepA = await page.evaluate(async () => {
    window.allNotesData = window.allNotesData || [];
    await createNewNote();
    await new Promise(r => setTimeout(r, 700));
    document.getElementById('note-edit-btn')?.click();
    await new Promise(r => setTimeout(r, 500));
    const bodyEl = document.getElementById('note-edit-textarea');
    bodyEl.value = 'Тяло на тайната бележка.';
    bodyEl.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('note-lock-btn')?.click();
    await new Promise(r => setTimeout(r, 400));
    const titleEl = document.getElementById('note-edit-title-textarea');
    if (titleEl) { titleEl.value = 'Тайна'; titleEl.dispatchEvent(new Event('input', { bubbles: true })); }
    const marked = { pending: activeNoteWindow.body.dataset.nmEncPending || '', key: activeNoteWindow.body.dataset.nmEncPendingKey || '' };
    document.getElementById('note-save-btn')?.click();
    await new Promise(r => setTimeout(r, 2500));
    return { marked, notes: (window.allNotesData || []).map(n => ({ id: n.id, pass: n.pass, text: String(n.notetxt).slice(0, 20) })) };
});
const locked = stepA.notes.find(n => n.pass === true);
check('A1 нова бележка с натиснато катинарче се записва заключена', !!locked, stepA.notes);
check('A2 тялото е шифротекст', !!locked && locked.text.indexOf('nmenc:1:') !== -1, locked);
check('A3 белегът носи ключ на своята бележка', !!stepA.marked.key && stepA.marked.key.replace(/\|/g, '') !== '', stepA.marked);

// B. затваряне с X: белегът се маха
const stepB = await page.evaluate(async () => {
    const win = activeNoteWindow;
    const closeBtn = win.box.querySelector('.nw-close-btn, .modal-close-btn, .close-btn, [data-nw-close]');
    const before = { pending: win.body.dataset.nmEncPending || '', key: win.body.dataset.nmEncPendingKey || '' };
    if (closeBtn) closeBtn.click(); else if (typeof closeNoteWindow === 'function') closeNoteWindow(win);
    await new Promise(r => setTimeout(r, 800));
    return { before, after: { pending: win.body.dataset.nmEncPending || '', key: win.body.dataset.nmEncPendingKey || '' },
        open: noteWindows.filter(w => w.open).length, sameBody: win.body.isConnected };
});
check('B1 при затваряне белегът „чака заключване“ се маха', stepB.after.pending === '' && stepB.after.key === '', stepB);

// C. нова бележка след това: не е заключена и не пита за парола
const stepC = await page.evaluate(async (code) => {
    const askedBefore = window.__nmPromptCount;
    await createNewNote();
    await new Promise(r => setTimeout(r, 700));
    const st = eval(code);
    document.getElementById('note-edit-btn')?.click();
    await new Promise(r => setTimeout(r, 500));
    const bodyEl = document.getElementById('note-edit-textarea');
    if (bodyEl) { bodyEl.value = 'Обикновена нова бележка.'; bodyEl.dispatchEvent(new Event('input', { bubbles: true })); }
    const titleEl = document.getElementById('note-edit-title-textarea');
    if (titleEl) { titleEl.value = 'Обикновена'; titleEl.dispatchEvent(new Event('input', { bubbles: true })); }
    document.getElementById('note-save-btn')?.click();
    await new Promise(r => setTimeout(r, 2500));
    const notes = (window.allNotesData || []).map(n => ({ id: n.id, pass: n.pass, text: String(n.notetxt).slice(0, 30) }));
    return { st, notes, askedBefore, askedAfter: window.__nmPromptCount };
}, probe);
check('C1 при отваряне катинарчето не е включено', stepC.st.btnOn === false && stepC.st.target === false, stepC.st);
check('C2 белегът не е останал от предишната бележка', stepC.st.pending === '' || stepC.st.pendingKey !== stepB.before.key, stepC.st);
const plain = stepC.notes.find(n => String(n.text).indexOf('Обикновена') !== -1);
check('C3 новата бележка се записва отключена (открит текст)',
    !!plain && plain.pass !== true && plain.text.indexOf('nmenc:1:') === -1, stepC.notes);
check('C4 не е питано за парола при записа', stepC.askedAfter === stepC.askedBefore, { before: stepC.askedBefore, after: stepC.askedAfter });
check('D няма грешки в конзолата', errors.length === 0, errors);

await browser.close();
console.log(`\n${pass}/${pass + fail} проверки`);
process.exit(fail === 0 ? 0 : 1);
