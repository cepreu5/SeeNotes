// uni b3.84: заключени бележки в uni — преносът на b5.53…b5.70 от nomn (ключалка, парола,
// катинарче във footer-а, ред „Парола за бележките“ в Настройки, „Постави“ в клетка на таблица,
// иконата на асистента само когато няма отворена бележка).
//
// Проверява се:
//  1) статично: nmEnc* функциите и катинарчето са в uni/main.js, окото в index.html,
//     правилата в style.css, CACHE_NAME е поне cx-notes-b3.84, ключовете bg/en съвпадат;
//  2) шифроването пази заглавието преди '|' открито, а тялото не се чете в записа; със същата
//     парола тялото се връща точно; втори запис не пита паролата наново;
//  3) катинарчето във footer-а заключва бележката: записът носи pass:true и nmenc:1:, тялото го
//     няма, картинката става заключено катинарче;
//  4) повторно отваряне не показва тялото, преди да се натисне катинарчето (иска парола/ключ);
//  5) грешна парола се отказва — тялото не излиза, бележката остава затворена;
//  6) вярна парола показва тялото;
//  7) „Нулиране“ в Настройки: полето е маскирано, окото показва написаното, а Отказ маха
//     запомнената парола и изведените ключове (след това пак се пита);
//  8) нова бележка след заключена не се ражда заключена и се записва с открит текст;
//  9) заглавието не стои втори път като първи ред на тялото;
// 10) „Постави“ в клетка на таблица слага текста в клетката на курсора, не в скритото поле;
// 11) иконата на асистента се вижда при празен борд и я няма при отворена бележка;
// 12) без грешки в конзолата.
//
// Приложението се вдига ИСТИНСКИ (не демо): катинарчето във footer-а е изключено в демо режим
// (IS_DEMO_MODE), значи то се проверява само на истинския път. Мрежата е отбита, а хранилищата са
// изключени в localStorage — нищо не излиза навън.
//
// Пускане от корена на хранилището: node .bolter/check/uni-lock-b384.mjs   (exit 1 при провал)
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

let fails = 0, n = 0;
const ok = (cond, msg, extra) => {
    n++;
    console.log((cond ? 'PASS ' : 'FAIL ') + msg + (!cond && extra !== undefined ? ' :: ' + JSON.stringify(extra).slice(0, 400) : ''));
    if (!cond) fails++;
};

// --- 1. Статично -------------------------------------------------------------------------------
const mainJs = await readFile('uni/main.js', 'utf8');
const indexHtml = await readFile('uni/index.html', 'utf8');
const styleCss = await readFile('uni/style.css', 'utf8');
const swJs = await readFile('uni/sw.js', 'utf8');
const bg = JSON.parse(await readFile('uni/lang/i18n-bg.json', 'utf8'));
const en = JSON.parse(await readFile('uni/lang/i18n-en.json', 'utf8'));

const needFns = ['nmEncIsEncrypted', 'nmEncEncryptNoteText', 'nmEncDecryptNoteText', 'nmEncKeyForSalt',
    'nmEncPlainTextOf', 'nmEncStripDupTitleLine', 'nmEncLockedTitleOnly', 'toggleModalNoteLockPending',
    'ensureModalLockButton', 'ensureModalNoteTitleField', 'syncModalNoteLockBtn', 'persistSingleNote',
    'nmEncPendingLockState', 'nmEncModalLockShown', 'nmEncRevealModalNote', 'getActiveModalEditor',
    'unlockIconSvg'];
