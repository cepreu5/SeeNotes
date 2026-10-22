// Разпъване на бележката + пълноекранен режим на приложението + / командите (порт от cx-notes в main).
// Проверява върху истинския main.js:
//   - бутонът за разпъване стои в лентата на бележката (в реда с бутоните) и разпъва на цял екран без
//     рамка (0,0 и размер точно колкото екрана), стрелката става надолу, „Ресет на позиции/размери"
//     трие и режима;
//   - свиването връща СТАРАТА кутия (толеранс 2px), а бележка, разпъната при затваряне, се отваря
//     направо разпъната след ново отваряне и записът ѝ в noteWindowGeometry носи e: true;
//   - само една бележка е разпъната в даден момент: разпъването на втора връща първата на мястото ѝ;
//   - редът „Цял екран" стои в менюто с бордове след „Нареди", с фон #455A64, и се появява в
//     плаващото меню (то клонира хедърните бутони); кликът му пуска и спира режима;
//   - пълноекранният режим се пуска също с Ctrl+клик върху плаващия бутон и с /7 или /ex, излиза се
//     с /6 или /norm; състоянието се помни в localStorage['extendedMode'];
//   - в пълноекранен режим хедърът се скрива, остават полето за търсене и етикетът с името на борда;
//   - „/?" показва списъка с команди, клик по ред изпълнява командата, а редът за /9 го НЯМА.
// Пуска се от корена на хранилището (seeNotes-main):
//   node .bolter/check/expand-and-fullscreen.mjs      (exit 1 при провалена проверка)
import { chromium } from '/opt/nvm/versions/node/v22.23.3/lib/node_modules/playwright/index.mjs';
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path';

const root = path.resolve(process.env.ROOT || 'uni');
const types = { '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
const srv = http.createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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
const ok = (cond, msg, extra) => {
  n++;
  console.log((cond ? 'ok   ' : 'FAIL ') + msg + (extra !== undefined && !cond ? ' :: ' + JSON.stringify(extra).slice(0, 500) : ''));
  if (!cond) fails++;
};

const browser = await chromium.launch({ args: ['--num-raster-threads=4'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  window.gapi = {
    load() { },
    client: {
      setToken() { }, getToken() { return { access_token: 'tok' }; },
      drive: { files: { list: () => Promise.resolve({ result: { files: [] } }), get: () => Promise.resolve({ result: {} }) } },
    },
    auth: { getToken() { return { access_token: 'tok' }; } },
  };
});
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
// msmrtt.js е гидът на демо-тура: слага речта си на z-index 10000 и покрива лентата на бележката, тоест
// поема кликовете. Проверката не е за тура, затова не се зарежда (в приложението той се пуска сам).
await page.route(new RegExp(`^http://localhost:${PORT}/(kb-assistant|msmrt|msmrtt)\\.js$`), r =>
  r.fulfill({ status: 200, contentType: 'application/javascript', body: '/* изключен в проверката */' }));

const errs = [];
page.on('pageerror', e => errs.push(String(e.message).slice(0, 300)));
page.on('console', m => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errs.push(String(m.text()).slice(0, 300)); });

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForFunction(() => typeof showModal === 'function' && typeof initApp === 'function', null, { timeout: 20000 });

// Минималното състояние, което прозорците, полето за търсене и менюто с бордове искат: без логин.
const SETUP = `(async () => {
  notesContainer = document.getElementById('notes-container');
  searchBox = document.getElementById('search-box');
  if (!boardsData.some(b => b.gdid === 'B1')) {
    boardsData.push({ id: 9001, gdid: 'B1', title: 'Работа' }, { id: 9002, gdid: 'B2', title: 'Лични' });
  }
  currentBoardFilter = 'B1';
  initNoteWindows();
  // Приложението строи хедъра и полето за търсене след логин: прави се същото, за да са живи
  // истинските слушатели (командите, пълноекранният режим, бутонът за разпъване).
  initApp();
  const strip = await createBoardsUI(boardsData, false);
  document.querySelector('header').appendChild(strip);
  updateHeaderFullscreenUI();
  return {
    windows: noteWindows.length,
    stripButtons: document.querySelectorAll('header .board-menu-container .board-filter-link').length,
    hasExpandBtn: !!document.querySelector('#modal-expand-btn, [data-mwid="modal-expand-btn"]'),
    hasLabel: !!document.getElementById('fullscreen-board-label')
  };
})()`;

const state = () => ({
  fullscreen: (() => { const h = document.querySelector('header'); return !!(h && h.classList.contains('header-fullscreen')); })(),
  extendedMode: localStorage.getItem('extendedMode'),
  bodyExpandedClass: document.body.classList.contains('modal-note-expanded'),
  stripDisplay: (() => { const b = document.querySelector('header .boards-note'); return b ? getComputedStyle(b).display : null; })(),
  searchDisplay: (() => { const w = document.getElementById('search-wrapper'); return w ? getComputedStyle(w).display : null; })(),
  searchBoxRect: (() => { const b = document.getElementById('search-box'); if (!b || !b.offsetWidth) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left), w: Math.round(r.width) }; })(),
  boardLabel: (() => {
    const l = document.getElementById('fullscreen-board-label');
    if (!l) return null;
    return { text: l.textContent, display: getComputedStyle(l).display, rect: l.offsetWidth ? Math.round(l.getBoundingClientRect().left) : null };
  })(),
  floating: (() => {
    const b = document.querySelector('.popup-menu-btn-floating');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { display: getComputedStyle(b).display, w: Math.round(r.width), h: Math.round(r.height), x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })(),
  fsIconInStrip: (() => {
    const b = document.querySelector('header .board-menu-container .board-filter-link[data-boardid="fullscreen"]');
    return b ? b.innerHTML : null;
  })(),
  geom: JSON.parse(localStorage.getItem('noteWindowGeometry') || 'null'),
});

