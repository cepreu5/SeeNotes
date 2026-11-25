// b5.54: катинарче във footer-а на модала + форма за заключване (заглавие и текст в отделни полета)
// + нулиране на паролата в Настройки без стара парола.
//
// Проверки:
//   1) на нова бележка във footer-а има катинарче, а в заглавния ред няма;
//   2) натискането му отваря форма с ДВЕ отделни полета, попълнени от бележката;
//   3) след Потвърди новата бележка се записва заключена: pass=true, тялото е шифротекст,
//      заглавието пред '|' остава открито;
//   4) Отказ във формата не заключва нищо;
//   5) отключване през footer-а връща открит текст;
//   6) зададена парола (нулиране в Настройки) значи без питане при заключване;
//   7) нулирането в Настройки пази новата парола само в променлива (b5.55: не в localStorage),
//      старата парола от b5.54 се маха от localStorage при зареждане, след презареждане се пита пак;
//   8) без грешки в конзолата.

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

// Общите заготовки за страницата: без мрежа, без Drive, с автоматично въведена парола в попъпа.
const initScript = (password) => {
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
    window.__nmTestPassword = password;
    window.__nmPromptCount = 0;
    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('folderIdInput');
        const ok = document.getElementById('submitFolderIdBtn');
        setInterval(() => {
            const popup = document.getElementById('folderIdPromptPopup');
            if (!popup || !popup.classList.contains('show')) return;
            if (input && ok && !input.value) {
                window.__nmPromptCount++;
                input.value = window.__nmTestPassword;
                ok.click();
            }
        }, 60);
    });
};

async function newPage(password) {
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
    await page.addInitScript(initScript, password);
    const errors = [];
    page.on('console', m => {
        if (m.type() === 'error' && !/404|Failed to load resource|Refused to execute script|net::ERR/.test(m.text())) errors.push(m.text());
    });
    // Капан на средата: тестът не пуска startApp, значи module-променливата notesContainer остава
    // незададена и applyFilters() в края на записа хвърля. В приложението тя се задава при старт.
    const envNoise = /reading 'getElementsByClassName'|reading 'prepend'/;
    page.on('pageerror', e => { if (!envNoise.test(e.message)) errors.push('pageerror: ' + e.message); });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.saveEditedNote === 'function', null, { timeout: 20000 });
    return { ctx, page, errors };
}

const { ctx, page, errors } = await newPage('test-pass-123');

