// b5.67: иконата на асистента (#kb-fab) се мести САМО когато закрива бутон на бележката или на лентата с
// отворените бележки (taskbar-а), и то точно толкова, колкото да го подмине. Иначе не мърда.
// Собственик (25.11.2026): „всяко кликване върху модала мести иконата на асистента, а при скрол застава върху
// бутоните. Местни тази икона само ако тя закрива бутон на модала има taskbar-а.“
// Причината за местенето: отстъпът се мереше, докато иконата има transition: all .3s, значи мереното беше
// междинно и всеки клик добавяше отместване.
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let chromium;
for (const p of ['playwright', '/opt/nvm/versions/node/v22.23.4/lib/node_modules/playwright/index.mjs',
    '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs']) {
    try { ({ chromium } = await import(p)); break; } catch (e) { }
}
if (!chromium) { console.error('playwright не се намира'); process.exit(2); }

const URL = process.env.PAGE || 'http://127.0.0.1:8110/nomn/index.html';
let pass = 0, fail = 0;
const check = (name, ok, extra) => {
    if (ok) { pass++; console.log('ok   ' + name); }
    else { fail++; console.log('FAIL ' + name + (extra !== undefined ? ' -> ' + JSON.stringify(extra) : '')); }
};

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, hasTouch: true });
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
    localStorage.setItem('hideAssistant', 'false');
    localStorage.setItem('clickToEdit', 'false');
});
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.saveEditedNote === 'function', null, { timeout: 30000 });
// Скриваме екрана за вход: докато е отворен, stylesheet-ът крие иконата (body:has(#login-page:not([hidden]))).
await page.evaluate(async () => {
    const lp = document.getElementById('login-page');
    if (lp) lp.setAttribute('hidden', '');
    await new Promise(r => setTimeout(r, 400));
});
await page.evaluate(() => {
    window.boardData = [{ gdid: 'board-1', boardTxt: 'Тест', numord: 1 }];
    try { boardsData.length = 0; boardsData.push({ gdid: 'board-1', boardTxt: 'Тест', numord: 1 }); } catch (e) { window.boardsData = window.boardData; }
    currentBoardFilter = 'board-1';
});

// Геометрията на иконата: основното място (без приложения отстъп) и дали закрива бутон - и в двете положения.
const geo = () => page.evaluate(() => {
    const fab = document.getElementById('kb-fab');
    if (!fab) return { missing: true };
    const fr = fab.getBoundingClientRect();
    const tr = getComputedStyle(fab).translate;
    let dy = 0;
    if (tr && tr !== 'none') {
        const p = tr.split(/\s+/);
        const y = parseFloat(p.length > 1 ? p[1] : p[0]);
        if (Number.isFinite(y)) dy = y;
    }
    const wins = [...document.querySelectorAll('.note-window.visible')].filter(w => w.getBoundingClientRect().height > 0);
    const win = wins.find(w => w.classList.contains('note-window-active')) || wins[wins.length - 1] || null;
    const rects = win ? [...win.querySelectorAll('button')].map(b => b.getBoundingClientRect()).filter(r => r.width > 0 && r.height > 0) : [];
    if (win) {
        const footer = win.querySelector('.modal-footer-toolbar');
        if (footer) {
            const fr2 = footer.getBoundingClientRect();
            if (fr2.width > 0 && fr2.height > 0) rects.push(fr2);
        }
    }
    const bar = document.getElementById('open-notes-bar');
    if (bar && bar.classList.contains('is-visible')) {
        [...bar.querySelectorAll('button, .open-notes-bar-tile')].forEach(el => {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) rects.push(r);
        });
    }
    const hits = r => rects.filter(b => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top).length;
    const base = { left: fr.left, right: fr.right, top: fr.top - dy, bottom: fr.bottom - dy };
    return {
        top: fr.top, left: fr.left, bottom: fr.bottom, right: fr.right,
        w: fr.width, h: fr.height, visible: getComputedStyle(fab).display !== 'none' && fr.width > 0,
        lift: dy, liftClass: document.body.classList.contains('modal-note-expanded-fab-lift'),
        baseHits: hits(base), nowHits: hits(fr), buttons: rects.length,
        barVisible: !!(bar && bar.classList.contains('is-visible'))
    };
});

// A. Отваряме бележка по истинския път (нова бележка → прозорец на бележката).
await page.evaluate(async () => {
    window.allNotesData = window.allNotesData || [];
    await createNewNote();
    await new Promise(r => setTimeout(r, 900));
});
const a = await geo();
check('A. бележката е отворена и иконата е на екрана', !a.missing && a.buttons > 0 && a.visible === true, a);
check('A. иконата не закрива нито един бутон на бележката', a.nowHits === 0, a);

// B. Отстъпът е точно толкова, колкото трябва: има само при застъпване.
if (a.baseHits > 0) {
    check('B. щом основното място закрива бутон, иконата е вдигната', a.lift < 0 && a.liftClass, a);
} else {
    check('B. щом основното място не закрива бутон, иконата не е местена', a.lift === 0 && !a.liftClass, a);
}