// Прозорците, както ги вижда проверката: активният носи id-тата, затова се търси и по data-mwid.
const NOTE_STATE = `(() => {
  const open = getOpenNoteWindows();
  const win = activeNoteWindow;
  const btn = win && win.el.querySelector('#modal-expand-btn, [data-mwid="modal-expand-btn"]');
  const box = win && win.box;
  const cs = box ? getComputedStyle(box) : null;
  return {
    open: open.length,
    key: win ? win.key : null,
    expanded: !!(win && win.expanded),
    inButtonsRow: !!(btn && btn.parentElement && btn.parentElement.classList.contains('note-header-buttons')),
    isLastInRow: !!(btn && btn.parentElement && btn.parentElement.lastElementChild === btn),
    btnHtml: btn ? btn.innerHTML.trim() : null,
    btnTitle: btn ? btn.title : null,
    i18nExpandTitle: _('modalExpandTooltip'),
    i18nCollapseTitle: _('modalCollapseTooltip'),
    btnCount: win ? win.el.querySelectorAll('.modal-header-btn[data-key-title="modalExpandTooltip"]').length : 0,
    expandIdOwner: (() => {
      const b = document.getElementById('modal-expand-btn');
      if (!b) return null;
      const w = noteWindows.find(x => x.el.contains(b));
      return w ? w.key : 'orphan';
    })(),
    activeKey: activeNoteWindow ? activeNoteWindow.key : null,
    atBtn: (() => {
      const b = win && win.el.querySelector('#modal-expand-btn, [data-mwid="modal-expand-btn"]');
      if (!b) return null;
      const r = b.getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const w = el ? noteWindows.find(x => x.el.contains(el)) : null;
      return { win: w ? w.key : null, tag: el ? el.tagName + '.' + (el.className || '') : null };
    })(),
    box: box ? { left: Math.round(box.offsetLeft), top: Math.round(box.offsetTop), w: Math.round(parseFloat(cs.width)), h: Math.round(parseFloat(cs.height)) } : null,
    // Истинската кутия на екрана (border box, с padding-а) и хиксчето: parseFloat(cs.width) е само
    // съдържанието, затова при content-box кутията изглежда в екрана, а на екрана е по-голяма с padding-а.
    rect: box ? (() => { const r = box.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; })() : null,
    closeRect: (() => {
      const c = win && win.el.querySelector('.note-header-close-group .modal-close');
      if (!c || !c.offsetWidth) return null;
      const r = c.getBoundingClientRect();
      return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height };
    })(),
    vw: window.innerWidth, vh: window.innerHeight,
    handleVisible: (() => { const h = box && box.querySelector('.modal-resize-handle'); return h ? getComputedStyle(h).display !== 'none' : null; })(),
  };
})()`;