// 1: нова бележка — катинарче във footer-а
const opened = await page.evaluate(async () => {
    window.allNotesData = window.allNotesData || [];
    window.showModal({ raw: '', isNewNote: true, boardId: 'all' });
    await new Promise(r => setTimeout(r, 400));
    // Новата бележка се отваря в режим преглед; редакторът (и footer-ът с бутоните) идва с молива.
    const editBtn = document.getElementById('note-edit-btn');
    if (editBtn) editBtn.click();
    await new Promise(r => setTimeout(r, 600));
    const titleEl = document.getElementById('note-edit-title-textarea');
    const bodyEl = document.getElementById('note-edit-textarea');
    if (titleEl) titleEl.value = 'Чернова';
    if (bodyEl) {
        bodyEl.value = 'Тяло на черновата.';
        bodyEl.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const headerBtn = document.getElementById('lock-modal-btn');
    return {
        footerLock: !!document.getElementById('note-lock-btn'),
        headerLock: !!headerBtn && getComputedStyle(headerBtn).display !== 'none',
        body: !!bodyEl
    };
});
check('на нова бележка има катинарче във footer-а', opened.footerLock);
check('в заглавния ред на нова бележка катинарче няма', opened.headerLock === false);

// 2: натискане отваря формата с две полета
await page.evaluate(() => document.getElementById('note-lock-btn').click());
await page.waitForSelector('#note-lock-form.show', { timeout: 5000 });
const form = await page.evaluate(() => {
    const box = document.getElementById('note-lock-form');
    return {
        title: document.getElementById('note-lock-form-title').value,
        text: document.getElementById('note-lock-form-text').value,
        fields: box.querySelectorAll('input, textarea').length
    };
});
check('формата има две отделни полета (заглавие и текст)', form.fields === 2, String(form.fields));
check('полетата идват попълнени от бележката', form.text === 'Тяло на черновата.', `${form.title} / ${form.text}`);

// 3: Потвърди → записва се заключена
await page.evaluate(() => {
    document.getElementById('note-lock-form-title').value = 'Секретно заглавие';
    document.getElementById('note-lock-form-text').value = 'Тайно съдържание, което не бива да се чете.';
    document.getElementById('note-lock-form-ok').click();
});
await page.waitForFunction(() => (window.allNotesData || []).some(n => n.pass === true), null, { timeout: 15000 });
const lockedNote = await page.evaluate(() => {
    const n = (window.allNotesData || []).find(x => x.pass === true);
    if (!n) return null;
    return { pass: n.pass, stored: String(n.notetxt || '') };
});
check('новата бележка се записва заключена', !!lockedNote && lockedNote.pass === true);
check('тялото в записа е шифротекст', !!lockedNote && lockedNote.stored.indexOf('nmenc:1:') !== -1, lockedNote ? lockedNote.stored.slice(0, 40) : '');
check('заглавието пред | остава открито', !!lockedNote && lockedNote.stored.split('|')[0] === 'Секретно заглавие', lockedNote ? lockedNote.stored.split('|')[0] : '');
check('тялото не се чете в записа', !!lockedNote && lockedNote.stored.indexOf('Тайно съдържание') === -1);

// 3b: при бележка със заглавие формата показва заглавието и текста поотделно
const prefill = await page.evaluate(async () => {
    const note = {
        id: 902, gdid: 'enc-test-2', boardid: 'all', status: 0, date: Date.now(), datemod: Date.now(),
        notetxt: 'Заглавие за формата|Тяло за формата.', text_span: '', title_span: '',
        color: 0, numord: 2, pass: false, sellist: 0, timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1
    };
    window.allNotesData.push(note);
    window.showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'all', id: note.id, gdid: note.gdid, originalNote: note });
    await new Promise(r => setTimeout(r, 500));
    document.getElementById('note-edit-btn')?.click();
    await new Promise(r => setTimeout(r, 500));
    document.getElementById('note-lock-btn').click();
    await new Promise(r => setTimeout(r, 250));
    const out = {
        title: document.getElementById('note-lock-form-title').value,
        text: document.getElementById('note-lock-form-text').value
    };
    document.getElementById('note-lock-form-cancel').click();
    await new Promise(r => setTimeout(r, 150));
    return out;
});
check('формата разделя заглавието от текста', prefill.title === 'Заглавие за формата' && prefill.text === 'Тяло за формата.', `${prefill.title} / ${prefill.text}`);

// 4: Отказ не заключва
const cancelFlow = await page.evaluate(async () => {
    const before = (window.allNotesData || []).filter(n => n.pass === true).length;
    window.showModal({ raw: '', isNewNote: true, boardId: 'all' });
    await new Promise(r => setTimeout(r, 350));
    const editBtn = document.getElementById('note-edit-btn');
    if (editBtn) editBtn.click();
    await new Promise(r => setTimeout(r, 500));
    document.getElementById('note-lock-btn').click();
    await new Promise(r => setTimeout(r, 150));
    const shown = document.getElementById('note-lock-form').classList.contains('show');
    document.getElementById('note-lock-form-cancel').click();
    await new Promise(r => setTimeout(r, 200));
    return {
        shown,
        closed: !document.getElementById('note-lock-form').classList.contains('show'),
        after: (window.allNotesData || []).filter(n => n.pass === true).length,
        before
    };
});
check('Отказ затваря формата', cancelFlow.shown && cancelFlow.closed);
check('Отказ не заключва нищо', cancelFlow.after === cancelFlow.before, `${cancelFlow.before} → ${cancelFlow.after}`);

// 5: отключване през footer-а
const unlocked = await page.evaluate(async () => {
    const n = (window.allNotesData || []).find(x => x.pass === true);
    if (!n) return { err: 'няма заключена бележка' };
    window.showModal({ raw: n.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'all', id: n.id, gdid: n.gdid, originalNote: n });
    await new Promise(r => setTimeout(r, 600));
    const editBtn = document.getElementById('note-edit-btn');
    if (editBtn) editBtn.click();
    await new Promise(r => setTimeout(r, 500));
    const btn = document.getElementById('note-lock-btn');
    if (!btn) return { err: 'няма катинарче във footer-а' };
    const wasOn = btn.classList.contains('nw-lock-on');
    btn.click();
    await new Promise(r => setTimeout(r, 300));
    const pending = document.getElementById('modal-body').dataset.nmEncPending;
    document.getElementById('note-save-btn').click();
    await new Promise(r => setTimeout(r, 900));
    const after = (window.allNotesData || []).find(x => x.gdid === n.gdid || x.id === n.id);
    return { wasOn, pending, pass: after ? after.pass : null, stored: after ? String(after.notetxt || '') : '' };
});
check('заключена бележка показва катинарчето запълнено', unlocked.wasOn === true, String(unlocked.wasOn));
check('натискането при заключена бележка иска отключване', unlocked.pending === 'unlock', String(unlocked.pending));
check('след запис бележката е отключена и текстът е открит', unlocked.pass === false && unlocked.stored.indexOf('nmenc:1:') === -1, `${unlocked.pass} / ${unlocked.stored.slice(0, 30)}`);

