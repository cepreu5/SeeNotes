// Много бележки едновременно + „Единична бележка" (main).
// Проверява порта от cx-notes върху uni/main.js + uni/index-2.html:
//   - две (и повече) бележки се отварят в свои прозорци и всичките се виждат;
//   - само активният прозорец носи истинските id-та (#content-modal, #modal-body), другите ги
//     пазят като data-mwid + .nw-modal-body - смяната на активния ги разменя;
//   - плъзгането мести прозореца и мястото/размерът остават в localStorage за следващото отваряне;
//   - записът на геометрията е един речник с таван 300 записа, най-старият се изхвърля;
//   - „Затвори всички" се показва в дясната група на лентата от три отворени бележки, едно до друго
//     с хиксчето, извън плъзгащия се ред, и затваря всички;
//   - името на борда стои най-ляво в лентата на отворена бележка ВИНАГИ (и при съвпадащ филтър) и се
//     реже с многоточие, когато няма място (b1.11);
//   - стрелките < / > обхождат отворените прозорци от ДВА нагоре и зациклят в краищата (b1.11); при
//     един прозорец ходят по бележките на борда, както досега;
//   - потвърждението при изтриване излиза НАД отворените бележки (b1.11);
//   - „Единична бележка" (чекбоксът в Настройки, по подразбиране изключен) оставя една бележка,
//     слага затъмнение под нея, а натиск върху затъмнението я затваря като хиксчето;
//   - броячът seq в noteWindowGeometry расте само при истинска промяна на записа (b1.46): отваряне,
//     затваряне, пре-рисуване и разпъване/свиване до вече записано състояние не пишат нищо, а истинско
//     местене, преоразмеряване или смяна на режима вдигат брояча точно с 1;
//   - записът за място/размер (noteWindowGeometry) се създава само при истинска промяна след отваряне,
//     дефолтният размер (modalWidth/modalHeight) се пипа само в режим „Единична бележка", а редът
//     „Ресет на позиции/размери" в Настройки трие записите;
//   - смяна на борда НЕ затваря отворените прозорци.
// Пуска се от корена на хранилището (seeNotes-main):
//   node .bolter/check/multinotes.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // Приложението е index-2.html (то зарежда main.js); index.html е само splash.
  const rel = p === '/' ? 'index-2.html' : p;
  try {
    const b = await readFile(path.join(root, rel.endsWith('mainn.js') ? rel.slice(0, -'mainn.js'.length) + 'main.js' : rel));
    res.writeHead(200, { 'Content-Type': types[path.extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(b);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => srv.listen(0, r));
const PORT = srv.address().port;

let fails = 0, n = 0;
const SHOTS = process.env.SHOTS || '';
const ok = (cond, msg, extra) => {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra) : ''));
  if (!cond) fails++;
};

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });

// gapi се замества В СТРАНИЦАТА: приложението пита Drive през gapi, не през fetch.
await ctx.addInitScript(() => {
  window.gapi = {
    load() { },
    client: {
      setToken() { },
      getToken() { return { access_token: 'tok' }; },
      drive: { files: { list: () => Promise.resolve({ result: { files: [] } }), get: () => Promise.resolve({ result: {} }) } },
    },
    auth: { getToken() { return { access_token: 'tok' }; } },
  };
});

// Всичко външно се отговаря на място: проверката не излиза в мрежата.
await ctx.route(/^https?:\/\/(?!localhost)/, async route => {
  const url = route.request().url();
  if (url.startsWith('https://accounts.google.com/gsi/client')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.google={accounts:{id:{initialize(){},renderButton(){},prompt(){},disableAutoSelect(){}},oauth2:{initTokenClient(){return{requestAccessToken(){},callback:null};},hasGrantedAllScopes(){return false;}}}};' });
  }
  if (url.startsWith('https://storage.ko-fi.com/')) {
    return route.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.kofiWidgetOverlay={draw(){},update(){}};' });
  }
  return route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
});

const page = await ctx.newPage();
// Помощникът и указателят (продуктовият тур) се изключват в проверката: турът рисува реч-балонче с
// pointer-events върху екрана и с истинска мишка то поема кликовете, които проверката прави по
// прозорците. Имената на файловете са с двойно „t" (kb-assistantt.js, msmrtt.js) - затова шаблонът
// покрива и двата варианта.
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistantt?|msmrtt?)\\.js$`), r =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));

const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}-${name}.png` }); };

// Минималното състояние, което прозорците и Настройки искат: без логин и без стартово теглене.
const SETUP = `(() => {
  localStorage.setItem('lang', currentLang || 'bg');
  localStorage.removeItem('singleNoteMode');
  notesContainer = document.getElementById('notes-container');
  searchBox = document.getElementById('search-box');
  saveSearchBtn = document.getElementById('save-search-btn') || document.createElement('button');
  if (!boardsData.some(b => b.gdid === 'B1')) {
    boardsData.push({ id: 9001, gdid: 'B1', title: 'Работа' }, { id: 9002, gdid: 'B2', title: 'Лични' });
  }
  initNoteWindows();
  return { windows: noteWindows.length, open: getOpenNoteWindows().length };
})()`;

// Състоянието на прозорците, както го вижда проверката: без пипане на вътрешности.
const READ = `(() => {
  const open = getOpenNoteWindows();
  const w = noteWindows.map(win => ({
    text: (win.body.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40),
    visible: win.el.classList.contains('visible'),
    active: win.el.classList.contains('note-window-active'),
    hasModalId: win.el.id === 'content-modal',
    bodyHasId: win.body.id === 'modal-body',
    bodyMwid: win.body.dataset.mwid || '',
    bodyNwClass: win.body.classList.contains('nw-modal-body'),
    left: win.box.style.left, top: win.box.style.top,
    leftPx: Math.round(win.box.offsetLeft), topPx: Math.round(win.box.offsetTop),
    width: Math.round(win.box.offsetWidth), height: Math.round(win.box.offsetHeight),
    contentWidth: Math.round(parseFloat(getComputedStyle(win.box).width)),
    contentHeight: Math.round(parseFloat(getComputedStyle(win.box).height)),
    z: Number(win.el.style.zIndex) || 0,
    closeAllShown: !!(win.closeAllBtn && !win.closeAllBtn.hidden),
    closeAllTitle: win.closeAllBtn ? win.closeAllBtn.title : null,
    closeAllAria: win.closeAllBtn ? win.closeAllBtn.getAttribute('aria-label') : null,
    closeAllText: win.closeAllBtn ? win.closeAllBtn.textContent.trim() : null,
    closeAllIcon: !!(win.closeAllBtn && win.closeAllBtn.querySelector('svg')),
    closeAllDisplay: win.closeAllBtn ? getComputedStyle(win.closeAllBtn).display : null,
    closeAllParent: win.closeAllBtn && win.closeAllBtn.parentElement ? win.closeAllBtn.parentElement.className : null,
    closeAllRect: win.closeAllBtn ? (() => { const r = win.closeAllBtn.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), cy: Math.round(r.top + r.height / 2) }; })() : null,
    closeRect: (() => { const x = win.box.querySelector('.modal-close'); if (!x) return null; const r = x.getBoundingClientRect(); return { left: Math.round(r.left), right: Math.round(r.right), cy: Math.round(r.top + r.height / 2) }; })(),
    outline: (() => { const cs = getComputedStyle(win.box); return cs.outlineStyle + ' ' + cs.outlineWidth; })(),
  }));
  const overlay = document.getElementById('single-note-overlay');
  const layer = document.getElementById('note-windows-layer');
  const geom = JSON.parse(localStorage.getItem('noteWindowGeometry') || 'null');
  // Номерът на реда живее в самата кутия (o): първият е с най-малък номер, последният - с най-голям.
  const geomKeys = (geom && geom.boxes) ? Object.keys(geom.boxes) : [];
  const geomByO = geomKeys.slice().sort((a, b) => (geom.boxes[a].o || 0) - (geom.boxes[b].o || 0));
  return {
    total: noteWindows.length,
    open: open.length,
    windows: w,
    activeIndex: noteWindows.indexOf(activeNoteWindow),
    // Само един елемент в цялата страница носи всяко от id-тата на модала.
    modalIdCount: document.querySelectorAll('[id="content-modal"]').length,
    bodyIdCount: document.querySelectorAll('[id="modal-body"]').length,
    bodyIdOwner: (() => { const b = document.getElementById('modal-body'); return b ? noteWindows.indexOf(noteWindows.find(win => win.body === b)) : -1; })(),
    globalPointsAtActive: modalBody === (activeNoteWindow && activeNoteWindow.body),
    shade: overlay ? {
      visible: overlay.classList.contains('visible'),
      z: Number(overlay.style.zIndex) || 0,
      beforeTop: overlay.nextElementSibling ? (overlay.nextElementSibling === (getTopNoteWindow() || {}).el) : false,
      inLayer: overlay.parentNode === layer,
    } : null,
    geom: geom ? { v: geom.v, seq: geom.seq, boxes: geomKeys.length, first: geomByO[0], last: geomByO[geomByO.length - 1], intO: geomKeys.every(k => Number.isInteger(geom.boxes[k].o)) } : null,
    geomRaw: geom,
  };
})()`;

const read = () => page.evaluate(READ);
const setup = () => page.evaluate(SETUP);
// Отваря бележка през истинския showModal и чака прозорците да са видими и в мащаб 1.
const openNote = async (opts, expectOpen) => {
  await page.evaluate((opts) => showModal({ raw: 'бележка', format: null, ...opts }), opts);
  if (expectOpen !== undefined) await waitOpen(expectOpen);
  return read();
};
const waitOpen = (count) => page.waitForFunction((count) => {
  const open = getOpenNoteWindows();
  if (open.length !== count) return false;
  return open.every(w => w.el.classList.contains('visible') && w.box.offsetWidth > 0
    && Math.abs(w.box.getBoundingClientRect().width / w.box.offsetWidth - 1) < 0.01);
}, count, { timeout: 8000 }).then(() => true).catch(() => false);
// Мястото на бутон/прозорец в страницата, за истински кликове с мишка.
const rectOf = (sel) => page.evaluate((sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, left: r.left, top: r.top, width: r.width, height: r.height, right: r.right, bottom: r.bottom };
}, sel);

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof showModal === 'function' && typeof getOpenNoteWindows === 'function', null, { timeout: 20000 });

const boot = await setup();
ok(boot.windows === 1 && boot.open === 0, `първият прозорец съществува отначало празен (прозорци ${boot.windows}, отворени ${boot.open})`, boot);

// ======================= 1. Две бележки наведнъж =======================
await openNote({ id: 'N1', gdid: 'GN1', boardId: 'B1', raw: 'първа бележка' }, 1);
const two = await openNote({ id: 'N2', gdid: 'GN2', boardId: 'B1', raw: 'втора бележка' }, 2);
const texts = two.windows.filter(w => w.visible).map(w => w.text);
ok(two.open === 2 && two.total === 2, `две бележки: отворени са два прозореца (отворени ${two.open}, в DOM ${two.total})`, two);
ok(two.windows.every(w => w.visible), 'две бележки: и двата прозореца се виждат', two.windows.map(w => w.visible));
ok(texts.includes('първа бележка') && texts.includes('втора бележка'),
  `две бележки: всеки прозорец показва своята бележка (${JSON.stringify(texts)})`, texts);
ok(two.modalIdCount === 1 && two.bodyIdCount === 1,
  `две бележки: само един елемент носи #content-modal и само един #modal-body (${two.modalIdCount}, ${two.bodyIdCount})`,
  { m: two.modalIdCount, b: two.bodyIdCount });
const idle = two.windows.find(w => !w.bodyHasId);
ok(!!idle && idle.bodyMwid === 'modal-body' && idle.bodyNwClass,
  `две бележки: неактивният пази id-то като data-mwid + .nw-modal-body (${idle && idle.bodyMwid}, ${idle && idle.bodyNwClass})`, idle);
ok(two.bodyIdOwner === two.activeIndex && two.globalPointsAtActive,
  `две бележки: id-тата са на активния (носител ${two.bodyIdOwner}, активен ${two.activeIndex})`, two);
ok(two.windows[two.activeIndex].active && two.windows[1].z > two.windows[0].z,
  `две бележки: последно отвореният е отпред (z ${two.windows[0].z} -> ${two.windows[1].z})`, two.windows.map(w => ({ z: w.z, a: w.active })));
await shot('two-windows');

// ======================= 2. Смяна на активния: id-тата се разменят =======================
const rects = await page.evaluate(() => getOpenNoteWindows()
  .map(w => { const r = w.box.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, text: w.body.textContent.trim().slice(0, 20) }; }));
const firstRect = rects.find(r => r.text === 'първа бележка');
// Клик в тялото на първия прозорец, в ивицата, която вторият (с отстъп 28px) не покрива.
await page.mouse.click(Math.round(firstRect.left + 12), Math.round(firstRect.top + 140));
await page.waitForFunction(() => activeNoteWindow && activeNoteWindow.body.textContent.trim().startsWith('първа бележка'), null, { timeout: 5000 }).catch(() => { });
const switched = await read();
ok(switched.activeIndex === 0 && switched.bodyIdOwner === 0,
  `смяна на активния: кликът направи първия прозорец активен (активен ${switched.activeIndex}, носи #modal-body ${switched.bodyIdOwner})`, switched);
ok(switched.windows[0].hasModalId && switched.windows[0].bodyHasId && !switched.windows[1].bodyHasId
  && switched.windows[1].bodyMwid === 'modal-body',
  'смяна на активния: id-тата са се разменили (старият ги пази като data-mwid)',
  switched.windows.map(w => ({ m: w.hasModalId, b: w.bodyHasId, mwid: w.bodyMwid })));
ok(switched.windows[0].z > switched.windows[1].z, `смяна на активния: натиснатият е отпред (${switched.windows[0].z} > ${switched.windows[1].z})`, switched.windows.map(w => w.z));
ok(switched.modalIdCount === 1 && switched.bodyIdCount === 1 && switched.globalPointsAtActive,
  'смяна на активния: пак само по едно id в страницата и глобалните сочат активния', { m: switched.modalIdCount, b: switched.bodyIdCount });