const noteState = () => page.evaluate(NOTE_STATE);
const pageState = () => page.evaluate(state);
const waitOpen = (count) => page.waitForFunction((count) => {
  const open = getOpenNoteWindows();
  if (open.length !== count) return false;
  return open.every(w => w.el.classList.contains('visible') && w.box.offsetWidth > 0
    && Math.abs(w.box.getBoundingClientRect().width / w.box.offsetWidth - 1) < 0.01);
}, count, { timeout: 8000 }).then(() => true).catch(() => false);
const openNote = async (opts, expectOpen) => {
  await page.evaluate((opts) => showModal({ raw: 'бележка', format: null, ...opts }), opts);
  if (expectOpen !== undefined) await waitOpen(expectOpen);
  return noteState();
};
const clickSel = async (sel) => {
  const r = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ inline: 'center', block: 'nearest' });
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: Math.round(b.width), inView: b.left >= 0 && b.top >= 0 && b.right <= window.innerWidth && b.bottom <= window.innerHeight };
  }, sel);
  if (!r) return false;
  if (!r.inView) return { offscreen: r };
  await page.mouse.click(r.x, r.y);
  return true;
};
// Състоянието се утаява: анимациите на модала са 0.4s, а режимът се сменя синхронно.
const settle = () => page.waitForTimeout(250);

await page.evaluate(() => { localStorage.removeItem('noteWindowGeometry'); localStorage.removeItem('extendedMode'); });
const boot = await page.evaluate(SETUP);
ok(boot.windows >= 1, `прозорците и полето за търсене са вдигнати (прозорци ${boot.windows})`, boot);
ok(boot.stripButtons > 3, `лентата с бордовете е построена (${boot.stripButtons} бутона)`, boot);
ok(boot.hasExpandBtn, 'бутонът за разпъване съществува в бележката', boot);
ok(boot.hasLabel, 'етикетът за пълноекранния хедър съществува', boot);

// ======================= 1. Разпъване и връщане =======================
const first = await openNote({ id: 'EXP1', gdid: 'GEXP1', boardId: 'B1', raw: 'разпъване на бележката' }, 1);
ok(first.inButtonsRow, 'бутонът за разпъване е в реда с бутоните на бележката', first);
ok(first.isLastInRow, 'бутонът за разпъване е последният в реда (непосредствено преди хиксчето)', first);
ok(first.btnHtml === '▲',
  `стрелката е нагоре в нормален размер (${first.btnHtml})`, first.btnHtml);
ok(first.btnTitle === first.i18nExpandTitle && first.i18nExpandTitle !== 'modalExpandTooltip',
  `името на бутона идва от езиковия файл (${first.btnTitle})`, { title: first.btnTitle, key: first.i18nExpandTitle });
ok(first.expanded === false && first.handleVisible === true, 'бележката е в нормален размер и дръжката за размер се вижда', first);
const boxBefore = first.box;

await clickSel('#modal-expand-btn');
await settle();
const expanded = await noteState();
ok(expanded.expanded === true, 'бутонът разпъва бележката', expanded);
ok(expanded.box.left === 0 && expanded.box.top === 0,
  `разпънатата бележка застава в ъгъла без отстъп (${expanded.box.left},${expanded.box.top})`, expanded.box);
ok(Math.abs(expanded.box.w - expanded.vw) <= 1 && Math.abs(expanded.box.h - expanded.vh) <= 1,
  `разпънатата бележка е точно колкото екрана (${expanded.box.w}x${expanded.box.h} при ${expanded.vw}x${expanded.vh})`, expanded.box);
ok(Math.abs(expanded.rect.w - expanded.vw) <= 1 && Math.abs(expanded.rect.h - expanded.vh) <= 1,
  `истинската кутия на екрана също е точно екрана (${expanded.rect.w}x${expanded.rect.h} при ${expanded.vw}x${expanded.vh})`, expanded.rect);
