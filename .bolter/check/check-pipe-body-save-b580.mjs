// b5.80: бележка със заглавие преди '|'. Записът (postEditNoteState) пази text_span спрямо
// ЦЯЛОТО тяло след чертата, а бордът и модалът показват тялото с изрязани интервали след чертата.
// Затова: смъква се САМО този интервал (leadWs), не заглавието; Редактиране не смъква нищо,
// значи Запис без промяна връща същите граници.
// Run: node .bolter/check/check-pipe-body-save-b580.mjs
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
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block' });
await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, async (route) => {
    const isScript = /\.js(\?|$)/.test(route.request().url());
    await route.fulfill({
        status: 200,
        contentType: isScript ? 'application/javascript' : 'image/gif',
        body: isScript ? '' : Buffer.from('R0lGODlhAQABAAAAACw=', 'base64')
    });
});
const page = await ctx.newPage();
const errors = [];
const noise = /reading 'getElementsByClassName'|reading 'prepend'|gsi\/client|Failed to load resource|gapi is not defined/;
page.on('pageerror', e => { if (!noise.test(e.message)) errors.push(e.message); });
page.on('console', m => { if (m.type() === 'error' && !noise.test(m.text())) errors.push('console: ' + m.text().slice(0, 160)); });
await page.addInitScript(() => {
    const o = { initTokenClient() { return { accessToken() { } }; }, hasGrantedAllAccess() { return false; } };
    window.google = { accounts: { id: { initialize() { }, renderButton() { }, prompt() { }, disableAutoSelect() { } }, oauth2: o }, oauth2: o };
    try {
        localStorage.setItem('useGoogleDb', 'false');
        localStorage.setItem('updateLocalFolder', 'false');
        localStorage.setItem('appLang', 'bg');
    } catch (e) { }
});
await page.goto(URL);
await page.waitForFunction(() => typeof startApp === 'function', null, { timeout: 20000 });
await page.evaluate(async () => { try { await startApp(); } catch (e) { } });
await page.waitForFunction(() => typeof notesContainer !== 'undefined' && !!notesContainer, null, { timeout: 20000 });

// --- Част 1: как се показва запис, в който границите са спрямо цялото тяло след чертата ---
const board = await page.evaluate(async () => {
    const b = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
    const host = document.getElementById('notes-container');
    const notes = [
        // „Това | е bold текст": тялото е " е bold текст", bold е на 3..7
        { gdid: 'p-space', id: 920001, txt: 'Това | е bold текст', span: JSON.stringify({ start: 3, end: 7, type: 1 }) },
        // без интервал след чертата
        { gdid: 'p-tight', id: 920002, txt: 'Заглавие|дебел текст и още', span: JSON.stringify({ start: 0, end: 5, type: 1 }) },
        // без '|' — първият ред е заглавие, границите са спрямо целия текст
        { gdid: 'p-plain', id: 920003, txt: 'Първи ред\nдебел текст и още', span: JSON.stringify({ start: 10, end: 15, type: 1 }) }
    ];
    const out = {};
    for (const nt of notes) {
        const obj = {
            alarm_type: -1, boardid: b.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
            eventId: 0, gdid: nt.gdid, id: nt.id, notetxt: nt.txt, numord: nt.id, sellist: 0, status: 0,
            text_span: nt.span, title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244
        };
        allNotesData.push(obj);
        const el = await createNoteElement(obj);
        if (el) { el.dataset.probe = nt.gdid; host.appendChild(el); }
    }
    await new Promise(r => setTimeout(r, 400));
    for (const nt of notes) {
        const card = document.querySelector(`.note[data-probe="${nt.gdid}"]`);
        const content = card ? card.querySelector('.note-content') : null;
        const bolds = content ? [...content.querySelectorAll('b, strong')] : [];
        out[nt.gdid] = {
            missing: !card,
            title: card && card.querySelector('h3') ? card.querySelector('h3').textContent.trim() : null,
            boldCount: bolds.length,
            boldText: bolds.length === 1 ? bolds[0].textContent : bolds.map(x => x.textContent)
        };
    }
    for (const nt of notes) { const c = document.querySelector(`.note[data-probe="${nt.gdid}"]`); if (c) c.remove(); }
    return out;
});

check('борд: „Това | е bold текст" — един болд', board['p-space'].boldCount === 1, board['p-space']);
check('борд: болдът е точно „bold"', board['p-space'].boldText === 'bold', board['p-space'].boldText);
check('борд: заглавието е „Това"', board['p-space'].title === 'Това', board['p-space'].title);
check('борд: без интервал след чертата болдът е „дебел"', board['p-tight'].boldText === 'дебел', board['p-tight']);
check('борд: без „|" болдът пак е „дебел"', board['p-plain'].boldText === 'дебел', board['p-plain']);