const missingFns = needFns.filter(f => !new RegExp('(function|const|let)\\s+' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b').test(mainJs));
ok(missingFns.length === 0, 'uni/main.js носи всички функции на ключалката', missingFns);
ok(/const NM_ENC_ITERATIONS = 310000;/.test(mainJs) && /AES-GCM/.test(mainJs) && /PBKDF2/.test(mainJs),
    'криптирането е PBKDF2-SHA256 310k + AES-GCM');
ok(!/function syncExpandedFabLift|syncExpandedFabLift\(\)|expandedFabLiftPx|EXPANDED_FAB_LIFT_CLASS/.test(mainJs),
    'иконата на асистента не се мести (няма syncExpandedFabLift и отстъп)');
ok(/const OPEN_NOTES_BAR_FLOATERS = \['add-note-fab', 'scrollTopBtn'\];/.test(mainJs),
    'лентата на отворените бележки не вдига иконата на асистента (b5.70)');
ok(/localStorage\.removeItem\(NM_ENC_PASSWORD_KEY\)/.test(mainJs) && !/localStorage\.setItem\(NM_ENC_PASSWORD_KEY/.test(mainJs),
    'паролата не се пази в localStorage, старият запис се маха');
ok(/let lastNoteEditField = null;/.test(mainJs) && /if \(lastNoteEditField && lastNoteEditField\.isConnected\) return lastNoteEditField;/.test(mainJs),
    'b5.68: „Постави“ пада към полето с курсора, не към скритото поле');

ok(/id="prompt-eye-btn"/.test(indexHtml) && /class="prompt-input-row"/.test(indexHtml),
    'index.html: око до полето за парола (#prompt-eye-btn в .prompt-input-row)');
const advAt = indexHtml.indexOf('id="advanced-settings-span"');
const lockAt = indexHtml.indexOf('id="lock-pass-wrapper"');
ok(advAt !== -1 && lockAt !== -1 && lockAt > advAt, 'index.html: редът „Парола за бележките“ е в Разширени настройки', { advAt, lockAt });
ok(/id="lock-pass-label"/.test(indexHtml) && /id="lock-pass-reset-btn"/.test(indexHtml) && lockAt !== -1,
    'index.html: етикет и бутон „Нулиране“ за паролата');

ok(/body:has\(\.note-window\.visible\) #kb-fab\s*\{\s*display: none !important;/.test(styleCss),
    'style.css: иконата на асистента се крие, докато има отворена бележка');
ok(/\.nm-enc-locked-hint\s*\{/.test(styleCss), 'style.css: подсказката за заключена бележка');
ok(/#prompt-eye-btn\s*\{/.test(styleCss) && /#lock-pass-label\s*\{/.test(styleCss) && /#lock-pass-reset-btn\s*\{/.test(styleCss),
    'style.css: правилата за окото и за реда с паролата');
// Версията расте с всеки комит; проверката иска поне b3.84 (където дойде ключалката).
ok(/const CACHE_NAME = 'cx-notes-b3\.(8[4-9]|9\d)';/.test(swJs), 'sw.js: CACHE_NAME е поне cx-notes-b3.84', { got: (swJs.match(/const CACHE_NAME = '([^']+)'/) || [])[1] });

const bgKeys = Object.keys(bg), enKeys = Object.keys(en);
const keyDiff = bgKeys.filter(k => !(k in en)).concat(enKeys.filter(k => !(k in bg)));
ok(keyDiff.length === 0 && bgKeys.length === enKeys.length, 'lang: ключовете bg и en съвпадат', { bg: bgKeys.length, en: enKeys.length, keyDiff });
const lockKeys = ['lockPassLabel', 'lockPassResetBtn', 'lockEyeShow', 'lockEyeHide', 'lockPassNew',
    'lockPassChanged', 'lockPassCleared', 'noteWillLock', 'noteLockedOpenFirst', 'lockNoteTooltip',
    'unlockNoteTooltip', 'passSet', 'passAsk', 'passWrong', 'passNeededToSave', 'noteLocked',
    'noteUnlocked', 'exportMdLockedNote'];
const missingKeys = lockKeys.filter(k => !(k in bg) || !(k in en));
ok(missingKeys.length === 0, 'lang: всички текстове на ключалката са налице в bg и en', missingKeys);
ok(bg.lockPassLabel === 'Парола за бележките:' && bg.lockPassResetBtn === 'Нулиране',
    'lang: редът в Настройки е „Парола за бележките:“ + „Нулиране“', { bg: [bg.lockPassLabel, bg.lockPassResetBtn] });

// --- Сървърът: целият клон, за да се отваря /uni/index.html -------------------------------------
const types = {
    '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css',
    '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain'
};
const srv = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const rel = p === '/' ? 'index.html' : p;
    try {
        const b = await readFile(path.join('.', rel));
        res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(b);
    } catch { res.writeHead(404); res.end(); }
});
// Портът е свободен такъв (0 = каквото даде системата), за да не се закача за чуждите сървъри.
await new Promise(r => srv.listen(0, '127.0.0.1', r));
const PORT = srv.address().port;
const APP_URL = `http://127.0.0.1:${PORT}/uni/index.html`;
console.log('сървър на порт ' + PORT);

const browser = await chromium.launch({ executablePath: CHROME, args: ['--num-raster-threads=4'] });

// Заготовки за външни адреси: до Google Drive не се стига.
const stubNetwork = async (ctx) => {
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
        const url = route.request().url();
        const isScript = /\.js(\?|$)/.test(url);
        await route.fulfill({
            status: 200,
            contentType: isScript ? 'application/javascript' : 'image/gif',
            body: isScript ? '' : Buffer.from('R0lGODlhAQABAAAAACw=', 'base64')
        });
    });
};
const errors = [];
const watchErrors = (page, bag) => {
    const noise = /reading 'getElementsByClassName'|reading 'prepend'|gsi\/client|Няма достъпен токен|GDrive update failed|syncSingleNoteToGDrive|getElementsByClassName|gapi\.client\.getToken is not a function|Failed to load resource/;
    page.on('pageerror', e => { if (!noise.test(e.message)) bag.push('pageerror: ' + String(e.message).slice(0, 200)); });
    page.on('console', m => { if (m.type() === 'error' && !noise.test(m.text())) bag.push('console: ' + String(m.text()).slice(0, 200)); });
};

// Паролата се въвежда през истинския попъп на приложението (showPrompt), не се подменя функцията:
// така проверката минава по същия път, по който минава и човекът. __nmAutoPass = '' значи, че
// тестът иска сам да натисне Отказ или ОК.
const initScript = (autoPass) => `(() => {
    const o = { initTokenClient() { return { requestAccessToken() { }, callback: null }; }, hasGrantedAllScopes() { return false; } };
    window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2: o }, oauth2: o };
    window.gapi = window.gapi || { client: { setToken() { }, load() { } } };
    window.kofiWidgetOverlay = { draw() { } };
    window.kofiwidget2 = { init() { }, draw() { } };
    localStorage.setItem('guide', 'false');
    localStorage.setItem('useIndexedDb', 'false');
    localStorage.setItem('useGoogleDb', 'false');
    localStorage.setItem('updateLocalFolder', 'false');
    localStorage.setItem('language', 'bg');
    localStorage.setItem('singleNoteMode', 'false');
    localStorage.removeItem('noteLockPassword');
    window.__nmAutoPass = ${JSON.stringify(autoPass)};
    window.__nmPromptCount = 0;
    window.__nmPromptTypes = [];
    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('folderIdInput');
        const okBtn = document.getElementById('submitFolderIdBtn');
        setInterval(() => {
            const popup = document.getElementById('folderIdPromptPopup');
            if (!popup || !popup.classList.contains('show')) return;
            const input = document.getElementById('folderIdInput'); // b5.72: полето се пресъздава при всяко отваряне, затова се търси наново
            if (!input || !okBtn) return;
            if (!window.__nmAutoPass) return;
            if (input.value) return;
            window.__nmPromptCount++;
            window.__nmPromptTypes.push(input.type);
            input.value = window.__nmAutoPass;
            okBtn.click();
        }, 50);
    });
})();`;

const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await stubNetwork(ctx);
await ctx.addInitScript({ content: initScript('test-pass-123') });
const page = await ctx.newPage();
watchErrors(page, errors);
await page.goto(APP_URL, { waitUntil: 'domcontentloaded' });
const booted = await page.waitForFunction(() => typeof window.nmEncEncryptNoteText === 'function'
    && typeof window.showModal === 'function' && typeof window.nmEncDecryptNoteText === 'function'
    && typeof window.createNewNote === 'function', null, { timeout: 30000 }).then(() => true, () => false);
ok(booted, 'uni се вдигна (nmEnc*, showModal, createNewNote)');
if (!booted) {
    await browser.close(); srv.close();
    console.log(fails ? 'FAILED' : 'OK', `${n - fails}/${n}`);
    process.exit(1);
}

// --- 2. Шифроване и връщане на тялото -----------------------------------------------------------
const round = await page.evaluate(async () => {
    const plain = 'Тайно заглавие|Тялото, което не бива да се вижда.';
    const enc = String(await nmEncEncryptNoteText(plain, '') || '');
    const dec = await nmEncDecryptNoteText(enc);
    return {
        stored: enc,
        title: enc.split('|')[0],
        marker: enc.indexOf('nmenc:1:') !== -1,
        leaks: enc.indexOf('Тялото, което') !== -1,
        dec,
        asked: window.__nmPromptCount
    };
});
ok(round.marker && !round.leaks, 'тялото не се чете в записа (има nmenc:1:, няма открит текст)');
ok(round.title === 'Тайно заглавие', 'заглавието преди | остава открито', round.title);
ok(round.dec === 'Тайно заглавие|Тялото, което не бива да се вижда.', 'със същата парола тялото се връща точно', round.dec);
ok(round.asked >= 1, 'паролата се пита през попъпа при първото заключване', round.asked);

const again = await page.evaluate(async (prev) => {
    const before = window.__nmPromptCount;
    const enc = await nmEncEncryptNoteText('Тайно заглавие|Променено тяло.', prev);
    return { asked: window.__nmPromptCount - before, ok: String(enc || '').indexOf('nmenc:1:') !== -1 };
}, round.stored);
ok(again.ok && again.asked === 0, 'втори запис на същата бележка не иска парола наново', again);

// Заглавието не стои втори път като първи ред на тялото (b5.59).
const dup = await page.evaluate(async () => {
    const enc = await nmEncEncryptNoteText('Заглавие|Заглавие\nТялото.', '');
    const dec = await nmEncDecryptNoteText(enc);
    return { dec, bodyFirst: String(dec || '').split('|')[1] || '' };
});
ok(dup.dec === 'Заглавие|Тялото.', 'заглавието не се дублира като първи ред на тялото (b5.59)', dup);

// Стара заключена бележка (преди b5.53: pass:true, но без плик nmenc:1:) не се пипа — тялото ѝ
// си е открит текст и се показва както досега, без питане за парола.
const legacyCheck = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const legacy = {
        id: 904, gdid: 'uni-old-lock', boardid: 'all', status: 0, date: Date.now(), datemod: Date.now(),
        notetxt: 'Стара|Старото тяло си е открит текст.', text_span: '', title_span: '', color: 0,
        numord: 1, pass: true, sellist: 0, timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1
    };
    allNotesData.push(legacy);
    showModal({ raw: legacy.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'all', id: legacy.id, gdid: legacy.gdid, originalNote: legacy });
    await sleep(800);
    const body = document.getElementById('modal-body');
    const shown = body ? body.textContent : '';
    const needs = body ? body.dataset.nmEncNeedsPassword === 'true' : null;
    try { closeNoteWindow(activeNoteWindow); } catch (e) { }
    await sleep(800);
    const stored = String((allNotesData.find(x => String(x.gdid) === 'uni-old-lock') || {}).notetxt || '');
    return { enc: nmEncIsEncrypted(legacy.notetxt), needs, shown, stored };
});
ok(legacyCheck.enc === false && legacyCheck.needs === false && /Старото тяло си е открит текст/.test(legacyCheck.shown),
    'стара заключена бележка (преди b5.53) се показва както досега — без плик и без питане', legacyCheck);