ok(!!expanded.closeRect && expanded.closeRect.r <= expanded.rect.r - 1 && expanded.closeRect.b <= expanded.rect.b - 1,
  `хиксчето стои вътре в бележката (дясно ${expanded.closeRect && expanded.closeRect.r.toFixed(1)} при ръб ${expanded.rect.r.toFixed(1)})`, { close: expanded.closeRect, box: expanded.rect });
ok(!!expanded.closeRect && expanded.closeRect.r <= expanded.vw && expanded.closeRect.b <= expanded.vh,
  `хиксчето не излиза извън екрана (дясно ${expanded.closeRect && expanded.closeRect.r.toFixed(1)} при екран ${expanded.vw})`, { close: expanded.closeRect, vw: expanded.vw, vh: expanded.vh });
ok(expanded.btnHtml === '▼', `стрелката става надолу (${expanded.btnHtml})`, expanded.btnHtml);
ok(expanded.btnTitle === expanded.i18nCollapseTitle && expanded.i18nCollapseTitle !== 'modalCollapseTooltip',
  `името при разпънат размер също идва от езиковия файл (${expanded.btnTitle})`, expanded.btnTitle);
ok(expanded.handleVisible === false, 'в разпънат размер дръжката за размер е скрита', expanded);
const expState = await pageState();
ok(expState.bodyExpandedClass === true, 'body носи класа modal-note-expanded', expState.bodyExpandedClass);
ok(!!expState.geom && !!expState.geom.boxes['g:GEXP1'] && expState.geom.boxes['g:GEXP1'].e === true,
  'записът за бележката носи e: true', expState.geom && expState.geom.boxes);

await clickSel('#modal-expand-btn');
await settle();
const collapsed = await noteState();
const back = collapsed.box;
const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;
ok(collapsed.expanded === false, 'повторното натискане свива бележката', collapsed);
ok(near(back.left, boxBefore.left) && near(back.top, boxBefore.top) && near(back.w, boxBefore.w) && near(back.h, boxBefore.h),
  `свиването връща старата кутия (${JSON.stringify(boxBefore)} -> ${JSON.stringify(back)})`, { boxBefore, back });
const collapsedState = await pageState();
ok(!!collapsedState.geom && collapsedState.geom.boxes['g:GEXP1'] && collapsedState.geom.boxes['g:GEXP1'].e === undefined,
  'след свиване записът вече не носи режим', collapsedState.geom && collapsedState.geom.boxes['g:GEXP1']);

// ======================= 2. Само една разпъната + разпъната се отваря разпъната =======================
const second = await openNote({ id: 'EXP2', gdid: 'GEXP2', boardId: 'B1', raw: 'втора бележка' }, 2);
const box2Before = second.box;
// Първата се разпъва, после втората: разпъването на втората трябва да върне първата на мястото ѝ.
const exp1Before = await page.evaluate(() => {
  const w = noteWindows.find(x => x.key === 'g:GEXP1');
  activateNoteWindow(w, true);
  return { left: Math.round(w.box.offsetLeft), top: Math.round(w.box.offsetTop), w: Math.round(parseFloat(getComputedStyle(w.box).width)) };
});
await clickSel('#modal-expand-btn');
await settle();
const exp1 = await noteState();
ok(exp1.expanded === true, 'първата бележка се разпъва', exp1);
await page.evaluate(() => { const w = noteWindows.find(x => x.key === 'g:GEXP2'); activateNoteWindow(w, true); });
const beforeSecondClick = await noteState();
const clickRes2 = await clickSel('#modal-expand-btn');
await settle();
const twoExpanded = await page.evaluate(() => {
  const read = (w) => w ? { expanded: !!w.expanded, left: Math.round(w.box.offsetLeft), top: Math.round(w.box.offsetTop), w: Math.round(parseFloat(getComputedStyle(w.box).width)) } : null;
  return { a: read(noteWindows.find(x => x.key === 'g:GEXP1')), b: read(noteWindows.find(x => x.key === 'g:GEXP2')) };
});
ok(twoExpanded.b && twoExpanded.b.expanded === true, 'разпъването на втората бележка става',
  { twoExpanded, beforeSecondClick, clickRes2 });