// ======================= 3. Плъзгане: мястото се помни и оцелява след презареждане =======================
await page.evaluate(() => localStorage.removeItem('noteWindowGeometry'));
const before = await page.evaluate(() => {
  const w = activeNoteWindow;
  const r = w.box.getBoundingClientRect();
  return { key: w.key, left: r.left, top: r.top, width: r.width, height: r.height };
});
// Хваща се лентата горе: точка над кръглите бутони (те започват на 10px) и вдясно от името на борда.
const grab = { x: Math.round(before.left + before.width - 40), y: Math.round(before.top + 4) };
await page.mouse.move(grab.x, grab.y);
await page.mouse.down();
for (const [dx, dy] of [[30, 20], [70, 50], [120, 80]]) {
  await page.mouse.move(grab.x + dx, grab.y + dy);
}
await page.mouse.up();
await page.waitForFunction((exp) => {
  const g = JSON.parse(localStorage.getItem('noteWindowGeometry') || 'null');
  return !!(g && g.boxes[exp.key] && g.boxes[exp.key].x !== undefined);
}, before, { timeout: 5000 }).catch(() => { });
const dragged = await read();
const saved = dragged.geomRaw && dragged.geomRaw.boxes[before.key];
ok(!!saved && Math.abs(saved.x - (before.left + 120)) <= 2 && Math.abs(saved.y - (before.top + 80)) <= 2,
  `плъзгане: прозорецът е преместен на новото място (${Math.round(before.left)}->${saved && saved.x}, ${Math.round(before.top)}->${saved && saved.y})`, { before, saved });
ok(!!saved && saved.w > 0 && saved.h > 0 && Number.isInteger(saved.w) && Number.isInteger(saved.h),
  `плъзгане: записани са и размерите (${saved && saved.w}x${saved && saved.h})`, saved);
ok(dragged.geom.boxes === 1 && dragged.geom.v === 2 && dragged.geom.last === before.key && dragged.geom.intO,
  `плъзгане: записът е един речник с ключ на бележката и номер на реда в кутията (${JSON.stringify(dragged.geom)})`, dragged.geom);
const draggedRect = await page.evaluate(() => { const r = activeNoteWindow.box.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top) }; });
const noJump = await page.evaluate((key) => {
  // Пре-рисуване на същата бележка не бива да мести прозореца.
  showModal({ raw: 'първа бележка', format: null, id: 'N1', gdid: 'GN1', boardId: 'B1' });
  const r = getOpenNoteWindows().find(w => w.key === key).box.getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top) };
}, before.key);
ok(noJump.left === draggedRect.left && noJump.top === draggedRect.top,
  `плъзгане: пре-рисуването не мести прозореца (${draggedRect.left},${draggedRect.top}) -> (${noJump.left},${noJump.top})`, { draggedRect, noJump });

// Презареждане: мястото се чете от localStorage по ключа на бележката.
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof showModal === 'function' && typeof getOpenNoteWindows === 'function', null, { timeout: 20000 });
await setup();
const afterReload = await openNote({ id: 'N1', gdid: 'GN1', boardId: 'B1', raw: 'първа бележка' }, 1);
const reopened = afterReload.windows[afterReload.activeIndex];
ok(Math.abs(reopened.leftPx - saved.x) <= 2 && Math.abs(reopened.topPx - saved.y) <= 2,
  `презареждане: бележката се отваря на запомненото място (${reopened.leftPx},${reopened.topPx} срещу ${saved.x},${saved.y})`, { reopened: [reopened.leftPx, reopened.topPx], saved });
ok(Math.abs(reopened.contentWidth - saved.w) <= 2 && Math.abs(reopened.contentHeight - saved.h) <= 1,
  `презареждане: и със запомнения размер, без да расте (${reopened.contentWidth}x${reopened.contentHeight} срещу ${saved.w}x${saved.h})`,
  { reopened: [reopened.contentWidth, reopened.contentHeight], saved, offset: [reopened.width, reopened.height] });
await shot('moved-after-reload');

// ======================= 4. Таванът: 300 записа, най-старият се изхвърля =======================
// Речникът се зарежда чист v2: номерът на реда е в кутията (o) - 1 за най-стария (g:K0) до 300 за
// най-скоро местения (g:K299), а seq е броячът, който вече е стигнал до 300.
const seeded = await page.evaluate(() => {
  const boxes = {};
  for (let i = 0; i < 300; i++) boxes['g:K' + i] = { x: 10 + i, y: 20 + i, w: 300, h: 200, o: i + 1 };
  const raw = JSON.stringify({ v: 2, seq: 300, boxes });
  localStorage.setItem('noteWindowGeometry', raw);
  return { boxes: Object.keys(boxes).length, raw };
});
ok(seeded.boxes === 300, `таван: проверката зареди 300 записа (${seeded.boxes})`, { boxes: seeded.boxes });
await openNote({ id: 'N301', gdid: 'GN301', boardId: 'B2', raw: 'триста и първа' }, 1);
const capGrab = await page.evaluate(() => {
  const w = getOpenNoteWindows().find(x => x.key === 'g:GN301') || activeNoteWindow;
  const r = w.box.getBoundingClientRect();
  return { x: Math.round(r.left + r.width - 40), y: Math.round(r.top + 4) };
});
await page.mouse.move(capGrab.x, capGrab.y);
await page.mouse.down();
await page.mouse.move(capGrab.x + 25, capGrab.y + 15);
await page.mouse.move(capGrab.x + 60, capGrab.y + 40);
await page.mouse.up();
await page.waitForFunction(() => {
  const g = JSON.parse(localStorage.getItem('noteWindowGeometry') || 'null');
  return !!(g && g.boxes && g.boxes['g:GN301']);
}, null, { timeout: 5000 }).catch(() => { });
const capped = await read();
const capBox = capped.geomRaw && capped.geomRaw.boxes['g:GN301'];
ok(capped.geom.boxes === 300,
  `таван: след 301-вия запис пак са точно 300 кутии (${capped.geom.boxes})`, capped.geom);
ok(!!capped.geomRaw && capped.geomRaw.v === 2 && !('order' in capped.geomRaw),
  `таван: речникът остава v2, само с кутии (v ${capped.geomRaw && capped.geomRaw.v})`,
  { v: capped.geomRaw && capped.geomRaw.v, order: capped.geomRaw && capped.geomRaw.order });
ok(!!capped.geomRaw && !capped.geomRaw.boxes['g:K0'] && capped.geom.first === 'g:K1' && capped.geom.last === 'g:GN301',
  `таван: изхвърлен е записът с най-малък номер (g:K0), новият е с най-голям (${capped.geom.first} ... ${capped.geom.last})`, capped.geom);
ok(!!capBox && Number.isInteger(capBox.x) && Number.isInteger(capBox.y) && capBox.w > 0 && capBox.h > 0,
  `таван: новият запис е с истински числа (${JSON.stringify(capBox)})`, capBox);
// Номерата са цели числа и броячът е стигнал до новия запис - иначе изхвърлените записи връщат стари
// номера обратно в играта и „най-старият" спира да е най-старият. (От b1.46 броячът расте точно с 1 на
// истинска промяна, значи след 300-ия запис е 301.)
const capSeq = capped.geomRaw && capped.geomRaw.seq;
const capOs = capped.geomRaw ? Object.keys(capped.geomRaw.boxes).map(k => capped.geomRaw.boxes[k].o) : [];
ok(Number.isInteger(capSeq) && capSeq >= 301 && capOs.length === 300 && capOs.every(o => Number.isInteger(o) && o <= capSeq) && capBox && capBox.o === capSeq,
  `таван: всеки запис има цял номер на реда, броячът е стигнал до новия (seq ${capSeq}, новият ${capBox && capBox.o}, най-малък ${Math.min(...capOs)})`,
  { seq: capSeq, o: capBox && capBox.o, min: Math.min(...capOs) });

// ======================= 4б. Стар речник (v1 с order) се изхвърля, не се чете =======================
// Нарочно се зарежда речникът от предишната версия: приложението не го разбира и се държи все едно
// няма записи - бележката сяда на подразбиращото се място, а не на онова, което старият речник казва.
await page.evaluate(() => { getOpenNoteWindows().forEach(closeNoteWindow); });
const oldSeed = await page.evaluate(() => {
  const raw = JSON.stringify({
    v: 1, order: ['g:GOLD1', 'g:GOLD2'],
    boxes: { 'g:GOLD1': { x: 120, y: 90, w: 480, h: 340 }, 'g:GOLD2': { x: 640, y: 400, w: 400, h: 300 } }
  });
  localStorage.setItem('noteWindowGeometry', raw);
  return raw;
});
await openNote({ id: 'OLD1', gdid: 'GOLD1', boardId: 'B1', raw: 'стара бележка' }, 1);
const oldSeen = await page.evaluate(() => {
  const r = activeNoteWindow.box.getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top), key: activeNoteWindow.key, raw: localStorage.getItem('noteWindowGeometry') };
});
ok((oldSeen.left !== 120 || oldSeen.top !== 90),
  `стар речник: мястото от v1 не се помни, бележката е на подразбиращото се място (${oldSeen.left},${oldSeen.top}, а не 120,90)`,
  oldSeen);
ok(oldSeen.raw === oldSeed,
  `стар речник: четенето не го е презаписало - просто го подминава (${String(oldSeen.raw).slice(0, 40)})`,
  { before: oldSeed.slice(0, 40), after: String(oldSeen.raw).slice(0, 40) });
// Местене с истинска мишка по лентата горе (moveActive е дефиниран по-долу в проверката, затова тук
// е на ръка - същата точка и същата стъпка).
const oldGrab = await page.evaluate(() => {
  const r = activeNoteWindow.box.getBoundingClientRect();
  return { x: Math.round(r.left + r.width - 40), y: Math.round(r.top + 4) };
});
await page.mouse.move(oldGrab.x, oldGrab.y);
await page.mouse.down();
await page.mouse.move(oldGrab.x + 30, oldGrab.y + 20, { steps: 2 });
await page.mouse.move(oldGrab.x + 60, oldGrab.y + 40, { steps: 2 });
await page.mouse.up();
await page.waitForFunction(() => {
  const g = JSON.parse(localStorage.getItem('noteWindowGeometry') || 'null');
  return !!(g && g.boxes && g.boxes['g:GOLD1']);
}, null, { timeout: 5000 }).catch(() => { });
const afterOldMove = await page.evaluate(() => {
  const g = JSON.parse(localStorage.getItem('noteWindowGeometry') || 'null');
  return g ? { v: g.v, seq: g.seq, boxes: Object.keys(g.boxes).length, dict: g, raw: g.boxes } : null;
});
const afterOldRec = afterOldMove && afterOldMove.raw['g:GOLD1'];
ok(!!afterOldMove && afterOldMove.v === 2 && !('order' in afterOldMove.dict) && afterOldMove.boxes === 1
  && afterOldMove.seq === 1 && !!afterOldRec && afterOldRec.o === 1
  && Number.isInteger(afterOldRec.x) && Number.isInteger(afterOldRec.y) && Number.isInteger(afterOldRec.w) && Number.isInteger(afterOldRec.h),
  `стар речник -> първо местене: нов речник v2 с един запис, брояч 1 и номер на реда 1 (${JSON.stringify(afterOldMove && afterOldMove.dict)})`,
  afterOldMove);
// ======================= 5. „Затвори всички" от три отворени бележки =======================
// Първо се прибира всичко, за да се види как се появява бутонът: един -> два -> три.
await page.evaluate(() => { getOpenNoteWindows().forEach(closeNoteWindow); });
await page.evaluate(() => localStorage.removeItem('noteWindowGeometry'));
await openNote({ id: 'C1', gdid: 'GC1', boardId: 'B1', raw: 'първа' }, 1);
const atOne = await read();
await openNote({ id: 'C2', gdid: 'GC2', boardId: 'B1', raw: 'втора' }, 2);
const atTwo = await read();
ok(!atOne.windows[0].closeAllShown && atTwo.windows.every(w => !w.closeAllShown),
  `„Затвори всички": при един и два отворени прозореца бутонът не се вижда (${atOne.windows[0].closeAllDisplay}, ${atTwo.windows[0].closeAllDisplay})`,
  { one: atOne.windows[0].closeAllDisplay, two: atTwo.windows.map(w => w.closeAllDisplay) });
await openNote({ id: 'C3', gdid: 'GC3', boardId: 'B1', raw: 'трета' }, 3);
const atThree = await read();
ok(atThree.windows.every(w => w.closeAllShown && w.closeAllDisplay === 'flex'),
  `„Затвори всички": при три отворени се вижда във всеки отворен прозорец (${atThree.windows.map(w => w.closeAllDisplay)})`,
  atThree.windows.map(w => ({ shown: w.closeAllShown, d: w.closeAllDisplay })));
// Мястото: „Затвори всички" е в дясната група на лентата, точно вляво от хиксчето и на същата
// вертикала — не в реда с бутоните и не някъде извън лентата (това се чупеше, когато обвивките
// .note-header-toolbar/.note-header-close-group липсват в HTML и main.js пада в резервния път).
const place = atThree.windows.filter(w => w.closeAllShown && w.closeAllRect && w.closeRect);
ok(place.length > 0 && place.every(w => /note-header-close-group/.test(w.closeAllParent || '')
    && w.closeAllRect.right <= w.closeRect.left + 1 && Math.abs(w.closeAllRect.cy - w.closeRect.cy) <= 2),
  `„Затвори всички": стои в дясната група, веднага вляво от хиксчето, на същата вертикала (${JSON.stringify(place.map(w => ({ p: w.closeAllParent, a: w.closeAllRect, x: w.closeRect })))})`,
  place.map(w => ({ parent: w.closeAllParent, all: w.closeAllRect, x: w.closeRect })));
const closeAllLabel = await page.evaluate(() => ({ i18n: _('closeAllNotes'), lang: currentLang, keyPresent: _('closeAllNotes') !== 'closeAllNotes' }));
ok(atThree.windows.every(w => w.closeAllTitle === closeAllLabel.i18n && w.closeAllAria === closeAllLabel.i18n)
  && atThree.windows.every(w => w.closeAllIcon && w.closeAllText === '') && closeAllLabel.keyPresent,
  `„Затвори всички": кръгъл бутон с икона, името идва от превода в title и aria-label, не като текст (${JSON.stringify(atThree.windows.map(w => w.closeAllTitle))}, език ${closeAllLabel.lang})`,
  { ...closeAllLabel, windows: atThree.windows.map(w => ({ t: w.closeAllTitle, a: w.closeAllAria, icon: w.closeAllIcon, text: w.closeAllText })) });
await shot('close-all');

const closeAllRect = await page.evaluate(() => {
  const btn = activeNoteWindow.closeAllBtn;
  const r = btn.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});