ok(legacyCheck.stored === 'Стара|Старото тяло си е открит текст.', 'старият запис не се пипа', legacyCheck.stored);

// --- 3. Катинарчето във footer-а заключва -------------------------------------------------------
const lockStep = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const note = {
        id: 901, gdid: 'uni-lock-1', boardid: 'all', status: 0, date: Date.now(), datemod: Date.now(),
        notetxt: 'Секретна|Съдържание, което не бива да се вижда.', text_span: '', title_span: '',
        color: 0, numord: 1, pass: false, sellist: 0, timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1
    };
    allNotesData.push(note);
    showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'all', id: note.id, gdid: note.gdid, originalNote: note });
    await sleep(800);
    document.getElementById('note-edit-btn')?.click();
    await sleep(700);
    const btn = document.getElementById('note-lock-btn');
    const shownInEdit = btn ? btn.dataset.nmEncLockShown : null;
    if (btn) btn.click();
    for (let i = 0; i < 120; i++) {
        const x = allNotesData.find(y => String(y.gdid) === 'uni-lock-1');
        if (x && x.pass === true) break;
        await sleep(100);
    }
    await sleep(400);
    const cur = allNotesData.find(y => String(y.gdid) === 'uni-lock-1');
    const stored = String((cur && cur.notetxt) || '');
    const btnAfter = document.getElementById('note-lock-btn');
    const iconPath = (() => { const p = btnAfter && btnAfter.querySelector('svg path'); return p ? p.getAttribute('d') : ''; })();
    return {
        shownInEdit,
        pass: cur && cur.pass,
        marker: stored.indexOf('nmenc:1:') !== -1,
        leaks: stored.indexOf('Съдържание, което') !== -1,
        title: stored.split('|')[0],
        shownAfter: btnAfter ? btnAfter.dataset.nmEncLockShown : null,
        iconPath,
        pending: (() => { const b = document.getElementById('modal-body'); return b ? (b.dataset.nmEncPending || '') : '?'; })()
    };
});
ok(lockStep.pass === true, 'катинарчето във footer-а заключва бележката (pass=true)');
ok(lockStep.marker && !lockStep.leaks, 'записът е шифротекст, тялото го няма в него');
ok(lockStep.title === 'Секретна', 'заглавието остава открито и след заключването', lockStep.title);
ok(lockStep.shownInEdit === 'unlocked', 'в режим редакция катинарчето показва „отключено“ (Запис ще заключи)', lockStep.shownInEdit);
ok(lockStep.shownAfter === 'locked' && lockStep.iconPath === 'M7 11V7a5 5 0 0 1 10 0v4',
    'след записа картинката е заключено катинарче (b5.63/b5.64)', { shownAfter: lockStep.shownAfter, iconPath: lockStep.iconPath });