// --- Част 2: модал → Редактиране → Запис без промяна ---
const roundtrip = await page.evaluate(async () => {
    const b = (Array.isArray(boardsData) && boardsData[0]) ? boardsData[0] : { gdid: null };
    const obj = {
        alarm_type: -1, boardid: b.gdid, calendarDate: 0, color: 0, date: Date.now(), datemod: Date.now(),
        eventId: 0, gdid: 'rt-space', id: 920101, notetxt: 'Това | е bold текст',
        numord: 920101, sellist: 0, status: 0, text_span: JSON.stringify({ start: 3, end: 7, type: 1 }),
        title_span: '', timer: 0, timer_type: -1, timer_val: 1, type: 0, version: 244
    };
    allNotesData.push(obj);
    const card = await createNoteElement(obj);
    const host = document.getElementById('notes-container');
    if (card) { card.dataset.probe = 'rt-space'; host.appendChild(card); }
    const out = { start: { txt: obj.notetxt, span: obj.text_span } };

    // Истинският път: клик по картата на борда отваря бележката.
    card.click();
    for (let i = 0; i < 40; i++) {
        const mb = document.getElementById('modal-body');
        if (mb && mb.querySelector('.note-content')?.textContent) break;
        await new Promise(r => setTimeout(r, 100));
    }
    await new Promise(r => setTimeout(r, 300));

    let mbe = document.getElementById('modal-body');
    // Модалът рисува съдържанието направо в #modal-body (без .note-content).
    let bolds = mbe ? [...mbe.querySelectorAll('b, strong')] : [];
    out.preview = { boldCount: bolds.length, boldText: bolds.length === 1 ? bolds[0].textContent : bolds.map(x => x.textContent) };

    mbe = document.getElementById('modal-body');
    enableNoteEditing(mbe);
    await new Promise(r => setTimeout(r, 300));
    mbe = document.getElementById('modal-body');
    const ta = document.getElementById('note-edit-textarea');
    const titleTa = document.getElementById('note-edit-title-textarea');
    out.editor = {
        title: titleTa ? titleTa.value : null,
        body: ta ? ta.value : null,
        format: mbe ? (mbe.dataset.format || '') : null,
        formatParsed: mbe ? (JSON.parse('[' + (mbe.dataset.format || '').replace(/\|$/, '').split(/[|\n]/).filter(Boolean).join(',') + ']')) : null
    };

    saveEditedNote();
    await new Promise(r => setTimeout(r, 1800));
    const after = allNotesData.find(n => String(n.gdid) === 'rt-space' || n.id === 920101);
    out.after = after ? { txt: after.notetxt, span: after.text_span } : null;
    const card2 = document.querySelector('.note[data-probe="rt-space"]');
    const c2 = card2 ? card2.querySelector('.note-content') : null;
    const b2 = c2 ? [...c2.querySelectorAll('b, strong')] : [];
    out.afterBoard = { boldCount: b2.length, boldText: b2.length === 1 ? b2[0].textContent : b2.map(x => x.textContent) };
    if (card2) card2.remove();
    return out;
});

const pf = roundtrip.editor.formatParsed && roundtrip.editor.formatParsed[0];
check('модал: болдът е „bold"', roundtrip.preview.boldText === 'bold', roundtrip.preview);
check('редактор: заглавието е „Това"', roundtrip.editor.title !== null && roundtrip.editor.title.trim() === 'Това', roundtrip.editor.title);
check('редактор: тялото е „ е bold текст"', roundtrip.editor.body === ' е bold текст', roundtrip.editor.body);
check('редактор: границите не се местят (3..7)', pf && pf.start === 3 && pf.end === 7, roundtrip.editor.formatParsed);
const af = roundtrip.after && roundtrip.after.span;
const afParsed = af ? JSON.parse('[' + af.replace(/\|$/, '').split(/[|\n]/).filter(Boolean).join(',') + ']')[0] : null;
check('Запис без промяна: границите остават 3..7', afParsed && afParsed.start === 3 && afParsed.end === 7, af);
check('Запис без промяна: текстът остава същият', roundtrip.after && roundtrip.after.txt === roundtrip.start.txt, roundtrip.after);
check('след Запис бордът пак показва болд „bold"', roundtrip.afterBoard.boldText === 'bold', roundtrip.afterBoard);

check('няма конзолни грешки', errors.length === 0, errors.slice(0, 5));

await browser.close();
console.log(`\n${pass}/${pass + fail} проверки минават`);
process.exit(fail ? 1 : 0);