await page.mouse.click(closeAllRect.x, closeAllRect.y);
await page.waitForFunction(() => getOpenNoteWindows().length === 0, null, { timeout: 5000 }).catch(() => { });
const closed = await read();
ok(closed.open === 0 && closed.windows.filter(w => w.visible).length === 0,
  `„Затвори всички": затвори всичките (отворени ${closed.open}, видими ${closed.windows.filter(w => w.visible).length})`, closed);
ok(closed.total === 1 && closed.windows[0].closeAllDisplay === 'none',
  `„Затвори всички": остава един празен прозорец и бутонът се скрива (в DOM ${closed.total}, бутон ${closed.windows[0].closeAllDisplay})`, closed);
const afterCloseAll = await openNote({ id: 'C4', gdid: 'GC4', boardId: 'B1', raw: 'след затварянето' }, 1);
ok(afterCloseAll.windows[afterCloseAll.activeIndex].text === 'след затварянето',
  `„Затвори всички": след това нова бележка се отваря нормално (${afterCloseAll.windows[afterCloseAll.activeIndex].text})`, afterCloseAll);

// ======================= 6. „Единична бележка" =======================
// Чекбоксът е в Настройки: строи се от createSettingsUI, точно както го прави приложението.
const settings = await page.evaluate(async () => {
  localStorage.removeItem('singleNoteMode');
  try { await createSettingsUI(boardsData, false); return { built: true }; }
  catch (e) { return { built: false, err: String(e.message) }; }
});
ok(settings.built, `единична бележка: Настройки се построи и чекбоксът е свързан (${JSON.stringify(settings)})`, settings);
const defaultOff = await page.evaluate(() => {
  const cb = document.getElementById('single-note-mode-checkbox');
  return { exists: !!cb, checked: cb ? cb.checked : null, key: cb ? cb.dataset.key : null, stored: localStorage.getItem('singleNoteMode'), mode: isSingleNoteMode() };
});
ok(defaultOff.exists && defaultOff.checked === false && defaultOff.stored === null && defaultOff.mode === false,
  `единична бележка: по подразбиране е ИЗКЛЮЧЕНА и това е новото поведение (checked=${defaultOff.checked})`, defaultOff);
await openNote({ id: 'S1', gdid: 'GS1', boardId: 'B1', raw: 'една' }, 2);
const twoBefore = await read();
ok(twoBefore.open === 2, `единична бележка: изключена - втори прозорец се отваря свободно (${twoBefore.open})`, twoBefore);
const on = await page.evaluate(async () => {
  const cb = document.getElementById('single-note-mode-checkbox');
  cb.checked = true;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150));
  const overlay = document.getElementById('single-note-overlay');
  const top = getTopNoteWindow();
  return {
    stored: localStorage.getItem('singleNoteMode'), mode: isSingleNoteMode(), checked: cb.checked,
    open: getOpenNoteWindows().length,
    texts: getOpenNoteWindows().map(w => (w.body.textContent || '').trim().slice(0, 20)),
    shadeVisible: !!(overlay && overlay.classList.contains('visible')),
    shadeUnderTop: !!(overlay && top && overlay.nextElementSibling === top.el),
    shadeZ: overlay ? String(overlay.style.zIndex) : null,
    topZ: top ? String(top.el.style.zIndex) : null,
    shadeInLayer: !!(overlay && overlay.parentNode === document.getElementById('note-windows-layer')),
  };
});
ok(on.stored === 'true' && on.mode === true && on.checked === true,
  `единична бележка: чекбоксът включва режима и го записва (${on.stored})`, on);
ok(on.open === 1, `единична бележка: включването оставя САМО горната бележка (отворени ${on.open}, ${JSON.stringify(on.texts)})`, on);
ok(on.shadeVisible && on.shadeUnderTop && on.shadeInLayer && on.shadeZ === on.topZ,
  `единична бележка: затъмнението е точно под горния прозорец (видимо ${on.shadeVisible}, z ${on.shadeZ}/${on.topZ})`, on);
await shot('single-note-on');
const secondInMode = await page.evaluate(async () => {
  showModal({ raw: 'втора при включен режим', format: null, id: 'S2', gdid: 'GS2', boardId: 'B1' });
  await new Promise(r => setTimeout(r, 100));
  return { open: getOpenNoteWindows().length, texts: getOpenNoteWindows().map(w => (w.body.textContent || '').trim().slice(0, 30)) };
});
ok(secondInMode.open === 1 && secondInMode.texts[0] === 'втора при включен режим',
  `единична бележка: втора бележка влиза в същия прозорец, не отваря нов (${JSON.stringify(secondInMode)})`, secondInMode);
// Затъмнението е ПОД бележката: собствените бутони на прозореца продължават да работят.
const closeRect = await page.evaluate(() => {
  const btn = activeNoteWindow.box.querySelector('.modal-close');
  const r = btn.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});
await page.mouse.click(closeRect.x, closeRect.y);
await page.waitForFunction(() => getOpenNoteWindows().length === 0, null, { timeout: 5000 }).catch(() => { });
const xUnderShade = await read();
ok(xUnderShade.open === 0,
  `единична бележка: хиксчето се улучва и под затъмнението (отворени ${xUnderShade.open})`, xUnderShade);
// Бележка пак, и после натиск върху затъмнението (далеч от прозореца) - затваря като хиксчето.
await openNote({ id: 'S5', gdid: 'GS5', boardId: 'B1', raw: 'пак една' }, 1);
const shadeBefore = await read();
ok(shadeBefore.shade && shadeBefore.shade.visible, `единична бележка: затъмнението пак е там (${JSON.stringify(shadeBefore.shade)})`, shadeBefore.shade);
// Натискът е ДАЛЕЧ от прозореца, но и НАД лентата с отворените бележки: тя се показва още при една
// отворена бележка и стои над затъмнението в дъното на екрана - там натискът е неин, не на
// затъмнението (това е и смисълът на лентата: да се натиска). Точката се взема над лентата.
const shadePoint = await page.evaluate(() => {
  const bar = document.getElementById('open-notes-bar');
  const barTop = bar && bar.classList.contains('is-visible') ? bar.getBoundingClientRect().top : window.innerHeight;
  return { x: 24, y: Math.round(barTop - 40) };
});
await page.mouse.click(shadePoint.x, shadePoint.y);
await page.waitForFunction(() => getOpenNoteWindows().length === 0, null, { timeout: 5000 }).catch(() => { });
const shadeClick = await read();
ok(shadeClick.open === 0 && shadeClick.shade && !shadeClick.shade.visible,
  `единична бележка: натиск върху затъмнението затваря бележката (отворени ${shadeClick.open})`, shadeClick);
const off = await page.evaluate(async () => {
  const cb = document.getElementById('single-note-mode-checkbox');
  cb.checked = false;
  cb.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 100));
  const overlay = document.getElementById('single-note-overlay');
  return { stored: localStorage.getItem('singleNoteMode'), mode: isSingleNoteMode(), shadeVisible: !!(overlay && overlay.classList.contains('visible')) };
});
ok(off.stored === 'false' && off.mode === false && !off.shadeVisible,
  `единична бележка: изключването маха затъмнението (${off.stored}, видимо ${off.shadeVisible})`, off);
await openNote({ id: 'S3', gdid: 'GS3', boardId: 'B1', raw: 'пак две' }, 1);
const againTwo = await openNote({ id: 'S4', gdid: 'GS4', boardId: 'B1', raw: 'пак втора' }, 2);
ok(againTwo.open === 2, `единична бележка: изключен режим - пак две едновременно (${againTwo.open})`, againTwo);

// ======================= 7. Смяна на борда: отворените остават =======================
const beforeBoard = await read();
const boardNameRect = await page.evaluate(() => {
  const el = document.getElementById('modal-board-name');
  const w = activeNoteWindow;
  const hasHandler = !!el && !!w;
  const r = el ? el.getBoundingClientRect() : null;
  return r && hasHandler ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), text: el.textContent.trim() } : null;
});
ok(!!boardNameRect && boardNameRect.text === 'Работа',
  `смяна на борда: името на борда се вижда в лентата (${boardNameRect && boardNameRect.text})`, boardNameRect);
await page.mouse.click(boardNameRect.x, boardNameRect.y);
await page.waitForFunction(() => currentBoardFilter === 'B1', null, { timeout: 5000 }).catch(() => { });
const afterBoardClick = await read();
const boardFilter = await page.evaluate(() => currentBoardFilter);
ok(boardFilter === 'B1', `смяна на борда: кликът върху името превключи борда (${boardFilter})`, boardFilter);
ok(afterBoardClick.open === beforeBoard.open && afterBoardClick.windows.every(w => w.visible),
  `смяна на борда: отворените прозорци остават (${beforeBoard.open} -> ${afterBoardClick.open})`, { before: beforeBoard.open, after: afterBoardClick.open });
ok(JSON.stringify(afterBoardClick.windows.map(w => w.text)) === JSON.stringify(beforeBoard.windows.map(w => w.text)),
  `смяна на борда: всеки прозорец продължава да показва своята бележка (${JSON.stringify(afterBoardClick.windows.map(w => w.text))})`,
  { before: beforeBoard.windows.map(w => w.text), after: afterBoardClick.windows.map(w => w.text) });
// Същото и по пътя на менюто с бордове: приложението вика filterNotesByBoard.
const afterMenuSwitch = await page.evaluate(async () => {
  await filterNotesByBoard('B2');
  await new Promise(r => setTimeout(r, 100));
  return { filter: currentBoardFilter, open: getOpenNoteWindows().length, texts: getOpenNoteWindows().map(w => (w.body.textContent || '').trim().slice(0, 20)) };
});
ok(afterMenuSwitch.filter === 'B2' && afterMenuSwitch.open === beforeBoard.open,
  `смяна на борда от менюто: прозорците пак остават (борд ${afterMenuSwitch.filter}, отворени ${afterMenuSwitch.open})`, afterMenuSwitch);

// ======================= 9. Поправките след сливането (b1.09) =======================
// (а) активният прозорец няма рамка; (б) „Затвори всички" е кръгъл бутон с икона вляво от хиксчето;
// (в) при повече от два прозореца стрелките обхождат прозорците, при два - бележките на борда;
// (г) при тясна бележка нищо в лентата не излиза извън кутията и хиксчето се вижда изцяло.
const closeAllWindows = async () => {
  await page.evaluate(() => { getOpenNoteWindows().forEach(closeNoteWindow); });
  await page.waitForTimeout(500); // затворените се махат от DOM с малко закъснение
};
// Стрелката на АКТИВНИЯ прозорец: истински клик с мишка, точно както го прави човек.
const pressArrow = async (dir) => {
  const where = await page.evaluate((dir) => {
    const win = activeNoteWindow;
    const btn = win.el.querySelector(dir > 0 ? '#next-note-btn, [data-mwid="next-note-btn"]' : '#prev-note-btn, [data-mwid="prev-note-btn"]');
    if (!btn) return null;
    const r = btn.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), display: getComputedStyle(btn).display };
  }, dir);
  if (!where || where.display === 'none') return { missing: true, dir };
  await page.mouse.click(where.x, where.y);
  await page.waitForTimeout(30);
  return page.evaluate(() => {
    const top = getTopNoteWindow();
    return {
      text: top ? (top.body.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20) : null,
      open: getOpenNoteWindows().length,
      active: noteWindows.indexOf(activeNoteWindow),
    };
  });
};

await closeAllWindows();
await openNote({ id: 'R1', gdid: 'GR1', boardId: 'B1', raw: 'прозорец 1' }, 1);
await openNote({ id: 'R2', gdid: 'GR2', boardId: 'B1', raw: 'прозорец 2' }, 2);
const three = await openNote({ id: 'R3', gdid: 'GR3', boardId: 'B1', raw: 'прозорец 3' }, 3);
ok(three.windows.every(w => w.outline === 'none 0px' || /^none /.test(w.outline)),
  `рамка: нито един прозорец не е обграден, и активният не е (${JSON.stringify(three.windows.map(w => w.outline))})`,
  three.windows.map(w => ({ outline: w.outline, active: w.active })));
ok(three.windows[three.activeIndex].active && three.windows[three.activeIndex].z === Math.max(...three.windows.map(w => w.z)),
  `рамка: активният прозорец е най-отгоре, без рамка (z ${three.windows[three.activeIndex].z})`,
  three.windows.map(w => ({ z: w.z, a: w.active })));

// (б) „Затвори всички" - в ДЯСНАТА клетка на лентата, едно до друго с хиксчето, извън реда с бутоните.
const closeAllGeom = await page.evaluate(() => {
  const win = activeNoteWindow;
  const btn = win.closeAllBtn;
  if (!btn) return { exists: false };
  const cs = getComputedStyle(btn);
  const r = btn.getBoundingClientRect();
  const xBtn = win.box.querySelector('.modal-close');
  const xr = xBtn.getBoundingClientRect();
  const br = win.box.getBoundingClientRect();
  const row = win.box.querySelector('.note-header-buttons');
  const rr = row.getBoundingClientRect();
  const group = win.box.querySelector('.note-header-close-group');
  const gr = group ? group.getBoundingClientRect() : null;
  return {
    exists: true, hidden: btn.hidden, display: cs.display, radius: cs.borderRadius,
    w: Math.round(r.width), h: Math.round(r.height), icon: !!btn.querySelector('svg'),
    classes: btn.className,
    inRow: !!(btn.parentElement && btn.parentElement.classList.contains('note-header-buttons')),
    inGroup: !!(group && btn.parentElement === group),
    groupChildren: group ? group.children.length : 0,
    sameParentAsX: !!(xBtn.parentElement && xBtn.parentElement === btn.parentElement),
    gapToX: Math.round(xr.left - r.right),
    sameLineAsX: Math.abs((r.top + r.height / 2) - (xr.top + xr.height / 2)) <= 1,
    rowHasOthers: row.querySelectorAll('button').length,
    btn: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
    x: { left: xr.left, right: xr.right, top: xr.top, bottom: xr.bottom },
    box: { left: br.left, right: br.right, top: br.top, bottom: br.bottom },
    row: { left: rr.left, right: rr.right },
    group: gr ? { left: gr.left, right: gr.right, top: gr.top, bottom: gr.bottom } : null,
  };
});
ok(closeAllGeom.exists && !closeAllGeom.hidden && closeAllGeom.display === 'flex' && closeAllGeom.icon
  && closeAllGeom.inGroup && !closeAllGeom.inRow && closeAllGeom.groupChildren === 2
  && closeAllGeom.sameParentAsX && /note-window-bar-btn/.test(closeAllGeom.classes),
  `„Затвори всички": бутонът е в дясната група до хиксчето, извън реда с бутоните (група от ${closeAllGeom.groupChildren}, в реда ${closeAllGeom.inRow})`,
  closeAllGeom);
