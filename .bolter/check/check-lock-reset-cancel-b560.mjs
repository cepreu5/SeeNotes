// b5.60: Отказ на въпроса за нова парола маха запазената парола (решение на собственика, 25.11.2026).
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
    else { fail++; console.log('FAIL ' + name + (extra ? ' -> ' + JSON.stringify(extra) : '')); }
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
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.showPrompt === 'function' && typeof window.nmEncSetStoredPassword === 'function',
    null, { timeout: 30000 });

const state = () => page.evaluate(() => ({
    stored: (typeof nmEncStoredPassword === 'function') ? nmEncStoredPassword() : '(няма функция)',
    keys: (typeof nmEncKeyCache !== 'undefined') ? nmEncKeyCache.size : -1,
    popup: !!document.querySelector('#folderIdPromptPopup.show'),
    toast: (document.getElementById('toastNotification') || {}).textContent || ''
}));

// отваря попъпа за нулиране и връща дали е отворен
async function openResetPopup() {
    await page.evaluate(() => {
        const b = document.getElementById('lock-pass-reset-btn');
        if (!b) return;
        b.click();
    });
    try {
        await page.waitForFunction(() => !!document.querySelector('#folderIdPromptPopup.show'), null, { timeout: 4000 });
        return true;
    } catch (e) { return false; }
}
const clickCancel = () => page.evaluate(() => { const b = document.getElementById('prompt-no-btn'); if (b) b.click(); });
const clickOk = () => page.evaluate(() => { const b = document.getElementById('submitFolderIdBtn'); if (b) b.click(); });
const typePass = (v) => page.evaluate((val) => { const i = document.getElementById('folderIdInput'); i.value = val; }, v);

// 1. Отказ при вече запазена парола
await page.evaluate(() => { nmEncSetStoredPassword('stara-parola'); nmEncKeyCache.set('salt-x', 'klyuch'); });
const before1 = await state();
check('1a попъпът за нулиране се отваря', await openResetPopup(), before1);
await clickCancel();
await page.waitForTimeout(200);
const after1 = await state();
check('1b при Отказ запазената парола се маха', after1.stored === '', after1);
check('1c при Отказ изведените ключове се махат', after1.keys === 0, after1);
check('1d попъпът се затваря', after1.popup === false, after1);
await page.waitForFunction(() => /не се помни/.test((document.getElementById('toastNotification') || {}).textContent || ''),
    null, { timeout: 4000 }).then(() => check('1e тостът казва, че паролата не се помни', true))
    .catch(() => check('1e тостът казва, че паролата не се помни', false, after1));

// 2. Празно поле и Потвърди — също маха паролата
await page.evaluate(() => { nmEncSetStoredPassword('stara-parola'); });
check('2a попъпът се отваря втори път', await openResetPopup());
await typePass('');
await clickOk();
await page.waitForTimeout(200);
const after2 = await state();
check('2b празно поле + Потвърди маха паролата', after2.stored === '', after2);

// 3. Нова парола през Потвърди — старият път работи
await page.evaluate(() => { nmEncSetStoredPassword('stara-parola'); });
check('3a попъпът се отваря трети път', await openResetPopup());
await typePass('nova-parola-9');
await clickOk();
await page.waitForTimeout(200);
const after3 = await state();
check('3b новата парола се запазва', after3.stored === 'nova-parola-9', after3);
check('3c ключовете се изчистват и при смяна', after3.keys === 0, after3);
await page.waitForFunction(() => /сменена/.test((document.getElementById('toastNotification') || {}).textContent || ''),
    null, { timeout: 4000 }).then(() => check('3d тостът казва, че паролата е сменена', true))
    .catch(() => check('3d тостът казва, че паролата е сменена', false, after3));

check('4 няма грешки в конзолата', errors.length === 0, errors);

await browser.close();
console.log(`\n${pass}/${pass + fail} проверки`);
process.exit(fail === 0 ? 0 : 1);