ok(lockStep.pending === '', 'намерението „чака заключване“ се маха след записа (b5.63)', lockStep.pending);

// --- 4. Повторно отваряне: тялото е скрито, докато не се натисне катинарчето ---------------------
const reopen = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const note = allNotesData.find(y => String(y.gdid) === 'uni-lock-1');
    const askedBefore = window.__nmPromptCount;
    showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'all', id: note.id, gdid: note.gdid, originalNote: note });
    await sleep(900);
    const body = document.getElementById('modal-body');
    const hidden = {
        text: body ? body.textContent : '',
        needsPassword: body ? body.dataset.nmEncNeedsPassword === 'true' : null,
        hint: !!document.querySelector('.nm-enc-locked-hint'),
        asked: window.__nmPromptCount - askedBefore
    };
    document.getElementById('note-lock-btn')?.click();
    let revealed = false;
    for (let i = 0; i < 60; i++) {
        const b = document.getElementById('modal-body');
        if (b && /Съдържание, което не бива/.test(b.textContent || '')) { revealed = true; break; }
        await sleep(100);
    }
    const b2 = document.getElementById('modal-body');
    return { hidden, revealed, needsAfter: b2 ? b2.dataset.nmEncNeedsPassword === 'true' : null, shownNow: b2 ? b2.textContent : '' };
});
ok(!/Съдържание, което не бива/.test(reopen.hidden.text), 'отварянето не показва тялото на заключената бележка', reopen.hidden.text.slice(0, 80));
ok(reopen.hidden.needsPassword === true && reopen.hidden.hint, 'заключената бележка иска катинарчето (белег + подсказка)', reopen.hidden);
ok(reopen.revealed === true, 'катинарчето показва истинското тяло (вярна парола)', reopen.shownNow.slice(0, 60));
ok(reopen.needsAfter === false, 'след показването белегът „иска парола“ отпада');

