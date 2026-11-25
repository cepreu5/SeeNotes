// b5.61 rubrica 2: катинарчето на СЪЩАТА бележка не губи намерението си след преглед (eye).
// Път: createNewNote → катинарче („чака заключване“) → преглед/рендер на същата бележка →
// катинарчето остава включено и Запис заключва (pass=true, тяло nmenc:1:).
import { fileURLToPath } from 'url';
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

// A. нова бележка → катинарче („чака заключване“)
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
    const win = activeNoteWindow;
    const ds = win.body.dataset;
    return { pending: ds.nmEncPending || '', key: ds.nmEncPendingKey || '', id: ds.id || '' };
});
check('A1 катинарчето включва „чака заключване“', stepA.pending === 'lock', stepA);
check('A2 белегът носи ключ на своята бележка', stepA.key === 'i:' + stepA.id, stepA);

// B. преглед на същата бележка (eye) — renderNoteWindow за същия id
const stepB = await page.evaluate(async () => {
    const win = activeNoteWindow;
    const ds = win.body.dataset;
    const noteId = ds.id;
    // преглед: бутонът око в прозореца, ако има; иначе renderNoteWindow за същата бележка
    const eye = win.box.querySelector('.nw-preview-btn, #note-preview-btn, [data-nw-preview]');
    if (eye) { eye.click(); await new Promise(r => setTimeout(r, 600)); }
    else if (typeof renderNoteWindow === 'function') {
        const el = (window.allNotesData || []).find(n => String(n.id) === String(noteId)) || null;
        renderNoteWindow({ noteId }, el, win, true);
        await new Promise(r => setTimeout(r, 600));
    }
    const after = win.body.dataset;
    return { pendingAfterPreview: after.nmEncPending || '', keyAfterPreview: after.nmEncPendingKey || '', id: noteId };
});
check('B1 белегът оцелява след преглед на същата бележка', stepB.pendingAfterPreview === 'lock', stepB);

// C. Запис → заключва
const stepC = await page.evaluate(async () => {
    document.getElementById('note-save-btn')?.click();
    await new Promise(r => setTimeout(r, 2500));
    const notes = (window.allNotesData || []).map(n => ({ id: n.id, pass: n.pass, text: String(n.notetxt).slice(0, 30) }));
    return { notes };
});
const lockedC = stepC.notes.find(n => n.pass === true);
check('C1 записът заключва (pass=true)', !!lockedC, stepC.notes);
check('C2 тялото е шифротекст', !!lockedC && lockedC.text.indexOf('nmenc:1:') !== -1, stepC.notes);
check('D няма грешки в конзолата', errors.length === 0, errors);

await browser.close();
console.log(`\n${pass}/${pass + fail} проверки`);
process.exit(fail === 0 ? 0 : 1);
