// Много бележки едновременно + „Единична бележка" (main).
// Проверява порта от cx-notes върху uni/main.js + uni/index-2.html:
//   - две (и повече) бележки се отварят в свои прозорци и всичките се виждат;
//   - само активният прозорец носи истинските id-та (#content-modal, #modal-body), другите ги
//     пазят като data-mwid + .nw-modal-body - смяната на активния ги разменя;
//   - плъзгането мести прозореца и мястото/размерът остават в localStorage за следващото отваряне;
//   - записът на геометрията е един речник с таван 300 записа, най-старият се изхвърля;
//   - „Затвори всички" се показва в лентата от три отворени бележки и затваря всички;
//   - „Единична бележка" (чекбоксът в Настройки, по подразбиране изключен) оставя една бележка,
//     слага затъмнение под нея, а натиск върху затъмнението я затваря като хиксчето;
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
    const b = await readFile(path.join(root, rel));
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
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt)\\.js$`), r =>
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
    closeAllLabel: win.closeAllBtn ? win.closeAllBtn.textContent : null,
    closeAllDisplay: win.closeAllBtn ? getComputedStyle(win.closeAllBtn).display : null,
  }));
  const overlay = document.getElementById('single-note-overlay');
  const layer = document.getElementById('note-windows-layer');
  const geom = JSON.parse(localStorage.getItem('noteWindowGeometry') || 'null');
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
    geom: geom ? { boxes: Object.keys(geom.boxes).length, order: geom.order.length, first: geom.order[0], last: geom.order[geom.order.length - 1] } : null,
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
ok(dragged.geom.boxes === 1 && dragged.geom.order === 1 && dragged.geom.last === before.key,
  `плъзгане: записът е един речник с ключ на бележката (${JSON.stringify(dragged.geom)})`, dragged.geom);
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
const seeded = await page.evaluate(() => {
  const boxes = {}, order = [];
  for (let i = 0; i < 300; i++) { const k = 'g:K' + i; order.push(k); boxes[k] = { x: 10 + i, y: 20 + i, w: 300, h: 200 }; }
  localStorage.setItem('noteWindowGeometry', JSON.stringify({ v: 1, order, boxes }));
  return { boxes: Object.keys(boxes).length };
});
ok(seeded.boxes === 300, `таван: проверката зареди 300 записа (${seeded.boxes})`, seeded);
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
ok(capped.geom.boxes === 300 && capped.geom.order === 300,
  `таван: след 301-вия запис пак са 300 (boxes ${capped.geom.boxes}, order ${capped.geom.order})`, capped.geom);
ok(!capped.geomRaw.boxes['g:K0'] && capped.geom.first === 'g:K1' && capped.geom.last === 'g:GN301',
  `таван: изхвърлен е най-старият, новият е последен (${capped.geom.first} ... ${capped.geom.last})`, capped.geom);
ok(!!capBox && Number.isInteger(capBox.x) && Number.isInteger(capBox.y) && capBox.w > 0 && capBox.h > 0,
  `таван: новият запис е с истински числа (${JSON.stringify(capBox)})`, capBox);

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
const closeAllLabel = await page.evaluate(() => ({ i18n: _('closeAllNotes'), lang: currentLang, keyPresent: _('closeAllNotes') !== 'closeAllNotes' }));
ok(atThree.windows.every(w => w.closeAllLabel === closeAllLabel.i18n) && closeAllLabel.keyPresent,
  `„Затвори всички": надписът е от превода за езика (${JSON.stringify(atThree.windows.map(w => w.closeAllLabel))}, език ${closeAllLabel.lang})`, closeAllLabel);
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
await page.mouse.click(24, 860);
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

// ======================= 8. Никакви грешки =======================
ok(errs.length === 0, `няма pageerror/console error (${errs.slice(0, 3).join(' | ')})`);
if (fails) {
  console.log('състояние: ' + JSON.stringify(await read(), null, 1).slice(0, 2000));
}

await browser.close(); srv.close();
console.log(`\n${n - fails}/${n} проверки минават`);
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
