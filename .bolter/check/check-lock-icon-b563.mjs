// b5.63: катинарчето във footer-а показва състоянието с картинка — отключено или заключено
// катинарче — а не с фон на бутона. Искане на собственика (25.11.2026): „при влизане в режим
// редактиране на заключена бележка катинара трябва да се показва отключен, защото ако запишем
// бележката, тя се отключва“.
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
const LOCKED_PATH = 'M7 11V7a5 5 0 0 1 10 0v4';
const UNLOCKED_PATH = 'M7 11V7a5 5 0 0 1 9.9-1';
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
    const o = { initTokenClient() { return { accessToken: null, requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
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
            if (input && ok && !input.value) { input.value = window.__nmTestPassword; ok.click(); }
        }, 60);
    });
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.saveEditedNote === 'function', null, { timeout: 30000 });
await page.evaluate(() => {
    try { boardsData.length = 0; boardsData.push({ gdid: 'board-1', boardTxt: 'Тест', numord: 1 }); } catch (e) { window.boardsData = window.boardData; }
    currentBoardFilter = 'board-1';
    // Какво показва катинарчето в отворения модал.
    window.__lockBtnState = () => {
        const btn = document.getElementById('note-lock-btn');
        if (!btn) return { err: 'няма бутон' };
        const svg = btn.querySelector('svg');
        const saveBtn = document.getElementById('note-save-btn') || document.getElementById('note-edit-btn');
        return {
            shown: btn.dataset.nmEncLockShown || '',
            path: svg && svg.querySelector('path') ? svg.querySelector('path').getAttribute('d') : '',
            hasRect: !!(svg && svg.querySelector('rect')),
            svgCount: btn.querySelectorAll('svg').length,
            title: btn.title || '',
            bg: getComputedStyle(btn).backgroundColor,
            saveBg: saveBtn ? getComputedStyle(saveBtn).backgroundColor : '',
            editing: !!document.getElementById('note-edit-textarea')
        };
    };
    // Затваря текущия прозорец на бележката (за да не се пренася намерението от катинарчето).
    window.__closeNote = async () => {
        const win = activeNoteWindow;
        const closeBtn = win && win.box ? win.box.querySelector('.nw-close-btn, .modal-close-btn, .close-btn, [data-nw-close]') : null;
        if (closeBtn) closeBtn.click(); else if (win && typeof closeNoteWindow === 'function') closeNoteWindow(win);
        await new Promise(r => setTimeout(r, 700));
    };
    window.__openLocked = async (id, plain) => {
        const note = {
            id, gdid: 'gd-' + id, boardid: 'board-1', notetxt: '', pass: true,
            text_span: '', title_span: '', color: 0, datemod: Date.now(), numord: id % 100, date: Date.now(), version: 1
        };
        note.notetxt = await nmEncEncryptNoteText(plain, '');
        allNotesData.push(note);
        showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'board-1',
            id: note.id, gdid: note.gdid, datemod: note.datemod, originalNote: note });
        await new Promise(r => setTimeout(r, 800));
        return note;
    };
});

// --- А. заключена бележка: преглед → показване → Редакция → преглед
const step1 = await page.evaluate(async () => {
    await window.__openLocked(910001, 'Тайно тяло');
    return { needs: activeNoteWindow.body.dataset.nmEncNeedsPassword || '', btn: window.__lockBtnState() };
});
check('1 заключена бележка в преглед: катинарчето е заключено',
    step1.btn.shown === 'locked' && step1.btn.path === LOCKED_PATH && step1.btn.hasRect, step1.btn);

const step2 = await page.evaluate(async () => {
    document.getElementById('note-lock-btn').click();
    await new Promise(r => setTimeout(r, 1400));
    return { text: document.getElementById('modal-body').textContent.slice(0, 60), btn: window.__lockBtnState(),
        pass: allNotesData.find(x => x.id === 910001).pass };
});
check('2 след показване на тялото катинарчето пак е заключено (записът още е заключен)',
    step2.btn.shown === 'locked' && step2.pass === true && step2.text.indexOf('Тайно тяло') !== -1, step2);

const step3 = await page.evaluate(async () => {
    document.getElementById('note-edit-btn')?.click();
    await new Promise(r => setTimeout(r, 800));
    return { btn: window.__lockBtnState(), titleField: !!document.getElementById('note-edit-title-textarea') };
});
check('3 в режим редакция катинарчето е отключено',
    step3.btn.shown === 'unlocked' && step3.btn.path === UNLOCKED_PATH && step3.btn.editing === true, step3.btn);
check('4 картинката е отключено катинарче, а надписът казва „Заключи“',
    step3.btn.svgCount === 1 && /Заключи/.test(step3.btn.title), step3.btn);

const step4 = await page.evaluate(async () => {
    document.getElementById('note-preview-btn')?.click();
    await new Promise(r => setTimeout(r, 900));
    return { btn: window.__lockBtnState() };
});
check('5 връщане в преглед без Запис: катинарчето пак е заключено',
    step4.btn.shown === 'locked' && step4.btn.editing === false, step4.btn);