ok(twoExpanded.a && twoExpanded.a.expanded === false && near(twoExpanded.a.left, exp1Before.left) && near(twoExpanded.a.top, exp1Before.top) && near(twoExpanded.a.w, exp1Before.w),
  `само една бележка е разпъната: първата се сви и си върна мястото (${JSON.stringify(exp1Before)} -> ${JSON.stringify(twoExpanded.a)})`, twoExpanded);

// Затваряне на разпънатата: записът остава с режима, следващото отваряне е направо разпънато.
await page.evaluate(() => { const w = noteWindows.find(x => x.key === 'g:GEXP2'); if (w) closeNoteWindow(w); });
await settle();
const geomAfterClose = await pageState();
const rec2 = geomAfterClose.geom && geomAfterClose.geom.boxes['g:GEXP2'];
ok(!!rec2 && rec2.e === true,
  'разпъната при затваряне бележка пази режима си', { rec2, boxes: geomAfterClose.geom && geomAfterClose.geom.boxes });

const reopened = await openNote({ id: 'EXP2', gdid: 'GEXP2', boardId: 'B1', raw: 'втора бележка' }, 1);
ok(reopened.expanded === true && reopened.box.left === 0 && reopened.box.top === 0 && Math.abs(reopened.box.w - reopened.vw) <= 1,
  `следващото отваряне е направо разпънато (${JSON.stringify(reopened.box)} при ${reopened.vw}x${reopened.vh})`, reopened);
ok(reopened.btnHtml === '▼', `бутонът показва разпънато състояние (${reopened.btnHtml})`, reopened.btnHtml);
await clickSel('#modal-expand-btn');
await settle();
const backTo2 = await noteState();
ok(near(backTo2.box.left, box2Before.left) && near(backTo2.box.top, box2Before.top) && near(backTo2.box.w, box2Before.w) && near(backTo2.box.h, box2Before.h),
  `свиването връща кутията отпреди разпъването (${JSON.stringify(box2Before)} -> ${JSON.stringify(backTo2.box)})`, { box2Before, back: backTo2.box });

// ======================= 3. „Ресет на позиции/размери" трие и режима =======================
await page.evaluate(() => { const w = noteWindows.find(x => x.key === 'g:GEXP2'); if (w) closeNoteWindow(w); });
await page.evaluate(() => { const w = noteWindows.find(x => x.key === 'g:GEXP1'); if (w) closeNoteWindow(w); });
await settle();
await openNote({ id: 'EXP1', gdid: 'GEXP1', boardId: 'B1', raw: 'разпъване на бележката' }, 1);
await clickSel('#modal-expand-btn');
await settle();
const beforeReset = await noteState();
await page.evaluate(() => resetNoteWindowGeometry());
await settle();
const afterReset = await noteState();
ok(afterReset.expanded === false, '„Ресет на позиции/размери" излиза и от разпънатия режим', { before: beforeReset.expanded, after: afterReset.expanded });
const geomReset = await pageState();
ok(geomReset.geom === null || Object.keys(geomReset.geom.boxes).length === 0,
  'след ресета в noteWindowGeometry няма записи', geomReset.geom);
await page.evaluate(() => { const w = noteWindows.find(x => x.key === 'g:GEXP1'); if (w) closeNoteWindow(w); });
await settle();