// --- 5. „Нулиране“ в Настройки: маскирано поле, око, Отказ -------------------------------
const rowStatic = await page.evaluate(() => {
    const wrap = document.getElementById('lock-pass-wrapper');
    const label = document.getElementById('lock-pass-label');
    const btn = document.getElementById('lock-pass-reset-btn');
    return {
        exists: !!wrap && !!label && !!btn,
        labelText: label ? label.textContent.trim() : '',
        btnText: btn ? btn.textContent.trim() : '',
        inAdvanced: wrap ? !!wrap.closest('#advanced-settings-span') : false
    };
});
ok(rowStatic.exists && rowStatic.inAdvanced, 'редът „Парола за бележките“ е в Разширени настройки', rowStatic);
ok(rowStatic.labelText === 'Парола за бележките:' && rowStatic.btnText === 'Нулиране',
    'етикетът и бутонът носят текстовете от езиковия файл', rowStatic);

const resetCancel = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.__nmAutoPass = '';       // тестът натиска сам
    document.getElementById('lock-pass-reset-btn').click();
    for (let i = 0; i < 40; i++) {
        if (document.getElementById('folderIdPromptPopup').classList.contains('show')) break;
        await sleep(50);
    }
    const input = document.getElementById('folderIdInput');
    const eye = document.getElementById('prompt-eye-btn');
    const shown = {
        open: document.getElementById('folderIdPromptPopup').classList.contains('show'),
        type: input.type,
        autocomplete: input.autocomplete,
        eyeVisible: !!eye && !eye.hidden
    };
    // окото показва написаното, без да пуска подсказките на Chrome
    input.value = 'пароличка';
    if (eye) eye.click();
    await sleep(80);
    const afterEye = { type: input.type, pressed: eye ? eye.getAttribute('aria-pressed') : null, title: eye ? eye.title : '' };
    if (eye) eye.click();
    await sleep(80);
    const afterSecond = { type: input.type };
    // Отказ: запомнената парола и изведените ключове се махат
    const beforePw = { pw: nmEncSessionPassword, keys: nmEncKeyCache.size };
    document.getElementById('prompt-no-btn').click();
    await sleep(250);
    return {
        shown, afterEye, afterSecond, beforePw,
        after: {
            pw: nmEncSessionPassword,
            keys: nmEncKeyCache.size,
            popup: document.getElementById('folderIdPromptPopup').classList.contains('show'),
            type: input.type
        }
    };
});
ok(resetCancel.shown.open, '„Нулиране“ отваря попъпа за нова парола');
ok(resetCancel.shown.type === 'password' && resetCancel.shown.autocomplete === 'new-password',
    'полето за парола е маскирано (type=password, new-password)', resetCancel.shown);