ok(closeAllGeom.radius === '50%' && closeAllGeom.w === 32 && closeAllGeom.h === 32,
  `„Затвори всички": същият 32px кръгъл бутон като останалите в лентата (${closeAllGeom.w}x${closeAllGeom.h}, radius ${closeAllGeom.radius})`,
  closeAllGeom);
ok(closeAllGeom.rowHasOthers === 5,
  `„Затвори всички": редът с бутоните остава с петте си бутона, без „Затвори всички" (${closeAllGeom.rowHasOthers})`,
  closeAllGeom);
ok(closeAllGeom.btn.left >= closeAllGeom.box.left - 0.5 && closeAllGeom.btn.right <= closeAllGeom.box.right + 0.5
  && closeAllGeom.btn.top >= closeAllGeom.box.top - 0.5 && closeAllGeom.btn.bottom <= closeAllGeom.box.bottom + 0.5,
  `„Затвори всички": бутонът е изцяло в кутията (${Math.round(closeAllGeom.btn.left)}..${Math.round(closeAllGeom.btn.right)} в ${Math.round(closeAllGeom.box.left)}..${Math.round(closeAllGeom.box.right)})`,
  closeAllGeom);
ok(closeAllGeom.btn.right <= closeAllGeom.x.left + 0.5 && closeAllGeom.sameLineAsX
  && closeAllGeom.gapToX >= 4 && closeAllGeom.gapToX <= 12,
  `„Затвори всички": бутонът е точно вляво от хиксчето, на същата вертикала (${Math.round(closeAllGeom.btn.right)} <= ${Math.round(closeAllGeom.x.left)}, отстояние ${closeAllGeom.gapToX})`,
  closeAllGeom);
ok(closeAllGeom.x.left >= closeAllGeom.box.left && closeAllGeom.x.right <= closeAllGeom.box.right
  && closeAllGeom.x.top >= closeAllGeom.box.top && closeAllGeom.x.bottom <= closeAllGeom.box.bottom,
  `„Затвори всички": хиксчето също е изцяло в кутията (${Math.round(closeAllGeom.x.left)}..${Math.round(closeAllGeom.x.right)})`,
  closeAllGeom);
ok(!!closeAllGeom.group && closeAllGeom.group.right <= closeAllGeom.box.right + 0.5
  && closeAllGeom.group.left >= closeAllGeom.row.right - 0.5,
  `„Затвори всички": дясната група е изцяло вдясно от реда с бутоните (група ${closeAllGeom.group && Math.round(closeAllGeom.group.left)}..${closeAllGeom.group && Math.round(closeAllGeom.group.right)}, ред до ${Math.round(closeAllGeom.row.right)})`,
  closeAllGeom);
await shot('close-all-icon');

// (в) Стрелките при ЧЕТИРИ отворени прозоръци: всеки натиск - следващият прозорец, после се завърта.
await closeAllWindows();
for (const i of [1, 2, 3, 4]) {
  await openNote({ id: 'W' + i, gdid: 'GW' + i, boardId: 'B1', raw: 'прозорец ' + i }, i);
}
await page.evaluate(() => { activateNoteWindow(getOpenNoteWindows()[0], true); });
const walkStart = await page.evaluate(() => ({
  order: getOpenNoteWindows().map(w => (w.body.textContent || '').trim()),
  active: (activeNoteWindow.body.textContent || '').trim(),
}));
const walk = [];
for (let i = 0; i < 4; i++) walk.push(await pressArrow(1));
ok(walkStart.order.length === 4 && walkStart.active === 'прозорец 1' && walk.every(w => w.open === 4),
  `стрелки при 4 прозоръца: начало от първия, четирите остават отворени (${JSON.stringify(walkStart.order)}, ${JSON.stringify(walk.map(w => w.open))})`,
  { walkStart, walk });
ok(walk[0].text === 'прозорец 2' && walk[1].text === 'прозорец 3' && walk[2].text === 'прозорец 4',
  `стрелки при 4 прозоръца: три натиска на „>" минават на следващия прозорец един по един, не на два (${JSON.stringify(walk.slice(0, 3).map(w => w.text))})`,
  walk);
ok(new Set(walk.slice(0, 3).map(w => w.active)).size === 3,
  `стрелки при 4 прозоръца: всеки натиск активира ДРУГ прозорец (${JSON.stringify(walk.slice(0, 3).map(w => w.active))})`, walk);
ok(walk[3].text === 'прозорец 1' && walk[3].active === walkStart.order.indexOf('прозорец 1'),
  `стрелки при 4 прозоръца: четвъртият натиск се завърта на първия (${walk[3].text})`, walk);
const back = await pressArrow(-1);
ok(back.text === 'прозорец 4',
  `стрелки при 4 прозоръца: „<" връща назад по същия ред (${back.text})`, back);
const bothArrows = await page.evaluate(() => getOpenNoteWindows().every(w => {
  const prev = w.el.querySelector('#prev-note-btn, [data-mwid="prev-note-btn"]');
  const next = w.el.querySelector('#next-note-btn, [data-mwid="next-note-btn"]');
  return getComputedStyle(prev).display === 'flex' && getComputedStyle(next).display === 'flex';
}));
ok(bothArrows, 'стрелки при 4 прозоръца: двете стрелки се виждат във всеки прозорец, независимо от позицията в борда', bothArrows);
// Четири натискания на „<" от първия прозорец: обратно през целия списък и пак в началото (b1.11).
const backStart = await page.evaluate(() => {
  activateNoteWindow(getOpenNoteWindows()[0], true);
  return (activeNoteWindow.body.textContent || '').trim();
});
const backWalk = [];
for (let i = 0; i < 4; i++) backWalk.push(await pressArrow(-1));
const backPattern = backWalk.map(w => w.text);
ok(backStart === 'прозорец 1' && backPattern.join('|') === 'прозорец 4|прозорец 3|прозорец 2|прозорец 1',
  `стрелки при 4 прозоръца: четири натискания на „<" минават през всички и се връщат в началото (${JSON.stringify(backPattern)})`,
  { backStart, backWalk });
// Натиск в прозорец, който НЕ е активният: първо той става активен, чак после се минава на следващия.
// (Ако редът тръгваше от стария активен прозорец, тук щеше да се стигне до „прозорец 2", не до 4.)
const nonActivePress = await page.evaluate(() => {
  const open = getOpenNoteWindows();
  activateNoteWindow(open[0], true);
  const btn = open[2].el.querySelector('#next-note-btn, [data-mwid="next-note-btn"]');
  const display = btn ? getComputedStyle(btn).display : 'missing';
  const clicked = (open[2].body.textContent || '').trim();
  if (btn) btn.click();
  return { display, clicked, text: (getTopNoteWindow().body.textContent || '').trim(), open: getOpenNoteWindows().length };
});
ok(nonActivePress.display === 'flex' && nonActivePress.text === 'прозорец 4' && nonActivePress.open === 4,
  `стрелки при 4 прозоръца: натиск в неактивен прозорец (${nonActivePress.clicked}) първо го прави активен, после минава на следващия (${nonActivePress.text})`,
  nonActivePress);
await shot('arrow-walk-4');

// (в-1) При ЕДИН отворен прозорец стрелките продължават да ходят по бележките на борда в СЪЩИЯ
// прозорец и се скриват в края на списъка - това поведение не се пипа (b1.11).
await closeAllWindows();
const boardNotes = await page.evaluate(() => {
  notesContainer.innerHTML = '';
  for (let i = 1; i <= 3; i++) {
    const el = document.createElement('div');
    el.className = 'note-item';
    el.style.display = 'flex';
    el.addEventListener('click', () => showModal({ raw: 'борд бележка ' + i, format: null, id: 'BN' + i, gdid: 'GBN' + i, boardId: 'B1' }, el));
    notesContainer.appendChild(el);
  }
  const first = notesContainer.querySelector('.note-item');
  showModal({ raw: 'борд бележка 1', format: null, id: 'BN1', gdid: 'GBN1', boardId: 'B1' }, first);
  return notesContainer.querySelectorAll('.note-item').length;
});
const oneWindow = await waitOpen(1);
const board1 = await pressArrow(1);
ok(boardNotes === 3 && oneWindow && board1.open === 1 && board1.text === 'борд бележка 2',
  `стрелки при 1 прозорец: „>" отваря съседната бележка от борда в СЪЩИЯ прозорец (${board1.text}, прозорци ${board1.open})`,
  { boardNotes, board1 });
const board2 = await pressArrow(1);
const boardEnd = await page.evaluate(() => {
  const win = activeNoteWindow;
  const prev = win.el.querySelector('#prev-note-btn, [data-mwid="prev-note-btn"]');
  const next = win.el.querySelector('#next-note-btn, [data-mwid="next-note-btn"]');
  return { prev: getComputedStyle(prev).display, next: getComputedStyle(next).display, text: (win.body.textContent || '').trim() };
});
ok(board2.open === 1 && board2.text === 'борд бележка 3'
  && boardEnd.prev === 'flex' && boardEnd.next === 'none' && boardEnd.text === 'борд бележка 3',
  `стрелки при 1 прозорец: на края на списъка „>" се скрива, както досега (${boardEnd.prev}/${boardEnd.next}, ${boardEnd.text})`,
  boardEnd);

// (в-2) ДВА отворени прозореца: стрелките вече обхождат ПРОЗОРЦИТЕ, а не бележките на борда
// (b1.11). Четири натискания на „>" минават и през двата и се връщат в началото; същото и с „<".
await openNote({ id: 'V9', gdid: 'GV9', boardId: 'B2', raw: 'друг прозорец' }, 2);
await page.evaluate(() => { activateNoteWindow(getOpenNoteWindows().find(w => (w.body.textContent || '').trim().startsWith('борд бележка')), true); });
const twoStart = await page.evaluate(() => (activeNoteWindow.body.textContent || '').trim());
const twoWalk = [];
for (let i = 0; i < 4; i++) twoWalk.push(await pressArrow(1));
const twoPattern = twoWalk.map(w => w.text);
ok(twoPattern[0] === 'друг прозорец' && twoPattern[1] === 'борд бележка 3'
  && twoPattern[2] === 'друг прозорец' && twoPattern[3] === 'борд бележка 3' && twoWalk.every(w => w.open === 2),
  `стрелки при 2 прозоръца: „>" редува двата прозореца и зацикля (от ${twoStart}: ${JSON.stringify(twoPattern)})`,
  { twoStart, twoWalk });
const twoBack = [];
for (let i = 0; i < 4; i++) twoBack.push(await pressArrow(-1));
const twoBackPattern = twoBack.map(w => w.text);
ok(twoBackPattern[0] === 'друг прозорец' && twoBackPattern[1] === 'борд бележка 3'
  && twoBackPattern[2] === 'друг прозорец' && twoBackPattern[3] === 'борд бележка 3' && twoBack.every(w => w.open === 2),
  `стрелки при 2 прозоръца: „<" също редува двата и зацикля (${JSON.stringify(twoBackPattern)})`,
  twoBack);
const twoBothArrows = await page.evaluate(() => getOpenNoteWindows().every(w => {
  const prev = w.el.querySelector('#prev-note-btn, [data-mwid="prev-note-btn"]');
  const next = w.el.querySelector('#next-note-btn, [data-mwid="next-note-btn"]');
  return getComputedStyle(prev).display === 'flex' && getComputedStyle(next).display === 'flex';
}));
ok(twoBothArrows,
  'стрелки при 2 прозоръца: двете стрелки се виждат във всеки прозорец, независимо от позицията в борда',
  twoBothArrows);

// (г) Тясна бележка (320px): нищо в лентата не излиза извън кутията, хиксчето се вижда изцяло.
// Гледат се И НЕАКТИВНИТЕ прозорци: те пазят id-тата си като data-mwid/.nw-*, тоест CSS-ът ги хваща
// по клас, и точно там по-слаб селектор пропуска абсолютното позициониране на името на борда.
await closeAllWindows();
for (const i of [1, 2, 3]) {
  await openNote({ id: 'T' + i, gdid: 'GT' + i, boardId: 'B1', raw: 'тясна ' + i }, i);
}
const narrow = await page.evaluate(async () => {
  const open = getOpenNoteWindows();
  open.forEach(w => {
    w.box.style.width = '320px';
    w.box.style.height = '230px';
    // Хиксчето, изтриването, копирането и калкулаторът са налице и в истинското приложение (IndexedDB);
    // в проверката изтриването се показва на ръка, за да е лентата точно онази от снимката на собственика.
    const del = w.box.querySelector('#delete-modal-btn, [data-mwid="delete-modal-btn"]');
    if (del) del.style.display = 'flex';
  });
  // Преходът на прозорците (scale 0.7 -> 1) трябва да е свършил, иначе rect-овете са смалени.
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const settled = open.every(w => w.box.offsetWidth > 0
      && Math.abs(w.box.getBoundingClientRect().width / w.box.offsetWidth - 1) < 0.0005);
    if (settled) break;
    await new Promise(res => requestAnimationFrame(res));
  }
  return open.map(w => {
    const br = w.box.getBoundingClientRect();
    const row = w.box.querySelector('.note-header-buttons');
    const rr = row.getBoundingClientRect();
    const name = w.box.querySelector('#modal-board-name, .nw-modal-board-name');
    const nr = name ? name.getBoundingClientRect() : null;
    const xr = w.box.querySelector('.modal-close').getBoundingClientRect();
    const btns = [...w.box.querySelectorAll('.note-header-toolbar button')].map(b => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      return {
        cls: String(b.className), display: cs.display,
        visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && !b.hidden,
        left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width,
      };
    });
    return {
      text: (w.body.textContent || '').trim(),
      active: w === activeNoteWindow,
      contentWidth: Math.round(parseFloat(getComputedStyle(w.box).width)),
      box: { left: br.left, right: br.right, top: br.top, bottom: br.bottom, width: Math.round(br.width) },
      x: { left: xr.left, right: xr.right, top: xr.top, bottom: xr.bottom },
      row: { left: rr.left, right: rr.right, scrollWidth: row.scrollWidth, clientWidth: row.clientWidth },
      name: nr ? { left: nr.left, right: nr.right, width: Math.round(nr.width), shown: getComputedStyle(name).display !== 'none' } : null,
      btns,
      // Редът с бутоните и дясната група (b1.11): „Затвори всички" и хиксчето са в групата, извън реда.
      rowButtons: [...row.querySelectorAll('button')].filter(b => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && !b.hidden && getComputedStyle(b).display !== 'none';
      }).length,
      groupButtons: [...(w.box.querySelector('.note-header-close-group') || w.box).children].map(b => {
        const r = b.getBoundingClientRect();
        const cs = getComputedStyle(b);
        return {
          cls: String(b.className),
          visible: r.width > 0 && r.height > 0 && cs.display !== 'none' && !b.hidden,
          left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        };
      }),
    };
  });
});
const narrowActive = narrow.find(w => w.active);
const visible = narrowActive.btns.filter(b => b.visible);
const visibleInRow = visible.filter(b => !/\bmodal-close\b/.test(b.cls));
ok(narrow.length === 3 && narrow.every(w => w.contentWidth === 320) && visibleInRow.length === 6 && visible.length === 7,
  `тясна бележка: и трите прозореца са 320px, в лентата се виждат шестте кръгчета плюс хиксчето (${JSON.stringify(narrow.map(w => w.contentWidth))}, ред ${visibleInRow.length}, всичко ${visible.length})`,
  narrow);
