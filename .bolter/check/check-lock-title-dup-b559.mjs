// b5.59: първият ред на заключена бележка не се повтаря — заглавието стои веднъж като заглавие и
// не се показва втори път като първи ред на тялото.
//
// Проверки:
//   1) карта на заключена бележка със заглавие „Отключи ме“ — заглавието е веднъж, тялото е празно;
//   2) карта, чийто открит откъс е няколко реда („Отключи ме\nРед 2\nРед 3“) — заглавие „Отключи ме“,
//      тяло „Ред 2\nРед 3“ (без повторения ред);
//   3) шифроване и отваряне на запис, в който заглавието е и първи ред на тялото — отключеният текст
//      идва без повторения ред;
//   4) истинският път на собственика: текст „Отключи ме\nРед 2\nРед 3“, катинарче, заглавие
//      „Отключи ме“, Запис — в записа остава веднъж, картата го показва веднъж;
//   5) без грешки в конзолата.

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
    document.addEventListener('DOMContentLoaded', () => {
        const input = document.getElementById('folderIdInput');
        const ok = document.getElementById('submitFolderIdBtn');
        setInterval(() => {
            const popup = document.getElementById('folderIdPromptPopup');
            if (!popup || !popup.classList.contains('show')) return;
            if (input && ok && !input.value) { input.value = 'test-pass-123'; ok.click(); }
        }, 60);
    });
};

async function newPage() {
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
    await page.waitForFunction(() => typeof window.createNoteElement === 'function', null, { timeout: 20000 });
    return { ctx, page, errors };
}

// --- 1 и 2: картата на заключена бележка
const { ctx, page, errors } = await newPage();
const cards = await page.evaluate(async () => {
    nmEncSetStoredPassword('test-pass-123');
    window.allNotesData = window.allNotesData || [];
    const make = async (plain, id) => {
        const stored = await nmEncEncryptNoteText(plain, '');
        const note = {
            id, gdid: 'locked-' + id, boardid: 'all', status: 0, date: Date.now(), datemod: Date.now(),
            notetxt: stored, text_span: '', title_span: '', color: 0, numord: 1, pass: true,
            sellist: 0, timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 1
        };
        const el = await createNoteElement(note);
        el.style.position = 'fixed'; el.style.left = '10px'; el.style.top = '10px'; el.style.zIndex = '9999';
        document.body.appendChild(el);
        await new Promise(r => setTimeout(r, 200));
        const out = {
            prefix: stored.split('|')[0],
            title: el.querySelector('.note-title-truncated')?.textContent || '',
            body: (el.querySelector('.note-content')?.innerText || '').trim(),
            lockOverlay: !!el.querySelector('.lock-icon-overlay')
        };
        el.remove();
        return out;
    };
    return {
        oneLine: await make('Отключи ме|Отключи ме\nРед 2\nРед 3', 801),
        multiLine: await make('Отключи ме\nРед 2\nРед 3|cipher', 802)
    };
});
check('карта: заглавието стои веднъж (едноредов откъс)', cards.oneLine.title === 'Отключи ме' && cards.oneLine.body === '',
    `title=${JSON.stringify(cards.oneLine.title)} body=${JSON.stringify(cards.oneLine.body)}`);
check('карта: катинарчето остава', cards.oneLine.lockOverlay === true);
check('карта: заглавието не се повтаря в тялото',
    cards.multiLine.title === 'Отключи ме' && cards.multiLine.body.replace(/\s+/g, '') === 'Ред2Ред3'
    && cards.multiLine.body.indexOf('Отключи ме') === -1,
    `title=${JSON.stringify(cards.multiLine.title)} body=${JSON.stringify(cards.multiLine.body)}`);
check('без грешки в конзолата (карта)', errors.length === 0, errors.slice(0, 3).join(' | '));

// --- 3: отваряне на запис, в който заглавието е и първи ред на тялото
const roundTrip = await page.evaluate(async () => {
    const stored = await nmEncEncryptNoteText('Отключи ме|Отключи ме\nРед 2\nРед 3', '');
    const plain = await nmEncDecryptNoteText(stored);
    return { stored: stored.split('|')[0], plain };
});
check('отключеният текст идва без повторения ред', roundTrip.plain === 'Отключи ме|Ред 2\nРед 3', JSON.stringify(roundTrip.plain));
check('в записа заглавието остава открито', roundTrip.stored === 'Отключи ме', JSON.stringify(roundTrip.stored));
await ctx.close();

// --- 4: истинският път на собственика
const real = await newPage();
const ownerFlow = await real.page.evaluate(async () => {
    window.allNotesData = window.allNotesData || [];
    window.showModal({ raw: '', isNewNote: true, boardId: 'all' });
    await new Promise(r => setTimeout(r, 400));
    document.getElementById('note-edit-btn')?.click();
    await new Promise(r => setTimeout(r, 600));
    const bodyEl = document.getElementById('note-edit-textarea');
    bodyEl.value = 'Отключи ме\nРед 2\nРед 3';
    bodyEl.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('note-lock-btn').click();
    await new Promise(r => setTimeout(r, 400));
    const titleEl = document.getElementById('note-edit-title-textarea');
    if (titleEl) { titleEl.value = 'Отключи ме'; titleEl.dispatchEvent(new Event('input', { bubbles: true })); }
    document.getElementById('note-save-btn').click();
    await new Promise(r => setTimeout(r, 2500));
    const n = (window.allNotesData || []).find(x => x.pass === true);
    if (!n) return null;
    const plain = await nmEncDecryptNoteText(String(n.notetxt || ''));
    const el = await createNoteElement(n);
    el.style.position = 'fixed'; el.style.left = '10px'; el.style.top = '10px'; el.style.zIndex = '9999';
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 200));
    const card = {
        title: el.querySelector('.note-title-truncated')?.textContent || '',
        body: (el.querySelector('.note-content')?.innerText || '').trim()
    };
    return { stored: String(n.notetxt || '').split('|')[0], plain, card };
});
check('нова заключена бележка: заглавието е веднъж в записа', !!ownerFlow && ownerFlow.stored === 'Отключи ме', ownerFlow ? JSON.stringify(ownerFlow.stored) : 'няма бележка');
check('нова заключена бележка: отключеният текст без повторение', !!ownerFlow && ownerFlow.plain === 'Отключи ме|Ред 2\nРед 3', ownerFlow ? JSON.stringify(ownerFlow.plain) : '');
check('нова заключена бележка: картата показва реда веднъж',
    !!ownerFlow && ownerFlow.card.title === 'Отключи ме' && ownerFlow.card.body.indexOf('Отключи ме') === -1,
    ownerFlow ? JSON.stringify(ownerFlow.card) : '');
check('без грешки в конзолата (истински път)', real.errors.length === 0, real.errors.slice(0, 3).join(' | '));
await real.ctx.close();

await browser.close();
const passed = results.filter(r => r.ok).length;
console.log(`\n${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