// ======================= 4. Редът „Цял екран" в менюто с бордове =======================
const menu = await page.evaluate(() => {
  const strip = document.querySelector('header .board-menu-container');
  const links = Array.from(strip.querySelectorAll('.board-filter-link'));
  const ids = links.map(l => l.dataset.boardid);
  const fs = links.find(l => l.dataset.boardid === 'fullscreen');
  const reorderIdx = ids.indexOf('reorder-boards');
  const bg = fs ? getComputedStyle(fs).backgroundColor : null;
  const r = fs ? fs.getBoundingClientRect() : null;
  return {
    ids,
    fsIdx: ids.indexOf('fullscreen'),
    reorderIdx,
    hasClass: fs ? fs.classList.contains('fullscreen-toggle-btn') : false,
    bg,
    title: fs ? fs.title : null,
    aria: fs ? fs.getAttribute('aria-label') : null,
    w: r ? Math.round(r.width) : null,
    h: r ? Math.round(r.height) : null,
    visible: r ? (r.width > 0 && getComputedStyle(fs).display !== 'none') : false,
    reorderW: (() => { const el = links.find(l => l.dataset.boardid === 'reorder-boards'); return el ? Math.round(el.getBoundingClientRect().width) : null; })(),
    icon: fs ? fs.innerHTML.slice(0, 40) : null,
    i18nTitle: _('toggleFullscreenTooltip')
  };
});
ok(menu.fsIdx === menu.reorderIdx + 1,
  `„Цял екран" стои непосредствено след „Нареди" в менюто (${menu.reorderIdx} -> ${menu.fsIdx})`, menu.ids);
ok(menu.hasClass && menu.bg === 'rgb(69, 90, 100)',
  `редът е .fullscreen-toggle-btn с фон #455A64 (${menu.bg})`, menu);
ok(menu.visible && menu.w > 0 && menu.w === menu.reorderW,
  `редът се вижда и е със същата мярка като „Нареди" (${menu.w} срещу ${menu.reorderW})`, menu);
ok(!!menu.title && !!menu.aria && menu.title === menu.aria && menu.title === menu.i18nTitle && menu.i18nTitle !== 'toggleFullscreenTooltip',
  `редът има име от езиковия файл (${menu.title})`, menu);

// Клик по реда в хедъра пуска режима.
await clickSel('header .board-menu-container .board-filter-link[data-boardid="fullscreen"]');
await settle();
const fsOn = await pageState();
ok(fsOn.fullscreen === true && fsOn.extendedMode === 'true',
  'кликът по реда в менюто пуска пълноекранния режим', fsOn);
ok(fsOn.stripDisplay === 'none', 'в пълноекранен режим менюто с бордове е скрито', fsOn.stripDisplay);
ok(fsOn.searchDisplay !== 'none' && !!fsOn.searchBoxRect, 'полето за търсене остава', fsOn);
ok(!!fsOn.boardLabel && fsOn.boardLabel.display !== 'none' && !!fsOn.boardLabel.text,
  `името на борда се показва вляво (${fsOn.boardLabel && fsOn.boardLabel.text})`, fsOn.boardLabel);
ok(!!fsOn.floating && fsOn.floating.display !== 'none' && fsOn.floating.w > 0,
  'плаващият бутон за бордове остава достъпен и в пълноекранен режим (иначе няма изход от режима)', fsOn.floating);
ok((fsOn.fsIconInStrip || '').includes('M4 14h6v6'),
  'иконата на реда става „свий" в пълноекранен режим', (fsOn.fsIconInStrip || '').slice(-120));

// Обратно, от същия ред: хедърът се показва.
await page.evaluate(() => {
  const strip = document.querySelector('header .board-menu-container');
  strip.querySelector('.board-filter-link[data-boardid="fullscreen"]').click();
});
await settle();
const fsOff = await pageState();
ok(fsOff.fullscreen === false && fsOff.extendedMode === 'false', 'същият ред връща хедъра', fsOff);
ok(fsOff.stripDisplay !== 'none', 'менюто с бордове се вижда отново', fsOff.stripDisplay);