// --- Б. натискане в режим редакция заключва бележката (и промяната остава)
const step5 = await page.evaluate(async () => {
    document.getElementById('note-edit-btn')?.click();
    await new Promise(r => setTimeout(r, 800));
    const bodyEl = document.getElementById('note-edit-textarea');
    if (bodyEl) { bodyEl.value = 'Тайно тяло, поправено'; bodyEl.dispatchEvent(new Event('input', { bubbles: true })); }
    const before = window.__lockBtnState().shown;
    document.getElementById('note-lock-btn').click();
    await new Promise(r => setTimeout(r, 2800));
    const n = allNotesData.find(x => x.id === 910001);
    const plain = await nmEncDecryptNoteText(String(n ? n.notetxt : ''));
    return { before, pass: n ? n.pass : null, stored: String(n ? n.notetxt : '').slice(0, 60),
        plain: String(plain || ''), after: window.__lockBtnState() };
});
check('6 натискане в редакция заключва (pass=true, шифротекст)',
    step5.before === 'unlocked' && step5.pass === true && step5.stored.indexOf('nmenc:1:') !== -1, step5);
check('7 поправката е в записа, а катинарчето след записа е заключено',
    step5.plain.indexOf('поправено') !== -1 && step5.after.shown === 'locked', step5);

// --- В. намерението от катинарчето живее само до записа: в редакция катинарчето пак е отключено
const step6 = await page.evaluate(async () => {
    document.getElementById('note-lock-btn').click(); // показване на тялото
    await new Promise(r => setTimeout(r, 1400));
    document.getElementById('note-edit-btn')?.click();
    await new Promise(r => setTimeout(r, 800));
    return { shownInEdit: window.__lockBtnState().shown, pending: activeNoteWindow.body.dataset.nmEncPending || '',
        body: document.getElementById('modal-body').textContent.indexOf('поправено') !== -1 };
});
check('8 след заключване през катинарчето намерението не остава: в редакция катинарчето е отключено',
    step6.shownInEdit === 'unlocked' && step6.pending === '', step6);

// --- Г. чисто заключена бележка: Запис без катинарче я отключва (затова в редакция то е отключено)
const step7 = await page.evaluate(async () => {
    await window.__closeNote();
    await window.__openLocked(910003, 'Друго тяло');
    document.getElementById('note-lock-btn').click(); // показване на тялото
    await new Promise(r => setTimeout(r, 1400));
    const inPreview = window.__lockBtnState().shown;
    document.getElementById('note-edit-btn')?.click();
    await new Promise(r => setTimeout(r, 800));
    const inEdit = window.__lockBtnState().shown;
    document.getElementById('note-save-btn')?.click();
    await new Promise(r => setTimeout(r, 2800));
    const n = allNotesData.find(x => x.id === 910003);
    return { inPreview, inEdit, pass: n ? n.pass : null, after: window.__lockBtnState() };
});
check('9 в редакция на заключена бележка катинарчето е отключено, а Запис я оставя отключена',
    step7.inPreview === 'locked' && step7.inEdit === 'unlocked' && step7.pass === false, step7);
check('10 след Запис катинарчето в преглед е отключено',
    step7.after.shown === 'unlocked' && step7.after.path === UNLOCKED_PATH, step7.after);
check('11 фонът на катинарчето не се сменя', step7.after.bg === step7.after.saveBg, [step7.after.bg, step7.after.saveBg]);

// --- Д. отключена бележка: пак отключено катинарче, а натискането заключва
const step8 = await page.evaluate(async () => {
    await window.__closeNote();
    const note = {
        id: 910004, gdid: 'gd-910004', boardid: 'board-1', notetxt: 'Открита бележка|Тяло', pass: false,
        text_span: '', title_span: '', color: 0, datemod: Date.now(), numord: 4, date: Date.now(), version: 1
    };
    allNotesData.push(note);
    showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'board-1',
        id: note.id, gdid: note.gdid, datemod: note.datemod, originalNote: note });
    await new Promise(r => setTimeout(r, 800));
    const inPreview = window.__lockBtnState().shown;
    document.getElementById('note-edit-btn')?.click();
    await new Promise(r => setTimeout(r, 800));
    const inEdit = window.__lockBtnState().shown;
    document.getElementById('note-lock-btn').click();
    await new Promise(r => setTimeout(r, 2800));
    const n = allNotesData.find(x => x.id === 910004);
    return { inPreview, inEdit, pass: n ? n.pass : null, stored: String(n ? n.notetxt : '') };
});
check('12 отключена бележка: катинарчето е отключено и в преглед, и в редакция',
    step8.inPreview === 'unlocked' && step8.inEdit === 'unlocked', step8);
check('13 натискане в редакция заключва отключена бележка',
    step8.pass === true && step8.stored.indexOf('nmenc:1:') !== -1, step8);
check('14 без грешки в конзолата', errors.length === 0, errors.slice(0, 3));

await browser.close();
console.log(`\n${pass}/${pass + fail} проверки`);
process.exit(fail === 0 ? 0 : 1);