ok(resetCancel.shown.eyeVisible, 'окото до полето се вижда в режим парола');
ok(resetCancel.afterEye.type === 'text' && resetCancel.afterEye.pressed === 'true' && resetCancel.afterEye.title === 'Скрий паролата',
    'окото показва написаното и сменя подсказката', resetCancel.afterEye);
ok(resetCancel.afterSecond.type === 'password', 'второто натискане на окото пак маскира', resetCancel.afterSecond);
ok(resetCancel.beforePw.pw === 'test-pass-123' && resetCancel.beforePw.keys > 0,
    'преди Отказ паролата и ключовете са в паметта', resetCancel.beforePw);
ok(resetCancel.after.pw === '' && resetCancel.after.keys === 0,
    'Отказ маха запомнената парола и изведените ключове (b5.60)', resetCancel.after);
ok(resetCancel.after.popup === false && resetCancel.after.type === 'text',
    'след Отказ попъпът се затваря, а полето се връща на текст', resetCancel.after);

// След Отказ паролата се пита отново — показването на същата заключена бележка пак стига до попъпа.
const askAgain = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    window.__nmAutoPass = 'test-pass-123';
    const before = window.__nmPromptCount;
    const note = allNotesData.find(y => String(y.gdid) === 'uni-lock-1');
    showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'all', id: note.id, gdid: note.gdid, originalNote: note });
    await sleep(800);
    document.getElementById('note-lock-btn')?.click();
    let revealed = false;
    for (let i = 0; i < 80; i++) {
        const b = document.getElementById('modal-body');
        if (b && /Съдържание, което не бива/.test(b.textContent || '')) { revealed = true; break; }
        await sleep(100);
    }
    return { asked: window.__nmPromptCount - before, types: window.__nmPromptTypes.slice(-1), revealed };
});
ok(askAgain.asked >= 1 && askAgain.types[0] === 'password',
    'след Отказ паролата се пита наново (през маскирано поле)', askAgain);
ok(askAgain.revealed === true, 'с вярната парола тялото пак излиза');

// --- 6. Нова бележка след заключена не се ражда заключена (b5.61) --------------------------------
const fresh = await page.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // Борд: createNewNote иска истински (не системен) борд, иначе само показва съобщение.
    boardsData.length = 0;
    boardsData.push({ gdid: 'board-1', boardTxt: 'Тест', numord: 1 });
    currentBoardFilter = 'board-1';
    // Затваряме отворената заключена бележка, за да мине новата през същия прозорец.
    try { if (typeof activeNoteWindow !== 'undefined' && activeNoteWindow) closeNoteWindow(activeNoteWindow); } catch (e) { }
    await sleep(900);
    const askedBefore = window.__nmPromptCount;
    await createNewNote();
    await sleep(800);
    const body = document.getElementById('modal-body');
    const atOpen = {
        locked: body ? body.dataset.nmEncLocked : '?',
        needsPassword: body ? body.dataset.nmEncNeedsPassword : '?',
        pending: body ? (body.dataset.nmEncPending || '') : '?',
        hint: !!document.querySelector('.nm-enc-locked-hint'),
        btn: (() => { const b = document.getElementById('note-lock-btn'); return b ? b.dataset.nmEncLockShown : null; })()
    };
    document.getElementById('note-edit-btn')?.click();
    await sleep(600);
    const bodyEl = document.getElementById('note-edit-textarea');
    if (bodyEl) { bodyEl.value = 'Обикновено тяло на новата бележка.'; bodyEl.dispatchEvent(new Event('input', { bubbles: true })); }
    const titleEl = document.getElementById('note-edit-title-textarea');
    if (titleEl) { titleEl.value = 'Обикновена'; titleEl.dispatchEvent(new Event('input', { bubbles: true })); }
    document.getElementById('note-save-btn')?.click();
    await sleep(2500);
    const saved = allNotesData.filter(x => /Обикновено тяло/.test(String(x.notetxt || '')));
    return {
        atOpen,
        asked: window.__nmPromptCount - askedBefore,
        saved: saved.map(x => ({ pass: x.pass, marker: String(x.notetxt).indexOf('nmenc:1:') !== -1, text: String(x.notetxt).slice(0, 40) }))
    };
});
ok(fresh.atOpen.locked !== 'true', 'новата бележка не носи белега „заключена“ от предишната', fresh.atOpen);
ok(fresh.atOpen.needsPassword !== 'true' && fresh.atOpen.hint === false,
    'новата бележка не иска парола и няма подсказка за заключена', fresh.atOpen);
