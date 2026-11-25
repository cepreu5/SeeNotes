// b5.69: иконата на асистента се мести САМО веднъж и само когато закрива нещо, а разпънатата бележка минава
// над нея.
// Собственик (25.11.2026): „отварям бележка, която стои в центъра на екрана и нейните бутони не се застъпват
// от асистента, но той се мести с две стъпки - веднъж заради лентата и може би веднъж заради бутоните на
// бележката и отива много над лентата“ и „като разпъна бележката на цял екран тя не стои над иконата на
// асистента и той се вижда“.
// Причината за двете стъпки: иконата имаше transition: all .3s, значи докато пътуваше над лентата, меренето
// я хващаше още върху плочките ѝ и даваше отстъп, който след прехода се махаше. От b5.69 местенето не се
// анимира и разпънатата бележка е с по-висок z-index от иконата.
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
await page.evaluate(async () => {
    document.getElementById('login-page')?.setAttribute('hidden', '');
    await new Promise(r => setTimeout(r, 400));
    window.boardData = [{ gdid: 'board-1', boardTxt: 'Тест', numord: 1 }];
    try { boardsData.length = 0; boardsData.push({ gdid: 'board-1', boardTxt: 'Тест', numord: 1 }); } catch (e) { window.boardsData = window.boardData; }
    currentBoardFilter = 'board-1';
});