// ======================= 5. Плаващото меню (клонинг) =======================
await page.evaluate(() => { document.querySelector('.popup-menu-btn-floating').click(); });
const modalUp = await page.waitForFunction(() => {
  const m = document.getElementById('boards-menu-modal');
  if (!m || !m.classList.contains('visible')) return false;
  const box = m.querySelector('.modal-content-box');
  if (!box || !box.offsetWidth) return false;
  // Менюто изскача със scale 0.7 -> 1: мери се, след като улегне, иначе кликът пада на съседен ред.
  return Math.abs(box.getBoundingClientRect().width / box.offsetWidth - 1) < 0.002;
}, null, { timeout: 4000 }).then(() => true).catch(() => false);
ok(modalUp, 'плаващото меню се отваря от плаващия бутон');
const clone = await page.evaluate(() => {
  const m = document.getElementById('boards-menu-modal');
  const els = Array.from(m.querySelectorAll('.board-filter-link'));
  const fs = els.find(l => l.dataset.boardid === 'fullscreen');
  const r = fs ? fs.getBoundingClientRect() : null;
  return {
    count: els.length,
    hasFullscreen: !!fs,
    icon: fs ? fs.innerHTML.slice(0, 40) : null,
    rect: r ? { x: r.left + r.width / 2, y: r.top + r.height / 2, w: Math.round(r.width) } : null,
    ids: els.map(l => l.dataset.boardid)
  };
});
ok(clone.hasFullscreen, 'редът „Цял екран" е и в плаващото меню (клонинг на хедърния)', clone.ids);
ok(!!clone.rect && clone.rect.w > 0, 'клонингът е с мярка и се вижда', clone.rect);
const clonePoint = await page.evaluate(() => {
  const m = document.getElementById('boards-menu-modal');
  const fs = m.querySelector('.board-filter-link[data-boardid="fullscreen"]');
  const r = fs.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const el = document.elementFromPoint(x, y);
  return { x, y, hit: el ? el.closest('.board-filter-link') ? el.closest('.board-filter-link').dataset.boardid : el.tagName : null };
});
await page.mouse.click(clonePoint.x, clonePoint.y);
await settle();
const afterClone = await pageState();
ok(clonePoint.hit === 'fullscreen', 'под точката на клика е редът „Цял екран"', clonePoint);
ok(afterClone.fullscreen === true, 'кликът по реда в плаващото меню пуска режима', afterClone);
const modalClosed = await page.evaluate(() => !document.getElementById('boards-menu-modal').classList.contains('visible'));
ok(modalClosed, 'менюто се затваря при клик по „Цял екран"');