// b1.11: в реда с бутоните остават пет, а „Затвори всички" и хиксчето са в дясната група - и двете
// видими и изцяло в кутията дори при 320px.
const narrowRow = narrow.filter(w => w.rowButtons !== 5);
ok(narrowRow.length === 0,
  `тясна бележка: редът с бутоните е с пет бутона, „Затвори всички" вече не е в него (${JSON.stringify(narrow.map(w => w.rowButtons))})`,
  { narrowRow });
const narrowGroup = narrow.map(w => ({
  text: w.text,
  ok: w.groupButtons.length === 2 && w.groupButtons.every(b => b.visible
    && b.left >= w.box.left - 0.5 && b.right <= w.box.right + 0.5
    && b.top >= w.box.top - 0.5 && b.bottom <= w.box.bottom + 0.5)
    && /close-all-notes-btn/.test(w.groupButtons[0].cls) && /modal-close/.test(w.groupButtons[1].cls)
    && w.groupButtons[0].right <= w.groupButtons[1].left + 0.5,
  group: w.groupButtons.map(b => [Math.round(b.left), Math.round(b.right), b.visible]),
  box: [Math.round(w.box.left), Math.round(w.box.right)],
}));
ok(narrowGroup.every(g => g.ok),
  `тясна бележка: „Затвори всички" и хиксчето стоят едно до друго в дясната група, видими и изцяло в кутията (${JSON.stringify(narrowGroup.map(g => g.group))})`,
  { narrowGroup });
const outside = [];
narrow.forEach(w => w.btns.filter(b => b.visible).forEach(b => {
  if (b.left < w.box.left - 0.5 || b.right > w.box.right + 0.5 || b.top < w.box.top - 0.5 || b.bottom > w.box.bottom + 0.5) {
    outside.push({ text: w.text, cls: b.cls, left: Math.round(b.left), right: Math.round(b.right), box: [Math.round(w.box.left), Math.round(w.box.right)] });
  }
}));
ok(outside.length === 0,
  `тясна бележка: нито един бутон в трите прозореца не излиза извън кутията (${JSON.stringify(outside)})`,
  { outside });
const xOut = narrow.filter(w => !(w.x.left >= w.box.left && w.x.right <= w.box.right && w.x.top >= w.box.top && w.x.bottom <= w.box.bottom));
ok(xOut.length === 0,
  `тясна бележка: хиксчето е изцяло в кутията във всеки прозорец (${JSON.stringify(narrow.map(w => [Math.round(w.x.left), Math.round(w.x.right)]))})`,
  { xOut });
const rowScroll = narrow.filter(w => w.row.scrollWidth > w.row.clientWidth + 1);
ok(rowScroll.length === 0,
  `тясна бележка: редът с бутоните се събира без плъзгане във всеки прозорец (${JSON.stringify(narrow.map(w => [w.row.scrollWidth, w.row.clientWidth]))})`,
  { rowScroll });
const nameUnder = narrow.filter(w => w.name && w.name.shown && w.name.right > w.row.left + 0.5);
const namesShown = narrow.filter(w => w.name && w.name.shown).length;
ok(namesShown >= 2 && nameUnder.length === 0,
  `тясна бележка: името на борда дава мястото и не слиза под бутоните (показано в ${namesShown} от ${narrow.length}, ${JSON.stringify(narrow.map(w => w.name ? [w.name.shown, Math.round(w.name.right), Math.round(w.row.left)] : null))})`,
  { nameUnder });
await shot('narrow-header-320');