// 5b: катинарчето в заглавния ред (режим преглед, без редактор) показва същата форма
const headerForm = await page.evaluate(async () => {
    const note = {
        id: 903, gdid: 'enc-test-3', boardid: 'all', status: 0, date: Date.now(), datemod: Date.now(),
        notetxt: 'Заглавна бележка|Тяло от преглед.', text_span: '', title_span: '',
        color: 0, numord: 3, pass: false, sellist: 0, timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1
    };
    window.allNotesData.push(note);
    window.showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'all', id: note.id, gdid: note.gdid, originalNote: note });
    await new Promise(r => setTimeout(r, 600));
    document.getElementById('lock-modal-btn').click();
    await new Promise(r => setTimeout(r, 400));
    const f = document.getElementById('note-lock-form');
    const titleInput = document.getElementById('note-lock-form-title');
    const out = { shown: !!(f && f.classList.contains('show')), title: titleInput ? titleInput.value : '' };
    document.getElementById('note-lock-form-cancel')?.click();
    await new Promise(r => setTimeout(r, 250));
    const after = window.allNotesData.find(x => x.gdid === 'enc-test-3');
    return { ...out, pass: after ? after.pass : null };
});
check('катинарчето в заглавния ред показва същата форма', headerForm.shown === true);
check('формата идва със заглавието на бележката', headerForm.title === 'Заглавна бележка', String(headerForm.title));
check('Отказ в нея не заключва', !headerForm.pass, String(headerForm.pass));

check('без грешки в конзолата', errors.length === 0, errors.slice(0, 3).join(' | '));
await ctx.close();

// 6-8 (b5.55): нулиране в Настройки → новата парола живее само в променлива, не в localStorage
const second = await newPage('ignored-pass');
await second.page.evaluate(() => {
    localStorage.setItem('noteLockPassword', 'stara-ot-b554');
});
// Презареждане: старият запис от b5.54 трябва да се изчисти още при зареждане.
await second.page.reload();
await second.page.waitForTimeout(400);
const leftover = await second.page.evaluate(() => localStorage.getItem('noteLockPassword'));
check('старата парола от b5.54 се маха от localStorage при зареждане', leftover === null, String(leftover));
const resetState = await second.page.evaluate(async () => {
    const btn = document.getElementById('lock-pass-reset-btn');
    if (!btn) return { exists: false };
    window.__nmTestPassword = 'nova-parola-1';
    btn.click();
    await new Promise(r => setTimeout(r, 600));
    return { exists: true, stored: localStorage.getItem('noteLockPassword'), memory: window.nmEncStoredPassword() };
});
check('в Настройки има бутон за нулиране на паролата', resetState.exists === true);
check('нулирането пази паролата в променлива', resetState.memory === 'nova-parola-1', String(resetState.memory));
check('нулирането НЕ пише паролата в localStorage', resetState.stored === null, String(resetState.stored));

const noPromptLock = await second.page.evaluate(async () => {
    const promptsBefore = window.__nmPromptCount;
    window.allNotesData = window.allNotesData || [];
    const enc = await window.nmEncEncryptNoteText('Име|Тяло със запомнена парола.');
    const promptsAfter = window.__nmPromptCount;
    return { ok: String(enc || '').indexOf('nmenc:1:') !== -1, asked: promptsAfter > promptsBefore };
});
check('със запомнена парола в променливата шифроването не пита', noPromptLock.ok && !noPromptLock.asked, `asked=${noPromptLock.asked}`);
check('без грешки в конзолата (втора страница)', second.errors.length === 0, second.errors.slice(0, 3).join(' | '));

// 9: след презареждане паролата вече я няма и се пита отново
await second.page.reload();
await second.page.waitForTimeout(400);
const afterReload = await second.page.evaluate(() => ({ memory: window.nmEncStoredPassword(), stored: localStorage.getItem('noteLockPassword') }));
check('след презареждане паролата е забравена', afterReload.memory === '' && afterReload.stored === null, `${afterReload.memory} / ${afterReload.stored}`);
await second.ctx.close();

await browser.close();
const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
