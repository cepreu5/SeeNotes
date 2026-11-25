// b5.56: едно катинарче (това във footer-а), заключване направо от отворения модал и тяло на
// заключена бележка, което се показва само след натискане на катинарчето.
//
// Проверки:
//   1) в заглавния ред няма катинарче, има само това във footer-а;
//   2) при нова бележка натискането показва полето за заглавие, а написаното остава в полето за
//      текст; отделна форма не се отваря;
//   3) след Запис бележката е заключена: pass=true, тялото е шифротекст;
//   4) паролата се пита САМО първия път — втората бележка се заключва без питане;
//   5) отваряне на заключена бележка НЕ показва тялото и НЕ пита; тялото излиза при натискане на
//      катинарчето със запомнената парола, без питане;
//   6) без запомнена парола натискането пита и след паролата показва тялото;
//   7) без грешки в конзолата.

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
            const input = document.getElementById('folderIdInput'); // b5.72: полето се пресъздава при всяко отваряне, затова се търси наново
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
    const envNoise = /reading 'getElementsByClassName'|reading 'prepend'/;
    page.on('pageerror', e => { if (!envNoise.test(e.message)) errors.push('pageerror: ' + e.message); });
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => typeof window.saveEditedNote === 'function', null, { timeout: 20000 });
    return { ctx, page, errors };
}

const { ctx, page, errors } = await newPage('test-pass-123');

// 1: нова бележка — само едно катинарче, това във footer-а
const opened = await page.evaluate(async () => {
    window.allNotesData = window.allNotesData || [];
    window.showModal({ raw: '', isNewNote: true, boardId: 'all' });
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('note-edit-btn')?.click();
    await new Promise(r => setTimeout(r, 600));
    return {
        headerLock: !!document.querySelector('[data-mwid="lock-modal-btn"]'),
        footerLock: !!document.getElementById('note-lock-btn'),
        titleField: !!document.getElementById('note-edit-title-textarea'),
        bodyField: !!document.getElementById('note-edit-textarea')
    };
});
check('в заглавния ред катинарче вече няма', opened.headerLock === false);
check('катинарчето във footer-а е налично', opened.footerLock === true);
check('новата бележка няма поле за заглавие преди натискането', opened.titleField === false);
check('новата бележка има поле за текст', opened.bodyField === true);

// 2: текст в полето за текст, после натискане на катинарчето
const afterPress = await page.evaluate(async () => {
    const bodyEl = document.getElementById('note-edit-textarea');
    bodyEl.value = 'Тяло, написано преди заключването.';
    bodyEl.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('note-lock-btn').click();
    const titleEl = document.getElementById('note-edit-title-textarea');
    const bodyAfter = document.getElementById('note-edit-textarea');
    const out = {
        titleShown: !!titleEl,
        titleValue: titleEl ? titleEl.value : null,
        bodyValue: bodyAfter ? bodyAfter.value : null,
        pending: document.getElementById('modal-body').dataset.nmEncPending || '',
        form: !!document.getElementById('note-lock-form')
    };
    await new Promise(r => setTimeout(r, 300));
    return out;
});
check('натискането показва полето за заглавие', afterPress.titleShown === true);
check('полето за заглавие идва празно', afterPress.titleValue === '', String(afterPress.titleValue));
check('написаното отива в полето за текст', afterPress.bodyValue === 'Тяло, написано преди заключването.', String(afterPress.bodyValue));
check('отделна форма за заключване не се отваря', afterPress.form === false);
check('катинарчето отбелязва „ще се заключи“', afterPress.pending === 'lock', afterPress.pending);

// 3: Запис → бележката е заключена
const locked = await page.evaluate(async () => {
    const titleEl = document.getElementById('note-edit-title-textarea');
    if (titleEl) { titleEl.value = 'Секретно заглавие'; titleEl.dispatchEvent(new Event('input', { bubbles: true })); }
    document.getElementById('note-save-btn').click();
    await new Promise(r => setTimeout(r, 2000));
    const n = (window.allNotesData || []).find(x => x.pass === true);
    return n ? { pass: n.pass, stored: String(n.notetxt || ''), asked: window.__nmPromptCount, memory: window.nmEncStoredPassword() } : null;
});
check('бележката се записва заключена', !!locked && locked.pass === true);
check('тялото в записа е шифротекст', !!locked && locked.stored.indexOf('nmenc:1:') !== -1, locked ? locked.stored.slice(0, 30) : '');
check('тялото не се чете в записа', !!locked && locked.stored.indexOf('Тяло, написано') === -1);
check('заглавието пред | остава открито', !!locked && locked.stored.split('|')[0] === 'Секретно заглавие', locked ? locked.stored.split('|')[0] : '');
check('паролата се пита първия път', !!locked && locked.asked === 1, String(locked && locked.asked));
check('паролата остава в променливата', !!locked && locked.memory === 'test-pass-123', String(locked && locked.memory));
check('без грешки в конзолата', errors.length === 0, errors.slice(0, 3).join(' | '));
const storedLocked = locked ? locked.stored : '';
await ctx.close();