// ======================= 10. Геометрия: запис само при промяна + ресет (b1.10) =======================
// Правилото: отваряне и затваряне на бележка, която никой не е местил и не е преоразмерявал, не създава
// запис в noteWindowGeometry. Дефолтният размер (modalWidth/modalHeight) се пипа само в режим
// „Единична бележка". Бутончето „Ресет на позиции/размери" в Настройки трие записите.
const geomRaw = () => page.evaluate(() => localStorage.getItem('noteWindowGeometry'));
const geomRead = () => page.evaluate(() => {
  const g = JSON.parse(localStorage.getItem('noteWindowGeometry') || 'null');
  return g ? { v: g.v, seq: g.seq, boxes: Object.keys(g.boxes).length, raw: g.boxes, dict: g } : null;
});
const activeBox = () => page.evaluate(() => {
  const w = activeNoteWindow;
  const cs = getComputedStyle(w.box);
  return {
    key: w.key,
    left: Math.round(w.box.offsetLeft), top: Math.round(w.box.offsetTop),
    w: Math.round(parseFloat(cs.width)), h: Math.round(parseFloat(cs.height)),
    dirty: !!w.geomDirty,
  };
});
const closeActive = async () => {
  await page.evaluate(() => closeNoteWindow(activeNoteWindow));
  await page.waitForTimeout(60);
};
// Преоразмеряване с истинска мишка по дръжката в долния десен ъгъл: ширината расте точно с dx.
const resizeActive = async (dx, dy) => {
  const at = await page.evaluate(() => {
    const h = activeNoteWindow.box.querySelector('.modal-resize-handle');
    const r = h.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
  });
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + Math.round(dx / 2), at.y + Math.round(dy / 2), { steps: 2 });
  await page.mouse.move(at.x + dx, at.y + dy, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(80);
};
// Местене с истинска мишка, хващайки лентата горе (същата точка като в раздел 3).
const moveActive = async (dx, dy) => {
  const at = await page.evaluate(() => {
    const r = activeNoteWindow.box.getBoundingClientRect();
    return { x: Math.round(r.left + r.width - 40), y: Math.round(r.top + 4) };
  });
  await page.mouse.move(at.x, at.y);
  await page.mouse.down();
  await page.mouse.move(at.x + Math.round(dx / 2), at.y + Math.round(dy / 2), { steps: 2 });
  await page.mouse.move(at.x + dx, at.y + dy, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(80);
};
const clearGeometryStorage = () => page.evaluate(() => {
  localStorage.removeItem('noteWindowGeometry');
  localStorage.removeItem('modalWidth');
  localStorage.removeItem('modalHeight');
  localStorage.removeItem('singleNoteMode');
  applySingleNoteModeSetting();
});

await closeAllWindows();
await clearGeometryStorage();

// (1) Чиста памет: отваряне и затваряне на непреместена бележка не създава запис.
const opened1 = await openNote({ id: 'G1', gdid: 'GG1', boardId: 'B1', raw: 'геометрия 1' }, 1);
const box1 = await activeBox();
ok(opened1.geom === null,
  `геометрия 1: чиста памет - отварянето не създава запис (${JSON.stringify(opened1.geom)})`, opened1.geom);
ok(box1.w > 0 && box1.h > 0 && box1.dirty === false,
  `геометрия 1: бележката е на екрана с реален размер и не е „пипана" след отварянето (${box1.left},${box1.top} ${box1.w}x${box1.h}, флаг ${box1.dirty})`, box1);
await closeActive();
const afterClose1 = await geomRead();
ok(afterClose1 === null,
  `геометрия 1: затварянето на непреместена бележка също не създава запис (${JSON.stringify(afterClose1)})`, afterClose1);

// (1б) Същото и за бележка с размери от options (демо бележката): и тя не си създава запис.
await openNote({ id: 'G1B', gdid: 'GG1B', boardId: 'B1', width: 640, height: 420, raw: 'геометрия 1б' }, 1);
const box1b = await activeBox();
await closeActive();
const afterClose1b = await geomRead();
ok(box1b.w === 640 && box1b.h === 420 && box1b.dirty === false,
  `геометрия 1б: бележка с размери от options се отваря с тях и не е „пипана" (${box1b.w}x${box1b.h}, флаг ${box1b.dirty})`, box1b);
ok(afterClose1b === null,
  `геометрия 1б: и тя не създава запис, щом никой не я е пипал (${JSON.stringify(afterClose1b)})`, afterClose1b);

// (2) Бележка, която вече има запис: отваря се на него, а затварянето не го пипа.
const seededGeom = await page.evaluate(() => {
  const store = {
    v: 2,
    seq: 4,
    boxes: { 'g:GKEEP': { x: 120, y: 90, w: 480, h: 340, o: 2 }, 'g:GX': { x: 640, y: 400, w: 400, h: 300, o: 4 } }
  };
  localStorage.setItem('noteWindowGeometry', JSON.stringify(store));
  return JSON.stringify(store);
});
await openNote({ id: 'KEEP', gdid: 'GKEEP', boardId: 'B1', raw: 'със запис' }, 1);
const keepBox = await activeBox();
const keepBefore = await geomRaw();
await closeActive();
const keepAfter = await geomRaw();
ok(keepBox.left === 120 && keepBox.top === 90 && keepBox.w === 480 && keepBox.h === 340,
  `геометрия 2: бележка със запис се отваря точно на него (${keepBox.left},${keepBox.top} ${keepBox.w}x${keepBox.h})`, keepBox);
ok(keepAfter === keepBefore && keepBefore === seededGeom,
  `геометрия 2: отваряне и затваряне без местене оставят записа непроменен (нито кутиите, нито номерата им: ${String(keepAfter).slice(0, 70)})`,
  { keepBefore, keepAfter });

// (3) Преоразмеряване в режим „Единична бележка": дефолтният размер се записва.
await clearGeometryStorage();
await page.evaluate(() => { localStorage.setItem('singleNoteMode', 'true'); applySingleNoteModeSetting(); });
await openNote({ id: 'G3', gdid: 'GG3', boardId: 'B1', raw: 'геометрия 3' }, 1);
const before3 = await activeBox();
await resizeActive(90, 60);
const after3 = await page.evaluate(() => ({ mw: localStorage.getItem('modalWidth'), mh: localStorage.getItem('modalHeight') }));
const g3 = await geomRead();
ok(after3.mw === (before3.w + 90) + 'px' && after3.mh === (before3.h + 60) + 'px',
  `геометрия 3: в режим „Единична бележка" преоразмеряването пише дефолтния размер (${after3.mw}, ${after3.mh} срещу ${before3.w + 90}px, ${before3.h + 60}px)`,
  { before3, after3 });
ok(!!g3 && !!g3.raw['g:GG3'] && Math.abs(g3.raw['g:GG3'].w - (before3.w + 90)) <= 1 && Math.abs(g3.raw['g:GG3'].h - (before3.h + 60)) <= 1,
  `геометрия 3: и записът на бележката носи новия размер (${JSON.stringify(g3 && g3.raw['g:GG3'])})`, g3);

// (4) Преоразмеряване извън режима: дефолтният размер не се пипа, но се появява запис за бележката.
await closeActive();
await clearGeometryStorage();
await page.evaluate(() => { localStorage.setItem('modalWidth', '444px'); localStorage.setItem('modalHeight', '333px'); });
await openNote({ id: 'G4', gdid: 'GG4', boardId: 'B1', raw: 'геометрия 4' }, 1);
const before4 = await activeBox();
await resizeActive(-60, -40);
const after4 = await page.evaluate(() => ({ mw: localStorage.getItem('modalWidth'), mh: localStorage.getItem('modalHeight') }));
const g4 = await geomRead();
ok(after4.mw === '444px' && after4.mh === '333px',
  `геометрия 4: извън режима преоразмеряването не пипа дефолтния размер (${after4.mw}, ${after4.mh})`, { before4, after4 });
ok(!!g4 && !!g4.raw['g:GG4'] && Math.abs(g4.raw['g:GG4'].w - (before4.w - 60)) <= 1 && Math.abs(g4.raw['g:GG4'].h - (before4.h - 40)) <= 1,
  `геометрия 4: но за бележката има запис с новия размер (${JSON.stringify(g4 && g4.raw['g:GG4'])} срещу ${before4.w - 60}x${before4.h - 40})`, g4);

// (5) Бележка без запис: размерът идва от дефолтния (modalWidth/modalHeight).
await closeActive();
await clearGeometryStorage();
await page.evaluate(() => { localStorage.setItem('modalWidth', '520px'); localStorage.setItem('modalHeight', '360px'); });
await openNote({ id: 'G5', gdid: 'GG5', boardId: 'B1', raw: 'геометрия 5' }, 1);
const box5 = await activeBox();
ok(box5.w === 520 && box5.h === 360,
  `геометрия 5: бележка без запис се отваря с дефолтния размер (${box5.w}x${box5.h} срещу 520x360)`, box5);

// (6) Местенето създава запис и му дава най-големия номер на ред.
await closeActive();
await clearGeometryStorage();
await openNote({ id: 'G6', gdid: 'GG6', boardId: 'B1', raw: 'геометрия 6' }, 1);
const before6 = await activeBox();
await moveActive(70, 50);
const g6 = await geomRead();
const rec6 = g6 && g6.raw['g:GG6'];
ok(!!rec6 && Math.abs(rec6.x - (before6.left + 70)) <= 2 && Math.abs(rec6.y - (before6.top + 50)) <= 2
  && Number.isInteger(rec6.w) && Number.isInteger(rec6.h),
  `геометрия 6: местенето създава запис с новото място (${JSON.stringify(rec6)} срещу ${before6.left + 70},${before6.top + 50})`, g6);
ok(!!g6 && g6.v === 2 && !('order' in g6.dict) && g6.boxes === 1 && g6.seq === 1 && rec6 && rec6.o === 1,
  `геометрия 6: записът е във втория формат, с номер на реда в кутията и брояч 1 (${JSON.stringify(g6 && g6.dict)})`, g6);

// (7) „Ресет на позиции/размери": редът в Настройки и самото натискане.
// Речникът тук е v2 с два записа (единият е на бележката, която ще се отвори), за да се види, че
// ресетът го маха целия, а не оставя парче от него.
// Прозорецът се слага в ъгъла горе вляво, за да не покрива модала: Настройки се отваря от хедъра, а
// модалът и слоят на прозорците са на една и съща височина (1000), тоест кутия на прозорец върху
// модала би поела клика.
await closeActive();
await page.evaluate(() => {
  localStorage.setItem('noteWindowGeometry', JSON.stringify({
    v: 2, seq: 5,
    boxes: {
      'g:GR1': { x: 20, y: 20, w: 380, h: 260, o: 2 },
      'g:GR2': { x: 40, y: 40, w: 300, h: 200, o: 5 }
    }
  }));
  localStorage.setItem('modalWidth', '555px');
  localStorage.setItem('modalHeight', '355px');
});
await openNote({ id: 'RST1', gdid: 'GR1', boardId: 'B1', raw: 'преди ресета' }, 1);
const preReset = await activeBox();
// Настройките в проверката не са вдигнати: приложението ги строи след логин (startApp -> initApp +
// createSettingsUI). Прави се същото, за да е жив истинският слушател на бутона, а не копие в теста.
const wired = await page.evaluate(async () => {
  try {
    initApp();
    await createSettingsUI([], false);
    return { ok: true, fontOptions: document.getElementById('note-font-size-input').options.length };
  } catch (e) {
    return { ok: false, error: String(e.message).slice(0, 200) };
  }
});
ok(wired.ok && wired.fontOptions > 0,
  `ресет: Настройки са вдигнати както при старт (${JSON.stringify(wired)})`, wired);
// Както човек отваря Настройки: хедърният бутон. (Натискането на самия „Ресет" долу е истинска мишка.)
await page.evaluate(() => document.getElementById('settings_button').click());
// Модалът се отваря с анимация (scale 0.7 -> 1): мерките се вземат, след като улегне, иначе
// бутончето се мери смалено.
await page.waitForFunction(() => {
  const modal = document.getElementById('settings-modal');
  const box = modal && modal.querySelector('.modal-content-box');
  if (!modal || !box || !modal.classList.contains('visible') || !box.offsetWidth) return false;
  return Math.abs(box.getBoundingClientRect().width / box.offsetWidth - 1) < 0.002;
}, null, { timeout: 5000 }).catch(() => { });
const row = await page.evaluate(() => {
  const wrap = document.getElementById('reset-window-geometry');
  const btn = document.getElementById('reset-window-geometry-btn');
  const label = wrap ? wrap.querySelector('label') : null;
  const modal = document.getElementById('settings-modal');
  const box = modal.querySelector('.modal-content-box');
  const rb = btn.getBoundingClientRect();
  const bb = box.getBoundingClientRect();
  const cs = getComputedStyle(btn);
  const svg = btn.querySelector('svg');
  const sr = svg ? svg.getBoundingClientRect() : null;
  return {
    modalVisible: modal.classList.contains('visible'),
    hasRow: !!wrap,
    afterSingle: !!(wrap && wrap.previousElementSibling && wrap.previousElementSibling.id === 'single-note-mode'),
    labelText: label ? label.textContent.trim() : null,
    labelFor: label ? label.getAttribute('for') : null,
    expectedLabel: _('resetWindowGeometryLabel'),
    btnText: btn.textContent.trim(),
    expectedBtn: _('resetWindowGeometryBtn'),
    title: btn.title,
    ariaLabel: btn.getAttribute('aria-label'),
    hasIcon: !!svg,
    iconSize: sr ? [Math.round(sr.width), Math.round(sr.height)] : null,
    height: Math.round(rb.height), width: Math.round(rb.width),
    radius: cs.borderRadius, fontSize: cs.fontSize,
    bg: cs.backgroundColor, color: cs.color,
    border: cs.borderStyle + ' ' + cs.borderWidth,
    inside: rb.left >= bb.left - 0.5 && rb.right <= bb.right + 0.5 && rb.top >= bb.top - 0.5 && rb.bottom <= bb.bottom + 0.5,
    onScreen: rb.right <= window.innerWidth && rb.bottom <= window.innerHeight && rb.left >= 0,
  };
});
ok(row.modalVisible && row.hasRow && row.afterSingle,
  `ресет: редът стои точно след „Единична бележка" в Настройки (модал ${row.modalVisible}, след чекбокса ${row.afterSingle})`, row);
ok(row.expectedLabel && row.labelText === row.expectedLabel && row.labelFor === 'reset-window-geometry-btn',
  `ресет: надписът на реда идва от превода и сочи бутончето (${JSON.stringify([row.labelText, row.labelFor])})`, row);
// b1.11: бутончето губи надписа си - името от превода остава в title и aria-label, а вътре има икона.
ok(row.expectedBtn && row.btnText === '' && row.title === row.expectedBtn && row.ariaLabel === row.expectedBtn && row.hasIcon,
  `ресет: бутончето е без надпис, името от превода е в title и aria-label, вътре има икона (текст "${row.btnText}", title "${row.title}", aria "${row.ariaLabel}", икона ${row.hasIcon})`,
  row);
ok(row.width === 24 && row.height === 24 && row.radius === '4px' && row.bg === 'rgb(66, 133, 244)'
  && row.color === 'rgb(255, 255, 255)' && row.border === 'none 0px' && row.inside,
  `ресет: квадратно бутонче 24x24 с цвета на (+) и (−) от зума (${row.width}x${row.height}, фон ${row.bg}, радиус ${row.radius}, рамка ${row.border})`,
  row);
ok(!!row.iconSize && row.iconSize[0] >= 12 && row.iconSize[0] <= 16,
  `ресет: иконата е малка (${JSON.stringify(row.iconSize)})`, row);
// Чете ли се текстът на бутончето: то си носи собствен фон, тоест не зависи от фона на модала.
const contrastOf = async () => page.evaluate(() => {
  const cs = getComputedStyle(document.getElementById('reset-window-geometry-btn'));
  const lum = (c) => {
    const [r, g, b] = (c.match(/[\d.]+/g) || []).slice(0, 3).map(Number).map(v => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const l1 = lum(cs.color), l2 = lum(cs.backgroundColor);
  return { color: cs.color, bg: cs.backgroundColor, ratio: (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05) };
});
const contrastLight = await contrastOf();
ok(contrastLight.ratio >= 3,
  `ресет: бялата икона се чете върху синьото (контраст ${contrastLight.ratio.toFixed(2)}:1 при праг 3:1 за икона, ${contrastLight.color} върху ${contrastLight.bg})`, contrastLight);

// Снимки: редът в светла тема, същият ред върху тъмен фон (приложението няма тъмна тема, затова
// фонът се налага с листче стилове: важното е бутончето да си остане четимо и там) и екран след ресета.
await page.locator('#reset-window-geometry').scrollIntoViewIfNeeded().catch(() => { });
await shot('geometry-reset-row');
const darkSheet = await page.addStyleTag({
  content: '#settings-modal .modal-content-box{background:linear-gradient(135deg,#2b2b2b,#171717)!important;}'
    + '#settings-modal .modal-content-box h2,#settings-modal .modal-content-box h3,'
    + '#settings-modal .zoom-control-wrapper label,#settings-modal .zoom-control-wrapper{color:#f2f2f2!important;}'
});
const contrastDark = await contrastOf();
await shot('geometry-reset-row-dark');
ok(contrastDark.ratio >= 3 && contrastDark.bg === contrastLight.bg,
  `ресет: на тъмен фон бутончето си остава същото и четимо (контраст ${contrastDark.ratio.toFixed(2)}:1, фон ${contrastDark.bg})`, { contrastLight, contrastDark });
await darkSheet.evaluate(el => el.remove());

const beforeReset = await geomRaw();
await page.locator('#reset-window-geometry-btn').scrollIntoViewIfNeeded();
await page.locator('#reset-window-geometry-btn').click();
await page.waitForFunction(() => {
  const t = document.getElementById('toastNotification');
  return t && t.classList.contains('show') && (t.textContent || '').trim().length > 0;
}, null, { timeout: 3000 }).catch(() => { });
const afterReset = await page.evaluate(() => {
  const t = document.getElementById('toastNotification');
  return {
    raw: localStorage.getItem('noteWindowGeometry'),
    mw: localStorage.getItem('modalWidth'), mh: localStorage.getItem('modalHeight'),
    toast: { text: (t.textContent || '').trim(), shown: t.classList.contains('show') },
    openNow: getOpenNoteWindows().length,
  };
});
ok(!!beforeReset && afterReset.raw === null,
  `ресет: натискането изтрива записите от паметта (${String(beforeReset).slice(0, 60)} -> ${afterReset.raw})`, afterReset);
ok(afterReset.mw === '555px' && afterReset.mh === '355px',
  `ресет: дефолтният размер не се пипа (${afterReset.mw}, ${afterReset.mh})`, afterReset);
ok(afterReset.toast.shown && afterReset.toast.text.length > 0,
  `ресет: показва се съобщението „${afterReset.toast.text}"`, afterReset);
await shot('geometry-after-reset');
// Отвореният преди ресета прозорец остава там, където е, и при затваряне не си създава запис наново.
const postResetBox = await activeBox();
await closeActive();
const finalGeom = await geomRead();
ok(postResetBox.left === preReset.left && postResetBox.top === preReset.top
  && postResetBox.w === preReset.w && postResetBox.h === preReset.h,
  `ресет: отвореният прозорец не мърда (${postResetBox.left},${postResetBox.top} ${postResetBox.w}x${postResetBox.h})`,
  { preReset, postResetBox });
ok(finalGeom === null,
  `ресет: затварянето след ресета не създава нов запис (${JSON.stringify(finalGeom)})`, finalGeom);
// Настройки се затварят, за да не остане отворен модал за следните проверки.
await page.evaluate(() => document.getElementById('settings-modal').classList.remove('visible'));

// (7б) След ресета на v2 речник (горе): не бива да остане нито ключ, нито празен речник. Липсващ
// ключ и празен речник значат едно и също - „няма записи", тоест бележките сядат на подразбиращото
// се място.
const afterResetKey = await page.evaluate(() => {
  const raw = localStorage.getItem('noteWindowGeometry');
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { }
  return { raw, parsed };
});
ok(afterResetKey.raw === null && !afterResetKey.parsed,
  `ресет при v2 речник: ключът изчезва целият (${String(afterResetKey.raw)})`, afterResetKey);
await openNote({ id: 'AFTER1', gdid: 'GAFTER1', boardId: 'B1', raw: 'след ресета' }, 1);
const freshAfterReset = await page.evaluate(() => {
  const r = activeNoteWindow.box.getBoundingClientRect();
  return { left: Math.round(r.left), top: Math.round(r.top), geom: localStorage.getItem('noteWindowGeometry') };
});
ok((freshAfterReset.left !== 20 || freshAfterReset.top !== 20) && freshAfterReset.geom === null,
  `ресет: бележка се отваря на подразбиращото се място, не на стария запис (20,20), и не си създава запис (${freshAfterReset.left},${freshAfterReset.top})`,
  freshAfterReset);
await moveActive(60, 40);
const afterResetMove = await geomRead();
const afterResetRec = afterResetMove && afterResetMove.raw['g:GAFTER1'];
ok(!!afterResetMove && afterResetMove.v === 2 && !('order' in afterResetMove.dict) && afterResetMove.seq === 1
  && !!afterResetRec && afterResetRec.o === 1 && Number.isInteger(afterResetRec.x) && Number.isInteger(afterResetRec.y)
  && Number.isInteger(afterResetRec.w) && Number.isInteger(afterResetRec.h),
  `ресет при v2 -> първо местене: нов речник v2 с номер на реда и брояч 1 (${JSON.stringify(afterResetMove && afterResetMove.dict)})`,
  afterResetMove);

// (7в) Същото с втори v2 речник: този път бележките от него не са отворени, тоест ресетът не бива да
// оставя половин речник и когато няма отворен прозорец, който да го оправдае.
await closeActive();
await page.evaluate(() => {
  localStorage.setItem('noteWindowGeometry', JSON.stringify({
    v: 2, seq: 9,
    boxes: { 'g:GNV1': { x: 30, y: 30, w: 380, h: 260, o: 3 }, 'g:GNV2': { x: 50, y: 50, w: 300, h: 200, o: 9 } }
  }));
  document.getElementById('settings_button').click();
});
await page.waitForFunction(() => {
  const modal = document.getElementById('settings-modal');
  return !!modal && modal.classList.contains('visible');
}, null, { timeout: 5000 }).catch(() => { });
await page.locator('#reset-window-geometry-btn').click();
await page.waitForFunction(() => localStorage.getItem('noteWindowGeometry') === null, null, { timeout: 3000 }).catch(() => { });
const afterNewReset = await page.evaluate(() => {
  const raw = localStorage.getItem('noteWindowGeometry');
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { }
  return { raw, parsed };
});
ok(afterNewReset.raw === null && !afterNewReset.parsed,
  `ресет при втори v2 речник: ключът изчезва целият (${String(afterNewReset.raw)})`, afterNewReset);
await page.evaluate(() => document.getElementById('settings-modal').classList.remove('visible'));
await openNote({ id: 'AFTER2', gdid: 'GAFTER2', boardId: 'B1', raw: 'след ресета 2' }, 1);
await moveActive(40, 30);
const afterNewMove = await geomRead();
const afterNewRec = afterNewMove && afterNewMove.raw['g:GAFTER2'];
ok(!!afterNewMove && afterNewMove.v === 2 && afterNewMove.seq === 1 && afterNewMove.boxes === 1
  && !!afterNewRec && afterNewRec.o === 1,
  `ресет при v2 -> първо местене: пак v2 с брояч 1 и един запис (${JSON.stringify(afterNewMove && afterNewMove.dict)})`,
  afterNewMove);
await closeActive();

// (8) Езиковите низове: двата нови ключа ги има и в трите файла, с непразни стойности.
const langFiles = ['lang/i18n-bg.json', 'lang/i18n-en.json', 'lang/i18n-ru.json'];
const langState = {};
for (const f of langFiles) {
  try {
    const json = JSON.parse(await readFile(path.join(root, f), 'utf8'));
    langState[f] = { label: json.resetWindowGeometryLabel, btn: json.resetWindowGeometryBtn };
  } catch (e) { langState[f] = { error: String(e.message).slice(0, 80) }; }
}
const langOk = (st) => !!st && typeof st.label === 'string' && st.label.trim().length > 0
  && typeof st.btn === 'string' && st.btn.trim().length > 0;
ok(langFiles.every(f => langOk(langState[f])),
  `езици: двата нови ключа са налице в трите файла (${JSON.stringify(langState)})`, langState);
ok(langOk(langState['lang/i18n-bg.json']) && langState['lang/i18n-bg.json'].label === 'Ресет на позиции/размери:'
  && langOk(langState['lang/i18n-en.json']) && langState['lang/i18n-en.json'].label === 'Reset positions/sizes:'
  && langOk(langState['lang/i18n-ru.json']) && langState['lang/i18n-ru.json'].label === 'Сброс позиций/размеров:',
  'езици: надписите са точно поисканите (bg / en / ru)', langState);

// ======================= 10б. seq расте само при истинска промяна (b1.46) =======================
// Собственикът (25.10.2026): броячът seq се вдига и когато бележка не е местена и не е преоразмерявана,
// тоест когато не би трябвало да има нов запис. Правилото, което се проверява тук: отваряне,
// затваряне, пре-рисуване и разпъване/свиване до състояние, което вече е записано, не пишат нищо и не
// вдигат seq; истинско местене, преоразмеряване или смяна на режима вдигат seq точно с 1.
// Записът се сравнява поле по поле, за да не зависи проверката от реда на ключовете в JSON-а.
const recIs = (rec, exp) => !!rec
  && ['x', 'y', 'w', 'h'].every(f => typeof rec[f] === 'number' && Math.abs(rec[f] - exp[f]) <= 1)
  && (rec.e === true) === (exp.e === true);
const recBrief = (rec) => rec ? { x: rec.x, y: rec.y, w: rec.w, h: rec.h, e: rec.e === true, o: rec.o } : null;
// Истински клик с мишка върху елемент по селектор (бутонът за разпъване живее в активния прозорец).
const clickSel = async (sel) => {
  const r = await rectOf(sel);
  if (!r) return false;
  await page.mouse.click(Math.round(r.x), Math.round(r.y));
  await page.waitForTimeout(250);
  return true;
};
const seedGeometry = (store) => page.evaluate((s) => localStorage.setItem('noteWindowGeometry', JSON.stringify(s)), store);

await closeAllWindows();
await clearGeometryStorage();

// (1) Бележка, записана като разпъната: отваряне и затваряне не пипат нито seq, нито записа. Преди
// поправката всяко отваряне на такава бележка пишеше идентичен запис (setNoteWindowExpanded(win, true)
// при прилагането на геометрията) и вдигаше seq с 1, без никой да е пипал нищо.
const seedExp = { v: 2, seq: 8, boxes: { 'g:GEXP': { x: 140, y: 100, w: 520, h: 360, o: 7, e: true } } };
await seedGeometry(seedExp);
const openedExp = await openNote({ id: 'EXP', gdid: 'GEXP', boardId: 'B1', raw: 'разпъната със запис' }, 1);
const expBox = await page.evaluate(() => {
  const w = activeNoteWindow;
  return { expanded: !!w.expanded, left: Math.round(w.box.offsetLeft), top: Math.round(w.box.offsetTop), restore: w.restoreBox };
});
const expAfterOpen = await geomRead();
ok(expBox.expanded === true && expBox.left === 0 && expBox.top === 0,
  `seq 1: бележка, записана като разпъната, се отваря разпъната (${expBox.left},${expBox.top}, разпъната ${expBox.expanded})`, expBox);
ok(!!expAfterOpen && expAfterOpen.seq === 8 && recIs(expAfterOpen.raw['g:GEXP'], seedExp.boxes['g:GEXP']),
  `seq 1: отварянето на разпъната бележка не вдига брояча (seq ${expAfterOpen && expAfterOpen.seq} срещу 8, запис ${JSON.stringify(recBrief(expAfterOpen && expAfterOpen.raw['g:GEXP']))})`,
  { after: expAfterOpen && expAfterOpen.dict, seed: seedExp });
await closeActive();
const expAfterClose = await geomRead();
ok(!!expAfterClose && expAfterClose.seq === 8 && recIs(expAfterClose.raw['g:GEXP'], seedExp.boxes['g:GEXP'])
  && expAfterClose.boxes === 1 && expAfterClose.raw['g:GEXP'].o === 7,
  `seq 1: затварянето ѝ също не пипа нито брояча, нито записа (seq ${expAfterClose && expAfterClose.seq}, запис ${JSON.stringify(recBrief(expAfterClose && expAfterClose.raw['g:GEXP']))})`,
  { after: expAfterClose && expAfterClose.dict, seed: seedExp });

// (2) Бележка БЕЗ запис: отваряне и затваряне не създават запис и не вдигат seq. Прозорецът тук е
// току-що ползваният от разпънатата бележка горе (след затваряне той остава като празен и се ползва
// наново): преди поправката новата бележка наследяваше разпъването и кутията за връщане на старата и
// си създаваше запис още при отваряне. Мери се и дали измерената при затваряне кутия се разминава с
// поставената при отваряне - тя би била причината, ако запис все пак се появи.
await clearGeometryStorage();
const openedFresh = await openNote({ id: 'FRSH', gdid: 'GFRESH', boardId: 'B1', raw: 'без запис' }, 1);
ok(openedFresh.geom === null,
  `seq 2: бележка без запис се отваря без да си създава запис (${JSON.stringify(openedFresh.geom)})`, openedFresh.geom);
const freshProbe = await page.evaluate(() => {
  const w = activeNoteWindow;
  return { now: measureNoteWindowBox(w), expanded: !!w.expanded, dirty: !!w.geomDirty };
});
await closeActive();
const freshAfterClose = await geomRead();
ok(freshAfterClose === null,
  `seq 2: и затварянето не създава запис (${JSON.stringify(freshAfterClose && freshAfterClose.dict)}), измерена ${JSON.stringify(freshProbe.now)}, флаг ${freshProbe.dirty}`,
  { after: freshAfterClose && freshAfterClose.dict, probe: freshProbe });

// (3) Истинско местене с мишката: seq расте точно с 1 и записът е новата кутия.
const seedMove = { v: 2, seq: 12, boxes: { 'g:GMOVE': { x: 200, y: 150, w: 480, h: 340, o: 11 } } };
await seedGeometry(seedMove);
const openedMove = await openNote({ id: 'MOVE', gdid: 'GMOVE', boardId: 'B1', raw: 'за местене' }, 1);
const moveBefore = await geomRead();
const moveBox0 = await activeBox();
await moveActive(70, 50);
const moveAfter = await geomRead();
const movedTo = moveAfter && moveAfter.raw['g:GMOVE'];
ok(moveBefore && moveBefore.seq === 12 && recIs(moveBefore.raw['g:GMOVE'], seedMove.boxes['g:GMOVE']),
  `seq 3: отваряне на бележка със запис не вдига брояча (seq ${moveBefore && moveBefore.seq} срещу 12)`,
  { before: moveBefore && moveBefore.dict, seed: seedMove });
ok(!!moveAfter && moveAfter.seq === 13,
  `seq 3: местенето вдига брояча точно с 1 (seq ${moveBefore && moveBefore.seq} -> ${moveAfter && moveAfter.seq})`,
  { before: moveBefore && moveBefore.dict, after: moveAfter && moveAfter.dict });
ok(!!movedTo && Math.abs(movedTo.x - (moveBox0.left + 70)) <= 2 && Math.abs(movedTo.y - (moveBox0.top + 50)) <= 2,
  `seq 3: записът е новата кутия (${JSON.stringify(recBrief(movedTo))} срещу ${moveBox0.left + 70},${moveBox0.top + 50})`,
  { movedTo, moveBox0 });
// Пре-рисуване на същата бележка в същия прозорец: не е пипане, нищо не се пише.
await openNote({ id: 'MOVE', gdid: 'GMOVE', boardId: 'B1', raw: 'за местене' }, 1);
const afterRedraw = await geomRead();
ok(!!afterRedraw && afterRedraw.seq === 13,
  `seq 3: пре-рисуването на бележката не вдига брояча (seq ${afterRedraw && afterRedraw.seq})`,
  afterRedraw && afterRedraw.dict);
await closeActive();
const moveAfterClose = await geomRead();
ok(!!moveAfterClose && moveAfterClose.seq === 13 && recIs(moveAfterClose.raw['g:GMOVE'], movedTo),
  `seq 3: затварянето след местенето не вдига брояча пак (seq ${moveAfterClose && moveAfterClose.seq})`,
  moveAfterClose && moveAfterClose.dict);

// (4) Разпъване и връщане: e се слага и маха правилно, а seq расте само на истинските смени на режима.
await seedGeometry(seedMove);
await openNote({ id: 'MOVE', gdid: 'GMOVE', boardId: 'B1', raw: 'за местене' }, 1);
const beforeExpSeq = await geomRead();
const boxQuad = await activeBox();
// activeBox дава left/top, а записът - x/y: сравнява се едно и също.
const quadRec = { x: boxQuad.left, y: boxQuad.top, w: boxQuad.w, h: boxQuad.h, e: true };
const quadBack = { x: boxQuad.left, y: boxQuad.top, w: boxQuad.w, h: boxQuad.h };
await clickSel('#modal-expand-btn');
const afterExpand = await geomRead();
const expRec = afterExpand && afterExpand.raw['g:GMOVE'];
ok(!!expRec && expRec.e === true && recIs(expRec, quadRec),
  `seq 4: разпъването слага e: true и пази кутията за връщане (${JSON.stringify(recBrief(expRec))} срещу ${boxQuad.left},${boxQuad.top} ${boxQuad.w}x${boxQuad.h})`,
  { expRec, boxQuad });
ok(!!afterExpand && afterExpand.seq === 13,
  `seq 4: разпъването е истинска смяна и вдига брояча с 1 (seq ${beforeExpSeq && beforeExpSeq.seq} -> ${afterExpand && afterExpand.seq})`,
  { before: beforeExpSeq && beforeExpSeq.dict, after: afterExpand && afterExpand.dict });
// Пре-рисуване, докато бележката е разпъната: режимът се подсигурява, но нищо не се записва.
await openNote({ id: 'MOVE', gdid: 'GMOVE', boardId: 'B1', raw: 'за местене' }, 1);
const redrawExpanded = await geomRead();
ok(!!redrawExpanded && redrawExpanded.seq === 13,
  `seq 4: пре-рисуването на разпъната бележка не вдига брояча (seq ${redrawExpanded && redrawExpanded.seq})`,
  redrawExpanded && redrawExpanded.dict);
await clickSel('#modal-expand-btn');
const afterCollapse = await geomRead();
const backRec = afterCollapse && afterCollapse.raw['g:GMOVE'];
ok(!!backRec && backRec.e !== true && recIs(backRec, quadBack),
  `seq 4: свиването маха e и връща същата кутия (${JSON.stringify(recBrief(backRec))})`, backRec);
ok(!!afterCollapse && afterCollapse.seq === 14,
  `seq 4: свиването също е истинска смяна, броячът става 14 (${afterCollapse && afterCollapse.seq})`,
  afterCollapse && afterCollapse.dict);
// Още един цикъл „отваряне/затваряне без пипане" върху записа, който вече няма e: нищо не се пише.
await closeActive();
const afterExpCycleClose = await geomRead();
ok(!!afterExpCycleClose && afterExpCycleClose.seq === 14 && recIs(afterExpCycleClose.raw['g:GMOVE'], quadBack),
  `seq 4: затварянето след цикъла пак не вдига брояча (seq ${afterExpCycleClose && afterExpCycleClose.seq})`,
  afterExpCycleClose && afterExpCycleClose.dict);

// (4б) Натискане по дръжката за размер без местене не е преоразмеряване: не пише нищо и не вдига seq.
await seedGeometry(seedMove);
await openNote({ id: 'MOVE', gdid: 'GMOVE', boardId: 'B1', raw: 'за местене' }, 1);
const handleAt = await page.evaluate(() => {
  const h = activeNoteWindow.box.querySelector('.modal-resize-handle');
  const r = h.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});
await page.mouse.move(handleAt.x, handleAt.y);
await page.mouse.down();
await page.mouse.up();
await page.waitForTimeout(120);
const afterHandleClick = await geomRead();
ok(!!afterHandleClick && afterHandleClick.seq === 12 && recIs(afterHandleClick.raw['g:GMOVE'], seedMove.boxes['g:GMOVE']),
  `seq 4б: натискане по дръжката без местене не пише и не вдига брояча (seq ${afterHandleClick && afterHandleClick.seq})`,
  afterHandleClick && afterHandleClick.dict);
// А истинско преоразмеряване вдига брояча с 1.
await resizeActive(60, 40);
const afterResize = await geomRead();
const resizedRec = afterResize && afterResize.raw['g:GMOVE'];
ok(!!afterResize && afterResize.seq === 13 && !!resizedRec && Math.abs(resizedRec.w - 540) <= 2 && Math.abs(resizedRec.h - 380) <= 2,
  `seq 4б: преоразмеряването вдига брояча с 1 и записва новия размер (seq ${afterResize && afterResize.seq}, ${JSON.stringify(recBrief(resizedRec))})`,
  { after: afterResize && afterResize.dict });
await closeActive();

// (5) „Ресет на позиции/размери" от Настройки пак трие всичко - и когато отворената бележка е разпъната.
await seedGeometry(seedExp);
await openNote({ id: 'EXP', gdid: 'GEXP', boardId: 'B1', raw: 'разпъната преди ресета' }, 1);
await page.evaluate(() => document.getElementById('settings_button').click());
await page.waitForFunction(() => {
  const m = document.getElementById('settings-modal');
  return !!m && m.classList.contains('visible');
}, null, { timeout: 5000 }).catch(() => { });
await page.locator('#reset-window-geometry-btn').click();
await page.waitForFunction(() => localStorage.getItem('noteWindowGeometry') === null, null, { timeout: 3000 }).catch(() => { });
const resetState = await page.evaluate(() => ({
  raw: localStorage.getItem('noteWindowGeometry'),
  expanded: getOpenNoteWindows().map(w => ({ key: w.key, expanded: !!w.expanded })),
}));
ok(resetState.raw === null && resetState.expanded.every(w => w.expanded === false),
  `seq 5: ресетът трие всичко и излиза от разпънатия режим (${String(resetState.raw)}, ${JSON.stringify(resetState.expanded)})`,
  resetState);
await page.evaluate(() => document.getElementById('settings-modal').classList.remove('visible'));
await closeActive();
const afterResetClose = await geomRead();
ok(afterResetClose === null,
  `seq 5: затварянето след ресета не си създава запис наново (${JSON.stringify(afterResetClose && afterResetClose.dict)})`,
  afterResetClose);

// ======================= 11. Петте поправки от собственика (b1.11) =======================
// (а) „Затвори всички" и хиксчето са една дясна група, едно до друго, и двете извън плъзгащия се ред;
// (б) името на борда се вижда ВИНАГИ (и при съвпадащ филтър), най-ляво, с многоточие;
// (в) стрелките обхождат прозорците от два нагоре със зацикляне - проверено в раздел 9;
// (г) ресет бутончето е квадратно, без надпис, с цвета на (+) и (−);
// (д) потвърждението при изтриване излиза НАД бележките.
// Снимките се пишат на фиксирани имена в .bolter/check/, за да се гледат без променливи.
const FIXED_SHOT = (name) => path.resolve('.bolter/check', name);
// Прозорците се показват с преход (scale 0.7 -> 1): мерките се вземат, след като улегне.
const settleWindows = () => page.evaluate(async () => {
  const open = getOpenNoteWindows();
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (open.every(w => w.box.offsetWidth > 0
      && Math.abs(w.box.getBoundingClientRect().width / w.box.offsetWidth - 1) < 0.0005)) return true;
    await new Promise(res => requestAnimationFrame(res));
  }
  return false;
});

await closeAllWindows();
await page.evaluate(() => { window.scrollTo(0, 0); filterNotesByBoard('B1'); });

// --- (а) Дясната група: три отворени прозореца, 460px всеки ---
for (const i of [1, 2, 3]) await openNote({ id: 'H' + i, gdid: 'GH' + i, boardId: 'B1', raw: 'хедър ' + i }, i);
await page.evaluate(() => { getOpenNoteWindows().forEach(w => { w.box.style.width = '460px'; }); });
await settleWindows();
const hdr = await page.evaluate(() => getOpenNoteWindows().map(w => {
  const btn = w.closeAllBtn;
  const xBtn = w.box.querySelector('.modal-close');
  const group = w.box.querySelector('.note-header-close-group');
  const nameEl = w.box.querySelector('#modal-board-name, .nw-modal-board-name');
  const br = w.box.getBoundingClientRect();
  const r = btn.getBoundingClientRect();
  const xr = xBtn.getBoundingClientRect();
  const gr = group ? group.getBoundingClientRect() : null;
  const nr = nameEl ? nameEl.getBoundingClientRect() : null;
  const rr = w.box.querySelector('.note-header-buttons').getBoundingClientRect();
  return {
    text: (w.body.textContent || '').trim(),
    closeAllShown: !btn.hidden && getComputedStyle(btn).display === 'flex',
    inGroup: !!(group && btn.parentElement === group),
    closeAll: { l: r.left, r: r.right, t: r.top, b: r.bottom },
    x: { l: xr.left, r: xr.right, t: xr.top, b: xr.bottom },
    group: gr ? { l: gr.left, r: gr.right, t: gr.top, b: gr.bottom } : null,
    name: nr ? { l: nr.left, r: nr.right, text: nameEl.textContent.trim(), display: getComputedStyle(nameEl).display } : null,
    row: { l: rr.left, r: rr.right },
    box: { l: br.left, r: br.right, t: br.top, b: br.bottom },
  };
}));
const inBox = (b, box) => b.l >= box.l - 0.5 && b.r <= box.r + 0.5 && b.t >= box.t - 0.5 && b.b <= box.b + 0.5;
const hdrOk = hdr.filter(w => w.closeAllShown && w.inGroup && inBox(w.closeAll, w.box) && inBox(w.x, w.box)
  && w.closeAll.r <= w.x.l + 0.5 && Math.abs((w.closeAll.t + w.closeAll.b) / 2 - (w.x.t + w.x.b) / 2) <= 1
  && w.group && w.group.r <= w.box.r + 0.5 && w.group.l >= w.row.r - 0.5);
ok(hdr.length === 3 && hdrOk.length === 3,
  `хедър при 3 прозоръца: „Затвори всички" и хиксчето са в една дясна група, едно до друго, изцяло в кутията (${JSON.stringify(hdr.map(w => [Math.round(w.closeAll.r), Math.round(w.x.l), Math.round(w.box.r)]))})`,
  { hdr });

// Снимки на хедъра в светла и тъмна тема (приложението няма тъмна тема, затова тук фонът на прозорците
// се налага с листче стилове - важното е лентата да се чете и на тъмно).
const headerClip = await page.evaluate(() => {
  const r = activeNoteWindow.box.getBoundingClientRect();
  return {
    x: Math.max(0, Math.round(r.left + window.scrollX - 6)),
    y: Math.max(0, Math.round(r.top + window.scrollY - 6)),
    width: Math.round(r.width + 12),
    height: Math.round(Math.min(86, r.height + 6)),
  };
});
await page.screenshot({ path: FIXED_SHOT('multinotes-hdr-light.png'), clip: headerClip });
const darkHdrSheet = await page.addStyleTag({
  content: '.note-window .modal-content-box{background:#1c1c1c!important;background-image:none!important;}'
    + '.note-window .modal-content-box :is(#modal-board-name,.nw-modal-board-name){color:#f2f2f2!important;}'
    + '.note-window .modal-header-btn,.note-window .note-window-bar-btn{color:#f2f2f2!important;border-color:#9a9a9a!important;}'
    + '.note-window .note-header-buttons svg,.note-window .modal-header-btn svg{stroke:#f2f2f2!important;}'
    + '.note-window :is(#modal-body,.nw-modal-body){color:#e6e6e6!important;}'
});
await page.screenshot({ path: FIXED_SHOT('multinotes-hdr-dark.png'), clip: headerClip });
await darkHdrSheet.evaluate(el => el.remove());

// --- (б) Името на борда: винаги, най-ляво, с многоточие при дълго име ---
// Филтърът е СЪЩИЯТ борд - точно случаят, в който преди името се криеше.
const longBoardName = 'Много дълго име на борд за проверка на многоточието';
await page.evaluate((t) => {
  const b = boardsData.find(b => b.gdid === 'B1');
  if (b) b.title = t;
  showModal({ raw: 'хедър 1', format: null, id: 'H1', gdid: 'GH1', boardId: 'B1' });
  activeNoteWindow.box.style.width = '380px';
}, longBoardName);
await settleWindows();
const nameState = await page.evaluate(() => {
  const w = activeNoteWindow;
  const el = w.box.querySelector('#modal-board-name, .nw-modal-board-name');
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const row = w.box.querySelector('.note-header-buttons').getBoundingClientRect();
  const group = w.box.querySelector('.note-header-close-group').getBoundingClientRect();
  return {
    filter: currentBoardFilter,
    text: el.textContent.trim(),
    display: cs.display, cursor: cs.cursor, title: el.title,
    goToBoard: _('goToBoard'),
    left: r.left, right: r.right,
    scrollWidth: el.scrollWidth, clientWidth: el.clientWidth,
    textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace,
    row: { l: row.left, r: row.right }, group: { l: group.left, r: group.right },
    boxWidth: Math.round(parseFloat(getComputedStyle(w.box).width)),
  };
});
ok(nameState.filter === 'B1' && nameState.display !== 'none' && nameState.text === longBoardName,
  `име на борда: вижда се в хедъра на отворена бележка и когато филтърът е СЪЩИЯТ борд (филтър ${nameState.filter}, "${nameState.text}")`,
  nameState);
ok(nameState.left < nameState.row.l + 0.5 && nameState.left < nameState.group.l
  && nameState.right <= nameState.row.l + 0.5 && nameState.right <= nameState.group.l - 8,
  `име на борда: стои най-ляво в лентата и не застъпва бутоните (име до ${Math.round(nameState.right)}, ред от ${Math.round(nameState.row.l)}, група от ${Math.round(nameState.group.l)})`,
  nameState);
ok(nameState.scrollWidth > nameState.clientWidth + 1 && nameState.textOverflow === 'ellipsis'
  && nameState.whiteSpace === 'nowrap',
  `име на борда: при дълго име се реже с многоточие (scrollWidth ${nameState.scrollWidth} > clientWidth ${nameState.clientWidth}, ${nameState.textOverflow})`,
  nameState);
ok(nameState.cursor === 'pointer' && nameState.title === nameState.goToBoard,
  `име на борда: кликът върху него продължава да превключва борда (cursor ${nameState.cursor}, title "${nameState.title}")`,
  nameState);
// Връщаме късото име, за да не влиза в следващите раздели.
await page.evaluate(() => {
  const b = boardsData.find(b => b.gdid === 'B1');
  if (b) b.title = 'Работа';
  activeNoteWindow.box.style.width = '420px';
});

// --- (д) Потвърждението при изтриване е НАД бележките ---
await closeAllWindows();
for (const i of [1, 2, 3]) await openNote({ id: 'D' + i, gdid: 'GD' + i, boardId: 'B1', raw: 'изтриване ' + i }, i);
await page.evaluate(() => {
  window.__confResult = null;
  // Истинската функция, която пита при изтриване (handleNoteDelete -> showConfirmation).
  showConfirmation('Сигурни ли сте, че искате да изтриете бележката?').then(v => { window.__confResult = v; });
});
await page.waitForFunction(() => document.getElementById('folderIdPromptPopup').classList.contains('show'), null, { timeout: 3000 }).catch(() => { });
const conf = await page.evaluate(() => {
  const popup = document.getElementById('folderIdPromptPopup');
  const content = popup.querySelector('.popup-content');
  const okBtn = document.getElementById('submitFolderIdBtn');
  const cr = content.getBoundingClientRect();
  const orr = okBtn.getBoundingClientRect();
  const centre = { x: Math.round(orr.left + orr.width / 2), y: Math.round(orr.top + orr.height / 2) };
  const hit = document.elementFromPoint(centre.x, centre.y);
  const zPopup = Number(getComputedStyle(popup).zIndex) || 0;
  const wins = getOpenNoteWindows().map(w => {
    const r = w.box.getBoundingClientRect();
    return { text: (w.body.textContent || '').trim(), z: Number(w.el.style.zIndex) || 0, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  });
  return {
    shows: popup.classList.contains('show'),
    zPopup, wins, centre,
    content: { left: cr.left, right: cr.right, top: cr.top, bottom: cr.bottom },
    hitTag: hit ? hit.tagName : null, hitId: hit ? (hit.id || '') : null,
    hitIsOk: !!hit && (hit === okBtn || okBtn.contains(hit)),
    // Попъпът е цял екран и на по-висок слой от прозорците: покрива ги.
    coversWindows: wins.every(w => cr.right > w.left && cr.left < w.right && cr.bottom > w.top && cr.top < w.bottom),
  };
});
ok(conf.shows && conf.wins.length === 3 && conf.zPopup > Math.max(...conf.wins.map(w => w.z)) && conf.coversWindows,
  `потвърждение: при 3 отворени прозоръца излиза над тях (z ${conf.zPopup} срещу ${conf.wins.map(w => w.z).join('/')}, покрива и трите ${conf.coversWindows})`,
  conf);
ok(conf.hitIsOk,
  `потвърждение: в центъра на OK е самият бутон, не прозорец отдолу (${conf.hitTag}#${conf.hitId})`, conf);
await page.mouse.click(conf.centre.x, conf.centre.y);
const confDone = await page.waitForFunction(() => window.__confResult !== null, null, { timeout: 3000 })
  .then(() => page.evaluate(() => ({ result: window.__confResult, shown: document.getElementById('folderIdPromptPopup').classList.contains('show') })))
  .catch(() => ({ result: 'timeout', shown: null }));
ok(confDone.result === true && confDone.shown === false,
  `потвърждение: OK се натиска над бележките, потвърждението се затваря (${JSON.stringify(confDone)})`, confDone);

// --- (г) Ресет бутончето: снимки на реда в светла и тъмна тема ---
await page.evaluate(() => document.getElementById('settings_button').click());
await page.waitForFunction(() => {
  const modal = document.getElementById('settings-modal');
  const box = modal && modal.querySelector('.modal-content-box');
  if (!modal || !box || !modal.classList.contains('visible') || !box.offsetWidth) return false;
  return Math.abs(box.getBoundingClientRect().width / box.offsetWidth - 1) < 0.002;
}, null, { timeout: 5000 }).catch(() => { });
await page.locator('#reset-window-geometry').scrollIntoViewIfNeeded().catch(() => { });
await page.locator('#reset-window-geometry').screenshot({ path: FIXED_SHOT('multinotes-reset-light.png') }).catch(() => { });
const darkResetSheet = await page.addStyleTag({
  content: '#settings-modal .modal-content-box{background:linear-gradient(135deg,#2b2b2b,#171717)!important;}'
    + '#settings-modal .modal-content-box h2,#settings-modal .modal-content-box h3,'
    + '#settings-modal .zoom-control-wrapper label,#settings-modal .zoom-control-wrapper{color:#f2f2f2!important;}',
});
await page.locator('#reset-window-geometry').screenshot({ path: FIXED_SHOT('multinotes-reset-dark.png') }).catch(() => { });
await darkResetSheet.evaluate(el => el.remove());
await page.evaluate(() => document.getElementById('settings-modal').classList.remove('visible'));
await closeAllWindows();

// ======================= 7b. Езиковата смяна съществува в този HTML =======================
// main.js пълни .lang-switcher-container. При подменен HTML (index-2.html, копиран от multinotes)
// контейнерът липсваше и изборът на език изчезваше, без нито една грешка в конзолата.
await page.evaluate(() => document.getElementById('settings_button').click());
await page.waitForTimeout(300);
const langUi = await page.evaluate(() => {
  const conts = [...document.querySelectorAll('.lang-switcher-container')];
  const sels = conts.map(c => c.querySelector('select.lang-select')).filter(Boolean);
  const sel = sels[0];
  return {
    containers: conts.length,
    selects: sels.length,
    options: sel ? [...sel.options].map(o => o.value) : [],
  };
});
ok(langUi.selects > 0 && langUi.options.length >= 3,
  `езиковата смяна е налична: контейнерът съдържа select с ${langUi.options.length} езика (${JSON.stringify(langUi.options)})`, langUi);
await page.evaluate(() => document.getElementById('settings-modal').classList.remove('visible'));

// ======================= 8. Никакви грешки =======================
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);
if (fails) {
  console.log('състояние: ' + JSON.stringify(await read(), null, 1).slice(0, 2000));
}

await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