// ======================= 6. Ctrl+клик и задържане върху плаващия бутон =======================
await page.evaluate(() => { if (isHeaderFullscreen()) toggleHeaderFullscreen(); });
await settle();
const floatBtn = await pageState();
const ctrlClickFloat = async () => {
  const pt = await page.evaluate(() => {
    const b = document.querySelector('.popup-menu-btn-floating');
    const r = b.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const el = document.elementFromPoint(x, y);
    return { x, y, onBtn: !!(el && (el === b || b.contains(el))) };
  });
  await page.keyboard.down('Control');
  await page.mouse.click(pt.x, pt.y);
  await page.keyboard.up('Control');
  return pt;
};
const pt1 = await ctrlClickFloat();
await settle();
const afterCtrl = await pageState();
ok(pt1.onBtn, 'плаващият бутон не е покрит (иначе кликът не стига до него)', pt1);
ok(afterCtrl.fullscreen === true, 'Ctrl+клик върху плаващия бутон пуска режима', afterCtrl);
await ctrlClickFloat();
await settle();
const afterCtrl2 = await pageState();
ok(afterCtrl2.fullscreen === false, 'Ctrl+клик върху плаващия бутон излиза от пълноекранен режим', afterCtrl2);
// Задържане (touch): истински touchstart - touchend върху бутона.
const hold = (type) => page.evaluate((type) => {
  const b = document.querySelector('.popup-menu-btn-floating');
  const r = b.getBoundingClientRect();
  const t = new Touch({ identifier: 1, target: b, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
  b.dispatchEvent(new TouchEvent(type, {
    bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [t],
    targetTouches: type === 'touchend' ? [] : [t], changedTouches: [t]
  }));
}, type);
await hold('touchstart');
await page.waitForTimeout(700);
await hold('touchend');
const afterHold = await pageState();
ok(afterHold.fullscreen === true, 'задържането върху плаващия бутон пуска пълноекранния режим', afterHold);
await page.evaluate(() => { if (isHeaderFullscreen()) toggleHeaderFullscreen(); });
await settle();

// ======================= 7. Командите =======================
const typeCommand = async (cmd) => {
  await page.evaluate((cmd) => {
    const box = document.getElementById('search-box');
    box.focus();
    box.value = cmd;
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }, cmd);
  await page.keyboard.press('Enter');
  await settle();
};
for (const cmd of ['/7', '/ex']) {
  await typeCommand(cmd);
  const st = await pageState();
  ok(st.fullscreen === true, `${cmd} пуска пълноекранния режим`, st);
  const cleared = await page.evaluate(() => document.getElementById('search-box').value);
  ok(cleared === '', `след ${cmd} полето се изчиства`, cleared);
}
for (const cmd of ['/6', '/norm']) {
  await typeCommand(cmd);
  const st = await pageState();
  ok(st.fullscreen === false, `${cmd} излиза от пълноекранния режим`, st);
}

// /? показва списъка с команди
const help = await page.evaluate(() => {
  const box = document.getElementById('search-box');
  box.focus();
  box.value = '/?';
  box.dispatchEvent(new Event('input', { bubbles: true }));
  const popup = document.getElementById('saved-searches-popup');
  const rows = Array.from(popup.querySelectorAll('.saved-search-item')).map(r => r.textContent.trim());
  const list = _('searchCommandsList');
  return {
    display: getComputedStyle(popup).display,
    rows,
    first: rows[0] || '',
    i18nTitle: _('searchCommandsTitle'),
    i18nRows: Array.isArray(list) ? list.map(i => i.text) : null
  };
});
ok(help.display !== 'none' && help.rows.length >= 9,
  `„/?" показва списъка с команди (${help.rows.length} реда)`, help.rows);
ok(help.rows.some(r => r.startsWith('/7') && r.includes('/ex')), 'списъкът съдържа /7 /ex', help.rows);
ok(help.rows.some(r => r.startsWith('/6') && r.includes('/norm')), 'списъкът съдържа /6 /norm', help.rows);
ok(!help.rows.some(r => /\/9|\/lex/.test(r)), 'в списъка НЯМА ред за /9 (лексикалното търсене не е в main)', help.rows);
ok(help.rows[0] === help.i18nTitle && help.i18nTitle !== 'searchCommandsTitle',
  `заглавието идва от езиковия файл (${help.first})`, { got: help.first, key: help.i18nTitle });
ok(Array.isArray(help.i18nRows) && JSON.stringify(help.rows.slice(1)) === JSON.stringify(help.i18nRows),
  'редовете са точно списъкът от езиковия файл (без /9)', { got: help.rows.slice(1, 3), want: (help.i18nRows || []).slice(0, 3), n: help.rows.length });

// Клик по ред изпълнява командата (редът за /7).
const clicked = await page.evaluate(() => {
  const popup = document.getElementById('saved-searches-popup');
  const row = Array.from(popup.querySelectorAll('.saved-search-item')).find(r => r.textContent.trim().startsWith('/7'));
  if (!row) return false;
  const b = row.getBoundingClientRect();
  window.__rowPoint = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  return true;
});
ok(clicked, 'редът за /7 е налице за клик');
if (clicked) {
  const pt = await page.evaluate(() => window.__rowPoint);
  await page.mouse.click(pt.x, pt.y);
  await settle();
  const st = await pageState();
  ok(st.fullscreen === true, 'клик по ред изпълнява командата', st);
  await typeCommand('/norm');
}

// ======================= 8. Записът се възстановява при следващо отваряне =======================
await page.evaluate(() => localStorage.setItem('extendedMode', 'true'));
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => typeof initApp === 'function', null, { timeout: 20000 });
await page.evaluate(SETUP);
const afterReload = await pageState();
ok(afterReload.fullscreen === true, 'състоянието от localStorage се възстановява след презареждане', afterReload);
const relabel = await page.evaluate(() => {
  const l = document.getElementById('fullscreen-board-label');
  return l ? { text: l.textContent, display: getComputedStyle(l).display } : null;
});
ok(!!relabel && relabel.display !== 'none' && !!relabel.text,
  `етикетът с борда се възстановява заедно с режима (${relabel && relabel.text})`, relabel);
await page.evaluate(() => toggleHeaderFullscreen());

ok(errs.length === 0, 'нула грешки в конзолата', errs.slice(0, 6));

await browser.close();
srv.close();
console.log(`\n${n - fails}/${n} проверки минаха`);
process.exit(fails ? 1 : 0);