ok(fresh.atOpen.btn === 'unlocked' || fresh.atOpen.btn === null,
    'катинарчето в новата бележка е отключено', fresh.atOpen.btn);
ok(fresh.asked === 0, 'новата бележка не пита за парола', fresh.asked);
const plainSaved = fresh.saved.find(x => x.text.indexOf('Обикновено тяло') !== -1);
ok(!!plainSaved && plainSaved.pass !== true && !plainSaved.marker,
    'новата бележка се записва с открит текст', fresh.saved);

// --- 7. Грешна парола се отказва (отделна страница: ключът за солта тук не е в кеша) --------------
const wrongCtx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
await stubNetwork(wrongCtx);
await wrongCtx.addInitScript({ content: initScript('wrong-password') });
const wrongPage = await wrongCtx.newPage();
const wrongErrors = [];
watchErrors(wrongPage, wrongErrors);
await wrongPage.goto(APP_URL, { waitUntil: 'domcontentloaded' });
await wrongPage.waitForFunction(() => typeof window.nmEncDecryptNoteText === 'function', null, { timeout: 30000 });
const wrong = await wrongPage.evaluate(async (stored) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const plain = await nmEncDecryptNoteText(stored);
    // Същото и през интерфейса: заключената бележка остава затворена.
    const note = {
        id: 902, gdid: 'uni-lock-wrong', boardid: 'all', status: 0, date: Date.now(), datemod: Date.now(),
        notetxt: stored, text_span: '', title_span: '', color: 0, numord: 1, pass: true, sellist: 0,
        timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1
    };
    allNotesData.push(note);
    showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'all', id: note.id, gdid: note.gdid, originalNote: note });
    await sleep(900);
    document.getElementById('note-lock-btn')?.click();
    await sleep(2500);
    const body = document.getElementById('modal-body');
    const toast = document.querySelector('.toast-notification');
    return {
        plain,
        stillHidden: !/Съдържание, което не бива/.test(body ? body.textContent : ''),
        hint: !!document.querySelector('.nm-enc-locked-hint'),
        needs: body ? body.dataset.nmEncNeedsPassword === 'true' : null,
        toast: toast ? toast.textContent.trim() : '',
        passed: note.pass
    };
}, round.stored);
await wrongCtx.close();
ok(wrong.plain === null, 'с грешна парола тялото НЕ се връща', String(wrong.plain));
ok(wrong.stillHidden && wrong.hint, 'заключената бележка остава затворена при грешна парола');
ok(wrong.toast === 'Грешна парола.' || wrong.toast === '', 'грешната парола се съобщава („Грешна парола.“)', wrong.toast);
ok(wrong.passed === true, 'грешната парола не отключва бележката (pass остава true)');