// 5: отваряне на заключена бележка със запомнена парола — тялото се показва само след катинарчето
const withPass = await newPage('test-pass-123');

const hiddenState = await withPass.page.evaluate(async (stored) => {
    nmEncSetStoredPassword('test-pass-123');
    window.allNotesData = window.allNotesData || [];
    nmEncPlainCache.clear();
    const note = {
        id: 900, gdid: 'locked-900', boardid: 'all', status: 0, date: Date.now(), datemod: Date.now(),
        notetxt: stored, text_span: '', title_span: '', color: 0, numord: 1, pass: true,
        sellist: 0, timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1
    };
    window.allNotesData = [note];
    const askedBefore = window.__nmPromptCount;
    window.showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'all', id: note.id, gdid: note.gdid, originalNote: note });
    await new Promise(r => setTimeout(r, 1000));
    const bdy = document.getElementById('modal-body');
    const btn = document.getElementById('note-lock-btn');
    return {
        asked: window.__nmPromptCount - askedBefore,
        text: bdy ? bdy.innerText : '',
        lockBtn: !!btn,
        needs: bdy ? bdy.dataset.nmEncNeedsPassword : null
    };
}, storedLocked);
check('при отваряне тялото НЕ се показва', hiddenState.text.indexOf('Тяло, написано') === -1, String(hiddenState.text).slice(0, 60));
check('при отваряне не се пита за парола', hiddenState.asked === 0, String(hiddenState.asked));
check('катинарчето е налично и при бележка само за четене', hiddenState.lockBtn === true);

const revealed = await withPass.page.evaluate(async () => {
    const askedBefore = window.__nmPromptCount;
    document.getElementById('note-lock-btn').click();
    await new Promise(r => setTimeout(r, 1200));
    const bdy = document.getElementById('modal-body');
    return { asked: window.__nmPromptCount - askedBefore, text: bdy ? bdy.innerText : '', needs: bdy ? bdy.dataset.nmEncNeedsPassword : null };
});
check('натискането показва тялото', revealed.text.indexOf('Тяло, написано') !== -1, String(revealed.text).slice(0, 60));
check('със запомнена парола не се пита', revealed.asked === 0, String(revealed.asked));
check('белегът „иска парола“ пада', revealed.needs === undefined, String(revealed.needs));
check('без грешки в конзолата (страница със запомнена парола)', withPass.errors.length === 0, withPass.errors.slice(0, 3).join(' | '));
await withPass.ctx.close();

// 6: без запомнена парола натискането пита
const fresh = await newPage('test-pass-123');
const withoutMemory = await fresh.page.evaluate(async (stored) => {
    window.allNotesData = window.allNotesData || [];
    nmEncPlainCache.clear();
    nmEncSetStoredPassword('');
    const note = {
        id: 901, gdid: 'locked-901', boardid: 'all', status: 0, date: Date.now(), datemod: Date.now(),
        notetxt: stored, text_span: '', title_span: '', color: 0, numord: 1, pass: true,
        sellist: 0, timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1
    };
    window.allNotesData = [note];
    window.showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'all', id: note.id, gdid: note.gdid, originalNote: note });
    await new Promise(r => setTimeout(r, 1000));
    const before = { text: document.getElementById('modal-body').innerText, asked: window.__nmPromptCount };
    document.getElementById('note-lock-btn').click();
    await new Promise(r => setTimeout(r, 1600));
    const after = { text: document.getElementById('modal-body').innerText, asked: window.__nmPromptCount };
    return { before, after };
}, storedLocked);
check('без запомнена парола тялото също е скрито при отваряне', withoutMemory.before.text.indexOf('Тяло, написано') === -1, String(withoutMemory.before.text).slice(0, 50));
check('натискането пита за парола', withoutMemory.after.asked > withoutMemory.before.asked, `${withoutMemory.before.asked} → ${withoutMemory.after.asked}`);
check('след паролата тялото се показва', withoutMemory.after.text.indexOf('Тяло, написано') !== -1, String(withoutMemory.after.text).slice(0, 60));
check('без грешки в конзолата (втора страница)', fresh.errors.length === 0, fresh.errors.slice(0, 3).join(' | '));
await fresh.ctx.close();

await browser.close();
const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