// Записваме всяка различна височина на иконата - по нея се вижда дали мърда на две стъпки.
await page.evaluate(() => {
    window.__fabSteps = [];
    const fab = document.getElementById('kb-fab');
    const tick = () => {
        const r = fab.getBoundingClientRect();
        const v = Math.round(r.top * 10) / 10;
        const last = window.__fabSteps[window.__fabSteps.length - 1];
        if (!last || last.top !== v) {
            window.__fabSteps.push({
                top: v,
                liftClass: document.body.classList.contains('modal-note-expanded-fab-lift'),
                translate: getComputedStyle(fab).translate,
                bar: !!document.getElementById('open-notes-bar')?.classList.contains('is-visible')
            });
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
});

const geo = () => page.evaluate(() => {
    const fab = document.getElementById('kb-fab');
    const fr = fab.getBoundingClientRect();
    const bar = document.getElementById('open-notes-bar');
    const br = bar && bar.classList.contains('is-visible') ? bar.getBoundingClientRect() : null;
    const layer = document.getElementById('note-windows-layer');
    const wins = [...document.querySelectorAll('.note-window.visible')].filter(w => w.getBoundingClientRect().height > 0);
    const win = wins.find(w => w.classList.contains('note-window-active')) || wins[wins.length - 1] || null;
    const box = win ? win.querySelector('.modal-content-box')?.getBoundingClientRect() : null;
    const footer = win ? win.querySelector('.modal-footer-toolbar')?.getBoundingClientRect() : null;
    const rects = [];
    const add = r => { if (r && r.width > 0 && r.height > 0) rects.push(r); };
    if (win) { add(footer); win.querySelectorAll('button').forEach(b => add(b.getBoundingClientRect())); }
    if (br) bar.querySelectorAll('button, .open-notes-bar-tile').forEach(el => add(el.getBoundingClientRect()));
    const hits = rects.filter(b => fr.left < b.right && fr.right > b.left && fr.top < b.bottom && fr.bottom > b.top).length;
    return {
        fab: { top: Math.round(fr.top * 10) / 10, bottom: Math.round(fr.bottom * 10) / 10, left: Math.round(fr.left), right: Math.round(fr.right) },
        translate: getComputedStyle(fab).translate,
        liftClass: document.body.classList.contains('modal-note-expanded-fab-lift'),
        fabZ: Number(getComputedStyle(fab).zIndex) || 0,
        layerZ: layer ? Number(getComputedStyle(layer).zIndex) || 0 : null,
        barTop: br ? Math.round(br.top * 10) / 10 : null,
        barH: br ? Math.round(br.height) : 0,
        noteBox: box ? { top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(box.left), right: Math.round(box.right) } : null,
        hits,
        expanded: document.body.classList.contains('modal-note-expanded'),
        buttons: rects.length
    };
});

// 1. Отваряме бележка и я оставяме отворена (без запис), за да се появи лентата.
await page.evaluate(async () => {
    window.allNotesData = window.allNotesData || [];
    window.__fabSteps = [];
    await createNewNote();
    await new Promise(r => setTimeout(r, 400));
    const body = document.querySelector('.note-window.visible .nw-modal-body');
    if (body) body.innerHTML = Array.from({ length: 8 }, (_, i) => `<div>Ред ${i + 1} от тестовата бележка.</div>`).join('');
    await new Promise(r => setTimeout(r, 1400));
});
const a = await geo();
check('1. бележката е отворена и има бутони', !!a.noteBox && a.buttons > 0, a);
check('1. лентата е на екрана', a.barTop !== null && a.barH > 0, a);

// 2. Иконата се мести само веднъж - няма връщане надолу след вдигане (двете стъпки от доклада).
const steps = await page.evaluate(() => window.__fabSteps);
const tops = steps.filter(s => s.bar).map(s => s.top);
let bounce = null;
for (let i = 1; i < tops.length; i++) if (tops[i] > tops[i - 1] + 1) { bounce = { from: tops[i - 1], to: tops[i], index: i }; break; }
check('2. иконата се вдига с едно движение, без връщане надолу', bounce === null, { tops, bounce });
check('2. има точно две положения (преди и след лентата)', tops.length <= 2, { tops, steps });

// 3. Накрая: иконата е точно над лентата, без излишен отстъп.
check('3. иконата не закрива нито един бутон', a.hits === 0, a);
check('3. отстъпът при застъпване е 0 (нищо не се закрива)', a.liftClass === false && (a.translate === 'none' || /^0(px)?\s+0(px)?$/.test(a.translate)), a);
check('3. иконата е точно над лентата (6..30px)', a.barTop - a.fab.bottom >= 6 && a.barTop - a.fab.bottom <= 30, a);

// 4. Слагаме бутон точно под иконата: тогава се вдига - и точно над него.
const probeTop = await page.evaluate(async () => {
    const win = [...document.querySelectorAll('.note-window.visible')].find(w => w.getBoundingClientRect().height > 0);
    const fabNow = document.getElementById('kb-fab').getBoundingClientRect();
    const probe = document.createElement('button');
    probe.id = 'nm-test-probe-btn';
    probe.style.cssText = `position:fixed;left:${Math.round(fabNow.left)}px;top:${Math.round(fabNow.top)}px;width:60px;height:50px;z-index:9990`;
    win.appendChild(probe);
    const top = Math.round(probe.getBoundingClientRect().top);
    syncExpandedFabLift();
    await new Promise(r => setTimeout(r, 500));
    return top;
});
const b = await geo();
check('4. иконата се вдига над закривания бутон', b.fab.bottom <= probeTop + 1, { probeTop, b });
check('4. след вдигането не закрива бутона', b.hits === 0, b);
const c = await page.evaluate(async () => {
    document.getElementById('nm-test-probe-btn')?.remove();
    syncExpandedFabLift();
    await new Promise(r => setTimeout(r, 500));
});
const c1 = await geo();
check('4. без застъпване отстъпът се маха', c1.liftClass === false && (c1.translate === 'none' || /^0(px)?\s+0(px)?$/.test(c1.translate)), c1);
check('4. и се връща точно над лентата', c1.barTop - c1.fab.bottom >= 6 && c1.barTop - c1.fab.bottom <= 30, c1);

// 5. Разпъване на цял екран: бележката минава над иконата.
await page.evaluate(async () => { document.getElementById('modal-expand-btn')?.click(); await new Promise(r => setTimeout(r, 900)); });
const d = await geo();
check('5. бележката е разпъната', d.expanded === true, d);
check('5. иконата е под слоя на прозорците (z-index)', d.fabZ < d.layerZ, d);
check('5. разпънатата бележка покрива иконата', !!d.noteBox && d.noteBox.top <= d.fab.top && d.noteBox.bottom >= d.fab.bottom && d.noteBox.left <= d.fab.left && d.noteBox.right >= d.fab.right, d);
check('5. докато е разпъната, иконата не се мести излишно', d.liftClass === false, d);

// 6. Свиване: иконата пак е над бележката и над лентата.
await page.evaluate(async () => { document.getElementById('modal-expand-btn')?.click(); await new Promise(r => setTimeout(r, 900)); });
const e = await geo();
check('6. след свиване иконата е пак над слоя', e.fabZ > e.layerZ, e);
check('6. и не закрива бутон', e.hits === 0, e);
check('6. и е над лентата', e.barTop === null || (e.barTop - e.fab.bottom >= 6 && e.barTop - e.fab.bottom <= 30), e);

// 7. Няма грешки в конзолата.
check('7. няма грешки в конзолата', errors.length === 0, errors);

await browser.close();
console.log('\n' + (fail === 0 ? 'ALL OK' : 'FAILED') + ` (${pass} ok, ${fail} fail)`);
process.exit(fail === 0 ? 0 : 1);