// --- 8. „Постави“ в клетка на таблица слага текста в клетката (b5.68) ----------------------------
const pasteCtx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
await stubNetwork(pasteCtx);
await pasteCtx.addInitScript({ content: initScript('') });
const pastePage = await pasteCtx.newPage();
const pasteErrors = [];
watchErrors(pastePage, pasteErrors);
await pastePage.goto(APP_URL, { waitUntil: 'domcontentloaded' });
await pastePage.waitForFunction(() => typeof window.showModal === 'function' && typeof window.enableNoteEditing === 'function', null, { timeout: 30000 });
const TABLE = '| Бележка | Собственик |\n| --- | --- |\n| mul7236376 | Cepreu |';
const BEFORE = 'Текст над таблицата.';
const AFTER = 'Текст под таблицата.';
await pastePage.evaluate(([table, before, after]) => {
    const raw = before + '\n' + table + '\n' + after;
    showModal({ raw, format: '', titleFormat: '', color: '#fff', boardId: 'board-1', notetxt: raw, id: 'paste-' + raw.length });
}, [TABLE, BEFORE, AFTER]);
await pastePage.waitForTimeout(700);
await pastePage.evaluate(() => { enableNoteEditing(document.getElementById('modal-body')); });
const fieldOpen = await pastePage.waitForFunction(() => {
    const t = document.getElementById('note-edit-textarea');
    const split = t?.parentElement.querySelector(':scope > .note-table-split');
    return !!split?.querySelector('.note-table-field');
}, null, { timeout: 15000 }).then(() => true, () => false);
ok(fieldOpen, 'редакторът отваря поле за таблицата (клетките се редактират)');
if (fieldOpen) {
    const opened = await pastePage.evaluate(() => {
        const field = document.querySelector('.note-table-field');
        const i = field.value.indexOf('Cepreu') + 'Cepreu'.length;
        field.focus();
        field.setSelectionRange(i, i);
        return { active: document.activeElement?.className, caret: field.selectionStart, field: field.value };
    });
    ok(/note-table-field/.test(opened.active || ''), 'курсорът е в клетката на таблицата', opened.active);
    await pastePage.evaluate(() => {
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => 'XYZ', writeText: async () => { } } });
    });
    const pasteBtn = pastePage.locator('#paste-modal-btn');
    ok(await pasteBtn.isVisible(), 'бутонът „Постави“ се вижда в лентата');
    await pasteBtn.click();
    await pastePage.waitForTimeout(300);
    const done = await pastePage.evaluate(() => {
        const main = document.getElementById('note-edit-textarea');
        const split = main.parentElement.querySelector(':scope > .note-table-split');
        return {
            main: main.value,
            caret: main.selectionStart,
            fields: split ? [...split.querySelectorAll('.note-table-field')].map(f => f.value) : []
        };
    });
    const tableLines = (text) => text.split('\n').filter(l => l.startsWith('|')).join('\n');
    ok(/CepreuXYZ/.test(tableLines(done.main)), 'текстът влиза в таблицата, не под нея', tableLines(done.main));
    ok(done.main.split('XYZ').length === 2, 'поставено е само веднъж', done.main);
    ok(done.main.endsWith(AFTER), 'текстът под таблицата е непокътнат', done.main.slice(-45));
    ok(!done.main.includes(AFTER + 'XYZ'), 'нищо не е добавено в края на бележката', done.main.slice(-45));
    ok(done.fields.length === 1 && done.fields[0].includes('CepreuXYZ'), 'полето на таблицата показва същото', done.fields);
}
ok(pasteErrors.length === 0, 'без грешки в конзолата (таблица/поставяне)', pasteErrors.slice(0, 3));
await pasteCtx.close();

// --- 9. Иконата на асистента: вижда се само когато няма отворена бележка (b5.70) ----------------
const fabCtx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await stubNetwork(fabCtx);
await fabCtx.addInitScript({ content: initScript('') });
const fabPage = await fabCtx.newPage();
const fabErrors = [];
watchErrors(fabPage, fabErrors);
await fabPage.goto(APP_URL, { waitUntil: 'domcontentloaded' });
await fabPage.waitForFunction(() => typeof window.showModal === 'function', null, { timeout: 30000 });
const fab = await fabPage.evaluate(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    // Екранът за вход крие иконата със собствно правило; тук се проверява правилото за бележката.
    const login = document.getElementById('login-page');
    if (login) login.hidden = true;
    await sleep(200);
    const el = document.getElementById('kb-fab');
    const display = () => (el ? getComputedStyle(el).display : 'няма икона');
    const empty = display();
    const note = {
        id: 903, gdid: 'uni-lock-fab', boardid: 'all', status: 0, date: Date.now(), datemod: Date.now(),
        notetxt: 'Икона|Тяло.', text_span: '', title_span: '', color: 0, numord: 1, pass: false,
        sellist: 0, timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1
    };
    allNotesData.push(note);
    showModal({ raw: note.notetxt, format: '', titleFormat: '', color: '#fff', boardId: 'all', id: note.id, gdid: note.gdid, originalNote: note });
    await sleep(900);
    const visibleWindows = document.querySelectorAll('.note-window.visible').length;
    const withNote = display();
    try { closeNoteWindow(activeNoteWindow); } catch (e) { }
    await sleep(1200);
    const afterClose = display();
    return { empty, withNote, afterClose, visibleWindows };
});
ok(fab.empty !== 'none', 'при празен борд иконата на асистента се вижда', fab.empty);
ok(fab.withNote === 'none' && fab.visibleWindows > 0, 'при отворена бележка иконата я няма', fab);
ok(fab.afterClose !== 'none', 'след затваряне на бележката иконата се връща', fab.afterClose);
ok(fabErrors.length === 0, 'без грешки в конзолата (икона)', fabErrors.slice(0, 3));
await fabCtx.close();

// --- 10. Грешки в конзолата на основната страница ----------------------------------------------
ok(errors.length === 0, 'без грешки в конзолата', errors.slice(0, 4));

await ctx.close();
await browser.close();
srv.close();
console.log(`\n${fails ? 'FAILED ' + fails + ' / ' : 'OK '}${n - fails}/${n} проверки`);
process.exit(fails ? 1 : 0);