// C. Кликовете върху модала НЕ местят иконата (пътят на собственика с изключено „Редактиране с клик“).
const before = await geo();
for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
        const body = document.querySelector('.note-window.visible .nw-modal-body') || document.querySelector('.nw-modal-body');
        if (body) {
            const r = body.getBoundingClientRect();
            body.dispatchEvent(new MouseEvent('click', {
                bubbles: true, cancelable: true, view: window,
                clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + 20)
            }));
        }
    });
    await page.waitForTimeout(420);
}
const after = await geo();
const moved = Math.max(Math.abs(after.top - before.top), Math.abs(after.left - before.left));
check('C. пет клика върху модала не местят иконата', moved <= 1, { before, after, moved });

// D. Свиване: ако иконата вече не закрива бутон, отстъпът се маха.
await page.evaluate(() => { document.getElementById('modal-expand-btn')?.click(); });
await page.waitForTimeout(600);
const d1 = await geo();
check('D. след свиване иконата не закрива бутон', d1.nowHits === 0, d1);
check('D. отстъп няма, ако няма застъпване', d1.baseHits > 0 || (d1.lift === 0 && !d1.liftClass), d1);

// H. Обратният случай: иконата е сложена ТОЧНО върху бутон на бележката - трябва да се вдигне и да го подмине.
const h1 = await page.evaluate(async () => {
    // b5.69: разпънатата бележка минава НАД иконата, значи тогава няма застъпване за подминаване.
    // Затова застъпването се проверява при СВИТА (обикновена) бележка.
    if (document.body.classList.contains('modal-note-expanded')) {
        document.getElementById('modal-expand-btn')?.click();
        await new Promise(r => setTimeout(r, 600));
    }
    const wins = [...document.querySelectorAll('.note-window.visible')].filter(w => w.getBoundingClientRect().height > 0);
    const win = wins.find(w => w.classList.contains('note-window-active')) || wins[wins.length - 1];
    if (!win) return { skipped: true };
    // Проба: бутон на бележката точно върху мястото на иконата - така застъпването е сигурно.
    const fabNow = document.getElementById('kb-fab').getBoundingClientRect();
    const probe = document.createElement('button');
    probe.id = 'nm-test-probe-btn';
    probe.style.cssText = `position:fixed;left:${Math.round(fabNow.left)}px;top:${Math.round(fabNow.top)}px;width:60px;height:50px;z-index:9990`;
    win.appendChild(probe);
    const pr = probe.getBoundingClientRect();
    syncExpandedFabLift();
    await new Promise(res => setTimeout(res, 450));
    return { probeTop: Math.round(pr.top), probeBottom: Math.round(pr.bottom) };
});
if (h1.skipped) {
    check('H. има ред с бутони на бележката', false, h1);
} else {
    const h2 = await geo();
    check('H. сложена върху бутон, иконата се вдига', h2.lift < 0 && h2.liftClass, { h1, h2 });
    check('H. след вдигането не закрива бутон', h2.nowHits === 0, h2);
    check('H. вдигната е точно над бутона', h2.bottom <= (h1.probeTop ?? 0) + 1, { h1, h2 });
    // Връщаме основното място и проверяваме, че отстъпът се маха (иконата не остава вдигната за постоянно).
    const h3 = await page.evaluate(async () => {
        document.getElementById('nm-test-probe-btn')?.remove();
        const fab = document.getElementById('kb-fab');
        ['left', 'top', 'right', 'bottom'].forEach(p => fab.style.removeProperty(p));
        syncExpandedFabLift();
        await new Promise(r => setTimeout(r, 450));
        const tr = getComputedStyle(fab).translate;
        return { translate: tr, liftClass: document.body.classList.contains('modal-note-expanded-fab-lift') };
    });
    check('H. върната на основното място, отстъпът изчезва', h3.liftClass === false && (h3.translate === 'none' || /^0(px)?\s+0(px)?$/.test(h3.translate)), h3);
}

// E. Затваряне на бележката: иконата се връща на основното си място.
await page.evaluate(() => {
    const win = document.querySelector('.note-window.visible.note-window-active') || document.querySelector('.note-window.visible');
    const close = win ? win.querySelector('.nw-close-btn, .modal-close, [data-key-title="closeTitle"]') : null;
    if (close) close.click();
});
await page.waitForTimeout(700);
const e1 = await geo();
check('E. без отворена бележка отстъпът е нула', e1.lift === 0 && !e1.liftClass, e1);

// F. Лентата с отворените бележки: иконата не закрива плочка (когато лентата е на екрана).
const f1 = await geo();
check('F. при видима лента иконата не закрива плочка', f1.nowHits === 0, f1);

check('G. без изключения в конзолата', errors.length === 0, errors.slice(0, 3));

await browser.close();
console.log(fail ? 'FAILED' : `ALL OK (${pass})`);
process.exit(fail ? 1 : 0);
